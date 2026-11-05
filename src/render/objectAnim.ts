// Milestone 11.5, task D: moving parts and "in use" states for furniture and appliances.
//
// Everything here is derived from the running actions (`objectUses`) and the person's current anim: no save fields.
// Doors and lids that are separate GLB nodes are pivoted around their node origin (objectAssets keeps those nodes as
// `part:<name>` groups). Assets without a door node get a code-built overlay panel, flush with the front face and in
// the model's material, that swings away to reveal a code-built interior (fridge cavity, oven racks and glow,
// wardrobe rail, dishwasher racks). Running effects (hob rings, pot, steam, shower water, bath water, tap stream) are
// built lazily on first use and shared where possible.
//
// Openness is a pure function of game time: each part keeps a small eased tween { from, to, since, duration }.
// Timings are in game minutes (0.4 min = 0.4 s at normal speed); the frame loop advances `now` with the simulation
// clock, so at 3x the same tween is over three times faster in real time. Reduced motion snaps instead of tweening.

import * as THREE from 'three';
import { OBJECTS, fittedBounds, type LocalBox } from '../content/objects';
import type { AnimHobSpec, AnimKind, ContentDB, InteriorKind, ObjectDef, PartAxis, PartRole } from '../content/types';
import type { ObjectUse } from './objectUse';

// ---------------------------------------------------------------------------------------------
// Descriptors
// ---------------------------------------------------------------------------------------------

// The vocabulary lives in content/types.ts (ObjectDef.anim uses it); re-exported here for the renderer.
export type { AnimKind, InteriorKind, PartAxis, PartRole };

export interface PartTiming {
  /** Game minutes for a full opening / closing tween. */
  openMinutes: number;
  closeMinutes: number;
}

interface PartBase extends PartTiming {
  role: PartRole;
  axis: PartAxis;
  /** Signed open angle in radians (the sign picks which way the door swings). */
  angle: number;
}

/**
 * A separate GLB node, kept as a pivot by ObjectAssets (`PART_NODES`, or any `anim:*` node). It turns by `angle` around
 * `axis` through its node origin and/or slides by `slide` (fitted metres, rot-0 local space) when fully open. The static
 * roles 'interior' (shown while something is open) and 'screen' do neither.
 */
export interface NodePart extends PartBase {
  kind: 'node';
  node: string;
  slide?: [number, number, number];
}

/**
 * A code-built panel for an asset without a separate door node. Hinge and size are fractions of the fitted model
 * box, so the same descriptor works for every def that uses the asset.
 */
export interface OverlayPart extends PartBase {
  kind: 'overlay';
  /** Hinge point: [fx, fy, fz] in 0..1 of the fitted box (fx/fy are the panel's lower-left corner). */
  hinge: [number, number, number];
  /** Panel size: [fx, fy, fz] of the fitted box (depth is the panel thickness). */
  size: [number, number, number];
  /** Source material name to copy, so the closed panel matches the model. */
  material: string;
  /** Optional dark pane on the outside (oven doors). */
  glass?: boolean;
}

export type PartSpec = NodePart | OverlayPart;

/** Interior box as fractions of the fitted box: [x0, y0, z0, x1, y1, z1]. */
export type InteriorBox = [number, number, number, number, number, number];

export interface AnimDescriptor {
  defId: string;
  asset: string;
  kind: AnimKind;
  parts: PartSpec[];
  interior?: InteriorKind;
  interiorBox?: InteriorBox;
  /** Cooking surface on top (stoves): four rings and a pot. */
  hob?: boolean;
  /** Where the rings and the pot are (content-declared hobs); absent = the default four rings in a 2 x 2 grid. */
  hobLayout?: AnimHobSpec;
  /** Tap stream anchor as fractions: x across, z from back, top/bottom heights of the fitted box. */
  tap?: { x: number; z: number; top: number; bottom: number };
  /** Minutes at the start and end of a run in which a fold-down door is open (dishwashers). */
  pulseMinutes?: number;
  /** openWhileUsed: interaction ids that open the parts (any interaction when absent). */
  on?: readonly string[];
}

const T = 0.4;

function node(role: PartRole, name: string, axis: PartAxis, angle: number, timing: PartTiming = { openMinutes: T, closeMinutes: T }): NodePart {
  return { kind: 'node', role, node: name, axis, angle, ...timing };
}

function overlay(
  role: PartRole, hinge: [number, number, number], size: [number, number, number], axis: PartAxis, angle: number,
  material: string, glass = false, timing: PartTiming = { openMinutes: T, closeMinutes: T },
): OverlayPart {
  return { kind: 'overlay', role, hinge, size, axis, angle, material, glass, ...timing };
}

// Default interiors (fractions of the fitted box). z points forward: 1 is the front face, and the use slot /
// approach tile is always on that +z side (see `useFront` in content/objects.ts). The catalog's appliance bodies
// are closed boxes whose front face sits at the fitted front, so the cavity of an appliance with a separate door
// has to start at (or just in front of) z = 1 to be visible once the door swings away; a wardrobe's body is open
// at the front, so its interior sits just behind it.
const INTERIOR_BOX: Record<InteriorKind, InteriorBox> = {
  fridge: [0.06, 0.10, 0.92, 0.94, 0.75, 1.0],
  oven: [0.08, 0.02, 1.0, 0.92, 0.62, 1.02],
  wardrobe: [0.05, 0.05, 0.93, 0.95, 0.93, 1.0],
  dishwasher: [0.05, 0.05, 1.0, 0.95, 0.92, 1.02],
  washer: [0.10, 0.10, 0.90, 0.90, 0.90, 0.99],
};

