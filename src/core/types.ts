// Authoritative, serializable game state for Hearthside Life.
//
// Rules (see docs/ARCHITECTURE.md):
// - Everything reachable from WorldState must survive JSON.stringify/parse unchanged: no class instances,
//   Three.js objects, DOM nodes, functions, Maps/Sets or promises.
// - Money is stored in integer cents (Cents).
// - Time is stored in game minutes since the start of the world (GameMinutes, a float on the tick grid).
// - Coordinates: 1 world unit = 1 metre = 1 building tile. Lot origin (0,0) is the north-west corner;
//   +x is east, +z is south, +y is up. Tile (x, z) covers [x, x+1] x [z, z+1].
// - Stable ids are strings created by core/ids.ts (`<prefix>_<base36 counter>`), never reused.

export type Id = string;
export type Cents = number;
export type GameMinutes = number;
export type Hex = string; // '#rrggbb'

export const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------------------------

export interface WorldState {
  schemaVersion: number;
  /** World seed chosen at creation; never changes. */
  seed: number;
  /** Seeded generator state (core/rng.ts). Advanced only by the simulation, never by rendering. */
  rng: RngState;
  /** Monotonic counter for core/ids.ts. */
  nextId: number;
  clock: ClockState;
  settings: SimSettings;
  /** 'guided' | 'create' | 'sandbox' - how this world was started. */
  startMode: StartMode;
  activeHouseholdId: Id;
  activeLotId: Id;
  households: Record<Id, Household>;
  people: Record<Id, Person>;
  lots: Record<Id, Lot>;
  /** Directed opinions: key = relKey(from, to). */
  relationships: Record<string, Relationship>;
  /** Shared, symmetric statuses (friends, partners, family ties): key = pairKey(a, b). */
  bonds: Record<string, Bond>;
  /** Schedule occurrences already applied (shifts, pay, visits, bills, aspiration rewards). */
  processed: Record<string, GameMinutes>;
  /** Pending scheduled world events (visits, returns from work). Processed in time order. */
  schedule: ScheduledEvent[];
  /** Concise event feed shown in the HUD; bounded (core/state.ts FEED_LIMIT). */
  feed: FeedEntry[];
  /** Short-lived transient world items such as served meals. */
  items: Record<Id, WorldItem>;
}

export type StartMode = 'guided' | 'create' | 'sandbox';

export type RngState = [number, number, number, number];

export interface ClockState {
  /** Game minutes since world start. Day 0 starts at 00:00 Monday; worlds start at 08:00 on day 0. */
  minutes: GameMinutes;
  /** Number of fixed simulation ticks processed. */
  ticks: number;
}

export interface SimSettings {
  autonomy: boolean;
  /** 0 = only urgent needs, 1 = normal, 2 = very independent. */
  autonomyLevel: 0 | 1 | 2;
  /** Free building in sandbox. */
  unlimitedFunds: boolean;
  aging: 'off' | 'long' | 'normal';
  /** Allow neighbours to drop by on their own. */
  visitors: boolean;
  /** Live speed when last saved (0 = paused). Absent in older saves, which load paused. */
  speed?: 0 | 1 | 2 | 3;
}

// ---------------------------------------------------------------------------------------------
// Households, money
// ---------------------------------------------------------------------------------------------

export interface Household {
  id: Id;
  name: string;
  memberIds: Id[];
  homeLotId: Id | null;
  funds: Cents;
  /** Most recent ledger entries, newest last; bounded (core/state.ts LEDGER_LIMIT). */
  ledger: LedgerEntry[];
  /** Objects bought but not placed (inventory). */
  inventory: InventoryEntry[];
  isPlayable: boolean;
}

export type LedgerKind =
  | 'wage' | 'purchase' | 'refund' | 'sale' | 'groceries' | 'bill' | 'reward' | 'build' | 'gift' | 'start';

export interface LedgerEntry {
  id: Id;
  at: GameMinutes;
  kind: LedgerKind;
  amount: Cents; // signed: + income, - expense
  label: string;
  /** Occurrence id when the entry comes from a scheduled occurrence (prevents double application). */
  occurrence?: string;
}

export interface InventoryEntry {
  /** Keeps the object's identity, finishes and purchase price while stored. */
  object: PlacedObject;
  storedAt: GameMinutes;
}

// ---------------------------------------------------------------------------------------------
// Lots and construction
// ---------------------------------------------------------------------------------------------

