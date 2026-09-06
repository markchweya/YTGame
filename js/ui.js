/* DOM layer: screens, HUD, toasts, start lights, leaderboard tables, results. */
const UI = {
  screens: ['menu', 'howto', 'leaderboard', 'settings', 'pause', 'results', 'hud'],
  _fpsAcc: 0,
  _fpsN: 0,
  el: {},
  _speedoLen: 0,
  _lastPos: null,

  init() {
    const ids = [
      'hud', 'menu', 'howto', 'leaderboard', 'pause', 'results', 'toasts', 'startlights', 'startlights-text',
      'hud-position', 'hud-racers', 'hud-distance', 'hud-score', 'hud-time', 'hud-time-label', 'hud-crashes', 'hud-standings',
      'hud-speed', 'speedo-fill', 'speedo-needle', 'speedo-ticks', 'hud-gear', 'hud-nitro', 'hud-coins', 'hud-shield', 'hud-combo',
      'race-progress', 'race-progress-wrap', 'best-race', 'best-endless', 'lb-body', 'lb-empty',
      'results-kicker', 'results-position', 'results-title', 'results-rank', 'results-standings',
      'res-score', 'res-distance', 'res-time', 'res-topspeed', 'res-coins', 'res-overtakes', 'res-crashes', 'touch-controls', 'settings', 'hud-fps', 'results-sectors',
    ];
    ids.forEach((id) => (this.el[id] = document.getElementById(id)));
    const path = this.el['speedo-fill'];
    this._speedoLen = path.getTotalLength();
    path.style.strokeDasharray = `${this._speedoLen}`;
    path.style.strokeDashoffset = `${this._speedoLen}`;
    this._buildTicks();
    this.el['hud-nitro'].innerHTML = Array.from({ length: 10 }, () => '<i></i>').join('');
    this._segments = [...this.el['hud-nitro'].children];
    if (!U.isTouch()) this.el['touch-controls'].classList.add('hidden');
  },

  _buildTicks() {
    const g = this.el['speedo-ticks'];
    const maxKmh = 400;
    const n = 20;
    let svg = '';
    for (let i = 0; i <= n; i++) {
      // arc path runs 165° → 375° clockwise (SVG angles), matching the track path
      const a = (165 + (i / n) * 210) * (Math.PI / 180);
      const major = i % 5 === 0;
      const r0 = major ? 62 : 66;
      const r1 = 72;
      const x0 = 100 + Math.cos(a) * r0, y0 = 100 + Math.sin(a) * r0;
      const x1 = 100 + Math.cos(a) * r1, y1 = 100 + Math.sin(a) * r1;
      svg += `<line class="${major ? 'major' : ''}" x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}"/>`;
      if (major) {
        const tx = 100 + Math.cos(a) * 50, ty = 100 + Math.sin(a) * 50;
        svg += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${Math.round((i / n) * maxKmh)}</text>`;
      }
    }
    g.innerHTML = svg;
  },

  show(id) {
    for (const s of this.screens) {
      const e = this.el[s];
      if (!e) continue;
      const keepHud = s === 'hud' && ['pause', 'results'].includes(id);
      if (s === id || keepHud) e.classList.remove('hidden');
      else e.classList.add('hidden');
    }
    document.body.dataset.screen = id;
  },

  showHUD(game) {
    this.show('hud');
    this.el['hud-racers'].textContent = game.rivals.length + 1;
    this.el['race-progress-wrap'].classList.toggle('hidden', game.mode !== 'race');
    this._chips = null;
    this.el['race-progress-wrap'].querySelectorAll('.rival-chip').forEach((c) => c.remove());
    this.el['hud-time-label'].textContent = game.mode === 'endless' ? 'TIME LEFT' : 'TIME';
    this.el['hud-time'].classList.remove('urgent');
    this.updateShield(false);
    this.combo(0);
    this.el.toasts.innerHTML = '';
    this._lastPos = null;
    this.updateStandings(game);
    this.updateHUD(game);
  },

  /* start-light gantry: '3' → 2 red, '2' → 4 red, '1' → 5 red, 'GO!' → all green */
  countdown(text) {
    const box = this.el.startlights;
    const lights = [...box.querySelectorAll('.gantry i')];
    const label = this.el['startlights-text'];
    box.classList.remove('hidden');
    const litCount = { 3: 2, 2: 4, 1: 5 }[text] ?? 5;
    lights.forEach((l, i) => {
      l.className = text === 'GO!' ? 'green' : i < litCount ? 'red' : '';
    });
    label.textContent = text === 'GO!' ? 'GO' : '';
    label.classList.remove('pop');
    void label.offsetWidth;
    if (text === 'GO!') label.classList.add('pop');
    clearTimeout(this._cdTimer);
    if (text === 'GO!') this._cdTimer = setTimeout(() => box.classList.add('hidden'), 900);
  },

  updateHUD(game) {
    const p = game.player;
    const e = this.el;
    if (game.position !== this._lastPos) {
      e['hud-position'].textContent = game.position;
      const pc = e['hud-position'].closest('.pos-cluster');
      pc.classList.remove('bump');
      void pc.offsetWidth;
      pc.classList.add('bump');
      this._lastPos = game.position;
    }
    e['hud-distance'].textContent = U.fmtInt(p.d);
    e['hud-score'].textContent = U.fmtInt(game.score);
    const left = game.timeLeft;
    e['hud-time'].textContent = U.fmtTime(left !== null ? left : game.elapsed);
    e['hud-time'].classList.toggle('urgent', left !== null && left < 10);
    e['hud-crashes'].textContent = game.crashes;
    const kmh = U.kmh(p.speed);
    e['hud-speed'].textContent = kmh;
    const frac = U.clamp(kmh / 400, 0, 1);
    e['speedo-fill'].style.strokeDashoffset = `${this._speedoLen * (1 - frac)}`;
    e['speedo-fill'].classList.toggle('boost', p.nitroActive);
    e['speedo-needle'].style.transform = `rotate(${-105 + frac * 210}deg)`;
    e['hud-gear'].textContent = kmh < 5 ? 'N' : Math.min(6, 1 + Math.floor(kmh / 55));
    const on = Math.round(p.nitro * 10);
    this._segments.forEach((s, i) => s.classList.toggle('on', i < on));
    e['hud-nitro'].classList.toggle('active', p.nitroActive);
    e['hud-coins'].textContent = game.coins;
    if (game.mode === 'race') {
      e['race-progress'].style.width = `${U.clamp(p.d / CONFIG.RACE.length, 0, 1) * 100}%`;
      this._updateChips(game);
    }
  },

  _updateChips(game) {
    const wrap = this.el['race-progress-wrap'];
    if (!this._chips) {
      const mk = (color, name, me) => {
        const d = document.createElement('i');
        d.className = 'rival-chip' + (me ? ' me' : '');
        d.style.background = color;
        d.textContent = name[0].toUpperCase();
        d.title = name;
        wrap.appendChild(d);
        return d;
      };
      this._chips = game.rivals.map((r) => mk(r.color, r.name, false));
      this._meChip = mk(game.player.color, game.playerName, true);
    }
    game.rivals.forEach((r, i) => (this._chips[i].style.left = `${U.clamp(r.d / CONFIG.RACE.length, 0, 1) * 100}%`));
    this._meChip.style.left = `${U.clamp(game.player.d / CONFIG.RACE.length, 0, 1) * 100}%`;
  },

  updateShield(on) {
    this.el['hud-shield'].classList.toggle('hidden', !on);
  },

  /* Rolling FPS readout (updated twice a second); pass dt every frame. */
  tickFps(dt) {
    const el = this.el['hud-fps'];
    if (!el || el.classList.contains('hidden')) return;
    this._fpsAcc += dt;
    this._fpsN++;
    if (this._fpsAcc >= 0.5) {
      el.textContent = `${Math.round(this._fpsN / this._fpsAcc)} FPS`;
      this._fpsAcc = 0;
      this._fpsN = 0;
    }
  },
  showFps(on) {
    this.el['hud-fps'].classList.toggle('hidden', !on);
  },

  /* Surface colour cue: tints the speed readout while off the asphalt. */
  updateSurface(level) {
    const v = this.el['hud-speed'];
    v.classList.toggle('shoulder', level === 1);
    v.classList.toggle('grass', level === 2);
  },

  combo(n) {
    const c = this.el['hud-combo'];
    if (n < 2) {
      c.classList.add('hidden');
      return;
    }
    const mult = Math.min(5, 1 + Math.floor(n / 4));
    c.textContent = `${n}× COMBO · ×${mult}`;
    c.classList.remove('hidden', 'pop');
    void c.offsetWidth;
    c.classList.add('pop');
  },

  _standingRow(r, i, meta) {
    return `<div class="standing ${r.me ? 'me' : ''}"><b>${i + 1}</b><i style="background:${r.color}"></i><span>${U.escapeHTML(r.name)}</span><em>${meta}</em></div>`;
  },

  updateStandings(game) {
    const rows = game.standings();
    const p = game.player;
    const order = rows.map((r) => r.name).join('|');
    const changed = this._standingsOrder && this._standingsOrder !== order;
    this._standingsOrder = order;
    this.el['hud-standings'].innerHTML = rows
      .map((r, i) => {
        const gap = r.d - p.d;
        const meta = r.me ? 'YOU' : r.finish !== null ? 'FIN' : `${gap >= 0 ? '+' : '−'}${U.fmtInt(Math.abs(gap))}m`;
        return this._standingRow(r, i, meta);
      })
      .join('');
    if (changed) this.el['hud-standings'].querySelector('.standing.me')?.classList.add('flash');
  },

  /* Big centre banner for milestones, e.g. banner('SECTOR 1', '0:24.1') */
  banner(title, sub = '') {
    const b = document.createElement('div');
    b.className = 'banner';
    b.innerHTML = `${U.escapeHTML(title)}${sub ? `<small>${U.escapeHTML(sub)}</small>` : ''}`;
    this.el.hud.appendChild(b);
    setTimeout(() => b.remove(), 1700);
  },

  toast(text, cls = '') {
    const box = this.el.toasts;
    // drop an identical toast fired within the last second (e.g. bouncing along the shoulder)
    const now = performance.now();
    if (this._lastToast === text && now - this._lastToastAt < 1000) return;
    this._lastToast = text;
    this._lastToastAt = now;
    const t = document.createElement('div');
    t.className = `toast ${cls}`;
    t.textContent = text;
    box.appendChild(t);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => t.classList.add('out'), 1700);
    setTimeout(() => t.remove(), 2100);
  },

  showResults(game, res, rankInfo, prevBest = null) {
    if (game.state !== 'finished') return; // player already restarted or quit while results were pending
    const e = this.el;
    const level = CONFIG.DIFFICULTY_LEVELS[res.difficulty];
    e['results-kicker'].textContent = level && res.difficulty !== 'normal' ? `${res.kicker} · ${level.label.toUpperCase()}` : res.kicker;
    e['results-position'].textContent = `P${res.position}`;
    e['results-position'].className = 'results-position ' + (res.position === 1 ? 'gold' : res.position <= 3 ? 'silver' : '');
    e['results-title'].textContent = res.title;
    e['res-score'].textContent = U.fmtInt(res.score);
    e['res-distance'].textContent = `${U.fmtInt(res.distance)} m`;
    e['res-time'].textContent = U.fmtTime(res.time);
    e['res-topspeed'].textContent = `${res.topSpeed} km/h`;
    e['res-coins'].textContent = res.coins;
    e['res-overtakes'].textContent = res.overtakes;
    e['res-crashes'].textContent = res.crashes ?? 0;
    if (rankInfo && rankInfo.rank) {
      e['results-rank'].innerHTML = rankInfo.rank === 1 ? `🏆 <b>New #1 on the ${res.mode} board</b>` : `Ranked <b>#${rankInfo.rank}</b> on the ${res.mode} board`;
    } else {
      e['results-rank'].textContent = 'Outside the top 10 — push harder.';
    }
    if (prevBest && typeof prevBest.score === 'number') {
      const delta = res.score - prevBest.score;
      const pb = document.createElement('span');
      pb.className = 'pb ' + (delta > 0 ? 'up' : 'down');
      pb.textContent = delta > 0 ? `NEW PB +${U.fmtInt(delta)}` : `PB ${U.fmtInt(prevBest.score)}`;
      e['results-rank'].appendChild(pb);
    }
    const rows = game.standings();
    e['results-standings'].innerHTML = rows.map((r, i) => this._standingRow(r, i, r.finish !== null ? U.fmtTime(r.finish) : `${U.fmtInt(r.d)} m`)).join('');
    // sector splits (race mode); the final sector is whatever remains of the total time
    const splits = game.player.sectorTimes.slice();
    if (res.mode === 'race') splits.push(res.time - splits.reduce((a, b) => a + b, 0));
    e['results-sectors'].classList.toggle('hidden', splits.length < 2);
    const best = Math.min(...splits);
    e['results-sectors'].innerHTML = splits.map((s, i) => `<div class="sector ${s === best ? 'best' : ''}"><span>S${i + 1}</span><b>${U.fmtTime(s)}</b></div>`).join('');
    this.show('results');
  },

  async renderLeaderboard(mode) {
    const list = await Leaderboard.list(mode);
    const body = this.el['lb-body'];
    this.el['lb-empty'].classList.toggle('hidden', list.length > 0);
    body.innerHTML = list
      .map((r, i) => {
        const detail = r.mode === 'race' ? `P${r.position} · ${U.fmtTime(r.time)}` : `${U.fmtInt(r.distance)} m · P${r.position}`;
        const diff = r.difficulty && r.difficulty !== 'normal' ? `<i class="diff ${r.difficulty}">${r.difficulty}</i>` : '';
        return `<tr class="${i < 3 ? 'top' : ''}"><td>${i + 1}</td><td>${U.escapeHTML(r.name)}${diff}</td><td>${U.fmtInt(r.score)}</td><td>${detail}</td></tr>`;
      })
      .join('');
    document.querySelectorAll('#lb-tabs .tab').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  },

  async refreshBest() {
    for (const mode of ['race', 'endless']) {
      const best = await Leaderboard.best(mode);
      this.el[`best-${mode}`].textContent = best ? `Best ${U.fmtInt(best.score)} · ${best.name}` : 'No record yet';
    }
  },
};
