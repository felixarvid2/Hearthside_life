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
  where nothing covers it, the baked base layer reads as plain underwear.
- **Hair, facial hair, glasses and earrings** are built on the parametric head and carried onto the scanned head by
  `HeadMap` (eye line, brow line and crown mapped, horizontal offset scaled by the ratio of the heads' radii).

## Furniture

- **Source**: Kenney Furniture Kit 2.0 (CC0) GLB models, about half scale; each `ObjectDef.model` sets
  `scale` (usually 2.0, beds ~1.75), `offset` and `yaw` so the model fills its footprint and faces +z.
- **Materials**: the kit's unlit materials are converted to lit materials at load time. Finish regions map kit
  material names (wood, carpet, metal, ...) to curated swatches.
- **Developer tool**: `dev/objects.html` lays out every object on a measured grid with footprint, front arrow
  and interaction anchors.

## Walls, floors, openings

- Procedural, seeded Canvas2D painters (`src/render/textures/painters.ts`) generate seamless textures from
  design parameters and curated palettes. A palette change is a variant, never a new design.
- UV convention: walls `u = world coordinate along the wall axis / repeat`, `v = height / 2.8`; floors
  `uv = (x, z) / repeat`. Patterns stay aligned along wall runs and across tiles.
- Doors and windows are procedural meshes (`src/render/openingMeshes.ts`) with real wall holes.
- **Developer tool**: `dev/surfaces.html` previews every wall and floor design at room scale.

## Export and pipeline rules

- `tools/build-assets.mjs` is the only way third-party files enter `public/assets/` (the AI-generated Meshy bodies
  come in through `tools/build-meshy-bodies.mts`, see Characters); it records bounds, materials and sources in
  `public/assets/manifest.json`. Re-run it after changing the source selection.
- Runtime models are GLB. Textures are generated at runtime (no large image files).
- Every visible default asset must fit this guide; temporary art is marked as such in CONTENT_STATUS.

## Licenses

| Asset | Source | License |
|---|---|---|
| Character bodies and animations | Quaternius, Universal Animation Library 1 & 2 | CC0 1.0 |
| Detailed character bodies (`meshy_a.glb`, `meshy_b.glb`) | Generated with Meshy (meshy.ai) on 2026-11-01 | Meshy terms of the generating account (check before distribution) |
| Furniture models and thumbnails | Kenney, Furniture Kit 2.0 | CC0 1.0 |
| UI sounds and jingles | Kenney, Interface Sounds and Music Jingles | CC0 1.0 |
| Faces, hair, clothing, wall and floor designs, doors, windows, icons | Original, generated by this project's code | Project license |

See also `public/assets/LICENSES.md`.
