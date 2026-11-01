// Autonomy: utility scoring over the interactions available on the lot. Scores combine need urgency
// curves with advertised gains, distance, trait biases and likes, and repetition cooldowns. People decide
// only when idle, at most every AUTONOMY_INTERVAL minutes (staggered per person). A running low-priority
// autonomous activity is interrupted only for an urgent need and only when the alternative is clearly
// better (hysteresis), so people do not flip between similar options. Visitors use a restricted set.

import type { InteractionDef, SocialDef } from '../content/types';
import { hourOfDay } from '../core/clock';
import type { ActionInstance, NeedId, Person } from '../core/types';
import { NEED_IDS } from '../core/types';
import { BOOK_MAX_LEVEL } from '../content/skillEffects';
import { SKILL_BOOKS, behaviorFor, freeUsePointExists } from './behaviors';
import { choreCandidates } from './chores';
import { availableMeals, stovesOn } from './cooking';
import { isBroken } from './housekeeping';
import type { SimCtx } from './context';
import { dist, hashString, isVisitor, lotLoc, lotObjects, objectCenter } from './context';
import { needUrgency } from './needs';
import { insertAction, makeAction } from './queue';
import { eventMealsFor, eventSocialBonus, onDateTogether } from './events';
import { commitmentOf, familyTie, hasRecentMemory, peekRel } from './relationships';
import { personKey } from './reservations';
import { isVisitPending, neighbours } from './visitors';
import { personAvailable, romanceInterest, socialAcceptance, socialRequirementReason } from './social';
import {
  EVENT_EAT_SCORE, LONELY_INVITE_BELOW, SOCIAL_INTERRUPT_BELOW, SLEEP_DAY_ENERGY, SLEEP_NIGHT_END, SLEEP_NIGHT_START, AUTONOMY_INTERRUPT_FACTOR, AUTONOMY_INTERRUPT_NEED, AUTONOMY_INTERVAL, AUTONOMY_MIN_SCORE, AUTONOMY_PICK_BAND,
} from './tuning';
import type { ActionRequest } from './types';

/** Behaviors visitors may use on their own (besides socials). */
const VISITOR_BEHAVIORS: ReadonlySet<string> = new Set(['sit', 'watchTv']);
/** Behaviors autonomy never picks (they need player intent or data). */
const NEVER_AUTONOMOUS: ReadonlySet<string> = new Set(['changeOutfit', 'editOutfits', 'goToWork', 'goHere', 'invite', 'leaveLot']);

/** Key in Person.cooldowns holding the next minute this person may make an autonomous decision. */
export const DECIDE_KEY = '@decide';

export interface Candidate { req: ActionRequest; score: number; key: string; addresses: NeedId[] }

/** Score multiplier from traits (autonomyBias) and likes/dislikes for an interaction id and its tags. */
export function biasFor(ctx: SimCtx, p: Person, id: string, tags: readonly string[]): number {
  let m = 1;
  const keys = [id, ...tags];
  for (const t of p.traits) {
    const bias = ctx.content.traits[t]?.effects.autonomyBias;
    if (!bias) continue;
    for (const k of keys) { const v = bias[k]; if (v !== undefined) m *= v; }
  }
  for (const k of tags) {
    if (p.likes.includes(`activity:${k}`)) m *= 1.3;
    if (p.dislikes.includes(`activity:${k}`)) m *= 0.5;
  }
  return m;
}

/** Need part of a score: advertised gains weighted by urgency (level 0 only counts urgent needs). */
function needScore(ctx: SimCtx, p: Person, ads: Partial<Record<NeedId, number>>, out: NeedId[]): number {
  const level = isVisitor(ctx, p) ? 1 : ctx.state.settings.autonomyLevel;
  let s = 0;
  for (const n of NEED_IDS) {
    const gain = ads[n];
    if (!gain || gain <= 0) continue;
    const v = p.needs[n];
    if (level === 0 && v >= 30) continue;
    if (v >= 99) continue;
    const part = (gain * needUrgency(v)) / 25;
    if (part > 0.05) out.push(n);
    s += part;
  }
  return s;
}

export function cooldownMult(ctx: SimCtx, p: Person, id: string, targetKey: string): number {
  if ((p.cooldowns[`${id}@${targetKey}`] ?? -Infinity) > ctx.now) return 0;
  return (p.cooldowns[id] ?? -Infinity) > ctx.now ? 0.25 : 1;
}

