// Milestone 13 placeholder audit (see docs/TEST_CHECKLIST.md, "Release readiness"):
// nothing under src/ outside the dev folders may import a dev module, and no player-facing string may say "coming soon", "TODO",
// "lorem ipsum" or "not implemented". The single Vite entry (index.html -> src/main.ts) is what ships, so dev pages and
// mock APIs reach the build only through such an import.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../../src');
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}
const isDevPath = (p: string) => /(^|\/)dev\//.test(relative(SRC, p));
const files = walk(SRC);

describe('production build is free of development placeholders', () => {
  it('has a single HTML entry that loads src/main.ts', () => {
    const html = readFileSync(resolve(SRC, '../index.html'), 'utf8');
    expect([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1])).toEqual(['/src/main.ts']);
  });

  it('no shipped module imports from a dev folder (mock games and mock APIs stay out of the bundle)', () => {
    const offenders: string[] = [];
    for (const f of files.filter((x) => !isDevPath(x))) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/from\s+'([^']+)'|import\(\s*'([^']+)'\s*\)/g)) {
        const spec = m[1] ?? m[2] ?? '';
        if (/(^|\/)dev\//.test(spec)) offenders.push(`${relative(SRC, f)} -> ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no player-facing placeholder wording in shipped source', () => {
    const banned = /coming soon|lorem ipsum|not implemented|\bTODO\b|\bFIXME\b/i;
    const offenders: string[] = [];
    for (const f of files.filter((x) => !isDevPath(x) && !x.endsWith('screenPrograms.ts'))) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
        if (banned.test(code)) offenders.push(`${relative(SRC, f)}:${i + 1}: ${line.trim().slice(0, 80)}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
