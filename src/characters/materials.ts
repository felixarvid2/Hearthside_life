// Character materials: MeshStandardMaterial with shader patches. Every CharacterView owns its material
// instances (per-character colours and face/cloth parameters live in their uniforms); the compiled programs
// are shared because the patch source is identical (customProgramCacheKey).
//
// Skin: matte skin with painted face (eyes, brows, lips, nostrils, blush, freckles, stubble) computed in
// head-local bind space, plus "coverage" push-in of body regions hidden under opaque garments.
// Cloth: patterns and fabric texture in bind-pose cloth coordinates, trims, double-sided with darker inside.
// Hair: strand texture along a flow direction with root/tip shading, optional highlight streaks.

import * as THREE from 'three';
import { FACE_LAYOUT as FL } from './headShape';

type Uniforms = Record<string, THREE.IUniform>;

const f = (n: number) => (Number.isInteger(n) ? `${n}.0` : `${n}`);

function patch(mat: THREE.Material, key: string, uniforms: Uniforms, vertex: Array<[string, string]>, fragment: Array<[string, string]>, defines: Record<string, string> = {}): void {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    for (const [k, v] of Object.entries(defines)) (shader.defines ??= {})[k] = v;
    for (const [find, repl] of vertex) shader.vertexShader = shader.vertexShader.replace(find, repl);
    for (const [find, repl] of fragment) shader.fragmentShader = shader.fragmentShader.replace(find, repl);
  };
  mat.customProgramCacheKey = () => key;
}

// ---------------------------------------------------------------------------------------------
// Skin
// ---------------------------------------------------------------------------------------------

export interface SkinUniforms {
  uCoverTorso: THREE.IUniform<THREE.Vector4>;
  uCoverLimbs: THREE.IUniform<THREE.Vector4>;
  uEyeColor: THREE.IUniform<THREE.Color>;
  uBrowColor: THREE.IUniform<THREE.Color>;
  uLipColor: THREE.IUniform<THREE.Color>;
  uHairColor: THREE.IUniform<THREE.Color>;
  uEye: THREE.IUniform<THREE.Vector4>;
  uBrow: THREE.IUniform<THREE.Vector4>;
  uMouth: THREE.IUniform<THREE.Vector4>;
  uSkinFx: THREE.IUniform<THREE.Vector4>;
  uSelect: THREE.IUniform<number>;
}

const SKIN_VERT_HEAD = /* glsl */ `
attribute vec4 aInfo;
attribute vec3 aFace;
varying vec4 vInfo;
varying vec3 vFace;
uniform vec4 uCoverTorso; // yMin, yMaxBack, yMaxFront, enabled
uniform vec4 uCoverLimbs; // armMaxX, legMinY, footMaxY, margin
`;

const SKIN_VERT_COVER = /* glsl */ `
#include <morphtarget_vertex>
vInfo = aInfo;
vFace = aFace;
{
  float part = aInfo.x;
  float sAx = aInfo.y;
  float mg = uCoverLimbs.w;
  float cover = 0.0;
  if (part < 0.5) {
    float yMax = aInfo.z > 0.0 ? uCoverTorso.z : uCoverTorso.y;
    cover = uCoverTorso.w * step(uCoverTorso.x + mg, sAx) * step(sAx, yMax - mg);
  } else if (part < 1.5) {
    cover = step(uCoverLimbs.y + mg, sAx);
  } else if (part < 2.5) {
    cover = step(sAx, uCoverLimbs.x - mg);
  } else if (part > 3.5 && part < 4.5) {
    cover = step(sAx, uCoverLimbs.z - mg);
  }
  transformed -= normal * (0.016 * cover);
}
`;

const SKIN_FRAG_HEAD = /* glsl */ `
varying vec4 vInfo;
varying vec3 vFace;
uniform vec3 uEyeColor;
uniform vec3 uBrowColor;
uniform vec3 uLipColor;
uniform vec3 uHairColor;
uniform vec4 uEye;   // size, spacing, tilt, height
uniform vec4 uBrow;  // height, tilt, style, -
uniform vec4 uMouth; // width, fullness, lipTint, -
uniform vec4 uSkinFx; // freckles, blush, stubble, -
uniform float uSelect;

float hsHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hsBand(float d, float halfW, float aa) { return 1.0 - smoothstep(halfW - aa, halfW + aa, abs(d)); }

// brow centre-line height and thickness for a style at t (0 = inner end, 1 = outer end)
vec2 hsBrowShape(float style, float t) {
  float tt = clamp(t, 0.0, 1.0);
  float natural = 0.0042 * sin(3.14159 * min(tt * 0.82 + 0.08, 1.0)) - 0.0006 * tt;
  float h = natural;
  float th = mix(0.0045, 0.0023, tt);
  if (style < 0.5) { }
  else if (style < 1.5) { h = 0.0013 * tt; th = mix(0.0029, 0.002, tt); }
  else if (style < 2.5) { h = 0.0054 * sin(3.14159 * min(tt * 0.75 + 0.18, 1.0)) - 0.0012; th = mix(0.0028, 0.0013, tt); }
  else if (style < 3.5) { h = 0.0078 * pow(sin(3.14159 * min(tt * 0.86 + 0.05, 1.0)), 1.4) - 0.0012; th = mix(0.0025, 0.0011, tt); }
  else if (style < 4.5) { th = mix(0.0044, 0.0027, tt); }
  else if (style < 5.5) { th = mix(0.0016, 0.0009, tt); }
  else if (style < 6.5) { th = mix(0.0048, 0.0032, tt); }
  else { h = tt < 0.62 ? 0.0066 * (tt / 0.62) : 0.0066 * (1.0 - (tt - 0.62) / 0.38 * 0.75); h -= 0.0008; th = mix(0.003, 0.0013, tt); }
  return vec2(h, th);
}
`;

