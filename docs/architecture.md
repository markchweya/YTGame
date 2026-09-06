# Architecture

Neon Rush is a single-page game with no build step. Scripts load in order as classic
scripts and share the global lexical scope (see the bottom of `index.html`).

## Loop

`Game.loop()` runs on `requestAnimationFrame`. Each frame:

1. `update(dt)` advances the simulation for the current state
   (`menu` demo, `countdown`, `playing`, `finished`; `paused` skips it).
2. `Renderer.render(game)` draws the frame.
3. `UI.tickFps(dt)` updates the optional FPS counter.

`dt` is clamped to 50 ms so a background tab does not teleport the car.

## World coordinates

Every moving thing has two coordinates:

- `d` — metres along the track.
- `x` — lateral position. `-1..1` spans the asphalt, the gravel shoulder runs to
  `CONFIG.ROAD.shoulder`, and the guardrail sits at `CONFIG.ROAD.rail`.

Distance is unbounded; obstacles, pickups and roadside props are generated ahead of
the player and dropped once passed.

## Projection

The renderer is a classic pseudo-3D road. For an object at distance `d`:

```
z      = zNear + (d - player.d) * zPerMeter
s      = zNear / z                       # scale
y      = horizonY + (playerY - horizonY) * s - hill(z)
cx     = W/2 + camX * s + curve(z)
screen = (cx + x * nearHalfW * s, y)
```

`curve(z)` and `hill(z)` are quadratic in normalised depth, so the road bends and
rises smoothly toward the horizon. The ground is drawn as ~120 horizontal slices
from far to near; each slice maps a strip of the asphalt/gravel/grass textures with
`drawImage`, which gives real perspective texture mapping at trivial cost.

## Roadside props

Props are never stored. They are derived from distance with a deterministic hash
(`U.hash`), so lamp posts, trees, signs and billboards are always in the same place
for a given metre of road and cost nothing to persist.

## Sprites

Cars and trucks are rasterised once per colour/style into offscreen canvases
(`js/sprites.js`) and drawn scaled. `Sprites.preload()` warms the cache while the
menu is up.

## AI rivals

Each rival tracks the player's cruise speed with a personal bias and personality
(steady / aggressive / cautious), bursts occasionally, rubber-bands when far ahead
or behind, changes lanes on a timer and dodges obstacles it can see ahead.

## Leaderboard

`Leaderboard` is a thin facade over a provider. `LocalLeaderboardProvider` uses
`localStorage`; `YouTubeLeaderboardProvider` is the stub for the streaming backend.
See `docs/youtube-integration.md`.
