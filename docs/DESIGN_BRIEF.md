# Hearthside Life — Expanded Game Design and Claude Development Brief

**Revision:** Expanded project vision, character creator, construction, and content catalogs.
**Language:** All game text, menus, notifications, documentation, and code identifiers must be in English.
**Platform:** Browser game for mobile, tablet, and desktop.
**Technology:** Three.js, TypeScript, and Vite.
**Working title:** Hearthside Life. The title can change later.

## How to use this document

Read this entire document before changing the project. Treat it as the design direction and long-term implementation brief for a substantial original life simulation.

Implement working game systems and usable content. Write the code, create or integrate the assets, run the project, and verify the result. A design document, static mockup, or collection of nonfunctional menus does not satisfy an implementation milestone.

The complete vision is intentionally large. Deliver it through the ordered milestones in Section 26. Preserve the full vision in the roadmap while completing one dependable, playable milestone at a time. Do not silently shrink the project back to a tiny demo, replace the character creator with fixed premade people, or treat the large catalogs as recolors of three basic objects.

When beginning in a new project, give a short implementation plan and start Milestone 1. In an existing project, inspect the current implementation, identify the next incomplete milestone, preserve working systems, and continue from there.

---

## 1. Role, inspiration, and game identity

Act as a gameplay programmer, simulation designer, Three.js developer, technical artist, and mobile interface designer.

Create an original single-player life simulation inspired by the household control of The Sims 1/2, expressive character creation, detailed home decoration, and emergent social stories associated with the wider life-simulation genre, including Paralives, inZOI, and Tiny Life.

Build an independent visual identity, original characters and names, original interface, and original or properly licensed assets.

The experience should combine:
- A deep character creator.
- Direct control of a household with meaningful autonomous behavior.
- A flexible home editor with a large decoration catalog.
- Careers, skills, household finances, and long-term ambitions.
- Friendship, attraction, romance, conflict, family, and memories.
- A neighborhood with other households and useful public venues.
- Comfortable touch interaction in portrait and landscape.

The player should be able to enjoy several different play styles: building beautiful homes, managing a family, pursuing careers, creating social drama, developing creative hobbies, or experimenting in a sandbox.

Use a stylized 3D dollhouse presentation, with appealing proportions, readable silhouettes, coherent materials, expressive animation, and a rotatable orthographic camera. Favor clarity and a consistent art style.

## 2. Full-project scope and content targets

The following are targets for the completed project, not features to claim at the first milestone.

| Area | Completed-project target |
| --- | --- |
| Household | Up to 8 controllable household members |
| Life stages | Baby, toddler, child, teen, young adult, adult, elder |
| Character creation | Editable face, body, hair, clothing, accessories, personality, preferences, household ties |
| Hair | At least 60 distinct hairstyles and 16 facial-hair styles |
| Clothing | At least 132 distinct garments and 32 accessories |
| Personality | At least 40 traits and 12 aspirations |
| Careers | 12 career tracks, each with 10 progression levels |
| Skills | 16 skills with practical uses and progression |
| Wall finishes | 360 distinct wallpaper, paint, and wall-surface designs |
| Flooring | 200 distinct floor designs |
| Furniture and decoration | 560 distinct catalog designs |
| Doors and windows | 48 doors and 64 windows |
| Construction | 3 above-ground floors, roofs, stairs, balconies, fences, gardens |
| Additional exterior parts | 24 fences, 12 gates, 12 staircase designs, 12 roof styles |
| Neighborhood | At least 12 lots, including residential lots and at least 6 public venues |
| Social play | At least 40 meaningful social interactions |
| Activities | At least 40 usable household, hobby, and venue activities |
| Saving | Multiple households, at least 5 named save slots, autosave, import/export |
| Devices | Complete touch workflows in portrait and landscape, plus desktop controls |

A garment or furniture design can belong to multiple tagged categories, but it counts only once toward its total. A social interaction can also count as an activity only when explicitly identified; do not pad both lists to imply more unique content.

Distinguish the complete project, the current implementation, and later optional expansions in all documentation. Multiplayer, a fully continuous open world, vehicles with traffic simulation, basements, and unrestricted terrain sculpting are optional expansions beyond the required plan.

## 3. Gameplay pillars and progression

The central loop is:
1. Create a person or household.
2. Choose a home or empty lot.
3. Meet daily needs and develop routines.
4. Work, study, practice skills, and pursue aspirations.
5. Build friendships and manage family or romantic relationships.
6. Earn and spend money on a better home and lifestyle.
7. Experience consequences, memories, and new opportunities over time.

Provide three starting modes:
- **Guided Start:** A furnished house, a short tutorial, and a manageable starting balance.
- **Create a Household:** Use the character creator, choose relationships, and select a home.
- **Build Sandbox:** Unlimited building funds, configurable simulation, and access to the catalog.

Normal progression should include meaningful tradeoffs. A cheap bed occupies less money but restores energy more slowly. A demanding job pays better but leaves less time for friends. A large home costs more to furnish and maintain.

Avoid requiring repetitive interaction spam. Support sensible routine autonomy, queued commands, and clear feedback. Keep the experience open-ended rather than imposing a single victory condition.

## 4. Technical architecture and source organization

Use Three.js for rendering, animation, cameras, and world picking. Use TypeScript with strict checking and Vite for development and production builds.

Use HTML/CSS interface panels above the canvas. A lightweight UI framework is acceptable if it makes the project easier to maintain, but keep simulation independent of UI components and rendering.

The game must run locally in the browser without an account, server, paid runtime API, or external AI service for ordinary gameplay. Authored dialogue, event rules, and seeded simulation are sufficient.

Separate these responsibilities:
- **Core:** Authoritative state, clock, commands, events, seeded randomness, IDs.
- **Simulation:** Needs, actions, autonomy, skills, careers, relationships, aging.
- **World:** Neighborhood, lots, floors, walls, rooms, objects, navigation.
- **Characters:** Appearance definitions, rigs, clothing, animations, creator.
- **Building:** Placement tools, validation, transactions, undo/redo, room templates.
- **Rendering:** Scene synchronization, camera, materials, lighting, visibility, asset loading.
- **UI:** HUD, contextual menus, catalogs, creator panels, touch input, accessibility.
- **Persistence:** IndexedDB, schemas, migrations, recovery, import/export.
- **Content:** Validated definitions and manifests for all catalogs.
- **Tools:** Asset previews, content validation, thumbnail generation, developer inspection.

