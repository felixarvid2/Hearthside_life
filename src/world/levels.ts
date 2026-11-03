// Milestone 9: floors. Levels 0-2, support rules for upper floors, walls and furniture, balconies, staircases and the
// floor holes they cut. Pure data and functions; nothing here mutates a lot except syncLevels.
//
// Geometry: level L is drawn at y = L * LEVEL_HEIGHT (3.0 m). Walls are 2.8 m, so the 0.2 m between the top of a wall and the
// level above is the floor slab; an upper level therefore only fits on 2.8 m walls (tall 3.6 m walls under an upper floor are
// refused by the support rules in the build plans).
//
// Support rules (levelProblems), for every level L >= 1:
// - A floor tile is supported when a wall of level L-1 stands on one of its four edges, or when a floored tile that lies in an
//   enclosed (indoor) room of level L-1 is directly below it. Stair holes are never floored.
// - A tile with no room below it is a balcony. It is allowed when a tile that has a room below it lies within BALCONY_REACH tiles
//   (Chebyshev) and is itself supported. Balcony edges that look at nothing need a railing (a fence or wall of level L): a missing
//   railing is a warning (balconyWarnings), never a block.
// - A wall of level L needs floor on at least one of its two sides.
// - Furniture on level L needs floor under every tile of its footprint.
//
// Stairs (ObjectDef.stair): an object on level L whose footprint is the staircase. People enter at the `foot` tile of level L
// (the tile in front of the front row) and arrive on the `head` tile of level L + 1 (the tile behind the back row). The footprint
// of the level above has no floor (the stairwell). See StairLink.

import type { ContentDB, ObjectDef, StairSpec } from '../content/types';
import { rotateCell } from '../core/geometry';
import { edgeKey, parseTileKey, tileKey } from '../core/ids';
import type { Tile } from '../core/nav';
import type { Lot, PlacedObject } from '../core/types';
import { computeRooms } from './rooms';
import { edgeTiles } from './walls';

export const LEVEL_HEIGHT = 3.0;
export const MAX_LEVELS = 3;
/** How far (tiles, Chebyshev) a balcony may reach from the nearest supported tile with a room below. */
export const BALCONY_REACH = 2;
/** Walls under an upper floor must have this height (the standard preset). */
export const SUPPORT_WALL_HEIGHT = 2.8;

export const levelY = (level: number): number => level * LEVEL_HEIGHT;

export function validLevel(level: number): boolean { return Number.isInteger(level) && level >= 0 && level < MAX_LEVELS; }

/** Highest level that holds a floor, wall, object, fence or roof, plus one (at least 1). */
export function levelsInUse(lot: Lot): number {
  let top = 0;
  const bump = (l: number) => { if (Number.isFinite(l) && l > top) top = l; };
  for (const k of Object.keys(lot.floors)) bump(parseTileKey(k).level);
  for (const w of Object.values(lot.walls)) bump(w.level);
  for (const o of Object.values(lot.objects)) bump(o.level);
  for (const f of Object.values(lot.fences ?? {})) bump(f.level);
  for (const r of Object.values(lot.roofs ?? {})) bump(r.level);
  return Math.min(MAX_LEVELS, top + 1);
}

/** Keeps `lot.levels` equal to the floors in use (never below 1). Returns true when it changed. */
export function syncLevels(lot: Lot): boolean {
  const n = Math.max(1, levelsInUse(lot));
  if (lot.levels === n) return false;
  lot.levels = n;
  return true;
}

/** True when anything stands above level 0 (the fast path of every rule below). */
export function hasUpperContent(lot: Pick<Lot, 'floors' | 'walls' | 'objects'>): boolean {
  for (const k of Object.keys(lot.floors)) if (!k.startsWith('0:')) return true;
  for (const w of Object.values(lot.walls)) if (w.level > 0) return true;
  for (const o of Object.values(lot.objects)) if (o.level > 0) return true;
  return false;
}

// ---------------------------------------------------------------------------------------------
// Stairs
// ---------------------------------------------------------------------------------------------

