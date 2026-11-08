// Simulation tuning values. Everything that balances the simulation lives here so it can be reviewed
// and adjusted in one place. Rates are per game hour unless noted.

import type { NeedId } from '../core/types';

/** Base need decay per game hour for an awake adult on the lot (brief section 8). */
export const NEED_DECAY_PER_HOUR: Readonly<Record<NeedId, number>> = {
  hunger: 6.5,
  energy: 5,
  hygiene: 4,
  bladder: 11,
  fun: 5,
  social: 3.5,
};

/** Decay multiplier while away at work, errands or school (lighter, event-based off-lot simulation). */
export const OFFLOT_DECAY_MULT = 0.5;
/** People at their own off-lot home drift toward this value (they look after themselves there). */
export const OFFLOT_HOME_NEED_TARGET = 80;
export const OFFLOT_HOME_DRIFT_PER_HOUR = 10;

/** need.low is emitted (and a thought shown) when a need drops below this value. */
export const NEED_LOW = 25;
/** A feed warning is added for playable people when a need drops below this value. */
export const NEED_CRITICAL = 10;

/** Walking speed in tiles per game minute (diagonal steps cover sqrt 2). */
export const WALK_TILES_PER_MINUTE = 1.6;
/** Route replans allowed when the way becomes blocked before the action fails. */
export const MAX_REPLANS = 2;
/** Minutes spent sitting down / lying down and standing up / getting up. */
export const POSTURE_CHANGE_MINUTES = 1;
/** Maximum actions in a person's queue (running + queued). */
export const QUEUE_MAX = 8;

/** Autonomy: a person decides at most this often (game minutes). */
export const AUTONOMY_INTERVAL = 5;
/** Autonomy: candidates closer than this fraction of the best score are considered for a weighted pick. */
export const AUTONOMY_PICK_BAND = 0.85;
/** Autonomy: an interrupt needs a candidate this many times better than the running autonomous action. */
export const AUTONOMY_INTERRUPT_FACTOR = 1.6;
/** Autonomy: a need below this value may interrupt a low-priority autonomous action. */
export const AUTONOMY_INTERRUPT_NEED = 15;
/** Autonomy: minimum score for an autonomous choice at each autonomy level. */
export const AUTONOMY_MIN_SCORE: Readonly<Record<0 | 1 | 2, number>> = { 0: 1.2, 1: 0.25, 2: 0.15 };
/** Autonomy: default repetition cooldown after an autonomous action completes (minutes). */
export const AUTONOMY_REPEAT_COOLDOWN = 45;

/** Sleep rhythm: night hours in which going to bed is favoured, the daytime energy below which people
 *  still go to bed, and the morning wake window (minute of day, plus up to SLEEP_WAKE_SPREAD per person). */
export const SLEEP_NIGHT_START = 21;
export const SLEEP_NIGHT_END = 6;
export const SLEEP_DAY_ENERGY = 35;
export const SLEEP_WAKE_MINUTE = 6 * 60;
export const SLEEP_WAKE_SPREAD = 45;
/** Sleep that starts at or after this hour (or before SLEEP_NIGHT_END) lasts until the morning wake time. */
export const SLEEP_NIGHT_BEDTIME = 19;
/** Wake up this many minutes before a shift starts. */
export const SLEEP_WAKE_BEFORE_SHIFT = 90;

