'use strict';
// ---------- main loop & rendering ----------
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
G.critters = () => G.followers.filter(f => f.skel && f.state !== 'gone');
G.shake = 0; G.flash = 0;

function resize() {
  G.dpr = Math.min(2, window.devicePixelRatio || 1);
  G.W = cv.clientWidth; G.H = cv.clientHeight;
  cv.width = Math.round(G.W * G.dpr); cv.height = Math.round(G.H * G.dpr);
}
window.addEventListener('resize', resize);

let objT = 0, saveT = 0, ambT = 0;
function update(dt) {
  G.t += dt;
  CAM.update(dt);
  INPUT.update(dt);
  WONDER.update(dt);
  GAME.update(dt);
  for (const c of G.clouds) c.update(dt);
  SUN.update(dt);
  for (const f of G.followers) if (f.state !== 'gone') f.update(dt);
  G.followers = G.followers.filter(f => !(f.state === 'gone' && f.skel));
  for (const b of G.buildings) b.update(dt);
  G.buildings = G.buildings.filter(b => !b.dead);
  FLORA.update(dt);
  for (const g of G.golds) g.update(dt);
  G.golds = G.golds.filter(g => !g.dead);
  for (const e of G.ents) e.update(dt);
  G.ents = G.ents.filter(e => !e.dead);
  for (const g of G.graves) g.update(dt);
  G.graves = G.graves.filter(g => !g.dead);
  G.fx = G.fx.filter(p => p.update(dt));
  if (G.fx.length > 900) G.fx.splice(0, G.fx.length - 900);
  G.shake = Math.max(0, G.shake - dt);
  G.flash = Math.max(0, G.flash - dt * 2.5);
  objT -= dt; if (objT < 0) { objT = 0.5; OBJ.update(); }
  saveT -= dt; if (saveT < 0) { saveT = 15; SAVE.save(); }
  ambT -= dt; if (ambT < 0) { ambT = 2; AMB.sync(); }
  UI.update();
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawSky(ctx);
  CAM.apply(ctx);
  if (G.shake > 0) { const s = G.shake * 8 / CAM.zoom; ctx.translate(rand(-s, s), rand(-s, s)); }
  const vis = (x, pad = 300) => CAM.visible(x, pad);
  // far layers
  if (vis(SUN.x)) SUN.draw(ctx);
  drawBackgrounds(ctx);
  for (const c of G.clouds) if (vis(c.x)) c.draw(ctx);
  drawSunBeam(ctx);
  // world objects
  for (const f of G.flora) if (f.kind === 'tree' && vis(f.x)) f.draw(ctx);
  for (const f of G.flora) if (f.kind !== 'tree' && f.layer === 'plants' && vis(f.x)) f.draw(ctx);
  for (const b of G.buildings) if (!b.isDeco && vis(b.x) && !b.lift) b.draw(ctx);
  for (const b of G.buildings) if (b.isDeco && vis(b.x) && !b.lift) b.draw(ctx);
  for (const f of G.flora) if (f.kind !== 'tree' && f.layer !== 'plants' && vis(f.x)) f.draw(ctx);
  for (const e of G.ents) if (vis(e.x)) e.draw(ctx);
  for (const g of G.graves) if (vis(g.x)) g.draw(ctx);
  for (const g of G.golds) if (vis(g.x)) g.draw(ctx);
  for (const f of G.followers) if (f.state !== 'held' && f.state !== 'air' && f.state !== 'gone' && vis(f.x)) f.draw(ctx);
  for (const p of G.fx) if (!(p instanceof FloatText) && vis(p.x)) p.draw(ctx);
  // the ground sits in front of everything planted in it
  drawLandscape(ctx);
  drawFoliage(ctx);
  // airborne things
  for (const f of G.followers) if ((f.state === 'held' || f.state === 'air') && vis(f.x)) f.draw(ctx);
  for (const b of G.buildings) if (b.lift && vis(b.x) && !(PLACE.active && PLACE.active.b === b)) b.draw(ctx);
  PLACE.draw(ctx);
  // overlays
  for (const b of G.buildings) if (vis(b.x)) b.drawOver(ctx);
  if (CAM.zoomN > 0.3) for (const f of G.followers) if (vis(f.x)) f.drawOver(ctx);
  for (const p of G.fx) if (p instanceof FloatText && vis(p.x)) p.draw(ctx);
  // screen space
  ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  if (G.flash > 0) { ctx.fillStyle = `rgba(220,230,255,${G.flash * 0.5})`; ctx.fillRect(0, 0, G.W, G.H); }
  drawIndicators(ctx);
  INPUT.drawCharge(ctx);
}

