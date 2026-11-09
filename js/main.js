// ============================================================
// 《风栖群岛》入口：渲染器、灯光、世界构建、游戏循环与交互逻辑
// ============================================================
import * as THREE from 'three';
import { G } from './core/materials.js';
import { Physics } from './core/physics.js';
import { Input } from './core/input.js';
import { damp } from './core/utils.js';
import { PALETTE as P, WORLD, CASTLE } from './config.js';
import { World } from './world/world.js';
import { Swarm } from './world/particles.js';
import { Player } from './player/player.js';
import { CameraRig, tours } from './camera/rig.js';
import { WatercolorPost } from './post/watercolor.js';
import { HUD } from './ui/hud.js';

const showError = (e) => {
  const el = document.getElementById('error');
  el.style.display = 'block';
  el.textContent = '加载出错：' + (e?.stack || e);
  console.error(e);
};
addEventListener('error', (e) => showError(e.error || e.message));

async function boot() {
  // ---------------- 渲染器 ----------------
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(P.fog, WORLD.fogNear, WORLD.fogFar);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.3, 12000);
  camera.position.set(500, 420, 900);

  // ---------------- 灯光：午后暖阳 ----------------
  const sunDir = G.sunDir.value;
  const hemi = new THREE.HemisphereLight(0xcfe0f2, 0xcbb89c, 1.25);
  const sun = new THREE.DirectionalLight(0xffecd0, 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 10; sc.far = 600;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
  scene.add(hemi, sun, sun.target);

  const post = new WatercolorPost(renderer);
  const physics = new Physics();
  const input = new Input();
  const world = new World(scene, physics);
  const hud = new HUD(world);

  // ---------------- 分步构建世界 ----------------
  const gen = world.build();
  for (let r = gen.next(); !r.done; r = gen.next()) {
    hud.progress(r.value);
    await new Promise((res) => requestAnimationFrame(res));
  }

  // ---------------- 玩家 ----------------
  const player = new Player(physics);
  player.updrafts = world.updrafts;
  scene.add(player.object);
  const main = world.byId.main;
  const spawn = new THREE.Vector3(14, 0, 30).add(main.center);
  spawn.y = physics.groundAt(spawn.x, spawn.z, 200, 0);
  player.teleport(spawn, Math.PI * 0.9);

  // 跟随玩家的环境飘落物（随区域改变颜色与形态）
  const ambient = new Swarm({ count: 380, box: new THREE.Vector3(70, 34, 70), vel: new THREE.Vector3(1.3, -0.6, 0.5), size: 0.24, jitter: 1.4, seed: 1 });
  scene.add(ambient.points);
  const AMB = {
    main: { a: 0xfff1d8, b: 0xe9c565, shape: 0, op: 0.8 }, flower: { a: 0xf3b6c4, b: 0xffeef2, shape: 0, op: 1 },
    forest: { a: 0xd8ffb0, b: 0xbaf0d8, shape: 1, op: 0.5 }, snow: { a: 0xffffff, b: 0xe8eeff, shape: 1, op: 1 },
    port: { a: 0xfff6e6, b: 0xf6e6c8, shape: 1, op: 0.5 }, lighthouse: { a: 0xffffff, b: 0xf3efe6, shape: 1, op: 0.55 },
    sky: { a: 0xffffff, b: 0xf6f0e6, shape: 1, op: 0.45 },
  };
  const TINT = { snow: [0.93, 0.97, 1.07], forest: [0.96, 1.02, 0.99], flower: [1.03, 0.99, 0.99], lighthouse: [0.98, 1.0, 1.02] };

  const rig = new CameraRig(camera, canvas, physics);
  const TOURS = tours(world);
  const train = world.rail.train;
  const stations = world.rail.stations;

  // ---------------- 交互 ----------------
  const fadeTeleport = (fn) => {
    player.state = 'locked';
    hud.fade(true);
    setTimeout(() => { fn(); rig.snap = true; hud.fade(false); }, 650);
  };
  const startTour = (name, done) => {
    const prev = player.state;
    if (prev !== 'train') player.state = 'locked';
    rig.prevMode = rig.mode === 'train' ? 'train' : 'follow';
    hud.cinematic(true);
    rig.play(TOURS[name], (sh) => hud.caption(sh.title, sh.sub), () => {
      hud.cinematic(false);
      if (player.state === 'locked') player.state = 'walk';
      done?.();
    });
  };
  world.onViewpoint = (tour) => startTour(tour);
  world.onGlideDeck = (pos, th) => {
    player.pos.copy(pos);
    player.launchGlide(new THREE.Vector3(Math.cos(th), 0, Math.sin(th)));
    hud.toast('乘风而行 · A/D 转向，W 加速，进入白色气流可上升', 4);
  };
  const board = () => {
    train.board();
    player.state = 'train';
    rig.mode = 'train'; rig.trainYaw = 0; rig.snap = true;
    hud.toast(`欢迎乘坐云轨列车 · ${train.station.name} 发车`);
  };
  const alight = () => {
    const st = train.station;
    train.alight();
    rig.mode = 'follow'; rig.snap = true;
    player.teleport(st.boardPoint.clone(), Math.atan2(-st.perp.x, -st.perp.z));
    rig.yaw = player.heading + Math.PI;
    hud.toast(`${st.island.name} · ${st.island.cfg.sub}`);
  };

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    post.setSize();
    ambient.resize(); world.swarms.forEach((s) => s.resize());
  });

  hud.ready();
  // 开场镜头：俯瞰群岛后落到主角身后
  rig.yaw = player.heading + Math.PI;
  startTour('intro', () => hud.toast('沿着石板路走到南边的风栖站，乘上云轨列车吧', 5));

  // ---------------- 主循环 ----------------
  const clock = new THREE.Clock();
  const events = [];
  let t = 0, tintAmt = new THREE.Vector3(1, 1, 1);
  const tmp = new THREE.Vector3();
  const cA = new THREE.Color(), cB = new THREE.Color();

  // 自适应分辨率：帧率持续偏低时降低像素比，偏高时逐步恢复
  let perfT = 0, perfN = 0, pr = renderer.getPixelRatio();
  const maxPR = pr;
  const adapt = (dt) => {
    perfT += dt; perfN++;
    if (perfT < 2) return;
    const fps = perfN / perfT; perfT = 0; perfN = 0;
    const next = fps < 38 ? Math.max(0.6, pr - 0.2) : fps > 58 ? Math.min(maxPR, pr + 0.1) : pr;
    if (Math.abs(next - pr) > 0.01) { pr = next; renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight); post.setSize(); }
  };

  function frame() {
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    t += dt;
    adapt(Math.min(rawDt, 0.5));
    G.time.value = t;

    // —— 全局按键 ——
    if (rig.mode === 'cinematic') {
      if (input.was('Escape', 'Enter')) rig.skip();
    } else {
      if (input.was('KeyH')) hud.toggleKeys();
      if (input.was('KeyV') && player.state !== 'locked') startTour('world');
      if (input.was('KeyR') && player.state !== 'train' && player.state !== 'locked') {
        const st = world.rail.nearestStation(player.pos);
        fadeTeleport(() => { player.teleport(st.boardPoint.clone(), Math.atan2(-st.perp.x, -st.perp.z)); rig.yaw = player.heading + Math.PI; });
        hud.toast(`返回 ${st.name}`);
      }
    }

    // —— 玩家 / 列车 ——
    player.update(dt, input, rig.yaw, events);
    train.update(dt, world.puffs);
    if (player.state === 'train') {
      train.deckPosition(player.pos);
      player.heading = train.heading;
      player.sync();
      if (rig.mode === 'train') {
        if (input.was('KeyT')) { rig.trainView = (rig.trainView + 1) % 4; rig.trainYaw = 0; hud.toast(['远景跟随视角', '侧面全景视角', '观景甲板视角', '高空环绕视角'][rig.trainView], 1.6); }
        if (input.was('KeyE') && train.state === 'dwell') alight();
        else if (input.was('Space') && train.state === 'dwell') train.departNow();
        for (let i = 0; i < stations.length; i++) if (input.was('Digit' + (i + 1))) train.setDestination(i);
      }
    }

    // —— 交互提示 ——
    let promptHtml = '';
    if (rig.mode !== 'cinematic' && (player.state === 'walk' || player.state === 'air')) {
      let best = null, bd = 1e9;
      for (const it of world.interact) {
        const d = it.pos.distanceTo(player.pos);
        if (d < it.radius && d - (it.priority ?? 0) * 3 < bd) { const l = it.label(); if (l) { bd = d - (it.priority ?? 0) * 3; best = { it, l }; } }
      }
      if (best) {
        promptHtml = best.l;
        if (input.was('KeyE')) best.it.action();
      }
    }
    if (player.state === 'glide') promptHtml = player.inUpdraft ? '气流托举中 · 乘风上升' : '<b>A</b><b>D</b> 转向　<b>W</b> 加速　<b>G</b> 收起滑翔伞';
    hud.prompt(promptHtml);

    // —— 事件 ——
    for (const e of train.events.splice(0)) {
      if (e.type === 'board') board();
      else if (e.type === 'toast') hud.toast(e.text, 3);
      else if (e.type === 'approach') hud.toast(`即将到达：${e.station.name} · ${e.station.island.cfg.sub}`, 4);
      else if (e.type === 'arrive') hud.toast(`${e.station.name} 到了 · 按 E 下车`, 3);
    }
    for (const e of events.splice(0)) {
      if (e.type === 'fell') fadeTeleport(() => { player.teleport(player.lastSafe.clone()); });
    }

    // —— 列车 HUD ——
    if (player.state === 'train') {
      const cur = train.stopped ? train.stationIdx : train.targetIdx;
      const dist = train.stopped ? 0 : Math.round(train.distAhead(train.stopS(train.targetIdx)));
      const stops = stations.map((s, i) => `<span class="${i === cur ? 'cur' : ''} ${train.destination === i ? 'dst' : ''}">${i + 1} ${s.island.name}</span>`).join('');
      const head = train.state === 'dwell'
        ? `停靠 ${train.station.name} · ${Math.ceil(train.dwell)} 秒后发车`
        : `下一站 ${train.nextStation.name} · ${dist} m · ${Math.round(train.speed * 3.6)} km/h`;
      hud.trainInfo(`<div class="t-title">云轨列车 · ${head}</div><div class="stops">${stops}</div>
        <div class="t-keys">${train.state === 'dwell' ? 'E 下车 · 空格 立即发车 · ' : ''}1-6 选择目的站 · T 切换视角 · 拖动环顾</div>`);
    } else hud.trainInfo('');

    // —— 区域 ——
    const reg = player.state === 'train' && !train.stopped ? null : world.regionAt(player.pos);
    if (reg) hud.setRegion(reg.id, reg.name, reg.cfg.sub);
    else hud.setRegion(player.state === 'train' ? 'rail' : 'sky', player.state === 'train' ? '云轨列车' : '云海上空', player.state === 'train' ? '穿行在群岛之间' : '风会带你去任何地方');
    const theme = reg ? reg.cfg.theme : 'sky';
    const am = AMB[theme] ?? AMB.sky;
    ambient.uniforms.uColorA.value.lerp(cA.set(am.a), 1 - Math.exp(-dt * 2));
    ambient.uniforms.uColorB.value.lerp(cB.set(am.b), 1 - Math.exp(-dt * 2));
    ambient.uniforms.uShape.value = am.shape;
    ambient.uniforms.uOpacity.value = damp(ambient.uniforms.uOpacity.value, am.op, 2, dt);
    ambient.uniforms.uCenter.value.copy(camera.position);
    const tn = TINT[theme] ?? [1, 1, 1];
    tintAmt.set(damp(tintAmt.x, tn[0], 1.5, dt), damp(tintAmt.y, tn[1], 1.5, dt), damp(tintAmt.z, tn[2], 1.5, dt));
    post.uniforms.uTint.value.setRGB(tintAmt.x, tintAmt.y, tintAmt.z);

    // —— 相机 / 世界 ——
    rig.update(dt, { player, train });
    G.playerPos.value.copy(player.pos);
    world.update(dt, t, camera);

    // 阴影相机跟随焦点（按纹素对齐，避免闪烁）
    const focus = rig.mode === 'cinematic' ? rig.look : player.pos;
    const texel = 150 / 2048;
    tmp.copy(focus);
    tmp.x = Math.round(tmp.x / texel) * texel; tmp.z = Math.round(tmp.z / texel) * texel;
    sun.target.position.copy(tmp);
    sun.position.copy(tmp).addScaledVector(sunDir, 300);

    hud.update(dt, player, train, { x: CASTLE.pos[0], z: CASTLE.pos[2] });
    input.endFrame();
    post.render(scene, camera, t);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__game = { world, player, train, rig, renderer, scene, camera };
}

boot().catch(showError);
