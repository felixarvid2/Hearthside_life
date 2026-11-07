"""Explicit OpenSew-2 measurement adapter for the Quaternius UAL / Universal Base Characters rig.

OpenSew-2 finds landmarks by bone-name substrings for CC4, Mixamo and Rigify. The Quaternius rig uses Unreal-style
names (upperarm_l, lowerarm_l, thigh_l, calf_l, spine_03, neck_01), which it does not recognise: 'thigh.l' is not a
substring of 'thigh_l', and lower arms are not excluded from the torso cross-sections. This module adds the
Quaternius names in front of the add-on's own candidates at run time. The add-on files are not modified.
"""

QUATERNIUS = {
    "BONE_TABLE": {"neck": ["neck_01"], "chest": ["spine_03"], "waist": ["spine_01"], "hip": ["pelvis"]},
    "LIMB_CHAINS": {
        "arm_l": (["upperarm_l"], ["lowerarm_l"]), "arm_r": (["upperarm_r"], ["lowerarm_r"]),
        "farm_l": (["lowerarm_l"], ["hand_l"]), "farm_r": (["lowerarm_r"], ["hand_r"]),
        "thigh_l": (["thigh_l"], ["calf_l"]), "thigh_r": (["thigh_r"], ["calf_r"]),
        "calf_l": (["calf_l"], ["foot_l"]), "calf_r": (["calf_r"], ["foot_r"]),
    },
    "LIMB_GROUPS": {
        "arm_l": ("upperarm_l",), "arm_r": ("upperarm_r",), "farm_l": ("lowerarm_l",), "farm_r": ("lowerarm_r",),
        "thigh_l": ("thigh_l",), "thigh_r": ("thigh_r",), "calf_l": ("calf_l",), "calf_r": ("calf_r",),
    },
    "EXCLUDE_TORSO": ("lowerarm", "clavicle_never"),
}


def install():
    from clothing_design import avatar
    for k, v in QUATERNIUS["BONE_TABLE"].items():
        avatar.BONE_TABLE[k] = v + [x for x in avatar.BONE_TABLE[k] if x not in v]
    for k, (a, b) in QUATERNIUS["LIMB_CHAINS"].items():
        oa, ob = avatar.LIMB_CHAINS[k]
        avatar.LIMB_CHAINS[k] = (a + oa, b + ob)
    for k, v in QUATERNIUS["LIMB_GROUPS"].items():
        avatar.LIMB_GROUPS[k] = tuple(v) + tuple(avatar.LIMB_GROUPS[k])
    avatar.EXCLUDE_TORSO = tuple(avatar.EXCLUDE_TORSO) + ("lowerarm",)
    return avatar


def widen_armhole(library, depth_extra=0.0, scye_max=0.05):
    """Lets the top drafts reach a larger armhole on a muscular arm.

    OpenSew-2 sizes the armhole to 1.35 x the arm's girth near the shoulder, but limits the solve: at most 10 cm
    deeper than the armpit and at most 5 cm wider at the scye. On the Quaternius male (58 cm around the deltoid)
    that stops at 50 of the 78 cm needed, and the sleeve - never wider than 82 % of the armhole - ends up narrower
    than the arm it must close around, so the cloth bunches at the shoulder. This raises the two limits
    (`depth_extra` metres more depth, scye up to `scye_max`) for the duration of one draft; the solve itself and the
    add-on's files are unchanged.
    """
    if getattr(library, "_hs_widened", None) == (depth_extra, scye_max):
        return
    orig_draft = getattr(library, "_hs_orig_draft_top", library._draft_top)
    orig_solve = library._solve
    library._hs_orig_draft_top = orig_draft

    def draft(m, fit, *args, **kw):
        def solve(fn, target, lo, hi, iters=40):
            # recognised by their bounds: depth (max(0.10, anat), anat + 0.10), scye (0, 0.05); the neckline solve
            # (0.02, 0.30) and any other call pass through unchanged
            if lo >= 0.10 and abs((hi - lo) - 0.10) < 1e-6:
                hi = hi + depth_extra
            elif lo == 0.0 and abs(hi - 0.05) < 1e-9:
                hi = max(hi, scye_max)
            return orig_solve(fn, target, lo, hi, iters)
        library._solve = solve
        try:
            return orig_draft(m, fit, *args, **kw)
        finally:
            library._solve = orig_solve
    library._draft_top = draft
    library._hs_widened = (depth_extra, scye_max)
