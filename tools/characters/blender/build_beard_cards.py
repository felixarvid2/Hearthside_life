"""A beard or moustache as locks, in the manner of the HairDeck hairstyles (hairdeck_to_hair.py): tapered cards with a tone
of their own over a layer in the hair colour, in place of GBH ribbons.

  blender -b --factory-startup authoring/characters/bodies/<body>/fitting.blend --python tools/characters/blender/build_beard_cards.py -- \
      --id <facial hair id> --body <body id> --repo . [--out <file.glb>]

The design is the one the catalog already has, authoring/characters/facial_hair/<id>/params.json: `beard` names the regions
of the face (mustache, soul, chin, jaw, cheeks, sideburns, neck; chin_w, cheek_h, spread, forward), `length` and
`clump_width` size the locks. The regions are the same landmark boxes as build_hair.py's beard mode. Per region:

- a base layer: the region's skin raised 2 mm, a shade darker, so no skin shows between the locks;
- locks: roots spread evenly over the region (a lock's width apart), each a card of four rings that grows out of the skin
  and falls (a moustache combs sideways from the middle; `spread` lengthens and lifts its ends, the handlebar); cards are
  kept out of the skin, and lie flat against it.
Weights come from the nearest skin vertex. The face and stage keys are put in afterwards by apply_stage_morph.py
(`--keys jaw_width,chin_length,mouth_width,weight,young,face2 --only <ids>`).
A design without locks (`clumps` 0: the stubbles) is not built here.

Writes public/assets/characters/modular/facial_hair/<id>__<body>.glb and authoring/.../<id>/cards_<body>.json (the report).
"""
import bpy, bmesh, json, math, os, sys
import numpy as np
from mathutils import Vector, kdtree
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C
import morphs as M

a = C.args()
repo = os.path.abspath(a.get("repo", ".")); hid = a["id"]; body_id = a["body"]
src_dir = os.path.join(repo, "authoring/characters/facial_hair", hid)
with open(os.path.join(src_dir, "params.json")) as f:
    Pm = json.load(f)
Pm.update((Pm.get("per_body") or {}).get(body_id, {}))
B = Pm["beard"]
if not Pm.get("clumps", 1):
    sys.exit("'%s' has no locks (stubble): it keeps its build_hair.py layer" % hid)

body = bpy.data.objects["Body"]
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
if body.data.shape_keys:
    for kb in body.data.shape_keys.key_blocks:
        kb.value = 0.0
me = body.data
H0 = arm.matrix_world @ arm.data.bones["Head"].head_local
L = M.landmarks(body, arm)
nose, chin, menton = L["nose"], L["chin"], L["menton"]
mouth_z = nose.z - 0.35 * (nose.z - menton.z)
near = [p for p in L["profile"] if abs(p.z - mouth_z) < 0.004]
mouth_y = min(p.y for p in near) if near else nose.y + 0.02
cx = H0.x


def region_of(c):
    """The beard region a point of the face is in, or None (build_hair.py's boxes)."""
    x = abs(c.x - cx)
    if c.y > H0.y + 0.015:
        return None
    if x < 0.027 and abs(c.z - mouth_z) < 0.0095 and c.y < mouth_y + 0.02:
        return None                                      # the lips
    if B.get("mustache") and x < 0.036 and mouth_z + 0.004 < c.z < nose.z - 0.012 and c.y < nose.y + 0.045:
        return "mustache"
    if B.get("soul") and x < 0.012 and mouth_z - 0.024 < c.z < mouth_z - 0.008 and c.y < mouth_y + 0.03:
        return "soul"
    if B.get("chin") and x < B.get("chin_w", 0.036) and menton.z - 0.012 < c.z < mouth_z - 0.008 and c.y < H0.y - 0.03:
        return "chin"
    if B.get("jaw") and x >= 0.025 and menton.z - 0.02 < c.z < mouth_z + 0.012 and c.y < H0.y - 0.005:
        return "jaw"
    if B.get("cheeks") and x >= 0.028 and mouth_z + 0.01 <= c.z < nose.z + B.get("cheek_h", -0.004) and c.y < H0.y - 0.01:
        return "cheeks"
    if B.get("sideburns") and x > 0.055 and mouth_z + 0.01 <= c.z < nose.z + 0.045 and H0.y - 0.04 < c.y < H0.y + 0.015:
        return "sideburns"
    if B.get("neck") and menton.z - 0.05 < c.z < menton.z + 0.005 and c.y < H0.y - 0.035:
        return "neck"
    return None


