'use strict';
// ===== 入力 =====
// raw入力: {x,y(上が負), a:攻撃, b:必殺, j:ジャンプ, s:ガード, g:つかみ, m:スマッシュ, cx,cy:スマッシュスティック, digital}
const BTNS = ['a', 'b', 'j', 's', 'g', 'm'];

class InputState {
  constructor() {
    this.frame = 100;
    this.x = 0; this.y = 0; this.px = 0; this.py = 0;
    this.digital = false;
    this.held = {}; this.prevHeld = {}; this.at = {}; this.used = {};
    for (const b of BTNS) { this.held[b] = false; this.prevHeld[b] = false; this.at[b] = -999; this.used[b] = -999; }
    this.histX = [0, 0, 0, 0]; this.histY = [0, 0, 0, 0];
    this.flickXAt = -999; this.flickYAt = -999; this.flickXDir = 0; this.flickYDir = 0;
    this.cAt = -999; this.cx = 0; this.cy = 0; this.cHeldPrev = false;
    this.relXAt = -999; this.relXDir = 0; this.dtapAt = -999;
    this.mash = 0;
  }
  update(raw) {
    this.frame++;
    const f = this.frame;
    this.digital = !!raw.digital;
    let x = raw.x || 0, y = raw.y || 0;
    const mag = Math.hypot(x, y);
    if (mag < 0.22) { x = 0; y = 0; } else if (mag > 1) { x /= mag; y /= mag; }
    this.px = this.x; this.py = this.y;
    this.x = x; this.y = y;
    for (const b of BTNS) {
      this.prevHeld[b] = this.held[b];
      this.held[b] = !!raw[b];
      if (this.held[b] && !this.prevHeld[b]) { this.at[b] = f; this.mash++; }
    }
    // フリック検出
    const minX = Math.min(...this.histX.map(Math.abs));
    const minY = Math.min(...this.histY.map(Math.abs));
    if (Math.abs(x) >= 0.75 && (Math.abs(this.px) < 0.75 || sign(this.px) !== sign(x)) && minX < 0.3) { this.flickXAt = f; this.flickXDir = sign(x); this.mash++; }
    if (Math.abs(y) >= 0.7 && (Math.abs(this.py) < 0.7 || sign(this.py) !== sign(y)) && minY < 0.3) { this.flickYAt = f; this.flickYDir = sign(y); }
    // デジタル入力の２度押し（ダッシュ）
    if (Math.abs(this.px) > 0.5 && Math.abs(x) < 0.5) { this.relXAt = f; this.relXDir = sign(this.px); }
    if (Math.abs(x) > 0.5 && Math.abs(this.px) < 0.5 && sign(x) === this.relXDir && f - this.relXAt < 14) this.dtapAt = f;
    this.histX.shift(); this.histX.push(x);
    this.histY.shift(); this.histY.push(y);
    // スマッシュスティック
    const cx = raw.cx || 0, cy = raw.cy || 0;
    const cHeld = Math.hypot(cx, cy) > 0.6;
    if (cHeld && !this.cHeldPrev) { this.cAt = f; this.cx = cx; this.cy = cy; }
    this.cHeldPrev = cHeld;
  }
  pressed(b) { return this.at[b] === this.frame; }
  // バッファ付き入力判定
  buf(b, n = 6) { return this.frame - this.at[b] <= n && this.at[b] > this.used[b]; }
  use(b) { this.used[b] = this.at[b]; }
  flickX(n = 4) { return this.frame - this.flickXAt <= n; }
  flickY(n = 4) { return this.frame - this.flickYAt <= n; }
  cstick(n = 3) { return this.frame - this.cAt <= n && this.cAt > (this.used.c || -999); }
  useC() { this.used.c = this.cAt; }
  dashTap() { return this.frame === this.dtapAt; }
}

// ===== キーボード =====
const Keys = { down: new Set() };
const KB_LAYOUTS = {
  kb1: {
    l: ['KeyA'], r: ['KeyD'], u: ['KeyW'], d: ['KeyS'],
    a: ['KeyJ'], b: ['KeyK'], j: ['KeyL', 'Space'], s: ['KeyI', 'ShiftLeft'], g: ['KeyO'], m: ['KeyU'],
  },
  // 1人でキーボードを使う時に追加で有効
  kb1solo: {
    l: ['ArrowLeft'], r: ['ArrowRight'], u: ['ArrowUp'], d: ['ArrowDown'],
    a: ['KeyZ'], b: ['KeyX'], j: ['KeyC'], s: ['KeyV'], g: ['KeyB'], m: ['KeyN'],
  },
  kb2: {
    l: ['ArrowLeft'], r: ['ArrowRight'], u: ['ArrowUp'], d: ['ArrowDown'],
    a: ['Numpad1', 'Comma'], b: ['Numpad2', 'Period'], j: ['Numpad3', 'Slash'], s: ['Numpad0', 'ShiftRight'],
    g: ['Numpad5', 'Semicolon'], m: ['Numpad4', 'KeyM'],
  },
};
const GAME_KEYS = new Set();
for (const l of Object.values(KB_LAYOUTS)) for (const arr of Object.values(l)) arr.forEach((k) => GAME_KEYS.add(k));

