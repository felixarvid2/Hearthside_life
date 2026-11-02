// Structural validation of a WorldState: shapes, ids and cross references inside the data itself. Problems
// that make the world unusable are errors; oddities the game can live with are warnings. Content references
// (is this object def known?) are a separate concern - see references.ts and schema.ts validateWorld.

import { edgeKey, pairKey, relKey } from '../core/ids';
import { SCHEMA_VERSION } from '../core/types';
import {
  addProblem, checkAppearance, checkLifeStage, checkNeeds, checkWardrobe, expect, has, isBool, isInt, isNum, isRecord,
  isStr, type Obj,
} from './shape';

export interface StructureResult { errors: string[]; warnings: string[] }

const START_MODES = ['guided', 'create', 'sandbox'];
const POSTURES = ['standing', 'walking', 'seated', 'lying'];
const OFFLOT_PLACES = ['work', 'school', 'home', 'errand', 'visiting'];
const TARGET_KINDS = ['object', 'person', 'tile', 'item', 'self'];

/** Checks the whole state. Never throws, whatever `state` is. */
export function validateStructure(state: unknown): StructureResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(state)) return { errors: ['The save does not contain a world object.'], warnings };
  const s = state;

  if (!isInt(s.schemaVersion) || (s.schemaVersion as number) < 1) addProblem(errors, 'schemaVersion must be a whole number from 1');
  else if (s.schemaVersion !== SCHEMA_VERSION) addProblem(errors, `schemaVersion is ${String(s.schemaVersion)} but this build uses ${SCHEMA_VERSION}; migrate the data first`);
  expect(errors, isNum(s.seed), 'seed', 'must be a number');
  expect(errors, Array.isArray(s.rng) && s.rng.length === 4 && s.rng.every(isNum), 'rng', 'must be four numbers');
  expect(errors, isInt(s.nextId) && (s.nextId as number) >= 1, 'nextId', 'must be a whole number from 1');
  if (expect(errors, isRecord(s.clock), 'clock', 'must be an object')) {
    expect(errors, isNum((s.clock as Obj).minutes), 'clock.minutes', 'must be a number');
    expect(errors, isInt((s.clock as Obj).ticks) && ((s.clock as Obj).ticks as number) >= 0, 'clock.ticks', 'must be a whole number from 0');
  }
  checkSettings(s.settings, errors);
  expect(errors, isStr(s.startMode) && START_MODES.includes(s.startMode), 'startMode', `must be one of ${START_MODES.join(', ')}`);
  expect(errors, isStr(s.activeHouseholdId), 'activeHouseholdId', 'must be text');
  expect(errors, isStr(s.activeLotId), 'activeLotId', 'must be text');

  const records = ['households', 'people', 'lots', 'relationships', 'bonds', 'processed', 'items'] as const;
  let collectionsOk = true;
  for (const key of records) if (!expect(errors, isRecord(s[key]), key, 'must be an object')) collectionsOk = false;
  for (const key of ['schedule', 'feed'] as const) if (!expect(errors, Array.isArray(s[key]), key, 'must be a list')) collectionsOk = false;
  if (!collectionsOk) return { errors, warnings };

  const households = s.households as Obj;
  const people = s.people as Obj;
  const lots = s.lots as Obj;

  if (isStr(s.activeHouseholdId)) expect(errors, has(households, s.activeHouseholdId), 'activeHouseholdId', `"${s.activeHouseholdId}" is not a household in this world`);
  if (isStr(s.activeLotId)) expect(errors, has(lots, s.activeLotId), 'activeLotId', `"${s.activeLotId}" is not a lot in this world`);

  for (const [id, hh] of Object.entries(households)) checkHousehold(id, hh, people, lots, errors, warnings);
  for (const [id, p] of Object.entries(people)) checkPerson(id, p, households, lots, errors, warnings);
  for (const [id, lot] of Object.entries(lots)) checkLot(id, lot, households, errors, warnings);
  checkRelationships(s.relationships as Obj, s.bonds as Obj, people, warnings);
  checkScheduleAndItems(s, people, lots, warnings);
  checkHomeEvents(s.homeEvents, people, households, warnings);
  checkNextId(s, warnings);
  return { errors, warnings };
}

