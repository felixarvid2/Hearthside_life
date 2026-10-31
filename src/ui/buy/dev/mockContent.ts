// OWNER: UI editors agent. DEV ONLY: fallback catalog data for the Buy/Build dev page while the real
// registries (src/content/*.ts) are still being filled. Real entries always win over these (same ids).

import type { ContentDB, FinishRegion, ObjectDef, Palette, SurfaceDesign, Swatch } from '../../../content/types';

const sw = (id: string, name: string, color: string): Swatch => ({ id, name, color });

const WOOD: Swatch[] = [
  sw('oak', 'Honey oak', '#c89a5e'), sw('walnut', 'Walnut', '#6b4a33'), sw('pine', 'Pale pine', '#e3c89a'),
  sw('ash', 'Ash grey', '#a59d92'), sw('ebony', 'Black stain', '#34302c'), sw('white', 'Whitewash', '#efe9df'),
];
const FABRIC: Swatch[] = [
  sw('oat', 'Oatmeal', '#d9cbb3'), sw('sage', 'Sage', '#9aae8f'), sw('rust', 'Rust', '#b9643f'),
  sw('navy', 'Navy', '#33476b'), sw('mustard', 'Mustard', '#d4a73a'), sw('rose', 'Dusty rose', '#c98f8f'),
  sw('charcoal', 'Charcoal', '#4a4744'), sw('teal', 'Teal', '#2f7f78'),
];
const METAL: Swatch[] = [
  sw('steel', 'Brushed steel', '#b8bcbf'), sw('black', 'Matte black', '#2c2c2e'), sw('brass', 'Brass', '#c2a25a'),
  sw('copper', 'Copper', '#b87352'), sw('white', 'White enamel', '#f2f0ea'), sw('mint', 'Mint enamel', '#a8d5c2'),
];
const CERAMIC: Swatch[] = [
  sw('white', 'Bright white', '#f6f4ef'), sw('bone', 'Bone', '#e7ddcb'), sw('sky', 'Sky', '#b9d3e3'),
  sw('sage', 'Sage', '#b5c7ad'), sw('blush', 'Blush', '#ecc9c1'), sw('graphite', 'Graphite', '#5b5a58'),
];

const region = (id: string, label: string, swatches: Swatch[]): FinishRegion => ({ id, label, materials: [id], swatches });

type ObjIn = Pick<ObjectDef, 'id' | 'name' | 'category' | 'price'> & Partial<ObjectDef>;

function obj(o: ObjIn): ObjectDef {
  return {
    description: '',
    rooms: [],
    style: 'cozy-cottage',
    tags: [],
    packs: [],
    tier: o.price < 20000 ? 'budget' : o.price < 60000 ? 'standard' : o.price < 120000 ? 'premium' : 'luxury',
    quality: 2,
    functional: true,
    model: { asset: o.id, scale: 2, offset: [0, 0, 0], yaw: 0 },
    footprint: { w: 1, d: 1 },
    layer: 'floor',
    blocksMovement: true,
    height: 0.9,
    slots: [],
    interactions: [],
    stats: {},
    finishes: [region('wood', 'Wood', WOOD)],
    status: 'ready',
    ...o,
  };
}

