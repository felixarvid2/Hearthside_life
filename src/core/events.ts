// Runtime event bus. Events describe what happened; they never carry Three.js objects or DOM nodes.
// The feed (WorldState.feed) is the persisted, player-facing subset.

import type { Cents, GameMinutes, Id, NeedId } from './types';

export type GameEvent =
  | { type: 'tick'; minutes: GameMinutes }
  | { type: 'state.replaced' } // new game or load: everything must resync
  | { type: 'lot.changed'; lotId: Id; what: 'walls' | 'floors' | 'objects' | 'openings' | 'all' }
  | { type: 'person.changed'; personId: Id; what: 'appearance' | 'outfit' | 'location' | 'queue' | 'needs' | 'all' }
  | { type: 'person.added'; personId: Id }
  | { type: 'person.removed'; personId: Id }
  | { type: 'action.started'; personId: Id; actionId: Id; interactionId: string }
  | { type: 'action.finished'; personId: Id; actionId: Id; interactionId: string; result: 'done' | 'failed' | 'cancelled'; reason?: string }
  | { type: 'social'; actorId: Id; targetId: Id; socialId: string; accepted: boolean; line: string }
  | { type: 'need.low'; personId: Id; need: NeedId; value: number }
  | { type: 'money'; householdId: Id; amount: Cents; balance: Cents; label: string }
  | { type: 'career'; personId: Id; what: 'leftForWork' | 'returned' | 'paid' | 'promoted' | 'demoted' | 'missed' | 'late'; amount?: Cents }
  | { type: 'skill.level'; personId: Id; skillId: string; level: number }
  | { type: 'aspiration'; personId: Id; what: 'objective' | 'stage' | 'complete'; text: string }
  | { type: 'relationship'; fromId: Id; toId: Id; what: 'status' | 'value'; text?: string }
  | { type: 'feed'; entryId: Id }
  | { type: 'notify'; text: string; kind: 'info' | 'warning' | 'error' }
  /** The simulation asks the UI to open a screen (e.g. the wardrobe editor after `editOutfits`). */
  | { type: 'ui.request'; what: 'editOutfits' | 'focusPerson'; personId: Id }
  | { type: 'item.changed'; itemId: Id; lotId: Id };

type Handler<E> = (e: E) => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler<GameEvent>>>();
  private any = new Set<Handler<GameEvent>>();

  on<T extends GameEvent['type']>(type: T, fn: Handler<Extract<GameEvent, { type: T }>>): () => void {
    let set = this.handlers.get(type);
    if (!set) { set = new Set(); this.handlers.set(type, set); }
    set.add(fn as Handler<GameEvent>);
    return () => set!.delete(fn as Handler<GameEvent>);
  }

  onAny(fn: Handler<GameEvent>): () => void { this.any.add(fn); return () => this.any.delete(fn); }

  emit(e: GameEvent): void {
    const set = this.handlers.get(e.type);
    if (set) for (const fn of [...set]) fn(e);
    for (const fn of [...this.any]) fn(e);
  }
}
