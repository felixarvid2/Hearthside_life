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
  m('sparkling', 'Sparkling Clean', 5, 180, 'sparkle', 'Scrubbed something until it shone.'),
  m('inspired', 'Inspired', 8, 180, 'star', 'Put a little of yourself onto the canvas.'),
  m('sharpMind', 'Sharp Mind', 6, 180, 'book', 'Worked out a few clever moves.'),
  m('caffeinated', 'Caffeinated', 4, 90, 'energy', 'A fresh cup of coffee.'),
  m('playtime', 'Playtime', 7, 120, 'fun', 'Lost an afternoon in make-believe.'),
  m('fixedIt', 'Fixed It!', 8, 240, 'build', 'Got a broken thing working again.'),
  // Venues (Milestone 7)
  m('sweetTreat', 'Sweet Treat', 5, 120, 'fun', 'A pastry that was worth every crumb.'),
  m('freshFruit', 'Fresh and Juicy', 4, 120, 'hunger', 'Ate something fresh from the market.'),
  m('picnicJoy', 'Picnic in the Park', 9, 240, 'fun', 'Lunch outdoors in the fresh air.'),
  m('peaceful', 'Peaceful', 6, 150, 'sparkle', 'Watched the clouds drift by without a care.'),
  m('stockedPantry', 'Stocked Pantry', 3, 4320, 'home', 'A full pantry makes every home-cooked meal cheaper.'),
  m('studious', 'Studious', 5, 180, 'book', 'Got a good stretch of studying done in a quiet room.'),
  m('clearHead', 'Clear Head', 5, 180, 'book', 'Wrote it all down and feels lighter.'),
  // Milestone 11, task B: baking and wellness
  m('proudBake', 'Proud Baker', 8, 180, 'star', 'Baked something the whole household can share.'),
  m('calm', 'Calm', 10, 180, 'heart', 'A quiet mind and a steady breath.'),
  // Milestone 12, task O: outdoor life
  m('snowmanBuilt', 'Snowman Builder', 10, 240, 'snow', 'Built a snowman out of the fresh snow.'),
  m('snowAngel', 'Snow Angel', 8, 180, 'snow', 'Flapped about in the snow and left an angel behind.'),
  m('kiteHigh', 'Kite High', 10, 180, 'sparkle', 'Kept the kite dancing on the wind.'),
  m('crispAutumnAir', 'Crisp Autumn Air', 7, 180, 'leaf', 'Raked leaves until the lawn was tidy again.'),
  m('puddleSplash', 'Puddle Splash', 9, 120, 'fun', 'Jumped in every puddle in reach.'),
  m('starryEyed', 'Starry Eyed', 8, 180, 'moon', 'Found a few constellations in the night sky.'),
  m('sunKissed', 'Sun Kissed', 8, 240, 'sun', 'Warm through after a spell in the sun.'),
];

/** Moodlets from the state of the home, refreshed by the simulation while the condition holds and dropped once it does not. */
const HOME: MoodletDef[] = [
  m('freshHome', 'Fresh and Clean Home', 8, 45, 'home', 'Everything is spotless: no grime, dishes, messes or broken things.'),
  m('dirtyKitchen', 'Dirty Kitchen', -8, 45, 'warning', 'Dirty dishes or a grimy stove, counter or sink.'),
  m('dirtyBathroom', 'Dirty Bathroom', -8, 45, 'warning', 'The toilet, shower or basin is filthy.'),
  m('messyFloors', 'Messy Floors', -5, 45, 'warning', 'Puddles and spills on the floor.'),
  m('brokenThings', 'Things Need Fixing', -5, 45, 'warning', 'Something in the home is broken.'),
];

