// 花海岛：大片色带花田、开阔草坡、白色凉亭、彩色小风车、樱花树
import * as THREE from 'three';
import { smoothstep } from '../../core/utils.js';
import { PALETTE as P } from '../../config.js';
import * as pr from '../props.js';
import { DETAILS } from './details.js';
import { grassField, flowerField } from '../vegetation.js';
import { waterfall, Swarm } from '../particles.js';

const _c = new THREE.Color();
const BANDS = [0xf0b4c2, 0xf6e6d2, 0xbcb0dc, 0xf2d98a, 0xeea58f, 0xf7c9d4];
const band = (isl, x, z) => {
  const v = isl.noise.noise(x * 0.012 + 40, z * 0.03 + x * 0.006) * 0.5 + 0.5;
  return Math.min(BANDS.length - 1, Math.floor(v * BANDS.length));
};
const PAV = [-10, -18];

export const flowerTheme = {
  shape(isl, x, z) {
    return 9 * Math.exp(-((x - PAV[0]) ** 2 + (z - PAV[1]) ** 2) / (2 * 30 * 30)) + Math.sin(x * 0.05) * 1.5;
  },
  color(isl, x, z, h, t, out) {
    const n = isl.noise.fbm(x * 0.04, z * 0.04, 3);
    out.set(0xa5bd8a).lerp(_c.set(0xc8d49a), smoothstep(-0.3, 0.6, n));
    const fm = smoothstep(0.05, 0.35, isl.noise.noise(x * 0.02 + 9, z * 0.02 - 4));
    out.lerp(_c.set(BANDS[band(isl, x, z)]), fm * 0.55);
    return out;
  },
  prepare(isl) {
    const st = isl.station.local;
    isl.flats.push({ x: PAV[0], z: PAV[1], r: 5, blend: 6, h: isl.baseHeight(PAV[0], PAV[1]) });
    isl.keep.push({ x: PAV[0], z: PAV[1], r: 6 });
    isl.addPath([[st.x, st.z], [st.x * 0.5, st.z * 0.5 + 6], [PAV[0] + 4, PAV[1] + 6]], 1.4);
    isl.addPath([[PAV[0] - 4, PAV[1] - 4], [-40, -40], [-55, -30]], 1.3);
    this.mills = [[36, -30], [48, 10], [-50, 22]];
    this.mills.forEach(([x, z]) => {
      isl.flats.push({ x, z, r: 3.5, blend: 4, h: isl.baseHeight(x, z) });
      isl.keep.push({ x, z, r: 4 });
    });
  },
  populate(isl, ctx, b) {
    const r = isl.rand;
    pr.pavilion(b, ctx.at(isl, PAV[0], PAV[1]), { roof: P.coralSoft });
    pr.bench(b, ctx.at(isl, PAV[0], PAV[1] + 1.5, Math.PI));
    ctx.disc(isl, PAV[0], PAV[1], 4.0, 0.45);
    const cols = [[P.cream, P.coral], [P.cream, P.lavender], [0xf3e4cf, P.sageDark]];
    this.mills.forEach(([x, z], i) => {
      const wm = pr.windmill(b, ctx.at(isl, x, z, r() * 6, -0.2), { h: 8, roof: cols[i][1], sail: 0xfff7ea });
      isl.group.add(wm.pivot);
      const sp = 0.5 + r() * 0.3;
      ctx.anim.push((dt) => (wm.rotor.rotation.z += dt * sp));
      ctx.collide(isl, x, z, 2.5, 11);
    });
    // 樱花树
    for (let i = 0, n = 0; i < 300 && n < 12; i++) {
      const [x, z] = isl.randomPoint(0.9);
      if (!isl.isFree(x, z, 5, 3)) continue;
      const h = 4 + r() * 2, cr = 2.2 + r();
      pr.tree(b, ctx.at(isl, x, z, r() * 6, -0.2), { h, r: cr, seed: i + 50, leaf: 0xf2bcc8, leafLight: 0xfbe0e4, trunk: 0x8d6b5c });
      ctx.collide(isl, x, z, 0.5, h);
      isl.addShade(x, z, h, cr, 0.35);
      isl.keep.push({ x, z, r: 2 });
      n++;
    }
    // 蜂箱与小篱笆
    for (let i = 0; i < 4; i++) pr.crate(b, ctx.at(isl, 30 + i * 1.6, 34, 0.1, -0.1), 0.8);
    ctx.stones(isl, b);
    ctx.scene.add(new Swarm({
      count: 140, center: isl.center.clone().add(new THREE.Vector3(0, 10, 0)), box: new THREE.Vector3(160, 22, 160),
      vel: new THREE.Vector3(1.6, -0.25, 0.7), size: 0.32, colorA: 0xf3b6c4, colorB: 0xfff1e6, jitter: 2, seed: 9,
    }).points);
    ctx.mist(waterfall(isl, 0.4, { width: 5, len: 110 }), 50);
    ctx.mist(waterfall(isl, 2.1, { width: 3, len: 80 }), 34);
    ctx.mist(waterfall(isl, -2.4, { width: 3.5, len: 90 }), 36);

    DETAILS.flower(isl, ctx, b, this);
    ctx.scene.add(grassField(isl, { count: 16000, base: 0x8aa477, tip: 0xc4d496, tip2: 0xe4dca2, h: [0.3, 0.7] }));
    ctx.scene.add(flowerField(isl, {
      count: 14000, size: 0.15, lift: 0.5,
      pick: (x, z, rr) => {
        const fm = isl.noise.noise(x * 0.02 + 9, z * 0.02 - 4);
        if (fm < -0.05 && rr() < 0.85) return null;
        return BANDS[band(isl, x, z)];
      },
    }));
  },
};