export const DESCRIPTORS: readonly AnimDescriptor[] = [
  // --- fridges -------------------------------------------------------------------------------
  {
    defId: 'fridge-standard', asset: 'kitchenFridge', kind: 'fridge',
    parts: [node('door', 'doorFridge', 'y', -1.75)],
    interior: 'fridge', interiorBox: [0.07, 0.10, 0.92, 0.93, 0.75, 1.0],
  },
  {
    defId: 'fridge-side-by-side', asset: 'kitchenFridgeLarge', kind: 'fridge',
    parts: [node('door', 'doorLeft', 'y', -1.7), node('door2', 'doorRight', 'y', 1.7)],
    interior: 'fridge', interiorBox: [0.03, 0.10, 0.92, 0.97, 0.97, 1.0],
  },
  {
    defId: 'fridge-compact', asset: 'kitchenFridgeSmall', kind: 'fridge',
    parts: [node('door', 'doorFridge', 'y', -1.75)],
    interior: 'fridge', interiorBox: [0.07, 0.15, 0.92, 0.93, 0.95, 1.0],
  },
  {
    defId: 'fridge-built-in', asset: 'kitchenFridgeBuiltIn', kind: 'fridge',
    parts: [node('door', 'doorFridge', 'y', -1.75)],
    interior: 'fridge', interiorBox: [0.07, 0.13, 0.92, 0.93, 0.76, 1.0],
  },

  // --- stoves and ovens ----------------------------------------------------------------------
  {
    defId: 'stove-basic', asset: 'kitchenStove', kind: 'oven', hob: true,
    parts: [node('oven', 'door', 'x', 1.35, { openMinutes: 0.5, closeMinutes: 0.5 })],
    interior: 'oven', interiorBox: [0.08, 0.02, 1.0, 0.92, 0.62, 1.02],
  },
  {
    defId: 'stove-electric', asset: 'kitchenStoveElectric', kind: 'oven', hob: true,
    parts: [overlay('oven', [0.05, 0.10, 1.0], [0.90, 0.52, 0.03], 'x', 1.35, 'metal', true, { openMinutes: 0.5, closeMinutes: 0.5 })],
    interior: 'oven', interiorBox: [0.08, 0.02, 0.94, 0.92, 0.62, 1.005],
  },
  {
    defId: 'bread-oven', asset: 'breadOven', kind: 'oven', hob: false,
    parts: [overlay('oven', [0.06, 0.28, 1.0], [0.88, 0.58, 0.03], 'x', 1.3, 'metalDark', true, { openMinutes: 0.5, closeMinutes: 0.5 })],
    interior: 'oven', interiorBox: [0.10, 0.28, 1.0, 0.90, 0.84, 1.02],
  },

  // --- wardrobe ------------------------------------------------------------------------------
  {
    defId: 'wardrobe-tall', asset: 'bookcaseClosedDoors', kind: 'wardrobe',
    parts: [node('door', 'doorLeft', 'y', -1.9), node('door2', 'doorRight', 'y', 1.9)],
    interior: 'wardrobe', interiorBox: [0.05, 0.05, 0.93, 0.95, 0.93, 0.995],
  },

  // --- bathroom ------------------------------------------------------------------------------
  { defId: 'toilet-basic', asset: 'toilet', kind: 'toilet', parts: [node('lid', 'cover', 'x', -1.85)] },
  { defId: 'toilet-square', asset: 'toiletSquare', kind: 'toilet', parts: [node('lid', 'Group', 'x', -1.85)] },
  { defId: 'shower-stall', asset: 'shower', kind: 'shower', parts: [] },
  { defId: 'shower-round', asset: 'showerRound', kind: 'shower', parts: [] },
  { defId: 'bathtub', asset: 'bathtub', kind: 'bath', parts: [] },
  { defId: 'counter-sink', asset: 'kitchenSink', kind: 'sink', parts: [], tap: { x: 0.5, z: 0.24, top: 0.86, bottom: 0.70 } },
  { defId: 'bathroom-sink', asset: 'bathroomSink', kind: 'sink', parts: [], tap: { x: 0.5, z: 0.20, top: 0.88, bottom: 0.74 } },
  { defId: 'bathroom-sink-square', asset: 'bathroomSinkSquare', kind: 'sink', parts: [], tap: { x: 0.5, z: 0.18, top: 0.90, bottom: 0.78 } },
  { defId: 'vanity-basin', asset: 'bathroomCabinetDrawer', kind: 'sink', parts: [], tap: { x: 0.5, z: 0.34, top: 0.96, bottom: 0.84 } },

  // --- kitchen appliances --------------------------------------------------------------------
  {
    defId: 'dishwasher', asset: 'dishwasher', kind: 'dishwasher', pulseMinutes: 0.8,
    parts: [overlay('door', [0.02, 0.05, 1.0], [0.96, 0.82, 0.03], 'x', 1.4, 'metalLight')],
    interior: 'dishwasher', interiorBox: [0.05, 0.05, 1.0, 0.95, 0.92, 1.02],
  },
  { defId: 'microwave', asset: 'kitchenMicrowave', kind: 'microwave', parts: [node('door', 'Group', 'y', -1.9)] },
  {
    defId: 'washing-machine', asset: 'washer', kind: 'laundry',
    parts: [node('door', 'washerDoor', 'y', -1.9)], interior: 'washer',
  },
  { defId: 'tumble-dryer', asset: 'dryer', kind: 'laundry', parts: [node('door', 'dryerDoor', 'y', -1.9)] },
];

const BY_DEF = new Map(DESCRIPTORS.map((d) => [d.defId, d]));

const FROM_CONTENT = new WeakMap<ObjectDef, AnimDescriptor>();

/** The descriptor of a design that declares its animation in content (`ObjectDef.anim`), or null. */
function descriptorFromContent(def: ObjectDef): AnimDescriptor | null {
  const a = def.anim;
  if (!a) return null;
  let d = FROM_CONTENT.get(def);
  if (!d) {
    d = {
      defId: def.id, asset: def.model.asset, kind: a.kind, interior: a.interior, interiorBox: a.interiorBox, on: a.on,
      ...(a.tap ? { tap: a.tap } : {}), ...(a.hob ? { hob: true, hobLayout: a.hob } : {}),
      parts: a.parts.map((p): NodePart => ({
        kind: 'node', role: p.role, node: p.node, axis: p.axis ?? 'y', angle: p.angle ?? 0, slide: p.slide,
        openMinutes: p.openMinutes ?? T, closeMinutes: p.closeMinutes ?? T,
      })),
    };
    FROM_CONTENT.set(def, d);
  }
  return d;
}

