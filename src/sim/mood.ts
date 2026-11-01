// Mood = need contributions + moodlets -> a value (-100..100), a label and readable reasons.

import type { ContentDB } from '../content/types';
import type { GameMinutes, NeedId, Person } from '../core/types';
import { NEED_IDS } from '../core/types';
import { clamp } from './context';

export interface MoodResult { value: number; label: string; reasons: string[] }

const NEED_WORDS: Readonly<Record<NeedId, [low: string, veryLow: string, high: string]>> = {
  hunger: ['Hungry', 'Starving', 'Well fed'],
  energy: ['Tired', 'Exhausted', 'Well rested'],
  hygiene: ['Grubby', 'Filthy', 'Fresh'],
  bladder: ['Needs the toilet', 'Bursting', 'Comfortable'],
  fun: ['Bored', 'Miserably bored', 'Entertained'],
  social: ['Lonely', 'Very lonely', 'Socially content'],
};

/** Mood contribution of one need value. */
export function needMood(v: number): number {
  if (v >= 80) return 3;
  if (v >= 60) return 1;
  if (v >= 40) return 0;
  if (v >= 20) return -((40 - v) / 20) * 8;
  return -8 - ((20 - v) / 20) * 12;
}

export function moodLabel(value: number): string {
  if (value >= 35) return 'Joyful';
  if (value >= 15) return 'Happy';
  if (value >= 0) return 'Content';
  if (value > -15) return 'Uneasy';
  if (value > -35) return 'Unhappy';
  return 'Miserable';
}

/** Current mood of a person. Pure: never changes state. */
export function computeMood(content: ContentDB, p: Person): MoodResult {
  const parts: Array<{ text: string; v: number }> = [];
  for (const n of NEED_IDS) {
    const v = p.needs[n];
    const m = needMood(v);
    if (m === 0) continue;
    const words = NEED_WORDS[n];
    parts.push({ text: m > 0 ? words[2] : v < 20 ? words[1] : words[0], v: m });
  }
  for (const ml of p.moodlets) {
    parts.push({ text: content.moodlets[ml.id]?.name ?? ml.id, v: ml.value });
  }
  const value = Math.round(clamp(parts.reduce((s, x) => s + x.v, 0), -100, 100));
  const reasons = parts
    .filter((x) => Math.round(x.v) !== 0)
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    .slice(0, 6)
    .map((x) => `${x.text} (${x.v > 0 ? '+' : ''}${Math.round(x.v)})`);
  return { value, label: moodLabel(value), reasons };
}

const MOODLET_LIMIT = 12;

/** Adds or refreshes a moodlet by MoodletDef id. Unknown ids are ignored. */
export function addMoodlet(content: ContentDB, p: Person, id: string, now: GameMinutes, source?: string): void {
  const def = content.moodlets[id];
  if (!def) return;
  const existing = p.moodlets.find((m) => m.id === id);
  if (existing) {
    existing.until = now + def.minutes;
    existing.value = def.value;
    return;
  }
  p.moodlets.push({ id, value: def.value, until: now + def.minutes, ...(source ? { source } : {}) });
  if (p.moodlets.length > MOODLET_LIMIT) p.moodlets.splice(0, p.moodlets.length - MOODLET_LIMIT);
}

/** Drops expired moodlets. */
export function expireMoodlets(p: Person, now: GameMinutes): void {
  if (p.moodlets.length === 0) return;
  p.moodlets = p.moodlets.filter((m) => m.until === null || m.until > now);
}
