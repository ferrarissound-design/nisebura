'use strict';
// ===== キャラクター定義 =====
const W = (t, h) => Object.assign({ at: 'wpn', t }, h);

// ---------- ブレイズ：炎の拳士（バランス型） ----------
const BLAZE_SPECIALS = {
  nspec: {
    dur: 32, kind: 'special', land: 8,
    keys: [[0, { fh: [6, 4], bh: [2, 6], r: -0.1 }], [8, { fh: [30, -2], bh: [26, 2], r: 0.25, x: 4 }, 'lin'], [14, {}], [30, 'B']],
    ev: { 8: (f) => { if (f.countProj('fireball') < 2) f.proj('fireball', { at: 'fh', vx: 9.5, vy: 0 }); f.sfx('fire'); } },
  },
  sspec: {
    dur: 42, kind: 'special', once: 'side', noGrav: [0, 26], edgeStop: false, land: 14, stopOnHit: 26,
    keys: [[0, { y: -40, r: 0.4, fh: [-8, 6], bh: [-14, 8] }], [8, {}], [10, { y: -46, r: 0.55, fh: [30, -4], bh: [-20, 2], ff: [10, 26], bf: [-22, 24] }, 'lin'], [24, {}], [40, 'B']],
    update: (f, fr) => {
      if (fr < 8) { f.vx *= 0.8; f.vy *= 0.4; }
      else if (fr <= 24) { f.vx = f.facing * 14.5; f.vy = 0; if (fr % 2 === 0) f.fxAt('flame', 'center'); if (fr === 10) f.sfx('fire'); }
      else if (fr === 25) f.vx = f.facing * 4;
    },
    hb: [{ f: [10, 24], at: 'fh', r: 22, dmg: 11, ang: 40, bkb: 52, kbg: 78, el: 'fire' }, { f: [10, 24], at: 'center', r: 20, dmg: 9, ang: 40, bkb: 48, kbg: 72, el: 'fire' }],
  },
  uspec: {
    dur: 46, kind: 'special', helpless: 1, land: 16, edgeStop: false, intang: [3, 6], turn: true,
    keys: [[0, { y: -36, r: 0.3, fh: [10, 14] }], [5, { y: -52, r: -0.15, fh: [8, -34], bh: [-12, 6], ff: [4, 30], bf: [-8, 34] }, 'lin'], [20, {}], [30, { fh: [12, -18], r: 0 }], [44, {}]],
    ev: { 5: (f) => { f.vy = -16.5; f.vx = f.facing * 1.5 + f.inp.x * 2.5; f.sfx('fire'); } },
    update: (f, fr) => {
      if (fr < 5) { f.vy *= 0.5; f.vx *= 0.8; }
      if (fr >= 5 && fr <= 20) { f.vy = -16.5 + (fr - 5) * 0.75; f.vx = approach(f.vx, f.inp.x * 3, 0.3); f.fxAt('flame', 'fh'); }
    },
    hb: [{ f: [5, 14], at: 'fh', r: 17, dmg: 2, ang: 'link', rehit: 3, el: 'fire' },
      { f: [15, 18], at: 'fh', r: 20, dmg: 6, ang: 80, bkb: 65, kbg: 88, el: 'fire', g: 1 }],
  },
  dspec: {
    dur: 52, kind: 'special', land: 12,
    keys: [[0, { y: -40, r: 0.2, fh: [6, 8], bh: [2, 10] }], [16, { y: -38, fh: [2, 4], bh: [-2, 6], r: 0.35 }],
      [18, { y: -48, r: -0.1, fh: [30, -20], bh: [-30, -20], ff: [16, 33], bf: [-16, 33] }, 'lin'], [30, {}], [50, 'B']],
    update: (f, fr) => {
      if (!f.grounded && fr < 22) { f.vy = Math.min(f.vy, 1.5); f.vx *= 0.95; }
      if (fr < 16 && fr % 3 === 0) f.fxAt('charge', 'center', { col: '#ff7a20' });
    },
    ev: { 18: (f) => { f.fxAt('explosion', 'center', { r: 80, col: '#ff6a1a' }); f.sfx('boom'); f.battle.shake(7); } },
    hb: [{ f: [18, 21], at: 'center', r: 50, dmg: 18, ang: 55, bkb: 48, kbg: 92, el: 'fire' }],
  },
};

