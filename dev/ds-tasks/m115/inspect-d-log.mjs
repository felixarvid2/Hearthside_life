import fs from 'node:fs';
const f = process.argv[2] ?? 'shots/D/d-log-full.json';
const j = JSON.parse(fs.readFileSync(f, 'utf8'));
console.log(Object.keys(j));
const vp = j.viewports ?? j.results ?? j;
console.log(JSON.stringify(vp).slice(0, 1500));
