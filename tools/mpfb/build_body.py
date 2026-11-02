"""Builds one MakeHuman body with MPFB and retargets it onto the game's skeleton (the 65-joint UAL rig).

  blender -b --factory-startup -P tools/mpfb/build_body.py -- --sex f --ual dev/mpfb/out/ual_b.json --out dev/mpfb/out

Writes <out>/mpfb_<sex>.json (manifest) and <out>/mpfb_<sex>.bin (float32 / uint32 arrays); tools/build-mpfb-bodies.mts turns
them into the GLB. What happens here:

 1. MPFB: base human (macro details), game_engine rig with its shipped weights, eyes, eyebrows, eyelashes, underwear
    (all MakeHuman system assets, see "licenses" in the manifest).
 2. Morph targets: each slider is applied to the human, the assets are refitted (MPFB's own mhclo fitting) and the vertex
    positions are recorded; the delta to the neutral human is the glTF morph target.
 3. Retarget: MPFB's rig rests in an A-pose with bent arms, the game's rig is a T-pose with the UAL proportions. For every
    MPFB bone an affine map is built (head to the UAL joint, rotation of the bone's reference vector onto the UAL one,
    scale along it so the child joint lands on the UAL child joint, roll fixed for the hand). The mesh is skinned with
    MPFB's weights (renamed to the UAL joints) through these maps, so every joint of the mesh is exactly on the UAL joint.
    Morph deltas go through the same maps (linear part only), so morphs and skeleton agree.
 4. Face: a few stock MakeHuman targets make the base face softer and friendlier (STYLE), then 14 signed face morphs
    (FACE_MORPHS) are recorded the same way as the body ones.
 5. Male underwear: trunks cut out of the skin mesh itself (offset along the normals), so their morph deltas are the skin's.
 6. Eyes are split in sclera and iris (own UVs), the skin gets a `_LIPS` weight, and the UV masks (covered texels, scalp, lips)
    are written for the node step that neutralises the skin texture.
"""
import argparse
import json
import math
import os
import re
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mpfb_common import enable_mpfb, mp, script_args  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--sex", choices=["f", "m"], required=True)
ap.add_argument("--ual", required=True, help="JSON of the UAL joints (tools/mpfb/dump-skeleton.mjs)")
ap.add_argument("--out", required=True)
ap.add_argument("--no-morphs", action="store_true")
ap.add_argument("--smooth-shoulders", action="store_true", help="smooth the shoulder/armpit weights too (the old behaviour)")
ap.add_argument("--no-face-morphs", action="store_true")
ap.add_argument("--face-amp", type=float, default=1.0, help="overall strength of the face morph targets (they are tuned at 1)")
ap.add_argument("--smooth", type=int, default=5, help="passes of skin weight smoothing over the surface")
ap.add_argument("--stylise", type=float, default=1.0, help="strength of the small cosy-sim face tweaks (0 = plain MakeHuman)")
args = ap.parse_args(script_args())
SEX = args.sex
SMOOTH_PASSES = args.smooth
os.makedirs(args.out, exist_ok=True)

enable_mpfb()
HumanService = mp("mpfb.services.humanservice", "HumanService")
AssetService = mp("mpfb.services.assetservice", "AssetService")
TargetService = mp("mpfb.services.targetservice", "TargetService")
LocationService = mp("mpfb.services.locationservice", "LocationService")
HumanObjectProperties = mp("mpfb.entities.objectproperties", "HumanObjectProperties")

# ---------------------------------------------------------------------------------------------------------------------
# assets used (all from the MakeHuman asset packs; the licence of each is read from the pack JSON at the end)
# ---------------------------------------------------------------------------------------------------------------------
SKIN = "bobby_03_young_female_hairless"  # neutral, no hair cap and no body hair; the game recolours it, so one texture serves both sexes
EYES = ("eyes", "low-poly.mhclo", "Eyes", "brownlight")
BROWS = ("eyebrows", "eyebrow001.mhclo", "Eyebrows")
LASHES = ("eyelashes", "eyelashes01.mhclo", "Eyelashes")
# female: two CC0 MakeHuman assets; male: trunks generated from the skin mesh (make_trunks below, no third-party asset)
UNDERWEAR = [("clothes", "wolgade_female_panties_01.mhclo"), ("clothes", "wolgade_female_top_01.mhclo")] if SEX == "f" else []

# neutral figure: adult, average everything; MakeHuman's default race mix. gender 0 = female, 1 = male
# (MakeHuman age 0.5 = 25 years, 0.56 = about 32)
MACRO = {"gender": 0.0 if SEX == "f" else 1.0, "age": 0.52 if SEX == "f" else 0.56, "muscle": 0.5 if SEX == "f" else 0.76,
         "weight": 0.5 if SEX == "f" else 0.66, "proportions": 0.5, "height": 0.5, "cupsize": 0.5, "firmness": 0.5}

# (morph name, kind, target, value). Macro sliders go from their neutral value to `value`; detail targets are added at `value`.
MORPHS = [
    ("weight_up", "macro", "weight", 1.0), ("weight_down", "macro", "weight", 0.0),
    ("muscle_up", "macro", "muscle", 1.0), ("muscle_down", "macro", "muscle", 0.0),
    ("bust_up", "macro", "cupsize", 1.0), ("bust_down", "macro", "cupsize", 0.0),
    ("waist_wide", "detail", "measure-waist-circ-incr", 1.0),
    ("hips_wide", "detail", "measure-hips-circ-incr", 1.0),
    ("shoulders_wide", "detail", "measure-shoulder-dist-incr", 1.0),
    ("belly_round", "detail", "stomach-pregnant-incr", 1.0),
]
# the slider gain the viewer / game applies to the macro morphs (MakeHuman's weight and muscle ranges are subtle); the underwear clearance holds at it
GAIN = {"weight_up": 3, "weight_down": 3, "muscle_up": 2, "muscle_down": 2}

