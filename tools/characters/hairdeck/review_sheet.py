"""Review sheet of trial hair GLBs on the body (run by build.py trial on a body's fitting.blend):
  -- OUT.png COLUMNS file.glb ...   one row per COLUMNS files; per file a front, three-quarter and back view."""
import bpy, sys, os
import numpy as np
from mathutils import Vector

a = sys.argv[sys.argv.index("--") + 1:]
out, cols, files = a[0], int(a[1]), a[2:]
body = bpy.data.objects["Body"]; arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
if body.data.shape_keys:
    for kb in body.data.shape_keys.key_blocks:
        kb.value = 0.0
H = arm.matrix_world @ arm.data.bones["Head"].head_local
skin = bpy.data.materials.new("skin"); skin.use_nodes = True; skin.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.8, 0.6, 0.48, 1)
dark = bpy.data.materials.new("dark"); dark.use_nodes = True; dark.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.15, 0.1, 0.08, 1)
for s in body.material_slots:
    s.material = skin if s.material.name == "M_Skin" else dark
hairm = bpy.data.materials.new("hair"); hairm.use_nodes = True
nt = hairm.node_tree; bs = nt.nodes["Principled BSDF"]; bs.inputs["Roughness"].default_value = 0.8
vc = nt.nodes.new("ShaderNodeVertexColor"); mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs[0].default_value = 1.0
mix.inputs[6].default_value = (0.42, 0.24, 0.13, 1); nt.links.new(vc.outputs["Color"], mix.inputs[7]); nt.links.new(mix.outputs[2], bs.inputs["Base Color"])
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE'
W, Hh = 190, 250
sc.render.resolution_x = W; sc.render.resolution_y = Hh
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.85, 0.85, 0.85, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.8
for nm, d, e in (("k", (-1.5, -3, 3), 2.2), ("f", (2, -2.5, 1.5), 0.9), ("b", (0, 3, 2), 1.6)):
    l = bpy.data.lights.new(nm, 'SUN'); l.energy = e; o = bpy.data.objects.new(nm, l); sc.collection.objects.link(o)
    o.rotation_euler = (-Vector(d)).to_track_quat('-Z', 'Y').to_euler()
cam = bpy.data.cameras.new("c"); co = bpy.data.objects.new("c", cam); sc.collection.objects.link(co); sc.camera = co
cam.type = 'ORTHO'; cam.ortho_scale = 0.62
t = Vector((0, 0, H.z + 0.0))
rows = []; row = []
for i, f in enumerate(files):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.type == 'MESH':
            o.data.materials.clear(); o.data.materials.append(hairm)
            for m in list(o.modifiers):
                o.modifiers.remove(m)                     # drawn at rest, not through the imported armature
            o.parent = None
        else:
            o.hide_render = True
    tiles = []
    for d in ((0, -1, 0.08), (0.75, -0.66, 0.08), (0, 1, 0.08)):
        co.location = t + Vector(d) * 3; co.rotation_euler = (t - co.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = out + "_t.png"; bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(sc.render.filepath); tiles.append(np.array(im.pixels[:], dtype=np.float32).reshape(Hh, W, 4)); bpy.data.images.remove(im)
    for o in new:
        bpy.data.objects.remove(o)
    row.append(np.concatenate(tiles, axis=1))
    if len(row) == cols or i == len(files) - 1:
        while len(row) < cols:
            row.append(np.ones_like(row[0]))
        rows.append(np.concatenate(row, axis=1)); row = []
sheet = np.concatenate(rows[::-1], axis=0)
o = bpy.data.images.new("sheet", sheet.shape[1], sheet.shape[0]); o.pixels = sheet.ravel(); o.filepath_raw = out; o.file_format = 'PNG'; o.save()
os.remove(out + "_t.png")
print("SHEET", out)
