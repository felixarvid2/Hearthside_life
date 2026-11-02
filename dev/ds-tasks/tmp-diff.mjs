import fs from 'node:fs';

const t = fs.readFileSync('dev/ds-tasks/logs/unit-m6-final.log', 'utf8');
const m = t.match(/- (\{"schemaVersion".*)\n\+ (\{"schemaVersion".*)\n/);
if (!m) { console.log('no match'); process.exit(0); }
const a = JSON.parse(m[1]);
const b = JSON.parse(m[2]);
const diffs = [];
function walk(x, y, p) {
  if (typeof x !== typeof y || x === null || y === null) {
    if (x !== y) diffs.push([p, x, y]);
    return;
  }
  if (typeof x !== 'object') {
    if (x !== y) diffs.push([p, x, y]);
    return;
  }
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    if (!(k in x)) { diffs.push([p + '/' + k, '<missing>', y[k]]); continue; }
    if (!(k in y)) { diffs.push([p + '/' + k, x[k], '<missing>']); continue; }
    walk(x[k], y[k], p + '/' + k);
  }
}
walk(a, b, '');
console.log('diffs', diffs.length);
for (const d of diffs.slice(0, 50)) console.log(JSON.stringify(d).slice(0, 500));
