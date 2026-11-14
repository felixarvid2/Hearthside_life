"""A HairDeck hairstyle (hair cards on a head proxy) fitted to one of our bodies and exported as a modular hair GLB.

  blender -b --factory-startup authoring/characters/bodies/<body>/fitting.blend --python tools/characters/blender/hairdeck_to_hair.py -- \
      --cards <cards_seedN.json> --id <hair id> --body <body id> --repo . [--cards <cards_seedN.json>] [--ring-every 2.6] [--clear 0.004] [--no-cap] [--keep-fringe] [--fringe-at 0.022] [--hat-line 0.035] [--no-hat-key] [--out <file.glb>]

HairDeck (github.com/hyz317/HairDeck, Apache-2.0) turns one picture of a character into stylized hair cards and writes them
as data (cards_seedN.json: per card a sequence of control points with width, thickness and width direction), always on
the same canonical head (kept as tools/characters/hairdeck/head_proxy.json). HairDeck's own mesh has ten triangles per control
point and inner faces at every ring, which no decimation takes; the cards are meshed again here with fewer rings. Here:

- fringe: a lock that comes down over the face is cut at the brow line (our eyes sit higher than an anime head's);
- fit: the proxy's cranium (its upper part) is scaled and moved onto ours (width, depth, crown), so the hair sits on our head;
- clearance: a ring of a lock that ends up inside the head or body, or too close, is lifted out whole;
- cap: the scalp under and between the cards (skin within reach of the hair, holes closed, never the face or the ears) is
  added in the hair colour a few millimetres above the skin, so no bare scalp shows through a parting;
- a shape key `hat` lays the hair above the hat line down on the scalp (GarmentDef.flattensHair turns it on);
- every lock gets a tone of its own and darker roots in the vertex colour (the person's hair colour multiplies it);
- the cards are weighted to the head (below the skull base blending to the neck and
  the upper spine, as build_hair.py does) and exported with the armature. Then apply_stage_morph.py gives it the stage keys.

Writes public/assets/characters/modular/hair/<id>__<body>.glb and authoring/characters/hair/<id>/hairdeck_<body>.json.
"""
import bpy, bmesh, json, os, sys
import numpy as np
from mathutils import Vector, kdtree
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

a = C.args()
repo = os.path.abspath(a.get("repo", ".")); hid = a["id"]; body_id = a["body"]
CLEAR = float(a.get("clear", 0.004)); CAP = not a.get("no-cap")

body = bpy.data.objects["Body"]
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
if body.data.shape_keys:
    for kb in body.data.shape_keys.key_blocks:
        kb.value = 0.0
H0 = arm.matrix_world @ arm.data.bones["Head"].head_local
neck_z = (arm.matrix_world @ arm.data.bones["neck_01"].head_local).z

# ---- our head: skin faces carried by the head or neck
mats = [s.material.name if s.material else "" for s in body.material_slots]
dom = C.dominant_bone_per_face(body)
me = body.data
co = np.array([body.matrix_world @ v.co for v in me.vertices])
eye_v = sorted({vi for p in me.polygons if mats[p.material_index] == "M_Eyes" for vi in p.vertices})
eye_z = float(co[eye_v, 2].mean()); eye_y = float(co[eye_v, 1].mean())
head_faces = [p.index for p in me.polygons if dom[p.index] == "Head" and mats[p.material_index] == "M_Skin"]
head_v = sorted({vi for fi in head_faces for vi in me.polygons[fi].vertices})
hv = co[head_v]
crown = float(hv[:, 2].max())
band = hv[hv[:, 2] > eye_z + 0.035]                      # the cranium above the ears
ours = dict(cx=float((band[:, 0].min() + band[:, 0].max()) / 2), w=float(band[:, 0].max() - band[:, 0].min()),
            y0=float(band[:, 1].min()), y1=float(band[:, 1].max()), top=crown)

# ---- HairDeck's head: the one canonical head every hairstyle is made on (tools/characters/hairdeck/head_proxy.json)
with open(a.get("proxy") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "hairdeck", "head_proxy.json")) as f:
    pv = np.array(json.load(f)["vertices"], dtype=np.float64)
