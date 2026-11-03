#!/usr/bin/env node
// Reproducible asset pipeline for Hearthside Life.
//
// Source packs (all CC0) live in the shared asset library of felixarvid2/test (`assets/`).
// Point ASSET_LIBRARY at that folder (default: ../test/assets next to this repo).
//
// Outputs (committed, so a fresh clone runs without the library):
//   public/assets/characters/body_a.glb, body_b.glb   one skinned mesh each, shared 65-joint skeleton
//   public/assets/characters/meshy_a.glb, meshy_b.glb  the detailed (Meshy) bodies, built by `npm run assets:meshy`
//                                                      (tools/build-meshy-bodies.mts); only listed in the manifest here
//   public/assets/characters/anims_1.glb, anims_2.glb  selected animation clips, no mesh
//   public/assets/furniture/<model>.glb                Kenney Furniture Kit models, plus the original models of tools/furniture-extra
//   public/assets/furniture/thumbs/<model>.png         Kenney isometric renders used as catalog thumbnails
//   public/assets/audio/<id>.ogg                       Kenney UI sounds and jingles
//   public/assets/manifest.json                        bounds, materials, sources and licenses
//
// `node tools/build-assets.mjs --only-audio` refreshes only the sounds.
//
// Usage: node tools/build-assets.mjs

import { NodeIO } from '@gltf-transform/core';
import { prune, resample, dedup, weld, simplify, joinPrimitives, getBounds } from '@gltf-transform/functions';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { buildExtraFurniture } from './furniture-extra/index.mjs';
import { buildExterior } from './exterior/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.resolve(process.env.ASSET_LIBRARY ?? path.join(ROOT, '..', 'test', 'assets'));
const OUT = path.join(ROOT, 'public', 'assets');
const M3D = path.join(LIB, '3d-models');

const UAL1 = path.join(M3D, 'Universal Animation Library[Standard]', 'Universal Animation Library[Standard]', 'Unreal-Godot', 'UAL1_Standard.glb');
const UAL2 = path.join(M3D, 'Universal Animation Library 2[Standard]', 'Universal Animation Library 2[Standard]', 'Unreal-Godot', 'UAL2_Standard.glb');
const MANNEQUIN_F = path.join(M3D, 'Universal Animation Library 2[Standard]', 'Universal Animation Library 2[Standard]', 'Female Mannequin', 'Unreal-Godot', 'Mannequin_F.glb');
const FURNITURE = path.join(M3D, 'furniture-kit', 'Models', 'GLTF format');
const FURNITURE_THUMBS = path.join(M3D, 'furniture-kit', 'Isometric');
const AUDIO = path.join(LIB, 'audio');

// UI sounds and short jingles (Kenney, CC0). Game id -> source file under the asset library's audio/.
const SOUNDS = {
  click: 'interface-sounds/Audio/click_002.ogg',
  tap: 'interface-sounds/Audio/tick_002.ogg',
  open: 'interface-sounds/Audio/open_001.ogg',
  close: 'interface-sounds/Audio/close_001.ogg',
  confirm: 'interface-sounds/Audio/confirmation_001.ogg',
  error: 'interface-sounds/Audio/error_004.ogg',
  place: 'interface-sounds/Audio/drop_002.ogg',
  sell: 'interface-sounds/Audio/pluck_002.ogg',
  paint: 'interface-sounds/Audio/scratch_002.ogg',
  select: 'interface-sounds/Audio/select_002.ogg',
  toggle: 'interface-sounds/Audio/toggle_002.ogg',
  money: 'interface-sounds/Audio/glass_002.ogg',
  notify: 'interface-sounds/Audio/bong_001.ogg',
  promotion: 'music-jingles/Audio/Pizzicato jingles/jingles_PIZZI04.ogg',
  levelUp: 'music-jingles/Audio/Pizzicato jingles/jingles_PIZZI01.ogg',
  social: 'music-jingles/Audio/Pizzicato jingles/jingles_PIZZI10.ogg',
  newDay: 'music-jingles/Audio/Pizzicato jingles/jingles_PIZZI07.ogg',
};

