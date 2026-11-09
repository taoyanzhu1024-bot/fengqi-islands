// ============================================================
// V2 岛屿细节：每座岛的生活气息（居民、集市、花园、树屋、雪人……）
// 在各岛 populate 的末尾调用；所有道具通过 isFree/keep 避开已有建筑与小路
// ============================================================
import * as THREE from 'three';
import { GEO, T, blob } from '../../core/batcher.js';
import { PALETTE as P } from '../../config.js';
import * as pr from '../props.js';
import { Residents } from '../city/residents.js';
import { Swarm } from '../particles.js';

/** 在 (cx,cz) 半径 R 内找一个空位（远离岛缘、小路与已有物体） */
export function spot(isl, cx, cz, R, clear = 2, pathClear = 2.2, tries = 90) {
  const r = isl.rand;
  for (let i = 0; i < tries; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (Math.hypot(x, z) > isl.rim(Math.atan2(z, x)) - 6) continue;
    if (isl.localHeight(x, z) === null || !isl.isFree(x, z, clear, pathClear)) continue;
    return [x, z];
  }
  return null;
}

/** 放置一个道具：找空位 → 建模 → 预留空间 → 碰撞 */
function put(isl, ctx, cx, cz, R, clear, collideR, build, ry) {
  const p = spot(isl, cx, cz, R, clear);
  if (!p) return null;
  const [x, z] = p, rot = typeof ry === 'function' ? ry(x, z) : ry ?? isl.rand() * Math.PI * 2;
  build(ctx.at(isl, x, z, rot, -0.05), x, z, rot);
  isl.keep.push({ x, z, r: clear });
  if (collideR > 0) ctx.collide(isl, x, z, collideR, 3);
  return p;
}
const faceTo = (tx, tz) => (x, z) => Math.atan2(tx - x, tz - z);

/** 岛上的居民：沿已有小路来回散步（复用天空之城的实例化居民） */
function villagers(isl, ctx, pathIdx, count, seed) {
  const C0 = isl.center, routes = [];
  for (const i of pathIdx) {
    const p = isl.paths[i]; if (!p) continue;
    const pts = p.pts.filter((_, k) => k % 3 === 0);
    if (pts.length < 3) continue;
    routes.push(pts.concat([...pts].reverse().slice(1, -1)).map(([x, z]) => new THREE.Vector3(x + C0.x, 0, z + C0.z)));
  }
  if (!routes.length) return null;
  const ph = ctx.world.physics;
  const heightAt = (x, z) => { const g = (isl.localHeight(x - C0.x, z - C0.z) ?? 0) + C0.y; const s = ph.groundAt(x, z, g + 1.2, 1.5); return isFinite(s) ? Math.max(s, g) : g; };
  const res = new Residents(ctx.scene, routes, heightAt, { count, seed });
  (ctx.world.villagers ||= []).push(res);
  ctx.anim.push((dt, t) => { const cam = ctx.world.camera; if (cam) res.update(dt, t, ctx.world.dn?.night ?? 0, cam.position); });
  return res;
}

/** 菜园：几垄蔬菜 */
function garden(b, base, w = 6, d = 4) {
  b.add('flat', GEO.box, P.soil, T(base, 0, 0.04, 0, 0, 0, 0, w, 0.1, d));
  for (let i = 0; i < 4; i++) {
    const z = -d / 2 + 0.6 + i * (d - 1.2) / 3;
    b.add('flat', GEO.box, 0x8f6c58, T(base, 0, 0.1, z, 0, 0, 0, w - 0.4, 0.12, 0.45));
    for (let x = -w / 2 + 0.5; x < w / 2 - 0.3; x += 0.55) {
      if (i % 2) b.add('sway', blob((x * 7) & 3, 0, 0.3), i === 1 ? 0x8fb36a : 0x6f9a5a, T(base, x, 0.3, z, 0, x, 0, 0.24, 0.2, 0.24));
      else { b.add('sway', GEO.cone6, 0x7fae5a, T(base, x, 0.35, z, 0, 0, 0, 0.08, 0.35, 0.08)); b.add('solid', GEO.cone6, 0xe8894f, T(base, x, 0.12, z, Math.PI, 0, 0, 0.06, 0.12, 0.06)); }
    }
  }
}

