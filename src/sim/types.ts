// Public request/option types of the simulation API (docs/ARCHITECTURE.md, sim contract).

import type { ActionInstance } from '../core/types';

export type ActionData = Record<string, string | number | boolean | null>;

/** A request to queue an interaction (object, self, item, tile) or a social (person target). */
export interface ActionRequest {
  interactionId: string;
  target: ActionInstance['target'];
  data?: ActionData;
  source?: ActionInstance['source'];
}

/** One context-menu entry; disabled entries carry a readable reason. */
export interface InteractionOption {
  interactionId: string;
  label: string;
  icon: string;
  group: 'object' | 'social' | 'self' | 'move';
  enabled: boolean;
  reason?: string;
  target: ActionInstance['target'];
  data?: ActionData;
}

export type QueueResult = { ok: true; actionId: string } | { ok: false; reason: string };
