#!/usr/bin/env node
// AI hairstyles (fal.ai FLUX + TRELLIS) -> public/assets/characters/hair/<id>.glb. See docs/ASSET_GUIDE.md (Hair) for the pipeline.
//
//   npm run hair:ai -- images [ids] [--seed=N] [--dev]   FLUX image of the style on a bald mannequin head -> dev/hair-ai/raw/<id>.jpg
//   npm run hair:ai -- models [ids]                       TRELLIS image-to-3D -> dev/hair-ai/raw/<id>.glb
//   npm run hair:ai -- build  [ids]                       register, strip the mannequin, decimate, bake the tint map -> public/assets/characters/hair/
//   npm run hair:ai -- sheet  [ids]                       contact sheet of the raw images (dev/hair-ai/sheets)
//   npm run hair:ai -- content                            writes the hairstyle entries of the built GLBs into src/content/character.ts
//
// Paid calls (images, models) are booked in dev/hair-ai/LEDGER.md first and stop at the cap (HAIR_AI_BUDGET, default 3 USD);
// results are cached in dev/hair-ai/raw/, so `build` and everything after it cost nothing and run offline. The API key is read
// from FAL_KEY or /home/user/apis/Fal.ai at run time (tools/hair-ai/fal.mts) and is never written anywhere.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = `${ROOT}/dev/hair-ai/raw`;

// node's fetch only honours the sandbox proxy with NODE_USE_ENV_PROXY=1 (set before start-up)
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' } });
  process.exit(r.status ?? 1);
}

const args = process.argv.slice(2);
const cmd = args[0] ?? '';
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const idsArg = args.slice(1).filter((a) => !a.startsWith('--'));

const { AI_STYLES, stylePrompt } = await import('./hair-ai/styles.mts');
const styles = idsArg.length ? idsArg.map((id) => AI_STYLES.find((s) => s.id === id) ?? (() => { throw new Error(`unknown style ${id}`); })()) : AI_STYLES;
mkdirSync(RAW, { recursive: true });

if (cmd === 'images') {
  const { charge, download, falRun } = await import('./hair-ai/fal.mts');
  const dev = args.includes('--dev');
  for (const s of styles) {
    const seed = Number(flag('seed') ?? 7);
    const model = dev ? 'fal-ai/flux/dev' : 'fal-ai/flux/schnell';
    const prompt = stylePrompt(s);
    charge(model, `image ${s.id} (seed ${seed}, 1 MP)`, dev ? 0.025 : 0.003);
    const input: Record<string, unknown> = { prompt, image_size: 'square_hd', seed, num_inference_steps: dev ? 28 : 4 };
    if (dev) input.guidance_scale = 3.5;
    const r = await falRun(model, input);
    await download(r.images[0].url, `${RAW}/${s.id}.jpg`);
    writeFileSync(`${RAW}/${s.id}.json`, JSON.stringify({ id: s.id, imageModel: model, seed, prompt }, null, 1));
    console.log(`[images] ${s.id} (${model}, seed ${seed})`);
  }
} else if (cmd === 'models') {
  const { charge, download, falRun } = await import('./hair-ai/fal.mts');
  for (const s of styles) {
    if (existsSync(`${RAW}/${s.id}.glb`) && !args.includes('--force')) { console.log(`[models] ${s.id}: cached`); continue; }
    const img = readFileSync(`${RAW}/${s.id}.jpg`);
    charge('fal-ai/trellis', `3D model ${s.id}`, 0.02);
    const r = await falRun('fal-ai/trellis', { image_url: `data:image/jpeg;base64,${img.toString('base64')}`, seed: Number(flag('seed') ?? 7), texture_size: 1024, mesh_simplify: 0.95 });
    const bytes = await download(r.model_mesh.url, `${RAW}/${s.id}.glb`);
    const meta = JSON.parse(readFileSync(`${RAW}/${s.id}.json`, 'utf8'));
    writeFileSync(`${RAW}/${s.id}.json`, JSON.stringify({ ...meta, modelModel: 'fal-ai/trellis', modelSeed: Number(flag('seed') ?? 7), glbBytes: bytes }, null, 1));
    console.log(`[models] ${s.id}: ${(bytes / 1048576).toFixed(1)} MB`);
  }
} else if (cmd === 'sheet') {
  const sharp = (await import('sharp')).default;
  const cell = 300, cols = 6, rows = Math.ceil(styles.length / cols);
  const tiles = await Promise.all(styles.map((s) => sharp(`${RAW}/${s.id}.jpg`).resize(cell, cell).toBuffer()));
  mkdirSync(`${ROOT}/dev/hair-ai/sheets`, { recursive: true });
  await sharp({ create: { width: cols * cell, height: rows * cell, channels: 3, background: '#fff' } }).composite(tiles.map((t, k) => ({ input: t, left: (k % cols) * cell, top: Math.floor(k / cols) * cell }))).jpeg({ quality: 85 }).toFile(`${ROOT}/dev/hair-ai/sheets/raw-images.jpg`);
  console.log('[sheet] dev/hair-ai/sheets/raw-images.jpg');
} else if (cmd === 'build') {
  const { buildAll } = await import('./hair-ai/build.mts');
  await buildAll(styles, ROOT, { debug: args.includes('--debug') });
} else if (cmd === 'content') {
  // rewrites the AI-HAIR block of src/content/character.ts with the styles whose GLB exists
  const { contentSource } = await import('./hair-ai/styles.mts');
  const built = styles.filter((s) => existsSync(`${ROOT}/public/assets/characters/hair/${s.id}.glb`));
  const file = `${ROOT}/src/content/character.ts`;
  const src = readFileSync(file, 'utf8');
  const a = src.indexOf('  // AI-HAIR-BEGIN'), b = src.indexOf('  // AI-HAIR-END');
  if (a < 0 || b < 0) throw new Error('AI-HAIR markers missing in src/content/character.ts');
  const body = `  // AI-HAIR-BEGIN (tools/build-ai-hair.mts content: generated hairstyles, drawn from public/assets/characters/hair/<id>.glb)\n${contentSource(built)}\n`;
  writeFileSync(file, src.slice(0, a) + body + src.slice(b));
  console.log(`[content] ${built.length} AI hairstyles written to src/content/character.ts`);
} else {
  console.log('usage: npm run hair:ai -- images|models|build|sheet|content [style ids] [--seed=N] [--dev] [--force]');
  process.exit(cmd ? 1 : 0);
}
