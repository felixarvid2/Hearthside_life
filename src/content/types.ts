// Content definition types. Every catalog entry has a stable id, readable English name, description,
// tags, source/asset reference, pricing or gameplay data, and an implementation status.
// Entries with status 'dev' are never shown as selectable finished content and never counted.

import type {
  BodyFrame, BondStatus, Cents, EventGoalKind, GarmentLayer, HomeEventType, Hex, LifeStage, MemoryKind, NeedId, OutfitCategory, Posture,
  WeatherKind, WeatherRule, WorldItemKind,
} from '../core/types';
import type { AnimId } from '../core/anim';
import type { ExteriorContent } from './exterior';

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
  | 'hobby' | 'decor' | 'outdoor' | 'kids' | 'stairs';

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
  baking?: number; // baked-goods quality bonus (Milestone 11)
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
  /**
   * Rot-0 footprint cells that the model leaves empty (the inside of an L-shaped sofa): people can walk through them and
   * use them as approach tiles, but nothing else can be placed there. Only for blocking floor objects.
   */
  openCells?: Array<[number, number]>;
  /** Top surface height if surface items can be placed on it (counters, tables, desks). */
  surfaceHeight?: number;
  /** Height of the object (metres) for clearance and picking. */
  height: number;
  slots: ObjectSlot[];
  /** InteractionDef ids offered by this object. */
  interactions: string[];
  stats: ObjectStats;
  finishes: FinishRegion[];
  /**
   * Milestone 9: this object is a staircase. Semantics (src/world/levels.ts):
   * - `straight`: footprint w x `length` (w 1 or 2). In rot-0 local space the stair rises toward -z: its foot is the front
   *   (+z) row, its head the back (-z) row. People enter on the tile just in front of the foot row and arrive on the tile just
   *   behind the head row, one level up (one link per footprint column).
   * - `spiral`: square footprint (w = d >= 2). The foot is the front row, the head the back row, walked as a curve.
   * `length` is the number of tiles walked on the stair (the rise of LEVEL_HEIGHT is spread over them).
   * The footprint of the level above it has no floor (a hole). Stairs are placed on a level that has a floor (level >= 1).
   */
  stair?: StairSpec;
  /**
   * Milestone 10: moving parts declared in content instead of the table in render/objectAnim.ts (that table wins for the
   * defs it lists). The named GLB nodes (`anim:*`, see tools/furniture-extra/kit.mjs `part()`) are animated by `kind`.
   */
  anim?: ObjectAnimSpec;
  /**
   * Milestone 10: the model has an `anim:screen` part. The picture rectangle (content/screens.ts) is derived from that
   * part's measured bounds, so a new TV, computer, laptop or tablet needs no hand-measured entry. Hand-measured entries in
   * SCREENS win.
   */
  screen?: boolean;
  status: ContentStatus;
}

/** Milestone 10: part and animation vocabulary of ObjectDef.anim (render/objectAnim.ts runs it). */
export type PartAxis = 'x' | 'y' | 'z';
/**
 * What a part is. door / door2 / lid / oven / drawer / drawer2 move together as one group each (a role is one switch).
 * 'interior' is a static node shown only while some part is open; 'screen' is the static `anim:screen` node (documentation
 * for the validator; the picture itself is ObjectDef.screen).
 */
export type PartRole = 'door' | 'door2' | 'lid' | 'oven' | 'drawer' | 'drawer2' | 'interior' | 'screen';
/** 'openWhileUsed': every door, lid and drawer opens during any interaction on the object (or those in `on`). */
export type AnimKind =
  | 'fridge' | 'oven' | 'wardrobe' | 'toilet' | 'shower' | 'bath' | 'sink' | 'dishwasher' | 'laundry' | 'microwave' | 'openWhileUsed';
export type InteriorKind = 'fridge' | 'oven' | 'wardrobe' | 'dishwasher' | 'washer';

