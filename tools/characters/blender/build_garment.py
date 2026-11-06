"""Builds one garment with OpenSew-2 on a prepared body and exports it for the game.

  blender -b --factory-startup --python build_garment.py -- --params authoring/characters/garments/<id>/params.json
          --body <body-id> --repo <repo root>

params.json (editable design parameters; the source of truth for regenerating the garment):
  { "id", "label", "preset": TSHIRT|TROUSERS|HOODIE|..., "fit": ease, "sleeve_len": m|null, "length_to": "hip"|...,
    "fabric": CRISP|SOFT|STIFF|LIGHT, "take_in": 0.05, "settle_frames": 50, "thickness": 0.0015,
    "target_tris": 2600, "color_regions": [...], "slot", "category", "hides": [...], "layer", "conflicts": [...] }

Steps: measure (with the Quaternius adapter) -> draft -> arrange + sew -> settle -> finalize (freeze, weld, weights
from the body, bind) -> drop the cloth/subdivision/solidify stack -> decimate to target_tris -> UVs -> weights limited
to 4 and normalized -> GLB with the body's armature -> source .blend kept next to the params.
"""
import bpy, os, sys, json, time
sys.path.insert(0, os.path.dirname(__file__))
import common as C

a = C.args()
repo = a.get("repo", os.getcwd())
P = json.load(open(a["params"]))
body_id = a["body"]
P.update(P.get("per_body", {}).get(body_id, {}))   # per-body overrides of the design parameters
gid = P["id"]
src_dir = os.path.join(repo, "authoring/characters/garments", gid)
t0 = time.time()

bpy.ops.wm.open_mainfile(filepath=os.path.join(repo, "authoring/characters/bodies", body_id, "fitting.blend"))
bpy.ops.preferences.addon_enable(module="clothing_design")
import opensew_adapter
avatar = opensew_adapter.install()
from clothing_design import library, build, sim, patterns, props

ctx = bpy.context
scn = ctx.scene
body = bpy.data.objects["Body"]
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
from mathutils import Matrix, Vector

def pose_arm_down(pb_name, deg):
    """Fitting pose: rotate an upper arm about the body's forward axis (world Y) around its shoulder joint.
    Pose mode only - the armature's rest (bind) pose is never changed."""
    pb = arm.pose.bones[pb_name]
    head = pb.head.copy()
    sign = 1 if head.x > 0 else -1
    R = Matrix.Translation(head) @ Matrix.Rotation(math.radians(deg) * sign, 4, 'Y') @ Matrix.Translation(-head)
    pb.matrix = R @ pb.matrix
    bpy.context.view_layer.update()

import math
fit_pose = P.get("fit_pose", {"arms_down_deg": 45})
if fit_pose.get("arms_down_deg"):
    pose_arm_down("upperarm_l", fit_pose["arms_down_deg"]); pose_arm_down("upperarm_r", fit_pose["arms_down_deg"])
for o in ctx.selected_objects:
    o.select_set(False)
ctx.view_layer.objects.active = body
body.select_set(True)
assert bpy.ops.cd.set_avatar() == {'FINISHED'}
m = avatar.measure(ctx, force=True)
lm = {k: round(v.z if hasattr(v, "z") else v, 4) for k, v in m.get("landmarks", {}).items()}
report = {"body": body_id, "height": round(m["height"], 4), "landmarks": lm, "figure": avatar.figure(ctx, m),
          "limbs": sorted(m.get("limbs", {}).keys()), "facing": scn.cd.facing,
          "girth": {k: round(avatar.girth_at(m, avatar.z_of(m, k)), 4) for k in ("chest", "waist", "hip")}}
print("MEASURED", json.dumps(report))
missing = [k for k in ("arm_l", "farm_l", "thigh_l", "calf_l") if k not in m.get("limbs", {})]
if missing:
    raise SystemExit("measurement adapter failed, limbs missing: %s" % missing)

# Parametric preset: pass the design parameters the preset supports.
label, fn = library.PRESETS[P["preset"]]
import inspect
kw = {k: P[k] for k in ("sleeve_len", "length_to", "flare", "length") if k in P and P[k] is not None and k in inspect.signature(fn).parameters}
library.PRESETS[P["preset"]] = (label, lambda mm, fit=P["fit"]: fn(mm, fit=fit, **kw))
scn.cd.fabric = P.get("fabric", "SOFT")
scn.cd.shrink = P.get("take_in", 0.05)
scn.cd.settle_frames = P.get("settle_frames", 50)
scn.cd.thickness = 0.0           # thickness is a render-side concern here: the game draws the shell double-sided
scn.cd.subdiv_levels = 0
assert bpy.ops.cd.add_garment(preset=P["preset"], fit=P["fit"], name=gid) == {'FINISHED'}
assert bpy.ops.cd.sew() == {'FINISHED'}
if P.get("relax", True):
    assert bpy.ops.cd.relax() == {'FINISHED'}
assert bpy.ops.cd.finalize() == {'FINISHED'}
g = build.garment_object(ctx, create=False)

