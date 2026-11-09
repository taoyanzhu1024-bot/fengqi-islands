// ============================================================
// 极简 HUD：区域名、交互提示、列车信息、提示条、电影字幕、小地图
// ============================================================
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(world) {
    this.world = world;
    this.el = {
      region: $('region'), rName: document.querySelector('#region .name'), rSub: document.querySelector('#region .sub'),
      prompt: $('prompt'), train: $('trainInfo'), toast: $('toast'), letter: $('letterbox'),
      cTitle: document.querySelector('#caption .c-title'), cSub: document.querySelector('#caption .c-sub'),
      fade: $('fade'), keys: $('keys'), map: $('minimap'), loading: $('loading'), bar: document.querySelector('#loading .l-bar i'),
    };
    this.regionId = null;
    this.toastT = 0;
    this.mapT = 0;
    this.ctx = this.el.map.getContext('2d');
  }

  clock(text, phase) {
    if (text === this._clk) return;
    this._clk = text;
    (this._clkEl ||= document.getElementById('clock')).textContent = `${phase} · ${text}`;
  }
  progress(p) { this.el.bar.style.width = `${Math.round(p * 100)}%`; }
  ready() { this.el.loading.classList.add('done'); setTimeout(() => this.el.loading.remove(), 1600); this.buildMapBase(); }

  setRegion(id, name, sub) {
    if (id === this.regionId) return;
    this.regionId = id;
    const r = this.el.region;
    r.classList.remove('show');
    clearTimeout(this._rt);
    this._rt = setTimeout(() => { this.el.rName.textContent = name; this.el.rSub.textContent = sub; r.classList.add('show'); }, 350);
  }
  prompt(html) {
    if (html === this._p) return;
    this._p = html;
    this.el.prompt.innerHTML = html || '';
    this.el.prompt.classList.toggle('show', !!html);
  }
  trainInfo(html) {
    if (html === this._ti) return;
    this._ti = html;
    this.el.train.innerHTML = html || '';
    this.el.train.classList.toggle('show', !!html);
  }
  toast(text, dur = 3.5) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this.toastT = dur;
  }
  caption(title, sub) {
    this.el.cTitle.textContent = title || '';
    this.el.cSub.textContent = sub || '';
    const c = this.el.cTitle.parentElement;
    c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
  }
  cinematic(on) { this.el.letter.classList.toggle('on', on); document.body.classList.toggle('cine', on); }
  fade(on) { this.el.fade.classList.toggle('on', on); }
  toggleKeys() { this.el.keys.classList.toggle('hidden'); }

  // —— 小地图 ——
  bounds() { return { x0: -950, x1: 1250, z0: -1700, z1: 1000 }; }
  toMap(x, z) {
    const b = this.bounds(), W = this.el.map.width, H = this.el.map.height;
    const s = Math.min(W / (b.x1 - b.x0), H / (b.z1 - b.z0));
    const ox = (W - (b.x1 - b.x0) * s) / 2, oz = (H - (b.z1 - b.z0) * s) / 2;
    return [ox + (x - b.x0) * s, oz + (z - b.z0) * s, s];
  }
  buildMapBase() {
    const W = this.el.map.width, H = this.el.map.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    // 轨道
    for (const rl of this.world.rails) {
      g.strokeStyle = rl.isAir ? 'rgba(227,154,134,0.8)' : rl.closed ? 'rgba(205,165,80,0.95)' : 'rgba(150,170,200,0.95)';
      g.lineWidth = rl.isAir ? 1.4 : 2; g.setLineDash(rl.isAir ? [2, 4] : [5, 3]);
      g.beginPath();
      rl.samples.forEach((p, i) => { const [x, y] = this.toMap(p.x, p.z); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      if (rl.closed) g.closePath();
      g.stroke(); g.setLineDash([]);
    }
    // 岛屿
    for (const isl of this.world.all) {
      const [x, y, s] = this.toMap(isl.center.x, isl.center.z);
      g.fillStyle = isl.cfg.mapColor || '#c5d6a8';
      g.globalAlpha = 0.92;
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const th = (i / 40) * Math.PI * 2, r = isl.rim(th) * s;
        const px = x + Math.cos(th) * r, py = y + Math.sin(th) * r;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(110,100,130,0.35)'; g.lineWidth = 1; g.stroke();
    }
    g.font = '11px "Noto Serif SC","Songti SC",serif'; g.textAlign = 'center';
    for (const isl of this.world.islands) {
      const [x, y, s] = this.toMap(isl.center.x, isl.center.z);
      g.fillStyle = 'rgba(70,72,84,0.85)';
      g.fillText(isl.name, x, y + isl.R * s + 12);
    }
    for (const st of this.world.rails.flatMap((r) => r.stations)) {
      const [x, y] = this.toMap(st.pos.x, st.pos.z);
      g.fillStyle = '#fff8e8'; g.strokeStyle = '#b8903c'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    this.mapBase = c;
  }
  drawMap(player, train, castle) {
    if (!this.mapBase) return;
    const g = this.ctx, W = this.el.map.width, H = this.el.map.height;
    g.clearRect(0, 0, W, H);
    g.drawImage(this.mapBase, 0, 0);
    // 列车 / 飞艇
    for (const v of [].concat(train)) {
      if (!v) continue;
      const p = v.mapPos ?? v.cars[0].position;
      const [tx, ty] = this.toMap(p.x, p.z);
      g.fillStyle = v.mapColor ?? '#6f8f74'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      g.beginPath(); v.isAirship ? g.ellipse(tx, ty, 5, 3, 0, 0, Math.PI * 2) : g.rect(tx - 3.5, ty - 3.5, 7, 7); g.fill(); g.stroke();
    }
    // 玩家
    const [px, py] = this.toMap(player.pos.x, player.pos.z);
    g.save(); g.translate(px, py); g.rotate(-player.heading + Math.PI);
    g.fillStyle = '#e39a86'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(0, 2.5); g.lineTo(-4.5, 5); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }

  update(dt, player, train, castle) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.classList.remove('show'); }
    this.mapT -= dt;
    if (this.mapT <= 0) { this.mapT = 1 / 15; this.drawMap(player, train, castle); }
  }
}
