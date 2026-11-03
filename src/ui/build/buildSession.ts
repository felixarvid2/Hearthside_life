// Build mode structure tools, interaction side: turns pointer positions into BuildTargets, previews them live
// through the GameAPI and applies them. One session lives for the whole app; the world input (src/ui/input.ts), the
// Build panel footer and the handle overlay (buildOverlay.ts) all talk to it.
//
// Touch: a tap or a drag only sets the preview (cost, measurement, reasons and the in-world ghost); the Confirm
// button applies it, Cancel clears it, and large handles let the player resize the shape before confirming. A drag
// tool draws with one finger (two fingers pan and zoom). Desktop: hovering previews click tools, a click applies; a
// drag tool applies on mouse-up, Esc cancels. Pointer cancel and orientation changes keep the preview: it lives here
// and in the game, not in the DOM.

import { formatMoney } from '../../core/money';
import { isGateDef } from '../../world/fences';
import type { BuildPoint, BuildPreview, BuildTarget, BuildTool, GameAPI, PickResult, Result, SoundId } from '../../game/api';

/** What the session needs from the interface around it (kept apart so the session has no DOM). */
export interface SessionHooks {
  sound(id: SoundId): void;
  toast(text: string, kind?: 'info' | 'success' | 'warning' | 'error', ms?: number): void;
}

export type ToolMode = 'none' | 'drag' | 'click';

/** Drag tools shape something with two points; click tools act on what is under one point. */
export function toolMode(tool: BuildTool | null): ToolMode {
  if (!tool) return 'none';
  switch (tool.kind) {
    case 'room': return 'drag';
    case 'wall': return tool.shape === 'run' ? 'drag' : 'click';
    case 'eraseWall': return tool.shape === 'segment' ? 'click' : 'drag';
    case 'floor': case 'eraseFloor': return tool.shape === 'rect' ? 'drag' : 'click';
    // Milestone 9 exterior: a fence run is dragged, a gate is tapped on an edge; a roof is dragged (or 'auto'); paint is a tile or a rectangle
    case 'fence': return isGateDef(tool.defId) ? 'click' : 'drag';
    case 'roof': case 'terrain': return tool.shape === 'rect' ? 'drag' : 'click';
    default: return 'click';
  }
}

/** Tools that act on one wall edge: the wall under the pointer (a pick) decides it, not the ground point. */
function usesWallPick(tool: BuildTool): boolean {
  return tool.kind === 'opening' || tool.kind === 'moveOpening' || tool.kind === 'eraseOpening' || (tool.kind === 'eraseWall' && tool.shape === 'segment');
}

export type HandleId = 'c0' | 'c1' | 'c2' | 'c3' | 'a' | 'b';
export interface BuildHandle { id: HandleId; x: number; z: number }

export interface SessionState {
  tool: BuildTool | null;
  mode: ToolMode;
  target: BuildTarget | null;
  preview: BuildPreview | null;
  /** A preview waits for Confirm (touch) or is being adjusted. */
  pending: boolean;
  dragging: boolean;
  /** Confirm would apply something right now. */
  canConfirm: boolean;
  /** Why Confirm is off (not affordable, blocked...), if a preview exists. */
  blockedReason: string | null;
}

