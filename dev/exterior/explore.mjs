import { loadPlaywright, launchOptions, startServer, openGame, startGame, frames, shot, root } from './lib.mjs';
import { join } from 'node:path';
const pw = loadPlaywright();
const server = await startServer();
const browser = await pw.chromium.launch(launchOptions(pw.chromium));
try {
  const { page, errors } = await openGame(browser, process.argv[2] ?? 'desktop', server.url);
  await startGame(page);
  const info = await page.evaluate(() => {
    const st = window.hearthside.debug.state();
    const lot = st.lots[st.activeLotId];
    const walls = Object.values(lot.walls);
    return { lot: [lot.width, lot.depth, lot.entry, lot.levels, lot.ground], nWalls: walls.length, floors: Object.keys(lot.floors).length, objects: Object.values(lot.objects).map((o) => o.defId + '@' + o.x + ',' + o.z).slice(0, 5), funds: st.households[st.activeHouseholdId].funds };
  });
  console.log(JSON.stringify(info));
  await shot(page, join(root, 'dev/exterior/shots/explore.png'));
  console.log(errors.slice(0, 5));
} finally { await browser.close(); server.stop(); }
