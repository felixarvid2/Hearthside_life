// Social interactions. Both participants must be available; the actor reserves the target (held for the
// conversation), walks to an adjacent tile, and the target joins with a passive "listen" action at the
// head of their queue. They face each other for the social's duration. The outcome is resolved ONCE at
// apply with the world rng: acceptance = base + relationship + mood + traits - spam dampening.

import { createGiftItem, giftLine, giftOutcome, giftProblem, giftReaction } from './gifts';
import { charismaAcceptance } from '../content/skillEffects';
import type { SocialDef } from '../content/types';
import { facingTo } from '../core/geometry';
import { isAdult, romanceInterest } from '../core/relations';
import { addFeed, transact } from '../core/state';
import type { ActionInstance, Person, Relationship } from '../core/types';
import { endAction } from './actions';
import { nearbyObjectWithTag } from './furnishings';
import { behaviorFor } from './behaviors';
import type { SimCtx } from './context';
import { clamp, householdOf, lotLoc, setThought, socialDef, venueTypeOf } from './context';
import { addMoodlet, computeMood } from './mood';
import { changeNeed } from './needs';
import { makeAction } from './queue';
import { socialStageReason } from './gating';
import { applySocialEffect, socialEffectProblem } from './socialEffects';
import {
  addMemory, applyRelDelta, bondOf, commitmentOf, decayRecent, ensureRel, familyTie, hasRecentMemory, memoryModifier, peekRel,
  refreshLabel, resolveMemories, setBondStatus, statusLabel,
} from './relationships';
import { personKey } from './reservations';
import type { Behavior, Step } from './steps';
import { canPlanEvent, noteGroup, noteSocial, planEventFromSocial, runningEventOf } from './events';
import {
  ANGRY_MOOD, GROUP_CHAT_EXTRAS, GROUP_CHAT_RADIUS, GROUP_CHAT_SIDE_WEIGHT, JEALOUSY_FRIENDSHIP, JEALOUSY_RIVAL_FRIENDSHIP, JEALOUSY_TRUST, ROMANCE_MIN_MOOD, SOCIAL_ACCEPT_MAX,
  SOCIAL_ACCEPT_MIN, SOCIAL_RECENT_DECAY_MINUTES, SOCIAL_SPAM_PENALTY, SOCIAL_WAIT_MINUTES, TAKEN_PENALTY, WITNESS_RADIUS,
  LIBRARY_LOUD_CATEGORIES, LIBRARY_LOUD_PENALTY,
} from './tuning';

export { romanceInterest } from '../core/relations';

/** Recent uses of a social after the time-based decay (pure). */
export function recentUses(rel: Relationship, socialId: string, now: number): number {
  const v = rel.recent[socialId] ?? 0;
  if (v === 0 || rel.lastInteractionAt === null) return v;
  return Math.max(0, v - Math.floor((now - rel.lastInteractionAt) / SOCIAL_RECENT_DECAY_MINUTES));
}

/** Awake people (besides the two) on the same lot and level within WITNESS_RADIUS: they can see what happens. */
export function witnessesOf(ctx: SimCtx, a: Person, b: Person): Person[] {
  const la = lotLoc(a);
  if (!la) return [];
  const out: Person[] = [];
  for (const o of Object.values(ctx.state.people)) {
    if (o.id === a.id || o.id === b.id) continue;
    const lo = lotLoc(o);
    if (!lo || lo.lotId !== la.lotId || lo.level !== la.level || lo.posture === 'lying') continue;
    if (Math.hypot(lo.x - la.x, lo.z - la.z) <= WITNESS_RADIUS) out.push(o);
  }
  return out;
}

