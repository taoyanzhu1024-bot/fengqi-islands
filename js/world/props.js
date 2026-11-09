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
