// Orthographic dollhouse camera: fixed pitch, yaw in 90-degree steps (45 + k * 90 degrees, eased turns),
// zoom in screen pixels per metre, pan clamped to the lot, and an asymmetric frustum so the focus point sits
// in the middle of the screen area NOT covered by UI panels (setInsets).
//
// Yaw convention: the camera looks from target + (sin yaw, ., cos yaw) toward the target. Yaw 45 degrees puts
// the camera south-east of the lot (front doors face south, +z).

import * as THREE from 'three';

export interface Insets { left: number; right: number; top: number; bottom: number }

const DEG = Math.PI / 180;
export const PITCH = 37 * DEG;
const CAM_DIST = 60;
export const MIN_PPM = 14;
export const MAX_PPM = 150;
/** Default zoom: a 1.8 m person is ~95 px tall (projected height 1.8 * cos(pitch)). */
export const DEFAULT_PPM = 66;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class CameraRig {
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  /** Point on the ground the camera looks at (kept in the lot). */
  readonly target = new THREE.Vector3(12, 0, 12);
  /** Yaw step index; yaw = 45 + k * 90 degrees. */
  k = 0;
  yaw = 45 * DEG;
  ppm = DEFAULT_PPM;
  width = 1;
  height = 1;
  insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 };
  bounds = { x0: -2, z0: -2, x1: 26, z1: 26 };
  reducedMotion = false;
  private turn: { from: number; to: number; t: number; dur: number } | null = null;
  private glide: { from: THREE.Vector3; to: THREE.Vector3; ppmFrom: number; ppmTo: number; t: number; dur: number } | null = null;
  private dirty = true;
  /** Increments whenever the view changed (overlay and picking caches). */
  version = 0;
  onYawStep: ((k: number) => void) | null = null;

  private readonly tmpV = new THREE.Vector3();
  private readonly tmpV2 = new THREE.Vector3();
  private readonly ray = new THREE.Ray();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  setSize(w: number, h: number): void { this.width = w; this.height = h; this.dirty = true; }

  setInsets(i: Insets): void {
    const clamp = (v: number, max: number) => Math.max(0, Math.min(max, Number.isFinite(v) ? v : 0));
    const n = { left: clamp(i.left, this.width * 0.7), right: clamp(i.right, this.width * 0.7), top: clamp(i.top, this.height * 0.7), bottom: clamp(i.bottom, this.height * 0.75) };
    if (n.left === this.insets.left && n.right === this.insets.right && n.top === this.insets.top && n.bottom === this.insets.bottom) return;
    this.insets = n;
    this.dirty = true;
  }

  setBounds(x0: number, z0: number, x1: number, z1: number): void {
    this.bounds = { x0, z0, x1, z1 };
    this.clampTarget();
  }

  /** Visible (uncovered) area size in CSS px. */
  visibleSize(): { w: number; h: number } {
    return { w: Math.max(40, this.width - this.insets.left - this.insets.right), h: Math.max(40, this.height - this.insets.top - this.insets.bottom) };
  }

  rotate(dir: 1 | -1): void {
    const from = this.yaw;
    this.k = (((this.k + dir) % 4) + 4) % 4;
    const to = from + dir * 90 * DEG;
    if (this.reducedMotion) { this.yaw = to; this.turn = null; }
    else this.turn = { from, to, t: 0, dur: 0.42 };
    this.dirty = true;
    this.onYawStep?.(this.k);
  }

  setYawStep(k: number): void {
    this.k = ((k % 4) + 4) % 4;
    this.yaw = (45 + this.k * 90) * DEG;
    this.turn = null;
    this.dirty = true;
    this.onYawStep?.(this.k);
  }

  /** Horizontal unit vector from the target toward the camera. */
  viewDir(out: THREE.Vector3): THREE.Vector3 { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  /** Horizontal unit direction toward the camera for the yaw step (ignores an ongoing turn). */
  stepDir(out: THREE.Vector3): THREE.Vector3 {
    const y = (45 + this.k * 90) * DEG;
    return out.set(Math.sin(y), 0, Math.cos(y));
  }

  setZoom(ppm: number): void {
    this.ppm = Math.max(MIN_PPM, Math.min(MAX_PPM, ppm));
    this.dirty = true;
  }

  /** Zoom keeping the ground point under a screen position fixed. */
  zoomAt(factor: number, sx: number, sy: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.glide = null;
    this.update(0);
    const before = this.groundAt(sx, sy, this.tmpV2);
    this.setZoom(this.ppm * factor);
    this.update(0);
    const after = this.groundAt(sx, sy, this.tmpV);
    if (before && after) {
      this.target.x += before.x - after.x;
      this.target.z += before.z - after.z;
      this.clampTarget();
    }
    this.dirty = true;
  }

  pan(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.glide = null;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    // screen right in world: (c, 0, -s); screen up on the ground: away from the camera (-s, 0, -c) scaled by 1/sin(pitch)
    const mx = dx / this.ppm, my = dy / this.ppm / Math.sin(PITCH);
    // content follows the pointer: the target moves against screen-right and toward screen-up
    this.target.x += -c * mx - s * my;
    this.target.z += s * mx - c * my;
    this.clampTarget();
    this.dirty = true;
  }

  /** Eases target (and optionally zoom) to a point. */
  glideTo(x: number, z: number, ppm?: number, dur = 0.6): void {
    const to = new THREE.Vector3(x, 0, z);
    to.x = Math.max(this.bounds.x0, Math.min(this.bounds.x1, to.x));
    to.z = Math.max(this.bounds.z0, Math.min(this.bounds.z1, to.z));
    const ppmTo = ppm === undefined ? this.ppm : Math.max(MIN_PPM, Math.min(MAX_PPM, ppm));
    if (this.reducedMotion || dur <= 0) {
      this.target.copy(to);
      this.ppm = ppmTo;
      this.glide = null;
      this.dirty = true;
      return;
    }
    this.glide = { from: this.target.clone(), to, ppmFrom: this.ppm, ppmTo, t: 0, dur };
  }

  /** Zoom that fits a box of the given ground extent into the visible area. */
  fitPpm(sizeX: number, sizeZ: number, height = 2.8, margin = 1.1): number {
    const v = this.visibleSize();
    // projected extent of a rotated square-ish box: diagonal width, depth foreshortened by sin(pitch)
    const diag = (sizeX + sizeZ) * Math.SQRT1_2;
    const wM = diag * margin;
    const hM = (diag * Math.sin(PITCH) + height * Math.cos(PITCH)) * margin;
    return Math.max(MIN_PPM, Math.min(MAX_PPM, Math.min(v.w / wM, v.h / hM)));
  }

  isAnimating(): boolean { return this.turn !== null || this.glide !== null; }

  private clampTarget(): void {
    this.target.x = Math.max(this.bounds.x0, Math.min(this.bounds.x1, this.target.x));
    this.target.z = Math.max(this.bounds.z0, Math.min(this.bounds.z1, this.target.z));
  }

  /** Advances eased motion and refreshes the camera matrices. Returns true when the view changed. */
  update(dt: number): boolean {
    if (this.turn) {
      const tr = this.turn;
      tr.t = Math.min(1, tr.t + dt / tr.dur);
      this.yaw = tr.from + (tr.to - tr.from) * ease(tr.t);
      if (tr.t >= 1) { this.yaw = tr.to; this.turn = null; }
      this.dirty = true;
    }
    if (this.glide) {
      const g = this.glide;
      g.t = Math.min(1, g.t + dt / g.dur);
      const e = ease(g.t);
      this.target.lerpVectors(g.from, g.to, e);
      this.ppm = g.ppmFrom + (g.ppmTo - g.ppmFrom) * e;
      if (g.t >= 1) this.glide = null;
      this.dirty = true;
    }
    if (!this.dirty) return false;
    this.dirty = false;
    const cam = this.camera;
    const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    cam.position.set(
      this.target.x + Math.sin(this.yaw) * cp * CAM_DIST,
      this.target.y + sp * CAM_DIST,
      this.target.z + Math.cos(this.yaw) * cp * CAM_DIST,
    );
    cam.up.set(0, 1, 0);
    cam.lookAt(this.target);
    // the target projects to the centre of the uncovered area
    const W = this.width, H = this.height, i = this.insets;
    const cx = (i.left + (W - i.right)) / 2;
    const cy = (i.top + (H - i.bottom)) / 2;
    cam.left = -cx / this.ppm;
    cam.right = (W - cx) / this.ppm;
    cam.top = cy / this.ppm;
    cam.bottom = -(H - cy) / this.ppm;
    cam.near = 1;
    cam.far = CAM_DIST * 2.2;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    this.version++;
    return true;
  }

  /** Ray through a screen point (CSS px relative to the canvas). */
  rayAt(sx: number, sy: number, out: THREE.Ray = this.ray): THREE.Ray {
    const ndcX = (sx / this.width) * 2 - 1;
    const ndcY = -(sy / this.height) * 2 + 1;
    out.origin.set(ndcX, ndcY, -1).unproject(this.camera);
    out.direction.set(0, 0, -1).transformDirection(this.camera.matrixWorld);
    return out;
  }

  /** Ground point (y = level height) under a screen point. */
  groundAt(sx: number, sy: number, out: THREE.Vector3, y = 0): THREE.Vector3 | null {
    this.ground.constant = -y;
    return this.rayAt(sx, sy).intersectPlane(this.ground, out);
  }

  /** CSS px position of a world point relative to the canvas. */
  project(x: number, y: number, z: number, out: { x: number; y: number; visible: boolean }): { x: number; y: number; visible: boolean } {
    const v = this.tmpV.set(x, y, z).project(this.camera);
    out.x = (v.x + 1) / 2 * this.width;
    out.y = (1 - v.y) / 2 * this.height;
    out.visible = v.z >= -1 && v.z <= 1 && out.x >= -20 && out.y >= -20 && out.x <= this.width + 20 && out.y <= this.height + 20;
    return out;
  }
}
