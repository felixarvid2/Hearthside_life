// Pure helpers behind the social menu, the event goal tracker and the event planner (no DOM; unit-tested in
// tests/unit/ui/social.test.ts).

import type { EventDef } from '../../content/types';
import { DAY_NAMES, atDayMinute, dayIndex, formatClock, weekday } from '../../core/clock';
import { pairKey } from '../../core/ids';
import { relationshipLabel, romanceInterest } from '../../core/relations';
import type { HomeEvent, Person, RelLabel, WorldState } from '../../core/types';
import type { MenuOption } from '../../game/api';

// ---- social menu ----

/** Sub-groups inside a menu group, in display order ('' = entries without a section). */
const SECTIONS: Partial<Record<MenuOption['group'], Array<{ id: string; label: string }>>> = {
  social: [{ id: 'friendly', label: 'Friendly' }, { id: 'romantic', label: 'Romantic' }, { id: 'mean', label: 'Mean' }, { id: 'special', label: 'Special' }],
  self: [{ id: '', label: '' }, { id: 'phone', label: 'Phone' }],
};

/** Splits a group into its sections in display order; entries of an unknown section go last. */
export function sectionsOf(group: MenuOption['group'], items: MenuOption[]): Array<{ id: string; label: string; items: MenuOption[] }> {
  const order = SECTIONS[group] ?? [{ id: '', label: '' }];
  const out = order.map((s) => ({ ...s, items: [] as MenuOption[] }));
  for (const o of items) {
    const hit = out.find((s) => s.id === (o.section ?? ''));
    (hit ?? out[out.length - 1]!).items.push(o);
  }
  return out.filter((s) => s.items.length > 0);
}

// ---- event tracker ----

/** How long (game minutes) a finished event's result stays on screen. */
export const RESULT_MINUTES = 45;

/** The event to show for the household: a running one, else the next planned, else a just-finished one not yet dismissed. */
export function trackedEvent(st: WorldState, dismissed: ReadonlySet<string>): HomeEvent | undefined {
  const mine = (st.homeEvents ?? []).filter((e) => e.householdId === st.activeHouseholdId);
  const running = mine.find((e) => e.status === 'running');
  if (running) return running;
  const planned = mine.filter((e) => e.status === 'invited').sort((a, b) => a.startAt - b.startAt)[0];
  if (planned) return planned;
  return mine.filter((e) => e.status === 'done' && st.clock.minutes - e.endAt <= RESULT_MINUTES && !dismissed.has(e.id)).sort((a, b) => b.endAt - a.endAt)[0];
}

// ---- event planner ----

/** Start times offered: these hours of the day, today and the next two days, that respect the notice. */
const HOURS = [10, 12, 15, 18, 19, 20];

export interface StartOption { at: number; label: string }

/** Offered start times (absolute game minutes) for an event type: at least its notice from now, within three days. */
export function startOptions(now: number, leadMinutes: number): StartOption[] {
  const out: StartOption[] = [];
  const today = dayIndex(now);
  for (let d = today; d <= today + 3; d++) {
    for (const hr of HOURS) {
      const at = atDayMinute(d, hr * 60);
      if (at < now + Math.max(30, leadMinutes) || at > now + 3 * 1440) continue;
      const when = d === today ? 'Today' : d === today + 1 ? 'Tomorrow' : DAY_NAMES[weekday(at)]!;
      out.push({ at, label: `${when}, ${formatClock(at)}` });
    }
  }
  return out;
}

/** Known people who could be invited: not in the host's household (dates also allow a partner at home), best liked first. */
export function guestCandidates(st: WorldState, host: Person, def: EventDef): Person[] {
  const out: Person[] = [];
  for (const r of Object.values(st.relationships)) {
    if (r.from !== host.id || r.familiarity <= 0) continue;
    const g = st.people[r.to];
    if (!g || g.id === host.id) continue;
    const sameHome = g.householdId === host.householdId;
    if (sameHome && !def.romantic) continue;
    if (def.romantic && (!romanceInterest(host, g) || r.romanceBlocked)) continue;
    out.push(g);
  }
  return out.sort((a, b) => (st.relationships[`${host.id}>${b.id}`]?.friendship ?? 0) - (st.relationships[`${host.id}>${a.id}`]?.friendship ?? 0) || a.firstName.localeCompare(b.firstName));
}

/** Where a guest is, in a few words, and whether an invitation can reach them. */
export function guestAvailability(g: Person): { ok: boolean; text: string } {
  if (g.location.kind === 'lot') return { ok: true, text: 'Here already' };
  if (g.location.transit) return { ok: false, text: 'On the way somewhere' };
  if (g.location.place === 'home') return { ok: true, text: 'At home' };
  if (g.location.place === 'visiting') return { ok: true, text: 'Out in town' };
  if (g.location.place === 'work') return { ok: false, text: 'At work' };
  return { ok: false, text: 'Away' };
}

/** The label to show for `from`'s view of `to`: the stored one, else derived from the values and the bond (older saves). */
export function shownLabel(st: WorldState, from: string, to: string): RelLabel {
  const r = st.relationships[`${from}>${to}`];
  if (!r) return 'stranger';
  if (r.label) return r.label;
  const a = st.people[from], b = st.people[to];
  return relationshipLabel(r, st.bonds[pairKey(from, to)]?.status, undefined, !!a && !!b && romanceInterest(a, b));
}
