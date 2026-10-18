'use strict';
// ===== サウンド（全てWebAudioで合成。外部素材なし） =====
const Snd = {
  ctx: null, master: null, sfx: null, bgm: null, noiseBuf: null,
  sfxVol: 0.8, bgmVol: 0.5, track: null, schedTimer: null,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.9;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain(); this.sfx.gain.value = this.sfxVol; this.sfx.connect(this.master);
      this.bgm = this.ctx.createGain(); this.bgm.gain.value = this.bgmVol * 0.5; this.bgm.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },
  setVolumes(sfx, bgm) {
    this.sfxVol = sfx; this.bgmVol = bgm;
    if (this.sfx) this.sfx.gain.value = sfx;
    if (this.bgm) this.bgm.gain.value = bgm * 0.5;
  },

  tone(freq, dur, o = {}) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
    const v = (o.vol || 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.att || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(o.dest || this.sfx);
    osc.start(t); osc.stop(t + dur + 0.02);
  },
  noise(dur, o = {}) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = o.rate || 1;
    const f = c.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 2000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    f.Q.value = o.q || 1;
    const g = c.createGain();
    const v = o.vol || 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.att || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.dest || this.sfx);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  },

  play(name, p = 1) {
    if (!this.ctx) return;
    const r = (a, b) => a + Math.random() * (b - a);
    switch (name) {
      case 'hit1':
        this.noise(0.07, { filter: 'bandpass', freq: 2600 * p, q: 0.8, vol: 0.35 });
        this.tone(260 * p, 0.07, { type: 'square', to: 120, vol: 0.08 });
        break;
      case 'hit2':
        this.noise(0.14, { filter: 'lowpass', freq: 2400, to: 500, vol: 0.5 });
        this.tone(180 * p, 0.14, { type: 'sine', to: 60, vol: 0.45 });
        this.noise(0.04, { filter: 'highpass', freq: 3500, vol: 0.2 });
        break;
      case 'hit3':
        this.noise(0.32, { filter: 'lowpass', freq: 1800, to: 200, vol: 0.7 });
        this.tone(130 * p, 0.3, { type: 'sine', to: 38, vol: 0.7 });
        this.tone(90, 0.22, { type: 'square', to: 40, vol: 0.12 });
        this.noise(0.06, { filter: 'highpass', freq: 3000, vol: 0.35 });
        break;
      case 'smashhit':
        this.noise(0.5, { filter: 'lowpass', freq: 2200, to: 150, vol: 0.85 });
        this.tone(110, 0.45, { type: 'sine', to: 30, vol: 0.8 });
        this.tone(1600, 0.35, { type: 'triangle', to: 1200, vol: 0.12 });
        this.noise(0.08, { filter: 'highpass', freq: 2500, vol: 0.45 });
        break;
      case 'whoosh':
        this.noise(0.13, { filter: 'bandpass', freq: 500 * p, to: 2600 * p, q: 1.6, vol: 0.18 });
        break;
      case 'bigwhoosh':
        this.noise(0.22, { filter: 'bandpass', freq: 300, to: 1800, q: 1.2, vol: 0.3 });
        break;
      case 'jump':
        this.tone(320, 0.09, { type: 'triangle', to: 620, vol: 0.14 });
        this.noise(0.05, { filter: 'lowpass', freq: 900, vol: 0.12 });
        break;
      case 'djump':
        this.tone(420, 0.12, { type: 'triangle', to: 900, vol: 0.13 });
        this.noise(0.1, { filter: 'bandpass', freq: 1200, to: 3000, vol: 0.12 });
        break;
      case 'land':
        this.noise(0.07, { filter: 'lowpass', freq: 500, vol: 0.25 });
        break;
      case 'dash':
        this.noise(0.09, { filter: 'bandpass', freq: 900, to: 400, vol: 0.18 });
        break;
      case 'shield':
        this.tone(950, 0.12, { type: 'triangle', vol: 0.18 });
        this.tone(1430, 0.1, { type: 'sine', vol: 0.1 });
        break;
      case 'shieldbreak':
        for (let i = 0; i < 5; i++) this.tone(r(1200, 3000), 0.4, { type: 'triangle', delay: i * 0.03, vol: 0.1 });
        this.noise(0.4, { filter: 'highpass', freq: 2000, vol: 0.3 });
        break;
      case 'dodge':
        this.noise(0.1, { filter: 'bandpass', freq: 3000, to: 1200, q: 2, vol: 0.12 });
        break;
      case 'grab':
        this.noise(0.06, { filter: 'bandpass', freq: 1400, vol: 0.25 });
        this.tone(300, 0.06, { type: 'square', vol: 0.06 });
        break;
      case 'throw':
        this.noise(0.18, { filter: 'bandpass', freq: 400, to: 1500, vol: 0.3 });
        break;
      case 'ko':
        this.noise(1.2, { filter: 'lowpass', freq: 3000, to: 120, vol: 0.9 });
        this.tone(90, 0.9, { type: 'sine', to: 28, vol: 0.9 });
        this.tone(2200, 0.9, { type: 'sine', to: 1700, vol: 0.12, delay: 0.02 });
        this.tone(1100, 0.7, { type: 'triangle', to: 900, vol: 0.12, delay: 0.02 });
        break;
      case 'star':
        for (let i = 0; i < 4; i++) this.tone(1800 + i * 400, 0.15, { type: 'sine', delay: i * 0.06, vol: 0.1 });
        break;
      case 'fire':
        this.noise(0.28, { filter: 'bandpass', freq: 700, to: 1800, q: 0.8, vol: 0.35 });
        this.tone(140, 0.2, { type: 'sawtooth', to: 70, vol: 0.06 });
        break;
      case 'boom':
        this.noise(0.6, { filter: 'lowpass', freq: 1500, to: 100, vol: 0.85 });
        this.tone(70, 0.5, { type: 'sine', to: 30, vol: 0.7 });
        break;
      case 'zap':
        this.tone(r(900, 1400), 0.14, { type: 'square', to: 180, vol: 0.09 });
        this.noise(0.12, { filter: 'highpass', freq: 2500, vol: 0.2 });
        break;
      case 'beam':
        this.tone(600, 0.3, { type: 'sawtooth', to: 1500, vol: 0.08 });
        this.tone(300, 0.3, { type: 'square', to: 900, vol: 0.05 });
        break;
      case 'slash':
        this.noise(0.12, { filter: 'highpass', freq: 2500, to: 6000, vol: 0.25 });
        this.tone(1800, 0.1, { type: 'triangle', to: 900, vol: 0.06 });
        break;
      case 'rock':
        this.noise(0.25, { filter: 'lowpass', freq: 600, to: 150, vol: 0.6 });
        this.tone(80, 0.2, { type: 'triangle', to: 40, vol: 0.4 });
        break;
      case 'counter':
        this.tone(1500, 0.3, { type: 'triangle', to: 2400, vol: 0.15 });
        this.tone(750, 0.3, { type: 'sine', to: 1200, vol: 0.15 });
        break;
      case 'reflect':
        this.tone(1200, 0.18, { type: 'square', to: 2400, vol: 0.08 });
        break;
      case 'warp':
        this.tone(200, 0.22, { type: 'sine', to: 1600, vol: 0.2 });
        break;
      case 'charge':
        this.tone(300 + p * 900, 0.06, { type: 'triangle', vol: 0.05 });
        break;
      case 'tech':
        this.tone(1300, 0.08, { type: 'square', vol: 0.06 });
        break;
      case 'clank':
        this.tone(2000, 0.15, { type: 'square', to: 1500, vol: 0.1 });
        this.noise(0.08, { filter: 'highpass', freq: 3000, vol: 0.3 });
        break;
      case 'ledge':
        this.noise(0.05, { filter: 'bandpass', freq: 1800, vol: 0.18 });
        break;
      case 'select':
        this.tone(880, 0.08, { type: 'square', vol: 0.07 });
        this.tone(1320, 0.12, { type: 'square', vol: 0.07, delay: 0.06 });
        break;
      case 'move':
        this.tone(660, 0.04, { type: 'square', vol: 0.04 });
        break;
      case 'back':
        this.tone(500, 0.08, { type: 'square', to: 300, vol: 0.06 });
        break;
      case 'count':
        this.tone(660, 0.25, { type: 'square', vol: 0.12 });
        break;
      case 'go':
        this.tone(990, 0.6, { type: 'square', vol: 0.12 });
        this.tone(1320, 0.6, { type: 'square', vol: 0.08 });
        this.noise(0.4, { filter: 'bandpass', freq: 1500, to: 4000, vol: 0.2 });
        break;
      case 'game':
        this.noise(1.0, { filter: 'lowpass', freq: 2500, to: 150, vol: 0.8 });
        this.tone(220, 1.2, { type: 'sawtooth', to: 110, vol: 0.12 });
        this.tone(330, 1.2, { type: 'square', to: 165, vol: 0.06 });
        break;
      case 'fanfare': {
        const n = [523, 659, 784, 1047, 784, 1047];
        n.forEach((f, i) => this.tone(f, i === n.length - 1 ? 0.8 : 0.16, { type: 'square', vol: 0.08, delay: i * 0.13 }));
        break;
      }
    }
  },

  // ===== 簡易シーケンサーBGM =====
  playBgm(id) {
    if (!this.ctx) return;
    if (this.track && this.track.id === id) return;
    this.stopBgm();
    const def = BGM_TRACKS[id];
    if (!def) return;
    this.track = buildTrack(id, def);
    this.track.next = this.ctx.currentTime + 0.1;
    this.track.step = 0;
    this.schedTimer = setInterval(() => this.schedule(), 30);
  },
  stopBgm() {
    if (this.schedTimer) clearInterval(this.schedTimer);
    this.schedTimer = null;
    this.track = null;
  },
  schedule() {
    const tr = this.track, c = this.ctx;
    if (!tr || !c) return;
    const stepDur = 60 / tr.bpm / 4;
    while (tr.next < c.currentTime + 0.12) {
      this.playStep(tr, tr.step, tr.next, stepDur);
      tr.next += stepDur;
      tr.step = (tr.step + 1) % tr.len;
    }
  },
  playStep(tr, s, t, sd) {
    const c = this.ctx;
    const voice = (freq, dur, type, vol) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.bgm);
      o.start(t); o.stop(t + dur + 0.02);
    };
    const drum = (kind) => {
      if (kind === 'k') {
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.connect(g); g.connect(this.bgm); o.start(t); o.stop(t + 0.2);
      } else {
        const src = c.createBufferSource(); src.buffer = this.noiseBuf;
        const f = c.createBiquadFilter(); f.type = kind === 's' ? 'bandpass' : 'highpass';
        f.frequency.value = kind === 's' ? 1800 : 7000;
        const g = c.createGain();
        const v = kind === 's' ? 0.35 : 0.08, d = kind === 's' ? 0.14 : 0.04;
        g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        src.connect(f); f.connect(g); g.connect(this.bgm); src.start(t, Math.random()); src.stop(t + d + 0.02);
      }
    };
    const step16 = s % 16;
    const d = tr.drums[step16];
    if (d.includes('k')) drum('k');
    if (d.includes('s')) drum('s');
    if (d.includes('h')) drum('h');
    const b = tr.bass[s]; if (b) voice(b, sd * 1.8, tr.bassType, 0.22);
    const l = tr.lead[s]; if (l) voice(l, sd * tr.leadLen, tr.leadType, 0.07);
    const p = tr.pad[s]; if (p) p.forEach((f) => voice(f, sd * 15, 'triangle', 0.028));
  },
};

