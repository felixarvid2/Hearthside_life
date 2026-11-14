#!/usr/bin/env python3
"""The hairstyle catalog through HairDeck (github.com/hyz317/HairDeck, Apache-2.0): pictures -> hair cards -> our hair GLBs.

  python3 tools/characters/hairdeck/build.py cards   [id ...]     # HairDeck on the reference pictures (GPU), --n variations each
  python3 tools/characters/hairdeck/build.py trial   [id ...]     # every variation fitted to one body, and review sheets
  python3 tools/characters/hairdeck/build.py install [id ...]     # the chosen variation: source, both bodies, manifest

Steps and files:
  refs.py     styles.json -> ~/authoring-cache/hairdeck/refs/<id>.png            (local ComfyUI, FLUX schnell)
  cards       refs -> ~/authoring-cache/hairdeck/out/<id>/cards_seed<k>.json      (HAIRDECK=<checkout>, its .venv, HAIRDECK_ROOT)
  trial       -> ~/authoring-cache/hairdeck/trial/<id>_s<k>.glb and sheets/NN.png (blender/hairdeck_to_hair.py, review_sheet.py)
  choices.json  which variation each hairstyle uses, its `label` and `tags` where the result is another style than the id
              says (ids stay, saves name them), and per-style options of hairdeck_to_hair.py (written by hand after
              looking at the sheets); a style that is not listed is not installed
  install     the chosen cards -> authoring/characters/hair/<id>/cards.json (the source: the GLBs rebuild from it without
              HairDeck or a GPU), public/assets/characters/modular/hair/<id>__<body>.glb for both bodies, the manifest entry
After install: apply_stage_morph.py for both bodies (stage keys), then thumbnails.mjs.
Environment: HAIRDECK (default ~/src/HairDeck), HAIRDECK_ROOT (default ~/src/HairDeck-workspace), BLENDER (default blender),
HAIRDECK_CACHE (default ~/authoring-cache/hairdeck). HAIRDECK_OFFLOAD=on is set for the 8 GB case.
"""
import json, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CACHE = os.environ.get("HAIRDECK_CACHE", os.path.expanduser("~/authoring-cache/hairdeck"))
HAIRDECK = os.environ.get("HAIRDECK", os.path.expanduser("~/src/HairDeck"))
BLENDER = os.environ.get("BLENDER", "blender")
BODIES = ("ubc_male", "ubc_female")
VARIATIONS = 2
LICENSE = "Hearthside original (hair cards generated with HairDeck, Apache-2.0, from our own FLUX reference picture; meshed and fitted in Blender on Quaternius CC0 bodies)"

with open(os.path.join(HERE, "styles.json")) as f:
    STYLES = json.load(f)["styles"]


def choices():
    p = os.path.join(HERE, "choices.json")
    return json.load(open(p)) if os.path.exists(p) else {}


def blender(blend, script, *args):
    r = subprocess.run([BLENDER, "-b", "--factory-startup", blend, "--python", script, "--", *map(str, args)], capture_output=True, text=True)
    lines = [l for l in r.stdout.splitlines() if l.startswith(("HAIRDECK_TO_HAIR", "SHEET"))]
    if r.returncode or not lines:
        sys.exit("blender failed: %s\n%s" % (" ".join(map(str, args)), (r.stdout + r.stderr)[-1500:]))
    return lines[-1]


def fit(cards, hid, body, out=None, opts=None):
    args = ["--cards", cards, "--id", hid, "--body", body, "--repo", REPO]
    if out:
        args += ["--out", out]
    for k, v in (opts or {}).items():
        args += ["--" + k] + ([] if v is True else [v])
    return blender(os.path.join(REPO, "authoring/characters/bodies", body, "fitting.blend"), os.path.join(REPO, "tools/characters/blender/hairdeck_to_hair.py"), *args)


