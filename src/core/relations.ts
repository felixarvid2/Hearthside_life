// Pure relationship rules shared by the simulation and the interface: the derived label of a relationship
// (acquaintance, friend, close friend, best friend, rival, enemy, crush, partner, engaged, spouse, ex-partner) with
// hysteresis, and who may be romantically interested in whom. No state is read or written here.
//
// Friendship and trust are separate axes: friendship alone makes a friend, but close and best friends also need trust,
// and trust (not friendship) gates deep conversations, secrets and favours (content/socials.ts `minTrust`).
// Hysteresis: a label is entered at a higher value than it is kept at, so a value hovering around a threshold does
// not make the label flicker. `prev` is the label the relationship had before (Relationship.label).

import type { SocialCategory } from '../content/types';
import type { BondStatus, LifeStage, MemoryKind, Person, RelLabel, Relationship } from './types';

export const LABEL_TEXT: Readonly<Record<RelLabel, string>> = {
  stranger: 'Stranger', acquaintance: 'Acquaintance', friend: 'Friend', closeFriend: 'Close friend', bestFriend: 'Best friend',
  rival: 'Rival', enemy: 'Enemy', crush: 'Crush', partner: 'Partner', engaged: 'Engaged', spouse: 'Spouse', exPartner: 'Ex-partner',
};

/** Threshold table: values to enter a label and to keep it. Exported for the tests and the interface hints. */
export const LABEL_RULES = {
  friend: { enter: { friendship: 30 }, stay: { friendship: 20 } },
  closeFriend: { enter: { friendship: 60, trust: 30 }, stay: { friendship: 50, trust: 15 } },
  bestFriend: { enter: { friendship: 80, trust: 60 }, stay: { friendship: 70, trust: 45 } },
  rival: { enter: { friendship: -30 }, stay: { friendship: -20 } },
  enemy: { enter: { friendship: -60 }, stay: { friendship: -50 } },
  crush: { enter: { romance: 35 }, stay: { romance: 25 } },
} as const;

const FRIEND_RANK: Partial<Record<RelLabel, number>> = { acquaintance: 1, friend: 2, closeFriend: 3, bestFriend: 4 };
const COMMITTED: ReadonlySet<BondStatus> = new Set<BondStatus>(['partner', 'engaged', 'spouse']);

type Values = Pick<Relationship, 'familiarity' | 'friendship' | 'trust' | 'romance'>;

/** The label for a relationship. `status` is the shared bond (if any), `interested` whether `from` is attracted to `to`. */
export function relationshipLabel(rel: Values, status: BondStatus | undefined, prev: RelLabel | undefined, interested: boolean): RelLabel {
  if (status === 'partner' || status === 'engaged' || status === 'spouse' || status === 'exPartner') return status;
  const was = (l: RelLabel) => prev === l;
  const r = LABEL_RULES;
  // Hostile feelings first: they win over everything but a commitment.
  const enemyAt = was('enemy') ? r.enemy.stay.friendship : r.enemy.enter.friendship;
  if (rel.friendship <= enemyAt) return 'enemy';
  const rivalAt = was('rival') || was('enemy') ? r.rival.stay.friendship : r.rival.enter.friendship;
  if (rel.friendship <= rivalAt) return 'rival';
  if (interested && rel.familiarity > 0) {
    const need = was('crush') ? r.crush.stay.romance : r.crush.enter.romance;
    if (rel.romance >= need) return 'crush';
  }
  const rank = prev ? FRIEND_RANK[prev] ?? 0 : 0;
  const reach = (level: number, rule: { enter: { friendship: number; trust?: number }; stay: { friendship: number; trust?: number } }): boolean => {
    const t = rank >= level ? rule.stay : rule.enter;
    return rel.friendship >= t.friendship && (t.trust === undefined || rel.trust >= t.trust);
  };
  if (reach(4, r.bestFriend)) return 'bestFriend';
  if (reach(3, r.closeFriend)) return 'closeFriend';
  if (reach(2, r.friend)) return 'friend';
  return rel.familiarity > 0 ? 'acquaintance' : 'stranger';
}

