import { NodeIO } from '@gltf-transform/core';
// usage: node dev/meshy/inspect.mjs file.glb  (prints nodes, mesh bounds, textures, materials)
const io = new NodeIO();
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
console.log('scenes', root.listScenes().length, 'nodes', root.listNodes().map(n=>[n.getName(), n.getTranslation(), n.getRotation(), n.getScale(), !!n.getMesh()]));
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
  const pos = p.getAttribute('POSITION'); 
  console.log(m.getName(), 'attrs', p.listSemantics(), 'count', pos.getCount(), 'idx', p.getIndices()?.getCount()/3, 'min', pos.getMin([]), 'max', pos.getMax([]));
}
for (const t of root.listTextures()) console.log('tex', t.getName(), t.getMimeType(), t.getSize(), t.getImage().length);
for (const m of root.listMaterials()) console.log('mat', m.getName(), m.getBaseColorFactor(), m.getMetallicFactor(), m.getRoughnessFactor(), !!m.getBaseColorTexture(), !!m.getNormalTexture(), !!m.getMetallicRoughnessTexture(), !!m.getEmissiveTexture());
