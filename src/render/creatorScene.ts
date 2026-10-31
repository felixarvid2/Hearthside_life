// Character creator preview: a soft studio backdrop, three-point lighting and a CharacterView of the shown
// draft. Views (front / side / back / face) ease the camera; rotate turns the person, zoom moves closer.
// The person is framed inside the uncovered canvas area reported through setInsets.

import * as THREE from 'three';
import type { AnimId } from '../core/anim';
import type { CharacterAssets } from '../characters/assets';
import { CharacterView } from '../characters/CharacterView';
import { outfitFor } from '../characters/outfits';
import type { ContentDB } from '../content/types';
import type { PersonDraft } from '../core/drafts';
import type { CreatorPreviewOptions } from '../game/api';
import type { Insets } from './cameraRig';

type View = 'front' | 'side' | 'back' | 'face';

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

function backdropTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#f6ede0');
  g.addColorStop(0.6, '#efe2cf');
  g.addColorStop(1, '#e6d4bd');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class CreatorScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
  private view: CharacterView | null = null;
  private frameKey = '';
  private appearanceKey = '';
  private outfitKey = '';
  private anim: AnimId = 'idle';
  private yaw = 0;
  private targetYaw = 0;
  private zoomF = 1;
  private viewName: View = 'front';
  /** Camera state eased between views: look-at height, distance factor. */
  private cam = { y: 0.95, h: 1.95, ty: 0.95, th: 1.95, t: 1 };
  private insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 };
  private width = 1;
  private height = 1;
  reducedMotion = false;
  private readonly bgTex = backdropTexture();

  constructor(private readonly assets: CharacterAssets, private readonly content: ContentDB) {
    const s = this.scene;
    s.background = new THREE.Color('#efe4d4');
    // curved backdrop
    const back = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 9, 12, 48, 1, true, -Math.PI * 0.75, Math.PI * 1.5),
      new THREE.MeshBasicMaterial({ map: this.bgTex, side: THREE.BackSide }),
    );
    back.position.set(0, 5.6, 0);
    back.rotation.y = Math.PI;
    s.add(back);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e8d9c3', roughness: 0.95 }));
    floor.receiveShadow = true;
    s.add(floor);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.06, 48), new THREE.MeshStandardMaterial({ color: '#f7efe3', roughness: 0.7 }));
    disc.position.y = 0.03;
    disc.receiveShadow = true;
    s.add(disc);
    // three-point lighting
    s.add(new THREE.HemisphereLight('#fff6ea', '#b49a7c', 1.15));
    const key = new THREE.DirectionalLight('#fff1dc', 2.4);
    key.position.set(2.5, 4, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera; sc.left = -1.5; sc.right = 1.5; sc.top = 2.4; sc.bottom = -0.4; sc.near = 0.5; sc.far = 12;
    key.shadow.bias = -0.0006;
    s.add(key);
    const fill = new THREE.DirectionalLight('#dfe8ff', 0.7);
    fill.position.set(-3.5, 2, 2.5);
    s.add(fill);
    const rim = new THREE.DirectionalLight('#ffe2c0', 1.4);
    rim.position.set(-1, 3, -4);
    s.add(rim);
  }

  setSize(w: number, h: number): void { this.width = w; this.height = h; }
  setInsets(i: Insets): void { this.insets = { ...i }; }

  show(person: PersonDraft, opts: CreatorPreviewOptions): void {
    const outfit = outfitFor(person, opts.category);
    const ak = JSON.stringify(person.appearance);
    const ok = JSON.stringify(outfit);
    if (!this.view) {
      this.view = new CharacterView(this.assets, this.content, person.appearance, outfit);
      this.view.root.traverse((o) => { o.castShadow = true; o.frustumCulled = false; });
      this.scene.add(this.view.root);
      this.appearanceKey = ak;
      this.outfitKey = ok;
      this.frameKey = person.appearance.frame;
    } else {
      if (ak !== this.appearanceKey) { this.view.setAppearance(person.appearance); this.appearanceKey = ak; }
      if (ok !== this.outfitKey) { this.view.setOutfit(outfit); this.outfitKey = ok; }
      if (person.appearance.frame !== this.frameKey) { this.frameKey = person.appearance.frame; this.view.root.traverse((o) => { o.castShadow = true; o.frustumCulled = false; }); }
    }
    if (opts.anim !== this.anim || !this.view) {
      this.anim = opts.anim;
      this.view.play(opts.anim, { fade: 0.25, posture: 'standing' });
    }
  }

  /** Drops the preview person (leaving the creator). */
  hide(): void {
    this.view?.dispose();
    this.view = null;
    this.appearanceKey = this.outfitKey = '';
    this.anim = 'idle';
  }

  get active(): boolean { return this.view !== null; }

  setView(v: View): void {
    this.viewName = v;
    const yaw = v === 'side' ? Math.PI / 2 : v === 'back' ? Math.PI : 0;
    // keep turning the short way from the current yaw
    const k = Math.round((this.targetYaw - yaw) / (Math.PI * 2));
    this.targetYaw = yaw + k * Math.PI * 2;
    this.cam.ty = v === 'face' ? 1.56 : 0.95;
    this.cam.th = v === 'face' ? 0.8 : 1.95;
    this.cam.t = this.reducedMotion ? 1 : 0;
    if (this.reducedMotion) { this.yaw = this.targetYaw; this.cam.y = this.cam.ty; this.cam.h = this.cam.th; }
    this.zoomF = 1;
  }

  rotate(d: number): void {
    if (!Number.isFinite(d)) return;
    this.targetYaw += d;
    if (this.reducedMotion) this.yaw = this.targetYaw;
  }

  zoom(f: number): void {
    if (!Number.isFinite(f) || f <= 0) return;
    this.zoomF = Math.max(0.35, Math.min(2.2, this.zoomF / f));
  }

  update(dt: number): void {
    const v = this.view;
    if (!v) return;
    v.update(dt);
    this.yaw += (this.targetYaw - this.yaw) * Math.min(1, dt * 8);
    v.root.rotation.y = this.yaw;
    v.root.position.set(0, 0.06, 0);
    if (this.cam.t < 1) {
      const t0 = this.cam.t;
      this.cam.t = Math.min(1, t0 + dt / 0.5);
      const e0 = ease(t0), e1 = ease(this.cam.t);
      const k = e0 >= 1 ? 1 : (e1 - e0) / (1 - e0);
      this.cam.y += (this.cam.ty - this.cam.y) * k;
      this.cam.h += (this.cam.th - this.cam.h) * k;
    }
    // frame the visible height `h * zoom` (metres) inside the uncovered area
    const W = this.width, H = this.height, i = this.insets;
    const vw = Math.max(40, W - i.left - i.right), vh = Math.max(40, H - i.top - i.bottom);
    const cam = this.camera;
    cam.aspect = W / H;
    const fovRad = cam.fov * Math.PI / 180;
    const span = this.cam.h * this.zoomF;
    // the visible area's height in canvas fraction; fit horizontally on narrow areas
    const fitH = span / (vh / H);
    const fitW = (span * 0.62) / (vw / W) / cam.aspect;
    const fullH = Math.max(fitH, fitW);
    const dist = fullH / (2 * Math.tan(fovRad / 2));
    cam.position.set(0, this.cam.y + 0.12, dist);
    cam.lookAt(0, this.cam.y, 0);
    const cx = (i.left + (W - i.right)) / 2, cy = (i.top + (H - i.bottom)) / 2;
    cam.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    cam.updateProjectionMatrix();
  }

  get viewMode(): View { return this.viewName; }

  dispose(): void {
    this.hide();
    this.bgTex.dispose();
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
  }
}
