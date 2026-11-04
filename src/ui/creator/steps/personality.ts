// Personality step: exactly three traits as cards grouped by category (opposites disabled with the reason),
// aspiration cards with their stages, likes/dislikes chips by group and the starting job.

import { MAX_DISLIKES, MAX_LIKES, TRAITS_PER_ADULT } from '../../../characters/creator';
import { ADULT_STAGES } from '../../../core/relations';
import type { AspirationDef, CareerDef, TraitCategory } from '../../../content/types';
import { h, setText, toggleClass } from '../../kit/dom';
import { icon } from '../../kit/icons';
import type { StepDef } from '../context';
import { Binder, card, hint, section, smallButton } from '../widgets';

const TRAIT_CATEGORY_NAMES: Record<TraitCategory, string> = {
  social: 'Social', tidiness: 'Tidiness', energy: 'Energy and activity', creativity: 'Creativity and curiosity',
  leisure: 'Food and leisure', lifestyle: 'Ambition and lifestyle',
};
const TRAIT_CATEGORY_ORDER: readonly TraitCategory[] = ['social', 'tidiness', 'energy', 'creativity', 'leisure', 'lifestyle'];
const PREF_GROUP_NAMES: Record<string, string> = { activity: 'Activities', music: 'Music', decor: 'Decor styles', food: 'Food', topic: 'Conversation topics', weather: 'Weather' };
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function days(list: readonly number[]): string {
  const sorted = [...list].sort((a, b) => a - b);
  const contiguous = sorted.every((d, i) => i === 0 || d === (sorted[i - 1] as number) + 1);
  if (contiguous && sorted.length > 2) return `${DAY_SHORT[sorted[0] as number]}-${DAY_SHORT[sorted[sorted.length - 1] as number]}`;
  return sorted.map((d) => DAY_SHORT[d]).join(', ');
}

/** "Starts as Dishwasher, $14/hour, Mon-Fri 10:00-16:00". */
export function careerSummary(c: CareerDef): string {
  const l = c.levels[0];
  if (!l) return c.description;
  return `Starts as ${l.title}, ${money(l.hourlyWage)}/hour, ${days(l.days)} ${clock(l.start)}-${clock(l.end)}`;
}

function stagesBox(a: AspirationDef | undefined): HTMLElement {
  if (!a) return h('p', { class: 'cr-hint', text: 'Choose an aspiration to see its stages.' });
  return h('ol', { class: 'cr-asp-stages' }, ...a.stages.map((st, i) => h('li', { class: 'cr-asp-stage' },
    h('div', { class: 'cr-asp-stage-name', text: `Stage ${i + 1}: ${st.name}` }),
    h('ul', { class: 'cr-asp-goals' }, ...st.objectives.map((o) => h('li', { text: o.text }))),
    h('div', { class: 'cr-asp-reward', text: `Reward: ${st.reward.text}` }))));
}

