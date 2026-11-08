// Player settings (GameSettings, src/game/api.ts) stored in localStorage. Every read and write is wrapped in
// try/catch: private windows, blocked storage or a damaged value never stop the game; it then runs with the
// defaults and simply does not remember changes.

import type { GameSettings } from './api';

export const SETTINGS_KEY = 'hearthside.settings.v1';
/**
 * Version stamped on every saved settings object. Saves from before it was introduced (no `version`) were written while
 * 'detailed' (the Meshy bodies) was the default style and cannot be told apart from a deliberate choice of it, so they are moved
 * to the new default 'mpfb' once (see migrateSettings).
 */
export const SETTINGS_VERSION = 2;

export const DEFAULT_SETTINGS: Readonly<GameSettings> = Object.freeze({
  masterVolume: 0.8,
  soundVolume: 0.8,
  musicVolume: 0.35,
  reducedMotion: false,
  textScale: 1,
  highContrast: false,
  quality: 'high',
  characterStyle: 'mpfb', // 'detailed' = the scanned Meshy bodies, 'classic' = the procedural bodies (also the last fallback), 'quaternius' = modular GLB-part adults (preview)
  shadows: true,
  weatherEffects: true,
  actionProgress: 'household',
  showStats: false,
  tutorial: true,
  hints: true,
  seenHints: [] as string[],
});

/** UI scale limits (Settings > Display: 90 to 150 %). */
export const TEXT_SCALE_MIN = 0.9;
export const TEXT_SCALE_MAX = 1.5;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** What the device reports; any field may be unknown. */
export interface DeviceSignals {
  /** Primary pointer is coarse (a finger). */
  coarse: boolean;
  /** Shorter side of the screen in CSS px. */
  minScreen: number;
  /** navigator.deviceMemory in GB (Chromium; capped at 8 by the browser). */
  memoryGb?: number;
  /** navigator.hardwareConcurrency. */
  cores?: number;
}

/**
 * Default quality for a device: phones and small touch screens start on 'low' (their pixel budget and the lighter lighting keep the
 * frame time down, see docs/TEST_CHECKLIST.md), and so does any device that reports little memory (2 GB or less) or a touch device
 * with at most 4 cores and 3 GB. Large tablets, laptops and desktops start on 'high'. The player can change it in Settings.
 */
export function qualityFor(d: DeviceSignals): 'low' | 'high' {
  if (d.coarse && d.minScreen < 600) return 'low';
  if (d.memoryGb !== undefined && d.memoryGb <= 2) return 'low';
  if (d.coarse && d.memoryGb !== undefined && d.memoryGb <= 3 && d.cores !== undefined && d.cores <= 4) return 'low';
  return 'high';
}

export function defaultQuality(): 'low' | 'high' {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    return qualityFor({
      coarse: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
      minScreen: Math.min(screen.width, screen.height),
      ...(typeof nav.deviceMemory === 'number' ? { memoryGb: nav.deviceMemory } : {}),
      ...(typeof nav.hardwareConcurrency === 'number' ? { cores: nav.hardwareConcurrency } : {}),
    });
  } catch {
    return 'high';
  }
}

/** Copies the valid fields of `patch` onto `base` (unknown keys and wrong types are ignored). */
export function mergeSettings(base: GameSettings, patch: Partial<GameSettings> | null | undefined): GameSettings {
  const out: GameSettings = { ...base };
  if (!patch || typeof patch !== 'object') return out;
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const vol = (k: 'masterVolume' | 'soundVolume' | 'musicVolume') => { const v = num(patch[k]); if (v !== null) out[k] = clamp(v, 0, 1); };
  vol('masterVolume'); vol('soundVolume'); vol('musicVolume');
  const ts = num(patch.textScale);
  if (ts !== null) out.textScale = clamp(ts, TEXT_SCALE_MIN, TEXT_SCALE_MAX);
  if (patch.quality === 'low' || patch.quality === 'high') out.quality = patch.quality;
  if (patch.characterStyle === 'mpfb' || patch.characterStyle === 'detailed' || patch.characterStyle === 'classic' || patch.characterStyle === 'quaternius') out.characterStyle = patch.characterStyle;
  if (patch.actionProgress === 'household' || patch.actionProgress === 'all' || patch.actionProgress === 'off') out.actionProgress = patch.actionProgress;
  if (Array.isArray(patch.seenHints)) out.seenHints = [...new Set(patch.seenHints.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 40))].slice(0, 64);
  for (const k of ['reducedMotion', 'highContrast', 'shadows', 'weatherEffects', 'showStats', 'tutorial', 'hints'] as const) {
    if (typeof patch[k] === 'boolean') out[k] = patch[k] as boolean;
  }
  return out;
}

/**
 * One-time migration of a stored settings object: a save without `version` that has the character style 'detailed' (or none)
 * moves to 'mpfb'. 'classic' was never the default, so it stays; anything stored with the current version is left alone, so
 * choosing 'detailed' again in Settings sticks. Returns a new object (and whether it changed the style).
 */
export function migrateSettings(stored: Partial<GameSettings> & { version?: number }): Partial<GameSettings> & { version: number } {
  const out = { ...stored, version: SETTINGS_VERSION };
  const old = typeof stored.version !== 'number' || stored.version < 2;
  if (old && (stored.characterStyle === 'detailed' || stored.characterStyle === undefined)) out.characterStyle = 'mpfb';
  return out;
}

export function loadSettings(): GameSettings {
  const base: GameSettings = { ...DEFAULT_SETTINGS, quality: defaultQuality() };
  try {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) base.reducedMotion = true;
  } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<GameSettings> & { version?: number };
    const stored = parsed && typeof parsed === 'object' ? parsed : {};
    const migrated = migrateSettings(stored);
    const settings = mergeSettings(base, migrated);
    if (stored.version !== SETTINGS_VERSION) saveSettings(settings);
    return settings;
  } catch {
    return base;
  }
}

export function saveSettings(s: GameSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...s, version: SETTINGS_VERSION })); } catch { /* storage unavailable: keep in memory */ }
}

/** Applies the settings that live in the document: UI scale, reduced motion and high contrast. */
export function applyDocumentSettings(s: GameSettings): void {
  try {
    const root = document.documentElement;
    root.style.setProperty('--text-scale', String(clamp(s.textScale, TEXT_SCALE_MIN, TEXT_SCALE_MAX)));
    root.classList.toggle('reduced-motion', s.reducedMotion);
    root.classList.toggle('high-contrast', s.highContrast);
  } catch { /* no document (tests) */ }
}
