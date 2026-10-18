'use strict';
// ===== ファイター（状態遷移・物理・攻撃） =====
const SHIELD_MAX = 50;
const KB_SPEED = 0.19;    // ふっとばし値 → 初速
const KB_DECAY = 0.34;    // ふっとび速度の減衰
const PLAYER_COLORS = ['#ff4a4a', '#3a8cff', '#ffc21a', '#3ad06a'];
const PLAYER_TAGS = ['1P', '2P', '3P', '4P'];

// 攻撃判定のワールド座標
function hbPos(pts, hb, facing, scale, ox, oy, out) {
  let x, y;
  const a = hb.at;
  if (a === 'wpn') {
    x = pts.wb.x + (pts.wt.x - pts.wb.x) * hb.t; y = pts.wb.y + (pts.wt.y - pts.wb.y) * hb.t;
  } else if (a === 'feet') { x = ox; y = oy; }
  else if (Array.isArray(a)) { x = ox + a[0] * facing * scale; y = oy + a[1] * scale; }
  else { const p = pts[a] || pts.center; x = p.x; y = p.y; }
  out.x = x + hb.off[0] * facing * scale;
  out.y = y + hb.off[1] * scale;
  return out;
}

class Fighter {
  constructor(battle, slot, char, palIdx, source, o = {}) {
    this.battle = battle; this.slot = slot; this.char = char; this.palIdx = palIdx;
    this.pal = char.pals[palIdx % char.pals.length];
    this.source = source; this.inp = new InputState();
    this.isCpu = source.type === 'cpu';
    this.ai = this.isCpu ? new AI(this, o.level ?? 5) : null;
    this.scale = char.scale; this.st = char.st; this.weight = char.weight;
    this.color = PLAYER_COLORS[slot]; this.tag = this.isCpu ? 'CP' : PLAYER_TAGS[slot];
    this.stocks = o.stocks ?? 3; this.percent = 0;
    this.stats = { kos: 0, falls: 0, sds: 0, dmg: 0, taken: 0, maxCombo: 0 };
    this.pose = copyPose(char.stance); this.blendFrom = copyPose(char.stance); this._tp = newPose();
    this.blendT = 99; this.blendDur = 4;
    this.pts = newPts(); this.trail = []; this.ribbons = null;
    this.hitTargets = new Map(); this.stale = [];
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.kvx = 0; this.kvy = 0;
    this.facing = 1; this.grounded = false; this.ground = null;
    this.state = 'air'; this.sf = 0; this.move = null; this.moveFrame = 0; this.moveParam = {};
    this.hitlag = 0; this.hitstun = 0; this.tumble = false; this.invuln = 0; this.flash = 0;
    this.shieldHP = SHIELD_MAX; this.jumpsLeft = this.st.jumps; this.usedAirDodge = false; this.usedOnce = {};
    this.fastfall = false; this.ledge = null; this.ledgeCD = 0; this.dropThru = 0; this.ledgeInv = 0;
    this.lastHitBy = null; this.lastHitFrame = -9999; this.combo = 0;
    this.charge = 0; this.chargeLv = 0; this.stored = 0; this.anim = 0; this.blink = 120;
    this.shake = 0; this.dead = false; this.out = false; this.deadTimer = 0;
    this.airFrames = 0; this.hopCut = false; this.eliminated = false; this.holdRock = false;
    this.invisible = false; this.respawnY = 0; this.hasLedgeInv = true;
    this.counterAnim = 0; this.reflectAnim = 0;
  }

  // ---------- 汎用 ----------
  setState(s) {
    if (this.state === 'attack' && s !== 'attack') { this.move = null; this.holdRock = false; this.invisible = false; }
    this.state = s; this.sf = 0;
    this.beginBlend(4);
  }
  beginBlend(d) {
    copyPose(this.pose, this.blendFrom);
    this.blendFrom.rot = wrapAngle(this.blendFrom.rot);
    this.blendT = 0; this.blendDur = d;
  }
  sfx(n, p) { this.battle.sfx(n, p); }
  fxAt(type, at, o = {}) {
    const p = at === 'feet' ? { x: this.x, y: this.y } : (this.pts[at] || this.pts.center);
    const off = o.off || [0, 0];
    this.battle.fx.emit(type, p.x + off[0] * this.facing * this.scale, p.y + off[1] * this.scale, Object.assign({ dir: this.facing, s: this.scale, f: this }, o));
  }
  proj(type, o) {
    const p = o.at === 'feet' ? { x: this.x, y: this.y - 2 } : (this.pts[o.at] || this.pts.center);
    const off = o.off || [0, 0];
    const d = o.dir || this.facing;
    const pr = new Projectile(this, type, p.x + off[0] * this.facing * this.scale, p.y + off[1] * this.scale, o.vx * (o.dir ? 1 : this.facing), o.vy, o);
    pr.dir = d;
    if (type === 'shock' || type === 'spark') pr.grounded = this.grounded;
    if (type === 'shock') pr.y = this.y;
    this.battle.projectiles.push(pr);
    return pr;
  }
  countProj(type) { return this.battle.projectiles.filter((p) => p.owner === this && p.type === type && !p.dead).length; }
  get alive() { return this.state !== 'dead' && !this.eliminated; }
  get airborne() { return !this.grounded; }
  inRange(r) { return r && this.moveFrame >= r[0] && this.moveFrame <= r[1]; }
  isIntangible() {
    if (this.invuln > 0 || this.ledgeInv > 0 || this.state === 'dead' || this.state === 'respawn' || this.invisible) return true;
    const s = this.sf;
    switch (this.state) {
      case 'roll': return s >= 3 && s <= 18;
      case 'spotdodge': return s >= 2 && s <= 17;
      case 'airdodge': return s >= 2 && s <= (this.adDir ? 18 : 22);
      case 'tech': case 'getup': return s <= 18;
      case 'ledgeget': return s <= this.lgIntang;
      case 'attack': return this.inRange(this.move.intang);
    }
    return false;
  }
  counterActive() { return this.state === 'attack' && this.inRange(this.move.counter); }
  reflectActive() { return this.state === 'attack' && this.inRange(this.move.reflect); }
  armorActive() { return this.state === 'attack' && this.inRange(this.move.armor); }
  isShielding() { return this.state === 'shield' || this.state === 'shieldstun'; }

  // ---------- 出現 ----------
  spawn(x, y, facing) {
    this.x = x; this.y = y; this.facing = facing;
    this.vx = this.vy = this.kvx = this.kvy = 0;
    this.state = 'idle'; this.sf = 0;
    const p = this.battle.stage.platformAt(x, y, 4);
    this.grounded = !!p; this.ground = p;
    if (!p) this.state = 'air';
    this.updatePose(true);
  }
  respawn() {
    const st = this.battle.stage;
    const r = st.respawn;
    this.x = r.x + (this.slot - 1.5) * 50; this.respawnY = r.y; this.y = r.y - 240;
    this.vx = this.vy = this.kvx = this.kvy = 0;
    this.percent = 0; this.grounded = false; this.ground = null; this.state = 'respawn'; this.sf = 0;
    this.facing = this.x < 0 ? 1 : -1; this.jumpsLeft = this.st.jumps; this.usedOnce = {}; this.usedAirDodge = false;
    this.shieldHP = SHIELD_MAX; this.hitlag = 0; this.hitstun = 0; this.fastfall = false; this.ledge = null;
    this.stored = 0; this.chargeLv = 0; this.combo = 0; this.invisible = false; this.holdRock = false;
    this.lastHitBy = null; this.flash = 0; this.out = false; this.trail.length = 0;
    this.updatePose(true);
    if (this.ribbons) for (const rb of this.ribbons) rb.reset = true;
  }