/** Social: acceptance is clamped to this band so nothing is ever certain. */
export const SOCIAL_ACCEPT_MIN = 0.03;
export const SOCIAL_ACCEPT_MAX = 0.97;
/** Social: acceptance penalty per recent use of the same social on the same person. */
export const SOCIAL_SPAM_PENALTY = 0.15;
/** Library quiet rule: acceptance penalty for loud social categories said in a library. */
export const LIBRARY_LOUD_PENALTY = 0.25;
export const LIBRARY_LOUD_CATEGORIES: readonly string[] = ['funny', 'mean'];
/** Social: one recent use is forgotten per this many game minutes. */
export const SOCIAL_RECENT_DECAY_MINUTES = 60;
/** Social autonomy approaches someone busy with an activity only when the actor's social is below this. */
export const SOCIAL_INTERRUPT_BELOW = 30;
/** A person this lonely may invite a known neighbour over on their own (daytime). */
export const LONELY_INVITE_BELOW = 25;
/** Fun and social decay at this fraction while lying down (people do not get bored or lonely asleep). */
export const LYING_FUN_SOCIAL_DECAY = 0.25;
/** Social: how long the actor waits next to a busy target before giving up (minutes). */
export const SOCIAL_WAIT_MINUTES = 6;

/** Phone chats raise friendship with diminishing returns and never beyond this value. */
export const PHONE_FRIENDSHIP_CAP = 50;

/** Careers: goToWork is queued automatically this many minutes before the shift starts. */
export const COMMUTE_LEAD_MINUTES = 45;
/** Careers: the shift becomes "upcoming" (and goToWork available) this many minutes before the start. */
export const SHIFT_WINDOW_MINUTES = 60;
/** Careers: performance changes. */
export const MISSED_SHIFT_PERFORMANCE = -15;
export const DEMOTION_PERFORMANCE = -60;

/** Meals spoil this many minutes after being served. */
export const MEAL_SPOIL_MINUTES = 1440;

/** Visitors: first neighbour visit on day 0 at this minute of the day. */
export const FIRST_VISIT_MINUTE = 17 * 60;
/** Visitors: an invited neighbour arrives after this many minutes. */
export const INVITE_DELAY_MINUTES = 60;
/** Visitors: stay length range in minutes. */
export const VISIT_MIN_MINUTES = 120;
export const VISIT_MAX_MINUTES = 180;
/** Visitors: chance of a random drop-in on an eligible day, and the arrival window (minute of day). */
export const DROP_IN_CHANCE = 0.5;
export const DROP_IN_EARLIEST = 10 * 60;
export const DROP_IN_LATEST = 18 * 60;

/** Seat search radii in metres. */
export const TV_SEAT_RADIUS = 5;
export const READ_SEAT_RADIUS = 8;
export const MEAL_SEAT_RADIUS = 12;

// ---------------------------------------------------------------------------------------------
// Housekeeping: dirt, wear and breakage, dishes, messes, repairs (sim/housekeeping.ts, sim/housework.ts)
// ---------------------------------------------------------------------------------------------

/** Dirt (0..1) an object gains each time it is used, by the first matching tag. */
export const DIRT_PER_USE: ReadonlyArray<readonly [tag: string, dirt: number]> = [
  ['toilet', 0.04], ['shower', 0.05], ['bath', 0.05], ['stove', 0.07], ['sink', 0.02], ['bed', 0.02], ['fridge', 0.015],
  ['counter', 0.03], ['table', 0.04],
];
/** Dirt above which an object looks dirty (render, menu hint) and counts as dirty for moods. */
export const DIRT_VISIBLE = 0.35;
export const DIRT_FILTHY = 0.6;
/** A person in a state of low hygiene leaves this much extra dirt behind (x(1 + (1 - hygiene / 100) * this)). */
export const DIRT_UNWASHED_EXTRA = 0.5;
/** Hygiene lost on top of the interaction's own effect when finishing on a dirty toilet (x dirt). */
export const DIRTY_TOILET_HYGIENE = 6;
/** Hygiene gain of showers, baths and sinks is cut by this fraction at full dirt. */
export const DIRTY_WASH_PENALTY = 0.35;
/** Meal quality lost at full stove dirt. */
export const DIRTY_STOVE_QUALITY = 0.25;
/** Extra mishap chance at full stove dirt. */
export const DIRTY_STOVE_MISHAP = 0.2;

