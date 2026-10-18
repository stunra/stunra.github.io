'use strict';
// ---------- landscape ----------
const LAND = {
  h: new Float32Array(NV), m: new Float32Array(NV), wet: new Float32Array(NV),
  dirty: true,
  init(src) {
    for (let i = 0; i < NV; i++) { this.h[i] = src.height[i] * HS; this.m[i] = clamp(src.morality[i], -1, 1); }
  },
  hAt(x) {
    x = wrapX(x) / SEG; const i = Math.floor(x), f = x - i;
    return lerp(this.h[i % NV], this.h[(i + 1) % NV], f);
  },
  mAt(x) {
    x = wrapX(x) / SEG; const i = Math.floor(x), f = x - i;
    return lerp(this.m[i % NV], this.m[(i + 1) % NV], f);
  },
  slope(x) { return (this.hAt(x + 10) - this.hAt(x - 10)) / 20; },
  soil(x) { return clamp(Math.round((this.mAt(x) + 1) * 4), 0, 8); },
  // modify morality around x within radius by amount (towards +1 lush / -1 dry)
  addM(x, radius, amt) {
    const n = Math.ceil(radius / SEG);
    const c = Math.round(wrapX(x) / SEG);
    for (let k = -n; k <= n; k++) {
      const i = ((c + k) % NV + NV) % NV;
      const w = 1 - Math.abs(k * SEG) / (radius + SEG);
      if (w <= 0) continue;
      this.m[i] = clamp(this.m[i] + amt * w, -1, 1);
    }
  },
  addH(x, radius, amt) {
    const n = Math.ceil(radius / SEG);
    const c = Math.round(wrapX(x) / SEG);
    for (let k = -n; k <= n; k++) {
      const i = ((c + k) % NV + NV) % NV;
      const d = k * SEG / radius;
      const w = Math.exp(-d * d * 3);
      this.h[i] = clamp(this.h[i] + amt * w, MINH + 20, MAXH - 60);
    }
  },
  flatten(x, half, rate = 1) {
    const target = this.hAt(x);
    const n = Math.ceil(half / SEG);
    const c = Math.round(wrapX(x) / SEG);
    for (let k = -n; k <= n; k++) {
      const i = ((c + k) % NV + NV) % NV;
      const w = Math.abs(k) <= n - 1 ? 1 : 0.5;
      this.h[i] = lerp(this.h[i], target, w * rate);
    }
  },
};

// ---------- sky / background rendering ----------
const STARS = [];
for (let i = 0; i < 260; i++) STARS.push({ a: Math.random() * TAU, r: rand(1500, 4200), s: rand(0.6, 2.2), tw: rand(0, TAU) });

