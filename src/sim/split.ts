// Moving out and moving in (Milestone 8): splitting the household the player runs, and bringing somebody in.
//
// splitHousehold(personIds, target): some members leave the household to
//   - a vacant home that is for rent or for sale (the same terms as a whole-household move, sim/households.ts), where they
//     become a new household, or
//   - an existing household ("move in with"), which takes them in (up to MAX_HOUSEHOLD_SIZE people).
// Funds are shared in proportion to the people who go (floor of funds x movers / members). The moved people become NPCs of their
// new household (the light schedule looks after them); the player can switch to it afterwards (GameAPI.switchHousehold).
// At least one young adult or older stays behind, and a baby or toddler never goes without a young adult or older.
// Every money step is a transact with a once-only occurrence `split:<householdId>:<n>:...`.
//
// moveInNpc(actor, target) is "Ask to move in": an NPC young adult or older, with the dependents in their household who are
// theirs, joins the player's household (up to MAX_HOUSEHOLD_SIZE people) with a proportional share of their household's funds.

import { dayIndex } from '../core/clock';
import { isGrownStage, STAGE_LABELS } from '../core/lifeStages';
import { addFeed, isProcessed, markProcessed, transact } from '../core/state';
import type { Cents, Household, Id, Lot, Person, WorldState } from '../core/types';
import { addHousehold } from '../core/state';
import { ensureLotBuilt } from '../world/lotBuilders';
import type { SimCtx } from './context';
import { lotLoc } from './context';
import { homeLotValue } from './economy';
import { inActiveEvent } from './events';
import { isVacant, SALE_RATE } from './households';
import { activeTrip } from './lotTravel';
import { addMoodlet } from './mood';
import { entrySpots, homeLocation, placeOnLot, takeOffLot } from './places';
import { addMemory } from './relationships';
import { settleBaby } from './care';
import { MAX_HOUSEHOLD_SIZE } from './tuning';

export type SplitTarget = { kind: 'lot'; lotId: Id } | { kind: 'household'; householdId: Id };

export interface SplitPreview {
  ok: boolean;
  reason?: string;
  /** 'rent' / 'buy' for a vacant home, 'moveIn' for an existing household. */
  mode: 'rent' | 'buy' | 'moveIn' | null;
  /** Names of the people who leave and who stay. */
  movers: string[];
  staying: string[];
  /** Their share of the household funds, and what the new home costs out of it (deposit or price). */
  share: Cents;
  cost: Cents;
  /** Name of the new place ("Maple Cottage", "the Okafor household"). */
  destination: string;
  lines: string[];
}

const money = (c: Cents) => `$${(c / 100).toFixed(2)}`;
const names = (people: Person[]): string => {
  const n = people.map((p) => p.firstName);
  return n.length <= 1 ? n[0] ?? 'Nobody' : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
};

function membersOf(state: WorldState, hh: Household): Person[] {
  return hh.memberIds.map((id) => state.people[id]).filter((p): p is Person => !!p);
}

/** Why these members of the household cannot leave for the target, or null. Pure. */
export function splitProblem(ctx: SimCtx, personIds: Id[], target: SplitTarget): string | null {
  const state = ctx.state;
  const hh = state.households[state.activeHouseholdId];
  if (!hh) return 'There is no household to split.';
  const ids = [...new Set(personIds)];
  if (ids.length === 0) return 'Choose who moves out.';
  const movers = ids.map((id) => state.people[id]);
  if (movers.some((p) => !p || p.householdId !== hh.id)) return 'Only members of your household can move out.';
  const people = movers as Person[];
  const staying = membersOf(state, hh).filter((p) => !ids.includes(p.id));
  if (staying.length === 0) return 'Somebody has to stay in the household.';
  if (!staying.some((p) => isGrownStage(p.lifeStage))) return 'At least one young adult or older must stay behind.';
  if (activeTrip(state)) return 'Wait until the trip is over.';
  for (const p of people) {
    if (p.location.kind === 'offlot' && (p.location.transit || p.location.place === 'work' || p.location.place === 'school' || p.location.place === 'errand')) {
      return `${p.firstName} is away right now. Wait until they are home.`;
    }
    if (inActiveEvent(state, p.id)) return `${p.firstName} is busy with a gathering.`;
  }
  const grownMovers = people.some((p) => isGrownStage(p.lifeStage));
  if (target.kind === 'lot') {
    const lot = state.lots[target.lotId];
    if (!lot) return 'There is no such home.';
    if (lot.kind !== 'residential') return 'Only homes can be lived in.';
    if (lot.id === hh.homeLotId) return 'They already live here.';
    if (!isVacant(state, lot)) return `${lot.name} is not empty.`;
    if (lot.rent === undefined && lot.price === undefined) return `${lot.name} is not available.`;
    if (!grownMovers) return 'A young adult or older has to go with the children.';
    return null;
  }
  const dest = state.households[target.householdId];
  if (!dest) return 'There is no such household.';
  if (dest.id === hh.id) return 'They already live here.';
  if (dest.isPlayable) return 'That household is already run by you.';
  const destMembers = membersOf(state, dest);
  if (destMembers.length + people.length > MAX_HOUSEHOLD_SIZE) return `That household would have more than ${MAX_HOUSEHOLD_SIZE} people.`;
  if (!grownMovers && !destMembers.some((p) => isGrownStage(p.lifeStage))) return 'Nobody there is old enough to look after them.';
  return null;
}

