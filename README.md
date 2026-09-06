# Neon Rush

An arcade highway racer for the browser. Five AI rivals, real-looking roads you can
drive off of, obstacles, nitro, and a leaderboard. Plain HTML5 Canvas and JavaScript,
no build step.

## Play

```bash
git clone https://github.com/markchweya/YTGame.git
cd YTGame
python3 -m http.server 8080   # or: npm start
```

Open http://localhost:8080.

## Controls

| Action | Keys |
| --- | --- |
| Steer | `←` `→` or `A` `D` |
| Nitro (hold) | `Shift` / `Space` / `↑` / `W` |
| Brake | `↓` / `S` |
| Pause | `P` / `Esc` |
| Mute | `M` |

Touch devices get on-screen steer, brake and nitro buttons. Gamepads work too:
left stick or d-pad steers, `A` / right trigger is nitro, `B` / left trigger brakes,
`Start` pauses.

Settings (from the garage) cover difficulty (Easy / Normal / Hard changes obstacle
density and rival pace), volume, graphics quality for older devices, an FPS counter,
screen shake and sound.

The leaderboard panel can export the board as JSON and import a backup, so scores can
move between browsers until the online board lands.

## What's in the game

- **Highway rendering** — perspective-mapped asphalt, painted lines, gravel shoulders,
  grass, guardrails, lamp posts with light pools, trees, road signs, billboards,
  overpasses, hills and curves under a dusk sky.
- **Off-road driving** — leave the asphalt and you lose speed on gravel, more on grass,
  and bounce off the guardrail.
- **Competition** — five named rivals with their own body styles, speed bias, bursts,
  lane changes, obstacle avoidance and rubber-banding. Live standings, race progress
  chips, overtake bonuses.
- **Modes** — Race (3 km sprint, position and time bonus) and Endless (survive and score).
- **Garage** — three body styles with different speed, handling and nitro; six paints;
  live turntable preview.
- **Obstacles and pickups** — cones, barriers, rocks, oil, slow traffic; coins with
  combos, nitro canisters, a one-hit shield.
- **HUD** — ticked speedometer with needle and gear, nitro segments, health bar,
  F1-style start lights, toasts, results with standings.
- **Leaderboard** — top 10 per mode in local storage, behind a provider interface for
  the upcoming YouTube backend (see `docs/youtube-integration.md`).
- **Audio** — procedural engine and effects via Web Audio; no asset files.

## Project layout

```
index.html            screens + HUD markup
css/style.css         UI theme
js/config.js          all tunables (speeds, spawn rates, scoring, cars, palette)
js/utils.js           helpers
js/storage.js         localStorage wrapper
js/leaderboard.js     leaderboard service + providers
js/audio.js           Web Audio engine + SFX
js/input.js           keyboard + touch
js/entities.js        Player, Rival, Obstacle, Pickup, Particle
js/sprites.js         pre-rendered car sprites and glow sprites
js/renderer.js        canvas rendering: road, scenery, props, cars, post effects
js/ui.js              DOM/HUD layer
js/game.js            simulation: state machine, spawning, AI, collisions, scoring
js/main.js            bootstrap and garage wiring
tests/smoke.js        headless Playwright smoke test (npm test)
docs/                 integration notes
```

## Testing

```bash
npm install
npx playwright install chromium
npm test
```

The smoke test boots the game in headless Chromium, drives a short race with a bot and
fails on any page error. The same test runs in GitHub Actions on every push.

## Tuning

Everything gameplay-related is in `js/config.js`; `docs/tuning.md` maps the knobs.

## Roadmap

- YouTube live-chat rivals and a shared online leaderboard (`docs/youtube-integration.md`).
- Time-of-day cycle (day, dusk, night with headlights doing real work).
- Weather: rain with wet-road reflections and reduced grip.
- More body kits and liveries in the garage.
- Ghost replay of your personal best.