/** One way up a staircase: walk foot -> cells -> head. Bidirectional. */
export interface StairLink {
  objectId: string;
  /** The lower level (the head is on level + 1). */
  level: number;
  foot: Tile;
  head: Tile;
  /** Footprint tiles on `level` walked from the foot to the head (the staircase itself). */
  cells: Tile[];
  /** Search cost of using the link (the stair is slow to walk). */
  cost: number;
}

/** Walking on a stair takes this many times as long per tile. */
export const STAIR_SLOWDOWN = 1.6;

export interface StairGeometry {
  object: PlacedObject;
  spec: StairSpec;
  /** All footprint tiles. */
  footprint: Tile[];
  links: StairLink[];
}

/** Local footprint cells of a stair column, foot row first. */
function stairPathCells(def: ObjectDef): Array<[number, number]>[] {
  const spec = def.stair!;
  const { w, d } = def.footprint;
  if (spec.kind === 'straight') {
    const cols: Array<Array<[number, number]>> = [];
    for (let cx = 0; cx < w; cx++) {
      const cells: Array<[number, number]> = [];
      for (let cz = d - 1; cz >= 0; cz--) cells.push([cx, cz]);
      cols.push(cells);
    }
    return cols;
  }
  // spiral (2 x 2): front-left, front-right, back-right and, for length 4, back-left
  const order: Array<[number, number]> = [[0, d - 1], [w - 1, d - 1], [w - 1, 0], [0, 0]];
  return [order.slice(0, spec.length === 4 ? 4 : 3)];
}

/** The geometry of a placed stair (null when the definition is not a stair). */
export function stairGeometry(obj: PlacedObject, def: ObjectDef | undefined): StairGeometry | null {
  if (!def?.stair) return null;
  const spec = def.stair;
  const at = (cx: number, cz: number): Tile => {
    const r = rotateCell(cx, cz, def.footprint, obj.rot);
    return { x: obj.x + r.x, z: obj.z + r.z };
  };
  const footprint: Tile[] = [];
  for (let cx = 0; cx < def.footprint.w; cx++) for (let cz = 0; cz < def.footprint.d; cz++) footprint.push(at(cx, cz));
  const links: StairLink[] = [];
  for (const col of stairPathCells(def)) {
    const first = col[0]!, last = col[col.length - 1]!;
    const foot = at(first[0], first[1] + 1);
    const head = at(last[0], last[1] - 1);
    const cells = col.map(([cx, cz]) => at(cx, cz));
    links.push({
      objectId: obj.id, level: obj.level,
      foot: { x: foot.x, z: foot.z, level: obj.level }, head: { x: head.x, z: head.z, level: obj.level + 1 },
      cells: cells.map((t) => ({ x: t.x, z: t.z, level: obj.level })),
      cost: (cells.length + 1) * STAIR_SLOWDOWN,
    });
  }
  return { object: obj, spec, footprint, links };
}

/** Every staircase of the lot, in object id order. */
export function lotStairs(lot: Lot, content: Pick<ContentDB, 'objects'>): StairGeometry[] {
  const out: StairGeometry[] = [];
  for (const obj of Object.values(lot.objects).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const g = stairGeometry(obj, content.objects[obj.defId]);
    if (g && obj.level + 1 < MAX_LEVELS) out.push(g);
  }
  return out;
}

export function stairLinks(lot: Lot, content: Pick<ContentDB, 'objects'>): StairLink[] {
  return lotStairs(lot, content).flatMap((g) => g.links);
}

/** True when the lot has a staircase object (even one that cannot go anywhere). */
export function hasStairs(lot: Lot, content: Pick<ContentDB, 'objects'>): boolean {
  for (const o of Object.values(lot.objects)) if (content.objects[o.defId]?.stair) return true;
  return false;
}

/**
 * Nodes walked on a staircase link from the foot to the head (or back): the stair cells at rising height and the far tile.
 * `rise` is metres above the floor of the node's level; the far tile is on the other level with rise 0.
 */