/** Copies the UI sounds to public/assets/audio and returns manifest entries. */
function copyAudio() {
  const outDir = path.join(OUT, 'audio');
  fs.mkdirSync(outDir, { recursive: true });
  const entries = {};
  for (const [id, rel] of Object.entries(SOUNDS)) {
    const src = need(path.join(AUDIO, rel));
    fs.copyFileSync(src, path.join(outDir, `${id}.ogg`));
    entries[id] = { file: `audio/${id}.ogg`, source: rel };
  }
  return entries;
}

// Clips kept from each library. Names are the source names; the runtime maps them to game animation ids.
const CLIPS_1 = [
  'Idle_Loop', 'Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop', 'Sitting_Enter', 'Sitting_Exit', 'Sitting_Idle_Loop',
  'Sitting_Talking_Loop', 'Idle_Talking_Loop', 'Interact', 'PickUp_Table', 'Fixing_Kneeling', 'Dance_Loop',
  'Crouch_Idle_Loop', 'Swim_Idle_Loop', 'Swim_Fwd_Loop', 'Push_Loop',
];
const CLIPS_2 = [
  'Consume', 'Farm_Harvest', 'Farm_PlantSeed', 'Farm_Watering', 'Idle_FoldArms_Loop', 'Idle_No_Loop',
  'Idle_TalkingPhone_Loop', 'LayToIdle', 'Yes', 'Walk_Carry_Loop', 'Chest_Open',
];

// Structural pieces of the kit are not used: walls, floors, doorways and stairs are built by the game.
const FURNITURE_SKIP = new Set([
  'wall', 'wallCorner', 'wallCornerRond', 'wallDoorway', 'wallDoorwayWide', 'wallHalf', 'wallWindow', 'wallWindowSlide',
  'floorCorner', 'floorCornerRound', 'floorFull', 'floorHalf', 'doorway', 'doorwayFront', 'doorwayOpen',
  'stairs', 'stairsCorner', 'stairsOpen', 'stairsOpenSingle', 'paneling',
]);

function disposeAnimations(root, shouldDispose) {
  for (const anim of [...root.listAnimations()]) {
    if (!shouldDispose(anim)) continue;
    for (const ch of [...anim.listChannels()]) ch.dispose();
    for (const s of [...anim.listSamplers()]) s.dispose();
    anim.dispose();
  }
}

function need(p) {
  if (!fs.existsSync(p)) {
    console.error(`Missing source: ${p}\nSet ASSET_LIBRARY to the felixarvid2/test assets folder.`);
    process.exit(1);
  }
  return p;
}

