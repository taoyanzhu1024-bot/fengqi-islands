// 滑翔小浮岛：风铃屿 / 望云屿 / 小灯屿
import * as THREE from 'three';
import { smoothstep } from '../../core/utils.js';
import { PALETTE as P } from '../../config.js';
import * as pr from '../props.js';
import { grassField, flowerField } from '../vegetation.js';

const _c = new THREE.Color();

export const isletTheme = {
  color(isl, x, z, h, t, out) {
    const n = isl.noise.fbm(x * 0.08, z * 0.08, 3);
    return out.set(0x9cb68a).lerp(_c.set(0xc6d49c), smoothstep(-0.3, 0.6, n));
  },
  prepare(isl) { isl.keep.push({ x: 0, z: 0, r: 3.5 }); },
  populate(isl, ctx, b) {
    const r = isl.rand, v = isl.cfg.variant;
    if (v === 'bench') {
      pr.bench(b, ctx.at(isl, 0, 0, 2.6));
      pr.tree(b, ctx.at(isl, 4, -3, 0, -0.2), { h: 4.5, r: 2.2, seed: 7 });
      ctx.collide(isl, 4, -3, 0.5, 5);
      // 风铃
      pr.flag(b, ctx.at(isl, -3, 2), P.goldLight, 3.5);
    } else if (v === 'flag') {
      pr.flag(b, ctx.at(isl, 0, 0), P.coral, 6);
      pr.rock(b, ctx.at(isl, 3, 2, 1), 1.4, P.stone, 2);
    } else {
      pr.house(b, ctx.at(isl, 0, 0, 0.5), { w: 4, d: 3.6, h: 2.8, roof: P.sageDark });
      ctx.box(isl, 0, 0, 2.3, 2.1, -0.5, 6);
      pr.lamp(b, ctx.at(isl, 4, 3), { h: 4 });
      for (let i = 0; i < 3; i++) pr.mushroom(b, ctx.at(isl, -4 + i, 4 - i * 0.5), { s: 0.4, h: 0.5, cap: P.coral });
    }
    for (let i = 0; i < 4; i++) {
      const [x, z] = isl.randomPoint(0.85);
      if (!isl.isFree(x, z, 1, 1)) continue;
      pr.rock(b, ctx.at(isl, x, z, r() * 6, -0.2), 0.5 + r() * 0.8, P.stone, i);
    }
    ctx.scene.add(grassField(isl, { count: 2200, base: 0x7d9a72, tip: 0xc1d194, h: [0.35, 0.8] }));
    ctx.scene.add(flowerField(isl, { count: 160, colors: [P.cream, P.coralSoft, P.butter] }));
  },
};
