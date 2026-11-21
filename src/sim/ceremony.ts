// Wedding ceremony choreography (Milestone: social gaps pass follow-up). The eventStage entry of a wedding (sim/events.ts)
// calls beginCeremony: it picks a spot on the lot, then queues an `attendCeremony` action (a tile goal that stands and
// waits) for the couple, an officiant and the guests who are on the lot. When both of the couple have arrived and have
// stood facing each other for a moment, the host's action calls performCeremony (the unchanged feed line, goal, bond change
// and memories). If the couple cannot get there in time, a second eventStage entry (data.phase 'vows') says the vows where
// they stand, so a wedding never gets stuck.
//
// - Spot: next to a placed object tagged 'wedding-arch' (the garden arbour) when one has two free stand tiles side by side,
//   otherwise an open pair of tiles near the lot centre. The couple take the two tiles and face each other; guests fill tiles
//   on the open side, at least CEREMONY_GUEST_MIN tiles away, facing the couple. An officiant (a guest who is a young adult
//   or older) stands at the end of the couple's row; without one that place stays empty.
// - Everything is deterministic: pairs, tiles and people are ordered by coordinates and ids, no random draws, no wall clock.
// - The actions carry everything they need in `data` (eventId, role, fx, fz), so nothing new is saved on the event.

import type { Tile } from '../core/nav';
import { pairKey } from '../core/ids';
import { isAdult } from '../core/relations';
import { addFeed, isProcessed, markProcessed } from '../core/state';
import type { ActionInstance, HomeEvent, Id, Person } from '../core/types';
import { objectTiles } from '../world/placement';
import { requestCancel } from './actions';
import type { SimCtx } from './context';
import { lotLoc, lotObjects, setAnim, tileOfLoc } from './context';
import { findEvent, participantsOf, performCeremony } from './events';
import { isBroken } from './housekeeping';
import { insertAction, makeAction } from './queue';
import type { Behavior, Step } from './steps';
import { CEREMONY_CHEER_MINUTES, CEREMONY_GUEST_MIN, CEREMONY_GUEST_RADIUS, CEREMONY_VOWS_MINUTES, CEREMONY_WALK_MINUTES } from './tuning';

export const CEREMONY_INTERACTION = 'attendCeremony';
export const WEDDING_ARCH_TAG = 'wedding-arch';

type CeremonyRole = 'host' | 'partner' | 'officiant' | 'guest';

/** Where a ceremony takes place: the couple's two tiles, the officiant's tile (when one can stand) and the guests' tiles in order. */
export interface CeremonySpot {
  a: Tile;
  b: Tile;
  officiant: Tile | null;
  guests: Tile[];
  /** The object the couple stand at (an arbour), or null on open ground. */
  arch: Id | null;
}

const centre = (t: Tile) => ({ x: t.x + 0.5, z: t.z + 0.5 });
const byTile = (p: Tile, q: Tile) => p.x - q.x || p.z - q.z;

/** The tiles guests can stand on for a couple at (a, b) with the open side towards `out`, nearest rows first. */
function guestTiles(ctx: SimCtx, lotId: Id, level: number, a: Tile, b: Tile, out: { x: number; z: number }, taken: Tile[]): Tile[] {
  const lot = ctx.state.lots[lotId];
  if (!lot) return [];
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  const u = { x: b.x - a.x, z: b.z - a.z };
  const list: Array<{ t: Tile; along: number; side: number }> = [];
  for (let x = Math.max(0, Math.floor(mid.x) - CEREMONY_GUEST_RADIUS); x <= Math.min(lot.width - 1, Math.ceil(mid.x) + CEREMONY_GUEST_RADIUS); x++) {
    for (let z = Math.max(0, Math.floor(mid.z) - CEREMONY_GUEST_RADIUS); z <= Math.min(lot.depth - 1, Math.ceil(mid.z) + CEREMONY_GUEST_RADIUS); z++) {
      const rel = { x: x - mid.x, z: z - mid.z };
      const along = rel.x * out.x + rel.z * out.z;
      if (along < CEREMONY_GUEST_MIN || along > CEREMONY_GUEST_RADIUS) continue;
      if (taken.some((t) => t.x === x && t.z === z) || !ctx.nav.isWalkable(lotId, level, x, z)) continue;
      list.push({ t: { x, z }, along, side: Math.abs(rel.x * u.x + rel.z * u.z) });
    }
  }
  list.sort((p, q) => p.along - q.along || p.side - q.side || byTile(p.t, q.t));
  return list.map((e) => e.t);
}