Use stable IDs for households, people, lots, rooms, walls, items, styles, careers, relationships, and events. Authoritative state must be serializable without Three.js objects, DOM nodes, closures, or live promises.

Define events and commands that can be tested without rendering. Prefer readable modules and explicit state transitions over a monolithic game file or an unnecessarily complex framework.

Pin dependency versions, include a lockfile, and use current official documentation when implementing APIs.

## 5. Visual direction and asset production

Use a warm, detailed miniature-world style. Homes should feel furnished and lived in. Characters should look like stylized people with recognizable faces and clothing.

Develop a shared art guide covering:
- Character proportions and facial readability.
- Furniture scale and grid dimensions.
- Texture scale and acceptable detail density.
- Palette, lighting, shadows, and selection indicators.
- Thumbnail framing and catalog presentation.
- Animation timing and interaction alignment.

Use one consistent measurement convention, initially one world unit per meter and one building tile per meter. Keep wall height, door openings, counter heights, chair seats, beds, and character interaction anchors consistent.

Procedural geometry is appropriate for modular construction and selected furniture families. Use rigged, skinned models for the developed character system. If Blender or other asset tools are available, use reproducible scripts and export runtime GLB files.

Use original procedural textures for patterns where practical. Author curated presets rather than presenting raw random noise as finished wallpaper. Every visible default asset should fit the same art direction.

Maintain source files where available, exported runtime assets, a manifest, and license/attribution information. Use recognizable temporary art during early systems work, and mark it honestly. Temporary shapes must not become the final character creator.

## 6. Character creator — a major game system

The character creator is required, not an optional late extra. Provide a usable version in Milestone 1 and deepen it through later milestones.

### 6.1 Creation flow

Use these steps:
1. Identity.
2. Face and body.
3. Hair and grooming.
4. Clothing and accessories.
5. Personality and preferences.
6. Household and relationships.
7. Review and confirm.

Allow moving between steps without losing edits. Show a live animated 3D preview with rotate, zoom, front/side/back views, and a face close-up.

In portrait, place the preview above an expandable editing sheet. In landscape, place it beside the editing panel. Both orientations must support every editing category.

Offer undo/redo, reset category, randomize category, randomize all, and lock controls so randomization preserves selected features. Provide named presets and copy/paste appearance between compatible characters.

Creation must not require precision dragging on a face. Sliders, presets, labeled controls, numeric or stepped adjustment, and clear reset actions must work on a phone.

### 6.2 Identity and life stage

Support:
- First and last name.
- Pronouns.
- Life stage, once that stage is implemented.
- Voice preset and pitch range.
- Walking-style preset, once matching animations are available.
- Adult romantic preferences.
- An optional short biography.

Separate identity, body presentation, clothing, and hairstyle choices. Do not lock ordinary hairstyles or clothes behind a gender selection.

Use age-appropriate appearance assets and available activities. The final seven life stages need genuinely different proportions, supported rigs or carefully validated rig variants, animations, and interactions. Scaling an adult down without adapting behavior and anchors is insufficient.

The first milestone supports adult creation. The life-stage milestone expands the creator and household rules.

### 6.3 Face customization

Completed-project targets:
- At least 24 curated face presets.
- At least 16 meaningful editable facial parameters.
- Eye shape and spacing, brows, nose width/length, mouth width/fullness, jaw width, chin, cheek shape, and face length.
- Eye colors, including a custom color control.
- Skin-tone presets and a broad color adjustment range.
- Freckles, selected facial marks, makeup options, and facial-hair selection.

Keep parameter ranges visually stable. Use morph targets or an equivalent controlled deformation system. Facial features must remain attached and coherent across edits and animation.

Skin and face variation should be visible in the preview and under normal game lighting. Avoid a single default face with differently colored hair as the entire system.

### 6.4 Body customization

Provide at least 12 body presets with controlled adjustments for height, body build, shoulder width, waist, hips, and limb proportions where the rig and clothing support them.

Use bounded, tested ranges. Body controls must update clothing fit, animation retargeting, interaction anchors, and collision assumptions. A shorter character still needs to sit on a chair correctly.

Implement height variation after the fixed-height interaction system works. Use a compatible rig, placement offsets, and selective IK or authored corrections where appropriate. Do not make a slider appear functional if it only stretches a visible mesh while breaking every interaction.

### 6.5 Hair and grooming

Target 60 distinct hairstyles across short, medium, long, tied, curly, coily, braided, and shaved styles, plus 16 facial-hair styles.

Support hair-color presets and a custom color control. Multiple material regions, such as roots or highlights, may be added when supported by the assets.

Use attachment anchors, scalp coverage, and compatibility checks. Hats may replace, compress, or hide appropriate hair sections using authored rules. Prevent conspicuous clipping with the head, face, shoulders, and common outfits.

### 6.6 Clothing catalog and outfit slots

The completed clothing catalog contains at least:

| Clothing group | Distinct garment target |
| --- | ---: |
| Tops | 40 |
| Bottoms | 28 |
| Full-body outfits | 24 |
| Outerwear | 16 |
| Footwear | 24 |
| **Total garments** | **132** |

Add at least 32 distinct accessories, including glasses, hats, jewelry, bags, and suitable wearable details.

Provide outfit slots for Everyday, Formal, Work, Athletic, Sleepwear, and Swimwear. Garments may be tagged for several slots, but never count the same garment twice.

Support:
- Multiple outfits in a slot.
- Compatible layering and automatic conflict resolution.
- Material/color regions where available.
- Pattern selection on supported garments.
- Full-outfit presets.
- A wardrobe interaction for editing outfits after moving in.

Use a common skeleton or explicitly compatible rigs. Clothing must deform with the character. Add body-section hiding or equivalent authored rules under covered clothing, without exposing holes in other outfits.

Validate compatibility with body presets, sitting, walking, sleeping, and work animations. Color swaps do not count as additional garment designs.

### 6.7 Personality and aspirations

Offer three core personality traits per adult and one primary aspiration.

Target at least 40 traits across:
- Social behavior.
- Organization and cleanliness.
- Activity and energy.
- Creativity and curiosity.
- Food and leisure preferences.
- Ambition and lifestyle.

Examples include Outgoing, Reserved, Neat, Messy, Ambitious, Relaxed, Creative, Practical, Bookish, Athletic, Cheerful, Hot-Tempered, Patient, Family-Oriented, Foodie, and Night Owl.

