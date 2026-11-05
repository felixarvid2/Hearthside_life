// Milestone 10: validation of ObjectDef.anim / ObjectDef.screen and the generated-bounds contract.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { content } from '../../../src/content/index';
import { M10_MODELS } from '../../../src/content/objectsM10';
import { validateContent, type ManifestModel } from '../../../src/content/validate';
import type { ObjectAnimSpec, ObjectDef } from '../../../src/content/types';

const manifest = JSON.parse(readFileSync(new URL('../../../public/assets/manifest.json', import.meta.url), 'utf8')) as {
  furniture: Record<string, ManifestModel & { group?: string }>;
};
const db = content();

function errorsFor(id: string, patch: Partial<ObjectDef>): string[] {
  const base = db.objects[id]!;
  const bad: ObjectDef = { ...base, ...patch };
  const { errors } = validateContent({ ...db, objects: { ...db.objects, [id]: bad } }, { models: manifest.furniture });
  return errors.filter((e) => e.includes(`'${id}'`));
}

const chestAnim = (parts: ObjectAnimSpec['parts'], extra: Partial<ObjectAnimSpec> = {}): ObjectAnimSpec => ({ kind: 'openWhileUsed', parts, ...extra });

describe('anim and screen validation', () => {
  it('accepts the shipped content-declared designs', () => {
    expect(errorsFor('chest-of-drawers', {})).toEqual([]);
    expect(errorsFor('fridge-retro-tall', {})).toEqual([]);
    expect(errorsFor('laptop-thin', {})).toEqual([]);
  });

  it('rejects a node the model does not have', () => {
    expect(errorsFor('chest-of-drawers', { anim: chestAnim([{ node: 'anim:nope', role: 'drawer', slide: [0, 0, 0.3] }]) }).join('\n')).toMatch(/no such node/);
  });

  it('rejects a moving part without motion, a static part with motion, and bad numbers', () => {
    const e = (part: ObjectAnimSpec['parts'][number]) => errorsFor('chest-of-drawers', { anim: chestAnim([part]) }).join('\n');
    expect(e({ node: 'anim:drawer1', role: 'drawer' })).toMatch(/needs axis \+ angle/);
    expect(e({ node: 'anim:drawer1', role: 'interior', slide: [0, 0, 1] })).toMatch(/does not move/);
    expect(e({ node: 'anim:drawer1', role: 'door', axis: 'y', angle: 0 })).toMatch(/non-zero/);
    expect(e({ node: 'anim:drawer1', role: 'drawer', slide: [0, 0, 0] })).toMatch(/non-zero/);
    expect(e({ node: 'anim:drawer1', role: 'drawer', slide: [0, 0, Number.NaN] })).toMatch(/slide/);
    expect(e({ node: 'drawer1', role: 'drawer', slide: [0, 0, 0.3] })).toMatch(/look like 'anim:door'/);
  });

  it('only allows `on` with openWhileUsed and known interactions', () => {
    const part = { node: 'anim:drawer1', role: 'drawer' as const, slide: [0, 0, 0.3] as [number, number, number] };
    expect(errorsFor('chest-of-drawers', { anim: { kind: 'fridge', parts: [part], on: ['changeOutfit'] } }).join('\n')).toMatch(/only applies/);
    expect(errorsFor('chest-of-drawers', { anim: chestAnim([part], { on: ['noSuchThing'] }) }).join('\n')).toMatch(/unknown interaction/);
  });

  it('wants an anim:screen part behind screen: true', () => {
    expect(errorsFor('chest-of-drawers', { screen: true }).join('\n')).toMatch(/no anim:screen part/);
  });
});

