/* Keyboard + touch input. Exposes a snapshot of held controls each frame
 * and fires callbacks for one-shot actions (pause, mute).
 */
class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { left: false, right: false, brake: false, nitro: false };
    this.onPause = null;
    this.onMute = null;
    this.onAny = null; // any first interaction (used to unlock audio)

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.key.toLowerCase();
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault();
      if (!this.keys.has(k)) {
        if ((k === 'p' || k === 'escape') && this.onPause) this.onPause();
        if (k === 'm' && this.onMute) this.onMute();
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

  get left() {
    return this.keys.has('arrowleft') || this.keys.has('a') || this.touch.left;
  }
  get right() {
    return this.keys.has('arrowright') || this.keys.has('d') || this.touch.right;
  }
  get brake() {
    return this.keys.has('arrowdown') || this.keys.has('s') || this.touch.brake;
  }
  get nitro() {
    return this.keys.has('shift') || this.keys.has(' ') || this.keys.has('arrowup') || this.keys.has('w') || this.touch.nitro;
  }
}