export type LotKind = 'residential' | 'venue';
export type Rot = 0 | 1 | 2 | 3;
export type EdgeDir = 'h' | 'v';

export interface Lot {
  id: Id;
  name: string;
  address: string;
  kind: LotKind;
  venueType?: string;
  /** Size in tiles. M1 supports 24, 32, 48. */
  width: number;
  depth: number;
  /** Lot value of the empty land (used by purchase and later rent rules). */
  landValue: Cents;
  ownerHouseholdId: Id | null;
  /** Front door / lot entry tile used for arrivals and departures (on the lot, walkable). */
  entry: TilePos;
  /** Number of floors in use (M1: 1). */
  levels: number;
  /** Walls keyed by edgeKey(level, dir, x, z). */
  walls: Record<string, Wall>;
  /** Floor finish per tile keyed by tileKey(level, x, z). Missing = bare ground (grass outdoors). */
  floors: Record<string, FinishRef>;
  /** Doors and windows. */
  openings: Record<Id, Opening>;
  objects: Record<Id, PlacedObject>;
  /** Exterior ground style for unfloored tiles. */
  ground: 'grass' | 'dirt' | 'paving';
}

export interface TilePos { x: number; z: number; level: number }

/** A wall on one grid edge. 'h' edge (x,z): segment (x,z)-(x+1,z); side 'a' faces tile (x,z-1), side 'b' faces (x,z).
 *  'v' edge (x,z): segment (x,z)-(x,z+1); side 'a' faces tile (x-1,z), side 'b' faces (x,z). */
export interface Wall {
  /** Equal to edgeKey(level, dir, x, z): the wall's identity is its edge. */
  id: string;
  level: number;
  dir: EdgeDir;
  x: number;
  z: number;
  height: number; // metres, M1 always 2.8
  sideA: FinishRef;
  sideB: FinishRef;
}

/** Reference to a wall or floor design plus the curated palette variant. */
export interface FinishRef {
  designId: string;
  paletteId: string;
}

export interface Opening {
  id: Id;
  defId: string; // OpeningDef id
  /** Edge key of the wall this opening sits in (first edge for multi-tile openings). */
  wallId: string;
  /** Doors: which side the leaf swings toward. */
  flip: boolean;
  purchasePrice: Cents;
}

export interface PlacedObject {
  id: Id;
  defId: string;
  level: number;
  /** Footprint origin tile (minimum x/z corner after rotation). */
  x: number;
  z: number;
  rot: Rot;
  /** Chosen finish swatch per finish region (region id -> swatch id). */
  finishes: Record<string, string>;
  purchasePrice: Cents;
  boughtAt: GameMinutes;
  ownerHouseholdId: Id | null;
  /** Wear and state flags for later milestones (dirty, broken). */
  condition: { dirt: number; broken: boolean };
  /** For surface items: id of the object they rest on. */
  supportId?: Id;
}

/** Transient items created by actions (e.g. a served meal). Saved, but never sold. */
export interface WorldItem {
  id: Id;
  kind: 'meal';
  lotId: Id;
  /** Where it rests: on an object surface or the floor. */
  position: { x: number; z: number; level: number; onObjectId?: Id };
  recipeId: string;
  portions: number;
  quality: number; // 0..1
  createdAt: GameMinutes;
  spoilsAt: GameMinutes;
  ownerHouseholdId: Id | null;
}

// ---------------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------------

export type LifeStage = 'baby' | 'toddler' | 'child' | 'teen' | 'youngAdult' | 'adult' | 'elder';
export type NeedId = 'hunger' | 'energy' | 'hygiene' | 'bladder' | 'fun' | 'social';
export const NEED_IDS: readonly NeedId[] = ['hunger', 'energy', 'hygiene', 'bladder', 'fun', 'social'];

export type Needs = Record<NeedId, number>; // 0..100, 100 = fully satisfied

