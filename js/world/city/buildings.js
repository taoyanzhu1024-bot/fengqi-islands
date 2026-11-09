// ============================================================
// 城市建筑生成器（程序化建模）
// 每栋建筑有：石砌基座、分层墙体与出挑楼层、腰线、角石、带窗框/窗台/百叶/花箱的窗户、
// 拱门与门廊、商铺橱窗与条纹遮阳棚、挂牌、阳台、挑檐屋顶（双坡/四坡/塔楼尖顶）、老虎窗、烟囱
// 同时向 lo（远景批处理）写入简化体块，供 LOD 切换使用
// 约定：base 为建筑局部矩阵，正面朝 +Z，原点在地面中心
// ============================================================
import * as THREE from 'three';
import { GEO, T } from '../../core/batcher.js';
import { mulberry32 } from '../../core/noise.js';

export const CC = {
  wall: [0xf6eedd, 0xf3e6cf, 0xefe2d0, 0xf8f1e4, 0xeedfc6],
  stone: 0xd9ccb4, stoneDark: 0xb9ab95, white: 0xf7f3ea,
  wood: 0x9a6e52, woodDark: 0x6f4f3d, woodLight: 0xc0946c,
  roof: [0xe2bd6e, 0xd9a65a, 0xe39a86, 0x8fae8a, 0x94adc6, 0xe7c98c],
  gold: 0xd6aa55, copper: 0xc58a5a, sage: 0x8fae8a, blue: 0x7f9bb8, coral: 0xe39a86,
  glass: 0xf3d9a6, flower: [0xf0b4c2, 0xf6e6d2, 0xbcb0dc, 0xf2d98a, 0xeea58f],
  awning: [[0xf3ead8, 0xe39a86], [0xf3ead8, 0x8fae8a], [0xf3ead8, 0x94adc6], [0xf6e1a8, 0xd9a65a]],
};
export const ARCH = new THREE.TorusGeometry(1, 0.09, 6, 14, Math.PI);
const pick = (arr, r) => arr[Math.floor(r() * arr.length)];

function windowUnit(b, base, x, y, z, ry, o, r) {
  const w = o.ww ?? 0.95, h = o.wh ?? 1.25;
  const M = (...a) => T(base, x, y, z, 0, ry, 0).multiply(new THREE.Matrix4().compose(
    new THREE.Vector3(a[0], a[1], a[2]), new THREE.Quaternion(), new THREE.Vector3(a[3], a[4], a[5])));
  b.add('glow', GEO.box, CC.glass, M(0, 0, -0.02, w, h, 0.06));                       // 透出暖光的玻璃
  if (o.lite) {                                                                       // 背面/侧面：简化窗
    b.add('solid', GEO.box, o.trim, M(0, 0, -0.04, w + 0.22, h + 0.2, 0.05));
    b.add('flat', GEO.box, CC.stone, M(0, -h / 2 - 0.08, 0.08, w + 0.3, 0.1, 0.2));
    return;
  }
  b.add('solid', GEO.box, o.trim, M(0, 0, 0.03, w + 0.16, 0.09, 0.08));              // 中梃（横）
  b.add('solid', GEO.box, o.trim, M(0, 0, 0.03, 0.07, h, 0.08));                     // 中梃（竖）
  for (const sx of [-1, 1]) b.add('solid', GEO.box, o.trim, M(sx * (w / 2 + 0.05), 0, 0.03, 0.1, h + 0.12, 0.12));
  b.add('solid', GEO.box, o.trim, M(0, h / 2 + 0.06, 0.03, w + 0.2, 0.1, 0.12));
  if (o.arch) b.add('solid', ARCH, o.trim, T(base, x, y + h / 2, z + 0.03, 0, ry, 0).multiply(new THREE.Matrix4().makeScale(w / 2 + 0.05, w / 2 * 0.8, 1.2)));
  b.add('flat', GEO.box, CC.stone, M(0, -h / 2 - 0.08, 0.1, w + 0.34, 0.1, 0.24));    // 窗台
  if (o.shutter) for (const sx of [-1, 1]) {
    b.add('solid', GEO.box, o.shutter, M(sx * (w / 2 + 0.36), 0, 0.06, 0.5, h + 0.05, 0.05));
  }
  if (o.box && r() < 0.65) {
    b.add('solid', GEO.box, CC.woodDark, M(0, -h / 2 - 0.3, 0.22, w + 0.1, 0.28, 0.3));
    for (let k = 0; k < 4; k++) b.add('swaySoft', GEO.ico, pick(CC.flower, r), M((k - 1.5) * w * 0.26, -h / 2 - 0.1, 0.25, 0.17, 0.13, 0.15));
    b.add('swaySoft', GEO.ico, 0x7f9f78, M(0, -h / 2 - 0.15, 0.2, w * 0.5, 0.1, 0.16));
  }
}

