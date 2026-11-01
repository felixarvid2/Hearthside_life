// Milestone 1 acceptance scenario, headless (brief section 26): create a person in the creator with a chosen
// hairstyle, outfit, body preset and traits; add a roommate; move in; eat; sleep; attend work; receive pay;
// meet the neighbour; buy a bed and move/rotate it; change a wall finish; save; reload. Every selected setting
// and relevant state change must persist.

import { describe, expect, it } from 'vitest';
import { CreatorSession } from '../../../src/characters/creator';
import { atDayMinute } from '../../../src/core/clock';
import { edgeKey, pairKey } from '../../../src/core/ids';
import { Rng, seedRng } from '../../../src/core/rng';
import type { FinishRef } from '../../../src/core/types';
import { GameCore } from '../../../src/game/GameCore';
import { neighbours } from '../../../src/sim/index';
import { Recorder, db, freshStore, members, objectsByDef } from './harness';

const ok = (r: { ok: boolean; reason?: string }) => expect(r, r.reason).toEqual(expect.objectContaining({ ok: true }));

describe('Milestone 1 acceptance (headless)', () => {
  it('create, move in, live a day, work, meet the neighbour, buy and move a bed, paint, save and reload', async () => {
    // ---- creator ----
    const session = new CreatorSession(db, { start: 'blank', rng: new Rng(seedRng(77)) });
    ok(session.setFirstName('Ada'));
    ok(session.setLastName('Marsh'));
    ok(session.setPronouns('she'));
    ok(session.applyBodyPreset('b-athletic'));
    ok(session.applyFacePreset('face-heart'));
    ok(session.setHairStyle('braids-twin'));
    ok(session.setHairColor('#8a3b22'));
    ok(session.setGarment('everyday', 0, 'top', 'sweater-knit'));
    ok(session.setGarmentColor('everyday', 0, 'top', '#2a6f97'));
    ok(session.setGarment('everyday', 0, 'bottom', 'skirt-aline'));
    ok(session.setGarment('everyday', 0, 'shoes', 'boots-ankle'));
    ok(session.setTraits(['creative', 'foodie', 'early-bird']));
    ok(session.setAspiration('home-chef'));
    ok(session.setCareer('culinary'));
    ok(session.addMember());
    ok(session.setFirstName('Ravi'));
    ok(session.setCareer(null));
    ok(session.setTraits(['outgoing', 'bookish', 'relaxed']));
    ok(session.setTie(0, 1, 'roommate'));
    expect(session.validate().issues).toEqual([]);
    const draft = session.finalDraft();
    const adaDraft = draft.members[0]!;

    // ---- move in ----
    const store = await freshStore();
    const core = new GameCore({ content: db, saves: store });
    ok(core.startNewGame('create', draft, 2026));
    const s = core.state()!;
    const lot = s.lots[s.activeLotId]!;
    const hh = s.households[s.activeHouseholdId]!;
    const [ada, ravi] = members(s);
    expect(ada!.firstName).toBe('Ada');
    expect(ada!.appearance).toEqual(adaDraft.appearance);
    expect(ada!.career?.careerId).toBe('culinary');
    expect(s.bonds[pairKey(ada!.id, ravi!.id)]!.familyAtoB).toBeDefined();
    const rec = new Recorder(core);
    const done = (personId: string, interactionId: string) => rec.finished.filter((f) => f.personId === personId && f.interactionId === interactionId && f.result === 'done');

    // ---- eat: Ada cooks (and eats what she cooked), Ravi grabs a snack ----
    const fridge = objectsByDef(s, 'fridge-standard')[0]!;
    const fridgeMenu = core.options(ada!.id, { kind: 'object', objectId: fridge });
    const cook = fridgeMenu.find((o) => o.interactionId === 'cookMeal')!;
    expect(cook.enabled, cook.reason).toBe(true);
    ok(core.queue(ada!.id, cook));
    // The fridge has one use slot: Ravi snacks once Ada has finished cooking (a busy slot fails at once).
    for (let i = 0; i < 4 * 60 && done(ada!.id, 'cookMeal').length === 0; i++) rec.run(1);
    const snack = core.options(ravi!.id, { kind: 'object', objectId: fridge }).find((o) => o.interactionId === 'grabSnack')!;
    expect(snack.enabled, snack.reason).toBe(true);
    ok(core.queue(ravi!.id, snack));
    rec.runUntil(atDayMinute(0, 9 * 60 + 10));
    expect(done(ada!.id, 'cookMeal')).toHaveLength(1);
    expect(done(ada!.id, 'eatMeal').length).toBeGreaterThanOrEqual(1);
    expect(done(ravi!.id, 'grabSnack')).toHaveLength(1);
    expect(hh.ledger.some((l) => l.kind === 'groceries' && l.amount < 0)).toBe(true);

    // ---- attend work and receive pay once ----
    rec.runUntil(atDayMinute(0, 16 * 60 + 30));
    const career = rec.careers.filter((c) => c.personId === ada!.id);
    expect(career.map((c) => c.what)).toEqual(expect.arrayContaining(['leftForWork', 'paid', 'returned']));
    const wage = hh.ledger.filter((l) => l.kind === 'wage');
    expect(wage).toHaveLength(1);
    expect(wage[0]!.occurrence).toBe(`pay:${ada!.id}:0`);
    expect(wage[0]!.amount).toBeGreaterThan(0);

    // ---- meet the neighbour ----
    rec.runUntil(atDayMinute(0, 21 * 60));
    const harriet = neighbours(s)[0]!;
    expect(rec.socials.some((x) => x.socialId === 'introduce' && x.accepted)).toBe(true);
    const knows = members(s).filter((p) => (s.relationships[`${p.id}>${harriet.id}`]?.familiarity ?? 0) > 0);
    expect(knows.length).toBeGreaterThan(0);

    // ---- sleep in the double bed ----
    const bed = objectsByDef(s, 'bed-double-oak')[0]!;
    // Order sleep in the evening as soon as she is not fully rested (she may have napped on her own).
    let sleep = core.options(ada!.id, { kind: 'object', objectId: bed }).find((o) => o.interactionId === 'sleep')!;
    while (!sleep.enabled && s.clock.minutes < atDayMinute(1, 2 * 60)) {
      rec.run(4);
      sleep = core.options(ada!.id, { kind: 'object', objectId: bed }).find((o) => o.interactionId === 'sleep')!;
    }
    expect(sleep.enabled, sleep.reason).toBe(true);
    const sleepsBefore = done(ada!.id, 'sleep').length;
    ok(core.queue(ada!.id, sleep));
    const ordered = ada!.queue.find((a) => a.interactionId === 'sleep' && a.source === 'player')!;
    expect(ordered.target).toEqual({ kind: 'object', objectId: bed, slotId: null });
    rec.runUntil(atDayMinute(1, 7 * 60));
    expect(rec.finished.some((f) => f.actionId === ordered.id && f.result === 'done')).toBe(true);
    expect(done(ada!.id, 'sleep').length).toBeGreaterThan(sleepsBefore);
    expect(ada!.needs.energy).toBeGreaterThan(80);

    // ---- buy a bed, then move and rotate it ----
    const before = hh.funds;
    core.setMode('buy');
    ok(core.startPlacement('bed-single-pine'));
    core.placementTile(2, 2);
    const bought = core.confirmPlacement();
    ok(bought);
    const newBed = bought.objectId!;
    expect(hh.funds).toBe(before - db.objects['bed-single-pine']!.price);
    ok(core.startMove(newBed));
    core.placementTile(2, 6);
    core.rotatePlacement(1);
    ok(core.confirmPlacement());
    expect(lot.objects[newBed]).toEqual(expect.objectContaining({ x: 2, z: 6, rot: 1 }));

    // ---- change a wall finish (one side only) ----
    core.setMode('build');
    const wallId = edgeKey(0, 'v', 11, 15);
    const otherSide = { ...lot.walls[wallId]!.sideB };
    const stripes: FinishRef = { designId: 'stripes-regency', paletteId: 'regency-red' };
    core.setPaintTool({ kind: 'wall', finish: stripes, scope: 'side' });
    ok(core.paintApply({ kind: 'wall', wallId, side: 'a', tile: { x: 10, z: 15 }, level: 0 }));
    expect(lot.walls[wallId]!.sideA).toEqual(stripes);
    core.setMode('live');
    rec.run(20);

    // ---- save, reload in a fresh game instance, compare ----
    ok(await core.saveTo('slot-1', 'Acceptance'));
    const savedJson = JSON.stringify(s);
    const funds = hh.funds;
    rec.dispose();

    const reloaded = new GameCore({ content: db, saves: store });
    const r = await reloaded.loadFrom('slot-1');
    ok(r);
    expect(r.report ?? []).toEqual([]);
    const l = reloaded.state()!;
    expect(JSON.stringify(l)).toBe(savedJson);
    const ada2 = l.people[ada!.id]!;
    expect(ada2.appearance).toEqual(adaDraft.appearance);
    expect(ada2.appearance.hair.styleId).toBe('braids-twin');
    expect(ada2.appearance.hair.color).toBe('#8a3b22');
    expect(ada2.appearance.bodyPresetId).toBe('b-athletic');
    expect(ada2.appearance.face.presetId).toBe('face-heart');
    expect(ada2.outfits.outfits).toEqual(adaDraft.outfits.outfits);
    const everyday = ada2.outfits.outfits.everyday[0]!.layers;
    expect([everyday.top?.garmentId, everyday.top?.color, everyday.bottom?.garmentId, everyday.shoes?.garmentId]).toEqual(['sweater-knit', '#2a6f97', 'skirt-aline', 'boots-ankle']);
    expect(ada2.traits).toEqual(['creative', 'foodie', 'early-bird']);
    expect(ada2.aspiration?.aspirationId).toBe('home-chef');
    expect(ada2.career).toEqual(expect.objectContaining({ careerId: 'culinary', daysWorked: 1 }));
    expect(l.people[ravi!.id]!.traits).toEqual(['outgoing', 'bookish', 'relaxed']);
    const hh2 = l.households[l.activeHouseholdId]!;
    expect(hh2.funds).toBe(funds);
    expect(hh2.ledger.filter((x) => x.kind === 'wage').map((x) => x.occurrence)).toEqual([`pay:${ada!.id}:0`]);
    const lot2 = l.lots[l.activeLotId]!;
    expect(lot2.objects[newBed]).toEqual(expect.objectContaining({ defId: 'bed-single-pine', x: 2, z: 6, rot: 1 }));
    expect(lot2.walls[wallId]!.sideA).toEqual(stripes);
    expect(lot2.walls[wallId]!.sideB).toEqual(otherSide);
    expect(l.relationships[`${harriet.id}>${knows[0]!.id}`]!.familiarity).toBeGreaterThan(0);
    expect(l.processed[`money:pay:${ada!.id}:0`]).toBeDefined();
    expect(reloaded.selected()).toBe(ada!.id);

    // The reloaded game keeps running and never pays the same shift twice.
    reloaded.advanceTicks(4 * 60 * 10);
    const wages = l.households[l.activeHouseholdId]!.ledger.filter((x) => x.kind === 'wage').map((x) => x.occurrence);
    expect(new Set(wages).size).toBe(wages.length);
    expect(wages[0]).toBe(`pay:${ada!.id}:0`);
  }, 60_000);
});
