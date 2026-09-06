/* DOM layer: screens, HUD, toasts, leaderboard tables, results. */
const UI = {
  screens: ['menu', 'howto', 'leaderboard', 'pause', 'results', 'hud'],
  el: {},
  _speedoLen: 0,

  init() {
    const ids = [
      'hud', 'menu', 'howto', 'leaderboard', 'pause', 'results', 'countdown', 'toasts',
      'hud-position', 'hud-racers', 'hud-distance', 'hud-score', 'hud-time', 'hud-lives', 'hud-standings',
      'hud-speed', 'speedo-fill', 'hud-nitro', 'hud-coins', 'hud-shield', 'hud-combo', 'race-progress', 'race-progress-wrap',
      'menu-best', 'lb-body', 'lb-empty', 'results-kicker', 'results-position', 'results-title', 'results-rank',
      'results-standings', 'res-score', 'res-distance', 'res-time', 'res-topspeed', 'res-coins', 'res-overtakes',
      'touch-controls',
    ];
    ids.forEach((id) => (this.el[id] = document.getElementById(id)));
    const path = this.el['speedo-fill'];
    this._speedoLen = path.getTotalLength();
    path.style.strokeDasharray = `${this._speedoLen}`;
    path.style.strokeDashoffset = `${this._speedoLen}`;
    if (!U.isTouch()) this.el['touch-controls'].classList.add('hidden');
  },

  show(id) {
    for (const s of this.screens) {
      const e = this.el[s];
      if (!e) continue;
      if (s === id || (id !== 'menu' && s === 'hud' && ['pause', 'results'].includes(id))) e.classList.remove('hidden');
      else e.classList.add('hidden');
    }
    document.body.dataset.screen = id;
  },

  showHUD(game) {
    this.show('hud');
    this.el['hud-racers'].textContent = game.rivals.length + 1;
    this.el['race-progress-wrap'].classList.toggle('hidden', game.mode !== 'race');
    this.updateLives(game.player.lives);
    this.updateShield(false);
    this.combo(0);
    this.el.toasts.innerHTML = '';
    this.updateStandings(game);
    this.updateHUD(game);
  },

  countdown(text) {
    const c = this.el.countdown;
    c.textContent = text;
    c.classList.remove('hidden', 'pop');
    void c.offsetWidth; // restart animation
    c.classList.add('pop');
    clearTimeout(this._cdTimer);
    this._cdTimer = setTimeout(() => c.classList.add('hidden'), text === 'GO!' ? 700 : 900);
  },

  updateHUD(game) {
    const p = game.player;
    const e = this.el;
    e['hud-position'].innerHTML = U.ordinalHTML(game.position);
    e['hud-distance'].textContent = U.fmtInt(p.d);
    e['hud-score'].textContent = U.fmtInt(game.score);
    e['hud-time'].textContent = U.fmtTime(game.elapsed);
    e['hud-speed'].textContent = U.kmh(p.speed);
    const frac = U.clamp(p.speed / (CONFIG.PLAYER.maxSpeed * CONFIG.PLAYER.nitroMult), 0, 1);
    e['speedo-fill'].style.strokeDashoffset = `${this._speedoLen * (1 - frac)}`;
    e['speedo-fill'].classList.toggle('boost', p.nitroActive);
    e['hud-nitro'].style.width = `${p.nitro * 100}%`;
    e['hud-nitro'].classList.toggle('active', p.nitroActive);
    e['hud-coins'].textContent = game.coins;
    if (game.mode === 'race') {
      e['race-progress'].style.width = `${U.clamp(p.d / CONFIG.RACE.length, 0, 1) * 100}%`;
      this._updateProgressDots(game);
    }
  },

  _updateProgressDots(game) {
    const wrap = this.el['race-progress-wrap'];
    if (!this._dots) {
      this._dots = game.rivals.map((r) => {
        const d = document.createElement('i');
        d.className = 'rival-dot';
        d.style.background = r.color;
        d.title = r.name;
        wrap.appendChild(d);
        return d;
      });
    }
    game.rivals.forEach((r, i) => {
      const dot = this._dots[i];
      if (!dot) return;
      dot.style.left = `${U.clamp(r.d / CONFIG.RACE.length, 0, 1) * 100}%`;
    });
  },

  updateLives(n) {
    const total = CONFIG.PLAYER.lives;
    this.el['hud-lives'].innerHTML = Array.from({ length: total }, (_, i) => `<i class="life ${i < n ? 'on' : 'off'}">♥</i>`).join('');
  },

  updateShield(on) {
    this.el['hud-shield'].classList.toggle('hidden', !on);
  },

  combo(n) {
    const c = this.el['hud-combo'];
    if (n < 2) {
      c.classList.add('hidden');
      return;
    }
    const mult = Math.min(5, 1 + Math.floor(n / 4));
    c.innerHTML = `<span>${n}× COMBO</span><small>×${mult} coins</small>`;
    c.classList.remove('hidden', 'pop');
    void c.offsetWidth;
    c.classList.add('pop');
  },

  updateStandings(game) {
    const rows = game.standings();
    const p = game.player;
    this.el['hud-standings'].innerHTML = rows
      .map((r, i) => {
        const gap = r.d - p.d;
        const gapText = r.me ? 'YOU' : r.finish !== null ? '🏁' : `${gap >= 0 ? '+' : '−'}${U.fmtInt(Math.abs(gap))}m`;
        return `<div class="standing ${r.me ? 'me' : ''}"><b>${i + 1}</b><i style="background:${r.color}"></i><span>${U.escapeHTML(r.name)}</span><em>${gapText}</em></div>`;
      })
      .join('');
  },

  toast(text, cls = '') {
    const box = this.el.toasts;
    const t = document.createElement('div');
    t.className = `toast ${cls}`;
    t.textContent = text;
    box.appendChild(t);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => t.classList.add('out'), 1700);
    setTimeout(() => t.remove(), 2100);
  },

  showResults(game, res, rankInfo) {
    const e = this.el;
    e['results-kicker'].textContent = res.kicker;
    e['results-position'].innerHTML = res.wrecked && res.mode === 'race' ? 'DNF' : U.ordinalHTML(res.position);
    e['results-position'].className = 'results-position ' + (res.position === 1 && !res.wrecked ? 'gold' : res.position <= 3 && !res.wrecked ? 'silver' : '');
    e['results-title'].textContent = res.title;
    e['res-score'].textContent = U.fmtInt(res.score);
    e['res-distance'].textContent = `${U.fmtInt(res.distance)} m`;
    e['res-time'].textContent = U.fmtTime(res.time);
    e['res-topspeed'].textContent = `${res.topSpeed} km/h`;
    e['res-coins'].textContent = res.coins;
    e['res-overtakes'].textContent = res.overtakes;
    if (rankInfo && rankInfo.rank) {
      e['results-rank'].innerHTML = rankInfo.rank === 1 ? `🏆 <b>New #1 on the ${res.mode} leaderboard!</b>` : `📈 Ranked <b>#${rankInfo.rank}</b> on the ${res.mode} leaderboard`;
      e['results-rank'].classList.remove('hidden');
    } else {
      e['results-rank'].innerHTML = 'Not in the top 10 this time — push harder!';
    }
    const rows = game.standings();
    e['results-standings'].innerHTML = rows
      .map((r, i) => `<div class="standing ${r.me ? 'me' : ''}"><b>${i + 1}</b><i style="background:${r.color}"></i><span>${U.escapeHTML(r.name)}</span><em>${r.finish !== null ? U.fmtTime(r.finish) : `${U.fmtInt(r.d)} m`}</em></div>`)
      .join('');
    this.show('results');
  },

  async renderLeaderboard(mode) {
    const list = await Leaderboard.list(mode);
    const body = this.el['lb-body'];
    this.el['lb-empty'].classList.toggle('hidden', list.length > 0);
    body.innerHTML = list
      .map((r, i) => {
        const detail = r.mode === 'race' ? `${r.wrecked ? 'DNF' : U.ordinal(r.position)} · ${U.fmtTime(r.time)}` : `${U.fmtInt(r.distance)} m · ${U.fmtTime(r.time)}`;
        const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}`;
        return `<tr class="${i < 3 ? 'top' : ''}"><td>${medal}</td><td>${U.escapeHTML(r.name)}</td><td>${U.fmtInt(r.score)}</td><td>${detail}</td></tr>`;
      })
      .join('');
    document.querySelectorAll('#lb-tabs .seg').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  },

  async refreshBest(mode) {
    const best = await Leaderboard.best(mode);
    this.el['menu-best'].textContent = best ? `${U.fmtInt(best.score)} · ${best.name}` : '—';
  },
};
