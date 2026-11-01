// One-off: splice freshly generated tables into docs/CONTENT_STATUS.md, keeping the hand-written header and assets section.
import { readFileSync, writeFileSync } from 'node:fs';

const old = readFileSync('docs/CONTENT_STATUS.md', 'utf8');
const gen = readFileSync('dev/ds-tasks/logs/content-status-new.md', 'utf8');
const tables = gen.slice(gen.indexOf('### Buy-mode'));
const assets = old.slice(old.indexOf('## Assets and art status'));
const head = `# Hearthside Life - Content status

Generated with \`npm run content:check -- --markdown\` (tools/content-report.ts). Counts are **distinct designs**; palettes, swatches and colours are variants and never counted as designs. Entries with status \`dev\` are not selectable in the game and are not counted toward targets.

Milestone 1 minimums (12 wall finishes, 8 floors, 15 furniture designs, 8 hairstyles, 12 garments) are met, as are the Milestone 2 content minimums (48 wall finishes, 32 floors, 60 furniture designs, plus at least 6 doors and 8 windows), the Milestone 3 character minimums (24 hairstyles, 48 garments, 12 accessories, 20 traits), the Milestone 4 furniture minimum (100 distinct furniture designs), the Milestone 5 social minimum (24 social interactions) and the Milestone 6 career minimum (6 careers with 10 levels each, 10 ready skills and 6 aspirations). Full-project targets are delivered in Milestone 10.

`;
writeFileSync('docs/CONTENT_STATUS.md', head + tables.trimEnd() + '\n\n' + assets);
