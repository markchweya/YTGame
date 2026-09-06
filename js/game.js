/* Core simulation: state machine, spawning, AI rivals, collisions, scoring. */
class Game {
  constructor({ canvas, input, audio, ui }) {
    this.renderer = new Renderer(canvas);
    this.input = input;
    this.audio = audio;
    this.ui = ui;
    this.state = 'menu'; // menu | countdown | playing | paused | finished
    this.mode = 'race';
    this.playerName = 'Driver';
    this.playerColor = CONFIG.PALETTE.playerColors[0];
    this.playerStyle = 'sport';
    this.onFinished = null;
    this.hill = 0;
    this.hillTarget = 0;
    this.hillTimer = 4;
    this.reset(true);
    this._last = performance.now();
    this._standingsTimer = 0;
    requestAnimationFrame((t) => this.loop(t));
  }

  /* ---------- lifecycle ---------- */
  reset(demo) {
    this.demo = demo;
    this.player = new Player(this.playerColor, this.playerStyle);
    const names = CONFIG.RIVALS.names.slice().sort(() => Math.random() - 0.5);
    this.rivals = Array.from({ length: CONFIG.RIVALS.count }, (_, i) => new Rival(i, names[i], CONFIG.RIVALS.colors[i % CONFIG.RIVALS.colors.length]));
    this.obstacles = [];
    this.pickups = [];
    this.particles = [];
    this.curve = 0;
    this.curveTarget = 0;
    this.curveTimer = 3;
    this.time = 0;
    this.elapsed = 0;
    this.score = 0;
    this.coins = 0;
    this.overtakes = 0;
    this.closeCalls = 0;
    this.crashes = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.nextSpawnD = 140;
    this.shake = 0;
    this.flash = 0;
    this.position = 1;
    this.result = null;
    this.finishOrder = [];
    if (demo) {
      this.player.speed = CONFIG.PLAYER.baseSpeed;
      this.rivals.forEach((r, i) => {
        r.d = 30 + i * 28;
        r.speed = CONFIG.PLAYER.baseSpeed;
      });
    }
  }

  start(mode, name, color, style) {
    this.mode = mode;
    this.playerName = name;
    this.playerColor = color;
    this.playerStyle = style || this.playerStyle;
    this.reset(false);
    this.state = 'countdown';
    this.countdown = 3.4;
    this._lastCountShown = null;
    this.ui.showHUD(this);
    this.audio.startEngine();
  }

