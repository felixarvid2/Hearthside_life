"""Accessory catalog for the modular style: one table -> authoring/characters/accessories/<id>/params.json.

  python3 tools/characters/catalog/accessories.py [--write]

Procedural models built by build_accessory.py; slots: hat, eyewear, earrings, neck, wrist, waist, bag.
"""
import json, os, sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
PAL = {
    "metal": ["#d4af37", "#c0c0c0", "#b87333", "#2f2f33", "#e5e4e2", "#8c7853"],
    "fabric": ["#2f2f33", "#c94f4f", "#3f6fa8", "#e0b341", "#5c8a5a", "#f2efe6"],
    "leather": ["#3a2a20", "#6b4428", "#1f1f1f", "#8c5a3c", "#c8a27a", "#5b5b5b"],
    "straw": ["#d9c7a7", "#c8a27a", "#f2efe6", "#2f2f33", "#8a7560", "#e8d9b5"],
    "lens": ["#1f2633", "#3a2a20", "#2e4034", "#5b3a3a", "#6d8fb5", "#2f2f33"],
    "stone": ["#f2efe6", "#c94f4f", "#3f6fa8", "#5c8a5a", "#9b5de5", "#2f2f33"],
}
D = []


def acc(id_, label, slot, kind, tags, main="fabric", second=None, metallic=False, **kw):
    regions = [{"id": "main", "label": "Main", "materials": ["M_" + "".join(w.title() for w in id_.split("_"))],
                "default": PAL[main][0], "palette": PAL[main], "metallic": 0.8 if metallic else 0.0,
                "roughness": 0.35 if metallic else 0.6}]
    if second:
        lab, pal = second
        regions.append({"id": "detail", "label": lab, "materials": [regions[0]["materials"][0] + "Detail"],
                        "default": PAL[pal][0], "palette": PAL[pal], "roughness": 0.3})
    d = dict(id=id_, label=label, slot=slot, category="accessory", kind=kind, tags=tags, color_regions=regions, layer=3, conflicts=[])
    d.update(kw)
    D.append(d)


# hats (8)
acc("cap_baseball", "Baseball cap", "hat", "cap", ["cap"], "fabric", ("Brim", "fabric"))
acc("beanie", "Beanie", "hat", "beanie", ["warm"], "fabric", hair_room=0.018, **{"from": 0.55})
acc("fedora", "Fedora", "hat", "fedora", ["formal"], "leather", ("Band", "fabric"), hair_room=0.016, **{"from": 0.66})
acc("sun_hat", "Sun hat", "hat", "sun_hat", ["summer"], "straw", hair_room=0.016, **{"from": 0.66})
acc("bucket_hat", "Bucket hat", "hat", "bucket_hat", ["summer"], "fabric", hair_room=0.016, **{"from": 0.64})
acc("beret", "Beret", "hat", "beret", ["formal"], "fabric", hair_room=0.016)
acc("headband", "Headband", "hat", "headband", ["sport"], "fabric", height=0.74)
acc("hairband_thin", "Thin hairband", "hat", "headband", ["hair"], "metal", metallic=True, height=0.82, band=0.0035, flat=1.2)
# eyewear (5)
acc("glasses_round", "Round glasses", "eyewear", "glasses", ["glasses"], "metal", metallic=True, shape="round")
acc("glasses_square", "Square glasses", "eyewear", "glasses", ["glasses"], "leather", shape="square", frame=0.0025)
acc("reading_glasses", "Reading glasses", "eyewear", "glasses", ["glasses"], "metal", metallic=True, shape="square", lens_h=0.012, raise_=-0.006)
acc("sunglasses_aviator", "Aviator sunglasses", "eyewear", "sunglasses", ["sunglasses"], "metal", ("Lenses", "lens"), metallic=True, shape="aviator")
acc("sunglasses_wayfarer", "Wayfarer sunglasses", "eyewear", "sunglasses", ["sunglasses"], "leather", ("Lenses", "lens"), shape="square",
    frame=0.003, lens_w=0.026)
# earrings (3)
acc("earrings_stud", "Stud earrings", "earrings", "earrings_stud", ["jewellery"], "stone")
acc("earrings_hoop", "Hoop earrings", "earrings", "earrings_hoop", ["jewellery"], "metal", metallic=True)
acc("earrings_drop", "Drop earrings", "earrings", "earrings_drop", ["jewellery"], "metal", ("Stone", "stone"), metallic=True)
# neck (7)
acc("necklace_chain", "Chain necklace", "neck", "necklace", ["jewellery"], "metal", metallic=True, height=0.05, sag=0.03)
acc("pendant", "Pendant", "neck", "pendant", ["jewellery"], "metal", ("Pendant", "stone"), metallic=True, height=0.05, sag=0.05)
acc("choker", "Choker", "neck", "choker", ["jewellery"], "leather", height=0.5, room=0.002)
acc("pearls", "Pearl necklace", "neck", "pearls", ["jewellery", "formal"], "stone", height=0.08)
acc("scarf", "Scarf", "neck", "scarf", ["warm"], "fabric", height=0.35)
acc("tie", "Tie", "neck", "tie", ["formal"], "fabric")
acc("bow_tie", "Bow tie", "neck", "bow_tie", ["formal"], "fabric")
# wrist (4)
acc("watch_classic", "Wristwatch", "wrist", "watch", ["watch"], "leather", ("Case", "metal"))
acc("smartwatch", "Smartwatch", "wrist", "smartwatch", ["watch", "sport"], "fabric", ("Screen", "lens"))
acc("bangle", "Bangle", "wrist", "bangle", ["jewellery"], "metal", metallic=True, side="r")
acc("cuff_bracelet", "Cuff bracelet", "wrist", "cuff", ["jewellery"], "metal", metallic=True, side="r")
# waist (2)
acc("belt_leather", "Leather belt", "waist", "belt", ["belt"], "leather", ("Buckle", "metal"))
acc("belt_wide", "Wide belt", "waist", "belt_wide", ["belt"], "leather", ("Buckle", "metal"), drop=-0.02)
# bags (3)
acc("backpack", "Backpack", "bag", "backpack", ["bag"], "fabric", ("Straps", "leather"))
acc("crossbody_bag", "Crossbody bag", "bag", "crossbody", ["bag"], "leather", ("Strap", "leather"))
acc("fanny_pack", "Belt bag", "bag", "fanny_pack", ["bag", "sport"], "fabric", ("Strap", "fabric"))

if __name__ == "__main__":
    ids = [d["id"] for d in D]
    assert len(ids) == len(set(ids))
    print(len(D), "accessories")
    if "--write" in sys.argv:
        for d in D:
            if "raise_" in d:
                d["raise"] = d.pop("raise_")
            out = os.path.join(REPO, "authoring/characters/accessories", d["id"], "params.json")
            os.makedirs(os.path.dirname(out), exist_ok=True)
            json.dump(d, open(out, "w"), indent=1)
        print("wrote", len(D))
