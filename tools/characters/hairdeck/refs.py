"""Reference pictures for HairDeck, drawn by a local ComfyUI (FLUX schnell GGUF, 4 steps).

  python3 tools/characters/hairdeck/refs.py [--out ~/authoring-cache/hairdeck/refs] [--seed 7] [--api http://127.0.0.1:8188] [id ...]

Reads styles.json next to this file (one prompt, a hair description per hairstyle id) and writes <out>/<id>.png; a picture
that is already there is kept (delete it to draw it again, or give another --seed). ComfyUI needs UnetLoaderGGUF
(ComfyUI-GGUF), flux1-schnell-Q4_K_S.gguf, clip_l, t5xxl_fp8 and ae.safetensors. Stop ComfyUI before running HairDeck on
a small GPU: both want the memory.
"""
import argparse, json, os, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument("ids", nargs="*")
ap.add_argument("--out", default=os.path.expanduser("~/authoring-cache/hairdeck/refs"))
ap.add_argument("--seed", type=int, default=7)
ap.add_argument("--api", default="http://127.0.0.1:8188")
a = ap.parse_args()
with open(os.path.join(HERE, "styles.json")) as f:
    cfg = json.load(f)


def post(path, data):
    r = urllib.request.Request(a.api + path, data=json.dumps(data).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(r).read())


def workflow(text, seed, prefix):
    return {
        "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": "flux1-schnell-Q4_K_S.gguf"}},
        "2": {"class_type": "DualCLIPLoader", "inputs": {"clip_name1": "clip_l.safetensors", "clip_name2": "t5xxl_fp8_e4m3fn.safetensors", "type": "flux"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": text, "clip": ["2", 0]}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"text": "", "clip": ["2", 0]}},
        "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 768, "height": 1024, "batch_size": 1}},
        "7": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["4", 0], "negative": ["5", 0], "latent_image": ["6", 0],
                                                    "seed": seed, "steps": 4, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["3", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": prefix}},
    }


os.makedirs(a.out, exist_ok=True)
for sid in a.ids or list(cfg["styles"]):
    dst = os.path.join(a.out, sid + ".png")
    if os.path.exists(dst):
        continue
    pid = post("/prompt", {"prompt": workflow(cfg["prompt"].format(hair=cfg["styles"][sid]), a.seed, "hairdeck_" + sid)})["prompt_id"]
    while True:
        h = json.loads(urllib.request.urlopen(a.api + "/history/" + pid).read())
        if pid in h and (h[pid].get("outputs") or h[pid].get("status", {}).get("completed") is not None):
            break
        time.sleep(1)
    imgs = [i for o in h[pid].get("outputs", {}).values() for i in o.get("images", [])]
    if not imgs:
        print(sid, "FAILED", json.dumps(h[pid].get("status", {}))[:400], flush=True)
        continue
    i = imgs[0]
    data = urllib.request.urlopen(a.api + "/view?" + urllib.parse.urlencode({"filename": i["filename"], "subfolder": i["subfolder"], "type": i["type"]})).read()
    with open(dst, "wb") as f:
        f.write(data)
    print(sid, "ok", flush=True)
