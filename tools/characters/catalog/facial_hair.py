"""Facial-hair catalog for the modular style: one table -> authoring/characters/facial_hair/<id>/params.json.

  python3 tools/characters/catalog/facial_hair.py [--write]

Built by build_hair.py in beard mode (`"beard": {...areas}`): clumps grow on the face skin of the chosen areas
(mustache, soul, chin, jaw, cheeks, sideburns, neck), over a raised skin layer in the hair colour (stubble). Weights
and face morphs come from the nearest body vertex, so beards follow jaw width, chin length and mouth width.
"""
import copy, json, os, sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
BASE = {"attachment": "skinned", "clumps": 120, "points": 4, "length": 0.012, "length_jitter": 0.2, "volume": 0.003,
        "part_offset": 0.0, "back_flow": 0.0, "gravity": 0, "hairline_front": 0.8, "hairline_back": 0.3,
        "clump_width": 0.012, "clump_flatness": 0.5, "root_offset": 0.001, "resolution_cm": 0.8, "target_tris": 5000,
        "profile_resolution": 2, "cap": True, "cap_offset": 0.0015,
        "color_regions": [{"id": "hair", "label": "Beard", "materials": ["M_Beard"], "default": "#3a2418"}]}
D = []
FULL = dict(mustache=True, chin=True, jaw=True, cheeks=True, sideburns=True, soul=True)


BEARD_KEYS = ("chin_w", "cheek_h", "spread", "forward")


def f(id_, label, tags, areas, **kw):
    extra = dict(kw.pop("beard_extra", {}))
    for k in BEARD_KEYS:
        if k in kw:
            extra[k] = kw.pop(k)
    d = copy.deepcopy(BASE); d.update(kw)
    d.update(id=id_, label=label, tags=tags, beard=dict(areas, **extra))
    D.append(d)


f("stubble", "Stubble", ["short"], FULL, clumps=0, cap_offset=0.0012)
f("stubble_heavy", "Heavy stubble", ["short"], dict(FULL, neck=True), clumps=0, cap_offset=0.0022)
f("beard_short", "Short beard", ["beard"], dict(FULL), clumps=170, length=0.01)
f("beard_full", "Full beard", ["beard"], dict(FULL, neck=True), clumps=220, length=0.024, volume=0.005, clump_width=0.016,
  target_tris=7000)
f("beard_long", "Long beard", ["beard", "long"], dict(FULL, neck=True), clumps=220, length=0.07, points=6, volume=0.008,
  clump_width=0.02, target_tris=9000)
f("goatee", "Goatee", ["beard"], dict(mustache=True, chin=True, soul=True), clumps=90, length=0.016)
f("van_dyke", "Van Dyke", ["beard"], dict(mustache=True, chin=True), clumps=80, length=0.02, chin_w=0.022)
f("chin_strap", "Chin strap", ["beard"], dict(jaw=True, chin=True, sideburns=True), clumps=110, length=0.008)
f("circle_beard", "Circle beard", ["beard"], dict(mustache=True, chin=True, soul=True), clumps=110, length=0.01, chin_w=0.04)
f("mustache", "Mustache", ["mustache"], dict(mustache=True), clumps=50, length=0.012)
f("mustache_chevron", "Chevron mustache", ["mustache"], dict(mustache=True), clumps=60, length=0.02, volume=0.005, clump_width=0.016)
f("mustache_handlebar", "Handlebar mustache", ["mustache"], dict(mustache=True), clumps=60, length=0.03, volume=0.004,
  beard_extra={"spread": 0.9, "forward": 0.1})
f("soul_patch", "Soul patch", ["short"], dict(soul=True), clumps=20, length=0.012)
f("sideburns", "Sideburns", ["short"], dict(sideburns=True), clumps=60, length=0.008)
f("mutton_chops", "Mutton chops", ["beard"], dict(sideburns=True, cheeks=True, jaw=True, mustache=True), clumps=150, length=0.016)
f("anchor_beard", "Anchor beard", ["beard"], dict(mustache=True, chin=True, soul=True), clumps=100, length=0.03, points=5, chin_w=0.03)

if __name__ == "__main__":
    print(len(D), "facial hair")
    if "--write" in sys.argv:
        for d in D:
            out = os.path.join(REPO, "authoring/characters/facial_hair", d["id"], "params.json")
            os.makedirs(os.path.dirname(out), exist_ok=True)
            json.dump(d, open(out, "w"), indent=1)
        print("wrote", len(D))
