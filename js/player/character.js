// ============================================================
// 旅行者角色（V2 精修）
// 设计要点：宽檐草帽（珊瑚色缎带 + 飘带 + 叶形饰物）、米白束腰上衣、珊瑚色围巾、
//           鼠尾草绿长披风（会随风飘动）、皮质背包（睡袋卷 + 小提灯）、
//           折叠式“风叶”滑翔翼：平时折叠在背包上，滑翔时一根根展开成叶形翼面
// 每个关节段内的静态部件合并为一个网格（顶点色），整个角色约 20 个 draw call
// 模型朝向 +Z，原点在脚底；全部为代码程序化建模
// ============================================================
import * as THREE from 'three';
import { Batcher, GEO, T, blob } from '../core/batcher.js';
import { wc } from '../core/materials.js';
import { PALETTE as P } from '../config.js';

const C = {
  skin: 0xf3d5bf, skinShade: 0xe8bfa6, blush: 0xf2a8a0, hair: 0x7a5640, hairLight: 0x95694c,
  shirt: 0xf6efe0, shirtShade: 0xe8dcc6, pants: 0xc4b08f, boot: 0x9a6c50, bootDark: 0x7d5a45, sole: 0x5e4334,
  straw: 0xe8cf8a, strawDark: 0xd2b46c, ribbon: P.coral, scarf: P.coral, scarfDark: 0xc97f6c,
  cape: P.sage, capeDark: P.sageDark, capeTrim: 0xf3e6c8, leather: 0xc59a6d, leatherDark: 0x9c7552, brass: P.gold,
  eye: 0x3b3440,
};
const MAT = wc({ vertexColors: true, grain: 0.6 });
const MAT2 = wc({ vertexColors: true, grain: 0.6, side: THREE.DoubleSide });
const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true });
const I = new THREE.Matrix4();

/** 把一组部件合批成网格并挂到 parent 上 */
function bake(parent, fill, double = false) {
  const b = new Batcher();
  fill(b);
  b.build({ solid: double ? MAT2 : MAT, flat: double ? MAT2 : MAT, glow: GLOW }).forEach((m) => { m.castShadow = m.material !== GLOW; m.receiveShadow = false; parent.add(m); });
  return parent;
}
/** 车床旋转体（轮廓点 [r, y]） */
const lathe = (pts, seg = 18) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

