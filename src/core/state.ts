// Small state helpers shared by every module: world creation, money transactions, feed and occurrences.

import type { EventBus } from './events';
import { newId } from './ids';
import { seedRng } from './rng';
import { START_MINUTE } from './clock';
import type {
  Cents, FeedEntry, GameMinutes, Household, Id, LedgerKind, Person, StartMode, WorldState,
} from './types';
import { SCHEMA_VERSION } from './types';

export const FEED_LIMIT = 60;
export const LEDGER_LIMIT = 200;
export const MEMORY_LIMIT = 40;
export const PROCESSED_KEEP_MINUTES = 14 * 1440; // occurrences older than two weeks are pruned

export function createEmptyWorld(seed: number, startMode: StartMode): WorldState {
  return {
    schemaVersion: SCHEMA_VERSION,
    seed,
    rng: seedRng(seed),
    nextId: 1,
    clock: { minutes: START_MINUTE, ticks: 0 },
    settings: { autonomy: true, autonomyLevel: 1, unlimitedFunds: startMode === 'sandbox', aging: 'off', visitors: true },
    startMode,
    activeHouseholdId: '',
    activeLotId: '',
    households: {},
    people: {},
    lots: {},
    relationships: {},
    bonds: {},
    processed: {},
    schedule: [],
    feed: [],
    items: {},
    homeEvents: [],
  };
}

export function addHousehold(state: WorldState, name: string, funds: Cents, homeLotId: Id | null, isPlayable: boolean): Household {
  const hh: Household = { id: newId(state, 'hh'), name, memberIds: [], homeLotId, funds, ledger: [], inventory: [], isPlayable };
  state.households[hh.id] = hh;
  return hh;
}

export type TransactResult = { ok: true; balance: Cents } | { ok: false; reason: string };

/**
 * Applies a signed amount to a household exactly once. With an occurrence id, a second call for the same
 * occurrence is a no-op that returns ok without changing money (load/catch-up safety).
 * Expenses fail when funds are insufficient, unless the world has unlimited funds (sandbox) or `allowDebt`.
 */
export function transact(
  state: WorldState, events: EventBus | null, householdId: Id, amount: Cents, kind: LedgerKind, label: string,
  opts: { occurrence?: string; allowDebt?: boolean } = {},
): TransactResult {
  if (!Number.isInteger(amount)) throw new Error(`transact: non-integer cents ${amount}`);
  const hh = state.households[householdId];
  if (!hh) return { ok: false, reason: 'Unknown household.' };
  if (opts.occurrence && state.processed[`money:${opts.occurrence}`] !== undefined) return { ok: true, balance: hh.funds };
  const free = state.settings.unlimitedFunds && amount < 0 && (kind === 'purchase' || kind === 'build');
  if (!free && amount < 0 && hh.funds + amount < 0 && !opts.allowDebt) {
    return { ok: false, reason: 'Not enough household funds.' };
  }
  const applied = free ? 0 : amount;
  hh.funds += applied;
  hh.ledger.push({ id: newId(state, 'led'), at: state.clock.minutes, kind, amount: applied, label, ...(opts.occurrence ? { occurrence: opts.occurrence } : {}) });
  if (hh.ledger.length > LEDGER_LIMIT) hh.ledger.splice(0, hh.ledger.length - LEDGER_LIMIT);
  if (opts.occurrence) state.processed[`money:${opts.occurrence}`] = state.clock.minutes;
  events?.emit({ type: 'money', householdId, amount: applied, balance: hh.funds, label });
  return { ok: true, balance: hh.funds };
}

export function addFeed(state: WorldState, events: EventBus | null, kind: FeedEntry['kind'], text: string, personId?: Id): FeedEntry {
  const entry: FeedEntry = { id: newId(state, 'feed'), at: state.clock.minutes, kind, text, ...(personId ? { personId } : {}) };
  state.feed.push(entry);
  if (state.feed.length > FEED_LIMIT) state.feed.splice(0, state.feed.length - FEED_LIMIT);
  events?.emit({ type: 'feed', entryId: entry.id });
  return entry;
}

export function isProcessed(state: WorldState, occurrence: string): boolean { return state.processed[occurrence] !== undefined; }
export function markProcessed(state: WorldState, occurrence: string): void { state.processed[occurrence] = state.clock.minutes; }

/** Drops old occurrence markers; call once per game day. Future-dated schedule entries are untouched. */
export function pruneProcessed(state: WorldState, now: GameMinutes): void {
  for (const [k, at] of Object.entries(state.processed)) if (now - at > PROCESSED_KEEP_MINUTES) delete state.processed[k];
}

export function activeHousehold(state: WorldState): Household | undefined { return state.households[state.activeHouseholdId]; }

export function householdMembers(state: WorldState, householdId: Id): Person[] {
  const hh = state.households[householdId];
  return hh ? hh.memberIds.map((id) => state.people[id]).filter((p): p is Person => !!p) : [];
}

export function peopleOnLot(state: WorldState, lotId: Id): Person[] {
  return Object.values(state.people).filter((p) => p.location.kind === 'lot' && p.location.lotId === lotId);
}

export function fullName(p: Pick<Person, 'firstName' | 'lastName'>): string { return `${p.firstName} ${p.lastName}`.trim(); }

/** Deep copy through JSON: also proves the state is serializable. */
export function cloneState(state: WorldState): WorldState { return JSON.parse(JSON.stringify(state)) as WorldState; }
