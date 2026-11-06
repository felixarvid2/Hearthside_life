"""Builds one hairstyle with GBH Tool on a prepared body and exports it for the game.

  blender -b --factory-startup --python build_hair.py -- --params authoring/characters/hair/<id>/params.json
          --body <body-id> --repo <repo root>

Workflow (params.json holds every design parameter; guides.json is written next to it as the editable guide source):
 1. Scalp: the body's Head-dominated faces above the hairline (front/back hairline heights in head space).
 2. Guides: one hair curve per clump root (Fibonacci samples on the scalp), walked over the skull at `volume` offset
    away from the part line for `length`, then (long styles) falling with gravity.
 3. GBH Tool: the 'GBH Simple Mesh Hair' preset's node groups (resolution, snap roots, width/taper, custom profile,
    UVs, material) are copied onto the guide curves, the profile is the flattened clump cross-section.
 4. Converted to a mesh (Blender's Convert to Mesh on the evaluated GBH result), decimated to `target_tris`, weighted to the Head bone (plus neck/spine
    blend below the skull for long styles), max 4 influences, exported with the body's armature.
"""
import bpy, bmesh, os, sys, json, math, time
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.dirname(__file__))
import common as C

a = C.args()
repo = a.get("repo", os.getcwd())
P = json.load(open(a["params"]))
body_id = a["body"]
hid = P["id"]
src_dir = os.path.join(repo, "authoring/characters/hair", hid)
t0 = time.time()

bpy.ops.wm.open_mainfile(filepath=os.path.join(repo, "authoring/characters/bodies", body_id, "fitting.blend"))
GBH = "bl_ext.user_default.gbhtool"
bpy.ops.preferences.addon_enable(module=GBH)
GBH_DIR = os.path.dirname(sys.modules[GBH].__file__)
ctx = bpy.context
body = bpy.data.objects["Body"]
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
head_bone = arm.pose.bones["Head"]
H0 = arm.matrix_world @ head_bone.head            # skull base (world, Z up, character faces -Y)

# ---- 1. scalp -------------------------------------------------------------------------------------------------
dom = C.dominant_bone_per_face(body)
bm = bmesh.new(); bm.from_mesh(body.data); bm.transform(body.matrix_world)
bm.faces.ensure_lookup_table()
head_faces = [f for f in bm.faces if dom[f.index] == "Head"]
ztop = max(v.co.z for f in head_faces for v in f.verts)
hz = ztop - H0.z
def head_h(p):  # 0 at the skull base, 1 at the crown
    return (p.z - H0.z) / hz
def hairline(p):
    """Height (0..1) of the hairline at this point: front (-Y) higher than the back, interpolated by angle."""
    d = (p - H0); ang = math.atan2(d.x, -d.y)          # 0 = front, ±pi = back
    w = (1 - math.cos(ang)) / 2                         # 0 front .. 1 back
    return P["hairline_front"] * (1 - w) + P["hairline_back"] * w
keep = [f for f in head_faces if head_h(f.calc_center_median()) >= hairline(f.calc_center_median())]
scalp_bm = bmesh.new()
vmap = {}
for f in keep:
    vs = []
    for v in f.verts:
        if v.index not in vmap:
            vmap[v.index] = scalp_bm.verts.new(v.co)
        vs.append(vmap[v.index])
    try:
        scalp_bm.faces.new(vs)
    except ValueError:
        pass
scalp_me = bpy.data.meshes.new("Scalp"); scalp_bm.to_mesh(scalp_me)
scalp = bpy.data.objects.new("Scalp", scalp_me); ctx.collection.objects.link(scalp)
head_only = bmesh.new(); hv = {}
for f in head_faces:
    vs = []
    for v in f.verts:
        if v.index not in hv:
            hv[v.index] = head_only.verts.new(v.co)
        vs.append(hv[v.index])
    try:
        head_only.faces.new(vs)
    except ValueError:
        pass
