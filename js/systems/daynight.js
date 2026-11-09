// ============================================================
// 世界时间与昼夜
// - 一个游戏日默认 48 分钟（可调），太阳沿倾斜弧线连续运动
// - 天空、云海、雾、半球光、太阳/月光的颜色与强度按太阳高度插值
// - 夜晚：星星、月亮、窗灯与路灯变亮，列车开灯
// - 时间预设：清晨 / 正午 / 黄昏 / 夜晚 / 自动循环
// ============================================================
import * as THREE from 'three';
import { G, MATS } from '../core/materials.js';
import { smoothstep } from '../core/utils.js';

const C = (h) => new THREE.Color(h);
// 三组关键色：夜 / 晨昏 / 白天
const KEY = {
  zenith: [C(0x1c2747), C(0x7290c2), C(0x86acd6)],
  mid: [C(0x2c3a62), C(0xb4aed2), C(0xa9c6e4)],
  horizon: [C(0x46507a), C(0xf4c4a2), C(0xeee4d4)],
  warm: [C(0x55557e), C(0xf29a74), C(0xf4d7b4)],
  below: [C(0x262c4c), C(0xb79cb8), C(0xc3c6dc)],
  fog: [C(0x3a4468), C(0xd9bfb6), C(0xd6dcea)],
  haze: [C(0x414a70), C(0xdcc2bc), C(0xd9dfee)],
  seaLight: [C(0x8a93bc), C(0xffe2cc), C(0xfbf6ee)],
  seaShadow: [C(0x434b70), C(0xb398b8), C(0xb3b5d3)],
  hemiSky: [C(0x5a6aa0), C(0xe2c0c8), C(0xcfe0f2)],
  hemiGround: [C(0x3a3450), C(0xb8968a), C(0xcbb89c)],
  sun: [C(0xa8b8e8), C(0xffae78), C(0xffecd0)],
  cloud: [C(0x7f88b0), C(0xffd6c0), C(0xfffaf2)],
};
const PRESET = { dawn: 0.265, noon: 0.5, dusk: 0.735, night: 0.95 };

export class DayNight {
  constructor({ scene, hemi, sun, renderer, sky, sea, clouds }) {
    Object.assign(this, { scene, hemi, sun, renderer, skyMesh: sky, sea, clouds });
    this.dayLength = 48 * 60;           // 秒
    this.t = 0.6;                         // 一天中的比例：0.25 日出，0.5 正午，0.75 日落
    this.auto = true;
    this.speed = 1;
    this.sunDir = G.sunDir.value;
    this.lightDir = new THREE.Vector3();  // 投射阴影的光源方向（白天=太阳，夜晚=月亮）
    this.moonDir = new THREE.Vector3();
    this.night = 0; this.dusk = 0; this.elev = 0.5;
    this.lamps = [];                      // 额外随夜晚变亮的材质 { mat, day, night, prop }
    this._c = new THREE.Color();
    // 日出东方、日落西南方（天空之城一侧）
    this.W = new THREE.Vector3(-0.42, 0, -0.9).normalize();
    this.S = new THREE.Vector3(-this.W.z, 0, this.W.x);
    const u = this.skyMesh.material.uniforms;
    u.uNight = { value: 0 }; u.uMoon = { value: this.moonDir };
    this.patchSky();
    this.update(0);
  }

  /** 给天空 shader 加上星星与月亮 */
  patchSky() {
    const m = this.skyMesh.material;
    m.fragmentShader = m.fragmentShader
      .replace('uniform float uTime;', 'uniform float uTime; uniform float uNight; uniform vec3 uMoon;')
      .replace('gl_FragColor = vec4(col, 1.0);', `
        // 星星：按球面经纬网格散布，轻微闪烁
        vec2 sp = vec2(atan(d.z, d.x) * 95.0, asin(clamp(d.y, -1.0, 1.0)) * 95.0);
        vec2 cell = floor(sp); vec2 fr = fract(sp) - 0.5;
        float hs = h21(cell);
        float star = step(0.93, hs) * smoothstep(0.16, 0.0, length(fr + (vec2(h21(cell + 3.1), h21(cell + 7.7)) - 0.5) * 0.6));
        star *= 0.6 + 0.4 * sin(uTime * (1.5 + hs * 3.0) + hs * 40.0);
        col += vec3(1.0, 0.96, 0.88) * star * uNight * smoothstep(0.02, 0.25, h) * (1.0 - streak * 0.8);
        // 月亮 + 光晕
        float md = max(dot(d, uMoon), 0.0);
        float disc = smoothstep(0.99955, 0.9997, md);
        float crater = 0.85 + 0.15 * fbm(d.xy * 400.0);
        col = mix(col, vec3(0.98, 0.96, 0.9) * crater, disc * uNight);
        col += vec3(0.55, 0.62, 0.85) * pow(md, 60.0) * 0.35 * uNight;
        gl_FragColor = vec4(col, 1.0);`);
    m.needsUpdate = true;
  }

