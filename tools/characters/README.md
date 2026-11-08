# Modular characters: authoring pipeline

Builds the GLB parts of the "Quaternius (preview)" character style (runtime: `src/characters/modular/`, contract:
`src/characters/modular/types.ts`, manifest: `public/assets/characters/modular/manifest.json`).

Editable sources live in `authoring/characters/` and runtime outputs in `public/assets/characters/modular/`. The browser
only ever loads the exported GLBs and JSON. OpenSew-2, GBH Tool, Blender cloth and Geometry Nodes are authoring tools.

## Tool versions (tested 2026-11-06)

| Tool | Version | Licence | Notes |
|---|---|---|---|
| Blender | 4.5.15 LTS (`/opt/blender/blender`) | GPL | Headless. Workbench and EEVEE need EGL, which the container lacks, so inspection renders use Cycles on the CPU. |
| OpenSew-2 ("Clothing Design") | 1.0.0, git `86b4322` (github.com/MarcelloMorettoni/opensew-2) | GPL-3.0 | Upstream tests on Blender 5.2; bl_info asks for ≥ 4.2. On 4.5.15 it measured, sewed, relaxed and finalized a T-shirt (smoke test: its own avatar; then our bodies). |
| GBH Tool | 2.2.3, git `f347e7d` (github.com/GixoXYZ/BlenderGBHTool) | GPL-2.0-or-later | Needs Blender ≥ 4.2. Enables on 4.5.15. Its update check fails in a thread with `WindowManager has no attribute gbh_update` (no network to GitHub); harmless. |
| CharacterStudio | git `293182b` (github.com/M3-org/CharacterStudio) | MIT | Inspected only; no code copied yet (see "CharacterStudio" below). |

The add-ons are not part of this repository. Clone them to `/home/user/authoring-src/` and use an isolated
profile, so they never touch another Blender setup:

```sh
P=/home/user/authoring-src/bprofile
mkdir -p $P/scripts/addons $P/extensions/user_default
ln -sfn /home/user/authoring-src/opensew-2/clothing_design $P/scripts/addons/clothing_design
ln -sfn /home/user/authoring-src/BlenderGBHTool $P/extensions/user_default/gbhtool
export BLENDER_USER_RESOURCES=$P
```

Licences: the GPL add-ons run inside Blender only. The exported meshes, weights and materials are our own data and
are not covered by the add-ons' licences; no add-on code, node group or library asset is exported. The bodies are
Quaternius CC0. Asset licences are recorded per part in the manifest and in `public/assets/LICENSES.md`.

## Steps (updated 2026-11-08; all scripts: `blender -b --factory-startup --python <script> -- <args>`)

1. **Body**: `blender/prepare_body.py --src <quaternius.gltf> --id <body-id> --out-glb public/assets/characters/modular/bodies/<id>.glb --out-blend authoring/characters/bodies/<id>/fitting.blend --out-json authoring/characters/bodies/<id>/info.json --materials authoring/characters/bodies/<id>/materials.json`
   - Imports with `bone_heuristic='BLENDER'`, so glTF joint frames survive the round trip. Measured on the UAL
     mannequins: rest rotations within 0.06°, positions and inverse bind matrices within 1e-6 m.
   - Drops animations, limits weights to 4 and normalizes them.
   - `--morphs authoring/characters/bodies/<id>/morphs.json` adds the shape keys (`blender/morphs.py`) before
     `fitting.blend` is saved. Face keys: `nose_width`, `mouth_width`, `jaw_width`, `chin_length` (-1..1). Body key:
     `weight` (-0.5..1). Body-shell garments copy the body's keys; hair does not follow them.
   - Splits the skin into 17 `Body_<region>` meshes by dominant bone, and keeps the whole body in `fitting.blend` for
     fitting.
