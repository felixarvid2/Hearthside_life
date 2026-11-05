// Task F helper: list the files under src/ that differ from a reference checkout, e.g.
//   node dev/ds-tasks/m12/f-diff.mjs /path/to/main-ref
// Used to bisect a regression against main; keep it for future comparison work.
import fs from 'node:fs';
import path from 'node:path';

const ref = process.argv[2];
if (!ref) {
  console.error('usage: node dev/ds-tasks/m12/f-diff.mjs <reference-checkout>');
  process.exit(2);
}
const a = path.resolve('src');
const b = path.resolve(ref, 'src');
const walk = (d, base = '') => {
  const out = [];
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name), r = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(p, r)); else out.push(r);
  }
  return out;
};
const A = new Set(walk(a)), B = new Set(walk(b));
const diffs = [];
for (const f of A) {
  if (!B.has(f)) { diffs.push(`ONLY-CURRENT ${f}`); continue; }
  if (fs.readFileSync(path.join(a, f), 'utf8') !== fs.readFileSync(path.join(b, f), 'utf8')) diffs.push(`DIFF ${f}`);
}
for (const f of B) if (!A.has(f)) diffs.push(`ONLY-REF ${f}`);
console.log(diffs.join('\n'));