/**
 * Day/night rhythm for going to bed: at night (SLEEP_NIGHT_START..SLEEP_NIGHT_END) sleep is strongly
 * favoured unless the person is nearly rested; during the day people only go to bed when really tired.
 */
export function sleepTimeFactor(now: number, energy: number): number {
  const h = hourOfDay(now);
  if (h >= SLEEP_NIGHT_START || h < SLEEP_NIGHT_END) return energy < 90 ? 3 : 0;
  return energy < SLEEP_DAY_ENERGY ? 1 : 0;
}

/** Extra score for greeting a stranger who is on the lot. */
const STRANGER_GREETING_BONUS = 1;

/** Baseline interest visitors have in sitting down, watching TV and talking (they came to socialise). */
const VISITOR_BASE = 0.3;

/** Utility of an interaction for a person at a distance (metres). */
export function interactionScore(ctx: SimCtx, p: Person, def: InteractionDef, distance: number, targetKey: string, addresses: NeedId[]): number {
  const visitor = isVisitor(ctx, p);
  let s = needScore(ctx, p, def.autonomy.ads, addresses);
  if (!visitor && ctx.state.settings.autonomyLevel === 2) s = s * (def.skill ? 1.5 : 1) + 0.05;
  if (visitor) s += VISITOR_BASE;
  if (def.behavior === 'sleep') s *= sleepTimeFactor(ctx.now, p.needs.energy);
  if (s <= 0) return 0;
  s *= biasFor(ctx, p, def.id, def.autonomy.tags);
  s /= 1 + distance / 15;
  return s * cooldownMult(ctx, p, def.id, targetKey);
}

function householdCooking(ctx: SimCtx, p: Person): boolean {
  const hh = ctx.state.households[p.householdId];
  return (hh?.memberIds ?? []).some((id) => ctx.state.people[id]?.queue.some((a) => ctx.content.interactions[a.interactionId]?.behavior === 'cook'));
}

