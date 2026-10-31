import { describe, expect, it } from 'vitest';
import { facingTo } from '../../../src/core/geometry';
import { pairKey, relKey } from '../../../src/core/ids';
import { MEMORY_LIMIT } from '../../../src/core/state';
import type { GameEvent } from '../../../src/core/events';
import { addMemory, ensureRel } from '../../../src/sim/relationships';
import { recentUses, socialAcceptance } from '../../../src/sim/social';
import { buildWorld, harness, head, lotLocation, pureCtx, runTicks, runUntil, setNeeds } from './fixtures';
import type { FixtureWorld, Harness } from './fixtures';

/** Mira and Theo at home, Ada (a neighbour) on the lot with full needs so she does not wander off. */
function withAda(seed = 42): { w: FixtureWorld; h: Harness; ada: string } {
  const w = buildWorld({ seed, autonomy: false, visitors: false });
  const ada = w.neighbour!;
  w.state.people[ada]!.location = lotLocation(w.lot, 7, 9);
  setNeeds(w.state, ada, 100);
  setNeeds(w.state, w.mira, 70);
  setNeeds(w.state, w.theo, 70);
  return { w, h: harness(w.state), ada };
}

type SocialEvent = Extract<GameEvent, { type: 'social' }>;
const socials = (h: Harness) => h.log.filter((e): e is SocialEvent => e.type === 'social');

function talk(h: Harness, from: string, to: string, socialId: string): void {
  const r = h.sim.queue(from, { interactionId: socialId, target: { kind: 'person', personId: to } });
  if (!r.ok) throw new Error(r.reason);
  const n = socials(h).length;
  runUntil(h, () => socials(h).length > n, 4 * 60);
  runTicks(h, 1);
}

