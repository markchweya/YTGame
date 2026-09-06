/* Canvas renderer — pseudo-3D highway with perspective-mapped textures,
 * hills, curves, roadside props and post effects.
 *
 * Camera space: depth z (zNear at the player's car, zFar at the horizon).
 * scale s = zNear / z; screen y = horizonY + (playerY - horizonY) * s - hill(z).
 */
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tex = this._makeTextures();
    this.stars = [];
    this.cityLights = [];
    this.mountainsFar = [];
    this.mountainsNear = [];
    this.clouds = [];
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /* ---------- setup ---------- */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth;
    const H = window.innerHeight;
    this.dpr = dpr;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = H + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = W;
    this.H = H;
    const R = CONFIG.ROAD;
    this.horizonY = H * R.horizon;
    this.playerY = H * (U.isTouch() ? 0.76 : 0.9);
    this.nearHalfW = Math.min(W * R.nearHalfWidth, H * 0.7);
    this.laneW = (2 * this.nearHalfW) / CONFIG.LANES;
    this.zPerMeter = (R.zFar - R.zNear) / R.viewRange;
    this.hillAmp = H * 0.26;

    this.stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random() * 0.5, r: U.rand(0.4, 1.3), p: Math.random() * 6.28 }));
    this.cityLights = Array.from({ length: 160 }, () => ({ x: Math.random() * 1.6 - 0.3, y: U.rand(0.001, 0.02), w: U.rand(1, 2.5), warm: U.chance(0.75) }));
    const ridge = (n, hmin, hmax) => {
      const pts = [];
      let x = -0.3;
      while (x < 1.5) {
        pts.push({ x, h: U.rand(hmin, hmax) });
        x += U.rand(0.06, 0.16) / n;
      }
      return pts;
    };
    this.mountainsFar = ridge(1, 0.04, 0.12);
    this.mountainsNear = ridge(1.4, 0.02, 0.07);
    this.clouds = Array.from({ length: 7 }, () => ({ x: Math.random(), y: U.rand(0.15, 0.7), w: U.rand(0.12, 0.3), h: U.rand(0.015, 0.035), a: U.rand(0.15, 0.35), v: U.rand(0.002, 0.006) }));
  }

  _makeTextures() {
    const make = (base, specks, extra) => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const ctx = c.getContext('2d');
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 256, 256);
      for (const [color, n, rmin, rmax] of specks) {
        ctx.fillStyle = color;
        for (let i = 0; i < n; i++) {
          const r = U.rand(rmin, rmax);
          ctx.fillRect(Math.random() * 256, Math.random() * 256, r, r);
        }
      }
      extra && extra(ctx);
      return c;
    };
    return {
      asphalt: make('#3a3d44', [
        ['rgba(255,255,255,0.06)', 2600, 1, 2.2],
        ['rgba(0,0,0,0.22)', 2200, 1, 2.6],
        ['rgba(120,124,135,0.25)', 700, 1, 1.5],
      ], (ctx) => {
        // faint tar patches / cracks
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
          ctx.beginPath();
          let x = Math.random() * 256, y = Math.random() * 256;
          ctx.moveTo(x, y);
          for (let k = 0; k < 5; k++) { x += U.rand(-14, 14); y += U.rand(6, 22); ctx.lineTo(x, y); }
          ctx.stroke();
        }
      }),
      gravel: make('#6f665c', [
        ['rgba(255,255,255,0.14)', 1800, 1, 3],
        ['rgba(0,0,0,0.3)', 1600, 1, 3],
        ['rgba(150,120,90,0.35)', 600, 1, 2],
      ]),
      grass: make('#2f4d26', [
        ['rgba(90,140,60,0.35)', 2400, 1, 3],
        ['rgba(0,0,0,0.3)', 1800, 1, 3],
        ['rgba(140,120,60,0.18)', 500, 1, 2],
      ]),
    };
  }

  /* ---------- projection ---------- */
  tOf(z) {
    const R = CONFIG.ROAD;
    return U.clamp((z - R.zNear) / (R.zFar - R.zNear), 0, 1);
  }
  curveOffset(z, curve) {
    const t = this.tOf(z);
    return curve * t * t * this.W * 0.55;
  }
  hillOffset(z, hill) {
    const t = this.tOf(z);
    return hill * t * t * this.hillAmp;
  }
  camX(game) {
    return -game.player.x * this.nearHalfW * 0.12;
  }
  yAt(s) {
    return this.horizonY + (this.playerY - this.horizonY) * s;
  }
  project(d, x, game) {
    const R = CONFIG.ROAD;
    const z = R.zNear + (d - game.player.d) * this.zPerMeter;
    if (z < 0.7 || z > R.zFar) return null;
    const s = R.zNear / z;
    const halfW = this.nearHalfW * s;
    const cx = this.W / 2 + this.camX(game) * s + this.curveOffset(z, game.curve);
    return { x: cx + x * halfW, y: this.yAt(s) - this.hillOffset(z, game.hill), s, z, halfW, cx };
  }
  fogAlpha(z) {
    const R = CONFIG.ROAD;
    return U.clamp((R.zFar - z) / (R.zFar * 0.3), 0, 1);
  }
  playerScreen(game) {
    return { x: this.W / 2 + game.player.x * this.nearHalfW + this.camX(game), y: this.playerY };
  }

  /* ---------- frame ---------- */
  render(game) {
    const ctx = this.ctx;
    ctx.save();
    if (game.shake > 0.01) ctx.translate(U.rand(-1, 1) * game.shake * 12, U.rand(-1, 1) * game.shake * 9);
    this.drawSky(game);
    this.drawGround(game);
    this.drawHeadlights(game);
    this.drawObjects(game);
    this.drawParticles(game);
    ctx.restore();
    this.drawPost(game);
  }

  /* ---------- sky ---------- */
  drawSky(game) {
    const ctx = this.ctx;
    const { W, H, horizonY } = this;
    const P = CONFIG.PALETTE.sky;
    const g = ctx.createLinearGradient(0, 0, 0, horizonY);
    g.addColorStop(0, P[0]);
    g.addColorStop(0.35, P[1]);
    g.addColorStop(0.7, P[2]);
    g.addColorStop(0.92, P[3]);
    g.addColorStop(1, P[4]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, horizonY + 2);

    const t = game.time;
    ctx.fillStyle = '#fff';
    for (const s of this.stars) {
      ctx.globalAlpha = (0.3 + 0.6 * Math.abs(Math.sin(t * 1.1 + s.p))) * (1 - s.y * 1.6);
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * horizonY, s.r, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const par = -game.curve * W * 0.1;

    // sun + glow
    const sunR = Math.min(W, H) * 0.075;
    const sx = W * 0.6 + par * 0.4;
    const sy = horizonY - sunR * 0.9;
    let sg = ctx.createRadialGradient(sx, sy, sunR * 0.5, sx, sy, sunR * 7);
    sg.addColorStop(0, 'rgba(255,190,120,0.55)');
    sg.addColorStop(0.3, 'rgba(255,150,100,0.18)');
    sg.addColorStop(1, 'rgba(255,150,100,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, horizonY + 2);
    sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sunR);
    sg.addColorStop(0, '#fff4d6');
    sg.addColorStop(0.7, '#ffd08a');
    sg.addColorStop(1, '#ffab6b');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sx, sy, sunR, 0, 6.283);
    ctx.fill();

    // clouds
    for (const c of this.clouds) {
      const cx = ((c.x + t * c.v) % 1.3) * W - W * 0.15 + par * 0.3;
      const cy = c.y * horizonY;
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, c.w * W);
      cg.addColorStop(0, `rgba(255,205,180,${c.a})`);
      cg.addColorStop(0.5, `rgba(255,190,170,${c.a * 0.5})`);
      cg.addColorStop(1, 'rgba(255,190,170,0)');
      ctx.fillStyle = cg;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, (c.h * H) / (c.w * W));
      ctx.beginPath();
      ctx.arc(0, 0, c.w * W, 0, 6.283);
      ctx.fill();
      ctx.restore();
    }

    // mountains (two layers, atmospheric perspective)
    this._ridge(this.mountainsFar, par * 0.5, '#4e5f8e', '#3b4a75', horizonY);
    this._ridge(this.mountainsNear, par * 0.8, '#2b3557', '#1e2540', horizonY);

    // distant city lights just above the horizon
    for (const l of this.cityLights) {
      ctx.fillStyle = l.warm ? 'rgba(255,214,150,0.8)' : 'rgba(170,220,255,0.7)';
      ctx.fillRect(l.x * W + par, horizonY - l.y * H - 1, l.w, 1.4);
    }
    // haze band on the horizon
    const hz = ctx.createLinearGradient(0, horizonY - H * 0.05, 0, horizonY + 6);
    hz.addColorStop(0, 'rgba(247,192,122,0)');
    hz.addColorStop(1, 'rgba(247,192,122,0.5)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, horizonY - H * 0.05, W, H * 0.05 + 6);
  }

  _ridge(pts, par, top, bottom, baseY) {
    const ctx = this.ctx;
    const { W, H } = this;
    const g = ctx.createLinearGradient(0, baseY - H * 0.12, 0, baseY);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-W, baseY + 2);
    for (const p of pts) ctx.lineTo(p.x * W + par, baseY - p.h * H);
    ctx.lineTo(W * 2, baseY + 2);
    ctx.closePath();
    ctx.fill();
  }

  /* ---------- road & terrain ---------- */
  buildSlices(game) {
    const R = CONFIG.ROAD;
    const { W, H, horizonY, playerY, nearHalfW } = this;
    const N = 120;
    const sMin = R.zNear / R.zFar;
    const sMax = (H + 30 - horizonY) / (playerY - horizonY);
    const cam = this.camX(game);
    const slices = new Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const s = sMax + (sMin - sMax) * (i / N);
      const z = R.zNear / s;
      slices[i] = {
        y: this.yAt(s) - this.hillOffset(z, game.hill),
        hw: nearHalfW * s,
        cx: W / 2 + cam * s + this.curveOffset(z, game.curve),
        d: game.player.d + (z - R.zNear) / this.zPerMeter,
        s,
        z,
      };
    }
    return slices;
  }

  drawGround(game) {
    const ctx = this.ctx;
    const { W, H, horizonY } = this;
    const R = CONFIG.ROAD;
    const PAL = CONFIG.PALETTE;
    const slices = (this.slices = this.buildSlices(game));
    const N = slices.length - 1;
    const lanes = CONFIG.LANES;
    const tex = this.tex;

    ctx.fillStyle = '#243a1e';
    ctx.fillRect(0, horizonY, W, H - horizonY);

    // far -> near so uphill slices overlap correctly
    for (let i = N - 1; i >= 0; i--) {
      const a = slices[i]; // near
      const b = slices[i + 1]; // far
      const y0 = Math.min(a.y, b.y);
      const hgt = Math.max(1, Math.abs(a.y - b.y) + 1);
      const len = Math.max(0.01, b.d - a.d);
      const v0 = ((a.d / R.textureLen) % 1 + 1) % 1;
      let srcH = (len / R.textureLen) * 256;
      const srcY = v0 * 256;
      if (srcY + srcH > 256) srcH = 256 - srcY;
      srcH = Math.max(1, srcH);
      const fog = 1 - this.fogAlpha(b.z);

      // grass (full width)
      ctx.drawImage(tex.grass, 0, srcY, 256, srcH, -2, y0, W + 4, hgt);

      // gravel shoulders
      this._clipQuad(a.cx - a.hw * R.shoulder, a.y + 1, a.cx - a.hw, b.cx - b.hw * R.shoulder, b.y, b.cx - b.hw);
      ctx.drawImage(tex.gravel, 0, srcY, 256, srcH, Math.min(a.cx - a.hw * R.shoulder, b.cx - b.hw * R.shoulder) - 1, y0, Math.abs(a.hw * (R.shoulder - 1)) + Math.abs(a.cx - b.cx) + 4, hgt);
      ctx.restore();
      this._clipQuad(a.cx + a.hw, a.y + 1, a.cx + a.hw * R.shoulder, b.cx + b.hw, b.y, b.cx + b.hw * R.shoulder);
      ctx.drawImage(tex.gravel, 0, srcY, 256, srcH, Math.min(a.cx + a.hw, b.cx + b.hw) - 1, y0, Math.abs(a.hw * (R.shoulder - 1)) + Math.abs(a.cx - b.cx) + 4, hgt);
      ctx.restore();

      // asphalt
      this._clipQuad(a.cx - a.hw, a.y + 1, a.cx + a.hw, b.cx - b.hw, b.y, b.cx + b.hw);
      ctx.drawImage(tex.asphalt, 0, srcY, 256, srcH, Math.min(a.cx - a.hw, b.cx - b.hw) - 1, y0, a.hw * 2 + Math.abs(a.cx - b.cx) + 2, hgt);
      ctx.restore();

      // edge lines
      ctx.fillStyle = PAL.edge;
      const ew = 0.018;
      for (const side of [-1, 1]) {
        const e = side * R.edgeLine;
        quad(ctx, a.cx + (e - ew) * a.hw, a.y + 1, a.cx + (e + ew) * a.hw, b.cx + (e - ew) * b.hw, b.y, b.cx + (e + ew) * b.hw);
      }
      // lane dashes
      const m = ((a.d % R.dashPeriod) + R.dashPeriod) % R.dashPeriod;
      if (m < R.dashLen) {
        ctx.fillStyle = PAL.lane;
        for (let k = 1; k < lanes; k++) {
          const lx = -1 + (2 * k) / lanes;
          const wa = Math.max(0.8, a.hw * 0.011);
          const wb = Math.max(0.5, b.hw * 0.011);
          quad(ctx, a.cx + lx * a.hw - wa, a.y + 1, a.cx + lx * a.hw + wa, b.cx + lx * b.hw - wb, b.y, b.cx + lx * b.hw + wb);
        }
      }

      // guardrail
      const rh = a.hw * 0.055;
      const rhb = b.hw * 0.055;
      for (const side of [-1, 1]) {
        const rx = side * R.rail;
        const xa = a.cx + rx * a.hw;
        const xb = b.cx + rx * b.hw;
        // posts every 8 m
        const pm = ((a.d % 8) + 8) % 8;
        if (pm < len) {
          ctx.fillStyle = '#4a4f58';
          ctx.fillRect(xa - Math.max(1, rh * 0.18), a.y - rh * 1.15, Math.max(1.5, rh * 0.36), rh * 1.15);
        }
        const g = ctx.createLinearGradient(0, a.y - rh, 0, a.y - rh * 0.35);
        g.addColorStop(0, '#c9ced8');
        g.addColorStop(0.5, '#8a9099');
        g.addColorStop(1, '#5c616b');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(xa - 1, a.y - rh);
        ctx.lineTo(xa + 1, a.y - rh);
        ctx.lineTo(xb + 1, b.y - rhb);
        ctx.lineTo(xb - 1, b.y - rhb);
        ctx.lineTo(xb - 1, b.y - rhb * 0.35);
        ctx.lineTo(xa - 1, a.y - rh * 0.35);
        ctx.closePath();
        ctx.fill();
      }

      // distance fog per slice
      if (fog > 0.01) {
        ctx.fillStyle = `rgba(214,160,130,${fog * 0.55})`;
        ctx.fillRect(0, y0, W, hgt);
      }
    }

    // lamp light pools on the asphalt
    for (const lp of this.lampPositions(game)) {
      const p = this.project(lp.d, lp.side * 0.55, game);
      if (!p) continue;
      const a = this.fogAlpha(p.z) * 0.14;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.halfW * 0.7);
      g.addColorStop(0, `rgba(255,220,160,${a})`);
      g.addColorStop(1, 'rgba(255,220,160,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(1, 0.28);
      ctx.beginPath();
      ctx.arc(0, 0, p.halfW * 0.7, 0, 6.283);
      ctx.fill();
      ctx.restore();
    }

    // finish line
    if (game.mode === 'race') {
      const fd = CONFIG.RACE.length;
      const near = this.project(fd, 0, game);
      const far = this.project(fd + 3, 0, game);
      if (near && far) {
        const cells = 14;
        for (let c = 0; c < cells; c++) {
          const x0 = -1 + (2 * c) / cells;
          const x1 = -1 + (2 * (c + 1)) / cells;
          ctx.fillStyle = c & 1 ? '#f2f2ee' : '#15151a';
          quad(ctx, near.cx + x0 * near.halfW, near.y, near.cx + x1 * near.halfW, far.cx + x0 * far.halfW, far.y, far.cx + x1 * far.halfW);
        }
      }
    }
  }

  _clipQuad(x1, y1, x2, x3, y3, x4) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y1);
    ctx.lineTo(x4, y3);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.clip();
  }

  drawHeadlights(game) {
    if (game.state === 'menu') return;
    const ctx = this.ctx;
    const p = this.playerScreen(game);
    const w = this.laneW * 0.6;
    const h = w * 1.5;
    const top = this.project(game.player.d + 70, game.player.x, game);
    if (!top) return;
    for (const side of [-0.28, 0.28]) {
      const g = ctx.createLinearGradient(0, p.y - h * 0.9, 0, top.y);
      g.addColorStop(0, 'rgba(255,245,220,0.16)');
      g.addColorStop(1, 'rgba(255,245,220,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(p.x + side * w - w * 0.12, p.y - h * 0.85);
      ctx.lineTo(p.x + side * w + w * 0.12, p.y - h * 0.85);
      ctx.lineTo(top.x + side * top.halfW * 0.45, top.y);
      ctx.lineTo(top.x + side * top.halfW * 0.15, top.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  /* ---------- roadside props (deterministic from distance) ---------- */
  static hash(k) {
    const x = Math.sin(k * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }
  lampPositions(game) {
    const out = [];
    const period = 48;
    const start = Math.floor(game.player.d / period);
    const end = Math.floor((game.player.d + CONFIG.ROAD.viewRange) / period);
    for (let k = start; k <= end; k++) out.push({ d: k * period, side: k & 1 ? 1 : -1 });
    return out;
  }
  props(game) {
    const list = [];
    const pd = game.player.d;
    const range = CONFIG.ROAD.viewRange;
    const H = Renderer.hash;
    const add = (period, offset, fn) => {
      const start = Math.floor((pd - 20 - offset) / period);
      const end = Math.floor((pd + range - offset) / period);
      for (let k = start; k <= end; k++) fn(k, k * period + offset);
    };
    for (const lp of this.lampPositions(game)) list.push({ kind: 'lamp', d: lp.d, x: lp.side * 1.46, side: lp.side });
    add(26, 7, (k, d) => {
      const side = H(k) < 0.5 ? -1 : 1;
      if (H(k + 0.3) < 0.2) return;
      list.push({ kind: 'tree', d, x: side * (1.75 + H(k + 0.7) * 1.1), size: 0.55 + H(k + 0.11) * 0.5, pine: H(k + 0.5) < 0.4, side });
    });
    add(210, 60, (k, d) => list.push({ kind: 'sign', d, x: 1.5, side: 1, variant: k % 3 }));
    add(380, 150, (k, d) => list.push({ kind: 'billboard', d, x: (k & 1 ? -1 : 1) * 1.95, side: k & 1 ? -1 : 1, variant: k % 4 }));
    add(760, 420, (k, d) => list.push({ kind: 'overpass', d, x: 0 }));
    if (game.mode === 'race') list.push({ kind: 'gantry', d: CONFIG.RACE.length, x: 0 });
    return list;
  }

  /* ---------- objects ---------- */
  drawObjects(game) {
    const ctx = this.ctx;
    const list = [];
    const R = CONFIG.ROAD;

    for (const pr of this.props(game)) {
      const p = this.project(pr.d, pr.x, game);
      if (p) list.push({ z: p.z + 0.001, p, kind: 'prop', e: pr });
    }
    for (const o of game.obstacles) {
      const p = this.project(o.d, o.x, game);
      if (p) list.push({ z: p.z, p, kind: 'obstacle', e: o });
    }
    for (const k of game.pickups) {
      if (k.taken) continue;
      const p = this.project(k.d, k.x, game);
      if (p) list.push({ z: p.z, p, kind: 'pickup', e: k });
    }
    for (const r of game.rivals) {
      const p = this.project(r.d, r.x, game);
      if (p) list.push({ z: p.z, p, kind: 'rival', e: r });
    }
    const pl = game.player;
    const ps = this.playerScreen(game);
    list.push({ z: R.zNear, p: { x: ps.x, y: ps.y, s: 1, z: 1, halfW: this.nearHalfW }, kind: 'player', e: pl });
    list.sort((a, b) => b.z - a.z);

    for (const it of list) {
      ctx.save();
      ctx.globalAlpha = this.fogAlpha(it.z);
      switch (it.kind) {
        case 'prop':
          this.drawProp(it.e, it.p, game);
          break;
        case 'obstacle':
          if (it.e.type === 'car') this.drawCar(it.p, it.e.color, it.e.style || 'sport', {});
          else this.drawObstacle(it.e, it.p, game.time);
          break;
        case 'pickup':
          this.drawPickup(it.e, it.p, game.time);
          break;
        case 'rival':
          this.drawCar(it.p, it.e.color, it.e.style, { tilt: (it.e.targetX - it.e.x) * 0.4, label: it.e.name });
          break;
        case 'player': {
          const blink = pl.invuln > 0 && Math.floor(game.time * 14) % 2 === 0;
          if (blink) ctx.globalAlpha = 0.35;
          this.drawCar(it.p, pl.color, pl.style, { tilt: pl.tilt, nitro: pl.nitroActive, shield: pl.shield, brake: game.input.brake && game.state === 'playing', time: game.time, player: true });
          break;
        }
      }
      ctx.restore();
    }
  }

  drawCar(p, color, style, o) {
    const ctx = this.ctx;
    const sprite = Sprites.car(color, style);
    const w = this.laneW * 0.66 * p.s;
    const h = w * (Sprites.CAR_H / Sprites.CAR_W);
    const groundFrac = Sprites.GROUND / Sprites.CAR_H;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (o.tilt) ctx.rotate(U.clamp(o.tilt, -0.1, 0.1));

    if (o.nitro) {
      for (const ex of [-0.3, 0.3]) {
        const len = h * U.rand(0.3, 0.6);
        const fg = ctx.createLinearGradient(0, -h * 0.02, 0, len);
        fg.addColorStop(0, 'rgba(255,255,255,0.95)');
        fg.addColorStop(0.25, 'rgba(90,200,255,0.9)');
        fg.addColorStop(1, 'rgba(60,80,255,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(ex * w - w * 0.07, -h * 0.03);
        ctx.lineTo(ex * w + w * 0.07, -h * 0.03);
        ctx.lineTo(ex * w, len);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.drawImage(sprite, -w / 2, -h * groundFrac, w, h);

    if (o.brake) {
      const gl = Sprites.glow('#ff2040', 96);
      const gs = w * 0.5;
      ctx.globalAlpha *= 0.85;
      ctx.drawImage(gl, -w * 0.42 - gs / 2, -h * 0.4 - gs / 2, gs, gs);
      ctx.drawImage(gl, w * 0.42 - gs / 2, -h * 0.4 - gs / 2, gs, gs);
      ctx.globalAlpha /= 0.85;
    }

    if (o.shield) {
      const pulse = 0.9 + 0.1 * Math.sin((o.time || 0) * 6);
      ctx.strokeStyle = 'rgba(120,200,255,0.85)';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(80,160,255,0.12)';
      ctx.beginPath();
      ctx.ellipse(0, -h * 0.45, w * 0.8 * pulse, h * 0.55 * pulse, 0, 0, 6.283);
      ctx.fill();
      ctx.stroke();
    }

    if (o.label && p.s > 0.2) {
      const k = Math.min(1, p.s * 1.5);
      ctx.font = `600 ${Math.max(9, 12 * k)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(o.label).width + 12;
      const ly = -h * 0.98 - 12 * k;
      ctx.fillStyle = 'rgba(10,12,20,0.7)';
      rrect(ctx, -tw / 2, ly - 8 * k, tw, 16 * k, 8 * k);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(o.label, 0, ly);
      ctx.fillStyle = color;
      ctx.fillRect(-tw / 2 - 3 * k, ly - 8 * k, 3 * k, 16 * k);
    }
    ctx.restore();
  }

  drawProp(pr, p, game) {
    const ctx = this.ctx;
    const u = p.halfW; // unit: road half-width at this depth
    ctx.save();
    ctx.translate(p.x, p.y);
    switch (pr.kind) {
      case 'lamp': {
        const hgt = u * 1.05;
        const pw = Math.max(1, u * 0.018);
        const g = ctx.createLinearGradient(-pw, 0, pw, 0);
        g.addColorStop(0, '#5a606a');
        g.addColorStop(0.5, '#a7adb8');
        g.addColorStop(1, '#4a4f58');
        ctx.fillStyle = g;
        ctx.fillRect(-pw, -hgt, pw * 2, hgt);
        // arm toward the road
        const arm = -pr.side * u * 0.22;
        ctx.strokeStyle = '#8b919b';
        ctx.lineWidth = pw * 1.6;
        ctx.beginPath();
        ctx.moveTo(0, -hgt);
        ctx.quadraticCurveTo(arm * 0.5, -hgt - u * 0.05, arm, -hgt + u * 0.02);
        ctx.stroke();
        ctx.fillStyle = '#d9dde6';
        ctx.fillRect(arm - u * 0.035, -hgt + u * 0.01, u * 0.07, u * 0.02);
        const gl = Sprites.glow('#ffd9a0', 96);
        const gs = u * 0.42;
        ctx.drawImage(gl, arm - gs / 2, -hgt + u * 0.02 - gs / 2, gs, gs);
        break;
      }
      case 'tree': {
        const sz = u * pr.size;
        const trunkH = sz * (pr.pine ? 0.25 : 0.45);
        ctx.fillStyle = '#3a2a1e';
        ctx.fillRect(-sz * 0.05, -trunkH, sz * 0.1, trunkH);
        if (pr.pine) {
          for (let i = 0; i < 3; i++) {
            const ty = -trunkH - i * sz * 0.28;
            const tw = sz * (0.55 - i * 0.13);
            const g = ctx.createLinearGradient(-tw, 0, tw, 0);
            g.addColorStop(0, '#0f2a17');
            g.addColorStop(0.6, '#1f4d2a');
            g.addColorStop(1, '#2f6a38');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(-tw, ty);
            ctx.lineTo(tw, ty);
            ctx.lineTo(0, ty - sz * 0.42);
            ctx.closePath();
            ctx.fill();
          }
        } else {
          const cy = -trunkH - sz * 0.32;
          for (const [ox, oy, r] of [[-0.22, 0.05, 0.3], [0.22, 0.05, 0.3], [0, -0.16, 0.34], [0, 0.12, 0.28]]) {
            const g = ctx.createRadialGradient(ox * sz - r * sz * 0.3, cy + oy * sz - r * sz * 0.3, r * sz * 0.1, ox * sz, cy + oy * sz, r * sz);
            g.addColorStop(0, '#3f7a3a');
            g.addColorStop(1, '#14301a');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(ox * sz, cy + oy * sz, r * sz, 0, 6.283);
            ctx.fill();
          }
        }
        break;
      }
      case 'sign': {
        const ph = u * 0.42;
        const pw = Math.max(1, u * 0.014);
        ctx.fillStyle = '#7d838d';
        ctx.fillRect(-pw, -ph, pw * 2, ph);
        const sw = u * 0.22;
        if (pr.variant === 0) {
          // speed limit
          ctx.fillStyle = '#f5f5f0';
          ctx.beginPath();
          ctx.arc(0, -ph - sw * 0.5, sw * 0.5, 0, 6.283);
          ctx.fill();
          ctx.strokeStyle = '#d62828';
          ctx.lineWidth = sw * 0.1;
          ctx.stroke();
          ctx.fillStyle = '#111';
          ctx.font = `700 ${sw * 0.42}px Rajdhani, Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('120', 0, -ph - sw * 0.5);
        } else if (pr.variant === 1) {
          // km marker
          ctx.fillStyle = '#1b7a3d';
          rrect(ctx, -sw * 0.55, -ph - sw * 0.7, sw * 1.1, sw * 0.7, sw * 0.06);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = Math.max(0.6, sw * 0.03);
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = `700 ${sw * 0.32}px Rajdhani, Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${(pr.d / 1000).toFixed(1)} km`, 0, -ph - sw * 0.35);
        } else {
          // chevron
          ctx.fillStyle = '#111';
          rrect(ctx, -sw * 0.6, -ph - sw * 0.6, sw * 1.2, sw * 0.6, sw * 0.05);
          ctx.fill();
          ctx.strokeStyle = '#ffcc00';
          ctx.lineWidth = Math.max(0.8, sw * 0.08);
          const dir = game.curve >= 0 ? 1 : -1;
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(i * sw * 0.3 - dir * sw * 0.1, -ph - sw * 0.5);
            ctx.lineTo(i * sw * 0.3 + dir * sw * 0.1, -ph - sw * 0.3);
            ctx.lineTo(i * sw * 0.3 - dir * sw * 0.1, -ph - sw * 0.1);
            ctx.stroke();
          }
        }
        break;
      }
      case 'billboard': {
        const bw = u * 0.9;
        const bh = bw * 0.42;
        const ph = u * 0.55;
        const pw = Math.max(1, u * 0.02);
        ctx.fillStyle = '#4a4f58';
        ctx.fillRect(-bw * 0.3 - pw, -ph, pw * 2, ph);
        ctx.fillRect(bw * 0.3 - pw, -ph, pw * 2, ph);
        ctx.fillStyle = '#1c1e26';
        rrect(ctx, -bw / 2 - bw * 0.02, -ph - bh - bw * 0.02, bw + bw * 0.04, bh + bw * 0.04, bw * 0.02);
        ctx.fill();
        const texts = [
          ['NEON RUSH', 'SEASON ONE', '#0fa3b1', '#062a30'],
          ['NITRO', 'FUEL THE RUSH', '#f9a825', '#3a2400'],
          ['● LIVE', 'RACE WITH CHAT', '#e63946', '#2a0a0e'],
          ['GARAGE', 'NEW BODY KITS', '#8338ec', '#1c0b33'],
        ][pr.variant];
        const g = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
        g.addColorStop(0, texts[3]);
        g.addColorStop(1, U.shade(texts[3], 30));
        ctx.fillStyle = g;
        ctx.fillRect(-bw / 2, -ph - bh, bw, bh);
        ctx.fillStyle = texts[2];
        ctx.font = `700 ${bh * 0.36}px Rajdhani, Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(texts[0], 0, -ph - bh * 0.62);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = `600 ${bh * 0.18}px Inter, sans-serif`;
        ctx.fillText(texts[1], 0, -ph - bh * 0.28);
        // floodlight glow at the bottom
        const gl = Sprites.glow('#ffffff', 96);
        ctx.globalAlpha *= 0.5;
        ctx.drawImage(gl, -bw * 0.25, -ph - bh * 0.35, bw * 0.5, bh * 0.7);
        break;
      }
      case 'overpass':
      case 'gantry': {
        const span = u * (pr.kind === 'gantry' ? 1.5 : 1.6);
        const hgt = u * 0.7;
        const th = u * (pr.kind === 'gantry' ? 0.1 : 0.16);
        const pw = u * (pr.kind === 'gantry' ? 0.03 : 0.1);
        ctx.fillStyle = pr.kind === 'gantry' ? '#2b2f3a' : '#6d6f78';
        ctx.fillRect(-span - pw, -hgt, pw * 2, hgt);
        ctx.fillRect(span - pw, -hgt, pw * 2, hgt);
        const g = ctx.createLinearGradient(0, -hgt - th, 0, -hgt);
        g.addColorStop(0, pr.kind === 'gantry' ? '#3a3f4d' : '#8e909a');
        g.addColorStop(1, pr.kind === 'gantry' ? '#1b1e28' : '#5b5d66');
        ctx.fillStyle = g;
        ctx.fillRect(-span - pw * 1.5, -hgt - th, span * 2 + pw * 3, th);
        if (pr.kind === 'overpass') {
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(-span - pw * 1.5, -hgt, span * 2 + pw * 3, th * 0.2);
          ctx.fillStyle = '#b9bcc5';
          ctx.fillRect(-span - pw * 1.5, -hgt - th - th * 0.18, span * 2 + pw * 3, th * 0.18);
        } else {
          ctx.fillStyle = '#f2f2ee';
          ctx.font = `700 ${th * 0.75}px Rajdhani, Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('FINISH', 0, -hgt - th * 0.5);
          // chequered trim
          const cells = 16;
          for (let c = 0; c < cells; c++) {
            ctx.fillStyle = c & 1 ? '#f2f2ee' : '#15151a';
            ctx.fillRect(-span + (c / cells) * span * 2, -hgt - th - th * 0.25, (span * 2) / cells, th * 0.25);
          }
        }
        break;
      }
    }
    ctx.restore();
  }

  drawObstacle(o, p, time) {
    const ctx = this.ctx;
    const lw = this.laneW * p.s;
    ctx.save();
    ctx.translate(p.x, p.y);
    switch (o.type) {
      case 'cone': {
        const w = lw * 0.3;
        const h = w * 1.35;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.ellipse(w * 0.15, 0, w * 0.7, w * 0.15, 0, 0, 6.283);
        ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(-w * 0.6, -w * 0.08, w * 1.2, w * 0.14);
        const cg = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
        cg.addColorStop(0, '#ff9a2e');
        cg.addColorStop(0.5, '#ff6a00');
        cg.addColorStop(1, '#b84300');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.moveTo(-w / 2, 0);
        ctx.lineTo(w / 2, 0);
        ctx.lineTo(w * 0.08, -h);
        ctx.lineTo(-w * 0.08, -h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
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
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(-w / 2, -h * 0.05, w, h * 0.15);
        ctx.fillStyle = '#3a3d44';
        ctx.fillRect(-w * 0.42, -h * 0.5, w * 0.06, h * 0.5);
        ctx.fillRect(w * 0.36, -h * 0.5, w * 0.06, h * 0.5);
        ctx.save();
        ctx.beginPath();
        ctx.rect(-w / 2, -h * 1.2, w, h * 0.75);
        ctx.clip();
        ctx.fillStyle = '#f2f2f2';
        ctx.fillRect(-w / 2, -h * 1.2, w, h * 0.75);
        ctx.fillStyle = '#e63946';
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
        const blink = Math.floor(time * 3 + o.seed * 10) % 2 === 0;
        if (blink) {
          const gl = Sprites.glow('#ffcc33', 96);
          ctx.drawImage(gl, -w * 0.12, -h * 1.32 - w * 0.12, w * 0.24, w * 0.24);
        }
        ctx.fillStyle = blink ? '#ffe14d' : '#8a7a1a';
        ctx.beginPath();
        ctx.arc(0, -h * 1.32, Math.max(1.5, w * 0.04), 0, 6.283);
        ctx.fill();
        break;
      }
      case 'rock': {
        const w = lw * 0.48;
        const h = w * 0.7;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.ellipse(0, 0, w * 0.6, w * 0.14, 0, 0, 6.283);
        ctx.fill();
        ctx.fillStyle = '#6b6f7a';
        ctx.beginPath();
        ctx.moveTo(-w / 2, 0);
        ctx.lineTo(-w * 0.42, -h * 0.55);
        ctx.lineTo(-w * 0.1, -h);
        ctx.lineTo(w * 0.3, -h * 0.85);
        ctx.lineTo(w / 2, -h * 0.3);
        ctx.lineTo(w * 0.4, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#8d919c';
        ctx.beginPath();
        ctx.moveTo(-w * 0.42, -h * 0.55);
        ctx.lineTo(-w * 0.1, -h);
        ctx.lineTo(w * 0.05, -h * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#4a4e58';
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
        const ry = rx * 0.3;
        const g = ctx.createRadialGradient(0, -ry * 0.2, 0, 0, 0, rx);
        g.addColorStop(0, 'rgba(30,30,40,0.95)');
        g.addColorStop(0.7, 'rgba(15,15,22,0.9)');
        g.addColorStop(1, 'rgba(10,10,15,0.5)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, 6.283);
        ctx.fill();
        ctx.strokeStyle = `hsla(${(time * 90 + o.seed * 360) % 360},80%,65%,0.35)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, -ry * 0.1, rx * 0.7, ry * 0.55, 0, 0, 6.283);
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  drawPickup(k, p, time) {
    const ctx = this.ctx;
    const lw = this.laneW * p.s;
    const bob = Math.sin(time * 4 + k.phase) * lw * 0.05;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 0, lw * 0.16, lw * 0.05, 0, 0, 6.283);
    ctx.fill();
    switch (k.type) {
      case 'coin': {
        const r = lw * 0.15;
        const sq = Math.abs(Math.cos(time * 5 + k.phase));
        ctx.drawImage(Sprites.glow('#ffd166', 96), -r * 1.8, -r * 1.4 - bob - r * 1.8, r * 3.6, r * 3.6);
        const g = ctx.createLinearGradient(-r, 0, r, 0);
        g.addColorStop(0, '#ffe680');
        g.addColorStop(0.5, '#ffc107');
        g.addColorStop(1, '#e09b00');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, -r * 1.4 - bob, Math.max(r * 0.15, r * sq), r, 0, 0, 6.283);
        ctx.fill();
        ctx.strokeStyle = '#8a6100';
        ctx.lineWidth = Math.max(1, r * 0.12);
        ctx.beginPath();
        ctx.ellipse(0, -r * 1.4 - bob, Math.max(r * 0.1, r * sq * 0.65), r * 0.65, 0, 0, 6.283);
        ctx.stroke();
        break;
      }
      case 'nitro': {
        const w = lw * 0.26;
        const h = w * 1.5;
        ctx.drawImage(Sprites.glow('#39c6ff', 96), -h * 0.8, -h * 0.55 - bob - h * 0.8, h * 1.6, h * 1.6);
        const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
        g.addColorStop(0, '#7df9ff');
        g.addColorStop(0.5, '#00b7d6');
        g.addColorStop(1, '#00688f');
        ctx.fillStyle = g;
        rrect(ctx, -w / 2, -h - bob, w, h, w * 0.3);
        ctx.fill();
        ctx.fillStyle = '#e6fdff';
        rrect(ctx, -w * 0.2, -h * 1.15 - bob, w * 0.4, h * 0.18, w * 0.1);
        ctx.fill();
        ctx.fillStyle = '#04263a';
        ctx.font = `800 ${Math.max(6, h * 0.5)}px Rajdhani, Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('N', 0, -h * 0.5 - bob);
        break;
      }
      case 'shield': {
        const r = lw * 0.18;
        ctx.drawImage(Sprites.glow('#8ea6ff', 96), -r * 2, -r * 1.3 - bob - r * 2, r * 4, r * 4);
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
      ctx.globalAlpha = a * (p.alpha ?? 1);
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
      } else if (p.shape === 'smoke') {
        const r = p.size * (1.6 - a * 0.6);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, p.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, 6.283);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a, 0, 6.283);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- post effects ---------- */
  drawPost(game) {
    const ctx = this.ctx;
    const { W, H } = this;
    const p = game.player;

    // nitro / high-speed radial zoom blur toward the vanishing point
    const boost = p.nitroActive ? 1 : U.clamp((p.speed - CONFIG.PLAYER.maxSpeed * 0.92) / 25, 0, 0.5);
    if (boost > 0.02 && game.state !== 'menu') {
      const vx = W / 2 + this.curveOffset(CONFIG.ROAD.zFar, game.curve) * 0.6;
      const vy = this.horizonY;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i <= 2; i++) {
        const k = 1 + 0.018 * i * boost;
        ctx.globalAlpha = 0.16 * boost;
        ctx.drawImage(this.canvas, 0, 0, this.canvas.width, this.canvas.height, vx - vx * k, vy - vy * k, W * k, H * k);
      }
      ctx.restore();
    }

    // vignette
    const vg = ctx.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.4, W / 2, H * 0.5, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(5,5,12,0.5)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    if (game.flash > 0.01) {
      ctx.fillStyle = `rgba(255,30,60,${0.35 * game.flash})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (p.nitroActive) {
      ctx.fillStyle = 'rgba(80,180,255,0.05)';
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
