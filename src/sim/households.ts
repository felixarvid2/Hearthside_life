// Household switching and moving (Milestone 7).
//
// Switching: the player runs exactly one household, `state.activeHouseholdId`; its members are controllable
// (`Household.isPlayable`, `Person.isNpc` false) and are simulated in detail on the active lot. Switching to another
// household hands control over: the new household's home lot becomes the active lot, and the household that was played
// before is simulated lightly from then on (sim/townlife.ts): its members follow their daily plan, jobs pay once per shift
// and bills are paid automatically from its own funds. Each household keeps its own funds and ledger; nothing is ever
// moved between them. Jobs, traits, looks and relationships are never touched.
//
// Moving: the active household can move to an empty home that is for rent or for sale (`Lot.rent` / `Lot.price`). Rent
// costs the first week as a deposit and replaces the property tax on the weekly bill; buying costs the asking price. An
// owned home that is left is sold for 80 % of its value (the furniture stays with the house).

import { addFeed, isProcessed, transact } from '../core/state';
import type { Cents, Household, Id, Lot, Person, PlacedObject, WorldState } from '../core/types';
import { ensureLotBuilt } from '../world/lotBuilders';
import { beginLightShift, shiftOn } from './careers';
import { dayIndex } from '../core/clock';
import type { SimCtx } from './context';
import { clamp, lotLoc } from './context';
import { ownsObject, saleValue } from '../building/plans';
import { homeLotValue } from './economy';
import { activeEvents } from './events';
import { activateLot, activeTrip, startTrip, travelProblem } from './lotTravel';
import { homeLocation, placeOf, takeOffLot } from './places';

export interface HouseholdBrief {
  id: Id;
  name: string;
  funds: Cents;
  memberNames: string[];
  homeLotName: string | null;
  /** Where the household is right now, in words ("At home", "2 at work"). */
  where: string;
}

export interface SwitchPreview {
  ok: boolean;
  /** Why the switch cannot be made now. */
  reason?: string;
  from: HouseholdBrief;
  to: HouseholdBrief | null;
  /** What will happen, in plain sentences (shown before the player confirms). */
  consequences: string[];
}

export function householdBrief(state: WorldState, hh: Household): HouseholdBrief {
  const members = hh.memberIds.map((id) => state.people[id]).filter((p): p is Person => !!p);
  const counts = new Map<string, number>();
  for (const m of members) { const t = placeOf(state, m).text; counts.set(t, (counts.get(t) ?? 0) + 1); }
  const where = [...counts.entries()].map(([t, n]) => (members.length > 1 && n < members.length ? `${n} ${t.charAt(0).toLowerCase()}${t.slice(1)}` : t)).join(', ');
  return {
    id: hh.id, name: hh.name, funds: hh.funds, memberNames: members.map((m) => m.firstName),
    homeLotName: hh.homeLotId ? state.lots[hh.homeLotId]?.name ?? null : null, where: where || 'Nobody',
  };
}

/** Why the player cannot switch to this household now, or null. */
export function switchProblem(ctx: SimCtx, householdId: Id): string | null {
  const state = ctx.state;
  const target = state.households[householdId];
  if (!target) return 'There is no such household.';
  if (target.id === state.activeHouseholdId) return `You are already playing the ${target.name} household.`;
  if (!target.homeLotId || !state.lots[target.homeLotId]) return `The ${target.name} household has no home to switch to.`;
  const members = target.memberIds.map((id) => state.people[id]).filter((p): p is Person => !!p);
  if (!members.some((p) => p.lifeStage === 'adult' || p.lifeStage === 'youngAdult' || p.lifeStage === 'elder')) return `Nobody in the ${target.name} household is old enough to run it.`;
  if (activeTrip(state)) return 'Wait until the trip is over.';
  const busy = activeEvents(state, state.activeHouseholdId).find((e) => e.status === 'running' || e.status === 'invited');
  if (busy && !['visit', 'welcomeWagon', 'dropIn', 'reconciliation'].includes(busy.type)) return `Finish or cancel "${busy.title}" before switching households.`;
  return null;
}

