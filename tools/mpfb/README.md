# MPFB bodies

MakeHuman bodies made with MPFB (MakeHuman plugin for Blender), bound to the game's 65-joint UAL skeleton. `npm run assets:mpfb`
runs everything and writes `public/assets/characters/mpfb_{f,m}.glb`; `dev/mpfb.html` shows the result (next to the Meshy bodies).

| File | What |
|---|---|
| `build_body.py` | Blender script: human, stock-target "cosy" face and the man's build, game_engine rig weights, assets, trunks, morph deltas (body and face), retarget onto the UAL joints -> `dev/mpfb/out/mpfb_{f,m}.json/.bin` |
| `export_gameengine.py` | Route (a) reference: plain MPFB export with the game_engine rig (`mpfb_{f,m}_gameengine.glb`) |
| `mpfb_common.py` | enabling MPFB in a `--factory-startup` session, dynamic imports |
| `../build-mpfb-bodies.mts` | Node step: simplification (meshoptimizer), neutral skin / sclera / iris textures (sharp), GLB on the body GLB's skeleton, size report |
| `../../dev/mpfb.html`, `dev/mpfb.ts` | viewer (Meshy vs MPFB, same light, clips, body and face sliders, tones, iris colour, lip tint) |
| `../../dev/mpfb/shoot.mjs`, `compose.mjs` | screenshot script (also `--only=faces`, `tones`, `facemorphs`) and the sheets that are kept as JPGs in `dev/mpfb/shots/` |

Iterating without touching the game's files: `node --experimental-strip-types tools/build-mpfb-bodies.mts --out=dev/mpfb/out/work --no-publish`
(add `--skip-blender` to redo only the Node step), then
`node dev/mpfb/shoot.mjs --out=dev/mpfb/out/work/shots "--q=f=/dev/mpfb/out/work/mpfb_f.min.glb&m=/dev/mpfb/out/work/mpfb_m.min.glb"`.
Blender options of `build_body.py` (after `--`): `--no-morphs`, `--no-face-morphs`, `--face-amp`, `--stylise 0` (plain MakeHuman face),
`--smooth N`, `--smooth-shoulders`.

## Install (once, outside the repo)

```sh
# Blender 4.5 LTS (headless; libxi6 libxkbcommon0 libsm6 libgl1 libxrender1 libxfixes3 were already present)
curl -O https://download.blender.org/release/Blender4.5/blender-4.5.15-linux-x64.tar.xz   # sha256 0d2b8bb2...771e4773e
tar xf blender-4.5.15-linux-x64.tar.xz && mv blender-4.5.15-linux-x64 /opt/blender

# MPFB 2.0.18 as a Blender extension, user resources kept in /opt/mpfb/res
git clone --depth 1 https://github.com/makehumancommunity/mpfb2 /opt/mpfb2-src     # commit 6ff1eb3
(cd /opt/mpfb2-src/src/mpfb && zip -qr /opt/mpfb/mpfb-2.0.18.zip . -x '*/__pycache__/*')
BLENDER_USER_RESOURCES=/opt/mpfb/res /opt/blender/blender -b --factory-startup --command extension install-file -r user_default --enable /opt/mpfb/mpfb-2.0.18.zip

# MakeHuman asset packs (CC0), unzipped into MPFB's user data dir
D=/opt/mpfb/res/extensions/.user/user_default/mpfb/data
for p in makehuman_system_assets/makehuman_system_assets_cc0 eyebrows01/eyebrows01_cc0 eyelashes01/eyelashes01_cc0 \
         underwear01/underwear01_cc0 skins01/skins01_cc0; do
  curl -sS -O https://files.makehumancommunity.org/asset_packs/$p.zip && unzip -q -o $(basename $p).zip -d $D
done
```

Environment of the build: `BLENDER` (default `/opt/blender/blender`), `BLENDER_USER_RESOURCES` (default `/opt/mpfb/res`).
`node --experimental-strip-types tools/build-mpfb-bodies.mts --skip-blender` re-runs only the Node step.

## GLB format

