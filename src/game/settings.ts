// Player settings (GameSettings, src/game/api.ts) stored in localStorage. Every read and write is wrapped in
// try/catch: private windows, blocked storage or a damaged value never stop the game; it then runs with the
// defaults and simply does not remember changes.

import type { GameSettings } from './api';

export const SETTINGS_KEY = 'hearthside.settings.v1';

export const DEFAULT_SETTINGS: Readonly<GameSettings> = Object.freeze({
  masterVolume: 0.8,
  soundVolume: 0.8,
  musicVolume: 0.35,
  reducedMotion: false,
  textScale: 1,
  quality: 'high',
  shadows: true,
  showStats: false,
  tutorial: true,
});

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Default quality for this device: phones and small screens start on 'low'. */
export function defaultQuality(): 'low' | 'high' {
  try {
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const small = Math.min(screen.width, screen.height) < 600;
    return coarse && small ? 'low' : 'high';
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
  if (ts !== null) out.textScale = clamp(ts, 0.9, 1.3);
  if (patch.quality === 'low' || patch.quality === 'high') out.quality = patch.quality;
  for (const k of ['reducedMotion', 'shadows', 'showStats', 'tutorial'] as const) {
    if (typeof patch[k] === 'boolean') out[k] = patch[k] as boolean;
  }
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
    return mergeSettings(base, JSON.parse(raw) as Partial<GameSettings>);
  } catch {
    return base;
  }
}

export function saveSettings(s: GameSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage unavailable: keep in memory */ }
}

/** Applies the settings that live in the document: text scale and reduced motion. */
export function applyDocumentSettings(s: GameSettings): void {
  try {
    const root = document.documentElement;
    root.style.setProperty('--text-scale', String(clamp(s.textScale, 0.9, 1.3)));
    root.classList.toggle('reduced-motion', s.reducedMotion);
  } catch { /* no document (tests) */ }
}
