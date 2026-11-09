// ============================================================
// 云轨铁路：环线规划 → 金色悬浮轨道 → 车站 → 复古童话列车
// ============================================================
import * as THREE from 'three';
import { Batcher, GEO, M, T } from '../core/batcher.js';
import { wc, MATS, textTexture } from '../core/materials.js';
import { BoxSurface } from '../core/physics.js';
import { PALETTE as P } from '../config.js';
import { lamp, bench, house } from './props.js';

const UP = new THREE.Vector3(0, 1, 0);
const STRAIGHT = 70;   // 站台直线段半长
const PLATFORM_TOP = 0.95;

export class Railway {
  /** 第一步：根据岛屿规划车站（必须在岛屿网格生成前调用，以便平整站台地形） */
  constructor(route) {
    this.route = route;
    this.stations = [];
    const N = route.length;
    const cen = new THREE.Vector3();
    route.forEach((i) => cen.add(i.center));
    cen.divideScalar(N);
    route.forEach((isl, i) => {
      const prev = route[(i - 1 + N) % N].center, next = route[(i + 1) % N].center;
      const dir = next.clone().sub(prev).setY(0).normalize();
      let perp = new THREE.Vector3(-dir.z, 0, dir.x);
      const side = isl.cfg.stationSide ?? Math.sign(perp.dot(isl.center.clone().sub(cen)) || 1);
      perp.multiplyScalar(side);
      const th = Math.atan2(perp.z, perp.x);
      let maxRim = 0;
      for (let k = -12; k <= 12; k++) maxRim = Math.max(maxRim, isl.rim(th + k * 0.06));
      const D = maxRim + 5.5;
      const pos = isl.center.clone().addScaledVector(perp, D);
      pos.y = isl.center.y + 0.5;
      const rimHere = isl.rim(th);
      const st = { index: i, island: isl, name: isl.cfg.station, pos, dir, perp, th, D, rimHere };
      // 平整站台附近地形（局部坐标）
      const fl = perp.clone().multiplyScalar(rimHere - 6);
      isl.flats.push({ x: fl.x, z: fl.z, r: 16, blend: 10, h: 0.5 + PLATFORM_TOP - 0.08 });
      const k1 = perp.clone().multiplyScalar(rimHere - 4);
      isl.keep.push({ x: k1.x, z: k1.z, r: 18 });
      st.local = perp.clone().multiplyScalar(rimHere - 14); // 站台内侧入口（局部）
      isl.station = st;
      this.stations.push(st);
    });
  }

