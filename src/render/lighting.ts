// Day/night lighting tied to the game clock: hemisphere + directional sun (warm day, golden evening, blue
// night), background/fog colour, optional shadows focused on the lot, and a night factor for lamp glow.

import * as THREE from 'three';

interface Key { h: number; sky: string; ground: string; hemi: number; sun: string; sunI: number; bg: string; exposure: number }

// Keyframes by hour of day (wrap around midnight). Night stays readable: blue, not black.
const KEYS: Key[] = [
  { h: 0, sky: '#8ea3d6', ground: '#3e3a52', hemi: 0.85, sun: '#9fb4ff', sunI: 0.45, bg: '#26304a', exposure: 1.0 },
  { h: 5, sky: '#97a8d8', ground: '#4a4458', hemi: 0.9, sun: '#a9b8ff', sunI: 0.5, bg: '#2f3a57', exposure: 1.0 },
  { h: 6.5, sky: '#f5c9b0', ground: '#8a7a6a', hemi: 1.05, sun: '#ffc79a', sunI: 1.3, bg: '#e9cdb8', exposure: 1.05 },
  { h: 9, sky: '#fff3e2', ground: '#a69276', hemi: 1.25, sun: '#fff1dc', sunI: 2.4, bg: '#efe7da', exposure: 1.1 },
  { h: 15, sky: '#fff3e2', ground: '#a69276', hemi: 1.25, sun: '#fff0d6', sunI: 2.4, bg: '#efe7da', exposure: 1.1 },
  { h: 18, sky: '#ffd8b0', ground: '#9a7f62', hemi: 1.15, sun: '#ffb36b', sunI: 2.0, bg: '#f0d5b8', exposure: 1.1 },
  { h: 19.5, sky: '#e6a98e', ground: '#6e5a58', hemi: 1.0, sun: '#ff9a62', sunI: 1.1, bg: '#b88d86', exposure: 1.05 },
  { h: 21, sky: '#8ea3d6', ground: '#3e3a52', hemi: 0.85, sun: '#9fb4ff', sunI: 0.45, bg: '#2a3350', exposure: 1.0 },
  { h: 24, sky: '#8ea3d6', ground: '#3e3a52', hemi: 0.85, sun: '#9fb4ff', sunI: 0.45, bg: '#26304a', exposure: 1.0 },
];

const cA = new THREE.Color(), cB = new THREE.Color();
function lerpColor(out: THREE.Color, a: string, b: string, t: number): THREE.Color {
  return out.copy(cA.set(a)).lerp(cB.set(b), t);
}

export class Lighting {
  readonly hemi = new THREE.HemisphereLight(0xfff3e2, 0xa69276, 1.2);
  readonly sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
  readonly fill = new THREE.DirectionalLight(0xdfe8ff, 0.35);
  readonly background = new THREE.Color(0xefe7da);
  night = 0;
  exposure = 1.1;
  private readonly centre = new THREE.Vector3(12, 0, 12);


  constructor(scene: THREE.Scene) {
    this.sun.castShadow = false;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    scene.add(this.hemi, this.sun, this.sun.target, this.fill, this.fill.target);
  }

  /** Lot centre and radius the sun's shadow camera covers. */
  setFocus(x: number, z: number, radius: number): void {
    this.centre.set(x, 0, z);

    const cam = this.sun.shadow.camera;
    cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius;
    cam.near = 1; cam.far = 80;
    cam.updateProjectionMatrix();
  }

  setShadows(on: boolean): void { this.sun.castShadow = on; }

  /** Updates colours and the sun position for an hour of day (0..24). */
  update(hour: number): void {
    const h = ((hour % 24) + 24) % 24;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1]!.h <= h) i++;
    const a = KEYS[i]!, b = KEYS[i + 1]!;
    const t = b.h > a.h ? (h - a.h) / (b.h - a.h) : 0;
    const s = t * t * (3 - 2 * t);
    lerpColor(this.hemi.color, a.sky, b.sky, s);
    lerpColor(this.hemi.groundColor, a.ground, b.ground, s);
    this.hemi.intensity = a.hemi + (b.hemi - a.hemi) * s;
    lerpColor(this.sun.color, a.sun, b.sun, s);
    this.sun.intensity = a.sunI + (b.sunI - a.sunI) * s;
    lerpColor(this.background, a.bg, b.bg, s);
    this.exposure = a.exposure + (b.exposure - a.exposure) * s;
    // sun arc: rises in the east (+x) at 6, highest at 13, sets in the west at 20; the moon light at night
    // comes from a fixed high angle so shadows stay readable
    const day = h >= 6 && h <= 20;
    const az = day ? Math.PI * ((h - 6) / 14) : Math.PI * 0.35;
    const el = day ? Math.max(0.22, Math.sin(Math.PI * (h - 6) / 14)) * 1.05 : 0.9;
    const dist = 40;
    this.sun.position.set(
      this.centre.x + Math.cos(az) * Math.cos(el) * dist * 0.9 + 6,
      this.centre.y + Math.sin(el) * dist,
      this.centre.z + Math.sin(az) * Math.cos(el) * dist * 0.35 + 14,
    );
    this.sun.target.position.copy(this.centre);
    this.fill.position.set(this.centre.x - 20, 15, this.centre.z - 18);
    this.fill.target.position.copy(this.centre);
    this.fill.intensity = day ? 0.35 : 0.2;
    // night factor for lamps: 0 in daylight, 1 at night, ramps at dusk and dawn
    this.night = h >= 20.5 || h < 5.5 ? 1 : h >= 18.5 ? (h - 18.5) / 2 : h < 7 ? (7 - h) / 1.5 : 0;
    this.night = Math.max(0, Math.min(1, this.night));
  }
}