# ---- the face skin and the region on it
mats = [s.material.name if s.material else "" for s in body.material_slots]
dom = C.dominant_bone_per_face(body)
bm = bmesh.new(); bm.from_mesh(me); bm.transform(body.matrix_world)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if not (dom[f.index] in ("Head", "neck_01") and mats[f.material_index] == "M_Skin")], context='FACES')
bm.faces.ensure_lookup_table(); bm.normal_update()
bvh = BVHTree.FromBMesh(bm)
faces = [(f, region_of(f.calc_center_median())) for f in bm.faces]
faces = [(f, r) for f, r in faces if r]
if not faces:
    sys.exit("no skin in the regions of '%s'" % hid)

# ---- roots: area-weighted candidates, kept when no kept root is nearer than the spacing
CW = float(Pm.get("clump_width", 0.012)); LEN = float(Pm.get("length", 0.016)); VOL = float(Pm.get("volume", 0.003))
SPACE = CW * float(a.get("spacing", 0.8))
rng = np.random.default_rng(3)
areas = np.array([f.calc_area() for f, _ in faces]); prob = areas / areas.sum()
roots = []
for fi in rng.choice(len(faces), size=6000, p=prob):
    f, r = faces[fi]
    vs = [v.co for v in f.verts]
    u, v = rng.random(2)
    if u + v > 1:
        u, v = 1 - u, 1 - v
    p = vs[0] + (vs[1] - vs[0]) * u + (vs[2] - vs[0]) * v if len(vs) >= 3 else f.calc_center_median()
    if all((p - q).length_squared > SPACE * SPACE for q, _, _ in roots):
        roots.append((p.copy(), f.normal.copy(), r))
# both halves of the face alike: the roots of one side, mirrored
roots = [(p, n, r) for p, n, r in roots if p.x - cx >= 0.0]
roots += [(Vector((2 * cx - p.x, p.y, p.z)), Vector((-n.x, n.y, n.z)), r) for p, n, r in roots if p.x - cx > SPACE * 0.5]

REGION_LEN = {"mustache": 0.9, "soul": 0.7, "chin": 1.25, "jaw": 1.0, "cheeks": 0.8, "sideburns": 0.7, "neck": 0.85}
DOWN = Vector((0, 0, -1)); SPREAD = float(B.get("spread", 0.0)); FWD = float(B.get("forward", 0.0))
RINGS = 5; WIDE = float(a.get("wide", 1.5))          # fewer, broader locks read as a beard at game distance; many thin ones as fur
V = []; F = []; UV = []; COL = []; off = 0


def outside(p, clear):
    loc, nrm, _, dist = bvh.find_nearest(p)
    if loc is None:
        return p
    if (p - loc).dot(nrm) < clear:
        return loc + nrm * clear
    return p


for p0, n, reg in roots:
    side = 1.0 if p0.x - cx >= 0 else -1.0
    length = LEN * 1.15 * REGION_LEN[reg] * float(rng.uniform(0.85, 1.15))
    if reg == "mustache":
        # combed from the middle to the sides and a little down; the handlebar's ends are long and turn up
        out = min(1.0, abs(p0.x - cx) / 0.03)
        d = Vector((side * (0.9 + SPREAD), -0.15 - FWD, -0.45 + SPREAD * out * 0.9)) + n * 0.25
        length = min(length, 0.022) * (1.0 + SPREAD * out * 1.6)      # a long beard does not make the moustache long
    elif reg == "sideburns":
        d = DOWN * 1.0 + n * 0.25
    else:
        d = DOWN * 0.9 + n * (0.55 + FWD) + Vector((side * 0.12, 0, 0))
    d.normalize()
    wdir = d.cross(n)
    if wdir.length < 1e-6:
        wdir = Vector((1, 0, 0))
    wdir.normalize()
    k = float(np.clip(rng.normal(0.9, 0.08), 0.74, 1.0))
    ring = []
    for i in range(RINGS):
        t = i / (RINGS - 1)
        c = p0 - n * 0.0015 + d * (length * t) + n * (VOL * math.sin(math.pi * min(1.0, t * 1.15)))
        c = c + DOWN * (length * 0.18 * t * t) if reg != "mustache" else c
        c = outside(c, 0.0012 + VOL * 0.6 * t) if i else c
        w = CW * WIDE * (0.55 + 0.45 * math.sin(math.pi * min(1.0, t * 1.4))) * (1.0 - t ** 2.2)
        th = w * 0.42
        _, sn, _, _ = bvh.find_nearest(c)
        up = sn if sn is not None else n
        ring += [c + wdir * (w / 2), c + up * (th / 2), c - wdir * (w / 2), c - up * (th / 2)]
        UV += [(0.0, t), (0.5, t), (1.0, t), (0.5, t)]
        COL += [k * (0.8 + 0.2 * math.sqrt(t))] * 4
    f = [[0, 2, 1], [0, 3, 2]]
    for i in range(1, RINGS):
        l = 4 * i
        f += [[l, l - 4, l + 1], [l + 1, l - 3, l + 2], [l + 2, l - 2, l + 3], [l + 3, l - 1, l], [l - 3, l + 1, l - 4],
              [l - 4, l, l - 1], [l - 1, l + 3, l - 2], [l - 2, l + 2, l - 3]]
    V += ring; F += [[x + off for x in tri] for tri in f]; off += len(ring)