// ---------- ゴルドー：岩の巨人（重量級） ----------
const GOLDO_SPECIALS = {
  nspec: {
    dur: 46, kind: 'special', land: 10,
    keys: [[0, {}], [10, { fh: [2, -34], bh: [-6, -32], r: -0.25, x: -3 }], [18, { fh: [30, -10], bh: [24, -6], r: 0.35, x: 5 }, 'lin'], [26, {}], [44, 'B']],
    ev: { 18: (f) => { f.proj('rock', { at: 'fh', vx: 8.5, vy: -6.5 }); f.sfx('bigwhoosh'); } },
    update: (f, fr) => { f.holdRock = fr < 18; },
  },
  sspec: {
    dur: 54, kind: 'special', once: 'side', armor: [6, 32], noGrav: [6, 32], edgeStop: false, land: 16, stopOnHit: 33,
    keys: [[0, { x: -6, r: -0.1, fh: [-6, 10] }], [8, { x: -8, r: 0.6, y: -40, fh: [14, 4], bh: [10, 8] }], [10, { x: 4 }], [32, {}], [52, 'B']],
    update: (f, fr) => {
      if (fr < 8) { f.vx *= 0.8; if (!f.grounded) f.vy *= 0.6; }
      else if (fr <= 32) { f.vx = f.facing * 11; if (!f.grounded) f.vy = 0.5; if (fr % 3 === 0) f.fxAt(f.grounded ? 'dust' : 'puff', f.grounded ? 'feet' : 'center'); if (fr === 9) f.sfx('dash'); }
      else f.vx *= 0.85;
    },
    hb: [{ f: [10, 32], at: 'center', off: [14, 0], r: 27, dmg: 14, ang: 38, bkb: 58, kbg: 82, el: 'rock' }],
  },
  uspec: {
    dur: 44, kind: 'special', helpless: 1, land: 18, armor: [4, 14], edgeStop: false, turn: true,
    keys: [[0, { y: -34, r: 0.35, fh: [16, 14], bh: [10, 16] }], [7, { y: -52, r: -0.1, fh: [10, -30], bh: [-10, -30], ff: [6, 28], bf: [-8, 30] }, 'lin'], [30, {}], [42, { fh: [16, -10], bh: [-16, -8] }]],
    ev: { 7: (f) => { f.vy = -19.5; f.vx = f.facing * 2 + f.inp.x * 3; f.sfx('jump'); f.fxAt('ring', 'feet'); } },
    update: (f, fr) => { if (fr < 7) { f.vy *= 0.5; f.vx *= 0.8; } if (fr > 7) f.vx = approach(f.vx, f.inp.x * 5, 0.3); },
    hb: [{ f: [7, 16], at: 'fh', r: 23, dmg: 11, ang: 85, bkb: 55, kbg: 80, el: 'rock' }],
  },
  dspec: {
    dur: 48, kind: 'special',
    keys: [[0, {}], [10, { y: -50, ff: [14, -6], r: -0.15, fh: [14, -10], bh: [-14, -8] }], [14, { y: -42, ff: [16, 33], r: 0.2 }, 'lin'], [30, {}], [46, 'B']],
    ev: { 14: (f) => GOLDO_QUAKE(f) },
    hb: [{ f: [14, 16], at: 'ff', r: 30, dmg: 12, ang: 80, bkb: 55, kbg: 70, el: 'rock' }],
  },
  dspec_air: {
    dur: 90, kind: 'special', helpless: 1, edgeStop: false,
    keys: [[0, { y: -52, ff: [8, 14], bf: [-8, 16], fh: [18, -18], bh: [-18, -18] }], [8, { ff: [4, 32], bf: [-4, 32], fh: [16, -28], bh: [-16, -28] }]],
    update: (f, fr) => {
      if (fr < 8) { f.vy = -2; f.vx *= 0.8; }
      else { f.vy = 19; f.vx = f.inp.x * 1.5; if (fr % 2 === 0) f.fxAt('puff', 'center'); }
    },
    hb: [{ f: [8, 90], at: 'ff', r: 22, dmg: 14, ang: 285, bkb: 40, kbg: 65, el: 'rock' }],
    onLand: (f) => { f.startMove('dspec_land'); return true; },
  },
  dspec_land: {
    dur: 32, kind: 'special',
    keys: [[0, { y: -40, ff: [16, 33], bf: [-14, 33], r: 0.2, fh: [18, 4], bh: [-14, 6] }], [14, {}], [30, 'B']],
    ev: { 0: (f) => GOLDO_QUAKE(f) },
    hb: [{ f: [0, 2], at: 'center', r: 34, dmg: 12, ang: 80, bkb: 55, kbg: 70, el: 'rock' }],
  },
};
function GOLDO_QUAKE(f) {
  f.sfx('rock'); f.battle.shake(9);
  f.fxAt('quake', 'feet');
  for (const d of [-1, 1]) f.proj('shock', { at: 'feet', vx: 8 * d, vy: 0, dir: d });
}

