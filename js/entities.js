/* Entity definitions. Positions use two coordinates:
 *   d — metres along the track (world space)
 *   x — lateral position, -1 (left edge) .. +1 (right edge) of the road
 */

class Player {
  constructor(color, style = 'sport') {
    const P = CONFIG.PLAYER;
    this.color = color;
    this.style = CONFIG.CARS[style] ? style : 'sport';
    this.stats = CONFIG.CARS[this.style];
    this.offroad = 0; // 0 road, 1 shoulder, 2 grass
    this.x = 0;
    this.targetX = 0;
    this.vx = 0;
    this.d = 0;
    this.speed = P.baseSpeed * 0.4;
    this.cruise = P.baseSpeed;
    this.lives = P.lives;
    this.nitro = P.nitroStart;
    this.nitroActive = false;
    this.shield = false;
    this.invuln = 0;
    this.slide = 0;
    this.slideDir = 1;
    this.tilt = 0;
    this.halfWidth = P.carHalfWidth;
    this.length = P.carLength;
    this.topSpeed = 0;
    this.finished = false;
    this.sector = 0;      // sectors completed (race mode)
    this.sectorTimes = [];
    this.railCooldown = 0;
    this.lowNitroWarned = false;
  }
}

class Rival {
  constructor(i, name, color) {
    const R = CONFIG.RIVALS;
    this.id = i;
    this.name = name;
    this.color = color;
    this.style = U.pick(Object.keys(CONFIG.CARS));
    this.stripe = U.chance(0.4) ? U.pick(['#ffffff', '#111111', '#ffd166']) : null;
    this.braking = false;
    this.lane = i % CONFIG.LANES;
    this.x = U.laneX(this.lane, CONFIG.LANES);
    this.targetX = this.x;
    this.d = R.gridGap * (i + 1) + U.rand(-1, 1); // starting grid: rivals line up ahead, you chase them down
    this.speed = 0;
    this.personality = U.pick(Object.keys(R.personalities || { steady: 1 }));
    this.traits = (R.personalities && R.personalities[this.personality]) || { laneChange: R.laneChangeInterval, burstChance: 0.004, bias: 0 };
    this.speedBias = U.rand(R.speedBias[0], R.speedBias[1]) + this.traits.bias;
    this.burst = 0;
    this.laneTimer = U.rand(...this.traits.laneChange);
    this.wasAhead = true;
    this.halfWidth = R.carHalfWidth;
    this.length = R.carLength;
    this.finishTime = null;
    this.bumpCooldown = 0;
  }
}

const OBSTACLE_TYPES = {
  cone: { halfWidth: 0.07, length: 1.2, damage: true, weight: 5 },
  barrier: { halfWidth: 0.2, length: 1.6, damage: true, weight: 3 },
  rock: { halfWidth: 0.1, length: 2.2, damage: true, weight: 2 },
  oil: { halfWidth: 0.16, length: 3.5, damage: false, weight: 3 },
  puddle: { halfWidth: 0.18, length: 4, damage: false, weight: 2 }, // harmless splash, small speed loss
  car: { halfWidth: 0.16, length: 4.6, damage: true, weight: 0 }, // spawned separately
  truck: { halfWidth: 0.2, length: 9, damage: true, weight: 0 }, // spawned separately, slow and wide
};

class Obstacle {
  constructor(type, lane, d) {
    const t = OBSTACLE_TYPES[type];
    this.type = type;
    this.lane = lane;
    this.x = U.laneX(lane, CONFIG.LANES) + (type === 'cone' ? U.rand(-0.06, 0.06) : 0);
    this.d = d;
    this.halfWidth = t.halfWidth;
    this.length = t.length;
    this.damage = t.damage;
    this.hit = false;
    this.hitAt = 0;      // game time of the hit, drives the knock-over animation
    this.hitDir = 1;
    this.speed = 0;
    this.color = type === 'car' ? U.pick(['#8d99ae', '#4a4e69', '#c9ada7', '#22577a', '#3d5a80', '#e07a5f', '#f1f1f1']) : type === 'truck' ? U.pick(['#d9d9d9', '#b23a48', '#2f6f9f', '#f2b134']) : null;
    this.style = type === 'car' ? U.pick(Object.keys(CONFIG.CARS)) : null;
    this.seed = Math.random();
  }
  /* light objects fly away when hit; heavy ones (barriers, vehicles) stay put */
  get knockable() {
    return this.type === 'cone' || this.type === 'rock';
  }
}

const PICKUP_TYPES = {
  coin: { halfWidth: 0.07, length: 1.5, weight: 7 },
  nitro: { halfWidth: 0.09, length: 1.8, weight: 3 },
  shield: { halfWidth: 0.09, length: 1.8, weight: 1.5 },
  repair: { halfWidth: 0.09, length: 1.8, weight: 0.8 }, // restores one life (rare)
};

class Pickup {
  constructor(type, lane, d) {
    const t = PICKUP_TYPES[type];
    this.type = type;
    this.lane = lane;
    this.x = U.laneX(lane, CONFIG.LANES);
    this.d = d;
    this.halfWidth = t.halfWidth;
    this.length = t.length;
    this.taken = false;
    this.phase = Math.random() * Math.PI * 2;
  }
}

/* World-space skid mark left on the asphalt (drawn as a dark strip). */
class Skid {
  constructor(d, x, length, alpha = 0.5) {
    this.d = d;
    this.x = x;
    this.length = length;
    this.alpha = alpha;
  }
}

/* Screen-space particle. */
class Particle {
  constructor(x, y, vx, vy, life, color, size, opts = {}) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.color = color;
    this.size = size;
    this.gravity = opts.gravity ?? 0;
    this.drag = opts.drag ?? 1;
    this.shape = opts.shape || 'circle';
    this.text = opts.text || null;
    this.alpha = opts.alpha ?? 1;
  }
  update(dt) {
    this.life -= dt;
    this.vy += this.gravity * dt;
    this.vx *= this.drag;
    this.vy *= this.drag;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    return this.life > 0;
  }
}

function weightedType(table) {
  const entries = Object.entries(table).filter(([, v]) => v.weight > 0);
  const total = entries.reduce((s, [, v]) => s + v.weight, 0);
  let r = Math.random() * total;
  for (const [k, v] of entries) {
    r -= v.weight;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
}
