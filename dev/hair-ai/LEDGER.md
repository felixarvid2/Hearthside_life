# fal.ai spend ledger (hair pipeline)

Estimated cost per call from the published prices (FLUX schnell 0.003 per megapixel, FLUX dev 0.025 per megapixel, TRELLIS 0.02 per
model). Written by tools/hair-ai/fal.mts before every paid call; the tool refuses to run past the cap (HAIR_AI_BUDGET, default 3.00).
Cached results in dev/hair-ai/raw/ are reused, so rebuilding costs nothing.

| When (UTC) | Model | What | Est. USD |
|---|---|---|---|
| 2026-11-01 07:00 | fal-ai/flux/schnell | pilot image (before this task, by the requester) | 0.003 |
| 2026-11-01 07:00 | fal-ai/trellis | pilot model (before this task, by the requester) | 0.020 |
| 2026-11-01 07:20 | fal-ai/flux/schnell | connectivity test ("test" prompt, 512 px) | 0.003 |
| 2026-11-01 08:20 | fal-ai/flux/schnell | test image fade-crop (1 MP) | 0.003 |
| 2026-11-01 08:20 | fal-ai/flux/schnell | test image waves-long (1 MP) | 0.003 |
| 2026-11-01 08:20 | fal-ai/flux/schnell | test image bun-messy (1 MP) | 0.003 |
| 2026-11-01 08:20 | fal-ai/flux/schnell | test image afro-puffs (1 MP) | 0.003 |
| 2026-11-01 08:21 | fal-ai/flux/schnell | image fade-crop (seed 7, 1 MP) | 0.003 |
| 2026-11-01 08:21 | fal-ai/flux/schnell | image waves-long (seed 7, 1 MP) | 0.003 |
| 2026-11-01 08:21 | fal-ai/flux/schnell | image bun-messy (seed 7, 1 MP) | 0.003 |
| 2026-11-01 08:21 | fal-ai/flux/schnell | image afro-puffs (seed 7, 1 MP) | 0.003 |
| 2026-11-01 08:21 | fal-ai/flux/dev | image fade-crop (seed 7, 1 MP) | 0.025 |
| 2026-11-01 08:22 | fal-ai/flux/dev | image afro-puffs (seed 7, 1 MP) | 0.025 |
| 2026-11-01 08:22 | fal-ai/trellis | 3D model fade-crop | 0.020 |
| 2026-11-01 08:22 | fal-ai/trellis | 3D model waves-long | 0.020 |
| 2026-11-01 08:23 | fal-ai/trellis | 3D model bun-messy | 0.020 |
| 2026-11-01 08:45 | fal-ai/flux/schnell | image quiff (seed 7, 1 MP) | 0.003 |
| 2026-11-01 08:45 | fal-ai/flux/schnell | image slick-back (seed 7, 1 MP) | 0.003 |
| 2026-11-01 08:45 | fal-ai/flux/schnell | image curly-crop (seed 7, 1 MP) | 0.003 |
| 2026-11-01 08:45 | fal-ai/flux/schnell | image locs-medium (seed 7, 1 MP) | 0.003 |
| 2026-11-01 08:45 | fal-ai/flux/schnell | image bob-bangs (seed 7, 1 MP) | 0.003 |
| 2026-11-01 08:45 | fal-ai/flux/schnell | image pixie (seed 7, 1 MP) | 0.003 |
| 2026-11-01 08:45 | fal-ai/flux/schnell | image ponytail-low (seed 7, 1 MP) | 0.003 |
| 2026-11-01 08:45 | fal-ai/flux/schnell | image box-braids (seed 7, 1 MP) | 0.003 |
| 2026-11-01 08:45 | fal-ai/flux/schnell | image layered-shoulder (seed 7, 1 MP) | 0.003 |
| 2026-11-01 08:45 | fal-ai/flux/schnell | image afro-puffs (seed 7, 1 MP) | 0.003 |
| 2026-11-01 08:45 | fal-ai/flux/schnell | image wolf-cut (seed 7, 1 MP) | 0.003 |
| 2026-11-01 08:45 | fal-ai/flux/schnell | image man-bun (seed 7, 1 MP) | 0.003 |
| 2026-11-01 08:45 | fal-ai/flux/schnell | image space-buns (seed 7, 1 MP) | 0.003 |
| 2026-11-01 08:45 | fal-ai/flux/schnell | image pompadour (seed 7, 1 MP) | 0.003 |
| 2026-11-01 08:45 | fal-ai/flux/schnell | image twin-tails (seed 7, 1 MP) | 0.003 |
| 2026-11-01 08:46 | fal-ai/flux/schnell | image afro-puffs (seed 11, 1 MP) | 0.003 |
| 2026-11-01 08:46 | fal-ai/flux/schnell | image ponytail-low (seed 11, 1 MP) | 0.003 |
| 2026-11-01 08:46 | fal-ai/flux/schnell | image afro-puffs (seed 12, 1 MP) | 0.003 |
| 2026-11-01 08:46 | fal-ai/flux/schnell | image ponytail-low (seed 12, 1 MP) | 0.003 |
| 2026-11-01 08:46 | fal-ai/flux/schnell | image afro-puffs (seed 7, 1 MP) | 0.003 |
| 2026-11-01 08:46 | fal-ai/flux/schnell | image ponytail-low (seed 7, 1 MP) | 0.003 |
| 2026-11-01 08:46 | fal-ai/flux/schnell | image afro-puffs (seed 11, 1 MP) | 0.003 |
| 2026-11-01 08:46 | fal-ai/flux/schnell | image ponytail-low (seed 11, 1 MP) | 0.003 |
| 2026-11-01 08:47 | fal-ai/flux/schnell | image ponytail-low (seed 7, 1 MP) | 0.003 |
| 2026-11-01 08:47 | fal-ai/flux/schnell | image afro-puffs (seed 21, 1 MP) | 0.003 |
| 2026-11-01 08:47 | fal-ai/flux/schnell | image afro-puffs (seed 22, 1 MP) | 0.003 |
| 2026-11-01 08:47 | fal-ai/flux/schnell | image afro-puffs (seed 23, 1 MP) | 0.003 |
| 2026-11-01 08:47 | fal-ai/flux/schnell | image afro-puffs (seed 23, 1 MP) | 0.003 |
| 2026-11-01 08:47 | fal-ai/trellis | 3D model quiff | 0.020 |
| 2026-11-01 08:48 | fal-ai/trellis | 3D model slick-back | 0.020 |
| 2026-11-01 08:49 | fal-ai/trellis | 3D model curly-crop | 0.020 |
| 2026-11-01 08:50 | fal-ai/trellis | 3D model locs-medium | 0.020 |
| 2026-11-01 08:50 | fal-ai/trellis | 3D model bob-bangs | 0.020 |
| 2026-11-01 08:51 | fal-ai/trellis | 3D model pixie | 0.020 |
| 2026-11-01 08:51 | fal-ai/trellis | 3D model ponytail-low | 0.020 |
| 2026-11-01 08:52 | fal-ai/trellis | 3D model box-braids | 0.020 |
| 2026-11-01 08:52 | fal-ai/trellis | 3D model layered-shoulder | 0.020 |
| 2026-11-01 08:52 | fal-ai/trellis | 3D model afro-puffs | 0.020 |
| 2026-11-01 08:53 | fal-ai/trellis | 3D model wolf-cut | 0.020 |
| 2026-11-01 08:53 | fal-ai/trellis | 3D model man-bun | 0.020 |
| 2026-11-01 08:53 | fal-ai/trellis | 3D model space-buns | 0.020 |
| 2026-11-01 08:54 | fal-ai/trellis | 3D model pompadour | 0.020 |
| 2026-11-01 08:54 | fal-ai/trellis | 3D model twin-tails | 0.020 |
| 2026-11-01 09:30 | fal-ai/flux/dev | image box-braids (seed 8, 1 MP) | 0.025 |
| 2026-11-01 09:30 | fal-ai/flux/dev | image box-braids (seed 9, 1 MP) | 0.025 |
| 2026-11-01 09:30 | fal-ai/trellis | 3D model box-braids | 0.020 |
