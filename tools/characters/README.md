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

## Steps (updated 2026-11-07; all scripts: `blender -b --factory-startup --python <script> -- <args>`)

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
5. **Inspect**: `dev/wardrobe.html` (`npm run dev`) shows every part on every body in the game's renderer, posed
   (`pose=idle|walk|sit`). `blender/render_views.py --blend <source.blend> --out <prefix> [--focus head|torso]
   [--pose fit] [--hide <prefix>]` renders the Blender sources (front/left/back/right, Cycles on the CPU).
6. **Audit**: `node tools/characters/audit-glb.mjs <files...>` prints hierarchy, skins (joint rest transforms,
   inverse bind translations), meshes, morph targets, materials, textures and clips as JSON.

## Status (2026-11-07)

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
