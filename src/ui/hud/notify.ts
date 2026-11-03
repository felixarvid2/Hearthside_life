// Pure rules that turn world events and feed entries into toasts with sounds (tests/unit/ui/notify.test.ts).
// Feed entries are the main source (the persisted, player-facing story); raw events add toasts only for what
// the feed may not cover, and are dropped when a feed entry about the same thing arrives in the same batch.

import type { SoundId } from '../../game/api';
import type { ContentDB } from '../../content/types';
import type { GameEvent } from '../../core/events';
import { formatMoney } from '../../core/money';
import type { FeedEntry, NeedId, WorldState } from '../../core/types';
import { humanize } from './format';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastCandidate {
  text: string;
  kind: ToastKind;
  sound: SoundId | null;
  source: 'feed' | 'event';
  category: string;
  personId?: string;
  /** Words that, when found in a feed entry of the same batch, make this event toast redundant. */
  keys?: string[];
  /** Higher shows first and wins the sound. */
  priority: number;
}

export interface NotifyContext {
  state: WorldState | null;
  content: ContentDB;
  /** Active household member ids. */
  household: ReadonlySet<string>;
  /** True in buy/build: purchases and paint are reported by those panels instead. */
  editing: boolean;
}

const FEED_STYLE: Record<FeedEntry['kind'], { kind: ToastKind; sound: SoundId | null; priority: number }> = {
  money: { kind: 'success', sound: 'money', priority: 3 },
  career: { kind: 'info', sound: 'notify', priority: 4 },
  social: { kind: 'info', sound: 'social', priority: 2 },
  aspiration: { kind: 'success', sound: 'levelUp', priority: 5 },
  need: { kind: 'warning', sound: 'notify', priority: 3 },
  warning: { kind: 'warning', sound: 'error', priority: 4 },
  build: { kind: 'info', sound: null, priority: 1 },
  family: { kind: 'success', sound: 'levelUp', priority: 5 },
  info: { kind: 'info', sound: null, priority: 1 },
};

export function feedToToast(entry: FeedEntry, ctx: NotifyContext): ToastCandidate | null {
  if (entry.kind === 'build' && ctx.editing) return null;
  const st = FEED_STYLE[entry.kind] ?? FEED_STYLE.info;
  return { text: entry.text, kind: st.kind, sound: st.sound, source: 'feed', category: entry.kind, priority: st.priority, ...(entry.personId ? { personId: entry.personId } : {}) };
}

const NEED_WORDS: Record<NeedId, string> = { hunger: 'very hungry', energy: 'exhausted', hygiene: 'in need of a wash', bladder: 'desperate for the bathroom', fun: 'very bored', social: 'very lonely' };

