// The swim-clip probe used while fixing Task F (Milestone 12) is kept as a skipped placeholder; the numbers it
// printed are recorded in dev/ds-tasks/m12/F-progress.md. Removing files is blocked in this workspace, so this file
// stays out of the suite explicitly.
import { describe, it } from 'vitest';

describe.skip('swim clip probe (temporary, see dev/ds-tasks/m12/F-progress.md)', () => {
  it('measured the flat swim pose against the pool water surface', () => {
    // no assertion: the probe only logged the clip's bone heights
  });
});