  // ---------- メイン更新 ----------
  update() {
    const inp = this.inp;
    if (this.state === 'dead') {
      if (--this.deadTimer <= 0) { if (this.stocks > 0) this.respawn(); else this.eliminated = true; }
      return;
    }
    if (this.hitlag > 0) {
      this.hitlag--;
      if (this.hitlag === 0 && this.pendingKB) this.launch();
      this.updateRibbons();
      return;
    }
    this.anim++;
    if (this.invuln > 0) this.invuln--;
    if (this.ledgeInv > 0) this.ledgeInv--;
    if (this.ledgeCD > 0) this.ledgeCD--;
    if (this.dropThru > 0) this.dropThru--;
    if (this.flash > 0) this.flash--;
    if (this.counterAnim > 0) this.counterAnim--;
    if (!this.isShielding()) this.shieldHP = Math.min(SHIELD_MAX, this.shieldHP + 0.09);
    if (--this.blink < -6) this.blink = randi(90, 240);
    if (this.grounded) this.airFrames = 0; else this.airFrames++;
    this.sf++;
    const fn = this['st_' + this.state];
    if (fn) fn.call(this, inp);
    if (this.state === 'dead') return;
    if (this.state !== 'grabbed' && this.state !== 'ledge' && this.state !== 'ledgeget') this.physics();
    this.updatePose();
    this.updateRibbons();
  }

  // ---------- 物理 ----------
  gravity(mul = 1) {
    if (this.fastfall) this.vy = Math.max(this.vy, this.st.ffall);
    else this.vy = Math.min(this.vy + this.st.grav * mul, this.st.fall);
  }
  airDrift(mul = 1) {
    const x = this.inp.x, max = this.st.air;
    if (Math.abs(x) > 0.15) {
      const t = x * max;
      if (Math.abs(this.vx) > max && sign(this.vx) === sign(t)) this.vx = approach(this.vx, t, 0.08);
      else this.vx = approach(this.vx, t, this.st.airAcc * mul);
    } else this.vx = approach(this.vx, 0, 0.05);
  }
  friction(mul = 1) { this.vx = approach(this.vx, 0, this.st.traction * mul); }

  physics() {
    const st = this.battle.stage;
    const px = this.x, py = this.y;
    if (this.grounded && this.ground) {
      const g = this.ground;
      this.x += g.dx || 0;
      if (this.vy < 0) { this.grounded = false; this.ground = null; }
    }
    this.x += this.vx + this.kvx;
    this.y += this.vy + this.kvy;
    // ふっとび減衰
    if (this.kvx || this.kvy) {
      const m = Math.hypot(this.kvx, this.kvy);
      const nm = Math.max(0, m - KB_DECAY);
      if (nm <= 0.01) { this.kvx = 0; this.kvy = 0; } else { this.kvx *= nm / m; this.kvy *= nm / m; }
    }
    if (this.grounded) {
      const g = this.ground;
      const hw = 2;
      if (this.x < g.x1 - hw || this.x > g.x2 + hw) {
        if (this.edgeStops()) { this.x = clamp(this.x, g.x1, g.x2); if (this.state === 'hitstun') this.kvx = 0; }
        else { this.grounded = false; this.ground = null; this.onLeaveGround(); }
      } else this.y = g.y;
      if (this.grounded && this.kvy < -0.5) { this.grounded = false; this.ground = null; }
    }
    if (!this.grounded) {
      const vyTot = this.vy + this.kvy;
      if (vyTot >= 0) {
        const p = st.landingPlat(this.x, py, this.y, this.dropThru > 0 || (this.state !== 'hitstun' && this.inp.y > 0.85 && this.fastfall));
        if (p) { this.y = p.y; this.onLand(p, vyTot); }
      }
      if (!this.grounded) this.collideSolid(px, py);
      if (!this.grounded && this.canLedge()) this.tryLedge();
    }
  }
  edgeStops() {
    const s = this.state;
    if (s === 'attack') return this.move.edgeStop !== false && !this.move.air;
    return s === 'shield' || s === 'shieldstun' || s === 'shieldoff' || s === 'roll' || s === 'spotdodge' || s === 'landlag' ||
      s === 'land' || s === 'hold' || s === 'getup' || s === 'tech' || s === 'down' || s === 'jumpsquat' || s === 'rebound' ||
      (s === 'hitstun' && Math.abs(this.kvx) < 3) || (this.isCpu && (s === 'idle' || s === 'crouch') && Math.abs(this.vx) < 2);
  }
  onLeaveGround() {
    const s = this.state;
    if (['idle', 'walk', 'dash', 'run', 'brake', 'turn', 'crouch', 'land'].includes(s)) { this.setState('air'); this.jumpsLeft = this.st.jumps; }
  }
  collideSolid(px, py) {
    const st = this.battle.stage, m = st.main;
    const hw = 12 * this.scale, h = 50 * this.scale;
    if (this.x + hw > m.x1 && this.x - hw < m.x2 && this.y > m.y + 1 && this.y - h < m.y2) {
      const hs = this.state === 'hitstun';
      if (py - h >= m.y2 - 2) {
        this.y = m.y2 + h;
        if (hs && this.kvy < -4) { this.kvy = -this.kvy * 0.6; this.battle.fx.emit('ring', this.x, m.y2, { s: 0.6 }); }
        else { this.kvy = Math.max(0, this.kvy); }
        this.vy = Math.max(0, this.vy);
      } else {
        const left = px < (m.x1 + m.x2) / 2;
        this.x = left ? m.x1 - hw : m.x2 + hw;
        if (hs && Math.abs(this.kvx) > 4) { this.kvx = -this.kvx * 0.6; this.battle.fx.emit('ring', this.x, this.y - h / 2, { s: 0.6 }); }
        else this.kvx = 0;
        this.vx = 0;
      }
    }
  }
  onLand(p, impact) {
    const s = this.state;
    // ふっとび中の着地：受け身 or ダウン
    if (s === 'hitstun' && this.tumble) {
      if (this.isCpu ? this.ai.wantsTech() : this.inp.frame - this.inp.at.s <= 20) {
        this.groundOn(p); this.kvx = 0; this.kvy = 0; this.vx = 0;
        this.techDir = Math.abs(this.inp.x) > 0.5 ? sign(this.inp.x) : 0;
        this.setState('tech'); this.sfx('tech'); this.battle.fx.emit('flash', this.x, this.y - 30 * this.scale, { r: 30, col: '#fff' });
        return;
      }
      if (impact > 7) {
        // バウンド
        this.kvy = -Math.abs(this.kvy) * 0.45; this.vy = -Math.min(5, impact * 0.3);
        this.battle.fx.dust(this.x, p.y, 6); this.sfx('land');
        this.y = p.y - 1;
        return;
      }
      this.groundOn(p); this.kvx *= 0.5; this.kvy = 0; this.vx = 0;
      this.setState('down'); this.sfx('land'); this.battle.fx.dust(this.x, p.y, 5);
      return;
    }
    this.groundOn(p);
    if (s === 'hitstun') { this.kvy = 0; return; }
    if (s === 'attack') {
      const m = this.move;
      if (m.onLand && m.onLand(this)) return;
      if (m.air || m.kind === 'special' || m.helpless) {
        if (m.air && m.hb.some((h) => this.moveFrame < h.f[0])) { /* 出始めの着地は軽減 */ }
        this.landLag(m.land !== undefined ? m.land : 8);
      }
      return;
    }
    if (s === 'helpless') { this.landLag(this.helplessLag || 12); return; }
    if (s === 'airdodge') { this.landLag(this.adDir ? 10 : 3); return; }
    if (s === 'air' || s === 'tumble' || s === 'respawn') {
      this.setState('land'); this.landFrames = this.fastfall ? 4 : 3;
      if (impact > 4) { this.battle.fx.dust(this.x, p.y, 4); this.sfx('land'); }
    }
  }
  groundOn(p) {
    this.grounded = true; this.ground = p; this.y = p.y;
    this.vy = 0; this.jumpsLeft = this.st.jumps; this.usedAirDodge = false; this.usedOnce = {};
    this.fastfall = false; this.hasLedgeInv = true; this.hopCut = true;
  }
  landLag(n) {
    this.setState('landlag'); this.lagFrames = n; this.battle.fx.dust(this.x, this.y, 3); this.vx *= 0.6;
  }

