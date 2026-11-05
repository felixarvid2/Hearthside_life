// Milestone 10 furniture: one file per catalog group in this folder, each exporting a record { modelName: builderFn }
// (builders return a kit.mjs Model; see dev/ds-tasks/m10f/AUTHORING.md). Every other .mjs file here is collected
// automatically; two groups (or a group and the base models) defining the same model name is a hard error.
// A group's content lives in src/content/objectsM10/<group>.ts.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));

/** group name -> { modelName: builderFn }, in file-name order. */
export const M10_GROUPS = {};
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.mjs') && f !== 'index.mjs').sort()) {
  const group = file.slice(0, -4);
  const mod = await import(/* @vite-ignore */ `./${file}`);
  const record = mod.default ?? mod.MODELS;
  if (!record || typeof record !== 'object') throw new Error(`m10/${file}: export default a record { modelName: builderFn }`);
  M10_GROUPS[group] = record;
}