// ---------- ミュウ：風の忍者（スピード型） ----------
const MYU_SPECIALS = {
  nspec: {
    dur: 20, kind: 'special', land: 6,
    keys: [[0, { fh: [-4, -6], r: -0.1 }], [5, { fh: [30, -2], r: 0.25, x: 3 }, 'lin'], [10, {}], [18, 'B']],
    ev: { 5: (f) => { if (f.countProj('shuriken') < 3) { f.proj('shuriken', { at: 'fh', vx: 14, vy: 0 }); f.sfx('slash'); } } },
  },
  sspec: {
    dur: 36, kind: 'special', once: 'side', noGrav: [0, 16], intang: [5, 12], edgeStop: false, land: 12,
    keys: [[0, { y: -38, r: 0.5, fh: [-10, 4] }], [4, {}], [5, { y: -40, r: 0.7, fh: [30, 0], bh: [-24, 4], ff: [14, 24], bf: [-30, 22] }, 'lin'], [14, {}], [34, 'B']],
    update: (f, fr) => {
      if (fr < 5) { f.vx *= 0.6; f.vy = 0; }
      else if (fr <= 12) { f.vx = f.facing * 21; f.vy = 0; f.fxAt('after', 'center'); if (fr === 5) f.sfx('slash'); }
      else if (fr <= 16) { f.vx *= 0.6; f.vy = 0; }
    },
    hb: [{ f: [5, 13], at: 'center', r: 27, dmg: 9, ang: 40, bkb: 45, kbg: 78, el: 'wind' }],
  },
  uspec: {
    dur: 48, kind: 'special', helpless: 1, land: 14, edgeStop: false, turn: true,
    keys: [[0, { y: -40, r: 0.2 }], [4, { y: -48, r: 0, fh: [24, -6], bh: [-24, -6], ff: [6, 30], bf: [-6, 32], rot: 0 }],
      [34, { rot: TAU * 4 }, 'lin'], [46, { rot: TAU * 4, fh: [10, 4], bh: [-6, 8] }]],
    update: (f, fr) => {
      if (fr < 4) { f.vy *= 0.4; f.vx *= 0.8; }
      if (fr >= 4 && fr <= 34) { f.vy = approach(f.vy, -10.5, 1.6); f.vx = approach(f.vx, f.inp.x * 5.5, 0.6); if (fr % 2 === 0) f.fxAt('wind', 'center'); if (fr % 8 === 4) f.sfx('whoosh', 1.3); }
    },
    hb: [{ f: [4, 30], at: 'center', r: 31, dmg: 1.6, ang: 'link', rehit: 4, el: 'wind' },
      { f: [31, 34], at: 'center', r: 35, dmg: 4, ang: 85, bkb: 62, kbg: 85, el: 'wind', g: 1 }],
  },
  dspec: {
    dur: 42, kind: 'special', counter: [4, 26], land: 10,
    keys: [[0, { fh: [14, -14], bh: [10, -10], r: -0.1 }], [4, {}], [26, {}], [40, 'B']],
    onCounter: (f, atk, dmg) => {
      f.fxAt('smokebomb', 'center');
      const d = atk.facing;
      f.x = atk.x - d * 50 * atk.scale; f.y = atk.y;
      f.facing = d;
      f.vy = Math.min(0, f.vy);
      f.startMove('counterslash', { pow: dmg });
      f.fxAt('smokebomb', 'center');
    },
  },
  counterslash: {
    dur: 30, kind: 'special', intang: [0, 8], noGrav: [0, 12], land: 8,
    keys: [[0, { y: -40, r: 0.5, fh: [-6, 4] }], [3, { fh: [30, 0], r: 0.6, ff: [14, 26], bf: [-30, 24] }, 'lin'], [12, {}], [28, 'B']],
    update: (f, fr) => { if (fr < 12) { f.vy = 0; f.vx *= 0.8; } },
    hb: [{ f: [3, 6], at: 'center', off: [12, 0], r: 32, dmg: 9, ang: 40, bkb: 58, kbg: 85, el: 'wind', pow: 1.3 }],
  },
};

