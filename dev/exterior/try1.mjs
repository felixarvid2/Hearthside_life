import { loadPlaywright, launchOptions, startServer, openGame, startGame, frames, shot, root } from './lib.mjs';
import { join } from 'node:path';
const pw = loadPlaywright();
const server = await startServer();
const browser = await pw.chromium.launch(launchOptions(pw.chromium));
try {
  const { page, errors } = await openGame(browser, process.argv[2] ?? 'desktop', server.url);
  await startGame(page, { sandbox: true });
  const r = await page.evaluate(() => {
    const g = window.hearthside.game;
    g.setMode('build');
    g.setBuildTool({ kind: 'roof', shape: 'auto', spec: { styleId: 'gable', finish: { designId: 'asphalt-shingle', paletteId: 'charcoal' } } });
    return g.buildApply({ from: { x: 0, z: 0 }, level: 0 });
  }).catch((e) => String(e));
  console.log(JSON.stringify(r));
  const info = await page.evaluate(() => {
    const st = window.hearthside.debug.state();
    const lot = st.lots[st.activeLotId];
    return { roofs: Object.values(lot.roofs ?? {}).map((x) => [x.styleId, x.x0, x.z0, x.x1, x.z1]) };
  });
  console.log(JSON.stringify(info));
  await page.evaluate(() => { const g = window.hearthside.game; g.setMode('live'); g.view.setCutaway('up'); window.hearthside.game.view.frameLot?.(true); });
  await frames(page, 4);
  await shot(page, join(root, 'dev/exterior/shots/try1.png'));
  console.log(errors.slice(0, 5));
} finally { await browser.close(); server.stop(); }