# Face morphs, signed single morphs (-1..1; a negative value is the mirrored delta): (name, [(target, opposite target or None, weight)]).
# The delta of a morph is (target - opposite) / 2 summed over its list, so +1 and -1 are the two ends of MakeHuman's own slider. A `*-` target
# stands for both sides. Weights are tuned by eye on the face sheet (dev/mpfb/shoot.mjs --only=faces).
FACE_MORPHS = [
    ("face_length", [("head-oval", "head-round", 1.0)]),
    ("face_width", [("head-scale-horiz-incr", "head-scale-horiz-decr", 0.9)]),
    ("face_jaw_width", [("chin-width-incr", "chin-width-decr", 1.6), ("chin-bones-incr", "chin-bones-decr", 1.2)]),
    ("face_chin_length", [("chin-height-incr", "chin-height-decr", 1.0)]),
    ("face_chin_prominence", [("chin-prominent-incr", "chin-prominent-decr", 1.6)]),
    ("face_cheek_fullness", [("*-cheek-volume-incr", "*-cheek-volume-decr", 1.8)]),
    ("face_nose_width", [("nose-scale-horiz-incr", "nose-scale-horiz-decr", 1.2), ("nose-nostrils-width-incr", "nose-nostrils-width-decr", 0.8)]),
    ("face_nose_length", [("nose-scale-vert-incr", "nose-scale-vert-decr", 1.5)]),
    ("face_eye_size", [("*-eye-scale-incr", "*-eye-scale-decr", 1.3)]),
    ("face_eye_spacing", [("*-eye-trans-out", "*-eye-trans-in", 1.8)]),
    ("face_lip_fullness", [("mouth-upperlip-volume-incr", "mouth-upperlip-volume-decr", 1.6), ("mouth-lowerlip-volume-incr", "mouth-lowerlip-volume-decr", 1.6)]),
    ("face_mouth_width", [("mouth-scale-horiz-incr", "mouth-scale-horiz-decr", 1.2)]),
    ("face_brow_height", [("eyebrows-trans-up", "eyebrows-trans-down", 1.4)]),
    ("face_smile", [("mouth-angles-up", "mouth-angles-down", 1.2)]),
]
# Height is deliberately not a morph: the skeleton is fixed, so a taller mesh no longer fits its joints (arms and neck tear).
# A height slider has to scale the character root instead.

# ---------------------------------------------------------------------------------------------------------------------
# UAL skeleton
# ---------------------------------------------------------------------------------------------------------------------
UAL = json.load(open(args.ual))
UAL_NAMES = [j["name"] for j in UAL]
UAL_INDEX = {n: i for i, n in enumerate(UAL_NAMES)}


def gl_to_bl(p):
    return np.array([p[0], -p[2], p[1]], dtype=np.float64)


UAL_POS = {j["name"]: gl_to_bl(j["pos"]) for j in UAL}


def ual_name(bone):
    return {"Root": "root", "head": "Head"}.get(bone, bone)


def ref_child(bone):
    """UAL joint that the bone's tail should reach (None: no such joint)."""
    m = re.match(r"^(index|middle|ring|pinky|thumb)_0([123])_([lr])$", bone)
    if m:
        n = int(m.group(2))
        return "%s_0%d_%s" % (m.group(1), n + 1, m.group(3)) if n != 3 else "%s_04_leaf_%s" % (m.group(1), m.group(3))
    side = bone[-2:] if bone[-2:] in ("_l", "_r") else ""
    base = bone[:-2] if side else bone
    table = {"pelvis": "spine_01", "spine_01": "spine_02", "spine_02": "spine_03", "spine_03": "neck_01", "neck_01": "Head",
             "clavicle": "upperarm", "upperarm": "lowerarm", "lowerarm": "hand", "hand": "middle_01",
             "thigh": "calf", "calf": "foot", "foot": "ball", "ball": "ball_leaf"}
    c = table.get(base)
    return c + side if c else None


# ---------------------------------------------------------------------------------------------------------------------
# build the human
# ---------------------------------------------------------------------------------------------------------------------
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

macro = TargetService.get_default_macro_info_dict()
for k, v in MACRO.items():
    macro[k] = v
human = HumanService.create_human(mask_helpers=False, macro_detail_dict=macro)
human.name = "Human"


def set_macro(name, value):
    HumanObjectProperties.set_value(name, value, entity_reference=human)
    TargetService.reapply_macro_details(human)


def target_path(name):
    """Path of a MakeHuman target by name; `*-` in front stands for both sides (l- and r-); unit expressions: expression/units/<race>/<name>."""
    path = TargetService.target_full_path(name)
    if not path:
        raise RuntimeError("target not found: " + name)
    return path


def detail_shapekeys(name, weight, key_name=None):
    """Adds the target (both sides for a name starting with `*-`) as shape keys of the human; returns them."""
    names = ["l-" + name[2:], "r-" + name[2:]] if name.startswith("*-") else [name]
    keys = [TargetService.load_target(human, target_path(n), weight=weight, name=(key_name or "mpfb_") + n) for n in names]
    for k in keys:  # Blender clamps shape keys to 0..1 unless the slider range is widened
        k.slider_max = max(1.0, weight)
        k.value = weight
    return keys


# cosy-life-sim look on top of plain MakeHuman, stock targets only: bigger eyes, a hint of a smile (mouth corners up), softer cheeks,
# and for the man a more masculine build and face (V-shaped torso, broad shoulders, pectorals, a stronger jaw and brow).
STYLE = {
    "f": [("*-eye-scale-incr", 0.45), ("*-eye-height1-incr", 0.3), ("*-cheek-volume-incr", 0.35), ("head-age-decr", 0.2),
          ("mouth-angles-up", 0.9), ("mouth-upperlip-volume-incr", 0.1), ("mouth-lowerlip-volume-decr", 0.2)],
    "m": [("*-eye-scale-incr", 0.55), ("*-eye-height1-incr", 0.7), ("*-eye-height2-incr", 0.3), ("*-cheek-volume-incr", 0.3), ("mouth-angles-up", 1.0),
          ("mouth-lowerlip-volume-decr", 0.2), ("nose-scale-vert-decr", 0.3), ("nose-scale-depth-decr", 0.2), ("forehead-scale-vert-decr", 0.5),
          ("measure-shoulder-dist-incr", 0.8), ("torso-vshape-incr", 0.9), ("torso-muscle-pectoral-incr", 0.8), ("torso-muscle-dorsi-incr", 0.6),
          ("neck-scale-horiz-incr", 0.4), ("measure-neck-circ-incr", 0.4), ("neck-scale-vert-decr", 0.9), ("chin-width-incr", 0.3),
          ("chin-prominent-incr", 0.2), ("forehead-nubian-incr", 0.3), ("head-rectangular", 0.25),
          ("*-upperarm-shoulder-muscle-incr", 0.9), ("*-upperarm-muscle-incr", 1.0), ("*-lowerarm-muscle-incr", 0.7),
          ("*-upperleg-muscle-incr", 0.4), ("*-lowerleg-muscle-incr", 0.4)],
}[SEX]
STYLE_USED = []
if args.stylise > 0:
    for tname, w in STYLE:
        try:
            detail_shapekeys(tname, w * args.stylise)
            STYLE_USED.append((tname, w * args.stylise))
        except Exception as exc:  # a missing optional target must not stop the build
            print("STYLE skipped", tname, exc)

rig = HumanService.add_builtin_rig(human, "game_engine")
assert rig is not None
assert np.allclose(np.array(rig.matrix_world), np.eye(4)), "rig object transform is not identity"

parts = {"body": human}
ASSET_FILES = {}


def add_asset(sub, fname, atype, key):
    path = AssetService.find_asset_absolute_path(fname, asset_subdir=sub)
    if path is None:
        raise RuntimeError("asset not found (install the MakeHuman asset packs): %s/%s" % (sub, fname))
    obj = HumanService.add_mhclo_asset(path, human, asset_type=atype, subdiv_levels=0, material_type="GAMEENGINE")
    parts[key] = obj
    ASSET_FILES[key] = path
    return obj


