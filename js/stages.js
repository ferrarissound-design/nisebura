'use strict';
// ===== ステージ =====
class Stage {
  constructor(def, quality) {
    this.def = def; this.id = def.id; this.t = 0;
    const m = def.main;
    this.main = { x1: m.x1, x2: m.x2, y: 0, y2: m.y2, soft: false, dx: 0, dy: 0, main: true };
    this.plats = (def.plats || []).map((p) => ({ x1: p.x1, x2: p.x2, y: p.y, soft: true, dx: 0, dy: 0, mv: p.mv || null, w: p.x2 - p.x1, cx: (p.x1 + p.x2) / 2, by: p.y }));
    this.all = [this.main, ...this.plats];
    this.ledges = def.noLedge ? [] : [{ x: m.x1, y: 0, dir: 1, owner: null }, { x: m.x2, y: 0, dir: -1, owner: null }];
    const bx = def.blastX || 650;
    this.blast = { l: m.x1 - bx, r: m.x2 + bx, t: def.blastT || -820, b: def.blastB || 600 };
    this.respawn = { x: 0, y: def.respawnY || -300 };
    this.spawns = def.spawns;
    this.camBounds = { l: this.blast.l + 120, r: this.blast.r - 120, t: this.blast.t + 140, b: this.blast.b - 160 };
    this.layers = [];
    this.quality = quality;
    this.build();
  }
  build() {
    const res = this.quality === 'low' ? 0.42 : 0.62;
    for (const L of this.def.layers) {
      const W = L.w || 2600, H = L.h || 1400;
      const c = document.createElement('canvas');
      c.width = Math.ceil(W * res); c.height = Math.ceil(H * res);
      const ctx = c.getContext('2d');
      ctx.scale(res, res); ctx.translate(W / 2, H / 2);
      L.draw(ctx, W, H, seededRng(L.seed || 1));
      this.layers.push({ c, W, H, p: L.p, y: L.y || 0, scroll: L.scroll || 0, fx: L.fx || null });
    }
    this.sky = null;
  }
  update() {
    this.t++;
    for (const p of this.plats) {
      if (!p.mv) continue;
      const k = Math.sin((this.t / p.mv.period) * TAU + (p.mv.ph || 0));
      const nx = p.cx + (p.mv.ax || 0) * k, ny = p.by + (p.mv.ay || 0) * k;
      const ox = (p.x1 + p.x2) / 2, oy = p.y;
      p.dx = nx - ox; p.dy = ny - oy;
      p.x1 = nx - p.w / 2; p.x2 = nx + p.w / 2; p.y = ny;
    }
  }
  platformAt(x, y, tol) {
    for (const p of this.all) if (x >= p.x1 - 1 && x <= p.x2 + 1 && Math.abs(y - p.y) <= tol) return p;
    return null;
  }
  landingPlat(x, prevY, newY, skipSoft) {
    let best = null;
    for (const p of this.all) {
      if (p.soft && skipSoft) continue;
      if (x < p.x1 || x > p.x2) continue;
      const py = p.y, pprev = p.y - p.dy;
      if (prevY <= pprev + 1.5 && newY >= py - 0.01) { if (!best || py < best.y) best = p; }
    }
    return best;
  }
  solidAt(x, y) {
    const m = this.main;
    return x > m.x1 && x < m.x2 && y > m.y + 2 && y < m.y2;
  }
  // 背景（スクリーン座標）
  drawBg(ctx, cam, W, H, base) {
    const d = this.def;
    if (!this.sky || this.sky.h !== H) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      d.sky.forEach(([o, c]) => g.addColorStop(o, c));
      this.sky = { g, h: H };
    }
    ctx.fillStyle = this.sky.g; ctx.fillRect(0, 0, W, H);
    for (const L of this.layers) {
      const z = base * (1 + (cam.zoom - 1) * L.p);
      let ox = -cam.x * L.p, oy = -cam.y * L.p;
      const dw = L.W * z, dh = L.H * z;
      let sx = W / 2 + (ox - L.W / 2) * z, sy = H / 2 + (oy + L.y - L.H / 2) * z;
      if (L.scroll) {
        const off = ((this.t * L.scroll * z) % dw + dw) % dw;
        sx = W / 2 + (ox - L.W / 2) * z - off;
        ctx.drawImage(L.c, sx, sy, dw, dh);
        ctx.drawImage(L.c, sx + dw, sy, dw, dh);
        if (sx + dw * 2 < W) ctx.drawImage(L.c, sx + dw * 2, sy, dw, dh);
      } else ctx.drawImage(L.c, sx, sy, dw, dh);
      if (L.fx) L.fx(ctx, this.t, W / 2 + ox * z, H / 2 + (oy + L.y) * z, z);
    }
    if (d.bgFx) d.bgFx(ctx, this.t, W, H, cam, base);
  }
  // 足場（ワールド座標）
  drawStage(ctx) {
    this.def.drawMain(ctx, this.main, this.t, this);
    for (const p of this.plats) this.def.drawPlat(ctx, p, this.t, this);
  }
}