const H = (isl, x, z) => isl.localHeight(x, z) ?? 0;

export const DETAILS = {
  // —— 风栖主岛：村舍生活 ——
  main(isl, ctx, b, theme) {
    const [hx, hz] = [30, 26];
    put(isl, ctx, 21, 35, 6, 1.8, 1.2, (m) => pr.well(b, m));
    put(isl, ctx, 39, 19, 5, 3, 0, (m) => pr.laundry(b, m, 4.6), faceTo(hx, hz));
    for (let i = 0; i < 3; i++) put(isl, ctx, hx + (i - 1) * 3, hz + 4.6, 2.5, 1.2, 0, (m) => pr.planter(b, m, 1.6, undefined, i + 3), 0.25);
    put(isl, ctx, 25, 40, 4, 0.8, 0.2, (m) => pr.mailbox(b, m), faceTo(hx, hz + 8));
    put(isl, ctx, -9, -3, 5, 1.6, 0, (m) => pr.picnic(b, m));
    put(isl, ctx, -39, 27, 5, 1.8, 1.4, (m) => pr.cart(b, m, 'hay', 7));
    const g = put(isl, ctx, -36, 6, 7, 4, 0, (m) => garden(b, m, 6, 4));
    if (g) put(isl, ctx, g[0] + 3.5, g[1] + 2.5, 2, 0.8, 0.2, (m) => pr.scarecrow(b, m), faceTo(0, 0));
    put(isl, ctx, -26, -26, 6, 2, 0.6, (m) => pr.logPile(b, m));
    pr.footbridge(b, ctx.at(isl, -46, 52, Math.atan2(12, 8)), 5, 1.4, 0.45);
    // 彩旗：小屋屋檐 → 金叶古树
    pr.bunting(b, new THREE.Matrix4(), [hx - 3, H(isl, hx, hz) + 3.4, hz - 1], [-14, H(isl, -14, -9) + 6.5, -9], 18);
    for (let i = 0; i < 5; i++) put(isl, ctx, isl.rand() * 120 - 60, isl.rand() * 120 - 60, 20, 1.2, 0, (m) => pr.stump(b, m, 0.8 + isl.rand() * 0.5));
    villagers(isl, ctx, [0, 1, 2, 4], 6, 101);
    ctx.scene.add(new Swarm({ count: 60, center: isl.center.clone().add(new THREE.Vector3(hx, H(isl, hx, hz) + 2, hz + 4)), box: new THREE.Vector3(18, 4, 14), vel: new THREE.Vector3(0.6, 0.2, 0.4), size: 0.28, colorA: 0xfff6d8, colorB: 0xf6d77a, jitter: 2.6, seed: 77 }).points);
  },

  // —— 花海岛：花农与花市 ——
  flower(isl, ctx, b, theme) {
    for (let i = 0; i < 4; i++) put(isl, ctx, 31 + i * 1.6, 37.5, 1.5, 0.7, 0.3, (m) => pr.skep(b, m), 0);
    const st = isl.station.local;
    // 花拱门跨在“车站 → 凉亭”小路第一段的中点（局部 +Z 沿小路）
    const tx = st.x * 0.75, tz = st.z * 0.75 + 3;
    pr.trellis(b, ctx.at(isl, tx, tz, Math.atan2(-st.x * 0.5, -st.z * 0.5 + 6)), 2.8, 2.8, [P.pink, 0xffffff, P.coralSoft], 8);
    put(isl, ctx, -2, -9, 6, 1.6, 0, (m) => pr.picnic(b, m));
    put(isl, ctx, st.x * 0.5 + 4, st.z * 0.5 + 9, 6, 1.8, 1.3, (m) => pr.cart(b, m, 'flowers', 9));
    put(isl, ctx, PAVX + 9, PAVZ + 3, 5, 2.2, 1.3, (m) => pr.stall(b, m, P.pink, 'flowers', 5), faceTo(PAVX, PAVZ));
    for (let i = 0; i < 3; i++) put(isl, ctx, isl.rand() * 100 - 50, isl.rand() * 100 - 50, 25, 1.4, 0, (m) => pr.bench(b, m));
    for (let i = 0; i < 6; i++) put(isl, ctx, isl.rand() * 100 - 50, isl.rand() * 100 - 50, 30, 1.1, 0, (m) => pr.planter(b, m, 1.4, [P.pink, P.lavender, P.butter], 20 + i));
    villagers(isl, ctx, [0, 1], 4, 202);
    ctx.scene.add(new Swarm({ count: 90, center: isl.center.clone().add(new THREE.Vector3(0, 4, 0)), box: new THREE.Vector3(120, 5, 120), vel: new THREE.Vector3(0.5, 0.15, 0.3), size: 0.3, colorA: 0xffffff, colorB: 0xf6d77a, jitter: 3, seed: 88 }).points);
  },

  // —— 云港岛：广场集市、行李车、旅客 ——
  port(isl, ctx, b) {
    const cx = 5, cz = -5;
    const cols = [P.coral, 0x94adc6, P.sageDark, P.butter, P.coralSoft];
    const goods = ['fruit', 'goods', 'flowers', 'goods', 'fruit'];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.6;
      put(isl, ctx, cx + Math.cos(a) * 18.5, cz + Math.sin(a) * 18.5, 2.5, 2.0, 1.3, (m) => pr.stall(b, m, cols[i], goods[i], 30 + i), faceTo(cx, cz));
    }
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 8; put(isl, ctx, cx + Math.cos(a) * 9, cz + Math.sin(a) * 9, 1.5, 1.2, 0, (m) => pr.bench(b, m), faceTo(cx, cz)); }
    const th = H(isl, cx, cz);
    for (let i = 0; i < 8; i += 2) { const a = (i / 8) * Math.PI * 2; pr.bunting(b, new THREE.Matrix4(), [cx, th + 9.5, cz], [cx + Math.cos(a) * 15, H(isl, cx + Math.cos(a) * 15, cz + Math.sin(a) * 15) + 3.6, cz + Math.sin(a) * 15], 14); }
    const st = isl.station.local;
    for (let i = 0; i < 2; i++) put(isl, ctx, st.x * 0.75, st.z * 0.75, 7, 1.8, 1.2, (m) => pr.cart(b, m, 'crates', 40 + i));
    for (let i = 0; i < 6; i++) put(isl, ctx, isl.rand() * 100 - 50, isl.rand() * 100 - 50, 25, 1.1, 0, (m) => pr.planter(b, m, 1.4, undefined, 50 + i));
    put(isl, ctx, cx + 10, cz + 16, 5, 0.8, 0.2, (m) => pr.mailbox(b, m, 0x94adc6), faceTo(cx, cz));
    villagers(isl, ctx, isl.paths.map((_, i) => i), 9, 303);
  },

  // —— 森林岛：树屋、伐木小屋、精灵蘑菇圈 ——
  forest(isl, ctx, b, theme) {
    const g = theme.giants, gr = theme.giantInfo ?? [];
    const [tx, tz] = g[1], ti = gr[1] ?? { R: 3, H: 40 };
    pr.treehouse(b, ctx.at(isl, tx, tz, 0.6, -0.5), ti.R * 1.05, Math.min(14, ti.H * 0.34));
    const [t2x, t2z] = g[4], t2 = gr[4] ?? { R: 3, H: 40 };
    pr.treehouse(b, ctx.at(isl, t2x, t2z, 2.4, -0.5), t2.R * 1.05, Math.min(11, t2.H * 0.28), { roof: P.sageDark, wall: 0xf1e0c8 });
    const cab = put(isl, ctx, -28, -16, 12, 4.2, 3.2, (m) => {
      const ch = pr.cabin(b, m, { w: 5, d: 4, roof: 0x7d6656 });
      ctx.scene.add(chimney(isl, ch, 0xd9d4cc));
    });
    if (cab) { put(isl, ctx, cab[0] + 4.5, cab[1] + 2, 3, 1.4, 1.0, (m) => pr.logPile(b, m, 6)); put(isl, ctx, cab[0] - 4, cab[1] + 3, 3, 1, 0.5, (m) => pr.stump(b, m, 1.2)); }
    for (let i = 0; i < 9; i++) put(isl, ctx, isl.rand() * 140 - 70, isl.rand() * 140 - 70, 30, 1.2, 0, (m) => pr.stump(b, m, 0.7 + isl.rand() * 0.8));
    // 精灵蘑菇圈
    const ring = spot(isl, 38, 18, 14, 4.5);
    if (ring) {
      for (let i = 0; i < 11; i++) { const a = (i / 11) * Math.PI * 2; pr.mushroom(b, ctx.at(isl, ring[0] + Math.cos(a) * 3.2, ring[1] + Math.sin(a) * 3.2, a, -0.05), { h: 0.5 + (i % 3) * 0.2, s: 0.4, glow: true, cap: i % 2 ? P.glowMint : 0xc8b8ff }); }
      isl.keep.push({ x: ring[0], z: ring[1], r: 4.5 });
      ctx.scene.add(new Swarm({ count: 50, center: isl.center.clone().add(new THREE.Vector3(ring[0], H(isl, ...ring) + 1.5, ring[1])), box: new THREE.Vector3(7, 2.5, 7), vel: new THREE.Vector3(0, 0.3, 0), size: 0.35, colorA: 0xc8b8ff, colorB: 0xa8f2d6, shape: 2, additive: true, swirl: 1.2, jitter: 1, seed: 66 }).points);
    }
    pr.footbridge(b, ctx.at(isl, 40, 18.4, Math.atan2(-8, 22)), 4.5, 1.3, 0.4);   // 垂直于溪流
    // 林间吊灯
    const path = isl.paths[0];
    if (path) for (let k = 10; k < path.pts.length - 4; k += 14) {
      const [x, z] = path.pts[k], [x2, z2] = path.pts[k + 1];
      const nx = -(z2 - z), nz = x2 - x, l = Math.hypot(nx, nz) || 1, lx = x + (nx / l) * 2, lz = z + (nz / l) * 2;
      if (isl.localHeight(lx, lz) === null) continue;
      pr.lamp(b, ctx.at(isl, lx, lz), { h: 2.6, glow: P.glowMint });
    }
    villagers(isl, ctx, [0], 3, 404);
  },

  // —— 灯塔岛：守塔人的小院 ——
  lighthouse(isl, ctx, b, theme, info) {
    const LHX = -22, LHZ = 26, hx = LHX + 12, hz = LHZ - 6;
    for (let i = 0; i < 3; i++) put(isl, ctx, hx + 3, hz - 4 + i * 1.6, 3, 1.1, 0, (m) => pr.planter(b, m, 1.4, [0xffffff, P.lavender, P.butter], 60 + i), 1.9);
    put(isl, ctx, hx + 6, hz + 3, 5, 3, 0, (m) => pr.laundry(b, m, 4.2, [0xffffff, 0x94adc6, P.cream]), 1.9);
    const boat = put(isl, ctx, LHX + 6, LHZ - 22, 10, 2.6, 1.6, (m) => pr.rowboat(b, m));
    if (boat) for (let i = 0; i < 3; i++) {
      const bx = boat[0] + 2.2, bz = boat[1] - 1 + i * 0.7;
      b.add('solid', GEO.sphereLo, i % 2 ? 0xffffff : 0xe36a5a, T(ctx.at(isl, bx, bz), 0, 0.3, 0, 0, 0, 0, 0.3));
    }
    put(isl, ctx, hx - 3, hz + 7, 4, 0.8, 0.2, (m) => pr.mailbox(b, m, P.sageDark));
    put(isl, ctx, hx + 2, hz + 9, 6, 1.6, 0, (m) => pr.well(b, m, { roof: P.sageDark }), 0);
    const lhTop = H(isl, LHX, LHZ) + (info?.lanternY ?? 20) - 3;
    pr.bunting(b, new THREE.Matrix4(), [LHX + 1.5, lhTop, LHZ - 1], [hx, H(isl, hx, hz) + 3.6, hz], 16, [P.coral, 0xffffff, 0x94adc6]);
    villagers(isl, ctx, [0], 2, 505);
  },

  // —— 雪鸣岛：雪屋、雪人、冰湖与石灯笼 ——
  snow(isl, ctx, b, theme) {
    const [sx, sz] = theme.shrine;
    const cab = put(isl, ctx, 14, 36, 16, 4.5, 3.2, (m) => {
      const ch = pr.cabin(b, m, { w: 5.2, d: 4.2, roof: 0x8590b4, snow: true });
      ctx.scene.add(chimney(isl, ch, 0xeef0f6));
    }, (x, z) => Math.atan2(-x, -z));
    if (cab) { put(isl, ctx, cab[0] + 4, cab[1] - 2, 3, 1.4, 0.6, (m) => pr.sled(b, m)); put(isl, ctx, cab[0] - 4, cab[1] + 2, 3, 1.4, 1.0, (m) => pr.logPile(b, m, 5)); }
    for (let i = 0; i < 3; i++) put(isl, ctx, 20 + i * 8, 40 - i * 10, 10, 1.4, 0.7, (m) => pr.snowman(b, m, 0.8 + i * 0.15, [P.coral, 0x94adc6, P.butter][i]), (x, z) => Math.atan2(-x, -z));
    // 冰湖
    const pond = spot(isl, -5, 45, 18, 8, 3);
    if (pond) {
      const [px, pz] = pond, m = ctx.at(isl, px, pz, 0, 0.02);
      b.add('ice', GEO.cyl16, 0xcfe3f2, T(m, 0, 0, 0, 0, 0, 0, 7, 0.06, 5.2));
      b.add('flat', GEO.torus, 0xf4f5f9, T(m, 0, 0.05, 0, Math.PI / 2, 0, 0, 7.1, 5.3, 4));
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; pr.rock(b, ctx.at(isl, px + Math.cos(a) * 7.6, pz + Math.sin(a) * 5.8, a, -0.2), 0.6 + (i % 3) * 0.3, 0xdfe4ef, i); }
      isl.keep.push({ x: px, z: pz, r: 8 });
    }
    // 石灯笼：沿通往风铃神社的小路
    const path = isl.paths[0];
    if (path) for (let k = 8; k < path.pts.length - 3; k += 10) {
      const [x, z] = path.pts[k], [x2, z2] = path.pts[k + 1];
      const nx = -(z2 - z), nz = x2 - x, l = Math.hypot(nx, nz) || 1;
      for (const s of [-1, 1]) { const lx = x + (nx / l) * 1.9 * s, lz = z + (nz / l) * 1.9 * s; if (isl.localHeight(lx, lz) !== null) { pr.stoneLantern(b, ctx.at(isl, lx, lz, Math.atan2(nx, nz))); ctx.collide(isl, lx, lz, 0.35, 2); } }
    }
    // 经幡：神社两侧的木杆之间
    const a0 = [sx - 7, H(isl, sx - 7, sz - 4), sz - 4], a1 = [sx + 7, H(isl, sx + 7, sz - 4), sz - 4];
    for (const p of [a0, a1]) b.add('solid', GEO.cyl6, P.woodDark, T(new THREE.Matrix4(), p[0], p[1] + 2.4, p[2], 0, 0, 0, 0.08, 4.8, 0.08));
    pr.bunting(b, new THREE.Matrix4(), [a0[0], a0[1] + 4.6, a0[2]], [a1[0], a1[1] + 4.6, a1[2]], 14, [0xe36a5a, 0xf2d98a, 0x94adc6, 0xffffff, 0x8fae8a]);
    villagers(isl, ctx, [0], 3, 606);
  },
};
const PAVX = -10, PAVZ = -18;

/** 烟囱炊烟（小粒子柱） */
function chimney(isl, localTop, color) {
  const c = localTop.clone().add(isl.center);
  return new Swarm({ count: 28, center: c.clone().add(new THREE.Vector3(0.6, 4, 0.4)), box: new THREE.Vector3(1.6, 8, 1.6), vel: new THREE.Vector3(0.4, 1.4, 0.2), size: 0.9, colorA: color, colorB: 0xffffff, shape: 1, jitter: 0.5, opacity: 0.55, seed: 13 }).points;
}
