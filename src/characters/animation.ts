// Game animation ids (src/core/anim.ts) mapped onto the shared clips, with crossfades, one-shot holds,
// reversed playback (lie down = LayToIdle backwards), static poses (sleep) and seated variants that layer an
// upper-body clip over the sitting pose (eat, phone, read...). One Animator per CharacterView.

import * as THREE from 'three';
import type { AnimId } from '../core/anim';
import type { Posture } from '../core/types';
import { LOCOMOTION_CLIPS } from './stagePose';

export interface AnimSpec {
  /** Source clip name (lower body too unless `upper` is set). */
  clip: string;
  loop: boolean;
  /** Play backwards from the end. */
  reverse?: boolean;
  /** Static pose at the clip start ('first') or end ('last'). */
  pose?: 'first' | 'last';
  /** Upper-body overlay clip (spine_03 and above, arms) played over `clip`. */
  upper?: string;
  upperLoop?: boolean;
  speed?: number;
  /** One-shots: what to play after finishing (holds the last frame when omitted). */
  then?: AnimId;
  /** Posture this animation leaves the person in. */
  posture: Posture | 'keep';
}

const S = (clip: string, loop: boolean, posture: AnimSpec['posture'], extra: Partial<AnimSpec> = {}): AnimSpec => ({ clip, loop, posture, ...extra });
const SIT = 'Sitting_Idle_Loop';

/** Standing (default) mapping for every AnimId. */
export const ANIM_CLIPS: Record<AnimId, AnimSpec> = {
  idle: S('Idle_Loop', true, 'standing'),
  walk: S('Walk_Loop', true, 'walking'),
  jog: S('Jog_Fwd_Loop', true, 'walking'),
  sitDown: S('Sitting_Enter', false, 'seated', { then: 'sitIdle' }),
  sitIdle: S(SIT, true, 'seated'),
  sitTalk: S('Sitting_Talking_Loop', true, 'seated'),
  standUp: S('Sitting_Exit', false, 'standing', { then: 'idle' }),
  talk: S('Idle_Talking_Loop', true, 'standing'),
  phone: S('Idle_TalkingPhone_Loop', true, 'standing'),
  foldArms: S('Idle_FoldArms_Loop', true, 'standing'),
  laugh: S('Yes', false, 'standing', { speed: 1.5, then: 'idle' }),
  disagree: S('Idle_No_Loop', false, 'standing', { then: 'idle' }),
  agree: S('Yes', false, 'standing', { then: 'idle' }),
  wave: S('Interact', false, 'standing', { then: 'idle', speed: 1.2 }),
  interact: S('Interact', false, 'standing', { then: 'idle' }),
  cook: S('Interact', true, 'standing', { speed: 0.75 }),
  openFridge: S('Chest_Open', false, 'standing', { then: 'idle' }),
  eat: S('Consume', true, 'standing'),
  pickUp: S('PickUp_Table', false, 'standing', { then: 'idle' }),
  carry: S('Walk_Carry_Loop', true, 'walking'),
  kneelFix: S('Fixing_Kneeling', true, 'standing'),
  clean: S('Push_Loop', true, 'standing', { speed: 0.9 }),
  lieDown: S('LayToIdle', false, 'lying', { reverse: true, then: 'sleep' }),
  sleep: S('LayToIdle', true, 'lying', { pose: 'first' }),
  getUp: S('LayToIdle', false, 'standing', { then: 'idle' }),
  water: S('Farm_Watering', true, 'standing'),
  plant: S('Farm_PlantSeed', false, 'standing', { then: 'idle' }),
  harvest: S('Farm_Harvest', false, 'standing', { then: 'idle' }),
  dance: S('Dance_Loop', true, 'standing'),
  exercise: S('Jog_Fwd_Loop', true, 'standing', { speed: 0.85 }),
  shower: S('Idle_Talking_Loop', true, 'standing', { speed: 0.8 }),
  toilet: S(SIT, true, 'seated'),
  read: S('Idle_TalkingPhone_Loop', true, 'standing', { speed: 0.6 }),
  watchTv: S('Idle_FoldArms_Loop', true, 'standing'),
  computer: S('Interact', true, 'standing', { speed: 0.6 }),
  swim: S('Swim_Fwd_Loop', true, 'standing'),
  float: S('Swim_Idle_Loop', true, 'standing'),
};