class KeyboardSource {
  constructor(layouts) { this.layouts = layouts; this.type = 'kb'; }
  any(key) {
    for (const L of this.layouts) for (const c of L[key]) if (Keys.down.has(c)) return true;
    return false;
  }
  read() {
    const r = { digital: true };
    r.x = (this.any('r') ? 1 : 0) - (this.any('l') ? 1 : 0);
    r.y = (this.any('d') ? 1 : 0) - (this.any('u') ? 1 : 0);
    for (const b of BTNS) r[b] = this.any(b);
    return r;
  }
}

// ===== ゲームパッド =====
function getPads() {
  try { return navigator.getGamepads ? Array.from(navigator.getGamepads()).filter((p) => p && p.connected) : []; } catch (e) { return []; }
}
class GamepadSource {
  constructor(n) { this.n = n; this.type = 'pad'; }
  read() {
    const p = getPads()[this.n];
    const r = { x: 0, y: 0 };
    if (!p) return r;
    const btn = (i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.4));
    r.x = p.axes[0] || 0; r.y = p.axes[1] || 0;
    if (btn(14)) r.x = -1; if (btn(15)) r.x = 1; if (btn(12)) r.y = -1; if (btn(13)) r.y = 1;
    r.a = btn(0); r.b = btn(1); r.j = btn(2) || btn(3);
    r.g = btn(4) || btn(5); r.s = btn(6) || btn(7);
    r.cx = p.axes[2] || 0; r.cy = p.axes[3] || 0;
    return r;
  }
}

class CpuSource {
  constructor() { this.type = 'cpu'; this.raw = { x: 0, y: 0 }; }
  read() { return this.raw; }
}

