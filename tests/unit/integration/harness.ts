// Headless playtest harness: a GameCore on the real content, world, sim and persistence, plus a recorder that
// follows world events tick by tick (actions, socials, careers, money, needs, stuck people) and prints readable
// day summaries.

import { IDBFactory } from 'fake-indexeddb';
import { content } from '../../../src/content/index';
import type { ContentDB } from '../../../src/content/types';
import { DAY_NAMES, MINUTES_PER_DAY, dayIndex, formatClock, formatDay } from '../../../src/core/clock';
import type { GameEvent } from '../../../src/core/events';
import { formatMoney } from '../../../src/core/money';
import { NEED_IDS, type Id, type NeedId, type Person, type WorldState } from '../../../src/core/types';
import { GameCore } from '../../../src/game/GameCore';
import { SaveStore } from '../../../src/persistence/index';

export const db: ContentDB = content();

/** A GameCore without storage. */
export function coreWithoutSaves(): GameCore {
  return new GameCore({ content: db, saves: null, now: () => '2026-10-31T12:00:00.000Z' });
}

/** A SaveStore on a fresh, isolated fake IndexedDB and a deterministic clock. */
export async function freshStore(): Promise<SaveStore> {
  let t = Date.parse('2026-10-31T12:00:00.000Z');
  return SaveStore.open('hearthside-test', { factory: new IDBFactory(), content: db, clock: () => new Date((t += 1000)) });
}

export function members(state: WorldState): Person[] {
  return (state.households[state.activeHouseholdId]?.memberIds ?? []).map((id) => state.people[id]!).filter(Boolean);
}

export function objectsByDef(state: WorldState, defId: string): Id[] {
  const lot = state.lots[state.activeLotId]!;
  return Object.values(lot.objects).filter((o) => o.defId === defId).map((o) => o.id);
}

export interface DayStats {
  done: Record<string, number>;
  failed: Array<{ interactionId: string; reason: string; at: number }>;
  sleepMinutes: number;
  bedSleeps: number;
  workMinutes: number;
  paid: number;
  socials: number;
  onLotTicks: number;
  lowTicks: Record<NeedId, number>;
  minNeeds: Record<NeedId, number>;
}

const emptyDay = (): DayStats => ({
  done: {}, failed: [], sleepMinutes: 0, bedSleeps: 0, workMinutes: 0, paid: 0, socials: 0, onLotTicks: 0,
  lowTicks: Object.fromEntries(NEED_IDS.map((n) => [n, 0])) as Record<NeedId, number>,
  minNeeds: Object.fromEntries(NEED_IDS.map((n) => [n, 100])) as Record<NeedId, number>,
});

const ROUTE_FAILURE = /can't reach|can't get|way is blocked|can't move|couldn't get/i;

/** Follows a running game: per person and day statistics, stuck detection, socials, careers and feed. */
export class Recorder {
  readonly days = new Map<Id, DayStats[]>();
  readonly socials: Array<Extract<GameEvent, { type: 'social' }> & { at: number }> = [];
  readonly careers: Array<Extract<GameEvent, { type: 'career' }> & { at: number }> = [];
  readonly arrivals: Array<{ personId: Id; at: number }> = [];
  readonly finished: Array<Extract<GameEvent, { type: 'action.finished' }> & { at: number }> = [];
  /** Longest on-lot stretch (ticks) without any change of action, phase, progress or position. */
  readonly longestStill = new Map<Id, { ticks: number; at: number; what: string }>();
  /** Longest run of identical consecutive route failures per person. */
  readonly failureRuns = new Map<Id, number>();
  private readonly sig = new Map<Id, { s: string; since: number }>();
  private readonly lastFailure = new Map<Id, { key: string; n: number }>();
  private ticks = 0;
  private firstMinute: number | null = null;
  private readonly off: () => void;

  constructor(private readonly core: GameCore) {
    this.off = core.events.onAny((e) => this.onEvent(e));
  }

  dispose(): void { this.off(); }

  private get state(): WorldState { return this.core.state()!; }
  private get now(): number { return this.state.clock.minutes; }

  day(personId: Id, d = dayIndex(this.now)): DayStats {
    let list = this.days.get(personId);
    if (!list) { list = []; this.days.set(personId, list); }
    while (list.length <= d) list.push(emptyDay());
    return list[d]!;
  }

