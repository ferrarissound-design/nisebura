'use strict';
// ===== 起動・メインループ =====
const App = {
  canvas: null, ctx: null, dpr: 1, W: 0, H: 0,
  battle: null, demo: null, lastCfg: null, screen: 'title',
  settings: Object.assign({ sfx: 8, bgm: 6, quality: 'high', shake: true, touchSize: 1, debug: false }, Store.get('settings', {})),
  acc: 0, last: 0, fpsLow: 0,

  init() {
    buildChars();
    for (const c of CHARS) buildAIData(c);
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    if (IS_TOUCH) document.body.classList.add('touch');
    Touch.init(this.canvas);
    Touch.enabled = IS_TOUCH;
    Touch.onPause = () => this.pause();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    document.addEventListener('keydown', (e) => {
      Keys.down.add(e.code);
      if (this.inBattle()) {
        if (GAME_KEYS.has(e.code) || e.code === 'Space') e.preventDefault();
        if ((e.code === 'Escape' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); if (this.battle.paused) { if (e.code === 'Escape') this.resume(); } else this.pause(); }
      }
    });
    document.addEventListener('keyup', (e) => Keys.down.delete(e.code));
    window.addEventListener('blur', () => { Keys.down.clear(); Touch.reset(); if (this.inBattle() && !this.battle.paused && this.battle.phase !== 'end') this.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { Keys.down.clear(); if (this.inBattle() && !this.battle.paused) this.pause(); } });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    this.applySettings(true);
    this.resize();
    UI.init();
    this.startDemo();
    UI.show('title', false);
    requestAnimationFrame((t) => this.loop(t));
  },
  applySettings(first) {
    const s = this.settings;
    Snd.setVolumes(s.sfx / 10, s.bgm / 10);
    Touch.sizeMul = s.touchSize;
    if (!first) { Store.set('settings', s); this.resize(); }
    if (this.battle) { this.battle.shakeOn = s.shake; this.battle.quality = s.quality; }
  },
  resize() {
    const cap = this.settings.quality === 'low' ? 1 : IS_TOUCH ? 1.75 : 2;
    this.dpr = Math.min(window.devicePixelRatio || 1, cap);
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
    this.W = this.canvas.width; this.H = this.canvas.height;
    Touch.layout(w, h);
  },
  userStart() {
    Snd.init();
    if (IS_TOUCH) {
      const el = document.documentElement;
      try {
        const p = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null;
        if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* 非対応 */ } }).catch(() => {});
      } catch (e) { /* 非対応 */ }
    }
    Snd.playBgm('title');
  },
  onScreen(id) {
    this.screen = id;
    if ((id === 'title' || id === 'menu') && !this.demo) this.startDemo();
    if (id === 'menu' || id === 'chars' || id === 'stages' || id === 'howto' || id === 'settings') { if (Snd.ctx && (!Snd.track || Snd.track.id !== 'title')) Snd.playBgm('title'); }
  },
  startDemo() {
    const ids = CHARS.map((c) => c.id).sort(() => Math.random() - 0.5);
    const players = [0, 1, 2, 3].map((i) => ({ slot: i, char: ids[i], pal: 0, source: new CpuSource(), level: 7 }));
    this.demo = new Battle({ players, stage: choice(STAGES).id, stocks: 3, time: 0 }, { silent: true, demo: true, quality: this.settings.quality, shake: this.settings.shake });
  },
  inBattle() { return !!this.battle; },

  startBattle(cfg) {
    this.lastCfg = cfg;
    this.demo = null;
    UI.hide();
    this.screen = 'battle';
    Keys.down.clear(); Touch.reset();
    this.battle = new Battle(cfg, { quality: this.settings.quality, shake: this.settings.shake });
    this.battle.onEnd = (res) => this.endBattle(res);
    Touch.active = cfg.players.some((p) => p.source.type === 'touch');
    this.acc = 0;
  },
  endBattle(res) {
    Touch.active = false;
    this.resultBattle = this.battle;
    this.battle = null;
    UI.showResults(res);
  },
  pause() {
    if (!this.battle || this.battle.paused) return;
    this.battle.paused = true;
    Snd.play('back');
    UI.show('pause', false);
    Touch.reset();
  },
  resume() {
    if (!this.battle) return;
    UI.hide();
    this.screen = 'battle';
    this.battle.paused = false;
    Keys.down.clear();
  },
  restart() { if (this.lastCfg) { this.battle = null; this.startBattle(UI.battleConfig()); } },
  quitBattle() { this.battle = null; this.resultBattle = null; Touch.active = false; this.startDemo(); },

  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    const dt = Math.min(100, t - (this.last || t));
    this.last = t;
    this.acc += dt;
    const step = 1000 / 60;
    let n = 0;
    // メニュー（ゲームパッド）
    if (!this.battle || this.battle.paused) for (const ev of MenuPad.poll()) UI.padEvent(ev);
    else for (const ev of MenuPad.poll()) if (ev === 'start') this.pause();
    while (this.acc >= step && n < 4) {
      this.acc -= step; n++;
      if (this.battle) this.battle.update();
      else if (this.demo && (this.screen === 'title' || this.screen === 'menu')) this.demo.step();
    }
    if (this.acc > step * 4) this.acc = 0;
    const ctx = this.ctx;
    if (this.battle) {
      this.battle.render(ctx, this.W, this.H, this.dpr, { debug: this.settings.debug });
      Touch.draw(ctx, this.dpr);
    } else if (this.resultBattle && this.screen === 'result') {
      this.resultBattle.render(ctx, this.W, this.H, this.dpr);
    } else if (this.demo) {
      this.demo.render(ctx, this.W, this.H, this.dpr);
    }
    UI.tickPreviews();
    UI.tickWinner();
  },
};

window.addEventListener('load', () => App.init());
