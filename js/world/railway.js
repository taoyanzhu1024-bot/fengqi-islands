// ============================================================
// 云轨铁路：环线规划 → 金色悬浮轨道 → 车站 → 复古童话列车
// ============================================================
import * as THREE from 'three';
import { Batcher, GEO, M, T } from '../core/batcher.js';
import { wc, MATS, textTexture, RAIL, G } from '../core/materials.js';
import { BoxSurface } from '../core/physics.js';
import { PALETTE as P } from '../config.js';
import { lamp, bench, house } from './props.js';
import { Train } from './train.js';
export { Train };

const UP = new THREE.Vector3(0, 1, 0);
const STRAIGHT = 70;   // 站台直线段半长
const PLATFORM_TOP = 0.95;

export class Railway {
  /** 第一步：根据岛屿规划车站（必须在岛屿网格生成前调用，以便平整站台地形） */
  constructor(route) {
    this.route = route;
    this.mode = localStorage.getItem('fengqi.railMode') === 'classic' ? 'classic' : 'cloud';
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
    const ds = this.length / F;
    const frames = [];
    for (let i = 0; i < F; i++) frames.push(this.frameAt(i * ds, {}));
    this.samples = frames.map((f) => f.pos.clone());

    // 沿曲线扫掠截面；每个顶点记录弧长 aS 与所在截面中心 aC（供“逐段升起”shader 使用）
    const SEGF = 3;                       // 每段 3 个采样间隔
    const segLen = ds * SEGF;
    RAIL.uSeg.value = segLen;
    this.segLen = segLen;
    // 每段独立的扫掠网格（段与段之间不共享三角形 → 各段可单独升降，不会拉出连接面）
    // 顶点 aS 记录所在段的中心弧长，aC 记录截面中心
    const sweepGeo = (profile, closed = true, exact = false) => {
      const P2 = profile.length, pos = [], sArr = [], cArr = [], idx = [];
      const J = closed ? P2 : P2 - 1;
      const nSeg = Math.ceil(F / SEGF);
      for (let k = 0; k < nSeg; k++) {
        const sMid = k * segLen + segLen * 0.5;
        const base = pos.length / 3;
        const i0 = k * SEGF, i1 = Math.min((k + 1) * SEGF, F);
        for (let i = i0; i <= i1; i++) {
          const f = frames[i % F];
          for (const [x, y] of profile) {
            pos.push(f.pos.x + f.right.x * x + f.up.x * y, f.pos.y + f.right.y * x + f.up.y * y, f.pos.z + f.right.z * x + f.up.z * y);
            sArr.push(exact ? i * ds : sMid); cArr.push(f.pos.x, f.pos.y, f.pos.z);
          }
        }
        for (let r = 0; r < i1 - i0; r++) for (let j = 0; j < J; j++) {
          const a = base + r * P2 + j, b2 = base + r * P2 + ((j + 1) % P2), c = base + (r + 1) * P2 + j, d = base + (r + 1) * P2 + ((j + 1) % P2);
          idx.push(a, c, b2, b2, c, d);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aS', new THREE.Float32BufferAttribute(sArr, 1));
      g.setAttribute('aC', new THREE.Float32BufferAttribute(cArr, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    // shift：越大越晚成形 → 先支架、再枕木、最后轨条
    const sweep = (profile, color, shift) => {
      const m = new THREE.Mesh(sweepGeo(profile), wc({ color, flat: true, side: THREE.DoubleSide, grain: 0.6, rail: shift }));
      m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false;
      return m;
    };
    const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const grp = new THREE.Group(); grp.name = 'track';
    grp.add(sweep(rect(-0.82, -0.16, -0.66, 0), P.gold, 30));
    grp.add(sweep(rect(0.66, -0.16, 0.82, 0), P.gold, 30));
    grp.add(sweep([[-0.5, -0.42], [0.5, -0.42], [0.32, -0.9], [-0.32, -0.9]], P.cream, 0));
    grp.add(sweep(rect(-0.12, -1.05, 0.12, -0.88), P.goldLight, 0));

    // 枕木 + 装饰托架（实例化，逐实例记录弧长）；悬浮风灯始终可见，作为航线标记
    const dummy = new THREE.Object3D();
    const fr = {};
    const instanced = (geo, mat, n, spacing, place) => {
      const im = new THREE.InstancedMesh(geo, mat, n);
      const sAttr = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        this.frameAt(i * spacing, fr);
        place(fr);
        dummy.lookAt(dummy.position.clone().add(fr.tan));
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        sAttr[i] = i * spacing;
      }
      geo.setAttribute('aS', new THREE.InstancedBufferAttribute(sAttr, 1));
      im.frustumCulled = false;
      return im;
    };
    const sleeperN = Math.floor(this.length / 1.6);
    const sleepers = instanced(new THREE.BoxGeometry(2.3, 0.14, 0.34), wc({ color: 0xc9a27e, flat: true, rail: 15, inst: true }), sleeperN, 1.6,
      (f) => dummy.position.copy(f.pos).addScaledVector(f.up, -0.25));
    sleepers.receiveShadow = true;
    const arcN = Math.floor(this.length / 14);
    const arcGeo = new THREE.TorusGeometry(1.0, 0.07, 5, 16, Math.PI);
    arcGeo.rotateZ(Math.PI);
    const arcs = instanced(arcGeo, wc({ color: P.gold, grain: 0.4, rail: 0, inst: true }), arcN, 14,
      (f) => dummy.position.copy(f.pos).addScaledVector(f.up, -0.45));
    const lanterns = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: P.glowWarm }), arcN);
    for (let i = 0; i < arcN; i++) {
      this.frameAt(i * 14, fr);
      dummy.position.copy(fr.pos).addScaledVector(fr.up, -1.6);
      dummy.updateMatrix();
      lanterns.setMatrixAt(i, dummy.matrix);
    }
    grp.add(sleepers, arcs, lanterns);

    // 风之光带：列车前方淡金/青绿色的能量轨迹（加色混合，仅云轨模式）
    const ribbonGeo = sweepGeo([[-1.3, 0.35], [1.3, 0.35]], false, true);
    const side = new Float32Array(ribbonGeo.attributes.position.count);
    for (let i = 0; i < side.length; i++) side[i] = i % 2;
    ribbonGeo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    this.ribbonMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { ...RAIL, uTime: G.time, uActive: { value: 0 } },
      vertexShader: `attribute float aS; attribute float aSide; uniform float uRailS, uRailL; varying float vAhead; varying float vSide; varying float vS;
        void main(){ vAhead = mod(aS - uRailS + uRailL*4.0, uRailL); vSide = aSide; vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime, uActive, uRailMode, uNear, uFar; varying float vAhead; varying float vSide; varying float vS;
        void main(){
          float band = smoothstep(uNear * 0.4, uNear, vAhead) * (1.0 - smoothstep(uFar * 0.8, uFar * 1.35, vAhead));
          float edge = 1.0 - abs(vSide * 2.0 - 1.0);
          float flow = 0.55 + 0.45 * sin(vS * 0.35 - uTime * 9.0);
          vec3 col = mix(vec3(0.95, 0.82, 0.45), vec3(0.55, 0.95, 0.85), 0.5 + 0.5 * sin(vS * 0.05 + uTime));
          float a = band * pow(edge, 1.5) * flow * uActive * uRailMode * 0.55;
          if (a < 0.01) discard;
          gl_FragColor = vec4(col * a, a);
        }`,
    });
    const ribbon = new THREE.Mesh(ribbonGeo, this.ribbonMat);
    ribbon.frustumCulled = false; ribbon.renderOrder = 9;
    grp.add(ribbon);
    scene.add(grp);
    this.trackGroup = grp;
    RAIL.uRailL.value = this.length;
    for (let i = 0; i < 8; i++) RAIL.uSt.value[i] = this.stations[i % this.stations.length].s; // 空槽重复填充，避免误判
  }

  /** 每帧：同步云轨升起参数，并在成形区域喷出少量云雾 */
  update(dt, puffs, audio) {
    const tr = this.train;
    RAIL.uRailS.value = tr.s;
    RAIL.uTail.value = tr.totalLen;
    RAIL.uRailMode.value = this.mode === 'classic' ? 0 : 1;
    const moving = tr.speed > 1;
    this.ribbonMat.uniforms.uActive.value += ((moving ? 1 : 0) - this.ribbonMat.uniforms.uActive.value) * (1 - Math.exp(-2 * dt));
    if (this.mode === 'classic' || !moving) return;
    this._mistT = (this._mistT ?? 0) - dt;
    if (this._mistT <= 0 && puffs) {
      this._mistT = 0.12;
      const sAhead = tr.s + RAIL.uNear.value + Math.random() * 70;
      const near = this.stations.some((st) => Math.abs(((sAhead - st.s + this.length * 1.5) % this.length) - this.length * 0.5) < 160);
      if (!near) {
        const f = this.frameAt(sAhead, this._mf || (this._mf = {}));
        puffs.emit(f.pos.clone().addScaledVector(f.right, (Math.random() - 0.5) * 6).add(new THREE.Vector3(0, -6 - Math.random() * 6, 0)),
          new THREE.Vector3((Math.random() - 0.5) * 1.5, 4 + Math.random() * 3, (Math.random() - 0.5) * 1.5), 2.2, 2.6);
      }
    }
    this._formT = (this._formT ?? 0) - dt;
    if (this._formT <= 0) { this._formT = 2.2 + Math.random() * 1.5; audio?.sfx('railForm', { vol: 0.8 }); }
  }

  /** 与 shader 中 railReveal 相同的计算（用于测试：列车所在轨段必须已完全成形） */
  revealAt(s, shift = 30) {
    if (this.mode === 'classic') return 1;
    const L = this.length, sm = (x) => Math.min(1, Math.max(0, x));
    const ss = (a, b, x) => { const t = sm((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const sl = this.segLen;
    const seg = Math.floor((((s % this.length) + this.length) % this.length) / sl) * sl + sl / 2;
    const ahead = (((seg - RAIL.uRailS.value) % L) + L * 4) % L, behind = L - ahead;
    let stn = 0;
    for (const st of this.stations) { const d = Math.abs((((seg - st.s) % L) + L * 1.5) % L - L * 0.5); stn = Math.max(stn, 1 - ss(120, 160, d)); }
    const form = 1 - ss(RAIL.uNear.value, RAIL.uFar.value, ahead + shift);
    const keep = 1 - ss(RAIL.uTail.value + 140, RAIL.uTail.value + 260, behind);
    return Math.max(form, keep, stn);
  }

  setMode(m) { this.mode = m === 'classic' ? 'classic' : 'cloud'; localStorage.setItem('fengqi.railMode', this.mode); }

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

