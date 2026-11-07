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

# Larger armholes for muscular arms (see opensew_adapter.widen_armhole); `armhole` in params / per_body.
if P.get("armhole"):
    opensew_adapter.widen_armhole(library, P["armhole"].get("depth_extra", 0.0), P["armhole"].get("scye_max", 0.05))
    report["draft"] = {k: (round(v, 4) if isinstance(v, float) else v) for k, v in library._draft_top(m, P["fit"]).items()}
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


def rebind(ob, reach=0.25, smooth=2):
    """Weights from the body under each garment vertex, replacing OpenSew's nearest-surface transfer.

    Nearest-surface picks the torso for the underside of a loose sleeve (with the arms lowered, the side of the chest
    is closer than the arm the sleeve is around), so the sleeve stays behind when the arm moves. Here a ray goes from
    the vertex inward - along its normal, oriented away from the nearest body point - and the weights are the
    barycentric blend of the body triangle it hits (posed body, fitting pose). No hit within `reach`: nearest point.
    """
    from mathutils.bvhtree import BVHTree
    from mathutils.geometry import barycentric_transform
    dg = bpy.context.evaluated_depsgraph_get()
    be = body.evaluated_get(dg)
    me = be.to_mesh()
    bw = body.matrix_world
    pts = [bw @ v.co for v in me.vertices]
    me.calc_loop_triangles()
    tris = [tuple(t.vertices) for t in me.loop_triangles]
    be.to_mesh_clear()
    bvh = BVHTree.FromPolygons(pts, tris)
    bnames = {vg.index: vg.name for vg in body.vertex_groups}
    bw_ = [{bnames[x.group]: x.weight for x in v.groups if x.weight > 0 and bnames.get(x.group) in bones} for v in body.data.vertices]
    ow = ob.matrix_world; on = ow.to_3x3().inverted().transposed()
    out = []
    rays = 0
    for v in ob.data.vertices:
        p = ow @ v.co
        n = (on @ v.normal).normalized()
        loc, _, ti, dist = bvh.find_nearest(p)
        if n.dot(p - loc) < 0:
            n = -n
        hit = bvh.ray_cast(p, -n, reach)
        if hit[0] is not None:
            loc, ti = hit[0], hit[2]
            rays += 1
        a, b, c = tris[ti]
        # barycentric coordinates of loc in triangle (a, b, c)
        w = barycentric_transform(loc, pts[a], pts[b], pts[c], Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
        wa, wb, wc = (max(0.0, x) for x in w)
        t = (wa + wb + wc) or 1.0
        acc = {}
        for k, f in ((a, wa / t), (b, wb / t), (c, wc / t)):
            for name, x in bw_[k].items():
                acc[name] = acc.get(name, 0.0) + x * f
        out.append(acc)
    # Smooth across mesh edges (`smooth` passes, half way to the neighbours' mean), so triangles that hit different
    # body parts blend instead of tearing.
    nbr = [[] for _ in ob.data.vertices]
    for e in ob.data.edges:
        i, j = e.vertices
        nbr[i].append(j); nbr[j].append(i)
    for _ in range(smooth):
        nxt = []
        for i, acc in enumerate(out):
            if not nbr[i]:
                nxt.append(acc); continue
            mean = {}
            for j in nbr[i]:
                for name, x in out[j].items():
                    mean[name] = mean.get(name, 0.0) + x / len(nbr[i])
            keys = set(acc) | set(mean)
            nxt.append({k: 0.5 * acc.get(k, 0.0) + 0.5 * mean.get(k, 0.0) for k in keys})
        out = nxt
    for vg in list(ob.vertex_groups):
        ob.vertex_groups.remove(vg)
    groups = {}
    for i, acc in enumerate(out):
        for name, x in acc.items():
            if x <= 1e-4:
                continue
            if name not in groups:
                groups[name] = ob.vertex_groups.new(name=name)
            groups[name].add([i], x, 'REPLACE')
    return rays


if P.get("rebind", True):
    ray_hits = rebind(g, smooth=P.get("weight_smooth", 2))
    report["rebind_ray_hits"] = ray_hits
C.limit_and_normalize(g)
moved = unpose(g) if fit_pose.get("arms_down_deg") else 0.0
for pb in arm.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()


def conform(ob, offset=0.006, smooth=3):
    """Bind pose: no garment vertex inside or within `offset` of the skin. Each pass smooths the shell half way to
    its neighbours' mean (irons out bunched seams) and then pushes every vertex that ended up too close back out
    along the skin normal. Fixes a deltoid or chest poking through a sleeve cap. Returns the vertices pushed out."""
    from mathutils.bvhtree import BVHTree
    dg = bpy.context.evaluated_depsgraph_get()
    be = body.evaluated_get(dg); me = be.to_mesh(); bw = body.matrix_world
    pts = [bw @ v.co for v in me.vertices]
    me.calc_loop_triangles(); tris = [tuple(t.vertices) for t in me.loop_triangles]
    be.to_mesh_clear()
    bvh = BVHTree.FromPolygons(pts, tris)
    ow = ob.matrix_world; owi = ow.inverted()
    P_ = [ow @ v.co for v in ob.data.vertices]
    nbr = [[] for _ in P_]
    for e in ob.data.edges:
        i, j = e.vertices; nbr[i].append(j); nbr[j].append(i)
    def push():
        n_pushed = 0
        for i, p in enumerate(P_):
            loc, nrm, _, _ = bvh.find_nearest(p)
            if loc is None:
                continue
            d = (p - loc).dot(nrm)
            if d < offset:
                P_[i] = loc + nrm * offset + (p - loc - nrm * (p - loc).dot(nrm))
                n_pushed += 1
        return n_pushed
    pushed = push()
    for _ in range(smooth):
        P_[:] = [p * 0.5 + sum((P_[j] for j in nb), Vector()) * (0.5 / len(nb)) if nb else p for p, nb in zip(P_, nbr)]
        pushed = max(pushed, push())
    for v, p in zip(ob.data.vertices, P_):
        v.co = owi @ p
    ob.data.update()
    return pushed


def shell_finish(ob, lo=0.006, hi=0.025, k=0.015, smooth=3):
    """Hybrid finish (`finish: {"mode": "shell"}`): OpenSew-2 designs the garment - cut, neckline, hem, sleeve
    length, ease and folds - and this pass makes it behave like a game garment. At the bind pose every vertex is set
    over the skin point nearest to it, at a height mapped from its own height d: lo + (hi - lo) * (1 - exp(-d / k)).
    The map keeps the order of stacked folds but never lets cloth sink into the skin or flap more than `hi` away.
    Weights are the body's, blended barycentrically at that skin point: with the arms out (T-pose) a sleeve is nearest
    to the arm, so it follows the arm exactly. `smooth` passes then iron out the sewn seams, re-projecting each time.
    Returns (max height before, mean height after)."""
    import math as _m
    from mathutils.bvhtree import BVHTree
    from mathutils.geometry import barycentric_transform
    dg = bpy.context.evaluated_depsgraph_get()
    be = body.evaluated_get(dg); me = be.to_mesh(); bw = body.matrix_world
    pts = [bw @ v.co for v in me.vertices]
    me.calc_loop_triangles(); tris = [tuple(t.vertices) for t in me.loop_triangles]
    be.to_mesh_clear()
    bvh = BVHTree.FromPolygons(pts, tris)
    bnames = {vg.index: vg.name for vg in body.vertex_groups}
    bwts = [{bnames[x.group]: x.weight for x in v.groups if x.weight > 0 and bnames.get(x.group) in bones} for v in body.data.vertices]
    ow = ob.matrix_world; owi = ow.inverted()
    P_ = [ow @ v.co for v in ob.data.vertices]
    nbr = [[] for _ in P_]
    for e in ob.data.edges:
        i, j = e.vertices; nbr[i].append(j); nbr[j].append(i)
    hmap = lambda d: lo + (hi - lo) * (1.0 - _m.exp(-max(d, 0.0) / k))
    heights = [0.0] * len(P_)
    hits = [None] * len(P_)
    def project(first):
        for i, p in enumerate(P_):
            loc, nrm, ti, _ = bvh.find_nearest(p)
            d = (p - loc).dot(nrm)
            if first:
                heights[i] = hmap(d)
            P_[i] = loc + nrm * heights[i]
            hits[i] = (loc, ti)
    worst = max(((ow @ v.co) - bvh.find_nearest(ow @ v.co)[0]).length for v in ob.data.vertices)
    project(True)
    for _ in range(smooth):
        P_[:] = [p * 0.5 + sum((P_[j] for j in nb), Vector()) * (0.5 / len(nb)) if nb else p for p, nb in zip(P_, nbr)]
        heights[:] = [h * 0.5 + sum(heights[j] for j in nb) * (0.5 / len(nb)) if nb else h for h, nb in zip(heights, nbr)]
        project(False)
    for vg in list(ob.vertex_groups):
        ob.vertex_groups.remove(vg)
    groups = {}
    for i, (loc, ti) in enumerate(hits):
        a_, b_, c_ = tris[ti]
        w = barycentric_transform(loc, pts[a_], pts[b_], pts[c_], Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
        wa, wb, wc = (max(0.0, x) for x in w); t = (wa + wb + wc) or 1.0
        acc = {}
        for kk, f in ((a_, wa / t), (b_, wb / t), (c_, wc / t)):
            for name, x in bwts[kk].items():
                acc[name] = acc.get(name, 0.0) + x * f
        for name, x in acc.items():
            if x <= 1e-4:
                continue
            if name not in groups:
                groups[name] = ob.vertex_groups.new(name=name)
            groups[name].add([i], x, 'REPLACE')
    for v, p in zip(ob.data.vertices, P_):
        v.co = owi @ p
    ob.data.update()
    C.limit_and_normalize(ob)
    return round(worst, 4), round(sum(heights) / max(1, len(heights)), 4)


def body_shell(ob, lo=0.006, hi=0.025, k=0.015, close=3, reach=0.08, smooth=3, tuck=0.002):
    """Hybrid finish (`finish: {"mode": "body"}`): the garment's surface is taken from the body itself.

    OpenSew-2's sewn garment (at the bind pose) decides *where* the garment is and *how loose* it is: a skin vertex
    belongs to the garment when a ray along its normal meets the sewn cloth within `reach` (or the cloth lies just
    under the skin there), and its height above the skin is the ray distance mapped to lo..hi as in shell_finish.
    The selection is closed morphologically (`close` rings grown, then shrunk), so seam gaps the sewing left open -
    the top of the shoulder between sleeve cap and armhole - are filled, and only the largest piece is kept.
    Built from the skin's own triangles and weights, the garment deforms exactly like the body and cannot open
    holes. Its boundary is tucked back down to the skin (`tuck` above it), so no one sees under the hem.
    Returns the new object (the sewn one is removed) and a small report."""
    import math as _m
    import bmesh as _bm
    from mathutils.bvhtree import BVHTree
    dg = bpy.context.evaluated_depsgraph_get()
    gb = BVHTree.FromObject(ob.evaluated_get(dg), dg)
    gw = ob.matrix_world; gwi = gw.inverted()
    bw = body.matrix_world
    skin = {i for i, m in enumerate(body.data.materials) if m and m.name == "M_Skin"} or set(range(len(body.data.materials)))
    me = body.data
    nv = len(me.vertices)
    adj = [[] for _ in range(nv)]
    for e in me.edges:
        a_, b_ = e.vertices; adj[a_].append(b_); adj[b_].append(a_)
    skin_v = set()
    for poly in me.polygons:
        if poly.material_index in skin:
            skin_v.update(poly.vertices)
    hmap = lambda d: lo + (hi - lo) * (1.0 - _m.exp(-max(d, 0.0) / k))
    h = {}
    for vi in skin_v:
        v = me.vertices[vi]
        o = gwi @ (bw @ v.co); n = (gwi.to_3x3() @ (bw.to_3x3() @ v.normal)).normalized()
        hit = gb.ray_cast(o + n * 0.001, n, reach)
        if hit[0] is not None:
            h[vi] = hmap(hit[3]); continue
        back = gb.ray_cast(o + n * 0.001, -n, 0.02)   # cloth slightly inside the skin (a deltoid poking through)
        if back[0] is not None:
            h[vi] = lo
    sel = set(h)
    for _ in range(close):                      # grow ...
        sel |= {j for i in sel for j in adj[i] if j in skin_v}
    for _ in range(close):                      # ... and shrink: gaps narrower than 2 x close rings are filled
        sel = {i for i in sel if all(j in sel for j in adj[i] if j in skin_v)}
    # largest connected piece only
    seen, best = set(), set()
    for s0 in sel:
        if s0 in seen:
            continue
        comp, stack = set(), [s0]
        while stack:
            i = stack.pop()
            if i in comp:
                continue
            comp.add(i); stack.extend(j for j in adj[i] if j in sel and j not in comp)
        seen |= comp
        if len(comp) > len(best):
            best = comp
    sel = best
    # heights for filled vertices: neighbour means, then a few smoothing passes
    for _ in range(close * 2 + 2):
        for i in sel:
            if i not in h:
                hs = [h[j] for j in adj[i] if j in h]
                if hs:
                    h[i] = sum(hs) / len(hs)
    for i in sel:
        h.setdefault(i, lo)
    for _ in range(smooth):
        h = {i: 0.5 * h[i] + 0.5 * (sum(h[j] for j in adj[i] if j in sel) / max(1, sum(1 for j in adj[i] if j in sel))) for i in sel}
    new = body.copy(); new.data = body.data.copy(); new.name = ob.name
    bpy.context.collection.objects.link(new)
    for md in list(new.modifiers):
        if md.type != 'ARMATURE':
            new.modifiers.remove(md)
    bm = _bm.new(); bm.from_mesh(new.data)
    bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    drop = [f for f in bm.faces if f.material_index not in skin or not all(v.index in sel for v in f.verts)]
    _bm.ops.delete(bm, geom=drop, context='FACES')
    base = {}
    for v in bm.verts:
        base[v] = (v.co.copy(), v.normal.copy())
        v.co = v.co + v.normal * h.get(v.index, lo)
    # tuck the boundary back to the skin
    bedges = [e for e in bm.edges if e.is_boundary]
    ret = _bm.ops.extrude_edge_only(bm, edges=bedges)
    new_verts = [x for x in ret["geom"] if isinstance(x, _bm.types.BMVert)]
    # each extruded vertex sits on an edge to the boundary vertex it came from
    for nvx in new_verts:
        src = next((e.other_vert(nvx) for e in nvx.link_edges if e.other_vert(nvx) in base), None)
        if src is not None:
            co, n = base[src]
            nvx.co = co + n * tuck
    bm.normal_update()
    bm.to_mesh(new.data); bm.free()
    for p in new.data.polygons:
        p.material_index = 0
    rep = {"skin_verts_hit": len(h), "verts": len(new.data.vertices), "tris": sum(len(p.vertices) - 2 for p in new.data.polygons),
           "boundary_edges": len(bedges)}
    bpy.data.objects.remove(ob)
    # UVs for the new surface
    for o in bpy.context.selected_objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = new; new.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.01); bpy.ops.object.mode_set(mode='OBJECT')
    C.limit_and_normalize(new)
    return new, rep


fin = P.get("finish") or {}
if fin.get("mode") == "body":
    g, report["body_shell"] = body_shell(g, fin.get("min", 0.006), fin.get("max", 0.025), fin.get("k", 0.015),
                                         fin.get("close", 3), fin.get("reach", 0.08), fin.get("smooth", 3))
if fin.get("mode") == "shell":
    report["shell"] = shell_finish(g, fin.get("min", 0.006), fin.get("max", 0.025), fin.get("k", 0.015), fin.get("smooth", 3))
if P.get("conform"):
    report["conform_pushed"] = conform(g, P["conform"].get("offset", 0.006), P["conform"].get("smooth", 3))
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
