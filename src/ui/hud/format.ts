// Pure helpers that turn state + content into display data for the HUD. No DOM; unit-tested in
// tests/unit/ui/format.test.ts. Never assume a content id exists: every lookup has a readable fallback.

import type { AspirationObjective, CareerLevelDef, ContentDB } from '../../content/types';
import { DAY_NAMES, START_MINUTE, dayIndex, formatClock, formatDuration } from '../../core/clock';
import { pairKey } from '../../core/ids';
import { LABEL_TEXT, MEMORY_EFFECTS } from '../../core/relations';
import { formatMoney } from '../../core/money';
import type { ActionInstance, BondStatus, CareerState, FamilyTie, Memory, NeedId, Person, RelLabel, WorldState } from '../../core/types';

export { formatMoney };

export const NEED_LABELS: Record<NeedId, string> = {
  hunger: 'Hunger', energy: 'Energy', hygiene: 'Hygiene', bladder: 'Bladder', fun: 'Fun', social: 'Social',
};

/** Turns 'grabSnack' / 'go-here' into 'Grab snack' / 'Go here'. */
export function humanize(id: string): string {
  const s = id.replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : id;
}

export function interactionName(db: ContentDB, id: string): string {
  return db.interactions[id]?.name ?? db.socials[id]?.name ?? humanize(id);
}

export function interactionIcon(db: ContentDB, id: string): string {
  return db.interactions[id]?.icon ?? db.socials[id]?.icon ?? 'clock';
}

export function personName(state: WorldState, id: string | undefined): string {
  const p = id ? state.people[id] : undefined;
  return p ? `${p.firstName} ${p.lastName}`.trim() : 'Someone';
}

export function initials(p: Pick<Person, 'firstName' | 'lastName'>): string {
  return `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`.toUpperCase() || '?';
}

/** "with June", "at the fridge", "here", "" */
export function actionTarget(state: WorldState, db: ContentDB, a: ActionInstance): string {
  const t = a.target;
  switch (t.kind) {
    case 'person': return `with ${state.people[t.personId]?.firstName ?? 'someone'}`;
    case 'object': {
      for (const lot of Object.values(state.lots)) {
        const o = lot.objects[t.objectId];
        if (o) return `at the ${(db.objects[o.defId]?.name ?? humanize(o.defId)).toLowerCase()}`;
      }
      return '';
    }
    case 'item': return 'the meal';
    case 'tile': return '';
    default: return '';
  }
}

export function phaseLabel(a: ActionInstance): string {
  if (a.cancelRequested) return 'Stopping';
  switch (a.phase) {
    case 'queued': return 'Waiting';
    case 'validate': case 'reserve': return 'Getting ready';
    case 'route': return 'On the way';
    case 'prepare': return 'Getting started';
    case 'perform': return 'In progress';
    case 'apply': case 'cleanup': return 'Finishing';
    case 'done': return 'Done';
    case 'failed': return a.failureReason ? `Failed: ${a.failureReason}` : 'Failed';
    case 'cancelled': return 'Cancelled';
    default: return '';
  }
}

/** 0..1 progress of the running action, or null when unknown (until a need is full, still routing...). */
export function actionProgress(a: ActionInstance, person?: Person, db?: ContentDB): number | null {
  if (a.phase !== 'perform' && a.phase !== 'apply' && a.phase !== 'cleanup') return null;
  if (a.duration && a.duration > 0) return Math.max(0, Math.min(1, a.elapsed / a.duration));
  const def = db?.interactions[a.interactionId];
  if (person && def && def.duration.kind === 'untilFull') return Math.max(0, Math.min(1, person.needs[def.duration.need] / 100));
  return null;
}

// ---------------------------------------------------------------------------------------------
// Mood
// ---------------------------------------------------------------------------------------------

export type MoodTone = 'great' | 'good' | 'low' | 'bad';

/** Mood value (about -100..100) to a tone used for the ring style. */
export function moodTone(value: number): MoodTone {
  if (value >= 40) return 'great';
  if (value >= 5) return 'good';
  if (value > -25) return 'low';
  return 'bad';
}

