"""Carries the body's `young` shape key (stage_morph.py) into the shipped GLBs: the body, garments, accessories and hair.

  blender -b --factory-startup authoring/characters/bodies/<id>/fitting.blend --python tools/characters/blender/apply_stage_morph.py -- --body <id> --repo . [--keys young,build2,face2] [--only id,id] [--dry]

Keys: `young` (the child; always), and `build2` / `face2` where the body's source folder has `build2.json` / `face2.json`:
the second build of that body (BodyPresetDef.base and .shape: the same files drawn with these keys on). Any other shape
key of the fitting source can be named in --keys with --only (a new beard's creator keys: `--keys
jaw_width,chin_length,mouth_width,weight,young,face2 --only <beard ids>`); the body's own entry is then left alone.

The GLBs are patched in place, not re-exported: vertex order, skins, materials and the other morph targets stay byte for
byte, so cover masks and thumbnails remain valid. Per mesh a morph target `young` is added (replaced when it is already there):

- POSITION: the body's displacement at the nearest skin (blurred over a few centimetres), fading out 6-14 cm off the skin;
- NORMAL: the change of the part's own vertex normals, so relaxed muscles also shade flat. On garments (not shoes or
  accessories) the target is the reshaped surface's own normal where the skin changed: a shell garment stores the adult
  skin's normals, and those alone still draw the chest and muscle lines on flat cloth. The cloth itself is not relaxed
  further: layers that move differently poke through each other (a tee into the waistband under it). glTF wants every target to carry
  the same attributes, so the older targets get an all-zero NORMAL accessor (no buffer data).

Parts that move less than 0.5 mm are left alone. The manifest gets the body's morph entry (group `stage`, which the creator
does not list) and `followsMorphs` on the patched parts. Hair is patched too (sparsely: the key leaves the skull alone,
but the forehead, cheeks and jaw move under a fringe and beside the face).
Run it again after rebuilding a body or a part.
"""
import bpy, json, os, struct, sys
import numpy as np
from mathutils import Vector, kdtree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

KEY = "young"
MIN_MOVE = 0.0005
FLOAT, VEC3 = 5126, "VEC3"
CTYPE = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- GLB container

def read_glb(path):
    with open(path, "rb") as f:
        d = f.read()
    assert d[:4] == b"glTF", path
    n = struct.unpack_from("<I", d, 12)[0]
    js = json.loads(d[20:20 + n])
    off = 20 + n
    bn = struct.unpack_from("<I", d, off)[0]
    return js, d[off + 8:off + 8 + bn]


def write_glb(path, js, views):
    """`views`: bytes per bufferView (in order); rebuilds the single buffer with 4-byte alignment."""
    blob = bytearray()
    for bv, data in zip(js["bufferViews"], views):
        while len(blob) % 4:
            blob.append(0)
        bv["byteOffset"] = len(blob); bv["byteLength"] = len(data); bv["buffer"] = 0
        blob += data
    while len(blob) % 4:
        blob.append(0)
    js["buffers"] = [{"byteLength": len(blob)}]
    j = json.dumps(js, separators=(",", ":")).encode()
    j += b" " * (-len(j) % 4)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(j) + 8 + len(blob)))
        f.write(struct.pack("<I4s", len(j), b"JSON")); f.write(j)
        f.write(struct.pack("<I4s", len(blob), b"BIN\0")); f.write(blob)


def accessor(js, views, i):
    a = js["accessors"][i]
    nc = NCOMP[a["type"]]; dt = CTYPE[a["componentType"]]
    if "bufferView" in a:
        bv = js["bufferViews"][a["bufferView"]]
        raw = views[a["bufferView"]]; o = a.get("byteOffset", 0); stride = bv.get("byteStride")
        if stride and stride != nc * np.dtype(dt).itemsize:
            out = np.empty((a["count"], nc), dtype=dt)
            for k in range(a["count"]):
                out[k] = np.frombuffer(raw, dtype=dt, count=nc, offset=o + k * stride)
        else:
            out = np.frombuffer(raw, dtype=dt, count=a["count"] * nc, offset=o).reshape(a["count"], nc).copy()
    else:
        out = np.zeros((a["count"], nc), dtype=dt)
    if "sparse" in a:
        sp = a["sparse"]
        idx = np.frombuffer(views[sp["indices"]["bufferView"]], dtype=CTYPE[sp["indices"]["componentType"]], count=sp["count"], offset=sp["indices"].get("byteOffset", 0))
        val = np.frombuffer(views[sp["values"]["bufferView"]], dtype=dt, count=sp["count"] * nc, offset=sp["values"].get("byteOffset", 0)).reshape(sp["count"], nc)
        out[idx] = val
    return out


