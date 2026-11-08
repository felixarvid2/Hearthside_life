import { describe, expect, it } from 'vitest';
import { GIFTS } from '../../../src/content/gifts';
import { PREFERENCES } from '../../../src/content/preferences';
import { TRAITS } from '../../../src/content/traits';
import { relKey } from '../../../src/core/ids';
import { cloneState } from '../../../src/core/state';
import { createGiftItem, giftChoices, giftOutcome, giftReaction, giftsOf } from '../../../src/sim/gifts';
import { resolveSocial } from '../../../src/sim/social';
import { runTicks } from './fixtures';
import { pureCtx, setBoth, socialWorld } from './socialFixtures';

const gift = (id: string) => GIFTS.find((g) => g.id === id)!;
const who = (o: Partial<{ likes: string[]; dislikes: string[]; traits: string[] }> = {}) => ({ firstName: 'X', likes: [], dislikes: [], traits: [], ...o });

describe('gift catalog', () => {
  it('only references real preferences and traits and has sane prices', () => {
    const prefs = new Set(PREFERENCES.map((p) => p.id)), traits = new Set(TRAITS.map((t) => t.id));
    expect(GIFTS.length).toBeGreaterThanOrEqual(8);
    for (const g of GIFTS) {
      expect(Number.isInteger(g.price) && g.price > 0).toBe(true);
      for (const a of g.appeals) expect(prefs.has(a), `${g.id} ${a}`).toBe(true);
      for (const t of Object.keys(g.traitFit)) expect(traits.has(t), `${g.id} ${t}`).toBe(true);
    }
  });
});

describe('gift reactions', () => {
  it('follow likes, dislikes and traits, not the price', () => {
    expect(giftReaction(who({ likes: ['topic:books', 'activity:reading'], traits: ['bookish'] }), gift('book')).verdict).toBe('loved');
    expect(giftReaction(who({ likes: ['topic:books'] }), gift('book')).verdict).toBe('liked');
    expect(giftReaction(who(), gift('book')).verdict).toBe('fine');
    expect(giftReaction(who({ dislikes: ['topic:books', 'activity:reading'] }), gift('book')).verdict).toBe('disliked');
    expect(giftReaction(who({ traits: ['lazy'] }), gift('sportsKit')).verdict).toBe('disliked');
    // the cheap card beats the expensive game for a creative person who is not into games
    const creative = who({ traits: ['creative', 'artistic'] });
    expect(giftReaction(creative, gift('card')).score).toBeGreaterThan(giftReaction(creative, gift('videogame')).score);
  });

  it('scale the relationship change', () => {
    const base = gift('book') && { actor: {}, target: {}, social: 8, memory: { kind: 'gift' as const, importance: 1 as const, text: 't' }, targetMoodlet: 'giftReceived' };
    const f = (v: 'loved' | 'liked' | 'fine' | 'disliked') => giftOutcome(base, v, false).target.friendship!;
    expect(f('loved')).toBeGreaterThan(f('liked'));
    expect(f('liked')).toBeGreaterThan(f('fine'));
    expect(f('fine')).toBeGreaterThan(f('disliked'));
    expect(f('disliked')).toBeLessThan(0);
    expect(giftOutcome(base, 'disliked', false).targetMoodlet).toBeUndefined();
    expect(giftOutcome(base, 'loved', true).target.romance).toBeGreaterThan(0);
  });
});

