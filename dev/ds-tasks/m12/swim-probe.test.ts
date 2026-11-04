// Throwaway probe (Task F, milestone 12): prints the heights of the swim clip's skeleton so the pool sink can be
// measured against the clip instead of the standing height. Not part of the suite; remove after use.
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

describe('swim probe', () => {
  it('prints the swim clip bone heights', async () => {
    const buf = readFileSync('public/assets/characters/anims_1.glb');
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const gltf = await new Promise<any>((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
    const swim = gltf.animations.find((c: any) => c.name === 'Swim_Fwd_Loop');
    const float = gltf.animations.find((c: any) => c.name === 'Swim_Idle_Loop');
    for (const clip of [swim, float]) {
      if (!clip) continue;
      console.log(`CLIP ${clip.name} duration=${clip.duration}`);
      for (const t of clip.tracks.filter((x: any) => /(Hips|Head|root|Root)\.(position|quaternion)/.test(x.name))) {
        console.log(` TRACK ${t.name} n=${t.values.length}`);
        if (/position/.test(t.name)) {
          const ys = [];
          for (let i = 1; i < t.values.length; i += 3) ys.push(Math.round(t.values[i]! * 1000) / 1000);
          console.log(`  y values ${JSON.stringify(ys.slice(0, 12))}`);
        }
      }
    }
    for (const clip of [swim, float]) {
      if (!clip) continue;
      const scene = gltf.scene;
      const mixer = new THREE.AnimationMixer(scene);
      mixer.clipAction(clip).play();
      mixer.setTime(clip.duration * 0.5);
      scene.updateMatrixWorld(true);
      const bones: THREE.Object3D[] = [];
      scene.traverse((o) => { if ((o as any).isBone) bones.push(o); });
      const report: Record<string, number[]> = {};
      for (const key of ['Hips', 'Spine', 'Head', 'LeftShoulder', 'LeftHand', 'LeftFoot']) {
        const b = bones.find((x) => x.name.toLowerCase().includes(key.toLowerCase()));
        if (b) { const v = new THREE.Vector3(); b.getWorldPosition(v); report[key] = v.toArray().map((n) => Math.round(n * 1000) / 1000); }
      }
      console.log(`POSE ${clip.name} ${JSON.stringify(report)}`);
    }
  });
});