ph = pv[:, 2].max() - pv[:, 2].min()
# the same part of the proxy: from the crown down as far as our band reaches, in head heights
frac = (crown - (eye_z + 0.035)) / (crown - float(hv[:, 2].min()))
pband = pv[pv[:, 2] > pv[:, 2].max() - frac * ph]
theirs = dict(cx=float((pband[:, 0].min() + pband[:, 0].max()) / 2), w=float(pband[:, 0].max() - pband[:, 0].min()),
              y0=float(pband[:, 1].min()), y1=float(pband[:, 1].max()), top=float(pv[:, 2].max()))
sx = ours["w"] / theirs["w"]; sy = (ours["y1"] - ours["y0"]) / (theirs["y1"] - theirs["y0"]); sz = (sx + sy) / 2
scale = np.array([sx, sy, sz])
origin_t = np.array([theirs["cx"], (theirs["y0"] + theirs["y1"]) / 2, theirs["top"]])
origin_o = np.array([ours["cx"], (ours["y0"] + ours["y1"]) / 2, ours["top"]])

# ---- the skin to stay clear of (the whole body: long hair lies on the neck, shoulders and back)
sbm = bmesh.new(); sbm.from_mesh(me); sbm.transform(body.matrix_world)
bmesh.ops.delete(sbm, geom=[f for f in sbm.faces if mats[f.material_index] != "M_Skin"], context='FACES')
sbm.normal_update()
bvh = BVHTree.FromBMesh(sbm)
pushed = 0

# ---- hair: our own mesh of HairDeck's cards (cards_seedN.json: per card a shape and a sequence of control points
# x y z, width, thickness, and the width direction; glTF space, Y up)
cards_path = os.path.abspath(a["cards"])
with open(cards_path) as f:
    cards = json.load(f)


def unit(v):
    return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-12)


def to_blender(v):                                       # glTF (x, y up, z) -> Blender (x, -z, z up)
    return np.stack([v[:, 0], -v[:, 2], v[:, 1]], axis=1)