function checkSettings(v: unknown, errors: string[]): void {
  if (!expect(errors, isRecord(v), 'settings', 'must be an object')) return;
  const st = v as Obj;
  expect(errors, isBool(st.autonomy), 'settings.autonomy', 'must be true or false');
  expect(errors, st.autonomyLevel === 0 || st.autonomyLevel === 1 || st.autonomyLevel === 2, 'settings.autonomyLevel', 'must be 0, 1 or 2');
  expect(errors, isBool(st.unlimitedFunds), 'settings.unlimitedFunds', 'must be true or false');
  expect(errors, st.aging === 'off' || st.aging === 'long' || st.aging === 'normal', 'settings.aging', "must be 'off', 'long' or 'normal'");
  expect(errors, isBool(st.visitors), 'settings.visitors', 'must be true or false');
}

function checkHousehold(id: string, v: unknown, people: Obj, lots: Obj, errors: string[], warnings: string[]): void {
  const path = `households.${id}`;
  if (!expect(errors, isRecord(v), path, 'must be an object')) return;
  const hh = v as Obj;
  expect(errors, hh.id === id, `${path}.id`, `must equal its key "${id}"`);
  expect(errors, isStr(hh.name), `${path}.name`, 'must be text');
  if (!isInt(hh.funds)) addProblem(warnings, `${path}.funds is not a whole number of cents (${String(hh.funds)})`);
  expect(errors, hh.homeLotId === null || (isStr(hh.homeLotId) && has(lots, hh.homeLotId)), `${path}.homeLotId`, 'must be null or an existing lot');
  expect(errors, isBool(hh.isPlayable), `${path}.isPlayable`, 'must be true or false');
  expect(errors, Array.isArray(hh.ledger), `${path}.ledger`, 'must be a list');
  if (expect(errors, Array.isArray(hh.inventory), `${path}.inventory`, 'must be a list')) {
    (hh.inventory as unknown[]).forEach((e, i) => {
      if (!expect(errors, isRecord(e) && isRecord((e as Obj).object), `${path}.inventory[${i}]`, 'must hold a stored object')) return;
      checkObject(`${path}.inventory[${i}].object`, (e as Obj).object, undefined, errors);
    });
  }
  if (!expect(errors, Array.isArray(hh.memberIds), `${path}.memberIds`, 'must be a list')) return;
  (hh.memberIds as unknown[]).forEach((m, i) => {
    if (!expect(errors, isStr(m) && has(people, m), `${path}.memberIds[${i}]`, `refers to a person who does not exist (${String(m)})`)) return;
    const p = people[m as string];
    if (isRecord(p) && p.householdId !== id) addProblem(warnings, `${path}.memberIds[${i}]: person ${String(m)} belongs to household ${String(p.householdId)}`);
  });
}

function checkPerson(id: string, v: unknown, households: Obj, lots: Obj, errors: string[], warnings: string[]): void {
  const path = `people.${id}`;
  if (!expect(errors, isRecord(v), path, 'must be an object')) return;
  const p = v as Obj;
  expect(errors, p.id === id, `${path}.id`, `must equal its key "${id}"`);
  if (expect(errors, isStr(p.householdId) && has(households, p.householdId), `${path}.householdId`, `refers to a household that does not exist (${String(p.householdId)})`)) {
    const hh = households[p.householdId as string];
    if (isRecord(hh) && Array.isArray(hh.memberIds) && !hh.memberIds.includes(id)) addProblem(warnings, `${path} is not listed in the members of household ${String(p.householdId)}`);
  }
  expect(errors, isStr(p.firstName), `${path}.firstName`, 'must be text');
  expect(errors, isStr(p.lastName), `${path}.lastName`, 'must be text');
  checkLifeStage(p.lifeStage, `${path}.lifeStage`, errors);
  checkAppearance(p.appearance, `${path}.appearance`, errors);
  checkWardrobe(p.outfits, `${path}.outfits`, errors);
  checkNeeds(p.needs, `${path}.needs`, errors);
  for (const key of ['traits', 'likes', 'dislikes'] as const) {
    if (expect(errors, Array.isArray(p[key]), `${path}.${key}`, 'must be a list')) {
      (p[key] as unknown[]).forEach((x, i) => expect(errors, isStr(x), `${path}.${key}[${i}]`, 'must be text'));
    }
  }
  for (const key of ['moodlets', 'memories', 'queue'] as const) expect(errors, Array.isArray(p[key]), `${path}.${key}`, 'must be a list');
  expect(errors, isRecord(p.skills), `${path}.skills`, 'must be an object');
  expect(errors, isRecord(p.cooldowns), `${path}.cooldowns`, 'must be an object');
  expect(errors, p.aspiration === null || (isRecord(p.aspiration) && isStr((p.aspiration as Obj).aspirationId)), `${path}.aspiration`, 'must be null or an aspiration state');
  expect(errors, p.career === null || (isRecord(p.career) && isStr((p.career as Obj).careerId)), `${path}.career`, 'must be null or a career state');
  if (Array.isArray(p.moodlets)) p.moodlets.forEach((m, i) => expect(errors, isRecord(m) && isStr((m as Obj).id), `${path}.moodlets[${i}]`, 'must be a moodlet with an id'));
  if (isRecord(p.skills)) {
    for (const [k, sk] of Object.entries(p.skills)) expect(errors, isRecord(sk) && isNum((sk as Obj).level) && isNum((sk as Obj).xp), `${path}.skills.${k}`, 'must have numeric level and xp');
  }
  checkLocation(p.location, `${path}.location`, lots, errors, warnings);
  if (Array.isArray(p.queue)) {
    p.queue.forEach((a, i) => {
      const at = `${path}.queue[${i}]`;
      if (!expect(errors, isRecord(a), at, 'must be an action')) return;
      const act = a as Obj;
      expect(errors, isStr(act.id), `${at}.id`, 'must be text');
      expect(errors, isStr(act.interactionId), `${at}.interactionId`, 'must be text');
      expect(errors, isStr(act.phase), `${at}.phase`, 'must be text');
      expect(errors, isRecord(act.target) && isStr((act.target as Obj).kind) && TARGET_KINDS.includes((act.target as Obj).kind as string), `${at}.target`, 'must be an action target');
      expect(errors, Array.isArray(act.route), `${at}.route`, 'must be a list');
      expect(errors, isRecord(act.data), `${at}.data`, 'must be an object');
      if (act.actorId !== id) addProblem(warnings, `${at}.actorId is ${String(act.actorId)}, not ${id}`);
    });
  }
}