// ---------------------------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------------------------

export const BOND_LABELS: Record<BondStatus, string> = {
  acquaintance: 'Acquaintance', friend: 'Friend', closeFriend: 'Close friend', rival: 'Rival', partner: 'Partner',
  engaged: 'Engaged', spouse: 'Spouse', exPartner: 'Ex-partner',
};

const TIE_LABELS: Record<FamilyTie, string> = { parent: 'Parent', child: 'Child', sibling: 'Sibling', partner: 'Partner', spouse: 'Spouse', roommate: 'Roommate', none: '' };

export interface MemoryRow {
  id: string;
  text: string;
  /** Importance 3 = milestone, kept for good. */
  importance: 1 | 2 | 3;
  /** Merged repetitions (x3). */
  count: number;
  /** "Day 3, 2:10 PM". */
  when: string;
  at: number;
  resolved: boolean;
}

export interface RelationshipRow {
  otherId: string;
  name: string;
  friendship: number;
  trust: number;
  romance: number;
  /** Shared bond ("Friend", "Spouse"), "Acquaintance" or "Stranger". */
  status: string;
  /** How this person sees the other (derived with hysteresis): the label shown next to the bars. */
  label: RelLabel;
  labelText: string;
  family: string;
  sameHousehold: boolean;
  /** Romance bar is shown when there is any, or a commitment. */
  showRomance: boolean;
  /** Memories involving the other person, newest first (at most MEMORY_ROWS), and how many more there are. */
  memories: MemoryRow[];
  moreMemories: number;
  /** Plain-words effects memories still have ("less receptive after the argument, 3 h left"). */
  effects: string[];
}

export const MEMORY_ROWS = 5;

export function memoryRow(m: Memory): MemoryRow {
  return { id: m.id, text: m.text, importance: m.importance, count: m.count, when: formatGameTime(m.at), at: m.at, resolved: m.resolved === true };
}

/** Memory effects still running at `now` for memories of `other`, as short texts with the time left. */
export function memoryEffects(me: Person | undefined, other: string, now: number): string[] {
  if (!me) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of [...(me.memories ?? [])].sort((a, b) => b.at - a.at)) {
    if (m.withId !== other || m.resolved) continue;
    const fx = MEMORY_EFFECTS[m.kind];
    const left = fx ? m.at + fx.minutes - now : 0;
    if (!fx || left <= 0 || seen.has(m.kind)) continue;
    seen.add(m.kind);
    out.push(`${fx.text.charAt(0).toUpperCase()}${fx.text.slice(1)} (${formatDuration(left)} left)`);
  }
  return out;
}

/** People `personId` knows (directed relationships from them), best friendship first. */
export function relationshipRows(state: WorldState, personId: string): RelationshipRow[] {
  const me = state.people[personId];
  const rows: RelationshipRow[] = [];
  for (const r of Object.values(state.relationships)) {
    if (r.from !== personId || r.to === personId) continue;
    const other = state.people[r.to];
    if (!other) continue;
    const bond = state.bonds[pairKey(personId, r.to)];
    let family = '';
    if (bond && bond.familyAtoB !== 'none') {
      // familyAtoB is b's role from a's point of view
      const tie: FamilyTie = bond.a === personId ? bond.familyAtoB : invertTie(bond.familyAtoB);
      family = TIE_LABELS[tie];
    }
    const label: RelLabel = r.label ?? (bond && ['partner', 'engaged', 'spouse', 'exPartner'].includes(bond.status) ? bond.status as RelLabel : r.familiarity > 0 ? 'acquaintance' : 'stranger');
    const mems = (me?.memories ?? []).filter((m) => m.withId === r.to).sort((a, b) => b.at - a.at);
    rows.push({
      otherId: r.to, name: `${other.firstName} ${other.lastName}`.trim(), friendship: r.friendship, trust: r.trust ?? 0, romance: r.romance,
      status: bond ? BOND_LABELS[bond.status] ?? humanize(bond.status) : r.familiarity > 0 ? 'Acquaintance' : 'Stranger',
      label, labelText: LABEL_TEXT[label] ?? humanize(label),
      family, sameHousehold: !!me && other.householdId === me.householdId,
      showRomance: r.romance !== 0 || label === 'crush' || ['partner', 'engaged', 'spouse'].includes(label),
      memories: mems.slice(0, MEMORY_ROWS).map(memoryRow), moreMemories: Math.max(0, mems.length - MEMORY_ROWS),
      effects: memoryEffects(me, r.to, state.clock.minutes),
    });
  }
  rows.sort((a, b) => Number(b.sameHousehold) - Number(a.sameHousehold) || b.friendship - a.friendship || a.name.localeCompare(b.name));
  return rows;
}