export function linkNodes(link: StairLink, up: boolean): Tile[] {
  const n = link.cells.length;
  const out: Tile[] = [];
  if (up) {
    link.cells.forEach((c, i) => out.push({ x: c.x, z: c.z, level: link.level, rise: round3((LEVEL_HEIGHT * (i + 0.5)) / n) }));
    out.push({ x: link.head.x, z: link.head.z, level: link.level + 1, rise: 0 });
  } else {
    [...link.cells].reverse().forEach((c, i) => out.push({ x: c.x, z: c.z, level: link.level, rise: round3((LEVEL_HEIGHT * (n - i - 0.5)) / n) }));
    out.push({ x: link.foot.x, z: link.foot.z, level: link.level, rise: 0 });
  }
  return out;
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** Tiles of `level` that are stairwell holes (the footprints of stairs on the level below), as `x,z` keys. */
export function stairHoles(lot: Lot, content: Pick<ContentDB, 'objects'>, level: number): Set<string> {
  const out = new Set<string>();
  if (level < 1) return out;
  for (const o of Object.values(lot.objects)) {
    if (o.level !== level - 1) continue;
    const g = stairGeometry(o, content.objects[o.defId]);
    if (g) for (const t of g.footprint) out.add(`${t.x},${t.z}`);
  }
  return out;
}

/** Footprint tiles of a stair as it would be placed (for validation before the object exists). */
export function stairFootprint(def: ObjectDef, x: number, z: number, rot: PlacedObject['rot']): Tile[] {
  const fake = { id: '__stair__', defId: def.id, level: 0, x, z, rot } as PlacedObject;
  return stairGeometry(fake, def)?.footprint ?? [];
}

// ---------------------------------------------------------------------------------------------
// Support rules
// ---------------------------------------------------------------------------------------------

export type LevelProblemKind = 'floor' | 'wall' | 'object' | 'hole';

export interface LevelProblem {
  kind: LevelProblemKind;
  level: number;
  /** Stable identity (tile key, wall id or object id), so a build can be judged by the problems it adds. */
  key: string;
  text: string;
}

/** Per-level facts the rules share. */
export interface SupportMap {
  /** Index z * width + x; 1 when the tile of level `level - 1` is inside an enclosed room. */
  roomBelow: Uint8Array;
  /** 1 when a floored indoor tile lies below, or a wall of the level below stands on a tile edge. */
  supported: Uint8Array;
  /** 1 when roomBelow and supported: a tile a balcony may hang from. */
  anchor: Uint8Array;
}

export function supportMap(lot: Lot, level: number, below?: ReturnType<typeof computeRooms>): SupportMap {
  const W = lot.width, D = lot.depth;
  const roomBelow = new Uint8Array(W * D);
  const supported = new Uint8Array(W * D);
  const anchor = new Uint8Array(W * D);
  const lv = level - 1;
  for (const r of below ?? computeRooms(lot, lv)) {
    if (r.outdoor) continue;
    for (const t of r.tiles) roomBelow[t.z * W + t.x] = 1;
  }
  // only a standard-height wall carries a floor: a half wall is too low and a tall one pokes through
  const wall = (dir: 'h' | 'v', x: number, z: number) => {
    const w = lot.walls[edgeKey(lv, dir, x, z)];
    return w !== undefined && Math.abs(w.height - SUPPORT_WALL_HEIGHT) < 0.05;
  };
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      const onWall = wall('h', x, z) || wall('h', x, z + 1) || wall('v', x, z) || wall('v', x + 1, z);
      const floored = roomBelow[i] === 1 && lot.floors[tileKey(lv, x, z)] !== undefined;
      supported[i] = onWall || floored ? 1 : 0;
      anchor[i] = roomBelow[i] === 1 && supported[i] === 1 ? 1 : 0;
    }
  }
  return { roomBelow, supported, anchor };
}

function anchorNear(lot: Lot, map: SupportMap, x: number, z: number): boolean {
  for (let dz = -BALCONY_REACH; dz <= BALCONY_REACH; dz++) {
    for (let dx = -BALCONY_REACH; dx <= BALCONY_REACH; dx++) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= lot.width || nz >= lot.depth) continue;
      if (map.anchor[nz * lot.width + nx] === 1) return true;
    }
  }
  return false;
}

