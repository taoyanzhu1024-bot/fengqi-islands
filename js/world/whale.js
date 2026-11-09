// ============================================================
// 云鲸：在云海中游弋的巨大生物（程序化建模，非 GLB）
// 行为：巡游 cruise / 翻滚 roll / 跃出云海 breach / 下潜 dive / 伴游列车 escort
// - 黄昏更爱跃出云海；夜里身体两侧的光点会亮起
// - 玩家乘坐列车或飞艇行驶时，会不定期游到车窗一侧并排同行
// - 声音：低沉鲸歌（sfx 'whale'）与云浪声（sfx 'splash'），音量随距离衰减
// ============================================================
import * as THREE from 'three';
import { Batcher, GEO, T, blob } from '../core/batcher.js';
import { wc } from '../core/materials.js';
import { clamp, damp, smoothstep } from '../core/utils.js';
import { WORLD } from '../config.js';
import { Puffs } from './particles.js';

const SEA = WORLD.cloudSeaY;
const BODY_L = 56;            // 体长
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Vector3();

/** 鲸身轮廓（z: 头 +26 → 尾 -30） */
const R = (z) => {
  if (z > 14) return 7.4 * Math.sqrt(Math.max(0, 1 - Math.pow((z - 14) / 12.5, 2))) * 0.96 + 0.3;
  if (z > -12) return 7.4 - (14 - z) * (14 - z) * 0.0058;
  return Math.max(0.6, 3.5 - (-12 - z) * 0.17);
};
function lathe(z0, z1, n = 26) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const z = z0 + (z1 - z0) * (i / n); pts.push(new THREE.Vector2(i === n && z1 > 20 ? 0.01 : R(z), z)); }
  const g = new THREE.LatheGeometry(pts, 28);
  g.rotateX(Math.PI / 2);
  g.scale(1, 0.82, 1);          // 背腹略扁
  return g;
}

