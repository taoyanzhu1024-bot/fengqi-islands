// ============================================================
// 实例化植被：随风摆动的草叶（自定义 shader）与点点野花
// ============================================================
import * as THREE from 'three';
import { G, wc } from '../core/materials.js';

const GRASS_VS = /* glsl */ `
uniform float uTime; uniform vec3 uPlayer; uniform vec3 uBase, uTip, uTip2;
uniform float uFogNear, uFogFar;
attribute vec3 aOffset; attribute vec4 aParams; // 高度, 朝向, 颜色混合, 阴影
varying vec3 vColor; varying float vFog;
void main(){
  float h = aParams.x, ang = aParams.y;
  vec3 p = position; float t = p.y;
  p.y *= h; p.x *= 0.7 + h*0.5;
  float c = cos(ang), s = sin(ang);
  p = vec3(p.x*c - p.z*s, p.y, p.x*s + p.z*c);
  vec3 wp = aOffset + p;
  // 风：大尺度阵风 + 小尺度颤动
  float gust = sin(uTime*0.9 + aOffset.x*0.035 + aOffset.z*0.02)*0.5 + 0.5;
  float wind = gust*0.7 + sin(uTime*2.6 + aOffset.x*0.4 + aOffset.z*0.3)*0.18 + 0.15;
  wp.xz += vec2(0.85, 0.5) * wind * t*t * h * 0.55;
  // 角色经过时草叶向外倒伏
  vec3 d = wp - uPlayer; float dl = length(d.xz);
  float push = (1.0 - smoothstep(0.2, 1.4, dl)) * step(abs(d.y), 2.0);
  wp.xz += normalize(d.xz + 1e-4) * push * t * 0.55; wp.y -= push * t * h * 0.35;
  vec3 col = mix(uBase, mix(uTip, uTip2, aParams.z), smoothstep(0.0, 1.0, t));
  col *= mix(1.0, 0.68, aParams.w);
  col = mix(col, col*vec3(0.85,0.87,1.08), aParams.w*0.6);
  col *= 0.9 + gust*t*0.18; // 阵风掠过的亮带
  vColor = col;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  vFog = smoothstep(uFogNear, uFogFar, -mv.z);
}`;
const GRASS_FS = /* glsl */ `
uniform vec3 uFogColor, uLightTint;
varying vec3 vColor; varying float vFog;
void main(){ gl_FragColor = vec4(mix(vColor * uLightTint, uFogColor, vFog), 1.0); }`;

function bladeGeometry() {
  const g = new THREE.InstancedBufferGeometry();
  const w = 0.065;
  g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, -w * 0.6, 0.5, 0, w * 0.6, 0.5, 0, 0, 1, 0], 3));
  g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  return g;
}

/**
 * 在岛上生成草地
 * @param {Island} isl
 * @param {object} o { count, base, tip, tip2, h:[min,max], mask(x,z)->0..1 }
 */
export function grassField(isl, o) {
  const r = isl.rand, N = o.count;
  const off = new Float32Array(N * 3), par = new Float32Array(N * 4);
  const c = isl.center;
  let k = 0;
  for (let tries = 0; tries < N * 3 && k < N; tries++) {
    const [x, z] = isl.randomPoint(0.985, r);
    if (!isl.isFree(x, z, 0, 1.5)) continue;
    const m = o.mask ? o.mask(x, z) : 1;
    if (m < r()) continue;
    const y = isl.localHeight(x, z);
    if (y === null) continue;
    off.set([x + c.x, y + c.y - 0.05, z + c.z], k * 3);
    par.set([(o.h[0] + r() * (o.h[1] - o.h[0])) * (0.6 + 0.4 * m), r() * Math.PI, r(), isl.shadeAt(x, z)], k * 4);
    k++;
  }
  const g = bladeGeometry();
  g.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off.subarray(0, k * 3), 3));
  g.setAttribute('aParams', new THREE.InstancedBufferAttribute(par.subarray(0, k * 4), 4));
  g.instanceCount = k;
  g.boundingSphere = new THREE.Sphere(c.clone(), isl.maxRim + 10);
  const mat = new THREE.ShaderMaterial({
    vertexShader: GRASS_VS, fragmentShader: GRASS_FS, side: THREE.DoubleSide,
    uniforms: {
      uTime: G.time, uPlayer: G.playerPos, uFogColor: G.fogColor, uLightTint: G.lightTint, uFogNear: G.fogNear, uFogFar: G.fogFar,
      uBase: { value: new THREE.Color(o.base) }, uTip: { value: new THREE.Color(o.tip) }, uTip2: { value: new THREE.Color(o.tip2 ?? o.tip) },
    },
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'grass:' + isl.id;
  mesh.userData.lod = { c: c.clone(), d: 420 + isl.R * 2 };
  return mesh;
}

/** 点状野花（实例化，随风轻摆） */
export function flowerField(isl, o) {
  const r = isl.rand, N = o.count;
  const geo = new THREE.IcosahedronGeometry(o.size ?? 0.11, 0);
  geo.scale(1, 0.55, 1);
  geo.translate(0, o.lift ?? 0.42, 0);
  const mesh = new THREE.InstancedMesh(geo, wc({ sway: 0.05, grain: 0.5 }), N);
  const m = new THREE.Matrix4(), col = new THREE.Color();
  let k = 0;
  for (let tries = 0; tries < N * 4 && k < N; tries++) {
    const [x, z] = isl.randomPoint(0.96, r);
    if (!isl.isFree(x, z, 0.5, 1.8)) continue;
    const pick = o.pick ? o.pick(x, z, r) : o.colors[Math.floor(r() * o.colors.length)];
    if (pick === null) continue;
    const y = isl.localHeight(x, z);
    if (y === null) continue;
    const s = 0.7 + r() * 0.7;
    m.makeScale(s, s * (0.8 + r() * 0.6), s).setPosition(x + isl.center.x, y + isl.center.y, z + isl.center.z);
    mesh.setMatrixAt(k, m);
    mesh.setColorAt(k, col.set(pick).multiplyScalar(0.92 + r() * 0.16));
    k++;
  }
  mesh.count = k;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = 'flowers:' + isl.id;
  mesh.userData.lod = { c: isl.center.clone(), d: 380 + isl.R * 2 };
  return mesh;
}
