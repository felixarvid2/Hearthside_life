// Person panel: name and mood with reasons, and tabs Needs, Queue, Relationships, Career, Skills, Aspiration,
// Traits. Reads api.state()/api.content only; orders go through api.cancel/api.reorder. Each tab rebuilds its
// DOM only when its data signature changes; need meters and progress bars update in place.

import type { ContentDB } from '../../content/types';
import { formatClock, formatDuration } from '../../core/clock';
import type { Person, WorldState } from '../../core/types';
import { NEED_IDS } from '../../core/types';
import { button, meter, panel, tabs, type Panel } from '../kit/components';
import { h, setChildren, setText, toggleClass } from '../kit/dom';
import { icon } from '../kit/icons';
import {
  NEED_LABELS, actionProgress, actionTarget, formatDays, formatMoney, formatShiftHours, humanize, initials, interactionIcon,
  interactionName, memoryRow, moodTone, objectiveProgress, phaseLabel, promotionRequirements, relationshipRows, shiftPay, shiftStatusText,
  skillProgress, type MemoryRow, type RelationshipRow,
} from './format';
import { awayText } from './strip';
import type { PersonTab, Shell } from './shell';

const TABS: Array<{ id: PersonTab; label: string; icon: string }> = [
  { id: 'needs', label: 'Needs', icon: 'heart' },
  { id: 'queue', label: 'Queue', icon: 'clock' },
  { id: 'relationships', label: 'People', icon: 'people' },
  { id: 'career', label: 'Career', icon: 'briefcase' },
  { id: 'skills', label: 'Skills', icon: 'chart' },
  { id: 'aspiration', label: 'Aspiration', icon: 'star' },
  { id: 'traits', label: 'Traits', icon: 'sparkle' },
];

export interface PersonPanel {
  panel: Panel;
  open(personId: string, tab?: PersonTab): void;
  close(): void;
  personId(): string | null;
  refresh(): void;
}

/** Bar for -100..100 values: fills from the centre, with a signed number (never colour alone). */
function signedBar(label: string, value: number, kind: 'friend' | 'trust' | 'romance' | 'perf'): HTMLElement {
  const v = Math.max(-100, Math.min(100, Math.round(value)));
  const fill = h('div', { class: ['sbar-fill', v < 0 && 'is-neg'] });
  fill.style.left = v >= 0 ? '50%' : `${50 + v / 2}%`;
  fill.style.width = `${Math.abs(v) / 2}%`;
  return h('div', { class: ['sbar', `sbar-${kind}`], role: 'meter', ariaLabel: `${label} ${v}`, attrs: { 'aria-valuemin': -100, 'aria-valuemax': 100, 'aria-valuenow': v } },
    h('span', { class: 'sbar-label', text: label }),
    h('div', { class: 'sbar-track' }, h('div', { class: 'sbar-mid' }), fill),
    h('span', { class: 'sbar-value', text: v > 0 ? `+${v}` : String(v) }));
}

function progress(label: string, frac: number | null, text: string): HTMLElement {
  const fill = h('div', { class: 'pbar-fill' });
  const el = h('div', { class: ['pbar', frac === null && 'is-indeterminate'], role: 'progressbar', ariaLabel: label },
    h('div', { class: 'pbar-track' }, fill), h('span', { class: 'pbar-text', text }));
  if (frac !== null) { fill.style.width = `${Math.round(frac * 100)}%`; el.setAttribute('aria-valuenow', String(Math.round(frac * 100))); }
  return el;
}

function empty(text: string, iconName = 'info'): HTMLElement {
  return h('div', { class: 'pp-empty' }, icon(iconName, 22), h('p', { text }));
}

