// Shared fixtures for the housework and skill-effect tests: the small fixture world with the real chore interactions,
// tag capabilities, a sink and more skills added (the plain fixture content has no chores, so older tests are untouched).

import { INTERACTIONS } from '../../../src/content/interactions';
import { MOODLETS } from '../../../src/content/moodlets';
import { TRAITS } from '../../../src/content/traits';
import type { ContentDB, ObjectDef, SkillDef } from '../../../src/content/types';
import type { Id } from '../../../src/core/types';
import { buildWorld, fixtureContent, harness, place, setNeeds } from './fixtures';
import type { FixtureWorld, Harness } from './fixtures';

export const THRESHOLDS = [100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200];
const CHORES = ['cleanObject', 'washDishes', 'mopFloor', 'tidyUp', 'repairObject', 'serviceObject', 'callRepairperson', 'readSkillBook'];

/** Fixture content plus the real chore interactions, tags on the fixture objects, a sink and more skills. */
export function choreContent(): ContentDB {
  const c = fixtureContent();
  for (const i of INTERACTIONS) if (CHORES.includes(i.id)) c.interactions[i.id] = i;
  const tag = (id: string, ...tags: string[]) => { c.objects[id]!.tags = [...c.objects[id]!.tags, ...tags]; };
  tag('toilet-basic', 'toilet', 'plumbing', 'cleanable');
  tag('shower-stall', 'shower', 'plumbing', 'cleanable');
  tag('stove-basic', 'cleanable', 'appliance');
  tag('fridge-standard', 'cleanable', 'appliance');
  tag('counter-basic', 'counter', 'cleanable');
  tag('table-dining-oak', 'table', 'dining', 'cleanable');
  tag('tv-flatscreen', 'electronics');
  tag('bookcase-open', 'books');
  c.objects['bookcase-open']!.interactions = ['readBook', 'readSkillBook'];
  c.objects['computer-desktop']!.tags = ['electronics'];
  c.objects['tv-flatscreen']!.tags = ['tv', 'electronics'];
  const sink: ObjectDef = {
    ...c.objects['counter-basic']!, id: 'counter-sink', name: 'counter sink', tags: ['sink', 'counter', 'plumbing', 'cleanable'], interactions: [],
    slots: [{ id: 'use', kind: 'use', pos: [0.5, 1.3], approach: [0, 1], posture: 'standing', facing: 0, height: 0 }],
  };
  c.objects[sink.id] = sink;
  const skill = (id: string): SkillDef => ({ id, name: id, description: '', icon: id, thresholds: THRESHOLDS, unlocks: [], status: 'ready' });
  for (const id of ['handiness', 'programming', 'gardening', 'music']) c.skills[id] = skill(id);
  for (const m of MOODLETS) c.moodlets[m.id] = m;
  for (const t of TRAITS) if (['neat', 'messy', 'practical'].includes(t.id)) c.traits[t.id] = t;
  return c;
}

export interface Setup { w: FixtureWorld; h: Harness; content: ContentDB; sink: Id }

export function setup(opts: Parameters<typeof buildWorld>[0] = {}): Setup {
  const w = buildWorld({ autonomy: false, visitors: false, neighbour: false, ...opts });
  const sink = place(w.state, w.lot, 'counter-sink', 4, 0);
  for (const id of [w.mira, w.theo]) setNeeds(w.state, id, 80);
  const content = choreContent();
  return { w, h: harness(w.state, content), content, sink: sink.id };
}

