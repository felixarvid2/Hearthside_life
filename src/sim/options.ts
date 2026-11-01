// Context-menu options for a person and a picked target, with readable reasons for disabled entries.
// Pure: building options never changes the world.

import { isRepairable, offeredInteractionIds, socialSection } from '../content/capabilities';
import type { SocialDef } from '../content/types';
import { isAdult, romanceInterest } from '../core/relations';
import { OUTFIT_CATEGORIES } from '../core/types';
import type { ActionInstance, OutfitCategory, Person } from '../core/types';
import { SKILL_BOOKS, behaviorFor, freeUsePointExists } from './behaviors';
import { dirtOf, isBroken, wearOf } from './housekeeping';
import { repairFee } from './housework';
import type { SimCtx } from './context';
import { BUILTIN_INTERACTIONS, interactionDef, lotLoc, lotObjects, objectRef } from './context';
import { NEED_LABELS } from './needs';
import { socialFit } from './autonomy';
import { hasRecentMemory, knownPeople, peekRel } from './relationships';
import { socialAcceptance } from './social';
import { QUEUE_MAX, SERVICE_MIN_WEAR } from './tuning';
import type { ActionData, ActionRequest, InteractionOption } from './types';

const OUTFIT_LABELS: Record<OutfitCategory, string> = {
  everyday: 'Everyday', formal: 'Formal', work: 'Work', athletic: 'Athletic', sleep: 'Sleepwear', swim: 'Swimwear',
};

/** Social menu sections in display order. */
const SECTION_ORDER = ['friendly', 'romantic', 'mean', 'special'];

/** An unsaved action used to run checks (never added to state; its id is never allocated). */
export function previewAction(ctx: SimCtx, p: Person, req: ActionRequest): ActionInstance {
  const isSocial = !interactionDef(ctx, req.interactionId) && ctx.content.socials[req.interactionId] !== undefined;
  return {
    id: 'act_preview', interactionId: req.interactionId, actorId: p.id, source: req.source ?? 'player',
    target: req.target, phase: 'queued', phaseSince: ctx.now, route: [], elapsed: 0, duration: null, replans: 0,
    failureReason: null, data: { ...(req.data ?? {}), ...(isSocial ? { social: true } : {}) }, cancelRequested: false, queuedAt: ctx.now,
  };
}

/**
 * Why a request cannot be queued now, or null. `transient` also checks conditions that only matter when
 * the action would start right away (a free slot, a need that is already full).
 */
export function requestReason(ctx: SimCtx, p: Person, req: ActionRequest, transient: boolean): string | null {
  if (!lotLoc(p)) return p.location.kind === 'offlot' && p.location.place === 'work' ? `${p.firstName} is at work.` : `${p.firstName} isn't on the lot.`;
  if (p.queue.length >= QUEUE_MAX) return 'The queue is full.';
  const a = previewAction(ctx, p, req);
  const beh = behaviorFor(ctx, a);
  if (!beh) return 'That interaction is not available.';
  const r = beh.check(ctx, p, a);
  if (r || !transient) return r;
  const def = interactionDef(ctx, req.interactionId);
  if (!def) return null;
  if (def.duration.kind === 'untilFull' && p.needs[def.duration.need] >= 95) return `${NEED_LABELS[def.duration.need]} is already full.`;
  if (def.kind === 'object' && def.behavior !== 'callRepair' && req.target.kind === 'object' && !freeUsePointExists(ctx, p, def, req.target.objectId)) return 'Someone is using it.';
  return null;
}

function option(
  ctx: SimCtx, p: Person, interactionId: string, label: string, icon: string, group: InteractionOption['group'],
  target: ActionInstance['target'], data?: ActionData,
): InteractionOption {
  const transient = !p.queue.some((x) => x.source !== 'autonomy');
  const reason = requestReason(ctx, p, { interactionId, target, ...(data ? { data } : {}) }, transient);
  return { interactionId, label, icon, group, enabled: reason === null, ...(reason ? { reason } : {}), target, ...(data ? { data } : {}) };
}