export interface PreviewSummary {
  state: 'ok' | 'bad' | 'info';
  /** Short headline ("Build 6 m of wall"). */
  title: string;
  /** Measurement, cost and counts. */
  detail: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Player-facing text for a preview: headline, measurement, money and counts (never colour alone). */
export function summarize(pv: BuildPreview): PreviewSummary {
  if (!pv.ok) return { state: 'bad', title: pv.reason ?? pv.reasons[0] ?? 'That cannot be built here.', detail: '' };
  const c = pv.counts;
  const bits: string[] = [];
  if (pv.measure.text && !pv.label.includes(pv.measure.text)) bits.push(pv.measure.text);
  if (pv.unchanged) return { state: 'info', title: pv.reasons[0] ?? 'Nothing would change.', detail: bits.join(' · ') };
  if (c.wallsNew) bits.push(plural(c.wallsNew, 'new wall', 'new walls'));
  if (c.wallsRemoved) bits.push(`${plural(c.wallsRemoved, 'wall', 'walls')} removed`);
  if (c.wallsExisting && (c.wallsNew || c.wallsRemoved)) bits.push(`${c.wallsExisting} kept`);
  if (c.openingsAdded) bits.push(plural(c.openingsAdded, 'opening', 'openings'));
  if (c.openingsRemoved) bits.push(`${plural(c.openingsRemoved, 'opening', 'openings')} removed`);
  if (c.floorsPlaced) bits.push(plural(c.floorsPlaced, 'floor tile', 'floor tiles'));
  if (c.floorsErased) bits.push(`${plural(c.floorsErased, 'floor tile', 'floor tiles')} erased`);
  const dr = pv.rooms.after - pv.rooms.before;
  if (dr > 0) bits.push(dr === 1 ? 'makes a room' : `makes ${dr} rooms`);
  else if (dr < 0) bits.push(dr === -1 ? 'removes a room' : `removes ${-dr} rooms`);
  bits.push(pv.cost > 0 ? `Cost ${formatMoney(pv.cost)}` : pv.cost < 0 ? `Money back ${formatMoney(-pv.cost)}` : 'Free');
  return { state: 'ok', title: pv.label || 'Ready', detail: bits.join(' · ') };
}

/** Short one-line version for the floating tip next to the shape. */
export function tipText(pv: BuildPreview): string {
  if (!pv.ok) return pv.reason ?? pv.reasons[0] ?? 'Cannot build here';
  if (pv.unchanged) return pv.reasons[0] ?? 'Nothing would change';
  const money = pv.cost > 0 ? formatMoney(pv.cost) : pv.cost < 0 ? `+${formatMoney(-pv.cost)}` : 'free';
  return pv.measure.text ? `${pv.measure.text} · ${money}` : `${pv.label} · ${money}`;
}

/** Why the household cannot pay `cost` right now, or null (free, affordable, or the sandbox). */
function affordReason(api: GameAPI, cost: number): string | null {
  if (cost <= 0) return null;
  const st = api.state();
  if (!st || st.settings.unlimitedFunds) return null;
  const funds = st.households[st.activeHouseholdId]?.funds ?? 0;
  return cost > funds ? `Not enough funds: costs ${formatMoney(cost)}, you have ${formatMoney(funds)}.` : null;
}

const keyOf = (t: BuildTarget | null): string => {
  if (!t) return '';
  const r = (p: BuildPoint | null | undefined) => (p ? `${Math.round(p.x * 4) / 4},${Math.round(p.z * 4) / 4}` : '-');
  return `${r(t.from)}|${r(t.to)}|${t.wallId ?? ''}|${t.level ?? 0}|${t.rect ? 'r' : ''}`;
};

export class BuildSession {
  private target: BuildTarget | null = null;
  private preview: BuildPreview | null = null;
  private pending = false;
  private dragging = false;
  private aborted = false;
  private lastKey = '';
  private toolKey = '';
  private hinted = '';
  /** The opening tool is in "turn around" mode (tool.flip === true while nothing is picked). */
  private flipMode = false;
  private readonly listeners = new Set<() => void>();
  private readonly offs: Array<() => void> = [];
  /** Milestone 9: the floor the tools work on. */
  private lastLevel = 0;

  private readonly sound: (id: SoundId) => void;
  private readonly toast: SessionHooks['toast'];

  constructor(private readonly api: GameAPI, hooks: SessionHooks) {
    this.sound = hooks.sound;
    this.toast = hooks.toast;
    this.toolKey = JSON.stringify(api.buildTool());
    this.offs.push(api.onChange((what) => {
      if (what === 'mode') { this.reset(); return; }
      if (what === 'camera') this.followLevel();
      if (what === 'build') {
        const k = JSON.stringify(api.buildTool());
        if (k !== this.toolKey) { this.toolKey = k; this.dropTarget(); }
        this.emit();
      } else if (what === 'undo' || what === 'state') this.refresh();
    }));
    this.offs.push(api.events.on('lot.changed', () => this.refresh()));
    this.offs.push(api.events.on('state.replaced', () => this.reset()));
  }

