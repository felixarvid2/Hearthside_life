// Balance audit (Milestone 13): plays representative households headlessly for several game weeks with autonomy and
// reports, per week: money by source, need averages and lows, time per activity, skills and career progress,
// relationships, events and stuck or failed actions. Deterministic for a given seed.
//
// Pure library (runs under Vite's module runner or vitest); the command line is tools/balance-audit.ts.
// Player policy used by every scenario (the "no player mistakes" baseline): bills are auto-paid, unemployed adults
// join a career on day 0, and a teenager takes a part-time job. Nothing else is steered: autonomy does the rest.

import { premadeHouseholdList } from '../../src/characters/creator';
import { content as loadContent } from '../../src/content/index';
import type { ContentDB } from '../../src/content/types';
import { MINUTES_PER_DAY, dayIndex } from '../../src/core/clock';
import type { GameEvent } from '../../src/core/events';
import { NEED_IDS, type Id, type LifeStage, type NeedId, type Person, type WorldState } from '../../src/core/types';
import { GameCore } from '../../src/game/GameCore';
import { careersForStage } from '../../src/sim/careers';
import { labelOf } from '../../src/sim/relationships';

export const TICK_MINUTES = 0.25;
export const WEEK_MINUTES = 7 * MINUTES_PER_DAY;

export type MoneyKey = 'wages' | 'freelance' | 'otherSales' | 'rewards' | 'bills' | 'groceries' | 'purchases' | 'gifts' | 'family' | 'repairs';
export const MONEY_KEYS: readonly MoneyKey[] = ['wages', 'freelance', 'otherSales', 'rewards', 'bills', 'groceries', 'purchases', 'gifts', 'family', 'repairs'];

export interface WeekReport {
  week: number;
  /** Cents in (positive) and out (negative) by source. */
  money: Record<MoneyKey, number>;
  fundsStart: number;
  fundsEnd: number;
  /** Mean and lowest value per need over the member-ticks spent at home, and the share of those ticks below 15 and 25. */
  needMean: Record<NeedId, number>;
  needMin: Record<NeedId, number>;
  needBelow15: Record<NeedId, number>;
  /** Hours per activity, summed over the household (activity = interaction id, or away:<place>, sleep, idle, walking). */
  hours: Record<string, number>;
  skillLevels: number;
  skillLevelUps: number;
  careerLevels: Record<string, number>;
  promotions: number;
  demotions: number;
  missedShifts: number;
  socialsAccepted: number;
  socialsRefused: number;
  /** Relationships (members to anyone outside the household) at or above each label by week end. */
  acquaintances: number;
  friends: number;
  partners: number;
  homeEventsEnded: number;
  venueTrips: number;
  actionsDone: number;
  actionsFailed: number;
  failedBy: Record<string, number>;
  /** Longest stretch (game minutes) one member did not change action, phase, progress or position while on the lot. */
  longestStillMinutes: number;
  /** Who stood still longest and what they were doing (action id and phase, or idle). */
  longestStillWho: string;
  /** Idle hours per member (nothing queued, on the lot). */
  idleHours: Record<string, number>;
  billsOverdue: number;
  powerCutDays: number;
}

export interface ScenarioReport {
  id: string;
  label: string;
  seed: number;
  members: Array<{ name: string; stage: LifeStage; job: string }>;
  fundsAtStart: number;
  weeks: WeekReport[];
  /** Plain-language findings against the targets (empty when everything is within range). */
  findings: string[];
}

export interface Scenario {
  id: string;
  label: string;
  setup(core: GameCore, content: ContentDB): void;
}

// ---------------------------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------------------------

function adopt(core: GameCore, stage: 'baby' | 'toddler' | 'child' | 'teen', name: string, sex: 'girl' | 'boy'): Id {
  const s = core.state()!;
  const parent = s.households[s.activeHouseholdId]!.memberIds[0]!;
  const r = core.adopt(parent, { stage, sex, firstName: name });
  if (!r.ok || !r.personId) throw new Error(`adopt ${stage} failed: ${r.ok ? '' : r.reason}`);
  return r.personId;
}

