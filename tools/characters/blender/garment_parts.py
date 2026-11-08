"""Catalog garment shapes for the body-shell finish: cuts, procedural skirts, soles (build_garment.py).

The body-shell finish lifts the body's own skin; this module decides WHICH skin a garment design covers, from editable
cut parameters, so one base design (an OpenSew-2 preset, or none) gives many catalog garments:

  "cut": {
    "part": "top" | "bottom" | "full" | "shoes",
    "neck": {"kind": "crew" | "scoop" | "v" | "square" | "mock" | "turtle" | "off", "depth": m},   tops / full
    "sleeve": f,            shoulder (0) .. wrist (1) along the arm bones; < 0 cuts into the shoulder (tank, strap)
    "hem":   {"at": landmark, "offset": m},   bottom edge on the torso (tops / full / dresses above a skirt)
    "waist": {"at": landmark, "offset": m},   top edge (bottoms)
    "leg": f,               hip joint (0) .. ankle (1) along the leg bones (bottoms / full)
    "open_front": m,        width of a front opening (jackets, cardigans)
    "boot": m,              shoes: height above the floor the shoe reaches
    "straps": m,            shoes: sandal straps of this pitch (0 = closed shoe)
    "force": true           cover everything the cut allows, even where the sewn design does not reach
  }
landmarks: neck, shoulder, chest, waist, hip, crotch, knee (OpenSew measurement) and ankle (foot joint).

  "skirt": {"top": {"at": landmark, "offset": m}, "length": m, "flare": f, "offset": m, "segments": 40}
A skirt is a tube from the hips down, its cross-section the convex hull of the body at each height (so both legs stay
inside), widened by `flare` towards the hem and never narrowing (except `pencil`). Weights blend the pelvis and each
thigh by side and depth, so it swings with the legs. Garments also get a sole/trim region: faces under
`sole` metres go to the second color region.
"""
import math
from mathutils import Vector


class Landmarks:
    def __init__(self, body, arm, measured):
        aw = arm.matrix_world
        b = lambda n: aw @ arm.data.bones[n].head_local
        self.z = dict(measured)
        self.z["ankle"] = b("foot_l").z
        self.spine_y = b("spine_02").y
        self.cx = b("pelvis").x
        self.arm = {s: [b("upperarm_" + s), b("lowerarm_" + s), b("hand_" + s)] for s in "lr"}
        self.leg = {s: [b("thigh_" + s), b("calf_" + s), b("foot_" + s)] for s in "lr"}
        self.shoulder_x = abs(b("upperarm_l").x - self.cx)
        self.foot = {s: (b("foot_" + s), aw @ arm.data.bones["ball_" + s].tail_local) for s in "lr"}

    def at(self, spec, default):
        if spec is None:
            return default
        if isinstance(spec, (int, float)):
            return float(spec)
        return self.z[spec.get("at", "waist")] + spec.get("offset", 0.0)


def chain_t(p, pts, max_dist, s_min):
    """Parameter of p along a joint chain (0 at the first joint, 1 at the last), or None when p is not near it."""
    lens = [(pts[i + 1] - pts[i]).length for i in range(len(pts) - 1)]
    total = sum(lens)
    best = None
    acc = 0.0
    for i, L in enumerate(lens):
        a, d = pts[i], (pts[i + 1] - pts[i]).normalized()
        s = (p - a).dot(d)
        sc = min(max(s, s_min * L if i == 0 else 0.0), L if i == len(lens) - 1 else L)
        dist = (p - (a + d * sc)).length
        if best is None or dist < best[0]:
            best = (dist, (acc + sc) / total)
        acc += L
    return best[1] if best[0] <= max_dist else None


