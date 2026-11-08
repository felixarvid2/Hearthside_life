// Gifts (social gaps pass): a gift is bought when it is accepted and becomes a parcel (a WorldItem of kind 'gift') on the
// recipient's lot, owned by them. The reaction depends on the recipient's likes, dislikes, traits and age, never on the
// price, and sets how far the friendship and trust move. All of it is a pure function of the state; there are no
// dice, so the picker can show a fair hint once the giver knows the recipient well enough.

import { newId } from '../core/ids';
import type { Id, Lot, Person, WorldItem, WorldState } from '../core/types';
import type { GiftDef, SocialOutcome } from '../content/types';
import type { SimCtx } from './context';
import { isTable, lotLoc, lotObjects } from './context';
import { freeSurfaceTiles } from './cooking';
import { isBroken } from './housekeeping';
import { entrySpots } from './places';
import { peekRel } from './relationships';
import { GIFT_HINT_FAMILIARITY, GIFT_KEEP_MINUTES, GIFT_LOT_LIMIT } from './tuning';

export type GiftVerdict = 'loved' | 'liked' | 'fine' | 'disliked';

export interface GiftReaction { verdict: GiftVerdict; score: number; reasons: string[] }

/** How `recipient` takes `gift`: likes (+1 each, up to 2), dislikes (-1 each, down to -2) and trait fit (-1..1.5). */
export function giftReaction(recipient: Pick<Person, 'likes' | 'dislikes' | 'traits' | 'firstName'>, gift: GiftDef): GiftReaction {
  const reasons: string[] = [];
  const liked = gift.appeals.filter((a) => recipient.likes.includes(a));
  const disliked = gift.appeals.filter((a) => recipient.dislikes.includes(a));
  let score = Math.min(2, liked.length) - Math.min(2, disliked.length);
  if (liked.length > 0) reasons.push('fits what they like');
  if (disliked.length > 0) reasons.push('not what they like');
  let fit = 0;
  for (const t of recipient.traits) fit += gift.traitFit[t] ?? 0;
  fit = Math.max(-1, Math.min(1.5, fit));
  if (fit >= 0.4) reasons.push('suits their character');
  else if (fit <= -0.4) reasons.push('not really their style');
  score += fit;
  const verdict: GiftVerdict = score >= 1.5 ? 'loved' : score >= 0.5 ? 'liked' : score > -0.5 ? 'fine' : 'disliked';
  return { verdict, score: Math.round(score * 100) / 100, reasons };
}

/** The relationship, mood and memory result of a verdict, built on the social's own success outcome. */
export function giftOutcome(base: SocialOutcome, verdict: GiftVerdict, loving: boolean): SocialOutcome {
  const table: Record<GiftVerdict, { actor: SocialOutcome['actor']; target: SocialOutcome['target']; social: number; importance: 1 | 2 }> = {
    loved: { actor: { friendship: 3, trust: 1 }, target: { friendship: 9, trust: 3, ...(loving ? { romance: 3 } : {}) }, social: 10, importance: 2 },
    liked: { actor: { friendship: 2, trust: 1 }, target: { friendship: 6, trust: 2, ...(loving ? { romance: 1 } : {}) }, social: 8, importance: 1 },
    fine: { actor: { friendship: 1 }, target: { friendship: 3, trust: 1 }, social: 5, importance: 1 },
    disliked: { actor: { friendship: -1 }, target: { friendship: -2, trust: -1 }, social: 2, importance: 1 },
  };
  const t = table[verdict];
  const out: SocialOutcome = {
    ...base, actor: t.actor, target: t.target, social: t.social,
    actorMoodlet: verdict === 'disliked' ? 'awkward' : 'pleasantChat',
  };
  if (verdict === 'loved' || verdict === 'liked') out.targetMoodlet = 'giftReceived';
  else delete out.targetMoodlet;
  if (base.memory) out.memory = { ...base.memory, importance: t.importance };
  return out;
}

const LINES: Record<GiftVerdict, string[]> = {
  loved: ['{a} gives {b} {gift}. {b} lights up: it is exactly right!', '{b} unwraps {gift} and beams at {a}. "How did you know?"'],
  liked: ['{a} gives {b} {gift}. {b} is delighted.', '"Thank you, {a}, this is lovely," says {b}, unwrapping {gift}.'],
  fine: ['{a} gives {b} {gift}. "That is kind of you," says {b}.', '{b} thanks {a} for {gift} and puts it aside with a smile.'],
  disliked: ['{a} gives {b} {gift}. {b} tries to look pleased, but it is not their thing.', '"Oh. Thank you, {a}," says {b} a bit stiffly, holding {gift}.'],
};

/** The feed line for a gift that was given: picked by the verdict and the pair, so the same gift reads the same. */
export function giftLine(verdict: GiftVerdict, gift: GiftDef, a: string, b: string, pick: number): string {
  const list = LINES[verdict];
  return list[pick % list.length]!.replaceAll('{a}', a).replaceAll('{b}', b).replaceAll('{gift}', `a ${gift.name.toLowerCase()}`);
}