2. **Garment**: `blender/build_garment.py --params authoring/characters/garments/<id>/params.json --body <body-id> --repo .`
   - The design parameters live in `params.json`: preset, ease (`fit`), `sleeve_len`, `length_to`, fabric, take-in,
     settle frames, fitting pose, triangle budget, colour regions. `per_body` overrides them per body.
   - `opensew_adapter.py` adds the Quaternius bone names to OpenSew-2's landmark tables at run time (the add-on is not
     modified). Without it, limbs are not found: `thigh.l` is not a substring of `thigh_l`, and lower arms are not
     excluded from the torso.
   - **Fitting pose vs bind pose.** The UAL rig rests in a T-pose; OpenSew drafts sloped shoulders for lowered arms.
     The arms are lowered 45° in *pose mode only*. After sewing, relaxing and finalizing (weights transferred from
     the body), every garment vertex is moved back by the inverse of its own skinning matrix at that pose
     (`unpose`). So the GLB is in the body's bind pose, and the rest pose of the armature is never changed.
   - Weights: `rebind` replaces OpenSew's nearest-surface transfer with a ray along each vertex's normal into the
     posed body (a loose sleeve's underside otherwise takes the torso's weights).
   - `armhole` (`depth_extra`, `scye_max`): `opensew_adapter.widen_armhole` raises OpenSew's armhole limits for a
     muscular arm (the Quaternius male needs 78 cm; the add-on stopped at 50 and drafted a sleeve narrower than the arm).
   - `finish: {"mode": "body"}` (used by the catalog): the shipped surface is the skin under the sewn garment,
     raised by the garment's own height (mapped to `min`..`max`), with the body's weights; `close` rings fill seam
     gaps, `exclude_regions` are never covered, the boundary is tucked to the skin. `"mode": "shell"` (project the
     sewn mesh itself) and `conform` (push-out only) are kept for comparison.
   - Then: decimate to `target_tris`, smart-UV, weights limited to 4 and normalized, region coverage measured,
     parented to the armature. Writes the GLB, `authoring/.../<id>__<body>.blend` (source) and `build_<body>.json`
     (measurements, coverage, counts).
   - `finish` options: `force_regions` (always covered; applied before the morphological close, so the navel fills),
     `force_h`, and `hood` (`add_hood`, a measured rolled hood on the back of the neck; params `reach_deg`, `collar_at`,
     `collar`, `thick`, `drop`, `rise`, `segments`, `ring`).
   - Catalog garments (`blender/garment_parts.py`, used by `build_garment.py` `finish.cut`): part `top`, `bottom`,
     `full`, or `shoes`. Neck kinds `crew`, `scoop`, `v`, `square`, `mock`, `turtle`, `off`, cut relative to the measured
     neck landmark + 3 cm so the trapezius stays covered. Sleeve and leg cuts are fractions along the arm and leg bone
     chains (a negative sleeve cuts into the shoulder, for tanks). Hem and waist sit at landmarks (neck, shoulder, chest,
     waist, hip, crotch, knee, ankle) plus an offset. Also `open_front` width, `bib` (overalls), `leg_flare` and
     `sleeve_flare` (extra height below the knee or towards the wrist). Shoes: boot height, `vamp` (toe box kept for low
     shoes), `straps` (sandal pitch), sole height and `welt` (a second colour region, pushed out from the foot axis).
   - `finish.skirt`: a tube fitted to the oval hull of the body at each height, with `flare`, `offset`, `pencil`,
     `open_front` (radians, for coats). Weights are mostly pelvis, with the thighs swinging the lower part.
   - `finish.hood` (worn down) and `finish.hood_up` (a shell round the head with a face opening, `max_r` clamp; used by
     `hoodie_up`). `force`: the cut is covered even where no sewn design reaches.
   - OpenSew sewing is optional (`"preset": null`) and cached by design key in `~/authoring-cache/sewn`
     (`HEARTHSIDE_SEWN_CACHE`).
3. **Cover mask**: `node tools/characters/cover-masks.mjs <body.glb> <garment.glb> <out.cover.json> --body <id> --garment <id>`
   - Marks the body vertices the garment covers: a ray along the vertex normal hits the garment within 6 cm.
   - The game hides only triangles whose three vertices are covered. A T-shirt that ends mid-belly hides the covered
     part and leaves the rest visible, so nothing pokes through and no hole opens. Whole-region `hides` stay available
     but are usually empty: even the chest is only ~90 % covered by a T-shirt (neck opening, armpits).