def compact(js, views):
    """Drops accessors and bufferViews nothing refers to any more (a replaced target's data)."""
    used = set()
    for m in js.get("meshes", []):
        for p in m["primitives"]:
            used.update(p["attributes"].values())
            if "indices" in p:
                used.add(p["indices"])
            for t in p.get("targets", []):
                used.update(t.values())
    for s in js.get("skins", []):
        if "inverseBindMatrices" in s:
            used.add(s["inverseBindMatrices"])
    for an in js.get("animations", []):
        for s in an["samplers"]:
            used.add(s["input"]); used.add(s["output"])
    order = sorted(used); amap = {o: i for i, o in enumerate(order)}
    js["accessors"] = [js["accessors"][o] for o in order]
    for m in js.get("meshes", []):
        for p in m["primitives"]:
            p["attributes"] = {k: amap[v] for k, v in p["attributes"].items()}
            if "indices" in p:
                p["indices"] = amap[p["indices"]]
            if "targets" in p:
                p["targets"] = [{k: amap[v] for k, v in t.items()} for t in p["targets"]]
    for s in js.get("skins", []):
        if "inverseBindMatrices" in s:
            s["inverseBindMatrices"] = amap[s["inverseBindMatrices"]]
    for an in js.get("animations", []):
        for s in an["samplers"]:
            s["input"] = amap[s["input"]]; s["output"] = amap[s["output"]]
    vused = set()
    for a in js["accessors"]:
        if "bufferView" in a:
            vused.add(a["bufferView"])
        if "sparse" in a:
            vused.add(a["sparse"]["indices"]["bufferView"]); vused.add(a["sparse"]["values"]["bufferView"])
    for im in js.get("images", []):
        if "bufferView" in im:
            vused.add(im["bufferView"])
    vorder = sorted(vused); vmap = {o: i for i, o in enumerate(vorder)}
    js["bufferViews"] = [js["bufferViews"][o] for o in vorder]
    views = [views[o] for o in vorder]
    for a in js["accessors"]:
        if "bufferView" in a:
            a["bufferView"] = vmap[a["bufferView"]]
        if "sparse" in a:
            a["sparse"]["indices"]["bufferView"] = vmap[a["sparse"]["indices"]["bufferView"]]
            a["sparse"]["values"]["bufferView"] = vmap[a["sparse"]["values"]["bufferView"]]
    for im in js.get("images", []):
        if "bufferView" in im:
            im["bufferView"] = vmap[im["bufferView"]]
    return views


# ---------------------------------------------------------------- the field

class Field:
    """The body's displacement, looked up by position (glTF space: Y up, the character faces +Z)."""

    def __init__(self, body, key=KEY):
        me = body.data; n = len(me.vertices)
        kb = me.shape_keys.key_blocks
        base = np.empty(n * 3); kb["Basis"].data.foreach_get("co", base)
        young = np.empty(n * 3); kb[key].data.foreach_get("co", young)
        mw = np.array(body.matrix_world.to_3x3())
        b = base.reshape(n, 3) @ mw.T + np.array(body.matrix_world.translation)
        d = (young - base).reshape(n, 3) @ mw.T
        self.pos = np.stack([b[:, 0], b[:, 2], -b[:, 1]], axis=1)
        self.delta = np.stack([d[:, 0], d[:, 2], -d[:, 1]], axis=1)
        self.kd = kdtree.KDTree(n)
        for i in range(n):
            self.kd.insert(Vector(self.pos[i]), i)
        self.kd.balance()

    def at(self, pts):
        out = np.zeros((len(pts), 3))
        for i, p in enumerate(pts):
            near = self.kd.find_n(Vector(p), 24)
            d0 = near[0][2]
            if d0 < 1e-5:
                out[i] = self.delta[near[0][1]]
                continue
            # off the skin the field is blurred over a few centimetres: cloth that bridges a fold (under the bust, between the
            # pectorals) would otherwise take the fold's two sides apart and crease
            sig = max(0.025, 1.5 * d0)
            w = np.array([np.exp(-((d - d0) / sig) ** 2) for _, _, d in near])
            out[i] = (w[:, None] * self.delta[[j for _, j, _ in near]]).sum(0) / w.sum() * (1 - smoothstep(0.06, 0.14, d0))
        return out


def vertex_normals(pos, tris, weld):
    fn = np.cross(pos[tris[:, 1]] - pos[tris[:, 0]], pos[tris[:, 2]] - pos[tris[:, 0]])
    acc = np.zeros((weld.max() + 1, 3))
    for k in range(3):
        np.add.at(acc, weld[tris[:, k]], fn)
    acc /= np.maximum(np.linalg.norm(acc, axis=1, keepdims=True), 1e-12)
    return acc[weld]


