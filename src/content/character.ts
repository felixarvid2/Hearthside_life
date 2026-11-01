// Character content: hair, facial hair, garments, accessories, patterns, face/body parameters and presets,
// skin/hair/eye colour swatches and voices. OWNER: characters module (see docs/ARCHITECTURE.md).
//
// `build` records are read by the procedural generators in src/characters (hair.ts, clothing.ts,
// accessories.ts). Parameter ids are read by src/characters/bodyShape.ts and src/characters/headShape.ts.
// All appearance values are -1..1 (0 = frame default) unless a ParamDef says otherwise.
//
// Height is intentionally NOT a body parameter in Milestone 1 (brief 6.4): every interaction anchor assumes
// the fixed skeleton height (about 1.81-1.83 m). Height variation arrives with a compatible rig/IK pass.
import type {
  AccessoryDef, BodyPreset, BrowStyle, FacePreset, FacialHairDef, GarmentDef, HairDef, ParamDef, PatternDef, Swatch,
  VoicePreset,
} from './types';

// ---------------------------------------------------------------------------------------------
// Patterns (garment surface patterns, painted in bind-pose cloth space by the cloth shader)
// ---------------------------------------------------------------------------------------------

export const PATTERNS: PatternDef[] = [
  { id: 'solid', name: 'Solid', description: 'Plain fabric in one colour.' },
  { id: 'stripes', name: 'Stripes', description: 'Even horizontal stripes in the pattern colour.' },
  { id: 'pinstripe', name: 'Pinstripe', description: 'Fine vertical pinstripes, classic tailoring.' },
  { id: 'plaid', name: 'Plaid', description: 'Woven tartan-style crossing bands with a thin accent line.' },
  { id: 'polka', name: 'Polka Dots', description: 'Round dots in staggered rows.' },
  { id: 'gingham', name: 'Gingham', description: 'Small two-tone checks with blended crossings.' },
  { id: 'chevron', name: 'Chevron', description: 'Zigzag bands running around the garment.' },
];

// ---------------------------------------------------------------------------------------------
// Garments. Layers: top, bottom, full (replaces top and bottom), outer (over the top), shoes.
// ---------------------------------------------------------------------------------------------