/** Readable reason why a romantic social is not possible between these two beyond the plain requirements, or null. */
function romanceContextReason(ctx: SimCtx, actor: Person, target: Person, def: SocialDef): string | null {
  const r = def.requires;
  const rel = peekRel(ctx.state, actor.id, target.id);
  if (!isAdult(actor) || !isAdult(target)) return 'Only between adults.';
  const tie = familyTie(ctx.state, actor.id, target.id);
  if (tie === 'parent' || tie === 'child' || tie === 'sibling') return 'Not with family.';
  if (!actor.romance.open) return `${actor.firstName} isn't looking for romance.`;
  if (rel.romanceBlocked) return `${target.firstName} isn't interested in that.`;
  if (computeMood(ctx.content, target).value < ROMANCE_MIN_MOOD) return `${target.firstName} isn't in the mood.`;
  const mine = commitmentOf(ctx.state, actor.id), theirs = commitmentOf(ctx.state, target.id);
  if (r.exclusive) {
    if (mine && mine.otherId !== target.id) return `${actor.firstName} is already with ${ctx.state.people[mine.otherId]?.firstName ?? 'someone'}.`;
    if (theirs && theirs.otherId !== actor.id) return `${target.firstName} is with ${ctx.state.people[theirs.otherId]?.firstName ?? 'someone'}.`;
  }
  // Not in front of a partner who is already upset (flirting elsewhere is possible otherwise, at a cost to trust).
  if (mine && mine.otherId !== target.id) {
    const partner = ctx.state.people[mine.otherId];
    if (partner && witnessesOf(ctx, actor, target).some((w) => w.id === partner.id) && computeMood(ctx.content, partner).value < ANGRY_MOOD) {
      return `Not in front of ${partner.firstName}, who is upset.`;
    }
  }
  if (r.private && witnessesOf(ctx, actor, target).length > 1) return 'Not with people watching.';
  return null;
}

/** Readable reason why a social is not possible between these two (relationship rules), or null. */
export function socialRequirementReason(ctx: SimCtx, actor: Person, target: Person, def: SocialDef): string | null {
  const rel = peekRel(ctx.state, actor.id, target.id);
  const bond = bondOf(ctx.state, actor.id, target.id);
  const r = def.requires;
  const stageReason = socialStageReason(def, actor, target);
  if (stageReason) return stageReason;
  if (r.objectTag && !nearbyObjectWithTag(ctx, actor, r.objectTag)) return `Needs a ${r.objectTag.replace(/-/g, ' ')}.`;
  if (r.otherHousehold && actor.householdId === target.householdId) return `${target.firstName} already lives here.`;
  if (r.sameHousehold && actor.householdId !== target.householdId) return `${target.firstName} doesn't live here.`;
  if (r.notStatus && bond && r.notStatus.includes(bond.status)) return `Already ${statusLabel(bond.status, true)}.`;
  if (r.minFamiliarity !== undefined && rel.familiarity < r.minFamiliarity) {
    return rel.familiarity <= 0 ? 'Needs an introduction first.' : `Needs to know ${target.firstName} better.`;
  }
  if (r.maxFamiliarity !== undefined && rel.familiarity > r.maxFamiliarity) return 'Already introduced.';
  if (r.romantic || def.category === 'romantic') {
    if (!isAdult(actor) || !isAdult(target)) return 'Only between adults.';
    const tie = familyTie(ctx.state, actor.id, target.id);
    if (tie === 'parent' || tie === 'child' || tie === 'sibling') return 'Not with family.';
    if (!actor.romance.open) return `${actor.firstName} isn't looking for romance.`;
    if (!romanceInterest(actor, target)) return `${actor.firstName} isn't interested in ${target.firstName} that way.`;
  }
  if (r.status && r.status.length > 0 && !(bond && r.status.includes(bond.status))) {
    return `Needs to be ${statusLabel(r.status[0]!, true)} first.`;
  }
  if (r.minFriendship !== undefined && rel.friendship < r.minFriendship) return 'Needs a closer friendship first.';
  if (r.maxFriendship !== undefined && rel.friendship > r.maxFriendship) return 'They get along too well for that.';
  if (r.minRomance !== undefined && rel.romance < r.minRomance) return 'Needs more romantic interest first.';
  if (r.minTrust !== undefined && rel.trust < r.minTrust) return `${target.firstName} doesn't trust ${actor.firstName} enough yet.`;
  if (r.maxTrust !== undefined && rel.trust > r.maxTrust) return 'They trust each other too much for that.';
  if (r.memory) {
    const now = ctx.now;
    if (!hasRecentMemory(actor, target.id, r.memory.kinds, r.memory.withinMinutes, now) && !hasRecentMemory(target, actor.id, r.memory.kinds, r.memory.withinMinutes, now)) {
      return 'Nothing to make up for.';
    }
  }
  if (def.id === 'groupChat' && groupCircle(ctx, actor, target).length === 0) return 'Needs at least three people together.';
  if (def.cost !== undefined && (ctx.state.households[actor.householdId]?.funds ?? 0) < def.cost && !ctx.state.settings.unlimitedFunds) {
    return `Not enough money ($${(def.cost / 100).toFixed(0)}).`;
  }
  if (r.romantic || def.category === 'romantic') {
    const reason = romanceContextReason(ctx, actor, target, def);
    if (reason) return reason;
  }
  if (def.startsEvent) {
    const reason = canPlanEvent(ctx, actor, [target.id], def.startsEvent);
    if (reason) return reason;
  }
  if (def.effect) {
    const reason = socialEffectProblem(ctx, actor, target, def);
    if (reason) return reason;
  }
  return null;
}