Contract for the game (`public/assets/characters/mpfb_{f,m}.glb`, meshopt-compressed: the loader needs the `MeshoptDecoder`; the face and
iris additions below are all plain glTF 2.0, no further extension; `extensionsRequired` is only `EXT_meshopt_compression`, as before). Size: `mpfb_f.glb` 813 kB, `mpfb_m.glb` 795 kB
(decimal; 14.1k and 12.8k triangles; most of it is the 24 morph targets, the file without morphs is about 290 kB). Unchanged from the first prototype:
the skeleton (the 65 joints of `body_{a,b}.glb`, same order and world positions, so the UAL clips play; `mpfb_f` = frame b, `mpfb_m` =
frame a), one skinned mesh `mpfb_<sex>` on the node that holds the extras, 4 joint influences per vertex, the 10 body morphs and
their names, `mesh.extras.targetNames`, the `mpfbBody.*` extras (`sex frame morphs skinMean eyeY browY crownY head licenses`) and the
primitives `skin`, `eyes`, `eyebrows`, `eyelashes`, `underwear` (materials `mpfb_skin`, `mpfb_eyes`, `mpfb_brows`, `mpfb_lashes`,
`mpfb_underwear`).

### Primitives and materials

| Primitive (material) | Content |
|---|---|
| `skin` (`mpfb_skin`) | the body, 10800 triangles, the head at full resolution. Neutral texture (below). Extra attribute `_LIPS` |
| `eyes` (`mpfb_eyes`) | **changed:** the two eyeballs **without the iris**, white sclera texture (256 px). Before: eyeballs with a brown iris painted in the texture |
| `iris` (`mpfb_iris`) | **new:** 22 triangles per eye, the iris and pupil. Its own UVs: the whole 0..1 square is one iris, left and right eye use the same texture. Texture (256 px) is neutral grey (fibres, dark limbal ring, black pupil); `baseColorFactor` is the tint that gives the original brown back (`mpfbBody.iris.tint`) |
| `eyebrows` (`mpfb_brows`), `eyelashes` (`mpfb_lashes`) | unchanged, alpha-blended and double-sided, recolour with the material colour |
| `underwear` (`mpfb_underwear`) | female: bra and panties (CC0). **Male: trunks** (boxer-brief look, 1300 triangles) cut out of the skin mesh, 4 mm outside it; UVs are `u = 0.5`, `v` = height over the garment, with a 4 x 128 px strip texture (darker waistband, stitch line, hem line) multiplied with `baseColorFactor` (light blue-grey; the game may override the colour) |

Primitive order in the file: `skin eyes eyebrows eyelashes underwear iris` (look primitives up by material name or by
`mpfbBody` names, not by index: `prune` may reorder).

### Recolouring

* **Skin tone.** The texture is neutral: one flat colour with only fine detail (pores, nails, nostrils, ears, nipples) left, no tan, red
  hands or armpit shadow. The scalp is flat and clean (a bald head). `mpfbBody.skinMean` is the **linear-sRGB mean of the texture
  over the body texels**. With `tone * texel / skinMean` (as in the Meshy skin shader) every tone from porcelain to deep ebony gives a flat tone with
  fine detail. Checked in `dev/mpfb/shots/` with four tones.
* **Iris.** Set `mpfb_iris` `material.color` to the eye colour (a multiplication with the grey texture; the pupil stays black).
  `mpfbBody.iris = { primitive: 'iris', material: 'mpfb_iris', tint: [r, g, b] (linear, the default factor) }`.
* **Lips.** Vertex attribute `_LIPS` on the `skin` primitive, float 0..1 (1 on the lip vertices, 418 of them, blended at the edge).
  three.js's GLTFLoader names it `_lips` (`geometry.attributes._lips`); declare `attribute float _lips;` in the skin shader and blend
  with it, e.g. `diffuseColor.rgb *= mix(vec3(1.0), lipColor / luma(lipColor), lipStrength * vLips)` (what `dev/mpfb.ts` does with
  `onBeforeCompile`). The texture itself carries only a very subtle rose on the lips. `mpfbBody.lips = { attribute: '_LIPS', primitive: 'skin', range: [0, 1] }`.

### Morph targets (24, on every primitive, in this order)

`mesh.extras.targetNames` = `mpfbBody.morphs` = body morphs then face morphs; `mpfbBody.bodyMorphs` and `mpfbBody.faceMorphs` list the
two groups. Morph deltas are plain glTF POSITION deltas (metres, in the bind pose of the skeleton). `mpfbBody.morphRange = { body: [0, 1], face: [-1, 1] }`.

