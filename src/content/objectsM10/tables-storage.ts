// Milestone 10 designs, group "tables-storage". Models: tools/furniture-extra/m10/tables-storage.mjs
// (build: node tools/build-extra-furniture.mjs --only=tables-storage). Guide: dev/ds-tasks/m10f/AUTHORING.md.
// Edit only this group's files.

import type { ObjectDef } from '../types';
import type { ObjectKit } from '../objects';

export default function build(k: ObjectKit): ObjectDef[] {
  const { fit, obj, useFront, woodR, metalR, r3, FP11, WALL_GAP, dollars } = k;

  const chest = fit('chestOfDrawers', FP11, 2, { back: WALL_GAP });

  return [
    // Both top drawers slide out while someone changes outfit (anim kind 'openWhileUsed').
    obj(chest, {
      id: 'chest-of-drawers', name: 'Four-Drawer Chest', category: 'storage', subcategory: 'dresser', rooms: ['bedroom'], style: 'classic',
      description: 'A waist-high chest with four drawers and a broad top for lamps and photos. Change into another outfit or plan new ones here.',
      tags: ['dresser', 'storage', 'clothes', 'surface'], tier: 'standard', price: dollars(390), quality: 3, functional: true,
      footprint: FP11, layer: 'floor', blocksMovement: true, surfaceHeight: r3(chest.box.y1), slots: [useFront('use', 0.5, chest, 1)],
      interactions: ['changeOutfit', 'editOutfits'], finishes: [woodR(['wood', 'woodDark']), metalR(['metal'])],
      anim: {
        kind: 'openWhileUsed', on: ['changeOutfit', 'editOutfits'],
        parts: [
          { node: 'anim:drawer1', role: 'drawer', slide: [0, 0, 0.3] },
          { node: 'anim:drawer2', role: 'drawer2', slide: [0, 0, 0.3] },
        ],
      },
    }),
  ];
}
