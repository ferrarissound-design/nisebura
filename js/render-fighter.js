'use strict';
// ===== キャラクター描画 =====
const OUTLINE = '#120c18';
const OL = 2.6; // 基本の輪郭線の太さ

// ---------- 色 ----------
const _toneCache = new Map();
function tone(c, a) {
  const k = c + a;
  let v = _toneCache.get(k);
  if (v === undefined) { v = shade(c, a); _toneCache.set(k, v); }
  return v;
}
// 奥側の手足用に暗くしたパレット
const _backCache = new Map();
function backPal(pal) {
  if (pal === WHITE_PAL) return pal;
  let p = _backCache.get(pal);
  if (!p) { p = {}; for (const k in pal) p[k] = shade(pal[k], -0.3); _backCache.set(pal, p); }
  return p;
}

// ---------- なびく布・髪・しっぽ ----------
function makeRibbons(f) {
  const id = f.char.id, s = f.scale;
  const R = [];
  if (id === 'blaze') { R.push({ at: 'head', off: [-14, -6], n: 5, seg: 8 * s, w: 9 * s, col: 'acc', taper: 0.7 }); R.push({ at: 'head', off: [-14, -4], n: 4, seg: 7 * s, w: 7.5 * s, col: 'acc', ph: 1, taper: 0.7 }); }
  if (id === 'myu') {
    R.push({ at: 'neck', off: [-4, 2], n: 8, seg: 9 * s, w: 13 * s, col: 'sub', taper: 0.6 });
    R.push({ at: 'hip', off: [-7, -2], n: 7, seg: 6.5 * s, w: 12 * s, col: 'main', taper: 0.55, grav: -0.32, tip: 'sub' });
  }
  if (id === 'luna') {
    R.push({ at: 'neck', off: [-5, 3], n: 5, seg: 9 * s, w: 15 * s, col: 'main', taper: 1.6, dark: -0.25 });
    R.push({ at: 'head', off: [-9, -2], n: 7, seg: 8.5 * s, w: 19 * s, col: 'hair', taper: 0.12, line: 0.35 });
  }
  for (const r of R) { r.p = []; for (let i = 0; i < r.n; i++) r.p.push({ x: f.x, y: f.y - 60, px: f.x, py: f.y - 60 }); r.reset = true; }
  return R;
}
function ribbonAnchor(f, rb) {
  const p = f.pts[rb.at], a = rb.at === 'head' ? (f.pts.headAng || 0) : f.pts.bodyAng;
  const ox = rb.off[0] * f.facing * f.scale, oy = rb.off[1] * f.scale;
  const c = Math.cos(a), s = Math.sin(a);
  return { x: p.x + ox * c - oy * s, y: p.y + ox * s + oy * c };
}
function stepRibbon(f, rb) {
  const A = ribbonAnchor(f, rb);
  const P = rb.p;
  if (rb.reset) { for (let i = 0; i < P.length; i++) { P[i].x = P[i].px = A.x - f.facing * i * rb.seg; P[i].y = P[i].py = A.y + i * 2; } rb.reset = false; }
  P[0].x = A.x; P[0].y = A.y;
  const t = f.anim * 0.18 + (rb.ph || 0);
  const g = rb.grav !== undefined ? rb.grav : 0.45;
  for (let i = 1; i < P.length; i++) {
    const q = P[i];
    const vx = (q.x - q.px) * 0.86, vy = (q.y - q.py) * 0.86;
    q.px = q.x; q.py = q.y;
    q.x += vx - f.facing * 0.35 + Math.sin(t + i * 0.9) * 0.25;
    q.y += vy + g;
  }
  for (let k = 0; k < 2; k++) {
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      const diff = (d - rb.seg) / d;
      b.x -= dx * diff; b.y -= dy * diff;
    }
  }
  const last = P[P.length - 1];
  if (Math.hypot(last.x - A.x, last.y - A.y) > rb.seg * P.length * 3) rb.reset = true;
}
// 節の両側に幅を持たせた帯として描く
function ribbonPath(ctx, rb) {
  const P = rb.p, n = P.length, tp = rb.taper !== undefined ? rb.taper : 0.5;
  const side = (i, sg) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const hw = rb.w * 0.5 * (1 - (i / (n - 1)) * (1 - tp));
    return [P[i].x - dy * hw * sg, P[i].y + dx * hw * sg];
  };
  ctx.beginPath();
  for (let i = 0; i < n; i++) { const [x, y] = side(i, 1); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  const e = P[n - 1], q = P[n - 2];
  const ea = Math.atan2(e.y - q.y, e.x - q.x), er = rb.w * 0.5 * (tp > 0 ? tp : 0);
  if (er > 0.5) ctx.arc(e.x, e.y, er, ea + Math.PI / 2, ea - Math.PI / 2, true);
  else ctx.lineTo(e.x + Math.cos(ea) * rb.seg * 0.6, e.y + Math.sin(ea) * rb.seg * 0.6);
  for (let i = n - 1; i >= 0; i--) { const [x, y] = side(i, -1); ctx.lineTo(x, y); }
  ctx.closePath();
}
function drawRibbon(ctx, f, rb, pal) {
  const P = rb.p, n = P.length;
  const col = rb.dark ? tone(pal[rb.col], rb.dark) : pal[rb.col];
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ribbonPath(ctx, rb);
  ctx.fillStyle = col; ctx.fill();
  ctx.lineWidth = OL; ctx.strokeStyle = OUTLINE; ctx.stroke();
  // 先端の色
  if (rb.tip) {
    const e = P[n - 1];
    ball(ctx, e.x, e.y, rb.w * 0.5 * (rb.taper || 0.5) + 1.5, pal[rb.tip], 2);
  }
  // 中央の筋（ツヤ・布の折り目）
  ctx.strokeStyle = tone(col, rb.line || 0.28); ctx.lineWidth = Math.max(1.2, rb.w * 0.16);
  ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y);
  for (let i = 1; i < n - 1; i++) ctx.lineTo(P[i].x, P[i].y);
  ctx.stroke();
}

// ---------- 描画の基本部品 ----------
// 半径の異なる2円をつないだカプセル
function capPath(ctx, ax, ay, bx, by, ra, rb) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
  ctx.beginPath();
  if (L <= Math.abs(ra - rb) + 0.01) { ctx.arc(ax, ay, Math.max(ra, rb), 0, TAU); return; }
  const g = Math.atan2(dy, dx), k = Math.asin((ra - rb) / L), h = Math.PI / 2;
  ctx.arc(ax, ay, ra, g + h + k, g + 3 * h - k);
  ctx.arc(bx, by, rb, g - h - k, g + h + k);
  ctx.closePath();
}
// セル塗り：影色で塗り、光の方向(左上)へずらした形を本色で重ね、輪郭線を引く
function cel(ctx, build, col, d, lw) {
  build(); ctx.fillStyle = tone(col, -0.26); ctx.fill();
  ctx.save(); ctx.clip();
  ctx.translate(-0.4 * d, -d); build(); ctx.fillStyle = col; ctx.fill();
  ctx.restore();
  build(); ctx.lineWidth = lw || OL; ctx.strokeStyle = OUTLINE; ctx.lineJoin = 'round'; ctx.stroke();
}
// カプセル・円はクリップを使わず、光側へずらして細らせた形を重ねて同じ見た目にする（軽量）
const LX = -0.37, LY = -0.93;
function celCap(ctx, ax, ay, bx, by, ra, rb, col, lw) {
  const m = Math.min(ra, rb) * 0.36;
  capPath(ctx, ax, ay, bx, by, ra, rb); ctx.fillStyle = tone(col, -0.26); ctx.fill();
  capPath(ctx, ax + LX * m, ay + LY * m, bx + LX * m, by + LY * m, ra - m, rb - m); ctx.fillStyle = col; ctx.fill();
  capPath(ctx, ax, ay, bx, by, ra, rb); ctx.lineWidth = lw || OL; ctx.strokeStyle = OUTLINE; ctx.lineJoin = 'round'; ctx.stroke();
}
function seg(ctx, a, b, ra, rb, col) { celCap(ctx, a.x, a.y, b.x, b.y, ra, rb, col); }
function ball(ctx, x, y, r, col, lw) { celCap(ctx, x, y, x, y, r, r, col, lw); }
function shine(ctx, x, y, rx, ry, rot, a) {
  ctx.fillStyle = `rgba(255,255,255,${a || 0.45})`;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); ctx.fill();
}
function glowLine(ctx, col, w, draw) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba(col, 0.3); ctx.lineWidth = w * 3; draw(); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = w; draw(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = w * 0.4; draw(); ctx.stroke();
  ctx.restore();
}
const lerpPt = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
// 肢に巻いた帯の線
function wrapLines(ctx, a, b, r, col, ts) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L * r, ny = dx / L * r;
  ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  ctx.beginPath();
  for (const t of ts) { const x = a.x + dx * t, y = a.y + dy * t; ctx.moveTo(x + nx + dx / L * 1.5, y + ny + dy / L * 1.5); ctx.lineTo(x - nx - dx / L * 1.5, y - ny - dy / L * 1.5); }
  ctx.stroke();
}
// a→b の向きに合わせた座標系に入る（+x: a→b 方向, 向きが逆なら上下反転）
function enterSeg(ctx, a, b, fc, at) {
  const o = at || b;
  ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
  if (fc < 0) ctx.scale(1, -1);
}
function inBody(ctx, P) { ctx.save(); ctx.translate((P.hip.x + P.neck.x) / 2, (P.hip.y + P.neck.y) / 2); ctx.rotate(P.bodyAng); }
function inHead(ctx, P) { ctx.save(); ctx.translate(P.head.x, P.head.y); ctx.rotate(P.headAng || 0); }

