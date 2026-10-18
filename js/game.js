'use strict';
// ---------- player & stats ----------
const PLAYER = {
  gold: 500, mana: 10, maxMana: 10, awe: 10, xp: 0, level: 1,
  regen: 0,
  has(key) { const u = D.cfg.LevelUnlocks[key]; return !u || this.level >= (+u.UnlockLevel || 1); },
  xpNeeded() { const l = D.cfg.Levels[String(this.level)]; return l && l.XPToLevelUp ? +l.XPToLevelUp : 99999; },
};
const STATS = {
  v: {}, flora: {},
  add(k, n) { this.v[k] = (this.v[k] || 0) + n; },
  get(k) { return this.v[k] || 0; },
};
function addXP(n, x, y) {
  if (!n) return;
  PLAYER.xp += n;
  if (x != null) G.fx.push(new FloatText('+' + n + ' XP', x, y, '#b9f27c'));
  while (PLAYER.xp >= PLAYER.xpNeeded() && PLAYER.level < 50) {
    PLAYER.xp -= PLAYER.xpNeeded();
    PLAYER.level++;
    GAME.onLevelUp(PLAYER.level);
  }
  UI.bump('xp');
}

// ---------- hints (tutorial cards) ----------
const HINT = {
  seen: {}, cur: null, queue: [],
  show(key, force = false, text = null) {
    if (this.seen[key] && !force) return;
    this.seen[key] = 1;
    const t = text || STR(key);
    if (this.cur && this.cur.key === key) return;
    this.cur = { key, text: t };
    UI.hint(t);
  },
  clear(key) { if (!key || (this.cur && this.cur.key === key)) { this.cur = null; UI.hint(null); } },
};

