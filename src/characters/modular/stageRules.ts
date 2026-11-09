// Which catalog parts a life stage may wear, and the outfit and hair a person of that stage gets when nothing was chosen.
// The rules are a code table over catalog ids (the manifest has no age tags): babies and toddlers have a short white list,
// children and teens a black list of adult cuts, facial hair starts at young adult, accessories are age-appropriate for
// children and absent for babies. Pure data and functions, shared by resolveLook, the creator lists and the random roll.

import type { LifeStage } from '../../core/types';
import { findGarment, findHair } from './manifest';
import type { ModularLook, ModularManifest, ModularOutfit, ModularSlot } from './types';

export type PartKind = 'garment' | 'hair' | 'facial';

const set = (s: string): ReadonlySet<string> => new Set(s.split(/\s+/).filter(Boolean));

/** Garments of a baby (a plain set; no shoes, no accessories). */
const BABY_GARMENTS = set('romper sundress dress_tshirt dungaree_shorts overalls tshirt_crew tee_scoop tee_cap longsleeve_scoop sweater_crew hoodie_pullover shorts_mid shorts_short joggers sweatpants leggings trousers_straight cardigan');
/** Garments of a toddler: the baby's, plus shoes, a coat, a hat and a scarf. */
const TODDLER_GARMENTS = set(`${[...BABY_GARMENTS].join(' ')} boilersuit jumpsuit pinafore_dress skirt_aline raglan_tee tee_long henley windbreaker raincoat puffer sneakers_low sandals rain_boots slippers beanie sun_hat bucket_hat cap_baseball headband scarf`);
/** Cuts and kinds children do not wear. */
const NOT_FOR_CHILDREN = set(`camisole halter_top tube_top sport_bra_top off_shoulder_long off_shoulder_top tank_crop tee_crop sweater_crop hoodie_crop wrap_top peplum_top
  hot_pants skirt_mini skirt_pencil jeans_low_rise bike_shorts culottes cocktail_dress gown dress_slip dress_sheath dress_off_shoulder dress_wrap bodysuit blazer trench_coat waistcoat
  court_shoes knee_boots platform_sneakers cowboy_boots chelsea_boots fedora beret cuff_bracelet watch_classic belt_leather belt_wide choker necklace_chain pearls tie bow_tie
  reading_glasses sunglasses_aviator sunglasses_wayfarer earrings_drop earrings_hoop fanny_pack`);
const NOT_FOR_TEENS = set('gown cocktail_dress reading_glasses pearls');

const BABY_HAIR = set('buzz_cut short_crop pixie caesar crew_cut');
const TODDLER_HAIR = set(`${[...BABY_HAIR].join(' ')} bob_chin bob_bangs pigtails curly_short afro_short ponytail_low short_textured`);
const NOT_FOR_YOUNG_HAIR = set('receding mullet undercut slick_back mohawk faux_hawk');

const KID_STAGES: readonly LifeStage[] = ['baby', 'toddler', 'child', 'teen'];
/** Whether the stage is a child's (a stage rule applies to what it wears). */
export const isYoungStage = (stage: LifeStage | undefined): boolean => !!stage && KID_STAGES.includes(stage);

/** Whether a person of `stage` may wear/grow the part `id` of this kind. No stage (or an adult one) allows everything but ids nobody knows are allowed too. */
export function partAllowedForStage(kind: PartKind, id: string, stage: LifeStage | undefined): boolean {
  if (!stage || !isYoungStage(stage)) return true;
  if (kind === 'facial') return false;
  if (kind === 'hair') {
    if (stage === 'baby') return BABY_HAIR.has(id);
    if (stage === 'toddler') return TODDLER_HAIR.has(id);
    if (stage === 'teen') return id !== 'receding';
    return !NOT_FOR_YOUNG_HAIR.has(id);
  }
  if (stage === 'baby') return BABY_GARMENTS.has(id);
  if (stage === 'toddler') return TODDLER_GARMENTS.has(id);
  if (stage === 'child') return !NOT_FOR_CHILDREN.has(id);
  return !NOT_FOR_TEENS.has(id);
}

/** The outfit a person of a stage wears when nothing was chosen (slot -> garment id); null = the manifest's own defaults. */
const STAGE_OUTFITS: Partial<Record<LifeStage, ModularOutfit>> = {
  baby: { top: 'tshirt_crew', bottom: 'trousers_straight' },
  toddler: { top: 'tshirt_crew', bottom: 'shorts_mid', shoes: 'sneakers_low' },
};
const STAGE_HAIR: Partial<Record<LifeStage, string>> = { baby: 'buzz_cut' };

/** Default outfit for a stage, limited to garments that exist for the body (adults: the manifest's defaults). */
export function defaultOutfitFor(m: ModularManifest, bodyId: string, stage: LifeStage | undefined): ModularOutfit {
  const want = (stage && STAGE_OUTFITS[stage]) || m.defaults.outfit;
  const out: ModularOutfit = {};
  for (const [slot, id] of Object.entries(want) as Array<[ModularSlot, string]>) {
    const g = findGarment(m, id);
    if (g && g.files[bodyId]) out[slot] = g.id;
  }
  return out;
}

/** Default hairstyle id for a stage and body, or null. */
export function defaultHairFor(m: ModularManifest, bodyId: string, stage: LifeStage | undefined): string | null {
  const id = (stage && STAGE_HAIR[stage]) || m.defaults.hairstyle;
  const h = id ? findHair(m, id) : undefined;
  return h && h.files[bodyId] ? h.id : null;
}

/** Removes what the stage may not wear or grow from a look (a copy is returned); `issues` says what went. Adults pass unchanged. */
export function applyStageRules(look: ModularLook, m: ModularManifest, stage: LifeStage | undefined): { look: ModularLook; issues: string[] } {
  const issues: string[] = [];
  if (!isYoungStage(stage)) return { look, issues };
  const out = structuredClone(look);
  if (out.facialHairId !== null) { issues.push(`Facial hair '${out.facialHairId}' is not for a ${stage}; dropped.`); out.facialHairId = null; }
  if (out.hairId !== null && !partAllowedForStage('hair', out.hairId, stage)) {
    issues.push(`Hairstyle '${out.hairId}' is not for a ${stage}; replaced.`);
    const next = defaultHairFor(m, out.bodyId, stage);
    out.hairId = next && partAllowedForStage('hair', next, stage) ? next : 'short_crop';
    if (!findHair(m, out.hairId)?.files[out.bodyId]) out.hairId = null;
  }
  const base = defaultOutfitFor(m, out.bodyId, stage);
  for (const [cat, src] of Object.entries(out.outfits) as Array<[keyof ModularLook['outfits'], ModularOutfit]>) {
    const kept: ModularOutfit = {};
    let dropped = false;
    for (const [slot, id] of Object.entries(src) as Array<[ModularSlot, string]>) {
      if (partAllowedForStage('garment', id, stage)) kept[slot] = id;
      else { dropped = true; issues.push(`Garment '${id}' is not for a ${stage}; dropped from the ${cat} outfit.`); }
    }
    // a child never ends up without clothes because a piece went
    if (dropped) {
      if (!kept.full && !kept.top && !kept.bottom && base.full) kept.full = base.full;
      if (!kept.full && !kept.top) kept.top = base.top ?? 'tshirt_crew';
      if (!kept.full && !kept.bottom) kept.bottom = base.bottom ?? 'trousers_straight';
    }
    out.outfits[cat] = kept;
  }
  return { look: out, issues };
}
