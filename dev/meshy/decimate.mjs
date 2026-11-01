#!/usr/bin/env node
// Makes lighter variants of the Meshy GLB for the mobile budget check:
//   node dev/meshy/decimate.mjs [in.glb] [outDir]
// Triangle targets x texture sizes are written as variants/<name>_<tris>k_<tex>.glb (meshopt simplify keeps the UVs of the
// surviving vertices; textures are resized and re-encoded with sharp). Prints triangle count, texture size and file size.
import { NodeIO } from '@gltf-transform/core';
import { simplify, weld, textureCompress, prune, dedup, meshopt } from '@gltf-transform/functions';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const input = resolve(process.argv[2] ?? join(here, 'base_male_test.glb'));
const outDir = resolve(process.argv[3] ?? join(here, 'variants'));
mkdirSync(outDir, { recursive: true });
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;

const TRIS = [12000, 8000, 5000];
const TEX = [1024, 512];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const rows = [];
for (const tris of TRIS) {
  for (const tex of TEX) {
    const doc = await io.read(input);
    const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
    const before = prim.getIndices().getCount() / 3;
    await doc.transform(weld({ tolerance: 1e-5 }), simplify({ simplifier: MeshoptSimplifier, ratio: tris / before, error: 0.02, lockBorder: false }), prune(), dedup());
    await doc.transform(textureCompress({ encoder: sharp, resize: [tex, tex], targetFormat: 'jpeg', quality: 85 }));
    const after = doc.getRoot().listMeshes()[0].listPrimitives()[0].getIndices().getCount() / 3;
    const stem = basename(input, '.glb');
    const file = join(outDir, `${stem}_${tris / 1000}k_${tex}.glb`);
    await io.write(file, doc);
    const bytes = statSync(file).size;
    // same file with meshopt-compressed (quantised) geometry: what would be shipped
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const packed = join(outDir, `${stem}_${tris / 1000}k_${tex}_meshopt.glb`);
    await io.write(packed, doc);
    rows.push({ file: basename(file), tris: after, tex, bytes, meshoptBytes: statSync(packed).size });
  }
}
console.table(rows);