export function createPersonPanel(sh: Shell, onClosed: () => void): PersonPanel {
  const { api } = sh;
  const db: ContentDB = api.content;
  let pid: string | null = null;
  let tab: PersonTab = 'needs';
  const sigs = new Map<PersonTab, string>();

  const p = panel({ title: 'Person', className: 'person-panel', initialHeight: 'half', onClose: () => { pid = null; onClosed(); } });
  const moodChip = h('span', { class: 'mood-chip' });
  const doing = h('span', { class: 'pp-doing' });
  const reasons = h('ul', { class: 'mood-reasons', ariaLabel: 'Mood reasons' });
  const head = h('div', { class: 'pp-head' }, h('div', { class: 'pp-head-row' }, moodChip, doing), reasons);
  const tabBar = tabs({ label: 'Person details', items: TABS, value: tab, onChange: (id) => { setTab(id as PersonTab); sh.sound('click'); } });
  const content = h('div', { class: 'pp-content', role: 'tabpanel' });
  const sticky = h('div', { class: 'pp-sticky' }, head, tabBar.el);
  p.body.append(sticky, content);

  // Needs tab keeps its meters between refreshes
  let needMeters: Array<{ id: (typeof NEED_IDS)[number]; m: ReturnType<typeof meter> }> = [];
  // Queue tab keeps a handle on the running action's progress bar
  let queueProgress: { el: HTMLElement; actionId: string } | null = null;

  const setTab = (id: PersonTab) => {
    tab = id;
    tabBar.select(id);
    sigs.delete(id);
    content.scrollTop = 0;
    p.body.scrollTop = 0;
    if (id === 'needs') sh.tutorialSignal({ type: 'needsChecked' });
    refresh();
  };

  const person = (): Person | undefined => (pid ? api.state()?.people[pid] : undefined);

  // ---------------------------------------------------------------------------------------------

  const renderNeeds = (st: WorldState, pr: Person) => {
    const sig = `needs:${pr.id}`;
    if (sigs.get('needs') !== sig) {
      sigs.set('needs', sig);
      needMeters = NEED_IDS.map((id) => ({ id, m: meter({ label: NEED_LABELS[id], icon: id, value: pr.needs[id] }) }));
      const away = awayText(pr);
      setChildren(content,
        h('div', { class: 'pp-needs' }, ...needMeters.map((n) => n.m.el)),
        away ? h('p', { class: 'pp-note' }, icon('briefcase', 18), h('span', { text: `${away.label}${away.back ? ` · ${away.back}` : ''}. Needs change more slowly while away.` })) : null,
      );
    }
    for (const n of needMeters) {
      const v = pr.needs[n.id];
      n.m.set(v, v < 20 ? `${Math.round(v)} !` : `${Math.round(v)}`);
    }
    void st;
  };

  const renderQueue = (st: WorldState, pr: Person) => {
    const sig = `queue:${pr.id}:${pr.location.kind}:${pr.queue.map((a) => `${a.id}/${a.phase}/${a.cancelRequested ? 1 : 0}`).join(',')}`;
    if (sigs.get('queue') !== sig) {
      sigs.set('queue', sig);
      queueProgress = null;
      const items: HTMLElement[] = [];
      if (pr.location.kind !== 'lot') {
        const away = awayText(pr);
        items.push(empty(`${pr.firstName} is away${away ? ` (${away.label.toLowerCase()}${away.back ? `, ${away.back.toLowerCase()}` : ''})` : ''}. Orders can be given when ${pr.pronouns.subject} is home.`, 'briefcase'));
      }
      const [cur, ...rest] = pr.queue;
      if (cur) {
        const prog = h('div', { class: 'q-progress' });
        queueProgress = { el: prog, actionId: cur.id };
        const target = actionTarget(st, db, cur);
        const cancelBtn = button({ icon: 'close', label: cur.cancelRequested ? 'Stopping' : 'Cancel', small: true, variant: 'secondary', disabled: cur.cancelRequested, onClick: () => { api.cancel(pr.id, cur.id); sh.sound('close'); } });
        cancelBtn.setAttribute('aria-label', `Cancel ${interactionName(db, cur.interactionId)}`);
        items.push(h('div', { class: 'q-current' },
          h('div', { class: 'q-row' },
            h('span', { class: 'q-icon' }, icon(interactionIcon(db, cur.interactionId), 22)),
            h('div', { class: 'q-text' },
              h('span', { class: 'q-kicker', text: 'Now' }),
              h('span', { class: 'q-name', text: `${interactionName(db, cur.interactionId)}${target ? ` ${target}` : ''}` }),
              h('span', { class: 'q-phase', text: phaseLabel(cur) })),
            cancelBtn),
          prog));
      } else if (pr.location.kind === 'lot') {
        items.push(empty('Nothing to do right now. Tap an object or a person in the world to give an order.', 'clock'));
      }
      if (rest.length) {
        items.push(h('h3', { class: 'pp-subhead', text: `Up next (${rest.length})` }));
        const list = h('ol', { class: 'q-list' });
        rest.forEach((a, i) => {
          const index = i + 1; // index in the full queue
          const name = interactionName(db, a.interactionId);
          const target = actionTarget(st, db, a);
          const up = button({ icon: 'up', iconOnly: true, variant: 'ghost', label: `Move ${name} earlier`, disabled: index <= 1, onClick: () => { api.reorder(pr.id, a.id, index - 1); sh.sound('click'); } });
          const down = button({ icon: 'down', iconOnly: true, variant: 'ghost', label: `Move ${name} later`, disabled: index >= pr.queue.length - 1, onClick: () => { api.reorder(pr.id, a.id, index + 1); sh.sound('click'); } });
          const x = button({ icon: 'close', iconOnly: true, variant: 'ghost', label: `Cancel ${name}`, disabled: a.cancelRequested, onClick: () => { api.cancel(pr.id, a.id); sh.sound('close'); } });
          list.appendChild(h('li', { class: 'q-item' },
            h('span', { class: 'q-icon' }, icon(interactionIcon(db, a.interactionId), 20)),
            h('div', { class: 'q-text' }, h('span', { class: 'q-name', text: `${name}${target ? ` ${target}` : ''}` }), a.source === 'autonomy' ? h('span', { class: 'q-phase', text: 'Own idea' }) : null),
            h('div', { class: 'q-actions' }, up, down, x)));
        });
        items.push(list);
      }
      content.replaceChildren(...items);
    }
    const cur = pr.queue[0];
    if (queueProgress && cur && cur.id === queueProgress.actionId) {
      const frac = actionProgress(cur, pr, db);
      const text = frac === null ? phaseLabel(cur) : cur.duration ? `${formatDuration(Math.max(0, cur.duration - cur.elapsed))} left` : `${Math.round(frac * 100)} %`;
      const key = `${frac === null ? 'x' : Math.round(frac * 100)}|${text}`;
      if (queueProgress.el.dataset.key !== key) {
        queueProgress.el.dataset.key = key;
        queueProgress.el.replaceChildren(progress(`${interactionName(db, cur.interactionId)} progress`, frac, text));
      }
    }
  };

  /** Rows whose memory list is expanded; kept across rebuilds. */
  const openMemories = new Set<string>();

  const memoryList = (rows: MemoryRow[], more: number): HTMLElement => h('ul', { class: 'mem-list' }, ...rows.map((m) => h('li', { class: ['mem', `mem-${m.importance}`, m.resolved && 'is-resolved'] },
    h('span', { class: 'mem-when', text: m.when }),
    h('span', { class: 'mem-text' },
      m.importance === 3 ? h('span', { class: 'mem-star', title: 'Milestone, kept for good', ariaLabel: 'Milestone' }, icon('star', 14)) : null,
      h('span', { text: `${m.text}${m.count > 1 ? ` (x${m.count})` : ''}${m.resolved ? ' - settled' : ''}` })))),
    more > 0 ? h('li', { class: 'mem mem-more', text: `and ${more} older` }) : null);

  const relationRow = (st: WorldState, r: RelationshipRow): HTMLElement => {
    const other = st.people[r.otherId];
    const url = api.portrait(r.otherId);
    const av = url ? h('img', { class: 'rel-avatar', attrs: { src: url, alt: '' } }) : h('span', { class: 'rel-avatar rel-initials', text: other ? initials(other) : '?', attrs: { 'aria-hidden': 'true' } });
    const details = h('details', { class: 'rel-more' }, h('summary', { class: 'rel-more-sum' }, icon('clock', 14), h('span', { text: `Memories (${r.memories.length + r.moreMemories})` })), memoryList(r.memories, r.moreMemories));
    details.open = openMemories.has(r.otherId);
    details.addEventListener('toggle', () => { if (details.open) openMemories.add(r.otherId); else openMemories.delete(r.otherId); });
    return h('li', { class: 'rel-row', dataset: { label: r.label } },
      av,
      h('div', { class: 'rel-main' },
        h('div', { class: 'rel-head' }, h('span', { class: 'rel-name', text: r.name }),
          h('span', { class: 'rel-tags' },
            h('span', { class: ['tag', 'tag-label', `tag-${r.label}`], title: `How ${other?.firstName ?? 'they'} ${r.sameHousehold ? 'and you' : 'feel'}`, text: r.labelText }),
            r.family && r.family !== r.labelText ? h('span', { class: 'tag tag-family', text: r.family }) : null,
            r.sameHousehold ? h('span', { class: 'tag tag-home', text: 'Household' }) : null)),
        signedBar('Friendship', r.friendship, 'friend'),
        signedBar('Trust', r.trust, 'trust'),
        r.showRomance ? signedBar('Romance', r.romance, 'romance') : null,
        r.effects.length ? h('ul', { class: 'rel-effects' }, ...r.effects.map((e) => h('li', {}, icon('clock', 13), h('span', { text: e })))) : null,
        r.memories.length ? details : null));
  };

  const renderRelationships = (st: WorldState, pr: Person) => {
    const rows = relationshipRows(st, pr.id);
    const life = pr.memories.filter((m) => !m.withId).sort((a, b) => b.at - a.at).slice(0, 6).map(memoryRow);
    const sig = `rel:${pr.id}:${rows.map((r) => `${r.otherId}/${Math.round(r.friendship)}/${Math.round(r.trust)}/${Math.round(r.romance)}/${r.label}/${r.family}/${r.memories.map((m) => `${m.id}.${m.count}.${m.resolved ? 1 : 0}`).join('+')}/${r.moreMemories}/${r.effects.join('|')}`).join(',')}|${life.map((m) => m.id).join('')}|${portraitsKey(rows.map((r) => r.otherId))}`;
    if (sigs.get('relationships') === sig) return;
    sigs.set('relationships', sig);
    const canPlan = pr.householdId === st.activeHouseholdId && !pr.isNpc && ['youngAdult', 'adult', 'elder'].includes(pr.lifeStage);
    const toolbar = canPlan ? h('div', { class: 'rel-toolbar' }, button({ icon: 'phone', label: 'Plan an event', small: true, variant: 'secondary', title: 'Date, dinner party, house party or celebration', onClick: () => { sh.sound('open'); sh.openEventPlanner(pr.id); } })) : null;
    if (!rows.length) { content.replaceChildren(...(toolbar ? [toolbar] : []), empty(`${pr.firstName} does not know anyone yet. Say hello to a neighbour!`, 'people')); return; }
    const nodes: HTMLElement[] = [...(toolbar ? [toolbar] : []), h('ul', { class: 'rel-list' }, ...rows.map((r) => relationRow(st, r)))];
    if (life.length) nodes.push(h('h3', { class: 'pp-subhead', text: 'Life events' }), memoryList(life, 0));
    content.replaceChildren(...nodes);
  };

  const renderCareer = (st: WorldState, pr: Person) => {
    const c = pr.career;
    const def = c ? db.careers[c.careerId] : undefined;
    const lvl = c && def ? def.levels.find((l) => l.level === c.level) : undefined;
    const status = c ? shiftStatusText(st, c, lvl) : '';
    const reqs = c ? promotionRequirements(db, pr, c) : null;
    const sig = `career:${pr.id}:${c ? `${c.careerId}/${c.level}/${Math.round(c.performance)}/${c.shift?.status}/${c.daysWorked}/${status}/${reqs?.map((r) => r.text + r.met).join(';')}` : 'none'}`;
    if (sigs.get('career') === sig) return;
    sigs.set('career', sig);
    if (!c) {
      content.replaceChildren(h('div', { class: 'career-none' }, h('span', { class: 'career-icon' }, icon('briefcase', 28)), h('div', {},
        h('h3', { text: 'No job' }), h('p', { text: `${pr.firstName} has no job right now. A job brings a daily schedule, wages and promotions.` }))));
      return;
    }
    const name = def?.name ?? humanize(c.careerId);
    const items: Array<HTMLElement | null> = [
      h('div', { class: 'career-head' }, h('span', { class: 'career-icon' }, icon(def?.icon ?? 'briefcase', 28)), h('div', {},
        h('h3', { text: name }),
        h('p', { class: 'career-title', text: `Level ${c.level}${def ? ` of ${def.levels.length}` : ''}${lvl ? ` · ${lvl.title}` : ''}` }))),
      h('dl', { class: 'facts' },
        h('dt', { text: 'Schedule' }), h('dd', { text: lvl ? `${formatDays(lvl.days)}, ${formatShiftHours(lvl)}` : 'Unknown' }),
        h('dt', { text: 'Today' }), h('dd', { text: status }),
        h('dt', { text: 'Pay per shift' }), h('dd', { text: lvl ? `${formatMoney(shiftPay(lvl))} (${formatMoney(lvl.hourlyWage)} an hour)` : 'Unknown' }),
        h('dt', { text: 'Days worked' }), h('dd', { text: String(c.daysWorked) })),
      h('h3', { class: 'pp-subhead', text: 'Performance' }),
      signedBar('Performance', c.performance, 'perf'),
    ];
    if (reqs && reqs.length) {
      const next = def?.levels.find((l) => l.level === c.level + 1);
      items.push(h('h3', { class: 'pp-subhead', text: `Promotion${next ? ` to ${next.title}` : ''}` }));
      items.push(h('ul', { class: 'req-list' }, ...reqs.map((r) => h('li', { class: ['req', r.met && 'is-met'] }, icon(r.met ? 'check' : 'clock', 18), h('span', { text: `${r.met ? 'Done: ' : 'Needed: '}${r.text}` })))));
    } else if (reqs) {
      items.push(h('p', { class: 'pp-note' }, icon('star', 18), h('span', { text: 'Top of the career. Well done!' })));
    }
    if (c.shift?.status === 'atWork' && lvl) items.push(h('p', { class: 'pp-note' }, icon('clock', 18), h('span', { text: `Expected home around ${formatClock(lvl.end)}.` })));
    content.replaceChildren(...items.filter((x): x is HTMLElement => !!x));
  };

  const renderSkills = (_st: WorldState, pr: Person) => {
    const entries = Object.entries(pr.skills).filter(([, s]) => s.level > 1 || s.xp > 0).sort((a, b) => b[1].level - a[1].level || b[1].xp - a[1].xp);
    const sig = `skills:${pr.id}:${entries.map(([id, s]) => `${id}/${s.level}/${Math.floor(s.xp)}`).join(',')}`;
    if (sigs.get('skills') === sig) return;
    sigs.set('skills', sig);
    if (!entries.length) { content.replaceChildren(empty('No skills yet. Cooking, reading, exercising and practising build skills.', 'chart')); return; }
    content.replaceChildren(h('ul', { class: 'skill-list' }, ...entries.map(([id, s]) => {
      const def = db.skills[id];
      const max = def ? def.thresholds.length + 1 : 10;
      const frac = def ? skillProgress(def.thresholds, s.level, s.xp) : 0;
      return h('li', { class: 'skill-row' },
        h('span', { class: 'q-icon' }, icon(def?.icon ?? 'chart', 20)),
        h('div', { class: 'skill-main' },
          h('div', { class: 'skill-head' }, h('span', { class: 'skill-name', text: def?.name ?? humanize(id) }), h('span', { class: 'skill-level', text: `Level ${s.level} of ${max}` })),
          s.level >= max ? h('span', { class: 'pbar-text', text: 'Maximum level' }) : progress(`${def?.name ?? id} progress`, frac, `${Math.round(frac * 100)} % to level ${s.level + 1}`)));
    })));
  };

  const renderAspiration = (st: WorldState, pr: Person) => {
    const a = pr.aspiration;
    const def = a ? db.aspirations[a.aspirationId] : undefined;
    const stage = a && def ? def.stages[Math.min(a.stage, def.stages.length - 1)] : undefined;
    const objs = a && stage ? stage.objectives.map((o) => objectiveProgress(st, db, pr, o, a.progress)) : [];
    const sig = `asp:${pr.id}:${a ? `${a.aspirationId}/${a.stage}/${a.completedStages}/${objs.map((o) => o.display + o.done).join(';')}` : 'none'}`;
    if (sigs.get('aspiration') === sig) return;
    sigs.set('aspiration', sig);
    if (!a) { content.replaceChildren(empty(`${pr.firstName} has no aspiration yet.`, 'star')); return; }
    if (!def) { content.replaceChildren(empty(`Aspiration: ${humanize(a.aspirationId)} (details unavailable).`, 'star')); return; }
    const allDone = a.completedStages >= def.stages.length;
    content.replaceChildren(
      h('div', { class: 'career-head' }, h('span', { class: 'career-icon' }, icon(def.icon || 'star', 28)), h('div', {}, h('h3', { text: def.name }), h('p', { class: 'career-title', text: def.description }))),
      h('ol', { class: 'stage-list' }, ...def.stages.map((sg, i) => {
        const state = i < a.completedStages || allDone ? 'done' : i === a.stage ? 'current' : 'locked';
        const label = state === 'done' ? 'Completed' : state === 'current' ? 'Current stage' : 'Later';
        return h('li', { class: ['stage', `is-${state}`] },
          h('div', { class: 'stage-head' }, icon(state === 'done' ? 'check' : state === 'current' ? 'star' : 'lock', 18), h('span', { class: 'stage-name', text: `${i + 1}. ${sg.name}` }), h('span', { class: 'tag', text: label })),
          state === 'current' && !allDone ? h('ul', { class: 'obj-list' }, ...objs.map((o) => h('li', { class: ['obj', o.done && 'is-met'] },
            h('div', { class: 'obj-head' }, icon(o.done ? 'check' : 'clock', 16), h('span', { text: o.text })),
            progress(o.text, Math.min(1, o.target ? o.current / o.target : 0), o.done ? `Done (${o.display})` : o.display)))) : null,
          h('p', { class: 'stage-reward' }, icon('money', 16), h('span', { text: `Reward: ${sg.reward.text || formatMoney(sg.reward.money)}` })));
      })),
    );
  };

  const renderTraits = (_st: WorldState, pr: Person) => {
    const sig = `traits:${pr.id}:${pr.traits.join(',')}`;
    if (sigs.get('traits') === sig) return;
    sigs.set('traits', sig);
    if (!pr.traits.length) { content.replaceChildren(empty('No traits.', 'sparkle')); return; }
    content.replaceChildren(h('ul', { class: 'trait-list' }, ...pr.traits.map((id) => {
      const t = db.traits[id];
      return h('li', { class: 'trait-card' },
        h('div', { class: 'trait-head' }, h('span', { class: 'q-icon' }, icon(t?.icon ?? 'sparkle', 20)), h('span', { class: 'trait-name', text: t?.name ?? humanize(id) })),
        t?.description ? h('p', { class: 'trait-desc', text: t.description }) : null,
        t?.effectText.length ? h('ul', { class: 'trait-effects' }, ...t.effectText.map((e) => h('li', { text: e }))) : null);
    })));
  };

  const portraitsKey = (ids: string[]) => ids.map((id) => (api.portrait(id) ? 1 : 0)).join('');

  // ---------------------------------------------------------------------------------------------

  let headSig = '';
  const refresh = () => {
    if (!p.isOpen()) return;
    const st = api.state();
    const pr = person();
    if (!st || !pr) { close(); return; }
    const mood = api.mood(pr.id);
    const cur = pr.queue[0];
    const away = awayText(pr);
    const doingText = away ? `${away.label}${away.back ? ` · ${away.back}` : ''}` : cur ? `${interactionName(db, cur.interactionId)}` : 'Idle';
    const hs = `${pr.id}|${pr.firstName} ${pr.lastName}|${mood.label}|${moodTone(mood.value)}|${mood.reasons.join(';')}|${doingText}`;
    if (hs !== headSig) {
      headSig = hs;
      p.setTitle(`${pr.firstName} ${pr.lastName}`);
      p.el.setAttribute('aria-label', `${pr.firstName} ${pr.lastName}`);
      moodChip.dataset.tone = moodTone(mood.value);
      moodChip.replaceChildren(icon('face', 18), h('span', { text: `Mood: ${mood.label}` }));
      setText(doing, doingText);
      reasons.replaceChildren(...mood.reasons.slice(0, 6).map((r) => {
        // Reasons usually carry a signed number ("Lonely (-12)"); style by that sign, neutral when there is none.
        const m = /([+\-\u2212])\s?\d/.exec(r);
        const neg = m ? m[1] !== '+' : false;
        return h('li', { class: ['reason', m ? (neg ? 'is-neg' : 'is-pos') : 'is-neutral'] }, h('span', { text: r }));
      }));
      reasons.hidden = mood.reasons.length === 0;
    }
    switch (tab) {
      case 'needs': renderNeeds(st, pr); break;
      case 'queue': renderQueue(st, pr); break;
      case 'relationships': renderRelationships(st, pr); break;
      case 'career': renderCareer(st, pr); break;
      case 'skills': renderSkills(st, pr); break;
      case 'aspiration': renderAspiration(st, pr); break;
      case 'traits': renderTraits(st, pr); break;
      default: break;
    }
    toggleClass(p.el, 'is-away', !!away);
  };

  const open = (personId: string, t?: PersonTab) => {
    const changed = personId !== pid;
    pid = personId;
    if (changed) { sigs.clear(); headSig = ''; }
    p.open();
    setTab(t ?? tab);
  };

  const close = () => { if (p.isOpen()) { p.close(); pid = null; onClosed(); } };

  return { panel: p, open, close, personId: () => pid, refresh };
}