/** Moodlets from mishaps. */
const MISHAP: MoodletDef[] = [
  m('accident', 'Accident', -12, 240, 'warning', 'Did not make it to the toilet in time.'),
  m('shocked', 'Shocked', -8, 120, 'warning', 'Got a nasty jolt while repairing something.'),
  m('soaked', 'Soaked', -4, 90, 'warning', 'A leaking pipe sprayed everything.'),
  m('singed', 'Singed', -8, 180, 'warning', 'A grease flare-up on the stove.'),
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
  // Romance, trust and conflict (Milestone 5)
  m('handsHeld', 'Hand in Hand', 6, 180, 'heart', 'Held hands with someone special.'),
  m('sweetKiss', 'Sweet Kiss', 14, 360, 'heart', 'A kiss that was worth waiting for.'),
  m('newPartner', 'In Love', 22, 1440, 'heart', 'Started something wonderful with a partner.'),
  m('engagedGlow', 'Engaged!', 25, 2880, 'sparkle', 'A proposal was accepted.'),
  m('newlywed', 'Just Married', 30, 2880, 'sparkle', 'Married the person they love.'),
  m('heartbroken', 'Heartbroken', -25, 2880, 'warning', 'A relationship has ended.'),
  m('flustered', 'Flustered', -4, 90, 'warning', 'Had to turn down a romantic advance.'),
  m('jealous', 'Jealous', -12, 240, 'warning', 'Saw a partner getting close to someone else.'),
  m('betrayed', 'Betrayed', -25, 1440, 'warning', 'A secret was used against them.'),
  m('trusted', 'Trusted', 10, 360, 'heart', 'Someone trusted them with a secret.'),
  m('goodAdvice', 'Good Advice', 6, 240, 'star', 'Got helpful advice from a friend.'),
  m('favourDone', 'Favour Done', 8, 240, 'check', 'A friend came through with a favour.'),
  m('giftReceived', 'Thoughtful Gift', 10, 360, 'star', 'Received a gift.'),
  // Home events
  m('greatDateGlow', 'Wonderful Date', 20, 720, 'heart', 'An evening to remember.'),
  m('awkwardDate', 'Awkward Date', -8, 240, 'warning', 'The date never really took off.'),
  m('partyGlow', 'Great Party', 15, 480, 'social', 'A gathering that went really well.'),
  m('flatParty', 'Flat Party', -6, 240, 'warning', 'The gathering never really got going.'),
  m('goodVisit', 'Nice Visit', 6, 180, 'social', 'It was good to have company.'),
  m('coldVisit', 'Cold Visit', -5, 180, 'warning', 'The visit left a chill.'),
  m('reconciledGlow', 'Relief', 14, 360, 'check', 'Cleared the air after a falling-out.'),
  m('unresolved', 'Unresolved', -8, 360, 'warning', 'A quarrel is still hanging in the air.'),
];

/** Moodlets for progression events (careers, skills, aspirations). */
const PROGRESS: MoodletDef[] = [
  m('promoted', 'Promoted!', 20, 1440, 'briefcase', 'Moved up at work.'),
  m('payday', 'Payday', 5, 240, 'money', 'Wages just arrived.'),
  m('missedWork', 'Missed Work', -10, 480, 'briefcase', 'Did not show up for a shift.'),
  m('newJob', 'New Job', 12, 480, 'briefcase', 'Just started a new job.'),
  m('workPraise', 'Praise at Work', 8, 240, 'briefcase', 'Someone at work noticed the effort.'),
  m('workBlunder', 'Work Blunder', -8, 240, 'briefcase', 'A mistake at work is still bothering them.'),
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

/** Milestone 8: birthdays, school, caring for little ones and changes in the family. */
const FAMILY: MoodletDef[] = [
  m('birthday', 'Birthday', 20, 1440, 'star', 'Grew into a new stage of life today.'),
  m('celebrating', 'Celebrating', 12, 480, 'sparkle', 'Shared a birthday cake with the family.'),
  m('homeworkDone', 'Homework Done', 6, 360, 'check', 'Finished the homework and feels ready for tomorrow.'),
  m('missedSchool', 'Skipped School', -8, 600, 'warning', 'Did not make it to school today.'),
  m('goodReport', 'Good Report Card', 14, 1440, 'star', 'A report card to be proud of.'),
  m('badReport', 'Poor Report Card', -12, 1440, 'warning', 'The report card was disappointing.'),
  m('cuddled', 'Cuddled', 8, 240, 'heart', 'Held and cuddled by someone who cares.'),
  m('playedWith', 'Played With', 8, 240, 'fun', 'Had a lovely time playing together.'),
  m('proudParent', 'Proud Parent', 8, 360, 'heart', 'Helped a little one learn something new.'),
  m('looked', 'Looked After', 6, 240, 'heart', 'Fed, changed and tucked in.'),
  m('sitterCalled', 'Rescued by the Sitter', -6, 360, 'warning', 'Had to be looked after by an emergency sitter.'),
  m('newFamily', 'New Family', 16, 2880, 'heart', 'Joined a new family.'),
  m('movedOut', 'Own Place', 12, 1440, 'home', 'Moved into a place of their own.'),
  m('missedThem', 'Missing Someone', -10, 2880, 'heart', 'Someone close has gone.'),
];

/** Milestone 12: the weather (sim/weather.ts; one at a time, with a cooldown, scaled by weather preferences and traits). */
const WEATHER: MoodletDef[] = [
  m('lovelyWeather', 'Lovely Weather', 6, 90, 'sun', 'A beautiful day to be outside.'),
  m('gloomyDay', 'Gloomy Day', -5, 120, 'cloud', 'Grey skies and a grey mood to match.'),
  m('cosyRain', 'Cosy Rain', 5, 120, 'rain', 'Safe indoors while it patters on the window.'),
  m('snowDay', 'Snow Day!', 10, 180, 'snow', 'The world is white and quiet.'),
  m('caughtInRain', 'Caught in the Rain', -4, 60, 'rain', 'Out in the rain without shelter.'),
  m('chilly', 'Chilly', -6, 90, 'snow', 'Out in the snow without a winter coat.'),
];

/** Every moodlet definition. */
export const MOODLETS: MoodletDef[] = [...ACTIVITY, ...HOME, ...MISHAP, ...SOCIAL, ...PROGRESS, ...NEEDS, ...FAMILY, ...WEATHER];
