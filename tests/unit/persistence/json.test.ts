import { describe, expect, it } from 'vitest';
import { checksum, firstJsonDifference, serializeChecked } from '../../../src/persistence/json';
import { makeWorld } from './fixtures';

describe('JSON round trip check', () => {
  it('accepts the fixture world', () => {
    const r = serializeChecked(makeWorld());
    expect(r.ok).toBe(true);
  });

  it('treats undefined object properties as absent but rejects everything JSON would change', () => {
    expect(firstJsonDifference({ a: 1, b: undefined }, { a: 1 })).toBeNull();
    expect(firstJsonDifference({ n: -0 }, JSON.parse(JSON.stringify({ n: -0 })))).toBeNull();
    expect(serializeChecked({ a: { n: NaN } })).toEqual({ ok: false, error: expect.stringContaining('state.a.n is NaN') });
    expect(serializeChecked({ n: Infinity })).toEqual({ ok: false, error: expect.stringContaining('Infinity') });
    expect(serializeChecked({ list: [1, undefined, 3] })).toEqual({ ok: false, error: expect.stringContaining('state.list[1] is undefined') });
    expect(serializeChecked({ m: new Map([[1, 2]]) })).toEqual({ ok: false, error: expect.stringContaining('state.m is a Map') });
    expect(serializeChecked({ s: new Set([1]) })).toEqual({ ok: false, error: expect.stringContaining('state.s is a Set') });
    expect(serializeChecked({ d: new Date(0) })).toEqual({ ok: false, error: expect.stringContaining('state.d is a Date') });
    expect(serializeChecked({ f: () => 1 })).toEqual({ ok: false, error: expect.stringContaining('state.f is a function') });
    class Thing { x = 1; }
    expect(serializeChecked({ t: new Thing() })).toEqual({ ok: false, error: expect.stringContaining('state.t is a Thing') });
  });

  it('reports circular structures and bigints instead of throwing', () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(serializeChecked(loop).ok).toBe(false);
    expect(serializeChecked({ n: 10n }).ok).toBe(false);
  });

  it('names the path of the first difference', () => {
    const world = makeWorld();
    const hhId = world.activeHouseholdId;
    (world.households[hhId] as { funds: number }).funds = Number.NaN;
    const r = serializeChecked(world);
    expect(r).toEqual({ ok: false, error: expect.stringContaining(`state.households.${hhId}.funds is NaN`) });
  });
});

describe('checksum', () => {
  it('changes when text is altered or cut short', () => {
    const text = JSON.stringify(makeWorld());
    expect(checksum(text)).toBe(checksum(text));
    expect(checksum(text)).not.toBe(checksum(text.slice(0, -1)));
    expect(checksum(text)).not.toBe(checksum(text.replace('1234.25', '1234.26')));
  });
});