function drawSky(ctx) {
  const W = G.W, H = G.H;
  ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  // deep space
  ctx.fillStyle = '#071027';
  ctx.fillRect(0, 0, W, H);
  // planet centre in screen space
  const pc = CAM.toScreen(0, -R0);
  const z = CAM.zoom;
  // stars (slow parallax rotation)
  const a0 = -CAM.angle() * 0.25;
  ctx.fillStyle = '#fff';
  for (const s of STARS) {
    const a = s.a + a0, rr = s.r * z * 0.6 + 200;
    const x = pc.x + Math.sin(a) * rr, y = pc.y - Math.cos(a) * rr * 0.9 + (G.H / 2 - pc.y) * 0.5;
    if (x < -5 || y < -5 || x > W + 5 || y > H + 5) continue;
    ctx.globalAlpha = 0.45 + 0.4 * Math.sin(G.t * 1.5 + s.tw);
    ctx.fillRect(x, y, s.s, s.s);
  }
  ctx.globalAlpha = 1;
  // atmosphere: bright near the ground, fading to space
  const r1 = (R0 + 50) * z, r2 = (R0 + 1150) * z;
  const g = ctx.createRadialGradient(pc.x, pc.y, r1 * 0.9, pc.x, pc.y, r2);
  const day = SKY.tint();
  g.addColorStop(0, day[0]);
  g.addColorStop(0.32, day[1]);
  g.addColorStop(0.7, day[2]);
  g.addColorStop(1, 'rgba(7,16,39,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(pc.x, pc.y, r2, 0, TAU); ctx.fill();
}
const SKY = {
  tint() {
    // overall planet lushness shifts the sky from hot haze to fresh blue
    let s = 0; for (let i = 0; i < NV; i++) s += LAND.m[i]; s /= NV;
    const t = (s + 1) / 2;
    const mix = (a, b) => `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
    return [mix([255, 214, 150], [170, 226, 255]), mix([233, 160, 110], [96, 178, 238]), mix([88, 70, 120], [42, 86, 170])];
  },
};

// background rock silhouettes (behind the landscape)
const BGS = [];
function initBackgrounds(ents) {
  for (const e of ents) {
    if (!e.t.startsWith('EntityBackground')) continue;
    const code = e.t.replace('EntityBackground', '').toLowerCase(); // e.g. 5c
    const p = e.layer === 'backgroundMedium' ? 0.8 : e.layer === 'backgroundFar' ? 0.6 : 0.4;
    const size = e.layer === 'backgroundMedium' ? 512 : e.layer === 'backgroundFar' ? 460 : 400;
    BGS.push({ x: wrapX(e.x * p), y: e.y * 0.6, spr: 'backgroundscene' + code, size, p });
  }
  // fill the ring a little more evenly
  const extra = ['2a', '3b', '4c', '5a', '3a', '2b', '4a', '5b', '2c', '3c'];
  for (let i = 0; i < 10; i++) BGS.push({ x: i * 300 + 60, y: rand(20, 80), spr: 'backgroundscene' + extra[i], size: rand(380, 500), p: pick([0.4, 0.6, 0.8]) });
  BGS.sort((a, b) => a.p - b.p);
}
function drawBackgrounds(ctx) {
  const fade = clamp((CAM.zoomN - 0.3) / 0.45, 0, 1);
  if (fade <= 0) return;
  for (const b of BGS) {
    if (!CAM.visible(b.x, b.size)) continue;
    const h = LAND.hAt(b.x);
    pushAt(ctx, b.x, Math.min(h, 120) * 0.5 + b.y * 0.3 - 40);
    ctx.globalAlpha = (0.55 + b.p * 0.45) * fade;
    spr(ctx, b.spr, -b.size / 2, -b.size * 0.95, b.size, b.size);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// ---------- landscape rendering ----------
const TEX = ['landscape_desert', 'landscape_cracked', 'landscape_grass'];
function drawLandscape(ctx) {
  const vh = CAM.visHalf();
  const span = Math.min(NV, Math.ceil(vh / TAU * NV) + 3);
  const c = Math.round(CAM.x / SEG);
  const i0 = span >= NV / 2 ? 0 : c - span, i1 = span >= NV / 2 ? NV : c + span;
  const SUB = CAM.zoomN > 0.5 ? 2 : 1;
  // ---- surface path
  ctx.save();
  ctx.beginPath();
  const pts = [];
  for (let i = i0; i <= i1; i++) {
    for (let s = 0; s < SUB; s++) {
      if (i === i1 && s > 0) break;
      const x = (i + s / SUB) * SEG;
      const r = R0 + LAND.hAt(x);
      const th = x / C * TAU;
      pts.push([r * Math.sin(th), -r * Math.cos(th)]);
    }
  }
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
  const full = i1 - i0 >= NV;
  if (full) { ctx.closePath(); }
  else {
    const rIn = R0 - 260;
    const th1 = i1 * SEG / C * TAU, th0 = i0 * SEG / C * TAU;
    ctx.lineTo(rIn * Math.sin(th1), -rIn * Math.cos(th1));
    ctx.arc(0, 0, rIn, th1 - Math.PI / 2, th0 - Math.PI / 2, true);
    ctx.closePath();
  }
  // deep soil fill
  ctx.fillStyle = '#5b3a1e';
  ctx.fill();
  ctx.clip();
  // ---- textured strips (desert base, cracked, grass blended by morality)
  const tex = [SPR['desertsand3'], SPR['crackedsoil'], SPR['grass']];
  const half = SEG / SUB;
  const deep = CAM.zoomN > 0.5;
  for (let i = i0; i < i1; i++) {
    for (let s = 0; s < SUB; s++) {
      const x = (i + (s + 0.5) / SUB) * SEG;
      const xw = wrapX(x);
      const h = LAND.hAt(xw);
      const m = LAND.mAt(xw);
      const a1 = clamp(m + 1, 0, 1), a2 = clamp(m, 0, 1);
      const r = R0 + h;
      const w = half * r / R0 + 1.2;
      const u = (xw * 1.0) % 256;
      ctx.save();
      ctx.rotate(x / C * TAU);
      ctx.translate(0, -r);
      const top = -6;
      for (let L = 0; L < 3; L++) {
        const a = L === 0 ? 1 : L === 1 ? a1 : a2;
        if (a < 0.02) continue;
        const t = tex[L]; if (!t) continue;
        ctx.globalAlpha = a;
        const sw = Math.max(1, Math.min(half, 256 - u));
        ctx.drawImage(t.img, t.x + u, t.y, sw, 256, -w / 2, top, w, 300);
        if (deep) ctx.drawImage(t.img, t.x + u, t.y + 40, sw, 216, -w / 2 * 0.85, top + 299, w * 0.85, 300);
      }
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // ---- planet core
  const core = SPR['core'];
  if (core && CAM.zoomN < 0.95) {
    const cs = (R0 - 30) * 2;
    ctx.globalAlpha = clamp(1.2 - CAM.zoomN, 0, 1);
    ctx.drawImage(core.img, core.x, core.y, core.w, core.h, -cs / 2, -cs / 2, cs, cs);
    ctx.globalAlpha = 1;
  }
}

// grass fringe on lush ground (drawn in front of the soil)
function drawFoliage(ctx) {
  const vh = CAM.visHalf();
  const span = Math.min(NV, Math.ceil(vh / TAU * NV) + 3);
  const c = Math.round(CAM.x / SEG);
  const i0 = span >= NV / 2 ? 0 : c - span, i1 = span >= NV / 2 ? NV : c + span;
  const f1 = SPR['foliage_middle'], f2 = SPR['foliage_jungle'];
  if (!f1) return;
  for (let i = i0; i < i1; i++) {
    const x = (i + 0.5) * SEG, xw = wrapX(x);
    const m = LAND.mAt(xw);
    if (m < 0.05) continue;
    const h = LAND.hAt(xw);
    const sl = Math.atan(LAND.slope(xw));
    const fol = m > 0.6 ? f2 : f1;
    const len = clamp(m, 0, 1) * 26 + 6;
    ctx.save();
    ctx.rotate(x / C * TAU);
    ctx.translate(0, -(R0 + h));
    ctx.rotate(sl);
    ctx.globalAlpha = clamp(m * 2.5, 0, 1);
    const u = (xw * 3) % (fol.w - 60);
    ctx.drawImage(fol.img, fol.x + u, fol.y, 60, fol.h, -SEG * 0.75, -len + 4, SEG * 1.5, len + 2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ---------- generic world entities ----------
class Ent {
  constructor(t, x, y) {
    this.t = t; this.x = wrapX(x); this.tpl = D.templates[t] || { c: {} };
    const wh = (this.tpl.widthHeightAsString || '64 64').split(/\s+/).map(Number);
    this.w = wh[0]; this.h = wh[1];
    const co = (this.tpl.centerOffsetAsString || '0 0').split(/\s+/).map(Number);
    this.cox = co[0] || 0; this.coy = co[1] || 0;
    const r = this.tpl.c.EntityComponentRender;
    this.tex = r && r.textureName ? r.textureName.toLowerCase() : null;
    this.layer = this.tpl.layerByName || 'default';
    this.snap = !!this.tpl.c.EntityComponentSnapToLandscape;
    this.y = y; this.scale = 1; this.alpha = 1; this.dead = false;
  }
  get gy() { return this.snap ? LAND.hAt(this.x) : this.y; }
  draw(ctx) {
    if (!this.tex) return;
    pushAt(ctx, this.x, this.gy);
    ctx.globalAlpha = this.alpha;
    ctx.scale(this.scale, this.scale);
    sprAnchored(ctx, this.tex, this.w, this.h, this.cox, this.coy);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  hit(wx, wy, pad = 0) {
    const gy = this.gy;
    const bottom = gy - this.h * (0.5 - this.coy) * this.scale - pad, top = gy + this.h * (0.5 + this.coy) * this.scale + pad;
    const half = (this.w * this.scale) / 2 + pad;
    const d = dX(this.x, wx) * (R0) / (R0 + gy);
    return wy > bottom && wy < top && Math.abs(d - this.cox * this.w) < half;
  }
  update() {}
}

// ---------- flora ----------
class Flora extends Ent {
  constructor(t, x, grown = 1) {
    super(t, x, 0);
    const tc = this.tpl.c.EntityComponentTree || {};
    this.minS = +tc.minimumSoilType || 0; this.maxS = +(tc.maximumSoilType || 8); this.perfS = +(tc.perfectSoilType || 4);
    this.growT = (+tc.fullGrowthTime || 60); this.perfT = (+tc.fullGrowthTimeOnPerfectSoil || 15);
    this.dieT = (+tc.fullDeathTime || 60);
    this.kind = t.startsWith('EntityTree') ? 'tree' : (this.layer === 'flowers' ? 'flower' : 'plant');
    this.grow = grown; this.dying = 0; this.fire = 0; this.burnt = 0;
    this.sway = Math.random() * TAU;
    this.life = this.kind === 'flower' ? rand(60, 140) : Infinity;
    this.base = this.kind === 'tree' ? rand(0.8, 1.05) : rand(0.75, 1.0);
  }
  update(dt) {
    const s = LAND.soil(this.x);
    const ok = s >= this.minS && s <= this.maxS;
    if (this.fire > 0) {
      this.fire -= dt;
      this.burnt = Math.min(1, this.burnt + dt / 6);
      if (Math.random() < dt * 3) G.fx.push(new Particle('smoke', this.x + rand(-20, 20), this.gy + this.h * this.grow * rand(0.2, 0.7), { vy: 40, life: 1.6, size: rand(30, 50), alpha: 0.5 }));
      if (Math.random() < dt * 8) G.fx.push(new Particle('sunflame', this.x + rand(-25, 25), this.gy + this.h * this.grow * rand(0.1, 0.6), { vy: 60, life: 0.6, size: rand(24, 44), add: true }));
      // fire spreads
      if (Math.random() < dt * 0.3) igniteNear(this.x, 90, this);
      if (this.fire <= 0 && this.burnt > 0.9) this.dying = Math.max(this.dying, 0.01);
    }
    if (ok && !this.dying) {
      if (this.grow < 1) {
        const t = s === this.perfS ? this.perfT : this.growT;
        this.grow = Math.min(1, this.grow + dt / (t * 0.25));
      }
    } else {
      this.dying += dt / (this.dieT * 0.25);
    }
    if (this.kind === 'flower') { this.life -= dt; if (this.life < 0) this.dying += dt / 4; }
    if (this.dying >= 1) this.dead = true;
  }
  draw(ctx) {
    const g = this.grow * (1 - this.dying);
    if (g <= 0.02) return;
    pushAt(ctx, this.x, LAND.hAt(this.x) - 2);
    ctx.rotate(Math.sin(G.t * 1.3 + this.sway) * 0.025 * (this.kind === 'tree' ? 0.6 : 1.5));
    const sc = g * this.base;
    ctx.scale(sc, sc);
    if (this.burnt > 0) ctx.filter = `brightness(${1 - this.burnt * 0.75}) saturate(${1 - this.burnt})`;
    ctx.globalAlpha = clamp(1.5 - this.dying * 1.5, 0, 1);
    sprAnchored(ctx, this.tex, this.w, this.h, this.cox, this.coy);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
const FLORA = {
  timer: { tree: 0, plant: 0, flower: 0 },
  nearest(x, kind) {
    let best = 1e9;
    for (const f of G.flora) if (f.kind === kind) { const d = Math.abs(dX(f.x, x)); if (d < best) best = d; }
    return best;
  },
  blocked(x) {
    for (const b of G.buildings) if (Math.abs(dX(b.x, x)) < b.w * 0.45) return true;
    return false;
  },
  spawn(kind, x, from = null) {
    const s = LAND.soil(x);
    const table = kind === 'tree' ? D.cfg.FloraTrees : kind === 'plant' ? D.cfg.FloraPlants : D.cfg.FloraFlowers;
    const list = table[String(s)];
    if (!list || !list.length) return null;
    const dist = { tree: 230, plant: 34, flower: 22 }[kind];
    if (this.nearest(x, kind) < dist) return null;
    if (kind === 'tree' && this.blocked(x)) return null;
    let t = pick(list);
    if (!D.templates[t] || !D.templates[t].c.EntityComponentRender || !SPR[(D.templates[t].c.EntityComponentRender.textureName || '').toLowerCase()]) {
      // the small "EntityFlower*" sprites aren't in the atlases, use the flowering plants instead
      t = pick(s >= 5 ? ['EntityPlantGrassyPoppy1', 'EntityPlantGrassyPoppy2', 'EntityPlantGrassyPurpleIris', 'EntityPlantGrassySunFlower1', 'EntityPlantGrassySunFlower2', 'EntityPlantGrassyFoxGlove1', 'EntityPlantGrassyFoxGlove2', 'EntityPlantGrassyBlueFlowerClump', 'EntityPlantLushPurpleClump'] : ['EntityPlantDesertWhiteFlowerClump', 'EntityPlantGrassyBlueFlowerClump']);
    }
    const f = new Flora(t, x, 0.02);
    if (kind === 'flower') f.kind = 'flower', f.life = rand(70, 160);
    G.flora.push(f);
    const key = kind === 'tree' ? 'trees' : kind === 'plant' ? 'plants' : 'flowers';
    STATS.add(key, 1);
    STATS.flora[key] = (STATS.flora[key] || 0) + 1;
    if (STATS.flora[key] % 5 === 0) addXP(kind === 'tree' ? 3 : 2, x, LAND.hAt(x) + 60);
    if (kind === 'flower' && Math.random() < 0.35) G.fx.push(new Butterfly(x, LAND.hAt(x) + 40));
    return f;
  },
  update(dt) {
    // natural growth on lush ground
    this.timer.plant -= dt; this.timer.tree -= dt;
    if (this.timer.plant < 0) {
      this.timer.plant = rand(0.6, 1.6);
      const x = rand(0, C);
      if (LAND.mAt(x) > 0.15 && G.flora.length < 260) this.spawn(Math.random() < 0.8 ? 'plant' : 'flower', x);
    }
    if (this.timer.tree < 0) {
      this.timer.tree = rand(3, 7);
      const x = rand(0, C);
      if (G.flora.filter(f => f.kind === 'tree').length < 22) this.spawn('tree', x);
    }
    for (const f of G.flora) f.update(dt);
    G.flora = G.flora.filter(f => !f.dead);
  },
};

// ---------- particles / fx ----------
class Particle {
  constructor(sprName, x, y, o = {}) {
    this.s = sprName; this.x = x; this.y = y;
    this.vx = o.vx || 0; this.vy = o.vy || 0; this.g = o.g || 0;
    this.life = this.max = o.life || 1; this.size = o.size || 32; this.grow = o.grow || 0;
    this.rot = o.rot || 0; this.vr = o.vr || 0; this.alpha = o.alpha == null ? 1 : o.alpha;
    this.add = !!o.add; this.fade = o.fade == null ? true : o.fade; this.aspect = o.aspect || 1;
    this.radial = o.radial || false; this.screen = o.screen || false;
  }
  update(dt) {
    this.life -= dt;
    this.vy -= this.g * dt;
    this.x = wrapX(this.x + this.vx * dt * R0 / (R0 + Math.max(0, this.y)));
    this.y += this.vy * dt; this.rot += this.vr * dt; this.size += this.grow * dt;
    return this.life > 0;
  }
  draw(ctx) {
    const t = this.life / this.max;
    pushAt(ctx, this.x, this.y);
    ctx.rotate(this.rot);
    ctx.globalAlpha = this.alpha * (this.fade ? Math.min(1, t * 2) : 1);
    if (this.add) ctx.globalCompositeOperation = 'lighter';
    spr(ctx, this.s, -this.size / 2, -this.size * this.aspect / 2, this.size, this.size * this.aspect);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
class Butterfly {
  constructor(x, y) {
    this.x = x; this.y = y; this.home = x; this.vx = rand(-30, 30); this.vy = 0; this.t = Math.random() * 3; this.life = rand(25, 50);
    this.hue = pick([0, 40, 90, 180, 280, 320]);
  }
  update(dt) {
    this.life -= dt; this.t += dt;
    if (Math.random() < dt * 0.6) this.vx = rand(-45, 45);
    const gh = LAND.hAt(this.x);
    if (this.y < gh + 30 || Math.random() < dt * 2) this.vy = rand(30, 90);
    this.vy -= 80 * dt;
    if (this.y > gh + 220) this.vy = -40;
    if (Math.abs(dX(this.home, this.x)) > 150) this.vx = Math.sign(dX(this.x, this.home)) * 40;
    this.x = wrapX(this.x + this.vx * dt); this.y += this.vy * dt;
    return this.life > 0;
  }
  draw(ctx) {
    pushAt(ctx, this.x, this.y);
    ctx.scale(this.vx < 0 ? -1 : 1, 1);
    ctx.filter = `hue-rotate(${this.hue}deg)`;
    ctx.globalAlpha = Math.min(1, this.life);
    spr(ctx, Math.sin(this.t * 18) > 0 ? 'butterflyup' : 'butterflydown', -10, -10, 20, 20);
    ctx.filter = 'none'; ctx.globalAlpha = 1;
    ctx.restore();
  }
}
// floating text (gold/xp/mana popups)
class FloatText {
  constructor(text, x, y, color = '#fff', icon = null) { this.text = text; this.x = x; this.y = y; this.life = 1.6; this.color = color; this.icon = icon; }
  update(dt) { this.life -= dt; this.y += 45 * dt; return this.life > 0; }
  draw(ctx) {
    pushAt(ctx, this.x, this.y);
    const s = 1 / Math.max(0.6, CAM.zoom);
    ctx.scale(s, s);
    ctx.globalAlpha = Math.min(1, this.life * 1.5);
    ctx.font = '700 22px Fredoka, "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(20,30,60,.85)';
    let off = 0;
    if (this.icon) { spr(ctx, this.icon, -ctx.measureText(this.text).width / 2 - 30, -22, 26, 26); off = 12; }
    ctx.strokeText(this.text, off, 0); ctx.fillStyle = this.color; ctx.fillText(this.text, off, 0);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// ---------- breakables, gold, graves ----------
class Breakable extends Ent {
  constructor(t, x) {
    super(t, x, 0);
    this.hp = 100; this.shake = 0; this.kind = t.includes('Chest') ? 'chest' : 'rock';
    this.value = t.includes('Large') ? 120 : t.includes('Medium') ? 70 : 40;
  }
  damage(n) {
    this.hp -= n; this.shake = 0.5;
    SFX.at(this.kind === 'chest' ? 'hit10' : 'rockDrop1', this.x, 0.8);
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      const gy = this.gy;
      if (this.kind === 'chest') {
        SFX.at('poof5', this.x);
        for (let i = 0; i < 8; i++) G.fx.push(new Particle(pick(['chestwood01', 'chestwood02', 'chestlid']), this.x, gy + 40, { vx: rand(-120, 120), vy: rand(80, 260), g: 400, life: 1.4, size: rand(24, 50), vr: rand(-6, 6) }));
        for (let i = 0; i < 3; i++) spawnGold(this.x + rand(-60, 60), Math.round(this.value / 3), 'chest');
        STATS.add('chests', 1);
      } else {
        SFX.at('rockDrop1', this.x);
        for (let i = 0; i < 12; i++) G.fx.push(new Particle(pick(['rock01', 'rock02', 'rock03', 'rock04', 'rockpiece']), this.x, gy + 30, { vx: rand(-150, 150), vy: rand(80, 280), g: 450, life: 1.4, size: rand(16, 34), vr: rand(-6, 6) }));
        spawnGold(this.x, Math.round(this.value / 2), 'chest');
      }
      addXP(15, this.x, gy + 80);
    }
  }
  update(dt) { this.shake = Math.max(0, this.shake - dt); }
  draw(ctx) {
    pushAt(ctx, this.x, this.gy);
    if (this.shake) ctx.rotate(Math.sin(G.t * 60) * 0.06 * this.shake);
    sprAnchored(ctx, this.tex, this.w, this.h, this.cox, this.coy);
    if (this.kind === 'chest') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(G.t * 3);
      spr(ctx, 'sparkle01', -10 + Math.sin(G.t) * 30, -this.h * 0.7, 20, 20);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}

class GoldPile extends Ent {
  constructor(x, value, src) {
    super('EntityGoldPile', x, 0);
    this.value = value; this.src = src; this.age = 0; this.spoil = src === 'chest' ? 1e9 : 260; this.pop = 0;
    this.size = clamp(0.35 + value / 70, 0.4, 0.9);
  }
  get spoiled() { return this.age > this.spoil; }
  update(dt) { this.age += dt; this.pop = Math.min(1, this.pop + dt * 3); }
  hit(wx, wy) {
    const gy = this.gy;
    return Math.abs(dX(this.x, wx)) < 55 * this.size + 18 && wy > gy - 15 && wy < gy + 100 * this.size + 20;
  }
  draw(ctx) {
    pushAt(ctx, this.x, this.gy);
    const s = this.size * (this.pop < 1 ? 1 + Math.sin(this.pop * Math.PI) * 0.3 : 1);
    ctx.scale(s, s);
    sprAnchored(ctx, this.spoiled ? 'goldpile_spoiled' : 'goldpile', 128, 128, 0, 0.4);
    if (!this.spoiled) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(G.t * 4 + this.x);
      spr(ctx, 'sparkle01', -40 + (this.x % 50), -90, 26, 26);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }
  collect() {
    this.dead = true;
    if (this.spoiled) { SFX.at('poof1', this.x); G.fx.push(new FloatText(STR('GoldSpoiled') !== 'GoldSpoiled' ? STR('GoldSpoiled') : 'Rusted!', this.x, this.gy + 60, '#c9a27a')); return; }
    SFX.play('pop', 0.9); SFX.play(SND.attract, 0.25, 1.4);
    for (let i = 0; i < 8; i++) G.fx.push(new Particle('coin', this.x, this.gy + 30, { vx: rand(-90, 90), vy: rand(150, 320), g: 520, life: 0.9, size: 18, vr: rand(-8, 8) }));
    PLAYER.gold += this.value;
    STATS.add('goldPicked', this.value); STATS.add('goldPiles', 1);
    G.fx.push(new FloatText('+' + this.value, this.x, this.gy + 90, '#ffd84a', 'coin'));
    addXP(3, this.x, this.gy + 130);
    UI.bump('gold');
  }
}
function spawnGold(x, value, src) {
  const g = new GoldPile(x, value, src);
  G.golds.push(g);
  return g;
}

class Grave extends Ent {
  constructor(f) {
    super('EntityFollowerGrave', f.x, 0);
    this.f = f; this.rise = 0; this.age = 0;
  }
  update(dt) { this.rise = Math.min(1, this.rise + dt * 1.5); this.age += dt; }
  draw(ctx) {
    pushAt(ctx, this.x, this.gy - (1 - this.rise) * 60);
    sprAnchored(ctx, 'gravestone', 46, 76, 0, 0.42);
    ctx.restore();
  }
  hit(wx, wy) { return Math.abs(dX(this.x, wx)) < 40 && wy > this.gy - 10 && wy < this.gy + 90; }
}

// lightweight static decorations from the level file (rocks)
class Static extends Ent {
  constructor(t, x, tex, w, h) { super(t, x, 0); this.snap = true; if (tex) this.tex = tex; if (w) { this.w = w; this.h = h; } this.coy = 0.25; }
}

function igniteNear(x, radius, src) {
  for (const f of G.flora) if (f !== src && f.kind === 'tree' && Math.abs(dX(f.x, x)) < radius && f.fire <= 0 && f.burnt < 0.9 && Math.random() < 0.4) f.fire = rand(5, 9);
  for (const fo of G.followers) if (Math.abs(dX(fo.x, x)) < radius * 0.6 && Math.random() < 0.25 && fo.state !== 'dead') fo.setFire();
  for (const b of G.buildings) if (Math.abs(dX(b.x, x)) < b.w / 2 + radius * 0.4 && Math.random() < 0.15) b.setFire();
}
function extinguish(x, radius) {
  for (const f of G.flora) if (f.fire > 0 && Math.abs(dX(f.x, x)) < radius) { f.fire = 0; f.dying = f.burnt > 0.85 ? Math.max(0.01, f.dying) : 0; }
  for (const fo of G.followers) if (fo.fire > 0 && Math.abs(dX(fo.x, x)) < radius) fo.fire = 0;
  for (const b of G.buildings) if (b.fire > 0 && Math.abs(dX(b.x, x)) < radius + b.w / 2) b.fire = 0;
}
