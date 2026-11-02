# Milestones 8 and 9: shared plan

Four agents work in the same working tree at the same time:

| Agent | Scope |
|---|---|
| **M8-sim** | Family and life stages |
| **M8-bodies** | Child, teen and elder bodies |
| **M9-core** | Floors, stairs, navigation and rendering across levels |
| **M9-ext** | Roofs, fences, gates, gardens and staircase designs |

Read `docs/DESIGN_BRIEF.md` sections 7, 11 and 26, `docs/ARCHITECTURE.md` and `docs/CONTINUATION.md` first.

## Rules for everyone

- **Work in the shared tree.** Do not commit or run any git command that changes state; the main session commits.
- **Write only the files you own** (see the ownership table).
  - Edits to a shared file must be small and additive. Re-read the file right before each edit, because it changes under you.
  - Never reformat or reorder code you do not own.
- **Contracts are already in the tree.** Build against them; do not change their shape. Extending them with new optional fields is allowed if you note it in your report.
  - `src/core/types.ts` has `SimSettings.aging` (now with 'custom'), `agingDays`, `elderEndOfLife`, `Lot.fences`, `Lot.roofs`, `Lot.terrain`, `Fence`, `Roof`, `Person.stageDays`, `parentIds`, `school` and `SchoolState`.
  - `src/world/fences.ts` has `fenceEdgeState`.
- **Saves stay at SCHEMA_VERSION 1.** New fields are optional. Add fill defaults in `src/persistence/schema.ts` and checks in `src/persistence/structure.ts`, following the existing fill functions. Old saves must load.
- **Money only via `transact()`**, with once-only occurrence ids.
- **Determinism:** use only the seeded RNG in sim code.
- **Browser runs share `/tmp/hearthside-browser.lock`.**
  - Wrap your own Playwright scripts in `flock /tmp/hearthside-browser.lock ...`.
  - Never wrap `tests/e2e/*.mjs`; they take the lock themselves. Wrapping them deadlocks.
  - Other agents need the browser too, so keep runs short.
- **Typecheck can break briefly** while another agent is mid-edit.
  - If an error is in a file you do not own, wait a few minutes and retry rather than "fixing" it.
  - At the end, `npm run typecheck` and `npm test` must be clean for your files.
- **Done means:**
  - typecheck clean;
  - your unit tests added and green;
  - `npm run build` ok;
  - the e2e/acceptance step you own passes in portrait 390x844, landscape 844x390 and desktop 1280x720;
  - screenshots of your feature.
- **Logs** go in `dev/ds-tasks/logs/<agent>-*.log`, which is gitignored.
- **Report back** with: files changed, check results, design choices, known gaps.

## Ownership

