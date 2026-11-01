// Content definition types. Every catalog entry has a stable id, readable English name, description,
// tags, source/asset reference, pricing or gameplay data, and an implementation status.
// Entries with status 'dev' are never shown as selectable finished content and never counted.

import type {
  BodyFrame, BondStatus, Cents, GarmentLayer, Hex, MemoryKind, NeedId, OutfitCategory, Posture,
} from '../core/types';
import type { AnimId } from '../core/anim';

export type ContentStatus = 'ready' | 'dev';
export type PriceTier = 'budget' | 'standard' | 'premium' | 'luxury';

export interface Swatch { id: string; name: string; color: Hex }
export interface Palette { id: string; name: string; colors: Hex[] }

// ---------------------------------------------------------------------------------------------
// Construction surfaces (walls, floors) and openings
// ---------------------------------------------------------------------------------------------

export interface SurfaceDesign {
  id: string;
  surface: 'wall' | 'floor';
  name: string;
  description: string;
  /** Family from the brief's allocation tables, e.g. 'stripes', 'floral', 'wood-planks'. */
  family: string;
  tags: string[];
  packs: string[];
  tier: PriceTier;
  /** Price per wall side (one tile wide) or per floor tile. */
  price: Cents;
  /** Procedural painter id implemented in render/textures (seeded, reproducible). */
  painter: string;
  params: Record<string, number | string | boolean>;
  /** Metres covered by one texture repeat (horizontal; walls repeat vertically over the wall height). */
  repeat: number;
  /** Curated palette variants; palettes[0] is the default. Distinct designs are counted once. */
  palettes: Palette[];
  /** Explains a fixed or reduced palette (murals etc.). */
  paletteNote?: string;
  status: ContentStatus;
}

export interface OpeningDef {
  id: string;
  kind: 'door' | 'window';
  name: string;
  description: string;
  tags: string[];
  packs: string[];
  tier: PriceTier;
  price: Cents;
  /** Width in tiles (M1: 1). */
  width: number;
  /** Opening height in metres, and sill height for windows. */
  height: number;
  sill: number;
  /** Procedural model parameters used by the renderer (frame style, panes, colours). */
  style: Record<string, number | string | boolean>;
  status: ContentStatus;
}

// ---------------------------------------------------------------------------------------------
// Buy-mode objects
// ---------------------------------------------------------------------------------------------

export type CatalogCategory =
  | 'seating' | 'beds' | 'tables' | 'storage' | 'kitchen' | 'bathroom' | 'lighting' | 'electronics'
  | 'hobby' | 'decor' | 'outdoor' | 'kids';

export type PlacementLayer = 'floor' | 'rug' | 'wall' | 'surface' | 'ceiling';
export type SlotKind = 'sit' | 'sleep' | 'use' | 'stand';

export interface ObjectSlot {
  id: string;
  kind: SlotKind;
  /** Anchor in rot-0 local space, metres from the footprint min corner (see core/geometry.ts). */
  pos: [number, number];
  /** Height of the anchor above the floor (seat or mattress surface). */
  height: number;
  /** Facing in rot-0 local space (0 = +z). Seated people face this way. */
  facing: number;
  /** Tile, in rot-0 local cell coordinates (may lie outside the footprint), the person must reach first. */
  approach: [number, number];
  /** Posture while using the slot. */
  posture: Posture;
}

export interface FinishRegion {
  id: string; // e.g. 'wood', 'fabric', 'metal'
  label: string;
  /** Source model material names recoloured by this region. */
  materials: string[];
  swatches: Swatch[]; // swatches[0] = default
}

/** Gameplay stats. Quality scales relevant effects (comfort, energy restore, fun, skill gain). */
export interface ObjectStats {
  comfort?: number; // 0..10
  energy?: number; // restore multiplier for sleep/rest, 1 = standard
  fun?: number; // multiplier for fun interactions
  hygiene?: number; // multiplier
  skill?: number; // skill gain multiplier
  cooking?: number; // meal quality bonus
  environment?: number; // decor score contribution, -5..10
}

export interface ObjectDef {
  id: string;
  name: string;
  description: string;
  category: CatalogCategory;
  subcategory?: string;
  rooms: string[]; // 'kitchen' | 'living' | 'bedroom' | 'bathroom' | 'dining' | 'study' | 'kids' | 'outdoor'
  style: string;
  tags: string[];
  packs: string[];
  tier: PriceTier;
  price: Cents;
  /** 1..5 */
  quality: number;
  /** false = decorative only (labelled as such in the catalog). */
  functional: boolean;
  /** Runtime model: manifest furniture key, uniform scale and offset applied in rot-0 local space. */
  model: { asset: string; scale: number; offset: [number, number, number]; yaw: number };
  footprint: { w: number; d: number };
  layer: PlacementLayer;
  /** Wall-attached objects must back onto a wall edge on their rot-0 -z side. */
  needsWall?: boolean;
  /** Blocks walking on its footprint (rugs and wall decor do not). */
  blocksMovement: boolean;
  /** Top surface height if surface items can be placed on it (counters, tables, desks). */
  surfaceHeight?: number;
  /** Height of the object (metres) for clearance and picking. */
  height: number;
  slots: ObjectSlot[];
  /** InteractionDef ids offered by this object. */
  interactions: string[];
  stats: ObjectStats;
  finishes: FinishRegion[];
  status: ContentStatus;
}