  // ---------- 崖つかまり ----------
  canLedge() {
    if (this.ledgeCD > 0 || this.hitlag > 0 || this.inp.y > 0.6) return false;
    const s = this.state;
    if (s === 'air' || s === 'helpless' || s === 'tumble') return this.vy + this.kvy > -6 || s === 'helpless';
    if (s === 'attack') return this.move.helpless && this.moveFrame > 8;
    return false;
  }
  tryLedge() {
    const st = this.battle.stage, s = this.scale;
    for (const L of st.ledges) {
      if (L.owner && L.owner !== this && L.owner.state === 'ledge') continue;
      const dx = (L.x - this.x) * L.dir; // ステージ側が正
      const dy = this.y - L.y;
      if (dx > -6 * s && dx < 46 * s && dy > 30 * s && dy < 110 * s) {
        this.grabLedge(L);
        return true;
      }
    }
    return false;
  }
  grabLedge(L) {
    if (this.state === 'attack') { this.move = null; this.invisible = false; }
    this.state = 'ledge'; this.sf = 0; this.beginBlend(4);
    this.ledge = L; L.owner = this;
    this.facing = L.dir;
    this.x = L.x - L.dir * 14 * this.scale; this.y = L.y + 74 * this.scale;
    this.vx = this.vy = this.kvx = this.kvy = 0;
    this.jumpsLeft = this.st.jumps; this.usedAirDodge = false; this.usedOnce = {}; this.fastfall = false;
    this.ledgeInv = this.hasLedgeInv ? 36 : 6; this.hasLedgeInv = false;
    this.battle.fx.emit('flash', L.x, L.y, { r: 16, col: '#fff' });
    this.sfx('ledge');
  }
  releaseLedge() { if (this.ledge && this.ledge.owner === this) this.ledge.owner = null; this.ledge = null; }
  st_ledge(inp) {
    const L = this.ledge;
    if (!L) { this.setState('air'); return; }
    this.x = L.x - L.dir * 14 * this.scale + (L.plat ? 0 : 0); this.y = L.y + 74 * this.scale;
    if (this.sf < 8) return;
    const toward = inp.x * L.dir;
    if (inp.buf('j') || (inp.y < -0.6 && inp.flickY(3))) {
      inp.use('j'); this.releaseLedge();
      this.setState('air'); this.vy = -this.st.jump * 1.02; this.vx = L.dir * 2.5; this.y = L.y - 4; this.x = L.x + L.dir * 2;
      this.invuln = Math.max(this.invuln, 4); this.sfx('jump'); return;
    }
    if (inp.buf('a') || inp.buf('b') || inp.buf('m')) { inp.use('a'); inp.use('b'); inp.use('m'); this.ledgeGet('atk'); return; }
    if (inp.buf('s')) { inp.use('s'); this.ledgeGet('roll'); return; }
    if (toward > 0.6 || inp.y < -0.6) { this.ledgeGet('climb'); return; }
    if (toward < -0.6 || inp.y > 0.6 || this.sf > 300) {
      this.releaseLedge(); this.setState('air'); this.ledgeCD = 32; this.vx = -L.dir * 1.5; this.vy = 1; return;
    }
  }
  ledgeGet(type) {
    const L = this.ledge;
    this.lgType = type; this.lgFrom = [this.x, this.y]; this.lgTo = [L.x + L.dir * 30 * this.scale, L.y];
    this.lgDur = type === 'atk' ? 12 : 18; this.lgIntang = type === 'roll' ? 30 : type === 'atk' ? 14 : 20;
    this.state = 'ledgeget'; this.sf = 0; this.beginBlend(3);
  }
  st_ledgeget() {
    const L = this.ledge;
    const t = clamp(this.sf / this.lgDur, 0, 1);
    this.x = lerp(this.lgFrom[0], this.lgTo[0], easeOut(t));
    this.y = lerp(this.lgFrom[1], this.lgTo[1], easeOut(clamp(t * 1.4, 0, 1)));
    if (this.sf >= this.lgDur) {
      this.releaseLedge();
      const p = this.battle.stage.platformAt(this.x, this.y, 6) || this.battle.stage.main;
      this.groundOn(p);
      if (this.lgType === 'atk') { this.startMove('ledgeatk'); this.invuln = 8; }
      else if (this.lgType === 'roll') { this.facing = L.dir; this.startRoll(L.dir, true); }
      else { this.setState('idle'); this.invuln = 2; }
    }
  }

  // ---------- 地上 ----------
  groundActions() {
    const inp = this.inp;
    if (this.ground && this.ground.soft && inp.flickY(3) && inp.flickYDir > 0 && inp.y > 0.6 && !inp.held.s && !inp.held.a && !inp.held.b) {
      this.dropThrough(); return true;
    }
    if (inp.buf('j')) { inp.use('j'); this.setState('jumpsquat'); return true; }
    if (inp.buf('g') || (inp.held.s && inp.buf('a'))) {
      inp.use('g'); inp.use('a');
      this.startMove(this.state === 'run' || this.state === 'dash' ? 'dashgrab' : 'grab'); return true;
    }
    if (inp.buf('b')) { inp.use('b'); if (this.special()) return true; }
    if (inp.cstick()) { inp.useC(); this.chargeBtn = 'c'; this.smashDir(inp.cx, inp.cy); return true; }
    if (inp.buf('m')) { inp.use('m'); this.chargeBtn = 'm'; this.smashDir(inp.x, inp.y); return true; }
    if (inp.buf('a')) { inp.use('a'); this.chargeBtn = 'a'; this.groundAttack(); return true; }
    if (inp.held.s) { this.setState('shield'); this.sfx('shield'); return true; }
    return false;
  }
  groundAttack() {
    const inp = this.inp, x = inp.x, y = inp.y;
    const win = inp.digital ? 4 : 5;
    const smashX = inp.flickX(win) && Math.abs(x) > 0.6 && Math.abs(x) >= Math.abs(y);
    const smashY = inp.flickY(win) && Math.abs(y) > 0.6 && Math.abs(y) > Math.abs(x);
    if (this.state === 'run' || (this.state === 'dash' && this.sf > 1)) {
      if (smashY && y < 0) return this.startMove('usmash');
      return this.startMove('dash');
    }
    if (smashX || smashY) return this.smashDir(x, y);
    if (y < -0.5 && Math.abs(y) >= Math.abs(x)) return this.startMove('utilt');
    if (y > 0.5 && Math.abs(y) >= Math.abs(x)) return this.startMove('dtilt');
    if (Math.abs(x) > 0.3) { this.facing = sign(x); return this.startMove('ftilt'); }
    return this.startMove('jab1');
  }
  smashDir(x, y) {
    if (Math.abs(y) > Math.abs(x) && Math.abs(y) > 0.4) return this.startMove(y < 0 ? 'usmash' : 'dsmash');
    if (Math.abs(x) > 0.3) this.facing = sign(x);
    return this.startMove('fsmash');
  }
  special() {
    const inp = this.inp, x = inp.x, y = inp.y;
    let n;
    if (y < -0.5 && Math.abs(y) >= Math.abs(x) * 0.8) n = 'uspec';
    else if (y > 0.5 && Math.abs(y) >= Math.abs(x)) n = 'dspec';
    else if (Math.abs(x) > 0.4) n = 'sspec';
    else n = 'nspec';
    if (!this.grounded && this.char.moves[n + '_air']) n += '_air';
    const m = this.char.moves[n];
    if (m.once && this.usedOnce[m.once] && !this.grounded) return false;
    if (n === 'sspec' || (m.turn && Math.abs(x) > 0.3)) this.facing = sign(x) || this.facing;
    if (m.once) this.usedOnce[m.once] = true;
    this.startMove(n);
    return true;
  }
  dropThrough() {
    this.grounded = false; this.ground = null; this.dropThru = 12; this.vy = 1.5; this.y += 2;
    this.setState('air'); this.jumpsLeft = this.st.jumps;
  }
  startDash() {
    this.setState('dash'); this.vx = this.facing * this.st.dash;
    this.battle.fx.dust(this.x - this.facing * 10, this.y, 3); this.sfx('dash');
  }

