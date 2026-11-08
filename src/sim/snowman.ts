// Milestone 12, task O: snowmen built by the Build a Snowman interaction. Each one is an ordinary placed object
// with an additive `snowman` state (see PlacedObject.snowman): when it was made, how many snow-free days it has
// lasted and the last day counted. An hourly check removes it once winter ends, or after three snow-free days in
// winter (a fresh snowfall resets the count). Everything here is pure simulation.

import { dayIndex } from '../core/clock';
import { seasonFor } from '../core/season';
import type { WorldState } from '../core/types';
import type { SimCtx } from './context';
import { currentWeather } from './weather';

export const SNOWMAN_WARM_DAYS = 3;

/** True when it rains now or rain was planned in either half of today (rain melts a snowman twice as fast). */
function rainToday(ctx: Pick<SimCtx, 'state'>): boolean {
  if (currentWeather(ctx.state) === 'rain') return true;
  return ctx.state.weather?.today.includes('rain') ?? false;
}

/** True when snow is falling now or was planned in either half of today. */
function snowToday(ctx: Pick<SimCtx, 'state'>): boolean {
  if (currentWeather(ctx.state) === 'snow') return true;
  return ctx.state.weather?.today.includes('snow') ?? false;
}

/**
 * Ages every snowman: a snow-free day in winter counts toward the thaw (three warm days and it is gone); snow
 * resets the count. A snowman outside winter, or with the weather setting off, melts at once. Emits one
 * `lot.changed` event per affected lot.
 */
export function updateSnowmen(ctx: Pick<SimCtx, 'state' | 'now' | 'events' | 'content'>): void {
  const state: WorldState = ctx.state;
  const day = dayIndex(ctx.now);
  const winter = state.settings.weather !== false && seasonFor(ctx.now, state.settings) === 'winter';
  for (const lot of Object.values(state.lots)) {
    let changed = false;
    for (const [id, obj] of Object.entries(lot.objects)) {
      if (!obj.snowman) continue;
      if (!winter) { delete lot.objects[id]; changed = true; continue; }
      if (snowToday(ctx)) {
        if (obj.snowman.warmDays !== 0) { obj.snowman.warmDays = 0; obj.snowman.lastWarmDay = day; }
        continue;
      }
      if (obj.snowman.lastWarmDay === day) continue;
      obj.snowman.warmDays += rainToday(ctx) ? 2 : 1;
      obj.snowman.lastWarmDay = day;
      if (obj.snowman.warmDays >= SNOWMAN_WARM_DAYS) { delete lot.objects[id]; changed = true; }
    }
    if (changed) ctx.events.emit({ type: 'lot.changed', lotId: lot.id, what: 'objects' });
  }
}
