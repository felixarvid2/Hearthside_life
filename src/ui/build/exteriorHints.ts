// Tips for the Milestone 9 exterior build tools (fence, roof, terrain), shown in the Build footer until something is drawn.

import type { BuildTool } from '../../game/api';

/** What to do with the fence, roof or terrain tool, for touch or mouse. */
export function exteriorHint(tool: BuildTool, touch: boolean): string {
  switch (tool.kind) {
    case 'fence':
      return touch
        ? 'Drag to draw a fence run or an L, or switch to Rectangle for a loop. Adjust the ends, then confirm. A gate goes on one tapped edge.'
        : 'Drag to draw a fence run or an L; hold Shift to draw a rectangle loop. Let go to build it. A gate design goes on the edge you click. Esc cancels.';
    case 'roof':
      return tool.shape === 'auto'
        ? (touch ? 'Check the auto roof in the preview, then confirm.' : 'Press Build to roof the whole house at once.')
        : (touch ? 'Drag a rectangle over the rooms, adjust the corners, then confirm.' : 'Drag a rectangle over the rooms; let go to build the roof. Esc cancels.');
    case 'terrain':
      return tool.shape === 'rect'
        ? (touch ? 'Drag a rectangle of ground, then confirm.' : 'Drag a rectangle of ground; let go to paint it.')
        : (touch ? 'Tap the ground to paint a tile, then confirm.' : 'Click the ground to paint a tile.');
    default: return '';
  }
}
