// Aggregates all registries into one ContentDB. Registries live in separate files owned by different
// modules (see docs/ARCHITECTURE.md). Duplicate ids are a hard error.

import type { ContentDB } from './types';
import { OBJECTS } from './objects';
import { EXTERIOR, GARDEN_INTERACTIONS } from './exterior';
import { EXTERIOR_OBJECTS } from './exteriorObjects';
import { INTERACTIONS } from './interactions';
import { SOCIALS } from './socials';
import { FAMILY_INTERACTIONS, FAMILY_SOCIALS } from './family';
import { EVENTS } from './events';
import { GIFTS } from './gifts';
import { COMMUNITY_EVENTS } from './communityEvents';
import { TRAITS } from './traits';
import { ASPIRATIONS } from './aspirations';
import { SKILLS } from './skills';
import { CAREERS } from './careers';
import { CAREER_EVENTS } from './careerEvents';
import { MOODLETS } from './moodlets';
import { SCHOOLS } from './school';
import { RECIPES } from './recipes';
import { PACKS } from './packs';
import { PREFERENCES } from './preferences';
import { FLOOR_DESIGNS, OPENINGS, WALL_DESIGNS } from './surfaces';
import {
  ACCESSORIES, BODY_PARAMS, BODY_PRESETS, BROW_STYLES, EYE_COLORS, FACE_PARAMS, FACE_PRESETS, FACIAL_HAIR,
  GARMENTS, HAIR, HAIR_COLORS, PATTERNS, SKIN_TONES, VOICES,
} from './character';

function byId<T extends { id: string }>(kind: string, list: readonly T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const item of list) {
    if (out[item.id]) throw new Error(`Duplicate ${kind} id: ${item.id}`);
    out[item.id] = item;
  }
  return out;
}

export function buildContentDB(): ContentDB {
  return {
    objects: byId('object', [...OBJECTS, ...EXTERIOR_OBJECTS]),
    openings: byId('opening', OPENINGS),
    wallDesigns: byId('wall design', WALL_DESIGNS),
    floorDesigns: byId('floor design', FLOOR_DESIGNS),
    interactions: byId('interaction', [...INTERACTIONS, ...FAMILY_INTERACTIONS, ...GARDEN_INTERACTIONS]),
    socials: byId('social', [...SOCIALS, ...FAMILY_SOCIALS]),
    events: byId('event', EVENTS),
    gifts: byId('gift', GIFTS),
    communityEvents: byId('community event', COMMUNITY_EVENTS),
    traits: byId('trait', TRAITS),
    aspirations: byId('aspiration', ASPIRATIONS),
    skills: byId('skill', SKILLS),
    careers: byId('career', CAREERS),
    careerEvents: byId('career event', CAREER_EVENTS),
    schools: byId('school', SCHOOLS),
    moodlets: byId('moodlet', MOODLETS),
    recipes: byId('recipe', RECIPES),
    packs: byId('pack', PACKS),
    hair: byId('hair', HAIR),
    facialHair: byId('facial hair', FACIAL_HAIR),
    garments: byId('garment', GARMENTS),
    accessories: byId('accessory', ACCESSORIES),
    patterns: byId('pattern', PATTERNS),
    facePresets: byId('face preset', FACE_PRESETS),
    bodyPresets: byId('body preset', BODY_PRESETS),
    browStyles: byId('brow style', BROW_STYLES),
    voices: byId('voice', VOICES),
    faceParams: FACE_PARAMS,
    bodyParams: BODY_PARAMS,
    skinTones: SKIN_TONES,
    hairColors: HAIR_COLORS,
    eyeColors: EYE_COLORS,
    preferences: PREFERENCES,
    exterior: EXTERIOR,
  };
}

let cached: ContentDB | null = null;
/** The game's content registry (built once). */
export function content(): ContentDB { return (cached ??= buildContentDB()); }
