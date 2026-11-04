# M10 surfaces, phase 2: content (shared rules for all nine agents)

The whole job: wall finishes 50 -> 360 and floor designs 32 -> 200, per family as in docs/DESIGN_BRIEF.md sections 14
and 15. Generated sources come from fal.ai **FLUX.2 [dev]** (`fal-ai/flux-2`). Phase 1 built the machinery; read
dev/tasks/m10-surfaces/00-infra.md and 00-progress.md (the end-to-end recipe) first, then docs/ASSET_GUIDE.md "Walls,
floors, openings", src/content/surfaces2.ts (how designs are written) and the painters in src/render/textures/.

## Group allocation (new designs to add; the target count of the family is in brackets)

| Group | Files you own | New designs |
|---|---|---|
| walls-a | walls-a.* | paint, plaster and subtle textures 24 (28); luxury fabrics, metallic, damask 17 (20); murals and feature walls 18 + the pilot mural (20) |
| walls-b | walls-b.* | stripes, checks, gingham 18 (24); geometric and contemporary 26 (32) |
| walls-c | walls-c.* | floral 28 + the pilot peony (32); botanical and nature 21 (24) |
| walls-d | walls-d.* | vintage and Art Deco 21 (24); children's and playful 22 (24); themed, rustic, coastal, eclectic 17 (20) |
| walls-e | walls-e.* | wood panels, wainscoting, beadboard 19 (24); ceramic, mosaic, decorative tiles 32 (36) |
| walls-f | walls-f.* | brick and stone 28 (32); concrete, industrial, weathered 17 (20) |
| floors-a | floors-a.* | wooden planks and boards 36 (40); parquet and decorative wood 20 (24); laminate and vinyl 18 (20) |
| floors-b | floors-b.* | ceramic, porcelain, mosaic tiles 25 (32); stone, marble, terrazzo 21 (24) |
| floors-c | floors-c.* | carpets and textiles 20 + the pilot rocket carpet (24); concrete and industrial 9 (12); exterior paving, decking, gravel, paths 18 (24) |

Family ids (SurfaceDesign.family) are the ones already used: walls paint, stripes, geometric, floral, botanical,
vintage-deco, playful, wood-panel, tile, brick-stone, concrete, luxury, mural, themed; floors wood-planks, parquet,
laminate-vinyl, tile, stone, carpet, concrete, exterior. Hit your counts exactly.

## Your files (edit nothing else)
- `src/content/surfaces3/<group>.ts` (designs), `src/render/textures/packs/<group>.ts` (any new painters you need),
  `dev/surfaces-ai/sources/<group>.mjs` (prompts), `tests/unit/surfaces/m10-<group>.test.ts` (your tests),
  `dev/tasks/m10-surfaces/<group>-progress.md` (your report). Generated outputs land in public/assets/surfaces/ and in
  the generated id file through the tools; that is expected.
- If you need a change in a shared file (painterKit, mapKit, surfaceMaps, the motif painters, the build tool), do not
  make it: write a local helper in your pack file, or describe the change in your report.
- Other agents work in the same tree at the same time. If typecheck or tests fail only in another group's files, ignore
  it and mention it in your report. Never revert or edit another group's files.

## What counts as a design (brief section 14)
A design needs a visibly distinguishable pattern layout, surface structure, panel construction, mural or material
treatment. A palette change is a variant, never a design. Two designs that differ only in scale or colour count once.
Do not duplicate any of the 82 existing designs (list them with the content DB) or another design in your group.

## Quality bar
- Look like a real, well-designed product someone would choose: proportions right at room scale (brick about
  0.215 x 0.065 m, subway tile 0.15 x 0.075 m, boards 0.09-0.25 m wide, wallpaper motif repeats 0.3-0.7 m), clean
  seamless repeats, no visible tiling of a material map (use enough tiles, random offsets per cell, or a larger repeat).
- Use the AI where it adds something: motifs (flowers, leaves, animals, ornaments, toys), material maps (wood species,
  stones, marbles, fabrics, metals, carpets, concrete, glazes), murals. Keep pure geometry procedural, but give it
  character (a subtle paper/linen ground map, hand-drawn wobble where a painter supports it).
- Joints, grout, boards, panels and skirting are always drawn by painters, never baked into a generated source. Prompt
  material sources as one continuous surface ("no joints, no seams, no tiles, no grid, no boards"), top or front view,
  even lighting. Motif prompts describe one subject only.
- Palettes: walls at least 8 per design, floors at least 6, each design covering light, dark, neutral and accent tones
  (see PaletteTone and the existing ramps). A mural or art-directed design may keep fewer with a paletteNote that
  explains why.
- Every design: unique id with a family prefix, a short evocative name, a one- or two-sentence description in the
  house style, tags (style, room, material), at least one decor pack from the existing pack ids, a sensible tier and
  price (mix everyday and premium within each family).

## Workflow
1. Plan your designs as a table in your progress file first (id, name, layout/material, source ids it needs). Reuse a
   source across designs only when the layout makes them clearly different (a marble map as slabs, herringbone and
   hexagons is fine).
2. Write prompts in sources/<group>.mjs. `node dev/surfaces-ai/generate.mjs --group <group> --dry`, then without --dry.
   Your fal budget is about 75 images (all retries included); the script also enforces the job budget.
3. `npm run assets:surfaces -- --group <group>`. Rejected motifs: rewrite the prompt with a new id or seed and retry.
4. Write the designs. `npm run visual:surfaces -- --group <group>` and Read every contact sheet. Fix what looks wrong
   (bad scale, visible tiling, muddy colours, motifs too dense or too sparse, unreadable at thumbnail size). Two rounds
   at least. Keep the final sheets in dev/tasks/m10-surfaces/sheets/.
5. Tests in tests/unit/surfaces/m10-<group>.test.ts: your counts per family, every design paints with a fake canvas and
   no images loaded, params pass checkParams, palette counts, ids unique.
6. Checks while working: `npm run typecheck`, `npx vitest run tests/unit/surfaces`, `npm run content:check` (0 errors and
   0 warnings for your designs). At the end once: `npm test`.
7. Report in <group>-progress.md: the design table, the fal images used and the cost, check results, anything you
   could not finish, shared-file changes you would like.

## Never
- Never print, log or commit the fal.ai key (/home/user/apis/Fal.ai). Never cat that file; only the scripts read it.
- No git, curl to other hosts, or deleting other people's files. SCHEMA_VERSION stays 1.
- Do not wrap tests/e2e/*.mjs or the visual tool in flock.
