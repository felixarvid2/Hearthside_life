// Public surface of the simulation module.

export { Simulation } from './simulation';
export type { SimulationOptions } from './simulation';
export type { ActionData, ActionRequest, InteractionOption, QueueResult } from './types';
export { applyHouseholdTies, createPerson } from './people';
export { computeMood, moodLabel } from './mood';
export type { MoodResult } from './mood';
export { NEED_LABELS } from './needs';
export { careerInfo, nextShift, shiftText } from './careers';
export type { ShiftWindow } from './careers';
export { skillLevelFor, skillProgress } from './skills';
export { aspirationView } from './aspirations';
export type { AspirationView, ObjectiveView } from './aspirations';
export { bondOf, familyTie, knownPeople, peekRel, statusLabel } from './relationships';
export { isVisitPending, neighbours } from './visitors';
export { actionLabel, BUILTIN_INTERACTIONS } from './context';
export { NEED_DECAY_PER_HOUR, QUEUE_MAX, WALK_TILES_PER_MINUTE } from './tuning';
