// 雪鸣岛：高海拔冷色调，雪峰、雪松、冰晶、风铃神社、飘雪
import * as THREE from 'three';
import { smoothstep } from '../../core/utils.js';
import { PALETTE as P } from '../../config.js';
import * as pr from '../props.js';
import { grassField } from '../vegetation.js';
import { Swarm } from '../particles.js';

const _c = new THREE.Color();
const PEAK = [-18, -10];
const ROCK_COLD = [0xb5b4c8, 0x9fa6c4, 0x8590b4, 0x6c7698].map((h) => new THREE.Color(h));

export const snowTheme = {
  rockPalette: ROCK_COLD,
  shape(isl, x, z) {
    const d = Math.hypot(x - PEAK[0], z - PEAK[1]);
    const ridge = isl.noise.noise(x * 0.06, z * 0.06) * 3;
    return 38 * Math.exp(-(d * d) / (2 * 22 * 22)) + ridge * Math.exp(-(d * d) / (2 * 30 * 30));
  },
  color(isl, x, z, h, t, out) {
    const n = isl.noise.fbm(x * 0.06, z * 0.06, 3);
    out.set(0xeef0f6).lerp(_c.set(0xc9d2e6), smoothstep(-0.2, 0.6, n) * 0.6);
    // 低处露出的冷绿草甸
    const meadow = smoothstep(0.1, 0.5, isl.noise.noise(x * 0.03 + 5, z * 0.03)) * (1 - smoothstep(4, 10, h));
    out.lerp(_c.set(0xa7b9a8), meadow * 0.7);
    return out;
  },
  prepare(isl) {
    const st = isl.station.local;
    this.shrine = [32, 20];
    isl.flats.push({ x: this.shrine[0], z: this.shrine[1], r: 5, blend: 5, h: isl.baseHeight(...this.shrine) });
    isl.keep.push({ x: this.shrine[0], z: this.shrine[1], r: 6 });
    isl.addPath([[st.x, st.z], [st.x * 0.5 + 10, st.z * 0.5], [this.shrine[0], this.shrine[1] + 4]], 1.3);
    this.meadowMask = (x, z) => smoothstep(0.1, 0.45, isl.noise.noise(x * 0.03 + 5, z * 0.03));
  },
  populate(isl, ctx, b) {
    const r = isl.rand;
    pr.bellShrine(b, ctx.at(isl, this.shrine[0], this.shrine[1], 0.6));
    for (let i = 0; i < 4; i++) pr.lamp(b, ctx.at(isl, this.shrine[0] - 6 + i * 4, this.shrine[1] + 6), { glow: 0xdfeaff });
    for (let i = 0, n = 0; i < 600 && n < 45; i++) {
      const [x, z] = isl.randomPoint(0.92);
      const h = isl.localHeight(x, z);
      if (h === null || h > 22 || !isl.isFree(x, z, 2.5, 3)) continue;
      const th = 6 + r() * 6;
      pr.pine(b, ctx.at(isl, x, z, 0, -0.3), { h: th, w: 1.8 + r(), seed: 400 + i, snow: true, color: 0x557a72 });
      ctx.collide(isl, x, z, 0.5, th);
      isl.keep.push({ x, z, r: 1.8 });
      n++;
    }
    for (let i = 0; i < 26; i++) {
      const [x, z] = isl.randomPoint(0.9);
      if (!isl.isFree(x, z, 1.5, 2)) continue;
      const s = 0.6 + r() * 1.6;
      pr.crystal(b, ctx.at(isl, x, z, r() * 6, -0.3), s, r() < 0.5 ? P.ice : 0xd6d0f0);
      if (s > 1.2) ctx.collide(isl, x, z, s * 0.4, 4);
    }
    ctx.stones(isl, b);
    ctx.scene.add(new Swarm({
      count: 500, center: isl.center.clone().add(new THREE.Vector3(0, 20, 0)), box: new THREE.Vector3(220, 60, 220),
      vel: new THREE.Vector3(1.2, -2.2, 0.5), size: 0.22, colorA: 0xffffff, colorB: 0xe4ecff, shape: 1, jitter: 1.5, seed: 31,
    }).points);
    ctx.scene.add(grassField(isl, { count: 5000, base: 0x7d9488, tip: 0xbfcbbf, h: [0.25, 0.55], mask: this.meadowMask }));
  },
};
