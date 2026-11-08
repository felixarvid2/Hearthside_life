"""Garment catalog for the modular (Quaternius) style: one design table -> params.json per garment.

  python3 tools/characters/catalog/garments.py [--write]      (lists, or writes authoring/characters/garments/<id>/params.json)

Each design is a body-shell garment (build_garment.py `finish.mode = "body"`) defined by cut parameters
(garment_parts.py): neckline, sleeve and leg lengths, hem and waist heights, openings, skirts, soles. The three
OpenSew-2-sewn Stage C garments (tshirt_crew, trousers_straight, hoodie_pullover) keep their own hand-written params.
A colour is a variant (palette), never a new design: every entry here differs in shape.
"""
import json, os, sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))

# palettes (6 each)
P = {
    "basic": ["#f2efe6", "#2f2f33", "#3f6fa8", "#c94f4f", "#5c8a5a", "#e0b341"],
    "pastel": ["#f4d6d6", "#d6e4f4", "#dff0d8", "#f7ebc6", "#e6dcf2", "#f2f2f2"],
    "earth": ["#7a5c3e", "#a68a64", "#4d5b3a", "#b85c38", "#d9c7a7", "#3b3b3b"],
    "denim": ["#3b5a85", "#2c3e5c", "#6d8fb5", "#1f2633", "#8aa1b8", "#4a4a4a"],
    "dark": ["#2f2f33", "#3b4252", "#5b3a3a", "#2e4034", "#6b5a45", "#8c9aa8"],
    "bright": ["#e04f5f", "#f29e4c", "#f1c453", "#2bb3a3", "#3d7cc9", "#9b5de5"],
    "neutral": ["#b9b4aa", "#7a7a7a", "#e8e2d6", "#4a4a4a", "#8a7560", "#f2efe6"],
    "leather": ["#3a2a20", "#6b4428", "#1f1f1f", "#8c5a3c", "#c8a27a", "#5b5b5b"],
    "sole": ["#3a3a3a", "#f2efe6", "#6b4428", "#c8a27a", "#1f1f1f", "#9a9a9a"],
}

SLOT = {
    "top": dict(lo=0.007, hi=0.022, fh=0.012, layer=1),
    "outer": dict(lo=0.02, hi=0.04, fh=0.026, layer=2),
    "bottom": dict(lo=0.004, hi=0.016, fh=0.008, layer=1),
    "full": dict(lo=0.006, hi=0.02, fh=0.011, layer=1),
    "shoes": dict(lo=0.006, hi=0.012, fh=0.009, layer=1),
}

D = []


def g(id_, label, slot, tags, cut, palette="basic", skirt=None, hood=None, sole=None, welt=0.0, fh=None, label2=None,
      sole_palette="sole"):
    D.append(dict(id=id_, label=label, slot=slot, tags=tags, cut=cut, palette=palette, skirt=skirt, hood=hood,
                  sole=sole, welt=welt, fh=fh, sole_palette=sole_palette))


H = lambda at, off=0.0: {"at": at, "offset": off}