// ---------------------------------------------------------------------------------------------
// Interactions (object and self) and social interactions
// ---------------------------------------------------------------------------------------------

export type InteractionKind = 'object' | 'self' | 'item' | 'tile';

export interface InteractionDef {
  id: string;
  name: string; // menu label, e.g. 'Sleep', 'Cook a Meal'
  description: string;
  icon: string; // UI icon id
  kind: InteractionKind;
  /** Slot kinds this interaction uses on its object; empty = stand at any 'use' slot or adjacent tile. */
  slotKinds: SlotKind[];
  anims: { prepare?: AnimId; perform: AnimId; cleanup?: AnimId };
  posture: Posture;
  duration: { kind: 'fixed'; minutes: number } | { kind: 'untilFull'; need: NeedId; maxMinutes: number };
  /** Need change per game hour while performing (before object stat and trait modifiers). */
  needsPerHour: Partial<Record<NeedId, number>>;
  /** Need change applied once at completion. */
  needsOnComplete: Partial<Record<NeedId, number>>;
  skill?: { id: string; xpPerHour: number };
  /** Charged once when perform begins (e.g. groceries). Refunded if cancelled before perform. */
  cost?: Cents;
  moodletOnComplete?: string;
  /** Special behaviour implemented by the simulation ('cook', 'eatMeal', 'goToWork', 'changeOutfit', ...). */
  behavior?: string;
  autonomy: {
    enabled: boolean;
    /** Advertised need gains used by utility scoring. */
    ads: Partial<Record<NeedId, number>>;
    /** Tags for trait/preference biasing, e.g. 'tv', 'creative', 'active', 'reading', 'food'. */
    tags: string[];
  };
  /** Who may use it. */
  allowVisitors: boolean;
  status: ContentStatus;
}

export type SocialCategory =
  | 'greeting' | 'friendly' | 'funny' | 'deep' | 'support' | 'mean' | 'romantic' | 'family' | 'status';

export interface RelDelta { familiarity?: number; friendship?: number; trust?: number; romance?: number }

export interface SocialOutcome {
  actor: RelDelta; // change in actor's opinion of target
  target: RelDelta; // change in target's opinion of actor
  social: number; // social need gain for both
  fun?: number;
  actorMoodlet?: string;
  targetMoodlet?: string;
  memory?: { kind: MemoryKind; importance: 1 | 2 | 3; text: string };
  /** Shared status set on acceptance. */
  setStatus?: BondStatus;
}

export interface SocialDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: SocialCategory;
  minutes: number;
  anim: AnimId;
  requires: {
    minFamiliarity?: number;
    maxFamiliarity?: number; // e.g. Introduce only when strangers
    minFriendship?: number;
    maxFriendship?: number;
    minRomance?: number;
    /** Requires adult life stages and compatible romantic interest. */
    romantic?: boolean;
    status?: BondStatus[];
    notStatus?: BondStatus[];
  };
  /** Base chance the target accepts, 0..1, before mood, relationship and trait modifiers. */
  acceptance: number;
  /** Target trait id -> additive acceptance modifier. */
  targetTraits: Record<string, number>;
  /** Actor trait id -> additive acceptance modifier. */
  actorTraits: Record<string, number>;
  success: SocialOutcome;
  failure: SocialOutcome;
  /** Authored snippets; {a} = actor first name, {b} = target first name. */
  lines: { success: string[]; failure: string[] };
  topics: string[];
  autonomy: { enabled: boolean; weight: number };
  /** Counts as one of the activities in content totals only when true (see brief Section 2). */
  alsoActivity: boolean;
  status: ContentStatus;
}

// ---------------------------------------------------------------------------------------------
// Personality, progression
// ---------------------------------------------------------------------------------------------

export type TraitCategory = 'social' | 'tidiness' | 'energy' | 'creativity' | 'leisure' | 'lifestyle';

export interface TraitDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: TraitCategory;
  conflicts: string[];
  effects: {
    /** Need decay multipliers (1 = normal). */
    needDecay?: Partial<Record<NeedId, number>>;
    /** Autonomy score multipliers keyed by interaction id or autonomy tag. */
    autonomyBias?: Record<string, number>;
    /** Skill xp multipliers. */
    skillRate?: Record<string, number>;
    /** Acceptance modifiers when this person is the TARGET of a social category. */
    socialReceive?: Partial<Record<SocialCategory, number>>;
    /** Daily career performance modifier. */
    workPerformance?: number;
    /** Need gain multipliers when performing interactions with these autonomy tags. */
    enjoys?: Record<string, number>;
  };
  /** Plain-English list of the implemented effects for the UI. */
  effectText: string[];
  status: ContentStatus;
}