const SKIN_FRAG_PAINT = /* glsl */ `
#include <color_fragment>
vec3 hsGlow = vec3(0.0);
if (vInfo.x > 4.5) {
  vec3 fp = vFace;
  vec3 col = diffuseColor.rgb;
  float aa = max(fwidth(fp.x), fwidth(fp.y)) * 0.75 + 1e-5;
  if (vInfo.x > 5.5) {
    col *= mix(1.0, 0.8, clamp(vInfo.z, 0.0, 1.0));
    col *= vec3(1.03, 0.96, 0.95);
  } else if (fp.z > 0.02) {
    float ax = abs(fp.x);
    // ---------- cheeks: rosy warmth, blush ----------
    float cheek = exp(-(pow(ax - 0.045, 2.0) + pow(fp.y - 0.062, 2.0)) / (2.0 * 0.015 * 0.015));
    float noseTip = exp(-(fp.x * fp.x + pow(fp.y - 0.064, 2.0)) / (2.0 * 0.008 * 0.008));
    col *= mix(vec3(1.0), vec3(1.04, 0.95, 0.94), clamp(cheek * 0.6 + noseTip * 0.5, 0.0, 1.0));
    col = mix(col, col * vec3(1.12, 0.74, 0.76), uSkinFx.y * cheek * 0.55);
    // ---------- freckles ----------
    if (uSkinFx.x > 0.01) {
      float region = exp(-pow(ax - 0.026, 2.0) / (2.0 * 0.021 * 0.021) - pow(fp.y - 0.073, 2.0) / (2.0 * 0.012 * 0.012));
      vec2 cell = fp.xy / 0.0034;
      vec2 ci = floor(cell);
      vec2 cf = fract(cell);
      float h = hsHash(ci);
      vec2 c = vec2(hsHash(ci + 7.1), hsHash(ci + 3.3)) * 0.6 + 0.2;
      float r = (0.16 + 0.14 * hsHash(ci + 1.7));
      float dotM = step(0.45, h) * (1.0 - smoothstep(r - 0.1, r + 0.1, length(cf - c)));
      col = mix(col, col * vec3(0.68, 0.55, 0.47), dotM * region * uSkinFx.x * 0.85);
    }
    // ---------- stubble ----------
    if (uSkinFx.z > 0.01) {
      float lowerFace = smoothstep(0.052, 0.036, fp.y) * smoothstep(-0.03, -0.004, fp.y);
      float lipGap = 1.0 - exp(-(fp.x * fp.x) / (2.0 * 0.019 * 0.019) - pow(fp.y - 0.029, 2.0) / (2.0 * 0.0075 * 0.0075));
      float upper = smoothstep(0.05, 0.044, fp.y) * smoothstep(0.034, 0.038, fp.y) * smoothstep(0.03, 0.02, ax);
      float m = clamp(lowerFace * lipGap + upper, 0.0, 1.0) * smoothstep(0.06, 0.07, length(vec2(ax, fp.z)) + 0.0);
      float grain = 0.7 + 0.3 * hsHash(floor(fp.xy / 0.0007));
      col = mix(col, mix(col * 0.55, uHairColor * 0.8, 0.5), m * uSkinFx.z * 0.55 * grain);
    }
    // ---------- nostrils ----------
    float nost = length(vec2((ax - 0.0063) / 0.0031, (fp.y - 0.0505) / 0.0017));
    col *= mix(1.0, 0.42, (1.0 - smoothstep(0.75, 1.05, nost)) * step(0.095, fp.z));
    // ---------- mouth ----------
    float mw = ${f(FL.mouthHalfW)} * (1.0 + 0.18 * uMouth.x);
    float my = ${f(FL.mouthY)};
    float u = fp.x / mw;
    float inside = max(1.0 - u * u, 0.0);
    float ul = 0.0048 * (1.0 + 0.35 * uMouth.y);
    float ll = 0.0064 * (1.0 + 0.35 * uMouth.y);
    float yTop = my + ul * pow(inside, 0.65) * (1.0 - 0.32 * exp(-u * u / 0.03));
    float yBot = my - ll * pow(inside, 0.6);
    float yLine = my + 0.0005 * u * u;
    float soft = max(aa, 0.0006);
    float lipM = smoothstep(yBot - soft, yBot + soft, fp.y) * (1.0 - smoothstep(yTop - soft * 0.6, yTop + soft * 0.6, fp.y)) * step(abs(u), 1.08);
    vec3 natural = col * vec3(0.9, 0.68, 0.66);
    vec3 lip = mix(natural, uLipColor, uMouth.z);
    lip *= fp.y > yLine ? 0.9 : 1.04;
    col = mix(col, lip, lipM);
    float lineM = hsBand(fp.y - yLine, 0.00042, aa) * smoothstep(1.12, 0.9, abs(u));
    col = mix(col, col * 0.32, lineM);
    // ---------- eyes ----------
    float side = sign(fp.x);
    float es = uEye.x;
    float ex = ${f(FL.eyeX)} + 0.0035 * uEye.y;
    float ey = ${f(FL.eyeY)} + 0.004 * uEye.w;
    float hw = ${f(FL.eyeHalfW)} * (1.0 + 0.15 * es);
    float hh = ${f(FL.eyeHalfH)} * (1.0 + 0.2 * es);
    float tilt = 0.14 * uEye.z;
    vec2 q0 = vec2(ax - ex, fp.y - ey);
    vec2 q = vec2(q0.x * cos(tilt) + q0.y * sin(tilt), -q0.x * sin(tilt) + q0.y * cos(tilt));
    float ue = q.x / hw;
    float ins = max(1.0 - ue * ue, 0.0);
    float yUp = hh * pow(ins, 0.55) * (1.0 - 0.1 * ue);
    float yLo = -hh * 0.7 * pow(ins, 0.75) * (1.0 + 0.1 * ue);
    float eyeM = smoothstep(yLo - aa, yLo + aa, q.y) * (1.0 - smoothstep(yUp - aa, yUp + aa, q.y)) * step(abs(ue), 1.0);
    // sclera, iris, pupil, highlight
    vec2 ic = vec2(-0.0003, -0.0006);
    float ri = 0.0068 * (1.0 + 0.13 * es);
    float d = length(q - ic);
    vec3 sclera = vec3(0.93, 0.91, 0.88) * mix(0.68, 1.0, smoothstep(hh * 0.95, hh * 0.0, q.y));
    float ang = atan(q.y - ic.y, q.x - ic.x);
    vec3 iris = mix(uEyeColor * 1.45, uEyeColor * 0.5, smoothstep(0.25, 1.0, d / ri));
    iris *= 0.92 + 0.08 * sin(ang * 23.0);
    iris *= mix(0.7, 1.0, smoothstep(hh * 0.9, hh * 0.2, q.y));
    vec3 eyeCol = mix(sclera, iris, 1.0 - smoothstep(ri - aa, ri + aa, d));
    eyeCol = mix(eyeCol, vec3(0.04, 0.035, 0.035), 1.0 - smoothstep(ri * 0.45 - aa, ri * 0.45 + aa, d));
    float hl = 1.0 - smoothstep(ri * 0.22 - aa, ri * 0.22 + aa, length(q - ic - vec2(0.36 * ri * side * 0.0 + 0.3 * ri, 0.36 * ri)));
    eyeCol = mix(eyeCol, vec3(1.0), hl);
    col = mix(col, eyeCol, eyeM);
    hsGlow += (sclera * 0.05 + vec3(0.6) * hl) * eyeM;
    // lash line (upper lid), outer flick, lower lid, crease
    float lw = 0.0009 + 0.0007 * smoothstep(-0.3, 1.0, ue);
    float lashD = q.y - yUp;
    float lash = step(abs(ue), 1.02) * smoothstep(-0.00035 - aa, -0.00035 + aa, lashD) * (1.0 - smoothstep(lw - aa, lw + aa, lashD));
    float fx = q.x - hw;
    float flick = smoothstep(-0.001, 0.0005, fx) * (1.0 - smoothstep(0.0028, 0.0032, fx)) * hsBand(q.y - (0.00035 + fx * 0.42), 0.0007 * (1.0 - fx / 0.0034), aa);
    col = mix(col, vec3(0.07, 0.05, 0.045), clamp(lash + flick, 0.0, 1.0));
    float lowL = step(abs(ue), 0.95) * hsBand(q.y - yLo, 0.00028, aa);
    col = mix(col, col * 0.7, lowL);
    float crease = step(abs(ue), 0.85) * hsBand(q.y - (yUp + 0.0036 * (1.0 - ue * ue * 0.6)), 0.00028, aa);
    col = mix(col, col * 0.86, crease);
    // ---------- brows ----------
    float bx0 = ${f(FL.browX0)} + 0.002 * uEye.y;
    float bx1 = ${f(FL.browX1)} + 0.003 * uEye.y;
    float bt = (ax - bx0) / (bx1 - bx0);
    vec2 bs = hsBrowShape(uBrow.z, bt);
    float by = ${f(FL.browY)} + 0.0045 * uBrow.x + 0.004 * uEye.w + bs.x + 0.004 * uBrow.y * (bt - 0.3);
    float browM = hsBand(fp.y - by, bs.y * 0.5, aa) * smoothstep(-0.06, 0.05, bt) * (1.0 - smoothstep(0.9, 1.04, bt));
    float strokes = 0.78 + 0.22 * sin((ax * 2600.0 + fp.y * 1500.0));
    if (uBrow.z > 5.5 && uBrow.z < 6.5) strokes *= 0.85 + 0.3 * hsHash(floor(fp.xy / 0.0006));
    col = mix(col, uBrowColor, browM * mix(1.0, strokes, smoothstep(0.00012, 0.00004, aa)));
  }
  diffuseColor.rgb = col;
}
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.08 + vec3(0.04, 0.03, 0.0), uSelect);
`;

