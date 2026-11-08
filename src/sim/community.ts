// Community events (Milestone 13): the weekly calendar at the public venues (content/communityEvents.ts). What is on is a pure
// function of the clock and the venue lots, so nothing is stored but the once-only marks of what has been rewarded:
//
//   - `communityEventsBetween` / `runningCommunityEvents`: the calendar (also read by the townspeople's light schedule, which
//     turns out for an event, and by the interface);
//   - `runCommunityEvents` (every 15 game minutes): household members on the venue's lot while the event runs are marked as
//     attending (`commatt:<key>:<person>`); after `attendMinutes` they get the reward once (`commdone:<key>:<person>`) and meet
//     the townspeople who are there (`commmeet:<key>:<pair>`, once per pair);
//   - `announceCommunityEvents` (daily): a feed line for each event of the day.
// No money changes hands. Randomness is not used.

import type { ContentDB } from '../content/types';
import { dayIndex, formatClock, atDayMinute } from '../core/clock';
import { pairKey } from '../core/ids';
import { addFeed, isProcessed, markProcessed } from '../core/state';
import type { GameMinutes, Id, Person, WorldState } from '../core/types';
import { venueInfo } from '../world/neighbourhood';
import type { SimCtx } from './context';
import { lotLoc } from './context';
import { addMoodlet } from './mood';
import { changeNeed } from './needs';
import { addMemory, applyRelDelta } from './relationships';

export interface CommunityEventInfo {
  /** `<defId>:<day>`: one occurrence. */
  key: string;
  defId: string;
  name: string;
  description: string;
  icon: string;
  lotId: Id;
  lotName: string;
  venueType: string;
  startAt: GameMinutes;
  endAt: GameMinutes;
  running: boolean;
}

/** The lot that hosts a kind of venue: the first lot of that type in lot order. */
export function venueLotOf(state: WorldState, venueType: string): Id | null {
  return Object.values(state.lots).find((l) => venueInfo(l) !== undefined && l.venueType === venueType)?.id ?? null;
}

/** Every occurrence that overlaps [from, to), sorted by start. Pure. */
export function communityEventsBetween(state: WorldState, content: ContentDB, from: GameMinutes, to: GameMinutes): CommunityEventInfo[] {
  const defs = Object.values(content.communityEvents ?? {}).filter((d) => d.status === 'ready');
  if (defs.length === 0) return [];
  const out: CommunityEventInfo[] = [];
  for (let day = dayIndex(from) - 1; day <= dayIndex(to); day++) {
    for (const d of defs) {
      if ((day % 7 + 7) % 7 !== d.weekday) continue;
      const startAt = atDayMinute(day, d.start), endAt = startAt + d.minutes;
      if (endAt <= from || startAt >= to) continue;
      const lotId = venueLotOf(state, d.venueType);
      if (!lotId) continue;
      out.push({
        key: `${d.id}:${day}`, defId: d.id, name: d.name, description: d.description, icon: d.icon, lotId, lotName: state.lots[lotId]!.name,
        venueType: d.venueType, startAt, endAt, running: startAt <= from && from < endAt,
      });
    }
  }
  return out.sort((a, b) => a.startAt - b.startAt || (a.key < b.key ? -1 : 1));
}

/** Events running at `now`. */
export function runningCommunityEvents(state: WorldState, content: ContentDB, now: GameMinutes): CommunityEventInfo[] {
  return communityEventsBetween(state, content, now, now + 0.001).filter((e) => e.startAt <= now && now < e.endAt);
}

/** What is on in the next `days` days, running events first (for the map and the phone). */
export function upcomingCommunityEvents(state: WorldState, content: ContentDB, now: GameMinutes, days = 7): CommunityEventInfo[] {
  return communityEventsBetween(state, content, now, now + days * 1440).map((e) => ({ ...e, running: e.startAt <= now && now < e.endAt }));
}

const attends = (ctx: SimCtx, p: Person, lotId: Id): boolean => p.householdId === ctx.state.activeHouseholdId && lotLoc(p)?.lotId === lotId;

/** Rewards the household members who have stayed long enough, once each, and lets them meet the townspeople there. */
export function runCommunityEvents(ctx: SimCtx): void {
  const state = ctx.state;
  for (const ev of runningCommunityEvents(state, ctx.content, ctx.now)) {
    if (state.activeLotId !== ev.lotId) continue;
    const def = ctx.content.communityEvents?.[ev.defId];
    if (!def) continue;
    const here = Object.values(state.people).filter((p) => lotLoc(p)?.lotId === ev.lotId);
    for (const p of here) {
      if (!attends(ctx, p, ev.lotId)) continue;
      const att = `commatt:${ev.key}:${p.id}`;
      if (!isProcessed(state, att)) { markProcessed(state, att); continue; }
      const since = state.processed[att] ?? ctx.now;
      const done = `commdone:${ev.key}:${p.id}`;
      if (ctx.now - since < def.attendMinutes || isProcessed(state, done)) continue;
      markProcessed(state, done);
      changeNeed(ctx, p, 'fun', def.reward.fun);
      changeNeed(ctx, p, 'social', def.reward.social);
      addMoodlet(ctx.content, p, 'partyGlow', ctx.now, `community:${def.id}`);
      addMemory(state, p, { kind: 'party', importance: 1, text: `Went to ${def.name} at ${ev.lotName}.` });
      addFeed(state, ctx.events, 'social', `${p.firstName} enjoyed ${def.name} at ${ev.lotName}.`, p.id);
      for (const o of here) {
        if (o.householdId === p.householdId) continue;
        const meet = `commmeet:${ev.key}:${pairKey(p.id, o.id)}`;
        if (isProcessed(state, meet)) continue;
        markProcessed(state, meet);
        applyRelDelta(state, p.id, o.id, { familiarity: 2, friendship: def.reward.friendship }, ctx.now);
        applyRelDelta(state, o.id, p.id, { familiarity: 2, friendship: def.reward.friendship }, ctx.now);
      }
    }
  }
}

/** Daily: one feed line for each event of today (and none twice). */
export function announceCommunityEvents(ctx: SimCtx, day: number): void {
  const from = atDayMinute(day, 0);
  for (const e of communityEventsBetween(ctx.state, ctx.content, from, from + 1440)) {
    if (dayIndex(e.startAt) !== day) continue;
    const mark = `commann:${e.key}`;
    if (isProcessed(ctx.state, mark)) continue;
    markProcessed(ctx.state, mark);
    addFeed(ctx.state, ctx.events, 'info', `Today at ${e.lotName}: ${e.name} from ${formatClock(e.startAt)}.`);
  }
}