Vn = np.array([v[:] for v in V]); Fn = np.array(F)
A_, B_, C_ = Vn[Fn[:, 0]], Vn[Fn[:, 1]], Vn[Fn[:, 2]]
Fn = Fn[np.linalg.norm(np.cross(B_ - A_, C_ - A_), axis=1) > 1e-12]      # the pointed tip is one point
hm = bpy.data.meshes.new("Beard_" + hid)
hm.from_pydata(Vn.tolist(), [], Fn.tolist()); hm.update()
lock_tris = len(hm.polygons)

# ---- base layer: the region's skin, raised
keep = {f for f, _ in faces}
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f not in keep], context='FACES')
for v in bm.verts:
    v.co += v.normal * 0.002
base_me = bpy.data.meshes.new("base"); bm.to_mesh(base_me); bm.free()
for layer in list(base_me.uv_layers):
    base_me.uv_layers.remove(layer)
hbm = bmesh.new(); hbm.from_mesh(hm); hbm.from_mesh(base_me); hbm.to_mesh(hm); hbm.free()
COL = np.concatenate([np.array(COL), np.full(len(hm.vertices) - len(COL), 0.72)])
UVn = np.concatenate([np.array(UV), np.zeros((len(hm.vertices) - len(UV), 2))])
uvl = hm.uv_layers.new(name="UVMap") if not hm.uv_layers else hm.uv_layers[0]
loops = np.array([l.vertex_index for l in hm.loops])
uvl.data.foreach_set("uv", UVn[loops].ravel())
ca = hm.color_attributes.new(name="Color", type='BYTE_COLOR', domain='CORNER')
shade = COL[loops] ** 2.2
ca.data.foreach_set("color", np.stack([shade, shade, shade, np.ones_like(shade)], 1).ravel())
for poly in hm.polygons:
    poly.use_smooth = True
mat = bpy.data.materials.new(Pm["color_regions"][0]["materials"][0]); mat.use_nodes = True
mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.8
mat.use_backface_culling = False
hm.materials.append(mat)
ob = bpy.data.objects.new("Beard_" + hid, hm); bpy.context.collection.objects.link(ob)

# ---- weights from the nearest skin vertex (the jaw and neck carry it)
kd = kdtree.KDTree(len(me.vertices))
for v in me.vertices:
    kd.insert(body.matrix_world @ v.co, v.index)
kd.balance()
names = {vg.index: vg.name for vg in body.vertex_groups}
groups = {}
for v in hm.vertices:
    _, bi, _ = kd.find(v.co)
    for g in me.vertices[bi].groups:
        nm = names.get(g.group)
        if nm is None or g.weight <= 1e-4:
            continue
        if nm not in groups:
            groups[nm] = ob.vertex_groups.new(name=nm)
        groups[nm].add([v.index], g.weight, 'REPLACE')
C.limit_and_normalize(ob)
mod = ob.modifiers.new("Armature", 'ARMATURE'); mod.object = arm
ob.parent = arm; ob.matrix_parent_inverse = arm.matrix_world.inverted()

tris = sum(len(p.vertices) - 2 for p in hm.polygons)
out = os.path.abspath(a["out"]) if a.get("out") else os.path.join(repo, "public/assets/characters/modular/facial_hair/%s__%s.glb" % (hid, body_id))
C.export_glb(out, [arm, ob], morphs=False, vertex_color=True)
report = {"id": hid, "body": body_id, "locks": len(roots), "lock_triangles": lock_tris, "triangles": tris,
          "regions": sorted({r for _, _, r in roots})}
C.write_json(out[:-4] + ".json" if a.get("out") else os.path.join(src_dir, "cards_%s.json" % body_id), report)
print("BEARD_CARDS", json.dumps(report))
