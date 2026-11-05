// Milestone 12 (Task F): the pool renderer places swimmers by lifting their root over the water plane because the
// shared swim clips already lie the body flat around the root. This guards that assumption: a clip that stood the
// character up (or dropped it) would make the fixed lift wrong again.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

describe('swim animation clips', () => {
  it('lie the body flat around the root, so the renderer lifts the root instead of sinking a standing body', async () => {
    const buf = readFileSync('public/assets/characters/anims_1.glb');
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const gltf = await new Promise<any>((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
    for (const name of ['Swim_Fwd_Loop', 'Swim_Idle_Loop']) {
      const clip = gltf.animations.find((c: any) => c.name === name);
      expect(clip, name).toBeDefined();
      const mixer = new THREE.AnimationMixer(gltf.scene);
      mixer.clipAction(clip).play();
      for (const f of [0, 0.5]) {
        mixer.setTime(clip.duration * f);
        gltf.scene.updateMatrixWorld(true);
        const at = (bone: string) => {
          const o = gltf.scene.getObjectByName(bone);
          expect(o, `${name} ${bone}`).toBeDefined();
          const v = new THREE.Vector3();
          o!.getWorldPosition(v);
          return v.y;
        };
        const head = at('Head'), pelvis = at('pelvis'), hand = at('hand_l'), foot = at('foot_l');
        const all = [head, pelvis, hand, foot];
        // A swim/float pose is a flat, waterline body: nothing towers over the root (a standing head would be
        // ~1.6 m up) and the lowest limb stays within a body's reach below it (the old standing-height sink put
        // the whole skeleton around -0.9 m).
        expect(Math.max(...all)).toBeLessThan(0.6);
        expect(Math.min(...all)).toBeGreaterThan(-1.3);
        // Head and pelvis sit around the root (the float clip treads water, so the pelvis dips a little further),
        // not at standing height.
        expect(head).toBeLessThan(0.4);
        expect(pelvis).toBeGreaterThan(-0.6);
      }
    }
  });
});
