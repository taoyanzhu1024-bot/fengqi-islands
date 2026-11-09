// ============================================================
// 《风栖群岛》入口：渲染器、灯光、世界构建、游戏循环与交互逻辑
// V2：update() 与 render() 分离，便于自动化测试（window.__game.simulate）
// ============================================================
import * as THREE from 'three';
import { G } from './core/materials.js';
import { Physics, BoxSurface } from './core/physics.js';
import { Input } from './core/input.js';
import { damp } from './core/utils.js';
import { PALETTE as P, WORLD, CASTLE } from './config.js';
import { World } from './world/world.js';
import { Swarm } from './world/particles.js';
import { Player } from './player/player.js';
import { CameraRig, tours } from './camera/rig.js';
import { WatercolorPost } from './post/watercolor.js';
import { HUD } from './ui/hud.js';
import { SettingsPanel } from './ui/settings.js';
import { AudioManager } from './audio/audio.js';
import { RideController, RIDE } from './systems/ride.js';

const showError = (e) => {
  const el = document.getElementById('error');
  el.style.display = 'block';
  el.textContent = '加载出错：' + (e?.stack || e);
  console.error(e);
};
addEventListener('error', (e) => showError(e.error || e.message));

const QUALITY = {
  standard: { pr: 1.25, shadow: 2048, shadowRange: 75 },
  high: { pr: 2, shadow: 4096, shadowRange: 110 },
};