function buildWhale() {
  const root = new THREE.Group(); root.name = 'cloudWhale';
  const I = new THREE.Matrix4();
  const back = new THREE.Color(0xc9cbe4), side = new THREE.Color(0xeeeaf4), belly = new THREE.Color(0xfbf4e8), pleat = new THREE.Color(0xd8cdd6), c = new THREE.Color();
  const skin = (x, y, z) => {
    const r = Math.max(R(z) * 0.82, 0.01), k = clamp(y / r, -1, 1);
    c.copy(side).lerp(back, smoothstep(0.1, 0.9, k));
    if (k < -0.15) { c.copy(side).lerp(belly, smoothstep(-0.15, -0.6, k)); if (z > -2 && z < 22 && Math.abs(Math.sin(x * 1.6)) < 0.18) c.lerp(pleat, 0.7); }
    return c;
  };
  // 夜里以微弱自发光保持可辨（emissiveIntensity 随夜晚程度调节）
  const mat = wc({ vertexColors: true, grain: 0.5, emissive: 0x8f95c8, emissiveIntensity: 0, whale: 1 });
  const matD = wc({ vertexColors: true, grain: 0.5, side: THREE.DoubleSide, emissive: 0x8f95c8, emissiveIntensity: 0, whale: 1 });   // 镜像烘焙的鳍需要双面
  const mk = (b, m2 = mat) => { const g = new THREE.Group(); b.build({ solid: m2 }).forEach((m) => { m.castShadow = true; g.add(m); }); return g; };

  // 头与躯干
  const bb = new Batcher();
  bb.add('solid', lathe(-12, 26.2, 34), skin, I);
  for (const sx of [-1, 1]) {
    bb.add('solid', GEO.sphereLo, 0x3d3f5a, T(I, sx * 5.2, 0.6, 19.5, 0, 0, 0, 0.55, 0.5, 0.5));       // 眼睛
    bb.add('solid', GEO.sphereLo, 0xffffff, T(I, sx * 5.55, 0.85, 19.7, 0, 0, 0, 0.16));
    bb.add('solid', GEO.box, 0x9c98bb, T(I, sx * 4.4, -2.3, 18, 0, sx * 0.25, 0, 0.12, 0.12, 7.5));     // 嘴线
  }
  bb.add('solid', GEO.cyl8, 0x9c98bb, T(I, 0, 5.85, 15.5, 0, 0, 0, 0.45, 0.2, 0.3));                   // 喷气孔
  // 背上的小云团
  for (let i = 0; i < 7; i++) {
    const z = 12 - i * 3.6, y = R(z) * 0.82 - 0.4;
    bb.add('solid', blob(40 + i, 1, 0.3), 0xffffff, T(I, (i % 2 ? 1 : -1) * 1.2, y, z, 0, i, 0, 2.2 - i * 0.12, 1.3, 2.4));
  }
  const body = mk(bb); root.add(body);

  // 胸鳍
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0); finShape.quadraticCurveTo(5, 1.5, 11, -1.5); finShape.quadraticCurveTo(6, -3.5, 0, -3); finShape.lineTo(0, 0);
  const finG = new THREE.ExtrudeGeometry(finShape, { depth: 0.5, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.3, bevelSegments: 2, curveSegments: 8 });
  finG.rotateX(Math.PI / 2);   // 平放
  const fins = [];
  for (const sx of [-1, 1]) {
    const fb = new Batcher();
    fb.add('solid', finG, (x, y, z) => c.copy(side).lerp(belly, y < 0 ? 0.5 : 0), new THREE.Matrix4());
    const g = mk(fb);
    const p = new THREE.Group(); p.add(g);
    p.position.set(sx * 5.8, -3.0, 9.5);
    p.scale.x = sx;
    root.add(p); fins.push(p);
  }
  // 尾干 + 尾鳍（两段，可摆动）
  const tail = new THREE.Group(); tail.position.set(0, 0, -12); root.add(tail);
  const tb = new Batcher();
  tb.add('solid', lathe(-30, -11.6, 14), (x, y, z) => skin(x, y, z - 12), T(I, 0, 0, 12));
  tail.add(mk(tb));
  const fluke = new THREE.Group(); fluke.position.set(0, 0, -17.6); tail.add(fluke);
  const fs = new THREE.Shape();
  fs.moveTo(0, 1.2); fs.quadraticCurveTo(6, 1.5, 11, 5.5); fs.quadraticCurveTo(9, 0.5, 10.5, -2.5); fs.quadraticCurveTo(5, -1.5, 0, -1.6); fs.lineTo(0, 1.2);
  const flG = new THREE.ExtrudeGeometry(fs, { depth: 0.4, bevelEnabled: true, bevelSize: 0.2, bevelThickness: 0.2, bevelSegments: 1, curveSegments: 8 });
  flG.rotateX(-Math.PI / 2); flG.translate(0, -0.2, 0);   // 形状 y → -z：尾鳍尖向后掠
  const flb = new Batcher();
  for (const sx of [-1, 1]) flb.add('solid', flG, () => c.copy(side).lerp(back, 0.4), T(I, 0, 0, 0, 0, 0, 0, sx, 1, 1));
  fluke.add(mk(flb, matD));

  // 夜光点（两侧）
  const gb = new Batcher();
  for (let i = 0; i < 18; i++) {
    const z = 18 - i * 2.4, r = R(z) * 0.82;
    for (const sx of [-1, 1]) gb.add('glow', GEO.sphereLo, i % 3 ? 0xa8f2d6 : 0xc9d8ff, T(I, sx * R(z) * 0.93, -r * 0.25 + Math.sin(i) * 0.6, z, 0, 0, 0, 0.32));
  }
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
  const glow = new THREE.Group(); gb.build({ glow: glowMat }).forEach((m) => { m.castShadow = false; glow.add(m); }); root.add(glow);
  root.userData = { body, tail, fluke, fins, glowMat, skinMats: [mat, matD] };
  return root;
}

export class CloudWhale {
  constructor(scene) {
    this.group = buildWhale();
    scene.add(this.group);
    this.splash = new Puffs(70);
    this.splash.mesh.renderOrder = 6;
    scene.add(this.splash.mesh);
    this.pos = new THREE.Vector3(420, SEA + 4, 520);
    this.vel = new THREE.Vector3(10, 0, 0);
    this.yaw = Math.PI / 2; this.pitch = 0; this.roll = 0; this.rollExtra = 0;
    this.state = 'cruise'; this.stateT = 0; this.nextAct = 12;
    this.u = 0;                         // 巡游路线参数
    this.escortCD = 25; this.escortT = 0;
    this.swim = 0; this.amp = 0.5;
    this.events = [];
    this.songT = 8;
    this.seen = false;
    this.log = [];                      // 测试：行为记录
    this.stats = { breach: 0, roll: 0, dive: 0, escort: 0, song: 0, splash: 0 };
  }

  /** 巡游路线：环绕群岛的大圈（云海表面） */
  cruisePoint(u, out) {
    const a = u * Math.PI * 2;
    return out.set(200 + Math.cos(a) * 760 + Math.sin(a * 3) * 200, SEA + 3 + Math.sin(a * 5) * 2, 160 + Math.sin(a) * 700 + Math.cos(a * 2) * 160);
  }
  get cruiseLen() {
    if (!this._cl) { let L = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(); for (let i = 0; i < 400; i++) L += this.cruisePoint(i / 400, a).distanceTo(this.cruisePoint((i + 1) / 400, b)); this._cl = L; }
    return this._cl;
  }
  nearestU() {
    let best = 0, bd = 1e18;
    for (let i = 0; i < 240; i++) { const d = this.cruisePoint(i / 240, _q).distanceToSquared(this.pos); if (d < bd) { bd = d; best = i / 240; } }
    return best;
  }