/** Context-menu options for `p` acting on `target`. */
export function optionsFor(ctx: SimCtx, p: Person, target: ActionInstance['target']): InteractionOption[] {
  const loc = lotLoc(p);
  switch (target.kind) {
    case 'object': {
      if (!loc) return [];
      const ref = objectRef(ctx, loc.lotId, target.objectId);
      if (!ref) return [];
      const out: InteractionOption[] = [];
      const t: ActionInstance['target'] = { kind: 'object', objectId: target.objectId, slotId: target.slotId ?? null };
      for (const iid of offeredInteractionIds(ref.def)) {
        const def = interactionDef(ctx, iid);
        if (!def || def.status !== 'ready') continue;
        // Chores only show when there is something to do: dirt to clean, a break to fix, wear to service.
        if (def.behavior === 'clean' && dirtOf(ref.obj) < 0.05) continue;
        if ((def.behavior === 'repair' || def.behavior === 'callRepair') && !isBroken(ref.obj)) continue;
        if (def.behavior === 'service' && (isBroken(ref.obj) || wearOf(ref.obj) < SERVICE_MIN_WEAR)) continue;
        if (def.id === 'readSkillBook') {
          for (const skillId of Object.keys(SKILL_BOOKS)) {
            if (ctx.content.skills[skillId]) out.push(option(ctx, p, iid, `Study: ${SKILL_BOOKS[skillId]}`, def.icon, 'object', t, { skillId }));
          }
          continue;
        }
        if (def.behavior === 'callRepair') {
          out.push(option(ctx, p, iid, `Call a Repairperson ($${(repairFee(p) / 100).toFixed(0)})`, def.icon, 'object', t));
          continue;
        }
        if (def.behavior === 'changeOutfit') {
          for (const cat of OUTFIT_CATEGORIES) {
            if ((p.outfits.outfits[cat]?.length ?? 0) === 0) continue;
            const o = option(ctx, p, iid, `Change into ${OUTFIT_LABELS[cat]}`, def.icon, 'object', t, { category: cat });
            if (p.outfits.current.category === cat && o.enabled) { o.enabled = false; o.reason = 'Already wearing it.'; }
            out.push(o);
          }
          continue;
        }
        out.push(option(ctx, p, iid, def.name, def.icon, 'object', t));
      }
      return out;
    }
    case 'item': {
      const out: InteractionOption[] = [];
      const kind = ctx.state.items[target.itemId]?.kind ?? 'meal';
      for (const def of Object.values(ctx.content.interactions)) {
        if (def.kind !== 'item' || def.status !== 'ready' || !(def.itemKinds ?? ['meal']).includes(kind)) continue;
        out.push(option(ctx, p, def.id, def.name, def.icon, 'object', target));
      }
      return out;
    }
    case 'tile': {
      const def = interactionDef(ctx, 'goHere')!;
      return [option(ctx, p, def.id, def.name, def.icon, 'move', target)];
    }
    case 'person':
      if (target.personId === p.id) return selfOptions(ctx, p);
      return socialOptions(ctx, p, target.personId);
    case 'self':
      return selfOptions(ctx, p);
  }
}

/**
 * How relevant a social is right now between these two (higher = nearer the top of its section): how naturally it
 * fits the relationship, the chance it works, a boost for a status step that has just become possible, for an
 * introduction between strangers and for making up after a quarrel; saying goodbye sits last.
 */
export function socialRelevance(ctx: SimCtx, p: Person, other: Person, def: SocialDef): number {
  const rel = peekRel(ctx.state, p.id, other.id);
  let r = socialFit(ctx, p, other, def) * 10 + socialAcceptance(ctx, p, other, def) * 5 + def.autonomy.weight;
  if (def.success.setStatus) r += 8;
  if (def.id === 'introduce' && rel.familiarity < 10) r += 30;
  if (def.id === 'waveGoodbye') r -= 12;
  if ((def.id === 'apologize' || def.id === 'makeUp') && hasRecentMemory(p, other.id, ['argument', 'insult', 'betrayal'], 3 * 1440, ctx.now)) r += 15;
  return r;
}

function oddsHint(chance: number): string {
  return chance >= 0.7 ? 'Good odds' : chance >= 0.45 ? 'Fair odds' : 'Long shot';
}

