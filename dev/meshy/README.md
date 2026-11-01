# Meshy character test models

Generated with Meshy (https://www.meshy.ai) on 2026-11-01 for the character feasibility test. Not shipped in the game yet.

| File | How it was made | Credits |
|---|---|---|
| `base_male_test.glb` | text-to-3D, man in t-shirt and shorts, short hair | 30 |
| `base_male_underwear.glb` | text-to-3D, bald man in boxer briefs | 30 |
| `base_female_underwear.glb` | text-to-image (`base_female_reference.png`) then image-to-3D, bald woman in tank top and bike shorts | 3 + 30 |

All are single textured meshes (~20k triangles, about 3 MB), unrigged, in T-pose. Text-to-3D ignored parts of the
prompt for the female body twice (long hair, fantasy clothing; 40 credits lost); generating a reference image first
and then using image-to-3D gives much better control and is the recommended route.