Define at least 12 aspirations covering family, friendship, romance, knowledge, cooking, art, music, fitness, technology, wealth, career achievement, and home design.

Every trait needs at least one implemented behavioral or progression effect, such as autonomy weighting, social preference, skill learning, reaction, or need pattern. Every aspiration needs stages, explicit objectives, progress tracking, and a reward.

Add likes/dislikes for activities, music, decor styles, foods, and selected conversation topics. Conflicting traits should be validated and explained.

### 6.8 Household creation and templates

Allow adding, removing, duplicating, and reordering people up to the household limit. Set eligible parent/child, sibling, partner, spouse, roommate, and unrelated relationships.

Validate family ties, age-stage rules, and contradictory relationships. Provide a family tree view. Require an eligible caregiver for a household that contains dependent young children.

Save appearance presets and household templates locally. Import/export presets and templates using versioned JSON, with clear handling when an asset pack is missing.

Confirming creation must create actual playable people with the selected appearance, traits, relationships, and outfit data.

## 7. Household simulation, life stages, and family

Support up to eight household members in the full project. Display portraits, current needs, location, and availability. Allow switching the selected person without interrupting their queued actions.

Develop life stages in this order: adults first, children and teens next, then babies/toddlers and elders, with young adults as a separate supported stage in the complete system.

Include:
- Configurable aging: off, long, normal, and custom.
- Birthdays and transitions between implemented stages.
- School schedules, homework, and age-appropriate skills.
- Care routines for young dependents.
- Adoption and family expansion through eligible adult household interactions.
- Later pregnancy and birth events if their full state and animation requirements are implemented.
- Moving in/out and household splitting.
- Family memories and relationship history.
- Optional elder end-of-life events and an aging-off setting.

Do not apply adult career, romance, or object rules blindly to children. Adult romance is available to young adults, adults, and elders, subject to eligible relationships and preferences.

Changing a life stage must preserve identity and family history while migrating appearance, outfits, skills, and available interactions. If a stage or asset is unfinished, do not expose a broken transition.

## 8. Needs, moods, autonomy, and action queues

Use six primary needs on a 0–100 scale: Hunger, Energy, Hygiene, Bladder, Fun, and Social. Add Comfort and Environment as contextual influences instead of duplicating all six primary systems.

Need decay depends on simulation time, activity, traits, life stage, and relevant object quality. Mood modifiers come from recent events, surroundings, relationships, and needs.

Provide:
- Pause, normal, fast, and very fast speed.
- Visible action queues with cancel and reorder where appropriate.
- An autonomy toggle and configurable autonomy intensity.
- Clear current-action labels and progress.
- Brief failure reasons for unavailable actions.

Player commands override ordinary autonomous choices. Autonomy should consider urgency, distance, target availability, money, preferences, social context, recent repetition, and whether an action would interrupt something important.

Use utility scoring or another understandable decision system. Add cooldowns and hysteresis so characters do not oscillate between equally attractive actions.

Each action has explicit phases: validate, reserve, route, prepare, perform, apply effects, clean up. Cancellation and failure must have defined effects in every phase.

Reserve specific usable slots instead of whole categories of furniture. Revalidate before starting an activity. Always release reservations after failure, object removal, household changes, or cancellation.

Restoring hunger requires a real food interaction. Sitting requires reaching a valid chair approach. A conversation requires an available partner. Avoid remote stat changes disconnected from world actions.

## 9. Daily activities, objects, and household routines

Build at least 40 genuinely usable activities across the home and venues, with appropriate animation, duration, effects, prerequisites, and feedback.

Include these functional groups:
- **Food:** Quick snack, cook a meal, serve portions, store leftovers, eat, wash dishes.
- **Rest:** Sleep, nap, sit, relax, read in bed where supported.
- **Bathroom:** Toilet, wash hands, shower, bath, brush teeth.
- **Leisure:** Television, games, music, books, computer games.
- **Skills:** Study, practice programming, paint, play an instrument, exercise.
- **Housework:** Clean surfaces, empty bins, repair, upgrade selected objects.
- **Garden:** Plant, water, tend, harvest, arrange outdoor spaces.
- **Family:** Help with homework, read together, care for a toddler, celebrate birthdays.
- **Social:** Invite visitors, share a meal, host a party, go on a date.
- **Creative income:** Sell paintings, write a book, complete freelance work.

Create interaction chains. Cooking may require a fridge, clear counter, stove, and accessible serving location. A failed chain releases all reservations safely.

Food has portions, ownership where relevant, storage state, and freshness. Different dishes affect cost, preparation time, skill growth, and satisfaction.

Objects can become dirty or break after the underlying interactions work. Cleaning and repairs must use real actions. Failed repairs and fire events belong to a later, configurable household-events layer.

Household routines may suggest breakfast, work departure, homework, and bedtime, while allowing the player to override them. Avoid identical automatic schedules for every personality.

## 10. Relationships, conversations, and emergent stories

Store directed relationships: A's opinion of B may differ from B's opinion of A.

Track:
- Familiarity.
- Friendship.
- Trust.
- Adult romantic interest.
- Compatibility derived from traits and preferences.
- Important memories.
- Explicit shared relationship statuses.

Use at least 40 social interactions across introductions, casual conversation, humor, support, conflict, reconciliation, family, friendship, and adult romance.

Examples include Introduce, Chat, Ask About Day, Discuss Interests, Tell Joke, Compliment, Share News, Give Gift, Offer Help, Comfort, Apologize, Criticize, Argue, Insult, Invite Over, Become Close Friends, Flirt, Ask on Date, Confess Attraction, Ask to Be Partners, Propose, and Break Up.

Outcomes depend on history, needs, mood, traits, familiarity, topic preferences, setting, and seeded randomness. Resolve a result once at the appropriate simulation step, not repeatedly during rendering.

Shared status changes require an accepted interaction. Show why an option is unavailable where practical. Repeated flirting or jokes should not reliably bypass context through spam.

Include authored dialogue snippets, topic icons, thought bubbles, and a concise event feed. Avoid requiring an external language-model API.

### Conversation coordination

A conversation needs compatible participant availability, approach positions, facing, and reservations. Support two-person conversations first, then small groups.

