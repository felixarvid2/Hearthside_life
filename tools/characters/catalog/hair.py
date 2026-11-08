"""Hairstyle catalog for the modular (Quaternius) style: one table -> authoring/characters/hair/<id>/params.json.

  python3 tools/characters/catalog/hair.py [--write]

Every entry is a GBH Tool stylized mesh hair (build_hair.py) from generated guides; the table only sets the design
parameters (length, flow, part, fringe, curls, waves, gathers, buns, braids, root masks). The Stage C styles
short_crop, bob_chin and ponytail_mid keep their hand-tuned params. Hair colour is the person's hair colour.
"""
import copy, json, os, sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
BASE = {
    "attachment": "skinned", "clumps": 140, "points": 7, "length": 0.085, "length_jitter": 0.15, "volume": 0.009,
    "part_offset": 0.025, "back_flow": 0.55, "gravity": 0, "hairline_front": 0.8, "hairline_back": 0.3,
    "clump_width": 0.05, "clump_flatness": 0.35, "root_offset": 0.002, "resolution_cm": 2.4, "target_tris": 9000,
    "profile_resolution": 2, "cap": True, "cap_offset": 0.004,
    "color_regions": [{"id": "hair", "label": "Hair", "materials": ["M_Hair"], "default": "#4a3020"}],
}
LONG = dict(gravity=1.0, fall_below=0.55, points=11, back_flow=0.35, front_side=2.5, clumps=170, clump_width=0.055,
            volume=0.012, resolution_cm=3.0, target_tris=14000)
D = []


def h(id_, label, tags, **kw):
    d = copy.deepcopy(BASE)
    d.update(kw)
    d["id"], d["label"], d["tags"] = id_, label, tags
    D.append(d)


def long_(**kw):
    d = dict(LONG); d.update(kw); return d


# ---- short (15) ----------------------------------------------------------------------------------------------------
h("buzz_cut", "Buzz cut", ["short"], length=0.012, points=3, clumps=220, clump_width=0.03, volume=0.003, cap_offset=0.003, target_tris=6000)
h("crew_cut", "Crew cut", ["short"], length=0.035, points=4, clumps=180, clump_width=0.035, volume=0.005)
h("short_textured", "Textured crop", ["short"], length=0.07, length_jitter=0.35, clump_width=0.04)
h("side_part_short", "Side part", ["short"], length=0.08, part_offset=0.045, front_side=1.5)
h("slick_back", "Slicked back", ["short"], length=0.12, back_flow=1.4, front_side=0.2, volume=0.006, clump_flatness=0.25)
h("spiky", "Spiky", ["short"], length=0.06, flow="radial", radial_up=0.6, clump_width=0.03, clump_flatness=0.6, length_jitter=0.3)
h("caesar", "Caesar cut", ["short", "fringe"], length=0.06, fringe={"depth": 0.05, "to": 0.82, "sweep": 0.0, "length": 0.05})
h("pixie", "Pixie cut", ["short", "fringe"], length=0.09, fringe={"depth": 0.05, "to": 0.72, "sweep": 0.6, "length": 0.1})
h("undercut", "Undercut", ["short"], length=0.13, back_flow=0.9, root_mask={"kind": "undercut", "above": 0.76}, cap_offset=0.003)
h("mohawk", "Mohawk", ["short", "bold"], length=0.09, flow="radial", radial_up=1.2, root_mask={"kind": "mohawk", "width": 0.03},
  clump_width=0.035, clump_flatness=0.5, clumps=90)
h("faux_hawk", "Faux hawk", ["short"], length=0.07, flow="radial", radial_up=0.8, root_mask={"kind": "mohawk", "width": 0.05}, clumps=110)
h("curly_short", "Short curls", ["short", "curly"], length=0.07, volume=0.014, curl={"radius": 0.007, "per_m": 45, "from": 0.2},
  clump_width=0.03, clump_flatness=0.8, clumps=170)
h("afro_short", "Short afro", ["short", "curly"], length=0.045, flow="sphere", sphere_r=0.135, sphere_h=0.6, volume=0.02,
  curl={"radius": 0.006, "per_m": 60, "from": 0.1}, clump_width=0.03, clump_flatness=0.9, clumps=220, target_tris=11000)
h("receding", "Receding crop", ["short"], length=0.045, hairline_front=0.9, clump_width=0.035)
h("ivy_league", "Ivy League", ["short"], length=0.075, part_offset=0.05, back_flow=0.9, front_side=1.2)

# ---- medium (17) ---------------------------------------------------------------------------------------------------
h("bob_long", "Long bob", ["medium"], **long_(length=0.36, cut_at=-0.35, length_jitter=0.04, part_offset=0.0))
h("bob_bangs", "Bob with bangs", ["medium", "fringe"], **long_(length=0.32, cut_at=-0.1, length_jitter=0.04,
  fringe={"depth": 0.05, "to": 0.6, "sweep": 0.1, "length": 0.11}))
