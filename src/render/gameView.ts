// GameView: the three.js half of the game. Owns the renderer, camera rig, lighting, the lot/object/people
// views, previews, the creator preview scene and portraits; draws the world the Game hands it and answers
// screen-space questions (picking, projection, anchors). It never changes the world state.

import * as THREE from 'three';
import { preloadSurfaceMaps, setSurfaceMapBase } from './textures/surfaceMaps';
import type { CharacterAssets, CharacterStyle } from '../characters/assets';
import { setCharacterStyle } from '../characters/assets';
import type { ContentDB } from '../content/types';
import { hourOfDay } from '../core/clock';
import { parseEdgeKey, tileKey } from '../core/ids';
import { rotatedSize } from '../core/geometry';
import type { Id, Lot, WorldState } from '../core/types';
import type { CutawayMode, GameMode, PickResult, PlacementState } from '../game/api';
import type { PaintHighlight } from '../game/GameCore';
import type { BuildHighlight } from '../building/buildPlans';
import type { GameEvent } from '../core/events';
import { levelsInUse, levelY } from '../world/levels';
import { tileOnSide } from '../world/walls';
import { BuildView, type BuildViewExtras, type RoomOutline } from './buildView';
import { CameraRig, DEFAULT_PPM, type Insets } from './cameraRig';
import { CreatorScene } from './creatorScene';
import { EnvironmentView, GROUND_Y } from './environment';
import { ExteriorView } from './exteriorView';
import { Lighting } from './lighting';
import { LotView } from './lotView';
import { ObjectAssets } from './objectAssets';
import { ObjectsView } from './objectsView';
import { OpeningThumbs } from './openingThumbs';
import { PeopleView } from './peopleView';
import { PortraitRenderer } from './portraits';
import { PlacementPreview } from './previews';
import { RenderContext, type Quality } from './renderer';

export interface ViewOptions {
  quality: Quality;
  shadows: boolean;
  reducedMotion: boolean;
}

export interface RenderStats { drawCalls: number; triangles: number; geometries: number; textures: number; programs: number }