/** What the split would do, in sentences. Pure: nothing changes. */
export function splitPreview(ctx: SimCtx, personIds: Id[], target: SplitTarget): SplitPreview {
  const state = ctx.state;
  const hh = state.households[state.activeHouseholdId];
  const ids = [...new Set(personIds)];
  const movers = ids.map((id) => state.people[id]).filter((p): p is Person => !!p);
  const staying = hh ? membersOf(state, hh).filter((p) => !ids.includes(p.id)) : [];
  const total = hh?.memberIds.length ?? 0;
  const share = hh && total > 0 ? Math.floor((hh.funds * Math.max(0, movers.length)) / total) : 0;
  const base = { movers: movers.map((p) => p.firstName), staying: staying.map((p) => p.firstName), share: Math.max(0, share) };
  const problem = splitProblem(ctx, ids, target);
  if (target.kind === 'lot') {
    const lot = state.lots[target.lotId];
    const mode = lot ? (lot.rent !== undefined ? 'rent' : lot.price !== undefined ? 'buy' : null) : null;
    const cost = lot ? (mode === 'rent' ? lot.rent! : mode === 'buy' ? lot.price! : 0) : 0;
    const lines = lot && mode ? [
      `${names(movers)} will live at ${lot.name} as a household of their own; ${names(staying)} stay${staying.length === 1 ? 's' : ''} here.`,
      `They take ${money(base.share)}, their share of the household funds (${movers.length} of ${total} people).`,
      mode === 'rent' ? `The first week's rent of ${money(cost)} is paid from their share now.` : `They buy ${lot.name} for ${money(cost)} from their share.`,
      'You keep playing this household, and can switch to theirs any time.',
    ] : [];
    const poor = !!hh && !problem && base.share < cost && !state.settings.unlimitedFunds;
    const reason = problem ?? (poor ? `Their share (${money(base.share)}) does not cover ${money(cost)}.` : undefined);
    return { ok: !reason, ...(reason ? { reason } : {}), mode, ...base, cost, destination: lot?.name ?? '', lines };
  }
  const dest = state.households[target.householdId];
  const lines = dest ? [
    `${names(movers)} move in with the ${dest.name} household; ${names(staying)} stay${staying.length === 1 ? 's' : ''} here.`,
    `They bring ${money(base.share)}, their share of the household funds, to the ${dest.name} household.`,
    'You keep playing this household, and can switch to theirs any time.',
  ] : [];
  return { ok: !problem, ...(problem ? { reason: problem } : {}), mode: dest ? 'moveIn' : null, ...base, cost: 0, destination: dest ? `the ${dest.name} household` : '', lines };
}

export type SplitResult = { ok: true; householdId: Id } | { ok: false; reason: string };

