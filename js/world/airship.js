// ============================================================
// 「风帆号」可乘坐飞艇 + 空中航线（云港岛 ⇄ 天空之城艾瑟兰）
// - 飞艇空港：栈桥 + T 形登船台 + 系泊塔 + 售票亭（planAirDock / buildAirDock）
// - Airway：闭合空中航线（与 Railway 接口一致：stations / frameAt / train），
//   因此乘坐流程直接复用 RideController 状态机
// - Airship：吊舱有真实内部空间（座椅、舵轮、吊灯、舷窗），
//   部件独立：气囊、吊舱、舱门、舷梯、螺旋桨 ×3、方向舵、可展开的风帆、航行灯
// 所有模型均为代码程序化建模（不是 Blender/GLB 资产）
// 约定：飞艇局部 +Z 为前进方向，原点在吊舱地板中心
// ============================================================
import * as THREE from 'three';
import { Batcher, GEO, T } from '../core/batcher.js';
import { wc, textTexture, G } from '../core/materials.js';
import { BoxSurface } from '../core/physics.js';
import { clamp, damp } from '../core/utils.js';
import { PALETTE as P } from '../config.js';
import * as pr from './props.js';
import { TRAIN_MATS, COL } from './train.js';

const UP = new THREE.Vector3(0, 1, 0);
export const GL = 13, GW = 4.0, GH = 2.5;     // 吊舱长 / 宽 / 墙高
const HEAD_D = 3.2, HEAD_W = 12;              // T 形登船台进深 / 宽度
const ER = 6.0, EL = 17, EY = GH + 1.4 + ER * 0.92, EZ = -1.0;   // 气囊半径 / 半长 / 中心
const DOOR_W = 1.2;
const HALF_ARCH = new THREE.TorusGeometry(1, 0.06, 6, 16, Math.PI);   // 拱门上半圆

// ---------------- 空港 ----------------
/** 规划空港（在岛屿网格生成之前调用：平整地形、预留空地） */
export function planAirDock(isl, th, o = {}) {
  const out = [Math.cos(th), Math.sin(th)], tan = [-Math.sin(th), Math.cos(th)];
  const rootR = isl.rim(th) - 5;
  // 飞艇沿岛缘切向停靠：船体覆盖的横向范围内，岛缘在外法线方向上的最大投影
  let maxProj = 0;
  for (let k = -40; k <= 40; k++) {
    const d = (k / 40) * 0.6, rr = isl.rim(th + d);
    if (Math.abs(rr * Math.sin(d)) <= 22) maxProj = Math.max(maxProj, rr * Math.cos(d));
  }
  const len = Math.max(8, maxProj + 9 - rootR - (HEAD_D + 0.3 + GW / 2));
  const at = (a, b) => [out[0] * a + tan[0] * b, out[1] * a + tan[1] * b];
  const plan = { th, rootR, len, mast: at(rootR - 7, 9), kiosk: at(rootR - 9, -8), yard: at(rootR - 5, 6) };
  const fl = at(rootR - 4, 0);
  isl.flats.push({ x: fl[0], z: fl[1], r: 11, blend: 7, h: o.h ?? 0.6 });
  isl.keep.push({ x: fl[0], z: fl[1], r: 9 }, { x: plan.mast[0], z: plan.mast[1], r: 4 }, { x: plan.kiosk[0], z: plan.kiosk[1], r: 4 });
  return plan;
}

/** 空港的世界坐标框架（建模、物理、航线共用同一套计算） */
export function dockFrame(isl, plan) {
  const { th, rootR, len } = plan;
  const out = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
  const tan = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th));
  const rootL = out.clone().multiplyScalar(rootR);
  const top = (isl.localHeight(rootL.x, rootL.z) ?? 0) + 0.05 + isl.center.y;
  const root = rootL.clone().add(isl.center).setY(top);
  const headC = root.clone().addScaledVector(out, len + HEAD_D / 2);
  const shipPos = headC.clone().addScaledVector(out, HEAD_D / 2 + 0.3 + GW / 2);
  return { out, tan, rootL, root, top, headC, shipPos, ang: Math.atan2(out.x, out.z) };
}

