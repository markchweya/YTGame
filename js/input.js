/* Keyboard + touch input. Exposes a snapshot of held controls each frame
 * and fires callbacks for one-shot actions (pause, mute).
 */
class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { left: false, right: false, brake: false, nitro: false };
    this.onPause = null;
    this.onMute = null;
    this.onRestart = null; // 'r' key
    this.onAny = null; // any first interaction (used to unlock audio)

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.key.toLowerCase();
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault();
      if (!this.keys.has(k)) {
        if ((k === 'p' || k === 'escape') && this.onPause) this.onPause();
        if (k === 'm' && this.onMute) this.onMute();
        if (k === 'r' && this.onRestart) this.onRestart();
      }
      this.keys.add(k);
      this.onAny && this.onAny();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('pointerdown', () => this.onAny && this.onAny(), { passive: true });
  }

  bindTouchButton(el, name) {
    if (!el) return;
    const on = (e) => {
      e.preventDefault();
      this.touch[name] = true;
      el.classList.add('active');
    };
    const off = (e) => {
      e && e.preventDefault();
      this.touch[name] = false;
      el.classList.remove('active');
    };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /* Gamepad (standard mapping): left stick / d-pad steer, A or RT = nitro, B/X or LT = brake, Start = pause. */
  _pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }
  get pad() {
    const p = this._pad();
    if (!p) return { x: 0, nitro: false, brake: false };
    const dz = 0.25;
    const axis = p.axes[0] || 0;
    const x = Math.abs(axis) > dz ? axis : (p.buttons[14]?.pressed ? -1 : 0) + (p.buttons[15]?.pressed ? 1 : 0);
    const start = p.buttons[9]?.pressed;
    if (start && !this._padStart && this.onPause) this.onPause();
    this._padStart = !!start;
    if ((x || p.buttons[0]?.pressed) && this.onAny) this.onAny();
    return {
      x,
      nitro: !!(p.buttons[0]?.pressed || (p.buttons[7]?.value || 0) > 0.3),
      brake: !!(p.buttons[1]?.pressed || p.buttons[2]?.pressed || (p.buttons[6]?.value || 0) > 0.3),
    };
  }

  get left() {
    return this.keys.has('arrowleft') || this.keys.has('a') || this.touch.left || this.pad.x < -0.5;
  }
  get right() {
    return this.keys.has('arrowright') || this.keys.has('d') || this.touch.right || this.pad.x > 0.5;
  }
  get brake() {
    return this.keys.has('arrowdown') || this.keys.has('s') || this.touch.brake || this.pad.brake;
  }
  get nitro() {
    return this.keys.has('shift') || this.keys.has(' ') || this.keys.has('arrowup') || this.keys.has('w') || this.touch.nitro || this.pad.nitro;
  }
}