/** Moves the people out (see the header). A failed split changes nothing. */
export function splitHousehold(ctx: SimCtx, personIds: Id[], target: SplitTarget): SplitResult {
  const preview = splitPreview(ctx, personIds, target);
  if (!preview.ok || !preview.mode) return { ok: false, reason: preview.reason ?? 'That is not possible.' };
  const state = ctx.state;
  const hh = state.households[state.activeHouseholdId]!;
  const ids = [...new Set(personIds)];
  const movers = ids.map((id) => state.people[id]!);
  let n = 0;
  while (isProcessed(state, `split:${hh.id}:${n}`)) n++;
  const tag = `split:${hh.id}:${n}`;

  let dest: Household;
  let lot: Lot | undefined;
  if (target.kind === 'lot') {
    lot = state.lots[target.lotId]!;
    const built = ensureLotBuilt(state, ctx.content, lot.id);
    if (!built.ok) return { ok: false, reason: built.reason };
    if (built.built) ctx.nav.invalidate(lot.id);
    const grown = movers.filter((p) => isGrownStage(p.lifeStage));
    const lead = [...grown].sort((a, b) => a.id.localeCompare(b.id))[0] ?? movers[0]!;
    dest = addHousehold(state, lead.lastName || 'New', 0, lot.id, false);
  } else {
    dest = state.households[target.householdId]!;
  }

  // Money first: the share leaves this household and arrives in the other one, then the new home is paid from it.
  if (preview.share > 0) {
    const out = transact(state, ctx.events, hh.id, -preview.share, 'family', `Share of the funds for ${names(movers)}`, { occurrence: `${tag}:out` });
    if (!out.ok) { if (target.kind === 'lot') delete state.households[dest.id]; return { ok: false, reason: out.reason }; }
    transact(state, ctx.events, dest.id, preview.share, 'family', `Share of the funds from the ${hh.name} household`, { occurrence: `${tag}:in` });
  }
  if (lot && preview.mode !== 'moveIn' && preview.cost > 0) {
    const pay = transact(state, ctx.events, dest.id, -preview.cost, preview.mode === 'rent' ? 'bill' : 'purchase',
      preview.mode === 'rent' ? `Rent deposit: ${lot.name}` : `Bought ${lot.name}`, { occurrence: `${tag}:cost`, allowDebt: true });
    if (!pay.ok) return { ok: false, reason: pay.reason };
  }
  markProcessed(state, tag);
  if (lot && preview.mode === 'buy') {
    lot.ownerHouseholdId = dest.id;
    delete lot.price;
    for (const o of Object.values(lot.objects)) o.ownerHouseholdId = dest.id;
  }

  for (const p of movers) {
    hh.memberIds = hh.memberIds.filter((m) => m !== p.id);
    p.householdId = dest.id;
    if (!dest.memberIds.includes(p.id)) dest.memberIds.push(p.id);
    p.isNpc = true;
    takeOffLot(ctx, p, homeLocation(state, p, ctx.now));
    addMoodlet(ctx.content, p, 'movedOut', ctx.now, 'family');
    for (const other of membersOf(state, hh)) {
      addMemory(state, other, { kind: 'movedOut', importance: 2, withId: p.id, text: `${p.firstName} moved out.` });
    }
    addMemory(state, p, { kind: 'movedOut', importance: 3, text: lot ? `Moved into ${lot.name}.` : `Moved in with the ${dest.name} household.` });
  }
  if (target.kind === 'lot' && state.neighbourhood && !state.neighbourhood.npcHouseholdIds.includes(dest.id)) state.neighbourhood.npcHouseholdIds.push(dest.id);
  addFeed(state, ctx.events, 'family', lot
    ? `${names(movers)} moved out to ${lot.name} and now ${movers.length === 1 ? 'has' : 'have'} a household of their own.`
    : `${names(movers)} moved in with the ${dest.name} household.`, movers[0]!.id);
  ctx.events.emit({ type: 'family', what: 'split', personIds: ids, householdId: dest.id });
  ctx.events.emit({ type: 'household.moved', householdId: dest.id, fromLotId: hh.homeLotId, toLotId: lot?.id ?? dest.homeLotId ?? '' });
  return { ok: true, householdId: dest.id };
}

// ---------------------------------------------------------------------------------------------
// Ask to move in
// ---------------------------------------------------------------------------------------------

/** The people who come along when `target` moves in: themselves and the dependents of their household they look after. */
export function moveInGroup(state: WorldState, target: Person): Person[] {
  const hh = state.households[target.householdId];
  const members = hh ? membersOf(state, hh) : [target];
  const growns = members.filter((p) => isGrownStage(p.lifeStage));
  const kids = members.filter((p) => !isGrownStage(p.lifeStage));
  const mine = kids.filter((k) => (k.parentIds ?? []).includes(target.id) || (growns.length === 1 && growns[0]!.id === target.id));
  return [target, ...mine];
}