// ---------- ボルティ：電撃ロボ（射撃型） ----------
const VOLTY_MAX_CHARGE = 80;
const VOLTY_SPECIALS = {
  nspec: {
    dur: 9999, kind: 'special', chargeShot: true, land: 8,
    keys: [[0, { fh: [18, -2], bh: [14, 2], r: -0.1, x: -2 }]],
    update: (f, fr) => {
      if (fr === 0) {
        f.chargeLv = f.stored || 0; f.stored = 0;
        if (!f.grounded || f.chargeLv >= VOLTY_MAX_CHARGE) { f.startMove('nspec_fire'); return; }
      }
      f.chargeLv = Math.min(VOLTY_MAX_CHARGE, f.chargeLv + 1);
      if (fr % 4 === 0) { f.fxAt('spark', 'fh', { col: '#4ad8ff' }); f.sfx('charge', f.chargeLv / VOLTY_MAX_CHARGE); }
      if (fr > 4 && (f.inp.buf('s', 2) || f.inp.buf('j', 2))) {
        f.stored = f.chargeLv; f.chargeLv = 0;
        if (f.inp.buf('s', 2)) f.inp.use('s');
        f.endMove(); return;
      }
      if ((!f.inp.held.b && fr > 6) || f.chargeLv >= VOLTY_MAX_CHARGE) f.startMove('nspec_fire');
    },
  },
  nspec_fire: {
    dur: 28, kind: 'special', land: 8,
    keys: [[0, { fh: [18, -2], bh: [14, 2], r: -0.1 }], [3, { fh: [32, -2], bh: [28, 0], r: 0.25, x: 3 }, 'lin'], [10, {}], [26, 'B']],
    ev: {
      3: (f) => {
        const c = (f.chargeLv || 0) / VOLTY_MAX_CHARGE;
        f.proj('eball', { at: 'fh', vx: 7 + c * 5, vy: 0, charge: c });
        f.sfx(c > 0.6 ? 'beam' : 'zap'); f.chargeLv = 0;
        if (c > 0.9) f.battle.shake(4);
      },
    },
  },
  sspec: {
    dur: 36, kind: 'special', land: 10,
    keys: [[0, { fh: [6, 4], r: -0.1 }], [10, { fh: [30, 14], bh: [24, 16], r: 0.3, x: 3 }, 'lin'], [16, {}], [34, 'B']],
    ev: { 10: (f) => { if (f.countProj('spark') < 2) { f.proj('spark', { at: 'fh', vx: 6.5, vy: f.grounded ? 0 : 4 }); f.sfx('zap'); } } },
  },
  uspec: {
    dur: 40, kind: 'special', helpless: 1, land: 14, intang: [8, 16], noGrav: [0, 18], edgeStop: false,
    keys: [[0, { y: -40, r: 0.2, fh: [-6, -10], bh: [6, -12] }], [8, { sx: 0.3, sy: 1.6 }], [16, {}], [18, { sx: 1, sy: 1 }], [24, { fh: [16, -2], bh: [-14, 0], r: 0 }], [38, 'B']],
    update: (f, fr) => {
      if (fr < 8) {
        f.vy *= 0.5; f.vx *= 0.7;
        if (fr === 7) {
          let dx = f.inp.x, dy = f.inp.y;
          const m = Math.hypot(dx, dy);
          if (m < 0.3) { dx = 0; dy = -1; } else { dx /= m; dy /= m; }
          if (f.grounded && dy > 0.3) dy = 0;
          f.warpDir = [dx, dy];
          if (dx) f.facing = sign(dx);
          f.fxAt('warp', 'center'); f.sfx('warp');
        }
      } else if (fr < 16) {
        f.invisible = true;
        f.vx = f.warpDir[0] * 28; f.vy = f.warpDir[1] * 28;
        if (f.grounded && f.warpDir[1] >= 0) f.vy = 0;
      } else if (fr === 16) {
        f.invisible = false; f.vx = f.warpDir[0] * 3; f.vy = f.warpDir[1] * 3;
        f.fxAt('warp', 'center');
      }
    },
    hb: [{ f: [16, 18], at: 'center', r: 30, dmg: 6, ang: 80, bkb: 50, kbg: 60, el: 'elec' }],
  },
  dspec: {
    dur: 34, kind: 'special', reflect: [3, 24], land: 8,
    keys: [[0, { fh: [14, -4], bh: [12, -6], r: -0.1 }], [3, { fh: [20, -10], bh: [20, 4] }], [24, {}], [32, 'B']],
    update: (f, fr) => { if (!f.grounded && fr < 24) f.vy = Math.min(f.vy, 1.5); if (fr === 3) f.sfx('reflect'); },
    hb: [{ f: [3, 5], at: 'center', r: 32, dmg: 4, ang: 70, bkb: 40, kbg: 40, el: 'elec' }],
  },
};

// ---------- ルナ：月の剣士（リーチ型） ----------
const LUNA_SPECIALS = {
  nspec: {
    dur: 38, kind: 'special', land: 10,
    keys: [[0, { fh: [6, -18], w: -2.0, r: -0.2 }], [10, {}], [13, { fh: [28, 6], w: 0.5, r: 0.3, x: 4 }, 'lin'], [20, {}], [36, 'B']],
    ev: { 13: (f) => { if (f.countProj('crescent') < 1) { f.proj('crescent', { at: 'center', off: [20, 0], vx: 10.5, vy: 0 }); f.sfx('slash'); } } },
  },
  sspec: {
    dur: 44, kind: 'special', once: 'side', noGrav: [0, 22], edgeStop: false, land: 14, stopOnHit: 21,
    keys: [[0, { fh: [-10, 4], w: 0, r: -0.2, x: -4 }], [9, {}], [11, { fh: [34, -2], w: 0, r: 0.35, x: 6, ff: [18, 30], bf: [-24, 30] }, 'lin'], [22, {}], [42, 'B']],
    update: (f, fr) => {
      if (fr < 9) { f.vx *= 0.75; if (!f.grounded) f.vy *= 0.5; }
      else if (fr <= 20) { f.vx = f.facing * (fr <= 16 ? 14 : 7); if (!f.grounded) f.vy = 0; if (fr === 10) f.sfx('slash'); if (fr % 2) f.fxAt('after', 'center'); }
      else f.vx *= 0.85;
    },
    hb: [W(1.0, { f: [11, 18], r: 16, dmg: 14, ang: 35, bkb: 42, kbg: 98, el: 'moon' }), W(0.45, { f: [11, 18], r: 14, dmg: 9, ang: 40, bkb: 36, kbg: 80, el: 'cut' })],
  },
  uspec: {
    dur: 44, kind: 'special', helpless: 1, land: 16, edgeStop: false, turn: true,
    keys: [[0, { y: -38, fh: [18, 14], w: 1.0, r: 0.2 }], [4, { y: -48, fh: [24, 8], w: 0.6, rot: 0 }], [16, { rot: -TAU }, 'lin'], [24, {}], [42, { fh: [14, 10], w: -1.0, rot: -TAU }]],
    ev: { 4: (f) => { f.vy = -16; f.vx = f.facing * 2.5 + f.inp.x * 2; f.sfx('slash'); } },
    update: (f, fr) => { if (fr < 4) { f.vy *= 0.4; f.vx *= 0.8; } if (fr > 4) f.vx = approach(f.vx, f.inp.x * 4, 0.25); },
    hb: [W(0.95, { f: [4, 16], r: 19, dmg: 9, ang: 80, bkb: 55, kbg: 78, el: 'moon' }), W(0.45, { f: [4, 16], r: 15, dmg: 8, ang: 80, bkb: 50, kbg: 75, el: 'moon' })],
  },
  dspec: {
    dur: 44, kind: 'special', land: 10,
    keys: [[0, { fh: [20, 0], w: 0 }], [6, { rot: 0 }], [26, { rot: TAU * 2 }, 'lin'], [30, {}], [42, 'B']],
    update: (f, fr) => { if (!f.grounded) f.vy = Math.min(f.vy, 2.5); if (fr % 6 === 0 && fr < 26) f.sfx('slash'); },
    hb: [W(0.9, { f: [6, 24], r: 18, dmg: 2, ang: 'link', rehit: 5, el: 'moon' }), { f: [6, 24], at: 'center', r: 24, dmg: 2, ang: 'link', rehit: 5, el: 'moon' },
      W(0.9, { f: [25, 27], r: 21, dmg: 5, ang: 50, bkb: 58, kbg: 90, g: 1, el: 'moon' })],
  },
};

