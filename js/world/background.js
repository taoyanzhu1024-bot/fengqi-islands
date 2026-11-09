// ============================================================
// 远景：散布的小浮岛（合并为少量网格）、天空之城艾瑟兰、飞鸟群
// ============================================================
import * as THREE from 'three';
import { Batcher, GEO, T, blob } from '../core/batcher.js';
import { wc, MATS } from '../core/materials.js';
import { mulberry32 } from '../core/noise.js';
import { smoothstep } from '../core/utils.js';
import { PALETTE as P, CASTLE } from '../config.js';
import { Island } from './terrain.js';

const _c = new THREE.Color();

function mergeIndexed(list) {
  let vc = 0, ic = 0;
  for (const g of list) { vc += g.attributes.position.count; ic += g.index.count; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), col = new Float32Array(vc * 3), idx = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    col.set(g.attributes.color.array, vo * 3);
    const src = g.index.array;
    for (let i = 0; i < src.length; i++) idx[io + i] = src[i] + vo;
    vo += g.attributes.position.count; io += src.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

const GREENS = [0x9db58f, 0xb0c690, 0x8fae8a, 0xc0cf9c, 0xe8d6c0, 0xd9c7d6];

/** 远景浮岛：avoid 为需要避让的点（主题岛、轨道采样点） */
export function distantIslets(scene, avoid, trackPts) {
  const r = mulberry32(2024);
  const tops = [], rocks = [];
  const b = new Batcher();
  let made = 0;
  const tryPlace = (x, y, z, R) => {
    for (const a of avoid) if (Math.hypot(a.x - x, a.z - z) < a.r + R + 60 && Math.abs(a.y - y) < 250) return false;
    for (let i = 0; i < trackPts.length; i += 6) {
      const p = trackPts[i];
      if (Math.hypot(p.x - x, p.z - z) < R * 1.3 + 30 && p.y < y + 25 && p.y > y - R * 2.2) return false;
    }
    return true;
  };
  for (let i = 0; i < 400 && made < 70; i++) {
    const a = r() * Math.PI * 2;
    const near = r() < 0.35;
    const d = near ? 350 + r() * 900 : 1400 + r() * 2600;
    const x = 150 + Math.cos(a) * d, z = 200 + Math.sin(a) * d;
    const R = near ? 10 + r() * 24 : 25 + r() * 70;
    const y = -200 + r() * 600;
    if (!tryPlace(x, y, z, R)) continue;
    const col = GREENS[Math.floor(r() * GREENS.length)];
    const isl = new Island({ id: 'bg' + i, center: [x, y, z], radius: R, depth: R * (1.6 + r() * 1.6), seed: 500 + i, hill: R * 0.05 }, {
      color: (s, lx, lz, h, t, out) => out.set(col).lerp(_c.set(0xc8d5a2), smoothstep(-0.4, 0.6, s.noise.noise(lx * 0.05, lz * 0.05)) * 0.5),
    });
    const tg = isl.buildTop(4, 28); tg.translate(x, y, z); tops.push(tg);
    const rg = isl.buildRock(6, 28); rg.translate(x, y, z); rocks.push(rg);
    // 树团 / 小屋点缀
    const trees = Math.floor(R / 8);
    for (let k = 0; k < trees; k++) {
      const [lx, lz] = isl.randomPoint(0.7);
      const h = isl.localHeight(lx, lz) ?? 0;
      const s = 2 + r() * R * 0.08;
      b.add('solid', blob(k % 4), r() < 0.2 ? 0xe9c56a : 0x88a984, T(new THREE.Matrix4(), x + lx, y + h + s * 1.3, z + lz, 0, r() * 6, 0, s, s * 0.9, s));
    }
    if (r() < 0.25) {
      const [lx, lz] = isl.randomPoint(0.3);
      const h = isl.localHeight(lx, lz) ?? 0;
      b.add('solid', GEO.box, P.cream, T(new THREE.Matrix4(), x + lx, y + h + 2, z + lz, 0, r() * 3, 0, 4, 4, 4));
      b.add('flat', GEO.cone4, P.coral, T(new THREE.Matrix4(), x + lx, y + h + 5.5, z + lz, 0, r() * 3, 0, 3.6, 3, 3.6));
    }
    made++;
  }
  const top = new THREE.Mesh(mergeIndexed(tops), wc({ vertexColors: true }));
  const rock = new THREE.Mesh(mergeIndexed(rocks), wc({ vertexColors: true, flat: true }));
  scene.add(top, rock);
  b.build().forEach((m) => { m.castShadow = false; scene.add(m); });
  return made;
}

/** 天空之城：极远处的视觉目标（自带空气透视，不受普通雾影响） */
export function skyCastle(scene) {
  const [cx, cy, cz] = CASTLE.pos;
  const g = new THREE.Group();
  g.position.set(cx, cy, cz);
  const isl = new Island({ id: 'castle', center: [0, 0, 0], radius: 240, depth: 560, seed: 909, hill: 4 }, {
    color: (s, x, z, h, t, out) => out.set(0xb8c9a2).lerp(_c.set(0xe2e0c8), smoothstep(-0.3, 0.5, s.noise.noise(x * 0.01, z * 0.01))),
  });
  const hz = wc({ vertexColors: true, haze: 0.45, fog: false });
  const hzf = wc({ vertexColors: true, flat: true, haze: 0.45, fog: false });
  g.add(new THREE.Mesh(isl.buildTop(10, 72), hz), new THREE.Mesh(isl.buildRock(12, 72), hzf));
  const b = new Batcher();
  const I = new THREE.Matrix4();
  // 中央主塔
  b.add('hazeSolid', GEO.cyl16, P.cream, T(I, 0, 90, 0, 0, 0, 0, 30, 180, 30));
  b.add('hazeSolid', GEO.cyl16, P.gold, T(I, 0, 182, 0, 0, 0, 0, 33, 6, 33));
  b.add('hazeSolid', GEO.cyl16, P.cream, T(I, 0, 215, 0, 0, 0, 0, 18, 60, 18));
  b.add('hazeSolid', GEO.cone12, P.sageDark, T(I, 0, 280, 0, 0, 0, 0, 24, 70, 24));
  b.add('hazeSolid', GEO.cyl6, P.gold, T(I, 0, 330, 0, 0, 0, 0, 1.5, 40, 1.5));
  for (let i = 0; i < 6; i++) b.add('hazeGlow', GEO.box, 0xffe6b0, T(I, Math.sin(i) * 30.5, 60 + i * 20, Math.cos(i) * 30.5, 0, i, 0, 3, 7, 3));
  // 环形塔楼与城墙
  const N = 9;
  const towers = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, R = 120 + (i % 3) * 22;
    const x = Math.cos(a) * R, z = Math.sin(a) * R;
    const h = 60 + ((i * 37) % 70), r = 9 + (i % 3) * 3;
    b.add('hazeSolid', GEO.cyl12, i % 2 ? P.cream : 0xf0e2cc, T(I, x, h / 2, z, 0, 0, 0, r, h, r));
    b.add('hazeSolid', GEO.cone12, i % 3 === 0 ? P.coral : i % 3 === 1 ? P.sageDark : 0x8fa7c8, T(I, x, h + r * 1.3, z, 0, 0, 0, r * 1.3, r * 2.8, r * 1.3));
    b.add('hazeSolid', GEO.cyl6, P.gold, T(I, x, h + r * 3.2, z, 0, 0, 0, 0.6, 10, 0.6));
    b.add('hazeGlow', GEO.box, 0xffe6b0, T(I, x + Math.cos(a) * r, h * 0.7, z + Math.sin(a) * r, 0, -a, 0, 2, 4, 2));
    towers.push([x, z]);
  }
  for (let i = 0; i < N; i++) {
    const [x0, z0] = towers[i], [x1, z1] = towers[(i + 1) % N];
    b.segment('hazeSolid', 0xe8dcc4, I, [x0, 18, z0], [x1, 18, z1], 4, GEO.box);
  }
  // 中层宫殿
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * 60, z = Math.sin(a) * 60;
    b.add('hazeSolid', GEO.box, P.cream, T(I, x, 25, z, 0, -a, 0, 34, 50, 24));
    b.add('hazeSolid', GEO.prism, P.coral, T(I, x, 50 + 10, z, 0, -a + Math.PI / 2, 0, 16, 13, 36));
    b.segment('hazeSolid', P.gold, I, [x * 0.5, 120, z * 0.5], [x, 52, z], 1.4, GEO.cyl6);
  }
  // 绿树团
  const r = mulberry32(5);
  for (let i = 0; i < 40; i++) {
    const [x, z] = isl.randomPoint(0.95);
    if (Math.hypot(x, z) < 40) continue;
    const s = 8 + r() * 10;
    b.add('hazeSolid', blob(i % 4), r() < 0.25 ? 0xe9c56a : 0x9cbb92, T(I, x, (isl.localHeight(x, z) ?? 0) + s, z, 0, r() * 6, 0, s));
  }
  b.build().forEach((m) => g.add(m));
  // 卫星小岛
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, d = 380 + r() * 260;
    const s = new Island({ id: 'cs' + i, center: [0, 0, 0], radius: 25 + r() * 40, depth: 120, seed: 950 + i, hill: 1 }, {
      color: (q, x, z, h, t, out) => out.set(0xb8c9a2),
    });
    const t = new THREE.Mesh(s.buildTop(3, 20), hz), k = new THREE.Mesh(s.buildRock(5, 20), hzf);
    const grp = new THREE.Group(); grp.add(t, k);
    grp.position.set(Math.cos(a) * d, -100 + r() * 300, Math.sin(a) * d);
    g.add(grp);
  }
  g.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  scene.add(g);
  return g;
}