/** Why `target` cannot be asked to move in with `actor`'s household, or null. Pure. */
export function moveInProblem(ctx: Pick<SimCtx, 'state'>, actor: Person, target: Person): string | null {
  const state = ctx.state;
  const mine = state.households[actor.householdId];
  const theirs = state.households[target.householdId];
  if (!mine || !mine.isPlayable) return `${actor.firstName} decides for themself.`;
  if (!theirs || theirs.id === mine.id) return `${target.firstName} already lives here.`;
  if (theirs.isPlayable) return `${target.firstName} already lives in a household you run.`;
  if (!isGrownStage(target.lifeStage)) return `${target.firstName} is too young to move in alone.`;
  const group = moveInGroup(state, target);
  if (mine.memberIds.length + group.length > MAX_HOUSEHOLD_SIZE) return `The household would have more than ${MAX_HOUSEHOLD_SIZE} people.`;
  return null;
}

/** A household without members is gone, and its home is empty again (for sale unless it was for rent). */
export function dissolveHousehold(state: WorldState, hh: Household): void {
  if (hh.memberIds.length > 0 || hh.isPlayable || hh.id === state.activeHouseholdId) return;
  const old = hh.homeLotId ? state.lots[hh.homeLotId] : undefined;
  if (old) {
    if (old.ownerHouseholdId === hh.id) {
      old.ownerHouseholdId = null;
      for (const o of Object.values(old.objects)) o.ownerHouseholdId = null;
    }
    if (old.rent === undefined && old.price === undefined) old.price = Math.max(old.landValue, Math.round(homeLotValue(state, hh.id) * SALE_RATE));
  }
  delete state.households[hh.id];
  if (state.neighbourhood) {
    state.neighbourhood.npcHouseholdIds = state.neighbourhood.npcHouseholdIds.filter((x) => x !== hh.id);
    if (state.neighbourhood.nextDoorHouseholdId === hh.id) delete state.neighbourhood.nextDoorHouseholdId;
  }
}

/** The invited NPC (and their dependents) become members of the actor's household. Returns the people who moved. */
export function moveInNpc(ctx: SimCtx, actor: Person, target: Person): Person[] {
  const state = ctx.state;
  const problem = moveInProblem(ctx, actor, target);
  if (problem) return [];
  const mine = state.households[actor.householdId]!;
  const theirs = state.households[target.householdId]!;
  const day = dayIndex(ctx.now);
  const tag = `movein:${mine.id}:${target.id}:${day}`;
  if (isProcessed(state, tag)) return [];
  markProcessed(state, tag);
  const group = moveInGroup(state, target);
  const total = theirs.memberIds.length;
  const share = total > 0 ? Math.floor((theirs.funds * group.length) / total) : 0;
  if (share > 0) {
    const out = transact(state, ctx.events, theirs.id, -share, 'family', `Share of the funds for ${names(group)}`, { occurrence: `${tag}:out`, allowDebt: true });
    if (out.ok) transact(state, ctx.events, mine.id, share, 'family', `Share of the funds from ${names(group)}`, { occurrence: `${tag}:in` });
  }
  const lot = state.lots[mine.homeLotId ?? ''];
  const here = lotLoc(actor);
  for (const p of group) {
    theirs.memberIds = theirs.memberIds.filter((m) => m !== p.id);
    p.householdId = mine.id;
    mine.memberIds.push(p.id);
    p.isNpc = false;
    addMoodlet(ctx.content, p, 'newFamily', ctx.now, 'family');
    addMemory(state, p, { kind: 'movedIn', importance: 3, withId: actor.id, text: `Moved in with ${actor.firstName}'s household.` });
    if (lot && here && here.lotId === lot.id) {
      if (!lotLoc(p)) { const spot = entrySpots(ctx, lot, 1)[0]; if (spot) placeOnLot(ctx, p, lot, spot); }
    } else p.location = homeLocation(state, p, ctx.now);
    if (p.lifeStage === 'baby' && lotLoc(p)) settleBaby(ctx, p);
  }
  for (const m of mine.memberIds) { const mp = state.people[m]; if (mp && !group.includes(mp)) addMoodlet(ctx.content, mp, 'newFamily', ctx.now, 'family'); }
  // Nobody left at their old home: the household is gone and the home is empty again.
  if (theirs.memberIds.length === 0) dissolveHousehold(state, theirs);
  addFeed(state, ctx.events, 'family', `${names(group)} moved in with ${actor.firstName}'s household (${STAGE_LABELS[target.lifeStage].toLowerCase()}${group.length > 1 ? ` and ${group.length - 1} more` : ''}).`, target.id);
  ctx.events.emit({ type: 'family', what: 'moveIn', personIds: group.map((p) => p.id), householdId: mine.id });
  return group;
}