4. **Hair**: `blender/build_hair.py --params authoring/characters/hair/<id>/params.json --body <body-id> --repo .`
   - Scalp: the Head-dominated faces above the hairline. Front and back hairline heights are in head space, 0 = skull
     base, 1 = crown.
   - Guides: Fibonacci root samples on the scalp, walked over the skull at `volume` offset away from the part line for
     `length`; long styles fall with `gravity` below `fall_below`. Each build writes `guides_<body>.json` (editable
     source).
   - GBH Tool: the modifiers of its "GBH Simple Mesh Hair" preset are copied onto the guides. The profile is scaled
     from its real radius so a clump is `clump_width` wide. Width Control is the taper, Snap Roots uses the scalp.
     The preset's Surface Deform is skipped. The result is converted to a mesh, with a hair-coloured scalp cap
     (`cap`) so no scalp shows between clumps.
   - Weighted to `Head`, blending to `neck_01`/`spine_03` below the skull base. Exported with the armature.
   - Options: `cut_at` (blunt cut height in head space, bob), `front_side` (roots in front of the ears swept aside),
     `ponytail` {`gather_h`, `gather_out`, `walk_seg`, `tail_points`, `tail_len`, `tail_spread`, `tail_out`}. Lower
     `resolution_cm` rather than decimating GBH ribbons, which makes spiky clumps (ponytail 3.0 cm, 14,000 tris; bob
     2.6 cm, 12,000 tris).
   - Catalog options (`blender/build_hair.py`): `root_mask` (mohawk, undercut, sides); `fringe` {`depth`, `to`, `sweep`,
     `length`, `band`}; `curl` {`radius`, `per_m`, `from`}; `wave` {`amp`, `per_m`}; `flow` `radial` (spikes) or
     `sphere` (afro, with `sphere_r`, `sphere_h`). `gathers` is a list of {`angle`, `gather_h`, `kind` `tail`|`bun`|`braid`,
     `tail_len`, `tail_points`, `tail_spread`, `tail_out`, `bun_r`, `bun_turns`, `braid_w`, `braid_twists`}, with
     `gather_all` or `gather_above` (half-up). A ponytail stays one back gather. `clumps` 0 keeps only the raised cap
     (buzz cut, stubble).
   - Beard mode (`"beard": {mustache, soul, chin, jaw, cheeks, sideburns, neck, chin_w, cheek_h, spread, forward}`):
     roots are sampled by area on the face skin from `morphs.landmarks`. Weights and face/body morph keys are copied from
     the nearest body vertex. Output goes to `facial_hair/`.
5. **Inspect**: `dev/wardrobe.html` (`npm run dev`) shows every part on every body in the game's renderer, posed
   (`pose=idle|walk|sit`). `blender/render_views.py --blend <source.blend> --out <prefix> [--focus head|torso]
   [--pose fit] [--hide <prefix>]` renders the Blender sources (front/left/back/right, Cycles on the CPU).
   - `dev/wardrobe.html` query parameters: `part`, `body`, `pose=idle|walk|sit|lie`, `t`, `shot`, `size`,
     `outfit=slot:id,...`, `morph=id:value,...`, `yaw`, and `keep=1` (characters stay posed; `window.wardrobeChars`
     exposes them for measurements).
6. **Audit**: `node tools/characters/audit-glb.mjs <files...>` prints hierarchy, skins (joint rest transforms,
   inverse bind translations), meshes, morph targets, materials, textures and clips as JSON.
7. **Catalog**: see "Catalog (Milestone 10, Quaternius style)" below. Designs are written with `--write`, then built
   and listed in the manifest in one run.

## Catalog (Milestone 10, Quaternius style)

The catalog is generated from design tables, so the parameters are edited in code, not in the files. Each design
script writes `authoring/characters/<kind>/<id>/params.json` when run with `--write`.

| Kind | Design table | Count | Contents |
|---|---|---|---|
| garments | `catalog/garments.py` | 133 | 41 tops (including `hoodie_up`, hood worn up), 16 outer, 28 bottoms, 24 one-pieces, 24 shoes. 130 cut designs and 3 sewn Stage C garments. |
| hair | `catalog/hair.py` | 60 | 57 hairstyles and 3 Stage C hairstyles. |
| facial hair | `catalog/facial_hair.py` | 16 | Beard mode, see Steps 4. |
| accessories | `catalog/accessories.py` | 32 | Slots: hat, eyewear, earrings, neck, wrist, waist, bag. |

Build with `catalog/build_all.py`:

```sh
python3 tools/characters/catalog/build_all.py <garments|hair|facial|accessories> [--ids a,b] [--jobs 3] [--skip-built] [--manifest-only]
```

- Runs Blender (`--python-exit-code 1`) once per body (`ubc_male`, `ubc_female`). Garments also get cover masks
  (`cover-masks.mjs`).
- Updates the manifest entries: `files`, `covers`, `colorRegions` with palettes, `tags`, `followsMorphs`, `licence`,
  `source`. Thumbnails are kept (`thumbnails.mjs`).
- `--manifest-only` updates the manifest entries without running Blender, from the GLBs already in `public/` and the `build_<body>.json` reports next to the params.
- Logs go to `~/authoring-cache/logs`.

Thumbnails (`thumbnails.mjs`): hats, eyewear and earrings and facial hair use a face shot; bottoms, shoes and
one-pieces are framed full-body; gathered hair and bags are seen from behind (`yaw=`).

Restrictions in the manifest:

- Hats exclude tall styles (buns, mohawk, afro, spiky, high ponytail). The headband excludes afro, mohawk and spikes.
- Hooded garments exclude low gathered styles. `hoodie_up` is also restricted against long hair and hats.

