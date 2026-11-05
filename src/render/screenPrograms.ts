// Milestone 11.5 task S: deterministic "programmes" for the picture quads.
//
// Pure functions only (no canvas, no three.js): the drawing code in screensView.ts turns these into
// pixels, and the unit tests use them to check determinism and progress. Everything visible is
// seeded by the action id, so the same action always types the same words, and progress (the
// action's elapsed/duration) decides how much of them is on screen.

// ---------------------------------------------------------------------------------------------
// Seeded pseudo text (lorem-like syllables, never real sentences)
// ---------------------------------------------------------------------------------------------

const SYLLABLES = [
  'ka', 'lo', 'mi', 'ra', 'ten', 'vor', 'sel', 'dun', 'pra', 'ny', 'bel', 'tor',
  'ash', 'wen', 'quil', 'mor', 'lith', 'fen', 'sar', 'vel', 'io', 'tha', 'gro', 'nex',
  'pel', 'rin', 'oms', 'ula', 'dray', 'cove', 'mire', 'hask', 'tavi', 'bren', 'sola', 'wyn',
];

export function hashSeed(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Small deterministic generator: same seed -> same sequence. */
export function seedRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const passageCache = new Map<string, string>();

/** A deterministic lorem-like passage of at least `length` characters (cached). */
export function pseudoPassage(seed: string, length: number): string {
  const key = `${seed}|${length}`;
  const hit = passageCache.get(key);
  if (hit !== undefined) return hit;
  const rnd = seedRng(hashSeed(seed));
  const words: string[] = [];
  let chars = 0;
  let wordsSinceStop = 0;
  while (chars < length + 8) {
    const parts = 1 + Math.floor(rnd() * 3);
    let word = '';
    for (let i = 0; i < parts; i++) word += SYLLABLES[Math.floor(rnd() * SYLLABLES.length)];
    if (rnd() < 0.12) word = word[0]!.toUpperCase() + word.slice(1);
    words.push(word);
    chars += word.length + 1;
    if (++wordsSinceStop >= 7 + Math.floor(rnd() * 8)) {
      wordsSinceStop = 0;
      // end the sentence on the last word and start a new paragraph now and then
      words[words.length - 1] = words[words.length - 1]! + (rnd() < 0.22 ? '.\n\n' : '.');
    }
  }
  const text = words.join(' ');
  // A long session can write hundreds of articles; keep only the recent passages.
  if (passageCache.size >= 64) passageCache.clear();
  passageCache.set(key, text);
  return text;
}

/** The visible part of a word-processor page: more progress -> strictly more characters. */
export function typedDocument(seed: string, progress: number, length = 1600): string {
  const p = Math.max(0, Math.min(1, progress));
  const text = pseudoPassage(seed, length);
  return text.slice(0, Math.floor(p * length));
}

// ---------------------------------------------------------------------------------------------
// Code editor
// ---------------------------------------------------------------------------------------------

export type CodeTokenKind = 'kw' | 'fn' | 'str' | 'num' | 'com' | 'plain';
export interface CodeToken { text: string; kind: CodeTokenKind }
export interface CodeLine { indent: number; tokens: CodeToken[] }

const NAMES = ['total', 'count', 'items', 'value', 'queue', 'score', 'index', 'result', 'data', 'step'];
const FNS = ['build', 'parse', 'compute', 'render', 'collect', 'apply', 'update', 'solve', 'load', 'check'];
const WORDS = ['tidy pass', 'edge case', 'the fast path', 'async work', 'cache hit', 'fallback'];

/** A deterministic little program (line structure is stable for a seed). */
export function codeProgram(seed: string): CodeLine[] {
  const rnd = seedRng(hashSeed(`code:${seed}`));
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)]!;
  const name = () => pick(NAMES);
  const fn = () => pick(FNS);
  const num = () => String(1 + Math.floor(rnd() * 96));
  const lines: CodeLine[] = [
    { indent: 0, tokens: [{ text: '// ', kind: 'com' }, { text: pick(WORDS), kind: 'com' }] },
    { indent: 0, tokens: [{ text: 'function ', kind: 'kw' }, { text: fn(), kind: 'fn' }, { text: '(', kind: 'plain' }, { text: name(), kind: 'plain' }, { text: ') {', kind: 'plain' }] },
    { indent: 1, tokens: [{ text: 'const ', kind: 'kw' }, { text: name(), kind: 'plain' }, { text: ' = ', kind: 'plain' }, { text: num(), kind: 'num' }, { text: ';', kind: 'plain' }] },
  ];
  const shapeCount = 4 + Math.floor(rnd() * 4);
  for (let i = 0; i < shapeCount; i++) {
    const shape = Math.floor(rnd() * 7);
    if (shape === 0) lines.push({ indent: 1, tokens: [{ text: 'let ', kind: 'kw' }, { text: name(), kind: 'plain' }, { text: ' = ', kind: 'plain' }, { text: fn(), kind: 'fn' }, { text: '(', kind: 'plain' }, { text: num(), kind: 'num' }, { text: ');', kind: 'plain' }] });
    else if (shape === 1) lines.push({ indent: 1, tokens: [{ text: 'if ', kind: 'kw' }, { text: '(', kind: 'plain' }, { text: name(), kind: 'plain' }, { text: ' < ', kind: 'plain' }, { text: num(), kind: 'num' }, { text: ') {', kind: 'plain' }] });
    else if (shape === 2) lines.push({ indent: 2, tokens: [{ text: 'return ', kind: 'kw' }, { text: name(), kind: 'plain' }, { text: ' + ', kind: 'plain' }, { text: num(), kind: 'num' }, { text: ';', kind: 'plain' }] });
    else if (shape === 3) lines.push({ indent: 1, tokens: [{ text: 'for ', kind: 'kw' }, { text: '(', kind: 'plain' }, { text: 'let ', kind: 'kw' }, { text: 'i = 0; i < ', kind: 'plain' }, { text: num(), kind: 'num' }, { text: '; i++) {', kind: 'plain' }] });
    else if (shape === 4) lines.push({ indent: 2, tokens: [{ text: 'console', kind: 'plain' }, { text: '.log(', kind: 'fn' }, { text: `"${pick(WORDS)}"`, kind: 'str' }, { text: ');', kind: 'plain' }] });
    else if (shape === 5) lines.push({ indent: 1, tokens: [{ text: '// ', kind: 'com' }, { text: pick(WORDS), kind: 'com' }] });
    else lines.push({ indent: 0, tokens: [{ text: '}', kind: 'plain' }] });
  }
  lines.push({ indent: 0, tokens: [{ text: '}', kind: 'plain' }] });
  return lines;
}

