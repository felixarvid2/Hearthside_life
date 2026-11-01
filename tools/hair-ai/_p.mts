import { runnerImport } from 'vite';
import { readModel } from './mesh.mts';
import { segment } from './segment.mts';
import { plotViews } from './plot.mts';
import { applyTransform, fitHead } from './register.mts';
const hs = (await runnerImport('/home/user/hearthside_life/src/characters/headShape.ts')).module as any;
const cols = hs.headColumns(72), rows = hs.headRows();
const surf: number[] = [], face: number[] = [];
for (const h of rows) for (const th of cols) { const p = hs.headPoint(th, h); surf.push(...p); if (Math.abs(th) < 0.9 || h > 0.15) face.push(...p); }
for (const id of process.argv.slice(2)) {
  const m = await readModel(`/home/user/hearthside_life/dev/hair-ai/raw/${id}.glb`);
  const s = segment(m);
  const n = m.pos.length/3;
  // ear level and init
  const B=60, xw=new Array(B).fill(0);
  const head: number[] = [];
  for (let i=0;i<n;i++){ if (s.hair[i]) continue; const y=m.pos[i*3+1]!; const b=Math.min(B-1,Math.floor((y+0.5)*B)); xw[b]=Math.max(xw[b], Math.abs(m.pos[i*3]!)); }
  let yE=0, best=0; for (let b=Math.floor(B*0.25); b<B; b++) if (xw[b]>best){best=xw[b]; yE=b/B-0.5+0.5/B;}
  const s0 = 0.17/(2*best);
  const ty = 0.083 - s0*yE;
  for (let i=0;i<n;i++){ if (s.hair[i]) continue; const y=m.pos[i*3+1]!; if (y < yE-0.4) continue; head.push(m.pos[i*3]!,y,m.pos[i*3+2]!); }
  console.log(id, 'yE', yE.toFixed(3), 'xw', best.toFixed(3), 's0', s0.toFixed(3), 'head pts', head.length/3);
  const t0 = Date.now();
  const fit = fitHead({ head: new Float32Array(head), surface: new Float32Array(surf), face: new Float32Array(face) }, { scale: s0, ty });
  console.log(' fit', JSON.stringify(fit), (Date.now()-t0)+'ms');
  const q: [number,number,number] = [0,0,0]; const HL:number[]=[], GL:number[]=[];
  for (let i=0;i<n;i++){ applyTransform(fit.T, m.pos, i*3, q); (s.hair[i]?HL:GL).push(...q); }
  await plotViews(`/tmp/claude-0/-home-user/2ec7b1aa-454b-50e7-8c1b-3408dd96ca0a/scratchpad/fit_${id}.png`, [{pts:GL,color:[150,150,150]},{pts:HL,color:[220,120,90]},{pts:surf,color:[0,0,255]}], {range:0.2, center:[0,0.07,0]});
}
