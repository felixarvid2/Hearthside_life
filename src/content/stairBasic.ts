// Milestone 9: the basic staircase (M9-core ships one so floors are usable at once; M9-ext adds the twelve designs in
// content/exterior.ts). A staircase is an ordinary object with the `stair` field (types.ts ObjectDef.stair; geometry rules in
// world/levels.ts). Its model is built at runtime (render/stairModel.ts), so the asset id starts with 'proc:' and has no GLB.

import { dollars } from '../core/money';
import type { FinishRegion, ObjectDef, Swatch } from './types';

const sw = (id: string, name: string, color: string): Swatch => ({ id, name, color });
const region = (id: string, label: string, swatches: Swatch[]): FinishRegion => ({ id, label, materials: [id], swatches });

const STAIR_WOOD: Swatch[] = [
  sw('honey-oak', 'Honey Oak', '#e59a64'), sw('natural-ash', 'Natural Ash', '#e8cba2'), sw('walnut', 'Walnut', '#8a5a3c'),
  sw('cherry', 'Cherry', '#a8553a'), sw('ebony', 'Ebony', '#3d302b'), sw('whitewash', 'Whitewash', '#ece6dc'),
];
const STAIR_RAIL: Swatch[] = [
  sw('white', 'White', '#f1ece3'), sw('black', 'Black', '#2f2f33'), sw('brass', 'Brass', '#b99a52'),
  sw('walnut', 'Walnut', '#6c452d'), sw('sage', 'Sage', '#8fa98b'), sw('navy', 'Navy', '#34496b'),
];

export const STAIR_OBJECTS: ObjectDef[] = [
  {
    id: 'stair-straight-basic', name: 'Straight Staircase', category: 'stairs', subcategory: 'straight', rooms: ['living'], style: 'cottage',
    description: 'A plain wooden flight of stairs with a rail on both sides. Put the foot on the floor below and open a floor above.',
    tags: ['stairs'], packs: ['everyday-essentials'], tier: 'standard', price: dollars(1200), quality: 3, functional: false,
    model: { asset: 'proc:stair-straight-1x3', scale: 1, offset: [0, 0, 0], yaw: 0 },
    footprint: { w: 1, d: 3 }, layer: 'floor', blocksMovement: true, height: 3, slots: [], interactions: [],
    stats: { environment: 1 }, finishes: [region('wood', 'Wood', STAIR_WOOD), region('rail', 'Rail', STAIR_RAIL)],
    stair: { length: 3, kind: 'straight' }, status: 'ready',
  },
];
