// Task D: list the node/mesh tree and bounds of furniture GLBs, so we can see which doors/lids are separate nodes.
// Usage: node dev/ds-tasks/m115/inspect-objects.mjs [asset ...]
// Default: the assets task D cares about (fridges, stove, microwave, dishwasher, washer, wardrobe, shower, bath,
// sink, toilet).
import { NodeIO } from '@gltf-transform/core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../../../', import.meta.url);
const rootPath = fileURLToPath(root);
const manifest = JSON.parse(readFileSync(new URL('public/assets/manifest.json', root), 'utf8'));

const DEFAULT = [
  'kitchenFridge', 'kitchenFridgeLarge', 'kitchenFridgeSmall', 'kitchenFridgeBuiltIn',
  'kitchenStove', 'kitchenStoveElectric', 'kitchenMicrowave', 'dishwasher', 'washer', 'dryer',
  'bookcaseClosedDoors', 'bookcaseClosedWide', 'bookcaseClosed',
  'shower', 'showerRound', 'bathtub', 'kitchenSink', 'bathroomSink', 'bathroomSinkSquare',
  'toilet', 'toiletSquare',
];

const assets = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;
const io = new NodeIO();

function meshBounds(mesh) {
  // GLTF mesh primitives carry POSITION accessors with min/max in the accessor.
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const aMin = pos.getMin([]);
    const aMax = pos.getMax([]);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], aMin[i]);
      max[i] = Math.max(max[i], aMax[i]);
    }
  }
  const r = (v) => v.map((n) => Math.round(n * 1000) / 1000);
  return { min: r(min), max: r(max) };
}

function fmt(v) { return '[' + v.map((n) => (Math.round(n * 1000) / 1000).toFixed(3)).join(', ') + ']'; }

for (const asset of assets) {
  const entry = manifest.furniture[asset];
  if (!entry) { console.log(`## ${asset}: NOT IN MANIFEST`); continue; }
  const doc = await io.readBinary(readFileSync(`${rootPath}public/assets/${entry.file}`));
  console.log(`\n## ${asset}  file=${entry.file}  manifestBounds=${fmt(entry.min)}..${fmt(entry.max)}`);
  console.log(`   materials: ${entry.materials.map((m) => `${m.name}=rgb(${m.color.map((c) => Math.round(c * 255)).join(',')})`).join(', ')}`);
  const walk = (node, depth) => {
    const pad = '  '.repeat(depth);
    const mesh = node.getMesh();
    const t = node.getTranslation();
    const r = node.getRotation();
    const s = node.getScale();
    const extra = [];
    if (t.some((v) => v !== 0)) extra.push(`t=${fmt(t)}`);
    if (r.some((v, i) => v !== (i === 3 ? 1 : 0))) extra.push(`r=${fmt(r)}`);
    if (s.some((v) => v !== 1)) extra.push(`s=${fmt(s)}`);
    const name = node.getName();
    if (mesh) {
      const b = meshBounds(mesh);
      const prims = mesh.listPrimitives().map((p) => p.getMaterial()?.getName() ?? '?');
      console.log(`${pad}- [node] ${JSON.stringify(name)} mesh=${JSON.stringify(mesh.getName())} prims=${prims.join('/')} bounds=${fmt(b.min)}..${fmt(b.max)} ${extra.join(' ')}`);
    } else if (name) {
      console.log(`${pad}- [node] ${JSON.stringify(name)} ${extra.join(' ')}`);
    }
    for (const child of node.listChildren()) walk(child, depth + 1);
  };
  for (const scene of doc.getRoot().listScenes()) {
    console.log(`   scene ${JSON.stringify(scene.getName())}`);
    for (const child of scene.listChildren()) walk(child, 2);
  }
}
