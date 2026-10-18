'use strict';
// ===== キャラクター描画 =====
const OUTLINE = '#120c18';

// ---------- なびく布・髪 ----------
function makeRibbons(f) {
  const id = f.char.id, s = f.scale;
  const R = [];
  if (id === 'blaze') { R.push({ at: 'head', off: [-12, -6], n: 5, seg: 8 * s, w: 5 * s, col: 'acc' }); R.push({ at: 'head', off: [-12, -4], n: 4, seg: 7 * s, w: 4 * s, col: 'acc', ph: 1 }); }
  if (id === 'myu') R.push({ at: 'neck', off: [-4, 2], n: 8, seg: 9 * s, w: 7 * s, col: 'sub' });
  if (id === 'luna') R.push({ at: 'head', off: [-8, -4], n: 7, seg: 8.5 * s, w: 13 * s, col: 'hair', taper: 0.35 });
  if (id === 'volty') R.push({ at: 'head', off: [0, -26], n: 3, seg: 5 * s, w: 2.5 * s, col: 'limb', stiff: true });
  for (const r of R) { r.p = []; for (let i = 0; i < r.n; i++) r.p.push({ x: f.x, y: f.y - 60, px: f.x, py: f.y - 60 }); r.reset = true; }
  return R;
}
function ribbonAnchor(f, rb) {
  const p = f.pts[rb.at], a = rb.at === 'neck' ? f.pts.bodyAng : (f.pts.headAng || 0);
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
  for (let i = 1; i < P.length; i++) {
    const q = P[i];
    const vx = (q.x - q.px) * 0.86, vy = (q.y - q.py) * 0.86;
    q.px = q.x; q.py = q.y;
    q.x += vx - f.facing * (rb.stiff ? 0 : 0.35) + Math.sin(t + i * 0.9) * 0.25;
    q.y += vy + (rb.stiff ? -0.6 : 0.45);
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
function drawRibbon(ctx, f, rb, pal) {
  const P = rb.p;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass === 0 ? OUTLINE : pal[rb.col];
    for (let i = 1; i < P.length; i++) {
      const k = 1 - (i / P.length) * (rb.taper !== undefined ? 1 - rb.taper : 0.5);
      ctx.lineWidth = rb.w * k + (pass === 0 ? 4 : 0);
      ctx.beginPath(); ctx.moveTo(P[i - 1].x, P[i - 1].y); ctx.lineTo(P[i].x, P[i].y); ctx.stroke();
    }
  }
}

// ---------- パーツ ----------
function limb(ctx, a, j, b, w, col) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = w + 4.5;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(j.x, j.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(j.x, j.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}
function circ(ctx, x, y, r, col, lw = 3) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = col; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = OUTLINE; ctx.stroke();
}
function foot(ctx, k, p, r, col, facing) {
  const a = Math.atan2(p.y - k.y, p.x - k.x);
  ctx.save(); ctx.translate(p.x, p.y);
  ctx.rotate(a - Math.PI / 2 * facing * 0.0);
  ctx.beginPath();
  ctx.ellipse(facing * r * 0.25, 0, r * 1.25, r * 0.85, a > 0 ? 0 : 0, 0, TAU);
  ctx.restore();
  ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE; ctx.stroke();
}
function torso(ctx, f, P, w, h, col, round) {
  const a = P.bodyAng;
  ctx.save();
  ctx.translate((P.hip.x + P.neck.x) / 2, (P.hip.y + P.neck.y) / 2);
  ctx.rotate(a);
  roundRect(ctx, -w / 2, -h / 2, w, h, w * (round || 0.45));
  ctx.fillStyle = col; ctx.fill();
  ctx.lineWidth = 3.2; ctx.strokeStyle = OUTLINE; ctx.stroke();
  ctx.restore();
}
function eyes(ctx, f, hx, hy, r, a, col, style) {
  const fc = f.facing;
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(a);
  const hurt = f.state === 'hitstun' || f.state === 'dizzy' || f.state === 'grabbed' || (f.flash > 0);
  const ex = r * 0.38 * fc, ey = -r * 0.05;
  const blink = f.blink < 0 && !hurt;
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round';
  for (const k of [0, 1]) {
    const x = ex + (k ? r * 0.42 * fc : -r * 0.02 * fc);
    if (hurt) {
      ctx.lineWidth = r * 0.12;
      ctx.beginPath(); ctx.moveTo(x - r * 0.12, ey - r * 0.14); ctx.lineTo(x + r * 0.1 * (k ? 1 : -1) * fc, ey); ctx.lineTo(x - r * 0.12, ey + r * 0.14); ctx.stroke();
    } else if (blink) {
      ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.moveTo(x - r * 0.1, ey); ctx.lineTo(x + r * 0.1, ey); ctx.stroke();
    } else if (style === 'robot') {
      ctx.fillRect(x - r * 0.1, ey - r * 0.2, r * 0.2, r * 0.36);
    } else if (style === 'slit') {
      ctx.fillRect(x - r * 0.16, ey - r * 0.06, r * 0.3, r * 0.14);
    } else {
      ctx.beginPath(); ctx.ellipse(x, ey, r * 0.1, r * 0.19, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + r * 0.03 * fc, ey - r * 0.08, r * 0.045, 0, TAU); ctx.fill(); ctx.fillStyle = col;
    }
  }
  // 眉（攻撃中はキリッと）
  if (style === 'brow' && !hurt) {
    ctx.lineWidth = r * 0.1;
    const angry = f.state === 'attack';
    ctx.beginPath(); ctx.moveTo(ex - r * 0.16 * fc, ey - r * (angry ? 0.36 : 0.4)); ctx.lineTo(ex + r * 0.1 * fc, ey - r * (angry ? 0.27 : 0.38)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ex + r * 0.3 * fc, ey - r * (angry ? 0.27 : 0.38)); ctx.lineTo(ex + r * 0.56 * fc, ey - r * (angry ? 0.36 : 0.4)); ctx.stroke();
  }
  ctx.restore();
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
  const P = f.pts, pal = fighterPal(f), pr = f.char.prop, s = f.scale, id = f.char.id;
  const lw = pr.limbW * s, back = (c) => shade(c, -0.28);
  // 無敵点滅
  if ((f.invuln > 0 || f.ledgeInv > 0) && f.state !== 'respawn') ctx.globalAlpha = (f.anim >> 2) % 2 ? 0.55 : 0.9;
  if (f.isIntangible() && (f.state === 'roll' || f.state === 'spotdodge' || f.state === 'airdodge' || f.state === 'tech')) ctx.globalAlpha = 0.55;
  // 揺れ（ヒットストップ中）
  let shx = 0;
  if (f.hitlag > 0 && f.shake > 0) shx = ((f.hitlag % 2) ? 1 : -1) * Math.min(6, f.shake * 0.4);
  ctx.save();
  if (shx) ctx.translate(shx, 0);

  // 後ろのリボン
  if (f.ribbons) for (const rb of f.ribbons) if (!rb.stiff) drawRibbon(ctx, f, rb, pal);

  // 後ろの手足
  limb(ctx, P.hip, P.bk, P.bf, lw, back(pal.leg || pal.limb));
  foot(ctx, P.bk, P.bf, pr.footR * s, back(pal.foot), f.facing);
  limb(ctx, P.sh, P.be, P.bh, lw * 0.92, back(pal.limb));
  circ(ctx, P.bh.x, P.bh.y, pr.handR * s, back(pal.hand));

  // 胴体
  const th = Math.hypot(P.neck.x - P.hip.x, P.neck.y - P.hip.y) * 1.12 + 6 * s;
  const tw = pr.bodyW * s;
  CHAR_DRAW[id].body(ctx, f, P, tw, th, pal, s);
  // 頭
  CHAR_DRAW[id].head(ctx, f, P, pr.head * s, pal, s);

  // 前の手足
  limb(ctx, P.hip, P.fk, P.ff, lw, pal.leg || pal.limb);
  foot(ctx, P.fk, P.ff, pr.footR * s, pal.foot, f.facing);
  if (f.char.sword) drawSword(ctx, f, P, pal, s);
  limb(ctx, P.sh, P.fe, P.fh, lw * 0.92, pal.limb);
  CHAR_DRAW[id].hand(ctx, f, P.fh, pr.handR * s, pal, s);
  if (f.ribbons) for (const rb of f.ribbons) if (rb.stiff) drawRibbon(ctx, f, rb, pal);
  if (f.holdRock) {
    const h = P.fh;
    ctx.fillStyle = '#8a6a4a'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(h.x, h.y - 16 * s, 17 * s, 0, TAU); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawSword(ctx, f, P, pal, s) {
  const b = P.wb, t = P.wt;
  const dx = t.x - b.x, dy = t.y - b.y, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const w = 4.5 * s;
  // 刃
  ctx.beginPath();
  ctx.moveTo(b.x + nx * w, b.y + ny * w);
  ctx.lineTo(t.x - dx / L * 10 + nx * w * 0.8, t.y - dy / L * 10 + ny * w * 0.8);
  ctx.lineTo(t.x, t.y);
  ctx.lineTo(t.x - dx / L * 10 - nx * w * 0.8, t.y - dy / L * 10 - ny * w * 0.8);
  ctx.lineTo(b.x - nx * w, b.y - ny * w);
  ctx.closePath();
  ctx.fillStyle = pal.blade || '#e8f0ff'; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = OUTLINE; ctx.stroke();
  ctx.strokeStyle = rgba(pal.acc || '#c28bff', 0.8); ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(b.x + dx * 0.15, b.y + dy * 0.15); ctx.lineTo(b.x + dx * 0.8, b.y + dy * 0.8); ctx.stroke();
  // 鍔
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 7 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(b.x + nx * 9 * s, b.y + ny * 9 * s); ctx.lineTo(b.x - nx * 9 * s, b.y - ny * 9 * s); ctx.stroke();
  ctx.strokeStyle = pal.acc; ctx.lineWidth = 4 * s;
  ctx.beginPath(); ctx.moveTo(b.x + nx * 8 * s, b.y + ny * 8 * s); ctx.lineTo(b.x - nx * 8 * s, b.y - ny * 8 * s); ctx.stroke();
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
function headBase(ctx, P, r, col) { circ(ctx, P.head.x, P.head.y, r, col, 3.2); }
const CHAR_DRAW = {
  blaze: {
    body(ctx, f, P, w, h, pal, s) {
      torso(ctx, f, P, w, h, pal.main);
      // 帯
      ctx.save(); ctx.translate(P.hip.x, P.hip.y); ctx.rotate(P.bodyAng);
      ctx.fillStyle = pal.sub; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5;
      ctx.fillRect(-w / 2, -9 * s, w, 7 * s); ctx.strokeRect(-w / 2, -9 * s, w, 7 * s);
      ctx.restore();
      // 襟
      ctx.save(); ctx.translate(P.neck.x, P.neck.y); ctx.rotate(P.bodyAng);
      ctx.strokeStyle = shade(pal.main, 0.35); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-7 * s * f.facing, 1); ctx.lineTo(2 * s * f.facing, 12 * s); ctx.lineTo(9 * s * f.facing, 2); ctx.stroke();
      ctx.restore();
    },
    head(ctx, f, P, r, pal, s) {
      const a = P.headAng, fc = f.facing;
      // 逆立った髪（後ろ）
      ctx.save(); ctx.translate(P.head.x, P.head.y); ctx.rotate(a);
      ctx.fillStyle = pal.hair; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-r * 0.95 * fc, r * 0.1);
      const spikes = [[-1.35, -0.55], [-0.75, -0.75], [-1.1, -1.15], [-0.35, -1.0], [-0.35, -1.55], [0.2, -1.05], [0.35, -1.5], [0.75, -0.85], [1.05, -0.9]];
      for (const [x, y] of spikes) ctx.lineTo(x * r * fc, y * r);
      ctx.lineTo(r * 0.95 * fc, -r * 0.2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      headBase(ctx, P, r, pal.skin);
      ctx.save(); ctx.translate(P.head.x, P.head.y); ctx.rotate(a);
      // 前髪
      ctx.fillStyle = pal.hair; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-r * 0.9 * fc, -r * 0.3); ctx.quadraticCurveTo(0, -r * 1.25, r * 0.98 * fc, -r * 0.35);
      ctx.lineTo(r * 0.55 * fc, -r * 0.42); ctx.lineTo(r * 0.5 * fc, -r * 0.2); ctx.lineTo(r * 0.15 * fc, -r * 0.5); ctx.lineTo(-r * 0.2 * fc, -r * 0.35);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // 鉢巻
      ctx.fillStyle = pal.acc; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.rect(-r, -r * 0.62, r * 2, r * 0.3); ctx.fill(); ctx.stroke();
      ctx.restore();
      eyes(ctx, f, P.head.x, P.head.y, r, a, pal.eye, 'brow');
    },
    hand(ctx, f, p, r, pal, s) { circ(ctx, p.x, p.y, r, pal.hand); ctx.strokeStyle = shade(pal.hand, -0.3); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.x - r * 0.6, p.y); ctx.lineTo(p.x + r * 0.6, p.y); ctx.stroke(); },
  },
  goldo: {
    body(ctx, f, P, w, h, pal, s) {
      const fc = f.facing;
      ctx.save(); ctx.translate((P.hip.x + P.neck.x) / 2, (P.hip.y + P.neck.y) / 2); ctx.rotate(P.bodyAng);
      const R = [[-0.5, -0.36], [-0.24, -0.56], [0.22, -0.54], [0.54, -0.3], [0.56, 0.18], [0.34, 0.52], [-0.28, 0.54], [-0.56, 0.16]];
      ctx.beginPath();
      for (const [x, y] of R) ctx.lineTo(x * w * fc, y * h);
      ctx.closePath();
      ctx.fillStyle = pal.main; ctx.fill(); ctx.lineWidth = 3.4; ctx.strokeStyle = OUTLINE; ctx.stroke();
      // 陰影
      ctx.fillStyle = shade(pal.main, -0.22);
      ctx.beginPath(); ctx.moveTo(-0.56 * w * fc, 0.16 * h); ctx.lineTo(-0.28 * w * fc, 0.54 * h); ctx.lineTo(0.34 * w * fc, 0.52 * h); ctx.lineTo(0.1 * w * fc, 0.3 * h); ctx.lineTo(-0.3 * w * fc, 0.28 * h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(pal.main, 0.2);
      ctx.beginPath(); ctx.moveTo(0.22 * w * fc, -0.5 * h); ctx.lineTo(0.5 * w * fc, -0.28 * h); ctx.lineTo(0.3 * w * fc, -0.12 * h); ctx.lineTo(0.08 * w * fc, -0.3 * h); ctx.closePath(); ctx.fill();
      // 苔
      ctx.fillStyle = pal.sub; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-0.5 * w * fc, -0.36 * h); ctx.lineTo(-0.24 * w * fc, -0.56 * h); ctx.lineTo(0.22 * w * fc, -0.54 * h);
      ctx.quadraticCurveTo(0.05 * w * fc, -0.3 * h, -0.15 * w * fc, -0.38 * h); ctx.quadraticCurveTo(-0.35 * w * fc, -0.2 * h, -0.5 * w * fc, -0.36 * h); ctx.fill(); ctx.stroke();
      // ひび
      ctx.strokeStyle = shade(pal.main, -0.5); ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(0.3 * w * fc, -0.05 * h); ctx.lineTo(0.12 * w * fc, 0.1 * h); ctx.lineTo(0.24 * w * fc, 0.28 * h); ctx.stroke();
      // 光る紋様
      ctx.strokeStyle = rgba(pal.acc, 0.85); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(-0.05 * w * fc, 0.02 * h, w * 0.12, 0, TAU); ctx.stroke();
      ctx.restore();
    },
    head(ctx, f, P, r, pal, s) {
      ctx.save(); ctx.translate(P.head.x, P.head.y); ctx.rotate(P.headAng);
      roundRect(ctx, -r * 1.05, -r * 0.95, r * 2.1, r * 1.85, r * 0.5);
      ctx.fillStyle = pal.skin; ctx.fill(); ctx.lineWidth = 3.2; ctx.strokeStyle = OUTLINE; ctx.stroke();
      ctx.fillStyle = pal.hair;
      ctx.beginPath(); ctx.ellipse(-r * 0.2 * f.facing, -r * 0.95, r * 0.7, r * 0.28, 0, 0, TAU); ctx.fill(); ctx.stroke();
      // 光る目
      ctx.shadowColor = pal.eye; ctx.shadowBlur = 0;
      ctx.restore();
      eyes(ctx, f, P.head.x, P.head.y + r * 0.05, r * 1.05, P.headAng, pal.eye, 'slit');
    },
    hand(ctx, f, p, r, pal, s) {
      circ(ctx, p.x, p.y, r, pal.hand, 3.2);
      ctx.strokeStyle = shade(pal.hand, -0.4); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x + r * 0.2 * f.facing, p.y - r * 0.6); ctx.lineTo(p.x + r * 0.2 * f.facing, p.y + r * 0.6); ctx.stroke();
    },
  },
  myu: {
    body(ctx, f, P, w, h, pal, s) {
      torso(ctx, f, P, w, h, pal.main);
      ctx.save(); ctx.translate(P.hip.x, P.hip.y); ctx.rotate(P.bodyAng);
      ctx.fillStyle = pal.sub; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5;
      ctx.fillRect(-w / 2, -10 * s, w, 6 * s); ctx.strokeRect(-w / 2, -10 * s, w, 6 * s);
      ctx.restore();
    },
    head(ctx, f, P, r, pal, s) {
      // フード
      headBase(ctx, P, r * 1.04, pal.main);
      ctx.save(); ctx.translate(P.head.x, P.head.y); ctx.rotate(P.headAng);
      const fc = f.facing;
      ctx.beginPath(); ctx.ellipse(r * 0.42 * fc, r * 0.02, r * 0.62, r * 0.34, 0, 0, TAU);
      ctx.fillStyle = pal.skin; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUTLINE; ctx.stroke();
      // 結び目
      ctx.fillStyle = pal.sub; ctx.beginPath(); ctx.arc(-r * 0.95 * fc, -r * 0.2, r * 0.25, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.restore();
      eyes(ctx, f, P.head.x, P.head.y, r, P.headAng, pal.eye, 'brow');
    },
    hand(ctx, f, p, r, pal, s) { circ(ctx, p.x, p.y, r, pal.hand); },
  },
  volty: {
    body(ctx, f, P, w, h, pal, s) {
      torso(ctx, f, P, w, h * 0.95, pal.main, 0.3);
      ctx.save(); ctx.translate((P.hip.x + P.neck.x) / 2, (P.hip.y + P.neck.y) / 2); ctx.rotate(P.bodyAng);
      // 胸のコア
      const glowA = 0.6 + Math.sin(f.anim * 0.15) * 0.3;
      ctx.fillStyle = rgba(pal.acc, glowA);
      ctx.beginPath(); ctx.arc(w * 0.08 * f.facing, -h * 0.08, w * 0.2, 0, TAU); ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = OUTLINE; ctx.stroke();
      ctx.fillStyle = pal.sub; ctx.fillRect(-w / 2, h * 0.28, w, h * 0.12);
      ctx.restore();
    },
    head(ctx, f, P, r, pal, s) {
      ctx.save(); ctx.translate(P.head.x, P.head.y); ctx.rotate(P.headAng);
      const fc = f.facing;
      // アンテナ
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -r * 0.9); ctx.lineTo(0, -r * 1.35); ctx.stroke();
      circ(ctx, 0, -r * 1.45, r * 0.22, pal.acc, 2.5);
      roundRect(ctx, -r * 1.1, -r * 0.92, r * 2.2, r * 1.8, r * 0.45);
      ctx.fillStyle = pal.skin; ctx.fill(); ctx.lineWidth = 3.2; ctx.strokeStyle = OUTLINE; ctx.stroke();
      // バイザー
      roundRect(ctx, -r * 0.55 + r * 0.25 * fc, -r * 0.5, r * 1.3, r * 0.9, r * 0.3);
      ctx.fillStyle = '#1a1a2a'; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
      // 耳
      ctx.fillStyle = pal.sub; ctx.beginPath(); ctx.arc(-r * 1.05 * fc, 0, r * 0.25, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.restore();
      eyes(ctx, f, P.head.x + r * 0.05 * f.facing, P.head.y, r, P.headAng, pal.eye, 'robot');
    },
    hand(ctx, f, p, r, pal, s) { circ(ctx, p.x, p.y, r, pal.hand); },
  },
  luna: {
    body(ctx, f, P, w, h, pal, s) {
      // スカート
      ctx.save(); ctx.translate(P.hip.x, P.hip.y); ctx.rotate(P.bodyAng);
      ctx.beginPath(); ctx.moveTo(-w * 0.5, -6 * s); ctx.lineTo(w * 0.5, -6 * s); ctx.lineTo(w * 0.85, 13 * s); ctx.lineTo(-w * 0.85, 13 * s); ctx.closePath();
      ctx.fillStyle = shade(pal.main, -0.15); ctx.fill(); ctx.lineWidth = 2.8; ctx.strokeStyle = OUTLINE; ctx.stroke();
      ctx.restore();
      torso(ctx, f, P, w, h, pal.main);
      ctx.save(); ctx.translate(P.neck.x, P.neck.y); ctx.rotate(P.bodyAng);
      ctx.fillStyle = pal.sub; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(-w * 0.5, 4 * s); ctx.lineTo(w * 0.5, 4 * s); ctx.lineTo(0, 14 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    },
    head(ctx, f, P, r, pal, s) {
      headBase(ctx, P, r, pal.skin);
      ctx.save(); ctx.translate(P.head.x, P.head.y); ctx.rotate(P.headAng);
      const fc = f.facing;
      ctx.fillStyle = pal.hair; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-r * 1.05 * fc, r * 0.5);
      ctx.quadraticCurveTo(-r * 1.25 * fc, -r * 1.2, r * 0.3 * fc, -r * 1.08);
      ctx.quadraticCurveTo(r * 1.15 * fc, -r * 0.9, r * 1.02 * fc, -r * 0.15);
      ctx.lineTo(r * 0.6 * fc, -r * 0.5); ctx.lineTo(r * 0.35 * fc, -r * 0.2); ctx.lineTo(r * 0.1 * fc, -r * 0.55); ctx.lineTo(-r * 0.4 * fc, -r * 0.3);
      ctx.quadraticCurveTo(-r * 0.6 * fc, r * 0.1, -r * 1.05 * fc, r * 0.5);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // 月の髪飾り
      ctx.fillStyle = pal.acc;
      ctx.beginPath(); ctx.arc(-r * 0.55 * fc, -r * 0.8, r * 0.26, 0, TAU); ctx.fill();
      ctx.fillStyle = pal.hair; ctx.beginPath(); ctx.arc(-r * 0.45 * fc, -r * 0.86, r * 0.2, 0, TAU); ctx.fill();
      ctx.restore();
      eyes(ctx, f, P.head.x, P.head.y, r, P.headAng, pal.eye, 'normal');
    },
    hand(ctx, f, p, r, pal, s) { circ(ctx, p.x, p.y, r, pal.hand); },
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