def allowed_set(body, regions, L, cut, bonus=None):
    """Body vertex indices the cut allows (world positions); `regions[vi]` is the vertex's body region.
    `bonus` (a dict) receives extra height per vertex: `leg_flare` (wide/flared legs, growing below the knee) and
    `sleeve_flare` (wide sleeves, growing towards the wrist)."""
    mw = body.matrix_world
    part = cut.get("part", "top")
    neck = cut.get("neck", {"kind": "crew"})
    sleeve = cut.get("sleeve", None)
    leg = cut.get("leg", None)
    hem = L.at(cut.get("hem"), L.z["hip"])
    waist = L.at(cut.get("waist"), L.z["waist"])
    open_w = cut.get("open_front", 0.0)
    boot = cut.get("boot", 0.11)
    straps = cut.get("straps", 0.0)
    vamp = cut.get("vamp", False)
    bib = cut.get("bib", False)
    leg_flare = cut.get("leg_flare", 0.0)
    sleeve_flare = cut.get("sleeve_flare", 0.0)
    nz, sz = L.z["neck"], L.z["shoulder"]
    out = set()
    for v in body.data.vertices:
        p = mw @ v.co
        reg = regions.get(v.index)
        if reg is None:
            continue
        side = "l" if p.x > L.cx else "r"
        if part == "shoes":
            heel, toe = L.foot[side]
            toe_t = (heel.y - p.y) / max(1e-4, heel.y - toe.y)          # 0 heel .. 1 toe (the character faces -Y)
            if reg in ("foot_l", "foot_r") and p.z > boot and not (vamp and toe_t > 0.5 and p.z < 0.1):
                continue
            if reg in ("foot_l", "foot_r") or (reg in ("calf_l", "calf_r") and p.z <= boot):
                if straps and p.z > 0.025 and reg.startswith("foot") and (p.y / straps) % 1.0 > 0.45:
                    continue
                out.add(v.index)
            continue
        if reg in ("head", "hand_l", "hand_r", "foot_l", "foot_r"):
            continue
        arm_t = None
        if abs(p.x - L.cx) > L.shoulder_x * 0.55 and p.z > L.z["chest"] - 0.12:
            arm_t = chain_t(p, L.arm[side], 0.12, -0.6)
        leg_t = None
        if p.z < L.z["hip"] + 0.04:
            leg_t = chain_t(p, L.leg[side], 0.22, -0.3)
        on_arm = reg in ("upperarm_l", "upperarm_r", "forearm_l", "forearm_r") or (arm_t is not None and arm_t > 0.0)
        on_leg = reg in ("thigh_l", "thigh_r", "calf_l", "calf_r") or (leg_t is not None and leg_t > 0.05 and p.z < L.z["crotch"])
        ang = math.atan2(p.x - L.cx, -(p.y - L.spine_y))      # 0 = front centre
        wf = (math.cos(ang) + 1) / 2                          # 1 front .. 0 back
        if part in ("top", "full"):
            # neckline
            k = neck.get("kind", "crew"); dpt = neck.get("depth", None)
            if k == "crew":
                top = nz + 0.03 - (dpt if dpt is not None else 0.045) * wf ** 2
            elif k == "scoop":
                top = nz + 0.01 - (dpt if dpt is not None else 0.1) * wf ** 2
            elif k == "v":
                top = nz + 0.025 - 0.03 * wf - (dpt if dpt is not None else 0.13) * max(0.0, 1 - abs(ang) / 0.85)
            elif k == "square":
                top = nz + 0.02 - ((dpt if dpt is not None else 0.09) if abs(ang) < 1.0 else 0.0)
            elif k == "mock":
                top = nz + 0.035
            elif k == "turtle":
                top = nz + 0.075
            elif k == "off":
                top = sz - (dpt if dpt is not None else 0.05)
            else:
                top = nz
            if k == "off" or not on_arm:
                if p.z > top:
                    continue
            if reg == "neck" and k not in ("mock", "turtle") and p.z > nz - 0.005:
                continue
            if on_arm:
                if sleeve is None or arm_t is None or arm_t > sleeve:
                    continue
            elif arm_t is not None and sleeve is not None and sleeve < 0 and arm_t > sleeve:
                continue                                    # tank: the shoulder cap goes too
            if on_leg:
                if part == "top" or leg is None or leg_t is None or leg_t > leg:
                    continue
            elif part == "top" and p.z < hem:
                continue
            if bib and not on_arm and not on_leg and p.z > waist:
                strap = abs(abs(p.x - L.cx) - 0.075) < 0.02
                if not ((wf > 0.62 and p.z < L.z["chest"] + 0.03) or strap):
                    continue
            if bonus is not None:
                if leg_flare and on_leg and leg_t is not None and leg_t > 0.45:
                    bonus[v.index] = leg_flare * ((leg_t - 0.45) / 0.55) ** 2
                if sleeve_flare and on_arm and arm_t is not None and arm_t > 0.4:
                    bonus[v.index] = sleeve_flare * ((arm_t - 0.4) / 0.6) ** 2
            if open_w and abs(p.x - L.cx) < open_w / 2 and p.y < L.spine_y and not on_arm:
                continue
            out.add(v.index)
        elif part == "bottom":
            if on_arm or reg == "neck" or reg == "chest":
                continue
            if on_leg:
                if leg is None or leg_t is None or leg_t > leg:
                    continue
            elif p.z > waist:
                continue
            if bonus is not None and leg_flare and on_leg and leg_t is not None and leg_t > 0.45:
                bonus[v.index] = leg_flare * ((leg_t - 0.45) / 0.55) ** 2
            out.add(v.index)
    return out


def sole_faces(ob, height, welt=0.0, axes=None):
    """Faces whose vertices all lie under `height` (world) -> second material (soles, trims). With `welt`, those
    vertices are also pushed out horizontally from the foot's axis (`axes`: per side (heel, toe) points), so the sole
    stands out as a rim."""
    mw = ob.matrix_world; mwi = mw.inverted()
    if welt and axes:
        for v in ob.data.vertices:
            p = mw @ v.co
            if p.z >= height:
                continue
            a, b = axes["l" if p.x > 0 else "r"]
            d = (b - a); d.z = 0; L2 = d.length_squared or 1.0
            t = max(0.0, min(1.0, ((p - a).to_2d().dot(d.to_2d())) / L2))
            c = a + d * t
            o = Vector((p.x - c.x, p.y - c.y, 0.0))
            if o.length > 1e-5:
                o.normalize()
                f = 1.0 - p.z / height
                v.co = mwi @ (p + o * welt * (0.4 + 0.6 * f))
        ob.data.update()
    n = 0
    for poly in ob.data.polygons:
        if all((mw @ ob.data.vertices[i].co).z < height for i in poly.vertices):
            poly.material_index = 1
            n += 1
    return n