describe('social interactions', () => {
  it('walks over, holds the partner, faces each other on adjacent tiles, then releases', () => {
    const { w, h, ada } = withAda();
    h.sim.queue(w.mira, { interactionId: 'introduce', target: { kind: 'person', personId: ada } });
    runUntil(h, () => head(h, w.mira)?.phase === 'perform');
    const listen = head(h, ada)!;
    expect(listen.data.role).toBe('listen');
    expect(h.sim.reservations()).toEqual([`person:${ada}=${head(h, w.mira)!.id}`]);
    const a = h.holder.state.people[w.mira]!.location, b = h.holder.state.people[ada]!.location;
    if (a.kind !== 'lot' || b.kind !== 'lot') throw new Error('off lot');
    expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z))).toBeLessThanOrEqual(1);
    expect(a.facing).toBeCloseTo(facingTo(a.x, a.z, b.x, b.z), 6);
    expect(b.facing).toBeCloseTo(facingTo(b.x, b.z, a.x, a.z), 6);
    runUntil(h, () => !head(h, w.mira));
    runTicks(h, 1);
    expect(head(h, ada)).toBeUndefined();
    expect(h.sim.reservations()).toEqual([]);
    const ev = socials(h)[0]!;
    expect(ev).toMatchObject({ actorId: w.mira, targetId: ada, socialId: 'introduce' });
    if (ev.accepted) {
      expect(ev.line).toBe('Mira introduced themself to Ada.');
      expect(h.holder.state.bonds[pairKey(w.mira, ada)]!.status).toBe('acquaintance');
      expect(h.holder.state.people[ada]!.memories.some((m) => m.kind === 'met' && m.withId === w.mira)).toBe(true);
    }
    expect(h.holder.state.relationships[relKey(ada, w.mira)]!.familiarity).toBeGreaterThan(0);
    expect(h.holder.state.feed.some((f) => f.text === ev.line)).toBe(true);
  });

  it('resolves the outcome once, deterministically per seed', () => {
    const outcome = (seed: number) => {
      const { w, h, ada } = withAda(seed);
      ensureRel(h.holder.state, w.mira, ada).familiarity = 20;
      ensureRel(h.holder.state, ada, w.mira).familiarity = 20;
      talk(h, w.mira, ada, 'tellJoke');
      const evs = socials(h);
      expect(evs).toHaveLength(1);
      return JSON.stringify({ accepted: evs[0]!.accepted, ab: h.holder.state.relationships[relKey(w.mira, ada)], ba: h.holder.state.relationships[relKey(ada, w.mira)], rng: h.holder.state.rng });
    };
    const seen = new Set<boolean>();
    for (let seed = 1; seed <= 16; seed++) {
      const a = outcome(seed);
      expect(outcome(seed)).toBe(a);
      seen.add((JSON.parse(a) as { accepted: boolean }).accepted);
    }
    expect(seen.size).toBe(2);
  });

  it('changes shared status only on acceptance', () => {
    let accepted = 0, rejected = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { w, h, ada } = withAda(seed);
      for (const [x, y] of [[w.mira, ada], [ada, w.mira]] as const) {
        const r = ensureRel(h.holder.state, x, y);
        r.familiarity = 40; r.friendship = 35;
      }
      talk(h, w.mira, ada, 'becomeFriends');
      const ev = socials(h)[0]!;
      const bond = h.holder.state.bonds[pairKey(w.mira, ada)];
      if (ev.accepted) {
        accepted++;
        expect(bond?.status).toBe('friend');
        expect(h.holder.state.people[w.mira]!.memories.some((m) => m.kind === 'becameFriends' && m.importance === 3)).toBe(true);
      } else {
        rejected++;
        expect(bond?.status).not.toBe('friend');
      }
    }
    expect(accepted).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);
  });

  it('dampens spam: repeated uses lower acceptance and are forgotten over time', () => {
    const { w, h, ada } = withAda();
    for (const [x, y] of [[w.mira, ada], [ada, w.mira]] as const) ensureRel(h.holder.state, x, y).familiarity = 30;
    const mira = () => h.holder.state.people[w.mira]!, adaP = () => h.holder.state.people[ada]!;
    const joke = h.content.socials.tellJoke!;
    const before = socialAcceptance(pureCtx(h), mira(), adaP(), joke);
    talk(h, w.mira, ada, 'tellJoke');
    talk(h, w.mira, ada, 'tellJoke');
    const rel = h.holder.state.relationships[relKey(w.mira, ada)]!;
    expect(rel.recent.tellJoke).toBe(2);
    const after = socialAcceptance(pureCtx(h), mira(), adaP(), joke);
    expect(after).toBeLessThan(before - 0.2);
    expect(recentUses(rel, 'tellJoke', h.holder.state.clock.minutes + 180)).toBe(0);
  });

  it('lists disabled socials with reasons', () => {
    const { w, h, ada } = withAda();
    const byId = (list: ReturnType<typeof h.sim.options>) => Object.fromEntries(list.map((o) => [o.interactionId, o]));
    const stranger = byId(h.sim.options(w.mira, { kind: 'person', personId: ada }));
    expect(stranger.introduce!.enabled).toBe(true);
    expect(stranger.chat).toMatchObject({ enabled: false, reason: 'Needs an introduction first.' });
    expect(stranger.deepTalk).toMatchObject({ enabled: false, reason: 'Needs to be friends first.' });
    expect(stranger.flirt).toMatchObject({ enabled: false, reason: 'Needs a closer friendship first.' });
    const roommate = byId(h.sim.options(w.mira, { kind: 'person', personId: w.theo }));
    expect(roommate.introduce).toMatchObject({ enabled: false, reason: 'Already introduced.' });
    expect(roommate.becomeFriends).toMatchObject({ enabled: false, reason: 'Already friends.' });
    expect(roommate.deepTalk!.enabled).toBe(true);
    expect(roommate.chat!.group).toBe('social');
  });

  it('cannot talk to someone asleep or away', () => {
    const { w, h } = withAda();
    h.holder.state.people[w.theo]!.needs.energy = 30;
    h.sim.queue(w.theo, { interactionId: 'sleep', target: { kind: 'object', objectId: w.objects.bed!.id, slotId: null } });
    runUntil(h, () => head(h, w.theo)?.phase === 'perform');
    const chat = h.sim.options(w.mira, { kind: 'person', personId: w.theo }).find((o) => o.interactionId === 'chat')!;
    expect(chat).toMatchObject({ enabled: false, reason: 'Theo is asleep.' });
    h.holder.state.people[w.theo]!.queue = [];
    h.holder.state.people[w.theo]!.location = { kind: 'offlot', place: 'work', since: 0, until: null };
    h.sim.rebuild();
    const chat2 = h.sim.options(w.mira, { kind: 'person', personId: w.theo }).find((o) => o.interactionId === 'chat')!;
    expect(chat2.reason).toBe('Theo is at work.');
  });

  it('the conversation fails cleanly when the partner is ordered away', () => {
    const { w, h } = withAda();
    h.sim.queue(w.mira, { interactionId: 'chat', target: { kind: 'person', personId: w.theo } });
    runUntil(h, () => head(h, w.mira)?.phase === 'perform');
    const listener = head(h, w.theo)!;
    h.sim.cancel(w.theo, listener.id);
    runUntil(h, () => !head(h, w.mira), 20);
    const end = h.log.find((e) => e.type === 'action.finished' && e.personId === w.mira && e.interactionId === 'chat');
    expect(end).toMatchObject({ result: 'failed', reason: 'Theo walked away.' });
    expect(socials(h)).toHaveLength(0);
    expect(h.sim.reservations()).toEqual([]);
  });
});

describe('memories', () => {
  it('merge repeated low-importance memories, keep importance 3 and stay bounded', () => {
    const w = buildWorld({ neighbour: false });
    const p = w.state.people[w.mira]!;
    const start = p.memories.length;
    addMemory(w.state, p, { kind: 'joke', importance: 1, withId: w.theo, text: 'Laughed with Theo' });
    addMemory(w.state, p, { kind: 'joke', importance: 1, withId: w.theo, text: 'Laughed with Theo' });
    expect(p.memories).toHaveLength(start + 1);
    expect(p.memories[p.memories.length - 1]!.count).toBe(2);
    for (let i = 0; i < 60; i++) addMemory(w.state, p, { kind: 'other', importance: 1, withId: `per_x${i}`, text: `m${i}` });
    expect(p.memories.length).toBe(MEMORY_LIMIT);
    expect(p.memories.some((m) => m.kind === 'movedIn' && m.importance === 3)).toBe(true);
  });
});
