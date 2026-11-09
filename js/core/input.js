// 键盘输入：持续按下 + 本帧按下
export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.any = false;
    addEventListener('keydown', (e) => {
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      this.any = true;
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
  }
  isDown(...codes) { return codes.some((c) => this.down.has(c)); }
  was(...codes) { return codes.some((c) => this.pressed.has(c)); }
  /** 读取并消费本帧按键：同一次按键只能被一个系统处理（修复下车后立即重新上车） */
  take(code) {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }
  /** 测试用：模拟一次按键 */
  tap(code) { this.pressed.add(code); }
  endFrame() { this.pressed.clear(); this.any = false; }
}