/** True for a bond status that is an exclusive commitment. */
export function isCommitted(status: BondStatus | undefined): boolean { return status !== undefined && COMMITTED.has(status); }

/** Whether a label means the two have a hostile relationship. */
export function isHostile(label: RelLabel | undefined): boolean { return label === 'rival' || label === 'enemy'; }

/** Adult life stages: romance exists only between these. */
export const ADULT_STAGES: readonly LifeStage[] = ['youngAdult', 'adult', 'elder'];

export function isAdult(p: Pick<Person, 'lifeStage'>): boolean { return ADULT_STAGES.includes(p.lifeStage); }

/**
 * Whether `a` could be romantically interested in `b`: both adults, `a` open to romance and `b`'s body frame among
 * `a`'s declared interests. This is one direction only; romance needs both (`mutualRomance`).
 */
export function romanceInterest(a: Pick<Person, 'lifeStage' | 'romance'>, b: Pick<Person, 'lifeStage' | 'appearance'>): boolean {
  if (!isAdult(a) || !isAdult(b)) return false;
  if (!a.romance.open) return false;
  const want = a.romance.interestedIn;
  return want.includes('any') || want.includes(b.appearance.frame);
}

/** Both are adults, open to romance and interested in each other. */
export function mutualRomance(a: Person, b: Person): boolean { return romanceInterest(a, b) && romanceInterest(b, a); }

export interface MemoryEffect {
  /** How long after the memory it matters. */
  minutes: number;
  /** Acceptance modifier per social category (and 'all' for the rest). */
  mod: Partial<Record<SocialCategory | 'all', number>>;
  /** Plain words for the interface, e.g. "less receptive". */
  text: string;
}

/**
 * How memories change behaviour: for a duration after the memory (counted from its last occurrence) the remembering
 * person is more or less receptive to a category of social from the person it concerns. 'all' applies to every
 * category without its own entry. Settled (`resolved`) memories no longer apply.
 */
export const MEMORY_EFFECTS: Readonly<Partial<Record<MemoryKind, MemoryEffect>>> = {
  argument: { minutes: 1440, mod: { all: -0.2, support: -0.05, mean: 0 }, text: 'less receptive after the argument' },
  insult: { minutes: 2880, mod: { all: -0.25, support: -0.1, mean: 0 }, text: 'less receptive after the insult' },
  betrayal: { minutes: 7 * 1440, mod: { all: -0.4, support: -0.2, mean: 0 }, text: 'trust badly shaken' },
  jealousy: { minutes: 2880, mod: { romantic: -0.2, all: -0.08, mean: 0 }, text: 'hurt by what they saw' },
  rejected: { minutes: 720, mod: { romantic: -0.15 }, text: 'a little wary of romance' },
  badDate: { minutes: 1440, mod: { romantic: -0.1 }, text: 'wary after the date' },
  breakup: { minutes: 7 * 1440, mod: { romantic: -0.3, all: -0.05, mean: 0 }, text: 'raw after the break-up' },
  greatChat: { minutes: 720, mod: { friendly: 0.08, deep: 0.1, funny: 0.05 }, text: 'warm after a great chat' },
  comforted: { minutes: 1440, mod: { support: 0.1, deep: 0.08 }, text: 'grateful for the support' },
  secretShared: { minutes: 2880, mod: { deep: 0.1, support: 0.05 }, text: 'close after the secret' },
  kiss: { minutes: 1440, mod: { romantic: 0.1 }, text: 'glowing after the kiss' },
  firstDate: { minutes: 2880, mod: { romantic: 0.12, friendly: 0.05 }, text: 'warm after a first date' },
  greatDate: { minutes: 2880, mod: { romantic: 0.12, friendly: 0.05 }, text: 'warm after a wonderful date' },
  reconciled: { minutes: 2880, mod: { all: 0.05 }, text: 'relieved to have made up' },
  gift: { minutes: 720, mod: { friendly: 0.05 }, text: 'pleased by the gift' },
  joke: { minutes: 240, mod: { funny: 0.05 }, text: 'still smiling at the joke' },
};

