// ============================================================
// 「风栖号」云轨列车（V2）
// - 车头 + 三节有真实内部空间的客车
// - 部件拆分为独立网格：车身外壳 / 车厢内饰 / 车窗玻璃 / 灯具 / 车门 / 车轮 / 烟囱 / 前灯 / 连杆
// - 每节客车提供镜头锚点：车窗座位、车厢内部；玩家座位
// - 所有模型均为代码程序化建模（不是 Blender/GLB 资产），见 docs/ASSETS.md
// 约定：车辆局部 +Z 为前进方向，原点在轨面中心，地板面 y = FLOOR
// ============================================================
import * as THREE from 'three';
import { Batcher, GEO, M, T } from '../core/batcher.js';
import { wc } from '../core/materials.js';

export const COL = {
  cream: 0xf5ecd9, creamDark: 0xe6d6b8, sage: 0x9db58f, sageDark: 0x6f8f74, blue: 0x4b6382, blueDeep: 0x3c4f6b,
  teal: 0x88aca6, gold: 0xd2a052, goldLight: 0xe8c98a, copper: 0xc58a5a, wood: 0xa77b5a, woodDark: 0x7d5a45,
  woodLight: 0xc49a72, cushion: 0x8fae8a, cushion2: 0xd99a86, rug: 0xc98a7a, curtain: 0xe9b7a3, lamp: 0xffdca0, glass: 0xcfe6ef,
};
export const FLOOR = 1.15;
const W = 2.8;             // 客车宽
const CAR_L = 12;          // 客车长
const LOCO_L = 10.5;
const GAP = 0.8;
export const CAR_LEN = [LOCO_L, CAR_L, CAR_L, CAR_L];

// 材质（列车专用，便于昼夜调节）
export const TRAIN_MATS = {
  shell: wc({ vertexColors: true, grain: 0.7 }),
  shellFlat: wc({ vertexColors: true, flat: true, grain: 0.6 }),
  interior: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a2c22, emissiveIntensity: 0.35 }),
  glass: new THREE.MeshBasicMaterial({ color: COL.glass, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }),
  lamp: new THREE.MeshBasicMaterial({ vertexColors: true }),
  door: wc({ vertexColors: true }),
  wheel: wc({ color: COL.blueDeep, flat: true }),
  hub: wc({ color: COL.gold }),
};
TRAIN_MATS.interior.side = THREE.DoubleSide;

const ARCH = new THREE.TorusGeometry(1, 0.08, 6, 12, Math.PI); // 半圆拱（窗顶）
const archGeo = (r, len, theta, seg = 14) => {
  // 圆弧屋顶：沿 Z 的圆柱面片，开口朝下
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true, -theta / 2, theta);
  g.rotateX(-Math.PI / 2); // 轴向 Z，弧顶朝 +Y
  return g;
};

function meshFrom(b, mats) {
  const g = new THREE.Group();
  b.build(mats).forEach((m) => g.add(m));
  return g;
}

// ---------------- 车轮 ----------------
function wheelMesh(r, spokes = 8) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.14, 20).rotateZ(Math.PI / 2), TRAIN_MATS.wheel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.82, r * 0.06, 6, 20).rotateY(Math.PI / 2), TRAIN_MATS.hub);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.2, 10).rotateZ(Math.PI / 2), TRAIN_MATS.hub);
  g.add(tire, rim, hub);
  for (let i = 0; i < spokes; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, r * 1.6, 0.05), TRAIN_MATS.hub);
    s.rotation.x = (i / spokes) * Math.PI;
    s.position.x = 0.075;
    g.add(s);
  }
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