// 胴体（肩幅 wt・腰幅 wb）。胸側を少しふくらませる
function torsoPath(ctx, fc, wt, wb, h, chest) {
  const t = -h / 2, b = h / 2, c = wt * (chest === undefined ? 0.1 : chest);
  ctx.beginPath();
  ctx.moveTo(-wt / 2 * fc, t + h * 0.1);
  ctx.quadraticCurveTo(0, t - h * 0.06, wt / 2 * fc, t + h * 0.1);
  ctx.bezierCurveTo((wt / 2 + c) * fc, t + h * 0.38, (wb / 2 + c * 0.3) * fc, b - h * 0.25, wb / 2 * fc, b);
  ctx.quadraticCurveTo(0, b + h * 0.05, -wb / 2 * fc, b);
  ctx.bezierCurveTo(-wb / 2 * 1.04 * fc, b - h * 0.3, -wt / 2 * 1.04 * fc, t + h * 0.42, -wt / 2 * fc, t + h * 0.1);
  ctx.closePath();
}
// 人型の頭（あご付き）
function headPath(ctx, r, fc) {
  ctx.beginPath();
  ctx.moveTo(-r * fc, -r * 0.05);
  ctx.bezierCurveTo(-r * 1.02 * fc, -r * 1.35, r * 1.02 * fc, -r * 1.35, r * 0.98 * fc, -r * 0.12);
  ctx.bezierCurveTo(r * 1.0 * fc, r * 0.42, r * 0.82 * fc, r * 0.82, r * 0.42 * fc, r * 0.98);
  ctx.bezierCurveTo(r * 0.08 * fc, r * 1.1, -r * 0.5 * fc, r * 0.9, -r * 0.78 * fc, r * 0.58);
  ctx.bezierCurveTo(-r * 0.95 * fc, r * 0.38, -r * 1.0 * fc, r * 0.2, -r * fc, -r * 0.05);
  ctx.closePath();
}
function ear(ctx, r, fc, col) {
  ctx.beginPath(); ctx.ellipse(-r * 0.46 * fc, r * 0.22, r * 0.17, r * 0.24, 0, 0, TAU);
  ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUTLINE; ctx.stroke();
  ctx.strokeStyle = tone(col, -0.3); ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(-r * 0.44 * fc, r * 0.22, r * 0.08, -1.2, 1.2); ctx.stroke();
}
// 握りこぶし（前腕の向きに合わせる）
function fist(ctx, f, e, h, r, col, knuckle) {
  enterSeg(ctx, e, h, f.facing);
  cel(ctx, () => roundRect(ctx, -r * 0.95, -r * 0.88, r * 1.95, r * 1.76, r * 0.72), col, r * 0.4);
  if (knuckle) {
    ctx.beginPath(); ctx.ellipse(r * 0.62, 0, r * 0.38, r * 0.82, 0, -Math.PI / 2, Math.PI / 2);
    ctx.fillStyle = knuckle; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = OUTLINE; ctx.stroke();
  }
  ctx.strokeStyle = tone(col, -0.45); ctx.lineWidth = 1.3; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 3; i++) { const y = -r * 0.3 + i * r * 0.38; ctx.moveTo(r * 0.12, y); ctx.lineTo(r * 0.55, y); }
  ctx.stroke();
  // 親指
  ctx.beginPath(); ctx.ellipse(-r * 0.05, -r * 0.72, r * 0.52, r * 0.3, 0.15, 0, TAU);
  ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = OUTLINE; ctx.stroke();
  ctx.restore();
}
// 靴（+x: つま先, +y: 足裏）
function boot(ctx, f, k, a, r, col, sole, o) {
  const fc = f.facing, ang = Math.atan2(a.y - k.y, a.x - k.x) - fc * Math.PI / 2;
  ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(ang); if (fc < 0) ctx.scale(1, -1);
  const toe = (o && o.toe) || 1.5;
  const build = () => {
    ctx.beginPath();
    ctx.moveTo(-r * 0.75, -r * 0.7);
    ctx.quadraticCurveTo(r * 0.2, -r * 0.8, r * 0.55, -r * 0.35);
    ctx.quadraticCurveTo(r * toe, -r * 0.15, r * toe, r * 0.42);
    ctx.quadraticCurveTo(r * toe, r * 0.85, r * (toe - 0.4), r * 0.85);
    ctx.lineTo(-r * 0.75, r * 0.85);
    ctx.quadraticCurveTo(-r * 1.02, r * 0.85, -r * 0.98, r * 0.2);
    ctx.closePath();
  };
  cel(ctx, build, col, r * 0.35);
  if (sole) {
    ctx.save(); build(); ctx.clip();
    ctx.fillStyle = sole; ctx.fillRect(-r * 1.2, r * 0.48, r * (toe + 1.4), r * 0.5);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-r * 1.2, r * 0.48); ctx.lineTo(r * (toe + 0.2), r * 0.48); ctx.stroke();
    ctx.restore();
    build(); ctx.lineWidth = OL; ctx.strokeStyle = OUTLINE; ctx.stroke();
  }
  if (o && o.extra) o.extra(r);
  ctx.restore();
}

// ---------- 表情 ----------
function faceMood(f) {
  if (f.state === 'hitstun' || f.state === 'dizzy' || f.state === 'grabbed' || f.flash > 0) return 'hurt';
  if (f.state === 'attack' && f.move) return f.move.kind === 'smash' || f.move.kind === 'special' ? 'shout' : 'fight';
  if (f.blink < 0) return 'blink';
  return 'calm';
}
// アニメ風の目（頭のローカル座標で呼ぶ）
// o: { y, x1, x2, w, h, iris, brow, slit, lash }
function animeEyes(ctx, f, r, o, mood) {
  const fc = f.facing, dark = '#1c1020';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let k = 0; k < 2; k++) {
    const x = (k ? o.x2 : o.x1) * r * fc, w = o.w * r * (k ? 0.8 : 1), h = o.h * r, y = o.y * r;
    const inner = k ? -fc : fc; // 目頭の向き
    if (mood === 'hurt') {
      ctx.strokeStyle = dark; ctx.lineWidth = r * 0.1;
      ctx.beginPath(); ctx.moveTo(x - inner * w, y - h * 0.6); ctx.lineTo(x + inner * w * 0.8, y); ctx.lineTo(x - inner * w, y + h * 0.6); ctx.stroke();
    } else if (mood === 'blink') {
      ctx.strokeStyle = dark; ctx.lineWidth = r * 0.09;
      ctx.beginPath(); ctx.ellipse(x, y - h * 0.1, w * 1.05, h * 0.35, 0, 0.15, Math.PI - 0.15); ctx.stroke();
    } else {
      const sq = mood === 'calm' ? 0 : 0.2, cy = y + h * sq, eh = h * (1 - sq);
      ctx.save();
      ctx.beginPath(); ctx.ellipse(x, cy, w, eh, 0, 0, TAU);
      ctx.fillStyle = '#fbf8ff'; ctx.fill(); ctx.clip();
      ctx.fillStyle = o.iris; ctx.beginPath(); ctx.ellipse(x + w * 0.18 * fc, cy + eh * 0.12, w * 0.82, eh * 0.86, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = tone(o.iris, -0.55); ctx.beginPath(); ctx.ellipse(x + w * 0.18 * fc, cy - eh * 0.25, w * 0.85, eh * 0.45, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(x + w * 0.22 * fc, cy + eh * 0.12, w * (o.slit && mood !== 'calm' ? 0.14 : 0.36), eh * 0.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x - w * 0.12 * fc, cy - eh * 0.35, w * 0.36, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x + w * 0.45 * fc, cy + eh * 0.45, w * 0.16, 0, TAU); ctx.fill();
      ctx.restore();
      // 上まぶた
      ctx.strokeStyle = dark; ctx.lineWidth = r * 0.1;
      ctx.beginPath(); ctx.ellipse(x, cy, w * 1.08, eh * 1.02, 0, Math.PI * 1.06, Math.PI * 1.94); ctx.stroke();
      if (o.lash) { ctx.lineWidth = r * 0.07; ctx.beginPath(); ctx.moveTo(x - inner * w, cy - eh * 0.45); ctx.lineTo(x - inner * w * 1.45, cy - eh * 0.85); ctx.stroke(); }
    }
    // 眉
    if (o.brow) {
      const by = y - h * 1.32;
      const di = mood === 'fight' || mood === 'shout' ? h * 0.38 : mood === 'hurt' ? -h * 0.3 : 0;
      ctx.strokeStyle = o.brow; ctx.lineWidth = r * (o.browW || 0.11);
      ctx.beginPath(); ctx.moveTo(x - inner * w * 1.1, by - h * 0.05); ctx.quadraticCurveTo(x, by - h * 0.22, x + inner * w * 1.05, by + di); ctx.stroke();
    }
  }
}
function mouth(ctx, f, r, mx, my, mood, o) {
  const fc = f.facing, x = mx * r * fc, y = my * r, dark = '#2a0c18';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = dark;
  if (mood === 'shout' || mood === 'hurt') {
    const w = r * (mood === 'shout' ? 0.17 : 0.11), h = r * (mood === 'shout' ? 0.15 : 0.11);
    ctx.save();
    ctx.beginPath();
    if (mood === 'shout') { ctx.moveTo(x - w, y - h * 0.6); ctx.lineTo(x + w, y - h * 0.8); ctx.quadraticCurveTo(x + w * 0.9, y + h, x, y + h); ctx.quadraticCurveTo(x - w, y + h, x - w, y - h * 0.6); }
    else ctx.ellipse(x, y, w, h, 0, 0, TAU);
    ctx.fillStyle = dark; ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke(); ctx.clip();
    ctx.fillStyle = '#e0607a'; ctx.beginPath(); ctx.ellipse(x, y + h, w * 0.8, h * 0.6, 0, 0, TAU); ctx.fill();
    if (mood === 'shout') { ctx.fillStyle = '#fff'; ctx.fillRect(x - w, y - h * 1.2, w * 2, h * 0.55); }
    ctx.restore();
  } else if (mood === 'fight') {
    ctx.lineWidth = r * 0.07;
    ctx.beginPath(); ctx.moveTo(x - r * 0.14 * fc, y); ctx.quadraticCurveTo(x, y + r * 0.05, x + r * 0.15 * fc, y - r * 0.05); ctx.stroke();
    if (o && o.fang) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x + r * 0.02 * fc, y + r * 0.02); ctx.lineTo(x + r * 0.09 * fc, y + r * 0.01); ctx.lineTo(x + r * 0.06 * fc, y + r * 0.1); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1; ctx.stroke(); }
  } else {
    ctx.lineWidth = r * 0.065;
    ctx.beginPath(); ctx.moveTo(x - r * 0.1 * fc, y - r * 0.02); ctx.quadraticCurveTo(x + r * 0.02 * fc, y + r * 0.07, x + r * 0.12 * fc, y - r * 0.03); ctx.stroke();
  }
}
function blush(ctx, r, fc, x, y) {
  ctx.fillStyle = 'rgba(255,110,140,0.28)';
  ctx.beginPath(); ctx.ellipse(x * r * fc, y * r, r * 0.17, r * 0.08, 0, 0, TAU); ctx.fill();
}