/** Variants used while seated (Sitting_* base, upper-body overlays). */
export const SEATED_CLIPS: Partial<Record<AnimId, AnimSpec>> = {
  idle: S(SIT, true, 'seated'),
  talk: S('Sitting_Talking_Loop', true, 'seated'),
  phone: S(SIT, true, 'seated', { upper: 'Idle_TalkingPhone_Loop', upperLoop: true }),
  foldArms: S(SIT, true, 'seated', { upper: 'Idle_FoldArms_Loop', upperLoop: true }),
  laugh: S(SIT, true, 'seated', { upper: 'Yes', upperLoop: false, speed: 1.5, then: 'sitIdle' }),
  agree: S(SIT, true, 'seated', { upper: 'Yes', upperLoop: false, then: 'sitIdle' }),
  disagree: S(SIT, true, 'seated', { upper: 'Idle_No_Loop', upperLoop: false, then: 'sitIdle' }),
  eat: S(SIT, true, 'seated', { upper: 'Consume', upperLoop: true }),
  read: S(SIT, true, 'seated'),
  computer: S('Sitting_Talking_Loop', true, 'seated', { speed: 0.55 }),
  watchTv: S(SIT, true, 'seated'),
  toilet: S(SIT, true, 'seated'),
  interact: S(SIT, true, 'seated', { upper: 'Interact', upperLoop: false, then: 'sitIdle' }),
};

/** Variants while lying (in bed). */
export const LYING_CLIPS: Partial<Record<AnimId, AnimSpec>> = {
  idle: ANIM_CLIPS.sleep,
  talk: ANIM_CLIPS.sleep,
  read: ANIM_CLIPS.sleep,
  watchTv: ANIM_CLIPS.sleep,
};

/** Bones driven by an upper-body overlay. */
const UPPER = /^(spine_03|neck_01|Head|clavicle_[lr]|upperarm_[lr]|lowerarm_[lr]|hand_[lr])\./;

/** Resolves the clip spec for an animation in a posture. */
export function resolveAnim(id: AnimId, posture: Posture): AnimSpec {
  if (posture === 'seated') {
    const s = SEATED_CLIPS[id];
    if (s) return s;
    if (id === 'sitDown') return { ...ANIM_CLIPS.sitIdle };
  }
  if (posture === 'lying') {
    const s = LYING_CLIPS[id];
    if (s) return s;
    if (id === 'lieDown') return ANIM_CLIPS.sleep;
  }
  return ANIM_CLIPS[id];
}

/** Clip subset with only (or without) the upper-body tracks; cached on the source clip. */
function maskedClip(clip: THREE.AnimationClip, upper: boolean): THREE.AnimationClip {
  const key = upper ? 'hsUpper' : 'hsLower';
  const cache = clip.userData as Record<string, THREE.AnimationClip | undefined>;
  const hit = cache[key];
  if (hit) return hit;
  const tracks = clip.tracks.filter((tr) => UPPER.test(tr.name) === upper);
  const out = new THREE.AnimationClip(`${clip.name}:${key}`, clip.duration, tracks);
  cache[key] = out;
  return out;
}

interface Playing { id: AnimId; spec: AnimSpec; actions: THREE.AnimationAction[]; main: THREE.AnimationAction }

export class Animator {
  readonly mixer: THREE.AnimationMixer;
  private current: Playing | null = null;
  private fading: Array<{ action: THREE.AnimationAction; until: number }> = [];
  private time = 0;
  private postureNow: Posture = 'standing';
  /** Extra speed factor of the locomotion clips (ground speed over the clips' natural speed); 1 = as authored. */
  private walkRate = 1;

  /** `cadence` speeds up (or slows down) the walk and jog cycles: short-legged stages take quicker steps (stagePose.ts). */
  constructor(root: THREE.Object3D, private clips: Map<string, THREE.AnimationClip>, private cadence = 1) {
    this.mixer = new THREE.AnimationMixer(root);
    this.mixer.addEventListener('finished', (e) => this.onFinished(e.action as THREE.AnimationAction));
  }

  get posture(): Posture { return this.postureNow; }
  get playing(): AnimId | null { return this.current?.id ?? null; }