/** The descriptor of a design: the table above first, then the design's own `anim` field. */
export function descriptorForDef(def: ObjectDef): AnimDescriptor | null {
  return BY_DEF.get(def.id) ?? descriptorFromContent(def);
}

let contentById: Map<string, ObjectDef> | null = null;

/** By id: the table first, then the catalog's content-declared animations. */
export function descriptorFor(defId: string): AnimDescriptor | null {
  const t = BY_DEF.get(defId);
  if (t) return t;
  if (!contentById) contentById = new Map(OBJECTS.map((o) => [o.id, o]));
  const def = contentById.get(defId);
  return def ? descriptorFromContent(def) : null;
}

/** Descriptors of every animated design in `objects` (the table's, then the content-declared ones). */
export function allDescriptors(objects: readonly ObjectDef[] = OBJECTS): AnimDescriptor[] {
  const out = [...DESCRIPTORS];
  for (const o of objects) if (!BY_DEF.has(o.id)) { const d = descriptorFromContent(o); if (d) out.push(d); }
  return out;
}

/** Every def this module knows how to animate (used by the unit test that checks the catalog). */
export const ANIMATED_DEF_IDS: readonly string[] = DESCRIPTORS.map((d) => d.defId);

// ---------------------------------------------------------------------------------------------
// Pure: which parts are wanted open / running at this instant
// ---------------------------------------------------------------------------------------------

export type PartFlag = 'door' | 'door2' | 'lid' | 'ovenDoor' | 'drawer' | 'drawer2' | 'burners' | 'pan' | 'steam' | 'shower' | 'bath' | 'tap' | 'light' | 'drum';

export interface Activation {
  on: boolean;
  /** Game minute the driving anim started (for loading in the middle of an action). */
  since: number;
}

export type ActiveParts = Record<PartFlag, Activation>;

function off(): Activation { return { on: false, since: 0 }; }

export function blankParts(): ActiveParts {
  return {
    door: off(), door2: off(), lid: off(), ovenDoor: off(), drawer: off(), drawer2: off(), burners: off(), pan: off(), steam: off(),
    shower: off(), bath: off(), tap: off(), light: off(), drum: off(),
  };
}

/** Which switch drives a role; the static roles ('interior', 'screen') have none. */
const FLAG_FOR_ROLE: Record<PartRole, PartFlag | null> = {
  door: 'door', door2: 'door2', lid: 'lid', oven: 'ovenDoor', drawer: 'drawer', drawer2: 'drawer2', interior: null, screen: null,
};

/** Recipe data marks a bake (`skill: 'baking'`); cookMeal only accepts non-baking recipes. */
export function isBakedRecipe(content: ContentDB, use: ObjectUse | null): boolean {
  const id = use?.data?.recipeId;
  return typeof id === 'string' && content.recipes[id]?.skill === 'baking';
}

function first(uses: readonly ObjectUse[], pred: (u: ObjectUse) => boolean): ObjectUse | null {
  for (const u of uses) if (pred(u)) return u;
  return null;
}

const PART_FLAGS: readonly PartFlag[] = [
  'door', 'door2', 'lid', 'ovenDoor', 'drawer', 'drawer2', 'burners', 'pan', 'steam', 'shower', 'bath', 'tap', 'light', 'drum',
];

const OPEN_WHILE_USED: readonly PartFlag[] = ['door', 'door2', 'lid', 'drawer', 'drawer2'];

/** Clears a reusable record in place, so the runtime can keep one record per object instead of allocating per frame. */
function resetParts(p: ActiveParts): void {
  for (const k of PART_FLAGS) {
    const a = p[k];
    a.on = false;
    a.since = 0;
  }
}

function setPart(out: ActiveParts, flag: PartFlag, u: ObjectUse | null): void {
  const a = out[flag];
  a.on = !!u;
  a.since = u ? u.animSince : 0;
}

/**
 * The parts of `desc` that should be open/running right now. `uses` are the ObjectUse entries recorded for this
 * placed object (target or station). Pure: unit-tested without a renderer. Pass `out` to reuse a record.
 */
