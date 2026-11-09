// 云港岛：中转枢纽，建筑群 + 钟楼 + 空港栈桥 + 停泊/往来飞艇
import * as THREE from 'three';
import { smoothstep } from '../../core/utils.js';
import { PALETTE as P } from '../../config.js';
import * as pr from '../props.js';
import { grassField } from '../vegetation.js';
import { waterfall } from '../particles.js';
import { planAirDock, buildAirDock } from '../airship.js';

const _c = new THREE.Color();

export const portTheme = {
  color(isl, x, z, h, t, out) {
    const n = isl.noise.fbm(x * 0.05, z * 0.05, 3);
    out.set(0xa2b78e).lerp(_c.set(0xc4cf9e), smoothstep(-0.3, 0.6, n));
    const d = Math.hypot(x - 5, z + 5);
    if (d < 30) out.lerp(_c.set(0xd9ccb0), (1 - smoothstep(22, 30, d)) * 0.9); // 中央广场
    return out;
  },
  prepare(isl) {
    const st = isl.station.local;
    isl.flats.push({ x: 5, z: -5, r: 30, blend: 12, h: 0.6 });
    isl.keep.push({ x: 5, z: -5, r: 8 });
    // 建筑沿广场环形排列
    this.houses = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.2;
      const x = 5 + Math.cos(a) * 24, z = -5 + Math.sin(a) * 24;
      if (Math.hypot(x - st.x, z - st.z) < 22) continue;
      this.houses.push([x, z, a]);
      isl.keep.push({ x, z, r: 6 });
    }
    // 栈桥（朝外）
    this.piers = [-0.3, 2.2, -2.4].map((th) => ({ th, p: isl.rimPoint(th, 2) }));
    this.piers.forEach(({ p }) => isl.keep.push({ x: p[0], z: p[1], r: 5 }));
    isl.addPath([[st.x, st.z], [st.x * 0.55 + 5, st.z * 0.55 - 2], [5, -5]], 2.6);
    this.piers.forEach(({ p }) => isl.addPath([[5, -5], [p[0] * 0.7 + 1.5, p[1] * 0.7 - 1.5], [p[0], p[1]]], 1.8));
    // 「风帆号」空港（西岸，飞往天空之城）
    this.airPlan = planAirDock(isl, Math.PI);
    const ar = this.airPlan.rootR;
    isl.addPath([[5, -5], [-30, 2], [-(ar - 1), 0]], 2.4);
  },
  populate(isl, ctx, b) {
    const r = isl.rand;
    pr.clockTower(b, ctx.at(isl, 5, -5, 0.3));
    ctx.box(isl, 5, -5, 1.9, 1.9, 0.3, 20);
    const roofs = [P.coral, P.sageDark, 0xd99f6e, P.coralSoft, 0x8fa7b8];
    this.houses.forEach(([x, z, a], i) => {
      const w = 5 + r() * 2.5, d = 4.5 + r() * 1.5, h = 3.2 + r() * 3.2;
      const ry = -a - Math.PI / 2;
      pr.house(b, ctx.at(isl, x, z, Math.atan2(5 - x, -5 - z)), { w, d, h, roof: roofs[i % roofs.length], wall: i % 3 ? P.cream : 0xf1e0c8 });
      ctx.box(isl, x, z, w / 2 + 0.3, d / 2 + 0.3, -Math.atan2(5 - x, -5 - z), h + 4);
      void ry;
    });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      pr.lamp(b, ctx.at(isl, 5 + Math.cos(a) * 15, -5 + Math.sin(a) * 15));
      ctx.collide(isl, 5 + Math.cos(a) * 15, -5 + Math.sin(a) * 15, 0.25, 4);
    }
    // 栈桥 + 停泊飞艇
    this.piers.forEach(({ th, p }, i) => {
      const ang = Math.atan2(Math.cos(th), Math.sin(th));
      pr.deck(b, ctx.at(isl, p[0], p[1], ang, 0.05), 14, 3.2);
      ctx.platform(isl, p[0], p[1], th, 14, 3.2);
      for (let k = 0; k < 3; k++) pr.crate(b, ctx.at(isl, p[0] - Math.cos(th) * 3 + k * 1.1, p[1] - Math.sin(th) * 3, r()), 0.9);
      pr.barrel(b, ctx.at(isl, p[0] - Math.cos(th) * 4 + 1, p[1] - Math.sin(th) * 4 + 2));
      const ship = pr.airship({ s: 1.1, stripe: [P.coral, P.sageDark, P.gold][i] });
      const out = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
      const base = new THREE.Vector3(p[0], isl.localHeight(p[0] * 0.98, p[1] * 0.98) ?? 0, p[1]).addScaledVector(out, 12)
        .add(new THREE.Vector3(-out.z * 5, -1.2, out.x * 5));
      ship.position.copy(base);
      ship.rotation.y = ang;
      isl.group.add(ship);
      const ph = r() * 6;
      ctx.anim.push((dt, t) => { ship.position.y = base.y + Math.sin(t * 0.7 + ph) * 0.4; ship.rotation.z = Math.sin(t * 0.5 + ph) * 0.03; });
    });
    this.airDock = buildAirDock(isl, ctx, b, this.airPlan, { name: '云港 · 风帆号空港', roof: P.sageDark });
    // 群岛之间往来的飞艇
    for (let i = 0; i < 4; i++) {
      const ship = pr.airship({ s: 1.4 + r() * 0.6, stripe: [P.coral, P.sageDark, P.gold, P.lavender][i] });
      ctx.scene.add(ship);
      const R = 280 + i * 160, y = 40 + i * 35, sp = 0.012 + r() * 0.01, ph = r() * 6, cx = 350, cz = 200;
      ctx.anim.push((dt, t) => {
        const a = t * sp * (i % 2 ? 1 : -1) + ph;
        ship.position.set(cx + Math.cos(a) * R, y + Math.sin(t * 0.3 + ph) * 4, cz + Math.sin(a) * R * 0.8);
        ship.rotation.y = Math.atan2(-Math.sin(a) * (i % 2 ? 1 : -1), Math.cos(a) * 0.8 * (i % 2 ? 1 : -1));
      });
    }
    for (let i = 0, n = 0; i < 200 && n < 10; i++) {
      const [x, z] = isl.randomPoint(0.9);
      if (Math.hypot(x - 5, z + 5) < 32 || !isl.isFree(x, z, 3, 3)) continue;
      pr.tree(b, ctx.at(isl, x, z, r() * 6, -0.2), { h: 4 + r() * 2, r: 1.8 + r(), seed: 200 + i });
      ctx.collide(isl, x, z, 0.5, 6);
      n++;
    }
    ctx.stones(isl, b);
    ctx.mist(waterfall(isl, 1.1, { width: 3, len: 100 }), 40);
    ctx.scene.add(grassField(isl, { count: 9000, base: 0x86a275, tip: 0xc0d093, h: [0.3, 0.7], mask: (x, z) => smoothstep(28, 36, Math.hypot(x - 5, z + 5)) }));
  },
};