def cmd_cards(ids):
    refs = [os.path.join(CACHE, "refs", i + ".png") for i in ids if not os.path.exists(os.path.join(CACHE, "out", i, "cards_seed%d.json" % (VARIATIONS - 1)))]
    missing = [r for r in refs if not os.path.exists(r)]
    if missing:
        sys.exit("no reference picture (run refs.py): %s" % missing)
    if not refs:
        return
    env = dict(os.environ, HAIRDECK_ROOT=os.environ.get("HAIRDECK_ROOT", os.path.expanduser("~/src/HairDeck-workspace")),
               HAIRDECK_OFFLOAD=os.environ.get("HAIRDECK_OFFLOAD", "on"), PYTORCH_CUDA_ALLOC_CONF="expandable_segments:True")
    subprocess.run([os.path.join(HAIRDECK, ".venv/bin/python"), os.path.join(HAIRDECK, "scripts/image_to_hair.py"), *refs,
                    "--out", os.path.join(CACHE, "out"), "--n", str(VARIATIONS), "--no-chains", "--no-colors"], env=env, check=True)


def cmd_trial(ids):
    os.makedirs(os.path.join(CACHE, "trial"), exist_ok=True)
    ch = choices()
    for hid in ids:
        for k in range(VARIATIONS):
            out = os.path.join(CACHE, "trial", "%s_s%d.glb" % (hid, k))
            print(fit(os.path.join(CACHE, "out", hid, "cards_seed%d.json" % k), hid, "ubc_female", out, (ch.get(hid) or {}).get("options")), flush=True)
    os.makedirs(os.path.join(CACHE, "sheets"), exist_ok=True)
    for n in range(0, len(ids), 8):
        part = ids[n:n + 8]
        files = [os.path.join(CACHE, "trial", "%s_s%d.glb" % (hid, k)) for hid in part for k in range(VARIATIONS)]
        print(blender(os.path.join(REPO, "authoring/characters/bodies/ubc_female/fitting.blend"), os.path.join(HERE, "review_sheet.py"),
                      os.path.join(CACHE, "sheets", "%02d.png" % (n // 8)), VARIATIONS, *files), part, flush=True)


def cmd_install(ids):
    ch = choices()
    mpath = os.path.join(REPO, "public/assets/characters/modular/manifest.json")
    with open(mpath) as f:
        manifest = json.load(f)
    seconds = {b["id"]: b["base"] for b in manifest["bodies"] if b.get("base")}
    for hid in ids:
        c = ch.get(hid)
        if not c:
            print("skipped (no choice):", hid)
            continue
        src_dir = os.path.join(REPO, "authoring/characters/hair", hid)
        os.makedirs(src_dir, exist_ok=True)
        cards = os.path.join(src_dir, "cards.json")
        picked = os.path.join(CACHE, "out", hid, "cards_seed%d.json" % c["seed"])
        if os.path.exists(picked):
            with open(picked) as f:
                data = json.load(f)
            for card in data:                             # six decimals are a micrometre here; the file shrinks by two thirds
                card["seq"] = [[round(x, 6) for x in p] for p in card["seq"]]
            with open(cards, "w") as f:
                json.dump(data, f, separators=(",", ":"))
        with open(os.path.join(src_dir, "hairdeck.json"), "w") as f:
            json.dump({"prompt": STYLES[hid], "seed": c["seed"], "options": c.get("options", {}), "tool": "HairDeck (Apache-2.0), tools/characters/hairdeck/build.py"}, f, indent=1)
            f.write("\n")
        tris = 0
        for body in BODIES:
            rep = json.loads(fit(cards, hid, body, None, c.get("options")).split(" ", 1)[1])
            tris = max(tris, rep["triangles"])
        h = next(x for x in manifest["hairstyles"] if x["id"] == hid)
        h["files"] = {b: "hair/%s__%s.glb" % (hid, b) for b in BODIES}
        for second, base in seconds.items():
            h["files"][second] = h["files"][base]
        h["source"] = "authoring/characters/hair/%s/cards.json" % hid
        h["license"] = LICENSE
        h["stats"] = {"triangles": tris, "textureBytes": 0}
        if c.get("label"):                                # the name says what came out, not what was asked for
            h["label"] = c["label"]
        if c.get("tags"):
            h["tags"] = c["tags"]
        h.pop("followsMorphs", None)                      # apply_stage_morph.py sets it again
        print("installed", hid, tris, flush=True)
    with open(mpath, "w") as f:
        json.dump(manifest, f, indent=1)
        f.write("\n")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    ids = sys.argv[2:] or list(STYLES)
    {"cards": cmd_cards, "trial": cmd_trial, "install": cmd_install}.get(cmd, lambda _: sys.exit(__doc__))(ids)
