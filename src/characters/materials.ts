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
    float yLine = my + 0.0011 * u * u;
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
    float ri = 0.0075 * (1.0 + 0.13 * es);
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
// Skin of a Meshy body
// ---------------------------------------------------------------------------------------------

/** Uniforms of the Meshy skin: the shared SkinUniforms plus the texture inputs and the recolour parameters. */
export interface MeshySkinUniforms extends SkinUniforms {
  uAlbedo: THREE.IUniform<THREE.Texture | null>;
  uMask: THREE.IUniform<THREE.Texture | null>;
  /** Mean linear colour of the baked skin. */
  uSkinMean: THREE.IUniform<THREE.Vector3>;
  /** Luminance of the dark and light baked clothing and the luminance that separates them. */
  uClothLum: THREE.IUniform<THREE.Vector3>;
  /** Height (bind space) above which mask channel B is a brow, below it an iris. */
  uSplitY: THREE.IUniform<number>;
  /** Colour of the baked base layer (tank top, shorts) where it shows as plain underwear. */
  uUnder: THREE.IUniform<THREE.Color>;
  /** Strength of the baked shading kept on recoloured skin (1 = as baked, 0 = flat tone). */
  uDetail: THREE.IUniform<number>;
  /** Worn garments over the baked base layer: top covered (0/1), bottom covered (0/1), height that separates the tank top from the shorts. */
  uBase: THREE.IUniform<THREE.Vector3>;
}

const MSKIN_VERT_HEAD = /* glsl */ `
attribute vec4 aInfo;
attribute vec3 aFace;
varying vec4 vInfo;
varying vec3 vFace;
varying vec2 vMsUv;
varying float vBindY;
varying float vCover;
uniform vec4 uCoverTorso; // yMin, yMaxBack, yMaxFront, enabled
uniform vec4 uCoverLimbs; // armMaxX, legMinY, footMaxY, margin
`;

// Same push-in of covered regions as the procedural skin; the front/back neckline height is blended by the normal so the
// edge of a (much coarser) scanned mesh does not step where the surface turns sideways.
const MSKIN_VERT_COVER = /* glsl */ `
#include <morphtarget_vertex>
vInfo = aInfo;
vFace = aFace;
vMsUv = uv;
vBindY = transformed.y;
{
  float part = aInfo.x;
  float sAx = aInfo.y;
  float mg = uCoverLimbs.w;
  float cover = 0.0;
  if (part < 0.5) {
    // the front neckline dip only exists near the neck: further out the opening stays at the back height (the shoulder slope)
    float yMax = mix(uCoverTorso.y, uCoverTorso.z, smoothstep(-0.3, 0.3, aInfo.z) * (1.0 - smoothstep(0.06, 0.11, abs(position.x))));
    // a narrow margin below the neckline: the scanned shoulder slope rises close to the opening and would poke through the shell in motion
    float mt = mg * 0.3;
    cover = uCoverTorso.w * smoothstep(uCoverTorso.x + mg - 0.012, uCoverTorso.x + mg + 0.012, sAx) * (1.0 - smoothstep(yMax - mt - 0.006, yMax - mt + 0.006, sAx));
  } else if (part < 1.5) {
    cover = smoothstep(uCoverLimbs.y + mg - 0.012, uCoverLimbs.y + mg + 0.012, sAx);
  } else if (part < 2.5) {
    cover = 1.0 - smoothstep(uCoverLimbs.x - mg - 0.012, uCoverLimbs.x - mg + 0.012, sAx);
  } else if (part > 3.5 && part < 4.5) {
    cover = 1.0 - smoothstep(uCoverLimbs.z - mg - 0.012, uCoverLimbs.z - mg + 0.012, sAx);
  }
  transformed -= normal * (0.022 * cover);
  vCover = cover;
}
`;

const MSKIN_FRAG_HEAD = /* glsl */ `
varying vec4 vInfo;
varying vec3 vFace;
varying vec2 vMsUv;
varying float vBindY;
varying float vCover;
uniform sampler2D uAlbedo;
uniform sampler2D uMask;
uniform vec3 uSkinMean;
uniform vec3 uClothLum;
uniform float uSplitY;
uniform vec3 uUnder;
uniform float uDetail;
uniform vec3 uBase;
uniform vec3 uEyeColor;
uniform vec3 uBrowColor;
uniform vec3 uHairColor;
uniform vec4 uSkinFx; // freckles, blush, stubble, -
uniform float uSelect;
float hsHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hsLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

const MSKIN_FRAG_PAINT = /* glsl */ `
#include <color_fragment>
if (vCover > 0.5) discard;                            // under an opaque garment: nothing of the body can poke through
{
  vec3 tone = diffuseColor.rgb;                       // material.color: the chosen skin tone (linear)
  vec3 tex = texture2D(uAlbedo, vMsUv).rgb;           // baked albedo (linear)
  vec3 m = texture2D(uMask, vMsUv).rgb;               // skin, baked clothing, iris / brow
  float lt = max(hsLuma(tex), 1e-4);
  // skin: the chosen tone times the baked shading (luminance ratio to the mean baked skin), a little of the baked hue kept
  float rsMin = vInfo.x < 2.5 ? 0.78 : 0.6; // darkest texels next to the baked clothing are its anti-aliased edge, not shadow
  float rs = pow(clamp(lt / max(hsLuma(uSkinMean), 1e-3), rsMin, 1.8), uDetail); // anti-aliased clothing edges are skin-warm but dark: keep them from drawing lines
  vec3 hue = clamp(tex / max(uSkinMean, vec3(1e-3)) / max(lt / max(hsLuma(uSkinMean), 1e-3), 1e-3), vec3(0.8), vec3(1.25));
  vec3 skinCol = tone * rs * mix(vec3(1.0), hue, 0.35);
  // baked base layer: plain underwear with its own shading (dark and light parts are normalised separately)
  float refL = lt < uClothLum.z ? uClothLum.x : uClothLum.y;
  vec3 underCol = uUnder * pow(clamp(lt / max(refL, 1e-4), 0.3, 2.5), uDetail * 0.8);
  // a garment over the tank top (or the shorts) that does not hide all of it: what peeks out reads as bare skin, not as a second layer
  vec3 bareCol = tone * 0.94 * vec3(1.0, 0.985, 0.97) * pow(clamp(lt / max(refL, 1e-4), 0.75, 1.35), uDetail * 0.5);
  underCol = mix(underCol, bareCol, mix(uBase.x, uBase.y, step(vBindY, uBase.z)));
  // iris and brow take the creator colours, keeping the baked dark/bright structure
  float isBrow = step(uSplitY, vBindY);
  vec3 irisCol = uEyeColor * mix(0.38, 1.25, smoothstep(0.004, 0.06, lt));
  vec3 browCol = uBrowColor * mix(0.55, 1.2, smoothstep(0.01, 0.12, lt));
  vec3 featCol = mix(irisCol, browCol, isBrow);
  float rest = clamp(1.0 - m.r - m.g - m.b, 0.0, 1.0);
  vec3 col = tex * rest + skinCol * m.r + underCol * m.g + featCol * m.b;
  if (vInfo.x < 2.5) {
    // torso, legs, arms: only skin and the baked base layer exist there. The anti-aliased edge texels between them are neither,
    // so they would show as dark seam lines along the baked hems and straps: split them between the two instead.
    float sg = m.r + m.g;
    vec2 w = sg > 0.02 ? vec2(m.r, m.g) / sg : vec2(1.0, 0.0);
    col = skinCol * w.x + underCol * w.y;
  }
  // face paint on the head: blush, freckles and stubble use the parametric face layout (aFace = head-local coordinates)
  if (vInfo.x > 4.5 && vInfo.x < 5.5) {
    vec3 fp = vFace;
    if (fp.z > 0.02) {
      float ax = abs(fp.x);
      float skinM = clamp(m.r, 0.0, 1.0);
      float cheek = exp(-(pow(ax - 0.045, 2.0) + pow(fp.y - 0.062, 2.0)) / (2.0 * 0.015 * 0.015));
      col = mix(col, col * vec3(1.12, 0.74, 0.76), uSkinFx.y * cheek * 0.55 * skinM);
      if (uSkinFx.x > 0.01) {
        float region = exp(-pow(ax - 0.026, 2.0) / (2.0 * 0.021 * 0.021) - pow(fp.y - 0.073, 2.0) / (2.0 * 0.012 * 0.012));
        vec2 cell = fp.xy / 0.0034;
        vec2 ci = floor(cell);
        vec2 cf = fract(cell);
        float h = hsHash(ci);
        vec2 c = vec2(hsHash(ci + 7.1), hsHash(ci + 3.3)) * 0.6 + 0.2;
        float r = (0.16 + 0.14 * hsHash(ci + 1.7));
        float dotM = step(0.45, h) * (1.0 - smoothstep(r - 0.1, r + 0.1, length(cf - c)));
        col = mix(col, col * vec3(0.68, 0.55, 0.47), dotM * region * uSkinFx.x * 0.85 * skinM);
      }
      if (uSkinFx.z > 0.01) {
        float lowerFace = smoothstep(0.052, 0.036, fp.y) * smoothstep(-0.03, -0.004, fp.y);
        float lipGap = 1.0 - exp(-(fp.x * fp.x) / (2.0 * 0.019 * 0.019) - pow(fp.y - 0.029, 2.0) / (2.0 * 0.0075 * 0.0075));
        float upper = smoothstep(0.05, 0.044, fp.y) * smoothstep(0.034, 0.038, fp.y) * smoothstep(0.03, 0.02, ax);
        float sm = clamp(lowerFace * lipGap + upper, 0.0, 1.0) * smoothstep(0.06, 0.07, length(vec2(ax, fp.z)));
        float grain = 0.7 + 0.3 * hsHash(floor(fp.xy / 0.0007));
        col = mix(col, mix(col * 0.55, uHairColor * 0.8, 0.5), sm * uSkinFx.z * 0.55 * grain * skinM);
      }
    }
  }
  diffuseColor.rgb = col;
}
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.08 + vec3(0.04, 0.03, 0.0), uSelect);
`;

/** Per-character skin material of a Meshy body: baked albedo recoloured to the chosen skin tone through the mask. */
export function createMeshySkinMaterial(): { material: THREE.MeshStandardMaterial; uniforms: MeshySkinUniforms } {
  const material = new THREE.MeshStandardMaterial({ color: '#c99a78', roughness: 0.7, metalness: 0 });
  const uniforms: MeshySkinUniforms = {
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
    uAlbedo: { value: null },
    uMask: { value: null },
    uSkinMean: { value: new THREE.Vector3(0.79, 0.49, 0.38) },
    uClothLum: { value: new THREE.Vector3(0.1, 0.1, 0.1) },
    uSplitY: { value: 1.685 },
    uUnder: { value: new THREE.Color('#d9d3c9') },
    uDetail: { value: 0.75 },
    uBase: { value: new THREE.Vector3(0, 0, 0.9) },
  };
  patch(material, 'hs-meshy-skin-v2', uniforms as unknown as Uniforms,
    [['#include <common>', `#include <common>\n${MSKIN_VERT_HEAD}`], ['#include <morphtarget_vertex>', MSKIN_VERT_COVER]],
    [['#include <common>', `#include <common>\n${MSKIN_FRAG_HEAD}`], ['#include <color_fragment>', MSKIN_FRAG_PAINT]]);
  return { material, uniforms };
}