export function eventToToast(e: GameEvent, ctx: NotifyContext): ToastCandidate | null {
  const first = (id: string) => ctx.state?.people[id]?.firstName ?? 'Someone';
  switch (e.type) {
    case 'notify':
      return { text: e.text, kind: e.kind, sound: e.kind === 'info' ? 'notify' : 'error', source: 'event', category: 'notify', priority: e.kind === 'info' ? 2 : 5 };
    case 'skill.level': {
      if (!ctx.household.has(e.personId)) return null;
      const name = ctx.content.skills[e.skillId]?.name ?? humanize(e.skillId);
      return { text: `${first(e.personId)} reached ${name} level ${e.level}.`, kind: 'success', sound: 'levelUp', source: 'event', category: 'skill', personId: e.personId, keys: [name.toLowerCase(), 'level'], priority: 4 };
    }
    case 'career': {
      if (!ctx.household.has(e.personId)) return null;
      const p = ctx.state?.people[e.personId];
      const title = p?.career ? ctx.content.careers[p.career.careerId]?.levels.find((l) => l.level === p.career!.level)?.title : undefined;
      switch (e.what) {
        case 'promoted': return { text: `${first(e.personId)} was promoted${title ? ` to ${title}` : ''}!`, kind: 'success', sound: 'promotion', source: 'event', category: 'career', personId: e.personId, keys: ['promot'], priority: 6 };
        case 'demoted': return { text: `${first(e.personId)} was demoted${title ? ` to ${title}` : ''}.`, kind: 'warning', sound: 'error', source: 'event', category: 'career', personId: e.personId, keys: ['demot'], priority: 5 };
        case 'missed': return { text: `${first(e.personId)} missed work.`, kind: 'warning', sound: 'error', source: 'event', category: 'career', personId: e.personId, keys: ['miss'], priority: 5 };
        case 'late': return { text: `${first(e.personId)} is late for work.`, kind: 'warning', sound: 'notify', source: 'event', category: 'career', personId: e.personId, keys: ['late'], priority: 4 };
        case 'leftForWork': return { text: `${first(e.personId)} left for work.`, kind: 'info', sound: 'notify', source: 'event', category: 'career', personId: e.personId, keys: ['work'], priority: 2 };
        case 'returned': return { text: `${first(e.personId)} is back from work.`, kind: 'info', sound: 'notify', source: 'event', category: 'career', personId: e.personId, keys: ['work', 'home'], priority: 2 };
        case 'paid': return e.amount ? { text: `${first(e.personId)} earned ${formatMoney(e.amount)}.`, kind: 'success', sound: 'money', source: 'event', category: 'career', personId: e.personId, keys: ['earn', 'pay', 'paid'], priority: 3 } : null;
        default: return null;
      }
    }
    case 'social': {
      const mine = ctx.household.has(e.actorId) || ctx.household.has(e.targetId);
      if (!mine || !e.line) return null;
      const personId = ctx.household.has(e.actorId) ? e.actorId : e.targetId;
      return { text: e.line, kind: e.accepted ? 'info' : 'warning', sound: 'social', source: 'event', category: 'social', personId, priority: 2 };
    }
    case 'aspiration':
      if (!ctx.household.has(e.personId)) return null;
      return { text: e.text, kind: 'success', sound: e.what === 'objective' ? 'notify' : 'levelUp', source: 'event', category: 'aspiration', personId: e.personId, priority: e.what === 'complete' ? 7 : e.what === 'stage' ? 6 : 3 };
    case 'money': {
      if (ctx.editing || e.amount <= 0) return null; // income only; costs are shown where they happen
      if (ctx.state && e.householdId !== ctx.state.activeHouseholdId) return null;
      return { text: `+${formatMoney(e.amount)} ${e.label}`.trim(), kind: 'success', sound: 'money', source: 'event', category: 'money', keys: ['$'], priority: 3 };
    }
    case 'relationship':
      if (e.what !== 'status' || !e.text) return null;
      if (!ctx.household.has(e.fromId) && !ctx.household.has(e.toId)) return null;
      return { text: e.text, kind: 'info', sound: 'social', source: 'event', category: 'social', personId: ctx.household.has(e.fromId) ? e.fromId : e.toId, priority: 4 };
    case 'need.low':
      if (!ctx.household.has(e.personId)) return null;
      return { text: `${first(e.personId)} is ${NEED_WORDS[e.need] ?? 'struggling'}.`, kind: 'warning', sound: 'notify', source: 'event', category: 'need', personId: e.personId, priority: 3 };
    default:
      return null;
  }
}

/**
 * Picks what to show from one batch (everything that arrived in the same frame): drops event toasts that a
 * feed entry already covers, drops duplicates, keeps the most important `max`, and returns the sound to play.
 */
export function coalesce(batch: ToastCandidate[], max = 3): { toasts: ToastCandidate[]; sound: SoundId | null; dropped: number } {
  const feed = batch.filter((c) => c.source === 'feed');
  const kept: ToastCandidate[] = [];
  const seen = new Set<string>();
  for (const c of batch) {
    if (c.source === 'event') {
      const covered = feed.some((f) => {
        const samePerson = !c.personId || !f.personId || f.personId === c.personId;
        if (!samePerson) return false;
        if (f.category === c.category) return true;
        const text = f.text.toLowerCase();
        return !!c.keys?.some((k) => text.includes(k));
      });
      if (covered) continue;
    }
    const key = c.text.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(c);
  }
  const ordered = kept.map((c, i) => ({ c, i })).sort((a, b) => b.c.priority - a.c.priority || a.i - b.i).map((x) => x.c);
  const toasts = ordered.slice(0, max);
  const sound = toasts.find((t) => t.sound)?.sound ?? null;
  return { toasts, sound, dropped: ordered.length - toasts.length };
}
