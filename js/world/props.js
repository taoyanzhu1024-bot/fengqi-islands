// ============================================================
// 道具构建器：全部写入 Batcher（合批），动画部件单独返回网格
// 约定：base 为道具在岛屿局部空间的 Matrix4，道具“正面”朝 +Z
// ============================================================
import * as THREE from 'three';
import { Batcher, GEO, M, T, blob } from '../core/batcher.js';
import { mulberry32 } from '../core/noise.js';
import { PALETTE as P } from '../config.js';

const C = (h) => new THREE.Color(h);
const vary = (hex, r, amt = 0.12) => C(hex).multiplyScalar(1 - amt + r() * amt * 2);

// ---------------- 树 ----------------
export function tree(b, base, o = {}) {
  const r = mulberry32(o.seed ?? 1);
  const h = o.h ?? 5, cr = o.r ?? 2.4;
  const leaf = C(o.leaf ?? P.sage), light = C(o.leafLight ?? P.sageLight);
  b.add('solid', GEO.taper8, o.trunk ?? P.wood, T(base, 0, h * 0.45, 0, 0, 0, 0, cr * 0.15, h * 0.9, cr * 0.15));
  const n = o.blobs ?? 4;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = i === 0 ? 0 : cr * 0.55 * (0.6 + r() * 0.5);
    const s = cr * (i === 0 ? 1 : 0.6 + r() * 0.3);
    const y = h + (i === 0 ? cr * 0.3 : (r() - 0.35) * cr * 0.7);
    const c = leaf.clone().lerp(light, Math.min(1, Math.max(0, 0.3 + (y - h) / (cr * 1.5)))).multiplyScalar(0.9 + r() * 0.2);
    b.add('sway', blob(i % 4 + (o.blobSeed ?? 0)), c, T(base, Math.cos(a) * d, y, Math.sin(a) * d, r() * 3, r() * 3, 0, s, s * 0.85, s));
  }
}

// 金叶古树（主岛地标）
export function goldenTree(b, base) {
  const r = mulberry32(42);
  const bark = 0x8a6b58, barkLight = 0xa88670;
  // 板根
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + r() * 0.3;
    b.segment('solid', barkLight, base, [Math.cos(a) * 1.2, 2.5, Math.sin(a) * 1.2], [Math.cos(a) * 5.2, -0.3, Math.sin(a) * 5.2], 0.9 + r() * 0.4, GEO.taper6);
  }
  // 主干（两段，略弯）
  b.segment('solid', bark, base, [0, -0.5, 0], [0.6, 9, 0.3], 2.6, GEO.taper8);
  b.segment('solid', bark, base, [0.6, 8.5, 0.3], [-0.2, 15, 0.6], 1.8, GEO.taper8);
  const golds = [0xe9c463, 0xf1d47e, 0xdcab4b, 0xf4df9a, 0xd59f4f, 0xeec66c];
  const ends = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.4, y0 = 9 + r() * 5;
    const L = 7 + r() * 4;
    const e = [Math.cos(a) * L, y0 + 4 + r() * 4, Math.sin(a) * L];
    b.segment('solid', bark, base, [0.3 * Math.cos(a), y0, 0.3 * Math.sin(a)], e, 0.85, GEO.taper6);
    ends.push(e);
  }
  ends.push([0, 22, 0], [3, 20, -3], [-3, 20, 3]);
  ends.forEach((e, i) => {
    const s = i >= 7 ? 7.5 : 5 + r() * 2.2;
    b.add('sway', blob(i % 4, 1, 0.25), C(golds[i % golds.length]), T(base, e[0], e[1] + 1.5, e[2], r(), r() * 3, 0, s, s * 0.8, s));
    // 小簇
    for (let k = 0; k < 2; k++) {
      const s2 = s * (0.45 + r() * 0.2);
      b.add('sway', blob((i + k + 1) % 4), C(golds[(i + k + 2) % golds.length]),
        T(base, e[0] + (r() - 0.5) * s * 1.4, e[1] + (r() - 0.6) * s * 0.8, e[2] + (r() - 0.5) * s * 1.4, 0, r() * 3, 0, s2));
    }
  });
  // 挂灯
  for (let i = 0; i < 6; i++) {
    const e = ends[i];
    const x = e[0] * 0.8, z = e[2] * 0.8, y = e[1] - 4.5;
    b.add('solid', GEO.cyl6, P.woodDark, T(base, x, y + 1.6, z, 0, 0, 0, 0.03, 3, 0.03));
    b.add('glow', GEO.sphereLo, P.glowWarm, T(base, x, y, z, 0, 0, 0, 0.35));
    b.add('solid', GEO.cone6, P.gold, T(base, x, y + 0.42, z, 0, 0, 0, 0.32, 0.25, 0.32));
  }
  return { height: 28, canopyR: 14 };
}

// ---------------- 房屋 ----------------
export function house(b, base, o = {}) {
  const w = o.w ?? 6, d = o.d ?? 5, h = o.h ?? 3.4;
  const wall = o.wall ?? P.cream, roof = o.roof ?? P.coral, trim = o.trim ?? P.wood;
  const y0 = 0.5;
  b.add('flat', GEO.box, P.stoneDark, T(base, 0, 0.1, 0, 0, 0, 0, w + 0.5, 0.9, d + 0.5));
  b.add('solid', GEO.box, wall, T(base, 0, y0 + h / 2, 0, 0, 0, 0, w, h, d));
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    b.add('solid', GEO.box, trim, T(base, sx * w / 2, y0 + h / 2, sz * d / 2, 0, 0, 0, 0.26, h, 0.26));
  b.add('solid', GEO.box, trim, T(base, 0, y0 + h - 0.1, d / 2 + 0.02, 0, 0, 0, w, 0.22, 0.12));
  const rh = o.roofH ?? w * 0.42, sy = rh / 1.5, sx = (w + 1.1) / 1.732;
  b.add('flat', GEO.prism, roof, T(base, 0, y0 + h + 0.5 * sy, 0, 0, 0, 0, sx, sy, d + 1.0));
  b.add('flat', GEO.box, P.stone, T(base, w * 0.25, y0 + h + rh * 0.55, -d * 0.2, 0, 0, 0, 0.7, rh * 1.3, 0.7));
  // 门 + 台阶
  b.add('solid', GEO.box, P.woodDark, T(base, 0, y0 + 1.05, d / 2 + 0.04, 0, 0, 0, 1.15, 2.1, 0.1));
  b.add('solid', GEO.box, P.gold, T(base, 0.35, y0 + 1.0, d / 2 + 0.11, 0, 0, 0, 0.1, 0.1, 0.05));
  b.add('flat', GEO.box, P.stone, T(base, 0, 0.35, d / 2 + 0.6, 0, 0, 0, 1.8, 0.3, 0.9));
  // 窗（暖光）+ 窗框 + 花箱
  const win = (x, y, z, ry) => {
    b.add('solid', GEO.box, trim, T(base, x, y, z, 0, ry, 0, 1.12, 1.12, 0.08));
    b.add('glow', GEO.box, 0xf3d9a6, T(base, x, y, z, 0, ry, 0, 0.88, 0.88, 0.1));
    b.add('solid', GEO.box, P.sageDark, T(base, x, y - 0.68, z, 0, ry, 0, 1.2, 0.25, 0.3));
    b.add('swaySoft', GEO.sphereLo, o.flowers ?? P.coralSoft, T(base, x, y - 0.5, z, 0, ry, 0, 0.55, 0.18, 0.2));
  };
  win(-w * 0.3, y0 + h * 0.56, d / 2 + 0.03, 0);
  win(w * 0.3, y0 + h * 0.56, d / 2 + 0.03, 0);
  win(w / 2 + 0.03, y0 + h * 0.56, 0, Math.PI / 2);
  win(-w / 2 - 0.03, y0 + h * 0.56, 0, Math.PI / 2);
  // 山墙圆窗
  b.add('glow', GEO.cyl12, 0xf3d9a6, T(base, 0, y0 + h + rh * 0.35, d / 2 + 0.5, Math.PI / 2, 0, 0, 0.42, 0.08, 0.42));
}

