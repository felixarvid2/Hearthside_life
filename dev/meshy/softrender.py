#!/usr/bin/env python3
"""Quick software render of posed Meshy vertices dumped by stretch.mts (no browser needed).
usage: softrender.py DUMPDIR NAME OUT.png [view=front|side|three|back] [x0 x1 y0 y1] [color=bone|normal] [edge]
Triangles are painter-sorted and flat shaded; stretched triangles (area/edge growth vs bind) are drawn red."""
import sys, struct, math
import numpy as np
from PIL import Image, ImageDraw

d, name, out = sys.argv[1:4]
view = sys.argv[4] if len(sys.argv) > 4 else 'front'
box = [float(v) for v in sys.argv[5:9]] if len(sys.argv) >= 9 else [-1.0, 1.0, 0.0, 1.9]
mode = sys.argv[9] if len(sys.argv) > 9 else 'bone'
P = np.fromfile(f'{d}/{name}.f32', dtype=np.float32).reshape(-1, 3)
B = np.fromfile(f'{d}/bind_0.f32', dtype=np.float32).reshape(-1, 3)
I = np.fromfile(f'{d}/index.u32', dtype=np.uint32).reshape(-1, 3)
C = np.fromfile(f'{d}/colors.u8', dtype=np.uint8).reshape(-1, 3)
yaw = {'front': 0, 'side': -math.pi / 2, 'three': -0.6, 'back': math.pi}[view]
c, s = math.cos(yaw), math.sin(yaw)
R = np.array([[c, 0, -s], [0, 1, 0], [s, 0, c]])
Q = P @ R.T
W, H = 900, 900
sx = W / (box[1] - box[0]); sy = H / (box[3] - box[2]); sc = min(sx, sy)
def proj(q):
    return np.stack([(q[:, 0] - box[0]) * sc, H - (q[:, 1] - box[2]) * sc], 1)
scr = proj(Q)
tri = I
a, b, cc = Q[tri[:, 0]], Q[tri[:, 1]], Q[tri[:, 2]]
n = np.cross(b - a, cc - a)
nl = np.linalg.norm(n, axis=1) + 1e-12
n = n / nl[:, None]
facing = n[:, 2]  # camera looks down -z (z toward viewer)
depth = (a[:, 2] + b[:, 2] + cc[:, 2]) / 3
light = np.array([0.4, 0.6, 0.7]); light /= np.linalg.norm(light)
shade = np.clip(n @ light, 0, 1) * 0.7 + 0.3
# stretch per triangle: max edge growth
def el(x, i, j): return np.linalg.norm(x[tri[:, i]] - x[tri[:, j]], axis=1)
g = np.zeros(len(tri))
for i, j in ((0, 1), (1, 2), (2, 0)):
    g = np.maximum(g, el(P, i, j) / (el(B, i, j) + 1e-6))
order = np.argsort(depth)
img = Image.new('RGB', (W, H), (239, 231, 218))
dr = ImageDraw.Draw(img)
for t in order:
    col = tuple(int(v) for v in C[tri[t]].mean(0)) if mode == 'bone' else (200, 200, 200)
    sh = shade[t] if facing[t] > 0 else 0.35
    col = tuple(int(min(255, v * sh * 1.1 + 25)) for v in col)
    if g[t] > 2.0: col = (255, 0, 0)
    dr.polygon([tuple(scr[k]) for k in tri[t]], fill=col, outline=None)
img.save(out)