# ---- tops (40 with the two sewn ones) --------------------------------------------------------------------------
top = lambda neck, sleeve, hem, **k: dict(part="top", neck=neck if isinstance(neck, dict) else {"kind": neck}, sleeve=sleeve, hem=hem, force=True, **k)
g("tee_v", "V-neck tee", "top", ["tee"], top("v", 0.42, H("hip", 0.02)))
g("tee_scoop", "Scoop tee", "top", ["tee"], top("scoop", 0.4, H("hip", 0.02)), "pastel")
g("tee_cap", "Cap-sleeve tee", "top", ["tee"], top("crew", 0.16, H("hip", 0.02)), "bright")
g("tee_elbow", "Elbow-sleeve tee", "top", ["tee"], top("crew", 0.6, H("hip", 0.02)), "neutral")
g("tee_crop", "Cropped tee", "top", ["tee", "crop"], top("crew", 0.4, H("waist", 0.03)), "bright")
g("tee_square", "Square-neck tee", "top", ["tee"], top({"kind": "square", "depth": 0.05}, 0.4, H("hip", 0.02)), "pastel")
g("tee_long", "Long-sleeve tee", "top", ["tee", "long"], top("crew", 1.0, H("hip", 0.02)))
g("henley", "Henley", "top", ["tee", "long"], top({"kind": "v", "depth": 0.05}, 0.97, H("hip", 0.03)), "earth")
g("longsleeve_v", "Long-sleeve V-neck", "top", ["long"], top("v", 1.0, H("hip", 0.02)), "dark")
g("longsleeve_scoop", "Long-sleeve scoop", "top", ["long"], top("scoop", 1.0, H("hip", 0.02)), "pastel")
g("three_quarter_top", "Three-quarter top", "top", ["long"], top("crew", 0.78, H("hip", 0.02)), "neutral")
g("tank_crew", "Crew tank", "top", ["tank"], top("crew", -0.12, H("hip", 0.02)))
g("tank_scoop", "Scoop tank", "top", ["tank"], top("scoop", -0.12, H("hip", 0.02)), "pastel")
g("tank_v", "V-neck tank", "top", ["tank"], top("v", -0.12, H("hip", 0.02)), "dark")
g("tank_racer", "Racerback tank", "top", ["tank", "sport"], top("scoop", -0.28, H("hip", 0.0)), "bright")
g("tank_crop", "Cropped tank", "top", ["tank", "crop"], top("crew", -0.15, H("waist", 0.04)), "bright")
g("camisole", "Camisole", "top", ["tank"], top({"kind": "square", "depth": 0.09}, -0.22, H("hip", 0.0)), "pastel")
g("tube_top", "Tube top", "top", ["tank", "crop"], top({"kind": "off", "depth": 0.1}, -0.3, H("waist", 0.03)), "bright")
g("turtleneck", "Turtleneck", "top", ["sweater", "long"], top("turtle", 1.0, H("hip", 0.03)), "dark")
g("mock_neck", "Mock-neck top", "top", ["long"], top("mock", 0.97, H("hip", 0.02)), "neutral")
g("off_shoulder_top", "Off-shoulder top", "top", ["blouse"], top({"kind": "off", "depth": 0.04}, 0.55, H("hip", 0.02)), "pastel")
g("off_shoulder_long", "Off-shoulder sweater", "top", ["sweater", "long"], top({"kind": "off", "depth": 0.04}, 1.0, H("hip", 0.03)), "earth", fh=0.018)
g("sweater_crew", "Crew sweater", "top", ["sweater", "long"], top("crew", 1.0, H("hip", 0.04)), "earth", fh=0.02)
g("sweater_v", "V-neck sweater", "top", ["sweater", "long"], top("v", 1.0, H("hip", 0.04)), "neutral", fh=0.02)
g("sweater_crop", "Cropped sweater", "top", ["sweater", "crop"], top("crew", 1.0, H("waist", 0.04)), "pastel", fh=0.02)
g("sweatshirt", "Sweatshirt", "top", ["sweater", "sport"], top("crew", 1.0, H("hip", 0.03)), "basic", fh=0.018)
g("hoodie_crop", "Cropped hoodie", "top", ["hoodie", "crop"], top("crew", 1.0, H("waist", 0.04)), "bright", fh=0.018,
  hood={"reach_deg": 110, "collar_at": 0.0, "collar": 0.012, "thick": 0.04, "drop": 0.15, "rise": 0.02})
g("blouse_v", "V-neck blouse", "top", ["blouse"], top({"kind": "v", "depth": 0.16}, 0.7, H("hip", 0.02)), "pastel")
g("blouse_square", "Square-neck blouse", "top", ["blouse"], top({"kind": "square", "depth": 0.08}, 0.5, H("hip", 0.02)), "pastel")
g("blouse_long", "Long-sleeve blouse", "top", ["blouse", "long"], top({"kind": "v", "depth": 0.09}, 1.0, H("hip", 0.03)), "neutral",
  fh=0.014)
g("peplum_top", "Peplum top", "top", ["blouse"], top("scoop", 0.3, H("waist", 0.0)), "bright",
  skirt={"top": H("waist", 0.0), "length": 0.13, "flare": 0.9, "offset": 0.015})
g("tunic", "Tunic", "top", ["blouse", "long"], top({"kind": "v", "depth": 0.07}, 0.8, H("hip", 0.0)), "earth",
  skirt={"top": H("hip", 0.0), "length": 0.2, "flare": 0.2, "offset": 0.02})