export const GARMENTS: GarmentDef[] = [
  // ---- tops ----
  {
    id: 'tee-crew', name: 'Crew Tee', description: 'Relaxed short-sleeve tee with a ribbed crew neck.',
    layer: 'top', categories: ['everyday', 'athletic'], tags: ['casual', 'cotton', 'short-sleeve'],
    affinity: 'neutral',
    patterns: ['solid', 'stripes', 'polka', 'chevron'], defaultColor: '#e9e4d8',
    build: { shape: 'shirt', fabric: 'cotton', sleeve: 0.34, sleeveLoose: 0.55, neck: 'crew', hem: 0.12, drape: 0.6, rib: true },
    status: 'ready',
  },
  {
    id: 'tee-long', name: 'Long-Sleeve Tee', description: 'Soft jersey tee with long fitted sleeves and cuffs.',
    layer: 'top', categories: ['everyday', 'work', 'athletic'], tags: ['casual', 'cotton', 'long-sleeve'],
    affinity: 'neutral',
    patterns: ['solid', 'stripes', 'chevron'], defaultColor: '#7f97b2',
    build: { shape: 'shirt', fabric: 'cotton', sleeve: 1, sleeveLoose: 0.15, neck: 'crew', hem: 0.1, drape: 0.45, rib: true, cuffs: true },
    status: 'ready',
  },
  {
    id: 'tank-top', name: 'Tank Top', description: 'Sleeveless ribbed tank with a scooped neck.',
    layer: 'top', categories: ['athletic', 'everyday', 'sleep', 'swim'], tags: ['casual', 'sleeveless', 'summer'],
    affinity: 'neutral',
    patterns: ['solid', 'stripes'], defaultColor: '#d8694e',
    build: { shape: 'shirt', fabric: 'rib', sleeve: 0, neck: 'tank', hem: 0.14, drape: 0.35, strap: 0.045, rib: true },
    status: 'ready',
  },
  {
    id: 'shirt-button', name: 'Button-Up Shirt', description: 'Collared shirt with a button placket and long sleeves.',
    layer: 'top', categories: ['formal', 'work', 'everyday'], tags: ['smart', 'collar', 'long-sleeve'],
    affinity: 'neutral',
    patterns: ['solid', 'pinstripe', 'gingham', 'plaid', 'stripes'], defaultColor: '#f2f0ea',
    build: { shape: 'shirt', fabric: 'poplin', sleeve: 1, sleeveLoose: 0.3, neck: 'collar', hem: 0.05, drape: 0.5, placket: 'buttons', cuffs: true },
    status: 'ready',
  },
  {
    id: 'polo-shirt', name: 'Polo Shirt', description: 'Short-sleeve pique polo with a soft collar and three buttons.',
    layer: 'top', categories: ['work', 'athletic', 'everyday'], tags: ['smart-casual', 'collar', 'short-sleeve'],
    affinity: 'neutral',
    patterns: ['solid', 'stripes'], defaultColor: '#3f6b5a',
    build: { shape: 'shirt', fabric: 'pique', sleeve: 0.3, sleeveLoose: 0.4, neck: 'collar', hem: 0.1, drape: 0.5, placket: 'short', rib: true },
    status: 'ready',
  },
  {
    id: 'sweater-knit', name: 'Knit Sweater', description: 'Chunky knit with ribbed neck, cuffs and hem.',
    layer: 'top', categories: ['everyday', 'formal', 'work'], tags: ['cosy', 'knit', 'long-sleeve', 'winter'],
    affinity: 'neutral',
    patterns: ['solid', 'stripes', 'chevron'], defaultColor: '#b8865a',
    build: { shape: 'shirt', fabric: 'knit', sleeve: 1, sleeveLoose: 0.35, neck: 'crew', hem: 0.16, drape: 0.7, thickness: 0.014, rib: true, cuffs: true, hemBand: true },
    status: 'ready',
  },
  {
    id: 'pajama-top', name: 'Pajama Top', description: 'Loose flannel sleep shirt with piped edges and a button front.',
    layer: 'top', categories: ['sleep'], tags: ['sleepwear', 'flannel', 'long-sleeve'],
    affinity: 'neutral',
    patterns: ['solid', 'stripes', 'gingham', 'polka', 'plaid'], defaultColor: '#9fb7d9',
    build: { shape: 'shirt', fabric: 'flannel', sleeve: 0.95, sleeveLoose: 0.7, neck: 'v', hem: 0.1, drape: 0.8, placket: 'buttons', piping: true },
    status: 'ready',
  },
  // ---- outer ----
  {
    id: 'jacket-zip', name: 'Zip Jacket', description: 'Light zip-front jacket with a stand collar, worn over a top.',
    layer: 'outer', categories: ['everyday', 'work', 'athletic'], tags: ['jacket', 'outerwear', 'long-sleeve'],
    affinity: 'neutral',
    patterns: ['solid', 'plaid'], defaultColor: '#5d6b4a',
    build: { shape: 'shirt', fabric: 'canvas', sleeve: 1, sleeveLoose: 0.45, neck: 'high', hem: 0.16, drape: 0.65, thickness: 0.019, placket: 'zip', cuffs: true, hemBand: true },
    status: 'ready',
  },
  // ---- bottoms ----
  {
    id: 'jeans-straight', name: 'Straight Jeans', description: 'Mid-rise denim with a straight leg and contrast stitching.',
    layer: 'bottom', categories: ['everyday', 'work'], tags: ['denim', 'casual', 'long'],
    affinity: 'neutral',
    patterns: ['solid'], defaultColor: '#3f5a85',
    build: { shape: 'pants', fabric: 'denim', waist: 0.82, leg: 1, legLoose: 0.45, details: 'jeans' },
    status: 'ready',
  },
  {
    id: 'trousers-tailored', name: 'Tailored Trousers', description: 'Pressed trousers with a centre crease and a clean waistband.',
    layer: 'bottom', categories: ['formal', 'work'], tags: ['smart', 'long'],
    affinity: 'neutral',
    patterns: ['solid', 'pinstripe', 'plaid'], defaultColor: '#3a3b44',
    build: { shape: 'pants', fabric: 'wool', waist: 0.92, leg: 1, legLoose: 0.6, details: 'crease', waistBand: true },
    status: 'ready',
  },
  {
    id: 'shorts-casual', name: 'Casual Shorts', description: 'Above-knee cotton shorts with rolled hems.',
    layer: 'bottom', categories: ['everyday', 'athletic', 'swim'], tags: ['summer', 'casual', 'short'],
    affinity: 'neutral',
    patterns: ['solid', 'plaid', 'stripes', 'gingham'], defaultColor: '#c8b28a',
    build: { shape: 'pants', fabric: 'cotton', waist: 0.82, leg: 0.36, legLoose: 0.75, hemBand: true },
    status: 'ready',
  },
  {
    id: 'joggers', name: 'Joggers', description: 'Soft fleece joggers with an elastic waist and cuffed ankles.',
    layer: 'bottom', categories: ['athletic', 'everyday', 'sleep'], tags: ['sport', 'cosy', 'long'],
    affinity: 'neutral',
    patterns: ['solid', 'stripes'], defaultColor: '#6d6f78',
    build: { shape: 'pants', fabric: 'fleece', waist: 0.86, leg: 0.97, legLoose: 0.7, cuff: true, sideStripe: true, waistBand: true },
    status: 'ready',
  },
  {
    id: 'skirt-aline', name: 'A-Line Skirt', description: 'Knee-length skirt that flares gently from the waist.',
    layer: 'bottom', categories: ['everyday', 'formal', 'work'], tags: ['skirt', 'knee-length'],
    affinity: 'fem',
    patterns: ['solid', 'plaid', 'gingham', 'polka', 'pinstripe', 'chevron'], defaultColor: '#7b3f4f',
    build: { shape: 'skirt', fabric: 'cotton', waist: 0.95, length: 0.52, flare: 0.55, waistBand: true },
    status: 'ready',
  },
  {
    id: 'pajama-pants', name: 'Pajama Pants', description: 'Wide, relaxed flannel sleep trousers.',
    layer: 'bottom', categories: ['sleep'], tags: ['sleepwear', 'flannel', 'long'],
    affinity: 'neutral',
    patterns: ['solid', 'stripes', 'gingham', 'plaid', 'polka'], defaultColor: '#9fb7d9',
    build: { shape: 'pants', fabric: 'flannel', waist: 0.86, leg: 0.95, legLoose: 0.95, waistBand: true },
    status: 'ready',
  },
  {
    id: 'swim-trunks', name: 'Swim Trunks', description: 'Quick-dry mid-thigh swim shorts with a drawstring waist.',
    layer: 'bottom', categories: ['swim'], tags: ['swimwear', 'summer', 'short'],
    affinity: 'masc',
    patterns: ['solid', 'stripes', 'polka', 'chevron'], defaultColor: '#2f86a6',
    build: { shape: 'pants', fabric: 'nylon', waist: 0.78, leg: 0.3, legLoose: 0.8, waistBand: true },
    status: 'ready',
  },
  // ---- full ----
  {
    id: 'sundress', name: 'Sundress', description: 'Light strappy dress with a fitted bodice and a full knee-length skirt.',
    layer: 'full', categories: ['everyday', 'formal'], tags: ['dress', 'summer', 'sleeveless'],
    affinity: 'fem',
    patterns: ['solid', 'polka', 'gingham', 'stripes', 'chevron'], defaultColor: '#e7b44c',
    build: { shape: 'dress', fabric: 'cotton', sleeve: 0, neck: 'square', strap: 0.03, waist: 1.0, length: 0.55, flare: 0.8 },
    status: 'ready',
  },
  {
    id: 'dress-shirt', name: 'Shirt Dress', description: 'Collared midi dress with short sleeves, a button front and a belt line.',
    layer: 'full', categories: ['formal', 'work', 'everyday'], tags: ['dress', 'collar', 'midi'],
    affinity: 'fem',
    patterns: ['solid', 'pinstripe', 'gingham', 'plaid'], defaultColor: '#41658a',
    build: { shape: 'dress', fabric: 'poplin', sleeve: 0.3, sleeveLoose: 0.4, neck: 'collar', placket: 'buttons', waist: 0.95, length: 0.68, flare: 0.45, belt: true },
    status: 'ready',
  },
  {
    id: 'overalls', name: 'Denim Overalls', description: 'Bib overalls with shoulder straps, worn over a built-in crew tee.',
    layer: 'full', categories: ['everyday', 'work'], tags: ['denim', 'workwear', 'casual'],
    affinity: 'neutral',
    patterns: ['solid'], defaultColor: '#4a6a96',
    build: { shape: 'overalls', fabric: 'denim', leg: 1, legLoose: 0.55, shirtColor: '#f1ece2', sleeve: 0.32 },
    status: 'ready',
  },
  {
    id: 'swimsuit', name: 'One-Piece Swimsuit', description: 'Scoop-neck one-piece swimsuit with wide straps.',
    layer: 'full', categories: ['swim'], tags: ['swimwear', 'summer'],
    affinity: 'fem',
    patterns: ['solid', 'stripes', 'polka', 'chevron'], defaultColor: '#c9405a',
    build: { shape: 'swimsuit', fabric: 'lycra', strap: 0.04, neck: 'scoop' },
    status: 'ready',
  },
  {
    id: 'nightgown', name: 'Nightgown', description: 'Long, loose cotton sleep dress with short sleeves.',
    layer: 'full', categories: ['sleep'], tags: ['sleepwear', 'dress'],
    affinity: 'fem',
    patterns: ['solid', 'polka', 'gingham', 'stripes'], defaultColor: '#efe3ef',
    build: { shape: 'dress', fabric: 'cotton', sleeve: 0.22, sleeveLoose: 0.8, neck: 'scoop', waist: 1.25, length: 0.85, flare: 0.6, piping: true },
    status: 'ready',
  },
  // ---- shoes ----
  {
    id: 'sneakers', name: 'Canvas Sneakers', description: 'Low canvas sneakers with white rubber soles and laces.',
    layer: 'shoes', categories: ['everyday', 'athletic'], tags: ['casual', 'sport'],
    affinity: 'neutral',
    patterns: ['solid'], defaultColor: '#d65a4a',
    build: { shape: 'shoe', style: 'sneaker', height: 0.085, sole: 0.022, soleColor: '#f4f1ea', laces: true, toeCap: true },
    status: 'ready',
  },
  {
    id: 'boots-ankle', name: 'Ankle Boots', description: 'Sturdy leather boots that cover the ankle.',
    layer: 'shoes', categories: ['everyday', 'work', 'formal'], tags: ['leather', 'boots'],
    affinity: 'neutral',
    patterns: ['solid'], defaultColor: '#6b4630',
    build: { shape: 'shoe', style: 'boot', height: 0.2, sole: 0.026, soleColor: '#2c2420', heel: 0.012 },
    status: 'ready',
  },
  {
    id: 'loafers', name: 'Loafers', description: 'Polished slip-on loafers with a low heel.',
    layer: 'shoes', categories: ['formal', 'work'], tags: ['smart', 'leather'],
    affinity: 'neutral',
    patterns: ['solid'], defaultColor: '#3b2a22',
    build: { shape: 'shoe', style: 'loafer', height: 0.06, sole: 0.016, soleColor: '#201814', heel: 0.01, strap: true },
    status: 'ready',
  },
  {
    id: 'slippers', name: 'House Slippers', description: 'Plush closed-toe slippers for lounging and bedtime.',
    layer: 'shoes', categories: ['sleep'], tags: ['sleepwear', 'cosy'],
    affinity: 'neutral',
    patterns: ['solid', 'gingham'], defaultColor: '#c9b6d9',
    build: { shape: 'shoe', style: 'slipper', height: 0.05, sole: 0.02, soleColor: '#efe8f2', fluffy: true },
    status: 'ready',
  },
  {
    id: 'sandals-slide', name: 'Slide Sandals', description: 'Open-toe slide sandals with one wide strap.',
    layer: 'shoes', categories: ['swim', 'everyday'], tags: ['summer', 'open-toe'],
    affinity: 'neutral',
    patterns: ['solid'], defaultColor: '#3e8c7a',
    build: { shape: 'shoe', style: 'sandal', height: 0.05, sole: 0.02, soleColor: '#e8dcc6' },
    status: 'ready',
  },
];

