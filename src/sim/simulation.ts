// The Simulation: one fixed tick advances the whole world (docs/ARCHITECTURE.md "Simulation flow per tick").
// All outcomes depend only on WorldState (including its rng), so the same seed gives the same world no
// matter how ticks are batched or whether the state was saved and loaded in between. Runtime caches
// (reservations) are rebuilt from state by rebuild(), which also runs automatically when getState()
// starts returning a different object.

import type { ContentDB } from '../content/types';
import { TICK_MINUTES, dayIndex, minuteOfDay } from '../core/clock';
import type { EventBus } from '../core/events';
import type { NavProvider } from '../core/nav';
import { Rng } from '../core/rng';
import { pruneProcessed } from '../core/state';
import type { ActionInstance, Id, WorldState } from '../core/types';
import { abortQueue, endAction, failNow, requestCancel, runPerson } from './actions';
import { checkAspiration } from './aspirations';
import { runAutonomy } from './autonomy';
import { behaviorFor } from './behaviors';
import {
  joinCareer, quitCareer, resolveCareerEvent, setCareerEffort, updateCareers,
} from './careers';
import { spoilMeals } from './cooking';
import { advanceGardens } from './garden';
import { payBill, setAutoPay, updateBills } from './economy';
import { cancelEvent, canPlanEvent, dailyReconciliation, ensureEventEnds, planEvent } from './events';
import type { PlanRequest, PlanResult } from './events';
import { runHousekeeping } from './housekeeping';
import type { SimCtx } from './context';
import { behaviorOf, dist, lotLoc } from './context';
import { computeMood, expireMoodlets } from './mood';
import { unstick } from './movement';
import { decayNeeds } from './needs';
import { optionsFor, requestReason } from './options';
import { insertAction, isStarted, makeAction } from './queue';
import { decayRelationships, syncBonds } from './relationships';
import { RESERVING_PHASES, Reservations, reservationKeys } from './reservations';
import { recentUses } from './social';
import { dailyDropIn, ensureDepartures, ensureFirstVisit, processSchedule } from './visitors';
import { moveHousehold, movePreview, switchHousehold, switchPreview } from './households';
import type { MovePreview, SwitchPreview } from './households';
import { startTrip, startTripHome, travelProblem } from './lotTravel';
import type { TripResult } from './lotTravel';
import { neighbourhoodInfo } from './neighbourhoodView';
import type { NeighbourhoodInfo } from './neighbourhoodView';
import { placeOf } from './places';
import type { PersonPlace } from './places';
import { reconcileStrays, runLightWorld } from './townlife';
import { ageUp, dailyAging } from './aging';
import { adopt, adoptionPreview } from './adoption';
import type { AdoptionPreview, AdoptionSpec, AdoptResult } from './adoption';
import { updateCare } from './care';
import { familyInfo } from './familyView';
import type { FamilyInfo } from './familyView';
import { reportCards, updateSchool } from './school';
import { splitHousehold, splitPreview } from './split';
import type { SplitPreview, SplitResult, SplitTarget } from './split';
import { cakeOnLot } from './care';
import { HOMEWORK_INTERACTION, offeredInteractionIds } from '../content/capabilities';
import { isDependentStage } from '../core/lifeStages';
import { lotObjects } from './context';
import { isBroken } from './housekeeping';
import type { ActionRequest, InteractionOption, QueueResult } from './types';

export type { ActionRequest, InteractionOption, QueueResult } from './types';

export interface SimulationOptions {
  getState: () => WorldState;
  content: ContentDB;
  nav: NavProvider;
  events: EventBus;
}

export class Simulation {
  private readonly getState: () => WorldState;
  private readonly content: ContentDB;
  private readonly nav: NavProvider;
  private readonly events: EventBus;
  private readonly res = new Reservations();
  private readonly counters = { routeRequests: 0 };
  private lastTickMs = 0;
  private seen: WorldState | null = null;

  constructor(o: SimulationOptions) {
    this.getState = o.getState;
    this.content = o.content;
    this.nav = o.nav;
    this.events = o.events;
    // Resync automatically; explicit rebuild()/onLotChanged() calls from game code stay valid (idempotent).
    o.events.on('state.replaced', () => { this.seen = null; });
    o.events.on('person.removed', () => { this.seen = null; });
    o.events.on('lot.changed', (e) => { if (e.what !== 'floors' && e.what !== 'roofs' && e.what !== 'terrain' && this.getState().lots[e.lotId]) this.onLotChanged(e.lotId); });
  }