  st_idle(inp) {
    if (this.groundActions()) return;
    this.friction();
    if (inp.y > 0.6 && Math.abs(inp.y) > Math.abs(inp.x)) { this.setState('crouch'); return; }
    if (Math.abs(inp.x) > 0.25) {
      if (sign(inp.x) !== this.facing) this.facing = sign(inp.x);
      if ((!inp.digital && inp.flickX(3)) || inp.dashTap()) this.startDash();
      else this.setState('walk');
    }
  }
  st_walk(inp) {
    if (this.groundActions()) return;
    const x = inp.x;
    if (Math.abs(x) < 0.25) { this.setState('idle'); return; }
    if (inp.y > 0.65 && Math.abs(inp.y) > Math.abs(x)) { this.setState('crouch'); return; }
    if (sign(x) !== this.facing) this.facing = sign(x);
    if ((!inp.digital && inp.flickX(3)) || inp.dashTap() || (inp.digital && this.sf > 9) || (!inp.digital && Math.abs(x) > 0.92 && this.sf > 12)) { this.startDash(); return; }
    const t = (inp.digital ? 1 : clamp((Math.abs(x) - 0.2) / 0.7, 0.2, 1)) * this.st.walk * sign(x);
    this.vx = approach(this.vx, t, 0.7);
  }
  st_dash(inp) {
    if (this.groundActions()) return;
    const x = inp.x;
    if (sign(x) === -this.facing && Math.abs(x) > 0.5) { this.facing = -this.facing; this.startDash(); return; }
    this.vx = approach(this.vx, this.facing * this.st.dash * 0.95, 0.6);
    if (this.sf >= 10) {
      if (Math.abs(x) > 0.25 && sign(x) === this.facing) this.setState('run');
      else this.setState('brake');
    }
  }
  st_run(inp) {
    if (this.groundActions()) return;
    const x = inp.x;
    if (Math.abs(x) < 0.25) { this.setState('brake'); return; }
    if (sign(x) !== this.facing) { this.setState('turn'); return; }
    if (inp.y > 0.75 && Math.abs(inp.y) > Math.abs(x)) { this.setState('crouch'); return; }
    this.vx = approach(this.vx, this.facing * this.st.run * Math.max(0.65, Math.abs(x)), 0.9);
    if (this.sf % 9 === 0) this.battle.fx.dust(this.x - this.facing * 10, this.y, 1);
  }
  st_brake(inp) {
    if (this.groundActions()) return;
    this.friction(1.4);
    if (Math.abs(inp.x) > 0.5 && sign(inp.x) === this.facing && this.sf > 2) { this.startDash(); return; }
    if (this.sf > 8 || this.vx === 0) this.setState('idle');
  }
  st_turn(inp) {
    if (inp.buf('j')) { inp.use('j'); this.setState('jumpsquat'); return; }
    this.friction(2.2);
    if (this.sf === 3) this.battle.fx.dust(this.x, this.y, 3);
    if (this.sf >= 7) {
      this.facing = -this.facing;
      if (Math.abs(inp.x) > 0.25 && sign(inp.x) === this.facing) { this.setState('run'); this.vx = this.facing * this.st.run * 0.5; }
      else this.setState('idle');
    }
  }
  st_crouch(inp) {
    if (this.groundActions()) return;
    this.friction(1.5);
    if (inp.y < 0.5) this.setState('idle');
  }
  st_land() {
    this.friction(1.5);
    if (this.sf >= this.landFrames) this.setState('idle');
  }
  st_landlag() {
    this.friction(1.2);
    if (this.sf >= this.lagFrames) this.setState('idle');
  }
  st_jumpsquat(inp) {
    this.vx *= 0.92;
    if (this.sf >= 3) {
      const full = inp.held.j;
      this.vy = -(full ? this.st.jump : this.st.hop);
      this.hopCut = !full;
      this.grounded = false; this.ground = null;
      const cap = this.st.air * 1.25;
      this.vx = clamp(this.vx + inp.x * 1.6, -cap, cap);
      this.setState('air'); this.airFrames = 0;
      this.battle.fx.dust(this.x, this.y, 3); this.sfx('jump');
    }
  }

  // ---------- 空中 ----------
  airActions() {
    const inp = this.inp;
    if (!this.fastfall && this.vy > -3 && inp.flickY(3) && inp.flickYDir > 0 && inp.y > 0.6) {
      this.fastfall = true; this.battle.fx.emit('ffspark', this.x, this.y - 40 * this.scale, {});
    }
    if (inp.buf('j') && this.jumpsLeft > 0) { inp.use('j'); this.doubleJump(); return true; }
    if (inp.buf('s') && !this.usedAirDodge) { inp.use('s'); this.airDodge(); return true; }
    if (inp.buf('b')) { inp.use('b'); if (this.special()) return true; }
    if (inp.cstick()) { inp.useC(); this.aerialDir(inp.cx, inp.cy); return true; }
    if (inp.buf('a') || inp.buf('m') || inp.buf('g')) { inp.use('a'); inp.use('m'); inp.use('g'); this.aerialDir(inp.x, inp.y); return true; }
    return false;
  }
  aerialDir(x, y) {
    if (Math.abs(y) > Math.abs(x) && Math.abs(y) > 0.4) return this.startMove(y < 0 ? 'uair' : 'dair');
    if (Math.abs(x) > 0.4) return this.startMove(sign(x) === this.facing ? 'fair' : 'bair');
    return this.startMove('nair');
  }
  doubleJump() {
    this.vy = -this.st.djump; this.vx = this.inp.x * this.st.air;
    this.jumpsLeft--; this.fastfall = false; this.hopCut = true;
    this.setState('air'); this.djAnim = 22;
    this.battle.fx.emit('ring', this.x, this.y, { s: this.scale * 0.8, col: '#fff' }); this.sfx('djump');
  }
  // ショートジャンプ（ジャンプボタンを早めに離す）
  checkHopCut() {
    if (!this.hopCut && !this.inp.held.j && this.vy < 0 && this.airFrames <= 6) { this.vy *= 0.66; this.hopCut = true; }
    if (this.airFrames > 6) this.hopCut = true;
  }
  st_air() {
    this.checkHopCut();
    if (this.djAnim > 0) this.djAnim--;
    if (this.airActions()) return;
    this.airDrift(); this.gravity();
  }
  st_tumble() {
    if (this.airActions()) return;
    this.airDrift(); this.gravity();
  }
  st_helpless() {
    this.airDrift(0.6); this.gravity();
  }
  airDodge() {
    const inp = this.inp;
    this.usedAirDodge = true; this.setState('airdodge');
    const m = Math.hypot(inp.x, inp.y);
    if (m > 0.4) {
      this.adDir = true; this.vx = (inp.x / m) * 11; this.vy = (inp.y / m) * 11; this.fastfall = false;
    } else { this.adDir = false; this.vx *= 0.5; this.vy *= 0.3; }
    this.sfx('dodge');
  }
  st_airdodge() {
    if (this.adDir) {
      if (this.sf < 15) { this.vx *= 0.88; this.vy *= 0.88; }
      else { this.gravity(); this.vx *= 0.95; }
      if (this.sf >= 34) this.setState('air');
    } else {
      this.gravity(0.6); this.airDrift(0.5);
      if (this.sf >= 28) this.setState('air');
    }
  }