export const MOCK_OBJECTS: ObjectDef[] = [
  obj({ id: 'bed-double-oak', name: 'Double Bed, Oak Frame', category: 'beds', price: 120000, quality: 3, footprint: { w: 2, d: 2 }, height: 0.9, rooms: ['bedroom'], tags: ['bed', 'sleep'],
    description: 'A sturdy oak bed with room for two and a soft quilted mattress.', interactions: ['sleep', 'nap'], stats: { comfort: 7, energy: 1.2, environment: 1 },
    finishes: [region('wood', 'Frame', WOOD), region('fabric', 'Bedding', FABRIC)] }),
  obj({ id: 'bed-single-pine', name: 'Single Bed, Pine', category: 'beds', price: 45000, footprint: { w: 1, d: 2 }, rooms: ['bedroom', 'kids'], interactions: ['sleep', 'nap'],
    description: 'A simple pine bed that fits small rooms.', stats: { comfort: 5, energy: 1 }, finishes: [region('wood', 'Frame', WOOD), region('fabric', 'Bedding', FABRIC)] }),
  obj({ id: 'nightstand-oak', name: 'Oak Nightstand', category: 'beds', price: 11000, rooms: ['bedroom'], height: 0.6, surfaceHeight: 0.6, description: 'A bedside table with a small drawer.', stats: { environment: 1 } }),
  obj({ id: 'wardrobe-tall', name: 'Tall Wardrobe', category: 'storage', price: 52000, quality: 3, height: 2, rooms: ['bedroom'], interactions: ['changeOutfit', 'editOutfits'],
    description: 'Hanging space for every outfit, with a mirror inside the door.', finishes: [region('wood', 'Wood', WOOD), region('metal', 'Handles', METAL)] }),
  obj({ id: 'fridge-standard', name: 'Everyday Fridge', category: 'kitchen', price: 65000, height: 1.8, rooms: ['kitchen'], interactions: ['grabSnack', 'cookMeal'],
    description: 'Keeps groceries cold. Grab a snack or start cooking a meal.', finishes: [region('metal', 'Body', METAL)] }),
  obj({ id: 'stove-basic', name: 'Basic Stove', category: 'kitchen', price: 50000, rooms: ['kitchen'], stats: { cooking: 0.1 },
    description: 'Four burners and an oven: everything a home cook needs.', finishes: [region('metal', 'Body', METAL)] }),
  obj({ id: 'counter-basic', name: 'Kitchen Counter', category: 'kitchen', price: 18000, rooms: ['kitchen'], surfaceHeight: 0.9,
    description: 'Work surface with cupboards below. Meals can be served here.', finishes: [region('wood', 'Cabinet', WOOD), region('stone', 'Worktop', CERAMIC)] }),
  obj({ id: 'counter-sink', name: 'Counter with Sink', category: 'kitchen', price: 26000, rooms: ['kitchen'], surfaceHeight: 0.9, interactions: ['washHands'],
    description: 'A counter module with a deep basin and mixer tap.', finishes: [region('wood', 'Cabinet', WOOD), region('metal', 'Tap', METAL)] }),
  obj({ id: 'trash-can', name: 'Pedal Bin', category: 'kitchen', price: 4000, functional: false, rooms: ['kitchen'], height: 0.5, description: 'A tidy pedal bin.', finishes: [region('metal', 'Body', METAL)] }),
  obj({ id: 'table-dining-oak', name: 'Oak Dining Table', category: 'tables', price: 32000, quality: 3, footprint: { w: 2, d: 1 }, height: 0.75, surfaceHeight: 0.66, rooms: ['dining', 'kitchen'],
    description: 'Seats four. Meals can be served on it.', stats: { environment: 1 } }),
  obj({ id: 'table-coffee', name: 'Low Coffee Table', category: 'tables', price: 14000, height: 0.45, surfaceHeight: 0.42, rooms: ['living'], description: 'A low table for the living room.' }),
  obj({ id: 'desk-oak', name: 'Oak Writing Desk', category: 'tables', price: 34000, footprint: { w: 2, d: 1 }, height: 0.76, surfaceHeight: 0.76, rooms: ['study', 'bedroom'],
    description: 'A desk with space for a computer and a lamp.' }),
  obj({ id: 'chair-dining-oak', name: 'Oak Dining Chair', category: 'seating', price: 9000, rooms: ['dining', 'kitchen'], interactions: ['sit'], stats: { comfort: 4 },
    description: 'A ladder-back chair that matches the oak table.', finishes: [region('wood', 'Wood', WOOD), region('fabric', 'Seat pad', FABRIC)] }),
  obj({ id: 'sofa-tweed', name: 'Tweed Sofa', category: 'seating', price: 78000, quality: 4, footprint: { w: 2, d: 1 }, rooms: ['living'], interactions: ['sit', 'nap'], stats: { comfort: 7, energy: 0.8 },
    description: 'A deep two-seater in soft tweed. Good for naps.', finishes: [region('fabric', 'Upholstery', FABRIC), region('wood', 'Legs', WOOD)] }),
  obj({ id: 'armchair-lounge', name: 'Lounge Armchair', category: 'seating', price: 42000, quality: 3, rooms: ['living', 'study'], interactions: ['sit'], stats: { comfort: 6 },
    description: 'A rounded armchair with a high back.', finishes: [region('fabric', 'Upholstery', FABRIC), region('wood', 'Legs', WOOD)] }),
  obj({ id: 'chair-desk', name: 'Swivel Desk Chair', category: 'seating', price: 16000, rooms: ['study'], interactions: ['sit'], stats: { comfort: 5 },
    description: 'Adjustable height, smooth castors.', finishes: [region('fabric', 'Seat', FABRIC), region('metal', 'Base', METAL)] }),
  obj({ id: 'tv-stand-low', name: 'Low TV Stand', category: 'storage', price: 21000, footprint: { w: 2, d: 1 }, height: 0.6, surfaceHeight: 0.6, rooms: ['living'], description: 'A low cabinet for a TV and a radio.' }),
  obj({ id: 'bookcase-open', name: 'Open Bookcase', category: 'storage', price: 26000, height: 1.8, rooms: ['living', 'study'], interactions: ['readBook'], stats: { skill: 1.1, environment: 2 },
    description: 'Five shelves of well-loved books.' }),
  obj({ id: 'tv-flatscreen', name: 'Flatscreen TV', category: 'electronics', price: 90000, quality: 3, layer: 'surface', height: 0.7, rooms: ['living'], interactions: ['watchTv'], stats: { fun: 1.2 },
    description: 'A slim TV. Put it on a stand or a low table.', finishes: [region('metal', 'Frame', METAL)] }),
  obj({ id: 'computer-desktop', name: 'Desktop Computer', category: 'electronics', price: 110000, quality: 4, layer: 'surface', height: 0.5, rooms: ['study'], interactions: ['playComputerGames', 'practiceProgramming'],
    stats: { fun: 1.1, skill: 1.15 }, description: 'For games, homework and learning to code. Needs a desk.', finishes: [region('metal', 'Case', METAL)] }),
  obj({ id: 'radio-retro', name: 'Retro Radio', category: 'electronics', price: 8500, layer: 'surface', height: 0.25, rooms: ['living', 'kitchen'], interactions: ['listenToMusic'], stats: { fun: 1 },
    description: 'A rounded radio with a warm sound.', finishes: [region('wood', 'Case', WOOD)] }),
  obj({ id: 'toilet-basic', name: 'Toilet', category: 'bathroom', price: 30000, rooms: ['bathroom'], interactions: ['useToilet'], description: 'A quiet, water-saving toilet.', finishes: [region('ceramic', 'Ceramic', CERAMIC)] }),
  obj({ id: 'shower-stall', name: 'Glass Shower', category: 'bathroom', price: 65000, quality: 3, height: 2.1, rooms: ['bathroom'], interactions: ['takeShower'], stats: { hygiene: 1.1 },
    description: 'A walk-in shower with a rain head.', finishes: [region('ceramic', 'Tray', CERAMIC), region('metal', 'Fittings', METAL)] }),
  obj({ id: 'bathroom-sink', name: 'Pedestal Basin', category: 'bathroom', price: 24000, rooms: ['bathroom'], interactions: ['washHands'], description: 'A classic basin on a pedestal.', finishes: [region('ceramic', 'Ceramic', CERAMIC)] }),
  obj({ id: 'bathroom-mirror', name: 'Round Mirror', category: 'bathroom', price: 12000, layer: 'wall', needsWall: true, blocksMovement: false, height: 0.7, rooms: ['bathroom', 'bedroom'],
    interactions: ['practiceSpeech'], stats: { environment: 1 }, description: 'Hang it on a wall. Good for practising speeches.', finishes: [region('metal', 'Frame', METAL)] }),
  obj({ id: 'lamp-floor-round', name: 'Round Floor Lamp', category: 'lighting', price: 9500, functional: false, height: 1.6, rooms: ['living', 'bedroom', 'study'], stats: { environment: 1 },
    description: 'A paper globe shade on a slim stand.', finishes: [region('metal', 'Stand', METAL), region('fabric', 'Shade', FABRIC)] }),
  obj({ id: 'plant-potted', name: 'Potted Fig', category: 'decor', price: 6000, rooms: ['living', 'bedroom', 'study'], interactions: ['waterPlant'], stats: { environment: 2 },
    description: 'A leafy fig tree in a clay pot. Water it now and then.', finishes: [region('ceramic', 'Pot', CERAMIC)] }),
  obj({ id: 'rug-rectangle', name: 'Woven Rug', category: 'decor', price: 23000, functional: false, layer: 'rug', blocksMovement: false, footprint: { w: 3, d: 2 }, height: 0.02, rooms: ['living', 'bedroom'],
    stats: { environment: 2 }, description: 'A flat-woven rug. Furniture can stand on it.', finishes: [region('fabric', 'Pattern colour', FABRIC)] }),
  obj({ id: 'mock-painting-hills', name: 'Painting: Rolling Hills', category: 'decor', price: 18000, functional: false, layer: 'wall', needsWall: true, blocksMovement: false, height: 0.8, quality: 4,
    rooms: ['living', 'bedroom', 'dining'], stats: { environment: 3 }, description: 'An original landscape in soft greens and golds.', finishes: [region('wood', 'Frame', WOOD)] }),
  obj({ id: 'mock-bench-garden', name: 'Garden Bench', category: 'outdoor', price: 28000, footprint: { w: 2, d: 1 }, rooms: ['outdoor'], interactions: ['sit'], stats: { comfort: 4 },
    description: 'A slatted bench for the garden.', tags: ['garden'] }),
  obj({ id: 'mock-toy-chest', name: 'Toy Chest', category: 'kids', price: 15000, rooms: ['kids'], description: 'Bright painted chest full of toys.', functional: false, stats: { environment: 1 } }),
  obj({ id: 'mock-easel', name: 'Painting Easel', category: 'hobby', price: 35000, quality: 3, height: 1.7, rooms: ['study', 'living'], interactions: ['paint'], stats: { skill: 1.2, fun: 1.1 },
    description: 'Practise painting and sell your work.', status: 'dev' }),
];