  /** Context for the current state; rebuilds runtime caches first when the state object was replaced. */
  private ctx(): SimCtx {
    const state = this.getState();
    if (state !== this.seen) {
      this.seen = state;
      this.rebuildCaches(state);
    }
    return this.makeCtx(state);
  }

  private makeCtx(state: WorldState): SimCtx {
    return {
      state, content: this.content, nav: this.nav, events: this.events, rng: new Rng(state.rng), res: this.res,
      now: state.clock.minutes, counters: this.counters,
    };
  }

  /** One fixed tick (TICK_MINUTES game minutes). */
  tick(): void {
    const t0 = performance.now();
    const state = this.getState();
    if (state !== this.seen) { this.seen = state; this.rebuildCaches(state); }
    const prevDay = dayIndex(state.clock.minutes);
    // 1. Clock
    state.clock.minutes += TICK_MINUTES;
    state.clock.ticks += 1;
    const ctx = this.makeCtx(state);
    const day = dayIndex(ctx.now);
    if (day !== prevDay) this.dailyRollover(ctx, day);
    // 2. Schedule
    ensureFirstVisit(ctx);
    processSchedule(ctx);
    // 3. Careers and household bills
    updateCareers(ctx);
    updateSchool(ctx);
    updateCare(ctx);
    updateBills(ctx);
    // 3c. Everybody outside the household: jobs, bills and where they are, from timestamps (Milestone 7)
    if (minuteOfDay(ctx.now) % 15 === 0) runLightWorld(ctx);
    // 4. Needs
    const people = Object.values(state.people);
    for (const p of people) decayNeeds(ctx, p);
    // 5. Actions
    for (const p of people) if (state.people[p.id] && lotLoc(p)) runPerson(ctx, p);
    // 6. Autonomy
    runAutonomy(ctx);
    // 6b. Accidents and the moods of a clean or messy home
    runHousekeeping(ctx);
    // 7. Moodlets, thoughts, aspirations, meals
    for (const p of people) {
      expireMoodlets(p, ctx.now);
      if (p.thought && p.thought.until <= ctx.now) p.thought = null;
    }
    if (minuteOfDay(ctx.now) % 60 === 0) {
      for (const p of people) if (!p.isNpc) checkAspiration(ctx, p);
      ensureDepartures(ctx);
      ensureEventEnds(ctx);
      reconcileStrays(ctx);
    }
    spoilMeals(ctx);
    this.events.emit({ type: 'tick', minutes: ctx.now });
    this.lastTickMs = performance.now() - t0;
  }

  private dailyRollover(ctx: SimCtx, day: number): void {
    pruneProcessed(ctx.state, ctx.now);
    spoilMeals(ctx);
    for (const p of Object.values(ctx.state.people)) {
      for (const [k, until] of Object.entries(p.cooldowns)) if (until < ctx.now) delete p.cooldowns[k];
    }
    for (const rel of Object.values(ctx.state.relationships)) {
      for (const k of Object.keys(rel.recent)) if (recentUses(rel, k, ctx.now) === 0) delete rel.recent[k];
    }
    // Relationships fade without contact (bounded), bond statuses follow how people feel, visitors may call.
    decayRelationships(ctx.state, ctx.now);
    syncBonds(ctx.state, ctx.events, ctx.now);
    dailyDropIn(ctx, day);
    dailyReconciliation(ctx, day);
    // Family (Milestone 8): the week's report cards, then the day's aging and birthdays.
    reportCards(ctx, day);
    dailyAging(ctx);
    advanceGardens(ctx.state, ctx.events, day); // Milestone 9: crops grow by the day
  }