function givePolicyJobs(core: GameCore, content: ContentDB): void {
  const s = core.state()!;
  const hh = s.households[s.activeHouseholdId]!;
  for (const id of hh.memberIds) {
    const p = s.people[id]!;
    if (p.career) continue;
    if (p.lifeStage === 'teen') {
      const job = careersForStage(content, 'teen')[0];
      if (job) core.joinCareer(id, job.id);
    } else if (p.lifeStage === 'adult' || p.lifeStage === 'youngAdult') {
      const job = careersForStage(content, p.lifeStage)[0];
      if (job) core.joinCareer(id, job.id);
    }
  }
}

export const SCENARIOS: readonly Scenario[] = [
  { id: 'single', label: 'Single adult (Maren, cook)', setup: () => undefined },
  { id: 'couple', label: 'Couple (Ines and Rafael)', setup: () => undefined },
  {
    id: 'family', label: 'Family with children (couple, a child and a toddler)',
    setup(core) { adopt(core, 'child', 'Mia', 'girl'); adopt(core, 'toddler', 'Leo', 'boy'); },
  },
  {
    id: 'elder', label: 'Elder living alone (retired, no income)',
    setup(core) {
      const s = core.state()!;
      const id = s.households[s.activeHouseholdId]!.memberIds[0]!;
      core.quitCareer(id);
      s.people[id]!.lifeStage = 'elder';
    },
  },
  {
    id: 'teen', label: 'Teen with a part-time job (adult parent works too)',
    setup(core, content) {
      const teen = adopt(core, 'teen', 'Tess', 'girl');
      const job = careersForStage(content, 'teen')[0];
      if (job) core.joinCareer(teen, job.id);
    },
  },
];

const PREMADE_OF: Record<string, string> = { single: 'lindqvist', couple: 'moreau', family: 'moreau', elder: 'lindqvist', teen: 'lindqvist' };

// ---------------------------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------------------------

function emptyWeek(week: number, fundsStart: number): WeekReport {
  const per = <T,>(v: T) => Object.fromEntries(NEED_IDS.map((n) => [n, v])) as Record<NeedId, T>;
  return {
    week, money: Object.fromEntries(MONEY_KEYS.map((k) => [k, 0])) as Record<MoneyKey, number>, fundsStart, fundsEnd: fundsStart,
    needMean: per(0), needMin: per(100), needBelow15: per(0), hours: {}, skillLevels: 0, skillLevelUps: 0, careerLevels: {},
    promotions: 0, demotions: 0, missedShifts: 0, socialsAccepted: 0, socialsRefused: 0, acquaintances: 0, friends: 0, partners: 0,
    homeEventsEnded: 0, venueTrips: 0, actionsDone: 0, actionsFailed: 0, failedBy: {}, longestStillMinutes: 0, longestStillWho: '', idleHours: {}, billsOverdue: 0, powerCutDays: 0,
  };
}

function moneyKey(kind: string, occurrence: string | undefined): MoneyKey | null {
  switch (kind) {
    case 'wage': case 'career': return 'wages';
    case 'sale': return occurrence?.startsWith('freelance:') ? 'freelance' : 'otherSales';
    case 'reward': return 'rewards';
    case 'bill': return 'bills';
    case 'groceries': return 'groceries';
    case 'purchase': case 'build': return 'purchases';
    case 'gift': return 'gifts';
    case 'family': return 'family';
    case 'repair': case 'refund': return 'repairs';
    default: return null; // 'start'
  }
}

