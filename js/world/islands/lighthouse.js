// 灯塔岛：临云海边缘的高崖、旋转光束的灯塔、守塔人小屋、远眺点
import * as THREE from 'three';
import { smoothstep } from '../../core/utils.js';
import { PALETTE as P } from '../../config.js';
import * as pr from '../props.js';
import { grassField, flowerField } from '../vegetation.js';
import { waterfall } from '../particles.js';

const _c = new THREE.Color();
const LH = [-22, 26]; // 灯塔位于外侧高崖（远离环线中心）

export const lighthouseTheme = {
  shape(isl, x, z) {
    const d = Math.hypot(x - LH[0], z - LH[1]);
    return 16 * Math.exp(-(d * d) / (2 * 26 * 26));
  },
  color(isl, x, z, h, t, out) {
    const n = isl.noise.fbm(x * 0.05, z * 0.05, 3);
    out.set(0x9fb796).lerp(_c.set(0xc9d4a6), smoothstep(-0.3, 0.6, n));
    if (h > 12) out.lerp(_c.set(0xd7d0b8), smoothstep(12, 16, h) * 0.4);
    return out;
  },
  prepare(isl) {
    const st = isl.station.local;
    const top = isl.baseHeight(LH[0], LH[1]);
    isl.flats.push({ x: LH[0], z: LH[1], r: 7, blend: 6, h: top });
    isl.flats.push({ x: LH[0] + 12, z: LH[1] - 6, r: 5, blend: 5, h: isl.baseHeight(LH[0] + 12, LH[1] - 6) });
    isl.keep.push({ x: LH[0], z: LH[1], r: 7 }, { x: LH[0] + 12, z: LH[1] - 6, r: 5 });
    isl.addPath([[st.x, st.z], [st.x * 0.4, st.z * 0.4], [LH[0] + 8, LH[1] - 3], [LH[0] + 3, LH[1] + 1]], 1.3);
  },
  populate(isl, ctx, b) {
    const r = isl.rand;
    const info = pr.lighthouse(b, ctx.at(isl, LH[0], LH[1], 2.4, -0.3));
    ctx.collide(isl, LH[0], LH[1], 3.6, 40);
    pr.house(b, ctx.at(isl, LH[0] + 12, LH[1] - 6, 1.9), { w: 5, d: 4.2, h: 3, roof: P.sageDark });
    ctx.box(isl, LH[0] + 12, LH[1] - 6, 2.8, 2.4, -1.9, 8);
    // 旋转光束
    const y0 = isl.localHeight(...LH) - 0.3 + info.lanternY;
    const beamGeo = new THREE.ConeGeometry(7, 90, 20, 1, true);
    beamGeo.translate(0, -45, 0); beamGeo.rotateZ(Math.PI / 2);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    const pivot = new THREE.Group(); pivot.position.set(LH[0], y0, LH[1]); pivot.add(beam);
    isl.group.add(pivot);
    ctx.anim.push((dt) => (pivot.rotation.y += dt * 0.35));
    // 观景点：灯塔脚下望向云海与天空之城
    const vp = [LH[0] - 6, LH[1] + 6];
    pr.bench(b, ctx.at(isl, vp[0], vp[1], -0.8));
    pr.telescope(b, ctx.at(isl, vp[0] - 2, vp[1] + 2, -0.8));
    ctx.viewpoint(isl, vp[0], vp[1], 'lighthouse', '按 <b>E</b> 在灯塔下远眺云海');
    pr.fence(b, new THREE.Matrix4(), [[-34, 30], [-38, 22], [-38, 12], [-33, 4]].map(([x, z]) => [x, isl.localHeight(x, z) ?? 0, z]));
    for (let i = 0; i < 12; i++) {
      const [x, z] = isl.randomPoint(0.92);
      if (!isl.isFree(x, z, 1, 2.5)) continue;
      pr.rock(b, ctx.at(isl, x, z, r() * 6, -0.3), 0.8 + r() * 1.5, 0xcfc8ba, i);
    }
    for (let i = 0, n = 0; i < 200 && n < 6; i++) {
      const [x, z] = isl.randomPoint(0.85);
      if (!isl.isFree(x, z, 4, 3)) continue;
      pr.pine(b, ctx.at(isl, x, z, 0, -0.3), { h: 6 + r() * 3, w: 2, seed: i, color: 0x6f907e });
      ctx.collide(isl, x, z, 0.5, 8);
      n++;
    }
    ctx.stones(isl, b);
    ctx.mist(waterfall(isl, 0.9, { width: 2.5, len: 120 }), 40);
    ctx.scene.add(grassField(isl, { count: 9000, base: 0x7f9d78, tip: 0xc5d29c, tip2: 0xe6e0b0, h: [0.4, 1.0] }));
    ctx.scene.add(flowerField(isl, { count: 700, colors: [0xffffff, P.cream, P.lavender] }));
  },
};