// パレット（ヒット時の白フラッシュなど）
function fighterPal(f) {
  if (f.flash > 0 && f.flash % 2 === 0) return WHITE_PAL;
  if (f.state === 'attack' && f.charge > 0 && (f.anim >> 1) % 2) return CHARGE_PAL(f);
  return f.pal;
}
const WHITE_PAL = new Proxy({}, { get: () => '#ffffff' });
const _chargeCache = new Map();
function CHARGE_PAL(f) {
  let p = _chargeCache.get(f.pal);
  if (!p) { p = {}; for (const k in f.pal) p[k] = mixColor(f.pal[k], '#ffe65a', 0.45); _chargeCache.set(f.pal, p); }
  return p;
}

// ---------- 本体 ----------
function drawFighter(ctx, f) {
  if (f.invisible) return;
  const P = f.pts, pal = fighterPal(f), pr = f.char.prop, s = f.scale, D = CHAR_DRAW[f.char.id];
  const bp = backPal(pal);
  // 無敵点滅
  if ((f.invuln > 0 || f.ledgeInv > 0) && f.state !== 'respawn') ctx.globalAlpha = (f.anim >> 2) % 2 ? 0.55 : 0.9;
  if (f.isIntangible() && (f.state === 'roll' || f.state === 'spotdodge' || f.state === 'airdodge' || f.state === 'tech')) ctx.globalAlpha = 0.55;
  // 揺れ（ヒットストップ中）
  let shx = 0;
  if (f.hitlag > 0 && f.shake > 0) shx = ((f.hitlag % 2) ? 1 : -1) * Math.min(6, f.shake * 0.4);
  ctx.save();
  if (shx) ctx.translate(shx, 0);

  // 後ろのリボン
  if (f.ribbons) for (const rb of f.ribbons) drawRibbon(ctx, f, rb, pal);

  // 奥の手足
  D.leg(ctx, f, P.hip, P.bk, P.bf, bp, s, pr);
  D.arm(ctx, f, P.sh, P.be, P.bh, bp, s, pr, true);

  // 胴体・頭
  const th = Math.hypot(P.neck.x - P.hip.x, P.neck.y - P.hip.y) * 1.12 + 6 * s;
  D.body(ctx, f, P, pr.bodyW * s, th, pal, s);
  D.head(ctx, f, P, pr.head * s * (D.hk || 1), pal, s);

  // 手前の手足
  D.leg(ctx, f, P.hip, P.fk, P.ff, pal, s, pr);
  if (f.char.sword) drawSword(ctx, f, P, pal, s);
  D.arm(ctx, f, P.sh, P.fe, P.fh, pal, s, pr, false);
  if (f.holdRock) {
    const h = P.fh;
    cel(ctx, () => { ctx.beginPath(); for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, rr = 17 * s * (0.85 + (i % 3) * 0.08); ctx.lineTo(h.x + Math.cos(a) * rr, h.y - 16 * s + Math.sin(a) * rr); } ctx.closePath(); }, '#8a6a4a', 7 * s, 3);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawSword(ctx, f, P, pal, s) {
  const b = P.wb, t = P.wt;
  const dx = t.x - b.x, dy = t.y - b.y, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const w = 4.8 * s, bl = pal.blade || '#e8f0ff', acc = pal.acc || '#c28bff';
  // 柄と柄頭
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 6.5 * s;
  ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - ux * 9 * s, b.y - uy * 9 * s); ctx.stroke();
  ctx.strokeStyle = tone(pal.foot, 0.1); ctx.lineWidth = 3.5 * s;
  ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - ux * 9 * s, b.y - uy * 9 * s); ctx.stroke();
  ball(ctx, b.x - ux * 11 * s, b.y - uy * 11 * s, 3.2 * s, acc, 2);
  // 刃
  const blade = () => {
    ctx.beginPath();
    ctx.moveTo(b.x + nx * w * 0.9, b.y + ny * w * 0.9);
    ctx.lineTo(t.x - ux * 14 + nx * w, t.y - uy * 14 + ny * w);
    ctx.quadraticCurveTo(t.x - ux * 4 + nx * w * 0.6, t.y - uy * 4 + ny * w * 0.6, t.x, t.y);
    ctx.lineTo(t.x - ux * 12 - nx * w * 0.9, t.y - uy * 12 - ny * w * 0.9);
    ctx.lineTo(b.x - nx * w * 0.9, b.y - ny * w * 0.9);
    ctx.closePath();
  };
  blade();
  const g = ctx.createLinearGradient(b.x + nx * w, b.y + ny * w, b.x - nx * w, b.y - ny * w);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, bl); g.addColorStop(0.55, tone(bl, -0.18)); g.addColorStop(1, tone(bl, -0.32));
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 2.4; ctx.strokeStyle = OUTLINE; ctx.lineJoin = 'round'; ctx.stroke();
  // 樋（光る溝）
  glowLine(ctx, acc, 1.4 * s, () => { ctx.beginPath(); ctx.moveTo(b.x + dx * 0.12, b.y + dy * 0.12); ctx.lineTo(b.x + dx * 0.72, b.y + dy * 0.72); });
  // 三日月の鍔
  const gx = b.x + ux * 2 * s, gy = b.y + uy * 2 * s;
  const guard = () => {
    ctx.beginPath();
    ctx.moveTo(gx + nx * 12 * s - ux * 6 * s, gy + ny * 12 * s - uy * 6 * s);
    ctx.quadraticCurveTo(gx + ux * 7 * s, gy + uy * 7 * s, gx - nx * 12 * s - ux * 6 * s, gy - ny * 12 * s - uy * 6 * s);
    ctx.quadraticCurveTo(gx + ux * 1 * s, gy + uy * 1 * s, gx + nx * 12 * s - ux * 6 * s, gy + ny * 12 * s - uy * 6 * s);
    ctx.closePath();
  };
  cel(ctx, guard, acc, 2 * s, 2.2);
  ball(ctx, gx + ux * 1.5 * s, gy + uy * 1.5 * s, 2.6 * s, tone(acc, 0.5), 1.6);
}

// 残像用スナップショット
function snapshotFighter(f) {
  const s = {};
  for (const k of SKEL_POINTS) s[k] = { x: f.pts[k].x, y: f.pts[k].y };
  s.lw = f.char.prop.limbW * f.scale; s.hr = f.char.prop.head * f.scale; s.bw = f.char.prop.bodyW * f.scale;
  return s;
}
function drawSilhouette(ctx, S, col) {
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = S.lw + 2;
  ctx.beginPath();
  ctx.moveTo(S.hip.x, S.hip.y); ctx.lineTo(S.fk.x, S.fk.y); ctx.lineTo(S.ff.x, S.ff.y);
  ctx.moveTo(S.hip.x, S.hip.y); ctx.lineTo(S.bk.x, S.bk.y); ctx.lineTo(S.bf.x, S.bf.y);
  ctx.moveTo(S.sh.x, S.sh.y); ctx.lineTo(S.fe.x, S.fe.y); ctx.lineTo(S.fh.x, S.fh.y);
  ctx.moveTo(S.sh.x, S.sh.y); ctx.lineTo(S.be.x, S.be.y); ctx.lineTo(S.bh.x, S.bh.y);
  ctx.stroke();
  ctx.lineWidth = S.bw; ctx.beginPath(); ctx.moveTo(S.hip.x, S.hip.y); ctx.lineTo(S.neck.x, S.neck.y); ctx.stroke();
  ctx.beginPath(); ctx.arc(S.head.x, S.head.y, S.hr, 0, TAU); ctx.fill();
}