/** Orthogonally adjacent pairs of tiles in `tiles` (sorted), each as [a, b] with a before b. */
function adjacentPairs(tiles: Tile[]): Array<[Tile, Tile]> {
  const has = new Set(tiles.map((t) => `${t.x},${t.z}`));
  const out: Array<[Tile, Tile]> = [];
  for (const t of tiles) {
    for (const n of [{ x: t.x + 1, z: t.z }, { x: t.x, z: t.z + 1 }]) if (has.has(`${n.x},${n.z}`)) out.push([t, n]);
  }
  return out;
}

/**
 * The best ceremony spot on a lot at ground level, or null when there is no room: an arch's stand tiles first, else open
 * ground around the lot centre. Among the pairs of one kind, the one with the most room for guests wins (ties: coordinates).
 */
export function findCeremonySpot(ctx: SimCtx, lotId: Id, level = 0): CeremonySpot | null {
  const lot = ctx.state.lots[lotId];
  if (!lot) return null;
  const walk = (t: Tile) => t.x >= 0 && t.z >= 0 && t.x < lot.width && t.z < lot.depth && ctx.nav.isWalkable(lotId, level, t.x, t.z);
  const make = (a: Tile, b: Tile, from: { x: number; z: number }, arch: Id | null): CeremonySpot | null => {
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const u = { x: b.x - a.x, z: b.z - a.z };
    const v = { x: u.z, z: u.x }; // perpendicular to the row of the couple
    const dot = (mid.x - from.x) * v.x + (mid.z - from.z) * v.z;
    const s = dot < 0 ? -1 : 1;
    const out = { x: v.x * s, z: v.z * s };
    const officiant = [{ x: a.x - u.x, z: a.z - u.z }, { x: b.x + u.x, z: b.z + u.z }].find(walk) ?? null;
    const guests = guestTiles(ctx, lotId, level, a, b, out, officiant ? [a, b, officiant] : [a, b]);
    return guests.length === 0 ? null : { a, b, officiant, guests, arch };
  };
  const better = (best: CeremonySpot | null, c: CeremonySpot | null) => (c && (!best || Math.min(c.guests.length, 12) > Math.min(best.guests.length, 12)) ? c : best);

  // 1. At an arch: the two stand tiles side by side in front of (or beside) it.
  let best: CeremonySpot | null = null;
  const arches = lotObjects(ctx, lotId, level)
    .filter((r) => r.def.tags.includes(WEDDING_ARCH_TAG) && !isBroken(r.obj))
    .sort((p, q) => (p.obj.id < q.obj.id ? -1 : p.obj.id > q.obj.id ? 1 : 0));
  for (const r of arches) {
    const tiles = objectTiles(r.obj, r.def);
    if (tiles.length === 0) continue;
    const from = { x: tiles.reduce((s, t) => s + t.x, 0) / tiles.length, z: tiles.reduce((s, t) => s + t.z, 0) / tiles.length };
    const stand = ctx.nav.standTilesNear(lotId, r.obj.id).filter(walk).sort(byTile);
    for (const [a, b] of adjacentPairs(stand)) best = better(best, make(a, b, from, r.obj.id));
  }
  if (best) return best;

  // 2. Open ground near the lot centre, the open side towards +z.
  const cx = Math.floor(lot.width / 2), cz = Math.floor(lot.depth / 2);
  for (let r = 0; r <= 8 && !best; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const a = { x: cx + dx, z: cz + dz }, b = { x: a.x + 1, z: a.z };
        if (walk(a) && walk(b)) best = better(best, make(a, b, { x: a.x + 0.5, z: a.z - 1 }, null));
      }
    }
  }
  return best;
}

