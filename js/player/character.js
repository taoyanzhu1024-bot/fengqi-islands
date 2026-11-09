// ============================================================
// 旅行者角色：草帽、浅色衣、鼠尾草绿小披风、小背包，附带“风叶”滑翔伞
// 模型朝向 +Z，原点在脚底
// ============================================================
import * as THREE from 'three';
import { wc } from '../core/materials.js';
import { PALETTE as P } from '../config.js';

const mesh = (geo, color, opts = {}) => {
  const m = new THREE.Mesh(geo, wc({ color, ...opts }));
  m.castShadow = true;
  return m;
};

export class Character {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const skin = 0xf3d5bf, shirt = 0xf6efe0, pants = 0xb9a58a, boots = 0x7d5a45, hair = 0x7a5640, straw = 0xe8cf8a;

    // 腿
    this.legs = [-1, 1].map((s) => {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.11, 0.62, 0);
      const leg = mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.5, 8), pants); leg.position.y = -0.27;
      const boot = mesh(new THREE.BoxGeometry(0.15, 0.13, 0.24), boots); boot.position.set(0, -0.55, 0.03);
      pivot.add(leg, boot); this.body.add(pivot);
      return pivot;
    });
    // 躯干
    const torso = mesh(new THREE.CylinderGeometry(0.19, 0.25, 0.56, 12), shirt); torso.position.y = 0.9; this.body.add(torso);
    const belt = mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.06, 12), P.wood); belt.position.y = 0.67; this.body.add(belt);
    const scarf = mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 12), P.coral); scarf.rotation.x = Math.PI / 2; scarf.position.y = 1.17; this.body.add(scarf);
    // 手臂
    this.arms = [-1, 1].map((s) => {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.26, 1.12, 0);
      const arm = mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.44, 8), shirt); arm.position.y = -0.22;
      const hand = mesh(new THREE.SphereGeometry(0.065, 8, 6), skin); hand.position.y = -0.47;
      pivot.add(arm, hand); pivot.rotation.z = s * 0.12; this.body.add(pivot);
      return pivot;
    });
    // 头部
    this.head = new THREE.Group(); this.head.position.y = 1.42; this.body.add(this.head);
    this.head.add(mesh(new THREE.SphereGeometry(0.24, 16, 12), skin));
    const hairM = mesh(new THREE.SphereGeometry(0.25, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    hairM.rotation.x = -0.35; hairM.position.set(0, 0.02, -0.03); this.head.add(hairM);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6), new THREE.MeshBasicMaterial({ color: 0x3b3440 }));
      eye.position.set(s * 0.085, 0.0, 0.215); this.head.add(eye);
      const blush = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshBasicMaterial({ color: 0xf2a8a0 }));
      blush.scale.set(1, 0.5, 0.3); blush.position.set(s * 0.14, -0.06, 0.19); this.head.add(blush);
    }
    // 草帽
    const hat = new THREE.Group(); hat.position.y = 0.16; hat.rotation.x = -0.08;
    hat.add(mesh(new THREE.CylinderGeometry(0.46, 0.48, 0.03, 20), straw));
    const crown = mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.2, 16), straw); crown.position.y = 0.11; hat.add(crown);
    const band = mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.06, 16), P.coral); band.position.y = 0.04; hat.add(band);
    this.head.add(hat);
    // 背包
    const pack = mesh(new THREE.BoxGeometry(0.36, 0.42, 0.2), 0xc59a6d); pack.position.set(0, 0.95, -0.25); this.body.add(pack);
    const roll = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.42, 8), P.sageDark); roll.rotation.z = Math.PI / 2; roll.position.set(0, 1.2, -0.27); this.body.add(roll);
    const flap = mesh(new THREE.BoxGeometry(0.37, 0.14, 0.21), 0xa77b5a); flap.position.set(0, 1.08, -0.25); this.body.add(flap);
    // 披风
    this.cape = new THREE.Group(); this.cape.position.set(0, 1.16, -0.12); this.body.add(this.cape);
    const capeGeo = new THREE.CylinderGeometry(0.2, 0.4, 0.78, 14, 4, true, Math.PI * 0.5, Math.PI);
    capeGeo.translate(0, -0.39, 0);
    const capeM = mesh(capeGeo, P.sage, { side: THREE.DoubleSide });
    capeM.position.z = -0.12; this.cape.add(capeM);

    // 风叶滑翔伞
    this.glider = new THREE.Group(); this.glider.position.y = 1.3; this.glider.visible = false;
    const canopyGeo = new THREE.SphereGeometry(1, 24, 6, 0, Math.PI * 2, 0, 0.75);
    canopyGeo.scale(2.3, 0.7, 0.95);
    const cols = new Float32Array(canopyGeo.attributes.position.count * 3);
    const cA = new THREE.Color(P.sage), cB = new THREE.Color(P.cream), cc = new THREE.Color();
    for (let i = 0; i < canopyGeo.attributes.position.count; i++) {
      const x = canopyGeo.attributes.position.getX(i);
      cc.copy(Math.floor((x + 2.3) / 0.92) % 2 ? cA : cB);
      cols.set([cc.r, cc.g, cc.b], i * 3);
    }
    canopyGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const canopy = new THREE.Mesh(canopyGeo, wc({ vertexColors: true, side: THREE.DoubleSide }));
    canopy.position.y = 1.3; canopy.castShadow = true;
    this.glider.add(canopy);
    const lines = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.25, -0.2, 0), new THREE.Vector3(-2.0, 1.1, 0), new THREE.Vector3(0.25, -0.2, 0), new THREE.Vector3(2.0, 1.1, 0),
      new THREE.Vector3(-0.2, -0.2, 0), new THREE.Vector3(-1.0, 1.6, 0.4), new THREE.Vector3(0.2, -0.2, 0), new THREE.Vector3(1.0, 1.6, 0.4),
    ]);
    this.glider.add(new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: 0x8a7a62 })));
    this.root.add(this.glider);

    this.phase = 0;
    this.gliderOpen = 0;
  }

  /** 每帧动画 */
  animate(dt, s) {
    const { speed = 0, grounded = true, gliding = false, onTrain = false } = s;
    const t = performance.now() / 1000;
    const moving = grounded && speed > 0.3;
    this.phase += dt * (moving ? 4 + speed * 0.9 : 0);
    const sw = moving ? Math.sin(this.phase) * Math.min(0.9, 0.25 + speed * 0.07) : 0;
    const k = 1 - Math.exp(-14 * dt);
    const lerpR = (o, v) => (o.rotation.x += (v - o.rotation.x) * k);
    if (s.sitting) {
      lerpR(this.legs[0], -1.45); lerpR(this.legs[1], -1.45);
      lerpR(this.arms[0], -0.55); lerpR(this.arms[1], -0.5);
    } else if (!grounded && !gliding) {
      lerpR(this.legs[0], -0.6); lerpR(this.legs[1], 0.3);
      lerpR(this.arms[0], -1.6); lerpR(this.arms[1], -1.4);
    } else if (gliding) {
      lerpR(this.legs[0], 0.25); lerpR(this.legs[1], 0.15);
      lerpR(this.arms[0], -2.7); lerpR(this.arms[1], -2.7);
    } else {
      lerpR(this.legs[0], sw); lerpR(this.legs[1], -sw);
      lerpR(this.arms[0], -sw * 0.8 + (onTrain ? -0.2 : 0)); lerpR(this.arms[1], sw * 0.8);
    }
    this.body.position.y = moving ? Math.abs(Math.sin(this.phase)) * 0.06 : Math.sin(t * 2) * 0.008;
    this.head.rotation.y = onTrain ? Math.sin(t * 0.4) * 0.5 : 0;
    // 披风：速度越快越向后扬起，并随风颤动
    const flare = gliding ? 1.2 : !grounded ? 0.8 : Math.min(speed * 0.08, 0.7);
    const flutter = Math.sin(t * (gliding ? 14 : 6)) * (0.04 + flare * 0.08);
    this.cape.rotation.x += (-(0.06 + flare) - flutter - this.cape.rotation.x) * k;
    // 滑翔伞展开
    this.gliderOpen += ((gliding ? 1 : 0) - this.gliderOpen) * (1 - Math.exp(-8 * dt));
    this.glider.visible = this.gliderOpen > 0.02;
    this.glider.scale.set(this.gliderOpen, 0.3 + this.gliderOpen * 0.7, this.gliderOpen);
    this.glider.rotation.z = gliding ? Math.sin(t * 1.3) * 0.05 + (s.bank ?? 0) : 0;
  }
}
