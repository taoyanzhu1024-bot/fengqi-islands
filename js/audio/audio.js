// ============================================================
// 音频系统（Web Audio 实时合成）
// - 所有声音都由代码合成，没有使用任何第三方录音素材（见 docs/AUDIO.md）
// - 首次用户手势后才创建/恢复 AudioContext（浏览器自动播放策略）
// - 四个通道：主音量 / 背景音乐 / 环境音 / 音效，设置保存在 localStorage
// - 页面隐藏时淡出，返回时淡入
// ============================================================

const KEY = 'fengqi.audio.v1';
const DEFAULTS = { enabled: true, master: 0.8, music: 0.45, ambient: 0.7, sfx: 0.8 };

// 五声音阶（以 MIDI 音高表示）
const SCALES = {
  main: [60, 62, 64, 67, 69], flower: [65, 67, 69, 72, 74], port: [62, 64, 66, 69, 71],
  forest: [57, 60, 62, 64, 67], lighthouse: [55, 57, 59, 62, 64], snow: [62, 65, 67, 69, 72],
  sky: [60, 62, 65, 67, 70], city: [64, 66, 68, 71, 73], night: [57, 60, 62, 65, 67],
};
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioManager {
  constructor() {
    this.settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    this.ctx = null;
    this.ready = false;
    this.state = 'locked';          // locked | running | suspended | unsupported
    this.loops = {};
    this.env = { region: 'main', speed: 0, onTrain: false, interior: 0.6, trainSpeed: 0, night: 0, waterfall: 0, glide: 0, wind: 0 };
    this.nextBird = 2; this.nextChime = 4; this.nextNote = 0; this.beat = 0; this.clackAcc = 0;
    this.errors = [];
    this._unlock = () => this.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, this._unlock, { passive: true });
    document.addEventListener('visibilitychange', () => this.applyVolumes());
  }

  save() { localStorage.setItem(KEY, JSON.stringify(this.settings)); this.applyVolumes(); }
  set(k, v) { this.settings[k] = v; this.save(); }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { this.state = 'unsupported'; return; }
        this.ctx = new AC();
        this.build();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch((e) => this.errors.push(String(e)));
      this.state = this.ctx.state;
      if (this.ctx.state === 'running') {
        for (const ev of ['pointerdown', 'keydown', 'touchstart']) removeEventListener(ev, this._unlock);
      }
    } catch (e) { this.errors.push(String(e)); this.state = 'unsupported'; }
  }

  // ---------------- 音频图 ----------------
  build() {
    const c = this.ctx;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3;
    this.master.connect(comp).connect(c.destination);
    this.bus = {};
    for (const k of ['music', 'ambient', 'sfx']) { this.bus[k] = c.createGain(); this.bus[k].connect(this.master); }
    // 列车声单独一条：车厢内视角时低通（闷一些），外部视角时更亮
    this.trainFilter = c.createBiquadFilter(); this.trainFilter.type = 'lowpass'; this.trainFilter.frequency.value = 1800;
    this.trainBus = c.createGain(); this.trainFilter.connect(this.trainBus).connect(this.bus.sfx);
    // 音乐混响（简单的反馈延迟）
    this.delay = c.createDelay(1.5); this.delay.delayTime.value = 0.42;
    const fb = c.createGain(); fb.gain.value = 0.32;
    const wet = c.createGain(); wet.gain.value = 0.35;
    this.delay.connect(fb).connect(this.delay); this.delay.connect(wet).connect(this.bus.music);

    this.noise = this.makeNoise(3);
    this.loops.wind = this.noiseLoop('bandpass', 420, 0.6, this.bus.ambient);
    this.loops.gust = this.noiseLoop('bandpass', 1100, 1.2, this.bus.ambient);
    this.loops.leaves = this.noiseLoop('highpass', 3200, 0.7, this.bus.ambient);
    this.loops.water = this.noiseLoop('lowpass', 900, 0.5, this.bus.ambient);
    this.loops.snow = this.noiseLoop('bandpass', 780, 3, this.bus.ambient);
    this.loops.rumble = this.noiseLoop('lowpass', 140, 0.8, this.trainFilter);
    this.loops.rail = this.noiseLoop('bandpass', 2400, 4, this.trainFilter);
    this.loops.glide = this.noiseLoop('bandpass', 650, 0.9, this.bus.sfx);
    this.loops.prop = this.oscLoop('sawtooth', 48, 260, this.bus.sfx);
    // 夜间虫鸣：高频正弦 + 调幅
    this.loops.insects = this.insectLoop(this.bus.ambient);
    // 背景铺底和弦
    this.pad = this.padLoop(this.bus.music);
    this.ready = true;
    this.applyVolumes();
  }

  makeNoise(sec) {
    const c = this.ctx, b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.5 + last * 3; }
    return b;
  }
  noiseLoop(type, freq, q, dest) {
    const c = this.ctx, src = c.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(dest); src.start();
    return { g, f };
  }
  oscLoop(type, freq, lp, dest) {
    const c = this.ctx, o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = c.createGain(); g.gain.value = 0;
    o.connect(f).connect(g).connect(dest); o.start();
    return { g, f, o };
  }
  insectLoop(dest) {
    const c = this.ctx, o = c.createOscillator(); o.frequency.value = 4300;
    const am = c.createOscillator(); am.frequency.value = 23;
    const amG = c.createGain(); amG.gain.value = 0.5;
    const g = c.createGain(); g.gain.value = 0;
    const v = c.createGain(); v.gain.value = 0.5;
    am.connect(amG).connect(v.gain);
    o.connect(v).connect(g).connect(dest); o.start(); am.start();
    return { g };
  }
  padLoop(dest) {
    const c = this.ctx, g = c.createGain(); g.gain.value = 0.0;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    f.connect(g).connect(dest);
    const oscs = [0, 1, 2].map((i) => { const o = c.createOscillator(); o.type = 'triangle'; o.detune.value = (i - 1) * 6; o.connect(f); o.start(); return o; });
    return { g, f, oscs };
  }

  applyVolumes() {
    if (!this.ready) return;
    const s = this.settings, t = this.ctx.currentTime;
    const hidden = document.hidden ? 0.0 : 1;
    this.master.gain.setTargetAtTime(s.enabled ? s.master * hidden : 0, t, 0.25);
    this.bus.music.gain.setTargetAtTime(s.music, t, 0.2);
    this.bus.ambient.gain.setTargetAtTime(s.ambient, t, 0.2);
    this.bus.sfx.gain.setTargetAtTime(s.sfx, t, 0.2);
  }

  // ---------------- 一次性音效 ----------------
  env_(g, t, a, peak, d) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  tone(freq, { type = 'sine', a = 0.005, d = 0.4, vol = 0.2, dest, when = 0, glide = 0, detune = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t + a + d);
    this.env_(g, t, a, vol, d);
    o.connect(g).connect(dest ?? this.bus.sfx);
    o.start(t); o.stop(t + a + d + 0.05);
  }
  burst(freq, { type = 'bandpass', q = 1, a = 0.002, d = 0.12, vol = 0.3, dest, when = 0, sweep = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + when;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + a + d);
    const g = c.createGain(); this.env_(g, t, a, vol, d);
    src.connect(f).connect(g).connect(dest ?? this.bus.sfx);
    src.start(t, Math.random() * 2); src.stop(t + a + d + 0.05);
  }
  bell(freq, vol = 0.12, dest) {
    // 钟/风铃：非谐波泛音
    for (const [m, v, d] of [[1, 1, 2.2], [2.76, 0.4, 1.4], [5.4, 0.2, 0.8], [8.9, 0.08, 0.5]])
      this.tone(freq * m, { vol: vol * v, d, a: 0.003, dest });
  }

  sfx(name, opt = {}) {
    if (!this.ready || this.ctx.state !== 'running') return;
    (this.stats ||= {})[name] = (this.stats[name] || 0) + 1; // 测试统计
    const T = this.trainFilter;
    switch (name) {
      case 'step': {
        const s = opt.surface;
        if (s === 'stone') this.burst(2600, { q: 2, d: 0.05, vol: 0.18 });
        else if (s === 'wood') { this.burst(900, { q: 3, d: 0.06, vol: 0.2 }); this.tone(180, { d: 0.05, vol: 0.05 }); }
        else if (s === 'snow') this.burst(1400, { type: 'lowpass', d: 0.12, vol: 0.16, sweep: 0.5 });
        else this.burst(1800, { type: 'highpass', q: 0.5, d: 0.07, vol: 0.09 });
        break;
      }
      case 'jump': this.burst(700, { d: 0.18, vol: 0.12, sweep: 2.2 }); break;
      case 'land': this.burst(300, { type: 'lowpass', d: 0.15, vol: 0.3 }); this.tone(90, { d: 0.12, vol: 0.12 }); break;
      case 'glideOpen': this.burst(500, { q: 0.7, a: 0.05, d: 0.5, vol: 0.25, sweep: 3 }); this.burst(3000, { type: 'highpass', a: 0.01, d: 0.12, vol: 0.12, when: 0.1 }); break;
      case 'glideClose': this.burst(1500, { q: 0.8, a: 0.02, d: 0.3, vol: 0.15, sweep: 0.4 }); break;
      case 'updraft': this.burst(400, { q: 0.6, a: 0.3, d: 1.2, vol: 0.2, sweep: 2.5 }); break;
      case 'interact': this.tone(988, { d: 0.25, vol: 0.08 }); this.tone(1319, { d: 0.35, vol: 0.06, when: 0.08 }); break;
      case 'pickup': [0, 4, 7, 12].forEach((s, i) => this.tone(midi(72 + s), { d: 0.4, vol: 0.06, when: i * 0.07 })); break;
      case 'whistle': {
        for (const [f, v] of [[587, 0.09], [740, 0.07], [880, 0.05]]) this.tone(f, { type: 'triangle', a: 0.08, d: 1.1, vol: v, dest: this.bus.sfx });
        this.burst(2200, { q: 0.6, a: 0.05, d: 1.0, vol: 0.06 });
        break;
      }
      case 'brake': this.burst(3800, { q: 6, a: 0.2, d: 1.6, vol: 0.06, dest: T, sweep: 0.7 }); break;
      case 'arrive': this.bell(midi(79), 0.1); this.bell(midi(76), 0.1, undefined); setTimeout(() => this.ready && this.bell(midi(72), 0.1), 420); break;
      case 'door': this.burst(600, { q: 1, a: 0.03, d: 0.35, vol: 0.12, sweep: 1.8 }); this.tone(320, { d: 0.08, vol: 0.06, when: 0.36 }); break;
      case 'clack': this.burst(1200, { q: 2, d: 0.04, vol: 0.12 * (opt.vol ?? 1), dest: T }); this.tone(110, { d: 0.05, vol: 0.05 * (opt.vol ?? 1), dest: T }); break;
      case 'railForm': // 云轨升起的魔法音
        [0, 7, 12, 16].forEach((s, i) => this.tone(midi(67 + s), { d: 1.2, vol: 0.025 * (opt.vol ?? 1), when: i * 0.09, detune: 6 }));
        break;
      case 'bird': {
        const base = 2400 + Math.random() * 1600;
        const n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) this.tone(base * (1 + Math.random() * 0.2), { d: 0.08, vol: 0.035, when: i * 0.13, glide: 0.7 + Math.random() * 0.6, dest: this.bus.ambient });
        break;
      }
      case 'chime': { const s = SCALES.snow; for (let i = 0; i < 3; i++) this.bell(midi(s[Math.floor(Math.random() * 5)] + 24), 0.025); break; }
      case 'whale': {
        // 云鲸：低沉、缓慢滑音 + 轻微颤音
        const c = this.ctx, t = c.currentTime, v = opt.vol ?? 0.5;
        for (const [f0, f1, k] of [[110, 70, 1], [220, 150, 0.35], [330, 260, 0.12]]) {
          const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
          o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + 3.2);
          lfo.frequency.value = 5; lg.gain.value = f0 * 0.01; lfo.connect(lg).connect(o.frequency);
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12 * k * v, t + 1.0); g.gain.linearRampToValueAtTime(0, t + 3.6);
          o.connect(g).connect(this.bus.ambient); o.start(t); lfo.start(t); o.stop(t + 3.8); lfo.stop(t + 3.8);
        }
        break;
      }
      case 'splash': this.burst(500, { type: 'lowpass', a: 0.4, d: 2.5, vol: 0.25 * (opt.vol ?? 1), sweep: 0.4 }); break;
    }
  }

  // ---------------- 每帧更新 ----------------
  update(dt, e) {
    if (!this.ready || this.ctx.state !== 'running') return;
    Object.assign(this.env, e);
    const v = this.env, t = this.ctx.currentTime, L = this.loops;
    const set = (node, val, tc = 0.4) => node.gain.setTargetAtTime(val, t, tc);
    const high = v.altitude > 300 ? 1 : 0.6;
    set(L.wind.g, 0.05 + 0.04 * high + v.glide * 0.08);
    L.wind.f.frequency.setTargetAtTime(380 + Math.sin(t * 0.13) * 90, t, 1);
    set(L.gust.g, Math.max(0, Math.sin(t * 0.21) * Math.sin(t * 0.07)) * 0.04 + v.glide * 0.05);
    set(L.leaves.g, v.region === 'sky' || v.onTrain ? 0 : 0.012 + Math.min(v.speed, 8) * 0.004);
    set(L.water.g, Math.min(0.22, v.waterfall * 0.25));
    set(L.snow.g, v.region === 'snow' ? 0.07 : 0);
    L.snow.f.frequency.setTargetAtTime(700 + Math.sin(t * 0.5) * 250, t, 0.5);
    set(L.insects.g, v.region === 'forest' ? 0.006 + v.night * 0.012 : v.night * 0.004 * (v.region === 'sky' ? 0 : 1));
    const sp = Math.min(v.trainSpeed / 24, 1);
    const near = v.onTrain ? 1 : v.trainNear ?? 0;
    set(L.rumble.g, sp * 0.28 * near, 0.3);
    set(L.rail.g, sp * 0.03 * near, 0.3);
    this.trainFilter.frequency.setTargetAtTime(v.onTrain ? 600 + (1 - v.interior) * 3000 : 2500, t, 0.3);
    this.trainBus.gain.setTargetAtTime(v.onTrain ? 0.7 + (1 - v.interior) * 0.3 : 0.8, t, 0.3);
    set(L.glide.g, v.glide * 0.12, 0.3);
    set(L.prop.g, (v.propeller ?? 0) * 0.05, 0.4);
    // 车轮“咔哒”声：间隔随速度缩短
    if (sp > 0.05 && near > 0.05) {
      this.clackAcc += v.trainSpeed * dt;
      if (this.clackAcc > 13) { this.clackAcc = 0; this.sfx('clack', { vol: near * (0.5 + sp * 0.5) }); setTimeout(() => this.ready && this.sfx('clack', { vol: near * 0.6 }), 110); }
    }
    // 鸟鸣、风铃（白天、在岛上）
    this.nextBird -= dt; this.nextChime -= dt;
    if (this.nextBird <= 0) { this.nextBird = 3 + Math.random() * 7; if (v.night < 0.5 && v.region !== 'sky' && v.region !== 'snow') this.sfx('bird'); }
    if (this.nextChime <= 0) { this.nextChime = 6 + Math.random() * 10; if (v.region === 'snow' || v.region === 'main' || v.region === 'islet') this.sfx('chime'); }
    this.music(dt);
  }

  // 生成式背景音乐：柔和的拨弦琶音 + 铺底和弦（占位配乐，后续可替换为正式录音）
  music(dt) {
    const v = this.env, c = this.ctx, t = c.currentTime;
    const scale = v.night > 0.6 ? SCALES.night : SCALES[v.region] ?? SCALES.sky;
    const tempo = v.night > 0.6 ? 0.9 : v.onTrain ? 0.62 : 0.72;
    this.nextNote -= dt;
    if (this.nextNote > 0) return;
    this.nextNote = tempo;
    this.beat++;
    if (this.beat % 8 === 1) {
      const root = scale[Math.floor(Math.random() * 3)] - 12;
      [0, 7, 16].forEach((s, i) => this.pad.oscs[i].frequency.setTargetAtTime(midi(root + s), t, 1.5));
      this.pad.g.gain.setTargetAtTime(0.035, t, 2);
    }
    if (Math.random() < 0.62) {
      const n = scale[Math.floor(Math.random() * scale.length)] + (Math.random() < 0.3 ? 12 : 0);
      const dest = c.createGain(); dest.gain.value = 1; dest.connect(this.bus.music); dest.connect(this.delay);
      this.tone(midi(n), { type: 'triangle', a: 0.004, d: 1.6, vol: 0.05, dest });
      this.tone(midi(n) * 2, { type: 'sine', a: 0.004, d: 0.6, vol: 0.015, dest });
    }
  }
}
