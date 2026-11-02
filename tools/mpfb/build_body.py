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
UNDERWEAR = ([("clothes", "wolgade_female_panties_01.mhclo"), ("clothes", "wolgade_female_top_01.mhclo")] if SEX == "f"
             else [("clothes", "elvs_swimwear_micro_shorts.mhclo")])

# neutral figure: adult, average everything; MakeHuman's default race mix. gender 0 = female, 1 = male
MACRO = {"gender": 0.0 if SEX == "f" else 1.0, "age": 0.5, "muscle": 0.5 if SEX == "f" else 0.7, "weight": 0.5, "proportions": 0.5, "height": 0.5,
         "cupsize": 0.5, "firmness": 0.5}

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


def detail_shapekey(name, weight, key_name=None):
    path = TargetService.target_full_path(name)
    if not path:
        raise RuntimeError("target not found: " + name)
    return TargetService.load_target(human, path, weight=weight, name=key_name or ("mpfb_" + name))


# cosy-life-sim tweaks on top of plain MakeHuman: slightly larger eyes and a softer, younger face (stock MPFB targets).
_EYE = 0.6 if SEX == "f" else 0.45
STYLE = [("l-eye-scale-incr", _EYE), ("r-eye-scale-incr", _EYE), ("l-cheek-volume-incr", 0.3), ("r-cheek-volume-incr", 0.3), ("head-age-decr", 0.25 if SEX == "f" else 0.0)]
if SEX == "m":
    STYLE += [("measure-shoulder-dist-incr", 0.5)]
STYLE_USED = []
if args.stylise > 0:
    for tname, w in STYLE:
        try:
            detail_shapekey(tname, w * args.stylise)
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
for k in [k for k in parts if k.startswith("underwear")]:  # lift the underwear 2.5 mm off the skin (no z-fighting where they meet)
    me = parts[k].data
    me.calc_loop_triangles()
    tv = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
    me.loop_triangles.foreach_get("vertices", tv)
    f = np.cross(base[k][tv.reshape(-1, 3)[:, 1]] - base[k][tv.reshape(-1, 3)[:, 0]], base[k][tv.reshape(-1, 3)[:, 2]] - base[k][tv.reshape(-1, 3)[:, 0]])
    nrm = np.zeros_like(base[k])
    for j in range(3):
        np.add.at(nrm, tv.reshape(-1, 3)[:, j], f)
    base[k] = base[k] + 0.0025 * nrm / np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)
bones = {b.name: (np.array(b.head_local), np.array(b.tail_local)) for b in rig.data.bones}


def nearest_body_map(key, n=3):
    """For every vertex of a clothing part: its n nearest body vertices and inverse-distance weights."""
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

# ---------------------------------------------------------------------------------------------------------------------
# morph targets
# ---------------------------------------------------------------------------------------------------------------------
morph_pos = {}
if not args.no_morphs:
    for name, kind, target, value in MORPHS:
        sk = None
        if kind == "macro":
            set_macro(target, value)
        else:
            sk = detail_shapekey(target, value)
        HumanService.refit(human)
        bpy.context.view_layer.update()
        cap = capture()
        morph_pos[name] = {k: cap[k] - base[k] for k in cap}
        for k in UNDERWEAR_KEYS:  # underwear moves like the skin under it (MPFB's own refit lets the skin poke through)
            idx, wgt = BODY_MAP[k]
            morph_pos[name][k] = np.einsum("nk,nkd->nd", wgt, morph_pos[name]["body"][idx])
        if kind == "macro":
            set_macro(target, MACRO[target])
        else:
            human.shape_key_remove(sk)
        HumanService.refit(human)
        bpy.context.view_layer.update()
        print("MORPH %-12s max delta %.1f mm  (body %.1f, underwear0 %.1f)" % (
            name, max(np.abs(d).max() for d in morph_pos[name].values()) * 1000, np.abs(morph_pos[name]["body"]).max() * 1000,
            np.abs(morph_pos[name].get("underwear0", np.zeros(1))).max() * 1000))
    after = capture()
    print("RESTORE drift after morph passes: %.3f mm" % (max(np.abs(after[k] - base[k]).max() for k in base) * 1000))

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
HEAD = 1.25 if SEX == "f" else 1.18
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


def vertex_normals(pos, tris, n):
    f = np.cross(pos[tris[:, 1]] - pos[tris[:, 0]], pos[tris[:, 2]] - pos[tris[:, 0]])
    nrm = np.zeros((n, 3))
    for k in range(3):
        np.add.at(nrm, tris[:, k], f)
    ln = np.linalg.norm(nrm, axis=1, keepdims=True)
    return nrm / np.where(ln == 0, 1, ln)


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
          ("underwear", [k for k in parts if k.startswith("underwear")])]


