// Audits glTF/GLB character files: hierarchy, skins (joints, bind matrices, rest pose), morph targets,
// materials, textures, animation clips and sizes. Prints JSON to stdout.
//   node tools/characters/audit-glb.mjs <file.glb|gltf> [...]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'node:fs';
import path from 'node:path';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const r4 = (v) => Math.round(v * 1e7) / 1e7;

async function audit(file) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  const nodes = root.listNodes();
  const skins = root.listSkins().map((s) => {
    const joints = s.listJoints();
    const ibm = s.getInverseBindMatrices();
    const parentOf = new Map();
    for (const n of nodes) for (const c of n.listChildren()) parentOf.set(c, n);
    return {
      name: s.getName(), jointCount: joints.length,
      joints: joints.map((j, i) => ({
        name: j.getName(), parent: parentOf.get(j)?.getName() ?? null,
        t: j.getTranslation().map(r4), r: j.getRotation().map(r4), s: j.getScale().map(r4),
        ibmT: ibm ? [12, 13, 14].map((k) => r4(ibm.getElement(i, [])[k])) : null,
      })),
    };
  });
  const meshes = root.listMeshes().map((m) => ({
    name: m.getName(),
    primitives: m.listPrimitives().map((p) => ({
      verts: p.getAttribute('POSITION')?.getCount() ?? 0,
      tris: (p.getIndices()?.getCount() ?? 0) / 3,
      attrs: p.listSemantics(),
      material: p.getMaterial()?.getName() ?? null,
      morphTargets: p.listTargets().length,
    })),
    morphNames: m.getExtras()?.targetNames ?? [],
  }));
  const meshNodes = nodes.filter((n) => n.getMesh()).map((n) => ({ node: n.getName(), mesh: n.getMesh().getName(), skin: n.getSkin()?.getName() ?? null, t: n.getTranslation().map(r4), r: n.getRotation().map(r4), s: n.getScale().map(r4) }));
  const materials = root.listMaterials().map((m) => ({ name: m.getName(), baseColor: m.getBaseColorFactor().map(r4), baseColorTexture: m.getBaseColorTexture()?.getURI() || m.getBaseColorTexture()?.getName() || null, alphaMode: m.getAlphaMode() }));
  const textures = root.listTextures().map((t) => ({ name: t.getName() || t.getURI(), mime: t.getMimeType(), size: t.getSize(), bytes: t.getImage()?.byteLength ?? 0 }));
  const clips = root.listAnimations().map((a) => {
    let dur = 0; const targets = new Set(); let rootTranslation = false;
    for (const c of a.listChannels()) {
      const inp = c.getSampler()?.getInput(); if (inp) dur = Math.max(dur, inp.getMax([])[0]);
      targets.add(c.getTargetPath());
      if (c.getTargetPath() === 'translation' && /root|pelvis|hips/i.test(c.getTargetNode()?.getName() ?? '')) rootTranslation = true;
    }
    return { name: a.getName(), duration: r4(dur), channels: a.listChannels().length, paths: [...targets], rootOrPelvisTranslation: rootTranslation };
  });
  return { file, bytes: fs.statSync(file).size, nodes: nodes.length, scenes: root.listScenes().map((s) => s.getName()), meshNodes, meshes, skins, materials, textures, clips };
}

const out = [];
for (const f of process.argv.slice(2)) out.push(await audit(path.resolve(f)));
process.stdout.write(JSON.stringify(out, null, 1));