  /** The floor the build tools work on (the HUD's floor selector). */
  level(): number { return this.api.view.level?.() ?? 0; }

  /** Another floor was chosen: the target, preview and room selection belonged to the old one. */
  private followLevel(): void {
    const l = this.level();
    if (l === this.lastLevel) return;
    this.lastLevel = l;
    this.selectedRoom = null;
    this.hoveredRoom = null;
    this.api.highlightRoom(null);
    this.dropTarget();
    this.emit();
  }

  destroy(): void { for (const off of this.offs.splice(0)) off(); this.listeners.clear(); }

  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit(): void { for (const fn of [...this.listeners]) fn(); }

  // ---- state ----

  tool(): BuildTool | null { return this.api.mode() === 'build' ? this.api.buildTool() : null; }

  state(): SessionState {
    const tool = this.tool();
    const pv = this.preview;
    const afford = pv?.ok && !pv.unchanged ? affordReason(this.api, pv.cost) : null;
    const canConfirm = !!this.target && !!pv && pv.ok && !pv.unchanged && !afford && !this.dragging;
    return {
      tool, mode: toolMode(tool), target: this.target, preview: pv, pending: this.pending, dragging: this.dragging, canConfirm,
      blockedReason: pv ? (!pv.ok ? pv.reason ?? pv.reasons[0] ?? null : pv.unchanged ? pv.reasons[0] ?? 'Nothing would change.' : afford) : null,
    };
  }

  // ---- rooms (no tool chosen): hover and selection ----

  private selectedRoom: string | null = null;
  private hoveredRoom: string | null = null;

  /** The selected room (tap with no tool), or null. */
  selection(): { uid: string; area: number } | null {
    if (!this.selectedRoom) return null;
    const r = this.api.rooms(this.level()).find((x) => x.uid === this.selectedRoom);
    return r ? { uid: r.uid, area: r.area } : null;
  }

  private indoorRoomAt(x: number, y: number) {
    const g = this.ground(x, y);
    const room = g ? this.api.roomAt({ x: Math.floor(g.x), z: Math.floor(g.z) }, this.level()) : null;
    return room && !room.outdoor ? room : null;
  }

  /** Mouse hover with no tool: outlines the room under the pointer unless one is selected. */
  hoverRoom(x: number, y: number): void {
    if (this.selectedRoom) return;
    const uid = this.indoorRoomAt(x, y)?.uid ?? null;
    if (uid === this.hoveredRoom) return;
    this.hoveredRoom = uid;
    this.api.highlightRoom(uid, 'hover');
  }

  /** Tap with no tool: selects the room under the point (a second tap on it, or outside any room, clears). */
  selectRoomAt(x: number, y: number): void {
    const uid = this.indoorRoomAt(x, y)?.uid ?? null;
    this.selectedRoom = uid && uid !== this.selectedRoom ? uid : null;
    this.hoveredRoom = null;
    this.api.highlightRoom(this.selectedRoom, 'selected');
    this.sound(this.selectedRoom ? 'select' : 'tap');
    this.emit();
  }

  clearRoomSelection(): void {
    if (!this.selectedRoom && !this.hoveredRoom) return;
    this.selectedRoom = null;
    this.hoveredRoom = null;
    this.api.highlightRoom(null);
    this.emit();
  }

  /** Previews demolishing the selected room (Confirm applies). */
  deleteSelectedRoom(): void {
    const room = this.api.rooms(this.level()).find((r) => r.uid === this.selectedRoom);
    const t = room?.tiles[0];
    if (!room || !t) return;
    this.setTool({ kind: 'deleteRoom' });
    this.target = { from: { x: t.x + 0.5, z: t.z + 0.5 }, level: this.level() };
    this.lastKey = '';
    this.runPreview();
    this.pending = true;
    this.emit();
  }