/** 建造空港（岛屿 populate 阶段调用） */
export function buildAirDock(isl, ctx, b, plan, o = {}) {
  const F = dockFrame(isl, plan);
  const { out, tan, rootL, ang } = F;
  const len = plan.len;
  const base = ctx.at(isl, rootL.x, rootL.z, ang, 0.05);   // 局部 +Z 指向岛外，+X = -切向
  pr.deck(b, base, len, 4, { front: false });
  ctx.platform(isl, rootL.x, rootL.z, plan.th, len, 4);

  // —— T 形登船台 ——
  const H = T(base, 0, 0, len + HEAD_D / 2);
  const hw = HEAD_W / 2, hd = HEAD_D / 2;
  b.add('solid', GEO.box, P.wood, T(H, 0, -0.15, 0, 0, 0, 0, HEAD_W, 0.3, HEAD_D));
  for (let x = -hw + 0.6; x < hw; x += 1.2) b.add('solid', GEO.box, P.woodDark, T(H, x, 0.01, 0, 0, 0, 0, 0.06, 0.02, HEAD_D));
  b.add('solid', GEO.box, P.gold, T(H, 0, -0.05, hd, 0, 0, 0, HEAD_W + 0.1, 0.1, 0.1));
  b.add('solid', GEO.box, P.gold, T(H, 0, 0.012, hd - 0.45, 0, 0, 0, DOOR_W + 0.4, 0.02, 0.5));  // 登船位标线
  const post = (x, z) => { b.add('solid', GEO.box, P.creamDark, T(H, x, 0.55, z, 0, 0, 0, 0.12, 1.1, 0.12)); b.add('solid', GEO.sphereLo, P.gold, T(H, x, 1.14, z, 0, 0, 0, 0.09)); };
  const railX = (x0, x1, z) => b.add('solid', GEO.box, P.creamDark, T(H, (x0 + x1) / 2, 1.0, z, 0, 0, 0, Math.abs(x1 - x0), 0.1, 0.1));
  const railZ = (x, z0, z1) => b.add('solid', GEO.box, P.creamDark, T(H, x, 1.0, (z0 + z1) / 2, 0, 0, 0, 0.1, 0.1, Math.abs(z1 - z0)));
  for (const s of [-1, 1]) {
    for (let x = 0.9; x <= hw; x += 1.3) post(s * Math.min(x, hw - 0.05), hd - 0.05);
    railX(s * 0.9, s * (hw - 0.05), hd - 0.05);
    railZ(s * (hw - 0.05), -hd, hd);
    post(s * (hw - 0.05), -hd + 0.05); post(s * 2.05, -hd + 0.05);
    railX(s * 2.05, s * (hw - 0.05), -hd + 0.05);
    // 登船闸门（金色小门，两扇）
    b.add('solid', GEO.box, P.gold, T(H, s * 0.47, 0.75, hd - 0.05, 0, 0, 0, 0.8, 0.05, 0.05));
    b.add('solid', GEO.box, P.gold, T(H, s * 0.47, 0.35, hd - 0.05, 0, 0, 0, 0.8, 0.05, 0.05));
    b.add('solid', GEO.box, P.gold, T(H, s * 0.87, 0.55, hd - 0.05, 0, 0, 0, 0.05, 0.75, 0.05));
    // 系缆桩
    b.add('solid', GEO.cyl8, P.copper, T(H, s * 3.2, 0.25, hd - 0.35, 0, 0, 0, 0.16, 0.5, 0.16));
    b.add('solid', GEO.cyl8, P.gold, T(H, s * 3.2, 0.52, hd - 0.35, 0, 0, 0, 0.22, 0.06, 0.22));
    // 斜撑
    b.segment('solid', P.woodDark, H, [s * hw * 0.85, -0.3, hd - 0.2], [s * 1.0, -6.5, -len * 0.55], 0.14, GEO.cyl6);
    b.segment('solid', P.woodDark, H, [s * hw * 0.85, -0.3, -hd + 0.2], [s * 1.0, -6.5, -len * 0.55], 0.12, GEO.cyl6);
    pr.lamp(b, T(H, s * (hw - 0.45), 0, -hd + 0.45), { h: 3.2 });
    // 风向袋
    b.add('solid', GEO.cyl6, P.woodDark, T(H, s * (hw - 0.45), 2.6, hd - 0.4, 0, 0, 0, 0.05, 5.2, 0.05));
    b.add('swaySoft', GEO.taper8, s > 0 ? P.coral : P.cream, T(H, s * (hw - 0.45), 4.9, hd + 0.4, Math.PI / 2 - 0.2, 0, 0, 0.22, 1.4, 0.22));
  }
  // —— 栈桥入口拱门 + 牌匾 ——
  const A = T(base, 0, 0, 0.7);
  for (const s of [-1, 1]) {
    b.add('solid', GEO.box, P.cream, T(A, s * 2.45, 2.1, 0, 0, 0, 0, 0.45, 4.2, 0.45));
    b.add('solid', GEO.box, P.gold, T(A, s * 2.45, 4.25, 0, 0, 0, 0, 0.6, 0.15, 0.6));
    b.add('solid', GEO.box, P.gold, T(A, s * 2.45, 0.1, 0, 0, 0, 0, 0.6, 0.2, 0.6));
  }
  b.add('solid', GEO.box, P.sageDark, T(A, 0, 4.5, 0, 0, 0, 0, 5.6, 0.35, 0.7));
  b.add('solid', HALF_ARCH, P.gold, T(A, 0, 2.95, 0, 0, 0, 0, 2.25, 1.2, 1.6));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.12), new THREE.MeshBasicMaterial({ map: textTexture(o.name ?? '空港', 'SKY PORT · 风帆号'), side: THREE.DoubleSide }));
  sign.applyMatrix4(T(A, 0, 3.75, -0.05, 0, Math.PI, 0));
  isl.group.add(sign);

  // —— 系泊塔（铜色桁架 + 金环 + 顶灯） ——
  const [mx, mz] = plan.mast;
  const my = isl.localHeight(mx, mz) ?? 0;
  const MH = 17;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    b.segment('solid', P.copper, new THREE.Matrix4(), [mx + Math.cos(a) * 1.8, my - 0.5, mz + Math.sin(a) * 1.8], [mx + Math.cos(a) * 0.55, my + MH, mz + Math.sin(a) * 0.55], 0.14, GEO.cyl6);
  }
  for (let y = 2; y < MH; y += 3) { const rr = 1.8 - (y / MH) * 1.25; b.add('solid', GEO.torus, P.gold, T(new THREE.Matrix4(), mx, my + y, mz, Math.PI / 2, 0, 0, rr, rr, 2)); }
  b.add('solid', GEO.cyl12, P.gold, T(new THREE.Matrix4(), mx, my + MH + 0.3, mz, 0, 0, 0, 1.2, 0.6, 1.2));
  b.add('solid', GEO.cone8, P.sageDark, T(new THREE.Matrix4(), mx, my + MH + 1.1, mz, 0, 0, 0, 0.9, 1.0, 0.9));
  b.add('glow', GEO.sphereLo, 0xffdca0, T(new THREE.Matrix4(), mx, my + MH + 1.9, mz, 0, 0, 0, 0.35));
  ctx.collide(isl, mx, mz, 1.9, MH);
  // —— 售票亭、货箱 ——
  const [kx, kz] = plan.kiosk;
  pr.house(b, ctx.at(isl, kx, kz, ang + Math.PI), { w: 3.8, d: 3.2, h: 2.7, roof: o.roof ?? P.coral, wall: P.cream });
  ctx.box(isl, kx, kz, 2.2, 1.9, -(ang + Math.PI), 6);
  const [yx, yz] = plan.yard;
  for (let k = 0; k < 5; k++) pr.crate(b, ctx.at(isl, yx + (k % 3) * 1.05 * tan.x, yz + (k % 3) * 1.05 * tan.z, k * 0.4, Math.floor(k / 3) * 0.9), 0.9);
  pr.barrel(b, ctx.at(isl, yx - out.x * 2, yz - out.z * 2));
  ctx.collide(isl, yx + tan.x, yz + tan.z, 1.8, 2);

  // —— 物理：登船台可行走，三面栏杆阻挡 ——
  const ph = ctx.world.physics, top = F.top, hc = F.headC;
  ph.addSurface(new BoxSurface(hc.x, hc.z, top, hd + 0.05, hw, plan.th, 0.6));
  const along = Math.atan2(tan.z, tan.x);
  const wall = (c, a, hx) => ph.addBox(c.x, c.z, hx, 0.08, a, top - 1, top + 1.6);
  wall(hc.clone().addScaledVector(out, hd - 0.05), along, hw);
  for (const s of [-1, 1]) {
    wall(hc.clone().addScaledVector(tan, s * (hw - 0.05)), plan.th, hd);
    wall(hc.clone().addScaledVector(out, -hd + 0.05).addScaledVector(tan, s * (hw / 2 + 1)), along, hw / 2 - 1);
    wall(F.root.clone().addScaledVector(out, len / 2).addScaledVector(tan, s * 2.02), plan.th, len / 2 - 0.4);
  }
  return { ...F, mastTop: new THREE.Vector3(mx, my + MH, mz).add(isl.center) };
}

// ---------------- 飞艇模型 ----------------
const SAIL_MAT = wc({ vertexColors: true, side: THREE.DoubleSide, grain: 0.5 });
const meshFrom = (b, mats) => { const g = new THREE.Group(); b.build(mats).forEach((m) => g.add(m)); return g; };

/** 气囊轮廓：前端圆钝、尾部修长（车床旋转体，轴向 Z） */
function envelopeGeo() {
  const pts = [];
  const N = 34, peak = 0.58;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const u = (t - peak) / (t < peak ? peak : 1 - peak);
    const f = t < peak ? Math.pow(Math.max(0, 1 - u * u), 0.62) : Math.sqrt(Math.max(0, 1 - u * u));
    pts.push(new THREE.Vector2(Math.max(f * ER, i === 0 || i === N ? 0.001 : 0.05), -EL + t * 2 * EL));
  }
  const g = new THREE.LatheGeometry(pts, 32);
  g.rotateX(Math.PI / 2);             // 车床轴 Y → Z（+Z 为船头）
  return g;
}
const envR = (z) => {               // 给定 z（相对气囊中心）的气囊半径
  const t = (z + EL) / (2 * EL), peak = 0.58;
  const u = (t - peak) / (t < peak ? peak : 1 - peak);
  return ER * (t < peak ? Math.pow(Math.max(0, 1 - u * u), 0.62) : Math.sqrt(Math.max(0, 1 - u * u)));
};