// ---------------------------------------------------------------------------------------------
// Accessories (Milestone 1: glasses and earrings, attached to the head)
// ---------------------------------------------------------------------------------------------

export const ACCESSORIES: AccessoryDef[] = [
  { id: 'glasses-round', name: 'Round Glasses', description: 'Thin round wire frames.', kind: 'glasses', defaultColor: '#3a3632', build: { shape: 'glasses', lens: 'round', rim: 0.0022, size: 1 }, status: 'ready' },
  { id: 'glasses-square', name: 'Square Glasses', description: 'Bold rectangular frames.', kind: 'glasses', defaultColor: '#1f1b19', build: { shape: 'glasses', lens: 'square', rim: 0.0036, size: 1.05 }, status: 'ready' },
  { id: 'earrings-stud', name: 'Stud Earrings', description: 'Small round studs on both ears.', kind: 'earrings', affinity: 'neutral', defaultColor: '#e2c46b', build: { shape: 'earrings', style: 'stud', size: 0.004 }, status: 'ready' },
  { id: 'earrings-hoop', name: 'Hoop Earrings', description: 'Medium hoops on both ears.', kind: 'earrings', affinity: 'fem', defaultColor: '#d9b65a', build: { shape: 'earrings', style: 'hoop', size: 0.012 }, status: 'ready' },
];