// ---------------- 风车（返回转子网格） ----------------
export function windmill(b, base, o = {}) {
  const H = o.h ?? 11;
  b.add('solid', GEO.taper8, o.wall ?? P.cream, T(base, 0, H / 2, 0, 0, 0, 0, 2.6, H, 2.6));
  for (const y of [0.3, H * 0.5])
    b.add('solid', GEO.cyl8, P.wood, T(base, 0, y, 0, 0, 0, 0, 2.62 - y / H * 1.0, 0.3, 2.62 - y / H * 1.0));
  b.add('flat', GEO.cone8, o.roof ?? P.coral, T(base, 0, H + 1.4, 0, 0, 0, 0, 2.1, 3, 2.1));
  b.add('solid', GEO.box, P.woodDark, T(base, 0, 1.1, 2.45, 0, 0, 0, 1.1, 2.1, 0.3));
  b.add('glow', GEO.box, 0xf3d9a6, T(base, 0, H * 0.6, 2.05, -0.12, 0, 0, 0.7, 0.9, 0.12));
  // 转子
  const rb = new Batcher();
  const I = new THREE.Matrix4();
  rb.add('solid', GEO.cyl8, P.woodDark, T(I, 0, 0, 0, Math.PI / 2, 0, 0, 0.45, 0.8, 0.45));
  rb.add('solid', GEO.sphereLo, P.gold, T(I, 0, 0, 0.45, 0, 0, 0, 0.32));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const arm = new THREE.Matrix4().makeRotationZ(a);
    rb.add('solid', GEO.box, P.wood, I.clone().multiply(arm).multiply(M(0, 3.4, 0.1, 0, 0, 0, 0.22, 6.8, 0.18)));
    rb.add('solid', GEO.box, o.sail ?? P.cream, I.clone().multiply(arm).multiply(M(0.8, 4.0, 0.12, 0, 0, 0, 1.3, 5.2, 0.06)));
    for (let k = 0; k < 4; k++)
      rb.add('solid', GEO.box, P.wood, I.clone().multiply(arm).multiply(M(0.8, 1.8 + k * 1.4, 0.16, 0, 0, 0, 1.4, 0.07, 0.07)));
  }
  const rotor = rb.build()[0];
  const pivot = new THREE.Group();
  pivot.applyMatrix4(T(base, 0, H - 0.6, 2.1));
  pivot.add(rotor);
  return { pivot, rotor };
}

// ---------------- 灯塔 ----------------
export function lighthouse(b, base) {
  const H = 26, segs = 6;
  for (let i = 0; i < segs; i++) {
    const y = (i / segs) * H, h = H / segs;
    const rb = 3.2 - (i / segs) * 1.2, rt = 3.2 - ((i + 1) / segs) * 1.2;
    const g = new THREE.CylinderGeometry(rt, rb, h, 14);
    b.add('solid', g, i % 2 ? P.coral : P.cream, T(base, 0, y + h / 2, 0));
  }
  b.add('flat', GEO.cyl8, P.stoneDark, T(base, 0, 0.5, 0, 0, 0, 0, 3.8, 1.4, 3.8));
  b.add('solid', GEO.cyl16, P.gold, T(base, 0, H + 0.15, 0, 0, 0, 0, 2.9, 0.3, 2.9));
  b.add('solid', GEO.torus, P.gold, T(base, 0, H + 1.0, 0, Math.PI / 2, 0, 0, 2.8, 2.8, 2.8));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.add('solid', GEO.cyl6, P.gold, T(base, Math.cos(a) * 2.8, H + 0.6, Math.sin(a) * 2.8, 0, 0, 0, 0.05, 0.9, 0.05));
  }
  b.add('glow', GEO.cyl12, 0xfff0c4, T(base, 0, H + 1.5, 0, 0, 0, 0, 1.55, 2.6, 1.55));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.add('solid', GEO.box, P.sageDeep, T(base, Math.cos(a) * 1.6, H + 1.5, Math.sin(a) * 1.6, 0, -a, 0, 0.12, 2.6, 0.12));
  }
  b.add('flat', GEO.cone12, P.sageDark, T(base, 0, H + 3.8, 0, 0, 0, 0, 2.0, 2.0, 2.0));
  b.add('solid', GEO.sphereLo, P.gold, T(base, 0, H + 5, 0, 0, 0, 0, 0.3));
  b.add('solid', GEO.cyl6, P.gold, T(base, 0, H + 5.8, 0, 0, 0, 0, 0.06, 1.4, 0.06));
  b.add('solid', GEO.box, P.woodDark, T(base, 0, 1.2, 3.05, -0.08, 0, 0, 1.1, 2.2, 0.2));
  for (let i = 1; i < 5; i++) b.add('glow', GEO.box, 0xf3d9a6, T(base, 0, i * 5, 3.15 - i * 0.2, 0, 0, 0, 0.5, 0.8, 0.1));
  return { lanternY: H + 1.5 };
}

// ---------------- 小件 ----------------
export function lamp(b, base, o = {}) {
  const h = o.h ?? 3.2;
  b.add('flat', GEO.cyl6, P.stoneDark, T(base, 0, 0.15, 0, 0, 0, 0, 0.3, 0.3, 0.3));
  b.add('solid', GEO.cyl6, P.sageDeep, T(base, 0, h / 2, 0, 0, 0, 0, 0.07, h, 0.07));
  b.add('solid', GEO.cone6, P.gold, T(base, 0, h + 0.55, 0, 0, 0, 0, 0.32, 0.3, 0.32));
  b.add('glow', GEO.box, o.glow ?? P.glowWarm, T(base, 0, h + 0.2, 0, 0, Math.PI / 4, 0, 0.32, 0.45, 0.32));
  b.add('solid', GEO.box, P.gold, T(base, 0, h - 0.05, 0, 0, 0, 0, 0.42, 0.06, 0.42));
}

export function bench(b, base) {
  for (const z of [-0.18, 0, 0.18]) b.add('solid', GEO.box, P.wood, T(base, 0, 0.5, z, 0, 0, 0, 1.8, 0.07, 0.15));
  b.add('solid', GEO.box, P.wood, T(base, 0, 0.85, -0.3, -0.2, 0, 0, 1.8, 0.4, 0.07));
  for (const x of [-0.75, 0.75]) b.add('solid', GEO.box, P.woodDark, T(base, x, 0.25, 0, 0, 0, 0, 0.08, 0.5, 0.5));
}

