// Fixture content for the creator tests: a small but complete character catalog, independent of the live
// registries (which other modules are still filling in).

import type {
  AccessoryDef, AspirationDef, BodyPreset, CareerDef, ContentDB, FacePreset, GarmentDef, HairDef, ParamDef, TraitCategory,
  TraitDef,
} from '../../../src/content/types';
import type { GarmentLayer, OutfitCategory } from '../../../src/core/types';

const byId = <T extends { id: string }>(list: T[]): Record<string, T> => Object.fromEntries(list.map((x) => [x.id, x]));

function trait(id: string, name: string, category: TraitCategory, conflicts: string[] = [], status: 'ready' | 'dev' = 'ready'): TraitDef {
  return { id, name, description: `${name} trait.`, icon: id, category, conflicts, effects: {}, effectText: ['Test effect.'], status };
}

function garment(id: string, layer: GarmentLayer, categories: OutfitCategory[], patterns: string[] = ['solid'], status: 'ready' | 'dev' = 'ready'): GarmentDef {
  return { id, name: id.replace(/-/g, ' '), description: `${id} garment.`, layer, categories, tags: [], patterns, defaultColor: '#777777', build: {}, status };
}

function hair(id: string, length: HairDef['length'], texture: HairDef['texture'], status: 'ready' | 'dev' = 'ready'): HairDef {
  return { id, name: id, description: `${id} hair.`, length, texture, tags: [], build: {}, status };
}

function accessory(id: string, kind: AccessoryDef['kind']): AccessoryDef {
  return { id, name: id, description: `${id}.`, kind, defaultColor: '#333333', build: {}, status: 'ready' };
}

function param(id: string, group: string, min = -1, max = 1): ParamDef {
  return { id, name: id, group, min, max, step: 0.05 };
}

function aspiration(id: string, name: string, status: 'ready' | 'dev' = 'ready'): AspirationDef {
  return {
    id, name, description: `${name}.`, icon: id, category: 'test', status,
    stages: [{ name: 'Start', objectives: [{ id: `${id}-1`, text: 'Do it', type: 'interactionCount', match: 'sit', count: 1 }], reward: { money: 100, text: 'Reward' } }],
  };
}

function career(id: string, name: string): CareerDef {
  return { id, name, description: `${name}.`, icon: id, skills: [], levels: [], status: 'ready' };
}

