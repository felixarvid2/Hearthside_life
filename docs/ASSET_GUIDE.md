# Hearthside Life - Asset guide

## Art direction

A warm, detailed miniature world: a stylised 3D dollhouse seen through a rotatable orthographic camera. Homes
feel furnished and lived in; people are stylised with readable faces, hair and clothing. Clarity and one
consistent style beat realism.

- **Palette**: warm neutrals (cream, oak, terracotta, sage, teal accents). Saturated colours are accents.
- **Lighting**: soft hemisphere fill plus a warm directional sun that follows the game clock (golden evening,
  blue night with lamp glow). Shadows are optional (high quality only).
- **Selection and feedback**: a soft ring under the selected person; placement previews use green/red tint
  **plus** a hatched pattern and text reasons, never colour alone.
- **Thumbnails**: furniture uses the Kenney isometric renders (consistent framing); surfaces render a
  procedural swatch at real scale.

## Measurement convention

| Item | Value |
|---|---|
| World unit | 1 metre |
| Building tile | 1 x 1 m |
| Wall height | 2.8 m (M1), thickness 0.12 m on the grid edge |
| Door opening | 1 tile wide, 2.1 m high |
| Window | 1 tile wide, sill ~0.9 m, height ~1.2 m |
| Counter / surface | ~0.9 m (kitchen), ~0.66-0.76 m (tables, desks) |
| Chair seat | ~0.45 m |
| Bed mattress top | ~0.5 m |
| Person height | ~1.8 m (frames a and b; height is not adjustable in M1) |

Objects are authored in rot-0 local space: origin at the footprint's minimum corner, front facing +z.
Interaction slots (`ObjectSlot`) give anchor position, height, facing and the approach tile in that space;
`src/core/geometry.ts` rotates footprints, slots and models together.

## Characters

- **Rig**: one shared 65-joint humanoid skeleton (Quaternius Universal Animation Library, CC0): root, pelvis,
  spine_01-03, neck_01, Head, arms with fingers, legs. Two body frames (`body_a`, `body_b`) share it.
- **Animations**: selected clips from UAL 1 and 2 (`anims_1.glb`, `anims_2.glb`), with finger, scale and
  non-root translation channels removed. Game animation ids (`src/core/anim.ts`) map to clips in
  `src/characters`.
- **Faces, hair, clothing** are generated in code on top of the bodies (original, procedural): features are
  attached to the Head bone; garments are skinned to the same skeleton so they deform with animation; body and
  face shape controls are morph targets with bounded ranges.
- **Developer tool**: `dev/characters.html` shows every hairstyle, garment, frame and preset with animation
  switches (compatibility check); `?style=classic|detailed` picks the body style.

### Character style: detailed (Meshy) and classic (procedural)

`GameSettings.characterStyle` (`'detailed'` by default, `'classic'` as the lighter fallback; Settings > Display)
selects the body that every person, the creator preview and the portraits use. Both styles share the skeleton,
animations, garments, hair and the creator's controls; only the skin mesh differs.

- **Detailed**: `meshy_a.glb` (frame a, from `dev/meshy/base_male_v2.glb`) and `meshy_b.glb` (frame b, from
  `dev/meshy/base_female_underwear.glb`), AI-generated with Meshy, about 10k triangles, one draw call, a 1024 px WebP
  albedo and a 512 px RGB mask. `npm run assets:meshy` (`tools/build-meshy-bodies.mts`) rebuilds them from `dev/meshy/`:
  automatic fit onto the shared skeleton and skin-weight transfer (`src/characters/meshyFit.ts`), attribute-aware
  simplification with the head locked (meshoptimizer), texture classification into the mask (`meshyBake.ts`), head data
  for the hair fit (`headMap.ts`), GLB bound to the body GLB's skeleton. The committed outputs mean a fresh clone needs
  no Meshy files; `ASSET_LIBRARY` is only needed for `npm run assets`.