// ---------------------------------------------------------------------------------------------
// Hair. `build` drives src/characters/hair.ts: a scalp cap (offset from the head above a hairline) plus
// style pieces. Distances in metres; the head is about 0.16 m wide.
// ---------------------------------------------------------------------------------------------

export const HAIR: HairDef[] = [
  {
    id: 'buzz', name: 'Buzz Cut', description: 'Very short, even clipper cut that follows the head.',
    length: 'shaved', texture: 'shaved', tags: ['short', 'low-maintenance'],
    build: { cap: 0.003, top: 0.003, hairline: 'natural', fringe: 0, piece: 'none', strand: 'stubble' }, status: 'ready',
  },
  {
    id: 'crop-side-part', name: 'Side-Part Crop', description: 'Short tapered sides with a neat side part and a swept fringe.',
    length: 'short', texture: 'straight', tags: ['short', 'classic'],
    build: { cap: 0.006, top: 0.02, hairline: 'natural', part: 'left', fringe: 0.25, sweep: 1, piece: 'none', strand: 'straight' }, status: 'ready',
  },
  {
    id: 'curly-top', name: 'Curly Top', description: 'Short faded sides with a crown of springy curls.',
    length: 'short', texture: 'curly', tags: ['short', 'curls'],
    build: { cap: 0.005, top: 0.012, hairline: 'natural', fringe: 0.1, piece: 'curls', curlSize: 0.017, curlCount: 46, strand: 'curly' }, status: 'ready',
  },
  {
    id: 'bob-chin', name: 'Chin-Length Bob', description: 'Smooth bob that frames the face and ends at the jaw, with soft bangs.',
    length: 'medium', texture: 'straight', tags: ['medium', 'bangs'],
    build: { cap: 0.012, top: 0.016, hairline: 'fringe', fringe: 0.75, piece: 'bob', length: 0.12, flare: 0.012, strand: 'straight' }, status: 'ready',
  },
  {
    id: 'waves-shoulder', name: 'Shoulder Waves', description: 'Center-parted waves that brush the shoulders.',
    length: 'medium', texture: 'wavy', tags: ['medium', 'waves'],
    build: { cap: 0.012, top: 0.016, hairline: 'natural', part: 'center', fringe: 0, piece: 'long', length: 0.2, wave: 0.012, strand: 'wavy' }, status: 'ready',
  },
  {
    id: 'long-straight', name: 'Long Straight', description: 'Long, sleek hair falling down the back from a center part.',
    length: 'long', texture: 'straight', tags: ['long'],
    build: { cap: 0.01, top: 0.014, hairline: 'natural', part: 'center', fringe: 0, piece: 'long', length: 0.36, wave: 0, strand: 'straight' }, status: 'ready',
  },
  {
    id: 'ponytail-high', name: 'High Ponytail', description: 'Hair pulled back smoothly into a swinging high ponytail.',
    length: 'long', texture: 'tied', tags: ['tied', 'sporty'],
    build: { cap: 0.006, top: 0.007, hairline: 'natural', fringe: 0, piece: 'ponytail', length: 0.3, strand: 'straight' }, status: 'ready',
  },
  {
    id: 'bun-top', name: 'Top Knot Bun', description: 'Sleek hair gathered into a round bun on the crown.',
    length: 'medium', texture: 'tied', tags: ['tied', 'updo'],
    build: { cap: 0.006, top: 0.007, hairline: 'natural', fringe: 0, piece: 'bun', bunSize: 0.052, strand: 'straight' }, status: 'ready',
  },
  {
    id: 'afro-coily', name: 'Coily Afro', description: 'Full rounded afro of tight coils.',
    length: 'medium', texture: 'coily', tags: ['volume', 'coils'],
    build: { cap: 0.012, top: 0.05, hairline: 'natural', fringe: 0, piece: 'afro', volume: 0.04, strand: 'coily' }, status: 'ready',
  },
  {
    id: 'braids-twin', name: 'Twin Braids', description: 'Two long plaited braids that fall behind the shoulders, center part.',
    length: 'long', texture: 'braided', tags: ['braids', 'long'],
    build: { cap: 0.006, top: 0.008, hairline: 'natural', part: 'center', fringe: 0, piece: 'braids', length: 0.3, strand: 'braided' }, status: 'ready',
  },
  // AI-HAIR-BEGIN (tools/build-ai-hair.mts content: generated hairstyles, drawn from public/assets/characters/hair/<id>.glb)
  {
    id: 'fade-crop', name: 'Skin Fade Crop', description: 'Closely faded sides and back with a short, textured crop on top.',
    length: 'short', texture: 'straight', tags: ['short', 'fade'],
    build: { kind: 'mesh', asset: 'hair/fade-crop.glb', cap: 0.004, top: 0.008, hairline: 'natural', fringe: 0.2, piece: 'none', strand: 'straight' }, status: 'ready',
  },
  {
    id: 'quiff', name: 'Classic Quiff', description: 'Tapered sides with the front swept up and back into a voluminous quiff.',
    length: 'short', texture: 'straight', tags: ['short', 'volume'],
    build: { kind: 'mesh', asset: 'hair/quiff.glb', cap: 0.006, top: 0.03, hairline: 'natural', part: 'left', fringe: 0.3, sweep: 1, piece: 'none', strand: 'straight' }, status: 'ready',
  },
  {
    id: 'slick-back', name: 'Slicked Back', description: 'Medium-length hair combed straight back with a glossy finish.',
    length: 'short', texture: 'straight', tags: ['short', 'classic'],
    build: { kind: 'mesh', asset: 'hair/slick-back.glb', cap: 0.006, top: 0.016, hairline: 'high', fringe: 0, piece: 'none', strand: 'straight' }, status: 'ready',
  },
  {
    id: 'curly-crop', name: 'Short Curls', description: 'A compact cap of loose curls, tapered at the sides.',
    length: 'short', texture: 'curly', tags: ['short', 'curls'],
    build: { kind: 'mesh', asset: 'hair/curly-crop.glb', cap: 0.005, top: 0.012, hairline: 'natural', fringe: 0.1, piece: 'curls', curlSize: 0.015, curlCount: 52, strand: 'curly' }, status: 'ready',
  },
  {
    id: 'locs-medium', name: 'Shoulder Locs', description: 'Medium-length locs that fall to the shoulders.',
    length: 'medium', texture: 'coily', tags: ['locs', 'medium'],
    build: { kind: 'mesh', asset: 'hair/locs-medium.glb', cap: 0.006, top: 0.01, hairline: 'natural', part: 'center', fringe: 0, piece: 'braids', length: 0.2, strand: 'braided' }, status: 'ready',
  },
  {
    id: 'waves-long', name: 'Long Waves', description: 'Long, soft beach waves with a gentle side part.',
    length: 'long', texture: 'wavy', tags: ['long', 'waves'],
    build: { kind: 'mesh', asset: 'hair/waves-long.glb', cap: 0.012, top: 0.016, hairline: 'natural', part: 'left', fringe: 0, piece: 'long', length: 0.3, wave: 0.014, strand: 'wavy' }, status: 'ready',
  },
  {
    id: 'bob-bangs', name: 'Blunt Bob and Bangs', description: 'A sleek jaw-length bob with full, blunt bangs.',
    length: 'medium', texture: 'straight', tags: ['medium', 'bangs'],
    build: { kind: 'mesh', asset: 'hair/bob-bangs.glb', cap: 0.012, top: 0.016, hairline: 'fringe', fringe: 0.9, piece: 'bob', length: 0.12, flare: 0.006, strand: 'straight' }, status: 'ready',
  },
  {
    id: 'pixie', name: 'Pixie Cut', description: 'Short, feathered pixie with wispy bangs.',
    length: 'short', texture: 'straight', tags: ['short', 'feathered'],
    build: { kind: 'mesh', asset: 'hair/pixie.glb', cap: 0.008, top: 0.014, hairline: 'fringe', fringe: 0.5, sweep: 1, piece: 'none', strand: 'straight' }, status: 'ready',
  },
  {
    id: 'bun-messy', name: 'High Messy Bun', description: 'Hair twisted into a loose, high bun with a few loose strands.',
    length: 'medium', texture: 'tied', tags: ['tied', 'updo'],
    build: { kind: 'mesh', asset: 'hair/bun-messy.glb', cap: 0.006, top: 0.008, hairline: 'natural', fringe: 0, piece: 'bun', bunSize: 0.056, strand: 'straight' }, status: 'ready',
  },
  {
    id: 'ponytail-low', name: 'Low Side Ponytail', description: 'Smooth hair swept back into a low ponytail that falls over one shoulder.',
    length: 'long', texture: 'tied', tags: ['tied', 'long'],
    build: { kind: 'mesh', asset: 'hair/ponytail-low.glb', cap: 0.006, top: 0.007, hairline: 'natural', fringe: 0, piece: 'ponytail', length: 0.3, strand: 'straight' }, status: 'ready',
  },
  {
    id: 'box-braids', name: 'Box Braids', description: 'Long box braids that hang down the back and shoulders.',
    length: 'long', texture: 'braided', tags: ['braids', 'long'],
    build: { kind: 'mesh', asset: 'hair/box-braids.glb', cap: 0.006, top: 0.008, hairline: 'natural', part: 'center', fringe: 0, piece: 'braids', length: 0.3, strand: 'braided' }, status: 'ready',
  },
  {
    id: 'layered-shoulder', name: 'Layered Shoulder-Length', description: 'Soft layers that end at the shoulders with face-framing pieces.',
    length: 'medium', texture: 'straight', tags: ['medium', 'layers'],
    build: { kind: 'mesh', asset: 'hair/layered-shoulder.glb', cap: 0.012, top: 0.016, hairline: 'natural', part: 'center', fringe: 0, piece: 'long', length: 0.2, wave: 0.004, strand: 'straight' }, status: 'ready',
  },
  {
    id: 'afro-puffs', name: 'Afro Puffs', description: 'Two round puffs of coily hair high on each side.',
    length: 'medium', texture: 'coily', tags: ['coils', 'tied'],
    build: { kind: 'mesh', asset: 'hair/afro-puffs.glb', cap: 0.012, top: 0.04, hairline: 'natural', fringe: 0, piece: 'afro', volume: 0.03, strand: 'coily' }, status: 'ready',
  },
  {
    id: 'wolf-cut', name: 'Shaggy Wolf Cut', description: 'Choppy, layered shag with volume on top and wispy ends.',
    length: 'medium', texture: 'wavy', tags: ['medium', 'shaggy'],
    build: { kind: 'mesh', asset: 'hair/wolf-cut.glb', cap: 0.012, top: 0.02, hairline: 'fringe', fringe: 0.6, piece: 'bob', length: 0.14, flare: 0.01, strand: 'wavy' }, status: 'ready',
  },
  {
    id: 'man-bun', name: 'Top Bun Undercut', description: 'Shaved sides with the long top gathered in a bun.',
    length: 'medium', texture: 'tied', tags: ['tied', 'undercut'],
    build: { kind: 'mesh', asset: 'hair/man-bun.glb', cap: 0.006, top: 0.008, hairline: 'natural', fringe: 0, piece: 'bun', bunSize: 0.05, strand: 'straight' }, status: 'ready',
  },
  {
    id: 'space-buns', name: 'Space Buns', description: 'Two small buns set high on either side of the head.',
    length: 'medium', texture: 'tied', tags: ['tied', 'playful'],
    build: { kind: 'mesh', asset: 'hair/space-buns.glb', cap: 0.006, top: 0.008, hairline: 'natural', part: 'center', fringe: 0, piece: 'bun', bunSize: 0.045, strand: 'straight' }, status: 'ready',
  },
  {
    id: 'pompadour', name: 'Pompadour', description: 'Tall, swept-back front with short faded sides.',
    length: 'short', texture: 'straight', tags: ['short', 'volume'],
    build: { kind: 'mesh', asset: 'hair/pompadour.glb', cap: 0.006, top: 0.035, hairline: 'natural', part: 'left', fringe: 0.2, sweep: 1, piece: 'none', strand: 'straight' }, status: 'ready',
  },
  {
    id: 'twin-tails', name: 'Pigtails', description: 'Two ponytails tied low on each side.',
    length: 'long', texture: 'tied', tags: ['tied', 'playful'],
    build: { kind: 'mesh', asset: 'hair/twin-tails.glb', cap: 0.006, top: 0.007, hairline: 'natural', part: 'center', fringe: 0, piece: 'ponytail', length: 0.3, strand: 'straight' }, status: 'ready',
  },
  // AI-HAIR-END
];