def weld_close(pos, tol=3e-4):
    """Vertex -> welded index: vertices within `tol` are one point (UV and panel seams are duplicates, not always bit-equal)."""
    n = len(pos)
    kd = kdtree.KDTree(n)
    for i in range(n):
        kd.insert(Vector(pos[i]), i)
    kd.balance()
    parent = np.arange(n)

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i

    for i in range(n):
        for _, j, _ in kd.find_range(Vector(pos[i]), tol):
            a, b = find(i), find(j)
            if a != b:
                parent[max(a, b)] = min(a, b)
    roots = np.array([find(i) for i in range(n)])
    _, weld = np.unique(roots, return_inverse=True)
    return weld.reshape(-1)


def patch(path, field, dry=False, force=False, cloth=False, key=KEY):
    js, bin_ = read_glb(path)
    assert not js.get("extensionsRequired"), path
    views = [bytes(bin_[bv.get("byteOffset", 0):bv.get("byteOffset", 0) + bv["byteLength"]]) for bv in js["bufferViews"]]
    # remove an older `young` target first
    had = False
    for m in js["meshes"]:
        names = (m.get("extras") or {}).get("targetNames") or []
        if key in names:
            k = names.index(key); had = True
            names.pop(k)
            if m.get("weights"):
                m["weights"].pop(k)
            for p in m["primitives"]:
                p["targets"].pop(k)
        for p in m["primitives"]:
            if had:
                # the all-zero normals of targets that have none of their own are put back below
                for t in p.get("targets", []):
                    acc = js["accessors"][t["NORMAL"]] if "NORMAL" in t else None
                    if acc is not None and "bufferView" not in acc and "sparse" not in acc:
                        del t["NORMAL"]
            if "targets" in p and not p["targets"]:
                del p["targets"]
        if not names and m.get("extras"):
            m["extras"].pop("targetNames", None)
            m.pop("weights", None)
    if field is None:                                    # only take the key out
        if had and not dry:
            views = compact(js, views); write_glb(path, js, views)
        return 0.0
    work = []; biggest = 0.0
    for m in js["meshes"]:
        for p in m["primitives"]:
            pos = accessor(js, views, p["attributes"]["POSITION"]).astype(np.float64)
            d = field.at(pos)
            biggest = max(biggest, float(np.linalg.norm(d, axis=1).max()))
            work.append((m, p, pos, d))
    if biggest < MIN_MOVE and not force:
        if had and not dry:
            views = compact(js, views); write_glb(path, js, views)
        return 0.0
    for m, p, pos, d in work:
        n = len(pos)
        if "indices" in p:
            tris = accessor(js, views, p["indices"]).astype(np.int64).reshape(-1, 3)
        else:
            tris = np.arange(n).reshape(-1, 3)
        weld = weld_close(pos)
        n1 = vertex_normals(pos + d, tris, weld)
        ng = vertex_normals(pos, tris, weld)
        dn = n1 - ng
        if cloth and "NORMAL" in p["attributes"]:
            # a shell garment's stored normals are the adult skin's, relief included: where the cloth was reshaped the target
            # is the reshaped surface's own normal, not the old one turned by the change
            n0 = accessor(js, views, p["attributes"]["NORMAL"]).astype(np.float64)
            w = smoothstep(0.001, 0.006, np.linalg.norm(d, axis=1))[:, None]
            # not where the stored normal and the surface disagree to begin with (folded hems, doubled layers, flipped faces)
            w = w * smoothstep(0.5, 0.8, np.einsum("ij,ij->i", ng, n0))[:, None]
            dn = w * (n1 - n0) + (1 - w) * dn
        ln = np.linalg.norm(dn, axis=1, keepdims=True)
        dn *= np.minimum(1.0, 1.0 / np.maximum(ln, 1e-9))      # a turn past 60 degrees is a folded sliver, not the surface
        d32 = d.astype(np.float32); n32 = dn.astype(np.float32)
        moved = np.nonzero((np.abs(d32).max(1) > 1e-4) | (np.abs(n32).max(1) > 0.02))[0]      # 0.1 mm, about 1 degree
        sparse = 0 < len(moved) < 0.8 * n          # shoes, hats, glasses, hair: most of the mesh stays put
        if sparse:
            idx = moved.astype(np.uint16 if n <= 65535 else np.uint32)
            js["bufferViews"].append({"buffer": 0, "byteLength": 0}); views.append(idx.tobytes()); vi = len(views) - 1
            ict = 5123 if n <= 65535 else 5125

        def add(arr, minmax):
            acc = {"componentType": FLOAT, "count": n, "type": VEC3}
            if sparse:
                js["bufferViews"].append({"buffer": 0, "byteLength": 0}); views.append(arr[moved].tobytes())
                acc["sparse"] = {"count": int(len(moved)), "indices": {"bufferView": vi, "componentType": ict}, "values": {"bufferView": len(views) - 1}}
            else:
                js["bufferViews"].append({"buffer": 0, "byteLength": 0}); views.append(arr.tobytes())
                acc["bufferView"] = len(views) - 1
            if minmax:
                acc["min"] = arr.min(0).tolist(); acc["max"] = arr.max(0).tolist()
            js["accessors"].append(acc)
            return len(js["accessors"]) - 1

        ap = add(d32, True); an = add(n32, False)
        if p.get("targets"):
            js["accessors"].append({"componentType": FLOAT, "count": n, "type": VEC3})     # all zeros: no buffer data
            az = len(js["accessors"]) - 1
            for t in p["targets"]:
                t.setdefault("NORMAL", az)
        p.setdefault("targets", []).append({"POSITION": ap, "NORMAL": an})
    for m in js["meshes"]:
        ex = m.setdefault("extras", {})
        names = ex.setdefault("targetNames", [])
        names.append(key)
        m["weights"] = [0.0] * len(names)
        assert all(len(p["targets"]) == len(names) for p in m["primitives"]), path
    if not dry:
        views = compact(js, views); write_glb(path, js, views)
    return biggest