  /** 第二步：生成曲线与可视化 */
  build(scene, physics, interact) {
    const pts = [];
    const S = this.stations, N = S.length;
    const lifts = [24, -34, 14, -26, 20, 6];
    for (let i = 0; i < N; i++) {
      const a = S[i], b = S[(i + 1) % N];
      pts.push(a.pos.clone().addScaledVector(a.dir, -STRAIGHT), a.pos.clone(), a.pos.clone().addScaledVector(a.dir, STRAIGHT));
      const ea = a.pos.clone().addScaledVector(a.dir, STRAIGHT + 110);
      const eb = b.pos.clone().addScaledVector(b.dir, -STRAIGHT - 110);
      ea.y = a.pos.y; eb.y = b.pos.y;
      const mid = ea.clone().lerp(eb, 0.5);
      const seg = eb.clone().sub(ea); const L = seg.length();
      const lat = new THREE.Vector3(-seg.z, 0, seg.x).normalize();
      mid.addScaledVector(lat, (i % 2 ? 1 : -1) * L * 0.12);
      mid.y += lifts[i % lifts.length];
      pts.push(ea, mid, eb);
    }
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.curve.arcLengthDivisions = 6000;
    this.length = this.curve.getLength();
    // 每个车站在曲线上的弧长位置
    S.forEach((st) => {
      let best = 0, bd = 1e9;
      for (let k = 0; k <= 6000; k++) {
        const u = k / 6000, d = this.curve.getPointAt(u).distanceToSquared(st.pos);
        if (d < bd) { bd = d; best = u; }
      }
      st.s = best * this.length;
    });
    this.buildTrack(scene);
    S.forEach((st) => this.buildStation(st, scene, physics, interact));
    this.train = new Train(this);
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

  buildTrack(scene) {
    const step = 2;
    const F = Math.floor(this.length / step);
    const frames = [];
    for (let i = 0; i < F; i++) frames.push(this.frameAt(i * step * (this.length / (F * step)), {}));
    this.samples = frames.map((f) => f.pos.clone());

    // 沿曲线扫掠矩形截面
    const sweep = (profile, color) => {
      const P2 = profile.length, pos = [], idx = [];
      for (const f of frames) for (const [x, y] of profile) {
        pos.push(f.pos.x + f.right.x * x + f.up.x * y, f.pos.y + f.right.y * x + f.up.y * y, f.pos.z + f.right.z * x + f.up.z * y);
      }
      for (let i = 0; i < F; i++) {
        const ni = (i + 1) % F;
        for (let j = 0; j < P2; j++) {
          const a = i * P2 + j, b = i * P2 + ((j + 1) % P2), c = ni * P2 + j, d = ni * P2 + ((j + 1) % P2);
          idx.push(a, c, b, b, c, d);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, wc({ color, flat: true, side: THREE.DoubleSide, grain: 0.6 }));
      m.castShadow = true; m.receiveShadow = true;
      return m;
    };
    const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const grp = new THREE.Group(); grp.name = 'track';
    grp.add(sweep(rect(-0.82, -0.16, -0.66, 0), P.gold));
    grp.add(sweep(rect(0.66, -0.16, 0.82, 0), P.gold));
    grp.add(sweep([[-0.5, -0.42], [0.5, -0.42], [0.32, -0.9], [-0.32, -0.9]], P.cream));
    grp.add(sweep(rect(-0.12, -1.05, 0.12, -0.88), P.goldLight));

    // 枕木 + 装饰托架 + 灯笼（实例化）
    const dummy = new THREE.Object3D();
    const sleeperN = Math.floor(this.length / 1.6);
    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, 0.14, 0.34), wc({ color: 0xc9a27e, flat: true }), sleeperN);
    const fr = {};
    for (let i = 0; i < sleeperN; i++) {
      this.frameAt(i * 1.6, fr);
      dummy.position.copy(fr.pos).addScaledVector(fr.up, -0.25);
      dummy.lookAt(dummy.position.clone().add(fr.tan));
      dummy.updateMatrix();
      sleepers.setMatrixAt(i, dummy.matrix);
    }
    sleepers.receiveShadow = true;
    grp.add(sleepers);

    const arcN = Math.floor(this.length / 14);
    const arcGeo = new THREE.TorusGeometry(1.0, 0.07, 5, 16, Math.PI);
    arcGeo.rotateZ(Math.PI);
    const arcs = new THREE.InstancedMesh(arcGeo, wc({ color: P.gold, grain: 0.4 }), arcN);
    const lanterns = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: P.glowWarm }), arcN);
    for (let i = 0; i < arcN; i++) {
      this.frameAt(i * 14, fr);
      dummy.position.copy(fr.pos).addScaledVector(fr.up, -0.45);
      dummy.lookAt(dummy.position.clone().add(fr.tan));
      dummy.updateMatrix();
      arcs.setMatrixAt(i, dummy.matrix);
      dummy.position.copy(fr.pos).addScaledVector(fr.up, -1.6);
      dummy.updateMatrix();
      lanterns.setMatrixAt(i, dummy.matrix);
    }
    grp.add(arcs, lanterns);
    scene.add(grp);
    this.trackGroup = grp;
  }

  buildStation(st, scene, physics, interact) {
    const isl = st.island;
    const b = new Batcher();
    const toIsl = st.perp.clone().negate();
    const ang = Math.atan2(st.dir.x, st.dir.z); // 局部 +Z 沿轨道方向
    // 站台：从轨道边缘延伸到岛内
    const outer = 1.75, inner = st.D - (st.rimHere - 11);
    const width = inner - outer, mid = (outer + inner) / 2;
    const c = st.pos.clone().addScaledVector(toIsl, mid);
    const top = st.pos.y + PLATFORM_TOP;
    const base = new THREE.Matrix4().compose(new THREE.Vector3(c.x, top, c.z), new THREE.Quaternion().setFromAxisAngle(UP, ang), new THREE.Vector3(1, 1, 1));
    // 本地坐标：x 轴 = 指向轨道的反方向？计算 toIsl 在本地的 x 符号
    const localRight = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, ang); // 本地 +X 的世界方向
    const sx = Math.sign(localRight.dot(toIsl)) || 1;                       // +sx*X 指向岛内
    const L = 46;
    b.add('flat', GEO.box, P.stone, T(base, 0, -2.2, 0, 0, 0, 0, width, 4.4, L));
    b.add('solid', GEO.box, P.cream, T(base, -sx * (width / 2 - 0.25), 0.02, 0, 0, 0, 0, 0.5, 0.06, L));
    b.add('solid', GEO.box, P.gold, T(base, -sx * (width / 2 - 0.6), 0.03, 0, 0, 0, 0, 0.12, 0.06, L));
    // 地砖纹理
    for (let z = -L / 2 + 2; z < L / 2; z += 4) b.add('solid', GEO.box, P.stoneDark, T(base, 0, 0.01, z, 0, 0, 0, width - 1, 0.02, 0.08));
    // 雨棚：金色立柱 + 鼠尾草绿顶棚
    const roofW = Math.min(width - 1, 7.5), rx = -sx * (width / 2 - 1.2 - roofW / 2);
    for (let z = -16; z <= 16; z += 8) {
      b.add('solid', GEO.cyl8, P.gold, T(base, rx + sx * roofW * 0.35, 2.2, z, 0, 0, 0, 0.13, 4.4, 0.13));
      b.add('solid', GEO.cyl8, P.copper, T(base, rx + sx * roofW * 0.35, 0.15, z, 0, 0, 0, 0.25, 0.3, 0.25));
    }
    b.add('flat', GEO.box, P.sageDark, T(base, rx, 4.55, 0, 0, 0, sx * 0.12, roofW + 1.2, 0.22, 36));
    b.add('solid', GEO.box, P.cream, T(base, rx, 4.35, 0, 0, 0, sx * 0.12, roofW + 1.3, 0.12, 36.3));
    for (let z = -16; z <= 16; z += 8) b.add('solid', GEO.torus, P.gold, T(base, rx, 4.0, z, 0, Math.PI / 2, 0, 0.6, 0.6, 0.6));
    // 长椅与灯
    for (const z of [-10, 10]) bench(b, T(base, rx + sx * roofW * 0.2, 0, z, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0));
    for (const z of [-21, 21]) lamp(b, T(base, -sx * (width / 2 - 1.4), 0, z));
    // 小站房
    house(b, T(base, sx * (width / 2 - 4.5), 0, -L / 2 + 6, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0), { w: 6, d: 5, h: 3.2, roof: P.sageDark, wall: P.cream });
    b.build().forEach((m) => scene.add(m));

    // 站牌
    const tex = textTexture(st.name, 'CLOUD RAIL · ' + isl.id.toUpperCase());
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.3), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    sign.applyMatrix4(T(base, rx, 3.35, 0, 0, Math.PI / 2, 0));
    scene.add(sign);

    // 物理：站台可行走；站房碰撞
    physics.addSurface(new BoxSurface(c.x, c.z, top, width / 2, L / 2, Math.atan2(toIsl.z, toIsl.x), 4.4));
    const hp = new THREE.Vector3(sx * (width / 2 - 4.5), 0, -L / 2 + 6).applyMatrix4(base);
    physics.addCircle(hp.x, hp.z, 3.6, top - 1, top + 6);

    st.platformCenter = c.clone().setY(top);
    st.boardPoint = st.pos.clone().addScaledVector(toIsl, 3.2).setY(top);
    st.top = top;
    // 下车锚点候选：站台上靠近车门、远离轨道边缘的位置（由 RideController 逐个校验）
    st.alightCandidates = [];
    for (const d of [5.5, 7, 4.5, 9]) for (const a of [0, -4, 4, -8, 8])
      st.alightCandidates.push(st.pos.clone().addScaledVector(toIsl, d).addScaledVector(st.dir, a).setY(top));
    st.alightHeading = Math.atan2(toIsl.x, toIsl.z);
    interact.push({
      pos: st.platformCenter, radius: Math.max(width, 14) * 0.8 + 10,
      label: () => this.stationLabel?.(st) ?? null,
      action: () => this.stationAction?.(st),
      priority: 1,
    });
  }

  nearestStation(p) {
    let best = null, bd = 1e9;
    for (const st of this.stations) { const d = st.platformCenter.distanceTo(p); if (d < bd) { bd = d; best = st; } }
    return best;
  }
}