  setPreset(name) {
    if (name === 'auto') { this.auto = true; return; }
    if (PRESET[name] !== undefined) { this.t = PRESET[name]; this.auto = false; this.update(0); }
  }
  get hours() { return (this.t * 24) % 24; }
  get clock() { const h = this.hours; return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`; }

  pick(key, out) {
    const [n, d, day] = KEY[key];
    out.copy(n).lerp(d, smoothstep(-0.22, -0.02, this.elev));
    return out.lerp(day, smoothstep(0.04, 0.38, this.elev));
  }

  update(dt) {
    if (this.auto) this.t = (this.t + (dt * this.speed) / this.dayLength) % 1;
    const th = (this.t - 0.25) * Math.PI * 2;
    // 太阳方向：东→天顶偏南→西南
    this.sunDir.copy(this.W).multiplyScalar(-Math.cos(th) * 0.92).addScaledVector(this.S, 0.32).add(new THREE.Vector3(0, Math.sin(th) * 0.9, 0)).normalize();
    this.moonDir.copy(this.sunDir).multiplyScalar(-1); this.moonDir.y = Math.abs(this.moonDir.y) * 0.8 + 0.25; this.moonDir.normalize();
    this.elev = this.sunDir.y;
    this.night = 1 - smoothstep(-0.2, 0.02, this.elev);
    this.dusk = (1 - smoothstep(0.05, 0.4, Math.abs(this.elev - 0.05))) * (1 - this.night * 0.6);
    const c = this._c;

    const su = this.skyMesh.material.uniforms;
    this.pick('zenith', su.uZenith.value); this.pick('mid', su.uMid.value); this.pick('horizon', su.uHorizon.value);
    this.pick('warm', su.uWarm.value); this.pick('below', su.uBelow.value);
    su.uSunCol.value.copy(KEY.sun[2]).lerp(KEY.sun[1], this.dusk).multiplyScalar(1 - this.night);
    su.uNight.value = this.night;
    this.pick('fog', G.fogColor.value);
    if (this.scene.fog) this.scene.fog.color.copy(G.fogColor.value);
    this.pick('haze', G.hazeColor.value);
    const sea = this.sea.material.uniforms;
    this.pick('seaLight', sea.uLight.value); this.pick('seaShadow', sea.uShadow.value);
    sea.uWarm.value.copy(su.uWarm.value);
    if (this.clouds?.mesh) this.pick('cloud', this.clouds.mesh.material.uniforms.uTint.value);

    // 灯光：白天太阳，夜晚月光（偏蓝、较弱）
    this.pick('hemiSky', this.hemi.color); this.pick('hemiGround', this.hemi.groundColor);
    this.hemi.intensity = 0.55 + (1 - this.night) * 0.7;
    const sunUp = smoothstep(-0.04, 0.12, this.elev);
    if (sunUp > 0.01) {
      this.lightDir.copy(this.sunDir);
      this.pick('sun', this.sun.color);
      this.sun.intensity = 0.4 + 1.9 * sunUp * (1 - this.dusk * 0.3);
    } else {
      this.lightDir.copy(this.moonDir);
      this.sun.color.copy(KEY.sun[0]);
      this.sun.intensity = 0.55 * this.night;
    }
    // 夜灯
    const lampK = 0.8 + this.night * 0.75 + this.dusk * 0.2;
    const mats = MATS();
    mats.glow.color.setScalar(lampK);
    mats.hazeGlow.color.setScalar(0.8 + this.night * 0.9);
    for (const l of this.lamps) {
      const v = l.day + (l.night - l.day) * Math.max(this.night, this.dusk * 0.4);
      if (l.prop === 'opacity') l.mat.opacity = v; else if (l.prop === 'scalar') l.mat.color.setScalar(v); else l.mat[l.prop] = v;
    }
    G.lightTint.value.setRGB(1, 1, 1).lerp(c.setRGB(1.0, 0.82, 0.72), this.dusk * 0.7).lerp(c.setRGB(0.36, 0.42, 0.62), this.night);
    this.renderer.toneMappingExposure = 1.0 - this.night * 0.08;
  }
}