// ---------------------------------------------------------------------------------------------
// Skin and parts of an MPFB body
// ---------------------------------------------------------------------------------------------

/** Uniforms of the MPFB skin: the shared SkinUniforms plus the skin texture and the mean colour the tone recolour is relative to. */
export interface MpfbSkinUniforms extends SkinUniforms {
  uAlbedo: THREE.IUniform<THREE.Texture | null>;
  /** Mean linear colour of the skin texture: the texel that maps to exactly the chosen tone. */
  uSkinMean: THREE.IUniform<THREE.Vector3>;
  /** Age-line intensity of an elder, baked into the head's own UV layout (null for the younger stages). */
  uWrinkleMap: THREE.IUniform<THREE.Texture | null>;
}

const PSKIN_FRAG_HEAD = /* glsl */ `
varying vec4 vInfo;
varying vec3 vFace;
varying vec2 vMsUv;
varying float vCover;
varying float vLips;
uniform sampler2D uAlbedo;
uniform vec3 uSkinMean;
uniform vec3 uLipColor;
uniform vec3 uHairColor;
uniform vec4 uMouth; // width, fullness, lipTint, -
uniform vec4 uSkinFx; // freckles, blush, stubble, -
uniform float uSelect;
#ifdef HAS_WRINKLES
uniform sampler2D uWrinkleMap;
#endif
float hsHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hsLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

// The painted albedo recoloured to the chosen tone: tone * (luminance ratio * (1 - C) + per-channel ratio * C), see mpfbBody.recolourTexel.
const PSKIN_FRAG_PAINT = /* glsl */ `
#include <color_fragment>
if (vCover > 0.5) discard;                            // under an opaque garment: nothing of the body can poke through
{
  vec3 tone = diffuseColor.rgb;                       // material.color: the chosen skin tone (linear)
  vec3 tex = texture2D(uAlbedo, vMsUv).rgb;           // painted albedo (linear)
  float l = hsLuma(tex) / hsLuma(uSkinMean);
  vec3 col = tone * (l * ${f(1 - 0.35)} + (tex / uSkinMean) * ${f(0.35)});
#ifdef HAS_WRINKLES
  if (vInfo.x > 4.5 && vInfo.x < 5.5) {
    // fine age lines baked from the head's own UV layout: a little darkening only, so every skin tone keeps its colour
    col *= 1.0 - 0.3 * texture2D(uWrinkleMap, vMsUv).r;
  }
#endif
  // lips: the skin's _LIPS weight shifts the colour towards the lip colour's hue, keeping luminance (every tone works)
  col *= mix(vec3(1.0), uLipColor / max(hsLuma(uLipColor), 1e-3), clamp(vLips * uMouth.z * 0.5, 0.0, 1.0));
  if (vInfo.x > 4.5 && vInfo.x < 5.5) {
    vec3 fp = vFace;
    if (fp.z > 0.02) {
      float ax = abs(fp.x);
      float cheek = exp(-(pow(ax - 0.045, 2.0) + pow(fp.y - 0.062, 2.0)) / (2.0 * 0.015 * 0.015));
      col = mix(col, col * vec3(1.12, 0.74, 0.76), uSkinFx.y * cheek * 0.55);
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
      if (uSkinFx.z > 0.01) {
        float lowerFace = smoothstep(0.052, 0.036, fp.y) * smoothstep(-0.03, -0.004, fp.y);
        float lipGap = 1.0 - exp(-(fp.x * fp.x) / (2.0 * 0.019 * 0.019) - pow(fp.y - 0.029, 2.0) / (2.0 * 0.0075 * 0.0075));
        float upper = smoothstep(0.05, 0.044, fp.y) * smoothstep(0.034, 0.038, fp.y) * smoothstep(0.03, 0.02, ax);
        float sm = clamp(lowerFace * lipGap + upper, 0.0, 1.0) * smoothstep(0.06, 0.07, length(vec2(ax, fp.z)));
        float grain = 0.7 + 0.3 * hsHash(floor(fp.xy / 0.0007));
        col = mix(col, mix(col * 0.55, uHairColor * 0.8, 0.5), sm * uSkinFx.z * 0.55 * grain);
      }
    }
  }
  diffuseColor.rgb = col;
}
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.08 + vec3(0.04, 0.03, 0.0), uSelect);
`;

const MPSKIN_VERT_HEAD = `${MSKIN_VERT_HEAD}attribute float aLips;\nvarying float vLips;\n`;
const MPSKIN_VERT_COVER = MSKIN_VERT_COVER.replace('vInfo = aInfo;', 'vInfo = aInfo;\nvLips = aLips;');

// ---------------------------------------------------------------------------------------------
// Elder wrinkles
// ---------------------------------------------------------------------------------------------

const WRINKLE_SIZE = 512;
let wrinkleTexture: THREE.DataTexture | null = null;
let wrinkleTried = false;

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Strength (0..1) of a line from (ax, ay) to (bx, by) across `halfW`, softened over `soft`. */
function lineMask(x: number, y: number, ax: number, ay: number, bx: number, by: number, halfW: number, soft = 0.0022): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
  const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
  return 1 - sstep(halfW - soft, halfW + soft, d);
}

/**
 * Age-line pattern in the head's local face coordinates (x = lateral, y = up from the chin, z = forward; FACE_LAYOUT).
 * Forehead lines, glabella, crow's feet, under-eye lines and nasolabial folds. Mild on purpose: readable at close range,
 * almost invisible from across the room. Baked into the head UVs, so it follows every slider, face morph and skin tone.
 */
export function wrinkleIntensity(p: readonly number[]): number {
  const x = p[0] as number, y = p[1] as number, z = p[2] as number;
  const front = sstep(0.012, 0.045, z);
  if (front <= 0) return 0;
  const ax = Math.abs(x);
  let w = 0;
  // forehead: three soft horizontal lines with a slight wave, fading toward the temples
  const temple = 1 - sstep(0.042, 0.066, ax);
  for (const [cy, amp] of [[0.135, 0.55], [0.152, 0.8], [0.169, 0.6]] as const) {
    const wave = 0.0022 * Math.sin(x * 55 + cy * 40) + 0.001 * Math.sin(x * 120 + 1.7);
    w = Math.max(w, amp * temple * (1 - sstep(0.0016, 0.0042, Math.abs(y - (cy + wave)))));
  }
  // glabella: two short vertical lines between the brows
  w = Math.max(w, 0.55 * lineMask(ax, y, 0.0075, 0.120, 0.0095, 0.139, 0.0016) * sstep(0.0, 0.003, ax));
  // crow's feet: three lines fanning from the outer eye corner
  w = Math.max(w, 0.6 * lineMask(ax, y, 0.0445, 0.1015, 0.057, 0.1075, 0.0014));
  w = Math.max(w, 0.7 * lineMask(ax, y, 0.0455, 0.0985, 0.059, 0.0985, 0.0014));
  w = Math.max(w, 0.6 * lineMask(ax, y, 0.0445, 0.0955, 0.057, 0.0905, 0.0014));
  // under-eye: a shallow line under each eye
  w = Math.max(w, 0.65 * lineMask(ax, y, 0.017, 0.0855, 0.032, 0.0795, 0.0015));
  w = Math.max(w, 0.65 * lineMask(ax, y, 0.032, 0.0795, 0.047, 0.0845, 0.0015));
  // nasolabial folds: from beside the nose down and out past the mouth corners
  w = Math.max(w, 0.85 * lineMask(ax, y, 0.0205, 0.062, 0.0295, 0.0465, 0.0017));
  w = Math.max(w, 0.75 * lineMask(ax, y, 0.0295, 0.0465, 0.0365, 0.0325, 0.0017));
  return Math.min(1, w) * front;
}

/** Rasterises `wrinkleIntensity` into the head's UV layout (red channel). Shared by every elder, built once. */
export function bakeWrinkleTexture(geometry: THREE.BufferGeometry): THREE.DataTexture | null {
  const pos = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const face = geometry.getAttribute('aFace');
  const info = geometry.getAttribute('aInfo');
  const index = geometry.getIndex();
  if (!pos || !uv || !face || !info || !index) return null;
  const S = WRINKLE_SIZE;
  const data = new Uint8Array(S * S);
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t), b = index.getX(t + 1), c = index.getX(t + 2);
    if (Math.abs(info.getX(a) - 5) > 0.5 || Math.abs(info.getX(b) - 5) > 0.5 || Math.abs(info.getX(c) - 5) > 0.5) continue;
    const au = uv.getX(a) * (S - 1), av = uv.getY(a) * (S - 1);
    const bu = uv.getX(b) * (S - 1), bv = uv.getY(b) * (S - 1);
    const cu = uv.getX(c) * (S - 1), cv = uv.getY(c) * (S - 1);
    if (Math.max(Math.abs(au - bu), Math.abs(bu - cu), Math.abs(au - cu)) > S * 0.5) continue; // island seam
    const x0 = Math.max(0, Math.floor(Math.min(au, bu, cu))), x1 = Math.min(S - 1, Math.ceil(Math.max(au, bu, cu)));
    const y0 = Math.max(0, Math.floor(Math.min(av, bv, cv))), y1 = Math.min(S - 1, Math.ceil(Math.max(av, bv, cv)));
    const den = (bv - cv) * (au - cu) + (cu - bu) * (av - cv);
    if (Math.abs(den) < 1e-9) continue;
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const sx = px + 0.5, sy = py + 0.5;
      const w0 = ((bv - cv) * (sx - cu) + (cu - bu) * (sy - cv)) / den;
      const w1 = ((cv - av) * (sx - cu) + (au - cu) * (sy - cv)) / den;
      const w2 = 1 - w0 - w1;
      if (w0 < -0.03 || w1 < -0.03 || w2 < -0.03) continue;
      const p = [0, 1, 2].map((k) => w0 * face.getComponent(a, k) + w1 * face.getComponent(b, k) + w2 * face.getComponent(c, k));
      const v = Math.round(wrinkleIntensity(p) * 255);
      const o = py * S + px;
      if (v > (data[o] as number)) data[o] = v;
    }
  }
  // close one-texel gaps at island edges so the filtered texture does not dim the lines
  const grown = data.slice();
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    const o = y * S + x;
    if (data[o]) continue;
    grown[o] = Math.max(data[o - 1] as number, data[o + 1] as number, data[o - S] as number, data[o + S] as number);
  }
  const tex = new THREE.DataTexture(grown, S, S, THREE.RedFormat, THREE.UnsignedByteType);
  tex.flipY = false;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Elder wrinkle map: one small texture built from the first elder body and reused by every elder (all MPFB bodies share UVs). */
export function wrinkleMapForStage(stage: string, geometry: THREE.BufferGeometry): THREE.DataTexture | null {
  if (stage !== 'elder') return null;
  if (!wrinkleTried) { wrinkleTried = true; wrinkleTexture = bakeWrinkleTexture(geometry); }
  return wrinkleTexture;
}

/** Per-character skin material of an MPFB body: the painted albedo recoloured to the chosen tone, face paint, push-in under garments. */
export function createMpfbSkinMaterial(wrinkleMap: THREE.Texture | null = null): { material: THREE.MeshStandardMaterial; uniforms: MpfbSkinUniforms } {
  const material = new THREE.MeshStandardMaterial({ color: '#c99a78', roughness: 0.62, metalness: 0 });
  const uniforms: MpfbSkinUniforms = {
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
    uAlbedo: { value: null },
    uSkinMean: { value: new THREE.Vector3(0.3986, 0.2295, 0.1613) },
    uWrinkleMap: { value: wrinkleMap },
  };
  patch(material, `hs-mpfb-skin-v3${wrinkleMap ? '-w' : ''}`, uniforms as unknown as Uniforms,
    [['#include <common>', `#include <common>\n${MPSKIN_VERT_HEAD}`], ['#include <morphtarget_vertex>', MPSKIN_VERT_COVER]],
    [['#include <common>', `#include <common>\n${PSKIN_FRAG_HEAD}`], ['#include <color_fragment>', PSKIN_FRAG_PAINT]],
    wrinkleMap ? { HAS_WRINKLES: '' } : {});
  return { material, uniforms };
}

