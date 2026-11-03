// OWNER: content agent (gameplay content). See docs/ARCHITECTURE.md.
//
// Content validation (brief sections 24 and 25 "Content quality"): unique ids, cross references, slot and
// footprint geometry, finishes and palettes, and completeness of every status 'ready' entry.
// Errors are contract violations that must be fixed; warnings point at suspicious but legal data.
// Pure: no DOM, no three.js. Pass the asset manifest's furniture table (opts.models) to also check model
// existence, finish material names and that every scaled model fits inside its footprint.

import { ANIM_IDS } from '../core/anim';
import { STAGE_ORDER } from '../core/lifeStages';
import { NEED_IDS, OUTFIT_CATEGORIES } from '../core/types';
import type { BondStatus, Posture } from '../core/types';
import type {
  CatalogCategory, ContentDB, InteractionDef, ObjectDef, PlacementLayer, PriceTier, SlotKind, SocialCategory, TraitCategory,
} from './types';
import { fittedBounds } from './objects';
import { capabilityInteractions } from './capabilities';

/** Furniture entry of public/assets/manifest.json (only the fields validation needs). */
export interface ManifestModel { min: number[]; max: number[]; materials: Array<{ name: string }> }

export interface ValidationResult { errors: string[]; warnings: string[] }

const TIERS: readonly PriceTier[] = ['budget', 'standard', 'premium', 'luxury'];
const CATEGORIES: readonly CatalogCategory[] = ['seating', 'beds', 'tables', 'storage', 'kitchen', 'bathroom', 'lighting', 'electronics', 'hobby', 'decor', 'outdoor', 'kids', 'stairs'];
const LAYERS: readonly PlacementLayer[] = ['floor', 'rug', 'wall', 'surface', 'ceiling'];
const SLOT_KINDS: readonly SlotKind[] = ['sit', 'sleep', 'use', 'stand'];
const POSTURES: readonly Posture[] = ['standing', 'walking', 'seated', 'lying'];
const SOCIAL_CATEGORIES: readonly SocialCategory[] = ['greeting', 'friendly', 'funny', 'deep', 'support', 'mean', 'romantic', 'family', 'status'];
const TRAIT_CATEGORIES: readonly TraitCategory[] = ['social', 'tidiness', 'energy', 'creativity', 'leisure', 'lifestyle'];
const BOND_STATUSES: readonly BondStatus[] = ['acquaintance', 'friend', 'closeFriend', 'rival', 'partner', 'engaged', 'spouse', 'exPartner'];
const LIFE_STAGE_IDS: readonly string[] = STAGE_ORDER;
const SOCIAL_SECTIONS = ['friendly', 'romantic', 'mean', 'special'];
const PREFERENCE_GROUPS = ['activity', 'music', 'decor', 'food', 'topic'];
/** Source materials that are never recoloured (they carry light, glass or foliage). */
const FIXED_MATERIALS = ['glass', 'lamp', 'plant'];
/** Places an interaction can be restricted to (InteractionDef.venues): any residential lot or a venue type. */
const INTERACTION_PLACES = ['home', 'park', 'cafe', 'gym', 'library', 'arts', 'market'];
const ROOMS = ['kitchen', 'living', 'bedroom', 'bathroom', 'dining', 'study', 'kids', 'outdoor'];

/** Milestone 1 shared object ids (docs/ARCHITECTURE.md): footprint, layer and the interactions they must offer. */
export const M1_OBJECTS: Record<string, { w: number; d: number; layer: PlacementLayer; interactions: string[]; slots?: Partial<Record<SlotKind, number>> }> = {
  'bed-double-oak': { w: 2, d: 2, layer: 'floor', interactions: ['sleep', 'nap'], slots: { sleep: 2 } },
  'bed-single-pine': { w: 1, d: 2, layer: 'floor', interactions: ['sleep', 'nap'], slots: { sleep: 1 } },
  'fridge-standard': { w: 1, d: 1, layer: 'floor', interactions: ['grabSnack', 'cookMeal'], slots: { use: 1 } },
  'stove-basic': { w: 1, d: 1, layer: 'floor', interactions: [], slots: { use: 1 } },
  'counter-basic': { w: 1, d: 1, layer: 'floor', interactions: [] },
  'counter-sink': { w: 1, d: 1, layer: 'floor', interactions: ['washHands'] },
  'table-dining-oak': { w: 2, d: 1, layer: 'floor', interactions: [] },
  'chair-dining-oak': { w: 1, d: 1, layer: 'floor', interactions: ['sit'], slots: { sit: 1 } },
  'sofa-tweed': { w: 2, d: 1, layer: 'floor', interactions: ['sit', 'nap'], slots: { sit: 2 } },
  'armchair-lounge': { w: 1, d: 1, layer: 'floor', interactions: ['sit'], slots: { sit: 1 } },
  'table-coffee': { w: 1, d: 1, layer: 'floor', interactions: [] },
  'tv-stand-low': { w: 2, d: 1, layer: 'floor', interactions: [] },
  'tv-flatscreen': { w: 1, d: 1, layer: 'surface', interactions: ['watchTv'], slots: { use: 1 } },
  'toilet-basic': { w: 1, d: 1, layer: 'floor', interactions: ['useToilet'], slots: { sit: 1 } },
  'shower-stall': { w: 1, d: 1, layer: 'floor', interactions: ['takeShower'], slots: { use: 1 } },
  'bathroom-sink': { w: 1, d: 1, layer: 'floor', interactions: ['washHands'], slots: { use: 1 } },
  'bathroom-mirror': { w: 1, d: 1, layer: 'wall', interactions: ['practiceSpeech'], slots: { use: 1 } },
  'bookcase-open': { w: 1, d: 1, layer: 'floor', interactions: ['readBook'], slots: { use: 1 } },
  'desk-oak': { w: 2, d: 1, layer: 'floor', interactions: [] },
  'chair-desk': { w: 1, d: 1, layer: 'floor', interactions: ['sit'], slots: { sit: 1 } },
  'computer-desktop': { w: 1, d: 1, layer: 'surface', interactions: ['playComputerGames', 'practiceProgramming'], slots: { use: 1 } },
  'wardrobe-tall': { w: 1, d: 1, layer: 'floor', interactions: ['changeOutfit', 'editOutfits'], slots: { use: 1 } },
  'nightstand-oak': { w: 1, d: 1, layer: 'floor', interactions: [] },
  'lamp-floor-round': { w: 1, d: 1, layer: 'floor', interactions: [] },
  'plant-potted': { w: 1, d: 1, layer: 'floor', interactions: ['waterPlant'] },
  'rug-rectangle': { w: 3, d: 2, layer: 'rug', interactions: [] },
  'radio-retro': { w: 1, d: 1, layer: 'surface', interactions: ['listenToMusic'] },
  'trash-can': { w: 1, d: 1, layer: 'floor', interactions: [] },
};

