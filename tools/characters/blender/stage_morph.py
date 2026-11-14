"""The `young` shape key: a child's body and face on a prepared adult body (babies, toddlers, children, partly teens).

Run on the fitting source, which is saved back with the key (use the pipeline's Blender for that: a newer Blender writes a
file the older one cannot read; `--no-save` and `--save-as <copy.blend>` leave the source alone):
  blender -b --factory-startup authoring/characters/bodies/<id>/fitting.blend --python tools/characters/blender/stage_morph.py -- [--spec authoring/characters/bodies/<id>/young.json] [--no-save] [--save-as <copy.blend>]
prepare_body.py adds the same key with `--young [spec.json]`, and apply_stage_morph.py builds it in memory when the source
has none, so the shipped GLBs never depend on a saved key.

The runtime gives every life stage its proportions by bone scales (src/characters/modular/stageProportions.ts); that alone
leaves an adult's muscles, bust and face on a small figure. This key is the part bone scales cannot do:

- body: the skin is relaxed (Laplacian, welded over UV seams) so muscle definition, bust and glutes even out, then a soft
  layer is put back along the normals; hands and feet are left alone;
- face (space warps, so eyes, lids and brows move together): larger eyes, a smaller and shorter nose, a shorter lower face,
  a narrower jaw and a receding chin, fuller cheeks, a smaller mouth, a rounder forehead, thinner and more level brows.

The same builder makes the keys of the second builds (`--key build2 --spec .../build2.json`: an everyday body in place of
the hero's, pads may be negative to slim a region; `--key face2 --spec .../face2.json`: another, friendlier adult face). A
spec overrides DEFAULTS; `body` / `face` switch each half off, `relax` / `bust` / `seat` keep part of a relaxation.

The key is written at value 1 (child); the stage table drives it per stage. `apply_stage_morph.py` then carries it to the
shipped GLBs of the body and of every part that follows the skin.

Z up, the character faces -Y, rest pose, armature at the origin (as prepare_body.py leaves it).
"""
import bpy, json, os, sys
import numpy as np
from mathutils import Vector, kdtree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C
import morphs as M

KEY = "young"

DEFAULTS = {
    # master switches (a key may be body only or face only) and how much of each relaxation is kept (0..1)
    "body": 1.0, "face": 1.0, "relax": 1.0, "bust": 1.0, "seat": 1.0,
    # relaxation: iterations of the masked Laplacian (rate 0.5); `chest` runs on top of `body` for the chest front only
    "body_iters": 36, "low_iters": 120, "chest_iters": 160, "chest_rate": 1.0, "seat_rate": 0.6, "head_rate": 0.0, "bust_core": 0.065, "bust_radius": 0.13, "neck_rate": 1.0,
    # soft layer put back along the normal after relaxing, metres per region (blended by skin weights, smoothed)
    "pad": {"belly": 0.010, "hips": 0.003, "chest": 0.002, "thigh_l": 0.004, "thigh_r": 0.004, "upperarm_l": 0.004,
            "upperarm_r": 0.004, "forearm_l": 0.003, "forearm_r": 0.003, "calf_l": 0.003, "calf_r": 0.003, "neck": 0.0},
    "pad_smooth": 8,
    "eye_scale": 1.2, "eye_core": 0.015, "eye_radius": 0.036,
    "nose_scale": 0.74, "nose_radius": 0.03, "nose_depth": 0.02, "nose_lift": 0.004,
    "face_shorten": 0.16, "jaw_narrow": 0.18, "chin_back": 0.002, "chin_scale": 0.86, "chin_radius": 0.03,
    "smile": 0.002, "brow_lift": 0.004, "brow_inner": 0.0025, "brow_thin": 0.6, "brow_level": 0.5,
    "cheek": 0.007, "cheek_radius": 0.04,
    "mouth_narrow": 0.06, "mouth_radius": 0.034,
    "forehead": 0.004, "forehead_radius": 0.055,
}


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def falloff(d, r):
    t = np.clip(d / r, 0.0, 1.0)
    return (1 - t * t) ** 2