/** 尾翼：梯形挤出体；phi 为绕 Z 轴的方位角（0 = 正上方） */
function finGeo() {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(6.2, 0); s.lineTo(6.6, 3.5); s.lineTo(3.0, 3.3); s.quadraticCurveTo(1.0, 1.5, 0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -0.09);
  return g;
}
function finMatrix(phi, z0, r0) {
  const radial = new THREE.Vector3(Math.sin(phi), Math.cos(phi), 0);
  const tang = new THREE.Vector3(Math.cos(phi), -Math.sin(phi), 0);   // 保持右手系（法线朝外）
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), radial, tang);
  m.setPosition(radial.clone().multiplyScalar(r0).add(new THREE.Vector3(0, EY, z0)));
  return m;
}

function propeller(r, blades, color) {
  const b = new Batcher(), I = new THREE.Matrix4();
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2;
    // 先绕桨叶自身长轴扭转（桨距），再绕桨轴分布
    b.add('shell', GEO.box, color, T(T(I, Math.sin(a) * r * 0.5, Math.cos(a) * r * 0.5, 0, 0, 0, -a), 0, 0, 0, 0, 0.35, 0, r * 0.16, r, 0.05));
  }
  b.add('shell', GEO.cone8, COL.gold, T(I, 0, 0, -0.18, -Math.PI / 2, 0, 0, r * 0.14, 0.4, r * 0.14));
  const g = meshFrom(b, { shell: TRAIN_MATS.shell });
  return g;
}

