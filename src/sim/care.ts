// Dependent care (Milestone 8). Babies and toddlers cannot look after themselves.
//
// - Babies stay in a crib or bassinet (a lying person at a sleeping slot of an object tagged 'crib' or 'bassinet'; on the
//   floor when the lot has none) and never act on their own. Teens and adults care for them with the care interactions
//   Feed, Change Diaper, Put to Bed, Cuddle and Play (and, with a birthday cake, Celebrate a Birthday); a baby is
//   carried (it follows the caregiver) while it is fed, changed, cuddled or played with, and goes back to its crib afterwards.
// - Toddlers walk and play on their own within the toddler list (toys, naps, the potty, the high chair) and are looked
//   after with the same care interactions; socials teach them to talk, walk and use the potty.
// - The sitter also serves little ones of households the player is not playing while they are on the lot being simulated (a
//   visit to their home); off the lot a dependent is looked after by their family and the neglect timer is dropped.
// - Caregivers in the player's household notice a dependent's need by themselves (autonomy), like any need of their own.
// - Neglect is not punished harshly: a need of a baby or toddler of the player's household that stays at zero for
//   CARE_NEGLECT_MINUTES calls an emergency sitter. The sitter fixes the need and charges SITTER_FEE through transact, once per
//   occurrence `sitter:<personId>:<day>:<n>`, with a warning.

import { dayIndex, minuteOfDay } from '../core/clock';
import { isCaregiverStage, isDependentStage } from '../core/lifeStages';
import { addFeed, isProcessed, markProcessed, transact } from '../core/state';
import type { ActionInstance, Id, NeedId, Person, WorldState } from '../core/types';
import { NEED_IDS } from '../core/types';
import { ageUp, ageUpProblem } from './aging';
import type { SimCtx } from './context';
import { clamp, dist, householdOf, lotLoc, lotObjects, setAnim } from './context';
import { addMoodlet } from './mood';
import { changeNeed, needUrgency } from './needs';
import { addSkillXp } from './skills';
import type { Behavior, Step } from './steps';
import { personKey } from './reservations';
import { CARE_AUTONOMY_NEED, CARE_EMPTY_NEED, CARE_NEGLECT_MINUTES, SITTER_FEE, SITTER_RESTORE } from './tuning';

/** The care interaction ids. */
export const CARE_IDS = ['careFeed', 'careChange', 'careBed', 'careCuddle', 'carePlay', 'careBirthday'] as const;
export type CareId = (typeof CARE_IDS)[number];

export const isCareId = (id: string): id is CareId => (CARE_IDS as readonly string[]).includes(id);

/** What each care action does to the little one (needs are raised, capped at 100). */
const CARE_EFFECTS: Record<Exclude<CareId, 'careBirthday'>, { needs: Partial<Record<NeedId, number>>; moodlet?: string; carry: boolean; skill?: { id: string; xp: number } }> = {
  careFeed: { needs: { hunger: 55 }, moodlet: 'looked', carry: true },
  careChange: { needs: { bladder: 60, hygiene: 45 }, moodlet: 'looked', carry: true },
  careBed: { needs: { energy: 55 }, moodlet: 'looked', carry: false },
  careCuddle: { needs: { social: 40, fun: 5 }, moodlet: 'cuddled', carry: true },
  carePlay: { needs: { fun: 40, social: 15 }, moodlet: 'playedWith', carry: true, skill: { id: 'motor', xp: 8 } },
};

/** Extra hygiene a changing table in the house gives. */
const CHANGING_TABLE_BONUS = 10;

export const isDependent = (p: Pick<Person, 'lifeStage'>): boolean => isDependentStage(p.lifeStage);

/** The babies and toddlers of a household. */
export function dependentsOf(state: WorldState, householdId: Id): Person[] {
  const hh = state.households[householdId];
  return (hh?.memberIds ?? []).map((id) => state.people[id]).filter((p): p is Person => !!p && isDependentStage(p.lifeStage));
}

// ---------------------------------------------------------------------------------------------
// Cribs
// ---------------------------------------------------------------------------------------------

const isCribObject = (tags: readonly string[]) => tags.includes('crib') || tags.includes('bassinet');

/** Sleeping slots of cribs and bassinets on the lot level. */
function cribSlots(ctx: SimCtx, lotId: Id, level: number): Array<{ objectId: Id; x: number; z: number; facing: number }> {
  const out: Array<{ objectId: Id; x: number; z: number; facing: number }> = [];
  for (const ref of lotObjects(ctx, lotId, level)) {
    if (!isCribObject(ref.def.tags)) continue;
    for (const s of ctx.nav.slotsOf(lotId, ref.obj.id)) if (s.kind === 'sleep') out.push({ objectId: ref.obj.id, x: s.x, z: s.z, facing: s.facing });
  }
  return out;
}

