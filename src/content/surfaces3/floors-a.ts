// Milestone 10 surface designs, group 'floors-a': wooden planks and boards, parquet and decorative wood, laminate and
// vinyl. Written by the content agent of this group only; wired into the catalog once in ./index.ts. Helpers: ./kit.ts.
// Sources: dev/surfaces-ai/sources/floors-a.mjs (wood species grains and prints); layouts are drawn by the painters
// board-floor, wood-parquet and rubber-floor in src/render/textures/packs/floors-a.ts.
//
// Palettes are [base, light, dark, seam]: the grain map is greyscale and the palette tints it, so a species map can
// carry any of the eight tones that bank() derives from one core colour (light, dark, grey, warm, bleached, deep).

import type { Palette, SurfaceDesign } from '../types';
import { floor, make, shd, woodP, type Tuple } from './kit';

const hexN = (h: string) => parseInt(h.slice(1, 7), 16);
const lum = (h: string) => { const n = hexN(h); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const sat = (h: string) => { const n = hexN(h); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; return Math.max(...c) - Math.min(...c); };
function blend(a: string, b: string, t: number): string {
  const p = hexN(a), q = hexN(b);
  const ch = (sh: number) => Math.round(((p >> sh) & 255) * (1 - t) + ((q >> sh) & 255) * t).toString(16).padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}
function toneWord(hex: string): string {
  const l = lum(hex);
  if (sat(hex) < 26) return l > 0.72 ? 'Frosted' : l > 0.5 ? 'Silver' : l > 0.3 ? 'Ash Grey' : 'Charcoal';
  return l > 0.78 ? 'Bleached' : l > 0.62 ? 'Pale' : l > 0.48 ? 'Natural' : l > 0.34 ? 'Rich' : l > 0.22 ? 'Deep' : 'Ebonised';
}
/** Eight tones of one material from a core colour: core, lighter, darker, deep, grey, warm, bleached, near-black. */
function bank(label: string, core: string): Tuple[] {
  const cols = [core, shd(core, 0.28), shd(core, -0.28), shd(core, -0.5), blend(core, '#8e8a84', 0.65), blend(core, '#d2761c', 0.5), blend(core, '#ffffff', 0.72), blend(core, '#241812', 0.72)];
  const seen = new Map<string, number>();
  return cols.map((c, i) => {
    const w = toneWord(c);
    const n = (seen.get(w) ?? 0) + 1;
    seen.set(w, n);
    const word = n > 1 ? `${['', 'Soft', 'Warm', 'Cool'][n - 1] ?? 'Dusky'} ${w}` : w;
    return [`${label}-${i}`, `${word} ${label.replace(/-/g, ' ').replace(/^./, (x) => x.toUpperCase())}`, c];
  });
}
const woodBank = (label: string, core: string): Palette[] => woodP(bank(label, core));
// stone, concrete and print tiles: [base, light, dark, grout]
const printP = make((c) => [c!, shd(c!, 0.22), shd(c!, -0.28), shd(c!, -0.45)]);
const printBank = (label: string, core: string): Palette[] => printP(bank(label, core));

type Params = Record<string, number | string | boolean>;
interface Spec {
  id: string; name: string; description: string; tags: string[]; packs: string[]; price: number; repeat: number;
  painter: 'board-floor' | 'wood-parquet' | 'rubber-relief' | 'map-floor';
  params: Params; palettes: Palette[];
}
const mk = (family: 'wood-planks' | 'parquet' | 'laminate-vinyl', s: Spec): SurfaceDesign => floor({ ...s, family });

// ---------------------------------------------------------------------------------------------
// Wooden planks and boards (36)
// ---------------------------------------------------------------------------------------------

const B = (map: string, p: Params): Params => ({ map, ...p });

export const FLOORS_A_PLANKS: SurfaceDesign[] = ([
  { id: 'plank-walnut-wide', name: 'Wide Walnut Planks', description: 'Broad walnut boards with soft pillowed edges and flowing chocolate figure: a deep, quiet floor for rooms with light to spare.',
    tags: ['wood', 'walnut', 'wide', 'dark', 'luxury', 'living', 'study', 'bedroom'], packs: ['classic-townhouse', 'mid-century'], price: 28, repeat: 2.0, painter: 'board-floor',
    params: B('grain-walnut', { board: 0.2, minLen: 0.9, maxLen: 2.0, bevel: 'pillow', scale: 0.7 }), palettes: woodBank('walnut', '#6a4631') },
  { id: 'plank-maple-strip', name: 'Maple Strip Floor', description: 'Fine pale maple strips in short random lengths: bright, even and schoolhouse clean.',
    tags: ['wood', 'maple', 'strip', 'pale', 'scandi', 'hall', 'kitchen', 'study'], packs: ['modern-minimal', 'everyday-essentials'], price: 14, repeat: 1.0, painter: 'board-floor',
    params: B('grain-maple', { board: 0.065, minLen: 0.4, maxLen: 0.9, gap: 0.0015, bevel: 'micro', scale: 0.5 }), palettes: woodBank('maple', '#d9b98a') },
  { id: 'plank-ash-open', name: 'Open-Grain Ash', description: 'Pale ash boards with bold cathedral figure and open pores that catch the light.',
    tags: ['wood', 'ash', 'bold-grain', 'light', 'modern', 'living', 'dining', 'bedroom'], packs: ['modern-minimal', 'coastal-home'], price: 20, repeat: 1.8, painter: 'board-floor',
    params: B('grain-ash', { board: 0.18, minLen: 0.8, maxLen: 1.8 }), palettes: woodBank('ash', '#c9b08a') },
  { id: 'plank-cherry-classic', name: 'Cabinet Cherry', description: 'Smooth red-brown cherry boards of medium width, with the small gum flecks that make real cherry.',
    tags: ['wood', 'cherry', 'warm', 'traditional', 'study', 'dining', 'bedroom'], packs: ['classic-townhouse'], price: 26, repeat: 1.44, painter: 'board-floor',
    params: B('grain-cherry', { board: 0.12, minLen: 0.7, maxLen: 1.6, scale: 0.6 }), palettes: woodBank('cherry', '#9c5a3a') },
  { id: 'plank-pine-farmhouse', name: 'Farmhouse Pine', description: 'Knotty pine boards with square cut nails and pillowed edges, the floor of every farmhouse kitchen.',
    tags: ['wood', 'pine', 'knotty', 'farmhouse', 'rustic', 'kitchen', 'hall', 'living'], packs: ['cozy-cottage'], price: 8, repeat: 1.92, painter: 'board-floor',
    params: B('grain-pine', { board: 0.16, minLen: 0.8, maxLen: 1.7, bevel: 'pillow', nails: true, scale: 0.8 }), palettes: woodBank('pine', '#d2a566') },
  { id: 'plank-teak-deck', name: 'Teak Ship Deck', description: 'Narrow teak strips with black caulked seams and neat three-step butt joints, as on a yacht deck.',
    tags: ['wood', 'teak', 'ship-deck', 'caulked', 'nautical', 'kitchen', 'bathroom', 'hall'], packs: ['coastal-home', 'mid-century'], price: 34, repeat: 1.2, painter: 'board-floor',
    params: B('grain-teak', { board: 0.06, minLen: 1.2, maxLen: 1.2, bond: 'ship', gap: 0.006, bevel: 'square' }), palettes: woodBank('teak', '#b98a4a') },
  { id: 'plank-bamboo-strand', name: 'Strand Bamboo', description: 'Dense strand-woven bamboo planks with faint nodes and a hard, even, modern face.',
    tags: ['wood', 'bamboo', 'strand', 'sustainable', 'modern', 'living', 'bedroom', 'study'], packs: ['modern-minimal', 'botanical-living'], price: 12, repeat: 1.8, painter: 'board-floor',
    params: B('grain-bamboo', { board: 0.13, minLen: 0.9, maxLen: 1.8, scale: 0.6 }), palettes: woodBank('bamboo', '#c8a468') },
  { id: 'plank-hickory-lodge', name: 'Hickory Lodge Boards', description: 'High-contrast hickory in wide boards with V-grooved edges: a lodge floor with real character.',
    tags: ['wood', 'hickory', 'lodge', 'rustic', 'bold-grain', 'living', 'hall', 'dining'], packs: ['cozy-cottage', 'industrial-loft'], price: 24, repeat: 2.0, painter: 'board-floor',
    params: B('grain-hickory', { board: 0.2, minLen: 0.9, maxLen: 2.0, bevel: 'vgroove', scale: 0.7 }), palettes: woodBank('hickory', '#b58a5e') },
  { id: 'plank-heartpine-antique', name: 'Antique Heart Pine', description: 'Salvaged heart pine in a run of wide and narrow boards, with old saw marks, nail holes and a century of patina.',
    tags: ['wood', 'heart-pine', 'antique', 'reclaimed', 'mixed-width', 'living', 'dining', 'hall'], packs: ['classic-townhouse', 'cozy-cottage'], price: 30, repeat: 2.0, painter: 'board-floor',
    params: B('grain-heartpine', { board: 0.17, widths: 'mixed3', minLen: 0.8, maxLen: 2.0, nails: true, bevel: 'micro', scale: 0.8 }), palettes: woodBank('heart-pine', '#a8703c') },
  { id: 'plank-limed-oak', name: 'Limed Oak Planks', description: 'Grey-white limed oak with chalky pores and V-grooved edges, a washed Scandinavian look.',
    tags: ['wood', 'limed', 'whitewashed', 'scandi', 'coastal', 'living', 'bedroom', 'kitchen'], packs: ['coastal-home', 'modern-minimal'], price: 22, repeat: 1.9, painter: 'board-floor',
    params: B('grain-limed', { board: 0.19, minLen: 0.9, maxLen: 1.9, bevel: 'vgroove', scale: 0.7 }), palettes: woodBank('limed', '#cfc3ae') },
  { id: 'plank-oak-rift-long', name: 'Rift Oak Long Boards', description: 'Straight-grained rift-sawn oak in very long boards: calm, linear and almost seamless underfoot.',
    tags: ['wood', 'oak', 'rift-sawn', 'long-board', 'minimal', 'living', 'bedroom', 'study'], packs: ['modern-minimal'], price: 36, repeat: 2.4, painter: 'board-floor',
    params: B('grain-oak-rift', { board: 0.15, minLen: 1.6, maxLen: 2.4, gap: 0.0015, scale: 0.8 }), palettes: woodBank('rift-oak', '#bf9d70') },
  { id: 'plank-oak-brushed-xl', name: 'Wire-Brushed Extra Wide Oak', description: 'Extra-wide wire-brushed oak planks with deep open grain you can feel, for large, light rooms.',
    tags: ['wood', 'oak', 'brushed', 'extra-wide', 'textured', 'living', 'dining', 'open-plan'], packs: ['modern-minimal', 'industrial-loft'], price: 38, repeat: 2.4, painter: 'board-floor',
    params: B('grain-oak-brushed', { board: 0.26, minLen: 1.0, maxLen: 2.4, bevel: 'pillow', scale: 0.9 }), palettes: woodBank('brushed-oak', '#b79468') },
  { id: 'plank-oak-scraped', name: 'Hand-Scraped Oak', description: 'Oak boards scraped by hand into soft hollows and tool marks, with pillowed edges and a lived-in feel.',
    tags: ['wood', 'oak', 'hand-scraped', 'rustic', 'textured', 'living', 'hall', 'kitchen'], packs: ['cozy-cottage', 'classic-townhouse'], price: 32, repeat: 1.8, painter: 'board-floor',
    params: B('grain-oak-brushed', { board: 0.15, minLen: 0.8, maxLen: 1.8, bevel: 'pillow', scale: 0.7 }), palettes: woodBank('scraped-oak', '#a67e55') },
  { id: 'plank-elm-wild', name: 'Wild Elm Boards', description: 'Elm with twisting, interlocking grain and cloudy swirls: no two boards alike.',
    tags: ['wood', 'elm', 'wild-grain', 'rustic', 'character', 'living', 'study', 'hall'], packs: ['cozy-cottage', 'creative-studio'], price: 30, repeat: 2.0, painter: 'board-floor',
    params: B('grain-ash', { board: 0.2, minLen: 0.9, maxLen: 2.0, scale: 0.9 }), palettes: woodBank('elm', '#a47a52') },
  { id: 'plank-acacia-lively', name: 'Lively Acacia', description: 'Variegated acacia in half-stagger bond: streaks of honey and chocolate in every board.',
    tags: ['wood', 'acacia', 'variegated', 'warm', 'living', 'dining', 'hall'], packs: ['mid-century', 'everyday-essentials'], price: 18, repeat: 1.68, painter: 'board-floor',
    params: B('grain-walnut', { board: 0.14, minLen: 0.84, maxLen: 0.84, bond: 'half', scale: 0.7 }), palettes: woodBank('acacia', '#a8743c') },
  { id: 'plank-zebrano-bold', name: 'Zebrano Stripe', description: 'Bold zebrawood stripes in slim boards: a statement floor for a study, a hall or a boutique.',
    tags: ['wood', 'zebrano', 'exotic', 'striped', 'statement', 'hall', 'study', 'dressing-room'], packs: ['art-deco', 'mid-century'], price: 40, repeat: 1.2, painter: 'board-floor',
    params: B('grain-zebrano', { board: 0.1, minLen: 0.6, maxLen: 1.2, scale: 0.6 }), palettes: woodBank('zebrano', '#b99560') },
  { id: 'plank-rosewood-dark', name: 'Dark Rosewood', description: 'Deep rosewood with swirling black veins, finished square-edged for a sleek, formal floor.',
    tags: ['wood', 'rosewood', 'dark', 'exotic', 'formal', 'study', 'library', 'dining'], packs: ['classic-townhouse', 'art-deco'], price: 38, repeat: 1.68, painter: 'board-floor',
    params: B('grain-rosewood', { board: 0.14, minLen: 0.7, maxLen: 1.7, bevel: 'square', scale: 0.7 }), palettes: woodBank('rosewood', '#5c3426') },
  { id: 'plank-mahogany-ribbon', name: 'Ribbon Mahogany', description: 'Mahogany with shimmering ribbon stripes laid in a regular third-stagger bond.',
    tags: ['wood', 'mahogany', 'ribbon', 'classic', 'formal', 'dining', 'study', 'hall'], packs: ['classic-townhouse'], price: 34, repeat: 1.8, painter: 'board-floor',
    params: B('grain-mahogany', { board: 0.16, minLen: 0.9, maxLen: 0.9, bond: 'third', scale: 0.7 }), palettes: woodBank('mahogany', '#8a4a30') },
  { id: 'plank-fir-cottage', name: 'Cottage Douglas Fir', description: 'Douglas fir in narrow and broad boards, with tight growth rings and the warm orange of old cottage floors.',
    tags: ['wood', 'fir', 'cottage', 'mixed-width', 'traditional', 'bedroom', 'hall', 'living'], packs: ['cozy-cottage', 'everyday-essentials'], price: 12, repeat: 1.8, painter: 'board-floor',
    params: B('grain-fir', { board: 0.14, widths: 'mixed2', minLen: 0.8, maxLen: 1.8, scale: 0.8 }), palettes: woodBank('fir', '#c88a4a') },
  { id: 'plank-cedar-cabin', name: 'Cabin Cedar', description: 'Red cedar boards in a regular third-stagger, with the odd tiny knot and dark streak.',
    tags: ['wood', 'cedar', 'cabin', 'warm', 'aromatic', 'bedroom', 'closet', 'living'], packs: ['cozy-cottage', 'garden-patio'], price: 14, repeat: 1.44, painter: 'board-floor',
    params: B('grain-cedar', { board: 0.12, minLen: 0.72, maxLen: 0.72, bond: 'third', scale: 0.7 }), palettes: woodBank('cedar', '#b6683e') },
  { id: 'plank-wormy-chestnut', name: 'Wormy Chestnut', description: 'Wormy chestnut in a mix of board widths, peppered with worm holes and dark flecks, with cut nails.',
    tags: ['wood', 'chestnut', 'wormy', 'rustic', 'mixed-width', 'living', 'kitchen', 'hall'], packs: ['cozy-cottage', 'industrial-loft'], price: 28, repeat: 2.0, painter: 'board-floor',
    params: B('grain-wormy', { board: 0.18, widths: 'mixed3', minLen: 0.9, maxLen: 2.0, nails: true, scale: 0.8 }), palettes: woodBank('chestnut', '#9a7048') },
  { id: 'plank-spalted-maple', name: 'Spalted Maple', description: 'Pale maple with fine black zone lines wandering through it: each board reads like a drawing.',
    tags: ['wood', 'maple', 'spalted', 'artisan', 'figure', 'study', 'living', 'bedroom'], packs: ['creative-studio', 'modern-minimal'], price: 36, repeat: 1.68, painter: 'board-floor',
    params: B('grain-spalted', { board: 0.14, minLen: 0.7, maxLen: 1.7, scale: 0.8 }), palettes: woodBank('spalted-maple', '#d2bd94') },
  { id: 'plank-driftwood-coast', name: 'Driftwood Boards', description: 'Silvery sun-bleached boards, smooth and soft, like timber washed up and dried on a beach.',
    tags: ['wood', 'driftwood', 'bleached', 'coastal', 'beach-house', 'living', 'bedroom', 'bathroom'], packs: ['coastal-home'], price: 16, repeat: 1.8, painter: 'board-floor',
    params: B('grain-driftwood', { board: 0.18, minLen: 0.9, maxLen: 1.8, scale: 0.7 }), palettes: woodBank('driftwood', '#b5aa98') },
  { id: 'plank-charred-cedar', name: 'Charred Cedar Boards', description: 'Shou sugi ban boards charred black, with alligator-skin cracking and square joints.',
    tags: ['wood', 'charred', 'shou-sugi-ban', 'black', 'dramatic', 'living', 'hall', 'studio'], packs: ['industrial-loft', 'modern-minimal'], price: 42, repeat: 1.44, painter: 'board-floor',
    params: B('grain-charred', { board: 0.12, minLen: 0.7, maxLen: 1.4, bevel: 'square', scale: 0.7 }), palettes: woodBank('charred', '#3c3a38') },
  { id: 'plank-oak-character', name: 'Character-Grade Oak', description: 'Big knots, small cracks and strong grain in wide oak boards: all the character the tree had.',
    tags: ['wood', 'oak', 'character', 'knotty', 'rustic', 'living', 'hall', 'kitchen'], packs: ['cozy-cottage', 'industrial-loft'], price: 20, repeat: 2.2, painter: 'board-floor',
    params: B('grain-oak-knotty', { board: 0.22, minLen: 1.0, maxLen: 2.2, scale: 1.3 }), palettes: woodBank('character-oak', '#b08a5c') },
  { id: 'plank-roughsawn-barn', name: 'Rough-Sawn Boards', description: 'Rough-sawn boards of four widths with blade marks left on and cut nails: unfussy and honest.',
    tags: ['wood', 'rough-sawn', 'mixed-width', 'rustic', 'barn', 'kitchen', 'hall', 'workshop'], packs: ['industrial-loft', 'cozy-cottage'], price: 18, repeat: 2.0, painter: 'board-floor',
    params: B('grain-roughsawn', { board: 0.16, widths: 'mixed4', minLen: 0.8, maxLen: 2.0, nails: true, scale: 0.8 }), palettes: woodBank('rough-sawn', '#a07c58') },
  { id: 'plank-olive-art', name: 'Olive Wood Boards', description: 'Swirling dark figure on honey olive wood: a rare, hand-picked look.',
    tags: ['wood', 'olive', 'swirl', 'artisan', 'luxury', 'living', 'dining', 'study'], packs: ['art-deco', 'creative-studio'], price: 40, repeat: 1.5, painter: 'board-floor',
    params: B('grain-olive', { board: 0.15, minLen: 0.75, maxLen: 1.5, scale: 1.0 }), palettes: woodBank('olive', '#b08a52') },
  { id: 'plank-birch-nordic', name: 'Nordic Birch', description: 'Pale yellow birch with a fine, quiet grain: bright and gentle in small rooms.',
    tags: ['wood', 'birch', 'nordic', 'scandi', 'pale', 'bedroom', 'kids', 'hall'], packs: ['modern-minimal', 'kids-storybook'], price: 15, repeat: 1.68, painter: 'board-floor',
    params: B('grain-birch', { board: 0.14, minLen: 0.8, maxLen: 1.68, scale: 0.6 }), palettes: woodBank('birch', '#dcc38e') },
  { id: 'plank-ebonised-oak', name: 'Ebonised Oak', description: 'Oak stained near black with the grain still showing, in broad pillow-edged boards.',
    tags: ['wood', 'ebonised', 'black', 'dramatic', 'modern', 'living', 'study', 'hall'], packs: ['art-deco', 'modern-minimal'], price: 30, repeat: 2.0, painter: 'board-floor',
    params: B('grain-ebony', { board: 0.2, minLen: 0.9, maxLen: 2.0, bevel: 'pillow', scale: 0.7 }), palettes: woodBank('ebonised', '#4a3d36') },
  { id: 'plank-oak-diagonal', name: 'Diagonal Oak', description: 'Oak boards laid corner to corner at 45 degrees, to make a small room look wider.',
    tags: ['wood', 'oak', 'diagonal', 'classic', 'hall', 'dining', 'kitchen'], packs: ['classic-townhouse', 'everyday-essentials'], price: 26, repeat: 2.4, painter: 'board-floor',
    params: B('grain-oak', { board: 0.15, minLen: 0.8, maxLen: 1.7, diagonal: true, scale: 0.6 }), palettes: woodBank('oak', '#c49a6c') },
  { id: 'plank-beech-school', name: 'Beech Schoolroom', description: 'Narrow steamed beech boards with tiny flecks: the sturdy floor of old schools and workshops.',
    tags: ['wood', 'beech', 'narrow', 'school', 'practical', 'hall', 'kids', 'study'], packs: ['everyday-essentials', 'kids-storybook'], price: 9, repeat: 1.08, painter: 'board-floor',
    params: B('grain-beech', { board: 0.09, minLen: 0.5, maxLen: 1.08, gap: 0.0015, scale: 0.5 }), palettes: woodBank('beech', '#cba479') },
  { id: 'plank-oak-mixed-width', name: 'Random-Width Oak', description: 'Oak boards of three alternating widths from slim to broad, for a floor that looks hand laid.',
    tags: ['wood', 'oak', 'random-width', 'traditional', 'country', 'living', 'dining', 'hall'], packs: ['cozy-cottage', 'classic-townhouse'], price: 22, repeat: 2.0, painter: 'board-floor',
    params: B('grain-oak', { board: 0.16, widths: 'mixed3', minLen: 0.9, maxLen: 2.0, scale: 0.6 }), palettes: woodBank('oak', '#b99060') },
  { id: 'plank-oak-ship', name: 'Oak Ship Lap Stagger', description: 'Equal-length oak boards in a seven-step ship stagger, each joint landing in a different place.',
    tags: ['wood', 'oak', 'ship-stagger', 'tidy', 'traditional', 'living', 'bedroom', 'hall'], packs: ['classic-townhouse', 'everyday-essentials'], price: 24, repeat: 1.68, painter: 'board-floor',
    params: B('grain-oak', { board: 0.12, minLen: 1.68, maxLen: 1.68, bond: 'ship', gap: 0.002, scale: 0.6 }), palettes: woodBank('oak', '#c9a272') },
  { id: 'plank-pine-painted', name: 'Painted Floorboards', description: 'Pine boards painted solid and worn through at the edges, with the grain still ghosting up.',
    tags: ['wood', 'pine', 'painted', 'cottage', 'shabby', 'bedroom', 'hall', 'kitchen'], packs: ['cozy-cottage', 'coastal-home'], price: 10, repeat: 1.68, painter: 'board-floor',
    params: B('grain-pine', { board: 0.14, minLen: 0.8, maxLen: 1.68, bevel: 'vgroove', paint: 0.85, scale: 0.8 }),
    palettes: woodP([['paint-white', 'Chalk White', '#e6e1d6'], ['paint-sage', 'Sage Green', '#9aa890'], ['paint-slate', 'Slate Blue', '#6f8499'], ['paint-black', 'Soot Black', '#35353a'], ['paint-cream', 'Buttermilk', '#e4d4a8'], ['paint-oxide', 'Red Oxide', '#9a4a38'], ['paint-grey', 'Dove Grey', '#a6a49e']]) },
  { id: 'plank-maple-stairstep', name: 'Maple Stairstep', description: 'Maple boards in a strict third-bond stairstep: the clean, rhythmic pattern of a gym or a gallery.',
    tags: ['wood', 'maple', 'stairstep', 'rhythmic', 'gallery', 'hall', 'studio', 'living'], packs: ['modern-minimal', 'creative-studio'], price: 19, repeat: 1.8, painter: 'board-floor',
    params: B('grain-maple', { board: 0.12, minLen: 0.9, maxLen: 0.9, bond: 'third', bevel: 'pillow', scale: 0.6 }), palettes: woodBank('maple', '#d6b585') },
  { id: 'plank-cherry-inlay', name: 'Banded Cherry Inlay', description: 'Cherry boards with a fine dark inlay line every fifth board, as in a Georgian drawing room.',
    tags: ['wood', 'cherry', 'inlay', 'banded', 'georgian', 'formal', 'dining', 'study', 'living'], packs: ['classic-townhouse', 'art-deco'], price: 40, repeat: 2.0, painter: 'board-floor',
    params: B('grain-cherry', { board: 0.2, minLen: 0.9, maxLen: 2.0, inlay: 5, bevel: 'micro', scale: 0.7 }), palettes: woodBank('cherry-inlay', '#a86a44') },
] as Spec[]).map((s) => mk('wood-planks', s));

// ---------------------------------------------------------------------------------------------
// Parquet and decorative wood (20)
// ---------------------------------------------------------------------------------------------

const Q = (map: string, p: Params): Params => ({ map, ...p });

export const FLOORS_A_PARQUET: SurfaceDesign[] = ([
  { id: 'parquet-herring-petite', name: 'Petite Herringbone', description: 'Small walnut blocks, four times as long as wide, in a tight herringbone: fine, busy and very Parisian.',
    tags: ['wood', 'parquet', 'herringbone', 'walnut', 'small-block', 'hall', 'study', 'dining'], packs: ['classic-townhouse', 'art-deco'], price: 34, repeat: 1.2, painter: 'wood-parquet',
    params: Q('grain-walnut', { layout: 'herringbone', block: 0.3, ratio: 4, scale: 0.5 }), palettes: woodBank('walnut', '#6e4a34') },
  { id: 'parquet-herring-long', name: 'Long-Block Herringbone', description: 'Slim rift oak blocks seven times as long as wide: a stretched, elegant herringbone.',
    tags: ['wood', 'parquet', 'herringbone', 'oak', 'long-block', 'living', 'dining', 'hall'], packs: ['classic-townhouse', 'modern-minimal'], price: 36, repeat: 1.2, painter: 'wood-parquet',
    params: Q('grain-oak-rift', { layout: 'herringbone', block: 0.6, ratio: 7, scale: 0.6 }), palettes: woodBank('rift-oak', '#bc9a6e') },
  { id: 'parquet-herring-double', name: 'Double Herringbone', description: 'Every herringbone block is made of two parallel maple boards, doubling the lines of the classic.',
    tags: ['wood', 'parquet', 'herringbone', 'double', 'maple', 'pale', 'living', 'hall'], packs: ['modern-minimal', 'classic-townhouse'], price: 38, repeat: 1.2, painter: 'wood-parquet',
    params: Q('grain-maple', { layout: 'herringbone', block: 0.6, ratio: 5, strips: 2, scale: 0.5 }), palettes: woodBank('maple', '#d8b88a') },
  { id: 'parquet-herring-harlequin', name: 'Harlequin Herringbone', description: 'Cherry herringbone blocks alternating light and dark in diagonal bands, so the pattern ripples.',
    tags: ['wood', 'parquet', 'herringbone', 'two-tone', 'cherry', 'dramatic', 'living', 'dining'], packs: ['art-deco', 'classic-townhouse'], price: 40, repeat: 1.2, painter: 'wood-parquet',
    params: Q('grain-cherry', { layout: 'herringbone', block: 0.4, ratio: 5, alt: 0.7, scale: 0.5 }), palettes: woodBank('cherry', '#9e5c3c') },
  { id: 'parquet-herring-chunky', name: 'Chunky Herringbone', description: 'Broad, short hickory blocks in a bold herringbone: a big-scale pattern with a rustic grain.',
    tags: ['wood', 'parquet', 'herringbone', 'chunky', 'hickory', 'rustic', 'living', 'kitchen'], packs: ['cozy-cottage', 'industrial-loft'], price: 30, repeat: 1.2, painter: 'wood-parquet',
    params: Q('grain-hickory', { layout: 'herringbone', block: 0.6, ratio: 3, scale: 0.7 }), palettes: woodBank('hickory', '#b08660') },
  { id: 'parquet-chevron-fine', name: 'Fine Birch Chevron', description: 'Narrow pale birch boards mitred into a delicate chevron zigzag.',
    tags: ['wood', 'parquet', 'chevron', 'birch', 'pale', 'delicate', 'bedroom', 'living'], packs: ['modern-minimal', 'coastal-home'], price: 32, repeat: 1.0, painter: 'wood-parquet',
    params: Q('grain-birch', { layout: 'chevron', block: 0.5, board: 0.06, scale: 0.5 }), palettes: woodBank('birch', '#d9bf8c') },
  { id: 'parquet-chevron-wide', name: 'Wide Brushed Chevron', description: 'Broad wire-brushed oak boards with long mitred arms: a large, calm chevron.',
    tags: ['wood', 'parquet', 'chevron', 'oak', 'wide', 'brushed', 'living', 'dining'], packs: ['modern-minimal', 'classic-townhouse'], price: 42, repeat: 1.4, painter: 'wood-parquet',
    params: Q('grain-oak-brushed', { layout: 'chevron', block: 0.7, board: 0.14, scale: 0.8 }), palettes: woodBank('brushed-oak', '#b69468') },
  { id: 'parquet-hungarian-point', name: 'Hungarian Point', description: 'Ash boards cut at 60 degrees so the V rises steeply: the sharper cousin of the chevron.',
    tags: ['wood', 'parquet', 'hungarian-point', 'ash', 'steep', 'elegant', 'living', 'hall'], packs: ['classic-townhouse', 'art-deco'], price: 44, repeat: 1.0, painter: 'wood-parquet',
    params: Q('grain-ash', { layout: 'chevron', block: 0.5, board: 0.075, angle: 60, scale: 0.6 }), palettes: woodBank('ash', '#c6ab84') },
  { id: 'parquet-chevron-shallow', name: 'Shallow Teak Chevron', description: 'Teak boards mitred at a low 30 degrees: a long, flat, rippling zigzag.',
    tags: ['wood', 'parquet', 'chevron', 'teak', 'shallow', 'mid-century', 'living', 'study'], packs: ['mid-century'], price: 40, repeat: 1.2, painter: 'wood-parquet',
    params: Q('grain-teak', { layout: 'chevron', block: 0.6, board: 0.08, angle: 30, scale: 0.6 }), palettes: woodBank('teak', '#b48848') },
  { id: 'parquet-chevron-twotone', name: 'Two-Tone Chevron', description: 'Oak chevron where each arm of the V is a shade lighter or darker than its neighbour.',
    tags: ['wood', 'parquet', 'chevron', 'two-tone', 'oak', 'graphic', 'living', 'dining'], packs: ['mid-century', 'art-deco'], price: 38, repeat: 1.0, painter: 'wood-parquet',
    params: Q('grain-oak', { layout: 'chevron', block: 0.5, board: 0.075, alt: 0.8, scale: 0.6 }), palettes: woodBank('oak', '#bf9567') },
  { id: 'parquet-mosaic-fingers', name: 'Mosaic Finger Parquet', description: 'Squares of five slim maple fingers, each square turned a quarter from the next: the classic mosaic parquet.',
    tags: ['wood', 'parquet', 'mosaic', 'fingers', 'maple', 'vintage', 'hall', 'study'], packs: ['mid-century', 'classic-townhouse'], price: 26, repeat: 1.2, painter: 'wood-parquet',
    params: Q('grain-maple', { layout: 'basket', block: 0.2, strips: 5, scale: 0.4 }), palettes: woodBank('maple', '#d2ab76') },
  { id: 'parquet-basket-coarse', name: 'Acacia Basket Weave', description: 'Squares of three acacia boards turned alternately: a bold, hand-made woven look.',
    tags: ['wood', 'parquet', 'basket-weave', 'acacia', 'woven', 'dining', 'living', 'hall'], packs: ['cozy-cottage', 'mid-century'], price: 32, repeat: 1.44, painter: 'wood-parquet',
    params: Q('grain-acacia', { layout: 'basket', block: 0.36, strips: 3, scale: 0.6 }), palettes: woodBank('acacia', '#a4723e') },
  { id: 'parquet-basket-diagonal', name: 'Diagonal Basket Weave', description: 'Cherry basket-weave squares turned on the diagonal, so the weave runs corner to corner.',
    tags: ['wood', 'parquet', 'basket-weave', 'diagonal', 'cherry', 'classic', 'dining', 'hall'], packs: ['classic-townhouse'], price: 36, repeat: 1.5, painter: 'wood-parquet',
    params: Q('grain-cherry', { layout: 'basket', block: 0.3, strips: 3, diagonal: true, scale: 0.6 }), palettes: woodBank('cherry', '#a05e3e') },
  { id: 'parquet-harlequin-diamond', name: 'Harlequin Parquet', description: 'Oak diamonds set on the point, each with its grain turned across the last and tones alternating.',
    tags: ['wood', 'parquet', 'diamond', 'harlequin', 'oak', 'graphic', 'hall', 'dining'], packs: ['art-deco', 'classic-townhouse'], price: 34, repeat: 1.5, painter: 'wood-parquet',
    params: Q('grain-oak', { layout: 'basket', block: 0.3, strips: 1, diagonal: true, alt: 0.6, scale: 0.6 }), palettes: woodBank('oak', '#c09868') },
  { id: 'parquet-checker-wood', name: 'Wood Checkerboard', description: 'Walnut squares laid with the grain all one way, alternating light and dark like a chessboard.',
    tags: ['wood', 'parquet', 'checkerboard', 'walnut', 'two-tone', 'retro', 'kitchen', 'hall', 'study'], packs: ['mid-century', 'art-deco'], price: 30, repeat: 1.2, painter: 'wood-parquet',
    params: Q('grain-walnut', { layout: 'basket', block: 0.3, strips: 1, turn: false, alt: 1, gap: 0.004, scale: 0.6 }), palettes: woodBank('walnut', '#71503a') },
  { id: 'parquet-brick-blocks', name: 'Reclaimed Block Floor', description: 'Short reclaimed elm blocks laid like brickwork, worn and warm, each with its own swirl of grain.',
    tags: ['wood', 'parquet', 'block', 'brick-bond', 'reclaimed', 'workshop', 'kitchen', 'hall'], packs: ['industrial-loft', 'cozy-cottage'], price: 24, repeat: 1.2, painter: 'wood-parquet',
    params: Q('grain-elm', { layout: 'brick', block: 0.2, board: 0.075, gap: 0.003, scale: 0.5, variation: 0.55 }), palettes: woodBank('heart-pine', '#a46f3e') },
  { id: 'parquet-pinwheel', name: 'Mahogany Pinwheel', description: 'Four mahogany boards spin around a small square in each cell: the pinwheel, or hopscotch, pattern.',
    tags: ['wood', 'parquet', 'pinwheel', 'mahogany', 'geometric', 'classic', 'hall', 'dining'], packs: ['classic-townhouse', 'art-deco'], price: 36, repeat: 1.35, painter: 'wood-parquet',
    params: Q('grain-mahogany', { layout: 'pinwheel', block: 0.45, ratio: 2, scale: 0.6 }), palettes: woodBank('mahogany', '#86482e') },
  { id: 'parquet-hopscotch', name: 'Teak Hopscotch', description: 'Long teak boards round a bigger square, in the stretched, airy version of the pinwheel.',
    tags: ['wood', 'parquet', 'pinwheel', 'hopscotch', 'teak', 'mid-century', 'living', 'hall'], packs: ['mid-century'], price: 34, repeat: 1.2, painter: 'wood-parquet',
    params: Q('grain-teak', { layout: 'pinwheel', block: 0.6, ratio: 3, scale: 0.6 }), palettes: woodBank('teak', '#b68a4a') },
  { id: 'parquet-hexagon-wood', name: 'Wood Hexagon Mosaic', description: 'Hexagonal olive-wood blocks, each cut with its grain turned a third of a turn from the last.',
    tags: ['wood', 'parquet', 'hexagon', 'honeycomb', 'olive', 'artisan', 'bathroom', 'hall', 'kitchen'], packs: ['art-deco', 'botanical-living'], price: 42, repeat: 1.2, painter: 'wood-parquet',
    params: Q('grain-olive', { layout: 'hexagon', block: 0.2, scale: 0.8 }), palettes: woodBank('olive', '#b38c54') },
  { id: 'parquet-versailles', name: 'Versailles Panels', description: 'Square oak panels, each a mitred frame round a lattice of small turned diamonds: the floor of the great houses.',
    tags: ['wood', 'parquet', 'versailles', 'panel', 'oak', 'grand', 'formal', 'dining', 'living', 'hall'], packs: ['classic-townhouse', 'art-deco'], price: 48, repeat: 2.0, painter: 'wood-parquet',
    params: Q('grain-oak', { layout: 'versailles', block: 1.0, scale: 0.6 }), palettes: woodBank('oak', '#b88e60') },
] as Spec[]).map((s) => mk('parquet', s));

// ---------------------------------------------------------------------------------------------
// Laminate and vinyl (18)
// ---------------------------------------------------------------------------------------------

const RUBBER: Tuple[] = [
  ['rubber-black', 'Gym Black', '#2c2d30'], ['rubber-charcoal', 'Charcoal', '#4a4c50'], ['rubber-grey', 'Cool Grey', '#8b8e92'], ['rubber-red', 'Signal Red', '#b4372f'],
  ['rubber-blue', 'Royal Blue', '#2f5a96'], ['rubber-green', 'Sports Green', '#3f7a4c'], ['rubber-orange', 'Safety Orange', '#d77a2a'], ['rubber-sand', 'Sand', '#c4b496'],
];
const rubberP = make((c) => [c!, shd(c!, 0.26), shd(c!, -0.32), shd(c!, -0.55)]);
const R = (map: string, p: Params): Params => ({ map, ...p });

export const FLOORS_A_LAMINATE: SurfaceDesign[] = ([
  { id: 'laminate-click-oak', name: 'Click Laminate Oak', description: '19 cm click-together laminate with a printed oak grain, bevelled edges and a hard-wearing top layer.',
    tags: ['laminate', 'oak', 'click', 'plank', 'budget', 'living', 'bedroom', 'hall'], packs: ['everyday-essentials'], price: 5, repeat: 1.92, painter: 'board-floor',
    params: R('grain-oak', { board: 0.19, minLen: 1.2, maxLen: 1.2, bond: 'third', bevel: 'micro', variation: 0.35, scale: 0.6 }), palettes: woodBank('laminate-oak', '#c29c70') },
  { id: 'laminate-grey-ash', name: 'Grey Wash Laminate', description: 'Cool, grey-washed ash print laminate in half-stagger planks: a quiet, contemporary budget floor.',
    tags: ['laminate', 'ash', 'grey', 'plank', 'contemporary', 'budget', 'living', 'bedroom'], packs: ['everyday-essentials', 'modern-minimal'], price: 6, repeat: 1.92, painter: 'board-floor',
    params: R('grain-ash', { board: 0.19, minLen: 1.2, maxLen: 1.2, bond: 'half', bevel: 'micro', variation: 0.3, scale: 0.6 }), palettes: woodBank('laminate-ash', '#aaa398') },
  { id: 'laminate-herringbone', name: 'Herringbone Laminate', description: 'Laminate blocks in a classic herringbone, giving the parquet look at a fraction of the price.',
    tags: ['laminate', 'herringbone', 'oak', 'parquet-look', 'budget', 'living', 'hall', 'bedroom'], packs: ['everyday-essentials', 'classic-townhouse'], price: 9, repeat: 1.2, painter: 'wood-parquet',
    params: R('grain-oak-rift', { layout: 'herringbone', block: 0.4, ratio: 5, variation: 0.3, scale: 0.6 }), palettes: woodBank('laminate-herringbone', '#bf9a6c') },
  { id: 'laminate-chevron', name: 'Chevron Laminate', description: 'Walnut-print laminate boards mitred into a chevron, with tight micro-bevelled joints.',
    tags: ['laminate', 'chevron', 'walnut', 'parquet-look', 'budget', 'living', 'hall'], packs: ['everyday-essentials', 'mid-century'], price: 9, repeat: 1.0, painter: 'wood-parquet',
    params: R('grain-walnut', { layout: 'chevron', block: 0.5, board: 0.09, variation: 0.3, scale: 0.6 }), palettes: woodBank('laminate-chevron', '#6e4a34') },
  { id: 'lvp-scraped-wide', name: 'Scraped Wide Vinyl Plank', description: '23 cm vinyl planks printed from hand-scraped oak, waterproof and warm underfoot.',
    tags: ['vinyl', 'lvp', 'plank', 'wide', 'scraped', 'waterproof', 'kitchen', 'bathroom', 'living'], packs: ['everyday-essentials'], price: 7, repeat: 1.84, painter: 'board-floor',
    params: R('grain-oak-scraped', { board: 0.23, minLen: 1.5, maxLen: 1.5, bond: 'third', bevel: 'micro', variation: 0.35, scale: 0.8 }), palettes: woodBank('vinyl-scraped', '#a98558') },
  { id: 'lvp-weathered-plank', name: 'Weathered Vinyl Plank', description: 'Silver, driftwood-look vinyl planks with caulk-fine joints: coastal style that shrugs off spills.',
    tags: ['vinyl', 'lvp', 'plank', 'weathered', 'driftwood', 'coastal', 'bathroom', 'kitchen'], packs: ['coastal-home', 'everyday-essentials'], price: 7, repeat: 1.8, painter: 'board-floor',
    params: R('grain-driftwood', { board: 0.18, minLen: 0.9, maxLen: 1.8, bevel: 'micro', variation: 0.4, scale: 0.7 }), palettes: woodBank('vinyl-driftwood', '#b2a794') },
  { id: 'lvp-herringbone-spc', name: 'Rigid-Core Herringbone', description: 'Stone-composite vinyl blocks printed as hickory and laid in herringbone: waterproof parquet.',
    tags: ['vinyl', 'spc', 'herringbone', 'hickory', 'waterproof', 'kitchen', 'hall', 'living'], packs: ['everyday-essentials', 'modern-minimal'], price: 11, repeat: 1.2, painter: 'wood-parquet',
    params: R('grain-hickory', { layout: 'herringbone', block: 0.4, ratio: 6, variation: 0.3, scale: 0.6 }), palettes: woodBank('spc-hickory', '#b38a60') },
  { id: 'lvp-slate-tile', name: 'Slate-Look Vinyl Tile', description: '60 by 30 cm vinyl tiles printed with riven slate, in running bond with fine grouted joints.',
    tags: ['vinyl', 'lvt', 'tile', 'slate', 'stone-look', 'kitchen', 'bathroom', 'hall'], packs: ['everyday-essentials', 'industrial-loft'], price: 8, repeat: 1.2, painter: 'board-floor',
    params: R('stone-slate', { board: 0.3, minLen: 0.6, maxLen: 0.6, bond: 'half', gap: 0.004, bevel: 'micro', variation: 0.45, scale: 1.0 }), palettes: printBank('slate-vinyl', '#6a6e70') },
  { id: 'lvp-marble-tile', name: 'Marble-Look Vinyl Tile', description: '60 cm square vinyl tiles printed with soft grey-veined marble, stack bond and slim joints.',
    tags: ['vinyl', 'lvt', 'tile', 'marble', 'stone-look', 'bathroom', 'kitchen', 'hall'], packs: ['modern-minimal', 'art-deco'], price: 10, repeat: 1.2, painter: 'board-floor',
    params: R('stone-marble', { board: 0.6, minLen: 0.6, maxLen: 0.6, bond: 'stack', gap: 0.003, bevel: 'micro', variation: 0.3, scale: 1.2 }), palettes: printBank('marble-vinyl', '#d6d3cc') },
  { id: 'lvp-concrete-diagonal', name: 'Diagonal Concrete-Look Tile', description: 'Smooth screed-print vinyl tiles set on the diagonal: an urban, seamless-looking floor.',
    tags: ['vinyl', 'lvt', 'tile', 'concrete-look', 'diagonal', 'urban', 'kitchen', 'hall', 'studio'], packs: ['industrial-loft', 'modern-minimal'], price: 8, repeat: 1.8, painter: 'board-floor',
    params: R('print-screed', { board: 0.45, minLen: 0.45, maxLen: 0.45, bond: 'stack', diagonal: true, gap: 0.003, bevel: 'micro', variation: 0.4, scale: 1.2 }), palettes: printBank('screed-vinyl', '#9b9a96') },
  { id: 'lvp-travertine-tile', name: 'Travertine-Look Vinyl Tile', description: '40 cm vinyl tiles printed with warm travertine, its fissures and pits carried across the joints.',
    tags: ['vinyl', 'lvt', 'tile', 'travertine', 'stone-look', 'warm', 'bathroom', 'hall', 'kitchen'], packs: ['coastal-home', 'everyday-essentials'], price: 9, repeat: 1.2, painter: 'board-floor',
    params: R('print-travertine', { board: 0.4, minLen: 0.4, maxLen: 0.4, bond: 'stack', gap: 0.003, bevel: 'micro', variation: 0.35, scale: 0.9 }), palettes: printBank('travertine-vinyl', '#c9b89a') },
  { id: 'vinyl-terrazzo-sheet', name: 'Terrazzo Sheet Vinyl', description: 'Seamless vinyl sheet printed with marble chips in cement: the terrazzo look without the weight.',
    tags: ['vinyl', 'sheet', 'terrazzo', 'speckled', 'retro', 'kitchen', 'bathroom', 'laundry'], packs: ['mid-century', 'everyday-essentials'], price: 6, repeat: 1.6, painter: 'map-floor',
    params: R('print-terrazzo', { tiles: 2 }), palettes: printBank('terrazzo-vinyl', '#a9a69f') },
  { id: 'vinyl-woven-sheet', name: 'Woven Vinyl Sheet', description: 'Flat ribbons of vinyl woven in a fine basket weave: a tough, easy-clean sheet that looks like sisal.',
    tags: ['vinyl', 'sheet', 'woven', 'basket-weave', 'natural', 'kitchen', 'conservatory', 'hall'], packs: ['coastal-home', 'botanical-living'], price: 6, repeat: 1.2, painter: 'map-floor',
    params: R('print-woven', { tiles: 2 }), palettes: printBank('woven-vinyl', '#b8a98a') },
  { id: 'vinyl-cork-tile', name: 'Cork Floor Tile', description: '30 cm cork tiles in stack bond, warm and springy, with the speckle of pressed bark.',
    tags: ['cork', 'tile', 'natural', 'warm', 'acoustic', 'study', 'bedroom', 'kids'], packs: ['mid-century', 'botanical-living'], price: 8, repeat: 1.2, painter: 'board-floor',
    params: R('print-cork', { board: 0.3, minLen: 0.3, maxLen: 0.3, bond: 'stack', gap: 0.002, bevel: 'micro', variation: 0.4, scale: 0.6 }), palettes: printBank('cork', '#b98a5c') },
  { id: 'vinyl-cork-plank', name: 'Cork Click Plank', description: 'Click-together cork planks in half-stagger: a soft, quiet, sustainable floor.',
    tags: ['cork', 'plank', 'click', 'natural', 'quiet', 'bedroom', 'study', 'living'], packs: ['modern-minimal', 'botanical-living'], price: 11, repeat: 1.8, painter: 'board-floor',
    params: R('print-cork', { board: 0.185, minLen: 0.9, maxLen: 0.9, bond: 'half', gap: 0.002, bevel: 'pillow', variation: 0.4, scale: 0.7 }), palettes: printBank('cork-plank', '#c09468') },
  { id: 'rubber-studded', name: 'Studded Rubber Tile', description: '60 cm rubber tiles with round studs at a fine pitch: grippy, tough and washable.',
    tags: ['rubber', 'studded', 'tile', 'grip', 'utility', 'garage', 'gym', 'laundry'], packs: ['everyday-essentials', 'industrial-loft'], price: 7, repeat: 1.2, painter: 'rubber-relief',
    params: R('print-rubber', { relief: 'studs', tile: 0.6, pitch: 0.05 }), palettes: rubberP(RUBBER) },
  { id: 'rubber-coin', name: 'Coin Rubber Flooring', description: 'Raised rubber coins in staggered rows on a speckled ground: the playground and studio classic.',
    tags: ['rubber', 'coin', 'tile', 'grip', 'playroom', 'studio', 'gym', 'kids'], packs: ['kids-storybook', 'creative-studio'], price: 8, repeat: 1.0, painter: 'rubber-relief',
    params: R('print-rubber', { relief: 'coins', tile: 0.5, pitch: 0.06 }), palettes: rubberP(RUBBER) },
  { id: 'rubber-ribbed', name: 'Ribbed Rubber Tile', description: 'Fine parallel ribs on rubber tiles, for ramps, hallways and utility rooms.',
    tags: ['rubber', 'ribbed', 'tile', 'grip', 'utility', 'hall', 'garage', 'workshop'], packs: ['everyday-essentials', 'industrial-loft'], price: 6, repeat: 1.2, painter: 'rubber-relief',
    params: R('print-rubber', { relief: 'ribs', tile: 0.6, pitch: 0.035 }), palettes: rubberP(RUBBER) },
] as Spec[]).map((s) => mk('laminate-vinyl', s));

export const FLOORS_A: SurfaceDesign[] = [...FLOORS_A_PLANKS, ...FLOORS_A_PARQUET, ...FLOORS_A_LAMINATE];
