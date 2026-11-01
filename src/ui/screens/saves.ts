// Save and Load dialogs, world export (download a backup) and import (file picker).

import type { SaveSlotInfo } from '../../game/api';
import { activeHousehold } from '../../core/state';
import { button, confirmDialog, modal, promptDialog, toast, type Modal } from '../kit/components';
import { h, setChildren } from '../kit/dom';
import { icon } from '../kit/icons';
import { spinner } from '../kit/controls';
import { exportFileName, formatGameTime, formatMoney, relativeTime } from '../hud/format';
import type { Shell } from '../hud/shell';
import { busyOverlay, errorDialog, reportDialog } from './common';

const MANUAL = ['slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5'];

function slotMeta(s: SaveSlotInfo): string {
  return `${s.householdName || 'Household'} · ${formatGameTime(s.gameMinutes)} · ${formatMoney(s.funds)} · saved ${relativeTime(s.savedAt)}`;
}

function slotNumber(slotId: string): string {
  const i = MANUAL.indexOf(slotId);
  return i >= 0 ? String(i + 1) : slotId === 'autosave' ? 'A' : 'B';
}

function loadingInto(m: Modal): void {
  m.body.replaceChildren(h('div', { class: 'slots-loading' }, spinner('Loading saves'), h('span', { text: 'Reading saved games…' })));
}

async function fetchSlots(sh: Shell): Promise<SaveSlotInfo[] | null> {
  try { return await sh.api.listSaves(); } catch (err) {
    await errorDialog({ title: 'Saves unavailable', message: `Saved games could not be read: ${err instanceof Error ? err.message : 'unknown error'}.`, note: 'Browser storage may be blocked (for example in a private window).' });
    return null;
  }
}

function defaultSaveName(sh: Shell): string {
  const st = sh.api.state();
  const hh = st ? activeHousehold(st) : undefined;
  return st ? `${hh?.name ?? 'Household'} - ${formatGameTime(st.clock.minutes)}` : 'My game';
}

// ---------------------------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------------------------

export async function openSaveDialog(sh: Shell): Promise<void> {
  const { api } = sh;
  if (!api.state()) { toast('No game is running.', 'warning'); return; }
  const m = modal({ title: 'Save game', wide: true });
  m.el.classList.add('saves-modal');
  loadingInto(m);
  const slots = await fetchSlots(sh);
  if (!slots) { m.close(); return; }
  const byId = new Map(slots.map((s) => [s.slotId, s]));

  const doSave = async (slotId: string) => {
    const existing = byId.get(slotId);
    if (existing && !existing.empty) {
      const ok = await confirmDialog({ title: 'Overwrite this save?', text: `"${existing.name}" (${slotMeta(existing)}) will be replaced. This cannot be undone.`, confirm: 'Overwrite', danger: true });
      if (!ok) return;
    }
    const name = await promptDialog({ title: 'Name this save', label: 'Save name', value: existing && !existing.empty ? existing.name : defaultSaveName(sh), confirm: 'Save', maxLength: 40 });
    if (name === null) return;
    const done = busyOverlay('Saving…');
    let r: Awaited<ReturnType<typeof api.saveTo>>;
    try { r = await api.saveTo(slotId, name || defaultSaveName(sh)); } catch (err) { r = { ok: false, reason: err instanceof Error ? err.message : 'Unknown error.' }; }
    done();
    if (r.ok) {
      sh.sound('confirm');
      toast(`Saved to slot ${slotNumber(slotId)}: ${name || defaultSaveName(sh)}`, 'success');
      sh.tutorialSignal({ type: 'saved' });
      m.close();
    } else {
      sh.sound('error');
      await errorDialog({ title: 'Could not save', message: r.reason, note: 'Your previous saves were not changed. You can also download a backup of this world.' });
    }
  };

  const manual = MANUAL.map((id) => {
    const s = byId.get(id);
    const filled = !!s && !s.empty;
    const row = h('li', { class: ['slot', filled ? 'is-filled' : 'is-empty'] },
      h('span', { class: 'slot-num', text: slotNumber(id), attrs: { 'aria-hidden': 'true' } }),
      h('div', { class: 'slot-main' },
        h('span', { class: 'slot-name', text: filled ? s!.name : 'Empty slot' }),
        h('span', { class: 'slot-meta', text: filled ? slotMeta(s!) : `Slot ${slotNumber(id)}` })),
      button({ label: filled ? 'Overwrite' : 'Save here', icon: 'save', small: true, variant: filled ? 'secondary' : 'primary', onClick: () => { void doSave(id); } }));
    return row;
  });
  const auto = ['autosave', 'backup'].map((id) => {
    const s = byId.get(id);
    const filled = !!s && !s.empty;
    return h('li', { class: ['slot', 'is-auto', filled ? 'is-filled' : 'is-empty'] },
      h('span', { class: 'slot-num', text: slotNumber(id), attrs: { 'aria-hidden': 'true' } }),
      h('div', { class: 'slot-main' },
        h('span', { class: 'slot-name', text: id === 'autosave' ? 'Autosave' : 'Backup (previous autosave)' }),
        h('span', { class: 'slot-meta', text: filled ? slotMeta(s!) : 'Not saved yet' })));
  });
  m.body.replaceChildren(
    h('h3', { class: 'pp-subhead', text: 'Choose a slot' }),
    h('ol', { class: 'slot-list' }, ...manual),
    h('h3', { class: 'pp-subhead', text: 'Automatic saves' }),
    h('ul', { class: 'slot-list' }, ...auto),
    h('p', { class: 'muted-note' }, icon('info', 18), h('span', { text: 'The game autosaves regularly and keeps the previous autosave as a backup. Load them from Load game.' })),
    backupBox(sh),
  );
}

