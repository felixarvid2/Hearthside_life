// Life in town (social gaps pass): the townspeople's lives change slowly. Once a game day one adult may be hired, switch career
// or quit; once a week one NPC household may move to an empty home they can afford. Both draw from the world generator
// (`ctx.rng`, the saved sequence), so the same world always unfolds the same way, and neither touches the household the player
// runs, the next-door neighbours or anybody who is on the active lot, at work or on the way somewhere.
//
// Money only moves through transact with once-only occurrences (`townmove:<household>:<day>:cost|sale`).

import { dayIndex, weekday } from '../core/clock';
import { addFeed, isProcessed, transact } from '../core/state';
import type { Household, Id, Lot, Person, WorldState } from '../core/types';
import { isGrownStage } from '../core/lifeStages';
import { ensureLotBuilt } from '../world/lotBuilders';
import type { SimCtx } from './context';
import { lotLoc } from './context';
import { careersForStage } from './careers';
import { homeLotValue } from './economy';
import { isVacant, SALE_RATE } from './households';
import { peekRel } from './relationships';
import { TOWN_JOB_CHANCE, TOWN_MOVE_CHANCE, TOWN_MOVE_WEEKDAY } from './tuning';

/** Does anybody in the household the player runs know this person? (Only then do the town's changes show in the feed.) */
function knownToPlayer(state: WorldState, p: Person): boolean {
  const hh = state.households[state.activeHouseholdId];
  return !!hh && hh.memberIds.some((m) => peekRel(state, m, p.id).familiarity > 0 || peekRel(state, p.id, m).familiarity > 0);
}

const byId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : 1);

// ---------------------------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------------------------

export type JobChange = 'hired' | 'switched' | 'quit';

/** Adults outside the player's household who are at home with no shift pending today and can change jobs now. */
export function jobChangeCandidates(ctx: SimCtx): Person[] {
  const state = ctx.state;
  return Object.values(state.people).filter((p) => {
    if (p.householdId === state.activeHouseholdId || !isGrownStage(p.lifeStage) || !state.households[p.householdId]) return false;
    if (!(p.location.kind === 'offlot' && p.location.place === 'home' && !p.location.transit)) return false;
    const sh = p.career?.shift;
    return !(sh && sh.status !== 'done' && sh.status !== 'missed' && sh.occurrence.endsWith(`:${dayIndex(ctx.now)}`));
  }).sort(byId);
}

function giveJob(ctx: SimCtx, p: Person, careerId: string): void {
  p.career = { careerId, level: 1, performance: 0, joinedAt: ctx.now, daysWorked: 0, shift: null, effort: 'normal', pendingEvent: null };
  ctx.events.emit({ type: 'career', personId: p.id, what: 'joined' });
}

/**
 * Changes one person's working life: no job -> hired; a job -> switches to another career (back at the first rung) or quits
 * (never the household's last income while it has no other earner). Returns what happened, or null when nothing fits.
 */
export function changeJob(ctx: SimCtx, p: Person): JobChange | null {
  const state = ctx.state;
  const careers = careersForStage(ctx.content, p.lifeStage);
  if (careers.length === 0) return null;
  const hh = state.households[p.householdId];
  const others = hh ? hh.memberIds.filter((id) => id !== p.id && !!state.people[id]?.career).length : 0;
  const name = (id: string) => ctx.content.careers[id]?.name ?? 'a new job';
  if (!p.career) {
    const pick = ctx.rng.pick(careers);
    giveJob(ctx, p, pick.id);
    if (knownToPlayer(state, p)) addFeed(state, ctx.events, 'career', `${p.firstName} ${p.lastName} found work in ${name(pick.id)}.`, p.id);
    return 'hired';
  }
  const quits = ctx.rng.chance(0.35) && (others > 0 || p.lifeStage === 'elder');
  const old = p.career.careerId;
  p.career = null;
  ctx.events.emit({ type: 'career', personId: p.id, what: 'quit' });
  if (quits) {
    if (knownToPlayer(state, p)) addFeed(state, ctx.events, 'career', `${p.firstName} ${p.lastName} left their job in ${name(old)}.`, p.id);
    return 'quit';
  }
  const options = careers.filter((c) => c.id !== old);
  const pick = ctx.rng.pick(options.length > 0 ? options : careers);
  giveJob(ctx, p, pick.id);
  if (knownToPlayer(state, p)) addFeed(state, ctx.events, 'career', `${p.firstName} ${p.lastName} moved from ${name(old)} to ${name(pick.id)}.`, p.id);
  return 'switched';
}

// ---------------------------------------------------------------------------------------------
// Homes
// ---------------------------------------------------------------------------------------------

/** NPC households (not the next-door neighbours, not the player's) that can move now: their members are all off-lot at home. */
export function movableHouseholds(ctx: SimCtx): Household[] {
  const state = ctx.state;
  const ids = new Set(state.neighbourhood?.npcHouseholdIds ?? []);
  return Object.values(state.households).filter((h) => {
    if (!ids.has(h.id) || h.isPlayable || !h.homeLotId || h.memberIds.length === 0 || h.homeLotId === state.activeLotId) return false;
    if (ctx.state.schedule.some((e) => e.kind === 'travelArrive')) return false;
    return h.memberIds.every((m) => {
      const p = state.people[m];
      if (!p || lotLoc(p)) return false;
      if (state.schedule.some((e) => e.personId === m && (e.kind === 'visitArrive' || e.kind === 'visitLeave'))) return false;
      return p.location.kind === 'offlot' && p.location.place === 'home' && !p.location.transit;
    });
  }).sort(byId);
}

