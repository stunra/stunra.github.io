'use strict';
// ---------- skinning ----------
function resolveSkin(cat) {
  const out = {};
  const root = D.cfg.AnimationSkinning[cat];
  const apply = node => {
    for (const k in node) {
      const v = node[k];
      if (typeof v === 'string') out[k] = pick(v.split(/\s+/).filter(Boolean));
      else if (k.startsWith('Random')) { const ks = Object.keys(v); if (ks.length) apply(v[pick(ks)]); }
      else if (v && typeof v === 'object') apply(v);
    }
  };
  if (root) apply(root);
  return out;
}
const ELN = D.elementNames;

// draw an animation frame of a skinned puppet at the current transform (feet at origin)
function drawPuppet(ctx, animName, frame, skin) {
  const A = D.anims[animName];
  if (!A) return;
  let fi = Math.floor(frame) % A.f.length;
  let fr = A.f[fi];
  while (!fr.length && fi > 0) fr = A.f[--fi];
  for (let k = fr.length - 1; k >= 0; k--) {
    const e = fr[k];
    const base = ELN[e[0]];
    let s = null;
    const sk = skin[base];
    if (sk) s = SPR[sk.toLowerCase()];
    if (!s) s = SPR[base.toLowerCase()];
    if (!s) continue;
    ctx.save();
    ctx.transform(e[1], e[2], e[3], e[4], e[5], e[6]);
    ctx.scale(e[9], e[10]);
    ctx.drawImage(s.img, s.x, s.y, s.w, s.h, 0, 0, e[11], e[12]);
    ctx.restore();
  }
}

const FNAMES_M = ['Matthew', 'Al', 'Rex', 'John', 'Mark', 'Bob', 'Neil', 'Eli', 'Dene', 'Tak', 'Christian', 'Ollie', 'Gus', 'Barney', 'Hamish', 'Percy', 'Otto', 'Ned', 'Wilf', 'Basil', 'Clem', 'Monty', 'Fergus', 'Stanley'];
const FNAMES_F = ['Stephanie', 'Maya', 'Hannah', 'Katherine', 'Eve', 'Mabel', 'Ivy', 'Rosie', 'Edna', 'Pearl', 'Hattie', 'Flo', 'Agnes', 'Dot', 'Winnie', 'Nell', 'Peggy', 'Tilly', 'Iris', 'Violet'];