export interface VisibleCode { lines: CodeLine[]; typedChars: number; totalChars: number }

/** Reveals a program character by character: the last line is partially typed. */
export function typedCode(seed: string, progress: number): VisibleCode {
  const program = codeProgram(seed);
  const chars = program.map((l) => l.tokens.reduce((n, t) => n + t.text.length, 0) + l.indent * 2 + 1);
  const totalChars = chars.reduce((a, b) => a + b, 0);
  const shown = Math.floor(Math.max(0, Math.min(1, progress)) * totalChars);
  let left = shown;
  const lines: CodeLine[] = [];
  for (const line of program) {
    if (left <= 0) break;
    const lineChars = chars[lines.length]!;
    if (left >= lineChars) {
      lines.push(line);
      left -= lineChars;
    } else {
      // partially typed line: trim its tokens to the remaining characters
      let budget = left;
      const tokens: CodeToken[] = [];
      for (const t of line.tokens) {
        if (budget <= 0) break;
        const take = t.text.slice(0, budget);
        tokens.push({ text: take, kind: t.kind });
        budget -= take.length;
      }
      lines.push({ indent: line.indent, tokens });
      left = 0;
    }
  }
  return { lines, typedChars: shown, totalChars };
}

/** Terminal pane: a build line and a row of test dots that fill with progress. */
export function terminalLines(progress: number, reducedMotion = false): string[] {
  const p = Math.max(0, Math.min(1, progress));
  const dots = Math.floor(p * 8);
  const dotsText = '●'.repeat(dots) + '○'.repeat(8 - dots);
  const out = ['$ npm run build'];
  if (p >= 0.12) out.push(' compiling…');
  if (p >= 0.45) out.push(' build ok');
  if (p >= 0.45) out.push(` tests ${dotsText} ${dots}/8`);
  if (p >= 0.8) out.push(' all green ✓');
  if (reducedMotion) return out.slice(-2);
  return out.slice(-3);
}

// ---------------------------------------------------------------------------------------------
// Little game
// ---------------------------------------------------------------------------------------------

export interface GameSprite { x: number; y: number; w: number; h: number; kind: 'player' | 'coin' | 'block' }
export interface GameFrame { sprites: GameSprite[]; score: number; level: number }

