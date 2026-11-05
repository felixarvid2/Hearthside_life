// Milestone 12, task O: the weather- and season-bound outdoor activities. Every new activity is listed in the menu
// when its conditions fit and greyed with a readable reason when they do not (autonomy applies the same gate); a
// snowman is built, persists through a save and melts after three snow-free winter days; the two new socials only
// happen in fitting weather and feed the hunger need.

import { describe, expect, it } from 'vitest';
import { content } from '../../../src/content/index';
import type { ContentDB } from '../../../src/content/types';
import { MINUTES_PER_DAY } from '../../../src/core/clock';
import type { Person, WorldState } from '../../../src/core/types';
import { Rng } from '../../../src/core/rng';
import type { SimCtx } from '../../../src/sim/context';
import { DECIDE_KEY } from '../../../src/sim/autonomy';
import { ensureRel } from '../../../src/sim/relationships';
import { resolveSocial } from '../../../src/sim/social';
import { SNOWMAN_WARM_DAYS, updateSnowmen } from '../../../src/sim/snowman';
import { nearestOutdoorTile, outdoorGateReason, snowLies } from '../../../src/sim/weather';
import { validateWorldStructure } from '../../../src/persistence/schema';
import { createPerson } from '../../../src/sim/people';
import type { InteractionOption } from '../../../src/sim/types';
import { buildWorld, draft, fixtureContent, harness, lotLocation, place, pureCtx, runUntil } from './fixtures';

const REAL = content();

/** The fixture content with the real Milestone 12 outdoor interactions, socials, moodlets and objects. */
const OUTDOOR_INTERACTIONS = [
  'buildSnowman', 'makeSnowAngel', 'flyKite', 'rakeLeaves', 'jumpInPuddles', 'stargaze', 'watchRain', 'sunbathe',
] as const;
const OUTDOOR_SOCIALS = ['snowballFight', 'sharePicnic'] as const;
const OUTDOOR_MOODLETS = [
  'snowmanBuilt', 'snowAngel', 'kiteHigh', 'crispAutumnAir', 'puddleSplash', 'starryEyed', 'sunKissed', 'cosyRain',
  'picnicJoy', 'playtime', 'shocked', 'awkward',
];
const OUTDOOR_OBJECTS = ['picnic-blanket', 'sun-lounger', 'kite', 'snowman'];

function outdoorContent(): ContentDB {
  const c = fixtureContent();
  for (const id of [...OUTDOOR_INTERACTIONS, 'havePicnic']) if (REAL.interactions[id]) c.interactions[id] = REAL.interactions[id]!;
  for (const id of OUTDOOR_SOCIALS) c.socials[id] = REAL.socials[id]!;
  for (const id of OUTDOOR_MOODLETS) if (REAL.moodlets[id]) c.moodlets[id] = REAL.moodlets[id]!;
  for (const id of OUTDOOR_OBJECTS) c.objects[id] = REAL.objects[id]!;
  return c;
}

const WINTER = 24, AUTUMN = 17, SUMMER = 10, SPRING = 0;

/** Pins the stored weather day (the simulation keeps a same-day plan: it never rerolls it). */
function pinWeather(w: WorldState, current: 'clear' | 'cloudy' | 'rain' | 'snow', day: number, snowCover = current === 'snow'): void {
  w.weather = {
    current, today: [current, current], tomorrow: ['clear', 'clear'], day, since: day * MINUTES_PER_DAY,
    ...(snowCover ? { snowCover: true } : {}),
  };
}

function setClock(w: WorldState, day: number, hour = 12, minute = 0): void {
  w.clock.minutes = day * MINUTES_PER_DAY + hour * 60 + minute;
}

