/* global namespace: CONFIG
 * All tunables for Neon Rush live here. Units: metres, seconds, m/s.
 * Lateral positions: -1..1 spans the asphalt; beyond that is shoulder/grass.
 */
const CONFIG = {
  GAME_NAME: 'Neon Rush',
  STORAGE_KEY: 'neonrush.v2',

  LANES: 4,

  ROAD: {
    horizon: 0.42,          // fraction of canvas height where the horizon sits
    nearHalfWidth: 0.36,    // asphalt half-width at the bottom as fraction of canvas width
    zNear: 1,
    zFar: 18,
    viewRange: 320,         // metres of road visible ahead
    dashPeriod: 12,         // metres per lane-dash cycle
    dashLen: 5,
    textureLen: 22,         // metres of road covered by one texture tile
    shoulder: 1.22,         // lateral extent of the gravel shoulder
    rail: 1.32,             // guardrail position
    edgeLine: 0.965,        // white edge line centre
    wearAlpha: 0.12,        // darkness of tyre-wear tracks in each lane (0 disables)
  },

  PLAYER: {
    baseSpeed: 42,          // m/s (~150 km/h) cruising speed at the start
    maxSpeed: 80,           // m/s (~290 km/h) hard ceiling without nitro
    accel: 14,
    brakeDecel: 55,
    steerSpeed: 2.4,        // lateral units/second
    steerSmoothing: 10,
    carHalfWidth: 0.15,
    carLength: 4.6,
    lives: 3,
    invulnTime: 1.6,
    crashSpeedMult: 0.35,
    nitroMult: 1.5,
    nitroDrain: 0.28,
    nitroPickup: 0.45,
    nitroStart: 0.35,
    oilSlideTime: 1.4,
    railBounce: 0.6,        // speed kept after hitting the guardrail
    lowNitroLevel: 0.12,    // warning beep threshold while boosting
  },

  OFFROAD: {
    shoulderSpeedMult: 0.78, // target speed fraction while on gravel
    grassSpeedMult: 0.55,
    drag: 1.6,              // how quickly speed decays toward the off-road target
    shake: 0.25,
  },

  /* Body styles selectable in the garage. Multipliers apply on top of PLAYER. */
  CARS: {
    sport: { name: 'Viper GT', width: 1.0, height: 1.0, roof: 0.62, spoiler: 'wing', lights: 'bar', exhaust: 'side', speed: 1.0, handling: 1.0, nitro: 1.0, blurb: 'Balanced all-rounder' },
    muscle: { name: 'Brawler V8', width: 1.08, height: 1.05, roof: 0.7, spoiler: 'duck', lights: 'quad', exhaust: 'side', speed: 1.06, handling: 0.86, nitro: 0.95, blurb: 'Raw top speed, heavy steering' },
    hyper: { name: 'Phantom X', width: 1.04, height: 0.9, roof: 0.56, spoiler: 'lip', lights: 'bar', exhaust: 'center', speed: 1.02, handling: 1.1, nitro: 1.15, blurb: 'Razor handling, bigger nitro' },
  },

  OBSTACLES: {
    puddleSpeedMult: 0.9,   // speed kept after hitting a puddle
    truckChance: 0.25,      // share of traffic spawns that are trucks
    truckSpeedRange: [0.42, 0.55], // fraction of the player's cruise speed
  },

  DIFFICULTY: {
    rampPerKm: 7,
    spawnGapStart: 62,
    spawnGapMin: 26,
    spawnGapRampPerKm: 9,
    pickupChance: 0.42,
    trafficChance: 0.32,
  },

  RIVALS: {
    count: 5,
    names: ['Blaze', 'Kira', 'Zed', 'Nova', 'Ryu', 'Vex', 'Mika', 'Onyx', 'Juno', 'Rex', 'Sable', 'Dax', 'Lumi', 'Kato', 'Ivy', 'Rook'],
    personalities: {
      steady: { laneChange: [4, 8], burstChance: 0.002, bias: 0 },
      aggressive: { laneChange: [1.6, 3.5], burstChance: 0.007, bias: 0.02 },
      cautious: { laneChange: [5, 9], burstChance: 0.001, bias: -0.03 },
    },
    colors: ['#e63946', '#f4a261', '#2a9d8f', '#e0e0e6', '#ffd166', '#8338ec'],
    speedBias: [-0.12, 0.05],
    accel: 14,
    gridGap: 9,
    rubberBandRange: 140,
    rubberBandStrength: 0.14,
    laneChangeInterval: [2.5, 6],
    carLength: 4.6,
    carHalfWidth: 0.15,
    bumpSpeedMult: 0.7,
  },

  RACE: {
    length: 3000,
    positionScores: [1000, 700, 500, 350, 250, 150],
    sectorLength: 1000,     // a split time is shown every sector
  },

  SCORE: {
    perMetre: 1,
    coin: 10,
    overtake: 25,
    closeCall: 15,
    crashPenalty: 50,
    timeBonusRace: 4,
    raceParTime: 75,
  },

  PALETTE: {
    playerColors: ['#d81b3a', '#0fa3b1', '#f2f2f2', '#1b1f2a', '#f9a825', '#6a4c93'],
    sky: ['#0b1a33', '#1e3a66', '#5b6ea3', '#e58c6b', '#f7c07a'],
    lane: 'rgba(245,245,240,0.92)',
    edge: 'rgba(250,250,245,0.95)',
  },

  SETTINGS: {
    quality: 'high',
    fps: false,
    shake: true,
    volume: 0.6,
    difficulty: 'normal',
  },

  /* Difficulty presets: multiply spawn gaps (lower = denser) and shift rival speed bias. */
  DIFFICULTY_LEVELS: {
    easy: { spawnGap: 1.35, rivalBias: -0.05, label: 'Easy' },
    normal: { spawnGap: 1.0, rivalBias: 0, label: 'Normal' },
    hard: { spawnGap: 0.75, rivalBias: 0.04, label: 'Hard' },
  },

  YOUTUBE: {
    enabled: false,
    apiBase: '',
  },
};
