"""Face and body morph targets (shape keys) for a prepared Quaternius body (Stage D).

Used by prepare_body.py with `--morphs authoring/characters/bodies/<id>/morphs.json`. The Universal Base Characters
ship no shape keys, so a small set is authored here from landmarks found on the mesh itself (Z up, the character
faces -Y, rest pose):

- nose tip: the most forward head vertex on the centre line above the skull base;
- menton: the lowest centre-line point of the face's front; chin: the most forward point in the 2 cm above it;
- mouth: on the centre-line profile, `mouth_at` of the way from the nose tip down to the menton.

Each morph is one shape key whose full displacement is the key at value 1; the game drives it in its declared range
(negative values narrow, positive widen). Displacements fall off smoothly ((1 - (d/R)^2)^2), so the topology and
the seams between body regions stay intact. "Weight" moves skin along its normal by a per-region amount blended by
the skin weights; garments built with the body-shell finish copy every key (build_garment.body_shell), so they
follow it exactly.

morphs.json: {"morphs": [{"id": "nose_width", "label": "Nose width", "group": "face", "range": [-1, 1], ...params}]}
kinds: nose_width, mouth_width, jaw_width, chin_length, weight.
"""
import bpy, math
from mathutils import Vector


def _falloff(d, r):
    if d >= r:
        return 0.0
    t = d / r
    return (1 - t * t) ** 2


def landmarks(body, arm):
    mw = body.matrix_world
    head_vg = body.vertex_groups.get("Head")
    H0 = arm.matrix_world @ arm.data.bones["Head"].head_local
    pts = []
    for v in body.data.vertices:
        w = 0.0
        for g in v.groups:
            if head_vg and g.group == head_vg.index:
                w = g.weight
        p = mw @ v.co
        if w > 0.5 and abs(p.x - H0.x) < 0.006:
            pts.append(p)
    above = [p for p in pts if p.z > H0.z]
    nose = min(above, key=lambda p: p.y)
    # menton: the lowest centre-line point of the face's front (not the jaw's underside towards the neck);
    # chin (pogonion): the most forward profile point in the 2 cm above it (the lower lip lies higher)
    front = [p for p in pts if p.y < nose.y + 0.045 and p.z < nose.z]
    menton = min(front, key=lambda p: p.z)
    chin = min((p for p in front if p.z < menton.z + 0.02), key=lambda p: p.y)
    return {"H0": H0, "nose": nose, "chin": chin, "menton": menton, "profile": pts}


def _profile_at(pts, z, tol=0.004):
    near = [p for p in pts if abs(p.z - z) < tol]
    return min(near, key=lambda p: p.y) if near else None


def add_morphs(body, arm, spec):
    """Adds one shape key per spec entry; returns a report with landmarks and the largest displacement per key."""
    if not body.data.shape_keys:
        body.shape_key_add(name="Basis", from_mix=False)
    L = landmarks(body, arm)
    nose, chin, H0 = L["nose"], L["chin"], L["H0"]
    mouth_z = nose.z - spec.get("mouth_at", 0.35) * (nose.z - L["menton"].z)
    mouth = _profile_at(L["profile"], mouth_z) or Vector((H0.x, nose.y + 0.01, mouth_z))
    mw = body.matrix_world; mwi3 = mw.inverted().to_3x3()
    world = [mw @ v.co for v in body.data.vertices]
    normals = [(mw.to_3x3() @ v.normal).normalized() for v in body.data.vertices]
    rep = {"landmarks": {k: [round(c, 4) for c in v] for k, v in (("nose", nose), ("chin", chin), ("menton", L["menton"]), ("mouth", mouth), ("skull_base", H0))}, "keys": {}}
    names = {vg.index: vg.name for vg in body.vertex_groups}
    for m in spec["morphs"]:
        kind = m.get("kind", m["id"])
        deltas = [Vector((0, 0, 0)) for _ in world]
        if kind == "nose_width":
            c = Vector((H0.x, nose.y + m.get("depth", 0.012), nose.z - 0.004)); R = m.get("radius", 0.028); s = m.get("amount", 0.28)
            for i, p in enumerate(world):
                f = _falloff((p - c).length, R)
                if f:
                    deltas[i].x = (p.x - H0.x) * s * f
        elif kind == "mouth_width":
            c = Vector((H0.x, mouth.y + 0.006, mouth.z)); R = m.get("radius", 0.03); s = m.get("amount", 0.25)
            for i, p in enumerate(world):
                d = Vector(((p.x - c.x) * 0.8, p.y - c.y, (p.z - c.z) * 1.6)).length
                f = _falloff(d, R)
                if f:
                    deltas[i].x = (p.x - H0.x) * s * f
        elif kind == "jaw_width":
            zc = (chin.z + mouth.z) / 2 - 0.004; hz = m.get("band", 0.035); amt = m.get("amount", 0.012)
            y0, y1 = chin.y, H0.y + 0.03                      # from the chin back to just behind the ear
            for i, p in enumerate(world):
                fz = _falloff(abs(p.z - zc), hz)
                ax = abs(p.x - H0.x)
                fx = min(1.0, max(0.0, (ax - 0.008) / 0.035))
                fy = 1.0 if y0 <= p.y <= y1 else _falloff(min(abs(p.y - y0), abs(p.y - y1)), 0.02)
                f = fz * fx * fy
                if f and p.z > H0.z - 0.08:
                    deltas[i].x = math.copysign(amt * f, p.x - H0.x)
        elif kind == "chin_length":
            c = chin; R = m.get("radius", 0.03); dv = Vector(m.get("move", (0.0, -0.004, -0.012)))
            for i, p in enumerate(world):
                f = _falloff((p - c).length, R)
                if f:
                    deltas[i] = dv * f
        elif kind == "weight":
            amt = m.get("regions", {})
            import common as C
            per = []
            for v in body.data.vertices:
                tot = a = 0.0
                for g in v.groups:
                    n = names.get(g.group)
                    if n is None:
                        continue
                    a += g.weight * amt.get(C.region_of_bone(n), 0.0); tot += g.weight
                per.append(a / tot if tot else 0.0)
            adj = [[] for _ in per]
            for e in body.data.edges:
                x, y = e.vertices; adj[x].append(y); adj[y].append(x)
            for _ in range(m.get("smooth", 4)):
                per = [0.5 * per[i] + 0.5 * (sum(per[j] for j in adj[i]) / len(adj[i])) if adj[i] else per[i] for i in range(len(per))]
            for i, n in enumerate(normals):
                deltas[i] = n * per[i]
        else:
            raise SystemExit("unknown morph kind %s" % kind)
        key = body.shape_key_add(name=m.get("target", m["id"]), from_mix=False)
        mx = 0.0
        for i, d in enumerate(deltas):
            if d.length_squared:
                key.data[i].co = body.data.vertices[i].co + mwi3 @ d
                mx = max(mx, d.length)
        key.slider_min = min(-1.0, m.get("range", [0, 1])[0]); key.slider_max = max(1.0, m.get("range", [0, 1])[1])
        rep["keys"][m["id"]] = round(mx, 4)
    return rep
