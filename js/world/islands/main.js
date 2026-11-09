// 风栖主岛：金叶古树、童话小屋、风车、石板路、云轨车站、观景台、乘风台
import * as THREE from 'three';
import { GEO, T } from '../../core/batcher.js';
import { smoothstep } from '../../core/utils.js';
import { PALETTE as P } from '../../config.js';
import * as pr from '../props.js';
import { grassField, flowerField } from '../vegetation.js';
import { waterfall, Swarm } from '../particles.js';

const _c = new THREE.Color();
const TREE = [-20, -14], HOUSE = [30, 26], MILL = [-46, 20];

export const mainTheme = {
  shape(isl, x, z) {
    return 6.5 * Math.exp(-((x - TREE[0]) ** 2 + (z - TREE[1]) ** 2) / (2 * 17 * 17));
  },
  color(isl, x, z, h, t, out) {
    const n = isl.noise.fbm(x * 0.045, z * 0.045, 3);
    out.set(0x93ad84).lerp(_c.set(0xbccf95), smoothstep(-0.35, 0.5, n));
    const dT = Math.hypot(x - TREE[0], z - TREE[1]);
    if (dT < 17) out.lerp(_c.set(0xd8bf72), (1 - smoothstep(6, 17, dT)) * (0.55 + n * 0.3));
    return out;
  },
  prepare(isl) {
    const st = isl.station.local;
    isl.flats.push({ x: HOUSE[0], z: HOUSE[1], r: 7, blend: 6, h: isl.baseHeight(HOUSE[0], HOUSE[1]) });
    isl.flats.push({ x: MILL[0], z: MILL[1], r: 4.5, blend: 5, h: isl.baseHeight(MILL[0], MILL[1]) });
    isl.keep.push({ x: HOUSE[0], z: HOUSE[1], r: 7 }, { x: MILL[0], z: MILL[1], r: 5 }, { x: TREE[0], z: TREE[1], r: 7 });
    // 观景台（朝向天空之城）与乘风台（朝向风铃屿）
    this.viewTh = -1.70; this.deckTh = -1.19;
    const v = isl.rimPoint(this.viewTh, 5), d = isl.rimPoint(this.deckTh, 3);
    this.view = v; this.deck = d;
    isl.flats.push({ x: v[0], z: v[1], r: 5, blend: 6, h: 1.2 }, { x: d[0], z: d[1], r: 4, blend: 5, h: 1.0 });
    isl.keep.push({ x: v[0], z: v[1], r: 6 }, { x: d[0], z: d[1], r: 5 });
    const cross = [4, -2];
    isl.addPath([[HOUSE[0], HOUSE[1] + 4], [24, 40], [st.x * 0.6 + 6, st.z * 0.6], [st.x, st.z]]);
    isl.addPath([[HOUSE[0] - 2, HOUSE[1] + 3], [16, 12], cross, [TREE[0] + 8, TREE[1] + 6]]);
    isl.addPath([cross, [-6, -30], [v[0] * 0.7, v[1] * 0.7], [v[0], v[1]]]);
    isl.addPath([[-6, -30], [d[0] * 0.6, d[1] * 0.75], [d[0], d[1]]]);
    isl.addPath([cross, [-25, 12], [MILL[0] + 4, MILL[1] - 2]]);
    isl.addStream([[-34, 34], [-42, 46], [-50, 58], [-60, 70]]);
    this.cross = cross;
  },
  populate(isl, ctx, b) {
    const r = isl.rand;
    // 金叶古树
    const tH = isl.localHeight(...TREE);
    pr.goldenTree(b, ctx.at(isl, TREE[0], TREE[1], 0.4, -0.3));
    ctx.collide(isl, TREE[0], TREE[1], 3.0, 30);
    isl.addShade(TREE[0], TREE[1], 20, 15, 0.55);
    ctx.scene.add(new Swarm({
      count: 160, center: isl.center.clone().add(new THREE.Vector3(TREE[0], tH + 12, TREE[1])), box: new THREE.Vector3(36, 26, 36),
      vel: new THREE.Vector3(0.8, -1.1, 0.4), size: 0.42, colorA: 0xe8bf5a, colorB: 0xf6dd94, shape: 0, jitter: 1.6, seed: 3,
    }).points);
    // 小屋
    pr.house(b, ctx.at(isl, HOUSE[0], HOUSE[1], 0.25), { w: 7, d: 5.5, h: 3.6, roof: P.coral, flowers: P.pink });
    ctx.box(isl, HOUSE[0], HOUSE[1], 3.8, 3.1, -0.25, 8);
    pr.fence(b, new THREE.Matrix4(), [[37, 0, 22], [40, 0, 26], [40, 0, 32], [35, 0, 35]].map(([x, , z]) => [x, isl.localHeight(x, z), z]));
    pr.barrel(b, ctx.at(isl, HOUSE[0] - 4.6, HOUSE[1] + 1.6));
    pr.crate(b, ctx.at(isl, HOUSE[0] - 4.4, HOUSE[1] - 1, 0.4), 0.8);
    pr.signpost(b, ctx.at(isl, this.cross[0] + 2.5, this.cross[1] + 2, 0.6));
    pr.bench(b, ctx.at(isl, TREE[0] + 7, TREE[1] + 9, -0.9));
    // 风车
    const wm = pr.windmill(b, ctx.at(isl, MILL[0], MILL[1], 1.2, -0.2));
    isl.group.add(wm.pivot);
    ctx.anim.push((dt) => (wm.rotor.rotation.z += dt * 0.45));
    ctx.collide(isl, MILL[0], MILL[1], 2.8, 14);
    // 散布小树
    let n = 0;
    for (let i = 0; i < 300 && n < 16; i++) {
      const [x, z] = isl.randomPoint(0.88);
      if (!isl.isFree(x, z, 4, 3.5)) continue;
      const h = 4 + r() * 3, cr = 2 + r() * 1.2;
      pr.tree(b, ctx.at(isl, x, z, r() * 6, -0.2), { h, r: cr, seed: i, leaf: r() < 0.3 ? 0x8fae86 : P.sage });
      ctx.collide(isl, x, z, 0.5, h);
      isl.addShade(x, z, h, cr, 0.4);
      isl.keep.push({ x, z, r: 2.5 });
      n++;
    }
    for (let i = 0; i < 14; i++) {
      const [x, z] = isl.randomPoint(0.95);
      if (!isl.isFree(x, z, 1, 2.5)) continue;
      pr.rock(b, ctx.at(isl, x, z, r() * 6, -0.2), 0.6 + r() * 1.2, r() < 0.5 ? P.stone : 0xc7bfb3, i);
    }
    // 沿路灯柱
    for (const p of isl.paths) for (let k = 6; k < p.pts.length - 3; k += 16) {
      const [x, z] = p.pts[k];
      const [x2, z2] = p.pts[k + 1];
      const nx = -(z2 - z), nz = x2 - x, l = Math.hypot(nx, nz) || 1;
      const lx = x + (nx / l) * 2.4, lz = z + (nz / l) * 2.4;
      if (isl.localHeight(lx, lz) === null) continue;
      pr.lamp(b, ctx.at(isl, lx, lz));
      ctx.collide(isl, lx, lz, 0.25, 4);
    }
    ctx.stones(isl, b);
    // 观景台
    const [vx, vz] = this.view;
    const vang = Math.atan2(Math.cos(this.viewTh), Math.sin(this.viewTh));
    pr.deck(b, ctx.at(isl, vx, vz, vang, 0.05), 9, 5);
    pr.telescope(b, ctx.at(isl, vx + Math.cos(this.viewTh) * 6, vz + Math.sin(this.viewTh) * 6, vang + Math.PI, 0.05));
    ctx.platform(isl, vx, vz, this.viewTh, 9, 5);
    ctx.viewpoint(isl, vx + Math.cos(this.viewTh) * 5, vz + Math.sin(this.viewTh) * 5, 'main', '按 <b>E</b> 眺望远方 · 天空之城');
    // 乘风台
    const [dx, dz] = this.deck;
    const dang = Math.atan2(Math.cos(this.deckTh), Math.sin(this.deckTh));
    pr.deck(b, ctx.at(isl, dx, dz, dang, 0.05), 8, 3, { front: false });
    pr.flag(b, ctx.at(isl, dx - 2, dz + 1), P.sage, 6);
    pr.flag(b, ctx.at(isl, dx + 2.4, dz - 0.6), P.coral, 5);
    ctx.platform(isl, dx, dz, this.deckTh, 8, 3);
    ctx.glideDeck(isl, dx + Math.cos(this.deckTh) * 6, dz + Math.sin(this.deckTh) * 6, this.deckTh);
    // 瀑布（溪流尽头）
    ctx.mist(waterfall(isl, Math.atan2(70, -60), { width: 3.5, len: 95 }), 40);
    ctx.mist(waterfall(isl, 2.75, { width: 2.2, len: 70 }), 26);

    ctx.scene.add(grassField(isl, { count: 26000, base: 0x7a9670, tip: 0xb9cd8e, tip2: 0xd9d59c, h: [0.35, 0.85] }));
    ctx.scene.add(flowerField(isl, { count: 1400, colors: [P.cream, P.coralSoft, P.butter, P.lavender, 0xffffff] }));
  },
};