class Auditor {
  readonly weeks: WeekReport[] = [];
  private cur: WeekReport;
  private weekStartMinute: number;
  private memberTicks = 0;
  private readonly needSum: Record<NeedId, number> = Object.fromEntries(NEED_IDS.map((n) => [n, 0])) as Record<NeedId, number>;
  private readonly needLow: Record<NeedId, number> = Object.fromEntries(NEED_IDS.map((n) => [n, 0])) as Record<NeedId, number>;
  private readonly sig = new Map<Id, { s: string; since: number }>();
  private ticks = 0;
  private readonly off: () => void;

  constructor(private readonly core: GameCore, _content: ContentDB) {
    const s = core.state()!;
    this.weekStartMinute = s.clock.minutes;
    this.cur = emptyWeek(0, this.hh().funds);
    this.off = core.events.onAny((e) => this.onEvent(e));
  }

  dispose(): void { this.off(); }
  private get state(): WorldState { return this.core.state()!; }
  private hh() { return this.state.households[this.state.activeHouseholdId]!; }
  private members(): Person[] { return this.hh().memberIds.map((id) => this.state.people[id]!).filter(Boolean); }

  private onEvent(e: GameEvent): void {
    const w = this.cur;
    switch (e.type) {
      case 'money': {
        if (e.householdId !== this.state.activeHouseholdId) break;
        const entry = this.hh().ledger[this.hh().ledger.length - 1];
        const key = moneyKey(entry?.kind ?? '', entry?.occurrence);
        if (key) w.money[key] += e.amount;
        break;
      }
      case 'career':
        if (this.state.people[e.personId]?.householdId !== this.state.activeHouseholdId) break;
        if (e.what === 'promoted') w.promotions++;
        else if (e.what === 'demoted') w.demotions++;
        else if (e.what === 'missed') w.missedShifts++;
        break;
      case 'skill.level':
        if (this.state.people[e.personId]?.householdId === this.state.activeHouseholdId) w.skillLevelUps++;
        break;
      case 'social':
        if (this.state.people[e.actorId]?.householdId !== this.state.activeHouseholdId) break;
        if (e.accepted) w.socialsAccepted++; else w.socialsRefused++;
        break;
      case 'homeEvent':
        if (e.what === 'ended') w.homeEventsEnded++;
        break;
      case 'travel':
        if (e.what === 'arrived' && e.personIds.some((id) => this.state.people[id]?.householdId === this.state.activeHouseholdId)) w.venueTrips++;
        break;
      case 'action.finished': {
        if (this.state.people[e.personId]?.householdId !== this.state.activeHouseholdId) break;
        if (e.result === 'done') w.actionsDone++;
        else if (e.result === 'failed') {
          w.actionsFailed++;
          const key = `${e.interactionId}: ${(e.reason ?? 'no reason').replace(/\d+/g, 'N')}`;
          w.failedBy[key] = (w.failedBy[key] ?? 0) + 1;
        }
        break;
      }
      default:
    }
  }

  /** Call after every tick. */
  sample(): void {
    this.ticks++;
    const w = this.cur;
    const s = this.state;
    if (this.hh().powerOff && s.clock.minutes % MINUTES_PER_DAY < TICK_MINUTES) w.powerCutDays++;
    for (const p of this.members()) {
      const loc = p.location;
      let key: string;
      if (loc.kind !== 'lot') key = `away:${loc.place}`;
      else {
        const a = p.queue[0];
        key = a ? (a.phase === 'perform' || a.interactionId === 'sleep' ? a.interactionId : `walking`) : 'idle';
        this.memberTicks++;
        for (const n of NEED_IDS) {
          const v = p.needs[n];
          this.needSum[n] += v;
          if (v < 15) this.needLow[n]++;
          if (v < w.needMin[n]) w.needMin[n] = v;
        }
        const sg = `${a?.id ?? '-'}|${a?.phase ?? ''}|${a?.elapsed ?? 0}|${loc.x.toFixed(3)},${loc.z.toFixed(3)}|${loc.posture}`;
        const prev = this.sig.get(p.id);
        if (!prev || prev.s !== sg) this.sig.set(p.id, { s: sg, since: this.ticks });
        else if (!a && Math.min(...NEED_IDS.map((n) => p.needs[n])) >= 30) { /* content and idle: not stuck */ } else {
          const still = (this.ticks - prev.since) * TICK_MINUTES;
          if (still > w.longestStillMinutes) { w.longestStillMinutes = still; w.longestStillWho = `${p.firstName} (${p.lifeStage}): ${a ? `${a.interactionId}/${a.phase}` : 'idle'}`; }
        }
        if (!a) w.idleHours[p.firstName] = (w.idleHours[p.firstName] ?? 0) + TICK_MINUTES / 60;
      }
      w.hours[key] = (w.hours[key] ?? 0) + TICK_MINUTES / 60;
    }
    if (s.clock.minutes - this.weekStartMinute >= WEEK_MINUTES) this.closeWeek();
  }

