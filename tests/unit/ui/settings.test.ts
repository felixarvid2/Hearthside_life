import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_VERSION, mergeSettings, migrateSettings, qualityFor } from '../../../src/game/settings';

describe('player settings', () => {
  it('defaults to the Quaternius (modular) character style and keeps it across old saves', () => {
    expect(DEFAULT_SETTINGS.characterStyle).toBe('quaternius');
    const base = { ...DEFAULT_SETTINGS };
    expect(mergeSettings(base, { masterVolume: 0.5 }).characterStyle).toBe('quaternius');
  });

  it('accepts the four character styles and ignores anything else', () => {
    const base = { ...DEFAULT_SETTINGS };
    expect(mergeSettings(base, { characterStyle: 'classic' }).characterStyle).toBe('classic');
    expect(mergeSettings(base, { characterStyle: 'detailed' }).characterStyle).toBe('detailed');
    expect(mergeSettings({ ...base, characterStyle: 'classic' }, { characterStyle: 'mpfb' }).characterStyle).toBe('mpfb');
    expect(mergeSettings({ ...base, characterStyle: 'classic' }, { characterStyle: 'quaternius' }).characterStyle).toBe('quaternius');
    expect(mergeSettings(base, { characterStyle: 'fancy' as never }).characterStyle).toBe('quaternius');
    expect(mergeSettings({ ...base, characterStyle: 'classic' }, { characterStyle: 3 as never }).characterStyle).toBe('classic');
  });

  it('shows action progress for the household by default and validates the three scopes', () => {
    const base = { ...DEFAULT_SETTINGS };
    expect(base.actionProgress).toBe('household');
    expect(mergeSettings(base, { actionProgress: 'all' }).actionProgress).toBe('all');
    expect(mergeSettings(base, { actionProgress: 'off' }).actionProgress).toBe('off');
    expect(mergeSettings(base, { actionProgress: 'everyone' as never }).actionProgress).toBe('household');
    expect(mergeSettings({ ...base, actionProgress: 'off' }, { actionProgress: 1 as never }).actionProgress).toBe('off');
  });
});

describe('settings migration to the Quaternius character style', () => {
  it('moves a save from before the current version that has an old default style to quaternius', () => {
    expect(migrateSettings({ characterStyle: 'detailed', quality: 'low' })).toMatchObject({ characterStyle: 'quaternius', quality: 'low', version: SETTINGS_VERSION });
    expect(migrateSettings({ masterVolume: 0.2 })).toMatchObject({ characterStyle: 'quaternius', version: SETTINGS_VERSION });
    expect(migrateSettings({ characterStyle: 'mpfb', version: 2 })).toMatchObject({ characterStyle: 'quaternius', version: SETTINGS_VERSION });
    expect(migrateSettings({ characterStyle: 'mpfb' }).characterStyle).toBe('quaternius');
  });

  it('keeps the classic style, which was never the default, and leaves a current save alone', () => {
    expect(migrateSettings({ characterStyle: 'classic' }).characterStyle).toBe('classic');
    expect(migrateSettings({ characterStyle: 'classic', version: 2 }).characterStyle).toBe('classic');
    expect(migrateSettings({ characterStyle: 'detailed', version: SETTINGS_VERSION }).characterStyle).toBe('detailed');
    expect(migrateSettings({ characterStyle: 'mpfb', version: SETTINGS_VERSION }).characterStyle).toBe('mpfb');
  });

  it('migrates once: the result carries the version, so choosing Natural again afterwards sticks', () => {
    const once = migrateSettings({ characterStyle: 'mpfb', version: 2 });
    expect(once.characterStyle).toBe('quaternius');
    const chosen = migrateSettings({ ...once, characterStyle: 'mpfb' });
    expect(chosen.characterStyle).toBe('mpfb');
  });
});

describe('quality auto-detect (qualityFor)', () => {
  it('phones start on low, in both orientations', () => {
    expect(qualityFor({ coarse: true, minScreen: 390 })).toBe('low');
    expect(qualityFor({ coarse: true, minScreen: 390, memoryGb: 8, cores: 8 })).toBe('low');
  });
  it('desktops, laptops and big tablets start on high', () => {
    expect(qualityFor({ coarse: false, minScreen: 720 })).toBe('high');
    expect(qualityFor({ coarse: false, minScreen: 360 })).toBe('high'); // a small desktop window is still a desktop
    expect(qualityFor({ coarse: true, minScreen: 768, memoryGb: 4, cores: 8 })).toBe('high');
    expect(qualityFor({ coarse: true, minScreen: 768 })).toBe('high'); // unknown memory: no guess
  });
  it('little memory or a weak touch device starts on low whatever the screen', () => {
    expect(qualityFor({ coarse: false, minScreen: 1080, memoryGb: 2 })).toBe('low');
    expect(qualityFor({ coarse: true, minScreen: 800, memoryGb: 2 })).toBe('low');
    expect(qualityFor({ coarse: true, minScreen: 800, memoryGb: 3, cores: 4 })).toBe('low');
    expect(qualityFor({ coarse: false, minScreen: 1080, memoryGb: 4, cores: 2 })).toBe('high');
  });
});
