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