/** Empty homes (for rent or sale) that the household can afford and that are not the active lot. */
export function homesFor(ctx: SimCtx, hh: Household): Lot[] {
  const state = ctx.state;
  const sells = hh.homeLotId ? state.lots[hh.homeLotId]?.ownerHouseholdId === hh.id : false;
  const proceeds = sells ? Math.round(homeLotValue(state, hh.id) * SALE_RATE) : 0;
  return Object.values(state.lots).filter((l) => {
    if (l.kind !== 'residential' || l.id === state.activeLotId || l.id === hh.homeLotId || !isVacant(state, l)) return false;
    const cost = l.rent !== undefined ? l.rent : l.price;
    // A move must leave a cushion: a week of rent, or a tenth of the price, on top of the cost.
    return cost !== undefined && hh.funds + proceeds >= cost + (l.rent !== undefined ? l.rent : Math.round(cost * 0.1));
  }).sort(byId);
}

/** Moves an NPC household into an empty home (see the header). Returns false when it cannot be done. */
export function moveTownHousehold(ctx: SimCtx, householdId: Id, lotId: Id): boolean {
  const state = ctx.state;
  const hh = state.households[householdId];
  const lot = state.lots[lotId];
  if (!hh || !lot || hh.isPlayable || !movableHouseholds(ctx).some((h) => h.id === hh.id) || !homesFor(ctx, hh).some((l) => l.id === lot.id)) return false;
  const old = hh.homeLotId ? state.lots[hh.homeLotId] : undefined;
  const tag = `townmove:${hh.id}:${dayIndex(ctx.now)}`;
  if (isProcessed(state, `money:${tag}:cost`)) return false;
  const built = ensureLotBuilt(state, ctx.content, lot.id);
  if (!built.ok) return false;
  if (built.built) ctx.nav.invalidate(lot.id);
  const sells = !!old && old.ownerHouseholdId === hh.id;
  const proceeds = sells ? Math.round(homeLotValue(state, hh.id) * SALE_RATE) : 0;
  const renting = lot.rent !== undefined;
  const cost = renting ? lot.rent! : lot.price!;
  if (proceeds > 0 && old) transact(state, ctx.events, hh.id, proceeds, 'sale', `Sold ${old.name}`, { occurrence: `${tag}:sale` });
  const pay = transact(state, ctx.events, hh.id, -cost, renting ? 'bill' : 'purchase', renting ? `Rent deposit: ${lot.name}` : `Bought ${lot.name}`, { occurrence: `${tag}:cost` });
  if (!pay.ok) return false;
  if (old && old.ownerHouseholdId === hh.id) {
    old.ownerHouseholdId = null;
    old.price = old.landValue;
    for (const o of Object.values(old.objects)) o.ownerHouseholdId = null;
  }
  if (!renting) {
    lot.ownerHouseholdId = hh.id;
    delete lot.price;
    for (const o of Object.values(lot.objects)) o.ownerHouseholdId = hh.id;
  }
  hh.homeLotId = lot.id;
  for (const id of hh.memberIds) {
    const p = state.people[id];
    if (p && p.location.kind === 'offlot' && p.location.place === 'home' && !p.location.transit) p.location = { ...p.location, lotId: lot.id };
  }
  const first = state.people[hh.memberIds[0] ?? ''];
  if (first && knownToPlayer(state, first)) addFeed(state, ctx.events, 'info', `The ${hh.name} household ${renting ? 'rented' : 'bought'} ${lot.name} and moved out of ${old?.name ?? 'town'}.`, first.id);
  ctx.events.emit({ type: 'household.moved', householdId: hh.id, fromLotId: old?.id ?? null, toLotId: lot.id });
  return true;
}

// ---------------------------------------------------------------------------------------------
// The daily roll
// ---------------------------------------------------------------------------------------------

/** Called from the daily rollover: maybe one job change, and on moving day maybe one household moves. */
export function dailyTownChange(ctx: SimCtx, day: number): void {
  if (day < 2 || !ctx.state.neighbourhood || ctx.state.settings.townLife === false) return;
  if (ctx.rng.chance(TOWN_JOB_CHANCE)) {
    const who = jobChangeCandidates(ctx);
    if (who.length > 0) changeJob(ctx, ctx.rng.pick(who));
  }
  if (weekday(ctx.now) === TOWN_MOVE_WEEKDAY && ctx.rng.chance(TOWN_MOVE_CHANCE)) {
    const movers = movableHouseholds(ctx).filter((h) => homesFor(ctx, h).length > 0);
    if (movers.length > 0) {
      const hh = ctx.rng.pick(movers);
      moveTownHousehold(ctx, hh.id, ctx.rng.pick(homesFor(ctx, hh)).id);
    }
  }
}