function buildAirship() {
  const ship = new THREE.Group(); ship.name = 'airship:风帆号';
  const I = new THREE.Matrix4();
  const ext = new Batcher(), inn = new Batcher(), glass = new Batcher(), lamp = new Batcher();
  const hw = GW / 2, L2 = GL / 2;

  // —— 吊舱船体：船形底壳 + 金色腰线 + 龙骨 ——
  const hull = new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  ext.add('shell', hull, COL.blue, T(I, 0, 0.02, 0.5, 0, 0, 0, hw * 1.03, 1.15, L2 + 1.3));
  ext.add('shell', GEO.box, COL.gold, T(I, 0, -1.12, 0.5, 0, 0, 0, 0.16, 0.12, GL - 1.5));
  ext.add('shell', GEO.box, COL.gold, T(I, 0, 0.02, 0, 0, 0, 0, GW + 0.12, 0.08, GL));
  // —— 侧墙：下部护板 / 舷窗带 / 上部檐板 ——
  const yLow = 0.85, yWin = 1.95;
  const winC = [-4.9, -3.4, -1.9, 1.9, 3.4, 4.9], winW = 1.05;
  for (const sx of [-1, 1]) {
    const x = sx * hw;
    const span = (z0, z1, y0, y1, c, kind = 'shell') => { if (z1 > z0) ext.add(kind, GEO.box, c, T(I, x, (y0 + y1) / 2, (z0 + z1) / 2, 0, 0, 0, 0.1, y1 - y0, z1 - z0)); };
    span(-L2, -DOOR_W / 2, 0, yLow, COL.sage); span(DOOR_W / 2, L2, 0, yLow, COL.sage);
    span(-L2, L2, yWin, GH, COL.cream);
    const edges = [-L2, ...winC.flatMap((c) => [c - winW / 2, c + winW / 2]), L2];
    for (let i = 0; i < edges.length; i += 2) {
      let z0 = edges[i], z1 = edges[i + 1];
      if (z0 < 0 && z1 > 0) { span(z0, -DOOR_W / 2, yLow, yWin, COL.cream); span(DOOR_W / 2, z1, yLow, yWin, COL.cream); }
      else span(z0, z1, yLow, yWin, COL.cream);
    }
    ext.add('shell', GEO.box, COL.gold, T(I, x * 1.012, yLow, 0, 0, 0, 0, 0.04, 0.06, GL));
    ext.add('shell', GEO.box, COL.gold, T(I, x * 1.012, yWin, 0, 0, 0, 0, 0.04, 0.06, GL));
    for (const c of winC) {
      // 圆角舷窗：木框 + 金铆钉
      ext.add('shell', GEO.torus, COL.woodLight, T(I, x * 1.006, (yLow + yWin) / 2, c, 0, Math.PI / 2, 0, winW / 2, (yWin - yLow) / 2, 1.4));
      glass.add('glass', GEO.box, COL.glass, T(I, x, (yLow + yWin) / 2, c, 0, 0, 0, 0.02, yWin - yLow, winW));
      for (const e of [-1, 1]) inn.add('interior', GEO.box, COL.curtain, T(I, x - sx * 0.09, (yLow + yWin) / 2 + 0.1, c + e * (winW / 2 - 0.08), 0, 0, 0, 0.05, 0.9, 0.14));
    }
    // 门框
    for (const e of [-1, 1]) ext.add('shell', GEO.box, COL.gold, T(I, x * 1.012, yWin / 2, e * DOOR_W / 2, 0, 0, 0, 0.05, yWin, 0.07));
    // 吊舱侧面的铭牌带
    for (let z = -L2 + 0.4; z < L2; z += 0.9) ext.add('shell', GEO.sphereLo, COL.gold, T(I, x * 1.02, yLow - 0.18, z, 0, 0, 0, 0.035));
  }
  // —— 船头：弧形全景玻璃 ——
  const bowZ = L2, bowS = 0.75;
  const half = (r, h, open = true) => new THREE.CylinderGeometry(r, r, h, 14, 1, open, -Math.PI / 2, Math.PI);
  ext.add('shell', half(hw, yLow), COL.sage, T(I, 0, yLow / 2, bowZ, 0, 0, 0, 1, 1, bowS));
  ext.add('shell', half(hw, GH - yWin), COL.cream, T(I, 0, (yWin + GH) / 2, bowZ, 0, 0, 0, 1, 1, bowS));
  glass.add('glass', half(hw - 0.02, yWin - yLow), COL.glass, T(I, 0, (yLow + yWin) / 2, bowZ, 0, 0, 0, 1, 1, bowS));
  for (let k = 1; k < 6; k++) { const a = -Math.PI / 2 + (k / 6) * Math.PI; ext.add('shell', GEO.box, COL.woodLight, T(I, Math.sin(a) * hw, (yLow + yWin) / 2, bowZ + Math.cos(a) * hw * bowS, 0, a, 0, 0.07, yWin - yLow, 0.07)); }
  // 船头内侧护板（外壳为单面材质，从舱内看需要内衬）
  inn.add('interior', half(hw - 0.06, yLow), COL.woodDark, T(I, 0, yLow / 2, bowZ, 0, 0, 0, 1, 1, bowS));
  inn.add('interior', half(hw - 0.06, GH - yWin), COL.creamDark, T(I, 0, (yWin + GH) / 2, bowZ, 0, 0, 0, 1, 1, bowS));
  ext.add('shell', half(hw, 0.12, false), COL.blueDeep, T(I, 0, GH + 0.06, bowZ, 0, 0, 0, 1.04, 1, bowS * 1.04));
  ext.add('shell', GEO.torus, COL.gold, T(I, 0, yWin, bowZ, Math.PI / 2, 0, 0, hw * 1.01, hw * bowS * 1.01, 1));
  // —— 船尾：圆舷窗 + 尾部收口 ——
  ext.add('shell', GEO.box, COL.cream, T(I, 0, GH / 2, -L2, 0, 0, 0, GW, GH, 0.1));
  const sternHalf = new THREE.CylinderGeometry(hw, hw * 0.7, GH, 14, 1, false, Math.PI / 2, Math.PI);
  ext.add('shell', sternHalf, COL.sage, T(I, 0, GH / 2, -L2, 0, 0, 0, 1, 1, 0.35));
  ext.add('shell', GEO.torus, COL.gold, T(I, 0, 1.5, -L2 - 0.06, 0, 0, 0, 0.42, 0.42, 1.5));
  // —— 车顶：拱形顶棚 + 金色顶脊 + 护栏 ——
  const rr = 2.8, th2 = Math.asin(hw / rr);
  const roofGeo = new THREE.CylinderGeometry(rr, rr, GL, 16, 1, true, -th2, th2 * 2);
  roofGeo.rotateX(-Math.PI / 2);   // 轴向 Y → Z，θ=0 的弧顶朝 +Y
  const roofY = GH - rr * Math.cos(th2);
  ext.add('shell', roofGeo, COL.blueDeep, T(I, 0, roofY, 0, 0, 0, 0, 1.02, 1, 1));
  inn.add('interior', roofGeo, COL.creamDark, T(I, 0, roofY - 0.06, 0, 0, 0, 0, 0.99, 1, 0.99));
  ext.add('shell', GEO.box, COL.gold, T(I, 0, GH + rr * (1 - Math.cos(th2)) + 0.03, 0, 0, 0, 0, 0.18, 0.08, GL));
  for (const sx of [-1, 1]) ext.add('shell', GEO.box, COL.gold, T(I, sx * hw, GH, 0, 0, 0, 0, 0.12, 0.1, GL + 0.1));

  // —— 船舱内部 ——
  inn.add('interior', GEO.box, COL.woodLight, T(I, 0, -0.03, 0, 0, 0, 0, GW - 0.15, 0.06, GL - 0.1));
  for (let x = -hw + 0.3; x < hw; x += 0.42) inn.add('interior', GEO.box, COL.wood, T(I, x, 0.005, 0, 0, 0, 0, 0.02, 0.01, GL - 0.2));
  inn.add('interior', GEO.box, COL.rug, T(I, 0, 0.02, 0, 0, 0, 0, 1.0, 0.02, GL - 2.2));
  inn.add('interior', GEO.box, COL.goldLight, T(I, 0, 0.025, 0, 0, 0, 0, 0.8, 0.02, GL - 2.4));
  // 护墙板
  for (const sx of [-1, 1]) inn.add('interior', GEO.box, COL.woodDark, T(I, sx * (hw - 0.07), yLow / 2, 0, 0, 0, 0, 0.04, yLow, GL - 0.2));
  // 座椅：两侧各四张朝前的扶手椅
  const seatZ = [-4.6, -2.8, 2.6, 4.4];
  const chair = (x, z, c) => {
    inn.add('interior', GEO.box, c, T(I, x, 0.45, z, 0, 0, 0, 0.78, 0.16, 0.7));
    inn.add('interior', GEO.box, c, T(I, x, 0.95, z - 0.33, -0.12, 0, 0, 0.78, 0.9, 0.14));
    inn.add('interior', GEO.box, COL.woodDark, T(I, x, 0.2, z, 0, 0, 0, 0.7, 0.35, 0.6));
    for (const e of [-1, 1]) inn.add('interior', GEO.box, COL.wood, T(I, x + e * 0.42, 0.66, z - 0.02, 0, 0, 0, 0.09, 0.08, 0.65));
    inn.add('interior', GEO.box, COL.cream, T(I, x, 1.32, z - 0.37, -0.12, 0, 0, 0.5, 0.16, 0.08));
  };
  for (const sx of [-1, 1]) seatZ.forEach((z, i) => chair(sx * 1.15, z, (i + (sx > 0 ? 1 : 0)) % 2 ? COL.cushion : COL.cushion2));
  // 船头驾驶台：舵轮 + 仪表 + 海图
  const helmZ = L2 + 0.35;
  inn.add('interior', GEO.box, COL.wood, T(I, 0.7, 0.5, helmZ, 0, 0, 0, 1.6, 1.0, 0.6));
  inn.add('interior', GEO.box, COL.goldLight, T(I, 0.7, 1.02, helmZ, -0.4, 0, 0, 1.5, 0.04, 0.55));
  for (const dx of [-0.4, 0, 0.4]) inn.add('interior', GEO.cyl12, COL.gold, T(I, 0.7 + dx, 1.08, helmZ, Math.PI / 2 - 0.4, 0, 0, 0.12, 0.05, 0.12));
  inn.add('interior', GEO.cyl8, COL.woodDark, T(I, -0.6, 0.55, helmZ - 0.1, 0, 0, 0, 0.1, 1.1, 0.1));
  inn.add('interior', GEO.torus, COL.woodLight, T(I, -0.6, 1.25, helmZ - 0.05, 0, 0, 0, 0.45, 0.45, 2.2));
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; inn.add('interior', GEO.cyl6, COL.woodLight, T(I, -0.6 + Math.sin(a) * 0.32, 1.25 + Math.cos(a) * 0.32, helmZ - 0.05, Math.PI / 2, 0, -a, 0.025, 0.64, 0.025)); }
  inn.add('interior', GEO.sphereLo, COL.gold, T(I, -0.6, 1.25, helmZ - 0.05, 0, 0, 0, 0.08));
  // 船尾休息区：沙发 + 圆桌 + 书架
  inn.add('interior', GEO.box, COL.cushion2, T(I, 0, 0.42, -L2 + 0.45, 0, 0, 0, GW - 0.6, 0.2, 0.75));
  inn.add('interior', GEO.box, COL.cushion2, T(I, 0, 0.9, -L2 + 0.18, 0, 0, 0, GW - 0.6, 0.8, 0.16));
  inn.add('interior', GEO.cyl12, COL.woodDark, T(I, 0, 0.35, -L2 + 1.5, 0, 0, 0, 0.06, 0.7, 0.06));
  inn.add('interior', GEO.cyl12, COL.wood, T(I, 0, 0.72, -L2 + 1.5, 0, 0, 0, 0.45, 0.04, 0.45));
  inn.add('interior', GEO.box, COL.cream, T(I, 0.1, 0.76, -L2 + 1.5, 0, 0.4, 0, 0.35, 0.02, 0.26));
  // 行李架 + 行李
  for (const sx of [-1, 1]) {
    inn.add('interior', GEO.box, COL.woodDark, T(I, sx * (hw - 0.3), 2.2, 0, 0, 0, 0, 0.5, 0.04, GL - 1.5));
    for (const z of [-3.6, -0.9, 3.3]) inn.add('interior', GEO.box, [COL.wood, COL.sageDark, COL.cushion2][Math.abs(Math.round(z)) % 3], T(I, sx * (hw - 0.32), 2.36, z, 0, 0.15 * sx, 0, 0.36, 0.28, 0.55));
  }
  // 吊灯
  for (let z = -4.5; z <= 4.5; z += 3) {
    inn.add('interior', GEO.cyl6, COL.gold, T(I, 0, GH + 0.25, z, 0, 0, 0, 0.015, 0.5, 0.015));
    lamp.add('lamp', GEO.sphere, COL.lamp, T(I, 0, GH - 0.05, z, 0, 0, 0, 0.16, 0.13, 0.16));
    inn.add('interior', GEO.cone8, COL.gold, T(I, 0, GH + 0.05, z, 0, 0, 0, 0.22, 0.14, 0.22));
  }
  for (const sx of [-1, 1]) for (const z of [-3.4, 0, 3.4]) lamp.add('lamp', GEO.sphereLo, COL.lamp, T(I, sx * (hw - 0.14), yWin + 0.2, z + 0.75, 0, 0, 0, 0.06));

  // —— 外挂发动机舱（左右各一，尾部推进螺旋桨） ——
  const nac = [];
  for (const sx of [-1, 1]) {
    const nx = sx * (hw + 1.7), ny = 1.5, nz = -3.6;
    ext.add('shell', GEO.taper8, COL.copper, T(I, nx, ny, nz + 0.4, Math.PI / 2, 0, 0, 0.55, 2.6, 0.55));
    ext.add('shell', GEO.sphere, COL.copper, T(I, nx, ny, nz + 1.7, 0, 0, 0, 0.55, 0.55, 0.5));
    for (const dz of [-0.4, 0.6, 1.4]) ext.add('shell', GEO.torus, COL.gold, T(I, nx, ny, nz + dz, 0, 0, 0, 0.5 + dz * 0.03, 0.5 + dz * 0.03, 1.8));
    ext.add('shell', GEO.box, COL.blueDeep, T(I, sx * (hw + 0.85), ny + 0.15, nz + 0.6, 0, 0, sx * 0.12, 1.7, 0.14, 0.7));
    ext.add('shell', GEO.box, COL.blueDeep, T(I, sx * (hw + 0.85), ny - 0.55, nz + 0.4, 0, 0, -sx * 0.5, 1.9, 0.1, 0.3));
    lamp.add('lamp', GEO.sphereLo, sx > 0 ? 0xff7a6a : 0x7af0a0, T(I, nx + sx * 0.5, ny, nz + 1.9, 0, 0, 0, 0.12));
    const p = propeller(1.15, 3, COL.woodLight); p.position.set(nx, ny, nz - 0.95); ship.add(p); nac.push(p);
  }
  // 船头风灯
  ext.add('shell', GEO.cyl6, COL.gold, T(I, 0, GH + 0.6, bowZ + hw * bowS - 0.3, 0, 0, 0, 0.03, 1.2, 0.03));
  lamp.add('lamp', GEO.oct, COL.lamp, T(I, 0, GH + 1.2, bowZ + hw * bowS - 0.3, 0, 0, 0, 0.18, 0.26, 0.18));

  // —— 气囊：分瓣色带 + 珊瑚色腰环 + 金色鼻锥 ——
  const env = new Batcher();
  const cA = new THREE.Color(0xf6eedc), cB = new THREE.Color(0xeadcc0), cBand = new THREE.Color(P.coral), cS = new THREE.Color(0xd2a052), tmp = new THREE.Color();
  env.add('shell', envelopeGeo(), (x, y, z) => {
    const zz = z - EZ, a = Math.atan2(x, (y - EY) / 0.92);
    const gore = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 16) % 2;
    tmp.copy(gore ? cA : cB);
    if (Math.abs(zz - 4.0) < 0.55 || Math.abs(zz + 6.5) < 0.45) tmp.copy(cBand);
    if (Math.abs(zz - 5.0) < 0.12 || Math.abs(zz - 3.0) < 0.12) tmp.copy(cS);
    if (zz > EL - 1.2) tmp.copy(cS);
    return tmp;
  }, T(I, 0, EY, EZ, 0, 0, 0, 1, 0.92, 1));
  // 气囊下方龙骨 + 串灯 + 悬吊索
  const keelY = EY - ER * 0.92 + 0.25;
  env.add('shell', GEO.box, COL.woodDark, T(I, 0, keelY, EZ - 0.5, 0, 0, 0, 0.35, 0.3, 24));
  for (let z = -11; z <= 9; z += 2.5) lamp.add('lamp', GEO.sphereLo, COL.lamp, T(I, 0, keelY - 0.25, EZ + z, 0, 0, 0, 0.1));
  for (const sx of [-1, 1]) for (const z of [-5.5, -2, 2, 5.5]) {
    const ez = z * 1.25 + EZ, er = envR(ez - EZ);
    env.segment('shell', COL.woodDark, I, [sx * (hw - 0.1), GH + 0.05, z], [sx * er * 0.62, EY - er * 0.92 * 0.78, ez], 0.025, GEO.cyl6);
  }
  for (const z of [-3.5, 3]) env.segment('shell', COL.blueDeep, I, [0, GH + 0.6, z], [0, keelY, z], 0.12, GEO.cyl8);
  // 名牌
  const nameTex = textTexture('风帆号', 'SKY SAIL · FENGQI ISLES');
  for (const sx of [-1, 1]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.0), new THREE.MeshBasicMaterial({ map: nameTex, transparent: true }));
    pl.position.set(sx * (ER + 0.04), EY + 0.6, EZ + 0.8); pl.rotation.y = sx * Math.PI / 2; ship.add(pl);
  }
  // 尾翼（上 / 下 / 左 / 右）+ 可动方向舵
  const fg = finGeo(), finZ = EZ - EL * 0.5;
  const rootR = envR(finZ - EZ - 3) * 0.62;
  for (const phi of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) env.add('shell', fg, phi === 0 || phi === Math.PI ? COL.sageDark : COL.sage, finMatrix(phi, finZ, rootR));
  const rudder = new THREE.Group();
  const rb = new Batcher();
  rb.add('shell', GEO.box, P.coral, T(I, 0, 2.3 + rootR, -0.65, 0, 0, 0, 0.14, 2.6, 1.3));
  rb.add('shell', GEO.box, P.coral, T(I, 0, -2.3 - rootR, -0.65, 0, 0, 0, 0.14, 2.6, 1.3));
  rb.build({ shell: TRAIN_MATS.shell }).forEach((m) => rudder.add(m));
  rudder.position.set(0, EY, finZ - 6.4);
  ship.add(rudder);
  // 尾部推进桨
  const tailProp = propeller(1.9, 4, COL.woodLight); tailProp.position.set(0, EY, EZ - EL - 0.5); ship.add(tailProp);
  env.add('shell', GEO.cone8, COL.gold, T(I, 0, EY, EZ - EL + 0.2, -Math.PI / 2, 0, 0, 0.35, 1.2, 0.35));
  // 顶部旗杆 + 三角旗
  const flagZ = EZ + 4;
  env.add('shell', GEO.cyl6, COL.gold, T(I, 0, EY + ER * 0.92 + 1.2, flagZ, 0, 0, 0, 0.05, 2.4, 0.05));
  env.add('swaySoft', GEO.prism, P.coral, T(I, 0, EY + ER * 0.92 + 2.0, flagZ - 0.75, Math.PI / 2, 0, Math.PI / 2, 0.45, 0.04, 1.3));

  // —— 风帆：气囊两侧的扇形帆，航行时展开 ——
  const sails = [];
  for (const sx of [-1, 1]) {
    const sb = new Batcher();
    const shp = new THREE.Shape();
    shp.moveTo(0, -3.8); shp.quadraticCurveTo(2.6, -3.0, 4.3, -1.6); shp.lineTo(4.6, 2.6); shp.quadraticCurveTo(2.4, 3.8, 0, 4.2); shp.lineTo(0, -3.8);
    const sg = new THREE.ShapeGeometry(shp, 8);
    sg.rotateX(-Math.PI / 2);   // 形状平面 XY → XZ（x 向外，y→ -z）
    const sailCol = (x, y, z) => tmp.set(Math.floor((z + 4) / 1.4) % 2 ? 0xf6efe0 : 0xefe3c9).lerp(cBand, x > 4.0 ? 0.8 : 0);
    sb.add('sail', sg, sailCol, new THREE.Matrix4());
    for (const z of [-2.8, -0.9, 1.0, 2.9]) sb.add('shell', GEO.box, COL.gold, T(I, 2.2, 0.03, z, 0, 0, 0, 4.4, 0.05, 0.07));
    sb.add('shell', GEO.cyl8, COL.woodDark, T(I, 0.2, 0, 0.2, Math.PI / 2, 0, 0, 0.08, 8.4, 0.08));
    const pivot = new THREE.Group();
    sb.build({ sail: SAIL_MAT, shell: TRAIN_MATS.shell }).forEach((m) => { m.castShadow = true; pivot.add(m); });
    pivot.position.set(sx * (ER * 0.97), EY - 1.2, EZ + 1.5);
    pivot.scale.x = sx;      // 镜像到左侧
    ship.add(pivot); sails.push(pivot);
  }

  const parts = {
    shell: meshFrom(ext, { shell: TRAIN_MATS.shell }),
    envelope: meshFrom(env, { shell: TRAIN_MATS.shell }),
    interior: meshFrom(inn, { interior: TRAIN_MATS.interior }),
    windows: meshFrom(glass, { glass: TRAIN_MATS.glass }),
    lamps: meshFrom(lamp, { lamp: TRAIN_MATS.lamp }),
  };
  for (const [k, p] of Object.entries(parts)) { p.name = k; ship.add(p); }
  parts.windows.traverse((o) => { o.castShadow = false; o.receiveShadow = false; o.renderOrder = 8; });
  parts.lamps.traverse((o) => { o.castShadow = false; });
  parts.interior.traverse((o) => { o.castShadow = false; o.receiveShadow = true; });

  // —— 舱门（两侧各一，向船尾滑开）+ 舷梯 ——
  const db = new Batcher();
  db.add('door', GEO.box, COL.sage, T(I, 0, 0.45, 0, 0, 0, 0, 0.06, 0.9, DOOR_W - 0.05));
  db.add('door', GEO.box, COL.cream, T(I, 0, 1.42, 0, 0, 0, 0, 0.06, 1.05, DOOR_W - 0.05));
  db.add('door', GEO.torus, COL.gold, T(I, 0.04, 1.45, 0, 0, Math.PI / 2, 0, 0.3, 0.3, 1));
  const doorMesh = db.build({ door: TRAIN_MATS.door })[0];
  const doors = [], gangways = [];
  for (const sx of [-1, 1]) {
    const d = new THREE.Group(); d.name = 'door';
    const m = doorMesh.clone(); d.add(m);
    const gl = new THREE.Mesh(new THREE.CircleGeometry(0.27, 14), TRAIN_MATS.glass); gl.position.set(sx * 0.04, 1.45, 0); gl.rotation.y = sx * Math.PI / 2; d.add(gl);
    d.position.set(sx * (hw + 0.07), 0, 0);
    d.userData = { side: sx, closedZ: 0, openZ: -DOOR_W - 0.05 };
    ship.add(d); doors.push(d);
    const gw = new THREE.Group();
    const gb = new Batcher();
    gb.add('shell', GEO.box, COL.woodLight, T(I, 0.5, -0.04, 0, 0, 0, 0, 1.0, 0.06, DOOR_W - 0.1));
    gb.add('shell', GEO.box, COL.gold, T(I, 0.5, 0.0, (DOOR_W - 0.1) / 2, 0, 0, 0, 1.0, 0.04, 0.04));
    gb.add('shell', GEO.box, COL.gold, T(I, 0.5, 0.0, -(DOOR_W - 0.1) / 2, 0, 0, 0, 1.0, 0.04, 0.04));
    gb.build({ shell: TRAIN_MATS.shell }).forEach((mm) => gw.add(mm));
    gw.position.set(sx * hw, 0, 0); gw.scale.set(sx * 0.01, 1, 1);
    ship.add(gw); gangways.push(gw);
  }

  const anchors = {
    seat: new THREE.Vector3(-1.15, 0, seatZ[2] + 0.05),
    windowEye: new THREE.Vector3(-1.0, 1.3, 3.0),   // 视线穿过 z=3.4 的舷窗中心
    cabin: [
      { pos: new THREE.Vector3(0.35, 1.65, -L2 + 0.9), yaw: 0 },
      { pos: new THREE.Vector3(0.9, 1.6, L2 - 0.2), yaw: Math.PI },
      { pos: new THREE.Vector3(1.2, 1.55, -0.2), yaw: -Math.PI / 2 + 0.25 },
    ],
  };
  ship.userData = { doors, gangways, props: nac, tailProp, rudder, sails, anchors };
  return ship;
}

