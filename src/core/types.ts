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
  /**
   * Social events at home (dates, parties, visits), planned, running and recently finished; bounded
   * (sim/events.ts EVENT_HISTORY). Optional in saves: absent = none (persistence/schema.ts fillSocialDefaults).
   */
  homeEvents?: HomeEvent[];
  /** Weekly household bills, oldest first; bounded by sim/economy.ts BILL_LIMIT. Optional in older saves. */
  bills?: Bill[];
  /**
   * Marker of the generated neighbourhood (Milestone 7, game/neighbourhood.ts): written once when the lot records
   * and the named NPC households were created, never regenerated. Absent in older saves, which get one on load.
   */
  neighbourhood?: NeighbourhoodState;
}

/** What the neighbourhood generator recorded about itself (so it is generated exactly once). */
export interface NeighbourhoodState {
  version: 1;
  /** Street name the lots are on. */
  street: string;
  /** Households the generator created (the original next-door neighbours are not listed). */
  npcHouseholdIds: Id[];
  /** The next-door household of the new world (their number is on every phone from the start). */
  nextDoorHouseholdId?: Id;
  /** Number of household moves so far (keeps move occurrence ids unique). */
  moves?: number;
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
  /** Milestone 8: 'custom' uses `agingDays`. */
  aging: 'off' | 'long' | 'normal' | 'custom';
  /** Milestone 8: days spent in each life stage when aging is 'custom' (elder = days before the optional end of life). */
  agingDays?: Partial<Record<LifeStage, number>>;
  /** Milestone 8: elders may pass away peacefully at the end of their stage. Absent = off. */
  elderEndOfLife?: boolean;
  /** Allow neighbours to drop by on their own. */
  visitors: boolean;
  /** Live speed when last saved (0 = paused). Absent in older saves, which load paused. */
  speed?: 0 | 1 | 2 | 3;
  /** Pay each new bill as soon as it is issued (Milestone 6). Absent = off. */
  autoPayBills?: boolean;
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
  /** Utilities are cut off because a bill stayed unpaid past its grace period (Milestone 6). */
  powerOff?: boolean;
}

export type LedgerKind =
  | 'wage' | 'purchase' | 'refund' | 'sale' | 'groceries' | 'bill' | 'reward' | 'build' | 'gift' | 'start' | 'repair'
  | 'career'
  // Milestone 8: adoption fees, the emergency sitter and shares of money moved between households
  | 'family';

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
  /**
   * Milestone 7: false/absent on lots whose layout has not been built yet. Lots are built lazily, once, the first time
   * somebody travels there (world/lotBuilders.ts), and then persisted like any other lot. Absent = built (older saves).
   */
  built?: boolean;
  /** House or venue layout variant passed to the lot builder. */
  variant?: number;
  /** Short description for the neighbourhood map. */
  blurb?: string;
  /** Position on the neighbourhood map, 0..100 in both directions (x east, y south). */
  map?: { x: number; y: number };
  /** Weekly rent when this is a rental home. A rental has no owner; its tenant is the household whose homeLotId it is. */
  rent?: Cents;
  /** Asking price when the lot is for sale (vacant homes only). */
  price?: Cents;
  /** Milestone 9: fences and gates keyed by edgeKey(level, dir, x, z) (src/world/fences.ts). Absent = none. */
  fences?: Record<string, Fence>;
  /** Milestone 9: roofs (src/world/roofs.ts). Absent = none. */
  roofs?: Record<Id, Roof>;
  /** Milestone 9: ground paint per level-0 tile keyed by tileKey(0, x, z); missing = `ground`. */
  terrain?: Record<string, string>;
}

/** Milestone 9: a fence or gate on one grid edge (same edge convention as Wall). `defId` is a FenceDef id. */
export interface Fence {
  id: string;
  level: number;
  dir: EdgeDir;
  x: number;
  z: number;
  defId: string;
  /** Colour/finish variant index of the FenceDef. */
  variant?: number;
  purchasePrice?: Cents;
  /** Game minute it was built; with purchasePrice it decides the refund when removed (building/exteriorPlans.ts). */
  boughtAt?: GameMinutes;
}

/** Milestone 9: a roof over a tile rectangle [x0,x1) x [z0,z1), resting on top of `level` (its walls' top). */
export interface Roof {
  id: Id;
  level: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** RoofStyleDef id (gable, hip, flat, ...). */
  styleId: string;
  /** Ridge direction for directional styles. */
  ridge: EdgeDir;
  /** Pitch in degrees (flat styles ignore it). */
  pitch: number;
  /** Roof material/colour finish. */
  finish: FinishRef;
  purchasePrice?: Cents;
  boughtAt?: GameMinutes;
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
  height: number; // metres; building presets 1.2 / 2.8 / 3.6 (building/buildPlans.ts WALL_HEIGHT_PRESETS)
  sideA: FinishRef;
  sideB: FinishRef;
  /** Cents actually paid when the player built it (0 in the sandbox). Absent on walls that came with the lot. */
  purchasePrice?: Cents;
  /** Game minute it was built; with purchasePrice it decides the refund when demolished (building/buildPlans.ts). */
  boughtAt?: GameMinutes;
}