export interface Person {
  id: Id;
  householdId: Id;
  firstName: string;
  lastName: string;
  pronouns: Pronouns;
  lifeStage: LifeStage;
  bio: string;
  voice: { preset: string; pitch: number }; // pitch -1..1
  walkStyle: string;
  /** Adult romantic interest by body frame presentation and/or all; empty = not interested in romance. */
  romance: { interestedIn: Array<'a' | 'b' | 'any'>; open: boolean };
  appearance: Appearance;
  outfits: Wardrobe;
  traits: string[]; // TraitDef ids (3 for adults)
  likes: string[]; // preference tag ids (e.g. 'music:jazz', 'activity:cooking')
  dislikes: string[];
  aspiration: AspirationState | null;
  needs: Needs;
  moodlets: Moodlet[];
  skills: Record<string, SkillState>;
  career: CareerState | null;
  /** Where the person is. */
  location: PersonLocation;
  /** Currently running action (first) and queued actions (rest). */
  queue: ActionInstance[];
  memories: Memory[];
  /** Interaction or object-tag -> game minute until which autonomy avoids repeating it. */
  cooldowns: Record<string, GameMinutes>;
  /** Visual-only hint for the renderer: current animation id and when it started. */
  anim: { id: string; since: GameMinutes; loop: boolean };
  /** Thought shown above the head (need icon, social topic), with expiry. */
  thought: { icon: string; text: string; until: GameMinutes } | null;
  createdAt: GameMinutes;
  isNpc: boolean;
}

export interface Pronouns { subject: string; object: string; possessive: string } // e.g. she/her/her

export type PersonLocation =
  | { kind: 'lot'; lotId: Id; level: number; x: number; z: number; facing: number; posture: Posture }
  | { kind: 'offlot'; place: 'work' | 'school' | 'home' | 'errand' | 'visiting'; lotId?: Id; since: GameMinutes; until: GameMinutes | null };

/** Posture decides which navigation/occupancy rules apply. Seated/lying people do not occupy their approach tile. */
export type Posture = 'standing' | 'walking' | 'seated' | 'lying';

export interface Moodlet {
  id: string; // MoodletDef id
  value: number; // signed mood contribution
  until: GameMinutes | null; // null = while a condition holds (recomputed)
  source?: string;
}

export interface SkillState { level: number; xp: number }

export interface CareerState {
  careerId: string;
  level: number; // 1..10
  performance: number; // -100..100
  joinedAt: GameMinutes;
  daysWorked: number;
  /** Current or last shift occurrence and its state. */
  shift: {
    occurrence: string; // `shift:<personId>:<day>`
    status: 'upcoming' | 'commuting' | 'atWork' | 'done' | 'missed';
    workedMinutes: number;
    lateMinutes: number;
  } | null;
}

export interface AspirationState {
  aspirationId: string;
  stage: number; // index into AspirationDef.stages
  /** objective id -> progress counter for count-based objectives. */
  progress: Record<string, number>;
  completedStages: number;
  /** Bounded rewards claimed (occurrence ids). */
  rewards: string[];
}

export interface Memory {
  id: Id;
  at: GameMinutes;
  kind: MemoryKind;
  withId?: Id;
  text: string;
  importance: 1 | 2 | 3; // 3 = major milestone, kept forever
  /** Low-importance repetitions are summarised: this counts merged occurrences. */
  count: number;
}

export type MemoryKind =
  | 'met' | 'greatChat' | 'argument' | 'helped' | 'firstDate' | 'becameFriends' | 'becamePartners' | 'promotion'
  | 'fired' | 'aspiration' | 'movedIn' | 'gift' | 'joke' | 'insult' | 'comforted' | 'other';

// ---------------------------------------------------------------------------------------------
// Appearance (character creator)
// ---------------------------------------------------------------------------------------------

/** Body frames share one skeleton. 'a' = broader frame mannequin, 'b' = curvier frame mannequin.
 *  Frames are body presentation only and never restrict hair, clothing or identity choices. */
export type BodyFrame = 'a' | 'b';

export interface Appearance {
  frame: BodyFrame;
  skin: Hex;
  /** Body shape controls, each -1..1 (0 = frame default). Ids defined by characters/content. */
  body: Record<string, number>;
  bodyPresetId: string | null;
  face: {
    presetId: string | null;
    /** Face controls, each -1..1. */
    params: Record<string, number>;
    eyeColor: Hex;
    browStyle: string;
    browColor: Hex;
    freckles: number; // 0..1
    blush: number; // 0..1
    lipTint: number; // 0..1
    lipColor: Hex;
  };
  hair: { styleId: string; color: Hex; highlight: Hex | null; facialHairId: string | null };
}

export type OutfitCategory = 'everyday' | 'formal' | 'work' | 'athletic' | 'sleep' | 'swim';
export const OUTFIT_CATEGORIES: readonly OutfitCategory[] = ['everyday', 'formal', 'work', 'athletic', 'sleep', 'swim'];

