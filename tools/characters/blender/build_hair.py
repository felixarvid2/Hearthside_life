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
BEARD = P.get("beard")                          # facial hair: grown on the face skin instead of the scalp
src_dir = os.path.join(repo, "authoring/characters/facial_hair" if BEARD else "authoring/characters/hair", hid)
OUT_DIR = "facial_hair" if BEARD else "hair"
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
if BEARD:
    # Beard areas from the face's own landmarks (morphs.landmarks): mustache, chin, soul patch, jaw, cheeks,
    # sideburns, neck; lips stay clear. Only skin faces of the head and neck.
    import morphs as _MO
    _LM = _MO.landmarks(body, arm)
    nose, chin, menton = _LM["nose"], _LM["chin"], _LM["menton"]
    mouth_z = nose.z - 0.35 * (nose.z - menton.z)
    mouth_y = min(p.y for p in _LM["profile"] if abs(p.z - mouth_z) < 0.004) if any(abs(p.z - mouth_z) < 0.004 for p in _LM["profile"]) else nose.y + 0.02
    skin_mi = {i for i, m in enumerate(body.data.materials) if m and m.name == "M_Skin"}
    cxh = H0.x
    def beard_ok(c):
        x = abs(c.x - cxh)
        if c.y > H0.y + 0.015:
            return False
        lips = x < 0.027 and abs(c.z - mouth_z) < 0.0095 and c.y < mouth_y + 0.02
        if lips:
            return False
        if BEARD.get("mustache") and x < 0.036 and mouth_z + 0.004 < c.z < nose.z - 0.012 and c.y < nose.y + 0.045:
            return True
        if BEARD.get("soul") and x < 0.012 and mouth_z - 0.024 < c.z < mouth_z - 0.008 and c.y < mouth_y + 0.03:
            return True
        if BEARD.get("chin") and x < BEARD.get("chin_w", 0.036) and menton.z - 0.012 < c.z < mouth_z - 0.008 and c.y < H0.y - 0.03:
            return True
        if BEARD.get("jaw") and x >= 0.025 and c.z < mouth_z + 0.012 and c.z > menton.z - 0.02 and c.y < H0.y - 0.005:
            return True
        if BEARD.get("cheeks") and x >= 0.028 and mouth_z + 0.01 <= c.z < nose.z + BEARD.get("cheek_h", -0.004) and c.y < H0.y - 0.01:
            return True
        if BEARD.get("sideburns") and x > 0.055 and mouth_z + 0.01 <= c.z < nose.z + 0.045 and H0.y - 0.04 < c.y < H0.y + 0.015:
            return True
        if BEARD.get("neck") and c.z < menton.z + 0.005 and c.z > menton.z - 0.05 and c.y < H0.y - 0.035:
            return True
        return False
    neck_faces = [f for f in bm.faces if dom[f.index] in ("Head", "neck_01") and f.material_index in skin_mi]
    keep = [f for f in neck_faces if beard_ok(f.calc_center_median())]
else:
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

# Root mask: which part of the scalp grows clumps (mohawk strip, undercut top, full scalp).
RM = P.get("root_mask") or {}
def root_ok(p):
    k = RM.get("kind")
    if k == "mohawk":
        return abs(p.x - H0.x) < RM.get("width", 0.035)
    if k == "undercut":
        return head_h(p) >= RM.get("above", 0.78)
    if k == "sides":                                   # only the sides/back (a horseshoe: receding or monk)
        return head_h(p) <= RM.get("below", 0.85)
    return True
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
    if hit[0] is not None and head_h(hit[0]) >= hairline(hit[0]) and root_ok(hit[0]):
        roots.append((hit[0], hit[1] if hit[1].dot(d) > 0 else -hit[1]))
