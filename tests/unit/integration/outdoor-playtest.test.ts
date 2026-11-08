// Milestone 12, task O headless playtest: four weeks with weather and seasons on, autonomy driving the household.
// Every new outdoor activity is chosen by autonomy when its conditions fit (each in isolation, so the choice is
// unambiguous), and across the four weeks autonomy never starts one while its gate would refuse it.

import { describe, expect, it } from 'vitest';
import { content } from '../../../src/content/index';
import type { ContentDB } from '../../../src/content/types';
import { MINUTES_PER_DAY, dayIndex } from '../../../src/core/clock';
import type { WorldState } from '../../../src/core/types';
import { DECIDE_KEY } from '../../../src/sim/autonomy';
import { createPerson } from '../../../src/sim/people';
import { ensureRel } from '../../../src/sim/relationships';
import { currentSeason, currentWeather, outdoorGateReason } from '../../../src/sim/weather';
import { buildWorld, draft, fixtureContent, harness, lotLocation, place, pureCtx } from '../sim/fixtures';

const REAL = content();
const OUTDOOR_IDS = [
  'buildSnowman', 'makeSnowAngel', 'flyKite', 'rakeLeaves', 'jumpInPuddles', 'stargaze', 'watchRain', 'sunbathe',
  'havePicnic', 'snowballFight', 'sharePicnic',
] as const;
const NEW_IDS: ReadonlySet<string> = new Set(OUTDOOR_IDS);

function outdoorContent(): ContentDB {
  const c = fixtureContent();
  for (const id of OUTDOOR_IDS) {
    if (REAL.interactions[id]) c.interactions[id] = REAL.interactions[id]!;
    if (REAL.socials[id]) c.socials[id] = REAL.socials[id]!;
  }
  for (const id of ['snowmanBuilt', 'snowAngel', 'kiteHigh', 'crispAutumnAir', 'puddleSplash', 'starryEyed', 'sunKissed', 'cosyRain', 'picnicJoy', 'playtime', 'shocked', 'awkward']) {
    if (REAL.moodlets[id]) c.moodlets[id] = REAL.moodlets[id]!;
  }
  for (const id of ['picnic-blanket', 'sun-lounger', 'kite', 'snowman']) c.objects[id] = REAL.objects[id]!;
  return c;
}

/** Only the interaction (or social) under test stays autonomous; everything else is removed from the menu. */
function onlyContent(id: string): ContentDB {
  const c = outdoorContent();
  for (const other of Object.keys(c.interactions)) if (other !== id) delete c.interactions[other];
  for (const other of Object.keys(c.socials)) if (other !== id) delete c.socials[other];
  return c;
}

const WINTER = 24, AUTUMN = 17, SUMMER = 10, SPRING = 0;

function setClock(w: WorldState, day: number, hour = 12, minute = 0): void {
  w.clock.minutes = day * MINUTES_PER_DAY + hour * 60 + minute;
}

function pinWeather(w: WorldState, kind: 'clear' | 'cloudy' | 'rain' | 'snow', day: number, snowCover = kind === 'snow'): void {
  w.weather = {
    current: kind, today: [kind, kind], tomorrow: ['clear', 'clear'], day, since: day * MINUTES_PER_DAY,
    ...(snowCover ? { snowCover: true } : {}),
  };
}

/** A lot with the new outdoor objects in the yard and a child, autonomy on but nobody deciding before the test says so. */
function world(seed = 42) {
  const w = buildWorld({ seed, autonomy: true, visitors: false, neighbour: false });
  const c = outdoorContent();
  w.state.settings.autonomyLevel = 2;
  const blanket = place(w.state, w.lot, 'picnic-blanket', 0, 5);
  const lounger = place(w.state, w.lot, 'sun-lounger', 3, 7);
  const kite = place(w.state, w.lot, 'kite', 10, 10);
  const kid = createPerson(w.state, c, draft(w.state, 'Kid', { lifeStage: 'child' }), w.state.activeHouseholdId!, lotLocation(w.lot, 8, 7));
  for (const p of Object.values(w.state.people)) p.cooldowns[DECIDE_KEY] = 1e9;
  const h = harness(w.state, c);
  return { w, h, c, kid: kid.id, blanket: blanket.id, lounger: lounger.id, kite: kite.id };
}

type Setup = ReturnType<typeof world>;

/** Lets exactly this person make one autonomous decision and returns what they chose. */
function decide(s: Setup, personId: string): string | undefined {
  const p = s.w.state.people[personId]!;
  for (const other of Object.values(s.w.state.people)) other.cooldowns[DECIDE_KEY] = 1e9;
  p.cooldowns[DECIDE_KEY] = s.w.state.clock.minutes;
  s.h.sim.tick();
  return p.queue[0]?.interactionId;
}

