// ============================================================
// 粒子：环境飘落物（花瓣/落叶/雪/蒲公英）、局部群（萤火、金叶、上升气流）、
//       列车蒸汽烟团、瀑布
// ============================================================
import * as THREE from 'three';
import { G, cloudAtlas } from '../core/materials.js';
import { mulberry32 } from '../core/noise.js';

const DPR = () => Math.min(devicePixelRatio, 1.5);

/**
 * 局部粒子群：粒子在以 center 为中心、尺寸 box 的盒子内循环流动
 * opts: { count, center(Vector3, 可动态修改), box(Vector3), vel(Vector3), jitter, size, colorA, colorB, shape(0 花瓣 1 圆点 2 发光), additive, opacity }
 */
export class Swarm {
  constructor(o) {
    const n = o.count, r = mulberry32(o.seed ?? 7);
    const pos = new Float32Array(n * 3), rnd = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      pos.set([r() * 1000, r() * 1000, r() * 1000], i * 3);
      rnd.set([r(), r(), r(), r()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
    this.uniforms = {
      uTime: G.time,
      uCenter: { value: o.center ?? new THREE.Vector3() },
      uBox: { value: o.box ?? new THREE.Vector3(60, 30, 60) },
      uVel: { value: o.vel ?? new THREE.Vector3(1, -0.5, 0.4) },
      uJitter: { value: o.jitter ?? 1.2 },
      uSize: { value: (o.size ?? 0.25) * DPR() },
      uColorA: { value: new THREE.Color(o.colorA ?? 0xf3b9c6) },
      uColorB: { value: new THREE.Color(o.colorB ?? 0xfff3e0) },
      uShape: { value: o.shape ?? 0 },
      uOpacity: { value: o.opacity ?? 1 },
      uSwirl: { value: o.swirl ?? 0 },
      uFogColor: G.fogColor, uFogNear: G.fogNear, uFogFar: G.fogFar, uLightTint: G.lightTint, uTintK: { value: o.additive ? 0 : 1 },
      uPx: { value: innerHeight },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `uniform float uTime, uJitter, uSize, uPx, uSwirl; uniform vec3 uCenter, uBox, uVel; uniform float uFogNear, uFogFar;
        attribute vec4 aRand; varying vec4 vR; varying float vFade; varying float vFog; varying float vRot;
        void main(){
          vec3 p = position + uVel*uTime*(0.7 + aRand.y*0.6);
          p += vec3(sin(uTime*0.8 + aRand.x*6.28), sin(uTime*0.6 + aRand.w*6.28)*0.5, cos(uTime*0.7 + aRand.z*6.28)) * uJitter;
          vec3 l = mod(p - uCenter + uBox*0.5, uBox) - uBox*0.5;
          if (uSwirl > 0.0) { float a = uTime*uSwirl*(0.6+aRand.x) + aRand.z*6.28; float rr = length(l.xz); l.xz = vec2(cos(a), sin(a)) * rr; }
          vec3 wp = l + uCenter;
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * (0.6 + aRand.w*0.8) * uPx / max(-mv.z, 0.1);
          vec3 q = abs(l) / (uBox*0.5);
          vFade = 1.0 - smoothstep(0.7, 1.0, max(max(q.x, q.y), q.z));
          vFog = smoothstep(uFogNear, uFogFar, -mv.z);
          vR = aRand; vRot = uTime*(aRand.y - 0.5)*3.0 + aRand.z*6.28;
        }`,
      fragmentShader: `uniform vec3 uColorA, uColorB, uFogColor, uLightTint; uniform float uShape, uOpacity, uTime, uTintK;
        varying vec4 vR; varying float vFade; varying float vFog; varying float vRot;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float a;
          if (uShape < 0.5) { // 花瓣/叶片：旋转椭圆
            float cs = cos(vRot), sn = sin(vRot);
            c = vec2(c.x*cs - c.y*sn, c.x*sn + c.y*cs);
            a = smoothstep(0.5, 0.32, length(c*vec2(1.0, 2.1)));
          } else if (uShape < 1.5) { a = smoothstep(0.5, 0.2, length(c)); }
          else { a = pow(smoothstep(0.5, 0.0, length(c)), 1.6) * (0.55 + 0.45*sin(uTime*2.0 + vR.x*30.0)); }
          vec3 col = mix(uColorA, uColorB, vR.x);
          col *= mix(vec3(1.0), uLightTint, uTintK);
          col = mix(col, uFogColor, vFog);
          float al = a * vFade * uOpacity;
          if (al < 0.01) discard;
          gl_FragColor = vec4(col, al);
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
  }
  resize() { this.uniforms.uPx.value = innerHeight; }
}

// ---------------- 列车蒸汽 ----------------
export class Puffs {
  constructor(max = 70) {
    this.max = max; this.list = []; this.cursor = 0;
    for (let i = 0; i < max; i++) this.list.push({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 1 });
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSA = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPos', this.aPos); g.setAttribute('aSA', this.aSA);
    g.instanceCount = max;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTex: { value: cloudAtlas() } },
      vertexShader: `attribute vec3 aPos; attribute vec2 aSA; varying vec2 vUv; varying float vA;
        void main(){ vec4 mv = viewMatrix * vec4(aPos,1.0); mv.xy += position.xy * aSA.x; gl_Position = projectionMatrix * mv;
          vUv = vec2(uv.x*0.5, uv.y*0.5 + 0.5); vA = aSA.y; }`,
      fragmentShader: `uniform sampler2D uTex; varying vec2 vUv; varying float vA;
        void main(){ vec4 t = texture2D(uTex, vUv); float a = t.a * vA; if (a < 0.01) discard; gl_FragColor = vec4(mix(t.rgb, vec3(1.0), 0.3), a); }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
  }
  emit(pos, vel, size = 1.4, life = 3.2) {
    const p = this.list[this.cursor]; this.cursor = (this.cursor + 1) % this.max;
    p.p.copy(pos); p.v.copy(vel); p.life = life; p.max = life; p.s = size;
  }
  update(dt) {
    const a = this.aPos.array, s = this.aSA.array;
    this.list.forEach((p, i) => {
      if (p.life > 0) {
        p.life -= dt;
        p.v.multiplyScalar(1 - dt * 0.8); p.v.y += dt * 0.6;
        p.p.addScaledVector(p.v, dt);
      }
      const t = 1 - Math.max(p.life, 0) / p.max;
      a[i * 3] = p.p.x; a[i * 3 + 1] = p.p.y; a[i * 3 + 2] = p.p.z;
      s[i * 2] = p.s * (1 + t * 3.5);
      s[i * 2 + 1] = p.life > 0 ? Math.sin(Math.min(t * 6, 1) * Math.PI / 2) * (1 - t) * 0.8 : 0;
    });
    this.aPos.needsUpdate = this.aSA.needsUpdate = true;
  }
}

// ---------------- 瀑布 ----------------
let _wfMat = null;
function waterfallMat() {
  if (_wfMat) return _wfMat;
  _wfMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: G.time, uFogColor: G.fogColor, uFogNear: G.fogNear, uFogFar: G.fogFar, uLightTint: G.lightTint,
      uDeep: { value: new THREE.Color(0x9cc6dc) }, uFoam: { value: new THREE.Color(0xfbfdff) } },
    vertexShader: `uniform float uFogNear, uFogFar; varying vec2 vUv; varying float vFog;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix*mv; vFog = smoothstep(uFogNear, uFogFar, -mv.z); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uDeep, uFoam, uFogColor, uLightTint; varying vec2 vUv; varying float vFog;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*43758.5); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 p = vec2(vUv.x*9.0, vUv.y*14.0 + uTime*2.4);
        float s = n(p)*0.6 + n(p*2.3 + 3.0)*0.4;
        vec3 col = mix(uDeep, uFoam, smoothstep(0.35, 0.8, s));
        float edge = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
        float a = edge * smoothstep(0.0, 0.55, vUv.y) * (0.55 + 0.45*s);
        col = mix(col * uLightTint, uFogColor, vFog);
        gl_FragColor = vec4(col, a * 0.9);
      }`,
  });
  return _wfMat;
}

/** 在岛缘 θ 处生成瀑布；返回底部世界坐标（用于放置水雾云） */
export function waterfall(isl, th, o = {}) {
  const w = o.width ?? 4, L = o.len ?? 80;
  const g = new THREE.PlaneGeometry(w, L, 1, 24);
  g.translate(0, -L / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = -p.getY(i) / L;
    p.setZ(i, 0.8 + t * t * L * 0.16);
    p.setX(i, p.getX(i) * (1 + t * 1.2));
  }
  const rr = isl.rim(th) - 0.6;
  const x = Math.cos(th) * rr, z = Math.sin(th) * rr;
  const y = (isl.localHeight(Math.cos(th) * (rr - 1), Math.sin(th) * (rr - 1)) ?? 0) + 0.05;
  const m = new THREE.Mesh(g, waterfallMat());
  m.position.set(x, y, z);
  m.rotation.y = Math.atan2(Math.cos(th), Math.sin(th));
  m.renderOrder = 4;
  isl.group.add(m);
  const out = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
  return isl.center.clone().add(new THREE.Vector3(x, y - L * 0.95, z)).addScaledVector(out, L * 0.16 + 2);
}