// ---------- 個性的な通常技の差し替え ----------
const GOLDO_NORMALS = {
  fsmash: {
    dur: 46, kind: 'smash', charge: { f: 10 }, sfx: 'bigwhoosh', el: 'rock',
    keys: [[0, {}], [9, { fh: [4, -34], bh: [-2, -34], r: -0.3, x: -4 }], [12, { fh: [2, -36], bh: [-4, -36] }],
      [15, { fh: [30, 14], bh: [26, 16], r: 0.6, x: 8, ff: [16, 33], bf: [-16, 33] }, 'lin'], [22, {}], [42, 'B']],
    hb: [{ f: [15, 17], at: 'fh', r: 20, dmg: 17, ang: 40, bkb: 38, kbg: 98 }, { f: [15, 17], at: 'fe', r: 15, dmg: 15, ang: 40, bkb: 34, kbg: 96 }],
    ev: { 15: (f) => { f.battle.shake(5); f.fxAt('dust', 'fh'); } },
  },
  dair: {
    dur: 42, air: 1, land: 20, kind: 'aerial', sfx: 'whoosh', el: 'rock',
    keys: [[0, { y: -56, ff: [10, 10], bf: [-10, 10], fh: [14, -16], bh: [-14, -14] }], [12, {}],
      [14, { ff: [8, 36], bf: [-8, 36], fh: [18, -4], bh: [-18, -4] }, 'lin'], [22, {}], [40, 'B']],
    hb: [{ f: [14, 17], at: 'ff', r: 17, dmg: 15, ang: 270, bkb: 25, kbg: 85 }, { f: [14, 17], at: 'bf', r: 17, dmg: 15, ang: 270, bkb: 25, kbg: 85 },
      { f: [18, 24], at: 'ff', r: 14, dmg: 10, ang: 70, bkb: 25, kbg: 70 }],
  },
};
const MYU_NORMALS = {
  nair: {
    dur: 34, air: 1, land: 7, kind: 'aerial', sfx: 'whoosh', el: 'wind',
    keys: [[0, { ff: [20, 0], bf: [-20, 0], fh: [18, -10], bh: [-18, -10], rot: 0 }], [22, { rot: TAU * 2 }, 'lin'], [32, { rot: TAU * 2, ff: [8, 26], bf: [-8, 30], fh: [14, 2], bh: [-4, 10] }]],
    hb: [{ f: [3, 18], at: 'center', r: 30, dmg: 1.5, ang: 'link', rehit: 4 }, { f: [19, 22], at: 'center', r: 32, dmg: 4, ang: 45, bkb: 40, kbg: 90, g: 1 }],
  },
  fair: {
    dur: 32, air: 1, land: 9, kind: 'aerial', sfx: 'whoosh',
    keys: [[0, { ff: [4, 16], r: 0.1 }], [4, { ff: [36, -4], r: -0.3 }], [7, { ff: [8, 20], bf: [-4, 28] }], [10, { bf: [36, -2], ff: [2, 24], r: -0.35 }], [14, {}], [30, 'B']],
    hb: [{ f: [4, 6], at: 'ff', r: 14, dmg: 4, ang: 70, bkb: 30, kbg: 20 }, { f: [10, 12], at: 'bf', r: 15, dmg: 7, ang: 42, bkb: 35, kbg: 90, g: 1 }],
  },
  dthrow: {
    dur: 26, kind: 'throw', hold: 'fh', throw: { f: 10, dmg: 5, ang: 85, bkb: 58, kbg: 30 },
    keys: [[0, { fh: [18, 4] }], [5, { fh: [20, -20], y: -48 }], [10, { fh: [24, 24], y: -34, r: 0.4 }], [24, 'B']],
  },
};
const VOLTY_NORMALS = {
  nair: {
    dur: 36, air: 1, land: 8, kind: 'aerial', el: 'elec',
    keys: [[0, { fh: [16, -2], bh: [-16, -2], ff: [10, 24], bf: [-10, 24], r: 0 }], [4, { fh: [20, -12], bh: [-20, -12] }], [24, {}], [34, 'B']],
    hb: [{ f: [4, 20], at: 'center', r: 32, dmg: 1.5, ang: 'link', rehit: 4 }, { f: [21, 24], at: 'center', r: 34, dmg: 5, ang: 50, bkb: 45, kbg: 85, g: 1 }],
    update: (f, fr) => { if (fr >= 4 && fr <= 24 && fr % 3 === 0) { f.fxAt('spark', 'center', { col: '#4ad8ff', spread: 30 }); if (fr % 6 === 0) f.sfx('zap'); } },
  },
  uair: {
    dur: 30, air: 1, land: 8, kind: 'aerial', el: 'elec',
    keys: [[0, { fh: [10, 0], bh: [-10, 0] }], [4, { fh: [6, -30], bh: [-6, -30], r: -0.1 }], [20, {}], [28, 'B']],
    hb: [{ f: [4, 16], at: 'head', off: [0, -18], r: 24, dmg: 1.6, ang: 'link', rehit: 4 }, { f: [17, 19], at: 'head', off: [0, -20], r: 26, dmg: 5, ang: 88, bkb: 50, kbg: 90, g: 1 }],
    update: (f, fr) => { if (fr >= 4 && fr <= 19 && fr % 3 === 0) f.fxAt('spark', 'head', { col: '#4ad8ff', off: [0, -18], spread: 22 }); },
  },
  fsmash: {
    dur: 44, kind: 'smash', charge: { f: 8 }, sfx: 'zap', el: 'elec',
    keys: [[0, {}], [7, { x: -6, r: -0.3, fh: [-10, 4], bh: [12, 0] }], [11, { x: -7 }],
      [13, { x: 8, r: 0.35, fh: [34, -3], bh: [-14, 8], ff: [18, 31], bf: [-16, 33] }, 'lin'], [20, {}], [40, 'B']],
    hb: [{ f: [13, 16], at: 'fh', off: [18, 0], r: 20, dmg: 15, ang: 38, bkb: 34, kbg: 98 }, { f: [13, 16], at: 'fh', r: 14, dmg: 13, ang: 38, bkb: 30, kbg: 96 }],
    ev: { 13: (f) => { f.fxAt('bolt', 'fh'); f.sfx('zap'); } },
  },
};
const BLAZE_NORMALS = {};
const LUNA_NORMALS = {};

