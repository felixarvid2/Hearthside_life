// Can the clothing/hair generators be pointed at a Meshy body? Builds a BodyTemplate from the fitted Meshy mesh
// (as RawBody) and compares its landmarks with the mannequin's; builds a few garments and hair on it.
//   npx esbuild dev/meshy/templateProbe.mts --bundle --platform=node --format=esm --outfile=$TMP/probe.mjs && node $TMP/probe.mjs [--glb=file] [--frame=a|b]
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NodeIO } from '@gltf-transform/core';
import { readFileSync } from 'node:fs';
import { rawFromMesh } from '../../src/characters/assets';
import { buildBodyTemplate } from '../../src/characters/template';
import { buildGarment } from '../../src/characters/clothing';
import { buildHair } from '../../src/characters/hair';
import { GARMENTS, HAIR } from '../../src/content/character';
import { fitMeshy } from '../meshyFit';
import { meshyRawBody } from '../meshyRaw';

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const root = `${process.cwd()}/`;
const frame = (arg('frame') ?? 'a') as 'a' | 'b';
const b = readFileSync(`${root}public/assets/characters/body_${frame}.glb`);
const gltf = await new Promise<{ scene: THREE.Group }>((res, rej) => new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, '', (g) => res(g as never), rej));
let sm: THREE.SkinnedMesh | null = null;
gltf.scene.traverse((o) => { if (!sm && (o as THREE.SkinnedMesh).isSkinnedMesh) sm = o as THREE.SkinnedMesh; });
const raw = rawFromMesh(frame, sm as unknown as THREE.SkinnedMesh);
const doc = await new NodeIO().read(arg('glb') ?? `${root}dev/meshy/base_male_test.glb`);
const prim = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
const index = prim.getIndices()!.getArray()!;
const fit = fitMeshy({ positions: new Float32Array(prim.getAttribute('POSITION')!.getArray()!), normals: new Float32Array(prim.getAttribute('NORMAL')!.getArray()!), index }, raw);
const mraw = meshyRawBody(raw, fit);
const t0 = Date.now();
const tm = buildBodyTemplate(raw), tz = buildBodyTemplate(mraw);
console.log('template build ms', Date.now() - t0);
for (const k of Object.keys(tm.lm) as Array<keyof typeof tm.lm>) console.log(k.padEnd(10), tm.lm[k].toFixed(3), tz.lm[k].toFixed(3), (tz.lm[k] - tm.lm[k]).toFixed(3));
let ok = 0, bad = 0;
for (const g of GARMENTS) { try { const m = buildGarment(tz, g); if (m.mesh.indices.length) ok++; else bad++; } catch (e) { bad++; console.log('garment fail', g.id, String(e).slice(0, 100)); } }
console.log(`garments built on the Meshy template: ${ok} ok, ${bad} failed (of ${GARMENTS.length})`);
let hok = 0;
for (const h of HAIR) { try { buildHair(tz, h, null); hok++; } catch (e) { console.log('hair fail', h.id, String(e).slice(0, 100)); } }
console.log(`hair styles built: ${hok}/${HAIR.length}`);

// head / hair anchor: the procedural head (hair is built on it) against the Meshy skull, band 1.60-1.70 m
const skm = tm.skinMesh, info = skm.attrs.aInfo!.data;
let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, top = -Infinity;
for (let i = 0; i < skm.positions.length / 3; i++) {
  if (info[i * skm.attrs.aInfo!.size] !== 5) continue;
  const y = skm.positions[i * 3 + 1]!;
  top = Math.max(top, y);
  if (y < 1.6 || y > 1.7) continue;
  x0 = Math.min(x0, skm.positions[i * 3]!); x1 = Math.max(x1, skm.positions[i * 3]!); z0 = Math.min(z0, skm.positions[i * 3 + 2]!); z1 = Math.max(z1, skm.positions[i * 3 + 2]!);
}
const k = fit.report.skull;
console.log('procedural head  width', (x1 - x0).toFixed(3), 'depth', (z1 - z0).toFixed(3), 'crown', top.toFixed(3), 'centre z', ((z0 + z1) / 2).toFixed(3));
console.log('Meshy skull      width', (k.x1 - k.x0).toFixed(3), 'depth', (k.z1 - k.z0).toFixed(3), 'crown', k.crown.toFixed(3), 'centre z', ((k.z0 + k.z1) / 2).toFixed(3));
