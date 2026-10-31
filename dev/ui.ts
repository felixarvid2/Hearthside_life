// UI shell dev page: mounts createUI over a plain canvas driven by the mock GameAPI (src/ui/dev/mockGame.ts).
// Open /dev/ui.html?start=live (see dev/ui.html for the URL parameters).

import type { Speed } from '../src/core/clock';
import type { ContentDB } from '../src/content/types';
import type { StartMode } from '../src/core/types';
import { createUI, showCompatibilityScreen } from '../src/ui/app';
import { MockGame } from '../src/ui/dev/mockGame';
import { mergeContent, mockContent } from '../src/ui/dev/mockContent';

async function main(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const root = document.getElementById('ui-root')!;
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (q.has('nowebgl')) {
    showCompatibilityScreen(root, 'This browser or device did not provide WebGL 2, which Hearthside Life uses to draw the world.');
    return;
  }
  let real: ContentDB | null = null;
  if (q.get('content') === 'real') {
    try { real = (await import('../src/content/index')).content(); } catch (err) { console.warn('[dev/ui] real content unavailable, using mock content only', err); }
  }
  const startParam = q.get('start');
  const start = (['boot', 'menu', 'live', 'buy', 'build'] as const).find((s) => s === startParam) ?? 'menu';
  const speedParam = q.get('speed');
  const mode = q.get('mode');
  const game = new MockGame({
    content: mergeContent(mockContent(), real),
    canvas,
    start,
    bootMs: Number(q.get('boot') ?? 400),
    ...(speedParam !== null ? { speed: Math.max(0, Math.min(3, Number(speedParam))) as Speed } : {}),
    failStart: q.has('failstart'),
    noSaves: q.has('nosaves'),
    ...(mode === 'guided' || mode === 'create' || mode === 'sandbox' ? { startMode: mode as StartMode } : {}),
  });
  const ui = createUI(game, root);
  const w = window as unknown as Record<string, unknown>;
  w.__game = game;
  w.__ui = ui;
}

void main();
