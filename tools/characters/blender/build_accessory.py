"""Builds one accessory (hat, glasses, earrings, necklace, watch, belt, bag...) on a prepared body and exports it.

  blender -b --factory-startup --python build_accessory.py -- --params authoring/characters/accessories/<id>/params.json
          --body <body-id> --repo <repo root>

Accessories are small procedural models (no add-on), placed from the body's own landmarks (eyes, ears, skull, neck,
wrist, waist) and skinned to the bone they ride on. Each vertex also copies the face/body morph deltas of the nearest
body vertex within reach, so a belt follows the weight morph and glasses follow the face.

params: {"id", "label", "slot", "kind", "color_regions": [main, (second)], "bone": optional override, kind-specific
values (see BUILDERS)}. Second colour region = lenses, stones, pendant, buckle, brim band, depending on the kind.
"""
import bpy, bmesh, os, sys, json, math, time
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
sys.path.insert(0, os.path.dirname(__file__))
import common as C
import morphs as MO

a = C.args()
repo = a.get("repo", os.getcwd())
P = json.load(open(a["params"]))
body_id = a["body"]
aid = P["id"]
src_dir = os.path.join(repo, "authoring/characters/accessories", aid)
t0 = time.time()
bpy.ops.wm.open_mainfile(filepath=os.path.join(repo, "authoring/characters/bodies", body_id, "fitting.blend"))
ctx = bpy.context
body = bpy.data.objects["Body"]
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
AW = arm.matrix_world
bone = lambda n: AW @ arm.data.bones[n].head_local
bw = body.matrix_world
bm_body = bmesh.new(); bm_body.from_mesh(body.data); bm_body.transform(bw)
BVH = BVHTree.FromBMesh(bm_body)
H0 = bone("Head")
LMK = MO.landmarks(body, arm)
NOSE, MENTON = LMK["nose"], LMK["menton"]
mats = {i: m.name for i, m in enumerate(body.data.materials) if m}
eye_mi = {i for i, n in mats.items() if n == "M_Eyes"}
eye_pts = [bw @ body.data.vertices[i].co for poly in body.data.polygons if poly.material_index in eye_mi for i in poly.vertices]
EYES = {}
for s, sgn in (("l", 1), ("r", -1)):
    pts = [p for p in eye_pts if (p.x - H0.x) * sgn > 0]
    EYES[s] = sum(pts, Vector()) / len(pts) if pts else Vector((H0.x + 0.032 * sgn, NOSE.y + 0.03, NOSE.z + 0.035))
dom = C.dominant_bone_per_face(body)
head_pts = [bw @ v.co for poly, b in zip(body.data.polygons, dom) if b == "Head" for v in (body.data.vertices[i] for i in poly.vertices)]
TOP = max(p.z for p in head_pts)
# ears: the head's widest points around the eye-to-mouth height
ear_band = [p for p in head_pts if NOSE.z - 0.03 < p.z < EYES["l"].z + 0.01 and p.y > NOSE.y + 0.06]
EARS = {s: (max if s == "l" else min)(ear_band, key=lambda p: p.x) for s in "lr"}
LOBE = {s: min((p for p in head_pts if abs(p.x - EARS[s].x) < 0.012 and abs(p.y - EARS[s].y) < 0.02), key=lambda p: p.z) for s in "lr"}

bm = bmesh.new()
uv_l = bm.loops.layers.uv.verify()
VBONE = {}      # vertex -> {bone: weight}
VMAT = {}


def ray_r(c, d, maxr=0.5):
    """Distance from c to the body surface along d (outside-in: the outermost hit)."""
    hit = BVH.ray_cast(c + d * maxr, -d, maxr)
    return (hit[0] - c).length if hit[0] is not None else None


def ring(center, axis, ref, n, offset, rmin=0.01):
    """Points around `center` in the plane normal to `axis`, `offset` outside the body surface."""
    axis = axis.normalized(); u = (ref - axis * ref.dot(axis)).normalized(); w = axis.cross(u)
    out = []
    for i in range(n):
        t = 2 * math.pi * i / n
        d = u * math.cos(t) + w * math.sin(t)
        r = ray_r(center, d)
        out.append(center + d * (max(rmin, r if r is not None else rmin) + offset))
    return out


