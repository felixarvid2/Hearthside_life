// Member strip (portraits via api.creator.portrait, initials while rendering) and the portrait cache.

import { MAX_HOUSEHOLD_MEMBERS, memberName } from '../../characters/creator';
import type { PersonDraft } from '../../core/drafts';
import type { GameAPI } from '../../game/api';
import { h, setText, toggleClass } from '../kit/dom';
import { icon } from '../kit/icons';
import type { CreatorContext } from './context';
import { addMemberSheet, memberActions } from './tools';
import { initials } from './widgets';

function hash(s: string): string {
  let a = 5381, b = 52711;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = (a * 33) ^ c; b = (b * 33) ^ c; }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}`;
}

function portraitKey(p: PersonDraft): string {
  const cur = p.outfits.current;
  return hash(JSON.stringify([p.appearance, p.outfits.outfits[cur.category]?.[cur.index] ?? null, p.lifeStage]));
}

let pointerIsDown = false;
let pointerTracking = false;
function trackPointer(): void {
  if (pointerTracking) return;
  pointerTracking = true;
  window.addEventListener('pointerdown', () => { pointerIsDown = true; }, { capture: true, passive: true });
  for (const t of ['pointerup', 'pointercancel', 'blur'] as const) window.addEventListener(t, () => { pointerIsDown = false; }, { capture: true, passive: true });
}

/**
 * Renders member portraits through api.creator.portrait, debounced (never while a pointer is down, e.g. during
 * a slider drag) and cached by appearance + worn outfit. A stale portrait keeps showing while the new one renders
 * as long as the member's name is unchanged.
 */
export class Portraits {
  private cache = new Map<string, string>();
  private keys: string[] = [];
  private names: string[] = [];
  private shown: Array<{ url: string; name: string } | null> = [];
  private members: readonly PersonDraft[] = [];
  private timer = 0;
  private busy = false;
  private alive = true;

  constructor(private readonly api: GameAPI, private readonly onUpdate: () => void, private readonly delayMs = 450) { trackPointer(); }

  update(members: readonly PersonDraft[]): void {
    this.members = members;
    this.keys = members.map(portraitKey);
    this.names = members.map((m, i) => memberName(m, i));
    let missing = false;
    this.keys.forEach((k, i) => {
      const url = this.cache.get(k);
      if (url) this.shown[i] = { url, name: this.names[i] ?? '' };
      else missing = true;
    });
    this.shown.length = members.length;
    if (missing) this.schedule();
  }

  url(i: number): string | null {
    const k = this.keys[i];
    const exact = k ? this.cache.get(k) : undefined;
    if (exact) return exact;
    const s = this.shown[i];
    return s && s.name === this.names[i] ? s.url : null;
  }

  destroy(): void { this.alive = false; clearTimeout(this.timer); }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { void this.run(); }, this.delayMs);
  }

  private async run(): Promise<void> {
    if (!this.alive || this.busy) return;
    if (pointerIsDown) { this.schedule(); return; }
    this.busy = true;
    let changed = false;
    try {
      for (let i = 0; i < this.members.length; i++) {
        const k = this.keys[i], m = this.members[i];
        if (!k || !m || this.cache.has(k)) continue;
        let url: string | null = null;
        try { url = await this.api.creator.portrait(m); } catch (err) { console.warn('[creator] portrait failed', err); }
        if (!this.alive) return;
        if (url) {
          this.cache.set(k, url);
          if (this.cache.size > 80) this.cache.delete(this.cache.keys().next().value as string);
          changed = true;
        }
        if (pointerIsDown) break;
      }
    } finally { this.busy = false; }
    if (changed) { this.update(this.members); this.onUpdate(); }
    if (this.keys.some((k) => !this.cache.has(k))) this.schedule();
  }
}

/** Horizontal strip of member portraits plus an Add button. Tap a member to edit; tap the selected one for actions. */
export function memberStrip(ctx: CreatorContext, portraitOf: (i: number) => string | null): { el: HTMLElement; sync(): void } {
  const list = h('div', { class: 'cr-members', role: 'tablist', ariaLabel: 'Household members' });
  const add = h('button', { type: 'button', class: 'cr-member cr-member-add', title: 'Add a person', ariaLabel: 'Add a person' },
    h('span', { class: 'cr-member-face' }, icon('plus', 22)), h('span', { class: 'cr-member-name', text: 'Add' }));
  add.addEventListener('click', () => {
    if (add.getAttribute('aria-disabled') === 'true') { ctx.status(`A household can have at most ${MAX_HOUSEHOLD_MEMBERS} people.`, 'warning'); return; }
    addMemberSheet(ctx);
  });
  const el = h('div', { class: 'cr-members-wrap' }, list, add);
  let items: Array<{ btn: HTMLButtonElement; face: HTMLElement; name: HTMLElement; badge: HTMLElement }> = [];
  let lastSelected = -1;

  const build = (n: number) => {
    items = Array.from({ length: n }, (_, i) => {
      const face = h('span', { class: 'cr-member-face' });
      const name = h('span', { class: 'cr-member-name' });
      const badge = h('span', { class: 'cr-member-badge' });
      const btn = h('button', { type: 'button', class: 'cr-member', role: 'tab' }, face, badge, name);
      btn.addEventListener('click', () => {
        if (ctx.session.currentIndex === i) memberActions(ctx, i);
        else { ctx.report(ctx.session.selectMember(i)); ctx.sound('select'); }
      });
      return { btn, face, name, badge };
    });
    list.replaceChildren(...items.map((x) => x.btn));
    lastSelected = -1;
  };

  const sync = () => {
    const s = ctx.session;
    if (items.length !== s.members.length) build(s.members.length);
    const v = s.validate();
    items.forEach((it, i) => {
      const m = s.member(i);
      if (!m) return;
      const full = memberName(m, i);
      setText(it.name, m.firstName.trim() || `Person ${i + 1}`);
      const sel = i === s.currentIndex;
      toggleClass(it.btn, 'is-selected', sel);
      it.btn.setAttribute('aria-selected', String(sel));
      const issues = v.members[i]?.length ?? 0;
      setText(it.badge, issues > 0 ? String(issues) : '');
      it.badge.hidden = issues === 0;
      const label = `${full}${sel ? ' (editing; tap for more)' : ''}${issues > 0 ? `, ${issues} to fix` : ''}`;
      it.btn.setAttribute('aria-label', label);
      it.btn.title = sel ? `${full}: tap for actions` : `Edit ${full}`;
      const url = portraitOf(i);
      const img = it.face.querySelector('img');
      if (url) {
        if (!img || img.getAttribute('src') !== url) it.face.replaceChildren(h('img', { attrs: { src: url, alt: '' } }));
      } else {
        const t = initials(m.firstName, m.lastName, i);
        if (img || it.face.textContent !== t) it.face.replaceChildren(t);
      }
    });
    // keep the selected portrait visible in the strip (scroll the strip only, never the page)
    const selBtn = items[s.currentIndex]?.btn;
    if (selBtn && s.currentIndex !== lastSelected) {
      lastSelected = s.currentIndex;
      requestAnimationFrame(() => {
        const l = selBtn.offsetLeft - list.offsetLeft, r = l + selBtn.offsetWidth;
        if (l < list.scrollLeft) list.scrollLeft = l;
        else if (r > list.scrollLeft + list.clientWidth) list.scrollLeft = r - list.clientWidth;
      });
    }
    const full = s.members.length >= MAX_HOUSEHOLD_MEMBERS;
    toggleClass(add, 'is-disabled', full);
    add.setAttribute('aria-disabled', String(full));
    add.title = full ? `A household can have at most ${MAX_HOUSEHOLD_MEMBERS} people.` : 'Add a person';
  };
  return { el, sync };
}
