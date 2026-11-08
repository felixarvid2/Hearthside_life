// Milestone 11.5 task S: where the screens of the furniture models are.
//
// Every entry was measured from the GLB itself (node script dev/ds-tasks/m115/measure-screens.mjs):
// the screen is the large front-facing quad on the model's glass face. Coordinates are in the
// definition's rot-0 local space (metres, origin at the footprint's min corner, +z = the front),
// i.e. AFTER `def.model` scale/yaw/offset, so the renderer can place a quad on the object group.
//
// `centre` is the middle of the glass; the renderer moves the quad `offset` metres along `facing`
// so it floats just in front of the actual glass and never z-fights. `facing` is a unit normal
// pointing out of the screen (the computer and laptop screens are tilted back a little).

// Milestone 10: designs with `screen: true` (types.ts ObjectDef.screen) are not measured by hand. Their model has an
// `anim:screen` part (tools/furniture-extra kit.mjs), the build measures its largest front face into
// src/content/objectsM10/<group>.models.ts, and `deriveScreen` maps that model-space rectangle through the def's
// fit transform exactly like the hand-measured entries below. A hand-measured entry in SCREENS wins.

import { OBJECTS } from './objects';
import { M10_MODELS } from './objectsM10';
import type { M10ScreenQuad } from './objectsM10/modelInfo';
import type { ObjectDef } from './types';

export type ScreenKind = 'computer' | 'tv';

export interface ScreenDef {
  defId: string;
  kind: ScreenKind;
  /** Centre of the glass in rot-0 local space. */
  centre: [number, number, number];
  /** Width and height of the picture (metres, along the screen's own axes). */
  width: number;
  height: number;
  /** Unit normal pointing out of the glass (rot-0 local space). */
  facing: [number, number, number];
  /** How far in front of the glass the picture quad floats (metres). */
  offset: number;
}

