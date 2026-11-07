// Face & Body step: frame, body presets and sliders, skin, face presets and grouped face sliders, eyes and brows,
// freckles, blush and lips. Face sections switch the preview to the face close-up automatically.

import type { CreatorResult } from '../../../characters/creator';
import { browFor } from '../../../characters/names';
import type { ParamDef, Swatch } from '../../../content/types';
import { segmented, tabs } from '../../kit/components';
import { h } from '../../kit/dom';
import type { FaceBodySection, StepDef } from '../context';
import { lookOf, modularBodySection } from './modularParts';
import { Binder, choiceChips, colorField, hint, percentFormat, section, signedFormat, sliderField, smallButton } from '../widgets';

const SECTIONS: ReadonlyArray<{ id: FaceBodySection; label: string; icon: string }> = [
  { id: 'body', label: 'Body', icon: 'person' },
  { id: 'skin', label: 'Skin', icon: 'sun' },
  { id: 'face', label: 'Face shape', icon: 'face' },
  { id: 'eyes', label: 'Eyes & brows', icon: 'sparkle' },
  { id: 'details', label: 'Makeup & marks', icon: 'heart' },
];
const FACE_SECTIONS: readonly FaceBodySection[] = ['face', 'eyes', 'details'];

const FACE_GROUP_NAMES: Record<string, string> = {
  head: 'Face shape and jaw', eyes: 'Eyes', brows: 'Brows', nose: 'Nose', mouth: 'Mouth', ears: 'Ears',
};
const BODY_GROUP_NAMES: Record<string, string> = {
  overall: 'Overall', 'upper body': 'Upper body', 'lower body': 'Lower body', limbs: 'Arms and legs',
};

/** Lip colours offered as swatches (custom colour for anything else). */
const LIP_COLORS: Swatch[] = [
  { id: 'lip-natural', name: 'Natural', color: '#c27a6e' },
  { id: 'lip-nude', name: 'Nude', color: '#b9877a' },
  { id: 'lip-rose', name: 'Rose', color: '#c2667a' },
  { id: 'lip-coral', name: 'Coral', color: '#d27a6e' },
  { id: 'lip-berry', name: 'Berry', color: '#7a3045' },
  { id: 'lip-red', name: 'Classic red', color: '#9e2b3a' },
  { id: 'lip-plum', name: 'Plum', color: '#6a3550' },
  { id: 'lip-brown', name: 'Cocoa', color: '#6b4034' },
];

function groupParams(defs: readonly ParamDef[]): Array<{ group: string; params: ParamDef[] }> {
  const out: Array<{ group: string; params: ParamDef[] }> = [];
  for (const d of defs) {
    let g = out.find((x) => x.group === d.group);
    if (!g) { g = { group: d.group, params: [] }; out.push(g); }
    g.params.push(d);
  }
  return out;
}

const isFaceSection = (s: FaceBodySection) => FACE_SECTIONS.includes(s);

