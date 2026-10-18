'use strict';
// ---------- UI images ----------
const UIIMG = {};
['GoldIcon', 'ManaIcon', 'AweIcon', 'DesireIconRain', 'DesireIconSun', 'DesireIconLightning', 'progress_rain', 'progress_sun', 'progress_lightning',
  'progress_terra', 'progress_flood', 'progress_firestorm', 'progress_electrostorm', 'progress_terrasuper', 'progress_movement', 'progress_reincarnate',
  'icon_store', 'icon_objective', 'icon_help', 'icon_settings', 'icon_progression', 'followerportrait1', 'followerportrait2', 'followerportrait3',
  'skellyportrait', 'GodFinger', 'HappyFace', 'SadFace', 'objective_rune', 'tick', 'Speedo'].forEach(n => { const im = new Image(); im.src = 'assets/ui/' + n + '.webp'; UIIMG[n] = im; });
UIIMG.Desirerain = UIIMG.DesireIconRain; UIIMG.Desiresun = UIIMG.DesireIconSun; UIIMG.Desirelightning = UIIMG.DesireIconLightning;
UIIMG.DesireRain = UIIMG.DesireIconRain; UIIMG.DesireSun = UIIMG.DesireIconSun; UIIMG.DesireLightning = UIIMG.DesireIconLightning;

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// sprite -> data URL cache for store thumbnails
const THUMB = {};
function thumb(name, size = 84) {
  name = (name || '').toLowerCase();
  if (THUMB[name]) return THUMB[name];
  const s = SPR[name]; if (!s) return '';
  const c = document.createElement('canvas'); c.width = c.height = size;
  const k = Math.min(size / s.w, size / s.h);
  const w = s.w * k, h = s.h * k;
  c.getContext('2d').drawImage(s.img, s.x, s.y, s.w, s.h, (size - w) / 2, (size - h) / 2, w, h);
  return (THUMB[name] = c.toDataURL());
}

