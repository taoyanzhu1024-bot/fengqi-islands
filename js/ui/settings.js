// 设置面板：声音开关与四通道音量、图形质量、云轨模式、时间
export class SettingsPanel {
  constructor({ audio, onQuality, onRailMode, onTime, getState }) {
    this.audio = audio;
    const root = document.getElementById('settings');
    const btn = document.getElementById('settingsBtn');
    btn.addEventListener('click', (e) => { e.stopPropagation(); root.classList.toggle('open'); this.refresh(); });
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root = root;
    this.getState = getState;
    const s = audio.settings;
    const slider = (key, label) => `<label><span>${label}</span><input type="range" min="0" max="1" step="0.05" data-k="${key}" value="${s[key]}"></label>`;
    root.querySelector('.panel').innerHTML = `
      <div class="sec">声音</div>
      <label class="row"><span>声音开关</span><input type="checkbox" data-k="enabled" ${s.enabled ? 'checked' : ''}></label>
      ${slider('master', '主音量')}${slider('music', '背景音乐')}${slider('ambient', '环境音')}${slider('sfx', '音效')}
      <div class="astate"></div>
      <div class="sec">画面</div>
      <label class="row"><span>图形质量</span><select data-q><option value="standard">标准</option><option value="high">高品质</option></select></label>
      <label class="row"><span>云轨模式</span><select data-rail><option value="cloud">云轨（逐段升起）</option><option value="classic">经典（始终可见）</option></select></label>
      <div class="sec">时间</div>
      <div class="times">
        <button data-t="dawn">清晨</button><button data-t="noon">正午</button><button data-t="dusk">黄昏</button><button data-t="night">夜晚</button><button data-t="auto">自动循环</button>
      </div>`;
    root.querySelectorAll('input[type=range]').forEach((el) => el.addEventListener('input', () => audio.set(el.dataset.k, +el.value)));
    root.querySelector('input[data-k=enabled]').addEventListener('change', (e) => { audio.unlock(); audio.set('enabled', e.target.checked); this.refresh(); });
    root.querySelector('select[data-q]').addEventListener('change', (e) => onQuality(e.target.value));
    root.querySelector('select[data-rail]').addEventListener('change', (e) => onRailMode(e.target.value));
    root.querySelectorAll('button[data-t]').forEach((b) => b.addEventListener('click', () => onTime(b.dataset.t)));
    this.icon = btn;
    this.refresh();
  }
  refresh() {
    const a = this.audio;
    const st = this.getState?.() ?? {};
    this.root.querySelector('select[data-q]').value = st.quality ?? 'standard';
    this.root.querySelector('select[data-rail]').value = st.railMode ?? 'cloud';
    const msg = a.state === 'unsupported' ? '此浏览器不支持 Web Audio'
      : !a.ctx || a.ctx.state !== 'running' ? '点击画面或按任意键以启用声音'
        : a.settings.enabled ? '声音已开启（合成占位音频）' : '声音已关闭';
    this.root.querySelector('.astate').textContent = msg;
    this.icon.textContent = a.settings.enabled && a.ctx?.state === 'running' ? '♪ 声音 · 设置' : '♪ 静音 · 设置';
  }
}