export function rock(b, base, s = 1, color = P.stone, seed = 0) {
  b.add('flat', blob(seed % 4 + 10, 0, 0.3), color, T(base, 0, s * 0.25, 0, seed, seed * 2, 0, s, s * 0.7, s));
}

export function fence(b, base, pts, o = {}) {
  const col = o.color ?? P.creamDark, h = o.h ?? 0.9;
  for (let i = 0; i < pts.length; i++) {
    const [x, y, z] = pts[i];
    b.add('solid', GEO.box, col, T(base, x, y + h / 2, z, 0, 0, 0, 0.14, h, 0.14));
    if (i > 0) {
      const [px, py, pz] = pts[i - 1];
      for (const k of [0.45, 0.8]) b.segment('solid', col, base, [px, py + h * k, pz], [x, y + h * k, z], 0.05, GEO.cyl6);
    }
  }
}

export function flag(b, base, color = P.coral, h = 5) {
  b.add('solid', GEO.cyl6, P.woodDark, T(base, 0, h / 2, 0, 0, 0, 0, 0.07, h, 0.07));
  b.add('solid', GEO.sphereLo, P.gold, T(base, 0, h + 0.1, 0, 0, 0, 0, 0.13));
  b.add('swaySoft', GEO.prism, color, T(base, 0.9, h - 0.55, 0, 0, Math.PI / 2, Math.PI / 2, 0.45, 1.2, 0.04));
}

export function signpost(b, base, n = 3) {
  b.add('solid', GEO.box, P.woodDark, T(base, 0, 1.2, 0, 0, 0, 0, 0.16, 2.4, 0.16));
  for (let i = 0; i < n; i++)
    b.add('solid', GEO.box, i % 2 ? P.cream : P.creamDark, T(base, 0.4, 2.1 - i * 0.42, 0, 0, i * 1.9, 0, 1.0, 0.3, 0.06));
}

export function telescope(b, base) {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.segment('solid', P.woodDark, base, [Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5], [0, 1.3, 0], 0.04, GEO.cyl6);
  }
  b.add('solid', GEO.cyl8, P.copper, T(base, 0, 1.45, 0.2, -1.3, 0, 0, 0.12, 1.3, 0.12));
  b.add('solid', GEO.cyl8, P.gold, T(base, 0, 1.6, 0.8, -1.3, 0, 0, 0.16, 0.25, 0.16));
}

export function deck(b, base, len, wid, o = {}) {
  b.add('solid', GEO.box, P.wood, T(base, 0, -0.15, len / 2, 0, 0, 0, wid, 0.3, len));
  for (let i = 0; i < len; i += 1.2) b.add('solid', GEO.box, P.woodDark, T(base, 0, 0.01, i + 0.6, 0, 0, 0, wid, 0.02, 0.06));
  for (const sx of [-1, 1]) {
    b.segment('solid', P.woodDark, base, [sx * wid / 2, -0.3, len], [sx * wid * 0.2, -4, len * 0.4], 0.12, GEO.cyl6);
    if (o.rail !== false) {
      for (let z = 0; z <= len; z += len / 4) b.add('solid', GEO.box, P.creamDark, T(base, sx * wid / 2, 0.5, z, 0, 0, 0, 0.12, 1.0, 0.12));
      b.add('solid', GEO.box, P.creamDark, T(base, sx * wid / 2, 1.0, len / 2, 0, 0, 0, 0.1, 0.1, len));
    }
  }
  if (o.rail !== false && o.front !== false) b.add('solid', GEO.box, P.creamDark, T(base, 0, 1.0, len, 0, 0, 0, wid, 0.1, 0.1));
}

export function pine(b, base, o = {}) {
  const r = mulberry32(o.seed ?? 3);
  const h = o.h ?? 8, w = o.w ?? 2.4;
  b.add('solid', GEO.cyl6, P.woodDark, T(base, 0, h * 0.15, 0, 0, 0, 0, 0.25, h * 0.3, 0.25));
  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const t = i / layers, y = h * (0.25 + t * 0.6), s = w * (1 - t * 0.6);
    b.add('flat', GEO.cone8, vary(o.color ?? P.pine, r, 0.08), T(base, 0, y, 0, 0, r() * 3, 0, s, h * 0.35, s));
    if (o.snow) b.add('flat', GEO.cone8, P.snow, T(base, 0, y + h * 0.08, 0, 0, r() * 3, 0, s * 0.72, h * 0.22, s * 0.72));
  }
}

export function giantTree(b, base, o = {}) {
  const r = mulberry32(o.seed ?? 9);
  const H = o.h ?? 38, R = o.r ?? 3.2;
  const bark = 0x7f6c5d;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r() * 0.4;
    b.segment('solid', 0x8d7a69, base, [Math.cos(a) * R * 0.4, R * 1.5, Math.sin(a) * R * 0.4], [Math.cos(a) * R * 2.3, -0.4, Math.sin(a) * R * 2.3], R * 0.35, GEO.taper6);
  }
  b.segment('solid', bark, base, [0, -0.5, 0], [r() * 2 - 1, H * 0.75, r() * 2 - 1], R, GEO.taper8);
  const tops = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r();
    const y = H * (0.55 + r() * 0.2), L = R * (3 + r() * 2);
    const e = [Math.cos(a) * L, y + R * 2.5, Math.sin(a) * L];
    b.segment('solid', bark, base, [0, y, 0], e, R * 0.3, GEO.taper6);
    tops.push(e);
  }
  tops.push([0, H * 0.85, 0]);
  const leaves = o.leaves ?? [0x6f9a80, 0x86ae8c, 0x5f8a76, 0x9cc097];
  tops.forEach((e, i) => {
    const s = R * (i === 5 ? 4.2 : 2.8 + r());
    b.add('sway', blob(i % 4, 1, 0.24), C(leaves[i % leaves.length]), T(base, e[0], e[1] + s * 0.3, e[2], 0, r() * 3, 0, s, s * 0.6, s));
  });
  // 树干上的发光苔点
  for (let i = 0; i < 10; i++) {
    const a = r() * Math.PI * 2, y = 1 + r() * H * 0.4, rr = R * (1 - y / H * 0.35);
    b.add('glow', GEO.sphereLo, P.glowMint, T(base, Math.cos(a) * rr, y, Math.sin(a) * rr, 0, 0, 0, 0.18 + r() * 0.15));
  }
  return { tops, H };
}

export function mushroom(b, base, o = {}) {
  const h = o.h ?? 0.8, s = o.s ?? 0.6;
  b.add('solid', GEO.taper6, P.cream, T(base, 0, h / 2, 0, 0, 0, 0, s * 0.22, h, s * 0.22));
  b.add(o.glow ? 'glow' : 'solid', GEO.dome, o.cap ?? P.coral, T(base, 0, h * 0.95, 0, 0, 0, 0, s, s * 0.6, s));
}