/** Milestone 1 shared interaction ids and their behaviours (docs/ARCHITECTURE.md). */
export const M1_INTERACTIONS: Record<string, string> = {
  sleep: 'sleep', nap: 'rest', sit: 'sit', grabSnack: 'snack', cookMeal: 'cook', eatMeal: 'eatMeal', useToilet: 'toilet',
  takeShower: 'shower', washHands: 'generic', watchTv: 'watchTv', playComputerGames: 'computer', practiceProgramming: 'computer',
  readBook: 'read', listenToMusic: 'generic', practiceSpeech: 'generic', waterPlant: 'generic', changeOutfit: 'changeOutfit',
  editOutfits: 'editOutfits', goToWork: 'goToWork', goHere: 'goHere', danceSolo: 'generic', jogInPlace: 'generic',
  phoneInvite: 'invite', phoneChat: 'phoneChat', leaveLot: 'leaveLot',
};

/** Milestone 1 surface ids that must exist once the surfaces registry is filled. */
export const M1_SURFACES = {
  wall: ['plain-paint', 'subway-tile', 'stripes-regency', 'brick-classic'],
  floor: ['oak-planks', 'checker-tile', 'carpet-plush', 'hex-mosaic', 'stone-pavers'],
  openings: ['door-panel', 'door-glazed', 'window-sash', 'window-wide'],
};

const isHex = (c: unknown): boolean => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
const isCents = (c: unknown): boolean => typeof c === 'number' && Number.isInteger(c) && c >= 0;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const blank = (s: unknown): boolean => typeof s !== 'string' || s.trim() === '';
const has = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

