// OWNER: content agent (gameplay content). See docs/ARCHITECTURE.md.
//
// Organisational content packs (brief section 24). Packs group coordinated designs (objects, wall and floor
// finishes, openings, clothing); they are not a payment system. Catalog entries list pack ids in `packs`.

import type { PackDef } from './types';

/** Every content pack. */
export const PACKS: PackDef[] = [
  { id: 'everyday-essentials', name: 'Everyday Essentials', description: 'The practical basics every home needs: beds, kitchens, bathrooms and simple finishes.' },
  { id: 'modern-minimal', name: 'Modern Minimal', description: 'Clean lines, steel and glass, pale walls and calm, uncluttered rooms.' },
  { id: 'cozy-cottage', name: 'Cozy Cottage', description: 'Pine furniture, soft fabrics, florals and warm, lived-in rooms.' },
  { id: 'mid-century', name: 'Mid-Century', description: 'Tapered legs, wood cabinets, retro electronics and bold accent colours.' },
  { id: 'classic-townhouse', name: 'Classic Townhouse', description: 'Panelled walls, rich woods, libraries and formal dining rooms.' },
  { id: 'industrial-loft', name: 'Industrial Loft', description: 'Brick, concrete, black metal and open-plan living.' },
  { id: 'coastal-home', name: 'Coastal Home', description: 'Whitewashed wood, sea blues and sandy neutrals.' },
  { id: 'art-deco', name: 'Art Deco', description: 'Geometric patterns, brass trims and glamorous finishes.' },
  { id: 'botanical-living', name: 'Botanical Living', description: 'Houseplants, natural materials and leafy patterns.' },
  { id: 'kids-storybook', name: 'Kids\' Storybook', description: 'Bunk beds, playful colours and furniture for children\'s rooms.' },
  { id: 'creative-studio', name: 'Creative Studio', description: 'Easels, instruments, speakers and workspaces for makers.' },
  { id: 'garden-patio', name: 'Garden and Patio', description: 'Outdoor seating, planters, paving and garden structures.' },
];
