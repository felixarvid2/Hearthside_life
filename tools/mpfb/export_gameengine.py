"""Route (a) reference: the same human exported straight from MPFB with the game_engine rig (Blender's glTF exporter).

  blender -b --factory-startup -P tools/mpfb/export_gameengine.py -- --sex f --out dev/mpfb/out

Only for the size / rig-name comparison in the report; the game uses the retargeted bodies of build_body.py.
"""
import argparse
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mpfb_common import enable_mpfb, mp, script_args  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--sex", choices=["f", "m"], required=True)
ap.add_argument("--out", required=True)
args = ap.parse_args(script_args())
enable_mpfb()
HumanService = mp("mpfb.services.humanservice", "HumanService")
AssetService = mp("mpfb.services.assetservice", "AssetService")
ExportService = mp("mpfb.services.exportservice", "ExportService")
ObjectService = mp("mpfb.services.objectservice", "ObjectService")
TargetService = mp("mpfb.services.targetservice", "TargetService")

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
macro = TargetService.get_default_macro_info_dict()
macro["gender"] = 0.0 if args.sex == "f" else 1.0
human = HumanService.create_human(macro_detail_dict=macro)
HumanService.set_character_skin(AssetService.find_asset_absolute_path("bobby_03_young_female_hairless.mhmat", asset_subdir="skins"), human, skin_type="GAMEENGINE")
HumanService.add_builtin_rig(human, "game_engine")
assets = [("eyes", "low-poly.mhclo", "Eyes"), ("eyebrows", "eyebrow001.mhclo", "Eyebrows"), ("eyelashes", "eyelashes01.mhclo", "Eyelashes")]
assets += [("clothes", "wolgade_female_panties_01.mhclo", "Clothes"), ("clothes", "wolgade_female_top_01.mhclo", "Clothes")] if args.sex == "f" else [("clothes", "elvs_swimwear_micro_shorts.mhclo", "Clothes")]
for sub, fname, atype in assets:
    HumanService.add_mhclo_asset(AssetService.find_asset_absolute_path(fname, asset_subdir=sub), human, asset_type=atype, material_type="GAMEENGINE", subdiv_levels=0)
root = ExportService.create_character_copy(human, name_suffix="_export")
body = ObjectService.find_object_of_type_amongst_nearest_relatives(root, "Basemesh")
ExportService.bake_modifiers_remove_helpers(body, bake_masks=True, bake_subdiv=True, remove_helpers=True, also_proxy=True)
bpy.ops.object.select_all(action="DESELECT")
root.select_set(True)
for child in ObjectService.get_list_of_children(root):
    child.select_set(True)
bpy.context.view_layer.objects.active = root
path = os.path.join(args.out, "mpfb_%s_gameengine.glb" % args.sex)
bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=False, export_image_format="AUTO")
print("GAMEENGINE_EXPORT", path, os.path.getsize(path), "bytes")