  // ---- tool selection ----

  /** Chooses the tool (null ends tool use). Clears the paint tool: only one tool at a time. */
  setTool(tool: BuildTool | null): void {
    if (tool) { this.api.setPaintTool(null); this.selectedRoom = null; this.hoveredRoom = null; }
    this.toolKey = JSON.stringify(tool);
    this.dropTarget();
    this.api.setBuildTool(tool);
    this.hinted = '';
    this.emit();
  }

  /** Toggles which way the door or window swings (placing, or an opening picked for moving). */
  flip(): void {
    const tool = this.api.buildTool();
    if (!tool) return;
    let next: BuildTool | null = null;
    if (tool.kind === 'opening') next = { ...tool, flip: !tool.flip };
    else if (tool.kind === 'stairs') next = { ...tool, rot: (((tool.rot ?? 0) + 1) % 4) };
    else if (tool.kind === 'moveOpening' && tool.openingId) {
      const st = this.api.state();
      const cur = st?.lots[st.activeLotId]?.openings[tool.openingId]?.flip ?? false;
      next = { ...tool, flip: !(tool.flip ?? cur) };
    }
    if (!next) return;
    const keep = this.target;
    this.toolKey = JSON.stringify(next);
    this.api.setBuildTool(next);
    this.target = keep;
    this.lastKey = '';
    this.runPreview();
    this.sound('tap');
  }

  // ---- target resolution ----

  private ground(x: number, y: number): BuildPoint | null {
    try { return this.api.view.groundPoint(x, y); } catch { return null; }
  }

  private targetAt(tool: BuildTool, x: number, y: number, pick?: PickResult): BuildTarget | null {
    if (usesWallPick(tool)) {
      const pk = pick ?? this.api.view.pick(x, y);
      if (pk.kind === 'wall') {
        const m = /^(\d+):([hv]):(-?\d+):(-?\d+)$/.exec(pk.wallId);
        if (m) {
          const ex = Number(m[3]), ez = Number(m[4]);
          return { from: m[2] === 'h' ? { x: ex + 0.5, z: ez } : { x: ex, z: ez + 0.5 }, wallId: pk.wallId, level: pk.level };
        }
      }
    }
    const g = this.ground(x, y);
    return g ? { from: g, level: this.level() } : null;
  }

  // ---- previews ----

  private runPreview(): void {
    const t = this.target;
    const k = keyOf(t);
    if (k === this.lastKey && this.preview) return;
    this.lastKey = k;
    this.preview = t ? this.api.buildPreview(t) : null;
    if (!t) this.api.buildCancel();
    this.syncRoomOutline();
    this.emit();
  }

  /** Milestone 9: previews the tool at a ground point without a pointer (the auto roof's panel), ready for Confirm. */
  aim(from: BuildPoint): void {
    if (!this.tool()) return;
    this.target = { from, level: this.level() };
    this.lastKey = '';
    this.runPreview();
    this.pending = true;
    this.emit();
  }

  /** Re-runs the preview of the current target (after undo, redo or any change to the lot). */
  refresh(): void {
    if (!this.target) return;
    this.lastKey = '';
    this.runPreview();
  }

  private syncRoomOutline(): void {
    const tool = this.api.buildTool();
    const wantsRoom = tool && (tool.kind === 'deleteRoom' || (tool.kind === 'floor' && tool.shape === 'room') || (tool.kind === 'eraseFloor' && tool.shape === 'room'));
    if (!wantsRoom || !this.target) { return; }
    const room = this.api.roomAt({ x: Math.floor(this.target.from.x), z: Math.floor(this.target.from.z) }, this.target.level ?? 0);
    this.api.highlightRoom(room && !room.outdoor ? room.uid : null, 'hover');
  }

  private dropTarget(): void {
    this.target = null;
    this.preview = null;
    this.pending = false;
    this.dragging = false;
    this.lastKey = '';
    try { this.api.highlightRoom(this.selectedRoom, 'selected'); } catch { /* optional */ }
  }

