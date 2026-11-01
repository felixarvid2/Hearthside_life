// Mock GameAPI for the creator dev page (dev/creator.html). Real content registries, a small real WorldState
// with one household (for the wardrobe), and a simple 2D silhouette "preview" drawn on the canvas inside the
// free area reported through view.setInsets. Portraits are small SVG faces. Every other method is a harmless stub.

import { premadeHouseholdList } from '../../../characters/creator';
import { outfitFor, resolveOutfit, validateWardrobe } from '../../../characters/outfits';
import type { AnimId } from '../../../core/anim';
import type { Speed } from '../../../core/clock';
import type { HouseholdDraft, PersonDraft } from '../../../core/drafts';
import { EventBus } from '../../../core/events';
import { newId } from '../../../core/ids';
import { addHousehold, createEmptyWorld } from '../../../core/state';
import type { Id, OutfitCategory, Person, StartMode, Wardrobe, WorldState } from '../../../core/types';
import type { ContentDB } from '../../../content/types';
import type {
  CreatorPreviewOptions, DevStats, GameAPI, GameMode, GameSettings, PaintTool, PickResult, PlacementState, Result, SaveSlotInfo, UiChange,
} from '../../../game/api';

export interface MockCall { name: string; args: unknown[]; at: number }

export interface MockOptions {
  content: ContentDB;
  canvas: HTMLCanvasElement;
  /** Make updateWardrobe fail with this reason. */
  wardrobeError?: string | null;
  /** Portrait render delay (ms). */
  portraitMs?: number;
}

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function personFromDraft(w: WorldState, d: PersonDraft, householdId: Id, i: number, lotId: Id): Person {
  return {
    id: newId(w, 'per'), householdId,
    firstName: d.firstName, lastName: d.lastName, pronouns: { ...d.pronouns }, lifeStage: d.lifeStage, bio: d.bio,
    voice: { ...d.voice }, walkStyle: d.walkStyle, romance: { interestedIn: [...d.romance.interestedIn], open: d.romance.open },
    appearance: JSON.parse(JSON.stringify(d.appearance)), outfits: JSON.parse(JSON.stringify(d.outfits)),
    traits: [...d.traits], likes: [...d.likes], dislikes: [...d.dislikes],
    aspiration: d.aspirationId ? { aspirationId: d.aspirationId, stage: 0, progress: {}, completedStages: 0, rewards: [] } : null,
    needs: { hunger: 80, energy: 80, hygiene: 80, bladder: 80, fun: 80, social: 80 },
    moodlets: [], skills: {}, career: null,
    location: { kind: 'lot', lotId, level: 0, x: 10 + i * 2, z: 12, facing: 0, posture: 'standing' },
    queue: [], memories: [], cooldowns: {}, anim: { id: 'idle', since: 0, loop: true }, thought: null, createdAt: 0, isNpc: false,
  };
}

export class MockCreatorApi implements GameAPI {
  readonly content: ContentDB;
  readonly events = new EventBus();
  readonly calls: MockCall[] = [];
  wardrobeError: string | null;
  lastInsets = { left: 0, right: 0, top: 0, bottom: 0 };
  showCount = 0;
  private listeners = new Set<(w: UiChange) => void>();
  private m: GameMode = 'menu';
  private world: WorldState;
  private canvas: HTMLCanvasElement;
  private preview: { person: PersonDraft | null; opts: CreatorPreviewOptions; view: 'front' | 'side' | 'back' | 'face'; angle: number; zoom: number } = {
    person: null, opts: { category: 'everyday', anim: 'idle' }, view: 'front', angle: 0, zoom: 1,
  };
  private portraitMs: number;
  private settingsValue: GameSettings = { masterVolume: 0.8, soundVolume: 0.8, musicVolume: 0.5, reducedMotion: false, textScale: 1, quality: 'high', characterStyle: 'detailed', shadows: true, showStats: false, tutorial: true };

  constructor(o: MockOptions) {
    this.content = o.content;
    this.canvas = o.canvas;
    this.wardrobeError = o.wardrobeError ?? null;
    this.portraitMs = o.portraitMs ?? 120;
    this.world = this.buildWorld();
    window.addEventListener('resize', () => this.draw());
    this.draw();
  }

