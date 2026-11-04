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
import { levelY } from '../world/levels';
import { resolveSlots } from '../world/slots';
import type { CameraRig } from './cameraRig';
import { lyingPlacement, seatedPlacement } from '../characters/posture';
import { CRADLE } from '../characters/stagePose';

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
  /** A baby is always lying (crib, mat or arms); other stages stand, walk, sit and lie. */
  baby: boolean;
}

/** What the look of a person's body depends on: the appearance and the life stage. */
function stageKey(p: Person): string {
  return `${p.lifeStage}|${JSON.stringify(p.appearance)}`;
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
  /** Babies held in somebody's arms: baby id -> carrier id (`setHeld`). */
  private readonly held = new Map<Id, Id>();
  /** Ground height under a point (grass is slightly below floors). */
  groundAt: (x: number, z: number) => number = () => 0;
  /** Milestone 9: people on floors above this one are not drawn. */
  private activeLevel = 0;
  private readonly smoothY = new Map<Id, number>();
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

  setActiveLevel(level: number): void { this.activeLevel = level; }

  /** Height of the floor under a person: the floor of their level plus their height on a staircase, eased between frames. */
  private floorY(id: Id, loc: { level: number; rise?: number }, x: number, z: number, dt: number, reduced: boolean): number {
    const target = (loc.level > 0 ? levelY(loc.level) : this.groundAt(x, z)) + (loc.rise ?? 0);
    const cur = this.smoothY.get(id);
    const y = cur === undefined || reduced || Math.abs(target - cur) > 3.5 ? target : cur + (target - cur) * (1 - Math.exp(-dt * 14));
    this.smoothY.set(id, y);
    return y;
  }

  private slotList(lot: Lot): WorldSlot[] {
    if (this.slotsLot === lot) return this.slots;
    const out: WorldSlot[] = [];
    for (const o of Object.values(lot.objects)) {
      const def = this.content.objects[o.defId];
      if (!def || def.slots.length === 0) continue;
      out.push(...resolveSlots(lot, o, def));
    }
    this.slots = out;
    this.slotsLot = lot;
    return out;
  }

  private findSlot(lot: Lot, x: number, z: number, posture: Posture, level = 0): WorldSlot | null {
    let best: WorldSlot | null = null, bd = 0.08;
    for (const s of this.slotList(lot)) {
      if ((s.level ?? 0) !== level) continue;
      if (posture === 'seated' && s.kind === 'sleep') continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /**
   * Puts a baby in a carrier's arms (the carrier cradles, the baby lies across the forearms) or back down (null). Without a call, a
   * baby that is not on a bed slot and stands within arm's reach of somebody playing the 'carry' animation is taken as held by them.
   */
  setHeld(babyId: Id, carrierId: Id | null): void {
    if (carrierId) this.held.set(babyId, carrierId); else this.held.delete(babyId);
  }

  /** Rebuilds every person on the assets' current character style. */
  refreshStyle(): void {
    for (const e of this.entries.values()) e.view.refreshStyle();
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
    const view = new CharacterView(this.assets, this.content, p.appearance, outfit, p.lifeStage);
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
      facing: loc?.facing ?? 0, animKey: '', appearanceKey: stageKey(p), outfitKey: JSON.stringify(outfit),
      align: loc && (loc.posture === 'seated' || loc.posture === 'lying') ? 1 : 0, slot: null, posture: loc?.posture ?? 'standing',
      shadow, el, bubble, name, speech, speechUntil: 0, thoughtKey: '', visible: false, box: new THREE.Box3(), lastShown: '', layoutKey: '', width: 0, baby: p.lifeStage === 'baby',
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
    const ak = stageKey(p);
    if (ak !== e.appearanceKey) { e.appearanceKey = ak; e.baby = p.lifeStage === 'baby'; e.view.setAppearance(p.appearance, p.lifeStage); }
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
      if (p.location.kind !== 'lot' || p.location.lotId !== lotId) continue;
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
    const heldNow: Array<[Entry, Entry]> = [];
    for (const e of this.entries.values()) {
      const p = state.people[e.id];
      if (!p || p.location.kind !== 'lot') { e.view.root.visible = false; e.shadow.visible = false; e.visible = false; continue; }
      const loc = p.location;
      if (loc.level > this.activeLevel) { e.view.root.visible = false; e.shadow.visible = false; e.visible = false; continue; }
      e.visible = true;
      e.view.root.visible = true;
      e.shadow.visible = true;
      const x = e.prevX + (e.curX - e.prevX) * alpha;
      const z = e.prevZ + (e.curZ - e.prevZ) * alpha;
      // animation
      const animKey = `${p.anim.id}|${p.anim.since}`;
      const posture: Posture = e.baby ? 'lying' : loc.posture === 'walking' ? 'standing' : loc.posture;
      if (animKey !== e.animKey || posture !== e.posture) {
        const id = (ANIMS.has(p.anim.id) ? p.anim.id : 'idle') as AnimId;
        const first = e.animKey === '';
        e.animKey = animKey;
        e.posture = posture;
        e.view.play(id, { fade: first || reducedMotion ? 0 : 0.25, posture });
      }
      e.view.update(dt);
      if (e.baby) {
        const holder = this.holderOf(state, e);
        if (holder) { heldNow.push([e, holder]); continue; }
      }
      // facing
      const d = shortestAngle(e.facing, loc.facing);
      e.facing += Math.abs(d) < 0.01 || reducedMotion ? d : d * Math.min(1, dt * 10);
      // posture alignment with the slot under the person
      const lowered = posture === 'seated' || posture === 'lying';
      const slot = lowered || loc.posture === 'standing' ? this.findSlot(lot, loc.x, loc.z, posture, loc.level) : null;
      if (slot) e.slot = slot;
      const target = lowered && e.slot ? 1 : 0;
      e.align += Math.sign(target - e.align) * Math.min(Math.abs(target - e.align), reducedMotion ? 1 : dt / 0.6);
      if (!lowered && !slot) e.slot = target === 0 && e.align === 0 ? null : e.slot;
      const ground = this.floorY(e.id, loc, x, z, dt, reducedMotion);
      // Milestone 12: swimmers sit in the water, only head and shoulders above the surface.
      const swimming = p.anim.id === 'swim' || p.anim.id === 'float';
      const sink = swimming ? 0.92 * Math.max(e.view.stageHeight / 1.8, 0.55) : 0;
      let rx = x, rz = z, ry = ground - sink, rot = e.facing;
      const s = e.slot;
      const sy = levelY(s?.level ?? 0); // slot heights are above the floor of their level
      // the body of the person's life stage sits and lies lower (children) or on a mat (babies): see characters/posture.ts
      const so = { stage: p.lifeStage, own: e.view.hasOwnBody };
      const k = e.view.stageHeight / 1.8;
      if (e.baby && !(s && e.align > 0)) {
        // a baby without a bed slot lies on the floor where it is
        const pl = lyingPlacement({ x, y: ground, z }, e.facing, so);
        rx = pl.x; ry = pl.y; rz = pl.z; rot = pl.yaw;
      }
      if (s && e.align > 0) {
        const k = e.align * e.align * (3 - 2 * e.align);
        let ax = s.x, az = s.z, ay = s.height + sy, ar = s.facing;
        const anchor = { x: s.x, y: s.height + sy, z: s.z };
        if (posture === 'lying' || (e.posture === 'standing' && s.kind === 'sleep')) {
          // slot facing points from the pillow toward the foot of the bed
          const pl = lyingPlacement(anchor, s.facing, so);
          ax = pl.x; ay = pl.y; az = pl.z; ar = pl.yaw;
        } else if (s.kind === 'sit' || posture === 'seated') {
          const pl = seatedPlacement(anchor, s.facing, p.appearance.frame, this.assets.style, so);
          ax = pl.x; ay = pl.y; az = pl.z; ar = pl.yaw;
        }
        rx += (ax - rx) * k;
        rz += (az - rz) * k;
        ry += (ay - ry) * k;
        rot += shortestAngle(rot, ar) * k;
      } else if (slot && posture === 'standing' && slot.height > 0.05 && slot.kind === 'use') {
        ry = Math.max(ground, slot.height + levelY(slot.level ?? 0)); // shower tray
      }
      e.view.root.position.set(rx, ry, rz);
      e.view.root.rotation.y = rot;
      e.shadow.position.set(rx, ground + 0.012, rz);
      e.shadow.visible = e.align < 0.5 && !swimming;
      const w = 0.3 * Math.max(k, 0.55);
      e.box.min.set(rx - w, ry, rz - w);
      e.box.max.set(rx + w, ry + (posture === 'lying' ? 0.6 : posture === 'seated' ? 1.35 : 1.85) * Math.max(k, 0.4), rz + w);
      if (posture === 'lying') {
        // lying body extends along the bed: widen the box around the slot anchor
        const cx = s ? s.x : rx, cz = s ? s.z : rz, wl = 0.6 * Math.max(k, 0.55);
        e.box.min.set(cx - wl, ry, cz - wl);
        e.box.max.set(cx + wl, ry + 0.9 * Math.max(k, 0.4), cz + wl);
      }
      e.shadow.scale.setScalar(Math.max(k, 0.45));
      // the character's own selection ring sits at the root: hide it on seats and in bed
      if (e.id === this.selected) {
        const ring = e.view.root.getObjectByName('selection');
        if (ring) ring.visible = e.align < 0.5 && !swimming;
      }
    }
    // babies in somebody's arms lie across the cradling forearms of the carrier (placed after the carrier moved this frame)
    const carriers = new Set<Id>();
    for (const [e, h] of heldNow) {
      carriers.add(h.id);
      h.view.cradlePoint(this.tmp);
      const pl = lyingPlacement({ x: this.tmp.x, y: this.tmp.y, z: this.tmp.z }, h.view.root.rotation.y + CRADLE.yaw, { stage: 'baby', own: e.view.hasOwnBody });
      e.view.root.position.set(pl.x, pl.y, pl.z);
      e.view.root.rotation.y = pl.yaw;
      e.shadow.visible = false;
      e.box.min.set(pl.x - 0.4, pl.y - 0.1, pl.z - 0.4);
      e.box.max.set(pl.x + 0.4, pl.y + 0.4, pl.z + 0.4);
    }
    for (const e of this.entries.values()) if (e.view.carrying !== carriers.has(e.id)) e.view.setCarrying(carriers.has(e.id));
  }

  /** Who holds this baby: the carrier set with `setHeld`, else somebody within reach who is playing the 'carry' animation. */
  private holderOf(state: WorldState, baby: Entry): Entry | null {
    const set = this.held.get(baby.id);
    if (set) { const h = this.entries.get(set); if (h && state.people[h.id]?.location.kind === 'lot') return h; }
    if (baby.slot) return null;
    for (const o of this.entries.values()) {
      if (o.baby || o === baby || state.people[o.id]?.anim.id !== 'carry') continue;
      if (Math.hypot(o.curX - baby.curX, o.curZ - baby.curZ) < 0.9) return o;
    }
    return null;
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

  /**
   * People whose body (the segment from feet to head, in screen space) passes within `radius` CSS px of a screen point,
   * nearest first; a person the ray hits exactly counts as distance 0. `depth` is the distance along the ray.
   */
  pickNear(ray: THREE.Ray, camera: CameraRig, sx: number, sy: number, radius: number): Array<{ id: Id; px: number; depth: number; exact: boolean }> {
    const out: Array<{ id: Id; px: number; depth: number; exact: boolean }> = [];
    const a = { x: 0, y: 0, visible: false }, b = { x: 0, y: 0, visible: false };
    for (const e of this.entries.values()) {
      if (!e.visible) continue;
      const cx = (e.box.min.x + e.box.max.x) / 2, cz = (e.box.min.z + e.box.max.z) / 2;
      camera.project(cx, e.box.min.y + 0.1, cz, a);
      camera.project(cx, e.box.max.y - 0.1, cz, b);
      const vx = b.x - a.x, vy = b.y - a.y, len2 = vx * vx + vy * vy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((sx - a.x) * vx + (sy - a.y) * vy) / len2)) : 0;
      const exact = ray.intersectsBox(e.box);
      const px = exact ? 0 : Math.hypot(sx - (a.x + vx * t), sy - (a.y + vy * t));
      if (px > radius) continue;
      const depth = (cx - ray.origin.x) * ray.direction.x + ((e.box.min.y + e.box.max.y) / 2 - ray.origin.y) * ray.direction.y + (cz - ray.origin.z) * ray.direction.z;
      out.push({ id: e.id, px, depth, exact });
    }
    return out.sort((p, q) => p.px - q.px || p.depth - q.depth);
  }

  /** World point above a person's head. */
  headOf(id: Id, out: THREE.Vector3): THREE.Vector3 | null {
    const e = this.entries.get(id);
    if (!e || !e.visible) return null;
    return e.view.headTop(out);
  }

  positionOf(id: Id): { x: number; z: number; y: number } | null {
    const e = this.entries.get(id);
    if (!e || !e.visible) return null;
    return { x: e.view.root.position.x, z: e.view.root.position.z, y: e.view.root.position.y };
  }

  /** Positions of visible people (door animation). */
  positions(): Array<{ x: number; z: number; y: number }> {
    const out: Array<{ x: number; z: number; y: number }> = [];
    for (const e of this.entries.values()) if (e.visible) out.push({ x: e.view.root.position.x, z: e.view.root.position.z, y: e.view.root.position.y });
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