let FID = 1;
class Follower {
  constructor(t, x, o = {}) {
    this.id = o.id || FID++; FID = Math.max(FID, this.id + 1);
    this.t = t; this.tpl = D.templates[t] || D.templates.FollowerNormal;
    const an = this.tpl.c.EntityComponentAnimated || {};
    this.cat = o.cat || an.skinCategoryName || 'FollowerMale';
    this.skel = this.cat === 'Skeleton';
    this.pre = this.skel ? 'skeleton_' : 'follower_';
    this.female = this.cat.includes('Female');
    this.skin = o.skin || resolveSkin(this.cat);
    this.name = o.name || (this.skel ? 'Skeleton' : pick(this.female ? FNAMES_F : FNAMES_M));
    this.x = wrapX(x); this.y = 0; this.air = false; this.vx = 0; this.vy = 0;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.believer = o.believer != null ? o.believer : false;
    this.desire = o.desire || 'rain';
    this.belief = o.belief || 0;
    this.energy = o.energy != null ? o.energy : 1;
    this.health = 100;
    this.speed = (this.skel ? 22 : 30) * rand(0.9, 1.1);
    this.state = 'wander'; this.st = 0; this.target = null; this.idleT = rand(1, 3);
    this.anim = null; this.af = 0; this.aloop = true; this.aq = []; this.adone = false;
    this.building = null; this.role = null; this.slot = 0;
    this.swing = 0; this.swingV = 0;
    this.bubble = null; this.fire = 0; this.burnt = 0; this.hurtT = 0; this.flash = 0;
    this.sndT = rand(2, 6);
    this.born = o.born || Date.now();
    this.special = !!o.special;
    this.react = 0;
    this.play('idle');
  }
  // ---- animation
  A(n) { return this.pre + n; }
  play(n, loop = true, ...then) {
    const name = this.A(n);
    if (!D.anims[name]) return;
    if (this.anim === name && this.aloop === loop && !then.length && !this.adone) return;
    this.anim = name; this.af = 0; this.aloop = loop; this.adone = false;
    this.aq = then.map(x => Array.isArray(x) ? x : [x, true]);
  }
  seq(list) { // [['start',false],['loop',true]]
    const [n, l] = list[0];
    this.anim = null;
    this.play(n, l, ...list.slice(1));
  }
  stepAnim(dt) {
    const A = D.anims[this.anim];
    if (!A) return;
    this.af += dt * ANIM_FPS;
    if (this.af >= A.f.length) {
      if (this.aq.length) { const [n, l] = this.aq.shift(); this.anim = this.A(n); this.af = 0; this.aloop = l; this.adone = false; }
      else if (this.aloop) this.af %= A.f.length;
      else { this.af = A.f.length - 1; this.adone = true; }
    }
  }
  say(text, t = 3, icon = null) { this.bubble = { text, t, icon, max: t }; }
  get gy() { return LAND.hAt(this.x); }
  get busy() { return ['held', 'air', 'convert', 'work', 'build', 'dead', 'arrive', 'getup'].includes(this.state); }
  // ---- state changes
  setState(s, d = {}) {
    this.state = s; this.st = 0; Object.assign(this, d);
    switch (s) {
      case 'wander': this.target = null; this.idleT = rand(0.5, 2); this.play(this.energy < 0.3 ? 'walk_tired' : 'idle'); break;
      case 'held': this.seq([['pickup', false]]); SFX.play(pick(this.skel ? ['hit5'] : SND.scared), 0.6, rand(0.95, 1.1)); break;
      case 'air': this.seq([['missile', true]]); break;
      case 'scared': this.seq([['scared', false], ['run', true]]); break;
      case 'exhausted': this.seq([['exhausted', false], ['exhaustedloop', true]]); this.say(STR('FollowerStateExhausted'), 3); break;
      case 'celebrate': this.seq([['celebrate', false], ['celebrateloop', true]]); break;
      case 'getup': this.seq([['getup', false]]); break;
      case 'arrive': this.seq([['reincarnate', false]]); break;
    }
  }
  pickUp() {
    if (this.building) this.leaveBuilding(true);
    this.setState('held');
    this.y = 0;
  }
  // ---- building assignment
  joinBuilding(b) {
    const role = b.state === 'build' ? 'build' : 'work';
    if (role === 'build' ? b.builders.length >= b.maxB : b.workers.length >= b.maxF) return false;
    if (!this.believer || this.skel) return false;
    if (role === 'work' && this.energy < 0.05 && !b.restores) { this.say(STR('FollowerStateExhausted'), 2.5); return false; }
    this.building = b; this.role = role;
    (role === 'build' ? b.builders : b.workers).push(this);
    b.relayout();
    this.state = role; this.st = 0; this.y = 0; this.air = false;
    if (role === 'build') { this.seq([['startchop', false], ['choploop', true]]); this.say(STR('FollowerStateBuilder'), 2); }
    else {
      const d = b.def;
      const into = (d.followerIntoAnim || 'follower_idle').replace('follower_', '');
      const loop = (d.followerLoopAnim || 'follower_idle').replace('follower_', '');
      this.seq([[into, false], [loop, true]]);
      this.say(STR(d.followerBehaviour === 'FollowerStateBuildingBehaviourGeneric' ? 'FollowerStateBuildingBehaviourGeneric_Dwelling' : d.followerBehaviour || 'FollowerStateWander'), 2.5);
      if (b.type === 'Shrine') STATS.add('worshipJoins', 1);
    }
    SFX.at(SND.happy, this.x, 0.5);
    return true;
  }
  leaveBuilding(silent = false) {
    const b = this.building; if (!b) return;
    const arr = this.role === 'build' ? b.builders : b.workers;
    const i = arr.indexOf(this); if (i >= 0) arr.splice(i, 1);
    b.relayout();
    this.building = null; this.role = null;
    if (!silent) {
      const out = (b.def.followerOutOfAnim || 'follower_idle').replace('follower_', '');
      this.state = 'wander'; this.st = 0; this.target = null; this.idleT = 1.2;
      this.seq([[out, false], ['idle', true]]);
    }
  }
  // ---- reactions
  influence(kind, level, x) {
    if (this.state === 'dead' || this.skel) return;
    if (!this.believer) {
      const add = (this.desire === kind ? 60 : 12) * (level > 1 ? 1.6 : 1) * (this.tutorial && this.desire === kind ? 2 : 1);
      this.belief += add;
      if (this.belief >= 100 && this.state !== 'held' && this.state !== 'air') { this.convert(); return; }
      if (this.desire === kind) this.say('♥', 1.5);
      else this.say(STR(this.desire === 'rain' ? 'FollowerStateConversionRain' : this.desire === 'sun' ? 'FollowerStateConversionSun' : 'FollowerStateScared'), 2.5, 'Desire' + this.desire);
      if (!this.busy && this.state !== 'scared') this.seq([['impresshappy', false], ['idle', true]]);
      return;
    }
    if (this.busy) return;
    if (kind === 'rain') { this.seq([['rain', false], ['rainloop', true]]); this.react = 3; this.state = 'react'; this.st = 0; if (Math.random() < 0.5) this.say(STR('FollowerStateReactToRain'), 2); }
    else if (kind === 'sun') { this.seq([['sunshine', false], ['sunshineloop', true]]); this.react = 3; this.state = 'react'; this.st = 0; if (Math.random() < 0.5) this.say(STR('FollowerStateReactToSun'), 2); }
    else if (kind === 'lightning' || kind === 'fire' || kind === 'terrain') this.scare(x);
    else { this.seq([['impresshappy', false], ['impresshappyloop', true]]); this.react = 2; this.state = 'react'; this.st = 0; }
  }
  scare(fromX) {
    if (this.busy && this.state !== 'react') return;
    if (this.state === 'scared') return;
    this.dir = dX(fromX, this.x) >= 0 ? 1 : -1;
    this.setState('scared');
    this.scareT = rand(1.6, 2.6);
    if (Math.random() < 0.6) this.say(STR('FollowerStateScared'), 1.8);
    SFX.at(SND.scared, this.x, 0.6, rand(0.95, 1.1));
  }
  convert() {
    this.believer = true; this.belief = 100;
    this.state = 'convert'; this.st = 0;
    this.seq([['conversion', false], ['conversionloop', true]]);
    SFX.at(SND.attract, this.x, 0.9);
    STATS.add('converted', 1);
    for (let i = 0; i < 14; i++) G.fx.push(new Particle(pick(['sparkle01', 'halo_glow', 'chargesparkle']), this.x + rand(-30, 30), this.gy + rand(10, 100), { vy: rand(20, 80), life: rand(1, 2), size: rand(14, 30), add: true }));
    G.fx.push(new Particle('halo', this.x, this.gy + 110, { life: 3, size: 46, aspect: 0.35, add: true, vy: 8 }));
  }
  setFire() {
    if (this.skel || this.state === 'dead') return;
    if (this.fire <= 0) { this.fire = 6; this.say(STR('FollowerStateScared'), 2); if (this.building) this.leaveBuilding(); if (!this.busy) this.setState('scared'); this.scareT = 6; }
  }
  damage(n, fromX, knock = 0) {
    this.health -= n; this.hurtT = 1.2; this.flash = 0.25;
    if (knock && this.state !== 'held') {
      if (this.building) this.leaveBuilding(true);
      this.state = 'air'; this.air = true; this.y = Math.max(this.y, 2);
      this.vx = (dX(fromX, this.x) >= 0 ? 1 : -1) * knock * rand(0.6, 1); this.vy = knock * 1.6;
      this.seq([['missile', true]]);
    }
    if (this.health <= 0) this.die();
    else SFX.at(this.skel ? 'hit6' : SND.hit, this.x, 0.8);
  }
  die() {
    if (this.state === 'dead') return;
    if (this.building) this.leaveBuilding(true);
    this.state = 'dead'; this.st = 0; this.fire = 0;
    this.seq([['death', false]]);
    SFX.at(this.skel ? 'hit11' : SND.death, this.x, 0.9);
  }
  // ---- update
  update(dt) {
    this.st += dt;
    this.stepAnim(dt);
    if (this.bubble) { this.bubble.t -= dt; if (this.bubble.t <= 0) this.bubble = null; }
    this.flash = Math.max(0, this.flash - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.health < 100 && this.state !== 'dead') this.health = Math.min(100, this.health + dt * 2);
    // fire
    if (this.fire > 0) {
      this.fire -= dt; this.burnt = Math.min(1, this.burnt + dt * 0.25);
      if (Math.random() < dt * 10) G.fx.push(new Particle('sunflame', this.x + rand(-12, 12), this.gy + this.y + rand(20, 70), { vy: 70, life: 0.5, size: rand(20, 34), add: true }));
      this.health -= dt * 9;
      if (this.health <= 0) { this.die(); }
    } else this.burnt = Math.max(0, this.burnt - dt * 0.15);
    // weather
    if (WEATHER.rainAt(this.x) && this.state !== 'held') { this.energy = Math.min(1, this.energy + dt / 4); if (this.fire > 0) this.fire = 0; }
    if (WEATHER.sunAt(this.x) && this.state !== 'held') this.energy = Math.min(1, this.energy + dt / 9);
    const S = this['s_' + this.state];
    if (S) S.call(this, dt);
  }
  walkTo(dt, tx, speedMul = 1) {
    const d = dX(this.x, tx);
    if (Math.abs(d) < 3) return true;
    this.dir = d > 0 ? 1 : -1;
    const sl = LAND.slope(this.x + this.dir * 8) * this.dir;
    const grad = clamp(1 - sl * 0.6, 0.3, 1.5);
    const sp = this.speed * speedMul * grad * (this.energy < 0.3 && !this.skel ? 0.6 : 1);
    const step = Math.min(Math.abs(d), sp * dt);
    this.x = wrapX(this.x + this.dir * step);
    return false;
  }
  s_wander(dt) {
    if (!this.believer && !this.skel && Math.random() < dt * 0.08 && !this.bubble) {
      this.say(STR(this.desire === 'rain' ? 'FollowerStateConversionRain' : this.desire === 'sun' ? 'FollowerStateConversionSun' : 'FollowerStateConversionRain'), 3, 'Desire' + this.desire);
    }
    if (this.energy <= 0.01 && this.believer) { this.setState('exhausted'); return; }
    if (this.skel) { SKELETON_AI(this, dt); return; }
    if (this.target == null) {
      this.idleT -= dt;
      if (this.idleT <= 0) {
        const r = Math.random();
        if (this.believer && this.energy > 0.8 && r < 0.08) { this.seq([['juggle', false], ['idle', true]]); this.idleT = 4; }
        else if (this.believer && r < 0.16) { this.seq([['sit', false], ['sitloop', true]]); this.idleT = rand(4, 8); this.sitting = true; }
        else {
          if (this.sitting) { this.sitting = false; this.seq([['getup', false], ['idle', true]]); this.idleT = 1; return; }
          let tx = this.x + rand(-260, 260);
          if (this.home != null && Math.abs(dX(this.home, tx)) > 500) tx = this.home + rand(-200, 200);
          this.target = wrapX(tx);
          this.play(this.energy < 0.3 ? 'walk_tired' : 'walk');
        }
      }
    } else {
      if (this.walkTo(dt, this.target)) { this.target = null; this.idleT = rand(1.5, 5); this.play('idle'); }
    }
    this.sndT -= dt;
    if (this.sndT < 0) { this.sndT = rand(8, 20); if (this.energy < 0.3 && this.believer) SFX.at(SND.sigh, this.x, 0.3); }
  }
  s_react(dt) {
    this.react -= dt;
    if (this.react <= 0) this.setState('wander');
  }
  s_scared(dt) {
    this.scareT -= dt;
    if (this.st > 0.5) this.walkTo(dt, this.x + this.dir * 50, 2.6);
    if (this.scareT <= 0 && this.fire <= 0) this.setState('wander');
  }
  s_exhausted(dt) {
    this.energy = Math.min(1, this.energy + dt / 50);
    if (this.energy > 0.3) this.setState('wander');
  }
  s_celebrate(dt) { if (this.st > 2.5) this.setState('wander'); }
  s_getup(dt) { if (this.adone) this.setState('wander'); }
  s_arrive(dt) { if (this.adone) { this.setState('wander'); if (!this.believer) this.say(STR('FollowerStateClimbFromGround'), 2.5); } }
  s_convert(dt) {
    if (this.st > 2.2 && this.anim === this.A('conversionloop')) {
      this.seq([['convertend', false], ['celebrate', false], ['celebrateloop', true]]);
      this.say(STR('FollowerStateConversionCelebrate'), 3);
      SFX.at(SND.celebrate, this.x, 0.8);
      addXP(20, this.x, this.gy + 120);
      GAME.onConverted(this);
    }
    if (this.st > 5.5) this.setState('wander');
  }
  s_dead(dt) {
    if (this.st > 1.6) {
      this.state = 'gone';
      if (!this.skel) { const gr = new Grave(this); G.graves.push(gr); STATS.add('deaths', 1); GAME.onDeath(this); }
      else { for (let i = 0; i < 10; i++) G.fx.push(new Particle(pick(['rockpiece', 'statuesmash_chunk', 'statuesmash_chunk02']), this.x, this.gy + 30, { vx: rand(-100, 100), vy: rand(80, 220), g: 400, life: 1.2, size: rand(10, 20), vr: rand(-5, 5) })); }
    }
  }
  s_held(dt) {
    // pendulum swing driven by horizontal pointer motion
    const acc = -this.swing * 40 - this.swingV * 4;
    this.swingV += acc * dt; this.swing += this.swingV * dt;
    this.swing = clamp(this.swing, -1.2, 1.2);
    this.energy = Math.max(0, this.energy - dt * 0.002);
  }
  s_air(dt) {
    const g = 900;
    this.vy -= g * dt;
    const r = R0 + this.gy + this.y;
    this.x = wrapX(this.x + this.vx * dt * R0 / r);
    this.y += this.vy * dt;
    this.swing *= Math.pow(0.1, dt);
    if (this.y <= 0) {
      const impact = -this.vy;
      this.y = 0; this.air = false; this.vx = 0; this.vy = 0; this.swing = 0;
      // drop onto a building?
      const b = BUILD.at(this.x);
      if (b && !this.skel && this.believer && b.state !== 'placing' && this.joinBuilding(b)) { GAME.onDrop(this, b); return; }
      if (b && !this.believer && !this.skel) this.say(STR(this.desire === 'sun' ? 'FollowerStateConversionSun' : 'FollowerStateConversionRain'), 2.5, 'Desire' + this.desire);
      GAME.onDrop(this, null);
      if (impact > 700) { this.damage(impact > 1300 ? 25 : 8, this.x); SFX.at('rockDrop1', this.x, 0.6); this.setState('getup'); }
      else if (impact > 380) this.setState('getup');
      else this.setState('wander');
      if (this.state !== 'dead' && impact > 260) for (let i = 0; i < 5; i++) G.fx.push(new Particle(pick(['grass01', 'grass02', 'grass03']), this.x, this.gy + 5, { vx: rand(-80, 80), vy: rand(60, 160), g: 400, life: 0.8, size: 14, vr: rand(-5, 5) }));
    }
  }
  s_work(dt) {
    const b = this.building;
    if (!b || b.dead) { this.building = null; this.setState('wander'); return; }
    this.x = wrapX(b.x + this.slotX);
    this.dir = this.slotDir;
    if (b.restores) {
      this.energy = Math.min(1, this.energy + dt / b.recoverT);
      if (this.energy >= 1 && this.st > 3) { this.leaveBuilding(); this.say(STR('FollowerStateCelebrating'), 2); return; }
    } else {
      this.energy -= dt / b.decayT;
      if (this.energy <= 0) { this.energy = 0; this.leaveBuilding(); this.setState('exhausted'); return; }
    }
    this.sndT -= dt;
    if (this.sndT < 0) {
      this.sndT = rand(+b.def.timeBetweenFollowerSounds || 4, (+b.def.timeBetweenFollowerSounds || 4) * 2);
      const s = b.def.followerSound;
      if (s === 'rake') SFX.at(SND.rake, this.x, 0.35);
      else if (s === 'pub') SFX.at(SND.pub, this.x, 0.35);
      else if (s === 'camp') SFX.at(SND.camp, this.x, 0.35);
      else if (s === 'worshipSmallShortened') SFX.at('worshipSmallShortened', this.x, 0.35, rand(0.9, 1.1));
    }
  }
  s_build(dt) {
    const b = this.building;
    if (!b || b.dead) { this.building = null; this.setState('wander'); return; }
    this.x = wrapX(b.x + this.slotX);
    this.dir = this.slotDir;
    this.energy = Math.max(0.02, this.energy - dt / 400);
    this.sndT -= dt;
    if (this.sndT < 0) { this.sndT = rand(0.8, 1.6); SFX.at(pick(['hit1', 'hit2', 'rake2']), this.x, 0.18, rand(0.9, 1.2)); }
  }
  hit(wx, wy) {
    if (this.state === 'gone') return false;
    const gy = this.gy + this.y;
    return Math.abs(dX(this.x, wx)) * R0 / (R0 + gy) < 26 && wy > gy - 8 && wy < gy + 100;
  }
  draw(ctx) {
    if (this.state === 'gone') return;
    const gy = this.gy;
    pushAt(ctx, this.x, gy + this.y);
    if (this.state === 'held' || this.state === 'air') {
      // hang from the grab point (~70 units up)
      ctx.translate(0, -70); ctx.rotate(this.swing); ctx.translate(0, 70);
    } else {
      ctx.rotate(Math.atan(LAND.slope(this.x)) * 0.4);
    }
    // shadow
    if (this.state !== 'held' && this.state !== 'air') {
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.beginPath(); ctx.ellipse(0, -1, 20, 5, 0, 0, TAU); ctx.fill();
    }
    const S = 1.5 * (this.skel ? 1.05 : 1);
    ctx.scale(this.dir * S, S);
    if (this.flash > 0) ctx.filter = 'brightness(3)';
    else if (this.burnt > 0.05) ctx.filter = `brightness(${1 - this.burnt * 0.7})`;
    else if (!this.believer && !this.skel) ctx.filter = 'saturate(0.55) brightness(0.95)';
    if (this.state === 'dead') ctx.globalAlpha = clamp(1.6 - this.st, 0, 1);
    drawPuppet(ctx, this.anim, this.af, this.skin);
    ctx.filter = 'none'; ctx.globalAlpha = 1;
    ctx.restore();
  }
  drawOver(ctx) {
    if (this.state === 'gone' || this.state === 'dead') return;
    const gy = this.gy + this.y;
    // believer halo for special, desire icon for unbelievers
    if (this.bubble) drawBubble(ctx, this.x, gy + 118, this.bubble.text, this.bubble.icon, Math.min(1, this.bubble.t * 3, (this.bubble.max - this.bubble.t) * 6));
    else if (!this.believer && !this.skel && this.state !== 'held') {
      pushAt(ctx, this.x, gy + 112 + Math.sin(G.t * 3 + this.id) * 4);
      const s = 1 / Math.max(0.55, CAM.zoom) * 0.9;
      ctx.scale(s, s);
      const im = UIIMG['DesireIcon' + this.desire[0].toUpperCase() + this.desire.slice(1)];
      if (im && im.complete) ctx.drawImage(im, -20, -40, 40, 40);
      // belief meter
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-18, 4, 36, 5);
      ctx.fillStyle = '#ffe36a'; ctx.fillRect(-18, 4, 36 * clamp(this.belief / 100, 0, 1), 5);
      ctx.restore();
    }
    if (this.special) {
      pushAt(ctx, this.x, gy + 100);
      ctx.globalCompositeOperation = 'lighter';
      spr(ctx, 'specialfollower', -10, -10, 20, 20);
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }
  }
}