/** Break chance per use of a breakable object (before quality, wear and age), and the wear gained per use. */
export const BREAK_CHANCE = 0.006;
export const WEAR_PER_USE = 0.01;
/** Quality 1..5 multiplier on break chance and wear (cheap objects break more). */
export const QUALITY_BREAK_MULT: Readonly<Record<number, number>> = { 1: 2, 2: 1.5, 3: 1, 4: 0.6, 5: 0.35 };
/** Break chance is x(1 + wear x this) and x(1 + age fraction x this) with age saturating at AGE_FULL_DAYS. */
export const WEAR_BREAK_FACTOR = 2.5;
export const AGE_BREAK_FACTOR = 0.5;
export const AGE_FULL_DAYS = 30;
/** Servicing removes this much wear; objects with wear above SERVICE_WEAR are worth servicing. */
export const SERVICE_WEAR_REMOVED = 0.5;
export const SERVICE_MIN_WEAR = 0.12;
export const SERVICE_AUTONOMY_WEAR = 0.35;
/** Each earlier failed repair adds this to the success chance, so repairs always succeed within a few attempts. */
export const REPAIR_PITY = 0.12;
export const REPAIR_MIN_CHANCE = 0.15;
export const REPAIR_MAX_CHANCE = 0.98;
/** Electrical shock: energy lost and hygiene lost by a splash from a failed plumbing repair. */
export const SHOCK_ENERGY = 12;
export const SPLASH_HYGIENE = 8;

/** The repairperson's fee ($85) and the minutes (min, max) until they have fixed the object. */
export const REPAIRPERSON_FEE = 8500;
export const REPAIRPERSON_DELAY_MIN = 90;
export const REPAIRPERSON_DELAY_MAX = 150;
/** Autonomy only phones a repairperson when the household has at least this much money left afterwards. */
export const REPAIRPERSON_BUFFER = 15000;

/** Cleaning minutes: base + per unit of dirt (30 at full dirt) before the Handiness multiplier. */
export const CLEAN_BASE_MINUTES = 6;
export const CLEAN_DIRT_MINUTES = 24;
/** Minutes to wash one plate by hand (a dishwasher halves it) and to mop a mess. */
export const WASH_MINUTES_PER_PLATE = 2;
export const WASH_BASE_MINUTES = 2;
export const DISHWASHER_MULT = 0.5;
export const MOP_MINUTES = 6;
/** Tidy-up: radius (tiles), dirt removed, minutes. */
export const TIDY_RADIUS = 5;
export const TIDY_DIRT_REMOVED = 0.2;

/** Cleaning chores in autonomy: dirt level where each starts to matter, and the drive at that level. */
export const CHORE_DIRT_START = 0.3;
export const CHORE_DRIVE = 1.1;
/** Dirty dishes: autonomy pressure per plate and per game hour they have waited. */
export const DISH_PRESSURE_PER_PLATE = 0.12;
export const DISH_PRESSURE_PER_HOUR = 0.08;
/** Chores wait when any of hunger, energy, bladder or hygiene is below this. */
export const CHORE_NEEDS_FLOOR = 35;
/** ... and when fun is below this (people with nothing left to enjoy do not scrub the oven). */
export const CHORE_FUN_FLOOR = 28;
/** Hours (hour of day) when chores are unattractive (everyone is winding down or asleep). */
export const CHORE_QUIET_FROM = 21;
export const CHORE_QUIET_TO = 7;

/** Plates one dishes item holds, mess items per lot. */
export const DISH_STACK_MAX = 8;
export const MESS_LIMIT_PER_LOT = 10;
/** Chance (per shower) of leaving a puddle: normal and for messy people. */
export const SHOWER_PUDDLE_CHANCE = 0.06;
export const SHOWER_PUDDLE_MESSY = 0.3;

/** Bladder at or below this is an accident (not for people lying down); afterwards bladder is set to ACCIDENT_BLADDER. */
export const ACCIDENT_BELOW = 1;
export const ACCIDENT_BLADDER = 45;
export const ACCIDENT_HYGIENE = 15;