export function glowPlant(b, base, r, color = P.glowMint) {
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r();
    const L = 0.8 + r() * 0.8;
    b.segment('swaySoft', P.sageDeep, base, [0, 0, 0], [Math.cos(a) * 0.4, L, Math.sin(a) * 0.4], 0.04, GEO.cyl6);
    b.add('glow', GEO.sphereLo, color, T(base, Math.cos(a) * 0.45, L + 0.05, Math.sin(a) * 0.45, 0, 0, 0, 0.12));
  }
}

export function pavilion(b, base, o = {}) {
  const R = o.r ?? 3.4, H = o.h ?? 3.2;
  b.add('flat', GEO.cyl12, P.stone, T(base, 0, 0.2, 0, 0, 0, 0, R + 0.6, 0.5, R + 0.6));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.add('solid', GEO.cyl8, P.cream, T(base, Math.cos(a) * R, H / 2 + 0.4, Math.sin(a) * R, 0, 0, 0, 0.16, H, 0.16));
  }
  b.add('solid', GEO.torus, P.gold, T(base, 0, H + 0.4, 0, Math.PI / 2, 0, 0, R, R, 2));
  b.add('flat', GEO.dome, o.roof ?? P.sage, T(base, 0, H + 0.4, 0, 0, 0, 0, R + 0.7, 2.0, R + 0.7));
  b.add('solid', GEO.sphereLo, P.gold, T(base, 0, H + 2.5, 0, 0, 0, 0, 0.3));
}

export function crystal(b, base, s = 1, color = P.ice) {
  b.add('ice', GEO.oct, color, T(base, 0, s * 1.3, 0, 0, s * 3, 0.15, s * 0.5, s * 1.6, s * 0.5));
}

export function bellShrine(b, base) {
  for (const x of [-1.8, 1.8]) b.add('solid', GEO.cyl8, P.coral, T(base, x, 2, 0, 0, 0, 0, 0.18, 4, 0.18));
  b.add('solid', GEO.box, P.woodDark, T(base, 0, 4.1, 0, 0, 0, 0.05, 5.2, 0.32, 0.5));
  b.add('solid', GEO.box, P.coral, T(base, 0, 3.4, 0, 0, 0, 0, 4.0, 0.2, 0.3));
  for (const x of [-1, 0, 1]) {
    b.add('solid', GEO.cyl6, P.woodDark, T(base, x, 3.0, 0, 0, 0, 0, 0.02, 0.8, 0.02));
    b.add('solid', GEO.cone8, P.gold, T(base, x, 2.45, 0, 0, 0, 0, 0.28, 0.5, 0.28));
    b.add('solid', GEO.sphereLo, P.goldLight, T(base, x, 2.2, 0, 0, 0, 0, 0.08));
  }
}

export function clockTower(b, base) {
  b.add('solid', GEO.box, P.cream, T(base, 0, 6, 0, 0, 0, 0, 3.6, 12, 3.6));
  b.add('solid', GEO.box, P.wood, T(base, 0, 12.1, 0, 0, 0, 0, 4.0, 0.4, 4.0));
  b.add('flat', GEO.cone4, P.sageDark, T(base, 0, 14.4, 0, 0, Math.PI / 4, 0, 3.2, 4.2, 3.2));
  b.add('solid', GEO.cyl6, P.gold, T(base, 0, 17, 0, 0, 0, 0, 0.07, 1.6, 0.07));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const cx = Math.sin(a) * 1.82, cz = Math.cos(a) * 1.82;
    b.add('glow', GEO.cyl16, 0xfaf0d8, T(base, cx, 10, cz, Math.PI / 2, 0, -a, 1.1, 0.06, 1.1).multiply(M()));
    b.add('solid', GEO.torus, P.gold, T(base, cx * 1.01, 10, cz * 1.01, 0, a, 0, 1.15, 1.15, 1.15));
    b.add('solid', GEO.box, P.woodDark, T(base, cx * 1.03, 10.3, cz * 1.03, 0, a, 0, 0.08, 0.7, 0.04));
  }
  b.add('solid', GEO.box, P.woodDark, T(base, 0, 1.3, 1.82, 0, 0, 0, 1.3, 2.6, 0.1));
}

export function crate(b, base, s = 1) {
  b.add('solid', GEO.box, P.wood, T(base, 0, s / 2, 0, 0, 0, 0, s, s, s));
  b.add('solid', GEO.box, P.woodDark, T(base, 0, s / 2, 0, 0, 0, 0, s * 1.02, s * 0.15, s * 1.02));
}

export function barrel(b, base) {
  b.add('solid', GEO.cyl12, P.wood, T(base, 0, 0.55, 0, 0, 0, 0, 0.42, 1.1, 0.42));
  for (const y of [0.2, 0.9]) b.add('solid', GEO.cyl12, P.copper, T(base, 0, y, 0, 0, 0, 0, 0.44, 0.08, 0.44));
}

// ---------------- 飞艇（独立网格，可动画） ----------------
export function airship(o = {}) {
  const b = new Batcher();
  const I = new THREE.Matrix4();
  const s = o.s ?? 1;
  b.add('solid', GEO.sphere, o.balloon ?? P.cream, T(I, 0, 4 * s, 0, 0, 0, 0, 2.6 * s, 2.3 * s, 6 * s));
  b.add('solid', GEO.torus, o.stripe ?? P.coral, T(I, 0, 4 * s, 0, 0, 0, 0, 2.62 * s, 2.32 * s, 3 * s));
  b.add('solid', GEO.torus, o.stripe ?? P.coral, T(I, 0, 4 * s, 2.8 * s, 0, 0, 0, 2.1 * s, 1.9 * s, 3 * s));
  b.add('solid', GEO.torus, o.stripe ?? P.coral, T(I, 0, 4 * s, -2.8 * s, 0, 0, 0, 2.1 * s, 1.9 * s, 3 * s));
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2])
    b.add('flat', GEO.prism, P.sageDark, T(I, Math.sin(a) * 1.6 * s, 4 * s + Math.cos(a) * 1.6 * s, -5.6 * s, 0, 0, a, 0.05 * s, 1.0 * s, 1.6 * s));
  b.add('solid', GEO.box, P.wood, T(I, 0, 0.6 * s, 0, 0, 0, 0, 1.6 * s, 0.9 * s, 3.4 * s));
  b.add('solid', GEO.box, P.gold, T(I, 0, 1.1 * s, 0, 0, 0, 0, 1.7 * s, 0.1 * s, 3.5 * s));
  b.add('glow', GEO.box, 0xf3d9a6, T(I, 0, 0.7 * s, 0, 0, 0, 0, 1.65 * s, 0.35 * s, 2.6 * s));
  for (const x of [-0.7, 0.7]) for (const z of [-1.4, 1.4])
    b.segment('solid', P.woodDark, I, [x * s, 1.1 * s, z * s], [x * 1.8 * s, 2.6 * s, z * 1.7 * s], 0.03 * s, GEO.cyl6);
  const g = new THREE.Group();
  b.build().forEach((m) => g.add(m));
  return g;
}

// ============================================================
// V2 岛屿细节道具（全部程序化建模）
// ============================================================