// ============================================================
// 列车：车头（铜金锅炉 + 鼠尾草绿驾驶室）+ 两节客车 + 观景车
// 状态：idle（停站等待）→ arriving（被呼叫进站）→ dwell（停靠）→ running（运行）
// ============================================================
const CAR_LEN = [9.5, 8.6, 8.6, 8.0];
const GAP = 0.9;

function buildLoco() {
  const b = new Batcher(); const I = new THREE.Matrix4();
  b.add('solid', GEO.box, P.sageDeep, T(I, 0, 0.75, 0, 0, 0, 0, 2.3, 0.5, 9.2));
  b.add('solid', GEO.box, P.gold, T(I, 0, 1.0, 0, 0, 0, 0, 2.4, 0.08, 9.3));
  b.add('solid', GEO.cyl16, P.copper, T(I, 0, 2.0, 1.4, Math.PI / 2, 0, 0, 1.05, 5.6, 1.05));
  for (const z of [-0.6, 1.4, 3.4]) b.add('solid', GEO.cyl16, P.gold, T(I, 0, 2.0, z, Math.PI / 2, 0, 0, 1.1, 0.16, 1.1));
  b.add('solid', GEO.cyl16, P.sageDark, T(I, 0, 2.0, 4.25, Math.PI / 2, 0, 0, 1.0, 0.15, 1.0));
  b.add('solid', GEO.sphereLo, P.gold, T(I, 0, 2.0, 4.35, 0, 0, 0, 0.35, 0.35, 0.15));
  b.add('solid', GEO.taper8, P.copper, T(I, 0, 3.6, 3.2, Math.PI, 0, 0, 0.42, 1.6, 0.42));
  b.add('solid', GEO.cyl8, P.gold, T(I, 0, 4.45, 3.2, 0, 0, 0, 0.62, 0.22, 0.62));
  b.add('solid', GEO.dome, P.gold, T(I, 0, 3.0, 1.0, 0, 0, 0, 0.42, 0.5, 0.42));
  // 驾驶室
  b.add('solid', GEO.box, P.sage, T(I, 0, 2.4, -2.6, 0, 0, 0, 2.4, 2.8, 3.0));
  b.add('solid', GEO.box, P.cream, T(I, 0, 3.95, -2.6, 0, 0, 0, 2.8, 0.25, 3.5));
  b.add('solid', GEO.box, P.gold, T(I, 0, 1.4, -2.6, 0, 0, 0, 2.45, 0.1, 3.05));
  for (const x of [-1.22, 1.22]) b.add('glow', GEO.box, 0xf3d9a6, T(I, x, 2.9, -2.6, 0, 0, 0, 0.05, 0.9, 1.6));
  // 前灯与排障器
  b.add('glow', GEO.cyl12, 0xfff2c8, T(I, 0, 2.9, 4.1, Math.PI / 2, 0, 0, 0.3, 0.3, 0.3));
  b.add('solid', GEO.cone4, P.gold, T(I, 0, 0.55, 4.7, -Math.PI / 2, Math.PI / 4, 0, 1.0, 0.8, 0.5));
  // 小金翅膀（天空列车的标志）
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++)
      b.add('flat', GEO.box, k ? P.goldLight : P.gold, T(I, s * (1.3 + k * 0.35), 2.3 + k * 0.12, 1.8 - k * 0.5, 0.2, 0, s * (0.35 + k * 0.1), 0.9, 0.08, 1.6 - k * 0.35));
  }
  const g = new THREE.Group(); b.build().forEach((m) => g.add(m));
  return { g, chimney: new THREE.Vector3(0, 4.6, 3.2) };
}