/**
 * 城市房屋
 * o: { w, d, floors, seed, roof:'gable'|'hip'|'turret', shop, balcony, wall, roofColor }
 */
export function townhouse(b, lo, base, o = {}) {
  const r = mulberry32(o.seed ?? 1);
  const w = o.w ?? 5 + r() * 3, d = o.d ?? 4.5 + r() * 2;
  const floors = o.floors ?? 1 + Math.floor(r() * 3);
  const FH = 3.1;
  const wall = o.wall ?? pick(CC.wall, r), trim = o.trim ?? pick([CC.wood, CC.woodDark, CC.woodLight], r);
  const roofC = o.roofColor ?? pick(CC.roof, r);
  const shutter = r() < 0.6 ? pick([CC.sage, CC.blue, 0xb8a07c, CC.coral], r) : null;
  const roofType = o.roof ?? (r() < 0.55 ? 'gable' : r() < 0.6 ? 'hip' : 'turret');
  // 基座
  b.add('flat', GEO.box, CC.stone, T(base, 0, 0.3, 0, 0, 0, 0, w + 0.4, 0.75, d + 0.4));
  b.add('flat', GEO.box, CC.stoneDark, T(base, 0, 0.7, 0, 0, 0, 0, w + 0.5, 0.1, d + 0.5));
  let y = 0.7, jw = w, jd = d;
  for (let f = 0; f < floors; f++) {
    if (f > 0) { jw += 0.25; jd += 0.25; }                      // 上层出挑
    b.add('solid', GEO.box, f === 0 && o.shop ? CC.white : wall, T(base, 0, y + FH / 2, 0, 0, 0, 0, jw, FH, jd));
    // 角石（底层）或木构角柱（上层）
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      if (f === 0) for (let k = 0; k < 4; k += 2) b.add('flat', GEO.box, CC.stone, T(base, sx * (jw / 2 - 0.12), y + 0.4 + k * 0.72, sz * (jd / 2 - 0.12), 0, 0, 0, k % 2 ? 0.34 : 0.46, 0.34, k % 2 ? 0.46 : 0.34));
      else b.add('solid', GEO.box, trim, T(base, sx * jw / 2, y + FH / 2, sz * jd / 2, 0, 0, 0, 0.22, FH, 0.22));
    }
    // 腰线
    b.add('solid', GEO.box, f === 0 ? CC.stone : trim, T(base, 0, y + FH - 0.08, 0, 0, 0, 0, jw + 0.18, 0.16, jd + 0.18));
    // 正面与背面窗户
    const n = Math.max(1, Math.floor((jw - 0.6) / 1.9));
    for (const side of [1, -1]) {
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * ((jw - 0.6) / n);
        if (f === 0 && side === 1 && Math.abs(x) < 1.2 && !o.shop) continue; // 留给大门
        if (f === 0 && side === 1 && o.shop) continue;
        windowUnit(b, base, x, y + FH * 0.52, side * (jd / 2 + 0.01), side > 0 ? 0 : Math.PI, { trim, shutter, box: side > 0, arch: f === 0 && r() < 0.5, lite: side < 0 }, r);
      }
    }
    // 侧面窗
    const m = Math.max(1, Math.floor((jd - 0.6) / 2.2));
    for (const side of [1, -1]) for (let i = 0; i < m; i++) {
      const z = (i - (m - 1) / 2) * ((jd - 0.6) / m);
      windowUnit(b, base, side * (jw / 2 + 0.01), y + FH * 0.52, z, side * Math.PI / 2, { trim, shutter: null, box: false, ww: 0.8, wh: 1.1, lite: true }, r);
    }
    // 阳台（二层正面）
    if (f === 1 && (o.balcony ?? r() < 0.5)) {
      const bw = Math.min(jw - 1, 3.2);
      b.add('flat', GEO.box, CC.stone, T(base, 0, y + 0.1, jd / 2 + 0.55, 0, 0, 0, bw, 0.18, 1.1));
      for (let k = 0; k < 3; k++) b.add('solid', GEO.box, CC.stoneDark, T(base, (k - 1) * bw * 0.4, y - 0.15, jd / 2 + 0.4, 0.5, 0, 0, 0.16, 0.5, 0.16));
      for (let px = -bw / 2; px <= bw / 2 + 0.01; px += bw / 6) b.add('solid', GEO.cyl6, CC.gold, T(base, px, y + 0.6, jd / 2 + 1.05, 0, 0, 0, 0.03, 0.85, 0.03));
      b.add('solid', GEO.box, CC.gold, T(base, 0, y + 1.03, jd / 2 + 1.05, 0, 0, 0, bw + 0.05, 0.06, 0.06));
      for (const sx of [-1, 1]) b.add('swaySoft', GEO.ico, 0x86a77e, T(base, sx * (bw / 2 - 0.3), y + 0.5, jd / 2 + 0.75, 0, 0, 0, 0.35, 0.3, 0.3));
      b.add('solid', GEO.box, trim, T(base, 0, y + 1.1, jd / 2 + 0.03, 0, 0, 0, 1.0, 2.0, 0.08));
    }
    y += FH;
  }
  // 大门 / 商铺
  const fz = d / 2 + 0.02;
  if (o.shop) {
    const sw = Math.min(w - 1.2, 4.2);
    b.add('glow', GEO.box, 0xf6e2b6, T(base, -0.6, 0.7 + 1.35, fz, 0, 0, 0, sw - 1.4, 1.6, 0.06));
    b.add('solid', GEO.box, trim, T(base, -0.6, 0.7 + 0.45, fz + 0.06, 0, 0, 0, sw - 1.2, 0.6, 0.14));
    b.add('solid', GEO.box, trim, T(base, -0.6, 0.7 + 2.2, fz + 0.06, 0, 0, 0, sw - 1.2, 0.12, 0.14));
    for (let k = 0; k < 3; k++) b.add('solid', GEO.box, trim, T(base, -0.6 + (k - 1) * (sw - 1.4) / 2, 0.7 + 1.35, fz + 0.05, 0, 0, 0, 0.07, 1.6, 0.1));
    // 橱窗里的商品
    for (let k = 0; k < 4; k++) b.add('solid', k % 2 ? GEO.cyl8 : GEO.box, pick([CC.coral, CC.gold, CC.sage, CC.blue, 0xf0b4c2], r), T(base, -0.6 + (k - 1.5) * 0.6, 0.7 + 0.95, fz - 0.25, 0, r(), 0, 0.22, 0.3 + r() * 0.2, 0.22));
    // 店门
    b.add('solid', GEO.box, CC.woodDark, T(base, sw / 2 - 0.2, 0.7 + 1.1, fz, 0, 0, 0, 0.95, 2.2, 0.08));
    b.add('glow', GEO.box, 0xf6e2b6, T(base, sw / 2 - 0.2, 0.7 + 1.65, fz + 0.02, 0, 0, 0, 0.55, 0.6, 0.05));
    // 条纹遮阳棚
    const [a1, a2] = pick(CC.awning, r);
    const strips = 7;
    for (let k = 0; k < strips; k++) {
      const sx = (k - (strips - 1) / 2) * (sw / strips);
      b.add('solid', GEO.box, k % 2 ? a2 : a1, T(base, sx, 0.7 + 2.75, fz + 0.75, -0.42, 0, 0, sw / strips + 0.01, 0.06, 1.6));
      b.add('solid', GEO.box, k % 2 ? a2 : a1, T(base, sx, 0.7 + 2.27, fz + 1.48, 0, 0, 0, sw / strips + 0.01, 0.3, 0.04));
    }
    for (const sx of [-1, 1]) b.add('solid', GEO.cyl6, CC.gold, T(base, sx * sw / 2, 0.7 + 2.4, fz + 0.75, -1.1, 0, 0, 0.025, 1.7, 0.025));
    // 挂牌
    b.add('solid', GEO.box, CC.gold, T(base, w / 2 - 0.1, 0.7 + 3.2, fz + 0.55, 0, 0, 0, 0.04, 0.04, 1.1));
    b.add('solid', GEO.box, pick([CC.woodLight, CC.sage, CC.coral], r), T(base, w / 2 - 0.1, 0.7 + 2.75, fz + 0.75, 0, 0, 0, 0.08, 0.6, 0.75));
    b.add('solid', GEO.sphereLo, CC.gold, T(base, w / 2 - 0.05, 0.7 + 2.75, fz + 0.75, 0, 0, 0, 0.12, 0.12, 0.05));
  } else {
    b.add('solid', GEO.box, trim, T(base, 0, 0.7 + 1.1, fz + 0.02, 0, 0, 0, 1.45, 2.3, 0.14));
    b.add('solid', GEO.box, pick([CC.sage, CC.blue, CC.woodDark, CC.coral], r), T(base, 0, 0.7 + 1.05, fz + 0.05, 0, 0, 0, 1.15, 2.1, 0.08));
    b.add('solid', ARCH, trim, T(base, 0, 0.7 + 2.2, fz + 0.05, 0, 0, 0, 0.66, 0.5, 1.4));
    b.add('glow', GEO.box, 0xf6e2b6, T(base, 0, 0.7 + 2.35, fz + 0.04, 0, 0, 0, 0.8, 0.22, 0.04));
    b.add('solid', GEO.sphereLo, CC.gold, T(base, 0.38, 0.7 + 1.05, fz + 0.12, 0, 0, 0, 0.06));
    b.add('flat', GEO.box, CC.stone, T(base, 0, 0.45, fz + 0.5, 0, 0, 0, 1.9, 0.18, 0.8));
    // 门廊小雨棚 + 门灯
    b.add('flat', GEO.prism, pick(CC.roof, r), T(base, 0, 0.7 + 2.85, fz + 0.45, 0, Math.PI / 2, 0, 0.55, 0.4, 1.8));
    for (const sx of [-1, 1]) b.add('solid', GEO.box, trim, T(base, sx * 0.8, 0.7 + 2.55, fz + 0.4, 0.7, 0, 0, 0.08, 0.6, 0.08));
    b.add('glow', GEO.sphereLo, 0xffdca0, T(base, 1.05, 0.7 + 2.2, fz + 0.18, 0, 0, 0, 0.13));
  }
  // 屋顶
  const ow = jw + 0.9, od = jd + 0.9;   // 挑檐
  if (roofType === 'gable' || roofType === 'turret') {
    const rh = Math.min(jw, 6) * 0.48;
    b.add('flat', GEO.prism, roofC, T(base, 0, y + rh / 3, 0, 0, 0, 0, ow / 1.732, rh / 1.5, od));
    b.add('solid', GEO.box, CC.woodDark, T(base, 0, y + rh + 0.02, 0, 0, 0, 0, 0.2, 0.16, od + 0.05)); // 屋脊
    for (const sz of [-1, 1]) b.add('solid', GEO.prism, wall, T(base, 0, y + rh / 3 - 0.05, sz * (jd / 2 - 0.02), 0, 0, 0, jw / 1.732, (rh - 0.15) / 1.5, 0.08)); // 山墙
    // 山墙圆窗
    b.add('glow', GEO.cyl12, CC.glass, T(base, 0, y + rh * 0.38, jd / 2 + 0.04, Math.PI / 2, 0, 0, 0.36, 0.06, 0.36));
    b.add('solid', GEO.torus, trim, T(base, 0, y + rh * 0.38, jd / 2 + 0.07, 0, 0, 0, 0.4, 0.4, 1.4));
    // 老虎窗（坐落在两侧坡面上）
    if (jw > 5.5 && r() < 0.6) for (const sx of [-1, 1]) for (const dz of jd > 6 ? [-1.4, 1.4] : [0]) {
      const dx = sx * jw * 0.22, dy = y + rh * 0.42;
      b.add('solid', GEO.box, wall, T(base, dx, dy, dz, 0, 0, 0, 1.1, 1.1, 1.0));
      b.add('flat', GEO.prism, roofC, T(base, dx, dy + 0.75, dz, 0, Math.PI / 2, 0, 0.75, 0.5, 1.5));
      windowUnit(b, base, dx + sx * 0.56, dy - 0.05, dz, sx * Math.PI / 2, { trim, shutter: null, box: false, ww: 0.6, wh: 0.7 }, r);
    }
    if (roofType === 'turret') {
      const tx = (r() < 0.5 ? -1 : 1) * (jw / 2), tz = jd / 2, tr = 1.3, th = y + 2.2;
      b.add('solid', GEO.cyl12, wall, T(base, tx, th / 2, tz, 0, 0, 0, tr, th, tr));
      b.add('solid', GEO.cyl12, CC.stone, T(base, tx, th, tz, 0, 0, 0, tr + 0.12, 0.16, tr + 0.12));
      b.add('flat', GEO.cone12, roofC, T(base, tx, th + 1.7, tz, 0, 0, 0, tr + 0.3, 3.4, tr + 0.3));
      b.add('solid', GEO.cyl6, CC.gold, T(base, tx, th + 3.7, tz, 0, 0, 0, 0.04, 0.9, 0.04));
      for (let k = 0; k < 3; k++) {
        const a = Math.PI / 2 + (k - 1) * 0.9;
        b.add('glow', GEO.box, CC.glass, T(base, tx + Math.cos(a) * tr, th - 1.4 - (k % 2) * 1.6, tz + Math.sin(a) * tr, 0, -a + Math.PI / 2, 0, 0.5, 0.9, 0.08));
      }
    }
  } else {
    const rh = Math.min(jw, jd) * 0.55;
    b.add('flat', GEO.cone4, roofC, T(base, 0, y + rh / 2, 0, 0, Math.PI / 4, 0, ow * 0.72, rh, od * 0.72));
    b.add('solid', GEO.sphereLo, CC.gold, T(base, 0, y + rh + 0.1, 0, 0, 0, 0, 0.18));
  }
  b.add('flat', GEO.box, CC.stone, T(base, jw * 0.28, y + 1.2, -jd * 0.18, 0, 0, 0, 0.6, 2.4, 0.6));
  b.add('flat', GEO.box, CC.stoneDark, T(base, jw * 0.28, y + 2.45, -jd * 0.18, 0, 0, 0, 0.8, 0.14, 0.8));
  // —— 远景体块 ——
  if (lo) {
    lo.add('solid', GEO.box, wall, T(base, 0, (y + 0.7) / 2, 0, 0, 0, 0, jw, y, jd));
    lo.add('glow', GEO.box, CC.glass, T(base, 0, y * 0.55, jd / 2 + 0.02, 0, 0, 0, jw * 0.6, y * 0.3, 0.05));
    if (roofType === 'hip') lo.add('flat', GEO.cone4, roofC, T(base, 0, y + 1.4, 0, 0, Math.PI / 4, 0, ow * 0.72, 2.8, od * 0.72));
    else lo.add('flat', GEO.prism, roofC, T(base, 0, y + 0.9, 0, 0, 0, 0, ow / 1.732, 1.8, od));
  }
  return { w: jw, d: jd, h: y };
}