# Thin to the requested clump count, evenly over the sample order.
step = max(1, len(roots) // max(1, P["clumps"]))
roots = roots[::step][: P["clumps"]]
if BEARD:
    # the face is not reachable by rays from the skull centre: sample the beard faces by area (deterministic)
    roots = []
    areas = [f.calc_area() for f in keep]
    tot = sum(areas) or 1.0
    acc = 0.0
    k = 0
    for f, ar in zip(keep, areas):
        acc += ar / tot * P["clumps"]
        while k < int(acc + 0.5) and k < P["clumps"]:
            cs = [v.co for v in f.verts]
            w1, w2 = ((k * 0.618) % 1.0), ((k * 0.382 + 0.5) % 1.0)
            if w1 + w2 > 1:
                w1, w2 = 1 - w1, 1 - w2
            pt = cs[0] + (cs[1] - cs[0]) * w1 + (cs[-1] - cs[0]) * w2
            roots.append((pt, f.normal.copy()))
            k += 1

part_x = H0.x + P["part_offset"]               # part line along the crown (x = const), offset toward the left (+x)
guides = []

# ---- gathered styles: ponytail, pigtails, buns, braids ---------------------------------------------------------
# P["gathers"]: [{"angle": deg (0 = back, +90 = left), "gather_h": head-space height, "kind": "tail" | "bun" | "braid",
#                 "tail_len", "tail_points", "tail_spread", "tail_out", "gather_out", "walk_seg", "bun_r", "bun_turns",
#                 "braid_w", "braid_twists"}]; P["ponytail"] is one back "tail" gather (Stage C params).
GS = P.get("gathers") or ([dict(P["ponytail"], angle=0, kind="tail")] if P.get("ponytail") else [])
for gt in GS:
    ang = math.radians(gt.get("angle", 0.0))
    gd = Vector((math.sin(ang), math.cos(ang), 0.0))
    gz = H0.z + hz * gt.get("gather_h", 0.55)
    ghit = head_bvh.ray_cast(Vector((H0.x, H0.y, gz)) + gd * 0.4, -gd, 0.6)
    base = ghit[0] if ghit[0] is not None else Vector((H0.x, H0.y, gz)) + gd * 0.1
    gt["_G"] = base + gd * (P["volume"] + gt.get("gather_out", 0.01))
    gt["_d"] = gd


def walk_to(p, G, seg):
    pts = [p.copy()]; q = p.copy()
    for _ in range(60):
        if (G - q).length < seg * 1.2:
            break
        q = on_skull(q + (G - q).normalized() * seg, P["volume"])
        pts.append(q.copy())
    pts.append(G.copy())
    return pts


def keep_out(q, off):
    loc, nn, _, dd = head_bvh.find_nearest(q)
    if loc is not None and dd < off:
        q = loc + (q - loc).normalized() * off
    return q


def gathered_guide(p, idx, gt):
    G, gd = gt["_G"], gt["_d"]
    pts = walk_to(p, G, gt.get("walk_seg", 0.02))
    kind = gt.get("kind", "tail")
    a = idx * 2.399963
    if kind == "bun":
        R = gt.get("bun_r", 0.035); turns = gt.get("bun_turns", 1.6); nb = 10
        c = G + gd * R * 0.8
        u = Vector((0, 0, 1)).cross(gd); u = u.normalized() if u.length > 1e-6 else Vector((1, 0, 0))
        w = gd.cross(u).normalized()
        for k in range(1, nb + 1):
            t = k / nb
            ph = a + turns * 2 * math.pi * t
            rr = R * (1.0 - 0.55 * t)
            pts.append(c + (u * math.cos(ph) + w * math.sin(ph)) * rr + gd * (R * 0.5 * math.sin(math.pi * t)))
        return pts
    n_t = gt.get("tail_points", 7); L = gt.get("tail_len", 0.26)
    if kind == "braid":
        bw = gt.get("braid_w", 0.012); tw = gt.get("braid_twists", 5)
        ph0 = (idx % 3) * 2 * math.pi / 3
        side = Vector((gd.y, -gd.x, 0.0))
        for k in range(1, n_t * 2 + 1):
            t = k / (n_t * 2)
            out = gt.get("tail_out", 0.04) * math.sin(min(1.0, t * 1.6) * math.pi / 2)
            ph = ph0 + tw * 2 * math.pi * t
            taper = 1.0 - 0.5 * t
            q = G + gd * out + Vector((0, 0, -L * t)) + side * (bw * math.sin(ph) * taper) + gd * (bw * 0.5 * math.cos(2 * ph) * taper)
            pts.append(keep_out(q, P["volume"]))
        return pts
    spread = gt.get("tail_spread", 0.02)
    fan = Vector((math.cos(a) * abs(gd.y) + math.sin(a) * 0.3 * abs(gd.x), math.cos(a) * abs(gd.x), math.sin(a) * 0.3)) * spread * (0.4 + 0.6 * ((idx * 0.618) % 1.0))
    for k in range(1, n_t + 1):
        t = k / n_t
        out = gt.get("tail_out", 0.05) * math.sin(min(1.0, t * 1.6) * math.pi / 2)
        q = G + gd * out + Vector((0, 0, -L * t)) + fan * (0.5 + t)
        pts.append(keep_out(q, P["volume"]))
    return pts


FR = P.get("fringe")                       # {"depth": m in front of the skull base the fringe roots start, "to": head-space
                                           # height it falls to (brows ~0.55), "sweep": sideways share, "length": m}
CU = P.get("curl")                         # {"radius": m, "per_m": turns per metre, "from": 0..1 of the length}
WV = P.get("wave")                         # {"amp": m, "per_m": waves per metre}
RAD = P.get("flow") in ("radial", "sphere")  # spikes / afro: clumps grow outwards from the scalp
SPHERE = P.get("sphere_r") if P.get("flow") == "sphere" else None   # afro: every clump ends on one sphere around the skull


def flowing_guide(p, nrm, idx):
    side = 1.0 if p.x >= part_x else -1.0
    pts = [p.copy()]
    q = p.copy()
    L = P["length"] * (1 + P.get("length_jitter", 0.15) * math.sin(idx * 12.9898))
    fringe = FR and p.y < H0.y - FR.get("depth", 0.06) and head_h(p) < hairline(p) + FR.get("band", 0.16)
    if fringe:
        L = FR.get("length", 0.1)
    sc = Vector((H0.x, H0.y + P.get("sphere_back", 0.01), H0.z + hz * P.get("sphere_h", 0.55)))
    if SPHERE:
        L = max(0.015, SPHERE - (p - sc).length)
    seg = L / (P["points"] - 1)
    for k in range(1, P["points"]):
        t = k / (P["points"] - 1)
        off = P["volume"] * (0.35 + 0.65 * t)
        top = max(0.0, head_h(q) - 0.75) / 0.25
        if BEARD:
            flow = Vector((math.copysign(BEARD.get("spread", 0.15), p.x - H0.x), -BEARD.get("forward", 0.35), -1.0))
        elif SPHERE:
            flow = (q - sc).normalized()
        elif RAD:
            flow = nrm.copy() + Vector((0, 0, P.get("radial_up", 0.25)))
        elif fringe:
            flow = Vector((side * FR.get("sweep", 0.3), -0.5, -1.0))
        else:
            # Flow: away from the part and backward over the top; down over the sides and back.
            flow = Vector((side * (0.55 + 0.45 * top), P.get("back_flow", 0.6), -(1 - top) * 1.0 - 0.15))
            if p.y < H0.y - 0.02:                      # roots in front of the ears: swept aside so the face stays clear
                flow.x *= P.get("front_side", 1.0)
            if q.z < H0.z + hz * P.get("fall_below", 0.0) and P.get("gravity", 0) > 0:
                flow = Vector((flow.x * 0.25, flow.y * 0.25, -P["gravity"]))
        q = q + flow.normalized() * seg
        if RAD or BEARD:
            q = on_skull(q, off) if BEARD and head_bvh.find_nearest(q)[3] is not None and head_bvh.find_nearest(q)[3] < 0.02 else keep_out(q, off)
        elif fringe:
            q = on_skull(q, off) if q.z > H0.z + hz * FR.get("to", 0.55) + 0.02 else keep_out(q, off)
        elif q.z > H0.z + hz * P.get("fall_below", -9.0) or P.get("gravity", 0) == 0:
            q = on_skull(q, off)
        else:  # below the skull: keep outside the head/neck by the volume offset
            q = keep_out(q, off)
        if fringe and q.z < H0.z + hz * FR.get("to", 0.55):
            q.z = H0.z + hz * FR.get("to", 0.55)
            pts.append(q.copy())
            break
        if P.get("cut_at") is not None and q.z < H0.z + hz * P["cut_at"]:
            q.z = H0.z + hz * P["cut_at"]          # a blunt cut (bob): every clump ends at the same height
            pts.append(q.copy())
            break
        pts.append(q.copy())
    return pts


def add_curl(pts, idx):
    """Helical (curl) or planar (wave) offsets around each guide, growing from `from` along its length."""
    if not (CU or WV) or len(pts) < 3:
        return pts
    out = [pts[0]]
    arc = 0.0
    total = sum((pts[i + 1] - pts[i]).length for i in range(len(pts) - 1)) or 1.0
    ph0 = idx * 1.7
    for i in range(1, len(pts)):
        arc += (pts[i] - pts[i - 1]).length
        t = arc / total
        d = (pts[i] - pts[i - 1]).normalized()
        u = d.cross(Vector((0, 0, 1)))
        u = u.normalized() if u.length > 1e-6 else Vector((1, 0, 0))
        w = d.cross(u).normalized()
        q = pts[i].copy()
        if CU and t >= CU.get("from", 0.15):
            f = min(1.0, (t - CU.get("from", 0.15)) / 0.2)
            th = ph0 + 2 * math.pi * CU.get("per_m", 30) * arc
            q += (u * math.cos(th) + w * math.sin(th)) * CU.get("radius", 0.012) * f
        if WV:
            q += u * WV.get("amp", 0.01) * math.sin(ph0 + 2 * math.pi * WV.get("per_m", 8) * arc) * min(1.0, t * 2)
        out.append(keep_out(q, P["volume"] * 0.5))
    return out


for p, nrm in roots:
    idx = len(guides)
    if GS:
        if P.get("gather_all", True) or head_h(p) > P.get("gather_above", 0.0):
            ap = math.atan2(p.x - H0.x, p.y - H0.y)     # the root's angle around the head (0 = back, +90 = left)
            gt = min(GS, key=lambda g_: abs(math.remainder(ap - math.radians(g_.get("angle", 0)), 2 * math.pi)))
            pts = gathered_guide(p, idx, gt)
        else:
            pts = flowing_guide(p, nrm, idx)
    else:
        pts = flowing_guide(p, nrm, idx)
    pts = add_curl(pts, idx)
    guides.append([list(map(lambda v: round(v, 5), x)) for x in pts])
for gt in GS:                                   # computed gather points are not design parameters
    gt.pop("_G", None); gt.pop("_d", None)
C.write_json(os.path.join(src_dir, "guides_%s.json" % body_id), {"body": body_id, "params": P, "guides": guides})

if P["clumps"] > 0:
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
else:
    # stubble: no clumps, only the raised skin layer below
    mat = bpy.data.materials.new(P["color_regions"][0]["materials"][0]); mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.8
    mesh_ob = bpy.data.objects.new("Hair_" + hid + "_Mesh", bpy.data.meshes.new("Hair_" + hid)); ctx.collection.objects.link(mesh_ob)
    mesh_ob.data.materials.append(mat)
    src_tris = 0; gbh_mods = []
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
if BEARD:
    # weights and face morphs from the nearest body vertex: the beard moves with the jaw and follows jaw width,
    # chin length, mouth width and weight like the skin it grows on
    from mathutils.kdtree import KDTree
    bmw = body.matrix_world
    kd = KDTree(len(body.data.vertices))
    for v in body.data.vertices:
        kd.insert(bmw @ v.co, v.index)
    kd.balance()
    bnames = {vg.index: vg.name for vg in body.vertex_groups}
    groups = {}
    near = []
    for v in mesh_ob.data.vertices:
        _co, bi, _d = kd.find(mesh_ob.matrix_world @ v.co)
        near.append(bi)
        for g_ in body.data.vertices[bi].groups:
            nme = bnames.get(g_.group)
            if nme is None or g_.weight <= 1e-4:
                continue
            if nme not in groups:
                groups[nme] = mesh_ob.vertex_groups.new(name=nme)
            groups[nme].add([v.index], g_.weight, 'REPLACE')
    keys = body.data.shape_keys
    if keys:
        mesh_ob.shape_key_add(name="Basis", from_mix=False)
        basis = keys.reference_key
        m3 = mesh_ob.matrix_world.inverted().to_3x3() @ bmw.to_3x3()
        for kb in keys.key_blocks:
            if kb == basis:
                continue
            nk = mesh_ob.shape_key_add(name=kb.name, from_mix=False)
            for v, bi in zip(mesh_ob.data.vertices, near):
                nk.data[v.index].co = v.co + m3 @ (kb.data[bi].co - basis.data[bi].co)
    C.limit_and_normalize(mesh_ob)
neck_z = (arm.matrix_world @ arm.pose.bones["neck_01"].head).z
vg_head = mesh_ob.vertex_groups.new(name="Head")
vg_neck = mesh_ob.vertex_groups.new(name="neck_01")
vg_spine = mesh_ob.vertex_groups.new(name="spine_03")
for v in ([] if BEARD else mesh_ob.data.vertices):
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
out = os.path.join(repo, "public/assets/characters/modular/%s/%s__%s.glb" % (OUT_DIR, hid, body_id))
for _vg in list(mesh_ob.vertex_groups):              # empty helper groups (Head/neck/spine when unused)
    if not any(_g.group == _vg.index and _g.weight > 0 for _v in mesh_ob.data.vertices for _g in _v.groups):
        mesh_ob.vertex_groups.remove(_vg)
C.export_glb(out, [arm, mesh_ob], morphs=bool(mesh_ob.data.shape_keys))
report = {"hair": hid, "body": body_id, "roots": len(guides), "src_tris": src_tris, "tris": tris, "verts": len(mesh_ob.data.vertices),
          "z": [round(min(zs), 3), round(max(zs), 3)], "head_base_z": round(H0.z, 3), "inside_head_verts": inside,
          "secs": round(time.time() - t0, 1), "glb": os.path.relpath(out, repo), "gbh_modifiers": [m.node_group.name for m in gbh_mods]}
C.write_json(os.path.join(src_dir, "build_%s.json" % body_id), report)
print("HAIR", json.dumps(report))