g("sport_bra_top", "Sports top", "top", ["sport", "crop"], top("scoop", -0.25, H("chest", -0.07)), "bright")
g("halter_top", "Halter top", "top", ["tank"], top({"kind": "v", "depth": 0.1}, -0.35, H("hip", 0.0)), "bright")
g("wrap_top", "Wrap top", "top", ["blouse"], top({"kind": "v", "depth": 0.2}, 0.45, H("waist", 0.02)), "dark")
g("polo_like", "Collar tee", "top", ["tee"], top({"kind": "v", "depth": 0.035}, 0.38, H("hip", 0.03)), "basic")
g("rugby_top", "Rugby top", "top", ["sweater", "sport", "long"], top({"kind": "v", "depth": 0.035}, 1.0, H("hip", 0.04)), "bright",
  fh=0.016)
g("raglan_tee", "Raglan tee", "top", ["tee"], top("crew", 0.75, H("hip", 0.03)), "basic", fh=0.014)

# ---- outerwear (16) ----------------------------------------------------------------------------------------------
outer = lambda neck, sleeve, hem, open_w, **k: dict(part="top", neck=neck if isinstance(neck, dict) else {"kind": neck}, sleeve=sleeve, hem=hem,
                                                    open_front=open_w, force=True, **k)
coat_skirt = lambda length, open_rad=0.55, flare=0.12: {"top": H("hip", 0.0), "length": length, "flare": flare, "offset": 0.035, "open_front": open_rad}
g("jacket_open", "Open jacket", "outer", ["jacket"], outer({"kind": "v", "depth": 0.2}, 1.0, H("hip", 0.0), 0.09), "dark")
g("blazer", "Blazer", "outer", ["jacket", "formal"], outer({"kind": "v", "depth": 0.24}, 1.0, H("hip", 0.0), 0.06), "dark",
  skirt=coat_skirt(0.1, 0.6, 0.05))
g("cardigan", "Cardigan", "outer", ["knit"], outer({"kind": "v", "depth": 0.26}, 1.0, H("hip", 0.02), 0.07), "earth")
g("cardigan_long", "Long cardigan", "outer", ["knit", "long"], outer({"kind": "v", "depth": 0.26}, 1.0, H("hip", 0.0), 0.08), "neutral",
  skirt=coat_skirt(0.42, 0.7, 0.08))
g("bomber", "Bomber jacket", "outer", ["jacket"], outer("crew", 1.0, H("waist", 0.0), 0.0), "dark", fh=0.035)
g("denim_jacket", "Denim jacket", "outer", ["jacket"], outer({"kind": "v", "depth": 0.1}, 1.0, H("waist", 0.02), 0.04), "denim")
g("puffer", "Puffer jacket", "outer", ["coat", "warm"], outer("mock", 1.0, H("hip", 0.0), 0.0), "bright", fh=0.05)
g("parka", "Parka", "outer", ["coat", "warm"], outer("mock", 1.0, H("hip", 0.0), 0.0), "earth", fh=0.038,
  skirt=coat_skirt(0.3, 0.0, 0.08), hood={"reach_deg": 115, "collar_at": 0.15, "collar": 0.02, "thick": 0.05, "drop": 0.17, "rise": 0.03})
g("trench_coat", "Trench coat", "outer", ["coat", "long"], outer({"kind": "v", "depth": 0.18}, 1.0, H("hip", 0.0), 0.05), "earth",
  skirt=coat_skirt(0.55, 0.5, 0.18))
g("raincoat", "Raincoat", "outer", ["coat"], outer("crew", 1.0, H("hip", 0.0), 0.0), "bright", fh=0.03,
  skirt=coat_skirt(0.35, 0.0, 0.12), hood={"reach_deg": 115, "collar_at": 0.1, "collar": 0.016, "thick": 0.045, "drop": 0.16, "rise": 0.03})
