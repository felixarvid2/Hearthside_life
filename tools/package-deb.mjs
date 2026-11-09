// Builds release-builds/hearthside-life_<version>_amd64.deb by hand with dpkg-deb (electron-builder needs GitHub).
// Needs: dist/ (npm run build:dist), the Electron linux-x64 zip (cached in ~/.cache/hearthside-electron, downloaded from
// the npm mirror when missing), dpkg-deb, unzip.
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, createWriteStream, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ELECTRON_VERSION = '44.9.3';
const MIRROR = (process.env.ELECTRON_MIRROR || 'https://registry.npmmirror.com/-/binary/electron/').replace(/\/?$/, '/');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version || '1.0.0';
const name = 'hearthside-life';

const dist = join(root, 'dist');
if (!existsSync(join(dist, 'index.html'))) throw new Error('dist/ is missing: run npm run build:dist first');

// 1. Electron runtime zip (cached outside the repo).
const cacheDir = join(homedir(), '.cache', 'hearthside-electron');
const zip = join(cacheDir, `electron-v${ELECTRON_VERSION}-linux-x64.zip`);
if (!existsSync(zip)) {
  mkdirSync(cacheDir, { recursive: true });
  const url = `${MIRROR}v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-linux-x64.zip`;
  console.log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(zip + '.part'));
  execFileSync('mv', [zip + '.part', zip]);
}

// 2. Staging tree.
const stage = join(tmpdir(), `hearthside-deb-${process.pid}`);
rmSync(stage, { recursive: true, force: true });
const opt = join(stage, 'opt', name);
mkdirSync(opt, { recursive: true });
execFileSync('unzip', ['-q', zip, '-d', opt]);
rmSync(join(opt, 'resources', 'default_app.asar'), { force: true });
rmSync(join(opt, 'LICENSES.chromium.html'), { force: true });
// Keep English locale only (the game is English).
const locales = join(opt, 'locales');
for (const f of readdirSync(locales)) if (f !== 'en-US.pak') rmSync(join(locales, f));

const app = join(opt, 'resources', 'app');
mkdirSync(app, { recursive: true });
copyFileSync(join(root, 'packaging/electron/main.js'), join(app, 'main.js'));
const appPkg = JSON.parse(readFileSync(join(root, 'packaging/electron/package.json'), 'utf8'));
appPkg.version = version;
writeFileSync(join(app, 'package.json'), JSON.stringify(appPkg, null, 2) + '\n');
cpSync(dist, join(app, 'dist'), { recursive: true });
execFileSync('mv', [join(opt, 'electron'), join(opt, name)]);

// 3. Launcher, desktop entry, icon.
mkdirSync(join(stage, 'usr/bin'), { recursive: true });
writeFileSync(join(stage, 'usr/bin', name), `#!/bin/sh
# Hearthside Life launcher. chrome-sandbox is made setuid root by the package; without that the sandbox cannot start.
APP=/opt/${name}
if [ ! -u "$APP/chrome-sandbox" ]; then
  set -- --no-sandbox "$@"
fi
exec "$APP/${name}" "$@"
`);
chmodSync(join(stage, 'usr/bin', name), 0o755);
mkdirSync(join(stage, 'usr/share/applications'), { recursive: true });
writeFileSync(join(stage, `usr/share/applications/${name}.desktop`), `[Desktop Entry]
Type=Application
Name=Hearthside Life
Comment=A cosy life simulation
Exec=${name}
Icon=${name}
Terminal=false
Categories=Game;Simulation;
StartupWMClass=hearthside-life
`);
const iconDir = join(stage, 'usr/share/icons/hicolor/256x256/apps');
mkdirSync(iconDir, { recursive: true });
await sharp(join(root, 'packaging/icon.svg'), { density: 1536 }).resize(256, 256).png().toFile(join(iconDir, `${name}.png`));

// 4. Control files.
const sizeKb = Number(execFileSync('du', ['-sk', stage]).toString().split('\t')[0]);
const deb = join(stage, 'DEBIAN');
mkdirSync(deb);
writeFileSync(join(deb, 'control'), `Package: ${name}
Version: ${version}
Section: games
Priority: optional
Architecture: amd64
Installed-Size: ${sizeKb}
Maintainer: Hearthside Life <noreply@hearthside.invalid>
Depends: libgtk-3-0 | libgtk-3-0t64, libnss3, libxss1, libasound2 | libasound2t64, libgbm1, libxshmfence1, libxtst6, libatspi2.0-0 | libatspi2.0-0t64, libdrm2, libcups2 | libcups2t64, libxkbcommon0, libx11-xcb1
Recommends: xdg-utils
Description: Hearthside Life - a cosy life simulation
 An original 3D life simulation: build a home, create your household,
 and live day by day. Packaged with Electron ${ELECTRON_VERSION}; saves are kept per user.
`);
writeFileSync(join(deb, 'postinst'), `#!/bin/sh
set -e
chown root:root /opt/${name}/chrome-sandbox 2>/dev/null || true
chmod 4755 /opt/${name}/chrome-sandbox 2>/dev/null || true
if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database -q /usr/share/applications || true; fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true; fi
exit 0
`);
chmodSync(join(deb, 'postinst'), 0o755);

// 5. Build.
const out = join(root, 'release-builds');
mkdirSync(out, { recursive: true });
const target = join(out, `${name}_${version}_amd64.deb`);
rmSync(target, { force: true });
execFileSync('dpkg-deb', ['--root-owner-group', '-Zxz', '--build', stage, target], { stdio: 'inherit' });
rmSync(stage, { recursive: true, force: true });
console.log(`wrote ${target}`);