export type AspirationObjective =
  | { id: string; text: string; type: 'skill'; skillId: string; level: number }
  | { id: string; text: string; type: 'interactionCount'; match: string; count: number }
  | { id: string; text: string; type: 'friends'; count: number; minFriendship: number }
  | { id: string; text: string; type: 'funds'; amount: Cents }
  | { id: string; text: string; type: 'careerLevel'; level: number }
  | { id: string; text: string; type: 'ownObjects'; tag: string; count: number; /** Count only objects the household bought after move-in (not the pre-owned starter furnishings). */ bought?: true }
  | { id: string; text: string; type: 'homeValue'; amount: Cents }
  | { id: string; text: string; type: 'bond'; status: BondStatus };

export interface AspirationDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  stages: Array<{ name: string; objectives: AspirationObjective[]; reward: { money: Cents; moodlet?: string; text: string } }>;
  status: ContentStatus;
}

export interface SkillDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Cumulative xp needed to reach levels 2..10 (length 9). */
  thresholds: number[];
  unlocks: Array<{ level: number; text: string }>;
  status: ContentStatus;
}

export interface CareerLevelDef {
  level: number;
  title: string;
  hourlyWage: Cents;
  /** 0 = Monday ... 6 = Sunday */
  days: number[];
  /** Minutes after midnight. */
  start: number;
  end: number;
  promotion: { performance: number; skills: Record<string, number> };
}

export interface CareerDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  skills: string[];
  levels: CareerLevelDef[];
  status: ContentStatus;
}

export interface MoodletDef { id: string; name: string; description: string; icon: string; value: number; minutes: number }

export interface RecipeDef {
  id: string;
  name: string;
  description: string;
  minutes: number;
  cost: Cents;
  servings: number;
  /** Hunger restored by one portion at quality 1. */
  hunger: number;
  minCookingLevel: number;
  status: ContentStatus;
}

export interface PackDef { id: string; name: string; description: string }

// ---------------------------------------------------------------------------------------------
// Character content (owned by src/characters; data lives in src/content/character.ts)
// ---------------------------------------------------------------------------------------------

export interface ParamDef { id: string; name: string; group: string; min: number; max: number; step: number }

export interface HairDef {
  id: string;
  name: string;
  description: string;
  length: 'shaved' | 'short' | 'medium' | 'long';
  texture: 'straight' | 'wavy' | 'curly' | 'coily' | 'braided' | 'tied' | 'shaved';
  tags: string[];
  /** Procedural generator parameters (src/characters/hair.ts). */
  build: Record<string, number | string | boolean>;
  status: ContentStatus;
}

export interface FacialHairDef { id: string; name: string; description: string; build: Record<string, number | string | boolean>; status: ContentStatus }

export interface PatternDef { id: string; name: string; description: string }

export interface GarmentDef {
  id: string;
  name: string;
  description: string;
  layer: GarmentLayer;
  categories: OutfitCategory[];
  tags: string[];
  /** Allowed pattern ids ('solid' always allowed). */
  patterns: string[];
  defaultColor: Hex;
  /** Procedural garment parameters (src/characters/clothing.ts). */
  build: Record<string, number | string | boolean>;
  status: ContentStatus;
}

export interface AccessoryDef {
  id: string;
  name: string;
  description: string;
  kind: 'glasses' | 'hat' | 'earrings' | 'necklace' | 'bag' | 'watch' | 'scarf' | 'other';
  defaultColor: Hex;
  build: Record<string, number | string | boolean>;
  status: ContentStatus;
}

export interface FacePreset { id: string; name: string; params: Record<string, number> }
export interface BodyPreset { id: string; name: string; frame: BodyFrame; params: Record<string, number> }
export interface BrowStyle { id: string; name: string }
export interface VoicePreset { id: string; name: string }

// ---------------------------------------------------------------------------------------------
// Aggregated registry
// ---------------------------------------------------------------------------------------------

export interface ContentDB {
  objects: Record<string, ObjectDef>;
  openings: Record<string, OpeningDef>;
  wallDesigns: Record<string, SurfaceDesign>;
  floorDesigns: Record<string, SurfaceDesign>;
  interactions: Record<string, InteractionDef>;
  socials: Record<string, SocialDef>;
  traits: Record<string, TraitDef>;
  aspirations: Record<string, AspirationDef>;
  skills: Record<string, SkillDef>;
  careers: Record<string, CareerDef>;
  moodlets: Record<string, MoodletDef>;
  recipes: Record<string, RecipeDef>;
  packs: Record<string, PackDef>;
  hair: Record<string, HairDef>;
  facialHair: Record<string, FacialHairDef>;
  garments: Record<string, GarmentDef>;
  accessories: Record<string, AccessoryDef>;
  patterns: Record<string, PatternDef>;
  facePresets: Record<string, FacePreset>;
  bodyPresets: Record<string, BodyPreset>;
  browStyles: Record<string, BrowStyle>;
  voices: Record<string, VoicePreset>;
  faceParams: ParamDef[];
  bodyParams: ParamDef[];
  skinTones: Swatch[];
  hairColors: Swatch[];
  eyeColors: Swatch[];
  /** Likes/dislikes the creator offers, grouped: 'activity' | 'music' | 'decor' | 'food' | 'topic'. */
  preferences: Array<{ id: string; group: string; name: string }>;
}