async function boot() {
  const audio = new AudioManager();
  const params = new URLSearchParams(location.search);

  // ---------------- 渲染器 ----------------
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  let quality = localStorage.getItem('fengqi.quality') || 'standard';
  renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY[quality].pr));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(P.fog, WORLD.fogNear, WORLD.fogFar);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.15, 14000);
  camera.position.set(500, 420, 900);

  // ---------------- 灯光 ----------------
  const sunDir = G.sunDir.value;
  const hemi = new THREE.HemisphereLight(0xcfe0f2, 0xcbb89c, 1.25);
  const sun = new THREE.DirectionalLight(0xffecd0, 2.3);
  sun.castShadow = true;
  const applyShadowQuality = () => {
    const q = QUALITY[quality];
    sun.shadow.mapSize.set(q.shadow, q.shadow);
    sun.shadow.map?.dispose(); sun.shadow.map = null;
    const sc = sun.shadow.camera;
    sc.left = -q.shadowRange; sc.right = q.shadowRange; sc.top = q.shadowRange; sc.bottom = -q.shadowRange;
    sc.near = 10; sc.far = 700; sc.updateProjectionMatrix();
  };
  applyShadowQuality();
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
  const ride = new RideController({ train, rail: world.rail, player, rig, hud, audio, physics });
  world.rail.stationLabel = (st) => ride.stationLabel(st);
  world.rail.stationAction = (st) => ride.stationAction(st);

  // ---------------- 交互 ----------------
  const fadeTeleport = (fn) => {
    player.state = 'locked';
    hud.fade(true);
    setTimeout(() => { fn(); rig.snap = true; hud.fade(false); }, 650);
  };
  const startTour = (name, done) => {
    if (!ride.onTrain) player.state = 'locked';
    rig.prevMode = rig.mode === 'train' ? 'train' : 'follow';
    hud.cinematic(true);
    rig.play(TOURS[name], (sh) => hud.caption(sh.title, sh.sub), () => {
      hud.cinematic(false);
      if (player.state === 'locked') player.state = 'walk';
      done?.();
    });
  };
  world.onViewpoint = (tour) => { audio.sfx('interact'); startTour(tour); };
  world.onGlideDeck = (pos, th) => {
    player.pos.copy(pos);
    player.launchGlide(new THREE.Vector3(Math.cos(th), 0, Math.sin(th)));
    audio.sfx('glideOpen');
    hud.toast('乘风而行 · A/D 转向，W 加速，进入白色气流可上升', 4);
  };

  const settings = new SettingsPanel({
    audio,
    getState: () => ({ quality, railMode: world.rail.mode }),
    onQuality: (q) => { quality = q; localStorage.setItem('fengqi.quality', q); renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY[q].pr)); maxPR = renderer.getPixelRatio(); pr = maxPR; renderer.setSize(innerWidth, innerHeight); post.setSize(); applyShadowQuality(); },
    onRailMode: (m) => world.rail.setMode?.(m),
    onTime: (t) => world.sky?.setTimePreset?.(t),
  });
  addEventListener('pointerdown', () => setTimeout(() => { settings.refresh(); if (audio.ctx?.state === 'running') document.getElementById('audioHint').classList.add('hide'); }, 200));
  addEventListener('keydown', () => setTimeout(() => { settings.refresh(); if (audio.ctx?.state === 'running') document.getElementById('audioHint').classList.add('hide'); }, 200));

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    post.setSize();
    ambient.resize(); world.swarms.forEach((s) => s.resize());
  });

  hud.ready();
  rig.yaw = player.heading + Math.PI;
  if (!params.has('nointro')) startTour('intro', () => hud.toast('沿着石板路走到南边的风栖站，乘上云轨列车吧', 5));

  // ---------------- 主循环 ----------------
  const events = [];
  let t = 0;
  const tintAmt = new THREE.Vector3(1, 1, 1);
  const tmp = new THREE.Vector3();
  const cA = new THREE.Color(), cB = new THREE.Color();
  let lastTrainState = train.state;

  // 自适应分辨率
  let perfT = 0, perfN = 0, pr = renderer.getPixelRatio();
  let maxPR = pr;
  const adapt = (dt) => {
    perfT += dt; perfN++;
    if (perfT < 2) return;
    const fps = perfN / perfT; perfT = 0; perfN = 0;
    const next = fps < 38 ? Math.max(0.6, pr - 0.2) : fps > 58 ? Math.min(maxPR, pr + 0.1) : pr;
    if (Math.abs(next - pr) > 0.01) { pr = next; renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight); post.setSize(); }
  };

  const surfaceKind = (p) => {
    const s = physics.surfaceAt(p.x, p.z, p.y);
    if (!s) return 'grass';
    if (s instanceof BoxSurface) return s.thickness < 1 ? 'wood' : 'stone';
    if (s.pathDist) {
      const lx = p.x - s.center.x, lz = p.z - s.center.z;
      if (s.paths.length && s.pathDist(lx, lz) < 1.8) return 'stone';
      if (s.id === 'snow') return 'snow';
      return 'grass';
    }
    return 'stone';
  };

  function update(dt) {
    t += dt;
    G.time.value = t;

    // —— 全局按键 ——
    if (rig.mode === 'cinematic') {
      if (input.take('Escape') || input.take('Enter')) rig.skip();
    } else {
      if (input.was('KeyH')) hud.toggleKeys();
      if (input.was('KeyV') && player.state !== 'locked') startTour('world');
      if (input.was('KeyR') && !ride.onTrain && player.state !== 'locked') {
        const st = world.rail.nearestStation(player.pos);
        fadeTeleport(() => { player.teleport(ride.safeAnchor(st), st.alightHeading); rig.yaw = player.heading + Math.PI; });
        hud.toast(`返回 ${st.name}`);
      }
    }

    // —— 玩家 / 列车 / 乘车状态机 ——
    player.update(dt, input, rig.yaw, events);
    train.update(dt, world.puffs);
    let promptHtml = ride.update(dt, input) ?? '';
    if (ride.onTrain && rig.mode === 'train') {
      if (input.take('KeyT')) { rig.nextTrainView(); hud.toast(rig.trainViewName(), 1.6); }
      if (input.take('KeyC')) rig.nextSeat();
      if (input.take('Escape') && rig.trainViewId !== 'window') { rig.setTrainView(0); hud.toast(rig.trainViewName(), 1.6); }
      for (let i = 0; i < stations.length; i++) if (input.take('Digit' + (i + 1))) train.setDestination(i);
    }

    // —— 交互提示（步行时） ——
    if (rig.mode !== 'cinematic' && !ride.onTrain && (player.state === 'walk' || player.state === 'air')) {
      let best = null, bd = 1e9;
      for (const it of world.interact) {
        const d = it.pos.distanceTo(player.pos);
        if (d < it.radius && d - (it.priority ?? 0) * 3 < bd) { const l = it.label(); if (l) { bd = d - (it.priority ?? 0) * 3; best = { it, l }; } }
      }
      if (best) {
        promptHtml = best.l;
        if (input.take('KeyE')) best.it.action();
      }
    }
    if (player.state === 'glide') promptHtml = player.inUpdraft ? '气流托举中 · 乘风上升' : '<b>A</b><b>D</b> 转向　<b>W</b> 加速　<b>G</b> 收起滑翔伞';
    hud.prompt(promptHtml);

    // —— 事件 ——
    for (const e of train.events.splice(0)) {
      if (e.type === 'toast') hud.toast(e.text, 3);
      else if (e.type === 'approach') { hud.toast(`即将到达：${e.station.name} · ${e.station.island.cfg.sub}`, 4); audio.sfx('brake'); }
      else if (e.type === 'arrive') { hud.toast(`${e.station.name} 到了 · 按 E 下车`, 3); audio.sfx('arrive'); }
      else if (e.type === 'depart') audio.sfx('whistle');
    }
    if (train.state !== lastTrainState) {
      if (train.state === 'idle' && lastTrainState === 'arriving') audio.sfx('arrive');
      lastTrainState = train.state;
    }
    for (const e of events.splice(0)) {
      if (e.type === 'fell') fadeTeleport(() => { player.teleport(player.lastSafe.clone()); });
      else if (e.type === 'step') audio.sfx('step', { surface: surfaceKind(player.pos) });
      else if (e.type === 'jump') audio.sfx('jump');
      else if (e.type === 'land') audio.sfx('land');
      else if (e.type === 'glideStart') audio.sfx('glideOpen');
      else if (e.type === 'glideEnd') audio.sfx('glideClose');
      else if (e.type === 'updraft') audio.sfx('updraft');
    }

    // —— 列车 HUD ——
    if (ride.onTrain) {
      const cur = train.stopped ? train.stationIdx : train.targetIdx;
      const dist = train.stopped ? 0 : Math.round(train.distAhead(train.stopS(train.targetIdx)));
      const stops = stations.map((s, i) => `<span class="${i === cur ? 'cur' : ''} ${train.destination === i ? 'dst' : ''}">${i + 1} ${s.island.name}</span>`).join('');
      const head = train.state === 'dwell'
        ? `停靠 ${train.station.name} · ${Math.ceil(train.dwell)} 秒后发车`
        : `下一站 ${train.nextStation.name} · ${dist} m · ${Math.round(train.speed * 3.6)} km/h`;
      hud.trainInfo(`<div class="t-title">风栖号 · ${head}</div><div class="stops">${stops}</div>
        <div class="t-keys">${train.state === 'dwell' ? 'E 下车 · 空格 立即发车 · ' : 'E 在下一站停靠 · '}1-6 选择目的站 · T 切换视角（${rig.trainViewName()}）${rig.trainViewId === 'cabin' ? ' · C 换座位' : ''} · 拖动环顾${['follow', 'panorama'].includes(rig.trainViewId) ? ' · 滚轮缩放' : ''}</div>`);
    } else hud.trainInfo('');

    // —— 区域 ——
    const reg = ride.onTrain && !train.stopped ? null : world.regionAt(player.pos);
    if (reg) hud.setRegion(reg.id, reg.name, reg.cfg.sub);
    else hud.setRegion(ride.onTrain ? 'rail' : 'sky', ride.onTrain ? '云轨列车 · 风栖号' : '云海上空', ride.onTrain ? '穿行在群岛之间' : '风会带你去任何地方');
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
    rig.update(dt, { player, train, ride });
    // 车窗观景为第一人称：隐藏自身角色模型
    player.object.visible = !(rig.mode === 'train' && rig.trainViewId === 'window');
    G.playerPos.value.copy(player.pos);
    world.update(dt, t, camera, { train, player, audio });

    // —— 音频 ——
    let wf = 0;
    for (const m of world.mists) { const d = Math.hypot(m.p.x - player.pos.x, m.p.z - player.pos.z); wf = Math.max(wf, 1 - d / 70); }
    audio.update(dt, {
      region: ride.onTrain && !train.stopped ? 'sky' : theme, speed: player.speed, onTrain: ride.onTrain,
      interior: rig.interiorAmount?.() ?? 0.5, trainSpeed: train.speed,
      trainNear: Math.max(0, 1 - train.midPosition.distanceTo(camera.position) / 160),
      glide: player.state === 'glide' ? 1 : 0, waterfall: wf, altitude: player.pos.y, night: world.sky?.night ?? 0,
    });

    // 阴影相机跟随焦点（按纹素对齐）
    const focus = rig.mode === 'cinematic' ? rig.look : player.pos;
    const texel = (QUALITY[quality].shadowRange * 2) / QUALITY[quality].shadow;
    tmp.copy(focus);
    tmp.x = Math.round(tmp.x / texel) * texel; tmp.z = Math.round(tmp.z / texel) * texel;
    sun.target.position.copy(tmp);
    sun.position.copy(tmp).addScaledVector(sunDir, 300);

    hud.update(dt, player, train, { x: CASTLE.pos[0], z: CASTLE.pos[2] });
    input.endFrame();
  }

  const render = () => post.render(scene, camera, t);
  let last = performance.now();
  function frame(now) {
    const raw = (now - last) / 1000; last = now;
    adapt(Math.min(raw, 0.5));
    update(Math.min(Math.max(raw, 0), 0.05));
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.__game = {
    world, player, train, rig, ride, audio, renderer, scene, camera, input, RIDE, ready: true,
    // 测试接口：无渲染快进模拟；keys 为每步都按下的键
    simulate(sec, dt = 1 / 30) { const n = Math.round(sec / dt); for (let i = 0; i < n; i++) update(dt); },
    press(code) { input.tap(code); update(1 / 30); },
    renderOnce: render,
  };
}

boot().catch(showError);
