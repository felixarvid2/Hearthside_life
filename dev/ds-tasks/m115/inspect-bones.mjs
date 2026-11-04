// Task H helper: prints the hand-region nodes of a character GLB's node hierarchy (bind-pose TRS), for designing
// the grip table in src/render/handProps.ts. Not part of the game build.
import { readFileSync } from 'node:fs';
const f = process.argv[2];
if (!f) throw new Error('usage: node dev/ds-tasks/m115/inspect-bones.mjs <glb>');
const buf = readFileSync(f);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const nodes = json.nodes;
const byName = new Map();
nodes.forEach((n, i) => { if (n.name) byName.set(n.name, i); });
console.log('meshes', json.meshes?.length, 'skins', json.skins?.length, 'nodes', nodes.length);
const want = ['root', 'pelvis', 'hand_l', 'hand_r', 'middle_01_l', 'middle_01_r', 'lowerarm_l', 'lowerarm_r', 'thumb_01_l', 'index_01_l', 'index_01_r'];
for (const name of want) {
  const i = byName.get(name);
  if (i === undefined) { console.log(name, 'MISSING'); continue; }
  const n = nodes[i];
  console.log(i, name, 'T', n.translation, 'R', n.rotation, 'S', n.scale, 'children', n.children);
}
const skin = json.skins?.[0];
if (skin) console.log('joints', skin.joints.length, skin.joints.map((j) => nodes[j].name).join(','));