/** 飞鸟群：简单 V 形翅膀拍动 */
export function birdFlocks(scene, anim, extra = []) {
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.3, 0, 0, -0.3, 1.4, 0, -0.1], 3));
  wingGeo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: 0x6b6f86, side: THREE.DoubleSide });
  const r = mulberry32(88);
  const flocks = [
    { c: [0, 40, -60], R: 120 }, { c: [560, 70, -430], R: 160 }, { c: [-420, 80, 700], R: 120 },
    { c: [300, 60, 300], R: 260 }, { c: [-700, 170, -40], R: 140 }, ...extra,
  ];
  flocks.forEach((f, fi) => {
    const grp = new THREE.Group();
    const birds = [];
    for (let i = 0; i < 7; i++) {
      const bird = new THREE.Group();
      const L = new THREE.Mesh(wingGeo, mat), Rw = new THREE.Mesh(wingGeo, mat);
      Rw.scale.x = -1;
      bird.add(L, Rw);
      bird.position.set((r() - 0.5) * 14, (r() - 0.5) * 5, (r() - 0.5) * 14);
      bird.scale.setScalar(0.9 + r() * 0.4);
      grp.add(bird);
      birds.push({ bird, L, Rw, ph: r() * 6 });
    }
    scene.add(grp);
    const sp = (0.05 + r() * 0.03) * (fi % 2 ? 1 : -1);
    anim.push((dt, t) => {
      const a = t * sp + fi;
      grp.position.set(f.c[0] + Math.cos(a) * f.R, f.c[1] + Math.sin(t * 0.2 + fi) * 8, f.c[2] + Math.sin(a) * f.R);
      grp.rotation.y = Math.atan2(-Math.sin(a) * Math.sign(sp), Math.cos(a) * Math.sign(sp));
      for (const b of birds) {
        const w = Math.sin(t * 7 + b.ph) * 0.6;
        b.L.rotation.z = w; b.Rw.rotation.z = -w;
      }
    });
  });
}
