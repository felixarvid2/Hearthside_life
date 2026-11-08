// Review-sheet renderer for doors and windows (dev/openings-sheet.mjs). Every opening is built by the game's own
// mesh code (src/render/openingMeshes.ts) into a plaster wall with the same hole the game cuts (openingCutout), seen
// from outside at a slight angle. Doors are drawn closed and fully open; windows once. Returns PNG data URLs.

import * as THREE from 'three';
import { OPENINGS } from '../src/content/surfaces';
import type { OpeningDef } from '../src/content/types';
import { buildOpeningMesh, openingCutout, setDoorOpen, WALL_THICKNESS } from '../src/render/openingMeshes';

const WALL_H = 2.8;
const BG = '#efe9dd', INK = '#33291d', MUTED = '#7a6c5a';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f3e6d3');
scene.add(new THREE.HemisphereLight('#fff6ea', '#b49a7c', 1.5));
const key = new THREE.DirectionalLight('#fff1dc', 2.2);
key.position.set(2.5, 4, 5);
scene.add(key);
const plaster = new THREE.MeshStandardMaterial({ color: '#e4d6bf', roughness: 0.95 });
const floorMat = new THREE.MeshStandardMaterial({ color: '#a98d6b', roughness: 0.9 });
const holder = new THREE.Group();
scene.add(holder);

/** The wall (with the opening's hole), a strip of floor, and the opening mesh, drawn into a w x h cell. */
function drawCell(ctx: CanvasRenderingContext2D, def: OpeningDef, open: number, x: number, y: number, w: number, h: number): void {
  for (const c of [...holder.children]) { c.removeFromParent(); (c as THREE.Mesh).geometry?.dispose(); }
  const cut = openingCutout(def);
  const half = cut.halfWidth, T = WALL_THICKNESS;
  const W = def.width + 1.0;
  const shape = new THREE.Shape([new THREE.Vector2(-W / 2, 0), new THREE.Vector2(W / 2, 0), new THREE.Vector2(W / 2, WALL_H), new THREE.Vector2(-W / 2, WALL_H)]);
  const top0 = Math.min(cut.top, WALL_H);
  shape.holes.push(new THREE.Path([new THREE.Vector2(-half, cut.bottom + (cut.bottom === 0 ? 0.001 : 0)), new THREE.Vector2(half, cut.bottom + (cut.bottom === 0 ? 0.001 : 0)), new THREE.Vector2(half, top0), new THREE.Vector2(-half, top0)]));
  const g = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
  g.translate(0, 0, -T / 2);
  holder.add(new THREE.Mesh(g, plaster));
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W + 1.4, 0.04, 2.4), floorMat);
  floor.position.set(0, -0.02, 0.9);
  holder.add(floor);
  const m = buildOpeningMesh(def);
  if (def.kind === 'door') setDoorOpen(m, open);
  holder.add(m);
  holder.rotation.y = -0.5;
  holder.updateMatrixWorld(true);

  const top = Math.min(cut.top + 0.45, WALL_H);
  const bottom = def.kind === 'door' ? -0.1 : Math.max(-0.1, cut.bottom - 0.45);
  const midY = (top + bottom) / 2;
  const span = Math.max(top - bottom, (def.width + 0.5) / (w / h), 1.5);
  const aspect = w / h;
  const cam = new THREE.OrthographicCamera((-span * aspect) / 2, (span * aspect) / 2, span / 2, -span / 2, 0.1, 30);
  cam.position.set(0.9, midY + 0.5, 6);
  cam.lookAt(0, midY, 0);
  cam.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  renderer.render(scene, cam);
  ctx.drawImage(renderer.domElement, x, y, w, h);
}

function label(ctx: CanvasRenderingContext2D, def: OpeningDef, x: number, y: number, w: number): void {
  ctx.fillStyle = INK; ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillText(def.name, x + 8, y + 18, w - 16);
  ctx.fillStyle = MUTED; ctx.font = '11px ui-monospace, monospace';
  ctx.fillText(`${def.id}  ${def.width}w ${def.height}h${def.kind === 'window' ? ` sill ${def.sill}` : ''}  $${def.price / 100}`, x + 8, y + 34, w - 16);
}

interface Options { kind: 'door' | 'window'; ids?: string[]; perSheet?: number }

function render(o: Options): { sheets: string[]; ids: string[]; problems: string[] } {
  let list = OPENINGS.filter((d) => d.kind === o.kind);
  if (o.ids?.length) list = list.filter((d) => o.ids!.includes(d.id));
  const door = o.kind === 'door';
  const cellW = door ? 560 : 300, cellH = 330;
  const cols = door ? 3 : 5, rowsPer = door ? 3 : 4;
  const per = o.perSheet ?? cols * rowsPer;
  const sheets: string[] = [];
  const problems: string[] = [];
  for (let s = 0; s * per < list.length; s++) {
    const part = list.slice(s * per, (s + 1) * per);
    const rows = Math.ceil(part.length / cols);
    const canvas = document.createElement('canvas');
    canvas.width = cols * cellW; canvas.height = rows * cellH;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = BG; ctx.fillRect(0, 0, canvas.width, canvas.height);
    part.forEach((def, i) => {
      const x = (i % cols) * cellW, y = Math.floor(i / cols) * cellH;
      try {
        if (door) {
          drawCell(ctx, def, 0, x, y + 40, cellW / 2, cellH - 44);
          drawCell(ctx, def, 1, x + cellW / 2, y + 40, cellW / 2, cellH - 44);
        } else drawCell(ctx, def, 0, x, y + 40, cellW, cellH - 44);
      } catch (e) { problems.push(`${def.id}: ${String(e)}`); }
      label(ctx, def, x, y, cellW);
      ctx.strokeStyle = '#d8ccb6'; ctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
    });
    sheets.push(canvas.toDataURL('image/png'));
  }
  return { sheets, ids: list.map((d) => d.id), problems };
}

(window as unknown as { openingSheets: { render: typeof render } }).openingSheets = { render };
