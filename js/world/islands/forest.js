// 森林岛：参天巨树、成片林木、发光蘑菇与植物、萤火虫
import * as THREE from 'three';
import { smoothstep } from '../../core/utils.js';
import { PALETTE as P } from '../../config.js';
import * as pr from '../props.js';
import { grassField } from '../vegetation.js';
import { waterfall, Swarm } from '../particles.js';

const _c = new THREE.Color();

export const forestTheme = {
  color(isl, x, z, h, t, out) {
    const n = isl.noise.fbm(x * 0.04, z * 0.04, 3);
    out.set(0x6f9278).lerp(_c.set(0x98b68b), smoothstep(-0.3, 0.6, n));
    return out;
  },
  prepare(isl) {
    const st = isl.station.local;
    this.giants = [[-20, 10], [25, -30], [30, 35], [-45, -35], [-50, 40], [55, 0]];
    this.giants.forEach(([x, z]) => isl.keep.push({ x, z, r: 9 }));
    isl.addPath([[st.x, st.z], [st.x * 0.6, st.z * 0.6], [0, 0], [-30, -10], [-62, -10]], 1.4);
    isl.addStream([[10, 10], [28, 14], [50, 22], [80, 32], [110, 40]]);
  },
  populate(isl, ctx, b) {
    const r = isl.rand;
    this.giants.forEach(([x, z], i) => {
      const H = 34 + r() * 14, R = 2.6 + r() * 1.2;
      pr.giantTree(b, ctx.at(isl, x, z, r() * 6, -0.5), { h: H, r: R, seed: i + 10 });
      ctx.collide(isl, x, z, R * 1.2, H);
      isl.addShade(x, z, H * 0.8, R * 5, 0.6);
    });
    // 普通林木
    for (let i = 0, n = 0; i < 900 && n < 70; i++) {
      const [x, z] = isl.randomPoint(0.93);
      if (!isl.isFree(x, z, 2.5, 3)) continue;
      const h = 5 + r() * 6, cr = 1.8 + r() * 1.5;
      pr.tree(b, ctx.at(isl, x, z, r() * 6, -0.2), { h, r: cr, seed: 300 + i, leaf: [0x6e9a7f, 0x7fa688, 0x5d8770][i % 3], leafLight: 0xa6c49a, trunk: 0x7d6656 });
      ctx.collide(isl, x, z, 0.5, h);
      isl.addShade(x, z, h, cr, 0.45);
      isl.keep.push({ x, z, r: 1.8 });
      n++;
    }
    // 发光蘑菇与植物
    for (let i = 0; i < 70; i++) {
      const [x, z] = isl.randomPoint(0.92);
      if (!isl.isFree(x, z, 0.5, 1.6)) continue;
      if (r() < 0.55) pr.mushroom(b, ctx.at(isl, x, z, r() * 6, -0.05), { h: 0.4 + r() * 0.9, s: 0.3 + r() * 0.6, glow: r() < 0.7, cap: r() < 0.5 ? P.glowMint : 0xf3c3a0 });
      else pr.glowPlant(b, ctx.at(isl, x, z, 0, -0.05), r, r() < 0.5 ? P.glowMint : 0xc8b8ff);
    }
    for (let i = 0; i < 20; i++) {
      const [x, z] = isl.randomPoint(0.95);
      if (!isl.isFree(x, z, 1, 2)) continue;
      pr.rock(b, ctx.at(isl, x, z, r() * 6, -0.3), 0.8 + r() * 1.8, 0x9fae98, i);
    }
    ctx.stones(isl, b);
    ctx.scene.add(new Swarm({
      count: 260, center: isl.center.clone().add(new THREE.Vector3(0, 5, 0)), box: new THREE.Vector3(180, 12, 180),
      vel: new THREE.Vector3(0.2, 0.1, 0.15), size: 0.5, colorA: 0xd8ffb0, colorB: 0x9ff3d8, shape: 2, additive: true, jitter: 2.5, seed: 21,
    }).points);
    ctx.mist(waterfall(isl, Math.atan2(40, 110), { width: 5, len: 130 }), 55);
    ctx.mist(waterfall(isl, 2.6, { width: 3, len: 100 }), 40);
    ctx.scene.add(grassField(isl, { count: 14000, base: 0x5c8166, tip: 0x93b388, tip2: 0xa8c896, h: [0.4, 1.1] }));
  },
};
