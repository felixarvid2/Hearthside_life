// Milestone 10 designs, group "lighting-outdoor-kids": 57 lights, 9 outdoor pieces and 27 kids and nursery pieces.
// Models: tools/furniture-extra/m10/lighting-outdoor-kids.mjs (build: node tools/build-extra-furniture.mjs --only=lighting-outdoor-kids).
// Guide: dev/ds-tasks/m10f/AUTHORING.md. Edit only this group's files.
//
// Lights are decorative like the existing lamps (tags 'lamp' + 'light': ObjectsView makes them glow at night). Kids' pieces use the
// interactions that already admit toddlers and children (sit, sleep, nap, playWithToys, readBook, paintCanvas, changeOutfit).

import type { FinishRegion, ObjectDef, ObjectSlot, PriceTier } from '../types';
import type { ObjectKit } from '../objects';

/** Fixed-colour-free material letters of every model, in model order (w wood, W woodDark, m metal, d metalDark, l metalLight,
 *  M metalMedium, f carpet, F carpetDarker, s carpetWhite, b carpetBlue); glass and plant are never recoloured. */
const MATS: Record<string, string> = {
  floorLampArc: 'lms',
  floorLampTripod: 'msw',
  floorLampTorchiere: 'dms',
  floorLampReading: 'Wdms',
  floorLampMidCentury: 'msw',
  floorLampIndustrial: 'Mdm',
  floorLampGlobe: 'ms',
  floorLampPaper: 'ds',
  floorLampTree: 'dms',
  floorLampBrass: 'bm',
  floorLampRattan: 'Wsw',
  floorLampStack: 'dls',
  floorLampUplight: 'dms',
  floorLampCandelabra: 'dsw',
  lampBedside: 'sw',
  lampDeskArticulated: 'Mdms',
  lampBanker: 'm',
  lampCeramic: 'bsw',
  lampMushroom: 'fs',
  lampGlobeTable: 'ms',
  lampCubeTouch: 'dls',
  lampTiffany: 'Wbfw',
  lampTaper: 'ms',
  lampGourd: 'Ws',
  lampClamp: 'dfm',
  lampPharmacy: 'ds',
  lampCrystal: 'ms',
  sconceCandle: 'ds',
  sconceSwingArm: 'ms',
  sconceGlobe: 'ds',
  sconceCone: 'Mds',
  sconceLantern: 'd',
  sconceArc: 'ms',
  sconceBracketShade: 'sw',
  pendantBell: 'Mds',
  pendantGlobe: 'ms',
  chandelierTiered: 'ms',
  chandelierWheel: 'Wdsw',
  pendantTrio: 'ds',
  pendantRattan: 'Ww',
  lanternHanging: 'd',
  lanternFloor: 'Wsw',
  lanternTable: 'ds',
  candleSingle: 'msw',
  candelabra: 'msw',
  candleTrio: 'Wsw',
  fairyLightStand: 'Ww',
  lavaLamp: 'Fbfm',
  saltLamp: 'FW',
  neonSign: 'bdf',
  stringLights: 'bdw',
  tikiTorch: 'Wdfw',
  pathLight: 'ds',
  lampPost: 'ds',
  bollardLight: 'Mds',
  nightlightMoon: 'bs',
  pendantCone: 'dls',
  benchIron: 'dw',
  picnicTable: 'Ww',
  parasolStanding: 'dfs',
  porchSwing: 'Wbdw',
  deckChair: 'Wbsw',
  gasGrill: 'Mdlmw',
  planterTrough: 'Wfw',
  birdBath: 'bm',
  firePit: 'MWdfmw',
  cribModern: 'bls',
  cribCanopy: 'Fsw',
  cradleRocking: 'Wbsw',
  changingDresser: 'Wbmw',
  toyBoxLidded: 'Wbfw',
  toyBoxBench: 'Wbw',
  kidsBedHouse: 'Wfsw',
  kidsBedCar: 'Fbdfls',
  kidsBunkLadder: 'Wbfsw',
  kidsLoftBed: 'dfsw',
  kidsDeskSmall: 'Wbfmw',
  kidsChairSmall: 'fw',
  kidsTableSet: 'Wbfw',
  playKitchen: 'bdflmsw',
  dollhouse: 'FWbfsw',
  rockingHorse: 'FWdsw',
  easelKids: 'Wbfsw',
  kidsBookshelf: 'FWbfsw',
  playTent: 'Fbfsw',
  ballPit: 'bfsw',
  trainTable: 'FWbdfsw',
  activityTable: 'Wbdfsw',
  nurseryRocker: 'FWfw',
  babyBouncer: 'bdfs',
  kidsWardrobe: 'FWbdflsw',
  kidsBeanBag: 'Ff',
  puppetTheater: 'Fbfsw',};

type Fit = ReturnType<ObjectKit['fit']>;
type Kind = 'floor' | 'table' | 'wall' | 'ceiling' | 'garden';

/** One light: model, id, name, kind, style, tier, price in dollars, quality, description. */
interface Lamp { a: string; id: string; n: string; kind: Kind; style: string; tier: PriceTier; p: number; q: number; d: string; lift?: number; rooms?: string[] }

const PACK_OF_STYLE: Record<string, string> = {
  modern: 'modern-minimal', 'mid-century': 'mid-century', industrial: 'industrial-loft', cottage: 'cozy-cottage', rustic: 'cozy-cottage',
  classic: 'classic-townhouse', luxury: 'classic-townhouse', coastal: 'coastal-home', retro: 'mid-century', playful: 'kids-storybook', botanical: 'botanical-living',
};