function checkLocation(v: unknown, path: string, lots: Obj, errors: string[], warnings: string[]): void {
  if (!expect(errors, isRecord(v), path, 'must be an object')) return;
  const loc = v as Obj;
  if (loc.kind === 'lot') {
    expect(errors, isStr(loc.lotId) && has(lots, loc.lotId), `${path}.lotId`, `refers to a lot that does not exist (${String(loc.lotId)})`);
    for (const k of ['level', 'x', 'z', 'facing']) expect(errors, isNum(loc[k]), `${path}.${k}`, 'must be a number');
    expect(errors, isStr(loc.posture) && POSTURES.includes(loc.posture), `${path}.posture`, `must be one of ${POSTURES.join(', ')}`);
  } else if (loc.kind === 'offlot') {
    expect(errors, isStr(loc.place) && OFFLOT_PLACES.includes(loc.place), `${path}.place`, `must be one of ${OFFLOT_PLACES.join(', ')}`);
    expect(errors, isNum(loc.since), `${path}.since`, 'must be a number');
    expect(errors, loc.until === null || isNum(loc.until), `${path}.until`, 'must be a number or null');
    if (isStr(loc.lotId) && !has(lots, loc.lotId)) addProblem(warnings, `${path}.lotId refers to a lot that does not exist (${loc.lotId})`);
    if (loc.transit === true && !isStr(loc.lotId)) addProblem(warnings, `${path} is in transit without a destination lot`);
  } else {
    addProblem(errors, `${path}.kind must be 'lot' or 'offlot'`);
  }
}

function checkFinish(v: unknown, path: string, errors: string[]): void {
  if (!expect(errors, isRecord(v), path, 'must be a finish')) return;
  expect(errors, isStr((v as Obj).designId), `${path}.designId`, 'must be text');
  expect(errors, isStr((v as Obj).paletteId), `${path}.paletteId`, 'must be text');
}

function checkObject(path: string, v: unknown, siblings: Obj | undefined, errors: string[], key?: string): void {
  if (!expect(errors, isRecord(v), path, 'must be an object')) return;
  const o = v as Obj;
  if (key !== undefined) expect(errors, o.id === key, `${path}.id`, `must equal its key "${key}"`);
  else expect(errors, isStr(o.id), `${path}.id`, 'must be text');
  expect(errors, isStr(o.defId), `${path}.defId`, 'must be text');
  for (const k of ['level', 'x', 'z']) expect(errors, isNum(o[k]), `${path}.${k}`, 'must be a number');
  expect(errors, o.rot === 0 || o.rot === 1 || o.rot === 2 || o.rot === 3, `${path}.rot`, 'must be 0, 1, 2 or 3');
  expect(errors, isRecord(o.finishes), `${path}.finishes`, 'must be an object');
  expect(errors, isRecord(o.condition), `${path}.condition`, 'must be an object');
  if (siblings && o.supportId !== undefined) expect(errors, isStr(o.supportId) && has(siblings, o.supportId), `${path}.supportId`, `rests on an object that does not exist (${String(o.supportId)})`);
}

