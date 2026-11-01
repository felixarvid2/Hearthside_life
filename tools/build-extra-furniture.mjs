#!/usr/bin/env node
// Rebuilds only the original furniture models (tools/furniture-extra) and merges them into public/assets/manifest.json.
// `node tools/build-assets.mjs` does the same as part of the full pipeline (it needs the Kenney library; this does not).
// Usage: node tools/build-extra-furniture.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExtraFurniture } from './furniture-extra/index.mjs';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
const manifestFile = path.join(OUT, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const entries = await buildExtraFurniture(OUT);
for (const [name, entry] of Object.entries(manifest.furniture)) if (entry.original && !entries[name]) delete manifest.furniture[name];
Object.assign(manifest.furniture, entries);
manifest.sources.furnitureOriginal = 'Original low-poly furniture models built by tools/furniture-extra (this project, CC0)';
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
console.log(`manifest: ${Object.keys(entries).length} original furniture models`);
