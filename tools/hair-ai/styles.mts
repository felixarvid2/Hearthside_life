// The AI hairstyles: content metadata (merged into src/content/character.ts by hand, see HAIR there) and the image prompts.
// `hair` is the description spliced into the mannequin prompt; the other fields mirror HairDef.

export interface AiStyle {
  id: string;
  name: string;
  description: string;
  length: 'short' | 'medium' | 'long';
  texture: 'straight' | 'wavy' | 'curly' | 'coily' | 'braided' | 'tied';
  tags: string[];
  hair: string;
  /** Camera wording when a plain front view hides the style (ponytails). */
  view?: string;
  /** Adds a thin scalp cap from this hairline over the crown (for generations that leave the skull bare between the strands). */
  scalp?: { hairline: 'natural' | 'high' | 'fringe'; fringe?: number };
  /** Procedural parameters (src/characters/hair.ts) drawn while the GLB loads and when it cannot: the nearest procedural look. */
  fallback: Record<string, number | string | boolean>;
}

export const AI_STYLES: AiStyle[] = [
  { id: 'fade-crop', name: 'Skin Fade Crop', description: 'Closely faded sides and back with a short, textured crop on top.', length: 'short', texture: 'straight', tags: ['short', 'fade'],
    hair: 'a short textured crop haircut with a high skin fade: very short clipper-cut sides and back, short choppy textured fringe on top',
    fallback: { cap: 0.004, top: 0.008, hairline: 'natural', fringe: 0.2, piece: 'none', strand: 'straight' } },
  { id: 'quiff', name: 'Classic Quiff', description: 'Tapered sides with the front swept up and back into a voluminous quiff.', length: 'short', texture: 'straight', tags: ['short', 'volume'],
    hair: 'a classic quiff haircut: short tapered sides, the front swept up and back into a voluminous quiff',
    fallback: { cap: 0.006, top: 0.03, hairline: 'natural', part: 'left', fringe: 0.3, sweep: 1, piece: 'none', strand: 'straight' } },
  { id: 'slick-back', name: 'Slicked Back', description: 'Medium-length hair combed straight back with a glossy finish.', length: 'short', texture: 'straight', tags: ['short', 'classic'],
    hair: 'a slicked back haircut: medium-length hair combed straight back from the forehead with a glossy finish, shorter tapered sides',
    fallback: { cap: 0.006, top: 0.016, hairline: 'high', fringe: 0, piece: 'none', strand: 'straight' } },
  { id: 'curly-crop', name: 'Short Curls', description: 'A compact cap of loose curls, tapered at the sides.', length: 'short', texture: 'curly', tags: ['short', 'curls'],
    hair: 'short curly hair: a compact cap of loose springy curls on top, tapered shorter curls at the sides',
    fallback: { cap: 0.005, top: 0.012, hairline: 'natural', fringe: 0.1, piece: 'curls', curlSize: 0.015, curlCount: 52, strand: 'curly' } },
  { id: 'locs-medium', name: 'Shoulder Locs', description: 'Medium-length locs that fall to the shoulders.', length: 'medium', texture: 'coily', tags: ['locs', 'medium'],
    hair: 'shoulder-length dreadlocks: many thick twisted locs of hair hanging down evenly around the head',
    fallback: { cap: 0.006, top: 0.01, hairline: 'natural', part: 'center', fringe: 0, piece: 'braids', length: 0.2, strand: 'braided' } },
  { id: 'waves-long', name: 'Long Waves', description: 'Long, soft beach waves with a gentle side part.', length: 'long', texture: 'wavy', tags: ['long', 'waves'],
    hair: 'long wavy hair with soft beach waves falling past the shoulders, gentle side part',
    fallback: { cap: 0.012, top: 0.016, hairline: 'natural', part: 'left', fringe: 0, piece: 'long', length: 0.3, wave: 0.014, strand: 'wavy' } },
  { id: 'bob-bangs', name: 'Blunt Bob and Bangs', description: 'A sleek jaw-length bob with full, blunt bangs.', length: 'medium', texture: 'straight', tags: ['medium', 'bangs'],
    hair: 'a sleek straight jaw-length bob with full blunt bangs across the forehead',
    fallback: { cap: 0.012, top: 0.016, hairline: 'fringe', fringe: 0.9, piece: 'bob', length: 0.12, flare: 0.006, strand: 'straight' } },
  { id: 'pixie', name: 'Pixie Cut', description: 'Short, feathered pixie with wispy bangs.', length: 'short', texture: 'straight', tags: ['short', 'feathered'],
    hair: 'a short feathered pixie cut with wispy side-swept bangs and short tapered back',
    fallback: { cap: 0.008, top: 0.014, hairline: 'fringe', fringe: 0.5, sweep: 1, piece: 'none', strand: 'straight' } },
  { id: 'bun-messy', name: 'High Messy Bun', description: 'Hair twisted into a loose, high bun with a few loose strands.', length: 'medium', texture: 'tied', tags: ['tied', 'updo'],
    hair: 'hair twisted into a loose messy high bun on top of the head with a few loose strands, smooth sides',
    fallback: { cap: 0.006, top: 0.008, hairline: 'natural', fringe: 0, piece: 'bun', bunSize: 0.056, strand: 'straight' } },
  { id: 'ponytail-low', name: 'Low Side Ponytail', description: 'Smooth hair swept back into a low ponytail that falls over one shoulder.', length: 'long', texture: 'tied', tags: ['tied', 'long'],
    hair: 'smooth hair pulled back and tied into a low ponytail at the nape of the neck, hanging down the back',
    fallback: { cap: 0.006, top: 0.007, hairline: 'natural', fringe: 0, piece: 'ponytail', length: 0.3, strand: 'straight' } },
  { id: 'box-braids', name: 'Box Braids', description: 'Long box braids that hang down the back and shoulders.', length: 'long', texture: 'braided', tags: ['braids', 'long'],
    hair: 'long box braids: many thin neat individual braids hanging down past the shoulders',
    fallback: { cap: 0.006, top: 0.008, hairline: 'natural', part: 'center', fringe: 0, piece: 'braids', length: 0.36, strand: 'braided' } },
  { id: 'layered-shoulder', name: 'Layered Shoulder-Length', description: 'Soft layers that end at the shoulders with face-framing pieces.', length: 'medium', texture: 'straight', tags: ['medium', 'layers'],
    hair: 'shoulder-length layered hair with soft face-framing layers and a center part',
    fallback: { cap: 0.012, top: 0.016, hairline: 'natural', part: 'center', fringe: 0, piece: 'long', length: 0.2, wave: 0.004, strand: 'straight' } },
  { id: 'afro-puffs', name: 'Afro Puffs', description: 'Two round puffs of coily hair high on each side.', length: 'medium', texture: 'coily', tags: ['coils', 'tied'],
    hair: 'two round fluffy afro puffs of coily hair, one high on each side of the head, with smooth hair between them',
    fallback: { cap: 0.012, top: 0.04, hairline: 'natural', fringe: 0, piece: 'afro', volume: 0.03, strand: 'coily' } },
  { id: 'wolf-cut', name: 'Shaggy Wolf Cut', description: 'Choppy, layered shag with volume on top and wispy ends.', length: 'medium', texture: 'wavy', tags: ['medium', 'shaggy'],
    hair: 'a shaggy wolf cut: choppy layered hair with volume on top, curtain bangs and wispy ends reaching the neck',
    fallback: { cap: 0.012, top: 0.02, hairline: 'fringe', fringe: 0.6, piece: 'bob', length: 0.14, flare: 0.01, strand: 'wavy' } },
  { id: 'man-bun', name: 'Top Bun Undercut', description: 'Shaved sides with the long top gathered in a bun.', length: 'medium', texture: 'tied', tags: ['tied', 'undercut'],
    hair: 'an undercut with a man bun: very short shaved sides, long hair on top gathered into a neat bun at the back of the crown',
    fallback: { cap: 0.006, top: 0.008, hairline: 'natural', fringe: 0, piece: 'bun', bunSize: 0.05, strand: 'straight' } },
  { id: 'space-buns', name: 'Space Buns', description: 'Two small buns set high on either side of the head.', length: 'medium', texture: 'tied', tags: ['tied', 'playful'],
    hair: 'space buns: hair parted in the middle and twisted into two small round buns high on each side of the head',
    fallback: { cap: 0.006, top: 0.008, hairline: 'natural', part: 'center', fringe: 0, piece: 'bun', bunSize: 0.045, strand: 'straight' } },
  { id: 'pompadour', name: 'Pompadour', description: 'Tall, swept-back front with short faded sides.', length: 'short', texture: 'straight', tags: ['short', 'volume'],
    hair: 'a pompadour: tall voluminous swept-back front, short faded sides',
    fallback: { cap: 0.006, top: 0.035, hairline: 'natural', part: 'left', fringe: 0.2, sweep: 1, piece: 'none', strand: 'straight' } },
  { id: 'twin-tails', name: 'Pigtails', description: 'Two ponytails tied low on each side.', length: 'long', texture: 'tied', tags: ['tied', 'playful'],
    hair: 'two pigtails: hair parted in the middle and tied in two ponytails, one at each side of the head, hanging down past the shoulders',
    fallback: { cap: 0.006, top: 0.007, hairline: 'natural', part: 'center', fringe: 0, piece: 'ponytail', length: 0.3, strand: 'straight' } },
];