/** True when somebody is looking after the dependent right now (a care action targets them). */
export function beingCaredFor(ctx: Pick<SimCtx, 'state'>, id: Id): boolean {
  return Object.values(ctx.state.people).some((o) => o.queue.some((a) => isCareId(a.interactionId) && a.target.kind === 'person' && a.target.personId === id));
}

/** Puts a baby into a free crib or bassinet on its lot (lying, asleep); with none it lies where it is. */
export function settleBaby(ctx: SimCtx, baby: Person): void {
  const loc = lotLoc(baby);
  if (!loc) return;
  const slots = cribSlots(ctx, loc.lotId, loc.level);
  const others = Object.values(ctx.state.people).filter((o) => o.id !== baby.id && isDependentStage(o.lifeStage));
  const taken = (x: number, z: number) => others.some((o) => { const ol = lotLoc(o); return !!ol && ol.lotId === loc.lotId && ol.posture === 'lying' && dist(ol.x, ol.z, x, z) < 0.4; });
  const here = slots.find((s) => dist(s.x, s.z, loc.x, loc.z) < 0.05);
  const pick = here ?? slots.filter((s) => !taken(s.x, s.z)).sort((a, b) => dist(a.x, a.z, loc.x, loc.z) - dist(b.x, b.z, loc.x, loc.z))[0];
  if (pick) { loc.x = pick.x; loc.z = pick.z; loc.facing = pick.facing; }
  loc.posture = 'lying';
  baby.queue = [];
  setAnim(baby, 'sleep', ctx.now);
}

/** Keeps every baby on a lot in a crib unless somebody is caring for it. Runs every 15 game minutes. */
export function settleDependents(ctx: SimCtx): void {
  for (const p of Object.values(ctx.state.people)) {
    if (p.lifeStage !== 'baby' || !lotLoc(p) || beingCaredFor(ctx, p.id)) continue;
    settleBaby(ctx, p);
  }
}

// ---------------------------------------------------------------------------------------------
// Care actions
// ---------------------------------------------------------------------------------------------

function targetOf(ctx: SimCtx, a: Pick<ActionInstance, 'target'>): Person | undefined {
  return a.target.kind === 'person' ? ctx.state.people[a.target.personId] : undefined;
}

/** A birthday cake on the lot (a table or counter holds it). */
export function cakeOnLot(ctx: Pick<SimCtx, 'state' | 'content'>, lotId: Id): boolean {
  const lot = ctx.state.lots[lotId];
  if (!lot) return false;
  return Object.values(lot.objects).some((o) => ctx.content.objects[o.defId]?.tags.includes('cake'));
}

/** Why `care` cannot be done for `target` by `p` now, or null. Pure. */
export function careProblem(ctx: SimCtx, p: Person, target: Person | undefined, care: CareId): string | null {
  if (!target) return 'Choose someone to look after.';
  if (!isDependentStage(target.lifeStage)) return `${target.firstName} looks after ${target.pronouns.object}self.`;
  if (!isCaregiverStage(p.lifeStage) || isDependentStage(p.lifeStage)) return `${p.firstName} is too young to look after anyone.`;
  const tl = lotLoc(target), pl = lotLoc(p);
  if (!tl) return `${target.firstName} isn't here.`;
  if (pl && pl.lotId !== tl.lotId) return `${target.firstName} isn't here.`;
  const holder = ctx.res.holder(personKey(target.id));
  if (holder && !p.queue.some((x) => x.id === holder)) return `${target.firstName} is being looked after.`;
  const n = target.needs;
  switch (care) {
    case 'careFeed': return n.hunger >= 90 ? `${target.firstName} isn't hungry.` : null;
    case 'careChange': return n.bladder >= 85 && n.hygiene >= 85 ? `${target.firstName} is fresh and dry.` : null;
    case 'careBed': return n.energy >= 90 ? `${target.firstName} isn't tired.` : null;
    case 'careCuddle': return n.social >= 95 ? `${target.firstName} has had plenty of cuddles.` : null;
    case 'carePlay': return n.fun >= 95 ? `${target.firstName} has had plenty of play.` : null;
    case 'careBirthday': {
      if (!cakeOnLot(ctx, tl.lotId)) return 'Needs a birthday cake on a table or counter (Buy mode, Decor).';
      return ageUpProblem(ctx, target);
    }
  }
}

