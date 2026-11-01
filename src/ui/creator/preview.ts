// Drives the game's live creator preview (api.creator.*). The UI owns the CreatorSession; the game only renders
// what it is shown. show() calls are coalesced to one per animation frame and skipped when nothing changed, so
// dragging a slider costs at most one preview update per frame.

import type { AnimId } from '../../core/anim';
import type { PersonDraft } from '../../core/drafts';
import type { OutfitCategory } from '../../core/types';
import type { GameAPI } from '../../game/api';

export type PreviewView = 'front' | 'side' | 'back' | 'face';

export const PREVIEW_VIEWS: ReadonlyArray<{ id: PreviewView; label: string }> = [
  { id: 'front', label: 'Front' }, { id: 'side', label: 'Side' }, { id: 'back', label: 'Back' }, { id: 'face', label: 'Face' },
];

/** Animations offered as preview poses (all exist in core/anim.ts). */
export const PREVIEW_ANIMS: ReadonlyArray<{ id: AnimId; label: string }> = [
  { id: 'idle', label: 'Stand' }, { id: 'wave', label: 'Wave' }, { id: 'walk', label: 'Walk' }, { id: 'laugh', label: 'Laugh' },
  { id: 'dance', label: 'Dance' },
];

export const ROTATE_STEP = Math.PI / 8;
export const ZOOM_STEP = 1.18;

export class PreviewController {
  category: OutfitCategory = 'everyday';
  anim: AnimId = 'idle';
  view: PreviewView = 'front';
  /** True while the face close-up was chosen automatically (face controls); a manual view choice clears it. */
  autoFace = false;
  /** Outfit index of `category` to show (clothing step); null = the outfit the person would wear. */
  outfitIndex: number | null = null;
  private raf = 0;
  private lastKey = '';
  private listeners = new Set<() => void>();
  private alive = true;

  constructor(private readonly api: GameAPI, private readonly person: () => PersonDraft | null) {}

  /** Subscribe to view/category/anim changes (preview controls update their state). */
  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  /** Schedules a show() for the next animation frame. */
  schedule(): void {
    if (this.raf || !this.alive) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.flush(); });
  }

  /** Sends the current person to the renderer now (skipped when identical to the last call unless forced). */
  flush(force = false): void {
    if (!this.alive) return;
    const p = this.person();
    if (!p) return;
    const list = p.outfits.outfits[this.category];
    const person: PersonDraft = this.outfitIndex !== null && list?.[this.outfitIndex]
      ? { ...p, outfits: { ...p.outfits, current: { category: this.category, index: this.outfitIndex } } }
      : p;
    const opts = { category: this.category, anim: this.anim };
    const key = JSON.stringify(person) + this.category + this.anim;
    if (!force && key === this.lastKey) return;
    this.lastKey = key;
    try { this.api.creator.show(person, opts); } catch (err) { console.warn('[creator] preview show failed', err); }
  }

  setView(view: PreviewView, auto = false): void {
    this.view = view;
    this.autoFace = auto && view === 'face';
    try { this.api.creator.setView(view); } catch (err) { console.warn('[creator] setView failed', err); }
    this.emit();
  }

  /** Face close-up while face controls are edited (unless the player picked another view meanwhile). */
  enterFace(): void { if (this.view !== 'face') this.setView('face', true); }
  /** Back to the full body when the face close-up was automatic. */
  leaveFace(): void { if (this.view === 'face' && this.autoFace) this.setView('front'); }

  rotate(delta: number): void { try { this.api.creator.rotate(delta); } catch (err) { console.warn('[creator] rotate failed', err); } }
  zoom(factor: number): void { try { this.api.creator.zoom(factor); } catch (err) { console.warn('[creator] zoom failed', err); } }

  setCategory(c: OutfitCategory, outfitIndex: number | null = null): void {
    if (c === this.category && outfitIndex === this.outfitIndex) return;
    this.category = c;
    this.outfitIndex = outfitIndex;
    this.schedule();
    this.emit();
  }

  setAnim(a: AnimId): void {
    if (a === this.anim) return;
    this.anim = a;
    this.schedule();
    this.emit();
  }

  /** Forces the next flush to resend (after show() of the screen or a session swap). */
  invalidate(): void { this.lastKey = ''; }

  destroy(): void {
    this.alive = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.listeners.clear();
  }

  private emit(): void { for (const fn of [...this.listeners]) fn(); }
}
