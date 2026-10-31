// Guided Start checklist (docs/UI_SPEC.md section 10). Pure: signals come from real events observed by
// src/ui/hud/tutorial.ts; tests in tests/unit/ui/tutorial.test.ts.

export type TutorialStepId = 'select' | 'eat' | 'sleep' | 'needs' | 'work' | 'neighbour' | 'buyMove' | 'wall' | 'save';

export interface TutorialStep { id: TutorialStepId; title: string; hint: string }

export const TUTORIAL_STEPS: TutorialStep[] = [
  { id: 'select', title: 'Select your person', hint: 'Tap a portrait in the household strip, or tap them in the world.' },
  { id: 'eat', title: 'Eat something', hint: 'Tap the fridge and choose a snack or a meal.' },
  { id: 'sleep', title: 'Sleep or take a nap', hint: 'Tap a bed and choose Sleep or Nap.' },
  { id: 'needs', title: 'Check needs', hint: 'Tap the selected portrait again to open the person panel.' },
  { id: 'work', title: 'Go to work or join a career', hint: 'Open the Career tab to see the next shift, or find a job.' },
  { id: 'neighbour', title: 'Meet the neighbour', hint: 'Invite them over from the phone, then tap them to chat.' },
  { id: 'buyMove', title: 'Buy and move an object', hint: 'In Buy mode, place something new, then tap it and choose Move.' },
  { id: 'wall', title: 'Change a wall finish', hint: 'In Build mode, pick a wall finish and tap a wall.' },
  { id: 'save', title: 'Save the game', hint: 'Open the menu and choose Save game.' },
];

export interface TutorialProgress {
  done: TutorialStepId[];
  bought: boolean;
  moved: boolean;
  dismissed: boolean;
  collapsed: boolean;
}

export type TutorialSignal =
  | { type: 'selected' }
  | { type: 'action'; phase: 'started' | 'finished'; interactionId: string; behavior?: string; result?: 'done' | 'failed' | 'cancelled' }
  | { type: 'needsChecked' }
  | { type: 'career'; what: string }
  | { type: 'careerJoined' }
  | { type: 'social'; withOutsider: boolean }
  | { type: 'placed'; source: 'buy' | 'move' | 'inventory' }
  | { type: 'painted'; kind: 'wall' | 'floor' }
  | { type: 'saved' };

export function emptyProgress(): TutorialProgress {
  return { done: [], bought: false, moved: false, dismissed: false, collapsed: false };
}

const EAT_IDS = new Set(['eatMeal', 'grabSnack']);
const EAT_BEHAVIORS = new Set(['eatMeal', 'snack']);
const SLEEP_IDS = new Set(['sleep', 'nap']);
const SLEEP_BEHAVIORS = new Set(['sleep', 'rest']);

/** Returns a new progress object (or the same one when nothing changed). */
export function applySignal(p: TutorialProgress, s: TutorialSignal): TutorialProgress {
  const mark = (id: TutorialStepId, extra: Partial<TutorialProgress> = {}): TutorialProgress =>
    p.done.includes(id) && Object.keys(extra).every((k) => p[k as keyof TutorialProgress] === extra[k as keyof TutorialProgress])
      ? p
      : { ...p, ...extra, done: p.done.includes(id) ? p.done : [...p.done, id] };
  switch (s.type) {
    case 'selected': return mark('select');
    case 'needsChecked': return mark('needs');
    case 'saved': return mark('save');
    case 'careerJoined': return mark('work');
    case 'career': return s.what === 'leftForWork' || s.what === 'commuting' ? mark('work') : p;
    case 'social': return s.withOutsider ? mark('neighbour') : p;
    case 'painted': return s.kind === 'wall' ? mark('wall') : p;
    case 'action': {
      const id = s.interactionId, b = s.behavior ?? '';
      if (s.phase === 'finished' && s.result === 'done' && (EAT_IDS.has(id) || EAT_BEHAVIORS.has(b))) return mark('eat');
      if ((SLEEP_IDS.has(id) || SLEEP_BEHAVIORS.has(b)) && (s.phase === 'started' || s.result === 'done')) return mark('sleep');
      if (s.phase === 'started' && (id === 'goToWork' || b === 'goToWork')) return mark('work');
      return p;
    }
    case 'placed': {
      const bought = p.bought || s.source === 'buy';
      const moved = p.moved || s.source === 'move';
      if (bought === p.bought && moved === p.moved) return p;
      const next = { ...p, bought, moved };
      return bought && moved && !next.done.includes('buyMove') ? { ...next, done: [...next.done, 'buyMove'] } : next;
    }
    default: return p;
  }
}

export function isComplete(p: TutorialProgress): boolean {
  return TUTORIAL_STEPS.every((s) => p.done.includes(s.id));
}

/** Parses stored progress defensively (localStorage may hold anything). */
export function parseProgress(raw: string | null): TutorialProgress {
  if (!raw) return emptyProgress();
  try {
    const v = JSON.parse(raw) as Partial<TutorialProgress>;
    const ids = new Set(TUTORIAL_STEPS.map((s) => s.id));
    return {
      done: Array.isArray(v.done) ? v.done.filter((d): d is TutorialStepId => typeof d === 'string' && ids.has(d as TutorialStepId)) : [],
      bought: v.bought === true, moved: v.moved === true, dismissed: v.dismissed === true, collapsed: v.collapsed === true,
    };
  } catch {
    return emptyProgress();
  }
}
