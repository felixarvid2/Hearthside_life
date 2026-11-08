#!/usr/bin/env node
// Balance audit command line (Milestone 13). Plays representative households headlessly for several game weeks and
// prints a weekly report (money by source, needs, time per activity, skills and careers, relationships, events,
// stuck or failed actions) plus findings against the targets in docs/BALANCE.md.
//
// Run: npm run balance:audit [-- --weeks=6 --seed=7 --only=single,couple --json=out.json --markdown]
// The library (tools/balance/audit.ts) has extensionless imports, so it is loaded through Vite's module runner,
// the same way tools/content-report.ts loads the content.

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';
import type * as Audit from './balance/audit';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name: string): string | undefined => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const weeks = Math.max(1, Math.min(12, Number(arg('weeks') ?? 6)));
const seed = Number(arg('seed') ?? 7);
const only = arg('only')?.split(',');
const jsonOut = arg('json');
const markdown = process.argv.includes('--markdown');

const { module: audit } = await runnerImport<typeof Audit>(resolve(ROOT, 'tools/balance/audit.ts'));
const reports: Audit.ScenarioReport[] = [];
const t0 = Date.now();
for (const sc of audit.SCENARIOS) {
  if (only && !only.includes(sc.id)) continue;
  const t = Date.now();
  const r = audit.runScenario(sc, { weeks, seed });
  reports.push(r);
  console.log(audit.formatReport(r));
  console.log(`(${((Date.now() - t) / 1000).toFixed(1)} s)\n`);
}
if (markdown) {
  console.log('| household | week | income | spending | funds | lowest need | promotions | skill levels | friends | failed |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of reports) for (const row of audit.summaryRows(r)) console.log(row);
}
if (jsonOut) writeFileSync(resolve(jsonOut), JSON.stringify(reports, null, 1));
const bad = reports.filter((r) => r.findings.length > 0);
console.log(`${reports.length} households, ${weeks} weeks, seed ${seed}: ${bad.length} with findings (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
