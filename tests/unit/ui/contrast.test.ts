// WCAG AA contrast of the main UI palette: the tokens in src/ui/styles/base.css (and the high-contrast overrides in a11y.css)
// are parsed from the files, so a token change that breaks readability fails here.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = (f: string) => readFileSync(new URL(`../../../src/ui/styles/${f}`, import.meta.url), 'utf8');

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g)) out[m[1]!] = m[2]!.toLowerCase();
  return out;
}
const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const base = tokens(/:root\s*\{([^}]*)\}/.exec(css('base.css'))![1]!);
const hc = { ...base, ...tokens(/:root\.high-contrast\s*\{([^}]*)\}/.exec(css('a11y.css'))![1]!) };

describe('contrast helper', () => {
  it('matches the WCAG reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });
});

for (const [name, t] of [['default', base], ['high contrast', hc]] as const) {
  describe(`${name} palette meets WCAG AA`, () => {
    const surfaces = ['bg', 'paper', 'paper-2', 'paper-3'];
    it('has the tokens it needs', () => {
      for (const k of ['ink', 'ink-2', 'ink-3', 'accent', 'accent-2', 'critical', 'focus', ...surfaces]) expect(t[k], k).toBeTruthy();
    });
    it('body and secondary text reach 4.5:1 on every surface', () => {
      for (const s of surfaces) for (const f of ['ink', 'ink-2', 'ink-3']) expect(contrast(t[f]!, t[s]!), `${f} on ${s}`).toBeGreaterThanOrEqual(4.5);
    });
    it('white text on the accent, accent-2, critical and ink fills reaches 4.5:1', () => {
      for (const f of ['accent', 'accent-hover', 'accent-2', 'critical', 'ink']) if (t[f]) expect(contrast('#ffffff', t[f]!), `white on ${f}`).toBeGreaterThanOrEqual(4.5);
    });
    it('accent and critical used as text reach 4.5:1 on paper', () => {
      for (const f of ['accent', 'accent-2', 'critical']) expect(contrast(t[f]!, t.paper!), `${f} on paper`).toBeGreaterThanOrEqual(4.5);
    });
    it('the focus ring and the meter colours reach 3:1 against the surfaces (non-text)', () => {
      for (const s of ['bg', 'paper']) {
        expect(contrast(t.focus!, t[s]!), `focus on ${s}`).toBeGreaterThanOrEqual(3);
        for (const f of ['good', 'critical']) if (t[f]) expect(contrast(t[f]!, t[s]!), `${f} on ${s}`).toBeGreaterThanOrEqual(3);
      }
    });
  });
}

describe('tinted status texts used in the HUD', () => {
  const pairs: Array<[string, string, string]> = [
    ['teal on mint (tags, switch on)', '#1f5f57', '#e4f1ee'],
    ['green on mint (requirements met)', '#2e6b3a', '#e0efe2'],
    ['error text on blush', '#7a2a22', '#fbe2d6'],
    ['paused label on peach', '#a14d26', '#fbe7dc'],
    ['hint fair', '#7a5f08', '#f6ecc8'],
    ['hint long', '#8a4b10', '#f7e0d3'],
    ['enemy tag', '#8d2a22', '#fbdcd8'],
    ['spouse tag', '#8a2f55', '#fbe4ec'],
  ];
  for (const [label, fg, bg] of pairs) it(label, () => expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5));
});