const UI = {
  shown: {},
  init() {
    $('#b-store').onclick = () => this.store();
    $('#b-goals').onclick = () => this.goals();
    $('#b-wonders').onclick = () => this.wonders();
    $('#b-zoom').onclick = () => { CAM.tz = CAM.zoomN > 0.6 ? CAM.minZ() : CAM.defZ(); };
    $('#b-sound').onclick = () => { SFX.init(); SFX.setOn(!SFX.on); this.syncSound(); AMB.sync(); };
    $('#b-menu').onclick = () => this.menu();
    $('#hint .x').onclick = () => HINT.clear();
    $('#place-ok').onclick = () => PLACE.ok();
    $('#place-cancel').onclick = () => PLACE.cancel();
    $('#modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal') this.close(); });
    $('#p-mana').onclick = () => this.info('Mana', 'ManaIcon', STR('TutorialFollowerMana2') + ' Wonders cost 1 mana (2 for the charged-up version).');
    $('#p-gold').onclick = () => this.info('Gold', 'GoldIcon', 'Gold buys buildings and decorations in the Store. Put Followers to work on farms - power the farm with the right Wonder - then tap the gold stacks before they rust.');
    $('#p-awe').onclick = () => this.info('Awe', 'AweIcon', 'Awe is earned when you level up. Spend it to instantly finish a building or replenish an exhausted Follower.');
    $('#p-lvl').onclick = () => this.info('Level ' + PLAYER.level, 'Speedo', `${Math.floor(PLAYER.xp)} / ${PLAYER.xpNeeded()} XP to the next level. Using mana, converting Followers, growing plants, building and harvesting gold all earn XP.`);
    this.syncSound();
    window.addEventListener('keydown', e => { if (e.key === 'Escape') { if (PLACE.active) PLACE.cancel(); else this.close(); } });
  },
  syncSound() { $('#b-sound').classList.toggle('off', !SFX.on); $('#b-sound').title = SFX.on ? 'Sound on' : 'Sound off'; },
  bump(which) { const el = $('#p-' + (which === 'xp' ? 'lvl' : which)); if (!el) return; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); },
  update() {
    $('#mana').textContent = `${PLAYER.mana}/${PLAYER.maxMana}`;
    $('#mana-regen').style.width = (PLAYER.mana >= PLAYER.maxMana ? 100 : PLAYER.regen * 100) + '%';
    $('#gold').textContent = Math.floor(PLAYER.gold).toLocaleString();
    $('#awe').textContent = PLAYER.awe;
    $('#lvl').textContent = PLAYER.level;
    $('#xpbar').style.width = clamp(PLAYER.xp / PLAYER.xpNeeded(), 0, 1) * 100 + '%';
    if (this.tipF) this.positionTip();
  },
  goalsBadge() { const n = OBJ.active().length; const b = $('#goals-n'); b.textContent = n; b.hidden = !n; },
  hint(text) {
    const h = $('#hint');
    if (!text) { h.classList.remove('on'); return; }
    h.querySelector('.txt').textContent = text;
    h.classList.add('on');
    clearTimeout(this.hintT);
    this.hintT = setTimeout(() => h.classList.remove('on'), Math.max(9000, text.length * 90));
  },
  toast(text, icon = null) {
    const t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = (icon && UIIMG[icon] ? `<img src="${UIIMG[icon].src}" alt="">` : '') + `<span>${esc(text)}</span>`;
    $('#toasts').appendChild(t);
    while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
    setTimeout(() => t.classList.add('out'), 3800);
    setTimeout(() => t.remove(), 4400);
  },
  // ---------- modal ----------
  open(html, cls = '') {
    const m = $('#modal'); m.querySelector('.panel').className = 'panel ' + cls;
    m.querySelector('.panel').innerHTML = html + '<button class="close" aria-label="Close">×</button>';
    m.querySelector('.close').onclick = () => this.close();
    m.hidden = false; G.paused = !!cls.includes('pause');
    SFX.play('pop', 0.4);
    return m.querySelector('.panel');
  },
  close() { $('#modal').hidden = true; G.paused = false; },
  info(title, icon, text) {
    this.open(`<div class="info"><img src="${UIIMG[icon] ? UIIMG[icon].src : ''}" alt=""><div><h2>${esc(title)}</h2><p>${esc(text)}</p></div></div>`, 'small');
  },
  reward(title, text, xp, gold) {
    // non-blocking card so it never interrupts a gesture
    const t = document.createElement('div'); t.className = 'toast reward-toast';
    t.innerHTML = `<div class="rt-head"><span class="ribbon">Goal complete</span><b>${esc(title)}</b></div>
      <p>${esc(text)}</p><div class="gains"><span><b>+${xp}</b> XP</span>${gold ? `<span><img src="${UIIMG.GoldIcon.src}" alt=""><b>+${gold}</b></span>` : ''}</div>`;
    $('#toasts').appendChild(t);
    while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
    setTimeout(() => t.classList.add('out'), 6500);
    setTimeout(() => t.remove(), 7100);
  },
  levelUp(l, unlocked) {
    const items = [];
    for (const k of unlocked) {
      const w = Object.entries(WONDERS).find(([, v]) => v.lvl.includes(k));
      if (w) { const lv = w[1].lvl.indexOf(k); const icon = { rain: ['progress_rain', 'progress_flood'], sun: ['progress_sun', 'progress_firestorm'], lightning: ['progress_lightning', 'progress_electrostorm'], terrain: ['progress_terra', 'progress_terrasuper'], resurrect: ['progress_reincarnate'], move: ['progress_movement'] }[w[0]][lv]; items.push(`<div class="unlock wonder"><img src="${UIIMG[icon].src}" alt=""><span>${esc(w[1].name[lv])}</span></div>`); continue; }
      if (/Upgrade/.test(k)) continue;
      if (D.templates[k] && D.cfg.StoreItems[k]) { const tex = (D.templates[k].c.EntityComponentRender || {}).textureName; if (SPR[(tex || '').toLowerCase()]) items.push(`<div class="unlock"><img src="${thumb(tex)}" alt=""><span>${esc(bName(k))}</span></div>`); }
    }
    if (!items.length) {
      this.toast(STR('LevelUpToast').replace('[LEVEL]', l) + ' · mana refilled', 'Speedo');
      return;
    }
    const p = this.open(`<div class="levelup"><div class="burst"></div><div class="ribbon">${esc(STR('LevelUpToastTitle'))}</div><h2>${esc(STR('LevelUpTitle').replace('[NUMBER]', l))}</h2>
      <p>${esc(STR('LevelUpText'))} Mana refilled${l > 1 ? ' and +2 Awe' : ''}.</p>
      ${items.length ? `<h3>Unlocked</h3><div class="unlocks">${items.join('')}</div>` : ''}
      <button class="btn primary ok">Onwards!</button></div>`, 'small');
    p.querySelector('.ok').onclick = () => this.close();
  },
  // ---------- store ----------
  storeTab: 'Buildings',
  storeItems() {
    const out = { Buildings: [], Decorations: [], Shrines: [] };
    for (const [k, si] of Object.entries(D.cfg.StoreItems)) {
      const tpl = D.templates[k]; if (!tpl) continue;
      const r = tpl.c.EntityComponentRender; const tex = r && r.textureName;
      if (!tex || !SPR[tex.toLowerCase()]) continue;
      const cost = +si.GoldCost; if (!cost) continue;
      const deco = k.startsWith('Decoration');
      const def = deco ? {} : buildingDef(k);
      if (!deco && !def.buildingType) continue;
      if (/Graveyard|Store|Windmill|Prison/.test(k)) continue;
      const u = D.cfg.LevelUnlocks[k];
      const lvl = u ? +u.UnlockLevel : (deco ? 1 : 99);
      if (lvl > 50) continue;
      const cat = def.buildingType === 'Shrine' ? 'Shrines' : deco ? 'Decorations' : 'Buildings';
      out[cat].push({ k, tex, cost, lvl, def, deco, desc: si.Description || '' });
    }
    for (const c in out) out[c].sort((a, b) => a.lvl - b.lvl || a.cost - b.cost);
    return out;
  },
  store() {
    HINT.clear('TutorialOpenMenuStore');
    const items = this.storeItems();
    const tabs = Object.keys(items).map(t => `<button class="tab ${t === this.storeTab ? 'on' : ''}" data-t="${t}">${t}</button>`).join('');
    const list = items[this.storeTab].map(it => {
      const locked = PLAYER.level < it.lvl;
      const poor = PLAYER.gold < it.cost;
      const d = it.def;
      const tags = [];
      if (!it.deco) {
        tags.push(d.buildingType === 'Farm' ? 'Farm · gold' : d.buildingType === 'Refreshment' ? 'Refreshment · energy' : d.buildingType === 'Dwelling' ? 'Dwelling · rest' : d.buildingType === 'Shrine' ? 'Shrine · mana' : d.buildingType);
        if (+d.maxFollowers) tags.push(`${d.maxFollowers} worker${+d.maxFollowers > 1 ? 's' : ''}`);
        const pw = d.wonderRequiredForPower || '';
        if (/Rain|Sun|Lightning/.test(pw)) tags.push('needs ' + (/Rain/.test(pw) ? 'rain' : /Sun/.test(pw) ? 'sun' : 'lightning'));
      }
      return `<button class="item ${locked ? 'locked' : ''} ${poor && !locked ? 'poor' : ''}" data-k="${it.k}" ${locked ? 'disabled' : ''}>
        <img src="${thumb(it.tex)}" alt=""><b>${esc(bName(it.k))}</b>
        <small>${esc(tags.join(' · ') || it.desc)}</small>
        <span class="price">${locked ? 'Level ' + it.lvl : `<img src="${UIIMG.GoldIcon.src}" alt="">${it.cost}`}</span></button>`;
    }).join('');
    const p = this.open(`<h2 class="ptitle"><img src="${UIIMG.icon_store.src}" alt="">Store</h2><div class="tabs">${tabs}</div><div class="grid">${list || '<p class="empty">Nothing here yet.</p>'}</div>`, 'wide');
    p.querySelectorAll('.tab').forEach(b => b.onclick = () => { this.storeTab = b.dataset.t; this.store(); });
    p.querySelectorAll('.item').forEach(b => b.onclick = () => {
      const it = items[this.storeTab].find(i => i.k === b.dataset.k);
      if (PLAYER.gold < it.cost) { this.toast(STR('TutorialNotEnoughGold')); SFX.play('sigh1', 0.6); return; }
      this.close();
      if (it.def.buildingType === 'Shrine') { this.upgradeShrine(it); return; }
      PLACE.start(it.k, it.cost);
    });
  },
  upgradeShrine(it) {
    const sh = SHRINE(); if (!sh) return;
    PLAYER.gold -= it.cost;
    const nb = new Building(it.k, sh.x, { state: 'ready' }); nb.id = sh.id;
    const ws = sh.workers.slice(); ws.forEach(f => f.leaveBuilding(true));
    sh.dead = true; G.buildings.push(nb);
    ws.forEach(f => f.joinBuilding(nb));
    SFX.at('totemRaise', nb.x, 1); G.shake = 1;
    CAM.tx = nb.x;
    STATS.add('shrineUpgrade', 1);
  },
  // ---------- goals ----------
  goals() {
    const row = (o, done) => {
      const d = OBJ.def(o.k); const img = d.bubbleImage || 'objective_rune';
      const src = UIIMG[img] ? UIIMG[img].src : 'assets/ui/' + img + '.webp';
      const pr = !done && OBJ.progress(o);
      return `<div class="goal ${done ? 'done' : ''}"><img src="${src}" alt="" onerror="this.onerror=null;this.src='assets/ui/objective_rune.webp'"><div><b>${esc(OBJ.title(o))}</b><p>${esc(OBJ.desc(o))}</p>
        ${pr ? `<i class="bar"><b style="width:${pr[0] / pr[1] * 100}%"></b></i><small>${Math.max(0, pr[0])} / ${pr[1]}</small>` : ''}</div>
        <span class="rw">${done ? '✓' : `+${d.rewardXP || 15} XP`}</span></div>`;
    };
    const act = OBJ.active(), comp = OBJ.completed();
    this.open(`<h2 class="ptitle"><img src="${UIIMG.icon_objective.src}" alt="">Goals</h2>
      <h3>${esc(STR('ObjectiveSectionActive'))}</h3>${act.map(o => row(o, false)).join('') || '<p class="empty">No goals right now - keep playing to level up!</p>'}
      ${comp.length ? `<h3>${esc(STR('ObjectiveSectionCompleted'))}</h3>${comp.map(o => row(o, true)).join('')}` : ''}`, 'wide');
  },
  // ---------- wonders guide ----------
  wonders() {
    const rows = [
      ['rain', 'progress_rain', 'Rain', 'Press and hold a white cloud until it pings, then flick down. Rain greens the land, grows plants, refreshes Followers and powers rain-driven farms. Keep holding for a second charge to unleash a Flood.'],
      ['sun', 'progress_sun', 'Sunshine', 'Hold the sun, then flick down for warm rays: flowers bloom on wet ground and Followers perk up. A double charge launches a Firestorm wherever you flick it.'],
      ['lightning', 'progress_lightning', 'Lightning', 'Hold the dark storm cloud, then flick towards your target. Cracks open chests, zaps skeletons, powers stone buildings - and terrifies Followers. Double charge for an Electrostorm.'],
      ['terrain', 'progress_terra', 'Terraform', 'Hold just below the ground surface, then flick up to raise a hill or down to dig a dip.'],
      ['resurrect', 'progress_reincarnate', 'Resurrection', 'Hold a gravestone to bring a fallen Follower back to life.'],
      ['move', 'progress_movement', 'Move', 'Hold a building, then flick up to lift it and place it somewhere new.'],
    ];
    const html = rows.map(([k, icon, name, txt]) => {
      const lvl = D.cfg.LevelUnlocks[WONDERS[k].lvl[0]];
      const have = WONDER.maxLevel(k) > 0;
      return `<div class="wrow ${have ? '' : 'locked'}"><img src="${UIIMG[icon].src}" alt=""><div><b>${name}${have ? '' : ` <em>· level ${lvl ? lvl.UnlockLevel : '?'}</em>`}</b><p>${txt}</p></div></div>`;
    }).join('');
    this.open(`<h2 class="ptitle"><img src="${UIIMG.icon_help.src}" alt="">Wonders &amp; how to play</h2>
      <p class="lead">Drag followers to carry them; fling them to throw. Drop them on buildings to work, build or rest. Drag the sky to spin the planet; scroll or pinch to zoom, double-tap to see the whole world.</p>${html}`, 'wide');
  },
  menu() {
    const p = this.open(`<div class="menu"><img class="logo" src="${UIIMG.GodFinger.src}" alt="Godfinger">
      <button class="btn" data-a="credits">Credits</button>
      <button class="btn" data-a="new">Start a new planet</button>
      <button class="btn primary" data-a="resume">Resume</button></div>`, 'small pause');
    p.querySelectorAll('button[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'resume') this.close();
      if (a === 'credits') this.credits();
      if (a === 'new') {
        if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Tap again to wipe this planet'; b.classList.add('danger'); return; }
        SAVE.clear(); this.close(); GAME.newGame(); CAM.zoom = CAM.minZ(); CAM.tz = CAM.defZ();
      }
    });
  },
  credits() {
    const secs = D.cfg.Credits.Sections.map(s => `<h3>${esc(STR(s.LabelString))}</h3><p>${s.Credits.map(c => esc(c).replace(/\n/g, '<br>')).join('<br>')}</p>`).join('');
    this.open(`<div class="credits"><img class="logo" src="${UIIMG.GodFinger.src}" alt="Godfinger">${secs}<p class="port">Browser port rebuilt from the original v2.1 game data: sprites, animations, sounds, planet and balancing all come from the IPA.</p></div>`, 'small pause');
  },
  // ---------- follower tooltip ----------
  tipF: null,
  followerTip(f) {
    this.tipF = f;
    const t = $('#tip');
    const state = f.skel ? 'Rattlin\'' : !f.believer ? STR(f.desire === 'sun' ? 'FollowerStateConversionSun' : 'FollowerStateConversionRain') :
      f.state === 'work' ? STR(f.building.def.followerBehaviour === 'FollowerStateBuildingBehaviourGeneric' ? 'FollowerStateBuildingBehaviourGeneric_Dwelling' : f.building.def.followerBehaviour) :
        f.state === 'build' ? STR('FollowerStateBuilder') : f.state === 'exhausted' ? STR('FollowerStateExhausted') : f.state === 'scared' ? STR('FollowerStateScared') : STR('FollowerStateWander');
    const line = f.skel ? 'A nasty skeleton! Zap it with lightning.' : !f.believer ? STR('TutorialFollowerConversion') : STR(f.female ? 'ToolTipFollowerFemale' : 'ToolTipFollower').replace('[NAME]', f.name);
    t.innerHTML = `<b>${esc(f.name)}</b><span class="st">${esc(state)}</span><p>${esc(line)}</p>
      ${f.skel ? '' : `<div class="meter"><img src="${(f.energy > 0.5 ? UIIMG.HappyFace : UIIMG.SadFace).src}" alt=""><i class="bar"><b style="width:${f.energy * 100}%"></b></i><small>${Math.round(f.energy * 100)}%</small></div>`}
      ${!f.believer && !f.skel ? `<div class="meter"><img src="${UIIMG['DesireIcon' + f.desire[0].toUpperCase() + f.desire.slice(1)].src}" alt=""><i class="bar belief"><b style="width:${f.belief}%"></b></i><small>belief</small></div>` : ''}
      ${f.believer && f.energy < 0.6 && PLAYER.awe > 0 ? `<button class="btn tiny" id="tip-awe"><img src="${UIIMG.AweIcon.src}" alt="">Replenish · 1 Awe</button>` : ''}`;
    t.hidden = false;
    const b = $('#tip-awe');
    if (b) b.onclick = e => { e.stopPropagation(); PLAYER.awe--; f.energy = 1; if (f.state === 'exhausted') f.setState('wander'); SFX.play('energyRushShortened1', 0.6); this.closeTip(); };
    this.positionTip();
    SFX.at(f.skel ? 'hit6' : SND.happy, f.x, 0.4, rand(1, 1.15));
    if (!f.skel && f.state === 'wander' && f.believer) f.seq([['impresshappy', false], ['idle', true]]);
  },
  positionTip() {
    const f = this.tipF; const t = $('#tip');
    if (!f || f.state === 'gone') { this.closeTip(); return; }
    const p = CAM.toScreen(f.x, f.gy + f.y + 115);
    t.style.left = clamp(p.x, 120, G.W - 120) + 'px'; t.style.top = clamp(p.y, 90, G.H - 40) + 'px';
  },
  closeTip() { this.tipF = null; $('#tip').hidden = true; },
  // ---------- building panel ----------
  buildingPanel(b) {
    const d = b.def;
    const typeKey = { Farm: 'TutorialBuildingTypeFarm', Refreshment: 'TutorialBuildingTypeRefreshment', Dwelling: 'TutorialBuildingTypeDwelling', Shrine: 'TutorialShrine' }[b.type];
    const lines = [];
    if (b.isDeco) lines.push('A lovely decoration for your planet.');
    else if (typeKey) lines.push(STR(typeKey));
    if (b.state === 'build') lines.push(`Under construction - ${Math.round(b.progress * 100)}% built. ${b.builders.length} builder${b.builders.length === 1 ? '' : 's'} working.`);
    if (b.state === 'ready' && b.maxF) lines.push(`${b.workers.length} / ${b.maxF} Followers here.`);
    if (b.powerFor && b.state === 'ready') lines.push(`Power: ${Math.round(b.power * 100)}% - recharge it with ${b.powerFor === 'rain' ? 'Rain' : b.powerFor === 'sun' ? 'Sunshine' : 'Lightning'}.`);
    if (b.type === 'Farm') lines.push(`Makes ${d.goldGeneration} gold per stack (up to ${b.maxPiles} stacks waiting).`);
    if (b.type === 'Shrine') lines.push('Worshipping Followers generate Mana.');
    const sell = b.type !== 'Shrine' && b.cost;
    const finish = b.state === 'build' && PLAYER.awe >= 2;
    const p = this.open(`<div class="bpanel"><img src="${thumb(b.tex, 120)}" alt=""><div><h2>${esc(bName(b.t))}</h2>${lines.map(l => `<p>${esc(l)}</p>`).join('')}
      <div class="row">${finish ? `<button class="btn" data-a="finish"><img src="${UIIMG.AweIcon.src}" alt="">Finish now · 2 Awe</button>` : ''}
      ${sell ? `<button class="btn" data-a="sell">Sell for ${Math.round(b.cost * 0.25)} gold</button>` : ''}
      ${b.workers.length ? '<button class="btn" data-a="evict">Send Followers out</button>' : ''}</div>
      ${PLAYER.has('MovementWonder1') ? '<p class="tip">Tip: press and hold a building, then flick up to move it.</p>' : ''}</div></div>`, 'small');
    p.querySelectorAll('button[data-a]').forEach(btn => btn.onclick = () => {
      const a = btn.dataset.a;
      if (a === 'sell') { b.sell(); this.close(); }
      if (a === 'finish') { PLAYER.awe -= 2; b.complete(); this.close(); }
      if (a === 'evict') { b.workers.slice().forEach(f => f.leaveBuilding()); this.close(); }
    });
  },
  // ---------- placement bar ----------
  placeBar(on, t, cost) {
    const pb = $('#placebar');
    pb.hidden = !on;
    if (on) {
      pb.querySelector('.nm').textContent = bName(t);
      pb.querySelector('.pr').innerHTML = cost ? `<img src="${UIIMG.GoldIcon.src}" alt="">${cost}` : 'Free move';
    }
  },
  hover(x, y) {},
};

// ---------- ambience ----------
const AMB = {
  cur: null, name: null,
  sync() {
    if (!SFX.ctx || !SFX.on) { if (this.cur) { this.cur.stop(); this.cur = null; this.name = null; } return; }
    const want = CAM.zoomN < 0.25 ? 'spaceAmbience' : LAND.mAt(CAM.x) > 0.2 ? 'ambiForest' : 'ambiCountry';
    if (want !== this.name) {
      if (this.cur) this.cur.stop();
      this.name = want; this.cur = SFX.play(want, want === 'spaceAmbience' ? 0.35 : 0.22, 1, true);
    }
  },
};