  private log(name: string, ...args: unknown[]): void {
    this.calls.push({ name, args, at: performance.now() });
    if (this.calls.length > 2000) this.calls.splice(0, 1000);
  }
  private emit(w: UiChange): void { for (const fn of [...this.listeners]) fn(w); }

  private buildWorld(): WorldState {
    const w = createEmptyWorld(42, 'create');
    const lotId = newId(w, 'lot');
    const list = premadeHouseholdList(this.content);
    const draft: HouseholdDraft = list[1]?.draft ?? list[0]?.draft ?? { name: 'Empty', members: [], ties: [] };
    const hh = addHousehold(w, draft.name, 1825000, lotId, true);
    w.activeHouseholdId = hh.id;
    w.activeLotId = lotId;
    draft.members.forEach((d, i) => { const p = personFromDraft(w, d, hh.id, i, lotId); w.people[p.id] = p; hh.memberIds.push(p.id); });
    return w;
  }

  /** First household member id (for the wardrobe). */
  firstPersonId(): Id { return this.world.households[this.world.activeHouseholdId]?.memberIds[0] ?? ''; }

  onChange(fn: (what: UiChange) => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  state(): WorldState | null { return this.world; }
  mode(): GameMode { return this.m; }
  showMenu(): void { this.m = 'menu'; this.emit('mode'); }
  async startNewGame(mode: StartMode, draft: HouseholdDraft): Promise<Result> { this.log('startNewGame', mode, draft); return { ok: true }; }
  premadeHouseholds(): HouseholdDraft[] { return premadeHouseholdList(this.content).map((p) => p.draft); }

  creator = {
    show: (person: PersonDraft, opts: CreatorPreviewOptions): void => {
      this.showCount++;
      this.log('creator.show', opts);
      this.preview.person = person;
      this.preview.opts = { ...opts };
      if (this.m !== 'creator') { this.m = 'creator'; this.emit('mode'); }
      this.draw();
    },
    setView: (view: 'front' | 'side' | 'back' | 'face'): void => {
      this.log('creator.setView', view);
      this.preview.view = view;
      this.preview.angle = view === 'side' ? Math.PI / 2 : view === 'back' ? Math.PI : 0;
      this.preview.zoom = 1;
      this.draw();
    },
    rotate: (d: number): void => { this.log('creator.rotate', d); this.preview.angle += d; this.draw(); },
    zoom: (f: number): void => { this.log('creator.zoom', f); this.preview.zoom = Math.max(0.5, Math.min(3, this.preview.zoom * f)); this.draw(); },
    hide: (): void => { this.log('creator.hide'); this.preview.person = null; this.m = 'menu'; this.emit('mode'); this.draw(); },
    portrait: (p: PersonDraft): Promise<string> => {
      this.log('creator.portrait', p.firstName);
      const svg = this.portraitSvg(p);
      return new Promise((resolve) => setTimeout(() => resolve(svg), this.portraitMs));
    },
  };

  async listSaves(): Promise<SaveSlotInfo[]> { return []; }
  async latestSave(): Promise<SaveSlotInfo | null> { return null; }
  async saveTo(): Promise<Result> { return { ok: true }; }
  async loadFrom(): Promise<Result & { report?: string[] }> { return { ok: false, reason: 'Not in the creator mock.' }; }
  async deleteSave(): Promise<Result> { return { ok: true }; }
  exportWorld(): string | null { return null; }
  async importWorld(): Promise<Result & { report?: string[] }> { return { ok: false, reason: 'Not in the creator mock.' }; }
  speed(): Speed { return 0; }
  setSpeed(): void {}
  togglePause(): void {}
  selected(): Id | null { return null; }
  select(): void {}
  options(): never[] { return []; }
  queue(): Result { return { ok: false, reason: 'mock' }; }
  goTo(): Result { return { ok: false, reason: 'mock' }; }
  cancel(): void {}
  reorder(): void {}
  mood(): { value: number; label: string; reasons: string[] } { return { value: 0, label: 'Fine', reasons: [] }; }
  updateWardrobe(personId: Id, wardrobe: Wardrobe): Result {
    this.log('updateWardrobe', personId, wardrobe);
    if (this.wardrobeError) return { ok: false, reason: this.wardrobeError };
    const p = this.world.people[personId];
    if (!p) return { ok: false, reason: 'That person is not here.' };
    const issues = validateWardrobe(wardrobe, this.content);
    if (issues.length > 0) return { ok: false, reason: issues[0] as string };
    p.outfits = JSON.parse(JSON.stringify(wardrobe));
    this.emit('state');
    return { ok: true };
  }
  setMode(): void {}
  startPlacement(): Result { return { ok: false, reason: 'mock' }; }
  startMove(): Result { return { ok: false, reason: 'mock' }; }
  startPlaceFromInventory(): Result { return { ok: false, reason: 'mock' }; }
  placement(): PlacementState | null { return null; }
  placementAt(): void {}
  rotatePlacement(): void {}
  confirmPlacement(): Result { return { ok: false, reason: 'mock' }; }
  cancelPlacement(): void {}
  sell(): Result { return { ok: false, reason: 'mock' }; }
  saleValue(): number { return 0; }
  store(): Result { return { ok: false, reason: 'mock' }; }
  setObjectFinish(): Result { return { ok: false, reason: 'mock' }; }
  selectObject(): void {}
  selectedObject(): Id | null { return null; }
  setPaintTool(): void {}
  paintTool(): PaintTool | null { return null; }
  paintPreview(): null { return null; }
  paintApply(): Result { return { ok: false, reason: 'mock' }; }
  eyedrop(): null { return null; }
  recentFinishes(): [] { return []; }
  undo(): string | null { return null; }
  redo(): string | null { return null; }
  canUndo(): boolean { return false; }
  canRedo(): boolean { return false; }
  view = {
    pick: (): PickResult => ({ kind: 'none' }),
    pan: (): void => {},
    zoomAt: (): void => {},
    rotate: (): void => {},
    cutaway: () => 'up' as const,
    setCutaway: (): void => {},
    focusPerson: (): void => {},
    reveal: (): void => {},
    worldToScreen: () => ({ x: 0, y: 0, visible: false }),
    anchorOf: () => null,
    setInsets: (i: { left: number; right: number; top: number; bottom: number }): void => {
      this.log('view.setInsets', i);
      this.lastInsets = { ...i };
      this.draw();
    },
  };
  portrait(): string | null { return null; }
  thumbnails = { furniture: (): string => '', surface: (): string => '' };
  settings(): GameSettings { return this.settingsValue; }
  setSettings(patch: Partial<GameSettings>): void { this.settingsValue = { ...this.settingsValue, ...patch }; this.emit('settings'); }
  setSimSettings(): void {}
  sound(id: string): void { this.log('sound', id); }
  devStats(): DevStats { return { fps: 60, frameMs: 16, drawCalls: 0, triangles: 0, geometries: 0, textures: 0, loadedAssets: 0, agents: 0, routeRequests: 0, simTickMs: 0, ticksPerFrame: 0 }; }

  // ---------------------------------------------------------------------------------------------
  // 2D mock preview
  // ---------------------------------------------------------------------------------------------

  private colours(p: PersonDraft, category: OutfitCategory) {
    const r = resolveOutfit(outfitFor(p, category), this.content);
    const get = (l: string) => r.layers.find((x) => x.layer === l);
    const full = get('full');
    const top = full ?? get('top');
    const bottom = full ?? get('bottom');
    return {
      top: top?.choice.color ?? null, topPattern: top && top.choice.pattern !== 'solid' ? top.choice.patternColor : null,
      sleeve: Number(top?.def.build.sleeve ?? 0.3),
      bottom: bottom?.choice.color ?? null, bottomPattern: bottom && bottom.choice.pattern !== 'solid' ? bottom.choice.patternColor : null,
      dress: !!full && (full.def.build.shape === 'dress'), outer: get('outer')?.choice.color ?? null, shoes: get('shoes')?.choice.color ?? null,
      shortLegs: Number(bottom?.def.build.leg ?? 1) < 0.5,
    };
  }

  private draw(): void {
    const c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight;
    if (W <= 0 || H <= 0) return;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#e9dfcf'); bg.addColorStop(1, '#cdbfa8');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const ins = this.lastInsets;
    const fx = ins.left, fy = ins.top, fw = Math.max(10, W - ins.left - ins.right), fh = Math.max(10, H - ins.top - ins.bottom);
    g.strokeStyle = 'rgba(80,60,40,0.35)'; g.setLineDash([6, 6]); g.lineWidth = 1;
    g.strokeRect(fx + 0.5, fy + 0.5, fw - 1, fh - 1);
    g.setLineDash([]);
    const p = this.preview.person;
    if (!p) return;
    const face = this.preview.view === 'face';
    const unit = (face ? fh * 2.6 : fh * 0.86) * this.preview.zoom; // px per figure height
    const cx = fx + fw / 2;
    const groundY = face ? fy + fh / 2 + unit * 0.9 : fy + fh * 0.95 - (unit - fh * 0.86) * 0.5;
    const Y = (v: number) => groundY - v * unit;
    const ang = this.preview.angle;
    const facing = Math.cos(ang);
    const widthK = Math.abs(facing) * 0.45 + 0.55;
    const X = (v: number) => cx + v * unit * widthK;
    const a = p.appearance;
    const bp = (k: string) => a.body[k] ?? 0;
    const frameB = a.frame === 'b';
    const sw = (frameB ? 0.112 : 0.13) * (1 + bp('shoulders') * 0.2 + bp('build') * 0.1 + bp('muscle') * 0.06);
    const ww = (frameB ? 0.08 : 0.092) * (1 + bp('waist') * 0.25 + bp('build') * 0.15 + bp('belly') * 0.12);
    const hw = (frameB ? 0.118 : 0.1) * (1 + bp('hips') * 0.25 + bp('build') * 0.1);
    const legW = 0.042 * (1 + bp('legs') * 0.3 + bp('build') * 0.1);
    const armW = 0.032 * (1 + bp('arms') * 0.3 + bp('muscle') * 0.1);
    const col = this.colours(p, this.preview.opts.category);
    const anim: AnimId = this.preview.opts.anim;
    const fill = (color: string) => { g.fillStyle = color; };
    const poly = (pts: Array<[number, number]>, color: string, pattern?: string | null) => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(X(x), Y(y)) : g.lineTo(X(x), Y(y))));
      g.closePath(); fill(color); g.fill();
      if (pattern) {
        g.save(); g.clip(); g.fillStyle = pattern;
        for (let yy = 0; yy < 1; yy += 0.025) g.fillRect(cx - unit, Y(yy), unit * 2, unit * 0.008);
        g.restore();
      }
    };
    // shadow
    g.fillStyle = 'rgba(60,40,20,0.18)'; g.beginPath(); g.ellipse(cx, Y(0), unit * 0.16, unit * 0.025, 0, 0, Math.PI * 2); g.fill();
    // legs
    const walk = anim === 'walk' ? 0.03 : 0;
    const legColor = col.bottom && !col.shortLegs && !col.dress ? col.bottom : a.skin;
    for (const s of [-1, 1]) {
      const off = s * (hw * 0.45) + s * walk;
      poly([[off - legW, 0.47], [off + legW, 0.47], [off + legW * 0.8, 0.03], [off - legW * 0.8, 0.03]], legColor, col.bottom && !col.shortLegs && !col.dress ? col.bottomPattern : null);
      poly([[off - legW * 1.1, 0.045], [off + legW * 1.4, 0.045], [off + legW * 1.4, 0], [off - legW * 1.1, 0]], col.shoes ?? shadeHexLocal(a.skin, -0.15));
    }
    // shorts / skirt / hips
    if (col.dress && col.bottom) poly([[-ww, 0.56], [ww, 0.56], [hw * 1.5, 0.27], [-hw * 1.5, 0.27]], col.bottom, col.bottomPattern);
    else if (col.bottom) poly([[-hw, 0.56], [hw, 0.56], [hw * 1.02, col.shortLegs ? 0.36 : 0.44], [-hw * 1.02, col.shortLegs ? 0.36 : 0.44]], col.bottom, col.bottomPattern);
    // arms
    const armColor = col.outer ?? (col.top && col.sleeve > 0.6 ? col.top : a.skin);
    for (const s of [-1, 1]) {
      const raise = (anim === 'wave' && s > 0) || anim === 'dance';
      const x0 = s * (sw - armW * 0.3);
      if (raise) poly([[x0 - armW, 0.79], [x0 + armW, 0.79], [x0 + s * 0.09 + armW, 1.02], [x0 + s * 0.09 - armW, 1.02]], armColor);
      else poly([[x0 - armW, 0.79], [x0 + armW, 0.79], [x0 + s * 0.02 + armW * 0.8, 0.47], [x0 + s * 0.02 - armW * 0.8, 0.47]], armColor);
    }
    // torso
    poly([[-sw, 0.8], [sw, 0.8], [ww, 0.58], [hw * 0.95, 0.5], [-hw * 0.95, 0.5], [-ww, 0.58]], col.top ?? a.skin, col.topPattern);
    if (col.outer) {
      poly([[-sw, 0.8], [-sw * 0.35, 0.8], [-ww * 0.5, 0.5], [-hw * 0.98, 0.5], [-ww * 1.02, 0.58]], col.outer);
      poly([[sw, 0.8], [sw * 0.35, 0.8], [ww * 0.5, 0.5], [hw * 0.98, 0.5], [ww * 1.02, 0.58]], col.outer);
    }
    // neck and head
    poly([[-0.028, 0.8], [0.028, 0.8], [0.026, 0.845], [-0.026, 0.845]], a.skin);
    const fp = (k: string) => a.face.params[k] ?? 0;
    const headRx = 0.064 * (1 + fp('faceWidth') * 0.12), headRy = 0.08 * (1 + fp('faceLength') * 0.1);
    const hy = 0.915;
    const hairDef = this.content.hair?.[a.hair.styleId];
    const len = hairDef?.length ?? 'short';
    g.fillStyle = a.hair.color;
    if (len === 'long' || len === 'medium') {
      const bottomY = len === 'long' ? 0.64 : 0.83;
      g.fillRect(X(-headRx * 1.15), Y(hy + 0.02), (X(headRx * 1.15) - X(-headRx * 1.15)), Y(bottomY) - Y(hy + 0.02));
    }
    if (hairDef?.texture === 'coily') { g.beginPath(); g.ellipse(X(0), Y(hy + 0.02), headRx * 1.7 * unit * widthK, headRy * 1.45 * unit, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = a.skin; g.beginPath(); g.ellipse(X(0), Y(hy), headRx * unit * widthK, headRy * unit, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = a.hair.color; g.beginPath();
    g.ellipse(X(0), Y(hy + 0.018), headRx * 1.08 * unit * widthK, headRy * (len === 'shaved' ? 0.8 : 0.95) * unit, 0, Math.PI, Math.PI * 2); g.fill();
    if (hairDef?.texture === 'tied') { g.beginPath(); g.arc(X(0), Y(hy + 0.1), 0.028 * unit, 0, Math.PI * 2); g.fill(); }
    if (a.hair.highlight) { g.strokeStyle = a.hair.highlight; g.lineWidth = Math.max(1, unit * 0.006); g.beginPath(); g.moveTo(X(-0.03), Y(hy + 0.07)); g.lineTo(X(0.01), Y(hy + 0.02)); g.stroke(); }
    if (Math.abs(facing) > 0.3 && facing > 0) {
      const ex = 0.024 * (1 + fp('eyeSpacing') * 0.25), ey = hy + 0.005 + fp('eyeHeight') * 0.006, er = 0.009 * (1 + fp('eyeSize') * 0.3);
      for (const s of [-1, 1]) {
        g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(X(s * ex), Y(ey), er * 1.5 * unit * widthK, er * unit, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = a.face.eyeColor; g.beginPath(); g.arc(X(s * ex), Y(ey), er * 0.8 * unit, 0, Math.PI * 2); g.fill();
        g.strokeStyle = a.face.browColor; g.lineWidth = Math.max(1, unit * 0.005); g.beginPath();
        g.moveTo(X(s * (ex - 0.014)), Y(ey + 0.022 + fp('browHeight') * 0.006)); g.lineTo(X(s * (ex + 0.014)), Y(ey + 0.024 + fp('browTilt') * 0.008)); g.stroke();
        if (a.face.blush > 0.05) { g.fillStyle = `rgba(220,100,110,${a.face.blush * 0.45})`; g.beginPath(); g.arc(X(s * (ex + 0.008)), Y(ey - 0.025), er * 1.4 * unit, 0, Math.PI * 2); g.fill(); }
      }
      if (a.face.freckles > 0.1) {
        g.fillStyle = 'rgba(120,70,40,0.6)';
        for (let k = 0; k < Math.round(a.face.freckles * 14); k++) { g.beginPath(); g.arc(X(((k * 37) % 50 - 25) / 1000), Y(ey - 0.015 - (k % 3) * 0.004), Math.max(0.8, unit * 0.0016), 0, Math.PI * 2); g.fill(); }
      }
      const mw = 0.022 * (1 + fp('mouthWidth') * 0.3);
      g.strokeStyle = a.face.lipTint > 0.2 ? a.face.lipColor : shadeHexLocal(a.skin, -0.35);
      g.lineWidth = Math.max(1.5, unit * 0.007 * (1 + fp('lipFullness') * 0.4));
      g.beginPath(); g.moveTo(X(-mw), Y(hy - 0.045)); g.quadraticCurveTo(X(0), Y(hy - (anim === 'laugh' ? 0.062 : 0.052)), X(mw), Y(hy - 0.045)); g.stroke();
      if (a.hair.facialHairId) { g.fillStyle = shadeHexLocal(a.hair.color, 0.05); g.globalAlpha = 0.75; g.beginPath(); g.ellipse(X(0), Y(hy - 0.055), headRx * 0.8 * unit * widthK, 0.03 * unit, 0, 0, Math.PI); g.fill(); g.globalAlpha = 1; }
    }
    // label
    g.fillStyle = 'rgba(47,42,38,0.75)'; g.font = '12px system-ui, sans-serif';
    g.fillText(`Mock preview · ${this.preview.view} · ${this.preview.opts.category} · ${anim} · ${p.firstName || 'unnamed'}`, fx + 8, fy + fh - 8);
  }

  private portraitSvg(p: PersonDraft): string {
    const a = p.appearance;
    const col = this.colours(p, p.outfits.current.category);
    const long = ['long', 'medium'].includes(this.content.hair?.[a.hair.styleId]?.length ?? '');
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#efe4d3"/>` +
      (long ? `<rect x="16" y="18" width="32" height="34" rx="10" fill="${a.hair.color}"/>` : '') +
      `<path d="M8 64c2-14 12-20 24-20s22 6 24 20z" fill="${col.outer ?? col.top ?? '#9aa'}"/>` +
      `<ellipse cx="32" cy="30" rx="13" ry="15" fill="${a.skin}"/>` +
      `<path d="M18 28c0-10 6-15 14-15s14 5 14 15c-4-5-9-7-14-7s-10 2-14 7z" fill="${a.hair.color}"/>` +
      `<circle cx="27" cy="31" r="1.8" fill="${a.face.eyeColor}"/><circle cx="37" cy="31" r="1.8" fill="${a.face.eyeColor}"/>` +
      `<path d="M28 38q4 2.5 8 0" stroke="${a.face.lipTint > 0.2 ? a.face.lipColor : '#8a5a4a'}" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`);
  }
}

function shadeHexLocal(hex: string, dl: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1] as string, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.max(0, Math.min(255, Math.round(dl >= 0 ? c + (255 - c) * dl : c * (1 + dl)))));
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
