// Wardrobe preview (QA, dev only): a grid of every modular body (rows) x bare / hairstyle / garment (columns), each cell rendered
// by the real ModularCharacter and framed with framing.ts. One WebGLRenderer renders every cell in turn and copies it to the
// cell's 2D canvas; one character per row is reused for all its columns.
// Open /dev/wardrobe.html with `npm run dev`. It is not part of the production build (only index.html is).
// Query: pose=idle|walk|sit  t=<seconds into the clip>  shot=face|upper|full  body=a,b  part=x,y ('bare' is a part)  skin=rrggbb  hair=rrggbb  eyes=rrggbb  size=<cell px>
//   thumb=<partId>&body=<bodyId>[&shot=]  renders just that one cell, 256x256 on a transparent background (tools/characters/thumbnails.mjs).
// window.wardrobeReady = true when every cell has been rendered once; window.wardrobeError holds a fatal error message.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AnimId } from '../src/core/anim';
import { ModularCharacter } from '../src/characters/modular/ModularCharacter';
import { loadModularRuntime } from '../src/characters/modular/runtime';
import type { ModularRuntime } from '../src/characters/modular/runtime';
import { frameCamera } from '../src/characters/modular/creator/framing';
import type { Shot } from '../src/characters/modular/creator/framing';
import type { ModularLook, ModularOutfit } from '../src/characters/modular/types';

declare global {
  interface Window { wardrobeReady?: boolean; wardrobeError?: string; wardrobeDispose?: () => void }
}

const q = new URLSearchParams(location.search);
const list = (k: string): string[] | null => { const v = q.get(k); return v ? v.split(',').filter(Boolean) : null; };
const hex = (k: string, d: string): string => { const v = q.get(k); return v && /^#?[0-9a-fA-F]{6}$/.test(v) ? (v.startsWith('#') ? v : `#${v}`) : d; };
const thumbPart = q.get('thumb');
const shotOf = (v: string | null): Shot => (v === 'face' || v === 'upper' || v === 'full' ? v : 'full');
const SHOT = shotOf(q.get('shot'));
const POSE = q.get('pose') ?? 'idle';
const POSE_ANIM: Record<string, AnimId> = { idle: 'idle', walk: 'walk', sit: 'sitIdle', lie: 'sleep' };
const T = Math.max(0, Number(q.get('t') ?? 0) || 0);
// yaw=<radians> turns the person (thumbnails of gathered hair show the tail from behind)
const YAW = Number(q.get('yaw') ?? 0) || 0;
const SKIN = hex('skin', '#c68642'), HAIR = hex('hair', '#4a3220'), EYES = hex('eyes', '#5b4636');
// outfit=top:tshirt_crew,bottom:trousers_straight is worn in every column; morph=weight:1,jaw_width:-1 sets morphs
const pairs = (k: string): Array<[string, string]> => (list(k) ?? []).map((x) => x.split(':') as [string, string]).filter((x) => x.length === 2);
const EXTRA_OUTFIT = Object.fromEntries(pairs('outfit')) as ModularOutfit;
const MORPHS = Object.fromEntries(pairs('morph').map(([k, v]) => [k, Number(v)]).filter(([, v]) => Number.isFinite(v)));
const SIZE = Math.min(1024, Math.max(64, Number(q.get('size')) || 0));
const CELL_W = q.get('size') ? SIZE : thumbPart ? 256 : 192, CELL_H = q.get('size') ? SIZE : 256;

const bar = document.getElementById('bar') as HTMLElement;
const grid = document.getElementById('grid') as HTMLElement;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
};

interface Column { id: string; kind: 'bare' | 'hair' | 'facial' | 'garment' }

async function loadClips(): Promise<THREE.AnimationClip[]> {
  const loader = new GLTFLoader();
  const gltfs = await Promise.all(['anims_1', 'anims_2'].map((n) => loader.loadAsync(`/assets/characters/${n}.glb`)));
  return gltfs.flatMap((g) => g.animations);
}