/**
 * Whether `target` can join a conversation with `actor` right now: on the same lot, awake, not held by
 * someone else, and idle or only doing an interruptible autonomous activity.
 */
export function personAvailable(ctx: SimCtx, target: Person, actor: Person): string | null {
  // The played household's autonomy setting governs its members on every lot: with it off nobody else (a visitor,
  // a patron, a neighbour walking up) may pull a member into a conversation, where they would join as the listener
  // without the player asking. Orders the player gives are unaffected: a controlled actor is always allowed.
  const controlled = ctx.state.households[target.householdId]?.isPlayable === true;
  // A guest the player invited to a running event may chat with the host: that is part of the gathering, not the
  // household acting on its own.
  const ev = runningEventOf(ctx.state, actor.id);
  const sameEvent = ev !== undefined && ev.id === runningEventOf(ctx.state, target.id)?.id;
  if (controlled && !ctx.state.settings.autonomy && ctx.state.households[actor.householdId]?.isPlayable !== true && !sameEvent) {
    return `${target.firstName} is waiting for orders.`;
  }
  const tl = lotLoc(target), al = lotLoc(actor);
  if (!tl) return target.location.kind === 'offlot' && target.location.place === 'work' ? `${target.firstName} is at work.` : `${target.firstName} isn't here.`;
  if (al && al.lotId !== tl.lotId) return `${target.firstName} isn't here.`;
  const holder = ctx.res.holder(personKey(target.id));
  if (holder && !actor.queue.some((x) => x.id === holder)) return `${target.firstName} is busy.`;
  const head = target.queue[0];
  if (head?.data.role === 'listen' && head.target.kind === 'person' && head.target.personId === actor.id) return null;
  if (tl.posture === 'lying') return head?.interactionId === 'sleep' ? `${target.firstName} is asleep.` : `${target.firstName} is resting.`;
  if (!head) return null;
  if (target.queue.some((x) => x.source !== 'autonomy')) return `${target.firstName} is busy.`;
  if (head.data.social === true) return `${target.firstName} is talking with someone.`;
  if (head.phase !== 'queued' && !behaviorFor(ctx, head)?.interruptible) return `${target.firstName} is busy.`;
  return null;
}

