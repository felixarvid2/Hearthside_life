// Entry point: WebGL2 check (compatibility screen when missing), saves, GameCore, Game (renderer), the HTML
// interface, asset loading behind the boot screen, then the main menu.
//
// window.hearthside exposes the game for tests and curious players (single-player, local only):
//   hearthside.game / .core / .view       the GameAPI implementation, the pure core, the renderer
//   hearthside.debug.step(n)              run n simulation ticks synchronously
//   hearthside.debug.frame(dt)            run one game frame (simulation + render)
//   hearthside.debug.state()              the current WorldState (read-only by convention)
//   hearthside.debug.run(name, ...args)   call any GameAPI method by name

import { content } from './content/index';
import type { GameAPI } from './game/api';
import { Game } from './game/Game';
import { GameCore } from './game/GameCore';
import { requestPersistentStorage, SaveStore } from './persistence/index';
import { createUI, showCompatibilityScreen } from './ui/app';

declare global {
  interface Window {
    hearthside?: {
      game: Game;
      core: GameCore;
      view: Game['gameView'];
      ready: boolean;
      error: string | null;
      debug: {
        step(n: number): void;
        frame(dt?: number): void;
        state(): ReturnType<GameCore['state']>;
        run(name: keyof GameAPI | string, ...args: unknown[]): unknown;
        stats(): ReturnType<Game['devStats']>;
      };
    };
  }
}

async function boot(): Promise<void> {
  const root = document.getElementById('ui-root');
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!root || !canvas) throw new Error('Page markup is missing #ui-root or #game-canvas.');

  if (!Game.webgl2Available()) {
    showCompatibilityScreen(root, 'This browser or device could not start WebGL 2, which Hearthside Life uses to draw the world.');
    return;
  }

  const db = content();
  const saves = await SaveStore.open(undefined, { content: db });
  void requestPersistentStorage().catch(() => undefined);
  const core = new GameCore({ content: db, saves });
  let game: Game;
  try {
    game = new Game(core, { canvas, overlay: document.getElementById('world-overlay') });
  } catch (e) {
    showCompatibilityScreen(root, `The 3D view could not start: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  window.hearthside = {
    game, core, view: game.gameView, ready: false, error: null,
    debug: {
      step: (n) => game.advanceTicks(Math.max(0, Math.floor(n))),
      frame: (dt = 1 / 30) => game.step(dt),
      state: () => core.state(),
      run: (name, ...args) => {
        const fn = (game as unknown as Record<string, unknown>)[name as string];
        if (typeof fn !== 'function') throw new Error(`No GameAPI method "${String(name)}".`);
        return (fn as (...a: unknown[]) => unknown).apply(game, args);
      },
      stats: () => game.devStats(),
    },
  };

  createUI(game, root);
  try {
    await game.load((p) => { document.body.dataset.loadProgress = String(Math.round(p * 100)); });
  } catch (e) {
    console.error('[main] asset loading failed', e);
    window.hearthside.error = e instanceof Error ? e.message : String(e);
  }
  game.showMenu();
  window.hearthside.ready = true;
}

boot().catch((e: unknown) => {
  console.error('[main] start-up failed', e);
  const root = document.getElementById('ui-root');
  if (root) showCompatibilityScreen(root, `Something went wrong while starting: ${e instanceof Error ? e.message : String(e)}`);
  if (window.hearthside) window.hearthside.error = String(e);
});
