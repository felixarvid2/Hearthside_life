// Milestone 10 surface catalog: nine files, one per content group, merged here once (surfaces.ts adds the result to
// WALL_DESIGNS and FLOOR_DESIGNS). A content agent only ever edits its own group file.

import type { SurfaceDesign } from '../types';
import { WALLS_A } from './walls-a';
import { WALLS_B } from './walls-b';
import { WALLS_C } from './walls-c';
import { WALLS_D } from './walls-d';
import { WALLS_E } from './walls-e';
import { WALLS_F } from './walls-f';
import { FLOORS_A } from './floors-a';
import { FLOORS_B } from './floors-b';
import { FLOORS_C } from './floors-c';

export const WALL_DESIGNS_3: SurfaceDesign[] = [...WALLS_A, ...WALLS_B, ...WALLS_C, ...WALLS_D, ...WALLS_E, ...WALLS_F];
export const FLOOR_DESIGNS_3: SurfaceDesign[] = [...FLOORS_A, ...FLOORS_B, ...FLOORS_C];