def plateau(d, r0, r1):
    """1 inside r0, smoothly to 0 at r1."""
    return falloff(np.clip(d - r0, 0.0, None), r1 - r0)


def build(body, arm, spec):
    me = body.data
    n = len(me.vertices)
    co = np.empty(n * 3, dtype=np.float64); me.vertices.foreach_get("co", co); co = co.reshape(n, 3)
    co = co @ np.array(body.matrix_world.to_3x3()).T + np.array(body.matrix_world.translation)
    nor = np.empty(n * 3, dtype=np.float64); me.vertices.foreach_get("normal", nor); nor = nor.reshape(n, 3)

    # materials per vertex: skin relaxes, eyes and brows only follow
    mats = [s.material.name if s.material else "" for s in body.material_slots]
    is_skin = np.zeros(n, bool); is_eye = np.zeros(n, bool)
    for p in me.polygons:
        name = mats[p.material_index]
        for vi in p.vertices:
            if name == "M_Eyes":
                is_eye[vi] = True
            elif name != "M_Brows":
                is_skin[vi] = True
    is_skin &= ~is_eye

    # region weights per vertex
    gname = {g.index: g.name for g in body.vertex_groups}
    regions = C.REGIONS
    rw = np.zeros((n, len(regions)))
    for v in me.vertices:
        for g in v.groups:
            nm = gname.get(g.group)
            if nm is not None:
                rw[v.index, regions.index(C.region_of_bone(nm))] += g.weight
    rw /= np.maximum(rw.sum(1, keepdims=True), 1e-9)
    R = {r: rw[:, i] for i, r in enumerate(regions)}
    w_head = R["head"]

    # weld: the importer keeps UV-seam duplicates apart; relax on the welded graph so seams do not open
    keymap = {}; weld = np.empty(n, dtype=np.int64)
    for i in range(n):
        k = (round(co[i, 0], 5), round(co[i, 1], 5), round(co[i, 2], 5), bool(is_skin[i]))
        weld[i] = keymap.setdefault(k, len(keymap))
    m = len(keymap)
    first = np.full(m, -1, dtype=np.int64)
    for i in range(n - 1, -1, -1):
        first[weld[i]] = i
    ea = []; eb = []
    for e in me.edges:
        a, b = weld[e.vertices[0]], weld[e.vertices[1]]
        if a != b:
            ea += [a, b]; eb += [b, a]
    ea = np.array(ea); eb = np.array(eb)
    deg = np.maximum(np.bincount(ea, minlength=m), 1).astype(np.float64)

    def neighbour_mean(x):
        out = np.zeros_like(x)
        np.add.at(out, ea, x[eb])
        return out / (deg[:, None] if x.ndim == 2 else deg)

    def relax(pos, rate, iters):
        p = pos.copy()
        for _ in range(iters):
            p += (0.5 * rate)[:, None] * (neighbour_mean(p) - p)
        return p

    P = co[first]; Wskin = is_skin[first]
    Rw = {r: R[r][first] for r in regions}
    L = M.landmarks(body, arm)
    H0 = np.array(L["H0"]); nose = np.array(L["nose"]); chin = np.array(L["chin"]); menton = np.array(L["menton"])
    eyes = co[is_eye]
    eye_c = [eyes[eyes[:, 0] > 0].mean(0), eyes[eyes[:, 0] < 0].mean(0)]
    eye_z = (eye_c[0][2] + eye_c[1][2]) / 2
    mouth_z = nose[2] - 0.35 * (nose[2] - menton[2])
    prof = np.array([p for p in L["profile"]])
    near = prof[np.abs(prof[:, 2] - mouth_z) < 0.004]
    mouth = near[np.argmin(near[:, 1])] if len(near) else np.array([H0[0], nose[1] + 0.01, mouth_z])

    # ---- body: relax ----
    hands = Rw["hand_l"] + Rw["hand_r"]; feet = Rw["foot_l"] + Rw["foot_r"]
    d_eye = np.minimum(np.linalg.norm(P - eye_c[0], axis=1), np.linalg.norm(P - eye_c[1], axis=1))
    ear = smoothstep(0.055, 0.075, np.abs(P[:, 0] - H0[0])) * (Rw["head"] > 0.5)        # ears stay crisp
    head_rate = spec["head_rate"] * smoothstep(0.02, 0.04, d_eye) * (1 - ear)
    # the face is taken by position as well: the chin and jaw are partly skinned to the neck, and must not relax with it
    face_w = np.maximum(smoothstep(0.15, 0.85, Rw["head"]),
                        smoothstep(menton[2] - 0.03, menton[2] - 0.008, P[:, 2]) * smoothstep(H0[1] + 0.03, H0[1] - 0.035, P[:, 1]))
    rate = (1 - hands) * (1 - feet)
    rate = rate * (1 - face_w) + head_rate * face_w
    rate = np.where(Wskin, np.clip(rate, 0, 1), 0.0)
    Nw = np.zeros((m, 3)); np.add.at(Nw, weld, nor); Nw /= np.maximum(np.linalg.norm(Nw, axis=1, keepdims=True), 1e-9)
    Q = relax(P, rate, spec["body_iters"])
    # A Laplacian also shrinks every limb. Keep only the movement along the normal, and of that only the part that differs
    # from its surroundings (bulges go in, grooves come out); the even, inward part is the shrinkage and is dropped.
    h = np.einsum("ij,ij->i", Q - P, Nw)
    low = h.copy()
    for _ in range(spec["low_iters"]):
        low = 0.5 * low + 0.5 * neighbour_mean(low)
    D = Nw * ((h - low) * (rate > 0) * spec["relax"])[:, None]
    # bust and pectorals: each relaxes much further, as a membrane held by the sternum, collarbones, ribs and flank
    P1 = P + D
    sp3 = np.array(arm.matrix_world @ arm.data.bones["spine_03"].head_local); nk = np.array(arm.matrix_world @ arm.data.bones["neck_01"].head_local)
    chest = np.zeros(m)
    for sx in (1, -1):
        # apex of the bust / pectoral: the most forward chest skin between the top of the chest bone and the collarbones
        cand = np.nonzero(Wskin & (Rw["chest"] > 0.6) & (sx * P[:, 0] > 0.04) & (sx * P[:, 0] < 0.16) & (P[:, 2] > sp3[2] - 0.06) & (P[:, 2] < nk[2] - 0.06))[0]
        if len(cand):
            apex = P[cand[np.argmin(P[cand, 1])]]
            d = np.linalg.norm((P - apex) * np.array([1.0, 0.6, 1.0]), axis=1)
            chest = np.maximum(chest, plateau(d, spec["bust_core"], spec["bust_radius"]) * (P[:, 1] < apex[1] + 0.12))
    chest = np.where(Wskin, chest * smoothstep(0.008, 0.02, np.abs(P[:, 0] - H0[0])) * (1 - Rw["upperarm_l"] - Rw["upperarm_r"]).clip(0, 1), 0.0)
    P2 = P1 + spec["bust"] * (relax(P1, np.clip(chest * spec["chest_rate"], 0, 1), spec["chest_iters"]) - P1)
    # glutes likewise, from behind
    back = smoothstep(0.02, 0.08, P[:, 1] - H0[1])
    seat = np.where(Wskin, (Rw["hips"] + 0.6 * (Rw["thigh_l"] + Rw["thigh_r"])) * back, 0.0)
    Q = P2 + spec["seat"] * (relax(P2, np.clip(seat * spec["seat_rate"], 0, 1), spec["chest_iters"] // 3) - P2)
    D = Q - P

    # ---- body: soft layer along the relaxed normals ----
    pad = np.zeros(m)
    for r, a in spec["pad"].items():
        pad += Rw[r] * a
    for _ in range(spec["pad_smooth"]):
        pad = 0.5 * pad + 0.5 * neighbour_mean(pad)
    D += Nw * (pad * Wskin)[:, None]
    D *= spec["body"]

    # back to every vertex; brows take the skin's movement under them, eyeballs none
    Dv = D[weld]
    kd = kdtree.KDTree(int(is_skin.sum())); skin_idx = np.nonzero(is_skin)[0]
    for i in skin_idx:
        kd.insert(Vector(co[i]), int(i))
    kd.balance()
    for i in np.nonzero(~is_skin & ~is_eye)[0]:
        near = kd.find_n(Vector(co[i]), 8)
        Dv[i] = np.mean([D[weld[j]] for _, j, _ in near], axis=0)
    Dv[is_eye] = 0.0

    # ---- face: space warps on everything the head carries ----
    p = co
    fy = smoothstep(H0[1] + 0.03, H0[1] - 0.035, p[:, 1])            # 1 on the face's front, 0 behind the ears
    hw = np.maximum(smoothstep(0.15, 0.85, w_head), smoothstep(menton[2] - 0.03, menton[2] - 0.008, p[:, 2]) * fy)
    W = np.zeros((n, 3))
    # lower face shorter: everything below the eyes moves up, more the lower it is
    z_ref = eye_z - 0.012
    W[:, 2] += spec["face_shorten"] * np.clip(z_ref - p[:, 2], 0, None) * fy
    # jaw narrower and chin back, growing from the mouth down to the menton
    t = np.clip((mouth[2] + 0.012 - p[:, 2]) / (mouth[2] + 0.012 - menton[2]), 0, 1)
    W[:, 0] -= (p[:, 0] - H0[0]) * spec["jaw_narrow"] * t * t * fy
    W[:, 1] += spec["chin_back"] * t * fy * smoothstep(0.06, 0.02, np.abs(p[:, 0] - H0[0]))
    # smaller chin
    cc = chin + np.array([0.0, 0.02, -0.006])
    W += (p - cc) * np.array([1.0, 1.0, 0.0]) * ((spec["chin_scale"] - 1) * falloff(np.linalg.norm(p - cc, axis=1), spec["chin_radius"]))[:, None]   # not in height: the lips stay closed
    # smaller, shorter nose
    cn = nose + np.array([0.0, spec["nose_depth"], 0.004])
    f = falloff(np.linalg.norm((p - cn) * np.array([1.0, 1.0, 0.8]), axis=1), spec["nose_radius"])
    W += (p - cn) * np.array([1.0, 1.0, 0.4]) * ((spec["nose_scale"] - 1) * f)[:, None]
    W[:, 2] += spec["nose_lift"] * f
    # smaller mouth
    cm = np.array([H0[0], mouth[1] + 0.006, mouth[2]])
    dm = np.linalg.norm((p - cm) * np.array([0.8, 1.0, 1.6]), axis=1)
    W[:, 0] -= (p[:, 0] - H0[0]) * spec["mouth_narrow"] * falloff(dm, spec["mouth_radius"])
    # larger eyes (the eyeball's core scales rigidly, the lids follow)
    for c in eye_c:
        f = plateau(np.linalg.norm(p - c, axis=1), spec["eye_core"], spec["eye_radius"])
        W += (p - c) * ((spec["eye_scale"] - 1) * f)[:, None]
    # fuller cheeks and a rounder forehead, along the skin's normal direction at the landmark
    for sx in (1, -1):
        # mouth corners up a little, brows up and level (an adult's brow sits low and slants to the nose)
        W[:, 2] += spec["smile"] * falloff(np.linalg.norm(p - np.array([H0[0] + sx * 0.024, mouth[1] + 0.008, mouth[2]]), axis=1), 0.018)
        W[:, 2] += spec["brow_lift"] * falloff(np.linalg.norm((p - np.array([H0[0] + sx * 0.034, eye_c[0][1] - 0.02, eye_z + 0.024])) * np.array([0.7, 0.6, 1.0]), axis=1), 0.03)
        W[:, 2] += spec["brow_inner"] * falloff(np.linalg.norm(p - np.array([H0[0] + sx * 0.016, eye_c[0][1] - 0.03, eye_z + 0.018]), axis=1), 0.02)
        target = np.array([H0[0] + sx * 0.042, 0.0, mouth[2] + 0.6 * (eye_z - mouth[2])])
        cand = np.nonzero(is_skin & (np.abs(p[:, 0] - target[0]) < 0.006) & (np.abs(p[:, 2] - target[2]) < 0.006))[0]
        if len(cand):
            ci = cand[np.argmin(p[cand, 1])]
            f = falloff(np.linalg.norm(p - p[ci], axis=1), spec["cheek_radius"])
            W += nor[ci] * (spec["cheek"] * f)[:, None]
    cand = np.nonzero(is_skin & (np.abs(p[:, 0] - H0[0]) < 0.006) & (np.abs(p[:, 2] - (eye_z + 0.06)) < 0.006))[0]
    if len(cand):
        ci = cand[np.argmin(p[cand, 1])]
        f = falloff(np.linalg.norm(p - p[ci], axis=1), spec["forehead_radius"])
        W += np.array([0.0, -1.0, 0.0]) * (spec["forehead"] * f)[:, None]
    Dv += W * hw[:, None] * spec["face"]
    # thinner, more level brows (the brow mesh only): an adult's heavy, slanted brow reads as a frown on a small face
    is_brow = ~is_skin & ~is_eye & (p[:, 2] > eye_z + 0.008) & (w_head > 0.5)
    for sx in (1, -1):
        idx = np.nonzero(is_brow & (sx * (p[:, 0] - H0[0]) > 0))[0]
        if len(idx) < 8:
            continue
        x = p[idx, 0]; z = p[idx, 2]
        slope, z0 = np.polyfit(x, z, 1)
        line = slope * x + z0                                  # the brow's own centre line
        Dv[idx, 2] += spec["face"] * ((spec["brow_thin"] - 1) * (z - line) - spec["brow_level"] * slope * (x - x.mean()))

    report = {"landmarks": {"nose": nose.round(4).tolist(), "chin": chin.round(4).tolist(), "menton": menton.round(4).tolist(),
                            "mouth": mouth.round(4).tolist(), "eye_l": eye_c[0].round(4).tolist(), "eye_r": eye_c[1].round(4).tolist()},
              "max": round(float(np.linalg.norm(Dv, axis=1).max()), 4),
              "mean_body": round(float(np.linalg.norm(Dv[w_head < 0.1], axis=1).mean()), 4),
              "verts": n, "welded": m}
    return Dv, report


def load_spec(path=None):
    spec = dict(DEFAULTS)
    if path and os.path.exists(path):
        with open(path) as f:
            over = json.load(f)
        pad = dict(spec["pad"]); pad.update(over.pop("pad", {})); spec.update(over); spec["pad"] = pad
    return spec


def add_key(body, arm, spec, name=KEY):
    """Adds (or replaces) a shape key built from `spec` on a prepared body (`young` by default); returns the report."""
    keys = body.data.shape_keys
    if not keys:
        body.shape_key_add(name="Basis", from_mix=False)
    elif name in keys.key_blocks:
        body.shape_key_remove(keys.key_blocks[name])
    for kb in body.data.shape_keys.key_blocks:
        kb.value = 0.0
    Dv, report = build(body, arm, spec)
    inv = np.array(body.matrix_world.inverted().to_3x3())
    key = body.shape_key_add(name=name, from_mix=False)
    n = len(body.data.vertices)
    base = np.empty(n * 3); body.data.vertices.foreach_get("co", base)
    key.data.foreach_set("co", (base.reshape(n, 3) + Dv @ inv.T).ravel())
    key.slider_min = 0.0; key.slider_max = 1.5
    return report


def main():
    a = C.args()
    body = bpy.data.objects["Body"]
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    print("STAGE_MORPH", json.dumps(add_key(body, arm, load_spec(a.get("spec")), a.get("key", KEY))))
    if a.get("save-as"):
        bpy.ops.wm.save_as_mainfile(filepath=a["save-as"], compress=True, copy=True)
    elif not a.get("no-save"):
        bpy.ops.wm.save_mainfile(compress=True)


if __name__ == "__main__":
    main()