add_asset(EYES[0], EYES[1], EYES[2], "eyes")
add_asset(BROWS[0], BROWS[1], BROWS[2], "eyebrows")
add_asset(LASHES[0], LASHES[1], LASHES[2], "eyelashes")
for i, (sub, fname) in enumerate(UNDERWEAR):
    add_asset(sub, fname, "Clothes", "underwear%d" % i)
bpy.context.view_layer.update()
# clothes hide the skin under them with MASK modifiers on the base mesh: switched off, the skin under the underwear stays (the
# game layers garments over it, and cut-out holes let the skin poke through the underwear when morphs move the two differently)
for m in human.modifiers:
    if m.type == "MASK":
        m.show_viewport = False
print("PARTS", {k: (len(o.data.vertices), len(o.data.polygons)) for k, o in parts.items()})


def capture():
    """Vertex positions of every part (shape keys mixed, rig at rest), Blender axes, metres."""
    dg = bpy.context.evaluated_depsgraph_get()
    out = {}
    for k, o in parts.items():
        eo = o.evaluated_get(dg)
        me = eo.to_mesh()
        co = np.empty(len(me.vertices) * 3, dtype=np.float64)
        me.vertices.foreach_get("co", co)
        eo.to_mesh_clear()
        m = np.array(o.matrix_world)
        co = co.reshape(-1, 3)
        out[k] = co @ m[:3, :3].T + m[:3, 3]
    return out


base = capture()
CLEARANCE = 0.0045  # metres between a garment and the skin, also at the end of every body morph (the node step simplifies the skin by up to about 4 mm)
BODY_TRIS = None  # triangles of the whole human mesh (vertex indices), for normals


def body_tris():
    global BODY_TRIS
    if BODY_TRIS is None:
        me = human.data
        me.calc_loop_triangles()
        tv = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
        me.loop_triangles.foreach_get("vertices", tv)
        BODY_TRIS = tv.reshape(-1, 3)
    return BODY_TRIS


def body_mask():
    gi = {g.name: g.index for g in human.vertex_groups}["body"]
    flag = np.zeros(len(human.data.vertices), dtype=bool)
    for v in human.data.vertices:
        flag[v.index] = any(g.group == gi and g.weight > 0 for g in v.groups)
    return flag


# ---------------------------------------------------------------------------------------------------------------------
# male underwear: boxer-style trunks cut out of the skin mesh (own geometry, no third-party asset: CC0 like the base mesh)
# ---------------------------------------------------------------------------------------------------------------------
TRUNK_SRC = None   # per trunk vertex: the two body vertices it is interpolated from, and the weights
TRUNK_HEM = 0.095   # hem this far below the crotch
TRUNK_RISE = (0.215, 0.185)  # waistband height above the crotch: back, front (a little lower at the front)


def make_trunks():
    """Trunks = the part of the skin mesh between a waistband plane and a hem plane (both legs), cut so that the border is exactly on the
    planes: a vertex outside is slid along one of its edges to the plane, so every trunk vertex lies on the skin between two body vertices
    (which is what the morph deltas and skin weights are taken from)."""
    global TRUNK_SRC
    me_h = human.data
    pos = base["body"]
    flag = body_mask()
    mid = flag & (np.abs(pos[:, 0]) < 0.012) & (pos[:, 2] > 0.6) & (pos[:, 2] < 1.15)
    crotch = float(pos[mid, 2].min())

    def top_z(y):  # waistband plane: lower at the front (the human looks to -y)
        t = np.clip((0.02 - y) / 0.14, 0.0, 1.0)
        return crotch + TRUNK_RISE[0] + (TRUNK_RISE[1] - TRUNK_RISE[0]) * t

    hem = crotch - TRUNK_HEM
    f_top = top_z(pos[:, 1]) - pos[:, 2]   # >= 0 below the waistband
    f_hem = pos[:, 2] - hem                # >= 0 above the hem
    inside = flag & (f_top >= 0) & (f_hem >= 0) & (np.abs(pos[:, 0]) < 0.3)
    nbr = {}
    for e in me_h.edges:
        a, b = e.vertices
        nbr.setdefault(a, []).append(b)
        nbr.setdefault(b, []).append(a)
    uvl = me_h.uv_layers.active.data
    polys = [p for p in me_h.polygons if flag[list(p.vertices)].all() and inside[list(p.vertices)].any() and abs(pos[list(p.vertices), 0].mean()) < 0.3]
    parent = {}  # outside vertex -> (inside neighbour, t)
    keep = []
    for p in polys:
        ok = True
        for v in p.vertices:
            if inside[v] or v in parent:
                continue
            cands = [u for u in sorted(nbr.get(v, [])) if inside[u]]
            if not cands:
                ok = False
                break
            u = cands[0]
            f = f_top if f_top[v] < 0 else f_hem
            parent[v] = (u, float(f[u] / (f[u] - f[v])))
        if ok:
            keep.append(p)
    verts = sorted({v for p in keep for v in p.vertices})
    remap = {v: i for i, v in enumerate(verts)}
    idx = np.zeros((len(verts), 2), dtype=np.int64)
    wgt = np.zeros((len(verts), 2))
    co = np.zeros((len(verts), 3))
    for v in verts:
        i = remap[v]
        if v in parent:
            u, t = parent[v]
            idx[i], wgt[i] = (u, v), (1 - t, t)
        else:
            idx[i], wgt[i] = (v, v), (1.0, 0.0)
        co[i] = pos[idx[i, 0]] * wgt[i, 0] + pos[idx[i, 1]] * wgt[i, 1]
    me = bpy.data.meshes.new("Trunks")
    me.from_pydata(co.tolist(), [], [[remap[v] for v in p.vertices] for p in keep])
    me.update()
    uv = me.uv_layers.new(name="UVMap")
    for i, p in enumerate(keep):
        for k in range(len(p.vertices)):
            uv.data[me.polygons[i].loop_start + k].uv = uvl[p.loop_start + k].uv
    obj = bpy.data.objects.new("Trunks", me)
    bpy.context.scene.collection.objects.link(obj)
    parts["underwear0"] = obj
    base["underwear0"] = co.copy()
    TRUNK_SRC = {"idx": idx, "wgt": wgt, "v": np.clip((co[:, 2] - hem) / (top_z(co[:, 1]) - hem), 0.0, 1.0)}
    print("TRUNKS crotch z %.3f, hem %.3f, %d polys (%d dropped), %d verts (%d slid to a plane)" % (crotch, hem, len(keep), len(polys) - len(keep), len(verts), len(parent)))


if SEX == "m":
    make_trunks()


