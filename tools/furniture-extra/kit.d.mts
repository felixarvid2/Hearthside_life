// Types for the unit tests that import kit.mjs (the tools themselves are plain JavaScript).
import type { NodeIO } from '@gltf-transform/core';

type Vec3 = [number, number, number];

export const COLORS: Record<string, number[]>;
export const EXPORT_SCALE: number;

export class Model {
  constructor(id: string);
  id: string;
  parts: Map<string, Part>;
  part(name: string, pivot?: Vec3): Part;
  box(mat: string, min: Vec3, max: Vec3): void;
  rod(mat: string, p0: Vec3, p1: Vec3, w: number, t?: number): void;
  slab(mat: string, o: Vec3, u: Vec3, v: Vec3, w: Vec3): void;
  cylY(mat: string, cx: number, cz: number, y0: number, y1: number, r0: number, r1?: number, seg?: number): void;
  triangleCount(): number;
  partNames(): string[];
  scaledTriangles(): Array<{ mat: string; p: Vec3[]; n: Vec3[] }>;
  screenQuad(): { centre: Vec3; normal: Vec3; width: number; height: number } | null;
  toGlb(io?: NodeIO): Promise<Uint8Array>;
}

export class Part extends Model {
  name: string;
  pivot: Vec3;
}
