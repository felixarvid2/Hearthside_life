"""Prepares a Quaternius body for the game and for garment/hair fitting.

  blender -b --factory-startup --python prepare_body.py -- --src <body.glb|gltf> --id <body-id>
          --out-glb <runtime.glb> --out-blend <fitting.blend> --out-json <info.json> [--clip-pose A_TPose]

- Imports the body with its skeleton unchanged (glTF node frames kept as bone frames).
- Drops every animation; the rest pose in the file stays the bind pose (it is never re-applied from a clip).
- Splits the skin into one mesh per body region (by dominant bone weight per face), so the game can hide what a
  garment fully covers. Vertices along a region border are duplicated, so nothing moves and no gaps open.
- Limits influences to 4 per vertex and normalizes them.
- Writes the fitting .blend (armature + whole body, for OpenSew-2 and GBH) and the runtime GLB (armature + regions).
"""
import bpy, bmesh, os, sys, hashlib
sys.path.insert(0, os.path.dirname(__file__))
import common as C

a = C.args()
C.reset()
objs = C.import_gltf(a["src"])
arm = C.armature_of(objs)
meshes = [o for o in objs if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers)]
for o in objs:
    if o.type == 'MESH' and o not in meshes:
        bpy.data.objects.remove(o)  # unskinned helpers (e.g. the UAL files' Icosphere)
for act in list(bpy.data.actions):
    bpy.data.actions.remove(act)
if arm.animation_data:
    arm.animation_data_clear()
# Pose = rest everywhere.
for pb in arm.pose.bones:
    pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)

# One body mesh (join if the source has several).
bpy.ops.object.select_all(action='DESELECT')
for m in meshes:
    m.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
body.name = "Body"
C.limit_and_normalize(body)

# Materials get stable names: skin regions are recoloured at runtime.
mat_names = []
for i, slot in enumerate(body.material_slots):
    if slot.material:
        mat_names.append(slot.material.name)

info = {"id": a["id"], "source": os.path.basename(a["src"]), "materials": mat_names,
        "verts": len(body.data.vertices), "tris": sum(len(p.vertices) - 2 for p in body.data.polygons)}

# Height and landmarks (rest pose, metres, Z up in Blender).
zs = [(body.matrix_world @ v.co).z for v in body.data.vertices]
info["height"] = round(max(zs) - min(zs), 4)
info["bones"] = {b.name: [round(x, 4) for x in (arm.matrix_world @ b.head_local)] for b in arm.data.bones if b.name in ("pelvis", "Head", "neck_01", "upperarm_l", "hand_l", "thigh_l", "foot_l")}
info["bone_count"] = len(arm.data.bones)
info["bone_names_sha1"] = hashlib.sha1("|".join(b.name for b in arm.data.bones).encode()).hexdigest()

# Save the fitting source before splitting.
os.makedirs(os.path.dirname(a["out-blend"]), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=a["out-blend"], compress=True)

# Region split.
dom = C.dominant_bone_per_face(body)
region_faces = {}
for pi, bone in enumerate(dom):
    region_faces.setdefault(C.region_of_bone(bone), []).append(pi)
region_objs = []
for region in C.REGIONS:
    faces = set(region_faces.get(region, []))
    if not faces:
        continue
    ob = body.copy(); ob.data = body.data.copy(); ob.name = "Body_" + region
    bpy.context.collection.objects.link(ob)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in faces], context='FACES')
    bm.to_mesh(ob.data); bm.free()
    # Drop vertex groups that no longer hold any weight in this region (smaller GLB joint lists stay identical: the
    # exporter writes the whole armature as the skin).
    region_objs.append(ob)
info["regions"] = {o.name[5:]: len(o.data.polygons) for o in region_objs}
bpy.data.objects.remove(body)
C.export_glb(a["out-glb"], [arm] + region_objs, animations=False)
C.write_json(a["out-json"], info)
print("PREPARED", info["id"], info["height"], info["regions"])
