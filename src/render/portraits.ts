// Portraits: a person's head and shoulders rendered into a small offscreen render target and returned as a
// PNG data URL, cached by appearance + outfit. One reusable CharacterView per body frame; at most one portrait
// is rendered per frame (requests queue) so a household strip never stalls the game.

import * as THREE from 'three';
import { isMeshHair } from '../characters/aiHair';
import type { CharacterAssets } from '../characters/assets';
import { STAGE_HEIGHTS, loadAiHair } from '../characters/assets';
import { CharacterView } from '../characters/CharacterView';
import type { ContentDB } from '../content/types';
import type { Appearance, LifeStage, Outfit } from '../core/types';

const SIZE = 128;
const CACHE_LIMIT = 200;

interface Job { key: string; appearance: Appearance; outfit: Outfit; lifeStage: LifeStage; resolve: (url: string) => void }

/** `lifeStage` is part of the key for the stages that have their own body (adults keep the keys they always had). */
export function portraitKey(appearance: Appearance, outfit: Outfit, lifeStage: LifeStage = 'adult'): string {
  const s = JSON.stringify([appearance, outfit.layers, outfit.accessories]) + (lifeStage === 'adult' ? '' : lifeStage);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `${(h >>> 0).toString(36)}:${s.length}`;
}

export class PortraitRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(24, 1, 0.1, 20);
  private readonly target: THREE.WebGLRenderTarget;
  private readonly views = new Map<string, CharacterView>();
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
  request(appearance: Appearance, outfit: Outfit, lifeStage: LifeStage = 'adult'): Promise<string> {
    const key = portraitKey(appearance, outfit, lifeStage);
    const hit = this.cache.get(key);
    if (hit) return Promise.resolve(hit);
    const existing = this.queue.find((j) => j.key === key);
    if (existing) {
      return new Promise((res) => { const prev = existing.resolve; existing.resolve = (u) => { prev(u); res(u); }; });
    }
    const queued = () => new Promise<string>((resolve) => { this.queue.push({ key, appearance: structuredClone(appearance), outfit: structuredClone(outfit), lifeStage, resolve }); });
    // a generated hairstyle is drawn as soon as its GLB is loaded: wait for it so the cached portrait never shows the stand-in
    const def = this.content.hair[appearance.hair.styleId];
    if (isMeshHair(def) && !this.assets.aiHair?.has(def.id)) return loadAiHair(this.assets, def.id, def.build.asset as string).then(queued);
    return queued();
  }

  get pending(): number { return this.queue.length; }

  /** Renders at most one queued portrait. Returns true when one was produced. */
  process(renderer: THREE.WebGLRenderer): boolean {
    const job = this.queue.shift();
    if (!job) return false;
    let url = '';
    try {
      url = this.render(renderer, job.appearance, job.outfit, job.lifeStage);
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

  private viewFor(appearance: Appearance, outfit: Outfit, lifeStage: LifeStage): CharacterView {
    // one reusable view per body frame and life stage (a stage body is another skeleton and mesh)
    const id = `${appearance.frame}:${lifeStage}`;
    let v = this.views.get(id);
    if (!v) {
      v = new CharacterView(this.assets, this.content, appearance, outfit, lifeStage);
      v.setBabyUpright(true);
      v.root.traverse((o) => { o.frustumCulled = false; });
      this.views.set(id, v);
      this.scene.add(v.root);
    } else {
      v.setAppearance(appearance, lifeStage);
      v.setOutfit(outfit);
    }
    for (const [f, other] of this.views) other.root.visible = f === id;
    v.play('idle', { fade: 0, posture: 'standing' });
    v.update(0.6);
    return v;
  }

  private render(renderer: THREE.WebGLRenderer, appearance: Appearance, outfit: Outfit, lifeStage: LifeStage): string {
    const v = this.viewFor(appearance, outfit, lifeStage);
    v.root.position.set(0, -v.floorDrop, 0);
    v.root.rotation.y = 0.25;
    v.root.updateMatrixWorld(true);
    v.headTop(this.head);
    // smaller people are framed closer, so a child's head fills the portrait about as much as an adult's
    const rel = Math.max(0.45, (lifeStage === 'baby' ? 0.5 : STAGE_HEIGHTS[lifeStage]) / STAGE_HEIGHTS.adult);
    const lookY = this.head.y - 0.2 * rel;
    const dist = 1.55 * rel ** 0.8;
    this.camera.position.set(0.18 * rel, lookY + 0.06 * rel, dist);
    this.camera.lookAt(0, lookY - 0.02 * rel, 0);
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

  /** Drops the cached portraits and the reusable views (after the character style changed). */
  refreshStyle(): void {
    for (const v of this.views.values()) v.dispose();
    this.views.clear();
    this.cache.clear();
  }

  dispose(): void {
    for (const v of this.views.values()) v.dispose();
    this.views.clear();
    this.target.dispose();
    for (const j of this.queue.splice(0)) j.resolve('');
  }
}