function carryTo(baby: Person, who: Person): void {
  const bl = lotLoc(baby), wl = lotLoc(who);
  if (!bl || !wl) return;
  bl.lotId = wl.lotId; bl.level = wl.level;
  bl.x = wl.x; bl.z = wl.z; bl.facing = wl.facing; bl.posture = 'standing';
}

/** The care behaviour: walk to the little one, look after them for a few minutes (carrying a baby), then the needs rise. */
export const careBehavior: Behavior = {
  check(ctx, p, a) {
    if (!isCareId(a.interactionId)) return 'That interaction is not available.';
    return careProblem(ctx, p, targetOf(ctx, a), a.interactionId);
  },
  reserve: () => null,
  step(ctx, _p, a): Step | string {
    const t = targetOf(ctx, a);
    if (!t || !lotLoc(t)) return `${t?.firstName ?? 'They'} left.`;
    const def = ctx.content.interactions[a.interactionId];
    const carrying = a.data.carried === true;
    return {
      goal: carrying ? { kind: 'here' } : { kind: 'person', personId: t.id, label: t.firstName },
      posture: 'standing', performAnim: def?.anims.perform ?? 'interact',
      duration: { kind: 'fixed', minutes: def?.duration.kind === 'fixed' ? Math.max(1, def.duration.minutes) : 8 }, rates: {},
    };
  },
  begin(ctx, p, a) {
    const t = targetOf(ctx, a);
    if (!t) return 'They left.';
    const problem = careProblem(ctx, p, t, a.interactionId as CareId);
    if (problem) return problem;
    const fx = isCareId(a.interactionId) && a.interactionId !== 'careBirthday' ? CARE_EFFECTS[a.interactionId] : null;
    if (t.lifeStage === 'baby' && (fx?.carry ?? false)) {
      a.data.carried = true;
      carryTo(t, p);
      setAnim(t, 'idle', ctx.now);
      ctx.events.emit({ type: 'person.changed', personId: t.id, what: 'location' });
    }
    return null;
  },
  tick(ctx, p, a) {
    const t = targetOf(ctx, a);
    if (!t) return 'They left.';
    if (a.data.carried === true) carryTo(t, p);
    return null;
  },
  apply(ctx, p, a) {
    const t = targetOf(ctx, a);
    if (!t || !isCareId(a.interactionId)) return;
    if (a.interactionId === 'careBirthday') {
      const r = ageUp(ctx, t, 'cake');
      if (r.ok) {
        addMoodlet(ctx.content, p, 'celebrating', ctx.now, 'birthday');
        addMoodlet(ctx.content, t, 'celebrating', ctx.now, 'birthday');
      }
      return;
    }
    const fx = CARE_EFFECTS[a.interactionId];
    for (const [need, gain] of Object.entries(fx.needs) as Array<[NeedId, number]>) {
      let g = gain;
      if (a.interactionId === 'careChange' && need === 'hygiene' && hasChangingTable(ctx, p)) g += CHANGING_TABLE_BONUS;
      changeNeed(ctx, t, need, g);
    }
    if (fx.moodlet) addMoodlet(ctx.content, t, fx.moodlet, ctx.now, a.interactionId);
    if (fx.skill && t.lifeStage === 'toddler') addSkillXp(ctx, t, fx.skill.id, fx.skill.xp);
    changeNeed(ctx, p, 'social', 6);
    delete t.careSince;
  },
  end(ctx, _p, a) {
    const t = targetOf(ctx, a);
    if (t && t.lifeStage === 'baby' && lotLoc(t)) settleBaby(ctx, t);
    else if (t && a.data.carried === true && lotLoc(t)) lotLoc(t)!.posture = 'standing';
    ctx.events.emit({ type: 'person.changed', personId: a.actorId, what: 'queue' });
  },
  interruptible: true,
};

function hasChangingTable(ctx: SimCtx, p: Person): boolean {
  const loc = lotLoc(p);
  const lot = loc ? ctx.state.lots[loc.lotId] : undefined;
  return !!lot && Object.values(lot.objects).some((o) => ctx.content.objects[o.defId]?.tags.includes('changing-table'));
}

// ---------------------------------------------------------------------------------------------
// Autonomy: caregivers notice a need
// ---------------------------------------------------------------------------------------------

export interface CareWish { interactionId: CareId; personId: Id; score: number; key: string; addresses: NeedId[] }

