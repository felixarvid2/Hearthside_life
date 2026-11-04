import { it } from 'vitest';
import { WALLS_E } from '../../../src/content/surfaces3/walls-e';
import { paletteTone } from '../../../src/content/surfaces';
it('t', () => { const out: string[] = []; for (const d of WALLS_E) { const t = new Set(d.palettes.map(paletteTone)); const miss = ['light','dark','neutral','accent'].filter(x=>!t.has(x as never)); if (miss.length) out.push(d.id + ' missing ' + miss.join(',') + ' :: ' + d.palettes.map(p=>p.id+':'+paletteTone(p)).join(' ')); } throw new Error('\n' + out.join('\n')); });
