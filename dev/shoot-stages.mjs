#!/usr/bin/env node
// Screenshots of the modular family lineup (dev/stages.html) -> dev/shots/quaternius-stages/*.png at deviceScaleFactor 1.
//   node dev/shoot-stages.mjs [--poses=idle,walk,sit,lie,carry] [--cams=front] [--out=DIR] [--query=prop=baby.head:1.5] [--tag=name]
//     or several shots in one browser session: --runs='tag@pose@cam@query;tag2@pose@cam@query' (the lock can take a long time to get)
// Starts a vite dev server and Chromium (SwiftShader) under the shared browser lock (re-run under flock like the other dev shooters).

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const LOCK = '/tmp/hearthside-browser.lock';
const PORT = 5397;
const args = process.argv.slice(2);
const opt = (name, def) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : def; };

if (!process.env.STAGES_LOCKED) {
  const r = spawnSync('flock', [LOCK, process.execPath, fileURLToPath(import.meta.url), ...args], { stdio: 'inherit', env: { ...process.env, STAGES_LOCKED: '1' } });
  process.exit(r.status ?? 1);
}

const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [join(root, 'node_modules'), '/opt/node22/lib/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules'] }));
const OUT = resolve(opt('out', join(here, 'shots', 'quaternius-stages')));
mkdirSync(OUT, { recursive: true });
const POSES = opt('poses', 'idle,walk,sit,lie,carry').split(',');
const CAMS = opt('cams', 'front').split(',');
const QUERY = opt('query', '');
const TAG = opt('tag', '');

const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/dev/stages.html`)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const runs = opt('runs', '') ? opt('runs', '').split(';').map((r) => { const [tag, pose, cam, query] = r.split('@'); return { tag, pose, cam: cam || 'front', query: query || '' }; })
    : POSES.flatMap((pose) => CAMS.map((cam) => ({ tag: TAG, pose, cam, query: QUERY })));
  for (const { tag, pose, cam, query } of runs) {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 520 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${pose}] ${m.text().slice(0, 200)}`); });
    await page.goto(`http://127.0.0.1:${PORT}/dev/stages.html?pose=${pose}&cam=${cam}${query ? `&${query}` : ''}`);
    await page.waitForFunction(() => window.stagesReady === true || window.stagesError, null, { timeout: 240000 });
    const err = await page.evaluate(() => window.stagesError);
    if (err) throw new Error(err);
    await page.waitForTimeout(300);
    const file = join(OUT, `${pose}${cam === 'front' ? '' : `-${cam}`}${tag ? `-${tag}` : ''}.png`);
    await page.screenshot({ path: file });
    console.log('wrote', file);
    await ctx.close();
  }
} finally {
  await browser?.close();
  server.kill();
}
