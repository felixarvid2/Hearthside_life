// Milestone 11, task C fixtures: the small fixture world with the real Photography, Fishing and Research content.

import { INTERACTIONS } from '../../../src/content/interactions';
import { OBJECTS } from '../../../src/content/objects';
import { SKILLS } from '../../../src/content/skills';
import { MOODLETS } from '../../../src/content/moodlets';
import type { ContentDB } from '../../../src/content/types';
import { buildWorld, fixtureContent, harness, place, setNeeds } from './fixtures';

export const M11C_INTERACTIONS = [
  'takePhotos', 'sellPhotos', 'photoWalk', 'fishPond', 'fishVenue', 'sellCatch', 'researchOnline', 'researchSky', 'writePaper',
];

const realObject = (id: string) => OBJECTS.find((o) => o.id === id)!;

/** Fixture content plus the real M11-C skills, interactions, moodlet and objects. */
export function skillsContent(): ContentDB {
  const c = fixtureContent();
  for (const i of INTERACTIONS) if (M11C_INTERACTIONS.includes(i.id)) c.interactions[i.id] = i;
  for (const s of SKILLS) if (['photography', 'fishing', 'research', 'programming', 'logic'].includes(s.id)) c.skills[s.id] = s;
  for (const m of MOODLETS) if (m.id === 'inspired') c.moodlets[m.id] = m;
  for (const id of ['camera-tripod', 'telescope', 'garden-pond-fishing']) c.objects[id] = realObject(id);
  c.objects['computer-desktop']!.tags = ['electronics', 'computer'];
  c.objects['computer-desktop']!.interactions.push('researchOnline', 'writePaper');
  return c;
}

/** A fixture home with a camera, a telescope and a stocked pond, plus both residents at full needs. */
export function skillsSetup() {
  const w = buildWorld({ autonomy: false, visitors: false, neighbour: false });
  const content = skillsContent();
  const camera = place(w.state, w.lot, 'camera-tripod', 0, 6);
  const telescope = place(w.state, w.lot, 'telescope', 2, 6);
  const pond = place(w.state, w.lot, 'garden-pond-fishing', 0, 2);
  for (const id of [w.mira, w.theo]) setNeeds(w.state, id, 80);
  const h = harness(w.state, content);
  return { w, h, content, camera, telescope, pond };
}

export type SkillsSetup = ReturnType<typeof skillsSetup>;