/** Creates a per-character skin material (body + head share one material and draw call). */
export function createSkinMaterial(): { material: THREE.MeshStandardMaterial; uniforms: SkinUniforms } {
  const material = new THREE.MeshStandardMaterial({ color: '#c99a78', roughness: 0.64, metalness: 0 });
  const uniforms: SkinUniforms = {
    uCoverTorso: { value: new THREE.Vector4(0, 0, 0, 0) },
    uCoverLimbs: { value: new THREE.Vector4(0, 10, 0, 0.03) },
    uEyeColor: { value: new THREE.Color('#5e3b1f') },
    uBrowColor: { value: new THREE.Color('#3d2a1f') },
    uLipColor: { value: new THREE.Color('#b5525a') },
    uHairColor: { value: new THREE.Color('#3d2a1f') },
    uEye: { value: new THREE.Vector4() },
    uBrow: { value: new THREE.Vector4() },
    uMouth: { value: new THREE.Vector4() },
    uSkinFx: { value: new THREE.Vector4() },
    uSelect: { value: 0 },
  };
  patch(material, 'hs-skin-v1', uniforms as unknown as Uniforms,
    [['#include <common>', `#include <common>\n${SKIN_VERT_HEAD}`], ['#include <morphtarget_vertex>', SKIN_VERT_COVER]],
    [['#include <common>', `#include <common>\n${SKIN_FRAG_HEAD}`], ['#include <color_fragment>', SKIN_FRAG_PAINT],
      ['#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += hsGlow;']]);
  return { material, uniforms };
}