export const FACIAL_HAIR: FacialHairDef[] = [
  { id: 'stubble', name: 'Stubble', description: 'A short shadow of growth along the jaw and upper lip.', build: { kind: 'paint', amount: 1 }, status: 'ready' },
  { id: 'mustache', name: 'Mustache', description: 'A full, neatly trimmed mustache.', build: { kind: 'shell', mustache: 1, chin: 0, jaw: 0, thickness: 0.006 }, status: 'ready' },
  { id: 'goatee', name: 'Goatee', description: 'Mustache joined to a short chin beard.', build: { kind: 'shell', mustache: 1, chin: 1, jaw: 0, thickness: 0.006 }, status: 'ready' },
  { id: 'beard-short', name: 'Short Beard', description: 'Close-cropped beard along the whole jaw.', build: { kind: 'shell', mustache: 1, chin: 1, jaw: 1, thickness: 0.005 }, status: 'ready' },
  { id: 'beard-full', name: 'Full Beard', description: 'Thick, rounded full beard with a mustache.', build: { kind: 'shell', mustache: 1, chin: 1.4, jaw: 1, thickness: 0.016 }, status: 'ready' },
];

// ---------------------------------------------------------------------------------------------
// Faces
// ---------------------------------------------------------------------------------------------

export const BROW_STYLES: BrowStyle[] = [
  { id: 'natural', name: 'Natural' },
  { id: 'straight', name: 'Straight' },
  { id: 'soft-arch', name: 'Soft Arch' },
  { id: 'high-arch', name: 'High Arch' },
  { id: 'thick', name: 'Thick' },
  { id: 'thin', name: 'Thin' },
  { id: 'bushy', name: 'Bushy' },
  { id: 'angled', name: 'Angled' },
];