  restart() {
    this.start(this.mode, this.playerName, this.playerColor, this.playerStyle);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.show('pause');
  }
  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.show('hud');
    this.audio.resume();
  }
  quitToMenu() {
    this.state = 'menu';
    this.audio.stopEngine();
    this.reset(true);
    this.ui.show('menu');
  }

  /* ---------- main loop ---------- */
  loop(now) {
    const dt = Math.min(0.05, (now - this._last) / 1000 || 0);
    this._last = now;
    this.time += dt;
    if (this.state !== 'paused') this.update(dt);
    this.renderer.render(this);
    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    this.updateCurve(dt);
    this.shake = U.damp(this.shake, 0, 6, dt);
    this.flash = U.damp(this.flash, 0, 5, dt);
    this.particles = this.particles.filter((p) => p.update(dt));

    switch (this.state) {
      case 'menu':
        this.updateDemo(dt);
        break;
      case 'countdown':
        this.updateCountdown(dt);
        break;
      case 'playing':
        this.elapsed += dt;
        this.updatePlayer(dt);
        this.updateRivals(dt);
        this.updateSpawner();
        this.updateObstacles(dt);
        this.updateCollisions();
        this.updateStandings(dt);
        this.checkEnd();
        this.ui.updateHUD(this);
        break;
      case 'finished':
        this.player.speed = U.damp(this.player.speed, 0, 0.8, dt);
        this.player.d += this.player.speed * dt;
        this.rivals.forEach((r) => {
          r.speed = U.damp(r.speed, 0, 0.8, dt);
          r.d += r.speed * dt;
        });
        break;
    }
    const sp = U.clamp(this.player.speed / (CONFIG.PLAYER.maxSpeed * CONFIG.PLAYER.nitroMult), 0, 1);
    this.audio.updateEngine(sp, this.player.nitroActive);
  }

  /* ---------- pieces ---------- */
  updateCurve(dt) {
    this.curveTimer -= dt;
    if (this.curveTimer <= 0) {
      this.curveTarget = U.chance(0.35) ? 0 : U.rand(-1, 1);
      this.curveTimer = U.rand(4, 9);
    }
    this.curve = U.damp(this.curve, this.curveTarget, 0.45, dt);
    this.hillTimer -= dt;
    if (this.hillTimer <= 0) {
      this.hillTarget = U.chance(0.4) ? 0 : U.rand(-0.35, 0.45);
      this.hillTimer = U.rand(5, 11);
    }
    this.hill = U.damp(this.hill, this.hillTarget, 0.35, dt);
  }

  updateDemo(dt) {
    const p = this.player;
    p.targetX = Math.sin(this.time * 0.6) * 0.55;
    p.x = U.damp(p.x, p.targetX, 2.5, dt);
    p.tilt = U.damp(p.tilt, (p.targetX - p.x) * 0.4, 6, dt);
    p.speed = CONFIG.PLAYER.baseSpeed * 1.1;
    p.d += p.speed * dt;
    p.nitroActive = false;
    for (const r of this.rivals) {
      r.laneTimer -= dt;
      if (r.laneTimer <= 0) {
        r.lane = U.clamp(r.lane + U.pick([-1, 1]), 0, CONFIG.LANES - 1);
        r.targetX = U.laneX(r.lane, CONFIG.LANES);
        r.laneTimer = U.rand(2, 5);
      }
      r.x = U.damp(r.x, r.targetX, 3, dt);
      r.speed = p.speed + Math.sin(this.time * 0.7 + r.id) * 6;
      r.d += r.speed * dt;
      if (r.d - p.d > 220) r.d = p.d + 20;
      if (r.d - p.d < 12) r.d = p.d + 200;
    }
  }

  updateCountdown(dt) {
    this.countdown -= dt;
    const n = Math.ceil(this.countdown);
    if (n !== this._lastCountShown) {
      this._lastCountShown = n;
      if (n > 0 && n <= 3) {
        this.ui.countdown(String(n));
        this.audio.countdown(false);
      } else if (n <= 0) {
        this.ui.countdown('GO!');
        this.audio.countdown(true);
        this.state = 'playing';
      }
    }
    this.player.tilt = U.damp(this.player.tilt, 0, 6, dt);
    this.ui.updateHUD(this);
  }

  updatePlayer(dt) {
    const P = CONFIG.PLAYER;
    const D = CONFIG.DIFFICULTY;
    const p = this.player;
    const km = p.d / 1000;

    const st = p.stats;
    p.cruise = Math.min(P.maxSpeed * st.speed, (P.baseSpeed + D.rampPerKm * km) * st.speed);
    p.nitroActive = this.input.nitro && p.nitro > 0.01;
    if (p.nitroActive) {
      if (!p._nitroWas) this.audio.nitro();
      p.nitro = Math.max(0, p.nitro - (P.nitroDrain / st.nitro) * dt);
      if (Math.random() < 0.6) this.spawnNitroTrail();
    } else {
      p.nitro = Math.min(1, p.nitro + 0.015 * dt);
    }
    p._nitroWas = p.nitroActive;

    // off-road detection: |x| > 1 is the gravel shoulder, beyond ROAD.shoulder is grass
    const ax = Math.abs(p.x);
    const O = CONFIG.OFFROAD;
    const R = CONFIG.ROAD;
    const wasOff = p.offroad;
    p.offroad = ax + p.halfWidth * 0.5 > R.shoulder ? 2 : ax + p.halfWidth * 0.5 > 1 ? 1 : 0;
    if (p.offroad && !wasOff) this.ui.toast(p.offroad === 2 ? 'Off road!' : 'On the shoulder', 'warn');

    let target = p.cruise * (p.nitroActive ? P.nitroMult : 1);
    if (p.offroad) target *= p.offroad === 2 ? O.grassSpeedMult : O.shoulderSpeedMult;
    if (this.input.brake) {
      p.speed = Math.max(p.cruise * 0.35, p.speed - P.brakeDecel * dt);
    } else if (p.speed < target) {
      p.speed = Math.min(target, p.speed + P.accel * (p.nitroActive ? 3 : 1) * dt);
    } else {
      p.speed = U.damp(p.speed, target, p.offroad ? O.drag : 1.2, dt);
    }
    p.topSpeed = Math.max(p.topSpeed, p.speed);

    if (p.offroad) {
      this.shake = Math.max(this.shake, O.shake * (p.offroad === 2 ? 1.4 : 1) * U.clamp(p.speed / 40, 0, 1));
      if (Math.random() < 0.7) this.spawnDust(p.offroad === 2 ? '#6b7a4a' : '#9a8b78');
    }

    // steering
    let steer = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    let steerRate = P.steerSpeed * st.handling * (0.85 + 0.15 * U.clamp(p.speed / P.maxSpeed, 0, 1));
    if (p.slide > 0) {
      p.slide -= dt;
      steer = steer * 0.35 + Math.sin(this.time * 18) * p.slideDir * 0.9;
      steerRate *= 1.1;
      if (Math.random() < 0.5) this.spawnDust('rgba(200,200,210,0.6)', true);
    }
    if (p.offroad === 2) steer += Math.sin(this.time * 23) * 0.25;
    const targetVx = steer * steerRate;
    p.vx = U.damp(p.vx, targetVx, P.steerSmoothing, dt);
    p.x += p.vx * dt;
    // centrifugal drift on curves
    p.x -= this.curve * 0.16 * dt * (p.speed / P.baseSpeed);
    // guardrail
    const lim = R.rail - p.halfWidth - 0.02;
    if (p.x > lim || p.x < -lim) {
      const side = p.x > 0 ? 1 : -1;
      p.x = side * lim;
      p.vx = -side * Math.abs(p.vx) * 0.5 - side * 0.6;
      if (p.railCooldown <= 0 || p.railCooldown === undefined) {
        p.speed *= P.railBounce;
        p.railCooldown = 0.6;
        this.shake = Math.max(this.shake, 0.7);
        this.spawnSparks(side, 18);
        this.audio.bump();
        this.ui.toast('Guardrail!', 'bad');
      }
    }
    p.railCooldown = Math.max(0, (p.railCooldown || 0) - dt);
    p.tilt = U.damp(p.tilt, p.vx * 0.045 + (p.slide > 0 ? Math.sin(this.time * 18) * 0.06 : 0) + (p.offroad ? Math.sin(this.time * 31) * 0.012 : 0), 8, dt);

    p.invuln = Math.max(0, p.invuln - dt);
    p.d += p.speed * dt;
    this.score += CONFIG.SCORE.perMetre * p.speed * dt;

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.ui.combo(0);
      }
    }
  }

  updateRivals(dt) {
    const R = CONFIG.RIVALS;
    const p = this.player;
    for (const r of this.rivals) {
      // speed model: track the player's cruise with a personal bias + rubber banding
      let target = p.cruise * (1 + r.speedBias) * (this.mode === 'endless' ? 0.98 : 1.0);
      const gap = r.d - p.d;
      if (gap < -R.rubberBandRange) target *= 1 + R.rubberBandStrength;
      else if (gap > R.rubberBandRange) target *= 1 - R.rubberBandStrength;
      r.burst = Math.max(0, r.burst - dt);
      if (r.burst <= 0 && U.chance(0.004)) r.burst = U.rand(1.5, 3);
      if (r.burst > 0) target *= 1.12;
      r.bumpCooldown = Math.max(0, r.bumpCooldown - dt);
      if (r.finishTime !== null) target = p.cruise * 0.9;
      // keep a gap to a rival directly ahead in the same lane
      const tail = this.rivals.find((q) => q !== r && q.d > r.d && q.d - r.d < 10 && Math.abs(q.x - r.x) < 0.25);
      if (tail) target = Math.min(target, tail.speed * 0.95);
      if (r.speed < target) r.speed = Math.min(target, r.speed + R.accel * dt);
      else r.speed = U.damp(r.speed, target, 2.5, dt);
      r.d += r.speed * dt;

      // lane changes + obstacle avoidance
      r.laneTimer -= dt;
      const ahead = this.obstacles.find((o) => !o.hit && o.d > r.d && o.d - r.d < 55 && Math.abs(o.x - r.targetX) < o.halfWidth + r.halfWidth + 0.05);
      if (ahead || tail || r.laneTimer <= 0) {
        const options = [];
        for (const dl of [-1, 1]) {
          const ln = r.lane + dl;
          if (ln < 0 || ln >= CONFIG.LANES) continue;
          const lx = U.laneX(ln, CONFIG.LANES);
          const blocked = this.obstacles.some((o) => !o.hit && o.d > r.d - 5 && o.d - r.d < 60 && Math.abs(o.x - lx) < o.halfWidth + r.halfWidth + 0.05);
          const rivalThere = this.rivals.some((q) => q !== r && Math.abs(q.d - r.d) < 12 && Math.abs(q.targetX - lx) < 0.2);
          if (!blocked && !rivalThere) options.push(ln);
        }
        if (options.length && (ahead || tail || U.chance(0.7))) {
          r.lane = U.pick(options);
          r.targetX = U.laneX(r.lane, CONFIG.LANES);
        }
        r.laneTimer = U.rand(...R.laneChangeInterval);
      }
      r.x = U.damp(r.x, r.targetX, 3, dt);

      if (this.mode === 'race' && r.finishTime === null && r.d >= CONFIG.RACE.length) {
        r.finishTime = this.elapsed;
        this.finishOrder.push(r);
      }

      // overtake tracking
      const isAhead = r.d > p.d;
      if (r.wasAhead && !isAhead && !p.finished) {
        this.overtakes++;
        this.score += CONFIG.SCORE.overtake;
        this.ui.toast(`Overtook ${r.name}! +${CONFIG.SCORE.overtake}`, 'good');
        this.audio.overtake();
      } else if (!r.wasAhead && isAhead && this.elapsed > 3) {
        this.ui.toast(`${r.name} passed you`, 'warn');
      }
      r.wasAhead = isAhead;

      // bumping
      if (r.bumpCooldown <= 0 && Math.abs(r.d - p.d) < (r.length + p.length) * 0.5 && Math.abs(r.x - p.x) < r.halfWidth + p.halfWidth) {
        r.bumpCooldown = 1;
        const dir = p.x < r.x ? -1 : 1;
        p.vx += dir * 1.4;
        r.targetX = U.clamp(r.x - dir * 0.25, -0.8, 0.8);
        if (r.d > p.d) p.speed *= R.bumpSpeedMult;
        else r.speed *= R.bumpSpeedMult;
        this.shake = Math.max(this.shake, 0.4);
        this.spawnSparks(dir, 10);
        this.audio.bump();
      }
    }
  }

  updateSpawner() {
    if (this.demo) return;
    const D = CONFIG.DIFFICULTY;
    const p = this.player;
    const horizon = p.d + CONFIG.ROAD.viewRange + 40;
    const km = p.d / 1000;
    while (this.nextSpawnD < horizon) {
      this.spawnGroup(this.nextSpawnD, km);
      const gap = Math.max(D.spawnGapMin, D.spawnGapStart - D.spawnGapRampPerKm * km);
      this.nextSpawnD += gap * U.rand(0.75, 1.3);
    }
  }

  spawnGroup(d, km) {
    const D = CONFIG.DIFFICULTY;
    const lanes = CONFIG.LANES;
    const all = [...Array(lanes).keys()];
    const free = new Set(all);
    const roll = Math.random();
    const maxBlocked = km > 2.2 ? 3 : 2;

    if (roll < D.trafficChance) {
      // slow traffic car(s)
      const n = km > 1 && U.chance(0.35) ? 2 : 1;
      const OB = CONFIG.OBSTACLES;
      for (let i = 0; i < n; i++) {
        const lane = U.pick([...free]);
        free.delete(lane);
        const truck = i === 0 && U.chance(OB.truckChance);
        const car = new Obstacle(truck ? 'truck' : 'car', lane, d + i * 12);
        car.speed = this.player.cruise * (truck ? U.rand(...OB.truckSpeedRange) : U.rand(0.5, 0.68));
        this.obstacles.push(car);
      }
    } else {
      const n = U.clamp(U.randInt(1, 1 + Math.round(km * 0.8)), 1, maxBlocked);
      for (let i = 0; i < n; i++) {
        const type = weightedType(OBSTACLE_TYPES);
        const lane = U.pick([...free]);
        free.delete(lane);
        this.obstacles.push(new Obstacle(type, lane, d + U.rand(-4, 4)));
        if (type === 'barrier' && U.chance(0.4) && free.size > 1) {
          const adj = [lane - 1, lane + 1].filter((l) => free.has(l));
          if (adj.length) {
            const l2 = U.pick(adj);
            free.delete(l2);
            this.obstacles.push(new Obstacle('barrier', l2, d));
          }
        }
      }
    }

    // pickups in a free lane, slightly ahead of the group
    if (free.size && U.chance(D.pickupChance)) {
      const lane = U.pick([...free]);
      const type = weightedType(PICKUP_TYPES);
      if (type === 'coin') {
        const n = U.randInt(3, 6);
        for (let i = 0; i < n; i++) this.pickups.push(new Pickup('coin', lane, d + 14 + i * 5));
      } else {
        this.pickups.push(new Pickup(type, lane, d + 16));
      }
    }
  }

  updateObstacles(dt) {
    const p = this.player;
    for (const o of this.obstacles) {
      if (o.speed) o.d += o.speed * dt;
    }
    this.obstacles = this.obstacles.filter((o) => o.d > p.d - 40);
    this.pickups = this.pickups.filter((k) => !k.taken && k.d > p.d - 20);
  }

  updateCollisions() {
    const p = this.player;
    const S = CONFIG.SCORE;
    for (const o of this.obstacles) {
      if (o.hit) continue;
      const dz = o.d - p.d;
      const overlapZ = Math.abs(dz) < (o.length + p.length) * 0.5;
      const dx = Math.abs(o.x - p.x);
      const sumW = o.halfWidth + p.halfWidth;
      if (overlapZ && dx < sumW) {
        this.hitObstacle(o);
      } else if (!o.passed && dz < -p.length * 0.5) {
        o.passed = true;
        if (o.damage && dx < sumW + 0.1) {
          this.closeCalls++;
          this.score += S.closeCall;
          this.ui.toast(`Close call! +${S.closeCall}`, 'good');
          this.spawnText('+' + S.closeCall, '#7cff6b');
          this.audio.closeCall();
        }
      }
    }
    for (const k of this.pickups) {
      if (k.taken) continue;
      if (Math.abs(k.d - p.d) < (k.length + p.length) * 0.5 && Math.abs(k.x - p.x) < k.halfWidth + p.halfWidth) {
        k.taken = true;
        this.takePickup(k);
      }
    }
  }

  hitObstacle(o) {
    const p = this.player;
    const P = CONFIG.PLAYER;
    o.hit = true;
    if (o.type === 'puddle') {
      p.speed *= CONFIG.OBSTACLES.puddleSpeedMult;
      for (let i = 0; i < 14; i++) this.spawnDust('rgba(150,180,220,0.7)', true);
      this.audio.slide();
      return;
    }
    if (o.type === 'oil') {
      p.slide = P.oilSlideTime;
      p.slideDir = Math.random() < 0.5 ? -1 : 1;
      p.speed *= 0.85;
      this.ui.toast('Oil slick — hold on!', 'warn');
      this.audio.slide();
      return;
    }
    if (p.invuln > 0) return;
    if (p.shield) {
      p.shield = false;
      p.invuln = 0.6;
      this.shake = Math.max(this.shake, 0.5);
      this.spawnSparks(0, 16, '#8ec5ff');
      this.ui.toast('Shield absorbed the hit!', 'info');
      this.ui.updateShield(false);
      this.audio.shield();
      return;
    }
    p.lives--;
    p.speed *= P.crashSpeedMult;
    p.invuln = P.invulnTime;
    this.crashes++;
    this.combo = 0;
    this.comboTimer = 0;
    this.ui.combo(0);
    this.score = Math.max(0, this.score - CONFIG.SCORE.crashPenalty);
    this.flash = 1;
    this.shake = 1;
    this.spawnSparks(0, 26);
    this.spawnText('-' + CONFIG.SCORE.crashPenalty, '#ff5e5e');
    this.audio.crash();
    this.ui.updateLives(p.lives);
    this.ui.toast(p.lives > 0 ? `Crash! ${p.lives} ${p.lives === 1 ? 'life' : 'lives'} left` : 'Wrecked!', 'bad');
  }

  takePickup(k) {
    const p = this.player;
    const S = CONFIG.SCORE;
    switch (k.type) {
      case 'coin': {
        this.coins++;
        this.combo++;
        this.comboTimer = 1.6;
        const mult = Math.min(5, 1 + Math.floor(this.combo / 4));
        const pts = S.coin * mult;
        this.score += pts;
        this.spawnText('+' + pts, '#ffd54a');
        this.ui.combo(this.combo);
        this.audio.coin();
        break;
      }
      case 'nitro':
        p.nitro = Math.min(1, p.nitro + CONFIG.PLAYER.nitroPickup);
        this.spawnText('NITRO', '#00e5ff');
        this.audio.pickup();
        break;
      case 'shield':
        p.shield = true;
        this.spawnText('SHIELD', '#9bb8ff');
        this.ui.updateShield(true);
        this.audio.shield();
        break;
      case 'repair':
        if (p.lives < CONFIG.PLAYER.lives) {
          p.lives++;
          this.ui.updateLives(p.lives);
          this.spawnText('+1 LIFE', '#5ee07a');
          this.ui.toast('Repaired — life restored', 'good');
        } else {
          this.score += S.coin * 5;
          this.spawnText('+' + S.coin * 5, '#5ee07a');
        }
        this.audio.repair();
        break;
    }
  }

  updateStandings(dt) {
    const p = this.player;
    const ahead = this.rivals.filter((r) => r.d > p.d || (r.finishTime !== null && !p.finished)).length;
    this.position = ahead + 1;
    this._standingsTimer -= dt;
    if (this._standingsTimer <= 0) {
      this._standingsTimer = 0.25;
      this.ui.updateStandings(this);
    }
  }

  standings() {
    const p = this.player;
    const rows = [
      ...this.rivals.map((r) => ({ name: r.name, color: r.color, d: r.d, finish: r.finishTime, me: false })),
      { name: this.playerName, color: p.color, d: p.d, finish: p.finished ? this.result?.time ?? this.elapsed : null, me: true },
    ];
    rows.sort((a, b) => {
      if (a.finish !== null && b.finish !== null) return a.finish - b.finish;
      if (a.finish !== null) return -1;
      if (b.finish !== null) return 1;
      return b.d - a.d;
    });
    return rows;
  }

  checkEnd() {
    const p = this.player;
    if (this.mode === 'race' && p.d >= CONFIG.RACE.length) {
      p.finished = true;
      this.finishRun(false);
    } else if (p.lives <= 0) {
      this.finishRun(true);
    }
  }

  finishRun(wrecked) {
    const p = this.player;
    const S = CONFIG.SCORE;
    const position = this.position;
    let score = this.score;
    let title;
    let kicker;
    if (this.mode === 'race' && !wrecked) {
      score += CONFIG.RACE.positionScores[Math.min(position, CONFIG.RACE.positionScores.length) - 1] || 0;
      score += Math.max(0, S.raceParTime - this.elapsed) * S.timeBonusRace;
      kicker = 'RACE COMPLETE';
      title = position === 1 ? 'Champion!' : position <= 3 ? 'Podium finish!' : 'Race finished';
      this.audio.finish();
      if (position <= 3) this.spawnConfetti(160);
    } else {
      kicker = this.mode === 'race' ? 'DID NOT FINISH' : 'GAME OVER';
      title = this.mode === 'race' ? 'Wrecked before the line' : `Survived ${U.fmtInt(p.d)} m`;
      this.audio.gameOver();
    }
    this.result = {
      name: this.playerName,
      mode: this.mode,
      score: Math.round(score),
      distance: Math.round(p.d),
      time: Math.round(this.elapsed * 10) / 10,
      position,
      racers: this.rivals.length + 1,
      coins: this.coins,
      overtakes: this.overtakes,
      topSpeed: U.kmh(p.topSpeed),
      wrecked,
      title,
      kicker,
      date: Date.now(),
    };
    this.state = 'finished';
    this.audio.stopEngine();
    this.onFinished && this.onFinished(this.result);
  }

  /* ---------- particles ---------- */
  playerScreen() {
    return this.renderer.playerScreen(this);
  }
  spawnDust(color, smoke = false) {
    const { x, y } = this.playerScreen();
    const w = this.renderer.laneW * 0.3;
    const side = smoke ? (U.chance(0.5) ? -1 : 1) : this.player.x > 0 ? 1 : -1;
    this.particles.push(
      new Particle(x + side * w * 0.9 + U.rand(-6, 6), y - 4, U.rand(-40, 40) + side * 30, U.rand(60, 160), U.rand(0.4, 0.9), color, U.rand(8, 16), { shape: 'smoke', drag: 0.97, alpha: 0.55 })
    );
  }
  spawnConfetti(n) {
    const { W } = this.renderer;
    const colors = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#f2f2f2', '#8338ec'];
    for (let i = 0; i < n; i++) {
      this.particles.push(new Particle(U.rand(0, W), U.rand(-40, -5), U.rand(-60, 60), U.rand(80, 220), U.rand(2.2, 3.6), U.pick(colors), U.rand(4, 8), { shape: 'rect', gravity: 60, drag: 0.995 }));
    }
  }
  spawnSparks(dir, n, color = '#ffb347') {
    const { x, y } = this.playerScreen();
    const w = this.renderer.laneW * 0.32;
    for (let i = 0; i < n; i++) {
      this.particles.push(
        new Particle(x + dir * w + U.rand(-w * 0.3, w * 0.3), y - U.rand(0, w), U.rand(-260, 260) + dir * 160, U.rand(-320, 60), U.rand(0.25, 0.6), U.chance(0.3) ? '#fff' : color, U.rand(1.5, 4), {
          gravity: 700,
          drag: 0.99,
          shape: U.chance(0.5) ? 'rect' : 'circle',
        })
      );
    }
  }
  spawnNitroTrail() {
    const { x, y } = this.playerScreen();
    const w = this.renderer.laneW * 0.32;
    const side = U.chance(0.5) ? -1 : 1;
    this.particles.push(new Particle(x + side * w * 0.85, y + 4, U.rand(-30, 30), U.rand(180, 320), U.rand(0.25, 0.5), U.chance(0.5) ? '#00e5ff' : '#b388ff', U.rand(2, 5)));
  }
  spawnText(text, color) {
    const { x, y } = this.playerScreen();
    this.particles.push(new Particle(x + U.rand(-20, 20), y - this.renderer.laneW * 0.9, 0, -70, 0.9, color, 22, { shape: 'text', text }));
  }
}
