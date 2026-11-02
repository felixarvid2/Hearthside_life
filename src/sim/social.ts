// Social interactions. Both participants must be available; the actor reserves the target (held for the
// conversation), walks to an adjacent tile, and the target joins with a passive "listen" action at the
// head of their queue. They face each other for the social's duration. The outcome is resolved ONCE at
// apply with the world rng: acceptance = base + relationship + mood + traits - spam dampening.

import { charismaAcceptance } from '../content/skillEffects';
import type { SocialDef } from '../content/types';
import { facingTo } from '../core/geometry';
import { isAdult, romanceInterest } from '../core/relations';
import { addFeed, transact } from '../core/state';
import type { ActionInstance, Person, Relationship } from '../core/types';
import { endAction } from './actions';
import { behaviorFor } from './behaviors';
import type { SimCtx } from './context';
import { clamp, householdOf, lotLoc, setThought, socialDef, venueTypeOf } from './context';
import { addMoodlet, computeMood } from './mood';
import { changeNeed } from './needs';
import { makeAction } from './queue';
import {
  addMemory, applyRelDelta, bondOf, commitmentOf, decayRecent, ensureRel, familyTie, hasRecentMemory, memoryModifier, peekRel,
  refreshLabel, resolveMemories, setBondStatus, statusLabel,
} from './relationships';
import { personKey } from './reservations';
import type { Behavior, Step } from './steps';
import { canPlanEvent, noteSocial, planEventFromSocial } from './events';
import {
  ANGRY_MOOD, JEALOUSY_FRIENDSHIP, JEALOUSY_RIVAL_FRIENDSHIP, JEALOUSY_TRUST, ROMANCE_MIN_MOOD, SOCIAL_ACCEPT_MAX,
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
  return null;
}

/**
 * Whether `target` can join a conversation with `actor` right now: on the same lot, awake, not held by
 * someone else, and idle or only doing an interruptible autonomous activity.
 */
export function personAvailable(ctx: SimCtx, target: Person, actor: Person): string | null {
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

/** Resolves a social once: relationships, needs, moodlets, memories, status, feed line and event. */
export function resolveSocial(ctx: SimCtx, actor: Person, target: Person, def: SocialDef): boolean {
  const relA = ensureRel(ctx.state, actor.id, target.id);
  decayRecent(relA, ctx.now, SOCIAL_RECENT_DECAY_MINUTES);
  const recent = relA.recent[def.id] ?? 0;
  const chance = socialAcceptance(ctx, actor, target, def);
  let accepted = ctx.rng.next() < chance;
  // A gift is paid for when it is accepted; if the money is gone by now it is simply not given.
  if (accepted && def.cost) {
    const paid = transact(ctx.state, ctx.events, actor.householdId, -def.cost, 'gift', `${def.name}: ${target.firstName}`, { occurrence: `gift:${actor.id}:${target.id}:${Math.round(ctx.now)}` });
    if (!paid.ok) accepted = false;
  }
  const romantic = def.requires.romantic === true || def.category === 'romantic';
  // Consent: somebody who is not interested (or not open to it) is never moved by a romantic advance. The advance is
  // declined kindly, and from then on the option stays off for this pair (no pestering).
  if (romantic && !def.unilateral && !romanceInterest(target, actor)) relA.romanceBlocked = true;
  const out = accepted ? def.success : def.failure;
  const dampen = 1 / (1 + recent);
  applyRelDelta(ctx.state, actor.id, target.id, { ...out.actor, familiarity: (out.actor.familiarity ?? 0) + 2 }, ctx.now, dampen);
  applyRelDelta(ctx.state, target.id, actor.id, { ...out.target, familiarity: (out.target.familiarity ?? 0) + 2 }, ctx.now, dampen);
  relA.recent[def.id] = recent + 1;
  if (out.social) { changeNeed(ctx, actor, 'social', out.social); changeNeed(ctx, target, 'social', out.social); }
  if (out.fun) { changeNeed(ctx, actor, 'fun', out.fun); changeNeed(ctx, target, 'fun', out.fun); }
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
  const line = lines.length > 0 ? fill(ctx.rng.pick(lines), actor, target)
    : accepted ? `${actor.firstName} and ${target.firstName}: ${def.name}.` : `${target.firstName} didn't respond well to ${actor.firstName}.`;
  ctx.events.emit({ type: 'social', actorId: actor.id, targetId: target.id, socialId: def.id, accepted, line });
  ctx.events.emit({ type: 'relationship', fromId: actor.id, toId: target.id, what: 'value' });
  if (householdOf(ctx, actor)?.isPlayable || householdOf(ctx, target)?.isPlayable) addFeed(ctx.state, ctx.events, 'social', line, actor.id);
  witnessCheating(ctx, actor, target, def, accepted);
  if (accepted && def.startsEvent) planEventFromSocial(ctx, actor, target, def.startsEvent);
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

function endListener(ctx: SimCtx, a: ActionInstance): void {
  const t = partnerOf(ctx, a);
  if (!t) return;
  const l = t.queue.find((x) => x.data.role === 'listen' && x.data.with === a.id);
  if (l) endAction(ctx, t, l, 'done', null);
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
    if (t && def) a.data.accepted = resolveSocial(ctx, p, t, def);
    endListener(ctx, a);
  },
  end(ctx, _p, a) {
    if (a.data.role !== 'listen') endListener(ctx, a);
  },
};