/** Everything wrong with the floors, walls and furniture above level 0 (empty when the lot has nothing up there). */
export function levelProblems(lot: Lot, content: Pick<ContentDB, 'objects'>): LevelProblem[] {
  const out: LevelProblem[] = [];
  if (!hasUpperContent(lot)) return out;
  const maps = new Map<number, SupportMap>();
  const holes = new Map<number, Set<string>>();
  const holesOf = (l: number) => { let h = holes.get(l); if (!h) { h = stairHoles(lot, content, l); holes.set(l, h); } return h; };
  const mapOf = (l: number) => { let m = maps.get(l); if (!m) { m = supportMap(lot, l); maps.set(l, m); } return m; };

  for (const key of Object.keys(lot.floors).sort()) {
    const { level, x, z } = parseTileKey(key);
    if (level < 1) continue;
    if (level >= MAX_LEVELS) { out.push({ kind: 'floor', level, key, text: 'That floor does not exist.' }); continue; }
    if (x < 0 || z < 0 || x >= lot.width || z >= lot.depth) continue;
    if (holesOf(level).has(`${x},${z}`)) { out.push({ kind: 'hole', level, key, text: 'The stairs open up there; it cannot have a floor.' }); continue; }
    const m = mapOf(level);
    const i = z * lot.width + x;
    if (m.supported[i] === 1) continue;
    if (m.roomBelow[i] === 0 && anchorNear(lot, m, x, z)) continue;
    out.push({
      kind: 'floor', level, key,
      text: m.roomBelow[i] === 0 ? `A balcony can reach only ${BALCONY_REACH} tiles out from a room below.` : 'An upper floor needs a wall or a floored room below it.',
    });
  }

  for (const w of Object.values(lot.walls).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (w.level + 1 < MAX_LEVELS && w.height > SUPPORT_WALL_HEIGHT + 0.05 && edgeTiles(w).some((t) => lot.floors[tileKey(w.level + 1, t.x, t.z)] !== undefined)) {
      out.push({ kind: 'wall', level: w.level, key: `tall:${w.id}`, text: 'A wall under an upper floor must be the standard height.' });
    }
    if (w.level < 1) continue;
    if (w.level >= MAX_LEVELS) { out.push({ kind: 'wall', level: w.level, key: w.id, text: 'That floor does not exist.' }); continue; }
    const hasFloor = edgeTiles(w).some((t) => lot.floors[tileKey(w.level, t.x, t.z)] !== undefined);
    if (!hasFloor) out.push({ kind: 'wall', level: w.level, key: w.id, text: 'An upper wall needs floor on at least one side.' });
  }

  for (const o of Object.values(lot.objects).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (o.level < 1) continue;
    const def = content.objects[o.defId];
    if (!def) continue;
    if (def.layer === 'wall') continue; // hangs on a wall; the wall has its own rule
    const fp = footprintOf(o, def);
    if (fp.some((t) => lot.floors[tileKey(o.level, t.x, t.z)] === undefined)) {
      out.push({ kind: 'object', level: o.level, key: o.id, text: `The ${def.name} needs floor under it.` });
    }
  }
  return out;
}

function footprintOf(o: PlacedObject, def: ObjectDef): Tile[] {
  const g = stairGeometry(o, def);
  if (g) return g.footprint;
  const out: Tile[] = [];
  const w = o.rot % 2 === 0 ? def.footprint.w : def.footprint.d;
  const d = o.rot % 2 === 0 ? def.footprint.d : def.footprint.w;
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) out.push({ x: o.x + i, z: o.z + j });
  return out;
}

/** The problems a changed lot has that the original lot did not (what a build must not cause). */
export function newLevelProblems(before: Lot, after: Lot, content: Pick<ContentDB, 'objects'>): LevelProblem[] {
  if (!hasUpperContent(after)) return [];
  const had = new Set(levelProblems(before, content).map((p) => `${p.kind}:${p.key}`));
  return levelProblems(after, content).filter((p) => !had.has(`${p.kind}:${p.key}`));
}

