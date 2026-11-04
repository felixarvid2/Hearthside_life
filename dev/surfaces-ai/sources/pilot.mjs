// Pilot sources: prove the FLUX.2 -> build -> painter pipeline end to end (motif, mural and material).
export default [
  { id: 'motif-peony', kind: 'motif', prompt: 'a peony flower head with two leaves, bold graphic silhouette with a few white petal lines cut out' },
  { id: 'motif-rocket', kind: 'motif', prompt: 'a cartoon rocket ship with a round window and three fins, flames below, side view, simple bold silhouette with a few white cut-out details' },
  { id: 'mural-misty-pines', kind: 'mural', prompt: 'layered misty pine forest hills in receding ridges, soft fog between the layers, calm and quiet, black and white tonal painting' },
  { id: 'paper-linen', kind: 'material', prompt: 'fine linen-textured wallpaper paper, very low contrast, subtle woven thread structure, almost uniform mid grey', build: { std: 0.08 } },
];
