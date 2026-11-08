import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, TEXT_SCALE_MAX, TEXT_SCALE_MIN, mergeSettings } from '../../../src/game/settings';
import { HINTS, enqueue, hintDef, isHintId, isSeen, markSeen, pickNext, progress, type HintId } from '../../../src/ui/hud/hintState';

describe('hint catalogue', () => {
  it('covers every first-run situation with unique ids, a short text and how-to steps', () => {
    const ids = HINTS.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const want of ['household', 'moveIn', 'needs', 'queue', 'buy', 'build', 'jobs', 'relationships', 'travel', 'floors', 'saving']) expect(ids).toContain(want);
    for (const h of HINTS) {
      expect(h.title.length).toBeGreaterThan(2);
      expect(h.text.length).toBeLessThanOrEqual(220); // a card, not a wall of text
      expect(h.steps.length).toBeGreaterThanOrEqual(3);
      expect(h.steps.length).toBeLessThanOrEqual(5);
    }
    expect(isHintId('buy')).toBe(true);
    expect(isHintId('nope')).toBe(false);
    expect(hintDef('saving').title).toBe('Saving');
  });
});

describe('hint state', () => {
  const base = { enabled: true, seen: [] as string[], pending: [] as HintId[], showing: null as HintId | null };

  it('marks hints seen once and never mutates the old list', () => {
    const a: string[] = [];
    const b = markSeen(a, 'buy');
    expect(a).toEqual([]);
    expect(b).toEqual(['buy']);
    expect(markSeen(b, 'buy')).toBe(b);
    expect(isSeen(b, 'buy')).toBe(true);
    expect(isSeen(b, 'build')).toBe(false);
  });

  it('counts progress against the catalogue and ignores unknown ids', () => {
    expect(progress([])).toEqual({ seen: 0, total: HINTS.length });
    expect(progress(['buy', 'ghost', 'build'])).toEqual({ seen: 2, total: HINTS.length });
  });

  it('queues a request once, and never when hints are off, seen, showing or already waiting', () => {
    expect(enqueue(base, 'buy')).toEqual(['buy']);
    expect(enqueue({ ...base, pending: ['buy'] }, 'buy')).toEqual(['buy']);
    expect(enqueue({ ...base, enabled: false }, 'buy')).toEqual([]);
    expect(enqueue({ ...base, seen: ['buy'] }, 'buy')).toEqual([]);
    expect(enqueue({ ...base, showing: 'buy' }, 'buy')).toEqual([]);
    expect(enqueue({ ...base, pending: ['needs'] }, 'buy')).toEqual(['needs', 'buy']);
  });

  it('picks the first unseen pending hint, one at a time, only while enabled', () => {
    expect(pickNext(base)).toBeNull();
    expect(pickNext({ ...base, pending: ['needs', 'buy'] })).toBe('needs');
    expect(pickNext({ ...base, pending: ['needs', 'buy'], seen: ['needs'] })).toBe('buy');
    expect(pickNext({ ...base, pending: ['needs'], showing: 'buy' })).toBeNull();
    expect(pickNext({ ...base, pending: ['needs'], enabled: false })).toBeNull();
  });
});

describe('hint and accessibility settings', () => {
  it('turns hints on for a new player and keeps nothing seen', () => {
    expect(DEFAULT_SETTINGS.hints).toBe(true);
    expect(DEFAULT_SETTINGS.seenHints).toEqual([]);
    expect(DEFAULT_SETTINGS.highContrast).toBe(false);
  });

  it('stores the hints switch and the seen ids, dropping invalid entries and duplicates', () => {
    const base = { ...DEFAULT_SETTINGS };
    expect(mergeSettings(base, { hints: false }).hints).toBe(false);
    expect(mergeSettings(base, { hints: 'no' as never }).hints).toBe(true);
    expect(mergeSettings(base, { seenHints: ['buy', 'build', 'buy', 7 as never, '' , 'x'.repeat(41)] }).seenHints).toEqual(['buy', 'build']);
    expect(mergeSettings(base, { seenHints: 'buy' as never }).seenHints).toEqual([]);
    expect(mergeSettings({ ...base, seenHints: ['buy'] }, { seenHints: [] }).seenHints).toEqual([]); // Reset hints
    expect(mergeSettings({ ...base, seenHints: ['buy'] }, { hints: false }).seenHints).toEqual(['buy']);
  });

  it('caps the seen list so a damaged value cannot grow the settings', () => {
    const many = Array.from({ length: 200 }, (_, i) => `h${i}`);
    expect(mergeSettings({ ...DEFAULT_SETTINGS }, { seenHints: many }).seenHints.length).toBe(64);
  });

  it('allows a UI scale of 90 to 150 percent and clamps the rest', () => {
    const base = { ...DEFAULT_SETTINGS };
    expect(TEXT_SCALE_MIN).toBe(0.9);
    expect(TEXT_SCALE_MAX).toBe(1.5);
    expect(mergeSettings(base, { textScale: 1.5 }).textScale).toBe(1.5);
    expect(mergeSettings(base, { textScale: 2 }).textScale).toBe(1.5);
    expect(mergeSettings(base, { textScale: 0.5 }).textScale).toBe(0.9);
    expect(mergeSettings(base, { textScale: Number.NaN }).textScale).toBe(1);
  });

  it('stores high contrast as a boolean', () => {
    const base = { ...DEFAULT_SETTINGS };
    expect(mergeSettings(base, { highContrast: true }).highContrast).toBe(true);
    expect(mergeSettings({ ...base, highContrast: true }, { highContrast: 1 as never }).highContrast).toBe(true);
  });
});
