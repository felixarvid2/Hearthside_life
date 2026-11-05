import { describe, expect, it } from 'vitest';
import type { ActionInstance, ActionPhase, Person } from '../../../src/core/types';
import { actionProgress } from '../../../src/render/actionProgress';
import {
  AMBER_COLOR, GREEN_AT, GREEN_COLOR, CANCELLED_COLOR, fillColor, monotonicFraction, pillVisual,
} from '../../../src/render/progressPills';
import { buildWorld, fixtureContent, setNeeds } from '../sim/fixtures';

const content = fixtureContent();

function person(): { p: Person; state: ReturnType<typeof buildWorld>['state'] } {
  const w = buildWorld({ autonomy: false, visitors: false, neighbour: false });
  setNeeds(w.state, w.mira, 60);
  return { p: w.state.people[w.mira]!, state: w.state };
}

function act(over: Partial<ActionInstance> & { interactionId: string }): ActionInstance {
  return {
    id: 'act_test', actorId: 'p', source: 'player', target: { kind: 'self' }, phase: 'perform', phaseSince: 0,
    route: [], elapsed: 0, duration: null, replans: 0, failureReason: null, data: {}, cancelRequested: false, queuedAt: 0,
    ...over,
  };
}

function withAction(a: ActionInstance, phase: ActionPhase = a.phase): { p: Person; state: ReturnType<typeof buildWorld>['state'] } {
  const w = person();
  a.phase = phase;
  w.p.queue = [a];
  return w;
}

describe('actionProgress: basic phases', () => {
  it('is null without an action and before perform (queued/validate/reserve)', () => {
    const w = person();
    expect(actionProgress(w.state, w.p, content)).toBeNull();
    for (const phase of ['queued', 'validate', 'reserve'] as const) {
      const x = withAction(act({ interactionId: 'watchTv', duration: 60 }), phase);
      expect(actionProgress(x.state, x.p, content)).toBeNull();
    }
  });

  it('shows walking at 0 during route with the walking flag', () => {
    const x = withAction(act({ interactionId: 'watchTv', duration: 60 }), 'route');
    const r = actionProgress(x.state, x.p, content)!;
    expect(r.walking).toBe(true);
    expect(r.phase).toBe('route');
    expect(r.fraction).toBe(0);
    expect(r.done).toBe(false);
    expect(r.status).toBe('running');
  });

  it('fixed duration is elapsed / duration, with the interaction icon and label', () => {
    const x = withAction(act({ interactionId: 'watchTv', elapsed: 15, duration: 60 }));
    const r = actionProgress(x.state, x.p, content)!;
    expect(r.fraction).toBeCloseTo(0.25, 6);
    expect(r.icon).toBe('watchTv');
    expect(r.label).toBe('watchTv');
    expect(r.done).toBe(false);
    expect(r.walking).toBe(false);
  });

  it('clamps fractions to 0..1 and treats an instant (duration 0) as complete', () => {
    const x = withAction(act({ interactionId: 'watchTv', elapsed: 99, duration: 60 }));
    expect(actionProgress(x.state, x.p, content)!.fraction).toBe(1);
    const y = withAction(act({ interactionId: 'watchTv', elapsed: 0, duration: 0 }));
    expect(actionProgress(y.state, y.p, content)!.fraction).toBe(1);
  });
});

describe('actionProgress: untilFull', () => {
  it('uses the recorded start value and the current need', () => {
    const x = withAction(act({
      interactionId: 'takeShower', phase: 'perform', elapsed: 6, duration: null,
      data: { startNeedId: 'hygiene', startNeed: 40 },
    }));
    x.p.needs.hygiene = 70;
    const r = actionProgress(x.state, x.p, content)!;
    expect(r.fraction).toBeCloseTo(0.5, 6); // (70 - 40) / (100 - 40)
  });

  it('falls back to elapsed / maxMinutes for actions loaded from an older save', () => {
    const x = withAction(act({ interactionId: 'takeShower', phase: 'perform', elapsed: 15, duration: null }));
    expect(actionProgress(x.state, x.p, content)!.fraction).toBeCloseTo(0.5, 6); // max 30
  });

  it('derives the driving need from the largest positive rate when no untilFull declaration exists', () => {
    const x = withAction(act({
      interactionId: 'customCare', phase: 'perform', elapsed: 4, duration: null,
      data: { startNeedId: 'fun', startNeed: 10 },
    }));
    // No definition at all: the recorded id is still trusted.
    x.p.needs.fun = 55;
    expect(actionProgress(x.state, x.p, content)!.fraction).toBeCloseTo(0.5, 6);
  });
});