function checkLot(id: string, v: unknown, households: Obj, errors: string[], warnings: string[]): void {
  const path = `lots.${id}`;
  if (!expect(errors, isRecord(v), path, 'must be an object')) return;
  const lot = v as Obj;
  expect(errors, lot.id === id, `${path}.id`, `must equal its key "${id}"`);
  expect(errors, isStr(lot.name), `${path}.name`, 'must be text');
  expect(errors, lot.kind === 'residential' || lot.kind === 'venue', `${path}.kind`, "must be 'residential' or 'venue'");
  expect(errors, isInt(lot.width) && (lot.width as number) > 0, `${path}.width`, 'must be a positive whole number');
  expect(errors, isInt(lot.depth) && (lot.depth as number) > 0, `${path}.depth`, 'must be a positive whole number');
  expect(errors, isInt(lot.levels) && (lot.levels as number) >= 1, `${path}.levels`, 'must be a whole number from 1');
  expect(errors, lot.ground === 'grass' || lot.ground === 'dirt' || lot.ground === 'paving', `${path}.ground`, "must be 'grass', 'dirt' or 'paving'");
  if (expect(errors, isRecord(lot.entry), `${path}.entry`, 'must be a tile position')) {
    for (const k of ['x', 'z', 'level']) expect(errors, isNum((lot.entry as Obj)[k]), `${path}.entry.${k}`, 'must be a number');
  }
  if (lot.ownerHouseholdId !== null && !(isStr(lot.ownerHouseholdId) && has(households, lot.ownerHouseholdId))) {
    addProblem(warnings, `${path}.ownerHouseholdId refers to a household that does not exist (${String(lot.ownerHouseholdId)})`);
  }
  const hasWalls = expect(errors, isRecord(lot.walls), `${path}.walls`, 'must be an object');
  const hasFloors = expect(errors, isRecord(lot.floors), `${path}.floors`, 'must be an object');
  const hasOpenings = expect(errors, isRecord(lot.openings), `${path}.openings`, 'must be an object');
  const hasObjects = expect(errors, isRecord(lot.objects), `${path}.objects`, 'must be an object');
  if (hasWalls) {
    for (const [key, w] of Object.entries(lot.walls as Obj)) {
      const wp = `${path}.walls.${key}`;
      if (!expect(errors, isRecord(w), wp, 'must be a wall')) continue;
      const wall = w as Obj;
      expect(errors, wall.id === key, `${wp}.id`, `must equal its key "${key}"`);
      expect(errors, wall.dir === 'h' || wall.dir === 'v', `${wp}.dir`, "must be 'h' or 'v'");
      for (const k of ['level', 'x', 'z', 'height']) expect(errors, isNum(wall[k]), `${wp}.${k}`, 'must be a number');
      if ((wall.dir === 'h' || wall.dir === 'v') && isNum(wall.level) && isNum(wall.x) && isNum(wall.z) && key !== edgeKey(wall.level, wall.dir, wall.x, wall.z)) {
        addProblem(errors, `${wp} sits at ${edgeKey(wall.level, wall.dir, wall.x, wall.z)}, which does not match its id`);
      }
      checkFinish(wall.sideA, `${wp}.sideA`, errors);
      checkFinish(wall.sideB, `${wp}.sideB`, errors);
    }
  }
  if (hasFloors) for (const [key, f] of Object.entries(lot.floors as Obj)) checkFinish(f, `${path}.floors.${key}`, errors);
  if (hasOpenings) {
    for (const [key, o] of Object.entries(lot.openings as Obj)) {
      const op = `${path}.openings.${key}`;
      if (!expect(errors, isRecord(o), op, 'must be an opening')) continue;
      const opening = o as Obj;
      expect(errors, opening.id === key, `${op}.id`, `must equal its key "${key}"`);
      expect(errors, isStr(opening.defId), `${op}.defId`, 'must be text');
      expect(errors, isBool(opening.flip), `${op}.flip`, 'must be true or false');
      if (hasWalls) expect(errors, isStr(opening.wallId) && has(lot.walls as Obj, opening.wallId), `${op}.wallId`, `sits in a wall that does not exist (${String(opening.wallId)})`);
    }
  }
  if (hasObjects) {
    const objects = lot.objects as Obj;
    for (const [key, o] of Object.entries(objects)) checkObject(`${path}.objects.${key}`, o, objects, errors, key);
  }
}

