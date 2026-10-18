'use strict';
// ===== 技データ =====
// 技定義:
//  dur: 全体フレーム  keys: [[frame, 部分ポーズ|'B', ease], ...] （前のキーに累積マージ。'B'で基本姿勢に戻す）
//  hb: [{f:[開始,終了], at:接続部位, off:[x,y], r, dmg, ang(度, 0=前方 90=上), bkb, kbg, el, g, rehit, grab}]
//  air: 空中技  land: 着地硬直  charge: {f} ため  next: {f, move} 連携
//  ev: {frame: fn(fighter)}  update: fn(fighter, frame)  helpless: 終了後しりもち
//  armor/intang/counter/reflect/noGrav: [開始,終了]

const STANCE = BASE_POSE;
const AIR_POSE = mkPose({ y: -48, r: 0.05, ff: [8, 26], bf: [-8, 30], fh: [14, 2], bh: [-4, 10] });
const CROUCH_POSE = mkPose({ y: -32, r: 0.3, ff: [14, 19], bf: [-12, 20], fh: [16, 10], bh: [8, 14] });

const EL = {
  hit: { c1: '#fffbe0', c2: '#ffb020', snd: 'hit' },
  fire: { c1: '#fff3a0', c2: '#ff5418', snd: 'hit' },
  elec: { c1: '#ffffff', c2: '#3fd8ff', snd: 'hit' },
  cut: { c1: '#ffffff', c2: '#8cc8ff', snd: 'slash' },
  rock: { c1: '#ffe9b8', c2: '#b8763a', snd: 'hit' },
  wind: { c1: '#f0fff6', c2: '#2fe0a0', snd: 'slash' },
  moon: { c1: '#ffffff', c2: '#c28bff', snd: 'slash' },
};

// 技をコンパイル（ポーズ展開・フレーム倍率適用）
function compileMove(name, def, opt = {}) {
  const spd = opt.spd || 1;
  const fs = (v) => Math.max(0, Math.round(v * spd));
  const m = Object.assign({}, def);
  m.name = name;
  m.dur = fs(def.dur);
  const base = def.base || (def.air ? AIR_POSE : STANCE);
  m.base = base;
  let cur = copyPose(base);
  m.keys = (def.keys || [[0, {}]]).map(([f, p, ease]) => {
    cur = p === 'B' ? copyPose(base) : mkPose(p, cur);
    return { f: fs(f), pose: cur, ease: ease || 'out' };
  });
  if (m.keys[0].f !== 0) m.keys.unshift({ f: 0, pose: copyPose(base), ease: 'out' });
  const dm = opt.dmg || 1, km = opt.kb || 1, rm = opt.reach || 1;
  m.hb = (def.hb || []).map((h) => {
    const o = Object.assign({ g: 0, el: def.el || opt.el || 'hit', off: [0, 0], bkb: 30, kbg: 80, ang: 45 }, h);
    o.f = [fs(h.f[0]), Math.max(fs(h.f[0]), fs(h.f[1]))];
    if (!h.fixDmg) o.dmg = Math.round((h.dmg || 0) * dm * 10) / 10;
    if (!h.fixKb) { o.bkb = o.bkb * km; o.kbg = o.kbg * (0.5 + km * 0.5); }
    o.r = (h.r || 10) * rm;
    if (o.rehit) o.rehit = Math.max(2, fs(o.rehit));
    return o;
  });
  for (const k of ['armor', 'intang', 'counter', 'reflect', 'noGrav']) if (def[k]) m[k] = [fs(def[k][0]), fs(def[k][1])];
  if (def.charge) m.charge = { f: fs(def.charge.f), max: def.charge.max || 60 };
  if (def.next) m.next = { f: fs(def.next.f), move: def.next.move };
  if (def.iasa) m.iasa = fs(def.iasa);
  if (def.land !== undefined) m.land = Math.round(def.land * (0.6 + spd * 0.4));
  if (def.throw) m.throw = Object.assign({}, def.throw, { f: fs(def.throw.f), dmg: def.throw.dmg * dm });
  if (def.ev) {
    m.ev = {};
    for (const k in def.ev) m.ev[fs(+k)] = def.ev[k];
  }
  m.spd = spd;
  // 最初の攻撃判定フレーム（AI・効果音用）
  m.first = m.hb.length ? Math.min(...m.hb.map((h) => h.f[0])) : null;
  return m;
}