Cancel or suspend safely when a participant leaves for work, needs an urgent interruption, changes lots, or becomes unavailable. Group membership changes must not strand reserved people.

### Memories and relationship consequences

Memories include meeting, a great date, a serious argument, receiving help, betrayal, engagement, marriage, breakup, and major family events.

Memories modify behavior for defined durations or remain as historical milestones. Keep storage bounded by summarizing low-importance repetitions and preserving major events.

Support friends, close friends, rivals, partners, engaged partners, spouses, ex-partners, and relevant family ties. Model expectations such as exclusivity explicitly before implementing jealousy.

### Invitations and social events

Include meals with friends, house parties, birthdays, dates, and weddings as later social-event types. Events need invitations, a schedule, guest arrivals/departures, goals, and results.

Avoid generating a neighborhood-wide chain of random disasters. Major story events should follow visible conditions and player-configurable settings.

## 11. Careers, school, and skills

Provide twelve career tracks in the completed project, with ten progression levels each.

| Career | Main skills or requirements |
| --- | --- |
| Culinary | Cooking, Baking, social confidence |
| Technology | Programming, Logic, Handiness |
| Business | Charisma, Writing, Logic |
| Healthcare | Logic, care-related tasks, reliable attendance |
| Education | Charisma, Logic, mentoring |
| Visual Arts | Painting, Photography, Creativity |
| Music | Music, Charisma, regular practice |
| Science | Logic, Programming, research tasks |
| Athletics | Fitness, Wellness, discipline |
| Design and Architecture | Creativity, Handiness, design assignments |
| Hospitality | Cooking, Charisma, customer interactions |
| Media and Writing | Writing, Photography, Charisma |

Each career level has a title, pay, work days, shift start/end, promotion requirements, performance rules, and optional rewards. Define the full ten-level ladder when that career is implemented.

Initially use off-lot workplaces. A character routes to an exit, enters an explicit at-work state, and returns after the shift. Show location, shift progress, expected pay, and lateness.

Distinguish completed, partial, and missed shifts. Define how missed work affects performance and employment. Promotion requirements should be visible and achievable through actual activities.

Later add a few playable assignments or venue-based career tasks. Fully simulated workplaces for every career are an optional expansion, not a prerequisite for twelve functional career tracks.

The sixteen skills are Cooking, Baking, Logic, Programming, Handiness, Gardening, Painting, Music, Writing, Photography, Charisma, Fitness, Wellness, Fishing, Creativity, and Research.

Each skill needs ten levels, real practice activities, visible progression, and at least a few useful unlocks or quality improvements. Shared activities may train related skills at different rates; avoid multiplying identical progress bars without meaningful distinctions.

Add freelance programming, writing, photography, art sales, and harvest sales after the basic economy works.

School has attendance, performance, homework, and holidays where supported. Keep childhood progression separate from adult careers.

## 12. Economy, ownership, and long-term goals

Use shared household funds, with a clear ledger. Track wages, purchases, sales, bills, groceries, freelance income, and relevant event expenses.

Include:
- Configurable starting funds based on household setup.
- House purchase or rental arrangements.
- Recurring utility and property/rent bills.
- Grocery and meal costs.
- Furniture and construction costs.
- Object resale and depreciation rules.
- Aspiration rewards and career bonuses.
- Optional loans only after their repayment rules and UI are complete.

Use integer minor currency units internally. A purchase, refund, wage, or bill must be applied exactly once.

Make affordability visible before confirming. Never spend money on a cancelled preview or invalid placement. Selling an owned object and then undoing the sale must restore the correct balance and ownership.

Provide clear pricing tiers: budget, standard, premium, and luxury. Quality affects relevant gameplay such as comfort, durability, efficiency, or skill gain; higher price should not merely change a label.

Balance normal play so an initial household can cover essential needs while still needing choices. Include a separately labeled unlimited-funds sandbox.

## 13. Build mode — construction and home editing

Support empty-lot building and modification of existing homes. Initial supported lot sizes are 24 × 24, 32 × 32, and 48 × 48 tiles. Larger lots can be introduced after performance profiling.

### Walls, rooms, and floors

Provide:
- Draw individual wall segments or continuous wall runs.
- Rectangular room tool.
- Room detection and highlighting.
- Move, resize, duplicate, and delete rooms when structural rules allow.
- Independently paintable sides of shared walls.
- Floor placement, erase, single-tile paint, and room fill.
- Wall height presets with compatible openings and assets.
- Grid display, snapping, measurement, and cost preview.
- Walls-up, walls-down, and camera-aware cutaway modes.

Use shared grid-edge wall records. Store material assignments per side. A room on one side of a wall may have a different finish from its neighbor.

### Openings and structural parts

Target 48 distinct door designs and 64 window designs, including varied sizes, shapes, frames, and uses.

Doors need width, orientation, swing or opening representation, and navigation behavior. Windows need valid wall attachment, correct openings, and appropriate rendering.

Include arches, railings, columns, exterior trims, 24 fence designs, 12 gates, 12 staircase designs, and 12 roof styles in the developed catalog.

Do not represent a door by placing a colored rectangle over a solid wall. Openings must work in geometry, visibility, and navigation.

### Multiple stories and stairs

The completed project supports a ground floor and two upper floors. Provide floor selection, visibility controls, ceilings, balconies, and stairs.

Stairs require valid lower and upper landings, opening clearance, connected navigation, and interaction animations. Validate the entire transition before accepting placement.

Support structural footprints and floor/ceiling relationships. Never leave a staircase visually present but unusable by characters.

### Roofs and exterior tools

Start with automatic roofs, then add adjustable roof type, direction, pitch, overhang, and material. Hide roofs during interior play and support exterior viewing.

Provide paths, patios, garden beds, exterior lighting, fencing, and landscaping. Add pools in the late environment milestone with actual entry/exit and swim behavior.

Deep terrain sculpting and basements remain optional extensions. Flat lots are sufficient for a rich required building system.

## 14. Wall finishes — 360 distinct designs

Build a searchable catalog with at least 360 distinct wall-surface designs. The table below is the content allocation.

