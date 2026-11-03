// Milestone 8 on the real content, world, simulation and persistence: a household adopts a child, who goes to school on the
// real navigation, does homework at the real desk, gets a report card, ages through the stages with the aging setting, and the
// whole family survives a save and load without any of the once-only pay-offs repeating.

import { describe, expect, it, vi } from 'vitest';
import { premadeHouseholds } from '../../../src/characters/creator';
import { MINUTES_PER_DAY, atDayMinute, dayIndex } from '../../../src/core/clock';
import type { Id, WorldState } from '../../../src/core/types';
import { validateWorld } from '../../../src/persistence/index';
import type { GameCore } from '../../../src/game/GameCore';
import { ADOPTION_FEES } from '../../../src/sim/tuning';
import { coreWithoutSaves, db } from './harness';

vi.setConfig({ testTimeout: 180_000 });

const premades = premadeHouseholds(db);

function game(): GameCore {
  const core = coreWithoutSaves();
  expect(core.startNewGame('guided', premades[0]!, 42)).toEqual({ ok: true });
  const s = core.state()!;
  s.settings.visitors = false;
  s.schedule = s.schedule.filter((e) => e.kind !== 'visitArrive');
  const hh = s.households[s.activeHouseholdId]!;
  for (const id of hh.memberIds) if (s.people[id]!.career) core.quitCareer(id);
  hh.funds = 1_000_000;
  return core;
}
const now = (c: GameCore) => c.state()!.clock.minutes;
function runTo(c: GameCore, minute: number): void { if (minute > now(c)) c.advanceTicks(Math.ceil((minute - now(c)) / 0.25)); }
const adult = (s: WorldState): Id => s.households[s.activeHouseholdId]!.memberIds[0]!;

describe('a family on the real game', () => {
  it('adopts a child who goes to school, does homework, gets a report card and survives a save and load', async () => {
    const core = game();
    const s = () => core.state()!;
    const parent = adult(s());
    const funds = s().households[s().activeHouseholdId]!.funds;
    const r = core.adopt(parent, { stage: 'child', sex: 'girl', firstName: 'Nora' });
    expect(r.ok).toBe(true);
    const kid = (r as { personId: Id }).personId;
    expect(s().households[s().activeHouseholdId]!.funds).toBe(funds - ADOPTION_FEES.child);
    const fam = core.family(kid)!;
    expect(fam).toMatchObject({ stage: 'child', relatives: [expect.objectContaining({ id: parent, text: 'Parent' })], school: expect.objectContaining({ schoolName: 'Willowbrook Elementary' }) });
    expect(core.family(parent)!.relatives.map((x) => x.text)).toEqual(['Child']);

    // the first school day (Monday): the child gets to school and back
    runTo(core, atDayMinute(0, 14 * 60 + 30));
    expect(s().people[kid]!.school).toMatchObject({ attended: 1, missed: 0 });
    expect(s().people[kid]!.location.kind).toBe('lot');
    expect(core.family(kid)!.school!.homeworkDue).toBe(true);
    // the player sends the child to do the homework; it counts once
    expect(core.doHomework(kid)).toEqual({ ok: true });
    runTo(core, atDayMinute(0, 18 * 60));
    expect(s().people[kid]!.school!.homeworkDay).toBe(0);
    expect(core.doHomework(kid).ok).toBe(false);
    const perfAfterHomework = s().people[kid]!.school!.performance;
    expect(perfAfterHomework).toBeGreaterThan(5);

    // save and load in the middle of the week: every once-only marker stays, nothing is paid twice
    const json = core.exportWorld()!;
    const copy = coreWithoutSaves();
    expect((await copy.importWorld(json)).ok).toBe(true);
    expect(JSON.stringify(copy.state())).toBe(JSON.stringify(s()));
    expect(validateWorld(copy.state()!, db).errors).toEqual([]);
    runTo(core, atDayMinute(3, 20 * 60));
    runTo(copy, atDayMinute(3, 20 * 60));
    expect(JSON.stringify(copy.state())).toBe(JSON.stringify(s()));
    expect(s().people[kid]!.school!.attended).toBeGreaterThanOrEqual(3);
    const family = Object.values(s().households).flatMap((h) => h.ledger).filter((l) => l.kind === 'family');
    expect(family).toHaveLength(1);

    // the report card of the first week arrives on the second Monday
    runTo(core, atDayMinute(7, 9 * 60));
    expect(s().people[kid]!.school!.lastGrade).toMatch(/^[A-F]$/);
    expect(s().feed.filter((f) => /report card/.test(f.text))).toHaveLength(1);
    expect(dayIndex(now(core))).toBe(7);
  });

  it('ages a baby to a toddler at the normal setting and shows the days to the birthday', () => {
    const core = game();
    const s = () => core.state()!;
    core.setSimSettings({ aging: 'normal' });
    const parent = adult(s());
    const r = core.adopt(parent, { stage: 'baby', sex: 'boy', firstName: 'Bo' });
    expect(r.ok).toBe(true);
    const baby = (r as { personId: Id }).personId;
    expect(core.family(baby)).toMatchObject({ stage: 'baby', stageLength: 3, daysToBirthday: 3, aging: 'normal' });
    // keep the baby fed so no sitter is needed: set needs high each hour of play
    for (let d = 0; d < 3; d++) {
      for (let h = 0; h < 24; h++) {
        for (const k of Object.keys(s().people[baby]!.needs) as Array<keyof WorldState['people'][string]['needs']>) s().people[baby]!.needs[k] = 80;
        core.advanceTicks(4 * 60);
      }
    }
    expect(s().people[baby]!.lifeStage).toBe('toddler');
    expect(core.family(baby)).toMatchObject({ stage: 'toddler', stageLength: 5 });
    expect(s().feed.some((f) => f.kind === 'family' && /Happy birthday, Bo/.test(f.text))).toBe(true);
    // settings: custom days, and the elder end-of-life switch go through the API
    core.setSimSettings({ aging: 'custom', agingDays: { toddler: 2 }, elderEndOfLife: true });
    expect(s().settings).toMatchObject({ aging: 'custom', agingDays: { toddler: 2 }, elderEndOfLife: true });
    expect(core.family(baby)).toMatchObject({ stageLength: 2 });
    expect(MINUTES_PER_DAY).toBe(1440);
  });

  it('moves a member out to a vacant home and back into play through the API', () => {
    const core = game();
    const s = () => core.state()!;
    const parent = adult(s());
    const adopted = core.adopt(parent, { stage: 'teen', sex: 'girl', firstName: 'Tess' });
    expect(adopted.ok).toBe(true);
    const teen = (adopted as { personId: Id }).personId;
    const lot = core.neighbourhood()!.lots.find((l) => l.kind === 'residential' && (l.tenure === 'for-rent' || l.tenure === 'for-sale'))!;
    const target = { kind: 'lot', lotId: lot.id } as const;
    // a teen cannot go alone
    expect(core.splitPreview([teen], target)!.ok).toBe(false);
    expect(core.splitPreview([parent], target)!.reason).toMatch(/young adult or older must stay/);
    const members = s().households[s().activeHouseholdId]!.memberIds;
    expect(members).toHaveLength(2);
  });
});