export class Character {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    // —— 腿：裤腿 + 翻边短靴 ——
    this.legs = [-1, 1].map((s) => {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.105, 0.62, 0);
      bake(pivot, (b) => {
        b.add('solid', GEO.taper8, C.pants, T(I, 0, -0.17, 0, Math.PI, 0, 0, 0.088, 0.36, 0.088));
        b.add('solid', GEO.torus, C.shirtShade, T(I, 0, -0.34, 0, Math.PI / 2, 0, 0, 0.078, 0.078, 1.2));
        b.add('solid', GEO.cyl12, C.boot, T(I, 0, -0.45, 0, 0, 0, 0, 0.082, 0.22, 0.082));
        b.add('solid', GEO.torus, C.bootDark, T(I, 0, -0.35, 0, Math.PI / 2, 0, 0, 0.088, 0.088, 1.8));       // 靴口翻边
        b.add('solid', GEO.sphere, C.boot, T(I, 0, -0.55, 0.05, 0, 0, 0, 0.088, 0.075, 0.15));                  // 圆头靴
        b.add('solid', GEO.box, C.sole, T(I, 0, -0.605, 0.04, 0, 0, 0, 0.16, 0.03, 0.27));
        for (const y of [-0.42, -0.47]) b.add('solid', GEO.box, C.capeTrim, T(I, 0, y, 0.082, 0, 0, 0, 0.07, 0.012, 0.012)); // 鞋带
      });
      this.body.add(pivot);
      return pivot;
    });

    // —— 躯干：束腰上衣、腰带、腰包、纽扣、围巾 ——
    this.torso = bake(new THREE.Group(), (b) => {
      // 轮廓点自下而上排列（车床法线朝外）
      b.add('solid', lathe([[0.001, 0.56], [0.27, 0.56], [0.235, 0.7], [0.205, 0.86], [0.22, 1.05], [0.2, 1.17], [0.13, 1.23], [0.001, 1.24]], 20), (x, y, z) => new THREE.Color(z > 0 ? C.shirt : C.shirtShade), I);
      b.add('solid', GEO.torus, C.capeDark, T(I, 0, 0.575, 0, Math.PI / 2, 0, 0, 0.27, 0.27, 0.6));            // 下摆滚边
      b.add('solid', GEO.cyl16, C.leatherDark, T(I, 0, 0.78, 0, 0, 0, 0, 0.222, 0.07, 0.222));                // 腰带
      b.add('solid', GEO.box, C.brass, T(I, 0, 0.78, 0.222, 0, 0, 0, 0.085, 0.07, 0.02));
      b.add('solid', GEO.box, C.leatherDark, T(I, 0, 0.78, 0.226, 0, 0, 0, 0.045, 0.035, 0.02));
      b.add('solid', GEO.box, C.leather, T(I, 0.2, 0.72, 0.08, 0, 0.5, 0, 0.1, 0.12, 0.07));                  // 腰包
      b.add('solid', GEO.box, C.leatherDark, T(I, 0.2, 0.775, 0.085, 0, 0.5, 0, 0.105, 0.04, 0.075));
      b.add('solid', GEO.cyl12, C.brass, T(I, -0.2, 0.71, 0.1, Math.PI / 2, 0, 0, 0.045, 0.02, 0.045));        // 罗盘挂饰
      for (const y of [0.93, 1.0, 1.07]) b.add('solid', GEO.sphereLo, C.brass, T(I, 0, y, 0.215 + (1.05 - y) * 0.02, 0, 0, 0, 0.016));
      b.add('solid', GEO.torus, C.scarf, T(I, 0, 1.2, 0.0, Math.PI / 2 + 0.12, 0, 0, 0.16, 0.16, 1.9));        // 围巾
      b.add('solid', GEO.torus, C.scarfDark, T(I, 0, 1.16, 0.0, Math.PI / 2 + 0.12, 0, 0, 0.18, 0.18, 1.3));
      b.add('solid', GEO.sphereLo, C.scarf, T(I, 0.07, 1.14, 0.17, 0, 0, 0, 0.055, 0.05, 0.04));               // 围巾结
      b.add('solid', GEO.cyl8, C.brass, T(I, -0.07, 1.16, 0.17, Math.PI / 2, 0, 0, 0.03, 0.02, 0.03));          // 披风扣
      // 背包肩带（越过肩膀到胸前）
      for (const sx of [-1, 1]) {
        b.add('solid', GEO.box, C.leatherDark, T(I, sx * 0.13, 1.19, -0.02, 0.15, 0, sx * 0.08, 0.05, 0.03, 0.34));
        b.add('solid', GEO.box, C.leatherDark, T(I, sx * 0.12, 1.02, 0.205, -0.12, 0, 0, 0.05, 0.3, 0.025));
        b.add('solid', GEO.box, C.brass, T(I, sx * 0.12, 0.95, 0.22, 0, 0, 0, 0.055, 0.03, 0.015));
      }
    });
    this.body.add(this.torso);
    // 围巾飘带（独立部件）
    this.scarfTail = new THREE.Group(); this.scarfTail.position.set(0.09, 1.13, 0.17);
    bake(this.scarfTail, (b) => { b.add('solid', GEO.box, C.scarf, T(I, 0, -0.12, 0.01, 0, 0, 0, 0.06, 0.24, 0.02)); b.add('solid', GEO.box, C.scarfDark, T(I, 0, -0.245, 0.01, 0, 0, 0, 0.065, 0.02, 0.022)); });
    this.body.add(this.scarfTail);

    // —— 手臂：衣袖 + 鼠尾草绿袖口 + 手 ——
    this.arms = [-1, 1].map((s) => {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.245, 1.13, 0);
      bake(pivot, (b) => {
        b.add('solid', GEO.sphere, C.shirt, T(I, 0, -0.02, 0, 0, 0, 0, 0.08));
        b.add('solid', GEO.taper8, C.shirt, T(I, 0, -0.19, 0, Math.PI, 0, 0, 0.068, 0.36, 0.068));
        b.add('solid', GEO.torus, C.capeDark, T(I, 0, -0.36, 0, Math.PI / 2, 0, 0, 0.058, 0.058, 1.6));
        b.add('solid', GEO.sphere, C.skin, T(I, 0, -0.43, 0.01, 0, 0, 0, 0.058, 0.07, 0.05));
        b.add('solid', GEO.sphereLo, C.skin, T(I, -s * 0.04, -0.41, 0.03, 0, 0, 0, 0.024));
      });
      pivot.rotation.z = s * 0.12;
      this.body.add(pivot);
      return pivot;
    });

    // —— 头部：脸、头发、刘海 ——
    this.head = new THREE.Group(); this.head.position.y = 1.47; this.body.add(this.head);
    bake(this.head, (b) => {
      b.add('solid', GEO.sphere, C.skin, T(I, 0, 0, 0, 0, 0, 0, 0.255, 0.245, 0.25));
      b.add('solid', GEO.sphereLo, C.skinShade, T(I, 0, -0.03, 0.245, 0, 0, 0, 0.022, 0.018, 0.015));          // 鼻
      b.add('solid', new THREE.TorusGeometry(0.035, 0.008, 4, 10, Math.PI), 0xb4676a, T(I, 0, -0.085, 0.228, 0, 0, Math.PI, 1, 0.8, 1)); // 微笑
      for (const sx of [-1, 1]) {
        b.add('solid', GEO.sphereLo, C.blush, T(I, sx * 0.145, -0.065, 0.2, 0, sx * 0.5, 0, 0.045, 0.022, 0.012));
        b.add('solid', GEO.box, C.hair, T(I, sx * 0.09, 0.085, 0.228, 0, 0, sx * -0.12, 0.06, 0.011, 0.01));   // 眉
        b.add('solid', GEO.sphereLo, C.skin, T(I, sx * 0.255, -0.01, 0, 0, 0, 0, 0.035, 0.055, 0.04));        // 耳
      }
      // 头发：后脑 + 刘海 + 鬓角 + 脑后小辫
      b.add('solid', GEO.sphere, C.hair, T(I, 0, 0.04, -0.035, -0.25, 0, 0, 0.265, 0.25, 0.25));
      for (let i = 0; i < 6; i++) {
        const a = -0.75 + i * 0.3;
        b.add('solid', blob(i, 1, 0.25), i % 2 ? C.hair : C.hairLight, T(I, Math.sin(a) * 0.17, 0.12 - Math.abs(a) * 0.03, 0.17 + Math.cos(a) * 0.04, 0.4, a, 0, 0.075, 0.055, 0.06));
      }
      for (const sx of [-1, 1]) b.add('solid', blob(sx + 5, 1, 0.2), C.hair, T(I, sx * 0.22, -0.06, 0.07, 0, 0, sx * 0.2, 0.05, 0.11, 0.06));
      b.add('solid', blob(9, 1, 0.3), C.hair, T(I, 0, -0.08, -0.25, 0.4, 0, 0, 0.07, 0.1, 0.07));
      b.add('solid', GEO.torus, C.ribbon, T(I, 0, -0.03, -0.24, 0.4, 0, 0, 0.045, 0.045, 1.5));
    });
    // 眼睛（可眨眼）
    this.eyes = new THREE.Group(); this.head.add(this.eyes);
    bake(this.eyes, (b) => {
      for (const sx of [-1, 1]) {
        b.add('solid', GEO.sphereLo, C.eye, T(I, sx * 0.09, 0.015, 0.228, 0, sx * 0.35, 0, 0.032, 0.046, 0.018));
        b.add('glow', GEO.sphereLo, 0xffffff, T(I, sx * 0.09 + 0.012, 0.032, 0.243, 0, 0, 0, 0.011));
      }
    });

    // —— 草帽：微卷的宽檐 + 编织纹 + 缎带蝴蝶结 + 叶形饰物 ——
    this.hat = new THREE.Group(); this.hat.position.set(0, 0.17, -0.01); this.hat.rotation.x = -0.1;
    const brim = lathe([[0.2, 0.012], [0.38, 0.0], [0.53, -0.03], [0.56, -0.045], [0.53, -0.05], [0.38, -0.014], [0.2, -0.008]], 32);
    { const p = brim.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z); p.setY(i, p.getY(i) + Math.sin(Math.atan2(z, x) * 5) * 0.014 * Math.max(0, (r - 0.3) / 0.26)); } brim.computeVertexNormals(); }
    bake(this.hat, (b) => {
      const weave = (x, y, z) => new THREE.Color(Math.floor(Math.hypot(x, z) / 0.045) % 2 ? C.straw : C.strawDark);
      b.add('solid', brim, weave, I);
      b.add('solid', lathe([[0.215, 0.0], [0.205, 0.1], [0.185, 0.19], [0.12, 0.225], [0.001, 0.23]], 24), (x, y) => new THREE.Color(Math.floor(y / 0.04) % 2 ? C.straw : C.strawDark), I);
      b.add('solid', GEO.cyl16, C.ribbon, T(I, 0, 0.035, 0, 0, 0, 0, 0.218, 0.06, 0.218));
      // 蝴蝶结（左侧）
      b.add('solid', GEO.sphereLo, C.ribbon, T(I, -0.2, 0.04, -0.07, 0, 0.4, 0.5, 0.05, 0.035, 0.015));
      b.add('solid', GEO.sphereLo, C.ribbon, T(I, -0.2, 0.04, -0.15, 0, 0.4, -0.5, 0.05, 0.035, 0.015));
      b.add('solid', GEO.sphereLo, C.scarfDark, T(I, -0.215, 0.04, -0.11, 0, 0, 0, 0.022));
      // 叶形饰物
      b.add('solid', GEO.sphereLo, C.capeDark, T(I, -0.19, 0.11, 0.06, 0.3, 0.6, 0.9, 0.025, 0.09, 0.012));
      b.add('solid', GEO.sphereLo, C.cape, T(I, -0.2, 0.1, 0.0, -0.2, 0.6, 0.6, 0.022, 0.075, 0.01));
    }, true);
    this.head.add(this.hat);
    this.hatTails = [0, 1].map((i) => {
      const g = new THREE.Group(); g.position.set(-0.21, 0.03, -0.11);
      bake(g, (b) => b.add('solid', GEO.box, C.ribbon, T(I, 0, -0.09, -0.02, 0, 0, 0, 0.008, 0.18, 0.035)), true);
      g.rotation.y = 0.4 + i * 0.3;
      this.hat.add(g);
      return g;
    });

    // —— 披风：鼠尾草绿长披风 + 米色滚边 + 折起的兜帽（顶点逐帧飘动） ——
    this.cape = new THREE.Group(); this.cape.position.set(0, 1.22, -0.02); this.body.add(this.cape);
    const capeGeo = new THREE.CylinderGeometry(0.21, 0.33, 0.74, 16, 6, true, Math.PI * 0.5 - 0.15, Math.PI + 0.3);
    capeGeo.translate(0, -0.37, 0);
    capeGeo.scale(1, 1, 0.8);      // 背后更贴身，不像裙摆
    const cc = new Float32Array(capeGeo.attributes.position.count * 3), cg = new THREE.Color();
    for (let i = 0; i < capeGeo.attributes.position.count; i++) { const y = capeGeo.attributes.position.getY(i); cg.set(y < -0.7 ? C.capeTrim : C.cape).multiplyScalar(y < -0.7 ? 1 : 0.92 + (Math.sin(i * 1.7) * 0.04)); cg.toArray(cc, i * 3); }
    capeGeo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    this.capeMesh = new THREE.Mesh(capeGeo, MAT2); this.capeMesh.castShadow = true; this.cape.add(this.capeMesh);
    this.capeBase = capeGeo.attributes.position.array.slice();
    bake(this.cape, (b) => {
      b.add('solid', new THREE.SphereGeometry(1, 14, 8, Math.PI * 0.5, Math.PI, 0, Math.PI / 2), C.capeDark, T(I, 0, -0.04, -0.12, -0.5, 0, 0, 0.17, 0.13, 0.13)); // 兜帽
      b.add('solid', GEO.torus, C.capeTrim, T(I, 0, -0.02, 0, Math.PI / 2, 0, 0, 0.21, 0.21, 1.2));
    }, true);

    // —— 背包：圆角皮包 + 包盖 + 侧袋 + 睡袋卷 + 小提灯 ——
    this.pack = new THREE.Group(); this.pack.position.set(0, 0.9, -0.34); this.body.add(this.pack);
    bake(this.pack, (b) => {
      b.add('solid', new THREE.CapsuleGeometry(0.15, 0.14, 4, 12), C.leather, T(I, 0, 0, 0, 0, 0, 0, 1.15, 1, 0.62));
      b.add('solid', new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), C.leatherDark, T(I, 0, 0.1, 0.01, 0, 0, 0, 0.18, 0.12, 0.11));
      b.add('solid', GEO.box, C.leatherDark, T(I, 0, 0.07, -0.1, 0.25, 0, 0, 0.12, 0.12, 0.02));
      b.add('solid', GEO.box, C.brass, T(I, 0, 0.01, -0.105, 0, 0, 0, 0.04, 0.035, 0.015));
      for (const sx of [-1, 1]) b.add('solid', GEO.box, C.leatherDark, T(I, sx * 0.17, -0.06, 0, 0, 0, 0, 0.05, 0.14, 0.12));
      b.add('solid', GEO.cyl12, C.capeDark, T(I, 0, 0.26, 0.0, 0, 0, Math.PI / 2, 0.065, 0.36, 0.065));                // 睡袋卷
      for (const sx of [-1, 1]) b.add('solid', GEO.torus, C.leatherDark, T(I, sx * 0.1, 0.26, 0, 0, Math.PI / 2, 0, 0.07, 0.07, 1.4));
      b.add('solid', GEO.cyl6, C.brass, T(I, 0.21, -0.02, -0.03, 0, 0, 0, 0.008, 0.08, 0.008));                         // 小提灯
      b.add('solid', GEO.cone6, C.brass, T(I, 0.21, -0.07, -0.03, 0, 0, 0, 0.035, 0.03, 0.035));
      b.add('glow', GEO.oct, P.glowWarm, T(I, 0.21, -0.12, -0.03, 0, 0, 0, 0.03, 0.045, 0.03));
    });

    // —— 折叠式“风叶”滑翔翼：七根肋骨 + 叶形翼面（逐帧重算），轴心在背包顶部 ——
    this.glider = new THREE.Group(); this.glider.position.set(0, 0.74, -0.47); this.body.add(this.glider);
    this.ribN = 7;
    this.ribs = [];
    const ribGeo = new THREE.CylinderGeometry(0.012, 0.018, 1, 6).translate(0, 0.5, 0);
    const ribMat = wc({ color: 0xa77b5a });
    for (let i = 0; i < this.ribN; i++) { const r = new THREE.Mesh(ribGeo, ribMat); r.castShadow = true; this.glider.add(r); this.ribs.push(r); }
    const panels = this.ribN - 1;
    const wGeo = new THREE.BufferGeometry();
    wGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(panels * 6 * 3), 3));
    const wc0 = new Float32Array(panels * 6 * 3), ca = new THREE.Color(C.cape), cb = new THREE.Color(0xf6efe0), ct = new THREE.Color(P.coralSoft);
    for (let p = 0; p < panels; p++) for (let v = 0; v < 6; v++) { const tip = v === 2 || v === 4; (tip && (p === 0 || p === panels - 1) ? ct : p % 2 ? ca : cb).toArray(wc0, (p * 6 + v) * 3); }
    wGeo.setAttribute('color', new THREE.BufferAttribute(wc0, 3));
    this.wing = new THREE.Mesh(wGeo, wc({ vertexColors: true, side: THREE.DoubleSide, grain: 0.5 }));
    this.wing.castShadow = true; this.wing.frustumCulled = false;
    this.glider.add(this.wing);
    bake(this.glider, (b) => { b.add('solid', GEO.cyl12, C.brass, T(I, 0, 0, 0, Math.PI / 2, 0, 0, 0.05, 0.05, 0.05)); b.add('solid', GEO.sphereLo, C.leatherDark, T(I, 0, 0, 0.03, 0, 0, 0, 0.035)); });

    this.phase = 0;
    this.gliderOpen = 0;
    this.blinkT = 2; this.lookT = 0; this.lookYaw = 0;
    this._v = new THREE.Vector3();
    this.updateWing(0, 0, 0);
  }

  /** 重算翼面：k=0 折叠在背包上，k=1 完全展开 */
  updateWing(k, t, flutter) {
    const N = this.ribN, spread = 1.4 * k, L = 0.5 + 1.87 * k;
    const tips = [], v = this._v, up = this._up || (this._up = new THREE.Vector3(0, 1, 0));
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1) - 0.5;                     // -0.5 .. 0.5
      const th = u * 2 * spread + u * 0.55 * (1 - k);  // 折叠时收成一束窄叶
      const l = L * (1 - Math.abs(u) * 0.25 * k);      // 叶形：中间长、两侧短
      const droop = Math.pow(Math.abs(u) * 2, 1.5) * 0.6 * k;   // 两侧翼尖下垂，形成伞面弧度
      const tip = [Math.sin(th) * l, Math.cos(th) * l, droop];
      const r = this.ribs[i];
      v.set(tip[0], tip[1], tip[2]);
      const len = v.length();
      r.quaternion.setFromUnitVectors(up, v.normalize()); r.scale.set(1, len, 1);
      tips.push(tip);
    }
    const pos = this.wing.geometry.attributes.position.array;
    let o = 0;
    for (let p = 0; p < N - 1; p++) {
      const a = tips[p], b = tips[p + 1];
      // 两根肋骨之间的外缘向外鼓出（叶片边缘的圆弧）
      const mx = (a[0] + b[0]) * 0.5, my = (a[1] + b[1]) * 0.5, ml = Math.hypot(mx, my) || 1;
      const R = Math.max(Math.hypot(a[0], a[1]), Math.hypot(b[0], b[1])) * (1 + 0.1 * k);
      const ex = (mx / ml) * R, ey = (my / ml) * R;
      const fz = (a[2] + b[2]) * 0.5 + Math.sin(t * 9 + p * 1.3) * 0.05 * flutter;
      const tri = [[0, 0, 0], [a[0], a[1], a[2]], [ex, ey, fz], [0, 0, 0], [ex, ey, fz], [b[0], b[1], b[2]]];
      for (const v of tri) { pos[o++] = v[0]; pos[o++] = v[1]; pos[o++] = v[2] - 0.01; }
    }
    this.wing.geometry.attributes.position.needsUpdate = true;
    this.wing.geometry.computeVertexNormals();
    // 折叠时竖在背包上、略向后仰；展开时轴心升到帽子上方并后移，
    // 扇面翻成接近水平（前缘略抬起），叶形翼面罩在头顶
    const e = k * k * (3 - 2 * k);
    // 折叠：贴在背包后面，叶尖止于肩下（不顶帽檐）
    this.glider.rotation.x = -0.08 + (1.3 + 0.08) * e;
    this.glider.position.set(0, 0.74 + 1.49 * e, -0.47 - 0.92 * e);
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
      lerpR(this.legs[0], 0.35); lerpR(this.legs[1], 0.2);
      lerpR(this.arms[0], -2.75); lerpR(this.arms[1], -2.75);
    } else {
      lerpR(this.legs[0], sw); lerpR(this.legs[1], -sw);
      lerpR(this.arms[0], -sw * 0.8 + (onTrain ? -0.2 : 0)); lerpR(this.arms[1], sw * 0.8);
    }
    // 呼吸、走路起伏、跑步时身体前倾
    this.body.position.y = moving ? Math.abs(Math.sin(this.phase)) * 0.06 : Math.sin(t * 2) * 0.008;
    this.body.rotation.x += ((moving ? Math.min(speed * 0.012, 0.1) : gliding ? 0.25 : 0) - this.body.rotation.x) * k;
    // 待机时偶尔四处张望；乘车时看向窗外
    this.lookT -= dt;
    if (this.lookT <= 0) { this.lookT = 2.5 + Math.random() * 4; this.lookYaw = moving || gliding ? 0 : (Math.random() - 0.5) * 1.1; }
    const yawT = onTrain ? Math.sin(t * 0.4) * 0.5 : this.lookYaw;
    this.head.rotation.y += (yawT - this.head.rotation.y) * (1 - Math.exp(-3 * dt));
    this.head.rotation.x = gliding ? -0.25 : Math.sin(t * 1.1) * 0.02;
    // 眨眼
    this.blinkT -= dt;
    if (this.blinkT <= 0) this.blinkT = 2.2 + Math.random() * 3.5;
    this.eyes.scale.y = this.blinkT < 0.12 ? 0.15 : 1;

    // 风：速度越快、滑翔或腾空时越强
    const wind = gliding ? 1 : !grounded ? 0.7 : Math.min(speed * 0.09, 0.75) + 0.08;
    // 帽子飘带、围巾飘带
    this.hatTails.forEach((g, i) => { g.rotation.x = -0.3 - wind * 0.9 + Math.sin(t * (5 + i) + i) * (0.08 + wind * 0.25); });
    this.scarfTail.rotation.x = -wind * 1.1 + Math.sin(t * 7) * (0.05 + wind * 0.2);
    this.scarfTail.rotation.z = Math.sin(t * 3.1) * 0.1;
    // 披风：顶点按高度向后扬起并起伏（越往下摆幅越大）
    const p = this.capeMesh.geometry.attributes.position, base = this.capeBase;
    const flare = wind * 0.45, f = gliding ? 11 : 6;
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
      const d = Math.min(1, -y / 0.74), w = d * d;
      const back = (flare + 0.02) * w * (z < 0 ? 1 : 0.5);
      const wave = Math.sin(t * f + x * 7 + d * 5) * (0.012 + wind * 0.05) * w;
      p.setXYZ(i, x * (1 + w * wind * 0.15), y + back * 0.35, z - back + wave);
    }
    p.needsUpdate = true;
    this.capeMesh.geometry.computeVertexNormals();
    // 滑翔翼：展开 / 折叠
    this.gliderOpen += ((gliding ? 1 : 0) - this.gliderOpen) * (1 - Math.exp(-6 * dt));
    const gk = this.gliderOpen < 0.002 ? 0 : this.gliderOpen;
    if (gk > 0 || this._gk !== 0) this.updateWing(gk, t, gliding ? 1 : 0);
    this._gk = gk;
    this.glider.rotation.z = gliding ? Math.sin(t * 1.3) * 0.05 + (s.bank ?? 0) : 0;
  }
}