// ---------- キャラ別デザイン ----------
// 各キャラは body / head / arm / leg を持つ。arm と leg は奥側にも使う（奥側は暗いパレット）
const CHAR_DRAW = {
  // ブレイズ：炎髪・道着・バンテージの拳士
  blaze: {
    hk: 1.1,
    body(ctx, f, P, w, h, pal, s) {
      const fc = f.facing, top = -h / 2, bot = h / 2;
      inBody(ctx, P);
      const tp = () => torsoPath(ctx, fc, w * 1.12, w * 0.84, h, 0.12);
      cel(ctx, tp, pal.main, w * 0.16, 3);
      ctx.save(); tp(); ctx.clip();
      // 開いた胸元
      ctx.beginPath(); ctx.moveTo(-0.08 * w * fc, top); ctx.lineTo(0.62 * w * fc, top); ctx.lineTo(0.62 * w * fc, top + 0.3 * h); ctx.lineTo(0.2 * w * fc, top + 0.52 * h); ctx.closePath();
      ctx.fillStyle = pal.skin; ctx.fill();
      ctx.strokeStyle = tone(pal.skin, -0.28); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0.22 * w * fc, top + 0.2 * h); ctx.quadraticCurveTo(0.38 * w * fc, top + 0.3 * h, 0.5 * w * fc, top + 0.22 * h); ctx.stroke();
      // 裾の炎模様
      ctx.fillStyle = pal.sub;
      ctx.beginPath(); ctx.moveTo(-w, bot);
      const fl = [[-0.55, 0.18], [-0.42, -0.02], [-0.3, 0.14], [-0.12, -0.12], [0.02, 0.12], [0.18, -0.06], [0.32, 0.14], [0.46, 0.0], [0.6, 0.18]];
      for (const [x, y] of fl) ctx.lineTo(x * w * fc, bot - h * 0.22 + y * h);
      ctx.lineTo(w, bot); ctx.closePath(); ctx.fill();
      // 帯
      ctx.fillStyle = tone(pal.leg, -0.25); ctx.fillRect(-w, bot - h * 0.2, w * 2, h * 0.14);
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-w, bot - h * 0.2); ctx.lineTo(w, bot - h * 0.2); ctx.moveTo(-w, bot - h * 0.06); ctx.lineTo(w, bot - h * 0.06); ctx.stroke();
      ctx.restore();
      // 襟（V字の縁取り）
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const collar = () => { ctx.beginPath(); ctx.moveTo(-0.12 * w * fc, top + h * 0.04); ctx.lineTo(0.2 * w * fc, top + 0.52 * h); ctx.lineTo(0.56 * w * fc, top + 0.3 * h); };
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 6 * s; collar(); ctx.stroke();
      ctx.strokeStyle = pal.sub; ctx.lineWidth = 3 * s; collar(); ctx.stroke();
      tp(); ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE; ctx.stroke();
      // 帯の結び目
      const ky = bot - h * 0.13, kx = 0.28 * w * fc;
      ctx.fillStyle = tone(pal.leg, -0.25); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2;
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(kx + d * 4 * s * fc, ky + 11 * s); ctx.lineTo(kx + d * 8 * s * fc, ky + 10 * s); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(kx, ky, 3.4 * s, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.restore();
    },
    head(ctx, f, P, r, pal, s) {
      const fc = f.facing, mood = faceMood(f);
      const tip = mixColor(pal.hair, pal.sub, 0.8);
      inHead(ctx, P);
      // 炎のような逆立った髪
      const back = [[0.85, -0.35], [0.98, -0.82], [0.55, -0.78], [0.62, -1.45], [0.18, -0.98], [-0.05, -1.78], [-0.32, -1.08], [-0.82, -1.62], [-0.78, -0.98], [-1.48, -1.12], [-1.1, -0.58], [-1.62, -0.38], [-1.06, -0.08], [-1.38, 0.32], [-0.82, 0.38]];
      ctx.beginPath();
      for (const [x, y] of back) ctx.lineTo(x * r * fc, y * r);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, r * 0.2, -r * 0.3 * fc, -r * 1.7);
      g.addColorStop(0, pal.hair); g.addColorStop(0.45, pal.hair); g.addColorStop(1, tip);
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.strokeStyle = rgba(tip, 0.9); ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-0.1 * r * fc, -0.8 * r); ctx.lineTo(-0.05 * r * fc, -1.45 * r); ctx.moveTo(-0.62 * r * fc, -0.8 * r); ctx.lineTo(-0.78 * r * fc, -1.35 * r); ctx.moveTo(-1.0 * r * fc, -0.5 * r); ctx.lineTo(-1.3 * r * fc, -0.95 * r); ctx.stroke();
      // 顔
      cel(ctx, () => headPath(ctx, r, fc), pal.skin, r * 0.22, 3);
      ear(ctx, r, fc, pal.skin);
      // 前髪
      const bang = [[-0.35, -0.6], [-0.05, -0.08], [0.18, -0.5], [0.45, -0.02], [0.62, -0.46], [1.02, -0.12], [0.95, -0.62], [0.2, -0.85]];
      ctx.beginPath();
      for (const [x, y] of bang) ctx.lineTo(x * r * fc, y * r);
      ctx.closePath();
      ctx.fillStyle = pal.hair; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = OUTLINE; ctx.stroke();
      // 鉢巻
      const band = () => { ctx.beginPath(); ctx.moveTo(-1.02 * r * fc, -0.42 * r); ctx.quadraticCurveTo(0.05 * r * fc, -0.92 * r, 1.04 * r * fc, -0.5 * r); };
      ctx.lineCap = 'butt'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = r * 0.34 + 4; band(); ctx.stroke();
      ctx.strokeStyle = pal.acc; ctx.lineWidth = r * 0.34; band(); ctx.stroke();
      ctx.strokeStyle = tone(pal.acc, -0.2); ctx.lineWidth = r * 0.08; band(); ctx.stroke();
      ball(ctx, -1.0 * r * fc, -0.4 * r, r * 0.17, pal.acc, 2);
      animeEyes(ctx, f, r, { y: 0.16, x1: 0.3, x2: 0.74, w: 0.16, h: 0.26, iris: pal.sub, brow: tone(pal.hair, -0.35), browW: 0.13 }, mood);
      mouth(ctx, f, r, 0.62, 0.64, mood, { fang: true });
      ctx.restore();
    },
    arm(ctx, f, sh, el, h, pal, s, pr) {
      const lw = pr.limbW * s;
      seg(ctx, sh, el, lw * 0.68, lw * 0.5, pal.skin);
      seg(ctx, el, h, lw * 0.52, lw * 0.44, pal.skin);
      const w0 = lerpPt(el, h, 0.4);
      seg(ctx, w0, h, lw * 0.56, lw * 0.5, pal.hand);
      wrapLines(ctx, w0, h, lw * 0.5, tone(pal.hand, -0.3), [0.35, 0.7]);
      fist(ctx, f, el, h, pr.handR * s, pal.hand, pal.main);
    },
    leg(ctx, f, hip, k, a, pal, s, pr) {
      const lw = pr.limbW * s;
      seg(ctx, hip, k, lw * 0.82, lw * 0.64, pal.leg);
      seg(ctx, k, a, lw * 0.66, lw * 0.52, pal.leg);
      const c0 = lerpPt(k, a, 0.66);
      seg(ctx, c0, a, lw * 0.56, lw * 0.5, pal.hand);
      wrapLines(ctx, c0, a, lw * 0.5, tone(pal.hand, -0.3), [0.45]);
      boot(ctx, f, k, a, pr.footR * s, pal.foot, pal.sub);
    },
  },

  // ゴルドー：光る亀裂と結晶を持つ岩の巨人
  goldo: {
    hk: 1.12,
    body(ctx, f, P, w, h, pal, s) {
      const fc = f.facing;
      inBody(ctx, P);
      // 背中の結晶
      for (const [x, y, len, ang, wd] of [[-0.42, -0.3, 0.34, -0.95, 0.07], [-0.3, -0.44, 0.46, -0.5, 0.09], [-0.08, -0.5, 0.3, -0.18, 0.065]]) {
        const bx = x * w * fc, by = y * h, ux = Math.sin(ang) * fc, uy = -Math.cos(ang), L = len * h, W = wd * w;
        const cr = () => { ctx.beginPath(); ctx.moveTo(bx - uy * W, by + ux * W); ctx.lineTo(bx + ux * L * 0.75 - uy * W * 0.8, by + uy * L * 0.75 + ux * W * 0.8); ctx.lineTo(bx + ux * L, by + uy * L); ctx.lineTo(bx + ux * L * 0.75 + uy * W * 0.8, by + uy * L * 0.75 - ux * W * 0.8); ctx.lineTo(bx + uy * W, by - ux * W); ctx.closePath(); };
        cel(ctx, cr, pal.acc, W * 0.6, 2.4);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + ux * L * 0.8, by + uy * L * 0.8); ctx.stroke();
      }
      // 岩の胴体
      const R = [[-0.5, -0.36], [-0.24, -0.56], [0.22, -0.56], [0.56, -0.3], [0.6, 0.16], [0.36, 0.53], [-0.28, 0.55], [-0.56, 0.16]];
      const bd = () => { ctx.beginPath(); for (const [x, y] of R) ctx.lineTo(x * w * fc, y * h); ctx.closePath(); };
      cel(ctx, bd, pal.main, w * 0.12, 3.4);
      ctx.save(); bd(); ctx.clip();
      // 胸板と腹の岩板
      ctx.strokeStyle = tone(pal.main, -0.45); ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-0.5 * w * fc, -0.05 * h); ctx.lineTo(-0.1 * w * fc, 0.06 * h); ctx.lineTo(0.62 * w * fc, -0.02 * h);
      ctx.moveTo(-0.1 * w * fc, 0.06 * h); ctx.lineTo(-0.05 * w * fc, 0.6 * h); ctx.stroke();
      shine(ctx, 0.2 * w * fc, -0.3 * h, w * 0.18, h * 0.08, -0.3 * fc, 0.22);
      ctx.restore();
      // 光る亀裂
      glowLine(ctx, pal.acc, 1.8, () => { ctx.beginPath(); ctx.moveTo(0.38 * w * fc, -0.12 * h); ctx.lineTo(0.22 * w * fc, 0.06 * h); ctx.lineTo(0.32 * w * fc, 0.26 * h); ctx.lineTo(0.18 * w * fc, 0.42 * h); ctx.moveTo(-0.38 * w * fc, 0.2 * h); ctx.lineTo(-0.24 * w * fc, 0.36 * h); });
      // コア
      const cx = 0.05 * w * fc, cy = -0.24 * h, cr = w * 0.12, pulse = 0.55 + Math.sin(f.anim * 0.12) * 0.3;
      ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.fillStyle = tone(pal.main, -0.55); ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = OUTLINE; ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(ctx, cx, cy, cr * 2.2, pal.acc, pulse * 0.8);
      ctx.restore();
      ctx.strokeStyle = pal.acc; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy - cr * 0.6); ctx.lineTo(cx + cr * 0.55, cy + cr * 0.4); ctx.lineTo(cx - cr * 0.55, cy + cr * 0.4); ctx.closePath(); ctx.stroke();
      // 肩の苔
      ctx.fillStyle = pal.sub; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(-0.52 * w * fc, -0.34 * h); ctx.lineTo(-0.24 * w * fc, -0.58 * h); ctx.lineTo(0.24 * w * fc, -0.58 * h); ctx.lineTo(0.5 * w * fc, -0.36 * h);
      ctx.quadraticCurveTo(0.42 * w * fc, -0.2 * h, 0.34 * w * fc, -0.3 * h); ctx.quadraticCurveTo(0.26 * w * fc, -0.12 * h, 0.16 * w * fc, -0.36 * h);
      ctx.quadraticCurveTo(-0.05 * w * fc, -0.28 * h, -0.2 * w * fc, -0.4 * h); ctx.quadraticCurveTo(-0.32 * w * fc, -0.2 * h, -0.42 * w * fc, -0.32 * h);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = tone(pal.sub, 0.3); ctx.beginPath(); ctx.ellipse(-0.05 * w * fc, -0.5 * h, w * 0.16, h * 0.035, 0, 0, TAU); ctx.fill();
      ctx.restore();
    },
    head(ctx, f, P, r, pal, s) {
      const fc = f.facing, mood = faceMood(f);
      inHead(ctx, P);
      const hd = [[-0.95, -0.55], [-0.55, -0.98], [0.45, -0.98], [1.02, -0.55], [1.1, 0.15], [0.86, 0.78], [-0.22, 0.88], [-0.98, 0.45]];
      cel(ctx, () => { ctx.beginPath(); for (const [x, y] of hd) ctx.lineTo(x * r * fc, y * r); ctx.closePath(); }, pal.skin, r * 0.22, 3.2);
      // 苔の髪
      ctx.fillStyle = pal.hair; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(-0.8 * r * fc, -0.65 * r); ctx.lineTo(-0.55 * r * fc, -1.0 * r); ctx.lineTo(0.4 * r * fc, -1.0 * r); ctx.lineTo(0.7 * r * fc, -0.78 * r);
      for (const [x, y] of [[0.48, -0.62], [0.32, -0.82], [0.1, -0.58], [-0.12, -0.8], [-0.35, -0.55], [-0.55, -0.75]]) ctx.lineTo(x * r * fc, y * r);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // 張り出した眉
      cel(ctx, () => { ctx.beginPath(); ctx.moveTo(-0.25 * r * fc, -0.45 * r); ctx.lineTo(1.2 * r * fc, -0.42 * r); ctx.lineTo(1.12 * r * fc, -0.08 * r); ctx.lineTo(-0.15 * r * fc, -0.14 * r); ctx.closePath(); }, tone(pal.skin, -0.08), r * 0.12, 2.4);
      // 光る目
      ctx.fillStyle = '#100810';
      ctx.beginPath(); ctx.moveTo(-0.05 * r * fc, -0.1 * r); ctx.lineTo(1.08 * r * fc, -0.06 * r); ctx.lineTo(1.0 * r * fc, 0.22 * r); ctx.lineTo(0.0, 0.18 * r); ctx.closePath(); ctx.fill();
      const ey = mood === 'blink' ? 0.06 : 0.08;
      for (const ex of [0.2, 0.72]) {
        const x = ex * r * fc, y = ey * r;
        if (mood === 'hurt') {
          ctx.strokeStyle = pal.eye; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x - r * 0.1, y - r * 0.08); ctx.lineTo(x + r * 0.1, y + r * 0.08); ctx.moveTo(x + r * 0.1, y - r * 0.08); ctx.lineTo(x - r * 0.1, y + r * 0.08); ctx.stroke();
        } else {
          const hh = mood === 'blink' ? 0.3 : mood === 'calm' ? 1 : 1.3;
          glowLine(ctx, pal.eye, r * 0.13 * hh, () => { ctx.beginPath(); ctx.moveTo(x - r * 0.14, y + (mood === 'calm' ? 0 : -r * 0.05 * fc * (ex < 0.5 ? -1 : 1))); ctx.lineTo(x + r * 0.14, y); });
        }
      }
      // あご
      ctx.strokeStyle = tone(pal.skin, -0.5); ctx.lineWidth = 2;
      if (mood === 'shout') {
        ctx.fillStyle = '#100810'; ctx.beginPath(); ctx.moveTo(0.15 * r * fc, 0.42 * r); ctx.lineTo(0.95 * r * fc, 0.38 * r); ctx.lineTo(0.8 * r * fc, 0.7 * r); ctx.lineTo(0.2 * r * fc, 0.68 * r); ctx.closePath(); ctx.fill();
        glowLine(ctx, pal.eye, 1.4, () => { ctx.beginPath(); ctx.moveTo(0.25 * r * fc, 0.6 * r); ctx.lineTo(0.8 * r * fc, 0.58 * r); });
      } else { ctx.beginPath(); ctx.moveTo(0.2 * r * fc, 0.5 * r); ctx.lineTo(0.55 * r * fc, 0.54 * r); ctx.lineTo(0.95 * r * fc, 0.46 * r); ctx.stroke(); }
      ctx.restore();
    },
    arm(ctx, f, sh, el, h, pal, s, pr, back) {
      const lw = pr.limbW * s, hr = pr.handR * s;
      seg(ctx, sh, el, lw * 0.55, lw * 0.5, pal.limb);
      seg(ctx, el, h, lw * 0.62, lw * 0.82, pal.hand);
      // 前腕のひび
      const dx = h.x - el.x, dy = h.y - el.y;
      ctx.strokeStyle = tone(pal.hand, -0.5); ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(el.x + dx * 0.3, el.y + dy * 0.3); ctx.lineTo(el.x + dx * 0.45 - dy * 0.12, el.y + dy * 0.45 + dx * 0.12); ctx.lineTo(el.x + dx * 0.6, el.y + dy * 0.6); ctx.stroke();
      // 岩のこぶし
      enterSeg(ctx, el, h, f.facing);
      const pts = [[-0.9, -0.7], [-0.3, -1.0], [0.55, -0.92], [1.05, -0.4], [1.05, 0.45], [0.6, 0.95], [-0.35, 0.98], [-0.95, 0.5]];
      cel(ctx, () => { ctx.beginPath(); for (const [x, y] of pts) ctx.lineTo(x * hr, y * hr); ctx.closePath(); }, pal.hand, hr * 0.35, 3);
      ctx.strokeStyle = tone(pal.hand, -0.45); ctx.lineWidth = 2;
      ctx.beginPath(); for (const y of [-0.35, 0.1, 0.55]) { ctx.moveTo(hr * 0.35, y * hr); ctx.lineTo(hr * 1.0, y * hr); } ctx.stroke();
      if (!back) glowLine(ctx, pal.acc, 1.4, () => { ctx.beginPath(); ctx.moveTo(-hr * 0.4, -hr * 0.2); ctx.lineTo(-hr * 0.1, hr * 0.15); ctx.lineTo(-hr * 0.4, hr * 0.45); });
      ctx.restore();
      // 肩当ての岩
      const pa = Math.atan2(el.y - sh.y, el.x - sh.x);
      if (!back) {
        ctx.save(); ctx.translate(sh.x, sh.y); ctx.rotate(pa); if (f.facing < 0) ctx.scale(1, -1);
        cel(ctx, () => { ctx.beginPath(); for (const [x, y] of [[-0.55, -0.15], [-0.2, -0.62], [0.45, -0.66], [0.85, -0.2], [0.7, 0.42], [0.1, 0.55], [-0.45, 0.35]]) ctx.lineTo(x * lw, y * lw); ctx.closePath(); }, pal.main, lw * 0.22, 2.8);
        ctx.fillStyle = pal.sub; ctx.beginPath(); ctx.moveTo(-0.5 * lw, -0.18 * lw); ctx.lineTo(-0.2 * lw, -0.6 * lw); ctx.lineTo(0.42 * lw, -0.64 * lw); ctx.quadraticCurveTo(0.2 * lw, -0.3 * lw, -0.5 * lw, -0.18 * lw); ctx.fill();
        ctx.restore();
      }
    },
    leg(ctx, f, hip, k, a, pal, s, pr) {
      const lw = pr.limbW * s;
      seg(ctx, hip, k, lw * 0.6, lw * 0.55, pal.limb);
      seg(ctx, k, a, lw * 0.7, lw * 0.76, pal.main);
      boot(ctx, f, k, a, pr.footR * s, pal.hand, null, { toe: 1.35, extra: (r) => { ctx.strokeStyle = tone(pal.hand, -0.45); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(r * 0.75, r * 0.1); ctx.lineTo(r * 0.75, r * 0.8); ctx.moveTo(r * 1.1, r * 0.15); ctx.lineTo(r * 1.1, r * 0.8); ctx.stroke(); } });
    },
  },

  // ミュウ：猫耳フードのくノ一
  myu: {
    hk: 1.1,
    body(ctx, f, P, w, h, pal, s) {
      const fc = f.facing, top = -h / 2, bot = h / 2;
      inBody(ctx, P);
      const tp = () => torsoPath(ctx, fc, w * 1.08, w * 0.86, h, 0.08);
      cel(ctx, tp, pal.main, w * 0.16, 3);
      ctx.save(); tp(); ctx.clip();
      // 合わせ襟
      ctx.lineCap = 'round';
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 7 * s;
      ctx.beginPath(); ctx.moveTo(-0.3 * w * fc, top); ctx.lineTo(0.42 * w * fc, top + h * 0.55); ctx.stroke();
      ctx.strokeStyle = pal.limb; ctx.lineWidth = 4 * s;
      ctx.beginPath(); ctx.moveTo(-0.3 * w * fc, top); ctx.lineTo(0.42 * w * fc, top + h * 0.55); ctx.stroke();
      // 帯
      ctx.fillStyle = pal.sub; ctx.fillRect(-w, bot - h * 0.26, w * 2, h * 0.16);
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-w, bot - h * 0.26); ctx.lineTo(w, bot - h * 0.26); ctx.moveTo(-w, bot - h * 0.1); ctx.lineTo(w, bot - h * 0.1); ctx.stroke();
      ctx.restore();
      tp(); ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE; ctx.stroke();
      // 腰の結び目とクナイ袋
      const ky = bot - h * 0.18;
      ctx.fillStyle = pal.sub; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(-0.5 * w * fc, ky, 4 * s, 3 * s, 0.5 * fc, 0, TAU); ctx.fill(); ctx.stroke();
      cel(ctx, () => roundRect(ctx, (fc > 0 ? 0.1 : -0.42) * w, ky + 2 * s, w * 0.32, 7 * s, 2 * s), pal.limb, 2, 2);
      ctx.restore();
    },
    head(ctx, f, P, r, pal, s) {
      const fc = f.facing, mood = faceMood(f);
      inHead(ctx, P);
      // 猫耳
      const earAt = (x, y, tilt, col) => {
        ctx.save(); ctx.translate(x * r * fc, y * r); ctx.rotate(tilt * fc);
        cel(ctx, () => { ctx.beginPath(); ctx.moveTo(-r * 0.32, r * 0.2); ctx.quadraticCurveTo(-r * 0.2, -r * 0.5, 0, -r * 0.62); ctx.quadraticCurveTo(r * 0.22, -r * 0.4, r * 0.34, r * 0.2); ctx.closePath(); }, col, r * 0.1, 2.6);
        ctx.fillStyle = pal.sub; ctx.beginPath(); ctx.moveTo(-r * 0.16, r * 0.1); ctx.quadraticCurveTo(-r * 0.08, -r * 0.3, 0, -r * 0.38); ctx.quadraticCurveTo(r * 0.12, -r * 0.2, r * 0.17, r * 0.1); ctx.closePath(); ctx.fill();
        ctx.restore();
      };
      earAt(-0.52, -0.82, -0.45, tone(pal.main, -0.18));
      earAt(0.3, -0.98, 0.15, pal.main);
      // フード
      cel(ctx, () => { ctx.beginPath(); ctx.arc(0, 0, r * 1.06, 0, TAU); }, pal.main, r * 0.24, 3.2);
      // 顔の開き口と口元を覆う面頬
      const op = () => { ctx.beginPath(); ctx.ellipse(r * 0.42 * fc, r * 0.1, r * 0.66, r * 0.5, 0, 0, TAU); };
      ctx.save(); op(); ctx.fillStyle = pal.skin; ctx.fill(); ctx.clip();
      ctx.fillStyle = pal.hair; ctx.beginPath(); ctx.moveTo(-r * 0.3 * fc, r * 0.18); ctx.quadraticCurveTo(r * 0.5 * fc, r * 0.3, r * 1.1 * fc, r * 0.24); ctx.lineTo(r * 1.1 * fc, r); ctx.lineTo(-r * 0.3 * fc, r); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = tone(pal.hair, 0.3); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(r * 0.2 * fc, r * 0.42); ctx.lineTo(r * 0.85 * fc, r * 0.4); ctx.stroke();
      ctx.restore();
      op(); ctx.lineWidth = 2.2; ctx.strokeStyle = OUTLINE; ctx.stroke();
      animeEyes(ctx, f, r, { y: 0.04, x1: 0.24, x2: 0.7, w: 0.16, h: 0.22, iris: pal.acc, brow: tone(pal.hair, -0.2), browW: 0.09, slit: true }, mood);
      // 額当て
      ctx.save(); ctx.translate(r * 0.45 * fc, -r * 0.66); ctx.rotate(0.12 * fc);
      cel(ctx, () => roundRect(ctx, -r * 0.42, -r * 0.15, r * 0.84, r * 0.3, r * 0.08), '#c9d2de', r * 0.08, 2.2);
      ctx.strokeStyle = tone(pal.acc, -0.2); ctx.lineWidth = 1.4;
      ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + f.anim * 0.0; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.1, Math.sin(a) * r * 0.1); } ctx.stroke();
      ctx.restore();
      // 結び目
      ball(ctx, -r * 0.98 * fc, -r * 0.1, r * 0.2, pal.sub, 2);
      ctx.restore();
    },
    arm(ctx, f, sh, el, h, pal, s, pr) {
      const lw = pr.limbW * s;
      seg(ctx, sh, el, lw * 0.78, lw * 0.6, pal.main);
      seg(ctx, el, h, lw * 0.54, lw * 0.48, pal.limb);
      seg(ctx, lerpPt(el, h, 0.25), lerpPt(el, h, 0.85), lw * 0.62, lw * 0.6, tone(pal.limb, 0.35));
      fist(ctx, f, el, h, pr.handR * s, pal.hand);
    },
    leg(ctx, f, hip, k, a, pal, s, pr) {
      const lw = pr.limbW * s;
      seg(ctx, hip, k, lw * 0.86, lw * 0.62, pal.limb);
      seg(ctx, k, a, lw * 0.6, lw * 0.48, tone(pal.limb, 0.12));
      wrapLines(ctx, k, a, lw * 0.55, tone(pal.limb, -0.35), [0.3, 0.52, 0.74]);
      boot(ctx, f, k, a, pr.footR * s, pal.foot, null, { toe: 1.5, extra: (r) => { ctx.strokeStyle = tone(pal.foot, 0.35); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(r * 1.0, -r * 0.05); ctx.lineTo(r * 0.95, r * 0.75); ctx.stroke(); } });
    },
  },

  // ボルティ：ブラウン管頭の電撃ロボ
  volty: {
    body(ctx, f, P, w, h, pal, s) {
      const fc = f.facing;
      inBody(ctx, P);
      // 背中のバッテリー
      cel(ctx, () => roundRect(ctx, (fc > 0 ? -0.78 : 0.3) * w, -h * 0.38, w * 0.48, h * 0.62, w * 0.12), pal.limb, w * 0.06, 2.6);
      for (let i = 0; i < 3; i++) {
        const on = ((f.anim >> 4) % 4) > i;
        ctx.fillStyle = on ? pal.acc : tone(pal.limb, -0.3);
        ctx.fillRect(-0.62 * w * fc - 2 * s, -h * 0.26 + i * h * 0.16, 4 * s, h * 0.08);
      }
      const bd = () => roundRect(ctx, -w / 2, -h / 2, w, h * 0.96, w * 0.34);
      cel(ctx, bd, pal.main, w * 0.14, 3.2);
      // 胸パネル
      cel(ctx, () => roundRect(ctx, -w * 0.3 + w * 0.06 * fc, -h * 0.36, w * 0.6, h * 0.42, w * 0.12), tone(pal.main, 0.35), w * 0.05, 2.2);
      // コア
      const cx = w * 0.06 * fc, cy = -h * 0.15, cr = w * 0.16, pulse = 0.6 + Math.sin(f.anim * 0.15) * 0.3;
      ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.fillStyle = '#141826'; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = OUTLINE; ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, cx, cy, cr * 1.9, pal.acc, pulse); ctx.restore();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(cx + cr * 0.15, cy - cr * 0.7); ctx.lineTo(cx - cr * 0.35, cy + cr * 0.1); ctx.lineTo(cx, cy + cr * 0.05); ctx.lineTo(cx - cr * 0.15, cy + cr * 0.7); ctx.lineTo(cx + cr * 0.38, cy - cr * 0.12); ctx.lineTo(cx + cr * 0.02, cy - cr * 0.08); ctx.closePath(); ctx.fill();
      // 腰のライン
      ctx.save(); bd(); ctx.clip();
      ctx.fillStyle = pal.sub; ctx.fillRect(-w, h * 0.2, w * 2, h * 0.14);
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-w, h * 0.2); ctx.lineTo(w, h * 0.2); ctx.moveTo(-w, h * 0.34); ctx.lineTo(w, h * 0.34); ctx.stroke();
      ctx.restore();
      bd(); ctx.lineWidth = 3.2; ctx.strokeStyle = OUTLINE; ctx.stroke();
      // リベット
      ctx.fillStyle = tone(pal.main, -0.4);
      for (const [x, y] of [[-0.36, -0.36], [0.36, -0.36], [-0.38, 0.08], [0.38, 0.08]]) { ctx.beginPath(); ctx.arc(x * w, y * h, 1.6 * s, 0, TAU); ctx.fill(); }
      ctx.restore();
    },
    head(ctx, f, P, r, pal, s) {
      const fc = f.facing, mood = faceMood(f), eye = pal.eye;
      inHead(ctx, P);
      // バネのアンテナ
      const sway = Math.sin(f.anim * 0.13) * 0.12 + clamp((f.vy || 0) * 0.03, -0.35, 0.35) * fc;
      ctx.save(); ctx.translate(-r * 0.1 * fc, -r * 0.88); ctx.rotate(sway - 0.15 * fc);
      const zig = () => { ctx.beginPath(); ctx.moveTo(0, 0); for (let i = 1; i <= 5; i++) ctx.lineTo((i % 2 ? 1 : -1) * r * 0.12, -i * r * 0.13); ctx.lineTo(0, -r * 0.75); };
      ctx.lineJoin = 'round'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 4.5; zig(); ctx.stroke();
      ctx.strokeStyle = pal.limb === '#ffffff' ? '#fff' : tone(pal.limb, 0.4); ctx.lineWidth = 2; zig(); ctx.stroke();
      ball(ctx, 0, -r * 0.82, r * 0.2, pal.acc, 2.4);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, -r * 0.82, r * 0.5, pal.acc, 0.5 + Math.sin(f.anim * 0.2) * 0.2); ctx.restore();
      ctx.restore();
      // 耳のボルト
      cel(ctx, () => roundRect(ctx, -r * 1.22 * fc - r * 0.2, -r * 0.32, r * 0.4, r * 0.64, r * 0.12), pal.sub, r * 0.08, 2.4);
      // 頭（ブラウン管）
      const box = () => roundRect(ctx, -r * 1.06, -r * 0.92, r * 2.12, r * 1.8, r * 0.42);
      cel(ctx, box, pal.skin, r * 0.2, 3.2);
      ctx.strokeStyle = tone(pal.skin, -0.3); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); for (let i = 0; i < 3; i++) { const y = -r * 0.25 + i * r * 0.22; ctx.moveTo(-r * 0.92 * fc, y); ctx.lineTo(-r * 0.68 * fc, y); } ctx.stroke();
      // 画面
      const sx = r * 0.22 * fc, scr = () => roundRect(ctx, sx - r * 0.66, -r * 0.62, r * 1.32, r * 1.18, r * 0.3);
      scr(); ctx.fillStyle = '#10131f'; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = OUTLINE; ctx.stroke();
      ctx.save(); scr(); ctx.clip();
      ctx.fillStyle = rgba(eye, 0.07); for (let y = -r * 0.6; y < r * 0.6; y += 3) ctx.fillRect(sx - r, y, r * 2, 1.2);
      // LEDの顔
      ctx.globalCompositeOperation = 'lighter';
      const led = (draw, lw) => { ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = rgba(eye, 0.35); ctx.lineWidth = lw * 2.4; draw(); ctx.stroke(); ctx.strokeStyle = eye; ctx.lineWidth = lw; draw(); ctx.stroke(); };
      const ey = -r * 0.1, lw = r * 0.13;
      for (const k of [-1, 1]) {
        const x = sx + k * r * 0.3;
        if (mood === 'hurt') led(() => { ctx.beginPath(); ctx.moveTo(x - r * 0.1, ey - r * 0.1); ctx.lineTo(x + r * 0.1, ey + r * 0.1); ctx.moveTo(x + r * 0.1, ey - r * 0.1); ctx.lineTo(x - r * 0.1, ey + r * 0.1); }, lw * 0.8);
        else if (mood === 'blink') led(() => { ctx.beginPath(); ctx.moveTo(x - r * 0.1, ey + r * 0.04); ctx.lineTo(x + r * 0.1, ey + r * 0.04); }, lw);
        else if (mood === 'fight' || mood === 'shout') led(() => { ctx.beginPath(); ctx.moveTo(x - k * r * 0.12, ey - r * 0.12); ctx.lineTo(x + k * r * 0.1, ey - r * 0.02); ctx.lineTo(x + k * r * 0.1, ey + r * 0.06); }, lw * 0.9);
        else led(() => { ctx.beginPath(); ctx.moveTo(x, ey - r * 0.1); ctx.lineTo(x, ey + r * 0.08); }, lw * 1.1);
      }
      const my = r * 0.28;
      if (mood === 'shout') led(() => roundRect(ctx, sx - r * 0.16, my - r * 0.06, r * 0.32, r * 0.18, r * 0.06), lw * 0.6);
      else if (mood === 'hurt') led(() => { ctx.beginPath(); ctx.moveTo(sx - r * 0.2, my); for (let i = 1; i <= 4; i++) ctx.lineTo(sx - r * 0.2 + i * r * 0.1, my + (i % 2 ? -1 : 1) * r * 0.05); }, lw * 0.5);
      else if (mood === 'fight') led(() => { ctx.beginPath(); ctx.moveTo(sx - r * 0.14, my); ctx.lineTo(sx + r * 0.14, my); }, lw * 0.6);
      else led(() => { ctx.beginPath(); ctx.arc(sx, my - r * 0.1, r * 0.13, 0.5, Math.PI - 0.5); }, lw * 0.6);
      ctx.globalCompositeOperation = 'source-over';
      // 画面の反射
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath(); ctx.moveTo(sx - r * 0.66, -r * 0.62); ctx.lineTo(sx - r * 0.1, -r * 0.62); ctx.lineTo(sx - r * 0.66, r * 0.05); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.restore();
    },
    arm(ctx, f, sh, el, h, pal, s, pr) {
      const lw = pr.limbW * s, hr = pr.handR * s;
      seg(ctx, sh, el, lw * 0.42, lw * 0.4, pal.limb);
      wrapLines(ctx, sh, el, lw * 0.42, tone(pal.limb, 0.3), [0.3, 0.55]);
      ball(ctx, el.x, el.y, lw * 0.56, pal.sub, 2.4);
      seg(ctx, lerpPt(el, h, 0.15), h, lw * 0.66, lw * 0.86, pal.main);
      seg(ctx, lerpPt(el, h, 0.62), lerpPt(el, h, 0.78), lw * 0.82, lw * 0.86, pal.sub);
      // ハサミ型の手
      enterSeg(ctx, el, h, f.facing);
      for (const k of [-1, 1]) celCap(ctx, hr * 0.2, k * hr * 0.42, hr * 1.15, k * hr * 0.28, hr * 0.38, hr * 0.3, pal.hand, 2.2);
      ball(ctx, hr * 0.15, 0, hr * 0.72, pal.hand, 2.6);
      ctx.restore();
    },
    leg(ctx, f, hip, k, a, pal, s, pr) {
      const lw = pr.limbW * s, fr = pr.footR * s;
      seg(ctx, hip, k, lw * 0.44, lw * 0.42, pal.limb);
      wrapLines(ctx, hip, k, lw * 0.44, tone(pal.limb, 0.3), [0.4, 0.65]);
      seg(ctx, lerpPt(k, a, 0.15), a, lw * 0.62, lw * 0.8, pal.main);
      ball(ctx, k.x, k.y, lw * 0.56, pal.sub, 2.4);
      boot(ctx, f, k, a, fr, pal.foot, pal.sub, { toe: 1.3, extra: (r) => {
        if (f.grounded !== false) return;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const fl = r * (1.2 + Math.sin(f.anim * 0.9) * 0.3);
        ctx.fillStyle = rgba(pal.acc, 0.55); ctx.beginPath(); ctx.moveTo(-r * 0.4, r * 0.9); ctx.quadraticCurveTo(r * 0.2, r * 0.9 + fl * 1.4, r * 0.8, r * 0.9); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.moveTo(-r * 0.1, r * 0.9); ctx.quadraticCurveTo(r * 0.2, r * 0.9 + fl * 0.7, r * 0.5, r * 0.9); ctx.closePath(); ctx.fill();
        ctx.restore();
      } });
    },
  },

  // ルナ：月の騎士姫
  luna: {
    hk: 1.08,
    body(ctx, f, P, w, h, pal, s) {
      const fc = f.facing, top = -h / 2;
      // スカート
      ctx.save(); ctx.translate(P.hip.x, P.hip.y); ctx.rotate(P.bodyAng);
      const sk = () => { ctx.beginPath(); ctx.moveTo(-w * 0.5, -6 * s); ctx.lineTo(w * 0.5, -6 * s); ctx.quadraticCurveTo(w * 0.8, 4 * s, w * 0.95, 15 * s); ctx.quadraticCurveTo(0, 19 * s, -w * 0.95, 15 * s); ctx.quadraticCurveTo(-w * 0.8, 4 * s, -w * 0.5, -6 * s); ctx.closePath(); };
      cel(ctx, sk, tone(pal.main, -0.12), w * 0.12, 2.8);
      ctx.save(); sk(); ctx.clip();
      ctx.strokeStyle = pal.sub; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(-w, 14 * s); ctx.quadraticCurveTo(0, 18 * s, w, 14 * s); ctx.stroke();
      ctx.restore();
      // 前垂れの鎧
      cel(ctx, () => { ctx.beginPath(); ctx.moveTo(w * 0.05 * fc, -4 * s); ctx.lineTo(w * 0.55 * fc, -4 * s); ctx.lineTo(w * 0.62 * fc, 10 * s); ctx.quadraticCurveTo(w * 0.32 * fc, 13 * s, w * 0.1 * fc, 10 * s); ctx.closePath(); }, pal.sub, 2 * s, 2.4);
      ctx.restore();
      inBody(ctx, P);
      const tp = () => torsoPath(ctx, fc, w * 1.05, w * 0.72, h, 0.06);
      cel(ctx, tp, pal.main, w * 0.16, 3);
      // 胸当て
      ctx.save(); tp(); ctx.clip();
      const bp = () => { ctx.beginPath(); ctx.moveTo(-w, top); ctx.lineTo(w, top); ctx.lineTo(w, top + h * 0.5); ctx.quadraticCurveTo(0.2 * w * fc, top + h * 0.66, -w, top + h * 0.48); ctx.closePath(); };
      cel(ctx, bp, pal.sub, w * 0.12, 2.4);
      ctx.fillStyle = pal.acc; ctx.fillRect(-w, h * 0.22, w * 2, h * 0.07);
      ctx.restore();
      tp(); ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE; ctx.stroke();
      // 三日月の紋章
      const mx = 0.2 * w * fc, my = top + h * 0.28, mr = w * 0.16;
      ctx.save(); ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.arc(mx + mr * 0.45 * fc, my - mr * 0.2, mr * 0.82, 0, TAU, true);
      ctx.fillStyle = pal.acc; ctx.fill('evenodd'); ctx.restore();
      shine(ctx, -0.05 * w * fc, top + h * 0.18, w * 0.16, h * 0.05, -0.3 * fc, 0.4);
      ctx.restore();
    },
    head(ctx, f, P, r, pal, s) {
      const fc = f.facing, mood = faceMood(f);
      inHead(ctx, P);
      // 後ろ髪
      cel(ctx, () => { ctx.beginPath(); ctx.moveTo(0.6 * r * fc, -0.9 * r); ctx.bezierCurveTo(-0.6 * r * fc, -1.5 * r, -1.4 * r * fc, -0.7 * r, -1.3 * r * fc, 0.7 * r); ctx.lineTo(-1.42 * r * fc, 1.3 * r); ctx.lineTo(-1.05 * r * fc, 1.05 * r); ctx.lineTo(-0.85 * r * fc, 1.35 * r); ctx.lineTo(-0.6 * r * fc, 1.0 * r); ctx.lineTo(-0.35 * r * fc, 1.15 * r); ctx.lineTo(0, 0.2 * r); ctx.closePath(); }, pal.hair, r * 0.18, 2.8);
      cel(ctx, () => headPath(ctx, r, fc), pal.skin, r * 0.22, 3);
      // 前髪（ぱっつん）と横髪
      const bang = () => {
        ctx.beginPath();
        ctx.moveTo(-1.02 * r * fc, 0.2 * r);
        ctx.bezierCurveTo(-1.15 * r * fc, -1.3 * r, 1.0 * r * fc, -1.45 * r, 1.04 * r * fc, -0.15 * r);
        for (const [x, y] of [[0.84, -0.22], [0.7, -0.08], [0.52, -0.24], [0.34, -0.1], [0.16, -0.28], [-0.02, -0.14]]) ctx.lineTo(x * r * fc, y * r);
        ctx.quadraticCurveTo(-0.05 * r * fc, 0.35 * r, 0.05 * r * fc, 0.95 * r);
        ctx.lineTo(-0.3 * r * fc, 0.85 * r);
        ctx.quadraticCurveTo(-0.45 * r * fc, 0.4 * r, -0.6 * r * fc, 0.15 * r);
        ctx.closePath();
      };
      cel(ctx, bang, pal.hair, r * 0.14, 2.6);
      ctx.save(); bang(); ctx.clip();
      ctx.strokeStyle = rgba(tone(pal.hair, -0.4), 0.45); ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      ctx.beginPath();
      for (const [x0, x1] of [[0.0, 0.16], [0.3, 0.34], [0.55, 0.52], [0.8, 0.7], [-0.4, -0.15]]) { ctx.moveTo(x0 * r * fc, -0.6 * r); ctx.quadraticCurveTo((x0 + x1) * 0.5 * r * fc, -0.4 * r, x1 * r * fc, -0.22 * r); }
      ctx.moveTo(-0.32 * r * fc, 0.1 * r); ctx.quadraticCurveTo(-0.2 * r * fc, 0.5 * r, -0.12 * r * fc, 0.85 * r);
      ctx.stroke(); ctx.restore();
      // 天使の輪
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = r * 0.08; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(0, -0.55 * r, r * 0.75, r * 0.3, 0, Math.PI * 1.15, Math.PI * 1.75); ctx.stroke();
      // 三日月のティアラ
      const tx = 0.2 * r * fc, ty = -0.98 * r;
      ctx.beginPath(); ctx.arc(tx, ty, r * 0.28, 0, TAU); ctx.arc(tx + r * 0.14 * fc, ty - r * 0.09, r * 0.22, 0, TAU, true);
      ctx.fillStyle = pal.acc; ctx.fill('evenodd'); ctx.lineWidth = 1.8; ctx.strokeStyle = OUTLINE; ctx.stroke();
      animeEyes(ctx, f, r, { y: 0.18, x1: 0.24, x2: 0.68, w: 0.15, h: 0.27, iris: tone(pal.eye, 0.25), brow: tone(pal.hair, -0.4), browW: 0.07, lash: true }, mood);
      if (mood !== 'hurt') blush(ctx, r, fc, 0.45, 0.5);
      mouth(ctx, f, r, 0.6, 0.68, mood);
      ctx.restore();
    },
    arm(ctx, f, sh, el, h, pal, s, pr, back) {
      const lw = pr.limbW * s;
      seg(ctx, sh, el, lw * 0.62, lw * 0.5, pal.limb);
      seg(ctx, el, h, lw * 0.5, lw * 0.6, pal.sub);
      fist(ctx, f, el, h, pr.handR * s, pal.hand);
      // 袖のふくらみと肩当て
      ball(ctx, sh.x, sh.y, lw * 0.9, pal.main, 2.6);
      if (!back) {
        const pa = Math.atan2(el.y - sh.y, el.x - sh.x);
        ctx.save(); ctx.translate(sh.x, sh.y); ctx.rotate(pa); if (f.facing < 0) ctx.scale(1, -1);
        cel(ctx, () => { ctx.beginPath(); ctx.ellipse(lw * 0.1, -lw * 0.2, lw * 1.05, lw * 0.8, 0, Math.PI * 0.85, Math.PI * 2.15); ctx.closePath(); }, pal.sub, lw * 0.3, 2.4);
        ctx.strokeStyle = pal.acc; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(lw * 0.1, -lw * 0.2, lw * 0.8, lw * 0.55, 0, Math.PI * 1.0, Math.PI * 2.0); ctx.stroke();
        ctx.restore();
      }
    },
    leg(ctx, f, hip, k, a, pal, s, pr) {
      const lw = pr.limbW * s;
      seg(ctx, hip, k, lw * 0.66, lw * 0.52, pal.limb);
      seg(ctx, k, a, lw * 0.6, lw * 0.5, pal.foot);
      ball(ctx, k.x, k.y, lw * 0.62, pal.sub, 2.2);
      boot(ctx, f, k, a, pr.footR * s, pal.foot, pal.sub, { toe: 1.6 });
    },
  },
};