def part_geometry(key):
    """Triangulated geometry of one part with vertices split on (vertex, uv): output->source vertex, uv and triangles."""
    obj = parts[key]
    me = obj.data
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
    if key == "body":  # drop the helper geometry (what MPFB's "Hide helpers" mask does)
        in_body = np.zeros(len(me.vertices), dtype=bool)
        for v in me.vertices:
            in_body[v.index] = any(g.group == body_group and g.weight > 0 for g in v.groups)
        ok = in_body[tv].all(axis=1)
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
    return {"src": np.array(src), "uv": np.array(uvs), "tris": idx, "tri_src": tv}


weights_cache = {k: vertex_weights(o) for k, o in parts.items()}


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
    for _ in range(passes):
        acc = np.zeros_like(dense)
        np.add.at(acc, edges[:, 0], dense[edges[:, 1]])
        np.add.at(acc, edges[:, 1], dense[edges[:, 0]])
        mean = acc / np.maximum(deg, 1)[:, None]
        dense = np.where(deg[:, None] > 0, (1 - alpha) * dense + alpha * mean, dense)

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
manifest = {"sex": SEX, "ual": UAL_NAMES, "primitives": [], "morphs": list(morph_pos), "bone_scale": {b: round(float(s), 3) for b, s in scales.items()}}
ual_of_bone = np.array([UAL_INDEX[ual_name(b)] for b in BONE_ORDER], dtype=np.uint16)

all_pos = []
for gname, keys in GROUPS:
    off = 0
    P, N, UV, TRI, JN, WT = [], [], [], [], [], []
    MP = {m: [] for m in morph_pos}
    for key in keys:
        g = part_geometry(key)
        ids, wts = weights_cache[key]
        pos_bl = skin(base[key], ids, wts)
        nrm_bl = vertex_normals(pos_bl, g["tri_src"], len(pos_bl))
        s = g["src"]
        P.append(to_gl(pos_bl[s]))
        N.append(to_gl(nrm_bl[s]))
        UV.append(g["uv"] * np.array([1, -1]) + np.array([0, 1]))  # glTF has the v axis pointing down
        TRI.append(g["tris"] + off)
        JN.append(ids[s])
        WT.append(wts[s])
        for m in morph_pos:
            MP[m].append(to_gl(skin(morph_pos[m][key], ids, wts, linear_only=True)[s]))
        off += len(s)
    pos, nrm, uv, tri = np.concatenate(P), np.concatenate(N), np.concatenate(UV), np.concatenate(TRI)
    prim = {"name": gname, "vertices": int(len(pos)), "triangles": int(len(tri)),
            "position": put(pos, np.float32), "normal": put(nrm, np.float32), "uv": put(uv, np.float32), "index": put(tri.reshape(-1), np.uint32),
            "joints": put(ual_of_bone[np.concatenate(JN)], np.uint16), "weights": put(np.concatenate(WT), np.float32), "morphs": {}}
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
    in_group = {n: np.zeros(len(me.vertices), dtype=bool) for n in ("body", "scalp")}
    for v in me.vertices:
        for g in v.groups:
            for n in in_group:
                if g.group == gi[n] and g.weight > 0:
                    in_group[n][v.index] = True
    cover = np.zeros((MASK_PX, MASK_PX), dtype=np.uint8)
    scalp = np.zeros((MASK_PX, MASK_PX), dtype=np.uint8)
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
    return cover, scalp


_cover, _scalp = uv_masks()
with open(os.path.join(args.out, "mpfb_%s.uvmask.bin" % SEX), "wb") as f:
    f.write(_cover.tobytes())
    f.write(_scalp.tobytes())
print("UVMASK cover %.0f%% scalp %.1f%%" % (100.0 * (_cover > 0).mean(), 100.0 * (_scalp > 0).mean()))

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
manifest["licenses"]["MakeHuman base mesh, targets, game_engine rig and weights (bundled in MPFB 2.0.18)"] = {
    "license": "CC0", "author": "MakeHuman team", "source": "LICENSE.md section C of github.com/makehumancommunity/mpfb2"}
manifest["style"] = STYLE_USED
print("LICENSES", json.dumps({k: v["license"] for k, v in manifest["licenses"].items()}))

with open(os.path.join(args.out, "mpfb_%s.bin" % SEX), "wb") as f:
    for c in bin_chunks:
        f.write(c)
with open(os.path.join(args.out, "mpfb_%s.json" % SEX), "w") as f:
    json.dump(manifest, f)
print("DONE", SEX, "bin %.1f kB" % (bin_len / 1024))
