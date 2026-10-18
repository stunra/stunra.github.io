'use strict';
// ---------- constants & helpers ----------
const D = window.GF_DATA;
const TAU = Math.PI * 2;
const C = 3000, NV = 150, SEG = C / NV, HS = 300, R0 = C / TAU;
const ANIM_FPS = 30;
const TS = 0.1;            // compress the original game's long real-time timers
const MAXH = 500, MINH = 0;

const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const wrapX = x => ((x % C) + C) % C;
const dX = (a, b) => { let d = wrapX(b - a); if (d > C / 2) d -= C; return d; }; // shortest signed b-a
const STR = k => (D.strings[k] != null ? D.strings[k] : k);
const L1 = D.cfg.Levels['1'];
const now = () => performance.now() / 1000;

const G = {
  t: 0, dt: 0, W: 0, H: 0, dpr: 1,
  ents: [], followers: [], buildings: [], flora: [], golds: [], clouds: [], parts: [], graves: [], fx: [],
  stats: {}, paused: false,
};

// ---------- sprites ----------
const SPR = {};
const ATL = {};
function loadAssets(onProgress) {
  const names = Object.keys(D.atlases);
  let done = 0;
  return Promise.all(names.map(n => new Promise(res => {
    const im = new Image();
    im.onload = () => { done++; onProgress && onProgress(done / names.length); res(); };
    im.onerror = () => { console.warn('atlas failed', n); done++; res(); };
    im.src = 'assets/' + n + '.webp';
    ATL[n] = im;
    const sp = D.atlases[n].sprites;
    for (const k in sp) {
      if (SPR[k] && n === 'atlas_backgrounds_256') continue;
      if (!SPR[k]) SPR[k] = { img: im, x: sp[k][0], y: sp[k][1], w: sp[k][2], h: sp[k][3] };
    }
  })));
}
function spr(ctx, name, x, y, w, h) {
  const s = SPR[name];
  if (!s) return false;
  ctx.drawImage(s.img, s.x, s.y, s.w, s.h, x, y, w, h);
  return true;
}
// draw a sprite centered horizontally with its anchor at (0,0) in local "up is -y" space
function sprAnchored(ctx, name, w, h, cx = 0, cy = 0.45) {
  // centerOffset: sprite centre sits cy*h above the anchor point
  return spr(ctx, name, -w / 2 + cx * w, -h / 2 - cy * h, w, h);
}

// ---------- audio ----------
const SFX = {
  ctx: null, bufs: {}, loading: {}, master: null, music: null, on: true,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },
  load(n) {
    if (!this.ctx) return Promise.resolve(null);
    if (this.bufs[n]) return Promise.resolve(this.bufs[n]);
    if (!this.loading[n]) this.loading[n] = fetch('sfx/' + n + '.mp3').then(r => r.arrayBuffer())
      .then(b => new Promise((res, rej) => this.ctx.decodeAudioData(b, res, rej)))
      .then(buf => (this.bufs[n] = buf)).catch(() => null);
    return this.loading[n];
  },
  play(n, vol = 1, rate = 1, loop = false) {
    if (!this.ctx || !this.on) return null;
    if (Array.isArray(n)) n = pick(n);
    const h = { src: null, gain: null, stopped: false, stop() { this.stopped = true; if (this.src) try { this.src.stop(); } catch (e) {} } };
    this.load(n).then(buf => {
      if (!buf || h.stopped) return;
      const s = this.ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate; s.loop = loop;
      const g = this.ctx.createGain(); g.gain.value = vol; s.connect(g); g.connect(this.master); s.start();
      h.src = s; h.gain = g;
    });
    return h;
  },
  // positional-ish: attenuate by distance from camera
  at(n, x, vol = 1, rate = 1) {
    const d = Math.abs(dX(CAM.x, x));
    const z = clamp(1 - d / (900 / Math.max(0.35, CAM.zoomN)), 0, 1);
    if (z > 0.03) return this.play(n, vol * (0.3 + 0.7 * z) * (CAM.zoomN > 0.4 ? 1 : 0.6), rate);
    return null;
  },
  setOn(v) { this.on = v; if (this.master) this.master.gain.value = v ? 0.8 : 0; },
};
const SND = {
  scared: ['scared2', 'scared27', 'scared28', 'scared29', 'scared4', 'scared5', 'scared6', 'scared8'],
  happy: ['impressHappy13', 'impressHappy3', 'impressHappy6', 'impressHappy7', 'impressHappy8', 'impressHappy9'],
  celebrate: ['celebrate1', 'celebrate14', 'celebrate2', 'celebrate3', 'celebrate5', 'celebrate6'],
  hit: ['hit1', 'hit10', 'hit11', 'hit2', 'hit5', 'hit6'],
  death: ['deathRattle1', 'deathRattle3', 'deathRattle5', 'deathRattle7', 'deathRattle9'],
  attract: ['attract10', 'attract13', 'attract15', 'attract17', 'attract18', 'attract25', 'attract4', 'attract6'],
  sigh: ['sigh1', 'sigh3', 'sigh5'],
  camp: ['camp02', 'camp04', 'camp09', 'camp11', 'camp12', 'camp14', 'camp17'],
  pub: ['pub02', 'pub06', 'pub10', 'pub12', 'pub21', 'pub22', 'pub23', 'pub24', 'pub36', 'pub40'],
  rake: ['rake1', 'rake2', 'rake3'],
  firework: ['firework1', 'firework2', 'firework3', 'firework4'],
  lightning: ['lightningHit1', 'lightningHit2'],
  poof: ['poof1', 'poof5'],
};