export const personalityStep: StepDef = {
  key: (ctx) => `${ctx.session.currentIndex}`,
  build(ctx) {
    const s = () => ctx.session;
    const p = () => ctx.session.current;
    const content = ctx.api.content;
    const b = new Binder();

    // ---- traits
    const counter = h('span', { class: 'cr-counter-big', attrs: { 'aria-live': 'polite' } });
    const traitWrap = h('div', { class: 'cr-trait-groups' });
    const traitCards = new Map<string, ReturnType<typeof card>>();
    const all = s().traitOptions();
    for (const catId of TRAIT_CATEGORY_ORDER) {
      const inCat = all.filter((o) => o.def.category === catId);
      if (inCat.length === 0) continue;
      const grid = h('div', { class: 'cr-card-grid cr-trait-grid' });
      for (const o of inCat) {
        const c = card({
          title: o.def.name, meta: o.def.effectText[0], desc: o.def.description, icon: o.def.icon, role: 'checkbox',
          onClick: () => ctx.report(s().toggleTrait(o.def.id)),
          onDisabledClick: (reason) => ctx.status(`${o.def.name}: ${reason}`, 'warning'),
        });
        c.el.title = o.def.effectText.join(' ');
        traitCards.set(o.def.id, c);
        grid.appendChild(c.el);
      }
      traitWrap.appendChild(h('div', { class: 'cr-trait-group' },
        h('h4', { class: 'cr-group-label', text: `${TRAIT_CATEGORY_NAMES[catId] ?? catId} (${inCat.length})` }), grid));
    }
    const effects = h('div', { class: 'cr-effects' });
    b.fn(() => {
      const opts = s().traitOptions();
      for (const o of opts) traitCards.get(o.def.id)?.set({ selected: o.selected, disabled: !o.enabled, ...(o.reason ? { reason: o.reason } : {}) });
      const n = p().traits.length;
      setText(counter, `${n} of ${TRAITS_PER_ADULT} chosen`);
      toggleClass(counter, 'is-done', n === TRAITS_PER_ADULT);
      effects.replaceChildren(...p().traits.map((id) => {
        const d = content.traits[id];
        return h('div', { class: 'cr-effect' }, h('strong', { text: d?.name ?? id }), h('span', { text: d ? ` ${d.effectText.join(' ')}` : '' }));
      }));
    });

    // ---- aspiration (adults only; children and teens choose one when they grow up)
    const aspirations = Object.values(content.aspirations ?? {}).filter((a) => a.status === 'ready');
    const aspGrid = h('div', { class: 'cr-card-grid', role: 'radiogroup', ariaLabel: 'Aspirations' });
    const aspCards = aspirations.map((a) => {
      const c = card({
        title: a.name, desc: a.description, icon: a.icon, onClick: () => ctx.report(s().setAspiration(a.id)),
        onDisabledClick: (reason) => ctx.status(`Aspiration: ${reason}`, 'warning'),
      });
      aspGrid.appendChild(c.el);
      return { a, c };
    });
    const stageHost = h('div', { class: 'cr-asp-host' });
    const aspAdultHint = hint('Aspirations are for adults. Children and teens can choose one when they grow up.');
    aspAdultHint.hidden = ADULT_STAGES.includes(p().lifeStage);
    let lastAsp: string | null | undefined;
    b.fn(() => {
      const adult = ADULT_STAGES.includes(p().lifeStage);
      aspAdultHint.hidden = adult;
      for (const { a, c } of aspCards) {
        c.set({ selected: adult && p().aspirationId === a.id, disabled: !adult, ...(adult ? {} : { reason: 'Aspirations are for adults.' }) });
      }
      if (lastAsp !== p().aspirationId) {
        lastAsp = p().aspirationId;
        const a = lastAsp ? content.aspirations[lastAsp] : undefined;
        stageHost.replaceChildren(a ? h('h4', { class: 'cr-group-label', text: `${a.name}: stages` }) : '', stagesBox(a));
      }
    });

    // ---- likes and dislikes
    const prefs = content.preferences ?? [];
    const modeLikes = h('button', { type: 'button', class: 'seg', role: 'radio' });
    const modeDislikes = h('button', { type: 'button', class: 'seg', role: 'radio' });
    modeLikes.addEventListener('click', () => { ctx.ui.prefMode = 'likes'; b.sync(); });
    modeDislikes.addEventListener('click', () => { ctx.ui.prefMode = 'dislikes'; b.sync(); });
    const modeRow = h('div', { class: 'field' }, h('div', { class: 'field-label', text: 'Tap to mark as' }),
      h('div', { class: 'segmented', role: 'radiogroup', ariaLabel: 'Mark preferences as' }, modeLikes, modeDislikes));
    const groups = [...new Set(prefs.map((x) => x.group))];
    const prefChips = new Map<string, HTMLButtonElement>();
    const prefWrap = h('div', { class: 'cr-pref-groups' }, ...groups.map((g) => h('div', { class: 'cr-pref-group' },
      h('h4', { class: 'cr-group-label', text: PREF_GROUP_NAMES[g] ?? g }),
      h('div', { class: 'chips cr-chips' }, ...prefs.filter((x) => x.group === g).map((x) => {
        const btn = h('button', { type: 'button', class: 'chip cr-chip cr-pref' },
          h('span', { class: 'cr-pref-icon cr-pref-like' }, icon('heart', 16)),
          h('span', { class: 'cr-pref-icon cr-pref-dislike' }, icon('minus', 16)),
          h('span', { text: x.name }),
          h('span', { class: 'cr-pref-state' }));
        btn.addEventListener('click', () => ctx.report(ctx.ui.prefMode === 'likes' ? s().toggleLike(x.id) : s().toggleDislike(x.id)));
        prefChips.set(x.id, btn);
        return btn;
      })))));
    b.fn(() => {
      const likes = p().likes, dislikes = p().dislikes;
      setText(modeLikes, `Likes (${likes.length} of ${MAX_LIKES})`);
      setText(modeDislikes, `Dislikes (${dislikes.length} of ${MAX_DISLIKES})`);
      for (const [btn, on] of [[modeLikes, ctx.ui.prefMode === 'likes'], [modeDislikes, ctx.ui.prefMode === 'dislikes']] as const) {
        toggleClass(btn, 'is-selected', on);
        btn.setAttribute('aria-checked', String(on));
      }
      for (const [id, btn] of prefChips) {
        const state = likes.includes(id) ? 'like' : dislikes.includes(id) ? 'dislike' : 'none';
        btn.dataset.state = state;
        setText(btn.querySelector('.cr-pref-state') as HTMLElement, state === 'like' ? 'Like' : state === 'dislike' ? 'Dislike' : '');
        btn.setAttribute('aria-pressed', String(state !== 'none'));
      }
    });

    // ---- job
    const careers = Object.values(content.careers ?? {}).filter((c) => c.status === 'ready' && !c.partTime);
    const jobGrid = h('div', { class: 'cr-card-grid', role: 'radiogroup', ariaLabel: 'Starting job' });
    const noJob = card({ title: 'No job', desc: 'Free to look for work later, or not at all.', icon: 'home', onClick: () => ctx.report(s().setCareer(null)) });
    jobGrid.appendChild(noJob.el);
    const jobCards = careers.map((c) => {
      const cd = card({ title: c.name, meta: careerSummary(c), desc: c.description, icon: c.icon || 'briefcase', onClick: () => ctx.report(s().setCareer(c.id)) });
      jobGrid.appendChild(cd.el);
      return { c, cd };
    });
    b.fn(() => {
      noJob.set({ selected: p().careerId === null });
      for (const { c, cd } of jobCards) cd.set({ selected: p().careerId === c.id });
    });

    const el = h('div', { class: 'cr-step cr-step-personality' },
      section('Traits', h('div', { class: 'cr-sec-row' }, hint(`Pick exactly ${TRAITS_PER_ADULT}. Opposites cannot be combined.`), counter), traitWrap, effects),
      section('Aspiration', aspirations.length > 0 ? aspGrid : hint('No aspirations are available yet.'), aspAdultHint, stageHost),
      section('Likes and dislikes', prefs.length > 0 ? modeRow : null, prefs.length > 0 ? prefWrap : hint('No preferences are available yet.'),
        hint(`Up to ${MAX_LIKES} likes and ${MAX_DISLIKES} dislikes. Marking something moves it from the other list.`)),
      section('Starting job', jobGrid),
      h('div', { class: 'cr-actions' }, smallButton('Reset personality', 'undo', () => ctx.report(s().resetCategory('personality')))),
    );
    return { el, sync: () => b.sync() };
  },
};