  private closeWeek(): void {
    const w = this.cur, s = this.state, hh = this.hh();
    for (const n of NEED_IDS) {
      w.needMean[n] = this.memberTicks > 0 ? this.needSum[n] / this.memberTicks : 0;
      w.needBelow15[n] = this.memberTicks > 0 ? this.needLow[n] / this.memberTicks : 0;
    }
    w.fundsEnd = hh.funds;
    const ids = new Set(hh.memberIds);
    const seen = { acq: new Set<string>(), friend: new Set<string>(), partner: new Set<string>() };
    for (const id of hh.memberIds) {
      const p = s.people[id]!;
      w.skillLevels += Object.values(p.skills).reduce((a, k) => a + k.level, 0);
      if (p.career) w.careerLevels[p.firstName] = p.career.level;
      for (const other of Object.values(s.people)) {
        if (other.id === id || ids.has(other.id)) continue;
        const l = labelOf(s, id, other.id);
        const pair = [id, other.id].sort().join('|');
        if (l === 'stranger') continue;
        seen.acq.add(pair);
        if (l === 'friend' || l === 'closeFriend' || l === 'bestFriend') seen.friend.add(pair);
        if (l === 'partner' || l === 'engaged' || l === 'spouse' || l === 'crush') seen.partner.add(pair);
      }
    }
    w.acquaintances = seen.acq.size; w.friends = seen.friend.size; w.partners = seen.partner.size;
    w.billsOverdue = (s.bills ?? []).filter((b) => b.householdId === hh.id && b.status === 'overdue').length;
    this.weeks.push(w);
    this.weekStartMinute += WEEK_MINUTES;
    this.cur = emptyWeek(w.week + 1, hh.funds);
    this.memberTicks = 0;
    for (const n of NEED_IDS) { this.needSum[n] = 0; this.needLow[n] = 0; }
  }
}

// ---------------------------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------------------------

export interface RunOptions { weeks: number; seed: number; content?: ContentDB }

export function runScenario(sc: Scenario, o: RunOptions): ScenarioReport {
  const content = o.content ?? loadContent();
  const core = new GameCore({ content, saves: null, now: () => '2026-11-08T12:00:00.000Z' });
  const premade = premadeHouseholdList(content).find((h) => h.id === PREMADE_OF[sc.id]);
  if (!premade) throw new Error(`premade household for ${sc.id} not found`);
  const started = core.startNewGame('guided', premade.draft, o.seed);
  if (!started.ok) throw new Error(`start failed: ${started.reason}`);
  const s0 = core.state()!;
  s0.settings.visitors = true;
  core.setSimSettings({ autoPayBills: true });
  sc.setup(core, content);
  givePolicyJobs(core, content);
  const hh0 = s0.households[s0.activeHouseholdId]!;
  const members = hh0.memberIds.map((id) => s0.people[id]!).map((p) => ({
    name: p.firstName, stage: p.lifeStage, job: p.career ? (content.careers[p.career.careerId]?.name ?? p.career.careerId) : 'none',
  }));
  const fundsAtStart = hh0.funds;
  const aud = new Auditor(core, content);
  const total = Math.ceil((o.weeks * WEEK_MINUTES) / TICK_MINUTES);
  try {
    for (let i = 0; i < total; i++) { core.advanceTicks(1); aud.sample(); }
  } finally { aud.dispose(); }
  const report: ScenarioReport = { id: sc.id, label: sc.label, seed: o.seed, members, fundsAtStart, weeks: aud.weeks, findings: [] };
  report.findings = findings(report);
  return report;
}