export interface AnimPartSpec {
  /** GLB node name, `anim:<name>`. */
  node: string;
  role: PartRole;
  /** Hinged: rotation axis through the node origin (in model space; keep def.model.yaw at 0) and signed angle in radians. */
  axis?: PartAxis;
  angle?: number;
  /** Sliding: translation when fully open, in the def's fitted metres (rot-0 local space; +z is the front). */
  slide?: [number, number, number];
  /** Game minutes for a full opening / closing (default 0.4). */
  openMinutes?: number;
  closeMinutes?: number;
}

/** Tap stream of a 'sink' anim, in fractions of the fitted box: x across, z from the back, top/bottom heights (same as objectAnim DESCRIPTORS). */
export interface AnimTapSpec { x: number; z: number; top: number; bottom: number }

/**
 * Hob effects of an 'oven' anim while something is cooked on top: glowing rings, a pot and steam. Positions are fractions of the
 * fitted box: [x across, z from the back].
 */
export interface AnimHobSpec {
  rings: [number, number][];
  /** The pot (and steam) sits on this spot; default: the first ring. */
  pan?: [number, number];
  /** Height of the hob surface as a fraction of the fitted box height (default 1: the top of the model). */
  y?: number;
  /** Ring diameter in metres (default 0.12). */
  ringSize?: number;
}

export interface ObjectAnimSpec {
  /** Which interaction / anim ids open the parts (render/objectAnim.ts activeParts). */
  kind: AnimKind;
  parts: AnimPartSpec[];
  /** Code-built cavity (shelves and food, oven racks, ...) shown while a part is open; not needed with an `anim:interior` node. */
  interior?: InteriorKind;
  /** Interior box as fractions of the fitted box [x0, y0, z0, x1, y1, z1]. */
  interiorBox?: [number, number, number, number, number, number];
  /** openWhileUsed only: interaction ids that open the parts (default: any interaction on the object). */
  on?: string[];
  /** 'sink' only: the tap-water stream shown while hands or dishes are washed. */
  tap?: AnimTapSpec;
  /** 'oven' only: hob rings, pot and steam shown while a meal is cooked on the object. */
  hob?: AnimHobSpec;
}

/** Milestone 9: see ObjectDef.stair. */
export interface StairSpec { length: 3 | 4; kind: 'straight' | 'spiral' }

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
  /**
   * Milestone 11: another skill trained by the same practice, at this fraction of the primary xp (Creativity from
   * painting, music, writing and baking). It uses the normal xp path, so there is only one progress bar per skill.
   */
  secondarySkill?: { id: string; fraction: number };
  /** Milestone 11: a minimum skill level needed to start the interaction (selling baked goods at Baking 5). */
  requiresSkill?: { id: string; level: number };
  /** Charged once when perform begins (e.g. groceries). Refunded if cancelled before perform. */
  cost?: Cents;
  moodletOnComplete?: string;
  /** Special behaviour implemented by the simulation ('cook', 'eatMeal', 'goToWork', 'changeOutfit', ...). */
  behavior?: string;
  /** Item interactions only: the kinds of world item this applies to (default: served meals). */
  itemKinds?: WorldItemKind[];
  autonomy: {
    enabled: boolean;
    /** Advertised need gains used by utility scoring. */
    ads: Partial<Record<NeedId, number>>;
    /** Tags for trait/preference biasing, e.g. 'tv', 'creative', 'active', 'reading', 'food'. */
    tags: string[];
  };
  /** Who may use it. */
  allowVisitors: boolean;
  /**
   * Where this belongs: the place types it is offered at, 'home' for any residential lot or a venue type (Lot.venueType: park,
   * cafe, gym, library, arts, market). Absent = everywhere. A jog lists only 'park'; a picnic lists 'park' and 'home' (not the
   * cafe terrace); computer games are for 'home' (not the library's computers).
   */
  venues?: string[];
  /**
   * Milestone 8: the life stages that may use it. Absent = the default for its behaviour (sim/gating.ts): babies nothing,
   * toddlers only what lists 'toddler', children eat/sleep/bathroom/fun/computer/homework, teens everything except
   * adult romance, careers and bills.
   */
  ages?: LifeStage[];
  /**
   * Milestone 12: seasons and weather this needs. Absent = no restriction. Outdoor interactions that make no sense
   * in rain or snow stay listed but greyed with a reason ("It is raining."); autonomy skips them (sim/weather.ts).
   */
  weather?: WeatherRule;
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
  /** Milestone 12, task O: hunger gain for both (a shared picnic). */
  hunger?: number;
  actorMoodlet?: string;
  targetMoodlet?: string;
  memory?: { kind: MemoryKind; importance: 1 | 2 | 3; text: string };
  /** Shared status set on acceptance. */
  setStatus?: BondStatus;
  /** Marks the actor's or target's earlier memories of these kinds with the other person as settled (they stop affecting behaviour). */
  resolves?: MemoryKind[];
}

