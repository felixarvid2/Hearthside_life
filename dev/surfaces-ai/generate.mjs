// Generates raw surface sources with fal.ai FLUX.2 [dev] (fal-ai/flux-2) and caches them in raw/ (gitignored).
// A cached file is never fetched again, so rebuilds are free. Appends every real call to LEDGER.md and refuses
// a call that would take the fal-ai/flux-2 total past BUDGET. The key is read at run time from
// /home/user/apis/Fal.ai (or $FAL_KEY_FILE) and is never printed.
//
// Sources are data: dev/surfaces-ai/sources/<group>.mjs, each `export default [{ id, kind, prompt, w?, h?, seed? }]`
// with kind 'material' (greyscale detail map), 'motif' (one isolated motif, black on white) or 'mural' (wide scene).
//   node dev/surfaces-ai/generate.mjs --group walls-a        (every missing source of the group)
//   node dev/surfaces-ai/generate.mjs id1 id2                 (these ids, from any group)
//   node dev/surfaces-ai/generate.mjs --group pilot --dry     (list what would be fetched and the cost)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'raw');
const LEDGER = path.join(HERE, 'LEDGER.md');
const DEFAULT_MODEL = 'fal-ai/flux-2';
/** Dollars per megapixel (fal-ai/flux-2); other models are billed per image at the old flat price. */
const PER_MP = { 'fal-ai/flux-2': 0.012 };
/**
 * Budget for the whole M10 surfaces job on fal-ai/flux-2 (the ledger rows are summed). The account had $7.36 left
 * when the ledger stood at $0.98, so the hard cap is $8.34; 7.6 leaves room for calls in flight in parallel runs.
 */
export const BUDGET = 7.6;
const CONCURRENCY = 4;

export const BASE = 'seamless tileable material texture, flat orthographic front view, even soft diffuse lighting, no shadows, no perspective, no border, fills the whole frame, highly detailed, photographic';

/** Record only: id -> prompt of the FLUX.1 [dev] sources behind the 14 shipped maps. New sources live in sources/<group>.mjs. */
export const MAPS = {
  'floor-wood-wide': 'wide plank hardwood floor seen from above, boards about 20 cm wide running horizontally, natural oak grain, a few small knots, thin dark seams between boards, staggered joints',
  'floor-wood-reclaimed': 'reclaimed barnwood floorboards seen from above, weathered distressed rough planks of varying widths running horizontally, deep grain, cracks, nail holes, worn edges',
  'floor-wood-lvp': 'luxury vinyl plank flooring seen from above, narrow long planks about 12 cm wide running horizontally, fine uniform wood grain print, tight beveled seams, staggered end joints',
  'floor-marble': 'polished marble floor slabs seen from above, soft grey veining on white stone, large square slabs with hairline joints',
  'floor-slate': 'natural cleft slate flagstone floor seen from above, irregular rectangular pieces, rough riven surface, narrow grout joints',
  'floor-travertine': 'travertine stone floor seen from above, square tiles about 40 cm with fine grout lines, horizontal fissures and small pits in the stone',
  'floor-berber': 'berber loop pile carpet close up from above, chunky looped wool yarn, flecked speckled texture',
  'floor-sisal': 'sisal natural fibre woven rug close up from above, coarse basket weave of rope-like strands',
  'floor-aggregate': 'exposed aggregate concrete surface seen from above, small rounded pebbles set in cement, even distribution',
  'floor-gravel': 'pea gravel garden path seen from above, small rounded pebbles of mixed sizes, tightly packed',
  'floor-grass': 'short mown lawn grass seen from above, tiny dense blades, subtle natural variation',
  'wall-roughcast': 'rough hand-troweled plaster wall, soft trowel sweeps, tiny pits and grains, matte, uneven',
  'wall-grasscloth': 'grasscloth wallpaper close up, woven natural grass fibre strands running horizontally, uneven slubs and knots, subtle',
  'wall-rubble': 'rustic rubble stone wall, irregular fitted stones of many sizes with mortar joints, front view',
  'wall-slate': 'stacked slate ledgestone wall cladding, thin layered rectangular strips of varied length, front view',
  'wall-boardformed': 'board-formed concrete wall, horizontal wood formwork grain imprinted in the surface, faint tie holes, front view',
  'wall-marble': 'polished marble wall with dramatic bold dark veining on pale stone, front view',
  // second round: structure-free sources (joints and grout are drawn by the painters, only the material is generated)
  'grain-oak': 'close up of oak wood grain, one continuous surface of wood, parallel straight grain lines running horizontally with gentle cathedral figure and a few tiny knots, no joints, no seams, no boards',
  'grain-barn': 'close up of weathered grey barnwood grain, rough cracked surface with deep horizontal grain lines and small nail holes, one continuous surface, no joints',
  'grain-fine': 'close up of fine straight wood grain veneer, very uniform parallel fine lines running horizontally, no figure, no knots, one continuous surface, no joints',
  'stone-marble': 'close up of a polished white marble slab with soft grey veining, a single continuous surface, no tile joints, no grid',
  'stone-travertine': 'close up of travertine stone, warm beige, horizontal fissures and small pits, a single continuous surface, no tile joints, no grid',
  'fibre-sisal': 'close up of a sisal rug weave, thick rope-like natural fibre strands woven in a basket pattern, coarse, high contrast, top view',
  'concrete-aggregate': 'exposed aggregate concrete close up, many small rounded stones tightly packed and evenly distributed in cement, top view, no stripes',
  'wall-concrete': 'close up of raw concrete surface with subtle horizontal wood-grain impressions and small pores, one continuous surface, no joints, no panels, no tie holes',
};