| Wall-finish family | Distinct designs |
| --- | ---: |
| Plain paint, plaster, and subtle textured surfaces | 28 |
| Stripes, checks, and gingham | 24 |
| Geometric and contemporary patterns | 32 |
| Floral patterns | 32 |
| Botanical and nature patterns | 24 |
| Vintage and Art Deco | 24 |
| Children's and playful patterns | 24 |
| Wood panels, wainscoting, and beadboard | 24 |
| Ceramic, mosaic, and decorative wall tiles | 36 |
| Brick and stone surfaces | 32 |
| Concrete, industrial, and weathered surfaces | 20 |
| Luxury fabrics, metallic details, and damask | 20 |
| Murals and feature-wall designs | 20 |
| Themed, rustic, coastal, and eclectic designs | 20 |
| **Total distinct wall finishes** | **360** |

### What counts as a design

A design needs a visibly distinguishable pattern layout, surface structure, panel construction, mural, or material treatment. Several color palettes on the same stripe layout are variants of one design.

For each suitable design, target at least eight curated palette variants, including light, dark, neutral, and accent options. This can provide up to 2,880 wall-finish combinations without pretending they are 2,880 unique patterns.

Art-directed murals may retain a fixed palette when recoloring damages the artwork. Explain palette limits in data rather than fabricating meaningless swatches.

### Material controls and application

Support:
- Single wall-side painting.
- All interior wall sides of a selected room.
- Contiguous wall-run fill where applicable.
- Eyedropper and recently used finishes.
- Favorites, search, style, room, color, and price filters.
- Live in-world preview before committing.
- Pattern scale presets and orientation where appropriate.
- Border, lower panel, or trim combinations for supported designs.

Use coherent texture scale across wall segments. Keep patterns aligned along a wall run, including around openings. Murals need explicit placement anchors and repeat rules.

Save design ID, palette, supported scale, orientation, and any trim configuration. Avoid storing only a renderer material reference.

Include several cohesive decor packs: Modern Minimal, Cozy Cottage, Mid-Century, Classic Townhouse, Industrial Loft, Coastal, Art Deco, Kids' Storybook, Botanical, and Eclectic Color.

## 15. Flooring — 200 distinct designs

Provide at least 200 distinct floor designs.

| Flooring family | Distinct designs |
| --- | ---: |
| Wooden planks and boards | 40 |
| Parquet and decorative wood layouts | 24 |
| Laminate and vinyl | 20 |
| Ceramic, porcelain, and mosaic tiles | 32 |
| Stone, marble, and terrazzo | 24 |
| Carpets and textile floors | 24 |
| Concrete and industrial floors | 12 |
| Exterior paving, decking, gravel, and paths | 24 |
| **Total distinct floor designs** | **200** |

Offer at least six appropriate palette/material variants per design where meaningful. Distinguish surface design from hue changes.

Support room fill, individual tiles, rectangular paint, rotation, eyedropper, and undo/redo. Wood grain and tile proportions must remain consistent.

Rugs are separate placeable items. They must support correct depth ordering and placement under furniture without incorrectly blocking walking.

Coordinate flooring and wallpaper packs, but allow mixing styles. Include both inexpensive everyday materials and high-end finishes.

## 16. Buy mode — 560 distinct furniture and decor designs

The completed catalog should contain at least:

| Catalog category | Distinct designs |
| --- | ---: |
| Seating: chairs, sofas, armchairs, stools | 64 |
| Beds and bedroom furniture | 40 |
| Tables and desks | 48 |
| Storage, shelves, and cabinets | 48 |
| Kitchen appliances, counters, and units | 56 |
| Bathroom fixtures | 36 |
| Lighting | 64 |
| Electronics | 28 |
| Skill and hobby objects | 36 |
| Decoration, rugs, curtains, and wall art | 64 |
| Garden and outdoor furniture | 40 |
| Baby and child furniture | 36 |
| **Total distinct catalog designs** | **560** |

A design must differ in meaningful geometry, silhouette, construction, or function. Eight swatches on one sofa remain one sofa design. A coordinated modular counter collection may share geometry components, but should offer genuinely different modules and uses.

For suitable objects, offer at least six finishes, with separate controls for wood, metal, upholstery, and other supported regions.

Provide:
- Browsing by category, room, style, budget, color, quality, and footprint.
- Search, favorites, recently used items, and matching-set suggestions.
- Thumbnail, description, price, dimensions, quality, and relevant gameplay statistics.
- Clear indicators for required support surfaces or wall attachment.
- Preview placement, snapping, quarter-turn rotation, confirm, cancel, move, duplicate, sell.
- Placement under, on top of, or attached to compatible objects.
- An inventory for temporarily stored household objects.
- Room presets and whole-room purchase previews.

Do not make every decoration a gameplay device. Functional and decorative items should be clearly labeled.

Furniture sets should support believable rooms rather than isolated random pieces. Include multiple matching kitchens, living rooms, bedrooms, bathrooms, studies, and children's rooms across the decor packs.

## 17. Placement rules, transactions, and construction safety

Every object definition includes a footprint, placement layer, permitted attachment type, support slots, interaction slots, and access requirements.

Distinguish:
- Occupied floor cells.
- Required approach cells.
- Surface-support bounds.
- Wall and ceiling attachments.
- Decorative overlays.
- Doorway and stair clearance.

Rotate footprints and interaction anchors together. A bed must retain usable sides. A dining chair must align with a table slot when attached. An appliance must not be operable through a wall.

Construction tools create atomic commands with exact before/after state. Their effects include money, geometry data, material data, inventory, navigation invalidation, and relevant object ownership.

Pause simulation in Build/Buy mode. If a changed object is reserved by an action, cancel or replan that action safely. Reject edits that overlap a character or trap them without a valid recovery rule.

Undo/redo must restore the complete transaction. Undoing a purchase returns money and removes the object; undoing a sale restores the same owned object and correct balance.

For room moves, multi-item selection, and room purchases, validate the entire operation before committing. A partial failed room placement must not spend half the money or leave invisible blockers.

Store placement previews separately from authoritative state. Preview meshes never become active furniture until confirmed.

## 18. Neighborhood, venues, and other households

Create a neighborhood view with at least twelve lots. Include residential homes and at least six public venues:
- Park and playground.
- Cafe.
- Gym.
- Library.
- Community arts/music center.
- Shop or small market.

The remaining lots may be homes or additional venues. Some small venues can share a lot only if the neighborhood still provides the required twelve actual lot records.

Use lot transitions instead of requiring a fully continuous open world. Render and simulate the active lot in detail. Keep off-lot households on a lighter event-based schedule.

