// A tiny recording Canvas2D stand-in for painter tests. It validates every numeric argument (finite),
// every colour string, and save/restore balance, and keeps a compact log for determinism checks.

import type { Canvas2DLike } from '../../../src/render/textures/painters';

const COLOR = /^(#[0-9a-f]{6}|rgba\(\d{1,3},\d{1,3},\d{1,3},(0|1|0?\.\d+|1\.0+)\))$/i;

export class FakeCanvas implements Canvas2DLike {
  log: string[] = [];
  depth = 0;
  maxDepth = 0;
  calls = 0;
  private fillColor = '#000000';
  private strokeColor = '#000000';
  private alpha = 1;
  private width = 1;
  lineCap = 'butt';
  lineJoin = 'miter';

  get fillStyle(): string { return this.fillColor; }
  set fillStyle(v: string | object) { this.fillColor = this.color(v); this.rec('fs', this.fillColor); }
  get strokeStyle(): string { return this.strokeColor; }
  set strokeStyle(v: string | object) { this.strokeColor = this.color(v); this.rec('ss', this.strokeColor); }
  get globalAlpha(): number { return this.alpha; }
  set globalAlpha(v: number) { this.nums('ga', [v]); if (v < 0 || v > 1) throw new Error(`globalAlpha ${v}`); this.alpha = v; }
  get lineWidth(): number { return this.width; }
  set lineWidth(v: number) { this.nums('lw', [v]); if (v <= 0) throw new Error(`lineWidth ${v}`); this.width = v; }

  save(): void { this.depth++; this.maxDepth = Math.max(this.maxDepth, this.depth); this.rec('save'); }
  restore(): void { if (--this.depth < 0) throw new Error('restore without save'); this.rec('restore'); }
  translate(x: number, y: number): void { this.nums('t', [x, y]); }
  scale(x: number, y: number): void { this.nums('sc', [x, y]); }
  rotate(a: number): void { this.nums('r', [a]); }
  beginPath(): void { this.rec('bp'); }
  closePath(): void { this.rec('cp'); }
  moveTo(x: number, y: number): void { this.nums('m', [x, y]); }
  lineTo(x: number, y: number): void { this.nums('l', [x, y]); }
  quadraticCurveTo(a: number, b: number, c: number, d: number): void { this.nums('q', [a, b, c, d]); }
  bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number): void { this.nums('b', [a, b, c, d, e, f]); }
  arc(x: number, y: number, r: number, a0: number, a1: number): void {
    if (r < 0) throw new Error(`negative arc radius ${r}`);
    this.nums('a', [x, y, r, a0, a1]);
  }
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number): void {
    if (rx < 0 || ry < 0) throw new Error(`negative ellipse radius ${rx},${ry}`);
    this.nums('e', [x, y, rx, ry, rot, a0, a1]);
  }
  rect(x: number, y: number, w: number, h: number): void { this.nums('rc', [x, y, w, h]); }
  fill(): void { this.rec('f'); }
  stroke(): void { this.rec('s'); }
  fillRect(x: number, y: number, w: number, h: number): void { this.nums('fr', [x, y, w, h]); }
  clip(): void { this.rec('clip'); }

  private color(v: string | object): string {
    if (typeof v !== 'string' || !COLOR.test(v)) throw new Error(`bad colour ${String(v)}`);
    return v;
  }
  private nums(op: string, args: number[]): void {
    for (const a of args) if (!Number.isFinite(a)) throw new Error(`${op}: non-finite argument in ${args.join(',')}`);
    this.rec(op, args.map((a) => a.toFixed(5)).join(','));
  }
  private rec(op: string, data = ''): void {
    this.calls++;
    // keep the log bounded but representative: every call contributes to a rolling hash
    this.hash = (Math.imul(this.hash ^ hashStr(op + data), 0x01000193) >>> 0);
    if (this.log.length < 2000) this.log.push(op + ' ' + data);
  }
  hash = 0x811c9dc5;
}

function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
