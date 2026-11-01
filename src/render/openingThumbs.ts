// Thumbnails of doors and windows for the Build catalog: the opening model (render/openingMeshes.ts) in a piece
// of plaster wall, rendered into a small offscreen target and returned as a PNG data URL, cached by definition.
// At most one is rendered per frame (requests queue), like portraits, so opening the catalog never stalls.

import * as THREE from 'three';
import type { ContentDB, OpeningDef } from '../content/types';
import { buildOpeningMesh, openingCutout, WALL_THICKNESS } from './openingMeshes';

const SIZE = 112;
const WALL_H = 2.7;

export class OpeningThumbs {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 30);
  private readonly target: THREE.WebGLRenderTarget;
  private readonly cache = new Map<string, string>();
  private readonly queue: string[] = [];
  private readonly pixels = new Uint8Array(SIZE * SIZE * 4);
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly plaster = new THREE.MeshStandardMaterial({ color: '#efe3d0', roughness: 0.9 });
  private readonly holder = new THREE.Group();
  /** Called when a thumbnail became available. */
  onReady: (() => void) | null = null;

  constructor(private readonly content: ContentDB) {
    this.target = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 4, type: THREE.UnsignedByteType });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    this.canvas.width = this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d');
    this.scene.background = new THREE.Color('#f3e6d3');
    this.scene.add(new THREE.HemisphereLight('#fff6ea', '#b49a7c', 1.6));
    const key = new THREE.DirectionalLight('#fff1dc', 2.4);
    key.position.set(2, 3, 4);
    this.scene.add(key);
    this.scene.add(this.holder);
  }

  /** The thumbnail when it exists; otherwise '' and the opening is queued (onReady fires later). */
  request(defId: string): string {
    const hit = this.cache.get(defId);
    if (hit) return hit;
    if (!this.queue.includes(defId) && this.content.openings[defId]) this.queue.push(defId);
    return '';
  }

  get pending(): number { return this.queue.length; }

  /** Renders at most one queued thumbnail. Returns true when one was produced. */
  process(renderer: THREE.WebGLRenderer): boolean {
    const id = this.queue.shift();
    if (!id) return false;
    const def = this.content.openings[id];
    let url = '';
    if (def) {
      try { url = this.render(renderer, def); } catch (e) { console.warn('[render] opening thumbnail failed', id, e); }
    }
    if (!url) return false;
    this.cache.set(id, url);
    this.onReady?.();
    return true;
  }

  private render(renderer: THREE.WebGLRenderer, def: OpeningDef): string {
    for (const c of [...this.holder.children]) { c.removeFromParent(); (c as THREE.Mesh).geometry?.dispose(); }
    const cut = openingCutout(def);
    const half = cut.halfWidth;
    const T = WALL_THICKNESS;
    const W = Math.max(def.width + 0.9, 1.8);
    const box = (x0: number, x1: number, y0: number, y1: number) => {
      if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4) return;
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, T), this.plaster);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
      this.holder.add(m);
    };
    const top = Math.min(cut.top, WALL_H);
    box(-W / 2, -half, 0, WALL_H);
    box(half, W / 2, 0, WALL_H);
    box(-half, half, top, WALL_H);
    box(-half, half, 0, cut.bottom);
    const g = buildOpeningMesh(def, { flip: false });
    // show the leaf slightly open so a door reads as a door
    this.holder.add(g);
    this.holder.rotation.y = -0.5;
    this.holder.updateMatrixWorld(true);

    // frame the opening (plus a little wall) in a square view
    const midY = Math.min(WALL_H - 0.3, (cut.bottom + top) / 2 + (cut.bottom > 0 ? 0.1 : 0.25));
    const span = Math.max(top - cut.bottom + 0.9, def.width + 0.9, 1.6);
    this.camera.left = -span / 2; this.camera.right = span / 2; this.camera.top = span / 2; this.camera.bottom = -span / 2;
    this.camera.position.set(0.9, midY + 0.35, 5);
    this.camera.lookAt(0, midY, 0);
    this.camera.updateProjectionMatrix();

    const prevTarget = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    renderer.readRenderTargetPixels(this.target, 0, 0, SIZE, SIZE, this.pixels);
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.enabled = prevShadow;
    if (!this.ctx) return '';
    const img = this.ctx.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) {
      const src = (SIZE - 1 - y) * SIZE * 4;
      img.data.set(this.pixels.subarray(src, src + SIZE * 4), y * SIZE * 4);
    }
    this.ctx.putImageData(img, 0, 0);
    return this.canvas.toDataURL('image/png');
  }

  dispose(): void {
    this.target.dispose();
    this.plaster.dispose();
    this.cache.clear();
    this.queue.length = 0;
  }
}