def lift_off_skin(key, dist):
    """Moves the vertices of an underwear part `dist` metres out along their own normals (no z-fighting where it meets the skin)."""
    me = parts[key].data
    me.calc_loop_triangles()
    tv = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
    me.loop_triangles.foreach_get("vertices", tv)
    tv = tv.reshape(-1, 3)
    f = np.cross(base[key][tv[:, 1]] - base[key][tv[:, 0]], base[key][tv[:, 2]] - base[key][tv[:, 0]])
    nrm = np.zeros_like(base[key])
    for j in range(3):
        np.add.at(nrm, tv[:, j], f)
    base[key] = base[key] + dist * nrm / np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)


for k in [k for k in parts if k.startswith("underwear")]:
    lift_off_skin(k, CLEARANCE)
bones = {b.name: (np.array(b.head_local), np.array(b.tail_local)) for b in rig.data.bones}


def nearest_body_map(key, n=3):
    """For every vertex of a clothing part: its n nearest body vertices and inverse-distance weights."""
    if key == "underwear0" and TRUNK_SRC is not None:  # the trunks are made of body vertices
        return TRUNK_SRC["idx"], TRUNK_SRC["wgt"]
    from mathutils.kdtree import KDTree
    tree = KDTree(len(base["body"]))
    for i, p in enumerate(base["body"]):
        tree.insert(p, i)
    tree.balance()
    idx = np.zeros((len(base[key]), n), dtype=np.int64)
    wgt = np.zeros((len(base[key]), n))
    for i, p in enumerate(base[key]):
        for k, (_, j, d) in enumerate(tree.find_n(p, n)):
            idx[i, k], wgt[i, k] = j, 1.0 / (d + 1e-4)
    return idx, wgt / wgt.sum(axis=1, keepdims=True)


UNDERWEAR_KEYS = [k for k in parts if k.startswith("underwear")]
BODY_MAP = {k: nearest_body_map(k) for k in UNDERWEAR_KEYS}


def vertex_normals(pos, tris, n):
    f = np.cross(pos[tris[:, 1]] - pos[tris[:, 0]], pos[tris[:, 2]] - pos[tris[:, 0]])
    nrm = np.zeros((n, 3))
    for k in range(3):
        np.add.at(nrm, tris[:, k], f)
    ln = np.linalg.norm(nrm, axis=1, keepdims=True)
    return nrm / np.where(ln == 0, 1, ln)


def underwear_delta(key, body_delta, gain):
    """Morph delta of an underwear part: the skin's delta at its vertices, then (not for the trunks, which are skin) pushed out so the
    garment stays CLEARANCE outside the morphed skin even at `gain` times the morph (the slider gain of the game)."""
    idx, wgt = BODY_MAP[key]
    d = np.einsum("nk,nkd->nd", wgt, body_delta[idx])
    if key == "underwear0" and TRUNK_SRC is not None:
        return d
    a, b = garment_edges(key)  # the skin's delta sampled at the garment's vertices is a little rough: five Laplacian passes
    deg = np.bincount(a, minlength=len(d)) + np.bincount(b, minlength=len(d))
    for _ in range(5):
        acc = np.zeros_like(d)
        np.add.at(acc, a, d[b])
        np.add.at(acc, b, d[a])
        d = 0.4 * d + 0.6 * acc / np.maximum(deg, 1)[:, None]
    morphed_body = base["body"] + body_delta * gain
    nb = vertex_normals(morphed_body, body_tris(), len(morphed_body))
    u = base[key] + d * gain
    s = np.einsum("nk,nkd,nkd->n", wgt, u[:, None, :] - morphed_body[idx], nb[idx])  # signed distance to the skin along its normal
    n_avg = np.einsum("nk,nkd->nd", wgt, nb[idx])
    n_avg /= np.maximum(np.linalg.norm(n_avg, axis=1, keepdims=True), 1e-9)
    push = np.maximum(0.0, CLEARANCE - s)
    # smooth the push over the garment's own edges (it must not wrinkle the hem), never below what is needed
    sm = push.copy()
    for _ in range(6):
        acc = np.zeros_like(sm)
        np.add.at(acc, a, sm[b])
        np.add.at(acc, b, sm[a])
        sm = 0.5 * sm + 0.5 * acc / np.maximum(deg, 1)
    push = np.maximum(push, sm)
    return (d * gain + push[:, None] * n_avg) / gain


_EDGES = {}


def garment_edges(key):
    if key not in _EDGES:
        e = np.empty(len(parts[key].data.edges) * 2, dtype=np.int64)
        parts[key].data.edges.foreach_get("vertices", e)
        _EDGES[key] = (e[0::2].copy(), e[1::2].copy())
    return _EDGES[key]




# ---------------------------------------------------------------------------------------------------------------------
# morph targets
# ---------------------------------------------------------------------------------------------------------------------
morph_pos = {}


def record(name, body_only_underwear=False):
    """Stores the delta of every part to the neutral human for the current (modified) state."""
    HumanService.refit(human)
    bpy.context.view_layer.update()
    cap = capture()
    morph_pos[name] = {k: cap[k] - base[k] for k in cap}
    for k in UNDERWEAR_KEYS:
        morph_pos[name][k] = underwear_delta(k, morph_pos[name]["body"], GAIN.get(name, 1)) if not body_only_underwear else np.zeros_like(base[k])


def restore():
    HumanService.refit(human)
    bpy.context.view_layer.update()


if not args.no_morphs:
    for name, kind, target, value in MORPHS:
        sk = []
        if kind == "macro":
            set_macro(target, value)
        else:
            sk = detail_shapekeys(target, value)
        record(name)
        if kind == "macro":
            set_macro(target, MACRO[target])
        else:
            for k in sk:
                human.shape_key_remove(k)
        restore()
        print("MORPH %-12s max delta %.1f mm  (body %.1f, underwear0 %.1f)" % (
            name, max(np.abs(d).max() for d in morph_pos[name].values()) * 1000, np.abs(morph_pos[name]["body"]).max() * 1000,
            np.abs(morph_pos[name].get("underwear0", np.zeros(1))).max() * 1000))
    if not args.no_face_morphs:
        for name, entries in FACE_MORPHS:
            ends = []
            for want_opposite in (False, True):
                sk = []
                for tname, opposite, w in entries:
                    t = opposite if want_opposite else tname
                    if t is not None:
                        sk += detail_shapekeys(t, w * args.face_amp)
                record(name, body_only_underwear=True)
                ends.append(morph_pos.pop(name))
                for k in sk:
                    human.shape_key_remove(k)
                restore()
            morph_pos[name] = {k: (ends[0][k] - ends[1][k]) * 0.5 for k in ends[0]}
            for k in morph_pos[name]:  # a few MakeHuman face targets list a stray vertex far from the face: face morphs move the head only
                morph_pos[name][k][base[k][:, 2] < 1.3] = 0.0
            print("FACE %-22s max delta %.1f mm  at +1 / %.1f mm at -1" % (name, np.abs(ends[0]["body"]).max() * 1000, np.abs(ends[1]["body"]).max() * 1000))
    after = capture()
    print("RESTORE drift after morph passes: %.3f mm" % (max(np.abs(after[k] - base[k]).max() for k in base if k not in UNDERWEAR_KEYS) * 1000))