/** Reference to a wall or floor design plus the curated palette variant. */
export interface FinishRef {
  designId: string;
  paletteId: string;
}

export interface Opening {
  id: Id;
  defId: string; // OpeningDef id
  /** Edge key of the wall this opening sits in (first edge, the one with the smallest x/z, for multi-tile openings). */
  wallId: string;
  /** Doors: which side the leaf swings toward. */
  flip: boolean;
  purchasePrice: Cents;
  /** Number of consecutive wall edges it spans along +x ('h') or +z ('v') from `wallId`; absent = 1. */
  span?: number;
  /** Game minute it was bought; absent on openings that came with the lot (sold as old). */
  boughtAt?: GameMinutes;
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
  /**
   * Cleanliness and repair state. `dirt` 0 (spotless) .. 1 (filthy); `broken` objects cannot be used until repaired.
   * The other fields are optional so older saves load unchanged (absent = 0): `wear` 0..1 builds with use and raises
   * the break chance, `brokenAt` is the game minute it broke, `fails` counts failed repair attempts since.
   */
  condition: { dirt: number; broken: boolean; wear?: number; brokenAt?: GameMinutes; fails?: number };
  /** For surface items: id of the object they rest on. */
  supportId?: Id;
  /** Milestone 9: growth state of a crop bed (vegetable patch, orchard tree, herb planter), sim/garden.ts. Absent = nothing planted yet. */
  garden?: GardenState;
}

/** Milestone 9: what grows in a garden bed. `growth` counts effective growing days up to `need`; see sim/garden.ts. */
export interface GardenState {
  /** CropDef id (content/exterior.ts) or null when the bed is empty. */
  crop: string | null;
  growth: number;
  need: number;
  /** 0 (dry) .. 1 (soaked) and 0 (clean) .. 1 (choked with weeds). */
  water: number;
  weeds: number;
  /** Game day the state was last stepped to. */
  day: number;
  /** Completed harvests (rotates the next crop; part of the once-only occurrence id). */
  harvests: number;
}

/** What a WorldItem is: a served meal, dirty dishes left after eating, or a floor mess (puddle, crumbs, spill). */
export type WorldItemKind = 'meal' | 'dishes' | 'mess';

/**
 * Transient items created by actions (e.g. a served meal). Saved, but never sold.
 * `dishes`: `portions` = number of dirty plates, `recipeId` = the dish they held, `quality` unused (1).
 * `mess`: `recipeId` = the variant ('puddle' | 'crumbs' | 'spill'), `quality` = severity 0..1, `portions` = 1.
 * Only meals spoil; dishes and messes stay until somebody cleans them.
 */
export interface WorldItem {
  id: Id;
  kind: WorldItemKind;
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
  /** Milestone 8: whole game days lived in the current life stage (advanced at the daily rollover when aging is on). */
  stageDays?: number;
  /** Milestone 8: ids of the person's parents (the family graph; siblings and grandparents are derived). */
  parentIds?: Id[];
  /** Milestone 8: school state for children and teens. */
  school?: SchoolState | null;
  /** Milestone 8: game minute since which a baby's or toddler's need has been empty (the emergency sitter comes after 3 hours). */
  careSince?: Partial<Record<NeedId, GameMinutes>>;
}

/** Milestone 8: school attendance and performance (children and teens). */
export interface SchoolState {
  /** SchoolDef id ('elementary' for children, 'high' for teens). */
  schoolId: string;
  /** -100..100; drives the grade letter and report cards. */
  performance: number;
  /** Game day of the last homework finished (homework is due each school day). */
  homeworkDay: number;
  /** Days attended / missed in the current term. */
  attended: number;
  missed: number;
  /** Letter grade of the latest weekly report card, and the week (game day / 7) it was issued. */
  lastGrade?: string;
  reportWeek?: number;
}

export interface Pronouns { subject: string; object: string; possessive: string } // e.g. she/her/her

export type PersonLocation =
  | {
    kind: 'lot'; lotId: Id; level: number; x: number; z: number; facing: number; posture: Posture;
    /** Milestone 9: metres above the floor of `level` while walking a staircase (`level` is then the lower one). Absent = 0. */
    rise?: number;
  }
  | {
    kind: 'offlot'; place: 'work' | 'school' | 'home' | 'errand' | 'visiting';
    /** home: the home lot; visiting: the lot visited (a venue or another home); work: the lot they left from; transit: the destination. */
    lotId?: Id;
    since: GameMinutes;
    until: GameMinutes | null;
    /** Milestone 7: travelling to `lotId`, arriving at `until`. */
    transit?: boolean;
  };

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
  /** How hard the person works (chosen while employed). Absent = 'normal'. */
  effort?: WorkEffort;
  /** A small on-the-job decision waiting during the current shift (Milestone 6, content/careerEvents.ts). */
  pendingEvent?: CareerEventState | null;
}

export type WorkEffort = 'slack' | 'normal' | 'hard';

export interface CareerEventState {
  eventId: string;
  /** Day the shift started on (`shift:<personId>:<day>`). */
  day: number;
  /** Option id once the player (or the shift end) picked one. */
  chosen?: string;
}

