# MPFB body prototype

Prototype, not used by the game: MakeHuman bodies made with MPFB (MakeHuman plugin for Blender), bound to the game's 65-joint
UAL skeleton, to compare with the Meshy bodies. `npm run assets:mpfb` runs everything; `dev/mpfb.html` shows the result.

| File | What |
|---|---|
| `build_body.py` | Blender script: human, game_engine rig weights, assets, morph deltas, retarget onto the UAL joints -> `dev/mpfb/out/mpfb_{f,m}.json/.bin` |
| `export_gameengine.py` | Route (a) reference: plain MPFB export with the game_engine rig (`mpfb_{f,m}_gameengine.glb`) |
| `mpfb_common.py` | enabling MPFB in a `--factory-startup` session, dynamic imports |
| `../build-mpfb-bodies.mts` | Node step: simplification (meshoptimizer), textures (sharp), GLB on the body GLB's skeleton, size report |
| `../../dev/mpfb.html`, `dev/mpfb.ts`, `dev/mpfb/shoot.mjs` | side-by-side viewer (Meshy vs MPFB, same light, idle/walk, morph slider) and its screenshot script |

## Install (once, outside the repo)

```sh
# Blender 4.5 LTS (headless; libxi6 libxkbcommon0 libsm6 libgl1 libxrender1 libxfixes3 were already present)
curl -O https://download.blender.org/release/Blender4.5/blender-4.5.15-linux-x64.tar.xz   # sha256 0d2b8bb2...771e4773e
tar xf blender-4.5.15-linux-x64.tar.xz && mv blender-4.5.15-linux-x64 /opt/blender

# MPFB 2.0.18 as a Blender extension, user resources kept in /opt/mpfb/res
git clone --depth 1 https://github.com/makehumancommunity/mpfb2 /opt/mpfb2-src     # commit 6ff1eb3
(cd /opt/mpfb2-src/src/mpfb && zip -qr /opt/mpfb/mpfb-2.0.18.zip . -x '*/__pycache__/*')
BLENDER_USER_RESOURCES=/opt/mpfb/res /opt/blender/blender -b --factory-startup --command extension install-file -r user_default --enable /opt/mpfb/mpfb-2.0.18.zip

# MakeHuman asset packs, unzipped into MPFB's user data dir
D=/opt/mpfb/res/extensions/.user/user_default/mpfb/data
for p in makehuman_system_assets/makehuman_system_assets_cc0 eyebrows01/eyebrows01_cc0 eyelashes01/eyelashes01_cc0 \
         underwear01/underwear01_cc0 underwear03/underwear03_cc-by skins01/skins01_cc0; do
  curl -sS -O https://files.makehumancommunity.org/asset_packs/$p.zip && unzip -q -o $(basename $p).zip -d $D
done
```

Environment of the build: `BLENDER` (default `/opt/blender/blender`), `BLENDER_USER_RESOURCES` (default `/opt/mpfb/res`).
`node --experimental-strip-types tools/build-mpfb-bodies.mts --skip-blender` re-runs only the Node step.

## Licences of what ends up in the GLBs

The MPFB add-on code is GPL-3 but the output is explicitly yours (LICENSE.md section D of MPFB); its bundled data (base mesh,
targets, rigs, weights, textures) and the system assets are CC0. The per-asset licence is read from the pack JSONs and stored in
the extras of the GLB node (`mpfbBody.licenses`):

| Used | Licence | Author |
|---|---|---|
| base mesh, macro and detail targets, game_engine rig and weights | CC0 | MakeHuman team |
| eyes `low-poly`, texture `brownlight_eye.png` | CC0 | makehuman_system |
| eyebrows `eyebrow001`, eyelashes `eyelashes01` | CC0 | makehuman_system |
| skin texture `bobby_03_young_female_hairless` | CC0 | bobby_03 |
| female underwear `wolgade_female_panties_01`, `wolgade_female_top_01` | CC0 | wolgade |
| male underwear `elvs_swimwear_micro_shorts` | **CC-BY** | Elvaerwyn (credit required) |
