// The WebGL2 renderer of the single game canvas: colour management, tone mapping, a drawing-buffer pixel
// budget and resize handling.
//
// Resizing clears the drawing buffer, so a resize applied after drawing would show an empty canvas for a
// frame (a black/background flash). Resize requests (ResizeObserver on the canvas, visualViewport, quality
// changes) only set a flag; applyPendingResize() runs at the START of a frame, right before drawing.

import * as THREE from 'three';

export type Quality = 'low' | 'high';

/** Drawing-buffer pixel budgets per quality (device pixels). */
export const PIXEL_BUDGET: Record<Quality, number> = { low: 1.2e6, high: 2.2e6 };
export const MAX_PIXEL_RATIO = 2;

export function hasWebGL2(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

export class RenderContext {
  readonly renderer: THREE.WebGLRenderer;
  /** CSS size of the canvas (its getBoundingClientRect). */
  width = 1;
  height = 1;
  pixelRatio = 1;
  private pending = true;
  private quality: Quality;
  private readonly ro: ResizeObserver | null;
  private readonly onWindowResize = () => { this.pending = true; };
  /** Called after a resize was applied (camera frustum, overlay). */
  onResize: ((w: number, h: number) => void) | null = null;

  constructor(readonly canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality === 'high',
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      stencil: false,
    });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.12;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.enabled = false;
    r.setClearColor(0xefe7da, 1);
    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { this.pending = true; }) : null;
    this.ro?.observe(canvas);
    window.addEventListener('resize', this.onWindowResize);
    window.addEventListener('orientationchange', this.onWindowResize);
    window.visualViewport?.addEventListener('resize', this.onWindowResize);
  }

  setQuality(q: Quality): void {
    if (q === this.quality) return;
    this.quality = q;
    this.pending = true;
  }

  getQuality(): Quality { return this.quality; }

  requestResize(): void { this.pending = true; }

  /** Applies a pending resize; returns true when the size changed. Call at the start of a frame. */
  applyPendingResize(): boolean {
    if (!this.pending) return false;
    this.pending = false;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const budget = PIXEL_BUDGET[this.quality];
    const ratio = Math.max(0.5, Math.min(dpr, Math.sqrt(budget / (w * h))));
    const pr = Math.round(ratio * 100) / 100;
    if (w === this.width && h === this.height && pr === this.pixelRatio) return false;
    this.width = w;
    this.height = h;
    this.pixelRatio = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.onResize?.(w, h);
    return true;
  }

  dispose(): void {
    this.ro?.disconnect();
    window.removeEventListener('resize', this.onWindowResize);
    window.removeEventListener('orientationchange', this.onWindowResize);
    window.visualViewport?.removeEventListener('resize', this.onWindowResize);
    this.renderer.dispose();
  }
}
