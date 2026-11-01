// Node-side pose check (no browser): skins the Meshy mesh with the game's skeleton and clips, prints how much
// every edge stretches versus the bind pose (and the same for the mannequin's own skin as the reference), and can
// dump posed vertices for a quick software render (dev/meshy/softrender.py).
//   npx esbuild dev/meshy/stretch.mts --bundle --platform=node --format=esm --outfile=$TMP/stretch.mjs && node $TMP/stretch.mjs [--dump=DIR] [--glb=file] [--key=value fit options]
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NodeIO } from '@gltf-transform/core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Animator } from '../../src/characters/animation';
import { rawFromMesh } from '../../src/characters/assets';
import { fitMeshy } from '../meshyFit';

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const root = `${process.cwd()}/`; // run from the repository root
const parse = (file: string) => new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((res, rej) => {
  const b = readFileSync(file);
  new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, '', (g) => res(g as never), rej);
});

const body = await parse(`${root}public/assets/characters/body_a.glb`);
let sm: THREE.SkinnedMesh | null = null;
body.scene.traverse((o) => { if (!sm && (o as THREE.SkinnedMesh).isSkinnedMesh) sm = o as THREE.SkinnedMesh; });
const mannequin = sm as unknown as THREE.SkinnedMesh;
const raw = rawFromMesh('a', mannequin);
const clips = new Map<string, THREE.AnimationClip>();
for (const f of ['anims_1', 'anims_2']) for (const c of (await parse(`${root}public/assets/characters/${f}.glb`)).animations) clips.set(c.name, c);

const doc = await new NodeIO().read(arg('glb') ?? `${root}dev/meshy/base_male_test.glb`);
const prim = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
const index = prim.getIndices()!.getArray()!;
const opts: Record<string, number> = {};
for (const a of process.argv.slice(2)) { const m = /^--(height|armScale|sigma|smooth|smoothAmount)=(.+)$/.exec(a); if (m) opts[m[1]!] = Number(m[2]); }
const fit = fitMeshy({ positions: new Float32Array(prim.getAttribute('POSITION')!.getArray()!), normals: new Float32Array(prim.getAttribute('NORMAL')!.getArray()!), index }, raw, opts);

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(fit.positions, 3));
geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(fit.joints, 4));
geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(fit.weights, 4));
geo.setIndex(new THREE.BufferAttribute(new Uint32Array(index), 1));
const skel = mannequin.skeleton;
const mm = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
body.scene.add(mm);
mm.bind(skel, new THREE.Matrix4());
// the mannequin's own skin as the reference
const ref = mannequin;

const animator = new Animator(body.scene, clips);
const poses: Array<[string, 'standing' | 'seated' | 'lying' | undefined, number]> = [
  ['idle', undefined, 0.4], ['walk', undefined, 0.3], ['walk', undefined, 0.7], ['jog', undefined, 0.35], ['sitIdle', 'seated', 0.5], ['sleep', 'lying', 0.1],
  ['eat', undefined, 0.5], ['wave', undefined, 0.4], ['dance', undefined, 0.8], ['talk', undefined, 0.6], ['cook', undefined, 0.4], ['pickUp', undefined, 0.6], ['foldArms', undefined, 0.5],
];

function stretch(mesh: THREE.SkinnedMesh, idx: ArrayLike<number>): { max: number; over2: number; over3: number; p99: number; worst: Array<{ r: number; a: number; b?: number }> } {
  const g = mesh.geometry, bp = g.getAttribute('position'), n = bp.count;
  const v = new THREE.Vector3();
  const posed = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { mesh.getVertexPosition(i, v); posed.set([v.x, v.y, v.z], i * 3); }
  const seen = new Set<number>(), rs: Array<{ r: number; a: number; b?: number }> = [];
  const edge = (a: number, b: number) => {
    const k = a < b ? a * n + b : b * n + a;
    if (seen.has(k)) return; seen.add(k);
    const d0 = Math.hypot(bp.getX(a) - bp.getX(b), bp.getY(a) - bp.getY(b), bp.getZ(a) - bp.getZ(b));
    if (d0 < 0.003) return;
    const d1 = Math.hypot(posed[a * 3]! - posed[b * 3]!, posed[a * 3 + 1]! - posed[b * 3 + 1]!, posed[a * 3 + 2]! - posed[b * 3 + 2]!);
    rs.push({ r: d1 / d0, a, b });
  };
  for (let t = 0; t < idx.length; t += 3) { edge(idx[t]!, idx[t + 1]!); edge(idx[t + 1]!, idx[t + 2]!); edge(idx[t + 2]!, idx[t]!); }
  rs.sort((x, y) => y.r - x.r);
  return { max: rs[0]!.r, p99: rs[Math.floor(rs.length * 0.01)]!.r, over2: rs.filter((x) => x.r > 2).length, over3: rs.filter((x) => x.r > 3).length, worst: rs.slice(0, 6) };
}

const bonesOf = (a: number) => raw.boneNames[fit.joints[a * 4]!];
const refIdx = ref.geometry.getIndex()!.array;
const dump = arg('dump');
if (arg('edges')) {
  animator.play('idle' as never, { fade: 0 }); animator.update(0); animator.update(0.4); body.scene.updateMatrixWorld(true); skel.update();
  const bp = geo.getAttribute('position');
  for (const w of stretch(mm, index).worst) console.log('edge', w.r.toFixed(1), [w.a, w.b!].map((i) => `(${[0, 1, 2].map((k) => bp.array[i * 3 + k]!.toFixed(3)).join(',')} ${bonesOf(i)})`).join(' - '));
}
if (dump) mkdirSync(dump, { recursive: true });

console.log('report', JSON.stringify({ ...fit.report, head: undefined, skull: undefined }));
for (const [id, posture, t] of poses) {
  animator.play(id as never, { fade: 0, posture });
  animator.update(0);
  animator.update(t);
  body.scene.updateMatrixWorld(true);
  skel.update();
  const a = stretch(mm, index), r = stretch(ref, refIdx);
  console.log(`${id.padEnd(9)} t=${t}  meshy max ${a.max.toFixed(2)} p99 ${a.p99.toFixed(2)} >2x ${a.over2} >3x ${a.over3} | mannequin max ${r.max.toFixed(2)} p99 ${r.p99.toFixed(2)} >2x ${r.over2}   worst: ${a.worst.slice(0, 3).map((w) => `${w.r.toFixed(1)}@y${mm.geometry.getAttribute('position').getY(w.a).toFixed(2)}x${mm.geometry.getAttribute('position').getX(w.a).toFixed(2)}/${bonesOf(w.a)}`).join(' ')}`);
  if (dump) {
    const n = geo.getAttribute('position').count, out = new Float32Array(n * 3), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) { mm.getVertexPosition(i, v); out.set([v.x, v.y, v.z], i * 3); }
    writeFileSync(`${dump}/${id}_${t}.f32`, Buffer.from(out.buffer));
  }
}
if (dump) {
  writeFileSync(`${dump}/bind_0.f32`, Buffer.from(fit.positions.buffer));
  writeFileSync(`${dump}/index.u32`, Buffer.from(new Uint32Array(index).buffer));
  const n = geo.getAttribute('position').count, cols = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) { const bn = bonesOf(i) ?? ''; const h = [...bn].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7); cols.set([(h & 255), ((h >> 8) & 255), ((h >> 16) & 255)], i * 3); }
  writeFileSync(`${dump}/colors.u8`, Buffer.from(cols.buffer));
}
