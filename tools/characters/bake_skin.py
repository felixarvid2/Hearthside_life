"""Neutral skin texture for runtime skin tones.

  python3 tools/characters/bake_skin.py --src <base color.png> --out <out.png> [--size 1024]

Quaternius paints its base characters in one skin tone. The game tints skin with the person's own color
(material color x texture), so this divides the painted tone out, in linear light:

  out = (texel / reference) / gain

- `reference` is the median color of the skin pixels (saturated, not dark), so a texel of exactly that tone becomes
  neutral grey `1/gain` and local hue (lips, creases, nipples) is kept as a variation around it.
- `gain` is the 99th percentile of the brightness ratio, so painted highlights are not clipped. The runtime multiplies
  the skin color by `gain` (BodyPresetDef.skinGain), which makes a reference texel exactly the chosen skin color.
- Dark or grey texels (the black underwear of the "Dark" textures and its waistband) are left as they are: black
  stays black under any skin tone.
- Texels cooler than the reference keep only their brightness, so no blue shows under a warm tone.

Prints the reference (sRGB hex) and gain as JSON.
"""
import argparse, json
import numpy as np
from PIL import Image

p = argparse.ArgumentParser()
p.add_argument("--src", required=True)
p.add_argument("--out", required=True)
p.add_argument("--size", type=int, default=1024)
a = p.parse_args()

def to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)

im = Image.open(a.src).convert("RGB")
if a.size and im.size[0] != a.size:
    im = im.resize((a.size, a.size), Image.LANCZOS)
srgb = np.asarray(im, dtype=np.float64) / 255.0
lin = to_lin(srgb)
mx, mn = srgb.max(axis=2), srgb.min(axis=2)
sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
skin = (sat > 0.2) & (mx > 0.25)
keep = ((mx < 0.22) & (sat < 0.35)) | (sat < 0.12)  # underwear, its grey waistband, seams: untouched
ref = np.median(lin[skin], axis=0)
ratio = lin / ref
lum = ratio @ np.array([0.2126, 0.7152, 0.0722])
# Texels cooler than the reference (the painted stubble line on the scalp) would turn blue under a warm skin tone:
# keep their brightness, drop their hue. Warmer ones (lips, creases) keep their hue.
cool = ratio[..., 2] > ratio[..., 0]
ratio[cool] = lum[cool][:, None]
gain = float(np.percentile(lum[skin], 99))
out = to_srgb(ratio / gain)
out[keep] = srgb[keep]
Image.fromarray((out * 255 + 0.5).astype(np.uint8)).save(a.out, optimize=True)
ref_hex = "#" + "".join(f"{int(round(v * 255)):02x}" for v in to_srgb(ref))
print(json.dumps({"out": a.out, "reference": ref_hex, "gain": round(gain, 4), "skinFraction": round(float(skin.mean()), 3),
                  "keptFraction": round(float(keep.mean()), 3)}))
