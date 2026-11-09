// ============================================================
// 天空之城 · 艾瑟兰（可到达、可探索的大型主城）
// 区域：A 中央广场（喷泉）/ B 云轨中央车站（拱形站厅 + 钟楼）/ C 空中商业街 /
//       D 空中花园（古树、远眺台）/ E 天空王庭（尖塔、拱廊、空中廊桥）/ 东侧飞艇港
// 细节网格按区域合批；相机远离时切换为远景体块（LOD）
// ============================================================
import * as THREE from 'three';
import { Batcher, GEO, T, blob } from '../../core/batcher.js';
import { smoothstep } from '../../core/utils.js';
import { mulberry32 } from '../../core/noise.js';
import { PALETTE as P } from '../../config.js';
import * as pr from '../props.js';
import { grassField, flowerField } from '../vegetation.js';
import { Swarm, waterfall, waterfallMat } from '../particles.js';
import { townhouse, arcade, spire, CC, ARCH } from '../city/buildings.js';
import { Residents } from '../city/residents.js';
import { planAirDock, buildAirDock } from '../airship.js';

const _c = new THREE.Color();
export const CITY = {
  plaza: [0, 20], plazaR: 34,
  court: [0, -150], courtR: 58, courtH: 16,
  garden: [-150, 10],
  portTh: -0.5,          // 东北岸飞艇港（面向云港岛方向）
};

const courtH = (x, z) => {
  const d = Math.hypot(x - CITY.court[0], z - CITY.court[1]);
  return CITY.courtH * (1 - smoothstep(CITY.courtR, CITY.courtR + 36, d));
};