// ---------------------------------------------------------------------------------------------
// Cloth
// ---------------------------------------------------------------------------------------------

/** Fabric ids for the cloth shader (GarmentDef.build.fabric). */
export const FABRIC_IDS: Record<string, number> = {
  cotton: 0, knit: 1, denim: 2, poplin: 3, pique: 4, flannel: 5, canvas: 6, wool: 7, fleece: 8, nylon: 9, lycra: 10, rib: 11, leather: 12, plush: 13,
};
export const FABRIC_ROUGHNESS: Record<string, number> = {
  cotton: 0.88, knit: 0.95, denim: 0.85, poplin: 0.72, pique: 0.9, flannel: 0.93, canvas: 0.86, wool: 0.9, fleece: 0.97, nylon: 0.55, lycra: 0.48, rib: 0.9, leather: 0.45, plush: 1,
};
export const PATTERN_IDS: Record<string, number> = { solid: 0, stripes: 1, pinstripe: 2, plaid: 3, polka: 4, gingham: 5, chevron: 6 };

export interface ClothUniforms {
  uPatColor: THREE.IUniform<THREE.Color>;
  uAltColor: THREE.IUniform<THREE.Color>;
  uPattern: THREE.IUniform<number>;
  uFabric: THREE.IUniform<number>;
  /** details (1 jeans, 2 crease, 3 side stripe, 4 sneaker laces/toe cap, 5 loafer strap), placket (1 buttons, 2 zip, 3 short), rib, piping */
  uFlags: THREE.IUniform<THREE.Vector4>;
  /** hem band, belt, ankle cuff, waistband */
  uFlags2: THREE.IUniform<THREE.Vector4>;
  uCutNeck: THREE.IUniform<THREE.Vector4>;
  uCutArm: THREE.IUniform<THREE.Vector4>;
  uCutMisc: THREE.IUniform<THREE.Vector4>;
  uHem: THREE.IUniform<THREE.Vector4>;
  /** crotchY, chestY, neckBaseY, foot centre |x| */
  uBody: THREE.IUniform<THREE.Vector4>;
  uSelect: THREE.IUniform<number>;
}

const CLOTH_VERT_HEAD = /* glsl */ `
attribute vec4 aCloth;
varying vec4 vCloth;
varying vec3 vBind;
`;