def unpose(ob):
    """Moves a mesh sewn on the posed body back to the bind pose: per vertex, the inverse of its own linear blend
    skinning matrix at the fitting pose. Afterwards the armature at rest shows the garment where the bind pose has it,
    and any pose deforms it exactly as it deforms the body."""
    aw = arm.matrix_world; awi = aw.inverted(); ow = ob.matrix_world; owi = ow.inverted()
    skin = {}
    for pb in arm.pose.bones:
        skin[pb.name] = aw @ pb.matrix @ pb.bone.matrix_local.inverted() @ awi
    names = {vg.index: vg.name for vg in ob.vertex_groups}
    worst = 0.0
    for v in ob.data.vertices:
        M = Matrix(((0, 0, 0, 0),) * 4); tot = 0.0
        for g_ in v.groups:
            n = names.get(g_.group)
            if n in skin and g_.weight > 0:
                M = M + skin[n] * g_.weight; tot += g_.weight
        if tot <= 0:
            continue
        M = M * (1.0 / tot)
        world = ow @ v.co
        rest = M.inverted() @ world
        worst = max(worst, (rest - world).length)
        v.co = owi @ rest
    ob.data.update()
    return worst

# Runtime cleanup: keep only the armature modifier; the cloth cage is the final shape.
for md in list(g.modifiers):
    if md.type != 'ARMATURE':
        g.modifiers.remove(md)
for o in list(bpy.data.objects):
    if o.cd.is_pattern:
        bpy.data.objects.remove(o)
src_tris = sum(len(p.vertices) - 2 for p in g.data.polygons)
ctx.view_layer.objects.active = g
for o in ctx.selected_objects:
    o.select_set(False)
g.select_set(True)
target = P.get("target_tris", 2600)
if src_tris > target:
    dec = g.modifiers.new("Decimate", 'DECIMATE')
    dec.ratio = target / src_tris
    dec.use_collapse_triangulate = True
    bpy.ops.object.modifier_move_to_index(modifier="Decimate", index=0)
    bpy.ops.object.modifier_apply(modifier="Decimate")
# UVs (smart projection: solid-color garments; pattern-space UVs are a later improvement).
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.01)
bpy.ops.object.mode_set(mode='OBJECT')
# Weights: only real bones, max 4 influences, normalized.
bones = {b.name for b in arm.data.bones}
for vg in list(g.vertex_groups):
    if vg.name not in bones:
        g.vertex_groups.remove(vg)
C.limit_and_normalize(g)
moved = unpose(g) if fit_pose.get("arms_down_deg") else 0.0
for pb in arm.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()
mw = g.matrix_world.copy(); g.parent = arm; g.matrix_world = mw
# Coverage per body region at the bind pose: a body vertex is covered when a ray along its normal hits the garment
# within `cover_dist`. Only regions covered almost entirely are hidden in the game (no skin can show through a hole).
from mathutils.bvhtree import BVHTree
dg = bpy.context.evaluated_depsgraph_get()
gbvh = BVHTree.FromObject(g.evaluated_get(dg), dg)
dom = C.dominant_bone_per_face(body)
vreg = {}
for pi, bone in enumerate(dom):
    for vi in body.data.polygons[pi].vertices:
        vreg.setdefault(vi, C.region_of_bone(bone))
cover = {}
bw = body.matrix_world; gwi = g.matrix_world.inverted()
for vi, reg in vreg.items():
    v = body.data.vertices[vi]
    o = gwi @ (bw @ v.co); n = (gwi.to_3x3() @ (bw.to_3x3() @ v.normal)).normalized()
    hit = gbvh.ray_cast(o + n * 0.001, n, P.get("cover_dist", 0.08))
    c = cover.setdefault(reg, [0, 0]); c[1] += 1
    if hit[0] is not None:
        c[0] += 1
coverage = {k: round(c / t, 3) for k, (c, t) in cover.items()}
hides = sorted(k for k, f in coverage.items() if f >= P.get("hide_threshold", 0.97))
unweighted = sum(1 for v in g.data.vertices if not any(x.weight > 1e-4 for x in v.groups))
# Materials, one per color region (all faces on the first region for single-region garments).
g.data.materials.clear()
for cr in P["color_regions"]:
    mat = bpy.data.materials.new(cr["materials"][0]); mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    h = cr["default"].lstrip("#")
    bsdf.inputs["Base Color"].default_value = (int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255, 1)
    bsdf.inputs["Roughness"].default_value = 0.85
    mat.use_backface_culling = False
    g.data.materials.append(mat)
g.name = "Garment_" + gid
tris = sum(len(p.vertices) - 2 for p in g.data.polygons)
os.makedirs(src_dir, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(src_dir, "%s__%s.blend" % (gid, body_id)), compress=True)

out = os.path.join(repo, "public/assets/characters/modular/garments/%s__%s.glb" % (gid, body_id))
for o in list(bpy.data.objects):
    if o not in (g, arm):
        o.hide_set(True)
C.export_glb(out, [arm, g], morphs=False)
report.update({"garment": gid, "src_tris": src_tris, "tris": tris, "verts": len(g.data.vertices), "unweighted": unweighted, "unposed_max_move": round(moved, 4), "coverage": coverage, "hides": hides, "fit_pose": fit_pose,
               "secs": round(time.time() - t0, 1), "glb": os.path.relpath(out, repo), "kw": kw})
C.write_json(os.path.join(src_dir, "build_%s.json" % body_id), report)
print("GARMENT", json.dumps(report))