  // ---------- ガード・回避 ----------
  st_shield(inp) {
    this.friction();
    this.shieldHP -= 0.15;
    if (this.shieldHP <= 0) { this.shieldBreak(); return; }
    if (inp.buf('j')) { inp.use('j'); this.setState('jumpsquat'); return; }
    if (inp.buf('a') || inp.buf('g')) { inp.use('a'); inp.use('g'); this.startMove('grab'); return; }
    if (inp.buf('b') && inp.y < -0.5) { inp.use('b'); this.special(); return; }
    if (Math.abs(inp.x) > 0.65 && inp.flickX(this.sf <= 1 ? 6 : 3)) { this.startRoll(sign(inp.x)); return; }
    if (inp.y > 0.65 && inp.flickY(this.sf <= 1 ? 6 : 3)) { this.setState('spotdodge'); this.sfx('dodge'); return; }
    if (!inp.held.s) { this.setState('shieldoff'); return; }
  }
  st_shieldstun() {
    this.friction(0.6);
    if (this.sf >= this.stunFrames) this.setState(this.inp.held.s ? 'shield' : 'shieldoff');
  }
  st_shieldoff(inp) {
    this.friction();
    if (inp.buf('j')) { inp.use('j'); this.setState('jumpsquat'); return; }
    if (this.sf >= 7) this.setState('idle');
  }
  shieldBreak() {
    this.shieldHP = SHIELD_MAX * 0.4;
    this.setState('dizzy'); this.dizzy = 200 - Math.min(80, this.percent * 0.5);
    this.vy = -12; this.grounded = false; this.ground = null;
    this.sfx('shieldbreak'); this.battle.fx.emit('shatter', this.x, this.y - 40 * this.scale, { col: this.color });
    this.battle.shake(8);
  }
  st_dizzy() {
    if (!this.grounded) { this.gravity(); this.vx *= 0.95; }
    else this.friction();
    this.dizzy -= 1 + (this.inp.mash - (this.lastMash || 0)) * 2; this.lastMash = this.inp.mash;
    if (this.grounded && this.dizzy <= 0) this.setState('idle');
  }
  startRoll(dir, fromLedge) {
    this.setState('roll'); this.rollDir = dir; this.sfx('dodge');
    if (fromLedge) this.sf = 2;
  }
  st_roll() {
    const t = this.sf;
    const sp = t < 4 ? 3 : t < 18 ? 7.4 : t < 24 ? 2.5 : 0;
    this.vx = this.rollDir * sp * Math.sqrt(this.scale);
    if (t >= 28) { this.facing = -this.rollDir; this.vx = 0; this.setState('idle'); }
  }
  st_spotdodge() { this.friction(2); if (this.sf >= 24) this.setState('idle'); }
  st_tech() {
    if (this.techDir) this.vx = this.techDir * (this.sf < 18 ? 6 : 0);
    else this.friction(2);
    if (this.sf >= 26) { this.vx = 0; this.setState('idle'); }
  }
  st_down(inp) {
    this.friction(0.8);
    if (this.sf < 16) return;
    if (inp.buf('a')) { inp.use('a'); this.startMove('getupatk'); return; }
    if (Math.abs(inp.x) > 0.6) { this.techDir = sign(inp.x); this.setState('tech'); return; }
    if (inp.buf('j') || inp.buf('s') || inp.y < -0.6 || this.sf > 80) { inp.use('j'); inp.use('s'); this.setState('getup'); }
  }
  st_getup() { this.friction(); if (this.sf >= 24) this.setState('idle'); }
  st_rebound() { this.friction(); if (this.sf >= 16) this.setState('idle'); }

  // ---------- ふっとび ----------
  st_hitstun() {
    this.hitstun--;
    if (!this.grounded) { this.gravity(); this.airDrift(0.25); }
    else this.friction(0.8);
    const sp = Math.hypot(this.kvx, this.kvy);
    if (sp > 9 && this.anim % 2 === 0) this.battle.fx.emit('smoke', this.x, this.y - 40 * this.scale, { s: clamp(sp / 20, 0.6, 1.6) });
    if (sp > 22 && this.anim % 3 === 0) this.battle.fx.emit('speedline', this.x, this.y - 40 * this.scale, { vx: this.kvx, vy: this.kvy });
    if (this.hitstun <= 0) {
      if (this.grounded) this.setState('idle');
      else this.setState(this.tumble ? 'tumble' : 'air');
    }
  }
  launch() {
    const k = this.pendingKB; this.pendingKB = null;
    if (k.link) {
      this.kvx = k.vx; this.kvy = k.vy; this.vx = 0; this.vy = 0;
      if (this.kvy < -0.5) { this.grounded = false; this.ground = null; }
      this.hitstun = k.stun; this.tumble = false;
      this.setState('hitstun'); this.blendT = this.blendDur;
      return;
    }
    let a = k.ang; // スクリーン角度（ラジアン, y下向き）
    // ずらし（DI）
    const ix = this.inp.x, iy = this.inp.y;
    if (Math.hypot(ix, iy) > 0.3) {
      const dx = Math.cos(a), dy = Math.sin(a);
      const cross = dx * iy - dy * ix;
      a += clamp(cross, -1, 1) * 0.24;
    }
    const sp = k.kb * KB_SPEED;
    this.kvx = Math.cos(a) * sp; this.kvy = Math.sin(a) * sp;
    this.vx = 0; this.vy = 0;
    if (this.grounded && this.kvy > 0) {
      if (k.kb > 60) this.kvy = -this.kvy * 0.75; else this.kvy = 0;
    }
    if (this.kvy < -0.5 || !this.grounded) { this.grounded = false; this.ground = null; }
    this.hitstun = Math.floor(k.kb * 0.4);
    this.tumble = k.kb > 72;
    this.fastfall = false; this.usedAirDodge = false; this.usedOnce = {};
    this.setState('hitstun'); this.blendT = this.blendDur;
  }

