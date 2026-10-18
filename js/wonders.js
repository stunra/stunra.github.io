'use strict';
// ---------- clouds & sun ----------
class Cloud {
  constructor(x, y, storm = false) {
    this.x = wrapX(x); this.y = y; this.storm = storm;
    this.puffs = [];
    const n = storm ? 11 : 8;
    for (let i = 0; i < n; i++) this.puffs.push({ dx: rand(-1, 1) * (storm ? 105 : 85), dy: rand(-0.6, 0.8) * (storm ? 38 : 28), s: rand(70, 120) * (storm ? 1.1 : 1), ph: rand(0, TAU) });
    this.puffs.sort((a, b) => a.dy - b.dy);
    this.vx = rand(-5, 5); this.charge = 0; this.rain = 0; this.rainMax = 1; this.level = 1; this.drag = false; this.squash = 0;
    this.sound = null;
  }
  get w() { return this.storm ? 260 : 210; }
  hit(wx, wy) { return Math.abs(dX(this.x, wx)) * (R0 + this.y) / R0 < this.w / 2 * (R0 + this.y) / R0 + 10 && Math.abs(wy - this.y) < 70; }
  update(dt) {
    if (!this.drag) {
      this.x = wrapX(this.x + this.vx * dt);
      // clouds drift apart rather than piling up
      for (const o of G.clouds) {
        if (o === this) continue;
        const d = dX(o.x, this.x);
        const lim = (this.w + o.w) * 0.42;
        if (Math.abs(d) < lim) this.x = wrapX(this.x + (d >= 0 ? 1 : -1) * 30 * dt);
      }
      const minY = LAND.hAt(this.x) + 250, maxY = LAND.hAt(this.x) + 420;
      if (this.y < minY) this.y += (minY - this.y) * dt;
      if (this.y > maxY) this.y += (maxY - this.y) * dt * 0.3;
      if (Math.random() < dt * 0.05) this.vx = rand(-6, 6);
    }
    this.squash = Math.max(0, this.squash - dt * 2);
    if (this.rain > 0) {
      this.rain -= dt;
      WONDER.rainTick(this, dt);
      if (this.rain <= 0 && this.sound) { this.sound.stop(); this.sound = null; }
    }
    if (this.storm && Math.random() < dt * 0.4) G.fx.push(new Particle('lightningspark', this.x + rand(-80, 80), this.y + rand(-20, 10), { life: 0.15, size: rand(20, 40), add: true, rot: rand(0, TAU) }));
  }
  draw(ctx) {
    pushAt(ctx, this.x, this.y);
    const ch = this.charge;
    const sq = 1 + this.squash * 0.15 + ch * 0.08 * Math.sin(G.t * 30);
    ctx.scale(sq, 2 - sq);
    const dark = this.rain > 0 ? 0.25 : 0;
    for (const p of this.puffs) {
      const bob = Math.sin(G.t * 0.8 + p.ph) * 3;
      const s = p.s * (1 + ch * 0.06);
      spr(ctx, this.storm ? 'cloudfluffdark' : 'cloudfluff', p.dx - s / 2, -p.dy - s / 2 + bob, s, s * 0.8);
    }
    if (dark) {
      ctx.globalAlpha = dark;
      for (const p of this.puffs) { const s = p.s; spr(ctx, 'cloudfluffdark', p.dx - s / 2, -p.dy - s / 2, s, s * 0.8); }
      ctx.globalAlpha = 1;
    }
    if (ch > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 * ch;
      spr(ctx, this.storm ? 'lightningring' : 'pulse', -this.w * 0.6, -this.w * 0.45, this.w * 1.2, this.w * 0.9);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
const SUN = {
  x: 2401, y: 600, charge: 0, drag: false, beam: 0, beamMax: 1,
  hit(wx, wy) { return Math.abs(dX(this.x, wx)) * (R0 + this.y) / R0 < 85 && Math.abs(wy - this.y) < 85; },
  update(dt) {
    if (this.beam > 0) { this.beam -= dt; WONDER.sunTick(dt); }
  },
  draw(ctx) {
    pushAt(ctx, this.x, this.y);
    ctx.rotate(G.t * 0.05);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + 0.15 * Math.sin(G.t * 2);
    spr(ctx, 'halo_glow', -170, -170, 340, 340);
    ctx.globalAlpha = 0.45;
    spr(ctx, 'sunrays', -150, -150, 300, 300);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    const s = 150 * (1 + this.charge * 0.12 + Math.sin(G.t * 25) * 0.02 * this.charge);
    spr(ctx, 'sun', -s / 2, -s / 2, s, s);
    if (!PLAYER.has('SunWonder1')) { ctx.globalAlpha = 0.35; ctx.fillStyle = '#334'; ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.restore();
  },
};

const WEATHER = {
  rainAt(x) { for (const c of G.clouds) if (c.rain > 0 && Math.abs(dX(c.x, x)) < c.w * (c.level > 1 ? 0.8 : 0.5)) return true; return false; },
  sunAt(x) { return SUN.beam > 0 && Math.abs(dX(SUN.x, x)) < (SUN.level > 1 ? 160 : 110); },
};

// ---------- wonders ----------
const WONDERS = {
  rain: { lvl: ['RainWonder1', 'RainWonder2'], icon: 'progress_rain', name: ['Rain', 'Flood'], tip: ['ToolTipManaCostRainWonder1', 'ToolTipManaCostRainWonder2'] },
  sun: { lvl: ['SunWonder1', 'SunWonder2'], icon: 'progress_sun', name: ['Sunshine', 'Firestorm'], tip: ['ToolTipManaCostSunWonder1', 'ToolTipManaCostSunWonder2'] },
  lightning: { lvl: ['LightningWonder1', 'LightningWonder2'], icon: 'progress_lightning', name: ['Lightning', 'Electrostorm'], tip: ['ToolTipManaCostLightningWonder1', 'ToolTipManaCostLightningWonder2'] },
  terrain: { lvl: ['TerrainWonder1', 'TerrainWonder2'], icon: 'progress_terra', name: ['Terraform', 'Super-Terraform'], tip: ['ToolTipManaCostTerrainWonder1', 'ToolTipManaCostTerrainWonder2'] },
  resurrect: { lvl: ['ResurrectionWonder1'], icon: 'progress_reincarnate', name: ['Resurrection'], tip: ['ToolTipManaCostResurrectionWonder1'] },
  move: { lvl: ['MovementWonder1'], icon: 'progress_movement', name: ['Move'], tip: ['ToolTipManaCostMovementWonder1'] },
};
const MANACOST = { rain: [1, 2], sun: [1, 2], lightning: [1, 2], terrain: [1, 2], resurrect: [1], move: [0] };

const WONDER = {
  // charge state for the active press-and-hold gesture
  ch: null, // {kind, target, t, level, sx, sy, ready}
  CHARGE: 1.1,
  maxLevel(kind) {
    const L = WONDERS[kind].lvl; let n = 0;
    for (const k of L) if (PLAYER.has(k)) n++;
    return n;
  },
  begin(kind, target, sx, sy) {
    if (this.maxLevel(kind) === 0) {
      const need = D.cfg.LevelUnlocks[WONDERS[kind].lvl[0]];
      UI.toast(`${WONDERS[kind].name[0]} unlocks at level ${need ? need.UnlockLevel : '?'}`);
      return false;
    }
    this.ch = { kind, target, t: 0, level: 0, sx, sy, ready: false };
    return true;
  },
  update(dt) {
    const c = this.ch; if (!c) return;
    c.t += dt;
    const maxL = this.maxLevel(c.kind);
    const lvl = Math.min(maxL, Math.floor(c.t / this.CHARGE));
    if (lvl > c.level) {
      const cost = MANACOST[c.kind][lvl - 1];
      if (PLAYER.mana < cost) {
        if (lvl === 1 && !c.warned) { c.warned = true; UI.toast(STR('TutorialNotEnoughMana')); SFX.play('sigh3', 0.7); HINT.show('TutorialNoMana'); }
      } else {
        c.level = lvl; c.ready = true;
        SFX.play('powerupReady', 0.7, 1 + (lvl - 1) * 0.15);
        if (lvl === 2) SFX.play('energyRushShortened1', 0.5);
        if (c.kind === 'rain' && lvl === 1 && STATS.get('used_rain1') < 2) HINT.show('TutorialCloudSwipeDown', true);
      }
    }
    if (c.target && 'charge' in c.target) c.target.charge = c.level ? 1 : clamp(c.t / this.CHARGE, 0, 1) * 0.6;
  },
  cancel() {
    if (this.ch && this.ch.target && 'charge' in this.ch.target) this.ch.target.charge = 0;
    this.ch = null;
  },
  // fire the charged wonder; dir = flick vector in screen space
  release(dxs, dys, wx, wy) {
    const c = this.ch; this.ch = null;
    if (!c) return false;
    if (c.target && 'charge' in c.target) c.target.charge = 0;
    if (!c.ready || !c.level) return false;
    const cost = MANACOST[c.kind][c.level - 1];
    if (PLAYER.mana < cost) { UI.toast(STR('TutorialNotEnoughMana')); return false; }
    PLAYER.mana -= cost; UI.bump('mana');
    addXP(cost, null, null);
    STATS.add('used_' + c.kind + c.level, 1);
    STATS.add('manaUsed', cost);
    const L = c.level;
    switch (c.kind) {
      case 'rain': this.rain(c.target, L); break;
      case 'sun': this.sun(L, dxs, dys); break;
      case 'lightning': this.lightning(c.target, L, dxs, dys); break;
      case 'terrain': this.terrain(c.target.x, L, dys < 0 ? 1 : -1); break;
      case 'resurrect': this.resurrect(c.target); break;
      case 'move': PLACE.start(c.target.t, 0, c.target); break;
    }
    GAME.onWonder(c.kind, L);
    return true;
  },
  influence(kind, x, radius, level) {
    for (const f of G.followers) {
      if (f.state === 'gone' || f.state === 'dead') continue;
      if (Math.abs(dX(f.x, x)) < radius) f.influence(kind, level, x);
    }
  },
  // ---- rain
  rain(cloud, L) {
    cloud.level = L; cloud.rain = cloud.rainMax = L > 1 ? 8 : 5; cloud.squash = 1;
    cloud.sound = SFX.play(L > 1 ? 'Raintorrential' : 'rainRegular1', 0.7, 1, true);
    if (L > 1) { SFX.play('thunderclapShort1', 0.4); for (let i = 0; i < 6; i++) G.fx.push(new Particle('rainblast', cloud.x + rand(-100, 100), cloud.y - 30, { vy: -500, life: 0.6, size: rand(60, 90), alpha: 0.6 })); }
    this.influence('rain', cloud.x, L > 1 ? 260 : 190, L);
    if (L > 1) for (const f of G.followers) if (Math.abs(dX(f.x, cloud.x)) < 150 && f.believer && !f.busy && Math.random() < 0.5) f.scare(cloud.x);
  },
  rainTick(c, dt) {
    const L = c.level;
    const half = c.w * (L > 1 ? 0.8 : 0.5);
    // drops
    const n = (L > 1 ? 70 : 38) * dt;
    for (let i = 0; i < n + Math.random(); i++) {
      const x = c.x + rand(-half, half);
      G.fx.push(new Drop(x, c.y - 20 + rand(-10, 10), L > 1));
    }
    LAND.addM(c.x, half, dt / (L > 1 ? 5 : 8.5));
    // power rain buildings
    for (const b of G.buildings) if (b.powerFor === 'rain' && b.state === 'ready' && Math.abs(dX(b.x, c.x)) < half + b.w / 2) {
      const was = b.power; b.power = Math.min(1, b.power + dt / 3);
      if (was < 1 && b.power >= 1) { SFX.at('powerupReady', b.x, 0.5); G.fx.push(new FloatText('Powered!', b.x, b.gy + b.h, '#7fd8ff')); }
    }
    extinguish(c.x, half);
    // plants spring up after a bit of rain
    if (Math.random() < dt * (L > 1 ? 4 : 2)) { const x = c.x + rand(-half, half); if (LAND.mAt(x) > 0.05) FLORA.spawn(Math.random() < 0.85 ? 'plant' : 'tree', x); }
  },
  // ---- sun
  sun(L, dxs, dys) {
    if (L === 1) {
      SUN.level = 1; SUN.beam = SUN.beamMax = 5;
      SFX.play('sunRays11', 0.7);
      this.influence('sun', SUN.x, 190, 1);
    } else {
      // firestorm: fling a fireball towards the flick direction
      SUN.level = 2;
      const len = Math.hypot(dxs, dys) || 1;
      let dx = dxs / len, dy = dys / len;
      if (len < 10) { dx = 0; dy = 1; }
      G.fx.push(new Fireball(SUN.x, SUN.y, dx, dy));
      SFX.play('sunFlare5', 0.8);
    }
  },
  sunTick(dt) {
    const x = SUN.x;
    LAND.addM(x, 110, -dt * 0.025);
    // flowers bloom on wet ground in the sunshine
    if (Math.random() < dt * 6) {
      const fx = x + rand(-110, 110);
      if (LAND.mAt(fx) > 0.1) { const f = FLORA.spawn('flower', fx); if (f) STATS.add('sunFlowers', 1); }
    }
    for (const b of G.buildings) if (b.powerFor === 'sun' && b.state === 'ready' && Math.abs(dX(b.x, x)) < 110 + b.w / 2) {
      const was = b.power; b.power = Math.min(1, b.power + dt / 3);
      if (was < 1 && b.power >= 1) { SFX.at('powerupReady', b.x, 0.5); G.fx.push(new FloatText('Powered!', b.x, b.gy + b.h, '#ffe36a')); }
    }
    // gentle shimmer particles
    if (Math.random() < dt * 14) G.fx.push(new Particle('sparkle01', x + rand(-100, 100), LAND.hAt(x) + rand(0, SUN.y - LAND.hAt(x)), { vy: -40, life: 0.8, size: rand(8, 16), add: true }));
  },
  fireImpact(x) {
    const gy = LAND.hAt(x);
    SFX.at('fireSmall', x, 1); SFX.at('earthQuake', x, 0.4);
    G.shake = 0.5;
    for (let i = 0; i < 26; i++) G.fx.push(new Particle(pick(['sunflame', 'smoke', 'sunflame']), x + rand(-60, 60), gy + rand(0, 60), { vx: rand(-160, 160), vy: rand(60, 260), g: 200, life: rand(0.6, 1.4), size: rand(30, 80), add: Math.random() < 0.6, grow: 30 }));
    LAND.addM(x, 160, -0.7);
    igniteNear(x, 170, null);
    for (const f of G.flora) if (Math.abs(dX(f.x, x)) < 140 && f.kind !== 'tree') { f.dying = Math.max(f.dying, 0.5); }
    for (const fo of G.followers) {
      const d = Math.abs(dX(fo.x, x));
      if (d < 60) fo.setFire();
      else if (d < 260) fo.scare(x);
    }
    for (const c of G.critters()) if (Math.abs(dX(c.x, x)) < 90) c.damage(60, x, 300);
    this.influence('sun', x, 240, 2);
    for (const b of G.ents) if (b instanceof Breakable && Math.abs(dX(b.x, x)) < 100) b.damage(50);
  },
  // ---- lightning
  lightning(cloud, L, dxs, dys) {
    // aim: follow the flick direction from the cloud down to the ground
    const len = Math.hypot(dxs, dys);
    const sc = CAM.toScreen(cloud.x, cloud.y - 20);
    let ux = 0, uy = 1;
    if (len > 12) { ux = dxs / len; uy = dys / len; }
    // march in screen space until we hit the ground
    let hx = cloud.x, found = false;
    for (let s = 0; s < 3000; s += 6) {
      const p = CAM.toWorld(sc.x + ux * s, sc.y + uy * s);
      if (p.y <= LAND.hAt(p.x)) { hx = p.x; found = true; break; }
      if (p.r < R0 * 0.5) break;
    }
    if (!found) hx = cloud.x + (ux * 300) / CAM.zoom;
    const strikes = L > 1 ? 5 : 1;
    for (let i = 0; i < strikes; i++) {
      const tx = wrapX(hx + (i ? rand(-160, 160) : 0));
      setTimeout(() => this.bolt(cloud, tx, L, i === 0), i * 120);
    }
    cloud.squash = 1;
  },
  bolt(cloud, tx, L, main) {
    const gy = LAND.hAt(tx);
    G.fx.push(new Bolt(cloud.x, cloud.y - 25, tx, gy, L > 1));
    G.flash = main ? 0.5 : 0.25;
    SFX.at('thunderclapShort1', tx, main ? 0.9 : 0.5); SFX.at(SND.lightning, tx, 0.8);
    G.fx.push(new Particle('lightningring', tx, gy + 20, { life: 0.5, size: 60, grow: 400, add: true, aspect: 0.5 }));
    for (let i = 0; i < 10; i++) G.fx.push(new Particle('lightningspark', tx, gy + 10, { vx: rand(-200, 200), vy: rand(50, 260), g: 500, life: 0.5, size: rand(14, 26), add: true, rot: rand(0, TAU) }));
    for (let i = 0; i < 6; i++) G.fx.push(new Particle(pick(['rock01', 'rock02', 'grass01', 'grass02']), tx, gy + 5, { vx: rand(-150, 150), vy: rand(100, 260), g: 600, life: 0.9, size: rand(10, 18), vr: rand(-8, 8) }));
    if (main) G.shake = 0.35;
    const R = L > 1 ? 110 : 55;
    for (const f of G.followers) {
      if (f.state === 'gone' || f.state === 'dead') continue;
      const d = Math.abs(dX(f.x, tx));
      if (d < R) {
        if (f.skel) { f.damage(200, tx, 260); addXP(5, f.x, f.gy + 100); continue; }
        f.damage(L > 1 ? 30 : 20, tx, 320);
        if (Math.random() < 0.25) f.setFire();
        addXP(f.believer ? 1 : 3, f.x, f.gy + 100);
      }
    }
    if (main) this.influence('lightning', tx, L > 1 ? 280 : 200, L);
    for (const b of G.ents) if (b instanceof Breakable && !b.dead && Math.abs(dX(b.x, tx)) < R + b.w / 2) b.damage(L > 1 ? 100 : 50);
    for (const b of G.buildings) if (b.state === 'ready' && Math.abs(dX(b.x, tx)) < R + b.w / 2) {
      if (b.powerFor === 'lightning') { b.power = 1; SFX.at('powerupReady', b.x, 0.5); G.fx.push(new FloatText('Powered!', b.x, b.gy + b.h, '#d7b3ff')); }
      else if (Math.random() < 0.2) b.setFire();
    }
    for (const f of G.flora) if (f.kind === 'tree' && Math.abs(dX(f.x, tx)) < R + 20 && Math.random() < 0.5) f.fire = rand(5, 9);
    LAND.addM(tx, 40, -0.15);
  },
  // ---- terrain
  terrain(x, L, sign) {
    const R = L > 1 ? 18 * SEG * 0.6 : 85;
    const amt = (L > 1 ? 110 : 45) * sign;
    // don't dig out from under buildings
    let steps = 0;
    const id = setInterval(() => {
      steps++;
      LAND.addH(x, R, amt / 12);
      for (const b of G.buildings) if (!b.isDeco && Math.abs(dX(b.x, x)) < R + b.w / 2) LAND.flatten(b.x, b.w * 0.4, 0.6);
      if (steps >= 12) clearInterval(id);
    }, 40);
    SFX.at('earthQuake', x, 0.9);
    G.shake = L > 1 ? 0.8 : 0.45;
    const gy = LAND.hAt(x);
    for (let i = 0; i < (L > 1 ? 30 : 16); i++) G.fx.push(new Particle(pick(['mudfall', 'rock01', 'rock02', 'rock03', 'grass03']), x + rand(-R, R), gy + rand(0, 30), { vx: rand(-90, 90), vy: rand(120, 320), g: 600, life: rand(0.8, 1.4), size: rand(12, 26), vr: rand(-6, 6) }));
    for (const f of G.followers) {
      const d = Math.abs(dX(f.x, x));
      if (d < R * 1.2 && !f.busy) f.scare(x);
    }
    this.influence('terrain', x, R + 100, L);
  },
  // ---- resurrection
  resurrect(grave) {
    if (!grave || grave.dead) return;
    grave.dead = true;
    const f = grave.f;
    f.state = 'arrive'; f.health = 100; f.energy = 0.2; f.fire = 0; f.burnt = 0; f.x = grave.x; f.y = 0;
    f.seq([['reincarnate', false]]);
    f.say(STR('FollowerStateResurrected'), 3);
    SFX.at('tombstoneRaise1', grave.x, 0.9);
    for (let i = 0; i < 16; i++) G.fx.push(new Particle(pick(['halo_glow', 'sparkle01']), grave.x + rand(-20, 20), grave.gy + rand(0, 80), { vy: rand(40, 120), life: rand(1, 1.8), size: rand(14, 30), add: true }));
    STATS.add('resurrected', 1);
    this.influence('resurrect', grave.x, 200, 1);
  },
};

// ---------- wonder fx ----------
class Drop {
  constructor(x, y, big) { this.x = wrapX(x); this.y = y; this.vy = -rand(600, 760); this.big = big; this.l = big ? 26 : 18; }
  update(dt) {
    this.y += this.vy * dt;
    const gy = LAND.hAt(this.x);
    if (this.y <= gy) {
      if (Math.random() < 0.3) G.fx.push(new Particle(Math.random() < 0.5 ? 'splash' : 'watersplash', this.x, gy + 4, { life: 0.3, size: this.big ? 22 : 14, alpha: 0.7 }));
      return false;
    }
    return true;
  }
  draw(ctx) {
    pushAt(ctx, this.x, this.y);
    spr(ctx, 'raindrop', -2.5, -this.l / 2, 5, this.l);
    ctx.restore();
  }
}
class Bolt {
  constructor(x0, y0, x1, y1, big) {
    this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1; this.x = x1; this.life = this.max = big ? 0.45 : 0.32; this.big = big;
    this.pts = [];
    const n = 9;
    for (let i = 0; i <= n; i++) this.pts.push([i / n, i === 0 || i === n ? 0 : rand(-1, 1)]);
  }
  update(dt) { this.life -= dt; if (Math.random() < 0.3) this.pts.forEach((p, i) => { if (i && i < this.pts.length - 1) p[1] = rand(-1, 1); }); return this.life > 0; }
  draw(ctx) {
    // compute endpoints in planet space
    const P = (x, y) => { const th = (x / C) * TAU, r = R0 + y; return [r * Math.sin(th), -r * Math.cos(th)]; };
    const a = P(this.x0, this.y0);
    const b = P(this.x0 + dX(this.x0, this.x1), this.y1);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(this.life / this.max * 1.5, 0, 1);
    for (const [wid, col] of [[this.big ? 16 : 11, 'rgba(120,150,255,.45)'], [this.big ? 6 : 4, 'rgba(220,235,255,1)']]) {
      ctx.lineWidth = wid; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      this.pts.forEach(([t, o], i) => {
        const x = a[0] + dx * t + nx * o * 26, y = a[1] + dy * t + ny * o * 26;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
    ctx.restore();
  }
}
class Fireball {
  constructor(x, y, dx, dy) {
    // velocity in screen-aligned direction; convert progressively in world space
    this.x = x; this.y = y; this.sdx = dx; this.sdy = dy; this.speed = 900; this.life = 4; this.trail = 0;
  }
  update(dt) {
    this.life -= dt;
    const sc = CAM.toScreen(this.x, this.y);
    const p = CAM.toWorld(sc.x + this.sdx * this.speed * dt * CAM.zoom, sc.y + this.sdy * this.speed * dt * CAM.zoom);
    this.x = p.x; this.y = p.y;
    this.sdy += dt * 0.9; // a little gravity bend
    const n = Math.hypot(this.sdx, this.sdy); this.sdx /= n; this.sdy /= n;
    if (Math.random() < 0.9) G.fx.push(new Particle(Math.random() < 0.7 ? 'sunflame' : 'smoke', this.x + rand(-10, 10), this.y + rand(-10, 10), { life: 0.5, size: rand(30, 50), add: true, grow: -20 }));
    if (this.y <= LAND.hAt(this.x) || this.life <= 0 || p.r < R0 * 0.6) { WONDER.fireImpact(this.x); return false; }
    return true;
  }
  draw(ctx) {
    pushAt(ctx, this.x, this.y);
    ctx.globalCompositeOperation = 'lighter';
    spr(ctx, 'halo_glow', -50, -50, 100, 100);
    spr(ctx, 'sunflame', -30, -30, 60, 60);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}
// sunbeam column
function drawSunBeam(ctx) {
  if (SUN.beam <= 0) return;
  const gy = LAND.hAt(SUN.x);
  const t = SUN.beam / SUN.beamMax;
  const a = Math.min(1, (1 - t) * 6, t * 3);
  pushAt(ctx, SUN.x, gy);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.55 * a;
  const h = SUN.y - gy;
  const g = ctx.createLinearGradient(0, -h, 0, 0);
  g.addColorStop(0, 'rgba(255,240,170,0.9)'); g.addColorStop(1, 'rgba(255,220,120,0.15)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(-40, -h); ctx.lineTo(40, -h); ctx.lineTo(120, 0); ctx.lineTo(-120, 0); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 0.6 * a;
  spr(ctx, 'themerays', -130, -h * 0.6, 260, h * 0.6);
  ctx.globalAlpha = 0.5 * a;
  spr(ctx, 'halo_glow', -150, -60, 300, 120);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.restore();
}
