import { describe, expect, it } from 'vitest';
import { socialSection } from '../../../src/content/capabilities';
import { SOCIALS } from '../../../src/content/socials';
import { setBoth, socialWorld } from './socialFixtures';
import { lotLocation, setNeeds } from './fixtures';

const SECTIONS = ['friendly', 'romantic', 'mean', 'special'];

function menu(setup?: (w: ReturnType<typeof socialWorld>['w']) => void) {
  const sw = socialWorld();
  const { w, h } = sw;
  const ada = w.neighbour!;
  w.state.people[ada]!.location = lotLocation(w.lot, 7, 9);
  setNeeds(w.state, ada, 100);
  setNeeds(w.state, w.mira, 80);
  setup?.(w);
  return h.sim.options(w.mira, { kind: 'person', personId: ada });
}

describe('the social menu', () => {
  it('has at least 24 socials, in four sections, none of them unnamed', () => {
    expect(SOCIALS.length).toBeGreaterThanOrEqual(24);
    const counts: Record<string, number> = {};
    for (const d of SOCIALS) counts[socialSection(d)] = (counts[socialSection(d)] ?? 0) + 1;
    expect(Object.keys(counts).sort()).toEqual([...SECTIONS].sort());
    for (const s of SECTIONS) expect(counts[s]!, s).toBeGreaterThanOrEqual(3);
  });

  it('groups entries Friendly / Romantic / Mean / Special and lists the usable ones first in each', () => {
    const list = menu();
    expect(list.length).toBe(SOCIALS.length);
    const seen: string[] = [];
    for (const o of list) { if (seen[seen.length - 1] !== o.section) seen.push(o.section!); }
    expect(seen).toEqual(SECTIONS); // each section appears once, in order
    for (const s of SECTIONS) {
      const inSection = list.filter((o) => o.section === s);
      const firstDisabled = inSection.findIndex((o) => !o.enabled);
      if (firstDisabled >= 0) expect(inSection.slice(firstDisabled).every((o) => !o.enabled), `${s}: disabled entries come last`).toBe(true);
    }
  });

  it('puts the introduction first for strangers, and every disabled entry carries a reason', () => {
    const list = menu();
    const friendly = list.filter((o) => o.section === 'friendly');
    expect(friendly[0]).toMatchObject({ interactionId: 'introduce', enabled: true });
    for (const o of list.filter((x) => !x.enabled)) expect(o.reason, o.interactionId).toBeTruthy();
    expect(list.find((o) => o.interactionId === 'chat')).toMatchObject({ enabled: false, reason: 'Needs an introduction first.' });
    expect(list.find((o) => o.interactionId === 'kiss')!.enabled).toBe(false);
  });

  it('puts what fits the relationship first, and a status step that just became possible stands out', () => {
    const list = menu((w) => setBoth(w.state, w.mira, w.neighbour!, { familiarity: 60, friendship: 45, trust: 20, romance: 0 }));
    const ids = (s: string) => list.filter((o) => o.section === s && o.enabled).map((o) => o.interactionId);
    const special = ids('special');
    expect(special[0]).toBe('becomeFriends');
    expect(ids('friendly')).not.toContain('introduce');
    expect(ids('friendly').slice(0, 3)).toEqual(expect.arrayContaining(['chat']));
    // mean options exist but are last in their own section and never first overall
    expect(list[0]!.section).toBe('friendly');
  });

  it('shows odds for ordinary options but never for romantic ones', () => {
    const list = menu((w) => setBoth(w.state, w.mira, w.neighbour!, { familiarity: 60, friendship: 50, trust: 30, romance: 40 }));
    for (const o of list) {
      if (o.section === 'romantic') expect(o.hint, o.interactionId).toBeUndefined();
      if (o.enabled && o.section !== 'romantic' && o.interactionId !== 'breakUp') expect(['Good odds', 'Fair odds', 'Long shot'], o.interactionId).toContain(o.hint);
    }
    expect(list.find((o) => o.interactionId === 'flirt')!.enabled).toBe(true);
  });

  it('lists the phone planner and, for an interested adult, dates; invitations reach any other household', () => {
    const { w, h } = socialWorld();
    const self = h.sim.options(w.mira, { kind: 'self' });
    expect(self.find((o) => o.interactionId === 'planEvent')).toMatchObject({ label: 'Plan an Event...', enabled: true, section: 'phone' });
    expect(self.find((o) => o.interactionId === 'phoneInvite')).toMatchObject({ label: 'Invite Ada Over', section: 'phone' });
    expect(self.some((o) => o.interactionId === 'phoneDate')).toBe(false); // does not know Ada yet
    setBoth(w.state, w.mira, w.neighbour!, { familiarity: 20, friendship: 30, romance: 25 });
    const after = h.sim.options(w.mira, { kind: 'self' });
    expect(after.find((o) => o.interactionId === 'phoneDate')).toMatchObject({ label: 'Ask Ada on a Date', section: 'phone', data: { personId: w.neighbour } });
    w.state.people[w.neighbour!]!.romance = { interestedIn: ['any'], open: true };
    w.state.people[w.mira]!.romance = { interestedIn: [], open: true };
    expect(h.sim.options(w.mira, { kind: 'self' }).some((o) => o.interactionId === 'phoneDate')).toBe(false);
  });
});
