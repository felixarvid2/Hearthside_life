import { describe, expect, it } from 'vitest';
import type { ActionInstance, ActionPhase } from '../../../src/core/types';
import { objectUses } from '../../../src/render/objectUse';
import { buildWorld } from '../sim/fixtures';

function action(over: Partial<ActionInstance> & { interactionId: string }): ActionInstance {
  return {
    id: 'act_1', actorId: 'p', source: 'player', target: { kind: 'object', objectId: 'fridge', slotId: null }, phase: 'perform',
    phaseSince: 5, route: [], elapsed: 1, duration: 10, replans: 0, failureReason: null, data: {}, cancelRequested: false,
    queuedAt: 0, ...over,
  };
}

function withAction(a: ActionInstance, phase: ActionPhase = a.phase) {
  const w = buildWorld({ autonomy: false, visitors: false, neighbour: false });
  a.phase = phase;
  if (a.target.kind === 'object' && a.target.objectId === 'fridge') a.target = { kind: 'object', objectId: w.objects.fridge!.id, slotId: null };
  w.state.people[w.mira]!.queue = [a];
  // animSince drives mid-action loads
  w.state.people[w.mira]!.anim = { id: 'cook', since: 7, loop: true };
  return { ...w, p: w.state.people[w.mira]! };
}

describe('objectUses', () => {
  it('records the target object with its use details', () => {
    const w = withAction(action({ interactionId: 'grabSnack', data: { stage: 0 } }));
    const uses = objectUses(w.state);
    const list = uses.get(w.objects.fridge!.id)!;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      objectId: w.objects.fridge!.id, role: 'target', personId: w.mira, interactionId: 'grabSnack',
      anim: 'cook', animSince: 7, stage: 0,
    });
  });

  it('ignores actions that are still walking (queued/route)', () => {
    const w = withAction(action({ interactionId: 'grabSnack' }), 'route');
    expect(objectUses(w.state).size).toBe(0);
  });

  it('adds the stove as a station for cookMeal stage 1', () => {
    const w = withAction(action({ interactionId: 'cookMeal', data: { stage: 1, stoveObj: 'stove' } }));
    const uses = objectUses(w.state);
    expect(uses.get(w.objects.fridge!.id)![0]).toMatchObject({ role: 'target', stage: 1 });
    expect(uses.get('stove')![0]).toMatchObject({ role: 'station', interactionId: 'cookMeal', stage: 1 });
  });

  it('adds the wash station for washDishes even when the target is an item', () => {
    const w = withAction(action({
      interactionId: 'washDishes', target: { kind: 'item', itemId: 'dish1' }, data: { stage: 1, washObj: 'sink1' },
    }));
    const uses = objectUses(w.state);
    expect(uses.has('dish1')).toBe(false);
    expect(uses.get('sink1')![0]).toMatchObject({ role: 'station', interactionId: 'washDishes', stage: 1 });
  });

  it('leaves people on other lots out', () => {
    const w = withAction(action({ interactionId: 'grabSnack' }));
    w.p.location = { kind: 'offlot', place: 'home', since: 0, until: null };
    expect(objectUses(w.state).size).toBe(0);
  });
});
