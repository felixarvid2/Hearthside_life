# AI hairstyles: sources

Generated with fal.ai on 2026-11-01 (see `LEDGER.md` for every paid call and its estimated cost; the pipeline stops at 3 USD).
The in-game files are `public/assets/characters/hair/<id>.glb`; `npm run hair:ai` (`tools/build-ai-hair.mts`) builds them and the
pipeline is described in `docs/ASSET_GUIDE.md` (Characters, "AI hairstyles").

| Folder | Content |
|---|---|
| `raw/<id>.jpg` | FLUX image of the style on a bald grey mannequin head (the registration reference) |
| `raw/<id>.json` | Model, seed and prompt of the image, TRELLIS seed and file size |
| `raw/<id>.glb` | TRELLIS output (about 15-40k triangles, 1024 px albedo, mannequin included), cached so rebuilding costs nothing |
| `debug/<id>_fit.png` | Front / side / top plot of the registration: grey mannequin, red hair, blue parametric head surface, green kept triangles |
| `shots/lab/` | Screenshots of the hairstyles in the character lab (`node dev/meshy/shootLab.mjs --plan=hair --hairs=ai`) |
| `sheets/` | Contact sheets of the raw images |
| `BUILD.txt` | Triangle counts and fit cost of the last full build |

Redo one style: `npm run hair:ai -- images <id> --seed=N [--dev]` (new image), `models <id> --force` (new 3D model), `build <id> --debug`,
then `content` to rewrite the style entries in `src/content/character.ts`.