/** The guests of the event on its lot who can stand at a ceremony (babies and toddlers are carried or minded), in id order. */
function ceremonyGuests(ctx: SimCtx, ev: HomeEvent): Person[] {
  const out: Person[] = [];
  for (const id of [...ev.arrivedIds].sort()) {
    const g = ctx.state.people[id];
    if (!g || g.id === ev.hostId || g.id === ev.partnerId || g.lifeStage === 'baby' || g.lifeStage === 'toddler') continue;
    if (lotLoc(g)?.lotId === ev.lotId) out.push(g);
  }
  return out;
}

function queueCeremonyAction(ctx: SimCtx, p: Person, ev: HomeEvent, role: CeremonyRole, at: Tile, face: Tile): boolean {
  const f = centre(face);
  const a = makeAction(ctx, p, {
    interactionId: CEREMONY_INTERACTION,
    target: { kind: 'tile', x: at.x, z: at.z, level: 0 },
    data: { eventId: ev.id, role, fx: f.x, fz: f.z },
  }, 'schedule');
  return insertAction(ctx, p, a);
}

/**
 * eventStage entry of a wedding: sends the couple, the officiant and the guests to the ceremony spot. The vows happen when the
 * couple stand there (see attendCeremonyBehavior); when anything about the ceremony cannot be arranged the vows are said at
 * once where everybody is (performCeremony), as before. Processed once.
 */
export function beginCeremony(ctx: SimCtx, id: Id): void {
  const ev = findEvent(ctx.state, id);
  if (!ev || ev.status !== 'running' || ev.ceremony || ev.partnerId === undefined) { performCeremony(ctx, id); return; }
  const a = ctx.state.people[ev.hostId], b = ctx.state.people[ev.partnerId];
  const la = a ? lotLoc(a) : null, lb = b ? lotLoc(b) : null;
  const engaged = !!a && !!b && ctx.state.bonds[pairKey(a.id, b.id)]?.status === 'engaged';
  const spot = a && b && la && lb && la.lotId === ev.lotId && lb.lotId === ev.lotId && engaged ? findCeremonySpot(ctx, ev.lotId, 0) : null;
  const reach = (p: Person, to: Tile): boolean => {
    const loc = lotLoc(p);
    if (!loc || loc.level !== 0) return false;
    ctx.counters.routeRequests++;
    return ctx.nav.findPath(loc.lotId, loc.level, tileOfLoc(loc), [to]) !== null;
  };
  if (!a || !b || !spot || !reach(a, spot.a) || !reach(b, spot.b)) { performCeremony(ctx, id); return; }

  const occurrence = `wedding:${ev.id}:choreo`;
  if (isProcessed(ctx.state, occurrence)) return;
  markProcessed(ctx.state, occurrence);
  const ok = queueCeremonyAction(ctx, a, ev, 'host', spot.a, spot.b) && queueCeremonyAction(ctx, b, ev, 'partner', spot.b, spot.a);
  if (!ok) { endCeremonyActions(ctx, ev); performCeremony(ctx, id); return; }

  const guests = ceremonyGuests(ctx, ev);
  const officiant = spot.officiant ? guests.find((g) => isAdult(g)) : undefined;
  if (officiant && spot.officiant) queueCeremonyAction(ctx, officiant, ev, 'officiant', spot.officiant, spot.a);
  const mid = { x: Math.floor((spot.a.x + spot.b.x) / 2), z: Math.floor((spot.a.z + spot.b.z) / 2) };
  let next = 0;
  for (const g of guests) {
    if (g === officiant) continue;
    const t = spot.guests[next++];
    if (!t) break;
    queueCeremonyAction(ctx, g, ev, 'guest', t, mid);
  }
  if (ctx.state.households[ev.householdId]?.isPlayable) addFeed(ctx.state, ctx.events, 'info', `${a.firstName} and ${b.firstName} head for the ${spot.arch ? 'arbour' : 'ceremony spot'}. The guests gather round.`, a.id);
  // If the couple are not there in time the vows are said where they stand.
  ctx.state.schedule.push({ occurrence: `eventstage:${ev.id}:vows`, at: ctx.now + CEREMONY_WALK_MINUTES, kind: 'eventStage', data: { eventId: ev.id, phase: 'vows' } });
}

