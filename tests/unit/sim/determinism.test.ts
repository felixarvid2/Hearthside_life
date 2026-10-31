import { describe, expect, it } from 'vitest';
import { cloneState } from '../../../src/core/state';
import { buildWorld, harness, lcg, runTicks } from './fixtures';
import type { Harness } from './fixtures';

function chunked(seed: number, ticks: number, chunkSeed: number): string {
  const w = buildWorld({ seed, career: true });
  let h: Harness = harness(w.state);
  const next = lcg(chunkSeed);
  let left = ticks, i = 0;
  while (left > 0) {
    const n = Math.min(left, 1 + (next() % 173));
    runTicks(h, n);
    left -= n;
    const copy = cloneState(h.holder.state);
    // Alternate between swapping the state under the same Simulation and starting a fresh Simulation.
    if (i++ % 2 === 0) h.holder.state = copy;
    else h = harness(copy, h.content);
  }
  return JSON.stringify(h.holder.state);
}

function straight(seed: number, ticks: number): string {
  const w = buildWorld({ seed, career: true });
  const h = harness(w.state);
  runTicks(h, ticks);
  return JSON.stringify(h.holder.state);
}

describe('determinism', () => {
  it('2000 ticks in one go equal random chunks with cloneState in between', () => {
    const a = straight(7, 2000);
    expect(chunked(7, 2000, 1)).toBe(a);
    expect(chunked(7, 2000, 99)).toBe(a);
  });

  it('a full day with work, cooking, a visitor and socials is batch-independent', () => {
    const ticks = 4 * 60 * 26;
    const a = straight(11, ticks);
    expect(chunked(11, ticks, 5)).toBe(a);
    const s = JSON.parse(a) as { feed: Array<{ text: string }> };
    // sanity: the day actually exercised the systems
    const text = s.feed.map((f) => f.text).join('\n');
    expect(text).toMatch(/left for work/);
    expect(text).toMatch(/came home from work/);
    expect(text).toMatch(/dropped by/);
  });

  it('different seeds diverge', () => {
    expect(straight(1, 2000)).not.toBe(straight(2, 2000));
  });
});