- **Mask** (stored in the occlusion slot of the GLB; the loader moves it into the skin shader): R skin, G baked tank top and
  shorts, B iris (below `splitY`) or brow (above). The skin shader recolours skin texels to the creator's skin tone with the
  baked shading kept (luminance ratio to the mean baked skin), the baked clothing to a plain underwear colour, the iris
  and brow to the chosen eye and brow colours. Blush, freckles and stubble are painted from head-local coordinates (`aFace`)
  that the head map derives for the scanned head.
- **Shape**: body sliders and face sculpt morph targets are evaluated at load from the same displacement fields the
  garments use (`src/characters/meshyBody.ts`), so clothing and body stay in step. Garments are built on a body template
  fitted to the scanned surface (no stylisation).
- **Coverage**: the skin shader pushes body regions under worn garments inward (same `Coverage` data as the classic skin);
  where nothing covers it, the baked base layer reads as plain underwear on the female frame and as bare skin on the male
  frame (a man in swim trunks has a bare torso). Only skin and base layer exist on torso, legs and arms, so the
  anti-aliased texels between them are split between the two instead of showing as dark seam lines.
- **Garment fit** (`src/characters/clothing.ts`, `materials.ts`): necklines are not fixed heights. `neckline()` puts the back of
  the opening where the template's torso has narrowed to the style's half width (`heightAtHalfWidth`), so the opening sits
  on the shoulder slope of whatever body the garment is fitted to (the scanned shoulders are broader than the classic ones);
  strap and armhole positions come from the shoulder width (`strapZone`), the armhole is a curve in the cloth shader.
  Open ends (hems, cuffs, sleeve ends, skirt hems) get a rolled rim: three extra rings that curl the shell into a small
  tube (`withRim`). Skirts flare in a bell with godet folds and a lower hem on the fold ridges; loose tops hang in soft
  vertical folds below the chest. The cloth shader adds fabric relief (normal detail from the weave texture plus soft
  drape wrinkles) and a sheen / fuzz rim per fabric (`FABRIC_FX`, `FABRIC_ROUGHNESS`). Patterns, colours and coverage are
  unchanged; `tests/unit/characters3d/clothingFit.test.ts` checks the fit on both Meshy frames and both classic frames.
- **Hair, facial hair, glasses and earrings** are built on the parametric head and carried onto the scanned head by
  `HeadMap` (eye line, brow line and crown mapped; inside the head the offset scales with the ratio of the heads' radii,
  outside it keeps its length and follows the surface).
- **Hair build** (`src/characters/hair.ts`, shader in `materials.ts`): a thin scalp cap dressed with layered strand cards
  ("locks": three-vertex-wide ribbons that taper to a tip) - crown and hairline tiers, bangs, a two-layer drape for bob /
  waves / long hair that hangs against the back, a bundle of locks for the ponytail, wound gores for the bun, spiral coils for
  curls, soft puffs for the afro, plaited beads for the braids. At most about 3k triangles per style, one mesh, one draw
  call, nothing per frame except skinning (long parts blend head -> neck -> spine bones by height). The shader cuts every
  card tip into pointed strands and dissolves the scalp edge into strands with an alpha test (no blending, so no sorting),
  adds baked ambient occlusion (`aLock`), per-clump brightness and a two-lobe anisotropic highlight band. Strand cells
  smaller than a pixel are averaged so nothing shimmers at game distance.