/** All autonomy candidates for a person on a lot, scored. */
export function candidatesFor(ctx: SimCtx, p: Person): Candidate[] {
  const loc = lotLoc(p);
  if (!loc) return [];
  const visitor = isVisitor(ctx, p);
  const out: Candidate[] = [];
  const funds = ctx.state.households[p.householdId]?.funds ?? 0;
  const meals = visitor ? [] : availableMeals(ctx, loc.lotId, p.householdId);
  const hasStove = stovesOn(ctx, p).length > 0;
  for (const ref of lotObjects(ctx, loc.lotId, loc.level)) {
    if (isBroken(ref.obj)) continue;
    for (const iid of ref.def.interactions) {
      const def = ctx.content.interactions[iid];
      if (!def || !def.autonomy.enabled || def.status !== 'ready' || def.kind !== 'object') continue;
      const beh = def.behavior ?? 'generic';
      if (NEVER_AUTONOMOUS.has(beh)) continue;
      if (visitor && !(def.allowVisitors && VISITOR_BEHAVIORS.has(beh))) continue;
      if (def.cost && def.cost > funds) continue;
      if (beh === 'cook') {
        if (!hasStove || meals.length > 0 || householdCooking(ctx, p)) continue;
        const cheapest = Object.values(ctx.content.recipes).filter((r) => r.status === 'ready').reduce((m, r) => Math.min(m, r.cost), Infinity);
        if (!(cheapest <= funds)) continue;
      }
      // Skill books: study the skill the person knows least (up to the level books can teach).
      let data: ActionRequest['data'] | undefined;
      if (iid === 'readSkillBook') {
        const skillId = bookToStudy(ctx, p);
        if (!skillId) continue;
        data = { skillId };
      }
      if (!freeUsePointExists(ctx, p, def, ref.obj.id)) continue;
      const c = objectCenter(ref);
      const addresses: NeedId[] = [];
      const score = interactionScore(ctx, p, def, dist(loc.x, loc.z, c.x, c.z), ref.obj.id, addresses);
      if (score > 0) out.push({ req: { interactionId: iid, target: { kind: 'object', objectId: ref.obj.id, slotId: null }, ...(data ? { data } : {}) }, score, key: `${iid}@${ref.obj.id}`, addresses });
    }
  }
  const eat = ctx.content.interactions.eatMeal;
  // Guests (and hosts) at a running event take the food that was set out for it, hungry or not.
  if (eat && eat.status === 'ready') {
    for (const m of eventMealsFor(ctx, p)) {
      const score = EVENT_EAT_SCORE / (1 + dist(loc.x, loc.z, m.position.x, m.position.z) / 15) * cooldownMult(ctx, p, eat.id, m.id);
      if (score > 0) out.push({ req: { interactionId: eat.id, target: { kind: 'item', itemId: m.id } }, score, key: `${eat.id}@${m.id}`, addresses: [] });
    }
  }
  if (eat && eat.autonomy.enabled !== false) {
    for (const m of meals) {
      const addresses: NeedId[] = [];
      const ads = Object.keys(eat.autonomy.ads).length > 0 ? eat.autonomy.ads : { hunger: 60 };
      let score = needScore(ctx, p, ads, addresses);
      if (score <= 0) continue;
      score *= biasFor(ctx, p, eat.id, eat.autonomy.tags) / (1 + dist(loc.x, loc.z, m.position.x, m.position.z) / 15);
      score *= cooldownMult(ctx, p, eat.id, m.id) * (0.85 + 0.3 * m.quality);
      if (score > 0) out.push({ req: { interactionId: eat.id, target: { kind: 'item', itemId: m.id } }, score, key: `${eat.id}@${m.id}`, addresses });
    }
  }
  if (!visitor) {
    for (const def of Object.values(ctx.content.interactions)) {
      if (def.kind !== 'self' || !def.autonomy.enabled || def.status !== 'ready') continue;
      if (NEVER_AUTONOMOUS.has(def.behavior ?? 'generic')) continue;
      if (def.cost && def.cost > funds) continue;
      let data: ActionRequest['data'] | undefined;
      if (def.behavior === 'invite') continue;
      if (def.behavior === 'phoneChat') {
        const friend = phoneFriend(ctx, p);
        if (!friend) continue;
        data = { personId: friend };
      }
      const addresses: NeedId[] = [];
      const score = interactionScore(ctx, p, def, 0, 'self', addresses);
      if (score > 0) out.push({ req: { interactionId: def.id, target: { kind: 'self' }, ...(data ? { data } : {}) }, score, key: `${def.id}@self`, addresses });
    }
  }
  const social = socialCandidate(ctx, p);
  if (social) out.push(social);
  if (!visitor) { const inv = inviteCandidate(ctx, p); if (inv) out.push(inv); }
  if (!visitor) out.push(...choreCandidates(ctx, p, { biasFor, cooldownMult }));
  return out;
}

/** The skill a person studies from a skill book: the lowest of the book skills below the book cap (ties by id). */
function bookToStudy(ctx: SimCtx, p: Person): string | null {
  let best: string | null = null, bestLevel = BOOK_MAX_LEVEL;
  for (const id of Object.keys(SKILL_BOOKS).sort((x, y) => hashString(p.id + x) - hashString(p.id + y))) {
    if (!ctx.content.skills[id]) continue;
    const lv = p.skills[id]?.level ?? 1;
    if (lv < bestLevel) { best = id; bestLevel = lv; }
  }
  return best;
}

/**
 * A lonely person (social below LONELY_INVITE_BELOW) may phone a known neighbour who is at home and invite
 * them over, in the daytime and when nobody is visiting or expected (even though invites are not otherwise
 * autonomous).
 */
function inviteCandidate(ctx: SimCtx, p: Person): Candidate | null {
  if (p.needs.social >= LONELY_INVITE_BELOW) return null;
  const h = hourOfDay(ctx.now);
  if (h < 9 || h >= 19) return null;
  const def = Object.values(ctx.content.interactions).find((d) => d.behavior === 'invite' && d.kind === 'self' && d.status === 'ready');
  const loc = lotLoc(p);
  if (!def || !loc) return null;
  if (Object.values(ctx.state.people).some((o) => o.householdId !== p.householdId && lotLoc(o)?.lotId === loc.lotId)) return null;
  let guest: Person | null = null, bestF = -10;
  for (const o of neighbours(ctx.state)) {
    if (isVisitPending(ctx.state, o.id)) return null;
    if (o.location.kind !== 'offlot' || o.location.place !== 'home') continue;
    const rel = peekRel(ctx.state, p.id, o.id);
    if (rel.familiarity > 0 && rel.friendship > bestF) { guest = o; bestF = rel.friendship; }
  }
  if (!guest) return null;
  const addresses: NeedId[] = [];
  const score = needScore(ctx, p, { social: 15 }, addresses) * cooldownMult(ctx, p, def.id, guest.id);
  return score > 0 ? { req: { interactionId: def.id, target: { kind: 'self' }, data: { personId: guest.id } }, score, key: `${def.id}@${guest.id}`, addresses } : null;
}