/** A simple world with the real outdoor content; autonomy off so only the test acts. */
function setup(opts: { seed?: number; child?: boolean } = {}) {
  const w = buildWorld({ seed: opts.seed ?? 42, autonomy: false, visitors: false, neighbour: false });
  const c = outdoorContent();
  let child: string | undefined;
  if (opts.child) {
    const kid = createPerson(w.state, c, draft(w.state, 'Kid', { lifeStage: 'child' }), w.state.activeHouseholdId!, lotLocation(w.lot, 8, 7));
    w.state.people[kid.id]!.cooldowns[DECIDE_KEY] = 1e9;
    child = kid.id;
  }
  const h = harness(w.state, c);
  return { w, h, c, child };
}

type W = ReturnType<typeof setup>['w'];

function selfOption(h: ReturnType<typeof harness>, p: Person, id: string): InteractionOption | undefined {
  return h.sim.options(p.id, { kind: 'self' }).find((o) => o.interactionId === id);
}

function objectOption(h: ReturnType<typeof harness>, p: Person, objectId: string, id: string): InteractionOption | undefined {
  return h.sim.options(p.id, { kind: 'object', objectId, slotId: null }).find((o) => o.interactionId === id);
}

function personOption(h: ReturnType<typeof harness>, p: Person, otherId: string, id: string): InteractionOption | undefined {
  return h.sim.options(p.id, { kind: 'person', personId: otherId }).find((o) => o.interactionId === id);
}

/** Covers the whole lot with a flat roof: every tile stops counting as outdoors. */
function roofEverything(lot: W['lot']): void {
  lot.roofs = { roof_test: { id: 'roof_test', level: 0, x0: 0, z0: 0, x1: lot.width, z1: lot.depth, styleId: 'flat', ridge: 'h', pitch: 0, finish: { designId: 'plain-paint', paletteId: 'plain-paint-p0' } } };
}

/** Covers the west half of the lot with a flat roof: indoors there, with reachable open air to the east. */
function roofWestHalf(lot: W['lot']): void {
  lot.roofs = { roof_test: { id: 'roof_test', level: 0, x0: 0, z0: 0, x1: 8, z1: lot.depth, styleId: 'flat', ridge: 'h', pitch: 0, finish: { designId: 'plain-paint', paletteId: 'plain-paint-p0' } } };
}