export function activeParts(
  desc: AnimDescriptor, uses: readonly ObjectUse[], content: ContentDB, out: ActiveParts = blankParts(),
): ActiveParts {
  resetParts(out);
  switch (desc.kind) {
    case 'fridge': {
      // The door follows the reach-in animation; cookMeal's stage 0 is the whole fridge stage.
      const u = first(uses, (x) => x.anim === 'openFridge' || (x.interactionId === 'cookMeal' && x.stage === 0));
      setPart(out, 'door', u);
      // Side-by-side/wardrobe style second leaf: open together when the descriptor has one.
      setPart(out, 'door2', desc.parts.some((p) => p.role === 'door2') ? u : null);
      setPart(out, 'drawer', u); // freezer drawers open with the door (no drawer part: nothing moves)
      setPart(out, 'drawer2', u);
      setPart(out, 'light', u);
      break;
    }
    case 'oven': {
      const cook = first(uses, (x) => (x.interactionId === 'cookMeal' && x.stage === 1) || x.interactionId === 'bakeTreat');
      const hob = desc.hob === true && cook?.interactionId === 'cookMeal';
      setPart(out, 'burners', hob ? cook : null);
      setPart(out, 'pan', hob ? cook : null);
      setPart(out, 'steam', hob ? cook : null);
      setPart(out, 'light', cook);
      const pulse = desc.pulseMinutes ?? 0.8;
      setPart(out, 'ovenDoor', cook && isBakedRecipe(content, cook) && cook.elapsed < pulse ? cook : null);
      break;
    }
    case 'wardrobe': {
      const u = first(uses, (x) => x.interactionId === 'changeOutfit' || x.interactionId === 'editOutfits');
      setPart(out, 'door', u);
      setPart(out, 'door2', desc.parts.some((p) => p.role === 'door2') ? u : null);
      setPart(out, 'drawer', u);
      setPart(out, 'drawer2', u);
      break;
    }
    case 'toilet': {
      setPart(out, 'lid', first(uses, (x) => x.interactionId === 'useToilet'));
      break;
    }
    case 'shower': {
      setPart(out, 'shower', first(uses, (x) => x.interactionId === 'takeShower' && x.phase === 'perform'));
      // a glass door (if the model has one) stands open while the person steps in and out, shut while the water runs
      setPart(out, 'door', first(uses, (x) => x.interactionId === 'takeShower' && x.phase !== 'perform'));
      break;
    }
    case 'bath': {
      setPart(out, 'bath', first(uses, (x) => x.interactionId === 'takeBath' && x.phase === 'perform'));
      setPart(out, 'door', first(uses, (x) => x.interactionId === 'takeBath' && x.phase !== 'perform'));
      break;
    }
    case 'sink': {
      const u = first(uses, (x) => x.interactionId === 'washHands' || (x.interactionId === 'washDishes' && x.stage === 1));
      setPart(out, 'tap', u);
      break;
    }
    case 'dishwasher': {
      const u = first(uses, (x) => x.interactionId === 'washDishes' && x.stage === 1);
      const pulse = desc.pulseMinutes ?? 0.8;
      const nearEnd = u?.duration != null && u.duration > 0 && u.elapsed > u.duration - pulse;
      setPart(out, 'door', u && (u.elapsed < pulse || nearEnd) ? u : null);
      setPart(out, 'light', u);
      break;
    }
    case 'microwave': {
      const u = first(uses, () => true);
      setPart(out, 'door', u);
      setPart(out, 'light', u);
      break;
    }
    case 'laundry': {
      const u = first(uses, () => true);
      setPart(out, 'door', u);
      setPart(out, 'lid', u); // top-loaders: a hinged lid instead of a front door
      setPart(out, 'drum', u);
      setPart(out, 'light', u);
      break;
    }
    case 'openWhileUsed': {
      // Cabinets, chests of drawers, lidded boxes: every door, lid and drawer is open while someone uses the object.
      const on = desc.on;
      const u = first(uses, (x) => !on || on.includes(x.interactionId));
      for (const flag of OPEN_WHILE_USED) setPart(out, flag, u);
      setPart(out, 'light', u);
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Pure: openness tween
// ---------------------------------------------------------------------------------------------

export interface OpenMotion {
  from: number;
  to: number;
  /** Game minute the tween started. */
  since: number;
  /** Game minutes the tween lasts (0 = already there). */
  duration: number;
  active: boolean;
}

export const CLOSED_MOTION: OpenMotion = { from: 0, to: 0, since: 0, duration: 0, active: false };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Smoothstep: an ease-in-out that is exactly 0 at 0 and 1 at 1. */
export function ease(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** 0..1 openness of a motion at game minute `now`. Reduced motion reads the target directly. */
export function opennessAt(m: OpenMotion, now: number, reducedMotion = false): number {
  if (reducedMotion) return m.to;
  if (m.duration <= 0) return m.to;
  return m.from + (m.to - m.from) * ease((now - m.since) / m.duration);
}

/** A motion that is already part-way open because the object appeared during an action (mid-action load). */
export function seedMotion(active: boolean, activeSince: number, now: number, timing: PartTiming, reducedMotion = false): OpenMotion {
  if (!active) return CLOSED_MOTION;
  if (reducedMotion) return { from: 1, to: 1, since: now, duration: 0, active: true };
  if (now >= activeSince + timing.openMinutes) return { from: 1, to: 1, since: now, duration: 0, active: true };
  return { from: 0, to: 1, since: activeSince, duration: timing.openMinutes, active: true };
}

/**
 * Advances a motion towards `active`. Returns the same object while the target does not change, so the original
 * tween timestamps are kept (calling this every frame does not slow the tween down).
 */
export function stepMotion(m: OpenMotion, active: boolean, now: number, timing: PartTiming, reducedMotion = false): OpenMotion {
  if (reducedMotion) return { from: active ? 1 : 0, to: active ? 1 : 0, since: now, duration: 0, active };
  if (m.active === active) return m; // already heading there: keep the tween timestamps (and allocate nothing)
  const current = opennessAt(m, now, false);
  const target = active ? 1 : 0;
  const distance = Math.abs(target - current);
  const minutes = active ? timing.openMinutes : timing.closeMinutes;
  return { from: current, to: target, since: now, duration: Math.max(0, distance * minutes), active };
}

// ---------------------------------------------------------------------------------------------
// Runtime (three.js)
// ---------------------------------------------------------------------------------------------

const AXES: Record<PartAxis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
const RING_GEO = new THREE.TorusGeometry(1, 0.13, 6, 20).rotateX(-Math.PI / 2);

const DARK = new THREE.MeshStandardMaterial({ color: 0x1b1f22, roughness: 0.92 });
const SHELF = new THREE.MeshStandardMaterial({ color: 0x46525a, roughness: 0.7, metalness: 0.2 });
const RACK = new THREE.MeshStandardMaterial({ color: 0x626a6e, roughness: 0.6, metalness: 0.4 });
const COOL = new THREE.MeshBasicMaterial({ color: 0xbfe9ff });
const FOOD_COLOURS = [0xd9a441, 0xc8553d, 0x8fae4a, 0xe0c07a, 0xb5653a, 0x7aa3c8];
const FOOD_MATS = FOOD_COLOURS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
const CLOTH_COLOURS = [0x5b84dd, 0xc8553d, 0x8fa98b, 0xd4a33b];
const CLOTH_MATS = CLOTH_COLOURS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }));
const PAN_MAT = new THREE.MeshStandardMaterial({ color: 0x35393c, roughness: 0.55, metalness: 0.5 });
const GLASS_PANE = new THREE.MeshStandardMaterial({ color: 0x1f2a2e, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.82 });
const FALLBACK_PANEL = new THREE.MeshStandardMaterial({ color: 0xbdd2d6, roughness: 0.5, metalness: 0.2 });

let softTexture: THREE.Texture | null | undefined;
/** Soft round sprite texture for steam/haze (null without a DOM). */
function softSpriteTexture(): THREE.Texture | null {
  if (softTexture !== undefined) return softTexture;
  if (typeof document === 'undefined') { softTexture = null; return null; }
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const c = cv.getContext('2d');
  if (!c) { softTexture = null; return null; }
  const g = c.createRadialGradient(16, 16, 1, 16, 16, 15);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 32, 32);
  softTexture = new THREE.CanvasTexture(cv);
  return softTexture;
}