/** Chance (0..1) that `target` accepts `def` from `actor` right now (pure). Romance is never accepted without mutual interest. */
export function socialAcceptance(ctx: SimCtx, actor: Person, target: Person, def: SocialDef): number {
  if (def.unilateral) return 1;
  const romantic = def.requires.romantic === true || def.category === 'romantic';
  if (romantic && !(isAdult(actor) && isAdult(target) && romanceInterest(target, actor))) return 0;
  const toActor = peekRel(ctx.state, target.id, actor.id);
  const toTarget = peekRel(ctx.state, actor.id, target.id);
  let p = def.acceptance;
  const trustWeight = def.category === 'deep' || def.category === 'support' ? 0.15 : 0.05;
  p += (toActor.friendship / 100) * 0.25 + (toActor.familiarity / 100) * 0.05 + (toActor.trust / 100) * trustWeight;
  if (def.category === 'romantic') p += (toActor.romance / 100) * 0.3;
  p += (computeMood(ctx.content, target).value / 100) * 0.2;
  p += (computeMood(ctx.content, actor).value / 100) * 0.08;
  for (const t of actor.traits) p += def.actorTraits[t] ?? 0;
  for (const t of target.traits) {
    p += def.targetTraits[t] ?? 0;
    p += ctx.content.traits[t]?.effects.socialReceive?.[def.category] ?? 0;
  }
  p -= recentUses(toTarget, def.id, ctx.now) * SOCIAL_SPAM_PENALTY;
  // The library's quiet rule: jokes and quarrels are poorly received in the reading room.
  if (LIBRARY_LOUD_CATEGORIES.includes(def.category) && venueTypeOf(ctx, actor) === 'library') p -= LIBRARY_LOUD_PENALTY;
  p += charismaAcceptance(actor.skills.charisma?.level ?? 1);
  p += memoryModifier(target, actor.id, def.category, ctx.now);
  const label = toActor.label;
  if (label === 'enemy') p -= def.category === 'mean' ? 0 : 0.15;
  else if (label === 'rival') p -= def.category === 'mean' ? 0 : 0.08;
  else if (label === 'bestFriend') p += 0.05;
  if (romantic) {
    const theirs = commitmentOf(ctx.state, target.id);
    if (theirs && theirs.otherId !== actor.id) p -= TAKEN_PENALTY;
    else if (theirs) p += 0.1;
  }
  return clamp(p, SOCIAL_ACCEPT_MIN, SOCIAL_ACCEPT_MAX);
}

const fill = (s: string, a: Person, b: Person) => s.replaceAll('{a}', a.firstName).replaceAll('{b}', b.firstName);

/**
 * A person in a commitment who gets romantic with someone else in front of their partner: the partner loses trust in
 * them (and some liking for the third person), feels jealous and remembers it. Only what the partner can see counts.
 */
function witnessCheating(ctx: SimCtx, actor: Person, target: Person, def: SocialDef, accepted: boolean): void {
  if (def.category !== 'romantic') return;
  const cases: Array<{ cheater: Person; third: Person }> = [];
  const mine = commitmentOf(ctx.state, actor.id), theirs = commitmentOf(ctx.state, target.id);
  if (mine && mine.otherId !== target.id) cases.push({ cheater: actor, third: target });
  if (accepted && theirs && theirs.otherId !== actor.id) cases.push({ cheater: target, third: actor });
  for (const { cheater, third } of cases) {
    const partnerId = commitmentOf(ctx.state, cheater.id)!.otherId;
    const partner = ctx.state.people[partnerId];
    if (!partner || partner.id === third.id) continue;
    const seen = witnessesOf(ctx, actor, target).some((w) => w.id === partner.id);
    if (!seen) continue;
    applyRelDelta(ctx.state, partner.id, cheater.id, { trust: -JEALOUSY_TRUST, friendship: -JEALOUSY_FRIENDSHIP, romance: -4 }, ctx.now);
    applyRelDelta(ctx.state, partner.id, third.id, { friendship: -JEALOUSY_RIVAL_FRIENDSHIP }, ctx.now);
    addMoodlet(ctx.content, partner, 'jealous', ctx.now, def.id);
    addMemory(ctx.state, partner, { kind: 'jealousy', importance: 2, withId: cheater.id, text: `Saw ${cheater.firstName} getting close to ${third.firstName}.` });
    if (householdOf(ctx, partner)?.isPlayable || householdOf(ctx, cheater)?.isPlayable) {
      addFeed(ctx.state, ctx.events, 'social', `${partner.firstName} saw ${cheater.firstName} getting close to ${third.firstName} and is hurt.`, partner.id);
    }
  }
}


/**
 * Who a group chat started by `actor` toward `target` pulls in: people on the same lot and level within
 * GROUP_CHAT_RADIUS of the speaker whom the speaker has met, who are awake, not little ones and free to talk. Nearest first,
 * at most GROUP_CHAT_EXTRAS.
 */