export const cityTheme = {
  shape(isl, x, z) {
    const dg = Math.hypot(x - CITY.garden[0], z - CITY.garden[1]);
    const hills = isl.noise.fbm(x * 0.03 + 9, z * 0.03, 3) * 7 * (1 - smoothstep(40, 85, dg)) + 2.5 * (1 - smoothstep(0, 70, dg));
    return courtH(x, z) + hills;
  },
  color(isl, x, z, h, t, out) {
    const n = isl.noise.fbm(x * 0.05, z * 0.05, 3);
    out.set(0x9db58f).lerp(_c.set(0xc0d29c), smoothstep(-0.3, 0.6, n));
    const dp = Math.hypot(x - CITY.plaza[0], z - CITY.plaza[1]);
    if (dp < CITY.plazaR + 2) {             // 广场：同心环石板
      const ring = Math.floor(dp / 3.2) % 2;
      out.set(ring ? 0xe7dcc6 : 0xd9ccb2).multiplyScalar(0.96 + n * 0.06);
      if (Math.abs(dp - 16) < 0.6 || Math.abs(dp - 30) < 0.6) out.set(0xc9b48a);
    }
    const dc = Math.hypot(x - CITY.court[0], z - CITY.court[1]);
    if (dc < CITY.courtR + 2) out.set(0xefe8da).lerp(_c.set(0xe2d7c2), Math.floor((x + 200) / 4 + (z + 200) / 4) % 2 * 0.6);
    return out;
  },

  prepare(isl) {
    const st = isl.stations[0];
    this.st = st;
    const s = st.local;
    const [px, pz] = CITY.plaza;
    isl.flats.push({ x: px, z: pz, r: CITY.plazaR + 2, blend: 10, h: 0.6 });
    isl.keep.push({ x: px, z: pz, r: CITY.plazaR + 2 }, { x: CITY.court[0], z: CITY.court[1], r: CITY.courtR + 38 },
      { x: CITY.garden[0], z: CITY.garden[1], r: 78 });
    // 飞艇港
    this.airPlan = planAirDock(isl, CITY.portTh);
    const ar = this.airPlan.rootR - 1, po = [Math.cos(CITY.portTh), Math.sin(CITY.portTh)];
    this.dock = [po[0] * ar, po[1] * ar];
    // 候船厅位置预留（见 buildPort）
    const hr = this.airPlan.rootR - 17;
    isl.keep.push({ x: po[0] * hr - po[1] * 9, z: po[1] * hr + po[0] * 9, r: 6 }, { x: po[0] * (ar - 2), z: po[1] * (ar - 2), r: 7 });
    // 远眺台（花园西缘）
    this.viewTh = Math.PI + 0.12;
    this.view = isl.rimPoint(this.viewTh, 4);
    isl.flats.push({ x: this.view[0], z: this.view[1], r: 6, blend: 6, h: isl.baseHeight(...this.view) });
    // 王庭乘风台（北缘）
    this.glideTh = -Math.PI / 2 - 0.25;
    // 道路
    this.roads = {
      market: [[s.x, s.z], [s.x * 0.72 + 4, s.z * 0.72], [s.x * 0.42 + 4, s.z * 0.42 + 8], [px + 5, pz + CITY.plazaR - 2]],
      east: [[px + CITY.plazaR - 2, pz - 2], [90, 4], [150, -45], [this.dock[0], this.dock[1]]],
      west: [[px - CITY.plazaR + 2, pz], [-70, 20], [-105, 18]],
      north: [[px, pz - CITY.plazaR + 2], [0, -40], [0, -70], [0, -96]],
    };
    isl.addPath(this.roads.market, 3.4);
    isl.addPath(this.roads.east, 3.0);
    isl.addPath(this.roads.west, 3.0);
    isl.addPath(this.roads.north, 4.2);
    const ring = []; for (let i = 0; i <= 36; i++) { const a = (i / 36) * Math.PI * 2; ring.push([px + Math.cos(a) * 72, pz + Math.sin(a) * 72]); }
    this.ringRoad = ring;
    isl.addPath(ring, 2.2);
    const ring2 = []; for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2; ring2.push([px + Math.cos(a) * 128, pz + Math.sin(a) * 118]); }
    this.ringRoad2 = ring2;
    isl.addPath(ring2, 2.0);
    // 放射状小巷
    this.lanes = [0.7, 2.4, 3.9, 5.5].map((a) => [[px + Math.cos(a) * 74, pz + Math.sin(a) * 74], [px + Math.cos(a) * 126, pz + Math.sin(a) * 117], [px + Math.cos(a) * 190, pz + Math.sin(a) * 175]]);
    this.lanes.forEach((l) => isl.addPath(l, 1.8));
    const gl = []; for (let i = 0; i <= 28; i++) { const a = (i / 28) * Math.PI * 2; gl.push([CITY.garden[0] + Math.cos(a) * 42, CITY.garden[1] + Math.sin(a) * 38]); }
    this.gardenLoop = gl;
    isl.addPath(gl, 1.8);
    isl.addPath([[-105, 18], [CITY.garden[0] + 42, CITY.garden[1] + 4]], 1.8);
    isl.addPath([[CITY.garden[0] - 42, CITY.garden[1]], [this.view[0] + 4, this.view[1]]], 1.8);
    isl.addStream([[-170, 40], [-190, 58], [-215, 70], [-245, 82]]);
  },

  populate(isl, ctx, bDefault) {
    const r = isl.rand, C0 = isl.center;
    const CH = 56;                                  // 分块尺寸（米）
    const det = new Batcher({ chunk: CH });
    const D = { market: det, homes: det, plaza: det, court: det, garden: det, port: bDefault };
    const lo = new Batcher({ chunk: CH });
    const at = (x, z, ry = 0, dy = 0) => ctx.at(isl, x, z, ry, dy);
    this.buildings = 0;

    // —— 沿街建筑 ——
    const street = (b, pts, side, opts = {}) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
        const nx = -uz * side, nz = ux * side;
        let s = opts.start ?? 4;
        while (s < L - 3) {
          const w = 5 + r() * 2.8, d = 5 + r() * 1.6;
          const off = (opts.off ?? 4.6) + d / 2;
          const x = ax + ux * (s + w / 2) + nx * off, z = az + uz * (s + w / 2) + nz * off;
          s += w + 0.8 + r() * 1.5;
          const rr = Math.hypot(x, z), rim = isl.rim(Math.atan2(z, x));
          if (rr > rim - 10 || !isl.isFree(x, z, Math.max(w, d) / 2, Math.max(w, d) / 2 + 1.2)) continue;
          const face = Math.atan2(-nx, -nz);
          const info = townhouse(b, lo, at(x, z, face, -0.1), { w, d, seed: 1000 + this.buildings, shop: opts.shop ? r() < 0.8 : r() < 0.15, floors: opts.floors?.(r) });
          ctx.box(isl, x, z, info.w / 2 + 0.3, info.d / 2 + 0.3, -face, info.h + 4);
          isl.keep.push({ x, z, r: Math.max(w, d) / 2 + 0.6 });
          this.buildings++;
        }
      }
    };
    street(D.market, this.roads.market, 1, { shop: true, floors: (q) => 2 + Math.floor(q() * 2) });
    street(D.market, this.roads.market, -1, { shop: true, floors: (q) => 2 + Math.floor(q() * 2) });
    street(D.homes, this.roads.east, 1, { shop: false });
    street(D.homes, this.roads.east, -1, { shop: false, start: 14 });
    street(D.homes, this.roads.west, 1, {});
    street(D.homes, this.roads.west, -1, {});
    street(D.homes, this.ringRoad, -1, { off: 3.6 });
    street(D.homes, this.ringRoad, 1, { off: 3.6, floors: () => 1 });
    street(D.homes, this.ringRoad2, -1, { off: 3.4 });
    street(D.homes, this.ringRoad2, 1, { off: 3.4, floors: (q) => 1 + Math.floor(q() * 2) });
    for (const l of this.lanes) { street(D.homes, l, 1, { off: 3.2 }); street(D.homes, l, -1, { off: 3.2 }); }
    // 街区间隙里的树
    for (let i = 0, n = 0; i < 900 && n < 70; i++) {
      const [x, z] = isl.randomPoint(0.93);
      if (!isl.isFree(x, z, 2.5, 3)) continue;
      const h = 4 + r() * 3.5;
      pr.tree(D.homes, at(x, z, r() * 6, -0.2), { h, r: 1.8 + r() * 1.2, seed: 1500 + i, leaf: r() < 0.25 ? 0xf2bcc8 : r() < 0.5 ? 0x8fae86 : 0x9fbd8c, leafLight: 0xc8dca6 });
      ctx.collide(isl, x, z, 0.5, h);
      isl.keep.push({ x, z, r: 2 });
      n++;
    }

    // 商业街：彩旗串与吊灯
    const mk = this.roads.market;
    for (let i = 0; i < mk.length - 1; i++) {
      const [ax, az] = mk[i], [bx, bz] = mk[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      for (let s = 8; s < L - 4; s += 14) {
        const t = s / L, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const nx = -(bz - az) / L, nz = (bx - ax) / L;
        const h = (isl.localHeight(x, z) ?? 0) + 6.2;
        const p0 = [x + nx * 6.5, h, z + nz * 6.5], p1 = [x - nx * 6.5, h, z - nz * 6.5];
        D.market.segment('solid', CC.woodDark, new THREE.Matrix4(), p0, [x, h - 0.9, z], 0.02, GEO.cyl6);
        D.market.segment('solid', CC.woodDark, new THREE.Matrix4(), [x, h - 0.9, z], p1, 0.02, GEO.cyl6);
        for (let k = 1; k < 10; k++) {
          const u = k / 10, sag = Math.sin(u * Math.PI) * 0.9;
          const fx = p0[0] + (p1[0] - p0[0]) * u, fz = p0[2] + (p1[2] - p0[2]) * u;
          if (k % 2) D.market.add('glow', GEO.sphereLo, 0xffdca0, T(new THREE.Matrix4(), fx, h - sag - 0.15, fz, 0, 0, 0, 0.12));
          else D.market.add('swaySoft', GEO.prism, [CC.coral, CC.gold, CC.sage, CC.blue][k / 2 % 4], T(new THREE.Matrix4(), fx, h - sag - 0.35, fz, Math.PI, Math.atan2(nx, nz), 0, 0.22, 0.32, 0.03));
        }
      }
      for (let s = 6; s < L; s += 18) {
        const t = s / L, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const nx = -(bz - az) / L, nz = (bx - ax) / L;
        for (const sd of [-1, 1]) { pr.lamp(D.market, at(x + nx * 3.1 * sd, z + nz * 3.1 * sd), { h: 3.6 }); }
        if ((s / 18) % 2 < 1) { pr.crate(D.market, at(x + nx * 4.2, z + nz * 4.2, r()), 0.7); pr.barrel(D.market, at(x - nx * 4.0, z - nz * 4.0)); }
      }
    }

    this.buildPlaza(isl, ctx, D.plaza, at, r);
    this.buildCourt(isl, ctx, D.court, lo, at, r);
    this.buildGarden(isl, ctx, D.garden, at, r);
    this.buildStationHall(isl, ctx, D.market, lo, r);
    this.buildPort(isl, ctx, D.port, at, r);

    // —— 合批并设置分块 LOD：玩家附近的块显示完整细节，远处的块显示简化体块 ——
    const detail = new THREE.Group(); detail.name = 'city:detail';
    const loG = new THREE.Group(); loG.name = 'city:lo';
    const cells = new Map();
    const cell = (k) => { if (!cells.has(k)) { const [cx, cz] = k.split('|').map(Number); cells.set(k, { c: new THREE.Vector3((cx + 0.5) * CH + C0.x, C0.y + 10, (cz + 0.5) * CH + C0.z), det: [], lo: [], near: null }); } return cells.get(k); };
    det.build().forEach((m) => { detail.add(m); cell(m.userData.cell).det.push(m); });
    lo.build().forEach((m) => { m.castShadow = false; loG.add(m); cell(m.userData.cell).lo.push(m); });
    isl.group.add(detail, loG);
    let lodT = 0;
    ctx.anim.push((dt) => {
      const cam = ctx.world.camera; if (!cam) return;
      lodT -= dt; if (lodT > 0) return; lodT = 0.25;
      const q = ctx.world.quality === 'high' ? 1.5 : 1;
      for (const c of cells.values()) {
        const d = c.c.distanceTo(cam.position);
        const near = c.near ? d < 215 * q : d < 185 * q;
        if (near !== c.near) { c.near = near; c.det.forEach((m) => (m.visible = near)); c.lo.forEach((m) => (m.visible = !near)); }
      }
    });
    this.detail = detail; this.lo = loG; this.cells = cells;

    // —— 居民 ——
    const W = (pts, dy = 0) => pts.map(([x, z]) => new THREE.Vector3(x + C0.x, 0, z + C0.z));
    const routes = [
      W(this.roads.market.concat([...this.roads.market].reverse().slice(1, -1))),
      W(Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return [CITY.plaza[0] + Math.cos(a) * 24, CITY.plaza[1] + Math.sin(a) * 24]; })),
      W(this.ringRoad.slice(0, -1)),
      W(this.gardenLoop.slice(0, -1)),
      W(this.roads.east.concat([...this.roads.east].reverse().slice(1, -1))),
      W(Array.from({ length: 20 }, (_, i) => { const a = (i / 20) * Math.PI * 2; return [CITY.court[0] + Math.cos(a) * 44, CITY.court[1] + Math.sin(a) * 44]; })),
      W(this.roads.north.concat([...this.roads.north].reverse().slice(1, -1))),
    ];
    const heightAt = (x, z) => (isl.localHeight(x - C0.x, z - C0.z) ?? 0) + C0.y;
    const res = new Residents(ctx.scene, routes, heightAt, { count: 42 });
    ctx.world.residents = res;
    ctx.anim.push((dt, t) => { const cam = ctx.world.camera; if (cam) res.update(dt, t, ctx.world.dn?.night ?? 0, cam.position); });

    // 植被
    const avoidStone = (x, z) => (Math.hypot(x - CITY.plaza[0], z - CITY.plaza[1]) < CITY.plazaR + 3 || Math.hypot(x - CITY.court[0], z - CITY.court[1]) < CITY.courtR + 3 ? 0 : 1);
    ctx.scene.add(grassField(isl, { count: 30000, base: 0x7a9670, tip: 0xbccf92, tip2: 0xdcd8a0, h: [0.3, 0.75], mask: avoidStone }));
    ctx.scene.add(flowerField(isl, { count: 3500, colors: CC.flower.concat([0xffffff]), pick: (x, z, q) => (avoidStone(x, z) ? CC.flower[Math.floor(q() * 5)] : null) }));
    // 城市边缘的瀑布与鸟群
    for (const th of [2.2, 2.9, -0.9, 0.8]) ctx.mist(waterfall(isl, th, { width: 4, len: 140 }), 50);
    ctx.scene.add(new Swarm({ count: 160, center: C0.clone().add(new THREE.Vector3(0, 12, 0)), box: new THREE.Vector3(300, 30, 300), vel: new THREE.Vector3(1.2, -0.3, 0.6), size: 0.3, colorA: 0xf6e3c0, colorB: 0xf3b6c4, jitter: 2, seed: 61 }).points);
  },

  buildPlaza(isl, ctx, b, at, r) {
    const [px, pz] = CITY.plaza;
    const base = at(px, pz);
    // 三层喷泉
    b.add('flat', GEO.cyl16, CC.stone, T(base, 0, 0.45, 0, 0, 0, 0, 8.2, 0.9, 8.2));
    b.add('solid', GEO.cyl16, CC.white, T(base, 0, 0.95, 0, 0, 0, 0, 8.4, 0.15, 8.4));
    b.add('solid', GEO.cyl16, P.water, T(base, 0, 0.8, 0, 0, 0, 0, 7.7, 0.08, 7.7));
    b.add('solid', GEO.taper8, CC.white, T(base, 0, 2.0, 0, 0, 0, 0, 1.0, 2.6, 1.0));
    b.add('solid', GEO.cyl16, CC.white, T(base, 0, 3.35, 0, 0, 0, 0, 3.4, 0.35, 3.4));
    b.add('solid', GEO.cyl16, P.water, T(base, 0, 3.5, 0, 0, 0, 0, 3.15, 0.06, 3.15));
    b.add('solid', GEO.taper8, CC.white, T(base, 0, 4.5, 0, 0, 0, 0, 0.5, 2.0, 0.5));
    b.add('solid', GEO.cyl16, CC.white, T(base, 0, 5.55, 0, 0, 0, 0, 1.5, 0.25, 1.5));
    // 顶部金色风之鲸雕像
    b.add('solid', GEO.sphere, CC.gold, T(base, 0, 6.6, 0, 0, 0.5, 0.25, 0.75, 0.55, 1.5));
    b.add('flat', GEO.prism, CC.gold, T(base, 0.6, 6.95, 1.1, 0.4, 0.5, 0, 0.35, 0.5, 0.05));
    b.add('flat', GEO.prism, CC.gold, T(base, -0.5, 7.0, -1.3, -0.5, 0.5, Math.PI / 2, 0.45, 0.4, 0.05));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      b.add('solid', GEO.cyl8, CC.gold, T(base, Math.cos(a) * 8.0, 1.2, Math.sin(a) * 8.0, 0, 0, 0, 0.12, 0.5, 0.12));
    }
    ctx.collide(isl, px, pz, 8.4, 3);
    // 水帘（上层碗边缘落下）
    const curtain = (rad, y0, y1) => {
      const g = new THREE.CylinderGeometry(rad, rad * 1.05, y0 - y1, 24, 6, true);
      const m = new THREE.Mesh(g, waterfallMat());
      m.position.set(px, (isl.localHeight(px, pz) ?? 0) + (y0 + y1) / 2, pz);
      m.renderOrder = 4;
      isl.group.add(m);
    };
    curtain(3.35, 3.4, 0.85); curtain(1.45, 5.5, 3.5);
    const spray = new Swarm({ count: 120, center: isl.center.clone().add(new THREE.Vector3(px, (isl.localHeight(px, pz) ?? 0) + 4, pz)), box: new THREE.Vector3(9, 6, 9),
      vel: new THREE.Vector3(0, -1.6, 0), size: 0.18, colorA: 0xffffff, colorB: 0xdff0ff, shape: 1, jitter: 0.8, opacity: 0.7, seed: 71 });
    ctx.scene.add(spray.points);
    // 花坛、长椅、路灯
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const x = px + Math.cos(a) * 21, z = pz + Math.sin(a) * 21;
      b.add('flat', GEO.cyl12, CC.stone, T(at(x, z), 0, 0.3, 0, 0, a, 0, 3.0, 0.6, 1.6));
      for (let f = 0; f < 9; f++) b.add('swaySoft', GEO.ico, CC.flower[(k + f) % 5], T(at(x, z), Math.cos(a + Math.PI / 2) * (f - 4) * 0.55, 0.75, Math.sin(a + Math.PI / 2) * (f - 4) * 0.55, 0, r() * 3, 0, 0.32, 0.25, 0.32));
      b.add('swaySoft', blob(k % 4), 0x86a77e, T(at(x, z), 0, 0.7, 0, 0, a, 0, 2.6, 0.35, 1.2));
      ctx.collide(isl, x, z, 2.2, 1);
      const ba = a + Math.PI / 8;
      pr.bench(b, at(px + Math.cos(ba) * 13, pz + Math.sin(ba) * 13, -ba - Math.PI / 2 + Math.PI));
    }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      pr.lamp(b, at(px + Math.cos(a) * 31, pz + Math.sin(a) * 31), { h: 4.2 });
      ctx.collide(isl, px + Math.cos(a) * 31, pz + Math.sin(a) * 31, 0.3, 5);
    }
  },

  buildCourt(isl, ctx, b, lo, at, r) {
    const [cx, cz] = CITY.court;
    const base = at(cx, cz, 0, -0.2);
    // 中央高塔 + 四座副塔
    const main = spire(b, lo, base, { r: 10, h: 64, tiers: 4, roof: 0xe2bd6e });
    ctx.collide(isl, cx, cz, 10.4, 80);
    this.towerTop = isl.center.clone().add(new THREE.Vector3(cx, (isl.localHeight(cx, cz) ?? 0) + main.top, cz));
    const subs = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const x = cx + Math.cos(a) * 34, z = cz + Math.sin(a) * 34;
      spire(b, lo, at(x, z, 0, -0.2), { r: 4.8, h: 34 + (k % 2) * 8, tiers: 3, roof: k % 2 ? 0x94adc6 : 0xe39a86 });
      ctx.collide(isl, x, z, 5.1, 50);
      pr.flag(b, at(x, z, a, 0).multiply(new THREE.Matrix4().makeTranslation(0, 50 + (k % 2) * 10, 0)), [CC.coral, CC.sage, CC.blue, CC.gold][k], 4);
      subs.push([x, z, a]);
    }
    // 空中廊桥：主塔二层平台 → 副塔
    const yB = (isl.localHeight(cx, cz) ?? 0) + 22;
    for (const [x, z] of subs) {
      const p0 = [cx + (x - cx) * 0.3, yB, cz + (z - cz) * 0.3], p1 = [cx + (x - cx) * 0.86, yB - 2, cz + (z - cz) * 0.86];
      b.segment('solid', CC.white, new THREE.Matrix4(), p0, p1, 1.4, GEO.box);
      const mid = [(p0[0] + p1[0]) / 2, yB - 3.2, (p0[2] + p1[2]) / 2];
      b.segment('solid', CC.white, new THREE.Matrix4(), [p0[0], yB - 0.7, p0[2]], mid, 0.4, GEO.cyl8);
      b.segment('solid', CC.white, new THREE.Matrix4(), mid, [p1[0], yB - 2.7, p1[2]], 0.4, GEO.cyl8);
      for (const sd of [-1, 1]) {
        const dx = -(z - cz), dz = x - cx, l = Math.hypot(dx, dz);
        const o = [dx / l * 0.75 * sd, dz / l * 0.75 * sd];
        b.segment('solid', CC.gold, new THREE.Matrix4(), [p0[0] + o[0], yB + 1.1, p0[2] + o[1]], [p1[0] + o[0], yB - 0.9, p1[2] + o[1]], 0.05, GEO.cyl6);
      }
    }
    // 宫殿正厅（主塔南侧）
    const hall = at(cx, cz + 28, 0, -0.2);
    b.add('flat', GEO.box, CC.stone, T(hall, 0, 0.6, 0, 0, 0, 0, 34, 1.2, 16));
    b.add('solid', GEO.box, CC.white, T(hall, 0, 6.2, -1, 0, 0, 0, 30, 10, 12));
    b.add('solid', GEO.box, CC.gold, T(hall, 0, 11.3, -1, 0, 0, 0, 31, 0.4, 13));
    b.add('flat', GEO.cone4, 0xe2bd6e, T(hall, 0, 14.5, -1, 0, Math.PI / 4, 0, 22.5, 6, 9.5));
    for (let k = -3; k <= 3; k++) {
      b.add('glow', GEO.box, CC.glass, T(hall, k * 4, 7, 5.05, 0, 0, 0, 1.6, 4.2, 0.1));
      b.add('solid', ARCH, CC.gold, T(hall, k * 4, 9.1, 5.1, 0, 0, 0, 0.85, 0.7, 1.4));
    }
    b.add('solid', GEO.box, CC.woodDark, T(hall, 0, 3.4, 5.1, 0, 0, 0, 3.4, 5.0, 0.15));
    b.add('solid', ARCH, CC.gold, T(hall, 0, 5.9, 5.2, 0, 0, 0, 1.75, 1.4, 1.5));
    arcade(b, T(hall, 0, 1.2, 7.5), 8, 3.6, 4.6);
    ctx.box(isl, cx, cz + 27, 15.5, 6.5, 0, 25);
    // 平台边缘的白色栏杆（留出南侧坡道）
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      if (Math.abs(Math.sin(a) - 1) < 0.08) continue;
      const x = cx + Math.cos(a) * (CITY.courtR + 1), z = cz + Math.sin(a) * (CITY.courtR + 1);
      b.add('solid', GEO.cyl8, CC.white, T(at(x, z, 0, -0.1), 0, 0.5, 0, 0, 0, 0, 0.18, 1.0, 0.18));
      if (k % 4 === 0) b.add('solid', GEO.box, CC.white, T(at(x, z, 0, -0.1), 0, 0.7, 0, 0, 0, 0, 0.6, 1.4, 0.6));
    }
    // 南侧大台阶（视觉）
    for (let zz = -58; zz > -95; zz -= 0.9) {
      const y = isl.localHeight(0, zz);
      if (y === null) continue;
      b.add('flat', GEO.box, zz % 3.6 < -1.8 ? 0xefe8da : 0xe2d7c2, T(new THREE.Matrix4(), 0, y - 0.12, zz, 0, 0, 0, 8, 0.3, 0.95));
    }
    for (const sx of [-1, 1]) for (let zz = -60; zz > -96; zz -= 6) {
      const y = isl.localHeight(sx * 5, zz);
      if (y !== null) pr.lamp(b, at(sx * 5, zz), { h: 3.6 });
    }
    // 王庭两侧花园与修剪树篱
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const x = cx + Math.cos(a) * 48, z = cz + Math.sin(a) * 48;
      if (Math.abs(Math.sin(a) - 1) < 0.25) continue;
      b.add('swaySoft', blob(k % 4), 0x7f9f78, T(at(x, z), 0, 1.0, 0, 0, a, 0, 3.2, 1.2, 1.4));
      pr.tree(b, at(x * 0.98, z * 0.98 + (z < cz ? 1 : -1)), { h: 5, r: 2, seed: 900 + k, leaf: 0xf2bcc8, leafLight: 0xfbe0e4 });
    }
    // 乘风台（王庭北缘 → 云顶花屿）
    const gp = isl.rimPoint(this.glideTh, 6);
    const gy = isl.localHeight(gp[0], gp[1]) ?? 0;
    const gang = Math.atan2(Math.cos(this.glideTh), Math.sin(this.glideTh));
    pr.deck(b, T(new THREE.Matrix4(), gp[0], gy + 0.05, gp[1], 0, gang, 0), 8, 3.4, { front: false });
    ctx.platform(isl, gp[0], gp[1], this.glideTh, 8, 3.4);
    ctx.glideDeck(isl, gp[0] + Math.cos(this.glideTh) * 6, gp[1] + Math.sin(this.glideTh) * 6, this.glideTh, '城顶乘风台');
    // 鸟群环绕高塔
    ctx.world.extraFlocks = [{ c: this.towerTop.toArray().map((v, i) => (i === 1 ? v - 12 : v)), R: 40 }];
  },

  buildGarden(isl, ctx, b, at, r) {
    const [gx, gz] = CITY.garden;
    // 古树（花冠为柔和的粉白色）
    pr.giantTree(b, at(gx, gz, 0.6, -0.5), { h: 34, r: 3.4, seed: 88, leaves: [0xf2c6cf, 0xf7dde1, 0xe9b3c0, 0xfbeeee] });
    ctx.collide(isl, gx, gz, 4.2, 40);
    isl.addShade(gx, gz, 26, 16, 0.5);
    ctx.scene.add(new Swarm({ count: 160, center: isl.center.clone().add(new THREE.Vector3(gx, (isl.localHeight(gx, gz) ?? 0) + 14, gz)), box: new THREE.Vector3(40, 26, 40),
      vel: new THREE.Vector3(0.9, -1.0, 0.4), size: 0.36, colorA: 0xf3b6c4, colorB: 0xfff1f4, jitter: 1.6, seed: 41 }).points);
    // 花园小径边的树篱、长椅、灯
    this.gardenLoop.forEach(([x, z], i) => {
      if (i % 2) return;
      const nx = x - gx, nz = z - gz, l = Math.hypot(nx, nz);
      const hx = x + (nx / l) * 2.6, hz = z + (nz / l) * 2.6;
      if (isl.localHeight(hx, hz) === null) return;
      b.add('swaySoft', blob(i % 4), 0x7a9a74, T(at(hx, hz), 0, 0.7, 0, 0, Math.atan2(nx, nz), 0, 1.6, 0.9, 2.4));
      if (i % 4 === 0) pr.lamp(b, at(x - (nx / l) * 2.4, z - (nz / l) * 2.4), { h: 3.0, glow: 0xffe6c0 });
      if (i % 6 === 2) pr.bench(b, at(x - (nx / l) * 2.6, z - (nz / l) * 2.6, Math.atan2(-nx, -nz) + Math.PI));
    });
    pr.pavilion(b, at(gx + 30, gz - 26), { roof: 0xe39a86, r: 3.6 });
    ctx.disc(isl, gx + 30, gz - 26, 4.0, 0.45);
    for (let i = 0, n = 0; i < 300 && n < 18; i++) {
      const [x, z] = isl.randomPoint(0.92);
      if (Math.hypot(x - gx, z - gz) > 80 || !isl.isFree(x, z, 3, 3)) continue;
      const h = 4 + r() * 3;
      pr.tree(b, at(x, z, r() * 6, -0.2), { h, r: 2 + r(), seed: 700 + i, leaf: r() < 0.4 ? 0xf2bcc8 : 0x8fae86, leafLight: r() < 0.4 ? 0xfbe0e4 : 0xbcd2a0 });
      ctx.collide(isl, x, z, 0.5, h);
      isl.keep.push({ x, z, r: 2 });
      n++;
    }
    // 远眺台
    const [vx, vz] = this.view;
    const vang = Math.atan2(Math.cos(this.viewTh), Math.sin(this.viewTh));
    pr.deck(b, at(vx, vz, vang, 0.05), 10, 6);
    ctx.platform(isl, vx, vz, this.viewTh, 10, 6);
    pr.telescope(b, at(vx + Math.cos(this.viewTh) * 7, vz + Math.sin(this.viewTh) * 7, vang + Math.PI, 0.05));
    ctx.viewpoint(isl, vx + Math.cos(this.viewTh) * 5, vz + Math.sin(this.viewTh) * 5, 'city', '按 <b>E</b> 在空中花园远眺群岛');
  },

  buildStationHall(isl, ctx, b, lo, r) {
    // 宏伟的拱形站厅：横跨轨道与站台的金色拱肋 + 鼠尾草绿屋面，两端为玫瑰窗山墙
    const st = this.st, C0 = isl.center;
    const toIsl = st.perp.clone().negate();
    const mid = st.pos.clone().addScaledVector(toIsl, 4.5).sub(C0);
    const ang = Math.atan2(st.dir.x, st.dir.z);
    const base = T(new THREE.Matrix4(), mid.x, st.pos.y - C0.y + 1, mid.z, 0, ang, 0);
    const R = 11, L = 64;
    for (let z = -L / 2; z <= L / 2 + 0.1; z += 6.4) {
      b.add('solid', GEO.torus, CC.gold, T(base, 0, 0, z, 0, 0, 0, R, R, 3.5));
      for (const sx of [-1, 1]) {
        b.add('solid', GEO.box, CC.white, T(base, sx * R, -3, z, 0, 0, 0, 0.9, 6, 0.9));
        b.add('solid', GEO.box, CC.gold, T(base, sx * R, 0.1, z, 0, 0, 0, 1.2, 0.3, 1.2));
      }
    }
    const vault = new THREE.CylinderGeometry(R + 0.15, R + 0.15, L, 24, 1, true, -0.95, 1.9);
    vault.rotateX(Math.PI / 2); vault.rotateZ(Math.PI / 2);
    b.add('solid', vault, 0xa9c4a2, T(base, 0, 0, 0, 0, 0, Math.PI / 2));
    for (const sz of [-1, 1]) {
      b.add('solid', GEO.box, CC.white, T(base, 0, R + 1.2, sz * L / 2, 0, 0, 0, 7, 3, 0.8));
      b.add('glow', GEO.cyl16, 0xf6dca8, T(base, 0, R - 2.2, sz * (L / 2 + 0.3), Math.PI / 2, 0, 0, 3, 0.15, 3));
      b.add('solid', GEO.torus, CC.gold, T(base, 0, R - 2.2, sz * (L / 2 + 0.42), 0, 0, 0, 3.1, 3.1, 1.4));
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; b.add('solid', GEO.box, CC.gold, T(base, Math.cos(a) * 1.6, R - 2.2 + Math.sin(a) * 1.6, sz * (L / 2 + 0.4), 0, 0, a, 3.0, 0.1, 0.1)); }
    }
    for (let z = -L / 2 + 6; z < L / 2; z += 12) b.add('glow', GEO.sphere, 0xffdca0, T(base, 0, R - 2.5, z, 0, 0, 0, 0.6, 0.5, 0.6));
    lo.add('solid', vault, 0x8fae8a, T(base, 0, 0, 0, 0, 0, Math.PI / 2));
    // 钟楼（站厅内侧）
    const ct = st.pos.clone().addScaledVector(toIsl, 22).addScaledVector(st.dir, -26).sub(C0);
    pr.clockTower(b, T(new THREE.Matrix4(), ct.x, isl.localHeight(ct.x, ct.z) ?? 0, ct.z, 0, ang + Math.PI / 2, 0));
    ctx.box(isl, ct.x, ct.z, 2.2, 2.2, -(ang + Math.PI / 2), 20);
    isl.keep.push({ x: ct.x, z: ct.z, r: 4 });
    this.clockPos = ct.clone().add(C0);
  },

  buildPort(isl, ctx, b, at, r) {
    const info = buildAirDock(isl, ctx, b, this.airPlan, { name: '艾瑟兰空港', roof: 0x94adc6 });
    const { out, tan, rootL } = info;
    const p = (a, c) => [rootL.x + out.x * a + tan.x * c, rootL.z + out.z * a + tan.z * c];
    // 候船厅（一层城市小楼）+ 路牌 + 花箱
    const [hx, hz] = p(-17, 9);
    townhouse(b, null, at(hx, hz, Math.atan2(out.x, out.z)), { w: 6, d: 5, floors: 1, seed: 77, roof: 'hip', roofColor: 0x94adc6 });
    ctx.box(isl, hx, hz, 3.4, 3, -Math.atan2(out.x, out.z), 8);
    isl.keep.push({ x: hx, z: hz, r: 4 });
    const [sx, sz] = p(-3, -3.2);
    pr.signpost(b, at(sx, sz, r()));
    for (const c of [-5, 5]) { const [fx, fz] = p(-1, c); pr.barrel(b, at(fx, fz)); }
    this.dockWorld = { pos: info.shipPos, th: CITY.portTh, mast: info.mastTop };
  },
};
