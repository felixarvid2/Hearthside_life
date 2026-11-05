#!/usr/bin/env node
// Rebuilds only the original furniture models (tools/furniture-extra) and merges them into public/assets/manifest.json.
// `node tools/build-assets.mjs` does the same as part of the full pipeline (it needs the Kenney library; this does not).
// Usage: node tools/build-extra-furniture.mjs [--only=<group>]
//   --only=<group>  build just one group: 'base' (the original models) or a file of tools/furniture-extra/m10/ without .mjs
//                   (seating-beds, tables-storage, kitchen-bath-electronics, lighting-outdoor-kids, decor-hobby). Only that
//                   group's GLBs, thumbnails, manifest entries and src/content/objectsM10/<group>.models.ts are touched.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExtraFurniture } from './furniture-extra/index.mjs';
import { EXTRA_MODELS, MODEL_GROUPS } from './furniture-extra/models.mjs';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
const onlyArg = process.argv.slice(2).find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length) : undefined;
if (only !== undefined && !(only in MODEL_GROUPS)) { console.error(`unknown group '${only}' (have ${Object.keys(MODEL_GROUPS).join(', ')})`); process.exit(1); }

const manifestFile = path.join(OUT, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
// a new model must not silently replace a Kenney model or a garden/stair model
for (const name of Object.keys(EXTRA_MODELS)) {
  const have = manifest.furniture[name];
  if (have && !(have.original && !have.exterior)) throw new Error(`furniture model '${name}' collides with a ${have.exterior ? 'tools/exterior' : 'Kenney'} model of the same name`);
}
const entries = await buildExtraFurniture(OUT, { only });
// entries of removed models go (of the built group only with --only)
for (const [name, entry] of Object.entries(manifest.furniture)) {
  if (entry.original && !entry.exterior && !entries[name] && (only === undefined || (entry.group ?? 'base') === only)) delete manifest.furniture[name];
}
Object.assign(manifest.furniture, entries);
manifest.sources.furnitureOriginal = 'Original low-poly furniture models built by tools/furniture-extra (this project, CC0)';
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
console.log(`manifest: ${Object.keys(entries).length} original furniture models${only ? ` (group ${only})` : ''}`);