function materialNamed(model: THREE.Object3D | null, name: string): THREE.Material | null {
  if (!model) return null;
  let found: THREE.Material | null = null;
  model.traverse((o) => {
    if (found) return;
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.Material | THREE.Material[];
    if (Array.isArray(mat)) return;
    if (mat.name === name) found = mat;
  });
  return found;
}

function frac(box: LocalBox, f: [number, number, number]): [number, number, number] {
  return [box.x0 + f[0] * (box.x1 - box.x0), box.y0 + f[1] * (box.y1 - box.y0), box.z0 + f[2] * (box.z1 - box.z0)];
}

function partBox(box: LocalBox, f: InteriorBox): { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number } {
  const [ax, ay, az, bx, by, bz] = f;
  return {
    x0: box.x0 + Math.min(ax, bx) * (box.x1 - box.x0),
    x1: box.x0 + Math.max(ax, bx) * (box.x1 - box.x0),
    y0: box.y0 + Math.min(ay, by) * (box.y1 - box.y0),
    y1: box.y0 + Math.max(ay, by) * (box.y1 - box.y0),
    z0: box.z0 + Math.min(az, bz) * (box.z1 - box.z0),
    z1: box.z0 + Math.max(az, bz) * (box.z1 - box.z0),
  };
}

interface PartRuntime {
  flag: PartFlag;
  pivot: THREE.Object3D;
  axis: PartAxis;
  angle: number;
  timing: PartTiming;
  motion: OpenMotion;
  /** Node parts store their rest rotation; overlays start at identity. */
  base: THREE.Quaternion;
  /** Sliding parts: rest position and the pivot-local translation when fully open. */
  basePos: THREE.Vector3;
  slide: THREE.Vector3 | null;
}

interface InteriorRuntime {
  group: THREE.Group;
  flags: PartFlag[];
  glow: THREE.MeshStandardMaterial | null;
}

interface EffectRuntime {
  group: THREE.Group;
  rings: THREE.Mesh[];
  ringMat: THREE.MeshStandardMaterial;
  pan: THREE.Group | null;
  steam: THREE.Sprite[];
  steamMat: THREE.SpriteMaterial | null;
  steamAnchor: THREE.Vector3;
  shower: THREE.Mesh[];
  haze: THREE.Sprite | null;
  bath: THREE.Mesh | null;
  tap: THREE.Mesh | null;
}

const NO_USES: readonly ObjectUse[] = [];

/**
 * Per placed object: owns pivots, overlays, interiors and effects. Created once per entry; `root` is added to the
 * object group in ObjectsView (object-local space, like the condition overlays).
 */
export class ObjectAnim {
  readonly root = new THREE.Group();
  private readonly desc: AnimDescriptor;
  private readonly box: LocalBox | null;
  private readonly parts: PartRuntime[] = [];
  private interior: InteriorRuntime | null = null;
  /** `anim:interior` nodes of the model: visible only while something is open. */
  private readonly interiorNodes: THREE.Object3D[] = [];
  private effects: EffectRuntime | null = null;
  private glowLevel = 0;
  private elapsed = 0;
  private lastNow = 0;
  private clockSeeded = false;
  private seeded = false;
  private readonly ownGeometries: THREE.BufferGeometry[] = [];
  private readonly ownMaterials: THREE.Material[] = [];
  /** Reused every frame: the active-part record and the quaternion scratch (no per-frame allocation). */
  private readonly acts: ActiveParts = blankParts();
  private readonly turn = new THREE.Quaternion();

  constructor(def: ObjectDef, model: THREE.Object3D | null, private readonly content: ContentDB) {
    this.root.name = 'object-anim';
    this.desc = descriptorForDef(def) ?? { defId: def.id, asset: def.model.asset, kind: 'microwave', parts: [] };
    this.box = fittedBounds(def.model);
    for (const spec of this.desc.parts) {
      if (spec.kind === 'node') {
        const pivot = model?.getObjectByName(`part:${spec.node}`);
        if (!pivot) continue;
        const flag = FLAG_FOR_ROLE[spec.role];
        if (!flag) {
          if (spec.role === 'interior') { pivot.visible = false; this.interiorNodes.push(pivot); }
          continue; // 'screen' is static
        }
        // slide is in fitted metres; the pivot lives in model space (scale, then yaw, applied by ObjectAssets.instance)
        const slide = spec.slide ? new THREE.Vector3(...spec.slide).applyAxisAngle(AXES.y, -def.model.yaw).multiplyScalar(1 / def.model.scale) : null;
        const baseArr = pivot.userData.baseQuaternion as number[] | undefined;
        const base = baseArr && baseArr.length === 4
          ? new THREE.Quaternion(baseArr[0]!, baseArr[1]!, baseArr[2]!, baseArr[3]!)
          : pivot.quaternion.clone();
        this.parts.push({ flag, pivot, axis: spec.axis, angle: spec.angle, timing: spec, motion: CLOSED_MOTION, base, basePos: pivot.position.clone(), slide });
      } else {
        const pivot = this.buildOverlay(spec, model);
        const flag = FLAG_FOR_ROLE[spec.role];
        if (pivot && flag) this.parts.push({ flag, pivot, axis: spec.axis, angle: spec.angle, timing: spec, motion: CLOSED_MOTION, base: new THREE.Quaternion(), basePos: pivot.position.clone(), slide: null });
      }
    }
  }