**Body (0..1, as before; the game scales the influence by `mpfbBody.sliderGain`):** `weight_up weight_down muscle_up muscle_down bust_up bust_down waist_wide hips_wide shoulders_wide belly_round`.
Gain: `weight_*` x3 and `muscle_*` x2 (MakeHuman's macros are subtle). `underwear` follows the skin: the trunks are made of skin vertices, so they stay 4 mm outside it at any morph value; the female garments take
the skin's deltas (smoothed) and are pushed out where needed so they stay about 4.5 mm outside the skin at the slider gain. Known: the female top's lower
hem gets ragged at the muscle slider's maximum (x2).

**Face (-1..1, signed: +1 and -1 are the two ends of MakeHuman's own slider, 0 is the default face, in between linear). They move
head vertices only (skin above 1.4 m; the eyeballs, iris, brows and lashes follow), so where that is smaller they are glTF sparse accessors
(three.js reads those like any other):**

| Morph | + | - | MakeHuman targets (ends) |
|---|---|---|---|
| `face_length` | longer, oval | shorter, round | head-oval / head-round |
| `face_width` | wider head | narrower | head-scale-horiz |
| `face_jaw_width` | wide jaw and chin | narrow, pointed | chin-width, chin-bones |
| `face_chin_length` | longer chin | shorter | chin-height |
| `face_chin_prominence` | chin forward | receding | chin-prominent |
| `face_cheek_fullness` | full cheeks | hollow | l/r-cheek-volume |
| `face_nose_width` | wide nose, nostrils | narrow | nose-scale-horiz, nostrils-width |
| `face_nose_length` | longer nose | shorter | nose-scale-vert |
| `face_eye_size` | larger eyes | smaller | l/r-eye-scale |
| `face_eye_spacing` | wider apart | closer | l/r-eye-trans-out / -in |
| `face_lip_fullness` | fuller lips | thin lips | upper/lowerlip-volume |
| `face_mouth_width` | wider mouth | narrower | mouth-scale-horiz |
| `face_brow_height` | brows (and brow mesh) higher | lower | eyebrows-trans-up / -down |
| `face_smile` | broader smile | mouth corners down | mouth-angles-up / -down |

The default face of both sexes already has a hint of a smile, slightly larger eyes and soft cheeks (stock MakeHuman targets,
`STYLE` in `build_body.py`); the man has a V-shaped torso, deltoids and pectorals, a thicker neck, stronger jaw and brow
(`STYLE["m"]`, macro muscle 0.7, weight 0.6, age about 32).

### Textures

`skin` 1024 px WebP (neutral, below), `eyes` (sclera) 256 px, `iris` 256 px, `brows` / `lashes` 256 px (RGBA), male `trunks` 4 x 128 px.
The MakeHuman skin map (bobby_03, 2048 px) is reduced to every texel's ratio to its local average (radius about 20 px, body and scalp
separately) and multiplied by the body's mean colour; the scalp keeps a fifth of its detail.

### Extras added (all under `node.extras.mpfbBody`)

`format: 2`, `bodyMorphs`, `faceMorphs`, `morphRange`, `sliderGain`, `iris`, `lips`, `underwear` (text), `skin` (text). `version` stays 1.

## Licences of what ends up in the GLBs

The MPFB add-on code is GPL-3 but the output is explicitly yours (LICENSE.md section D of MPFB); its bundled data (base mesh,
targets, rigs, weights, textures) and the system assets are CC0. The per-asset licence is read from the pack JSONs and stored in
the extras of the GLB node (`mpfbBody.licenses`). Everything in the GLBs is CC0, no attribution needed:

| Used | Licence | Author |
|---|---|---|
| base mesh, macro and detail targets (also the face targets), game_engine rig and weights | CC0 | MakeHuman team |
| eyes `low-poly`, texture `brownlight_eye.png` (sclera, and the iris pattern as luminance) | CC0 | makehuman_system |
| eyebrows `eyebrow001`, eyelashes `eyelashes01` | CC0 | makehuman_system |
| skin texture `bobby_03_young_female_hairless` (made neutral) | CC0 | bobby_03 |
| female underwear `wolgade_female_panties_01`, `wolgade_female_top_01` | CC0 | wolgade |
| male trunks | CC0 | generated by `build_body.py` from the CC0 base mesh |

The CC-BY micro shorts (Elvaerwyn) of the first prototype are gone. The MakeHuman asset packs have no CC0 male brief or boxer:
`underwear01` (CC0) holds panties, a top, stockings and arm sleeves, and the packs that do have more (`underwear02`, `underwear03`) are CC-BY and
female (lingerie, bikinis), so the trunks are generated. `underwear03` is no longer needed in the install.
