"""Prepares a Quaternius body for the game and for garment/hair fitting.

  blender -b --factory-startup --python prepare_body.py -- --src <body.glb|gltf> --id <body-id>
          --out-glb <runtime.glb> --out-blend <fitting.blend> --out-json <info.json> [--materials <materials.json>]
          [--morphs <morphs.json>]

- Imports the body with its skeleton unchanged (glTF node frames kept as bone frames).
- Drops every animation; the rest pose in the file stays the bind pose (it is never re-applied from a clip).
- Splits the skin into one mesh per body region (by dominant bone weight per face), so the game can hide what a
  garment fully covers. Vertices along a region border are duplicated, so nothing moves and no gaps open.
- Limits influences to 4 per vertex and normalizes them.
- With `--materials`: renames, retextures and trims materials (see `apply_materials`), drops vertex colors and
  extra UV maps, and writes JPEG textures. Without it, materials are exported as imported.
- With `--morphs`: adds face/body shape keys (see morphs.py) before the fitting .blend is saved, so garments built
  on it inherit them.
- Writes the fitting .blend (armature + whole body, for OpenSew-2 and GBH) and the runtime GLB (armature + regions).
"""
import bpy, bmesh, os, sys, hashlib
sys.path.insert(0, os.path.dirname(__file__))
import common as C

a = C.args()


def apply_materials(objs, spec):
    """spec: {source material name: {"name": new name, "base": png path (replaces the base color image),
    "size": max texture edge (px), "normal": false (drop the normal map), "roughness": number (drops a roughness map
    and sets a constant)}}. Images whose file is missing are unlinked (the base characters' glTFs name a few
    `*_png.png` normal maps that are not in the pack)."""
    root = os.path.dirname(os.path.abspath(a["materials"]))
    mats = {m for o in objs if o.type == 'MESH' for m in o.data.materials if m}
    for m in mats:
        cfg = spec.get(m.name, {})
        nt = m.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        for n in list(nt.nodes):
            if n.type != 'TEX_IMAGE' or not n.image:
                continue
            img = n.image
            if not img.packed_file and not os.path.exists(bpy.path.abspath(img.filepath)):
                nt.nodes.remove(n)
        def feeding(socket):
            """Image node behind a BSDF input (directly or through one Normal Map / Separate Color node)."""
            for l in socket.links:
                n = l.from_node
                if n.type == 'TEX_IMAGE':
                    return n, None
                for inp in n.inputs:
                    for l2 in inp.links:
                        if l2.from_node.type == 'TEX_IMAGE':
                            return l2.from_node, n
            return None, None
        base, _ = feeding(bsdf.inputs['Base Color'])
        if cfg.get("base") and base:
            base.image = bpy.data.images.load(os.path.join(root, cfg["base"]) if not os.path.isabs(cfg["base"]) else cfg["base"])
        if cfg.get("normal") is False:
            img, mid = feeding(bsdf.inputs['Normal'])
            for n in (img, mid):
                if n:
                    nt.nodes.remove(n)
        if "roughness" in cfg:
            img, mid = feeding(bsdf.inputs['Roughness'])
            for n in (img, mid):
                if n:
                    nt.nodes.remove(n)
            for l in list(bsdf.inputs['Roughness'].links):
                nt.links.remove(l)
            bsdf.inputs['Roughness'].default_value = cfg["roughness"]
        size = cfg.get("size")
        if size:
            for n in nt.nodes:
                if n.type == 'TEX_IMAGE' and n.image and max(n.image.size) > size:
                    img = n.image.copy() if n.image.users > 1 else n.image
                    img.scale(size, size)
                    n.image = img
        if cfg.get("name"):
            m.name = cfg["name"]
    for o in objs:
        if o.type != 'MESH':
            continue
        me = o.data
        for attr in [c.name for c in me.color_attributes]:
            me.color_attributes.remove(me.color_attributes[attr])
        while len(me.uv_layers) > 1:
            me.uv_layers.remove(me.uv_layers[-1])


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

if a.get("materials"):
    with open(a["materials"]) as f:
        apply_materials(meshes, __import__("json").load(f))

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
morph_report = None
if a.get("morphs"):
    import json as _json, morphs as _morphs
    with open(a["morphs"]) as f:
        morph_report = _morphs.add_morphs(body, arm, _json.load(f))
    print("MORPHS", _json.dumps(morph_report))

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
if morph_report:
    info["morphs"] = morph_report
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
C.export_glb(a["out-glb"], [arm] + region_objs, animations=False, image_format='JPEG' if a.get("materials") else 'AUTO')
C.write_json(a["out-json"], info)
print("PREPARED", info["id"], info["height"], info["regions"])