export function invertTie(t: FamilyTie): FamilyTie {
  return t === 'parent' ? 'child' : t === 'child' ? 'parent' : t;
}

// ---------------------------------------------------------------------------------------------
// Career
// ---------------------------------------------------------------------------------------------

export function formatDays(days: number[]): string {
  const sorted = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (!sorted.length) return 'No set days';
  const short = (d: number) => (DAY_NAMES[d] ?? '').slice(0, 3);
  const runs: string[] = [];
  let start = sorted[0]!, prev = start;
  for (let i = 1; i <= sorted.length; i++) {
    const d = sorted[i];
    if (d !== undefined && d === prev + 1) { prev = d; continue; }
    runs.push(start === prev ? short(start) : prev - start === 1 ? `${short(start)}, ${short(prev)}` : `${short(start)}-${short(prev)}`);
    if (d !== undefined) { start = d; prev = d; }
  }
  return runs.join(', ');
}

export function formatShiftHours(lvl: Pick<CareerLevelDef, 'start' | 'end'>): string {
  return `${formatClock(lvl.start)} - ${formatClock(lvl.end)}`;
}

/** Pay for one full shift at this level. */
export function shiftPay(lvl: Pick<CareerLevelDef, 'start' | 'end' | 'hourlyWage'>): number {
  const minutes = lvl.end > lvl.start ? lvl.end - lvl.start : lvl.end + 1440 - lvl.start;
  return Math.round((lvl.hourlyWage * minutes) / 60);
}

export const SHIFT_LABELS: Record<NonNullable<CareerState['shift']>['status'], string> = {
  upcoming: 'Shift coming up', commuting: 'On the way to work', atWork: 'At work', done: 'Shift done', missed: 'Missed the shift',
};

/** Shift text for today, e.g. "At work until 5:00 PM" / "Day off today". */
export function shiftStatusText(state: WorldState, career: CareerState, lvl: CareerLevelDef | undefined): string {
  if (!lvl) return career.shift ? SHIFT_LABELS[career.shift.status] : 'No shift today';
  const day = dayIndex(state.clock.minutes);
  const works = lvl.days.includes(day % 7);
  const s = career.shift;
  if (s) {
    // commuting / at work are always current; other statuses only describe today's occurrence
    if (s.status === 'commuting') return 'On the way to work';
    if (s.status === 'atWork') return `At work until ${formatClock(lvl.end)}`;
    if (s.occurrence.endsWith(`:${day}`)) {
      if (s.status === 'done') return `Shift done${s.workedMinutes ? ` (${formatDuration(s.workedMinutes)} worked)` : ''}`;
      if (s.status === 'missed') return 'Missed today\'s shift';
    }
  }
  return works ? `Works today from ${formatClock(lvl.start)}` : 'Day off today';
}

export interface PromotionReq { text: string; met: boolean }

