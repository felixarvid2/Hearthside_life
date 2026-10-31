// Context-menu options for a person and a picked target, with readable reasons for disabled entries.
// Pure: building options never changes the world.

import { OUTFIT_CATEGORIES } from '../core/types';
import type { ActionInstance, OutfitCategory, Person } from '../core/types';
import { behaviorFor } from './behaviors';
import type { SimCtx } from './context';
import { BUILTIN_INTERACTIONS, interactionDef, lotLoc, objectRef } from './context';
import { NEED_LABELS } from './needs';
import { knownPeople } from './relationships';
import { slotKey, tileResKey } from './reservations';
import { objectCandidates } from './steps';
import { QUEUE_MAX } from './tuning';
import type { ActionData, ActionRequest, InteractionOption } from './types';

const OUTFIT_LABELS: Record<OutfitCategory, string> = {
  everyday: 'Everyday', formal: 'Formal', work: 'Work', athletic: 'Athletic', sleep: 'Sleepwear', swim: 'Swimwear',
};

const SOCIAL_ORDER = ['greeting', 'friendly', 'funny', 'deep', 'support', 'family', 'romantic', 'status', 'mean'];

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
  const loc = lotLoc(p)!;
  if (def.kind === 'object' && req.target.kind === 'object' && !['watchTv', 'computer'].includes(def.behavior ?? '')) {
    const cands = objectCandidates(ctx, loc.lotId, req.target.objectId, def.slotKinds);
    const free = cands.some((c) => {
      const key = c.slot ? slotKey(c.objectId, c.slot.slotId) : c.tile ? tileResKey(c.tile.x, c.tile.z) : null;
      return key !== null && ctx.res.isFree(key);
    });
    if (cands.length > 0 && !free) return 'Someone is using it.';
  }
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
      for (const iid of ref.def.interactions) {
        const def = interactionDef(ctx, iid);
        if (!def || def.status !== 'ready') continue;
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
      for (const def of Object.values(ctx.content.interactions)) {
        if (def.kind !== 'item' || def.status !== 'ready') continue;
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

function socialOptions(ctx: SimCtx, p: Person, otherId: string): InteractionOption[] {
  const other = ctx.state.people[otherId];
  if (!other) return [];
  const defs = Object.values(ctx.content.socials)
    .filter((d) => d.status === 'ready')
    .sort((a, b) => SOCIAL_ORDER.indexOf(a.category) - SOCIAL_ORDER.indexOf(b.category) || a.name.localeCompare(b.name));
  const t: ActionInstance['target'] = { kind: 'person', personId: otherId };
  return defs.map((d) => option(ctx, p, d.id, d.name, d.icon, 'social', t));
}

function selfOptions(ctx: SimCtx, p: Person): InteractionOption[] {
  const out: InteractionOption[] = [];
  const self: ActionInstance['target'] = { kind: 'self' };
  const defs = Object.values(ctx.content.interactions).filter((d) => d.kind === 'self' && d.status === 'ready');
  if (p.career && !defs.some((d) => d.behavior === 'goToWork')) defs.push(BUILTIN_INTERACTIONS.goToWork!);
  for (const def of defs) {
    const beh = def.behavior ?? 'generic';
    if (beh === 'leaveLot') continue;
    if (beh === 'goToWork' && !p.career) continue;
    if (beh === 'invite') {
      for (const other of Object.values(ctx.state.people)) {
        if (other.householdId === p.householdId || !ctx.state.households[other.householdId] || ctx.state.households[other.householdId]!.isPlayable) continue;
        out.push(option(ctx, p, def.id, `Invite ${other.firstName} Over`, def.icon, 'self', self, { personId: other.id }));
      }
      continue;
    }
    if (beh === 'phoneChat') {
      for (const id of knownPeople(ctx.state, p.id)) {
        const other = ctx.state.people[id];
        if (other) out.push(option(ctx, p, def.id, `Call ${other.firstName}`, def.icon, 'self', self, { personId: id }));
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
  return out;
}
