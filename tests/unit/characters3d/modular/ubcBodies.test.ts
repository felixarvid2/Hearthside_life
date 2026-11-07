// The two real Quaternius base bodies: skin gain, iris tint, brow color and hip retargeting of the shared clips.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ModularCharacter, hexColor } from '../../../../src/characters/modular/ModularCharacter';
import { scaledClipsFor } from '../../../../src/characters/modular/retarget';
import { BODY, loadClips, look, realManifest, testCache } from './helpers';

const m = realManifest();
const bare = (bodyId: string, over: Parameters<typeof look>[0] = {}) => look({ bodyId, hairId: null, outfits: {}, ...over });

/** The skinned meshes' materials of a character by name. */
function materialsNamed(root: THREE.Object3D, name: string): THREE.MeshStandardMaterial[] {
  const out = new Set<THREE.MeshStandardMaterial>();
  root.traverse((o) => {
    const mat = (o as THREE.Mesh).material;
    for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) if (x.name === name) out.add(x as THREE.MeshStandardMaterial);
  });
  return [...out];
}

const close = (a: THREE.Color, b: THREE.Color) => { expect(a.r).toBeCloseTo(b.r, 5); expect(a.g).toBeCloseTo(b.g, 5); expect(a.b).toBeCloseTo(b.b, 5); };

describe.each(['ubc_male', 'ubc_female'])('%s', (id) => {
  const def = m.bodies.find((b) => b.id === id)!;

  it('applies without issues; skin, brows and iris follow the look', async () => {
    const c = new ModularCharacter(testCache(), m, await loadClips());
    await c.apply(bare(id));
    expect(c.issues).toEqual([]);

    const skin = materialsNamed(c.root, def.skinMaterials[0]!);
    expect(skin.length).toBe(1);
    expect(def.skinGain).toBeGreaterThan(0);
    close(skin[0]!.color, hexColor('#c68642').multiplyScalar(def.skinGain!));

    const brows = materialsNamed(c.root, def.browMaterials![0]!);
    expect(brows.length).toBe(1);
    close(brows[0]!.color, hexColor('#222222'));

    const eye = materialsNamed(c.root, def.eyeMaterials![0]!)[0]!;
    expect(eye.customProgramCacheKey()).toContain('modular-iris');
    const shader = { uniforms: {} as Record<string, { value: THREE.Color }>, vertexShader: '', fragmentShader: 'void main() {\n#include <map_fragment>\n}' };
    eye.onBeforeCompile(shader as never, null as never);
    expect(shader.fragmentShader).toContain('uIrisColor');
    const uniform = shader.uniforms.uIrisColor!;
    close(uniform.value, hexColor('#5b4636'));

    await c.apply(bare(id, { colors: { skin: '#ffffff', eyes: '#2a6fdb', hair: '#aa5500', garments: {} } }));
    expect(shader.uniforms.uIrisColor).toBe(uniform); // same uniform object, updated in place
    close(uniform.value, hexColor('#2a6fdb'));
    close(brows[0]!.color, hexColor('#aa5500'));
    close(skin[0]!.color, hexColor('#ffffff').multiplyScalar(def.skinGain!));
    c.dispose();
  });
});

describe('hip retargeting', () => {
  const pelvisY = async (bodyId: string, clips: THREE.AnimationClip[]) => {
    const c = new ModularCharacter(testCache(), m, clips);
    await c.apply(bare(bodyId));
    c.play('walk', { fade: 0 });
    c.update(0);
    c.root.updateMatrixWorld(true);
    const p = c.bone('pelvis')!;
    void p;
    return { c };
  };

  it('scales the pelvis translation of ubc_male by body pelvis / clipPelvisHeight', async () => {
    const clips = await loadClips();
    const c0 = new ModularCharacter(testCache(), m, clips);
    await c0.apply(bare('ubc_male'));
    const ratio = c0.bone('pelvis')!.position.length() / m.rigs[0]!.clipPelvisHeight!;
    expect(ratio).toBeGreaterThan(1.02);
    c0.dispose();

    const walk = clips.find((x) => x.name === 'Walk_Loop')!;
    const track = walk.tracks.find((t) => t.name === 'pelvis.position')!;
    const { c } = await pelvisY('ubc_male', clips);
    expect(c.bone('pelvis')!.position.y).toBeCloseTo(track.values[1]! * ratio, 3);
    c.dispose();

    // a stand-in with the same clips is not scaled
    const s = await pelvisY(BODY, clips);
    expect(s.c.bone('pelvis')!.position.y).toBeCloseTo(track.values[1]!, 3);
    s.c.dispose();
  });

  it('shares scaled clips between characters, with own userData and shared rotation tracks', async () => {
    const clips = await loadClips();
    const map = new Map(clips.map((x) => [x.name, x]));
    const a = scaledClipsFor(map, 1.034), b = scaledClipsFor(map, 1.03401);
    const src = map.get('Walk_Loop')!;
    expect(a.get('Walk_Loop')).toBe(b.get('Walk_Loop'));
    expect(a.get('Walk_Loop')).not.toBe(src);
    expect(a.get('Walk_Loop')!.userData).not.toBe(src.userData);
    const rot = src.tracks.find((t) => t.name.endsWith('.quaternion'))!;
    expect(a.get('Walk_Loop')!.tracks).toContain(rot);
    const pos = src.tracks.find((t) => t.name === 'pelvis.position')!;
    const spos = a.get('Walk_Loop')!.tracks.find((t) => t.name === 'pelvis.position')!;
    expect(spos).not.toBe(pos);
    expect(spos.values[1]).toBeCloseTo(pos.values[1]! * 1.034, 5);
    expect(scaledClipsFor(map, 1).get('Walk_Loop')).toBe(src);
  });

  it('two ubc_male characters use the same scaled clip objects; stand-ins keep the originals', async () => {
    const clips = await loadClips();
    const used = async (bodyId: string) => {
      const c = new ModularCharacter(testCache(), m, clips);
      await c.apply(bare(bodyId));
      c.play('walk', { fade: 0 });
      const clip = (c as unknown as { animator: { mixer: THREE.AnimationMixer; current: { main: THREE.AnimationAction } } }).animator.current.main.getClip();
      c.dispose();
      return clip;
    };
    const [a, b, s] = [await used('ubc_male'), await used('ubc_male'), await used(BODY)];
    expect(a).toBe(b);
    expect(a).not.toBe(clips.find((x) => x.name === a.name));
    expect(s).toBe(clips.find((x) => x.name === 'Walk_Loop'));
  });
});