// ---------------- 客车 ----------------
function buildCoach(index, opts = {}) {
  const car = new THREE.Group(); car.name = `coach${index}`;
  const L = CAR_L, hw = W / 2;
  const I = new THREE.Matrix4();
  const ext = new Batcher(), inn = new Batcher(), glass = new Batcher(), lamp = new Batcher();
  // —— 底架与转向架 ——
  ext.add('shell', GEO.box, COL.blueDeep, T(I, 0, 0.88, 0, 0, 0, 0, W - 0.5, 0.36, L - 0.6));
  ext.add('shell', GEO.box, COL.gold, T(I, 0, 1.08, 0, 0, 0, 0, W + 0.04, 0.06, L));
  for (const z of [-L / 2 + 2.3, L / 2 - 2.3]) {
    ext.add('shellFlat', GEO.box, COL.blue, T(I, 0, 0.55, z, 0, 0, 0, 1.9, 0.3, 2.6));
    ext.add('shell', GEO.cyl8, COL.gold, T(I, 0, 0.35, z, 0, 0, Math.PI / 2, 0.08, 1.8, 0.08));
  }
  // —— 侧墙（带窗洞） ——
  const doorZ = L / 2 - 0.85, doorW = 1.0;
  const winN = 5, zone0 = -L / 2 + 1.7, zone1 = L / 2 - 1.7, winW = 1.22;
  const pillar = (zone1 - zone0 - winN * winW) / (winN + 1);
  const winC = [];
  for (let k = 0; k < winN; k++) winC.push(zone0 + pillar + winW / 2 + k * (winW + pillar));
  const yLow0 = FLOOR - 0.05, yLow1 = FLOOR + 0.85, yWin1 = FLOOR + 1.85, yTop = FLOOR + 2.25;
  for (const sx of [-1, 1]) {
    const x = sx * hw;
    // 门洞两侧之间的下部墙板、上部腰带
    const span = (z0, z1, y0, y1, c, kind = 'shell') => ext.add(kind, GEO.box, c, T(I, x, (y0 + y1) / 2, (z0 + z1) / 2, 0, 0, 0, 0.1, y1 - y0, z1 - z0));
    span(-doorZ + doorW / 2, doorZ - doorW / 2, yLow0, yLow1, COL.sage);
    span(-L / 2, L / 2, yWin1, yTop, COL.cream);
    span(-L / 2, -doorZ - doorW / 2, yLow0, yWin1, COL.cream);
    span(doorZ + doorW / 2, L / 2, yLow0, yWin1, COL.cream);
    // 窗间立柱
    const pillars = [zone0, ...winC.map((c) => c + winW / 2)];
    pillars.forEach((pz, i) => { const z0 = i === 0 ? -doorZ + doorW / 2 : pz, z1 = i === 0 ? zone0 + pillar : pz + pillar; span(z0, z1, yLow1, yWin1, COL.cream); });
    span(winC[winN - 1] + winW / 2 + pillar, doorZ - doorW / 2, yLow1, yWin1, COL.cream);
    // 金色腰线、窗框、拱形窗顶
    ext.add('shell', GEO.box, COL.gold, T(I, x * 1.01, yLow1 + 0.02, 0, 0, 0, 0, 0.04, 0.06, L - 0.1));
    ext.add('shell', GEO.box, COL.gold, T(I, x * 1.01, yWin1 + 0.03, 0, 0, 0, 0, 0.04, 0.05, L - 0.1));
    for (const c of winC) {
      ext.add('shell', ARCH, COL.woodLight, T(I, x * 1.005, yWin1 - 0.28, c, 0, Math.PI / 2, 0, winW / 2, 0.42, 1.6));
      ext.add('shell', GEO.box, COL.woodLight, T(I, x * 1.005, (yLow1 + yWin1) / 2, c - winW / 2 + 0.03, 0, 0, 0, 0.06, yWin1 - yLow1, 0.06));
      ext.add('shell', GEO.box, COL.woodLight, T(I, x * 1.005, (yLow1 + yWin1) / 2, c + winW / 2 - 0.03, 0, 0, 0, 0.06, yWin1 - yLow1, 0.06));
      ext.add('shell', GEO.box, COL.woodLight, T(I, x * 1.005, yLow1 + 0.04, c, 0, 0, 0, 0.08, 0.06, winW));
      glass.add('glass', GEO.box, COL.glass, T(I, x, (yLow1 + yWin1) / 2, c, 0, 0, 0, 0.02, yWin1 - yLow1, winW - 0.04));
      // 窗帘（束起在两侧）
      for (const e of [-1, 1]) inn.add('interior', GEO.box, COL.curtain, T(I, x - sx * 0.09, (yLow1 + yWin1) / 2 + 0.15, c + e * (winW / 2 - 0.1), 0, 0, 0, 0.05, 0.8, 0.16));
      inn.add('interior', GEO.box, COL.woodDark, T(I, x - sx * 0.12, yLow1 + 0.06, c, 0, 0, 0, 0.18, 0.04, winW));
    }
    // 车门门框
    for (const dz of [-doorZ, doorZ]) {
      ext.add('shell', GEO.box, COL.gold, T(I, x * 1.01, FLOOR + 1.0, dz - doorW / 2, 0, 0, 0, 0.05, 2.1, 0.06));
      ext.add('shell', GEO.box, COL.gold, T(I, x * 1.01, FLOOR + 1.0, dz + doorW / 2, 0, 0, 0, 0.05, 2.1, 0.06));
      ext.add('shell', GEO.box, COL.gold, T(I, x * 1.01, FLOOR + 2.06, dz, 0, 0, 0, 0.05, 0.06, doorW + 0.06));
      ext.add('shell', GEO.box, COL.goldLight, T(I, x, 0.98, dz, 0, 0, 0, 0.5, 0.06, 0.8)); // 踏板
    }
  }
  // —— 端墙（带贯通门） ——
  for (const sz of [-1, 1]) {
    const z = sz * L / 2;
    const tail = opts.tail && sz < 0;      // 末节车厢尾端：封闭端墙 + 观景窗 + 尾灯
    for (const sx of [-1, 1]) ext.add('shell', GEO.box, COL.cream, T(I, sx * (hw - 0.45), (yLow0 + yTop) / 2, z, 0, 0, 0, 0.9, yTop - yLow0, 0.08));
    ext.add('shell', GEO.box, COL.cream, T(I, 0, yTop - 0.15, z, 0, 0, 0, 1.0, 0.3, 0.08));
    if (tail) {
      ext.add('shell', GEO.box, COL.sage, T(I, 0, (yLow0 + yLow1) / 2, z, 0, 0, 0, 1.0, yLow1 - yLow0, 0.08));
      ext.add('shell', GEO.box, COL.cream, T(I, 0, yWin1 - 0.05, z, 0, 0, 0, 1.0, yTop - yWin1 - 0.2, 0.08));
      glass.add('glass', GEO.box, COL.glass, T(I, 0, (yLow1 + yWin1) / 2, z, 0, 0, 0, 1.0, yWin1 - yLow1, 0.02));
      ext.add('shell', ARCH, COL.gold, T(I, 0, yWin1 - 0.3, z - 0.05, 0, 0, 0, 0.5, 0.45, 1.5));
      ext.add('shell', GEO.box, COL.gold, T(I, 0, yLow1, z - 0.06, 0, 0, 0, 1.1, 0.06, 0.08));
      for (const sx of [-1, 1]) {
        ext.add('shell', GEO.cyl8, COL.gold, T(I, sx * 0.95, 0.95, z - 0.1, Math.PI / 2, 0, 0, 0.13, 0.2, 0.13));
        lamp.add('lamp', GEO.sphereLo, 0xf0907a, T(I, sx * 1.1, FLOOR + 0.55, z - 0.07, 0, 0, 0, 0.11));
      }
      // 尾部小阳台
      ext.add('shell', GEO.box, COL.woodDark, T(I, 0, 1.05, z - 0.55, 0, 0, 0, W - 0.3, 0.08, 1.0));
      for (const sx of [-1, 0, 1]) ext.add('shell', GEO.cyl6, COL.gold, T(I, sx * 1.15, 1.55, z - 1.0, 0, 0, 0, 0.03, 1.0, 0.03));
      ext.add('shell', GEO.box, COL.gold, T(I, 0, 2.05, z - 1.0, 0, 0, 0, W - 0.2, 0.05, 0.05));
    } else {
      ext.add('shellFlat', GEO.box, 0x8a7f78, T(I, 0, FLOOR + 1.05, z + sz * 0.42, 0, 0, 0, 1.3, 2.2, 0.75)); // 风挡折棚
      for (let k = 0; k < 5; k++) ext.add('shell', GEO.box, 0x6e6466, T(I, 0, FLOOR + 1.05, z + sz * (0.1 + k * 0.15), 0, 0, 0, 1.36, 2.26, 0.03));
    }
    ext.add('shell', GEO.cyl8, COL.gold, T(I, 0.9, 0.9, z + sz * 0.12, Math.PI / 2, 0, 0, 0.1, 0.25, 0.1));
    ext.add('shell', GEO.cyl8, COL.gold, T(I, -0.9, 0.9, z + sz * 0.12, Math.PI / 2, 0, 0, 0.1, 0.25, 0.1));
    lamp.add('lamp', GEO.sphereLo, COL.lamp, T(I, hw - 0.25, yTop - 0.2, z + sz * 0.05, 0, 0, 0, 0.09));
  }
  // —— 拱形车顶（外：蓝绿；内：奶油色木肋顶棚） ——
  const roofR = 1.75;
  const roof = archGeo(roofR, L + 0.25, 1.85);
  roof.scale(1, 0.55, 1);
  ext.add('shell', roof, COL.teal, T(I, 0, yTop - roofR * 0.55 * Math.cos(0.925) + 0.02, 0));
  ext.add('shell', GEO.box, COL.cream, T(I, 0, yTop + 0.02, 0, 0, 0, 0, W + 0.12, 0.08, L + 0.3));
  for (let z = -L / 2 + 1.6; z < L / 2 - 1; z += 3.2) {          // 低矮的铜制通风罩
    ext.add('shell', GEO.dome, COL.copper, T(I, 0, yTop + 0.55, z, 0, 0, 0, 0.22, 0.12, 0.34));
    ext.add('shell', GEO.box, COL.gold, T(I, 0, yTop + 0.56, z, 0, 0, 0, 0.46, 0.03, 0.05));
  }
  const ceil = archGeo(roofR - 0.1, L - 0.1, 1.8);
  ceil.scale(1, 0.5, 1);
  inn.add('interior', ceil, COL.cream, T(I, 0, yTop - (roofR - 0.1) * 0.5 * Math.cos(0.9) - 0.02, 0));
  for (let z = -L / 2 + 0.8; z < L / 2; z += 1.5) {
    const rib = new THREE.TorusGeometry(roofR - 0.13, 0.04, 4, 12, 1.8);
    rib.rotateZ(Math.PI / 2 - 0.9); rib.scale(1, 0.5, 1);
    inn.add('interior', rib, COL.woodLight, T(I, 0, yTop - (roofR - 0.13) * 0.5 * Math.cos(0.9) - 0.02, z));
  }
  // —— 车厢内部 ——
  inn.add('interior', GEO.box, COL.wood, T(I, 0, FLOOR - 0.03, 0, 0, 0, 0, W - 0.15, 0.06, L - 0.1));
  for (let x = -1.2; x <= 1.2; x += 0.3) inn.add('interior', GEO.box, COL.woodDark, T(I, x, FLOOR + 0.002, 0, 0, 0, 0, 0.015, 0.01, L - 0.2));
  inn.add('interior', GEO.box, COL.rug, T(I, 0, FLOOR + 0.01, 0, 0, 0, 0, 0.7, 0.012, L - 3.6));
  // 内墙护板（木质）
  for (const sx of [-1, 1]) inn.add('interior', GEO.box, COL.woodLight, T(I, sx * (hw - 0.07), FLOOR + 0.42, 0, 0, 0, 0, 0.04, 0.84, L - 3.2));
  const seats = [];
  for (const c of winC) {
    for (const sx of [-1, 1]) {
      const sxp = sx * 0.78;
      for (const dir of [1, -1]) {
        const z = c - dir * 0.5;              // dir=1：面朝前
        inn.add('interior', GEO.box, COL.woodDark, T(I, sxp, FLOOR + 0.24, z, 0, 0, 0, 0.92, 0.48, 0.5));
        inn.add('interior', GEO.box, sx < 0 ? COL.cushion : COL.cushion2, T(I, sxp, FLOOR + 0.52, z, 0, 0, 0, 0.9, 0.1, 0.5));
        inn.add('interior', GEO.box, sx < 0 ? COL.cushion : COL.cushion2, T(I, sxp, FLOOR + 0.95, z - dir * 0.27, -dir * 0.08, 0, 0, 0.9, 0.78, 0.1));
        inn.add('interior', GEO.box, COL.wood, T(I, sxp, FLOOR + 1.36, z - dir * 0.3, 0, 0, 0, 0.94, 0.06, 0.08));
        seats.push({ x: sx * 0.95, z, dir });
      }
      // 小桌与台灯
      inn.add('interior', GEO.box, COL.wood, T(I, sx * 1.05, FLOOR + 0.72, c, 0, 0, 0, 0.42, 0.05, 0.42));
      inn.add('interior', GEO.cyl6, COL.gold, T(I, sx * 1.05, FLOOR + 0.84, c, 0, 0, 0, 0.03, 0.22, 0.03));
      lamp.add('lamp', GEO.sphereLo, COL.lamp, T(I, sx * 1.05, FLOOR + 1.0, c, 0, 0, 0, 0.07));
      inn.add('interior', GEO.cone8, COL.coral ?? 0xe39a86, T(I, sx * 1.05, FLOOR + 1.06, c, 0, 0, 0, 0.12, 0.1, 0.12));
    }
  }
  // 行李架、壁灯、顶灯
  for (const sx of [-1, 1]) {
    for (const dy of [0, 0.22]) inn.add('interior', GEO.cyl6, COL.gold, T(I, sx * (hw - 0.42 + dy * 0.6), FLOOR + 2.02 + dy * 0.2, 0, Math.PI / 2, 0, 0, 0.022, L - 3.4, 0.022));
    for (let z = zone0 + 0.3; z < zone1; z += 0.35) inn.add('interior', GEO.box, COL.woodLight, T(I, sx * (hw - 0.32), FLOOR + 2.0, z, 0, 0, 0, 0.32, 0.025, 0.06));
    for (const c of [zone0, ...winC.map((q) => q + winW / 2 + pillar / 2)].slice(0, winN + 1)) {
      const pz = c === zone0 ? zone0 + pillar / 2 : c;
      inn.add('interior', GEO.cone8, COL.gold, T(I, sx * (hw - 0.14), FLOOR + 1.78, pz, 0, 0, sx * 0.5, 0.08, 0.1, 0.08));
      lamp.add('lamp', GEO.sphereLo, COL.lamp, T(I, sx * (hw - 0.16), FLOOR + 1.72, pz, 0, 0, 0, 0.06));
    }
    // 小包裹
    for (const c of winC) if ((c * 7 + sx) % 3 > 1) inn.add('interior', GEO.box, [COL.wood, COL.cushion2, COL.sageDark][Math.abs(Math.round(c)) % 3], T(I, sx * (hw - 0.35), FLOOR + 2.15, c, 0, 0.2, 0, 0.3, 0.22, 0.45));
  }
  for (let z = -L / 2 + 2; z < L / 2 - 1; z += 3) {
    lamp.add('lamp', GEO.sphere, COL.lamp, T(I, 0, yTop + 0.18, z, 0, 0, 0, 0.13, 0.1, 0.13));
    inn.add('interior', GEO.cyl8, COL.gold, T(I, 0, yTop + 0.28, z, 0, 0, 0, 0.16, 0.05, 0.16));
  }
  const parts = {
    shell: meshFrom(ext, { shell: TRAIN_MATS.shell, shellFlat: TRAIN_MATS.shellFlat }),
    interior: meshFrom(inn, { interior: TRAIN_MATS.interior }),
    windows: meshFrom(glass, { glass: TRAIN_MATS.glass }),
    lamps: meshFrom(lamp, { lamp: TRAIN_MATS.lamp }),
  };
  parts.shell.name = 'shell'; parts.interior.name = 'interior'; parts.windows.name = 'windows'; parts.lamps.name = 'lamps';
  parts.windows.traverse((o) => { o.castShadow = false; o.receiveShadow = false; o.renderOrder = 8; });
  parts.lamps.traverse((o) => { o.castShadow = false; });
  parts.interior.traverse((o) => { o.castShadow = false; o.receiveShadow = true; });
  Object.values(parts).forEach((p) => car.add(p));

  // —— 车门（独立网格，可滑动开启） ——
  const doors = [];
  const db = new Batcher();
  db.add('door', GEO.box, COL.sage, T(I, 0, 0.55, 0, 0, 0, 0, 0.06, 1.1, doorW - 0.06));
  db.add('door', GEO.box, COL.cream, T(I, 0, 1.55, 0, 0, 0, 0, 0.06, 0.9, doorW - 0.06));
  db.add('door', GEO.box, COL.gold, T(I, 0.04, 1.1, doorW * 0.3, 0, 0, 0, 0.03, 0.08, 0.12));
  db.add('door', GEO.box, COL.gold, T(I, 0, 1.05, 0, 0, 0, 0, 0.07, 0.05, doorW - 0.04));
  const doorGeoMesh = db.build({ door: TRAIN_MATS.door })[0];
  const doorGlass = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.6, doorW - 0.3), TRAIN_MATS.glass);
  doorGlass.position.y = 1.55;
  for (const sx of [-1, 1]) for (const dz of [-doorZ, doorZ]) {
    const d = new THREE.Group(); d.name = 'door';
    const m = doorGeoMesh.clone(); m.castShadow = true; d.add(m);
    const gl = doorGlass.clone(); gl.position.x = sx * 0.035; d.add(gl);
    d.position.set(sx * hw, FLOOR, dz);
    d.userData = { closedZ: dz, openZ: dz - Math.sign(dz) * 0.95 }; // 向车厢中部方向滑开（贴在外墙外侧）
    d.position.x = sx * (hw + 0.06);
    car.add(d); doors.push(d);
  }
  // —— 车轮 ——
  const wheels = [];
  for (const bz of [-L / 2 + 2.3, L / 2 - 2.3]) for (const az of [-0.75, 0.75]) for (const sx of [-1, 1]) {
    const w = wheelMesh(0.45, 6); w.position.set(sx * 0.75, 0.45, bz + az); w.scale.x = sx; car.add(w); wheels.push({ obj: w, r: 0.45 });
  }
  // —— 镜头锚点（局部坐标） ——
  const seatW = seats.find((s) => s.x < 0 && s.dir === 1 && Math.abs(s.z - (winC[2] - 0.5)) < 0.01) ?? seats[0];
  const anchors = {
    seat: new THREE.Vector3(-0.78, FLOOR, seatW.z + 0.05),
    windowEye: new THREE.Vector3(-0.68, FLOOR + 1.32, seatW.z + 0.08),
    cabin: [
      { pos: new THREE.Vector3(0.25, FLOOR + 1.6, -L / 2 + 1.0), yaw: 0 },
      { pos: new THREE.Vector3(-0.2, FLOOR + 1.45, winC[3]), yaw: Math.PI * 0.85 },
      { pos: new THREE.Vector3(0.2, FLOOR + 1.6, L / 2 - 1.0), yaw: Math.PI },
    ],
    door: new THREE.Vector3(0, FLOOR, -doorZ),
  };
  car.userData = { doors, wheels, anchors, length: L };
  return car;
}