export function fixtureContent(): ContentDB {
  return {
    objects: {}, openings: {}, wallDesigns: {}, floorDesigns: {}, interactions: {}, socials: {}, skills: {}, moodlets: {},
    recipes: {}, packs: {},
    traits: byId([
      trait('outgoing', 'Outgoing', 'social', ['reserved']),
      trait('reserved', 'Reserved', 'social', ['outgoing']),
      trait('neat', 'Neat', 'tidiness', ['messy']),
      trait('messy', 'Messy', 'tidiness', ['neat']),
      trait('cheerful', 'Cheerful', 'social', ['gloomy']),
      trait('gloomy', 'Gloomy', 'social', ['cheerful']),
      trait('ambitious', 'Ambitious', 'lifestyle', ['relaxed']),
      trait('relaxed', 'Relaxed', 'lifestyle', ['ambitious']),
      trait('foodie', 'Foodie', 'leisure'),
      trait('bookish', 'Bookish', 'creativity'),
      trait('athletic', 'Athletic', 'energy'),
      trait('creative', 'Creative', 'creativity'),
      trait('night-owl', 'Night Owl', 'energy'),
      trait('unfinished', 'Unfinished', 'social', [], 'dev'),
    ]),
    aspirations: byId([aspiration('masterChef', 'Master Chef'), aspiration('socialButterfly', 'Social Butterfly'), aspiration('bookworm', 'Bookworm'), aspiration('secret', 'Secret', 'dev')]),
    careers: byId([career('culinary', 'Culinary'), career('writer', 'Writer')]),
    hair: byId([
      hair('buzz', 'shaved', 'shaved'), hair('bob', 'medium', 'straight'), hair('long-waves', 'long', 'wavy'),
      hair('short-curls', 'short', 'curly'), hair('coils', 'short', 'coily'), hair('high-bun', 'long', 'tied'),
      hair('box-braids', 'long', 'braided'), hair('crop', 'short', 'straight'), hair('mystery', 'long', 'wavy', 'dev'),
    ]),
    facialHair: byId([
      { id: 'beard-full', name: 'Full Beard', description: 'Beard.', build: {}, status: 'ready' },
      { id: 'moustache', name: 'Moustache', description: 'Moustache.', build: {}, status: 'ready' },
    ]),
    garments: byId([
      garment('tee', 'top', ['everyday', 'athletic'], ['solid', 'stripes', 'polka']),
      garment('shirt', 'top', ['formal', 'work', 'everyday'], ['solid', 'stripes', 'plaid']),
      garment('pj-top', 'top', ['sleep']),
      garment('swim-top', 'top', ['swim']),
      garment('jeans', 'bottom', ['everyday', 'work']),
      garment('trousers', 'bottom', ['formal', 'work'], ['solid', 'plaid']),
      garment('joggers', 'bottom', ['athletic', 'sleep']),
      garment('swim-shorts', 'bottom', ['swim']),
      garment('pj-pants', 'bottom', ['sleep']),
      garment('dress', 'full', ['everyday', 'formal'], ['solid', 'polka']),
      garment('swimsuit', 'full', ['swim']),
      garment('nightgown', 'full', ['sleep']),
      garment('blazer', 'outer', ['formal', 'work']),
      garment('hoodie', 'outer', ['everyday', 'athletic']),
      garment('sneakers', 'shoes', ['everyday', 'athletic']),
      garment('oxfords', 'shoes', ['formal', 'work']),
      garment('slippers', 'shoes', ['sleep']),
      garment('sandals', 'shoes', ['swim', 'everyday']),
      garment('cape', 'outer', ['everyday'], ['solid'], 'dev'),
    ]),
    accessories: byId([
      accessory('glasses-round', 'glasses'), accessory('glasses-square', 'glasses'), accessory('cap', 'hat'),
      accessory('beanie', 'hat'), accessory('watch', 'watch'), accessory('pendant', 'necklace'), accessory('scarf-wool', 'scarf'),
    ]),
    patterns: byId([
      { id: 'solid', name: 'Solid', description: 'Plain.' }, { id: 'stripes', name: 'Stripes', description: 'Stripes.' },
      { id: 'plaid', name: 'Plaid', description: 'Plaid.' }, { id: 'polka', name: 'Polka', description: 'Dots.' },
    ]),
    facePresets: byId<FacePreset>([
      { id: 'soft', name: 'Soft', params: { jaw: -0.4, eyes: 0.3, nose: -0.2 } },
      { id: 'angular', name: 'Angular', params: { jaw: 0.7, cheeks: 0.4, nose: 0.3 } },
      { id: 'wide', name: 'Wide', params: { jaw: 2, mouth: 0.5, unknownThing: 1 } },
    ]),
    bodyPresets: byId<BodyPreset>([
      { id: 'a-lean', name: 'Lean', frame: 'a', params: { build: -0.5, shoulders: 0.2 } },
      { id: 'a-sturdy', name: 'Sturdy', frame: 'a', params: { build: 0.7, shoulders: 0.6, waist: 0.4 } },
      { id: 'b-slim', name: 'Slim', frame: 'b', params: { build: -0.4, hips: 0.2 } },
      { id: 'b-curvy', name: 'Curvy', frame: 'b', params: { build: 0.3, hips: 0.8, waist: -0.2 } },
    ]),
    browStyles: byId([{ id: 'straight', name: 'Straight' }, { id: 'arched', name: 'Arched' }, { id: 'soft', name: 'Soft' }]),
    voices: byId([{ id: 'warm', name: 'Warm' }, { id: 'bright', name: 'Bright' }, { id: 'deep', name: 'Deep' }]),
    faceParams: [param('jaw', 'jaw'), param('eyes', 'eyes'), param('nose', 'nose'), param('cheeks', 'cheeks', -0.5, 0.5), param('mouth', 'mouth')],
    bodyParams: [param('build', 'body'), param('shoulders', 'body'), param('waist', 'body'), param('hips', 'body', -0.8, 1)],
    skinTones: [
      { id: 'porcelain', name: 'Porcelain', color: '#f7e0cf' }, { id: 'sand', name: 'Sand', color: '#e8bf98' },
      { id: 'honey', name: 'Honey', color: '#d29a6a' }, { id: 'amber', name: 'Amber', color: '#b07445' },
      { id: 'umber', name: 'Umber', color: '#7d4c2c' }, { id: 'ebony', name: 'Ebony', color: '#4a2c1b' },
    ],
    hairColors: [
      { id: 'black', name: 'Black', color: '#1a1614' }, { id: 'dark-brown', name: 'Dark Brown', color: '#3a2619' },
      { id: 'chestnut', name: 'Chestnut', color: '#6b3f22' }, { id: 'auburn', name: 'Auburn', color: '#8c3a1e' },
      { id: 'blonde', name: 'Blonde', color: '#d8b574' }, { id: 'silver', name: 'Silver', color: '#b8b8b8' },
      { id: 'teal', name: 'Teal', color: '#1f8a8a' }, { id: 'rose', name: 'Rose', color: '#e06aa0' },
    ],
    eyeColors: [
      { id: 'brown', name: 'Brown', color: '#5a3a22' }, { id: 'hazel', name: 'Hazel', color: '#7a6a3a' },
      { id: 'green', name: 'Green', color: '#4f7a4a' }, { id: 'blue', name: 'Blue', color: '#3d6b8c' },
      { id: 'grey', name: 'Grey', color: '#6a7480' },
    ],
    preferences: [
      { id: 'activity:cooking', group: 'activity', name: 'Cooking' }, { id: 'activity:gaming', group: 'activity', name: 'Gaming' },
      { id: 'activity:fitness', group: 'activity', name: 'Fitness' }, { id: 'music:jazz', group: 'music', name: 'Jazz' },
      { id: 'music:rock', group: 'music', name: 'Rock' }, { id: 'music:folk', group: 'music', name: 'Folk' },
      { id: 'food:spicy', group: 'food', name: 'Spicy Food' }, { id: 'decor:modern', group: 'decor', name: 'Modern Decor' },
    ],
  };
}

/** A ContentDB with every registry empty (content still being written). */
export function emptyContent(): ContentDB {
  return {
    objects: {}, openings: {}, wallDesigns: {}, floorDesigns: {}, interactions: {}, socials: {}, traits: {}, aspirations: {},
    skills: {}, careers: {}, moodlets: {}, recipes: {}, packs: {}, hair: {}, facialHair: {}, garments: {}, accessories: {},
    patterns: {}, facePresets: {}, bodyPresets: {}, browStyles: {}, voices: {}, faceParams: [], bodyParams: [],
    skinTones: [], hairColors: [], eyeColors: [], preferences: [],
  };
}