  /** Queues an interaction or social. Player orders precede autonomous ones and cancel a running autonomous action. */
  queue(personId: Id, req: ActionRequest): QueueResult {
    const ctx = this.ctx();
    const p = ctx.state.people[personId];
    if (!p) return { ok: false, reason: 'Unknown person.' };
    const source = req.source ?? 'player';
    if (source === 'player' && p.isNpc) return { ok: false, reason: `${p.firstName} decides for themself.` };
    if (!behaviorOf(ctx, req.interactionId)) return { ok: false, reason: 'That interaction is not available.' };
    const startsNow = !p.queue.some((x) => x.source !== 'autonomy');
    const reason = requestReason(ctx, p, req, startsNow);
    if (reason) return { ok: false, reason };
    const a = makeAction(ctx, p, req, source);
    if (!insertAction(ctx, p, a)) return { ok: false, reason: 'The queue is full.' };
    return { ok: true, actionId: a.id };
  }

  /** Requests cancellation (phase-appropriate cleanup runs on the next tick; queued actions go at once). */
  cancel(personId: Id, actionId: Id): void {
    const ctx = this.ctx();
    const p = ctx.state.people[personId];
    if (p) requestCancel(ctx, p, actionId);
  }

  /** Moves a queued (not running) action to another position behind the running one. */
  reorder(personId: Id, actionId: Id, toIndex: number): void {
    const ctx = this.ctx();
    const p = ctx.state.people[personId];
    if (!p) return;
    const idx = p.queue.findIndex((a) => a.id === actionId);
    const a = p.queue[idx];
    if (!a || a.phase !== 'queued') return;
    p.queue.splice(idx, 1);
    const min = isStarted(p.queue[0]) ? 1 : 0;
    const to = Math.max(min, Math.min(Math.floor(toIndex), p.queue.length));
    p.queue.splice(to, 0, a);
    this.events.emit({ type: 'person.changed', personId, what: 'queue' });
  }

  /** Context-menu entries (with disabled reasons) for a person and a target. */
  options(personId: Id, target: ActionInstance['target']): InteractionOption[] {
    const ctx = this.ctx();
    const p = ctx.state.people[personId];
    return p ? optionsFor(ctx, p, target) : [];
  }

  /**
   * After build/buy changes on a lot: actions whose objects vanished fail cleanly, people in a moved
   * object stand up, routes are replanned, meals on removed surfaces drop to the floor, and reservations
   * are rebuilt.
   */
  onLotChanged(lotId: Id): void {
    const ctx = this.ctx();
    this.nav.invalidate(lotId);
    for (const item of Object.values(ctx.state.items)) {
      if (item.lotId === lotId && item.position.onObjectId && !ctx.state.lots[lotId]?.objects[item.position.onObjectId]) {
        delete item.position.onObjectId;
        this.events.emit({ type: 'item.changed', itemId: item.id, lotId });
      }
    }
    for (const p of Object.values(ctx.state.people)) {
      const loc = lotLoc(p);
      if (!loc || loc.lotId !== lotId) continue;
      for (const a of [...p.queue]) {
        if (!RESERVING_PHASES.has(a.phase) || a.data.role === 'listen') continue;
        this.revalidateRunning(ctx, p.id, a);
      }
      if (p.queue.length === 0) unstick(ctx, p);
    }
    this.rebuildCaches(ctx.state);
  }

  private revalidateRunning(ctx: SimCtx, personId: Id, a: ActionInstance): void {
    const p = ctx.state.people[personId];
    const loc = p ? lotLoc(p) : null;
    if (!p || !loc) return;
    const beh = behaviorFor(ctx, a);
    const what = typeof a.data.what === 'string' ? a.data.what : 'object';
    if (a.target.kind === 'object' && !ctx.state.lots[loc.lotId]?.objects[a.target.objectId]) {
      this.endCleanly(ctx, p.id, a, `The ${what} was removed.`);
      return;
    }
    const step = beh ? beh.step(ctx, p, a) : 'That interaction is not available.';
    if (typeof step === 'string') { this.endCleanly(ctx, p.id, a, step.startsWith('It is gone') ? `The ${what} was removed.` : step); return; }
    if (a.phase === 'route' || a.phase === 'reserve') { a.route = []; return; }
    if (step.goal.kind === 'slot' && typeof a.data.backX === 'number') {
      if (dist(step.goal.slot.x, step.goal.slot.z, loc.x, loc.z) > 0.01) this.endCleanly(ctx, p.id, a, `The ${step.goal.label} was moved.`);
    }
  }

