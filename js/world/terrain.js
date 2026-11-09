// ============================================================
// Island：漂浮空岛
//  - 不规则边缘 rim(θ)
//  - 顶面高度场 localHeight(x,z)（网格生成与角色碰撞共用同一函数）
//  - 下方倒锥形漂浮岩层（分层色带、低多边形切面）
// ============================================================
import * as THREE from 'three';
import { Noise2D, mulberry32 } from '../core/noise.js';
import { smoothstep, distSeg, densify } from '../core/utils.js';
import { wc } from '../core/materials.js';
import { PALETTE as P } from '../config.js';

const _c = new THREE.Color();
const ROCK = [P.soil, P.rose, P.rockBlue, P.rockDeep].map((h) => new THREE.Color(h));

export class Island {
  constructor(cfg, theme = {}) {
    this.cfg = cfg;
    this.theme = theme;
    this.id = cfg.id;
    this.name = cfg.name;
    this.center = new THREE.Vector3(...cfg.center);
    this.R = cfg.radius;
    this.depth = cfg.depth;
    this.hill = cfg.hill ?? 2;
    this.noise = new Noise2D(cfg.seed);
    this.rand = mulberry32(cfg.seed * 7 + 3);
    this.flats = [];   // 平整区 {x,z,r,blend,h}
    this.keep = [];    // 禁止散布区 {x,z,r}
    this.paths = [];   // 石板小径（细分后的点列）
    this.streams = []; // 溪流
    this.shades = [];  // 树荫（草地着色）
    this.maxRim = this.R * 1.2;
    this.group = new THREE.Group();
    this.group.position.copy(this.center);
    this.group.name = 'island:' + this.id;
    const r = mulberry32(cfg.seed + 99);
    this.tipOff = [(r() - 0.5) * this.R * 0.5, (r() - 0.5) * this.R * 0.5];
  }

  // 岛缘半径（随角度起伏）
  rim(th) {
    const c = Math.cos(th), s = Math.sin(th), n = this.noise;
    return this.R * (1 + 0.11 * n.noise(c * 1.2 + 5, s * 1.2 + 5) + 0.05 * n.noise(c * 3 + 11, s * 3 + 11));
  }

  baseHeight(x, z) {
    let h = this.noise.fbm(x * 0.018 + 3, z * 0.018 + 7, 4) * this.hill * 2;
    if (this.theme.shape) h += this.theme.shape(this, x, z);
    return h;
  }