Support:
- Named NPC households with homes, jobs, traits, and basic relationships.
- Visiting another lot.
- Invitations to the active home.
- A visible location for household members away from the active lot.
- Returning home.
- Switching active households, with clearly explained simulation rules.
- Owned and rental homes, and moving households between eligible lots.

For inactive people, process schedules and major events using simulation timestamps rather than running full pathfinding across the neighborhood.

Do not reroll a person's job, relationship, or appearance each time their lot is loaded. Reconcile active and off-lot state when changing lots.

At public venues, provide meaningful activities: exercise at the gym, read at the library, buy a drink, meet friends, practice music, attend a small community event.

## 19. Environment, time, weather, and household events

Provide a day/night cycle connected to the authoritative clock. Update lighting, interior lamps, schedules, and ambient audio appropriately.

Add seasons and simple weather in a late milestone:
- Clear, cloudy, rain, and light snow where supported.
- Seasonal color changes and limited decorative changes.
- Weather preferences and relevant mood effects.
- Appropriate outdoor activity availability.

Keep weather effects lightweight on mobile and independently disableable.

Introduce household events only after the base systems work: a broken sink, an unexpected visitor, a promotion opportunity, a birthday, a party invitation, a small power interruption, or a cooking mishap.

Use explicit triggers and cooldowns. Let the player configure aging and disruptive events. Events must not cancel every routine or repeatedly punish the same household.

Pools require actual swim paths or activity areas, safe entry/exit links, suitable outfits, and a clear interaction lifecycle. A decorative blue rectangle is not a completed pool system.

## 20. Portrait, landscape, and desktop interface

Both mobile orientations are required from Milestone 1. Do not lock orientation, ask the player to rotate, or remove major features in portrait.

### Main gameplay HUD

Show time/day, speed controls, funds, selected person, queued actions, and concise notifications. Provide direct access to Needs, Relationships, Career/School, Skills, Aspirations, Inventory, Build/Buy, and the neighborhood.

Portrait uses a compact top bar, household strip, and expandable bottom sheets. Landscape uses a wider bottom HUD and side panels. A selected room or person should remain visible while using common panels.

Use primary touch targets at least 44 CSS pixels. Include labels for unfamiliar icons and avoid tiny text, hover-only controls, and densely packed miniature desktop panels.

### World controls

- Tap a person to select them; tap again or use an explicit action button for their menu.
- Tap an object to open its contextual interactions.
- Tap empty ground to issue a movement command.
- Drag on the world to pan.
- Pinch to zoom.
- Use visible camera-rotation buttons, with optional gestures as shortcuts.
- Use keyboard/mouse equivalents on desktop.

Use movement thresholds and a clear input state machine. A pan must not also issue a walk command. Touches originating in UI panels must not reach the world.

### Build and creator controls

In Build mode, use explicit preview, rotate, confirm, and cancel buttons. Provide coarse snapping and larger handles for room resizing.

In the character creator, provide sliders, presets, category tabs, and direct camera buttons. Keep full-body and face views accessible without gesture knowledge.

Large catalogs need virtualized or paginated grids, filters, a saved scroll position, and useful item previews. Opening a catalog of 560 designs should not instantiate 560 live 3D preview scenes.

### Resizing and interruptions

Support safe-area insets, dynamic browser viewport height, browser UI changes, pointer cancellation, and interrupted gestures.

After orientation/viewport changes, update the renderer buffer, orthographic camera frustum, DOM layout, picking coordinates, overlay anchors, and panel geometry using the actual visible canvas rectangle.

Preserve the selected person, queue, open panel, creator edits, build preview, and selected catalog item.

Provide sound/music sliders, reduced camera motion, readable contrast, scalable text, and color-independent placement feedback. Essential controls must be operable without sound.

## 21. Navigation, reservations, and simulation time

Use grid-based A* for the initial lot. Account for wall edges, door openings, furniture footprints, access slots, and blocked diagonal corners.

For multiple floors, connect floor navigation graphs through valid stair links. Doors and stairs can have costs, availability, and reservations.

Dynamic character avoidance must not create permanent deadlocks. Use short-lived occupancy/reservations, bounded retries, path replanning, and an understandable failure result.

Distinguish walking navigation from seated, sleeping, carried, off-lot, and swimming states. A person in bed does not continue to occupy their previous standing approach tile forever.

Furniture exposes local-space usable slots. Body height and rig proportions may need per-character interaction offsets. Validate after object rotation and resizing.

Use a fixed simulation timestep, seeded randomness, and visual interpolation. Keep one authoritative clock and consistent conversions between real time and game time.

Normal speed may begin at one real second per game minute, with configurable balancing. Speed multipliers affect needs, routing, animations where appropriate, actions, schedules, and event processing consistently.

Process schedule boundaries and completed actions in order. Each work shift, bill, birthday, and event has a unique occurrence identity so accelerated time or loading cannot apply it twice.

Cap catch-up work per rendered frame. Pause automatically when the page is hidden and reset the accumulator on resume. Offline progression is disabled by default; add it only after a bounded event-based design is verified.

## 22. Rendering, mobile budgets, and resource management

Use WebGLRenderer with WebGL 2 as the initial rendering baseline. Show a useful compatibility screen when unavailable. Do not require WebGPU.

Start with a single main gameplay canvas and an orthographic camera. Use shared geometry/materials, modular meshes, instancing where appropriate, and scene visibility based on floor and cutaway state.

Build a content-loading strategy:
- Load the active lot and nearby required character assets.
- Load thumbnails separately from high-detail models.
- Fetch catalog assets when selected or needed.
- Reuse shared resources with explicit ownership.
- Evict unused assets through a bounded cache.
- Dispose of resources only when no remaining owner needs them.
- Preserve unsaved game state during recoverable rendering failures.

Large catalogs are a storage and content-management problem, not a reason to put every model and texture in memory simultaneously.

Initial profiling budgets for a low mobile preset may begin around 200 draw calls and 250,000 rendered triangles for the active view. These are adjustable project budgets, not claims that any particular phone will meet a frame rate.

Use restrained realtime lighting, optional shadows, simplified reflections, and a drawing-buffer pixel budget. Do not blindly render at the phone's full device pixel ratio.

Target 30 FPS on a named, tested midrange phone for a representative furnished lot. Measure 8-person households separately and use reduced NPC detail or update rates where appropriate.

Keep a developer overlay for FPS, frame time, draw calls, rendered triangles, loaded assets, active simulation agents, route requests, and simulation timing.