/** FLUX.1 sources behind the 14 shipped maps (see LEDGER.md). Record only: nothing here is fetched any more. */
export const SHIPPED = [
  'floor-slate', 'floor-berber', 'floor-gravel', 'floor-grass', 'wall-roughcast', 'wall-grasscloth', 'wall-rubble', 'wall-slate',
  'grain-oak', 'grain-barn', 'stone-marble', 'fibre-sisal', 'concrete-aggregate', 'wall-concrete',
];

/** Prompt suffix per source kind. */
export const SUFFIX = {
  material: BASE,
  motif: 'a single isolated motif, solid black ink on a pure white background, centred with a wide white margin, flat graphic, crisp clean edges, no shading, no texture, no frame, no text',
  mural: 'wide panoramic mural artwork, soft flat painted style, limited tonal range, no text, no frame, no people in the foreground',
};
export const DEFAULT_SIZE = { material: [1024, 1024], motif: [1024, 1024], mural: [1536, 768] };
export const GROUPS = ['walls-a', 'walls-b', 'walls-c', 'walls-d', 'walls-e', 'walls-f', 'floors-a', 'floors-b', 'floors-c', 'pilot'];

const readKey = () => {
  const k = fs.readFileSync(process.env.FAL_KEY_FILE || '/home/user/apis/Fal.ai', 'utf8').trim();
  return k.replace(/^[A-Za-z_]+=/, '');
};

export const hashSeed = (id) => [...id].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7) % 1000000;
export const costOf = (model, w, h) => (PER_MP[model] ?? 0.025) * (w * h) / 1e6;

/** Dollars already booked on a model in LEDGER.md (rows: | date | source | model | size | $cost | result |). */
export function ledgerTotal(model = DEFAULT_MODEL) {
  if (!fs.existsSync(LEDGER)) return 0;
  let total = 0;
  for (const line of fs.readFileSync(LEDGER, 'utf8').split('\n')) {
    const c = line.split('|').map((x) => x.trim());
    // c[0] is empty (leading bar): date c[1], source c[2], model c[3], size c[4], cost c[5]
    if (c.length < 7 || c[3] !== model) continue;
    const m = /^\$(\d+(?:\.\d+)?)$/.exec(c[5] ?? '');
    if (m) total += Number(m[1]);
  }
  return total;
}

async function loadGroup(group) {
  const mod = await import(pathToFileURL(path.join(HERE, 'sources', `${group}.mjs`)).href);
  return mod.default.map((s) => ({ ...s, group }));
}

