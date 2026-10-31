// Review step: one summary card per member, every validation issue with a Fix button (jumps to the step and
// member), and the Move In button (disabled while anything is invalid).

import { memberName, STEP_NAMES, TIE_NAMES, type CreatorIssue } from '../../../characters/creator';
import { OUTFIT_CATEGORY_NAMES } from '../../../characters/outfits';
import { button } from '../../kit/components';
import { h } from '../../kit/dom';
import { icon } from '../../kit/icons';
import { categoryOfIssue } from './clothing';
import { careerSummary } from './personality';
import type { CreatorContext, StepDef } from '../context';
import { hint, initials, noteBox, section } from '../widgets';

export function fixIssue(ctx: CreatorContext, issue: CreatorIssue): void {
  if (issue.step === 'clothing') {
    const c = categoryOfIssue(issue.message);
    if (c) { ctx.ui.clothingCategory = c.category; ctx.ui.outfitIndex[c.category] = c.index; }
  }
  if (issue.step === 'faceBody') {
    const m = issue.message;
    ctx.ui.faceBodySection = /^(Body|Choose a body frame|The body preset)/.test(m) ? 'body'
      : /^Skin/.test(m) ? 'skin'
        : /^(Eye|Brow|Choose a brow)/.test(m) ? 'eyes'
          : /^(Lip|Freckles|Blush)/.test(m) ? 'details' : 'face';
  }
  ctx.goTo(issue.step, issue.member, issue.message);
}

export const reviewStep: StepDef = {
  key: (ctx) => `${ctx.session.version}`,
  build(ctx) {
    const s = ctx.session;
    const content = ctx.api.content;
    const v = s.validate();
    const d = s.draft;

    const cards = d.members.map((m, i) => {
      const issues = v.members[i] ?? [];
      const url = ctx.portraitOf(i);
      const traits = m.traits.map((id) => content.traits[id]?.name ?? id);
      const asp = m.aspirationId ? content.aspirations[m.aspirationId]?.name ?? m.aspirationId : 'None';
      const career = m.careerId ? content.careers[m.careerId] : undefined;
      const job = career ? `${career.name}: ${careerSummary(career)}` : m.careerId ?? 'No job';
      const worn = m.outfits.current;
      const hairName = content.hair?.[m.appearance.hair.styleId]?.name ?? m.appearance.hair.styleId;
      const row = (label: string, value: string) => h('div', { class: 'cr-sum-row' }, h('dt', { text: label }), h('dd', { text: value }));
      const edit = button({ label: 'Edit', icon: 'id', small: true, onClick: () => ctx.goTo('identity', i) });
      edit.classList.add('cr-btn');
      return h('article', { class: ['cr-summary', issues.length > 0 && 'has-issues'] },
        h('div', { class: 'cr-summary-head' },
          h('span', { class: 'cr-summary-portrait' }, url ? h('img', { attrs: { src: url, alt: '' } }) : initials(m.firstName, m.lastName, i)),
          h('div', { class: 'cr-summary-name' },
            h('h3', { text: memberName(m, i) }),
            h('span', { class: 'cr-summary-status' }, icon(issues.length > 0 ? 'warning' : 'check', 16), issues.length > 0 ? `${issues.length} to fix` : 'Ready to move in')),
          edit),
        h('dl', { class: 'cr-sum' },
          row('Pronouns', `${m.pronouns.subject}/${m.pronouns.object}/${m.pronouns.possessive}`),
          row('Traits', traits.length > 0 ? traits.join(', ') : 'None yet'),
          row('Aspiration', asp),
          row('Job', job),
          row('Hair', hairName),
          row('Wears', `${OUTFIT_CATEGORY_NAMES[worn.category]}: ${m.outfits.outfits[worn.category]?.[worn.index]?.name ?? 'missing'}`)));
    });

    const ties = d.ties.filter((t) => t.tie !== 'none').map((t) => `${memberName(d.members[t.b], t.b)} is ${memberName(d.members[t.a], t.a)}'s ${TIE_NAMES[t.tie].toLowerCase()}.`);

    const issueRows = v.issues.map((issue) => {
      const who = issue.member !== null ? memberName(d.members[issue.member], issue.member) : 'Household';
      const fix = button({ label: 'Fix', icon: 'next', small: true, onClick: () => fixIssue(ctx, issue) });
      fix.classList.add('cr-btn', 'cr-fix');
      fix.setAttribute('aria-label', `Fix: ${who}, ${issue.message}`);
      return h('li', { class: 'cr-fix-row' },
        icon('warning', 18),
        h('span', { class: 'cr-fix-text' }, h('strong', { text: `${who} · ${STEP_NAMES[issue.step]}` }), h('span', { text: issue.message })),
        fix);
    });

    const el = h('div', { class: 'cr-step cr-step-review' },
      v.ok
        ? noteBox(`Everything is ready. ${d.members.length === 1 ? 'Move in' : 'Move everyone in'} when you are happy.`, 'info')
        : section(`${v.issues.length} ${v.issues.length === 1 ? 'thing' : 'things'} to fix before moving in`, h('ul', { class: 'cr-fix-list', role: 'list' }, ...issueRows)),
      section(`${d.name.trim() || d.members[0]?.lastName || 'Household'} (${d.members.length} ${d.members.length === 1 ? 'person' : 'people'})`,
        h('div', { class: 'cr-summaries' }, ...cards)),
      section('Relationships', ties.length > 0 ? h('ul', { class: 'cr-report-list' }, ...ties.map((t) => h('li', { text: t }))) : hint('No relationships set.')),
    );
    return { el, sync: () => { /* rebuilt on every change */ } };
  },
};