// ---------------- 车头 ----------------
function buildLoco() {
  const car = new THREE.Group(); car.name = 'locomotive';
  const I = new THREE.Matrix4();
  const b = new Batcher(), lampB = new Batcher(), gl = new Batcher();
  const L = LOCO_L;
  // 底架
  b.add('shell', GEO.box, COL.blueDeep, T(I, 0, 0.95, -0.2, 0, 0, 0, 2.2, 0.42, L - 0.4));
  b.add('shell', GEO.box, COL.gold, T(I, 0, 1.18, -0.2, 0, 0, 0, 2.5, 0.07, L - 0.3));
  // 锅炉：奶油白，前端圆润的烟箱
  const boilerZ = 1.7, boilerL = 5.0, R = 1.05;
  b.add('shell', GEO.cyl16, COL.cream, T(I, 0, 2.2, boilerZ, Math.PI / 2, 0, 0, R, boilerL, R));
  for (const z of [boilerZ - 2.2, boilerZ - 0.8, boilerZ + 0.6, boilerZ + 1.9]) b.add('shell', GEO.cyl16, COL.gold, T(I, 0, 2.2, z, Math.PI / 2, 0, 0, R + 0.03, 0.12, R + 0.03));
  b.add('shell', GEO.cyl16, COL.blue, T(I, 0, 2.2, boilerZ + boilerL / 2 + 0.35, Math.PI / 2, 0, 0, R + 0.06, 0.7, R + 0.06));
  b.add('shell', GEO.sphere, COL.blue, T(I, 0, 2.2, boilerZ + boilerL / 2 + 0.7, 0, 0, 0, R + 0.06, R + 0.06, 0.55));
  b.add('shell', GEO.torus, COL.gold, T(I, 0, 2.2, boilerZ + boilerL / 2 + 0.72, 0, 0, 0, R + 0.08, R + 0.08, 1.2));
  b.add('shell', GEO.cyl16, COL.gold, T(I, 0, 2.2, boilerZ + boilerL / 2 + 1.2, Math.PI / 2, 0, 0, 0.5, 0.06, 0.5)); // 烟箱门
  b.add('shell', GEO.sphereLo, COL.gold, T(I, 0, 2.2, boilerZ + boilerL / 2 + 1.25, 0, 0, 0, 0.12, 0.12, 0.08));
  b.add('shell', GEO.dome, COL.gold, T(I, 0, 3.1, boilerZ + 0.2, 0, 0, 0, 0.45, 0.5, 0.45));   // 汽包
  b.add('shell', GEO.dome, COL.gold, T(I, 0, 3.1, boilerZ - 1.2, 0, 0, 0, 0.35, 0.36, 0.35));
  b.add('shell', GEO.cyl8, COL.sage, T(I, 0, 3.12, boilerZ - 0.5, Math.PI / 2, 0, 0, 0.06, 2.6, 0.06)); // 扶手
  // 侧裙板（鼠尾草绿）+ 小金翅
  for (const sx of [-1, 1]) {
    b.add('shell', GEO.box, COL.sage, T(I, sx * 1.12, 1.45, boilerZ, 0, 0, 0, 0.08, 0.5, boilerL + 0.6));
    b.add('shell', GEO.box, COL.gold, T(I, sx * 1.16, 1.7, boilerZ, 0, 0, 0, 0.04, 0.05, boilerL + 0.6));
    for (let k = 0; k < 4; k++)
      b.add('shellFlat', GEO.box, k % 2 ? COL.goldLight : COL.gold, T(I, sx * (1.25 + k * 0.32), 2.6 + k * 0.1, boilerZ + 0.4 - k * 0.42, 0.18, 0, sx * (0.3 + k * 0.12), 0.95, 0.06, 1.5 - k * 0.3));
  }
  // 驾驶室：拱顶、拱形车窗
  const cabZ = -2.6, cabL = 3.2;
  b.add('shell', GEO.box, COL.sage, T(I, 0, 1.75, cabZ, 0, 0, 0, 2.5, 1.1, cabL));
  for (const sx of [-1, 1]) {
    b.add('shell', GEO.box, COL.cream, T(I, sx * 1.22, 2.95, cabZ - 0.95, 0, 0, 0, 0.1, 1.3, 1.3));
    b.add('shell', GEO.box, COL.cream, T(I, sx * 1.22, 2.95, cabZ + 1.35, 0, 0, 0, 0.1, 1.3, 0.5));
    b.add('shell', ARCH, COL.gold, T(I, sx * 1.24, 3.25, cabZ + 0.38, 0, Math.PI / 2, 0, 0.66, 0.55, 1.4));
    gl.add('glass', GEO.box, COL.glass, T(I, sx * 1.22, 2.9, cabZ + 0.38, 0, 0, 0, 0.02, 1.2, 1.3));
  }
  b.add('shell', GEO.box, COL.cream, T(I, 0, 2.95, cabZ + cabL / 2 - 0.05, 0, 0, 0, 2.5, 1.3, 0.1));
  for (const sx of [-1, 1]) gl.add('glass', GEO.cyl16, COL.glass, T(I, sx * 0.6, 3.05, cabZ + cabL / 2, Math.PI / 2, 0, 0, 0.32, 0.04, 0.32));
  const cabRoof = archGeo(1.6, cabL + 0.5, 2.0); cabRoof.scale(1, 0.5, 1);
  b.add('shell', cabRoof, COL.teal, T(I, 0, 3.6 - 0.8 * Math.cos(1.0), cabZ));
  b.add('shell', GEO.box, COL.gold, T(I, 0, 3.62, cabZ, 0, 0, 0, 2.6, 0.06, cabL + 0.1));
  b.add('shell', GEO.box, COL.woodDark, T(I, 0, 1.4, cabZ - cabL / 2 - 0.4, 0, 0, 0, 2.3, 0.7, 0.8)); // 煤水箱后部
  lampB.add('lamp', GEO.sphereLo, COL.lamp, T(I, 0, 3.45, cabZ, 0, 0, 0, 0.12));
  // 排障器、缓冲器
  b.add('shellFlat', GEO.cone4, COL.gold, T(I, 0, 0.62, L / 2 - 0.3, -Math.PI / 2, Math.PI / 4, 0, 1.05, 0.9, 0.5));
  for (const sx of [-1, 1]) b.add('shell', GEO.cyl8, COL.gold, T(I, sx * 0.85, 1.0, L / 2 - 0.55, Math.PI / 2, 0, 0, 0.12, 0.35, 0.12));
  car.add(...meshFrom(b, { shell: TRAIN_MATS.shell, shellFlat: TRAIN_MATS.shellFlat }).children);
  const lamps = meshFrom(lampB, { lamp: TRAIN_MATS.lamp }); lamps.name = 'lamps'; car.add(lamps);
  const glass = meshFrom(gl, { glass: TRAIN_MATS.glass }); glass.name = 'windows'; glass.traverse((o) => { o.castShadow = false; o.renderOrder = 8; }); car.add(glass);

  // 烟囱（独立，挂蒸汽锚点）
  const chimney = new THREE.Group(); chimney.name = 'chimney';
  const prof = [[0.32, 0], [0.3, 0.4], [0.36, 0.9], [0.55, 1.25], [0.6, 1.35], [0.48, 1.38], [0.4, 1.32]].map(([x, y]) => new THREE.Vector2(x, y));
  const chim = new THREE.Mesh(new THREE.LatheGeometry(prof, 16), wc({ color: COL.copper, side: THREE.DoubleSide }));
  chim.castShadow = true; chimney.add(chim);
  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.05, 6, 18).rotateX(Math.PI / 2), TRAIN_MATS.hub); crown.position.y = 1.33; chimney.add(crown);
  chimney.position.set(0, 3.1, boilerZ + 1.7);
  car.add(chimney);
  // 前灯（独立，含发光镜面与柔光锥）
  const headlight = new THREE.Group(); headlight.name = 'headlight';
  const hlBody = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.45, 14).rotateX(Math.PI / 2), wc({ color: COL.gold }));
  const hlLens = new THREE.Mesh(new THREE.CircleGeometry(0.24, 16), new THREE.MeshBasicMaterial({ color: 0xfff2c8 }));
  hlLens.position.z = 0.23;
  const beamGeo = new THREE.ConeGeometry(2.6, 16, 18, 1, true); beamGeo.translate(0, -8, 0); beamGeo.rotateX(-Math.PI / 2);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.position.z = 0.2; beam.name = 'beam';
  headlight.add(hlBody, hlLens, beam);
  headlight.position.set(0, 3.0, boilerZ + boilerL / 2 + 0.75);
  car.add(headlight);
  // 驱动轮 + 连杆
  const wheels = [];
  const drivers = [boilerZ - 1.6, boilerZ - 0.1, boilerZ + 1.4];
  for (const z of drivers) for (const sx of [-1, 1]) {
    const w = wheelMesh(0.72, 10); w.position.set(sx * 0.82, 0.72, z); w.scale.x = sx; car.add(w); wheels.push({ obj: w, r: 0.72 });
  }
  for (const z of [L / 2 - 1.3, cabZ - 0.6]) for (const sx of [-1, 1]) {
    const w = wheelMesh(0.42, 6); w.position.set(sx * 0.82, 0.42, z); w.scale.x = sx; car.add(w); wheels.push({ obj: w, r: 0.42 });
  }
  const rods = [];
  for (const sx of [-1, 1]) {
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, drivers[2] - drivers[0] + 0.2), TRAIN_MATS.hub);
    rod.position.set(sx * 0.97, 0.72, (drivers[0] + drivers[2]) / 2); rod.castShadow = true;
    car.add(rod); rods.push({ obj: rod, base: rod.position.clone(), phase: sx > 0 ? 0 : Math.PI / 2 });
  }
  car.traverse((o) => { if (o.isMesh && o.castShadow === false && o.material !== TRAIN_MATS.glass && o.material !== TRAIN_MATS.lamp) o.castShadow = true; });
  car.userData = { wheels, rods, chimney, headlight, beam, doors: [], length: L, smoke: new THREE.Vector3(0, 4.5, boilerZ + 1.7) };
  return car;
}