  private onEvent(e: GameEvent): void {
    const at = this.now;
    switch (e.type) {
      case 'action.started': {
        const p = this.state.people[e.personId];
        const a = p?.queue.find((x) => x.id === e.actionId);
        if (p && a && e.interactionId === 'sleep' && a.target.kind === 'object') {
          const loc = p.location.kind === 'lot' ? p.location : null;
          const obj = loc ? this.state.lots[loc.lotId]?.objects[a.target.objectId] : undefined;
          if (obj && db.objects[obj.defId]?.category === 'beds') this.day(p.id).bedSleeps++;
        }
        break;
      }
      case 'action.finished': {
        this.finished.push({ ...e, at });
        const d = this.day(e.personId);
        if (e.result === 'done') {
          d.done[e.interactionId] = (d.done[e.interactionId] ?? 0) + 1;
          this.lastFailure.delete(e.personId);
        } else if (e.result === 'failed') {
          const reason = e.reason ?? '';
          d.failed.push({ interactionId: e.interactionId, reason, at });
          if (ROUTE_FAILURE.test(reason)) {
            const key = `${e.interactionId}|${reason}`;
            const prev = this.lastFailure.get(e.personId);
            const n = prev && prev.key === key ? prev.n + 1 : 1;
            this.lastFailure.set(e.personId, { key, n });
            this.failureRuns.set(e.personId, Math.max(this.failureRuns.get(e.personId) ?? 0, n));
          }
        }
        break;
      }
      case 'social':
        if (e.accepted) { this.day(e.actorId).socials++; this.day(e.targetId).socials++; }
        this.socials.push({ ...e, at });
        break;
      case 'career':
        this.careers.push({ ...e, at });
        if (e.what === 'paid') this.day(e.personId).paid += e.amount ?? 0;
        break;
      case 'person.changed': {
        const p = this.state.people[e.personId];
        if (e.what === 'location' && p?.isNpc && p.location.kind === 'lot') this.arrivals.push({ personId: p.id, at });
        break;
      }
      default:
    }
  }

  /** Call after every tick. */
  sample(): void {
    this.ticks++;
    if (this.firstMinute === null) this.firstMinute = this.now - 0.25;
    for (const p of members(this.state)) {
      const d = this.day(p.id);
      const loc = p.location;
      if (loc.kind !== 'lot') {
        if (loc.place === 'work') d.workMinutes += 0.25;
        this.sig.set(p.id, { s: `off:${loc.place}`, since: this.ticks });
        continue;
      }
      d.onLotTicks++;
      for (const n of NEED_IDS) {
        const v = p.needs[n];
        if (v < 15) d.lowTicks[n]++;
        if (v < d.minNeeds[n]) d.minNeeds[n] = v;
      }
      const a = p.queue[0];
      if (a?.interactionId === 'sleep' && a.phase === 'perform') d.sleepMinutes += 0.25;
      const s = `${a?.id ?? '-'}|${a?.phase ?? ''}|${a?.elapsed ?? 0}|${loc.x.toFixed(3)},${loc.z.toFixed(3)}|${loc.posture}`;
      const prev = this.sig.get(p.id);
      if (!prev || prev.s !== s) { this.sig.set(p.id, { s, since: this.ticks }); continue; }
      const still = this.ticks - prev.since;
      const best = this.longestStill.get(p.id);
      if (!best || still > best.ticks) {
        this.longestStill.set(p.id, { ticks: still, at: this.now, what: a ? `${a.interactionId} (${a.phase})` : 'idle' });
      }
    }
  }

  /** Runs ticks one by one with sampling. */
  run(ticks: number): void {
    for (let i = 0; i < ticks; i++) { this.core.advanceTicks(1); this.sample(); }
  }

  /** Runs until `minute` (absolute game minutes). */
  runUntil(minute: number): void {
    const n = Math.max(0, Math.round((minute - this.now) * 4));
    this.run(n);
  }

  /** Readable per-person day summaries. */
  summary(): string[] {
    const lines: string[] = [];
    for (const p of members(this.state)) {
      const list = this.days.get(p.id) ?? [];
      const first = this.firstMinute ?? 0, last = this.now;
      list.forEach((d, i) => {
        const from = Math.max(first, i * MINUTES_PER_DAY), to = Math.min(last, (i + 1) * MINUTES_PER_DAY);
        if (to <= from) return;
        const span = to - from < MINUTES_PER_DAY ? ` ${formatClock(from)}-${formatClock(to)}` : '';
        const eat = (d.done.eatMeal ?? 0) + (d.done.grabSnack ?? 0);
        const low = NEED_IDS.filter((n) => d.lowTicks[n] > 0).map((n) => `${n} ${Math.round((100 * d.lowTicks[n]) / Math.max(1, d.onLotTicks))}%`);
        const mins = NEED_IDS.map((n) => `${n[0]!.toUpperCase()}${Math.round(d.minNeeds[n])}`).join(' ');
        const top = Object.entries(d.done).filter(([k]) => !['eatMeal', 'grabSnack', 'cookMeal', 'sleep', 'goHere', 'goToWork'].includes(k))
          .sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${v}`).join(', ');
        lines.push(`Day ${i + 1} (${DAY_NAMES[i % 7]}${span}) ${p.firstName}: cooked ${d.done.cookMeal ?? 0}, ate ${eat} (meals ${d.done.eatMeal ?? 0}, snacks ${d.done.grabSnack ?? 0}), `
          + `slept ${(d.sleepMinutes / 60).toFixed(1)} h in bed x${d.bedSleeps}, worked ${(d.workMinutes / 60).toFixed(1)} h, paid ${formatMoney(d.paid)}, `
          + `socials ${d.socials}, failed ${d.failed.length}; min needs ${mins}${low.length ? `; below 15: ${low.join(', ')}` : ''}; also ${top || 'nothing else'}`);
      });
    }
    return lines;
  }

  /** Short timeline line for debugging. */
  stamp(at = this.now): string { return `${formatDay(at)} ${formatClock(at)}`; }
}

export const TICKS_PER_DAY = MINUTES_PER_DAY * 4;
