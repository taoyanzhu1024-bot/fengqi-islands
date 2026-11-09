// ============================================================
// 乘车状态机：统一管理上车 / 乘车 / 到站 / 下车
//   ON_FOOT → BOARDING → RIDING ⇄ ARRIVING → DISEMBARKING → ON_FOOT
// 所有与列车相关的按键、镜头、HUD 都以这里的 state 为准
// ============================================================
import * as THREE from 'three';
import { easeInOut } from '../core/utils.js';

export const RIDE = {
  ON_FOOT: 'ON_FOOT',
  BOARDING: 'BOARDING',
  RIDING: 'RIDING',
  ARRIVING: 'ARRIVING',
  DISEMBARKING: 'DISEMBARKING',
};

const BOARD_TIME = 0.9;
const ALIGHT_TIME = 0.8;
const REBOARD_COOLDOWN = 1.5;

export class RideController {
  constructor({ train, rail, player, rig, hud, audio, physics }) {
    Object.assign(this, { train, rail, player, rig, hud, audio, physics });
    this.state = RIDE.ON_FOOT;
    this.t = 0;
    this.cooldown = 0;
    this.from = new THREE.Vector3();
    this.to = new THREE.Vector3();
    this.log = [];          // 测试用：状态变迁记录
    this.seat = new THREE.Vector3();
    this.door = new THREE.Vector3();
  }

  get onTrain() { return this.state !== RIDE.ON_FOOT; }
  get canAlight() { return (this.state === RIDE.RIDING || this.state === RIDE.ARRIVING) && this.train.state === 'dwell'; }

  set(state) { this.state = state; this.t = 0; this.log.push(state); if (this.log.length > 50) this.log.shift(); }

  /** 站台交互点的提示文字 */
  stationLabel(st) {
    const tr = this.train;
    if (this.state !== RIDE.ON_FOOT || this.cooldown > 0) return null;
    if (tr.stopped && tr.stationIdx === st.index) return '按 <b>E</b> 乘坐云轨列车';
    if (tr.state === 'arriving' && tr.targetIdx === st.index) return '列车正在进站……';
    return '按 <b>E</b> 呼叫云轨列车';
  }
  stationAction(st) {
    const tr = this.train;
    if (this.state !== RIDE.ON_FOOT || this.cooldown > 0) return;
    if (tr.stopped && tr.stationIdx === st.index) this.board(st);
    else tr.interact(st);
  }

  board(st) {
    this.train.board();
    this.player.state = 'train';
    this.from.copy(this.player.pos);
    this.set(RIDE.BOARDING);
    this.rig.enterTrain();
    this.audio?.sfx('door');
    this.hud.toast(`欢迎乘坐「风栖号」· ${st.name} 发车`);
  }

  alight() {
    const st = this.train.station;
    this.from.copy(this.player.pos);
    this.to.copy(this.safeAnchor(st));
    this.set(RIDE.DISEMBARKING);
    this.train.openDoors(true);
    this.audio?.sfx('door');
  }

  /** 下车锚点校验：地面高度、碰撞、可行走区域；不合格时退回到站台中心 */
  safeAnchor(st) {
    const ph = this.physics;
    for (const c of st.alightCandidates) {
      const g = ph.groundAt(c.x, c.z, c.y + 1, 1.5);
      if (!isFinite(g) || Math.abs(g - c.y) > 0.4) continue;
      if (ph.blocked(c.x, c.z, g)) continue;
      const p = new THREE.Vector3(c.x, g, c.z);
      const q = p.clone(); ph.resolve(q, 0.45);
      if (q.distanceTo(p) > 0.01) continue;
      // 周围一圈也要有地面，避免站在边缘
      const ok = [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]].every(([a, b]) => Math.abs(ph.groundAt(p.x + a, p.z + b, g + 1, 1.5) - g) < 0.6);
      if (ok) return p;
    }
    return st.platformCenter.clone();
  }

  update(dt, input) {
    const tr = this.train, p = this.player;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.t += dt;
    let prompt = null;

    switch (this.state) {
      case RIDE.BOARDING: {
        // 站台 → 车门 → 座位
        tr.seatPosition(this.seat);
        tr.doorPosition(this.door);
        const k = Math.min(this.t / BOARD_TIME, 1);
        if (k < 0.5) p.pos.lerpVectors(this.from, this.door, easeInOut(k * 2));
        else p.pos.lerpVectors(this.door, this.seat, easeInOut(k * 2 - 1));
        p.heading = tr.heading;
        if (this.t >= BOARD_TIME) { this.set(RIDE.RIDING); tr.openDoors(false); }
        break;
      }
      case RIDE.RIDING:
      case RIDE.ARRIVING: {
        tr.seatPosition(p.pos);
        p.heading = tr.heading;
        const approaching = tr.state === 'running' && tr.distAhead(tr.stopS(tr.targetIdx)) < 260;
        if (approaching && this.state === RIDE.RIDING) this.set(RIDE.ARRIVING);
        if (tr.state === 'dwell') {
          prompt = '按 <b>E</b> 下车　<b>空格</b> 立即发车';
          if (input.take('KeyE')) this.alight();
          else if (input.take('Space')) tr.departNow();
        } else {
          if (this.state === RIDE.ARRIVING) prompt = `即将到达 ${tr.nextStation.name} · 请等待列车停稳`;
          if (input.take('KeyE')) {
            // 行驶中不能下车：改为在下一站停靠
            const changed = tr.destination !== null && tr.destination !== tr.targetIdx;
            tr.requestNextStop();
            this.hud.toast(changed ? `请等待列车到站 · 已改为在 ${tr.nextStation.name} 停靠` : `请等待列车到站 · 下一站 ${tr.nextStation.name}`, 2.5);
          }
        }
        if (this.state === RIDE.ARRIVING && tr.state === 'dwell') this.set(RIDE.RIDING);
        break;
      }
      case RIDE.DISEMBARKING: {
        // 座位 → 车门 → 站台安全锚点
        tr.doorPosition(this.door);
        const k = Math.min(this.t / ALIGHT_TIME, 1);
        if (k < 0.5) p.pos.lerpVectors(this.from, this.door, easeInOut(k * 2));
        else p.pos.lerpVectors(this.door, this.to, easeInOut(k * 2 - 1));
        if (this.t >= ALIGHT_TIME) this.finishAlight();
        break;
      }
    }
    p.sitting = this.state === RIDE.RIDING || this.state === RIDE.ARRIVING;
    if (this.onTrain) p.sync();
    return prompt;
  }

  finishAlight() {
    const st = this.train.station;
    this.train.alight();
    this.train.openDoors(false);
    this.player.teleport(this.to.clone(), st.alightHeading);
    this.rig.exitTrain(this.player.heading);
    this.cooldown = REBOARD_COOLDOWN;
    this.set(RIDE.ON_FOOT);
    this.hud.toast(`${st.island.name} · ${st.island.cfg.sub}`);
  }
}
