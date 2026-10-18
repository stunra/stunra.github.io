'use strict';
// ---------- pointer / touch input ----------
const INPUT = {
  ptrs: new Map(),
  mode: null, // 'pan' | 'follower' | 'cloud' | 'sun' | 'charge' | 'place' | 'pinch' | 'pending'
  p: null,
  lastTap: 0,
  init(cv) {
    cv.addEventListener('pointerdown', e => this.down(e));
    window.addEventListener('pointermove', e => this.move(e));
    window.addEventListener('pointerup', e => this.up(e));
    window.addEventListener('pointercancel', e => this.up(e, true));
    cv.addEventListener('wheel', e => { e.preventDefault(); CAM.tz = null; CAM.zoom *= Math.exp(-e.deltaY * 0.0015); }, { passive: false });
    cv.addEventListener('contextmenu', e => e.preventDefault());
  },
  down(e) {
    SFX.init();
    if (SFX.ctx && SFX.ctx.state === 'suspended') SFX.ctx.resume();
    if (G.paused) return;
    e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId);
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.ptrs.size === 2) {
      // pinch zoom takes over
      this.cancelCurrent();
      const [a, b] = [...this.ptrs.values()];
      this.mode = 'pinch'; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: CAM.zoom };
      return;
    }
    if (this.ptrs.size > 2) return;
    const sx = e.clientX, sy = e.clientY;
    const w = CAM.toWorld(sx, sy);
    this.p = { id: e.pointerId, sx, sy, x: sx, y: sy, t0: now(), w, moved: false, hist: [[sx, sy, now()]] };
    UI.closeTip();
    // placement drag
    if (PLACE.active) { this.mode = 'place'; this.p.offset = dX(w.x, PLACE.active.x); return; }
    // hit test, front to back
    const gold = G.golds.find(g => !g.dead && g.hit(w.x, w.y));
    if (gold) { gold.collect(); this.mode = 'none'; return; }
    const fol = [...G.followers].reverse().find(f => f.state !== 'gone' && f.state !== 'dead' && f.hit(w.x, w.y));
    if (fol) { this.mode = 'pending'; this.p.target = fol; this.p.kind = 'follower'; return; }
    const cl = [...G.clouds].reverse().find(c => c.hit(w.x, w.y));
    if (cl) { this.mode = 'pending'; this.p.target = cl; this.p.kind = cl.storm ? 'lightning' : 'rain'; this.startCharge(); return; }
    if (SUN.hit(w.x, w.y)) { this.mode = 'pending'; this.p.target = SUN; this.p.kind = 'sun'; this.startCharge(); return; }
    const gr = G.graves.find(g => !g.dead && g.hit(w.x, w.y));
    if (gr) { this.mode = 'pending'; this.p.target = gr; this.p.kind = 'resurrect'; this.startCharge(); return; }
    const b = [...G.buildings].reverse().find(b => !b.dead && b.rise >= 1 && b.hit(w.x, w.y, 4));
    if (b) { this.mode = 'pending'; this.p.target = b; this.p.kind = 'move'; this.startCharge(); return; }
    const br = G.ents.find(en => en instanceof Breakable && !en.dead && en.hit(w.x, w.y));
    if (br) { this.mode = 'pending'; this.p.target = br; this.p.kind = 'breakable'; return; }
    const gh = LAND.hAt(w.x);
    if (w.y < gh + 6 && w.y > gh - 260 && CAM.zoomN > 0.35) { this.mode = 'pending'; this.p.target = { x: w.x }; this.p.kind = 'terrain'; this.startCharge(); return; }
    this.mode = 'pan'; this.p.camX = CAM.x; this.p.ang = this.angleAt(sx, sy); CAM.vx = 0; CAM.tx = null;
  },
  angleAt(sx, sy) { const pc = CAM.toScreen(0, -R0); return Math.atan2(sx - pc.x, -(sy - pc.y)); },
  startCharge() {
    const k = this.p.kind;
    if (k === 'move' && !PLAYER.has('MovementWonder1')) { this.p.noCharge = true; return; }
    if (k === 'resurrect' && !PLAYER.has('ResurrectionWonder1')) { this.p.noCharge = true; return; }
    if (k === 'terrain' && !PLAYER.has('TerrainWonder1')) { this.p.noCharge = true; return; }
    if ((k === 'sun' || k === 'lightning' || k === 'rain') && WONDER.maxLevel(k) === 0) { this.p.noCharge = true; return; }
    this.p.chargeDelay = 0.18; // short delay so quick drags still move clouds
  },
  move(e) {
    const pt = this.ptrs.get(e.pointerId);
    if (pt) { pt.x = e.clientX; pt.y = e.clientY; }
    if (this.mode === 'pinch') {
      if (this.ptrs.size < 2) return;
      const [a, b] = [...this.ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      CAM.tz = null; CAM.zoom = this.pinch.z * d / this.pinch.d;
      return;
    }
    const p = this.p;
    if (!p || p.id !== e.pointerId) { UI.hover(e.clientX, e.clientY); return; }
    p.x = e.clientX; p.y = e.clientY;
    p.hist.push([p.x, p.y, now()]); if (p.hist.length > 8) p.hist.shift();
    const dist = Math.hypot(p.x - p.sx, p.y - p.sy);
    if (dist > 9) p.moved = true;
    const w = CAM.toWorld(p.x, p.y);
    switch (this.mode) {
      case 'pan': {
        const a = this.angleAt(p.x, p.y);
        let d = a - p.ang; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
        CAM.x = wrapX(p.camX - d / TAU * C);
        break;
      }
      case 'place': PLACE.move(w.x + p.offset); this.edgeScroll(p.x); break;
      case 'pending': {
        if (WONDER.ch) {
          // charging: once charged, a flick in the right direction fires
          const c = WONDER.ch;
          if (c.ready) {
            const dx = p.x - (p.cx != null ? p.cx : p.sx), dy = p.y - (p.cy != null ? p.cy : p.sy);
            const need = 38;
            let fire = false;
            if (c.kind === 'rain') fire = dy > need;
            else if (c.kind === 'sun') fire = c.level > 1 ? Math.hypot(dx, dy) > need : dy > need;
            else if (c.kind === 'lightning') fire = Math.hypot(dx, dy) > need;
            else if (c.kind === 'terrain') fire = Math.abs(dy) > need;
            else if (c.kind === 'move') fire = dy < -need || Math.hypot(dx, dy) > need;
            else if (c.kind === 'resurrect') fire = false;
            if (fire) { WONDER.release(dx, dy, w.x, w.y); this.mode = c.kind === 'move' ? 'place' : 'none'; if (this.mode === 'place') p.offset = 0; }
          } else if (p.moved && c.t < WONDER.CHARGE * 0.75) {
            // moved before charging: this is a drag
            WONDER.cancel();
            this.beginDrag();
          }
        } else if (p.moved) this.beginDrag();
        break;
      }
      case 'follower': {
        const f = p.target;
        const vx = (p.x - (p.lx || p.x));
        p.lx = p.x;
        f.swingV += vx * 0.02;
        const gy = LAND.hAt(w.x);
        f.x = w.x;
        f.y = Math.max(0, w.y - 70 - gy);
        this.edgeScroll(p.x);
        break;
      }
      case 'cloud': {
        const c = p.target;
        c.x = wrapX(w.x + p.offset);
        c.y = clamp(w.y - p.offY, LAND.hAt(c.x) + 200, LAND.hAt(c.x) + 600);
        this.edgeScroll(p.x);
        break;
      }
      case 'sun': {
        SUN.x = wrapX(w.x + p.offset);
        SUN.y = clamp(w.y - p.offY, LAND.hAt(SUN.x) + 300, 900);
        this.edgeScroll(p.x);
        break;
      }
    }
  },
  edgeScroll(sx) {
    const m = 60;
    if (sx < m) CAM.vx = -320 * (1 - sx / m) / Math.max(0.6, CAM.zoom);
    else if (sx > G.W - m) CAM.vx = 320 * (1 - (G.W - sx) / m) / Math.max(0.6, CAM.zoom);
    else CAM.vx = 0;
  },
  beginDrag() {
    const p = this.p;
    const w = CAM.toWorld(p.x, p.y);
    if (p.kind === 'follower') {
      const f = p.target;
      if (f.state === 'arrive' || f.state === 'convert') { this.mode = 'none'; return; }
      f.pickUp(); this.mode = 'follower'; p.lx = p.x;
      HINT.clear('TutorialDropFollowerOnShrine');
      STATS.add('pickups', 1);
      return;
    }
    if (p.kind === 'rain' || p.kind === 'lightning') { this.mode = 'cloud'; p.offset = dX(w.x, p.target.x); p.offY = w.y - p.target.y; p.target.drag = true; SFX.play('cloudMove3', 0.35); HINT.clear('TutorialCloudMove'); return; }
    if (p.kind === 'sun') { if (!PLAYER.has('SunWonder1')) { this.toPan(); return; } this.mode = 'sun'; p.offset = dX(w.x, SUN.x); p.offY = w.y - SUN.y; return; }
    this.toPan();
  },
  toPan() { const p = this.p; this.mode = 'pan'; p.camX = CAM.x; p.ang = this.angleAt(p.x, p.y); },
  cancelCurrent() {
    if (this.mode === 'follower' && this.p) this.dropFollower(0, 0);
    if (this.mode === 'cloud' && this.p) this.p.target.drag = false;
    WONDER.cancel();
    this.mode = null; this.p = null;
  },
  dropFollower(vx, vy) {
    const f = this.p.target;
    f.state = 'air'; f.air = true;
    // convert screen-space flick velocity to world tangential/vertical (rough: rotate into local frame)
    const th = (f.x / C) * TAU - CAM.angle();
    const c = Math.cos(th), s = Math.sin(th);
    const lx = (vx * c + vy * s) / CAM.zoom, ly = (-vx * s + vy * c) / CAM.zoom;
    f.vx = clamp(lx, -1400, 1400); f.vy = clamp(-ly, -1400, 1600);
    f.seq([['missile', true]]);
    const sp = Math.hypot(f.vx, f.vy);
    if (sp > 900) { SFX.play(SND.scared, 0.7); STATS.add('throws', 1); }
  },
  flickVel() {
    const h = this.p.hist; if (h.length < 2) return [0, 0];
    const a = h[0], b = h[h.length - 1]; const dt = Math.max(0.016, b[2] - a[2]);
    if (now() - b[2] > 0.12) return [0, 0];
    return [(b[0] - a[0]) / dt, (b[1] - a[1]) / dt];
  },
  up(e, cancel = false) {
    this.ptrs.delete(e.pointerId);
    if (this.mode === 'pinch') { if (this.ptrs.size === 0) this.mode = null; return; }
    const p = this.p;
    if (!p || p.id !== e.pointerId) return;
    CAM.vx = 0;
    const tapped = !p.moved && now() - p.t0 < 0.35;
    switch (this.mode) {
      case 'pan': {
        const [vx] = this.flickVel();
        if (Math.abs(vx) > 200 && !cancel) CAM.vx = -vx / CAM.zoom * 0.6;
        if (tapped) {
          if (now() - this.lastTap < 0.32) { CAM.tz = CAM.zoomN > 0.6 ? CAM.minZ() : CAM.defZ(); this.lastTap = 0; }
          else this.lastTap = now();
        }
        break;
      }
      case 'follower': { const [vx, vy] = this.flickVel(); this.dropFollower(vx * 0.9, vy * 0.9); break; }
      case 'cloud': p.target.drag = false; break;
      case 'pending': {
        const c = WONDER.ch;
        if (c && c.ready && !cancel) {
          // released while charged without a flick: still fire (straight down / default)
          if (c.kind === 'move') { WONDER.release(0, -50, 0, 0); }
          else WONDER.release(0, c.kind === 'terrain' ? -50 : 50, 0, 0);
        } else {
          WONDER.cancel();
          if (tapped) this.tap(p);
        }
        break;
      }
    }
    if (this.mode === 'place') { /* stays in placement mode */ }
    this.mode = null; this.p = null;
  },
  tap(p) {
    const t = p.target;
    switch (p.kind) {
      case 'follower': UI.followerTip(t); break;
      case 'rain': t.squash = 1; SFX.play('cloudMove3', 0.3); if (!HINT.seen.TutorialCloudPressAndHold) HINT.show('TutorialCloudPressAndHold'); else UI.toast(t.storm ? STR('TutorialLightningWonder1History') : STR('TutorialRainWonder1History')); break;
      case 'lightning': t.squash = 1; UI.toast(WONDER.maxLevel('lightning') ? STR('TutorialLightningWonder1History') : 'Lightning unlocks at level ' + D.cfg.LevelUnlocks.LightningWonder1.UnlockLevel); break;
      case 'sun': UI.toast(PLAYER.has('SunWonder1') ? STR('TutorialSunWonder1History') : 'Sunshine unlocks at level ' + D.cfg.LevelUnlocks.SunWonder1.UnlockLevel); break;
      case 'resurrect': UI.toast(STR('ToolTipGrave').replace('[NAME]', t.f.name).replace(/Born.*$/, '') + ' — ' + (PLAYER.has('ResurrectionWonder1') ? STR('HintResurrection') : 'Resurrection unlocks at level 2')); break;
      case 'move': UI.buildingPanel(t); break;
      case 'breakable': t.shake = 0.4; UI.toast(STR('ObjectiveBreakFirstChest')); break;
    }
  },
  update(dt) {
    const p = this.p;
    if (p && this.mode === 'pending' && !p.noCharge && !p.moved && !WONDER.ch) {
      p.chargeDelay -= dt;
      if (p.chargeDelay <= 0) {
        if (WONDER.begin(p.kind, p.target, p.sx, p.sy)) { WONDER.ch.t = 0.18; }
        else p.noCharge = true;
      }
    }
    if (WONDER.ch && p) {
      // remember where the finger was when the charge completed, so the flick is measured from there
      if (WONDER.ch.ready && p.cx == null) { p.cx = p.x; p.cy = p.y; }
    }
    if (this.mode === 'follower' && p) {
      const w = CAM.toWorld(p.x, p.y);
      p.target.x = w.x; p.target.y = Math.max(0, w.y - 70 - LAND.hAt(w.x));
    }
  },
  drawCharge(ctx) {
    const c = WONDER.ch, p = this.p;
    if (!c || !p) return;
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    const x = p.sx, y = p.sy;
    const maxL = WONDER.maxLevel(c.kind);
    const prog = clamp(c.t / (WONDER.CHARGE * maxL), 0, 1);
    ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(10,20,50,.45)';
    ctx.beginPath(); ctx.arc(x, y, 44, 0, TAU); ctx.stroke();
    ctx.strokeStyle = c.level >= 2 ? '#ff9f43' : c.level ? '#7cf3ff' : '#fff';
    ctx.beginPath(); ctx.arc(x, y, 44, -Math.PI / 2, -Math.PI / 2 + TAU * prog); ctx.stroke();
    for (let i = 1; i < maxL; i++) { const a = -Math.PI / 2 + TAU * i / maxL; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 44, y + Math.sin(a) * 44, 4, 0, TAU); ctx.fill(); }
    const W = WONDERS[c.kind];
    const im = UIIMG[W.icon];
    if (im && im.complete) { ctx.globalAlpha = c.level ? 1 : 0.6; ctx.drawImage(im, x - 26, y - 26 - 80, 52, 52); ctx.globalAlpha = 1; }
    const lv = Math.max(1, c.level);
    const name = W.name[lv - 1];
    const cost = MANACOST[c.kind][lv - 1];
    ctx.font = '700 15px Fredoka, sans-serif'; ctx.textAlign = 'center';
    const txt = c.level ? (cost ? `${name} · ${cost} mana` : name) : 'charging…';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,20,50,.8)'; ctx.strokeText(txt, x, y + 66);
    ctx.fillStyle = '#fff'; ctx.fillText(txt, x, y + 66);
    if (c.ready) {
      const arrow = c.kind === 'rain' || (c.kind === 'sun' && c.level === 1) ? '↓ flick down' : c.kind === 'terrain' ? '↑ raise · ↓ lower' : c.kind === 'move' ? '↑ lift' : c.kind === 'resurrect' ? 'release' : 'flick to aim';
      ctx.font = '600 13px Fredoka, sans-serif';
      ctx.strokeText(arrow, x, y + 84); ctx.fillStyle = '#ffe36a'; ctx.fillText(arrow, x, y + 84);
    }
  },
};
