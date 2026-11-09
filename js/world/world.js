// ============================================================
// World：组装整个《风栖群岛》世界
// 顺序：岛屿对象 → 铁路规划（平整站台）→ 主题布置准备 → 网格 → 道具 → 铁路 → 远景
// ============================================================
import * as THREE from 'three';
import { Batcher, GEO, T } from '../core/batcher.js';
import { BoxSurface } from '../core/physics.js';
import { mulberry32 } from '../core/noise.js';
import { ISLANDS, ISLETS, ROUTE, UPDRAFTS, PALETTE as P } from '../config.js';
import { Island } from './terrain.js';
import { Railway } from './railway.js';
import { Airway } from './airship.js';
import { CloudWhale } from './whale.js';
import { cloudRays, skyLanterns } from './skylife.js';
import { createSky, createCloudSea, CloudField, scatterClouds } from './sky.js';
import { distantIslets, skyCastle, birdFlocks } from './background.js';
import { Swarm, Puffs } from './particles.js';
import { mainTheme } from './islands/main.js';
import { flowerTheme } from './islands/flower.js';
import { portTheme } from './islands/port.js';
import { forestTheme } from './islands/forest.js';
import { lighthouseTheme } from './islands/lighthouse.js';
import { snowTheme } from './islands/snow.js';
import { isletTheme } from './islands/islet.js';
import { cityTheme } from './islands/city.js';

const THEMES = { main: mainTheme, flower: flowerTheme, port: portTheme, forest: forestTheme, lighthouse: lighthouseTheme, snow: snowTheme, islet: isletTheme, city: cityTheme };

class DiscSurface {
  constructor(x, z, r, top) { Object.assign(this, { x, z, r, top, thickness: 1 }); }
  contains2(x, z) { return Math.abs(x - this.x) < this.r && Math.abs(z - this.z) < this.r; }
  heightAt(x, z) { return Math.hypot(x - this.x, z - this.z) <= this.r ? this.top : null; }
}