export const faceBodyStep: StepDef = {
  key: (ctx) => `${ctx.session.currentIndex}|${ctx.ui.faceBodySection}|${ctx.session.current.appearance.frame}|${ctx.modular() ? `m:${lookOf(ctx.session).bodyId}` : ''}`,
  enter(ctx) { if (isFaceSection(ctx.ui.faceBodySection)) ctx.preview.enterFace(); },
  leave(ctx) { ctx.preview.leaveFace(); },
  build(ctx) {
    const s = () => ctx.session;
    const a = () => ctx.session.current.appearance;
    const content = ctx.api.content;
    const b = new Binder();
    const commit = () => s().endEdit();

    const modular = ctx.modular();
    // Quaternius bodies have no makeup layer: that section is classic-only
    const sections = modular ? SECTIONS.filter((x) => x.id !== 'details') : SECTIONS;
    if (modular && ctx.ui.faceBodySection === 'details') ctx.ui.faceBodySection = 'body';
    const sub = tabs({
      label: 'Face and body sections',
      items: sections.map((x) => ({ id: x.id, label: x.label, icon: x.icon })),
      value: ctx.ui.faceBodySection,
      onChange: (id) => {
        const next = id as FaceBodySection;
        if (next === ctx.ui.faceBodySection) return;
        ctx.ui.faceBodySection = next;
        if (isFaceSection(next)) ctx.preview.enterFace(); else ctx.preview.leaveFace();
        ctx.refresh();
      },
    });
    sub.el.classList.add('cr-subtabs');

    const paramSlider = (d: ParamDef, kind: 'body' | 'face') => b.add(sliderField({
      label: d.name, min: d.min, max: d.max, step: d.step,
      value: () => (kind === 'body' ? a().body[d.id] : a().face.params[d.id]) ?? 0,
      format: signedFormat,
      onInput: (v) => ctx.report(kind === 'body' ? s().setBodyParam(d.id, v) : s().setFaceParam(d.id, v)),
      onCommit: commit,
    }));

    const parts: HTMLElement[] = [];
    const classicNote = (what: string) => hint(`${what} apply to the classic character style. The Quaternius style uses the body above.`);
    switch (ctx.ui.faceBodySection) {
      case 'body': {
        if (modular) {
          parts.push(...modularBodySection(ctx, modular, b, 'body'), classicNote('The classic body sliders and presets'));
          parts.push(h('div', { class: 'cr-actions' }, smallButton('Reset body', 'undo', () => ctx.report(s().resetCategory('body')))));
          break;
        }
        const frame = segmented<'a' | 'b'>({
          label: 'Body frame',
          options: [{ id: 'a', label: 'Frame A (broader)' }, { id: 'b', label: 'Frame B (curvier)' }],
          value: a().frame,
          onChange: (v) => ctx.report(s().setFrame(v)),
        });
        b.fn(() => frame.set(a().frame));
        parts.push(section('Frame', frame.el, hint('Frames are body presentation only. They never limit hair, clothing, pronouns or anything else.')));
        const presets = Object.values(content.bodyPresets ?? {}).filter((p) => p.frame === a().frame);
        if (presets.length > 0) {
          parts.push(section('Body presets', b.add(choiceChips({
            label: 'Body presets', hideLabel: true,
            options: presets.map((p) => ({ id: p.id, label: p.name })),
            value: () => a().bodyPresetId,
            onPick: (id) => ctx.report(s().applyBodyPreset(id)),
          }))));
        }
        const groups = groupParams(content.bodyParams ?? []);
        for (const g of groups) parts.push(section(BODY_GROUP_NAMES[g.group] ?? g.group, ...g.params.map((d) => paramSlider(d, 'body'))));
        if (groups.length === 0) parts.push(hint('Body controls are not available yet.'));
        parts.push(h('div', { class: 'cr-actions' },
          smallButton('Reset body', 'undo', () => ctx.report(s().resetCategory('body'))),
        ), hint('Height is the same for everyone for now, so every chair, bed and doorway fits.'));
        break;
      }
      case 'skin': {
        parts.push(section('Skin tone', b.add(colorField({
          label: 'Skin tone', swatches: content.skinTones ?? [], value: () => a().skin,
          onPick: (c) => ctx.report(s().setSkin(c)), onCommit: commit,
        })), hint('Use the rainbow button for any custom colour.')));
        break;
      }
      case 'face': {
        if (modular) {
          const morphs = modularBodySection(ctx, modular, b, 'face');
          parts.push(...(morphs.length > 0 ? morphs : [hint('Face shape controls for this style are coming soon.')]), classicNote('The classic face sliders and presets'));
          break;
        }
        const presets = Object.values(content.facePresets ?? {});
        if (presets.length > 0) {
          parts.push(section('Face presets', b.add(choiceChips({
            label: 'Face presets', hideLabel: true,
            options: presets.map((p) => ({ id: p.id, label: p.name })),
            value: () => a().face.presetId,
            onPick: (id) => ctx.report(s().applyFacePreset(id)),
          })), hint('A preset sets every face control; adjust any of them afterwards.')));
        }
        const groups = groupParams(content.faceParams ?? []);
        const wrap = h('div', { class: 'cr-groups' });
        for (const g of groups) {
          const det = h('details', { class: 'cr-group' });
          det.open = ctx.ui.faceGroups.has(g.group);
          det.addEventListener('toggle', () => { if (det.open) ctx.ui.faceGroups.add(g.group); else ctx.ui.faceGroups.delete(g.group); });
          det.append(h('summary', { class: 'cr-group-title', text: FACE_GROUP_NAMES[g.group] ?? g.group }), ...g.params.map((d) => paramSlider(d, 'face')));
          wrap.appendChild(det);
        }
        parts.push(groups.length > 0 ? section('Face controls', wrap) : hint('Face controls are not available yet.'));
        parts.push(h('div', { class: 'cr-actions' }, smallButton('Reset face', 'undo', () => ctx.report(s().resetCategory('face')))));
        break;
      }
      case 'eyes': {
        if (modular) {
          parts.push(section('Eyes', b.add(colorField({
            label: 'Eye colour', swatches: content.eyeColors ?? [], value: () => a().face.eyeColor,
            onPick: (c) => ctx.report(s().setEyeColor(c)), onCommit: commit,
          })), hint('Eyebrows follow the hair colour in this style.')));
          break;
        }
        parts.push(section('Eyes', b.add(colorField({
          label: 'Eye colour', swatches: content.eyeColors ?? [], value: () => a().face.eyeColor,
          onPick: (c) => ctx.report(s().setEyeColor(c)), onCommit: commit,
        }))));
        const brows = Object.values(content.browStyles ?? {});
        parts.push(section('Brows',
          brows.length > 0 ? b.add(choiceChips({ label: 'Brow style', options: brows.map((x) => ({ id: x.id, label: x.name })), value: () => a().face.browStyle, onPick: (id) => ctx.report(s().setBrowStyle(id)) })) : null,
          b.add(colorField({
            label: 'Brow colour', swatches: content.hairColors ?? [], value: () => a().face.browColor,
            onPick: (c) => ctx.report(s().setBrowColor(c)), onCommit: commit,
          })),
          h('div', { class: 'cr-actions' }, smallButton('Match hair colour', 'hair', () => { ctx.report(s().setBrowColor(browFor(a().hair.color))); commit(); }))));
        break;
      }
      case 'details': {
        const unit = (label: string, get: () => number, set: (v: number) => CreatorResult) => b.add(sliderField({
          label, min: 0, max: 1, step: 0.05, value: get, format: percentFormat, onInput: (v) => ctx.report(set(v)), onCommit: commit,
        }));
        parts.push(section('Skin details',
          unit('Freckles', () => a().face.freckles, (v) => s().setFreckles(v)),
          unit('Blush', () => a().face.blush, (v) => s().setBlush(v))));
        parts.push(section('Lips',
          unit('Lip tint', () => a().face.lipTint, (v) => s().setLipTint(v)),
          b.add(colorField({ label: 'Lip colour', swatches: LIP_COLORS, value: () => a().face.lipColor, onPick: (c) => ctx.report(s().setLipColor(c)), onCommit: commit })),
          hint('Lip tint sets how strongly the lip colour shows; 0% keeps natural lips.')));
        break;
      }
    }

    const el = h('div', { class: 'cr-step cr-step-facebody' }, sub.el, ...parts);
    return { el, sync: () => b.sync() };
  },
};
