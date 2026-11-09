// ============================================================
// 天空之城居民：实例化渲染（身体 3 种服装 + 腿），整群只需少量 draw call
// 行为：沿街道/广场/花园路线散步，有的在长椅坐下、在店铺前驻足；夜晚部分居民回家
// ============================================================
import * as THREE from 'three';
import { Batcher, GEO, T } from '../../core/batcher.js';
import { wc } from '../../core/materials.js';
import { mulberry32 } from '../../core/noise.js';

const OUTFITS = [
  { coat: 0x8fae8a, shirt: 0xf6efe0, hat: 0xe8cf8a, hair: 0x7a5640 },
  { coat: 0xe39a86, shirt: 0xf3e6cf, hat: 0x94adc6, hair: 0x3f3440 },
  { coat: 0x94adc6, shirt: 0xf8f1e4, hat: 0xd9a65a, hair: 0xb07a50 },
  { coat: 0xd6aa55, shirt: 0xf6eedd, hat: 0x8fae8a, hair: 0x5a3e30 },
];

function bodyGeo(o, variant) {
  const b = new Batcher(), I = new THREE.Matrix4();
  const skin = 0xf1d2bc;
  b.add('solid', GEO.taper8, o.coat, T(I, 0, 0.92, 0, Math.PI, 0, 0, 0.3, 0.75, 0.26));       // 外套/长裙
  b.add('solid', GEO.cyl8, o.shirt, T(I, 0, 1.25, 0, 0, 0, 0, 0.19, 0.18, 0.17));
  b.add('solid', GEO.box, 0x8a6a50, T(I, 0, 0.92, 0, 0, 0, 0, 0.42, 0.06, 0.36));             // 腰带
  for (const sx of [-1, 1]) {
    b.add('solid', GEO.cyl6, o.coat, T(I, sx * 0.25, 1.05, 0, 0, 0, sx * 0.15, 0.06, 0.5, 0.06));
    b.add('solid', GEO.sphereLo, skin, T(I, sx * 0.29, 0.78, 0, 0, 0, 0, 0.065));
  }
  b.add('solid', GEO.sphere, skin, T(I, 0, 1.55, 0, 0, 0, 0, 0.2, 0.21, 0.2));
  b.add('solid', GEO.sphereLo, o.hair, T(I, 0, 1.6, -0.04, 0, 0, 0, 0.21, 0.19, 0.2));
  for (const sx of [-1, 1]) b.add('solid', GEO.sphereLo, 0x3b3440, T(I, sx * 0.07, 1.56, 0.18, 0, 0, 0, 0.025));
  if (variant % 2 === 0) {      // 宽檐帽
    b.add('solid', GEO.cyl16, o.hat, T(I, 0, 1.73, 0, 0, 0, 0, 0.36, 0.03, 0.36));
    b.add('solid', GEO.cyl12, o.hat, T(I, 0, 1.8, 0, 0, 0, 0, 0.17, 0.14, 0.17));
  } else {                      // 贝雷帽 + 围巾
    b.add('solid', GEO.sphereLo, o.hat, T(I, 0.03, 1.74, 0, 0, 0, 0.2, 0.22, 0.08, 0.22));
    b.add('solid', GEO.torus, 0xf6e1a8, T(I, 0, 1.36, 0, Math.PI / 2, 0, 0, 0.15, 0.15, 1.6));
  }
  if (variant === 2) b.add('solid', GEO.box, 0xc59a6d, T(I, 0.3, 0.85, 0.05, 0, 0, 0, 0.12, 0.28, 0.32)); // 手提篮
  const m = b.build()[0];
  return m.geometry;
}

