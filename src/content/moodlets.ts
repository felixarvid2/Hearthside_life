// OWNER: content agent (gameplay content). See docs/ARCHITECTURE.md.
//
// Moodlets: short-lived mood modifiers. `value` is the signed mood contribution, `minutes` the game-minute
// duration after which it expires. Condition moodlets (minutes 0) are held while their condition is true and
// recomputed by the simulation (Person.moodlets entries with until = null) - e.g. the need moodlets below.

import type { MoodletDef } from './types';

const m = (id: string, name: string, value: number, minutes: number, icon: string, description: string): MoodletDef =>
  ({ id, name, value, minutes, icon, description });

/** Moodlets granted by interactions (moodletOnComplete). */
const ACTIVITY: MoodletDef[] = [
  m('wellRested', 'Well Rested', 12, 360, 'bed', 'Slept until fully refreshed.'),
  m('freshAndClean', 'Fresh and Clean', 8, 180, 'hygiene', 'Nothing beats a hot shower.'),
  m('longSoak', 'Long Soak', 15, 240, 'hygiene', 'A relaxing bath melted the stress away.'),
  m('goodMeal', 'Good Meal', 10, 240, 'hunger', 'Ate a proper home-cooked meal.'),
  m('proudCook', 'Proud Cook', 8, 180, 'star', 'Cooked a meal for the household.'),
  m('entertained', 'Entertained', 8, 120, 'fun', 'That was a good show.'),
  m('gamingHigh', 'In the Zone', 10, 120, 'fun', 'Won a few rounds in a favourite game.'),
  m('lostInABook', 'Lost in a Book', 8, 180, 'book', 'A good chapter lingers in the mind.'),
  m('goodTunes', 'Good Tunes', 6, 120, 'sound', 'Listened to some great music.'),
  m('energized', 'Energized', 8, 120, 'energy', 'Got the heart pumping.'),
  m('greenThumb', 'Green Thumb', 4, 120, 'sparkle', 'Looked after a plant.'),
  m('confidentSpeaker', 'Confident Speaker', 6, 180, 'face', 'Practised a speech until it flowed.'),
  m('freshOutfit', 'Fresh Outfit', 3, 120, 'shirt', 'Feeling good in the right clothes.'),
  m('caughtUp', 'Caught Up', 6, 180, 'phone', 'A good phone call with someone who matters.'),
];

/** Moodlets granted by social interactions. */
const SOCIAL: MoodletDef[] = [
  m('niceToMeetYou', 'Nice to Meet You', 4, 120, 'social', 'Met someone new.'),
  m('pleasantChat', 'Pleasant Chat', 5, 120, 'social', 'Had a nice little chat.'),
  m('greatConversation', 'Great Conversation', 12, 240, 'social', 'Talked about things that really matter.'),
  m('goodLaugh', 'Good Laugh', 8, 180, 'fun', 'Laughed until it hurt.'),
  m('flattered', 'Flattered', 8, 240, 'heart', 'Someone said something really kind.'),
  m('warmHug', 'Warm Hug', 10, 240, 'heart', 'A hug from a friend.'),
  m('comforted', 'Comforted', 12, 300, 'heart', 'Someone was there when it counted.'),
  m('forgiven', 'Forgiven', 10, 240, 'check', 'An apology was accepted.'),
  m('newFriend', 'New Friend', 15, 720, 'people', 'Made a new friend.'),
  m('closeFriendship', 'Kindred Spirit', 20, 1440, 'people', 'A friendship grew into something closer.'),
  m('butterflies', 'Butterflies', 12, 360, 'heart', 'A flirt landed perfectly.'),
  m('awkward', 'Awkward', -5, 120, 'warning', 'That did not go as planned.'),
  m('embarrassed', 'Embarrassed', -8, 120, 'warning', 'A joke fell completely flat.'),
  m('rebuffed', 'Rebuffed', -10, 240, 'warning', 'An offer was turned down.'),
  m('stung', 'Stung', -8, 180, 'warning', 'Criticism hurts, even when it is fair.'),
  m('furious', 'Furious', -14, 240, 'warning', 'Still fuming after a heated argument.'),
  m('insulted', 'Insulted', -15, 360, 'warning', 'Someone was needlessly cruel.'),
  m('remorseful', 'Remorseful', -6, 180, 'warning', 'Said something that should have stayed unsaid.'),
];

/** Moodlets for progression events (careers, skills, aspirations). */
const PROGRESS: MoodletDef[] = [
  m('promoted', 'Promoted!', 20, 1440, 'briefcase', 'Moved up at work.'),
  m('payday', 'Payday', 5, 240, 'money', 'Wages just arrived.'),
  m('missedWork', 'Missed Work', -10, 480, 'briefcase', 'Did not show up for a shift.'),
  m('skillUp', 'Getting Better', 8, 240, 'star', 'Reached a new skill level.'),
  m('milestoneReached', 'Milestone Reached', 18, 1440, 'star', 'Completed an aspiration stage.'),
  m('dreamFulfilled', 'Dream Fulfilled', 30, 2880, 'sparkle', 'Completed a lifelong aspiration.'),
];

/** Condition moodlets the simulation holds while a need is low (minutes 0 = while the condition holds). */
const NEEDS: MoodletDef[] = [
  m('hungry', 'Hungry', -10, 0, 'hunger', 'Hunger is below 30.'),
  m('starving', 'Starving', -25, 0, 'hunger', 'Hunger is below 10.'),
  m('tired', 'Tired', -10, 0, 'energy', 'Energy is below 30.'),
  m('exhausted', 'Exhausted', -25, 0, 'energy', 'Energy is below 10.'),
  m('grubby', 'Grubby', -10, 0, 'hygiene', 'Hygiene is below 25.'),
  m('bursting', 'Bursting', -20, 0, 'bladder', 'Bladder is below 15.'),
  m('bored', 'Bored', -8, 0, 'fun', 'Fun is below 25.'),
  m('lonely', 'Lonely', -10, 0, 'social', 'Social is below 25.'),
  m('comfySeat', 'Comfy Seat', 4, 0, 'home', 'Sitting on something really comfortable (comfort 6 or more).'),
];

/** Every moodlet definition. */
export const MOODLETS: MoodletDef[] = [...ACTIVITY, ...SOCIAL, ...PROGRESS, ...NEEDS];
