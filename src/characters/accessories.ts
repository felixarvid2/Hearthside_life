// Head-attached accessories (Milestone 1: glasses and earrings), skinned rigidly to the Head bone and
// moved by the face sculpt morphs that affect their anchors (nose bridge, face width, ear size). Pure module.

import type { AccessoryDef } from '../content/types';
import { EAR, HEAD_SCALE, headToBind } from './headShape';
import type { MeshData, SweepVertex } from './meshData';
import { addVertex, computeSmoothNormals, emptyMesh, sweep, v3 } from './meshData';
import type { Vec3 } from './rig';
import { boneIndex, rigidSkin } from './rig';
import type { BodyTemplate } from './template';

export const ACC_ATTRS = { aAcc: 1 };
export const ACC_MORPHS: readonly string[] = ['noseBridge', 'faceWidth', 'earSize'];

type B = Record<string, number | string | boolean>;
const num = (b: B, k: string, d: number) => (typeof b[k] === 'number' ? (b[k] as number) : d);

/** Builds an accessory mesh (bind space) for a body frame. */
export function buildAccessory(t: BodyTemplate, def: AccessoryDef): MeshData {
  const m = emptyMesh(ACC_ATTRS, ACC_MORPHS);
  const skin = rigidSkin(boneIndex(t.raw, 'Head'));
  const O = t.headOrigin;
  const b = def.build;
  const put = (local: Vec3, morph: Record<string, Vec3>) => (v: SweepVertex) => addVertex(m, headToBind(O, v.p), skin, { aAcc: [0] }, morph, v.n);
  if (def.kind === 'glasses') {
    const size = num(b, 'size', 1);
    const rim = num(b, 'rim', 0.0025);
    const square = b.lens === 'square';
    const z = 0.1055;
    const bridgeM: Record<string, Vec3> = { noseBridge: [0, 0, 0.005 * HEAD_SCALE] };
    for (const side of [1, -1]) {
      const cx = side * 0.0335, cy = 0.0985;
      const path: Vec3[] = [];
      const K = 28;
      for (let k = 0; k <= K; k++) {
        const a = (k / K) * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a);
        const rx = (square ? 0.0185 : 0.0158) * size, ry = (square ? 0.0128 : 0.0152) * size;
        const e = square ? 0.35 : 1;
        const px = Math.sign(c) * Math.pow(Math.abs(c), e) * rx, py = Math.sign(s) * Math.pow(Math.abs(s), e) * ry;
        path.push([cx + px, cy + py, z - 0.004 * (px * side / rx) ** 2]);
      }
      sweep(m, { path, rx: path.map(() => rim), ry: path.map(() => rim * (square ? 1.3 : 1)), segments: 6, closeStart: false, closeEnd: false, up: [0, 0, 1] }, put([cx, cy, z], bridgeM));
      // temple arm back to the ear
      const outer: Vec3 = [side * (0.0335 + 0.018 * size), cy + 0.004, z - 0.006];
      const temple: Vec3[] = [outer, [side * 0.074, cy + 0.006, 0.075], [side * 0.083, cy + 0.003, 0.03], [side * 0.082, cy - 0.004, -0.002], [side * 0.078, cy - 0.018, -0.012]];
      sweep(m, { path: temple, rx: temple.map(() => rim * 0.9), ry: temple.map(() => rim * 1.4), segments: 5, up: [0, 1, 0] }, put(outer, { faceWidth: [side * 0.004 * HEAD_SCALE, 0, 0], noseBridge: [0, 0, 0.002 * HEAD_SCALE] }));
    }
    const bridge: Vec3[] = [[0.017, 0.1, z], [0.008, 0.104, z + 0.002], [0, 0.105, z + 0.0025], [-0.008, 0.104, z + 0.002], [-0.017, 0.1, z]];
    sweep(m, { path: bridge, rx: bridge.map(() => rim), ry: bridge.map(() => rim), segments: 5, up: [0, 1, 0] }, put([0, 0.1, z], bridgeM));
  } else if (def.kind === 'earrings') {
    const style = b.style === 'hoop' ? 'hoop' : 'stud';
    const size = num(b, 'size', 0.004);
    for (const side of [1, -1]) {
      const lobe: Vec3 = [side * (EAR.x + 0.006), EAR.y - EAR.ry * 0.86, EAR.z + 0.006];
      const grow: Vec3 = [side * 0.002 * HEAD_SCALE, -EAR.ry * 0.86 * 0.24 * HEAD_SCALE, 0];
      if (style === 'stud') {
        const path: Vec3[] = [[lobe[0] - side * 0.002, lobe[1], lobe[2]], [lobe[0] + side * 0.002, lobe[1], lobe[2]]];
        sweep(m, { path, rx: [size, size], segments: 8, up: [0, 1, 0], capStart: 2, capEnd: 2 }, put(lobe, { earSize: grow }));
      } else {
        const path: Vec3[] = [];
        for (let k = 0; k <= 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          path.push([lobe[0], lobe[1] - size + Math.cos(a) * size, lobe[2] + Math.sin(a) * size]);
        }
        sweep(m, { path, rx: path.map(() => 0.0014), segments: 6, closeStart: false, closeEnd: false, up: [1, 0, 0] }, put(lobe, { earSize: grow }));
      }
    }
  }
  computeSmoothNormals(m, 1e-7);
  void v3;
  return m;
}