// ---------------------------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------------------------

const PALETTE_SETS: Array<[string, string, string[]]> = [
  ['linen', 'Linen', ['#efe6d6', '#d9c9ad', '#b9a27f']],
  ['sage', 'Sage', ['#b9c6a8', '#8ea37f', '#5f7356']],
  ['terracotta', 'Terracotta', ['#e3a27d', '#c2704a', '#8c4a2f']],
  ['ocean', 'Ocean', ['#bcd5e0', '#6f9fb8', '#355d78']],
  ['charcoal', 'Charcoal', ['#7a7672', '#4f4c49', '#2e2c2a']],
  ['blush', 'Blush', ['#f2d4cc', '#dba79b', '#b5776b']],
  ['mustard', 'Mustard', ['#f0d68f', '#d4a73a', '#9a7520']],
  ['plum', 'Plum', ['#d6c0d6', '#9b6f9b', '#5e3d5e']],
];

function palettes(n: number, offset = 0): Palette[] {
  const out: Palette[] = [];
  for (let i = 0; i < n; i++) {
    const [id, name, colors] = PALETTE_SETS[(i + offset) % PALETTE_SETS.length]!;
    out.push({ id, name, colors: [...colors] });
  }
  return out;
}

type SurfIn = Pick<SurfaceDesign, 'id' | 'name' | 'family' | 'price'> & Partial<SurfaceDesign>;