  /** Ends a started action at once: back to the approach tile, standing, reservations released. */
  private endCleanly(ctx: SimCtx, personId: Id, a: ActionInstance, reason: string): void {
    const p = ctx.state.people[personId];
    if (!p) return;
    if (a.phase === 'cleanup' && a.data.result === 'done') {
      const loc = lotLoc(p);
      if (loc && typeof a.data.backX === 'number' && typeof a.data.backZ === 'number') { loc.x = a.data.backX; loc.z = a.data.backZ; }
      if (loc) loc.posture = 'standing';
      endAction(ctx, p, a, 'done', null);
      unstick(ctx, p);
      return;
    }
    failNow(ctx, p, a, reason);
  }

  /** After load or state replacement: rebuilds reservations from queues; actions that can't resume end cleanly. */
  rebuild(): void {
    const state = this.getState();
    this.seen = state;
    this.rebuildCaches(state);
  }

  private rebuildCaches(state: WorldState): void {
    this.res.clear();
    const ctx = this.makeCtx(state);
    for (const p of Object.values(state.people)) {
      if (!lotLoc(p)) {
        if (p.queue.length > 0) abortQueue(ctx, p, null);
        continue;
      }
      // Only re-acquire what each action held (a pure function of its data). Actions whose target vanished
      // fail inside the next tick exactly as they would have in an uninterrupted run, so a save/load never
      // changes outcomes. Item portions are not re-checked: holders of a spoiled meal keep their claim
      // until their own step fails. Only a genuine conflict (an edited save) ends an action here.
      for (const a of [...p.queue]) {
        if (!p.queue.includes(a) || a.data.role === 'listen' || !RESERVING_PHASES.has(a.phase)) continue;
        if (!this.res.acquire(a.id, reservationKeys(a), () => Infinity)) this.endCleanly(ctx, p.id, a, 'Someone else is using it.');
      }
    }
  }

  /** Plans a home event (date, party, celebration) for the player's household; see sim/events.ts. */
  planEvent(req: PlanRequest): PlanResult {
    const ctx = this.ctx();
    return planEvent(ctx, req);
  }

  /** Why an event cannot be planned like this (host, guests, notice, money), or null. Pure. */
  eventProblem(req: PlanRequest): string | null {
    const ctx = this.ctx();
    const host = ctx.state.people[req.hostId];
    return host ? canPlanEvent(ctx, host, req.guestIds, req.type, req.startAt) : 'Unknown host.';
  }

  /** Cancels a planned (not yet started) event. */
  cancelEvent(eventId: Id): { ok: boolean; reason?: string } {
    const ctx = this.ctx();
    return cancelEvent(ctx, eventId);
  }

  // ---------------------------------------------------------------------------------------------
  // Careers and bills (Milestone 6)
  // ---------------------------------------------------------------------------------------------

  /** Takes a job for a member of the playable household. */
  joinCareer(personId: Id, careerId: string): { ok: boolean; reason?: string } {
    const ctx = this.ctx();
    const p = ctx.state.people[personId];
    if (!p) return { ok: false, reason: 'Unknown person.' };
    if (!ctx.state.households[p.householdId]?.isPlayable) return { ok: false, reason: `${p.firstName} decides for themself.` };
    return joinCareer(ctx, p, careerId);
  }

  /** Quits a member's current job. */
  quitCareer(personId: Id): { ok: boolean; reason?: string } {
    const ctx = this.ctx();
    const p = ctx.state.people[personId];
    if (!p) return { ok: false, reason: 'Unknown person.' };
    if (!ctx.state.households[p.householdId]?.isPlayable) return { ok: false, reason: `${p.firstName} decides for themself.` };
    return quitCareer(ctx, p);
  }

  /** Sets how hard a member works. */
  setCareerEffort(personId: Id, effort: 'slack' | 'normal' | 'hard'): { ok: boolean; reason?: string } {
    const ctx = this.ctx();
    const p = ctx.state.people[personId];
    return p ? setCareerEffort(ctx, p, effort) : { ok: false, reason: 'Unknown person.' };
  }

  /** Answers the current shift's on-the-job decision. */
  resolveCareerEvent(personId: Id, optionId: string): { ok: boolean; reason?: string } {
    const ctx = this.ctx();
    const p = ctx.state.people[personId];
    return p ? resolveCareerEvent(ctx, p, optionId) : { ok: false, reason: 'Unknown person.' };
  }