/** Home moods are refreshed this often (game minutes) and last HOME_MOODLET_MINUTES unless refreshed. */
export const HOME_MOOD_INTERVAL = 20;
export const HOME_MOODLET_MINUTES = 45;
/** Home moods need this many dirty cleanable things / dirty plates. */
export const DIRTY_KITCHEN_SCORE = 2;
/** Minimum cleanable objects before a home can be called "fresh and clean". */
export const FRESH_HOME_MIN_OBJECTS = 3;
export const FRESH_HOME_MAX_DIRT = 0.25;

// ---------------------------------------------------------------------------------------------
// Relationships, memories and events (Milestone 5; sim/relationships.ts, sim/social.ts, sim/events.ts)
// ---------------------------------------------------------------------------------------------

/** Contact: after this many days without an interaction a relationship starts to fade (daily, bounded by a floor). */
export const DECAY_GRACE_DAYS = 3;
/** Per day beyond the grace period: friendship, trust and romance lost (positive values only). */
export const DECAY_FRIENDSHIP_PER_DAY = 1;
export const DECAY_TRUST_PER_DAY = 0.5;
export const DECAY_ROMANCE_PER_DAY = 1;
/** Resentment (negative values) fades back toward zero by this much per day without conflict. */
export const FORGIVE_PER_DAY = 0.75;
/** Decay never takes a value below these floors, by shared bond (a bond is a commitment that does not just evaporate). */
export const DECAY_FLOOR: Readonly<Record<string, { friendship: number; trust: number; romance: number }>> = {
  none: { friendship: 0, trust: 0, romance: 0 },
  acquaintance: { friendship: 5, trust: 0, romance: 0 },
  friend: { friendship: 22, trust: 8, romance: 0 },
  closeFriend: { friendship: 45, trust: 25, romance: 0 },
  partner: { friendship: 40, trust: 25, romance: 30 },
  engaged: { friendship: 45, trust: 30, romance: 40 },
  spouse: { friendship: 45, trust: 30, romance: 35 },
  exPartner: { friendship: 0, trust: 0, romance: 0 },
  rival: { friendship: 0, trust: 0, romance: 0 },
};

/** Memories: at most this many per other person below importance 3, and the hard cap on everything. */
export const MEMORY_PER_PERSON = 8;
export const MEMORY_HARD_LIMIT = 64;

/** Social context: people closer than this (metres) to a romantic moment can see it. */
export const WITNESS_RADIUS = 8;
/** A witnessing partner loses this much trust (and friendship) in the cheater, and likes the other person less. */
export const JEALOUSY_TRUST = 14;
export const JEALOUSY_FRIENDSHIP = 6;
export const JEALOUSY_RIVAL_FRIENDSHIP = 8;
/** Romantic socials need the target's mood above this (a person in a foul mood is not receptive). */
export const ROMANCE_MIN_MOOD = -20;
/** A partner who is this unhappy makes romantic socials with someone else impossible in their sight. */
export const ANGRY_MOOD = -15;
/** Acceptance penalty for flirting with somebody who is in a relationship with someone else, and a bonus between partners. */
export const TAKEN_PENALTY = 0.3;

/** Events: history kept, the longest notice, and how long before the start guests begin to arrive. */
export const EVENT_HISTORY = 8;
export const EVENT_MAX_LEAD_DAYS = 3;
export const EVENT_ARRIVE_EARLY = 10;
export const EVENT_ARRIVE_SPREAD = 12;
/** Ending guests leave within this many minutes after the end, spread by person. */
export const EVENT_LEAVE_SPREAD = 14;
/** Extra autonomy appetite for talking (and eating) during a running event. */
export const EVENT_SOCIAL_BONUS = 0.9;
export const EVENT_EAT_SCORE = 1.6;
/** Score thresholds of the rating (0..100) and the multiplier each gives the reward. */
export const EVENT_RATING: ReadonlyArray<readonly [min: number, rating: 'poor' | 'fair' | 'good' | 'great', mult: number]> = [
  [85, 'great', 1.5], [60, 'good', 1], [30, 'fair', 0.5], [0, 'poor', -0.25],
];
/** Share of the score from goals and from the guests' mood at the end. */
export const EVENT_GOAL_SHARE = 0.7;
/** Reconciliation: how long an argument memory invites a visit, the cooldown per pair (days) and the daily chance. */
export const RECONCILE_WINDOW_DAYS = 3;
export const RECONCILE_COOLDOWN_DAYS = 7;
export const RECONCILE_CHANCE = 0.6;