function surf(surface: 'wall' | 'floor', o: SurfIn): SurfaceDesign {
  return {
    surface,
    description: '',
    tags: [],
    packs: [],
    tier: o.price < 500 ? 'budget' : o.price < 1000 ? 'standard' : o.price < 2000 ? 'premium' : 'luxury',
    painter: o.family,
    params: {},
    repeat: 1,
    palettes: palettes(surface === 'wall' ? 8 : 6, o.id.length),
    status: 'ready',
    ...o,
  };
}

export const MOCK_WALLS: SurfaceDesign[] = [
  surf('wall', { id: 'plain-paint', name: 'Plain Paint', family: 'plain-paint', price: 200, tags: ['modern', 'classic'], description: 'A smooth matt paint finish.' }),
  surf('wall', { id: 'mock-limewash', name: 'Limewash Plaster', family: 'plain-paint', price: 450, tags: ['cottage', 'rustic'], description: 'Soft, cloudy plaster.' }),
  surf('wall', { id: 'subway-tile', name: 'Subway Tile', family: 'ceramic-tile', price: 900, tags: ['modern', 'classic'], description: 'Glazed brick-bond tiles.' }),
  surf('wall', { id: 'stripes-regency', name: 'Regency Stripes', family: 'stripes', price: 600, tags: ['classic', 'townhouse'], description: 'Broad and narrow stripes.' }),
  surf('wall', { id: 'mock-gingham', name: 'Gingham Check', family: 'stripes', price: 550, tags: ['cottage', 'kids'], description: 'A small woven check.' }),
  surf('wall', { id: 'brick-classic', name: 'Classic Brick', family: 'brick-stone', price: 1200, tags: ['industrial', 'classic'], description: 'Red brick in running bond.' }),
  surf('wall', { id: 'mock-geo-tri', name: 'Folded Triangles', family: 'geometric', price: 800, tags: ['modern', 'mid-century'], description: 'Interlocking triangles.' }),
  surf('wall', { id: 'mock-floral', name: 'Garden Trellis', family: 'floral', price: 750, tags: ['cottage', 'botanical'], description: 'Small flowers on a trellis.' }),
  surf('wall', { id: 'mock-fern', name: 'Fern Fronds', family: 'botanical', price: 780, tags: ['botanical', 'coastal'], description: 'Overlapping fern leaves.' }),
  surf('wall', { id: 'mock-beadboard', name: 'Beadboard Panels', family: 'wood-panels', price: 1100, tags: ['cottage', 'coastal'], description: 'Narrow vertical boards.' }),
  surf('wall', { id: 'mock-concrete', name: 'Board-formed Concrete', family: 'concrete', price: 950, tags: ['industrial', 'modern'], description: 'Concrete with timber grain.' }),
  surf('wall', { id: 'mock-damask', name: 'Gilded Damask', family: 'luxury', price: 2400, tags: ['art-deco', 'classic'], description: 'A woven damask with a metallic sheen.' }),
  surf('wall', { id: 'mock-mural', name: 'Mural: Morning Hills', family: 'murals', price: 3000, tags: ['feature-wall'], description: 'A painted landscape mural.',
    palettes: [{ id: 'original', name: 'Original colours', colors: ['#cfe0c3', '#8fb27f', '#f1d9a0'] }], paletteNote: 'Fixed palette: recolouring would spoil the artwork.' }),
  surf('wall', { id: 'mock-dev-wall', name: 'Unfinished Pattern', family: 'geometric', price: 500, status: 'dev' }),
];