// ---------------------------------------------------------------------------------------------
// Bills (Milestone 6)
// ---------------------------------------------------------------------------------------------

export type BillStatus = 'due' | 'overdue' | 'paid' | 'cutoff';

/**
 * A weekly household bill. `amount` includes any late fee. Money moves only through transact (occurrence
 * `billpay:<id>`); late fees and cut-offs use their own occurrence markers so save/load cannot repeat them.
 */
export interface Bill {
  id: Id;
  householdId: Id;
  /** Week index since world start (0 = first week). */
  week: number;
  /** Amount owed now (base plus any late fee). */
  amount: Cents;
  /** Original utilities plus property tax before late fees. */
  base: Cents;
  lateFee: Cents;
  issuedAt: GameMinutes;
  dueAt: GameMinutes;
  graceEndsAt: GameMinutes;
  status: BillStatus;
  paidAt?: GameMinutes;
  cutOffAt?: GameMinutes;
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
  /** Set when the matter was settled (an apology, a make-up): the memory stays but no longer changes behaviour. */
  resolved?: boolean;
}

export type MemoryKind =
  | 'met' | 'greatChat' | 'argument' | 'helped' | 'firstDate' | 'becameFriends' | 'becamePartners' | 'promotion'
  | 'fired' | 'aspiration' | 'movedIn' | 'gift' | 'joke' | 'insult' | 'comforted' | 'other'
  // Milestone 5: romance, trust, conflict and events
  | 'kiss' | 'rejected' | 'engaged' | 'married' | 'breakup' | 'betrayal' | 'secretShared' | 'reconciled'
  | 'greatDate' | 'badDate' | 'party' | 'visit' | 'advice' | 'jealousy'
  // Milestone 8: life stages and family
  | 'birthday' | 'adopted' | 'movedOut' | 'passedAway' | 'report';

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
  route: Array<{ x: number; z: number; /** Milestone 9: level on arrival (absent = unchanged) */ level?: number; /** metres above that level's floor */ rise?: number }>;
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
  /**
   * How `from` sees `to` (derived from the values and the bond with hysteresis, sim/relationships.ts
   * relationshipLabel). Absent in older saves; recomputed on the next change.
   */
  label?: RelLabel;
  /** `to` made clear they are not interested in romance with `from`: romantic options stay off (consent respected). */
  romanceBlocked?: boolean;
}

/** How a person sees another, derived from friendship, trust, romance and the shared bond. */
export type RelLabel =
  | 'stranger' | 'acquaintance' | 'friend' | 'closeFriend' | 'bestFriend' | 'rival' | 'enemy' | 'crush'
  | 'partner' | 'engaged' | 'spouse' | 'exPartner';

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
  kind: 'visitArrive' | 'visitLeave' | 'returnFromWork' | 'leaveForWork' | 'bill' | 'custom' | 'eventStart' | 'eventEnd' | 'careerEvent' | 'travelArrive';
  personId?: Id;
  householdId?: Id;
  data?: Record<string, string | number | boolean | null>;
}

export interface FeedEntry {
  id: Id;
  at: GameMinutes;
  kind: 'info' | 'social' | 'money' | 'career' | 'need' | 'warning' | 'aspiration' | 'build' | 'family';
  text: string;
  personId?: Id;
}

// ---------------------------------------------------------------------------------------------
// Social events at home (Milestone 5; sim/events.ts)
// ---------------------------------------------------------------------------------------------

export type HomeEventType =
  | 'date' | 'dinnerParty' | 'houseParty' | 'celebration' | 'visit' | 'welcomeWagon' | 'dropIn' | 'reconciliation';
export type HomeEventStatus = 'invited' | 'running' | 'done' | 'cancelled';
export type EventGoalKind = 'chat' | 'eat' | 'romantic' | 'laugh' | 'mingle' | 'reconcile';
export type EventRating = 'poor' | 'fair' | 'good' | 'great';

export interface EventGoal {
  kind: EventGoalKind;
  /** Display text, e.g. "Chat with each other". */
  text: string;
  target: number;
  progress: number;
  done: boolean;
  /** Weight in the final score. */
  weight: number;
}

/** A planned, running or finished social event. Rewards are applied once (status 'done' + processed `eventdone:<id>`). */
export interface HomeEvent {
  id: Id;
  type: HomeEventType;
  title: string;
  status: HomeEventStatus;
  /** The host (a member of the hosting household). */
  hostId: Id;
  householdId: Id;
  lotId: Id;
  /** Invited guests (people of other households, or the date's partner). */
  guestIds: Id[];
  /** Guests who actually showed up. */
  arrivedIds: Id[];
  createdAt: GameMinutes;
  startAt: GameMinutes;
  endAt: GameMinutes;
  goals: EventGoal[];
  /** Person pairs (pairKey) who talked, for the 'mingle' goal. */
  pairs: string[];
  /** People who ate at the event (ids). */
  ate: Id[];
  /** Final score 0..100 and rating, set when the event ends. */
  score?: number;
  rating?: EventRating;
  /** Catering charged (cents), 0 when none was served. */
  catered?: Cents;
}
