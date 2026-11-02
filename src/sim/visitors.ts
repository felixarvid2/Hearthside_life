// Visitors and the world schedule. Neighbours live off-lot at home. On day 0 at 17:00 the first
// neighbour visits (occurrence `visit:<personId>:0`, when settings.visitors) and introduces themself;
// later random drop-ins happen at most once every two days; phoneInvite schedules a visit in 60 minutes.
// Visitors walk in from the lot entry, socialise and sit, leave after 2-3 hours to the entry and go home. Event
// guests (sim/events.ts) stay until the event ends. Every visit is an event (a visit, welcome wagon, drop-in or
// reconciliation) with goals and a small reward; before leaving, a visitor says goodbye to somebody they know.

import { atDayMinute, dayIndex } from '../core/clock';
import { facingTo } from '../core/geometry';
import { addFeed, isProcessed, markProcessed } from '../core/state';
import type { GameMinutes, Id, Person, ScheduledEvent, WorldState } from '../core/types';
import { requestCancel } from './actions';
import { guestArrived, runEventEntry, startAmbientEvent } from './events';
import { runScheduledTask } from './housework';
import { completeTrip } from './lotTravel';
import type { SimCtx } from './context';
import { lotLoc, setAnim } from './context';
import { insertAction, makeAction } from './queue';
import { peekRel } from './relationships';
import { personAvailable, socialRequirementReason } from './social';
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
  // Friends drop by more often than people one barely knows.
  const hh = ctx.state.households[ctx.state.activeHouseholdId];
  const weight = (p: Person) => 1 + Math.max(0, ...(hh?.memberIds ?? []).map((m) => peekRel(ctx.state, p.id, m).friendship)) / 25;
  const total = candidates.reduce((s, p) => s + weight(p), 0);
  let r = ctx.rng.next() * total;
  let who = candidates[candidates.length - 1]!;
  for (const c of candidates) { r -= weight(c); if (r <= 0) { who = c; break; } }
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
    else if (e.kind === 'eventStart' || e.kind === 'eventEnd') runEventEntry(ctx, e);
    else if (e.kind === 'custom') runScheduledTask(ctx, e);
    else if (e.kind === 'travelArrive') completeTrip(ctx, e);
    // Other kinds (bills) are handled by later milestones; returns from work use career state.
  }
}

function arrive(ctx: SimCtx, p: Person, e: ScheduledEvent): void {
  const invited = typeof e.data?.invitedBy === 'string';
  if (!invited && !ctx.state.settings.visitors) return;
  if (p.location.kind !== 'offlot' || p.location.transit) return;
  // Visits go to the host's home lot (Milestone 7). While the household is somewhere else the visit waits (a little
  // while) instead of arriving at a venue or never; a visitor who is out comes straight from there.
  const host = ctx.state.households[ctx.state.activeHouseholdId];
  const hostLotId = typeof e.data?.lotId === 'string' ? e.data.lotId : host?.homeLotId ?? ctx.state.activeLotId;
  const lot = ctx.state.lots[ctx.state.activeLotId];
  if (!lot) return;
  if (lot.id !== hostLotId) { deferVisit(ctx, e); return; }
  // Someone at work cannot come to an event (they are simply missed); an ordinary visit waits until they are free.
  if (p.location.place === 'work') { if (typeof e.data?.eventId !== 'string') deferVisit(ctx, e); return; }
  if (ctx.state.households[p.householdId]?.homeLotId === lot.id) return;
  const x = lot.entry.x + 0.5, z = lot.entry.z + 0.5;
  p.location = { kind: 'lot', lotId: lot.id, level: lot.entry.level, x, z, posture: 'standing', facing: facingTo(x, z, lot.width / 2, lot.depth / 2) };
  p.queue = [];
  setAnim(p, 'idle', ctx.now);
  ctx.events.emit({ type: 'person.changed', personId: p.id, what: 'location' });
  const eventId = typeof e.data?.eventId === 'string' ? e.data.eventId : null;
  let leaveAt = eventId ? guestArrived(ctx, p, eventId) : null;
  if (leaveAt === null) {
    leaveAt = ctx.now + ctx.rng.int(VISIT_MIN_MINUTES, VISIT_MAX_MINUTES);
    const type = e.data?.first === true ? 'welcomeWagon' : e.data?.reconcile === true ? 'reconciliation' : invited ? 'visit' : 'dropIn';
    startAmbientEvent(ctx, type, p, leaveAt);
    addFeed(ctx.state, ctx.events, 'social', invited ? `${p.firstName} came over.` : `${p.firstName} dropped by.`, p.id);
  }
  ctx.state.schedule.push({ occurrence: `leave:${p.id}:${Math.round(ctx.now)}`, at: leaveAt, kind: 'visitLeave', personId: p.id });
  // A newcomer introduces themself right away when someone is free; otherwise they walk in and greet
  // people later through visitor autonomy (strangers prefer greetings).
  if (!(e.data?.first === true && introduce(ctx, p))) {
    const t = walkInTile(ctx, p);
    if (t) insertAction(ctx, p, makeAction(ctx, p, { interactionId: 'goHere', target: { kind: 'tile', x: t.x, z: t.z, level: lot.entry.level } }, 'schedule'));
  }
}