/** Cached raw file of a source (png or jpg), or null. */
export function rawFile(id) {
  for (const ext of ['png', 'jpg']) {
    const f = path.join(RAW, `${id}.${ext}`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

function plan(src, model) {
  if (!SUFFIX[src.kind]) throw new Error(`source '${src.id}': kind must be material | motif | mural`);
  const [dw, dh] = DEFAULT_SIZE[src.kind];
  const w = src.w ?? dw, h = src.h ?? dh;
  return {
    ...src, w, h, model, seed: src.seed ?? hashSeed(src.id), ext: src.kind === 'motif' ? 'png' : 'jpg',
    fullPrompt: `${src.prompt}. ${SUFFIX[src.kind]}`, cost: costOf(model, w, h),
  };
}

async function post(key, model, body) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`https://fal.run/${model}`, {
      method: 'POST', headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (r.ok) return r.json();
    if (attempt === 0 && (r.status >= 500 || r.status === 429)) { await new Promise((res) => setTimeout(res, 2500)); continue; }
    throw new Error(`HTTP ${r.status}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const val = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const group = val('--group');
  const model = val('--model') ?? DEFAULT_MODEL;
  const ids = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--group' && args[i - 1] !== '--model');
  if (!group && !ids.length) { console.error('usage: generate.mjs --group <name> | <id ...> [--dry]'); process.exit(2); }
  const all = [];
  for (const g of group ? [group] : GROUPS) all.push(...await loadGroup(g));
  const chosen = group && !ids.length ? all : all.filter((s) => ids.includes(s.id));
  for (const id of ids) if (!chosen.some((s) => s.id === id)) console.error(`unknown source id ${id}`);
  const todo = chosen.filter((s) => !rawFile(s.id)).map((s) => plan(s, model));
  let spent = ledgerTotal(model);
  const sum = todo.reduce((t, p) => t + p.cost, 0);
  console.log(`${todo.length} to fetch, ${chosen.length - todo.length} cached, est. $${sum.toFixed(3)} (ledger so far $${spent.toFixed(3)} of $${BUDGET})`);
  if (dry) { for (const p of todo) console.log(` would fetch ${p.id} ${p.kind} ${p.w}x${p.h} $${p.cost.toFixed(4)}`); return; }
  if (!todo.length) return;
  fs.mkdirSync(RAW, { recursive: true });
  const key = readKey();
  const queue = [...todo];
  let inflight = 0;
  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      // refuse a call that would pass the budget: re-read the ledger before every call (other groups run in
      // parallel and append to it) and add this run's calls in flight
      spent = ledgerTotal(model) + inflight;
      if (spent + p.cost > BUDGET + 1e-9) { console.log(`${p.id} skipped (budget $${BUDGET} would be passed)`); continue; }
      inflight += p.cost;
      spent += p.cost;
      try {
        const body = {
          prompt: p.fullPrompt, image_size: { width: p.w, height: p.h }, seed: p.seed, enable_safety_checker: false,
          output_format: p.ext === 'png' ? 'png' : 'jpeg',
        };
        const j = await post(key, p.model, body);
        const url = j.images?.[0]?.url;
        if (!url) throw new Error('no image in response');
        fs.writeFileSync(path.join(RAW, `${p.id}.${p.ext}`), Buffer.from(await (await fetch(url)).arrayBuffer()));
        fs.writeFileSync(path.join(RAW, `${p.id}.json`), JSON.stringify({ model: p.model, seed: p.seed, prompt: p.fullPrompt, kind: p.kind, size: [p.w, p.h] }, null, 1));
        fs.appendFileSync(LEDGER, `| ${new Date().toISOString().slice(0, 10)} | ${p.id} | ${p.model} | ${p.w}x${p.h} | $${p.cost.toFixed(4)} | ${p.group} ${p.kind} |\n`);
        inflight -= p.cost;
        console.log(`${p.id} ok  total $${(ledgerTotal(model) + inflight).toFixed(3)}`);
      } catch (e) {
        inflight -= p.cost; // a failed request is not billed
        spent -= p.cost;
        console.log(`${p.id} failed (${e.message})  total $${spent.toFixed(3)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
