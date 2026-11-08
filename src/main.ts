// Entry point: WebGL2 check (compatibility screen when missing), saves, GameCore, Game (renderer), the HTML
// interface, asset loading behind the boot screen, then the main menu.
//
// window.hearthside exposes the game for tests and curious players (single-player, local only):
//   hearthside.game / .core / .view       the GameAPI implementation, the pure core, the renderer
//   hearthside.debug.step(n)              run n simulation ticks synchronously
//   hearthside.debug.frame(dt)            run one game frame (simulation + render)
//   hearthside.debug.state()              the current WorldState (read-only by convention)
//   hearthside.debug.run(name, ...args)   call any GameAPI method by name
//   hearthside.debug.setWeather(kind)     pin today's stored weather plan (tests: keeps runs deterministic)

import type { WeatherKind } from './core/types';
import type { GameAPI } from './game/api';
import { Game } from './game/Game';
import { GameCore } from './game/GameCore';
import { requestPersistentStorage, SaveStore } from './persistence/index';
import { createUI, showCompatibilityScreen } from './ui/app';
import { bootProgress } from './ui/bootProgress';
import { installCrashRecovery } from './ui/screens/crash';

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
        /** Pins the stored plan for the current day so an end-to-end run does not depend on the random world seed. */
        setWeather(kind: WeatherKind): boolean;
        stats(): ReturnType<Game['devStats']>;
        /** Tests: reports a fault as if the loop had thrown it (shows the recovery dialog). */
        crash(message?: string): void;
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

  // The content catalogue (about a third of the code) is its own chunk, fetched here so the entry chunk stays small.
  bootProgress.set(0.02, 'Fetching the catalogue');
  const { content } = await import('./content/index');
  const db = content();
  bootProgress.set(0.08, 'Opening your saves');
  const saves = await SaveStore.open(undefined, { content: db });
  bootProgress.set(0.12, 'Starting the world');
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
      setWeather: (kind: WeatherKind) => {
        const st = core.state();
        if (!st || !['clear', 'cloudy', 'rain', 'snow'].includes(kind)) return false;
        // Same-day plans are kept by ensureWeather (a reload never rerolls a day), so this stays until midnight and
        // the next day is planned normally again. Tests use it to make outdoor steps repeatable across seeds.
        // Pinning a plan must not erase snow that has already settled: the next sim tick keeps it while it is winter.
        const day = Math.floor(st.clock.minutes / 1440);
        const half = st.clock.minutes % 1440 < 720 ? 0 : 1;
        const snowCover = st.weather?.snowCover === true;
        st.weather = { current: kind, today: [kind, kind], tomorrow: [kind, kind], day, since: day * 1440 + half * 720, ...(snowCover ? { snowCover: true } : {}) };
        return true;
      },
      stats: () => game.devStats(),
      crash: (message = 'Test fault') => { game.crashGuard.report('simulation', new Error(message)); },
    },
  };

  createUI(game, root);
  installCrashRecovery(game);
  try {
    await game.load((p, label) => {
      bootProgress.set(0.12 + 0.88 * p, label);
      document.body.dataset.loadProgress = String(Math.round(p * 100));
    });
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
