// Visitors and the world schedule. Neighbours live off-lot at home. On day 0 at 17:00 the first
// neighbour visits (occurrence `visit:<personId>:0`, when settings.visitors) and introduces themself;
// later random drop-ins happen at most once every two days; phoneInvite schedules a visit in 60 minutes.
// Visitors walk in from the lot entry, socialise and sit, leave after 2-3 hours to the entry and go home.

import { atDayMinute, dayIndex } from '../core/clock';
import { facingTo } from '../core/geometry';
import { addFeed, isProcessed, markProcessed } from '../core/state';
import type { GameMinutes, Id, Person, ScheduledEvent, WorldState } from '../core/types';
import { requestCancel } from './actions';
import { runScheduledTask } from './housework';
import type { SimCtx } from './context';
import { lotLoc, setAnim } from './context';
import { insertAction, makeAction } from './queue';
import { peekRel } from './relationships';
import { personAvailable } from './social';
import { walkInTile } from './travel';
import {
  DROP_IN_CHANCE, DROP_IN_EARLIEST, DROP_IN_LATEST, FIRST_VISIT_MINUTE, VISIT_MAX_MINUTES, VISIT_MIN_MINUTES,
} from './tuning';

/** People of other, non-playable households (neighbours), in household order. */
export function neighbours(state: WorldState): Person[] {
  const out: Person[] = [];
  for (const hh of Object.values(state.households)) {
    if (hh.id === state.activeHouseholdId || hh.isPlayable) continue;
    for (const id of hh.memberIds) { const p = state.people[id]; if (p) out.push(p); }
  }
  return out;
}

/** True when a visitArrive for this person is scheduled and not yet processed. */
export function isVisitPending(state: WorldState, personId: Id): boolean {
  return state.schedule.some((e) => e.kind === 'visitArrive' && e.personId === personId && !isProcessed(state, e.occurrence));
}

/** Adds a visitArrive to the schedule (no-op when that occurrence is already scheduled or processed). */
export function scheduleVisit(state: WorldState, personId: Id, at: GameMinutes, occurrence: string, data?: ScheduledEvent['data']): void {
  if (isProcessed(state, occurrence) || state.schedule.some((e) => e.occurrence === occurrence)) return;
  state.schedule.push({ occurrence, at, kind: 'visitArrive', personId, ...(data ? { data } : {}) });
}

/** Schedules the first neighbour's introduction visit on day 0 at 17:00 (idempotent). */
export function ensureFirstVisit(ctx: SimCtx): void {
  if (!ctx.state.settings.visitors || dayIndex(ctx.now) !== 0 || ctx.now >= FIRST_VISIT_MINUTE) return;
  const first = neighbours(ctx.state)[0];
  if (!first) return;
  const occurrence = `visit:${first.id}:0`;
  if (isProcessed(ctx.state, occurrence) || ctx.state.schedule.some((e) => e.occurrence === occurrence)) return;
  scheduleVisit(ctx.state, first.id, atDayMinute(0, FIRST_VISIT_MINUTE), occurrence, { first: true });
  markProcessed(ctx.state, 'visitday:0');
}

/** Daily rollover: maybe schedule a random drop-in today (at most once every two days). */
export function dailyDropIn(ctx: SimCtx, day: number): void {
  if (!ctx.state.settings.visitors || day < 1) return;
  if (isProcessed(ctx.state, `visitday:${day - 1}`) || isProcessed(ctx.state, `visitday:${day}`)) return;
  const candidates = neighbours(ctx.state).filter((p) => p.location.kind === 'offlot' && p.location.place === 'home' && !isVisitPending(ctx.state, p.id));
  if (candidates.length === 0) return;
  if (!ctx.rng.chance(DROP_IN_CHANCE)) return;
  const who = ctx.rng.pick(candidates);
  const minute = ctx.rng.int(DROP_IN_EARLIEST / 15, DROP_IN_LATEST / 15) * 15;
  scheduleVisit(ctx.state, who.id, atDayMinute(day, minute), `visit:${who.id}:${day}`);
  markProcessed(ctx.state, `visitday:${day}`);
}

/** Processes due schedule entries in time order (each occurrence once). */
export function processSchedule(ctx: SimCtx): void {
  const due = ctx.state.schedule.filter((e) => e.at <= ctx.now);
  if (due.length === 0) return;
  ctx.state.schedule = ctx.state.schedule.filter((e) => e.at > ctx.now);
  due.sort((a, b) => a.at - b.at || (a.occurrence < b.occurrence ? -1 : a.occurrence > b.occurrence ? 1 : 0));
  for (const e of due) {
    if (isProcessed(ctx.state, e.occurrence)) continue;
    markProcessed(ctx.state, e.occurrence);
    const p = e.personId ? ctx.state.people[e.personId] : undefined;
    if (e.kind === 'visitArrive' && p) arrive(ctx, p, e);
    else if (e.kind === 'visitLeave' && p) depart(ctx, p);
    else if (e.kind === 'custom') runScheduledTask(ctx, e);
    // Other kinds (bills) are handled by later milestones; returns from work use career state.
  }
}

