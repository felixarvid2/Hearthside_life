// Milestone 11.5 task S: the picture on the glass. One small quad per screen object (measured in
// content/screens.ts), attached to the object's own group so it follows its transform, level and
// cutaway visibility for free. Content comes from objectUse.ts (the running action) and is drawn
// from deterministic generators in screenPrograms.ts.
//
// Cost control: four pooled 256x160 canvases at most (nearest screens to the camera win); their
// textures are redrawn at most four times a second (once a second with reduced motion, half that
// on low quality) and only while the screen is in use and visible. Screens without a canvas show a
// shared static "on"/"off" texture. No lights: the glow is an additive quad on the emissive face.

import * as THREE from 'three';
import type { Id, Lot, WorldState } from '../core/types';
import { screenFor, screenModeFor, type ScreenDef, type ScreenMode } from '../content/screens';
import type { Quality } from './renderer';
import { objectUses } from './objectUse';
import {
  ScreenSlotPool,
  gameFrame,
  terminalLines,
  tvChannel,
  tvScene,
  tvTicker,
  typedCode,
  typedDocument,
  webScroll,
} from './screenPrograms';

const WIDTH = 256;
const HEIGHT = 160;

interface ScreenUse { mode: ScreenMode; progress: number; seed: string; title: string }

interface QuadEntry {
  id: Id;
  def: ScreenDef;
  root: THREE.Object3D | null;
  quad: THREE.Mesh;
  glow: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  mode: ScreenMode | 'off';
  use: ScreenUse | null;
  slot: number | null;
  /** Internal seconds since the view started; drives the redraw throttle. */
  lastDraw: number;
  /** What the slot currently shows (forces a redraw after a slot is handed over). */
  signature: string;
}

interface Slot {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  owner: Id | null;
  lastDraw: number;
}

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  return ctx ? { canvas, ctx } : null;
}

function textureFrom(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  return tex;
}

/** A page title for the web mode, so the picture reads as the thing the person is doing. */
function webTitle(interactionId: string): string {
  switch (interactionId) {
    case 'jobSearch': return 'Jobs · Hearthside';
    case 'adoptOnline': return 'Adoption agency';
    case 'researchOnline': return 'Research library';
    case 'phoneBills': return 'Bills and payments';
    case 'phoneJobs': return 'Careers';
    case 'phoneChat': case 'phoneInvite': case 'phoneDate': return 'Messages';
    case 'planEvent': return 'Plan an event';
    case 'callRepairperson': return 'Home services';
    default: return 'Home';
  }
}

export class ScreensView {
  private readonly entries = new Map<Id, QuadEntry>();
  private readonly pool = new ScreenSlotPool(4);
  private readonly slots: Slot[] = [];
  private readonly plane = new THREE.PlaneGeometry(1, 1);
  private readonly glowMaterial: THREE.MeshBasicMaterial;
  private readonly offTexture: THREE.Texture;
  private readonly computerOnTexture: THREE.Texture;
  private readonly tvOnTexture: THREE.Texture;
  private readonly staticTextures: THREE.Texture[] = [];
  private rootOf: (id: Id) => THREE.Object3D | null = () => null;
  private now = 0;
  private interval = 0.25;
  private reducedMotion = false;
  private readonly worldPos = new THREE.Vector3();
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  private readonly facing = new THREE.Vector3();
  private readonly live: QuadEntry[] = [];
  private readonly distances = new Map<Id, number>();