head_only.normal_update()
head_bvh = BVHTree.FromBMesh(head_only)
scalp_bvh = BVHTree.FromBMesh(scalp_bm)
center = Vector((H0.x, H0.y, H0.z + hz * 0.45))   # inside the skull

# ---- 2. guides ------------------------------------------------------------------------------------------------
def on_skull(q, off):
    """Projects q onto the skull surface pushed out by `off` along its normal."""
    loc, nrm, _, _ = head_bvh.find_nearest(q)
    if loc is None:
        return q
    if (q - center).dot(nrm) < 0:
        nrm = -nrm
    return loc + nrm * off

roots = []
n = P["clumps"] * 6
golden = math.pi * (3 - math.sqrt(5))
for i in range(n):
    y = 1 - (i / (n - 1)) * 2
    r = math.sqrt(max(0.0, 1 - y * y))
    d = Vector((math.cos(golden * i) * r, math.sin(golden * i) * r, y))
    if d.z < -0.2:
        continue
    hit = scalp_bvh.ray_cast(center + d * 0.4, -d, 0.5)
    if hit[0] is not None and head_h(hit[0]) >= hairline(hit[0]):
        roots.append((hit[0], hit[1] if hit[1].dot(d) > 0 else -hit[1]))
# Thin to the requested clump count, evenly over the sample order.
step = max(1, len(roots) // P["clumps"])
roots = roots[::step][: P["clumps"]]

part_x = H0.x + P["part_offset"]               # part line along the crown (x = const), offset toward the left (+x)
guides = []
for p, nrm in roots:
    side = 1.0 if p.x >= part_x else -1.0
    pts = [p.copy()]
    q = p.copy()
    L = P["length"] * (1 + P.get("length_jitter", 0.15) * math.sin(len(guides) * 12.9898))
    seg = L / (P["points"] - 1)
    for k in range(1, P["points"]):
        t = k / (P["points"] - 1)
        off = P["volume"] * (0.35 + 0.65 * t)
        # Flow: away from the part and backward over the top; down over the sides and back.
        top = max(0.0, head_h(q) - 0.75) / 0.25
        flow = Vector((side * (0.55 + 0.45 * top), P.get("back_flow", 0.6), -(1 - top) * 1.0 - 0.15))
        if q.z < H0.z + hz * P.get("fall_below", 0.0) and P.get("gravity", 0) > 0:
            flow = Vector((flow.x * 0.25, flow.y * 0.25, -P["gravity"]))
        q = q + flow.normalized() * seg
        if q.z > H0.z + hz * P.get("fall_below", -9.0) or P.get("gravity", 0) == 0:
            q = on_skull(q, off)
        else:  # below the skull: keep outside the head/neck by the volume offset
            loc, nn, _, dd = head_bvh.find_nearest(q)
            if loc is not None and dd < off:
                q = loc + (q - loc).normalized() * off
        pts.append(q.copy())
    guides.append([list(map(lambda v: round(v, 5), x)) for x in pts])
C.write_json(os.path.join(src_dir, "guides_%s.json" % body_id), {"body": body_id, "params": P, "guides": guides})

curves_data = bpy.data.hair_curves.new("HairGuides")
curves_data.add_curves([len(g) for g in guides])
for ci, g in enumerate(guides):
    for k, co in enumerate(g):
        curves_data.curves[ci].points[k].position = co
hair = bpy.data.objects.new("Hair_" + hid, curves_data); ctx.collection.objects.link(hair)
curves_data.surface = scalp

# ---- 3. GBH Tool stylized mesh hair ----------------------------------------------------------------------------
preset = os.path.join(GBH_DIR, "presets/STYLIZED/GBH Simple Mesh Hair.blend")
with bpy.data.libraries.load(preset) as (src, dst):
    dst.objects = list(src.objects)
src_hair = next(o for o in dst.objects if o.type == 'CURVES')
profile = next(o for o in dst.objects if o.type == 'CURVE')
ctx.collection.objects.link(profile)
# The preset's profile circle has its own radius; scale it so a clump is `clump_width` metres wide at the root.
base_r = max(max(abs(bp.co.x), abs(bp.co.y)) for sp in profile.data.splines for bp in sp.bezier_points) or 1.0
sx = P["clump_width"] / 2 / base_r
profile.scale = (sx, sx * P.get("clump_flatness", 0.45), 1)
profile.data.resolution_u = P.get("profile_resolution", 2)   # points per profile segment: the clump's ring size
gbh_mods = []
for m in src_hair.modifiers:
    if m.type != 'NODES' or m.node_group is None:
        continue
    if m.node_group.name.startswith("Surface Deform"):
        continue                                     # authoring only needs the static shape
    nm = hair.modifiers.new(m.name, 'NODES'); nm.node_group = m.node_group
    for key in m.keys():
        try:
            nm[key] = m[key]
        except Exception:
            pass
    gbh_mods.append(nm)
def set_input(mod, label, value):
    for it in mod.node_group.interface.items_tree:
        if getattr(it, "in_out", "") == 'INPUT' and it.name == label:
            mod[it.identifier] = value
            return True
    return False
mat = bpy.data.materials.new(P["color_regions"][0]["materials"][0]); mat.use_nodes = True
hcol = P["color_regions"][0]["default"].lstrip("#")
mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (int(hcol[0:2], 16) / 255, int(hcol[2:4], 16) / 255, int(hcol[4:6], 16) / 255, 1)
mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.6
for mod in gbh_mods:
    g = mod.node_group.name
    if g.startswith("GBH Snap Roots"):
        set_input(mod, "Snap Object", scalp); set_input(mod, "Offset", P.get("root_offset", 0.002))
    elif g.startswith("GBH Profile Width Control"):
        set_input(mod, "Width Control Float Curve", P.get("width_scale", 1.0))   # 0 (the preset's value) = no width
    elif g.startswith("GBH Profile Custom"):
        set_input(mod, "Profile Object", profile); set_input(mod, "Fill Caps", True)
    elif g.startswith("GBH Resolution"):
        set_input(mod, "Render Resolution (cm)", P.get("resolution_cm", 1.2)); set_input(mod, "Viewport Resolution (cm)", P.get("resolution_cm", 1.2))
    elif g.startswith("GBH Set Material"):
        set_input(mod, "Material", mat)
hair.data.materials.append(mat)
ctx.view_layer.update()

# Convert: evaluated geometry -> mesh (what GBH's Convert Hair > Mesh produces).
# Convert the evaluated GBH result (a mesh produced by the node groups) into a real mesh object.
for o in ctx.selected_objects:
    o.select_set(False)
ctx.view_layer.objects.active = hair; hair.select_set(True)
bpy.ops.object.convert(target='MESH', keep_original=True)
mesh_ob = ctx.view_layer.objects.active
mesh_ob.name = "Hair_" + hid + "_Mesh"
for o in ctx.selected_objects:
    o.select_set(False)
ctx.view_layer.objects.active = mesh_ob; mesh_ob.select_set(True)
# GBH writes its UVs as a generic 'UVMap' corner attribute; make it a real UV map (as GBH's Convert Hair does).
at = mesh_ob.data.attributes.get("UVMap")
if at is not None and at.data_type == 'FLOAT_VECTOR' or (at is not None and at.domain == 'CORNER' and at.data_type != 'FLOAT2'):
    mesh_ob.data.attributes.active = at
    bpy.ops.geometry.attribute_convert(mode='GENERIC', domain='CORNER', data_type='FLOAT2')
src_tris = sum(len(p.vertices) - 2 for p in mesh_ob.data.polygons)
if src_tris == 0:
    raise SystemExit("GBH produced no geometry")
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=0.0005)
bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
target = P.get("target_tris", 3000)
cur = sum(len(p.vertices) - 2 for p in mesh_ob.data.polygons)
if cur > target * 1.05:
    d = mesh_ob.modifiers.new("Decimate", 'DECIMATE'); d.ratio = target / cur; d.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier="Decimate")