function arrive(ctx: SimCtx, p: Person, e: ScheduledEvent): void {
  const invited = typeof e.data?.invitedBy === 'string';
  if (!invited && !ctx.state.settings.visitors) return;
  if (p.location.kind !== 'offlot' || p.location.place !== 'home') return;
  const lot = ctx.state.lots[ctx.state.activeLotId];
  if (!lot || ctx.state.households[p.householdId]?.homeLotId === lot.id) return;
  const x = lot.entry.x + 0.5, z = lot.entry.z + 0.5;
  p.location = { kind: 'lot', lotId: lot.id, level: lot.entry.level, x, z, posture: 'standing', facing: facingTo(x, z, lot.width / 2, lot.depth / 2) };
  p.queue = [];
  setAnim(p, 'idle', ctx.now);
  ctx.events.emit({ type: 'person.changed', personId: p.id, what: 'location' });
  const stay = ctx.rng.int(VISIT_MIN_MINUTES, VISIT_MAX_MINUTES);
  ctx.state.schedule.push({ occurrence: `leave:${p.id}:${Math.round(ctx.now)}`, at: ctx.now + stay, kind: 'visitLeave', personId: p.id });
  addFeed(ctx.state, ctx.events, 'social', invited ? `${p.firstName} came over.` : `${p.firstName} dropped by.`, p.id);
  // A newcomer introduces themself right away when someone is free; otherwise they walk in and greet
  // people later through visitor autonomy (strangers prefer greetings).
  if (!(e.data?.first === true && introduce(ctx, p))) {
    const t = walkInTile(ctx, p);
    if (t) insertAction(ctx, p, makeAction(ctx, p, { interactionId: 'goHere', target: { kind: 'tile', x: t.x, z: t.z, level: lot.entry.level } }, 'schedule'));
  }
}

/** The social a newcomer uses to introduce themself: 'introduce', else the first greeting social. */
export function introductionSocial(ctx: SimCtx): string | null {
  if (ctx.content.socials.introduce) return 'introduce';
  const greet = Object.values(ctx.content.socials).filter((s) => s.category === 'greeting' && s.status === 'ready').sort((a, b) => (a.id < b.id ? -1 : 1));
  return greet[0]?.id ?? null;
}

function introduce(ctx: SimCtx, visitor: Person): boolean {
  const socialId = introductionSocial(ctx);
  const vl = lotLoc(visitor);
  if (!socialId || !vl) return false;
  const hh = ctx.state.households[ctx.state.activeHouseholdId];
  let best: Person | null = null, bestD = Infinity;
  for (const id of hh?.memberIds ?? []) {
    const m = ctx.state.people[id];
    const ml = m ? lotLoc(m) : null;
    if (!m || !ml || ml.lotId !== vl.lotId) continue;
    if (peekRel(ctx.state, visitor.id, m.id).familiarity > 0) continue;
    if (personAvailable(ctx, m, visitor) !== null) continue;
    const d = Math.hypot(ml.x - vl.x, ml.z - vl.z);
    if (d < bestD) { bestD = d; best = m; }
  }
  if (!best) return false;
  return insertAction(ctx, visitor, makeAction(ctx, visitor, { interactionId: socialId, target: { kind: 'person', personId: best.id } }, 'schedule'));
}

function depart(ctx: SimCtx, p: Person): void {
  if (!lotLoc(p)) return;
  for (const a of [...p.queue]) requestCancel(ctx, p, a.id);
  p.queue = p.queue.filter((a) => a.phase !== 'queued');
  const leave = makeAction(ctx, p, { interactionId: 'leaveLot', target: { kind: 'self' } }, 'schedule');
  p.queue.push(leave);
  ctx.events.emit({ type: 'person.changed', personId: p.id, what: 'queue' });
}

/** Safety net: a visitor on the lot with no pending departure gets one (e.g. after an old save). */
export function ensureDepartures(ctx: SimCtx): void {
  for (const p of Object.values(ctx.state.people)) {
    const loc = lotLoc(p);
    if (!loc || ctx.state.households[p.householdId]?.homeLotId === loc.lotId) continue;
    if (!p.isNpc) continue;
    if (p.queue.some((a) => a.interactionId === 'leaveLot')) continue;
    if (ctx.state.schedule.some((e) => e.kind === 'visitLeave' && e.personId === p.id)) continue;
    ctx.state.schedule.push({ occurrence: `leave:${p.id}:${Math.round(ctx.now)}`, at: ctx.now + 60, kind: 'visitLeave', personId: p.id });
  }
}