  /** Forgets target and preview (mode change, new world). The tool stays chosen in the game until that clears it. */
  reset(): void {
    this.selectedRoom = null;
    this.hoveredRoom = null;
    this.dropTarget();
    this.toolKey = JSON.stringify(this.api.buildTool());
    this.emit();
  }

  // ---- pointer input ----

  /** Mouse hover: previews click tools under the pointer (nothing is pending). */
  hover(x: number, y: number): void {
    const tool = this.tool();
    if (!tool || toolMode(tool) !== 'click' || this.dragging) return;
    if (tool.kind === 'moveOpening' && !tool.openingId) return;
    const t = this.targetAt(tool, x, y);
    if (!t) { if (this.target && !this.pending) { this.dropTarget(); this.api.buildCancel(); this.emit(); } return; }
    this.target = t;
    this.pending = false;
    this.runPreview();
  }

  /** The pointer left the canvas (mouse). */
  leave(): void {
    if (this.hoveredRoom) { this.hoveredRoom = null; this.api.highlightRoom(this.selectedRoom, 'selected'); }
    if (this.pending || this.dragging) return;
    if (this.target) { this.dropTarget(); this.api.buildCancel(); this.emit(); }
  }

  /** A tap (touch/pen) or click (mouse). Returns true when the session used it. */
  tap(x: number, y: number, kind: 'mouse' | 'touch' | 'pen', pick: PickResult): boolean {
    const tool = this.tool();
    if (!tool) return false;
    const mode = toolMode(tool);
    const mouse = kind === 'mouse';
    if (mode === 'drag') {
      if (((tool.kind === 'floor' || tool.kind === 'eraseFloor' || tool.kind === 'terrain') && tool.shape === 'rect')) {
        const g = this.ground(x, y);
        if (!g) return true;
        this.target = { from: g, to: g, level: this.level() };
        this.afterPoint(mouse);
        return true;
      }
      this.hint('Drag across the ground to draw it, then confirm.');
      return true;
    }
    if (tool.kind === 'moveOpening' && !tool.openingId) {
      this.flipMode = tool.flip === true;
      if (this.flipMode) this.tapFlip(x, y, pick, mouse); else this.pickOpening(x, y, pick);
      return true;
    }
    const t = this.targetAt(tool, x, y, pick);
    if (!t) return true;
    this.target = t;
    this.afterPoint(mouse);
    return true;
  }

  private afterPoint(mouse: boolean): void {
    this.lastKey = '';
    this.runPreview();
    if (mouse) { this.apply(true); return; }
    this.pending = true;
    this.sound(this.preview && (this.preview.ok || this.preview.unchanged) ? 'tap' : 'error');
    this.emit();
  }

  private hint(text: string): void {
    if (this.hinted === text) return;
    this.hinted = text;
    this.toast(text, 'info', 2400);
  }

  private pickOpening(x: number, y: number, pick: PickResult): void {
    const pk = pick.kind === 'wall' ? pick : this.api.view.pick(x, y);
    const found = pk.kind === 'wall' ? this.api.openingAt(pk.wallId) : null;
    if (!found) { this.toast('Tap a door or window to pick it up.', 'info', 2200); this.sound('error'); return; }
    this.setPickedOpening(found.openingId);
    const def = this.api.content.openings[found.defId];
    this.toast(`Picked up ${def?.name ?? 'the opening'}. Tap the wall to move it to.`, 'success', 2600);
    this.sound('select');
  }

  private setPickedOpening(openingId: string): void {
    const next: BuildTool = { kind: 'moveOpening', openingId };
    this.toolKey = JSON.stringify(next);
    this.target = null;
    this.preview = null;
    this.api.setBuildTool(next);
    this.emit();
  }

