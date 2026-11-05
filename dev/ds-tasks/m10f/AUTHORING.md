# Milestone 10 furniture: authoring guide

About 395 new buy-mode designs are built by code, in the style of the Kenney Furniture Kit, by five people working in parallel,
each in their own worktree and their own files. This is everything you need. Read `tools/furniture-extra/models.mjs` (any
model there) and the three exemplars once before you start.

## The rule: edit only your group's files

Five groups. Pick yours and touch nothing else.

| Group | Model file | Content file |
|---|---|---|
| `seating-beds` | `tools/furniture-extra/m10/seating-beds.mjs` | `src/content/objectsM10/seating-beds.ts` |
| `tables-storage` | `tools/furniture-extra/m10/tables-storage.mjs` | `src/content/objectsM10/tables-storage.ts` |
| `kitchen-bath-electronics` | `tools/furniture-extra/m10/kitchen-bath-electronics.mjs` | `src/content/objectsM10/kitchen-bath-electronics.ts` |
| `lighting-outdoor-kids` | `tools/furniture-extra/m10/lighting-outdoor-kids.mjs` | `src/content/objectsM10/lighting-outdoor-kids.ts` |
| `decor-hobby` | `tools/furniture-extra/m10/decor-hobby.mjs` | `src/content/objectsM10/decor-hobby.ts` |

Yours alone, besides those two files: the GLBs and thumbnails of your models (`public/assets/furniture/<name>.glb`,
`thumbs/<name>.png`) and `src/content/objectsM10/<group>.models.ts` (generated, see below).

Never edit: `kit.mjs`, `models.mjs`, `index.mjs`, `m10/index.mjs`, `objects.ts`, `objectAnim.ts`, `objectAssets.ts`,
`screens.ts`, `types.ts`, `validate.ts`, other groups' files, `public/assets/LICENSES.md`. Need something from them (a new
helper in the kit, a new animation kind)? Say so to the lead; do not patch it in your branch, or the five branches stop merging.
Do not hand-edit `public/assets/manifest.json` either: the build writes your entries. If it conflicts when branches are merged,
take either side and run `node tools/build-extra-furniture.mjs` (the full build is deterministic and rewrites everything).

Names: a model is a camelCase key (`armchairWingback`, the GLB file name); its design id is kebab-case (`armchair-wingback`).
Every name is unique across all groups and also unique against the Kenney models (the build throws on a duplicate). One model
per design: the catalog counts a design only if no other ready design uses the same model.

## 1. Writing a model

A model is a function in your group file returning a `Model` from `tools/furniture-extra/kit.mjs`; the file's default export is
a record `{ modelName: builderFn }`:

```js
import { Model } from '../kit.mjs';

function armchairWingback() {
  const m = new Model('armchairWingback');
  m.box('wood', [0.04, 0, 0.04], [0.1, 0.12, 0.1]);          // a leg: min corner, max corner, metres
  m.box('carpet', [0.02, 0.12, 0.05], [0.78, 0.4, 0.75]);    // seat block, in the `carpet` fabric material
  return m;
}
export default { armchairWingback };
```

Style, in this order of importance:

- Kenney look: flat colours from the kit's materials only (`wood woodDark metal metalDark metalLight metalMedium carpet
  carpetDarker carpetWhite carpetBlue glass plant fur`), chunky bevel-free boxes, rods and short cylinders, no textures. Details
  are separate boxes (a handle is a rod, a button is a small box), not geometry tricks. Use `lathe`/`cylY` (8 to 12 segments)
  for round things, `slab`/`rod` for tilted ones.
- Real-world metres in tile space: x along the width, z along the depth, y up. A 1 x 1 tile is 1 m, so a 0.9 m wide chest is
  `0.9` wide. Keep the model inside its footprint (the content `fit()` centres it); it is written at half scale, so the usual
  fit scale is 2.
- FRONT is +z (the side people use it from: seats face +z, doors and drawers open to +z, the TV looks to +z), the bottom rests
  on y = 0 (wall items: bottom at their mounting height, see `lift` below), the back at low z.
- Materials decide what players can recolour: a finish region lists material names (`woodR(['wood','woodDark'])`), so put the
  parts a player should repaint in the same material and keep fixed colours (cushion piping, food, screens) in materials your
  regions do not list.
- Triangle budget: at most 3000 per model (a unit test fails above it); typically 300 to 1500. A box is 12 triangles, a 12-sided
  `cylY` 48. If you are near 1500, you are modelling things nobody sees.
- Models are small: a GLB is 20 to 80 KB.

Check it as you go (thumbnails and review sheet below). `Model.triangleCount()` is printed by the build.

## 2. Moving parts and screens (named parts)

A design with something that moves gets it as a NAMED PART: `m.part('anim:<name>', pivot)` returns a builder with the same
primitives (`box rod slab lathe cylY cyl poly hexa`). You write its geometry in the same model coordinates as the body (a closed
part sits exactly where it would as part of the body); the build stores it as a child node named exactly `anim:<name>` whose
origin is the pivot. The game keeps every `anim:*` node as its own group automatically (no list to edit).

```js
const door = m.part('anim:door', [0, 0, D + 0.025]);   // pivot = the hinge line (left edge here), metres
door.box('metalLight', [0, 0.06, D], [W, 1.27, D + 0.05]);
door.rod('metal', [W - 0.08, 0.55, D + 0.085], [W - 0.08, 1.1, D + 0.085], 0.028);  // handle belongs to the door