// ---------------- 航线 ----------------
export class Airway {
  /**
   * @param docks [{ island, plan, name, hint:Vector3 }]  hint 为停靠时的大致航向
   * @param opts { waypoints:(stations)=>Vector3[] }
   */
  constructor(docks, opts = {}) {
    this.docks = docks; this.opts = opts;
    this.name = 'air'; this.closed = true; this.isAir = true; this.mode = 'cloud';
    this.stations = [];
  }

  build(scene, physics, interact) {
    this.docks.forEach((d, i) => {
      const F = dockFrame(d.island, d.plan);
      const dir = F.tan.clone(); if (dir.dot(d.hint) < 0) dir.negate();
      const toIsl = F.out.clone().negate();
      const st = { index: i, rail: this, island: d.island, name: d.name, pos: F.shipPos.clone(), dir, perp: F.out.clone(), th: d.plan.th, top: F.top, headC: F.headC.clone() };
      st.platformCenter = F.root.clone().addScaledVector(F.out, d.plan.len * 0.5 + 1);
      st.boardPoint = F.headC.clone();
      st.alightCandidates = [];
      for (const dd of [-0.4, 0.2, -1.0]) for (const u of [0, -1.6, 1.6, -3.2, 3.2]) st.alightCandidates.push(F.headC.clone().addScaledVector(F.out, dd).addScaledVector(F.tan, u));
      st.alightCandidates.push(F.root.clone().addScaledVector(F.out, d.plan.len - 2));
      st.alightHeading = Math.atan2(toIsl.x, toIsl.z);
      const yaw = Math.atan2(dir.x, dir.z);
      st.side = Math.sign(new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).dot(toIsl)) || 1;   // 舱门朝向码头的一侧（局部 ±X）
      this.stations.push(st);
      interact.push({ pos: st.platformCenter, radius: d.plan.len * 0.5 + 9, label: () => this.stationLabel?.(st) ?? null, action: () => this.stationAction?.(st), priority: 1 });
    });
    const pts = this.opts.waypoints(this.stations);
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.curve.arcLengthDivisions = 12000;
    this.length = this.curve.getLength();
    for (const st of this.stations) {
      let best = 0, bd = 1e9;
      for (let k = 0; k <= 12000; k++) { const d = this.curve.getPointAt(k / 12000).distanceToSquared(st.pos); if (d < bd) { bd = d; best = k / 12000; } }
      st.s = best * this.length;
    }
    this.samples = [];
    for (let s = 0; s < this.length; s += 6) this.samples.push(this.frameAt(s, {}).pos.clone());
    this.buildBuoys(scene);
    this.train = new Airship(this);
    scene.add(this.train.group);
    return this;
  }

  frameAt(s, out = {}) {
    const u = (((s % this.length) + this.length) % this.length) / this.length;
    out.pos = this.curve.getPointAt(u, out.pos || new THREE.Vector3());
    out.tan = this.curve.getTangentAt(u, out.tan || new THREE.Vector3());
    out.right = (out.right || new THREE.Vector3()).crossVectors(out.tan, UP).normalize();
    out.up = (out.up || new THREE.Vector3()).crossVectors(out.right, out.tan).normalize();
    return out;
  }

  /** 航标：沿航线漂浮的小风灯（离港区较远处才放置） */
  buildBuoys(scene) {
    const spacing = 75, n = Math.floor(this.length / spacing);
    const geo = new THREE.OctahedronGeometry(0.55, 0);
    const ring = new THREE.TorusGeometry(1.1, 0.07, 5, 18);
    const lamps = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: P.glowWarm }), n);
    const rings = new THREE.InstancedMesh(ring, wc({ color: P.gold }), n);
    const dm = new THREE.Object3D(), f = {};
    let k = 0;
    for (let i = 0; i < n; i++) {
      const s = i * spacing;
      if (this.stations.some((st) => Math.abs((((s - st.s) % this.length) + this.length * 1.5) % this.length - this.length * 0.5) < 160)) continue;
      this.frameAt(s, f);
      dm.position.copy(f.pos).addScaledVector(f.up, -9).addScaledVector(f.right, (i % 2 ? 1 : -1) * 14);
      dm.rotation.set(0, Math.atan2(f.tan.x, f.tan.z), 0); dm.updateMatrix();
      lamps.setMatrixAt(k, dm.matrix);
      dm.rotation.set(Math.PI / 2, 0, 0); dm.updateMatrix();
      rings.setMatrixAt(k, dm.matrix);
      k++;
    }
    lamps.count = k; rings.count = k;
    rings.castShadow = false;
    const g = new THREE.Group(); g.name = 'airway:buoys'; g.add(lamps, rings);
    scene.add(g);
    this.buoys = g;
  }

  update() { /* 航线本身没有动态部件；飞艇在 Airship.update 中运动 */ }
  setMode() {}
  revealAt() { return 1; }

  nearestStation(p) {
    let best = null, bd = 1e9;
    for (const st of this.stations) { const d = st.platformCenter.distanceTo(p); if (d < bd) { bd = d; best = st; } }
    return best;
  }
}