STENCIL = np.array([-1 / 12, 2 / 3, 0, -2 / 3, 1 / 12])
RINGS = (int(a.get("rings-min", 5)), int(a.get("rings-max", 20))); PER_RING = float(a.get("ring-every", 2.6))
rng = np.random.default_rng(0)
FRINGE = not a.get("keep-fringe"); FRINGE_AT = float(a.get("fringe-at", 0.022)); FRINGE_HALF = float(a.get("fringe-half", 0.062)); trimmed = 0
V = []; F = []; UV = []; COL = []; off = 0; src_tris = 0
for card in cards:
    S8 = np.asarray(card["seq"], np.float64); n = len(S8)
    if n < 3:
        continue
    src_tris += 10 * (n - 1) + 2
    Pc = to_blender(S8[:, :3]); wdir = to_blender(S8[:, 5:8])
    w = S8[:, 3:4].copy(); th = S8[:, 4:5].copy()
    if FRINGE:
        # HairDeck's characters have low, large eyes and a fringe down to them; on our face that fringe covers the eyes.
        # A lock that comes down in front of the face is cut at the brow line and tapered to a point there.
        Pt = (Pc - origin_t) * scale + origin_o
        zone = (Pt[:, 1] < eye_y + 0.035) & (np.abs(Pt[:, 0] - ours["cx"]) < FRINGE_HALF) & (Pt[:, 2] < eye_z + FRINGE_AT) & (Pt[:, 2] > eye_z - 0.09)
        hit = np.nonzero(zone)[0]
        if len(hit) and hit[0] >= 2:
            cut = int(hit[0]) + 1
            Pc = Pc[:cut]; wdir = wdir[:cut]; w = w[:cut]; th = th[:cut]; n = cut; trimmed += 1
            taper = min(4, n - 1)
            for q in range(taper):
                w[n - 1 - q] *= q / taper; th[n - 1 - q] *= q / taper
            if n < 3:
                continue
        elif len(hit):
            trimmed += 1
            continue                                     # it starts in front of the eyes: not a lock we can keep
    # frames as HairDeck's bishop mesh (hairdeck/cards/mesh.py, Apache-2.0): 5-point tangents, the root's width
    # direction carried along the card without twist
    if n < 5:
        T = np.repeat(unit(Pc[-1] - Pc[0])[None], n, 0)
    else:
        T = np.stack([unit((STENCIL[:, None] * Pc[min(max(i - 2, 0), n - 5):min(max(i - 2, 0), n - 5) + 5]).sum(0)) for i in range(n)])
    N = np.empty_like(Pc)
    N[0] = unit(wdir[0] - wdir[0].dot(T[0]) * T[0])
    for i in range(1, n):
        t0, t1 = T[i - 1], T[i]
        ax = np.cross(t0, t1); sn = np.linalg.norm(ax); cs = float(np.clip(t0.dot(t1), -1, 1)); m = N[i - 1]
        if sn > 1e-9:
            k = ax / sn
            m = m * cs + np.cross(k, m) * sn + k * k.dot(m) * (1 - cs)
        N[i] = unit(m - m.dot(t1) * t1)
    t2 = np.cross(N, unit(T - (T * N).sum(-1, keepdims=True) * N))
    tri = card.get("shape") == "triangle"
    up, down = (3.0, 6.0) if tri else (2.0, 2.0)
    # fewer rings than control points: the game's budget (the frames above come from the full sequence)
    keep = np.unique(np.round(np.linspace(0, n - 1, int(np.clip(round(n / PER_RING), *RINGS)))).astype(int))
    r = len(keep)
    ring = np.stack([Pc + w / 2 * N, Pc + th / up * t2, Pc - w / 2 * N, Pc - th / down * t2], 1)[keep]
    ring = (ring - origin_t) * scale + origin_o
    # clearance, a ring at a time: our shoulders and back are broader than the head the hair was made on, and a lock that
    # ends up inside is lifted out whole (moving single vertices tears a card to shreds). The lift carries on down the
    # lock, so what hangs below a shoulder stays outside the back.
    lift = Vector((0, 0, 0))
    for q in range(r):
        c = Vector(ring[q].mean(0)) + lift
        loc, nrm, _, dist = bvh.find_nearest(c)
        if loc is not None:
            side = (c - loc).dot(nrm)
            reach = max(CLEAR, float(np.linalg.norm(ring[q] - ring[q].mean(0), axis=1).max()) * 0.5)
            if side < reach and dist < 0.09:
                lift = lift + nrm * (reach - side); pushed += 1
        ring[q] += np.array(lift)
        lift = lift * 0.85
    ring = ring.reshape(r * 4, 3)
    f = [[0, 2, 1], [0, 3, 2]]
    for i in range(1, r):
        l = 4 * i
        f += [[l, l - 4, l + 1], [l + 1, l - 3, l + 2], [l + 2, l - 2, l + 3], [l + 3, l - 1, l], [l - 3, l + 1, l - 4],
              [l - 4, l, l - 1], [l - 1, l + 3, l - 2], [l - 2, l + 2, l - 3]]
    l = 4 * (r - 1)
    f += [[l, l + 1, l + 2], [l, l + 2, l + 3]]
    f = np.array(f)
    A, B, Cc = ring[f[:, 0]], ring[f[:, 1]], ring[f[:, 2]]
    f = f[np.linalg.norm(np.cross(B - A, Cc - A), axis=1) > 1e-12]            # a ring of zero width is a point
    arc = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(Pc, axis=0), axis=1))])
    v = (arc / arc[-1] if arc[-1] > 0 else np.linspace(0, 1, n))[keep]
    V.append(ring); F.append(f + off); off += len(ring)
    UV.append(np.stack([np.tile([0.0, 0.5, 1.0, 0.5], r), np.repeat(v, 4)], 1))
    # a tone per lock and darker roots, drawn through the vertex colour under the person's hair colour
    k = float(np.clip(rng.normal(0.92, 0.07), 0.78, 1.0))
    COL.append(np.repeat(k * (0.82 + 0.18 * np.sqrt(v)), 4))
