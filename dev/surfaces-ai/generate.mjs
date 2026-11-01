// Generates raw surface texture sources with fal.ai (flux/dev) and caches them in raw/ (gitignored).
// A cached file is never fetched again, so rebuilds are free. Appends every real call to LEDGER.md.
// The key is read at runtime from /home/user/apis/Fal.ai (or $FAL_KEY_FILE) and is never printed.
//   node dev/surfaces-ai/generate.mjs [id ...]      (no ids = every missing shipped source)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'raw');
const LEDGER = path.join(HERE, 'LEDGER.md');
const COST = { 'fal-ai/flux/dev': 0.025, 'fal-ai/flux/schnell': 0.003 };

const BASE = 'seamless tileable material texture, flat orthographic front view, even soft diffuse lighting, no shadows, no perspective, no border, fills the whole frame, highly detailed, photographic';

/** id -> prompt. Greyscale detail only matters, so colour words are kept neutral. */
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

/** Sources behind the shipped maps (see LEDGER.md); the other prompts above were superseded and are only kept for the record. */
export const SHIPPED = [
  'floor-slate', 'floor-berber', 'floor-gravel', 'floor-grass', 'wall-roughcast', 'wall-grasscloth', 'wall-rubble', 'wall-slate',
  'grain-oak', 'grain-barn', 'stone-marble', 'fibre-sisal', 'concrete-aggregate', 'wall-concrete',
];

const readKey = () => {
  let k = fs.readFileSync(process.env.FAL_KEY_FILE || '/home/user/apis/Fal.ai', 'utf8').trim();
  return k.replace(/^[A-Za-z_]+=/, '');
};

async function main() {
  fs.mkdirSync(RAW, { recursive: true });
  const ids = process.argv.slice(2);
  const todo = (ids.length ? ids : SHIPPED).filter((id) => MAPS[id]);
  const key = readKey();
  const model = 'fal-ai/flux/dev';
  for (const id of todo) {
    const out = path.join(RAW, `${id}.jpg`);
    if (fs.existsSync(out)) { console.log('cached', id); continue; }
    const seed = [...id].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7) % 1000000;
    const body = { prompt: `${MAPS[id]}. ${BASE}`, image_size: { width: 1024, height: 1024 }, num_images: 1, num_inference_steps: 28, guidance_scale: 3.5, seed, enable_safety_checker: false, output_format: 'jpeg' };
    const r = await fetch(`https://fal.run/${model}`, { method: 'POST', headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { console.error('failed', id, r.status); continue; }
    const j = await r.json();
    const url = j.images?.[0]?.url;
    if (!url) { console.error('no image', id); continue; }
    fs.writeFileSync(out, Buffer.from(await (await fetch(url)).arrayBuffer()));
    fs.writeFileSync(path.join(RAW, `${id}.json`), JSON.stringify({ model, seed, prompt: body.prompt }, null, 1));
    const row = `| ${new Date().toISOString().slice(0, 10)} | ${id} | ${model} | 1024x1024 | $${COST[model].toFixed(3)} |\n`;
    fs.appendFileSync(LEDGER, row);
    console.log('generated', id);
  }
}
main();