describe('giving a gift', () => {
  function world() {
    const sw = socialWorld({ seed: 3 });
    const ada = sw.w.neighbour!;
    setBoth(sw.w.state, sw.w.mira, ada, { familiarity: 50, friendship: 60, trust: 30 });
    sw.h.content.socials.giveGift!.acceptance = 1;
    return { ...sw, ada };
  }
  /** Gives until accepted (the dice decide); returns the number of tries. */
  function give(sw: ReturnType<typeof world>, id: string): boolean {
    const { w, h, ada } = sw;
    for (let i = 0; i < 30; i++) {
      runTicks(h, 1);
      if (resolveSocial(pureCtx(h), w.state.people[w.mira]!, w.state.people[ada]!, h.content.socials.giveGift!, { giftId: id })) return true;
    }
    return false;
  }

  it('charges the gift price once and leaves an item owned by the recipient on their lot', () => {
    const sw = world();
    const { w, ada } = sw;
    const hh = w.state.households[w.state.activeHouseholdId]!;
    w.state.people[ada]!.likes = ['topic:books'];
    const funds = hh.funds;
    expect(give(sw, 'book')).toBe(true);
    expect(hh.funds).toBe(funds - 1800);
    expect(hh.ledger.filter((l) => l.kind === 'gift')).toHaveLength(1);
    const items = giftsOf(w.state, ada);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'gift', recipeId: 'book', ownerPersonId: ada, giftFromId: w.mira, ownerHouseholdId: w.state.people[ada]!.householdId });
    expect(w.state.lots[items[0]!.lotId]).toBeTruthy();
    expect(w.state.relationships[relKey(ada, w.mira)]!.friendship).toBeGreaterThan(60);
    expect(w.state.feed.some((f) => /paperback novel/.test(f.text))).toBe(true);
  });

  it('is better received when it fits, and a refusal costs nothing', () => {
    const a = world(); a.w.state.people[a.ada]!.likes = ['topic:books', 'activity:reading']; a.w.state.people[a.ada]!.traits = ['bookish'];
    const b = world(); b.w.state.people[b.ada]!.dislikes = ['topic:books', 'activity:reading'];
    give(a, 'book'); give(b, 'book');
    expect(a.w.state.relationships[relKey(a.ada, a.w.mira)]!.friendship).toBeGreaterThan(b.w.state.relationships[relKey(b.ada, b.w.mira)]!.friendship);
    const c = world();
    c.h.content.socials.giveGift!.acceptance = 0;
    const hh = c.w.state.households[c.w.state.activeHouseholdId]!;
    const funds = hh.funds;
    for (let i = 0; i < 6; i++) { runTicks(c.h, 1); resolveSocial(pureCtx(c.h), c.w.state.people[c.w.mira]!, c.w.state.people[c.ada]!, c.h.content.socials.giveGift!, { giftId: 'book' }); }
    expect(hh.funds).toBeLessThanOrEqual(funds); // only accepted gifts are paid for
    expect(hh.ledger.filter((l) => l.kind === 'gift').length).toBe(Object.keys(c.w.state.items).length);
  });

  it('puts the parcel on a free table of a built home, and keeps the lot tidy', () => {
    const sw = world();
    const { w, h } = sw;
    const mira = w.state.people[w.mira]!, theo = w.state.people[w.theo]!;
    const g = createGiftItem(pureCtx(h), mira, theo, gift('flowers'))!;
    expect(g.position.onObjectId).toBe(w.objects.table!.id);
    for (let i = 0; i < 12; i++) createGiftItem(pureCtx(h), mira, theo, gift('card'));
    expect(Object.values(w.state.items).filter((i) => i.kind === 'gift').length).toBeLessThanOrEqual(8);
  });

  it('parcels are put away after two weeks and survive a save', () => {
    const sw = world();
    const { w, h, ada } = sw;
    give(sw, 'flowers');
    const copy = cloneState(w.state);
    expect(Object.values(copy.items).filter((i) => i.kind === 'gift')).toHaveLength(1);
    const it = giftsOf(w.state, ada)[0]!;
    w.state.clock.minutes = it.spoilsAt + 1;
    runTicks(h, 2);
    expect(giftsOf(w.state, ada)).toHaveLength(0);
  });

  it('gift choices show prices, age limits, affordability and hints only for people you know', () => {
    const sw = world();
    const { w, h, ada } = sw;
    const mira = w.state.people[w.mira]!, adaP = w.state.people[ada]!;
    adaP.likes = ['activity:cooking'];
    let list = giftChoices(pureCtx(h), mira, adaP);
    expect(list.find((c) => c.id === 'spices')!.hint).toBe('liked');
    setBoth(w.state, w.mira, ada, { familiarity: 10 });
    list = giftChoices(pureCtx(h), mira, adaP);
    expect(list.every((c) => c.hint === 'unknown')).toBe(true);
    adaP.lifeStage = 'toddler';
    list = giftChoices(pureCtx(h), mira, adaP);
    expect(list.find((c) => c.id === 'videogame')!.enabled).toBe(false);
    expect(list.find((c) => c.id === 'plush')!.enabled).toBe(true);
    w.state.households[w.state.activeHouseholdId]!.funds = 500;
    list = giftChoices(pureCtx(h), mira, adaP);
    expect(list.find((c) => c.id === 'plush')!.reason).toMatch(/Not enough money/);
    expect(list.find((c) => c.id === 'card')!.enabled).toBe(true);
  });
});