/** Uniforms of the MPFB eye material. */
export interface MpfbEyeUniforms { uEyeColor: THREE.IUniform<THREE.Color> }

/**
 * Eyes of an MPFB body: the eyeball texture with its iris recoloured. The iris is the saturated part of the texture (the sclera is
 * grey-pink); it takes the chosen eye colour times the painted light and dark structure of the iris.
 */
export function createMpfbEyeMaterial(map: THREE.Texture): { material: THREE.MeshStandardMaterial; uniforms: MpfbEyeUniforms } {
  const material = new THREE.MeshStandardMaterial({ map, roughness: 0.15, metalness: 0 });
  const uniforms: MpfbEyeUniforms = { uEyeColor: { value: new THREE.Color('#5e3b1f') } };
  patch(material, 'hs-mpfb-eye-v1', uniforms as unknown as Uniforms, [],
    [['#include <common>', '#include <common>\nuniform vec3 uEyeColor;'],
      ['#include <map_fragment>', `#include <map_fragment>
{
  vec3 t = diffuseColor.rgb;
  float mx = max(t.r, max(t.g, t.b)), mn = min(t.r, min(t.g, t.b));
  float iris = smoothstep(0.3, 0.52, (mx - mn) / (mx + 1e-4));
  float lum = dot(t, vec3(0.2126, 0.7152, 0.0722));
  diffuseColor.rgb = mix(t, uEyeColor * clamp(lum / 0.2, 0.25, 1.7), iris);
}`]]);
  return { material, uniforms };
}

