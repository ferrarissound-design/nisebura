'use strict';
// ===== 飛び道具 =====
const PROJ_TYPES = {
  fireball: { r: 13, dmg: 5, ang: 40, bkb: 24, kbg: 40, life: 70, el: 'fire' },
  rock: { r: 18, dmg: 13, ang: 45, bkb: 42, kbg: 78, life: 160, el: 'rock', grav: 0.38, heavy: true },
  shock: { r: 17, dmg: 8, ang: 72, bkb: 45, kbg: 55, life: 26, el: 'rock', ground: true, pierce: true },
  shuriken: { r: 10, dmg: 3, ang: 50, bkb: 10, kbg: 28, life: 38, el: 'cut' },
  eball: { r: 10, dmg: 4, ang: 40, bkb: 20, kbg: 50, life: 100, el: 'elec' },
  spark: { r: 15, dmg: 6, ang: 65, bkb: 30, kbg: 55, life: 85, el: 'elec', ground: true },
  crescent: { r: 22, dmg: 8, ang: 40, bkb: 36, kbg: 70, life: 48, el: 'moon', decel: 0.975 },
};

class Projectile {
  constructor(owner, type, x, y, vx, vy, o = {}) {
    const d = PROJ_TYPES[type];
    this.owner = owner; this.type = type; this.def = d;
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.r = d.r * (o.scale || 1); this.dmg = d.dmg; this.ang = d.ang; this.bkb = d.bkb; this.kbg = d.kbg;
    this.el = d.el; this.life = d.life; this.t = 0; this.dead = false;
    this.hit = new Set(); this.rot = 0; this.dir = sign(vx) || owner.facing;
    this.grounded = false;
    if (type === 'eball') {
      const c = o.charge || 0;
      this.charge = c;
      this.r = 9 + c * 17; this.dmg = Math.round(4 + c * 19); this.bkb = 20 + c * 30; this.kbg = 48 + c * 46;
    }
    if (type === 'spark' && Math.abs(vy) < 0.1) this.grounded = true;
  }
  update(battle) {
    this.t++;
    if (--this.life <= 0) { this.die(battle, false); return; }
    const st = battle.stage, d = this.def;
    this.rot += 0.35 * this.dir;
    if (d.grav) this.vy += d.grav;
    if (d.decel) { this.vx *= d.decel; if (Math.abs(this.vx) < 2) this.life = Math.min(this.life, 6); }
    if (this.type === 'fireball') { this.vy = Math.sin(this.t * 0.25) * 0.7; if (this.t % 2 === 0) battle.fx.flame(this.x, this.y, 8); }
    if (this.type === 'eball' && this.t % 3 === 0) battle.fx.spark(this.x, this.y, '#4ad8ff', this.r);
    this.x += this.vx; this.y += this.vy;
    if (d.ground) {
      // 地面を這う
      const p = this.grounded ? st.platformAt(this.x, this.y, 6) : null;
      if (this.grounded) {
        if (!p) { if (this.type === 'shock') { this.die(battle, false); return; } this.grounded = false; this.vy = 2; }
        else this.y = p.y;
      } else {
        this.vy = Math.min(this.vy + 0.35, 9);
        const q = st.landingPlat(this.x, this.y - this.vy, this.y);
        if (q) { this.grounded = true; this.y = q.y; this.vy = 0; this.vx = 6.5 * this.dir; }
      }
      if (this.type === 'spark' && this.t % 2 === 0) battle.fx.spark(this.x, this.y - 10, '#4ad8ff', 14);
      if (this.type === 'shock' && this.t % 2 === 0) battle.fx.dust(this.x, this.y, 1, '#c8a070');
    } else {
      // ステージとの衝突
      if (st.solidAt(this.x, this.y)) {
        if (this.type === 'rock') battle.fx.debris(this.x, this.y, '#8a6a4a', 10);
        this.die(battle, true); return;
      }
      if (this.type === 'rock') {
        const q = st.landingPlat(this.x, this.y - this.vy, this.y);
        if (q && this.vy > 0) { battle.fx.debris(this.x, q.y, '#8a6a4a', 10); battle.sfx('rock'); this.die(battle, false); return; }
      }
    }
    const b = st.blast;
    if (this.x < b.l || this.x > b.r || this.y > b.b || this.y < b.t) this.dead = true;
  }
  die(battle, fx) {
    this.dead = true;
    if (fx) battle.fx.spark(this.x, this.y, EL[this.el].c2, this.r);
  }
  // 反射
  reflect(by) {
    this.owner = by; this.vx = -this.vx * 1.15; this.vy = -this.vy * 0.5; this.dir = sign(this.vx);
    this.dmg = Math.round(this.dmg * 1.4); this.life = Math.max(this.life, 50); this.hit.clear();
  }
  draw(ctx, t) {
    const x = this.x, y = this.y, r = this.r;
    ctx.save();
    switch (this.type) {
      case 'fireball': {
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
        g.addColorStop(0, 'rgba(255,255,220,1)'); g.addColorStop(0.35, 'rgba(255,190,60,0.95)'); g.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,120,30,0.5)';
        ctx.beginPath(); ctx.ellipse(x - this.dir * r, y, r * 1.4, r * 0.7, 0, 0, TAU); ctx.fill();
        break;
      }
      case 'rock': {
        ctx.translate(x, y); ctx.rotate(this.rot * 0.4);
        ctx.fillStyle = '#8a6a4a'; ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU, rr = r * (0.82 + ((i * 37) % 5) * 0.06); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#b08a64'; ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.3, r * 0.35, 0, TAU); ctx.fill();
        break;
      }
      case 'shock': {
        ctx.globalAlpha = Math.min(1, this.life / 10);
        ctx.fillStyle = '#d8b080'; ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 2.5;
        for (let i = 0; i < 3; i++) {
          const ox = -this.dir * i * 12, h = r * (1.6 - i * 0.4);
          ctx.beginPath(); ctx.moveTo(x + ox - 8, y); ctx.lineTo(x + ox + this.dir * 4, y - h); ctx.lineTo(x + ox + 9, y); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        break;
      }
      case 'shuriken': {
        ctx.translate(x, y); ctx.rotate(this.rot * 1.5);
        ctx.fillStyle = '#d8e0f0'; ctx.strokeStyle = '#1a2030'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, rr = i % 2 ? r * 0.35 : r * 1.1; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#1a2030'; ctx.beginPath(); ctx.arc(0, 0, r * 0.18, 0, TAU); ctx.fill();
        break;
      }
      case 'eball': {
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.5);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(120,230,255,0.95)'); g.addColorStop(1, 'rgba(40,120,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.5, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(220,250,255,0.9)'; ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          let a = Math.random() * TAU;
          ctx.moveTo(x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4);
          for (let i = 0; i < 3; i++) { a += rand(-0.8, 0.8); const rr = r * (0.6 + i * 0.35); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
          ctx.stroke();
        }
        break;
      }
      case 'spark': {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(120,230,255,0.9)'; ctx.lineWidth = 3;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          let px = x - r, py = y - 4;
          ctx.moveTo(px, py);
          for (let i = 0; i < 5; i++) { px += r * 0.5; py = y - 4 - Math.random() * r * 1.6; ctx.lineTo(px, py); }
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(200,250,255,0.9)'; ctx.beginPath(); ctx.arc(x, y - r * 0.6, r * 0.45, 0, TAU); ctx.fill();
        break;
      }
      case 'crescent': {
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(x, y); ctx.scale(this.dir, 1);
        ctx.globalAlpha = Math.min(1, this.life / 12);
        const g = ctx.createLinearGradient(-r, 0, r, 0);
        g.addColorStop(0, 'rgba(160,100,255,0)'); g.addColorStop(1, 'rgba(230,210,255,1)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(-r * 0.6, 0, r * 1.5, -1.1, 1.1);
        ctx.arc(-r * 1.2, 0, r * 1.45, 0.95, -0.95, true);
        ctx.closePath(); ctx.fill();
        break;
      }
    }
    ctx.restore();
  }
}
