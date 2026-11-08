// Recovery dialog for the error boundary (game/crashGuard.ts): keep playing, reload the last autosave, or export a
// diagnostic file. Also hooks window errors and unhandled promise rejections into the same guard.

import { buildDiagnostic } from '../../game/crashGuard';
import type { CrashInfo } from '../../game/crashGuard';
import type { Game } from '../../game/Game';
import { button, modal } from '../kit/components';
import { h } from '../kit/dom';
import { icon } from '../kit/icons';

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { attrs: { href: url, download: filename } });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** The diagnostic file for the faults seen so far (the world is included when it can still be exported). */
export function diagnosticText(game: Game, note?: string): string {
  let worldJson: string | null = null;
  try { worldJson = game.exportWorld(); } catch { worldJson = null; }
  let gameMinutes: number | null = null;
  try { gameMinutes = game.state()?.clock.minutes ?? null; } catch { gameMinutes = null; }
  return buildDiagnostic(game.crashGuard.recent, {
    generatedAt: new Date().toISOString(), userAgent: navigator.userAgent, viewport: `${window.innerWidth}x${window.innerHeight}`,
    mode: game.mode(), speed: game.speed(), gameMinutes, worldJson, ...(note ? { note } : {}),
  });
}

/** Shows the recovery dialog for one fault. Resolves when the player has chosen. */
export function showCrashDialog(game: Game, info: CrashInfo): Promise<void> {
  return new Promise((resolve) => {
    let chosen = false;
    const m = modal({ title: 'Something went wrong', onClose: () => { if (!chosen) { chosen = true; game.crashGuard.resume(); } resolve(); } });
    m.el.classList.add('crash-dialog');
    const status = h('p', { class: 'muted-note', attrs: { 'data-crash-status': '' } });
    m.body.append(
      h('div', { class: 'error-box', role: 'alert' }, icon('warning', 22),
        h('p', { text: info.repeated
          ? 'The same problem happened again. The game is paused. Reloading the last autosave is the safest way on.'
          : 'The game hit an unexpected problem and was paused so nothing else gets damaged. Your saves are untouched.' })),
      h('p', { class: 'crash-detail', text: `${info.latest.where}: ${info.latest.message}` }),
      status,
    );
    const finish = () => { chosen = true; m.close(); };
    const keep = button({ label: 'Keep playing', variant: 'primary', onClick: () => { finish(); } });
    const reload = button({
      label: 'Reload last autosave', variant: 'secondary', onClick: async () => {
        reload.disabled = true;
        status.textContent = 'Loading the autosave...';
        let r: { ok: boolean; reason?: string } = { ok: false, reason: 'unknown' };
        try { r = await game.loadFrom('autosave'); } catch (e) { r = { ok: false, reason: e instanceof Error ? e.message : String(e) }; }
        if (r.ok) { finish(); return; }
        reload.disabled = false;
        status.textContent = `Could not reload the autosave: ${r.reason ?? 'unknown problem'}`;
      },
    });
    const exportBtn = button({
      label: 'Export diagnostic file', variant: 'secondary', onClick: () => {
        try {
          download(`hearthside-diagnostic-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`, diagnosticText(game));
          status.textContent = 'Diagnostic file saved to your downloads. It holds the error details and your world.';
        } catch (e) { status.textContent = `Could not create the file: ${e instanceof Error ? e.message : String(e)}`; }
      },
    });
    m.footer.append(exportBtn, reload, keep);
  });
}

/** Wires the dialog to the game's error boundary and to uncaught errors in the page. */
export function installCrashRecovery(game: Game): void {
  game.onCrash((info) => { void showCrashDialog(game, info); });
  window.addEventListener('error', (e) => { game.crashGuard.report('ui', e.error ?? e.message); });
  window.addEventListener('unhandledrejection', (e) => { game.crashGuard.report('promise', e.reason); });
}