const CLOTH_FRAG_HEAD = /* glsl */ `
varying vec4 vCloth;
varying vec3 vBind;
uniform vec3 uPatColor;
uniform vec3 uAltColor;
uniform float uPattern;
uniform float uFabric;
uniform vec4 uFlags;
uniform vec4 uFlags2;
uniform vec4 uCutNeck;
uniform vec4 uCutArm;
uniform vec4 uCutMisc;
uniform vec4 uHem;
uniform vec4 uBody;
uniform float uSelect;

float hcHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hcNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hcHash(i), hcHash(i + vec2(1.0, 0.0)), u.x), mix(hcHash(i + vec2(0.0, 1.0)), hcHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// anti-aliased periodic band: 1 inside a band of relative width duty centred in each period
float hcBand(float x, float period, float duty) {
  float t = x / period;
  float w = fwidth(t) + 1e-4;
  float d = abs(fract(t) - 0.5);
  float v = 1.0 - smoothstep(duty * 0.5 - w, duty * 0.5 + w, d);
  return mix(v, duty, smoothstep(0.2, 0.5, w));
}
float hcLine(float d, float halfW) {
  float w = fwidth(d) + 1e-5;
  return 1.0 - smoothstep(halfW - w, halfW + w, abs(d));
}
float hcFade(float period, float x) { return 1.0 - smoothstep(0.25, 0.6, fwidth(x / period)); }
float hcNeckY(float ax, float front) {
  float shape = uCutNeck.w;
  float r = ax / max(uCutNeck.z, 1e-4);
  float dip = 0.0;
  if (shape < 0.5) dip = max(1.0 - r * r, 0.0);
  else if (shape < 1.5) dip = pow(max(1.0 - r * r, 0.0), 0.5);
  else if (shape < 2.5) dip = max(1.0 - r, 0.0);
  else if (shape < 3.5) dip = 1.0 - smoothstep(0.85, 1.0, r);
  return uCutNeck.x - uCutNeck.y * front * dip;
}
`;

