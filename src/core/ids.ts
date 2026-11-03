// Stable ids: `<prefix>_<base36 counter>`. The counter lives in WorldState.nextId so ids never repeat
// within a world, including after save/load. Prefixes keep ids readable in saves and logs.

import type { WorldState } from './types';

export type IdPrefix =
  | 'hh' | 'per' | 'lot' | 'obj' | 'opn' | 'act' | 'mem' | 'led' | 'feed' | 'itm' | 'out' | 'evt' | 'bill' | 'roof';

export function newId(state: Pick<WorldState, 'nextId'>, prefix: IdPrefix): string {
  const n = state.nextId++;
  return `${prefix}_${n.toString(36)}`;
}

/** Key for a directed relationship. */
export function relKey(from: string, to: string): string { return `${from}>${to}`; }

/** Key for a symmetric bond; order-independent. */
export function pairKey(a: string, b: string): string { return a < b ? `${a}|${b}` : `${b}|${a}`; }

/** Wall identity: one wall per grid edge per level. */
export function edgeKey(level: number, dir: 'h' | 'v', x: number, z: number): string { return `${level}:${dir}:${x}:${z}`; }

export function parseEdgeKey(key: string): { level: number; dir: 'h' | 'v'; x: number; z: number } {
  const [l, d, x, z] = key.split(':');
  if ((d !== 'h' && d !== 'v') || l === undefined || x === undefined || z === undefined) throw new Error(`bad edge key ${key}`);
  return { level: Number(l), dir: d, x: Number(x), z: Number(z) };
}

/** Floor tile key. */
export function tileKey(level: number, x: number, z: number): string { return `${level}:${x}:${z}`; }

export function parseTileKey(key: string): { level: number; x: number; z: number } {
  const [l, x, z] = key.split(':').map(Number);
  return { level: l ?? 0, x: x ?? 0, z: z ?? 0 };
}