/** What switching to the household would do, in words. Pure. */
export function switchPreview(ctx: SimCtx, householdId: Id): SwitchPreview {
  const state = ctx.state;
  const from = state.households[state.activeHouseholdId]!;
  const to = state.households[householdId] ?? null;
  const reason = switchProblem(ctx, householdId);
  const fromBrief = householdBrief(state, from);
  if (!to) return { ok: false, reason: reason ?? 'There is no such household.', from: fromBrief, to: null, consequences: [] };
  const toBrief = householdBrief(state, to);
  const money = (c: Cents) => `$${(c / 100).toFixed(2)}`;
  const consequences = [
    `You will play the ${to.name} household (${toBrief.memberNames.join(', ')}). They are ${toBrief.where.toLowerCase()}; you start at ${toBrief.homeLotName ?? 'their home'}, and anyone away at work or elsewhere in town is called home unless a shift is running.`,
    `The ${from.name} household (${fromBrief.memberNames.join(', ')}) will no longer take your orders. They are simulated lightly: they follow a daily plan between home, work and the public venues, their jobs pay once per shift and their weekly bills are paid automatically from their own funds. They only do detailed things, such as cooking or chatting, while you are on the same lot.`,
    `Each household keeps its own money and history: the ${from.name} household keeps ${money(from.funds)} and the ${to.name} household ${money(to.funds)}. Nothing moves between them.`,
    'Jobs, personalities, looks and relationships stay exactly as they are. You can switch back any time, and you can still visit the other household from the map.',
    `${fromBrief.memberNames.join(' and ')} stop what they are doing now; queued orders are dropped.`,
  ];
  return { ok: reason === null, ...(reason ? { reason } : {}), from: fromBrief, to: toBrief, consequences };
}

/**
 * Makes `householdId` the household the player runs. The previously played household becomes an NPC household: its
 * members go off-lot (at home) and follow the light schedule. The new household's home lot becomes active.
 */