describe('the outdoor activity gates', () => {
  it('offers Build a Snowman and Make a Snow Angel in deep winter snow and gives reasons otherwise', () => {
    const { w, h } = setup();
    setClock(w.state, WINTER);
    pinWeather(w.state, 'snow', WINTER);
    const mira = w.state.people[w.mira]!;
    expect(selfOption(h, mira, 'buildSnowman')).toMatchObject({ enabled: true });
    expect(selfOption(h, mira, 'makeSnowAngel')).toMatchObject({ enabled: true });

    // summer: the season is enough to rule it out
    setClock(w.state, SUMMER);
    pinWeather(w.state, 'clear', SUMMER);
    expect(selfOption(h, mira, 'buildSnowman')).toMatchObject({ enabled: false, reason: 'Only available in winter.' });
    // winter without snow lying on the ground
    setClock(w.state, WINTER);
    pinWeather(w.state, 'clear', WINTER, false);
    expect(selfOption(h, mira, 'buildSnowman')).toMatchObject({ enabled: false, reason: 'There is no snow on the ground.' });
    expect(snowLies(w.state, w.state.clock.minutes)).toBe(false);
  });

  it('offers Fly a Kite in spring and autumn breeze, not in rain or winter', () => {
    const { w, h } = setup();
    const kite = place(w.state, w.lot, 'kite', 10, 10);
    const mira = w.state.people[w.mira]!;
    setClock(w.state, SPRING);
    pinWeather(w.state, 'clear', SPRING);
    expect(objectOption(h, mira, kite.id, 'flyKite')).toMatchObject({ enabled: true });

    pinWeather(w.state, 'rain', SPRING);
    expect(objectOption(h, mira, kite.id, 'flyKite')).toMatchObject({ enabled: false, reason: 'Not possible in rain weather.' });
    setClock(w.state, WINTER);
    pinWeather(w.state, 'clear', WINTER);
    expect(objectOption(h, mira, kite.id, 'flyKite')).toMatchObject({ enabled: false, reason: 'Only available in spring or autumn.' });
  });

  it('offers Rake Leaves in autumn, not in autumn rain', () => {
    const { w, h } = setup();
    setClock(w.state, AUTUMN);
    pinWeather(w.state, 'clear', AUTUMN);
    const mira = w.state.people[w.mira]!;
    expect(selfOption(h, mira, 'rakeLeaves')).toMatchObject({ enabled: true });
    pinWeather(w.state, 'rain', AUTUMN);
    expect(selfOption(h, mira, 'rakeLeaves')).toMatchObject({ enabled: false, reason: 'It is raining.' });
  });

  it('only offers Jump in Puddles to children and teenagers, and only after rain', () => {
    const adults = setup();
    setClock(adults.w.state, SPRING, 13);
    pinWeather(adults.w.state, 'clear', SPRING);
    adults.w.state.weather!.today = ['rain', 'clear'];
    const mira = adults.w.state.people[adults.w.mira]!;
    expect(selfOption(adults.h, mira, 'jumpInPuddles')).toBeUndefined();
    expect(adults.h.sim.queue(mira.id, { interactionId: 'jumpInPuddles', target: { kind: 'self' } }).ok).toBe(false);

    const kids = setup({ child: true });
    setClock(kids.w.state, SPRING, 13);
    pinWeather(kids.w.state, 'clear', SPRING);
    kids.w.state.weather!.today = ['rain', 'clear']; // a wet morning, puddles still there at 13:00
    const kid = kids.w.state.people[kids.child!]!;
    expect(selfOption(kids.h, kid, 'jumpInPuddles')).toMatchObject({ enabled: true });
    // by late afternoon the puddles have drained
    setClock(kids.w.state, SPRING, 16);
    pinWeather(kids.w.state, 'clear', SPRING);
    expect(selfOption(kids.h, kid, 'jumpInPuddles')).toMatchObject({ enabled: false, reason: 'It has not rained recently.' });
  });

  it('offers Stargazing only on a clear night', () => {
    const { w, h } = setup();
    const mira = w.state.people[w.mira]!;
    setClock(w.state, SPRING, 22);
    pinWeather(w.state, 'clear', SPRING);
    expect(selfOption(h, mira, 'stargaze')).toMatchObject({ enabled: true });
    setClock(w.state, SPRING, 12);
    expect(selfOption(h, mira, 'stargaze')).toMatchObject({ enabled: false, reason: 'Only at night.' });
    setClock(w.state, SPRING, 22);
    pinWeather(w.state, 'cloudy', SPRING);
    expect(selfOption(h, mira, 'stargaze')).toMatchObject({ enabled: false, reason: 'Not possible in cloudy weather.' });
  });

  it('offers Watch the Rain only in rain and only under a roof', () => {
    const { w, h } = setup();
    const mira = w.state.people[w.mira]!;
    setClock(w.state, SPRING, 14);
    pinWeather(w.state, 'rain', SPRING);
    expect(selfOption(h, mira, 'watchRain')).toMatchObject({ enabled: false, reason: 'Better done under a roof.' });
    roofWestHalf(w.lot);
    w.state.people[w.mira]!.location = lotLocation(w.lot, 3, 3);
    expect(selfOption(h, mira, 'watchRain')).toMatchObject({ enabled: true });
    pinWeather(w.state, 'clear', SPRING);
    expect(selfOption(h, mira, 'watchRain')).toMatchObject({ enabled: false, reason: 'Not possible in clear weather.' });
  });

  it('offers Sunbathing only on a clear summer day, on a lounger', () => {
    const { w, h } = setup();
    const lounger = place(w.state, w.lot, 'sun-lounger', 3, 7);
    const mira = w.state.people[w.mira]!;
    setClock(w.state, SUMMER);
    pinWeather(w.state, 'clear', SUMMER);
    expect(objectOption(h, mira, lounger.id, 'sunbathe')).toMatchObject({ enabled: true });
    pinWeather(w.state, 'rain', SUMMER);
    expect(objectOption(h, mira, lounger.id, 'sunbathe')).toMatchObject({ enabled: false, reason: 'Not possible in rain weather.' });
    setClock(w.state, SPRING);
    pinWeather(w.state, 'clear', SPRING);
    expect(objectOption(h, mira, lounger.id, 'sunbathe')).toMatchObject({ enabled: false, reason: 'Only available in summer.' });
  });

  it('offers a picnic in spring and summer, but not in the rain', () => {
    const { w, h } = setup();
    const blanket = place(w.state, w.lot, 'picnic-blanket', 0, 5);
    const mira = w.state.people[w.mira]!;
    setClock(w.state, SPRING);
    pinWeather(w.state, 'clear', SPRING);
    expect(objectOption(h, mira, blanket.id, 'havePicnic')).toMatchObject({ enabled: true });
    pinWeather(w.state, 'rain', SPRING);
    expect(objectOption(h, mira, blanket.id, 'havePicnic')).toMatchObject({ enabled: false, reason: 'It is raining.' });
    setClock(w.state, AUTUMN);
    pinWeather(w.state, 'clear', AUTUMN);
    expect(objectOption(h, mira, blanket.id, 'havePicnic')).toMatchObject({ enabled: false, reason: 'Only available in spring or summer.' });
  });

  it('greys the outdoor activities when there is nowhere outdoors to do them', () => {
    const { w, h } = setup();
    setClock(w.state, WINTER);
    pinWeather(w.state, 'snow', WINTER);
    roofEverything(w.lot);
    const mira = w.state.people[w.mira]!;
    expect(nearestOutdoorTile(pureCtx(h), mira)).toBeNull();
    expect(selfOption(h, mira, 'makeSnowAngel')).toMatchObject({ enabled: false, reason: 'This has to be done outdoors.' });
    expect(outdoorGateReason(REAL.interactions.makeSnowAngel!.weather, pureCtx(h), mira)).toBe('This has to be done outdoors.');
  });

  it('walks outdoors before an outdoor activity begins, and back to the fire for Watch the Rain', () => {
    const { w, h } = setup();
    setClock(w.state, WINTER);
    pinWeather(w.state, 'snow', WINTER);
    roofWestHalf(w.lot);
    const mira = w.state.people[w.mira]!;
    mira.location = lotLocation(w.lot, 3, 3); // under the roof, i.e. indoors
    const q = h.sim.queue(mira.id, { interactionId: 'makeSnowAngel', target: { kind: 'self' } });
    expect(q.ok, q.ok ? '' : q.reason).toBe(true);
    if (!q.ok) return;
    expect(runUntil(h, () => h.log.some((e) => e.type === 'action.finished' && e.actionId === q.actionId), 400)).toBeGreaterThan(0);
    const fin = h.log.find((e) => e.type === 'action.finished' && e.actionId === q.actionId)!;
    expect(fin).toMatchObject({ result: 'done' });
    expect(mira.moodlets.some((m) => m.id === 'snowAngel')).toBe(true);
    expect(mira.location.kind === 'lot' && mira.location.x >= 8).toBe(true);
  });
});

