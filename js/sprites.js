/* Pre-rendered sprites (offscreen canvases). Cars are drawn once per
 * (style, colour) at high resolution and then scaled with drawImage — far
 * cheaper than re-drawing dozens of gradients every frame and much more detailed.
 */
const Sprites = {
  _cache: new Map(),
  CAR_W: 256,
  CAR_H: 296,
  GROUND: 278, // y of the tyre contact line inside the sprite

  car(color, style = 'sport') {
    const key = `car:${style}:${color}`;
    if (this._cache.has(key)) return this._cache.get(key);
    const c = document.createElement('canvas');
    c.width = this.CAR_W;
    c.height = this.CAR_H;
    this._drawCar(c.getContext('2d'), color, CONFIG.CARS[style] || CONFIG.CARS.sport);
    this._cache.set(key, c);
    return c;
  },

  glow(color, size = 96) {
    const key = `glow:${color}:${size}`;
    if (this._cache.has(key)) return this._cache.get(key);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, U.rgba(color, 0.9));
    g.addColorStop(0.35, U.rgba(color, 0.35));
    g.addColorStop(1, U.rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    this._cache.set(key, c);
    return c;
  },

  /* Rear three-quarter-ish view of a sports car, centred at x=128, tyres on GROUND. */
  _drawCar(ctx, color, S) {
    const W = this.CAR_W;
    const cx = W / 2;
    const G = this.GROUND;
    const bw = 200 * S.width; // body width at the widest (rear fenders)
    const half = bw / 2;
    const roofW = bw * S.roof;
    const roofY = G - 205 * S.height; // top of roof
    const shoulderY = G - 108; // fender shoulder line
    const bumperY = G - 22;
    const dark = U.shade(color, -90);
    const mid = U.shade(color, -30);
    const light = U.shade(color, 55);

    ctx.clearRect(0, 0, W, this.CAR_H);

    // ground shadow
    let g = ctx.createRadialGradient(cx, G - 6, 10, cx, G - 6, half * 1.25);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, G - 40, W, 60);

    // rear tyres
    const tyreW = 44;
    const tyreH = 72;
    for (const side of [-1, 1]) {
      const tx = cx + side * (half - tyreW * 0.55) - tyreW / 2;
      rrect(ctx, tx, G - tyreH, tyreW, tyreH, 12);
      ctx.fillStyle = '#0a0a0f';
      ctx.fill();
      // tread highlight
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      rrect(ctx, tx + 6, G - tyreH + 8, tyreW - 12, tyreH - 20, 8);
      ctx.fill();
    }

    // lower body / rear fascia
    g = ctx.createLinearGradient(0, shoulderY, 0, G);
    g.addColorStop(0, mid);
    g.addColorStop(0.55, dark);
    g.addColorStop(1, '#07070c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - half, shoulderY + 10);
    ctx.quadraticCurveTo(cx - half - 6, bumperY - 10, cx - half + 14, bumperY + 6);
    ctx.lineTo(cx + half - 14, bumperY + 6);
    ctx.quadraticCurveTo(cx + half + 6, bumperY - 10, cx + half, shoulderY + 10);
    ctx.closePath();
    ctx.fill();

    // rear deck + fenders (main colour)
    g = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
    g.addColorStop(0, U.shade(color, -45));
    g.addColorStop(0.25, color);
    g.addColorStop(0.5, light);
    g.addColorStop(0.75, color);
    g.addColorStop(1, U.shade(color, -45));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - half + 2, shoulderY + 20);
    ctx.quadraticCurveTo(cx - half - 4, shoulderY - 22, cx - roofW / 2 - 30, shoulderY - 44);
    ctx.lineTo(cx + roofW / 2 + 30, shoulderY - 44);
    ctx.quadraticCurveTo(cx + half + 4, shoulderY - 22, cx + half - 2, shoulderY + 20);
    ctx.closePath();
    ctx.fill();

    // cabin: rear glass
    const glassTop = roofY + 16;
    const glassBot = shoulderY - 38;
    g = ctx.createLinearGradient(0, glassTop, 0, glassBot);
    g.addColorStop(0, '#1b2b4a');
    g.addColorStop(0.5, '#0a1226');
    g.addColorStop(1, '#05080f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - roofW / 2 + 6, glassTop);
    ctx.lineTo(cx + roofW / 2 - 6, glassTop);
    ctx.quadraticCurveTo(cx + roofW / 2 + 26, glassBot - 6, cx + roofW / 2 + 24, glassBot);
    ctx.lineTo(cx - roofW / 2 - 24, glassBot);
    ctx.quadraticCurveTo(cx - roofW / 2 - 26, glassBot - 6, cx - roofW / 2 + 6, glassTop);
    ctx.closePath();
    ctx.fill();
    // glass reflection streak
    ctx.fillStyle = 'rgba(160,200,255,0.16)';
    ctx.beginPath();
    ctx.moveTo(cx - roofW / 2 + 14, glassTop + 6);
    ctx.lineTo(cx - roofW / 2 + 44, glassTop + 6);
    ctx.lineTo(cx - roofW / 2 + 4, glassBot - 8);
    ctx.lineTo(cx - roofW / 2 - 12, glassBot - 8);
    ctx.closePath();
    ctx.fill();

    // roof
    g = ctx.createLinearGradient(0, roofY, 0, glassTop);
    g.addColorStop(0, light);
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    rrect(ctx, cx - roofW / 2, roofY, roofW, glassTop - roofY + 4, 10);
    ctx.fill();
    // windshield sliver + hood beyond the roof
    ctx.fillStyle = '#0b1324';
    rrect(ctx, cx - roofW / 2 + 8, roofY - 12, roofW - 16, 14, 6);
    ctx.fill();
    ctx.fillStyle = mid;
    rrect(ctx, cx - roofW / 2 + 14, roofY - 20, roofW - 28, 10, 4);
    ctx.fill();

    // pillars / cabin edges
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - roofW / 2 + 6, glassTop);
    ctx.lineTo(cx - roofW / 2 - 24, glassBot);
    ctx.moveTo(cx + roofW / 2 - 6, glassTop);
    ctx.lineTo(cx + roofW / 2 + 24, glassBot);
    ctx.stroke();

    // side mirrors
    for (const side of [-1, 1]) {
      const mx = cx + side * (roofW / 2 + 40);
      rrect(ctx, mx - 12, glassBot - 34, 24, 16, 6);
      ctx.fillStyle = mid;
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      rrect(ctx, mx - 10, glassBot - 32, 20, 6, 3);
      ctx.fill();
    }

    // spoiler
    if (S.spoiler === 'wing') {
      const wy = glassBot - 22;
      ctx.fillStyle = dark;
      ctx.fillRect(cx - half + 30, wy, 10, 34);
      ctx.fillRect(cx + half - 40, wy, 10, 34);
      g = ctx.createLinearGradient(0, wy - 8, 0, wy + 10);
      g.addColorStop(0, U.shade(color, 20));
      g.addColorStop(1, dark);
      ctx.fillStyle = g;
      rrect(ctx, cx - half - 6, wy - 8, bw + 12, 18, 6);
      ctx.fill();
    } else if (S.spoiler === 'duck') {
      ctx.fillStyle = U.shade(color, -20);
      rrect(ctx, cx - half + 10, shoulderY - 50, bw - 20, 12, 5);
      ctx.fill();
    } else if (S.spoiler === 'lip') {
      ctx.fillStyle = dark;
      rrect(ctx, cx - half + 20, shoulderY - 44, bw - 40, 7, 3);
      ctx.fill();
    }

    // shoulder crease highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - half + 8, shoulderY + 14);
    ctx.quadraticCurveTo(cx, shoulderY - 6, cx + half - 8, shoulderY + 14);
    ctx.stroke();

    // tail lights
    const ly = shoulderY + 22;
    if (S.lights === 'bar') {
      // full-width LED bar
      ctx.fillStyle = 'rgba(255,40,70,0.35)';
      rrect(ctx, cx - half + 14, ly - 8, bw - 28, 30, 10);
      ctx.fill();
      g = ctx.createLinearGradient(0, ly, 0, ly + 14);
      g.addColorStop(0, '#ff8090');
      g.addColorStop(0.5, '#ff1f3d');
      g.addColorStop(1, '#a3001c');
      ctx.fillStyle = g;
      rrect(ctx, cx - half + 20, ly, bw - 40, 14, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      rrect(ctx, cx - half + 26, ly + 3, bw - 52, 3, 2);
      ctx.fill();
    } else {
      // quad / twin round lamps
      const n = S.lights === 'quad' ? 2 : 1;
      for (const side of [-1, 1]) {
        for (let i = 0; i < n; i++) {
          const lx = cx + side * (half - 38 - i * 30);
          ctx.fillStyle = 'rgba(255,40,70,0.35)';
          ctx.beginPath();
          ctx.arc(lx, ly + 8, 20, 0, Math.PI * 2);
          ctx.fill();
          g = ctx.createRadialGradient(lx - 3, ly + 5, 2, lx, ly + 8, 13);
          g.addColorStop(0, '#ffb3bd');
          g.addColorStop(0.4, '#ff1f3d');
          g.addColorStop(1, '#8a0018');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(lx, ly + 8, 13, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // plate
    rrect(ctx, cx - 26, ly + 26, 52, 18, 3);
    ctx.fillStyle = '#e9ecf5';
    ctx.fill();
    ctx.fillStyle = '#1a1d2e';
    ctx.font = '700 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NEON', cx, ly + 35);

    // diffuser + exhausts
    ctx.fillStyle = '#0a0a10';
    rrect(ctx, cx - half + 34, G - 36, bw - 68, 18, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 6; i++) ctx.fillRect(cx - half + 44 + i * ((bw - 88) / 6), G - 34, 3, 14);
    for (const side of [-1, 1]) {
      const ex = cx + side * (S.exhaust === 'center' ? 16 : half - 60);
      ctx.fillStyle = '#2b2f3a';
      ctx.beginPath();
      ctx.arc(ex, G - 27, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#05050a';
      ctx.beginPath();
      ctx.arc(ex, G - 27, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // body outline for crispness
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - half, shoulderY + 10);
    ctx.quadraticCurveTo(cx - half - 6, bumperY - 10, cx - half + 14, bumperY + 6);
    ctx.lineTo(cx + half - 14, bumperY + 6);
    ctx.quadraticCurveTo(cx + half + 6, bumperY - 10, cx + half, shoulderY + 10);
    ctx.stroke();
  },
};

function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