P = np.concatenate(V)
F = np.concatenate(F); UV = np.concatenate(UV); COL = np.concatenate(COL)
single_tris = len(F)
hm = bpy.data.meshes.new("Hair_" + hid)
hm.from_pydata(P.tolist(), [], F.tolist()); hm.update()
uvl = hm.uv_layers.new(name="UVMap")
loops = np.array([l.vertex_index for l in hm.loops])
uvl.data.foreach_set("uv", UV[loops].ravel())
hair_src = bpy.data.objects.new("Hair_" + hid, hm); bpy.context.collection.objects.link(hair_src)
new = [hair_src]

# ---- scalp cap
cap_faces = 0
if CAP:
    kd = kdtree.KDTree(len(P))
    for i in range(len(P)):
        kd.insert(Vector(P[i]), i)
    kd.balance()
    cbm = bmesh.new(); cbm.from_mesh(me); cbm.transform(body.matrix_world)
    keep = set(head_faces) | {p.index for p in me.polygons if dom[p.index] == "neck_01" and mats[p.material_index] == "M_Skin"}
    bmesh.ops.delete(cbm, geom=[f for f in cbm.faces if f.index not in keep], context='FACES')
    cbm.faces.ensure_lookup_table(); cbm.normal_update()

    def allowed(f):
        c = f.calc_center_median()
        if c.z < H0.z - 0.02:
            return False
        # above the ears and the brow, or behind the ears; never the face or the ears themselves
        return (c.z > eye_z + 0.04 and c.y > eye_y - 0.005) or c.z > eye_z + 0.06 or c.y > H0.y + 0.06
    sel = {f for f in cbm.faces if allowed(f) and kd.find(f.calc_center_median())[2] < 0.012}

    def grow(s):
        return s | {g for f in s for e in f.edges for g in e.link_faces if allowed(g)}

    def shrink(s):
        return {f for f in s if all(g in s or not allowed(g) for e in f.edges for g in e.link_faces)}
    for _ in range(5):
        sel = grow(sel)
    for _ in range(5):
        sel = shrink(sel)
    bmesh.ops.delete(cbm, geom=[f for f in cbm.faces if f not in sel], context='FACES')
    for v in cbm.verts:
        v.co += v.normal * 0.0025
    cap_faces = len(cbm.faces)
    cap_me = bpy.data.meshes.new("cap"); cbm.to_mesh(cap_me); cbm.free()
    for layer in list(cap_me.uv_layers)[1:]:
        cap_me.uv_layers.remove(layer)
    hbm = bmesh.new(); hbm.from_mesh(hm); hbm.from_mesh(cap_me); hbm.to_mesh(hm); hbm.free()
    COL = np.concatenate([COL, np.full(len(hm.vertices) - len(COL), 0.8)])        # the cap is a shade darker than the locks

# ---- under a hat: a shape key that lays everything above the hat's edge down on the scalp (the runtime turns it on
# while a hat that `flattensHair` is worn; without it the locks stand out through the crown of every hat)
hat_moved = 0
if not a.get("no-hat-key"):
    HAT_LINE = eye_z + float(a.get("hat-line", 0.035))   # where caps, beanies and hat bands sit on our heads
    hbm2 = bmesh.new(); hbm2.from_mesh(me); hbm2.transform(body.matrix_world)
    bmesh.ops.delete(hbm2, geom=[f for f in hbm2.faces if f.index not in set(head_faces)], context='FACES')
    hbm2.normal_update()
    head_bvh = BVHTree.FromBMesh(hbm2)
    rest = np.array([v.co[:] for v in hm.vertices])
    flat = rest.copy()
    for i, pnt in enumerate(rest):
        w = (pnt[2] - (HAT_LINE - 0.02)) / 0.025
        if w <= 0:
            continue
        w = min(1.0, w); w = w * w * (3 - 2 * w)
        loc, nrm, _, dist = head_bvh.find_nearest(Vector(pnt))
        if loc is None:
            continue
        # layers keep their order: what stood further out stays a little further out
        target = np.array(loc + nrm * (0.003 + 0.003 * min(1.0, dist / 0.04)))
        flat[i] = pnt + (target - pnt) * w
        hat_moved += 1
    hbm2.free()
    mesh_keyed = hair_src
    mesh_keyed.shape_key_add(name="Basis", from_mix=False)
    kb = mesh_keyed.shape_key_add(name="hat", from_mix=False)
    kb.data.foreach_set("co", flat.astype(np.float32).ravel())