// ---------- camera ----------
const CAM = {
  x: 1005, focusH: 150, zoom: 1, zoomN: 1, // zoomN: 1 = default close view, 0 = whole planet
  tx: null, vx: 0, follow: null,
  minZ() { return Math.min(G.W, G.H) / ((R0 + 800) * 2.15); },
  maxZ() { return G.H / 260; },
  defZ() { return Math.min(G.H / 700, G.W / 520); },
  update(dt) {
    if (this.tx != null) {
      const d = dX(this.x, this.tx);
      this.x = wrapX(this.x + d * Math.min(1, dt * 4));
      if (Math.abs(d) < 2) this.tx = null;
    } else if (Math.abs(this.vx) > 1) {
      this.x = wrapX(this.x + this.vx * dt);
      this.vx *= Math.pow(0.04, dt);
    }
    if (this.tz != null) {
      this.zoom = lerp(this.zoom, this.tz, Math.min(1, dt * 5));
      if (Math.abs(this.zoom - this.tz) < 0.002) this.tz = null;
    }
    this.zoom = clamp(this.zoom, this.minZ(), this.maxZ());
    const zmin = this.minZ(), zdef = this.defZ();
    this.zoomN = clamp((this.zoom - zmin) / (zdef - zmin), 0, 1.5);
    // when zoomed out, slide the focus towards the planet's centre so the whole globe fits
    const t = clamp(this.zoomN, 0, 1);
    const ease = t * t * (3 - 2 * t);
    this.focusR = lerp(0, R0 + 265 - (this.zoomN > 1 ? (this.zoomN - 1) * 90 : 0), ease);
  },
  angle() { return (this.x / C) * TAU; },
  apply(ctx) {
    ctx.setTransform(this.zoom * G.dpr, 0, 0, this.zoom * G.dpr, G.W / 2 * G.dpr, (G.H / 2 + this.zoom * this.focusR) * G.dpr);
    ctx.rotate(-this.angle());
  },
  // screen -> world {x, y(height above R0), r}
  toWorld(sx, sy) {
    const px = (sx - G.W / 2) / this.zoom, py = (sy - G.H / 2) / this.zoom - this.focusR;
    const a = this.angle();
    const ca = Math.cos(a), sa = Math.sin(a);
    const qx = px * ca - py * sa, qy = px * sa + py * ca;
    const r = Math.hypot(qx, qy);
    const th = Math.atan2(qx, -qy);
    return { x: wrapX(th / TAU * C), y: r - R0, r };
  },
  // world -> screen
  toScreen(x, y) {
    const th = (x / C) * TAU - this.angle();
    const r = R0 + y;
    return { x: G.W / 2 + this.zoom * r * Math.sin(th), y: G.H / 2 + this.zoom * (-r * Math.cos(th) + this.focusR) };
  },
  // half visible angle (radians, in world)
  visHalf() {
    if (this.focusR < R0 * 0.6) return Math.PI;
    const span = Math.hypot(G.W, G.H) / 2 / this.zoom;
    return Math.min(Math.PI, span / (R0 + 60) + 0.15);
  },
  visible(x, pad = 0) {
    const h = this.visHalf();
    if (h >= Math.PI) return true;
    return Math.abs(dX(this.x, x)) / C * TAU < h + pad / (R0 + 100);
  },
};

// local transform for an entity at world (x, y)
function pushAt(ctx, x, y, rot = 0) {
  ctx.save();
  ctx.rotate((x / C) * TAU + rot);
  ctx.translate(0, -(R0 + y));
}
