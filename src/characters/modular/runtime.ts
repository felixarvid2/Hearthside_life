// What the 'quaternius' character style needs besides the regular character assets: the manifest and the shared,
// reference-counted GLB cache. Held on CharacterAssets.modular while the style is active.

import { ModularAssetCache } from './cache';
import { loadModularManifest, validateManifest } from './manifest';
import type { ModularManifest } from './types';

export interface ModularRuntime {
  manifest: ModularManifest;
  cache: ModularAssetCache;
}

/** Loads the manifest and creates the cache. Rejects when the manifest is missing or invalid. */
export async function loadModularRuntime(baseUrl: string): Promise<ModularRuntime> {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const manifest = await loadModularManifest(base);
  const problems = validateManifest(manifest);
  if (problems.length) throw new Error(`modular manifest is invalid: ${problems.slice(0, 3).join(' ')}`);
  return { manifest, cache: new ModularAssetCache({ root: `${base}characters/modular/` }) };
}