async function main() {
  if (process.argv.includes('--only-audio')) {
    const entries = copyAudio();
    console.log(`audio: ${Object.keys(entries).length} sounds`);
    return;
  }
  await MeshoptSimplifier.ready;
  const io = new NodeIO();
  fs.mkdirSync(path.join(OUT, 'characters'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'furniture', 'thumbs'), { recursive: true });

  const manifest = {
    generatedBy: 'tools/build-assets.mjs',
    sources: {
      characters: 'Quaternius Universal Animation Library 1 and 2 (Standard), CC0 1.0, https://quaternius.com',
      detailedCharacters: 'meshy_a / meshy_b: AI-generated with Meshy (https://www.meshy.ai), 2026-11-01; see dev/meshy/README.md',
      furniture: 'Kenney Furniture Kit 2.0, CC0 1.0, https://kenney.nl',
    },
    characters: {},
    animations: {},
    furniture: {},
  };

  // ---- Character bodies: one primitive, one material, no animations.
  for (const [id, src, ratio] of [['body_a', need(UAL1), 1], ['body_b', need(MANNEQUIN_F), 1]]) {
    const doc = await io.read(src);
    const root = doc.getRoot();
    disposeAnimations(root, () => true);
    const mesh = root.listMeshes()[0];
    const prims = mesh.listPrimitives();
    const mat = root.listMaterials()[0];
    mat.setName('Skin');
    mat.setBaseColorFactor([0.86, 0.68, 0.56, 1]);
    for (const p of prims) {
      // The game shades bodies procedurally (skin tone + bind-pose-space details), so UVs and the
      // source's hard-edged normals are dropped; smooth normals are rebuilt at runtime (computeVertexNormals).
      p.setAttribute('TEXCOORD_1', null);
      p.setAttribute('TEXCOORD_0', null);
      p.setAttribute('NORMAL', null);
      p.setMaterial(mat);
    }
    if (prims.length > 1) {
      const joined = joinPrimitives(prims);
      for (const p of prims) { mesh.removePrimitive(p); p.dispose(); }
      mesh.addPrimitive(joined);
    }
    await doc.transform(weld(), ...(ratio < 1 ? [simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.004, lockBorder: false })] : []), dedup(), prune());
    const out = path.join(OUT, 'characters', `${id}.glb`);
    await io.write(out, doc);
    const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
    manifest.characters[id] = {
      file: `characters/${id}.glb`,
      vertices: prim.getAttribute('POSITION').getCount(),
      joints: doc.getRoot().listSkins()[0].listJoints().length,
      bounds: getBounds(doc.getRoot().listScenes()[0]),
      source: path.basename(src),
    };
    console.log(`character ${id}: ${manifest.characters[id].vertices} verts`);
  }

  // ---- Detailed bodies (built by tools/build-meshy-bodies.mts from dev/meshy/): listed so the manifest stays complete.
  for (const id of ['meshy_a', 'meshy_b']) {
    const file = path.join(OUT, 'characters', `${id}.glb`);
    if (!fs.existsSync(file)) { console.log(`character ${id}: not built yet (npm run assets:meshy)`); continue; }
    const doc = await new NodeIO().registerExtensions([EXTTextureWebP]).read(file);
    const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
    manifest.characters[id] = {
      file: `characters/${id}.glb`,
      vertices: prim.getAttribute('POSITION').getCount(),
      triangles: prim.getIndices().getCount() / 3,
      joints: doc.getRoot().listSkins()[0].listJoints().length,
      textures: doc.getRoot().listTextures().map((t) => ({ name: t.getName(), size: t.getSize(), mime: t.getMimeType() })),
      bytes: fs.statSync(file).size,
      source: id === 'meshy_a' ? 'dev/meshy/base_male_v2.glb (Meshy)' : 'dev/meshy/base_female_underwear.glb (Meshy)',
    };
    console.log(`character ${id}: ${manifest.characters[id].triangles} tris, ${(manifest.characters[id].bytes / 1024).toFixed(0)} KB`);
  }

  // ---- Animation libraries: skeleton nodes + selected clips.
  for (const [id, src, keep] of [['anims_1', need(UAL1), CLIPS_1], ['anims_2', need(UAL2), CLIPS_2]]) {
    const doc = await io.read(src);
    const root = doc.getRoot();
    const keepSet = new Set(keep);
    disposeAnimations(root, (anim) => !keepSet.has(anim.getName()));
    for (const anim of root.listAnimations()) {
      // Bones keep their bind scale and length: drop scale channels, translation channels other than the
      // pelvis/root, and finger channels (fingers stay in a relaxed bind pose at life-sim camera distance).
      for (const ch of anim.listChannels()) {
        const target = ch.getTargetNode()?.getName() ?? '';
        const pathName = ch.getTargetPath();
        const finger = /^(index|middle|pinky|ring|thumb)_/.test(target);
        const dropTranslation = pathName === 'translation' && target !== 'pelvis' && target !== 'root';
        if (pathName === 'scale' || finger || dropTranslation) {
          const s = ch.getSampler(); anim.removeChannel(ch); ch.dispose();
          if (s) { anim.removeSampler(s); s.dispose(); }
        }
      }
    }
    for (const node of root.listNodes()) { if (node.getMesh()) { node.getMesh().dispose(); node.setMesh(null); } if (node.getSkin()) node.setSkin(null); }
    for (const skin of root.listSkins()) skin.dispose();
    for (const m of root.listMaterials()) m.dispose();
    await doc.transform(resample({ tolerance: 0.0005 }), dedup(), prune({ keepLeaves: true }));
    const out = path.join(OUT, 'characters', `${id}.glb`);
    await io.write(out, doc);
    const names = doc.getRoot().listAnimations().map((a) => a.getName());
    const missing = keep.filter((n) => !names.includes(n));
    if (missing.length) throw new Error(`${id}: missing clips ${missing.join(', ')}`);
    manifest.animations[id] = { file: `characters/${id}.glb`, clips: names, bytes: fs.statSync(out).size };
    console.log(`animations ${id}: ${names.length} clips, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
  }

  // ---- Furniture: copy models, measure real bounds (node transforms included), copy a thumbnail.
  need(FURNITURE);
  for (const file of fs.readdirSync(FURNITURE).filter((f) => f.endsWith('.glb')).sort()) {
    const model = file.replace(/\.glb$/, '');
    if (FURNITURE_SKIP.has(model)) continue;
    const doc = await io.read(path.join(FURNITURE, file));
    const bounds = getBounds(doc.getRoot().listScenes()[0]);
    const materials = doc.getRoot().listMaterials().map((m) => ({ name: m.getName(), color: m.getBaseColorFactor().slice(0, 3).map((v) => +v.toFixed(3)) }));
    fs.copyFileSync(path.join(FURNITURE, file), path.join(OUT, 'furniture', file));
    let thumb = null;
    for (const dir of ['SE', 'SW', 'NE', 'NW']) {
      const t = path.join(FURNITURE_THUMBS, `${model}_${dir}.png`);
      if (fs.existsSync(t)) { fs.copyFileSync(t, path.join(OUT, 'furniture', 'thumbs', `${model}.png`)); thumb = `furniture/thumbs/${model}.png`; break; }
    }
    const r = (v) => v.map((x) => +x.toFixed(4));
    manifest.furniture[model] = { file: `furniture/${file}`, thumb, min: r(bounds.min), max: r(bounds.max), materials };
  }
  // ---- Original furniture the kit lacks (easel, piano, treadmill, dishwasher, ...): tools/furniture-extra.
  Object.assign(manifest.furniture, await buildExtraFurniture(OUT));
  // Milestone 9: garden and staircase models (tools/exterior); src/content/exteriorModels.ts comes from node tools/build-exterior.mjs.
  Object.assign(manifest.furniture, await buildExterior(OUT));
  manifest.sources.furnitureOriginal = 'Original low-poly furniture models built by tools/furniture-extra (this project, CC0)';
  console.log(`furniture: ${Object.keys(manifest.furniture).length} models`);

  manifest.audio = copyAudio();
  console.log(`audio: ${Object.keys(manifest.audio).length} sounds`);

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  fs.writeFileSync(path.join(OUT, 'LICENSES.md'), [
    '# Third-party assets', '',
    '| Folder | Source | License |', '|---|---|---|',
    '| characters/ | Quaternius - Universal Animation Library 1 & 2 (Standard), mannequins and animations | CC0 1.0 |',
    '| characters/meshy_a.glb, meshy_b.glb | Base bodies generated with Meshy (meshy.ai) on 2026-11-01, fitted and re-textured by tools/build-meshy-bodies.mts | Meshy terms of the generating account (see dev/meshy/README.md) |',
    '| furniture/ | Kenney - Furniture Kit 2.0 (models and isometric thumbnails) | CC0 1.0 |',
    '| furniture/ (dishwasher, easel, piano, treadmill, weightBench, chessTable, crib, toyChest, grill, patioSet, gardenBed, gardenBench, gardenChair) | Original low-poly models and thumbnails built by tools/furniture-extra for this project, in the kit\'s style and materials | CC0 1.0 |',
    '| furniture/ (garden* and stair* models: the Milestone 9 garden objects and staircases) | Original low-poly models and thumbnails built by tools/exterior for this project, in the same style and materials | CC0 1.0 |',
    '| audio/ | Kenney - Interface Sounds 1.0 and Music Jingles | CC0 1.0 |', '',
    'Faces, hair, clothing, wall finishes and floors are generated by the game code (original, procedural).', '',
  ].join('\n'));
  console.log('wrote public/assets/manifest.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