g("vest_open", "Open vest", "outer", ["vest"], outer({"kind": "v", "depth": 0.22}, -0.1, H("hip", 0.0), 0.08), "earth")
g("puffer_vest", "Puffer vest", "outer", ["vest", "warm"], outer("mock", -0.08, H("hip", 0.0), 0.0), "dark", fh=0.045)
g("waistcoat", "Waistcoat", "outer", ["vest", "formal"], outer({"kind": "v", "depth": 0.2}, -0.1, H("waist", -0.02), 0.0), "dark")
g("shacket", "Overshirt", "outer", ["jacket"], outer({"kind": "v", "depth": 0.08}, 1.0, H("hip", 0.03), 0.03), "earth", fh=0.024)
g("windbreaker", "Windbreaker", "outer", ["jacket", "sport"], outer("mock", 1.0, H("hip", 0.0), 0.0), "bright", fh=0.03,
  hood={"reach_deg": 110, "collar_at": 0.1, "collar": 0.014, "thick": 0.04, "drop": 0.15, "rise": 0.025})
g("kimono_jacket", "Kimono jacket", "outer", ["jacket"], outer({"kind": "v", "depth": 0.3}, 0.7, H("hip", 0.0), 0.12, sleeve_flare=0.06),
  "pastel", skirt=coat_skirt(0.25, 0.9, 0.05))

# ---- bottoms (28 with the sewn trousers) -----------------------------------------------------------------------
bot = lambda leg, waist=H("waist", 0.0), **k: dict(part="bottom", waist=waist, leg=leg, force=True, **k)
g("jeans_slim", "Slim jeans", "bottom", ["jeans"], bot(1.0), "denim", fh=0.006)
g("jeans_straight", "Straight jeans", "bottom", ["jeans"], bot(1.0, leg_flare=0.012), "denim", fh=0.009)
g("jeans_flared", "Flared jeans", "bottom", ["jeans"], bot(1.0, leg_flare=0.05), "denim", fh=0.008)
g("jeans_low_rise", "Low-rise jeans", "bottom", ["jeans"], bot(1.0, H("waist", -0.05)), "denim", fh=0.007)
g("trousers_high", "High-waist trousers", "bottom", ["trousers", "formal"], bot(1.0, H("waist", 0.04), leg_flare=0.015), "dark", fh=0.01)
g("trousers_wide", "Wide trousers", "bottom", ["trousers"], bot(1.0, leg_flare=0.07), "neutral", fh=0.012)
g("chinos", "Chinos", "bottom", ["trousers"], bot(0.97, leg_flare=0.008), "earth", fh=0.01)
g("joggers", "Joggers", "bottom", ["sport", "trousers"], bot(0.95), "basic", fh=0.014)
g("sweatpants", "Sweatpants", "bottom", ["sport", "trousers"], bot(1.0, leg_flare=0.02), "neutral", fh=0.016)
g("leggings", "Leggings", "bottom", ["sport"], bot(1.0), "dark", fh=0.003)
g("capri", "Capri trousers", "bottom", ["trousers"], bot(0.75), "pastel", fh=0.008)
g("culottes", "Culottes", "bottom", ["trousers"], bot(0.68, leg_flare=0.08), "earth", fh=0.01)
g("shorts_mid", "Mid shorts", "bottom", ["shorts"], bot(0.32, H("waist", -0.02)), "denim")
g("shorts_short", "Short shorts", "bottom", ["shorts"], bot(0.18, H("waist", -0.02)), "bright")
g("bermuda", "Bermuda shorts", "bottom", ["shorts"], bot(0.45, leg_flare=0.03), "earth", fh=0.01)
g("bike_shorts", "Bike shorts", "bottom", ["shorts", "sport"], bot(0.36), "dark", fh=0.003)
g("hot_pants", "Hot pants", "bottom", ["shorts"], bot(0.08, H("waist", -0.03)), "bright")
g("cargo_shorts", "Cargo shorts", "bottom", ["shorts"], bot(0.42, H("waist", -0.03), leg_flare=0.04), "earth", fh=0.012)
g("skirt_aline", "A-line skirt", "bottom", ["skirt"], bot(-1.0, H("waist", -0.005)), "bright",
  skirt={"top": H("waist", 0.0), "length": 0.42, "flare": 0.25, "offset": 0.025})
g("skirt_mini", "Mini skirt", "bottom", ["skirt"], bot(-1.0, H("waist", -0.03)), "dark",
  skirt={"top": H("waist", -0.025), "length": 0.24, "flare": 0.2, "offset": 0.02})