/** The care a caregiver would give by themselves right now: one wish per needy dependent of the household on the same lot. */
export function careWishes(ctx: SimCtx, p: Person): CareWish[] {
  const loc = lotLoc(p);
  if (!loc || !isCaregiverStage(p.lifeStage) || isDependentStage(p.lifeStage)) return [];
  const out: CareWish[] = [];
  for (const d of dependentsOf(ctx.state, p.householdId)) {
    const dl = lotLoc(d);
    if (!dl || dl.lotId !== loc.lotId || beingCaredFor(ctx, d.id)) continue;
    const n = d.needs;
    const wants: Array<[CareId, number, NeedId[]]> = [];
    if (n.hunger < CARE_AUTONOMY_NEED) wants.push(['careFeed', n.hunger, ['hunger']]);
    if (n.bladder < 40 || n.hygiene < 35) wants.push(['careChange', Math.min(n.bladder, n.hygiene), ['bladder', 'hygiene']]);
    if (n.energy < 35) wants.push(['careBed', n.energy, ['energy']]);
    if (n.social < 40) wants.push(['careCuddle', n.social, ['social']]);
    if (n.fun < 40) wants.push(['carePlay', n.fun, ['fun']]);
    for (const [id, v, addresses] of wants) {
      const score = (1 + needUrgency(v) * 0.9) / (1 + dist(loc.x, loc.z, dl.x, dl.z) / 15);
      out.push({ interactionId: id, personId: d.id, score, key: `${id}@${d.id}`, addresses });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Neglect: the emergency sitter
// ---------------------------------------------------------------------------------------------

/**
 * Every 15 game minutes: tracks how long each need of the babies and toddlers on the lot has been empty and calls the
 * emergency sitter after CARE_NEGLECT_MINUTES (the household you play, or the family whose home you are visiting).
 */
export function updateCare(ctx: SimCtx): void {
  if (Math.round(minuteOfDay(ctx.now) % 15) !== 0) return;
  settleDependents(ctx);
  for (const p of Object.values(ctx.state.people)) {
    if (!isDependentStage(p.lifeStage)) continue;
    // Off-lot reconciliation: somebody who is not on the lot being simulated is looked after by their family (their needs drift
    // to comfortable values, sim/needs.ts), so a stale neglect timer is dropped instead of firing when they are next seen.
    if (!lotLoc(p)) { if (p.careSince) delete p.careSince; continue; }
    for (const need of NEED_IDS) {
      const since = p.careSince?.[need];
      if (p.needs[need] > CARE_EMPTY_NEED) {
        if (since !== undefined) { delete p.careSince![need]; if (Object.keys(p.careSince!).length === 0) delete p.careSince; }
        continue;
      }
      if (since === undefined) { p.careSince = { ...(p.careSince ?? {}), [need]: ctx.now }; continue; }
      if (ctx.now - since >= CARE_NEGLECT_MINUTES) callSitter(ctx, p, need);
    }
  }
}

/** The sitter's visit: raises every empty need, charges the fee once per occurrence and warns the player. */
export function callSitter(ctx: SimCtx, p: Person, need: NeedId): boolean {
  const day = dayIndex(ctx.now);
  let n = 0;
  while (isProcessed(ctx.state, `sitter:${p.id}:${day}:${n}`)) n++;
  const occ = `sitter:${p.id}:${day}:${n}`;
  markProcessed(ctx.state, occ);
  // The household you play can go into debt for the sitter; another household pays only what it has.
  const playable = householdOf(ctx, p)?.isPlayable === true;
  const paid = transact(ctx.state, ctx.events, p.householdId, -SITTER_FEE, 'family', `Emergency sitter for ${p.firstName}`, { occurrence: occ, allowDebt: playable });
  for (const id of NEED_IDS) if (p.needs[id] <= CARE_EMPTY_NEED || id === need) p.needs[id] = clamp(Math.max(p.needs[id], SITTER_RESTORE), 0, 100);
  delete p.careSince;
  addMoodlet(ctx.content, p, 'sitterCalled', ctx.now, 'care');
  ctx.events.emit({ type: 'care', personId: p.id, what: 'sitter' });
  const fee = `$${(SITTER_FEE / 100).toFixed(2)}`;
  if (playable) addFeed(ctx.state, ctx.events, 'warning', `${p.firstName} was left alone too long, so an emergency sitter stepped in (${paid.ok ? fee : 'no charge'}). Look after little ones before they run out of everything.`, p.id);
  else addFeed(ctx.state, ctx.events, 'info', `${p.firstName} ${p.lastName} was left alone for a long while here, so a sitter stepped in.`, p.id);
  return paid.ok;
}