  set(s) { this.state = s; this.stateT = 0; this.log.push(s); if (this.log.length > 40) this.log.shift(); }

  /** 每帧更新：ctx = { dt, t, camera, ride, dn, islands, audio } */
  update(dt, ctx) {
    const { t, camera, ride, dn, islands } = ctx;
    this.stateT += dt;
    const night = dn?.night ?? 0, dusk = dn?.dusk ?? 0;
    const vehicle = ride?.onTrain ? ride.train : null;
    const moving = vehicle && vehicle.state === 'running' && vehicle.speed > 6;
    this.escortCD -= dt;

    // —— 行为切换 ——
    if (this.state !== 'escort' && moving && this.escortCD <= 0 && this.state !== 'breach') { this.set('escort'); this.stats.escort++; this.joined = false; }
    if (this.state === 'escort' && (!moving || this.stateT > 75)) { this.set('cruise'); this.u = this.nearestU(); this.escortCD = 80; }
    if (this.state === 'cruise') {
      this.nextAct -= dt;
      if (this.nextAct <= 0) {
        const r = Math.random(), pb = 0.32 + dusk * 0.3;
        if (r < pb) { this.set('breach'); this.stats.breach++; this.b0 = this.pos.clone(); this.bDir = _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).clone(); this.splashed = 0; }
        else if (r < pb + 0.3) { this.set('roll'); this.stats.roll++; }
        else { this.set('dive'); this.stats.dive++; }
        this.nextAct = 16 + Math.random() * 18;
      }
    }

    // —— 目标速度 ——
    const want = _w;
    let vmax = 14;
    if (this.state === 'escort') {
      // 车窗一侧（局部 -X）偏前方，比车身低一些
      const side = _v.set(-1, 0, 0).transformDirection(vehicle.rideMatrix).setY(0).normalize();
      const tan = vehicle.moveTangent ?? vehicle.tangent;
      const tgt = _q.copy(vehicle.focusPos).addScaledVector(side, vehicle.isAirship ? 90 : 78).addScaledVector(tan, 14);
      tgt.y += vehicle.isAirship ? -30 : -16;
      // 避开岛屿下方的倒锥形岩体：改从岛底下穿过
      for (const isl of islands) {
        const d = Math.hypot(tgt.x - isl.center.x, tgt.z - isl.center.z);
        if (d < isl.R * 1.3 + 25 && tgt.y > isl.center.y - isl.depth * (1 - d / (isl.R * 1.6)) - 25) tgt.y = Math.min(tgt.y, isl.center.y - isl.depth - 35);
      }
      tgt.y = Math.max(tgt.y, SEA - 10);
      if (this.stateT < 0.01 && this.pos.distanceTo(tgt) > 400) {
        // 太远时从车后方的云海下浮上来追赶（玩家看不到瞬移）
        this.pos.copy(tgt).addScaledVector(tan, -230); this.pos.y = Math.min(tgt.y, SEA - 30);
        this.vel.copy(tan).multiplyScalar(vehicle.speed);
      }
      const gap = this.pos.distanceTo(tgt);
      if (!this.joined && gap < 60) { this.joined = true; this.events.push({ type: 'toast', text: '一头云鲸游到了窗边，与你并肩前行' }); this.events.push({ type: 'sfx', name: 'whale', vol: 1 }); }
      want.copy(tan).multiplyScalar(vehicle.speed).addScaledVector(tgt.sub(this.pos), 0.35);
      vmax = 42;
    } else if (this.state === 'breach') {
      // 跃出云海：沿当前方向前进，高度按抛物线
      const k = this.stateT / 7.5;
      const h = Math.sin(clamp(k, 0, 1) * Math.PI);
      const y = SEA - 14 + h * 92;
      want.copy(this.bDir).multiplyScalar(17);
      want.y = (y - this.pos.y) * 3;
      vmax = 60;
      if (k > 0.06 && this.splashed === 0) { this.splashed = 1; this.burst(this.pos, 1); }
      if (k > 0.9 && this.splashed === 1) { this.splashed = 2; this.burst(this.pos, 1.2); }
      if (k >= 1.05) { this.set('cruise'); this.u = this.nearestU(); }
    } else {
      this.u = (this.u + (12 / this.cruiseLen) * dt) % 1;
      const tgt = this.cruisePoint((this.u + 0.012) % 1, _q);
      if (this.state === 'dive') { tgt.y = this.stateT < 10 ? SEA - 60 : SEA + 3; if (this.stateT > 18) { this.set('cruise'); this.spout(); } }
      // 巡游目标沿路线移动；鲸鱼落后时加速追赶
      const dyT = tgt.y - this.pos.y;
      want.copy(tgt.sub(this.pos)).setY(0).multiplyScalar(0.12);
      if (want.length() < 9) want.setLength(9);
      want.y = clamp(dyT * 0.45, -8, 8);           // 尽快回到云海表面
      vmax = this.state === 'dive' ? 16 : 22;
    }
    if (want.length() > vmax) want.setLength(vmax);
    this.vel.lerp(want, 1 - Math.exp(-(this.state === 'breach' ? 3 : 0.8) * dt));
    this.pos.addScaledVector(this.vel, dt);