// ---------- 描画ヘルパー ----------
function drawClouds(ctx, rng, n, x0, x1, y0, y1, col, rmin, rmax) {
  ctx.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const x = lerp(x0, x1, rng()), y = lerp(y0, y1, rng()), r = lerp(rmin, rmax, rng());
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.ellipse(x + (k - 2) * r * 0.7, y + Math.abs(k - 2) * r * 0.12, r * (1 - Math.abs(k - 2) * 0.18), r * 0.55 * (1 - Math.abs(k - 2) * 0.15), 0, 0, TAU);
      ctx.fill();
    }
  }
}
function mountains(ctx, W, y, amp, col, rng, step, peakiness) {
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(-W / 2, 2000);
  let h = 0;
  for (let x = -W / 2; x <= W / 2 + step; x += step) {
    h += (rng() - 0.5) * amp * peakiness; h = clamp(h, -amp, amp * 0.3);
    ctx.lineTo(x, y + h);
  }
  ctx.lineTo(W / 2 + step, 2000); ctx.closePath(); ctx.fill();
}
function glow(ctx, x, y, r, col, a = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
function slabPath(ctx, m, depth, inset) {
  ctx.beginPath();
  ctx.moveTo(m.x1, 0); ctx.lineTo(m.x2, 0);
  ctx.lineTo(m.x2 - inset * 0.3, m.y2 * 0.6);
  ctx.quadraticCurveTo(m.x2 - inset, depth * 0.85, (m.x1 + m.x2) / 2, depth);
  ctx.quadraticCurveTo(m.x1 + inset, depth * 0.85, m.x1 + inset * 0.3, m.y2 * 0.6);
  ctx.closePath();
}
function cachedGrad(st, key, mk) {
  st._g = st._g || {};
  return st._g[key] || (st._g[key] = mk());
}

// ---------- ステージ定義 ----------
const STAGES = [
  {
    id: 'sky', name: '天空の闘技場', desc: '足場のないシンプルな決戦の地', bgm: 'sky',
    main: { x1: -440, x2: 440, y2: 70 }, blastX: 660, blastT: -820, blastB: 600, respawnY: -330,
    spawns: [[-260, 0], [260, 0], [-90, 0], [90, 0]],
    sky: [[0, '#0b1240'], [0.45, '#3a2a7a'], [0.75, '#c8608a'], [1, '#ffb070']],
    layers: [
      {
        p: 0.04, y: -40, seed: 3, draw(ctx, W, H, rng) {
          ctx.fillStyle = '#fff';
          for (let i = 0; i < 160; i++) { ctx.globalAlpha = rng() * 0.8; ctx.fillRect((rng() - 0.5) * W, (rng() - 0.8) * H * 0.6, 2, 2); }
          ctx.globalAlpha = 1;
          glow(ctx, 260, 160, 420, '#ffd0a0', 0.55);
          glow(ctx, 260, 160, 120, '#fff4d8', 0.95);
          ctx.fillStyle = '#fff8e8'; ctx.beginPath(); ctx.arc(260, 160, 70, 0, TAU); ctx.fill();
        },
      },
      {
        p: 0.12, y: 120, seed: 9, scroll: 0.06, draw(ctx, W, H, rng) {
          drawClouds(ctx, rng, 18, -W / 2, W / 2, 120, 260, 'rgba(255,190,200,0.35)', 50, 110);
          drawClouds(ctx, rng, 14, -W / 2, W / 2, 260, 420, 'rgba(255,220,220,0.5)', 70, 140);
        },
      },
      {
        p: 0.25, y: 120, seed: 21, draw(ctx, W, H, rng) {
          // 浮島
          for (let i = 0; i < 6; i++) {
            const x = (rng() - 0.5) * W * 0.9, y = (rng() - 0.6) * 400, r = 40 + rng() * 80;
            ctx.fillStyle = 'rgba(70,40,110,0.85)';
            ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.3, y + r * 1.3); ctx.lineTo(x - r * 0.2, y + r * 0.9); ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(140,90,170,0.9)'; ctx.fillRect(x - r, y - 8, r * 2, 10);
          }
          drawClouds(ctx, rng, 20, -W / 2, W / 2, 420, 600, 'rgba(255,200,190,0.75)', 80, 160);
        },
      },
    ],
    drawMain(ctx, m, t, st) {
      const body = cachedGrad(st, 'body', () => { const g = ctx.createLinearGradient(0, 0, 0, 240); g.addColorStop(0, '#5a5f9a'); g.addColorStop(1, '#1a1a40'); return g; });
      // 下のクリスタル
      ctx.fillStyle = 'rgba(120,220,255,0.25)';
      ctx.beginPath(); ctx.moveTo(-60, 150); ctx.lineTo(0, 330 + Math.sin(t * 0.03) * 8); ctx.lineTo(60, 150); ctx.closePath(); ctx.fill();
      slabPath(ctx, m, 250, 140); ctx.fillStyle = body; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#11122a'; ctx.stroke();
      // ルーンの光
      const a = 0.55 + Math.sin(t * 0.05) * 0.25;
      ctx.strokeStyle = `rgba(110,230,255,${a})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(m.x1 + 40, 34); ctx.lineTo(m.x2 - 40, 34); ctx.stroke();
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.arc(i * 110, 70 + Math.abs(i) * -4, 9, 0, TAU); ctx.stroke(); }
      // 表面
      ctx.fillStyle = '#d8dcff'; ctx.fillRect(m.x1, -2, m.x2 - m.x1, 12);
      ctx.fillStyle = '#9aa0e0'; ctx.fillRect(m.x1, 10, m.x2 - m.x1, 6);
      ctx.strokeStyle = '#11122a'; ctx.lineWidth = 3; ctx.strokeRect(m.x1, -2, m.x2 - m.x1, 18);
    },
    drawPlat() {},
  },
  {
    id: 'garden', name: '夕焼けガーデン', desc: '3つの足場がある標準ステージ', bgm: 'garden',
    main: { x1: -380, x2: 380, y2: 60 }, blastX: 640, blastT: -840, blastB: 600, respawnY: -360,
    plats: [{ x1: -250, x2: -90, y: -128 }, { x1: 90, x2: 250, y: -128 }, { x1: -80, x2: 80, y: -238 }],
    spawns: [[-210, 0], [210, 0], [-170, -128], [170, -128]],
    sky: [[0, '#3a3a8a'], [0.4, '#c05a8a'], [0.7, '#ff9a5a'], [1, '#ffd890']],
    layers: [
      {
        p: 0.05, y: 0, seed: 4, draw(ctx, W, H, rng) {
          glow(ctx, -180, 140, 480, '#ffe0a0', 0.6);
          ctx.fillStyle = '#fff2c8'; ctx.beginPath(); ctx.arc(-180, 150, 95, 0, TAU); ctx.fill();
          drawClouds(ctx, rng, 10, -W / 2, W / 2, -300, -40, 'rgba(255,170,170,0.45)', 40, 90);
        },
      },
      { p: 0.12, y: 250, seed: 7, draw(ctx, W, H, rng) { mountains(ctx, W, 0, 160, '#a0508a', rng, 60, 0.9); } },
      { p: 0.22, y: 300, seed: 13, draw(ctx, W, H, rng) { mountains(ctx, W, 0, 110, '#7a3a7a', rng, 40, 0.8); } },
      {
        p: 0.38, y: 330, seed: 17, draw(ctx, W, H, rng) {
          mountains(ctx, W, 0, 60, '#4a2a5a', rng, 30, 0.6);
          ctx.fillStyle = '#2a1a3a';
          for (let i = 0; i < 26; i++) {
            const x = (rng() - 0.5) * W, h = 60 + rng() * 90;
            ctx.beginPath(); ctx.arc(x, -h, 26 + rng() * 22, 0, TAU); ctx.fill();
            ctx.fillRect(x - 5, -h, 10, h + 40);
          }
          // 風車の塔
          ctx.fillStyle = '#2a1a3a';
          ctx.beginPath(); ctx.moveTo(380, -220); ctx.lineTo(410, 40); ctx.lineTo(350, 40); ctx.closePath(); ctx.fill();
        },
        fx(ctx, t, cx, cy, z) {
          ctx.save(); ctx.translate(cx + 380 * z, cy - 220 * z); ctx.rotate(t * 0.01);
          ctx.fillStyle = '#2a1a3a';
          for (let i = 0; i < 4; i++) { ctx.rotate(TAU / 4); ctx.fillRect(-6 * z, 0, 12 * z, 120 * z); }
          ctx.restore();
        },
      },
    ],
    drawMain(ctx, m, t, st) {
      const body = cachedGrad(st, 'body', () => { const g = ctx.createLinearGradient(0, 0, 0, 220); g.addColorStop(0, '#8a5a3a'); g.addColorStop(1, '#3a2018'); return g; });
      slabPath(ctx, m, 210, 120); ctx.fillStyle = body; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#1e1010'; ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.ellipse(-300 + i * 75, 50 + (i % 3) * 22, 18, 10, 0, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#5cc04a'; ctx.fillRect(m.x1 - 6, -4, m.x2 - m.x1 + 12, 16);
      ctx.fillStyle = '#8ae06a'; ctx.fillRect(m.x1 - 6, -4, m.x2 - m.x1 + 12, 5);
      ctx.fillStyle = '#5cc04a';
      for (let x = m.x1; x < m.x2; x += 26) { ctx.beginPath(); ctx.arc(x + 10, 12, 9, 0, Math.PI); ctx.fill(); }
      ctx.strokeStyle = '#1e1010'; ctx.lineWidth = 3; ctx.strokeRect(m.x1 - 6, -4, m.x2 - m.x1 + 12, 16);
    },
    drawPlat(ctx, p) {
      ctx.fillStyle = '#c08a5a'; ctx.fillRect(p.x1, p.y, p.x2 - p.x1, 12);
      ctx.fillStyle = '#e8b47a'; ctx.fillRect(p.x1, p.y, p.x2 - p.x1, 4);
      ctx.strokeStyle = '#2a1810'; ctx.lineWidth = 3; ctx.strokeRect(p.x1, p.y, p.x2 - p.x1, 12);
      ctx.fillStyle = '#5cc04a';
      ctx.beginPath(); ctx.arc(p.x1 + 12, p.y + 2, 10, 0, TAU); ctx.arc(p.x2 - 14, p.y + 2, 8, 0, TAU); ctx.fill();
    },
  },
  {
    id: 'neon', name: 'ネオンシティ', desc: '動く足場が行き交う摩天楼の屋上', bgm: 'neon',
    main: { x1: -420, x2: 420, y2: 2000 }, noLedge: false, blastX: 640, blastT: -840, blastB: 560, respawnY: -360,
    plats: [{ x1: -90, x2: 90, y: -150, mv: { ax: 210, period: 520 } }, { x1: -70, x2: 70, y: -280, mv: { ax: -180, period: 640, ph: 1.2 } }],
    spawns: [[-250, 0], [250, 0], [-90, 0], [90, 0]],
    sky: [[0, '#05051a'], [0.5, '#1a0f3a'], [1, '#4a1a5a']],
    layers: [
      {
        p: 0.04, y: -100, seed: 2, draw(ctx, W, H, rng) {
          ctx.fillStyle = '#fff';
          for (let i = 0; i < 120; i++) { ctx.globalAlpha = rng() * 0.6; ctx.fillRect((rng() - 0.5) * W, (rng() - 0.7) * H * 0.6, 2, 2); }
          ctx.globalAlpha = 1;
          glow(ctx, -420, -220, 220, '#c8d8ff', 0.4);
          ctx.fillStyle = '#e8eeff'; ctx.beginPath(); ctx.arc(-420, -220, 64, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(160,170,210,0.5)'; ctx.beginPath(); ctx.arc(-400, -230, 14, 0, TAU); ctx.arc(-440, -200, 9, 0, TAU); ctx.fill();
        },
      },
      {
        p: 0.14, y: 280, seed: 5, draw(ctx, W, H, rng) {
          for (let x = -W / 2; x < W / 2;) {
            const w = 50 + rng() * 90, h = 150 + rng() * 380;
            ctx.fillStyle = '#16123a'; ctx.fillRect(x, -h, w, h + 600);
            ctx.fillStyle = 'rgba(140,160,255,0.35)';
            for (let yy = -h + 14; yy < 300; yy += 18) for (let xx = x + 8; xx < x + w - 8; xx += 14) if (rng() < 0.3) ctx.fillRect(xx, yy, 6, 8);
            x += w + 6;
          }
        },
      },
      {
        p: 0.3, y: 330, seed: 8, draw(ctx, W, H, rng) {
          const neon = ['#ff3aa8', '#3af0ff', '#ffe03a', '#a05aff'];
          for (let x = -W / 2; x < W / 2;) {
            const w = 80 + rng() * 120, h = 120 + rng() * 300;
            ctx.fillStyle = '#0c0a22'; ctx.fillRect(x, -h, w, h + 600);
            ctx.fillStyle = 'rgba(255,220,150,0.5)';
            for (let yy = -h + 16; yy < 300; yy += 22) for (let xx = x + 10; xx < x + w - 10; xx += 18) if (rng() < 0.25) ctx.fillRect(xx, yy, 8, 10);
            if (rng() < 0.5) {
              const c = choice(neon), sw = w * 0.7, sy = -h + 30;
              ctx.shadowColor = c; ctx.shadowBlur = 18;
              ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.strokeRect(x + w * 0.15, sy, sw, 34);
              ctx.fillStyle = c; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
              ctx.fillText(choice(['NISE', 'BURA', 'ニセ', '★24H', 'RAMEN', 'GAME']), x + w / 2, sy + 25);
              ctx.shadowBlur = 0;
            }
            x += w + 14;
          }
        },
      },
    ],
    bgFx(ctx, t, W, H) {
      // サーチライト
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 2; i++) {
        const a = Math.sin(t * 0.008 + i * 2) * 0.5 - Math.PI / 2;
        const x = W * (0.25 + i * 0.5), y = H;
        ctx.fillStyle = 'rgba(120,140,255,0.06)';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a - 0.08) * H * 1.5, y + Math.sin(a - 0.08) * H * 1.5); ctx.lineTo(x + Math.cos(a + 0.08) * H * 1.5, y + Math.sin(a + 0.08) * H * 1.5); ctx.fill();
      }
      ctx.restore();
    },
    drawMain(ctx, m, t, st) {
      const body = cachedGrad(st, 'body', () => { const g = ctx.createLinearGradient(0, 0, 0, 600); g.addColorStop(0, '#2a2640'); g.addColorStop(1, '#0a0818'); return g; });
      ctx.fillStyle = body; ctx.fillRect(m.x1, 0, m.x2 - m.x1, 900);
      ctx.fillStyle = 'rgba(255,220,140,0.55)';
      for (let y = 60; y < 900; y += 46) for (let x = m.x1 + 24; x < m.x2 - 30; x += 52) if (((x * 7 + y * 3) % 5) < 2) ctx.fillRect(x, y, 22, 26);
      ctx.strokeStyle = '#06040e'; ctx.lineWidth = 4; ctx.strokeRect(m.x1, 0, m.x2 - m.x1, 900);
      ctx.fillStyle = '#4a4660'; ctx.fillRect(m.x1 - 8, -6, m.x2 - m.x1 + 16, 18);
      // 警告ストライプ
      ctx.save(); ctx.beginPath(); ctx.rect(m.x1 - 8, 6, m.x2 - m.x1 + 16, 8); ctx.clip();
      ctx.fillStyle = '#ffd23a'; ctx.fillRect(m.x1 - 8, 6, m.x2 - m.x1 + 16, 8);
      ctx.fillStyle = '#1a1a1a'; for (let x = m.x1 - 8; x < m.x2 + 8; x += 24) { ctx.beginPath(); ctx.moveTo(x, 14); ctx.lineTo(x + 10, 6); ctx.lineTo(x + 20, 6); ctx.lineTo(x + 10, 14); ctx.fill(); }
      ctx.restore();
      ctx.strokeStyle = '#06040e'; ctx.lineWidth = 3; ctx.strokeRect(m.x1 - 8, -6, m.x2 - m.x1 + 16, 20);
      // 室外機
      ctx.fillStyle = '#3a3650'; ctx.fillRect(-330, -1, 0, 0);
      const a = 0.6 + Math.sin(t * 0.1) * 0.4;
      ctx.fillStyle = `rgba(255,60,170,${a})`; ctx.fillRect(m.x1 - 8, 14, m.x2 - m.x1 + 16, 3);
    },
    drawPlat(ctx, p, t) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(60,240,255,0.25)';
      ctx.beginPath(); ctx.ellipse((p.x1 + p.x2) / 2, p.y + 20, (p.x2 - p.x1) * 0.5, 14, 0, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#3a3a52'; ctx.fillRect(p.x1, p.y, p.x2 - p.x1, 12);
      ctx.fillStyle = '#3af0ff'; ctx.fillRect(p.x1, p.y + 10, p.x2 - p.x1, 3);
      ctx.strokeStyle = '#06040e'; ctx.lineWidth = 3; ctx.strokeRect(p.x1, p.y, p.x2 - p.x1, 13);
      ctx.fillStyle = '#ff3aa8';
      ctx.beginPath(); ctx.arc(p.x1 + 8, p.y + 6, 3, 0, TAU); ctx.arc(p.x2 - 8, p.y + 6, 3, 0, TAU); ctx.fill();
    },
  },
  {
    id: 'volcano', name: '灼熱の火山', desc: '上下する岩場が熱い戦いを演出する', bgm: 'volcano',
    main: { x1: -400, x2: 400, y2: 80 }, blastX: 640, blastT: -840, blastB: 580, respawnY: -360,
    plats: [{ x1: -280, x2: -120, y: -140 }, { x1: 80, x2: 250, y: -190, mv: { ay: 70, period: 420 } }],
    spawns: [[-240, 0], [240, 0], [-200, -140], [80, 0]],
    sky: [[0, '#1a0608'], [0.5, '#5a1410'], [1, '#e0501a']],
    layers: [
      {
        p: 0.06, y: 60, seed: 6, draw(ctx, W, H, rng) {
          // 火山
          ctx.fillStyle = '#2a0c0c';
          ctx.beginPath(); ctx.moveTo(-700, 500); ctx.lineTo(-120, -160); ctx.lineTo(60, -160); ctx.lineTo(700, 500); ctx.closePath(); ctx.fill();
          glow(ctx, -30, -170, 220, '#ff6a1a', 0.8);
          ctx.fillStyle = '#ff8a2a';
          ctx.beginPath(); ctx.moveTo(-110, -158); ctx.lineTo(50, -158); ctx.lineTo(10, -120); ctx.lineTo(-40, -110); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#ff5a1a'; ctx.lineWidth = 6;
          for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-40 + i * 20, -140); ctx.quadraticCurveTo(-60 + i * 50, 100, -120 + i * 80, 500); ctx.stroke(); }
        },
        fx(ctx, t, cx, cy, z) {
          // 噴煙
          ctx.fillStyle = 'rgba(40,20,20,0.5)';
          for (let i = 0; i < 5; i++) {
            const k = ((t * 0.4 + i * 60) % 300) / 300;
            ctx.beginPath(); ctx.arc(cx + (-30 + Math.sin(i * 3 + t * 0.01) * 40 * k) * z, cy + (-180 - k * 300) * z, (30 + k * 80) * z, 0, TAU); ctx.fill();
          }
        },
      },
      { p: 0.2, y: 300, seed: 11, draw(ctx, W, H, rng) { mountains(ctx, W, 0, 140, '#3a0e0c', rng, 50, 1.0); } },
      {
        p: 0.36, y: 420, seed: 19, draw(ctx, W, H, rng) {
          mountains(ctx, W, 0, 80, '#1e0606', rng, 34, 0.9);
          for (let i = 0; i < 9; i++) {
            const x = (rng() - 0.5) * W, h = 120 + rng() * 200;
            ctx.fillStyle = '#160404'; ctx.fillRect(x - 20, -h, 40, h + 100);
            ctx.fillStyle = 'rgba(255,90,20,0.4)'; ctx.fillRect(x - 3, -h + 20, 4, h);
          }
        },
      },
    ],
    bgFx(ctx, t, W, H) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 24; i++) {
        const k = ((t * (0.6 + (i % 5) * 0.15) + i * 97) % H) / H;
        const x = ((i * 137.5) % W) + Math.sin(t * 0.02 + i) * 20, y = H * (1 - k);
        ctx.fillStyle = `rgba(255,${120 + (i % 3) * 40},40,${0.7 * (1 - k)})`;
        ctx.fillRect(x, y, 3, 3);
      }
      // 溶岩の光
      const g = ctx.createLinearGradient(0, H * 0.75, 0, H);
      g.addColorStop(0, 'rgba(255,80,20,0)'); g.addColorStop(1, `rgba(255,90,20,${0.35 + Math.sin(t * 0.03) * 0.1})`);
      ctx.fillStyle = g; ctx.fillRect(0, H * 0.75, W, H * 0.25);
      ctx.restore();
    },
    drawMain(ctx, m, t, st) {
      const body = cachedGrad(st, 'body', () => { const g = ctx.createLinearGradient(0, 0, 0, 240); g.addColorStop(0, '#3a2a2a'); g.addColorStop(1, '#120808'); return g; });
      slabPath(ctx, m, 240, 150); ctx.fillStyle = body; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#0a0404'; ctx.stroke();
      const a = 0.6 + Math.sin(t * 0.06) * 0.3;
      ctx.strokeStyle = `rgba(255,110,30,${a})`; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-300, 20); ctx.lineTo(-240, 60); ctx.lineTo(-180, 50); ctx.lineTo(-120, 110);
      ctx.moveTo(60, 15); ctx.lineTo(100, 70); ctx.lineTo(170, 80); ctx.lineTo(200, 140);
      ctx.moveTo(-40, 30); ctx.lineTo(0, 90); ctx.lineTo(-20, 160);
      ctx.stroke();
      ctx.fillStyle = '#5a4a46'; ctx.fillRect(m.x1, -3, m.x2 - m.x1, 13);
      ctx.fillStyle = '#7a6660'; ctx.fillRect(m.x1, -3, m.x2 - m.x1, 4);
      ctx.strokeStyle = '#0a0404'; ctx.lineWidth = 3; ctx.strokeRect(m.x1, -3, m.x2 - m.x1, 13);
    },
    drawPlat(ctx, p, t) {
      const cx = (p.x1 + p.x2) / 2, w = p.x2 - p.x1;
      ctx.fillStyle = '#3a2a28';
      ctx.beginPath(); ctx.moveTo(p.x1, p.y); ctx.lineTo(p.x2, p.y); ctx.lineTo(p.x2 - w * 0.2, p.y + 30); ctx.lineTo(cx, p.y + 46); ctx.lineTo(p.x1 + w * 0.2, p.y + 30); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#0a0404'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = 'rgba(255,110,30,0.7)'; ctx.beginPath(); ctx.arc(cx, p.y + 30, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6a5650'; ctx.fillRect(p.x1, p.y - 2, w, 6);
    },
  },
];
