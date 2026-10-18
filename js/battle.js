'use strict';
// ===== バトル進行 =====
const ZERO_RAW = { x: 0, y: 0 };
const VIEW_H = 600; // ズーム1の時に見える世界の高さ

class Battle {
  constructor(cfg, opt = {}) {
    this.cfg = cfg;
    this.quality = opt.quality || 'high';
    this.shakeOn = opt.shake !== false;
    this.silent = !!opt.silent;
    this.demo = !!opt.demo;
    this.stage = new Stage(STAGES.find((s) => s.id === cfg.stage) || STAGES[0], this.quality);
    this.fx = new FX(this);
    this.projectiles = [];
    this.frame = 0;
    const stocks = cfg.stocks === 0 ? Infinity : cfg.stocks;
    this.fighters = cfg.players.map((p) => {
      const c = CHARS.find((ch) => ch.id === p.char);
      return new Fighter(this, p.slot, c, p.pal || 0, p.source, { level: p.level, stocks: cfg.time > 0 && !cfg.stocks ? Infinity : stocks });
    });
    const sp = this.stage.spawns;
    this.fighters.forEach((f, i) => {
      const s = sp[i % sp.length];
      f.spawn(s[0], s[1], s[0] < 0 ? 1 : -1);
    });
    this.cam = { x: 0, y: -160, zoom: 0.9 };
    this.shakeAmt = 0; this.shx = 0; this.shy = 0;
    this.phase = this.demo ? 'play' : 'countdown'; this.phaseT = 0;
    this.timeLeft = cfg.time > 0 ? cfg.time * 60 * 60 : 0;
    this.slowmo = 0; this.flashA = 0; this.flashCol = '#fff'; this.killZoom = null;
    this.starKOs = []; this.elimOrder = []; this.koFeed = [];
    this.hudShake = new Map();
    this.onEnd = null; this.ended = false; this.paused = false;
    this._hbA = []; this._hbB = [];
    if (!this.silent) Snd.playBgm(this.stage.def.bgm);
  }
  sfx(n, p) { if (!this.silent) Snd.play(n, p); }
  shake(a) { if (this.shakeOn) this.shakeAmt = Math.max(this.shakeAmt, a); }
  hitstop() { /* 個別のヒットストップで表現 */ }

  // ---------- 更新 ----------
  update() {
    if (this.paused) return;
    if (this.slowmo > 0) {
      this.slowmo--;
      if (this.slowmo % 3 !== 0) { this.updateCamera(); return; }
    }
    this.step();
  }
  step() {
    this.frame++; this.phaseT++;
    if (this.phase === 'countdown') {
      if (this.phaseT % 60 === 1 && this.phaseT < 180) this.sfx('count');
      if (this.phaseT >= 180) { this.phase = 'play'; this.phaseT = 0; this.sfx('go'); }
    }
    const live = this.phase === 'play';
    for (const f of this.fighters) {
      let raw = ZERO_RAW;
      if (live) raw = f.ai ? f.ai.think() : f.source.read();
      f.inp.update(raw);
    }
    this.stage.update();
    for (const f of this.fighters) f.update();
    for (const f of this.fighters) if (f.state === 'hold' && f.holding) f.positionHeld();
    this.detectHits();
    this.updateProjectiles();
    this.checkBlast();
    this.fx.update();
    for (let i = this.starKOs.length - 1; i >= 0; i--) if (++this.starKOs[i].t > 70) this.starKOs.splice(i, 1);
    for (const [f, v] of this.hudShake) { if (v <= 0.2) this.hudShake.delete(f); else this.hudShake.set(f, v * 0.85); }
    if (this.koFeed.length && this.frame - this.koFeed[0].frame > 180) this.koFeed.shift();
    this.updateCamera();
    if (live && this.timeLeft > 0) {
      this.timeLeft--;
      if (this.timeLeft <= 600 && this.timeLeft % 60 === 0) this.sfx('count');
      if (this.timeLeft === 0) this.endGame('time');
    }
    if (this.phase === 'end' && this.phaseT > 170 && !this.ended) {
      this.ended = true;
      if (this.onEnd) this.onEnd(this.results());
    }
    if (this.demo) this.demoTick();
  }
  demoTick() {
    // タイトル画面のデモ：倒れたら自動で補充
    for (const f of this.fighters) if (f.eliminated) { f.eliminated = false; f.stocks = 3; f.respawn(); }
  }