function buildCar(open = false) {
  const b = new Batcher(); const I = new THREE.Matrix4();
  const L = open ? 7.6 : 8.2;
  b.add('solid', GEO.box, P.sageDeep, T(I, 0, 0.75, 0, 0, 0, 0, 2.3, 0.5, L));
  b.add('solid', GEO.box, P.gold, T(I, 0, 1.0, 0, 0, 0, 0, 2.45, 0.1, L + 0.1));
  if (!open) {
    b.add('solid', GEO.box, P.sage, T(I, 0, 1.55, 0, 0, 0, 0, 2.5, 1.0, L));
    b.add('solid', GEO.box, P.cream, T(I, 0, 2.6, 0, 0, 0, 0, 2.5, 1.2, L));
    b.add('solid', GEO.box, P.gold, T(I, 0, 2.05, 0, 0, 0, 0, 2.55, 0.08, L + 0.02));
    for (let z = -L / 2 + 1.2; z < L / 2 - 0.6; z += 1.5)
      for (const x of [-1.26, 1.26]) b.add('glow', GEO.box, 0xf3d9a6, T(I, x, 2.6, z + 0.3, 0, 0, 0, 0.04, 0.75, 1.0));
    b.add('solid', GEO.cyl16, P.sageDark, T(I, 0, 3.15, 0, Math.PI / 2, 0, 0, 1.35, L + 0.3, 0.45).multiply(M(0, 0, 0)));
    b.add('solid', GEO.box, P.cream, T(I, 0, 3.25, 0, 0, 0, 0, 2.7, 0.08, L + 0.4));
    for (const z of [-L / 2 + 0.6, L / 2 - 0.6]) b.add('glow', GEO.sphereLo, P.glowWarm, T(I, 1.4, 2.95, z, 0, 0, 0, 0.18));
  } else {
    // 观景车：开放甲板 + 围栏 + 花箱 + 小顶棚
    b.add('solid', GEO.box, P.wood, T(I, 0, 1.08, 0, 0, 0, 0, 2.4, 0.08, L));
    for (const x of [-1.15, 1.15]) {
      b.add('solid', GEO.box, P.gold, T(I, x, 2.0, 0, 0, 0, 0, 0.08, 0.08, L));
      for (let z = -L / 2 + 0.3; z <= L / 2; z += 0.9) b.add('solid', GEO.cyl6, P.gold, T(I, x, 1.55, z, 0, 0, 0, 0.03, 0.9, 0.03));
      b.add('solid', GEO.box, P.sageDark, T(I, x, 1.3, 0, 0, 0, 0, 0.3, 0.4, L * 0.5));
      b.add('swaySoft', GEO.sphereLo, P.pink, T(I, x, 1.55, 0, 0, 0, 0, 0.25, 0.2, L * 0.24));
    }
    b.add('solid', GEO.box, P.gold, T(I, 0, 2.0, -L / 2, 0, 0, 0, 2.3, 0.08, 0.08));
    for (const x of [-1.1, 1.1]) for (const z of [L / 2 - 0.3, L / 2 - 3.0])
      b.add('solid', GEO.cyl8, P.gold, T(I, x, 2.4, z, 0, 0, 0, 0.07, 2.6, 0.07));
    b.add('solid', GEO.box, P.coralSoft, T(I, 0, 3.75, L / 2 - 1.65, 0, 0, 0, 2.7, 0.15, 3.4));
    b.add('solid', GEO.box, P.cream, T(I, 0, 3.62, L / 2 - 1.65, 0, 0, 0, 2.8, 0.08, 3.5));
    b.add('glow', GEO.sphereLo, P.glowWarm, T(I, 0, 3.4, L / 2 - 1.65, 0, 0, 0, 0.22));
  }
  const g = new THREE.Group(); b.build().forEach((m) => g.add(m));
  return g;
}

