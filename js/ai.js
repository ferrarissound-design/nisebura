'use strict';
// ===== CPU =====
const GROUND_ATK = ['jab1', 'ftilt', 'utilt', 'dtilt', 'fsmash', 'usmash', 'dsmash', 'grab'];
const AIR_ATK = ['nair', 'fair', 'bair', 'uair', 'dair'];

// 技のリーチを事前計算
function buildAIData(c) {
  const pts = newPts(), pose = newPose(), tmp = { x: 0, y: 0 };
  c.reach = {};
  for (const name in c.moves) {
    const m = c.moves[name];
    if (!m.hb.length) continue;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const hb of m.hb) {
      for (let fr = hb.f[0]; fr <= hb.f[1]; fr++) {
        movePose(m, fr, pose);
        solveSkeleton(pose, c.prop, 0, 0, 1, c.scale, pts);
        hbPos(pts, hb, 1, c.scale, 0, 0, tmp);
        const r = hb.r * c.scale;
        x0 = Math.min(x0, tmp.x - r); x1 = Math.max(x1, tmp.x + r);
        y0 = Math.min(y0, tmp.y - r); y1 = Math.max(y1, tmp.y + r);
      }
    }
    const dmg = m.hb.reduce((a, h) => Math.max(a, h.dmg || 0), 0);
    const kb = m.hb.reduce((a, h) => Math.max(a, (h.kbg || 0) + (h.bkb || 0) * 0.5), 0);
    c.reach[name] = { x0, x1, y0, y1, f: m.first || 1, dmg, kb, dur: m.dur };
  }
  const u = { blaze: 230, goldo: 270, myu: 310, volty: 230, luna: 215 };
  c.upReach = u[c.id] || 220;
  c.sideRecover = c.id !== 'volty';
}

