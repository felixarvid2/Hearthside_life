// Person panel: name and mood with reasons, and tabs Needs, Queue, Relationships, Career, Skills, Aspiration,
// Traits. Reads api.state()/api.content only; orders go through api.cancel/api.reorder. Each tab rebuilds its
// DOM only when its data signature changes; need meters and progress bars update in place.

import type { ContentDB } from '../../content/types';
import { formatClock, formatDuration } from '../../core/clock';
import type { Person, WorldState } from '../../core/types';
import { NEED_IDS } from '../../core/types';
import { button, confirmDialog, meter, panel, segmented, tabs, toast, type Panel } from '../kit/components';
import { h, setChildren, setText, toggleClass } from '../kit/dom';
import { icon } from '../kit/icons';
import {
  NEED_LABELS, actionProgress, actionTarget, formatDays, formatMoney, formatShiftHours, humanize, initials, interactionIcon,
  interactionName, memoryRow, moodTone, objectiveProgress, phaseLabel, promotionRequirements, relationshipRows, shiftPay, shiftStatusText,
  skillProgress, type MemoryRow, type RelationshipRow,
} from './format';
import { awayText } from './strip';
import { familyTree } from '../creator/familyTree';
import { careersForStage } from '../../sim/careers';
import { openAdoptDialog, openSplitDialog } from './familyDialogs';
import { birthdayText, stageName, treeModel } from './familyModel';
import type { PersonTab, Shell } from './shell';
import type { HintId } from './hintState';
import { openObjectPicker } from './objectPicker';
import { openGoHerePicker, openPersonPicker } from './placePicker';

