# Task A: twelve career tracks

Progress file: `dev/ds-tasks/m11/A-progress.md`.

There are 7 full careers today (`src/content/careers.ts`: culinary, journalism, software, medicine, music, business, landscaping) plus four teen part-time jobs (`partTime`). The brief (section 11) wants twelve tracks with ten levels each. Add these six so every brief track exists: **Education, Visual Arts, Science, Athletics, Design and Architecture, Hospitality** (13 full careers in total).

For each new career:
- Ten levels: title, pay, work days, shift start/end, promotion requirements (performance, skills, days, and a relationship requirement where it fits), like the existing ladders. Pay and hours in line with the existing careers; vary work days (for example Hospitality evenings and weekends, Education weekdays only, Athletics early mornings).
- Main skills per the brief table: Education (charisma, logic), Visual Arts (painting, photography, creativity), Science (logic, programming, research), Athletics (fitness, wellness), Design and Architecture (creativity, handiness), Hospitality (cooking, charisma). Photography, wellness, creativity and research are being made 'ready' by tasks B and C right now; reference them by id. If the validator rejects a promotion on a 'dev' skill while they are not yet ready, put that requirement on the higher levels only and say so in your report.
- Career events (`src/content/careerEvents.ts`): at least two per new career, in the style of the existing ones.
- Work performance rules and optional level rewards as the existing careers have them.
- The career panel, job search (computer / phone), the creator's starting-job list and NPC job assignment (`src/game/neighbourhood.ts`, `src/characters/names.ts`) pick the new careers up; check they render well in portrait (390x844), landscape (844x390) and desktop with 13 careers (scrolling, no overflow). Take screenshots of the job list in all three with your own Playwright script under flock and save them to `dev/ds-tasks/m11/shots/`.
- Update the career aspirations if they list careers explicitly.
- Tests: ladders complete and monotonic in pay; every promotion skill exists; a person can join each new career, work a shift, get paid once and be promoted in a simulated run.