- **AI hairstyles** (`src/characters/aiHair.ts`, `tools/build-ai-hair.mts`, `tools/hair-ai/`): hairstyles whose `build` has
  `kind: 'mesh'` and `asset: 'hair/<id>.glb'` are drawn from a generated mesh (`public/assets/characters/hair/<id>.glb`, about
  4k triangles, 170-330 kB, one draw call, plus the procedural facial-hair mesh when worn). The rest of such a `build` is a
  procedural stand-in that is drawn while the GLB loads and when it cannot load, so every consumer of `HairDef` keeps working.
  Pipeline (`npm run hair:ai -- images|models|build|content`): (1) FLUX (schnell, or dev) draws the style on a smooth bald grey
  mannequin head in a chromatic mid brown (`tools/hair-ai/styles.mts` holds the prompts); (2) TRELLIS (fal.ai) turns the image
  into a textured GLB; both are cached with prompt, seed and model in `dev/hair-ai/raw/`, the spend is booked in
  `dev/hair-ai/LEDGER.md` before every call and stops at 3 USD, and everything after this step is offline and free;
  (3) `segment.mts` separates hair from mannequin by texel chroma (dark texels by their neighbours on the surface);
  (4) `register.mts` fits the visible mannequin (face, ears, skull where the hair does not cover it) to the parametric head of
  `headShape.ts` (trimmed distance-field fit over yaw, anisotropic scale and shift), so the hair keeps its place relative to the
  face, and stores the hair in **head-local metres**; (5) the mannequin is removed, the hair is simplified with meshoptimizer
  (uv ride along, so the tint map stays on the strands), given smooth normals and a root-shade vertex colour (darker near the
  scalp), and a 512 px WebP **tint map** is baked from the generated albedo: luminance only, mannequin grey and baked large-scale
  shading removed, strand detail boosted, mean about 0.8, so the creator's hair colour (the material colour) multiplies it
  to any shade; highlights lift the brightest strand clumps to the highlight colour. A few styles add a thin scalp cap
  (`scalp` in the style list) under the generated hair.
  At run time (`CharacterView`, `loadAiHair` in `assets.ts`) the GLB loads on first use; the head-local vertices go through
  `headToBind` (classic head) and `HeadMap` (Meshy heads of both frames), exactly like the procedural hair, so one file fits
  frames a and b in both character styles. Skin weights are derived from the vertex height (head bone, blending to the neck and
  upper spine below the skull), the body and face-sculpt sliders and `hairClear` are morph targets evaluated like the procedural
  hair's, and vertices that end up inside the torso are pushed out to its surface (`clearBody`). The GLB itself carries no skin.
  Material: `createAiHairMaterial` (`materials.ts`), metalness 0, double sided, no blending.
- **Numbers** (per body): about 10,000 triangles (source 20,700), 6.7-6.9k vertices, one draw call, GLB 0.55 MB (1024 px
  WebP albedo 71-74 kB, 512 px mask 8 kB), about 7 MB of GPU texture memory per frame. A person (body, outfit, hair) costs
  about as much as a classic one (same draw calls, 5 % fewer triangles; a software-rendered frame with 8 people measured
  337-347 ms classic vs 362-374 ms detailed, 2 people 78-92 vs 90-91 ms), so the low graphics preset keeps the detailed style.
- **Face controls that cannot apply to a baked face**: brow style (the baked brows only take the brow colour), lip colour and
  lip tint (the baked mouth is a thin line). Eye colour, brow colour, freckles, blush, stubble, eye size / spacing / tilt /
  height, brow height / tilt and every face sculpt slider work (the eye and brow ones move the surface under the baked
  features instead of repainting them). The baked tank top and shorts are the base layer: hidden under garments, read as
  plain underwear where nothing covers them and as bare skin where a garment of that half is worn but leaves them visible.

## Furniture

- **Source**: Kenney Furniture Kit 2.0 (CC0) GLB models, about half scale; each `ObjectDef.model` sets
  `scale` (usually 2.0, beds ~1.75), `offset` and `yaw` so the model fills its footprint and faces +z.
- **Materials**: the kit's unlit materials are converted to lit materials at load time. Finish regions map kit
  material names (wood, carpet, metal, ...) to curated swatches.
- **Developer tool**: `dev/objects.html` lays out every object on a measured grid with footprint, front arrow
  and interaction anchors.

## Walls, floors, openings

- Procedural, seeded Canvas2D painters (`src/render/textures/`: `wallPatterns*.ts`, `wallMaterials*.ts`,
  `floorPainters*.ts`) generate seamless textures from design parameters and curated palettes. One painter can
  serve several designs when its parameters give a visibly different layout (stripe-set: candy, ticking, breton;
  geo-motifs: chevron, tumbling blocks, scales, quatrefoil, dots; parquet-set: chevron, basket weave, cubes).
  A palette change is a variant, never a new design.