/** The friendliest known person away from this lot (not at work, friendship > -10) for a phone chat, or null. */
function phoneFriend(ctx: SimCtx, p: Person): string | null {
  const loc = lotLoc(p);
  let best: string | null = null, bestF = -Infinity;
  for (const rel of Object.values(ctx.state.relationships)) {
    if (rel.from !== p.id || rel.familiarity <= 0 || rel.friendship <= -10 || rel.friendship <= bestF) continue;
    const o = ctx.state.people[rel.to];
    if (!o) continue;
    const ol = lotLoc(o);
    if (ol && loc && ol.lotId === loc.lotId) continue;
    if (o.location.kind === 'offlot' && o.location.place === 'work') continue;
    best = o.id;
    bestF = rel.friendship;
  }
  return best;
}

/** How well a social fits a relationship (higher = more natural). */
export function socialFit(ctx: SimCtx, p: Person, other: Person, def: SocialDef): number {
  const rel = peekRel(ctx.state, p.id, other.id);
  // After a quarrel people avoid small talk and either make up or keep fighting.
  const sore = hasRecentMemory(p, other.id, ['argument', 'insult', 'betrayal'], 1440, ctx.now);
  if (sore && (def.id === 'apologize' || def.id === 'makeUp')) return 2.5;
  if (sore && def.category !== 'mean' && def.category !== 'support') return 0.2;
  switch (def.category) {
    case 'greeting': return rel.familiarity < 10 ? 3 : 0.15;
    case 'friendly': return rel.familiarity >= 10 ? 1.2 : 0.6;
    case 'funny': return rel.familiarity >= 10 ? 1 : 0.4;
    case 'deep': case 'support': return rel.friendship >= 30 ? 1.2 : 0.3;
    case 'romantic': {
      if (onDateTogether(ctx, p, other) && romanceInterest(p, other) && rel.romance >= 10) return 1.5;
      const committed = commitmentOf(ctx.state, p.id)?.otherId === other.id;
      if (committed) return 1;
      return romanceInterest(p, other) && rel.romance >= 30 && rel.friendship >= 30 ? 0.6 : 0;
    }
    case 'mean': return rel.friendship < -20 || sore ? 1 : 0.02;
    case 'family': return familyTie(ctx.state, p.id, other.id) !== 'none' ? 1 : 0.1;
    case 'status': return 0.4;
  }
}

/** Best conversation for a person: the best-fitting social with the best available partner nearby. */
function socialCandidate(ctx: SimCtx, p: Person): Candidate | null {
  const loc = lotLoc(p);
  if (!loc) return null;
  const level = isVisitor(ctx, p) ? 1 : ctx.state.settings.autonomyLevel;
  const addresses: NeedId[] = [];
  const base = needScore(ctx, p, { social: 35 }, addresses) + (level === 2 ? 0.05 : 0) + (isVisitor(ctx, p) ? VISITOR_BASE * 1.5 : 0) + eventSocialBonus(ctx, p);
  let best: Candidate | null = null;
  for (const other of Object.values(ctx.state.people)) {
    if (other.id === p.id) continue;
    const ol = lotLoc(other);
    if (!ol || ol.lotId !== loc.lotId || ol.level !== loc.level) continue;
    if (personAvailable(ctx, other, p) !== null) continue;
    // Interrupting someone's activity has a cost: only when lonely or when a visitor is involved, and only
    // if the other person does not already feel socially fulfilled.
    const busy = other.queue.length > 0;
    if (busy && !(p.needs.social < SOCIAL_INTERRUPT_BELOW || isVisitor(ctx, p) || isVisitor(ctx, other))) continue;
    if (busy && other.needs.social > 80) continue;
    let pick: SocialDef | null = null, pickW = 0;
    for (const def of Object.values(ctx.content.socials)) {
      if (!def.autonomy.enabled || def.status !== 'ready') continue;
      if (socialRequirementReason(ctx, p, other, def)) continue;
      const w = def.autonomy.weight * socialFit(ctx, p, other, def) * socialAcceptance(ctx, p, other, def) * cooldownMult(ctx, p, def.id, other.id);
      if (w > pickW) { pickW = w; pick = def; }
    }
    if (!pick) continue;
    const rel = peekRel(ctx.state, p.id, other.id);
    // Courtesy: people greet a stranger who is present (a visitor or a newcomer) even when not lonely.
    const greet = pick.category === 'greeting' && rel.familiarity < 10 ? STRANGER_GREETING_BONUS : 0;
    const score = (busy ? 0.5 : 1) * (base * Math.min(2, pickW) * (1 + rel.friendship / 200) + greet) * biasFor(ctx, p, pick.id, ['social', pick.category])
      / (1 + dist(loc.x, loc.z, ol.x, ol.z) / 15);
    if (score <= 0) continue;
    if (!best || score > best.score) {
      best = { req: { interactionId: pick.id, target: { kind: 'person', personId: other.id } }, score, key: `${pick.id}@${other.id}`, addresses: [...addresses] };
    }
  }
  return best;
}

