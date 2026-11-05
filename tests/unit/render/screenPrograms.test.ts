import { describe, expect, it } from 'vitest';
import {
  ScreenSlotPool,
  TV_CHANNELS,
  codeProgram,
  gameFrame,
  hashSeed,
  pseudoPassage,
  seedRng,
  terminalLines,
  tvChannel,
  tvScene,
  typedCode,
  typedDocument,
  webScroll,
} from '../../../src/render/screenPrograms';

describe('deterministic pseudo text (task S)', () => {
  it('same seed always produces the same passage', () => {
    expect(pseudoPassage('a', 400)).toBe(pseudoPassage('a', 400));
    expect(pseudoPassage('a', 400)).not.toBe(pseudoPassage('b', 400));
  });

  it('hash and rng are deterministic', () => {
    expect(hashSeed('hello')).toBe(hashSeed('hello'));
    expect(hashSeed('hello')).not.toBe(hashSeed('hellp'));
    const a = seedRng(42);
    const b = seedRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('types the same visible text for the same action and progress', () => {
    expect(typedDocument('writeArticle:7', 0.42)).toBe(typedDocument('writeArticle:7', 0.42));
    expect(typedDocument('writeArticle:7', 0.42)).not.toBe(typedDocument('writeBook:7', 0.42));
  });

  it('shows strictly more characters as progress advances', () => {
    let last = -1;
    for (const p of [0, 0.05, 0.2, 0.4, 0.6, 0.8, 0.95, 1]) {
      const n = typedDocument('writeArticle:7', p).length;
      expect(n).toBeGreaterThan(last);
      last = n;
    }
    expect(typedDocument('x', 1).length).toBeGreaterThan(typedDocument('x', 0.8).length);
  });

  it('clamps progress outside 0..1', () => {
    expect(typedDocument('x', -1)).toBe('');
    expect(typedDocument('x', 2)).toBe(typedDocument('x', 1));
  });

  it('the typed text is a prefix of the full passage', () => {
    const full = pseudoPassage('paper', 1600);
    expect(full.startsWith(typedDocument('paper', 0.5))).toBe(true);
  });
});

describe('code editor program (task S)', () => {
  it('is deterministic per action', () => {
    expect(codeProgram('gig:1')).toEqual(codeProgram('gig:1'));
    expect(codeProgram('gig:1')).not.toEqual(codeProgram('gig:2'));
  });

  it('reveals more lines and characters with progress', () => {
    const early = typedCode('gig:1', 0.2);
    const late = typedCode('gig:1', 0.8);
    expect(early.totalChars).toBe(late.totalChars);
    expect(late.typedChars).toBeGreaterThan(early.typedChars);
    expect(late.lines.length).toBeGreaterThan(early.lines.length);
  });

  it('never types beyond the program and never negative', () => {
    const all = typedCode('gig:1', 1);
    expect(all.typedChars).toBe(all.totalChars);
    expect(all.lines.length).toBe(codeProgram('gig:1').length);
    expect(typedCode('gig:1', 0).typedChars).toBe(0);
    expect(typedCode('gig:1', -5).typedChars).toBe(0);
  });

  it('the terminal fills in with progress', () => {
    expect(terminalLines(0)).toEqual(['$ npm run build']);
    expect(terminalLines(0.2).join(' ')).toContain('compiling');
    expect(terminalLines(0.5).join(' ')).toContain('build ok');
    expect(terminalLines(1).join(' ')).toContain('all green');
    expect(terminalLines(1).join(' ')).toContain('8/8');
    expect(terminalLines(0.5, true).length).toBeLessThanOrEqual(2);
  });
});

describe('little game frame (task S)', () => {
  it('is deterministic and the score climbs with progress', () => {
    const a = gameFrame('games:1', 0.3, 100);
    const b = gameFrame('games:1', 0.3, 100);
    expect(a).toEqual(b);
    expect(gameFrame('games:1', 0.9, 100).score).toBeGreaterThan(a.score);
    expect(gameFrame('games:1', 0.9, 100).level).toBeGreaterThan(1);
  });

  it('animates with the game clock', () => {
    const pos = (m: number) => gameFrame('games:1', 0.3, m).sprites.find((s) => s.kind === 'player')!;
    expect(pos(100).x).not.toBe(pos(100.02).x);
  });

  it('keeps every sprite on the 256x160 picture', () => {
    for (const s of gameFrame('games:1', 0.6, 55).sprites) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(256);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(160);
    }
  });
});

describe('television programmes (task S)', () => {
  it('chooses a stable channel from the action', () => {
    expect(tvChannel('watchTv:a')).toBe(tvChannel('watchTv:a'));
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      expect(TV_CHANNELS).toContain(tvChannel(seed));
    }
  });

  it('changes the scene every two game minutes', () => {
    expect(tvScene('watchTv:a', 10)).toBe(tvScene('watchTv:a', 11));
    expect(tvScene('watchTv:a', 10)).not.toBe(tvScene('watchTv:a', 12));
  });
});

describe('web page scrolling (task S)', () => {
  it('stays in 0..1 and animates with the clock', () => {
    expect(webScroll(0.2, 10)).toBeGreaterThanOrEqual(0);
    expect(webScroll(0.2, 10)).toBeLessThan(1);
    expect(webScroll(0.2, 10)).not.toBe(webScroll(0.2, 10.5));
  });

  it('does not scroll with reduced motion', () => {
    expect(webScroll(0.2, 10, true)).toBe(webScroll(0.2, 10.5, true));
    expect(webScroll(0.2, 10, true)).toBeCloseTo(0.2, 6);
  });
});

describe('screen canvas pool (task S)', () => {
  it('never holds more than four live pictures', () => {
    const pool = new ScreenSlotPool(4);
    const map = pool.assign(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(map.size).toBe(4);
    expect(pool.size).toBe(4);
    expect([...map.keys()]).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps existing owners in their slots (no flicker)', () => {
    const pool = new ScreenSlotPool(2);
    expect(pool.assign(['a', 'b']).get('a')).toBe(0);
    const m = pool.assign(['b', 'a']);
    expect(m.get('a')).toBe(0);
    expect(m.get('b')).toBe(1);
  });

  it('frees slots for screens that go away and reuses them', () => {
    const pool = new ScreenSlotPool(2);
    pool.assign(['a', 'b']);
    const m = pool.assign(['b', 'c']);
    expect(m.get('b')).toBe(1);
    expect(m.get('c')).toBe(0);
    expect(pool.slotOf('a')).toBe(null);
    expect(pool.size).toBe(2);
  });

  it('clears', () => {
    const pool = new ScreenSlotPool(3);
    pool.assign(['a', 'b']);
    pool.clear();
    expect(pool.size).toBe(0);
    expect(pool.owners).toEqual([null, null, null]);
  });
});
