# Tuning guide

Every gameplay number lives in `js/config.js`. This is a map of the knobs that matter
most and what they do.

## Feel

| Key | Effect |
| --- | --- |
| `PLAYER.baseSpeed` / `maxSpeed` | Cruise speed at the start and the ceiling without nitro (m/s). |
| `DIFFICULTY.rampPerKm` | How fast the cruise speed climbs with distance. |
| `PLAYER.steerSpeed` | Lateral speed; higher feels twitchier. |
| `PLAYER.nitroMult` / `nitroDrain` | Boost strength and how fast the bar empties. |
| `CARS.*` | Per-body multipliers for speed, handling and nitro. |

## Difficulty

| Key | Effect |
| --- | --- |
| `DIFFICULTY.spawnGapStart` / `spawnGapMin` / `spawnGapRampPerKm` | Metres between obstacle groups and how quickly they tighten. |
| `DIFFICULTY.trafficChance` / `pickupChance` | Share of groups that are traffic, and chance of a pickup line. |
| `DIFFICULTY_LEVELS` | Easy / Normal / Hard presets: multiply spawn gaps and shift rival pace. |
| `PLAYER.invulnTime` / `crashSpeedMult` / `SCORE.crashPenalty` | Damage model: no lives, a crash costs speed and points. |
| `ENDLESS.duration` | Length of the Endless time attack in seconds. |

## Rivals

| Key | Effect |
| --- | --- |
| `RIVALS.count` | Number of AI cars (the standings and progress chips follow). |
| `RIVALS.speedBias` | Range of each rival's pace relative to the player's cruise. |
| `RIVALS.personalities` | Lane-change cadence, burst chance and pace bias per personality. |
| `RIVALS.rubberBandRange` / `rubberBandStrength` | How far a rival can drift from you before it speeds up or slows down. |
| `RIVALS.gridGap` | Starting-grid spacing (rivals start ahead of you). |

## Off-road

| Key | Effect |
| --- | --- |
| `ROAD.shoulder` / `ROAD.rail` | Lateral extent of the gravel and the guardrail position (asphalt is -1..1). |
| `OFFROAD.shoulderSpeedMult` / `grassSpeedMult` | Target speed while off the asphalt. |
| `PLAYER.railBounce` | Speed kept after hitting the guardrail. |

## Scoring

| Key | Effect |
| --- | --- |
| `SCORE.perMetre` / `coin` / `overtake` / `closeCall` / `crashPenalty` | Point values. |
| `RACE.positionScores` / `raceParTime` / `timeBonusRace` | Race finishing rewards. |
| `RACE.length` / `sectorLength` | Sprint distance and split cadence. |

## Look

| Key | Effect |
| --- | --- |
| `ROAD.horizon` / `nearHalfWidth` / `viewRange` | Camera framing and draw distance. |
| `ROAD.textureLen` / `dashPeriod` / `wearAlpha` | Surface detail. |
| `PALETTE.sky` | Five-stop sky gradient from zenith to horizon. |
| `BIRDS` / `SKIDS` | Decorative extras. |
