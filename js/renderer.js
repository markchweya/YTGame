/* Canvas renderer — pseudo-3D road with perspective projection.
 *
 * Camera space: depth z (zNear at the player's car, zFar at the horizon).
 * scale s = zNear / z; screen y = horizonY + (playerY - horizonY) * s.
 */
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.stars = [];
    this.skyline = [];
    this.mountains = [];
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth;
    const H = window.innerHeight;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = H + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = W;
    this.H = H;
    const R = CONFIG.ROAD;
    this.horizonY = H * R.horizon;
    // on touch devices the car sits higher so it isn't hidden behind the on-screen controls
    this.playerY = H * (U.isTouch() ? 0.74 : 0.9);
    this.nearHalfW = Math.min(W * R.nearHalfWidth, H * 0.8);
    this.laneW = (2 * this.nearHalfW) / CONFIG.LANES;
    this.zPerMeter = (R.zFar - R.zNear) / R.viewRange;

    // static scenery (regenerated on resize so density matches the viewport)
    this.stars = Array.from({ length: 140 }, () => ({
      x: Math.random(),
      y: Math.random() * 0.85,
      r: U.rand(0.4, 1.6),
      p: Math.random() * Math.PI * 2,
    }));
    this.mountains = [];
    let mx = -0.2;
    while (mx < 1.4) {
      const w = U.rand(0.12, 0.3);
      this.mountains.push({ x: mx, w, h: U.rand(0.05, 0.13) });
      mx += w * U.rand(0.5, 0.8);
    }
    this.skyline = [];
    let bx = -0.3;
    while (bx < 1.5) {
      const w = U.rand(0.015, 0.05);
      this.skyline.push({ x: bx, w, h: U.rand(0.02, 0.09), spire: U.chance(0.2) });
      bx += w + U.rand(0.002, 0.012);
    }
  }

  /* ---------- projection ---------- */
  curveOffset(z, curve) {
    const R = CONFIG.ROAD;
    const t = U.clamp((z - R.zNear) / (R.zFar - R.zNear), 0, 1);
    return curve * t * t * this.W * 0.55;
  }
  yAt(s) {
    return this.horizonY + (this.playerY - this.horizonY) * s;
  }
  project(d, x, playerD, curve) {
    const R = CONFIG.ROAD;
    const z = R.zNear + (d - playerD) * this.zPerMeter;
    if (z < 0.7 || z > R.zFar) return null;
    const s = R.zNear / z;
    const halfW = this.nearHalfW * s;
    const cx = this.W / 2 + this.curveOffset(z, curve);
    return { x: cx + x * halfW, y: this.yAt(s), s, z, halfW, cx };
  }
  fogAlpha(z) {
    const R = CONFIG.ROAD;
    return U.clamp((R.zFar - z) / (R.zFar * 0.32), 0, 1);
  }

  /* ---------- frame ---------- */
  render(game) {
    const ctx = this.ctx;
    const { W, H } = this;
    ctx.save();
    if (game.shake > 0.01) {
      ctx.translate(U.rand(-1, 1) * game.shake * 14, U.rand(-1, 1) * game.shake * 10);
    }
    this.drawSky(game);
    this.drawRoad(game);
    this.drawObjects(game);
    this.drawParticles(game);
    this.drawOverlays(game);
    ctx.restore();
    // letterbox edges when shaking so no transparent gaps show
    if (game.shake > 0.01) {
      ctx.fillStyle = '#05060f';
      ctx.fillRect(0, H - 2, W, 2);
    }
  }

  /* ---------- sky & scenery ---------- */
  drawSky(game) {
    const ctx = this.ctx;
    const { W, H, horizonY } = this;
    const P = CONFIG.PALETTE.sky;
    const g = ctx.createLinearGradient(0, 0, 0, horizonY);
    g.addColorStop(0, P[0]);
    g.addColorStop(0.45, P[1]);
    g.addColorStop(0.8, P[2]);
    g.addColorStop(1, P[3]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, horizonY + 2);

    // stars
    const t = game.time;
    ctx.fillStyle = '#fff';
    for (const s of this.stars) {
      const a = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.3 + s.p));
      ctx.globalAlpha = a * 0.9;
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * horizonY, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // parallax — scenery slides opposite to the road curve
    const par = -game.curve * W * 0.12;

    // sun
    const sunR = Math.min(W, H) * 0.19;
    const sx = W * 0.5 + par * 0.5;
    const sy = horizonY - sunR * 0.25;
    const sg = ctx.createLinearGradient(0, sy - sunR, 0, sy + sunR);
    sg.addColorStop(0, '#ffe36e');
    sg.addColorStop(0.55, '#ff6a9e');
    sg.addColorStop(1, '#c026d3');
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, horizonY);
    ctx.clip();
    ctx.fillStyle = sg;
    ctx.shadowColor = 'rgba(255,110,160,0.6)';
    ctx.shadowBlur = 40;
    ctx.beginPath();
    ctx.arc(sx, sy, sunR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // synth stripes across the lower sun
    ctx.fillStyle = P[2];
    for (let i = 0; i < 6; i++) {
      const yy = sy + sunR * (0.05 + i * 0.16);
      ctx.fillRect(sx - sunR, yy, sunR * 2, 2 + i * 1.6);
    }
    ctx.restore();

    // mountains
    ctx.fillStyle = '#1c1238';
    ctx.beginPath();
    ctx.moveTo(-W, horizonY + 2);
    for (const m of this.mountains) {
      const x0 = m.x * W + par * 0.7;
      ctx.lineTo(x0, horizonY + 2);
      ctx.lineTo(x0 + m.w * W * 0.5, horizonY - m.h * H);
      ctx.lineTo(x0 + m.w * W, horizonY + 2);
    }
    ctx.lineTo(W * 2, horizonY + 2);
    ctx.closePath();
    ctx.fill();

    // city skyline
    ctx.fillStyle = '#0d0a22';
    for (const b of this.skyline) {
      const x0 = b.x * W + par;
      const h = b.h * H;
      ctx.fillRect(x0, horizonY - h, b.w * W, h + 2);
      if (b.spire) ctx.fillRect(x0 + b.w * W * 0.45, horizonY - h - h * 0.4, 2, h * 0.4);
    }
    // window lights
    ctx.fillStyle = 'rgba(255,220,140,0.55)';
    for (let i = 0; i < this.skyline.length; i += 2) {
      const b = this.skyline[i];
      const x0 = b.x * W + par;
      const h = b.h * H;
      for (let k = 0; k < 3; k++) {
        const wy = horizonY - h + ((k + 0.4) / 3.2) * h;
        if (((i * 7 + k * 3) % 5) < 3) ctx.fillRect(x0 + b.w * W * 0.3, wy, 1.5, 1.5);
      }
    }

    // horizon glow line
    const hg = ctx.createLinearGradient(0, horizonY - 6, 0, horizonY + 10);
    hg.addColorStop(0, 'rgba(255,90,143,0)');
    hg.addColorStop(0.5, 'rgba(255,120,170,0.55)');
    hg.addColorStop(1, 'rgba(255,90,143,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, horizonY - 6, W, 16);
  }

  /* ---------- road ---------- */
  drawRoad(game) {
    const ctx = this.ctx;
    const { W, H, horizonY, playerY, nearHalfW } = this;
    const R = CONFIG.ROAD;
    const PAL = CONFIG.PALETTE;
    const playerD = game.player.d;
    const curve = game.curve;
    const N = 110;
    const sMin = R.zNear / R.zFar;
    const sMax = (H + 24 - horizonY) / (playerY - horizonY);

    // ground base
    ctx.fillStyle = PAL.grassA;
    ctx.fillRect(0, horizonY, W, H - horizonY);

    const slices = new Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const s = sMax + (sMin - sMax) * (i / N);
      const z = R.zNear / s;
      slices[i] = {
        y: this.yAt(s),
        hw: nearHalfW * s,
        cx: W / 2 + this.curveOffset(z, curve),
        d: playerD + (z - R.zNear) / this.zPerMeter,
        s,
      };
    }

    const lanes = CONFIG.LANES;
    for (let i = 0; i < N; i++) {
      const a = slices[i]; // near
      const b = slices[i + 1]; // far
      const stripe = Math.floor(a.d / R.stripeLen) & 1;
      const hgt = a.y - b.y + 1;

      // grass stripes
      ctx.fillStyle = stripe ? PAL.grassA : PAL.grassB;
      ctx.fillRect(0, b.y, W, hgt);

      // road
      ctx.fillStyle = stripe ? PAL.roadA : PAL.roadB;
      quad(ctx, a.cx - a.hw, a.y + 1, a.cx + a.hw, b.cx - b.hw, b.y, b.cx + b.hw);

      // rumble strips
      const rw = 0.05;
      ctx.fillStyle = stripe ? PAL.rumbleA : PAL.rumbleB;
      quad(ctx, a.cx - a.hw, a.y + 1, a.cx - a.hw * (1 - rw), b.cx - b.hw, b.y, b.cx - b.hw * (1 - rw));
      quad(ctx, a.cx + a.hw * (1 - rw), a.y + 1, a.cx + a.hw, b.cx + b.hw * (1 - rw), b.y, b.cx + b.hw);

      // lane dashes
      const m = ((a.d % R.dashPeriod) + R.dashPeriod) % R.dashPeriod;
      if (m < R.dashLen) {
        ctx.fillStyle = PAL.lane;
        for (let k = 1; k < lanes; k++) {
          const lx = -1 + (2 * k) / lanes;
          const wa = Math.max(1, a.hw * 0.012);
          const wb = Math.max(0.6, b.hw * 0.012);
          quad(ctx, a.cx + lx * a.hw - wa, a.y + 1, a.cx + lx * a.hw + wa, b.cx + lx * b.hw - wb, b.y, b.cx + lx * b.hw + wb);
        }
      }
    }

    // neon edge lines
    for (const side of [-1, 1]) {
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const sl = slices[i];
        const x = sl.cx + side * sl.hw;
        if (i === 0) ctx.moveTo(x, sl.y);
        else ctx.lineTo(x, sl.y);
      }
      ctx.strokeStyle = U.rgba(PAL.edgeGlow, 0.18);
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = U.rgba(PAL.edgeGlow, 0.85);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // distance haze
    const fog = ctx.createLinearGradient(0, horizonY, 0, horizonY + (playerY - horizonY) * 0.28);
    fog.addColorStop(0, 'rgba(255,90,143,0.55)');
    fog.addColorStop(0.35, 'rgba(120,60,140,0.25)');
    fog.addColorStop(1, 'rgba(20,20,40,0)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, horizonY, W, (playerY - horizonY) * 0.28);

    // finish line in race mode
    if (game.mode === 'race') {
      const fd = CONFIG.RACE.length;
      const near = this.project(fd, 0, playerD, curve);
      const far = this.project(fd + 3, 0, playerD, curve);
      if (near && far) {
        const cells = 12;
        for (let c = 0; c < cells; c++) {
          const x0 = -1 + (2 * c) / cells;
          const x1 = -1 + (2 * (c + 1)) / cells;
          ctx.fillStyle = c & 1 ? '#f5f7ff' : '#111';
          quad(ctx, near.cx + x0 * near.halfW, near.y, near.cx + x1 * near.halfW, far.cx + x0 * far.halfW, far.y, far.cx + x1 * far.halfW);
        }
        // banner
        const bh = Math.max(4, near.halfW * 0.22);
        ctx.fillStyle = 'rgba(10,10,30,0.9)';
        ctx.fillRect(near.cx - near.halfW * 1.08, near.y - bh * 4.2, near.halfW * 2.16, bh);
        ctx.fillStyle = '#00e5ff';
        ctx.font = `700 ${Math.max(8, bh * 0.75)}px Rajdhani, Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('FINISH', near.cx, near.y - bh * 3.7);
        ctx.fillStyle = 'rgba(0,229,255,0.6)';
        ctx.fillRect(near.cx - near.halfW * 1.08, near.y - bh * 3.2, 3, bh * 3.2);
        ctx.fillRect(near.cx + near.halfW * 1.08 - 3, near.y - bh * 3.2, 3, bh * 3.2);
      }
    }
  }

  /* ---------- objects ---------- */
  drawObjects(game) {
    const ctx = this.ctx;
    const list = [];
    const pd = game.player.d;
    const curve = game.curve;

    for (const o of game.obstacles) {
      const p = this.project(o.d, o.x, pd, curve);
      if (p) list.push({ z: p.z, p, kind: 'obstacle', e: o });
    }
    for (const k of game.pickups) {
      if (k.taken) continue;
      const p = this.project(k.d, k.x, pd, curve);
      if (p) list.push({ z: p.z, p, kind: 'pickup', e: k });
    }
    for (const r of game.rivals) {
      const p = this.project(r.d, r.x, pd, curve);
      if (p) list.push({ z: p.z, p, kind: 'rival', e: r });
    }
    const pl = game.player;
    list.push({
      z: CONFIG.ROAD.zNear,
      p: { x: this.W / 2 + pl.x * this.nearHalfW, y: this.playerY, s: 1, z: 1, halfW: this.nearHalfW },
      kind: 'player',
      e: pl,
    });
    list.sort((a, b) => b.z - a.z);

    for (const it of list) {
      ctx.save();
      ctx.globalAlpha = this.fogAlpha(it.z);
      switch (it.kind) {
        case 'obstacle':
          if (it.e.type === 'car') this.drawCar(it.p.x, it.p.y, it.p.s, it.e.color, {});
          else this.drawObstacle(it.e, it.p, game.time);
          break;
        case 'pickup':
          this.drawPickup(it.e, it.p, game.time);
          break;
        case 'rival':
          this.drawCar(it.p.x, it.p.y, it.p.s, it.e.color, { tilt: (it.e.targetX - it.e.x) * 0.5, label: it.e.name });
          break;
        case 'player': {
          const blink = pl.invuln > 0 && Math.floor(game.time * 14) % 2 === 0;
          if (blink) ctx.globalAlpha = 0.35;
          this.drawCar(it.p.x, it.p.y, 1, pl.color, {
            player: true,
            tilt: pl.tilt,
            nitro: pl.nitroActive,
            shield: pl.shield,
            time: game.time,
          });
          break;
        }
      }
      ctx.restore();
    }
  }

  drawCar(sx, sy, s, color, o) {
    const ctx = this.ctx;
    const w = this.laneW * 0.5 * s;
    const h = w * 1.4;
    ctx.save();
    ctx.translate(sx, sy);
    if (o.tilt) ctx.rotate(U.clamp(o.tilt, -0.12, 0.12));

    // nitro flames (behind car)
    if (o.nitro) {
      for (const ex of [-0.28, 0.28]) {
        const len = h * U.rand(0.35, 0.7);
        const fg = ctx.createLinearGradient(0, 0, 0, len);
        fg.addColorStop(0, 'rgba(255,255,255,0.95)');
        fg.addColorStop(0.3, 'rgba(0,229,255,0.9)');
        fg.addColorStop(1, 'rgba(120,0,255,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(ex * w - w * 0.09, -h * 0.05);
        ctx.lineTo(ex * w + w * 0.09, -h * 0.05);
        ctx.lineTo(ex * w, len);
        ctx.closePath();
        ctx.fill();
      }
    }

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.02, w * 0.62, h * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();

    // wheels
    ctx.fillStyle = '#0b0b10';
    const ww = w * 0.16;
    const wh = h * 0.2;
    roundRect(ctx, -w * 0.58, -h * 0.28, ww, wh, ww * 0.3);
    roundRect(ctx, w * 0.58 - ww, -h * 0.28, ww, wh, ww * 0.3);
    roundRect(ctx, -w * 0.56, -h * 0.9, ww, wh, ww * 0.3);
    roundRect(ctx, w * 0.56 - ww, -h * 0.9, ww, wh, ww * 0.3);

    // body
    const bg = ctx.createLinearGradient(0, -h, 0, 0);
    bg.addColorStop(0, U.shade(color, 40));
    bg.addColorStop(0.5, color);
    bg.addColorStop(1, U.shade(color, -70));
    ctx.fillStyle = bg;
    roundRect(ctx, -w / 2, -h, w, h, w * 0.2);

    // side highlight
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, -w * 0.48, -h * 0.98, w * 0.1, h * 0.94, w * 0.05);

    // windshield (front, far end)
    ctx.fillStyle = '#0c1424';
    roundRect(ctx, -w * 0.36, -h * 0.9, w * 0.72, h * 0.12, w * 0.06);
    // roof
    ctx.fillStyle = U.shade(color, 25);
    roundRect(ctx, -w * 0.38, -h * 0.78, w * 0.76, h * 0.18, w * 0.05);
    // rear window
    const rg = ctx.createLinearGradient(0, -h * 0.6, 0, -h * 0.38);
    rg.addColorStop(0, '#16213a');
    rg.addColorStop(1, '#0a0f1e');
    ctx.fillStyle = rg;
    roundRect(ctx, -w * 0.4, -h * 0.6, w * 0.8, h * 0.22, w * 0.08);

    // spoiler
    if (o.player) {
      ctx.fillStyle = U.shade(color, -40);
      ctx.fillRect(-w * 0.42, -h * 0.34, w * 0.06, h * 0.08);
      ctx.fillRect(w * 0.36, -h * 0.34, w * 0.06, h * 0.08);
      ctx.fillStyle = U.shade(color, -20);
      roundRect(ctx, -w * 0.52, -h * 0.4, w * 1.04, h * 0.07, w * 0.03);
    }

    // tail lights
    const lw = w * 0.24;
    const lh = h * 0.07;
    ctx.fillStyle = o.brake ? 'rgba(255,60,60,0.5)' : 'rgba(255,40,60,0.28)';
    roundRect(ctx, -w * 0.47, -h * 0.2, lw + 4, lh + 4, 3);
    roundRect(ctx, w * 0.47 - lw - 4, -h * 0.2, lw + 4, lh + 4, 3);
    ctx.fillStyle = '#ff3b4a';
    roundRect(ctx, -w * 0.45, -h * 0.18, lw, lh, 2);
    roundRect(ctx, w * 0.45 - lw, -h * 0.18, lw, lh, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(-w * 0.12, -h * 0.17, w * 0.24, lh * 0.5);

    // shield bubble
    if (o.shield) {
      const pulse = 0.85 + 0.15 * Math.sin((o.time || 0) * 6);
      ctx.strokeStyle = 'rgba(120,200,255,0.9)';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(80,160,255,0.14)';
      ctx.beginPath();
      ctx.ellipse(0, -h * 0.5, w * 0.95 * pulse, h * 0.68 * pulse, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // name label above rivals
    if (o.label && s > 0.22) {
      ctx.font = `600 ${Math.max(9, 13 * Math.min(1, s * 1.6))}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const tw = ctx.measureText(o.label).width + 10;
      ctx.fillStyle = 'rgba(8,10,24,0.75)';
      roundRect(ctx, -tw / 2, -h - 22 * Math.min(1, s * 1.4), tw, 16 * Math.min(1, s * 1.4) + 2, 6);
      ctx.fillStyle = color;
      ctx.fillText(o.label, 0, -h - 5);
    }
    ctx.restore();
  }

  drawObstacle(o, p, time) {
    const ctx = this.ctx;
    const { x, y, s } = p;
    const lw = this.laneW * s;
    ctx.save();
    ctx.translate(x, y);
    switch (o.type) {
      case 'cone': {
        const w = lw * 0.34;
        const h = w * 1.35;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.ellipse(0, 0, w * 0.7, w * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(-w * 0.6, -w * 0.08, w * 1.2, w * 0.14);
        const cg = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
        cg.addColorStop(0, '#ff9a2e');
        cg.addColorStop(0.5, '#ff6a00');
        cg.addColorStop(1, '#c94a00');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.moveTo(-w / 2, 0);
        ctx.lineTo(w / 2, 0);
        ctx.lineTo(w * 0.08, -h);
        ctx.lineTo(-w * 0.08, -h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.moveTo(-w * 0.34, -h * 0.38);
        ctx.lineTo(w * 0.34, -h * 0.38);
        ctx.lineTo(w * 0.27, -h * 0.55);
        ctx.lineTo(-w * 0.27, -h * 0.55);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'barrier': {
        const w = lw * 0.88;
        const h = w * 0.3;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(-w / 2, -h * 0.05, w, h * 0.15);
        ctx.fillStyle = '#333';
        ctx.fillRect(-w * 0.42, -h * 0.5, w * 0.06, h * 0.5);
        ctx.fillRect(w * 0.36, -h * 0.5, w * 0.06, h * 0.5);
        ctx.save();
        ctx.beginPath();
        ctx.rect(-w / 2, -h * 1.2, w, h * 0.75);
        ctx.clip();
        ctx.fillStyle = '#f2f2f2';
        ctx.fillRect(-w / 2, -h * 1.2, w, h * 0.75);
        ctx.fillStyle = '#ff2f4f';
        const stripes = 6;
        for (let i = -1; i < stripes; i += 1) {
          const x0 = -w / 2 + (i / stripes) * w * 1.15;
          ctx.beginPath();
          ctx.moveTo(x0, -h * 0.45);
          ctx.lineTo(x0 + w * 0.09, -h * 0.45);
          ctx.lineTo(x0 + w * 0.09 + h * 0.4, -h * 1.2);
          ctx.lineTo(x0 + h * 0.4, -h * 1.2);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        // lamp
        const blink = Math.floor(time * 3 + o.seed * 10) % 2 === 0;
        ctx.fillStyle = blink ? '#ffe14d' : '#8a7a1a';
        ctx.beginPath();
        ctx.arc(0, -h * 1.32, Math.max(1.5, w * 0.05), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'rock': {
        const w = lw * 0.48;
        const h = w * 0.7;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.ellipse(0, 0, w * 0.6, w * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5b6170';
        ctx.beginPath();
        ctx.moveTo(-w / 2, 0);
        ctx.lineTo(-w * 0.42, -h * 0.55);
        ctx.lineTo(-w * 0.1, -h);
        ctx.lineTo(w * 0.3, -h * 0.85);
        ctx.lineTo(w / 2, -h * 0.3);
        ctx.lineTo(w * 0.4, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#7c8394';
        ctx.beginPath();
        ctx.moveTo(-w * 0.42, -h * 0.55);
        ctx.lineTo(-w * 0.1, -h);
        ctx.lineTo(w * 0.05, -h * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#3f4453';
        ctx.beginPath();
        ctx.moveTo(w * 0.05, -h * 0.55);
        ctx.lineTo(w * 0.3, -h * 0.85);
        ctx.lineTo(w / 2, -h * 0.3);
        ctx.lineTo(w * 0.4, 0);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'oil': {
        const rx = lw * 0.42;
        const ry = rx * 0.32;
        const g = ctx.createRadialGradient(0, -ry * 0.2, 0, 0, 0, rx);
        g.addColorStop(0, 'rgba(70,40,110,0.9)');
        g.addColorStop(0.6, 'rgba(20,10,40,0.9)');
        g.addColorStop(1, 'rgba(10,5,20,0.6)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `hsla(${(time * 120 + o.seed * 360) % 360},90%,65%,0.45)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, -ry * 0.1, rx * 0.7, ry * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  drawPickup(k, p, time) {
    const ctx = this.ctx;
    const { x, y, s } = p;
    const lw = this.laneW * s;
    const bob = Math.sin(time * 4 + k.phase) * lw * 0.05;
    ctx.save();
    ctx.translate(x, y);
    // ground marker
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, lw * 0.16, lw * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    switch (k.type) {
      case 'coin': {
        const r = lw * 0.15;
        const sq = Math.abs(Math.cos(time * 5 + k.phase));
        ctx.fillStyle = 'rgba(255,215,0,0.25)';
        ctx.beginPath();
        ctx.arc(0, -r * 1.4 - bob, r * 1.6, 0, Math.PI * 2);
        ctx.fill();
        const g = ctx.createLinearGradient(-r, 0, r, 0);
        g.addColorStop(0, '#ffe680');
        g.addColorStop(0.5, '#ffc107');
        g.addColorStop(1, '#e09b00');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, -r * 1.4 - bob, Math.max(r * 0.15, r * sq), r, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8a6100';
        ctx.lineWidth = Math.max(1, r * 0.12);
        ctx.beginPath();
        ctx.ellipse(0, -r * 1.4 - bob, Math.max(r * 0.1, r * sq * 0.65), r * 0.65, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'nitro': {
        const w = lw * 0.26;
        const h = w * 1.5;
        ctx.fillStyle = 'rgba(0,229,255,0.22)';
        ctx.beginPath();
        ctx.arc(0, -h * 0.55 - bob, h * 0.75, 0, Math.PI * 2);
        ctx.fill();
        const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
        g.addColorStop(0, '#7df9ff');
        g.addColorStop(0.5, '#00c8e0');
        g.addColorStop(1, '#0077a8');
        ctx.fillStyle = g;
        roundRect(ctx, -w / 2, -h - bob, w, h, w * 0.3);
        ctx.fillStyle = '#e6fdff';
        roundRect(ctx, -w * 0.2, -h * 1.15 - bob, w * 0.4, h * 0.18, w * 0.1);
        ctx.fillStyle = '#04263a';
        ctx.font = `800 ${Math.max(6, h * 0.5)}px Rajdhani, Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('N', 0, -h * 0.5 - bob);
        break;
      }
      case 'shield': {
        const r = lw * 0.18;
        ctx.fillStyle = 'rgba(120,120,255,0.22)';
        ctx.beginPath();
        ctx.arc(0, -r * 1.3 - bob, r * 1.7, 0, Math.PI * 2);
        ctx.fill();
        const g = ctx.createRadialGradient(0, -r * 1.5 - bob, r * 0.1, 0, -r * 1.3 - bob, r);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.4, '#9bb8ff');
        g.addColorStop(1, '#4b4bff');
        ctx.fillStyle = g;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i + time * 1.5;
          const px = Math.cos(a) * r;
          const py = -r * 1.3 - bob + Math.sin(a) * r;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1;
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  drawParticles(game) {
    const ctx = this.ctx;
    for (const p of game.particles) {
      const a = U.clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.shape === 'text') {
        ctx.font = `700 ${p.size}px Rajdhani, Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 3;
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillText(p.text, p.x, p.y);
      } else if (p.shape === 'rect') {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawOverlays(game) {
    const ctx = this.ctx;
    const { W, H } = this;

    // speed lines when boosting / very fast
    const boost = game.player.nitroActive ? 1 : U.clamp((game.player.speed - CONFIG.PLAYER.maxSpeed * 0.9) / 20, 0, 0.5);
    if (boost > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${0.35 * boost})`;
      ctx.lineWidth = 1.5;
      const cx = W / 2;
      const cy = this.horizonY;
      for (let i = 0; i < 18; i++) {
        const ang = (i / 18) * Math.PI * 2 + game.time * 0.7;
        const r0 = Math.max(W, H) * U.rand(0.42, 0.55);
        const r1 = r0 + U.rand(40, 140) * boost;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
        ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
        ctx.stroke();
      }
      ctx.restore();
    }

    // vignette
    const vg = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // damage flash
    if (game.flash > 0.01) {
      ctx.fillStyle = `rgba(255,30,60,${0.35 * game.flash})`;
      ctx.fillRect(0, 0, W, H);
    }
    // nitro tint
    if (game.player.nitroActive) {
      ctx.fillStyle = 'rgba(0,229,255,0.05)';
      ctx.fillRect(0, 0, W, H);
    }
  }
}

/* ---------- canvas helpers ---------- */
function quad(ctx, x1, y1, x2, x3, y3, x4) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y1);
  ctx.lineTo(x4, y3);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
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
  ctx.fill();
}