describe('autonomy chooses each new activity when its conditions fit', { timeout: 120_000 }, () => {
  it('Build a Snowman, Make a Snow Angel and a Snowball Fight in the winter snow', () => {
    {
      const s = world();
      const c = onlyContent('buildSnowman');
      s.h = harness(s.w.state, c); s.c = c;
      setClock(s.w.state, WINTER);
      pinWeather(s.w.state, 'snow', WINTER);
      s.w.state.people[s.w.mira]!.needs.fun = 20;
      expect(decide(s, s.w.mira)).toBe('buildSnowman');
    }
    {
      const s = world();
      const c = onlyContent('makeSnowAngel');
      s.h = harness(s.w.state, c); s.c = c;
      setClock(s.w.state, WINTER);
      pinWeather(s.w.state, 'snow', WINTER);
      s.w.state.people[s.w.mira]!.needs.fun = 20;
      expect(decide(s, s.w.mira)).toBe('makeSnowAngel');
    }
    {
      const s = world();
      const c = onlyContent('snowballFight');
      s.h = harness(s.w.state, c); s.c = c;
      setClock(s.w.state, WINTER);
      pinWeather(s.w.state, 'snow', WINTER);
      const { mira, theo } = s.w;
      for (const [a, b] of [[mira, theo], [theo, mira]] as const) ensureRel(s.w.state, a, b).familiarity = 30;
      s.w.state.people[mira]!.needs.social = 20;
      expect(decide(s, mira)).toBe('snowballFight');
    }
  });

  it('Fly a Kite, Have a Picnic and Rake Leaves in their seasons', () => {
    {
      const s = world();
      const c = onlyContent('flyKite');
      s.h = harness(s.w.state, c); s.c = c;
      setClock(s.w.state, SPRING);
      pinWeather(s.w.state, 'clear', SPRING);
      s.w.state.people[s.w.mira]!.needs.fun = 20;
      expect(decide(s, s.w.mira)).toBe('flyKite');
    }
    {
      const s = world();
      const c = onlyContent('havePicnic');
      s.h = harness(s.w.state, c); s.c = c;
      setClock(s.w.state, SUMMER);
      pinWeather(s.w.state, 'clear', SUMMER);
      s.w.state.people[s.w.mira]!.needs.hunger = 20;
      expect(decide(s, s.w.mira)).toBe('havePicnic');
    }
    {
      const s = world();
      const c = onlyContent('rakeLeaves');
      s.h = harness(s.w.state, c); s.c = c;
      setClock(s.w.state, AUTUMN);
      pinWeather(s.w.state, 'clear', AUTUMN);
      s.w.state.people[s.w.mira]!.needs.fun = 20;
      expect(decide(s, s.w.mira)).toBe('rakeLeaves');
    }
  });

  it('Jump in Puddles (a child after rain), Stargaze (a clear night), Sunbathe (a clear summer day)', () => {
    {
      const s = world();
      const c = onlyContent('jumpInPuddles');
      s.h = harness(s.w.state, c); s.c = c;
      setClock(s.w.state, SPRING, 13);
      pinWeather(s.w.state, 'clear', SPRING);
      s.w.state.weather!.today = ['rain', 'clear'];
      s.w.state.people[s.kid]!.needs.fun = 20;
      expect(decide(s, s.kid)).toBe('jumpInPuddles');
    }
    {
      const s = world();
      const c = onlyContent('stargaze');
      s.h = harness(s.w.state, c); s.c = c;
      setClock(s.w.state, SPRING, 22);
      pinWeather(s.w.state, 'clear', SPRING);
      s.w.state.people[s.w.mira]!.needs.fun = 20;
      expect(decide(s, s.w.mira)).toBe('stargaze');
    }
    {
      const s = world();
      const c = onlyContent('sunbathe');
      s.h = harness(s.w.state, c); s.c = c;
      setClock(s.w.state, SUMMER);
      pinWeather(s.w.state, 'clear', SUMMER);
      s.w.state.people[s.w.mira]!.needs.fun = 20;
      expect(decide(s, s.w.mira)).toBe('sunbathe');
    }
  });

  it('Watch the Rain indoors and Share a Picnic with a friend', () => {
    {
      const s = world();
      const c = onlyContent('watchRain');
      s.h = harness(s.w.state, c); s.c = c;
      setClock(s.w.state, SPRING, 14);
      pinWeather(s.w.state, 'rain', SPRING);
      // a roof over the whole lot: the person is under cover, and no outdoor activity could compete
      s.w.lot.roofs = { roof_test: { id: 'roof_test', level: 0, x0: 0, z0: 0, x1: s.w.lot.width, z1: s.w.lot.depth, styleId: 'flat', ridge: 'h', pitch: 0, finish: { designId: 'plain-paint', paletteId: 'plain-paint-p0' } } };
      s.w.state.people[s.w.mira]!.needs.fun = 20;
      expect(decide(s, s.w.mira)).toBe('watchRain');
    }
    {
      const s = world();
      const c = onlyContent('sharePicnic');
      s.h = harness(s.w.state, c); s.c = c;
      setClock(s.w.state, SPRING);
      pinWeather(s.w.state, 'clear', SPRING);
      const { mira, theo } = s.w;
      for (const [a, b] of [[mira, theo], [theo, mira]] as const) ensureRel(s.w.state, a, b).familiarity = 30;
      s.w.state.people[mira]!.needs.social = 20;
      expect(decide(s, mira)).toBe('sharePicnic');
    }
  });
});

