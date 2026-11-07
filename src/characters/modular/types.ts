/**
 * Data contract of the modular (GLB-part) characters: the runtime manifest written by the authoring pipeline
 * (tools/characters/) and the serializable look stored on a person's Appearance.
 *
 * Runtime assets live under public/assets/characters/modular/ and are listed in its manifest.json.
 * Every id here is stable: regenerating an asset keeps its id and filename, so saved people keep their look.
 */
import type { Hex, OutfitCategory } from '../../core/types';

/** Version of `ModularLook`. Bump it and add a step to `migrateModularLook` (look.ts) when the shape changes. */
export const MODULAR_LOOK_VERSION = 1;

/** Body regions, one skinned mesh `Body_<region>` each in a body GLB; garments hide the ones they fully cover. */
export const BODY_REGIONS = [
  'head', 'neck', 'chest', 'belly', 'hips', 'upperarm_l', 'upperarm_r', 'forearm_l', 'forearm_r',
  'hand_l', 'hand_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r',
] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number];

/** Outfit slots of the modular catalog. 'full' (one-piece) excludes 'top' and 'bottom'. */
export const MODULAR_SLOTS = ['top', 'bottom', 'outer', 'full', 'shoes'] as const;
export type ModularSlot = (typeof MODULAR_SLOTS)[number];

/** A named color region of a part: the material(s) it recolors and its default color. */
export interface ColorRegionDef {
  id: string;
  label: string;
  /** Material names in the part's GLB (cloned per character before recoloring). */
  materials: string[];
  default: Hex;
  /** Palette offered by the creator; empty = free color. */
  palette?: Hex[];
}

/** A skeleton profile: joint names in order plus the body files whose bind pose defines it. */
export interface RigProfile {
  id: string;
  label: string;
  joints: string[];
  /** Max world-space difference (metres) between a part's inverse bind matrix translation and the body's. */
  bindTolerance: number;
  /** Max rotation difference (degrees) between a part's inverse bind rotation and the body's. */
  bindToleranceDeg: number;
  /**
   * Length (metres) of the pelvis bone's rest local translation in the rig the shared clips were authored on. A body whose
   * own pelvis differs gets the clips' `.position` tracks scaled by the ratio (retarget.ts); absent = clips used unchanged.
   */
  clipPelvisHeight?: number;
}

export interface BodyPresetDef {
  id: string;
  label: string;
  rig: string;
  /** Path relative to the modular asset root. */
  file: string;
  /** Materials recolored by the skin color. */
  skinMaterials: string[];
  /** Morph targets the creator may drive (continuous 0..1 unless `range` says otherwise). Empty until authored. */
  morphs: Array<{ id: string; label: string; target: string; range: [number, number]; group: 'face' | 'body' }>;
  height: number;
  /**
   * Skin materials' color = skin color x tone x skinGain (default 1). The skin texture is normalised
   * (tools/characters/bake_skin.py) so that this gain makes a reference texel exactly the chosen skin colour.
   */
  skinGain?: number;
  /** Materials (in the body GLB) of the eyes: `look.colors.eyes` tints their iris only (see `iris`). */
  eyeMaterials?: string[];
  /**
   * Iris region of the eye material's map, in UV space: `center`, outer `radius`, edge `feather`, `pupil` radius (kept
   * untinted) and `refLuminance` (linear luminance of the iris texture that maps to the exact eye colour).
   */
  iris?: { center: [number, number]; radius: number; feather: number; pupil: number; refLuminance: number };
  /** Materials (in the body GLB) of the eyebrows: colored with `look.colors.hair`. */
  browMaterials?: string[];
  /** True for stand-ins used until the real Quaternius base characters are supplied. */
  temporary?: boolean;
  thumbnail?: string;
  license: string;
  source: string;
}