function wheelSet(group, L) {
  const wheels = [];
  const geo = new THREE.CylinderGeometry(0.42, 0.42, 0.16, 14); geo.rotateZ(Math.PI / 2);
  const mat = wc({ color: P.sageDeep }), hub = wc({ color: P.gold });
  const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.2, 8); hubGeo.rotateZ(Math.PI / 2);
  for (const z of [L / 2 - 1.3, L / 2 - 2.3, -L / 2 + 1.3, -L / 2 + 2.3])
    for (const x of [-0.75, 0.75]) {
      const w = new THREE.Mesh(geo, mat); w.position.set(x, 0.42, z);
      const h = new THREE.Mesh(hubGeo, hub); h.position.x = x > 0 ? 0.04 : -0.04;
      w.add(h); group.add(w); wheels.push(w);
    }
  return wheels;
}

export class Train {
  constructor(rail) {
    this.rail = rail;
    this.group = new THREE.Group(); this.group.name = 'train';
    this.cars = [];
    const loco = buildLoco();
    this.chimneyLocal = loco.chimney;
    this.cars.push(loco.g);
    this.cars.push(buildCar(false), buildCar(false), buildCar(true));
    this.wheels = [];
    this.cars.forEach((c, i) => { this.wheels.push(...wheelSet(c, CAR_LEN[i] - 0.4)); this.group.add(c); });
    this.offsets = [];
    let off = 0;
    CAR_LEN.forEach((l) => { this.offsets.push(off + l / 2); off += l + GAP; });
    this.totalLen = off;

    this.stationIdx = 0;
    this.s = this.stopS(0);
    this.speed = 0;
    this.state = 'idle';
    this.riding = false;
    this.dwell = 0;
    this.targetIdx = 1;
    this.destination = null;
    this.vmax = 24;
    this.accel = 1.6;
    this.decel = 1.5;
    this.smokeT = 0;
    this.events = [];
    this._f = {}; this._f2 = {};
    this.place();
  }