  // ---------- 攻撃 ----------
  startMove(name, param) {
    const m = this.char.moves[name];
    if (!m) { this.setState(this.grounded ? 'idle' : 'air'); return; }
    if (this.state !== 'attack') this.beginBlend(2); else this.beginBlend(2);
    this.state = 'attack'; this.sf = 0;
    this.move = m; this.moveFrame = 0; this.charge = 0; this.moveParam = param || {};
    this.hitTargets.clear(); this.trail.length = 0; this.hitThisMove = false;
    this.invisible = false;
    if (m.kind === 'aerial') this.hopCut = true;
    this.moveTick();
  }
  endMove() {
    const m = this.move;
    this.move = null; this.invisible = false; this.holdRock = false;
    if (this.grounded) this.setState('idle');
    else if (m && m.helpless) { this.setState('helpless'); this.helplessLag = m.land || 12; }
    else this.setState('air');
  }
  st_attack(inp) {
    const m = this.move;
    // ため
    if (m.charge && this.moveFrame === m.charge.f && this.charge < m.charge.max && this.chargeHeld()) {
      this.charge++;
      if (this.charge % 4 === 0) { this.fxAt('charge', 'center', { col: '#ffe65a' }); }
      if (this.charge % 8 === 0) this.sfx('charge', this.charge / 60);
    } else this.moveFrame++;
    if (m.air && !this.fastfall && this.vy > -3 && inp.flickY(3) && inp.flickYDir > 0 && inp.y > 0.6) this.fastfall = true;
    this.moveTick();
  }
  chargeHeld() {
    const inp = this.inp;
    if (this.chargeBtn === 'c') return inp.cHeldPrev;
    if (this.chargeBtn === 'm') return inp.held.m;
    return inp.held.a || inp.held.m;
  }
  moveTick() {
    const m = this.move, fr = this.moveFrame, inp = this.inp;
    if (m.first !== null && fr === m.first && m.sfx) this.sfx(m.sfx, 0.9 + Math.random() * 0.2);
    if (m.ev && m.ev[fr] && !(m.charge && fr === m.charge.f && this.charge > 0)) { m.ev[fr](this); if (this.move !== m) return; }
    if (m.update) { m.update(this, fr); if (this.move !== m || this.state !== 'attack') return; }
    // 移動
    const noGrav = this.inRange(m.noGrav);
    if (this.grounded) {
      if (!m.update || m.kind !== 'special') this.friction(m.slide ? 0.25 : 1);
    } else if (!noGrav) {
      if (m.air) { this.airDrift(); this.gravity(); }
      else { this.airDrift(0.5); this.gravity(); }
    }
    // 投げ
    if (m.throw && fr === m.throw.f) this.doThrow();
    if (m.kind === 'throw' && this.holding && this.state === 'attack') this.positionHeld();
    // 連携
    if (m.next && fr >= m.next.f && inp.buf('a', 8)) { inp.use('a'); this.startMove(m.next.move); return; }
    if (m.iasa && fr >= m.iasa) { if (this.grounded ? this.groundActions() : this.airActions()) return; }
    if (fr >= m.dur) {
      if (m.kind === 'throw' && m.name === 'pummel' && this.holding) { this.state = 'hold'; this.move = null; this.sf = this.holdSf || 0; return; }
      this.endMove();
    }
  }
  // 現在アクティブな攻撃判定
  activeHitboxes(out) {
    out.length = 0;
    if (this.state !== 'attack' || this.hitlag > 0) return out;
    const m = this.move, fr = this.moveFrame;
    for (const hb of m.hb) {
      if (fr < hb.f[0] || fr > hb.f[1]) continue;
      if (this.charge > 0 && m.charge && fr === m.charge.f) continue;
      const p = hbPos(this.pts, hb, this.facing, this.scale, this.x, this.y, { x: 0, y: 0 });
      out.push({ x: p.x, y: p.y, r: hb.r * this.scale, hb });
    }
    return out;
  }
  hurtbox() {
    const p = this.pts, r = this.char.prop.bodyW * 0.55 * this.scale + 4;
    return { ax: p.hip.x, ay: p.hip.y + 4 * this.scale, bx: p.head.x, by: p.head.y, r };
  }
  canHitAgain(target, hb) {
    const key = hb.g;
    let rec = this.hitTargets.get(target);
    if (!rec) return true;
    const t = rec[key];
    if (t === undefined) return true;
    if (hb.rehit) return this.moveFrame - t >= hb.rehit;
    return false;
  }
  markHit(target, hb) {
    let rec = this.hitTargets.get(target);
    if (!rec) { rec = {}; this.hitTargets.set(target, rec); }
    rec[hb.g] = this.moveFrame;
  }

  // ---------- 被弾 ----------
  receiveHit(atk, hb, o) {
    if (this.isIntangible()) return 'miss';
    if (this.counterActive()) {
      const dmg = hb.dmg * (o.mul || 1);
      this.battle.fx.text(this.x, this.y - 100 * this.scale, 'COUNTER!', '#7fffd4');
      this.battle.fx.emit('flash', this.x, this.y - 40 * this.scale, { r: 60, col: '#bfffea' });
      this.sfx('counter');
      if (!o.proj) atk.hitlag = 24;
      this.move.onCounter(this, o.proj ? atk : atk, dmg);
      this.battle.hitstop(10);
      return 'counter';
    }
    let dmg = hb.dmg * (o.mul || 1);
    if (hb.pow && atk.moveParam && atk.moveParam.pow) dmg = Math.max(dmg, atk.moveParam.pow * hb.pow);
    dmg = Math.round(dmg * 10) / 10;
    const dir = o.dir || 1;
    // ガード
    if (this.isShielding() && !hb.grab) {
      this.shieldHP -= dmg * 1.15;
      const stun = Math.floor(dmg * 0.5 + 3);
      this.setState('shieldstun'); this.stunFrames = stun;
      this.vx = dir * Math.min(9, dmg * 0.45 + 1.5);
      const hl = Math.floor(clamp(dmg * 0.35 + 3, 3, 14));
      this.hitlag = hl; if (!o.proj && atk) { atk.hitlag = hl; atk.vx -= dir * Math.min(4, dmg * 0.15); }
      this.battle.fx.emit('shieldhit', o.x, o.y, { col: this.color });
      this.sfx('shield');
      if (this.shieldHP <= 0) this.shieldBreak();
      return 'shield';
    }
    this.percent = Math.min(999, this.percent + dmg);
    this.stats.taken += dmg;
    if (atk) atk.stats.dmg += dmg;
    this.flash = 6;
    this.battle.onDamage(this, dmg);
    // つかみ解除
    if (this.state === 'grabbed' && this.grabber && this.grabber !== atk) this.grabber.releaseHold();
    if (this.state === 'hold' || this.holding) this.releaseHold();
    if (this.ledge) this.releaseLedge();
    const elDef = EL[hb.el] || EL.hit;
    // アーマー
    if (this.armorActive() && dmg < 22) {
      this.hitlag = Math.floor(dmg * 0.3 + 3);
      if (!o.proj && atk) atk.hitlag = this.hitlag;
      this.battle.fx.hitSpark(o.x, o.y, dmg, elDef, dir);
      this.sfx('hit2', 0.7);
      return 'armor';
    }
    if (this.state === 'attack' && this.move) { this.move = null; this.invisible = false; this.holdRock = false; }
    // 連続ヒット用の引き寄せ
    if (hb.ang === 'link') {
      const src = o.src || atk;
      const tx = o.x + (src.vx || 0) * 3, ty = o.y + (src.vy || 0) * 3;
      const cy = this.y - 40 * this.scale;
      this.pendingKB = { link: true, vx: (tx - this.x) * 0.22 + (src.vx || 0) * 0.9, vy: (ty - cy) * 0.22 + (src.vy || 0) * 0.9, stun: 14 };
      this.hitlag = 3; if (!o.proj && atk) atk.hitlag = 3;
      this.state = 'hitstun'; this.hitstun = 99;
      this.battle.fx.hitSpark(o.x, o.y, dmg * 0.6, elDef, dir);
      this.sfx('hit1', 1.2);
      this.registerAttacker(atk);
      return 'hit';
    }
    // ふっとばし計算
    const p = this.percent, w = this.weight;
    let kb = ((p / 10 + (p * dmg) / 20) * (200 / (w + 100)) * 1.4 + 18) * (hb.kbg / 100) + hb.bkb;
    if (o.kbMul) kb *= o.kbMul;
    let angDeg = hb.ang;
    if (angDeg === 361) angDeg = kb < 60 ? 15 : 40;
    const rad = angDeg * DEG;
    const ang = Math.atan2(-Math.sin(rad), Math.cos(rad) * dir);
    this.pendingKB = { kb, ang };
    // ヒットストップ
    let hl = clamp(dmg * 0.42 + 4, 4, 20);
    if (o.smash) hl *= 1.15;
    const kill = kb > 80 && this.battle.predictKill(this, kb, ang);
    if (kill) hl = Math.min(32, hl * 1.7 + 6);
    hl = Math.floor(hl);
    this.hitlag = hl; if (!o.proj && atk) atk.hitlag = hl;
    this.shake = hl;
    this.state = 'hitstun'; this.hitstun = 99; this.sf = 0;
    this.registerAttacker(atk);
    this.battle.onHitFX(this, atk, o.x, o.y, dmg, kb, elDef, dir, kill);
    return 'hit';
  }
  registerAttacker(atk) {
    if (!atk || atk === this) return;
    const f = this.battle.frame;
    if (this.lastHitBy === atk && f - this.lastHitFrame < 70) this.combo++; else this.combo = 1;
    atk.stats.maxCombo = Math.max(atk.stats.maxCombo, this.combo);
    if (this.combo >= 3) this.battle.onCombo(atk, this, this.combo);
    this.lastHitBy = atk; this.lastHitFrame = f;
  }
  staleMul(name) {
    let c = 0;
    for (const n of this.stale) if (n === name) c++;
    return c === 0 ? 1.05 : Math.max(0.55, 1 - c * 0.07);
  }
  pushStale(name) { this.stale.push(name); if (this.stale.length > 9) this.stale.shift(); }