// ---------- 攻撃の軌跡 ----------
function drawTrail(ctx, f) {
  const T = f.trail;
  if (T.length < 2) return;
  const el = EL[T[T.length - 1].el] || EL.hit;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 1; i < T.length; i++) {
    const a = T[i - 1], b = T[i];
    const k = i / T.length;
    ctx.fillStyle = rgba(el.c2, 0.5 * k);
    ctx.beginPath();
    ctx.moveTo(a.ax, a.ay); ctx.lineTo(a.bx, a.by); ctx.lineTo(b.bx, b.by); ctx.lineTo(b.ax, b.ay);
    ctx.closePath(); ctx.fill();
    // 先端の白いライン
    ctx.strokeStyle = rgba(el.c1, 0.8 * k); ctx.lineWidth = 4 * k + 1;
    ctx.beginPath(); ctx.moveTo(a.bx, a.by); ctx.lineTo(b.bx, b.by); ctx.stroke();
  }
  ctx.restore();
}

// ---------- 付属表示 ----------
function drawShield(ctx, f) {
  if (!f.isShielding()) return;
  const r = (24 + 24 * (f.shieldHP / SHIELD_MAX)) * f.scale;
  const c = f.pts.center;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(c.x, c.y, r * 0.2, c.x, c.y, r);
  g.addColorStop(0, rgba(f.color, 0.08)); g.addColorStop(1, rgba(f.color, 0.55));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', 0.6); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(c.x, c.y, r, -2.4, -1.2); ctx.stroke();
  ctx.restore();
}
function drawReflector(ctx, f) {
  if (!f.reflectActive()) return;
  const c = f.pts.center, r = 40 * f.scale;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(120,230,255,0.9)'; ctx.fillStyle = 'rgba(80,200,255,0.25)'; ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + f.anim * 0.1; ctx.lineTo(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function drawCounterAura(ctx, f) {
  if (!f.counterActive()) return;
  const c = f.pts.center, r = 36 * f.scale + Math.sin(f.anim * 0.5) * 3;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(140,255,210,0.8)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, TAU); ctx.stroke();
  ctx.restore();
}
function drawChargeGlow(ctx, f) {
  const lv = f.state === 'attack' && f.move && f.move.chargeShot ? f.chargeLv / VOLTY_MAX_CHARGE : 0;
  const stored = f.stored / VOLTY_MAX_CHARGE;
  if (lv > 0) {
    const p = f.pts.fh, r = 8 + lv * 16;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, p.x, p.y, r * 2, '#4ad8ff', 0.9);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.5, 0, TAU); ctx.fill();
    ctx.restore();
  } else if (stored >= 1 && (f.anim >> 3) % 2) {
    const p = f.pts.center;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, p.x, p.y, 40, '#4ad8ff', 0.5);
    ctx.restore();
  }
}
// 足元の影
function drawShadow(ctx, f, stage) {
  if (!f.alive || f.state === 'respawn') return;
  let best = null;
  for (const p of stage.all) if (f.x >= p.x1 && f.x <= p.x2 && p.y >= f.y - 2 && (!best || p.y < best.y)) best = p;
  if (!best) return;
  const d = best.y - f.y;
  if (d > 400) return;
  const k = 1 - d / 400;
  ctx.fillStyle = `rgba(0,0,0,${0.32 * k})`;
  ctx.beginPath(); ctx.ellipse(f.x, best.y + 1, 26 * f.scale * (0.5 + k * 0.5), 6 * f.scale, 0, 0, TAU); ctx.fill();
}

// ---------- 頭アイコン（HUD用） ----------
function drawPortrait(ctx, char, palIdx, x, y, size) {
  const fake = {
    char, pal: char.pals[palIdx % char.pals.length], facing: 1, scale: 1, state: 'idle', anim: 0, blink: 100, flash: 0, sf: 0,
    pts: newPts(), invuln: 0,
  };
  solveSkeleton(char.stance, char.prop, 0, 0, 1, 1, fake.pts);
  const P = fake.pts;
  const r = char.prop.head;
  const k = size / (r * 2.6);
  ctx.save();
  ctx.translate(x, y); ctx.scale(k, k); ctx.translate(-P.head.x, -P.head.y);
  CHAR_DRAW[char.id].head(ctx, fake, P, r, fake.pal, 1);
  ctx.restore();
}