// ============================================================
// Train：运行状态机（与 V1 接口兼容）
// 状态：idle（停站等待）→ arriving（被呼叫进站）→ dwell（停靠）→ running（运行）
// ============================================================
export class Train {
  constructor(rail) {
    this.rail = rail;
    this.group = new THREE.Group(); this.group.name = 'train:风栖号';
    this.cars = [buildLoco(), buildCoach(1), buildCoach(2), buildCoach(3, { tail: true })];
    this.cars.forEach((c) => this.group.add(c));
    this.wheels = this.cars.flatMap((c) => c.userData.wheels);
    this.doors = this.cars.flatMap((c) => c.userData.doors);
    this.offsets = [];
    let off = 0;
    CAR_LEN.forEach((l) => { this.offsets.push(off + l / 2); off += l + GAP; });
    this.totalLen = off - GAP;
    this.rideCar = 2;            // 玩家乘坐第二节客车
    this.stationIdx = 0;
    this.s = this.stopS(0);
    this.speed = 0;
    this.state = 'idle';
    this.riding = false;
    this.dwell = 0;
    this.targetIdx = 1;
    this.destination = null;
    this.vmax = 24; this.accel = 1.6; this.decel = 1.5;
    this.smokeT = 0;
    this.events = [];
    this.doorsOpen = false; this.doorK = 0;
    this.wheelAngle = 0;
    this.night = 0;
    this._f = {}; this._f2 = {};
    this.place();
  }