const BGM_TRACKS = {
  title: { bpm: 128, root: 57, prog: [[0, 'm'], [-4, 'M'], [-9, 'M'], [-2, 'M']], seed: 7, lead: 'square', bass: 'sawtooth', drums: 'rock' },
  sky: { bpm: 140, root: 62, prog: [[0, 'M'], [-3, 'm'], [5, 'M'], [7, 'M']], seed: 11, lead: 'square', bass: 'triangle', drums: 'drive' },
  garden: { bpm: 132, root: 60, prog: [[0, 'M'], [9, 'm'], [5, 'M'], [7, 'M']], seed: 23, lead: 'triangle', bass: 'square', drums: 'bouncy' },
  neon: { bpm: 150, root: 52, prog: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']], seed: 5, lead: 'sawtooth', bass: 'square', drums: 'drive' },
  volcano: { bpm: 158, root: 50, prog: [[0, 'm'], [1, 'M'], [0, 'm'], [-2, 'M']], seed: 31, lead: 'sawtooth', bass: 'sawtooth', drums: 'rock' },
  result: { bpm: 110, root: 60, prog: [[0, 'M'], [5, 'M'], [7, 'M'], [0, 'M']], seed: 3, lead: 'triangle', bass: 'triangle', drums: 'bouncy' },
};
const DRUM_PATTERNS = {
  rock: ['kh', 'h', 'h', 'h', 'sh', 'h', 'h', 'kh', 'kh', 'h', 'kh', 'h', 'sh', 'h', 'h', 'h'],
  drive: ['kh', 'h', 'kh', 'h', 'sh', 'h', 'kh', 'h', 'kh', 'h', 'kh', 'h', 'sh', 'h', 'kh', 's'],
  bouncy: ['k', 'h', 'h', 'k', 'sh', 'h', 'k', 'h', 'k', 'h', 'h', 'k', 'sh', 'h', 'h', 'h'],
};
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
function buildTrack(id, def) {
  const rng = seededRng(def.seed * 9973);
  const bars = def.prog.length * 2;
  const len = bars * 16;
  const bass = new Array(len).fill(0), lead = new Array(len).fill(0), pad = new Array(len).fill(null);
  const scale = def.prog[0][1] === 'm' ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  // 1フレーズ分（2小節）のリズムを作り、繰り返しつつ和音に合わせて音を変える
  const rhythm = [];
  for (let i = 0; i < 32; i++) rhythm.push(rng() < (i % 4 === 0 ? 0.85 : i % 2 === 0 ? 0.55 : 0.25));
  const contour = [];
  let deg = 4;
  for (let i = 0; i < 32; i++) { deg += Math.floor(rng() * 5) - 2; deg = clamp(deg, 0, 9); contour.push(deg); }
  for (let bar = 0; bar < bars; bar++) {
    const [off, q] = def.prog[Math.floor(bar / 2) % def.prog.length];
    const chordRoot = def.root + off;
    const third = q === 'm' ? 3 : 4;
    for (let i = 0; i < 16; i++) {
      const s = bar * 16 + i;
      // ベース: 8分音符、オクターブ跳躍
      if (i % 2 === 0) bass[s] = midi(chordRoot - 24 + (i % 8 === 6 ? 12 : 0));
      const ri = (bar % 2) * 16 + i;
      if (rhythm[ri] && !(bar % 8 === 7 && i > 11)) {
        const dg = contour[ri];
        const oct = Math.floor(dg / 7);
        let note = def.root + scale[dg % 7] + oct * 12;
        // 強拍は和音の構成音に寄せる
        if (i % 4 === 0) {
          const ct = [chordRoot, chordRoot + third, chordRoot + 7].map((n) => n + 12 * Math.round((note - n) / 12));
          note = ct.reduce((a, b) => (Math.abs(b - note) < Math.abs(a - note) ? b : a));
        }
        lead[s] = midi(note + 12);
      }
      if (i === 0) pad[s] = [chordRoot, chordRoot + third, chordRoot + 7].map((n) => midi(n));
    }
  }
  return {
    id, bpm: def.bpm, len, bass, lead, pad,
    drums: DRUM_PATTERNS[def.drums], leadType: def.lead, bassType: def.bass, leadLen: 1.6,
  };
}