// ---------- objectives ----------
const OBJ = {
  list: [
    { k: 'FindShrine', lvl: 1, done: () => SHRINE() && SHRINE().rise >= 1 },
    { k: 'ConvertEve', lvl: 2, done: () => believers() >= 2 },
    { k: 'GoGreen', lvl: 2, pre: 'ConvertEve', rel: 'plants', n: 5, nameKey: 'ObjectiveNameGoGreen' },
    { k: 'BuildBuilding', lvl: 3, done: () => STATS.get('built') >= 1 },
    { k: 'GoldStacksA', lvl: 3, rel: 'goldPiles', n: 1 },
    { k: 'GiveMeSunshine', lvl: 4, rel: 'flowers', n: 15 },
    { k: 'Build2Farms', lvl: 4, done: () => G.buildings.filter(b => b.type === 'Farm' && b.state === 'ready').length >= 2, num: 2 },
    { k: 'Build1Refreshment', lvl: 5, done: () => G.buildings.filter(b => b.type === 'Refreshment' && b.state === 'ready').length >= 1, num: 1 },
    { k: 'HitManaCap', lvl: 2, trigger: () => PLAYER.mana === 0, done: () => PLAYER.mana >= PLAYER.maxMana },
    { k: 'BreakFirstChest', lvl: 6, rel: 'chests', n: 1 },
    { k: 'FirstCritter', lvl: 6, done: () => OBJ.critterSpawned && !G.followers.some(f => f.skel && f.state !== 'gone') },
    { k: 'FlowerPower', lvl: 6, rel: 'flowers', n: 25 },
    { k: 'Gold100', lvl: 6, rel: 'goldPicked', n: 50, nameText: 'Pocket Money', descText: 'Collect 50 Gold from Gold stacks.' },
    { k: 'UseTerrainWonder1', lvl: 7, rel: 'used_terrain1', n: 3, nameText: 'Shape the World', descText: 'Use Terraform 3 times. Hold just below the ground, then flick up or down.' },
    { k: 'RockMyWorld', lvl: 7, done: () => G.buildings.filter(b => b.isDeco).length >= 3, num: 3 },
    { k: 'MoveBuilding', lvl: 8, rel: 'moved', n: 1 },
    { k: 'BuildBuildingsA', lvl: 9, done: () => G.buildings.filter(b => !b.isDeco && b.state === 'ready').length >= 7, num: 7 },
    { k: 'Build1Tent', lvl: 10, done: () => G.buildings.some(b => /Tent/.test(b.t) && b.state === 'ready'), nameKey: 'ObjectiveNameBuildCamp', descKey: 'ObjectiveBuildTent' },
    { k: 'FollowersA', lvl: 11, done: () => believers() >= 9, num: 9 },
    { k: 'DecorationsA', lvl: 11, done: () => G.buildings.filter(b => b.isDeco).length >= 12, num: 12 },
    { k: 'FollowersB', lvl: 19, done: () => believers() >= 15, num: 15 },
  ],
  state: {}, // k -> {active, done, base}
  critterSpawned: false,
  def(k) { return D.cfg.ObjectiveDefinitions[k] || {}; },
  title(o) { return o.nameText || STR(o.nameKey || 'ObjectiveName' + o.k); },
  desc(o) {
    let s = o.descText || STR(o.descKey || 'Objective' + o.k);
    return s.replace(/\[NUMBER\]/g, o.num || o.n || '').replace(/\[TARGET\]/g, o.num || o.n || '');
  },
  progress(o) {
    const st = this.state[o.k];
    if (o.rel && st) return [Math.min(o.n, STATS.get(o.rel) - st.base), o.n];
    return null;
  },
  update() {
    for (const o of this.list) {
      let st = this.state[o.k];
      if (!st) {
        if (PLAYER.level < o.lvl) continue;
        if (o.pre && !(this.state[o.pre] && this.state[o.pre].done)) continue;
        if (o.trigger && !o.trigger()) continue;
        st = this.state[o.k] = { active: true, done: false, base: o.rel ? STATS.get(o.rel) : 0 };
        if (o.k !== 'FindShrine') { UI.toast('New goal: ' + this.title(o), 'icon_objective'); }
        UI.goalsBadge();
      }
      if (st.done) continue;
      let ok = false;
      if (o.done) ok = o.done();
      else if (o.rel) ok = STATS.get(o.rel) - st.base >= o.n;
      if (ok) this.complete(o);
    }
  },
  complete(o) {
    const st = this.state[o.k]; st.done = true; st.active = false;
    const d = this.def(o.k);
    const xp = +d.rewardXP || 15, gold = +d.rewardGold || 0;
    SFX.play('motif20shortened', 0.7);
    UI.reward(this.title(o), STR('Objective' + o.k + 'Complete').replace(/\[[A-Z]+\]/g, '') , xp, gold);
    if (gold) PLAYER.gold += gold;
    setTimeout(() => addXP(xp, null, null), 300);
    UI.goalsBadge();
  },
  active() { return this.list.filter(o => this.state[o.k] && this.state[o.k].active); },
  completed() { return this.list.filter(o => this.state[o.k] && this.state[o.k].done); },
};
const believers = () => G.followers.filter(f => f.believer && !f.skel && f.state !== 'gone').length;
const SHRINE = () => G.buildings.find(b => b.type === 'Shrine');