describe('actionProgress: chains', () => {
  it('cookMeal measures across all three stages and never goes backwards at a transition', () => {
    const stages: number[] = [];
    const collect = (a: ActionInstance): number => {
      const x = withAction(a);
      return actionProgress(x.state, x.p, content)!.fraction;
    };
    stages.push(collect(act({ interactionId: 'cookMeal', phase: 'route', data: { stage: 0 } })));
    stages.push(collect(act({ interactionId: 'cookMeal', phase: 'perform', elapsed: 1, duration: 2, data: { stage: 0 } })));
    stages.push(collect(act({ interactionId: 'cookMeal', phase: 'perform', elapsed: 2, duration: 2, data: { stage: 0 } })));
    stages.push(collect(act({ interactionId: 'cookMeal', phase: 'route', data: { stage: 1, recipeId: 'pasta' } })));
    stages.push(collect(act({ interactionId: 'cookMeal', phase: 'perform', elapsed: 10, duration: 30, data: { stage: 1, recipeId: 'pasta' } })));
    stages.push(collect(act({ interactionId: 'cookMeal', phase: 'perform', elapsed: 30, duration: 30, data: { stage: 1, recipeId: 'pasta' } })));
    stages.push(collect(act({ interactionId: 'cookMeal', phase: 'route', data: { stage: 2, recipeId: 'pasta' } })));
    stages.push(collect(act({ interactionId: 'cookMeal', phase: 'perform', elapsed: 0.5, duration: 1, data: { stage: 2, recipeId: 'pasta' } })));
    // 2 + 30 + 1 planned minutes at cooking level 1.
    expect(stages[0]).toBe(0);
    expect(stages[1]).toBeCloseTo(1 / 33, 6);
    expect(stages[2]).toBeCloseTo(2 / 33, 6);
    expect(stages[3]).toBeCloseTo(2 / 33, 6);
    expect(stages[4]).toBeCloseTo(12 / 33, 6);
    expect(stages[5]).toBeCloseTo(32 / 33, 6);
    expect(stages[6]).toBeCloseTo(32 / 33, 6);
    expect(stages[7]).toBeCloseTo(32.5 / 33, 6);
    for (let i = 1; i < stages.length; i++) expect(stages[i]!).toBeGreaterThanOrEqual(stages[i - 1]! - 1e-9);
  });

  it('cookMeal plans the stage weight from the recipe minutes and the cooking skill', () => {
    const x = withAction(act({ interactionId: 'cookMeal', phase: 'perform', elapsed: 1, duration: 1, data: { stage: 1, recipeId: 'stew' } }));
    x.p.skills.cooking = { level: 10, xp: 0 };
    // The live duration (1) replaces the planned 31 minutes for the current stage.
    expect(actionProgress(x.state, x.p, content)!.fraction).toBeCloseTo(3 / 4, 6);
    // Walking to stage 1 still uses the plan: 2 / (2 + round(40 * 0.78) + 1).
    const y = withAction(act({ interactionId: 'cookMeal', phase: 'route', data: { stage: 1, recipeId: 'stew' } }));
    y.p.skills.cooking = { level: 10, xp: 0 };
    expect(actionProgress(y.state, y.p, content)!.fraction).toBeCloseTo(2 / 34, 6);
  });

  it('pool stages enter -> swim -> exit share the planned time; walking to the deck is 0', () => {
    const f = (stage: string, phase: ActionPhase, elapsed: number, duration: number | null): number => {
      const x = withAction(act({ interactionId: 'swimInPool', phase, elapsed, duration, data: { stage } }));
      return actionProgress(x.state, x.p, content)!.fraction;
    };
    const total = 0.75 + 90 + 0.9;
    expect(f('toDeck', 'route', 0, null)).toBe(0);
    expect(f('enter', 'perform', 0.3, 0.75)).toBeCloseTo(0.3 / total, 6);
    expect(f('swim', 'perform', 45, 90)).toBeCloseTo((0.75 + 45) / total, 6);
    expect(f('exit', 'perform', 0.45, 0.9)).toBeCloseTo((90.75 + 0.45) / total, 6);
    const x = withAction(act({ interactionId: 'swimInPool', phase: 'perform', elapsed: 45, duration: 90, data: { stage: 'swim' } }));
    expect(actionProgress(x.state, x.p, content)!.walking).toBe(false);
  });

  it('readBook stage 0 pickup counts towards the whole book', () => {
    const x = withAction(act({ interactionId: 'readBook', phase: 'perform', elapsed: 1, duration: 1, data: { stage: 0 } }));
    expect(actionProgress(x.state, x.p, content)!.fraction).toBeCloseTo(1 / 46, 6); // [1, 45]
  });
});