/** 拱廊：一排柱子 + 半圆拱 + 檐口 */
export function arcade(b, base, n, span = 3, h = 4, o = {}) {
  const col = o.color ?? CC.white;
  for (let i = 0; i <= n; i++) {
    const x = (i - n / 2) * span;
    b.add('flat', GEO.box, CC.stone, T(base, x, 0.25, 0, 0, 0, 0, 0.7, 0.5, 0.7));
    b.add('solid', GEO.cyl12, col, T(base, x, h / 2, 0, 0, 0, 0, 0.24, h, 0.24));
    b.add('solid', GEO.box, CC.gold, T(base, x, h - 0.1, 0, 0, 0, 0, 0.55, 0.2, 0.55));
    if (i < n) b.add('solid', ARCH, col, T(base, x + span / 2, h, 0, 0, 0, 0, span / 2, span / 2 * 0.8, 3));
  }
  b.add('solid', GEO.box, col, T(base, 0, h + span * 0.45, 0, 0, 0, 0, n * span + 0.8, 0.5, 0.9));
  b.add('solid', GEO.box, CC.gold, T(base, 0, h + span * 0.45 + 0.3, 0, 0, 0, 0, n * span + 1, 0.1, 1.0));
}

/** 尖塔：多层圆塔 + 环形阳台 + 拱窗 + 尖顶 */
export function spire(b, lo, base, o = {}) {
  const R = o.r ?? 4, H = o.h ?? 30, tiers = o.tiers ?? 3;
  const roof = o.roof ?? CC.roof[0];
  let y = 0, rr = R;
  for (let t = 0; t < tiers; t++) {
    const th = H / tiers * (t === 0 ? 1.2 : 0.9);
    b.add('solid', new THREE.CylinderGeometry(rr * 0.92, rr, th, 20), CC.white, T(base, 0, y + th / 2, 0));
    b.add('solid', GEO.cyl16, CC.gold, T(base, 0, y + th, 0, 0, 0, 0, rr + 0.35, 0.22, rr + 0.35));
    b.add('flat', GEO.cyl16, CC.stone, T(base, 0, y + th - 0.25, 0, 0, 0, 0, rr + 0.25, 0.35, rr + 0.25));
    // 环形阳台栏杆
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      b.add('solid', GEO.cyl6, CC.gold, T(base, Math.cos(a) * (rr + 0.3), y + th + 0.45, Math.sin(a) * (rr + 0.3), 0, 0, 0, 0.04, 0.8, 0.04));
    }
    b.add('solid', GEO.torus, CC.gold, T(base, 0, y + th + 0.85, 0, Math.PI / 2, 0, 0, rr + 0.3, rr + 0.3, 0.6));
    // 拱窗
    const nw = Math.max(4, Math.round(rr * 1.6));
    for (let k = 0; k < nw; k++) {
      const a = (k / nw) * Math.PI * 2 + t * 0.3;
      const x = Math.cos(a) * rr * 0.96, z = Math.sin(a) * rr * 0.96;
      b.add('glow', GEO.box, CC.glass, T(base, x, y + th * 0.5, z, 0, -a + Math.PI / 2, 0, 0.8, th * 0.32, 0.12));
      b.add('solid', ARCH, CC.gold, T(base, x * 1.01, y + th * 0.5 + th * 0.16, z * 1.01, 0, -a + Math.PI / 2, 0, 0.42, 0.36, 1.4));
    }
    y += th; rr *= 0.72;
  }
  b.add('flat', GEO.cone16 ?? GEO.cone12, roof, T(base, 0, y + rr * 2.2, 0, 0, 0, 0, rr * 1.35, rr * 4.4, rr * 1.35));
  b.add('solid', GEO.sphereLo, CC.gold, T(base, 0, y + rr * 4.5, 0, 0, 0, 0, 0.45));
  b.add('solid', GEO.cyl6, CC.gold, T(base, 0, y + rr * 4.5 + 2, 0, 0, 0, 0, 0.08, 4, 0.08));
  if (lo) {
    lo.add('solid', GEO.cyl12, CC.white, T(base, 0, y / 2, 0, 0, 0, 0, R * 0.85, y, R * 0.85));
    lo.add('flat', GEO.cone12, roof, T(base, 0, y + rr * 2.2, 0, 0, 0, 0, rr * 1.35, rr * 4.4, rr * 1.35));
  }
  return { top: y + rr * 4.5 + 4 };
}
