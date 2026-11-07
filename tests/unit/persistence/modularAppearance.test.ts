import { describe, expect, it } from 'vitest';
import { checkAppearance } from '../../../src/persistence/shape';

const base = () => ({
  frame: 'a', skin: '#b07a55', body: {}, bodyPresetId: null,
  face: { presetId: null, params: {}, eyeColor: '#336655', browStyle: 'x', browColor: '#111111', freckles: 0, blush: 0, lipTint: 0, lipColor: '#aa5555' },
  hair: { styleId: 'h', color: '#774411', highlight: null, facialHairId: null },
});
const modular = { v: 1, bodyId: 'ubc_male', hairId: null, outfits: { everyday: { top: 'x' } }, colors: { skin: '#ffffff', eyes: '#000000', hair: '#111111', garments: {} }, morphs: {} };
const problems = (a: unknown) => { const l: string[] = []; checkAppearance(a, 'appearance', l); return l; };

describe('Appearance.modular in saves', () => {
  it('old appearances without it still load', () => { expect(problems(base())).toEqual([]); });
  it('a valid modular look passes', () => { expect(problems({ ...base(), modular })).toEqual([]); });
  it('an invalid one is flagged like other bad appearance fields', () => {
    expect(problems({ ...base(), modular: { ...modular, v: 7 } })).toEqual(['appearance.modular must be a modular look (version 1) or absent']);
    expect(problems({ ...base(), modular: 'x' })).toHaveLength(1);
  });
});