  play(id: AnimId, opts: { fade?: number; posture?: Posture } = {}): void {
    const posture = opts.posture ?? this.inferPosture(id);
    const spec = resolveAnim(id, posture);
    const fade = opts.fade ?? 0.25;
    if (this.current && this.current.id === id && this.current.spec === spec && spec.loop) return;
    const clip = this.clips.get(spec.clip);
    if (!clip) return;
    const actions: THREE.AnimationAction[] = [];
    const baseClip = spec.upper ? maskedClip(clip, false) : clip;
    const main = this.mixer.clipAction(baseClip);
    this.prepare(main, spec, spec.loop || !!spec.pose);
    actions.push(main);
    if (spec.upper) {
      const up = this.clips.get(spec.upper);
      if (up) {
        const a = this.mixer.clipAction(maskedClip(up, true));
        this.prepare(a, { ...spec, reverse: false, pose: undefined }, spec.upperLoop ?? true);
        actions.push(a);
      }
    }
    // fade out the previous actions that are not reused
    if (this.current) {
      for (const a of this.current.actions) if (!actions.includes(a)) this.fadeOut(a, fade);
    }
    for (const a of actions) {
      this.fading = this.fading.filter((fd) => fd.action !== a);
      a.enabled = true;
      a.setEffectiveWeight(1);
      if (fade > 0 && this.current) a.fadeIn(fade);
      a.play();
    }
    this.current = { id, spec, actions, main: spec.upper ? (actions[1] ?? main) : main };
    if (spec.posture !== 'keep') this.postureNow = spec.posture === 'walking' ? 'standing' : spec.posture;
  }

  /**
   * Matches the walk and jog cycles to the ground speed (`rate` = actual speed / the speed the clips were authored for, so fast
   * game speeds do not skate): applied at once to a locomotion clip that is playing, and to every one started later.
   */
  setWalkRate(rate: number): void {
    const r = Math.max(0.2, Math.min(4, rate));
    if (Math.abs(r - this.walkRate) < 0.02) return;
    this.walkRate = r;
    const cur = this.current;
    if (cur && LOCOMOTION_CLIPS.has(cur.spec.clip) && !cur.spec.reverse && !cur.spec.pose) {
      cur.main.timeScale = (cur.spec.speed ?? 1) * this.cadence * r;
    }
  }

  private prepare(a: THREE.AnimationAction, spec: AnimSpec, loop: boolean): void {
    a.reset();
    a.clampWhenFinished = true;
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    const speed = (spec.speed ?? 1) * (LOCOMOTION_CLIPS.has(spec.clip) ? this.cadence * this.walkRate : 1);
    if (spec.pose) {
      a.setLoop(THREE.LoopOnce, 1);
      a.time = spec.pose === 'first' ? 0 : a.getClip().duration;
      a.timeScale = 0;
      return;
    }
    if (spec.reverse) {
      a.time = a.getClip().duration;
      a.timeScale = -speed;
    } else {
      a.timeScale = speed;
    }
  }

  private fadeOut(a: THREE.AnimationAction, fade: number): void {
    if (fade <= 0) { a.stop(); return; }
    a.fadeOut(fade);
    this.fading.push({ action: a, until: this.time + fade + 0.05 });
  }

  private onFinished(action: THREE.AnimationAction): void {
    const cur = this.current;
    if (!cur || action !== cur.main) return;
    if (cur.spec.then) this.play(cur.spec.then, { fade: 0.3, posture: this.postureNow });
  }

  private inferPosture(id: AnimId): Posture {
    if (id === 'sitDown' || id === 'sitIdle' || id === 'sitTalk' || id === 'toilet') return 'seated';
    if (id === 'lieDown' || id === 'sleep') return 'lying';
    if (id === 'standUp' || id === 'getUp' || id === 'walk' || id === 'jog' || id === 'carry') return 'standing';
    return this.postureNow;
  }

  update(dt: number): void {
    this.time += dt;
    this.mixer.update(dt);
    if (this.fading.length) {
      const keep: typeof this.fading = [];
      for (const fd of this.fading) {
        if (this.time >= fd.until) fd.action.stop(); else keep.push(fd);
      }
      this.fading = keep;
    }
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}
