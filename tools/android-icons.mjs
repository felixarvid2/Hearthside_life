// Renders the Android launcher icons (legacy, round, adaptive foreground) and splash screens from the game's house icon.
// Run from the repository root after `npx cap add android`: node tools/android-icons.mjs
import sharp from 'sharp';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const res = 'android/app/src/main/res';
const house = '<path d="M3 8l5-4 5 4v5H9V9H7v4H3z" fill="#7c5a3a"/>';
const full = (n) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="${n}" height="${n}"><rect width="16" height="16" rx="${n >= 0 ? 4 : 0}" fill="#efe7da"/>${house}</svg>`);
const round = (n) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="${n}" height="${n}"><circle cx="8" cy="8" r="8" fill="#efe7da"/><g transform="translate(8 8.3) scale(0.8) translate(-8 -8.5)">${house}</g></svg>`);
// adaptive foreground: 108dp canvas, house kept inside the 66dp safe zone
const fg = (n) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="${n}" height="${n}"><g transform="translate(54 56) scale(5) translate(-8 -8.5)">${house}</g></svg>`);
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(dens)) {
  const dir = join(res, `mipmap-${d}`);
  await sharp(full(48 * k)).png().toFile(join(dir, 'ic_launcher.png'));
  await sharp(round(48 * k)).png().toFile(join(dir, 'ic_launcher_round.png'));
  await sharp(fg(108 * k)).png().toFile(join(dir, 'ic_launcher_foreground.png'));
}
// splash screens: keep each file's size, cream background with the house centred
for (const dir of readdirSync(res).filter((f) => f.startsWith('drawable')).concat([])) {
  const f = join(res, dir, 'splash.png');
  if (!existsSync(f)) continue;
  const { width: w, height: h } = await sharp(f).metadata();
  const s = Math.round(Math.min(w, h) * 0.28);
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#efe7da"/><g transform="translate(${(w - s) / 2} ${(h - s) / 2}) scale(${s / 16})">${house}</g></svg>`);
  await sharp(svg).png().toFile(f + '.tmp');
  const { renameSync } = await import('node:fs'); renameSync(f + '.tmp', f);
}
console.log('ok');
