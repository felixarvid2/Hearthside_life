// Family lineup of the modular (Quaternius) style (QA, dev only): baby, toddler, child, teen, adult man and woman, elder, in one
// scene through the real ModularCharacterView, so the stage proportions, poses and posture anchors can be looked at.
// Open /dev/stages.html with `npm run dev`, or run `node dev/shoot-stages.mjs` for the screenshots in dev/shots/quaternius-stages/.
// Query: pose=idle|walk|sit|lie|carry  t=<seconds into the clip>  cam=front|three|side|close  w=<px> h=<px>  frame=a|b  bodies=second
// window.stagesReady = true when everything is drawn; window.stagesError holds a fatal error message.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AnimId } from '../src/core/anim';
import type { Appearance, LifeStage } from '../src/core/types';
import { ModularCharacterView } from '../src/characters/modular/ModularCharacterView';
import { loadModularRuntime } from '../src/characters/modular/runtime';
import { lyingPlacement, seatedPlacement } from '../src/characters/posture';
import { CRADLE } from '../src/characters/stagePose';
import { STAGE_PROPORTIONS } from '../src/characters/modular/stageProportions';
import { deriveModularLook } from '../src/characters/modular/look';

declare global { interface Window { stagesReady?: boolean; stagesError?: string } }

const q = new URLSearchParams(location.search);
const POSE = q.get('pose') ?? 'idle';
const CAM = q.get('cam') ?? 'front';
const T = Math.max(0, Number(q.get('t') ?? 0.5) || 0);
const W = Number(q.get('w')) || 1500, H = Number(q.get('h')) || 520;
// cx / cy / d aim a close-up camera: centre x, height and distance (metres)
const CX = Number(q.get('cx')) || 0, CY = Number(q.get('cy')) || 0.85, CD = Number(q.get('d')) || 0;

interface Member { stage: LifeStage; frame: 'a' | 'b'; skin: string; hair: string }
const FAMILY: Member[] = [
  { stage: 'baby', frame: 'a', skin: '#e0b48f', hair: '#5a3b24' },
  { stage: 'toddler', frame: 'b', skin: '#c68f60', hair: '#2b1d14' },
  { stage: 'child', frame: 'a', skin: '#e8c39d', hair: '#8a5a2b' },
  { stage: 'teen', frame: 'b', skin: '#95603b', hair: '#1c1410' },
  { stage: 'adult', frame: 'a', skin: '#d8a982', hair: '#3a2a20' },
  { stage: 'adult', frame: 'b', skin: '#f0cfb5', hair: '#a8643a' },
  { stage: 'elder', frame: 'a', skin: '#d9b08c', hair: '#c9c9c9' },
];
const SPACING = 1.0;

// frame=a|b puts every stage on that frame; bodies=second draws each frame's second build (BodyPresetDef.base) instead of its default
const FRAME = q.get('frame');
if (FRAME === 'a' || FRAME === 'b') for (const m of FAMILY) m.frame = FRAME;
const SECOND = q.get('bodies') === 'second';

const appearanceOf = (m: Member): Appearance => ({
  frame: m.frame, skin: m.skin as Appearance['skin'], body: {}, bodyPresetId: null,
  face: { presetId: null, params: {}, eyeColor: '#5b4636', browStyle: 'soft', browColor: m.hair as Appearance['skin'], freckles: 0, blush: 0, lipTint: 0, lipColor: '#b36a5e' },
  hair: { styleId: '', color: m.hair as Appearance['skin'], highlight: null, facialHairId: null },
}) as Appearance;

// prop=baby.head:1.5,child.height:0.7 overrides profile numbers for tuning without a rebuild
for (const item of (q.get('prop') ?? '').split(',').filter(Boolean)) {
  const [path, val] = item.split(':');
  const [stage, field] = (path ?? '').split('.');
  const prof = (STAGE_PROPORTIONS as unknown as Record<string, Record<string, number>>)[stage ?? ''];
  if (prof && field && Number.isFinite(Number(val))) prof[field] = Number(val);
}

