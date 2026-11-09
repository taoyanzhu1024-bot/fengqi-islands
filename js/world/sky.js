// ============================================================
// 天空：渐变穹顶（太阳光晕 + 笔触卷云）、无尽云海、体积感云朵广告牌
// ============================================================
import * as THREE from 'three';
import { G, cloudAtlas } from '../core/materials.js';
import { PALETTE as P, WORLD } from '../config.js';
import { mulberry32 } from '../core/noise.js';

const NOISE_GLSL = /* glsl */ `
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }`;

export function createSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTime: G.time, uSun: G.sunDir,
      uZenith: { value: new THREE.Color(P.skyZenith) }, uMid: { value: new THREE.Color(P.skyMid) },
      uHorizon: { value: new THREE.Color(P.horizon) }, uWarm: { value: new THREE.Color(P.horizonWarm) },
      uBelow: { value: new THREE.Color(P.below) }, uSunCol: { value: new THREE.Color(P.sun) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uSun, uZenith, uMid, uHorizon, uWarm, uBelow, uSunCol; varying vec3 vDir;
      ${NOISE_GLSL}
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
        col = mix(col, uZenith, smoothstep(0.18, 0.75, h));
        col = mix(col, uBelow, smoothstep(0.0, -0.2, h));
        float sd = max(dot(d, uSun), 0.0);
        col = mix(col, uWarm, exp(-abs(h)*7.0) * (0.35 + 0.45*pow(sd, 4.0)));
        col += uSunCol * (pow(sd, 900.0)*2.5 + pow(sd, 24.0)*0.22 + pow(sd, 4.0)*0.10);
        // 笔触卷云
        vec2 p = d.xz / (h + 0.22);
        float n = fbm(p*0.9 + vec2(uTime*0.003, uTime*0.001));
        float n2 = fbm(p*vec2(3.0, 0.8) + 4.0);
        float streak = smoothstep(0.52, 0.8, n*0.7 + n2*0.4) * smoothstep(0.03, 0.2, h) * (1.0 - smoothstep(0.45, 0.85, h));
        col = mix(col, mix(vec3(1.0,0.97,0.93), uWarm, pow(sd,3.0)*0.5), streak*0.5);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  sky.name = 'sky';
  return sky;
}