export interface GarmentDef {
  id: string;
  label: string;
  category: 'top' | 'bottom' | 'outer' | 'full' | 'shoes';
  slot: ModularSlot;
  /** Body preset id -> GLB path. A garment is only offered on the bodies it was fitted to. */
  files: Record<string, string>;
  rig: string;
  /** Whole regions hidden while worn (fully covered, so no skin can show through). Usually empty: see `covers`. */
  hides: BodyRegion[];
  /**
   * Body preset id -> path of a cover mask (CoverMaskFile JSON): the body vertices this garment covers on that body,
   * measured at the bind pose by tools/characters/cover-masks.mjs. The game hides exactly those vertices while the
   * garment is worn, so no skin pokes through and no hole opens where the garment ends.
   */
  covers?: Record<string, string>;
  /** Draw order inside one outfit (higher = further out). */
  layer: number;
  /** Slots that cannot be worn together with this garment. */
  conflicts: ModularSlot[];
  colorRegions: ColorRegionDef[];
  thumbnail?: string;
  /** Editable source (pattern parameters / .blend) in authoring/characters/. */
  source: string;
  license: string;
  /** Morph values of the body this garment follows (see BodyPresetDef.morphs); absent = only the neutral body. */
  followsMorphs?: string[];
}

export interface HairstyleDef {
  id: string;
  label: string;
  files: Record<string, string>;
  rig: string;
  /** 'skinned': weights to Head/neck/spine, bound like a garment; 'head-bone': a rigid mesh parented to Head. */
  attachment: 'skinned' | 'head-bone';
  /** For 'head-bone': offset in the Head bone's space (metres / radians). */
  offset?: { position: [number, number, number]; rotation: [number, number, number] };
  colorRegions: ColorRegionDef[];
  thumbnail?: string;
  source: string;
  license: string;
  stats?: { triangles: number; textureBytes: number };
}

export interface ModularManifest {
  version: 1;
  rigs: RigProfile[];
  bodies: BodyPresetDef[];
  garments: GarmentDef[];
  hairstyles: HairstyleDef[];
  /**
   * Optional exclusion rules beyond each garment's own `conflicts` (see restrictions.ts). Both kinds are symmetric: naming
   * the pair on one side is enough.
   */
  restrictions?: {
    /** Slot-type exclusions: `{ outer: ['full'] }` = no garment in 'outer' together with one in 'full' (and vice versa). */
    slots?: Partial<Record<ModularSlot, ModularSlot[]>>;
    /** Part-id exclusions (garment or hairstyle ids): `{ hood: ['short_crop'] }` = the hood and that hairstyle never go together. */
    parts?: Record<string, string[]>;
  };
  /** Defaults used for people without a modular look (see deriveModularLook). */
  defaults: {
    bodyByFrame: Record<'a' | 'b', string>;
    hairstyle: string | null;
    outfit: Partial<Record<ModularSlot, string>>;
    eyeColor: Hex;
  };
}

/**
 * Cover mask sidecar of one garment on one body. `meshes` maps `<body mesh name>/<primitive index>` (e.g. "Body_chest/0";
 * three's GLTFLoader makes one SkinnedMesh per primitive, in primitive order, under a Group named Body_<region> when a
 * mesh has several primitives) to a base64 bitset over that primitive's vertices in GLB order (bit i of byte i>>3, LSB
 * first): 1 = covered by the garment. Keys not listed are not covered. `vertexCounts` (every primitive) lets the
 * runtime reject a mask made for a different body export.
 */
export interface CoverMaskFile {
  v: 1;
  body: string;
  garment: string;
  coverDist: number;
  meshes: Record<string, string>;
  vertexCounts: Record<string, number>;
}

/** One outfit of the modular catalog: slot -> garment id. */
export type ModularOutfit = Partial<Record<ModularSlot, string>>;

/** The serializable look of a modular character. Stored on `Appearance.modular`; never holds renderer objects. */
export interface ModularLook {
  v: typeof MODULAR_LOOK_VERSION;
  bodyId: string;
  hairId: string | null;
  /** Outfits per category; a missing category falls back to 'everyday'. */
  outfits: Partial<Record<OutfitCategory, ModularOutfit>>;
  colors: {
    skin: Hex;
    eyes: Hex;
    hair: Hex;
    /** garment id -> color region id -> color. Missing entries use the region's default. */
    garments: Record<string, Record<string, Hex>>;
  };
  /** Morph id -> value (BodyPresetDef.morphs). Unknown ids are kept but not applied. */
  morphs: Record<string, number>;
  /** Seed of the last randomization, if any. */
  seed?: number;
}