// 現在フレームのポーズを求める
function movePose(m, fr, out) {
  const ks = m.keys;
  if (fr <= 0) return copyPose(ks[0].pose, out);
  for (let i = 1; i < ks.length; i++) {
    if (fr <= ks[i].f) {
      const a = ks[i - 1], b = ks[i];
      let t = b.f === a.f ? 1 : (fr - a.f) / (b.f - a.f);
      t = b.ease === 'in' ? easeIn(t) : b.ease === 'lin' ? t : b.ease === 'io' ? easeInOut(t) : easeOut(t);
      return lerpPose(a.pose, b.pose, t, out);
    }
  }
  return copyPose(ks[ks.length - 1].pose, out);
}

// ===== 素手の基本技（ブレイズ基準） =====
function unarmedMoves(el) {
  const E = el || 'hit';
  return {
    jab1: {
      dur: 16, kind: 'jab', sfx: 'whoosh',
      keys: [[0, { fh: [10, 6], r: 0.1 }], [2, { fh: [28, -3], r: 0.22, x: 3 }], [6, { fh: [22, 0] }], [14, 'B']],
      hb: [{ f: [2, 3], at: 'fh', r: 11, dmg: 2.5, ang: 78, bkb: 14, kbg: 22 }], next: { f: 5, move: 'jab2' },
    },
    jab2: {
      dur: 16, kind: 'jab', sfx: 'whoosh',
      keys: [[0, { fh: [16, 4], bh: [12, 2], r: 0.15, x: 2 }], [2, { bh: [31, -5], fh: [8, 8], r: 0.3, x: 5 }], [6, { bh: [24, 0] }], [14, 'B']],
      hb: [{ f: [2, 3], at: 'bh', r: 11, dmg: 2.5, ang: 78, bkb: 14, kbg: 22 }], next: { f: 5, move: 'jab3' },
    },
    jab3: {
      dur: 28, kind: 'jab', sfx: 'whoosh',
      keys: [[0, { r: -0.05, ff: [4, 22], fh: [8, 6] }], [4, { ff: [36, -10], r: -0.4, x: -2, bf: [-4, 33], fh: [-6, 4], bh: [-14, 6] }], [9, { ff: [33, -6] }], [24, 'B']],
      hb: [{ f: [4, 6], at: 'ff', r: 14, dmg: 5, ang: 40, bkb: 48, kbg: 95, el: E }, { f: [4, 6], at: 'fk', r: 11, dmg: 5, ang: 40, bkb: 48, kbg: 95 }],
    },
    ftilt: {
      dur: 26, kind: 'tilt', sfx: 'whoosh',
      keys: [[0, { r: 0, ff: [6, 26] }], [5, { ff: [38, -4], r: -0.3, bf: [-5, 33], fh: [2, 10], bh: [-14, 4], x: -2 }], [10, { ff: [36, -2] }], [24, 'B']],
      hb: [{ f: [5, 8], at: 'ff', r: 15, dmg: 9, ang: 35, bkb: 30, kbg: 98 }, { f: [5, 8], at: 'fk', r: 11, dmg: 8, ang: 35, bkb: 28, kbg: 95 }],
    },
    utilt: {
      dur: 24, kind: 'tilt', sfx: 'whoosh',
      keys: [[0, { fh: [18, 14], r: 0.2 }], [3, { fh: [26, -6], r: 0.05 }], [6, { fh: [10, -30], r: -0.15, bh: [-10, 10] }], [9, { fh: [-14, -24], r: -0.25 }], [21, 'B']],
      hb: [{ f: [3, 9], at: 'fh', r: 15, dmg: 7, ang: 95, bkb: 40, kbg: 100 }, { f: [3, 9], at: 'fe', r: 11, dmg: 7, ang: 95, bkb: 40, kbg: 100 }],
    },
    dtilt: {
      dur: 18, kind: 'tilt', base: CROUCH_POSE, sfx: 'whoosh',
      keys: [[0, {}], [4, { ff: [40, 16], r: 0.35, bf: [-14, 20], fh: [6, 14] }], [8, { ff: [36, 16] }], [16, 'B']],
      hb: [{ f: [4, 6], at: 'ff', r: 13, dmg: 6, ang: 78, bkb: 32, kbg: 55 }],
    },
    dash: {
      dur: 32, kind: 'dash', slide: 0.95, sfx: 'whoosh',
      keys: [[0, { r: 0.3 }], [4, { y: -52, ff: [34, -2], bf: [-10, 22], r: -0.2, fh: [-6, -12], bh: [-18, 2] }], [14, {}], [30, 'B']],
      hb: [{ f: [4, 8], at: 'ff', r: 15, dmg: 10, ang: 50, bkb: 55, kbg: 75, el: E }, { f: [9, 14], at: 'ff', r: 12, dmg: 6, ang: 60, bkb: 40, kbg: 55, g: 0 }],
      ev: { 0: (f) => { f.vx = f.facing * Math.max(Math.abs(f.vx), f.st.run); } },
    },
    fsmash: {
      dur: 44, kind: 'smash', charge: { f: 7 }, sfx: 'bigwhoosh',
      keys: [[0, {}], [6, { x: -6, r: -0.3, fh: [-16, 2], bh: [12, 0], ff: [12, 33], bf: [-12, 33] }], [10, { x: -7, r: -0.33 }],
        [12, { x: 8, r: 0.4, fh: [34, -3], bh: [-16, 8], ff: [18, 31], bf: [-16, 33] }, 'lin'], [18, {}], [40, 'B']],
      hb: [{ f: [12, 14], at: 'fh', r: 17, dmg: 16, ang: 38, bkb: 32, kbg: 100, el: E }, { f: [12, 14], at: 'fe', r: 12, dmg: 15, ang: 38, bkb: 30, kbg: 100, el: E }],
    },
    usmash: {
      dur: 40, kind: 'smash', charge: { f: 6 }, sfx: 'bigwhoosh',
      keys: [[0, { y: -36, r: 0.25, fh: [14, 14], bh: [8, 16], ff: [12, 23], bf: [-12, 23] }], [8, {}],
        [11, { y: -54, r: -0.15, fh: [6, -34], bh: [-12, 8], ff: [4, 30], bf: [-8, 36] }, 'lin'], [17, {}], [36, 'B']],
      hb: [{ f: [10, 14], at: 'fh', r: 18, dmg: 15, ang: 88, bkb: 34, kbg: 97, el: E }, { f: [10, 14], at: 'head', r: 15, dmg: 14, ang: 85, bkb: 30, kbg: 97 }],
    },
    dsmash: {
      dur: 40, kind: 'smash', charge: { f: 5 }, sfx: 'bigwhoosh',
      keys: [[0, { y: -38, r: 0.1, ff: [10, 25], bf: [-10, 25] }], [7, {}],
        [9, { y: -30, r: 0, ff: [38, 15], bf: [-38, 15], fh: [10, -12], bh: [-12, -10] }, 'lin'], [16, {}], [36, 'B']],
      hb: [{ f: [9, 11], at: 'ff', r: 15, dmg: 13, ang: 28, bkb: 36, kbg: 95, el: E }, { f: [9, 11], at: 'bf', r: 15, dmg: 13, ang: 152, bkb: 36, kbg: 95, el: E }],
    },
    nair: {
      dur: 34, air: 1, land: 7, kind: 'aerial', sfx: 'whoosh',
      keys: [[0, { ff: [8, 18], bf: [-6, 22] }], [3, { ff: [34, 4], bf: [-8, 26], r: -0.15, fh: [0, -8], bh: [-14, 0] }], [22, {}], [32, 'B']],
      hb: [{ f: [3, 7], at: 'ff', r: 15, dmg: 9, ang: 45, bkb: 25, kbg: 95 }, { f: [3, 7], at: 'fk', r: 12, dmg: 9, ang: 45, bkb: 25, kbg: 95 },
        { f: [8, 22], at: 'ff', r: 13, dmg: 5, ang: 45, bkb: 20, kbg: 70 }],
    },
    fair: {
      dur: 34, air: 1, land: 12, kind: 'aerial', sfx: 'whoosh',
      keys: [[0, { ff: [2, 16], r: 0.15, fh: [4, -6] }], [5, { ff: [22, -30], r: -0.25 }], [8, { ff: [36, 0], r: 0.15 }], [11, { ff: [24, 24], r: 0.25 }], [32, 'B']],
      hb: [{ f: [6, 10], at: 'ff', r: 16, dmg: 12, ang: 42, bkb: 30, kbg: 95, el: E }],
    },
    bair: {
      dur: 30, air: 1, land: 10, kind: 'aerial', sfx: 'whoosh',
      keys: [[0, { bf: [-2, 20], ff: [8, 22], r: 0.15 }], [5, { bf: [-38, -4], r: 0.5, ff: [10, 18], fh: [12, -4], bh: [4, 4] }], [9, {}], [28, 'B']],
      hb: [{ f: [5, 8], at: 'bf', r: 16, dmg: 13, ang: 145, bkb: 30, kbg: 100, el: E }, { f: [9, 13], at: 'bf', r: 13, dmg: 8, ang: 145, bkb: 20, kbg: 80 }],
    },
    uair: {
      dur: 28, air: 1, land: 8, kind: 'aerial', sfx: 'whoosh',
      keys: [[0, { ff: [12, 20], r: 0.1 }], [4, { ff: [26, -26], r: -0.4 }], [7, { ff: [0, -44], r: -0.6, bf: [-4, 24] }], [10, { ff: [-22, -24], r: -0.5 }], [26, 'B']],
      hb: [{ f: [4, 10], at: 'ff', r: 15, dmg: 9, ang: 85, bkb: 36, kbg: 98 }],
    },
    dair: {
      dur: 38, air: 1, land: 16, kind: 'aerial', sfx: 'whoosh',
      keys: [[0, { y: -54, ff: [8, 10], bf: [-6, 12], fh: [12, -12], bh: [-12, -10] }], [10, { y: -56 }],
        [12, { ff: [3, 38], bf: [-3, 36], r: 0, fh: [16, -4], bh: [-16, -4] }, 'lin'], [20, {}], [36, 'B']],
      hb: [{ f: [12, 14], at: 'ff', r: 16, dmg: 13, ang: 270, bkb: 22, kbg: 85, el: E }, { f: [15, 22], at: 'ff', r: 13, dmg: 9, ang: 65, bkb: 20, kbg: 70 }],
    },
    grab: {
      dur: 30, kind: 'grab',
      keys: [[0, {}], [6, { fh: [28, 2], bh: [24, 6], r: 0.2, x: 2 }], [10, {}], [28, 'B']],
      hb: [{ f: [6, 8], at: 'fh', r: 16, grab: 1 }],
    },
    dashgrab: {
      dur: 36, kind: 'grab', slide: 0.9,
      keys: [[0, { r: 0.3 }], [8, { fh: [32, 4], bh: [28, 8], r: 0.35, x: 4 }], [12, {}], [34, 'B']],
      hb: [{ f: [8, 10], at: 'fh', r: 17, grab: 1 }],
    },
    pummel: {
      dur: 14, kind: 'throw', hold: 'fh',
      keys: [[0, { fh: [22, 2] }], [3, { bh: [26, -2], r: 0.25 }], [8, { bh: [6, 12], r: 0.1 }]],
      ev: { 3: (f) => f.pummelHit() },
    },
    fthrow: {
      dur: 26, kind: 'throw', hold: 'fh', throw: { f: 9, dmg: 8, ang: 40, bkb: 62, kbg: 62 },
      keys: [[0, { fh: [18, 4], bh: [14, 6] }], [6, { fh: [8, 6], r: -0.05, x: -2 }], [9, { fh: [32, 0], bh: [28, 4], r: 0.35, x: 6 }], [24, 'B']],
    },
    bthrow: {
      dur: 30, kind: 'throw', hold: 'fh', throw: { f: 12, dmg: 10, ang: 140, bkb: 62, kbg: 72 },
      keys: [[0, { fh: [18, 4] }], [6, { fh: [-2, -10], r: -0.2 }], [12, { fh: [-30, 0], r: -0.4 }], [28, 'B']],
    },
    uthrow: {
      dur: 28, kind: 'throw', hold: 'fh', throw: { f: 10, dmg: 7, ang: 90, bkb: 70, kbg: 62 },
      keys: [[0, { fh: [18, 4] }], [5, { fh: [14, 16], y: -40 }], [10, { fh: [6, -34], bh: [-2, -30], y: -50 }], [26, 'B']],
    },
    dthrow: {
      dur: 28, kind: 'throw', hold: 'fh', throw: { f: 12, dmg: 6, ang: 78, bkb: 64, kbg: 38 },
      keys: [[0, { fh: [18, 4] }], [6, { fh: [20, -20], y: -48 }], [12, { fh: [24, 24], y: -34, r: 0.4 }], [26, 'B']],
    },
    getupatk: {
      dur: 30, kind: 'getup', base: CROUCH_POSE, intang: [0, 10],
      keys: [[0, { y: -20, r: 0.6 }], [6, { ff: [36, 10], y: -26 }], [9, { ff: [10, 18] }], [12, { bf: [-36, 10] }], [16, { bf: [-12, 20] }], [28, 'B']],
      hb: [{ f: [6, 8], at: 'ff', r: 16, dmg: 7, ang: 40, bkb: 55, kbg: 45 }, { f: [11, 13], at: 'bf', r: 16, dmg: 7, ang: 140, bkb: 55, kbg: 45, g: 1 }],
    },
    ledgeatk: {
      dur: 36, kind: 'ledge', intang: [0, 16],
      keys: [[0, { y: -40, r: 0.4, ff: [6, 20], bf: [-6, 24] }], [12, {}], [15, { ff: [38, -6], r: -0.3, y: -46 }], [20, {}], [34, 'B']],
      hb: [{ f: [15, 18], at: 'ff', r: 17, dmg: 9, ang: 40, bkb: 62, kbg: 40 }],
    },
  };
}

