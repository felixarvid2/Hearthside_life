// Shared simulation context and small lookup helpers used by every sim system.
// A SimCtx is built per tick/command from the current WorldState; nothing in it outlives the call
// except the runtime caches owned by Simulation (reservations), which are rebuilt from state.

import type { ContentDB, InteractionDef, ObjectDef, SocialDef } from '../content/types';
import type { AnimId } from '../core/anim';
import { LOOPING_ANIMS } from '../core/anim';
import type { EventBus } from '../core/events';
import type { NavProvider, Tile, WorldSlot } from '../core/nav';
import { rotatedSize } from '../core/geometry';
import type { Rng } from '../core/rng';
import type {
  GameMinutes, Household, Id, Lot, Person, PersonLocation, PlacedObject, WorldState,
} from '../core/types';
import type { Reservations } from './reservations';

/** Everything a sim system needs for one tick or command. */
export interface SimCtx {
  state: WorldState;
  content: ContentDB;
  nav: NavProvider;
  events: EventBus;
  /** Wraps state.rng in place: every draw advances the saved generator. */
  rng: Rng;
  res: Reservations;
  /** Current game minute (after the clock advanced for this tick). */
  now: GameMinutes;
  counters: { routeRequests: number };
}

export type LotLocation = Extract<PersonLocation, { kind: 'lot' }>;

/** The person's on-lot location, or null when off-lot. */
export function lotLoc(p: Person): LotLocation | null {
  return p.location.kind === 'lot' ? p.location : null;
}

export function tileOfLoc(loc: { x: number; z: number }): Tile {
  return { x: Math.floor(loc.x), z: Math.floor(loc.z) };
}

export const tileKeyXZ = (t: Tile) => `${t.x},${t.z}`;

export function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

// ---------------------------------------------------------------------------------------------
// Interactions (content plus a few built-in system interactions)
// ---------------------------------------------------------------------------------------------

function builtin(id: string, name: string, icon: string, behavior: string, kind: InteractionDef['kind']): InteractionDef {
  return {
    id, name, description: name, icon, kind, slotKinds: [], anims: { perform: 'idle' }, posture: 'standing',
    duration: { kind: 'fixed', minutes: 0 }, needsPerHour: {}, needsOnComplete: {}, behavior,
    autonomy: { enabled: false, ads: {}, tags: [] }, allowVisitors: true, status: 'ready',
  };
}

/** System interactions the simulation needs even when content does not define them. */
export const BUILTIN_INTERACTIONS: Readonly<Record<string, InteractionDef>> = {
  goHere: builtin('goHere', 'Go Here', 'walk', 'goHere', 'tile'),
  goToWork: builtin('goToWork', 'Go to Work', 'work', 'goToWork', 'self'),
  /** Internal: walk to the lot entry and leave the lot (visitors going home). Never offered in menus. */
  leaveLot: builtin('leaveLot', 'Go Home', 'home', 'leaveLot', 'self'),
};

export function interactionDef(ctx: Pick<SimCtx, 'content'>, id: string): InteractionDef | undefined {
  return ctx.content.interactions[id] ?? BUILTIN_INTERACTIONS[id];
}

export function socialDef(ctx: Pick<SimCtx, 'content'>, id: string): SocialDef | undefined {
  return ctx.content.socials[id];
}

/** Behavior id of an interaction or social (socials all use 'social'). */
export function behaviorOf(ctx: Pick<SimCtx, 'content'>, interactionId: string): string | null {
  const def = interactionDef(ctx, interactionId);
  if (def) return def.behavior ?? 'generic';
  if (socialDef(ctx, interactionId)) return 'social';
  return null;
}

export function actionLabel(ctx: Pick<SimCtx, 'content'>, interactionId: string): string {
  return interactionDef(ctx, interactionId)?.name ?? socialDef(ctx, interactionId)?.name ?? interactionId;
}

// ---------------------------------------------------------------------------------------------
// World lookups
// ---------------------------------------------------------------------------------------------