describe('the snowman lifecycle', () => {
  it('is built outdoors, persists in the save and melts after three snow-free winter days', () => {
    const { w, h } = setup();
    setClock(w.state, WINTER);
    pinWeather(w.state, 'snow', WINTER);
    const mira = w.state.people[w.mira]!;
    const q = h.sim.queue(mira.id, { interactionId: 'buildSnowman', target: { kind: 'self' } });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    runUntil(h, () => h.log.some((e) => e.type === 'action.finished' && e.actionId === q.actionId), 1200);
    const fin = h.log.find((e) => e.type === 'action.finished' && e.actionId === q.actionId)!;
    expect(fin).toMatchObject({ result: 'done' });

    const snowmen = Object.values(w.lot.objects).filter((o) => o.defId === 'snowman');
    expect(snowmen).toHaveLength(1);
    const snowman = snowmen[0]!;
    expect(snowman.snowman).toEqual({ madeAt: w.state.clock.minutes, warmDays: 0 });
    expect(mira.moodlets.some((m) => m.id === 'snowmanBuilt')).toBe(true);

    // a save keeps it: the additive field survives the structural save validation
    const copy = JSON.parse(JSON.stringify(w.state)) as WorldState;
    expect(validateWorldStructure(copy).errors).toEqual([]);
    const kept = Object.values(copy.lots[w.lot.id]!.objects).find((o) => o.defId === 'snowman')!;
    expect(kept.snowman).toEqual(snowman.snowman);

    // Three snow-free winter days melt it, one day at a time.
    for (let n = 1; n <= SNOWMAN_WARM_DAYS - 1; n++) {
      setClock(w.state, WINTER + n);
      pinWeather(w.state, 'clear', WINTER + n, false);
      updateSnowmen(pureCtx(h));
      expect(w.lot.objects[snowman.id]?.snowman?.warmDays, `after warm day ${n}`).toBe(n);
    }
    expect(w.lot.objects[snowman.id]).toBeDefined();
    setClock(w.state, WINTER + SNOWMAN_WARM_DAYS);
    pinWeather(w.state, 'clear', WINTER + SNOWMAN_WARM_DAYS, false);
    updateSnowmen(pureCtx(h));
    expect(w.lot.objects[snowman.id]).toBeUndefined();
  });

  it('a fresh snowfall resets the thaw count', () => {
    const { w, h } = setup();
    const first = WINTER - 3; // first day of winter, so there is room for the thaw and another snowfall
    setClock(w.state, first);
    pinWeather(w.state, 'snow', first);
    // build directly (the behaviour is covered above) by placing what Build a Snowman leaves
    const made = place(w.state, w.lot, 'snowman', 7, 7);
    made.snowman = { madeAt: w.state.clock.minutes, warmDays: 0 };
    const warm = (day: number, snow = false) => {
      setClock(w.state, day);
      pinWeather(w.state, snow ? 'snow' : 'clear', day, snow);
      updateSnowmen(pureCtx(h));
    };
    warm(first + 1); warm(first + 2);
    expect(w.lot.objects[made.id]?.snowman?.warmDays).toBe(2);
    warm(first + 3, true); // snow again: the thaw stops
    expect(w.lot.objects[made.id]?.snowman).toMatchObject({ warmDays: 0 });
    warm(first + 4);
    expect(w.lot.objects[made.id]?.snowman?.warmDays).toBe(1);
    expect(w.lot.objects[made.id]).toBeDefined();
  });

  it('melts at once when winter ends or the weather setting is turned off', () => {
    const { w, h } = setup();
    setClock(w.state, WINTER);
    pinWeather(w.state, 'snow', WINTER);
    const one = place(w.state, w.lot, 'snowman', 7, 7);
    one.snowman = { madeAt: w.state.clock.minutes, warmDays: 0 };
    // first day of spring
    setClock(w.state, 0);
    pinWeather(w.state, 'clear', 0, false);
    updateSnowmen(pureCtx(h));
    expect(w.lot.objects[one.id]).toBeUndefined();

    setClock(w.state, WINTER);
    pinWeather(w.state, 'snow', WINTER);
    const two = place(w.state, w.lot, 'snowman', 8, 7);
    two.snowman = { madeAt: w.state.clock.minutes, warmDays: 0 };
    w.state.settings.weather = false;
    updateSnowmen(pureCtx(h));
    expect(w.lot.objects[two.id]).toBeUndefined();
  });
});