// ===== 剣技（ルナ） =====
function swordMoves() {
  const S = { fh: [14, 10], bh: [-2, 14], w: -1.0 };
  const base = mkPose(S);
  const air = mkPose(Object.assign({}, S, { y: -48, ff: [8, 26], bf: [-8, 30] }));
  const W = (t, h) => Object.assign({ at: 'wpn', t }, h);
  return {
    jab1: {
      dur: 18, kind: 'jab', base, sfx: 'slash', el: 'cut',
      keys: [[0, { fh: [8, 4], w: -1.6 }], [2, { fh: [26, 0], w: 0.2, r: 0.2, x: 3 }], [7, {}], [16, 'B']],
      hb: [W(0.95, { f: [2, 3], r: 13, dmg: 3, ang: 70, bkb: 16, kbg: 25 }), W(0.4, { f: [2, 3], r: 11, dmg: 3, ang: 70, bkb: 16, kbg: 25 })],
      next: { f: 6, move: 'jab2' },
    },
    jab2: {
      dur: 28, kind: 'jab', base, sfx: 'slash', el: 'cut',
      keys: [[0, { fh: [20, 0], w: 0.4 }], [3, { fh: [26, -14], w: -1.4, r: 0.1 }], [6, { fh: [24, 10], w: 1.0, r: 0.3, x: 4 }, 'lin'], [12, {}], [26, 'B']],
      hb: [W(0.95, { f: [4, 6], r: 14, dmg: 5, ang: 42, bkb: 45, kbg: 90 }), W(0.45, { f: [4, 6], r: 12, dmg: 5, ang: 42, bkb: 45, kbg: 90 })],
    },
    ftilt: {
      dur: 30, kind: 'tilt', base, sfx: 'slash', el: 'cut',
      keys: [[0, { fh: [6, 2], w: -2.4, r: -0.1 }], [6, { fh: [10, -6], w: -2.6 }], [9, { fh: [28, 0], w: 0.25, r: 0.3, x: 5 }, 'lin'], [14, {}], [28, 'B']],
      hb: [W(0.95, { f: [8, 10], r: 15, dmg: 11, ang: 38, bkb: 30, kbg: 95 }), W(0.5, { f: [8, 10], r: 13, dmg: 9, ang: 38, bkb: 30, kbg: 92 })],
    },
    utilt: {
      dur: 28, kind: 'tilt', base, sfx: 'slash', el: 'cut',
      keys: [[0, { fh: [18, 4], w: 0.3 }], [5, { fh: [18, -10], w: -0.6 }], [9, { fh: [4, -28], w: -2.4, r: -0.15 }, 'lin'], [13, { fh: [-12, -20], w: -3.0 }], [26, 'B']],
      hb: [W(0.9, { f: [6, 12], r: 16, dmg: 8, ang: 92, bkb: 40, kbg: 98 }), W(0.4, { f: [6, 12], r: 12, dmg: 8, ang: 92, bkb: 40, kbg: 98 })],
    },
    dtilt: {
      dur: 22, kind: 'tilt', base: mkPose(Object.assign({}, CROUCH_POSE, { w: 0.1, fh: [18, 10] })), sfx: 'slash', el: 'cut',
      keys: [[0, {}], [5, { fh: [32, 14], w: 0.12, r: 0.45 }], [9, {}], [20, 'B']],
      hb: [W(0.95, { f: [5, 8], r: 13, dmg: 7, ang: 30, bkb: 35, kbg: 60 }), W(0.5, { f: [5, 8], r: 11, dmg: 6, ang: 30, bkb: 35, kbg: 60 })],
    },
    dash: {
      dur: 34, kind: 'dash', base, slide: 0.95, sfx: 'slash', el: 'cut',
      keys: [[0, { fh: [-6, 4], w: -2.8, r: 0.4 }], [6, { fh: [28, -2], w: 0.1, r: 0.4, x: 6 }, 'lin'], [14, {}], [32, 'B']],
      hb: [W(0.95, { f: [6, 10], r: 16, dmg: 11, ang: 45, bkb: 50, kbg: 75 }), W(0.4, { f: [6, 10], r: 13, dmg: 9, ang: 45, bkb: 50, kbg: 70 })],
      ev: { 0: (f) => { f.vx = f.facing * Math.max(Math.abs(f.vx), f.st.run); } },
    },
    fsmash: {
      dur: 50, kind: 'smash', base, charge: { f: 10 }, sfx: 'bigwhoosh', el: 'moon',
      keys: [[0, {}], [9, { fh: [-4, -24], w: -1.9, r: -0.35, x: -5, bh: [-6, -20] }], [12, { fh: [-6, -26], w: -2.1 }],
        [15, { fh: [28, 6], w: 0.6, r: 0.5, x: 8, bh: [20, 10], ff: [18, 32], bf: [-18, 33] }, 'lin'], [22, {}], [46, 'B']],
      hb: [W(1.0, { f: [14, 16], r: 18, dmg: 20, ang: 38, bkb: 36, kbg: 100 }), W(0.55, { f: [14, 16], r: 14, dmg: 14, ang: 40, bkb: 30, kbg: 95 })],
    },
    usmash: {
      dur: 44, kind: 'smash', base, charge: { f: 7 }, sfx: 'bigwhoosh', el: 'moon',
      keys: [[0, { y: -38, fh: [10, 14], w: 1.2, ff: [12, 25], bf: [-12, 25] }], [9, {}],
        [12, { y: -50, fh: [4, -30], w: -1.57, r: -0.05, ff: [6, 32], bf: [-8, 34] }, 'lin'], [20, {}], [40, 'B']],
      hb: [W(0.95, { f: [11, 16], r: 18, dmg: 17, ang: 90, bkb: 36, kbg: 96 }), W(0.45, { f: [11, 16], r: 14, dmg: 14, ang: 88, bkb: 32, kbg: 95 })],
    },
    dsmash: {
      dur: 44, kind: 'smash', base: mkPose(Object.assign({}, CROUCH_POSE, { w: 0.1, fh: [18, 10] })), charge: { f: 6 }, sfx: 'bigwhoosh', el: 'moon',
      keys: [[0, {}], [8, { fh: [34, 14], w: 0.15, r: 0.4 }, 'lin'], [12, { fh: [10, 12], w: 2.0 }], [16, { fh: [-30, 12], w: 3.0, r: 0.1 }, 'lin'], [22, {}], [40, 'B']],
      hb: [W(0.95, { f: [8, 9], r: 15, dmg: 14, ang: 25, bkb: 38, kbg: 92 }), W(0.95, { f: [15, 17], r: 15, dmg: 15, ang: 155, bkb: 38, kbg: 95, g: 1 })],
    },
    nair: {
      dur: 38, air: 1, land: 8, kind: 'aerial', base: air, sfx: 'slash', el: 'cut',
      keys: [[0, { fh: [16, -4], w: -1.4 }], [4, { fh: [22, 4], w: 0.0, rot: 0 }], [16, { rot: -TAU, fh: [22, 4] }, 'lin'], [22, {}], [36, 'B']],
      hb: [W(0.9, { f: [4, 9], r: 16, dmg: 10, ang: 45, bkb: 30, kbg: 90 }), W(0.4, { f: [4, 9], r: 13, dmg: 9, ang: 45, bkb: 30, kbg: 90 }),
        W(0.9, { f: [10, 16], r: 14, dmg: 6, ang: 50, bkb: 20, kbg: 70 })],
    },
    fair: {
      dur: 34, air: 1, land: 10, kind: 'aerial', base: air, sfx: 'slash', el: 'cut',
      keys: [[0, { fh: [6, -22], w: -1.9, r: -0.1 }], [5, {}], [8, { fh: [26, 8], w: 0.9, r: 0.3 }, 'lin'], [13, {}], [32, 'B']],
      hb: [W(0.95, { f: [6, 9], r: 17, dmg: 12, ang: 42, bkb: 32, kbg: 92 }), W(0.45, { f: [6, 9], r: 13, dmg: 10, ang: 42, bkb: 30, kbg: 90 })],
    },
    bair: {
      dur: 34, air: 1, land: 11, kind: 'aerial', base: air, sfx: 'slash', el: 'moon',
      keys: [[0, { fh: [10, 2], w: -0.3 }], [6, { fh: [-6, -8], w: -2.5, r: -0.2 }], [9, { fh: [-24, 6], w: 3.4, r: -0.35 }, 'lin'], [14, {}], [32, 'B']],
      hb: [W(0.95, { f: [8, 10], r: 17, dmg: 14, ang: 145, bkb: 32, kbg: 98 }), W(0.45, { f: [8, 10], r: 13, dmg: 11, ang: 145, bkb: 30, kbg: 95 })],
    },
    uair: {
      dur: 32, air: 1, land: 9, kind: 'aerial', base: air, sfx: 'slash', el: 'cut',
      keys: [[0, { fh: [20, 0], w: 0 }], [5, {}], [10, { fh: [-16, -14], w: -3.4, r: -0.2 }, 'lin'], [14, {}], [30, 'B']],
      hb: [W(0.95, { f: [6, 10], r: 17, dmg: 11, ang: 88, bkb: 36, kbg: 96 }), W(0.45, { f: [6, 10], r: 13, dmg: 9, ang: 88, bkb: 34, kbg: 94 })],
    },
    dair: {
      dur: 40, air: 1, land: 17, kind: 'aerial', base: air, sfx: 'slash', el: 'moon',
      keys: [[0, { fh: [8, -20], w: -1.57, y: -52 }], [10, {}], [13, { fh: [6, 22], w: 1.57, y: -56, ff: [6, 20], bf: [-6, 22] }, 'lin'], [22, {}], [38, 'B']],
      hb: [W(0.95, { f: [13, 16], r: 15, dmg: 14, ang: 270, bkb: 25, kbg: 85 }), W(0.4, { f: [13, 16], r: 13, dmg: 10, ang: 60, bkb: 25, kbg: 75 })],
    },
  };
}

function scaleMoveSet(set, o) {
  // AIで使う範囲推定などは compile 後に行う
  return set;
}
