"""Test fixture: a simple skinned 'shell top' (chest + belly faces pushed out 1.5 cm) on a prepared body.
Used only by the unit tests of the modular runtime (tests/fixtures/modular/); not a catalog garment.
  blender -b --factory-startup --python make_fixture_shell.py -- --blend <fitting.blend> --out <shell.glb>
"""
import bpy, bmesh, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import common as C
a = C.args()
bpy.ops.wm.open_mainfile(filepath=a["blend"])
body = bpy.data.objects["Body"]
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
dom = C.dominant_bone_per_face(body)
keep = {i for i, b in enumerate(dom) if C.region_of_bone(b) in ("chest", "belly")}
bm = bmesh.new(); bm.from_mesh(body.data)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES')
bm.normal_update()
for v in bm.verts:
    v.co += v.normal * 0.015
bm.to_mesh(body.data); bm.free()
body.name = "Shell"
mat = bpy.data.materials.new("M_Fabric"); mat.use_nodes = True
body.data.materials.clear(); body.data.materials.append(mat)
C.export_glb(a["out"], [arm, body])
print("FIXTURE", a["out"], len(body.data.polygons))