const CLOTH_FRAG_PAINT = /* glsl */ `
#include <color_fragment>
{
  vec3 b = vBind;
  float panel = vCloth.w;
  vec2 uv = vCloth.xy;
  float ax = abs(b.x);
  float front = b.z > -0.012 ? 1.0 : 0.0;
  bool torsoLike = panel < 0.5 || (panel > 6.5 && panel < 8.5);
  bool isShoe = panel > 4.5 && panel < 6.5;
  // ---- cuts (bind space) ----
  float neckY = 10.0;
  if (torsoLike && uCutNeck.w < 3.5) neckY = hcNeckY(ax, front);
  if (torsoLike) {
    bool strapZone = uCutArm.w > 0.5 && ax >= uCutArm.y && ax <= uCutArm.z;
    if (uCutArm.w > 0.5 && b.y > uCutArm.x && ax > uCutArm.z) discard;
    if (!strapZone && b.y > neckY) discard;
  }
  if (panel > 7.5 && panel < 8.5 && b.y > uHem.w) {
    bool bib = front > 0.5 && ax < uCutMisc.z && b.y < uCutMisc.y;
    bool strap = ax > 0.05 && ax < 0.082;
    if (!(bib || strap)) discard;
  }
  if (uCutMisc.x > 0.0) {
    if (panel < 0.5 && b.y < uBody.x + uCutMisc.x * smoothstep(0.035, 0.115, ax)) discard;
    if (panel > 1.5 && panel < 2.5 && ax > 0.035) discard;
  }
  // ---- base colour and pattern ----
  vec3 base = diffuseColor.rgb;
  if (panel > 4.5 && panel < 5.5) base = uAltColor;
  if (panel > 6.5 && panel < 7.5) base = uAltColor;
  bool patterned = !isShoe && !(panel > 6.5 && panel < 7.5);
  float pm = 0.0;
  if (patterned && uPattern > 0.5) {
    if (uPattern < 1.5) pm = hcBand(uv.y, 0.05, 0.5);
    else if (uPattern < 2.5) pm = hcBand(uv.x, 0.02, 0.12);
    else if (uPattern < 3.5) {
      float bu = hcBand(uv.x, 0.09, 0.42), bv = hcBand(uv.y, 0.09, 0.42);
      pm = (bu + bv) * 0.42;
      float acc = max(hcBand(uv.x + 0.045, 0.09, 0.07), hcBand(uv.y + 0.045, 0.09, 0.07));
      base = mix(base, mix(uPatColor, vec3(1.0), 0.35), acc * 0.55);
    }
    else if (uPattern < 4.5) {
      vec2 g = uv / 0.034;
      g.x += 0.5 * floor(g.y);
      vec2 c = (fract(g) - 0.5) * 0.034;
      float d = length(c);
      float w = fwidth(d) + 1e-5;
      pm = 1.0 - smoothstep(0.0075 - w, 0.0075 + w, d);
      pm = mix(pm, 0.15, smoothstep(0.3, 0.6, fwidth(g.x)));
    }
    else if (uPattern < 5.5) pm = (hcBand(uv.x, 0.022, 0.5) + hcBand(uv.y, 0.022, 0.5)) * 0.5;
    else { float z = uv.y + abs(fract(uv.x / 0.045) - 0.5) * 0.04; pm = hcBand(z, 0.045, 0.45); }
  }
  vec3 col = mix(base, uPatColor, pm);
  // ---- fabric texture ----
  float fab = uFabric;
  float tex = 1.0;
  float n1 = hcNoise(uv * 180.0);
  if (fab < 0.5) tex = 0.97 + 0.05 * n1;
  else if (fab < 1.5) tex = 0.86 + 0.14 * mix(0.5, hcBand(uv.x, 0.008, 0.5), hcFade(0.008, uv.x)) + 0.04 * hcNoise(uv * 400.0);
  else if (fab < 2.5) { tex = 0.9 + 0.1 * mix(0.5, hcBand(uv.x + uv.y, 0.005, 0.5), hcFade(0.005, uv.x + uv.y)) + 0.1 * (hcNoise(uv * 25.0) - 0.5); }
  else if (fab < 3.5) tex = 0.98 + 0.03 * n1;
  else if (fab < 4.5) tex = 0.93 + 0.07 * mix(0.5, hcBand(uv.x, 0.004, 0.5) * hcBand(uv.y, 0.004, 0.5), hcFade(0.004, uv.x));
  else if (fab < 5.5) tex = 0.93 + 0.1 * hcNoise(uv * 90.0);
  else if (fab < 6.5) tex = 0.93 + 0.07 * mix(0.5, hcBand(uv.x, 0.004, 0.5) * hcBand(uv.y, 0.004, 0.5), hcFade(0.004, uv.x));
  else if (fab < 8.5) tex = 0.92 + 0.1 * hcNoise(uv * 140.0);
  else if (fab < 10.5) tex = 1.0;
  else if (fab < 11.5) tex = 0.88 + 0.12 * mix(0.5, hcBand(uv.x, 0.005, 0.45), hcFade(0.005, uv.x));
  else if (fab < 12.5) tex = 0.96 + 0.06 * hcNoise(uv * 60.0);
  else tex = 0.88 + 0.16 * hcNoise(uv * 260.0);
  col *= tex;
  // ---- trims and details ----
  float rib = 0.0;
  float dNeck = neckY - b.y;
  if (torsoLike && uFlags.z > 0.5 && dNeck < 0.013 && dNeck > -0.001) rib = 1.0;
  if (panel > 0.5 && panel < 1.5 && (uFlags.z > 0.5 || uFlags2.x > 0.5) && uHem.y - ax < (uFlags2.x > 0.5 ? 0.045 : 0.014)) rib = 1.0;
  if (torsoLike && uFlags2.x > 0.5 && b.y - uHem.x < 0.045 && uHem.x > 0.0) rib = 1.0;
  if (panel > 1.5 && panel < 2.5 && uFlags2.z > 0.5 && b.y - uHem.z < 0.05) rib = 1.0;
  if ((panel < 0.5 || panel > 1.5 && panel < 3.5 || panel > 7.5) && uFlags2.w > 0.5 && uHem.w - b.y < 0.035 && uHem.w - b.y > -0.01) rib = 1.0;
  if (rib > 0.5) col *= 0.86 + 0.12 * mix(0.5, hcBand(uv.x, 0.006, 0.5), hcFade(0.006, uv.x));
  if (uFlags.w > 0.5) {
    float pip = 0.0;
    if (torsoLike) pip = max(pip, hcLine(dNeck - 0.002, 0.0016));
    if (panel > 0.5 && panel < 1.5) pip = max(pip, hcLine(uHem.y - ax - 0.003, 0.0016));
    if (torsoLike && uHem.x > 0.0) pip = max(pip, hcLine(b.y - uHem.x - 0.003, 0.0016));
    if (panel > 1.5 && panel < 3.5) pip = max(pip, hcLine(b.y - uHem.z - 0.004, 0.0018));
    col = mix(col, uPatColor, pip);
  }
  // placket: buttons / zip down the centre front
  if (torsoLike && uFlags.y > 0.5 && b.z > 0.0 && !(panel > 6.5 && panel < 7.5)) {
    float top = neckY;
    float len = uFlags.y > 2.5 ? 0.12 : 2.0;
    if (b.y < top && b.y > top - len) {
      if (uFlags.y < 1.5 || uFlags.y > 2.5) {
        col *= 1.0 - 0.18 * hcLine(ax - 0.012, 0.0008);
        float k = (top - 0.025 - b.y) / 0.075;
        float by = top - 0.025 - floor(k + 0.5) * 0.075;
        float bd = length(vec2(b.x, b.y - by));
        float bm = (1.0 - smoothstep(0.0034, 0.0042, bd)) * step(-0.5, k);
        col = mix(col, mix(col, vec3(0.96, 0.94, 0.9), 0.55), bm);
      } else {
        col = mix(col, vec3(0.55, 0.56, 0.58), hcLine(b.x, 0.0012));
        float tab = (1.0 - step(0.004, abs(b.x))) * step(top - 0.03, b.y);
        col = mix(col, vec3(0.7, 0.71, 0.73), tab);
      }
    }
  }
  // jeans stitching, trouser crease, side stripe
  if (uFlags.x > 0.5 && uFlags.x < 1.5 && (panel > 1.5 && panel < 2.5 || panel < 0.5 || panel > 7.5)) {
    vec3 thread = vec3(0.8, 0.58, 0.28);
    float dash = step(0.45, fract((b.y + b.x * 0.7) / 0.006));
    float st = 0.0;
    if (panel > 1.5 && panel < 2.5) {
      st = max(st, hcLine(b.y - uHem.z - 0.012, 0.0009));
      st = max(st, hcLine(abs(b.z + 0.004) - 0.0, 0.001) * step(0.12, ax));
    }
    float wt = uHem.w;
    if (b.y < wt && b.y > wt - 0.2) {
      if (front > 0.5) {
        float fly = hcLine(b.x - 0.026 * smoothstep(wt - 0.16, wt - 0.12, b.y), 0.001) * step(wt - 0.17, b.y);
        float pocket = hcLine(length(vec2(ax - 0.135, b.y - wt + 0.005)) - 0.075, 0.001) * step(0.065, ax);
        st = max(st, max(fly, pocket));
      } else {
        float inX = step(0.035, ax) * step(ax, 0.115);
        float inY = step(wt - 0.18, b.y) * step(b.y, wt - 0.05);
        float edge = max(hcLine(ax - 0.035, 0.001) + hcLine(ax - 0.115, 0.001), hcLine(b.y - wt + 0.05, 0.001));
        st = max(st, edge * inX * inY + hcLine(b.y - wt + 0.05, 0.001) * inX * 0.0);
        st = max(st, (hcLine(ax - 0.035, 0.001) + hcLine(ax - 0.115, 0.001)) * inY);
      }
    }
    col = mix(col, thread, clamp(st, 0.0, 1.0) * dash);
  }
  if (uFlags.x > 1.5 && uFlags.x < 2.5 && panel > 1.5 && panel < 2.5 && b.z > 0.0) col *= 1.0 + 0.16 * hcLine(ax - 0.09, 0.0016);
  if (uFlags.x > 2.5 && uFlags.x < 3.5 && (panel > 1.5 && panel < 2.5 || panel < 0.5)) col = mix(col, uPatColor, hcLine(b.z + 0.004, 0.006) * step(0.11, ax));
  // belt at the dress waist
  if (uFlags2.y > 0.5 && torsoLike || uFlags2.y > 0.5 && panel > 2.5 && panel < 3.5) {
    float belt = hcLine(b.y - uHem.w, 0.011);
    col = mix(col, col * 0.45, belt);
    float buckle = belt * (1.0 - step(0.014, ax)) * front;
    col = mix(col, vec3(0.78, 0.66, 0.36), buckle);
  }
  // shoes: sneaker laces and toe cap, loafer strap
  if (isShoe && panel > 5.5) {
    float fx = ax - uBody.w;
    if (uFlags.x > 3.5 && uFlags.x < 4.5) {
      float instep = step(0.0, b.z) * step(b.z, 0.11) * step(0.055, b.y);
      float lace = instep * step(abs(fx), 0.013) * hcBand(b.z, 0.016, 0.35);
      col = mix(col, uAltColor, lace);
      col = mix(col, uAltColor * 0.95, step(0.14, b.z) * step(b.y, 0.045));
    }
    if (uFlags.x > 4.5) col = mix(col, col * 0.6, hcLine(b.z - 0.075, 0.006) * step(0.045, b.y));
  }
  if (!gl_FrontFacing) col *= 0.55;
  col = mix(col, col * 1.08 + vec3(0.03, 0.025, 0.0), uSelect);
  diffuseColor.rgb = col;
}
`;