export class Residents {
  /**
   * @param routes 路线数组，每条为世界坐标点列 [Vector3...]（闭合）
   * @param heightAt (x,z)=>y 地面高度
   * @param seats 长椅等可坐下的位置 [{pos, heading}]
   */
  constructor(scene, routes, heightAt, opts = {}) {
    const r = mulberry32(opts.seed ?? 4242);
    this.heightAt = heightAt;
    this.n = opts.count ?? 36;
    this.people = [];
    const mat = wc({ vertexColors: true, grain: 0.5 });
    this.bodies = OUTFITS.map((o, i) => {
      const im = new THREE.InstancedMesh(bodyGeo(o, i), mat, this.n);
      im.count = 0; im.castShadow = true; im.frustumCulled = false;
      scene.add(im);
      return im;
    });
    this.legs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.065, 0.6, 6).translate(0, -0.3, 0), wc({ color: 0x8a7464 }), this.n * 2);
    this.legs.castShadow = true; this.legs.frustumCulled = false;
    scene.add(this.legs);
    // 预处理路线：累计长度
    this.routes = routes.map((pts) => {
      const acc = [0];
      for (let i = 1; i <= pts.length; i++) acc.push(acc[i - 1] + pts[i - 1].distanceTo(pts[i % pts.length]));
      return { pts, acc, len: acc[acc.length - 1] };
    });
    for (let i = 0; i < this.n; i++) {
      const route = this.routes[i % this.routes.length];
      this.people.push({
        outfit: i % OUTFITS.length, route, s: r() * route.len, speed: 0.9 + r() * 0.6, dir: r() < 0.5 ? 1 : -1,
        lane: (r() - 0.5) * 2.2, phase: r() * 6, pause: 0, nextPause: 8 + r() * 30, homebody: r() < 0.4,
        pos: new THREE.Vector3(), heading: 0, visible: true,
      });
    }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
    this.active = true;
  }

  sample(route, s, lane, out) {
    s = ((s % route.len) + route.len) % route.len;
    let i = 0;
    while (i < route.acc.length - 2 && route.acc[i + 1] < s) i++;
    const a = route.pts[i], b = route.pts[(i + 1) % route.pts.length];
    const t = (s - route.acc[i]) / (route.acc[i + 1] - route.acc[i] || 1);
    out.lerpVectors(a, b, t);
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    out.x += (-dz / l) * lane; out.z += (dx / l) * lane;
    return Math.atan2(dx, dz);
  }

  update(dt, t, night, camPos) {
    // 远离城市时不更新（只在玩家附近需要动画）
    const far = camPos.distanceTo(this.people[0].pos) > 900;
    if (far && this._updated) return;
    this._updated = true;
    const counts = [0, 0, 0, 0];
    let li = 0;
    for (const p of this.people) {
      // 夜深时，一部分居民回家
      if (p.homebody && night > 0.7) continue;
      if (p.pause > 0) p.pause -= dt;
      else {
        p.s += p.speed * p.dir * dt;
        p.nextPause -= dt;
        if (p.nextPause <= 0) { p.pause = 3 + Math.random() * 6; p.nextPause = 12 + Math.random() * 30; }
      }
      const h = this.sample(p.route, p.s, p.lane, p.pos);
      p.heading = p.dir > 0 ? h : h + Math.PI;
      p.pos.y = this.heightAt(p.pos.x, p.pos.z);
      const moving = p.pause <= 0;
      const ph = t * 6.2 * p.speed + p.phase;
      const bob = moving ? Math.abs(Math.sin(ph)) * 0.05 : Math.sin(t * 1.5 + p.phase) * 0.01;
      const look = moving ? 0 : Math.sin(t * 0.5 + p.phase) * 0.6;
      this._q.setFromEuler(this._e.set(0, p.heading + look * 0.3, moving ? 0 : Math.sin(t + p.phase) * 0.03));
      this._v.set(p.pos.x, p.pos.y + bob, p.pos.z);
      this._m.compose(this._v, this._q, this._s);
      this.bodies[p.outfit].setMatrixAt(counts[p.outfit]++, this._m);
      // 腿
      const sw = moving ? Math.sin(ph) * 0.55 : 0;
      for (const side of [-1, 1]) {
        const lx = Math.cos(p.heading) * side * 0.11, lz = -Math.sin(p.heading) * side * 0.11;
        this._q.setFromEuler(this._e.set(sw * side, p.heading, 0, 'YXZ'));
        this._v.set(p.pos.x + lx, p.pos.y + 0.62 + bob, p.pos.z + lz);
        this._m.compose(this._v, this._q, this._s);
        this.legs.setMatrixAt(li++, this._m);
      }
    }
    this.bodies.forEach((b, i) => { b.count = counts[i]; b.instanceMatrix.needsUpdate = true; });
    this.legs.count = li; this.legs.instanceMatrix.needsUpdate = true;
  }

  /** 测试用：活动居民数量与是否在移动 */
  stats() { return { visible: this.bodies.reduce((a, b) => a + b.count, 0), moving: this.people.filter((p) => p.pause <= 0).length }; }
}