const drawer = m.part('anim:drawer1', [W / 2, 0.9, D]);  // any point works as pivot for a sliding part
const cavity = m.part('anim:interior');                  // static: shown only while something is open
const glass = m.part('anim:screen');                     // static: the picture rectangle (see below)
```

Rules: names are `anim:` plus letters, digits, `_` or `-` (`anim:door`, `anim:drawer2`); parts do not nest; every part needs
geometry; part triangles count towards the 3000. Keep every part inside the model's closed bounds (a swinging door is fine: only
the closed position counts). A hinged door's pivot is on its hinge line; for a door hinged at its left edge that is `x = left
edge`, and a negative angle about `y` swings it out to +z (a right-hinged door: pivot at the right edge, positive angle).
Parts you want to see inside a hollow body (fridge cavity, cabinet interior) go in `anim:interior`; the body must be open
there, with the door or drawer fronts closing it.

Screens: build `anim:screen` as a thin slab (1 to 3 mm) exactly on the glass; the build measures its largest front-facing face
(centre, normal, width, height, tilt included) and writes it into `<group>.models.ts` and the manifest. A design with
`screen: true` then gets its picture quad (off, on, desktop, code, game, TV pictures) with no hand measurement. Use a material
the finish regions do not list for the glass.

### Declaring the animation in content

The `anim` field of the design (see `ObjectAnimSpec` in `src/content/types.ts`):

```ts
anim: {
  kind: 'fridge',                       // which trigger drives it, see below
  parts: [
    { node: 'anim:door', role: 'door', axis: 'y', angle: -1.75 },     // hinged: axis through the node origin, radians
    { node: 'anim:interior', role: 'interior' },                      // static, visible while something is open
  ],
},
// sliding drawers, opened while the chest is used
anim: { kind: 'openWhileUsed', on: ['changeOutfit', 'editOutfits'], parts: [
  { node: 'anim:drawer1', role: 'drawer', slide: [0, 0, 0.3] },       // metres in the fitted space, +z is the front
  { node: 'anim:drawer2', role: 'drawer2', slide: [0, 0, 0.3] },
] },
```

- `role` is a group switch: `door`, `door2`, `lid`, `oven`, `drawer`, `drawer2` (all parts with the same role move together; use
  `drawer` and `drawer2` for two groups); `interior` and `screen` are static.
- A part is either hinged (`axis` + `angle`) or sliding (`slide`), or both. Optional `openMinutes` / `closeMinutes` (default 0.4).
- Keep `model.yaw` 0 (the default of `fit()`): axes are in model space.
- `kind` picks the existing trigger, so the animation follows what the sim already does: `fridge` (opens while reaching in,
  the `openFridge` anim and `cookMeal` stage 0; freezer drawers open with it), `wardrobe` (`changeOutfit`, `editOutfits`),
  `oven` (hob rings, steam, bake door), `toilet` (lid during `useToilet`), `microwave` and `laundry` (door while used),
  `dishwasher`, `shower`, `bath`, `sink` (effects only), and the generic `openWhileUsed`: every door, lid and drawer is open
  during ANY interaction on the object, or only the ids in `on`. Use `openWhileUsed` for cabinets, chests, drawers, lidded boxes.
- Optional code-built cavity without a node: `interior: 'fridge' | 'oven' | 'wardrobe' | 'dishwasher' | 'washer'` (+ `interiorBox`).
  Prefer your own `anim:interior`.
- The table in `src/render/objectAnim.ts` wins for the old designs; yours never needs it.
- An animated design needs its `use` slot on +z (`useFront`), and its interactions must be ones the sim runs on it
  (`grabSnack`/`cookMeal` for fridges, `changeOutfit`/`editOutfits` for wardrobes and chests). The orientation test checks
  that the hinge or slide is on the use side and that the part moves towards the person.

For a screen design: `screen: true`, tags `'tv'` or `'computer'`, and the interactions that put a picture up (`watchTv`,
`playComputerGames`, `practiceProgramming`, `writePaper`, ...). Nothing else.

## 3. Registering the design

Your content file default-exports `build(k: ObjectKit): ObjectDef[]`; `k` has the helpers of `objects.ts` (nothing to import).
Read the header of `src/content/objects.ts` (slot, approach-tile and finish conventions) and copy the closest existing design.

```ts
export default function build(k: ObjectKit): ObjectDef[] {
  const { fit, obj, useFront, woodR, metalR, r3, FP11, WALL_GAP, dollars } = k;
  const chest = fit('chestOfDrawers', FP11, 2, { back: WALL_GAP });   // asset, footprint, scale, options
  return [
    obj(chest, {
      id: 'chest-of-drawers', name: 'Four-Drawer Chest', category: 'storage', subcategory: 'dresser', rooms: ['bedroom'], style: 'classic',
      description: 'One or two sentences a player reads in the catalog.',
      tags: ['dresser', 'storage', 'clothes', 'surface'], tier: 'standard', price: dollars(390), quality: 3, functional: true,
      footprint: FP11, layer: 'floor', blocksMovement: true, surfaceHeight: r3(chest.box.y1), slots: [useFront('use', 0.5, chest, 1)],
      interactions: ['changeOutfit', 'editOutfits'], finishes: [woodR(['wood', 'woodDark']), metalR(['metal'])],
      anim: { /* see section 2 */ },
    }),
  ];
}
```

- `fit(asset, footprint, scale, { yaw?, back?, lift? })` reads the model bounds from the generated `<group>.models.ts` (never type
  bounds by hand). Scale 2 for models authored in real metres. `back: WALL_GAP` for wall-hugging pieces (fridges, shelves,
  wardrobes, chests), `lift` for wall-mounted. Footprints: `FP11 FP21 FP12 FP22` (whole tiles; the model must fit inside).
- `obj(fit, {...})` fills `packs: ['everyday-essentials']`, `status: 'ready'`, empty slots, interactions and finishes. Set
  `packs` from `src/content/packs.ts` ids (`modern-minimal cozy-cottage mid-century classic-townhouse industrial-loft
  coastal-home art-deco botanical-living kids-storybook creative-studio garden-patio`).
- `category`: `seating beds tables storage kitchen bathroom lighting electronics hobby decor outdoor kids`; `rooms`: `kitchen
  living bedroom bathroom dining study kids outdoor`; `layer`: `floor` (blocks walking), `surface` (sits on a table, counter or
  desk: no blocking, `blocksMovement: false`), `rug`, `wall` (`needsWall: true`, `lift`), `ceiling`.
- Price tiers: `budget` $1 to $540 (most under $150), `standard` $130 to $1100, `premium` $460 to $1850, `luxury` $1450 and up.
  Price against the closest existing design of the same kind; `quality` 1 to 5 goes with the tier.
- Slots: `useFront` for a standing use spot in front; `sit(id, pos, height, approach, facing)` and `sleep(...)` for seats and
  beds (approach tiles in front of armchairs and sofas, behind dining chairs, beside beds); see the examples in `objects.ts`.
  A functional object needs interactions, a slot or a surface (`surfaceHeight` for tables, counters and desks).
- Tags give capabilities without extra work: `cleanable` (gets dirty, offers Clean), `appliance` / `plumbing` / `electronics`
  (wear out, break, offer Repair), `sink`, `dishes`, plus the type tags other content looks for (`fridge`, `tv`, `computer`, `bed`,
  `wardrobe`, `bookcase`...). Copy them from the nearest design.
- Finishes: regions recolour the materials they list (`woodR`, `fabricR`, `metalR`, `applianceR`, `darkMetalR`, `counterR`,
  or `region(id, label, materials, swatches)`); swatch 0 must reproduce the model colour. Every material a region names must
  exist in the model. Decorative-only pieces: `functional: false`, no interactions.
- Ids are kebab-case and unique across the whole game (a duplicate throws at start-up). Do not reuse a model asset for a second design.

## 4. Building

Build only your group (writes your GLBs, thumbnails, manifest entries and `<group>.models.ts`; nothing else):

```
node tools/build-extra-furniture.mjs --only=tables-storage
```

Run it whenever a model changes, before the content checks: `fit()` and the validator read the generated bounds. The full
`node tools/build-extra-furniture.mjs` (no `--only`) rebuilds all groups; the lead runs it after merging. A duplicate model name
(across groups, or with a Kenney model) throws.

Review sheet: every model of your group from two sides, with triangle counts and part names, one PNG.

```
node tools/furniture-extra/contact-sheet.mjs --only=tables-storage            # tests/e2e/out/furniture-sheets/tables-storage.png
node tools/furniture-extra/contact-sheet.mjs --names=chestOfDrawers --px=400 --out=/tmp/x.png
```

Look at it before you commit a batch: proportions against the nearest Kenney piece, front on +z, nothing floating, nothing
poking out of the footprint, parts where you expect them. Animated designs: also look at them in the game
(`node dev/ds-tasks/m10f/shoot-exemplars.mjs` shows how to place a design in the starter house, trigger its interaction and
take a screenshot; it takes the browser lock itself, never wrap it in flock).

## 5. Checks before every commit

```
node tools/build-extra-furniture.mjs --only=<group>
npm run typecheck
npx vitest run                 # slow tests: add --no-file-parallelism if timeouts appear under load
npm run content:check          # 0 errors (warnings about your designs are yours to fix)
npm run build
```

Tests that matter to you: `tests/unit/tools/furnitureKit.test.ts` (triangle budget, parts), `tests/unit/content/content.test.ts`
(model fits its footprint, bounds equal the manifest, one model per design), `tests/unit/content/animValidation.test.ts`,
`tests/unit/render/objectAnim.test.ts` and `objectAnimOrientation.test.ts` (parts exist, hinge or slide on the use side),
`tests/unit/content/screens.test.ts`. Commit your group's files together with the generated `*.models.ts`, GLBs, thumbnails and
manifest changes. Never print or commit API keys.