async function main(): Promise<void> {
  const runtime: ModularRuntime = await loadModularRuntime('/assets/');
  const clips = await loadClips();
  const { manifest } = runtime;
  const bodyFilter = list('body'), partFilter = list('part');
  const bodies = manifest.bodies.filter((b) => !bodyFilter || bodyFilter.includes(b.id));
  const columns: Column[] = [
    { id: 'bare', kind: 'bare' } as Column,
    ...manifest.hairstyles.map((h): Column => ({ id: h.id, kind: 'hair' })),
    ...(manifest.facialHair ?? []).map((h): Column => ({ id: h.id, kind: 'facial' })),
    ...manifest.garments.map((g): Column => ({ id: g.id, kind: 'garment' })),
  ].filter((c) => (thumbPart ? c.id === thumbPart : !partFilter || partFilter.includes(c.id)));

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(1);
  renderer.setSize(CELL_W, CELL_H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x8a7f72, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1.5, 3, 2.5); scene.add(key);
  const camera = new THREE.PerspectiveCamera(28, CELL_W / CELL_H, 0.05, 40);

  const characters: ModularCharacter[] = [];
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const c of characters) c.dispose();
    characters.length = 0;
    runtime.cache.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };
  window.wardrobeDispose = dispose;
  (window as unknown as { wardrobeChars: ModularCharacter[] }).wardrobeChars = characters;   // dev: posture measurements
  addEventListener('pagehide', dispose);

  if (!thumbPart) {
    grid.style.gridTemplateColumns = `max-content repeat(${columns.length}, ${CELL_W}px)`;
    grid.append(el('div'));
    for (const c of columns) grid.append(el('div', 'head', c.id));
  } else {
    document.body.classList.add('thumb');
    bar.remove();
    grid.style.cssText = 'display:block;padding:0;gap:0';
  }

  const look = (bodyId: string, hairId: string | null, outfit: ModularOutfit, facialHairId: string | null = null): ModularLook => ({
    v: 2, bodyId, hairId, facialHairId, outfits: { everyday: { ...EXTRA_OUTFIT, ...outfit } }, colors: { skin: SKIN, eyes: EYES, hair: HAIR, garments: {} }, morphs: MORPHS,
  });

  let cells = 0;
  for (const body of bodies) {
    const rowCells: Array<{ col: Column; box: HTMLElement; label: HTMLElement }> = [];
    if (!thumbPart) grid.append(el('div', 'row', body.id));
    for (const col of columns) {
      const cell = el('div', 'cell');
      const box = el('div', 'box'); const label = el('div', 'label', col.id);
      cell.append(box); if (!thumbPart) cell.append(label);
      grid.append(cell);
      rowCells.push({ col, box, label });
    }
    const character = new ModularCharacter(runtime.cache, manifest, clips);
    characters.push(character);
    scene.add(character.root);
    // the pose is stepped once per row; applying parts afterwards does not advance the animation
    await character.apply(look(body.id, null, {}));
    character.play(POSE_ANIM[POSE] ?? 'idle', { fade: 0 });
    character.update(0);
    for (let t = T; t > 1e-6; t -= 0.1) character.update(Math.min(0.1, t));
    character.root.rotation.y = YAW;
    character.root.updateMatrixWorld(true);
    const headTop = character.headTop(new THREE.Vector3());
    const head = character.bone('Head');
    const crownAbove = head ? headTop.y - head.getWorldPosition(new THREE.Vector3()).y : undefined;
    frameCamera(camera, character.root, SHOT, crownAbove === undefined ? {} : { crownAbove });

    for (const { col, box, label } of rowCells) {
      const def = col.kind === 'hair' ? manifest.hairstyles.find((h) => h.id === col.id)
        : col.kind === 'facial' ? (manifest.facialHair ?? []).find((h) => h.id === col.id)
        : col.kind === 'garment' ? manifest.garments.find((g) => g.id === col.id) : null;
      if (def && !def.files[body.id]) {
        box.parentElement!.classList.add('nofit');
        box.textContent = 'not fitted'; label.classList.add('nofit');
        if (thumbPart) window.wardrobeError = `'${col.id}' is not fitted to '${body.id}'`;
        cells++;
        continue;
      }
      const garment = col.kind === 'garment' ? manifest.garments.find((g) => g.id === col.id) : undefined;
      await character.apply(look(body.id, col.kind === 'hair' ? col.id : null, garment ? { [garment.slot]: garment.id } : {}, col.kind === 'facial' ? col.id : null));
      character.root.updateMatrixWorld(true);
      renderer.render(scene, camera);
      const canvas = el('canvas');
      canvas.width = CELL_W; canvas.height = CELL_H;
      canvas.getContext('2d')!.drawImage(renderer.domElement, 0, 0);
      box.replaceWith(canvas);
      if (character.issues.length) {
        label.classList.add('bad');
        label.textContent = `${col.id}: ${character.issues.join(' ')}`;
        console.warn(`[wardrobe] ${body.id} / ${col.id}:`, character.issues);
      }
      cells++;
    }
    scene.remove(character.root);
    if (q.get('keep')) continue;               // keep=1: characters stay (posed) for measurements
    character.dispose();
    characters.splice(characters.indexOf(character), 1);
  }
  bar.textContent = `${bodies.length} bodies x ${columns.length} parts, pose=${POSE} t=${T} shot=${SHOT}`;
  window.wardrobeReady = true;
}

main().catch((e: unknown) => {
  window.wardrobeError = String(e);
  bar.textContent = `error: ${String(e)}`;
  console.error(e);
});