  // ---------- 当たり判定 ----------
  detectHits() {
    const F = this.fighters;
    const lists = F.map((f) => f.activeHitboxes(f._hbs || (f._hbs = [])));
    // 相殺（地上技同士）
    for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
      const A = F[i], B = F[j], la = lists[i], lb = lists[j];
      if (!la.length || !lb.length || !A.grounded || !B.grounded) continue;
      if (A.move.kind === 'grab' || B.move.kind === 'grab' || A.move.kind === 'special' || B.move.kind === 'special') continue;
      if (!A.canHitAgain(B, la[0].hb) || !B.canHitAgain(A, lb[0].hb)) continue;
      let hit = null;
      for (const a of la) for (const b of lb) if (!hit && Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) hit = [a, b];
      if (!hit) continue;
      const da = hit[0].hb.dmg, db = hit[1].hb.dmg;
      const mx = (hit[0].x + hit[1].x) / 2, my = (hit[0].y + hit[1].y) / 2;
      for (const h of la) A.markHit(B, h.hb);
      for (const h of lb) B.markHit(A, h.hb);
      if (da - db < 9) this.rebound(A);
      if (db - da < 9) this.rebound(B);
      this.fx.hitSpark(mx, my, 6, { c1: '#ffffff', c2: '#a0c8ff' }, 1);
      this.sfx('clank');
      A.hitlag = B.hitlag = 6;
      lists[i] = []; lists[j] = [];
    }
    for (let i = 0; i < F.length; i++) {
      const A = F[i], hbs = lists[i];
      if (!hbs.length) continue;
      for (const T of F) {
        if (T === A || !T.alive || T.state === 'respawn' || T === A.holding) continue;
        if (A.state !== 'attack') break;
        const hurt = T.hurtbox();
        for (const h of hbs) {
          if (!A.canHitAgain(T, h.hb)) continue;
          const d = distPointSeg(h.x, h.y, hurt.ax, hurt.ay, hurt.bx, hurt.by);
          if (d > h.r + hurt.r) continue;
          if (T.isIntangible()) break;
          A.markHit(T, h.hb);
          if (h.hb.grab) {
            if ((T.grounded || T.isShielding()) && T.state !== 'grabbed' && T.state !== 'hold') { A.grabSuccess(T); }
            break;
          }
          const m = A.move;
          let dir = A.facing;
          if ((h.hb.at === 'center' || h.hb.at === 'head') && sign(T.x - A.x) === -A.facing && typeof h.hb.ang === 'number' && h.hb.ang < 120) dir = -A.facing;
          const chargeMul = m.charge ? 1 + (A.charge / 60) * 0.4 : 1;
          const stale = A.hitThisMove ? A.lastStale : A.staleMul(m.name);
          const hx = lerp(h.x, (hurt.ax + hurt.bx) / 2, 0.35), hy = lerp(h.y, (hurt.ay + hurt.by) / 2, 0.35);
          const res = T.receiveHit(A, h.hb, { x: hx, y: hy, dir, mul: chargeMul * stale, smash: m.kind === 'smash' });
          if (res !== 'miss') {
            if (!A.hitThisMove) { A.hitThisMove = true; A.lastStale = stale; A.pushStale(m.name); }
            if (m.stopOnHit && A.move === m && A.moveFrame < m.stopOnHit) A.moveFrame = m.stopOnHit;
          }
          break;
        }
        if (A.state !== 'attack') break;
      }
    }
  }
  rebound(f) {
    if (f.state !== 'attack') return;
    f.setState('rebound'); f.vx = -f.facing * 3;
  }
  updateProjectiles() {
    const P = this.projectiles;
    for (const p of P) if (!p.dead) p.update(this);
    // 飛び道具同士
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const a = P[i], b = P[j];
      if (a.dead || b.dead || a.owner === b.owner) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) {
        if (a.dmg - b.dmg < 8) a.die(this, true);
        if (b.dmg - a.dmg < 8) b.die(this, true);
        this.sfx('clank');
      }
    }
    for (const p of P) {
      if (p.dead) continue;
      // 打撃で打ち消し
      for (const A of this.fighters) {
        if (A === p.owner || !A._hbs || !A._hbs.length) continue;
        for (const h of A._hbs) if (!h.hb.grab && Math.hypot(h.x - p.x, h.y - p.y) < h.r + p.r && h.hb.dmg >= p.dmg - 2) { p.die(this, true); break; }
        if (p.dead) break;
      }
      if (p.dead) continue;
      for (const T of this.fighters) {
        if (T === p.owner || !T.alive || T.state === 'respawn' || p.hit.has(T)) continue;
        const hurt = T.hurtbox();
        const d = distPointSeg(p.x, p.y, hurt.ax, hurt.ay, hurt.bx, hurt.by);
        if (d > p.r + hurt.r) continue;
        if (T.reflectActive()) {
          p.reflect(T); this.sfx('reflect');
          this.fx.emit('flash', p.x, p.y, { r: 30, col: '#bff6ff' });
          continue;
        }
        if (T.isIntangible()) continue;
        p.hit.add(T);
        const res = T.receiveHit(p.owner, p, { x: p.x, y: p.y, dir: sign(p.vx) || p.dir, proj: true, src: p });
        if (res !== 'miss' && !p.def.pierce) { p.dead = true; break; }
      }
    }
    for (let i = P.length - 1; i >= 0; i--) if (P[i].dead) P.splice(i, 1);
  }

  // ---------- ヒット演出 ----------
  onHitFX(victim, atk, x, y, dmg, kb, el, dir, kill) {
    const big = kb > 115 || kill;
    this.fx.hitSpark(x, y, dmg, el, dir, big);
    if (kill) this.sfx('smashhit');
    else this.sfx(dmg < 6 ? 'hit1' : dmg < 12 ? 'hit2' : 'hit3', 0.9 + Math.random() * 0.2);
    if (el.snd === 'slash' && dmg >= 4) this.sfx('slash');
    if (el === EL.elec) this.sfx('zap');
    if (dmg >= 6) this.shake(Math.min(2 + dmg * 0.55, 13));
    if (kill) {
      this.shake(20); this.flashA = 0.3; this.flashCol = '#ffffff';
      this.killZoom = { f: victim, t: victim.hitlag + 8 };
      const remain = this.fighters.filter((f) => f.stocks > 0 && !f.eliminated).length;
      if (victim.stocks === 1 && remain <= 2 && !this.demo) this.slowmo = 60;
    }
  }
  onDamage(f, dmg) { this.hudShake.set(f, Math.min(14, 3 + dmg)); }
  onCombo(atk, victim, n) {
    if (n === 3 || n === 5 || n === 8 || n >= 10) this.fx.text(victim.x, victim.y - 110 * victim.scale, `${n} HIT!`, '#ffe14a', 22 + Math.min(n, 10) * 1.2);
  }
  predictKill(v, kb, ang) {
    const b = this.stage.blast;
    let x = v.x, y = v.y - 40, sp = kb * KB_SPEED;
    let kvx = Math.cos(ang) * sp, kvy = Math.sin(ang) * sp, vy = 0;
    if (v.grounded && kvy > 0) kvy = kb > 60 ? -kvy * 0.75 : 0;
    const g = v.st.grav, fall = v.st.fall;
    for (let i = 0; i < 200; i++) {
      x += kvx; y += kvy + vy;
      vy = Math.min(vy + g, fall);
      const m = Math.hypot(kvx, kvy), nm = Math.max(0, m - KB_DECAY);
      if (m > 0) { kvx *= nm / m; kvy *= nm / m; }
      if (x < b.l || x > b.r || y < b.t || y > b.b) return true;
      if (this.stage.solidAt(x, y + 40)) return false;
      if (nm === 0 && i > kb * 0.4) return false;
    }
    return false;
  }

  // ---------- 撃墜 ----------
  checkBlast() {
    const b = this.stage.blast;
    for (const f of this.fighters) {
      if (!f.alive || f.state === 'respawn' || f.state === 'dead') continue;
      if (f.x < b.l || f.x > b.r || f.y > b.b || f.y < b.t) this.ko(f);
    }
  }
  ko(f) {
    const b = this.stage.blast;
    const side = f.x < b.l ? 'l' : f.x > b.r ? 'r' : f.y < b.t ? 't' : 'b';
    const k = f.lastHitBy && this.frame - f.lastHitFrame < 600 && f.lastHitBy !== f ? f.lastHitBy : null;
    if (k) k.stats.kos++; else f.stats.sds++;
    const v = this.viewRect();
    const x = clamp(f.x, v.l + 10, v.r - 10), y = clamp(f.y - 40, v.t + 10, v.b - 10);
    const ang = side === 'l' ? 0 : side === 'r' ? Math.PI : side === 't' ? Math.PI / 2 : -Math.PI / 2;
    if (side === 't' && Math.random() < 0.45) {
      this.starKOs.push({ f, char: f.char, pal: f.pal, x: f.x, t: 0, sx: (Math.random() - 0.5) * 2 });
      this.sfx('star');
    } else {
      this.fx.koBlast(x, y, ang, f.color);
      this.sfx('ko'); this.shake(18);
      this.flashA = Math.max(this.flashA, 0.3); this.flashCol = f.color;
    }
    this.koFeed.push({ frame: this.frame, victim: f, by: k });
    f.kill();
    if (f.stocks <= 0) { f.elimFrame = this.frame; this.elimOrder.push(f); }
    // 決着判定
    if (!this.demo && this.phase === 'play') {
      const left = this.fighters.filter((o) => o.stocks > 0);
      if (left.length <= 1 && this.fighters.length > 1) this.endGame('stock');
    }
  }
  endGame(why) {
    if (this.phase === 'end') return;
    this.phase = 'end'; this.phaseT = 0; this.endWhy = why;
    this.sfx('game');
    if (why === 'stock' && this.slowmo <= 0) this.slowmo = 40;
  }
  results() {
    const F = this.fighters;
    let order;
    if (this.endWhy === 'time' || !isFinite(F[0].stocks + 0) && this.endWhy !== 'stock') {
      const sc = (f) => (isFinite(f.stocks) && this.cfg.stocks ? f.stocks * 1000 : 0) + (f.stats.kos - f.stats.falls - f.stats.sds) * 10 - f.percent * 0.001;
      order = [...F].sort((a, b) => sc(b) - sc(a));
    } else {
      const alive = F.filter((f) => f.stocks > 0);
      order = [...alive, ...[...this.elimOrder].reverse()];
      for (const f of F) if (!order.includes(f)) order.push(f);
    }
    return { order, why: this.endWhy, cfg: this.cfg };
  }

  // ---------- カメラ ----------
  viewSize() { return { w: this.vw || 1067, h: VIEW_H }; }
  viewRect() {
    const c = this.cam, vs = this.viewSize();
    const hw = vs.w / 2 / c.zoom, hh = vs.h / 2 / c.zoom;
    return { l: c.x - hw, r: c.x + hw, t: c.y - hh, b: c.y + hh };
  }
  updateCamera() {
    const vs = this.viewSize();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, n = 0;
    const sb = this.stage.blast;
    for (const f of this.fighters) {
      if (!f.alive || f.state === 'dead') continue;
      const fx = clamp(f.x, sb.l + 100, sb.r - 100), fy = clamp(f.y, sb.t + 100, sb.b - 60);
      x0 = Math.min(x0, fx); x1 = Math.max(x1, fx); y0 = Math.min(y0, fy - 80); y1 = Math.max(y1, fy); n++;
    }
    if (!n) { x0 = -200; x1 = 200; y0 = -200; y1 = 0; }
    const m = this.stage.main;
    // ステージも少し含める
    x0 = Math.min(x0, lerp(m.x1, 0, 0.55)); x1 = Math.max(x1, lerp(m.x2, 0, 0.55)); y1 = Math.max(y1, 40);
    const padX = 170, padY = 150;
    const w = x1 - x0 + padX * 2, h = y1 - y0 + padY * 2;
    let zoom = clamp(Math.min(vs.w / w, vs.h / h), 0.45, 1.25);
    let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 - 20;
    if (this.killZoom && this.killZoom.t > 0) {
      const f = this.killZoom.f;
      this.killZoom.t--;
      cx = lerp(cx, f.x, 0.6); cy = lerp(cy, f.y - 40, 0.6); zoom = Math.min(1.6, zoom * 1.45);
    }
    const k = this.killZoom && this.killZoom.t > 0 ? 0.25 : 0.075;
    this.cam.zoom += (zoom - this.cam.zoom) * k * 0.8;
    this.cam.x += (cx - this.cam.x) * k;
    this.cam.y += (cy - this.cam.y) * k;
    // 揺れ
    if (this.shakeAmt > 0.3) {
      this.shx = (Math.random() * 2 - 1) * this.shakeAmt; this.shy = (Math.random() * 2 - 1) * this.shakeAmt;
      this.shakeAmt *= 0.86;
    } else { this.shx = this.shy = 0; this.shakeAmt = 0; }
    if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - 0.04);
  }

  // ---------- 描画 ----------
  render(ctx, W, H, dpr, opt = {}) {
    const base = H / VIEW_H;
    this.vw = W / base;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.stage.drawBg(ctx, this.cam, W, H, base);
    const z = this.cam.zoom * base;
    ctx.setTransform(z, 0, 0, z, W / 2 - (this.cam.x - this.shx) * z, H / 2 - (this.cam.y - this.shy) * z);
    // スターKO（背景側）
    for (const s of this.starKOs) this.drawStarKO(ctx, s);
    this.stage.drawStage(ctx);
    for (const f of this.fighters) drawShadow(ctx, f, this.stage);
    this.fx.draw(ctx, 0);
    for (const f of this.fighters) if (f.state === 'respawn') this.drawRespawnPlat(ctx, f);
    const order = [...this.fighters].sort((a, b) => (a.state === 'attack') - (b.state === 'attack'));
    for (const f of order) {
      if (!f.alive || f.state === 'dead') continue;
      drawTrail(ctx, f);
      drawFighter(ctx, f);
      drawShield(ctx, f); drawReflector(ctx, f); drawCounterAura(ctx, f); drawChargeGlow(ctx, f);
    }
    for (const p of this.projectiles) p.draw(ctx, this.frame);
    this.fx.draw(ctx, 1);
    this.fx.drawTexts(ctx);
    if (!this.demo) for (const f of this.fighters) this.drawTag(ctx, f);
    if (opt.debug) this.drawDebug(ctx);
    // スクリーン座標
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.flashA > 0) { ctx.globalAlpha = this.flashA; ctx.fillStyle = this.flashCol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if (!this.demo) {
      this.drawOffscreen(ctx, W, H, base);
      this.drawHUD(ctx, W, H, dpr);
      this.drawBanner(ctx, W, H, dpr);
    }
  }
  drawRespawnPlat(ctx, f) {
    const y = f.y + 2, x = f.x;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, 60, f.color, 0.5);
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.strokeStyle = f.color; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(x, y + 4, 48, 10, 0, 0, TAU); ctx.fill(); ctx.stroke();
  }
  drawStarKO(ctx, s) {
    const k = s.t / 70;
    const v = this.viewRect();
    const x = lerp(s.x, s.x + s.sx * 200, k), y = lerp(v.t + 60, v.t + 200, k);
    ctx.save();
    ctx.translate(x, y);
    if (k < 0.75) {
      const sc = (1 - k) * 0.5; ctx.scale(sc, sc); ctx.rotate(k * 20);
      ctx.fillStyle = s.pal.main; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(0, 0, 40, 0, TAU); ctx.fill(); ctx.stroke();
    } else {
      const r = 30 * (1 - (k - 0.75) * 4) + 6;
      ctx.fillStyle = '#fff6a0';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, rr = i % 2 ? r * 0.4 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  drawTag(ctx, f) {
    if (!f.alive || f.state === 'dead' || f.invisible) return;
    const x = f.x, y = Math.min(f.pts.head.y, f.y - 80 * f.scale) - 26 * f.scale - 8;
    const s = 1 / this.cam.zoom;
    ctx.save(); ctx.translate(x, y); ctx.scale(Math.max(1, s * 0.9), Math.max(1, s * 0.9));
    ctx.fillStyle = f.color;
    ctx.beginPath(); ctx.moveTo(-7, -2); ctx.lineTo(7, -2); ctx.lineTo(0, 7); ctx.closePath(); ctx.fill();
    ctx.font = '900 15px "Dela Gothic One", sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(f.tag, 0, -6);
    ctx.fillStyle = f.color; ctx.fillText(f.tag, 0, -6);
    ctx.restore();
  }
  drawOffscreen(ctx, W, H, base) {
    const v = this.viewRect(), z = this.cam.zoom * base;
    for (const f of this.fighters) {
      if (!f.alive || f.state === 'dead' || f.state === 'respawn') continue;
      const cy = f.y - 40 * f.scale;
      if (f.x > v.l && f.x < v.r && cy > v.t && cy < v.b) continue;
      const sx = W / 2 + (f.x - this.cam.x) * z, sy = H / 2 + (cy - this.cam.y) * z;
      const m = 40 * Math.min(1.3, base * 1.2);
      const ex = clamp(sx, m, W - m), ey = clamp(sy, m, H - m * 2.6);
      const ang = Math.atan2(sy - ey, sx - ex);
      ctx.save(); ctx.translate(ex, ey);
      ctx.fillStyle = f.color;
      ctx.beginPath(); ctx.moveTo(Math.cos(ang) * m * 1.05, Math.sin(ang) * m * 1.05);
      ctx.lineTo(Math.cos(ang + 0.5) * m * 0.7, Math.sin(ang + 0.5) * m * 0.7); ctx.lineTo(Math.cos(ang - 0.5) * m * 0.7, Math.sin(ang - 0.5) * m * 0.7); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.strokeStyle = f.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, m * 0.7, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, m * 0.66, 0, TAU); ctx.clip();
      drawPortrait(ctx, f.char, f.palIdx, 0, 4, m * 1.25);
      ctx.restore();
    }
  }
  drawHUD(ctx, W, H, dpr) {
    const n = this.fighters.length;
    const s = clamp(Math.min(W / 1280, H / 720) * 0.92, 0.45 * dpr, 1.5 * dpr);
    const cw = 210 * s, ch = 74 * s, gap = 14 * s;
    const total = n * cw + (n - 1) * gap;
    const top = Touch.active && Touch.enabled;
    let x = (W - total) / 2;
    const y = top ? 8 * s : H - ch - 10 * s;
    for (const f of this.fighters) {
      const sh = this.hudShake.get(f) || 0;
      const ox = (Math.random() - 0.5) * sh * s, oy = (Math.random() - 0.5) * sh * s;
      ctx.save(); ctx.translate(x + ox, y + oy);
      const out = f.eliminated || (f.stocks <= 0 && f.state === 'dead');
      ctx.globalAlpha = out ? 0.45 : 1;
      // 台座
      ctx.fillStyle = 'rgba(10,8,20,0.72)';
      ctx.beginPath(); ctx.moveTo(14 * s, 0); ctx.lineTo(cw, 0); ctx.lineTo(cw - 14 * s, ch); ctx.lineTo(0, ch); ctx.closePath(); ctx.fill();
      ctx.fillStyle = f.color; ctx.fillRect(14 * s, 0, cw - 14 * s, 4 * s);
      // 顔
      ctx.save();
      ctx.beginPath(); ctx.arc(38 * s, ch / 2 + 2 * s, 28 * s, 0, TAU);
      ctx.fillStyle = shade(f.pal.main, -0.5); ctx.fill();
      ctx.lineWidth = 3 * s; ctx.strokeStyle = f.color; ctx.stroke(); ctx.clip();
      drawPortrait(ctx, f.char, f.palIdx, 38 * s, ch / 2 + 6 * s, 50 * s);
      ctx.restore();
      // 名前
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.font = `700 ${Math.round(13 * s)}px "M PLUS Rounded 1c", sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.fillText(`${f.tag}  ${f.char.name}`, 74 * s, 18 * s);
      // ％
      const p = Math.floor(f.percent);
      const col = p < 40 ? '#ffffff' : p < 80 ? mixColor('#ffffff', '#ffd84a', (p - 40) / 40) : p < 120 ? mixColor('#ffd84a', '#ff7a2a', (p - 80) / 40) : p < 170 ? mixColor('#ff7a2a', '#ff2a2a', (p - 120) / 50) : mixColor('#ff2a2a', '#8a0a0a', clamp((p - 170) / 80, 0, 1));
      const isDead = f.state === 'dead';
      if (!out) {
        const sz = (isDead ? 30 : 40) * s * (1 + sh * 0.02);
        ctx.font = `900 ${Math.round(sz)}px "Dela Gothic One", sans-serif`;
        ctx.textAlign = 'right';
        ctx.lineWidth = 6 * s; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round';
        const txt = isDead ? '---' : String(p);
        ctx.strokeText(txt, cw - 44 * s, ch - 12 * s);
        ctx.fillStyle = col; ctx.fillText(txt, cw - 44 * s, ch - 12 * s);
        ctx.font = `900 ${Math.round(18 * s)}px "Dela Gothic One", sans-serif`;
        ctx.strokeText('%', cw - 24 * s, ch - 12 * s); ctx.fillText('%', cw - 24 * s, ch - 12 * s);
      } else {
        ctx.font = `900 ${Math.round(20 * s)}px "Dela Gothic One", sans-serif`; ctx.fillStyle = '#aaa'; ctx.textAlign = 'right';
        ctx.fillText('LOSE', cw - 26 * s, ch - 16 * s);
      }
      // ストック
      if (isFinite(f.stocks)) {
        const sc = Math.min(f.stocks, 6);
        for (let i = 0; i < sc; i++) {
          ctx.beginPath(); ctx.arc(80 * s + i * 13 * s, 30 * s, 5 * s, 0, TAU);
          ctx.fillStyle = f.pal.main; ctx.fill(); ctx.lineWidth = 1.5 * s; ctx.strokeStyle = '#fff'; ctx.stroke();
        }
        if (f.stocks > 6) { ctx.font = `700 ${Math.round(11 * s)}px sans-serif`; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(`×${f.stocks}`, 80 * s + 6 * 13 * s, 34 * s); }
      } else if (this.timeLeft > 0) {
        ctx.font = `700 ${Math.round(12 * s)}px sans-serif`; ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
        ctx.fillText(`撃墜 ${f.stats.kos}  落下 ${f.stats.falls}`, 74 * s, 34 * s);
      }
      ctx.restore();
      x += cw + gap;
    }
    // タイマー
    if (this.timeLeft > 0 || (this.cfg.time > 0)) {
      const t = Math.ceil(this.timeLeft / 60), mm = Math.floor(t / 60), ss = t % 60;
      ctx.font = `900 ${Math.round(30 * s)}px "Dela Gothic One", sans-serif`; ctx.textAlign = 'right';
      ctx.lineWidth = 6 * s; ctx.strokeStyle = '#000';
      const txt = `${mm}:${String(ss).padStart(2, '0')}`;
      ctx.strokeText(txt, W - 24 * s, 46 * s);
      ctx.fillStyle = t <= 10 ? '#ff5a4a' : '#fff'; ctx.fillText(txt, W - 24 * s, 46 * s);
    }
  }
  drawBanner(ctx, W, H, dpr) {
    let txt = null, k = 0, col = '#fff';
    if (this.phase === 'countdown') {
      const n = 3 - Math.floor(this.phaseT / 60);
      txt = String(n); k = (this.phaseT % 60) / 60;
    } else if (this.phase === 'play' && this.phaseT < 50 && this.frame > 60) { txt = 'GO!'; k = this.phaseT / 50; col = '#ffe14a'; }
    else if (this.phase === 'end') { txt = this.endWhy === 'time' ? 'TIME UP!' : 'GAME!'; k = Math.min(1, this.phaseT / 170) * 0.5; col = '#ff5a3a'; }
    if (!txt) return;
    const s = Math.min(W / 1280, H / 720);
    const sc = (txt.length <= 3 ? 1.6 : 1.1) * (1 + Math.max(0, 0.25 - k) * 3) * s;
    ctx.save();
    ctx.translate(W / 2, H * 0.42); ctx.scale(sc, sc); ctx.rotate(-0.06);
    ctx.globalAlpha = this.phase === 'end' ? 1 : clamp((1 - k) * 2, 0, 1);
    ctx.font = '900 130px "Dela Gothic One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 22; ctx.strokeStyle = '#000'; ctx.strokeText(txt, 0, 0);
    ctx.lineWidth = 8; ctx.strokeStyle = '#fff'; ctx.strokeText(txt, 0, 0);
    ctx.fillStyle = col; ctx.fillText(txt, 0, 0);
    ctx.restore();
  }
  drawDebug(ctx) {
    ctx.lineWidth = 1.5;
    for (const f of this.fighters) {
      if (!f.alive) continue;
      const h = f.hurtbox();
      ctx.strokeStyle = 'rgba(255,255,0,0.8)';
      ctx.beginPath(); ctx.moveTo(h.ax, h.ay); ctx.lineTo(h.bx, h.by); ctx.stroke();
      ctx.beginPath(); ctx.arc(h.ax, h.ay, h.r, 0, TAU); ctx.arc(h.bx, h.by, h.r, 0, TAU); ctx.stroke();
      for (const b of f._hbs || []) { ctx.fillStyle = b.hb.grab ? 'rgba(160,0,255,0.4)' : 'rgba(255,0,0,0.45)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); }
    }
    const b = this.stage.blast;
    ctx.strokeStyle = 'rgba(255,0,0,0.6)'; ctx.strokeRect(b.l, b.t, b.r - b.l, b.b - b.t);
  }
}