  constructor() {
    for (let i = 0; i < this.pool.max; i++) {
      const made = makeCanvas();
      if (!made) break;
      const texture = textureFrom(made.canvas);
      this.slots.push({ canvas: made.canvas, ctx: made.ctx, texture, owner: null, lastDraw: -1 });
    }
    this.offTexture = this.staticTexture(drawOff);
    this.computerOnTexture = this.staticTexture(drawComputerOn);
    this.tvOnTexture = this.staticTexture(drawTvOn);
    this.glowMaterial = new THREE.MeshBasicMaterial({
      map: this.staticTexture(drawGlow),
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
  }

  private staticTexture(draw: (ctx: CanvasRenderingContext2D) => void): THREE.Texture {
    const made = makeCanvas();
    if (!made) {
      // ScreensView only runs in a browser; keep a harmless 1x1 texture for non-DOM tooling.
      const tex = new THREE.DataTexture(new Uint8Array([12, 16, 22, 255]), 1, 1);
      tex.needsUpdate = true;
      this.staticTextures.push(tex);
      return tex;
    }
    draw(made.ctx);
    const tex = textureFrom(made.canvas);
    this.staticTextures.push(tex);
    return tex;
  }

  setQuality(quality: Quality): void {
    this.interval = quality === 'low' ? 0.5 : 0.25;
  }

  get count(): number { return this.entries.size; }

  /** Removes every quad (world cleared or lot switched). */
  clear(): void {
    for (const e of [...this.entries.values()]) this.removeEntry(e);
    this.pool.clear();
    this.live.length = 0;
  }

  /** Creates/updates the quads for a lot. `rootOf` returns the object's group (ObjectsView.rootOf). */
  sync(lot: Lot, rootOf: (id: Id) => THREE.Object3D | null): void {
    this.rootOf = rootOf;
    const wanted = new Set<Id>();
    for (const o of Object.values(lot.objects)) {
      const def = screenFor(o.defId);
      if (!def) continue;
      wanted.add(o.id);
      let e = this.entries.get(o.id);
      if (!e || e.def !== def) {
        if (e) this.removeEntry(e);
        e = this.makeEntry(o.id, def);
        this.entries.set(o.id, e);
      }
      this.place(e);
      this.attach(e);
    }
    for (const e of [...this.entries.values()]) if (!wanted.has(e.id)) this.removeEntry(e);
  }

  private makeEntry(id: Id, def: ScreenDef): QuadEntry {
    const material = new THREE.MeshBasicMaterial({ map: this.offTexture, toneMapped: false });
    const quad = new THREE.Mesh(this.plane, material);
    quad.name = `screen:${id}`;
    quad.renderOrder = 2;
    const glow = new THREE.Mesh(this.plane, this.glowMaterial);
    glow.name = `screenGlow:${id}`;
    glow.visible = false;
    glow.renderOrder = 1;
    const entry: QuadEntry = { id, def, root: null, quad, glow, material, mode: 'off', use: null, slot: null, lastDraw: -1, signature: '' };
    this.place(entry);
    return entry;
  }

  /** Positions the quad on the measured glass rectangle, in the object's rot-0 local space. */
  private place(e: QuadEntry): void {
    const d = e.def;
    this.facing.set(d.facing[0], d.facing[1], d.facing[2]).normalize();
    e.quad.position.set(
      d.centre[0] + this.facing.x * d.offset,
      d.centre[1] + this.facing.y * d.offset,
      d.centre[2] + this.facing.z * d.offset,
    );
    e.quad.quaternion.setFromUnitVectors(this.zAxis, this.facing);
    e.quad.scale.set(d.width, d.height, 1);
    e.glow.position.copy(e.quad.position).addScaledVector(this.facing, 0.002);
    e.glow.quaternion.copy(e.quad.quaternion);
    e.glow.scale.set(d.width * 1.16, d.height * 1.16, 1);
  }

  private attach(e: QuadEntry): void {
    const root = this.rootOf(e.id);
    if (e.root === root) return;
    e.quad.removeFromParent();
    e.glow.removeFromParent();
    e.root = root;
    if (root) root.add(e.glow, e.quad);
  }

  private removeEntry(e: QuadEntry): void {
    e.quad.removeFromParent();
    e.glow.removeFromParent();
    e.material.dispose();
    this.entries.delete(e.id);
    if (e.slot !== null) {
      const slot = this.slots[e.slot];
      if (slot && slot.owner === e.id) slot.owner = null;
    }
  }

  /**
   * Shows what each visible screen is doing. `dt` is real seconds, `gameMinutes` the game clock
   * (content advances with it), `focus` the camera target (nearest screens keep the canvases).
   */
  update(
    state: WorldState,
    lotId: Id,
    dt: number,
    reducedMotion: boolean,
    gameMinutes: number,
    focus: THREE.Vector3,
  ): void {
    this.now += dt;
    this.reducedMotion = reducedMotion;
    // Reduced motion: at most one redraw a second, and the pictures themselves hold still (see the
    // signature and the drawing code, which drop scrolling/bobbing when `reducedMotion` is set).
    const interval = reducedMotion ? 1 : this.interval;
    const uses = objectUses(state, lotId);
    this.live.length = 0;
    this.distances.clear();

    for (const e of this.entries.values()) {
      this.attach(e); // the object group is recreated when its model finishes loading
      const root = e.root;
      // Walking to the object (prepare) does not light the screen: someone who has not sat down yet
      // is not using it. `apply` is the perform-like phase some behaviours use for their work.
      const use = uses.get(e.id)?.find((u) => u.phase === 'perform' || u.phase === 'apply');
      const visible = !!root?.visible;
      if (!use || !visible) {
        this.setOff(e);
        continue;
      }
      const mode = screenModeFor(use.interactionId);
      const progress = use.duration && use.duration > 0 ? Math.max(0, Math.min(1, use.elapsed / use.duration)) : 0;
      const title = webTitle(use.interactionId);
      e.use = { mode, progress, seed: use.actionId, title };
      e.mode = mode;
      e.quad.getWorldPosition(this.worldPos);
      this.distances.set(e.id, this.worldPos.distanceToSquared(focus));
      this.live.push(e);
    }

    // nearest to the camera first, so the four live canvases go to the screens the player sees best
    this.live.sort((a, b) => (this.distances.get(a.id) ?? 0) - (this.distances.get(b.id) ?? 0));
    const assigned = this.pool.assign(this.live.map((e) => e.id));

    for (const e of this.entries.values()) {
      if (e.mode === 'off') continue;
      const slotIndex = assigned.get(e.id) ?? null;
      const slot = slotIndex === null ? null : this.slots[slotIndex];
      if (!slot) {
        // more in-use screens than canvases: a cheap static "on" picture is enough
        e.slot = null;
        if (e.material.map !== this.onTexture(e.def.kind)) {
          e.material.map = this.onTexture(e.def.kind);
          e.material.needsUpdate = true;
        }
        e.glow.visible = true;
        continue;
      }
      e.slot = slotIndex;
      if (e.material.map !== slot.texture) {
        e.material.map = slot.texture;
        e.material.needsUpdate = true;
      }
      e.glow.visible = true;
      const use = e.use;
      if (!use) continue;
      const changedOwner = slot.owner !== e.id;
      const dueChanged = this.signature(e, use.mode, use.progress, gameMinutes) !== e.signature;
      const dueTime = e.lastDraw < 0 || this.now - e.lastDraw >= interval;
      const dueSlot = slot.lastDraw < 0;
      if (changedOwner || dueSlot || (dueChanged && dueTime)) {
        drawScreen(slot.ctx, use.mode, {
          seed: use.seed,
          progress: use.progress,
          gameMinutes,
          now: this.now,
          reducedMotion,
          title: use.title,
          kind: e.def.kind,
        });
        slot.texture.needsUpdate = true;
        slot.owner = e.id;
        slot.lastDraw = this.now;
        e.lastDraw = this.now;
        e.signature = this.signature(e, use.mode, use.progress, gameMinutes);
      }
    }
  }

  /** A cheap change key: redraw when the content or animation frame moved enough. */
  private signature(e: QuadEntry, mode: ScreenMode, progress: number, gameMinutes: number): string {
    const p = Math.round(progress * 400);
    // Continuous motion is drawn still under reduced motion, so the key stays put; the TV must
    // still change programme (a cut, not motion), so its 2-minute scene boundary stays in the key.
    const t = mode === 'tv' ? Math.floor(gameMinutes / 2) : this.reducedMotion ? 0 : Math.floor(gameMinutes * 2);
    const blink = !this.reducedMotion && (mode === 'document' || mode === 'code') ? Math.floor(this.now * 1.6) % 2 : 0;
    return `${mode}|${p}|${t}|${blink}|${e.id}`;
  }

  private setOff(e: QuadEntry): void {
    e.mode = 'off';
    e.use = null;
    e.slot = null;
    e.glow.visible = false;
    if (e.material.map !== this.offTexture) {
      e.material.map = this.offTexture;
      e.material.needsUpdate = true;
    }
    if (e.lastDraw >= 0) e.lastDraw = -1;
    e.signature = '';
  }

  private onTexture(kind: ScreenDef['kind']): THREE.Texture {
    return kind === 'tv' ? this.tvOnTexture : this.computerOnTexture;
  }

  dispose(): void {
    for (const e of [...this.entries.values()]) this.removeEntry(e);
    for (const slot of this.slots) slot.texture.dispose();
    for (const tex of this.staticTextures) tex.dispose();
    this.plane.dispose();
    this.glowMaterial.dispose();
  }
}

// ---------------------------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------------------------

interface DrawOptions {
  seed: string;
  progress: number;
  gameMinutes: number;
  now: number;
  reducedMotion: boolean;
  title: string;
  kind: ScreenDef['kind'];
}

function drawScreen(ctx: CanvasRenderingContext2D, mode: ScreenMode, o: DrawOptions): void {
  switch (mode) {
    case 'document': drawDocument(ctx, o); break;
    case 'code': drawCode(ctx, o); break;
    case 'game': drawGame(ctx, o); break;
    case 'web': drawWeb(ctx, o); break;
    case 'tv': drawTv(ctx, o); break;
    case 'desktop':
    default: drawDesktop(ctx, o); break;
  }
}

function drawOff(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  g.addColorStop(0, '#0b0e12');
  g.addColorStop(0.55, '#161c23');
  g.addColorStop(1, '#090b0e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // a soft diagonal reflection so the dark glass still reads as glass
  const r = ctx.createLinearGradient(0, HEIGHT, WIDTH, 0);
  r.addColorStop(0, 'rgba(255,255,255,0)');
  r.addColorStop(0.48, 'rgba(220,235,255,0.05)');
  r.addColorStop(0.55, 'rgba(220,235,255,0.10)');
  r.addColorStop(0.62, 'rgba(255,255,255,0)');
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawComputerOn(ctx: CanvasRenderingContext2D): void {
  drawDesktopBackground(ctx, '#1d3557', '#0f1c30');
  desktopIcons(ctx);
  taskbar(ctx);
}

function drawTvOn(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  g.addColorStop(0, '#20305a');
  g.addColorStop(1, '#0d1526');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = 'rgba(120,180,240,0.25)';
  for (let i = 0; i < 6; i++) ctx.fillRect(20, 20 + i * 20, WIDTH - 40, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(0, HEIGHT - 18, WIDTH, 18);
}

function drawGlow(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 6, WIDTH / 2, HEIGHT / 2, WIDTH / 2);
  g.addColorStop(0, 'rgba(160,205,255,0.55)');
  g.addColorStop(0.55, 'rgba(110,165,255,0.18)');
  g.addColorStop(1, 'rgba(80,120,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawDesktopBackground(ctx: CanvasRenderingContext2D, top: string, bottom: string): void {
  const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function desktopIcons(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  for (let i = 0; i < 4; i++) ctx.fillRect(12, 12 + i * 26, 13, 13);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  for (let i = 0; i < 4; i++) ctx.fillRect(9, 29 + i * 26, 20, 2);
}

function taskbar(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(8,12,20,0.78)';
  ctx.fillRect(0, HEIGHT - 16, WIDTH, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 5; i++) ctx.fillRect(10 + i * 17, HEIGHT - 12, 10, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '7px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('09:41', WIDTH - 8, HEIGHT - 8);
  ctx.textAlign = 'left';
}

function drawDocument(ctx: CanvasRenderingContext2D, o: DrawOptions): void {
  ctx.fillStyle = '#14161b';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // window title bar
  ctx.fillStyle = '#2a2e37';
  ctx.fillRect(0, 0, WIDTH, 12);
  ctx.fillStyle = '#ef6f6c'; ctx.beginPath(); ctx.arc(8, 6, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(16, 6, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7fc97f'; ctx.beginPath(); ctx.arc(24, 6, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b9c0cc';
  ctx.font = '700 7px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('untitled draft — word processor', WIDTH / 2, 8);
  ctx.textAlign = 'left';
  // paper
  ctx.fillStyle = '#f8f4ea';
  ctx.fillRect(5, 14, WIDTH - 10, HEIGHT - 19);
  ctx.fillStyle = '#e8e1d2';
  ctx.fillRect(5, 14, WIDTH - 10, 1);
  // typed text
  ctx.font = '8px ui-monospace, monospace';
  ctx.textBaseline = 'top';
  const text = typedDocument(o.seed, o.progress, 1400);
  const lines = wrapLines(ctx, text, WIDTH - 30);
  const visible = 13;
  const start = Math.max(0, lines.length - visible);
  ctx.fillStyle = '#2c2a26';
  let lastWidth = 0;
  const shown = lines.slice(start, start + visible);
  shown.forEach((line, i) => {
    ctx.fillText(line, 12, 21 + i * 9.6);
    if (i === shown.length - 1) lastWidth = ctx.measureText(line).width;
  });
  // blinking cursor at the end of the typed text
  const cursorY = 21 + (shown.length - 1) * 9.6;
  if (!o.reducedMotion && Math.floor(o.now * 1.6) % 2 === 0) {
    ctx.fillStyle = '#2c2a26';
    ctx.fillRect(12 + Math.min(lastWidth, WIDTH - 30), cursorY, 1.6, 8);
  } else if (o.reducedMotion) {
    ctx.fillStyle = '#6f6a62';
    ctx.fillRect(12 + Math.min(lastWidth, WIDTH - 30), cursorY + 7, 5, 1.4);
  }
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') { out.push(''); continue; }
    let line = '';
    for (const word of paragraph.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else line = test;
    }
    if (line) out.push(line);
  }
  return out;
}

const TOKEN_COLORS: Record<string, string> = {
  kw: '#c678dd', fn: '#61afef', str: '#98c379', num: '#d19a66', com: '#5c6370', plain: '#abb2bf',
};

function drawCode(ctx: CanvasRenderingContext2D, o: DrawOptions): void {
  ctx.fillStyle = '#1e2127';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#262a33';
  ctx.fillRect(0, 0, WIDTH, 12);
  ctx.fillStyle = '#d7dae0';
  ctx.font = '700 7px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('main.ts', 14, 6.5);
  ctx.fillStyle = '#4b5263';
  ctx.fillRect(WIDTH - 8, 5, 2, 2);
  // editor area
  const { lines } = typedCode(o.seed, o.progress);
  const last = lines[Math.max(0, lines.length - 1)];
  const rows = 9;
  const startLine = Math.max(0, lines.length - rows);
  ctx.font = '7.5px ui-monospace, monospace';
  ctx.textBaseline = 'top';
  for (let r = 0; r < rows; r++) {
    const line = lines[startLine + r];
    if (!line) break;
    const y = 18 + r * 9.4;
    ctx.fillStyle = '#2b3039';
    ctx.textAlign = 'right';
    ctx.fillText(String(startLine + r + 1), 12, y);
    ctx.textAlign = 'left';
    let x = 18 + line.indent * 6;
    for (const t of line.tokens) {
      ctx.fillStyle = TOKEN_COLORS[t.kind] ?? '#abb2bf';
      ctx.fillText(t.text, x, y);
      x += ctx.measureText(t.text).width;
    }
  }
  // cursor after the last typed character
  if (!o.reducedMotion && Math.floor(o.now * 1.6) % 2 === 0 && last) {
    ctx.fillStyle = '#e6e6e6';
    let x = 18 + last.indent * 6;
    for (const t of last.tokens) x += ctx.measureText(t.text).width;
    const y = 18 + Math.min(rows - 1, lines.length - 1 - startLine) * 9.4;
    ctx.fillRect(x + 1, y, 1.6, 8);
  }
  // terminal pane
  const termTop = HEIGHT - 40;
  ctx.fillStyle = '#14161a';
  ctx.fillRect(0, termTop, WIDTH, 40);
  ctx.fillStyle = '#2b3039';
  ctx.fillRect(0, termTop, WIDTH, 1);
  ctx.font = '7.5px ui-monospace, monospace';
  ctx.textBaseline = 'top';
  const term = terminalLines(o.progress, o.reducedMotion);
  term.forEach((line, i) => {
    ctx.fillStyle = line.includes('ok') || line.includes('green') ? '#8ec07c' : '#7d8796';
    ctx.fillText(line, 8, termTop + 5 + i * 9);
  });
}

function drawGame(ctx: CanvasRenderingContext2D, o: DrawOptions): void {
  const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  g.addColorStop(0, '#111a33');
  g.addColorStop(1, '#24406b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 18; i++) {
    const x = (i * 61 + 13) % WIDTH, y = (i * 37 + 9) % 90;
    ctx.fillRect(x, y, 1, 1);
  }
  const frame = gameFrame(o.seed, o.progress, o.gameMinutes);
  for (const s of frame.sprites) {
    if (s.kind === 'block') {
      ctx.fillStyle = s.h > 10 ? '#31582f' : '#5f8f5a';
      ctx.fillRect(s.x, s.y, s.w, s.h);
      if (s.h <= 10) { ctx.fillStyle = '#7fae74'; ctx.fillRect(s.x, s.y, s.w, 2); }
    } else if (s.kind === 'coin') {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(s.x + s.w / 2, s.y + s.h / 2, s.w / 2, 0, Math.PI * 2); ctx.fill();
    }
  }
  const player = frame.sprites.find((s) => s.kind === 'player');
  if (player) {
    ctx.fillStyle = '#ef476f';
    ctx.fillRect(player.x, player.y, player.w, player.h);
    ctx.fillStyle = '#ffd6e0';
    ctx.fillRect(player.x + 2, player.y + 3, 3, 3);
    ctx.fillRect(player.x + 8, player.y + 3, 3, 3);
  }
  // HUD
  ctx.fillStyle = 'rgba(8,12,22,0.72)';
  ctx.fillRect(0, 0, WIDTH, 16);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 9px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText(`SCORE ${String(frame.score).padStart(4, '0')}`, 8, 8.5);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#9fd3ff';
  ctx.fillText(`LEVEL ${frame.level}`, WIDTH - 8, 8.5);
  ctx.textAlign = 'left';
}

function drawWeb(ctx: CanvasRenderingContext2D, o: DrawOptions): void {
  // browser chrome
  ctx.fillStyle = '#dfe3e9';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#c8ced8';
  ctx.fillRect(0, 0, WIDTH, 14);
  const dots = ['#ef6f6c', '#f2c14e', '#7fc97f'];
  dots.forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(8 + i * 8, 7, 2, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(34, 3, WIDTH - 42, 8);
  ctx.fillStyle = '#7c8797';
  ctx.font = '6.5px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText(`hearthside.home/${o.title.toLowerCase().split(' ')[0]}`, 38, 7.5);
  // page header
  ctx.fillStyle = '#35506b';
  ctx.fillRect(0, 14, WIDTH, 20);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 9px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText(o.title, 10, 24);
  // scrolling cards
  const top = 38;
  const bottom = HEIGHT - 6;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, WIDTH, bottom - top);
  ctx.clip();
  const scroll = webScroll(o.progress, o.gameMinutes, o.reducedMotion);
  const cardH = 32, gap = 5, count = 9;
  const offset = scroll * count * (cardH + gap);
  const stripe = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#b07aa1'];
  for (let i = 0; i < count; i++) {
    const y = top + 4 + i * (cardH + gap) - offset;
    if (y > bottom || y + cardH < top) continue;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(8, y, WIDTH - 16, cardH);
    ctx.fillStyle = stripe[i % stripe.length]!;
    ctx.fillRect(8, y, 4, cardH);
    ctx.fillStyle = '#49525f';
    ctx.fillRect(18, y + 6, 100 + ((i * 23) % 60), 4);
    ctx.fillStyle = '#aab2bd';
    ctx.fillRect(18, y + 15, WIDTH - 50 - ((i * 17) % 40), 3);
    ctx.fillRect(18, y + 22, WIDTH - 70 - ((i * 13) % 50), 3);
    ctx.fillStyle = stripe[i % stripe.length]!;
    ctx.fillRect(WIDTH - 38, y + 20, 22, 7);
  }
  ctx.restore();
}

function drawDesktop(ctx: CanvasRenderingContext2D, _o: DrawOptions): void {
  drawDesktopBackground(ctx, '#24405f', '#101c2c');
  desktopIcons(ctx);
  // an open window with a few text lines
  ctx.fillStyle = 'rgba(14,20,30,0.35)';
  ctx.fillRect(24, 26, WIDTH - 40, 92);
  ctx.fillStyle = '#f4f1e8';
  ctx.fillRect(20, 22, WIDTH - 40, 88);
  ctx.fillStyle = '#cfd6df';
  ctx.fillRect(20, 22, WIDTH - 40, 12);
  ctx.fillStyle = '#5e6b7a';
  ctx.fillRect(24, 26, 40, 3);
  ctx.fillStyle = '#9aa4b1';
  for (let i = 0; i < 6; i++) ctx.fillRect(28, 42 + i * 10, 120 - ((i * 19) % 50), 3);
  taskbar(ctx);
}

function drawTv(ctx: CanvasRenderingContext2D, o: DrawOptions): void {
  const channel = tvChannel(o.seed);
  const scene = tvScene(o.seed, o.gameMinutes);
  if (channel === 'news') drawNews(ctx, o, scene);
  else if (channel === 'nature') drawNature(ctx, o, scene);
  else if (channel === 'cartoon') drawCartoon(ctx, o, scene);
  else if (channel === 'cooking') drawCooking(ctx, o, scene);
  else drawSport(ctx, o, scene);
  // a small channel badge
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(6, 6, 54, 12);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 7px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText(channel.toUpperCase(), 10, 12.5);
}

function drawNews(ctx: CanvasRenderingContext2D, o: DrawOptions, scene: number): void {
  const hue = 205 + (scene % 3) * 8;
  const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  g.addColorStop(0, `hsl(${hue} 55% 26%)`);
  g.addColorStop(1, `hsl(${hue} 60% 14%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // studio desk and presenter
  ctx.fillStyle = '#d9dee6';
  ctx.beginPath(); ctx.arc(76, 54, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2b3b52';
  ctx.fillRect(52, 66, 48, 26);
  ctx.fillStyle = '#1a2638';
  ctx.fillRect(24, 92, 150, 24);
  ctx.fillStyle = '#c8d4e4';
  ctx.fillRect(32, 96, 100, 3);
  ctx.fillRect(32, 104, 74, 3);
  // headline card
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillRect(188, 34, 56, 56);
  ctx.fillStyle = '#22344c';
  ctx.fillRect(194, 42, 44, 5);
  ctx.fillStyle = '#7d8da2';
  ctx.fillRect(194, 52, 40, 3);
  ctx.fillRect(194, 59, 34, 3);
  ctx.fillRect(194, 66, 38, 3);
  // ticker
  ctx.fillStyle = 'rgba(190,30,45,0.92)';
  ctx.fillRect(0, HEIGHT - 20, WIDTH, 20);
  ctx.fillStyle = '#ffffff';
  ctx.font = '7px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  const ticker = tvTicker(o.seed);
  const offset = o.reducedMotion ? 0 : (o.gameMinutes * 34) % 220;
  ctx.fillText(ticker, -offset, HEIGHT - 10);
  ctx.fillText(ticker, 220 - offset, HEIGHT - 10);
}

function drawNature(ctx: CanvasRenderingContext2D, o: DrawOptions, scene: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  g.addColorStop(0, ['#8ecae6', '#a8dadc', '#bde0fe'][scene % 3]!);
  g.addColorStop(0.6, '#dff3e3');
  g.addColorStop(1, '#5f9e6e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const sunX = 40 + ((scene * 37) % (WIDTH - 80));
  ctx.fillStyle = '#ffe08a';
  ctx.beginPath(); ctx.arc(sunX, 34, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4f8a5b';
  ctx.beginPath(); ctx.moveTo(0, 120);
  ctx.quadraticCurveTo(60, 82, 130, 118);
  ctx.quadraticCurveTo(200, 150, WIDTH, 110);
  ctx.lineTo(WIDTH, HEIGHT); ctx.lineTo(0, HEIGHT); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3c6f4a';
  ctx.beginPath(); ctx.moveTo(0, 136);
  ctx.quadraticCurveTo(90, 108, 170, 138);
  ctx.quadraticCurveTo(220, 158, WIDTH, 132);
  ctx.lineTo(WIDTH, HEIGHT); ctx.lineTo(0, HEIGHT); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(40,60,45,0.7)';
  ctx.lineWidth = 1;
  const drift = o.reducedMotion ? 0 : (o.gameMinutes * 8) % WIDTH;
  for (let i = 0; i < 3; i++) {
    const x = (20 + i * 60 + drift) % WIDTH, y = 26 + i * 12;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 4, y - 3, x + 8, y); ctx.stroke();
  }
}

function drawCartoon(ctx: CanvasRenderingContext2D, o: DrawOptions, scene: number): void {
  ctx.fillStyle = ['#ffe8f0', '#e8f4ff', '#fff4d6'][scene % 3]!;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const t = o.reducedMotion ? scene : o.gameMinutes * 0.6 + scene;
  const blobs = ['#ff9eb5', '#9ed0ff', '#ffd166', '#a8e6a3'];
  for (let i = 0; i < 4; i++) {
    const x = 40 + i * 58, y = 90 + Math.sin(t + i * 1.3) * 16;
    ctx.fillStyle = blobs[i % blobs.length]!;
    ctx.beginPath(); ctx.ellipse(x, y, 24, 20, Math.sin(t * 0.4 + i) * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b2b38';
    ctx.beginPath(); ctx.arc(x - 7, y - 4, 2.6, 0, Math.PI * 2); ctx.arc(x + 7, y - 4, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2b2b38'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(x, y + 4, 5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }
}

function drawCooking(ctx: CanvasRenderingContext2D, o: DrawOptions, scene: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  g.addColorStop(0, ['#f6e4cf', '#ffe9d6', '#f2dfc4'][scene % 3]!);
  g.addColorStop(1, '#c98b55');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#b5733a';
  ctx.fillRect(0, 108, WIDTH, 52);
  ctx.fillStyle = '#8a5a3c';
  ctx.fillRect(0, 108, WIDTH, 4);
  // pot
  ctx.fillStyle = '#3c414a';
  ctx.fillRect(96, 82, 68, 30);
  ctx.fillStyle = '#565d68';
  ctx.fillRect(92, 78, 76, 6);
  ctx.fillStyle = '#c7d0da';
  ctx.fillRect(120, 64, 20, 2);
  ctx.fillStyle = '#ef6f6c';
  ctx.fillRect(118, 66, 24, 8);
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 2;
  const t = o.reducedMotion ? 0 : o.gameMinutes;
  for (let i = 0; i < 3; i++) {
    const x = 112 + i * 14;
    ctx.beginPath();
    ctx.moveTo(x, 66);
    ctx.bezierCurveTo(x - 5, 58 + Math.sin(t + i) * 2, x + 5, 50, x, 44 - i * 2);
    ctx.stroke();
  }
  // chef blob
  ctx.fillStyle = '#f2c14e';
  ctx.beginPath(); ctx.arc(196, 78, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(184, 56, 24, 10);
  ctx.fillStyle = '#2b2b38';
  ctx.beginPath(); ctx.arc(191, 76, 2, 0, Math.PI * 2); ctx.arc(201, 76, 2, 0, Math.PI * 2); ctx.fill();
}

function drawSport(ctx: CanvasRenderingContext2D, o: DrawOptions, scene: number): void {
  ctx.fillStyle = '#2f7d3a';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#3f944a';
  for (let i = 0; i < 8; i++) ctx.fillRect(0, i * 20, WIDTH, 10);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(18, 16, WIDTH - 36, HEIGHT - 34);
  ctx.beginPath(); ctx.moveTo(WIDTH / 2, 16); ctx.lineTo(WIDTH / 2, HEIGHT - 18); ctx.stroke();
  ctx.beginPath(); ctx.arc(WIDTH / 2, HEIGHT / 2, 18, 0, Math.PI * 2); ctx.stroke();
  const jerseys = ['#ef476f', '#ffd166', '#118ab2', '#06d6a0', '#f78c6b'];
  const t = o.reducedMotion ? 0 : o.gameMinutes * 0.9;
  for (let i = 0; i < 8; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = WIDTH / 2 + side * (24 + ((i * 31) % 70)) + Math.sin(t + i) * 5;
    const y = 34 + ((i * 37) % 90) + Math.cos(t * 0.8 + i) * 4;
    ctx.fillStyle = jerseys[i % jerseys.length]!;
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
  }
  const ballX = WIDTH / 2 + Math.sin(t * 1.3 + scene) * 40;
  const ballY = HEIGHT / 2 + Math.cos(t * 1.1) * 18;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(ballX, ballY, 3.4, 0, Math.PI * 2); ctx.fill();
}