const LAMPS: Lamp[] = [
  // floor lamps
  { a: 'floorLampArc', id: 'lamp-floor-arc', n: 'Arc Floor Lamp', kind: 'floor', style: 'modern', tier: 'standard', p: 220, q: 3, d: 'A marble block anchors a long steel arc that hangs its shade over the sofa. Glows at night. Decorative.' },
  { a: 'floorLampTripod', id: 'lamp-floor-tripod', n: 'Tripod Floor Lamp', kind: 'floor', style: 'mid-century', tier: 'standard', p: 150, q: 3, d: 'Three splayed wooden legs under a wide drum shade: a Scandinavian classic. Glows at night. Decorative.' },
  { a: 'floorLampTorchiere', id: 'lamp-floor-torchiere', n: 'Torchiere Floor Lamp', kind: 'floor', style: 'classic', tier: 'budget', p: 70, q: 2, d: 'A slim pole with an upward-facing bowl that floods the ceiling with soft light. Decorative.' },
  { a: 'floorLampReading', id: 'lamp-floor-reading', n: 'Reading Floor Lamp', kind: 'floor', style: 'modern', tier: 'standard', p: 135, q: 3, d: 'A bendy arm and a small shelf for your book and cup of tea, beside the armchair. Decorative.' },
  { a: 'floorLampMidCentury', id: 'lamp-floor-cone', n: 'Cone-Shade Floor Lamp', kind: 'floor', style: 'mid-century', tier: 'premium', p: 480, q: 4, d: 'A wide cone shade on three tapered teak legs. The centrepiece of a retro living room. Decorative.' },
  { a: 'floorLampIndustrial', id: 'lamp-floor-industrial', n: 'Industrial Pipe Floor Lamp', kind: 'floor', style: 'industrial', tier: 'standard', p: 190, q: 3, d: 'Black iron pipe on a cast base with a metal dome shade. Glows at night. Decorative.' },
  { a: 'floorLampGlobe', id: 'lamp-floor-globe', n: 'Globe Floor Lamp', kind: 'floor', style: 'modern', tier: 'budget', p: 95, q: 2, d: 'An opal glass globe on a thin steel stem. A soft, even glow. Decorative.' },
  { a: 'floorLampPaper', id: 'lamp-floor-paper', n: 'Paper Lantern Floor Lamp', kind: 'floor', style: 'modern', tier: 'budget', p: 60, q: 2, d: 'A big faceted paper shade on three thin black legs. Cheap, light and bright. Decorative.' },
  { a: 'floorLampTree', id: 'lamp-floor-tree', n: 'Three-Arm Tree Lamp', kind: 'floor', style: 'classic', tier: 'standard', p: 260, q: 3, d: 'Four little shades on reaching arms light every corner of the room from one spot. Decorative.' },
  { a: 'floorLampBrass', id: 'lamp-floor-brass', n: 'Brass Library Lamp', kind: 'floor', style: 'luxury', tier: 'premium', p: 720, q: 4, d: 'A turned brass column under a deep blue shade, the kind that stands beside a leather chair. Decorative.' },
  { a: 'floorLampRattan', id: 'lamp-floor-rattan', n: 'Rattan Column Lamp', kind: 'floor', style: 'coastal', tier: 'budget', p: 110, q: 2, d: 'A woven column base and a linen drum: easy, breezy and warm. Decorative.' },
  { a: 'floorLampStack', id: 'lamp-floor-stack', n: 'Stacked-Cube Floor Lamp', kind: 'floor', style: 'modern', tier: 'standard', p: 175, q: 3, d: 'Three glowing cubes in a stack on a slender rod. Decorative.' },
  { a: 'floorLampUplight', id: 'lamp-floor-uplight', n: 'Slim Uplight Column', kind: 'floor', style: 'modern', tier: 'budget', p: 80, q: 2, d: 'A narrow black column with a frosted head that lights the wall above it. Decorative.' },
  { a: 'floorLampCandelabra', id: 'lamp-floor-candelabra', n: 'Iron Candelabra Stand', kind: 'floor', style: 'rustic', tier: 'standard', p: 310, q: 3, d: 'Five candles on a tall wrought-iron stand: dinner by candlelight, every night. Decorative.' },
  // table lamps
  { a: 'lampBedside', id: 'lamp-table-bedside', n: 'Bedside Lamp', kind: 'table', style: 'cottage', tier: 'budget', p: 35, q: 2, d: 'A small wooden-footed lamp with a drum shade for the nightstand. Decorative.' },
  { a: 'lampDeskArticulated', id: 'lamp-table-desk-arm', n: 'Articulated Desk Lamp', kind: 'table', style: 'industrial', tier: 'budget', p: 55, q: 2, d: 'A two-jointed arm and a dome head to point the light at the page. Stands on a desk or table. Decorative.', rooms: ['study', 'bedroom'] },
  { a: 'lampBanker', id: 'lamp-table-banker', n: "Banker's Lamp", kind: 'table', style: 'classic', tier: 'standard', p: 140, q: 3, d: 'A brass base and a long green glass shade. Looks right on a writing desk. Decorative.', rooms: ['study', 'living'] },
  { a: 'lampCeramic', id: 'lamp-table-ceramic', n: 'Blue Ceramic Lamp', kind: 'table', style: 'cottage', tier: 'standard', p: 120, q: 3, d: 'A glazed ceramic base in a deep blue with a pale drum shade. Decorative.' },
  { a: 'lampMushroom', id: 'lamp-table-mushroom', n: 'Mushroom Lamp', kind: 'table', style: 'mid-century', tier: 'standard', p: 130, q: 3, d: 'A round enamel dome on a short stem, straight out of the seventies. Decorative.' },
  { a: 'lampGlobeTable', id: 'lamp-table-globe', n: 'Globe Table Lamp', kind: 'table', style: 'modern', tier: 'budget', p: 50, q: 2, d: 'An opal glass ball on a steel foot. Decorative.' },
  { a: 'lampCubeTouch', id: 'lamp-table-cube', n: 'Touch Cube Lamp', kind: 'table', style: 'modern', tier: 'budget', p: 40, q: 2, d: 'A frosted cube that glows when touched. Small enough for any shelf. Decorative.' },
  { a: 'lampTiffany', id: 'lamp-table-stained', n: 'Stained-Glass Lamp', kind: 'table', style: 'luxury', tier: 'premium', p: 560, q: 4, d: 'A domed shade of coloured glass panes on a bronze stem. Throws patches of colour on the table. Decorative.' },
  { a: 'lampTaper', id: 'lamp-table-taper', n: 'Tapered Table Lamp', kind: 'table', style: 'classic', tier: 'budget', p: 65, q: 2, d: 'A tall empire shade on a slim base. Decorative.' },
  { a: 'lampGourd', id: 'lamp-table-gourd', n: 'Gourd Table Lamp', kind: 'table', style: 'rustic', tier: 'standard', p: 115, q: 3, d: 'A turned wooden gourd base under a linen shade. Decorative.' },
  { a: 'lampClamp', id: 'lamp-table-clip', n: 'Clip-On Lamp', kind: 'table', style: 'modern', tier: 'budget', p: 25, q: 1, d: 'A little red cone on a bendy neck: the cheapest light in the catalog. Decorative.', rooms: ['study', 'bedroom', 'kids'] },
  { a: 'lampPharmacy', id: 'lamp-table-pharmacy', n: 'Pharmacy Lamp', kind: 'table', style: 'industrial', tier: 'standard', p: 150, q: 3, d: 'A tall post and a swing arm that hangs a glass shade over the desk. Decorative.', rooms: ['study', 'living', 'bedroom'] },
  { a: 'lampCrystal', id: 'lamp-table-crystal', n: 'Crystal Table Lamp', kind: 'table', style: 'luxury', tier: 'luxury', p: 1450, q: 5, d: 'A cut-glass base on a silver foot with a pleated shade. The best light money can buy. Decorative.' },
  // wall lights
  { a: 'sconceCandle', id: 'sconce-candle', n: 'Candle Sconce', kind: 'wall', style: 'classic', tier: 'budget', p: 70, q: 2, d: 'An iron bracket with a single candle. Hangs on any free stretch of wall.' },
  { a: 'sconceSwingArm', id: 'sconce-swing-arm', n: 'Swing-Arm Sconce', kind: 'wall', style: 'industrial', tier: 'budget', p: 90, q: 2, d: 'A long metal arm that reaches out from the wall with a funnel shade. Hangs on any free stretch of wall.' },
  { a: 'sconceGlobe', id: 'sconce-globe', n: 'Globe Sconce', kind: 'wall', style: 'modern', tier: 'budget', p: 65, q: 2, d: 'A frosted ball on a small black plate. Hangs on any free stretch of wall.' },
  { a: 'sconceCone', id: 'sconce-up-down', n: 'Up-Down Sconce', kind: 'wall', style: 'modern', tier: 'standard', p: 130, q: 3, d: 'A slim cylinder that washes the wall above and below it with light. Hangs on any free stretch of wall.' },
  { a: 'sconceLantern', id: 'sconce-lantern', n: 'Lantern Sconce', kind: 'wall', style: 'rustic', tier: 'standard', p: 110, q: 3, d: 'A glass lantern on an iron arm, for the porch or the hallway. Hangs on any free stretch of wall.', rooms: ['living', 'bedroom', 'study', 'outdoor'] },
  { a: 'sconceArc', id: 'sconce-arc', n: 'Arc Sconce', kind: 'wall', style: 'mid-century', tier: 'standard', p: 160, q: 3, d: 'A curved steel arm that tips a dish of light out into the room. Hangs on any free stretch of wall.' },
  { a: 'sconceBracketShade', id: 'sconce-bracket', n: 'Bracket Shade Sconce', kind: 'wall', style: 'cottage', tier: 'budget', p: 55, q: 2, d: 'A wooden bracket with a gathered shade, like a lamp that grew out of the wall. Hangs on any free stretch of wall.' },
  { a: 'neonSign', id: 'sign-neon-heart', n: 'Neon Heart Sign', kind: 'wall', style: 'retro', tier: 'standard', p: 180, q: 3, d: 'A red heart and a blue squiggle in glowing tube. Pure atmosphere. Hangs on any free stretch of wall.', lift: 1.4, rooms: ['living', 'bedroom', 'study', 'kitchen'] },
  { a: 'stringLights', id: 'string-lights-wall', n: 'Draped String Lights', kind: 'wall', style: 'cottage', tier: 'budget', p: 40, q: 2, d: 'A swag of little lanterns hung from two hooks. Hangs on any free stretch of wall.', lift: 1.9, rooms: ['living', 'bedroom', 'kids', 'outdoor'] },
  // ceiling lights
  { a: 'pendantBell', id: 'pendant-bell', n: 'Bell Pendant', kind: 'ceiling', style: 'industrial', tier: 'budget', p: 95, q: 2, d: 'A dark metal bell on a long cord. Lights the table below it at night.' },
  { a: 'pendantGlobe', id: 'pendant-globe', n: 'Globe Pendant', kind: 'ceiling', style: 'modern', tier: 'budget', p: 85, q: 2, d: 'A white glass globe hanging on a thin cord.' },
  { a: 'chandelierTiered', id: 'chandelier-tiered', n: 'Crystal Tier Chandelier', kind: 'ceiling', style: 'luxury', tier: 'luxury', p: 1600, q: 5, d: 'Two rings of candle lights around a crystal drop. The grandest ceiling light in the catalog.', rooms: ['living', 'dining', 'bedroom'] },
  { a: 'chandelierWheel', id: 'chandelier-wheel', n: 'Wagon-Wheel Chandelier', kind: 'ceiling', style: 'rustic', tier: 'premium', p: 520, q: 4, d: 'A wooden wheel on chains with a ring of candle bulbs. Hearty and warm.', rooms: ['living', 'kitchen', 'dining'] },
  { a: 'pendantTrio', id: 'pendant-trio-bar', n: 'Trio Bar Pendant', kind: 'ceiling', style: 'modern', tier: 'standard', p: 280, q: 3, d: 'Three drop shades at different heights on one bar. A good light over a long table or a counter.', rooms: ['kitchen', 'dining', 'living'] },
  { a: 'pendantRattan', id: 'pendant-rattan', n: 'Rattan Pendant', kind: 'ceiling', style: 'coastal', tier: 'standard', p: 160, q: 3, d: 'A woven dome that dapples the room with light, like sun through palm leaves.' },
  { a: 'lanternHanging', id: 'lantern-hanging', n: 'Hanging Lantern', kind: 'ceiling', style: 'rustic', tier: 'budget', p: 90, q: 2, d: 'A glass-and-iron lantern on a cord. Warm light from above.', rooms: ['living', 'kitchen', 'dining', 'bedroom', 'outdoor'] },
  { a: 'pendantCone', id: 'pendant-cone', n: 'Cone Pendant', kind: 'ceiling', style: 'mid-century', tier: 'standard', p: 140, q: 3, d: 'A bright metal cone with a white diffuser. Throws a clean pool of light below.' },
  // lanterns, candles and mood lights
  { a: 'lanternFloor', id: 'lantern-floor', n: 'Floor Lantern', kind: 'floor', style: 'rustic', tier: 'standard', p: 200, q: 3, d: 'A knee-high wooden lantern with glass sides and a fat candle inside. Glows at night. Decorative.' },
  { a: 'lanternTable', id: 'lantern-table', n: 'Table Lantern', kind: 'table', style: 'rustic', tier: 'budget', p: 45, q: 2, d: 'A small iron lantern with a candle. Stands on a table, shelf or nightstand. Decorative.' },
  { a: 'candleSingle', id: 'candle-brass', n: 'Brass Candlestick', kind: 'table', style: 'classic', tier: 'budget', p: 20, q: 1, d: 'One candle in a brass holder. Decorative.' },
  { a: 'candelabra', id: 'candelabra-three', n: 'Three-Arm Candelabra', kind: 'table', style: 'luxury', tier: 'premium', p: 480, q: 4, d: 'Three candles on a silver stem for the dining table or the mantel. Decorative.', rooms: ['dining', 'living', 'bedroom'] },
  { a: 'candleTrio', id: 'candle-trio', n: 'Pillar Candle Trio', kind: 'table', style: 'cottage', tier: 'budget', p: 30, q: 2, d: 'Three pillar candles of different heights on a wooden board. Decorative.' },
  { a: 'fairyLightStand', id: 'fairy-light-branch', n: 'Fairy-Light Branch', kind: 'floor', style: 'cottage', tier: 'standard', p: 120, q: 3, d: 'A bare birch branch in a wooden base, strung with tiny warm lights. Decorative.' },
  { a: 'lavaLamp', id: 'lava-lamp', n: 'Lava Lamp', kind: 'table', style: 'retro', tier: 'budget', p: 40, q: 2, d: 'Red wax rises and falls in a glowing glass. Hypnotic. Decorative.' },
  { a: 'saltLamp', id: 'salt-lamp', n: 'Salt Rock Lamp', kind: 'table', style: 'modern', tier: 'budget', p: 45, q: 2, d: 'A lump of rock salt on a wooden base with a warm amber glow. Decorative.' },
  { a: 'nightlightMoon', id: 'nightlight-moon', n: 'Moon Nightlight', kind: 'table', style: 'playful', tier: 'budget', p: 22, q: 1, d: 'A soft blue night light with a little switch, for the nursery and the kids room. Decorative.', rooms: ['kids', 'bedroom'] },
  { a: 'tikiTorch', id: 'garden-tiki-torch', n: 'Tiki Torch', kind: 'garden', style: 'coastal', tier: 'budget', p: 35, q: 1, d: 'A tall bamboo torch with a flickering flame for summer evenings in the garden.' },
  { a: 'pathLight', id: 'garden-path-light', n: 'Garden Path Light', kind: 'garden', style: 'cottage', tier: 'budget', p: 40, q: 2, d: 'A small lantern on a stake that lights the path to the door.' },
  { a: 'lampPost', id: 'garden-lamp-post', n: 'Garden Lamp Post', kind: 'garden', style: 'classic', tier: 'standard', p: 340, q: 3, d: 'A tall cast-iron lamp post with a glass lantern. Lights a whole corner of the garden.' },
  { a: 'bollardLight', id: 'garden-bollard-light', n: 'Bollard Light', kind: 'garden', style: 'modern', tier: 'standard', p: 120, q: 3, d: 'A low steel post with a ring of light. Marks the edge of a path or a drive.' },
];