/** Social menu section: Friendly / Romantic / Mean / Special (sim/options.ts orders entries inside a section by relevance). */
export type SocialSection = 'friendly' | 'romantic' | 'mean' | 'special';

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
    /** Trust gates (-100..100): deep conversations, secrets and favours need it. */
    minTrust?: number;
    maxTrust?: number;
    /** Romantic commitment: neither person may be partnered with somebody else (exclusivity is explicit). */
    exclusive?: boolean;
    /** Needs privacy: no more than one other awake person within sight. */
    private?: boolean;
    /** Needs a recent memory (of either person) of one of these kinds involving the other. */
    memory?: { kinds: MemoryKind[]; withinMinutes: number };
    /**
     * Milestone 8: life stages of the actor and of the target. Absent = every stage from child up (babies and toddlers cannot
     * hold a conversation); child socials such as "Play tag" and "Tickle" list the stages they are for.
     */
    actorStages?: LifeStage[];
    targetStages?: LifeStage[];
    /** Milestone 8: the target must live in another household / in the actor's own household. */
    otherHousehold?: boolean;
    sameHousehold?: boolean;
  };
  /** Menu section; default from the category (status -> special, romantic -> romantic, mean -> mean, else friendly). */
  section?: SocialSection;
  /** Cost to the actor's household (cents) charged on use, e.g. a gift. */
  cost?: Cents;
  /** Always accepted (a decision one person can make alone, e.g. breaking up). */
  unilateral?: boolean;
  /** On acceptance, plan this home event with the two of them (an invitation to a date). */
  startsEvent?: HomeEventType;
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
  /**
   * Milestone 12, task O: weather/season/place the social needs (snowball fights need snow, a picnic needs a fine
   * spring or summer day). The menu greys an unavailable social with the reason; autonomy skips it.
   */
  weather?: WeatherRule;
  autonomy: { enabled: boolean; weight: number };
  /** Counts as one of the activities in content totals only when true (see brief Section 2). */
  alsoActivity: boolean;
  /** Milestone 8: extra effect on acceptance, implemented in sim/family.ts (teach:talking, teach:motor, teach:potty, homework, moveIn). */
  effect?: string;
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
    /** Milestone 12: how much this trait likes or dislikes each weather kind (a mood multiplier, 1 = neutral). */
    weatherBias?: Partial<Record<WeatherKind, number>>;
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
  promotion: {
    performance: number;
    skills: Record<string, number>;
    /** Optional days worked in the career (lifetime, counting every shift, including partial ones). */
    days?: number;
    /** Optional social requirement: at least one relationship of this friendship level, outside the household. */
    relationship?: { minFriendship: number; label: string };
  };
  /** Short, player-facing advantages of this level (shown in the career panel). */
  perks?: string[];
}

/** A small on-the-job decision offered at the start of a shift (content/careerEvents.ts). */
export interface CareerEventDef {
  id: string;
  title: string;
  text: string;
  options: Array<{
    id: string;
    label: string;
    description: string;
    performance: number;
    /** Signed cents added to the household in the same transaction-safe way as a shift bonus. */
    pay?: Cents;
    moodlet?: string;
    skill?: { id: string; xp: number };
    /** Result sentence shown in the feed. */
    result: string;
  }>;
}

export interface CareerDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  skills: string[];
  levels: CareerLevelDef[];
  /** Milestone 8 gap: a part-time job for teenagers (three levels, evenings and weekends around school). */
  partTime?: boolean;
  status: ContentStatus;
}