  /** Pays one bill of a member's household. */
  payBill(personId: Id, billId: Id): { ok: boolean; reason?: string; amount?: number } {
    const ctx = this.ctx();
    const p = ctx.state.people[personId];
    if (!p) return { ok: false, reason: 'Unknown person.' };
    if (!ctx.state.households[p.householdId]?.isPlayable) return { ok: false, reason: `${p.firstName} decides for themself.` };
    return payBill(ctx, p.householdId, billId);
  }

  /** Turns automatic bill payment on or off for a member's household. */
  setAutoPay(personId: Id, on: boolean): { ok: boolean; reason?: string } {
    const ctx = this.ctx();
    const p = ctx.state.people[personId];
    const hh = p ? ctx.state.households[p.householdId] : undefined;
    if (!p || !hh) return { ok: false, reason: 'Unknown household.' };
    if (!hh.isPlayable) return { ok: false, reason: `${p.firstName} decides for themself.` };
    setAutoPay(ctx.state, !!on);
    return { ok: true };
  }

  // ---------------------------------------------------------------------------------------------
  // Neighbourhood (Milestone 7)
  // ---------------------------------------------------------------------------------------------

  /** Why these household members cannot set out for the lot now, or null. Pure. */
  travelProblem(personIds: Id[], lotId: Id): string | null {
    return travelProblem(this.ctx(), personIds, lotId);
  }

  /** Sets members of the household the player runs off for a lot; see sim/lotTravel.ts. */
  travel(personIds: Id[], lotId: Id): TripResult {
    return startTrip(this.ctx(), personIds, lotId);
  }

  /** Everybody who is out goes home (or just `personIds`). */
  travelHome(personIds?: Id[]): TripResult {
    return startTripHome(this.ctx(), personIds);
  }

  /** Where a person is, in words. */
  whereIs(personId: Id): PersonPlace | null {
    const p = this.getState().people[personId];
    return p ? placeOf(this.getState(), p) : null;
  }

  /** Lots, households, who is where, and the trip under way. */
  neighbourhood(): NeighbourhoodInfo {
    return neighbourhoodInfo(this.ctx());
  }

  switchPreview(householdId: Id): SwitchPreview {
    return switchPreview(this.ctx(), householdId);
  }

  switchHousehold(householdId: Id): { ok: boolean; reason?: string } {
    return switchHousehold(this.ctx(), householdId);
  }

  movePreview(lotId: Id): MovePreview {
    return movePreview(this.ctx(), lotId);
  }

  moveHousehold(lotId: Id): { ok: boolean; reason?: string } {
    return moveHousehold(this.ctx(), lotId);
  }

  // ---------------------------------------------------------------------------------------------
  // Family and life stages (Milestone 8)
  // ---------------------------------------------------------------------------------------------

  /** Stage, birthday countdown, relatives, school and what the household can do for family. */
  family(personId: Id): FamilyInfo | null {
    return familyInfo(this.ctx(), personId);
  }

  /**
   * "Age up now" for a member of the household: queues the birthday at a birthday cake on the lot. A baby or toddler is
   * celebrated by a caregiver (Celebrate a Birthday).
   */
  ageUpNow(personId: Id): QueueResult {
    const ctx = this.ctx();
    const p = ctx.state.people[personId];
    if (!p) return { ok: false, reason: 'Unknown person.' };
    if (!ctx.state.households[p.householdId]?.isPlayable) return { ok: false, reason: `${p.firstName} decides for themself.` };
    const lotId = lotLoc(p)?.lotId ?? ctx.state.activeLotId;
    if (!lotId || !cakeOnLot(ctx, lotId)) return { ok: false, reason: 'Needs a birthday cake on a table or counter (Buy mode, Decor).' };
    if (isDependentStage(p.lifeStage)) {
      const carer = (ctx.state.households[p.householdId]?.memberIds ?? []).map((id) => ctx.state.people[id]).find((o) => o && o.id !== p.id && !isDependentStage(o.lifeStage) && o.lifeStage !== 'child' && !!lotLoc(o));
      if (!carer) return { ok: false, reason: 'A teen or adult at home has to celebrate with a little one.' };
      return this.queue(carer.id, { interactionId: 'careBirthday', target: { kind: 'person', personId: p.id }, source: 'player' });
    }
    const lot = ctx.state.lots[lotId];
    const cake = lot && Object.values(lot.objects).find((o) => ctx.content.objects[o.defId]?.tags.includes('cake'));
    if (!cake) return { ok: false, reason: 'Needs a birthday cake.' };
    return this.queue(personId, { interactionId: 'ageUpNow', target: { kind: 'object', objectId: cake.id, slotId: null }, source: 'player' });
  }