  // 停靠时车头所在弧长：让观景车停在站台中央
  stopS(i) { return this.rail.stations[i].s + this.offsets[3] + 2; }

  get station() { return this.rail.stations[this.stationIdx]; }
  get nextStation() { return this.rail.stations[this.targetIdx]; }
  get stopped() { return this.state === 'idle' || this.state === 'dwell'; }

  labelFor(st) {
    if (this.riding) return null;
    if (this.stopped && this.stationIdx === st.index) return '按 <b>E</b> 乘坐云轨列车';
    if (this.state === 'arriving' && this.targetIdx === st.index) return '列车正在进站……';
    return '按 <b>E</b> 呼叫云轨列车';
  }

  interact(st) {
    if (this.riding) return;
    if (this.stopped && this.stationIdx === st.index) { this.events.push({ type: 'board' }); return; }
    if (this.state === 'arriving') return;
    // 呼叫：列车从站外缓缓驶入
    this.s = this.stopS(st.index) - 280;
    this.speed = 15;
    this.targetIdx = st.index;
    this.state = 'arriving';
    this.events.push({ type: 'toast', text: `云轨列车正驶向 ${st.name}` });
  }

  /** 行驶中请求在下一站停靠（取消更远的目的站） */
  requestNextStop() { if (this.state === 'running') this.destination = null; }
  openDoors(open) { this.doorsOpen = open; }
  seatPosition(out) { return this.deckPosition(out); }