export function lotById(ctx: Pick<SimCtx, 'state'>, lotId: Id): Lot | undefined {
  return ctx.state.lots[lotId];
}

export interface ObjRef { obj: PlacedObject; def: ObjectDef }

export function objectRef(ctx: Pick<SimCtx, 'state' | 'content'>, lotId: Id, objectId: Id): ObjRef | null {
  const obj = ctx.state.lots[lotId]?.objects[objectId];
  if (!obj) return null;
  const def = ctx.content.objects[obj.defId];
  return def ? { obj, def } : null;
}

/** Objects on a lot level with their definitions, in placement order. */
export function lotObjects(ctx: Pick<SimCtx, 'state' | 'content'>, lotId: Id, level: number): ObjRef[] {
  const lot = ctx.state.lots[lotId];
  if (!lot) return [];
  const out: ObjRef[] = [];
  for (const obj of Object.values(lot.objects)) {
    if (obj.level !== level) continue;
    const def = ctx.content.objects[obj.defId];
    if (def) out.push({ obj, def });
  }
  return out;
}

/** Centre of an object's rotated footprint in lot metres. */
export function objectCenter(r: ObjRef): { x: number; z: number } {
  const s = rotatedSize(r.def.footprint, r.obj.rot);
  return { x: r.obj.x + s.w / 2, z: r.obj.z + s.d / 2 };
}

/** True when the point (metres) lies inside the object's rotated footprint. */
export function insideFootprint(r: ObjRef, x: number, z: number): boolean {
  const s = rotatedSize(r.def.footprint, r.obj.rot);
  return x >= r.obj.x && x < r.obj.x + s.w && z >= r.obj.z && z < r.obj.z + s.d;
}

export function findSlot(ctx: Pick<SimCtx, 'nav'>, lotId: Id, objectId: Id, slotId: string): WorldSlot | undefined {
  return ctx.nav.slotsOf(lotId, objectId).find((s) => s.slotId === slotId);
}

export function objectName(ctx: Pick<SimCtx, 'content'>, defId: string | undefined): string {
  const def = defId ? ctx.content.objects[defId] : undefined;
  return def ? def.name.toLowerCase() : 'object';
}

/** Objects that offer sitting (sofas, chairs, armchairs). Toilets and beds are excluded. */
export function isSeat(def: ObjectDef): boolean {
  return def.interactions.includes('sit') && def.slots.some((s) => s.kind === 'sit');
}

/** Stoves are identified by the 'stove' tag (fallbacks: subcategory or id prefix). */
export function isStove(def: ObjectDef): boolean {
  return def.tags.includes('stove') || def.subcategory === 'stove' || def.id.startsWith('stove');
}

/** Tables (dining, coffee, desks) that meals can be eaten at. */
export function isTable(def: ObjectDef): boolean {
  return def.surfaceHeight !== undefined && def.layer === 'floor' &&
    (def.category === 'tables' || def.tags.includes('table') || def.tags.includes('desk'));
}

// ---------------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------------

export function householdOf(ctx: Pick<SimCtx, 'state'>, p: Person): Household | undefined {
  return ctx.state.households[p.householdId];
}

/** A visitor is a person on a lot that is not their household's home. */
export function isVisitor(ctx: Pick<SimCtx, 'state'>, p: Person): boolean {
  const loc = lotLoc(p);
  if (!loc) return false;
  return householdOf(ctx, p)?.homeLotId !== loc.lotId;
}

/** Sets the renderer's animation hint when it changes. */
export function setAnim(p: Person, id: AnimId, now: GameMinutes): void {
  if (p.anim.id === id) return;
  p.anim = { id, since: now, loop: LOOPING_ANIMS.has(id) };
}

export function setThought(p: Person, icon: string, text: string, until: GameMinutes): void {
  p.thought = { icon, text, until };
}

export function setPosture(p: Person, posture: LotLocation['posture']): void {
  const loc = lotLoc(p);
  if (loc) loc.posture = posture;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Deterministic small hash of a string (used for staggering, never for outcomes). */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