export function groupCircle(ctx: SimCtx, actor: Person, target: Person): Person[] {
  const la = lotLoc(actor);
  if (!la) return [];
  const out: Array<{ p: Person; d: number }> = [];
  for (const o of Object.values(ctx.state.people)) {
    if (o.id === actor.id || o.id === target.id) continue;
    const lo = lotLoc(o);
    if (!lo || lo.lotId !== la.lotId || lo.level !== la.level || lo.posture === 'lying') continue;
    if (o.lifeStage === 'baby' || o.lifeStage === 'toddler') continue;
    const d = Math.hypot(lo.x - la.x, lo.z - la.z);
    if (d > GROUP_CHAT_RADIUS || peekRel(ctx.state, actor.id, o.id).familiarity <= 0) continue;
    if (personAvailable(ctx, o, actor) !== null) continue;
    out.push({ p: o, d });
  }
  return out.sort((a, b) => a.d - b.d || (a.p.id < b.p.id ? -1 : 1)).slice(0, GROUP_CHAT_EXTRAS).map((x) => x.p);
}

/**
 * Resolves a group chat once: one acceptance roll for the speaker and the person addressed, then every pair in the
 * circle changes (the speaker's pairs fully, the others by GROUP_CHAT_SIDE_WEIGHT), everyone gains the need and moodlets,
 * and running events count it as one chat and all pairs mingling.
 */
export function resolveGroupChat(ctx: SimCtx, actor: Person, target: Person, extras: Person[], def: SocialDef): boolean {
  const group = [actor, target, ...extras];
  const accepted = ctx.rng.next() < socialAcceptance(ctx, actor, target, def);
  const out = accepted ? def.success : def.failure;
  for (const x of group) {
    for (const y of group) {
      if (x.id === y.id) continue;
      const weight = x.id === actor.id || y.id === actor.id ? 1 : GROUP_CHAT_SIDE_WEIGHT;
      applyRelDelta(ctx.state, x.id, y.id, x.id === actor.id ? out.actor : out.target, ctx.now, weight);
    }
  }
  for (const x of group) {
    if (out.social) changeNeed(ctx, x, 'social', out.social);
    if (out.fun) changeNeed(ctx, x, 'fun', out.fun);
    const m = x.id === actor.id ? out.actorMoodlet : out.targetMoodlet;
    if (m) addMoodlet(ctx.content, x, m, ctx.now, def.id);
  }
  for (const x of group) for (const y of group) if (x.id !== y.id) refreshLabel(ctx.state, x.id, y.id);
  const lines = accepted ? def.lines.success : def.lines.failure;
  const line = `${fill(ctx.rng.pick(lines), actor, target)}${extras.length > 0 ? ` (${group.length} people)` : ''}`;
  ctx.events.emit({ type: 'social', actorId: actor.id, targetId: target.id, socialId: def.id, accepted, line });
  if (group.some((x) => householdOf(ctx, x)?.isPlayable)) addFeed(ctx.state, ctx.events, 'social', line, actor.id);
  noteGroup(ctx, group, accepted);
  return accepted;
}

