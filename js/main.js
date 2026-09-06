/* Bootstrap: wires DOM, input, audio, game, garage and leaderboard together. */
(function boot() {
  UI.init();
  const input = new Input();
  const audio = new AudioEngine();
  const canvas = document.getElementById('game');
  const $ = (id) => document.getElementById(id);

  if (CONFIG.YOUTUBE.enabled && CONFIG.YOUTUBE.apiBase) {
    Leaderboard.setProvider(new YouTubeLeaderboardProvider({ apiBase: CONFIG.YOUTUBE.apiBase }));
  }

  const game = new Game({ canvas, input, audio, ui: UI });

  /* ---- persisted settings ---- */
  let mode = Storage.get('mode', 'race');
  let color = Storage.get('color', CONFIG.PALETTE.playerColors[0]);
  let style = Storage.get('style', 'sport');
  if (!CONFIG.CARS[style]) style = 'sport';
  const nameInput = $('input-name');
  nameInput.value = Storage.get('name', '');
  nameInput.addEventListener('input', () => Storage.set('name', nameInput.value.trim()));

  const soundBtn = $('btn-sound');
  const syncSound = () => (soundBtn.textContent = audio.muted ? 'Sound off' : 'Sound on');
  syncSound();

  /* ---- mode cards ---- */
  const modeCards = document.querySelectorAll('#mode-select .mode-card');
  const syncMode = () => modeCards.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  modeCards.forEach((b) =>
    b.addEventListener('click', () => {
      mode = b.dataset.mode;
      Storage.set('mode', mode);
      syncMode();
      audio.click();
    })
  );
  syncMode();

  /* ---- garage: body style ---- */
  const styleWrap = $('style-select');
  const statsWrap = $('style-stats');
  const applyStyle = () => {
    const S = CONFIG.CARS[style];
    $('garage-name').textContent = S.name;
    styleWrap.querySelectorAll('.style-tab').forEach((t) => t.classList.toggle('active', t.dataset.style === style));
    const bar = (label, v) => `<div class="stat-bar"><span>${label}</span><i style="--v:${Math.round(U.clamp((v - 0.8) / 0.35, 0.15, 1) * 100)}%"></i></div>`;
    statsWrap.innerHTML = bar('SPEED', S.speed) + bar('HANDLING', S.handling) + bar('NITRO', S.nitro);
    game.playerStyle = style;
    game.player.style = style;
    game.player.stats = S;
  };
  Object.keys(CONFIG.CARS).forEach((key) => {
    const t = document.createElement('button');
    t.className = 'style-tab';
    t.dataset.style = key;
    t.textContent = CONFIG.CARS[key].name;
    t.addEventListener('click', () => {
      style = key;
      Storage.set('style', key);
      applyStyle();
      audio.click();
    });
    styleWrap.appendChild(t);
  });

  /* ---- garage: paint ---- */
  const swatchWrap = $('color-select');
  CONFIG.PALETTE.playerColors.forEach((c) => {
    const s = document.createElement('button');
    s.className = 'swatch' + (c === color ? ' active' : '');
    s.style.setProperty('--c', c);
    s.setAttribute('aria-label', `Paint ${c}`);
    s.addEventListener('click', () => {
      color = c;
      Storage.set('color', c);
      game.playerColor = c;
      game.player.color = c;
      swatchWrap.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('active', x === s));
      audio.click();
    });
    swatchWrap.appendChild(s);
  });
  game.playerColor = color;
  game.player.color = color;
  applyStyle();

  /* ---- garage showcase (turntable) ---- */
  const show = $('showcase');
  const sctx = show.getContext('2d');
  const drawShowcase = (t) => {
    if (UI.el.menu.classList.contains('hidden')) {
      requestAnimationFrame(drawShowcase);
      return;
    }
    const W = show.width;
    const H = show.height;
    sctx.clearRect(0, 0, W, H);
    const sprite = Sprites.car(color, style);
    const w = W * 0.62;
    const h = w * (Sprites.CAR_H / Sprites.CAR_W);
    const ground = H * 0.78;
    const sway = Math.sin(t / 900) * 0.035;
    const bob = Math.sin(t / 700) * 2;
    // floor glow
    const fg = sctx.createRadialGradient(W / 2, ground, 0, W / 2, ground, w * 0.7);
    fg.addColorStop(0, 'rgba(255,138,31,0.22)');
    fg.addColorStop(1, 'rgba(255,138,31,0)');
    sctx.fillStyle = fg;
    sctx.save();
    sctx.translate(W / 2, ground);
    sctx.scale(1, 0.22);
    sctx.beginPath();
    sctx.arc(0, 0, w * 0.7, 0, 6.283);
    sctx.fill();
    sctx.restore();
    // reflection
    sctx.save();
    sctx.translate(W / 2, ground + 4);
    sctx.scale(1, -0.35);
    sctx.rotate(-sway);
    sctx.globalAlpha = 0.22;
    sctx.drawImage(sprite, -w / 2, -h * (Sprites.GROUND / Sprites.CAR_H), w, h);
    sctx.restore();
    const fade = sctx.createLinearGradient(0, ground, 0, ground + h * 0.35);
    fade.addColorStop(0, 'rgba(12,14,22,0)');
    fade.addColorStop(1, 'rgba(12,14,22,1)');
    sctx.fillStyle = fade;
    sctx.fillRect(0, ground, W, H - ground);
    // car
    sctx.save();
    sctx.translate(W / 2, ground + bob);
    sctx.rotate(sway);
    sctx.drawImage(sprite, -w / 2, -h * (Sprites.GROUND / Sprites.CAR_H), w, h);
    sctx.restore();
    // light sweep
    const sx = ((t / 2600) % 1.4) * W * 1.4 - W * 0.2;
    const lg = sctx.createLinearGradient(sx - 60, 0, sx + 60, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    sctx.fillStyle = lg;
    sctx.fillRect(0, 0, W, H);
    requestAnimationFrame(drawShowcase);
  };
  requestAnimationFrame(drawShowcase);

  /* ---- audio unlock ---- */
  input.onAny = () => {
    audio.unlock();
    audio.resume();
  };

  /* ---- navigation ---- */
  const startGame = () => {
    audio.unlock();
    audio.resume();
    const name = nameInput.value.trim() || 'Driver';
    Storage.set('name', name);
    game.start(mode, name, color, style);
  };
  $('btn-play').addEventListener('click', startGame);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startGame();
  });

  $('btn-howto').addEventListener('click', () => {
    UI.show('howto');
    audio.click();
  });
  $('btn-howto-back').addEventListener('click', () => UI.show('menu'));

  let lbMode = mode;
  let lbReturn = 'menu';
  $('btn-leaderboard').addEventListener('click', () => {
    lbMode = mode;
    lbReturn = 'menu';
    UI.renderLeaderboard(lbMode);
    UI.show('leaderboard');
    audio.click();
  });
  $('btn-results-lb').addEventListener('click', () => {
    lbMode = game.mode;
    lbReturn = 'results';
    UI.renderLeaderboard(lbMode);
    UI.show('leaderboard');
  });
  document.querySelectorAll('#lb-tabs .tab').forEach((b) =>
    b.addEventListener('click', () => {
      lbMode = b.dataset.mode;
      UI.renderLeaderboard(lbMode);
    })
  );
  $('btn-lb-back').addEventListener('click', () => UI.show(lbReturn));
  $('btn-lb-clear').addEventListener('click', async () => {
    if (!confirm(`Clear the ${lbMode} leaderboard?`)) return;
    await Leaderboard.clear(lbMode);
    UI.renderLeaderboard(lbMode);
    UI.refreshBest();
  });

  soundBtn.addEventListener('click', () => {
    audio.unlock();
    audio.toggleMute();
    syncSound();
  });
  input.onMute = () => {
    audio.toggleMute();
    syncSound();
  };

  /* ---- pause ---- */
  const togglePause = () => {
    if (game.state === 'playing') game.pause();
    else if (game.state === 'paused') game.resume();
  };
  input.onPause = togglePause;
  $('btn-pause').addEventListener('click', togglePause);
  $('btn-resume').addEventListener('click', () => game.resume());
  $('btn-restart').addEventListener('click', () => game.restart());
  $('btn-quit').addEventListener('click', () => {
    game.quitToMenu();
    UI.refreshBest();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'playing') game.pause();
  });

  /* ---- results ---- */
  game.onFinished = async (res) => {
    let rankInfo = null;
    try {
      rankInfo = await Leaderboard.submit(res);
    } catch (err) {
      console.warn('Leaderboard submit failed', err);
    }
    setTimeout(() => UI.showResults(game, res, rankInfo), 900);
  };
  $('btn-retry').addEventListener('click', () => game.restart());
  $('btn-results-menu').addEventListener('click', () => {
    game.quitToMenu();
    UI.refreshBest();
  });

  /* ---- touch controls ---- */
  input.bindTouchButton($('touch-left'), 'left');
  input.bindTouchButton($('touch-right'), 'right');
  input.bindTouchButton($('touch-brake'), 'brake');
  input.bindTouchButton($('touch-nitro'), 'nitro');

  UI.show('menu');
  UI.refreshBest();
  window.NeonRush = { game, audio, input, Leaderboard, CONFIG, Sprites };
})();
