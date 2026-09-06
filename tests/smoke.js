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
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.evaluate(() => (window.NeonRush.CONFIG.RACE.length = 500));
  await page.fill('#input-name', 'Bot');
  await page.click('#btn-play');

  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
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
  await browser.close();
  srv.close();

  if (errors.length) { console.error('Page errors:\n' + errors.join('\n')); process.exit(1); }
  if (!result) { console.error('Race did not finish within the time limit'); process.exit(1); }
  console.log('OK', JSON.stringify({ position: result.position, score: result.score, time: result.time }));
})();