export class GameView {
  readonly ctx: RenderContext;
  readonly rig = new CameraRig();
  readonly scene = new THREE.Scene();
  readonly objectAssets: ObjectAssets;
  private readonly lighting: Lighting;
  private readonly env = new EnvironmentView();
  private readonly lotView: LotView;
  /** Milestone 9: fences, roofs, terrain paint and garden crops (render/exteriorView.ts). */
  private readonly exterior: ExteriorView;
  private readonly objects: ObjectsView;
  private people: PeopleView | null = null;
  private readonly placement: PlacementPreview;
  private readonly buildView: BuildView;
  readonly openingThumbs: OpeningThumbs;
  private buildGrid = false;
  /** Where the current construction preview is (kept on screen after a layout change). */
  private buildBox: THREE.Box3 | null = null;
  private creator: CreatorScene | null = null;
  private portraits: PortraitRenderer | null = null;
  private charAssets: CharacterAssets | null = null;
  private world: WorldState | null = null;
  private lot: Lot | null = null;
  private cutaway: CutawayMode = 'cutaway';
  /** Milestone 9: the floor being viewed and worked on (0-2). */
  private activeLevel = 0;
  private opts: ViewOptions;
  private readonly fog: THREE.Fog;
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpV2 = new THREE.Vector3();
  private readonly tmpRay = new THREE.Ray();
  private readonly scr = { x: 0, y: 0, visible: false };
  private orbiting = false;
  private lastStats: RenderStats = { drawCalls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0 };
  private hoverAt: { x: number; y: number } | null = null;
  private hoverTimer = 0;
  private lastCameraVersion = -1;
  private cycleState: { key: string; index: number; x: number; y: number; at: number; version: number } | null = null;
  private pendingReveal: { box: THREE.Box3; wait: number; zoomIn: boolean } | null = null;
  private ghost: PlacementState | null = null;
  private highlighted: Id | null = null;
  private lastCutawayKey = '';
  /** Called when the camera moved (UI anchors). */
  onCamera: (() => void) | null = null;
  /** Called when the detail maps of the surface designs finished loading (flat thumbnails can be repainted). */
  onSurfaceMaps: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, readonly content: ContentDB, readonly overlay: HTMLElement | null, opts: ViewOptions, assetBase: string) {
    this.opts = { ...opts };
    this.ctx = new RenderContext(canvas, opts.quality);
    this.ctx.onResize = (w, h) => {
      this.rig.setSize(w, h);
      this.creator?.setSize(w, h);
      if (this.orbiting) this.frameLot(true);
      else this.keepInView();
    };
    this.objectAssets = new ObjectAssets(assetBase);
    setSurfaceMapBase(`${assetBase}surfaces/`); // detail maps for AI-textured walls and floors
    void preloadSurfaceMaps().then(() => this.onSurfaceMaps?.());
    this.lighting = new Lighting(this.scene);
    this.fog = new THREE.Fog(0xefe7da, 85, 150);
    this.scene.fog = this.fog;
    this.scene.background = this.lighting.background;
    this.lotView = new LotView(content, opts.quality);
    this.exterior = new ExteriorView(content);
    this.exterior.gardens.groundAt = (x, z) => this.groundAt(x, z);
    this.objects = new ObjectsView(content, this.objectAssets, opts.quality === 'high' ? 4 : 2);
    this.objects.groundAt = (x, z, level) => this.groundAt(x, z, level);
    this.objects.onModelsLoaded = () => { if (this.lot) this.objects.applyWallVisibility((id) => this.lotView.isLowered(id)); };
    this.placement = new PlacementPreview(content, this.objectAssets);
    this.buildView = new BuildView(content);
    this.openingThumbs = new OpeningThumbs(content);
    this.scene.add(this.env.group, this.lotView.group, this.exterior.group, this.objects.group, this.placement.group, this.buildView.group);
    this.rig.reducedMotion = opts.reducedMotion;
    this.applyOptions(opts);
    canvas.addEventListener('pointermove', this.onPointerMove, { passive: true });
    canvas.addEventListener('pointerleave', this.onPointerLeave, { passive: true });
  }

  /** Attaches the character assets (people, creator preview, portraits). */
  setCharacterAssets(assets: CharacterAssets): void {
    this.charAssets = assets;
    this.people = new PeopleView(assets, this.content, this.overlay);
    this.people.groundAt = (x, z) => this.groundAt(x, z);
    this.people.setActiveLevel(this.activeLevel);
    this.scene.add(this.people.group);
    this.creator = new CreatorScene(assets, this.content);
    this.creator.reducedMotion = this.opts.reducedMotion;
    this.creator.setSize(this.ctx.width, this.ctx.height);
    this.portraits = new PortraitRenderer(assets, this.content);
    if (this.world) this.people.sync(this.world, this.world.activeLotId);
  }

  get characterAssets(): CharacterAssets | null { return this.charAssets; }

  /** Switches the character style (loading the other bodies on first use) and rebuilds everyone. Resolves to the style in effect. */
  async setCharacterStyle(style: CharacterStyle): Promise<CharacterStyle> {
    const assets = this.charAssets;
    if (!assets || assets.style === style) return assets?.style ?? style;
    const now = await setCharacterStyle(assets, style);
    this.people?.refreshStyle();
    this.creator?.refreshStyle();
    this.portraits?.refreshStyle();
    return now;
  }
  get portraitRenderer(): PortraitRenderer | null { return this.portraits; }
  get creatorScene(): CreatorScene | null { return this.creator; }

  applyOptions(o: ViewOptions): void {
    this.opts = { ...o };
    this.ctx.setQuality(o.quality);
    const shadows = o.quality === 'high' && o.shadows;
    this.ctx.renderer.shadowMap.enabled = shadows;
    this.lighting.setShadows(shadows);
    this.rig.reducedMotion = o.reducedMotion;
    if (this.creator) this.creator.reducedMotion = o.reducedMotion;
    this.lotView.setQuality(o.quality);
    this.objects.setLampLightCount(o.quality === 'high' ? 4 : 2);
  }

  // ---------------------------------------------------------------------------------------------
  // World
  // ---------------------------------------------------------------------------------------------

  get displayed(): WorldState | null { return this.world; }

  /** Shows a world (or nothing). Rebuilds everything when the world object or its active lot changed. */
  setWorld(state: WorldState | null, force = false): void {
    const lot = state ? state.lots[state.activeLotId] ?? null : null;
    if (!force && state === this.world && lot === this.lot) return;
    if (!lot || lot.id !== this.lot?.id) this.activeLevel = 0; // another lot starts on its ground floor
    this.world = state;
    this.lot = lot;
    this.lotView.clear();
    this.exterior.setLot(null);
    this.objects.clear();
    this.people?.clear();
    this.placement.set(null, null, () => 0);
    this.pendingReveal = null;
    this.buildView.setGrid(this.buildGrid ? lot : null);
    if (!state || !lot) return;
    this.env.build(lot);
    this.lotView.setCutaway(this.cutaway, this.rig.viewDir(this.tmpV));
    this.lotView.setActiveLevel(this.activeLevel);
    this.objects.setActiveLevel(this.activeLevel);
    this.people?.setActiveLevel(this.activeLevel);
    this.buildView.setLevel(this.activeLevel);
    this.rig.setLevelHeight(levelY(this.activeLevel));
    this.lotView.build(lot);
    this.exterior.setView({ walls: this.cutaway, level: this.activeLevel });
    this.exterior.setLot(lot);
    this.objects.sync(lot);
    this.objects.syncItems(state, lot.id);
    this.people?.sync(state, lot.id);
    this.people?.snap(state);
    this.people?.invalidateSlots();
    this.objects.applyWallVisibility((id) => this.lotView.isLowered(id));
    this.rig.setBounds(-1, -1, lot.width + 1, lot.depth + 1);
    this.lighting.setFocus(lot.width / 2, lot.depth / 2, Math.max(lot.width, lot.depth) * 0.75);
    this.objectAssets.purgeUnused();
  }

  lotChanged(what: Extract<GameEvent, { type: 'lot.changed' }>['what']): void {
    const lot = this.lot;
    if (!lot) return;
    this.exterior.lotChanged(what);
    if (what === 'fences' || what === 'roofs' || what === 'terrain') return; // nothing for the lot view, the objects or the people to do
    this.lotView.update(lot, what);
    if (what === 'objects' || what === 'all') this.objects.sync(lot);
    this.people?.invalidateSlots();
    this.objects.applyWallVisibility((id) => this.lotView.isLowered(id));
  }

  itemsChanged(): void { if (this.world && this.lot) this.objects.syncItems(this.world, this.lot.id); }

  /** An object got dirtier or cleaner, broke or was repaired: refresh its overlays. */
  objectConditionChanged(): void {
    if (!this.lot) return;
    this.objects.syncCondition(this.lot);
    this.exterior.gardensChanged();
  }

  personChanged(id: Id): void { if (this.world) this.people?.personChanged(this.world, id); }

  onTicks(): void { if (this.world) this.people?.onTicks(this.world); }

  say(actorId: Id, line: string): void { this.people?.say(actorId, line); }

  setSelected(id: Id | null): void { this.people?.setSelected(id); }

  setObjectHighlight(id: Id | null): void { this.highlighted = id; this.objects.setHighlight(id); }

  setPlacement(p: PlacementState | null): void {
    this.ghost = p;
    this.placement.set(p, this.lot, (x, z) => this.groundAt(x, z, p?.level ?? 0));
    this.objects.setHidden(p?.source === 'move' ? p.objectId : null);
  }

  setPaintPreview(h: PaintHighlight | null, finish: { designId: string; paletteId: string } | null, ok: boolean): void {
    this.lotView.setPaintPreview(h, finish, ok);
  }

  /** Build mode: the grid over the lot (off hides it, the construction preview and the room outline too). */
  setBuildGrid(on: boolean): void {
    this.buildGrid = on;
    this.buildView.setGrid(on ? this.lot : null);
  }

  /** The construction preview of the current build tool (null clears it). */
  setBuildPreview(h: BuildHighlight | null, ok: boolean, extras: BuildViewExtras): void {
    this.buildView.setHighlight(h, ok, extras, this.lot, this.world);
    this.buildBox = null;
    if (!h) return;
    const box = new THREE.Box3();
    const add = (x: number, z: number) => box.expandByPoint(this.tmpV.set(x, 0, z));
    for (const k of [...h.newWalls, ...h.removedWalls, ...h.openingEdges, ...h.removedOpeningEdges, ...h.existingWalls]) {
      const e = parseEdgeKey(k);
      add(e.x, e.z); add(e.dir === 'h' ? e.x + 1 : e.x, e.dir === 'h' ? e.z : e.z + 1);
    }
    for (const t of h.tiles) { add(t.x, t.z); add(t.x + 1, t.z + 1); }
    if (!box.isEmpty()) { box.min.y = levelY(h.level); box.max.y = levelY(h.level) + 1; this.buildBox = box; }
  }

  /** Outline of a hovered or selected room (null clears it). */
  setRoomOutline(room: RoomOutline | null, style: 'hover' | 'selected'): void {
    this.buildView.setRoom(room, style);
  }

  /** Floor height at a point of a level: ground-floor floors at 0, grass slightly lower; upper floors at their level's height. */
  groundAt(x: number, z: number, level = 0): number {
    const lot = this.lot;
    if (!lot) return 0;
    if (level > 0) return levelY(level);
    return lot.floors[tileKey(0, Math.floor(x), Math.floor(z))] ? 0 : GROUND_Y;
  }

  // ---------------------------------------------------------------------------------------------
  // Levels (Milestone 9)
  // ---------------------------------------------------------------------------------------------

  getActiveLevel(): number { return this.activeLevel; }

  /** Number of floors in use on the active lot (at least 1). */
  levelCount(): number { return this.lot ? Math.max(1, levelsInUse(this.lot)) : 1; }

  /** Shows floors 0..level, works on `level`: cutaway, picking and the camera plane follow. */
  setActiveLevel(level: number): void {
    const next = Math.max(0, Math.min(2, Math.trunc(level)));
    if (next === this.activeLevel) return;
    this.activeLevel = next;
    this.lotView.setActiveLevel(next);
    this.objects.setActiveLevel(next);
    this.people?.setActiveLevel(next);
    this.exterior.setView({ level: next });
    this.buildView.setLevel(next);
    this.rig.setLevelHeight(levelY(next));
    this.lastCutawayKey = '';
    this.updateCutaway(true);
    this.setPlacement(this.ghost);
  }

  // ---------------------------------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------------------------------

  getCutaway(): CutawayMode { return this.cutaway; }

  setCutaway(m: CutawayMode): void {
    this.cutaway = m;
    this.exterior.setView({ walls: m });
    this.updateCutaway(true);
  }

  /** Milestone 9: roofs on or off (the camera bar's Roof toggle). Roofs show only with the walls up, or while a roof tool is open. */
  setRoofsVisible(on: boolean): void { this.exterior.setView({ enabled: on }); }
  getRoofsVisible(): boolean { return this.exterior.roofsEnabled; }
  /** A roof tool is open: roofs show whatever the wall mode is. */
  setRoofEdit(on: boolean): void { this.exterior.setView({ editing: on }); }

  private updateCutaway(force = false): void {
    if (!this.lot) return;
    const d = this.rig.viewDir(this.tmpV);
    const key = `${this.cutaway}|${Math.sign(Math.round(d.x * 1000))}|${Math.sign(Math.round(d.z * 1000))}`;
    if (!force && key === this.lastCutawayKey) return;
    this.lastCutawayKey = key;
    this.lotView.setCutaway(this.cutaway, d);
    this.objects.applyWallVisibility((id) => this.lotView.isLowered(id));
  }

  /** Frames the lot's house (or the whole lot) in the visible area. */
  frameLot(instant = true, margin = 1.12): void {
    const lot = this.lot;
    if (!lot) return;
    const b = houseBounds(lot);
    const ppm = this.rig.fitPpm(b.x1 - b.x0, b.z1 - b.z0, levelY(this.activeLevel) + 2.8, this.orbiting ? 1.3 : margin);
    this.rig.glideTo((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, ppm, instant ? 0 : 0.6);
  }

  /**
   * Brings a picked thing or the placement ghost into view (see CameraRig.reveal), a moment later: the UI panels that
   * open together with it report their covered area first, so the decision uses the final visible area.
   */
  reveal(target: PickResult | PlacementState | null, zoomIn = true): void {
    const box = target ? this.revealBox(target) : null;
    this.pendingReveal = box ? { box, wait: 0.2, zoomIn } : null;
  }

  private revealBox(t: PickResult | PlacementState): THREE.Box3 | null {
    if (!this.lot) return null;
    if (!('kind' in t)) {
      const def = this.content.objects[t.defId];
      if (!def) return null;
      const s = rotatedSize(def.footprint, t.rot);
      const y = this.groundAt(t.x, t.z, t.level);
      return new THREE.Box3(new THREE.Vector3(t.x, y, t.z), new THREE.Vector3(t.x + s.w, y + Math.max(0.5, def.height), t.z + s.d));
    }
    switch (t.kind) {
      case 'person': {
        const p = this.people?.positionOf(t.personId);
        return p ? new THREE.Box3(new THREE.Vector3(p.x - 0.3, p.y, p.z - 0.3), new THREE.Vector3(p.x + 0.3, p.y + 1.8, p.z + 0.3)) : null;
      }
      case 'object':
      case 'item': return this.objects.boxOf(t.kind === 'object' ? t.objectId : t.itemId)?.clone() ?? null;
      default: return null;
    }
  }

  /** After a layout change: pans (never zooms) so the placement ghost, or else the selected Buy object, stays visible. */
  private keepInView(): void {
    if (this.ghost) this.reveal(this.ghost, false);
    else if (this.highlighted) this.reveal({ kind: 'object', objectId: this.highlighted }, false);
    else if (this.buildBox) this.pendingReveal = { box: this.buildBox.clone(), wait: 0.2, zoomIn: false };
  }

  private runPendingReveal(dt: number): void {
    const r = this.pendingReveal;
    if (!r) return;
    r.wait -= dt;
    if (r.wait > 0) return;
    this.pendingReveal = null;
    this.rig.reveal(r.box.min, r.box.max, 0.5, r.zoomIn);
  }

  focusOn(x: number, z: number, closeUp = false): void {
    this.rig.glideTo(x, z, closeUp ? Math.max(this.rig.ppm, DEFAULT_PPM) : undefined, 0.55, 0.8); // aim at the chest, not the feet
  }

  /** Floor level a person is on (null when they are not on the lot). */
  personLevel(id: Id): number | null {
    const loc = this.world?.people[id]?.location;
    return loc && loc.kind === 'lot' ? loc.level : null;
  }

  personPosition(id: Id): { x: number; z: number } | null {
    const p = this.people?.positionOf(id);
    if (p) return p;
    const loc = this.world?.people[id]?.location;
    return loc && loc.kind === 'lot' ? { x: loc.x, z: loc.z } : null;
  }

  setOrbit(on: boolean): void { this.orbiting = on; }

  // ---------------------------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------------------------

  /** Draws one frame for a mode. dt = real seconds; alpha = interpolation between ticks. */
  render(mode: GameMode, dt: number, alpha: number): void {
    const r = this.ctx.renderer;
    this.ctx.applyPendingResize(); // never resize after drawing
    if (mode === 'creator' && this.creator?.active) {
      this.creator.update(dt);
      r.toneMappingExposure = 1.08;
      r.render(this.creator.scene, this.creator.camera);
      this.captureStats();
      this.people?.setOverlayVisible(false);
      this.processPortrait();
      return;
    }
    const world = this.world, lot = this.lot;
    if (!world || !lot || mode === 'boot') {
      r.setClearColor(0xefe7da, 1);
      r.clear();
      this.people?.setOverlayVisible(false);
      this.processPortrait();
      return;
    }
    if (this.orbiting && !this.rig.isAnimating()) {
      this.rig.yaw += dt * (this.opts.reducedMotion ? 0.012 : 0.06);
      this.rig.setZoom(this.rig.ppm); // marks dirty
    }
    this.runPendingReveal(dt);
    this.rig.update(dt);
    this.updateCutaway();
    // clock-driven lighting
    const hour = hourOfDay(world.clock.minutes);
    this.lighting.update(hour);
    this.fog.color.copy(this.lighting.background);
    r.toneMappingExposure = this.lighting.exposure;
    this.objects.setNight(this.lighting.night, this.rig.target);
    this.objects.animate(dt, this.opts.reducedMotion);
    // people
    const people = this.people;
    if (people) {
      people.sync(world, lot.id);
      people.update(world, lot, dt, alpha, this.opts.reducedMotion);
      people.setOverlayVisible(mode === 'live' || mode === 'menu');
    }
    // doors open when someone is close
    const pos = people?.positions() ?? [];
    for (const d of this.lotView.doors) {
      d.target = pos.some((p) => Math.abs(p.x - d.x) < 0.95 && Math.abs(p.z - d.z) < 0.95 && Math.abs(p.y - levelY(d.level)) < 1.6) ? 1 : 0;
    }
    this.lotView.animateDoors(dt, this.opts.reducedMotion);
    // hover name tags (mouse)
    this.hoverTimer -= dt;
    if (this.hoverAt && this.hoverTimer <= 0 && people && mode === 'live') {
      this.hoverTimer = 0.12;
      const hit = people.pick(this.rig.rayAt(this.hoverAt.x, this.hoverAt.y, this.tmpRay), this.tmpV2);
      people.hovered = hit?.id ?? null;
    }
    r.render(this.scene, this.rig.camera);
    this.captureStats();
    if (people && (mode === 'live' || mode === 'menu')) people.updateOverlay(world, this.rig);
    if (this.rig.version !== this.lastCameraVersion) { this.lastCameraVersion = this.rig.version; this.onCamera?.(); }
    this.processPortrait();
  }

  private captureStats(): void {
    const info = this.ctx.renderer.info;
    this.lastStats = {
      drawCalls: info.render.calls, triangles: info.render.triangles,
      geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0,
    };
  }

  /** Renders one queued portrait (after the main frame so it never delays the world). */
  private processPortrait(): boolean {
    return (this.portraits?.process(this.ctx.renderer) ?? false) || this.openingThumbs.process(this.ctx.renderer);
  }

  stats(): RenderStats { return this.lastStats; }

  peopleStats(): { triangles: number; drawCalls: number } { return this.people?.stats() ?? { triangles: 0, drawCalls: 0 }; }

  // ---------------------------------------------------------------------------------------------
  // Picking and projection
  // ---------------------------------------------------------------------------------------------

  /**
   * What is under a screen point. People are picked forgivingly: anyone whose body passes within a finger's width
   * (24-36 px, scaled with the zoom) counts, the nearest wins, and with `cycle` a repeated tap at the same spot
   * steps to the next of several people standing together.
   */
  pick(sx: number, sy: number, mode: GameMode, cycle = false): PickResult {
    const lot = this.lot;
    if (!lot || !Number.isFinite(sx) || !Number.isFinite(sy)) return { kind: 'none' };
    this.rig.update(0);
    const ray = this.rig.rayAt(sx, sy, this.tmpRay);
    let best: { d: number; r: PickResult } | null = null;
    const consider = (d: number, r: PickResult) => { if (!best || d < best.d) best = { d, r }; };
    if (mode === 'live' && this.people) {
      const near = this.people.pickNear(ray, this.rig, sx, sy, Math.max(24, Math.min(36, this.rig.ppm * 0.4)));
      // only people that cannot be told apart (about as near to the tap as the best one) take part in cycling
      const tied = near.filter((n) => n.px <= near[0]!.px + 10);
      const h = tied.length ? tied[this.cyclePick(tied.map((n) => n.id), sx, sy, cycle)] : null;
      // exact hits keep the old small bias over furniture they use; near misses win against anything but a clearly nearer object
      if (h) consider(h.depth - (h.exact ? 0.25 : 1), { kind: 'person', personId: h.id });
    }
    if (mode === 'live' || mode === 'buy') {
      const h = this.objects.pick(ray, mode === 'buy', this.tmpV2);
      if (h) consider(h.distance, h.kind === 'item' ? { kind: 'item', itemId: h.id } : { kind: 'object', objectId: h.id });
    }
    const w = this.lotView.pickWall(ray);
    if (w) {
      const wall = lot.walls[w.wallId];
      if (wall) consider(w.distance, { kind: 'wall', wallId: w.wallId, side: w.side, tile: tileOnSide(wall, w.side), level: this.activeLevel });
    }
    const g = this.rig.groundAt(sx, sy, this.tmpV, levelY(this.activeLevel));
    if (g) {
      const tx = Math.floor(g.x), tz = Math.floor(g.z);
      if (tx >= 0 && tz >= 0 && tx < lot.width && tz < lot.depth) consider(g.distanceTo(ray.origin) + 0.001, { kind: 'floor', tile: { x: tx, z: tz }, level: this.activeLevel });
    }
    return best ? (best as { d: number; r: PickResult }).r : { kind: 'none' };
  }

  /** Index into `ids` (nearest first): 0, or the next one when `cycle` and the same people were picked at the same spot just before. */
  private cyclePick(ids: Id[], sx: number, sy: number, cycle: boolean): number {
    const key = ids.join('|');
    const c = this.cycleState;
    if (!cycle || ids.length < 2) { this.cycleState = null; return 0; }
    const now = performance.now();
    const again = c && c.key === key && c.version === this.rig.version && now - c.at < 4000 && Math.hypot(sx - c.x, sy - c.y) <= 14;
    const index = again ? (c.index + 1) % ids.length : 0;
    this.cycleState = { key, index, x: sx, y: sy, at: now, version: this.rig.version };
    return index;
  }

  /** Ground tile under a screen point (may be outside the lot). */
  tileAt(sx: number, sy: number): { x: number; z: number } | null {
    this.rig.update(0);
    const g = this.rig.groundAt(sx, sy, this.tmpV, levelY(this.activeLevel));
    return g ? { x: Math.floor(g.x), z: Math.floor(g.z) } : null;
  }

  /** Ground-plane point under a screen point in lot tile units (not snapped; may be outside the lot). */
  groundPointAt(sx: number, sy: number): { x: number; z: number } | null {
    this.rig.update(0);
    const g = this.rig.groundAt(sx, sy, this.tmpV, levelY(this.activeLevel));
    return g ? { x: g.x, z: g.z } : null;
  }

  worldToScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    this.rig.update(0);
    const o = { x: 0, y: 0, visible: false };
    return this.rig.project(x, y, z, o);
  }

  anchorOf(pick: PickResult): { x: number; y: number; visible: boolean } | null {
    const lot = this.lot;
    if (!lot) return null;
    this.rig.update(0);
    const v = this.tmpV;
    switch (pick.kind) {
      case 'person': {
        const h = this.people?.headOf(pick.personId, v);
        if (!h) return null;
        return { ...this.rig.project(h.x, h.y + 0.25, h.z, this.scr) };
      }
      case 'object':
      case 'item': {
        const b = this.objects.boxOf(pick.kind === 'object' ? pick.objectId : pick.itemId);
        if (!b) return null;
        return { ...this.rig.project((b.min.x + b.max.x) / 2, b.max.y + 0.1, (b.min.z + b.max.z) / 2, this.scr) };
      }
      case 'wall': {
        const b = this.lotView.wallBox(pick.wallId);
        if (!b) return null;
        return { ...this.rig.project((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2, this.scr) };
      }
      case 'floor':
        return { ...this.rig.project(pick.tile.x + 0.5, levelY(pick.level), pick.tile.z + 0.5, this.scr) };
      case 'none':
        return null;
    }
  }

  setInsets(i: Insets): void {
    const changed = this.rig.setInsets(i);
    if (changed && !this.pendingReveal) this.keepInView(); // panels or the device turned: keep the ghost / selected object on screen
    if (this.orbiting) { this.rig.update(0); this.frameLot(true); }
    this.creator?.setInsets(i);
  }

  // ---------------------------------------------------------------------------------------------
  // Pointer hover (name tags)
  // ---------------------------------------------------------------------------------------------

  private readonly onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const r = this.ctx.canvas.getBoundingClientRect();
    this.hoverAt = { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  private readonly onPointerLeave = () => {
    this.hoverAt = null;
    if (this.people) this.people.hovered = null;
  };

  dispose(): void {
    this.ctx.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.ctx.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.setWorld(null);
    this.people?.dispose();
    this.creator?.dispose();
    this.portraits?.dispose();
    this.openingThumbs.dispose();
    this.buildView.dispose();
    this.placement.dispose();
    this.objects.dispose();
    this.lotView.dispose();
    this.exterior.dispose();
    this.env.dispose();
    this.ctx.dispose();
  }
}

/** Bounding rectangle of the lot's walls on every level (the whole lot when there are none). */
export function houseBounds(lot: Lot): { x0: number; z0: number; x1: number; z1: number } {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const w of Object.values(lot.walls)) {
    x0 = Math.min(x0, w.x); z0 = Math.min(z0, w.z);
    x1 = Math.max(x1, w.dir === 'h' ? w.x + 1 : w.x); z1 = Math.max(z1, w.dir === 'v' ? w.z + 1 : w.z);
  }
  if (!Number.isFinite(x0)) return { x0: 0, z0: 0, x1: lot.width, z1: lot.depth };
  return { x0, z0, x1, z1 };
}
