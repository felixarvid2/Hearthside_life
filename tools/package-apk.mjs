// Builds release-builds/hearthside-life-<version>.apk: vite build, cap sync, gradle assembleRelease, copy.
// Needs the Android SDK (ANDROID_HOME, default /home/user/android-sdk), Java 17+, Gradle (the wrapper in android/ is used)
// and release signing (see README "Packaging"): HEARTHSIDE_KEYSTORE* env vars or the gitignored android/keystore.properties.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const android = join(root, 'android');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const [major, minor, patch] = version.split('.').map((n) => parseInt(n, 10) || 0);
const versionCode = major * 10000 + minor * 100 + patch + 1; // +1 so 0.0.0 stays valid
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '/home/user/android-sdk';
const env = { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };

if (!existsSync(sdk)) throw new Error(`Android SDK not found at ${sdk} (set ANDROID_HOME)`);
if (!env.HEARTHSIDE_KEYSTORE && !existsSync(join(android, 'keystore.properties'))) {
  throw new Error('No release signing config: set HEARTHSIDE_KEYSTORE (+ _PASSWORD, HEARTHSIDE_KEY_ALIAS, HEARTHSIDE_KEY_PASSWORD) or create android/keystore.properties');
}
writeFileSync(join(android, 'local.properties'), `sdk.dir=${sdk}\n`);

const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, env, stdio: 'inherit' });
run('npm', ['run', 'build']);
run('npx', ['cap', 'sync', 'android']);
run('./gradlew', ['assembleRelease', `-PhearthsideVersionName=${version}`, `-PhearthsideVersionCode=${versionCode}`], android);

const apk = join(android, 'app/build/outputs/apk/release/app-release.apk');
if (!existsSync(apk)) throw new Error('assembleRelease finished without a signed app-release.apk (is signing configured?)');
mkdirSync(join(root, 'release-builds'), { recursive: true });
const target = join(root, 'release-builds', `hearthside-life-${version}.apk`);
copyFileSync(apk, target);
console.log(`wrote ${target}`);