Separate rendered animation frequency from expensive AI decisions. Avoid pathfinding for every person every frame. Apply HUD updates when relevant values change.

Document actual tested devices and browser versions. Viewport emulation verifies layout, not real-device performance or all touch/browser behavior.

## 23. Persistence, templates, and save recovery

Use IndexedDB for local state and support at least five named save slots, manual save/load, periodic autosave, and a last-known-good backup.

Use a consistent world save containing neighborhood, households, active household/lot, people, relationships, construction, inventories, funds, schedules, and relevant history.

Persist:
- Character appearance and outfit definitions.
- Stable asset/style IDs.
- Traits, preferences, aspirations, skills, needs, and life stage.
- Career/school state and schedule occurrence IDs.
- Directed relationships, shared statuses, family graph, and major memories.
- Lot topology, floor levels, wall-side finishes, stairs, openings, furniture, and placement.
- Simulation clock, relevant random-generator state, and processed-event markers.
- Household funds and transaction state.

Use a versioned schema and explicit migrations. Validate imports and missing content references. Provide clear errors instead of silently overwriting a valid save.

Save atomically. Autosaving after a confirmed building operation should be debounced and should not serialize half-finished transactions.

Save resumable actions as data. On loading, validate references, rebuild transient reservations, and resume valid actions or cancel them cleanly. Never serialize renderer objects or live promises.

Support JSON export/import for worlds, household templates, character presets, and room/house blueprints. A blueprint should include required pack IDs and a cost preview.

When a referenced asset is missing, provide a clear report and an appropriate reversible fallback. Do not silently convert all missing furniture into a free object.

Make backup export easy to find because mobile browser storage durability cannot be guaranteed.

## 24. Data definitions, catalogs, and content tools

Large content targets require a reproducible pipeline. Do not hand-code hundreds of anonymous objects inside rendering functions.

Define validated registries for:
- Wall and floor designs, palettes, scale rules, and pricing.
- Furniture, materials, support slots, footprints, interaction anchors, and quality.
- Doors, windows, stairs, fences, roofs, and structural components.
- Character meshes, morphs, hair, clothing, accessories, attachment rules, and rig compatibility.
- Traits, aspirations, skills, careers, interactions, events, and venues.

Every catalog entry needs a stable ID, category/tags, readable English name, description, source/asset reference, and relevant pricing or gameplay data.

Maintain fields for implementation status and asset readiness. Development-only entries must not appear as selectable finished content.

### Asset and pattern tools

Create lightweight developer tools for:
- Viewing a furniture model on a measured grid.
- Editing and displaying interaction anchors.
- Testing clothing/body/animation compatibility.
- Previewing wall patterns at actual room scale.
- Generating consistent thumbnails.
- Finding missing assets and duplicate IDs.
- Checking palette contrast and texture continuity.
- Counting distinct designs separately from swatches.
- Summarizing catalog completeness by category and milestone.

Procedural generators must be seeded and reproducible. Curate the generated designs and keep their parameters in source control.

### Content packs and delivery

Organize content into cohesive packs, for example:
- Everyday Essentials.
- Modern Minimal.
- Cozy Cottage.
- Mid-Century.
- Classic Townhouse.
- Industrial Loft.
- Coastal Home.
- Art Deco.
- Botanical Living.
- Kids' Storybook.
- Creative Studio.
- Garden and Patio.

These are organizational packs, not a required payment system. A pack can add new meshes, materials, clothing, and coordinated room presets.

Use lazy loading and meaningful manifests. A pack is complete only when its entries have functioning assets, valid metadata, usable placement, and the promised interactions.

## 25. Verification and quality standards

Run production builds and TypeScript checks. Use focused automated tests for system behavior where regressions would harm the game.

### Simulation and money

Verify:
- Needs and scheduled outcomes are consistent across frame rates and speed settings.
- Work, school, birthdays, and bills are processed once per occurrence.
- Cancelling a multi-step action cleans up all reservations.
- Money is not duplicated by undo/redo, load, object resale, or cancelled previews.
- Switching lots preserves people's location and activity state.
- Off-lot event summaries reconcile with active-lot simulation.

### Navigation and building

Verify:
- Walls, doors, footprints, corner rules, and access slots affect paths correctly.
- Wall cutaway does not remove collisions.
- Stairs work between correct floor levels.
- Moving a room preserves valid contents and finances.
- Invalid multi-item operations leave the world unchanged.
- Independent wall sides retain their finishes after adjacent edits.
- Removed objects do not leave invisible blockers or stuck actions.

### Character creator

Verify:
- Creator choices survive confirm, save/load, outfit changes, and lot transitions.
- Randomization locks and undo/redo work.
- Body and face controls stay within valid mesh ranges.
- Clothing remains attached during representative animations.
- Unsupported asset combinations are rejected or resolved clearly.
- Household relationship validation prevents contradictory family graphs.
- All creation steps work in both orientations.

### Content quality

Verify registry uniqueness, asset existence, category totals, usable thumbnails, tags, pricing, actual distinct designs, and palette accounting.

Reject a catalog entry that promises an interaction it cannot perform. Do not count missing or hidden development placeholders toward completion.

### Mobile and accessibility

Verify small portrait and small landscape viewports, dynamic viewport changes, catalog scrolling, context menus, safe areas, and rotation during a creator edit or build preview.

Test gesture conflicts and pointer cancellation on real touch hardware when available. Report separately what was checked through emulation and what was checked on a named device.

### Playable scenarios

Maintain end-to-end checks for:
1. Create an adult with customized face, hair, clothing, and traits; move in; reload.
2. Meet needs, route through doors, cancel a queued action, and recover.
3. Attend work, receive pay once, buy furniture, undo, redo, and reload.
4. Build a room with a door, paint each wall side differently, furnish it, and use its objects.
5. Meet a neighbor, develop a relationship, record a memory, and invite them back.
6. Change outfits and perform sitting, sleeping, walking, and skill animations.
7. Move between home and a public venue without losing household state.
8. Navigate stairs and use furniture on another floor.
9. Load a migrated save or recover from an invalid import.

Run relevant checks after each milestone. Do not repeat unrelated tests solely to create a large test report.

## 26. Ordered implementation milestones

The full target is a substantial game. Milestones define dependency order and reviewable progress, not a reduced final scope.

