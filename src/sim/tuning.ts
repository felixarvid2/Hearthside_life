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
