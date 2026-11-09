// ============================================================
// 水彩材质系统
// 在 MeshLambertMaterial 基础上注入：
//  - 世界坐标颜料颗粒（granulation）
//  - 淡紫灰蓝的阴影色偏 + 暖色高光
//  - 可选：风吹摇摆（树冠 / 花）
//  - 可选：远景空气透视（haze）
// ============================================================
import * as THREE from 'three';
import { PALETTE, WORLD } from '../config.js';
import { mulberry32 } from './noise.js';

// 所有自定义 shader 共享的全局 uniform
export const G = {
  time: { value: 0 },
  fogColor: { value: new THREE.Color(PALETTE.fog) },
  fogNear: { value: WORLD.fogNear },
  fogFar: { value: WORLD.fogFar },
  hazeColor: { value: new THREE.Color(PALETTE.haze) },
  sunDir: { value: new THREE.Vector3(...WORLD.sunDir).normalize() },
  playerPos: { value: new THREE.Vector3() },
  lightTint: { value: new THREE.Color(1, 1, 1) }, // 非光照材质（草、瀑布、粒子）的昼夜色调
};

// 云轨“逐段升起”共享参数（由 Railway.update 每帧写入）
export const RAIL = {
  uRailS: { value: 0 }, uRailL: { value: 1 }, uRailMode: { value: 1 }, uTail: { value: 50 },
  uNear: { value: 55 }, uFar: { value: 190 }, uSeg: { value: 6 }, uSt: { value: new Array(8).fill(-1e6) },
};
const RAIL_GLSL = /* glsl */ `
uniform float uRailS, uRailL, uRailMode, uTail, uNear, uFar, uSeg; uniform float uSt[8];
attribute float aS;
varying float vGlow; varying float vRev;
float railReveal(float s, float shift, out float glow){
  float L = uRailL;
  float ahead = mod(s - uRailS + L*4.0, L);
  float behind = L - ahead;
  float stn = 0.0;
  for (int i = 0; i < 8; i++) { float d = abs(mod(s - uSt[i] + L*1.5, L) - L*0.5); stn = max(stn, 1.0 - smoothstep(120.0, 160.0, d)); }
  float form = 1.0 - smoothstep(uNear, uFar, ahead + shift);
  float keep = 1.0 - smoothstep(uTail + 140.0, uTail + 260.0, behind);
  float r = clamp(max(max(form, keep), stn), 0.0, 1.0);
  // 尾迹金光 + 成形过程中的光芒
  glow = (1.0 - smoothstep(uTail * 0.5, uTail + 200.0, behind)) * (1.0 - stn) * 0.45 * step(behind, L * 0.5);
  glow += (1.0 - abs(r * 2.0 - 1.0)) * 0.9 * (1.0 - stn);
  if (uRailMode < 0.5) { r = 1.0; glow = 0.0; }
  return r;
}`;

const GLSL_NOISE = /* glsl */ `
float wcHash(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float wcNoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(wcHash(i), wcHash(i+vec3(1,0,0)), f.x), mix(wcHash(i+vec3(0,1,0)), wcHash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(wcHash(i+vec3(0,0,1)), wcHash(i+vec3(1,0,1)), f.x), mix(wcHash(i+vec3(0,1,1)), wcHash(i+vec3(1,1,1)), f.x), f.y), f.z);
}`;

const cache = new Map();

/**
 * 水彩材质工厂
 * @param {object} o { color, vertexColors, flat, sway, haze, grain, emissive, emissiveIntensity, side, transparent, opacity, fog }
 */