Accessories (`blender/build_accessory.py`): procedural hats (cap, beanie, fedora, sun hat, bucket hat, beret,
headbands); glasses and sunglasses (round, square, aviator; lenses are a second colour region); earrings (stud, hoop,
drop) at the ear lobes; neck (chain, pendant, choker, pearls, scarf, tie, bow tie); wrist (watch, smartwatch, bangle,
cuff on the lower arm); belts at the waist; bags (backpack, crossbody, belt bag). Landmarks come from the body (eye
material centres, ear extremes and lobes, skull, neck ring, wrist, waist). Weights are single-bone or blended. Morph
deltas come from the nearest body vertex within 6-10 cm.

Posture anchors for modular adults were measured with the wardrobe in `src/characters/posture.ts`. Sit: seat a
0.467 / -0.097, seat b 0.471 / -0.175. Lie: backY, centerZ a -0.071 / -0.158, b -0.076 / -0.146 (a = ubc_male,
b = ubc_female, the body frames of `defaults.bodyByFrame`).

Light skin: `skinMaterialColor` scales a colour that the texture gain pushes above 1 back as a whole, so light skin
gets no golden tint.

## Status (2026-11-08)

- **Bodies.** `ubc_male` / `ubc_female`: Quaternius Universal Base Characters (Standard, CC0), from the pack's
  `Base Characters/Godot - UE/*.gltf`. `authoring/characters/bodies/<id>/materials.json` renames the materials to
  `M_Skin` / `M_Eyes` / `M_Brows`, swaps in the neutral skin texture (`skin_base.png`, from
  `tools/characters/bake_skin.py --src T_Superhero_<M|F>_Dark*.png`; the printed gain is the manifest's `skinGain`),
  drops the roughness and missing normal maps and writes 1024 px JPEGs. The stand-in mannequins are gone.
- **tshirt_crew.** Both bodies, hybrid body finish, about 2,459 / 2,814 triangles, every vertex weighted, cover mask.
- **trousers_straight.** Both bodies, bottom, about 2,672 / 2,932 triangles, cover mask.
- **hoodie_pullover.** Both bodies, top, with the measured hood, about 3,800 / 4,300 triangles, cover mask.
- **short_crop.** Both bodies, about 6,700 / 7,000 triangles, skinned to the head.
- **bob_chin** (about 12,500 triangles) and **ponytail_mid** (about 14,400), both bodies.
- **Thumbnails.** Every part, rendered by `thumbnails.mjs`; bottoms, shoes and one-pieces are framed full-body.
- **Morphs (Stage D).** Shape keys from `blender/morphs.py`, see Steps 1.
- **Restriction.** `hoodie_pullover` and `ponytail_mid` conflict (`manifest.restrictions.parts`).
- **Catalog (Milestone 10).** 133 garments (41 tops incl. `hoodie_up`, 16 outer, 28 bottoms, 24 one-pieces, 24 shoes;
  130 cut designs and 3 sewn Stage C), 60 hairstyles (57 + 3 Stage C), 16 facial hair, 32 accessories (hat, eyewear,
  earrings, neck, wrist, waist, bag). Each built for `ubc_male` and `ubc_female`. See "Catalog" above.

## CharacterStudio

CharacterStudio (MIT, git `293182b`) is a React app built on VRM: it loads every trait through `VRMLoaderPlugin`,
renames bones through the VRM humanoid map and skips a file without VRM data, keeps a skeleton and an animation mixer
per trait, and hides the body under clothing by raycasting (three-mesh-bvh) after every trait change. It cannot load our
GLB parts, so its logic was ported instead (MIT header in each file, row in `public/assets/LICENSES.md`):

| Ours | From | Notes |
|---|---|---|
| `src/characters/modular/creator/framing.ts` | `src/library/cameraFrameManager.js` | Shots `face` / `upper` / `full` between named bones; the distance is solved for the frustum, so portrait and landscape both fit. |
| `src/characters/modular/restrictions.ts` | `src/library/manifestRestrictions.js` | `manifest.restrictions.slots` / `.parts` (symmetric) plus each garment's `conflicts`; `equipWith` removes what a new part conflicts with. Used by `resolveLook`. |
| `tools/characters/thumbnails.mjs` | `src/library/thumbnailsGenerator.js` | Renders each part on a body with Playwright, writes `thumbs/<id>.webp`; `--write-manifest` sets `thumbnail`. |
| `dev/wardrobe.html` | (the app's trait preview) | Dev-only QA grid: every body x every hairstyle and garment, `pose=idle|walk|sit`, `shot=`, `body=`, `part=`. `npm run dev`, then open `/dev/wardrobe.html`. Not in the production build. |

Not ported: the VRM loader, expressions, look-at, spring bones and VRM export. `cull-mesh.js` (runtime raycast culling)
is the fallback to consider once body morphs (Stage D) make precomputed cover masks stale. `merge-geometry.js` /
`create-texture-atlas.js` (one mesh and one atlas per finished character) are tied to VRM and MToon; only the idea is
kept for a later draw-call optimisation.