# ---------------------------------------------------------------------------------------------------------------------
# retarget: per-bone affine maps, MPFB rest (A-pose) -> UAL (T-pose)
# ---------------------------------------------------------------------------------------------------------------------


def unit(v):
    return v / np.linalg.norm(v)


def rot_axis(axis, ang):
    x, y, z = unit(axis)
    c, s = math.cos(ang), math.sin(ang)
    return np.array([[c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s],
                     [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s],
                     [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)]])


def rot_between(a, b):
    """Minimal rotation matrix taking unit vector a to unit vector b."""
    v = np.cross(a, b)
    c = float(np.dot(a, b))
    if c < -0.999999:
        return rot_axis(unit(np.cross(a, [1, 0, 0] if abs(a[0]) < 0.9 else [0, 1, 0])), math.pi)
    k = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + k + k @ k / (1 + c)


def signed_angle(a, b, axis):
    a, b = unit(a), unit(b)
    return math.atan2(float(np.dot(np.cross(a, b), axis)), float(np.dot(a, b)))


# Target joint positions of the maps. Two corrections to the plain UAL positions keep the MakeHuman body in one piece:
#  - the UAL shoulder is 8 cm further back than MakeHuman's (relative to the torso), the clavicle 5 cm forward: the arm chain
#    and the clavicle keep MakeHuman's depth (the animation then pivots 8 cm in front of / behind the deltoid, which only
#    shows as a slight shoulder bob on arm swings);
#  - the head: scaled by HEAD (stylised, like the Meshy heads) and lifted so the crown reaches HEIGHT; the UAL head joint sits
#    at the jaw, MakeHuman's at the skull base.
HEAD = 1.2 if SEX == "f" else 1.15
HEIGHT = 1.80
SHIFT = {}
# the UAL shoulder joint also sits ~5 cm higher over the neck base than MakeHuman's: keep MakeHuman's trapezius slope
_s_torso = np.linalg.norm(UAL_POS["neck_01"] - UAL_POS["pelvis"]) / np.linalg.norm(bones["neck_01"][0] - bones["pelvis"][0])


def _torso_z(z_mh):
    return UAL_POS["neck_01"][2] - (bones["neck_01"][0][2] - z_mh) * _s_torso


for side in ("l", "r"):
    arm = np.array([0.0, bones["upperarm_" + side][0][1] - UAL_POS["upperarm_" + side][1], _torso_z(bones["upperarm_" + side][0][2]) - UAL_POS["upperarm_" + side][2]])
    clav = np.array([0.0, bones["clavicle_" + side][0][1] - UAL_POS["clavicle_" + side][1], _torso_z(bones["clavicle_" + side][0][2]) - UAL_POS["clavicle_" + side][2]])
    for j in UAL_NAMES:
        if j.endswith("_" + side) and re.match(r"^(upperarm|lowerarm|hand|index|middle|ring|pinky|thumb)", j):
            SHIFT[j] = arm
    SHIFT["clavicle_" + side] = clav
crown_r = base["body"][:, 2].max()
LIFT = max(0.0, HEIGHT - (UAL_POS["Head"][2] + HEAD * (crown_r - bones["head"][0][2])))
SHIFT["Head"] = np.array([0.0, 0.0, LIFT])
print("SHIFT arm %s clavicle %s head lift %.3f" % (np.round(SHIFT["upperarm_l"], 3), np.round(SHIFT["clavicle_l"], 3), LIFT))


def tpos(name):
    return UAL_POS[name] + SHIFT.get(name, 0.0)


# the MakeHuman spine joints sit lower than the UAL ones (the chest bone is long): virtual MakeHuman joints at the UAL
# proportions along pelvis -> neck_01 give bones of an even scale; their skin weights are redistributed by height below
SPINE = ["pelvis", "spine_01", "spine_02", "spine_03"]
u0, u1 = UAL_POS["pelvis"], UAL_POS["neck_01"]
vjoint = {}
for k in SPINE:
    t = float(np.dot(UAL_POS[k] - u0, u1 - u0) / np.dot(u1 - u0, u1 - u0))
    vjoint[k] = bones["pelvis"][0] + t * (bones["neck_01"][0] - bones["pelvis"][0])
vjoint["neck_01"] = bones["neck_01"][0]


def rest_head(b):
    return vjoint.get(b, bones[b][0])


maps = {}  # mpfb bone -> [rotation, stretch, d_r, d_t, head_r, head_t, roll] and later (A 3x3, t 3)
scales = {}
for bname, (_, tail_r) in bones.items():
    if bname == "Root":
        continue
    head_r = rest_head(bname)
    head_t = tpos(ual_name(bname))
    if bname == "head":
        d_t = unit(tpos("Head") - UAL_POS["neck_01"])
        q = rot_between(unit(bones["head"][0] - bones["neck_01"][0]), d_t)
        A = HEAD * q
        maps[bname] = (A, head_t - A @ head_r)
        scales[bname] = HEAD
        continue
    cn = ref_child(bname)
    if cn is None:
        raise RuntimeError("no reference child for " + bname)
    cbone = {"Head": "head"}.get(cn, cn)
    ref_r = rest_head(cbone) if cbone in bones else tail_r  # chain ends use the bone's own tail
    d_r_vec, d_t_vec = ref_r - head_r, tpos(cn) - head_t
    d_r, d_t = unit(d_r_vec), unit(d_t_vec)
    s = np.linalg.norm(d_t_vec) / np.linalg.norm(d_r_vec)
    scales[bname] = s
    maps[bname] = [rot_between(d_r, d_t), s, d_r, d_t, head_r, head_t, 0.0]

# roll of the hand: palm down, thumb forward as in the UAL T-pose (the fingers copy the hand's roll)
for side in ("l", "r"):
    q, s, d_r, d_t, head_r, head_t, _ = maps["hand_" + side]
    thumb_r = q @ (bones["thumb_01_" + side][0] - head_r)
    thumb_t = tpos("thumb_01_" + side) - head_t
    pr, pt = thumb_r - d_t * np.dot(thumb_r, d_t), thumb_t - d_t * np.dot(thumb_t, d_t)
    ang = signed_angle(pr, pt, d_t)
    for b in maps:
        if isinstance(maps[b], list) and b.endswith("_" + side) and re.match(r"^(hand|index|middle|ring|pinky|thumb)", b):
            maps[b][6] = ang
    print("HAND ROLL %s %.1f deg" % (side, math.degrees(ang)))

for b in list(maps):
    if isinstance(maps[b], list):
        q, s, d_r, d_t, head_r, head_t, roll = maps[b]
        A = rot_axis(d_t, roll) @ q @ (np.eye(3) + (s - 1.0) * np.outer(d_r, d_r))  # stretch along the reference vector only
        maps[b] = (A, head_t - A @ head_r)