/** Resolves a social once: relationships, needs, moodlets, memories, status, feed line and event. */
export function resolveSocial(ctx: SimCtx, actor: Person, target: Person, def: SocialDef, opts: { giftId?: string } = {}): boolean {
  const relA = ensureRel(ctx.state, actor.id, target.id);
  decayRecent(relA, ctx.now, SOCIAL_RECENT_DECAY_MINUTES);
  const recent = relA.recent[def.id] ?? 0;
  const chance = socialAcceptance(ctx, actor, target, def);
  let accepted = ctx.rng.next() < chance;
  // A gift is paid for when it is accepted; if the money is gone by now it is simply not given.
  const gift = def.id === 'giveGift' ? ctx.content.gifts?.[opts.giftId ?? 'trinket'] : undefined;
  const reaction = gift ? giftReaction(target, gift) : null;
  if (accepted && gift) {
    const paid = transact(ctx.state, ctx.events, actor.householdId, -gift.price, 'gift', `${gift.name}: ${target.firstName}`, { occurrence: `gift:${actor.id}:${target.id}:${Math.round(ctx.now)}` });
    if (!paid.ok) accepted = false;
  } else if (accepted && def.cost) {
    const paid = transact(ctx.state, ctx.events, actor.householdId, -def.cost, 'gift', `${def.name}: ${target.firstName}`, { occurrence: `gift:${actor.id}:${target.id}:${Math.round(ctx.now)}` });
    if (!paid.ok) accepted = false;
  }
  const romantic = def.requires.romantic === true || def.category === 'romantic';
  // Consent: somebody who is not interested (or not open to it) is never moved by a romantic advance. The advance is
  // declined kindly, and from then on the option stays off for this pair (no pestering).
  if (romantic && !def.unilateral && !romanceInterest(target, actor)) relA.romanceBlocked = true;
  const loving = !!commitmentOf(ctx.state, target.id) || relA.romance >= 20;
  const out = accepted ? (gift && reaction ? giftOutcome(def.success, reaction.verdict, loving) : def.success) : def.failure;
  const dampen = 1 / (1 + recent);
  applyRelDelta(ctx.state, actor.id, target.id, { ...out.actor, familiarity: (out.actor.familiarity ?? 0) + 2 }, ctx.now, dampen);
  applyRelDelta(ctx.state, target.id, actor.id, { ...out.target, familiarity: (out.target.familiarity ?? 0) + 2 }, ctx.now, dampen);
  relA.recent[def.id] = recent + 1;
  if (out.social) { changeNeed(ctx, actor, 'social', out.social); changeNeed(ctx, target, 'social', out.social); }
  if (out.fun) { changeNeed(ctx, actor, 'fun', out.fun); changeNeed(ctx, target, 'fun', out.fun); }
  if (out.hunger) { changeNeed(ctx, actor, 'hunger', out.hunger); changeNeed(ctx, target, 'hunger', out.hunger); }
  if (out.actorMoodlet) addMoodlet(ctx.content, actor, out.actorMoodlet, ctx.now, def.id);
  if (out.targetMoodlet) addMoodlet(ctx.content, target, out.targetMoodlet, ctx.now, def.id);
  if (out.memory) {
    const m = out.memory;
    addMemory(ctx.state, actor, { kind: m.kind, importance: m.importance, withId: target.id, text: fill(m.text, actor, target) });
    addMemory(ctx.state, target, { kind: m.kind, importance: m.importance, withId: actor.id, text: fill(m.text, target, actor) });
  }
  if (out.resolves) {
    resolveMemories(actor, target.id, out.resolves);
    resolveMemories(target, actor.id, out.resolves);
  }
  if (accepted && out.setStatus) {
    if (setBondStatus(ctx.state, ctx.events, actor.id, target.id, out.setStatus, ctx.now)) {
      const kind = out.setStatus === 'friend' || out.setStatus === 'closeFriend' ? 'becameFriends'
        : out.setStatus === 'partner' || out.setStatus === 'engaged' || out.setStatus === 'spouse' ? 'becamePartners' : null;
      if (kind && out.memory?.kind !== kind) {
        const label = statusLabel(out.setStatus, true);
        addMemory(ctx.state, actor, { kind, importance: 3, withId: target.id, text: `Became ${label} with ${target.firstName}` });
        addMemory(ctx.state, target, { kind, importance: 3, withId: actor.id, text: `Became ${label} with ${actor.firstName}` });
      }
    }
  }
  refreshLabel(ctx.state, actor.id, target.id);
  refreshLabel(ctx.state, target.id, actor.id);
  const lines = accepted ? def.lines.success : def.lines.failure;
  const line = accepted && gift && reaction ? giftLine(reaction.verdict, gift, actor.firstName, target.firstName, Math.round(ctx.now))
    : lines.length > 0 ? fill(ctx.rng.pick(lines), actor, target)
    : accepted ? `${actor.firstName} and ${target.firstName}: ${def.name}.` : `${target.firstName} didn't respond well to ${actor.firstName}.`;
  ctx.events.emit({ type: 'social', actorId: actor.id, targetId: target.id, socialId: def.id, accepted, line });
  ctx.events.emit({ type: 'relationship', fromId: actor.id, toId: target.id, what: 'value' });
  if (householdOf(ctx, actor)?.isPlayable || householdOf(ctx, target)?.isPlayable) addFeed(ctx.state, ctx.events, 'social', line, actor.id);
  witnessCheating(ctx, actor, target, def, accepted);
  if (accepted && gift) createGiftItem(ctx, actor, target, gift);
  if (accepted && def.startsEvent) planEventFromSocial(ctx, actor, target, def.startsEvent);
  if (accepted && def.effect) applySocialEffect(ctx, actor, target, def);
  noteSocial(ctx, actor, target, def, accepted);
  return accepted;
}

