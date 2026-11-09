// ============================================================
// 相机：第三人称跟随 / 列车多视角 / 电影镜头序列
// ============================================================
import * as THREE from 'three';
import { clamp, damp, dampAngle, easeInOut, lerp } from '../core/utils.js';
import { TrainCamera, TRAIN_VIEWS } from './trainViews.js';

const V = () => new THREE.Vector3();

export class CameraRig {
  constructor(camera, dom, physics) {
    this.cam = camera;
    this.physics = physics;
    this.yaw = 0.5; this.pitch = 0.22; this.dist = 9; this.targetDist = 9;
    this.mode = 'follow';
    this.trainView = 0;
    this.trainYaw = 0;
    this.pos = camera.position.clone();
    this.look = V();
    this.fov = 55;
    this.lastDrag = -10;
    this.shots = null;
    this.trainCam = new TrainCamera(physics);
    let drag = false, lx = 0, ly = 0;
    dom.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; dom.setPointerCapture?.(e.pointerId); });
    addEventListener('pointerup', () => (drag = false));
    addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
      if (this.mode === 'train') { this.trainCam.drag(dx, dy); this.lastDrag = performance.now() / 1000; return; }
      this.yaw -= dx * 0.005;
      this.pitch = clamp(this.pitch + dy * 0.004, -0.3, 1.25);
      this.lastDrag = performance.now() / 1000;
    });
    dom.addEventListener('wheel', (e) => { if (this.mode === 'train') { this.trainCam.wheel(e.deltaY); return; } this.targetDist = clamp(this.targetDist * (1 + e.deltaY * 0.001), 3.5, 30); }, { passive: true });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get dragging() { return performance.now() / 1000 - this.lastDrag < 1.6; }

  nextTrainView() { this.trainCam.next(this.cam); }
  setTrainView(i) { this.trainCam.setView(i, this.cam); }
  nextSeat() { this.trainCam.nextSeat(this.cam); }
  trainViewName() { return this.trainCam.name; }
  get trainViewId() { return this.trainCam.current.id; }
  interiorAmount() { return this.mode === 'train' ? this.trainCam.current.interior : 0; }

  /** 上车：从当前相机位置平滑过渡到默认的车窗观景 */
  enterTrain() { this.mode = 'train'; this.trainCam.snap = false; this.trainCam.setView(0, this.cam); }
  exitTrain(heading) { this.mode = 'follow'; this.yaw = heading + Math.PI; this.pitch = 0.22; this.snap = true; }

  /** 播放镜头序列 shots: [{ from:[V,V], look:[V,V], dur, title, sub, fov }] */
  play(shots, onShot, onDone) {
    this.shots = shots; this.shotI = 0; this.shotT = 0;
    this.onShot = onShot; this.onDone = onDone;
    this.mode = 'cinematic';
    onShot?.(shots[0]);
  }
  skip() { if (this.mode === 'cinematic') this.finishCinematic(); }
  finishCinematic() {
    this.shots = null;
    this.mode = this.prevMode ?? 'follow';
    this.snap = true;
    const cb = this.onDone; this.onDone = null; cb?.();
  }

  update(dt, ctx) {
    const cam = this.cam;
    let fovT = 55;
    if (this.mode === 'cinematic') {
      const sh = this.shots[this.shotI];
      this.shotT += dt;
      const t = easeInOut(clamp(this.shotT / sh.dur, 0, 1));
      cam.position.lerpVectors(sh.from[0], sh.from[1], t);
      this.look.lerpVectors(sh.look[0], sh.look[1], t);
      cam.lookAt(this.look);
      cam.fov = sh.fov ?? 50; cam.updateProjectionMatrix();
      if (this.shotT >= sh.dur) {
        this.shotI++; this.shotT = 0;
        if (this.shotI >= this.shots.length) this.finishCinematic();
        else this.onShot?.(this.shots[this.shotI]);
      }
      this.pos.copy(cam.position);
      return;
    }

    this.dist = damp(this.dist, this.targetDist, 6, dt);
    const p = ctx.player;
    let desired = V(), target = V();

    if (this.mode === 'train') {
      this.look.copy(this.trainCam.update(dt, ctx.train, cam));
      this.pos.copy(cam.position);
      this.fov = cam.fov;
      return;
    } else {
      // 跟随：滑翔/奔跑时相机缓慢回到角色身后
      if (p.state === 'glide' && !this.dragging) this.yaw = dampAngle(this.yaw, p.heading + Math.PI, 2.2, dt);
      else if (p.speed > 6 && !this.dragging) this.yaw = dampAngle(this.yaw, p.heading + Math.PI, 0.5, dt);
      const pitch = p.state === 'glide' ? Math.max(this.pitch, 0.18) : this.pitch;
      const d = this.dist * (p.state === 'glide' ? 1.4 : 1);
      target.copy(p.pos).add(V().set(0, 1.5, 0));
      desired.set(Math.sin(this.yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(this.yaw) * Math.cos(pitch) * d).add(target);
      const top = this.physics.topAt(desired.x, desired.z);
      if (desired.y < top + 0.8) desired.y = top + 0.8;
      if (this.snap) { this.pos.copy(desired); this.look.copy(target); this.snap = false; }
      const k = 10;
      this.pos.x = damp(this.pos.x, desired.x, k, dt); this.pos.y = damp(this.pos.y, desired.y, k, dt); this.pos.z = damp(this.pos.z, desired.z, k, dt);
      this.look.lerp(target, 1 - Math.exp(-16 * dt));
      fovT = p.state === 'glide' ? 64 : p.speed > 7 ? 58 : 55;
    }
    cam.position.copy(this.pos);
    cam.lookAt(this.look);
    this.fov = damp(this.fov, fovT, 3, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}

// ---------------- 电影镜头脚本 ----------------
const v = (x, y, z) => new THREE.Vector3(x, y, z);

export function tours(world) {
  const C = world.castle.position;
  const I = world.byId;
  const c = (id, dy = 0) => I[id].center.clone().add(v(0, dy, 0));
  // 天空之城现为真实岛屿（地面约 y=200），镜头对准城区与王庭尖塔
  const shotCastle = { from: [v(-30, 14, -95), v(-60, 40, -230)], look: [C.clone().add(v(0, 30, 0)), C.clone().add(v(0, 45, 0))], dur: 8, title: '天空之城 · 艾瑟兰', sub: '传说中，群岛所有的风都从那里出发', fov: 40 };
  const shotCity = { from: [C.clone().add(v(320, 120, 420)), C.clone().add(v(180, 70, 330))], look: [C.clone().add(v(0, 20, -40)), C.clone().add(v(0, 25, -90))], dur: 8, title: '艾瑟兰', sub: '广场、钟楼、空中花园与王庭 · 乘天空支线或飞艇「风帆号」抵达', fov: 45 };
  const ap = world.airway?.stations[0].pos ?? c('port');
  const shotAir = { from: [ap.clone().add(v(-70, 25, -60)), ap.clone().add(v(-45, 12, 20))], look: [ap.clone().add(v(0, 6, 0)), ap.clone().add(v(0, 6, 0))], dur: 6, title: '风帆号', sub: '往返云港岛与天空之城的飞艇', fov: 45 };
  const shotSea = { from: [v(260, -250, -120), v(620, -235, 120)], look: [v(900, -300, 500), v(1300, -280, 700)], dur: 7, title: '云海', sub: '岛屿之下，是望不到边的柔软云层', fov: 55 };
  const shotLoop = { from: [v(120, 1350, 1150), v(160, 1250, 700)], look: [v(130, 0, 230), v(130, 0, 200)], dur: 8, title: '云轨环线', sub: `六座车站 · 全长约 ${(world.rail.length / 1000).toFixed(1)} 公里`, fov: 50 };
  const shotFlower = { from: [c('flower', 90).add(v(-220, 0, -160)), c('flower', 60).add(v(-150, 0, 40))], look: [c('flower', 10), c('flower', 5)], dur: 7, title: '花海岛', sub: '风把花香吹成了海', fov: 50 };
  const shotLight = { from: [c('lighthouse', 70).add(v(150, 0, 170)), c('lighthouse', 50).add(v(60, 0, 170))], look: [c('lighthouse', 35), c('lighthouse', 30)], dur: 7, title: '灯塔岛', sub: '云海尽头的守望', fov: 50 };
  const shotSnow = { from: [c('snow', 120).add(v(200, 0, 160)), c('snow', 90).add(v(210, 0, -60))], look: [c('snow', 30), c('snow', 25)], dur: 7, title: '雪鸣岛', sub: '高空寒风里的铃音', fov: 50 };
  const shotForest = { from: [c('forest', 110).add(v(-200, 0, 180)), c('forest', 70).add(v(-160, 0, 40))], look: [c('forest', 25), c('forest', 20)], dur: 7, title: '森林岛', sub: '巨树与萤光的低语', fov: 50 };
  const shotPort = { from: [c('port', 70).add(v(140, 0, -160)), c('port', 50).add(v(160, 0, -20))], look: [c('port', 10), c('port', 8)], dur: 6, title: '云港岛', sub: '群岛的空中交通枢纽', fov: 50 };
  const shotMain = { from: [v(-250, 140, 260), v(-140, 90, 300)], look: [v(0, 10, 0), v(0, 6, 0)], dur: 7, title: '风栖群岛', sub: '欢迎来到云海之上', fov: 50 };
  const lp = world.viewpoints.lighthouse ?? c('lighthouse', 20);
  return {
    intro: [
      { from: [v(500, 420, 900), v(240, 200, 420)], look: [v(150, 0, 100), v(0, 10, 0)], dur: 6, title: '风栖群岛', sub: 'Fengqi Isles · 一场云上的旅行', fov: 50 },
      { from: [v(-120, 60, 140), v(-30, 20, 60)], look: [v(-20, 14, -14), v(-10, 6, 0)], dur: 4.5, title: '风栖主岛', sub: '金叶古树下的温暖起点', fov: 50 },
    ],
    main: [shotCastle, shotSea, shotLoop, shotFlower, shotLight],
    lighthouse: [
      { from: [lp.clone().add(v(0, 4, 0)), lp.clone().add(v(-40, 30, -60))], look: [C.clone().add(v(0, 30, 0)), C.clone().add(v(0, 50, 0))], dur: 8, title: '远方 · 天空之城', sub: '灯塔的光，是为迟归的风而亮', fov: 38 },
      { from: [lp.clone().add(v(30, -20, 60)), lp.clone().add(v(160, -120, 200))], look: [v(-800, -330, 1600), v(-900, -330, 1700)], dur: 7, title: '云海尽头', sub: '再往前，就是没有人去过的天空', fov: 55 },
      shotSnow,
    ],
    world: [shotMain, shotCastle, shotCity, shotFlower, shotPort, shotAir, shotForest, shotLight, shotSnow, shotSea, shotLoop],
  };
}
export { lerp };