// arrows at the screen edge pointing to things that need attention
function drawIndicators(ctx) {
  const marks = [];
  const sh = SHRINE();
  if (sh && sh.rise < 1 && GAME.tut >= 1) marks.push({ x: sh.x, y: sh.gy + 60, label: 'Shrine', icon: null, color: '#ffe36a', pulse: true });
  for (const f of G.followers) {
    if (f.state === 'gone') continue;
    if (f.skel) marks.push({ x: f.x, y: f.gy + 50, icon: 'skellyportrait', color: '#ff7a6b' });
    else if (!f.believer) marks.push({ x: f.x, y: f.gy + 50, icon: 'DesireIcon' + f.desire[0].toUpperCase() + f.desire.slice(1), color: '#fff' });
  }
  for (const m of marks) {
    const p = CAM.toScreen(m.x, m.y);
    const pad = 46;
    const inView = p.x > 0 && p.x < G.W && p.y > 70 && p.y < G.H - 70;
    if (inView) {
      if (m.pulse) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.4 + 0.3 * Math.sin(G.t * 4);
        const r = 60 * CAM.zoom + 20;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, 'rgba(255,240,150,.9)'); g.addColorStop(1, 'rgba(255,240,150,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
        ctx.restore();
      }
      continue;
    }
    if (CAM.zoomN < 0.3) continue;
    const cx = G.W / 2, cy = G.H / 2;
    const a = Math.atan2(p.y - cy, p.x - cx);
    const ex = clamp(cx + Math.cos(a) * G.W, pad, G.W - pad), ey = clamp(cy + Math.sin(a) * G.H, pad + 40, G.H - 110);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.fillStyle = 'rgba(16,30,66,.72)';
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.fill();
    ctx.rotate(a);
    ctx.fillStyle = m.color;
    ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(20, -8); ctx.lineTo(20, 8); ctx.closePath(); ctx.fill();
    ctx.rotate(-a);
    if (m.icon && UIIMG[m.icon] && UIIMG[m.icon].complete) ctx.drawImage(UIIMG[m.icon], -15, -15, 30, 30);
    else { ctx.fillStyle = m.color; ctx.font = '700 11px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(m.label || '!', 0, 4); }
    ctx.restore();
  }
}

let last = 0;
function frame(ts) {
  const t = ts / 1000;
  const dt = Math.min(G.dtCap || 0.05, last ? t - last : 0.016);
  last = t;
  if (!G.paused && G.running) update(dt);
  else { G.t += dt; CAM.update(dt); if (!G.running) for (const c of G.clouds) c.update(dt); UI.update(); }
  render();
  requestAnimationFrame(frame);
}

// ---------- boot ----------
async function boot() {
  resize();
  UI.init();
  INPUT.init(cv);
  const bar = document.querySelector('#loadbar b');
  await loadAssets(p => { bar.style.width = (p * 100) + '%'; });
  initBackgrounds(D.planet.ents);
  // title screen: show the planet slowly turning behind the logo
  GAME.newGame(true);
  CAM.zoom = CAM.minZ() * 1.25;
  G.running = false;
  G.titleSpin = true;
  document.getElementById('loading').hidden = true;
  const title = document.getElementById('title');
  title.hidden = false; document.body.classList.add('at-title');
  const has = SAVE.exists();
  document.getElementById('t-continue').hidden = !has;
  document.getElementById('t-new').textContent = has ? 'New planet' : 'Play';
  const start = (load) => {
    SFX.init(); if (SFX.ctx && SFX.ctx.state === 'suspended') SFX.ctx.resume();
    if (!(load && SAVE.load())) GAME.newGame();
    title.hidden = true; document.body.classList.remove('at-title'); G.titleSpin = false; G.running = true;
    CAM.zoom = CAM.minZ(); CAM.tz = CAM.defZ();
    SFX.play('motif', 0.7);
    AMB.sync();
    UI.goalsBadge();
  };
  document.getElementById('t-continue').onclick = () => start(true);
  document.getElementById('t-new').onclick = () => {
    if (has && !document.getElementById('t-new').dataset.sure) { const b = document.getElementById('t-new'); b.dataset.sure = 1; b.textContent = 'Tap again to replace your planet'; return; }
    SAVE.clear(); start(false);
  };
  document.getElementById('t-credits').onclick = () => UI.credits();
  requestAnimationFrame(frame);
  setInterval(() => { if (G.titleSpin) CAM.x = wrapX(CAM.x + 0.8); }, 16);
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.running) SAVE.save(); });
  window.addEventListener('pagehide', () => { if (G.running) SAVE.save(); });
}
boot();
