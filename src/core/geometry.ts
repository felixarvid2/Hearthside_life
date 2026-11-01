// Shared grid geometry: object rotation, footprints and slot placement. Used by world, sim, building
// and rendering so that footprints and interaction anchors always rotate together.
//
// Local object space (rot 0): origin at the footprint's minimum corner, +x along width (w tiles),
// +z along depth (d tiles). The object's FRONT faces +z at rot 0. Facing angles are radians around +y
// measured so that facing 0 looks toward +z and facing PI/2 looks toward +x.
// rot r turns the object r quarter turns counter-clockwise seen from above (+z front -> +x front -> -z -> -x).

import type { Rot } from './types';

export interface Footprint { w: number; d: number }

export function rotatedSize(fp: Footprint, rot: Rot): Footprint {
  return rot % 2 === 0 ? { w: fp.w, d: fp.d } : { w: fp.d, d: fp.w };
}

/** Maps a local point (metres, rot-0 space) to an offset from the rotated footprint's min corner. */
export function rotateLocal(lx: number, lz: number, fp: Footprint, rot: Rot): { x: number; z: number } {
  switch (rot) {
    case 0: return { x: lx, z: lz };
    // front (+z) -> +x: local z becomes world x, local x runs toward -z
    case 1: return { x: lz, z: fp.w - lx };
    case 2: return { x: fp.w - lx, z: fp.d - lz };
    case 3: return { x: fp.d - lz, z: lx };
  }
}

/** World facing angle for a local facing at the given rotation. */
export function rotateFacing(localFacing: number, rot: Rot): number {
  return normalizeAngle(localFacing + rot * (Math.PI / 2));
}

export function normalizeAngle(a: number): number {
  const t = Math.PI * 2;
  return ((a % t) + t) % t;
}

/** Tiles covered by a footprint placed at (x, z) with rotation. */
export function footprintTiles(x: number, z: number, fp: Footprint, rot: Rot): Array<{ x: number; z: number }> {
  const s = rotatedSize(fp, rot);
  const out: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < s.w; i++) for (let j = 0; j < s.d; j++) out.push({ x: x + i, z: z + j });
  return out;
}

/**
 * Tiles of a footprint that block walking: the footprint without its open cells (rot-0 cells the model leaves
 * empty, e.g. the inside of an L-shaped sofa).
 */
export function blockingTiles(
  x: number, z: number, def: { footprint: Footprint; openCells?: ReadonlyArray<readonly [number, number]> }, rot: Rot,
): Array<{ x: number; z: number }> {
  const all = footprintTiles(x, z, def.footprint, rot);
  if (!def.openCells?.length) return all;
  const open = new Set(def.openCells.map(([cx, cz]) => { const c = rotateCell(cx, cz, def.footprint, rot); return `${x + c.x},${z + c.z}`; }));
  return all.filter((t) => !open.has(`${t.x},${t.z}`));
}

/** Tile containing a local tile cell (integer cell coordinates in rot-0 space), after rotation. */
export function rotateCell(cx: number, cz: number, fp: Footprint, rot: Rot): { x: number; z: number } {
  // rotate the cell centre and floor it
  const p = rotateLocal(cx + 0.5, cz + 0.5, fp, rot);
  return { x: Math.floor(p.x), z: Math.floor(p.z) };
}

/** Unit direction for a facing angle (facing 0 = +z). */
export function facingDir(facing: number): { x: number; z: number } {
  return { x: Math.sin(facing), z: Math.cos(facing) };
}

export function facingTo(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return normalizeAngle(Math.atan2(toX - fromX, toZ - fromZ));
}

export const tileCenter = (t: { x: number; z: number }) => ({ x: t.x + 0.5, z: t.z + 0.5 });
export const sameTile = (a: { x: number; z: number }, b: { x: number; z: number }) => a.x === b.x && a.z === b.z;

/** Rotation in radians for Object3D.rotation.y. */
export const rotYaw = (rot: Rot) => rot * (Math.PI / 2);

/**
 * Where a rot-0 local origin lands after rotating about it, relative to the rotated footprint's min corner.
 * A renderer places a model built in local space with: position = (x, y, z) + rotationOriginShift, rotation.y = rotYaw(rot).
 */
export function rotationOriginShift(fp: Footprint, rot: Rot): { x: number; z: number } {
  switch (rot) {
    case 0: return { x: 0, z: 0 };
    case 1: return { x: 0, z: fp.w };
    case 2: return { x: fp.w, z: fp.d };
    case 3: return { x: fp.d, z: 0 };
  }
}
