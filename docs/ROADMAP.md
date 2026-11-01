# Hearthside Life - Roadmap

This roadmap keeps the full project vision from the design brief (`docs/DESIGN_BRIEF.md`). It separates
**the completed-project targets**, **the current implementation**, and **optional expansions**. Exact current
content counts live in `docs/CONTENT_STATUS.md` (generated with `npm run content:check`).

## Current milestone

**Milestone 1 - Creator and playable foundation** (in progress / see CONTINUATION.md for the exact state).

## Completed-project targets (brief section 2)

| Area | Target |
|---|---|
| Household | Up to 8 controllable members |
| Life stages | Baby, toddler, child, teen, young adult, adult, elder |
| Character creation | Face, body, hair, clothing, accessories, personality, preferences, household ties |
| Hair | 60 hairstyles, 16 facial-hair styles |
| Clothing | 132 garments (40 tops, 28 bottoms, 24 full-body, 16 outerwear, 24 footwear), 32 accessories |
| Personality | 40 traits, 12 aspirations |
| Careers | 12 tracks x 10 levels |
| Skills | 16 skills with practical uses |
| Wall finishes | 360 distinct designs (8 palettes each where suitable) |
| Flooring | 200 distinct designs (6 variants each where meaningful) |
| Furniture and decor | 560 distinct designs |
| Doors and windows | 48 doors, 64 windows |
| Construction | 3 above-ground floors, roofs, stairs, balconies, fences, gardens |
| Exterior parts | 24 fences, 12 gates, 12 staircases, 12 roof styles |
| Neighbourhood | 12 lots, at least 6 public venues |
| Social | 40 meaningful social interactions |
| Activities | 40 usable activities |
| Saving | Multiple households, 5+ named slots, autosave, import/export |
| Devices | Full touch workflows in portrait and landscape, desktop controls |

## Milestones (brief section 26)

Content counts are cumulative. Each milestone keeps every earlier feature working.

| # | Milestone | Playable result | Minimum content | Depends on |
|---|---|---|---|---|
| 1 | Creator and playable foundation | Create an adult, move in, needs, wages, buy furniture, save | 12 walls, 8 floors, 15 furniture, 8 hairstyles, 12 garments | - |
| 2 | Home editor | Build rooms, doors/windows, independent wall sides, undo/redo | 48 walls, 32 floors, 60 furniture | 1 |
| 3 | Developed character creator | Face/body customisation, outfits, presets, traits, household creation | 24 hair, 48 garments, 12 accessories, 20 traits | 1 |
| 4 | Daily-life systems | Six needs, reliable autonomy, cooking, cleaning, skills, repairs | 100 furniture, core household activities | 1, 2 |
| 5 | Relationships and events | Friendship, trust, adult romance, memories, visitors, dates | 24 social interactions, several event types | 4 |
| 6 | Careers and economy | Career ladders, freelance income, bills, aspirations | 6 careers x 10 levels, 10 skills, 6 aspirations | 4 |
| 7 | Neighbourhood and venues | Lot travel, NPC households, venue activities, household switching | 12 lot records, 3 usable venues | 5, 6 |
| 8 | Family and life stages | School, family graph, dependent care, aging, household splitting | All seven life stages | 3, 7 |
| 9 | Multiple floors and exteriors | Three floors, stairs, roofs, balconies, gardens | Structural tools, multi-floor houses | 2 |
| 10 | Complete catalogs | Broad, coherent decoration and character content | 360 walls, 200 floors, 560 furnishings, full creator catalog | 2, 3, 9 |
| 11 | Complete progression and social scope | Long-term play, varied goals | 12 careers, 16 skills, 40 traits, 12 aspirations, 40 socials | 5, 6 |
| 12 | Environment and venues | Seasons/weather, pools, outdoor life, venue variety | 6 public venues, 40 activities | 7, 9 |
| 13 | Release preparation | Guidance, balance, accessibility, recovery, measured mobile performance | All targets audited | all |

## Milestone 1 scope decisions

- Six needs are simulated (the brief requires hunger, energy and social for M1; hygiene, bladder and fun are
  included because the objects already exist).
- Adults only. Life stages other than adult are data-model ready (`LifeStage`) but not creatable.
- Height is not adjustable yet (brief 6.4: only after fixed-height interactions are proven).
- Build mode in M1 changes wall-side and floor finishes; drawing walls, rooms, doors and windows is M2.
- One career (Culinary, 10 levels) works end to end; the other skills are defined, several are trainable.
- One neighbour household visits; the neighbourhood view and lot travel are M7.
- Multi-floor data exists (`level` everywhere) but only the ground floor is built and navigated (M9).

## Unfinished systems after M1 (by dependency)

1. Wall/room/door drawing tools (pure systems done, see ARCHITECTURE.md "Build mode construction"; Build-mode UI and rendering pending); move/resize/duplicate rooms still open (M2).
2. More finishes and furniture through the content pipeline, decor packs, room presets (M2, M10).
3. Creator depth (M3): 24 face presets, 18 face parameters, 54 garments, 15 accessories, hat and hair interaction, outfit slots, family tree editing are done; remaining depth (more garment variety, life-stage bodies, height) belongs to M8 and M10.
4. Dirt, breakage, repair and cleaning are done (M4, see ARCHITECTURE.md "Daily life"); groceries/freshness depth and household routines remain (M4).
5. Done in M5 (see ARCHITECTURE.md "Relationships and events"): romance ladder, dates, events with invitations, jealousy after exclusivity. Open: weddings as events, group conversations, gifts as objects, lot travel for dates (M7).
6. Bills, rent/ownership, freelance work, more careers, aspiration rewards depth (M6).
7. Neighbourhood map, 12 lots, venues, household switching, off-lot reconciliation (M7).
8. Life stages, school, aging, adoption (M8).
9. Upper floors, stairs, roofs, fences, gardens, balconies (M9).
10. Seasons, weather, pools (M12).

## Optional expansions (not part of the required plan)

Multiplayer, a fully continuous open world, vehicles with traffic simulation, basements, unrestricted terrain
sculpting.