describe('actionProgress: socials, endings and loads', () => {
  it('social actor and listener both show the current exchange', () => {
    const actor = withAction(act({ interactionId: 'chat', elapsed: 3, duration: 6 }));
    const a = actionProgress(actor.state, actor.p, content)!;
    expect(a.fraction).toBeCloseTo(0.5, 6);
    expect(a.icon).toBe('chat');
    const listener = withAction(act({ interactionId: 'chat', elapsed: 3, duration: null, data: { role: 'listen' } }));
    const l = actionProgress(listener.state, listener.p, content)!;
    expect(l.fraction).toBeCloseTo(0.5, 6); // SocialDef.minutes = 6
  });

  it('cancel and failure keep the fraction they stopped at and report the status', () => {
    const x = withAction(act({ interactionId: 'watchTv', elapsed: 20, duration: 60, cancelRequested: true }));
    const c = actionProgress(x.state, x.p, content)!;
    expect(c.status).toBe('cancelled');
    expect(c.done).toBe(false);
    expect(c.fraction).toBeCloseTo(20 / 60, 6);
    const y = withAction(act({ interactionId: 'watchTv', phase: 'cleanup', elapsed: 20, duration: 60, data: { result: 'failed' } }));
    const f = actionProgress(y.state, y.p, content)!;
    expect(f.status).toBe('failed');
    expect(f.fraction).toBeCloseTo(20 / 60, 6);
  });

  it('apply and a successful cleanup are done at 100%', () => {
    for (const phase of ['apply', 'cleanup'] as const) {
      const x = withAction(act({ interactionId: 'watchTv', phase, elapsed: 60, duration: 60, data: phase === 'cleanup' ? { result: 'done' } : {} }));
      const r = actionProgress(x.state, x.p, content)!;
      expect(r.done).toBe(true);
      expect(r.status).toBe('done');
      expect(r.fraction).toBe(1);
    }
  });

  it('works right after a load, in the middle of a fixed action', () => {
    const x = withAction(act({ interactionId: 'watchTv', phase: 'perform', elapsed: 37.5, duration: 60 }));
    expect(actionProgress(x.state, x.p, content)!.fraction).toBeCloseTo(0.625, 6);
  });
});

describe('progress pill visuals', () => {
  it('is amber at the start, blends through the middle and is the theme green at 85%', () => {
    expect(fillColor(0)).toBe(AMBER_COLOR);
    expect(fillColor(-5)).toBe(AMBER_COLOR);
    expect(fillColor(GREEN_AT)).toBe(GREEN_COLOR);
    expect(fillColor(0.99)).toBe(GREEN_COLOR);
    expect(fillColor(0.5)).toMatch(/^hsl\(/);
    expect(fillColor(0.5)).not.toBe(fillColor(0.2));
    // The eased blend keeps a 30% fill warm (hue in the 40s), not lime.
    const hue = Number(/^hsl\((\d+)/.exec(fillColor(0.3))?.[1]);
    expect(hue).toBeGreaterThanOrEqual(40);
    expect(hue).toBeLessThan(60);
  });

  it('maps running, near-done, done, cancelled and walking states', () => {
    const x = withAction(act({ interactionId: 'watchTv', elapsed: 30, duration: 60 }));
    const running = pillVisual(actionProgress(x.state, x.p, content)!);
    expect(running).toMatchObject({ visible: true, kind: 'running', checked: false, walking: false });
    expect(running.fraction).toBeCloseTo(0.5, 6);

    const y = withAction(act({ interactionId: 'watchTv', elapsed: 54, duration: 60 }));
    expect(pillVisual(actionProgress(y.state, y.p, content)!).kind).toBe('almost');

    const z = withAction(act({ interactionId: 'watchTv', phase: 'apply', elapsed: 60, duration: 60 }));
    const done = pillVisual(actionProgress(z.state, z.p, content)!);
    expect(done).toMatchObject({ kind: 'done', checked: true, fraction: 1, color: GREEN_COLOR });

    const c = withAction(act({ interactionId: 'watchTv', elapsed: 10, duration: 60, cancelRequested: true }));
    const cancelled = pillVisual(actionProgress(c.state, c.p, content)!);
    expect(cancelled).toMatchObject({ kind: 'cancelled', color: CANCELLED_COLOR, checked: false });

    const w = withAction(act({ interactionId: 'watchTv', phase: 'route', duration: 60 }));
    expect(pillVisual(actionProgress(w.state, w.p, content)!).walking).toBe(true);
    expect(pillVisual(null).visible).toBe(false);
  });

  it('renders the ending states from the last shown fraction', () => {
    expect(pillVisual(null, 0.4, 'done')).toMatchObject({ kind: 'done', checked: true, fraction: 1 });
    expect(pillVisual(null, 0.4, 'cancelled')).toMatchObject({ kind: 'cancelled', fraction: 0.4, color: CANCELLED_COLOR });
  });

  it('never lets the fraction fall while the same action runs', () => {
    expect(monotonicFraction(null, 0.3)).toBe(0.3);
    expect(monotonicFraction(0.6, 0.4)).toBe(0.6);
    expect(monotonicFraction(0.6, 0.8)).toBe(0.8);
    expect(monotonicFraction(0.6, Number.NaN)).toBe(0.6);
    expect(monotonicFraction(null, 2)).toBe(1);
  });
});