/** Creates a per-character cloth material for one garment layer. */
export function createClothMaterial(): { material: THREE.MeshStandardMaterial; uniforms: ClothUniforms } {
  const material = new THREE.MeshStandardMaterial({ color: '#cccccc', roughness: 0.88, metalness: 0, side: THREE.DoubleSide });
  const uniforms: ClothUniforms = {
    uPatColor: { value: new THREE.Color('#ffffff') },
    uAltColor: { value: new THREE.Color('#ffffff') },
    uPattern: { value: 0 },
    uFabric: { value: 0 },
    uFlags: { value: new THREE.Vector4() },
    uFlags2: { value: new THREE.Vector4() },
    uCutNeck: { value: new THREE.Vector4(0, 0, 0, 4) },
    uCutArm: { value: new THREE.Vector4() },
    uCutMisc: { value: new THREE.Vector4() },
    uHem: { value: new THREE.Vector4() },
    uBody: { value: new THREE.Vector4() },
    uSelect: { value: 0 },
  };
  patch(material, 'hs-cloth-v1', uniforms as unknown as Uniforms,
    [['#include <common>', `#include <common>\n${CLOTH_VERT_HEAD}`], ['#include <begin_vertex>', '#include <begin_vertex>\nvCloth = aCloth;\nvBind = position;']],
    [['#include <common>', `#include <common>\n${CLOTH_FRAG_HEAD}`], ['#include <color_fragment>', CLOTH_FRAG_PAINT]]);
  return { material, uniforms };
}