  /** Flip mode: tapping an opening previews it turned around. */
  tapFlip(x: number, y: number, pick: PickResult, mouse: boolean): void {
    const pk = pick.kind === 'wall' ? pick : this.api.view.pick(x, y);
    const found = pk.kind === 'wall' ? this.api.openingAt(pk.wallId) : null;
    if (!found) { this.toast('Tap a door or window to turn it around.', 'info', 2200); this.sound('error'); return; }
    const tool: BuildTool = { kind: 'moveOpening', openingId: found.openingId, flip: !found.flip };
    this.toolKey = JSON.stringify(tool);
    this.api.setBuildTool(tool);
    this.target = { from: { x: 0, z: 0 }, wallId: found.wallId, level: this.level() };
    this.lastKey = '';
    this.runPreview();
    if (mouse) { this.apply(true); return; }
    this.pending = true;
    this.emit();
  }

  drawStart(x: number, y: number, rect = false): void {
    const tool = this.tool();
    if (!tool || toolMode(tool) !== 'drag') return;
    const g = this.ground(x, y);
    if (!g) return;
    this.dragging = true;
    this.aborted = false;
    this.pending = false;
    this.target = { from: g, to: g, level: this.level(), ...(rect && tool.kind === 'fence' ? { rect: true as const } : {}) };
    this.lastKey = '';
    this.runPreview();
  }

  /** `rect` (desktop Shift) switches a fence drag to the rectangle loop, or back when released. */
  draw(x: number, y: number, rect?: boolean): void {
    if (!this.dragging || !this.target) return;
    const g = this.ground(x, y);
    if (!g) return;
    const next: BuildTarget = { ...this.target, to: g };
    if (rect !== undefined && next.wallId === undefined && this.tool()?.kind === 'fence') {
      if (rect) next.rect = true; else delete next.rect;
    }
    this.target = next;
    this.runPreview();
  }

  /** The drag ended: `interrupted` is a second finger or a cancelled pointer (the preview stays on touch). */
  drawEnd(x: number, y: number, interrupted: boolean, mouse: boolean, rect?: boolean): void {
    if (!this.dragging) return;
    if (!interrupted) this.draw(x, y, rect);
    this.dragging = false;
    if (this.aborted) { this.cancel(); return; }
    if (mouse) {
      if (interrupted) { this.cancel(); return; }
      this.apply(true);
      return;
    }
    this.pending = true;
    this.sound(this.preview && (this.preview.ok || this.preview.unchanged) ? 'tap' : 'error');
    this.emit();
  }

  // ---- handles (resizing before confirming) ----

  private lotSize(): { w: number; d: number } {
    const st = this.api.state();
    const lot = st?.lots[st.activeLotId];
    return { w: lot?.width ?? 32, d: lot?.depth ?? 32 };
  }

  private vertex(p: BuildPoint): BuildPoint {
    const { w, d } = this.lotSize();
    return { x: Math.max(0, Math.min(w, Math.round(p.x))), z: Math.max(0, Math.min(d, Math.round(p.z))) };
  }

  /** Where the drag handles sit (lot coordinates) for the pending shape; empty when none applies. */
  handles(): BuildHandle[] {
    const tool = this.tool();
    const t = this.target;
    if (!tool || !t || toolMode(tool) !== 'drag' || !this.pending) return [];
    const a = t.from, b = t.to ?? t.from;
    if ((tool.kind === 'floor' || tool.kind === 'eraseFloor' || tool.kind === 'terrain') && tool.shape === 'rect') {
      return [
        { id: 'a', x: Math.floor(a.x) + 0.5, z: Math.floor(a.z) + 0.5 },
        { id: 'b', x: Math.floor(b.x) + 0.5, z: Math.floor(b.z) + 0.5 },
      ];
    }
    const va = this.vertex(a), vb = this.vertex(b);
    if (tool.kind === 'room' || tool.kind === 'roof' || (tool.kind === 'eraseWall' && tool.shape === 'rect')) {
      const x0 = Math.min(va.x, vb.x), x1 = Math.max(va.x, vb.x), z0 = Math.min(va.z, vb.z), z1 = Math.max(va.z, vb.z);
      return [{ id: 'c0', x: x0, z: z0 }, { id: 'c1', x: x1, z: z0 }, { id: 'c2', x: x1, z: z1 }, { id: 'c3', x: x0, z: z1 }];
    }
    // a fence L or loop keeps both corners: dragging either handle reshapes the whole path
    if (tool.kind === 'fence' && (t.rect || (va.x !== vb.x && va.z !== vb.z))) {
      return [{ id: 'a', x: va.x, z: va.z }, { id: 'b', x: vb.x, z: vb.z }];
    }
    // run: the far end is straightened onto the dominant axis
    const end = Math.abs(vb.x - va.x) >= Math.abs(vb.z - va.z) ? { x: vb.x, z: va.z } : { x: va.x, z: vb.z };
    return [{ id: 'a', x: va.x, z: va.z }, { id: 'b', x: end.x, z: end.z }];
  }

