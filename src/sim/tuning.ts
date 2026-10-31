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
