// 画面のスクリーンショットを撮って見た目を確認する
// 使い方: node tools/shots.js <出力フォルダ> [シナリオ]
'use strict';
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');

const out = process.argv[2] || 'shots';
const scen = process.argv[3] || 'all';
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch();
  const vw = +(process.env.VW || 1280), vh = +(process.env.VH || 720);
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, hasTouch: !!process.env.TOUCH, isMobile: !!process.env.TOUCH });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message + '\n' + e.stack));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push('console: ' + m.text()); });
  await page.goto(url);
  await page.waitForTimeout(1500);
  const shot = async (n) => { await page.screenshot({ path: path.join(out, n + '.png') }); };
  if (scen === 'all' || scen === 'menus') {
    await shot('01-title');
    await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    await shot('02-menu');
    await page.keyboard.press('Enter'); await page.waitForTimeout(800);
    await shot('03-chars');
    await page.evaluate(() => UI.act('tostage')); await page.waitForTimeout(500);
    await shot('04-stages');
  }
  if (scen === 'all' || scen === 'battle') {
    const st = process.env.STAGE || 'garden';
    await page.evaluate((st) => {
      UI.sel.slots[0].type = 'cpu'; UI.sel.slots[1].type = 'cpu'; UI.sel.slots[2].type = 'cpu'; UI.sel.slots[3].type = 'cpu';
      UI.sel.slots[0].char = 'blaze'; UI.sel.slots[1].char = 'goldo'; UI.sel.slots[2].char = 'myu'; UI.sel.slots[3].char = 'volty';
      UI.sel.slots.forEach((s) => { s.level = 9; });
      UI.sel.stage = st; UI.mode = 'battle';
      App.startBattle(UI.battleConfig());
    }, st);
    for (let i = 0; i < 6; i++) { await page.waitForTimeout(1600); await shot('05-battle-' + i); }
  }
  if (scen === 'poses') {
    // 各キャラの技ポーズ一覧
    await page.evaluate(() => {
      App.battle = null; App.demo = null; UI.hide();
      const cv = document.getElementById('game'); const ctx = cv.getContext('2d');
      window.__drawPoses = (cid, names) => {
        const c = CHARS.find((x) => x.id === cid);
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#556'; ctx.fillRect(0, 0, cv.width, cv.height);
        const cols = 8; let i = 0;
        for (const nm of names) {
          const m = c.moves[nm] || null;
          const f = new Fighter(STUB_BATTLE, 0, c, 0, { type: 'pv' }, {});
          f.x = 0; f.y = 0; f.facing = 1;
          if (m) { f.state = 'attack'; f.move = m; f.moveFrame = m.hb.length ? Math.round((m.hb[0].f[0] + m.hb[0].f[1]) / 2) : Math.round(m.dur / 3); }
          else { f.state = nm; f.sf = 5; f.vy = 3; }
          f.blendT = 99; f.updatePose(true);
          for (let k = 0; k < 30; k++) f.updateRibbons();
          const x = 80 + (i % cols) * 150, y = 150 + Math.floor(i / cols) * 175;
          ctx.setTransform(1, 0, 0, 1, x, y); ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.fillText(nm, -40, 20);
          ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-60, 0, 120, 2);
          ctx.setTransform(1, 0, 0, 1, x - f.x, y);
          drawFighter(ctx, f);
          f._hbs = []; const hbs = m ? f.activeHitboxes(f._hbs) : [];
          if (m) { f.hitlag = 0; f.state = 'attack'; for (const hb of m.hb) { if (f.moveFrame < hb.f[0] || f.moveFrame > hb.f[1]) continue; const p = hbPos(f.pts, hb, 1, f.scale, 0, 0, { x: 0, y: 0 }); ctx.fillStyle = hb.grab ? 'rgba(160,0,255,0.35)' : 'rgba(255,0,0,0.35)'; ctx.beginPath(); ctx.arc(p.x, p.y, hb.r * f.scale, 0, 6.3); ctx.fill(); } }
          i++;
        }
      };
    });
    const names = ['idle', 'walk', 'run', 'air', 'crouch', 'shield', 'ledge', 'down', 'jab1', 'jab2', 'jab3', 'ftilt', 'utilt', 'dtilt', 'dash', 'fsmash', 'usmash', 'dsmash', 'nair', 'fair', 'bair', 'uair', 'dair', 'grab', 'nspec', 'sspec', 'uspec', 'dspec', 'fthrow', 'bthrow', 'hitstun', 'tumble'];
    for (const cid of (process.env.CHARS || 'blaze,goldo,myu,volty,luna').split(',')) {
      await page.evaluate(([cid, names]) => window.__drawPoses(cid, names), [cid, names]);
      await shot('pose-' + cid);
    }
  }
  if (scen === 'closeup') {
    // 全キャラの拡大図（待機・攻撃・被弾・空中）と顔アイコン
    await page.evaluate(() => {
      App.battle = null; App.demo = null; UI.hide();
      const cv = document.getElementById('game'); const ctx = cv.getContext('2d');
      window.__closeup = (palIdx, only) => {
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#4a4e66'; ctx.fillRect(0, 0, cv.width, cv.height);
        const sts = [['idle', null], ['attack', 'fsmash'], ['hitstun', null], ['air', 'nair']];
        const list = only ? CHARS.filter((c) => c.id === only) : CHARS;
        const k = only ? 3.2 : 1.5, dx = only ? 300 : 250, dy = only ? 0 : 290;
        list.forEach((c, ci) => {
          sts.forEach(([st, mv], si) => {
            const f = new Fighter(STUB_BATTLE, 0, c, palIdx, { type: 'pv' }, {});
            f.x = 0; f.y = 0; f.facing = si === 3 ? -1 : 1; f.grounded = st !== 'air';
            const m = mv && c.moves[mv];
            if (m) { f.state = 'attack'; f.move = m; f.moveFrame = m.hb.length ? m.hb[0].f[0] : Math.round(m.dur / 3); } else { f.state = st; f.sf = 5; f.vy = 3; }
            f.blendT = 99; f.updatePose(true);
            for (let k = 0; k < 40; k++) { f.anim++; f.updateRibbons(); }
            const x = only ? 170 + si * dx : 70 + ci * dx + (si % 2) * 120, y = only ? 560 : 250 + Math.floor(si / 2) * dy;
            ctx.setTransform(k, 0, 0, k, x, y);
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 1, 26, 5, 0, 0, 6.3); ctx.fill();
            drawFighter(ctx, f);
          });
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          if (!only) drawPortrait(ctx, c, palIdx, 120 + ci * 250, 62, 100);
        });
      };
    });
    for (const p of [0, 1, 2, 3]) { await page.evaluate((p) => window.__closeup(p), p); await shot('closeup-' + p); }
    for (const c of ['blaze', 'goldo', 'myu', 'volty', 'luna']) { await page.evaluate((c) => window.__closeup(0, c), c); await shot('zoom-' + c); }
  }
  if (scen === 'faces') {
    // 顔の拡大（表情ごと）
    await page.evaluate(() => {
      App.battle = null; App.demo = null; UI.hide();
      const cv = document.getElementById('game'); const ctx = cv.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#4a4e66'; ctx.fillRect(0, 0, cv.width, cv.height);
      const moods = [{ state: 'idle' }, { state: 'idle', blink: -2 }, { state: 'attack', move: { kind: 'tilt' } }, { state: 'attack', move: { kind: 'smash' } }, { state: 'hitstun' }];
      CHARS.forEach((c, ci) => moods.forEach((m, mi) => {
        const f = { char: c, pal: c.pals[0], facing: 1, scale: 1, anim: 30, blink: 100, flash: 0, sf: 0, pts: newPts(), invuln: 0, ...m };
        solveSkeleton(c.stance, c.prop, 0, 0, 1, 1, f.pts);
        const k = 128 / (c.prop.head * 2.6);
        ctx.setTransform(k, 0, 0, k, 90 + mi * 230, 80 + ci * 140); ctx.translate(-f.pts.head.x, -f.pts.head.y);
        CHAR_DRAW[c.id].head(ctx, f, f.pts, c.prop.head, f.pal, 1);
      }));
    });
    await shot('faces');
  }
  console.log(errs.length ? errs.join('\n') : 'no errors');
  await browser.close();
})();