/**
 * The ceremony was resolved (vows said or missed): ceremony actions that are queued or still walking are cancelled; those
 * already standing at the spot finish on their own after a short cheer.
 */
export function endCeremonyActions(ctx: SimCtx, ev: HomeEvent): void {
  for (const pid of participantsOf(ctx.state, ev)) {
    const p = ctx.state.people[pid];
    if (!p) continue;
    for (const a of [...p.queue]) {
      if (a.interactionId === CEREMONY_INTERACTION && a.data.eventId === ev.id && a.phase !== 'perform') requestCancel(ctx, p, a.id);
    }
  }
}

function ceremonyEvent(ctx: SimCtx, a: ActionInstance): HomeEvent | undefined {
  const ev = typeof a.data.eventId === 'string' ? findEvent(ctx.state, a.data.eventId) : undefined;
  return ev && (ev.status === 'running' || ev.status === 'invited') ? ev : undefined;
}

/** Stand at a place of a wedding ceremony; the host's action says the vows once the couple are both in place. */
export const attendCeremonyBehavior: Behavior = {
  check(ctx, p, a) {
    const loc = lotLoc(p);
    const ev = ceremonyEvent(ctx, a);
    if (!ev || ev.ceremony) return 'The ceremony is over.';
    if (!loc || a.target.kind !== 'tile' || !ctx.nav.isWalkable(loc.lotId, a.target.level ?? loc.level, a.target.x, a.target.z)) return "Can't get there.";
    return null;
  },
  reserve: () => null,
  step(_ctx, _p, a): Step | string {
    if (a.target.kind !== 'tile') return "Can't get there.";
    const face = typeof a.data.fx === 'number' && typeof a.data.fz === 'number' ? { x: a.data.fx, z: a.data.fz } : undefined;
    return {
      goal: { kind: 'tile', tile: { x: a.target.x, z: a.target.z, level: a.target.level ?? 0 }, ...(face ? { face } : {}), label: 'the ceremony' },
      posture: 'standing', performAnim: a.data.role === 'officiant' ? 'talk' : a.data.role === 'guest' ? 'foldArms' : 'idle',
      duration: { kind: 'external' }, rates: {},
    };
  },
  tick(ctx, p, a) {
    const ev = ceremonyEvent(ctx, a);
    if (!ev || a.elapsed > CEREMONY_WALK_MINUTES + 15) return 'done';
    if (ev.ceremony) {
      // Everybody who is there cheers for a moment, then goes back to their evening.
      a.data.cheerAt ??= ctx.now;
      setAnim(p, a.data.role === 'officiant' ? 'idle' : a.data.role === 'guest' ? 'wave' : 'laugh', ctx.now);
      return ctx.now - (a.data.cheerAt as number) >= CEREMONY_CHEER_MINUTES ? 'done' : null;
    }
    if (a.data.role !== 'host' || a.elapsed < CEREMONY_VOWS_MINUTES || ev.partnerId === undefined) return null;
    const mate = ctx.state.people[ev.partnerId]?.queue[0];
    if (mate?.interactionId === CEREMONY_INTERACTION && mate.data.eventId === ev.id && mate.phase === 'perform') performCeremony(ctx, ev.id);
    return null;
  },
};
