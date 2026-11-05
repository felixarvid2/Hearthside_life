import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_VERSION, mergeSettings, migrateSettings } from '../../../src/game/settings';

describe('player settings', () => {
  it('defaults to the natural (MPFB) character style and keeps it across old saves', () => {
    expect(DEFAULT_SETTINGS.characterStyle).toBe('mpfb');
    const base = { ...DEFAULT_SETTINGS };
    expect(mergeSettings(base, { masterVolume: 0.5 }).characterStyle).toBe('mpfb');
  });

  it('accepts the three character styles and ignores anything else', () => {
    const base = { ...DEFAULT_SETTINGS };
    expect(mergeSettings(base, { characterStyle: 'classic' }).characterStyle).toBe('classic');
    expect(mergeSettings(base, { characterStyle: 'detailed' }).characterStyle).toBe('detailed');
    expect(mergeSettings({ ...base, characterStyle: 'classic' }, { characterStyle: 'mpfb' }).characterStyle).toBe('mpfb');
    expect(mergeSettings(base, { characterStyle: 'fancy' as never }).characterStyle).toBe('mpfb');
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

describe('settings migration to the natural character style', () => {
  it('moves a save from before the version stamp that has the old default style to mpfb', () => {
    expect(migrateSettings({ characterStyle: 'detailed', quality: 'low' })).toMatchObject({ characterStyle: 'mpfb', quality: 'low', version: SETTINGS_VERSION });
    expect(migrateSettings({ masterVolume: 0.2 })).toMatchObject({ characterStyle: 'mpfb', version: SETTINGS_VERSION });
  });

  it('keeps the classic style, which was never the default, and leaves a current save alone', () => {
    expect(migrateSettings({ characterStyle: 'classic' }).characterStyle).toBe('classic');
    expect(migrateSettings({ characterStyle: 'detailed', version: SETTINGS_VERSION }).characterStyle).toBe('detailed');
    expect(migrateSettings({ characterStyle: 'mpfb', version: SETTINGS_VERSION }).characterStyle).toBe('mpfb');
  });

  it('migrates once: the result carries the version, so choosing detailed again afterwards sticks', () => {
    const once = migrateSettings({ characterStyle: 'detailed' });
    expect(once.characterStyle).toBe('mpfb');
    const chosen = migrateSettings({ ...once, characterStyle: 'detailed' });
    expect(chosen.characterStyle).toBe('detailed');
  });
});
