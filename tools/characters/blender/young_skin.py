"""A child's skin texture from a body's neutral skin texture: the painted adult shading is taken out.

  blender -b --factory-startup --python tools/characters/blender/young_skin.py -- --src authoring/characters/bodies/<id>/skin_base.png --out public/assets/characters/modular/bodies/<id>_skin_young.jpg [--sigma 14] [--luma 0.22] [--chroma 0.75]

Quaternius paints muscle definition, eye sockets, nasolabial folds and lip lines into the base colour. The `young` shape key
(stage_morph.py) relaxes the surface, but the paint would still draw an adult on it. Here every skin texel is split into a
blurred base and its detail; the detail's brightness (the shading) is kept at `luma`, its colour (pink lips, cheeks, nails)
at `chroma`. The blur is normalized over skin texels only, so the dark underwear and its edge stay exactly as they are, and
the neutral tone and gain (BodyPresetDef.skinGain) do not change. Same size and layout as the source: the runtime swaps it
in for the young life stages (BodyPresetDef.youngSkin).
"""
import bpy, os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

a = C.args()
sigma = float(a.get("sigma", 14)); luma_keep = float(a.get("luma", 0.22)); chroma_keep = float(a.get("chroma", 0.75))
img = bpy.data.images.load(os.path.abspath(a["src"]))
w, h = img.size
px = np.array(img.pixels[:], dtype=np.float64).reshape(h, w, 4)
rgb = px[:, :, :3]
lum = rgb @ np.array([0.2126, 0.7152, 0.0722])
skin = (lum > 0.3).astype(np.float64)                      # the underwear and its waistband are dark

r = int(3 * sigma)
k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2); k /= k.sum()


def blur(x):
    """Separable Gaussian, edges clamped."""
    p = np.pad(x, ((r, r), (0, 0)), mode="edge")
    y = sum(k[i] * p[i:i + x.shape[0]] for i in range(2 * r + 1))
    p = np.pad(y, ((0, 0), (r, r)), mode="edge")
    return sum(k[i] * p[:, i:i + x.shape[1]] for i in range(2 * r + 1))


den = np.maximum(blur(skin), 1e-6)
base = np.stack([blur(rgb[:, :, c] * skin) / den for c in range(3)], axis=2)
detail = rgb - base
dl = (detail @ np.array([0.2126, 0.7152, 0.0722]))[:, :, None]
young = base + dl * luma_keep + (detail - dl) * chroma_keep
out = px.copy()
m = skin[:, :, None]
out[:, :, :3] = np.clip(young, 0, 1) * m + rgb * (1 - m)
out[:, :, 3] = 1.0

res = bpy.data.images.new("young_skin", w, h, alpha=False)
res.pixels = out.astype(np.float32).ravel()
sc = bpy.context.scene
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = int(a.get("quality", 90)); sc.render.image_settings.color_mode = 'RGB'
os.makedirs(os.path.dirname(os.path.abspath(a["out"])), exist_ok=True)
res.save_render(os.path.abspath(a["out"]), scene=sc)
print("YOUNG_SKIN", a["out"], w, h, "mean", float(lum[skin > 0].mean()), "->", float((young @ np.array([0.2126, 0.7152, 0.0722]))[skin > 0].mean()))