/** Mannequin prompt: the bald grey head is what the build step registers against and then strips from the 3D model. */
export function stylePrompt(s: AiStyle): string {
  return `Studio product render of a smooth bald matte light grey mannequin head, completely featureless, no face details, no ears detail, no neck, wearing ${s.hair}. The hair is one medium chestnut brown colour with fine visible strands, grows from a low natural hairline, close to the eyebrows ridge on the forehead, and covers the whole top, sides and back of the head with no bald patches. ${s.view ?? 'Front view'}, centred, head only, plain white background, soft even lighting, clean 3D render.`;
}

/** TypeScript source of the HAIR entries of the styles whose GLB is built (pasted between the AI-HAIR markers of src/content/character.ts). */
export function contentSource(styles: AiStyle[]): string {
  const fmt = (o: Record<string, number | string | boolean>) => `{ ${Object.entries(o).map(([k, v]) => `${k}: ${typeof v === 'string' ? `'${v}'` : v}`).join(', ')} }`;
  return styles.map((s) => `  {
    id: '${s.id}', name: '${s.name}', description: '${s.description}',
    length: '${s.length}', texture: '${s.texture}', tags: [${s.tags.map((t) => `'${t}'`).join(', ')}],
    build: ${fmt({ kind: 'mesh', asset: `hair/${s.id}.glb`, ...s.fallback })}, status: 'ready',
  },`).join('\n');
}