export class World {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.anim = [];
    this.interact = [];
    this.swarms = [];
    this.updrafts = [];
    this.viewpoints = {};
  }

  /** 分步构建（每步之间让出一帧以刷新加载进度） */
  *build() {
    const { scene, physics } = this;
    this.skyMesh = createSky(); this.seaMesh = createCloudSea();
    scene.add(this.skyMesh, this.seaMesh);
    this.clouds = new CloudField();
    yield 0.05;

    this.islands = ISLANDS.map((c) => new Island(c, THEMES[c.theme]));
    this.islets = ISLETS.map((c) => new Island(c, THEMES[c.theme]));
    this.all = [...this.islands, ...this.islets];
    const byId = Object.fromEntries(this.all.map((i) => [i.id, i]));
    this.byId = byId;
    this.rail = new Railway(ROUTE.map((id) => byId[id]));
    // 天空支线：风栖主岛西站 ⇄ 艾瑟兰中央车站（往返线，不改动原有环线）
    const city = byId.city, main = byId.main;
    this.branch = new Railway([main, city], {
      name: 'branch', closed: false, cars: 2,
      stations: [
        { island: main, th: Math.PI, dirSign: 1, name: '风栖西站 · 天空支线' },
        { island: city, th: 1.31, dirSign: 1, name: '艾瑟兰中央车站' },
      ],
      waypoints: ([A, B]) => [
        A.pos.clone().addScaledVector(A.dir, -60), A.pos.clone(), A.pos.clone().addScaledVector(A.dir, 70),
        A.pos.clone().addScaledVector(A.dir, 170).add(new THREE.Vector3(-30, 10, 0)),
        new THREE.Vector3(-250, 70, -430), new THREE.Vector3(-70, 150, -760),
        B.pos.clone().addScaledVector(B.dir, -200).add(new THREE.Vector3(0, -2, 0)),
        B.pos.clone().addScaledVector(B.dir, -70), B.pos.clone(), B.pos.clone().addScaledVector(B.dir, 60),
      ],
    });
    this.rails = [this.rail, this.branch];
    for (const isl of this.all) isl.theme.prepare?.call(isl.theme, isl);
    yield 0.12;

    const ctx = this.makeCtx();
    let k = 0;
    for (const isl of this.all) {
      isl.buildMeshes({ palette: isl.theme.rockPalette, J: isl.cfg.meshJ ?? (isl.R < 30 ? 12 : 30), S: isl.cfg.meshS ?? (isl.R < 30 ? 56 : 120), K: isl.cfg.meshK });
      const b = new Batcher();
      isl.theme.populate?.call(isl.theme, isl, ctx, b);
      b.build().forEach((m) => isl.group.add(m));
      scene.add(isl.group);
      physics.addSurface(isl);
      // 岛屿四周漂浮的碎石
      this.floatingDebris(isl);
      yield 0.15 + (++k / this.all.length) * 0.5;
    }

    this.rail.build(scene, physics, this.interact);
    this.branch.build(scene, physics, this.interact);
    // 「风帆号」空中航线（闭合环线，飞艇始终向前飞行）：
    // 风栖主岛东北岸（起点）→ 艾瑟兰东北岸 → 云港岛西岸 → 回到主岛
    const port = byId.port, V = (x, y, z) => new THREE.Vector3(x, y, z);
    this.airway = new Airway([
      { island: main, plan: main.theme.airPlan, name: '风栖 · 风帆号空港', hint: V(-0.48, 0, -0.88) },
      { island: city, plan: city.theme.airPlan, name: '艾瑟兰空港', hint: V(-0.48, 0, -0.88) },
      { island: port, plan: port.theme.airPlan, name: '云港 · 风帆号空港', hint: V(0, 0, 1) },
    ], {
      waypoints: ([M, B, A]) => {
        const m = M.pos, tm = M.dir, a = A.pos, ta = A.dir, b = B.pos, tb = B.dir;
        const rb = V(-tb.z, 0, tb.x);                 // 艾瑟兰港航向的右侧
        return [
          // 主岛空港：从东南侧（云港方向）降落，向西北起飞并爬升，越过北侧小浮岛
          m.clone().addScaledVector(tm, -70).add(V(0, 14, 0)), m.clone().addScaledVector(tm, -35).add(V(0, 3, 0)),
          m.clone(), m.clone().addScaledVector(tm, 50).add(V(0, 4, 0)),
          m.clone().add(V(-62, 38, -112)), V(-60, 110, -420), V(60, 160, -760),
          b.clone().addScaledVector(tb, -270).add(V(0, -2, 0)),
          b.clone().addScaledVector(tb, -95), b.clone(), b.clone().addScaledVector(tb, 95),
          b.clone().addScaledVector(tb, 235).addScaledVector(rb, 70).add(V(0, 12, 0)),
          b.clone().addScaledVector(tb, 140).addScaledVector(rb, 250).add(V(0, 20, 0)),
          b.clone().addScaledVector(tb, -120).addScaledVector(rb, 380).add(V(0, 10, 0)),
          V(760, 110, -600), V(a.x, a.y + 55, -230),
          a.clone().addScaledVector(ta, -90), a.clone(), a.clone().addScaledVector(ta, 90),
          a.clone().add(V(-40, 14, 220)), a.clone().add(V(-210, 48, 250)),
          // 云港 → 主岛：在环线内侧高空飞行，越过“主岛—花海岛”线路后下降
          V(470, 110, -60), V(320, 105, -170), V(215, 72, -78),
        ];
      },
    }).build(scene, physics, this.interact);
    this.rails.push(this.airway);
    this.airship = this.airway.train;
    this.whale = new CloudWhale(scene);          // 云海里的大云鲸（会伴游列车 / 飞艇）
    // 风栖主岛附近：一对在岛屿之间高空巡游的云鲸母子（开局抬头就能看到）
    const mom = new CloudWhale(scene, { name: 'mother', high: true, escort: false, scale: 0.8, phase: 0.62, pitch: 1.15,
      loop: { cx: 0, cz: -40, rx: 300, rz: 260, y: 150, dy: 12, wob: 0.3 }, seenText: '一对云鲸母子正从岛屿之间游过' });
    const calf = new CloudWhale(scene, { name: 'calf', parent: mom, escort: false, scale: 0.38, pitch: 1.7, seenText: null });
    // 天空之城外围：绕着艾瑟兰缓缓游动的第三头云鲸
    const cityW = new CloudWhale(scene, { name: 'city', high: true, escort: false, scale: 0.9, phase: 0.2, pitch: 0.9,
      loop: { cx: -420, cz: -1250, rx: 520, rz: 470, y: 150, dy: 18, wob: 0.25 }, seenText: '一头云鲸在天空之城外围缓缓巡游' });
    this.whales = [this.whale, mom, calf, cityW];
    this.puffs = new Puffs(80);
    scene.add(this.puffs.mesh);
    yield 0.75;

    // 云：云海隆起、空中零散云、轨道下的托云、瀑布水雾
    scatterClouds(this.clouds, this.islands.map((i) => ({ x: i.center.x, y: i.center.y, z: i.center.z, r: i.R * 1.4 })));
    const fr = {};
    for (const rl of [this.rail, this.branch]) for (let s = 0; s < rl.length; s += 55) {
      rl.frameAt(s, fr);
      if (this.all.some((i) => Math.hypot(i.center.x - fr.pos.x, i.center.z - fr.pos.z) < i.R + 20)) continue;
      this.clouds.add(fr.pos.x, fr.pos.y - 5, fr.pos.z, 16 + Math.random() * 14, 0.85, 0.45);
    }
    for (const m of this.mists) this.clouds.add(m.p.x, m.p.y, m.p.z, m.s, 0.8, 0.6);
    scene.add(this.clouds.build());

    const avoid = this.all.map((i) => ({ x: i.center.x, y: i.center.y, z: i.center.z, r: i.R }));
    distantIslets(scene, avoid, this.rail.samples.concat(this.branch.samples, this.airway.samples));
    this.castle = byId.city.group;           // 天空之城现在是真实可到达的岛屿
    birdFlocks(scene, this.anim, [
      ...(this.extraFlocks ?? []),
      { c: [30, 28, 50], R: 55 }, { c: [-40, 34, -40], R: 70 },          // 出生点附近
      { c: [1000, 45, 160], R: 110 }, { c: [500, 25, 780], R: 150 },     // 云港、森林岛
      { c: [-420, 270, -1250], R: 210 }, { c: [-740, 160, -40], R: 90 }, // 天空之城、雪鸣岛
    ]);
    // 云鳐群：在主岛与花海岛之间、森林岛外侧、天空之城外围、灯塔岛与雪鸣岛之间滑翔
    this.rays = cloudRays(scene, this.anim, [
      { c: [200, 75, -150], R: 190, n: 5, scale: 1.7 },
      { c: [500, 40, 780], R: 260, n: 4, scale: 1.5, speed: 0.035 },
      { c: [-420, 260, -1250], R: 360, n: 6, scale: 1.9, speed: 0.03 },
      { c: [-600, 110, 330], R: 210, n: 4, scale: 1.4 },
    ]);
    // 天灯：黄昏和夜里从主岛、花海岛、天空之城升起
    this.lanterns = skyLanterns(scene, this.anim, [
      { c: [0, 6, 0], r: 55, n: 26 }, { c: [560, 34, -430], r: 70, n: 18 }, { c: [-420, 206, -1250], r: 170, n: 40 },
    ], () => this.dn);
    yield 0.9;

    // 上升气流
    for (const u of UPDRAFTS) {
      const s = new Swarm({
        count: 140, center: new THREE.Vector3(u.x, (u.y0 + u.y1) / 2, u.z), box: new THREE.Vector3(u.r * 2, u.y1 - u.y0, u.r * 2),
        vel: new THREE.Vector3(0, 7, 0), size: 0.35, colorA: 0xffffff, colorB: 0xf3ead2, shape: 1, jitter: 0.6, swirl: 0.9, opacity: 0.8, seed: 77,
      });
      scene.add(s.points);
      this.swarms.push(s);
      this.updrafts.push(u);
      // 气流底部和顶部的标记云
      this.clouds.add(u.x, u.y1 - 4, u.z, 14, 0.5, 0.4);
    }
    this.lods = [];
    scene.traverse((o) => { if (o.userData.lod) this.lods.push(o); });
    yield 1;
  }

  makeCtx() {
    const self = this;
    this.mists = [];
    return {
      world: this,
      scene: this.scene,
      anim: this.anim,
      at(isl, x, z, ry = 0, dy = 0) {
        const h = isl.localHeight(x, z) ?? 0;
        return T(new THREE.Matrix4(), x, h + dy, z, 0, ry, 0);
      },
      collide(isl, x, z, r, h = 10) {
        const y = (isl.localHeight(x, z) ?? 0) + isl.center.y;
        self.physics.addCircle(x + isl.center.x, z + isl.center.z, r, y - 2, y + h);
      },
      box(isl, x, z, hx, hz, ang, h = 8) {
        const y = (isl.localHeight(x, z) ?? 0) + isl.center.y;
        self.physics.addBox(x + isl.center.x, z + isl.center.z, hx, hz, ang, y - 2, y + h);
      },
      // 从 (x,z) 沿 θ 方向向外延伸的木平台
      platform(isl, x, z, th, len, wid) {
        const top = (isl.localHeight(x, z) ?? 0) + 0.05 + isl.center.y;
        const cx = x + Math.cos(th) * len / 2 + isl.center.x, cz = z + Math.sin(th) * len / 2 + isl.center.z;
        self.physics.addSurface(new BoxSurface(cx, cz, top, len / 2 + 0.3, wid / 2, th, 0.6));
      },
      disc(isl, x, z, r, dy) {
        const top = (isl.localHeight(x, z) ?? 0) + dy + isl.center.y;
        self.physics.addSurface(new DiscSurface(x + isl.center.x, z + isl.center.z, r, top));
      },
      viewpoint(isl, x, z, tour, label) {
        const pos = new THREE.Vector3(x, (isl.localHeight(x, z) ?? 0), z).add(isl.center);
        self.viewpoints[tour] = pos;
        self.interact.push({ pos, radius: 6, label: () => label, action: () => self.onViewpoint?.(tour), priority: 2 });
        // 地面上的金色标记环
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.06, 6, 32), new THREE.MeshBasicMaterial({ color: P.gold }));
        ring.rotation.x = Math.PI / 2; ring.position.copy(pos).y += 0.25;
        self.scene.add(ring);
        self.anim.push((dt, t) => { ring.scale.setScalar(1 + Math.sin(t * 2) * 0.08); });
      },
      glideDeck(isl, x, z, th, name = '乘风台') {
        const pos = new THREE.Vector3(x, (isl.localHeight(x, z) ?? 0) + 1.2, z).add(isl.center);
        (self.glideDecks ||= []).push({ pos, th, name });
        self.glideDeckPos ??= pos;
        self.interact.push({ pos, radius: 5, label: () => `按 <b>E</b> 乘风起跳 · ${name}`, action: () => self.onGlideDeck?.(pos, th), priority: 2 });
      },
      mist(p, s) { self.mists.push({ p, s }); },
      // 沿小径铺石板
      stones(isl, b) {
        const r = mulberry32(isl.cfg.seed + 5);
        for (const p of isl.paths) {
          for (let i = 0; i < p.pts.length; i++) {
            if (r() < 0.25) continue;
            const [x, z] = p.pts[i];
            const ox = (r() - 0.5) * p.w * 0.9, oz = (r() - 0.5) * p.w * 0.9;
            const h = isl.localHeight(x + ox, z + oz);
            if (h === null) continue;
            const s = 0.35 + r() * 0.3;
            b.add('flat', GEO.cyl6, r() < 0.5 ? P.stone : 0xe1d6c0, T(new THREE.Matrix4(), x + ox, h + 0.03, z + oz, 0, r() * 3, 0, s * 1.4, 0.1, s));
          }
        }
      },
    };
  }

  floatingDebris(isl) {
    const r = mulberry32(isl.cfg.seed + 33);
    const n = isl.R < 30 ? 2 : 6;
    const b = new Batcher();
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = isl.R * (1.1 + r() * 0.5);
      const s = 1 + r() * isl.R * 0.05;
      b.add('flat', GEO.ico, [P.rose, P.rockBlue, P.soil][i % 3], T(new THREE.Matrix4(), Math.cos(a) * d, -10 - r() * 40, Math.sin(a) * d, r() * 3, r() * 3, 0, s, s * 1.6, s));
    }
    const meshes = b.build();
    const g = new THREE.Group();
    meshes.forEach((m) => { m.castShadow = false; g.add(m); });
    isl.group.add(g);
    const ph = r() * 6;
    this.anim.push((dt, t) => { g.position.y = Math.sin(t * 0.4 + ph) * 1.2; g.rotation.y = t * 0.01; });
  }

  /** 玩家当前所在区域 */
  regionAt(p) {
    let best = null, bd = 1e9;
    for (const isl of this.all) {
      const d = Math.hypot(p.x - isl.center.x, p.z - isl.center.z);
      if (d < isl.R * 1.35 + 10 && Math.abs(p.y - isl.center.y) < 120 && d / isl.R < bd) { bd = d / isl.R; best = isl; }
    }
    return best;
  }

  nearestStation(p) {
    let best = null, bd = 1e9;
    for (const rl of this.rails) for (const st of rl.stations) { const d = st.platformCenter.distanceTo(p); if (d < bd) { bd = d; best = st; } }
    return best;
  }

  update(dt, t, camera, extra = {}) {
    this.camera = camera;
    for (const f of this.anim) f(dt, t);
    for (const rl of this.rails) rl.update(dt, this.puffs, extra.audio);
    for (const w of this.whales ?? []) w.update(dt, { t, camera, ride: extra.ride, dn: this.dn, islands: this.all });
    this.clouds.update(dt, camera);
    // 植被按距离显隐（远处草叶小于一个像素，没必要绘制）
    for (const o of this.lods) o.visible = o.userData.lod.c.distanceTo(camera.position) < o.userData.lod.d;
    this.puffs.update(dt);
  }
}