export function promotionRequirements(db: ContentDB, person: Person, career: CareerState, state?: WorldState): PromotionReq[] | null {
  const def = db.careers[career.careerId];
  const lvl = def?.levels.find((l) => l.level === career.level);
  if (!def || !lvl) return null;
  if (career.level >= def.levels.length) return [];
  const reqs: PromotionReq[] = [{ text: `Performance ${lvl.promotion.performance} or higher (now ${Math.round(career.performance)})`, met: career.performance >= lvl.promotion.performance }];
  const days = lvl.promotion.days ?? 0;
  if (days > 0) reqs.push({ text: `Work ${days} days in this career (now ${career.daysWorked})`, met: career.daysWorked >= days });
  for (const [skillId, level] of Object.entries(lvl.promotion.skills)) {
    const have = person.skills[skillId]?.level ?? 0;
    reqs.push({ text: `${db.skills[skillId]?.name ?? humanize(skillId)} level ${level} (now ${have})`, met: have >= level });
  }
  const rel = lvl.promotion.relationship;
  if (rel) {
    const household = state?.households[person.householdId];
    const met = !!state && Object.values(state.relationships).some((r) => {
      if (r.from !== person.id || r.friendship < rel.minFriendship) return false;
      if (!state.people[r.to] || household?.memberIds.includes(r.to)) return false;
      return (state.relationships[pairKey(r.to, person.id)]?.friendship ?? 0) >= rel.minFriendship;
    });
    reqs.push({ text: `${rel.label} (friendship ${rel.minFriendship}+)`, met });
  }
  return reqs;
}

// ---------------------------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------------------------

/** Progress toward the next level (0..1), or 1 at max level. thresholds[i] = cumulative xp for level i+2. */
export function skillProgress(thresholds: number[], level: number, xp: number): number {
  const max = thresholds.length + 1;
  if (level >= max) return 1;
  const from = level <= 1 ? 0 : thresholds[level - 2] ?? 0;
  const to = thresholds[level - 1];
  if (to === undefined || to <= from) return 0;
  return Math.max(0, Math.min(1, (xp - from) / (to - from)));
}

// ---------------------------------------------------------------------------------------------
// Aspiration
// ---------------------------------------------------------------------------------------------

export interface ObjectiveProgress { text: string; current: number; target: number; done: boolean; display: string }

export function objectiveProgress(state: WorldState, db: ContentDB, person: Person, obj: AspirationObjective, progress: Record<string, number>): ObjectiveProgress {
  let current = 0, target = 1, money = false;
  switch (obj.type) {
    case 'skill': current = person.skills[obj.skillId]?.level ?? 0; target = obj.level; break;
    case 'interactionCount': current = progress[obj.id] ?? 0; target = obj.count; break;
    case 'friends': current = Object.values(state.relationships).filter((r) => r.from === person.id && r.friendship >= obj.minFriendship).length; target = obj.count; break;
    case 'funds': current = state.households[person.householdId]?.funds ?? 0; target = obj.amount; money = true; break;
    case 'careerLevel': current = person.career?.level ?? 0; target = obj.level; break;
    case 'ownObjects': {
      const lotId = state.households[person.householdId]?.homeLotId;
      const lot = lotId ? state.lots[lotId] : undefined;
      current = lot ? Object.values(lot.objects).filter((o) => db.objects[o.defId]?.tags.includes(obj.tag) && !(obj.bought && o.boughtAt < START_MINUTE)).length : 0;
      target = obj.count;
      break;
    }
    case 'homeValue': current = progress[obj.id] ?? 0; target = obj.amount; money = true; break;
    case 'bond': current = Object.values(state.bonds).some((b) => (b.a === person.id || b.b === person.id) && b.status === obj.status) ? 1 : 0; target = 1; break;
    default: break;
  }
  const done = current >= target;
  const display = obj.type === 'bond' ? (done ? 'Done' : 'Not yet')
    : money ? `${formatMoney(Math.min(current, target))} / ${formatMoney(target)}`
    : `${Math.min(current, target)} / ${target}`;
  return { text: obj.text, current, target, done, display };
}

// ---------------------------------------------------------------------------------------------
// Saves and time
// ---------------------------------------------------------------------------------------------

/** "Day 3, 7:30 PM" from game minutes. */
export function formatGameTime(minutes: number): string {
  return `Day ${dayIndex(minutes) + 1}, ${formatClock(minutes)}`;
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago", or a date. */
export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.round((now - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const d = Math.round(hr / 24);
  if (d < 14) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(t).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Safe file name part: "The Hart's" -> "the-harts". */
export function slug(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'world';
}

export function exportFileName(householdName: string, minutes: number): string {
  return `hearthside-${slug(householdName)}-day-${dayIndex(minutes) + 1}.json`;
}