const P = (id: string, name: string, group: string): ParamDef => ({ id, name, group, min: -1, max: 1, step: 0.05 });

/** Face controls. Sculpt parameters become head morph targets; eye/brow/mouth placement is painted by the face shader. */
export const FACE_PARAMS: ParamDef[] = [
  P('faceLength', 'Face length', 'head'),
  P('faceWidth', 'Face width', 'head'),
  P('jawWidth', 'Jaw width', 'head'),
  P('chin', 'Chin length', 'head'),
  P('cheeks', 'Cheek fullness', 'head'),
  P('cheekbones', 'Cheekbones', 'head'),
  P('eyeSize', 'Eye size', 'eyes'),
  P('eyeSpacing', 'Eye spacing', 'eyes'),
  P('eyeTilt', 'Eye tilt', 'eyes'),
  P('eyeHeight', 'Eye height', 'eyes'),
  P('browHeight', 'Brow height', 'brows'),
  P('browTilt', 'Brow angle', 'brows'),
  P('noseWidth', 'Nose width', 'nose'),
  P('noseLength', 'Nose length', 'nose'),
  P('noseBridge', 'Nose bridge', 'nose'),
  P('mouthWidth', 'Mouth width', 'mouth'),
  P('lipFullness', 'Lip fullness', 'mouth'),
  P('earSize', 'Ear size', 'ears'),
];