/** 石井：石砌井圈 + 木架 + 小屋顶 + 辘轳与水桶 */
export function well(b, base, o = {}) {
  b.add('flat', GEO.cyl12, P.stone, T(base, 0, 0.45, 0, 0, 0, 0, 1.1, 0.9, 1.1));
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; b.add('flat', GEO.box, i % 2 ? P.stoneDark : 0xc9bda8, T(base, Math.cos(a) * 1.08, 0.3 + (i % 3) * 0.2, Math.sin(a) * 1.08, 0, -a, 0, 0.08, 0.16, 0.5)); }
  b.add('solid', GEO.cyl12, P.water, T(base, 0, 0.86, 0, 0, 0, 0, 0.88, 0.04, 0.88));
  b.add('flat', GEO.torus, P.stoneDark, T(base, 0, 0.92, 0, Math.PI / 2, 0, 0, 1.1, 1.1, 2.4));
  for (const sx of [-1, 1]) b.add('solid', GEO.box, P.woodDark, T(base, sx * 1.0, 1.5, 0, 0, 0, 0, 0.13, 2.1, 0.13));
  b.add('solid', GEO.cyl8, P.wood, T(base, 0, 1.95, 0, 0, 0, Math.PI / 2, 0.08, 2.0, 0.08));
  b.add('solid', GEO.cyl6, P.woodDark, T(base, 0, 1.55, 0, 0, 0, 0, 0.012, 0.8, 0.012));
  b.add('solid', GEO.taper8, P.wood, T(base, 0, 1.05, 0, Math.PI, 0, 0, 0.18, 0.28, 0.18));
  b.add('solid', GEO.prism, o.roof ?? P.coral, T(base, 0, 2.55, 0, 0, Math.PI / 2, 0, 0.95, 0.6, 1.6));
  b.add('solid', GEO.box, P.woodDark, T(base, 0, 2.55, 0, 0, 0, 0, 2.3, 0.08, 0.1));
}

/** 木花箱：一排小花 */
export function planter(b, base, len = 2, colors = [P.coral, P.butter, P.pink, 0xffffff], seed = 1) {
  const r = mulberry32(seed);
  b.add('solid', GEO.box, P.wood, T(base, 0, 0.22, 0, 0, 0, 0, len, 0.44, 0.6));
  b.add('solid', GEO.box, P.woodDark, T(base, 0, 0.45, 0, 0, 0, 0, len + 0.06, 0.05, 0.66));
  b.add('flat', GEO.box, P.soil, T(base, 0, 0.44, 0, 0, 0, 0, len - 0.1, 0.03, 0.5));
  for (let x = -len / 2 + 0.18; x < len / 2 - 0.1; x += 0.22) {
    const h = 0.18 + r() * 0.2;
    b.add('solid', GEO.cyl6, P.sageDark, T(base, x, 0.45 + h / 2, (r() - 0.5) * 0.3, 0, 0, 0, 0.015, h, 0.015));
    b.add('sway', GEO.sphereLo, colors[Math.floor(r() * colors.length)], T(base, x, 0.47 + h, (r() - 0.5) * 0.3, 0, 0, 0, 0.09 + r() * 0.04));
  }
  for (let i = 0; i < 4; i++) b.add('sway', blob(i), P.sage, T(base, -len / 2 + 0.3 + i * (len - 0.6) / 3, 0.52, 0.2, 0, i, 0, 0.18, 0.12, 0.18));
}

/** 晾衣绳：两根立柱 + 下垂的绳子 + 随风摆动的衣物 */
export function laundry(b, base, len = 5, colors = [P.cream, P.coralSoft, 0x94adc6, P.butter, 0xffffff]) {
  for (const z of [-len / 2, len / 2]) b.add('solid', GEO.box, P.woodDark, T(base, 0, 1.1, z, 0, 0, 0, 0.1, 2.2, 0.1));
  const sag = (u) => 2.05 - Math.sin(u * Math.PI) * 0.3;
  for (let i = 0; i < 8; i++) {
    const u0 = i / 8, u1 = (i + 1) / 8;
    b.segment('solid', P.cream, base, [0, sag(u0), -len / 2 + len * u0], [0, sag(u1), -len / 2 + len * u1], 0.012, GEO.cyl6);
  }
  for (let i = 0; i < 5; i++) {
    const u = 0.14 + i * 0.18, w = 0.5 + (i % 2) * 0.25, h = 0.55 + ((i * 7) % 3) * 0.15;
    b.add('swaySoft', GEO.box, colors[i % colors.length], T(base, 0, sag(u) - h / 2 - 0.02, -len / 2 + len * u, 0, 0, 0, 0.03, h, w));
    b.add('solid', GEO.box, P.woodLight ?? P.wood, T(base, 0, sag(u) + 0.02, -len / 2 + len * u, 0, 0, 0, 0.05, 0.08, 0.04));
  }
}

/** 木推车：车斗 + 两个辐条轮 + 车把；load='hay' | 'flowers' | 'crates' */
export function cart(b, base, load = 'hay', seed = 2) {
  const r = mulberry32(seed);
  b.add('solid', GEO.box, P.wood, T(base, 0, 0.8, 0, 0, 0, 0, 1.4, 0.12, 2.2));
  for (const sx of [-1, 1]) b.add('solid', GEO.box, P.woodDark, T(base, sx * 0.68, 1.05, 0, 0, 0, 0, 0.06, 0.4, 2.2));
  for (const sz of [-1, 1]) b.add('solid', GEO.box, P.woodDark, T(base, 0, 1.05, sz * 1.08, 0, 0, 0, 1.4, 0.4, 0.06));
  for (const sx of [-1, 1]) {
    b.add('solid', GEO.cyl16, P.woodDark, T(base, sx * 0.82, 0.5, 0.25, 0, 0, Math.PI / 2, 0.5, 0.08, 0.5));
    b.add('solid', GEO.torus, P.gold, T(base, sx * 0.86, 0.5, 0.25, 0, Math.PI / 2, 0, 0.42, 0.42, 1.2));
    for (let k = 0; k < 4; k++) b.add('solid', GEO.box, P.wood, T(base, sx * 0.84, 0.5, 0.25, (k / 4) * Math.PI, 0, 0, 0.04, 0.85, 0.05));
    b.segment('solid', P.woodDark, base, [sx * 0.45, 0.85, -1.1], [sx * 0.35, 0.95, -2.3], 0.05, GEO.cyl6);
  }
  b.add('solid', GEO.box, P.woodDark, T(base, 0, 0.42, -0.9, 0, 0, 0, 0.1, 0.8, 0.1));
  if (load === 'hay') for (let i = 0; i < 5; i++) b.add('flat', blob(i + 20, 1, 0.25), vary(P.butter, r, 0.1), T(base, (r() - 0.5) * 0.7, 1.15 + r() * 0.2, (r() - 0.5) * 1.6, 0, r() * 3, 0, 0.55, 0.35, 0.6));
  else if (load === 'flowers') for (let i = 0; i < 26; i++) b.add('sway', GEO.sphereLo, [P.pink, P.coralSoft, P.butter, 0xffffff, P.lavender][i % 5], T(base, (r() - 0.5) * 1.2, 1.05 + r() * 0.35, (r() - 0.5) * 2.0, 0, 0, 0, 0.13 + r() * 0.06));
  else for (let i = 0; i < 3; i++) crate(b, T(base, (i - 1) * 0.42, 0.86, (i % 2) * 0.5 - 0.3, 0, i * 0.3, 0), 0.4);
}