h("bob_side", "Side-part bob", ["medium"], **long_(length=0.32, cut_at=-0.15, part_offset=0.05, front_side=3.0, length_jitter=0.05))
h("shag", "Shag", ["medium"], **long_(length=0.3, length_jitter=0.4, wave={"amp": 0.008, "per_m": 9},
  fringe={"depth": 0.05, "to": 0.62, "sweep": 0.7, "length": 0.1}))
h("curtain_bangs", "Curtain bangs", ["medium", "fringe"], **long_(length=0.33, fringe={"depth": 0.05, "to": 0.58, "sweep": 1.1, "length": 0.14}))
h("wavy_medium", "Medium waves", ["medium", "wavy"], **long_(length=0.3, wave={"amp": 0.012, "per_m": 7}))
h("curly_medium", "Medium curls", ["medium", "curly"], **long_(length=0.25, volume=0.018, curl={"radius": 0.011, "per_m": 28, "from": 0.2},
  clump_flatness=0.8, clump_width=0.04))
h("shoulder_straight", "Shoulder length", ["medium"], **long_(length=0.38, cut_at=-0.6, length_jitter=0.05))
h("layered_medium", "Layered cut", ["medium"], **long_(length=0.32, length_jitter=0.35))
h("side_swept", "Side-swept", ["medium"], **long_(length=0.28, part_offset=0.06, front_side=3.5))
h("afro", "Afro", ["medium", "curly", "bold"], length=0.1, flow="sphere", sphere_r=0.17, sphere_h=0.6, volume=0.03,
  curl={"radius": 0.008, "per_m": 50, "from": 0.05}, clump_width=0.035, clump_flatness=0.9, clumps=260, target_tris=14000,
  resolution_cm=3.0)
h("mullet", "Mullet", ["medium", "bold"], **long_(length=0.22, length_jitter=0.2, hairline_back=0.2, front_side=1.0, back_flow=0.6))
h("curly_bob", "Curly bob", ["medium", "curly"], **long_(length=0.24, cut_at=-0.05, volume=0.02,
  curl={"radius": 0.01, "per_m": 32, "from": 0.25}, clump_flatness=0.8))
h("twists_short", "Short twists", ["medium", "textured"], **long_(length=0.16, clumps=120, clump_width=0.022, clump_flatness=1.0,
  curl={"radius": 0.004, "per_m": 60, "from": 0.1}, gravity=0.6))
h("dreads_short", "Short locs", ["medium", "textured"], **long_(length=0.2, clumps=90, clump_width=0.028, clump_flatness=1.0, gravity=0.8))
h("middle_part", "Middle part", ["medium"], **long_(length=0.3, part_offset=0.0, front_side=2.0))
h("wolf_cut", "Wolf cut", ["medium", "bold"], **long_(length=0.26, length_jitter=0.45, volume=0.016, wave={"amp": 0.01, "per_m": 10},
  fringe={"depth": 0.05, "to": 0.64, "sweep": 0.5, "length": 0.1}))

# ---- long (12) -----------------------------------------------------------------------------------------------------
h("long_straight", "Long straight", ["long"], **long_(length=0.52, length_jitter=0.05))
h("long_wavy", "Long waves", ["long", "wavy"], **long_(length=0.5, wave={"amp": 0.016, "per_m": 6}))
h("long_curly", "Long curls", ["long", "curly"], **long_(length=0.45, volume=0.02, curl={"radius": 0.013, "per_m": 22, "from": 0.2},
  clump_flatness=0.8))
h("long_layered", "Long layers", ["long"], **long_(length=0.5, length_jitter=0.35))
h("long_side_part", "Long side part", ["long"], **long_(length=0.5, part_offset=0.055, front_side=3.0))
h("long_bangs", "Long with bangs", ["long", "fringe"], **long_(length=0.5, fringe={"depth": 0.05, "to": 0.6, "sweep": 0.1, "length": 0.11}))
h("long_center", "Long centre part", ["long"], **long_(length=0.5, part_offset=0.0, front_side=2.2))
h("waist_length", "Waist-length", ["long"], **long_(length=0.72, points=14, length_jitter=0.05))
h("locs_long", "Long locs", ["long", "textured"], **long_(length=0.48, clumps=100, clump_width=0.026, clump_flatness=1.0))
h("box_braids", "Box braids", ["long", "textured"], **long_(length=0.55, clumps=130, clump_width=0.02, clump_flatness=1.0,
  curl={"radius": 0.003, "per_m": 70, "from": 0.05}))
