// Contextual hints for new players (Milestone 13). Pure: the catalogue, the "seen" bookkeeping and the choice of the next
// hint. The ids a player has already seen live in GameSettings.seenHints (stored with the other device settings), the
// on/off switch is GameSettings.hints. The DOM side is src/ui/hud/hints.ts; tests in tests/unit/ui/hints.test.ts.

export type HintId = 'household' | 'moveIn' | 'needs' | 'queue' | 'buy' | 'build' | 'jobs' | 'relationships' | 'travel' | 'floors' | 'saving';

export interface HintDef {
  id: HintId;
  /** Short heading of the hint card and of the Help topic. */
  title: string;
  /** One or two sentences shown on the hint card when the player first reaches the situation. */
  text: string;
  /** The Help screen's how-to for the topic: a few short steps. */
  steps: string[];
}

/** In the order a new player meets them (also the Help screen's order). */
export const HINTS: readonly HintDef[] = [
  {
    id: 'household', title: 'Creating a household',
    text: 'Name the household, then shape each person: face, hair, clothes and traits. Presets and Randomise give a quick start; adjust anything afterwards.',
    steps: ['Pick a household name and add up to the people you want.', 'Choose a preset or move the sliders; lock what you like before you randomise.', 'Pick traits and an aspiration: they steer how the person behaves.', 'Review, then choose Move in. You can change clothes later in the wardrobe.'],
  },
  {
    id: 'moveIn', title: 'Moving in',
    text: 'Welcome home. Tap a portrait at the top to pick someone, then tap an object to see what they can do. Pause any time to think.',
    steps: ['Tap a portrait (or the person) to select them.', 'Tap a fridge, bed, sofa or door to open its menu of actions.', 'Space or the pause button stops time; 1, 2 and 3 set the speed.', 'Drag to look around, pinch or scroll to zoom, and use the camera buttons to turn.'],
  },
  {
    id: 'needs', title: 'Needs and mood',
    text: 'Six needs keep a person well. Each bar shows a number and a word when it runs low. Tap the selected portrait again to see them all.',
    steps: ['Open the person panel by tapping the selected portrait again.', 'The Needs tab lists hunger, energy, hygiene, bladder, fun and social.', 'A low need shows "Low" or "Critical" as well as a coloured bar.', 'Tap the fridge, a bed or a shower to look after a need.'],
  },
  {
    id: 'queue', title: 'The action queue',
    text: 'Choices join a queue and are done in order. The Queue tab shows what is running and what comes next, and lets you cancel an action.',
    steps: ['Pick an object and choose an action: it joins the person’s queue.', 'Open the Queue tab to see the running action and what is waiting.', 'Cancel an action there if you change your mind.', 'Idle people also look after themselves; adjust this in Settings.'],
  },
  {
    id: 'buy', title: 'Buying objects',
    text: 'Choose a category, pick an item and tap the floor to place it. Tap a placed object to move or sell it. Undo and redo are always available.',
    steps: ['Open Buy and pick a category or search by name.', 'Tap an item, then tap where it should go; R or the rotate button turns it.', 'The preview shows whether the spot is valid; read the note if it is not.', 'Tap a placed object to move it, put it in storage or sell it.'],
  },
  {
    id: 'build', title: 'Build mode basics',
    text: 'Pick a tool to draw walls, rooms, doors or floors. Drag to preview, then Confirm or Cancel. Tap a wall or floor to paint it.',
    steps: ['Choose a tool from the Build panel: walls, rooms, doors and windows, floors.', 'Drag on the ground to preview; nothing is final until you Confirm.', 'Select a room to move, resize or copy it.', 'Undo and redo work for every change; Esc cancels the tool.'],
  },
  {
    id: 'jobs', title: 'Jobs and money',
    text: 'The Career tab shows the next shift and how to find a job. Pay arrives once after each shift. Bills fall due weekly, and late ones cost fees.',
    steps: ['Open the Career tab to find a job or see the next shift.', 'Go to work from the same tab; the person leaves and comes back paid.', 'Open Bills to see what is due and pay it before the due date.', 'Funds show at the top; freelancing at the computer earns extra.'],
  },
  {
    id: 'relationships', title: 'Relationships',
    text: 'Chat to build friendship and trust; romance is possible between adults. The Relationships tab lists everyone you know.',
    steps: ['Tap another person and choose Chat or another social action.', 'Friendship and trust grow with kind talk and time together.', 'Use the phone to invite neighbours over or plan an event.', 'The Relationships tab shows labels, memories and gifts to give.'],
  },
  {
    id: 'travel', title: 'Travel and the map',
    text: 'Pick a place on the map to go there. Trips are free and take 20 to 40 game minutes. Choose who goes, and come home from the same map.',
    steps: ['Open the Map from the top bar.', 'Tap a place for its details, what is on, and the Go here button.', 'Tick who goes with you; the others stay and carry on.', 'Use Go home on the map when you are done.'],
  },
  {
    id: 'floors', title: 'Floors',
    text: 'Use the Floor arrows to change level; floors above the chosen one are hidden. In Build mode an empty floor opens above the top one.',
    steps: ['Use the Floor up and down buttons beside the camera buttons.', 'In Build mode, step up to an empty floor to build on it.', 'Upper floors need support below; balconies reach up to two tiles out.', 'Place stairs to let people walk between floors.'],
  },
  {
    id: 'saving', title: 'Saving',
    text: 'Open the Menu and choose Save game to keep your progress in one of five named slots. There is also an autosave and a downloadable backup.',
    steps: ['Open the Menu and choose Save game, then pick a slot.', 'The game also autosaves; Load game shows autosave and backup too.', 'Download a backup file to keep a copy outside the browser.', 'Import a world file to restore one; your current game stays if the file has problems.'],
  },
];

const IDS: ReadonlySet<string> = new Set(HINTS.map((h) => h.id));

export function isHintId(id: string): id is HintId { return IDS.has(id); }

export function hintDef(id: HintId): HintDef { return HINTS.find((h) => h.id === id)!; }

export function isSeen(seen: readonly string[], id: HintId): boolean { return seen.includes(id); }

/** Returns a new list with the id added (the same list when it was already there). */
export function markSeen(seen: readonly string[], id: HintId): string[] { return seen.includes(id) ? (seen as string[]) : [...seen, id]; }

/** How many known hints are seen, and how many there are. */
export function progress(seen: readonly string[]): { seen: number; total: number } {
  return { seen: HINTS.filter((h) => seen.includes(h.id)).length, total: HINTS.length };
}

/**
 * The next hint to show: the first of `pending` (in request order) that is not seen yet. Returns null when hints are off,
 * when one is already showing, or when nothing is waiting.
 */
export function pickNext(o: { enabled: boolean; seen: readonly string[]; pending: readonly HintId[]; showing: HintId | null }): HintId | null {
  if (!o.enabled || o.showing) return null;
  return o.pending.find((id) => !o.seen.includes(id)) ?? null;
}

/** Adds a request to the pending list unless hints are off, the hint is seen, showing or already waiting. */
export function enqueue(o: { enabled: boolean; seen: readonly string[]; pending: readonly HintId[]; showing: HintId | null }, id: HintId): HintId[] {
  if (!o.enabled || o.seen.includes(id) || o.showing === id || o.pending.includes(id)) return [...o.pending];
  return [...o.pending, id];
}