def add_skirt(ob, body, arm, L, spec, deform_names):
    """Appends a skirt tube to `ob` (bind pose, world = object space of ob assumed identity-aligned)."""
    import bmesh
    mw = body.matrix_world; owi = ob.matrix_world.inverted()
    top = L.at(spec.get("top"), L.z["hip"])
    length = spec.get("length", 0.45)
    flare = spec.get("flare", 0.35)
    off = spec.get("offset", 0.02)
    nseg = int(spec.get("segments", 40))
    ring_h = spec.get("ring", 0.025)
    pencil = spec.get("pencil", False)
    open_ang = spec.get("open_front", 0.0)          # radians around the front centre left open (coats)
    nr = max(2, int(round(length / ring_h)) + 1)
    pts = [mw @ v.co for v in body.data.vertices]
    cx, cy = L.cx, L.spine_y
    dirs = [Vector((math.sin(2 * math.pi * i / nseg), -math.cos(2 * math.pi * i / nseg), 0.0)) for i in range(nseg)]
    rings, prev = [], None
    for r in range(nr):
        t = r / (nr - 1)
        z = top - length * t
        slab = [p for p in pts if abs(p.z - z) < 0.025]
        sup = []
        for d in dirs:
            m = max(((p.x - cx) * d.x + (p.y - cy) * d.y for p in slab), default=0.08)
            sup.append(m)
        # a smooth oval around the body's hull at this height (the hull of two legs is a rounded box)
        rx = max(sup[i] for i in range(nseg) if abs(dirs[i].x) > 0.7)
        ry = max(sup[i] for i in range(nseg) if abs(dirs[i].y) > 0.7)
        ell = [1.0 / math.sqrt((d.x / rx) ** 2 + (d.y / ry) ** 2) for d in dirs]
        k_ = max(s_ / e_ for s_, e_ in zip(sup, ell))
        o_t = 0.004 + (off - 0.004) * min(1.0, t * 3)
        rr = [e_ * k_ + o_t + flare * length * t * t for e_ in ell]
        if prev is not None and not pencil:
            rr = [max(a, b) for a, b in zip(rr, prev)]
        prev = rr
        rings.append([Vector((cx + d.x * x, cy + d.y * x, z)) for d, x in zip(dirs, rr)])
    bm = bmesh.new(); bm.from_mesh(ob.data)
    deform = bm.verts.layers.deform.verify()
    uv = bm.loops.layers.uv.verify()
    gi = {n: i for i, n in enumerate(deform_names)}
    vrings = []
    for r, ring in enumerate(rings):
        t = r / (nr - 1)
        vr = []
        for i, p in enumerate(ring):
            v = bm.verts.new(owi @ p)
            sx = (p.x - cx)
            depth = min(1.0, (top - p.z) / max(0.05, top - L.z["knee"]))      # 0 at the top .. 1 at knee height
            # mostly the pelvis: a skirt hangs from the hips; the thighs only swing its lower part a little, blended
            # across the whole width, so a stride shears the skirt instead of splitting it front and back
            a = 0.1 + 0.6 * depth
            side_l = max(0.0, min(1.0, 0.5 + sx / 0.35))
            ws = {"pelvis": 1 - a, "thigh_l": a * side_l, "thigh_r": a * (1 - side_l)}
            if p.z < L.z["knee"]:
                kk = min(0.5, (L.z["knee"] - p.z) / 0.4)
                ws["calf_l"] = ws["thigh_l"] * kk; ws["thigh_l"] *= 1 - kk
                ws["calf_r"] = ws["thigh_r"] * kk; ws["thigh_r"] *= 1 - kk
            for nme, w in ws.items():
                if w > 1e-4 and nme in gi:
                    v[deform][gi[nme]] = w
            vr.append(v)
        vrings.append(vr)
    faces = []
    for r in range(nr - 1):
        for i in range(nseg):
            amid = 2 * math.pi * (i + 0.5) / nseg
            if open_ang and min(amid, 2 * math.pi - amid) < open_ang / 2:
                continue
            q = (vrings[r][i], vrings[r][(i + 1) % nseg], vrings[r + 1][(i + 1) % nseg], vrings[r + 1][i])
            f = bm.faces.new(q); faces.append(f)
            for li, lp in enumerate(f.loops):
                ii = i + (1 if li in (1, 2) else 0); rr_ = r + (1 if li in (2, 3) else 0)
                lp[uv].uv = (ii / nseg, 1 - rr_ / (nr - 1))
    for f in faces:
        f.material_index = 0
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    bm.to_mesh(ob.data); bm.free()
    ob.data.update()
    return {"skirt_rings": nr, "skirt_tris": len(faces) * 2, "skirt_top": round(top, 3)}