  // 停靠时整列车居中于站台
  stopS(i) { return this.rail.stations[i].s + this.totalLen / 2; }
  get station() { return this.rail.stations[this.stationIdx]; }
  get nextStation() { return this.rail.stations[this.targetIdx]; }
  get stopped() { return this.state === 'idle' || this.state === 'dwell'; }
  get headS() { return this.s; }

  interact(st) {
    if (this.riding || this.state === 'arriving') return;
    if (this.stopped && this.stationIdx === st.index) return;
    this.s = this.stopS(st.index) - 280;
    this.speed = 15;
    this.targetIdx = st.index;
    this.state = 'arriving';
    this.events.push({ type: 'toast', text: `风栖号正驶向 ${st.name}` });
  }
  board() { this.riding = true; this.state = 'dwell'; this.dwell = 4; this.destination = null; }
  alight() { this.riding = false; this.state = 'idle'; this.speed = 0; }
  requestNextStop() { if (this.state === 'running') { this.destination = null; } }
  openDoors(open) { this.doorsOpen = open; }
  setDestination(i) {
    if (!this.riding || (i === this.stationIdx && this.stopped)) return;
    this.destination = i;
    if (this.state === 'running') this.targetIdx = i;
    this.events.push({ type: 'toast', text: `目的站已设为 ${this.rail.stations[i].name}` });
  }
  departNow() { if (this.state === 'dwell') this.dwell = 0; }
  distAhead(target) { const L = this.rail.length; return ((target - this.s) % L + L) % L; }

