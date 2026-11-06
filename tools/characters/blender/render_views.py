"""Renders inspection views (front, left, back, right; optional pose) of a .blend with a body and parts.
  blender -b --factory-startup --python render_views.py -- --blend X.blend --out out_prefix [--size 512]
         [--pose A_TPose|arms_down|arms_up] [--focus head]
Workbench renderer; Z-up scene, the character faces -Y.
"""
import bpy, os, sys, math
from mathutils import Vector, Euler
sys.path.insert(0, os.path.dirname(__file__))
import common as C
a = C.args()
bpy.ops.wm.open_mainfile(filepath=a["blend"])
scn = bpy.context.scene
size = int(a.get("size", 512))
# Cycles on the CPU: works headless without EGL/GPU (Workbench and EEVEE need EGL).
scn.render.engine = 'CYCLES'
scn.cycles.device = 'CPU'; scn.cycles.samples = int(a.get("samples", 24)); scn.cycles.use_denoising = False
scn.render.resolution_x = size; scn.render.resolution_y = size
scn.render.film_transparent = False
world = bpy.data.worlds.new("W"); scn.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.82, 0.84, 0.88, 1); world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
for name, rot, e in (("Key", (math.radians(50), 0, math.radians(-35)), 3.0), ("Fill", (math.radians(60), 0, math.radians(150)), 1.2)):
    ld = bpy.data.lights.new(name, 'SUN'); ld.energy = e; lo = bpy.data.objects.new(name, ld); lo.rotation_euler = rot; scn.collection.objects.link(lo)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.hide_render = o.hide_get() if o.name.startswith(("Collider",)) else False
        if getattr(o, "cd", None) is not None and getattr(o.cd, "is_pattern", False):
            o.hide_render = True
pose = a.get("pose")
if pose:
    def rot(b, axis, deg):
        pb = arm.pose.bones[b]; pb.rotation_mode = 'XYZ'; e = list(pb.rotation_euler); e["XYZ".index(axis)] += math.radians(deg); pb.rotation_euler = e
    if pose == "fit":
        from mathutils import Matrix
        for b in ("upperarm_l", "upperarm_r"):
            pb = arm.pose.bones[b]; head = pb.head.copy(); sg = 1 if head.x > 0 else -1
            pb.matrix = Matrix.Translation(head) @ Matrix.Rotation(math.radians(float(a.get("deg", 45))) * sg, 4, 'Y') @ Matrix.Translation(-head) @ pb.matrix
            bpy.context.view_layer.update()
    elif pose == "arms_down":
        rot("upperarm_l", a.get("axis", "Z"), float(a.get("deg", 65))); rot("upperarm_r", a.get("axis", "Z"), -float(a.get("deg", 65)))
    elif pose == "arms_up":
        rot("upperarm_l", a.get("axis", "Z"), -float(a.get("deg", 50))); rot("upperarm_r", a.get("axis", "Z"), float(a.get("deg", 50)))
    elif pose == "stride":
        rot("thigh_l", "X", 30); rot("thigh_r", "X", -30); rot("calf_r", "X", 25)
    bpy.context.view_layer.update()
cam_data = bpy.data.cameras.new("Cam"); cam = bpy.data.objects.new("Cam", cam_data); scn.collection.objects.link(cam); scn.camera = cam
cam_data.type = 'ORTHO'
focus = a.get("focus")
if focus == "head":
    center = Vector((0, 0, 1.6)); cam_data.ortho_scale = 0.55
elif focus == "torso":
    center = Vector((0, 0, 1.2)); cam_data.ortho_scale = 1.1
else:
    center = Vector((0, 0, 0.92)); cam_data.ortho_scale = 2.0
views = {"front": (0, -1), "left": (1, 0), "back": (0, 1), "right": (-1, 0)}
for name, (x, y) in views.items():
    cam.location = center + Vector((x * 4, y * 4, 0))
    cam.rotation_euler = (Vector((0, 0, 0)) - Vector((x, y, 0))).to_track_quat('-Z', 'Y').to_euler()
    scn.render.filepath = "%s_%s.png" % (a["out"], name)
    bpy.ops.render.render(write_still=True)
print("RENDERED", a["out"])