/** "Download a backup of this world" block, placed where players look for saves. */
export function backupBox(sh: Shell): HTMLElement {
  return h('div', { class: 'backup-box' },
    icon('export', 22),
    h('div', { class: 'backup-text' }, h('strong', { text: 'Keep a copy on your device' }), h('span', { text: 'Browser storage can be cleared. A downloaded backup can be imported later.' })),
    button({ label: 'Download a backup of this world', icon: 'export', small: true, onClick: () => exportWorldFile(sh) }));
}

// ---------------------------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------------------------

export async function openLoadDialog(sh: Shell, opts: { fromMenu: boolean }): Promise<void> {
  const { api } = sh;
  const m = modal({ title: 'Load game', wide: true });
  m.el.classList.add('saves-modal');
  const render = async () => {
    loadingInto(m);
    const slots = await fetchSlots(sh);
    if (!slots) { m.close(); return; }
    const filled = slots.filter((s) => !s.empty);
    const order = (s: SaveSlotInfo) => (s.kind === 'manual' ? MANUAL.indexOf(s.slotId) : s.kind === 'autosave' ? 10 : 11);
    filled.sort((a, b) => order(a) - order(b));
    const rows = filled.map((s) => {
      const title = s.kind === 'autosave' ? `Autosave` : s.kind === 'backup' ? 'Backup (previous autosave)' : s.name;
      const load = button({ label: 'Load', icon: 'load', small: true, variant: 'primary', onClick: () => { void doLoad(s, title); } });
      load.setAttribute('aria-label', `Load ${title}`);
      const del = s.kind === 'manual' ? button({ icon: 'trash', iconOnly: true, variant: 'ghost', label: `Delete ${title}`, onClick: () => { void doDelete(s, title); } }) : null;
      return h('li', { class: ['slot', 'is-filled', s.kind !== 'manual' && 'is-auto'] },
        h('span', { class: 'slot-num', text: slotNumber(s.slotId), attrs: { 'aria-hidden': 'true' } }),
        h('div', { class: 'slot-main' }, h('span', { class: 'slot-name', text: title }), h('span', { class: 'slot-meta', text: slotMeta(s) })),
        h('div', { class: 'slot-actions' }, del, load));
    });
    setChildren(m.body,
      rows.length ? h('ol', { class: 'slot-list' }, ...rows) : h('div', { class: 'pp-empty' }, icon('load', 22), h('p', { text: 'No saved games yet.' })),
      h('div', { class: 'backup-box' }, icon('import', 22),
        h('div', { class: 'backup-text' }, h('strong', { text: 'Have a backup file?' }), h('span', { text: 'Import a world you downloaded earlier.' })),
        button({ label: 'Import a world file', icon: 'import', small: true, onClick: () => { void importWorldFile(sh, () => m.close()); } })),
      !opts.fromMenu && api.state() ? backupBox(sh) : null,
    );
  };

  const doLoad = async (s: SaveSlotInfo, title: string) => {
    if (api.state() && !opts.fromMenu) {
      const ok = await confirmDialog({ title: 'Load this save?', text: `Load "${title}"? Progress in the current game since your last save will be lost.`, confirm: 'Load' });
      if (!ok) return;
    }
    const done = busyOverlay('Loading…');
    let r: Awaited<ReturnType<typeof api.loadFrom>>;
    try { r = await api.loadFrom(s.slotId); } catch (err) { r = { ok: false, reason: err instanceof Error ? err.message : 'Unknown error.' }; }
    done();
    if (!r.ok) {
      sh.sound('error');
      await errorDialog({ title: 'Could not load', message: r.reason, details: r.report, note: api.state() ? 'Your current game was not changed.' : undefined });
      return;
    }
    sh.sound('confirm');
    m.close();
    toast(`Loaded: ${title}`, 'success');
    if (r.report?.length) await reportDialog({ title: 'Loaded with notes', intro: 'The save loaded. A few things were adjusted:', lines: r.report });
  };

  const doDelete = async (s: SaveSlotInfo, title: string) => {
    const ok = await confirmDialog({ title: 'Delete this save?', text: `"${title}" will be deleted for good.`, confirm: 'Delete', danger: true });
    if (!ok) return;
    const r = await api.deleteSave(s.slotId);
    if (!r.ok) { toast(r.reason, 'error'); sh.sound('error'); return; }
    sh.sound('sell');
    toast(`Deleted: ${title}`, 'info');
    void render();
  };

  await render();
}