g("skirt_midi", "Midi skirt", "bottom", ["skirt"], bot(-1.0), "neutral",
  skirt={"top": H("waist", 0.0), "length": 0.6, "flare": 0.18, "offset": 0.025})
g("skirt_maxi", "Maxi skirt", "bottom", ["skirt", "long"], bot(-1.0), "earth",
  skirt={"top": H("waist", 0.0), "length": 0.86, "flare": 0.12, "offset": 0.025})
g("skirt_pencil", "Pencil skirt", "bottom", ["skirt", "formal"], bot(-1.0, H("waist", 0.01)), "dark",
  skirt={"top": H("waist", 0.01), "length": 0.5, "flare": 0.0, "offset": 0.012, "pencil": True})
g("skirt_flared", "Flared skirt", "bottom", ["skirt"], bot(-1.0), "pastel",
  skirt={"top": H("waist", 0.0), "length": 0.38, "flare": 0.7, "offset": 0.02})
g("skirt_tiered", "Tiered skirt", "bottom", ["skirt", "long"], bot(-1.0), "pastel",
  skirt={"top": H("waist", 0.0), "length": 0.7, "flare": 0.35, "offset": 0.03})
g("skort", "Skort", "bottom", ["skirt", "shorts", "sport"], bot(0.2, H("waist", -0.01)), "bright",
  skirt={"top": H("hip", 0.03), "length": 0.2, "flare": 0.3, "offset": 0.02})
g("track_pants", "Track pants", "bottom", ["sport", "trousers"], bot(1.0, leg_flare=0.01), "dark", fh=0.013)

# ---- one-pieces (24) ---------------------------------------------------------------------------------------------
full = lambda neck, sleeve, leg, **k: dict(part="full", neck=neck if isinstance(neck, dict) else {"kind": neck}, sleeve=sleeve, leg=leg,
                                           hem=H("hip", -0.03), force=True, **k)
dress = lambda neck, sleeve, **k: dict(part="top", neck=neck if isinstance(neck, dict) else {"kind": neck}, sleeve=sleeve, hem=H("hip", -0.04),
                                       force=True, **k)
sk = lambda length, flare, top_=H("waist", 0.0), **k: dict(top=top_, length=length, flare=flare, offset=0.022, **k)
g("dress_sheath", "Sheath dress", "full", ["dress"], dress("scoop", -0.12), "dark", skirt=sk(0.5, 0.0, H("hip", -0.02), pencil=True))
g("dress_aline", "A-line dress", "full", ["dress"], dress("crew", 0.16), "bright", skirt=sk(0.5, 0.25))
g("dress_maxi", "Maxi dress", "full", ["dress", "long"], dress({"kind": "v", "depth": 0.12}, -0.15), "earth", skirt=sk(0.95, 0.12))
g("dress_mini", "Mini dress", "full", ["dress"], dress("scoop", 0.3), "bright", skirt=sk(0.3, 0.2))
g("dress_wrap", "Wrap dress", "full", ["dress"], dress({"kind": "v", "depth": 0.2}, 0.45), "pastel", skirt=sk(0.55, 0.2))
g("dress_shirt", "Shirt dress", "full", ["dress"], dress({"kind": "v", "depth": 0.06}, 0.42), "neutral", skirt=sk(0.5, 0.12))
g("dress_tshirt", "T-shirt dress", "full", ["dress"], dress("crew", 0.4), "basic", skirt=sk(0.45, 0.05, H("hip", -0.02)))
g("dress_slip", "Slip dress", "full", ["dress"], dress({"kind": "square", "depth": 0.09}, -0.22), "pastel", skirt=sk(0.62, 0.1))
g("dress_off_shoulder", "Off-shoulder dress", "full", ["dress"], dress({"kind": "off", "depth": 0.04}, 0.5), "bright", skirt=sk(0.55, 0.3))
g("dress_long_sleeve", "Long-sleeve dress", "full", ["dress", "long"], dress("crew", 1.0), "dark", skirt=sk(0.55, 0.15))
g("sundress", "Sundress", "full", ["dress"], dress({"kind": "square", "depth": 0.07}, -0.25), "pastel", skirt=sk(0.5, 0.45))
g("cocktail_dress", "Cocktail dress", "full", ["dress", "formal"], dress({"kind": "v", "depth": 0.14}, -0.12), "dark",
  skirt=sk(0.38, 0.05, H("hip", -0.02), pencil=True))