h("long_beach", "Beach waves", ["long", "wavy"], **long_(length=0.46, wave={"amp": 0.022, "per_m": 4}, length_jitter=0.25))
h("half_up", "Half up", ["long"], **long_(length=0.45, gathers=[{"angle": 0, "gather_h": 0.75, "kind": "tail", "tail_len": 0.12, "tail_points": 5}],
  gather_all=False, gather_above=0.82))

# ---- gathered (13) -------------------------------------------------------------------------------------------------
G = lambda **kw: dict(dict(volume=0.005, clump_width=0.032, clump_flatness=0.6, clumps=180, resolution_cm=3.0, target_tris=14000), **kw)
h("ponytail_high", "High ponytail", ["gathered"], **G(gathers=[{"angle": 0, "gather_h": 0.82, "kind": "tail", "tail_len": 0.3, "tail_out": 0.06}]))
h("ponytail_low", "Low ponytail", ["gathered"], **G(gathers=[{"angle": 0, "gather_h": 0.22, "kind": "tail", "tail_len": 0.26, "tail_out": 0.03}]))
h("ponytail_side", "Side ponytail", ["gathered"], **G(gathers=[{"angle": 70, "gather_h": 0.3, "kind": "tail", "tail_len": 0.26, "tail_out": 0.03}]))
h("pigtails", "Pigtails", ["gathered"], **G(gathers=[{"angle": 80, "gather_h": 0.5, "kind": "tail", "tail_len": 0.22, "tail_out": 0.04},
                                                      {"angle": -80, "gather_h": 0.5, "kind": "tail", "tail_len": 0.22, "tail_out": 0.04}]))
h("braid_single", "Single braid", ["gathered", "braid"], **G(gathers=[{"angle": 0, "gather_h": 0.35, "kind": "braid", "tail_len": 0.36,
                                                                       "braid_w": 0.013, "braid_twists": 6, "tail_points": 9}]))
h("braids_two", "Two braids", ["gathered", "braid"], **G(gathers=[{"angle": 75, "gather_h": 0.35, "kind": "braid", "tail_len": 0.32, "braid_w": 0.011,
                                                                    "braid_twists": 6, "tail_points": 9},
                                                                   {"angle": -75, "gather_h": 0.35, "kind": "braid", "tail_len": 0.32, "braid_w": 0.011,
                                                                    "braid_twists": 6, "tail_points": 9}]))
h("top_bun", "Top bun", ["gathered", "bun"], **G(gathers=[{"angle": 0, "gather_h": 1.0, "kind": "bun", "bun_r": 0.04, "bun_turns": 1.8}]))
h("low_bun", "Low bun", ["gathered", "bun"], **G(gathers=[{"angle": 0, "gather_h": 0.28, "kind": "bun", "bun_r": 0.035, "bun_turns": 1.6}]))
h("space_buns", "Space buns", ["gathered", "bun"], **G(gathers=[{"angle": 55, "gather_h": 0.9, "kind": "bun", "bun_r": 0.03, "bun_turns": 1.5},
                                                                 {"angle": -55, "gather_h": 0.9, "kind": "bun", "bun_r": 0.03, "bun_turns": 1.5}]))
h("messy_bun", "Messy bun", ["gathered", "bun"], **G(gathers=[{"angle": 0, "gather_h": 0.85, "kind": "bun", "bun_r": 0.045, "bun_turns": 2.4}],
                                                      length_jitter=0.3, clump_flatness=0.4))
h("top_knot", "Top knot", ["gathered", "bun", "short"], **G(gathers=[{"angle": 0, "gather_h": 0.95, "kind": "bun", "bun_r": 0.03, "bun_turns": 1.4}],
                                                                root_mask={"kind": "undercut", "above": 0.74}))
h("braided_ponytail", "Braided ponytail", ["gathered", "braid"], **G(gathers=[{"angle": 0, "gather_h": 0.7, "kind": "braid", "tail_len": 0.34,
                                                                               "braid_w": 0.012, "braid_twists": 6, "tail_points": 9, "tail_out": 0.05}]))
h("cornrows", "Cornrows", ["gathered", "braid", "textured"], **G(gathers=[{"angle": 0, "gather_h": 0.25, "kind": "braid", "tail_len": 0.3,
                                                                            "braid_w": 0.01, "braid_twists": 7, "tail_points": 9}],
                                                                  volume=0.003, clump_width=0.014, clump_flatness=1.0, clumps=200))


if __name__ == "__main__":
    ids = [d["id"] for d in D]
    assert len(ids) == len(set(ids))
    print(len(D), "hairstyles (+3 Stage C)")
    if "--write" in sys.argv:
        for d in D:
            out = os.path.join(REPO, "authoring/characters/hair", d["id"], "params.json")
            os.makedirs(os.path.dirname(out), exist_ok=True)
            json.dump(d, open(out, "w"), indent=1)
        print("wrote", len(D))