/** Balcony edges without a railing: `${level}:${x},${z}` of the tile and the compass side that needs one. */
export interface BalconyWarning { level: number; x: number; z: number; side: 'n' | 'e' | 's' | 'w'; edge: string }

export function balconyWarnings(lot: Lot, content: Pick<ContentDB, 'objects'>): BalconyWarning[] {
  const out: BalconyWarning[] = [];
  if (!hasUpperContent(lot)) return out;
  const holes = new Map<number, Set<string>>();
  const holesOf = (l: number) => { let h = holes.get(l); if (!h) { h = stairHoles(lot, content, l); holes.set(l, h); } return h; };
  for (let level = 1; level < MAX_LEVELS; level++) {
    const tiles = Object.keys(lot.floors).map(parseTileKey).filter((t) => t.level === level);
    if (tiles.length === 0) continue;
    const m = supportMap(lot, level);
    const floored = (x: number, z: number) => lot.floors[tileKey(level, x, z)] !== undefined;
    const sides: Array<['n' | 'e' | 's' | 'w', number, number, 'h' | 'v', number, number]> = [];
    for (const t of tiles) {
      if (m.roomBelow[t.z * lot.width + t.x] === 1) continue; // not a balcony tile
      sides.length = 0;
      sides.push(['n', 0, -1, 'h', t.x, t.z], ['s', 0, 1, 'h', t.x, t.z + 1], ['w', -1, 0, 'v', t.x, t.z], ['e', 1, 0, 'v', t.x + 1, t.z]);
      for (const [side, dx, dz, dir, ex, ez] of sides) {
        const nx = t.x + dx, nz = t.z + dz;
        if (floored(nx, nz) || holesOf(level).has(`${nx},${nz}`)) continue;
        const key = edgeKey(level, dir, ex, ez);
        if (lot.walls[key] || lot.fences?.[key]) continue;
        out.push({ level, x: t.x, z: t.z, side, edge: key });
      }
    }
  }
  return out;
}

/** Player-facing sentences for the balcony warnings of a lot (one for all missing railings). */
export function balconyWarningText(warnings: readonly BalconyWarning[]): string[] {
  return warnings.length === 0 ? [] : [`${warnings.length === 1 ? 'A balcony edge has' : `${warnings.length} balcony edges have`} no railing. Add a fence along the open edge.`];
}

/**
 * Where people come from on a level: the lot entry on the ground floor, the head tiles of the stairs that arrive on any
 * other level. Used as the starting points of reachability checks.
 */
export function levelSeeds(lot: Lot, content: Pick<ContentDB, 'objects'>, level: number): Tile[] {
  if (level === 0) return lot.entry.level === 0 ? [{ x: lot.entry.x, z: lot.entry.z }] : [];
  const out: Tile[] = [];
  for (const l of stairLinks(lot, content)) if (l.level + 1 === level) out.push({ x: l.head.x, z: l.head.z });
  return out;
}

/**
 * Levels a person standing on `from` can get to through staircases whose ends have floor (a coarse test: it ignores walls and
 * furniture; navigation decides the rest). Includes `from`.
 */
export function connectedLevels(lot: Lot, content: Pick<ContentDB, 'objects'>, from: number): Set<number> {
  const out = new Set<number>([from]);
  const links = stairLinks(lot, content).filter((l) =>
    lot.floors[tileKey(l.head.level ?? l.level + 1, l.head.x, l.head.z)] !== undefined
    && (l.level === 0 || lot.floors[tileKey(l.level, l.foot.x, l.foot.z)] !== undefined));
  for (let changed = true; changed;) {
    changed = false;
    for (const l of links) {
      const lo = l.level, hi = l.level + 1;
      if (out.has(lo) && !out.has(hi)) { out.add(hi); changed = true; }
      if (out.has(hi) && !out.has(lo)) { out.add(lo); changed = true; }
    }
  }
  return out;
}
