import { describe, expect, it } from 'vitest';
import { content } from '../../../src/content/index';
import { OBJECTS, fittedBounds } from '../../../src/content/objects';
import {
  SCREENS,
  SCREEN_INTERACTIONS,
  SCREEN_MODE_BY_INTERACTION,
  defWantsScreen,
  screenFor,
  screenModeFor,
} from '../../../src/content/screens';

const db = content();

/** Animations that mean a person is looking at a screen (or holding a phone, which we map too). */
const SCREEN_ANIMS = new Set(['computer', 'watchTv', 'phone']);

describe('screen furniture table (task S)', () => {
  it('has a measured rectangle for every object that offers screen use', () => {
    const wants = OBJECTS.filter(defWantsScreen);
    // The four screen objects shipped today; a warning if content grows a new one without a measurement.
    expect(wants.map((o) => o.id).sort()).toEqual(['computer-desktop', 'laptop', 'tv-flatscreen', 'tv-vintage']);
    for (const def of wants) expect(SCREENS[def.id], def.id).toBeDefined();
  });

  it('covers every def offering one of the screen interactions, even if it is tagged oddly', () => {
    const targets = OBJECTS.filter((o) => o.interactions.some((id) => SCREEN_INTERACTIONS.includes(id)));
    for (const def of targets) expect(SCREENS[def.id], `${def.id} offers ${def.interactions.join(',')}`).toBeDefined();
  });

  it('only lists real objects, with the right kind', () => {
    for (const [id, screen] of Object.entries(SCREENS)) {
      const def = db.objects[id] ?? OBJECTS.find((o) => o.id === id);
      expect(def, id).toBeDefined();
      expect(screen.defId).toBe(id);
      const taggedTv = def!.tags.includes('tv') || def!.interactions.includes('watchTv');
      expect(screen.kind, id).toBe(taggedTv ? 'tv' : 'computer');
    }
  });

  it('has sensible geometry inside the fitted model', () => {
    for (const [id, s] of Object.entries(SCREENS)) {
      const def = OBJECTS.find((o) => o.id === id)!;
      const box = fittedBounds(def.model)!;
      expect(s.width).toBeGreaterThan(0.1);
      expect(s.height).toBeGreaterThan(0.05);
      expect(s.offset).toBeGreaterThan(0);
      expect(s.offset).toBeLessThan(0.05);
      const len = Math.hypot(s.facing[0], s.facing[1], s.facing[2]);
      expect(len, `${id} facing is unit`).toBeCloseTo(1, 6);
      // The picture centre sits inside the model's bounds (with a little slack for the glass edge).
      const [x, y, z] = s.centre;
      expect(x, `${id} x`).toBeGreaterThanOrEqual(box.x0 - 0.02);
      expect(x, `${id} x`).toBeLessThanOrEqual(box.x1 + 0.02);
      expect(y, `${id} y`).toBeGreaterThanOrEqual(box.y0 - 0.02);
      expect(y, `${id} y`).toBeLessThanOrEqual(box.y1 + 0.02);
      expect(z, `${id} z`).toBeGreaterThanOrEqual(box.z0 - 0.05);
      expect(z, `${id} z`).toBeLessThanOrEqual(box.z1 + 0.05);
    }
  });

  it('returns no screen for furniture without one', () => {
    expect(screenFor('bed-single')).toBeUndefined();
    expect(screenFor('study-notes')).toBeUndefined();
  });
});

describe('interaction -> screen mode mapping (task S)', () => {
  it('maps every computer, TV and phone interaction in the content database', () => {
    const screenInteractions = Object.values(db.interactions).filter((i) => SCREEN_ANIMS.has(i.anims.perform));
    const missing = screenInteractions.filter((i) => !(i.id in SCREEN_MODE_BY_INTERACTION)).map((i) => i.id);
    expect(missing).toEqual([]);
    expect(screenInteractions.length).toBeGreaterThanOrEqual(18);
  });

  it('only lists ids that exist', () => {
    for (const id of Object.keys(SCREEN_MODE_BY_INTERACTION)) expect(db.interactions[id], id).toBeDefined();
  });

  it('uses the pictures the spec asks for', () => {
    for (const id of ['writeArticle', 'writeBook', 'writeJournal', 'writePaper', 'doHomework']) {
      expect(screenModeFor(id), id).toBe('document');
    }
    for (const id of ['practiceProgramming', 'programGig']) expect(screenModeFor(id), id).toBe('code');
    expect(screenModeFor('playComputerGames')).toBe('game');
    expect(screenModeFor('watchTv')).toBe('tv');
    for (const id of ['jobSearch', 'adoptOnline', 'researchOnline', 'phoneBills']) {
      expect(screenModeFor(id), id).toBe('web');
    }
  });

  it('falls back to the generic desktop for unknown use', () => {
    expect(screenModeFor('someFutureInteraction')).toBe('desktop');
    expect(screenModeFor('')).toBe('desktop');
  });

  it('is a pure lookup (same answer every time)', () => {
    expect(screenModeFor('practiceProgramming')).toBe(screenModeFor('practiceProgramming'));
  });
});