function partnerOf(ctx: SimCtx, a: ActionInstance): Person | undefined {
  return a.target.kind === 'person' ? ctx.state.people[a.target.personId] : undefined;
}

function listenerOf(target: Person, a: ActionInstance): ActionInstance | undefined {
  const h = target.queue[0];
  return h && h.data.role === 'listen' && h.data.with === a.id ? h : undefined;
}

function faceEachOther(a: Person, b: Person): void {
  const la = lotLoc(a), lb = lotLoc(b);
  if (!la || !lb) return;
  la.facing = facingTo(la.x, la.z, lb.x, lb.z);
  lb.facing = facingTo(lb.x, lb.z, la.x, la.z);
}

/** The people who joined a group chat as listeners (besides the target). */
function groupMembers(ctx: SimCtx, a: ActionInstance): Person[] {
  const ids = typeof a.data.group === 'string' && a.data.group ? a.data.group.split(',') : [];
  return ids.map((id) => ctx.state.people[id]).filter((o): o is Person => !!o);
}

function endListener(ctx: SimCtx, a: ActionInstance): void {
  const t = partnerOf(ctx, a);
  for (const who of [...(t ? [t] : []), ...groupMembers(ctx, a)]) {
    const l = who.queue.find((x) => x.data.role === 'listen' && x.data.with === a.id);
    if (l) endAction(ctx, who, l, 'done', null);
  }
}