// ---------------- 飞艇运行 ----------------
// 状态与 Train 相同：idle → arriving → dwell → running；无人乘坐时停在起点，或自动飞回起点
export class Airship {
  constructor(rail) {
    this.rail = rail;
    this.name = '风帆号';
    this.isAirship = true;
    this.group = buildAirship();
    const U = this.group.userData;
    this.doors = U.doors; this.anchors = U.anchors;
    this.dir = 1; this.totalLen = 0;
    this.stationIdx = 0; this.home = 0;            // 0 号港（风栖主岛）是飞艇的家
    this.s = this.stopS(0);
    this.speed = 0; this.state = 'idle'; this.riding = false; this.dwell = 0;
    this.targetIdx = 1; this.destination = null;
    this.vmax = 32; this.accel = 1.3; this.decel = 1.0;
    this.events = [];
    this.doorsOpen = false; this.doorK = 0;
    this.night = 0; this.throttle = 0.12; this.sailK = 0; this.propA = 0; this.idleT = 0;
    this.roll = 0; this.pitch = 0; this.yawRate = 0; this.bobK = 0;
    this.mapColor = '#e39a86';
    this.viewScale = 2.4;
    this.viewNames = { window: '舷窗观景', cabin: '船舱内部', follow: '飞艇外部跟随', panorama: '世界全景' };
    this.words = {
      board: '按 <b>E</b> 登上飞艇「风帆号」', call: '按 <b>E</b> 呼叫飞艇「风帆号」', coming: '风帆号正在靠港……',
      alight: '下船', depart: '起航', wait: '请等待飞艇靠港', settle: '请等待飞艇停稳',
      welcome: (st) => `欢迎登上「风帆号」· ${st.name} 起航`,
    };
    this._f = {}; this._fp = new THREE.Vector3(); this._mapPos = new THREE.Vector3();
    this.place(0);
  }

