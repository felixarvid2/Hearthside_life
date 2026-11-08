"""Batch build for the modular catalog: Blender builds on every body, cover masks, manifest entries.

  python3 tools/characters/catalog/build_all.py garments [--ids a,b] [--jobs 3] [--skip-built] [--manifest-only]
  python3 tools/characters/catalog/build_all.py hair|facial|accessories ...

garments:    authoring/characters/garments/<id>/params.json -> build_garment.py, cover-masks.mjs, manifest "garments"
hair:        authoring/characters/hair/<id>/params.json     -> build_hair.py, manifest "hairstyles"
facial:      authoring/characters/facial_hair/<id>/params.json -> build_hair.py (beard mode), manifest "facialHair"
accessories: authoring/characters/accessories/<id>/params.json -> build_accessory.py, manifest "garments" (slot = accessory slot)
Thumbnails are a separate step (tools/characters/thumbnails.mjs --write-manifest). Logs go to $CATALOG_LOGS (default
~/authoring-cache/logs). Blender runs with the isolated authoring profile (BLENDER_USER_RESOURCES).
"""
import json, os, subprocess, sys, concurrent.futures as cf

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
BLENDER = os.environ.get("BLENDER", "/opt/blender/blender")
PROFILE = os.environ.get("BLENDER_USER_RESOURCES", "/home/user/authoring-src/bprofile")
LOGS = os.environ.get("CATALOG_LOGS", os.path.expanduser("~/authoring-cache/logs"))
BODIES = ["ubc_male", "ubc_female"]
MANIFEST = os.path.join(REPO, "public/assets/characters/modular/manifest.json")
KINDS = {
    "garments": ("authoring/characters/garments", "build_garment.py", "garments"),
    "hair": ("authoring/characters/hair", "build_hair.py", "hair"),
    "facial": ("authoring/characters/facial_hair", "build_hair.py", "facial_hair"),
    "accessories": ("authoring/characters/accessories", "build_accessory.py", "accessories"),
}
SKIP = {"tshirt_crew", "trousers_straight", "hoodie_pullover"}   # sewn Stage C garments with hand-written params


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def blender(script, params, body, log):
    env = dict(os.environ, BLENDER_USER_RESOURCES=PROFILE)
    cmd = [BLENDER, "-b", "--factory-startup", "--python-exit-code", "1", "--python", os.path.join(REPO, "tools/characters/blender", script), "--",
           "--params", params, "--body", body, "--repo", REPO]
    with open(log, "w") as f:
        r = subprocess.run(cmd, cwd=REPO, env=env, stdout=f, stderr=subprocess.STDOUT, timeout=1800)
    return r.returncode


def main():
    kind = sys.argv[1]
    src, script, out_dir = KINDS[kind]
    root = os.path.join(REPO, src)
    ids = arg("--ids")
    ids = ids.split(",") if ids else sorted(d for d in os.listdir(root) if os.path.exists(os.path.join(root, d, "params.json")))
    if kind == "garments" and not arg("--ids"):
        ids = [i for i in ids if i not in SKIP]
    jobs = int(arg("--jobs", "3"))
    os.makedirs(LOGS, exist_ok=True)
    work = []
    for i in ids:
        for b in BODIES:
            glb = os.path.join(REPO, "public/assets/characters/modular", out_dir, "%s__%s.glb" % (i, b))
            if "--skip-built" in sys.argv and os.path.exists(glb) and os.path.getmtime(glb) > os.path.getmtime(os.path.join(root, i, "params.json")):
                continue
            work.append((i, b))
    failed = []
    if "--manifest-only" not in sys.argv and work:
        with cf.ThreadPoolExecutor(jobs) as ex:
            futs = {ex.submit(blender, script, os.path.join(root, i, "params.json"), b, os.path.join(LOGS, "%s_%s__%s.log" % (kind, i, b))): (i, b) for i, b in work}
            for n, f in enumerate(cf.as_completed(futs), 1):
                i, b = futs[f]
                rc = f.result()
                print("[%d/%d] %s %s %s" % (n, len(work), i, b, "ok" if rc == 0 else "FAILED rc=%d" % rc), flush=True)
                if rc != 0:
                    failed.append((i, b))
    if kind == "garments" and "--manifest-only" not in sys.argv:
        for i, b in work:
            if (i, b) in failed:
                continue
            g = "public/assets/characters/modular/garments/%s__%s" % (i, b)
            r = subprocess.run(["node", "tools/characters/cover-masks.mjs", "public/assets/characters/modular/bodies/%s.glb" % b,
                                g + ".glb", g + ".cover.json", "--body", b, "--garment", i], cwd=REPO, capture_output=True, text=True)
            if r.returncode != 0:
                print("cover FAILED", i, b, r.stderr[-300:]); failed.append((i, b))
    update_manifest(kind, ids, set(failed))
    print("done: %d built, %d failed %s" % (len(work) - len(failed), len(failed), failed))
    return 1 if failed else 0


