// The creator screen: live preview area (drawn by the game behind this UI) plus the editing panel, for both the
// 7-step character creator and the wardrobe editor. Portrait: top bar, preview on top (~42 % of the height),
// expandable editing sheet below. Landscape: preview on the left, editing panel on the right. The free preview
// area is reported with api.view.setInsets so the camera frames the person there.

import {
  CATEGORY_NAMES, CREATOR_STEPS, CreatorSession, memberName, STEP_CATEGORIES, STEP_NAMES, type CreatorStep,
} from '../../characters/creator';
import { OUTFIT_CATEGORY_NAMES } from '../../characters/outfits';
import type { HouseholdDraft } from '../../core/drafts';
import { OUTFIT_CATEGORIES, type OutfitCategory, type StartMode } from '../../core/types';
import type { GameAPI, SoundId } from '../../game/api';
import { button, confirmDialog, modal, panel, tabs, type Panel, type Tabs } from '../kit/components';
import { Disposer, h, setText, shieldWorld, toggleClass } from '../kit/dom';
import { icon } from '../kit/icons';
import { layout, onLayoutChange } from '../kit/layout';
import type { ModeUI } from '../modes/types';
import { initialUiState, type AnyResult, type CreatorContext, type CreatorUiState, type StepDef, type StepView } from './context';
import { memberStrip, Portraits } from './members';
import { PREVIEW_ANIMS, PREVIEW_VIEWS, PreviewController, ROTATE_STEP, ZOOM_STEP, type PreviewView } from './preview';
import { clothingStep } from './steps/clothing';
import { faceBodyStep } from './steps/faceBody';
import { hairStep } from './steps/hair';
import { householdStep } from './steps/household';
import { identityStep } from './steps/identity';
import { personalityStep } from './steps/personality';
import { reviewStep } from './steps/review';
import { addMemberSheet, openTools } from './tools';
import { choiceChips } from './widgets';
import './creator.css';

const STEP_DEFS: Record<CreatorStep, StepDef> = {
  identity: identityStep, faceBody: faceBodyStep, hair: hairStep, clothing: clothingStep,
  personality: personalityStep, household: householdStep, review: reviewStep,
};
const STEP_ICONS: Record<CreatorStep, string> = {
  identity: 'id', faceBody: 'face', hair: 'hair', clothing: 'shirt', personality: 'star', household: 'family', review: 'review',
};

/** Sizes of the preview controls (keep in sync with creator.css). */
const SIDE_COL = 60;
const VIEW_ROW = 60;

export interface ScreenOptions {
  kind: 'creator' | 'wardrobe';
  startMode: StartMode | null;
  session: CreatorSession;
  /** Panel title (wardrobe) or screen name (creator). */
  title: string;
  /** Creator: Move In with the final draft. */
  onDone?(draft: HouseholdDraft): void;
  /** Wardrobe: apply; returns an error message to show, or null when saved. */
  onSave?(session: CreatorSession): string | null;
  /** Cancel (creator, after confirmation) or close (wardrobe). */
  onExit(): void;
  /** Clothing step starts on this outfit (wardrobe: the one being worn). */
  initialOutfit?: { category: OutfitCategory; index: number };
}

export class CreatorScreen implements ModeUI {
  readonly el: HTMLElement;
  private session: CreatorSession;
  private unsubSession: () => void = () => {};
  private readonly ui: CreatorUiState = initialUiState();
  private readonly preview: PreviewController;
  private readonly portraits: Portraits;
  private readonly disposer = new Disposer();
  private readonly ctx: CreatorContext;
  private readonly panel: Panel;
  private readonly top: HTMLElement;
  private readonly pv: HTMLElement;
  private readonly toolbar: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly footer: HTMLElement;
  private readonly stepTabs: Tabs | null = null;
  private readonly strip: { el: HTMLElement; sync(): void } | null = null;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private view: StepView | null = null;
  private viewKey = '';
  private viewStep: CreatorStep | null = null;
  private toolbarStep: CreatorStep | null = null;
  private toolbarSync: () => void = () => {};
  private footerSync: () => void = () => {};
  private statusTimer = 0;
  private measureRaf = 0;
  private lastInsets = '';
  private destroyed = false;
  private moving = false;