/** Animated platformer frame; score climbs with progress, the player bobs with the game clock. */
export function gameFrame(seed: string, progress: number, gameMinutes: number): GameFrame {
  const rnd = seedRng(hashSeed(`game:${seed}`));
  const p = Math.max(0, Math.min(1, progress));
  const sprites: GameSprite[] = [];
  // three platforms at 256x160 design coordinates
  sprites.push({ x: 0, y: 128, w: 256, h: 32, kind: 'block' });
  sprites.push({ x: 40, y: 95, w: 70, h: 8, kind: 'block' });
  sprites.push({ x: 150, y: 70, w: 70, h: 8, kind: 'block' });
  sprites.push({ x: 96, y: 44, w: 60, h: 8, kind: 'block' });
  const run = (gameMinutes * (0.6 + rnd() * 0.5)) % 1;
  const px = 20 + run * 200;
  const py = 112 - Math.abs(Math.sin((gameMinutes + rnd() * 20) * 3)) * 64;
  sprites.push({ x: px, y: py, w: 12, h: 16, kind: 'player' });
  const coins = Math.floor(rnd() * 4) + 3;
  for (let i = 0; i < coins; i++) {
    sprites.push({ x: 30 + ((i * 53) % 200), y: 34 + ((i * 37) % 70), w: 7, h: 7, kind: 'coin' });
  }
  const score = Math.floor(p * 1200 + (rnd() * 10) * p);
  return { sprites, score, level: 1 + Math.floor(p * 3) };
}

// ---------------------------------------------------------------------------------------------
// Television
// ---------------------------------------------------------------------------------------------

export const TV_CHANNELS = ['news', 'nature', 'cartoon', 'cooking', 'sport'] as const;
export type TvChannel = (typeof TV_CHANNELS)[number];

/** Channel is chosen deterministically from the action (seed). */
export function tvChannel(seed: string): TvChannel {
  return TV_CHANNELS[hashSeed(`tv:${seed}`) % TV_CHANNELS.length]!;
}

/** Programme picture index: a new scene every 2 game minutes (deterministic from the clock). */
export function tvScene(seed: string, gameMinutes: number): number {
  // The seed offset shifts which scene we start on; it must not shift the 2-minute boundary, or
  // scenes would flip on odd minutes.
  return Math.floor(gameMinutes / 2) + (hashSeed(seed) % 7);
}

const TICKER_WORDS = ['weather', 'market', 'local', 'sport', 'travel', 'garden', 'music', 'science', 'council', 'harvest'];

/** A deterministic headline for the news ticker. */
export function tvTicker(seed: string): string {
  const rnd = seedRng(hashSeed(`ticker:${seed}`));
  const words: string[] = [];
  for (let i = 0; i < 12; i++) words.push(TICKER_WORDS[Math.floor(rnd() * TICKER_WORDS.length)]!);
  return words.join(' · ') + ' ·';
}

// ---------------------------------------------------------------------------------------------
// Web page
// ---------------------------------------------------------------------------------------------

/** Scrolling offset of the web page cards (0..1); still with reduced motion. */
export function webScroll(progress: number, gameMinutes: number, reducedMotion = false): number {
  if (reducedMotion) return Math.max(0, Math.min(1, progress));
  return ((progress * 1.5 + gameMinutes * 0.03) % 1 + 1) % 1;
}

// ---------------------------------------------------------------------------------------------
// Canvas slots
// ---------------------------------------------------------------------------------------------

/**
 * A fixed pool of live canvases. `assign` is called every frame with the in-use screens in priority
 * order (nearest to the camera first). Existing owners keep their slot; ids that are gone free it
 * and new ids take the free slots, so at most `max` pictures are redrawn at once.
 */
export class ScreenSlotPool {
  private readonly slots: Array<string | null>;
  constructor(readonly max = 4) {
    this.slots = new Array<string | null>(max).fill(null);
  }

  assign(ids: readonly string[]): Map<string, number> {
    const wanted = new Set(ids);
    for (let i = 0; i < this.slots.length; i++) {
      const id = this.slots[i];
      if (id != null && !wanted.has(id)) this.slots[i] = null;
    }
    const assigned = new Map<string, number>();
    for (let i = 0; i < this.slots.length; i++) {
      const id = this.slots[i];
      if (id != null) assigned.set(id, i);
    }
    for (const id of ids) {
      if (assigned.has(id)) continue;
      const free = this.slots.indexOf(null);
      if (free < 0) break;
      this.slots[free] = id;
      assigned.set(id, free);
    }
    return assigned;
  }

  slotOf(id: string): number | null {
    const i = this.slots.indexOf(id);
    return i < 0 ? null : i;
  }

  get size(): number { return this.slots.filter((id) => id !== null).length; }

  get owners(): Array<string | null> { return [...this.slots]; }

  clear(): void { this.slots.fill(null); }
}