if not mesh_ob.data.uv_layers:
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.uv.smart_project(angle_limit=1.15); bpy.ops.object.mode_set(mode='OBJECT')
mesh_ob.data.materials.clear(); mesh_ob.data.materials.append(mat)
if P.get("cap", True):
    # Scalp cap in the hair color, offset just above the skin, so no scalp shows between the clumps.
    cap_bm = bmesh.new(); cap_bm.from_mesh(scalp.data); cap_bm.normal_update()
    for v in cap_bm.verts:
        nrm = v.normal if (v.co - center).dot(v.normal) > 0 else -v.normal
        v.co += nrm * P.get("cap_offset", 0.004)
    hair_bm = bmesh.new(); hair_bm.from_mesh(mesh_ob.data)
    cap_me = bpy.data.meshes.new("cap"); cap_bm.to_mesh(cap_me)
    hair_bm.from_mesh(cap_me)
    hair_bm.to_mesh(mesh_ob.data); hair_bm.free(); cap_bm.free()
    for poly in mesh_ob.data.polygons:
        poly.material_index = 0
mat.use_backface_culling = False

# ---- 4. weights + export --------------------------------------------------------------------------------------
neck_z = (arm.matrix_world @ arm.pose.bones["neck_01"].head).z
vg_head = mesh_ob.vertex_groups.new(name="Head")
vg_neck = mesh_ob.vertex_groups.new(name="neck_01")
vg_spine = mesh_ob.vertex_groups.new(name="spine_03")
for v in mesh_ob.data.vertices:
    z = (mesh_ob.matrix_world @ v.co).z
    if P.get("attachment", "skinned") == "skinned" and z < H0.z:
        # Below the skull base: blend toward the neck and upper spine so long hair follows the shoulders.
        t = min(1.0, (H0.z - z) / max(0.02, H0.z - neck_z + 0.08))
        vg_head.add([v.index], 1 - t, 'REPLACE'); vg_neck.add([v.index], t * 0.7, 'REPLACE'); vg_spine.add([v.index], t * 0.3, 'REPLACE')
    else:
        vg_head.add([v.index], 1.0, 'REPLACE')