// ---------- キャラクター一覧 ----------
const CHARS = [
  {
    id: 'blaze', name: 'ブレイズ', en: 'BLAZE', title: '灼熱の拳士',
    desc: 'クセのないバランス型。火炎弾で牽制し、フレアバーストで撃墜を狙え！',
    type: 'バランス', scale: 1.0, weight: 100,
    st: { walk: 4.2, run: 8.6, dash: 9.6, air: 5.2, airAcc: 0.42, grav: 0.62, fall: 11.5, ffall: 17, jump: 15.6, hop: 10.6, djump: 14.8, jumps: 1, traction: 0.6 },
    prop: { torso: 28, bodyW: 28, head: 15, arm: [14, 14], leg: [17, 17], limbW: 9, handR: 6.8, footR: 7 },
    el: 'fire', mods: { spd: 1, dmg: 1, kb: 1 },
    specials: BLAZE_SPECIALS, normals: BLAZE_NORMALS,
    specialNames: { n: '火炎弾', s: 'バーニングダッシュ', u: '昇炎拳', d: 'フレアバースト' },
    pals: [
      { main: '#e8452c', sub: '#ffb02e', limb: '#ffd2a8', leg: '#3a3040', hand: '#f4f0e8', foot: '#3a2a2a', skin: '#ffd2a8', hair: '#d0242a', acc: '#ffffff', eye: '#2a1a1a' },
      { main: '#2f6fe8', sub: '#7ad0ff', limb: '#ffd2a8', leg: '#f0f0f0', hand: '#f4f0e8', foot: '#1a2440', skin: '#ffd2a8', hair: '#1c2a6a', acc: '#ffe066', eye: '#1a1a2a' },
      { main: '#2a2a32', sub: '#ff4a3a', limb: '#e8b48a', leg: '#2a2a32', hand: '#ff4a3a', foot: '#111', skin: '#e8b48a', hair: '#f2f2f2', acc: '#ff4a3a', eye: '#1a1a1a' },
      { main: '#3fb04a', sub: '#ffe14a', limb: '#ffd2a8', leg: '#6a4a2a', hand: '#fff6d0', foot: '#2a3a20', skin: '#ffd2a8', hair: '#f0a020', acc: '#fff', eye: '#222' },
    ],
  },
  {
    id: 'goldo', name: 'ゴルドー', en: 'GOLDO', title: '岩の巨人',
    desc: '重くて吹っ飛びにくいパワー型。アーマー付きの突進で強引に押し切れ！',
    type: 'パワー', scale: 1.28, weight: 135,
    st: { walk: 3.0, run: 6.6, dash: 7.6, air: 4.3, airAcc: 0.34, grav: 0.7, fall: 12.5, ffall: 17.5, jump: 15.2, hop: 10.4, djump: 13.6, jumps: 1, traction: 0.65 },
    prop: { torso: 32, bodyW: 44, head: 12, arm: [15, 15], leg: [14, 14], limbW: 12, handR: 11.5, footR: 9 },
    el: 'rock', mods: { spd: 1.2, dmg: 1.28, kb: 1.04, reach: 1.1 },
    specials: GOLDO_SPECIALS, normals: GOLDO_NORMALS,
    specialNames: { n: '岩石投げ', s: 'ショルダータックル', u: 'ロックジャンプ', d: 'グランドクエイク' },
    throwMods: { bthrow: { kbg: 88 } },
    pals: [
      { main: '#9a7a56', sub: '#5fb84a', limb: '#5e4a3a', hand: '#b8946a', foot: '#4a3a2c', skin: '#a8885e', hair: '#5fb84a', acc: '#ffd84a', eye: '#ffd84a' },
      { main: '#6a7488', sub: '#4ad8ff', limb: '#3c4252', hand: '#8a94a8', foot: '#2c3240', skin: '#7a8498', hair: '#4ad8ff', acc: '#4ad8ff', eye: '#7ff0ff' },
      { main: '#b04a32', sub: '#ff9a3a', limb: '#5a2218', hand: '#c8644a', foot: '#3a140e', skin: '#b85a40', hair: '#ffb04a', acc: '#ffde5a', eye: '#ffe05a' },
      { main: '#dcd8cc', sub: '#c070ff', limb: '#8a8478', hand: '#f0ece0', foot: '#6a6458', skin: '#e4e0d3', hair: '#c070ff', acc: '#c070ff', eye: '#a040ff' },
    ],
  },
  {
    id: 'myu', name: 'ミュウ', en: 'MYU', title: '疾風の忍',
    desc: '軽くて速い空中戦の達人。3段ジャンプと連続技で翻弄しよう。',
    type: 'スピード', scale: 0.9, weight: 80,
    st: { walk: 5.0, run: 10.6, dash: 11.5, air: 6.0, airAcc: 0.55, grav: 0.72, fall: 13.0, ffall: 19, jump: 15.4, hop: 10.4, djump: 13.4, jumps: 2, traction: 0.7 },
    prop: { torso: 26, bodyW: 21, head: 14.5, arm: [14, 14], leg: [18, 18], limbW: 7.5, handR: 5.6, footR: 6.2 },
    el: 'wind', mods: { spd: 0.82, dmg: 0.82, kb: 0.96 },
    specials: MYU_SPECIALS, normals: MYU_NORMALS,
    specialNames: { n: '手裏剣', s: '疾風斬', u: '旋風', d: '変わり身' },
    pals: [
      { main: '#1e8a8a', sub: '#e84a6a', limb: '#2a5a62', hand: '#2a2a3a', foot: '#1a2a30', skin: '#ffe0c4', hair: '#20303a', acc: '#e84a6a', eye: '#1a2a3a' },
      { main: '#5a3a9a', sub: '#ffd84a', limb: '#2a1a40', hand: '#2a2a3a', foot: '#1a1430', skin: '#ffe0c4', hair: '#3a2060', acc: '#ffd84a', eye: '#1a1a2a' },
      { main: '#e8e8f0', sub: '#3a8aff', limb: '#c8cad8', hand: '#3a3a4a', foot: '#3a3a4a', skin: '#ffe0c4', hair: '#d8e4ff', acc: '#3a8aff', eye: '#2a3a6a' },
      { main: '#c83a3a', sub: '#2a2a2a', limb: '#3a1a1a', hand: '#2a2a2a', foot: '#1a1a1a', skin: '#f4d0b0', hair: '#1a1a1a', acc: '#ffffff', eye: '#1a1a1a' },
    ],
  },
  {
    id: 'volty', name: 'ボルティ', en: 'VOLTY', title: '雷電ロボ',
    desc: 'ふわっと浮く射撃型ロボ。溜めたチャージショットは超強力！',
    type: 'シューター', scale: 1.0, weight: 92,
    st: { walk: 3.8, run: 7.2, dash: 8.4, air: 5.4, airAcc: 0.4, grav: 0.46, fall: 8.8, ffall: 13, jump: 14.2, hop: 9.4, djump: 13.2, jumps: 1, traction: 0.5 },
    prop: { torso: 26, bodyW: 30, head: 17, arm: [12.5, 12.5], leg: [14.5, 14.5], limbW: 7, handR: 7.5, footR: 8.5 },
    el: 'elec', mods: { spd: 1.05, dmg: 0.95, kb: 1.0 },
    specials: VOLTY_SPECIALS, normals: VOLTY_NORMALS,
    specialNames: { n: 'チャージショット', s: 'スパークウェーブ', u: 'ワープ', d: 'リフレクター' },
    pals: [
      { main: '#ffcc2a', sub: '#6a4aff', limb: '#5a5a6a', hand: '#e8e8f0', foot: '#4a4a5a', skin: '#e8e8f0', hair: '#6a4aff', acc: '#4ad8ff', eye: '#4ad8ff' },
      { main: '#ff5a8a', sub: '#ffffff', limb: '#5a4a5a', hand: '#ffe0ec', foot: '#4a3a4a', skin: '#ffe0ec', hair: '#ffffff', acc: '#ffe04a', eye: '#ffe04a' },
      { main: '#3ac87a', sub: '#ffe04a', limb: '#3a4a40', hand: '#e0f0e8', foot: '#2a3a30', skin: '#e0f0e8', hair: '#ffe04a', acc: '#ffe04a', eye: '#a0ff7a' },
      { main: '#3a3a48', sub: '#ff3a3a', limb: '#2a2a32', hand: '#6a6a7a', foot: '#1a1a22', skin: '#5a5a6a', hair: '#ff3a3a', acc: '#ff3a3a', eye: '#ff4a4a' },
    ],
  },
  {
    id: 'luna', name: 'ルナ', en: 'LUNA', title: '月光の剣士',
    desc: '長い剣のリーチが武器。先端を当てるほど強い月光突きで決めろ。',
    type: 'リーチ', scale: 1.02, weight: 94,
    st: { walk: 4.3, run: 8.8, dash: 9.8, air: 5.0, airAcc: 0.4, grav: 0.6, fall: 11.0, ffall: 16.5, jump: 15.4, hop: 10.4, djump: 14.6, jumps: 1, traction: 0.58 },
    prop: { torso: 27, bodyW: 21, head: 14, arm: [14, 14], leg: [18, 18], limbW: 7, handR: 5.6, footR: 6.2, wlen: 52 },
    el: 'moon', mods: { spd: 1.0, dmg: 1.0, kb: 1.0 }, sword: true,
    specials: LUNA_SPECIALS, normals: LUNA_NORMALS,
    specialNames: { n: '三日月斬', s: '月光突き', u: 'ムーンサルト', d: '月輪の舞' },
    pals: [
      { main: '#5a4aa8', sub: '#e8e8ff', limb: '#2e2850', hand: '#f0e8ff', foot: '#2e2850', skin: '#ffe4d4', hair: '#dce4ff', acc: '#c28bff', eye: '#5a3aa8', blade: '#e8f0ff' },
      { main: '#a82a4a', sub: '#ffd84a', limb: '#401a28', hand: '#fff0e0', foot: '#401a28', skin: '#ffe4d4', hair: '#ffcf5a', acc: '#ffd84a', eye: '#8a2a3a', blade: '#fff4d0' },
      { main: '#1a6a5a', sub: '#bff0e0', limb: '#123a34', hand: '#e0fff4', foot: '#123a34', skin: '#f0d8c4', hair: '#1a2a2a', acc: '#4affc8', eye: '#1a5a4a', blade: '#d0fff0' },
      { main: '#e8e4f4', sub: '#5a5a8a', limb: '#9a98b4', hand: '#ffffff', foot: '#5a5a8a', skin: '#ffe4d4', hair: '#8a5aff', acc: '#8a5aff', eye: '#4a2a8a', blade: '#c8b0ff' },
    ],
  },
];