const TABS: Array<{ id: PersonTab; label: string; icon: string }> = [
  { id: 'needs', label: 'Needs', icon: 'heart' },
  { id: 'queue', label: 'Queue', icon: 'clock' },
  { id: 'relationships', label: 'People', icon: 'people' },
  { id: 'career', label: 'Career', icon: 'briefcase' },
  { id: 'skills', label: 'Skills', icon: 'chart' },
  { id: 'aspiration', label: 'Aspiration', icon: 'star' },
  { id: 'traits', label: 'Traits', icon: 'sparkle' },
  { id: 'family', label: 'Family', icon: 'family' },
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
  const stageChip = h('span', { class: 'stage-chip' });
  const doing = h('span', { class: 'pp-doing' });
  const reasons = h('ul', { class: 'mood-reasons', ariaLabel: 'Mood reasons' });
  const head = h('div', { class: 'pp-head' }, h('div', { class: 'pp-head-row' }, moodChip, stageChip, doing), reasons);
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
    const hintFor: Partial<Record<PersonTab, HintId>> = { needs: 'needs', queue: 'queue', relationships: 'relationships', career: 'jobs' };
    const hf = hintFor[id];
    if (hf) sh.hint(hf);
    refresh();
  };

  const person = (): Person | undefined => (pid ? api.state()?.people[pid] : undefined);

  // ---------------------------------------------------------------------------------------------

  const renderNeeds = (st: WorldState, pr: Person) => {
    const sig = `needs:${pr.id}:${awayText(pr, st)?.label ?? ''}`;
    if (sigs.get('needs') !== sig) {
      sigs.set('needs', sig);
      needMeters = NEED_IDS.map((id) => ({ id, m: meter({ label: NEED_LABELS[id], icon: id, value: pr.needs[id] }) }));
      const away = awayText(pr, st);
      setChildren(content,
        h('div', { class: 'pp-needs' }, ...needMeters.map((n) => n.m.el)),
        away ? h('p', { class: 'pp-note' }, icon('briefcase', 18), h('span', { text: `${away.label}${away.back ? ` · ${away.back}` : ''}. Needs change more slowly while away.` })) : null,
      );
    }
    for (const n of needMeters) {
      const v = pr.needs[n.id];
      n.m.set(v);
    }
    void st;
  };

  const renderQueue = (st: WorldState, pr: Person) => {
    const sig = `queue:${pr.id}:${pr.location.kind}:${awayText(pr, st)?.label ?? ''}:${pr.queue.map((a) => `${a.id}/${a.phase}/${a.cancelRequested ? 1 : 0}`).join(',')}`;
    if (sigs.get('queue') !== sig) {
      sigs.set('queue', sig);
      queueProgress = null;
      const items: HTMLElement[] = [];
      if (pr.location.kind !== 'lot') {
        const away = awayText(pr, st);
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
        items.push(empty('Nothing to do right now. Tap an object or a person in the world, or use the buttons below, to give an order.', 'clock'));
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
      if (pr.location.kind === 'lot') {
        // a route to the world without pointing at it (keyboard, screen reader, or just a shortcut); after the queue so it never pushes it down
        items.push(h('div', { class: 'q-quick' },
          button({ icon: 'live', label: `${pr.firstName}'s actions`, small: true, variant: 'secondary', onClick: () => { sh.sound('click'); sh.openContextMenu(pr.id, { kind: 'person', personId: pr.id }); } }),
          button({ icon: 'box', label: 'Choose an object', small: true, variant: 'secondary', onClick: () => { sh.sound('open'); openObjectPicker(sh, pr.id); } }),
          button({ icon: 'people', label: 'Choose a person', small: true, variant: 'secondary', onClick: () => { sh.sound('open'); openPersonPicker(sh, pr.id); } }),
          button({ icon: 'move', label: 'Go somewhere', small: true, variant: 'secondary', onClick: () => { sh.sound('open'); openGoHerePicker(sh, pr.id); } })));
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
    if (pr.lifeStage === 'baby' || pr.lifeStage === 'toddler' || pr.lifeStage === 'child') { renderSchool(st, pr); return; }
    const teen = pr.lifeStage === 'teen';
    const c = pr.career;
    const def = c ? db.careers[c.careerId] : undefined;
    const lvl = c && def ? def.levels.find((l) => l.level === c.level) : undefined;
    const status = c ? shiftStatusText(st, c, lvl) : '';
    const reqs = c ? promotionRequirements(db, pr, c, st) : null;
    const pending = c?.pendingEvent ? db.careerEvents?.[c.pendingEvent.eventId] : undefined;
    // A teenager with a part-time job still goes to school, so the panel shows both.
    const school = teen ? api.family?.(pr.id)?.school ?? null : null;
    const schoolSig = school ? `${school.statusText}/${Math.round(school.performance)}/${school.grade}/${school.attended}/${school.missed}/${school.homeworkDue}` : 'none';
    const sig = `career:${pr.id}:${pr.lifeStage}:${schoolSig}:${c ? `${c.careerId}/${c.level}/${Math.round(c.performance)}/${c.shift?.status}/${c.daysWorked}/${status}/${c.effort ?? 'normal'}/${c.pendingEvent?.eventId ?? '-'}/${c.pendingEvent?.chosen ?? '-'}/${reqs?.map((r) => r.text + r.met).join(';')}` : 'none'}`;
    if (sigs.get('career') === sig) return;
    sigs.set('career', sig);
    const schoolNote = school
      ? h('div', { class: 'career-school' },
        h('h3', { class: 'pp-subhead', text: 'School' }),
        h('dl', { class: 'facts school-facts' },
          h('dt', { text: 'Today' }), h('dd', { text: school.statusText }),
          h('dt', { text: 'Grade' }), h('dd', { text: school.grade }),
          h('dt', { text: 'Homework' }), h('dd', { text: school.homeworkText })))
      : null;

    const quit = button({
      label: 'Quit this job', small: true, variant: 'secondary', onClick: () => {
        void confirmDialog({
          title: 'Quit this job?', text: `${pr.firstName} will leave ${def?.name ?? 'this career'} at level ${c?.level ?? 1}. A shift in progress is cancelled without pay.`,
          confirm: 'Quit job', danger: true,
        }).then((yes) => {
          if (!yes) return;
          const r = api.quitCareer?.(pr.id) ?? { ok: false, reason: 'That is not available here.' };
          if (!r.ok) toast(r.reason, 'error');
          else sh.sound('confirm');
        });
      },
    });
    if (!c) {
      const careers = careersForStage(db, pr.lifeStage);
      content.replaceChildren(
        ...(schoolNote ? [schoolNote] : []),
        h('div', { class: 'career-none' }, h('span', { class: 'career-icon' }, icon(teen ? 'clock' : 'briefcase', 28)), h('div', {},
          h('h3', { text: teen ? 'No part-time job' : 'No job' }),
          h('p', { text: teen
            ? `${pr.firstName} can take one part-time job around school. Shifts are after class and at weekends.`
            : `${pr.firstName} has no job right now. Take one below: each has a schedule, wages, promotions and perks.` }))),
        h('h3', { class: 'pp-subhead', text: teen ? 'Part-time jobs open to teens' : 'Open careers' }),
        careers.length === 0
          ? h('p', { class: 'pp-note', text: 'No jobs of that kind are open right now.' })
          : h('ul', { class: 'career-list' }, ...careers.map((d) => {
            const first = d.levels[0];
            return h('li', { class: 'career-choice' },
              h('span', { class: 'q-icon' }, icon(d.icon || 'briefcase', 22)),
              h('div', { class: 'career-choice-main' },
                h('span', { class: 'career-choice-name', text: d.name }),
                h('span', { class: 'career-choice-meta', text: `${d.description} Starting pay ${first ? `${formatMoney(first.hourlyWage)}/hour` : 'unknown'}.` })),
              button({
                label: 'Take job', small: true, variant: 'primary', onClick: () => {
                  const r = api.joinCareer?.(pr.id, d.id) ?? { ok: false, reason: 'That is not available here.' };
                  if (!r.ok) toast(r.reason, 'error');
                  else sh.sound('confirm');
                },
              }));
          })),
      );
      return;
    }
    const name = def?.name ?? humanize(c.careerId);
    const effort = c.effort ?? 'normal';
    const effortPicker = segmented<'slack' | 'normal' | 'hard'>({
      label: 'Work effort', value: effort,
      options: [{ id: 'slack', label: 'Slack off' }, { id: 'normal', label: 'Normal' }, { id: 'hard', label: 'Work hard' }],
      onChange: (v) => {
        const r = api.setCareerEffort?.(pr.id, v) ?? { ok: false, reason: 'That is not available here.' };
        if (!r.ok) toast(r.reason, 'error');
        else sh.sound('click');
      },
    });
    const items: Array<HTMLElement | null> = [
      h('div', { class: 'career-head' }, h('span', { class: 'career-icon' }, icon(def?.icon ?? 'briefcase', 28)), h('div', {},
        h('h3', { text: name }),
        h('p', { class: 'career-title', text: `${def?.partTime ? 'Part-time · ' : ''}Level ${c.level}${def ? ` of ${def.levels.length}` : ''}${lvl ? ` · ${lvl.title}` : ''}` }))),
      h('dl', { class: 'facts' },
        h('dt', { text: 'Schedule' }), h('dd', { text: lvl ? `${formatDays(lvl.days)}, ${formatShiftHours(lvl)}` : 'Unknown' }),
        h('dt', { text: 'Today' }), h('dd', { text: status }),
        h('dt', { text: 'Pay per shift' }), h('dd', { text: lvl ? `${formatMoney(shiftPay(lvl))} (${formatMoney(lvl.hourlyWage)} an hour)` : 'Unknown' }),
        h('dt', { text: 'Days worked' }), h('dd', { text: String(c.daysWorked) })),
      schoolNote,
      effortPicker.el,
      h('h3', { class: 'pp-subhead', text: 'Performance' }),
      signedBar('Performance', c.performance, 'perf'),
    ];
    if (lvl?.perks?.length) {
      items.push(h('h3', { class: 'pp-subhead', text: 'Perks' }));
      items.push(h('ul', { class: 'perk-list' }, ...lvl.perks.map((p) => h('li', {}, icon('star', 16), h('span', { text: p })))));
    }
    if (pending && c.pendingEvent) {
      const chosen = c.pendingEvent.chosen;
      items.push(h('div', { class: 'career-event' },
        h('div', { class: 'career-event-head' }, icon('briefcase', 18), h('strong', { text: pending.title })),
        h('p', { text: pending.text }),
        h('div', { class: 'career-event-options' }, ...pending.options.map((o) => button({
          label: o.label, small: true, variant: chosen === o.id ? 'primary' : 'secondary', disabled: !!chosen,
          onClick: () => {
            const r = api.resolveCareerEvent?.(pr.id, o.id) ?? { ok: false, reason: 'That is not available here.' };
            if (!r.ok) toast(r.reason, 'error');
            else sh.sound('confirm');
          },
        }))),
        chosen ? h('p', { class: 'pp-note' }, icon('check', 16), h('span', { text: `Decision made: ${pending.options.find((o) => o.id === chosen)?.label ?? chosen}.` })) : null,
      ));
    }
    if (reqs && reqs.length) {
      const next = def?.levels.find((l) => l.level === c.level + 1);
      items.push(h('h3', { class: 'pp-subhead', text: `Promotion${next ? ` to ${next.title}` : ''}` }));
      items.push(h('ul', { class: 'req-list' }, ...reqs.map((r) => h('li', { class: ['req', r.met && 'is-met'] }, icon(r.met ? 'check' : 'clock', 18), h('span', { text: `${r.met ? 'Done: ' : 'Needed: '}${r.text}` })))));
    } else if (reqs) {
      items.push(h('p', { class: 'pp-note' }, icon('star', 18), h('span', { text: def?.partTime ? 'Top of this job. Well done!' : 'Top of the career. Well done!' })));
    }
    if (c.shift?.status === 'atWork' && lvl) items.push(h('p', { class: 'pp-note' }, icon('clock', 18), h('span', { text: `Expected home around ${formatClock(lvl.end)}.` })));
    items.push(h('div', { class: 'career-actions' }, quit));
    content.replaceChildren(...items.filter((x): x is HTMLElement => !!x));
  };


  /** The School tab (children and teens): schedule, today, grade, homework. Babies and toddlers see a short note. */
  const renderSchool = (_st: WorldState, pr: Person) => {
    const info = api.family?.(pr.id)?.school ?? null;
    const sig = `school:${pr.id}:${pr.lifeStage}:${info ? `${info.status}/${info.statusText}/${Math.round(info.performance)}/${info.grade}/${info.lastGrade}/${info.attended}/${info.missed}/${info.homeworkDue}` : 'none'}`;
    if (sigs.get('career') === sig) return;
    sigs.set('career', sig);
    if (!info) {
      content.replaceChildren(empty(pr.lifeStage === 'baby' || pr.lifeStage === 'toddler'
        ? `${pr.firstName} is too little for school. Children start school as they grow up.`
        : `${pr.firstName} does not go to school.`, 'book'));
      return;
    }
    const hw = button({
      icon: 'book', label: 'Do homework', small: true, variant: 'primary', disabled: !info.homeworkDue,
      title: info.homeworkDue ? 'Sit down at a desk, table or computer' : info.homeworkText,
      onClick: () => {
        const r = api.doHomework?.(pr.id) ?? { ok: false, reason: 'That is not available here.' };
        if (!r.ok) toast(r.reason, 'warning'); else { sh.sound('confirm'); }
      },
    });
    content.replaceChildren(
      h('div', { class: 'career-head' }, h('span', { class: 'career-icon' }, icon('book', 28)), h('div', {},
        h('h3', { text: info.schoolName }),
        h('p', { class: 'career-title', text: `${info.days}, ${info.hours}` }))),
      h('dl', { class: 'facts school-facts' },
        h('dt', { text: 'Today' }), h('dd', { text: info.statusText }),
        h('dt', { text: 'Grade' }), h('dd', { text: `${info.grade}${info.lastGrade ? ` (last report card: ${info.lastGrade})` : ''}` }),
        h('dt', { text: 'Attendance' }), h('dd', { text: `${info.attended} days attended, ${info.missed} missed` }),
        h('dt', { text: 'Homework' }), h('dd', { text: info.homeworkText })),
      h('h3', { class: 'pp-subhead', text: 'Performance' }),
      signedBar('Performance', info.performance, 'perf'),
      h('p', { class: 'pp-note' }, icon('info', 18), h('span', { text: 'Going to school and doing homework raise performance; missing school and a low mood lower it. A parent or teen can use Help with Homework. A report card comes every week.' })),
      h('div', { class: 'career-actions' }, hw),
    );
  };

  /** The Family tab: stage and birthday, the tree, relatives and household actions (adopt, move out). */
  const renderFamily = (st: WorldState, pr: Person) => {
    const info = api.family?.(pr.id) ?? null;
    if (!info) { content.replaceChildren(empty('Family details are not available here.', 'family')); return; }
    const mine = pr.householdId === st.activeHouseholdId && !pr.isNpc;
    const sig = `family:${pr.id}:${info.stage}:${info.stageDays}:${info.daysToBirthday}:${info.aging}:${info.ageUp.ok}:${info.ageUp.reason ?? ''}:${info.adopt.ok}:${info.household.members}:${info.relatives.map((r) => `${r.id}.${r.text}.${r.stage}`).join(',')}:${info.treeIds.join('+')}:${Object.keys(st.people).length}`;
    if (sigs.get('family') === sig) return;
    sigs.set('family', sig);
    const fraction = info.stageLength ? Math.min(1, info.stageDays / info.stageLength) : null;
    const items: Array<HTMLElement | null> = [
      h('div', { class: 'family-stage' },
        h('div', { class: 'family-stage-main' },
          h('span', { class: 'stage-chip stage-big', text: info.stageLabel }),
          h('span', { class: 'family-birthday', text: info.aging === 'off' ? 'Aging is off (Settings > Household life).' : birthdayText(info.daysToBirthday) })),
        fraction !== null ? progress('Time in this stage', fraction, `${info.stageDays} of ${info.stageLength} days`) : null,
        mine ? button({
          icon: 'star', label: 'Age up now', small: true, variant: 'secondary', disabled: !info.ageUp.ok,
          title: info.ageUp.ok ? 'Celebrate the birthday now, at the birthday cake' : info.ageUp.reason ?? '',
          onClick: () => { const r = api.ageUpNow?.(pr.id) ?? { ok: false, reason: 'That is not available here.' }; if (!r.ok) toast(r.reason, 'warning'); else sh.sound('confirm'); },
        }) : null,
        mine && !info.ageUp.ok && info.ageUp.reason ? h('p', { class: 'pp-note' }, icon('info', 16), h('span', { text: info.ageUp.reason })) : null),
    ];
    if (info.treeIds.length > 1) {
      const model = treeModel(st, info.treeIds, pr.id);
      items.push(h('h3', { class: 'pp-subhead', text: 'Family tree' }), h('div', { class: 'pp-tree' }, familyTree(model.draft, model.current)));
    }
    items.push(h('h3', { class: 'pp-subhead', text: info.relatives.length ? `Relatives (${info.relatives.length})` : 'Relatives' }));
    items.push(info.relatives.length
      ? h('ul', { class: 'relative-list' }, ...info.relatives.map((r) => h('li', { class: 'relative-row', dataset: { personId: r.id } },
        h('span', { class: 'relative-name', text: r.name }),
        h('span', { class: 'tag tag-family', text: r.text }),
        h('span', { class: 'relative-meta', text: `${r.stageLabel}${r.household ? ', same household' : `, ${r.where.toLowerCase()}`}` }))))
      : h('p', { class: 'pp-note' }, icon('info', 16), h('span', { text: `${pr.firstName} has no relatives in town yet. Adopt a child, or get to know people and ask them to move in.` })));
    if (mine) {
      const actions: HTMLElement[] = [];
      actions.push(button({
        icon: 'heart', label: 'Adopt a child...', small: true, variant: 'secondary', disabled: !info.adopt.ok, title: info.adopt.ok ? 'Adopt a baby, toddler, child or teen' : info.adopt.reason ?? '',
        onClick: () => { sh.sound('open'); openAdoptDialog(sh, pr.id); },
      }));
      actions.push(button({
        icon: 'home', label: 'Move out or in...', small: true, variant: 'secondary',
        title: 'Let somebody move out to a home of their own, or move in with another household',
        onClick: () => { sh.sound('open'); openSplitDialog(sh, pr.id); },
      }));
      items.push(h('div', { class: 'career-actions family-actions' }, ...actions), !info.adopt.ok && info.adopt.reason ? h('p', { class: 'pp-note' }, icon('info', 16), h('span', { text: info.adopt.reason })) : null);
    }
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
    const away = awayText(pr, st);
    const doingText = away ? `${away.label}${away.back ? ` · ${away.back}` : ''}` : cur ? `${interactionName(db, cur.interactionId)}` : 'Idle';
    const fam = api.family?.(pr.id);
    const stageText = fam ? `${stageName(pr.lifeStage)}${fam.daysToBirthday !== null && pr.lifeStage !== 'elder' ? ` · ${birthdayText(fam.daysToBirthday).toLowerCase()}` : ''}` : stageName(pr.lifeStage);
    const hs = `${pr.id}|${pr.firstName} ${pr.lastName}|${mood.label}|${moodTone(mood.value)}|${mood.reasons.join(';')}|${doingText}|${stageText}`;
    if (hs !== headSig) {
      headSig = hs;
      stageChip.textContent = stageText;
      const careerTabSpans = tabBar.el.querySelectorAll('[data-id="career"] > span');
      const careerTab = careerTabSpans[careerTabSpans.length - 1]; // the label comes after the icon
      if (careerTab) {
        careerTab.textContent = pr.lifeStage === 'baby' || pr.lifeStage === 'toddler' || pr.lifeStage === 'child'
          ? 'School' : pr.lifeStage === 'teen' ? 'School & job' : 'Career';
      }
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
      case 'family': renderFamily(st, pr); break;
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