  stopS(i) { return this.rail.stations[i].s; }
  get station() { return this.rail.stations[this.stationIdx]; }
  get nextStation() { return this.rail.stations[this.targetIdx]; }
  get stopped() { return this.state === 'idle' || this.state === 'dwell'; }
  nextIndex(i) { return (i + 1) % this.rail.stations.length; }
  distAhead(target) { const L = this.rail.length; return ((target - this.s) % L + L) % L; }

  interact(st) {
    if (this.riding) return;
    if (this.stopped && this.stationIdx === st.index) return;
    if ((this.state === 'arriving' || this.state === 'running') && this.targetIdx === st.index) {
      this.events.push({ type: 'toast', text: `风帆号正在飞来 · 请在 ${st.name} 稍候` });
      return;
    }
    const L = this.rail.length;
    this.s = ((this.stopS(st.index) - 420) % L + L) % L;   // 从航线上游驶来
    this.speed = 18; this.targetIdx = st.index; this.state = 'arriving';
    this.events.push({ type: 'toast', text: `风帆号正飞向 ${st.name}` });
  }
  board() { this.riding = true; this.state = 'dwell'; this.dwell = 5; this.destination = null; }
  alight() { this.riding = false; this.state = 'idle'; this.speed = 0; this.idleT = 0; }
  requestNextStop() { if (this.state === 'running') this.destination = null; }
  openDoors(open) { this.doorsOpen = open; }
  setDestination(i) {
    if (!this.riding || (i === this.stationIdx && this.stopped)) return;
    this.destination = i;
    if (this.state === 'running') this.targetIdx = i;
    this.events.push({ type: 'toast', text: `目的港已设为 ${this.rail.stations[i].name}` });
  }
  departNow() { if (this.state === 'dwell') this.dwell = 0; }