KEYS = (KEY, "build2", "face2")
RANGE = {KEY: [0, 1.5]}
LABEL = {KEY: "Young", "build2": "Second build", "face2": "Second face"}


def follow(defn, key, moved, first_body):
    """Keeps a part's `followsMorphs` in step with what was patched (either body's file moving is enough)."""
    fm = [x for x in defn.get("followsMorphs", []) if x != key]
    if moved or (not first_body and key in defn.get("followsMorphs", [])):
        fm.append(key)
    if fm:
        defn["followsMorphs"] = fm
    else:
        defn.pop("followsMorphs", None)


def main():
    a = C.args()
    repo = os.path.abspath(a.get("repo", ".")); body_id = a["body"]
    root = os.path.join(repo, "public/assets/characters/modular")
    mpath = os.path.join(root, "manifest.json")
    with open(mpath) as f:
        manifest = json.load(f)
    only = set(a["only"].split(",")) if a.get("only") else None
    dry = bool(a.get("dry"))
    body = bpy.data.objects["Body"]
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    src = os.path.join(repo, "authoring/characters/bodies", body_id)
    first_body = body_id == manifest["bodies"][0]["id"]
    import stage_morph
    for key in (a["keys"].split(",") if a.get("keys") else KEYS):
        spec_path = os.path.join(src, key + ".json")
        if key not in body.data.shape_keys.key_blocks and key != KEY and not os.path.exists(spec_path):
            continue                                     # this body has no such key
        if key not in body.data.shape_keys.key_blocks:
            # the fitting source has no key yet (it is only saved by the pipeline's own Blender): build it in memory
            print("STAGE_MORPH", key, json.dumps(stage_morph.add_key(body, arm, stage_morph.load_spec(spec_path), key)))
        for kb in body.data.shape_keys.key_blocks:
            kb.value = 0.0
        field = Field(body, key)
        patched = 0; skipped = []
        if not only or "body" in only:
            # the body and the bodies that are builds of it (BodyPresetDef.base) share one file and one list of morphs
            for bdef in manifest["bodies"]:
                if bdef["id"] != body_id and bdef.get("base") != body_id:
                    continue
                if bdef["id"] == body_id:
                    patch(os.path.join(root, bdef["file"]), field, dry, force=True, key=key); patched += 1
                bdef["morphs"] = [m for m in bdef["morphs"] if m["id"] != key] + [
                    {"id": key, "label": LABEL.get(key, key), "target": key, "range": RANGE.get(key, [0, 1]), "group": "stage"}]
        for g in manifest["garments"]:
            rel = (g.get("files") or {}).get(body_id)
            if not rel or (only and g["id"] not in only):
                continue
            moved = patch(os.path.join(root, rel), field, dry, cloth=g.get("category") != "accessory" and g.get("slot") != "shoes", key=key)
            follow(g, key, moved, first_body)
            patched += 1 if moved else 0
            if not moved:
                skipped.append(g["id"])
        # hair and beards: the skull stays, but the forehead, cheeks, jaw and neck move under a fringe, long hair and a beard
        for hdef in manifest.get("hairstyles", []) + manifest.get("facialHair", []):
            rel = (hdef.get("files") or {}).get(body_id)
            if not rel or (only and hdef["id"] not in only):
                continue
            # the build is not put into hair: it would be a full target per hairstyle for a centimetre at the shoulders
            moved = patch(os.path.join(root, rel), None if key == "build2" else field, dry, key=key)
            follow(hdef, key, moved, first_body)
            patched += 1 if moved else 0
            if not moved:
                skipped.append(hdef["id"])
        print("APPLY_STAGE_MORPH", json.dumps({"body": body_id, "key": key, "patched": patched, "skipped": skipped}))
    if not dry:
        with open(mpath, "w") as f:
            json.dump(manifest, f, indent=1)
            f.write("\n")


main()