/** Why `giver` cannot give this gift to `recipient` now (age, money), or null. */
export function giftProblem(ctx: SimCtx, giver: Person, recipient: Person, giftId: string): string | null {
  const gift = ctx.content.gifts?.[giftId];
  if (!gift || gift.status !== 'ready') return 'That gift is not available.';
  if (!gift.ages.includes(recipient.lifeStage)) return `${recipient.firstName} is too ${recipient.lifeStage === 'baby' ? 'small' : 'young or old'} for that.`;
  if (!ctx.state.settings.unlimitedFunds && (ctx.state.households[giver.householdId]?.funds ?? 0) < gift.price) return `Not enough money ($${(gift.price / 100).toFixed(0)}).`;
  return null;
}

export interface GiftChoice {
  id: string; name: string; description: string; icon: string; price: number;
  enabled: boolean; reason?: string;
  /** What the giver can tell about the fit: 'unknown' until they know the recipient well enough. */
  hint: GiftVerdict | 'unknown';
}

/** The catalog as the picker shows it: price, affordability, and a hint once `giver` knows `recipient` (familiarity). */
export function giftChoices(ctx: SimCtx, giver: Person, recipient: Person): GiftChoice[] {
  const known = peekRel(ctx.state, giver.id, recipient.id).familiarity >= GIFT_HINT_FAMILIARITY;
  return Object.values(ctx.content.gifts ?? {}).filter((g) => g.status === 'ready').sort((a, b) => a.price - b.price || (a.id < b.id ? -1 : 1)).map((g) => {
    const reason = giftProblem(ctx, giver, recipient, g.id);
    return {
      id: g.id, name: g.name, description: g.description, icon: g.icon, price: g.price, enabled: reason === null,
      ...(reason ? { reason } : {}), hint: known ? giftReaction(recipient, g).verdict : 'unknown',
    };
  });
}

/** The lot where a recipient's belongings are kept: their home, else the lot they are on. */
function giftLot(state: WorldState, recipient: Person): Lot | undefined {
  const home = state.households[recipient.householdId]?.homeLotId;
  const here = lotLoc(recipient)?.lotId;
  return (home ? state.lots[home] : undefined) ?? (here ? state.lots[here] : undefined) ?? state.lots[state.activeLotId];
}

/**
 * Puts the wrapped gift on the recipient's lot: on a free table when the home is built, else by the front door. The
 * oldest parcels beyond GIFT_LOT_LIMIT are put away. Returns the item (null when the recipient has no lot).
 */
export function createGiftItem(ctx: SimCtx, giver: Person, recipient: Person, gift: GiftDef): WorldItem | null {
  const lot = giftLot(ctx.state, recipient);
  if (!lot) return null;
  const here = Object.values(ctx.state.items).filter((i) => i.kind === 'gift' && i.lotId === lot.id).sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  for (const old of here.slice(0, Math.max(0, here.length + 1 - GIFT_LOT_LIMIT))) {
    delete ctx.state.items[old.id];
    ctx.events.emit({ type: 'item.changed', itemId: old.id, lotId: old.lotId });
  }
  let position: WorldItem['position'] | null = null;
  if (Object.keys(lot.objects).length > 0) {
    const tables = lotObjects(ctx, lot.id, 0).filter((r) => isTable(r.def) && !isBroken(r.obj))
      .map((r) => ({ r, free: freeSurfaceTiles(ctx, lot.id, r) })).filter((x) => x.free.length > 0)
      .sort((a, b) => (a.r.obj.id < b.r.obj.id ? -1 : 1));
    const t = tables[0];
    if (t) position = { x: t.free[0]!.x + 0.5, z: t.free[0]!.z + 0.5, level: t.r.obj.level, onObjectId: t.r.obj.id };
  }
  if (!position) {
    const used = Math.min(here.length, GIFT_LOT_LIMIT - 1);
    const spots = entrySpots(ctx, lot, used + 1);
    const s = spots[Math.min(used, spots.length - 1)]!;
    position = { x: s.x, z: s.z, level: lot.entry.level };
  }
  const item: WorldItem = {
    id: newId(ctx.state, 'itm'), kind: 'gift', lotId: lot.id, position, recipeId: gift.id, portions: 1, quality: 1,
    createdAt: ctx.now, spoilsAt: ctx.now + GIFT_KEEP_MINUTES, ownerHouseholdId: recipient.householdId, ownerPersonId: recipient.id, giftFromId: giver.id,
  };
  ctx.state.items[item.id] = item;
  ctx.events.emit({ type: 'item.changed', itemId: item.id, lotId: item.lotId });
  return item;
}

/** Gift parcels that belong to a person, newest first. */
export function giftsOf(state: WorldState, personId: Id): WorldItem[] {
  return Object.values(state.items).filter((i) => i.kind === 'gift' && i.ownerPersonId === personId).sort((a, b) => b.createdAt - a.createdAt);
}