describe('tap, hob and water-only kinds', () => {
  const messages = (id: string, patch: Partial<ObjectDef>) => {
    const bad: ObjectDef = { ...db.objects[id]!, ...patch };
    const r = validateContent({ ...db, objects: { ...db.objects, [id]: bad } }, { models: manifest.furniture });
    return { errors: r.errors.filter((e) => e.includes(`'${id}'`)), warnings: r.warnings.filter((e) => e.includes(`'${id}'`)) };
  };

  it('accepts the shipped sinks, ranges, showers, baths and toilets without warnings', () => {
    for (const id of ['sink-single-bowl', 'vanity-double', 'bidet', 'range-steel-gas', 'range-chef-six', 'wall-oven-tower', 'shower-walk-in', 'bath-clawfoot', 'toilet-budget', 'washer-top-load']) {
      expect(messages(id, {}), id).toEqual({ errors: [], warnings: [] });
    }
  });

  it('lets shower, bath and sink anims declare no parts, but not other kinds', () => {
    expect(messages('shower-walk-in', { anim: { kind: 'shower', parts: [] } }).warnings).toEqual([]);
    expect(messages('bath-clawfoot', { anim: { kind: 'bath', parts: [] } }).warnings).toEqual([]);
    expect(messages('chest-of-drawers', { anim: chestAnim([]) }).warnings.join('\n')).toMatch(/no parts and no interior/);
  });

  it('wants the sit slot for toilets and the use slot elsewhere', () => {
    const lid = { node: 'anim:lid', role: 'lid' as const, axis: 'x' as const, angle: -1.7 };
    expect(messages('toilet-budget', { slots: [] , anim: { kind: 'toilet', parts: [lid] } }).warnings.join('\n')).toMatch(/no 'sit' slot/);
    const sit = db.objects['toilet-budget']!.slots.filter((x) => x.kind === 'sit');
    expect(messages('toilet-budget', { slots: sit }).warnings).toEqual([]);
  });

  it('checks tap and hob data', () => {
    const tap = { x: 0.5, z: 0.3, top: 0.9, bottom: 0.7 };
    const sinkAnim = (t: object) => ({ kind: 'sink' as const, parts: [], tap: t as typeof tap });
    expect(messages('sink-single-bowl', { anim: sinkAnim({ ...tap, top: 0.6 }) }).errors.join('\n')).toMatch(/anim.tap needs/);
    expect(messages('sink-single-bowl', { anim: sinkAnim({ ...tap, x: 1.2 }) }).errors.join('\n')).toMatch(/anim.tap needs/);
    expect(messages('sink-single-bowl', { anim: { kind: 'microwave', parts: [], tap } }).errors.join('\n')).toMatch(/only applies to kind 'sink'/);
    const hobAnim = (h: object) => ({ kind: 'oven' as const, parts: [], hob: h as { rings: [number, number][] } });
    expect(messages('range-steel-gas', { anim: hobAnim({ rings: [] }) }).errors.join('\n')).toMatch(/anim.hob.rings/);
    expect(messages('range-steel-gas', { anim: hobAnim({ rings: [[0.3, 1.2]] }) }).errors.join('\n')).toMatch(/anim.hob.rings/);
    expect(messages('range-steel-gas', { anim: hobAnim({ rings: [[0.3, 0.3]], y: 0 }) }).errors.join('\n')).toMatch(/anim.hob.y/);
    expect(messages('range-steel-gas', { anim: { kind: 'fridge', parts: [], hob: { rings: [[0.3, 0.3]] } } }).errors.join('\n')).toMatch(/only applies to kind 'oven'/);
  });
});

describe('generated model data', () => {
  it('has bounds for every Milestone 10 model that match the manifest exactly', () => {
    for (const [name, info] of Object.entries(M10_MODELS)) {
      const entry = manifest.furniture[name];
      expect(entry, name).toBeDefined();
      expect(entry!.min, name).toEqual(info.bounds[0]);
      expect(entry!.max, name).toEqual(info.bounds[1]);
      expect(entry!.group, name).toBeTruthy();
    }
    for (const [name, entry] of Object.entries(manifest.furniture)) if (entry.group) expect(M10_MODELS[name], `${name} missing from objectsM10/*.models.ts: run node tools/build-extra-furniture.mjs`).toBeDefined();
  });
});