| Area | Owner |
|---|---|
| `src/sim/*` (except the level-crossing movement in M9-core's row) | M8-sim; M9-ext owns the new `src/sim/garden.ts` |
| `src/content/*` (except the exterior files below) | M8-sim |
| `src/core/relations.ts` | M8-sim |
| `src/game/*` | M8-sim |
| `src/persistence/*` | M8-sim; M9 agents add their fill/check functions in clearly marked blocks |
| `src/ui/*` (except `src/ui/build/*`) | M8-sim |
| `src/characters/creator.ts`, `src/characters/names.ts` | M8-sim |
| `src/characters/*` (everything else) | M8-bodies |
| `src/render/peopleView.ts` | M8-bodies; M9-core may add level filtering and y offset |
| `tools/mpfb/*`, `tools/build-mpfb-bodies.mts`, `public/assets/characters/*`, `dev/mpfb*`, `dev/characters.ts` | M8-bodies |
| `src/world/{nav,navgrid,lotCheck,rooms,structure,lots,placement}.ts` | M9-core |
| `src/building/*` | M9-core |
| `src/render/{lotView,gameView,cameraRig,objectsView}.ts` | M9-core |
| `src/ui/build/*` | M9-core; M9-ext adds its tools in new files under `src/ui/build/exterior*` plus one small registration hook |
| `src/world/{fences,roofs,terrain}.ts` | M9-ext |
| `src/render/{roofView,fenceView,terrainView}.ts`, `src/render/environment.ts` | M9-ext |
| `src/content/exterior.ts` | M9-ext |
| `src/sim/garden.ts` | M9-ext |
| `tools/exterior/*` | M9-ext |
| `tests/e2e/acceptance.mjs` | New steps only. M8-sim adds `stepFamily` (step 10); M9-core adds `stepFloors` (step 11) and M9-ext extends it at its end. |

## M8 design (life stages)

**Life stages:** baby, toddler, child, teen, youngAdult, adult, elder.

**Aging**
- `SimSettings.aging` is off, long, normal or custom.
- Normal stage lengths in game days:

  | Stage | Days |
  |---|---|
  | baby | 3 |
  | toddler | 5 |
  | child | 10 |
  | teen | 10 |
  | youngAdult | 14 |
  | adult | 20 |
  | elder | 14 |

- Long is 2.5 times normal. Custom uses `agingDays`.
- `Person.stageDays` advances in the daily rollover. On a birthday the person moves to the next stage, with a once-only occurrence `birthday:<pid>:<stage>`. A birthday:
  - emits an event, adds a memory and a moodlet, and shows a notification;
  - migrates the person: outfits allowed for the new stage, skills, a career (teens may have none or a part-time job if one exists) and school.
- Elders at the end of their stage pass away peacefully only if `elderEndOfLife` is on. That adds a memory to family members and removes the person cleanly. The default is off, and then elders stay elders.
- An "Age up now" birthday interaction with a cake (on a table or counter, a celebration with moodlets) lets the player trigger it early.
- Existing saves and adults default to `stageDays` 0.

**Family graph**
- `Person.parentIds`. Siblings, grandparents, aunts and uncles are derived in `src/sim/family.ts`.
- The creator's household ties set parentIds.
- Keep `Bond.familyAtoB` consistent.
- In game, the family tree panel (reuse `ui/creator/familyTree.ts`) is reachable from the person panel.

**School**
- Content `school.ts`:
  - elementary: children, Monday to Friday, 08:00-14:00;
  - high: teens, Monday to Friday, 08:00-15:00.
- Schedule `school:<pid>:<day>`. Copy the careers pattern: commute lead, off-lot place 'school' (it already exists), and missing school.
- `SchoolState.performance` rises with attendance and homework and falls with misses and low mood.
- Homework is an interaction at a desk or table, or on the computer, once per school day. "Help with homework" is for an adult or teen with a child.
- A weekly report card gives a grade letter and a moodlet.
- Holidays: weekends, plus one week off after each 4 school weeks (simple rule).
- The person panel's Career tab becomes Career/School.
- School should not crash in towns: NPC children use the light schedule.

**Dependent care**
- Babies stay in a crib or bassinet and are carried. They cannot act on their own.
- Adults and teens care for babies: feed, change diaper, put to bed, cuddle and play.
- Toddlers:
  - walk with limited autonomy: toys, nap in a crib or toddler bed;
  - eat when served in a high chair or at a table by an older person;
  - have skills motor, talking and potty, plus interactions to teach talking, help with walking and potty training.
- Neglect is non-punitive. If a dependent's need sits at 0 for 3 game hours, an "emergency sitter" handles it and charges a fee with `transact`, once per occurrence `sitter:<pid>:<day>:<n>`, plus a warning notification.
- Content needs crib, bassinet, high chair, toddler bed, toy box, potty and changing table if they are missing. Some kids furniture exists already.
  - M8-sim adds the content defs.
  - Models can reuse existing kids models or simple procedural ones via the tools/furniture-extra pipeline.

**Gating**
- `InteractionDef` gets `ages?: LifeStage[]`. Absent means the default for its kind.
- Rules:
  - babies: none;
  - toddlers: toddler list only;
  - children: eat, sleep, bathroom, fun, computer, homework, social;
  - teens: everything except adult romance, career and bills, cooking hazards allowed.
- `requestReason` gives a clear reason.
- Autonomy respects the gates.
- Socials need `requires` with stage rules: no romance under youngAdult, and child socials such as "Play tag" and "Tickle" (adult to child).
- Teen-to-teen "crush" social: optional and not romance. Skip if unclear.

**Adoption**
- An "Adopt" phone or computer option for youngAdult, adult and elder when the household has fewer than 8 members.
- Choose a baby, toddler, child or teen (with sex and name), pay a fee with `adopt:<hh>:<n>` and create the person with parentIds and ties. Generated appearance comes from the parents' palette.
- Pregnancy is not in M8.

**Moving out and in**
- `GameAPI.splitPreview` / `splitHousehold(personIds, target)`:
  - the target is a vacant lot (rent or buy, as for M7 moves), or "move in with" an existing NPC household;
  - funds are shared proportionally;
  - the occurrence ids are once-only;
  - the moved people become NPCs of the new household, or the player can switch to it.
- "Ask to move in" social at high friendship or romance brings an NPC (youngAdult and up, or with dependents) into the household, up to 8 members.
- At least one youngAdult or older must remain.

**Creator**
- `CREATOR_LIFE_STAGES` covers all seven stages, but only those whose bodies M8-bodies has delivered. Check `characters/assets` exports `stageBodyAvailable(stage)`, or coordinate through a constant.
- Validation:
  - a household needs at least one youngAdult or older;
  - a baby or toddler needs a parent or guardian in the household;
  - parents must be older stages than their children.

**UI**
- The person panel shows the stage, the days left until the next birthday (when aging is on), school and family.
- The pause menu or world settings have aging (off, long, normal, custom with per-stage days) and the elder end of life toggle.
- Notifications cover birthdays and report cards.
- Everything must fit phone portrait, landscape and desktop.

## M8 bodies

**Body set**
- Build MPFB GLBs per stage and sex using MakeHuman's age macro, in the same format 2 as `mpfb_{f,m}.glb`:
  - baby (one unisex body);
  - toddler f/m;
  - child f/m;
  - teen f/m;
  - elder f/m.
- youngAdult reuses the adult GLB with a younger face. That can be a face morph combination, or a separate `ya` build if cheap.
- Stage GLBs are loaded lazily the first time a person of that stage is shown.
- Budget: about 0.9 MB each or less.

**Rig and clips**
- The UAL skeleton and joint order stay the same; bone positions are fitted to the stage body.
- The existing clips must play on every stage. Rotation tracks transfer. Scale or strip translation tracks so children are not stretched to adult bone lengths.
- Babies are not walking characters. They need a lying-in-crib pose and a "held" pose attached to the carrier's arms.
- Adults carrying a baby need an arm-override carry pose.
- Elders get a slight stoop.

**Fitting**
- `CharacterView.setAppearance` takes the person's life stage. It is already on Person; thread it through `peopleView`.
- Hair, garments and accessories must fit every stage through the existing morph or skin transfer.
- Posture anchors per stage: seated on adult chairs, lying in beds and cribs.
- `headTop` per stage.

**Export for the creator and sim:** export `stageBodyAvailable(stage): boolean` and `STAGE_HEIGHTS` (metres, for UI and camera).

**Classic and detailed styles:** if a stage has no body for them, scale the adult rig uniformly as a fallback (documented as approximate). MPFB is the default style.

**Screenshots:** every stage and sex, dressed and undressed, sitting, walking, held baby and crib baby.

## M9 design (floors and exteriors)

**Levels**
- Levels are 0, 1 and 2; `lot.levels` is at most 3. `LEVEL_HEIGHT` = 3.0 m.
- Walls on levels 1 and up use the standard 2.8 m preset (or 3.6 for level 0 only if the upper level rests on it; keep it simple: an upper level sits at the sum of standard heights, so lower walls must be 2.8 m under an upper floor).
- Floor tiles on level L (L at least 1) need support: a wall edge of level L-1 on the tile boundary, or a floored indoor tile below.
- A balcony is an upper floor tile with no room below. It must be within 2 tiles of a supported tile and have a railing (a fence on level L) on its open edges. The railing is a warning, not a block.
- Walls on level L (L at least 1) need floor on at least one side.

**Stairs**
- An ObjectDef with `stair: { length: 3 | 4, kind: 'straight' | 'spiral' }`, placed on level L, connects its bottom tile on L to its top landing tile on L+1.
- It cuts a hole in the floor of L+1 above its footprint, removing floor tiles there, with refund via undo.
- Nav: one graph across levels. `findPath` returns per-node levels.
- Stair traversal: walking moves y smoothly, the speed is slower, and people do not stop on a stair.
- A person's `location.level` updates at the top or bottom.
- `lotCheck` must check every level: each level's floored area reachable from the entry via stairs.

**Rendering and camera**
- Each level is drawn at y = level × LEVEL_HEIGHT.
- The HUD has an "active level" selector (▲ ▼ with a "Floor 1/2/3" label) in Build, Buy and Live.
  - Levels above the active one are hidden, along with their roofs.
  - Lower levels are drawn fully.
  - Cutaway applies to the active level.
- The camera ground plane follows the active level. Picking uses the active level.
- People on hidden levels are not drawn. Following the selected person switches the active level.
- Upper-level floors are drawn as slabs with an underside visible as a ceiling from below.

**Build tools on levels**
- All existing tools work on the active level, with undo/redo and safety rules.
- A new Stairs category: place, rotate, delete via Buy, or as a Build tab "Stairs".

**Starter content**
- One existing neighbourhood house variant becomes two-storey, so a fresh game has a lot with stairs. Choose a vacant home, not the starter, to keep acceptance stable, or add a new lot variant.

## M9 exterior

**Roofs**
- `lot.roofs`. Build tab "Roof":
  - drag a rectangle;
  - choose style, pitch and finish;
  - "Auto roof" covers the top-level rooms.
- 12 styles, all generated procedurally in `roofView` with eaves overhang, gables closed by wall-material triangles, and UVs for finishes: gable, hip, flat, shed, mansard, gambrel, pyramid, dutch-gable, saltbox, butterfly, clerestory, a-frame.
- 8 or more roof finishes: shingle colours, tile, metal, slate, thatch-like.
- Prices; undo.
- Roofs are hidden when the cutaway is on or the active level is below them, with a "Roof" toggle in the camera bar.

**Fences and gates**
- `lot.fences`, an edge-based layer on any level.
- Fences do not make rooms, and they block movement; gates are passable.
- They serve as balcony railings on upper levels.
- Build tab "Fence": drag a run like walls, and a gate chip replaces one edge.
- 24 fence designs and 12 gate designs, procedural or low-poly GLB via `tools/exterior`, with colour variants: picket, rail, lattice, wrought iron, glass panel, hedge, stone wall, wattle, chain-link, ranch, slatted, rope-post, and more.
- Prices; undo; safety (no sealing people in; a gate counts as passage).
- Nav reads `fenceEdgeState` (M9-core wires that call in `navgrid.ts`; M9-ext must not edit `navgrid.ts`).

**Garden**
- Terrain paint tool on level 0 outdoors: grass, dirt, paving, gravel, sand, mulch, flowerbed soil, stepping stones, and more; at least 8, with `lot.terrain`.
- Garden objects in content `exterior.ts` (outdoor category), 12 or more: flower beds, hedges, vegetable patch, fruit tree, herb planter, pond, bird bath, trellis, hanging plants, and more.
- Gardening (`src/sim/garden.ts`), with M8-sim's agreement on the InteractionDef shape:
  - water, weed and plant;
  - harvest from the vegetable patch, fruit tree and herb planter gives ingredients or produce sold through `transact`;
  - plant growth runs on game days and is deterministic;
  - uses the existing gardening or "nature" skill if one exists, otherwise adds `gardening`.
- If the interaction plumbing collides with M8-sim's work, keep it in `garden.ts` plus content and wire through the existing behaviour registry.

**Staircase designs**
- 12 staircases: about 8 straight and 4 spiral, in different materials and railings. They are ObjectDefs with the `stair` field; M9-core owns that field's semantics.
- Models can be procedural meshes built at runtime, or GLBs from `tools/exterior`.
- M9-core implements placement and nav; M9-ext supplies the 12 designs and visuals. M9-core ships one basic straight stair early so it is not blocked.