# ---- one material, smooth, both sides
mesh_ob = hair_src; mesh_ob.name = "Hair_" + hid
for poly in hm.polygons:
    poly.use_smooth = True; poly.material_index = 0
mat = bpy.data.materials.new("M_Hair"); mat.use_nodes = True
mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.8
mat.use_backface_culling = False
hm.materials.clear(); hm.materials.append(mat)
for attr in [c.name for c in hm.color_attributes]:
    hm.color_attributes.remove(hm.color_attributes[attr])
ca = hm.color_attributes.new(name="Color", type='BYTE_COLOR', domain='CORNER')
shade = COL[np.array([l.vertex_index for l in hm.loops])] ** 2.2            # stored linear; read as a grey factor
ca.data.foreach_set("color", np.stack([shade, shade, shade, np.ones_like(shade)], 1).ravel())
hm.color_attributes.render_color_index = 0; hm.color_attributes.active_color_index = 0
while len(hm.uv_layers) > 1:
    hm.uv_layers.remove(hm.uv_layers[-1])

# ---- weights (as build_hair.py: the head, blending to neck and upper spine below the skull base)
for vg in list(mesh_ob.vertex_groups):
    mesh_ob.vertex_groups.remove(vg)
vg_head = mesh_ob.vertex_groups.new(name="Head"); vg_neck = mesh_ob.vertex_groups.new(name="neck_01"); vg_spine = mesh_ob.vertex_groups.new(name="spine_03")
for v in hm.vertices:
    z = v.co.z
    if z < H0.z:
        t = min(1.0, (H0.z - z) / max(0.02, H0.z - neck_z + 0.08))
        vg_head.add([v.index], 1 - t, 'REPLACE'); vg_neck.add([v.index], t * 0.7, 'REPLACE'); vg_spine.add([v.index], t * 0.3, 'REPLACE')
    else:
        vg_head.add([v.index], 1.0, 'REPLACE')
C.limit_and_normalize(mesh_ob)
for mod in list(mesh_ob.modifiers):
    mesh_ob.modifiers.remove(mod)
mod = mesh_ob.modifiers.new("Armature", 'ARMATURE'); mod.object = arm
mesh_ob.parent = arm; mesh_ob.matrix_parent_inverse = arm.matrix_world.inverted()
for _vg in list(mesh_ob.vertex_groups):
    if not any(_g.group == _vg.index and _g.weight > 0 for _v in hm.vertices for _g in _v.groups):
        mesh_ob.vertex_groups.remove(_vg)

tris = sum(len(p.vertices) - 2 for p in hm.polygons)
out = os.path.abspath(a["out"]) if a.get("out") else os.path.join(repo, "public/assets/characters/modular/hair/%s__%s.glb" % (hid, body_id))
C.export_glb(out, [arm, mesh_ob], morphs=bool(hm.shape_keys), vertex_color=True)
report = {"id": hid, "body": body_id, "source": os.path.relpath(cards_path, repo) if cards_path.startswith(repo) else os.path.basename(cards_path),
          "scale": [round(float(x), 4) for x in scale], "source_tris": src_tris, "single_sided": single_tris, "triangles": tris, "cap_faces": cap_faces, "cards": len(cards), "fringe_trimmed": trimmed, "hat_key": hat_moved, "pushed": pushed,
          "lowest": round(float(P[:, 2].min()), 3)}
if a.get("out"):
    C.write_json(out[:-4] + ".json", report)                 # a trial: the report goes next to it
else:
    C.write_json(os.path.join(repo, "authoring/characters/hair", hid, "hairdeck_%s.json" % body_id), report)
print("HAIRDECK_TO_HAIR", json.dumps(report))
