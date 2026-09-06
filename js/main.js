/* Bootstrap: wires DOM, input, audio, game and leaderboard together. */
(function boot() {
  UI.init();
  const input = new Input();
  const audio = new AudioEngine();
  const canvas = document.getElementById('game');

  // Optional network provider (YouTube integration comes later).
  if (CONFIG.YOUTUBE.enabled && CONFIG.YOUTUBE.apiBase) {
    Leaderboard.setProvider(new YouTubeLeaderboardProvider({ apiBase: CONFIG.YOUTUBE.apiBase }));
  }

  const game = new Game({ canvas, input, audio, ui: UI });

  /* ---- settings persisted between sessions ---- */
  let mode = Storage.get('mode', 'race');
  let color = Storage.get('color', CONFIG.PALETTE.playerColors[0]);
  const nameInput = document.getElementById('input-name');
  nameInput.value = Storage.get('name', '');
  nameInput.addEventListener('input', () => Storage.set('name', nameInput.value.trim()));

  const $ = (id) => document.getElementById(id);
  const soundBtn = $('btn-sound');
  const syncSound = () => (soundBtn.textContent = audio.muted ? '🔇' : '🔊');
  syncSound();

  /* ---- mode selector ---- */
  const modeButtons = document.querySelectorAll('#mode-select .seg');
  const syncMode = () => modeButtons.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  modeButtons.forEach((b) =>
    b.addEventListener('click', () => {
      mode = b.dataset.mode;
      Storage.set('mode', mode);
      syncMode();
      UI.refreshBest(mode);
      audio.click();
    })
  );
  syncMode();

  /* ---- paint swatches ---- */
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

  /* ---- audio unlock on first interaction ---- */
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
    game.start(mode, name, color);
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
  const openLeaderboard = () => {
    lbMode = mode;
    UI.renderLeaderboard(lbMode);
    UI.show('leaderboard');
    audio.click();
  };
  $('btn-leaderboard').addEventListener('click', openLeaderboard);
  $('btn-results-lb').addEventListener('click', () => {
    lbMode = game.mode;
    UI.renderLeaderboard(lbMode);
    UI.show('leaderboard');
    lbReturn = 'results';
  });
  let lbReturn = 'menu';
  document.querySelectorAll('#lb-tabs .seg').forEach((b) =>
    b.addEventListener('click', () => {
      lbMode = b.dataset.mode;
      UI.renderLeaderboard(lbMode);
    })
  );
  $('btn-lb-back').addEventListener('click', () => {
    UI.show(lbReturn);
    lbReturn = 'menu';
  });
  $('btn-lb-clear').addEventListener('click', async () => {
    if (!confirm(`Clear the ${lbMode} leaderboard?`)) return;
    await Leaderboard.clear(lbMode);
    UI.renderLeaderboard(lbMode);
    UI.refreshBest(mode);
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
    UI.refreshBest(mode);
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
    UI.refreshBest(mode);
  });

  /* ---- touch controls ---- */
  input.bindTouchButton($('touch-left'), 'left');
  input.bindTouchButton($('touch-right'), 'right');
  input.bindTouchButton($('touch-brake'), 'brake');
  input.bindTouchButton($('touch-nitro'), 'nitro');

  UI.show('menu');
  UI.refreshBest(mode);
  window.NeonRush = { game, audio, input, Leaderboard, CONFIG }; // handy for debugging / future integrations
})();
