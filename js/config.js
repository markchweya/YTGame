/* global namespace: CONFIG
 * All tunables for Neon Rush live here. Units: metres, seconds, m/s.
 */
const CONFIG = {
  GAME_NAME: 'Neon Rush',
  STORAGE_KEY: 'neonrush.v1',

  LANES: 4,

  ROAD: {
    horizon: 0.38,          // fraction of canvas height where the horizon sits
    nearHalfWidth: 0.38,    // road half-width at the bottom as fraction of canvas width
    zNear: 1,               // camera-space depth at the player's car
    zFar: 16,               // camera-space depth at the horizon cut-off
    viewRange: 260,         // metres of road visible ahead
    stripeLen: 12,          // metres per grass stripe
    dashPeriod: 10,         // metres per lane-dash cycle
    dashLen: 5,
  },

  PLAYER: {
    baseSpeed: 42,          // m/s (~150 km/h) cruising speed at the start
    maxSpeed: 78,           // m/s (~280 km/h) hard ceiling without nitro
    accel: 14,              // m/s² auto acceleration
    brakeDecel: 55,
    steerSpeed: 2.4,        // lateral units/second (road half-width = 1)
    steerSmoothing: 10,
    carHalfWidth: 0.16,     // lateral units
    carLength: 4.6,         // metres
    lives: 3,
    invulnTime: 1.6,
    crashSpeedMult: 0.35,
    nitroMult: 1.5,
    nitroDrain: 0.28,       // fraction of bar per second
    nitroPickup: 0.45,
    nitroStart: 0.35,
    oilSlideTime: 1.4,
  },

  DIFFICULTY: {
    // cruising speed grows with distance travelled: base + rampPerKm * km, capped by maxSpeed
    rampPerKm: 7,
    spawnGapStart: 62,      // metres between obstacle groups at start
    spawnGapMin: 26,
    spawnGapRampPerKm: 9,
    pickupChance: 0.42,
    trafficChance: 0.32,
  },

  RIVALS: {
    count: 5,
    names: ['Blaze', 'Kira', 'Zed', 'Nova', 'Ryu', 'Vex', 'Mika', 'Onyx', 'Juno', 'Rex'],
    colors: ['#ff5e5e', '#ffb347', '#7cff6b', '#f0f', '#ffe14d', '#66e0ff'],
    speedBias: [-0.12, 0.05], // per-rival speed offset vs the player's "cruise" speed
    accel: 14,
    gridGap: 9,             // metres between rivals on the starting grid (they start ahead of you)
    rubberBandRange: 140,   // metres before rubber-banding kicks in
    rubberBandStrength: 0.14,
    laneChangeInterval: [2.5, 6],
    carLength: 4.6,
    carHalfWidth: 0.16,
    bumpSpeedMult: 0.7,
  },

  RACE: {
    length: 3000,           // metres
    positionScores: [1000, 700, 500, 350, 250, 150],
  },

  SCORE: {
    perMetre: 1,
    coin: 10,
    overtake: 25,
    closeCall: 15,
    crashPenalty: 50,
    timeBonusRace: 4,       // points per second under the par time
    raceParTime: 75,
  },

  PALETTE: {
    playerColors: ['#00e5ff', '#ff3cac', '#7cff6b', '#ffb347', '#b388ff', '#ffffff'],
    sky: ['#0a0b1e', '#1a1040', '#3b1d5e', '#ff5a8f'],
    grassA: '#0c1a2a', grassB: '#0f2030',
    roadA: '#1c1f2b', roadB: '#1a1d29',
    rumbleA: '#ff2f7a', rumbleB: '#f5f7ff',
    lane: 'rgba(255,255,255,0.55)',
    edgeGlow: '#00e5ff',
  },

  YOUTUBE: {
    // Wired later: when enabled, the leaderboard provider will sync runs to a backend
    // and live-chat viewers can join as rivals. Keep keys OUT of this file.
    enabled: false,
    apiBase: '',
  },
};