  /** Sends a pupil to do the homework due, at the nearest desk, table or computer. */
  doHomework(personId: Id): QueueResult {
    const ctx = this.ctx();
    const p = ctx.state.people[personId];
    const loc = p ? lotLoc(p) : null;
    if (!p || !loc) return { ok: false, reason: 'Unknown person.' };
    const def = ctx.content.interactions[HOMEWORK_INTERACTION];
    if (!def) return { ok: false, reason: 'That interaction is not available.' };
    const spots = lotObjects(ctx, loc.lotId, loc.level)
      .filter((r) => !isBroken(r.obj) && offeredInteractionIds(r.def).includes(def.id))
      .sort((a, b) => Math.hypot(a.obj.x - loc.x, a.obj.z - loc.z) - Math.hypot(b.obj.x - loc.x, b.obj.z - loc.z));
    if (spots.length === 0) return { ok: false, reason: 'Needs a desk, table or computer.' };
    let last: QueueResult = { ok: false, reason: 'No desk is free.' };
    for (const r of spots.slice(0, 4)) {
      last = this.queue(personId, { interactionId: def.id, target: { kind: 'object', objectId: r.obj.id, slotId: null }, source: 'player' });
      if (last.ok) return last;
    }
    return last;
  }

  adoptionPreview(adopterId: Id, spec: AdoptionSpec): AdoptionPreview { return adoptionPreview(this.ctx(), adopterId, spec); }

  adopt(adopterId: Id, spec: AdoptionSpec): AdoptResult { return adopt(this.ctx(), adopterId, spec); }

  splitPreview(personIds: Id[], target: SplitTarget): SplitPreview { return splitPreview(this.ctx(), personIds, target); }

  splitHousehold(personIds: Id[], target: SplitTarget): SplitResult { return splitHousehold(this.ctx(), personIds, target); }

  /** Test and developer hook: the birthday happens now (no cake needed), once per person and stage. */
  birthdayNow(personId: Id): { ok: boolean; reason?: string } {
    const ctx = this.ctx();
    const p = ctx.state.people[personId];
    if (!p) return { ok: false, reason: 'Unknown person.' };
    const r = ageUp(ctx, p, 'time');
    return r.ok ? { ok: true } : { ok: false, reason: r.reason };
  }

  /** Current mood with its reasons. */
  mood(personId: Id): { value: number; label: string; reasons: string[] } {
    const p = this.getState().people[personId];
    return p ? computeMood(this.content, p) : { value: 0, label: 'Unknown', reasons: [] };
  }

  /** Developer overlay numbers. */
  stats(): { agents: number; tickMs: number; routeRequests: number } {
    const state = this.getState();
    let agents = 0;
    for (const p of Object.values(state.people)) if (lotLoc(p)) agents++;
    return { agents, tickMs: this.lastTickMs, routeRequests: this.counters.routeRequests };
  }

  /** Sorted reservation entries (`key=actionId`) for tests and the developer overlay. */
  reservations(): string[] {
    this.ctx();
    return this.res.snapshot();
  }

  /** Queues a system action (schedule/chain source) bypassing player checks; used by game code and tests. */
  queueSystem(personId: Id, req: ActionRequest): QueueResult {
    const ctx = this.ctx();
    const p = ctx.state.people[personId];
    if (!p) return { ok: false, reason: 'Unknown person.' };
    if (!behaviorOf(ctx, req.interactionId)) return { ok: false, reason: 'That interaction is not available.' };
    const a = makeAction(ctx, p, req, req.source ?? 'schedule');
    return insertAction(ctx, p, a) ? { ok: true, actionId: a.id } : { ok: false, reason: 'The queue is full.' };
  }
}
