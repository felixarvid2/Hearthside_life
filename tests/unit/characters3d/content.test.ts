import { describe, expect, it } from 'vitest';
import * as CH from '../../../src/content/character';
import { OUTFIT_CATEGORIES } from '../../../src/core/types';
import type { GarmentLayer } from '../../../src/core/types';
import { BODY_PARAM_IDS } from '../../../src/characters/bodyShape';
import { HEAD_SCULPT_IDS } from '../../../src/characters/headShape';
import { ANIM_CLIPS, SEATED_CLIPS, resolveAnim } from '../../../src/characters/animation';
import { ANIM_IDS } from '../../../src/core/anim';
import { FABRIC_IDS, PATTERN_IDS } from '../../../src/characters/materials';
import manifest from '../../../public/assets/manifest.json';

const HEX = /^#[0-9a-f]{6}$/i;
const LAYERS: GarmentLayer[] = ['top', 'bottom', 'full', 'outer', 'shoes'];

function uniqueIds(list: Array<{ id: string }>): boolean { return new Set(list.map((x) => x.id)).size === list.length; }

describe('character content registry', () => {
  it('has unique ids in every list', () => {
    for (const list of [CH.HAIR, CH.FACIAL_HAIR, CH.GARMENTS, CH.ACCESSORIES, CH.PATTERNS, CH.FACE_PRESETS, CH.BODY_PRESETS, CH.BROW_STYLES, CH.VOICES, CH.FACE_PARAMS, CH.BODY_PARAMS, CH.SKIN_TONES, CH.HAIR_COLORS, CH.EYE_COLORS]) {
      expect(uniqueIds(list)).toBe(true);
    }
  });

  it('meets the Milestone 1 counts', () => {
    expect(CH.HAIR.filter((h) => h.status === 'ready').length).toBeGreaterThanOrEqual(8);
    expect(CH.GARMENTS.filter((g) => g.status === 'ready').length).toBeGreaterThanOrEqual(12);
    expect(CH.FACIAL_HAIR.length).toBeGreaterThanOrEqual(4);
    expect(CH.BROW_STYLES.length).toBeGreaterThanOrEqual(6);
    expect(CH.FACE_PARAMS.length).toBeGreaterThanOrEqual(12);
    expect(CH.FACE_PRESETS.length).toBeGreaterThanOrEqual(24);
    expect(CH.BODY_PARAMS.length).toBeGreaterThanOrEqual(8);
    expect(CH.BODY_PRESETS.filter((b) => b.frame === 'a').length).toBe(6);
    expect(CH.BODY_PRESETS.filter((b) => b.frame === 'b').length).toBe(6);
    expect(CH.SKIN_TONES.length).toBeGreaterThanOrEqual(12);
    expect(CH.HAIR_COLORS.length).toBeGreaterThanOrEqual(12);
    expect(CH.EYE_COLORS.length).toBeGreaterThanOrEqual(10);
    for (const p of ['solid', 'stripes', 'plaid', 'polka', 'gingham']) expect(CH.PATTERNS.some((x) => x.id === p)).toBe(true);
  });

  it('colour swatches are valid hex and skin tones span light to deep', () => {
    for (const s of [...CH.SKIN_TONES, ...CH.HAIR_COLORS, ...CH.EYE_COLORS]) expect(s.color).toMatch(HEX);
    const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
    const l = CH.SKIN_TONES.map((s) => lum(s.color));
    expect(Math.max(...l)).toBeGreaterThan(200);
    expect(Math.min(...l)).toBeLessThan(45);
  });

  it('param definitions are bounded and match the shape generators', () => {
    for (const p of [...CH.FACE_PARAMS, ...CH.BODY_PARAMS]) {
      expect(p.min).toBeLessThan(p.max);
      expect(p.step).toBeGreaterThan(0);
      expect(p.min).toBeGreaterThanOrEqual(-1);
      expect(p.max).toBeLessThanOrEqual(1);
    }
    expect(CH.BODY_PARAMS.map((p) => p.id).sort()).toEqual([...BODY_PARAM_IDS].sort());
    for (const id of ['build', 'muscle', 'shoulders', 'chest', 'waist', 'hips', 'arms', 'legs']) expect(CH.BODY_PARAMS.some((p) => p.id === id)).toBe(true);
    const faceIds = new Set(CH.FACE_PARAMS.map((p) => p.id));
    for (const id of HEAD_SCULPT_IDS) expect(faceIds.has(id)).toBe(true);
    expect(CH.BODY_PARAMS.some((p) => p.id === 'height')).toBe(false); // height is not adjustable in M1
  });

  it('presets reference existing params within range', () => {
    const face = new Map(CH.FACE_PARAMS.map((p) => [p.id, p]));
    const body = new Map(CH.BODY_PARAMS.map((p) => [p.id, p]));
    for (const pr of CH.FACE_PRESETS) for (const [k, v] of Object.entries(pr.params)) {
      const d = face.get(k);
      expect(d, `${pr.id}.${k}`).toBeDefined();
      expect(v).toBeGreaterThanOrEqual(d!.min);
      expect(v).toBeLessThanOrEqual(d!.max);
    }
    for (const pr of CH.BODY_PRESETS) for (const [k, v] of Object.entries(pr.params)) {
      const d = body.get(k);
      expect(d, `${pr.id}.${k}`).toBeDefined();
      expect(v).toBeGreaterThanOrEqual(d!.min);
      expect(v).toBeLessThanOrEqual(d!.max);
    }
  });

  it('face presets are distinct faces (no two within a hair of each other)', () => {
    const ids = CH.FACE_PARAMS.map((p) => p.id);
    const vec = (p: (typeof CH.FACE_PRESETS)[number]) => ids.map((id) => p.params[id] ?? 0);
    for (let i = 0; i < CH.FACE_PRESETS.length; i++) for (let j = i + 1; j < CH.FACE_PRESETS.length; j++) {
      const a = vec(CH.FACE_PRESETS[i]!), b = vec(CH.FACE_PRESETS[j]!);
      const d = Math.sqrt(a.reduce((acc, v, k) => acc + (v - b[k]!) ** 2, 0));
      expect(d, `${CH.FACE_PRESETS[i]!.id} vs ${CH.FACE_PRESETS[j]!.id}`).toBeGreaterThan(0.5);
    }
  });

  it('garments have valid layers, categories, patterns and fabrics', () => {
    const patterns = new Set(CH.PATTERNS.map((p) => p.id));
    for (const g of CH.GARMENTS) {
      expect(LAYERS).toContain(g.layer);
      expect(g.categories.length).toBeGreaterThan(0);
      for (const c of g.categories) expect(OUTFIT_CATEGORIES).toContain(c);
      for (const p of g.patterns) { expect(patterns.has(p)).toBe(true); expect(PATTERN_IDS[p]).toBeDefined(); }
      expect(g.patterns).toContain('solid');
      expect(g.defaultColor).toMatch(HEX);
      expect(['shirt', 'pants', 'skirt', 'dress', 'overalls', 'swimsuit', 'jumpsuit', 'suit', 'shoe']).toContain(g.build.shape);
      if (g.layer !== 'shoes') expect(FABRIC_IDS[String(g.build.fabric)]).toBeDefined();
      expect(g.layer === 'shoes').toBe(g.build.shape === 'shoe');
    }
  });

  it('every outfit category can dress a body (full or top + bottom) and the sleep category works', () => {
    for (const cat of OUTFIT_CATEGORIES) {
      const inCat = CH.GARMENTS.filter((g) => g.status === 'ready' && g.categories.includes(cat));
      expect(inCat.length, cat).toBeGreaterThan(0);
      const full = inCat.some((g) => g.layer === 'full');
      const pair = inCat.some((g) => g.layer === 'top') && inCat.some((g) => g.layer === 'bottom');
      expect(full || pair, cat).toBe(true);
    }
  });

  it('hair and facial hair builds use known generator pieces', () => {
    const pieces = ['none', 'curls', 'bob', 'long', 'ponytail', 'bun', 'afro', 'braids'];
    for (const h of CH.HAIR) expect(pieces).toContain(h.build.piece);
    expect(new Set(CH.HAIR.map((h) => h.build.piece)).size).toBeGreaterThanOrEqual(7);
    for (const f of CH.FACIAL_HAIR) expect(['paint', 'shell']).toContain(f.build.kind);
    for (const a of CH.ACCESSORIES) expect(['glasses', 'earrings', 'hat', 'scarf', 'necklace', 'watch', 'bracelet']).toContain(a.kind);
  });
});