// ---------------------------------------------------------------------------------------------
// Milestone 8: school, care and family
// ---------------------------------------------------------------------------------------------

/** School: goToSchool is queued this many minutes before the first bell. */
export const SCHOOL_COMMUTE_LEAD_MINUTES = 45;
/** School: a pupil who has not left by this many minutes after the start has missed the day. */
export const SCHOOL_MISS_AFTER_MINUTES = 90;
/** School: performance changes (-100..100). */
export const SCHOOL_ATTEND_PERFORMANCE = 3;
export const SCHOOL_MISSED_PERFORMANCE = -5;
export const SCHOOL_HOMEWORK_PERFORMANCE = 5;
export const SCHOOL_HOMEWORK_HELP_BONUS = 2;
export const SCHOOL_HOMEWORK_MISSED_PERFORMANCE = -3;
/** School: mood at the start of the day that raises or lowers performance a little. */
export const SCHOOL_LOW_MOOD = -20;
export const SCHOOL_HIGH_MOOD = 30;
/** Four school weeks, then one week off. */
export const SCHOOL_WEEKS_ON = 4;

/** Care: a baby's or toddler's need that stays at zero this long calls the emergency sitter. */
export const CARE_NEGLECT_MINUTES = 180;
/** Care: the emergency sitter's fee (cents) and what they restore a need to. */
export const SITTER_FEE = 2500;
export const SITTER_RESTORE = 70;
/** Care: a need at or below this counts as empty. */
export const CARE_EMPTY_NEED = 1;
/** Care: caregivers step in when a dependent's need falls below this (autonomy). */
export const CARE_AUTONOMY_NEED = 45;

/** Adoption: fees by life stage (cents). */
export const ADOPTION_FEES = { baby: 250000, toddler: 200000, child: 150000, teen: 100000 } as const;
/** Households hold at most this many people. */
export const MAX_HOUSEHOLD_SIZE = 8;

// Gifts (Milestone 13; sim/gifts.ts)
/** A gift parcel stays on the recipient's lot this long (game minutes) before it is put away. */
export const GIFT_KEEP_MINUTES = 14 * 1440;
/** At most this many parcels wait at one recipient's lot; the oldest are put away first. */
export const GIFT_LOT_LIMIT = 8;
/** Familiarity needed before a gift's hint tells whether the recipient would like it. */
export const GIFT_HINT_FAMILIARITY = 30;

// Group conversations (Milestone 13)
/** People within this many tiles of the speaker can be pulled into a group chat. */
export const GROUP_CHAT_RADIUS = 6;
/** A group chat has the speaker, the person addressed and at most this many more. */
export const GROUP_CHAT_EXTRAS = 4;
/** Opinion changes between two people who are not the speaker, relative to the speaker's own. */
export const GROUP_CHAT_SIDE_WEIGHT = 0.6;

// Life in town (Milestone 13; sim/townChange.ts)
/** Chance per game day that one townsperson changes their working life (hired, switches career or quits). */
export const TOWN_JOB_CHANCE = 0.18;
/** Chance per game week (on its weekly day) that one NPC household moves to an empty home. */
export const TOWN_MOVE_CHANCE = 0.4;
/** Day of the week (0 = Monday) the town's moving day falls on. */
export const TOWN_MOVE_WEEKDAY = 3;