// ---------------------------------------------------------------------------------------------
// Hair
// ---------------------------------------------------------------------------------------------

export interface HairUniforms {
  /** rgb highlight colour, a = 1 when highlights are on */
  uHighlight: THREE.IUniform<THREE.Vector4>;
  uStrand: THREE.IUniform<number>;
  uSelect: THREE.IUniform<number>;
}

const HAIR_VERT_HEAD = /* glsl */ `
attribute vec4 aHair;
attribute vec3 aFlow;
varying vec4 vHair;
varying vec3 vFlowView;
`;

const HAIR_VERT_FLOW = /* glsl */ `
#include <defaultnormal_vertex>
vHair = aHair;
{
  vec3 fl = aFlow;
  #ifdef USE_SKINNING
    fl = (skinMatrix * vec4(fl, 0.0)).xyz;
  #endif
  vFlowView = normalMatrix * fl;
}
`;

const HAIR_FRAG_HEAD = /* glsl */ `
varying vec4 vHair;
varying vec3 vFlowView;
uniform vec4 uHighlight;
uniform float uStrand;
uniform float uSelect;
float hhHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hhNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hhHash(i), hhHash(i + vec2(1.0, 0.0)), u.x), mix(hhHash(i + vec2(0.0, 1.0)), hhHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

const HAIR_FRAG_PAINT = /* glsl */ `
#include <color_fragment>
vec3 hairSheen = vec3(0.0);
{
  vec2 hv = vHair.xy;
  float tip = vHair.z;
  float piece = vHair.w;
  vec3 base = diffuseColor.rgb;
  float fadeHi = 1.0 - smoothstep(0.15, 0.5, fwidth(hv.x * 300.0));
  float st = uStrand;
  float n;
  if (st < 0.5) n = hhNoise(vec2(hv.x * 420.0, hv.y * 12.0));
  else if (st < 1.5) n = hhNoise(vec2((hv.x + sin(hv.y * 70.0) * 0.004) * 420.0, hv.y * 12.0));
  else if (st < 3.5) { float k = st < 2.5 ? 260.0 : 520.0; n = hhNoise(hv * k) * 0.6 + hhNoise(hv * k * 2.7) * 0.4; }
  else if (st < 4.5) n = 0.5 + 0.5 * sin((hv.y * 140.0 + abs(fract(hv.x * 30.0) - 0.5) * 8.0));
  else n = hhHash(floor(hv * 900.0));
  float strands = mix(0.9, 0.72 + 0.4 * n, fadeHi);
  vec3 col = base * strands;
  if (piece > 5.5) col *= 0.92;
  // lighter ends on curtains and tails
  if (piece > 1.5 && piece < 3.5) col = mix(col, col * 1.12, smoothstep(0.6, 1.0, tip));
  if (piece > 4.5 && piece < 5.5) col = col * 0.55;
  if (uHighlight.w > 0.5) {
    float streak = smoothstep(0.55, 0.78, hhNoise(vec2(hv.x * 38.0, hv.y * 1.5)));
    float ends = (piece > 1.5 && piece < 3.5) ? smoothstep(0.55, 1.0, tip) : 0.0;
    col = mix(col, uHighlight.rgb * mix(0.85, 1.05, n), clamp(streak * 0.75 + ends * 0.6, 0.0, 0.85));
  }
  if (!gl_FrontFacing) col *= 0.6;
  col = mix(col, col * 1.08 + vec3(0.03, 0.025, 0.0), uSelect);
  diffuseColor.rgb = col;
  // anisotropic sheen (fixed key light in view space)
  vec3 T = vFlowView / max(length(vFlowView), 1e-4);
  vec3 V = normalize(vViewPosition);
  vec3 H = normalize(normalize(vec3(0.35, 0.85, 0.4)) + V);
  float th = dot(T, H);
  float spec = pow(sqrt(max(0.0, 1.0 - th * th)), 48.0);
  hairSheen = mix(base, vec3(1.0), 0.35) * spec * 0.22 * (gl_FrontFacing ? 1.0 : 0.0) * (piece > 5.5 ? 0.3 : 1.0);
}
`;

/** Creates a per-character hair material (hair and facial hair share it). */
export function createHairMaterial(): { material: THREE.MeshStandardMaterial; uniforms: HairUniforms } {
  const material = new THREE.MeshStandardMaterial({ color: '#3d2a1f', roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
  const uniforms: HairUniforms = {
    uHighlight: { value: new THREE.Vector4(0, 0, 0, 0) },
    uStrand: { value: 0 },
    uSelect: { value: 0 },
  };
  patch(material, 'hs-hair-v1', uniforms as unknown as Uniforms,
    [['#include <common>', `#include <common>\n${HAIR_VERT_HEAD}`], ['#include <defaultnormal_vertex>', HAIR_VERT_FLOW]],
    [['#include <common>', `#include <common>\n${HAIR_FRAG_HEAD}`], ['#include <color_fragment>', HAIR_FRAG_PAINT],
      ['#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += hairSheen;']]);
  return { material, uniforms };
}