print("SCALES", {b: round(float(s), 2) for b, s in scales.items()})

# ---------------------------------------------------------------------------------------------------------------------
# skin weights -> UAL joints, LBS through the maps
# ---------------------------------------------------------------------------------------------------------------------
BONE_ORDER = sorted(maps)
BONE_ID = {b: i for i, b in enumerate(BONE_ORDER)}
A_ALL = np.stack([maps[b][0] for b in BONE_ORDER])
T_ALL = np.stack([maps[b][1] for b in BONE_ORDER])


SPINE_H = [float(vjoint[k][2]) for k in SPINE]


def spine_split(h, total):
    """The spine weight of a vertex at height h spread over the four spine bones by height (linear between neighbouring joints)."""
    out = {}
    if h <= SPINE_H[0]:
        out[SPINE[0]] = total
    elif h >= SPINE_H[-1]:
        out[SPINE[-1]] = total
    else:
        for i in range(len(SPINE) - 1):
            if SPINE_H[i] <= h <= SPINE_H[i + 1]:
                a = (h - SPINE_H[i]) / (SPINE_H[i + 1] - SPINE_H[i])
                out[SPINE[i]], out[SPINE[i + 1]] = total * (1 - a), total * a
                break
    return out


def vertex_weights(obj):
    names = {vg.index: vg.name for vg in obj.vertex_groups}
    n = len(obj.data.vertices)
    ids = np.zeros((n, 4), dtype=np.int32)
    wts = np.zeros((n, 4), dtype=np.float64)
    rest = base[[k for k, o in parts.items() if o is obj][0]]
    for v in obj.data.vertices:
        w = {}
        for g in v.groups:
            nm = names.get(g.group)
            if nm in BONE_ID and g.weight > 1e-4:
                w[nm] = w.get(nm, 0.0) + g.weight
        spine = sum(w.pop(k, 0.0) for k in SPINE)
        if spine > 0:
            for k, val in spine_split(float(rest[v.index][2]), spine).items():
                w[k] = w.get(k, 0.0) + val
        ws = sorted(((val, BONE_ID[k]) for k, val in w.items() if val > 1e-4), reverse=True)[:4]
        if not ws:
            ws = [(1.0, BONE_ID["head" if obj is not human else "pelvis"])]
        tot = sum(val for val, _ in ws)
        for k, (val, b) in enumerate(ws):
            ids[v.index, k], wts[v.index, k] = b, val / tot
    return ids, wts


def skin(points, ids, wts, linear_only=False):
    out = np.zeros_like(points)
    for k in range(4):
        p = np.einsum("nij,nj->ni", A_ALL[ids[:, k]], points)
        if not linear_only:
            p = p + T_ALL[ids[:, k]]
        out += wts[:, k:k + 1] * p
    return out


def to_gl(p):
    return np.stack([p[:, 0], p[:, 2], -p[:, 1]], axis=1)


body_group = {g.name: g.index for g in human.vertex_groups}["body"]
bin_chunks = []
bin_len = 0


def put(arr, dtype):
    global bin_len
    a = np.ascontiguousarray(arr, dtype=dtype)
    off = bin_len
    bin_chunks.append(a.tobytes())
    bin_len += a.nbytes
    pad = (-bin_len) % 4
    if pad:
        bin_chunks.append(b"\0" * pad)
        bin_len += pad
    return {"offset": off, "count": int(a.shape[0]), "components": int(a.shape[1]) if a.ndim > 1 else 1}


# which parts form which output primitive (material)
GROUPS = [("skin", ["body"]), ("eyes", ["eyes"]), ("eyebrows", ["eyebrows"]), ("eyelashes", ["eyelashes"]),
          ("underwear", [k for k in parts if k.startswith("underwear")]), ("iris", ["iris"])]
SOURCE = {"iris": "eyes"}  # the iris is cut out of the eye mesh: same vertices, own triangles and UVs

# The MakeHuman eye texture (brownlight_eye.png, 1024 px) holds both eyes; the iris disc of each is centred here (UV, v up) with this
# radius. The low-poly eye has a ring of quads ending at UV radius 0.108 around each pupil: those form the iris primitive.
IRIS_CENTRES = np.array([[724.0 / 1024, 1 - 305.0 / 1024], [301.0 / 1024, 1 - 719.0 / 1024]])
IRIS_POLY_RADIUS = 0.112
IRIS_CROP = 260.0 / 1024  # the node step crops this square around each iris centre; the iris UVs are remapped to it (0..1)


def eye_uv_distance(uv):
    return np.min(np.linalg.norm(uv[:, None, :] - IRIS_CENTRES[None], axis=2), axis=1)


def part_geometry(key):
    """Triangulated geometry of one part with vertices split on (vertex, uv): output->source vertex, uv and triangles."""
    obj = parts[SOURCE.get(key, key)]
    me = obj.data
    me.calc_loop_triangles()
    uv = np.empty(len(me.loops) * 2)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    if key == "underwear0" and TRUNK_SRC is not None:  # trunks: u = 0.5, v = height over the garment (a 1 px wide waistband / hem strip texture)
        lv = np.empty(len(me.loops), dtype=np.int64)
        me.loops.foreach_get("vertex_index", lv)
        uv = np.stack([np.full(len(lv), 0.5), TRUNK_SRC["v"][lv]], axis=1)
    lt = me.loop_triangles
    tv = np.empty(len(lt) * 3, dtype=np.int64)
    tl = np.empty(len(lt) * 3, dtype=np.int64)
    tp = np.empty(len(lt), dtype=np.int64)
    lt.foreach_get("vertices", tv)
    lt.foreach_get("loops", tl)
    lt.foreach_get("polygon_index", tp)
    tv, tl = tv.reshape(-1, 3), tl.reshape(-1, 3)
    if key == "body":  # drop the helper geometry (what MPFB's "Hide helpers" mask does)
        in_body = body_mask()
        ok = in_body[tv].all(axis=1)
        tv, tl = tv[ok], tl[ok]
    if key in ("eyes", "iris"):  # a triangle is iris when all its corners lie on the iris disc of the texture
        is_iris = np.array([eye_uv_distance(uv[tl[i]]).max() <= IRIS_POLY_RADIUS for i in range(len(tl))])
        ok = is_iris if key == "iris" else ~is_iris
        tv, tl = tv[ok], tl[ok]
    remap, src, uvs = {}, [], []
    idx = np.empty(tv.shape, dtype=np.int64)
    for i in range(tv.shape[0]):
        for k in range(3):
            key2 = (int(tv[i, k]), round(float(uv[tl[i, k], 0]), 5), round(float(uv[tl[i, k], 1]), 5))
            j = remap.get(key2)
            if j is None:
                j = remap[key2] = len(src)
                src.append(key2[0])
                uvs.append(uv[tl[i, k]])
            idx[i, k] = j
    uvs = np.array(uvs)
    if key == "iris":  # own UVs: 0..1 over the crop around the nearest iris centre
        c = IRIS_CENTRES[np.argmin(np.linalg.norm(uvs[:, None, :] - IRIS_CENTRES[None], axis=2), axis=1)]
        uvs = (uvs - c) / IRIS_CROP + 0.5
    return {"src": np.array(src), "uv": uvs, "tris": idx, "tri_src": tv}