// 構築
function buildChars() {
  for (const c of CHARS) {
    prepProp(c.prop);
    const raw = Object.assign({}, c.sword ? Object.assign(unarmedMoves(c.el), swordMoves()) : unarmedMoves(c.el), c.normals);
    // 投げ補正
    if (c.throwMods) for (const k in c.throwMods) raw[k] = Object.assign({}, raw[k], { throw: Object.assign({}, raw[k].throw, c.throwMods[k]) });
    c.moves = {};
    for (const k in raw) c.moves[k] = compileMove(k, raw[k], c.mods);
    for (const k in c.specials) c.moves[k] = compileMove(k, c.specials[k], { spd: 1, dmg: 1, kb: 1 });
    c.stance = c.sword ? c.moves.ftilt.base : (c.id === 'goldo' ? mkPose({ r: 0.22, fh: [14, 12], bh: [6, 16], x: -1 }) : c.id === 'volty' ? mkPose({ r: 0.02, fh: [8, 18], bh: [-6, 18] }) : BASE_POSE);
    if (c.id === 'goldo') for (const k in c.moves) if (c.moves[k].base === STANCE) fixBase(c.moves[k], c.stance);
  }
}
function fixBase(m, base) {
  // 基本姿勢へ戻るキーを、そのキャラのスタンスに置き換える
  const last = m.keys[m.keys.length - 1];
  if (last && last.pose && poseEq(last.pose, STANCE)) last.pose = copyPose(base);
  m.base = base;
}
function poseEq(a, b) {
  for (const k of POSE_NUM_KEYS) if (Math.abs(a[k] - b[k]) > 1e-6) return false;
  for (const k of POSE_VEC_KEYS) if (a[k][0] !== b[k][0] || a[k][1] !== b[k][1]) return false;
  return true;
}
