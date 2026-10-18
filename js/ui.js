'use strict';
// ===== メニューUI =====
const STOCK_OPTS = [1, 2, 3, 4, 5, 0]; // 0 = ∞
const TIME_OPTS = [0, 2, 3, 5, 8];
const STUB_BATTLE = { fx: { emit() {}, dust() {} }, sfx() {}, frame: 0 };

const UI = {
  cur: null, hist: [], focusEl: null, pv: [], pvT: 0, rosterCanvases: [],
  sel: null,

  init() {
    document.querySelectorAll('[data-act]').forEach((el) => this.bind(el));
    this.sel = Store.get('sel', null) || this.defaultSel();
    this.sel.slots.forEach((s, i) => { if (s.type === 'human' && s.ctrl === 'touch' && !IS_TOUCH) s.ctrl = 'kb1'; if (!CHARS.find((c) => c.id === s.char)) s.char = CHARS[i % CHARS.length].id; });
    this.buildRoster();
    this.buildHowto();
    this.buildSettings();
    document.addEventListener('keydown', (e) => this.onKey(e));
  },
  defaultSel() {
    return {
      stocks: 3, time: 0, active: 0, stage: 'garden',
      slots: [
        { type: 'human', char: 'blaze', pal: 0, level: 5, ctrl: IS_TOUCH ? 'touch' : 'kb1' },
        { type: 'cpu', char: 'luna', pal: 0, level: 4, ctrl: 'kb2' },
        { type: 'off', char: 'goldo', pal: 0, level: 4, ctrl: 'pad1' },
        { type: 'off', char: 'myu', pal: 0, level: 4, ctrl: 'pad2' },
      ],
    };
  },
  save() { Store.set('sel', this.sel); },
  bind(el) {
    el.addEventListener('click', (e) => { e.stopPropagation(); Snd.init(); this.act(el.dataset.act, el); });
    el.addEventListener('pointerenter', () => { if (this.focusEl !== el) this.setFocus(el, true); });
  },

  // ---------- 画面遷移 ----------
  show(id, push = true) {
    const next = document.getElementById('scr-' + id);
    if (this.cur && push && this.cur.id !== 'scr-pause') this.hist.push(this.cur.id.slice(4));
    document.querySelectorAll('.scr').forEach((s) => s.classList.remove('active'));
    next.classList.add('active');
    this.cur = next;
    if (id === 'chars') this.renderChars();
    if (id === 'stages') this.buildStages();
    App.onScreen(id);
    const first = next.querySelector('.btn.go, .btn.big, .btn.press, .stage-card, .btn');
    this.setFocus(first, true);
  },
  back() {
    const id = this.hist.pop();
    if (!id) return;
    Snd.play('back');
    this.show(id, false);
  },
  hide() {
    document.querySelectorAll('.scr').forEach((s) => s.classList.remove('active'));
    this.cur = null; this.hist = [];
  },
  setFocus(el, silent) {
    if (this.focusEl) this.focusEl.classList.remove('focus');
    this.focusEl = el;
    if (el) { el.classList.add('focus'); if (!silent) Snd.play('move'); }
  },
  focusables() {
    if (!this.cur) return [];
    return [...this.cur.querySelectorAll('.btn')].filter((b) => b.offsetParent !== null);
  },
  nav(dir) {
    const list = this.focusables();
    if (!list.length) return;
    const cur = this.focusEl && list.includes(this.focusEl) ? this.focusEl : null;
    if (!cur) { this.setFocus(list[0]); return; }
    const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dv = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    let best = null, bs = 1e9;
    for (const b of list) {
      if (b === cur) continue;
      const q = b.getBoundingClientRect(), x = q.left + q.width / 2 - cx, y = q.top + q.height / 2 - cy;
      const along = x * dv[0] + y * dv[1];
      if (along <= 4) continue;
      const across = Math.abs(x * dv[1] - y * dv[0]);
      const sc = along + across * 2.2;
      if (sc < bs) { bs = sc; best = b; }
    }
    if (best) this.setFocus(best);
  },
  onKey(e) {
    if (App.inBattle() && !App.battle.paused) return;
    if (!this.cur) return;
    const k = e.code;
    if (this.cur.id === 'scr-title') { if (!e.repeat) { e.preventDefault(); Snd.init(); this.act('start'); } return; }
    const map = {
      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    };
    if (map[k]) { e.preventDefault(); this.nav(map[k]); return; }
    if (k === 'Enter' || k === 'Space' || k === 'KeyJ' || k === 'KeyZ' || k === 'NumpadEnter') {
      e.preventDefault(); Snd.init();
      if (this.focusEl) this.focusEl.click();
      return;
    }
    if (k === 'Escape' || k === 'Backspace' || k === 'KeyK' || k === 'KeyX') {
      e.preventDefault();
      if (this.cur.id === 'scr-pause') App.resume(); else this.back();
    }
  },
  padEvent(ev) {
    if (!this.cur) return;
    if (['up', 'down', 'left', 'right'].includes(ev)) this.nav(ev);
    else if (ev === 'ok' || ev === 'start') { Snd.init(); if (this.focusEl) this.focusEl.click(); }
    else if (ev === 'back') { if (this.cur.id === 'scr-pause') App.resume(); else this.back(); }
  },

  // ---------- アクション ----------
  act(a, el) {
    const S = this.sel;
    switch (a) {
      case 'start': App.userStart(); Snd.play('select'); this.show('menu'); break;
      case 'battle': Snd.play('select'); this.mode = 'battle'; this.show('chars'); break;
      case 'training': {
        Snd.play('select'); this.mode = 'training';
        this.show('chars'); break;
      }
      case 'howto': Snd.play('select'); this.show('howto'); break;
      case 'settings': Snd.play('select'); this.show('settings'); break;
      case 'back': this.back(); break;
      case 'stock-': case 'stock+': {
        const i = STOCK_OPTS.indexOf(S.stocks), d = a.endsWith('+') ? 1 : -1;
        S.stocks = STOCK_OPTS[(i + d + STOCK_OPTS.length) % STOCK_OPTS.length]; Snd.play('move'); this.renderRules(); this.save(); break;
      }
      case 'time-': case 'time+': {
        const i = TIME_OPTS.indexOf(S.time), d = a.endsWith('+') ? 1 : -1;
        S.time = TIME_OPTS[(i + d + TIME_OPTS.length) % TIME_OPTS.length]; Snd.play('move'); this.renderRules(); this.save(); break;
      }
      case 'tostage': {
        const n = this.activeSlots().length;
        if (n < 2) { this.toast('2人以上で対戦できます'); Snd.play('back'); break; }
        Snd.play('select'); this.show('stages'); break;
      }
      case 'stage': {
        let id = el.dataset.id;
        if (id === 'random') id = choice(STAGES).id;
        S.stage = id; this.save(); Snd.play('select');
        App.startBattle(this.battleConfig());
        break;
      }
      case 'resume': App.resume(); break;
      case 'restart': App.restart(); break;
      case 'again': App.restart(); break;
      case 'tochars': App.quitBattle(); this.hist = ['title', 'menu']; this.show('chars', false); break;
      case 'totitle': App.quitBattle(); this.hist = []; this.show('title', false); break;
      default:
        if (a.startsWith('slot')) this.slotAct(a, el);
        else if (a.startsWith('pick')) this.pickChar(el.dataset.id);
        else if (a.startsWith('set')) this.settingAct(el.dataset.key, +el.dataset.d);
    }
  },
  toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.getElementById('ui').appendChild(t); Object.assign(t.style, { position: 'absolute', left: '50%', top: '18%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.85)', padding: '8px 18px', borderRadius: '20px', fontWeight: '800', pointerEvents: 'none', transition: 'opacity 0.3s' }); }
    t.textContent = msg; t.style.opacity = 1;
    clearTimeout(this._tt); this._tt = setTimeout(() => { t.style.opacity = 0; }, 1600);
  },

  // ---------- キャラ選択 ----------
  activeSlots() { return this.sel.slots.map((s, i) => Object.assign({ i }, s)).filter((s) => s.type !== 'off'); },
  battleConfig() {
    const S = this.sel;
    const training = this.mode === 'training';
    const used = new Set(S.slots.filter((s) => s.type === 'human').map((s) => s.ctrl));
    const players = [];
    const taken = {};
    S.slots.forEach((s, i) => {
      if (s.type === 'off') return;
      let ch = s.char;
      if (ch === 'random') ch = choice(CHARS).id;
      let pal = s.pal;
      const key = ch + ':' + pal;
      if (taken[key]) { const c = CHARS.find((c) => c.id === ch); for (let k = 0; k < c.pals.length; k++) if (!taken[ch + ':' + k]) { pal = k; break; } }
      taken[ch + ':' + pal] = true;
      let src;
      if (s.type === 'cpu') src = new CpuSource();
      else if (s.ctrl === 'touch') src = new TouchSource();
      else if (s.ctrl === 'kb1') src = new KeyboardSource(used.has('kb2') ? [KB_LAYOUTS.kb1] : [KB_LAYOUTS.kb1, KB_LAYOUTS.kb1solo]);
      else if (s.ctrl === 'kb2') src = new KeyboardSource([KB_LAYOUTS.kb2]);
      else src = new GamepadSource(+s.ctrl.slice(3) - 1);
      players.push({ slot: i, char: ch, pal, source: src, level: training && s.type === 'cpu' ? 0 : s.level });
    });
    return { players, stage: S.stage, stocks: training ? 0 : S.stocks, time: training ? 0 : S.time, training };
  },
  buildRoster() {
    const R = document.getElementById('roster');
    R.innerHTML = '';
    const list = [...CHARS, { id: 'random', name: 'ランダム' }];
    for (const c of list) {
      const b = document.createElement('button');
      b.className = 'btn card'; b.dataset.act = 'pick'; b.dataset.id = c.id;
      b.innerHTML = `<canvas width="128" height="134"></canvas><div class="marks"></div><div class="nm">${c.name}</div>`;
      R.appendChild(b); this.bind(b);
      const cv = b.querySelector('canvas'), ctx = cv.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 0, 134);
      if (c.id === 'random') {
        g.addColorStop(0, '#3a3a5a'); g.addColorStop(1, '#151525'); ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 134);
        ctx.font = '72px "Dela Gothic One", sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('?', 64, 92);
      } else {
        g.addColorStop(0, shade(c.pals[0].main, -0.1)); g.addColorStop(1, shade(c.pals[0].main, -0.7));
        ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 134);
        drawPortrait(ctx, c, 0, 64, 62, 110);
      }
    }
  },
  renderRules() {
    const S = this.sel;
    const tr = this.mode === 'training';
    document.getElementById('r-stock').textContent = tr ? '∞' : S.stocks === 0 ? '∞' : S.stocks;
    document.getElementById('r-time').textContent = tr ? 'なし' : S.time === 0 ? 'なし' : S.time + '分';
    document.querySelector('#scr-chars .rules').style.visibility = tr ? 'hidden' : 'visible';
    document.querySelector('#scr-chars h2').textContent = tr ? 'トレーニング' : 'キャラクター選択';
  },
  renderChars() {
    const S = this.sel;
    if (this.mode === 'training') {
      S.slots[0].type = 'human';
      if (S.slots[1].type === 'off') S.slots[1].type = 'cpu';
    }
    this.renderRules();
    const box = document.getElementById('slots');
    box.innerHTML = '';
    this.pv = [];
    S.slots.forEach((s, i) => {
      const d = document.createElement('div');
      d.className = 'slot' + (i === S.active ? ' active' : '') + (s.type === 'off' ? ' off' : '');
      const col = PLAYER_COLORS[i];
      const c = CHARS.find((ch) => ch.id === s.char);
      const tag = s.type === 'human' ? PLAYER_TAGS[i] : s.type === 'cpu' ? 'CPU' : '---';
      const ctrlName = { touch: 'タッチ', kb1: 'キーボード1', kb2: 'キーボード2', pad1: 'パッド1', pad2: 'パッド2', pad3: 'パッド3', pad4: 'パッド4' }[s.ctrl];
      d.innerHTML = `
        <div class="hd" style="background:${s.type === 'off' ? '#333' : col}"><span>${tag}</span><span style="font-size:11px;font-family:var(--font)">${s.type === 'cpu' ? 'Lv.' + (this.mode === 'training' ? '0' : s.level) : s.type === 'human' ? ctrlName : ''}</span></div>
        <div class="pv">${s.type === 'off' ? '<div class="off-msg">参加しない</div>' : '<canvas></canvas>'}
          ${s.type !== 'off' ? `<div class="info"><div class="n">${c ? c.name : 'ランダム'}</div><div class="t">${c ? c.title + '・' + c.type : '？？？'}</div></div>` : ''}</div>
        <div class="ctl">
          <button class="btn" data-act="slot-type" data-i="${i}">${s.type === 'human' ? 'プレイヤー' : s.type === 'cpu' ? 'CPU' : 'なし'}</button>
          ${s.type !== 'off' ? `<button class="btn" data-act="slot-prev" data-i="${i}">◀</button><button class="btn" data-act="slot-next" data-i="${i}">▶</button><button class="btn" data-act="slot-pal" data-i="${i}">色</button>` : ''}
          ${s.type === 'cpu' && this.mode !== 'training' ? `<button class="btn" data-act="slot-lv-" data-i="${i}">Lv-</button><button class="btn" data-act="slot-lv+" data-i="${i}">Lv+</button>` : ''}
          ${s.type === 'human' ? `<button class="btn" data-act="slot-ctrl" data-i="${i}">操作切替</button>` : ''}
        </div>`;
      d.addEventListener('click', () => { if (S.active !== i) { S.active = i; this.renderChars(); } });
      box.appendChild(d);
      d.querySelectorAll('[data-act]').forEach((el) => this.bind(el));
      const cv = d.querySelector('canvas');
      if (cv && c) this.pv[i] = { cv, f: this.makePreview(c, s.pal, i), c };
      else if (cv) this.pv[i] = { cv, f: null };
    });
    // ロースターのマーク
    document.querySelectorAll('#roster .card').forEach((card) => {
      const m = card.querySelector('.marks'); m.innerHTML = '';
      S.slots.forEach((s, i) => { if (s.type !== 'off' && s.char === card.dataset.id) m.innerHTML += `<i style="background:${PLAYER_COLORS[i]}">${s.type === 'cpu' ? 'C' : i + 1}</i>`; });
    });
    this.save();
  },
  makePreview(c, pal, slot) {
    const f = new Fighter(STUB_BATTLE, slot, c, pal, { type: 'pv' }, {});
    f.state = 'idle'; f.grounded = true; f.facing = 1; f.x = 0; f.y = 0;
    f.updatePose(true);
    f.pvNext = 50 + slot * 20;
    return f;
  },
  slotAct(a, el) {
    const S = this.sel, i = +el.dataset.i, s = S.slots[i];
    S.active = i;
    const ci = CHARS.findIndex((c) => c.id === s.char);
    switch (a) {
      case 'slot-type': {
        const order = this.mode === 'training' ? (i === 0 ? ['human'] : ['cpu', 'off']) : ['human', 'cpu', 'off'];
        s.type = order[(order.indexOf(s.type) + 1) % order.length];
        if (s.type === 'human') {
          const used = S.slots.filter((o, k) => k !== i && o.type === 'human').map((o) => o.ctrl);
          if (used.includes(s.ctrl)) s.ctrl = this.ctrlList().find((c) => !used.includes(c)) || s.ctrl;
        }
        break;
      }
      case 'slot-prev': case 'slot-next': {
        const list = [...CHARS.map((c) => c.id), 'random'];
        const k = list.indexOf(s.char) < 0 ? 0 : list.indexOf(s.char);
        s.char = list[(k + (a === 'slot-next' ? 1 : -1) + list.length) % list.length];
        break;
      }
      case 'slot-pal': { const c = CHARS[ci] || CHARS[0]; s.pal = (s.pal + 1) % c.pals.length; break; }
      case 'slot-lv-': s.level = Math.max(1, s.level - 1); break;
      case 'slot-lv+': s.level = Math.min(9, s.level + 1); break;
      case 'slot-ctrl': {
        const L = this.ctrlList(); s.ctrl = L[(L.indexOf(s.ctrl) + 1) % L.length]; break;
      }
    }
    Snd.play('move');
    const act = a;
    this.renderChars();
    // フォーカスを同じボタンへ戻す
    const again = document.querySelector(`#slots [data-act="${act}"][data-i="${i}"]`) || document.querySelector(`#slots [data-act="slot-type"][data-i="${i}"]`);
    this.setFocus(again, true);
  },
  ctrlList() {
    const L = [];
    if (IS_TOUCH) L.push('touch');
    L.push('kb1', 'kb2', 'pad1', 'pad2', 'pad3', 'pad4');
    return L;
  },
  pickChar(id) {
    const S = this.sel;
    let s = S.slots[S.active];
    if (s.type === 'off') s.type = S.active === 0 ? 'human' : 'cpu';
    s.char = id;
    Snd.play('select');
    // 次の空きスロットへ（CPUの設定を早く済ませられるように）
    this.renderChars();
    const card = document.querySelector(`#roster [data-id="${id}"]`);
    this.setFocus(card, true);
  },
  tickPreviews() {
    if (!this.cur || this.cur.id !== 'scr-chars') return;
    this.pvT++;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const p of this.pv) {
      if (!p) continue;
      const cv = p.cv, w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) continue;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const ctx = cv.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      const f = p.f;
      if (!f) continue;
      f.anim++;
      if (f.state === 'attack') {
        f.moveFrame++;
        if (f.moveFrame > f.move.dur) { f.state = 'idle'; f.move = null; f.beginBlend(6); }
      } else if (--f.pvNext <= 0) {
        const ms = ['fsmash', 'usmash', 'dsmash', 'ftilt', 'utilt', 'jab3', 'sspec', 'nspec'];
        const name = choice(ms);
        const m = f.char.moves[name];
        if (m && !m.chargeShot) { f.state = 'attack'; f.move = m; f.moveFrame = 0; f.charge = 0; f.trail.length = 0; f.beginBlend(3); }
        f.pvNext = randi(120, 220);
      }
      f.updatePose(); f.updateRibbons();
      const sc = Math.min(h / 150, w / 110);
      ctx.setTransform(sc * dpr, 0, 0, sc * dpr, cv.width / 2, cv.height * 0.92);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 2, 34, 7, 0, 0, TAU); ctx.fill();
      drawTrail(ctx, f);
      drawFighter(ctx, f);
    }
  },

  // ---------- ステージ選択 ----------
  buildStages() {
    const box = document.getElementById('stagelist');
    if (box.childElementCount) { this.bindStageFocus(); return; }
    const list = [...STAGES, { id: 'random', name: 'ランダム', desc: 'どこになるかはお楽しみ' }];
    for (const s of list) {
      const b = document.createElement('button');
      b.className = 'btn stage-card'; b.dataset.act = 'stage'; b.dataset.id = s.id;
      b.innerHTML = `<canvas width="400" height="200"></canvas><div class="sn">${s.name}</div><div class="sd">${s.desc}</div>`;
      box.appendChild(b); this.bind(b);
      const cv = b.querySelector('canvas'), ctx = cv.getContext('2d');
      if (s.id === 'random') {
        const g = ctx.createLinearGradient(0, 0, 400, 200); g.addColorStop(0, '#3a2a6a'); g.addColorStop(1, '#101020');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 400, 200);
        ctx.font = '90px "Dela Gothic One", sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('?', 200, 135);
      } else {
        const st = new Stage(s, 'low');
        st.t = 100;
        const cam = { x: 0, y: -110, zoom: 0.95 };
        st.drawBg(ctx, cam, 400, 200, 200 / 720);
        const z = cam.zoom * 200 / 720;
        ctx.setTransform(z, 0, 0, z, 200 - cam.x * z, 100 - cam.y * z);
        st.drawStage(ctx);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
    }
  },
  bindStageFocus() {
    const cur = document.querySelector(`#stagelist [data-id="${this.sel.stage}"]`);
    if (cur) this.setFocus(cur, true);
  },

  // ---------- 結果 ----------
  showResults(res) {
    this.hist = ['title', 'menu', 'chars'];
    this.show('result', false);
    const w = res.order[0];
    const nm = document.getElementById('win-name');
    nm.textContent = `${w.tag} ${w.char.name} の勝利！`;
    nm.style.color = w.color;
    document.getElementById('scr-result').style.setProperty('--wc', shade(w.pal.main, -0.25));
    const tb = document.getElementById('rank');
    let h = '<tr><th>順位</th><th>プレイヤー</th><th>撃墜</th><th>落下</th><th>与ダメ</th><th>最大コンボ</th></tr>';
    res.order.forEach((f, i) => {
      h += `<tr><td class="pl">${i + 1}</td><td class="pl" style="color:${f.color}">${f.tag} ${f.char.name}</td><td>${f.stats.kos}</td><td>${f.stats.falls}</td><td>${Math.round(f.stats.dmg)}%</td><td>${f.stats.maxCombo}</td></tr>`;
    });
    tb.innerHTML = h;
    this.winF = this.makePreview(w.char, w.palIdx, 0);
    this.winF.winT = 0;
    Snd.playBgm('result'); Snd.play('fanfare');
  },
  tickWinner() {
    if (!this.cur || this.cur.id !== 'scr-result' || !this.winF) return;
    const cv = document.getElementById('win-canvas'), ctx = cv.getContext('2d');
    const f = this.winF;
    f.anim++; f.winT++;
    const seq = ['usmash', 'fsmash'];
    if (f.state !== 'attack' && f.winT % 150 === 30) { f.state = 'attack'; f.move = f.char.moves[seq[Math.floor(f.winT / 150) % 2]]; f.moveFrame = 0; f.trail.length = 0; f.beginBlend(3); }
    if (f.state === 'attack') { f.moveFrame++; if (f.moveFrame > f.move.dur) { f.state = 'idle'; f.move = null; f.beginBlend(6); } }
    f.updatePose(); f.updateRibbons();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 360, 360);
    const g = ctx.createRadialGradient(180, 220, 10, 180, 220, 180);
    g.addColorStop(0, rgba(f.pal.main, 0.6)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 360, 360);
    // 集中線
    ctx.save(); ctx.translate(180, 200); ctx.rotate(f.anim * 0.004);
    const rg = ctx.createRadialGradient(0, 0, 20, 0, 0, 175);
    rg.addColorStop(0, 'rgba(255,255,255,0.14)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg;
    for (let i = 0; i < 16; i++) { ctx.rotate(TAU / 16); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(300, -14); ctx.lineTo(300, 14); ctx.fill(); }
    ctx.restore();
    const sc = 2.1 / Math.max(1, f.scale * 0.95);
    ctx.setTransform(sc, 0, 0, sc, 180, 320);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 2, 40, 8, 0, 0, TAU); ctx.fill();
    drawTrail(ctx, f); drawFighter(ctx, f);
  },

  // ---------- 遊び方 ----------
  buildHowto() {
    const chars = CHARS.map((c) => `<div><b style="color:${c.pals[0].main}">${c.name}</b>（${c.title}／${c.type}）<br><span class="desc">${c.desc}</span><br>
      <small>通常必殺: ${c.specialNames.n}　横: ${c.specialNames.s}<br>上: ${c.specialNames.u}　下: ${c.specialNames.d}</small></div>`).join('');
    document.getElementById('howto-doc').innerHTML = `
      <h3>ルール</h3>
      攻撃を当てると相手の<b>ダメージ％</b>が増え、％が高いほど遠くへ吹っ飛びます。相手をステージの外へふっとばせば<b>撃墜</b>！
      ストックが無くなったら負け。最後まで残った人の勝利です。崖につかまったり、空中ジャンプや上必殺技でステージへ戻りましょう。
      <h3>操作（タッチ）</h3>
      <table><tr><th>左半分をドラッグ</th><td>移動（はじくとダッシュ）／ 下はじきで足場すり抜け・急降下</td></tr>
      <tr><th>攻撃</th><td>弱攻撃・強攻撃（スティック方向で変化）。空中なら空中攻撃</td></tr>
      <tr><th>スマッシュ</th><td>スマッシュ攻撃（長押しでため）。スティックをはじいて攻撃でもOK</td></tr>
      <tr><th>必殺</th><td>必殺技（ニュートラル・横・上・下の4種）</td></tr>
      <tr><th>ジャンプ</th><td>ジャンプ（短く押すと小ジャンプ）。空中でもう一度押すと空中ジャンプ</td></tr>
      <tr><th>ガード</th><td>ガード。ガード中にスティックで回避、空中で押すと空中回避</td></tr>
      <tr><th>つかみ</th><td>つかんでから方向で投げ（ガード＋攻撃でもOK）</td></tr></table>
      <h3>操作（キーボード）</h3>
      <table><tr><th></th><th>キーボード1</th><th>キーボード2</th></tr>
      <tr><td>移動</td><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>（1人の時は矢印キーも可）</td><td>矢印キー</td></tr>
      <tr><td>攻撃</td><td><kbd>J</kbd>（1人の時は<kbd>Z</kbd>も可）</td><td><kbd>,</kbd> / テンキー<kbd>1</kbd></td></tr>
      <tr><td>必殺</td><td><kbd>K</kbd>（<kbd>X</kbd>）</td><td><kbd>.</kbd> / テンキー<kbd>2</kbd></td></tr>
      <tr><td>ジャンプ</td><td><kbd>L</kbd> / <kbd>Space</kbd>（<kbd>C</kbd>）</td><td><kbd>/</kbd> / テンキー<kbd>3</kbd></td></tr>
      <tr><td>ガード・回避</td><td><kbd>I</kbd> / <kbd>左Shift</kbd>（<kbd>V</kbd>）</td><td><kbd>右Shift</kbd> / テンキー<kbd>0</kbd></td></tr>
      <tr><td>スマッシュ</td><td><kbd>U</kbd>（<kbd>N</kbd>）／ 方向と攻撃を同時押し</td><td><kbd>M</kbd> / テンキー<kbd>4</kbd></td></tr>
      <tr><td>つかみ</td><td><kbd>O</kbd>（<kbd>B</kbd>）</td><td><kbd>;</kbd> / テンキー<kbd>5</kbd></td></tr>
      <tr><td>ポーズ</td><td colspan="2"><kbd>Esc</kbd></td></tr></table>
      <h3>操作（ゲームパッド）</h3>
      左スティック/十字キー: 移動　A: 攻撃　B: 必殺　X・Y: ジャンプ　LB・RB: つかみ　LT・RT: ガード　右スティック: スマッシュ　START: ポーズ
      <h3>テクニック</h3>
      ・ふっとばされた時、スティックを倒すと飛ぶ方向を少しずらせます（ずらし）。<br>
      ・ふっとんで地面に落ちる瞬間にガードで<b>受け身</b>。<br>
      ・崖につかまった後は、上/前で登る・ジャンプ・攻撃・ガード（転がり）で崖上がりできます。<br>
      ・スマッシュ攻撃はボタン長押しでためるほど強くなります。
      <h3>キャラクター</h3><div class="chars-doc">${chars}</div>`;
  },

  // ---------- 設定 ----------
  settingDefs() {
    return [
      { key: 'sfx', name: '効果音の音量', vals: [0, 2, 4, 6, 8, 10], fmt: (v) => v },
      { key: 'bgm', name: 'BGMの音量', vals: [0, 2, 4, 6, 8, 10], fmt: (v) => v },
      { key: 'quality', name: '画質', vals: ['high', 'low'], fmt: (v) => (v === 'high' ? '高' : '軽量') },
      { key: 'shake', name: '画面の揺れ', vals: [true, false], fmt: (v) => (v ? 'ON' : 'OFF') },
      { key: 'touchSize', name: 'タッチボタンの大きさ', vals: [0.85, 1, 1.15, 1.3], fmt: (v) => ({ 0.85: '小', 1: '中', 1.15: '大', 1.3: '特大' }[v]) },
      { key: 'debug', name: '当たり判定の表示', vals: [false, true], fmt: (v) => (v ? 'ON' : 'OFF') },
    ];
  },
  buildSettings() {
    const box = document.getElementById('settings-list');
    box.innerHTML = '';
    for (const d of this.settingDefs()) {
      const row = document.createElement('div'); row.className = 'set-row';
      row.innerHTML = `<span>${d.name}</span><button class="btn sm" data-act="set" data-key="${d.key}" data-d="-1">◀</button><b id="set-${d.key}">${d.fmt(App.settings[d.key])}</b><button class="btn sm" data-act="set" data-key="${d.key}" data-d="1">▶</button>`;
      box.appendChild(row);
      row.querySelectorAll('[data-act]').forEach((el) => this.bind(el));
    }
  },
  settingAct(key, d) {
    const def = this.settingDefs().find((x) => x.key === key);
    const i = def.vals.indexOf(App.settings[key]);
    const v = def.vals[(Math.max(0, i) + d + def.vals.length) % def.vals.length];
    App.settings[key] = v;
    document.getElementById('set-' + key).textContent = def.fmt(v);
    App.applySettings();
    Snd.play('move');
  },
};