g("gown", "Evening gown", "full", ["dress", "formal", "long"], dress({"kind": "off", "depth": 0.05}, -0.3), "dark", skirt=sk(1.0, 0.3))
g("pinafore_dress", "Pinafore dress", "full", ["dress"], dict(part="top", neck={"kind": "square", "depth": 0.12}, sleeve=-0.3,
  hem=H("hip", -0.04), force=True), "denim", skirt=sk(0.42, 0.15))
g("kaftan", "Kaftan", "full", ["dress", "long"], dress({"kind": "v", "depth": 0.12}, 0.7, sleeve_flare=0.07), "bright", skirt=sk(0.95, 0.2))
g("nightgown", "Nightgown", "full", ["dress", "sleep", "long"], dress("scoop", -0.15), "pastel", skirt=sk(0.9, 0.18))
g("jumpsuit", "Jumpsuit", "full", ["jumpsuit"], full({"kind": "v", "depth": 0.12}, -0.12, 1.0, leg_flare=0.03), "dark")
g("jumpsuit_sleeve", "Short-sleeve jumpsuit", "full", ["jumpsuit"], full("crew", 0.4, 1.0, leg_flare=0.02), "earth")
g("boilersuit", "Boilersuit", "full", ["jumpsuit"], full({"kind": "v", "depth": 0.06}, 1.0, 1.0, leg_flare=0.015), "denim", fh=0.015)
g("romper", "Romper", "full", ["jumpsuit"], full("scoop", 0.25, 0.22), "bright")
g("overalls", "Overalls", "full", ["overalls"], dict(part="full", neck={"kind": "crew"}, sleeve=-0.6, leg=1.0, waist=H("waist", 0.0),
  hem=H("hip", -0.03), bib=True, force=True, leg_flare=0.015), "denim", fh=0.014)
g("dungaree_shorts", "Dungaree shorts", "full", ["overalls", "shorts"], dict(part="full", neck={"kind": "crew"}, sleeve=-0.6, leg=0.3,
  waist=H("waist", 0.0), hem=H("hip", -0.03), bib=True, force=True), "denim", fh=0.012)
g("bodysuit", "Bodysuit", "full", ["sport"], full("scoop", 1.0, 0.03), "dark", fh=0.004)
g("tracksuit", "Tracksuit", "full", ["sport", "jumpsuit"], full("mock", 1.0, 1.0, leg_flare=0.01), "bright", fh=0.016)

