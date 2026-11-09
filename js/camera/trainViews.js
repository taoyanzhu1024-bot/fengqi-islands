// ============================================================
// 乘车镜头：车窗观景 / 车厢内部 / 列车外部跟随 / 世界全景
// 切换时在 0.8 秒内平滑过渡（位置插值 + 四元数球面插值）
// ============================================================
import * as THREE from 'three';
import { clamp, damp, easeInOut } from '../core/utils.js';

export const TRAIN_VIEWS = [
  { id: 'window', name: '车窗观景', fov: 60, interior: 1 },
  { id: 'cabin', name: '车厢内部', fov: 68, interior: 1 },
  { id: 'follow', name: '列车外部跟随', fov: 52, interior: 0 },
  { id: 'panorama', name: '世界全景', fov: 42, interior: 0 },
];

const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export class TrainCamera {
  constructor(physics) {
    this.physics = physics;
    this.view = 0;
    this.yaw = 0; this.pitch = 0;
    this.zoom = { follow: 24, panorama: 300 };
    this.cabinIdx = 0;
    this.blend = 1;
    this.startPos = new THREE.Vector3(); this.startQuat = new THREE.Quaternion(); this.startFov = 55;
    this.pos = new THREE.Vector3(); this.quat = new THREE.Quaternion(); this.fov = 60;
    this.orbit = 0;
    this.snap = true;
  }
  get current() { return TRAIN_VIEWS[this.view]; }

  setView(i, cam) {
    if (cam) { this.startPos.copy(cam.position); this.startQuat.copy(cam.quaternion); this.startFov = cam.fov; this.blend = 0; }
    this.view = (i + TRAIN_VIEWS.length) % TRAIN_VIEWS.length;
    this.yaw = 0; this.pitch = 0;
  }
  next(cam) { this.setView(this.view + 1, cam); }
  nextSeat(cam) { if (this.current.id === 'cabin') { this.startPos.copy(cam.position); this.startQuat.copy(cam.quaternion); this.blend = 0; this.cabinIdx = (this.cabinIdx + 1) % 3; this.yaw = 0; } }

  drag(dx, dy) {
    const id = this.current.id;
    this.yaw -= dx * 0.004;
    this.pitch = clamp(this.pitch + dy * 0.003, id === 'follow' ? -0.25 : -0.6, id === 'panorama' ? 0.9 : 0.6);
    if (id === 'window') this.yaw = clamp(this.yaw, -1.9, 1.9);
  }
  wheel(dy) {
    const id = this.current.id;
    if (id === 'follow') this.zoom.follow = clamp(this.zoom.follow * (1 + dy * 0.001), 12, 70);
    if (id === 'panorama') this.zoom.panorama = clamp(this.zoom.panorama * (1 + dy * 0.001), 140, 650);
  }

  /** 计算目标位姿并写入相机 */
  update(dt, train, cam) {
    const id = this.current.id;
    const desired = _v, look = _d;
    let rigid = false;
    if (id === 'window' || id === 'cabin') {
      rigid = true;
      const M = train.rideMatrix, A = train.rideAnchors;
      let base, yaw0;
      if (id === 'window') { base = A.windowEye; yaw0 = -Math.PI / 2 + 0.35; }   // 朝向左侧车窗、略偏前方
      else { const c = A.cabin[this.cabinIdx]; base = c.pos; yaw0 = c.yaw; }
      desired.copy(base).applyMatrix4(M);
      const a = yaw0 + this.yaw, p = -0.04 - this.pitch * 0.8;
      const dirLocal = new THREE.Vector3(Math.sin(a) * Math.cos(p), Math.sin(p), Math.cos(a) * Math.cos(p));
      _q.setFromRotationMatrix(_m.extractRotation(M));
      look.copy(dirLocal.applyQuaternion(_q)).add(desired);
    } else if (id === 'follow') {
      const tan = train.moveTangent ?? train.tangent;
      const yaw = Math.atan2(-tan.x, -tan.z) + this.yaw;
      const d = this.zoom.follow, pt = 0.17 + this.pitch;
      look.copy(train.focusPos).add(new THREE.Vector3(0, 2.2, 0)).addScaledVector(tan, 6);
      desired.set(Math.sin(yaw) * Math.cos(pt) * d, Math.sin(pt) * d, Math.cos(yaw) * Math.cos(pt) * d).add(look);
    } else {
      this.orbit += dt * 0.03;
      const yaw = this.orbit + this.yaw, d = this.zoom.panorama, pt = 0.42 + this.pitch * 0.6;
      look.copy(train.focusPos);
      desired.set(Math.sin(yaw) * Math.cos(pt) * d, Math.sin(pt) * d, Math.cos(yaw) * Math.cos(pt) * d).add(look);
    }
    if (!rigid) {
      const top = this.physics.topAt(desired.x, desired.z);
      if (desired.y < top + 3) desired.y = top + 3;
    }
    // 目标朝向
    _m.lookAt(desired, look, UP);
    const targetQ = new THREE.Quaternion().setFromRotationMatrix(_m);
    if (this.snap) { this.pos.copy(desired); this.quat.copy(targetQ); this.snap = false; this.blend = 1; }
    else if (rigid) { this.pos.copy(desired); this.quat.copy(targetQ); }
    else {
      const k = 1 - Math.exp(-4 * dt);
      this.pos.lerp(desired, k);
      this.quat.slerp(targetQ, 1 - Math.exp(-6 * dt));
    }
    this.fov = damp(this.fov, this.current.fov, 4, dt);
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 0.8);
      const e = easeInOut(this.blend);
      cam.position.lerpVectors(this.startPos, this.pos, e);
      cam.quaternion.slerpQuaternions(this.startQuat, this.quat, e);
      cam.fov = this.startFov + (this.fov - this.startFov) * e;
    } else {
      cam.position.copy(this.pos); cam.quaternion.copy(this.quat); cam.fov = this.fov;
    }
    cam.updateProjectionMatrix();
    return look;
  }
}