  update(dt, puffs) {
    const L = this.rail.length;
    if (this.state === 'dwell') {
      this.dwell -= dt;
      if (this.dwell <= 0) {
        this.state = 'running';
        this.targetIdx = this.destination ?? (this.stationIdx + 1) % this.rail.stations.length;
        if (this.targetIdx === this.stationIdx) this.targetIdx = (this.stationIdx + 1) % this.rail.stations.length;
        this.announced = false;
        this.doorsOpen = false;
        this.events.push({ type: 'depart' });
      }
    } else if (this.state === 'running' || this.state === 'arriving') {
      const d = this.distAhead(this.stopS(this.targetIdx));
      const vT = Math.min(this.vmax, Math.sqrt(2 * this.decel * Math.max(d - 0.3, 0)) + 0.4);
      this.speed += Math.max(-this.decel * 2.2 * dt, Math.min(this.accel * dt, vT - this.speed));
      const ds = Math.min(this.speed * dt, d);
      this.s = (this.s + ds) % L;
      if (this.riding && !this.announced && d < 420) { this.announced = true; this.events.push({ type: 'approach', station: this.rail.stations[this.targetIdx] }); }
      if (d - ds < 0.05) {
        this.s = this.stopS(this.targetIdx);
        this.speed = 0;
        this.stationIdx = this.targetIdx;
        if (this.riding) {
          const isDest = this.destination === null || this.destination === this.stationIdx;
          this.state = 'dwell';
          this.dwell = isDest ? 12 : 6;
          if (this.destination === this.stationIdx) this.destination = null;
          this.doorsOpen = true;
          this.events.push({ type: 'arrive', station: this.station });
        } else this.state = 'idle';
      }
    }
    this.place(dt);
    this.animateParts(dt);
    // 蒸汽
    this.smokeT -= dt;
    if (puffs && this.smokeT <= 0) {
      const moving = this.speed > 0.5;
      this.smokeT = moving ? Math.max(0.07, 0.35 - this.speed * 0.012) : 0.9;
      const p = this.cars[0].userData.smoke.clone().applyMatrix4(this.cars[0].matrixWorld);
      // 蒸汽随车前进方向带走一部分速度，主要向上飘散，避免盖住车顶
      const carry = this._f.tan.clone().multiplyScalar(this.speed * 0.55);
      puffs.emit(p, carry.add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 4.5 + Math.random() * 1.5, (Math.random() - 0.5) * 0.6)), moving ? 0.9 : 0.8, moving ? 2.2 : 2.4);
    }
  }

  place() {
    const f = this._f, f2 = this._f2;
    this.cars.forEach((car, i) => {
      const sMid = this.s - this.offsets[i];
      const half = CAR_LEN[i] / 2 - 2.3;     // 转向架位置 → 弯道上车厢自然内切
      this.rail.frameAt(sMid + half, f);
      const front = f.pos.clone();
      this.rail.frameAt(sMid - half, f2);
      car.position.copy(front).add(f2.pos).multiplyScalar(0.5);
      car.lookAt(front);
      car.updateMatrixWorld();
    });
    this.rail.frameAt(this.s - this.offsets[0], f);
  }

  animateParts(dt) {
    // 车轮按线速度转动；连杆跟随驱动轮曲柄
    this.wheelAngle += this.speed * dt;
    for (const w of this.wheels) w.obj.rotation.x = this.wheelAngle / w.r;
    const loco = this.cars[0].userData;
    const a = this.wheelAngle / 0.72;
    for (const r of loco.rods) {
      r.obj.position.y = r.base.y + Math.sin(a + r.phase) * 0.32;
      r.obj.position.z = r.base.z + Math.cos(a + r.phase) * 0.32;
    }
    // 车门开合
    this.doorK += ((this.doorsOpen ? 1 : 0) - this.doorK) * (1 - Math.exp(-5 * dt));
    for (const d of this.doors) d.position.z = d.userData.closedZ + (d.userData.openZ - d.userData.closedZ) * this.doorK;
    // 昼夜：灯具亮度、室内补光、前灯光锥
    const n = this.night;
    TRAIN_MATS.lamp.color.setScalar(0.75 + n * 0.9);
    TRAIN_MATS.interior.emissiveIntensity = 0.3 + n * 0.55;
    loco.beam.material.opacity = 0.02 + n * 0.16;
  }

  // —— 锚点（世界坐标） ——
  local(carIdx, v, out = new THREE.Vector3()) { return out.copy(v).applyMatrix4(this.cars[carIdx].matrixWorld); }
  seatPosition(out) { return this.local(this.rideCar, this.cars[this.rideCar].userData.anchors.seat, out); }
  doorPosition(out) { return this.local(this.rideCar, this.cars[this.rideCar].userData.anchors.door, out); }
  get rideAnchors() { return this.cars[this.rideCar].userData.anchors; }
  get rideMatrix() { return this.cars[this.rideCar].matrixWorld; }
  get heading() { const t = this._f.tan; return Math.atan2(t.x, t.z); }
  get tangent() { return this._f.tan; }
  get midPosition() { return this.cars[1].position; }
}