async function main(): Promise<void> {
  const runtime = await loadModularRuntime('/assets/');
  const loader = new GLTFLoader();
  const clips = (await Promise.all(['anims_1', 'anims_2'].map((n) => loader.loadAsync(`/assets/characters/${n}.glb`)))).flatMap((g) => g.animations);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  document.body.append(renderer.domElement);
  renderer.domElement.style.width = `${W}px`; renderer.domElement.style.height = `${H}px`;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d9d2c4');
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x8a7f72, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2, 4, 4); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -6, right: 6, top: 4, bottom: -2, near: 0.5, far: 14 });
  scene.add(key);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: '#b9ae9a', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  // a one-metre grid of marks on the floor, so heights can be read
  const grid = new THREE.GridHelper(20, 20, 0x6b604f, 0x9a8f7c); (grid.material as THREE.Material).opacity = 0.5; (grid.material as THREE.Material).transparent = true; scene.add(grid);

  const views = FAMILY.map((m) => {
    const app = appearanceOf(m);
    if (SECOND) {
      const mf = runtime.manifest;
      const second = mf.bodies.find((b) => b.base === mf.defaults.bodyByFrame[m.frame]);
      if (second) app.modular = { ...deriveModularLook(app, mf, undefined, m.stage), bodyId: second.id };
    }
    const v = new ModularCharacterView(runtime, clips, app, {} as never, m.stage);
    v.root.traverse((o) => { o.castShadow = true; });
    scene.add(v.root);
    return v;
  });

  // furniture for the poses: a bench (seat 0.45 m) or a mattress (0.5 m) under the people
  const bench = new THREE.Mesh(new THREE.BoxGeometry(FAMILY.length * SPACING + 0.4, 0.45, 0.4), new THREE.MeshStandardMaterial({ color: '#7a5a3a' }));
  bench.position.set(0, 0.225, -0.2); bench.receiveShadow = true; bench.visible = POSE === 'sit';
  const bed = new THREE.Mesh(new THREE.BoxGeometry(FAMILY.length * SPACING + 0.4, 0.5, 2.2), new THREE.MeshStandardMaterial({ color: '#c8d4e0' }));
  bed.position.set(0, 0.25, 0); bed.receiveShadow = true; bed.visible = POSE === 'lie';
  scene.add(bench, bed);

  const anim: AnimId = POSE === 'walk' ? 'walk' : POSE === 'sit' ? 'sitIdle' : POSE === 'lie' ? 'sleep' : 'idle';
  const posture = POSE === 'sit' ? 'seated' : POSE === 'lie' ? 'lying' : 'standing';
  const mid = (FAMILY.length - 1) / 2;
  await Promise.all(views.map(async (v, i) => {
    while (v.busy) await new Promise((r) => setTimeout(r, 20));
    v.play(anim, { fade: 0, posture });
    if (POSE === 'idle' || POSE === 'sit') v.setBabyUpright(POSE === 'idle' || POSE === 'sit');
    for (let t = 0; t < T; t += 0.05) v.update(0.05);
    v.update(0.0001);
    const x = (i - mid) * SPACING;
    const m = FAMILY[i]!;
    v.root.rotation.y = POSE === 'walk' ? 0.5 : 0;
    v.root.position.set(x, -v.floorDrop, 0);
    if (POSE === 'sit') {
      const p = seatedPlacement({ x, y: 0.45, z: -0.2 }, 0, m.frame, 'mpfb', { stage: m.stage, modular: true });
      v.root.position.set(p.x, p.y, p.z); v.root.rotation.y = p.yaw;
    } else if (POSE === 'lie') {
      const p = lyingPlacement({ x, y: 0.5, z: 0 }, Math.PI, { stage: m.stage, modular: true, frame: m.frame });
      v.root.position.set(p.x, p.y, p.z); v.root.rotation.y = p.yaw;
    }
  }));
  if (POSE === 'carry') {
    // the grown-up woman holds the baby
    const carrier = views[5]!, baby = views[0]!;
    carrier.setCarrying(true); baby.setBabyUpright(false); baby.play('sleep', { fade: 0, posture: 'lying' });
    for (let i = 0; i < 40; i++) { carrier.update(0.05); baby.update(0.05); }
    const tmp = new THREE.Vector3();
    carrier.cradlePoint(tmp);
    const p = lyingPlacement({ x: tmp.x, y: tmp.y, z: tmp.z }, carrier.root.rotation.y + CRADLE.yaw, { stage: 'baby', modular: true, frame: 'a' });
    baby.root.position.set(p.x, p.y, p.z); baby.root.rotation.y = p.yaw;
  }
  scene.updateMatrixWorld(true);

  const cam = new THREE.PerspectiveCamera(26, W / H, 0.1, 60);
  const span = FAMILY.length * SPACING;
  if (CAM === 'close') { cam.position.set(CX, CY + 0.2, CD || 4.2); cam.lookAt(CX, CY, 0); }
  else if (CAM === 'side') { cam.position.set(7.5, 1.0, 0.5); cam.lookAt(0, 0.8, 0); }
  else if (POSE === 'lie') { cam.position.set(0, 7, 5); cam.lookAt(0, 0.4, 0); }
  else { const d = span / (2 * Math.tan(THREE.MathUtils.degToRad(13)) * (W / H)) * 1.05; cam.position.set(CAM === 'three' ? d * 0.45 : 0, 0.9, d); cam.lookAt(0, 0.8, 0); }
  renderer.render(scene, cam);
  // the young skin textures arrive after the bodies: give them a moment, then draw again
  await new Promise((r) => setTimeout(r, 1200));
  renderer.render(scene, cam);
  window.stagesReady = true;
}

main().catch((e: unknown) => { window.stagesError = String(e); console.error(e); });