describe('the outdoor socials', () => {
  /** A context whose RNG always draws `value`, so the social's success/failure is deterministic. */
  function fixedRngContext(h: ReturnType<typeof harness>, value: number): SimCtx {
    const ctx = pureCtx(h);
    ctx.rng = new (class extends Rng { override next(): number { return value; } })(h.holder.state.rng);
    return ctx;
  }

  function pair(seed = 42) {
    const s = setup({ seed });
    const { w } = s;
    for (const [a, b] of [[w.mira, w.theo], [w.theo, w.mira]] as const) {
      const rel = ensureRel(w.state, a, b);
      rel.familiarity = 30;
      rel.friendship = 10;
    }
    w.state.people[w.mira]!.needs.social = 40;
    w.state.people[w.theo]!.needs.social = 40;
    w.state.people[w.mira]!.needs.fun = 40;
    w.state.people[w.theo]!.needs.fun = 40;
    return s;
  }

  it('offers a snowball fight in winter snow and a shared picnic in the spring sun, with reasons when not', () => {
    const { w, h } = pair();
    const mira = w.state.people[w.mira]!, theo = w.state.people[w.theo]!;
    setClock(w.state, WINTER);
    pinWeather(w.state, 'snow', WINTER);
    expect(personOption(h, mira, theo.id, 'snowballFight')).toMatchObject({ enabled: true });
    setClock(w.state, SPRING);
    pinWeather(w.state, 'clear', SPRING);
    expect(personOption(h, mira, theo.id, 'snowballFight')).toMatchObject({ enabled: false, reason: 'Only available in winter.' });
    expect(personOption(h, mira, theo.id, 'sharePicnic')).toMatchObject({ enabled: true });
    pinWeather(w.state, 'rain', SPRING);
    expect(personOption(h, mira, theo.id, 'sharePicnic')).toMatchObject({ enabled: false, reason: 'It is raining.' });
  });

  it('a snowball fight lifts both moods and needs', () => {
    const { w, h } = pair();
    const mira = w.state.people[w.mira]!, theo = w.state.people[w.theo]!;
    const before = { fun: mira.needs.fun, social: mira.needs.social, theoFun: theo.needs.fun };
    const accepted = resolveSocial(fixedRngContext(h, 0), mira, theo, REAL.socials.snowballFight!);
    expect(accepted).toBe(true);
    expect(mira.needs.fun).toBeGreaterThan(before.fun);
    expect(mira.needs.social).toBeGreaterThan(before.social);
    expect(theo.needs.fun).toBeGreaterThan(before.theoFun);
    expect(mira.moodlets.some((m) => m.id === 'playtime')).toBe(true);
    expect(theo.moodlets.some((m) => m.id === 'playtime')).toBe(true);
  });

  it('a shared picnic feeds both people (the hunger outcome) and a failed one still gives a little', () => {
    const { w, h } = pair();
    const mira = w.state.people[w.mira]!, theo = w.state.people[w.theo]!;
    mira.needs.hunger = 40; theo.needs.hunger = 40;
    expect(resolveSocial(fixedRngContext(h, 0), mira, theo, REAL.socials.sharePicnic!)).toBe(true);
    expect(mira.needs.hunger).toBe(68);
    expect(theo.needs.hunger).toBe(68);
    expect(mira.moodlets.some((m) => m.id === 'picnicJoy')).toBe(true);

    const failed = pair(43);
    const a = failed.w.state.people[failed.w.mira]!, b = failed.w.state.people[failed.w.theo]!;
    a.needs.hunger = 40; b.needs.hunger = 40;
    expect(resolveSocial(fixedRngContext(failed.h, 0.999), a, b, REAL.socials.sharePicnic!)).toBe(false);
    expect(a.needs.hunger).toBe(48);
  });
});