/** 草编蜂箱 */
export function skep(b, base) {
  b.add('solid', GEO.box, P.woodDark, T(base, 0, 0.35, 0, 0, 0, 0, 0.9, 0.08, 0.9));
  for (const x of [-0.35, 0.35]) for (const z of [-0.35, 0.35]) b.add('solid', GEO.box, P.woodDark, T(base, x, 0.17, z, 0, 0, 0, 0.07, 0.34, 0.07));
  b.add('solid', GEO.dome, 0xdcb563, T(base, 0, 0.39, 0, 0, 0, 0, 0.42, 0.75, 0.42));
  for (let i = 0; i < 4; i++) { const y = 0.47 + i * 0.15, s = 0.42 * Math.sqrt(1 - Math.pow((y - 0.39) / 0.75, 2)); b.add('solid', GEO.torus, 0xc69a48, T(base, 0, y, 0, Math.PI / 2, 0, 0, s, s, 1.2)); }
  b.add('solid', GEO.box, 0x4a3a30, T(base, 0, 0.45, 0.4, 0, 0, 0, 0.16, 0.08, 0.04));
}

/** 野餐：格子布 + 篮子 + 杯子 */
export function picnic(b, base) {
  const chk = new THREE.Color(), a = new THREE.Color(P.coral), w = new THREE.Color(0xfff6ea);
  b.add('flat', GEO.box, (x, y, z) => chk.copy((Math.floor(x * 3 + 50) + Math.floor(z * 3 + 50)) % 2 ? a : w), T(base, 0, 0.02, 0, 0, 0, 0, 2.0, 0.02, 1.6));
  b.add('solid', GEO.box, P.wood, T(base, 0.5, 0.2, 0.2, 0, 0.3, 0, 0.55, 0.36, 0.38));
  b.add('solid', GEO.torus, P.woodDark, T(base, 0.5, 0.42, 0.2, 0, 0.3, 0, 0.22, 0.22, 1.5));
  for (const [x, z] of [[-0.4, -0.3], [-0.1, 0.4]]) b.add('solid', GEO.cyl8, 0xffffff, T(base, x, 0.08, z, 0, 0, 0, 0.07, 0.13, 0.07));
  b.add('solid', GEO.sphereLo, 0xd9534f, T(base, -0.6, 0.08, 0.3, 0, 0, 0, 0.08));
}

/** 拱形小木桥（局部 +Z 为桥的走向） */
export function footbridge(b, base, len = 6, w = 1.6, rise = 0.6) {
  const y = (z) => rise * Math.cos((z / len) * Math.PI);
  for (let z = -len / 2; z <= len / 2 + 0.01; z += 0.32) b.add('solid', GEO.box, P.wood, T(base, 0, y(z), z, -Math.sin((z / len) * Math.PI) * rise * Math.PI / len, 0, 0, w, 0.08, 0.26));
  for (const sx of [-1, 1]) {
    for (let k = 0; k <= 4; k++) { const z = -len / 2 + (k / 4) * len; b.add('solid', GEO.box, P.woodDark, T(base, sx * w / 2, y(z) + 0.4, z, 0, 0, 0, 0.08, 0.8, 0.08)); }
    for (let k = 0; k < 8; k++) { const z0 = -len / 2 + (k / 8) * len, z1 = z0 + len / 8; b.segment('solid', P.woodDark, base, [sx * w / 2, y(z0) + 0.78, z0], [sx * w / 2, y(z1) + 0.78, z1], 0.04, GEO.cyl6); }
  }
}

/** 柴堆 */
export function logPile(b, base, n = 6) {
  let k = 0;
  for (let row = 0; row < 3 && k < n; row++) for (let i = 0; i < 3 - row && k < n; i++, k++)
    b.add('solid', GEO.cyl8, k % 2 ? P.wood : 0xb58a64, T(base, (i - (2 - row) / 2) * 0.42, 0.2 + row * 0.36, 0, Math.PI / 2, 0, 0, 0.2, 1.6, 0.2));
  for (const z of [-0.81, 0.81]) for (let i = 0; i < 3; i++) b.add('solid', GEO.cyl8, P.goldLight, T(base, (i - 1) * 0.42, 0.2, z, Math.PI / 2, 0, 0, 0.16, 0.02, 0.16));
}

/** 树桩（带年轮） */
export function stump(b, base, s = 1) {
  b.add('solid', GEO.taper8, P.wood, T(base, 0, 0.25 * s, 0, 0, 0, 0, 0.45 * s, 0.5 * s, 0.45 * s));
  b.add('solid', GEO.cyl8, P.goldLight, T(base, 0, 0.5 * s, 0, 0, 0, 0, 0.32 * s, 0.02, 0.32 * s));
  b.add('solid', GEO.torus, P.wood, T(base, 0, 0.51 * s, 0, Math.PI / 2, 0, 0, 0.18 * s, 0.18 * s, 0.5));
}

/** 稻草人 */
export function scarecrow(b, base) {
  b.add('solid', GEO.box, P.woodDark, T(base, 0, 1.0, 0, 0, 0, 0, 0.1, 2.0, 0.1));
  b.add('solid', GEO.box, P.woodDark, T(base, 0, 1.55, 0, 0, 0, 0, 1.5, 0.08, 0.08));
  b.add('swaySoft', GEO.box, 0x94adc6, T(base, 0, 1.35, 0, 0, 0, 0, 0.8, 0.7, 0.3));
  b.add('solid', GEO.sphereLo, P.butter, T(base, 0, 2.05, 0, 0, 0, 0, 0.26));
  b.add('solid', GEO.cyl16, 0xd9b45a, T(base, 0, 2.28, 0, 0, 0, 0, 0.42, 0.03, 0.42));
  b.add('solid', GEO.cone12, 0xd9b45a, T(base, 0, 2.42, 0, 0, 0, 0, 0.22, 0.28, 0.22));
  for (const sx of [-1, 1]) b.add('flat', blob(sx + 3, 0, 0.3), P.butter, T(base, sx * 0.8, 1.52, 0, 0, 0, 0, 0.14, 0.18, 0.12));
}

/** 邮筒 */
export function mailbox(b, base, color = P.coral) {
  b.add('solid', GEO.box, P.woodDark, T(base, 0, 0.55, 0, 0, 0, 0, 0.1, 1.1, 0.1));
  b.add('solid', GEO.box, color, T(base, 0, 1.2, 0.05, 0, 0, 0, 0.36, 0.3, 0.55));
  b.add('solid', GEO.cyl12, color, T(base, 0, 1.35, 0.05, Math.PI / 2, 0, 0, 0.18, 0.55, 0.18));
  b.add('solid', GEO.box, P.gold, T(base, 0.2, 1.35, -0.1, 0, 0, 0, 0.03, 0.3, 0.06));
  b.add('solid', GEO.box, P.gold, T(base, 0.2, 1.5, -0.02, 0, 0, 0, 0.03, 0.06, 0.18));
}

