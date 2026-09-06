# Neon Rush 🏁

A modern, stream-ready arcade car racer built with plain HTML5 Canvas + JavaScript.
No build step, no dependencies — open it and drive.

![Neon Rush](https://img.shields.io/badge/status-playable-00e5ff) ![No build](https://img.shields.io/badge/build-none-ff3cac)

## Play it

Any static file server works:

```bash
# from the repo root
python3 -m http.server 8080
# then open http://localhost:8080
```

(Double-clicking `index.html` also works in most browsers.)

## Features

- **Pseudo-3D neon highway** — perspective road with curves, synthwave sky, city skyline, distance haze, camera shake, particles.
- **Competition** — 5 AI rivals with names, personalities (speed bias, bursts), lane-changing, obstacle avoidance and rubber-banding so races stay tight. Live standings and a race progress bar with rival markers.
- **Two modes** — `Race` (3 km sprint, finishing position + time bonus) and `Endless` (survive, score by distance).
- **Obstacles** — cones, barriers, rocks, oil slicks (you slide), slow traffic cars. 3 lives, temporary invulnerability after a crash.
- **Pickups** — coins (with combo multiplier), nitro canisters, a one-hit shield.
- **Scoring** — distance, coins, overtakes, close calls; crash penalties.
- **Leaderboard** — top 10 per mode, stored locally, behind a provider interface ready for a network/YouTube backend.
- **Modern UI** — glassmorphism panels, gradient accents, speedometer, nitro bar, toasts, results screen with standings.
- **Procedural audio** — engine hum that follows speed plus synthesized SFX (no audio files). `M` toggles mute.
- **Touch support** — on-screen steer / brake / nitro buttons; layout adapts to phones.

## Controls

| Action | Keys |
| --- | --- |
| Steer | `←` `→` or `A` `D` |
| Brake | `↓` / `S` |
| Nitro (hold) | `Shift` / `Space` / `↑` / `W` |
| Pause | `P` / `Esc` |
| Mute | `M` |

## Project layout

```
index.html          # screens + HUD markup
css/style.css       # UI theme
js/config.js        # all tunables (speeds, spawn rates, scoring, palette, YouTube flags)
js/utils.js         # helpers
js/storage.js       # localStorage wrapper
js/leaderboard.js   # Leaderboard service + providers (Local now, YouTube later)
js/audio.js         # Web Audio engine + SFX
js/input.js         # keyboard + touch
js/entities.js      # Player, Rival, Obstacle, Pickup, Particle
js/renderer.js      # canvas rendering (road projection, cars, scenery, effects)
js/ui.js            # DOM/HUD layer
js/game.js          # simulation: state machine, spawning, AI, collisions, scoring
js/main.js          # bootstrap & wiring
```

## Tuning

Everything gameplay-related is in `js/config.js` — race length, rival count and aggression, spawn gaps, nitro drain, scoring weights, colours.

## Next: YouTube integration

The game is structured so the YouTube step is additive:

- `Leaderboard.setProvider(...)` swaps the local board for a network-backed one (`YouTubeLeaderboardProvider` is stubbed in `js/leaderboard.js`).
- `CONFIG.YOUTUBE` holds the feature flag and API base URL. API keys must live server-side, never in this repo.
- Rival names/colours are data (`CONFIG.RIVALS`), so live-chat viewers can be injected as rivals.
- `window.NeonRush` exposes the game, audio, input and leaderboard for integrations and debugging.