/** Tries a visit again in 15 minutes until its patience (data.until, default 3 hours after it was due) runs out. */
function deferVisit(ctx: SimCtx, e: ScheduledEvent): void {
  const until = typeof e.data?.until === 'number' ? e.data.until : e.at + 180;
  if (ctx.now + 15 > until) return;
  delete ctx.state.processed[e.occurrence];
  ctx.state.schedule.push({ ...e, at: ctx.now + 15, data: { ...(e.data ?? {}), until } });
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
  // Leave politely: say goodbye to the household member they know best (if one is free), then go.
  const bye = goodbyeTarget(ctx, p);
  if (bye) p.queue.push(makeAction(ctx, p, { interactionId: 'waveGoodbye', target: { kind: 'person', personId: bye.id } }, 'schedule'));
  const leave = makeAction(ctx, p, { interactionId: 'leaveLot', target: { kind: 'self' } }, 'schedule');
  p.queue.push(leave);
  ctx.events.emit({ type: 'person.changed', personId: p.id, what: 'queue' });
}

/** The household member a leaving guest says goodbye to: the one they know best who is free and nearby. */
function goodbyeTarget(ctx: SimCtx, p: Person): Person | null {
  const def = ctx.content.socials.waveGoodbye;
  const loc = lotLoc(p);
  if (!def || !loc || !p.isNpc) return null;
  const hh = ctx.state.households[ctx.state.activeHouseholdId];
  let best: Person | null = null, bestScore = -Infinity;
  for (const id of hh?.memberIds ?? []) {
    const m = ctx.state.people[id];
    const ml = m ? lotLoc(m) : null;
    if (!m || !ml || ml.lotId !== loc.lotId || m.id === p.id) continue;
    if (personAvailable(ctx, m, p) !== null || socialRequirementReason(ctx, p, m, def) !== null) continue;
    const score = peekRel(ctx.state, p.id, m.id).familiarity - Math.hypot(ml.x - loc.x, ml.z - loc.z);
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

/** Safety net: a visitor on the lot with no pending departure gets one (e.g. after an old save). */
export function ensureDepartures(ctx: SimCtx): void {
  for (const p of Object.values(ctx.state.people)) {
    const loc = lotLoc(p);
    if (!loc || ctx.state.households[p.householdId]?.homeLotId === loc.lotId) continue;
    if (!p.isNpc || ctx.state.lots[loc.lotId]?.kind === 'venue') continue;
    if (p.queue.some((a) => a.interactionId === 'leaveLot')) continue;
    if (ctx.state.schedule.some((e) => e.kind === 'visitLeave' && e.personId === p.id)) continue;
    ctx.state.schedule.push({ occurrence: `leave:${p.id}:${Math.round(ctx.now)}`, at: ctx.now + 60, kind: 'visitLeave', personId: p.id });
  }
}