weights_cache = {k: vertex_weights(o) for k, o in parts.items() if k != "underwear0" or TRUNK_SRC is None}
if TRUNK_SRC is not None:  # the trunks skin like the body vertices they are made of
    weights_cache["underwear0"] = tuple(a[TRUNK_SRC["idx"][:, 0]] for a in weights_cache["body"])


def smooth_weights(passes=5, alpha=0.6):
    """MPFB's game_engine weights change from one bone to the next within one edge ring (no twist bones), which tears the
    mesh open at the elbow and knee under the UAL clips; a few Laplacian passes over the surface give soft transitions. The
    underwear takes the smoothed weights of the nearest body vertices."""
    n = len(human.data.vertices)
    dense = np.zeros((n, len(BONE_ORDER)))
    ids, wts = weights_cache["body"]
    for k in range(4):
        np.add.at(dense, (np.arange(n), ids[:, k]), wts[:, k])
    edges = np.empty(len(human.data.edges) * 2, dtype=np.int64)
    human.data.edges.foreach_get("vertices", edges)
    edges = edges.reshape(-1, 2)
    deg = np.zeros(n)
    np.add.at(deg, edges[:, 0], 1)
    np.add.at(deg, edges[:, 1], 1)
    # The shoulder and armpit keep MakeHuman's own weights (clavicle / upper arm / spine share them): smoothing them over five rings
    # spreads the arm weights over the chest and makes the armpit a web of skin and the deltoid soft in arms-down poses.
    col = lambda names: [BONE_ID[b] for b in names if b in BONE_ID]
    arm_w = dense[:, col(["clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r"])].sum(axis=1)
    trunk_w = dense[:, col(["spine_01", "spine_02", "spine_03", "neck_01", "pelvis"])].sum(axis=1)
    shoulder = (arm_w > 0.02) & (trunk_w > 0.02)
    keep = np.zeros(n, dtype=bool) if args.smooth_shoulders else shoulder
    print("SMOOTH shoulder/armpit vertices kept as authored:", int(keep.sum()))
    for _ in range(passes):
        acc = np.zeros_like(dense)
        np.add.at(acc, edges[:, 0], dense[edges[:, 1]])
        np.add.at(acc, edges[:, 1], dense[edges[:, 0]])
        mean = acc / np.maximum(deg, 1)[:, None]
        smoothed = np.where(deg[:, None] > 0, (1 - alpha) * dense + alpha * mean, dense)
        dense = np.where(keep[:, None], dense, smoothed)

    def top4(rows):
        order = np.argsort(-rows, axis=1)[:, :4]
        w = np.take_along_axis(rows, order, axis=1)
        w = w / np.maximum(w.sum(axis=1, keepdims=True), 1e-9)
        return order.astype(np.int32), w

    weights_cache["body"] = top4(dense)
    for key in UNDERWEAR_KEYS:
        idx, wgt = BODY_MAP[key]
        rows = np.einsum("nk,nkb->nb", wgt, dense[idx])
        weights_cache[key] = top4(rows)


if SMOOTH_PASSES > 0:
    smooth_weights(SMOOTH_PASSES)
_gl = {g.name: g.index for g in human.vertex_groups}["lips"]
lips_weight = np.zeros(len(human.data.vertices))
for v in human.data.vertices:
    for g in v.groups:
        if g.group == _gl:
            lips_weight[v.index] = g.weight
trunk_flag = np.zeros(len(human.data.vertices))
if TRUNK_SRC is not None:
    trunk_flag[TRUNK_SRC["idx"].reshape(-1)] = 1.0
print("LIPS vertices", int((lips_weight > 0).sum()))
manifest = {"sex": SEX, "ual": UAL_NAMES, "primitives": [], "morphs": list(morph_pos), "bone_scale": {b: round(float(s), 3) for b, s in scales.items()}}
ual_of_bone = np.array([UAL_INDEX[ual_name(b)] for b in BONE_ORDER], dtype=np.uint16)

all_pos = []
for gname, keys in GROUPS:
    off = 0
    P, N, UV, TRI, JN, WT = [], [], [], [], [], []
    MP = {m: [] for m in morph_pos}
    LIPS, LOCK = [], []
    for key in keys:
        g = part_geometry(key)
        sk_key = SOURCE.get(key, key)
        ids, wts = weights_cache[sk_key]
        pos_bl = skin(base[sk_key], ids, wts)
        nrm_bl = vertex_normals(pos_bl, g["tri_src"], len(pos_bl))
        s = g["src"]
        P.append(to_gl(pos_bl[s]))
        N.append(to_gl(nrm_bl[s]))
        UV.append(g["uv"] * np.array([1, -1]) + np.array([0, 1]))  # glTF has the v axis pointing down
        TRI.append(g["tris"] + off)
        JN.append(ids[s])
        WT.append(wts[s])
        for m in morph_pos:
            MP[m].append(to_gl(skin(morph_pos[m][sk_key], ids, wts, linear_only=True)[s]))
        if key == "body":
            LIPS.append(lips_weight[s])
            LOCK.append(trunk_flag[s])
        off += len(s)
    pos, nrm, uv, tri = np.concatenate(P), np.concatenate(N), np.concatenate(UV), np.concatenate(TRI)
    prim = {"name": gname, "vertices": int(len(pos)), "triangles": int(len(tri)),
            "position": put(pos, np.float32), "normal": put(nrm, np.float32), "uv": put(uv, np.float32), "index": put(tri.reshape(-1), np.uint32),
            "joints": put(ual_of_bone[np.concatenate(JN)], np.uint16), "weights": put(np.concatenate(WT), np.float32), "morphs": {}}
    if LIPS:
        prim["lips"] = put(np.concatenate(LIPS), np.float32)
        prim["lock"] = put(np.concatenate(LOCK), np.float32)  # skin vertices under the trunks: the node step must not simplify them away
    for m in MP:
        prim["morphs"][m] = put(np.concatenate(MP[m]), np.float32)
    manifest["primitives"].append(prim)
    all_pos.append(pos)
    print("PRIM %-10s %6d verts %6d tris" % (gname, len(pos), len(tri)))

allp = np.concatenate(all_pos)
print("BOUNDS y %.3f..%.3f  x %.3f..%.3f  z %.3f..%.3f" % (allp[:, 1].min(), allp[:, 1].max(), allp[:, 0].min(), allp[:, 0].max(), allp[:, 2].min(), allp[:, 2].max()))
sk = np.concatenate(all_pos[:1])
for nm, sel in (("hand_l tip x", sk[:, 0].max()), ("hand_r tip x", sk[:, 0].min())):
    print("BODY", nm, "%.3f" % sel)


