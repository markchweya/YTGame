/* Small helpers shared across modules. */
const U = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  // frame-rate independent exponential smoothing
  damp: (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt)),
  rand: (a, b) => a + Math.random() * (b - a),
  randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  chance: (p) => Math.random() < p,
  ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  },
  ordinalHTML(n) {
    const o = U.ordinal(n);
    return `${n}<sup>${o.slice(String(n).length)}</sup>`;
  },
  fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
  },
  fmtInt: (n) => Math.round(n).toLocaleString('en-US'),
  kmh: (ms) => Math.round(ms * 3.6),
  hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  },
  shade(hex, amt) {
    const [r, g, b] = U.hexToRgb(hex).map((c) => U.clamp(Math.round(c + amt), 0, 255));
    return `rgb(${r},${g},${b})`;
  },
  rgba(hex, a) {
    const [r, g, b] = U.hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  },
  laneX: (lane, lanes) => ((lane + 0.5) / lanes) * 2 - 1,
  // deterministic pseudo-random in [0,1) for a numeric key — used for world props
  hash(k) {
    const x = Math.sin(k * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  },
  smoothstep(a, b, t) {
    const x = U.clamp((t - a) / (b - a), 0, 1);
    return x * x * (3 - 2 * x);
  },
  escapeHTML: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  isTouch: () => window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window,
};