function checkRelationships(relationships: Obj, bonds: Obj, people: Obj, warnings: string[]): void {
  for (const [key, r] of Object.entries(relationships)) {
    if (!isRecord(r) || !isStr(r.from) || !isStr(r.to)) { addProblem(warnings, `relationships.${key} is not a relationship`); continue; }
    if (key !== relKey(r.from, r.to)) addProblem(warnings, `relationships.${key} does not match its people (${relKey(r.from, r.to)})`);
    if (!has(people, r.from) || !has(people, r.to)) addProblem(warnings, `relationships.${key} refers to a person who does not exist`);
  }
  for (const [key, b] of Object.entries(bonds)) {
    if (!isRecord(b) || !isStr(b.a) || !isStr(b.b)) { addProblem(warnings, `bonds.${key} is not a bond`); continue; }
    if (key !== pairKey(b.a, b.b)) addProblem(warnings, `bonds.${key} does not match its people (${pairKey(b.a, b.b)})`);
    if (!has(people, b.a) || !has(people, b.b)) addProblem(warnings, `bonds.${key} refers to a person who does not exist`);
  }
}

/** Home events (Milestone 5) are optional; odd ones are reported, never fatal. */
function checkHomeEvents(events: unknown, people: Obj, households: Obj, warnings: string[]): void {
  if (events === undefined) return;
  if (!Array.isArray(events)) { addProblem(warnings, 'homeEvents must be a list'); return; }
  events.forEach((e, i) => {
    if (!isRecord(e) || !isStr(e.id) || !isStr(e.type) || !isStr(e.status) || !isNum(e.startAt) || !isNum(e.endAt)) {
      addProblem(warnings, `homeEvents[${i}] is not an event`);
      return;
    }
    if (!isStr(e.hostId) || !has(people, e.hostId)) addProblem(warnings, `homeEvents[${i}] (${e.id}) has a host who does not exist`);
    if (!isStr(e.householdId) || !has(households, e.householdId)) addProblem(warnings, `homeEvents[${i}] (${e.id}) belongs to a household that does not exist`);
    for (const key of ['guestIds', 'arrivedIds'] as const) {
      const list = e[key];
      if (!Array.isArray(list)) { addProblem(warnings, `homeEvents[${i}].${key} must be a list`); continue; }
      for (const id of list) if (!isStr(id) || !has(people, id)) addProblem(warnings, `homeEvents[${i}] (${e.id}) refers to a person who does not exist`);
    }
  });
}

function checkScheduleAndItems(s: Obj, people: Obj, lots: Obj, warnings: string[]): void {
  (s.schedule as unknown[]).forEach((e, i) => {
    if (!isRecord(e) || !isStr(e.occurrence) || !isNum(e.at) || !isStr(e.kind)) { addProblem(warnings, `schedule[${i}] is not a scheduled event`); return; }
    if (isStr(e.personId) && !has(people, e.personId)) addProblem(warnings, `schedule[${i}] (${e.occurrence}) refers to a person who does not exist`);
  });
  (s.feed as unknown[]).forEach((e, i) => {
    if (!isRecord(e) || !isStr(e.id) || !isNum(e.at) || !isStr(e.text)) addProblem(warnings, `feed[${i}] is not a feed entry`);
  });
  for (const [key, item] of Object.entries(s.items as Obj)) {
    if (!isRecord(item) || item.id !== key) { addProblem(warnings, `items.${key} is not a valid item`); continue; }
    if (!isStr(item.lotId) || !has(lots, item.lotId)) addProblem(warnings, `items.${key} rests on a lot that does not exist`);
  }
  for (const [key, at] of Object.entries(s.processed as Obj)) if (!isNum(at)) addProblem(warnings, `processed.${key} must be a number`);
}

/** Ids are `<prefix>_<base36 counter>`; the world counter must be above every counter already used. */
function checkNextId(s: Obj, warnings: string[]): void {
  if (!isInt(s.nextId)) return;
  let highest = 0;
  const visit = (rec: unknown): void => {
    if (!isRecord(rec)) return;
    for (const key of Object.keys(rec)) {
      const m = /^[a-z]+_([0-9a-z]+)$/.exec(key);
      if (m && m[1]) highest = Math.max(highest, parseInt(m[1], 36));
    }
  };
  visit(s.households); visit(s.people); visit(s.lots); visit(s.items);
  for (const lot of Object.values(isRecord(s.lots) ? s.lots : {})) {
    if (isRecord(lot)) { visit(lot.objects); visit(lot.openings); }
  }
  if (highest >= (s.nextId as number)) {
    addProblem(warnings, `nextId (${s.nextId as number}) is not above the highest id in use (${highest}); new ids could repeat`);
  }
}