def tube(path, radius, closed=True, sides=8, weights=None, mat=0, flat=1.0):
    """A tube along `path` (list of points). Returns the verts."""
    n = len(path)
    rings = []
    for i, p in enumerate(path):
        a_ = path[(i - 1) % n] if closed or i > 0 else path[i]
        b_ = path[(i + 1) % n] if closed or i < n - 1 else path[i]
        t = (b_ - a_).normalized()
        u = t.cross(Vector((0, 0, 1)))
        if u.length < 1e-4:
            u = t.cross(Vector((0, 1, 0)))
        u.normalize(); w = t.cross(u).normalized()
        rr = []
        for k in range(sides):
            th = 2 * math.pi * k / sides
            v = bm.verts.new(p + u * math.cos(th) * radius + w * math.sin(th) * radius * flat)
            VBONE[v] = weights(p) if callable(weights) else (weights or {})
            rr.append(v)
        rings.append(rr)
    segs = n if closed else n - 1
    for i in range(segs):
        A, B = rings[i], rings[(i + 1) % n]
        for k in range(sides):
            f = bm.faces.new((A[k], A[(k + 1) % sides], B[(k + 1) % sides], B[k]))
            f.material_index = mat
            for li, lp in enumerate(f.loops):
                lp[uv_l].uv = ((i + (li in (1, 2))) / max(1, segs), (k + (li in (2, 3))) / sides)
    if not closed:
        for rr, rev in ((rings[0], True), (rings[-1], False)):
            f = bm.faces.new(list(reversed(rr)) if rev else rr); f.material_index = mat
    return [v for rr in rings for v in rr]


def box(center, size, rot=Matrix.Identity(3), weights=None, mat=0, bevel=0.0):
    ret = bmesh.ops.create_cube(bm, size=1.0)
    vs = ret["verts"]
    for v in vs:
        v.co = center + rot @ Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        VBONE[v] = weights or {}
    for f in {f for v in vs for f in v.link_faces}:
        f.material_index = mat
    return vs