class AI {
  constructor(f, level) {
    this.f = f; this.level = level; this.raw = { x: 0, y: 0 };
    const k = clamp((level - 1) / 8, 0, 1);
    this.k = k;
    this.react = Math.round(lerp(26, 4, k));
    this.aggr = lerp(0.35, 0.92, k);
    this.acc = lerp(0.35, 0.95, k);
    this.defend = lerp(0.04, 0.55, k);
    this.techP = lerp(0.1, 0.85, k);
    this.queue = []; this.wait = 0; this.target = null; this.retarget = 0;
    this.techRoll = false; this.ledgeWait = 0; this.jcd = 0; this.holdS = 0; this.lastState = '';
  }
  wantsTech() { return this.techRoll; }
  press(steps) { this.queue = steps.map((s) => Object.assign({ n: 1 }, s)); }
  think() {
    const f = this.f, R = this.raw;
    R.x = 0; R.y = 0; R.a = R.b = R.j = R.s = R.g = R.m = false;
    if (this.level <= 0 || !f.alive) return R;
    // キュー実行中
    if (this.queue.length) {
      const s = this.queue[0];
      Object.assign(R, s); delete R.n;
      if (--s.n <= 0) this.queue.shift();
      return R;
    }
    if (f.state !== this.lastState) { if (f.state === 'hitstun') this.techRoll = Math.random() < this.techP; this.lastState = f.state; }
    const st = f.battle.stage;
    switch (f.state) {
      case 'respawn':
        if (f.sf > 50 + this.react * 2) R.x = f.x > 0 ? -0.5 : 0.5;
        return R;
      case 'grabbed': if (f.anim % 3 === 0) { R.a = true; R.x = Math.random() < 0.5 ? 1 : -1; } return R;
      case 'dizzy': if (f.anim % 3 === 0) R.a = true; return R;
      case 'hold': return this.doThrow();
      case 'ledge': return this.onLedge();
      case 'hitstun': case 'tumble': return this.inHitstun(R);
    }
    if (this.offstage()) return this.recover(R);
    if (this.wait > 0) { this.wait--; return this.idleMove(R); }
    return this.neutral(R);
  }
  offstage() {
    const f = this.f, m = f.battle.stage.main;
    if (f.grounded) return false;
    return f.x < m.x1 + 4 || f.x > m.x2 - 4 ? (f.y > -40 || f.x < m.x1 - 60 || f.x > m.x2 + 60) : false;
  }
  inHitstun(R) {
    const f = this.f;
    // ずらし：場外にいるほど内側上へ
    const d = -sign(f.x) || 1;
    if (Math.random() < this.acc) { R.x = d * 0.8; R.y = -0.6; }
    if (f.state === 'tumble' && this.offstage()) return this.recover(R);
    return R;
  }
  recover(R) {
    const f = this.f, st = f.battle.stage, m = st.main, c = f.char;
    const left = f.x < 0;
    const lx = left ? m.x1 : m.x2, dir = left ? 1 : -1;
    const dx = Math.abs(f.x - lx), dy = f.y - m.y;
    // ステージの下に潜らないよう、崖より少し外側を目指す
    const under = dy > 20 && (f.x - lx) * dir > -8 * f.scale;
    const tx = dy > 30 ? lx - dir * 34 * f.scale : lx + dir * 40;
    R.x = Math.abs(tx - f.x) < 8 ? 0 : sign(tx - f.x);
    if (f.state === 'attack' || f.state === 'helpless' || f.state === 'airdodge' || f.state === 'hitstun') {
      if (under) R.x = -dir;
      return R;
    }
    // ジャンプ
    if (f.jumpsLeft > 0 && f.vy > -2 && (dy > -70 || dx > 260)) {
      if (this.jcd > 0) this.jcd--; else { R.j = true; this.jcd = 8; return R; }
    }
    // 横必殺で距離を稼ぐ
    if (c.sideRecover && !f.usedOnce.side && f.jumpsLeft === 0 && dx > 200 && dy < 120 && dy > -200 && !under) {
      this.press([{ x: dir, b: true, n: 2 }, { x: dir, n: 20 }]);
      return R;
    }
    // 上必殺
    const need = dy + 40 * f.scale;
    if (f.jumpsLeft === 0 && f.vy > -1 && (need > c.upReach * 0.55 || dy > 0 || (dx < 120 && dy > -30))) {
      if (under && dy < c.upReach * 0.8) { R.x = -dir; return R; }
      if (c.id === 'volty') {
        const ty = m.y - 30, tx2 = under ? lx - dir * 60 : lx + dir * 10;
        const vx = tx2 - f.x, vy = ty - (f.y - 40);
        const L = Math.hypot(vx, vy) || 1;
        this.press([{ y: -1, b: true, n: 2 }, { x: vx / L, y: vy / L, n: 12 }]);
      } else this.press([{ x: under ? -dir * 0.4 : dir * 0.3, y: -1, b: true, n: 2 }, { x: under ? -dir : dir, n: 12 }, { x: dir, n: 20 }]);
      return R;
    }
    return R;
  }
  onLedge() {
    const R = this.raw, f = this.f;
    if (f.sf === 1) this.ledgeWait = randi(4, 30) + (this.level < 3 ? 30 : 0);
    if (f.sf < this.ledgeWait) return R;
    const r = Math.random(), d = f.ledge ? f.ledge.dir : 1;
    if (r < 0.4) R.x = d;
    else if (r < 0.65) R.j = true;
    else if (r < 0.8) R.s = true;
    else R.a = true;
    return R;
  }
  doThrow() {
    const R = this.raw, f = this.f, t = f.holding;
    if (!t) return R;
    if (f.sf < 6 + randi(0, 10)) return R;
    if (f.sf < 30 && Math.random() < 0.06 * this.k + 0.02) { R.a = true; return R; }
    const m = f.battle.stage.main;
    const towardEdge = f.facing > 0 ? m.x2 - f.x : f.x - m.x1;
    const backEdge = f.facing > 0 ? f.x - m.x1 : m.x2 - f.x;
    let th;
    if (t.percent > 110) th = backEdge < towardEdge ? 'b' : (f.char.id === 'goldo' ? 'b' : 'f');
    else if (t.percent < 50 && Math.random() < 0.6) th = Math.random() < 0.5 ? 'd' : 'u';
    else th = towardEdge < backEdge ? 'f' : 'b';
    if (th === 'f') R.x = f.facing; else if (th === 'b') R.x = -f.facing; else if (th === 'u') R.y = -1; else R.y = 1;
    return R;
  }
  pickTarget() {
    const f = this.f, B = f.battle;
    if (this.target && this.target.alive && this.retarget-- > 0) return this.target;
    let best = null, bd = 1e9;
    for (const o of B.fighters) {
      if (o === f || !o.alive || o.state === 'respawn') continue;
      const d = Math.hypot(o.x - f.x, o.y - f.y) * (o.isCpu ? 1.1 : 1) + rand(0, 80);
      if (d < bd) { bd = d; best = o; }
    }
    this.target = best; this.retarget = randi(90, 240);
    return best;
  }
  idleMove(R) {
    if (this.drift) R.x = this.drift;
    return this.edgeSafe(R);
  }
  edgeSafe(R) {
    const f = this.f, m = f.battle.stage.main;
    if (f.grounded && f.ground === m) {
      if ((f.x < m.x1 + 50 && R.x < 0) || (f.x > m.x2 - 50 && R.x > 0)) R.x = 0;
    }
    if (!f.grounded && !this.offstage()) {
      if ((f.x < m.x1 + 20 && R.x < 0) || (f.x > m.x2 - 20 && R.x > 0)) R.x = 0;
    }
    return R;
  }
  neutral(R) {
    const f = this.f, B = f.battle, t = this.pickTarget();
    this.drift = 0;
    if (!t) return R;
    const m = B.stage.main;
    const dx = t.x - f.x, dy = (t.y - 40 * t.scale) - (f.y - 40 * f.scale), adx = Math.abs(dx);
    const dir = sign(dx) || f.facing;
    // 防御
    if (f.grounded && this.threat(t) && Math.random() < this.defend) {
      const r = Math.random();
      if (r < 0.55) this.press([{ s: true, n: randi(10, 22) }]);
      else if (r < 0.7) this.press([{ s: true, n: 1 }, { s: true, y: 1, n: 2 }]);
      else if (r < 0.85) this.press([{ s: true, n: 1 }, { s: true, x: -dir, n: 2 }]);
      else this.press([{ j: true, n: 6 }, { x: -dir, n: 10 }]);
      this.wait = Math.round(this.react * 0.5);
      return R;
    }
    if (this.projThreat() && Math.random() < this.defend * 1.2) {
      this.press(Math.random() < 0.6 ? [{ s: true, n: 16 }] : [{ j: true, n: 4 }]);
      return R;
    }
    // 相手が場外：崖付近で待つ
    const tOff = t.x < m.x1 - 10 || t.x > m.x2 + 10;
    if (tOff && f.grounded) {
      const ex = t.x < 0 ? m.x1 + 40 : m.x2 - 40;
      if (Math.abs(f.x - ex) > 30) R.x = sign(ex - f.x);
      else if (this.level >= 4 && Math.random() < 0.04 + this.k * 0.05 && f.char.moves.nspec) { this.facing(t); this.press([{ x: 0, b: true, n: 2 }]); this.wait = 20; }
      else if (Math.random() < 0.03 && Math.hypot(dx, dy) < 160) { this.attack(t, dx, dy); }
      return this.edgeSafe(R);
    }
    // 攻撃
    const opt = this.attackChoice(t, dx, dy);
    if (opt && Math.random() < this.aggr) { this.exec(opt, t, dir); this.wait = randi(0, this.react); return R; }
    // 飛び道具
    if (f.grounded && adx > 220 && adx < 700 && Math.abs(dy) < 80 && Math.random() < 0.025 + (f.char.id === 'volty' ? 0.03 : 0)) {
      if (f.facing !== dir) { this.press([{ x: dir, n: 2 }, { b: true, n: f.char.id === 'volty' ? randi(2, 50) : 2 }]); }
      else this.press([{ b: true, n: f.char.id === 'volty' ? randi(2, 50) : 2 }]);
      this.wait = 12;
      return R;
    }
    // 移動
    if (f.grounded) {
      if (dy < -90 && adx < 160 && Math.random() < 0.3) { this.press([{ j: true, n: 10 }, { x: dir, n: 12 }]); return R; }
      if (dy > 90 && f.ground && f.ground.soft && adx < 200) { this.press([{ n: 2 }, { y: 1, n: 3 }]); return R; }
      if (adx > 70) R.x = dir * (adx > 220 ? 1 : 0.85);
      else if (Math.random() < 0.08) { this.drift = Math.random() < 0.5 ? -dir * 0.6 : 0; this.wait = randi(4, 16); }
      if (adx > 60 && adx < 260 && Math.random() < 0.02 + this.k * 0.02) { this.press([{ j: true, n: 1 }, { x: dir, n: 5 }]); return R; }
    } else {
      if (adx > 30) R.x = dir;
      // 空中で深追いしすぎない
      const nx = f.x + R.x * 80;
      if ((nx < m.x1 || nx > m.x2) && !(this.level >= 6 && f.jumpsLeft > 0 && f.y < -60 && Math.random() < 0.5)) R.x = -sign(f.x);
      if (dy > 60 && f.vy > -1 && !f.fastfall && Math.random() < 0.2) R.y = 1;
      if (dy < -60 && f.jumpsLeft > 0 && f.vy > 0 && Math.random() < 0.1) R.j = true;
    }
    return this.edgeSafe(R);
  }
  facing(t) { /* 向きは移動入力で調整 */ }
  threat(t) {
    if (t.state !== 'attack' || !t.move || !t.move.hb.length) return false;
    const f = this.f;
    const d = Math.hypot(t.x - f.x, t.y - f.y);
    const rc = t.char.reach[t.move.name];
    const range = rc ? Math.max(Math.abs(rc.x0), Math.abs(rc.x1)) + 40 : 120;
    return d < range && t.moveFrame <= (t.move.first || 0) + 1 && Math.random() < 0.7;
  }
  projThreat() {
    const f = this.f;
    for (const p of f.battle.projectiles) {
      if (p.owner === f || p.dead) continue;
      const dx = f.x - p.x;
      if (Math.abs(dx) < 140 && sign(dx) === sign(p.vx) && Math.abs(f.y - 40 - p.y) < 70) return true;
    }
    return false;
  }
  attackChoice(t, dx, dy) {
    const f = this.f, c = f.char;
    const list = f.grounded ? GROUND_ATK : AIR_ATK;
    const tr = (t.char.prop.bodyW * 0.55 + 4) * t.scale;
    let best = null, bs = -1;
    for (const name of list) {
      const rc = c.reach[name];
      if (!rc) continue;
      const ff = rc.f;
      const px = t.x + (t.vx + t.kvx) * ff * 0.6 - (f.x + (f.grounded ? 0 : f.vx * ff * 0.6));
      const yy = (t.y - 40 * t.scale + (t.vy + t.kvy) * ff * 0.5) - (f.y + (f.grounded ? 0 : f.vy * ff * 0.5));
      const fx = f.grounded ? Math.abs(px) : px * f.facing;
      if (fx < rc.x0 - tr || fx > rc.x1 + tr || yy < rc.y0 - tr * 1.6 || yy > rc.y1 + tr * 1.6) continue;
      if (name === 'grab' && !(t.grounded || t.isShielding())) continue;
      let sc = (rc.dmg + 4) / (ff + 6);
      const killish = t.percent > 90 - this.k * 10;
      if (killish) sc *= 0.6 + rc.kb / 90;
      if (name === 'grab') sc *= t.isShielding() ? 4 : 0.8;
      if (t.isShielding() && name !== 'grab') sc *= 0.4;
      if (name.endsWith('smash') && t.percent < 50) sc *= 0.6;
      sc *= lerp(rand(0.2, 1.8), 1, this.acc);
      if (sc > bs) { bs = sc; best = name; }
    }
    return best;
  }
  attack(t, dx, dy) {
    const o = this.attackChoice(t, dx, dy);
    if (o) this.exec(o, t, sign(dx) || this.f.facing);
  }
  exec(name, t, dir) {
    const f = this.f;
    const chg = name.endsWith('smash') ? randi(1, Math.round(4 + (t.percent > 80 ? 20 : 4) * this.k)) : 1;
    switch (name) {
      case 'jab1': this.press([{ a: true, n: 1 }, { n: 4 }, { a: true, n: 1 }, { n: 4 }, { a: true, n: 1 }]); break;
      case 'ftilt': this.press([{ x: dir * 0.6, n: 2 }, { x: dir * 0.6, a: true, n: 2 }]); break;
      case 'utilt': this.press([{ y: -0.6, a: true, n: 2 }]); break;
      case 'dtilt': this.press([{ y: 0.62, n: 1 }, { y: 0.62, a: true, n: 2 }]); break;
      case 'fsmash': this.press([{ x: dir, m: true, n: chg }]); break;
      case 'usmash': this.press([{ y: -1, m: true, n: chg }]); break;
      case 'dsmash': this.press([{ y: 1, m: true, n: chg }]); break;
      case 'grab': this.press([{ x: dir * 0.3, n: 1 }, { g: true, n: 2 }]); break;
      case 'nair': this.press([{ a: true, n: 2 }]); break;
      case 'fair': this.press([{ x: f.facing, a: true, n: 2 }]); break;
      case 'bair': this.press([{ x: -f.facing, a: true, n: 2 }]); break;
      case 'uair': this.press([{ y: -0.6, a: true, n: 2 }]); break;
      case 'dair': this.press([{ y: 0.55, a: true, n: 2 }]); break;
    }
  }
}