/** The iris of an MPFB body: a neutral grey texture (fibres, dark limbal ring, black pupil) multiplied by the eye colour. */
export function createMpfbIrisMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map, roughness: 0.2, metalness: 0 });
}

/** Uniforms of the MPFB underwear material. */
export interface MpfbUnderwearUniforms {
  /** Top worn (0/1), bottom worn (0/1), height (bind space) that separates the top from the bottom. */
  uBase: THREE.IUniform<THREE.Vector3>;
}

/** Underwear of an MPFB body: plain, and hidden per half (top, bottom) where a garment is worn over it. */
export function createMpfbUnderwearMaterial(color: THREE.Color): { material: THREE.MeshStandardMaterial; uniforms: MpfbUnderwearUniforms } {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 });
  const uniforms: MpfbUnderwearUniforms = { uBase: { value: new THREE.Vector3(0, 0, 1) } };
  patch(material, 'hs-mpfb-underwear-v1', uniforms as unknown as Uniforms,
    [['#include <common>', '#include <common>\nvarying float vUwY;'], ['#include <begin_vertex>', '#include <begin_vertex>\nvUwY = position.y;']],
    [['#include <common>', '#include <common>\nvarying float vUwY;\nuniform vec3 uBase;'],
      ['#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif ((vUwY > uBase.z ? uBase.x : uBase.y) > 0.5) discard;']]);
  return { material, uniforms };
}

/** Brows and lashes of an MPFB body: the alpha texture tinted by the material colour, drawn after the skin without writing depth. */
export function createMpfbHairlineMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ map, roughness: 0.8, metalness: 0, transparent: true, depthWrite: false });
  // the painted strokes are thin: harden their alpha so they read at game distances
  patch(material, 'hs-mpfb-hairline-v1', {}, [], [['#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a = smoothstep(0.0, 0.5, diffuseColor.a);']]);
  return material;
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
/**
 * Per fabric: relief of the weave (normal detail from the texture), strength of the soft drape wrinkles, sheen (smooth
 * synthetics catch light at grazing angles) and fuzz (a soft light rim on brushed and knitted cloth).
 */
export const FABRIC_FX: Record<string, { bump: number; fold: number; sheen: number; fuzz: number }> = {
  cotton: { bump: 0.25, fold: 0.5, sheen: 0, fuzz: 0.08 },
  knit: { bump: 1, fold: 0.5, sheen: 0, fuzz: 0.4 },
  denim: { bump: 0.9, fold: 0.75, sheen: 0, fuzz: 0.05 },
  poplin: { bump: 0.25, fold: 0.5, sheen: 0.12, fuzz: 0 },
  pique: { bump: 0.9, fold: 0.4, sheen: 0, fuzz: 0.1 },
  flannel: { bump: 0.5, fold: 0.55, sheen: 0, fuzz: 0.3 },
  canvas: { bump: 0.7, fold: 0.45, sheen: 0, fuzz: 0.05 },
  wool: { bump: 0.7, fold: 0.5, sheen: 0, fuzz: 0.3 },
  fleece: { bump: 0.5, fold: 0.65, sheen: 0, fuzz: 0.5 },
  nylon: { bump: 0.1, fold: 0.6, sheen: 0.55, fuzz: 0 },
  lycra: { bump: 0.1, fold: 0.25, sheen: 0.45, fuzz: 0 },
  rib: { bump: 1, fold: 0.4, sheen: 0, fuzz: 0.2 },
  leather: { bump: 0.5, fold: 0.35, sheen: 0.35, fuzz: 0 },
  plush: { bump: 0.6, fold: 0.5, sheen: 0, fuzz: 0.6 },
};
export const PATTERN_IDS: Record<string, number> = { solid: 0, stripes: 1, pinstripe: 2, plaid: 3, polka: 4, gingham: 5, chevron: 6 };