// bubbles drawn in world space but kept at a constant screen size
function drawBubble(ctx, x, y, text, icon, alpha = 1) {
  pushAt(ctx, x, y);
  ctx.rotate(-((x / C) * TAU - CAM.angle()));
  const s = 1 / CAM.zoom;
  ctx.scale(s, s);
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.font = '600 15px Fredoka, "Trebuchet MS", sans-serif';
  const lines = wrapText(ctx, text, 190);
  const iw = icon ? 30 : 0;
  const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 22 + iw, h = lines.length * 19 + 14;
  // keep the bubble on screen; the tail still points at the speaker
  const sp = CAM.toScreen(x, y);
  const sh = clamp(sp.x, w / 2 + 8, G.W - w / 2 - 8) - sp.x;
  ctx.translate(sh, 0);
  ctx.fillStyle = 'rgba(255,255,255,.96)';
  ctx.strokeStyle = 'rgba(40,60,110,.35)'; ctx.lineWidth = 2;
  roundRect(ctx, -w / 2, -h - 10, w, h, 12); ctx.fill(); ctx.stroke();
  const tx = clamp(-sh, -w / 2 + 14, w / 2 - 14);
  ctx.beginPath(); ctx.moveTo(tx - 8, -11); ctx.lineTo(-sh, 0); ctx.lineTo(tx + 8, -11); ctx.closePath(); ctx.fill();
  if (icon && UIIMG[icon] && UIIMG[icon].complete) ctx.drawImage(UIIMG[icon], -w / 2 + 8, -h - 10 + h / 2 - 13, 26, 26);
  ctx.fillStyle = '#26345c'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, -w / 2 + 11 + iw, -h - 10 + 7 + 9.5 + i * 19));
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;
  ctx.restore();
}
function wrapText(ctx, text, maxW) {
  const words = String(text).split(' '); const lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  return lines;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ---------- skeleton critter AI ----------
function SKELETON_AI(s, dt) {
  // hunt the nearest follower, slap them
  let best = null, bd = 900;
  for (const f of G.followers) {
    if (f.skel || f.state === 'dead' || f.state === 'gone' || f.state === 'held' || f.state === 'air') continue;
    const d = Math.abs(dX(s.x, f.x)); if (d < bd) { bd = d; best = f; }
  }
  s.atkT = (s.atkT || 0) - dt;
  if (!best) { if (s.walkTo(dt, s.x + s.dir * 40)) {} s.play('walk'); return; }
  if (bd > 34) { s.walkTo(dt, best.x, bd < 260 ? 1.6 : 1); s.play(bd < 260 ? 'run' : 'walk'); }
  else if (s.atkT <= 0) {
    s.atkT = 1.6; s.dir = dX(s.x, best.x) > 0 ? 1 : -1;
    s.seq([['slap', false], ['idle', true]]);
    setTimeout(() => { if (s.state !== 'wander') return; best.damage(9, s.x, 0); if (best.state !== 'dead') best.scare(s.x); }, 350);
    if (Math.random() < 0.3) best.say(STR('FollowerStateScared'), 1.5);
  }
}