/** 雪人 */
export function snowman(b, base, s = 1, scarf = P.coral) {
  b.add('solid', GEO.sphere, P.snow, T(base, 0, 0.55 * s, 0, 0, 0, 0, 0.62 * s));
  b.add('solid', GEO.sphere, P.snow, T(base, 0, 1.35 * s, 0, 0, 0, 0, 0.45 * s));
  b.add('solid', GEO.sphere, P.snow, T(base, 0, 1.98 * s, 0, 0, 0, 0, 0.32 * s));
  b.add('solid', GEO.cone8, 0xe8894f, T(base, 0, 1.98 * s, 0.38 * s, Math.PI / 2, 0, 0, 0.06 * s, 0.3 * s, 0.06 * s));
  for (const sx of [-1, 1]) b.add('solid', GEO.sphereLo, 0x3b3440, T(base, sx * 0.11 * s, 2.07 * s, 0.27 * s, 0, 0, 0, 0.04 * s));
  for (const y of [1.2, 1.42]) b.add('solid', GEO.sphereLo, 0x3b3440, T(base, 0, y * s, 0.44 * s, 0, 0, 0, 0.045 * s));
  b.add('solid', GEO.torus, scarf, T(base, 0, 1.7 * s, 0, Math.PI / 2, 0, 0, 0.32 * s, 0.32 * s, 2.4 * s));
  b.add('swaySoft', GEO.box, scarf, T(base, 0.18 * s, 1.5 * s, 0.25 * s, 0.2, 0, 0.1, 0.12 * s, 0.4 * s, 0.04 * s));
  b.add('solid', GEO.cyl12, 0x55617a, T(base, 0, 2.3 * s, 0, 0.1, 0, 0, 0.26 * s, 0.32 * s, 0.26 * s));
  b.add('solid', GEO.cyl12, 0x55617a, T(base, 0, 2.15 * s, 0, 0.1, 0, 0, 0.38 * s, 0.03, 0.38 * s));
  for (const sx of [-1, 1]) b.segment('solid', P.woodDark, base, [sx * 0.4 * s, 1.4 * s, 0], [sx * 0.95 * s, 1.75 * s, 0.1], 0.03, GEO.cyl6);
}

/** 雪橇 */
export function sled(b, base) {
  for (const sx of [-1, 1]) {
    b.add('solid', GEO.box, P.coral, T(base, sx * 0.35, 0.06, 0, 0, 0, 0, 0.06, 0.06, 1.5));
    b.add('solid', GEO.torus, P.coral, T(base, sx * 0.35, 0.22, 0.75, 0, Math.PI / 2, 0, 0.18, 0.18, 1.4));
    for (const z of [-0.5, 0.4]) b.add('solid', GEO.box, P.woodDark, T(base, sx * 0.35, 0.18, z, 0, 0, 0, 0.05, 0.24, 0.05));
  }
  for (let z = -0.6; z <= 0.55; z += 0.22) b.add('solid', GEO.box, P.wood, T(base, 0, 0.32, z, 0, 0, 0, 0.85, 0.05, 0.16));
}

/** 原木小屋（带烟囱）；返回烟囱顶部的局部坐标 */
export function cabin(b, base, o = {}) {
  const w = o.w ?? 5, d = o.d ?? 4, h = o.h ?? 2.6;
  for (let y = 0.15; y < h; y += 0.3) {
    for (const sz of [-1, 1]) b.add('solid', GEO.cyl6, (y * 10) % 2 < 1 ? P.wood : 0x9b7254, T(base, 0, y, sz * d / 2, 0, 0, Math.PI / 2, 0.16, w + 0.4, 0.16));
    for (const sx of [-1, 1]) b.add('solid', GEO.cyl6, (y * 10) % 2 < 1 ? 0x9b7254 : P.wood, T(base, sx * w / 2, y + 0.15, 0, Math.PI / 2, 0, 0, 0.16, d + 0.4, 0.16));
  }
  b.add('solid', GEO.box, P.woodDark, T(base, 0, h / 2, 0, 0, 0, 0, w - 0.2, h, d - 0.2));
  b.add('flat', GEO.prism, o.roof ?? P.sageDark, T(base, 0, h + 0.5, 0, 0, Math.PI / 2, 0, (d + 1.2) / 1.732, 1.3, w + 0.8));
  if (o.snow) b.add('flat', GEO.prism, P.snow, T(base, 0, h + 0.62, 0, 0, Math.PI / 2, 0, (d + 1.3) / 1.732, 1.25, w + 0.85));
  b.add('solid', GEO.box, P.woodDark, T(base, 0, 0.95, d / 2 + 0.02, 0, 0, 0, 0.9, 1.9, 0.06));
  b.add('glow', GEO.box, P.glowWarm, T(base, w * 0.28, 1.4, d / 2 + 0.03, 0, 0, 0, 0.7, 0.6, 0.04));
  b.add('solid', GEO.box, P.woodDark, T(base, w * 0.28, 1.4, d / 2 + 0.05, 0, 0, 0, 0.08, 0.66, 0.04));
  const cx = -w * 0.3;
  b.add('flat', GEO.box, P.stone, T(base, cx, h + 1.2, -d * 0.15, 0, 0, 0, 0.6, 2.0, 0.6));
  b.add('flat', GEO.box, P.stoneDark, T(base, cx, h + 2.25, -d * 0.15, 0, 0, 0, 0.72, 0.12, 0.72));
  return new THREE.Vector3(cx, h + 2.4, -d * 0.15).applyMatrix4(base);
}

/** 彩旗串：在两点之间下垂（a、c 为同一局部空间中的点） */
export function bunting(b, base, a, c, n = 12, colors = [P.coral, P.butter, P.sage, 0x94adc6, P.pink]) {
  const sag = Math.hypot(c[0] - a[0], c[2] - a[2]) * 0.06;
  const P3 = (u) => [a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u - Math.sin(u * Math.PI) * sag, a[2] + (c[2] - a[2]) * u];
  for (let i = 0; i < 10; i++) b.segment('solid', P.cream, base, P3(i / 10), P3((i + 1) / 10), 0.015, GEO.cyl6);
  const ang = Math.atan2(c[0] - a[0], c[2] - a[2]);
  for (let i = 1; i < n; i++) { const p = P3(i / n); b.add('swaySoft', GEO.prism, colors[i % colors.length], T(base, p[0], p[1] - 0.22, p[2], Math.PI, ang + Math.PI / 2, Math.PI / 2, 0.16, 0.03, 0.26)); }
}