export interface ClothUniforms {
  uPatColor: THREE.IUniform<THREE.Color>;
  uAltColor: THREE.IUniform<THREE.Color>;
  uPattern: THREE.IUniform<number>;
  uFabric: THREE.IUniform<number>;
  /**
   * details (1 jeans, 2 crease, 3 side stripe, 4 sneaker laces/toe cap, 5 loafer strap, 6 running shoe, 7 pump, 8 flat bow, 9 jacket seams),
   * placket (1 buttons, 2 zip, 3 short, 4 two buttons, 5 double-breasted), rib, piping
   */
  uFlags: THREE.IUniform<THREE.Vector4>;
  /** hem band, belt, ankle cuff, waistband */
  uFlags2: THREE.IUniform<THREE.Vector4>;
  uCutNeck: THREE.IUniform<THREE.Vector4>;
  uCutArm: THREE.IUniform<THREE.Vector4>;
  uCutMisc: THREE.IUniform<THREE.Vector4>;
  uHem: THREE.IUniform<THREE.Vector4>;
  /** pocket style (1 kangaroo, 2 chest flaps, 3 denim jacket, 4 cargo thigh, 5 chino slant, 6 welt), decor (1 hood cords, 2 quilt, 3 lapel, 4 wrap, 8 sash without buckle), neck band width (m), necktie flag */
  uFlags3: THREE.IUniform<THREE.Vector4>;
  /** neck cut of the inner shirt under a jacket (same layout as uCutNeck; inactive when z = 0) */
  uInner: THREE.IUniform<THREE.Vector4>;
  /** crotchY, chestY, neckBaseY, foot centre |x| */
  uBody: THREE.IUniform<THREE.Vector4>;
  /** fabric relief, drape wrinkles, sheen, fuzz (see FABRIC_FX) */
  uFx: THREE.IUniform<THREE.Vector4>;
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
uniform vec4 uFlags3;
uniform vec4 uInner;
uniform vec4 uBody;
uniform vec4 uFx;
uniform float uSelect;
float hcH = 0.0; // fabric height for the normal detail, set in the colour pass

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
// distance-based line along the segment a-b (half width hw)
float hcSeg(vec2 p, vec2 a, vec2 b, float hw) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return hcLine(length(pa - ba * h), hw);
}
// rounded rectangle outline (centre c, half size hs): 1 on the outline
float hcRectLine(vec2 p, vec2 c, vec2 hs, float hw) {
  vec2 d = abs(p - c) - hs;
  float o = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  return hcLine(o, hw);
}
float hcRectIn(vec2 p, vec2 c, vec2 hs) {
  vec2 d = abs(p - c) - hs;
  return step(max(d.x, d.y), 0.0);
}
float hcNeckY(float ax, float front, vec4 nk) {
  float shape = nk.w;
  float r = ax / max(nk.z, 1e-4);
  float dip = 0.0;
  if (shape < 0.5) dip = max(1.0 - r * r, 0.0);
  else if (shape < 1.5) dip = pow(max(1.0 - r * r, 0.0), 0.5);
  else if (shape < 2.5) dip = max(1.0 - r, 0.0);
  else if (shape < 3.5) dip = 1.0 - smoothstep(0.85, 1.0, r);
  return nk.x - nk.y * front * dip;
}
// lower edge of the armhole of a strapped top: vertical beside the strap, rounding out to the armpit
float hcArmholeY(float ax) {
  float k = 1.0 - clamp((ax - uCutArm.z) / 0.075, 0.0, 1.0);
  return uCutArm.x + 0.2 * (1.0 - sqrt(max(1.0 - k * k, 0.0)));
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
  bool innerShirt = panel > 6.5 && panel < 7.5;
  vec4 nk = (innerShirt && uInner.z > 0.0) ? uInner : uCutNeck;
  if (torsoLike && nk.w < 3.5) neckY = hcNeckY(ax, front, nk);
  if (torsoLike) {
    bool strapZone = uCutArm.w > 0.5 && ax >= uCutArm.y && ax <= uCutArm.z;
    if (uCutArm.w > 0.5 && ax > uCutArm.z && b.y > hcArmholeY(ax)) discard;
    if (!strapZone && b.y > neckY) discard;
  }
  if (panel > 7.5 && panel < 8.5 && b.y > uHem.w) {
    bool bib = front > 0.5 && ax < uCutMisc.z && b.y < uCutMisc.y;
    bool strap = ax > uCutArm.y && ax < uCutArm.z;
    if (!(bib || strap)) discard;
  }
  if (uCutMisc.x > 0.0) {
    if (panel < 0.5 && b.y < uBody.x + uCutMisc.x * smoothstep(0.035, 0.115, ax)) discard;
    if (panel > 1.5 && panel < 2.5 && ax > 0.035) discard;
  }
  // ---- base colour and pattern ----
  vec3 base = diffuseColor.rgb;
  bool inner = (panel > 6.5 && panel < 7.5) || panel > 8.5;
  if (isShoe && b.y < uHem.x) base = uAltColor;
  if (inner) base = uAltColor;
  bool patterned = !isShoe && !inner;
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
  // fabric relief: the weave from the texture, soft vertical drape wrinkles that follow the cloth coordinates
  float wr = hcNoise(vec2(uv.x * 40.0, uv.y * 6.5)) - 0.5 + 0.5 * (hcNoise(vec2(uv.x * 95.0 + 3.1, uv.y * 14.0)) - 0.5);
  float weaveFade = 1.0 - smoothstep(0.08, 0.3, (fwidth(uv.x) + fwidth(uv.y)) * 150.0); // sub-pixel weave would only add noise
  hcH = (tex - 1.0) * 5.0 * uFx.x * weaveFade + wr * 0.55 * uFx.y * (isShoe ? 0.3 : 1.0);
  // ---- trims and details ----
  float rib = 0.0;
  float dNeck = neckY - b.y;
  if (torsoLike && uFlags.z > 0.5 && dNeck < 0.013 && dNeck > -0.001) rib = 1.0;
  if ((panel > 0.5 && panel < 1.5 || panel > 8.5) && (uFlags.z > 0.5 || uFlags2.x > 0.5 || panel > 8.5) && uHem.y - ax < (uFlags2.x > 0.5 ? 0.045 : 0.014)) rib = 1.0;
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
  if (torsoLike && uFlags.y > 0.5 && uFlags.y < 4.5 && b.z > 0.0 && !(panel > 6.5 && panel < 7.5)) {
    float top = neckY;
    float len = uFlags.y > 3.5 ? 0.17 : uFlags.y > 2.5 ? 0.12 : 2.0;
    if (b.y < top && b.y > top - len) {
      if (uFlags.y < 1.5 || uFlags.y > 2.5) {
        col *= 1.0 - 0.18 * hcLine(ax - 0.012, 0.0008);
        float k = (top - 0.025 - b.y) / 0.075;
        float by = top - 0.025 - floor(k + 0.5) * 0.075;
        float bd = length(vec2(b.x, b.y - by));
        float bm = (1.0 - smoothstep(0.0034, 0.0042, bd)) * step(-0.5, k) * step(top - len, by - 0.004);
        col = mix(col, mix(col, vec3(0.96, 0.94, 0.9), 0.55), bm);
      } else {
        col = mix(col, vec3(0.55, 0.56, 0.58), hcLine(b.x, 0.0012));
        float tab = (1.0 - step(0.004, abs(b.x))) * step(top - 0.03, b.y);
        col = mix(col, vec3(0.7, 0.71, 0.73), tab);
      }
    }
  }
  // double-breasted front: two columns of buttons, the overlap edge and a stitched flap line
  if (torsoLike && uFlags.y > 4.5 && b.z > 0.0 && !(panel > 6.5 && panel < 7.5)) {
    float topC = uCutNeck.x - uCutNeck.y;
    float lowC = min(topC, uHem.x + 0.55);
    float kk = (lowC - 0.03 - b.y) / 0.085;
    float byy = lowC - 0.03 - floor(kk + 0.5) * 0.085;
    float inRows = step(-0.5, kk) * step(kk, 3.5);
    float bd2 = length(vec2(ax - 0.052, b.y - byy));
    float bm2 = (1.0 - smoothstep(0.0048, 0.0058, bd2)) * inRows;
    float flapEdge = hcLine(b.x + 0.085, 0.0008) * step(uHem.x, b.y) * step(b.y, lowC) * step(0.0, b.z);
    col *= 1.0 - 0.2 * flapEdge;
    col = mix(col, vec3(0.2, 0.15, 0.1), bm2 * 0.9);
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
  // jacket seams (denim jacket): front princess seams, back yoke, sleeve seam
  if (uFlags.x > 8.5 && uFlags.x < 9.5) {
    vec3 thread = vec3(0.8, 0.58, 0.28);
    float dash = step(0.45, fract((b.y + b.x * 0.7) / 0.006));
    float st = 0.0;
    if (panel < 0.5) {
      float topS = uBody.y + 0.02;
      if (front > 0.5) st = max(st, hcLine(ax - 0.105, 0.0009) * step(uHem.x + 0.02, b.y) * step(b.y, topS));
      else {
        st = max(st, hcLine(b.y - (uBody.y + 0.075), 0.0009));
        st = max(st, hcLine(ax - 0.07, 0.0009) * step(uHem.x + 0.02, b.y) * step(b.y, uBody.y + 0.075));
      }
    }
    col = mix(col, thread, clamp(st, 0.0, 1.0) * dash);
  }
  // pockets (stitched outlines and flaps; the drawing sits on the cloth, no extra geometry)
  if (uFlags3.x > 0.5) {
    float pk = 0.0;
    float fill = 0.0;
    float pStyle = uFlags3.x;
    if (pStyle < 1.5 && panel < 0.5 && front > 0.5) {
      // kangaroo pocket on the belly
      float py0 = uHem.x + 0.05, py1 = uHem.x + 0.2;
      float tt = clamp((b.y - py0) / (py1 - py0), 0.0, 1.0);
      float hw = mix(0.13, 0.09, tt);
      float inBand = step(py0, b.y) * step(b.y, py1);
      pk = max(hcLine(ax - hw, 0.0012) * inBand, hcLine(b.y - py1, 0.0012) * step(ax, hw) * 0.9);
      fill = inBand * step(ax, hw);
      pk = max(pk, hcLine(b.y - py0, 0.0012) * step(ax, hw) * 0.8);
    } else if ((pStyle > 1.5 && pStyle < 3.5) && panel < 0.5 && front > 0.5) {
      // chest pockets with a button flap
      float cy = uBody.y - 0.025;
      vec2 c = vec2(ax, b.y);
      vec2 pc = vec2(0.075, cy - 0.025), ph = vec2(0.032, 0.036);
      pk = hcRectLine(c, pc, ph, 0.0011);
      fill = hcRectIn(c, pc, ph) * 0.5;
      float flapY = cy + 0.011 - 0.012;
      pk = max(pk, hcLine(b.y - (cy + 0.0) + 0.0, 0.0011) * hcRectIn(c, pc, ph + vec2(0.001)));
      float but = 1.0 - smoothstep(0.0028, 0.0036, length(c - vec2(0.075, cy - 0.011)));
      col = mix(col, vec3(0.78, 0.66, 0.36), but * hcRectIn(c, pc, ph));
    } else if (pStyle > 3.5 && pStyle < 4.5 && panel > 1.5 && panel < 2.5) {
      // cargo pocket on the outer thigh with a flap
      float wt = uHem.w;
      vec2 c = vec2(b.z, b.y);
      vec2 pc = vec2(0.0, wt - 0.235), ph = vec2(0.052, 0.07);
      float side = step(0.115, ax);
      pk = hcRectLine(c, pc, ph, 0.0012) * side;
      fill = hcRectIn(c, pc, ph) * side * 0.5;
      pk = max(pk, hcLine(b.y - (wt - 0.19), 0.0012) * hcRectIn(c, pc, ph) * side);
      float but = (1.0 - smoothstep(0.0032, 0.004, length(vec2(b.z, b.y - (wt - 0.215))))) * side;
      col = mix(col, vec3(0.78, 0.66, 0.36), but);
    } else if (pStyle > 4.5 && pStyle < 5.5 && (panel < 0.5 || panel > 1.5 && panel < 2.5)) {
      // chino slant pockets in front, welt pockets behind
      float wt = uHem.w;
      if (front > 0.5) pk = hcSeg(vec2(ax, b.y), vec2(0.15, wt - 0.008), vec2(0.105, wt - 0.115), 0.0012) * step(0.0, b.z);
      else {
        pk = hcSeg(vec2(ax, b.y), vec2(0.06, wt - 0.06), vec2(0.115, wt - 0.06), 0.0012);
        pk = max(pk, hcLine(b.y - (wt - 0.052), 0.0008) * step(0.06, ax) * step(ax, 0.115));
      }
      pk *= step(b.y, wt) * step(wt - 0.2, b.y);
    } else if (pStyle > 5.5 && panel < 0.5 && front > 0.5) {
      // jacket welt pockets and a breast pocket
      float hy = uHem.x + 0.12;
      pk = hcSeg(vec2(ax, b.y), vec2(0.08, hy), vec2(0.15, hy), 0.0012);
      pk = max(pk, hcSeg(vec2(ax, b.y), vec2(0.08, hy + 0.012), vec2(0.15, hy + 0.012), 0.0008));
      pk = max(pk, hcSeg(vec2(b.x, b.y), vec2(0.075, uBody.y - 0.025), vec2(0.125, uBody.y - 0.02), 0.0012) * step(0.0, b.x));
    }
    col = mix(col, col * 0.62, clamp(pk, 0.0, 1.0));
    col = mix(col, col * 0.96, fill);
  }
  // decorations
  if (uFlags3.y > 0.5) {
    float dec = uFlags3.y;
    if (dec < 1.5) {
      // hood drawstrings hanging from the neckline
      float cord = hcLine(ax - 0.032, 0.0022) * front * step(neckY - 0.15, b.y) * step(b.y, neckY - 0.012);
      float tip = (1.0 - smoothstep(0.0048, 0.006, length(vec2(ax - 0.032, b.y - (neckY - 0.152))))) * front;
      col = mix(col, mix(col, vec3(0.93, 0.92, 0.88), 0.85), max(cord * step(0.0, b.z), tip));
    } else if (dec < 2.5) {
      // quilted channels (puffer): horizontal on the body, across the sleeve
      float axisC = (panel > 0.5 && panel < 1.5) ? ax : b.y;
      float f01 = fract(axisC / 0.078);
      float seam = smoothstep(0.38, 0.5, abs(f01 - 0.5));
      col *= 1.0 - 0.2 * seam;
      hcH = hcH * 0.4 - seam * 1.6 + 0.4;
    } else if (dec < 3.5) {
      // lapel facing along the V opening, stitched edge
      float dN = neckY - b.y;
      float lap = front * step(0.0, dN) * step(dN, 0.052) * (panel < 0.5 ? 1.0 : 0.0);
      col = mix(col, col * 1.1 + vec3(0.025), lap * 0.6);
      col *= 1.0 - 0.24 * hcLine(dN - 0.052, 0.0007) * front * step(0.0, dN) * (panel < 0.5 ? 1.0 : 0.0);
    } else if (dec < 4.5) {
      // wrap front: the overlapping panel's edge crosses from the shoulder to the tie at the left hip
      float yTop = uCutNeck.x - uCutNeck.y;
      vec2 pp = vec2(b.x, b.y);
      float edge = hcSeg(pp, vec2(-0.05, uCutNeck.x - 0.02), vec2(0.105, uHem.w), 0.0014) * front * step(b.z, 0.5);
      col *= 1.0 - 0.3 * edge * (panel < 0.5 ? 1.0 : 0.0);
      // tie knot and ribbons at the left hip
      float knot = (1.0 - smoothstep(0.012, 0.016, length(vec2((b.x - 0.105) * 1.2, b.y - uHem.w)))) * front;
      float rib1 = hcSeg(pp, vec2(0.105, uHem.w), vec2(0.125, uHem.w - 0.12), 0.0045) * front;
      float rib2 = hcSeg(pp, vec2(0.105, uHem.w), vec2(0.085, uHem.w - 0.1), 0.0045) * front;
      col = mix(col, col * 0.72, max(knot, max(rib1, rib2)) * (panel < 0.5 || panel > 2.5 && panel < 3.5 ? 1.0 : 0.0));
    }
  }
  // necktie on the shirt under a suit jacket
  if (uFlags3.w > 0.5 && innerShirt && front > 0.5) {
    float topT = uInner.x - uInner.y;
    float t01 = clamp((topT - b.y) / 0.3, 0.0, 1.0);
    float w = mix(0.0085, 0.017, smoothstep(0.0, 0.18, t01)) * (1.0 - 0.45 * smoothstep(0.7, 1.0, t01));
    float tie = (1.0 - smoothstep(w - 0.0008, w + 0.0008, ax)) * step(b.y, topT + 0.005) * step(topT - 0.3, b.y);
    col = mix(col, vec3(0.5, 0.13, 0.17) * (0.85 + 0.2 * hcBand(uv.y + b.x * 3.0, 0.01, 0.5)), tie);
  }
  // neck band: a ribbed or contrasting trim along the neckline (cardigan, robe)
  if (torsoLike && uFlags3.z > 0.0 && !innerShirt) {
    float dNb = neckY - b.y;
    if (dNb < uFlags3.z && dNb > -0.001) {
      col *= 0.86 + 0.14 * mix(0.5, hcBand(uv.x + uv.y, 0.006, 0.5), hcFade(0.006, uv.x + uv.y));
      col = mix(col, col * 0.72, hcLine(dNb - uFlags3.z, 0.0007));
    }
  }
  // belt at the dress waist
  if (uFlags2.y > 0.5 && torsoLike || uFlags2.y > 0.5 && panel > 2.5 && panel < 3.5) {
    float belt = hcLine(b.y - uHem.w, 0.011);
    col = mix(col, col * 0.45, belt);
    float buckle = belt * (1.0 - step(0.014, ax)) * front * (uFlags3.y > 3.5 && uFlags3.y < 4.5 || uFlags3.y > 7.5 ? 0.0 : 1.0);
    col = mix(col, vec3(0.78, 0.66, 0.36), buckle);
  }
  // shoes: sneaker laces and toe cap, loafer strap
  if (isShoe && b.y >= uHem.x) {
    float fx = ax - uBody.w;
    if (uFlags.x > 3.5 && uFlags.x < 4.5) {
      float instep = step(0.0, b.z) * step(b.z, 0.11) * step(0.055, b.y);
      float lace = instep * step(abs(fx), 0.013) * hcBand(b.z, 0.016, 0.35);
      col = mix(col, uAltColor, lace);
      col = mix(col, uAltColor * 0.95, step(0.14, b.z) * step(b.y, 0.045));
    }
    if (uFlags.x > 4.5 && uFlags.x < 5.5) col = mix(col, col * 0.6, hcLine(b.z - 0.075, 0.006) * step(0.045, b.y));
    if (uFlags.x > 5.5 && uFlags.x < 6.5) {
      // running shoe: laced throat, side flash, perforated toe box, heel tab
      float instep = step(0.0, b.z) * step(b.z, 0.12) * step(0.05, b.y);
      float lace = instep * step(abs(fx), 0.012) * hcBand(b.z, 0.014, 0.4);
      col = mix(col, uAltColor, lace);
      float flash = hcSeg(vec2(b.z, b.y), vec2(-0.045, 0.028), vec2(0.1, 0.07), 0.0065) * step(0.02, abs(fx));
      col = mix(col, uAltColor, flash);
      float perf = hcBand(b.z, 0.011, 0.42) * hcBand(b.y, 0.011, 0.42) * step(0.1, b.z) * step(0.03, b.y);
      col *= 1.0 - 0.28 * perf;
      col = mix(col, col * 0.55, hcLine(b.z + 0.075, 0.004) * step(0.04, b.y));
    }
    if (uFlags.x > 6.5 && uFlags.x < 7.5) {
      // pump: thin ankle strap and a lighter sole edge
      col = mix(col, col * 0.7, hcLine(b.z + 0.035, 0.0035) * step(0.02, b.y));
    }
    if (uFlags.x > 7.5 && uFlags.x < 8.5) {
      // ballet flat: bow at the vamp and a gathered topline
      float bow = 1.0 - smoothstep(0.006, 0.0085, length(vec2(fx * 1.6, b.z - 0.115)));
      col = mix(col, col * 0.7 + 0.1, bow * step(0.02, b.y));
      col *= 1.0 - 0.14 * hcBand(b.z * 1.0 + fx * 0.0, 0.006, 0.5) * step(0.12, b.z);
    }
  }
  if (!gl_FrontFacing) col *= 0.7;
  col = mix(col, col * 1.08 + vec3(0.03, 0.025, 0.0), uSelect);
  diffuseColor.rgb = col;
}
`;

// Relief of the fabric: the height from the colour pass tilts the normal (three's bump-map derivative method).
const CLOTH_FRAG_BUMP = /* glsl */ `
{
  vec3 sx = normalize(dFdx(-vViewPosition)), sy = normalize(dFdy(-vViewPosition));
  vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float det = dot(sx, r1) * faceDirection;
  vec3 grad = sign(det) * (dFdx(hcH) * r1 + dFdy(hcH) * r2);
  normal = normalize(abs(det) * normal - grad);
}
`;

// Soft rim light at grazing angles: sheen on smooth synthetics, fuzz on brushed and knitted cloth.
const CLOTH_FRAG_SHEEN = /* glsl */ `
{
  float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  float rimF = pow(1.0 - ndv, 3.0);
  outgoingLight += mix(diffuseColor.rgb, vec3(1.0), 0.35) * rimF * uFx.w * 0.3 + vec3(1.0) * rimF * uFx.z * 0.22 * (0.4 + 0.6 * ndv);
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
    uFlags3: { value: new THREE.Vector4() },
    uInner: { value: new THREE.Vector4() },
    uBody: { value: new THREE.Vector4() },
    uFx: { value: new THREE.Vector4(0.5, 0.5, 0, 0) },
    uSelect: { value: 0 },
  };
  patch(material, 'hs-cloth-v3', uniforms as unknown as Uniforms,
    [['#include <common>', `#include <common>\n${CLOTH_VERT_HEAD}`], ['#include <begin_vertex>', '#include <begin_vertex>\nvCloth = aCloth;\nvBind = position;']],
    [
      ['#include <common>', `#include <common>\n${CLOTH_FRAG_HEAD}`],
      ['#include <color_fragment>', CLOTH_FRAG_PAINT],
      ['#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${CLOTH_FRAG_BUMP}`],
      ['#include <opaque_fragment>', `${CLOTH_FRAG_SHEEN}\n#include <opaque_fragment>`],
    ]);
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
attribute vec4 aLock;
varying vec4 vHair;
varying vec4 vLock;
varying vec3 vFlowView;
`;

const HAIR_VERT_FLOW = /* glsl */ `
#include <defaultnormal_vertex>
vHair = aHair;
vLock = aLock;
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
varying vec4 vLock;
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

// Strand paint. vHair = (across m, along m, root-to-tip, piece), vLock = (clump seed, baked light, edge fade, tooth).
// Strands are 3.3 mm cells across the card: each cell gets its own brightness, its own length (the tip is cut into pointed
// teeth by alpha test, so no sorting is needed) and, at the hairline, its own fade-out. Far away (cells under a pixel)
// the per-strand pattern is replaced by its average so nothing shimmers.
const HAIR_FRAG_PAINT = /* glsl */ `
#include <color_fragment>
float hairLight = 1.0;
float hairStrandN = 0.5;
{
  vec2 hv = vHair.xy;
  float tip = vHair.z;
  float piece = vHair.w;
  float seed = vLock.x;
  float light = vLock.y;
  float fade = vLock.z;
  float tooth = vLock.w;
  vec3 base = diffuseColor.rgb;
  float cellsX = hv.x * 300.0;
  float far = smoothstep(0.35, 0.9, fwidth(cellsX));
  float cell = floor(cellsX);
  float cr = mix(hhHash(vec2(cell, seed * 91.0 + 3.0)), 0.5, far);
  float within = mix(abs(fract(cellsX) - 0.5) * 2.0, 0.5, far);
  // the plait pattern belongs to the braid beads and tufts only; the scalp around them is straight hair
  float st = (uStrand > 3.5 && uStrand < 4.5 && !(piece > 2.5 && piece < 3.5)) ? 0.0 : uStrand;
  float n;
  if (st < 0.5) n = hhNoise(vec2(hv.x * 420.0, hv.y * 12.0));
  else if (st < 1.5) n = hhNoise(vec2((hv.x + sin(hv.y * 70.0) * 0.004) * 420.0, hv.y * 12.0));
  else if (st < 3.5) { float k = st < 2.5 ? 260.0 : 520.0; n = hhNoise(hv * k) * 0.6 + hhNoise(hv * k * 2.7) * 0.4; }
  else if (st < 4.5) n = 0.5 + 0.5 * sin((hv.y * 140.0 + abs(fract(hv.x * 30.0) - 0.5) * 8.0));
  else n = hhHash(floor(hv * 900.0));
  float fadeHi = 1.0 - far;
  float strands = mix(0.9, 0.7 + 0.42 * n, fadeHi);
  // clump brightness: broad bands across and along the card, so neighbouring locks differ a little
  float clump = hhNoise(vec2(hv.x * 80.0 + seed * 23.0, hv.y * 6.0 + seed * 7.0));
  float isLock = (piece > 1.5 && piece < 3.5) || piece > 6.5 ? 1.0 : 0.0;
  vec3 col = base * strands * (0.84 + 0.3 * clump);
  // baked light (ambient occlusion: roots and inner layers are darker), warmer in the shade
  col *= mix(0.55, 1.0, light);
  col = mix(col, col * vec3(1.06, 0.97, 0.9), (1.0 - light) * 0.6);
  // sun-lightened ends
  if (isLock > 0.5) col = mix(col, col * 1.14 + vec3(0.02, 0.014, 0.0), smoothstep(0.55, 1.0, tip) * 0.7);
  if (piece > 4.5 && piece < 5.5) col = base * 0.5;
  if (piece > 5.5 && piece < 6.5) col *= 0.92;
  hairStrandN = n;
  if (uHighlight.w > 0.5) {
    float streak = smoothstep(0.55, 0.78, hhNoise(vec2(hv.x * 38.0 + seed * 9.0, hv.y * 1.5)));
    float ends = isLock > 0.5 ? smoothstep(0.55, 1.0, tip) : 0.0;
    col = mix(col, uHighlight.rgb * mix(0.85, 1.05, n), clamp(streak * 0.75 + ends * 0.6, 0.0, 0.85));
  }
  if (!gl_FrontFacing) col *= 0.78;
  col = mix(col, col * 1.08 + vec3(0.03, 0.025, 0.0), uSelect);
  diffuseColor.rgb = col;
  hairLight = light;
  // alpha test: strands end at their own length in pointed teeth; the scalp edge dissolves into strands
  float tipEdge = 1.0 - tooth * (cr * 1.25 + within * 0.9);
  float alive = step(tip, tipEdge);
  float thr = 0.04 + 0.8 * cr;
  alive *= step(thr, fade * 1.08);
  diffuseColor.a = alive;
}
`;

// Anisotropic highlight band (Kajiya-Kay along the strand direction, two lobes, shifted per strand so the band breaks into
// streaks) from a fixed view-space key light, added as emissive on the lit side only.
const HAIR_FRAG_SHEEN = /* glsl */ `
#include <emissivemap_fragment>
{
  vec3 T = vFlowView / max(length(vFlowView), 1e-4);
  vec3 V = normalize(vViewPosition);
  vec3 Lk = normalize(vec3(0.35, 0.85, 0.4));
  vec3 H = normalize(Lk + V);
  float shift = (hairStrandN - 0.5) * 0.3;
  float t1 = clamp(dot(T, H) + shift, -1.0, 1.0);
  float t2 = clamp(dot(T, H) - 0.12 + shift * 1.6, -1.0, 1.0);
  float sp1 = pow(sqrt(max(0.0, 1.0 - t1 * t1)), 80.0);
  float sp2 = pow(sqrt(max(0.0, 1.0 - t2 * t2)), 14.0);
  float lit = smoothstep(-0.05, 0.45, dot(normal, Lk));
  float k = (gl_FrontFacing ? 1.0 : 0.0) * lit * mix(0.35, 1.0, hairLight) * (vHair.w > 5.5 && vHair.w < 6.5 ? 0.3 : 1.0);
  vec3 base = diffuseColor.rgb;
  totalEmissiveRadiance += (mix(base, vec3(1.0), 0.4) * sp1 * 0.3 + base * sp2 * 0.16) * k;
}
`;

/** Creates a per-character hair material (hair and facial hair share it). */
export function createHairMaterial(): { material: THREE.MeshStandardMaterial; uniforms: HairUniforms } {
  // alphaTest (not blending): strand tips and the scalp edge are cut per pixel, so one opaque draw needs no sorting
  const material = new THREE.MeshStandardMaterial({ color: '#3d2a1f', roughness: 0.62, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.5 });
  const uniforms: HairUniforms = {
    uHighlight: { value: new THREE.Vector4(0, 0, 0, 0) },
    uStrand: { value: 0 },
    uSelect: { value: 0 },
  };
  patch(material, 'hs-hair-v2', uniforms as unknown as Uniforms,
    [['#include <common>', `#include <common>\n${HAIR_VERT_HEAD}`], ['#include <defaultnormal_vertex>', HAIR_VERT_FLOW]],
    [['#include <common>', `#include <common>\n${HAIR_FRAG_HEAD}`], ['#include <color_fragment>', HAIR_FRAG_PAINT],
      ['#include <emissivemap_fragment>', HAIR_FRAG_SHEEN]]);
  return { material, uniforms };
}

// AI hairstyles (aiHair.ts): the generated strand detail lives in a greyscale tint map, the creator's hair colour multiplies it,
// and the root-shade vertex colour darkens the hair near the scalp. Highlights lift the brightest strand clumps to the highlight colour.
const AI_HAIR_FRAG_PAINT = /* glsl */ `
#include <color_fragment>
{
  float tl = 1.0;
  #ifdef USE_MAP
    tl = texture2D(map, vMapUv).g;
  #endif
  vec3 col = diffuseColor.rgb;
  if (uHighlight.w > 0.5) {
    float clump = hhNoise(vMapUv * 26.0 + 3.7);
    float streak = smoothstep(0.5, 0.72, clump) * smoothstep(0.62, 0.9, tl);
    col = mix(col, uHighlight.rgb * mix(0.8, 1.1, tl), clamp(streak * 0.9 + smoothstep(0.55, 0.8, clump) * 0.25, 0.0, 0.85));
  }
  if (!gl_FrontFacing) col *= 0.8;
  col = mix(col, col * 1.08 + vec3(0.03, 0.025, 0.0), uSelect);
  diffuseColor.rgb = col;
}
`;

const AI_HAIR_FRAG_HEAD = /* glsl */ `
uniform vec4 uHighlight;
uniform float uSelect;
float hhHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hhNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hhHash(i), hhHash(i + vec2(1.0, 0.0)), u.x), mix(hhHash(i + vec2(0.0, 1.0)), hhHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

/** Per-character material of an AI hairstyle: `map` is the style's tint map (shared), `color` the hair colour. */
export function createAiHairMaterial(map: THREE.Texture): { material: THREE.MeshStandardMaterial; uniforms: HairUniforms } {
  const material = new THREE.MeshStandardMaterial({ color: '#3d2a1f', map, vertexColors: true, roughness: 0.58, metalness: 0, side: THREE.DoubleSide });
  const uniforms: HairUniforms = {
    uHighlight: { value: new THREE.Vector4(0, 0, 0, 0) },
    uStrand: { value: 0 },
    uSelect: { value: 0 },
  };
  patch(material, 'hs-aihair-v1', uniforms as unknown as Uniforms, [],
    [['#include <common>', `#include <common>\n${AI_HAIR_FRAG_HEAD}`], ['#include <color_fragment>', AI_HAIR_FRAG_PAINT]]);
  return { material, uniforms };
}