- **Detail maps** (`mapPainters.ts`, `mapKit.ts`, `surfaceMaps.ts`): where generated material beats procedural
  drawing (oak grain, barnwood, stone, marble, slate, berber loops, sisal, pebbles, lawn, plaster, rubble, ledge
  stone, board-formed concrete) the painters read a seamless 512 px greyscale map from `public/assets/surfaces/`
  and tint it with the palette: map value 0 -> palette dark, 0.5 -> base, 1 -> light, so every palette still
  works. `map-wall` fills a wall (plaster, grasscloth, rubble), `map-floor` fills a floor either continuously
  (pebbles, lawn, fibre) or in grouted cells that each show a random part of the map (marble slabs),
  `map-boards` lays staggered boards cut from a grain map (wide oak, narrow strip). Layout (boards, joints,
  grout, skirting) is always procedural.
- The maps are AI-generated (fal.ai FLUX.1 [dev], see LICENSES) and reproducible: `dev/surfaces-ai/generate.mjs`
  fetches raw sources into `dev/surfaces-ai/raw/` (gitignored, cached, never fetched twice) and logs the spend to
  `dev/surfaces-ai/LEDGER.md`; `npm run assets:surfaces` (`tools/build-surface-maps.mjs`) turns them into the
  committed WebP maps (illumination flattened, made seamless by offset-and-blend, normalised). The maps load once
  at start-up (`preloadSurfaceMaps`, started by `GameView`); until a map has arrived the painter draws a flat
  fallback of the same layout, `surfaceTextures` repaints the texture in place when the map loads and does not
  cache thumbnails painted without it.
- UV convention: walls `u = world coordinate along the wall axis / repeat`, `v = height / 2.8`; floors
  `uv = (x, z) / repeat`. Patterns stay aligned along wall runs and across tiles.
- Doors and windows are procedural meshes (`src/render/openingMeshes.ts`) with real wall holes. All openings are
  one tile wide in the wall (the world model holds one opening per wall edge); variety comes from the hole width
  (0.6-0.94 m), the height and sill, and the leaf or sash type: doors panel, glazed, plank, flush, full glass,
  stable (split) and louvred; windows sash, casement (twin or single, with a transom), fixed, and sliding.
- **Developer tool**: `dev/surfaces.html` previews every wall and floor design at room scale.

## Export and pipeline rules

- `tools/build-assets.mjs` is the only way third-party files enter `public/assets/` (the AI-generated Meshy bodies
  come in through `tools/build-meshy-bodies.mts`, see Characters); it records bounds, materials and sources in
  `public/assets/manifest.json`. Re-run it after changing the source selection.
- Runtime models are GLB. Wall and floor textures are painted at runtime; the only image files are the 14 detail maps in `public/assets/surfaces/` (about 1 MB in total).
- Every visible default asset must fit this guide; temporary art is marked as such in CONTENT_STATUS.

## Licenses

| Asset | Source | License |
|---|---|---|
| Character bodies and animations | Quaternius, Universal Animation Library 1 & 2 | CC0 1.0 |
| Detailed character bodies (`meshy_a.glb`, `meshy_b.glb`) | Generated with Meshy (meshy.ai) on 2026-11-01 | Meshy terms of the generating account (check before distribution) |
| Furniture models and thumbnails | Kenney, Furniture Kit 2.0 | CC0 1.0 |
| UI sounds and jingles | Kenney, Interface Sounds and Music Jingles | CC0 1.0 |
| Detail maps for AI-textured walls and floors (`public/assets/surfaces/`) | Generated with fal.ai FLUX.1 [dev] on 2026-11-01 | fal.ai and FLUX.1 [dev] terms for outputs (check before distribution) |
| Faces, hair, clothing, wall and floor layouts and palettes, doors, windows, icons | Original, generated by this project's code | Project license |

See also `public/assets/LICENSES.md`.
