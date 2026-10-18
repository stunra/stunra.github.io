'use strict';
// compress the original game's hours-long timers into a play session
const timeC = t => (+t > 0 ? 5 + 0.6 * Math.sqrt(+t) : 0);

function buildingDef(t) {
  const tpl = D.templates[t];
  const base = Object.assign({}, (tpl && tpl.c.EntityComponentBuilding) || {});
  const ov = (D.cfg.EntityDefinitions[t] || {}).EntityComponentBuilding || {};
  return Object.assign(base, ov);
}
function storeItem(t) { return D.cfg.StoreItems[t] || null; }
function bName(t) {
  const si = storeItem(t);
  const k = (si && si.Name) || ('BuildingName' + t.replace(/^Building/, ''));
  const s = STR(k);
  if (s !== k) return s;
  return t.replace(/^(Building|Decoration)/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

class Building extends Ent {
  constructor(t, x, o = {}) {
    super(t, x, 0);
    this.snap = true;
    this.isDeco = t.startsWith('Decoration');
    this.def = this.isDeco ? {} : buildingDef(t);
    const d = this.def;
    this.type = d.buildingType || (this.isDeco ? 'Decoration' : 'Other');
    this.maxF = +d.maxFollowers || 0;
    this.maxB = Math.max(1, +d.maxBuilders || 3);
    this.buildT = Math.max(6, timeC(d.buildTime) * 0.8);
    this.genT = this.type === 'Shrine' ? 26 : Math.max(8, timeC(d.maxGenerationTime));
    this.decayT = Math.max(25, timeC(d.followerEnergyFullDecayTime) * 1.5);
    this.recoverT = Math.max(8, timeC(d.followerEnergyFullRecoveryTime) * 0.8);
    this.restores = this.type === 'Refreshment' || this.type === 'Dwelling';
    const pw = d.wonderRequiredForPower || '';
    this.powerBy = /Rain/.test(pw) ? 'rain' : /Sun/.test(pw) ? 'sun' : /Lightning/.test(pw) ? 'lightning' : null;
    this.powerFor = (this.type === 'Farm' || this.type === 'Refreshment') ? this.powerBy : null;
    this.drainT = Math.max(30, timeC(d.fullPowerDrainTime || 1800) * 2);
    this.state = o.state || (this.isDeco || +d.buildTime === 0 ? 'ready' : 'build');
    this.progress = o.progress || 0;
    this.power = o.power || 0;
    this.gen = o.gen || 0;
    this.workers = []; this.builders = [];
    this.fire = 0; this.burnt = 0;
    this.rise = o.rise != null ? o.rise : 1;   // shrine reveal (tutorial)
    this.lift = 0;
    this.piles = [];
    this.maxPiles = this.type === 'Farm' ? 3 : 0;
    this.sndT = 0;
    this.id = o.id || ('b' + Math.random().toString(36).slice(2, 8));
  }
  get cost() { const s = storeItem(this.t); return s ? +s.GoldCost || 0 : 0; }
  relayout() {
    const all = [...this.builders, ...this.workers];
    const n = all.length;
    const span = Math.min(this.w * 0.75, 46 * n);
    all.forEach((f, i) => {
      f.slotX = n === 1 ? (this.type === 'Shrine' ? -this.w * 0.42 : 0) : -span / 2 + span * (i / (n - 1));
      if (this.type === 'Shrine') f.slotX = (i % 2 ? 1 : -1) * (this.w * 0.42 + Math.floor(i / 2) * 34);
      f.slotDir = this.type === 'Shrine' ? (f.slotX < 0 ? 1 : -1) : (f.slotX > 0 ? -1 : 1);
      if (this.type === 'Farm' || this.state === 'build') f.slotDir = i % 2 ? -1 : 1;
    });
  }
  setFire() {
    if (this.isDeco || this.type === 'Shrine') return;
    if (this.fire <= 0) { this.fire = 8; SFX.at('fireSmall', this.x, 0.6); }
  }
  hit(wx, wy, pad = 0) { return super.hit(wx, wy, pad); }
  update(dt) {
    if (this.fire > 0) {
      this.fire -= dt; this.burnt = Math.min(1, this.burnt + dt / 10);
      if (Math.random() < dt * 10) G.fx.push(new Particle('sunflame', this.x + rand(-this.w * 0.35, this.w * 0.35), this.gy + rand(10, this.h * 0.6), { vy: 70, life: 0.7, size: rand(30, 60), add: true }));
      if (Math.random() < dt * 3) G.fx.push(new Particle('smoke', this.x + rand(-this.w * 0.3, this.w * 0.3), this.gy + this.h * 0.6, { vy: 50, life: 2, size: rand(40, 70), alpha: 0.45, grow: 20 }));
      for (const f of this.workers.slice()) { f.leaveBuilding(); f.scare(this.x); }
      this.power = Math.max(0, this.power - dt * 0.2);
    } else this.burnt = Math.max(0, this.burnt - dt / 40);
    if (this.state === 'build') {
      const nb = this.builders.length;
      if (nb) {
        this.progress += dt * (0.4 + 0.6 * nb) / this.buildT;
        this.sndT -= dt;
        if (this.sndT < 0) { this.sndT = rand(2.5, 4.5); SFX.at('constructionMed', this.x, 0.35); }
        if (Math.random() < dt * 2) G.fx.push(new Particle('smoke', this.x + rand(-this.w / 3, this.w / 3), this.gy + 10, { vy: 30, life: 1.2, size: rand(30, 50), alpha: 0.35, grow: 15 }));
      }
      if (this.progress >= 1) this.complete();
      return;
    }
    if (this.powerFor && this.power > 0) this.power = Math.max(0, this.power - dt / this.drainT);
    const nW = this.workers.length;
    if (!nW || this.maxF === 0) return;
    const powered = !this.powerFor || this.power > 0;
    if (this.type === 'Shrine') {
      this.gen += dt * (nW / Math.max(1, this.maxF)) / this.genT * (0.6 + 0.4 * nW);
      if (this.gen >= 1) {
        this.gen = 0;
        if (PLAYER.mana < PLAYER.maxMana) {
          PLAYER.mana = Math.min(PLAYER.maxMana, PLAYER.mana + 1);
          G.fx.push(new FloatText('+1', this.x, this.gy + this.h * 0.95, '#9be7ff', 'halo_glow'));
          SFX.at('energyRushShortened1', this.x, 0.4);
          UI.bump('mana');
        }
        for (let i = 0; i < 6; i++) G.fx.push(new Particle('halo_glow', this.x + rand(-20, 20), this.gy + this.h * 0.6, { vy: rand(60, 140), life: 1, size: rand(14, 26), add: true }));
      }
    } else if (this.type === 'Farm' && powered) {
      if (this.piles.filter(p => !p.dead).length >= this.maxPiles) return;
      this.gen += dt * (0.35 + 0.65 * nW / this.maxF) / this.genT;
      if (this.gen >= 1) {
        this.gen = 0;
        const off = (this.piles.length % 2 ? 1 : -1) * (this.w * 0.5 + 30 + rand(0, 30));
        const p = spawnGold(this.x + off, Math.max(5, +this.def.goldGeneration || 10), this.id);
        this.piles.push(p);
        this.piles = this.piles.filter(q => !q.dead);
        SFX.at('pop', this.x, 0.5);
      }
    } else if (this.type === 'Farm' && !powered && Math.random() < dt * 0.15) {
      const f = pick(this.workers);
      f.say(this.powerBy === 'rain' ? 'Needs rain!' : this.powerBy === 'sun' ? 'Needs sunshine!' : 'Needs a jolt of lightning!', 2.2, this.powerBy === 'rain' ? 'DesireRain' : this.powerBy === 'sun' ? 'DesireSun' : 'DesireLightning');
    }
  }
  complete() {
    this.state = 'ready'; this.progress = 1;
    SFX.at(SND.celebrate, this.x, 0.8); SFX.at('powerupReady', this.x, 0.6);
    for (let i = 0; i < 16; i++) G.fx.push(new Particle(pick(['sparkle01', 'chargesparkle', 'specialfollower']), this.x + rand(-this.w / 2, this.w / 2), this.gy + rand(0, this.h), { vy: rand(30, 120), life: rand(0.8, 1.6), size: rand(14, 30), add: true }));
    addXP(+this.def.xpRewardForFinishedBuilding || 10, this.x, this.gy + this.h);
    STATS.add('built', 1);
    const bs = this.builders.slice();
    for (const f of bs) { f.leaveBuilding(true); f.setState('celebrate'); }
    // builders become workers if there's room
    bs.slice(0, this.maxF).forEach((f, i) => setTimeout(() => { if (f.state === 'celebrate' && f.energy > 0.1) f.joinBuilding(this); }, 1600 + i * 300));
    GAME.onBuilt(this);
  }
  sell() {
    for (const f of [...this.workers, ...this.builders]) f.leaveBuilding();
    const si = storeItem(this.t);
    const price = Math.round((si ? +si.GoldCost : 0) * 0.25);
    PLAYER.gold += price;
    this.dead = true;
    SFX.at('poof5', this.x);
    for (let i = 0; i < 10; i++) G.fx.push(new Particle('smoke', this.x + rand(-this.w / 3, this.w / 3), this.gy + rand(10, this.h / 2), { vy: 40, life: 1.4, size: rand(40, 70), alpha: 0.5, grow: 30 }));
    if (price) G.fx.push(new FloatText('+' + price, this.x, this.gy + this.h * 0.8, '#ffd84a', 'coin'));
  }
  draw(ctx, ghost = null) {
    const gy = this.gy;
    pushAt(ctx, this.x, gy + this.lift);
    if (this.lift) ctx.rotate(Math.sin(G.t * 3) * 0.04);
    if (ghost) ctx.globalAlpha = 0.65;
    if (this.burnt > 0.05) ctx.filter = `brightness(${1 - this.burnt * 0.6}) sepia(${this.burnt * 0.6})`;
    if (this.state === 'build' && !ghost) {
      // building fades in from the ground up behind scaffolding
      const p = clamp(this.progress, 0, 1);
      const top = -this.h * (0.5 + this.coy), bottom = this.h * (0.5 - this.coy);
      ctx.save();
      ctx.globalAlpha = 0.25;
      sprAnchored(ctx, this.tex, this.w, this.h, this.cox, this.coy);
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.rect(-this.w, bottom - (bottom - top) * p, this.w * 2, (bottom - top) * p + 10); ctx.clip();
      sprAnchored(ctx, this.tex, this.w, this.h, this.cox, this.coy);
      ctx.restore();
      const sw = Math.max(this.w * 0.9, 110), sh = Math.max(this.h * 0.75, 90);
      spr(ctx, 'scaffold', -sw / 2, -sh * 0.95, sw, sh);
    } else if (this.rise < 1) {
      const hh = this.h * (0.5 + this.coy) + 10;
      ctx.save();
      ctx.beginPath(); ctx.rect(-this.w, -hh - 20, this.w * 2, hh + 20); ctx.clip();
      ctx.translate(0, hh * (1 - this.rise));
      sprAnchored(ctx, this.tex, this.w, this.h, this.cox, this.coy);
      ctx.restore();
    } else {
      sprAnchored(ctx, this.tex, this.w, this.h, this.cox, this.coy);
    }
    ctx.filter = 'none';
    // power glow for powered farms
    if (this.powerFor && this.state === 'ready' && this.power > 0 && !ghost) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.18 + 0.12 * Math.sin(G.t * 3);
      spr(ctx, 'halo_glow', -this.w * 0.6, -this.h * 0.9, this.w * 1.2, this.h);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  // status bars drawn above
  drawOver(ctx) {
    if (this.isDeco || this.rise < 1) return;
    const gy = this.gy + this.h * (0.5 + this.coy) + 26 + this.lift;
    let bars = [];
    if (this.state === 'build') bars.push([this.progress, '#ffc93c', this.builders.length ? null : 'hammer']);
    else {
      if (this.powerFor) bars.push([this.power, this.powerFor === 'rain' ? '#5ec8ff' : this.powerFor === 'sun' ? '#ffd23f' : '#c99bff', null]);
      if (this.workers.length && (this.type === 'Farm' || this.type === 'Shrine')) bars.push([this.gen, this.type === 'Shrine' ? '#9be7ff' : '#ffe36a', null]);
    }
    if (!bars.length) return;
    if (CAM.zoomN < 0.45) return;
    pushAt(ctx, this.x, gy);
    ctx.rotate(-((this.x / C) * TAU - CAM.angle()));
    const s = 1 / CAM.zoom; ctx.scale(s, s);
    bars.forEach((b, i) => {
      const y = -i * 11;
      ctx.fillStyle = 'rgba(20,30,60,.55)'; roundRect(ctx, -32, y - 4, 64, 8, 4); ctx.fill();
      ctx.fillStyle = b[1]; roundRect(ctx, -31, y - 3, 62 * clamp(b[0], 0, 1), 6, 3); ctx.fill();
    });
    if (this.state === 'build' && !this.builders.length) {
      ctx.font = '600 13px Fredoka, sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,30,60,.8)'; ctx.strokeText('Drop followers here to build', 0, -14);
      ctx.fillStyle = '#fff'; ctx.fillText('Drop followers here to build', 0, -14);
    }
    ctx.restore();
  }
}

const BUILD = {
  at(x, needSlots = false) {
    let best = null, bd = 1e9;
    for (const b of G.buildings) {
      if (b.isDeco || b.dead || b.rise < 1 || b.lift) continue;
      const d = Math.abs(dX(b.x, x));
      if (d < b.w * 0.5 + 20 && d < bd) { best = b; bd = d; }
    }
    return best;
  },
  // placement validity
  valid(t, x, ignore = null) {
    const tpl = D.templates[t];
    const w = +(tpl.widthHeightAsString || '128 128').split(/\s+/)[0];
    const deco = t.startsWith('Decoration');
    for (const b of G.buildings) {
      if (b === ignore || b.dead) continue;
      const lim = deco || b.isDeco ? (w + b.w) * 0.32 : (w + b.w) * 0.45;
      if (Math.abs(dX(b.x, x)) < lim) return false;
    }
    let mn = 1e9, mx = -1e9;
    for (let k = -2; k <= 2; k++) { const h = LAND.hAt(x + k * w / 5); mn = Math.min(mn, h); mx = Math.max(mx, h); }
    return mx - mn < (deco ? 70 : 95);
  },
  place(t, x, o = {}) {
    const b = new Building(t, x, o);
    G.buildings.push(b);
    if (!b.isDeco && b.def.modifiesLandscape !== '0') LAND.flatten(x, b.w * 0.4, 0.75);
    return b;
  },
};

// ---------- placement mode (store purchases + movement wonder) ----------
const PLACE = {
  active: null, // {t, x, b(existing for move), cost}
  start(t, cost, existing = null) {
    this.active = { t, x: existing ? existing.x : CAM.x, cost, b: existing, ghost: existing || new Building(t, CAM.x) };
    if (existing) { existing.lift = 60; }
    UI.placeBar(true, t, cost);
    if (!existing) HINT.show('TutorialPlaceBuilding');
  },
  move(x) { if (!this.active) return; this.active.x = wrapX(x); this.active.ghost.x = this.active.x; },
  ok() {
    const a = this.active; if (!a) return;
    if (!BUILD.valid(a.t, a.x, a.b)) { SFX.play('hit5', 0.6); UI.toast("Can't build there - find flatter, open ground"); return; }
    if (a.b) {
      a.b.x = a.x; a.b.lift = 0;
      LAND.flatten(a.x, a.b.w * 0.4, 0.75);
      for (const f of [...a.b.workers, ...a.b.builders]) { f.x = a.x; }
      STATS.add('moved', 1);
      SFX.at('rockDrop1', a.x);
    } else {
      if (PLAYER.gold < a.cost) { UI.toast(STR('TutorialNotEnoughGold')); SFX.play('hit5', 0.6); return; }
      PLAYER.gold -= a.cost;
      const b = BUILD.place(a.t, a.x);
      SFX.at(b.isDeco ? 'rockDrop1' : 'constructionMed', a.x, 0.8);
      for (let i = 0; i < 10; i++) G.fx.push(new Particle('smoke', a.x + rand(-b.w / 3, b.w / 3), b.gy + 10, { vy: 40, life: 1.2, size: rand(30, 60), alpha: 0.45, grow: 25 }));
      addXP(b.isDeco ? 1 : (+b.def.xpRewardForPlacingBuilding || 2), a.x, b.gy + b.h);
      STATS.add(b.isDeco ? 'decos' : 'placed', 1);
      GAME.onPlaced(b);
    }
    this.active = null; UI.placeBar(false);
  },
  cancel() {
    const a = this.active; if (!a) return;
    if (a.b) a.b.lift = 0;
    this.active = null; UI.placeBar(false);
  },
  draw(ctx) {
    const a = this.active; if (!a) return;
    const ok = BUILD.valid(a.t, a.x, a.b);
    a.ghost.x = a.x;
    a.ghost.draw(ctx, true);
    pushAt(ctx, a.x, LAND.hAt(a.x));
    ctx.fillStyle = ok ? 'rgba(90,230,120,.35)' : 'rgba(255,80,80,.4)';
    ctx.fillRect(-a.ghost.w / 2, -6, a.ghost.w, 10);
    ctx.restore();
  },
};
