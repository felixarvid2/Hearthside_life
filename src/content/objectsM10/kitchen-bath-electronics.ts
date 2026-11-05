// Milestone 10 designs, group "kitchen-bath-electronics". Models: tools/furniture-extra/m10/kitchen-bath-electronics.mjs
// (build: node tools/build-extra-furniture.mjs --only=kitchen-bath-electronics). Guide: dev/ds-tasks/m10f/AUTHORING.md.
// Edit only this group's files.

import type { ObjectDef } from '../types';
import type { ObjectKit } from '../objects';

export default function build(k: ObjectKit): ObjectDef[] {
  const { fit, obj, useFront, applianceR, metalR, darkMetalR, FP11, WALL_GAP, dollars } = k;

  // Retro tall fridge: same use as the other fridges (grab a snack, cook a meal), so the door follows `openFridge`.
  const fridgeRetro = fit('fridgeRetroTall', FP11, 2, { back: WALL_GAP });
  // Thin laptop on any surface; its picture rectangle comes from the model's anim:screen part (`screen: true`).
  const laptopSlim = fit('laptopThin', FP11, 2);

  return [
    obj(fridgeRetro, {
      id: 'fridge-retro-tall', name: 'Retro Tall Fridge', category: 'kitchen', subcategory: 'fridge', rooms: ['kitchen'], style: 'retro',
      description: 'A rounded, chrome-handled fridge-freezer with glass shelves and crisper drawers. Swing the door open to grab a snack or gather ingredients.',
      tags: ['fridge', 'appliance', 'food', 'cleanable'], packs: ['mid-century'], tier: 'premium', price: dollars(1450), quality: 4, functional: true,
      footprint: FP11, layer: 'floor', blocksMovement: true, slots: [useFront('use', 0.5, fridgeRetro, 1)],
      interactions: ['grabSnack', 'cookMeal'], stats: { cooking: 1, environment: 1 }, finishes: [applianceR(), metalR(['metal'])],
      anim: {
        kind: 'fridge',
        parts: [
          { node: 'anim:door', role: 'door', axis: 'y', angle: -1.75 },
          { node: 'anim:interior', role: 'interior' },
        ],
      },
    }),
    obj(laptopSlim, {
      id: 'laptop-thin', name: 'Slim Laptop', category: 'electronics', subcategory: 'computer', rooms: ['study', 'living', 'bedroom'], style: 'modern',
      description: 'A paper-thin laptop with a bright screen. Works on any table, desk or counter; users take a chair in front of it.',
      tags: ['computer', 'electronics', 'laptop'], packs: ['modern-minimal', 'creative-studio'], tier: 'luxury', price: dollars(1300), quality: 4, functional: true,
      footprint: FP11, layer: 'surface', blocksMovement: false, slots: [useFront('use', 0.5, null, 1)],
      interactions: ['playComputerGames', 'practiceProgramming', 'adoptOnline', 'researchOnline', 'writePaper'], stats: { fun: 1, skill: 1.1 },
      finishes: [darkMetalR('Case')], screen: true,
    }),
  ];
}