LICENSE_G = "CC0 1.0 - Hearthside original (cut design on the body-shell finish, in Blender on Quaternius CC0 bodies)"
LICENSE_H = "Hearthside original (made with GBH Tool in Blender on Quaternius CC0 bodies)"
LICENSE_A = "CC0 1.0 - Hearthside original (procedural model, in Blender, fitted to Quaternius CC0 bodies)"


def update_manifest(kind, ids, failed):
    m = json.load(open(MANIFEST))
    src, _, out_dir = KINDS[kind]
    key = {"garments": "garments", "hair": "hairstyles", "facial": "facialHair", "accessories": "garments"}[kind]
    lst = m.setdefault(key, [])
    by_id = {e["id"]: e for e in lst}
    for i in ids:
        if any(f[0] == i for f in failed):
            continue
        p = json.load(open(os.path.join(REPO, src, i, "params.json")))
        files = {b: "%s/%s__%s.glb" % (out_dir, i, b) for b in BODIES
                 if os.path.exists(os.path.join(REPO, "public/assets/characters/modular", out_dir, "%s__%s.glb" % (i, b)))}
        if len(files) != len(BODIES):
            continue
        regions = [{"id": r["id"], "label": r["label"], "materials": r["materials"], "default": r["default"],
                    **({"palette": r["palette"]} if r.get("palette") else {})} for r in p["color_regions"]]
        old = by_id.get(i, {})
        if kind in ("garments", "accessories"):
            e = {"id": i, "label": p["label"], "category": p.get("category", p["slot"]), "slot": p["slot"], "files": files}
            if kind == "garments":
                e["covers"] = {b: "%s/%s__%s.cover.json" % (out_dir, i, b) for b in BODIES}
            e.update({"rig": "ual-standard", "hides": [], "layer": p.get("layer", 1), "conflicts": p.get("conflicts", []),
                      "colorRegions": regions, "source": "%s/%s/params.json" % (src, i),
                      "license": LICENSE_G if kind == "garments" else LICENSE_A})
            if p.get("tags"):
                e["tags"] = p["tags"]
            if kind == "garments":
                e["followsMorphs"] = ["weight"]
        else:
            stats = []
            for b in BODIES:
                bj = os.path.join(REPO, src, i, "build_%s.json" % b)
                if os.path.exists(bj):
                    stats.append(json.load(open(bj)).get("tris", 0))
            e = {"id": i, "label": p["label"], "files": files, "rig": "ual-standard", "attachment": "skinned",
                 "colorRegions": regions, "source": "%s/%s/params.json" % (src, i), "license": LICENSE_H,
                 "stats": {"triangles": max(stats or [0]), "textureBytes": 0}}
            if p.get("tags"):
                e["tags"] = p["tags"]
            if kind == "facial":
                e["followsMorphs"] = ["jaw_width", "chin_length", "mouth_width", "weight"]
        if old.get("thumbnail"):
            e["thumbnail"] = old["thumbnail"]
        if i in by_id:
            lst[lst.index(by_id[i])] = e
        else:
            lst.append(e)
    with open(MANIFEST, "w") as f:
        json.dump(m, f, indent=1)
        f.write("\n")


if __name__ == "__main__":
    sys.exit(main())