/** Milestone 8: a school (content/school.ts). `days` use 0 = Monday ... 6 = Sunday, times are minutes after midnight. */
export interface SchoolDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Life stages that attend. */
  stages: LifeStage[];
  days: number[];
  start: number;
  end: number;
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
  /** Skill that gates the recipe and sets its quality (absent = cooking). Milestone 11: baking recipes. */
  skill?: string;
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

/** Who a garment is styled for by default: only random and premade outfits use it; the creator allows any garment for anyone. */
export type GarmentAffinity = 'masc' | 'fem' | 'neutral';

export interface GarmentDef {
  id: string;
  name: string;
  description: string;
  layer: GarmentLayer;
  categories: OutfitCategory[];
  tags: string[];
  /** Default presentation affinity (absent = 'neutral'). Never restricts what a person may wear. */
  affinity?: GarmentAffinity;
  /** Allowed pattern ids ('solid' always allowed). */
  patterns: string[];
  /** Pattern a freshly chosen garment starts with (absent = 'solid'); must be one of `patterns`. */
  defaultPattern?: string;
  defaultColor: Hex;
  /** Procedural garment parameters (src/characters/clothing.ts). */
  build: Record<string, number | string | boolean>;
  status: ContentStatus;
}

export interface AccessoryDef {
  id: string;
  name: string;
  description: string;
  kind: 'glasses' | 'hat' | 'earrings' | 'necklace' | 'bag' | 'watch' | 'bracelet' | 'scarf' | 'other';
  /** Default presentation affinity for random and premade people (absent = 'neutral'). */
  affinity?: GarmentAffinity;
  /** Outfit categories random and premade outfits may use this in (absent = all); the creator offers it everywhere. */
  categories?: OutfitCategory[];
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
  /** Small on-the-job decisions, content/careerEvents.ts. Optional so older content fixtures stay valid. */
  careerEvents?: Record<string, CareerEventDef>;
  /** Milestone 8: schools of children and teens, content/school.ts. Optional so older content fixtures stay valid. */
  schools?: Record<string, SchoolDef>;
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
  /** Social event types (dates, parties, visits), content/events.ts. Optional so older content fixtures stay valid. */
  events?: Record<string, EventDef>;
  /** Milestone 9: fences and gates, roof styles and finishes, terrain paints and garden crops (content/exterior.ts). Optional so older fixtures stay valid. */
  exterior?: ExteriorContent;
  /** Likes/dislikes the creator offers, grouped: 'activity' | 'music' | 'decor' | 'food' | 'topic'. */
  preferences: Array<{ id: string; group: string; name: string }>;
}

// ---------------------------------------------------------------------------------------------
// Social events (Milestone 5)
// ---------------------------------------------------------------------------------------------

export interface EventGoalDef {
  kind: EventGoalKind;
  text: string;
  /** The target is at least this, and at least `perGuest` x the number of guests (rounded). */
  target: number;
  perGuest?: number;
  weight: number;
}

export interface EventRewardDef {
  /** Friendship / trust / romance given to the host and each guest who attended, both ways, at rating 'good' (scaled by rating). */
  friendship: number;
  trust: number;
  romance: number;
  social: number;
  fun: number;
  moodlet: string;
  badMoodlet: string;
  memory: { kind: MemoryKind; badKind?: MemoryKind; text: string; badText: string; importance: 1 | 2 | 3 };
}

export interface EventDef {
  id: HomeEventType;
  name: string;
  description: string;
  icon: string;
  /** The player can plan it from the phone (visits and drop-ins just happen). */
  planned: boolean;
  minGuests: number;
  maxGuests: number;
  /** Event length in game minutes, and the least notice when planning. */
  minutes: number;
  leadMinutes: number;
  /** Food put out at the start, per person (cents); 0 = none. */
  cateringPerPerson: Cents;
  /** Adults who are attracted to each other only. */
  romantic: boolean;
  /** A wedding: the first guest is the host's fiance(e), who they marry at the ceremony `ceremonyMinutes` after the start. */
  wedding?: boolean;
  ceremonyMinutes?: number;
  goals: EventGoalDef[];
  reward: EventRewardDef;
  status: ContentStatus;
}