export function switchHousehold(ctx: SimCtx, householdId: Id): { ok: true } | { ok: false; reason: string } {
  const problem = switchProblem(ctx, householdId);
  if (problem) return { ok: false, reason: problem };
  const state = ctx.state;
  const old = state.households[state.activeHouseholdId]!;
  const next = state.households[householdId]!;
  const homeLot = state.lots[next.homeLotId!]!;
  const built = ensureLotBuilt(state, ctx.content, homeLot.id);
  if (!built.ok) return { ok: false, reason: built.reason };
  if (built.built) ctx.nav.invalidate(homeLot.id);

  // 1. The household that was played stops: members on lots go home (off-lot), their orders end.
  for (const id of old.memberIds) {
    const p = state.people[id];
    if (!p) continue;
    p.isNpc = true;
    if (lotLoc(p)) takeOffLot(ctx, p, homeLocation(state, p, ctx.now));
    else if (p.location.kind === 'offlot' && p.location.transit) p.location = homeLocation(state, p, ctx.now);
  }
  old.isPlayable = false;

  // 2. The new household takes over. Members who are out and about come home; shifts that are running stay running.
  next.isPlayable = true;
  state.activeHouseholdId = next.id;
  const day = dayIndex(ctx.now);
  for (const id of next.memberIds) {
    const p = state.people[id];
    if (!p) continue;
    p.isNpc = false;
    const loc = p.location;
    if (loc.kind === 'offlot' && (loc.place === 'visiting' || loc.place === 'errand')) p.location = homeLocation(state, p, ctx.now);
    // Controlled work clock: a shift that began under the light schedule counts its minutes from its start.
    const sh = p.career?.shift;
    if (sh && sh.status === 'atWork') {
      const w = shiftOn(ctx.content, p, day) ?? shiftOn(ctx.content, p, day - 1);
      if (w) sh.workedMinutes = clamp(ctx.now - w.start, 0, w.end - w.start);
    } else if (loc.kind === 'offlot' && loc.place === 'work') beginLightShift(ctx, p);
  }

  // 3. The new household's home is the active lot.
  const r = activateLot(ctx, homeLot.id, []);
  if (!r.ok) return { ok: false, reason: r.reason };
  addFeed(state, ctx.events, 'info', `You are now playing the ${next.name} household at ${homeLot.name}. The ${old.name} household carries on by itself: their jobs and bills are looked after automatically.`, next.memberIds[0]);
  ctx.events.emit({ type: 'household.switched', fromId: old.id, toId: next.id });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Moving house
// ---------------------------------------------------------------------------------------------

/** Share of its value an owned home sells for when the household moves out. */
export const SALE_RATE = 0.8;

/** What happens to the furniture of the home that is left: stays (default), goes with the household into its inventory, or is sold. */
export type FurnitureChoice = 'leave' | 'take' | 'sell';
export interface MoveOptions { furniture?: FurnitureChoice }

export interface FurnitureSummary {
  /** Movable pieces the household owns in the home it leaves (stairs and planted beds stay). */
  count: number;
  /** Their purchase price, and what selling them now returns. */
  worth: Cents;
  saleValue: Cents;
  choice: FurnitureChoice;
}

export interface MovePreview {
  ok: boolean;
  reason?: string;
  lotId: Id;
  /** 'rent' (first week up front) or 'buy'. */
  mode: 'rent' | 'buy' | null;
  /** Money out now (deposit or price). */
  cost: Cents;
  /** Money in from selling an owned home that is left. */
  proceeds: Cents;
  lines: string[];
  /** The furniture of the old home and the choice this preview is for. */
  furniture: FurnitureSummary;
}

/** True when nobody lives at the lot. */
export function isVacant(state: WorldState, lot: Lot): boolean {
  return lot.kind === 'residential' && !Object.values(state.households).some((h) => h.homeLotId === lot.id);
}

/** The pieces of furniture in `old` that belong to the household and can leave with it (not stairs, not planted beds). */
export function movableFurniture(ctx: Pick<SimCtx, 'state' | 'content'>, hh: Household, old: Lot | undefined): PlacedObject[] {
  if (!old) return [];
  return Object.values(old.objects).filter((o) => {
    const def = ctx.content.objects[o.defId];
    return ownsObject(old, o, hh.id) && !def?.stair && !o.garden?.crop && !o.snowman;
  }).sort((a, b) => (a.id < b.id ? -1 : 1));
}

function furnitureSummary(ctx: SimCtx, hh: Household, old: Lot | undefined, choice: FurnitureChoice): FurnitureSummary {
  const list = movableFurniture(ctx, hh, old);
  return { count: list.length, worth: list.reduce((a, o) => a + o.purchasePrice, 0), saleValue: list.reduce((a, o) => a + saleValue(ctx.state, o), 0), choice };
}

export function movePreview(ctx: SimCtx, lotId: Id, opts: MoveOptions = {}): MovePreview {
  const state = ctx.state;
  const hh = state.households[state.activeHouseholdId]!;
  const lot = state.lots[lotId];
  const choice: FurnitureChoice = opts.furniture ?? 'leave';
  const oldLot = hh.homeLotId ? state.lots[hh.homeLotId] : undefined;
  const furniture = furnitureSummary(ctx, hh, oldLot, choice);
  const none = (reason: string): MovePreview => ({ ok: false, reason, lotId, mode: null, cost: 0, proceeds: 0, lines: [], furniture });
  if (!lot) return none('There is no such home.');
  if (lot.kind !== 'residential') return none('Only homes can be lived in.');
  if (lot.id === hh.homeLotId) return none('You already live here.');
  if (!isVacant(state, lot)) return none(`${lot.name} is not empty.`);
  const mode = lot.rent !== undefined ? 'rent' : lot.price !== undefined ? 'buy' : null;
  if (!mode) return none(`${lot.name} is not available.`);
  if (activeTrip(state)) return none('Wait until the trip is over.');
  const old = hh.homeLotId ? state.lots[hh.homeLotId] : undefined;
  const sells = !!old && old.ownerHouseholdId === hh.id;
  // Furniture that leaves with the household (taken or sold) no longer counts toward the sale of the house.
  const leaves = choice === 'leave' ? 0 : furniture.worth;
  const proceeds = sells ? Math.round(Math.max(0, homeLotValue(state, hh.id) - leaves) * SALE_RATE) : 0;
  const furnitureCash = choice === 'sell' ? furniture.saleValue : 0;
  const cost = mode === 'rent' ? lot.rent! : lot.price!;
  const money = (c: Cents) => `$${(c / 100).toFixed(2)}`;
  const lines = [
    mode === 'rent'
      ? `${lot.name} costs ${money(cost)} a week in rent. The first week is paid now and the rent replaces the property tax on the weekly bill.`
      : `${lot.name} costs ${money(cost)}. You will own it, and pay property tax on it.`,
    sells ? `Your home ${old!.name} is sold for ${money(proceeds)} (${Math.round(SALE_RATE * 100)} % of its value).` : old ? `You hand ${old.name} back; it becomes available again.` : '',
    furniture.count === 0 ? '' : choice === 'take' ? `Your ${furniture.count} pieces of furniture go with you into the household inventory; place them in Buy mode.`
      : choice === 'sell' ? `Your ${furniture.count} pieces of furniture are sold for ${money(furnitureCash)}.`
        : `Your ${furniture.count} pieces of furniture stay in the house${sells ? ' (they are part of the sale)' : ''}.`,
    'Everyone who is with you travels there (20 to 40 minutes); anyone at work comes home to the new place.',
  ].filter(Boolean);
  if (hh.funds + proceeds + furnitureCash < cost && !state.settings.unlimitedFunds) return { ok: false, reason: `Not enough household funds (${money(cost)} needed).`, lotId, mode, cost, proceeds, lines, furniture };
  const here = hh.memberIds.filter((id) => { const p = state.people[id]; return !!p && !!lotLoc(p); });
  if (here.length > 0) {
    const tp = travelProblem(ctx, here, lot.id);
    if (tp) return { ok: false, reason: tp, lotId, mode, cost, proceeds, lines, furniture };
  }
  return { ok: true, lotId, mode, cost, proceeds, lines, furniture };
}

/** Moves the active household into an empty home (see the header). Money goes through transact with once-only occurrences. */
export function moveHousehold(ctx: SimCtx, lotId: Id, opts: MoveOptions = {}): { ok: true } | { ok: false; reason: string } {
  const preview = movePreview(ctx, lotId, opts);
  if (!preview.ok || !preview.mode) return { ok: false, reason: preview.reason ?? 'That move is not possible.' };
  const state = ctx.state;
  const hh = state.households[state.activeHouseholdId]!;
  const lot = state.lots[lotId]!;
  const old = hh.homeLotId ? state.lots[hh.homeLotId] : undefined;
  const built = ensureLotBuilt(state, ctx.content, lotId);
  if (!built.ok) return { ok: false, reason: built.reason };
  if (built.built) ctx.nav.invalidate(lotId);
  const nm = state.neighbourhood;
  const moveNo = (nm?.moves ?? 0) + 1;
  const tag = `move:${hh.id}:${moveNo}`;
  if (isProcessed(state, `money:${tag}:cost`)) return { ok: false, reason: 'That move was already paid.' };

  // Money first (nothing else changes when it fails).
  const pay = transact(state, ctx.events, hh.id, -preview.cost, preview.mode === 'rent' ? 'bill' : 'purchase',
    preview.mode === 'rent' ? `Rent deposit: ${lot.name}` : `Bought ${lot.name}`, { occurrence: `${tag}:cost` });
  if (!pay.ok) return { ok: false, reason: pay.reason };
  // The furniture leaves first, so the house is sold without it (taken: into the inventory; sold: paid once).
  if (old && preview.furniture.choice !== 'leave') {
    for (const o of movableFurniture(ctx, hh, old)) {
      if (preview.furniture.choice === 'take') {
        const object = JSON.parse(JSON.stringify(o)) as PlacedObject;
        delete object.supportId;
        object.ownerHouseholdId = hh.id;
        hh.inventory.push({ object, storedAt: ctx.now });
      }
      delete old.objects[o.id];
    }
    // Anything that rested on a piece that left now rests on nothing.
    for (const o of Object.values(old.objects)) if (o.supportId && !old.objects[o.supportId]) delete o.supportId;
    if (preview.furniture.choice === 'sell' && preview.furniture.saleValue > 0) {
      transact(state, ctx.events, hh.id, preview.furniture.saleValue, 'sale', `Sold the furniture of ${old.name}`, { occurrence: `${tag}:furniture` });
    }
    ctx.nav.invalidate(old.id);
  }
  if (preview.proceeds > 0 && old) {
    transact(state, ctx.events, hh.id, preview.proceeds, 'sale', `Sold ${old.name}`, { occurrence: `${tag}:sale` });
  }
  if (old) {
    if (old.ownerHouseholdId === hh.id) {
      old.ownerHouseholdId = null;
      old.price = old.landValue;
      for (const o of Object.values(old.objects)) o.ownerHouseholdId = null;
    }
  }
  if (preview.mode === 'buy') {
    lot.ownerHouseholdId = hh.id;
    delete lot.price;
    for (const o of Object.values(lot.objects)) o.ownerHouseholdId = hh.id;
  }
  hh.homeLotId = lot.id;
  for (const id of hh.memberIds) {
    const p = state.people[id];
    if (p && p.location.kind === 'offlot' && p.location.place === 'home' && !p.location.transit) p.location = { ...p.location, lotId: lot.id };
  }
  if (nm) nm.moves = moveNo;
  addFeed(state, ctx.events, 'info', preview.mode === 'rent'
    ? `The ${hh.name} household rented ${lot.name}.` : `The ${hh.name} household bought ${lot.name}.`, hh.memberIds[0]);
  ctx.events.emit({ type: 'household.moved', householdId: hh.id, fromLotId: old?.id ?? null, toLotId: lot.id });

  // Everybody who is out and about travels to the new home.
  const here = hh.memberIds.filter((id) => { const p = state.people[id]; return !!p && !!lotLoc(p); });
  if (here.length > 0) {
    const trip = startTrip(ctx, here, lot.id);
    if (!trip.ok) addFeed(state, ctx.events, 'warning', trip.reason);
  }
  return { ok: true };
}