// ---------- game flow ----------
const GAME = {
  tut: 0, arriveT: 60, critterT: 200,
  newGame(fromSave = false) {
    G.ents = []; G.followers = []; G.buildings = []; G.flora = []; G.golds = []; G.clouds = []; G.fx = []; G.graves = [];
    LAND.init(D.planet.land);
    for (const e of D.planet.ents) {
      if (e.t.startsWith('EntityTree')) G.flora.push(new Flora(e.t, e.x, 1));
      else if (e.t === 'EntityRockRed' || e.t === 'EntityRockBrown') G.ents.push(new Static(e.t, e.x, e.t === 'EntityRockRed' ? 'desert_redrock' : 'desert_brownrock', 42, 42));
      else if (e.t === 'BuildingShrine') { const b = BUILD.place('BuildingShrine', e.x, { state: 'ready', rise: 0 }); b.id = 'shrine'; }
      else if (e.t === 'EntityCloudRain') G.clouds.push(new Cloud(e.x, 420, false));
      else if (e.t === 'EntitySun') { SUN.x = e.x; SUN.y = 600; }
      else if (e.t === 'FollowerNormal') {
        const f = new Follower('FollowerNormal', e.x, { believer: false, desire: 'rain', energy: 0.05 });
        f.tutorial = true; f.home = e.x;
        G.followers.push(f);
      }
    }
    Object.assign(PLAYER, { gold: +D.cfg.InitialGold || 500, mana: +D.cfg.InitialMana || 10, maxMana: 10, awe: +D.cfg.InitialAwePoints || 10, xp: 0, level: 1 });
    STATS.v = {}; STATS.flora = {}; OBJ.state = {}; OBJ.critterSpawned = false; HINT.seen = {};
    this.tut = 0; this.arriveT = 60; this.critterT = 200;
    CAM.x = 1080; CAM.zoom = CAM.defZ();
    if (!fromSave) this.tutorialStep();
  },
  tutorialStep() {
    const f = G.followers[0];
    if (this.tut === 0) {
      setTimeout(() => { if (f) f.say(STR('TutorialFollowerOpeningLine'), 6); }, 1200);
      setTimeout(() => { if (this.tut === 0) HINT.show('TutorialCloudMove'); }, 3500);
    }
  },
  onConverted(f) {
    if (this.tut === 0) {
      this.tut = 1;
      setTimeout(() => f.say(STR('TutorialFollowerReactToRain'), 3.5), 300);
      setTimeout(() => { f.say(STR('TutorialFollowerWorship'), 4); HINT.show('TutorialDropFollowerOnShrine', false, 'Pick up your Follower (drag them) and carry them to the totem - follow the arrow! Drop them there to uncover the Shrine.'); }, 4500);
    } else if (believers() === 2 && !HINT.seen.ConvertEveDone) {
      HINT.seen.ConvertEveDone = 1;
    }
  },
  onDrop(f, b) {
    if (b && b.type === 'Shrine' && this.tut <= 1) {}
    // tutorial: dropping a believer near the hidden shrine raises it
    const sh = SHRINE();
    if (sh && sh.rise < 1 && f.believer && Math.abs(dX(sh.x, f.x)) < 220) this.raiseShrine(f);
  },
  raiseShrine(f) {
    const sh = SHRINE();
    if (sh.raising) return;
    sh.raising = true;
    SFX.at('totemRaise', sh.x, 1);
    G.shake = 1.5;
    HINT.clear();
    const t0 = G.t;
    const id = setInterval(() => {
      sh.rise = clamp((G.t - t0) / 2.6, 0, 1);
      if (Math.random() < 0.6) G.fx.push(new Particle(pick(['mudfall', 'rock01', 'rock02']), sh.x + rand(-60, 60), sh.gy + 10, { vx: rand(-100, 100), vy: rand(100, 260), g: 600, life: 1, size: rand(12, 24), vr: rand(-5, 5) }));
      if (sh.rise >= 1) {
        clearInterval(id);
        SFX.play('motif', 0.7);
        HINT.show('TutorialShrine');
        this.tut = 2;
        setTimeout(() => { if (f.state !== 'gone' && !f.building) { f.x = sh.x - 40; f.joinBuilding(sh); } }, 400);
      }
    }, 30);
  },
  onBuilt(b) { if (b.type === 'Farm') setTimeout(() => HINT.show('TutorialBuildingTypeFarm'), 1500); if (b.type === 'Refreshment') setTimeout(() => HINT.show('TutorialBuildingTypeRefreshment'), 1500); if (b.type === 'Dwelling') setTimeout(() => HINT.show('TutorialBuildingTypeDwelling'), 1500); },
  onPlaced(b) {
    if (!b.isDeco) {
      setTimeout(() => HINT.show('TutorialFollowersToBuildBuilding'), 600);
      // the original spawned a curious newcomer whenever a building went up
      if (G.followers.filter(f => !f.skel && f.state !== 'gone').length < 4 + PLAYER.level) setTimeout(() => this.spawnArrival(b.x + rand(-300, 300)), 5000);
    }
  },
  onWonder(kind, L) {
    if (kind === 'rain') HINT.clear('TutorialCloudSwipeDown'), HINT.clear('TutorialCloudPressAndHold');
  },
  onDeath(f) { setTimeout(() => HINT.show(PLAYER.has('ResurrectionWonder1') ? 'HintResurrection' : 'TutorialFollowerExhausted'), 1500); },
  onLevelUp(l) {
    const unlocked = [];
    for (const [k, v] of Object.entries(D.cfg.LevelUnlocks)) if (+v.UnlockLevel === l) unlocked.push(k);
    const lv = D.cfg.Levels[String(l)] || {};
    if (lv.MaximumMana) PLAYER.maxMana = +lv.MaximumMana;
    PLAYER.mana = PLAYER.maxMana;
    PLAYER.awe += 2;
    // new entities this level
    for (const e of lv.NewEntities || []) {
      if (e.TemplateName === 'EntityCloudRain') G.clouds.push(new Cloud(CAM.x + rand(250, 450), 450, false));
      if (e.TemplateName === 'FollowerFemale') setTimeout(() => this.spawnArrival(CAM.x + rand(-350, 350), 'FollowerFemale'), 2500);
    }
    if (l === 2) setTimeout(() => { const f = this.spawnArrival(CAM.x + 260, 'FollowerFemale'); if (f) { f.name = 'Eve'; f.desire = 'rain'; setTimeout(() => f.say(STR('TutorialEveSpeech'), 5), 2500); } HINT.show('TutorialSecondFollowerHint'); }, 2000);
    if (l === 3) setTimeout(() => HINT.show('TutorialOpenMenuStore'), 2500);
    if (l === 4) setTimeout(() => { HINT.show('TutorialSun2', false, STR('TutorialSun1') + ' ' + STR('TutorialSun2')); }, 2500);
    if (l === 6) setTimeout(() => {
      G.clouds.push(new Cloud(CAM.x - 320, 480, true));
      HINT.show('TutorialStormCloud', false, STR('TutorialStormCloud') + ' ' + STR('TutorialLightningWonder1History'));
      this.spawnChest(CAM.x + rand(-500, 500));
      setTimeout(() => this.spawnSkeleton(CAM.x + 600), 20000);
    }, 2500);
    if (l === 7) setTimeout(() => HINT.show('TutorialTerrainWonder1History'), 2500);
    if (l === 8) setTimeout(() => HINT.show('TutorialMovementWonder1History'), 2500);
    if (l === 10) setTimeout(() => HINT.show('TutorialRainWonder2History'), 2500);
    if (l % 3 === 0 && l > 6) setTimeout(() => this.spawnChest(rand(0, C)), 4000);
    SFX.play('motif', 0.8);
    for (let i = 0; i < 4; i++) setTimeout(() => { SFX.play(SND.firework, 0.5); }, 300 + i * 350);
    for (const f of G.followers) if (f.believer && !f.busy && CAM.visible(f.x)) f.setState('celebrate');
    UI.levelUp(l, unlocked);
  },
  spawnArrival(x, t = null) {
    const lvl = PLAYER.level;
    t = t || (Math.random() < 0.5 ? 'FollowerFemale' : 'FollowerNormal');
    const desires = ['rain'];
    if (PLAYER.has('SunWonder1')) desires.push('sun', 'sun');
    if (PLAYER.has('LightningWonder1')) desires.push('lightning');
    const f = new Follower(t, x, { believer: false, desire: pick(desires), energy: rand(0.6, 1) });
    f.home = wrapX(x);
    G.followers.push(f);
    f.setState('arrive');
    SFX.at('tombstoneRaise1', x, 0.6);
    for (let i = 0; i < 8; i++) G.fx.push(new Particle(pick(['mudfall', 'grass01', 'rock01']), x + rand(-20, 20), LAND.hAt(x) + 5, { vx: rand(-80, 80), vy: rand(80, 200), g: 500, life: 0.9, size: rand(10, 20), vr: rand(-5, 5) }));
    if (CAM.visible(x)) HINT.show('TutorialFollowerConversion');
    return f;
  },
  spawnChest(x) {
    const t = pick(['EntityBreakableChestSmall', 'EntityBreakableChestMedium', 'EntityBreakableChestLarge', 'EntityBreakableRockMedium', 'EntityBreakableRockLarge']);
    for (let k = 0; k < 20; k++) { if (BUILD.valid(t, x)) break; x = rand(0, C); }
    G.ents.push(new Breakable(t, x));
    if (CAM.visible(x)) HINT.show('ObjectiveBreakFirstChest');
  },
  spawnSkeleton(x) {
    const s = new Follower('SkeletonCritter', x, { cat: 'Skeleton', believer: false });
    s.skel = true; s.health = 60;
    G.followers.push(s);
    s.setState('arrive');
    OBJ.critterSpawned = true;
    SFX.at('tombstoneRaise1', x, 0.8);
    HINT.show('ObjectiveFirstCritter');
    return s;
  },
  update(dt) {
    // mana regeneration: a slow trickle, faster with worshippers (shrine handles its own bonus)
    PLAYER.regen += dt / 16;
    if (PLAYER.regen >= 1) { PLAYER.regen = 0; if (PLAYER.mana < PLAYER.maxMana) { PLAYER.mana++; UI.bump('mana'); } }
    if (PLAYER.mana >= PLAYER.maxMana) PLAYER.regen = 0;
    // newcomers wander in over time (more with dwellings)
    if (this.tut >= 2) {
      this.arriveT -= dt;
      const pop = G.followers.filter(f => !f.skel && f.state !== 'gone').length;
      const cap = 3 + Math.floor(PLAYER.level / 2) + 2 * G.buildings.filter(b => b.type === 'Dwelling' && b.state === 'ready').length;
      const unbel = G.followers.filter(f => !f.believer && !f.skel && f.state !== 'gone').length;
      if (this.arriveT <= 0) {
        this.arriveT = rand(50, 90);
        if (pop < cap && unbel < 2 && PLAYER.level >= 2) this.spawnArrival(CAM.x + rand(-500, 500));
      }
    }
    if (PLAYER.level >= 6 && OBJ.critterSpawned) {
      this.critterT -= dt;
      if (this.critterT <= 0) { this.critterT = rand(180, 320); if (G.followers.filter(f => f.skel && f.state !== 'gone').length < 1 + Math.floor(PLAYER.level / 12)) this.spawnSkeleton(rand(0, C)); }
    }
    // tutorial nudges
    if (this.tut === 0 && HINT.seen.TutorialCloudMove && !HINT.seen.TutorialCloudPressAndHold) {
      const f = G.followers[0], c = G.clouds[0];
      if (f && c && Math.abs(dX(c.x, f.x)) < 140 && !c.drag) HINT.show('TutorialCloudPressAndHold');
    }
    if (this.tut === 1) {
      const f = G.followers.find(f => f.believer);
      if (f && f.state === 'wander' && Math.random() < dt * 0.05) f.say(STR('TutorialFollowerPickMeUp'), 3);
    }
  },
};