/** Validates the whole content registry. */
export function validateContent(db: ContentDB, opts: { models?: Record<string, ManifestModel> } = {}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(m);
  const warn = (m: string) => warnings.push(m);

  const packIds = new Set(Object.keys(db.packs));
  const checkPacks = (where: string, packs: string[]) => {
    for (const p of packs) if (!packIds.has(p)) warn(`${where}: unknown pack '${p}'`);
  };
  const checkKeyIds = (kind: string, rec: Record<string, { id: string }>) => {
    for (const [k, v] of Object.entries(rec)) if (k !== v.id) err(`${kind} '${k}': registry key does not match id '${v.id}'`);
  };
  for (const [kind, rec] of Object.entries({
    object: db.objects, opening: db.openings, 'wall design': db.wallDesigns, 'floor design': db.floorDesigns, interaction: db.interactions,
    social: db.socials, trait: db.traits, aspiration: db.aspirations, skill: db.skills, career: db.careers, moodlet: db.moodlets,
    recipe: db.recipes, pack: db.packs, hair: db.hair, 'facial hair': db.facialHair, garment: db.garments, accessory: db.accessories,
    event: db.events ?? {}, pattern: db.patterns, 'face preset': db.facePresets, 'body preset': db.bodyPresets, 'brow style': db.browStyles, voice: db.voices,
  })) checkKeyIds(kind, rec as Record<string, { id: string }>);

  // Interactions and socials share the ActionInstance.interactionId namespace.
  for (const id of Object.keys(db.socials)) if (db.interactions[id]) err(`id '${id}' is both an interaction and a social`);

  const moodlet = (where: string, id: string | undefined) => { if (id !== undefined && !db.moodlets[id]) err(`${where}: unknown moodlet '${id}'`); };
  const anim = (where: string, id: string | undefined) => { if (id !== undefined && !has(ANIM_IDS, id)) err(`${where}: unknown anim '${id}'`); };
  const needs = (where: string, rec: Partial<Record<string, number>>) => {
    for (const [k, v] of Object.entries(rec)) {
      if (!has(NEED_IDS, k)) err(`${where}: unknown need '${k}'`);
      if (!finite(v)) err(`${where}: need '${k}' is not a number`);
    }
  };

  // ---- Autonomy tags (used by traits and aspirations) ----
  const autonomyTags = new Set<string>();
  for (const i of Object.values(db.interactions)) for (const t of i.autonomy.tags) autonomyTags.add(t);

  // ---- Interactions ----
  for (const i of Object.values(db.interactions)) validateInteraction(i);

  function validateInteraction(i: InteractionDef): void {
    const w = `interaction '${i.id}'`;
    if (i.status === 'ready' && (blank(i.name) || blank(i.description) || blank(i.icon))) err(`${w}: missing name, description or icon`);
    if (!['object', 'self', 'item', 'tile'].includes(i.kind)) err(`${w}: bad kind '${i.kind}'`);
    if (!has(POSTURES, i.posture)) err(`${w}: bad posture '${i.posture}'`);
    for (const k of i.slotKinds) if (!has(SLOT_KINDS, k)) err(`${w}: bad slot kind '${k}'`);
    if (i.kind !== 'object' && i.slotKinds.length) err(`${w}: only object interactions use slots`);
    anim(w, i.anims.prepare); anim(w, i.anims.perform); anim(w, i.anims.cleanup);
    if (i.duration.kind === 'fixed') {
      if (!finite(i.duration.minutes) || i.duration.minutes < 0) err(`${w}: bad fixed duration`);
    } else {
      if (!has(NEED_IDS, i.duration.need)) err(`${w}: untilFull on unknown need '${i.duration.need}'`);
      else if (!((i.needsPerHour[i.duration.need] ?? 0) > 0)) err(`${w}: untilFull ${i.duration.need} but needsPerHour does not raise it`);
      if (!finite(i.duration.maxMinutes) || i.duration.maxMinutes <= 0) err(`${w}: untilFull needs maxMinutes > 0`);
    }
    needs(`${w} needsPerHour`, i.needsPerHour);
    needs(`${w} needsOnComplete`, i.needsOnComplete);
    needs(`${w} autonomy.ads`, i.autonomy.ads);
    if (i.skill) {
      if (!db.skills[i.skill.id]) err(`${w}: unknown skill '${i.skill.id}'`);
      if (!(i.skill.xpPerHour > 0)) err(`${w}: skill xpPerHour must be > 0`);
    }
    if (i.cost !== undefined && !isCents(i.cost)) err(`${w}: cost must be integer cents >= 0`);
    moodlet(w, i.moodletOnComplete);
    for (const v of i.venues ?? []) if (!INTERACTION_PLACES.includes(v)) err(`${w}: unknown place '${v}' in venues`);
    if (i.status === 'ready' && blank(i.behavior)) err(`${w}: ready interaction without behavior`);
    for (const a of i.ages ?? []) if (!has(LIFE_STAGE_IDS, a)) err(`${w}: unknown life stage '${a}' in ages`);
    const m1 = M1_INTERACTIONS[i.id];
    if (m1 && i.behavior !== m1) err(`${w}: M1 contract expects behavior '${m1}', got '${i.behavior}'`);
  }
  for (const id of Object.keys(M1_INTERACTIONS)) if (!db.interactions[id]) err(`missing M1 interaction '${id}'`);

  // ---- Objects ----
  const offeredBy = new Map<string, number>();
  for (const o of Object.values(db.objects)) validateObject(o);
  for (const [id, spec] of Object.entries(M1_OBJECTS)) {
    const o = db.objects[id];
    if (!o) { err(`missing M1 object '${id}'`); continue; }
    if (o.footprint.w !== spec.w || o.footprint.d !== spec.d) err(`object '${id}': M1 contract footprint is ${spec.w}x${spec.d}`);
    if (o.layer !== spec.layer) err(`object '${id}': M1 contract layer is '${spec.layer}'`);
    for (const i of spec.interactions) if (!o.interactions.includes(i)) err(`object '${id}': M1 contract requires interaction '${i}'`);
    for (const [kind, n] of Object.entries(spec.slots ?? {})) {
      if (o.slots.filter((s) => s.kind === kind).length !== n) err(`object '${id}': M1 contract requires ${n} '${kind}' slot(s)`);
    }
    if (o.status !== 'ready') err(`object '${id}': M1 objects must be ready`);
  }
  for (const i of Object.values(db.interactions)) {
    if (i.kind === 'object' && i.status === 'ready' && !offeredBy.get(i.id)) warn(`interaction '${i.id}': no ready object offers it`);
  }

  function validateObject(o: ObjectDef): void {
    const w = `object '${o.id}'`;
    const ready = o.status === 'ready';
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(o.id)) warn(`${w}: id is not kebab-case`);
    if (ready && (blank(o.name) || blank(o.description) || blank(o.style))) err(`${w}: missing name, description or style`);
    if (ready && o.tags.length === 0) err(`${w}: needs tags`);
    if (ready && o.rooms.length === 0) err(`${w}: needs rooms`);
    for (const r of o.rooms) if (!ROOMS.includes(r)) warn(`${w}: unusual room '${r}'`);
    if (!has(CATEGORIES, o.category)) err(`${w}: bad category '${o.category}'`);
    if (!has(TIERS, o.tier)) err(`${w}: bad tier '${o.tier}'`);
    if (!isCents(o.price) || o.price <= 0) err(`${w}: price must be positive integer cents`);
    if (!Number.isInteger(o.quality) || o.quality < 1 || o.quality > 5) err(`${w}: quality must be 1..5`);
    checkPacks(w, o.packs);
    const { w: fw, d: fd } = o.footprint;
    if (!Number.isInteger(fw) || !Number.isInteger(fd) || fw < 1 || fd < 1) err(`${w}: footprint must be whole tiles`);
    if (!has(LAYERS, o.layer)) err(`${w}: bad layer '${o.layer}'`);
    if (o.layer === 'wall' && (!o.needsWall || o.blocksMovement)) err(`${w}: wall items need needsWall and must not block movement`);
    if ((o.layer === 'rug' || o.layer === 'surface' || o.layer === 'ceiling') && o.blocksMovement) err(`${w}: ${o.layer} items must not block movement`);
    if (!(o.height > 0)) err(`${w}: height must be > 0`);
    if (o.surfaceHeight !== undefined && (!(o.surfaceHeight > 0) || o.surfaceHeight > o.height + 0.05)) err(`${w}: surfaceHeight out of range`);

    // model
    const m = o.model;
    if (blank(m.asset) || !(m.scale > 0) || !finite(m.yaw) || m.offset.length !== 3 || !m.offset.every(finite)) err(`${w}: incomplete model transform`);
    const entry = opts.models?.[m.asset];
    // Milestone 9: 'proc:' assets are meshes built at runtime (render/stairModel.ts), not manifest models
    if (opts.models && !entry && !m.asset.startsWith('proc:')) err(`${w}: model '${m.asset}' is not in the asset manifest`);
    if (o.stair) {
      const st = o.stair;
      if (st.length !== 3 && st.length !== 4) err(`${w}: stair length must be 3 or 4`);
      if (st.kind !== 'straight' && st.kind !== 'spiral') err(`${w}: stair kind must be straight or spiral`);
      if (st.kind === 'straight' && (fd !== st.length || fw > 2)) err(`${w}: a straight stair is 1 or 2 wide and as deep as its length (${st.length})`);
      if (st.kind === 'spiral' && (fw !== 2 || fd !== 2)) err(`${w}: a spiral stair has a 2 x 2 footprint`);
      if (o.layer !== 'floor' || !o.blocksMovement) err(`${w}: stairs are blocking floor objects`);
    }
    if (entry) {
      const b = fittedBounds(m, [[entry.min[0] ?? 0, entry.min[1] ?? 0, entry.min[2] ?? 0], [entry.max[0] ?? 0, entry.max[1] ?? 0, entry.max[2] ?? 0]]);
      const tol = 0.02;
      if (b && (b.x0 < -tol || b.z0 < -tol || b.x1 > fw + tol || b.z1 > fd + tol)) {
        err(`${w}: scaled model (${b.x0.toFixed(2)}..${b.x1.toFixed(2)} x ${b.z0.toFixed(2)}..${b.z1.toFixed(2)}) leaves its ${fw}x${fd} footprint`);
      }
      if (b && b.y0 < -tol) err(`${w}: model sinks below the floor (${b.y0.toFixed(3)})`);
      if (b && o.layer !== 'wall' && o.layer !== 'ceiling' && b.y0 > tol) warn(`${w}: model floats ${b.y0.toFixed(3)} m above the floor`);
      if (b && Math.abs(b.y1 - o.height) > 0.03) warn(`${w}: height ${o.height} differs from the model top ${b.y1.toFixed(3)}`);
    }

    for (const [cx, cz] of o.openCells ?? []) {
      if (!Number.isInteger(cx) || !Number.isInteger(cz) || cx < 0 || cz < 0 || cx >= fw || cz >= fd) err(`${w}: open cell (${cx},${cz}) is outside the footprint`);
    }
    if (o.openCells?.length && (o.layer !== 'floor' || !o.blocksMovement)) err(`${w}: open cells only make sense on blocking floor objects`);

    // slots
    const slotIds = new Set<string>();
    for (const s of o.slots) {
      const sw = `${w} slot '${s.id}'`;
      if (slotIds.has(s.id)) err(`${sw}: duplicate slot id`);
      slotIds.add(s.id);
      if (!has(SLOT_KINDS, s.kind)) err(`${sw}: bad kind '${s.kind}'`);
      if (!has(POSTURES, s.posture)) err(`${sw}: bad posture '${s.posture}'`);
      if (!s.pos.every(finite) || !finite(s.height) || s.height < 0 || !finite(s.facing)) err(`${sw}: bad anchor`);
      const [ax, az] = s.approach;
      if (!Number.isInteger(ax) || !Number.isInteger(az)) err(`${sw}: approach must be a whole tile`);
      const inside = ax >= 0 && ax < fw && az >= 0 && az < fd;
      const openCell = (o.openCells ?? []).some(([cx, cz]) => cx === ax && cz === az);
      if (inside && o.blocksMovement && !openCell) err(`${sw}: approach tile (${ax},${az}) is inside the blocking footprint`);
      if (ax < -1 || az < -1 || ax > fw || az > fd) warn(`${sw}: approach tile (${ax},${az}) is not next to the footprint`);
      if ((s.kind === 'sit' || s.kind === 'sleep') && (s.pos[0] < 0 || s.pos[0] > fw || s.pos[1] < 0 || s.pos[1] > fd)) err(`${sw}: seat/bed anchor outside the footprint`);
      if (s.kind === 'sleep' && s.posture !== 'lying') err(`${sw}: sleep slots are lying`);
      if (s.kind === 'sit' && s.posture !== 'seated') err(`${sw}: sit slots are seated`);
    }

    // interactions
    for (const id of o.interactions) {
      const i = db.interactions[id];
      if (!i) { err(`${w}: unknown interaction '${id}'${db.socials[id] ? ' (that is a social)' : ''}`); continue; }
      if (i.kind !== 'object') err(`${w}: interaction '${id}' is not an object interaction`);
      if (ready && i.status !== 'ready') err(`${w}: ready object promises unfinished interaction '${id}'`);
      if (i.slotKinds.length && !o.slots.some((s) => i.slotKinds.includes(s.kind))) err(`${w}: '${id}' needs a ${i.slotKinds.join('/')} slot`);
      if (ready) offeredBy.set(id, (offeredBy.get(id) ?? 0) + 1);
    }
    // Tag capabilities (cleaning, repairs) are offered without being listed; they need their interactions to exist.
    for (const id of capabilityInteractions(o)) {
      const i = db.interactions[id];
      if (!i) { err(`${w}: tag capability needs interaction '${id}'`); continue; }
      if (ready) offeredBy.set(id, (offeredBy.get(id) ?? 0) + 1);
    }
    if (!o.functional && o.interactions.length) err(`${w}: decorative objects (functional false) must not offer interactions`);
    if (o.functional && !o.interactions.length && o.surfaceHeight === undefined && o.slots.length === 0) err(`${w}: functional object without interactions, slots or surface`);

    // stats
    for (const [k, v] of Object.entries(o.stats)) if (!finite(v)) err(`${w}: stat '${k}' is not a number`);
    if (o.stats.comfort !== undefined && (o.stats.comfort < 0 || o.stats.comfort > 10)) err(`${w}: comfort must be 0..10`);
    if (o.stats.environment !== undefined && (o.stats.environment < -5 || o.stats.environment > 10)) err(`${w}: environment must be -5..10`);

    // finishes
    const regionIds = new Set<string>();
    const modelMats = entry ? new Set(entry.materials.map((x) => x.name)) : null;
    for (const r of o.finishes) {
      const rw = `${w} finish '${r.id}'`;
      if (regionIds.has(r.id)) err(`${rw}: duplicate region id`);
      regionIds.add(r.id);
      if (blank(r.label)) err(`${rw}: missing label`);
      if (r.materials.length === 0) err(`${rw}: no materials`);
      if (r.swatches.length === 0) err(`${rw}: empty palette`);
      else if (r.swatches.length < 6) warn(`${rw}: fewer than 6 swatches`);
      const swIds = new Set<string>();
      for (const s of r.swatches) {
        if (swIds.has(s.id)) err(`${rw}: duplicate swatch '${s.id}'`);
        swIds.add(s.id);
        if (!isHex(s.color)) err(`${rw}: swatch '${s.id}' colour '${s.color}' is not #rrggbb`);
        if (blank(s.name)) err(`${rw}: swatch '${s.id}' has no name`);
      }
      for (const mat of r.materials) {
        if (FIXED_MATERIALS.includes(mat)) err(`${rw}: material '${mat}' must not be recoloured`);
        if (modelMats && !modelMats.has(mat)) err(`${rw}: model '${m.asset}' has no material '${mat}'`);
      }
    }
  }

  // ---- Socials ----
  const preferenceIds = new Set(db.preferences.map((p) => p.id));
  for (const s of Object.values(db.socials)) {
    const w = `social '${s.id}'`;
    const ready = s.status === 'ready';
    if (ready && (blank(s.name) || blank(s.description) || blank(s.icon))) err(`${w}: missing name, description or icon`);
    if (!has(SOCIAL_CATEGORIES, s.category)) err(`${w}: bad category '${s.category}'`);
    if (!(s.minutes > 0)) err(`${w}: minutes must be > 0`);
    anim(w, s.anim);
    if (!(s.acceptance >= 0 && s.acceptance <= 1)) err(`${w}: acceptance must be 0..1`);
    for (const t of [...Object.keys(s.targetTraits), ...Object.keys(s.actorTraits)]) if (!db.traits[t]) err(`${w}: unknown trait '${t}'`);
    const r = s.requires;
    for (const st of [...(r.status ?? []), ...(r.notStatus ?? [])]) if (!has(BOND_STATUSES, st)) err(`${w}: bad bond status '${st}'`);
    if (r.minFamiliarity !== undefined && r.maxFamiliarity !== undefined && r.minFamiliarity > r.maxFamiliarity) err(`${w}: familiarity range is empty`);
    if (r.minFriendship !== undefined && r.maxFriendship !== undefined && r.minFriendship > r.maxFriendship) err(`${w}: friendship range is empty`);
    for (const [label, o] of [['success', s.success], ['failure', s.failure]] as const) {
      moodlet(`${w} ${label}`, o.actorMoodlet);
      moodlet(`${w} ${label}`, o.targetMoodlet);
      if (!finite(o.social)) err(`${w} ${label}: social gain must be a number`);
      for (const d of [o.actor, o.target]) for (const [k, v] of Object.entries(d)) if (!finite(v)) err(`${w} ${label}: ${k} is not a number`);
      if (o.memory && (blank(o.memory.text) || ![1, 2, 3].includes(o.memory.importance))) err(`${w} ${label}: bad memory`);
      if (o.setStatus !== undefined && !has(BOND_STATUSES, o.setStatus)) err(`${w} ${label}: bad setStatus '${o.setStatus}'`);
    }
    if (s.failure.setStatus) err(`${w}: status changes require acceptance (failure must not set a status)`);
    if (ready && (s.lines.success.length < 2 || s.lines.failure.length < 2)) err(`${w}: needs at least 2 success and 2 failure lines`);
    for (const line of [...s.lines.success, ...s.lines.failure]) {
      const bad = line.match(/\{(?!a\}|b\})[^}]*\}/);
      if (bad) err(`${w}: unknown placeholder ${bad[0]} in "${line}"`);
      if (!line.includes('{a}') && !line.includes('{b}')) warn(`${w}: line names nobody: "${line}"`);
    }
    for (const t of s.topics) if (t.startsWith('topic:') && !preferenceIds.has(t)) err(`${w}: unknown topic preference '${t}'`);
    if (!(s.autonomy.weight >= 0)) err(`${w}: autonomy weight must be >= 0`);
    for (const k of ['minTrust', 'maxTrust'] as const) if (r[k] !== undefined && !finite(r[k])) err(`${w}: ${k} is not a number`);
    if (r.minTrust !== undefined && r.maxTrust !== undefined && r.minTrust > r.maxTrust) err(`${w}: trust range is empty`);
    for (const st of [...(r.actorStages ?? []), ...(r.targetStages ?? [])]) if (!has(LIFE_STAGE_IDS, st)) err(`${w}: unknown life stage '${st}'`);
    if (r.memory && (r.memory.kinds.length === 0 || !(r.memory.withinMinutes > 0))) err(`${w}: bad memory requirement`);
    if (s.section !== undefined && !has(SOCIAL_SECTIONS, s.section)) err(`${w}: bad menu section '${s.section}'`);
    if (s.cost !== undefined && !(Number.isInteger(s.cost) && s.cost > 0)) err(`${w}: cost must be a positive whole number of cents`);
    if (s.startsEvent !== undefined && !db.events?.[s.startsEvent]) err(`${w}: unknown event '${s.startsEvent}'`);
    if (r.romantic && s.category !== 'romantic' && s.category !== 'status') err(`${w}: romantic requirement outside the romantic and status categories`);
    if (s.category === 'romantic' && ready && !r.romantic && !r.status) err(`${w}: romantic socials must require romantic: true (adults and interest)`);
  }

  // ---- Schools (Milestone 8) ----
  for (const sc of Object.values(db.schools ?? {})) {
    const w = `school '${sc.id}'`;
    if (sc.status === 'ready' && (blank(sc.name) || blank(sc.description) || blank(sc.icon))) err(`${w}: missing name, description or icon`);
    if (sc.stages.length === 0) err(`${w}: needs at least one life stage`);
    for (const st of sc.stages) if (!has(LIFE_STAGE_IDS, st)) err(`${w}: unknown life stage '${st}'`);
    if (sc.days.length === 0 || sc.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) err(`${w}: days must be 0..6`);
    if (!(sc.start >= 0 && sc.end > sc.start && sc.end <= 24 * 60)) err(`${w}: bad school hours`);
  }

  // ---- Events ----
  const GOAL_KINDS = ['chat', 'eat', 'romantic', 'laugh', 'mingle', 'reconcile'];
  for (const e of Object.values(db.events ?? {})) {
    const w = `event '${e.id}'`;
    if (e.status === 'ready' && (blank(e.name) || blank(e.description) || blank(e.icon))) err(`${w}: missing name, description or icon`);
    if (!(e.minGuests >= 1 && e.maxGuests >= e.minGuests)) err(`${w}: bad guest range`);
    if (!(e.minutes >= 30) || !(e.leadMinutes >= 0)) err(`${w}: bad duration`);
    if (!Number.isInteger(e.cateringPerPerson) || e.cateringPerPerson < 0) err(`${w}: cateringPerPerson must be whole cents`);
    if (e.goals.length === 0) err(`${w}: needs at least one goal`);
    for (const g of e.goals) {
      if (!GOAL_KINDS.includes(g.kind)) err(`${w}: bad goal kind '${g.kind}'`);
      if (blank(g.text) || !(g.target > 0) || !(g.weight > 0)) err(`${w}: incomplete goal '${g.kind}'`);
      if (g.kind === 'eat' && e.cateringPerPerson === 0) warn(`${w}: has an eat goal but serves no food`);
    }
    moodlet(`${w} reward`, e.reward.moodlet);
    moodlet(`${w} reward`, e.reward.badMoodlet);
    if (blank(e.reward.memory.text) || blank(e.reward.memory.badText)) err(`${w}: memory texts missing`);
  }

  // ---- Traits ----
  for (const t of Object.values(db.traits)) {
    const w = `trait '${t.id}'`;
    if (t.status === 'ready' && (blank(t.name) || blank(t.description) || blank(t.icon))) err(`${w}: missing name, description or icon`);
    if (!has(TRAIT_CATEGORIES, t.category)) err(`${w}: bad category '${t.category}'`);
    for (const c of t.conflicts) {
      if (c === t.id) err(`${w}: conflicts with itself`);
      else if (!db.traits[c]) err(`${w}: unknown conflict '${c}'`);
      else if (!db.traits[c].conflicts.includes(t.id)) err(`${w}: conflict with '${c}' is not symmetric`);
    }
    const e = t.effects;
    const count = Object.keys(e.needDecay ?? {}).length + Object.keys(e.autonomyBias ?? {}).length + Object.keys(e.skillRate ?? {}).length +
      Object.keys(e.socialReceive ?? {}).length + Object.keys(e.enjoys ?? {}).length + (e.workPerformance ? 1 : 0);
    if (count === 0) err(`${w}: needs at least one effect`);
    for (const [k, v] of Object.entries(e.needDecay ?? {})) if (!has(NEED_IDS, k) || !(v > 0)) err(`${w}: bad needDecay '${k}'`);
    for (const [k, v] of Object.entries(e.skillRate ?? {})) if (!db.skills[k] || !(v > 0)) err(`${w}: bad skillRate '${k}'`);
    for (const [k, v] of Object.entries(e.socialReceive ?? {})) if (!has(SOCIAL_CATEGORIES, k) || !(Math.abs(v) <= 1)) err(`${w}: bad socialReceive '${k}'`);
    for (const [k, v] of Object.entries(e.autonomyBias ?? {})) {
      const known = db.interactions[k] || db.socials[k] || autonomyTags.has(k) || k === 'social';
      if (!known || !(v > 0)) err(`${w}: autonomyBias key '${k}' is not an interaction, social or autonomy tag`);
    }
    for (const [k, v] of Object.entries(e.enjoys ?? {})) if (!autonomyTags.has(k) || !(v > 0)) err(`${w}: enjoys key '${k}' is not an autonomy tag`);
    if (e.workPerformance !== undefined && !finite(e.workPerformance)) err(`${w}: bad workPerformance`);
    if (t.effectText.length === 0 || t.effectText.some(blank)) err(`${w}: needs effectText`);
  }

  // ---- Skills ----
  for (const s of Object.values(db.skills)) {
    const w = `skill '${s.id}'`;
    if (blank(s.name) || blank(s.description)) err(`${w}: missing name or description`);
    if (s.thresholds.length !== 9) err(`${w}: needs 9 thresholds (levels 2..10)`);
    s.thresholds.forEach((x, i) => {
      if (!Number.isInteger(x) || x <= 0 || (i > 0 && x <= (s.thresholds[i - 1] ?? 0))) err(`${w}: thresholds must be increasing positive integers`);
    });
    for (const u of s.unlocks) if (!(u.level >= 1 && u.level <= 10) || blank(u.text)) err(`${w}: bad unlock`);
    if (s.status === 'dev') for (const u of s.unlocks) if (!u.text.includes('(later)')) warn(`${w}: unfinished skill promises "${u.text}"`);
  }

  // ---- Careers ----
  for (const c of Object.values(db.careers)) {
    const w = `career '${c.id}'`;
    if (blank(c.name) || blank(c.description)) err(`${w}: missing name or description`);
    for (const s of c.skills) if (!db.skills[s]) err(`${w}: unknown skill '${s}'`);
    if (c.status === 'ready' && c.levels.length !== (c.partTime ? 3 : 10)) {
      err(`${w}: ready ${c.partTime ? 'part-time jobs need 3 levels' : 'careers need 10 levels'}`);
    }
    c.levels.forEach((l, i) => {
      const lw = `${w} level ${l.level}`;
      if (l.level !== i + 1) err(`${lw}: levels must be numbered 1..n in order`);
      if (blank(l.title)) err(`${lw}: missing title`);
      if (!isCents(l.hourlyWage) || l.hourlyWage <= 0) err(`${lw}: hourlyWage must be positive integer cents`);
      const prev = c.levels[i - 1];
      if (prev && l.hourlyWage < prev.hourlyWage) warn(`${lw}: pays less than the level below`);
      if (l.days.length === 0 || l.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6) || new Set(l.days).size !== l.days.length) err(`${lw}: bad days`);
      if (!(l.start >= 0 && l.end <= 1440 && l.end > l.start)) err(`${lw}: shift must start and end on the same day`);
      if (!(l.promotion.performance >= -100 && l.promotion.performance <= 100)) err(`${lw}: promotion performance must be -100..100`);
      for (const [sk, lv] of Object.entries(l.promotion.skills)) if (!db.skills[sk] || !(lv >= 1 && lv <= 10)) err(`${lw}: bad promotion skill '${sk}'`);
      for (const p of l.perks ?? []) if (blank(p)) err(`${lw}: blank perk`);
      if (l.promotion.relationship) {
        const rel = l.promotion.relationship;
        if (!(rel.minFriendship >= 0 && rel.minFriendship <= 100) || blank(rel.label)) err(`${lw}: bad promotion relationship`);
      }
    });
  }
  if (!db.careers.culinary || db.careers.culinary.levels.length !== 10) err(`missing M1 career 'culinary' with 10 levels`);

  // ---- Career events ----
  for (const e of Object.values(db.careerEvents ?? {})) {
    const w = `career event '${e.id}'`;
    if (blank(e.title) || blank(e.text)) err(`${w}: missing title or text`);
    if (e.options.length < 2) err(`${w}: needs at least two options`);
    const ids = new Set<string>();
    for (const o of e.options) {
      const ow = `${w} option '${o.id}'`;
      if (blank(o.id) || blank(o.label) || blank(o.description) || blank(o.result)) err(`${ow}: missing text`);
      if (ids.has(o.id)) err(`${ow}: duplicate option id`);
      ids.add(o.id);
      if (!finite(o.performance) || Math.abs(o.performance) > 100) err(`${ow}: bad performance`);
      if (o.pay !== undefined && (!Number.isInteger(o.pay) || Math.abs(o.pay) > 100000)) err(`${ow}: pay must be signed integer cents`);
      if (o.moodlet !== undefined) moodlet(ow, o.moodlet);
      if (o.skill) {
        if (!db.skills[o.skill.id] || !(o.skill.xp > 0)) err(`${ow}: bad skill reward`);
      }
    }
  }

  // ---- Aspirations ----
  const objectTags = new Set<string>();
  for (const o of Object.values(db.objects)) if (o.status === 'ready') for (const t of o.tags) objectTags.add(t);
  for (const a of Object.values(db.aspirations)) {
    const w = `aspiration '${a.id}'`;
    if (blank(a.name) || blank(a.description)) err(`${w}: missing name or description`);
    if (a.stages.length === 0) err(`${w}: needs stages`);
    else if (a.status === 'ready' && a.stages.length !== 3) warn(`${w}: has ${a.stages.length} stages (expected 3)`);
    const objIds = new Set<string>();
    for (const st of a.stages) {
      if (blank(st.name)) err(`${w}: stage without name`);
      if (st.objectives.length === 0) err(`${w} stage '${st.name}': no objectives`);
      if (!isCents(st.reward.money) || blank(st.reward.text)) err(`${w} stage '${st.name}': bad reward`);
      moodlet(`${w} reward`, st.reward.moodlet);
      for (const ob of st.objectives) {
        const ow = `${w} objective '${ob.id}'`;
        if (objIds.has(ob.id)) err(`${ow}: duplicate objective id`);
        objIds.add(ob.id);
        if (blank(ob.text)) err(`${ow}: missing text`);
        switch (ob.type) {
          case 'skill': if (!db.skills[ob.skillId] || !(ob.level >= 2 && ob.level <= 10)) err(`${ow}: bad skill objective`); break;
          case 'interactionCount': {
            const [prefix, rest] = ob.match.includes(':') ? ob.match.split(':', 2) as [string, string] : ['', ob.match];
            const ok = prefix === 'tag' ? autonomyTags.has(rest) : prefix === 'category' ? has(SOCIAL_CATEGORIES, rest) : !!(db.interactions[rest] || db.socials[rest]);
            if (!ok) err(`${ow}: match '${ob.match}' resolves to nothing`);
            if (!(ob.count >= 1)) err(`${ow}: count must be >= 1`);
            break;
          }
          case 'friends': if (!(ob.count >= 1) || !(ob.minFriendship >= -100 && ob.minFriendship <= 100)) err(`${ow}: bad friends objective`); break;
          case 'funds': case 'homeValue': if (!isCents(ob.amount) || ob.amount <= 0) err(`${ow}: amount must be positive cents`); break;
          case 'careerLevel': if (!(ob.level >= 1 && ob.level <= 10)) err(`${ow}: level must be 1..10`); break;
          case 'ownObjects': if (!objectTags.has(ob.tag) || !(ob.count >= 1)) err(`${ow}: no ready object has tag '${ob.tag}'`); break;
          case 'bond': if (!has(BOND_STATUSES, ob.status)) err(`${ow}: bad bond status`); break;
        }
      }
    }
  }

  // ---- Moodlets, recipes, packs, preferences ----
  for (const md of Object.values(db.moodlets)) {
    if (blank(md.name) || blank(md.description) || !finite(md.value) || md.value === 0 || !(md.minutes >= 0)) err(`moodlet '${md.id}': incomplete`);
  }
  for (const r of Object.values(db.recipes)) {
    const w = `recipe '${r.id}'`;
    if (blank(r.name) || blank(r.description)) err(`${w}: missing name or description`);
    if (!(r.minutes > 0) || !isCents(r.cost) || r.cost <= 0 || !Number.isInteger(r.servings) || r.servings < 1) err(`${w}: bad minutes, cost or servings`);
    if (!(r.hunger > 0 && r.hunger <= 100)) err(`${w}: hunger must be 1..100`);
    if (!(r.minCookingLevel >= 0 && r.minCookingLevel <= 10)) err(`${w}: minCookingLevel must be 0..10`);
  }
  for (const p of Object.values(db.packs)) if (blank(p.name) || blank(p.description)) err(`pack '${p.id}': missing name or description`);
  const prefSeen = new Set<string>();
  for (const p of db.preferences) {
    if (prefSeen.has(p.id)) err(`preference '${p.id}': duplicate id`);
    prefSeen.add(p.id);
    if (!PREFERENCE_GROUPS.includes(p.group) || !p.id.startsWith(`${p.group}:`) || blank(p.name)) err(`preference '${p.id}': bad group or name`);
  }

  // ---- Surfaces and openings (surfaces module data) ----
  for (const [kind, rec] of [['wall', db.wallDesigns], ['floor', db.floorDesigns]] as const) {
    for (const d of Object.values(rec)) {
      const w = `${kind} design '${d.id}'`;
      if (d.surface !== kind) err(`${w}: surface is '${d.surface}'`);
      if (d.status === 'ready' && (blank(d.name) || blank(d.description) || blank(d.painter) || blank(d.family))) err(`${w}: missing name, description, family or painter`);
      if (!has(TIERS, d.tier)) err(`${w}: bad tier`);
      if (!isCents(d.price)) err(`${w}: price must be integer cents`);
      if (!(d.repeat > 0)) err(`${w}: repeat must be > 0`);
      if (d.palettes.length === 0) err(`${w}: empty palette list`);
      const ids = new Set<string>();
      for (const p of d.palettes) {
        if (ids.has(p.id)) err(`${w}: duplicate palette '${p.id}'`);
        ids.add(p.id);
        if (p.colors.length === 0 || !p.colors.every(isHex)) err(`${w}: palette '${p.id}' needs #rrggbb colours`);
      }
      checkPacks(w, d.packs);
    }
  }
  for (const o of Object.values(db.openings)) {
    const w = `opening '${o.id}'`;
    if (o.kind !== 'door' && o.kind !== 'window') err(`${w}: bad kind`);
    if (!Number.isInteger(o.width) || o.width < 1 || !(o.height > 0) || !(o.sill >= 0) || o.sill + o.height > 2.8 + 1e-6) err(`${w}: bad size`);
    if (!isCents(o.price)) err(`${w}: price must be integer cents`);
    if (!has(TIERS, o.tier)) err(`${w}: bad tier`);
    checkPacks(w, o.packs);
  }
  // M1 surface ids, checked once the surfaces registry has content.
  if (Object.keys(db.wallDesigns).length) for (const id of M1_SURFACES.wall) if (!db.wallDesigns[id]) err(`missing M1 wall design '${id}'`);
  if (Object.keys(db.floorDesigns).length) for (const id of M1_SURFACES.floor) if (!db.floorDesigns[id]) err(`missing M1 floor design '${id}'`);
  if (Object.keys(db.openings).length) for (const id of M1_SURFACES.openings) if (!db.openings[id]) err(`missing M1 opening '${id}'`);

  // ---- Character content (characters module data) ----
  for (const g of Object.values(db.garments)) {
    const w = `garment '${g.id}'`;
    if (blank(g.name)) err(`${w}: missing name`);
    if (!['top', 'bottom', 'full', 'outer', 'shoes'].includes(g.layer)) err(`${w}: bad layer`);
    for (const c of g.categories) if (!has(OUTFIT_CATEGORIES, c)) err(`${w}: bad outfit category '${c}'`);
    for (const p of g.patterns) if (p !== 'solid' && !db.patterns[p]) err(`${w}: unknown pattern '${p}'`);
    if (!isHex(g.defaultColor)) err(`${w}: defaultColor must be #rrggbb`);
  }
  for (const a of Object.values(db.accessories)) if (blank(a.name) || !isHex(a.defaultColor)) err(`accessory '${a.id}': missing name or bad colour`);
  for (const hd of Object.values(db.hair)) if (blank(hd.name)) err(`hair '${hd.id}': missing name`);
  for (const p of [...db.faceParams, ...db.bodyParams]) if (!(p.max > p.min) || !(p.step > 0)) err(`param '${p.id}': bad range`);
  for (const [label, list] of [['skin tone', db.skinTones], ['hair colour', db.hairColors], ['eye colour', db.eyeColors]] as const) {
    for (const s of list) if (!isHex(s.color)) err(`${label} '${s.id}': colour must be #rrggbb`);
  }
  for (const bp of Object.values(db.bodyPresets)) if (bp.frame !== 'a' && bp.frame !== 'b') err(`body preset '${bp.id}': bad frame`);

  return { errors, warnings };
}