export const FACE_PRESETS: FacePreset[] = [
  { id: 'face-soft-oval', name: 'Soft Oval', params: {} },
  { id: 'face-round', name: 'Round', params: { faceLength: -0.45, faceWidth: 0.4, cheeks: 0.7, chin: -0.4, jawWidth: 0.1, eyeSize: 0.3, noseLength: -0.3, lipFullness: 0.2 } },
  { id: 'face-heart', name: 'Heart', params: { jawWidth: -0.7, chin: 0.2, cheekbones: 0.6, faceWidth: 0.15, eyeSize: 0.25, eyeTilt: 0.3, lipFullness: 0.35, mouthWidth: -0.2, noseWidth: -0.3 } },
  { id: 'face-square', name: 'Square', params: { jawWidth: 0.85, chin: 0.1, faceWidth: 0.3, cheeks: -0.2, browHeight: -0.3, noseWidth: 0.35, noseBridge: 0.4, mouthWidth: 0.25, eyeSize: -0.2 } },
  { id: 'face-long', name: 'Long', params: { faceLength: 0.75, faceWidth: -0.35, chin: 0.45, cheeks: -0.4, noseLength: 0.5, noseBridge: 0.3, eyeSpacing: -0.15 } },
  { id: 'face-angular', name: 'Angular', params: { cheekbones: 0.9, cheeks: -0.7, jawWidth: 0.35, chin: 0.3, eyeTilt: 0.45, browTilt: 0.5, noseBridge: 0.6, lipFullness: -0.3 } },
  { id: 'face-gentle', name: 'Gentle', params: { cheeks: 0.35, eyeSize: 0.45, eyeTilt: -0.35, browTilt: -0.4, browHeight: 0.3, noseWidth: 0.1, lipFullness: 0.45, chin: -0.2 } },
  { id: 'face-wide-set', name: 'Wide-Set', params: { eyeSpacing: 0.7, faceWidth: 0.45, noseWidth: 0.5, noseBridge: -0.5, mouthWidth: 0.4, lipFullness: 0.5, earSize: 0.2 } },
  { id: 'face-petite', name: 'Petite Features', params: { eyeSize: 0.55, noseWidth: -0.55, noseLength: -0.45, mouthWidth: -0.4, lipFullness: 0.1, chin: -0.3, earSize: -0.4, faceLength: -0.2 } },
  { id: 'face-strong', name: 'Strong Features', params: { noseWidth: 0.6, noseLength: 0.45, noseBridge: 0.75, jawWidth: 0.55, chin: 0.55, browHeight: -0.5, eyeSize: -0.35, mouthWidth: 0.35, earSize: 0.35 } },
  { id: 'face-bright', name: 'Bright-Eyed', params: { eyeSize: 0.8, eyeHeight: -0.2, browHeight: 0.45, cheeks: 0.25, noseLength: -0.25, mouthWidth: 0.1, faceLength: -0.15 } },
  { id: 'face-narrow', name: 'Narrow', params: { faceWidth: -0.7, jawWidth: -0.35, cheeks: -0.3, eyeSpacing: -0.4, noseWidth: -0.25, noseLength: 0.25, mouthWidth: -0.3, faceLength: 0.3 } },
];

// ---------------------------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------------------------

/** Body controls (morph targets generated at load from the fitted body surface; see bodyShape.ts). */
export const BODY_PARAMS: ParamDef[] = [
  P('build', 'Build', 'overall'),
  P('muscle', 'Muscle', 'overall'),
  P('shoulders', 'Shoulder width', 'upper body'),
  P('chest', 'Chest', 'upper body'),
  P('waist', 'Waist', 'upper body'),
  P('belly', 'Belly', 'upper body'),
  P('hips', 'Hips', 'lower body'),
  P('arms', 'Arm thickness', 'limbs'),
  P('legs', 'Leg thickness', 'limbs'),
  P('neck', 'Neck thickness', 'upper body'),
];

export const BODY_PRESETS: BodyPreset[] = [
  { id: 'a-average', name: 'Average', frame: 'a', params: {} },
  { id: 'a-slim', name: 'Slim', frame: 'a', params: { build: -0.75, muscle: -0.3, shoulders: -0.3, chest: -0.3, waist: -0.4, hips: -0.3, arms: -0.4, legs: -0.4, neck: -0.3 } },
  { id: 'a-athletic', name: 'Athletic', frame: 'a', params: { muscle: 0.8, shoulders: 0.5, chest: 0.45, waist: -0.35, belly: -0.4, arms: 0.4, legs: 0.3, neck: 0.25 } },
  { id: 'a-broad', name: 'Broad', frame: 'a', params: { build: 0.35, shoulders: 0.85, chest: 0.4, muscle: 0.3, arms: 0.3, neck: 0.45 } },
  { id: 'a-soft', name: 'Soft', frame: 'a', params: { build: 0.6, belly: 0.65, waist: 0.55, hips: 0.3, chest: 0.25, arms: 0.35, legs: 0.3, muscle: -0.3 } },
  { id: 'a-stocky', name: 'Stocky', frame: 'a', params: { build: 0.85, muscle: 0.45, waist: 0.6, belly: 0.5, shoulders: 0.4, arms: 0.55, legs: 0.6, neck: 0.65 } },
  { id: 'b-average', name: 'Average', frame: 'b', params: {} },
  { id: 'b-slim', name: 'Slim', frame: 'b', params: { build: -0.75, chest: -0.35, waist: -0.4, hips: -0.4, arms: -0.4, legs: -0.4, neck: -0.25 } },
  { id: 'b-curvy', name: 'Curvy', frame: 'b', params: { chest: 0.6, waist: -0.45, hips: 0.85, legs: 0.35, build: 0.15 } },
  { id: 'b-athletic', name: 'Athletic', frame: 'b', params: { muscle: 0.75, shoulders: 0.45, waist: -0.3, belly: -0.45, arms: 0.3, legs: 0.35, chest: -0.15 } },
  { id: 'b-soft', name: 'Soft', frame: 'b', params: { build: 0.6, belly: 0.55, waist: 0.5, hips: 0.45, chest: 0.4, arms: 0.4, legs: 0.35 } },
  { id: 'b-full', name: 'Full Figure', frame: 'b', params: { build: 0.9, chest: 0.65, hips: 0.75, belly: 0.4, waist: 0.45, arms: 0.6, legs: 0.6, neck: 0.35 } },
];