// ---------------------------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------------------------

export function exportWorldFile(sh: Shell): void {
  const { api } = sh;
  const json = api.exportWorld();
  const st = api.state();
  if (!json || !st) { toast('No game is running, so there is nothing to download.', 'warning'); sh.sound('error'); return; }
  const name = exportFileName(activeHousehold(st)?.name ?? 'world', st.clock.minutes);
  try {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = h('a', { attrs: { href: url, download: name }, style: { display: 'none' } });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    sh.sound('confirm');
    toast(`Backup downloaded: ${name}`, 'success');
  } catch (err) {
    sh.sound('error');
    void errorDialog({ title: 'Download failed', message: err instanceof Error ? err.message : 'The file could not be created.' });
  }
}

export async function importWorldFile(sh: Shell, onImported?: () => void): Promise<void> {
  const { api } = sh;
  const input = h('input', { type: 'file', attrs: { accept: '.json,application/json' }, style: { display: 'none' } });
  document.body.appendChild(input);
  const file = await new Promise<File | null>((resolve) => {
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
  input.remove();
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) {
    await errorDialog({ title: 'File too large', message: `${file.name} is larger than 25 MB and is not a Hearthside Life world.`, note: 'Nothing was changed.' });
    return;
  }
  if (api.state()) {
    const ok = await confirmDialog({ title: 'Import this world?', text: `Replace the current game with "${file.name}"? Progress since your last save will be lost (the import is checked first; if it fails, nothing changes).`, confirm: 'Import' });
    if (!ok) return;
  }
  const done = busyOverlay('Checking the file…');
  let r: Awaited<ReturnType<typeof api.importWorld>>;
  try {
    const text = await file.text();
    r = await api.importWorld(text);
  } catch (err) {
    r = { ok: false, reason: err instanceof Error ? err.message : 'The file could not be read.' };
  }
  done();
  if (!r.ok) {
    sh.sound('error');
    await errorDialog({ title: 'Could not import this file', message: r.reason, details: r.report, note: api.state() ? 'Your current game was not changed.' : 'Nothing was changed.' });
    return;
  }
  sh.sound('confirm');
  onImported?.();
  toast(`Imported: ${file.name}`, 'success');
  if (r.report?.length) await reportDialog({ title: 'Import report', intro: 'The world was imported:', lines: r.report });
}