// ---------------------------------------------------------------------------------------------
// Targets and findings
// ---------------------------------------------------------------------------------------------

/** Targets a healthy household meets with the baseline player policy (docs/BALANCE.md). */
export const TARGETS = {
  /** Mean of each need over the week, for every household. */
  needMeanMin: 40,
  /** No need is below 15 for more than this share of the time at home. */
  needBelow15Max: 0.05,
  /** Funds never fall below this fraction of the starting funds within the audited weeks (working households). */
  fundsFloorShare: 0.5,
  /** A working household earns at least this multiple of its weekly bill and groceries. */
  incomeCoverMin: 1.1,
  /** A person is never stuck longer than this (game minutes) without the action, phase, progress or position changing. */
  stillMinutesMax: 240,
  /** Failed actions per 100 completed actions. */
  failedPer100Max: 8,
  /** At least this many accepted socials per member per week on average. */
  socialsPerMemberMin: 2,
} as const;

export function findings(r: ScenarioReport): string[] {
  const out: string[] = [];
  const n = r.members.length;
  const working = r.members.some((m) => m.job !== 'none');
  let low = r.fundsAtStart;
  for (const w of r.weeks) {
    low = Math.min(low, w.fundsEnd);
    for (const need of NEED_IDS) {
      if (w.needMean[need] < TARGETS.needMeanMin) out.push(`week ${w.week + 1}: ${need} averages ${w.needMean[need].toFixed(0)} (target at least ${TARGETS.needMeanMin})`);
      if (w.needBelow15[need] > TARGETS.needBelow15Max) out.push(`week ${w.week + 1}: ${need} is below 15 for ${(w.needBelow15[need] * 100).toFixed(0)}% of the time at home`);
    }
    if (w.longestStillMinutes > TARGETS.stillMinutesMax) out.push(`week ${w.week + 1}: ${w.longestStillWho || 'a member'} stood still for ${w.longestStillMinutes.toFixed(0)} min`);
    const failRate = (100 * w.actionsFailed) / Math.max(1, w.actionsDone);
    if (failRate > TARGETS.failedPer100Max) out.push(`week ${w.week + 1}: ${failRate.toFixed(1)} failed actions per 100 done (${Object.keys(w.failedBy).slice(0, 2).join('; ')})`);
    if (w.powerCutDays > 0) out.push(`week ${w.week + 1}: power was cut`);
    if (w.billsOverdue > 0) out.push(`week ${w.week + 1}: ${w.billsOverdue} bill(s) overdue`);
  }
  if (low < r.fundsAtStart * TARGETS.fundsFloorShare && working) out.push(`funds fell to ${(low / 100).toFixed(0)} dollars (below ${TARGETS.fundsFloorShare * 100}% of the start)`);
  const last = r.weeks[r.weeks.length - 1];
  if (last && !working && last.fundsEnd < 0) out.push('no income and funds are gone');
  const fundsEnd = last?.fundsEnd ?? r.fundsAtStart;
  const net = (fundsEnd - r.fundsAtStart) / Math.max(1, r.weeks.length);
  if (net < 0 && fundsEnd + net * 8 < 0) out.push(`net ${(net / 100).toFixed(0)} dollars a week: the funds run out within about ${Math.max(1, Math.floor(fundsEnd / -net))} more weeks`);
  const socials = r.weeks.reduce((a, w) => a + w.socialsAccepted, 0) / Math.max(1, r.weeks.length * n);
  if (socials < TARGETS.socialsPerMemberMin && n > 0) out.push(`only ${socials.toFixed(1)} accepted socials per member per week`);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------------------------

const usd = (c: number) => `${c < 0 ? '-' : ''}$${Math.abs(Math.round(c / 100)).toLocaleString('en-US')}`;
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

export function formatReport(r: ScenarioReport): string {
  const lines: string[] = [];
  lines.push(`== ${r.label} (seed ${r.seed}) ==`);
  lines.push(`Members: ${r.members.map((m) => `${m.name} (${m.stage}, ${m.job})`).join(', ')}; starting funds ${usd(r.fundsAtStart)}`);
  for (const w of r.weeks) {
    const m = w.money;
    lines.push(`-- Week ${w.week + 1}: funds ${usd(w.fundsStart)} -> ${usd(w.fundsEnd)}`);
    lines.push(`   money: wages ${usd(m.wages)}, freelance ${usd(m.freelance)}, other sales ${usd(m.otherSales)}, rewards ${usd(m.rewards)}, bills ${usd(m.bills)}, groceries ${usd(m.groceries)}, purchases ${usd(m.purchases)}, gifts ${usd(m.gifts)}, family ${usd(m.family)}, repairs ${usd(m.repairs)}`);
    lines.push(`   needs mean/min/below15: ${NEED_IDS.map((n) => `${n} ${w.needMean[n].toFixed(0)}/${w.needMin[n].toFixed(0)}/${pct(w.needBelow15[n])}`).join(', ')}`);
    const top = Object.entries(w.hours).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v.toFixed(1)}h`).join(', ');
    lines.push(`   hours: ${top}`);
    lines.push(`   skills: total levels ${w.skillLevels} (+${w.skillLevelUps} this week); careers ${Object.entries(w.careerLevels).map(([k, v]) => `${k} L${v}`).join(', ') || 'none'}; promotions ${w.promotions}, demotions ${w.demotions}, missed shifts ${w.missedShifts}`);
    lines.push(`   people: socials ${w.socialsAccepted} accepted/${w.socialsRefused} refused; known ${w.acquaintances}, friends ${w.friends}, romance ${w.partners}; home events ${w.homeEventsEnded}, trips ${w.venueTrips}`);
    lines.push(`   actions: ${w.actionsDone} done, ${w.actionsFailed} failed${w.actionsFailed ? ` (${Object.entries(w.failedBy).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} x${v}`).join('; ')})` : ''}; longest still ${w.longestStillMinutes.toFixed(0)} min${w.longestStillWho ? ` [${w.longestStillWho}]` : ''}; idle h ${Object.entries(w.idleHours).map(([k, v]) => `${k} ${v.toFixed(0)}`).join('/') || '0'}; overdue bills ${w.billsOverdue}; power-cut days ${w.powerCutDays}`);
  }
  lines.push(r.findings.length ? `Findings:\n${r.findings.map((f) => `  - ${f}`).join('\n')}` : 'Findings: none (within targets)');
  return lines.join('\n');
}

/** One line per scenario and week, for the tables in docs/BALANCE.md. */
export function summaryRows(r: ScenarioReport): string[] {
  return r.weeks.map((w) => {
    const income = w.money.wages + w.money.freelance + w.money.otherSales + w.money.rewards;
    const out = w.money.bills + w.money.groceries + w.money.purchases + w.money.gifts + w.money.repairs;
    const worst = NEED_IDS.reduce((a, n) => (w.needMean[n] < w.needMean[a] ? n : a), NEED_IDS[0]!);
    return `| ${r.id} | ${w.week + 1} | ${usd(income)} | ${usd(out)} | ${usd(w.fundsEnd)} | ${worst} ${w.needMean[worst].toFixed(0)} | ${w.promotions} | ${w.skillLevelUps} | ${w.friends} | ${w.actionsFailed} |`;
  });
}

export { dayIndex };