  get descriptor(): AnimDescriptor { return this.desc; }

  private buildOverlay(spec: OverlayPart, model: THREE.Object3D | null): THREE.Object3D | null {
    if (!this.box) return null;
    const w = (this.box.x1 - this.box.x0) * spec.size[0];
    const h = (this.box.y1 - this.box.y0) * spec.size[1];
    const t = Math.max(0.012, (this.box.z1 - this.box.z0) * spec.size[2]);
    const hinge = frac(this.box, spec.hinge);
    const pivot = new THREE.Group();
    pivot.name = `overlay:${spec.role}`;
    pivot.position.set(hinge[0], hinge[1], hinge[2]);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), materialNamed(model, spec.material) ?? FALLBACK_PANEL);
    panel.position.set(w / 2, h / 2, -t / 2 + 0.003);
    panel.castShadow = true;
    panel.receiveShadow = true;
    pivot.add(panel);
    this.ownGeometries.push(panel.geometry);
    if (spec.glass) {
      const glass = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, h * 0.42, 0.004), GLASS_PANE);
      glass.position.set(w * 0.52, h * 0.62, 0.003);
      pivot.add(glass);
      this.ownGeometries.push(glass.geometry);
    }
    this.root.add(pivot);
    return pivot;
  }

  /** Per-frame update. `now` is the game clock in minutes, `dt` real seconds. */
  update(uses: readonly ObjectUse[], now: number, dt: number, reducedMotion: boolean): void {
    const act = activeParts(this.desc, uses.length ? uses : NO_USES, this.content, this.acts);

    if (!this.seeded) {
      this.seeded = true;
      for (const p of this.parts) {
        const a = act[p.flag];
        p.motion = seedMotion(a.on, a.since, now, p.timing, reducedMotion);
      }
    } else {
      for (const p of this.parts) p.motion = stepMotion(p.motion, act[p.flag].on, now, p.timing, reducedMotion);
    }

    let doorOpen = 0;
    for (const p of this.parts) {
      const v = opennessAt(p.motion, now, reducedMotion);
      if (p.flag !== 'burners' && p.flag !== 'pan' && p.flag !== 'steam') doorOpen = Math.max(doorOpen, v);
      this.turn.setFromAxisAngle(AXES[p.axis], p.angle * v);
      p.pivot.quaternion.copy(p.base).premultiply(this.turn);
      if (p.slide) p.pivot.position.copy(p.basePos).addScaledVector(p.slide, v);
    }
    for (const n of this.interiorNodes) n.visible = doorOpen > 0.02;

    // Interiors are built lazily and only drawn while a door is actually open (closed appliances cost nothing).
    const wantsInterior = doorOpen > 0.02;
    if (wantsInterior && !this.interior && this.desc.interior && this.box) this.interior = this.buildInterior();
    if (this.interior) {
      this.interior.group.visible = wantsInterior;
      const glowOn = act.light.on || act.drum.on;
      this.glowLevel += ((glowOn ? 1.5 : 0) - this.glowLevel) * Math.min(1, dt * 6);
      if (this.interior.glow) this.interior.glow.emissiveIntensity = this.glowLevel;
    }

    // Water/steam phases follow the game clock (so they freeze while paused and speed up with the game), but the
    // game's 3x setting is 15 clock minutes per second: cap the rate at 3x real time so fast-forward still reads as
    // water rather than a teleporting blur. At 1x one game minute is one second, so this is exactly dt.
    const dGame = this.clockSeeded ? Math.max(0, Math.min(now - this.lastNow, dt * 3)) : 0;
    this.clockSeeded = true;
    this.lastNow = now;
    this.elapsed += dGame;
    this.updateEffects(act, dt, reducedMotion);
  }

  // ---- interiors --------------------------------------------------------------------------

  private buildInterior(): InteriorRuntime | null {
    const kind = this.desc.interior!;
    const box = partBox(this.box!, this.desc.interiorBox ?? INTERIOR_BOX[kind]);
    const w = box.x1 - box.x0, h = box.y1 - box.y0, d = box.z1 - box.z0;
    const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
    const g = new THREE.Group();
    g.name = `interior:${kind}`;
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      g.add(m);
      return m;
    };
    // dark cavity back and sides
    mesh(UNIT_BOX, DARK, cx, cy, box.z0 + 0.004, w, h, Math.max(0.01, d * 0.25));
    let glow: THREE.MeshStandardMaterial | null = null;
    if (kind === 'fridge') {
      for (const fy of [0.34, 0.64]) mesh(UNIT_BOX, SHELF, cx, box.y0 + fy * h, box.z0 + d * 0.55, w * 0.94, 0.012, d * 0.8);
      // a few groceries on the shelves
      for (let i = 0; i < 5; i++) {
        const yy = box.y0 + (i < 3 ? 0.34 : 0.64) * h + (i < 3 ? 0.04 : 0.04);
        mesh(UNIT_BOX, FOOD_MATS[i % FOOD_MATS.length]!, box.x0 + w * (0.18 + 0.16 * i), yy, box.z0 + d * 0.72, 0.07, 0.11 + (i % 2) * 0.05, 0.07);
      }
      mesh(UNIT_BOX, COOL, cx, box.y1 - 0.02, box.z0 + d * 0.3, w * 0.85, 0.012, 0.03);
    } else if (kind === 'oven') {
      glow = new THREE.MeshStandardMaterial({ color: 0x2a0f05, emissive: 0xff6a1a, emissiveIntensity: 0, roughness: 0.9 });
      this.ownMaterials.push(glow);
      mesh(UNIT_BOX, glow, cx, cy, box.z0 + 0.008, w * 0.92, h * 0.9, 0.008);
      for (const fy of [0.28, 0.62]) {
        const y = box.y0 + fy * h;
        for (let i = 0; i < 3; i++) mesh(UNIT_BOX, RACK, cx, y, box.z0 + d * (0.35 + 0.18 * i), w * 0.86, 0.008, 0.008);
        mesh(UNIT_BOX, RACK, box.x0 + w * 0.1, y, box.z0 + d * 0.5, 0.008, 0.008, d * 0.7);
        mesh(UNIT_BOX, RACK, box.x1 - w * 0.1, y, box.z0 + d * 0.5, 0.008, 0.008, d * 0.7);
      }
    } else if (kind === 'wardrobe') {
      mesh(UNIT_CYL, SHELF, cx, box.y0 + h * 0.82, box.z0 + d * 0.55, 0.012, w * 0.9, 0.012).rotation.z = Math.PI / 2;
      for (let i = 0; i < 4; i++) {
        const xx = box.x0 + w * (0.2 + 0.2 * i);
        mesh(UNIT_BOX, CLOTH_MATS[i % CLOTH_MATS.length]!, xx, box.y0 + h * 0.6, box.z0 + d * 0.55, 0.10, h * 0.32, 0.03);
      }
      mesh(UNIT_BOX, SHELF, cx, box.y0 + 0.05, box.z0 + d * 0.5, w * 0.9, 0.05, d * 0.85);
    } else if (kind === 'dishwasher' || kind === 'washer') {
      for (const fy of [0.3, 0.66]) {
        for (let i = 0; i < 3; i++) mesh(UNIT_BOX, RACK, cx, box.y0 + fy * h, box.z0 + d * (0.35 + 0.2 * i), w * 0.86, 0.008, 0.008);
      }
      mesh(UNIT_BOX, COOL, cx, box.y1 - 0.015, box.z0 + d * 0.5, w * 0.7, 0.01, 0.04);
    }
    this.root.add(g);
    const flags = this.desc.kind === 'fridge' ? ['door', 'door2'] : this.desc.kind === 'wardrobe' ? ['door', 'door2'] : this.desc.kind === 'oven' ? ['ovenDoor'] : ['door'];
    return { group: g, flags: flags as PartFlag[], glow };
  }

  // ---- effects ----------------------------------------------------------------------------

  private ensureEffects(): EffectRuntime {
    if (this.effects) return this.effects;
    const kind = this.desc.kind;
    if (!this.box) {
      const empty: EffectRuntime = {
        group: new THREE.Group(), rings: [], ringMat: new THREE.MeshStandardMaterial(), pan: null,
        steam: [], steamMat: null, steamAnchor: new THREE.Vector3(), shower: [], haze: null, bath: null, tap: null,
      };
      this.effects = empty;
      return empty;
    }
    const box = this.box;
    const g = new THREE.Group();
    g.name = 'anim-effects';
    const e: EffectRuntime = {
      group: g, rings: [], ringMat: new THREE.MeshStandardMaterial({ color: 0x3a1a08, emissive: 0xff5a12, emissiveIntensity: 0, roughness: 0.8 }),
      pan: null, steam: [], steamMat: null, steamAnchor: new THREE.Vector3(0, 0, 0), shower: [], haze: null, bath: null, tap: null,
    };
    this.ownMaterials.push(e.ringMat);
    if (kind === 'oven' && this.desc.hob) {
      const layout = this.desc.hobLayout;
      const hobY = (layout?.y !== undefined ? box.y0 + layout.y * (box.y1 - box.y0) : box.y1) + 0.004;
      const spots: [number, number][] = layout ? layout.rings : [[0.28, 0.30], [0.28, 0.64], [0.72, 0.30], [0.72, 0.64]];
      for (const [fx, fz] of spots) {
        const ring = new THREE.Mesh(RING_GEO, e.ringMat);
        ring.position.set(box.x0 + fx * (box.x1 - box.x0), hobY, box.z0 + fz * (box.z1 - box.z0));
        ring.scale.setScalar(layout?.ringSize !== undefined ? layout.ringSize / 2 : 0.06); // default ~12 cm across: any larger and the two columns of rings touch
        g.add(ring);
        e.rings.push(ring);
      }
      // pot on the front-left ring
      const pan = new THREE.Group();
      const pot = new THREE.Mesh(UNIT_CYL, PAN_MAT);
      pot.scale.set(0.11, 0.08, 0.11);
      pot.position.y = 0.038;
      pan.add(pot);
      const handle = new THREE.Mesh(UNIT_BOX, PAN_MAT);
      handle.scale.set(0.02, 0.016, 0.16);
      handle.position.set(0.14, 0.06, 0);
      pan.add(handle);
      const [pfx, pfz] = layout ? (layout.pan ?? layout.rings[0]!) : [0.28, 0.30];
      pan.position.set(box.x0 + pfx * (box.x1 - box.x0), hobY, box.z0 + pfz * (box.z1 - box.z0));
      g.add(pan);
      e.pan = pan;
      e.steamAnchor.copy(pan.position).add(new THREE.Vector3(0, 0.08, 0));
    } else if (kind === 'oven') {
      e.steamAnchor.set((box.x0 + box.x1) / 2, box.y1 + 0.02, (box.z0 + box.z1) / 2);
    }
    if (kind === 'oven') {
      const tex = softSpriteTexture();
      if (tex) {
        e.steamMat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.42, depthWrite: false });
        this.ownMaterials.push(e.steamMat);
        for (let i = 0; i < 8; i++) {
          const s = new THREE.Sprite(e.steamMat);
          s.scale.setScalar(0.09 + (i % 3) * 0.025);
          s.visible = false;
          s.userData.phase = i / 8;
          g.add(s);
          e.steam.push(s);
        }
      }
    }
    if (kind === 'shower') {
      // A grid of short streaks spread over the tray: a ring around the centre would sit inside the person standing
      // in the stall and be hidden. Mixed plane angles keep some of them facing the camera from any side.
      const mat = new THREE.MeshBasicMaterial({ color: 0xcfebf7, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
      this.ownMaterials.push(mat);
      // one geometry for every streak (same size), so a shower costs ten draw calls but one geometry
      const streak = new THREE.PlaneGeometry(0.024, 0.5);
      this.ownGeometries.push(streak);
      const cx = (box.x0 + box.x1) / 2, cz = (box.z0 + box.z1) / 2;
      const top = box.y1 - 0.10;
      const len = Math.max(0.4, top - 0.05);
      const spots: [number, number][] = [
        [0.24, 0.30], [0.50, 0.22], [0.76, 0.30], [0.24, 0.56], [0.76, 0.56],
        [0.24, 0.80], [0.50, 0.86], [0.76, 0.80], [0.38, 0.68], [0.62, 0.68],
      ];
      for (let i = 0; i < spots.length; i++) {
        const [fx, fz] = spots[i]!;
        const quad = new THREE.Mesh(streak, mat);
        quad.rotation.y = (i % 3) * 0.62;
        quad.position.set(box.x0 + fx * (box.x1 - box.x0), top - len * 0.5, box.z0 + fz * (box.z1 - box.z0));
        quad.userData.phase = i / spots.length;
        quad.userData.top = top;
        quad.userData.len = len;
        g.add(quad);
        e.shower.push(quad);
      }
      const tex = softSpriteTexture();
      if (tex) {
        const haze = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.17, depthWrite: false }));
        haze.scale.set(0.8, 0.6, 1);
        haze.position.set(cx, box.y0 + (box.y1 - box.y0) * 0.45, cz);
        this.ownMaterials.push(haze.material);
        g.add(haze);
        e.haze = haze;
      }
    }
    if (kind === 'bath') {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x78b7d2, transparent: true, opacity: 0.55, depthWrite: false }));
      water.scale.set((box.x1 - box.x0) * 0.84, 1, (box.z1 - box.z0) * 0.84);
      water.position.set((box.x0 + box.x1) / 2, box.y0 + (box.y1 - box.y0) * 0.58, (box.z0 + box.z1) / 2);
      this.ownGeometries.push(water.geometry);
      this.ownMaterials.push(water.material as THREE.Material);
      water.visible = false;
      g.add(water);
      e.bath = water;
    }
    if (kind === 'sink' && this.desc.tap) {
      const t = this.desc.tap;
      const top = box.y0 + t.top * (box.y1 - box.y0);
      const bottom = box.y0 + t.bottom * (box.y1 - box.y0);
      const mat = new THREE.MeshBasicMaterial({ color: 0xbfe2ee, transparent: true, opacity: 0.5, depthWrite: false });
      this.ownMaterials.push(mat);
      const stream = new THREE.Mesh(UNIT_CYL, mat);
      stream.scale.set(0.007, Math.max(0.02, top - bottom), 0.007);
      stream.position.set(box.x0 + t.x * (box.x1 - box.x0), (top + bottom) / 2, box.z0 + t.z * (box.z1 - box.z0));
      stream.visible = false;
      g.add(stream);
      e.tap = stream;
    }
    this.root.add(g);
    this.effects = e;
    return e;
  }

  private updateEffects(act: ActiveParts, dt: number, reducedMotion: boolean): void {
    const any = act.burners.on || act.pan.on || act.steam.on || act.shower.on || act.bath.on || act.tap.on;
    if (!any && !this.effects) return;
    const e = this.effects ?? this.ensureEffects();
    e.group.visible = any;
    if (!any) return;

    // hob rings + pot
    for (const ring of e.rings) ring.visible = act.burners.on;
    e.ringMat.emissiveIntensity += ((act.burners.on ? 2.4 : 0) - e.ringMat.emissiveIntensity) * Math.min(1, dt * 8);
    if (e.pan) e.pan.visible = act.pan.on;

    // steam (hidden entirely with reduced motion)
    for (const s of e.steam) {
      s.visible = act.steam.on && !reducedMotion;
      if (!s.visible) continue;
      const phase = s.userData.phase as number;
      const rise = (this.elapsed * 0.28 + phase * 0.55) % 0.55;
      s.position.set(
        e.steamAnchor.x + Math.sin(this.elapsed * 1.7 + phase * 9) * 0.03,
        e.steamAnchor.y + rise,
        e.steamAnchor.z + Math.cos(this.elapsed * 1.3 + phase * 7) * 0.03,
      );
      s.scale.setScalar(0.07 + rise * 0.22);
    }

    // shower water: short falling streaks
    for (const q of e.shower) {
      q.visible = act.shower.on;
      if (!q.visible) continue;
      if (!reducedMotion) {
        const len = q.userData.len as number;
        const top = q.userData.top as number;
        const phase = q.userData.phase as number;
        const travel = Math.max(0.3, len - 0.5);
        const fall = (this.elapsed * 1.25 + phase * travel) % travel;
        q.position.y = top - 0.25 - fall;
      }
    }
    if (e.haze) e.haze.visible = act.shower.on && !reducedMotion;

    if (e.bath) e.bath.visible = act.bath.on;
    if (e.tap) e.tap.visible = act.tap.on;
  }

  dispose(): void {
    for (const g of this.ownGeometries) g.dispose();
    for (const m of this.ownMaterials) m.dispose();
    this.ownGeometries.length = 0;
    this.ownMaterials.length = 0;
    this.root.removeFromParent();
  }
}

/** Convenience for ObjectsView: build the animation for a placed def (null when nothing is animated). */
export function createObjectAnim(def: ObjectDef, model: THREE.Object3D | null, content: ContentDB): ObjectAnim | null {
  if (!descriptorForDef(def)) return null;
  return new ObjectAnim(def, model, content);
}
