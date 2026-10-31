#!/usr/bin/env node
// Content report (brief section 24): distinct designs per category (ready vs dev), palette/finish variant
// totals for every registry, Milestone 1 and full-project targets, and the validation result.
// Used to write docs/CONTENT_STATUS.md.
//
// Run: node --experimental-strip-types tools/content-report.ts   (npm run content:check)
// Options: --markdown   print Markdown tables instead of plain text
//          --strict     exit with code 1 when validation reports errors
//
// The registries are TypeScript modules with extensionless imports, so they are loaded through Vite's module
// runner (vite is a dev dependency) rather than Node's own loader.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';
import type { CatalogCategory, ContentDB } from '../src/content/types';
import type { ManifestModel, ValidationResult } from '../src/content/validate';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const markdown = process.argv.includes('--markdown');
const strict = process.argv.includes('--strict');

interface Row { label: string; ready: number; dev: number; variants?: number | string; m1?: number; target?: number }

/** Full-project catalog targets per buy category (brief section 16). */
const CATEGORY_TARGETS: Record<CatalogCategory, number> = {
  seating: 64, beds: 40, tables: 48, storage: 48, kitchen: 56, bathroom: 36, lighting: 64, electronics: 28, hobby: 36, decor: 64, outdoor: 40, kids: 36,
};

/** Interaction behaviours that are movement or UI shortcuts rather than activities (brief section 2 counting). */
const NOT_ACTIVITIES = ['goHere', 'goToWork', 'editOutfits'];