    // —— 姿态 ——
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.5) {
      let dy = Math.atan2(this.vel.x, this.vel.z) - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += clamp(dy, -0.5 * dt, 0.5 * dt);
      this.turn = damp(this.turn ?? 0, dy, 2, dt);
    }
    this.pitch = damp(this.pitch, clamp(-Math.atan2(this.vel.y, Math.max(hs, 1)), -0.75, 0.75), 3, dt);
    if (this.state === 'roll') {
      const k = clamp(this.stateT / 6, 0, 1);
      this.rollExtra = (k * k * (3 - 2 * k)) * Math.PI * 2;
      if (k >= 1) { this.rollExtra = 0; this.set('cruise'); }
    }
    this.roll = damp(this.roll, clamp(-(this.turn ?? 0) * 0.8, -0.35, 0.35), 1.5, dt);
    const g = this.group, U = g.userData;
    g.position.copy(this.pos);
    g.rotation.set(this.pitch, this.yaw, this.roll + this.rollExtra + Math.sin(t * 0.4) * 0.04, 'YXZ');

    // —— 游动动画：尾干与尾鳍上下摆动，胸鳍缓慢划水 ——
    const sp = this.vel.length();
    this.amp = damp(this.amp, clamp(0.35 + sp / 30, 0.35, 1.2), 1, dt);
    this.swim += dt * (0.9 + sp * 0.045);
    U.tail.rotation.x = Math.sin(this.swim) * 0.13 * this.amp;
    U.fluke.rotation.x = Math.sin(this.swim - 0.9) * 0.32 * this.amp;
    U.body.rotation.x = Math.sin(this.swim + 1.2) * 0.02 * this.amp;
    // fins[0] 为左侧（scale.x = -1 镜像）：下垂并向后掠
    U.fins.forEach((f, i) => { f.rotation.z = (i ? -1 : 1) * (0.25 + Math.sin(this.swim * 0.6 + i) * 0.18); f.rotation.y = (i ? 1 : -1) * 0.35; });
    U.glowMat.opacity = damp(U.glowMat.opacity, night * 0.85, 1, dt);
    for (const m of U.skinMats) m.emissiveIntensity = U.glowMat.opacity * 0.42;

    // —— 云浪：贴着云海表面游时尾部带起云雾 ——
    this._wakeT = (this._wakeT ?? 0) - dt;
    if (this._wakeT <= 0 && Math.abs(this.pos.y - SEA) < 12 && sp > 4) {
      this._wakeT = 0.35;
      const tailP = _v.set(0, 0, -26).applyMatrix4(g.matrixWorld);
      tailP.y = SEA + 2;
      this.splash.emit(tailP, _w.set((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3), 5 + Math.random() * 3, 3.5);
    }
    this.splash.update(dt);

    // —— 声音 ——
    const dist = camera.position.distanceTo(this.pos);
    this.songT -= dt;
    if (this.songT <= 0) {
      this.songT = 22 + Math.random() * 20;
      if (dist < 1400) { this.events.push({ type: 'sfx', name: 'whale', vol: clamp(1 - dist / 1500, 0.15, 1) }); this.stats.song++; }
    }
    if (!this.seen && dist < 520) { this.seen = true; this.events.push({ type: 'toast', text: '云海里有什么在游动……是云鲸！' }); }
    this.dist = dist;
  }

  /** 跃出 / 落回云海时的大片云浪 */
  burst(p, k = 1) {
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      this.splash.emit(_v.set(p.x + Math.cos(a) * 9, SEA + 2, p.z + Math.sin(a) * 9), _w.set(Math.cos(a) * 9 * k, 6 + Math.random() * 10, Math.sin(a) * 9 * k), 9 + Math.random() * 6, 4.5);
    }
    this.stats.splash++;
    this.events.push({ type: 'sfx', name: 'splash', vol: 1, at: p.clone() });
  }
  /** 喷气：从喷气孔喷出的云柱 */
  spout() {
    const p = _v.set(0, 6, 15.5).applyMatrix4(this.group.matrixWorld);
    for (let i = 0; i < 8; i++) this.splash.emit(p, _w.set((Math.random() - 0.5) * 2, 14 + i * 2, (Math.random() - 0.5) * 2), 3 + i * 0.5, 3);
    this.events.push({ type: 'sfx', name: 'whale', vol: 0.6 });
  }
}