export const MOCK_FLOORS: SurfaceDesign[] = [
  surf('floor', { id: 'oak-planks', name: 'Oak Planks', family: 'wood-planks', price: 400, tags: ['classic', 'cottage'], description: 'Wide oak boards.' }),
  surf('floor', { id: 'mock-herringbone', name: 'Herringbone Parquet', family: 'parquet', price: 900, tags: ['classic', 'townhouse'], description: 'Short blocks in a herringbone.' }),
  surf('floor', { id: 'checker-tile', name: 'Checker Tile', family: 'ceramic-tile', price: 500, tags: ['mid-century', 'kids'], description: 'Two-colour squares.' }),
  surf('floor', { id: 'hex-mosaic', name: 'Hex Mosaic', family: 'ceramic-tile', price: 700, tags: ['modern', 'art-deco'], description: 'Tiny hexagonal tiles.' }),
  surf('floor', { id: 'carpet-plush', name: 'Plush Carpet', family: 'carpet', price: 350, tags: ['cottage', 'modern'], description: 'Deep, soft pile.' }),
  surf('floor', { id: 'mock-vinyl', name: 'Sheet Vinyl', family: 'laminate', price: 200, tags: ['modern'], description: 'Easy-clean vinyl.' }),
  surf('floor', { id: 'mock-terrazzo', name: 'Terrazzo', family: 'stone', price: 1400, tags: ['modern', 'mid-century'], description: 'Chips of stone set in resin.' }),
  surf('floor', { id: 'mock-concrete-floor', name: 'Polished Concrete', family: 'concrete', price: 600, tags: ['industrial'], description: 'Smooth sealed concrete.' }),
  surf('floor', { id: 'stone-pavers', name: 'Stone Pavers', family: 'exterior', price: 450, tags: ['outdoor', 'rustic'], description: 'Large square pavers for paths and patios.' }),
  surf('floor', { id: 'mock-decking', name: 'Garden Decking', family: 'exterior', price: 550, tags: ['outdoor', 'coastal'], description: 'Grooved timber deck boards.' }),
];

function readyCount<T extends { status: string }>(rec: Record<string, T>): number {
  return Object.values(rec).filter((x) => x.status === 'ready').length;
}

function merge<T extends { id: string; status: string }>(real: Record<string, T>, mock: T[], minReady: number, mode: 'auto' | 'mock' | 'real'): Record<string, T> {
  if (mode === 'real' || (mode === 'auto' && readyCount(real) >= minReady)) return real;
  const out: Record<string, T> = {};
  for (const m of mock) out[m.id] = m;
  if (mode === 'auto') for (const [id, r] of Object.entries(real)) out[id] = r;
  return out;
}

/**
 * Real content when the registries have enough ready entries, otherwise the mock entries (real ones override
 * mocks with the same id). mode 'mock' forces mock data only, 'real' forces the real registries.
 */
export function devContent(real: ContentDB, mode: 'auto' | 'mock' | 'real' = 'auto'): ContentDB {
  return {
    ...real,
    objects: merge(real.objects, MOCK_OBJECTS, 12, mode),
    wallDesigns: merge(real.wallDesigns, MOCK_WALLS, 8, mode),
    floorDesigns: merge(real.floorDesigns, MOCK_FLOORS, 6, mode),
  };
}