  board() {
    this.riding = true;
    this.state = 'dwell';
    this.dwell = 4;
    this.destination = null;
  }
  alight() {
    this.riding = false;
    this.state = 'idle';
    this.speed = 0;
  }
  setDestination(i) {
    if (!this.riding || i === this.stationIdx && this.stopped) return;
    this.destination = i;
    if (this.state === 'running') this.targetIdx = i;
    this.events.push({ type: 'toast', text: `目的站已设为 ${this.rail.stations[i].name}` });
  }
  departNow() { if (this.state === 'dwell') this.dwell = 0; }

  distAhead(target) {
    const L = this.rail.length;
    return ((target - this.s) % L + L) % L;
  }

  update(dt, puffs) {
    const L = this.rail.length;
    if (this.state === 'dwell') {
      this.dwell -= dt;
      if (this.dwell <= 0) {
        this.state = 'running';
        this.targetIdx = this.destination ?? (this.stationIdx + 1) % this.rail.stations.length;
        if (this.targetIdx === this.stationIdx) this.targetIdx = (this.stationIdx + 1) % this.rail.stations.length;
        this.announced = false;
        this.events.push({ type: 'depart' });
      }
    } else if (this.state === 'running' || this.state === 'arriving') {
      const d = this.distAhead(this.stopS(this.targetIdx));
      const vT = Math.min(this.vmax, Math.sqrt(2 * this.decel * Math.max(d - 0.3, 0)) + 0.4);
      const dv = vT - this.speed;
      this.speed += Math.max(-this.decel * 2.2 * dt, Math.min(this.accel * dt, dv));
      const ds = Math.min(this.speed * dt, d);
      this.s = (this.s + ds) % L;
      if (this.riding && !this.announced && d < 420) {
        this.announced = true;
        this.events.push({ type: 'approach', station: this.rail.stations[this.targetIdx] });
      }
      if (d - ds < 0.05) {
        this.s = this.stopS(this.targetIdx);
        this.speed = 0;
        this.stationIdx = this.targetIdx;
        if (this.riding) {
          const isDest = this.destination === null || this.destination === this.stationIdx;
          this.state = 'dwell';
          this.dwell = isDest ? 12 : 6;
          if (this.destination === this.stationIdx) this.destination = null;
          this.events.push({ type: 'arrive', station: this.station });
        } else this.state = 'idle';
      }
    }
    this.place(dt);
    // 蒸汽
    this.smokeT -= dt;
    if (puffs && this.smokeT <= 0) {
      const moving = this.speed > 0.5;
      this.smokeT = moving ? Math.max(0.07, 0.35 - this.speed * 0.012) : 0.9;
      const p = this.chimneyLocal.clone().applyMatrix4(this.cars[0].matrixWorld);
      const back = this._f.tan.clone().multiplyScalar(-this.speed * 0.5);
      puffs.emit(p, back.add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 2.2, (Math.random() - 0.5) * 0.6)), moving ? 1.3 : 0.9, moving ? 3.2 : 2.4);
    }
  }

  place(dt = 0) {
    const f = this._f, f2 = this._f2;
    this.cars.forEach((car, i) => {
      const sMid = this.s - this.offsets[i];
      const half = CAR_LEN[i] / 2 - 1.5;
      this.rail.frameAt(sMid + half, f);
      const front = f.pos.clone();
      this.rail.frameAt(sMid - half, f2);
      car.position.copy(front).add(f2.pos).multiplyScalar(0.5);
      car.lookAt(front);
      car.updateMatrixWorld();
    });
    this.rail.frameAt(this.s - this.offsets[0], f);
    const spin = (this.speed * dt) / 0.42;
    for (const w of this.wheels) w.rotation.x += spin;
  }

  /** 观景车甲板上的乘客位置 */
  deckPosition(out) {
    const car = this.cars[3];
    return out.set(0, 1.12, -0.6).applyMatrix4(car.matrixWorld);
  }
  get heading() { const t = this._f.tan; return Math.atan2(t.x, t.z); }
  get tangent() { return this._f.tan; }
  get midPosition() { return this.cars[1].position; }
}
