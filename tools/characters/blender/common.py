"""Shared helpers for the Hearthside modular-character authoring scripts (Blender 4.5, run headless).

Run every script as:  blender -b --factory-startup --python <script.py> -- <args>
with BLENDER_USER_RESOURCES pointing at the isolated authoring profile (see tools/characters/README.md).
"""
import bpy, json, math, os, sys
from mathutils import Matrix, Vector

# Body regions, keyed by the UAL / Universal Base Characters bone that dominates a face's skin weights.
REGION_OF_BONE = {
    "Head": "head", "neck_01": "neck",
    "spine_03": "chest", "spine_02": "chest", "clavicle_l": "chest", "clavicle_r": "chest",
    "spine_01": "belly", "pelvis": "hips", "root": "hips",
    "upperarm_l": "upperarm_l", "upperarm_r": "upperarm_r",
    "lowerarm_l": "forearm_l", "lowerarm_r": "forearm_r",
    "thigh_l": "thigh_l", "thigh_r": "thigh_r", "calf_l": "calf_l", "calf_r": "calf_r",
    "foot_l": "foot_l", "foot_r": "foot_r", "ball_l": "foot_l", "ball_r": "foot_r", "ball_leaf_l": "foot_l", "ball_leaf_r": "foot_r",
}
REGIONS = ["head", "neck", "chest", "belly", "hips", "upperarm_l", "upperarm_r", "forearm_l", "forearm_r",
           "hand_l", "hand_r", "thigh_l", "thigh_r", "calf_l", "calf_r", "foot_l", "foot_r"]


def region_of_bone(name):
    if name in REGION_OF_BONE:
        return REGION_OF_BONE[name]
    if name.endswith("_l") and any(k in name for k in ("hand", "thumb", "index", "middle", "ring", "pinky")):
        return "hand_l"
    if name.endswith("_r") and any(k in name for k in ("hand", "thumb", "index", "middle", "ring", "pinky")):
        return "hand_r"
    if "leaf" in name:
        return region_of_bone(name.replace("_04_leaf", "_03"))
    return "chest"


def args():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = {}
    i = 0
    while i < len(a):
        if a[i].startswith("--"):
            k = a[i][2:]
            if i + 1 < len(a) and not a[i + 1].startswith("--"):
                out[k] = a[i + 1]; i += 2
            else:
                out[k] = True; i += 1
        else:
            i += 1
    return out


def reset():
    bpy.ops.wm.read_homefile(use_empty=True)


def import_gltf(path):
    """Imports keeping glTF node frames as bone frames (bone_heuristic BLENDER), so an export writes back the
    same joint rest transforms and inverse bind matrices as the source file."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path, bone_heuristic='BLENDER', guess_original_bind_pose=True)
    return [o for o in bpy.data.objects if o not in before]


def armature_of(objs):
    return next(o for o in objs if o.type == 'ARMATURE')


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=1, sort_keys=True)


def export_glb(path, objects, *, animations=False, morphs=True, image_format='AUTO', jpeg_quality=88, vertex_color=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_skins=True,
        export_animations=animations, export_morph=morphs, export_morph_normal=False,
        export_yup=True, export_apply=False, export_texcoords=True, export_normals=True,
        export_materials='EXPORT', export_image_format=image_format, export_jpeg_quality=jpeg_quality,
        export_def_bones=False,
        export_rest_position_armature=True, export_optimize_animation_size=True,
        **({'export_vertex_color': 'ACTIVE'} if vertex_color else {}),      # COLOR_0 from the active colour attribute
    )


def dominant_bone_per_face(mesh_obj):
    """For every polygon: the vertex group with the largest summed weight over its corners."""
    groups = {g.index: g.name for g in mesh_obj.vertex_groups}
    me = mesh_obj.data
    per_vert = []
    for v in me.vertices:
        per_vert.append({groups[g.group]: g.weight for g in v.groups if g.group in groups})
    out = []
    for p in me.polygons:
        acc = {}
        for vi in p.vertices:
            for n, w in per_vert[vi].items():
                acc[n] = acc.get(n, 0.0) + w
        out.append(max(acc, key=acc.get) if acc else "root")
    return out


def limit_and_normalize(mesh_obj, limit=4):
    bpy.context.view_layer.objects.active = mesh_obj
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=limit)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
