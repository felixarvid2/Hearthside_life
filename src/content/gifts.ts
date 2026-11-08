// OWNER: content agent (gameplay content). See docs/ARCHITECTURE.md "Relationships and events".
//
// Gifts: a small catalog of things a person can buy and give. A gift becomes a parcel (a WorldItem of kind 'gift') on
// the recipient's lot. How the recipient takes it (sim/gifts.ts giftReaction) depends on what they like and dislike
// (`appeals` are preference ids), their traits (`traitFit`) and their age (`ages`); the price does not matter, so a
// thoughtful $4 card can beat an expensive miss. 'trinket' is the all-rounder the old $20 gift was.

import type { LifeStage } from '../core/types';
import type { GiftDef } from './types';

const ALL: LifeStage[] = ['toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder'];
const GROWN: LifeStage[] = ['teen', 'youngAdult', 'adult', 'elder'];
const KIDS: LifeStage[] = ['toddler', 'child'];

const gift = (g: Omit<GiftDef, 'status' | 'ages'> & { ages?: LifeStage[] }): GiftDef => ({ status: 'ready', ages: ALL, ...g });

export const GIFTS: GiftDef[] = [
  gift({
    id: 'card', name: 'Handmade Card', description: 'A folded card with a few kind words. Cheap, and never a bad idea.', icon: 'tag', price: 400,
    appeals: ['topic:books'], traitFit: { creative: 0.5, artistic: 0.5, awkward: 0.3, romantic: 0.3 }, colour: '#e8d9b8',
  }),
  gift({
    id: 'flowers', name: 'Bouquet of Flowers', description: 'Seasonal flowers in brown paper.', icon: 'leaf', price: 1500,
    appeals: ['topic:nature', 'activity:gardening', 'decor:botanical', 'decor:cottage'], traitFit: { romantic: 0.9, 'green-thumb': 0.8, outdoorsy: 0.4, compassionate: 0.3 }, colour: '#e86f8a',
  }),
  gift({
    id: 'chocolates', name: 'Box of Chocolates', description: 'Twelve handmade chocolates with a ribbon.', icon: 'hunger', price: 1200,
    appeals: ['topic:food', 'food:comfort-food', 'food:breakfast'], traitFit: { 'sweet-tooth': 1, foodie: 0.6, romantic: 0.4 }, colour: '#7a3b2e',
  }),
  gift({
    id: 'book', name: 'Paperback Novel', description: 'A well-reviewed novel, wrapped in plain paper.', icon: 'book', price: 1800,
    appeals: ['topic:books', 'activity:reading', 'topic:movies'], traitFit: { bookish: 1, curious: 0.5, reserved: 0.3, lazy: -0.2 }, colour: '#3f6fa8', ages: [...GROWN, 'child'],
  }),
  gift({
    id: 'plush', name: 'Soft Toy', description: 'A cuddly bear with a bow. Small hands love it.', icon: 'star', price: 1400,
    appeals: [], traitFit: { 'family-oriented': 0.6, cheerful: 0.3, romantic: 0.2, practical: -0.3 }, colour: '#c99a6b', ages: [...KIDS, 'youngAdult'],
  }),
  gift({
    id: 'record', name: 'Vinyl Record', description: 'A pressing from a favourite genre.', icon: 'sound', price: 2500,
    appeals: ['topic:music', 'activity:music', 'music:jazz', 'music:rock', 'music:classical', 'music:folk', 'music:pop', 'music:electronic'], traitFit: { 'music-lover': 1, creative: 0.3, artistic: 0.3 }, colour: '#2d2d3a', ages: GROWN,
  }),
  gift({
    id: 'videogame', name: 'Video Game', description: 'A boxed game for the console or PC.', icon: 'chart', price: 4000,
    appeals: ['activity:gaming', 'topic:technology'], traitFit: { 'tech-enthusiast': 1, competitive: 0.5, lazy: 0.2, practical: -0.2 }, colour: '#4a4ac9', ages: ['child', ...GROWN],
  }),
  gift({
    id: 'candle', name: 'Scented Candle', description: 'Cedar and vanilla in a glass jar.', icon: 'sparkle', price: 1600,
    appeals: ['decor:cottage', 'decor:classic', 'decor:retro'], traitFit: { neat: 0.4, relaxed: 0.5, romantic: 0.5, 'hot-tempered': -0.2 }, colour: '#d9c28a', ages: GROWN,
  }),
  gift({
    id: 'sportsKit', name: 'Sports Kit', description: 'A water bottle, wristbands and a skipping rope.', icon: 'energy', price: 2200,
    appeals: ['activity:fitness', 'topic:sports', 'activity:dance'], traitFit: { athletic: 1, energetic: 0.5, competitive: 0.4, lazy: -0.6 }, colour: '#2fa37a', ages: ['child', ...GROWN],
  }),
  gift({
    id: 'spices', name: 'Spice Set', description: 'Twelve little jars of good spices.', icon: 'hunger', price: 2400,
    appeals: ['activity:cooking', 'topic:food', 'food:pasta', 'food:roasts', 'food:vegetables', 'food:seafood'], traitFit: { foodie: 1, practical: 0.4, organised: 0.3 }, colour: '#c9772e', ages: GROWN,
  }),
  gift({
    id: 'trinket', name: 'Keepsake Trinket', description: 'A pretty little something. Nobody is upset by it, nobody is thrilled.', icon: 'star', price: 2000,
    appeals: [], traitFit: { generous: 0.2 }, colour: '#9a7bd1',
  }),
];