# ---------------------------------------------------------------------------------------------------------------------
# UV masks of the skin texture (texels covered by the body, texels of the scalp), for the node step: the mean skin colour and a
# repaint of the painted scalp (the MakeHuman skins have a hair-cap colour there, which looks like a tan on a bald head)
# ---------------------------------------------------------------------------------------------------------------------
MASK_PX = 1024


def uv_masks():
    me = human.data
    me.calc_loop_triangles()
    uv = np.empty(len(me.loops) * 2)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    lt = me.loop_triangles
    tv = np.empty(len(lt) * 3, dtype=np.int64)
    tl = np.empty(len(lt) * 3, dtype=np.int64)
    lt.foreach_get("vertices", tv)
    lt.foreach_get("loops", tl)
    tv, tl = tv.reshape(-1, 3), tl.reshape(-1, 3)
    gi = {g.name: g.index for g in human.vertex_groups}
    in_group = {n: np.zeros(len(me.vertices), dtype=bool) for n in ("body", "scalp", "lips")}
    for v in me.vertices:
        for g in v.groups:
            for n in in_group:
                if g.group == gi[n] and g.weight > 0:
                    in_group[n][v.index] = True
    cover = np.zeros((MASK_PX, MASK_PX), dtype=np.uint8)
    scalp = np.zeros((MASK_PX, MASK_PX), dtype=np.uint8)
    lips = np.zeros((MASK_PX, MASK_PX), dtype=np.uint8)
    for t in range(tv.shape[0]):
        if not in_group["body"][tv[t]].all():
            continue
        target = scalp if in_group["scalp"][tv[t]].all() else None
        p = uv[tl[t]] * np.array([1.0, -1.0]) + np.array([0.0, 1.0])
        p = p * MASK_PX
        x0, x1 = int(max(0, math.floor(p[:, 0].min()))), int(min(MASK_PX - 1, math.ceil(p[:, 0].max())))
        y0, y1 = int(max(0, math.floor(p[:, 1].min()))), int(min(MASK_PX - 1, math.ceil(p[:, 1].max())))
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        d = (p[1, 1] - p[2, 1]) * (p[0, 0] - p[2, 0]) + (p[2, 0] - p[1, 0]) * (p[0, 1] - p[2, 1])
        if abs(d) < 1e-9:
            continue
        a = ((p[1, 1] - p[2, 1]) * (xs - p[2, 0]) + (p[2, 0] - p[1, 0]) * (ys - p[2, 1])) / d
        b = ((p[2, 1] - p[0, 1]) * (xs - p[2, 0]) + (p[0, 0] - p[2, 0]) * (ys - p[2, 1])) / d
        inside = (a >= -0.02) & (b >= -0.02) & (a + b <= 1.02)
        cover[y0:y1 + 1, x0:x1 + 1][inside] = 255
        if target is not None:
            target[y0:y1 + 1, x0:x1 + 1][inside] = 255
        if in_group["lips"][tv[t]].all():
            lips[y0:y1 + 1, x0:x1 + 1][inside] = 255
    return cover, scalp, lips


_cover, _scalp, _lips = uv_masks()
with open(os.path.join(args.out, "mpfb_%s.uvmask.bin" % SEX), "wb") as f:  # three MASK_PX^2 masks, in this order
    f.write(_cover.tobytes())
    f.write(_scalp.tobytes())
    f.write(_lips.tobytes())
print("UVMASK cover %.0f%% scalp %.1f%% lips %.2f%%" % (100.0 * (_cover > 0).mean(), 100.0 * (_scalp > 0).mean(), 100.0 * (_lips > 0).mean()))

# ---------------------------------------------------------------------------------------------------------------------
# textures and licences
# ---------------------------------------------------------------------------------------------------------------------
def mhclo_material(mhclo):
    for line in open(mhclo, encoding="utf-8", errors="ignore"):
        if line.startswith("material "):
            return os.path.join(os.path.dirname(mhclo), line.split(None, 1)[1].strip())
    return None


def mhmat_texture(mhmat):
    for line in open(mhmat, encoding="utf-8", errors="ignore"):
        if line.startswith("diffuseTexture "):
            return os.path.join(os.path.dirname(mhmat), line.split(None, 1)[1].strip())
    return None


skin_mat = AssetService.find_asset_absolute_path(SKIN + ".mhmat", asset_subdir="skins")
eye_mat = AssetService.find_asset_absolute_path(EYES[3] + ".mhmat", asset_subdir="eyes")
manifest["textures"] = {"skin": mhmat_texture(skin_mat), "eyes": mhmat_texture(eye_mat),
                        "eyebrows": mhmat_texture(mhclo_material(ASSET_FILES["eyebrows"])), "eyelashes": mhmat_texture(mhclo_material(ASSET_FILES["eyelashes"]))}

# licence per asset: the pack JSONs in <data>/packs list every asset with its licence and author
packs = {}
pdir = os.path.join(LocationService.get_user_data(), "packs")
for f in sorted(os.listdir(pdir)):
    if f.endswith(".json"):
        for k, v in json.load(open(os.path.join(pdir, f))).items():
            if isinstance(v, dict) and "license" in v:
                packs.setdefault(k, []).append({"pack": f[:-5], "license": v["license"], "author": v.get("author", ""), "source": v.get("source", "")})


def lic(name):
    return packs.get(name, [{"license": "UNKNOWN"}])[0]


used = [os.path.basename(p)[:-6] for p in ASSET_FILES.values()] + [SKIN, EYES[3]]
manifest["licenses"] = {n: lic(n) for n in used}
if SEX == "m":
    manifest["licenses"]["trunks (generated from the base mesh by tools/mpfb/build_body.py)"] = {
        "license": "CC0", "author": "Hearthside Life, derived from the MakeHuman base mesh (CC0)", "source": "tools/mpfb/build_body.py"}
manifest["licenses"]["MakeHuman base mesh, targets, game_engine rig and weights (bundled in MPFB 2.0.18)"] = {
    "license": "CC0", "author": "MakeHuman team", "source": "LICENSE.md section C of github.com/makehumancommunity/mpfb2"}
manifest["style"] = STYLE_USED
manifest["face_morphs"] = [n for n, _ in FACE_MORPHS if n in morph_pos]
manifest["iris"] = {"crop_px": 260, "centres_px": [[724, 305], [301, 719]], "texture": manifest["textures"]["eyes"]}
print("LICENSES", json.dumps({k: v["license"] for k, v in manifest["licenses"].items()}))

with open(os.path.join(args.out, "mpfb_%s.bin" % SEX), "wb") as f:
    for c in bin_chunks:
        f.write(c)
with open(os.path.join(args.out, "mpfb_%s.json" % SEX), "w") as f:
    json.dump(manifest, f)
print("DONE", SEX, "bin %.1f kB" % (bin_len / 1024))
