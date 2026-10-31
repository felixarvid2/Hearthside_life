// A simple family tree drawing: one row per generation (familyGenerations), parents above children, partners,
// spouses and siblings side by side, every tie drawn with its own line style and a text label (never colour only).

import { familyGenerations, memberName, TIE_NAMES } from '../../characters/creator';
import type { HouseholdDraft } from '../../core/drafts';
import type { FamilyTie } from '../../core/types';
import { h } from '../kit/dom';

const NS = 'http://www.w3.org/2000/svg';
const BOX_W = 116, BOX_H = 50, GAP_X = 34, GAP_Y = 64, PAD = 18;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}

function clip(text: string, max: number): string { return text.length > max ? `${text.slice(0, max - 1)}…` : text; }

interface Link { a: number; b: number; tie: FamilyTie }

/** Normalised ties: one entry per pair; parent/child stored as a = parent. */
function links(draft: HouseholdDraft): Link[] {
  const out: Link[] = [];
  const seen = new Set<string>();
  for (const t of draft.ties) {
    if (t.tie === 'none' || t.a === t.b) continue;
    const key = `${Math.min(t.a, t.b)}|${Math.max(t.a, t.b)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // t: b is a's tie. For parent/child normalise to { a: parent, b: child }.
    if (t.tie === 'parent') out.push({ a: t.b, b: t.a, tie: 'parent' });
    else if (t.tie === 'child') out.push({ a: t.a, b: t.b, tie: 'parent' });
    else out.push({ a: t.a, b: t.b, tie: t.tie });
  }
  return out;
}

/** Builds the tree element (scrolls horizontally when wider than the panel). */
export function familyTree(draft: HouseholdDraft, current: number): HTMLElement {
  const n = draft.members.length;
  const gens = familyGenerations(draft);
  const ls = links(draft);
  const rows: number[][] = [];
  gens.forEach((g, i) => { (rows[g] ??= []).push(i); });
  // keep partners/spouses next to each other inside a row
  for (const row of rows) {
    if (!row) continue;
    for (const l of ls) {
      if (l.tie !== 'partner' && l.tie !== 'spouse') continue;
      const ia = row.indexOf(l.a), ib = row.indexOf(l.b);
      if (ia < 0 || ib < 0 || Math.abs(ia - ib) === 1) continue;
      row.splice(ib, 1);
      row.splice(row.indexOf(l.a) + 1, 0, l.b);
    }
  }
  const compact = rows.filter((r) => r && r.length > 0);
  const widest = Math.max(1, ...compact.map((r) => r.length));
  const width = PAD * 2 + widest * BOX_W + (widest - 1) * GAP_X;
  const height = PAD * 2 + compact.length * BOX_H + (compact.length - 1) * GAP_Y + 14;
  const pos = new Map<number, { x: number; y: number; row: number; col: number }>();
  compact.forEach((row, r) => {
    const rw = row.length * BOX_W + (row.length - 1) * GAP_X;
    const x0 = (width - rw) / 2;
    row.forEach((m, c) => pos.set(m, { x: x0 + c * (BOX_W + GAP_X), y: PAD + 14 + r * (BOX_H + GAP_Y), row: r, col: c }));
  });

  const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', class: 'cr-tree-svg' });
  const lines = svg('g', { class: 'cr-tree-lines' });
  const labels = svg('g', { class: 'cr-tree-labels' });
  root.append(lines, labels);
  const label = (x: number, y: number, text: string) => {
    const w = text.length * 6.6 + 10;
    labels.append(svg('rect', { x: x - w / 2, y: y - 9, width: w, height: 17, rx: 8, class: 'cr-tree-label-bg' }), svg('text', { x, y: y + 4, 'text-anchor': 'middle', class: 'cr-tree-label' }, text));
  };
  const lanes = new Map<number, number>();
  const description: string[] = [];
  for (const l of ls) {
    const pa = pos.get(l.a), pb = pos.get(l.b);
    if (!pa || !pb) continue;
    const cls = `cr-tree-line cr-tie-${l.tie}`;
    const nameA = memberName(draft.members[l.a], l.a), nameB = memberName(draft.members[l.b], l.b);
    if (l.tie === 'parent') {
      description.push(`${nameA} is ${nameB}'s parent.`);
      const x1 = pa.x + BOX_W / 2, y1 = pa.y + BOX_H, x2 = pb.x + BOX_W / 2, y2 = pb.y;
      const my = (y1 + y2) / 2;
      lines.append(svg('path', { d: `M${x1},${y1} V${my} H${x2} V${y2}`, class: cls, fill: 'none' }));
      continue;
    }
    description.push(`${nameB} is ${nameA}'s ${TIE_NAMES[l.tie].toLowerCase()}.`);
    if (pa.row === pb.row) {
      const left = pa.col < pb.col ? pa : pb, right = pa.col < pb.col ? pb : pa;
      if (right.col - left.col === 1) {
        const y = left.y + BOX_H / 2, x1 = left.x + BOX_W, x2 = right.x;
        if (l.tie === 'spouse') {
          lines.append(svg('path', { d: `M${x1},${y - 3} H${x2} M${x1},${y + 3} H${x2}`, class: cls, fill: 'none' }));
        } else lines.append(svg('path', { d: `M${x1},${y} H${x2}`, class: cls, fill: 'none' }));
        label((x1 + x2) / 2, y - 16, TIE_NAMES[l.tie]);
      } else {
        const lane = lanes.get(left.row) ?? 0;
        lanes.set(left.row, lane + 1);
        const top = left.y - 8 - lane * 10;
        const x1 = left.x + BOX_W / 2 + 10, x2 = right.x + BOX_W / 2 - 10;
        lines.append(svg('path', { d: `M${x1},${left.y} V${top} H${x2} V${right.y}`, class: cls, fill: 'none' }));
        label((x1 + x2) / 2, top, TIE_NAMES[l.tie]);
      }
    } else {
      const x1 = pa.x + BOX_W / 2, y1 = pa.y + BOX_H / 2, x2 = pb.x + BOX_W / 2, y2 = pb.y + BOX_H / 2;
      lines.append(svg('path', { d: `M${x1},${y1} L${x2},${y2}`, class: cls, fill: 'none' }));
      label((x1 + x2) / 2, (y1 + y2) / 2, TIE_NAMES[l.tie]);
    }
  }
  for (let i = 0; i < n; i++) {
    const p = pos.get(i);
    const m = draft.members[i];
    if (!p || !m) continue;
    const g = svg('g', { class: ['cr-tree-box', i === current ? 'is-current' : ''].join(' ').trim() });
    g.append(
      svg('rect', { x: p.x, y: p.y, width: BOX_W, height: BOX_H, rx: 10 }),
      svg('text', { x: p.x + BOX_W / 2, y: p.y + 21, 'text-anchor': 'middle', class: 'cr-tree-name' }, clip(m.firstName.trim() || `Person ${i + 1}`, 14)),
      svg('text', { x: p.x + BOX_W / 2, y: p.y + 38, 'text-anchor': 'middle', class: 'cr-tree-sub' }, clip(m.lastName.trim(), 16)),
    );
    root.append(g);
  }
  root.setAttribute('aria-label', description.length > 0 ? `Family tree. ${description.join(' ')}` : 'Family tree. No relationships set.');

  const legend = h('div', { class: 'cr-tree-legend', attrs: { 'aria-hidden': 'true' } },
    ...(['parent', 'spouse', 'partner', 'sibling', 'roommate'] as const).map((t) => h('span', { class: 'cr-legend-item' },
      h('span', { class: ['cr-legend-line', `cr-legend-${t}`] }), h('span', { text: t === 'parent' ? 'Parent and child' : TIE_NAMES[t] }))));
  return h('div', { class: 'cr-tree' }, h('div', { class: 'cr-tree-scroll' }, root), legend);
}