export type GarmentLayer = 'top' | 'bottom' | 'full' | 'outer' | 'shoes';

export interface GarmentChoice {
  garmentId: string;
  color: Hex;
  /** Pattern id from the garment's allowed patterns; 'solid' = none. */
  pattern: string;
  patternColor: Hex;
}

export interface Outfit {
  id: Id;
  name: string;
  /** A 'full' garment excludes 'top' and 'bottom' (resolved by characters/outfits.ts). */
  layers: Partial<Record<GarmentLayer, GarmentChoice>>;
  accessories: Array<{ accessoryId: string; color: Hex }>;
}

export interface Wardrobe {
  /** Several outfits per category. */
  outfits: Record<OutfitCategory, Outfit[]>;
  current: { category: OutfitCategory; index: number };
}

// ---------------------------------------------------------------------------------------------
// Actions (interaction lifecycle)
// ---------------------------------------------------------------------------------------------

export type ActionPhase =
  | 'queued' | 'validate' | 'reserve' | 'route' | 'prepare' | 'perform' | 'apply' | 'cleanup'
  | 'done' | 'failed' | 'cancelled';

export interface ActionInstance {
  id: Id;
  interactionId: string; // InteractionDef or SocialDef id
  actorId: Id;
  source: 'player' | 'autonomy' | 'schedule' | 'chain';
  target:
    | { kind: 'object'; objectId: Id; slotId: string | null }
    | { kind: 'person'; personId: Id }
    | { kind: 'tile'; x: number; z: number; level: number }
    | { kind: 'item'; itemId: Id }
    | { kind: 'self' };
  phase: ActionPhase;
  /** Game minute the current phase started. */
  phaseSince: GameMinutes;
  /** Remaining route as tile centres; first = next waypoint. Serializable so routes survive save/load. */
  route: Array<{ x: number; z: number }>;
  /** Perform-phase progress in game minutes and the planned duration (null = until need satisfied). */
  elapsed: number;
  duration: number | null;
  /** Number of route replans so far (bounded). */
  replans: number;
  /** Set when the action ended; shown to the player. */
  failureReason: string | null;
  /** Action-specific data, JSON only (e.g. recipe id, conversation topic, produced item id). */
  data: Record<string, string | number | boolean | null>;
  /** Set when cancellation was requested; the runner runs the phase-appropriate cleanup. */
  cancelRequested: boolean;
  queuedAt: GameMinutes;
}

// ---------------------------------------------------------------------------------------------
// Relationships and social
// ---------------------------------------------------------------------------------------------

/** How `from` feels about `to`. All values -100..100 except familiarity 0..100. */
export interface Relationship {
  from: Id;
  to: Id;
  familiarity: number;
  friendship: number;
  trust: number;
  romance: number;
  lastInteractionAt: GameMinutes | null;
  /** Social interaction id -> uses in the recent window, used to dampen spam. */
  recent: Record<string, number>;
}

export type BondStatus =
  | 'acquaintance' | 'friend' | 'closeFriend' | 'rival' | 'partner' | 'engaged' | 'spouse' | 'exPartner';
export type FamilyTie = 'parent' | 'child' | 'sibling' | 'partner' | 'spouse' | 'roommate' | 'none';

export interface Bond {
  a: Id; // a < b lexicographically
  b: Id;
  status: BondStatus;
  /** Family tie from a's point of view (b is a's <tie>). */
  familyAtoB: FamilyTie;
  since: GameMinutes;
}

// ---------------------------------------------------------------------------------------------
// Scheduling and feed
// ---------------------------------------------------------------------------------------------

export interface ScheduledEvent {
  /** Unique occurrence id, e.g. `visit:<personId>:<day>`; also used in WorldState.processed. */
  occurrence: string;
  at: GameMinutes;
  kind: 'visitArrive' | 'visitLeave' | 'returnFromWork' | 'leaveForWork' | 'bill' | 'custom';
  personId?: Id;
  householdId?: Id;
  data?: Record<string, string | number | boolean | null>;
}

export interface FeedEntry {
  id: Id;
  at: GameMinutes;
  kind: 'info' | 'social' | 'money' | 'career' | 'need' | 'warning' | 'aspiration' | 'build';
  text: string;
  personId?: Id;
}