C.limit_and_normalize(mesh_ob)
mod = mesh_ob.modifiers.new("Armature", 'ARMATURE'); mod.object = arm
mesh_ob.parent = arm
mesh_ob.matrix_parent_inverse = arm.matrix_world.inverted()
tris = sum(len(p.vertices) - 2 for p in mesh_ob.data.polygons)
zs = [(mesh_ob.matrix_world @ v.co).z for v in mesh_ob.data.vertices]
# Clearance: how many hair vertices sit inside the head (negative distance along the skull normal).
inside = 0
for v in mesh_ob.data.vertices:
    w = mesh_ob.matrix_world @ v.co
    loc, nrm, _, _ = head_bvh.find_nearest(w)
    if loc is not None:
        if (loc - center).dot(nrm) < 0:
            nrm = -nrm
        if (w - loc).dot(nrm) < -0.002:
            inside += 1
os.makedirs(src_dir, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(src_dir, "%s__%s.blend" % (hid, body_id)), compress=True)
out = os.path.join(repo, "public/assets/characters/modular/hair/%s__%s.glb" % (hid, body_id))
C.export_glb(out, [arm, mesh_ob], morphs=False)
report = {"hair": hid, "body": body_id, "roots": len(guides), "src_tris": src_tris, "tris": tris, "verts": len(mesh_ob.data.vertices),
          "z": [round(min(zs), 3), round(max(zs), 3)], "head_base_z": round(H0.z, 3), "inside_head_verts": inside,
          "secs": round(time.time() - t0, 1), "glb": os.path.relpath(out, repo), "gbh_modifiers": [m.node_group.name for m in gbh_mods]}
C.write_json(os.path.join(src_dir, "build_%s.json" % body_id), report)
print("HAIR", json.dumps(report))