const dot = (a: [number, number, number], b: [number, number, number]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale3 = (a: [number, number, number], s: number): [number, number, number] => [a[0] * s, a[1] * s, a[2] * s];
/** Unit normal from an unnormalised one (kept here so the table stays readable). */
export const unit = (v: [number, number, number]): [number, number, number] => scale3(v, 1 / Math.sqrt(Math.max(1e-12, dot(v, v))));

/**
 * Screen rectangles per object definition. Measured (front-facing glass quad, model space) then
 * mapped through the def's fit transform:
 *   televisionModern: quad x -0.334..0.334, y 0.0779..0.4464, z 0.0214; fit scale 1.4, offset (0.5, 0, 0.5)
 *   televisionVintage: quad x 0.0345..0.2674, y 0.0618..0.2082, z -0.02; fit scale 2, offset (0.09, 0, 0.77)
 *   computerScreen: quad x 0.0068..0.3859, y 0.0556..0.287, z -0.0683..-0.0358 (tilted);
 *     fit scale 2, offset (0.1073, 0, 0.604)
 *   laptop: quad x 0.0177..0.2463, y 0.0294..0.1456, z -0.2208..-0.1688 (tilted); fit scale 1.5,
 *     offset (0.302, 0, 0.6801)
 */
export const SCREENS: Record<string, ScreenDef> = {
  'tv-flatscreen': {
    defId: 'tv-flatscreen',
    kind: 'tv',
    centre: [0.5, 0.3671, 0.53],
    width: 0.9352,
    height: 0.5159,
    facing: [0, 0, 1],
    offset: 0.006,
  },
  'tv-vintage': {
    defId: 'tv-vintage',
    kind: 'tv',
    centre: [0.3919, 0.27, 0.73],
    width: 0.4658,
    height: 0.2928,
    facing: [0, 0, 1],
    offset: 0.006,
  },
  'computer-desktop': {
    defId: 'computer-desktop',
    kind: 'computer',
    centre: [0.5, 0.3426, 0.4999],
    width: 0.7582,
    height: 0.4674,
    facing: unit([0, 0.14, 0.99]),
    offset: 0.006,
  },
  laptop: {
    defId: 'laptop',
    kind: 'computer',
    centre: [0.5, 0.1313, 0.3879],
    width: 0.3429,
    height: 0.1909,
    facing: unit([0, 0.41, 0.91]),
    offset: 0.004,
  },
};

/** How far in front of the glass the derived picture floats (metres). */
const DERIVED_OFFSET = 0.005;

/**
 * The picture rectangle of a design with `screen: true`: the model-space quad of its `anim:screen` part through the def's
 * model transform (T * R * S, see content/objects.ts fit()). Undefined when the model has no measured screen.
 */
export function deriveScreen(def: Pick<ObjectDef, 'id' | 'model' | 'tags' | 'interactions'>, quad: M10ScreenQuad | undefined = M10_MODELS[def.model.asset]?.screen): ScreenDef | undefined {
  if (!quad) return undefined;
  const { scale, yaw, offset } = def.model;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // three.js rotation about +y: x' = x cos + z sin, z' = -x sin + z cos
  const rot = (v: [number, number, number]): [number, number, number] => [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
  const [cx, cy, cz] = rot(quad.centre);
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  const tv = def.tags.includes('tv') || def.interactions.includes('watchTv');
  return {
    defId: def.id,
    kind: tv ? 'tv' : 'computer',
    centre: [r4(cx * scale + offset[0]), r4(cy * scale + offset[1]), r4(cz * scale + offset[2])],
    width: r4(quad.width * scale),
    height: r4(quad.height * scale),
    facing: unit(rot(quad.normal)),
    offset: DERIVED_OFFSET,
  };
}

let derived: Map<string, ScreenDef> | null = null;

/** Screens derived from the catalog's `screen: true` designs, by def id. */
export function derivedScreens(): ReadonlyMap<string, ScreenDef> {
  if (!derived) {
    derived = new Map();
    for (const def of OBJECTS) {
      if (!def.screen || SCREENS[def.id]) continue;
      const screen = deriveScreen(def);
      if (screen) derived.set(def.id, screen);
    }
  }
  return derived;
}

export function screenFor(defId: string): ScreenDef | undefined {
  return SCREENS[defId] ?? derivedScreens().get(defId);
}

// ---------------------------------------------------------------------------------------------
// What a screen shows
// ---------------------------------------------------------------------------------------------

/**
 * Picture modes a screen can show. 'desktop' is the generic fallback for computer use we do not
 * have a special picture for (the task's "unknown -> generic desktop").
 */
export type ScreenMode = 'document' | 'code' | 'game' | 'web' | 'tv' | 'desktop';

/**
 * Interaction id -> picture mode. Every computer/TV interaction in content/interactions.ts is
 * listed (phone interactions are included too: they never render on a screen object, but the
 * mapping is complete), and anything unknown falls back to the generic desktop.
 */
export const SCREEN_MODE_BY_INTERACTION: Readonly<Record<string, ScreenMode>> = {
  // Word processor: writing prose.
  writeArticle: 'document',
  writeBook: 'document',
  writeJournal: 'document',
  writePaper: 'document',
  // Writing homework at a computer also fills a page.
  doHomework: 'document',
  studyHard: 'document',
  sketchIdeas: 'document',
  // Code editor with a terminal.
  practiceProgramming: 'code',
  programGig: 'code',
  // A little animated game.
  playComputerGames: 'game',
  playChess: 'game',
  // These use the sitting/computer animation but are not screen furniture (piano, sketchbook);
  // they are listed so the mapping covers every 'computer' animation in the content.
  playPiano: 'desktop',
  busk: 'desktop',
  // Web pages and menus: job listings, adoption, research, phone/bill screens.
  jobSearch: 'web',
  adoptOnline: 'web',
  phoneAdopt: 'web',
  researchOnline: 'web',
  phoneChat: 'web',
  phoneInvite: 'web',
  phoneDate: 'web',
  phoneBills: 'web',
  phoneMap: 'web',
  phoneJobs: 'web',
  planEvent: 'web',
  callRepairperson: 'web',
  // Television.
  watchTv: 'tv',
};

/** The picture mode for an interaction; unknown computer/TV use shows the generic desktop. */
export function screenModeFor(interactionId: string): ScreenMode {
  return SCREEN_MODE_BY_INTERACTION[interactionId] ?? 'desktop';
}

/**
 * Interactions that put a picture on a screen when the object offers them. Used by the content
 * test: every def tagged 'computer'/'tv' (or offering watchTv/playComputerGames) must have a
 * measured screen rectangle above.
 */
export const SCREEN_INTERACTIONS: readonly string[] = [
  'watchTv',
  'playComputerGames',
  'practiceProgramming',
  'programGig',
  'writeArticle',
  'writeBook',
  'writePaper',
  'jobSearch',
  'adoptOnline',
  'researchOnline',
];

export function defWantsScreen(def: {
  id: string;
  tags: readonly string[];
  interactions: readonly string[];
}): boolean {
  return def.tags.includes('computer') || def.tags.includes('tv')
    || def.interactions.includes('watchTv') || def.interactions.includes('playComputerGames');
}