  // ---------- つかみ・投げ ----------
  grabSuccess(t) {
    this.move = null;
    this.state = 'hold'; this.sf = 0; this.holding = t;
    this.holdTimer = clamp(70 + t.percent * 0.7, 70, 220);
    t.releaseLedge(); t.grabber = this;
    if (t.state === 'attack') { t.move = null; t.invisible = false; }
    t.state = 'grabbed'; t.sf = 0; t.grounded = false; t.vx = t.vy = t.kvx = t.kvy = 0; t.hitlag = 0;
    t.mashStart = t.inp.mash;
    this.vx = 0;
    this.sfx('grab');
    this.positionHeld();
  }
  st_hold(inp) {
    const t = this.holding;
    if (!t || t.state !== 'grabbed') { this.holding = null; this.setState('idle'); return; }
    this.friction();
    // 相手のレバガチャ
    const mash = t.inp.mash - t.mashStart; t.mashStart = t.inp.mash;
    this.holdTimer -= 1 + mash * 3;
    if (this.holdTimer <= 0) { this.releaseHold(true); return; }
    if (this.sf > 4) {
      const x = inp.x * this.facing, y = inp.y;
      let th = null;
      if (y < -0.6 && Math.abs(y) > Math.abs(x)) th = 'uthrow';
      else if (y > 0.6 && Math.abs(y) > Math.abs(x)) th = 'dthrow';
      else if (x > 0.6) th = 'fthrow';
      else if (x < -0.6) th = 'bthrow';
      if (th) { this.startMove(th); return; }
      if (inp.buf('a')) { inp.use('a'); this.holdSf = this.sf; this.startMove('pummel'); return; }
    }
    this.positionHeld();
  }
  positionHeld() {
    const t = this.holding; if (!t) return;
    const m = this.move;
    const at = m && m.hold ? m.hold : 'fh';
    // ポーズは次フレームで更新されるので、ここで仮更新
    this.updatePose(true);
    const h = this.pts[at];
    t.x = h.x + this.facing * 8 * this.scale;
    t.y = h.y + 42 * t.scale;
    t.facing = -this.facing;
    t.updatePose(true);
  }
  st_grabbed() { /* 位置は掴んでいる側が決める */ }
  pummelHit() {
    const t = this.holding; if (!t) return;
    t.percent += 1.6; t.flash = 4; this.stats.dmg += 1.6; t.stats.taken += 1.6;
    this.hitlag = 4; t.hitlag = 4;
    this.battle.fx.hitSpark(t.x, t.y - 40 * t.scale, 3, EL.hit, this.facing);
    this.battle.onDamage(t, 1.6);
    this.sfx('hit1');
  }
  doThrow() {
    const t = this.holding; if (!t) return;
    const th = this.move.throw;
    this.holding = null; t.grabber = null;
    t.state = 'hitstun'; t.hitstun = 99;
    const hb = { dmg: th.dmg, ang: th.ang, bkb: th.bkb, kbg: th.kbg, el: 'hit' };
    t.receiveHit(this, hb, { x: t.x, y: t.y - 40 * t.scale, dir: this.facing, mul: 1 });
    this.hitlag = Math.min(this.hitlag, 8);
    this.sfx('throw');
  }
  releaseHold(push) {
    const t = this.holding;
    this.holding = null;
    if (this.state === 'hold' || (this.state === 'attack' && this.move && this.move.kind === 'throw')) this.setState('idle');
    if (t && t.state === 'grabbed') {
      t.grabber = null; t.state = 'air'; t.sf = 0;
      t.vx = -this.facing * -5; t.vy = -5;
      t.kvx = this.facing * 4;
      if (push) { this.vx = -this.facing * 4; }
    }
  }

  // ---------- 死亡 ----------
  kill() {
    this.releaseLedge();
    if (this.holding) this.releaseHold();
    if (this.grabber) this.grabber.releaseHold();
    this.state = 'dead'; this.deadTimer = 80; this.stocks = this.stocks === Infinity ? Infinity : this.stocks - 1;
    this.move = null; this.hitlag = 0; this.pendingKB = null; this.invisible = false;
    this.stats.falls++;
  }

  // ---------- 復帰台 ----------
  st_respawn(inp) {
    const t = this.sf;
    this.vx = 0; this.vy = 0;
    this.y = lerp(this.respawnY - 240, this.respawnY, easeOut(clamp(t / 40, 0, 1)));
    if (t > 40) {
      const any = Math.abs(inp.x) > 0.4 || inp.y > 0.5 || inp.buf('j') || inp.buf('a') || inp.buf('b') || inp.buf('s');
      if (any || t > 220) {
        this.setState('air'); this.invuln = 120; this.vy = 0;
        if (inp.buf('j')) { inp.use('j'); this.doubleJump(); this.jumpsLeft = this.st.jumps; }
      }
    }
  }
  physicsRespawnSkip() { return this.state === 'respawn'; }