export function wc(o = {}) {
  const key = JSON.stringify(o);
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshLambertMaterial({
    color: o.color ?? 0xffffff,
    vertexColors: !!o.vertexColors,
    flatShading: !!o.flat,
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    side: o.side ?? THREE.FrontSide,
    transparent: !!o.transparent,
    opacity: o.opacity ?? 1,
    fog: o.fog ?? true,
  });
  const sway = o.sway ?? 0, haze = o.haze ?? 0, grain = o.grain ?? 1;
  const rail = o.rail !== undefined, shift = (o.rail ?? 0).toFixed(1), inst = !!o.inst;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = G.time;
    sh.uniforms.uHazeColor = G.hazeColor;
    if (rail) Object.assign(sh.uniforms, RAIL);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; varying vec3 vWPos;
        ${rail ? RAIL_GLSL + (inst ? '' : '\nattribute vec3 aC;') : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${rail ? `{
          float glow;
          float segS = floor(aS / uSeg) * uSeg + 0.5 * uSeg;   // 以一段（约 6 米）为单位整体升起
          float r = railReveal(segS, ${shift}, glow);
          float drop = (1.0 - r) * (1.0 - r) * 42.0;
          ${inst ? `transformed *= max(r, 0.0001); transformed.y -= drop;`
                 : `transformed = aC + (transformed - aC) * max(r, 0.0001) - vec3(0.0, drop, 0.0);`}
          vGlow = glow; vRev = r;
        }` : ''}
        ${sway > 0 ? `{
          vec4 wp0 = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp0 = instanceMatrix * wp0;
          #endif
          wp0 = modelMatrix * wp0;
          float ph = wp0.x*0.07 + wp0.z*0.05;
          float k = ${sway.toFixed(4)} * (0.65 + 0.35*sin(wp0.y*0.8 + uTime*2.1));
          transformed.x += sin(uTime*1.25 + ph) * k;
          transformed.z += cos(uTime*1.05 + ph*1.3) * k * 0.7;
        }` : ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
          #endif
          vWPos = (modelMatrix * wp).xyz; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <clipping_planes_fragment>', rail ? 'if (vRev < 0.04) discard;\n#include <clipping_planes_fragment>' : '#include <clipping_planes_fragment>')
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform vec3 uHazeColor; varying vec3 vWPos;
        ${rail ? 'varying float vGlow; varying float vRev;' : ''}
        ${GLSL_NOISE}`)
      .replace('#include <fog_fragment>', `{
          vec3 col = gl_FragColor.rgb;
          float lum = dot(col, vec3(0.299,0.587,0.114));
          float base = max(dot(diffuseColor.rgb, vec3(0.299,0.587,0.114)), 0.002);
          float lit = clamp(lum / base, 0.0, 2.0);
          // 颜料颗粒：大尺度色块 + 小尺度颗粒
          float n1 = wcNoise(vWPos*0.23); float n2 = wcNoise(vWPos*1.9);
          col *= 1.0 + ((n1-0.5)*0.22 + (n2-0.5)*0.10) * ${grain.toFixed(2)};
          // 阴影偏淡紫灰蓝
          float sh = 1.0 - smoothstep(0.35, 0.95, lit);
          col = mix(col, col*vec3(0.78,0.80,1.12) + vec3(0.012,0.012,0.035), sh*0.75);
          // 受光面偏暖
          col *= mix(vec3(1.0), vec3(1.05,1.0,0.92), smoothstep(0.9, 1.5, lit));
          ${haze > 0 ? `col = mix(col, uHazeColor, ${haze.toFixed(3)});` : ''}
          ${rail ? 'col += vec3(0.62, 0.46, 0.16) * vGlow;' : ''}
          gl_FragColor.rgb = col;
        }
        #include <fog_fragment>`);
  };
  m.customProgramCacheKey = () => `wc|${sway}|${haze}|${grain}|${rail ? shift : 'x'}|${inst}`;
  cache.set(key, m);
  return m;
}

// 批处理用的材质组（顶点色）
let _mats = null;
export function MATS() {
  if (_mats) return _mats;
  _mats = {
    solid: wc({ vertexColors: true }),
    flat: wc({ vertexColors: true, flat: true }),
    sway: wc({ vertexColors: true, sway: 0.22 }),
    swaySoft: wc({ vertexColors: true, sway: 0.06 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    ice: wc({ vertexColors: true, flat: true, emissive: 0x5a78a8, emissiveIntensity: 0.45 }),
    hazeSolid: wc({ vertexColors: true, flat: true, haze: 0.42, fog: false }),
    hazeGlow: new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }),
  };
  return _mats;
}

// ------------------------------------------------------------
// 程序化云朵贴图集（2x2，四种积云造型）
// ------------------------------------------------------------
let _cloudTex = null;
export function cloudAtlas() {
  if (_cloudTex) return _cloudTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S * 2;
  const g = c.getContext('2d');
  const r = mulberry32(77);
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * S, oy = Math.floor(v / 2) * S;
    g.save();
    g.beginPath(); g.rect(ox, oy, S, S); g.clip();
    g.globalCompositeOperation = 'source-over';
    const blobs = 12 + Math.floor(r() * 6);
    for (let i = 0; i < blobs; i++) {
      const t = i / blobs;
      const bx = ox + S * (0.2 + 0.6 * t + (r() - 0.5) * 0.15);
      const by = oy + S * (0.62 - Math.sin(t * Math.PI) * (0.18 + r() * 0.12) + (r() - 0.5) * 0.06);
      const br = S * (0.12 + r() * 0.12) * (0.7 + Math.sin(t * Math.PI) * 0.5);
      const grd = g.createRadialGradient(bx, by, 0, bx, by, br);
      grd.addColorStop(0, 'rgba(255,255,255,0.95)');
      grd.addColorStop(0.55, 'rgba(255,255,255,0.75)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fill();
    }
    // 在已有形状上着色：顶部奶油白，底部淡紫
    g.globalCompositeOperation = 'source-atop';
    const lg = g.createLinearGradient(0, oy + S * 0.25, 0, oy + S * 0.8);
    lg.addColorStop(0, '#fffaf0');
    lg.addColorStop(0.55, '#f1ecf0');
    lg.addColorStop(1, '#b9b6d4');
    g.fillStyle = lg; g.fillRect(ox, oy, S, S);
    // 左上方暖色高光
    const hl = g.createRadialGradient(ox + S * 0.35, oy + S * 0.3, 0, ox + S * 0.35, oy + S * 0.3, S * 0.45);
    hl.addColorStop(0, 'rgba(255,240,215,0.6)');
    hl.addColorStop(1, 'rgba(255,240,215,0)');
    g.fillStyle = hl; g.fillRect(ox, oy, S, S);
    g.restore();
  }
  _cloudTex = new THREE.CanvasTexture(c);
  _cloudTex.colorSpace = THREE.SRGBColorSpace;
  return _cloudTex;
}

// 文字牌贴图（站牌等）
export function textTexture(text, sub = '', w = 512, h = 160) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#f5ecd9'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#6f8f74'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16);
  g.strokeStyle = '#d9b45a'; g.lineWidth = 3; g.strokeRect(20, 20, w - 40, h - 40);
  g.fillStyle = '#4f5a4e';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${Math.round(h * 0.36)}px "Noto Serif SC","Songti SC","STSong","SimSun",serif`;
  g.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
  if (sub) {
    g.font = `${Math.round(h * 0.15)}px Georgia, serif`;
    g.fillStyle = '#8a7a62';
    g.fillText(sub, w / 2, h * 0.74);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
