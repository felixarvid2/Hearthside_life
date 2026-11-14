// Hair under a hat: the hairstyle's own `hat` shape key (tools/characters/blender/hairdeck_to_hair.py) lays the locks above
// the hat's edge down on the scalp while a hat with `flattensHair` is worn.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ModularCharacter } from '../../../../src/characters/modular/ModularCharacter';
import { loadClips, look, realManifest, testCache } from './helpers';

const m = realManifest();

function hatInfluence(c: ModularCharacter): number[] {
  const out: number[] = [];
  c.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const i = mesh.morphTargetDictionary?.hat;
    if (i !== undefined && mesh.morphTargetInfluences) out.push(mesh.morphTargetInfluences[i]!);
  });
  return out;
}

describe('hair under a hat', () => {
  it('the crown hats flatten hair, bands do not', () => {
    const flat = m.garments.filter((g) => g.flattensHair).map((g) => g.id).sort();
    expect(flat).toEqual(['beanie', 'beret', 'bucket_hat', 'cap_baseball', 'fedora', 'sun_hat']);
  });

  it.each(['ubc_male', 'ubc_female'])('%s: the key is on with a cap and off without, or with a headband', async (bodyId) => {
    const c = new ModularCharacter(testCache(), m, await loadClips());
    await c.apply(look({ bodyId, hairId: 'bob_bangs' }), 'everyday', 'adult');
    expect(hatInfluence(c)).toEqual([0]);
    await c.apply(look({ bodyId, hairId: 'bob_bangs', outfits: { everyday: { hat: 'cap_baseball' } } }), 'everyday', 'adult');
    expect(c.equipped().garments.hat).toBe('cap_baseball');
    expect(hatInfluence(c)).toEqual([1]);
    await c.apply(look({ bodyId, hairId: 'bob_bangs', outfits: { everyday: { hat: 'headband' } } }), 'everyday', 'adult');
    expect(hatInfluence(c)).toEqual([0]);
    c.dispose();
  });

  it('every HairDeck hairstyle has the key', async () => {
    const cards = m.hairstyles.filter((h) => h.source.endsWith('/cards.json'));
    expect(cards.length).toBe(56);
    const c = new ModularCharacter(testCache(), m, await loadClips());
    for (const h of cards.slice(0, 8)) {
      await c.apply(look({ hairId: h.id }), 'everyday', 'adult');
      expect(hatInfluence(c).length, h.id).toBe(1);
    }
    c.dispose();
  });
});