describe('four weeks with the weather on', { timeout: 480_000 }, () => {
  it('autonomy never starts a weather-bound activity its gate refuses, and exercises several of them', () => {
    const s = world(11);
    const w = s.w;
    // A roofed west wing gives "indoors" for Watch the Rain; the east yard stays open for the outdoor activities.
    w.lot.roofs = { roof_west: { id: 'roof_west', level: 0, x0: 0, z0: 0, x1: 8, z1: w.lot.depth, styleId: 'flat', ridge: 'h', pitch: 0, finish: { designId: 'plain-paint', paletteId: 'plain-paint-p0' } } };
    w.state.settings.visitors = false;

    const plan: Record<number, Array<'clear' | 'cloudy' | 'rain' | 'snow'>> = {
      0: ['clear', 'rain', 'cloudy', 'clear', 'rain', 'cloudy', 'clear'], // spring
      1: ['clear', 'clear', 'rain', 'clear', 'clear', 'cloudy', 'clear'], // summer
      2: ['clear', 'rain', 'clear', 'cloudy', 'rain', 'clear', 'clear'], // autumn
      3: ['snow', 'clear', 'snow', 'clear', 'cloudy', 'snow', 'clear'], // winter
    };
    const weatherOn = (day: number) => {
      const kind = plan[Math.floor(day / 7) % 4]![day % 7]!;
      pinWeather(w.state, kind, day);
    };
    weatherOn(0);
    for (const p of Object.values(w.state.people)) p.cooldowns[DECIDE_KEY] = w.state.clock.minutes;

    const started: Array<{ id: string; at: number; reason: string | null }> = [];
    s.h.events.on('action.started', (e) => {
      if (!NEW_IDS.has(e.interactionId)) return;
      const p = w.state.people[e.personId];
      if (!p) return;
      const def = s.c.interactions[e.interactionId] ?? s.c.socials[e.interactionId];
      started.push({ id: e.interactionId, at: w.state.clock.minutes, reason: def ? outdoorGateReason(def.weather, pureCtx(s.h), p) : null });
    });

    const seasons = new Set<string>();
    const kinds = new Set<string>();
    const ticks = 28 * MINUTES_PER_DAY * 4;
    for (let i = 0; i < ticks; i++) {
      const minute = w.state.clock.minutes;
      if (minute % MINUTES_PER_DAY === 0) weatherOn(dayIndex(minute));
      s.h.sim.tick();
      if (i % 24 === 0) { seasons.add(currentSeason(w.state)); kinds.add(currentWeather(w.state)); }
      // nudge fun down every two hours (the base decay is lower since Milestone 13), so something outdoors stays worth choosing
      if (i % 480 === 0) for (const p of Object.values(w.state.people)) if (p.needs.fun > 50) p.needs.fun = 45;
    }

    expect([...seasons].sort()).toEqual(['autumn', 'spring', 'summer', 'winter']);
    expect([...kinds].sort()).toEqual(['clear', 'cloudy', 'rain', 'snow']);
    // never unfitting
    const bad = started.filter((x) => x.reason !== null);
    expect(bad, `chosen while gated: ${JSON.stringify(bad.slice(0, 5))}`).toEqual([]);
    // and several of the new activities were actually chosen over the four weeks
    const chosen = new Set(started.map((x) => x.id));
    expect([...chosen].length, `only chose ${[...chosen].join(',')}`).toBeGreaterThanOrEqual(4);
    expect([...chosen].some((id) => s.c.socials[id] !== undefined)).toBe(true);
    // the household is still sane
    for (const p of Object.values(w.state.people)) {
      for (const [need, value] of Object.entries(p.needs)) {
        expect(Number.isFinite(value), `${p.firstName} ${need}`).toBe(true);
        expect(value, `${p.firstName} ${need}`).toBeGreaterThanOrEqual(0);
        expect(value, `${p.firstName} ${need}`).toBeLessThanOrEqual(100);
      }
    }
    expect(w.state.feed.length).toBeLessThan(1500);
  });
});