describe('animation mapping', () => {
  const clips = new Set([...manifest.animations.anims_1.clips, ...manifest.animations.anims_2.clips]);
  it('maps every AnimId to clips that exist', () => {
    for (const id of ANIM_IDS) {
      for (const posture of ['standing', 'seated', 'lying'] as const) {
        const spec = resolveAnim(id, posture);
        expect(clips.has(spec.clip), `${id}/${posture}: ${spec.clip}`).toBe(true);
        if (spec.upper) expect(clips.has(spec.upper)).toBe(true);
      }
    }
    for (const s of Object.values(SEATED_CLIPS)) expect(s.clip.startsWith('Sitting_')).toBe(true);
  });
  it('one-shots return or hold, and lie down plays LayToIdle reversed into sleep', () => {
    expect(ANIM_CLIPS.lieDown).toMatchObject({ clip: 'LayToIdle', reverse: true, then: 'sleep' });
    expect(ANIM_CLIPS.getUp).toMatchObject({ clip: 'LayToIdle', then: 'idle' });
    expect(ANIM_CLIPS.sleep.pose).toBe('first');
    expect(ANIM_CLIPS.sitDown).toMatchObject({ clip: 'Sitting_Enter', then: 'sitIdle' });
    expect(ANIM_CLIPS.standUp).toMatchObject({ clip: 'Sitting_Exit', then: 'idle' });
    for (const id of ['eat', 'read', 'computer', 'watchTv', 'toilet'] as const) expect(resolveAnim(id, 'seated').clip.startsWith('Sitting_')).toBe(true);
  });
});
