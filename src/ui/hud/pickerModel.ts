// Pure helpers for the keyboard route to people and places (Milestone 13): who can be chosen on the lot, what to call a room
// from what stands in it, and which tiles to try for "Go here". No DOM, so it is unit-tested.

import type { Id } from '../../core/types';

export interface Pt { x: number; z: number }

/** A room's name from the categories of the objects in it (first matching rule wins). */
export function roomKind(categories: readonly string[]): string {
  const has = (...c: string[]) => categories.some((x) => c.includes(x));
  if (has('beds', 'bunk', 'crib', 'single', 'double', 'wardrobe', 'nightstand')) return 'Bedroom';
  if (has('toilet', 'shower', 'bath', 'bathroom')) return 'Bathroom';
  if (has('stove', 'fridge', 'kitchen', 'counter', 'dishwasher')) return 'Kitchen';
  if (has('sofa', 'tv', 'armchair', 'media', 'coffee', 'games')) return 'Living room';
  if (has('desk', 'computer', 'office', 'study', 'bookcase')) return 'Study';
  if (has('dining', 'dining table', 'tables')) return 'Dining room';
  return 'Room';
}

export interface RoomInput { uid: string; level: number; outdoor: boolean; tiles: readonly Pt[]; categories: readonly string[] }
export interface PlaceChoice { id: string; name: string; level: number; area: number; tiles: Pt[] }

/**
 * Places a person can be sent to: every enclosed room (named by contents, numbered when two share a name, floors above the
 * ground labelled), the yard, and the front door. `blocked` are tiles covered by objects. Tiles come nearest-the-middle first.
 */
export function placeChoices(rooms: readonly RoomInput[], entry: Pt & { level: number }, blocked: ReadonlySet<string>): PlaceChoice[] {
  const key = (level: number, t: Pt) => `${level}:${t.x},${t.z}`;
  const centred = (r: RoomInput): Pt[] => {
    const cx = r.tiles.reduce((s, t) => s + t.x, 0) / Math.max(1, r.tiles.length);
    const cz = r.tiles.reduce((s, t) => s + t.z, 0) / Math.max(1, r.tiles.length);
    return r.tiles.filter((t) => !blocked.has(key(r.level, t)))
      .sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz) || a.z - b.z || a.x - b.x);
  };
  const named = rooms.filter((r) => !r.outdoor && r.tiles.length > 0).sort((a, b) => a.level - b.level || a.uid.localeCompare(b.uid));
  const totals = new Map<string, number>();
  const kinds = named.map((r) => roomKind(r.categories));
  for (const k of kinds) totals.set(k, (totals.get(k) ?? 0) + 1);
  const seen = new Map<string, number>();
  const out: PlaceChoice[] = [];
  named.forEach((r, i) => {
    const k = kinds[i]!;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    out.push({ id: r.uid, name: (totals.get(k) ?? 0) > 1 ? `${k} ${n}` : k, level: r.level, area: r.tiles.length, tiles: centred(r) });
  });
  const yard = rooms.find((r) => r.outdoor && r.level === 0 && r.tiles.length > 0);
  out.push({ id: 'front-door', name: 'Front door', level: entry.level, area: 0, tiles: [{ x: entry.x, z: entry.z }] });
  if (yard) out.push({ id: 'yard', name: 'Yard', level: yard.level, area: yard.tiles.length, tiles: centred(yard) });
  return out.filter((p) => p.tiles.length > 0);
}

export interface PersonRow { id: Id; name: string; household: boolean; stage: string }

/** The people standing on the active lot that `personId` could talk to, household first, then by name. */
export function otherPeople<P extends { id: Id; firstName: string; lastName?: string; householdId: Id; lifeStage: string; location: { kind: string; lotId?: Id } }>(
  people: Readonly<Record<Id, P>>, personId: Id, lotId: Id, activeHouseholdId: Id, stageLabel: (s: P['lifeStage']) => string,
): PersonRow[] {
  return Object.values(people)
    .filter((p) => p.id !== personId && p.location.kind === 'lot' && p.location.lotId === lotId)
    .map((p) => ({ id: p.id, name: [p.firstName, p.lastName].filter(Boolean).join(' '), household: p.householdId === activeHouseholdId, stage: stageLabel(p.lifeStage) }))
    .sort((a, b) => Number(b.household) - Number(a.household) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
