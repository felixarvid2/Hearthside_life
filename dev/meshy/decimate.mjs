#!/usr/bin/env node
// Makes lighter variants of the Meshy GLB for the mobile budget check:
//   node dev/meshy/decimate.mjs [in.glb] [outDir]
// Triangle targets x texture sizes are written as variants/<tris>k_<tex>.glb (meshopt simplify keeps the UVs of the
// surviving vertices; textures are resized and re-encoded with sharp). Prints triangle count, texture size and file size.
import { NodeIO } from '@gltf-transform/core';
import { simplify, weld, textureCompress, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const input = resolve(process.argv[2] ?? join(here, 'base_male_test.glb'));
const outDir = resolve(process.argv[3] ?? join(here, 'variants'));
mkdirSync(outDir, { recursive: true });
await MeshoptSimplifier.ready;

const TRIS = [12000, 8000, 5000];
const TEX = [1024, 512];
const io = new NodeIO();
const rows = [];
for (const tris of TRIS) {
  for (const tex of TEX) {
    const doc = await io.read(input);
    const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
    const before = prim.getIndices().getCount() / 3;
    await doc.transform(weld({ tolerance: 1e-5 }), simplify({ simplifier: MeshoptSimplifier, ratio: tris / before, error: 0.02, lockBorder: false }), prune(), dedup());
    await doc.transform(textureCompress({ encoder: sharp, resize: [tex, tex], targetFormat: 'jpeg', quality: 85 }));
    const after = doc.getRoot().listMeshes()[0].listPrimitives()[0].getIndices().getCount() / 3;
    const file = join(outDir, `${tris / 1000}k_${tex}.glb`);
    await io.write(file, doc);
    rows.push({ file: `${tris / 1000}k_${tex}.glb`, tris: after, tex, bytes: statSync(file).size });
  }
}
console.table(rows);