  // ---------- ポーズ ----------
  targetPose(out) {
    const c = this.char, s = this.state, t = this.sf, A = this.anim;
    const base = c.stance;
    switch (s) {
      case 'attack': return movePose(this.move, this.moveFrame, out);
      case 'idle': case 'respawn': {
        copyPose(base, out);
        const b = Math.sin(A * 0.07);
        out.y += b * 0.8; out.fh[1] += b * 1.2; out.bh[1] += b * 1.0; out.r += b * 0.015;
        return out;
      }
      case 'walk': {
        copyPose(base, out);
        const ph = (this.walkPh = (this.walkPh || 0) + Math.abs(this.vx) * 0.075 + 0.02);
        const sn = Math.sin(ph), cs = Math.cos(ph);
        out.ff[0] = 2 + sn * 13; out.ff[1] = 33 - Math.max(0, cs) * 7;
        out.bf[0] = -2 - sn * 13; out.bf[1] = 33 - Math.max(0, -cs) * 7;
        out.fh[0] += -sn * 4; out.bh[0] += sn * 4;
        out.y += Math.abs(cs) * -1.5; out.r = 0.1;
        return out;
      }
      case 'dash': case 'run': {
        copyPose(base, out);
        const ph = (this.walkPh = (this.walkPh || 0) + Math.abs(this.vx) * 0.05 + 0.05);
        const sn = Math.sin(ph), cs = Math.cos(ph);
        out.r = 0.35; out.y = -45 + Math.abs(sn) * -2.5;
        out.ff = [6 + sn * 20, 30 - Math.max(0, cs) * 14];
        out.bf = [-4 - sn * 20, 30 - Math.max(0, -cs) * 14];
        out.fh = [10 - sn * 14, 10 + cs * 4]; out.bh = [-4 + sn * 14, 10 - cs * 4];
        if (c.sword) { out.fh = [4 - sn * 6, 16]; out.w = 2.6; }
        return out;
      }
      case 'brake': case 'turn':
        return mkPose({ r: -0.25, y: -42, ff: [20, 28], bf: [-4, 29], fh: [18, -4], bh: [-12, 4], w: 2.4 }, base);
      case 'crouch': case 'jumpsquat': case 'land': case 'landlag': case 'shieldoff':
        copyPose(CROUCH_POSE, out); if (c.sword) { out.w = 0.3; out.fh = [16, 12]; } return out;
      case 'air': {
        if (this.djAnim > 0) {
          const k = 1 - this.djAnim / 22;
          const p = mkPose({ y: -46, ff: [8, 18], bf: [-6, 20], fh: [14, 4], bh: [4, 8], r: 0.2 }, AIR_POSE);
          p.rot = (c.id === 'goldo' ? 0 : TAU) * easeOut(k);
          if (c.sword) { p.w = -1.6; }
          return copyPose(p, out);
        }
        copyPose(AIR_POSE, out);
        if (this.vy < -2) { out.ff = [10, 20]; out.bf = [-4, 28]; out.fh = [12, -8]; out.bh = [-10, -2]; out.r = -0.05; }
        else { const k = clamp(this.vy / 10, 0, 1); out.ff = [8, 26 + k * 6]; out.bf = [-10, 28 + k * 4]; out.fh = [16, -4 - k * 6]; out.bh = [-14, -2 - k * 6]; }
        if (c.sword) { out.fh = [14, 6]; out.w = -1.2; }
        return out;
      }
      case 'tumble': case 'helpless': {
        const p = mkPose({ y: -46, r: -0.2, ff: [14, 24], bf: [-10, 30], fh: [16, -14 + Math.sin(A * 0.4) * 6], bh: [-14, -16 - Math.sin(A * 0.4) * 6] }, AIR_POSE);
        if (s === 'tumble') p.rot = wrapAngle(this.spinRot || 0);
        return copyPose(p, out);
      }
      case 'hitstun': {
        if (this.tumble) {
          this.spinRot = (this.spinRot || 0) + clamp(Math.hypot(this.kvx, this.kvy) * 0.012, 0.05, 0.35) * -this.facing;
          const p = mkPose({ y: -46, r: -0.4, ff: [16, 20], bf: [-16, 24], fh: [20, -16], bh: [-20, -12], rot: this.spinRot, w: 2 }, AIR_POSE);
          return copyPose(p, out);
        }
        this.spinRot = 0;
        return copyPose(mkPose({ r: -0.35, x: -3, fh: [6, -10], bh: [-16, -6], ff: [12, 32], bf: [-12, 33], hr: -0.3, w: 2.2 }, this.grounded ? base : AIR_POSE), out);
      }
      case 'airdodge': {
        const p = mkPose({ y: -46, ff: [8, 18], bf: [-6, 20], fh: [10, 0], bh: [4, 4], r: 0.3 }, AIR_POSE);
        return copyPose(p, out);
      }
      case 'shield': case 'shieldstun':
        return copyPose(mkPose({ y: -42, r: 0.15, fh: [14, 2], bh: [16, 6], ff: [12, 29], bf: [-12, 29], w: -1.4 }, base), out);
      case 'roll': {
        const k = clamp(t / 26, 0, 1);
        const p = mkPose({ y: -28, r: 0.5, ff: [10, 10], bf: [-6, 12], fh: [12, 8], bh: [6, 10], w: 1 }, base);
        p.rot = k * TAU * this.rollDir * this.facing;
        if (t > 22) return copyPose(CROUCH_POSE, out);
        return copyPose(p, out);
      }
      case 'spotdodge':
        return copyPose(mkPose({ y: -40, r: -0.4, x: -6, fh: [-4, -4], bh: [-12, 0], ff: [14, 30], bf: [-8, 31] }, base), out);
      case 'tech': case 'getup': {
        if (this.techDir && s === 'tech') {
          const p = mkPose({ y: -28, r: 0.5, ff: [10, 10], bf: [-6, 12], fh: [12, 8], bh: [6, 10] }, base);
          p.rot = clamp(t / 20, 0, 1) * TAU * this.techDir * this.facing;
          return copyPose(t > 20 ? CROUCH_POSE : p, out);
        }
        return copyPose(t < 10 ? mkPose({ y: -20, r: 0.9 }, CROUCH_POSE) : CROUCH_POSE, out);
      }
      case 'down': {
        const p = mkPose({ y: -14, r: 0, ff: [14, 28], bf: [18, 26], fh: [10, 14], bh: [-14, 14], rot: -Math.PI / 2 * 0.98, w: 0 }, base);
        return copyPose(p, out);
      }
      case 'ledge':
        return copyPose(mkPose({ y: -46, r: 0.1, fh: [12, -27], bh: [10, -26], ff: [4, 30], bf: [-4, 32], w: 1.6 }, base), out);
      case 'ledgeget': {
        const k = clamp(t / this.lgDur, 0, 1);
        if (this.lgType === 'roll') {
          const p = mkPose({ y: -28, r: 0.5, ff: [10, 10], bf: [-6, 12], fh: [12, 8], bh: [6, 10] }, base);
          p.rot = k * Math.PI; return copyPose(p, out);
        }
        return copyPose(k < 0.5 ? mkPose({ y: -40, r: 0.5, fh: [16, 4], bh: [12, 6], ff: [16, 14], bf: [-4, 28] }, base) : CROUCH_POSE, out);
      }
      case 'hold':
        return copyPose(mkPose({ fh: [22, 2], bh: [18, 6], r: 0.15, w: -2.5 }, base), out);
      case 'grabbed':
        return copyPose(mkPose({ y: -48, r: -0.2, fh: [8, -18], bh: [-8, -16], ff: [6, 34], bf: [-6, 34], hr: -0.2, w: 2 }, base), out);
      case 'dizzy': {
        const w = Math.sin(A * 0.12);
        return copyPose(mkPose({ r: w * 0.3, x: w * 4, fh: [10, 22], bh: [-6, 22], hr: -w * 0.4, w: 2.2 }, base), out);
      }
      case 'rebound':
        return copyPose(mkPose({ r: -0.4, x: -6, fh: [-8, -8], bh: [-16, -4] }, base), out);
    }
    return copyPose(base, out);
  }
  updatePose(force) {
    if (!force || this.state !== 'dead') {
      const tp = this.targetPose(this._tp);
      if (this.blendT < this.blendDur && !force) {
        this.blendT++;
        lerpPose(this.blendFrom, tp, this.blendT / (this.blendDur + 1), this.pose);
      } else if (force && this.blendT < this.blendDur) {
        lerpPose(this.blendFrom, tp, (this.blendT + 1) / (this.blendDur + 1), this.pose);
      } else copyPose(tp, this.pose);
    }
    // 回転を補正
    solveSkeleton(this.pose, this.char.prop, this.x, this.y, this.facing, this.scale, this.pts);
    // 軌跡
    if (!force) this.updateTrail();
  }
  updateTrail() {
    const m = this.state === 'attack' ? this.move : null;
    if (!m || !m.hb.length) { if (this.trail.length) this.trail.shift(); return; }
    const fr = this.moveFrame;
    let hb = null;
    for (const h of m.hb) if (fr >= h.f[0] - 2 && fr <= h.f[1] + 1 && !h.grab) { hb = h; break; }
    if (!hb) { if (this.trail.length) this.trail.shift(); return; }
    const at = hb.at;
    const P = this.pts;
    let a, b;
    if (at === 'wpn') { a = P.wb; b = P.wt; }
    else if (at === 'ff') { a = P.fk; b = P.ff; }
    else if (at === 'bf') { a = P.bk; b = P.bf; }
    else if (at === 'fh') { a = P.fe; b = P.fh; }
    else if (at === 'bh') { a = P.be; b = P.bh; }
    else { if (this.trail.length) this.trail.shift(); return; }
    this.trail.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, el: hb.el });
    if (this.trail.length > 6) this.trail.shift();
  }
  updateRibbons() {
    if (!this.ribbons) this.ribbons = makeRibbons(this);
    for (const rb of this.ribbons) stepRibbon(this, rb);
  }
}
