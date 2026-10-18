'use strict';
// ===== エフェクト =====
class FX {
  constructor(battle) { this.battle = battle; this.list = []; this.max = 420; this.texts = []; }
  get low() { return this.battle.quality === 'low'; }
  add(p) {
    if (this.list.length >= (this.low ? this.max * 0.5 : this.max)) return;
    p.t = 0; this.list.push(p);
  }
  update() {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.t++;
      if (p.vx !== undefined) { p.x += p.vx; p.y += p.vy; if (p.g) p.vy += p.g; if (p.drag) { p.vx *= p.drag; p.vy *= p.drag; } }
      if (p.t >= p.life) { L[i] = L[L.length - 1]; L.pop(); }
    }
    for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.t++; t.y -= 0.6; if (t.t > t.life) this.texts.splice(i, 1); }
  }
  // ---------- 生成 ----------
  emit(type, x, y, o = {}) {
    const s = o.s || 1;
    switch (type) {
      case 'flame':
        for (let i = 0; i < (this.low ? 1 : 2); i++) this.add({ k: 'flame', x: x + rand(-6, 6) * s, y: y + rand(-6, 6) * s, vx: rand(-0.8, 0.8), vy: rand(-2.2, -0.6), r: rand(7, 13) * s, life: randi(12, 20), L: 1 });
        break;
      case 'charge':
        for (let i = 0; i < 2; i++) {
          const a = rand(0, TAU), d = rand(40, 60) * s;
          this.add({ k: 'chargep', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, tx: x, ty: y, life: 12, col: o.col || '#ffe65a', L: 1 });
        }
        break;
      case 'spark': {
        const sp = o.spread || 14;
        this.add({ k: 'bolt', x: x + rand(-sp, sp), y: y + rand(-sp, sp), a: rand(0, TAU), len: rand(10, 22), life: 6, col: o.col || '#4ad8ff', L: 1 });
        break;
      }
      case 'bolt':
        for (let i = 0; i < 4; i++) this.add({ k: 'bolt', x, y, a: (o.dir > 0 ? 0 : Math.PI) + rand(-0.6, 0.6), len: rand(30, 60), life: 8, col: '#7ff0ff', L: 1 });
        this.add({ k: 'flash', x, y, r: 40, life: 8, col: '#bff6ff', L: 1 });
        break;
      case 'explosion': {
        const r = o.r || 60;
        this.add({ k: 'flash', x, y, r: r * 1.3, life: 14, col: '#fff2b0', L: 1 });
        this.add({ k: 'ring', x, y, r: r * 0.4, r2: r * 1.6, life: 18, col: o.col || '#ff8a2a', w: 10, L: 1 });
        for (let i = 0; i < (this.low ? 8 : 18); i++) {
          const a = rand(0, TAU), v = rand(3, 9);
          this.add({ k: 'flame', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.9, r: rand(12, 22), life: randi(18, 30), L: 1 });
        }
        break;
      }
      case 'quake':
        this.add({ k: 'ring', x, y, r: 10, r2: 140, life: 16, col: '#e0b080', w: 8, flat: true, L: 0 });
        this.debris(x, y, '#8a6a4a', 10);
        this.dust(x, y, 8);
        break;
      case 'ring':
        this.add({ k: 'ring', x, y, r: 6 * s, r2: 46 * s, life: 14, col: o.col || '#fff', w: 4, flat: true, L: 0 });
        break;
      case 'flash':
        this.add({ k: 'flash', x, y, r: o.r || 30, life: o.life || 8, col: o.col || '#fff', L: 1 });
        break;
      case 'smoke':
        this.add({ k: 'smoke', x: x + rand(-5, 5), y: y + rand(-5, 5), vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), r: rand(10, 16) * s, life: randi(22, 34), L: 0 });
        break;
      case 'puff':
        this.add({ k: 'smoke', x, y, vx: rand(-0.5, 0.5), vy: rand(-0.5, 0.5), r: rand(8, 12) * s, life: 18, L: 0 });
        break;
      case 'speedline':
        this.add({ k: 'line', x, y, vx: -o.vx * 0.2, vy: -o.vy * 0.2, a: Math.atan2(o.vy, o.vx), len: 70, life: 8, L: 0 });
        break;
      case 'wind':
        this.add({ k: 'swirl', x: x + rand(-14, 14), y: y + rand(-20, 20), a: rand(0, TAU), r: rand(18, 30), life: 10, col: '#9fffd8', L: 1 });
        break;
      case 'after':
        if (o.f) this.add({ k: 'after', snap: snapshotFighter(o.f), life: 10, col: o.f.color, L: 0 });
        break;
      case 'warp':
        this.add({ k: 'ring', x, y, r: 50, r2: 4, life: 12, col: '#4ad8ff', w: 5, L: 1 });
        for (let i = 0; i < 8; i++) this.add({ k: 'bolt', x, y, a: rand(0, TAU), len: rand(20, 40), life: 7, col: '#bff6ff', L: 1 });
        break;
      case 'shieldhit':
        this.add({ k: 'flash', x, y, r: 26, life: 8, col: '#ffffff', L: 1 });
        for (let i = 0; i < 6; i++) this.add({ k: 'shard', x, y, vx: rand(-4, 4), vy: rand(-4, 2), g: 0.2, life: 14, col: o.col, L: 1 });
        break;
      case 'shatter':
        for (let i = 0; i < 24; i++) this.add({ k: 'shard', x, y, vx: rand(-9, 9), vy: rand(-10, 3), g: 0.3, life: 30, col: o.col, L: 1 });
        this.add({ k: 'ring', x, y, r: 20, r2: 120, life: 18, col: o.col, w: 6, L: 1 });
        break;
      case 'ffspark':
        this.add({ k: 'star4', x, y, r: 16, life: 8, col: '#fff', L: 1 });
        break;
      case 'smokebomb':
        this.smokeBomb(x, y);
        break;
      case 'dust':
        this.dust(x, y, 3);
        break;
    }
  }
  flame(x, y, r) { this.add({ k: 'flame', x: x + rand(-4, 4), y: y + rand(-4, 4), vx: rand(-0.5, 0.5), vy: rand(-1.2, 0), r: r * rand(0.8, 1.3), life: randi(10, 16), L: 1 }); }
  spark(x, y, col, r) { this.add({ k: 'bolt', x: x + rand(-r, r), y: y + rand(-r, r), a: rand(0, TAU), len: rand(8, 20), life: 5, col, L: 1 }); }
  dust(x, y, n, col) {
    for (let i = 0; i < (this.low ? Math.ceil(n / 2) : n); i++) this.add({ k: 'dust', x: x + rand(-14, 14), y: y - rand(0, 6), vx: rand(-1.6, 1.6), vy: rand(-1.4, -0.2), drag: 0.93, r: rand(5, 10), life: randi(16, 26), col: col || '#e8e0d0', L: 0 });
  }
  debris(x, y, col, n) {
    for (let i = 0; i < n; i++) this.add({ k: 'rock', x, y, vx: rand(-6, 6), vy: rand(-9, -2), g: 0.4, r: rand(3, 7), a: rand(0, TAU), life: randi(24, 40), col, L: 1 });
  }
  smokeBomb(x, y) {
    for (let i = 0; i < 12; i++) this.add({ k: 'smoke', x: x + rand(-20, 20), y: y + rand(-30, 10), vx: rand(-1.5, 1.5), vy: rand(-1.5, 0.5), drag: 0.92, r: rand(16, 26), life: randi(24, 36), L: 1 });
  }
  hitSpark(x, y, dmg, el, dir, big) {
    const n = big ? 14 : clamp(Math.round(dmg * 0.6 + 3), 4, 11);
    const sz = clamp(dmg * 2.6 + 16, 20, 66) * (big ? 1.25 : 1);
    this.add({ k: 'flash', x, y, r: sz, life: big ? 12 : 7, col: el.c1, L: 1 });
    this.add({ k: 'burst', x, y, r: sz * 1.2, n, a0: rand(0, TAU), life: big ? 12 : 9, c1: el.c1, c2: el.c2, L: 1 });
    if (dmg >= 8) this.add({ k: 'ring', x, y, r: sz * 0.3, r2: sz * 1.4, life: 12, col: el.c2, w: 5, L: 1 });
    const pn = this.low ? Math.ceil(n / 2) : n;
    for (let i = 0; i < pn; i++) {
      const a = (dir > 0 ? 0 : Math.PI) + rand(-1.3, 1.3), v = rand(4, 10) * (big ? 1.4 : 1);
      this.add({ k: 'shard', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, drag: 0.88, life: randi(10, 18), col: el.c2, L: 1 });
    }
  }
  koBlast(x, y, ang, col) {
    this.add({ k: 'blast', x, y, a: ang, life: 50, col, L: 1 });
    for (let i = 0; i < 26; i++) {
      const a = ang + rand(-0.5, 0.5), v = rand(6, 22);
      this.add({ k: 'shard', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.92, life: randi(24, 44), col: i % 2 ? '#fff' : col, L: 1 });
    }
  }
  text(x, y, s, col, size) { this.texts.push({ x, y, s, col: col || '#fff', t: 0, life: 50, size: size || 26 }); }

  // ---------- 描画 ----------
  draw(ctx, layer) {
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      if (p.L !== layer) continue;
      const k = p.t / p.life, inv = 1 - k;
      switch (p.k) {
        case 'flame': {
          ctx.globalCompositeOperation = 'lighter';
          const r = p.r * (1 - k * 0.6);
          ctx.fillStyle = k < 0.3 ? `rgba(255,240,170,${0.9 * inv})` : `rgba(255,${Math.floor(180 - k * 140)},40,${0.8 * inv})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'chargep': {
          const x = lerp(p.x, p.tx, easeIn(k)), y = lerp(p.y, p.ty, easeIn(k));
          ctx.fillStyle = p.col; ctx.globalAlpha = inv;
          ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case 'bolt': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = p.col; ctx.lineWidth = 3 * inv + 1; ctx.globalAlpha = inv;
          ctx.beginPath(); ctx.moveTo(p.x, p.y);
          let x = p.x, y = p.y;
          for (let j = 0; j < 3; j++) { const a = p.a + rand(-0.7, 0.7); x += Math.cos(a) * p.len / 3; y += Math.sin(a) * p.len / 3; ctx.lineTo(x, y); }
          ctx.stroke();
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'flash': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = inv * 0.9;
          ctx.fillStyle = p.col;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.5 + easeOut(k) * 0.7), 0, TAU); ctx.fill();
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'burst': {
          ctx.save(); ctx.translate(p.x, p.y);
          ctx.globalCompositeOperation = 'lighter';
          const r = p.r * (0.6 + easeOut(k) * 0.6);
          ctx.fillStyle = p.c2; ctx.globalAlpha = inv;
          ctx.beginPath();
          for (let j = 0; j < p.n * 2; j++) {
            const a = p.a0 + (j / (p.n * 2)) * TAU, rr = j % 2 ? r * 0.28 : r * (j % 4 ? 0.8 : 1.1);
            ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = p.c1; ctx.scale(0.55, 0.55); ctx.fill();
          ctx.restore();
          break;
        }
        case 'ring': {
          ctx.strokeStyle = p.col; ctx.globalAlpha = inv; ctx.lineWidth = p.w * inv + 1;
          const r = lerp(p.r, p.r2, easeOut(k));
          ctx.beginPath();
          if (p.flat) ctx.ellipse(p.x, p.y, r, r * 0.28, 0, 0, TAU); else ctx.arc(p.x, p.y, r, 0, TAU);
          ctx.stroke(); ctx.globalAlpha = 1;
          break;
        }
        case 'smoke': {
          ctx.fillStyle = `rgba(235,235,240,${0.5 * inv})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.6 + k * 0.8), 0, TAU); ctx.fill();
          break;
        }
        case 'dust': {
          ctx.fillStyle = rgba(p.col, 0.65 * inv);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.6 + k), 0, TAU); ctx.fill();
          break;
        }
        case 'line': {
          ctx.strokeStyle = `rgba(255,255,255,${0.6 * inv})`; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - Math.cos(p.a) * p.len, p.y - Math.sin(p.a) * p.len); ctx.stroke();
          break;
        }
        case 'swirl': {
          ctx.strokeStyle = rgba(p.col, 0.8 * inv); ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.6 + k * 0.5), p.a + k * 3, p.a + k * 3 + 2.2); ctx.stroke();
          break;
        }
        case 'shard': {
          ctx.fillStyle = p.col; ctx.globalAlpha = inv;
          const sz = 5 * inv + 1.5;
          ctx.beginPath(); ctx.moveTo(p.x - p.vx * 0.8, p.y - p.vy * 0.8); ctx.lineTo(p.x + sz, p.y); ctx.lineTo(p.x, p.y + sz); ctx.closePath(); ctx.fill();
          ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
          ctx.globalAlpha = 1;
          break;
        }
        case 'rock': {
          ctx.fillStyle = p.col; ctx.strokeStyle = '#1a100a'; ctx.lineWidth = 1.5;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a + p.t * 0.2);
          ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2); ctx.strokeRect(-p.r, -p.r, p.r * 2, p.r * 2);
          ctx.restore();
          break;
        }
        case 'star4': {
          ctx.fillStyle = p.col; ctx.globalAlpha = inv;
          const r = p.r * (0.5 + k);
          ctx.beginPath(); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r * 0.2, p.y); ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - r * 0.2, p.y); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(p.x - r, p.y); ctx.lineTo(p.x, p.y + r * 0.2); ctx.lineTo(p.x + r, p.y); ctx.lineTo(p.x, p.y - r * 0.2); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case 'after': {
          ctx.globalAlpha = 0.35 * inv;
          drawSilhouette(ctx, p.snap, p.col);
          ctx.globalAlpha = 1;
          break;
        }
        case 'blast': {
          // 撃墜時の爆発（画面端から内側へ）
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
          ctx.globalCompositeOperation = 'lighter';
          const len = 900 * easeOut(Math.min(1, k * 2.5)), w = 160 * inv + 20;
          const g = ctx.createLinearGradient(0, 0, len, 0);
          g.addColorStop(0, rgba(p.col, 0.95 * inv)); g.addColorStop(1, rgba(p.col, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(0, -w * 0.3); ctx.lineTo(len, -w); ctx.lineTo(len, w); ctx.lineTo(0, w * 0.3); ctx.closePath(); ctx.fill();
          ctx.fillStyle = `rgba(255,255,255,${0.9 * inv})`;
          ctx.beginPath(); ctx.moveTo(0, -w * 0.12); ctx.lineTo(len * 0.8, -w * 0.4); ctx.lineTo(len * 0.8, w * 0.4); ctx.lineTo(0, w * 0.12); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.arc(0, 0, 90 * inv + 20, 0, TAU); ctx.fill();
          ctx.restore();
          break;
        }
      }
    }
  }
  drawTexts(ctx) {
    for (const t of this.texts) {
      const k = t.t / t.life;
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      const s = t.t < 6 ? 1 + (6 - t.t) * 0.12 : 1;
      ctx.font = `900 ${Math.round(t.size * s)}px "Dela Gothic One", sans-serif`;
      ctx.textAlign = 'center'; ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round';
      ctx.strokeText(t.s, t.x, t.y); ctx.fillStyle = t.col; ctx.fillText(t.s, t.x, t.y);
      ctx.globalAlpha = 1;
    }
  }
}