// ---------- save / load ----------
const SAVE_KEY = 'godfinger-web-save-v1';
const SAVE = {
  data() {
    const fIdx = new Map(); G.followers.forEach((f, i) => fIdx.set(f, i));
    return {
      v: 1, t: Date.now(),
      player: { gold: PLAYER.gold, mana: PLAYER.mana, maxMana: PLAYER.maxMana, awe: PLAYER.awe, xp: PLAYER.xp, level: PLAYER.level },
      land: { h: Array.from(LAND.h, v => Math.round(v * 10) / 10), m: Array.from(LAND.m, v => Math.round(v * 1000) / 1000) },
      cam: { x: CAM.x },
      sun: { x: SUN.x, y: SUN.y },
      clouds: G.clouds.map(c => ({ x: c.x, y: c.y, s: c.storm })),
      buildings: G.buildings.filter(b => !b.dead).map(b => ({ t: b.t, x: b.x, st: b.state, p: b.progress, pw: b.power, g: b.gen, r: b.rise, id: b.id })),
      followers: G.followers.filter(f => f.state !== 'gone' && f.state !== 'dead').map(f => ({ id: f.id, t: f.t, x: f.x, cat: f.cat, skin: f.skin, n: f.name, b: f.believer, d: f.desire, bl: f.belief, e: f.energy, h: f.home, bid: f.building ? f.building.id : null, role: f.role, sk: f.skel })),
      graves: G.graves.filter(g => !g.dead).map(g => ({ x: g.x, f: { t: g.f.t, cat: g.f.cat, skin: g.f.skin, n: g.f.name } })),
      flora: G.flora.map(f => ({ t: f.t, x: Math.round(f.x), g: Math.round(f.grow * 100) / 100, k: f.kind })),
      golds: G.golds.filter(g => !g.dead).map(g => ({ x: g.x, v: g.value, a: g.age, s: g.src })),
      breakables: G.ents.filter(e => e instanceof Breakable && !e.dead).map(e => ({ t: e.t, x: e.x, hp: e.hp })),
      stats: STATS.v, statsF: STATS.flora, obj: OBJ.state, crit: OBJ.critterSpawned, hints: HINT.seen, tut: GAME.tut,
      sound: SFX.on,
    };
  },
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data())); } catch (e) {} },
  exists() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } },
  clear() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} },
  load() {
    let s; try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return false; }
    if (!s || s.v !== 1) return false;
    GAME.newGame(true);
    G.followers = []; G.buildings = []; G.flora = []; G.golds = []; G.clouds = []; G.graves = [];
    G.ents = G.ents.filter(e => e instanceof Static);
    Object.assign(PLAYER, s.player);
    s.land.h.forEach((v, i) => LAND.h[i] = v); s.land.m.forEach((v, i) => LAND.m[i] = v);
    CAM.x = s.cam.x; SUN.x = s.sun.x; SUN.y = s.sun.y;
    G.clouds = s.clouds.map(c => new Cloud(c.x, c.y, c.s));
    const byId = {};
    for (const b of s.buildings) { const nb = new Building(b.t, b.x, { state: b.st, progress: b.p, power: b.pw, gen: b.g, rise: b.r, id: b.id }); G.buildings.push(nb); byId[nb.id] = nb; }
    for (const f of s.followers) {
      const nf = new Follower(f.t, f.x, { id: f.id, cat: f.cat, skin: f.skin, name: f.n, believer: f.b, desire: f.d, belief: f.bl, energy: f.e });
      nf.home = f.h; if (f.sk) { nf.skel = true; nf.health = 60; }
      G.followers.push(nf);
      if (f.bid && byId[f.bid]) { const b = byId[f.bid]; nf.x = b.x; if (!nf.joinBuilding(b)) nf.setState('wander'); }
    }
    for (const g of s.graves) { const f = new Follower(g.f.t, g.x, { cat: g.f.cat, skin: g.f.skin, name: g.f.n, believer: true }); f.state = 'gone'; const gr = new Grave(f); gr.rise = 1; G.graves.push(gr); G.followers.push(f); }
    for (const f of s.flora) { const nf = new Flora(f.t, f.x, f.g); nf.kind = f.k; G.flora.push(nf); }
    for (const g of s.golds) { const gp = spawnGold(g.x, g.v, g.s); gp.age = g.a; gp.pop = 1; const b = G.buildings.find(b => b.id === g.s); if (b) b.piles.push(gp); }
    for (const b of s.breakables) { const nb = new Breakable(b.t, b.x); nb.hp = b.hp; G.ents.push(nb); }
    STATS.v = s.stats || {}; STATS.flora = s.statsF || {}; OBJ.state = s.obj || {}; OBJ.critterSpawned = !!s.crit; HINT.seen = s.hints || {}; GAME.tut = s.tut || 0;
    if (s.sound === false) SFX.setOn(false);
    if (GAME.tut === 1) { const sh = SHRINE(); if (sh) sh.rise = 0; }
    return true;
  },
};
