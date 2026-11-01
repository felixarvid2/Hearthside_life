// Seeded, serializable random generator (sfc32). State lives in WorldState.rng so that loading a save
// reproduces the same future outcomes. Rendering must never draw from the world RNG.

import type { RngState } from './types';

export function seedRng(seed: number): RngState {
  // splitmix32 to spread a single seed over four words
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  const st: RngState = [next(), next(), next(), next()];
  const rng = new Rng(st);
  for (let i = 0; i < 12; i++) rng.nextU32();
  return rng.state;
}

/** Wraps a RngState array in place: every draw mutates the array it was given. */
export class Rng {
  constructor(public state: RngState) {}

  nextU32(): number {
    const s = this.state;
    let a = s[0] >>> 0, b = s[1] >>> 0, c = s[2] >>> 0, d = s[3] >>> 0;
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    s[0] = a >>> 0; s[1] = b >>> 0; s[2] = c; s[3] = d;
    return t;
  }

  /** Uniform float in [0, 1). */
  next(): number { return this.nextU32() / 4294967296; }
  range(min: number, max: number): number { return min + (max - min) * this.next(); }
  int(min: number, maxInclusive: number): number { return min + Math.floor(this.next() * (maxInclusive - min + 1)); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on empty list');
    return items[Math.floor(this.next() * items.length)] as T;
  }
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = items[i] as T; items[i] = items[j] as T; items[j] = tmp;
    }
    return items;
  }
}

/** Independent generator for UI-only randomness (creator randomize, previews). Not saved. */
export function uiRng(seed = Date.now()): Rng { return new Rng(seedRng(seed)); }
