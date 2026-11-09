// ============================================================
// 玩家控制器：步行 / 奔跑 / 跳跃 / 滑翔 / 乘车 / 坠落重生
// ============================================================
import * as THREE from 'three';
import { Character } from './character.js';
import { clamp, damp, dampAngle, wrapAngle } from '../core/utils.js';

const GRAV = 24, JUMP = 8.6, WALK = 5.2, RUN = 9.5;

export class Player {
  constructor(physics) {
    this.physics = physics;
    this.char = new Character();
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.state = 'walk';   // walk | air | glide | train | locked
    this.grounded = false;
    this.speed = 0;
    this.lastSafe = new THREE.Vector3();
    this.safeT = 0;
    this.bank = 0;
    this.updrafts = [];
    this.inUpdraft = false;
  }

  get object() { return this.char.root; }

  teleport(p, heading = this.heading) {
    this.pos.copy(p); this.vel.set(0, 0, 0); this.heading = heading;
    this.state = 'walk'; this.grounded = true;
    this.lastSafe.copy(p);
    this.sync();
  }

  launchGlide(dir) {
    this.state = 'glide';
    this.heading = Math.atan2(dir.x, dir.z);
    this.vel.set(dir.x * 12, 6.5, dir.z * 12);
    this.grounded = false;
  }

  /**
   * @param input Input
   * @param camYaw 相机偏航（决定移动方向）
   */
  update(dt, input, camYaw, events) {
    if (this.state === 'train' || this.state === 'locked') { this.char.animate(dt, { speed: 0, grounded: true, onTrain: this.state === 'train' }); this.sync(); return; }
    const ph = this.physics;
    const f = input.isDown('KeyW', 'ArrowUp') - input.isDown('KeyS', 'ArrowDown');
    const s = input.isDown('KeyD', 'ArrowRight') - input.isDown('KeyA', 'ArrowLeft');
    const run = input.isDown('ShiftLeft', 'ShiftRight');

    if (this.state === 'glide') {
      // 滑翔：A/D 转向，W 俯冲加速，S 拉起减速
      const turn = -s * 1.5;
      this.heading += turn * dt;
      this.bank = damp(this.bank, -turn * 0.25, 4, dt);
      const fwd = clamp(13 + f * 4, 8, 18);
      const dx = Math.sin(this.heading), dz = Math.cos(this.heading);
      this.vel.x = damp(this.vel.x, dx * fwd, 2.5, dt);
      this.vel.z = damp(this.vel.z, dz * fwd, 2.5, dt);
      let sink = -2.4 - Math.max(f, 0) * 1.6;
      this.inUpdraft = false;
      for (const u of this.updrafts) {
        if (Math.hypot(this.pos.x - u.x, this.pos.z - u.z) < u.r + 2 && this.pos.y > u.y0 - 10 && this.pos.y < u.y1) { sink = 8; this.inUpdraft = true; }
      }
      this.vel.y = damp(this.vel.y, sink, this.inUpdraft ? 1.8 : 1.2, dt);
      if (input.was('KeyG')) { this.state = 'air'; events.push({ type: 'glideEnd' }); }
      if (this.inUpdraft && !this._wasUpdraft) events.push({ type: 'updraft' });
      this._wasUpdraft = this.inUpdraft;
    } else {
      // 地面/空中：相对相机方向移动
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
      const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
      let mx = fx * f + rx * s, mz = fz * f + rz * s;
      const ml = Math.hypot(mx, mz);
      if (ml > 0) { mx /= ml; mz /= ml; }
      const target = ml > 0 ? (run ? RUN : WALK) : 0;
      const ctl = this.grounded ? 12 : 2.5;
      this.vel.x = damp(this.vel.x, mx * target, ctl, dt);
      this.vel.z = damp(this.vel.z, mz * target, ctl, dt);
      if (ml > 0) this.heading = dampAngle(this.heading, Math.atan2(mx, mz), 12, dt);
      if (this.grounded && input.was('Space')) { this.vel.y = JUMP; this.grounded = false; this.state = 'air'; events.push({ type: 'jump' }); }
      else if (!this.grounded && (input.was('KeyG') || input.was('Space')) && this.vel.y < 3) {
        this.state = 'glide';
        this.vel.y = Math.max(this.vel.y, -2);
        const sp = Math.max(Math.hypot(this.vel.x, this.vel.z), 9);
        this.vel.x = Math.sin(this.heading) * sp; this.vel.z = Math.cos(this.heading) * sp;
        events.push({ type: 'glideStart' });
      }
      this.bank = damp(this.bank, 0, 5, dt);
    }

    // —— 水平移动 + 碰撞 ——
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    if (!ph.blocked(nx, nz, this.pos.y)) { this.pos.x = nx; this.pos.z = nz; }
    else if (!ph.blocked(nx, this.pos.z, this.pos.y)) { this.pos.x = nx; this.vel.z *= 0.5; }
    else if (!ph.blocked(this.pos.x, nz, this.pos.y)) { this.pos.z = nz; this.vel.x *= 0.5; }
    else { this.vel.x = this.vel.z = 0; }
    ph.resolve(this.pos, 0.38);

    // —— 竖直 ——
    const g = ph.groundAt(this.pos.x, this.pos.z, this.pos.y, 1.0);
    if (this.grounded && this.vel.y <= 0 && g > this.pos.y - 0.7) {
      this.pos.y = g; this.vel.y = 0;
    } else {
      if (this.state !== 'glide') this.vel.y -= GRAV * dt;
      this.pos.y += this.vel.y * dt;
      const g2 = ph.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.05, 0.6);
      if (this.pos.y <= g2 && this.vel.y <= 0.5) {
        this.pos.y = g2; this.vel.y = 0;
        if (!this.grounded) events.push({ type: 'land', from: this.state });
        this.grounded = true; this.state = 'walk';
      } else {
        this.grounded = false;
        if (this.state === 'walk') this.state = 'air';
      }
    }

    // 记录安全点（四周都有地面时）
    this.safeT -= dt;
    if (this.grounded && this.safeT <= 0) {
      this.safeT = 0.5;
      const ok = [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]].every(([a, b]) => ph.groundAt(this.pos.x + a, this.pos.z + b, this.pos.y, 1.5) > this.pos.y - 3);
      if (ok) this.lastSafe.copy(this.pos);
    }
    if (this.pos.y < this.lastSafe.y - 140 || this.pos.y < -300) events.push({ type: 'fell' });

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.char.animate(dt, { speed: this.speed, grounded: this.grounded, gliding: this.state === 'glide', bank: this.bank });
    // 脚步：步态相位每过半个周期落一次脚
    const stepI = Math.floor(this.char.phase / Math.PI);
    if (this.grounded && this.speed > 0.8 && stepI !== this._stepI) events.push({ type: 'step' });
    this._stepI = stepI;
    this.sync();
  }

  sync() {
    this.char.root.position.copy(this.pos);
    this.char.root.rotation.set(0, this.heading, 0);
    if (this.state === 'glide') this.char.root.rotation.z = this.bank * 0.6;
  }
}
export { wrapAngle };
