// Portraits: a person's head and shoulders rendered into a small offscreen render target and returned as a
// PNG data URL, cached by appearance + outfit. One reusable CharacterView per body frame; at most one portrait
// is rendered per frame (requests queue) so a household strip never stalls the game.

import * as THREE from 'three';
import type { CharacterAssets } from '../characters/assets';
import { CharacterView } from '../characters/CharacterView';
import type { ContentDB } from '../content/types';
import type { Appearance, BodyFrame, Outfit } from '../core/types';

const SIZE = 128;
const CACHE_LIMIT = 200;

interface Job { key: string; appearance: Appearance; outfit: Outfit; resolve: (url: string) => void }

export function portraitKey(appearance: Appearance, outfit: Outfit): string {
  const s = JSON.stringify([appearance, outfit.layers, outfit.accessories]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `${(h >>> 0).toString(36)}:${s.length}`;
}

export class PortraitRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(24, 1, 0.1, 20);
  private readonly target: THREE.WebGLRenderTarget;
  private readonly views = new Map<BodyFrame, CharacterView>();
  private readonly cache = new Map<string, string>();
  private readonly queue: Job[] = [];
  private readonly pixels = new Uint8Array(SIZE * SIZE * 4);
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly head = new THREE.Vector3();

  constructor(private readonly assets: CharacterAssets, private readonly content: ContentDB) {
    this.target = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 4, type: THREE.UnsignedByteType });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    this.canvas.width = this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d');
    this.scene.background = new THREE.Color('#f3e6d3');
    this.scene.add(new THREE.HemisphereLight('#fff6ea', '#b49a7c', 1.5));
    const key = new THREE.DirectionalLight('#fff1dc', 2.6);
    key.position.set(1.5, 2.5, 3);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#ffe2c0', 1.0);
    rim.position.set(-2, 2, -2);
    this.scene.add(rim);
  }

  cached(key: string): string | undefined { return this.cache.get(key); }

  /** Queues a portrait; resolves with the data URL (immediately when cached). */
  request(appearance: Appearance, outfit: Outfit): Promise<string> {
    const key = portraitKey(appearance, outfit);
    const hit = this.cache.get(key);
    if (hit) return Promise.resolve(hit);
    const existing = this.queue.find((j) => j.key === key);
    if (existing) {
      return new Promise((res) => { const prev = existing.resolve; existing.resolve = (u) => { prev(u); res(u); }; });
    }
    return new Promise((resolve) => { this.queue.push({ key, appearance: structuredClone(appearance), outfit: structuredClone(outfit), resolve }); });
  }

  get pending(): number { return this.queue.length; }

  /** Renders at most one queued portrait. Returns true when one was produced. */
  process(renderer: THREE.WebGLRenderer): boolean {
    const job = this.queue.shift();
    if (!job) return false;
    let url = '';
    try {
      url = this.render(renderer, job.appearance, job.outfit);
    } catch (e) {
      console.warn('[render] portrait failed', e);
    }
    if (url) {
      this.cache.set(job.key, url);
      if (this.cache.size > CACHE_LIMIT) { const first = this.cache.keys().next().value; if (first !== undefined) this.cache.delete(first); }
    }
    job.resolve(url);
    return !!url;
  }

  private viewFor(appearance: Appearance, outfit: Outfit): CharacterView {
    let v = this.views.get(appearance.frame);
    if (!v) {
      v = new CharacterView(this.assets, this.content, appearance, outfit);
      v.root.traverse((o) => { o.frustumCulled = false; });
      this.views.set(appearance.frame, v);
      this.scene.add(v.root);
    } else {
      v.setAppearance(appearance);
      v.setOutfit(outfit);
    }
    for (const [f, other] of this.views) other.root.visible = f === appearance.frame;
    v.play('idle', { fade: 0, posture: 'standing' });
    v.update(0.6);
    return v;
  }

  private render(renderer: THREE.WebGLRenderer, appearance: Appearance, outfit: Outfit): string {
    const v = this.viewFor(appearance, outfit);
    v.root.position.set(0, 0, 0);
    v.root.rotation.y = 0.25;
    v.root.updateMatrixWorld(true);
    v.headTop(this.head);
    const lookY = this.head.y - 0.2;
    this.camera.position.set(0.18, lookY + 0.06, 1.55);
    this.camera.lookAt(0, lookY - 0.02, 0);
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
    // flip rows (GL origin is bottom-left)
    for (let y = 0; y < SIZE; y++) {
      const src = (SIZE - 1 - y) * SIZE * 4;
      img.data.set(this.pixels.subarray(src, src + SIZE * 4), y * SIZE * 4);
    }
    this.ctx.putImageData(img, 0, 0);
    return this.canvas.toDataURL('image/png');
  }

  dispose(): void {
    for (const v of this.views.values()) v.dispose();
    this.views.clear();
    this.target.dispose();
    for (const j of this.queue.splice(0)) j.resolve('');
  }
}