def sphere(center, r, weights=None, mat=0, seg=10, squash=(1, 1, 1)):
    ret = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(4, seg // 2), radius=r)
    for v in ret["verts"]:
        v.co = center + Vector((v.co.x * squash[0], v.co.y * squash[1], v.co.z * squash[2]))
        VBONE[v] = weights or {}
    for f in {f for v in ret["verts"] for f in v.link_faces}:
        f.material_index = mat
    return ret["verts"]


def dome(h_from, offset, weights, mat=0, seg=24, rows=7, squash_front=1.0):
    """A cap over the skull from head height `h_from` (0 skull base .. 1 crown) up, `offset` off the head."""
    hz = TOP - H0.z
    c = Vector((H0.x, H0.y - 0.01, H0.z + hz * 0.45))
    rows_v = []
    for r in range(rows):
        el = math.radians(-5 + 90 * r / (rows - 1)) if r < rows - 1 else math.radians(89)
        zrow = []
        for i in range(seg):
            th = 2 * math.pi * i / seg
            d = Vector((math.sin(th) * math.cos(el), -math.cos(th) * math.cos(el), math.sin(el)))
            rr = ray_r(c, d) or 0.09
            p = c + d * (rr + offset)
            zrow.append(p)
        rows_v.append(zrow)
    # bottom edge at h_from: rows below are lifted to that height
    zb = H0.z + hz * h_from
    out_rows = []
    for zrow in rows_v:
        vr = []
        for p in zrow:
            if p.z < zb:
                p = Vector((p.x, p.y, zb))
            v = bm.verts.new(p); VBONE[v] = weights; vr.append(v)
        out_rows.append(vr)
    for r in range(rows - 1):
        A, B = out_rows[r], out_rows[r + 1]
        for i in range(seg):
            f = bm.faces.new((A[i], A[(i + 1) % seg], B[(i + 1) % seg], B[i])); f.material_index = mat
    top = bm.verts.new(c + Vector((0, 0, (ray_r(c, Vector((0, 0, 1))) or 0.1) + offset))); VBONE[top] = weights
    for i in range(seg):
        f = bm.faces.new((out_rows[-1][i], out_rows[-1][(i + 1) % seg], top)); f.material_index = mat
    return out_rows


def brim(edge_row, width_front, width_back, droop=0.0, weights=None, mat=0, thick=0.004):
    """A brim from a dome's bottom row outwards (front = -Y)."""
    c = sum((v.co for v in edge_row), Vector()) / len(edge_row)
    outer = []
    for v in edge_row:
        d = Vector((v.co.x - c.x, v.co.y - c.y, 0)).normalized()
        front = max(0.0, -d.y)
        w = width_back + (width_front - width_back) * front
        nv = bm.verts.new(v.co + d * w + Vector((0, 0, -droop * w / max(1e-3, width_front)))); VBONE[nv] = weights; outer.append(nv)
    n = len(edge_row)
    for i in range(n):
        if (width_front > 0 or width_back > 0):
            f = bm.faces.new((edge_row[i], outer[i], outer[(i + 1) % n], edge_row[(i + 1) % n])); f.material_index = mat
    # underside a few mm lower so it reads from below
    under = []
    for v in outer + list(edge_row):
        pass
    return outer


HEADW = {"Head": 1.0}


def build():
    k = P["kind"]
    if k in ("glasses", "sunglasses"):
        shape = P.get("shape", "round")
        rw, rh = P.get("lens_w", 0.024), P.get("lens_h", 0.019)
        off = P.get("forward", 0.019)
        for s in "lr":
            e = EYES[s] + Vector((0, -off, P.get("raise", 0.0) + 0.004))
            pts = []
            n = 16
            for i in range(n):
                t = 2 * math.pi * i / n
                cx, cz = math.cos(t), math.sin(t)
                if shape == "square":
                    m = max(abs(cx), abs(cz)); cx, cz = cx / m * 0.92, cz / m * 0.92
                elif shape == "aviator":
                    cz = cz * (1.0 if cz > 0 else 1.35)
                pts.append(e + Vector((cx * rw, 0, cz * rh)))
            tube(pts, P.get("frame", 0.0028), True, 6, HEADW, 0)
            if k == "sunglasses":
                c = bm.verts.new(e); VBONE[c] = HEADW
                rv = []
                for p in pts:
                    v = bm.verts.new(p + Vector((0, 0.001, 0))); VBONE[v] = HEADW; rv.append(v)
                for i in range(len(rv)):
                    f = bm.faces.new((c, rv[i], rv[(i + 1) % len(rv)])); f.material_index = 1
            # temple arm back to the ear
            ear = EARS[s] + Vector((0, 0.0, 0.004))
            start = e + Vector(((rw if s == "l" else -rw), 0, 0.004))
            tube([start, start + (ear - start) * 0.5 + Vector(((0.006 if s == "l" else -0.006), 0, 0)), ear + Vector((0, 0.012, -0.01))],
                 P.get("frame", 0.0028) * 0.9, False, 5, HEADW, 0)
        l, r = EYES["l"] + Vector((-rw, -off, 0.004)), EYES["r"] + Vector((rw, -off, 0.004))
        mid = (l + r) / 2 + Vector((0, -0.004, 0.003))
        tube([l, mid, r], P.get("frame", 0.0028), False, 5, HEADW, 0)
    elif k in ("cap", "beanie", "fedora", "sun_hat", "bucket_hat", "beret", "headband"):
        if k == "headband":
            hz = TOP - H0.z
            c = Vector((H0.x, H0.y - 0.005, H0.z + hz * P.get("height", 0.72)))
            pts = ring(c, Vector((0, 0, 1)), Vector((0, -1, 0)), 28, P.get("hair_room", 0.012))
            tube(pts, P.get("band", 0.007), True, 6, HEADW, 0, flat=P.get("flat", 2.2))
        elif k == "beret":
            rows = dome(0.78, P.get("hair_room", 0.016), HEADW, 0, 24, 5)
            brim(rows[0], 0.03, 0.03, -0.004, HEADW, 0)
        else:
            room = P.get("hair_room", 0.014)
            rows = dome(P.get("from", 0.62), room, HEADW, 0, 28, 7)
            if k == "cap":
                brim(rows[0], 0.07, 0.0, 0.02, HEADW, 1 if len(P["color_regions"]) > 1 else 0)
            elif k == "fedora":
                brim(rows[0], 0.05, 0.045, -0.01, HEADW, 0)
                band = [v.co + Vector((0, 0, 0.012)) for v in rows[0]]
                tube(band, 0.006, True, 5, HEADW, 1 if len(P["color_regions"]) > 1 else 0, flat=2.5)
            elif k == "sun_hat":
                brim(rows[0], 0.11, 0.1, 0.03, HEADW, 0)
            elif k == "bucket_hat":
                brim(rows[0], 0.045, 0.045, 0.03, HEADW, 0)
            # beanie: a cuff ring
            if k == "beanie":
                tube([v.co for v in rows[0]], 0.009, True, 6, HEADW, 0, flat=2.0)
    elif k in ("earrings_stud", "earrings_hoop", "earrings_drop"):
        for s in "lr":
            lb = LOBE[s] + Vector(((0.002 if s == "l" else -0.002), 0, 0.003))
            if k == "earrings_stud":
                sphere(lb, 0.0035, HEADW, 0, 8)
            elif k == "earrings_hoop":
                R = P.get("radius", 0.011)
                pts = [lb + Vector((0, math.sin(2 * math.pi * i / 14) * R, -R + math.cos(2 * math.pi * i / 14) * R)) for i in range(14)]
                tube(pts, 0.0012, True, 5, HEADW, 0)
            else:
                tube([lb, lb + Vector((0, 0, -0.012))], 0.0008, False, 4, HEADW, 0)
                sphere(lb + Vector((0, 0, -0.016)), 0.0045, HEADW, 1 if len(P["color_regions"]) > 1 else 0, 8, (1, 1, 1.4))
    elif k in ("necklace", "pendant", "choker", "pearls", "scarf"):
        n0, h = bone("neck_01"), bone("Head")
        hgt = P.get("height", 0.1)                       # 0 = neck base .. 1 = skull base
        c = n0 + (h - n0) * hgt
        axis = (h - n0).normalized()
        nb = {"neck_01": 1.0} if hgt > 0.2 else {"neck_01": 0.5, "spine_03": 0.5}
        pts = ring(c, axis, Vector((0, -1, 0)), 28, P.get("room", 0.006))
        if k == "scarf":
            pts = ring(c, axis, Vector((0, -1, 0)), 28, 0.018)
            tube(pts, 0.016, True, 8, nb, 0, flat=1.3)
            f = min(pts, key=lambda p: p.y)
            for sx in (-0.02, 0.025):
                tube([f + Vector((sx, -0.01, -0.01)), f + Vector((sx * 1.2, -0.03, -0.12)), f + Vector((sx * 1.3, -0.035, -0.22))],
                     0.022, False, 6, {"spine_03": 1.0}, 0, flat=0.3)
        elif k == "pearls":
            for p in pts[::2]:
                sphere(p, 0.0045, nb, 0, 8)
        else:
            # chains hang lower in front
            front = min(pts, key=lambda p: p.y)
            sag = P.get("sag", 0.0)
            pts2 = [p + Vector((0, 0, -sag * max(0.0, (front.y + 0.06 - p.y) / 0.06))) for p in pts]
            tube(pts2, 0.0018 if k != "choker" else 0.005, True, 5, nb, 0, flat=1.0 if k != "choker" else 2.2)
            if k == "pendant":
                lo = min(pts2, key=lambda p: p.z)
                sphere(lo + Vector((0, -0.004, -0.012)), 0.007, nb, 1 if len(P["color_regions"]) > 1 else 0, 8, (1, 0.5, 1.3))
    elif k in ("tie", "bow_tie"):
        n0 = bone("neck_01")
        r = ray_r(n0, Vector((0, -1, 0))) or 0.06
        knot = n0 + Vector((0, -r - 0.012, -0.01))
        if k == "bow_tie":
            box(knot, (0.012, 0.012, 0.012), weights={"neck_01": 1.0})
            for sx in (-1, 1):
                box(knot + Vector((sx * 0.025, 0.002, 0)), (0.02, 0.008, 0.016), weights={"neck_01": 1.0})
        else:
            box(knot, (0.01, 0.01, 0.012), weights={"neck_01": 1.0})
            pts = []
            for i in range(6):
                z = knot.z - 0.015 - i * 0.07
                rr = ray_r(Vector((H0.x, n0.y, z)), Vector((0, -1, 0))) or 0.12
                pts.append(Vector((H0.x, n0.y - rr - 0.02, z)))
            tube(pts, 0.022, False, 4, {"spine_03": 1.0}, 0, flat=0.15)
    elif k in ("watch", "bangle", "cuff", "smartwatch"):
        s = P.get("side", "l")
        w0, f0 = bone("hand_" + s), bone("lowerarm_" + s)
        axis = (w0 - f0).normalized()
        c = w0 - axis * P.get("back", 0.025)
        pts = ring(c, axis, Vector((0, 0, 1)), 18, 0.004)
        wb = {"lowerarm_" + s: 1.0}
        tube(pts, 0.004 if k != "cuff" else 0.011, True, 6, wb, 0, flat=1.0 if k == "bangle" else 0.35)
        if k in ("watch", "smartwatch"):
            top = max(pts, key=lambda p: p.z)
            box(top + Vector((0, 0, 0.003)), (0.016, 0.018 if k == "watch" else 0.022, 0.004), weights=wb,
                mat=1 if len(P["color_regions"]) > 1 else 0)
    elif k in ("belt", "belt_wide"):
        import garment_parts as GP
        zc = bone("spine_01").z + P.get("drop", -0.04)
        c = Vector((bone("pelvis").x, bone("spine_02").y, zc))
        pts = ring(c, Vector((0, 0, 1)), Vector((0, -1, 0)), 32, P.get("room", 0.018))
        bw_ = {"pelvis": 0.5, "spine_01": 0.5}
        tube(pts, 0.016 if k == "belt_wide" else 0.011, True, 4, bw_, 0, flat=0.25)
        f = min(pts, key=lambda p: p.y)
        box(f + Vector((0, -0.004, 0)), (0.02, 0.006, 0.016 if k == "belt" else 0.022), weights=bw_, mat=1 if len(P["color_regions"]) > 1 else 0)
    elif k == "backpack":
        s3 = bone("spine_03")
        r = ray_r(s3, Vector((0, 1, 0))) or 0.12
        c = Vector((H0.x, s3.y + r + 0.036, s3.z - 0.08))
        box(c, (0.16, 0.06, 0.2), weights={"spine_03": 0.6, "spine_02": 0.4})
        for sx in (-0.105, 0.105):
            top = Vector((H0.x + sx, s3.y, s3.z + 0.1))
            rf = ray_r(top, Vector((0, -1, 0))) or 0.1
            rb = ray_r(top, Vector((0, 1, 0))) or 0.1
            zt = (ray_r(Vector((top.x, top.y, top.z - 0.2)), Vector((0, 0, 1)), 0.32) or 0.25) + top.z - 0.2
            path = [c + Vector((sx, -0.03, 0.17)), Vector((top.x, top.y + rb * 0.6, zt + 0.012)),
                    Vector((top.x, top.y - rf * 0.6, zt + 0.006)), Vector((top.x, top.y - rf - 0.01, s3.z - 0.12))]
            tube(path, 0.012, False, 4, {"spine_03": 1.0}, 1 if len(P["color_regions"]) > 1 else 0, flat=0.25)
    elif k == "crossbody":
        s3, pel = bone("spine_03"), bone("pelvis")
        side = Vector((H0.x + 0.17, pel.y - 0.02, pel.z + 0.08))
        box(side, (0.05, 0.11, 0.08), weights={"pelvis": 0.5, "spine_01": 0.5})
        path = []
        for i in range(9):
            t = i / 8
            ang = math.pi * 2 * t
            p = Vector((H0.x + 0.17 * math.cos(ang * 0.5), s3.y, s3.z + 0.14 - t * 0.45))
            path.append(p)
        tube([side + Vector((0, 0, 0.04)), Vector((H0.x + 0.1, s3.y - 0.14, s3.z)), Vector((H0.x - 0.12, s3.y - 0.05, s3.z + 0.17)),
              Vector((H0.x - 0.1, s3.y + 0.12, s3.z + 0.02)), side + Vector((0, 0.05, 0.04))], 0.007, False, 4,
             {"spine_03": 1.0}, 1 if len(P["color_regions"]) > 1 else 0, flat=0.3)
    elif k == "fanny_pack":
        zc = bone("spine_01").z - 0.05
        c = Vector((H0.x, bone("spine_02").y, zc))
        rr = ray_r(c, Vector((0, -1, 0))) or 0.13
        box(c + Vector((0, -rr - 0.03, 0)), (0.13, 0.05, 0.07), weights={"pelvis": 0.5, "spine_01": 0.5})
        tube(ring(c, Vector((0, 0, 1)), Vector((0, -1, 0)), 28, 0.012), 0.009, True, 4, {"pelvis": 0.5, "spine_01": 0.5}, 1 if len(P["color_regions"]) > 1 else 0, flat=0.3)
    else:
        raise SystemExit("unknown accessory kind %s" % k)


build()
bm.normal_update()
me = bpy.data.meshes.new(aid); bm.to_mesh(me)
ob = bpy.data.objects.new("Accessory_" + aid, me); ctx.collection.objects.link(ob)
verts = list(VBONE.items())
# weights (VBONE order follows creation; map by index)
order = {v.index: wts for v, wts in VBONE.items()}
groups = {}
for vi, wts in order.items():
    for nme, w in wts.items():
        if nme not in groups:
            groups[nme] = ob.vertex_groups.new(name=nme)
        groups[nme].add([vi], w, 'REPLACE')
C.limit_and_normalize(ob)
# morph deltas from the nearest body vertex within 6 cm (falls off to none at 10 cm)
keys = body.data.shape_keys
if keys:
    kd = KDTree(len(body.data.vertices))
    for v in body.data.vertices:
        kd.insert(bw @ v.co, v.index)
    kd.balance()
    ob.shape_key_add(name="Basis", from_mix=False)
    basis = keys.reference_key
    near = [kd.find(v.co) for v in ob.data.vertices]
    for kb in keys.key_blocks:
        if kb == basis:
            continue
        nk = ob.shape_key_add(name=kb.name, from_mix=False)
        for v, (_c, bi, dist) in zip(ob.data.vertices, near):
            f = 1.0 if dist < 0.06 else max(0.0, 1 - (dist - 0.06) / 0.04)
            nk.data[v.index].co = v.co + (kb.data[bi].co - basis.data[bi].co) * f
for cr in P["color_regions"]:
    m = bpy.data.materials.new(cr["materials"][0]); m.use_nodes = True
    hx = cr["default"].lstrip("#")
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (int(hx[0:2], 16) / 255, int(hx[2:4], 16) / 255, int(hx[4:6], 16) / 255, 1)
    bsdf.inputs["Roughness"].default_value = cr.get("roughness", 0.5)
    bsdf.inputs["Metallic"].default_value = cr.get("metallic", 0.0)
    me.materials.append(m)
mod = ob.modifiers.new("Armature", 'ARMATURE'); mod.object = arm
ob.parent = arm; ob.matrix_parent_inverse = AW.inverted()
tris = sum(len(p.vertices) - 2 for p in me.polygons)
os.makedirs(src_dir, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(src_dir, "%s__%s.blend" % (aid, body_id)), compress=True)
out = os.path.join(repo, "public/assets/characters/modular/accessories/%s__%s.glb" % (aid, body_id))
for o in list(bpy.data.objects):
    if o not in (ob, arm):
        o.hide_set(True)
C.export_glb(out, [arm, ob], morphs=bool(me.shape_keys))
report = {"accessory": aid, "body": body_id, "kind": P["kind"], "tris": tris, "verts": len(me.vertices), "secs": round(time.time() - t0, 1),
          "glb": os.path.relpath(out, repo)}
C.write_json(os.path.join(src_dir, "build_%s.json" % body_id), report)
print("ACCESSORY", json.dumps(report))
