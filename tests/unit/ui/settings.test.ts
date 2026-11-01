import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings } from '../../../src/game/settings';

describe('player settings', () => {
  it('defaults to the detailed character style and keeps it across old saves', () => {
    expect(DEFAULT_SETTINGS.characterStyle).toBe('detailed');
    const base = { ...DEFAULT_SETTINGS };
    expect(mergeSettings(base, { masterVolume: 0.5 }).characterStyle).toBe('detailed');
  });

  it('accepts the two character styles and ignores anything else', () => {
    const base = { ...DEFAULT_SETTINGS };
    expect(mergeSettings(base, { characterStyle: 'classic' }).characterStyle).toBe('classic');
    expect(mergeSettings(base, { characterStyle: 'detailed' }).characterStyle).toBe('detailed');
    expect(mergeSettings(base, { characterStyle: 'fancy' as never }).characterStyle).toBe('detailed');
    expect(mergeSettings({ ...base, characterStyle: 'classic' }, { characterStyle: 3 as never }).characterStyle).toBe('classic');
  });
});