export function createCloudSea() {
  const mat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: {
      uTime: G.time, uSun: G.sunDir, uFogColor: G.fogColor,
      uLight: { value: new THREE.Color(0xfbf6ee) }, uShadow: { value: new THREE.Color(0xb3b5d3) },
      uWarm: { value: new THREE.Color(P.horizonWarm) },
    },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uSun, uFogColor, uLight, uShadow, uWarm; varying vec3 vW;
      ${NOISE_GLSL}
      float hgt(vec2 p){ return fbm(p)*0.7 + fbm(p*3.1+7.0)*0.3; }
      void main(){
        vec2 p = vW.xz*0.0018 + vec2(uTime*0.006, uTime*0.0025);
        float h = hgt(p);
        float hs = hgt(p + normalize(uSun.xz)*0.03);
        float lit = clamp(0.55 + (hs - h)*7.0, 0.0, 1.0);
        vec3 col = mix(uShadow, uLight, smoothstep(0.25, 0.85, h*0.55 + lit*0.6));
        float dist = length(vW.xz - cameraPosition.xz);
        vec3 V = normalize(vW - cameraPosition);
        float sd = pow(max(dot(normalize(vec3(V.x,0.0,V.z)), normalize(vec3(uSun.x,0.0,uSun.z))),0.0), 6.0);
        col = mix(col, uWarm, sd*0.25);
        col = mix(col, uFogColor, smoothstep(600.0, 9000.0, dist)*0.92);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const g = new THREE.PlaneGeometry(26000, 26000, 1, 1);
  g.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(g, mat);
  sea.position.y = WORLD.cloudSeaY;
  sea.name = 'cloudSea';
  return sea;
}

// ---------------- 云朵广告牌（单 draw call，按距离排序） ----------------
export class CloudField {
  constructor() { this.items = []; }
  add(x, y, z, scale, opacity = 1, aspect = 0.62, variant = -1) {
    this.items.push({ x, y, z, w: scale, h: scale * aspect, o: opacity, v: variant < 0 ? Math.floor(Math.random() * 4) : variant, ph: Math.random() * 6.28 });
  }
  build() {
    const n = this.items.length;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    this.aOffset = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.aScale = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    [this.aOffset, this.aScale, this.aMisc].forEach((a) => a.setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aOffset', this.aOffset);
    g.setAttribute('aScale', this.aScale);
    g.setAttribute('aMisc', this.aMisc);
    g.instanceCount = n;
    this.write();
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uTime: G.time, uTex: { value: cloudAtlas() }, uFogColor: G.fogColor, uFogNear: G.fogNear, uFogFar: G.fogFar,
        uTint: { value: new THREE.Color(1.0, 0.98, 0.95) } },
      vertexShader: `uniform float uTime; uniform float uFogNear, uFogFar;
        attribute vec3 aOffset; attribute vec2 aScale; attribute vec3 aMisc;
        varying vec2 vUv; varying float vAlpha; varying float vFog;
        void main(){
          vec3 off = aOffset;
          off.x += sin(uTime*0.025 + aMisc.z)*aScale.x*0.12;
          off.z += cos(uTime*0.02 + aMisc.z*1.3)*aScale.x*0.08;
          vec4 mv = viewMatrix * vec4(off, 1.0);
          mv.xy += position.xy * aScale;
          gl_Position = projectionMatrix * mv;
          float v = aMisc.y; vec2 tile = vec2(mod(v, 2.0), floor(v / 2.0));
          vUv = vec2((uv.x + tile.x) * 0.5, (uv.y + 1.0 - tile.y) * 0.5);
          float dist = -mv.z;
          vFog = smoothstep(uFogNear, uFogFar*1.4, dist);
          vAlpha = aMisc.x * smoothstep(aScale.x*0.1, aScale.x*0.55, dist);
        }`,
      fragmentShader: `uniform sampler2D uTex; uniform vec3 uFogColor, uTint; varying vec2 vUv; varying float vAlpha; varying float vFog;
        void main(){ vec4 t = texture2D(uTex, vUv); float a = t.a * vAlpha; if (a < 0.01) discard;
          vec3 c = mix(t.rgb * uTint, uFogColor, vFog*0.8); gl_FragColor = vec4(c, a); }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'clouds';
    this._t = 0;
    return this.mesh;
  }
  write() {
    const o = this.aOffset.array, s = this.aScale.array, m = this.aMisc.array;
    this.items.forEach((c, i) => {
      o[i * 3] = c.x; o[i * 3 + 1] = c.y; o[i * 3 + 2] = c.z;
      s[i * 2] = c.w; s[i * 2 + 1] = c.h;
      m[i * 3] = c.o; m[i * 3 + 1] = c.v; m[i * 3 + 2] = c.ph;
    });
    this.aOffset.needsUpdate = this.aScale.needsUpdate = this.aMisc.needsUpdate = true;
  }
  /** 每隔一段时间按到相机距离由远到近排序，保证透明混合正确 */
  update(dt, cam) {
    this._t -= dt;
    if (this._t > 0) return;
    this._t = 0.4;
    const p = cam.position;
    for (const c of this.items) c.d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2 + (c.z - p.z) ** 2;
    this.items.sort((a, b) => b.d - a.d);
    this.write();
  }
}

/** 撒布云层：云海表面的大团积云 + 空中零散云朵 */
export function scatterClouds(field, avoid = []) {
  const r = mulberry32(5150);
  const Y = WORLD.cloudSeaY;
  // 云海表面隆起
  for (let i = 0; i < 260; i++) {
    const a = r() * Math.PI * 2, d = 200 + Math.pow(r(), 0.7) * 6500;
    field.add(150 + Math.cos(a) * d, Y + 20 + r() * 60, 200 + Math.sin(a) * d, 260 + r() * 420, 0.95, 0.5 + r() * 0.2);
  }
  // 中空云朵（层次与尺度感）
  for (let i = 0; i < 150; i++) {
    const a = r() * Math.PI * 2, d = 250 + Math.pow(r(), 0.8) * 4800;
    const x = 150 + Math.cos(a) * d, z = 200 + Math.sin(a) * d;
    const y = -160 + r() * 520;
    if (avoid.some((c) => Math.hypot(c.x - x, c.z - z) < c.r && Math.abs(c.y - y) < 120)) continue;
    field.add(x, y, z, 60 + r() * 170, 0.75 + r() * 0.25, 0.55 + r() * 0.2);
  }
}