// ---------------------------------------------------------------------------------------------
// Colour swatches
// ---------------------------------------------------------------------------------------------

export const SKIN_TONES: Swatch[] = [
  { id: 'skin-porcelain', name: 'Porcelain', color: '#f6e1d3' },
  { id: 'skin-ivory', name: 'Ivory', color: '#f1d5bb' },
  { id: 'skin-rose', name: 'Rose', color: '#eac2ab' },
  { id: 'skin-sand', name: 'Sand', color: '#e8c39d' },
  { id: 'skin-honey', name: 'Honey', color: '#ddb084' },
  { id: 'skin-olive', name: 'Olive', color: '#c9a072' },
  { id: 'skin-golden', name: 'Golden', color: '#c68f60' },
  { id: 'skin-rosewood', name: 'Rosewood', color: '#b37a5e' },
  { id: 'skin-caramel', name: 'Caramel', color: '#a96e47' },
  { id: 'skin-amber', name: 'Amber', color: '#95603b' },
  { id: 'skin-chestnut', name: 'Chestnut', color: '#7f5034' },
  { id: 'skin-cocoa', name: 'Cocoa', color: '#6b422b' },
  { id: 'skin-mocha', name: 'Mocha', color: '#5a3624' },
  { id: 'skin-espresso', name: 'Espresso', color: '#4a2c1e' },
  { id: 'skin-ebony', name: 'Ebony', color: '#3c2318' },
  { id: 'skin-deep', name: 'Deep Ebony', color: '#2f1b13' },
];

export const HAIR_COLORS: Swatch[] = [
  { id: 'hair-jet', name: 'Jet Black', color: '#1a1614' },
  { id: 'hair-soft-black', name: 'Soft Black', color: '#2b221e' },
  { id: 'hair-dark-brown', name: 'Dark Brown', color: '#3d2a1f' },
  { id: 'hair-chestnut', name: 'Chestnut', color: '#5b3824' },
  { id: 'hair-brown', name: 'Medium Brown', color: '#6f4b32' },
  { id: 'hair-light-brown', name: 'Light Brown', color: '#8d6744' },
  { id: 'hair-dark-blonde', name: 'Dark Blonde', color: '#a8844f' },
  { id: 'hair-honey', name: 'Honey Blonde', color: '#c8a064' },
  { id: 'hair-platinum', name: 'Platinum', color: '#e2d3ab' },
  { id: 'hair-auburn', name: 'Auburn', color: '#7c3a22' },
  { id: 'hair-copper', name: 'Copper', color: '#a6512b' },
  { id: 'hair-strawberry', name: 'Strawberry Blonde', color: '#c78a5f' },
  { id: 'hair-silver', name: 'Silver', color: '#b8b5b0' },
  { id: 'hair-white', name: 'Snow White', color: '#e7e4de' },
  { id: 'hair-rose', name: 'Pastel Pink', color: '#e6a3b7' },
  { id: 'hair-teal', name: 'Teal', color: '#3c8b8c' },
  { id: 'hair-lavender', name: 'Lavender', color: '#a48fcf' },
  { id: 'hair-cobalt', name: 'Cobalt', color: '#3a59b5' },
];

export const EYE_COLORS: Swatch[] = [
  { id: 'eye-dark-brown', name: 'Dark Brown', color: '#3a2316' },
  { id: 'eye-brown', name: 'Brown', color: '#5e3b1f' },
  { id: 'eye-hazel', name: 'Hazel', color: '#7b5b2c' },
  { id: 'eye-amber', name: 'Amber', color: '#a3722b' },
  { id: 'eye-green', name: 'Green', color: '#4e7a3b' },
  { id: 'eye-grey-green', name: 'Grey-Green', color: '#6b8170' },
  { id: 'eye-blue', name: 'Blue', color: '#3e6ea9' },
  { id: 'eye-light-blue', name: 'Light Blue', color: '#7ca6d0' },
  { id: 'eye-grey', name: 'Grey', color: '#7c8791' },
  { id: 'eye-grey-blue', name: 'Grey-Blue', color: '#5c7b96' },
  { id: 'eye-black', name: 'Black-Brown', color: '#22160f' },
  { id: 'eye-violet', name: 'Violet', color: '#6c5aa8' },
];

export const VOICES: VoicePreset[] = [
  { id: 'voice-warm', name: 'Warm' },
  { id: 'voice-bright', name: 'Bright' },
  { id: 'voice-deep', name: 'Deep' },
  { id: 'voice-soft', name: 'Soft' },
  { id: 'voice-lively', name: 'Lively' },
  { id: 'voice-calm', name: 'Calm' },
];