/** 集市小摊：桌台 + 条纹遮阳篷 + 货物 */
export function stall(b, base, color = P.coral, goods = 'fruit', seed = 3) {
  const r = mulberry32(seed);
  b.add('solid', GEO.box, P.wood, T(base, 0, 0.85, 0, 0, 0, 0, 2.2, 0.1, 1.0));
  b.add('solid', GEO.box, P.woodDark, T(base, 0, 0.42, 0.45, 0, 0, 0, 2.2, 0.8, 0.06));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('solid', GEO.box, P.woodDark, T(base, sx * 1.05, 1.15, sz * 0.48, 0, 0, 0, 0.08, 2.3, 0.08));
  for (let i = 0; i < 6; i++) b.add('solid', GEO.box, i % 2 ? color : 0xfff6ea, T(base, -1.1 + 0.183 + i * 0.367, 2.32, 0.15, 0.3, 0, 0, 0.367, 0.05, 1.5));
  for (let i = 0; i < 6; i++) b.add('swaySoft', GEO.prism, i % 2 ? color : 0xfff6ea, T(base, -1.1 + 0.183 + i * 0.367, 2.05, 0.85, Math.PI, 0, 0, 0.1, 0.18, 0.03));
  const cols = goods === 'fruit' ? [0xe36a5a, 0xf2b84a, 0x9cc46a, 0xe89a50] : goods === 'flowers' ? [P.pink, P.lavender, P.butter, 0xffffff] : [0xd2a052, 0x94adc6, P.coralSoft, P.cream];
  for (let i = 0; i < 4; i++) {
    b.add('solid', GEO.box, P.woodLight ?? 0xc49a72, T(base, -0.75 + i * 0.5, 0.97, -0.1, 0, 0, 0, 0.42, 0.14, 0.5));
    for (let k = 0; k < 5; k++) b.add(goods === 'flowers' ? 'sway' : 'solid', GEO.sphereLo, cols[i], T(base, -0.75 + i * 0.5 + (r() - 0.5) * 0.25, 1.1 + r() * 0.06, -0.1 + (r() - 0.5) * 0.3, 0, 0, 0, 0.08 + r() * 0.03));
  }
}

/** 小划艇（放在支架上） */
export function rowboat(b, base, color = 0x94adc6) {
  const hull = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  b.add('solid', hull, color, T(base, 0, 0.75, 0, 0, 0, 0, 0.75, 0.45, 1.9));
  b.add('solid', GEO.torus, P.cream, T(base, 0, 0.75, 0, Math.PI / 2, 0, 0, 0.75, 1.9, 1.2));
  for (const z of [-0.6, 0.5]) b.add('solid', GEO.box, P.wood, T(base, 0, 0.62, z, 0, 0, 0, 1.3, 0.06, 0.28));
  for (const z of [-1.0, 1.0]) for (const sx of [-1, 1]) b.add('solid', GEO.box, P.woodDark, T(base, sx * 0.4, 0.2, z, 0, 0, sx * 0.3, 0.08, 0.5, 0.08));
  for (const sx of [-1, 1]) b.segment('solid', P.wood, base, [sx * 0.2, 0.72, -0.8], [sx * 0.95, 0.4, 1.2], 0.035, GEO.cyl6);
}

/** 花拱门 */
export function trellis(b, base, w = 2.6, h = 2.8, colors = [P.pink, 0xffffff, P.coralSoft], seed = 4) {
  const r = mulberry32(seed);
  for (const sx of [-1, 1]) b.add('solid', GEO.box, P.cream, T(base, sx * w / 2, h / 2, 0, 0, 0, 0, 0.1, h, 0.1));
  b.add('solid', new THREE.TorusGeometry(w / 2, 0.05, 6, 16, Math.PI), P.cream, T(base, 0, h, 0));
  for (let i = 0; i < 26; i++) {
    const t = r(), a = t * Math.PI, onArc = i % 3;
    const x = onArc ? Math.cos(a) * w / 2 : (i % 2 ? 1 : -1) * w / 2, y = onArc ? h + Math.sin(a) * w / 2 : t * h;
    b.add('sway', blob(i % 4), P.sage, T(base, x, y, (r() - 0.5) * 0.2, 0, i, 0, 0.22, 0.18, 0.22));
    if (i % 2) b.add('sway', GEO.sphereLo, colors[i % colors.length], T(base, x + (r() - 0.5) * 0.2, y + 0.1, 0.12, 0, 0, 0, 0.1));
  }
}

/** 树屋：围绕树干的圆形平台 + 栏杆 + 小屋 + 绳梯（局部原点在树根） */
export function treehouse(b, base, trunkR, H, o = {}) {
  const R2 = trunkR + 3;
  b.add('solid', GEO.cyl16, P.wood, T(base, 0, H, 0, 0, 0, 0, R2, 0.3, R2));
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; b.add('solid', GEO.box, P.woodDark, T(base, Math.cos(a) * (R2 - 0.1), H + 0.55, Math.sin(a) * (R2 - 0.1), 0, -a, 0, 0.08, 0.9, 0.08)); }
  b.add('solid', GEO.torus, P.woodDark, T(base, 0, H + 1.0, 0, Math.PI / 2, 0, 0, R2 - 0.1, R2 - 0.1, 0.6));
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; b.segment('solid', P.woodDark, base, [Math.cos(a) * (R2 - 0.4), H - 0.1, Math.sin(a) * (R2 - 0.4)], [Math.cos(a) * trunkR * 0.8, H - 3.2, Math.sin(a) * trunkR * 0.8], 0.12, GEO.cyl6); }
  const hx = trunkR + 1.6;
  b.add('solid', GEO.box, o.wall ?? P.cream, T(base, hx, H + 1.25, 0, 0, 0, 0, 2.4, 2.2, 2.6));
  b.add('solid', GEO.prism, o.roof ?? P.coral, T(base, hx, H + 2.6, 0, 0, 0, 0, 1.75, 0.9, 3.0));
  b.add('glow', GEO.box, P.glowWarm, T(base, hx + 1.21, H + 1.4, 0.4, 0, 0, 0, 0.04, 0.6, 0.6));
  b.add('solid', GEO.box, P.woodDark, T(base, hx + 1.21, H + 1.0, -0.6, 0, 0, 0, 0.04, 1.4, 0.7));
  // 绳梯（从平台边缘垂到地面）
  const lz = R2 - 0.2;
  for (const sx of [-0.3, 0.3]) b.segment('solid', P.creamDark, base, [sx, H, lz], [sx, 0, lz + 0.4], 0.03, GEO.cyl6);
  for (let y = 0.4; y < H; y += 0.45) b.add('solid', GEO.box, P.wood, T(base, 0, y, lz + 0.4 * (1 - y / H), 0, 0, 0, 0.7, 0.05, 0.08));
  // 挂灯串
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.add('glow', GEO.sphereLo, i % 2 ? P.glowWarm : P.glowMint, T(base, Math.cos(a) * (R2 - 0.1), H + 1.05, Math.sin(a) * (R2 - 0.1), 0, 0, 0, 0.1)); }
}

/** 石灯笼 */
export function stoneLantern(b, base) {
  b.add('flat', GEO.cyl6, P.stoneDark, T(base, 0, 0.12, 0, 0, 0, 0, 0.38, 0.24, 0.38));
  b.add('flat', GEO.cyl6, P.stone, T(base, 0, 0.6, 0, 0, 0, 0, 0.12, 0.8, 0.12));
  b.add('flat', GEO.box, P.stone, T(base, 0, 1.05, 0, 0, 0, 0, 0.5, 0.1, 0.5));
  b.add('glow', GEO.box, 0xffe2a8, T(base, 0, 1.28, 0, 0, Math.PI / 4, 0, 0.3, 0.32, 0.3));
  b.add('flat', GEO.cone6, P.stoneDark, T(base, 0, 1.6, 0, 0, 0, 0, 0.5, 0.35, 0.5));
  b.add('flat', GEO.sphereLo, P.stone, T(base, 0, 1.82, 0, 0, 0, 0, 0.08));
}