| Milestone | Playable result | Minimum usable content at that point |
| --- | --- | --- |
| 1. Creator and playable foundation | Create an adult, move into a starter house, manage needs, earn wages, buy furniture, save | 12 wall finishes, 8 floors, 15 furniture designs, 8 hairstyles, 12 garments |
| 2. Home editor | Build usable rooms, doors/windows, paint independent wall sides, use undo/redo | 48 wall finishes, 32 floors, 60 furniture designs |
| 3. Developed character creator | Face/body customization, outfits, presets, traits, household creation | 24 hairstyles, 48 garments, 12 accessories, 20 traits |
| 4. Daily-life systems | Six needs, reliable autonomy, cooking, cleaning, skills, repairs | 100 furniture designs and functional core household activities |
| 5. Relationships and events | Friendship, trust, adult romance, memories, visitors, dates | At least 24 social interactions and several event types |
| 6. Careers and economy | Career ladders, freelance income, bills, aspirations | 6 careers with 10 levels, 10 skills, 6 aspirations |
| 7. Neighborhood and venues | Lot travel, NPC households, venue activities, household switching | 12 lot records with 3 usable public venues |
| 8. Family and life stages | School, family graph, dependent care, aging, household splitting | All seven life stages with usable stage-specific behavior |
| 9. Multiple floors and exteriors | Three floors, valid stairs, roofs, balconies, gardens | Working structural tools and usable multi-floor houses |
| 10. Complete catalogs | Broad, coherent decoration and character content | 360 wall finishes, 200 floors, 560 furnishings; full creator catalog |
| 11. Complete progression and social scope | Long-term household play and varied goals | 12 careers, 16 skills, 40 traits, 12 aspirations, 40 social interactions |
| 12. Environment and venues | Seasons/weather options, pools, outdoor life, full venue variety | At least 6 usable public venues and 40 activities overall |
| 13. Release preparation | Polished guidance, balancing, accessibility, recovery, measured mobile performance | All required targets audited; development placeholders excluded |

Content counts are cumulative, and each completed milestone retains earlier functionality. More content may be added early if it does not destabilize the underlying systems.

### Milestone 1 — detailed acceptance

Deliver:
- Main menu with New Game, Load Game, Settings, and a guided starter option.
- A character creator with identity, adult appearance presets, basic face/body presets, hair selection/color, garment selection/color, three traits, and an aspiration.
- A second household member that can be created or added through a preset.
- One furnished, editable starter lot and one visiting neighbor.
- Recognizable animated people with selection, walking, an action queue, and cancellation.
- Hunger, energy, and social connected to food, sleeping, and conversation.
- One off-lot career with a real schedule and wage payment.
- Basic friendship and visible social feedback.
- Buying, moving, rotating, and selling essential furniture.
- The starter content counts in the milestone table, including visibly different patterns.
- Portrait and landscape interfaces for both creator and gameplay.
- Save/load preserving created appearance, household state, and home edits.

Acceptance scenario: create a person with a chosen hairstyle, outfit, body preset, and traits; add a roommate; move in; eat; sleep; attend work; receive pay; invite or meet a neighbor; buy and reposition a bed; change a wall finish; save; reload; rotate the device. Every selected setting and relevant state change must persist correctly.

A functional creator is part of this first playable delivery. Do not postpone all creation tools until a late milestone.

### Milestone 3 — creator acceptance

At this point, live face and body adjustments, outfit slots, presets, randomization locks, undo/redo, household ties, and import/export need to work.

The larger final catalogs are delivered by Milestone 10, but the actual architecture and workflows must be present here. Verify representative body/clothing combinations and interactions before multiplying the asset count.

### Milestone 10 — content acceptance

Audit every category in the wall, flooring, furniture, character, and structural catalogs. Publish the real counts of distinct designs and variants.

Do not claim completion because a generator can produce 360 random seeds. The required designs must be registered, curated, browseable, visually distinct, and usable in the game.

### Milestone 13 — release acceptance

A new player should be able to create a household, build a home, live through several game weeks, develop careers and relationships, visit venues, use multiple floors, and safely save/reload in either phone orientation.

## 27. Development process, documentation, and handover

Before implementation:
1. Inspect the repository and existing instructions.
2. Identify already working systems.
3. Map this brief to the current milestone and dependencies.
4. State a concise implementation plan.
5. Build the next playable result.

Maintain:
- **README:** Setup, controls, builds, save behavior, and implemented features.
- **ROADMAP:** Full-project targets, current milestone, dependencies, and unfinished systems.
- **ARCHITECTURE:** State ownership, simulation flow, navigation, rendering, content, persistence.
- **CONTENT_STATUS:** Exact category totals, distinct-design counts, variants, missing assets, and pack status.
- **ASSET_GUIDE:** Scale, rigs, material conventions, anchors, export rules, and licenses.
- **TEST_CHECKLIST:** Short repeatable manual scenarios and relevant automated checks.
- **CONTINUATION:** Current project state, commands that work, unresolved issues, and the next concrete task.

Keep builds runnable after each milestone. Fix regressions before expanding dependent systems.

After each delivery, report:
- Exactly what is playable.
- What was added or changed.
- Which checks actually ran and their results.
- Measured performance, if measured.
- Known limitations and the next milestone.

Do not claim that features, catalogs, mobile tests, or art are complete if they are placeholders or have not been verified.

If a session ends before a milestone is complete, leave a runnable project and a precise continuation note. Continue work from that state in the next session without regenerating the whole project.

## 28. First instruction to execute

Read this document completely. Inspect the existing directory and repository instructions. If the project is empty, scaffold a Three.js + TypeScript + Vite project.

Then implement Milestone 1, including the usable character creator, both mobile orientations, and a complete small daily-life loop. Run the production build and relevant checks, fix failures, and describe what is playable.

Keep the larger game vision and all completed-project catalog targets in the roadmap. Do not try to fill hundreds of catalog entries before their placement, interaction, material, and save systems work.

## Technical reference links

These are official references for the rendering foundation. The game design, budgets, catalog allocations, and milestone targets above are project decisions.

- Three.js — Making a Game: https://threejs.org/manual/pages/game.html
- Three.js — Responsive Design: https://threejs.org/manual/pages/responsive.html
- Three.js — WebGLRenderer: https://threejs.org/docs/pages/WebGLRenderer.html
- Three.js — InstancedMesh: https://threejs.org/docs/pages/InstancedMesh.html

