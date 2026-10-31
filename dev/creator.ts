// Creator dev page: mounts the character creator or the wardrobe editor over a canvas driven by the creator's
// mock GameAPI (src/ui/creator/dev/mockApi.ts). Open /dev/creator.html (see dev/creator.html for URL params).

import '../src/ui/styles/base.css';
import { CREATOR_STEPS, type CreatorStep } from '../src/characters/creator';
import { content } from '../src/content/index';
import type { StartMode } from '../src/core/types';
import { mountCreator, mountWardrobe } from '../src/ui/creator/creatorScreen';
import { MockCreatorApi } from '../src/ui/creator/dev/mockApi';
import type { CreatorScreen } from '../src/ui/creator/screen';
import { button } from '../src/ui/kit/components';
import { h } from '../src/ui/kit/dom';
import { installLayoutTracking } from '../src/ui/kit/layout';
import type { ModeUI } from '../src/ui/modes/types';

const q = new URLSearchParams(location.search);
const root = document.getElementById('ui-root') as HTMLElement;
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
installLayoutTracking();

const api = new MockCreatorApi({
  content: content(),
  canvas,
  wardrobeError: q.get('wfail'),
  portraitMs: Number(q.get('portraitms') ?? 120),
});
const w = window as unknown as Record<string, unknown>;
w.__api = api;

let ui: ModeUI | null = null;
const results: unknown[] = [];
w.__results = results;

function overlay(title: string, text: string, data?: unknown): void {
  const el = h('div', { class: 'dev-result', role: 'dialog', ariaLabel: title },
    h('h2', { text: title }), h('p', { text }),
    data ? h('pre', { text: JSON.stringify(data, null, 2).slice(0, 4000) }) : null,
    button({ label: 'Start again', variant: 'primary', onClick: () => { el.remove(); start(); } }));
  Object.assign(el.style, { position: 'absolute', inset: '12px', overflow: 'auto', background: '#fbf6ee', padding: '16px', borderRadius: '16px', boxShadow: '0 6px 24px rgba(0,0,0,.2)', zIndex: '40' });
  root.appendChild(el);
}

function start(): void {
  ui?.destroy();
  const screen = q.get('screen') === 'wardrobe' ? 'wardrobe' : 'creator';
  if (screen === 'wardrobe') {
    const personId = api.firstPersonId();
    ui = mountWardrobe(root, api, {
      personId,
      onClose: () => { results.push({ kind: 'wardrobeClosed', outfits: api.state()?.people[personId]?.outfits }); ui?.destroy(); ui = null; api.creator.hide(); overlay('Wardrobe closed', 'The wardrobe editor called onClose.', api.state()?.people[personId]?.outfits.current); },
    });
  } else {
    const modeParam = q.get('mode');
    const mode: StartMode = modeParam === 'sandbox' || modeParam === 'guided' ? modeParam : 'create';
    ui = mountCreator(root, api, {
      mode,
      onDone: (draft) => { results.push({ kind: 'done', draft }); ui?.destroy(); ui = null; overlay('Move In', `onDone was called with ${draft.members.length} people in the ${draft.name} household.`, draft.members.map((m) => ({ name: `${m.firstName} ${m.lastName}`, traits: m.traits, aspiration: m.aspirationId, job: m.careerId }))); },
      onCancel: () => { results.push({ kind: 'cancel' }); ui?.destroy(); ui = null; api.creator.hide(); overlay('Cancelled', 'onCancel was called.'); },
    });
    const step = q.get('step');
    if (step && (CREATOR_STEPS as readonly string[]).includes(step)) (ui as CreatorScreen).currentSession.setStep(step as CreatorStep);
  }
  ui.show();
  w.__ui = ui;
}

start();