  surfaceH(x, z, t) {
    let h = this.baseHeight(x, z);
    for (const f of this.flats) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < f.r + f.blend) h += (f.h - h) * (1 - smoothstep(f.r, f.r + f.blend, d));
    }
    if (this.streams.length) {
      const sd = this.streamDist(x, z);
      if (sd < 2.2) h -= (1 - sd / 2.2) * 0.45;
    }
    const e = smoothstep(0.86, 1.0, t);
    return h - e * e * 2.0; // 边缘圆润下垂
  }

  /** 局部坐标高度；岛外返回 null */
  localHeight(x, z) {
    const d = Math.hypot(x, z);
    if (d > this.maxRim) return null;
    const rr = this.rim(Math.atan2(z, x));
    if (d > rr) return null;
    return this.surfaceH(x, z, d / rr);
  }

  // —— 物理表面适配 ——
  contains2(x, z) { return Math.abs(x - this.center.x) < this.maxRim && Math.abs(z - this.center.z) < this.maxRim; }
  heightAt(x, z) {
    const h = this.localHeight(x - this.center.x, z - this.center.z);
    return h === null ? null : h + this.center.y;
  }
  get thickness() { return 8; }

  // —— 布置辅助 ——
  addPath(points, width = 1.6) { this.paths.push({ pts: densify(points, 1), w: width }); }
  addStream(points) { this.streams.push(densify(points, 1)); }

  pathDist(x, z) {
    let best = 1e9;
    for (const p of this.paths) {
      const pts = p.pts;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        if (Math.abs(a[0] - x) > 6 || Math.abs(a[1] - z) > 6) continue;
        const d = distSeg(x, z, a[0], a[1], pts[i + 1][0], pts[i + 1][1]) - (p.w - 1.6);
        if (d < best) best = d;
      }
    }
    return best;
  }
  streamDist(x, z) {
    let best = 1e9;
    for (const pts of this.streams) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        if (Math.abs(a[0] - x) > 5 || Math.abs(a[1] - z) > 5) continue;
        const d = distSeg(x, z, a[0], a[1], pts[i + 1][0], pts[i + 1][1]);
        if (d < best) best = d;
      }
    }
    return best;
  }
  shadeAt(x, z) {
    let s = 0;
    for (const c of this.shades) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r) s = Math.max(s, (1 - smoothstep(c.r * 0.5, c.r, d)) * c.k);
    }
    return s;
  }
  /** 树冠投影，用于草地暗部 */
  addShade(x, z, h, r, k = 0.5) {
    const sun = this._sun || (this._sun = [0.55 / 0.52, 0.65 / 0.52]);
    this.shades.push({ x: x + sun[0] * h * 0.6, z: z + sun[1] * h * 0.6, r: r * 1.3, k });
  }
  isFree(x, z, clear = 0, pathClear = 2.2) {
    for (const k of this.keep) if (Math.hypot(x - k.x, z - k.z) < k.r + clear) return false;
    if (this.paths.length && this.pathDist(x, z) < pathClear) return false;
    if (this.streams.length && this.streamDist(x, z) < 2.0) return false;
    return true;
  }
  randomPoint(maxT = 0.9, r = this.rand) {
    const th = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * this.rim(th) * maxT;
    return [Math.cos(th) * d, Math.sin(th) * d];
  }
  /** 岛缘点（局部） */
  rimPoint(th, inset = 0) {
    const rr = this.rim(th) - inset;
    return [Math.cos(th) * rr, Math.sin(th) * rr];
  }

  // —— 网格生成 ——
  defaultColor(x, z, h, t, out) {
    const n = this.noise.fbm(x * 0.05, z * 0.05, 3);
    out.set(P.sage).lerp(_c.set(P.sageLight), smoothstep(-0.3, 0.5, n));
    return out;
  }

  buildTop(J = 30, S = 120) {
    const pos = [], col = [], idx = [];
    const colorFn = this.theme.color ? (x, z, h, t, o) => this.theme.color(this, x, z, h, t, o) : this.defaultColor.bind(this);
    const out = new THREE.Color();
    const push = (x, z, t) => {
      const h = this.surfaceH(x, z, t);
      pos.push(x, h, z);
      colorFn(x, z, h, t, out);
      // 小径与溪流叠色
      if (this.paths.length) {
        const pd = this.pathDist(x, z);
        if (pd < 2.4) out.lerp(_c.set(this.cfg.pathColor ?? 0xd8c7a3), (1 - smoothstep(1.2, 2.4, pd)) * 0.85);
      }
      if (this.streams.length) {
        const sd = this.streamDist(x, z);
        if (sd < 2.0) out.lerp(_c.set(P.water), 1 - smoothstep(0.9, 2.0, sd));
      }
      if (t > 0.93) out.lerp(_c.set(P.soil), smoothstep(0.93, 1.0, t) * 0.35);
      col.push(out.r, out.g, out.b);
    };
    push(0, 0, 0);
    for (let j = 1; j <= J; j++) {
      const f = j / J;
      for (let i = 0; i < S; i++) {
        const th = (i / S) * Math.PI * 2, rr = this.rim(th);
        push(Math.cos(th) * rr * f, Math.sin(th) * rr * f, f);
      }
    }
    for (let i = 0; i < S; i++) idx.push(0, 1 + ((i + 1) % S), 1 + i);
    for (let j = 1; j < J; j++) {
      const r0 = 1 + (j - 1) * S, r1 = 1 + j * S;
      for (let i = 0; i < S; i++) {
        const a = r0 + i, b = r0 + ((i + 1) % S), c = r1 + i, d = r1 + ((i + 1) % S);
        idx.push(a, d, c, a, b, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  buildRock(K = 14, S = 120, palette = ROCK) {
    const pos = [], col = [], idx = [];
    const n = this.noise, D = this.depth;
    const [ox, oz] = this.tipOff;
    const c = new THREE.Color();
    const rockColor = (t, y, th) => {
      const band = Math.sin(y * 0.35 + n.noise(Math.cos(th) * 2, Math.sin(th) * 2) * 2) * 0.5 + 0.5;
      const k = Math.min(t * 3, 2.999);
      const i = Math.floor(k);
      c.copy(palette[i]).lerp(palette[i + 1], k - i);
      c.multiplyScalar(0.9 + band * 0.18);
      return c;
    };
    for (let k = 0; k <= K; k++) {
      const t = k / K;
      for (let i = 0; i < S; i++) {
        const th = (i / S) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th), rr = this.rim(th);
        let x, y, z;
        if (k === 0) {
          x = cs * rr; z = sn * rr; y = this.surfaceH(x, z, 1);
        } else {
          const n1 = n.noise(cs * 1.8 + t * 2.5 + 30, sn * 1.8 - t * 2.5);
          const n2 = n.noise(cs * 4.2 + t * 7 + 20, sn * 4.2 - t * 5);
          let prof = Math.pow(1 - t, 1.25) * (0.94 + 0.22 * n1 + 0.1 * n2);
          if (k === 1) prof = 0.97;
          const yy = k === 1 ? this.surfaceH(cs * rr, sn * rr, 1) - 3.5 : -D * t * (1 + 0.18 * n1);
          x = cs * rr * prof + ox * t * t; z = sn * rr * prof + oz * t * t; y = yy;
        }
        pos.push(x, y, z);
        rockColor(t, y, th);
        col.push(c.r, c.g, c.b);
      }
    }
    const tip = pos.length / 3;
    pos.push(ox, -D * 1.08, oz);
    c.copy(palette[3]); col.push(c.r, c.g, c.b);
    for (let k = 0; k < K; k++) {
      const r0 = k * S, r1 = (k + 1) * S;
      for (let i = 0; i < S; i++) {
        const a = r0 + i, b = r0 + ((i + 1) % S), cc = r1 + i, d = r1 + ((i + 1) % S);
        idx.push(a, b, cc, b, d, cc);
      }
    }
    for (let i = 0; i < S; i++) idx.push(K * S + i, K * S + ((i + 1) % S), tip);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /** 生成主网格并加入 group */
  buildMeshes(opts = {}) {
    const top = new THREE.Mesh(this.buildTop(opts.J, opts.S), wc({ vertexColors: true, grain: 1.2 }));
    top.receiveShadow = true;
    top.castShadow = true;
    const rock = new THREE.Mesh(this.buildRock(opts.K, opts.S, opts.palette), wc({ vertexColors: true, flat: true }));
    this.group.add(top, rock);
    this.topMesh = top; this.rockMesh = rock;
  }
}