// ===== タッチ操作 =====
const Touch = {
  enabled: false, active: false, canvas: null,
  stick: { id: null, ox: 0, oy: 0, x: 0, y: 0 },
  buttons: [], ptrs: new Map(), sizeMul: 1, onPause: null,
  init(canvas) {
    this.canvas = canvas;
    const opt = { passive: false };
    canvas.addEventListener('pointerdown', (e) => this.down(e), opt);
    canvas.addEventListener('pointermove', (e) => this.move(e), opt);
    canvas.addEventListener('pointerup', (e) => this.up(e), opt);
    canvas.addEventListener('pointercancel', (e) => this.up(e), opt);
    canvas.addEventListener('lostpointercapture', (e) => this.up(e), opt);
  },
  layout(w, h) {
    // w,h: CSSピクセル
    const s = clamp(Math.min(w, h) / 380, 0.75, 1.35) * this.sizeMul;
    const R = 40 * s;
    const ex = w - Math.max(6, 0), ey = h;
    this.buttons = [
      { k: 'j', label: 'ジャンプ', x: ex - 1.2 * R, y: ey - 1.2 * R, r: R * 0.95, col: '#62e08a' },
      { k: 'a', label: '攻撃', x: ex - 3.4 * R, y: ey - 1.3 * R, r: R, col: '#ff5a5a' },
      { k: 'b', label: '必殺', x: ex - 1.2 * R, y: ey - 3.5 * R, r: R, col: '#5aa8ff' },
      { k: 'm', label: 'スマッシュ', x: ex - 5.5 * R, y: ey - 0.95 * R, r: R * 0.72, col: '#ff9a3c' },
      { k: 's', label: 'ガード', x: ex - 3.5 * R, y: ey - 3.6 * R, r: R * 0.72, col: '#ffc84a' },
      { k: 'g', label: 'つかみ', x: ex - 1.1 * R, y: ey - 5.45 * R, r: R * 0.62, col: '#c78bff' },
    ];
    this.pauseBtn = { x: 30 * s, y: 26 * s, r: 18 * s };
    this.stickR = 58 * s;
    this.w = w; this.h = h; this.s = s;
  },
  pos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  },
  hitBtn(x, y) {
    let best = null, bd = 1e9;
    for (const b of this.buttons) {
      const d = Math.hypot(x - b.x, y - b.y);
      if (d < b.r * 1.25 && d < bd) { bd = d; best = b; }
    }
    return best;
  },
  down(e) {
    if (!this.active || e.pointerType === 'mouse' && !this.enabled) return;
    this.enabled = true;
    e.preventDefault();
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
    const [x, y] = this.pos(e);
    const pb = this.pauseBtn;
    if (pb && Math.hypot(x - pb.x, y - pb.y) < pb.r * 1.4) { if (this.onPause) this.onPause(); return; }
    if (x < this.w * 0.42 && this.stick.id === null) {
      const st = this.stick;
      st.id = e.pointerId; st.ox = x; st.oy = y; st.x = x; st.y = y;
      this.ptrs.set(e.pointerId, 'stick');
      return;
    }
    const b = this.hitBtn(x, y);
    this.ptrs.set(e.pointerId, b ? b.k : null);
  },
  move(e) {
    if (!this.ptrs.has(e.pointerId)) return;
    e.preventDefault();
    const [x, y] = this.pos(e);
    const k = this.ptrs.get(e.pointerId);
    if (k === 'stick') {
      const st = this.stick;
      st.x = x; st.y = y;
      // 指が大きく離れたら原点を追従させる
      const dx = x - st.ox, dy = y - st.oy, d = Math.hypot(dx, dy), max = this.stickR * 1.3;
      if (d > max) { st.ox = x - (dx / d) * max; st.oy = y - (dy / d) * max; }
    } else {
      const b = this.hitBtn(x, y);
      if (b) this.ptrs.set(e.pointerId, b.k);
    }
  },
  up(e) {
    if (!this.ptrs.has(e.pointerId)) return;
    const k = this.ptrs.get(e.pointerId);
    if (k === 'stick') this.stick.id = null;
    this.ptrs.delete(e.pointerId);
  },
  reset() { this.ptrs.clear(); this.stick.id = null; },
  read() {
    const r = { x: 0, y: 0 };
    const st = this.stick;
    if (st.id !== null) {
      const dx = st.x - st.ox, dy = st.y - st.oy;
      r.x = clamp(dx / this.stickR, -1, 1);
      r.y = clamp(dy / this.stickR, -1, 1);
    }
    for (const k of this.ptrs.values()) if (k && k !== 'stick') r[k] = true;
    // ガード＋攻撃＝つかみ
    if (r.s && r.a) { r.g = true; r.a = false; }
    return r;
  },
  draw(ctx, dpr) {
    if (!this.active || !this.enabled) return;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const held = new Set(this.ptrs.values());
    // スティック
    const st = this.stick;
    const sx = st.id !== null ? st.ox : this.stickR * 1.6, sy = st.id !== null ? st.oy : this.h - this.stickR * 1.5;
    ctx.globalAlpha = st.id !== null ? 0.5 : 0.25;
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(sx, sy, this.stickR, 0, TAU); ctx.fill(); ctx.stroke();
    let kx = sx, ky = sy;
    if (st.id !== null) {
      const dx = st.x - st.ox, dy = st.y - st.oy, d = Math.hypot(dx, dy);
      const m = Math.min(d, this.stickR);
      if (d > 0) { kx = sx + (dx / d) * m; ky = sy + (dy / d) * m; }
    }
    ctx.globalAlpha = 0.7; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(kx, ky, this.stickR * 0.42, 0, TAU); ctx.fill();
    // ボタン
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const b of this.buttons) {
      const on = held.has(b.k);
      ctx.globalAlpha = on ? 0.85 : 0.42;
      ctx.fillStyle = on ? b.col : '#111';
      ctx.strokeStyle = b.col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(b.r * (b.label.length > 3 ? 0.36 : 0.48))}px sans-serif`;
      ctx.fillText(b.label, b.x, b.y + 1);
    }
    // ポーズ
    const pb = this.pauseBtn;
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(pb.x, pb.y, pb.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(pb.x - pb.r * 0.35, pb.y - pb.r * 0.4, pb.r * 0.22, pb.r * 0.8);
    ctx.fillRect(pb.x + pb.r * 0.13, pb.y - pb.r * 0.4, pb.r * 0.22, pb.r * 0.8);
    ctx.restore();
  },
};

class TouchSource {
  constructor() { this.type = 'touch'; }
  read() { return Touch.read(); }
}

// ===== メニュー操作用（キーボード＆パッド） =====
const MenuPad = {
  prev: {}, repeat: {},
  poll() {
    const ev = [];
    const pads = getPads();
    const state = { up: false, down: false, left: false, right: false, ok: false, back: false, start: false };
    for (const p of pads) {
      const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      state.up = state.up || b(12) || ay < -0.6;
      state.down = state.down || b(13) || ay > 0.6;
      state.left = state.left || b(14) || ax < -0.6;
      state.right = state.right || b(15) || ax > 0.6;
      state.ok = state.ok || b(0);
      state.back = state.back || b(1);
      state.start = state.start || b(9);
    }
    for (const k in state) {
      if (state[k]) {
        if (!this.prev[k]) { ev.push(k); this.repeat[k] = 18; }
        else if (['up', 'down', 'left', 'right'].includes(k) && --this.repeat[k] <= 0) { ev.push(k); this.repeat[k] = 6; }
      }
      this.prev[k] = state[k];
    }
    return ev;
  },
};
