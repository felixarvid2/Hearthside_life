// People on the active lot: one CharacterView each, positions interpolated between simulation ticks, smoothed
// facing, posture alignment with furniture slots (seated people on seats, sleepers on mattresses), animation
// from person.anim, appearance/outfit updates, a selection ring, a soft blob shadow, and the DOM overlay
// (#world-overlay) with thought bubbles, social lines and name tags.

import * as THREE from 'three';
import { ANIM_IDS, type AnimId } from '../core/anim';
import type { CharacterAssets } from '../characters/assets';
import { CharacterView } from '../characters/CharacterView';
import { currentOutfit } from '../characters/outfits';
import type { ContentDB } from '../content/types';
import type { WorldSlot } from '../core/nav';
import type { Id, Lot, Person, Posture, WorldState } from '../core/types';
import { iconSvg } from '../ui/kit/icons';
import { resolveSlots } from '../world/slots';
import type { CameraRig } from './cameraRig';
import { lyingPlacement, seatedPlacement } from '../characters/posture';

const ANIMS = new Set<string>(ANIM_IDS);
const TWO_PI = Math.PI * 2;
const SPEECH_SECONDS = 4.5;

interface Entry {
  id: Id;
  view: CharacterView;
  prevX: number; prevZ: number; curX: number; curZ: number;
  facing: number;
  animKey: string;
  appearanceKey: string;
  outfitKey: string;
  align: number;
  slot: WorldSlot | null;
  posture: Posture;
  shadow: THREE.Mesh;
  el: HTMLDivElement;
  bubble: HTMLDivElement;
  name: HTMLDivElement;
  speech: HTMLDivElement;
  speechUntil: number;
  thoughtKey: string;
  visible: boolean;
  box: THREE.Box3;
  lastShown: string;
  layoutKey: string;
  width: number;
}

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return d;
}

function shadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(40,28,18,0.42)');
  g.addColorStop(0.55, 'rgba(40,28,18,0.22)');
  g.addColorStop(1, 'rgba(40,28,18,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let cssInjected = false;
function injectOverlayCss(): void {
  if (cssInjected) return;
  cssInjected = true;
  const s = document.createElement('style');
  s.textContent = `
#world-overlay { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 1; }
#world-overlay .wo-p { position: absolute; left: 0; top: 0; will-change: transform; display: flex; flex-direction: column; align-items: center; gap: 6px; transform: translate(-9999px, 0); }
#world-overlay .wo-bubble { position: relative; width: 38px; height: 38px; border-radius: 50%; background: #fbf6ee; color: #2f2a26; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 10px rgba(60,40,20,.22); border: 2px solid #e6d9c6; }
#world-overlay .wo-bubble::after { content: ''; position: absolute; bottom: -7px; left: 50%; width: 9px; height: 9px; margin-left: -6px; border-radius: 50%; background: #fbf6ee; border: 2px solid #e6d9c6; }
#world-overlay .wo-bubble.need { color: #c8473d; }
#world-overlay .wo-speech { max-width: 220px; white-space: normal; text-align: center; font: 600 calc(13px * var(--text-scale, 1)) / 1.3 var(--font, system-ui); background: #fbf6ee; color: #2f2a26; padding: 6px 10px; border-radius: 14px; box-shadow: 0 3px 10px rgba(60,40,20,.2); width: max-content; }
#world-overlay .wo-name { font: 700 calc(12px * var(--text-scale, 1)) / 1 var(--font, system-ui); color: #fff; background: rgba(47,42,38,.78); padding: 4px 8px; border-radius: 999px; white-space: nowrap; }
#world-overlay .wo-name.sel { background: #d9774b; }
#world-overlay [hidden] { display: none !important; }
.reduced-motion #world-overlay .wo-p { transition: none; }
`;
  document.head.appendChild(s);
}

export class PeopleView {
  readonly group = new THREE.Group();
  private readonly entries = new Map<Id, Entry>();
  private readonly shadowTex = shadowTexture();
  private readonly shadowGeo = new THREE.PlaneGeometry(0.85, 0.85).rotateX(-Math.PI / 2);
  private readonly shadowMat = new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  private slots: WorldSlot[] = [];
  private slotsLot: Lot | null = null;
  private selected: Id | null = null;
  hovered: Id | null = null;
  /** Ground height under a point (grass is slightly below floors). */
  groundAt: (x: number, z: number) => number = () => 0;
  private time = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly scr = { x: 0, y: 0, visible: false };
  private overlayOn = true;

  constructor(private readonly assets: CharacterAssets, private readonly content: ContentDB, private readonly overlay: HTMLElement | null) {
    this.group.name = 'people';
    injectOverlayCss();
  }

  get count(): number { return this.entries.size; }

  setOverlayVisible(on: boolean): void {
    this.overlayOn = on;
    if (this.overlay) this.overlay.hidden = !on;
  }

  /** Recomputes slot anchors after a construction change. */
  invalidateSlots(): void { this.slotsLot = null; }

  private slotList(lot: Lot): WorldSlot[] {
    if (this.slotsLot === lot) return this.slots;
    const out: WorldSlot[] = [];
    for (const o of Object.values(lot.objects)) {
      const def = this.content.objects[o.defId];
      if (!def || def.slots.length === 0 || o.level !== 0) continue;
      out.push(...resolveSlots(lot, o, def));
    }
    this.slots = out;
    this.slotsLot = lot;
    return out;
  }

  private findSlot(lot: Lot, x: number, z: number, posture: Posture): WorldSlot | null {
    let best: WorldSlot | null = null, bd = 0.08;
    for (const s of this.slotList(lot)) {
      if (posture === 'seated' && s.kind === 'sleep') continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  clear(): void {
    for (const e of [...this.entries.values()]) this.remove(e);
    this.slotsLot = null;
  }

  private remove(e: Entry): void {
    e.view.dispose();
    e.shadow.removeFromParent();
    e.el.remove();
    this.entries.delete(e.id);
  }

  private create(p: Person): Entry {
    const outfit = currentOutfit(p);
    const view = new CharacterView(this.assets, this.content, p.appearance, outfit);
    view.root.traverse((o) => { o.frustumCulled = false; });
    this.group.add(view.root);
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadow.renderOrder = 1;
    this.group.add(shadow);
    const el = document.createElement('div');
    el.className = 'wo-p';
    const bubble = document.createElement('div'); bubble.className = 'wo-bubble'; bubble.hidden = true;
    const speech = document.createElement('div'); speech.className = 'wo-speech'; speech.hidden = true;
    const name = document.createElement('div'); name.className = 'wo-name'; name.hidden = true; name.textContent = p.firstName;
    el.append(bubble, speech, name);
    this.overlay?.appendChild(el);
    const loc = p.location.kind === 'lot' ? p.location : null;
    const e: Entry = {
      id: p.id, view, prevX: loc?.x ?? 0, prevZ: loc?.z ?? 0, curX: loc?.x ?? 0, curZ: loc?.z ?? 0,
      facing: loc?.facing ?? 0, animKey: '', appearanceKey: JSON.stringify(p.appearance), outfitKey: JSON.stringify(outfit),
      align: loc && (loc.posture === 'seated' || loc.posture === 'lying') ? 1 : 0, slot: null, posture: loc?.posture ?? 'standing',
      shadow, el, bubble, name, speech, speechUntil: 0, thoughtKey: '', visible: false, box: new THREE.Box3(), lastShown: '', layoutKey: '', width: 0,
    };
    this.entries.set(p.id, e);
    return e;
  }

  /** Called after simulation ticks ran: the current positions become the interpolation targets. */
  onTicks(state: WorldState): void {
    for (const e of this.entries.values()) {
      const p = state.people[e.id];
      if (!p || p.location.kind !== 'lot') continue;
      e.prevX = e.curX; e.prevZ = e.curZ;
      e.curX = p.location.x; e.curZ = p.location.z;
      // big jumps (arrivals, teleports after a build change) snap instead of sliding through walls
      if (Math.hypot(e.curX - e.prevX, e.curZ - e.prevZ) > 2.5) { e.prevX = e.curX; e.prevZ = e.curZ; }
    }
  }

  /** Snap everyone to the state (after a load or a world change). */
  snap(state: WorldState): void {
    for (const e of this.entries.values()) {
      const p = state.people[e.id];
      if (!p || p.location.kind !== 'lot') continue;
      e.prevX = e.curX = p.location.x;
      e.prevZ = e.curZ = p.location.z;
      e.facing = p.location.facing;
      e.align = p.location.posture === 'seated' || p.location.posture === 'lying' ? 1 : 0;
    }
  }

  personChanged(state: WorldState, id: Id): void {
    const e = this.entries.get(id);
    const p = state.people[id];
    if (!e || !p) return;
    const ak = JSON.stringify(p.appearance);
    if (ak !== e.appearanceKey) { e.appearanceKey = ak; e.view.setAppearance(p.appearance); }
    const outfit = currentOutfit(p);
    const ok = JSON.stringify(outfit);
    if (ok !== e.outfitKey) { e.outfitKey = ok; e.view.setOutfit(outfit); }
    e.name.textContent = p.firstName;
  }

  setSelected(id: Id | null): void {
    if (id === this.selected) return;
    const prev = this.selected ? this.entries.get(this.selected) : null;
    prev?.view.setSelected(false);
    this.selected = id;
    const cur = id ? this.entries.get(id) : null;
    cur?.view.setSelected(true);
  }

  /** A social line said by `actorId` (shown for a few seconds above the head). */
  say(actorId: Id, line: string): void {
    const e = this.entries.get(actorId);
    if (!e || !line) return;
    e.speech.textContent = line;
    e.speechUntil = this.time + SPEECH_SECONDS;
  }

  /** Adds/removes views to match the people on the lot. */
  sync(state: WorldState, lotId: Id): void {
    const seen = new Set<Id>();
    for (const p of Object.values(state.people)) {
      if (p.location.kind !== 'lot' || p.location.lotId !== lotId || p.location.level !== 0) continue;
      seen.add(p.id);
      if (!this.entries.has(p.id)) {
        try { this.create(p); } catch (err) { console.warn('[render] could not create person view', p.id, err); }
      }
    }
    for (const e of [...this.entries.values()]) if (!seen.has(e.id)) this.remove(e);
    if (this.selected && this.entries.has(this.selected)) this.entries.get(this.selected)!.view.setSelected(true);
  }

  /** Per-frame update: interpolation, animation, posture alignment, ring, shadows. */
  update(state: WorldState, lot: Lot, dt: number, alpha: number, reducedMotion: boolean): void {
    this.time += dt;
    for (const e of this.entries.values()) {
      const p = state.people[e.id];
      if (!p || p.location.kind !== 'lot') { e.view.root.visible = false; e.shadow.visible = false; e.visible = false; continue; }
      const loc = p.location;
      e.visible = true;
      e.view.root.visible = true;
      e.shadow.visible = true;
      const x = e.prevX + (e.curX - e.prevX) * alpha;
      const z = e.prevZ + (e.curZ - e.prevZ) * alpha;
      // animation
      const animKey = `${p.anim.id}|${p.anim.since}`;
      const posture: Posture = loc.posture === 'walking' ? 'standing' : loc.posture;
      if (animKey !== e.animKey || posture !== e.posture) {
        const id = (ANIMS.has(p.anim.id) ? p.anim.id : 'idle') as AnimId;
        const first = e.animKey === '';
        e.animKey = animKey;
        e.posture = posture;
        e.view.play(id, { fade: first || reducedMotion ? 0 : 0.25, posture });
      }
      e.view.update(dt);
      // facing
      const d = shortestAngle(e.facing, loc.facing);
      e.facing += Math.abs(d) < 0.01 || reducedMotion ? d : d * Math.min(1, dt * 10);
      // posture alignment with the slot under the person
      const lowered = posture === 'seated' || posture === 'lying';
      const slot = lowered || loc.posture === 'standing' ? this.findSlot(lot, loc.x, loc.z, posture) : null;
      if (slot) e.slot = slot;
      const target = lowered && e.slot ? 1 : 0;
      e.align += Math.sign(target - e.align) * Math.min(Math.abs(target - e.align), reducedMotion ? 1 : dt / 0.6);
      if (!lowered && !slot) e.slot = target === 0 && e.align === 0 ? null : e.slot;
      const ground = this.groundAt(x, z);
      let rx = x, rz = z, ry = ground, rot = e.facing;
      const s = e.slot;
      if (s && e.align > 0) {
        const k = e.align * e.align * (3 - 2 * e.align);
        let ax = s.x, az = s.z, ay = s.height, ar = s.facing;
        const anchor = { x: s.x, y: s.height, z: s.z };
        if (posture === 'lying' || (e.posture === 'standing' && s.kind === 'sleep')) {
          // slot facing points from the pillow toward the foot of the bed
          const pl = lyingPlacement(anchor, s.facing);
          ax = pl.x; ay = pl.y; az = pl.z; ar = pl.yaw;
        } else if (s.kind === 'sit' || posture === 'seated') {
          const pl = seatedPlacement(anchor, s.facing, p.appearance.frame);
          ax = pl.x; ay = pl.y; az = pl.z; ar = pl.yaw;
        }
        rx = x + (ax - x) * k;
        rz = z + (az - z) * k;
        ry = ground + (ay - ground) * k;
        rot = e.facing + shortestAngle(e.facing, ar) * k;
      } else if (slot && posture === 'standing' && slot.height > 0.05 && slot.kind === 'use') {
        ry = Math.max(ground, slot.height); // shower tray
      }
      e.view.root.position.set(rx, ry, rz);
      e.view.root.rotation.y = rot;
      e.shadow.position.set(rx, ground + 0.012, rz);
      e.shadow.visible = e.align < 0.5;
      e.box.min.set(rx - 0.3, ry, rz - 0.3);
      e.box.max.set(rx + 0.3, ry + (posture === 'lying' ? 0.6 : posture === 'seated' ? 1.35 : 1.85), rz + 0.3);
      if (posture === 'lying') {
        // lying body extends along the bed: widen the box around the slot anchor
        const cx = s ? s.x : rx, cz = s ? s.z : rz;
        e.box.min.set(cx - 0.6, ry, cz - 0.6);
        e.box.max.set(cx + 0.6, ry + 0.9, cz + 0.6);
      }
      // the character's own selection ring sits at the root: hide it on seats and in bed
      if (e.id === this.selected) {
        const ring = e.view.root.getObjectByName('selection');
        if (ring) ring.visible = e.align < 0.5;
      }
    }
  }

  /** Positions overlay elements (call after matrices are updated). */
  updateOverlay(state: WorldState, camera: CameraRig): void {
    if (!this.overlay || !this.overlayOn) return;
    const now = state.clock.minutes;
    for (const e of this.entries.values()) {
      const p = state.people[e.id];
      const thought = p?.thought && p.thought.until > now ? p.thought : null;
      const speaking = e.speechUntil > this.time;
      const named = e.id === this.selected || e.id === this.hovered;
      const show = e.visible && (!!thought || speaking || named);
      if (!show) { if (e.lastShown !== '') { e.el.style.transform = 'translate(-9999px,0)'; e.lastShown = ''; } continue; }
      e.view.headTop(this.tmp);
      camera.project(this.tmp.x, this.tmp.y + 0.03, this.tmp.z, this.scr);
      if (!this.scr.visible) { if (e.lastShown !== '') { e.el.style.transform = 'translate(-9999px,0)'; e.lastShown = ''; } continue; }
      const tk = thought ? `${thought.icon}|${thought.text}` : '';
      if (tk !== e.thoughtKey) {
        e.thoughtKey = tk;
        if (thought) {
          e.bubble.innerHTML = iconSvg(thought.icon, 22);
          e.bubble.title = thought.text;
          e.bubble.classList.toggle('need', ['hunger', 'energy', 'hygiene', 'bladder', 'fun', 'social'].includes(thought.icon));
        }
      }
      e.bubble.hidden = !thought || speaking;
      e.speech.hidden = !speaking;
      e.name.hidden = !named;
      e.name.classList.toggle('sel', e.id === this.selected);
      // keep the bubble on screen (speech lines are wide)
      const layoutKey = `${tk}|${speaking ? e.speech.textContent : ''}|${named ? 1 : 0}`;
      if (layoutKey !== e.layoutKey) { e.layoutKey = layoutKey; e.width = e.el.offsetWidth; }
      const half = e.width / 2 + 6;
      const sx = Math.max(half, Math.min(camera.width - half, this.scr.x));
      const t = `translate(${Math.round(sx)}px,${Math.round(this.scr.y)}px) translate(-50%,-100%)`;
      if (t !== e.lastShown) { e.el.style.transform = t; e.lastShown = t; }
    }
  }

  /** Nearest person along a ray. */
  pick(ray: THREE.Ray, out: THREE.Vector3): { id: Id; distance: number } | null {
    let best: { id: Id; distance: number } | null = null;
    for (const e of this.entries.values()) {
      if (!e.visible) continue;
      const p = ray.intersectBox(e.box, out);
      if (!p) continue;
      const d = p.distanceTo(ray.origin) - 0.25; // people win close ties with furniture they use
      if (!best || d < best.distance) best = { id: e.id, distance: d };
    }
    return best;
  }

  /** World point above a person's head. */
  headOf(id: Id, out: THREE.Vector3): THREE.Vector3 | null {
    const e = this.entries.get(id);
    if (!e || !e.visible) return null;
    return e.view.headTop(out);
  }

  positionOf(id: Id): { x: number; z: number } | null {
    const e = this.entries.get(id);
    if (!e || !e.visible) return null;
    return { x: e.view.root.position.x, z: e.view.root.position.z };
  }

  /** Positions of visible people (door animation). */
  positions(): Array<{ x: number; z: number }> {
    const out: Array<{ x: number; z: number }> = [];
    for (const e of this.entries.values()) if (e.visible) out.push({ x: e.view.root.position.x, z: e.view.root.position.z });
    return out;
  }

  stats(): { triangles: number; drawCalls: number } {
    let triangles = 0, drawCalls = 0;
    for (const e of this.entries.values()) { const s = e.view.stats(); triangles += s.triangles; drawCalls += s.drawCalls; }
    return { triangles, drawCalls };
  }

  dispose(): void {
    this.clear();
    this.shadowTex.dispose();
    this.shadowGeo.dispose();
    this.shadowMat.dispose();
  }
}