/** Social interactions (actor side) and the passive listener (data.role = 'listen'). */
export const socialBehavior: Behavior = {
  check(ctx, p, a) {
    const def = socialDef(ctx, a.interactionId);
    if (!def) return 'That interaction is not available.';
    if (a.data.role === 'listen') return null;
    const t = partnerOf(ctx, a);
    if (!t || t.id === p.id) return 'Choose someone to talk to.';
    const req = socialRequirementReason(ctx, p, t, def);
    if (req) return req;
    if (def.id === 'giveGift' && typeof a.data.gift === 'string') {
      const why = giftProblem(ctx, p, t, a.data.gift);
      if (why) return why;
    }
    return personAvailable(ctx, t, p);
  },
  reserve(ctx, _p, a) {
    const t = partnerOf(ctx, a);
    if (!t) return 'They left.';
    if (!ctx.res.isFree(personKey(t.id), a.id)) return `${t.firstName} is busy.`;
    const head = t.queue[0];
    // Drop the target's queued autonomous plans and stop their interruptible autonomous activity.
    t.queue = t.queue.filter((x, i) => {
      if (x.source !== 'autonomy' || (i === 0 && x.phase !== 'queued')) return true;
      ctx.events.emit({ type: 'action.finished', personId: t.id, actionId: x.id, interactionId: x.interactionId, result: 'cancelled' });
      return false;
    });
    if (head && t.queue[0] === head && head.phase !== 'queued' && head.source === 'autonomy' && head.data.social !== true) head.cancelRequested = true;
    return null;
  },
  step(ctx, _p, a): Step | string {
    const def = socialDef(ctx, a.interactionId);
    if (!def) return 'That interaction is not available.';
    if (a.data.role === 'listen') {
      return { goal: { kind: 'here' }, posture: 'standing', performAnim: 'talk', duration: { kind: 'external' }, rates: {} };
    }
    const t = partnerOf(ctx, a);
    if (!t || !lotLoc(t)) return `${t?.firstName ?? 'They'} left.`;
    return {
      goal: { kind: 'person', personId: t.id, label: t.firstName }, posture: 'standing', performAnim: def.anim,
      duration: { kind: 'fixed', minutes: Math.max(1, def.minutes) }, rates: {},
    };
  },
  arrive(ctx, p, a) {
    const t = partnerOf(ctx, a);
    if (!t || !lotLoc(t)) return 'They left.';
    if (listenerOf(t, a)) return null;
    const ready = t.queue.length === 0 && lotLoc(t)!.posture !== 'lying';
    if (!ready) {
      if (typeof a.data.waitSince !== 'number') a.data.waitSince = ctx.now;
      return ctx.now - a.data.waitSince > SOCIAL_WAIT_MINUTES ? `${t.firstName} is busy.` : 'wait';
    }
    const l = makeAction(ctx, t, { interactionId: a.interactionId, target: { kind: 'person', personId: p.id }, data: { role: 'listen', with: a.id } }, 'chain');
    l.phase = 'perform';
    t.queue.unshift(l);
    ctx.events.emit({ type: 'action.started', personId: t.id, actionId: l.id, interactionId: l.interactionId });
    ctx.events.emit({ type: 'person.changed', personId: t.id, what: 'queue' });
    faceEachOther(p, t);
    if (a.interactionId === 'groupChat') {
      // The circle joins: everyone nearby who is free listens, and takes part when it is resolved.
      const joined: string[] = [];
      for (const o of groupCircle(ctx, p, t)) {
        const lo = makeAction(ctx, o, { interactionId: a.interactionId, target: { kind: 'person', personId: p.id }, data: { role: 'listen', with: a.id } }, 'chain');
        lo.phase = 'perform';
        o.queue = o.queue.filter((x, i) => !(x.source === 'autonomy' && !(i === 0 && x.phase !== 'queued')));
        o.queue.unshift(lo);
        joined.push(o.id);
        ctx.events.emit({ type: 'action.started', personId: o.id, actionId: lo.id, interactionId: lo.interactionId });
        ctx.events.emit({ type: 'person.changed', personId: o.id, what: 'queue' });
      }
      a.data.group = joined.join(',');
    }
    return null;
  },
  begin(ctx, p, a) {
    const t = partnerOf(ctx, a);
    const def = socialDef(ctx, a.interactionId);
    if (!t || !def) return 'They left.';
    if (!listenerOf(t, a)) return `${t.firstName} walked away.`;
    faceEachOther(p, t);
    const topic = def.topics[0] ?? def.name;
    setThought(p, def.icon, topic, ctx.now + def.minutes);
    setThought(t, def.icon, topic, ctx.now + def.minutes);
    return null;
  },
  tick(ctx, p, a) {
    if (a.data.role === 'listen') {
      const actor = partnerOf(ctx, a);
      const head = actor?.queue[0];
      if (!actor || !head || head.id !== a.data.with) return 'done';
      faceEachOther(p, actor);
      return null;
    }
    const t = partnerOf(ctx, a);
    if (!t || !listenerOf(t, a)) return `${t?.firstName ?? 'They'} walked away.`;
    return null;
  },
  apply(ctx, p, a) {
    if (a.data.role === 'listen') return;
    const t = partnerOf(ctx, a);
    const def = socialDef(ctx, a.interactionId);
    if (t && def && def.id === 'groupChat') {
      const extras = groupMembers(ctx, a).filter((o) => o.queue[0]?.data.with === a.id);
      a.data.accepted = resolveGroupChat(ctx, p, t, extras, def);
    } else if (t && def) a.data.accepted = resolveSocial(ctx, p, t, def, typeof a.data.gift === 'string' ? { giftId: a.data.gift } : {});
    endListener(ctx, a);
  },
  end(ctx, _p, a) {
    if (a.data.role !== 'listen') endListener(ctx, a);
  },
};