  /** Moves a handle to the ground point under a screen position (while dragging it). */
  moveHandle(id: HandleId, x: number, y: number): void {
    const tool = this.tool();
    const t = this.target;
    const hs = this.handles();
    const g = this.ground(x, y);
    if (!tool || !t || !g || !hs.length) return;
    const me = hs.find((h) => h.id === id);
    if (!me) return;
    if (id === 'a') this.target = { ...t, from: g };
    else if (id === 'b') this.target = { ...t, to: g };
    else {
      const opposite = hs[(hs.findIndex((h) => h.id === id) + 2) % 4]!;
      this.target = { ...t, from: { x: opposite.x, z: opposite.z }, to: g };
    }
    this.runPreview();
  }

  // ---- confirm and cancel ----

  /** Applies the previewed shape. Returns the game's result (a toast tells the player either way). */
  apply(quiet = false): Result {
    const t = this.target;
    if (!t) return { ok: false, reason: 'Nothing to build yet.' };
    const tool = this.api.buildTool();
    const r = this.api.buildApply(t);
    if (!r.ok) {
      this.toast(r.reason, 'warning', 3200);
      this.sound('error');
      if (quiet) { this.cancelPreviewOnly(); }
      return r;
    }
    this.sound(tool?.kind === 'floor' ? 'paint' : tool?.kind === 'eraseWall' || tool?.kind === 'eraseOpening' || tool?.kind === 'eraseFloor' || tool?.kind === 'deleteRoom' || tool?.kind === 'eraseStairs' ? 'sell' : 'place');
    const money = (r.cost ?? 0) > 0 ? ` for ${formatMoney(r.cost ?? 0)}` : (r.cost ?? 0) < 0 ? `, ${formatMoney(-(r.cost ?? 0))} back` : '';
    this.toast(`${r.label ?? 'Done'}${money}. Undo is in the panel.`, 'success', 2600);
    this.dropTarget();
    if (tool?.kind === 'moveOpening' && tool.openingId) this.backToIdle();
    this.emit();
    return r;
  }

  /** After moving or turning an opening: ready to pick the next one. */
  private backToIdle(): void {
    const idle: BuildTool = { kind: 'moveOpening', openingId: null, ...(this.flipMode ? { flip: true } : {}) };
    this.toolKey = JSON.stringify(idle);
    this.api.setBuildTool(idle);
  }

  private cancelPreviewOnly(): void {
    this.dropTarget();
    this.api.buildCancel();
    this.emit();
  }

  confirm(): Result {
    const st = this.state();
    if (!st.canConfirm) return { ok: false, reason: st.blockedReason ?? 'Nothing to build yet.' };
    return this.apply();
  }

  /**
   * Cancels the shape being drawn or waiting for Confirm. Returns true when there was one (Esc then does nothing
   * else); a second call with nothing pending ends the tool.
   */
  cancel(): boolean {
    const tool = this.api.buildTool();
    if (!this.target && !this.preview && !this.dragging && tool?.kind === 'moveOpening' && tool.openingId) { this.backToIdle(); this.emit(); return true; }
    if (this.dragging) { this.aborted = true; this.dragging = false; this.cancelPreviewOnly(); return true; }
    if (this.target || this.preview) { this.cancelPreviewOnly(); this.sound('close'); return true; }
    return false;
  }
}