# ---- shoes (24) ----------------------------------------------------------------------------------------------------
shoe = lambda boot, **k: dict(part="shoes", boot=boot, force=True, **k)
g("sneakers_low", "Low sneakers", "shoes", ["sneakers"], shoe(0.1), "basic", sole=0.035, welt=0.012)
g("sneakers_high", "High-top sneakers", "shoes", ["sneakers"], shoe(0.16), "basic", sole=0.035, welt=0.012)
g("running_shoes", "Running shoes", "shoes", ["sneakers", "sport"], shoe(0.09), "bright", sole=0.04, welt=0.015)
g("platform_sneakers", "Platform sneakers", "shoes", ["sneakers"], shoe(0.1), "pastel", sole=0.05, welt=0.02)
g("loafers", "Loafers", "shoes", ["formal"], shoe(0.055, vamp=True), "leather", sole=0.02, welt=0.006)
g("oxfords", "Oxfords", "shoes", ["formal"], shoe(0.075), "leather", sole=0.02, welt=0.008)
g("ballet_flats", "Ballet flats", "shoes", ["flats"], shoe(0.035, vamp=True), "pastel", sole=0.012, welt=0.003)
g("mules", "Mules", "shoes", ["flats"], shoe(0.03, vamp=True), "leather", sole=0.02, welt=0.006)
g("sandals", "Sandals", "shoes", ["sandals"], shoe(0.06, straps=0.035), "leather", sole=0.02, welt=0.01)
g("slides", "Slides", "shoes", ["sandals"], shoe(0.03, vamp=True, straps=0.06), "basic", sole=0.02, welt=0.01)
g("flip_flops", "Flip-flops", "shoes", ["sandals"], shoe(0.022, straps=0.08), "bright", sole=0.015, welt=0.012)
g("espadrilles", "Espadrilles", "shoes", ["flats"], shoe(0.05, vamp=True), "neutral", sole=0.025, welt=0.008, sole_palette="earth")
g("moccasins", "Moccasins", "shoes", ["flats"], shoe(0.06, vamp=True), "leather", sole=0.012, welt=0.004)
g("clogs", "Clogs", "shoes", ["flats"], shoe(0.06, vamp=True), "bright", sole=0.04, welt=0.012, sole_palette="earth")
g("slippers", "Slippers", "shoes", ["home"], shoe(0.06, vamp=True), "pastel", sole=0.015, welt=0.006, fh=0.014)
g("ankle_boots", "Ankle boots", "shoes", ["boots"], shoe(0.18), "leather", sole=0.03, welt=0.01)
g("chelsea_boots", "Chelsea boots", "shoes", ["boots"], shoe(0.17), "leather", sole=0.025, welt=0.008)
g("hiking_boots", "Hiking boots", "shoes", ["boots", "sport"], shoe(0.2), "earth", sole=0.045, welt=0.016, fh=0.012)
g("work_boots", "Work boots", "shoes", ["boots"], shoe(0.19), "earth", sole=0.04, welt=0.014, fh=0.012)
g("knee_boots", "Knee boots", "shoes", ["boots", "long"], shoe(0.47), "leather", sole=0.03, welt=0.008)
g("rain_boots", "Rain boots", "shoes", ["boots"], shoe(0.36), "bright", sole=0.03, welt=0.01, fh=0.014)
g("cowboy_boots", "Western boots", "shoes", ["boots"], shoe(0.33), "leather", sole=0.035, welt=0.01)
g("snow_boots", "Snow boots", "shoes", ["boots", "warm"], shoe(0.25), "dark", sole=0.045, welt=0.02, fh=0.02)
g("court_shoes", "Court shoes", "shoes", ["formal", "flats"], shoe(0.035, vamp=True), "dark", sole=0.02, welt=0.004)


def params(d):
    s = SLOT[d["slot"]]
    fh = d["fh"] if d["fh"] is not None else s["fh"]
    regions = [{"id": "main", "label": "Main", "materials": ["M_" + "".join(w.title() for w in d["id"].split("_"))],
                "default": P[d["palette"]][0], "palette": P[d["palette"]]}]
    fin = {"mode": "body", "close": 3, "min": s["lo"], "max": max(s["hi"], fh + 0.004), "k": 0.015, "smooth": 3, "force_h": fh,
           "cut": d["cut"]}
    if d["skirt"]:
        fin["skirt"] = d["skirt"]
    if d["hood"]:
        fin["hood"] = dict(segments=28, ring=12, **d["hood"])
    if d["sole"]:
        fin["sole"] = d["sole"]; fin["welt"] = d["welt"]
        regions.append({"id": "sole", "label": "Sole", "materials": [regions[0]["materials"][0] + "Sole"],
                        "default": P[d["sole_palette"]][0], "palette": P[d["sole_palette"]]})
    slot = d["slot"]
    conflicts = {"top": ["full"], "bottom": ["full"], "full": ["top", "bottom"], "outer": [], "shoes": []}[slot]
    return {"id": d["id"], "label": d["label"], "preset": None, "category": "accessory" if slot == "accessory" else slot,
            "slot": slot, "tags": d["tags"], "hides": [], "layer": s["layer"], "conflicts": conflicts, "color_regions": regions,
            "fit_pose": {"arms_down_deg": 45}, "finish": fin}


if __name__ == "__main__":
    ids = [d["id"] for d in D]
    assert len(ids) == len(set(ids)), "duplicate ids"
    counts = {}
    for d in D:
        counts[d["slot"]] = counts.get(d["slot"], 0) + 1
    print(len(D), counts)
    if "--write" in sys.argv:
        for d in D:
            out = os.path.join(REPO, "authoring/characters/garments", d["id"], "params.json")
            os.makedirs(os.path.dirname(out), exist_ok=True)
            with open(out, "w") as f:
                json.dump(params(d), f, indent=1)
        print("wrote", len(D))