export default function build(k: ObjectKit): ObjectDef[] {
  const { fit, obj, sit, sleep, useFront, region, sw, WOOD, METAL, METAL_MEDIUM, METAL_DARK, FABRIC, FABRIC_BLUE, FABRIC_BRICK, APPLIANCE, r3, FP11, FP21, FP12, FP22, WALL_GAP, MODEL_BOUNDS, dollars } = k;
  const CEILING = 2.8; // wall height; ceiling lights hang from it

  /** Finish regions of a model, from its material letters (see MATS). */
  const finishes = (asset: string, shadeLabel: string): FinishRegion[] => {
    const s = MATS[asset] ?? '';
    const has = (c: string) => s.includes(c);
    const out: FinishRegion[] = [];
    if (has('w') || has('W')) {
      out.push(region('wood', 'Wood', [has('w') ? 'wood' : '', has('W') ? 'woodDark' : ''].filter(Boolean), has('w') ? WOOD : [sw('dark-wood', 'Dark Wood', '#ad744c'), ...WOOD.slice(1)]));
    }
    if (has('m')) out.push(region('metal', 'Metal', ['metal'], METAL));
    if (has('d') || has('M')) out.push(region('frame', 'Frame', [has('d') ? 'metalDark' : '', has('M') ? 'metalMedium' : ''].filter(Boolean), has('d') ? METAL_DARK : METAL_MEDIUM));
    if (has('l')) out.push(region('trim', 'Trim', ['metalLight'], APPLIANCE));
    if (has('f') || has('F')) out.push(region('fabric', 'Fabric', [has('f') ? 'carpet' : '', has('F') ? 'carpetDarker' : ''].filter(Boolean), has('f') ? FABRIC : FABRIC_BRICK));
    if (has('b')) out.push(region('accent', 'Accent', ['carpetBlue'], FABRIC_BLUE));
    if (has('s')) out.push(region('shade', shadeLabel, ['carpetWhite'], [sw('warm-white', 'Warm White', '#f8ffff'), ...FABRIC.slice(1)]));
    return out;
  };

  const lights = LAMPS.map((l): ObjectDef => {
    const env = l.tier === 'luxury' ? 3 : l.tier === 'budget' ? 1 : 2;
    const packs = ['everyday-essentials', ...(PACK_OF_STYLE[l.style] ? [PACK_OF_STYLE[l.style]!] : []), ...(l.kind === 'garden' ? ['garden-patio'] : [])];
    const base = {
      id: l.id, name: l.n, category: 'lighting' as const, style: l.style, description: l.d, packs, tier: l.tier, price: dollars(l.p), quality: l.q,
      functional: false, footprint: FP11, stats: { environment: env }, finishes: finishes(l.a, 'Shade'),
    };
    const tags = ['lamp', 'light', 'decor'];
    switch (l.kind) {
      case 'floor':
        return obj(fit(l.a, FP11, 2), { ...base, subcategory: 'floor-lamp', rooms: l.rooms ?? ['living', 'bedroom', 'study'], tags, layer: 'floor', blocksMovement: true });
      case 'table':
        return obj(fit(l.a, FP11, 2), { ...base, subcategory: l.a.startsWith('candle') || l.a === 'candelabra' ? 'candle' : 'table-lamp', rooms: l.rooms ?? ['living', 'bedroom', 'study'], tags, layer: 'surface', blocksMovement: false });
      case 'wall':
        return obj(fit(l.a, FP11, 2, { back: WALL_GAP, lift: l.lift ?? 1.6 }), {
          ...base, subcategory: 'wall-lamp', rooms: l.rooms ?? ['living', 'bedroom', 'bathroom', 'study'], tags: [...tags, 'wall'], layer: 'wall', needsWall: true, blocksMovement: false,
        });
      case 'ceiling': {
        const [bmin, bmax] = MODEL_BOUNDS[l.a]!;
        const h = (bmax[1] - bmin[1]) * 2;
        return obj(fit(l.a, FP11, 2, { lift: r3(CEILING - h) }), {
          ...base, subcategory: 'ceiling-light', rooms: l.rooms ?? ['living', 'bedroom', 'kitchen', 'study'], tags: [...tags, 'ceiling'], layer: 'ceiling', blocksMovement: false,
        });
      }
      case 'garden':
        return obj(fit(l.a, FP11, 2), { ...base, subcategory: 'outdoor-light', rooms: ['outdoor'], tags: [...tags, 'outdoor', 'garden'], layer: 'floor', blocksMovement: true });
    }
  });

  // ---- outdoor and kids: written out, one design each ----
  type Foot = typeof FP11;
  interface Piece {
    a: string; id: string; n: string; cat: 'outdoor' | 'kids' | 'beds'; sub: string; rooms: string[]; style: string; d: string; tags: string[]; packs: string[];
    tier: PriceTier; p: number; q: number; fp?: Foot; back?: boolean; ints?: string[]; stats?: Record<string, number>; surf?: number; fn?: boolean;
    slots?: (f: Fit, fp: Foot) => ObjectSlot[]; anim?: ObjectDef['anim']; shadeLabel?: string;
  }
  const KIDS = ['kids', 'bedroom'];
  const SB = ['kids-storybook'];
  const SBC = ['kids-storybook', 'cozy-cottage'];
  const GP = ['garden-patio'];
  const useAt = (x = 0.5) => (f: Fit, fp: Foot) => [useFront('use', x, f, fp.d)];
  const bedSlot = (h: number, approach: [number, number] = [1, 1]) => (f: Fit) => [sleep('sleep', f.at(0.5, 0.5), h, approach)];
  const seatAt = (h: number, approach: [number, number] = [0, 1], fz = 0.55) => (f: Fit) => [sit('seat', f.at(0.5, fz), h, approach)];
  const toyStats = { fun: 1, environment: 1 };

  const PIECES: Piece[] = [
    // --- outdoor
    { a: 'benchIron', id: 'bench-garden-iron', n: 'Cast-Iron Garden Bench', cat: 'outdoor', sub: 'bench', rooms: ['outdoor'], style: 'classic', d: 'A two-seat park bench of black cast-iron ends and wooden slats, with a curved back. Sit and watch the clouds.',
      tags: ['bench', 'seat', 'outdoor'], packs: ['garden-patio', 'classic-townhouse'], tier: 'standard', p: 340, q: 4, fp: FP21, ints: ['sit', 'watchClouds'], stats: { comfort: 4, environment: 2 },
      slots: (f) => [sit('left', f.at(0.27, 0.6), 0.5, [0, 1]), sit('right', f.at(0.73, 0.6), 0.5, [1, 1])] },
    { a: 'picnicTable', id: 'table-picnic', n: 'Picnic Table', cat: 'outdoor', sub: 'table', rooms: ['outdoor', 'dining'], style: 'rustic', d: 'A sturdy wooden picnic table with two benches built in. Meals can be served here; unpack a picnic at the table.',
      tags: ['table', 'dining', 'surface', 'outdoor', 'cleanable'], packs: GP, tier: 'standard', p: 280, q: 3, fp: FP22, surf: 0.76, ints: ['havePicnic'], stats: { environment: 2 } },
    { a: 'parasolStanding', id: 'parasol-standing', n: 'Standing Parasol', cat: 'outdoor', sub: 'shade', rooms: ['outdoor'], style: 'coastal', d: 'A striped parasol on a heavy base: instant shade for a lounger or a table. Decorative.',
      tags: ['parasol', 'decor', 'outdoor'], packs: ['garden-patio', 'coastal-home'], tier: 'budget', p: 120, q: 2, fn: false, stats: { environment: 2 } },
    { a: 'porchSwing', id: 'swing-porch', n: 'Porch Swing', cat: 'outdoor', sub: 'bench', rooms: ['outdoor'], style: 'cottage', d: 'A cushioned two-seat swing on chains from a timber A-frame. Rock gently, or watch the clouds go by.',
      tags: ['bench', 'seat', 'swing', 'outdoor'], packs: ['garden-patio', 'cozy-cottage'], tier: 'premium', p: 560, q: 4, fp: FP21, ints: ['sit', 'swing', 'watchClouds'], stats: { comfort: 5, fun: 0.6, environment: 3 },
      slots: (f) => [sit('left', f.at(0.3, 0.5), 0.55, [0, 1]), sit('right', f.at(0.7, 0.5), 0.55, [1, 1])] },
    { a: 'deckChair', id: 'chair-deck', n: 'Folding Deck Chair', cat: 'outdoor', sub: 'chair', rooms: ['outdoor'], style: 'coastal', d: 'A canvas deck chair with a wooden frame. Cheap, foldable and good for an afternoon of cloud-watching.',
      tags: ['chair', 'seat', 'outdoor'], packs: ['garden-patio', 'coastal-home'], tier: 'budget', p: 70, q: 2, ints: ['sit', 'watchClouds'], stats: { comfort: 4, environment: 1 }, slots: seatAt(0.4, [0, 1], 0.5) },
    { a: 'gasGrill', id: 'grill-gas', n: 'Gas Barbecue', cat: 'outdoor', sub: 'grill', rooms: ['outdoor'], style: 'modern', d: 'A four-burner gas grill on a steel trolley with a side shelf. Grill a plateful outdoors for $6.',
      tags: ['grill', 'cooking', 'outdoor', 'cleanable'], packs: GP, tier: 'premium', p: 640, q: 4, ints: ['grillFood'], stats: { cooking: 1 }, slots: useAt() },
    { a: 'planterTrough', id: 'planter-trough', n: 'Trough Planter', cat: 'outdoor', sub: 'planter', rooms: ['outdoor'], style: 'botanical', d: 'A timber trough of leafy herbs and red blooms for the edge of the patio. Water it to train Gardening.',
      tags: ['plant', 'garden', 'decor', 'outdoor'], packs: ['garden-patio', 'botanical-living'], tier: 'budget', p: 90, q: 2, ints: ['waterPlant'], stats: { environment: 2 } },
    { a: 'birdBath', id: 'bird-bath', n: 'Stone Bird Bath', cat: 'outdoor', sub: 'garden', rooms: ['outdoor'], style: 'classic', d: 'A shallow stone basin on a pedestal. The birds love it, and so will the garden. Decorative.',
      tags: ['decor', 'outdoor', 'garden', 'water'], packs: ['garden-patio', 'botanical-living'], tier: 'standard', p: 180, q: 3, fn: false, stats: { environment: 3 } },
    { a: 'firePit', id: 'fire-pit', n: 'Stone Fire Pit', cat: 'outdoor', sub: 'garden', rooms: ['outdoor'], style: 'rustic', d: 'A ring of rough stones round a crackling campfire. Gather around it on a cool evening. Decorative.',
      tags: ['fire-pit', 'decor', 'outdoor'], packs: GP, tier: 'standard', p: 260, q: 3, fn: false, stats: { environment: 3 } },
    // --- kids and nursery
    { a: 'cribModern', id: 'crib-modern', n: 'Slim Modern Crib', cat: 'kids', sub: 'crib', rooms: KIDS, style: 'modern', d: 'A white crib with fine vertical bars and a blue mattress pad. Sleep or nap; it is entered from the side.',
      tags: ['bed', 'crib', 'sleep', 'cleanable'], packs: ['kids-storybook', 'modern-minimal'], tier: 'standard', p: 340, q: 3, fp: FP12, ints: ['sleep', 'nap'], stats: { energy: 0.75, comfort: 4, environment: 1 }, slots: bedSlot(0.38), shadeLabel: 'Bedding' },
    { a: 'cribCanopy', id: 'crib-canopy', n: 'Canopy Crib', cat: 'kids', sub: 'crib', rooms: KIDS, style: 'cottage', d: 'A pine crib with a high rail and a little canopy post. Sleep or nap; it is entered from the side.',
      tags: ['bed', 'crib', 'sleep', 'cleanable'], packs: SBC, tier: 'premium', p: 520, q: 4, fp: FP12, ints: ['sleep', 'nap'], stats: { energy: 0.8, comfort: 4, environment: 2 }, slots: bedSlot(0.36), shadeLabel: 'Bedding' },
    { a: 'cradleRocking', id: 'cradle-rocking', n: 'Rocking Cradle', cat: 'kids', sub: 'crib', rooms: KIDS, style: 'rustic', d: 'A wooden cradle on curved rockers: a newborn drifts off to its gentle sway.',
      tags: ['bed', 'bassinet', 'sleep', 'cleanable'], packs: SBC, tier: 'budget', p: 150, q: 2, ints: ['sleep', 'nap'], stats: { energy: 0.65, comfort: 3, environment: 1 }, slots: bedSlot(0.46, [0, 1]), shadeLabel: 'Bedding' },
    { a: 'changingDresser', id: 'changing-dresser', n: 'Changing Dresser', cat: 'kids', sub: 'changing', rooms: ['kids', 'bathroom', 'bedroom'], style: 'classic', d: 'A three-drawer dresser topped with a padded changing tray and low rails. Changing a baby here leaves them a little fresher.',
      tags: ['changing-table', 'kids', 'storage', 'surface'], packs: SBC, tier: 'standard', p: 380, q: 3, back: true, surf: 1, stats: { environment: 1 } },
    { a: 'toyBoxLidded', id: 'toy-box-lidded', n: 'Lidded Toy Box', cat: 'kids', sub: 'toys', rooms: ['kids', 'bedroom', 'living'], style: 'playful', d: 'A wooden box with a hinged lid and a painted front, full of blocks and bears. The lid lifts while somebody digs in.',
      tags: ['toys', 'storage', 'play'], packs: SB, tier: 'budget', p: 95, q: 2, back: true, ints: ['playWithToys'], stats: toyStats, slots: useAt(),
      anim: { kind: 'openWhileUsed', on: ['playWithToys'], parts: [{ node: 'anim:lid', role: 'lid', axis: 'x', angle: -1.6 }] } },
    { a: 'toyBoxBench', id: 'toy-bench', n: 'Toy Storage Bench', cat: 'kids', sub: 'toys', rooms: ['kids', 'bedroom', 'living'], style: 'cottage', d: 'A long padded bench that opens up into a toy chest. Sit on it, or flip the lid and play.',
      tags: ['toys', 'storage', 'play'], packs: SBC, tier: 'standard', p: 210, q: 3, fp: FP21, back: true, ints: ['playWithToys'], stats: { fun: 1, comfort: 1, environment: 1 }, slots: useAt(1),
      anim: { kind: 'openWhileUsed', on: ['playWithToys'], parts: [{ node: 'anim:lid', role: 'lid', axis: 'x', angle: -1.6 }] } },
    { a: 'kidsBedHouse', id: 'bed-kids-house', n: 'House-Frame Bed', cat: 'kids', sub: 'bed', rooms: KIDS, style: 'cottage', d: 'A single bed under a little timber house frame: the first bed that feels like a den.',
      tags: ['bed', 'single', 'sleep', 'cleanable'], packs: SBC, tier: 'standard', p: 420, q: 3, fp: FP12, ints: ['sleep', 'nap'], stats: { energy: 0.85, comfort: 4, environment: 2 }, slots: bedSlot(0.36), shadeLabel: 'Sheets' },
    { a: 'kidsBedCar', id: 'bed-kids-car', n: 'Race-Car Bed', cat: 'kids', sub: 'bed', rooms: KIDS, style: 'playful', d: 'A red race car with a mattress for a cockpit. Bedtime has never been so fast.',
      tags: ['bed', 'single', 'sleep', 'cleanable'], packs: SB, tier: 'standard', p: 480, q: 3, fp: FP12, ints: ['sleep', 'nap'], stats: { energy: 0.85, comfort: 3, environment: 2 }, slots: bedSlot(0.7), shadeLabel: 'Sheets' },
    { a: 'kidsBunkLadder', id: 'bed-bunk-ladder', n: 'Ladder Bunk Bed', cat: 'kids', sub: 'bed', rooms: KIDS, style: 'cottage', d: 'A narrow pine bunk bed with a ladder, guard rails and two mattresses. Both bunks are entered from the right.',
      tags: ['bed', 'bunk', 'sleep', 'cleanable'], packs: SBC, tier: 'standard', p: 680, q: 3, fp: FP12, ints: ['sleep', 'nap'], stats: { energy: 0.85, comfort: 4, environment: 1 },
      slots: (f) => [sleep('lower', f.at(0.5, 0.5), 0.46, [1, 1]), sleep('upper', f.at(0.5, 0.5), 1.26, [1, 1])], shadeLabel: 'Sheets' },
    { a: 'kidsLoftBed', id: 'bed-kids-loft', n: 'Steel Loft Bed', cat: 'kids', sub: 'bed', rooms: ['kids', 'bedroom', 'study'], style: 'industrial', d: 'A high steel bed with a small desk tucked underneath: a bedroom in one tile and a half.',
      tags: ['bed', 'loft', 'sleep', 'cleanable'], packs: ['kids-storybook', 'industrial-loft'], tier: 'premium', p: 760, q: 4, fp: FP12, ints: ['sleep', 'nap'], stats: { energy: 0.9, comfort: 4, environment: 2 }, slots: bedSlot(1.28), shadeLabel: 'Sheets' },
    { a: 'kidsDeskSmall', id: 'desk-kids', n: "Child's Desk", cat: 'kids', sub: 'desk', rooms: ['kids', 'bedroom', 'study'], style: 'playful', d: 'A small desk with a drawer and a blotter, the right height for little legs. Homework gets done here.',
      tags: ['desk', 'surface', 'kids'], packs: SB, tier: 'budget', p: 120, q: 2, surf: 0.6, back: true, stats: { environment: 1 } },
    { a: 'kidsChairSmall', id: 'chair-kids', n: "Child's Chair", cat: 'kids', sub: 'chair', rooms: ['kids', 'bedroom', 'dining'], style: 'playful', d: 'A little chair with a painted seat. Push it up to a desk or a table; sit down from behind.',
      tags: ['chair', 'seat', 'kids'], packs: SB, tier: 'budget', p: 45, q: 2, ints: ['sit'], stats: { comfort: 3 }, slots: seatAt(0.34, [0, -1], 0.5) },
    { a: 'kidsTableSet', id: 'table-kids-stools', n: 'Kids Table and Stools', cat: 'kids', sub: 'table', rooms: ['kids', 'dining'], style: 'playful', d: 'A small blue table with two round stools tucked in. For snacks, drawing and homework.',
      tags: ['table', 'dining', 'surface', 'kids', 'cleanable'], packs: SB, tier: 'budget', p: 110, q: 2, surf: 0.5, stats: { environment: 1 } },
    { a: 'playKitchen', id: 'play-kitchen', n: 'Toy Play Kitchen', cat: 'kids', sub: 'toys', rooms: ['kids', 'living'], style: 'playful', d: 'A pretend kitchen with a hob, an oven door, a sink and a shelf of pots. Stir up a lot of fun.',
      tags: ['toys', 'play', 'kids'], packs: SB, tier: 'standard', p: 190, q: 3, back: true, ints: ['playWithToys'], stats: { fun: 1.1, environment: 1 }, slots: useAt() },
    { a: 'dollhouse', id: 'dollhouse', n: 'Wooden Dollhouse', cat: 'kids', sub: 'toys', rooms: ['kids', 'bedroom', 'living'], style: 'cottage', d: 'A two-storey dollhouse with an open front and tiny furniture. Make-believe for hours.',
      tags: ['toys', 'play', 'kids'], packs: SBC, tier: 'budget', p: 150, q: 2, ints: ['playWithToys'], stats: toyStats, slots: useAt() },
    { a: 'rockingHorse', id: 'rocking-horse', n: 'Rocking Horse', cat: 'kids', sub: 'toys', rooms: ['kids', 'living'], style: 'cottage', d: 'A white horse on curved wooden rockers with a red saddle. Climb on and gallop nowhere.',
      tags: ['toys', 'play', 'kids', 'rocking', 'seat'], packs: SBC, tier: 'budget', p: 130, q: 2, ints: ['sit'], stats: { comfort: 1, fun: 0.8, environment: 1 }, slots: seatAt(0.65, [0, 1], 0.45) },
    { a: 'easelKids', id: 'easel-kids', n: "Child's Easel", cat: 'kids', sub: 'art', rooms: ['kids', 'bedroom', 'living'], style: 'playful', d: 'A small easel with a paper pad and three paint pots. Paint for fun, and the practice builds Painting.',
      tags: ['easel', 'art', 'creative', 'kids'], packs: ['kids-storybook', 'creative-studio'], tier: 'budget', p: 90, q: 2, ints: ['paintCanvas'], stats: { fun: 1, skill: 1, environment: 1 }, slots: useAt() },
    { a: 'kidsBookshelf', id: 'bookshelf-kids', n: "Kids' Bookshelf", cat: 'kids', sub: 'bookcase', rooms: ['kids', 'bedroom', 'study'], style: 'playful', d: 'A low shelf of picture books within reach of small hands. Take a book and read it in a nearby seat.',
      tags: ['bookcase', 'books', 'storage', 'kids'], packs: SB, tier: 'budget', p: 140, q: 2, back: true, ints: ['readBook'], stats: { skill: 1, fun: 1 }, slots: useAt() },
    { a: 'playTent', id: 'play-tent', n: 'Teepee Play Tent', cat: 'kids', sub: 'toys', rooms: ['kids', 'living'], style: 'playful', d: 'A canvas teepee with a cushion inside: a secret hideout for games and stories.',
      tags: ['toys', 'play', 'kids', 'tent'], packs: SB, tier: 'budget', p: 70, q: 2, ints: ['playWithToys'], stats: { fun: 1, environment: 1 }, slots: useAt() },
    { a: 'ballPit', id: 'ball-pit', n: 'Ball Pit', cat: 'kids', sub: 'toys', rooms: ['kids', 'living'], style: 'playful', d: 'A padded pen full of coloured plastic balls. Wade in and splash about.',
      tags: ['toys', 'play', 'kids'], packs: SB, tier: 'standard', p: 240, q: 3, fp: FP22, ints: ['playWithToys'], stats: { fun: 1.2, environment: 1 }, slots: useAt(1) },
    { a: 'trainTable', id: 'train-table', n: 'Train Table', cat: 'kids', sub: 'toys', rooms: ['kids', 'living'], style: 'classic', d: 'A long play table with a raised rim, a green board and a loop of wooden track. All aboard.',
      tags: ['toys', 'play', 'kids', 'table', 'surface'], packs: SB, tier: 'standard', p: 260, q: 3, fp: FP21, surf: 0.55, ints: ['playWithToys'], stats: { fun: 1.1, environment: 1 }, slots: useAt(1) },
    { a: 'activityTable', id: 'activity-table', n: 'Activity Table', cat: 'kids', sub: 'toys', rooms: ['kids', 'living'], style: 'playful', d: 'A round table with bead mazes, blocks and spinners on top: busy hands for the youngest.',
      tags: ['toys', 'play', 'kids'], packs: SB, tier: 'budget', p: 85, q: 2, ints: ['playWithToys'], stats: toyStats, slots: useAt() },
    { a: 'nurseryRocker', id: 'rocker-nursery', n: 'Nursery Glider Chair', cat: 'kids', sub: 'chair', rooms: ['kids', 'bedroom', 'living'], style: 'mid-century', d: 'A padded glider on curved runners for late-night feeds and bedtime stories. Very comfortable.',
      tags: ['chair', 'seat', 'rocker', 'kids'], packs: ['kids-storybook', 'mid-century'], tier: 'premium', p: 480, q: 4, ints: ['sit'], stats: { comfort: 7, environment: 2 }, slots: seatAt(0.45, [0, 1], 0.55) },
    { a: 'babyBouncer', id: 'bouncer-baby', n: 'Baby Bouncer', cat: 'kids', sub: 'chair', rooms: ['kids', 'living'], style: 'playful', d: 'A reclined bouncy seat on a springy steel frame. A safe place to sit up and watch the world.',
      tags: ['seat', 'kids', 'bouncer'], packs: SB, tier: 'budget', p: 70, q: 2, ints: ['sit'], stats: { comfort: 3, fun: 0.5 }, slots: seatAt(0.28, [0, 1], 0.5) },
    { a: 'kidsWardrobe', id: 'wardrobe-kids', n: "Kids' Wardrobe", cat: 'kids', sub: 'wardrobe', rooms: ['kids', 'bedroom'], style: 'playful', d: 'A small two-door wardrobe with a clothes rail and a low shelf. Change into another outfit or plan new ones here.',
      tags: ['wardrobe', 'storage', 'clothes', 'kids'], packs: SB, tier: 'standard', p: 320, q: 3, back: true, ints: ['changeOutfit', 'editOutfits'], slots: useAt(),
      anim: { kind: 'openWhileUsed', on: ['changeOutfit', 'editOutfits'], parts: [
        { node: 'anim:doorL', role: 'door', axis: 'y', angle: -1.75 },
        { node: 'anim:doorR', role: 'door2', axis: 'y', angle: 1.75 },
      ] } },
    { a: 'kidsBeanBag', id: 'beanbag-kids', n: 'Bean Bag Seat', cat: 'kids', sub: 'chair', rooms: ['kids', 'living', 'bedroom'], style: 'playful', d: 'A squashy red bean bag with a pillow. Flop down for a sit.',
      tags: ['seat', 'kids', 'beanbag'], packs: SB, tier: 'budget', p: 55, q: 2, ints: ['sit'], stats: { comfort: 4 }, slots: seatAt(0.3, [0, 1], 0.5) },
    { a: 'puppetTheater', id: 'puppet-theater', n: 'Puppet Theatre', cat: 'kids', sub: 'toys', rooms: ['kids', 'living'], style: 'cottage', d: 'A wooden stage with curtains and two hand puppets. Put on a show.',
      tags: ['toys', 'play', 'kids'], packs: SBC, tier: 'budget', p: 120, q: 2, back: true, ints: ['playWithToys'], stats: { fun: 1, environment: 1 }, slots: useAt() },
  ];

  const pieces = PIECES.map((c): ObjectDef => {
    const fp = c.fp ?? FP11;
    const f = fit(c.a, fp, 2, c.back ? { back: WALL_GAP } : {});
    const ints = c.ints ?? [];
    const slots = c.slots ? c.slots(f, fp) : [];
    return obj(f, {
      id: c.id, name: c.n, category: c.cat, subcategory: c.sub, rooms: c.rooms, style: c.style, description: c.d, tags: c.tags, packs: c.packs,
      tier: c.tier, price: dollars(c.p), quality: c.q, functional: c.fn ?? true, footprint: fp, layer: 'floor', blocksMovement: true,
      ...(c.surf !== undefined ? { surfaceHeight: c.surf } : {}), slots, interactions: ints, stats: c.stats ?? {},
      finishes: finishes(c.a, c.shadeLabel ?? 'Linen'), ...(c.anim ? { anim: c.anim } : {}),
    });
  });

  return [...lights, ...pieces];
}