async function main(): Promise<void> {
  const { module: index } = await runnerImport<{ content: () => ContentDB }>(resolve(ROOT, 'src/content/index.ts'), { root: ROOT, logLevel: 'error' });
  const { module: validator } = await runnerImport<{ validateContent: (db: ContentDB, o: { models?: Record<string, ManifestModel> }) => ValidationResult }>(
    resolve(ROOT, 'src/content/validate.ts'), { root: ROOT, logLevel: 'error' });
  const db = index.content();
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'public/assets/manifest.json'), 'utf8')) as { furniture: Record<string, ManifestModel> };

  const count = <T extends { status: string }>(list: T[]) => ({ ready: list.filter((x) => x.status === 'ready').length, dev: list.filter((x) => x.status !== 'ready').length });
  const sections: Array<{ title: string; rows: Row[]; note?: string }> = [];

  // Furniture by category: distinct designs (one per definition; finishes are variants, not designs).
  const objects = Object.values(db.objects);
  const furnRows: Row[] = (Object.keys(CATEGORY_TARGETS) as CatalogCategory[]).map((cat) => {
    const list = objects.filter((o) => o.category === cat);
    const variants = list.filter((o) => o.status === 'ready').reduce((n, o) => n + o.finishes.reduce((m, r) => m + r.swatches.length, 0), 0);
    return { label: cat, ...count(list), variants, target: CATEGORY_TARGETS[cat] };
  });
  const objTotals = count(objects);
  const readyObjects = objects.filter((o) => o.status === 'ready');
  furnRows.push({
    label: 'TOTAL furniture', ...objTotals, variants: readyObjects.reduce((n, o) => n + o.finishes.reduce((m, r) => m + r.swatches.length, 0), 0), m1: 15, target: 560,
  });
  sections.push({
    title: 'Buy-mode furniture (distinct designs)',
    rows: furnRows,
    note: `variants = finish swatches summed over all regions of ready objects; ${readyObjects.filter((o) => !o.functional).length} ready designs are decorative, ` +
      `${readyObjects.filter((o) => o.finishes.some((r) => r.swatches.length >= 6)).length} offer at least 6 swatches in a region; ` +
      `distinct models used: ${new Set(readyObjects.map((o) => o.model.asset)).size}.`,
  });

  // Construction surfaces.
  const walls = Object.values(db.wallDesigns), floors = Object.values(db.floorDesigns), openings = Object.values(db.openings);
  const palettes = (list: typeof walls) => list.filter((d) => d.status === 'ready').reduce((n, d) => n + d.palettes.length, 0);
  sections.push({
    title: 'Construction surfaces',
    rows: [
      { label: 'wall finishes', ...count(walls), variants: palettes(walls), m1: 12, target: 360 },
      { label: 'floor designs', ...count(floors), variants: palettes(floors), m1: 8, target: 200 },
      { label: 'doors', ...count(openings.filter((o) => o.kind === 'door')), variants: '-', target: 48 },
      { label: 'windows', ...count(openings.filter((o) => o.kind === 'window')), variants: '-', target: 64 },
    ],
    note: 'variants = curated palettes of ready designs (a design counts once however many palettes it has).',
  });

  // Character content.
  const garments = Object.values(db.garments);
  sections.push({
    title: 'Character content',
    rows: [
      { label: 'hairstyles', ...count(Object.values(db.hair)), variants: db.hairColors.length ? `${db.hairColors.length} colours` : '-', m1: 8, target: 60 },
      { label: 'facial hair', ...count(Object.values(db.facialHair)), variants: '-', target: 16 },
      { label: 'garments', ...count(garments), variants: garments.filter((g) => g.status === 'ready').reduce((n, g) => n + 1 + g.patterns.filter((p) => p !== 'solid').length, 0), m1: 12, target: 132 },
      { label: 'accessories', ...count(Object.values(db.accessories)), variants: '-', target: 32 },
      { label: 'patterns', ready: Object.keys(db.patterns).length, dev: 0, variants: '-' },
      { label: 'face presets', ready: Object.keys(db.facePresets).length, dev: 0, variants: `${db.faceParams.length} sliders` },
      { label: 'body presets', ready: Object.keys(db.bodyPresets).length, dev: 0, variants: `${db.bodyParams.length} sliders` },
      { label: 'brow styles', ready: Object.keys(db.browStyles).length, dev: 0 },
      { label: 'voices', ready: Object.keys(db.voices).length, dev: 0 },
      { label: 'skin tones', ready: db.skinTones.length, dev: 0 },
      { label: 'eye colours', ready: db.eyeColors.length, dev: 0 },
    ],
    note: 'garment variants = solid plus allowed patterns per ready garment (colours are free choice).',
  });

  // Gameplay content.
  const socials = Object.values(db.socials);
  const careers = Object.values(db.careers);
  sections.push({
    title: 'Gameplay content',
    rows: [
      { label: 'activities', ...count(Object.values(db.interactions).filter((i) => !NOT_ACTIVITIES.includes(i.behavior ?? ''))), variants: '-', target: 40 },
      { label: 'social interactions', ...count(socials), variants: `${socials.filter((s) => s.alsoActivity).length} also activities`, target: 40 },
      { label: 'traits', ...count(Object.values(db.traits)), variants: '-', target: 40 },
      { label: 'aspirations', ...count(Object.values(db.aspirations)), variants: `${Object.values(db.aspirations).reduce((n, a) => n + a.stages.length, 0)} stages`, target: 12 },
      { label: 'skills', ...count(Object.values(db.skills)), variants: '-', target: 16 },
      { label: 'careers (10 levels)', ...count(careers), variants: `${careers.reduce((n, c) => n + c.levels.length, 0)} levels`, m1: 1, target: 12 },
      { label: 'recipes', ...count(Object.values(db.recipes)), variants: '-' },
      { label: 'moodlets', ready: Object.keys(db.moodlets).length, dev: 0 },
      { label: 'packs', ready: Object.keys(db.packs).length, dev: 0, target: 12 },
      { label: 'preferences', ready: db.preferences.length, dev: 0, variants: `${new Set(db.preferences.map((p) => p.group)).size} groups` },
    ],
    note: `activities exclude moves and menus (behaviors ${NOT_ACTIVITIES.join(', ')}); no social is also counted as an activity.`,
  });

  const result = validator.validateContent(db, { models: manifest.furniture });

  for (const s of sections) {
    if (markdown) {
      console.log(`\n### ${s.title}\n\n| | ready | dev | variants | M1 min | full target |\n|---|---:|---:|---:|---:|---:|`);
      for (const r of s.rows) console.log(`| ${r.label} | ${r.ready} | ${r.dev} | ${r.variants ?? '-'} | ${r.m1 ?? '-'} | ${r.target ?? '-'} |`);
      if (s.note) console.log(`\n${s.note}`);
    } else {
      console.log(`\n${s.title}`);
      console.log(`  ${'category'.padEnd(40)}${'ready'.padStart(7)}${'dev'.padStart(6)}${'variants'.padStart(18)}${'M1'.padStart(6)}${'target'.padStart(8)}`);
      for (const r of s.rows) {
        console.log(`  ${r.label.padEnd(40)}${String(r.ready).padStart(7)}${String(r.dev).padStart(6)}${String(r.variants ?? '-').padStart(18)}` +
          `${String(r.m1 ?? '-').padStart(6)}${String(r.target ?? '-').padStart(8)}`);
      }
      if (s.note) console.log(`  (${s.note})`);
    }
  }
  console.log(`\nValidation: ${result.errors.length} errors, ${result.warnings.length} warnings`);
  for (const e of result.errors) console.log(`  ERROR ${e}`);
  for (const w of result.warnings) console.log(`  warn  ${w}`);
  if (strict && result.errors.length) process.exitCode = 1;
}

main().catch((e: unknown) => { console.error(e); process.exitCode = 1; });
