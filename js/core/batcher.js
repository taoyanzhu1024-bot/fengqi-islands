// ============================================================
// 静态几何合批：同一岛屿上所有静态道具合并为少量网格（按材质类别）
// 每个部件写入顶点色，因此一种材质即可表现多种颜色 → 极少 draw call
// ============================================================
import * as THREE from 'three';
import { MATS } from './materials.js';
import { Noise2D } from './noise.js';

const _c = new THREE.Color();
const NI = new WeakMap(); // 共享几何体的非索引版本缓存（加快构建）
const _up = new THREE.Vector3(0, 1, 0);

// 位移/旋转/缩放 → Matrix4
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
}
// 基于基础矩阵的局部变换
export const T = (base, ...a) => base.clone().multiply(M(...a));

// 常用单位几何体
const prism = new THREE.CylinderGeometry(1, 1, 1, 3);
prism.rotateX(-Math.PI / 2); // 屋脊朝上，沿 Z 轴；底宽 1.732，高 1.5（-0.5..1）
export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  cyl12: new THREE.CylinderGeometry(1, 1, 1, 12),
  cyl16: new THREE.CylinderGeometry(1, 1, 1, 16),
  taper8: new THREE.CylinderGeometry(0.62, 1, 1, 8),
  taper6: new THREE.CylinderGeometry(0.5, 1, 1, 6),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  cone6: new THREE.ConeGeometry(1, 1, 6),
  cone8: new THREE.ConeGeometry(1, 1, 8),
  cone12: new THREE.ConeGeometry(1, 1, 12),
  sphere: new THREE.SphereGeometry(1, 14, 10),
  sphereLo: new THREE.SphereGeometry(1, 8, 6),
  dome: new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  ico: new THREE.IcosahedronGeometry(1, 0),
  oct: new THREE.OctahedronGeometry(1, 0),
  torus: new THREE.TorusGeometry(1, 0.08, 6, 20),
  prism,
};

// 带随机起伏的“团块”几何（树冠 / 岩石），法线取球面法线 → 柔和
const blobCache = new Map();
export function blob(seed = 0, detail = 1, jitter = 0.2) {
  const key = `${seed}|${detail}|${jitter}`;
  if (blobCache.has(key)) return blobCache.get(key);
  const g = new THREE.IcosahedronGeometry(1, detail);
  const n = new Noise2D(seed + 5);
  const p = g.attributes.position;
  const nor = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + jitter * n.noise(x * 1.6 + y * 0.7, z * 1.6 - y * 0.9);
    let ny = y * k;
    if (ny < -0.35) ny = -0.35 + (ny + 0.35) * 0.45; // 底部压平
    p.setXYZ(i, x * k, ny, z * k);
    const l = Math.hypot(x, y, z) || 1;
    nor[i * 3] = x / l; nor[i * 3 + 1] = y / l; nor[i * 3 + 2] = z / l;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.deleteAttribute('uv');
  blobCache.set(key, g);
  return g;
}

export class Batcher {
  /** opts.chunk：按 XZ 网格（米）分块合批，便于视锥/阴影裁剪与分块 LOD */
  constructor(opts = {}) { this.lists = {}; this.chunk = opts.chunk ?? 0; }

  /** 添加一个部件：kind=材质类别，color=颜色或 (x,y,z)=>Color 的函数 */
  add(kind, geo, color, matrix) {
    let src = geo;
    if (geo.index) { src = NI.get(geo); if (!src) { src = geo.toNonIndexed(); NI.set(geo, src); } }
    const pos = src.attributes.position.clone();
    const nor = src.attributes.normal ? src.attributes.normal.clone() : null;
    pos.applyMatrix4(matrix);
    if (nor) {
      const nm = new THREE.Matrix3().getNormalMatrix(matrix);
      nor.applyNormalMatrix(nm);
    }
    const n = pos.count;
    const col = new Float32Array(n * 3);
    if (typeof color === 'function') {
      for (let i = 0; i < n; i++) {
        const c = color(pos.getX(i), pos.getY(i), pos.getZ(i));
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
    } else {
      _c.set(color);
      for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    }
    let key = kind;
    if (this.chunk) key += '|' + Math.floor(matrix.elements[12] / this.chunk) + '|' + Math.floor(matrix.elements[14] / this.chunk);
    (this.lists[key] ||= []).push({ pos: pos.array, nor: nor ? nor.array : null, col });
  }

  // 圆柱连接两点（树枝、栏杆、根须）
  segment(kind, color, base, a, b, r0, geo = GEO.taper8) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va); const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(_up, dir.normalize());
    const m = new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(r0, len, r0));
    this.add(kind, geo, color, base.clone().multiply(m));
  }

  /** 合并为网格 */
  build(matOverride = {}) {
    const mats = MATS();
    const meshes = [];
    for (const [key, list] of Object.entries(this.lists)) {
      const [kind, cx, cz] = key.split('|');
      let total = 0;
      for (const l of list) total += l.pos.length;
      const P = new Float32Array(total), N = new Float32Array(total), C = new Float32Array(total);
      let o = 0;
      for (const l of list) {
        P.set(l.pos, o); C.set(l.col, o);
        if (l.nor) N.set(l.nor, o);
        o += l.pos.length;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      g.setAttribute('color', new THREE.BufferAttribute(C, 3));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, matOverride[kind] ?? mats[kind] ?? mats.solid);
      const shadow = kind !== 'glow' && kind !== 'hazeSolid' && kind !== 'hazeGlow';
      mesh.castShadow = shadow;
      mesh.receiveShadow = shadow;
      mesh.name = 'batch:' + kind;
      if (cx !== undefined) mesh.userData.cell = cx + '|' + cz;
      meshes.push(mesh);
    }
    this.lists = {};
    return meshes;
  }
}