function socialOptions(ctx: SimCtx, p: Person, otherId: string): InteractionOption[] {
  const other = ctx.state.people[otherId];
  if (!other) return [];
  const t: ActionInstance['target'] = { kind: 'person', personId: otherId };
  const rows = Object.values(ctx.content.socials)
    .filter((d) => d.status === 'ready')
    .map((d) => {
      const o = option(ctx, p, d.id, d.name, d.icon, 'social', t);
      const section = socialSection(d);
      o.section = section;
      // Odds are shown for ordinary socials only: for romance they would reveal what the other person feels.
      if (o.enabled && section !== 'romantic' && !d.unilateral && !d.requires.romantic) o.hint = oddsHint(socialAcceptance(ctx, p, other, d));
      return { o, d, rank: socialRelevance(ctx, p, other, d) };
    });
  rows.sort((a, b) => SECTION_ORDER.indexOf(a.o.section!) - SECTION_ORDER.indexOf(b.o.section!)
    || Number(b.o.enabled) - Number(a.o.enabled) || b.rank - a.rank || a.d.name.localeCompare(b.d.name));
  return rows.map((x) => x.o);
}

function selfOptions(ctx: SimCtx, p: Person): InteractionOption[] {
  const out: InteractionOption[] = [];
  const self: ActionInstance['target'] = { kind: 'self' };
  const defs = Object.values(ctx.content.interactions).filter((d) => d.kind === 'self' && d.status === 'ready');
  if (p.career && !defs.some((d) => d.behavior === 'goToWork')) defs.push(BUILTIN_INTERACTIONS.goToWork!);
  for (const def of defs) {
    const beh = def.behavior ?? 'generic';
    if (beh === 'leaveLot' || def.id === 'leaveLot') continue;
    if (beh === 'goToWork' && !p.career) continue;
    if (beh === 'invite') {
      for (const other of Object.values(ctx.state.people)) {
        if (other.householdId === p.householdId || !ctx.state.households[other.householdId] || ctx.state.households[other.householdId]!.isPlayable) continue;
        out.push({ ...option(ctx, p, def.id, `Invite ${other.firstName} Over`, def.icon, 'self', self, { personId: other.id }), section: 'phone' });
      }
      continue;
    }
    if (beh === 'phoneChat') {
      for (const id of knownPeople(ctx.state, p.id)) {
        const other = ctx.state.people[id];
        if (other) out.push({ ...option(ctx, p, def.id, `Call ${other.firstName}`, def.icon, 'self', self, { personId: id }), section: 'phone' });
      }
      continue;
    }
    if (beh === 'planEvent') {
      if (isAdult(p)) out.push({ ...option(ctx, p, def.id, 'Plan an Event...', def.icon, 'self', self), section: 'phone' });
      continue;
    }
    if (beh === 'phoneDate') {
      // Only people the caller could be attracted to and already knows are listed (nobody is pestered with options).
      for (const id of knownPeople(ctx.state, p.id)) {
        const other = ctx.state.people[id];
        if (!other || other.householdId === p.householdId || !romanceInterest(p, other) || peekRel(ctx.state, p.id, id).romanceBlocked) continue;
        out.push({ ...option(ctx, p, def.id, `Ask ${other.firstName} on a Date`, def.icon, 'self', self, { personId: id }), section: 'phone' });
      }
      continue;
    }
    if (beh === 'changeOutfit') {
      for (const cat of OUTFIT_CATEGORIES) {
        if ((p.outfits.outfits[cat]?.length ?? 0) === 0 || p.outfits.current.category === cat) continue;
        out.push(option(ctx, p, def.id, `Change into ${OUTFIT_LABELS[cat]}`, def.icon, 'self', self, { category: cat }));
      }
      continue;
    }
    out.push(option(ctx, p, def.id, def.name, def.icon, 'self', self));
  }
  // Broken things can be reported to a repairperson by phone from the person's own menu too.
  const call = interactionDef(ctx, 'callRepairperson');
  const loc = lotLoc(p);
  if (call && call.status === 'ready' && loc) {
    for (const ref of lotObjects(ctx, loc.lotId, loc.level)) {
      if (!isRepairable(ref.def) || !isBroken(ref.obj)) continue;
      out.push(option(ctx, p, call.id, `Call a Repairperson: ${ref.def.name} ($${(repairFee(p) / 100).toFixed(0)})`, call.icon, 'self', { kind: 'object', objectId: ref.obj.id, slotId: null }));
    }
  }
  return out;
}