  update(dt) {
    const L = this.rail.length;
    // 无人乘坐：平时停在起点（风栖主岛空港）等候；停在别的港口时，玩家离开 45 秒后自动飞回起点
    if (this.state === 'idle' && !this.riding) {
      this.idleT += dt;
      const near = this.station.platformCenter.distanceTo(G.playerPos.value) < 70;
      if (this.stationIdx !== this.home && this.idleT > 45 && !near) {
        this.idleT = 0; this.state = 'running'; this.targetIdx = this.home;
        this.events.push({ type: 'depart' });
      }
    }
    if (this.state === 'dwell') {
      this.dwell -= dt;
      if (this.dwell <= 0) {
        this.state = 'running';
        this.targetIdx = this.destination ?? this.nextIndex(this.stationIdx);
        if (this.targetIdx === this.stationIdx) this.targetIdx = this.nextIndex(this.stationIdx);
        this.announced = false; this.doorsOpen = false;
        this.events.push({ type: 'depart' });
      }
    } else if (this.state === 'running' || this.state === 'arriving') {
      const d = this.distAhead(this.stopS(this.targetIdx));
      const vT = Math.min(this.vmax, Math.sqrt(2 * this.decel * Math.max(d - 0.3, 0)) + 0.35);
      this.speed += Math.max(-this.decel * 2.2 * dt, Math.min(this.accel * dt, vT - this.speed));
      const ds = Math.min(this.speed * dt, d);
      this.s = (this.s + ds) % L;
      if (this.riding && !this.announced && d < 600) { this.announced = true; this.events.push({ type: 'approach', station: this.rail.stations[this.targetIdx] }); }
      if (d - ds < 0.05) {
        this.s = this.stopS(this.targetIdx); this.speed = 0; this.stationIdx = this.targetIdx;
        if (this.riding) {
          const isDest = this.destination === null || this.destination === this.stationIdx;
          this.state = 'dwell'; this.dwell = isDest ? 14 : 8;
          if (this.destination === this.stationIdx) this.destination = null;
          this.doorsOpen = true;
          this.events.push({ type: 'arrive', station: this.station });
        } else { this.state = 'idle'; this.idleT = 0; }
      }
    }
    this.place(dt);
    this.animate(dt);
  }

  place(dt) {
    const f = this.rail.frameAt(this.s, this._f), tan = f.tan;
    const yaw = Math.atan2(tan.x, tan.z);
    if (this._yaw === undefined) this._yaw = yaw;
    let dy = yaw - this._yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this._yaw = yaw;
    const yr = dt > 0 ? dy / dt : 0;
    this.yawRate = dt > 0 ? damp(this.yawRate, yr, 2, dt) : 0;
    // 转弯时向内侧轻微倾斜，爬升/下降时俯仰
    this.roll = dt > 0 ? damp(this.roll, clamp(-this.yawRate * 0.9, -0.12, 0.12), 1.2, dt) : 0;
    this.pitch = dt > 0 ? damp(this.pitch, -Math.asin(clamp(tan.y, -1, 1)) * 0.55, 1.2, dt) : 0;
    this.bobK = dt > 0 ? damp(this.bobK, this.stopped ? 0 : 1, 0.5, dt) : 0;
    const t = G.time.value;
    const g = this.group;
    g.position.copy(f.pos);
    g.position.y += Math.sin(t * 0.9) * 0.04 + Math.sin(t * 0.37) * 0.6 * this.bobK;
    g.rotation.set(this.pitch, yaw, this.roll + Math.sin(t * 0.5) * 0.012 * (0.4 + this.bobK), 'YXZ');
    g.updateMatrixWorld(true);
  }

  animate(dt) {
    const U = this.group.userData;
    // 油门：停港怠速，航行时随速度提高
    const thr = this.stopped ? 0.12 : 0.35 + 0.65 * Math.min(1, this.speed / this.vmax);
    this.throttle = damp(this.throttle, thr, 1.5, dt);
    this.propA += this.throttle * 28 * dt;
    for (const p of U.props) p.rotation.z = this.propA;
    U.tailProp.rotation.z = -this.propA * 0.8;
    U.rudder.rotation.y = clamp(this.yawRate * 3, -0.45, 0.45);
    // 风帆：航行时展开，停港时收拢
    this.sailK = damp(this.sailK, this.state === 'running' && this.speed > 5 ? 1 : 0.1, 0.7, dt);
    const t = G.time.value;
    U.sails.forEach((s, i) => {
      const sx = i ? 1 : -1;
      s.scale.set(sx * (0.12 + 0.88 * this.sailK), 1, 0.35 + 0.65 * this.sailK);
      s.rotation.z = sx * (0.18 + Math.sin(t * 2.3 + i) * 0.025 * this.sailK);
    });
    // 舱门与舷梯（只打开朝向码头的一侧）
    this.doorK = damp(this.doorK, this.doorsOpen ? 1 : 0, 4, dt);
    const side = this.station?.side ?? 1;
    for (const d of this.doors) {
      const k = d.userData.side === side ? this.doorK : 0;
      d.position.z = d.userData.closedZ + (d.userData.openZ - d.userData.closedZ) * k;
    }
    U.gangways.forEach((g, i) => { const sx = i ? 1 : -1; const k = sx === side ? this.doorK : 0; g.scale.x = sx * Math.max(0.01, k * 0.6); g.visible = k > 0.02; });
    // 昼夜灯光（与列车共享材质）
    TRAIN_MATS.lamp.color.setScalar(0.75 + this.night * 0.9);
    TRAIN_MATS.interior.emissiveIntensity = 0.3 + this.night * 0.55;
  }

  // —— 锚点（世界坐标） ——
  local(v, out = new THREE.Vector3()) { return out.copy(v).applyMatrix4(this.group.matrixWorld); }
  seatPosition(out) { return this.local(this.anchors.seat, out); }
  /** 舱门内侧（朝向当前码头的一侧） */
  doorPosition(out) { return this.local((this._dl ||= new THREE.Vector3()).set((this.station?.side ?? 1) * (GW / 2 - 0.45), 0, 0), out); }
  get rideAnchors() { return this.anchors; }
  get rideMatrix() { return this.group.matrixWorld; }
  get heading() { const t = this._f.tan; return Math.atan2(t.x, t.z); }
  get tangent() { return this._f.tan; }
  get moveTangent() { return this._f.tan; }
  get focusPos() { return this._fp.set(0, 4.5, -1).applyMatrix4(this.group.matrixWorld); }
  get midPosition() { return this.focusPos; }
  get mapPos() { return this.group.position; }
}