  constructor(root: HTMLElement, private readonly api: GameAPI, private readonly opts: ScreenOptions) {
    this.session = opts.session;
    if (opts.initialOutfit) {
      this.ui.clothingCategory = opts.initialOutfit.category;
      this.ui.outfitIndex[opts.initialOutfit.category] = opts.initialOutfit.index;
    }
    const self = this;
    this.preview = new PreviewController(api, () => (this.destroyed ? null : this.session.current));
    this.portraits = new Portraits(api, () => this.onPortraits());
    this.ctx = {
      api,
      get session() { return self.session; },
      ui: this.ui,
      preview: this.preview,
      kind: opts.kind,
      startMode: opts.startMode,
      report: (r) => this.report(r),
      status: (t, k) => this.status(t, k),
      refresh: () => { this.viewKey = ''; this.renderBody(); },
      goTo: (step, member, message) => this.goTo(step, member, message),
      replaceDraft: (draft, message) => this.replaceDraft(draft, message),
      sound: (id) => this.sound(id),
      portraitOf: (i) => this.portraits.url(i),
    };

    // ---- DOM
    const stage = h('div', { class: 'cr-drag', attrs: { 'aria-hidden': 'true' } });
    this.top = h('header', { class: 'cr-top' });
    this.pv = h('div', { class: 'cr-pv' });
    this.panel = panel({ title: opts.title, closable: false, className: 'cr-panel', initialHeight: 'half' });
    this.toolbar = h('div', { class: 'cr-toolbar', role: 'toolbar', ariaLabel: 'Creator tools' });
    this.statusEl = h('div', { class: 'cr-status', role: 'status', attrs: { 'aria-live': 'polite' } });
    this.statusEl.hidden = true;
    this.footer = h('footer', { class: 'cr-footer' });
    this.el = h('div', { class: ['cr', `cr-kind-${opts.kind}`] }, stage, this.pv, this.top, this.panel.el);
    shieldWorld(this.el);

    // top bar
    const close = button({ icon: 'close', iconOnly: true, variant: 'ghost', label: opts.kind === 'creator' ? 'Cancel creating' : 'Close wardrobe', onClick: () => { void this.exit(); } });
    close.classList.add('cr-close');
    this.undoBtn = this.historyButton('undo');
    this.redoBtn = this.historyButton('redo');
    if (opts.kind === 'creator') {
      this.strip = memberStrip(this.ctx, (i) => this.portraits.url(i));
      this.top.append(close, this.strip.el, h('div', { class: 'cr-history' }, this.undoBtn, this.redoBtn));
    } else {
      const who = h('div', { class: 'cr-top-title' }, h('span', { class: 'cr-top-kicker', text: 'Wardrobe' }), h('span', { class: 'cr-top-name', text: memberName(this.session.current, 0) }));
      this.top.append(close, who, h('div', { class: 'cr-history' }, this.undoBtn, this.redoBtn));
    }

    // panel parts: step tabs in the header (creator), toolbar, body, status, footer
    if (opts.kind === 'creator') {
      this.stepTabs = tabs({
        label: 'Creator steps',
        items: CREATOR_STEPS.map((s, i) => ({ id: s, label: `${i + 1}. ${STEP_NAMES[s]}`, icon: STEP_ICONS[s] })),
        value: this.session.step,
        onChange: (id) => { this.session.setStep(id as CreatorStep); },
      });
      this.stepTabs.el.classList.add('cr-steps');
      this.panel.header.insertBefore(this.stepTabs.el, this.panel.header.querySelector('.panel-actions'));
    }
    this.panel.el.insertBefore(this.toolbar, this.panel.body);
    this.panel.el.append(this.statusEl, this.footer);
    this.panel.body.classList.add('cr-body');
    this.buildPreviewControls();

    // drag on the preview rotates (shortcut), wheel zooms
    let drag: { id: number; x: number } | null = null;
    stage.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, x: e.clientX }; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) < 1) return;
      drag.x = e.clientX;
      this.preview.rotate(dx * 0.012);
    });
    const endDrag = () => { drag = null; };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('lostpointercapture', endDrag);
    stage.addEventListener('wheel', (e) => { e.preventDefault(); this.preview.zoom(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP); }, { passive: false });

    // keyboard shortcuts
    this.disposer.listen(window, 'keydown', (e) => this.onKey(e as KeyboardEvent));
    // layout and insets
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.scheduleMeasure()) : null;
    if (ro) { ro.observe(this.panel.el); ro.observe(this.top); ro.observe(this.el); this.disposer.add(() => ro.disconnect()); }
    this.disposer.add(onLayoutChange(() => { this.scheduleMeasure(); requestAnimationFrame(() => { if (!this.destroyed) this.keepStepTabVisible(); }); }));
    this.disposer.listen(window, 'resize', () => this.scheduleMeasure());
    this.disposer.add(this.preview.onChange(() => this.syncPreviewControls()));

    root.appendChild(this.el);
    this.panel.open();
    this.attachSession(this.session);
    this.preview.flush(true);
    this.scheduleMeasure();
  }

  // ---------------------------------------------------------------------------------------------
  // ModeUI
  // ---------------------------------------------------------------------------------------------

  show(): void {
    if (this.destroyed) return;
    this.el.hidden = false;
    this.preview.invalidate();
    this.preview.flush(true);
    try { this.api.creator.setView(this.preview.view); } catch { /* renderer not ready */ }
    this.lastInsets = '';
    this.scheduleMeasure();
  }

  hide(): void { this.el.hidden = true; }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubSession();
    this.disposer.dispose();
    this.preview.destroy();
    this.portraits.destroy();
    clearTimeout(this.statusTimer);
    if (this.measureRaf) cancelAnimationFrame(this.measureRaf);
    this.view?.destroy?.();
    this.panel.destroy();
    this.el.remove();
  }

  /** For tests and the dev page. */
  get currentSession(): CreatorSession { return this.session; }

  // ---------------------------------------------------------------------------------------------
  // Session
  // ---------------------------------------------------------------------------------------------

  private attachSession(s: CreatorSession): void {
    this.unsubSession();
    this.session = s;
    this.unsubSession = s.onChange(() => this.onSessionChange());
    this.viewKey = '';
    this.onSessionChange();
  }

  private replaceDraft(draft: HouseholdDraft, message: string): void {
    const old = this.session;
    const next = new CreatorSession(this.api.content, { draft });
    for (const c of old.lockedCategories()) next.setLocked(c, true);
    next.setStep(old.step);
    this.ui.customPronouns.clear();
    this.attachSession(next);
    this.status(message, 'success');
    this.sound('confirm');
  }

  private onSessionChange(): void {
    if (this.destroyed) return;
    this.portraits.update(this.session.members);
    this.strip?.sync();
    this.syncHistory();
    this.syncStepTabs();
    this.renderToolbar();
    this.renderBody();
    this.footerSync();
    this.preview.schedule();
  }

  private onPortraits(): void {
    if (this.destroyed) return;
    this.strip?.sync();
    if (this.session.step === 'review') this.viewKey = '';
    this.renderBody();
  }

  private renderBody(): void {
    const step = this.session.step;
    const def = STEP_DEFS[step];
    const body = this.panel.body;
    const stepChanged = step !== this.viewStep;
    if (stepChanged && this.viewStep) STEP_DEFS[this.viewStep].leave?.(this.ctx);
    const key = `${step}|${def.key(this.ctx)}`;
    if (!stepChanged && key === this.viewKey && this.view) { this.view.sync(); return; }
    const scroll = stepChanged ? 0 : body.scrollTop;
    const focus = !stepChanged ? focusKey(document.activeElement, body) : null;
    this.view?.destroy?.();
    this.view = def.build(this.ctx);
    this.viewKey = key;
    body.replaceChildren(this.view.el);
    body.scrollTop = scroll;
    if (focus) restoreFocus(body, focus);
    if (stepChanged) {
      this.viewStep = step;
      def.enter?.(this.ctx);
      this.renderFooter();
    }
  }

  private report(r: AnyResult): boolean {
    if (!r.ok) { this.status(r.reason, 'warning'); this.sound('error'); return false; }
    if ('note' in r && r.note) this.status(r.note, 'info');
    return true;
  }

  private status(text: string, kind: 'info' | 'warning' | 'success' = 'info'): void {
    clearTimeout(this.statusTimer);
    this.statusEl.hidden = false;
    this.statusEl.dataset.kind = kind;
    this.statusEl.replaceChildren(icon(kind === 'warning' ? 'warning' : kind === 'success' ? 'check' : 'info', 18), h('span', { text }));
    this.statusTimer = window.setTimeout(() => { this.statusEl.hidden = true; }, kind === 'warning' ? 7000 : 4500);
  }

  private sound(id: SoundId): void { try { this.api.sound(id); } catch { /* no audio */ } }

  private goTo(step: CreatorStep, member?: number | null, message?: string): void {
    if (member !== undefined && member !== null) this.session.selectMember(member);
    if (step !== this.session.step) this.session.setStep(step);
    else { this.viewKey = ''; this.renderBody(); }
    if (layout().portrait) this.panel.setHeight('half');
    if (message) this.status(message, 'warning');
  }

  private async exit(): Promise<void> {
    if (this.opts.kind === 'creator') {
      const ok = await confirmDialog({
        title: 'Leave the creator?',
        text: 'This household is not saved anywhere. Use Tools, Save household template first if you want to keep it.',
        confirm: 'Leave', danger: true,
      });
      if (ok) this.opts.onExit();
      return;
    }
    if (this.session.canUndo()) {
      const ok = await confirmDialog({ title: 'Discard outfit changes?', text: 'Your changes to these outfits will be lost.', confirm: 'Discard', danger: true });
      if (!ok) return;
    }
    this.opts.onExit();
  }

  // ---------------------------------------------------------------------------------------------
  // Top bar, tabs, toolbar, footer
  // ---------------------------------------------------------------------------------------------

  private historyButton(kind: 'undo' | 'redo'): HTMLButtonElement {
    const b = h('button', { type: 'button', class: 'tool-btn cr-history-btn' }, icon(kind, 22), h('span', { class: 'tool-label', text: kind === 'undo' ? 'Undo' : 'Redo' }));
    b.addEventListener('click', () => this.history(kind));
    return b;
  }

  private history(kind: 'undo' | 'redo'): void {
    const s = this.session;
    const label = kind === 'undo' ? s.undo() : s.redo();
    if (label) { this.status(`${kind === 'undo' ? 'Undone' : 'Redone'}: ${label}`, 'info'); this.sound('click'); }
    else this.status(kind === 'undo' ? 'Nothing to undo.' : 'Nothing to redo.', 'info');
  }

  private syncHistory(): void {
    const s = this.session;
    for (const [b, can, label, verb] of [[this.undoBtn, s.canUndo(), s.undoLabel(), 'Undo'], [this.redoBtn, s.canRedo(), s.redoLabel(), 'Redo']] as const) {
      b.disabled = !can;
      const text = can && label ? `${verb}: ${label}` : `Nothing to ${verb.toLowerCase()}`;
      b.setAttribute('aria-label', text);
      b.title = text;
    }
  }

  /** Keeps the selected step tab inside the scrolling tab strip (the strip is re-laid out after adding a person or a rotation). */
  private keepStepTabVisible(): void {
    const bar = this.stepTabs?.el;
    const sel = bar?.querySelector<HTMLElement>('.tab.is-selected');
    if (!bar || !sel) return;
    const b = bar.getBoundingClientRect(), t = sel.getBoundingClientRect();
    if (b.width === 0) return;
    if (t.left < b.left) bar.scrollLeft += t.left - b.left - 8;
    else if (t.right > b.right) bar.scrollLeft += t.right - b.right + 8;
  }

  private syncStepTabs(): void {
    if (!this.stepTabs) return;
    const s = this.session;
    if (this.stepTabs.current() !== s.step) this.stepTabs.select(s.step);
    requestAnimationFrame(() => { if (!this.destroyed) this.keepStepTabVisible(); });
    const v = s.validate();
    const cur = v.members[s.currentIndex] ?? [];
    for (const step of CREATOR_STEPS) {
      const btn = this.stepTabs.el.querySelector<HTMLButtonElement>(`[data-id="${step}"]`);
      if (!btn) continue;
      const n = step === 'review' ? v.issues.length : step === 'household' ? v.household.length : cur.filter((i) => i.step === step).length;
      let badge = btn.querySelector<HTMLElement>('.badge');
      if (n > 0 && !badge) { badge = h('span', { class: 'badge' }); btn.appendChild(badge); }
      if (badge) { if (n > 0) setText(badge, String(n)); else badge.remove(); }
      btn.setAttribute('aria-label', `${STEP_NAMES[step]}${n > 0 ? `, ${n} to fix` : ''}`);
    }
  }

  private renderToolbar(): void {
    const step = this.session.step;
    if (step === this.toolbarStep) { this.toolbarSync(); return; }
    this.toolbarStep = step;
    const s = () => this.session;
    const items: HTMLElement[] = [];
    const syncs: Array<() => void> = [];
    const tool = (label: string, iconName: string, fn: () => void, title?: string) => {
      const b = button({ label, icon: iconName, small: true, variant: 'ghost', onClick: fn, ...(title ? { title } : {}) });
      b.classList.add('cr-tool');
      return b;
    };
    if (this.opts.kind === 'wardrobe') {
      items.push(
        tool('Randomize all outfits', 'dice', () => this.report(s().randomize('clothing'))),
        tool('Reset all outfits', 'undo', () => { if (this.report(s().resetCategory('clothing'))) this.status('Outfits reset to plain clothes. Undo brings them back.', 'info'); }),
      );
    } else {
      const cats = STEP_CATEGORIES[step];
      if (cats.length > 0) {
        const rnd = tool('Randomize', 'dice', () => { if (this.report(s().randomizeStep())) this.sound('click'); }, `Randomize ${STEP_NAMES[step].toLowerCase()} (locked parts are kept)`);
        items.push(rnd);
        for (const c of cats) {
          const lock = h('button', { type: 'button', class: 'chip cr-lock' }, h('span', { class: 'cr-lock-icon' }), h('span', { class: 'cr-lock-text', text: `Lock ${CATEGORY_NAMES[c].toLowerCase()}` }));
          lock.addEventListener('click', () => { s().toggleLock(c); this.sound('toggle'); this.status(s().isLocked(c) ? `${CATEGORY_NAMES[c]} is locked: randomizing keeps it.` : `${CATEGORY_NAMES[c]} is unlocked.`, 'info'); });
          syncs.push(() => {
            const on = s().isLocked(c);
            toggleClass(lock, 'is-selected', on);
            lock.setAttribute('aria-pressed', String(on));
            lock.querySelector('.cr-lock-icon')?.replaceChildren(icon(on ? 'lock' : 'unlock', 16));
            lock.title = on ? `${CATEGORY_NAMES[c]} is locked: randomizing keeps it. Tap to unlock.` : `Lock ${CATEGORY_NAMES[c].toLowerCase()} so randomizing keeps it`;
          });
          items.push(lock);
        }
        syncs.push(() => {
          const all = cats.every((c) => s().isLocked(c));
          rnd.disabled = all;
          rnd.title = all ? 'Everything on this step is locked.' : `Randomize ${STEP_NAMES[step].toLowerCase()} (locked parts are kept)`;
        });
      } else if (step === 'household') {
        items.push(tool('Add a person', 'plus', () => addMemberSheet(this.ctx)));
      }
      items.push(tool('Randomize all', 'dice', () => { if (this.report(s().randomizeAll())) this.sound('click'); }, 'Randomize every unlocked category of this person'));
    }
    const scroller = h('div', { class: 'cr-toolbar-scroll' }, ...items);
    if (this.opts.kind === 'wardrobe') this.toolbar.replaceChildren(scroller);
    else {
      const tools = tool('Tools', 'settings', () => openTools(this.ctx), 'Locks, reset, presets, copy and paste, templates');
      tools.classList.add('cr-tools-btn');
      this.toolbar.replaceChildren(scroller, tools);
    }
    const fade = () => toggleClass(scroller, 'is-clipped', scroller.scrollWidth - scroller.scrollLeft - scroller.clientWidth > 4);
    scroller.addEventListener('scroll', fade, { passive: true });
    requestAnimationFrame(fade);
    syncs.push(fade);
    this.toolbarSync = () => { for (const fn of syncs) fn(); };
    this.toolbarSync();
  }

  private renderFooter(): void {
    const s = () => this.session;
    if (this.opts.kind === 'wardrobe') {
      if (this.footer.childElementCount > 0) return;
      const info = h('span', { class: 'cr-footer-info' });
      const cancel = button({ label: 'Cancel', variant: 'ghost', onClick: () => { void this.exit(); } });
      const save = button({ label: 'Save outfits', icon: 'check', variant: 'primary', onClick: () => this.save() });
      this.footer.append(cancel, info, save);
      this.footerSync = () => {
        const issues = s().validate().members[0]?.filter((i) => i.step === 'clothing') ?? [];
        save.disabled = issues.length > 0;
        setText(info, issues.length > 0 ? `${issues.length} to fix before saving` : s().canUndo() ? 'Unsaved changes' : 'No changes yet');
      };
      this.footerSync();
      return;
    }
    const step = s().step;
    const i = CREATOR_STEPS.indexOf(step);
    const back = button({ label: 'Back', icon: 'back', variant: 'ghost', onClick: () => s().prevStep(), disabled: i === 0 });
    const info = h('span', { class: 'cr-footer-info' });
    if (step === 'review') {
      const move = button({ label: 'Move In', icon: 'home', variant: 'primary', onClick: () => this.moveIn() });
      move.classList.add('cr-move-in');
      this.footer.replaceChildren(back, info, move);
      this.footerSync = () => {
        const v = s().validate();
        move.disabled = !v.ok || this.moving;
        setText(info, v.ok ? 'Ready to move in' : `${v.issues.length} to fix first`);
        move.title = v.ok ? 'Create these people and move into the house' : `Fix ${v.issues.length} ${v.issues.length === 1 ? 'thing' : 'things'} first`;
      };
    } else {
      const nextStep = CREATOR_STEPS[i + 1] ?? 'review';
      const next = button({ label: `Next: ${STEP_NAMES[nextStep]}`, icon: 'next', variant: 'primary', onClick: () => s().nextStep() });
      next.classList.add('cr-next');
      // icon after the label
      const ic = next.querySelector('.icon-wrap');
      if (ic) next.appendChild(ic);
      this.footer.replaceChildren(back, info, next);
      info.classList.add('cr-footer-step');
      this.footerSync = () => setText(info, `${i + 1} of ${CREATOR_STEPS.length}`);
      info.setAttribute('aria-label', `Step ${i + 1} of ${CREATOR_STEPS.length}`);
    }
    this.footerSync();
  }

  private moveIn(): void {
    const v = this.session.validate();
    if (!v.ok) { this.status(`Fix ${v.issues.length} ${v.issues.length === 1 ? 'thing' : 'things'} first.`, 'warning'); return; }
    if (this.moving) return;
    this.moving = true;
    this.footerSync();
    window.setTimeout(() => { this.moving = false; if (!this.destroyed) this.footerSync(); }, 2500);
    this.sound('confirm');
    this.opts.onDone?.(this.session.finalDraft());
  }

  private save(): void {
    const err = this.opts.onSave?.(this.session) ?? null;
    if (err) { this.status(err, 'warning'); this.sound('error'); }
  }

  // ---------------------------------------------------------------------------------------------
  // Preview controls
  // ---------------------------------------------------------------------------------------------

  private viewBtns = new Map<PreviewView, HTMLButtonElement>();
  private optionsBtn!: HTMLButtonElement;
  private bodyBtn!: HTMLButtonElement;

  private buildPreviewControls(): void {
    const iconBtn = (name: string, label: string, fn: () => void) => {
      const b = button({ icon: name, iconOnly: true, label, onClick: fn });
      b.classList.add('cr-pv-btn');
      return b;
    };
    const left = h('div', { class: 'cr-pv-col cr-pv-left' },
      iconBtn('rotateLeft', 'Turn left', () => this.preview.rotate(-ROTATE_STEP)),
      iconBtn('rotateRight', 'Turn right', () => this.preview.rotate(ROTATE_STEP)));
    const right = h('div', { class: 'cr-pv-col cr-pv-right' },
      iconBtn('zoomIn', 'Zoom in', () => this.preview.zoom(ZOOM_STEP)),
      iconBtn('zoomOut', 'Zoom out', () => this.preview.zoom(1 / ZOOM_STEP)));
    const views = h('div', { class: 'cr-pv-views segmented', role: 'radiogroup', ariaLabel: 'Preview view' });
    for (const v of PREVIEW_VIEWS) {
      const b = h('button', { type: 'button', class: 'seg', role: 'radio', dataset: { id: v.id } }, h('span', { text: v.label }));
      b.addEventListener('click', () => this.preview.setView(v.id));
      this.viewBtns.set(v.id, b);
      views.appendChild(b);
    }
    this.optionsBtn = h('button', { type: 'button', class: 'cr-pv-options', title: 'Preview outfit and pose' }, icon('shirt', 18), h('span', { class: 'cr-pv-options-text' }));
    this.optionsBtn.addEventListener('click', () => this.openPreviewOptions());
    this.bodyBtn = h('button', { type: 'button', class: 'cr-pv-body' }, icon('person', 18), h('span', { text: 'Show full body' }));
    this.bodyBtn.addEventListener('click', () => this.preview.setView('front'));
    this.pv.append(left, right, views, h('div', { class: 'cr-pv-topline' }, this.optionsBtn, this.bodyBtn));
    this.syncPreviewControls();
  }

  private syncPreviewControls(): void {
    for (const [id, b] of this.viewBtns) {
      const on = id === this.preview.view;
      toggleClass(b, 'is-selected', on);
      b.setAttribute('aria-checked', String(on));
    }
    const anim = PREVIEW_ANIMS.find((a) => a.id === this.preview.anim)?.label ?? this.preview.anim;
    setText(this.optionsBtn.querySelector('.cr-pv-options-text') as HTMLElement, `${OUTFIT_CATEGORY_NAMES[this.preview.category]} · ${anim}`);
    this.optionsBtn.setAttribute('aria-label', `Preview options: ${OUTFIT_CATEGORY_NAMES[this.preview.category]} outfit, ${anim} pose`);
    this.bodyBtn.hidden = this.preview.view !== 'face';
  }

  private openPreviewOptions(): void {
    const m = modal({ title: 'Preview' });
    m.el.classList.add('cr-modal', 'cr-preview-modal');
    const cat = choiceChips({
      label: 'Outfit shown', options: OUTFIT_CATEGORIES.map((c) => ({ id: c, label: OUTFIT_CATEGORY_NAMES[c] })),
      value: () => this.preview.category,
      onPick: (c) => {
        const inClothing = this.session.step === 'clothing';
        if (inClothing) { this.ui.clothingCategory = c; this.viewKey = ''; this.renderBody(); }
        else this.preview.setCategory(c, null);
        cat.sync();
      },
    });
    const pose = choiceChips({
      label: 'Pose', options: PREVIEW_ANIMS.map((a) => ({ id: a.id, label: a.label })),
      value: () => this.preview.anim,
      onPick: (a) => { this.preview.setAnim(a); pose.sync(); },
    });
    cat.sync(); pose.sync();
    m.body.append(cat.el, pose.el, h('p', { class: 'cr-hint', text: 'Only changes the preview. The outfit worn after moving in is chosen on the Clothing step.' }));
    m.footer.appendChild(button({ label: 'Done', variant: 'primary', onClick: () => m.close() }));
  }

  // ---------------------------------------------------------------------------------------------
  // Layout measurement and insets
  // ---------------------------------------------------------------------------------------------

  private scheduleMeasure(): void {
    if (this.measureRaf || this.destroyed) return;
    this.measureRaf = requestAnimationFrame(() => { this.measureRaf = 0; this.measure(); });
  }

  private measure(): void {
    if (this.destroyed || this.el.hidden) return;
    const root = this.el.getBoundingClientRect();
    if (root.width <= 0 || root.height <= 0) return;
    const top = this.top.getBoundingClientRect();
    const pr = this.panel.el.getBoundingClientRect();
    const portrait = layout().portrait;
    const topH = Math.max(0, Math.round(top.bottom - root.top));
    const coverB = portrait ? Math.max(0, Math.round(root.bottom - pr.top)) : 0;
    const coverR = portrait ? 0 : Math.max(0, Math.round(root.right - pr.left));
    const freeH = root.height - topH - coverB;
    const freeW = root.width - coverR;
    const style = this.el.style;
    style.setProperty('--cr-top', `${topH}px`);
    style.setProperty('--cr-cover-b', `${coverB}px`);
    style.setProperty('--cr-cover-r', `${coverR}px`);
    const minimal = freeH < 150 || freeW < 200;
    const compact = !minimal && (freeH < 250 || freeW < 300);
    toggleClass(this.el, 'cr-pv-min', minimal);
    toggleClass(this.el, 'cr-pv-compact', compact);
    const showViews = !minimal;
    const showCols = !minimal;
    const ins = {
      top: topH,
      bottom: coverB + (showViews ? VIEW_ROW : 0),
      left: showCols ? SIDE_COL : 0,
      right: coverR + (showCols ? SIDE_COL : 0),
    };
    const key = JSON.stringify(ins);
    if (key !== this.lastInsets) {
      this.lastInsets = key;
      try { this.api.view.setInsets(ins); } catch (err) { console.warn('[creator] setInsets failed', err); }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------------------------

  private onKey(e: KeyboardEvent): void {
    if (this.el.hidden || this.destroyed || document.querySelector('.modal-backdrop')) return;
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && !['range', 'button', 'checkbox', 'radio', 'color'].includes((t as HTMLInputElement).type)));
    if (typing) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (mod && key === 'z') { e.preventDefault(); this.history(e.shiftKey ? 'redo' : 'undo'); return; }
    if (mod && key === 'y') { e.preventDefault(); this.history('redo'); return; }
    if (mod || e.altKey || t?.tagName === 'INPUT') return;
    if (key === 'q') { this.preview.rotate(-ROTATE_STEP); e.preventDefault(); }
    else if (key === 'e') { this.preview.rotate(ROTATE_STEP); e.preventDefault(); }
    else if (key === '+' || key === '=') { this.preview.zoom(ZOOM_STEP); e.preventDefault(); }
    else if (key === '-' || key === '_') { this.preview.zoom(1 / ZOOM_STEP); e.preventDefault(); }
  }
}

// ---------------------------------------------------------------------------------------------
// Focus restoration across a step rebuild
// ---------------------------------------------------------------------------------------------

interface FocusKey { tag: string; label: string; text: string; id: string; index: number }

function describe(el: Element): Omit<FocusKey, 'index'> {
  return { tag: el.tagName, label: el.getAttribute('aria-label') ?? '', text: (el.textContent ?? '').trim().slice(0, 60), id: (el as HTMLElement).dataset?.id ?? '' };
}

function focusKey(active: Element | null, within: HTMLElement): FocusKey | null {
  if (!active || !within.contains(active) || active === within) return null;
  const d = describe(active);
  const same = [...within.querySelectorAll(active.tagName)].filter((e) => { const x = describe(e); return x.label === d.label && x.text === d.text && x.id === d.id; });
  return { ...d, index: Math.max(0, same.indexOf(active)) };
}

function restoreFocus(within: HTMLElement, k: FocusKey): void {
  const same = [...within.querySelectorAll<HTMLElement>(k.tag)].filter((e) => { const x = describe(e); return x.label === k.label && x.text === k.text && x.id === k.id; });
  (same[k.index] ?? same[0])?.focus({ preventScroll: true });
}
