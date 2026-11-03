// Elder wrinkle pattern (task B2): the lines must be wide enough to read at head-and-shoulders range, and the broad age
// shading must sit only on the hollows of the face. The baked texture itself is covered in stageBodies.test.ts.
import { describe, expect, it } from 'vitest';
import { ageShading, wrinkleIntensity } from '../../../src/characters/materials';

describe('elder wrinkle pattern', () => {
  it('makes the forehead lines a few millimetres wide with a soft falloff', () => {
    const peak = wrinkleIntensity([0, 0.152, 0.07]);
    expect(peak).toBeGreaterThan(0.8);
    // 4 mm above the middle line it is still well over half strength: the line is about 9 mm wide, not 1.5 mm
    expect(wrinkleIntensity([0, 0.156, 0.07])).toBeGreaterThan(0.5);
    // and it fades out smoothly, leaving a gap before the next line
    expect(wrinkleIntensity([0, 0.1605, 0.07])).toBeLessThan(0.3);
  });

  it('fans crow\'s feet from the outer eye corner and lines under the eye', () => {
    expect(wrinkleIntensity([0.048, 0.101, 0.06])).toBeGreaterThan(0.3); // upper fan line
    expect(wrinkleIntensity([0.052, 0.089, 0.06])).toBeGreaterThan(0.2); // lower fan line
    expect(wrinkleIntensity([0.033, 0.0812, 0.06])).toBeGreaterThan(0.2); // under-eye line
  });

  it('keeps the lines and the broad shading off the back of the head', () => {
    expect(wrinkleIntensity([0, 0.152, -0.07])).toBe(0);
    expect(ageShading([0.032, 0.0835, -0.07])).toBe(0);
    expect(ageShading([0, 0.152, -0.07])).toBe(0);
  });
});
