/* Headless smoke test: boots the game, drives a short race with a simple bot,
 * and asserts the run finishes without page errors.
 *   npm test   (requires `npx playwright install chromium` once)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const file = path.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(0, () => resolve(srv));
  });
}

(async () => {
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/`;
  // software WebGL so the 3D renderer is exercised in headless CI too
  const launch = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
  if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  // settings panel opens, toggles quality, and closes cleanly
  await page.click('#btn-settings');
  await page.waitForSelector('#settings:not(.hidden)');
  await page.selectOption('#set-quality', 'high');
  await page.selectOption('#set-quality', 'low'); // keep low for the run: software WebGL is slow
  await page.click('#btn-settings-back');
  await page.waitForSelector('#menu:not(.hidden)');
  await page.evaluate(() => (window.NeonRush.CONFIG.RACE.length = 400));
  await page.fill('#input-name', 'Bot');
  await page.click('#btn-play');

  const t0 = Date.now();
  while (Date.now() - t0 < 240000) { // generous: software WebGL runs at a few fps
    const st = await page.evaluate(() => {
      const g = window.NeonRush.game;
      if (g.state !== 'playing') return { state: g.state };
      const p = g.player;
      const L = window.NeonRush.CONFIG.LANES;
      const lanes = [...Array(L).keys()].map((l) => ((l + 0.5) / L) * 2 - 1);
      const danger = lanes.map((lx) => g.obstacles.filter((o) => !o.hit && o.d > p.d - 5 && o.d - p.d < 90 && Math.abs(o.x - lx) < 0.3).length);
      let best = 0;
      lanes.forEach((lx, i) => { if (danger[i] * 10 + Math.abs(lx - p.x) < danger[best] * 10 + Math.abs(lanes[best] - p.x)) best = i; });
      return { state: g.state, dir: Math.sign(lanes[best] - p.x), dx: Math.abs(lanes[best] - p.x) };
    });
    if (st.state !== 'playing') { if (st.state === 'finished') break; }
    else {
      await page.keyboard.up('ArrowLeft');
      await page.keyboard.up('ArrowRight');
      if (st.dx > 0.05) await page.keyboard.down(st.dir > 0 ? 'ArrowRight' : 'ArrowLeft');
    }
    await page.waitForTimeout(50);
  }
  const result = await page.evaluate(() => window.NeonRush.game.result);
  if (!result) { console.error('Race did not finish within the time limit'); await browser.close(); srv.close(); process.exit(1); }
  await page.waitForSelector('#results:not(.hidden)', { timeout: 15000 });
  const rendererKind = await page.evaluate(() => document.body.dataset.renderer);
  const board = await page.evaluate(() => window.NeonRush.Leaderboard.list('race'));
  if (!board.length || board[0].name !== 'Bot') { console.error('Run was not recorded on the leaderboard', board); process.exit(1); }

  // endless mode: run for a few seconds, then quit to the garage
  await page.click('#btn-results-menu');
  await page.waitForSelector('#menu:not(.hidden)');
  // the menu overlay scrolls at small viewports, so click through the DOM
  await page.evaluate(() => document.querySelector('.mode-card[data-mode="endless"]').click());
  await page.evaluate(() => document.getElementById('btn-play').click());
  // wait through the start lights and a few seconds of driving (slow under software WebGL)
  let endless = { state: '', distance: 0 };
  const t1 = Date.now();
  while (Date.now() - t1 < 150000) {
    endless = await page.evaluate(() => {
      const g = window.NeonRush.game;
      return { state: g.state, distance: Math.round(g.player.d) };
    });
    if (endless.state === 'playing' && endless.distance >= 25) break;
    await page.waitForTimeout(500);
  }
  await browser.close();
  srv.close();

  if (errors.length) { console.error('Page errors:\n' + errors.join('\n')); process.exit(1); }
  if (!result) { console.error('Race did not finish within the time limit'); process.exit(1); }
  if (!['playing', 'finished'].includes(endless.state) || endless.distance < 25) { console.error('Endless mode did not run', endless); process.exit(1); }
  console.log('OK', JSON.stringify({ renderer: rendererKind, position: result.position, score: result.score, time: result.time, endless }));
})();