/** Picks among the top candidates: weighted by score within a band of the best (seeded rng). */
function choose(ctx: SimCtx, list: Candidate[], minScore: number): Candidate | null {
  const ok = list.filter((c) => c.score >= minScore).sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const top = ok[0];
  if (!top) return null;
  const band = ok.filter((c) => c.score >= top.score * AUTONOMY_PICK_BAND).slice(0, 3);
  if (band.length === 1) return top;
  const total = band.reduce((s, c) => s + c.score, 0);
  let r = ctx.rng.next() * total;
  for (const c of band) { r -= c.score; if (r <= 0) return c; }
  return band[band.length - 1]!;
}

function canDecide(ctx: SimCtx, p: Person): boolean {
  const next = p.cooldowns[DECIDE_KEY];
  if (next === undefined) {
    // Stagger first decisions over the interval so people do not all decide on the same tick.
    p.cooldowns[DECIDE_KEY] = ctx.now + (hashString(p.id) % (AUTONOMY_INTERVAL * 4)) * 0.25;
    return false;
  }
  return ctx.now >= next;
}

function currentScore(ctx: SimCtx, p: Person, a: ActionInstance): number {
  const def = ctx.content.interactions[a.interactionId];
  if (!def) return 0.5;
  return needScore(ctx, p, def.autonomy.ads, []) * biasFor(ctx, p, def.id, def.autonomy.tags);
}

/** Simulation flow step 6: autonomy for idle people (and urgent interrupts of low-priority activities). */
export function runAutonomy(ctx: SimCtx): void {
  for (const p of Object.values(ctx.state.people)) {
    const loc = lotLoc(p);
    if (!loc) continue;
    const visitor = isVisitor(ctx, p);
    // The autonomy setting governs the player's household; visitors always look after themselves.
    if (!visitor && ctx.state.households[p.householdId]?.isPlayable && !ctx.state.settings.autonomy) continue;
    if (ctx.res.holder(personKey(p.id))) continue;
    const head = p.queue[0];
    if (head && !(head.source === 'autonomy' && head.phase === 'perform' && !head.cancelRequested)) continue;
    if (!canDecide(ctx, p)) continue;
    p.cooldowns[DECIDE_KEY] = ctx.now + AUTONOMY_INTERVAL;
    const level = visitor ? 1 : ctx.state.settings.autonomyLevel;
    if (!head) {
      const pick = choose(ctx, candidatesFor(ctx, p), AUTONOMY_MIN_SCORE[level]);
      if (pick) insertAction(ctx, p, makeAction(ctx, p, pick.req, 'autonomy'));
      continue;
    }
    // Running autonomous activity: interrupt only for an urgent need, with hysteresis.
    if (p.queue.length > 1 || !behaviorFor(ctx, head)?.interruptible) continue;
    const urgent = NEED_IDS.filter((n) => p.needs[n] < AUTONOMY_INTERRUPT_NEED);
    if (urgent.length === 0) continue;
    const cur = currentScore(ctx, p, head);
    const better = candidatesFor(ctx, p)
      .filter((c) => c.addresses.some((n) => urgent.includes(n)) && c.score > cur * AUTONOMY_INTERRUPT_FACTOR + 0.5)
      .sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1))[0];
    if (!better) continue;
    head.cancelRequested = true;
    insertAction(ctx, p, makeAction(ctx, p, better.req, 'autonomy'));
  }
}
