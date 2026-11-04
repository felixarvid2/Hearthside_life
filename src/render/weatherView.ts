// Milestone 12: rain streaks and snowflakes as one cheap THREE.Points cloud that follows the camera. The count is
// capped at 1500 on desktop and 600 on touch devices, and the whole mesh is hidden for clear/cloudy weather, when the
// weatherEffects setting is off, or when reduced motion is on (the light tint from render/lighting.ts stays).
// Pure view: nothing here touches the world state or the simulation RNG.

import * as THREE from 'three';
import type { WeatherKind } from '../core/types';
import { hash01 } from './geo';

const DESKTOP_COUNT = 1500;
const TOUCH_COUNT = 600;
const SPAN = 30;
const HEIGHT = 34;

function touchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const points = navigator.maxTouchPoints ?? 0;
  if (points > 0) return true;
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/** A soft vertical streak (rain) or a round flake (snow), drawn once into a small canvas. */
function particleTexture(kind: 'rain' | 'snow'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = kind === 'rain' ? 16 : 32;
  c.height = kind === 'rain' ? 64 : 32;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);
  if (kind === 'rain') {
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(6, 0, 4, c.height);
  } else {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 15);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(16, 16, 15, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class WeatherView {
  readonly points: THREE.Points;
  private readonly count: number;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.PointsMaterial;
  private readonly rainTex = particleTexture('rain');
  private readonly snowTex = particleTexture('snow');
  private readonly pos: Float32Array;
  private readonly speed: Float32Array;
  private kind: WeatherKind = 'clear';

  constructor() {
    this.count = touchDevice() ? TOUCH_COUNT : DESKTOP_COUNT;
    this.pos = new Float32Array(this.count * 3);
    this.speed = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      this.pos[i * 3] = (hash01(i * 7 + 1) * 2 - 1) * SPAN;
      this.pos[i * 3 + 1] = hash01(i * 11 + 3) * HEIGHT - 8;
      this.pos[i * 3 + 2] = (hash01(i * 13 + 5) * 2 - 1) * SPAN;
      this.speed[i] = 0.75 + hash01(i * 17 + 9) * 0.5;
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.material = new THREE.PointsMaterial({
      size: 0.55, map: this.rainTex, color: 0xbfd6e8, transparent: true, opacity: 0.65,
      depthWrite: false, sizeAttenuation: true, alphaTest: 0.04,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'weather';
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    this.points.visible = false;
  }

  /**
   * Shows rain or snow around the camera. `enabled` is false when weatherEffects is off or reduced motion is set;
   * clear and cloudy weather also hide the mesh (the lighting tint carries the weather instead).
   */
  update(kind: WeatherKind, dt: number, camera: THREE.Camera, enabled: boolean): void {
    const active = enabled && (kind === 'rain' || kind === 'snow');
    if (!active) { this.points.visible = false; return; }
    if (this.kind !== kind) {
      this.kind = kind;
      const rain = kind === 'rain';
      this.material.map = rain ? this.rainTex : this.snowTex;
      this.material.size = rain ? 0.55 : 0.2;
      this.material.color.set(rain ? 0xbfd6e8 : 0xffffff);
      this.material.opacity = rain ? 0.65 : 0.9;
      this.material.needsUpdate = true;
    }
    this.points.visible = true;
    // The cloud is centred on the camera every frame: particles live in a local box around the viewer.
    this.points.position.copy(camera.position);
    const step = Math.min(dt, 0.05); // a paused tab or a long frame must not fling every drop to the ground
    const rain = kind === 'rain';
    const fall = rain ? 30 : 2.4;
    const drift = rain ? 0.6 : 1.6;
    const span = SPAN * 2;
    for (let i = 0; i < this.count; i++) {
      const j = i * 3;
      this.pos[j + 1]! -= fall * this.speed[i]! * step;
      if (!rain) this.pos[j]! += Math.sin((this.pos[j + 1]! + i) * 0.35) * drift * step;
      if (this.pos[j + 1]! < -8) {
        // recycle at the top; the horizontal spot is deterministic per particle and cycle
        this.pos[j + 1]! += HEIGHT;
        this.pos[j] = (((this.pos[j]! / span + 0.5) + 0.37) % 1 - 0.5) * span;
        this.pos[j + 2] = hash01(i * 23 + Math.round(this.pos[j + 1]! * 7)) * span - SPAN;
      }
    }
    this.geometry.getAttribute('position').needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.rainTex.dispose();
    this.snowTex.dispose();
  }
}
