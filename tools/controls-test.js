// キーボード操作で各アクションが出るかを実ブラウザで確認するテスト
'use strict';
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message + '\n' + e.stack));
  await page.goto(url);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    UI.sel.slots[0] = { type: 'human', char: 'blaze', pal: 0, level: 5, ctrl: 'kb1' };
    UI.sel.slots[1] = { type: 'cpu', char: 'goldo', pal: 0, level: 0, ctrl: 'kb2' };
    UI.sel.slots[2].type = 'off'; UI.sel.slots[3].type = 'off';
    UI.sel.stage = 'sky'; UI.mode = 'training';
    App.startBattle(UI.battleConfig());
    App.battle.phase = 'play';
    // 状態ログ
    window.__log = [];
    const f = App.battle.fighters[0];
    const orig = f.update.bind(f);
    f.update = () => { orig(); const s = f.state === 'attack' ? 'attack:' + f.move.name : f.state; if (window.__log[window.__log.length - 1] !== s) window.__log.push(s); };
  });
  const P = (k) => page.keyboard.down(k), R = (k) => page.keyboard.up(k);
  const wait = (ms) => page.waitForTimeout(ms);
  const reset = async () => {
    await wait(700);
    await page.evaluate(() => { const f = App.battle.fighters[0]; f.x = -150; f.y = 0; f.vx = 0; f.vy = 0; f.facing = 1; f.grounded = true; f.ground = App.battle.stage.main; f.setState('idle'); window.__log = []; const d = App.battle.fighters[1]; d.x = -60; d.y = 0; d.percent = 0; d.kvx = d.kvy = 0; d.setState('idle'); d.grounded = true; d.ground = App.battle.stage.main; });
    await wait(100);
  };
  const log = async (name, expect) => {
    const l = await page.evaluate(() => window.__log.slice());
    const ok = expect.every((e) => l.some((s) => s.includes(e)));
    console.log(`${ok ? 'OK  ' : 'NG  '} ${name.padEnd(22)} ${l.join(' > ')}`);
    return ok;
  };
  let pass = 0, total = 0;
  const T = async (name, expect, fn) => { await reset(); await fn(); await wait(500); total++; if (await log(name, expect)) pass++; };

  await T('歩き→走り', ['walk', 'dash', 'run'], async () => { await P('KeyD'); await wait(600); await R('KeyD'); });
  await T('弱攻撃連携', ['jab1', 'jab2', 'jab3'], async () => { for (let i = 0; i < 3; i++) { await P('KeyJ'); await wait(40); await R('KeyJ'); await wait(110); } });
  await T('横強（歩きながら）', ['ftilt'], async () => { await P('KeyD'); await wait(110); await P('KeyJ'); await wait(40); await R('KeyJ'); await R('KeyD'); });
  await T('横スマ（同時押し）', ['fsmash'], async () => { await P('KeyD'); await P('KeyJ'); await wait(60); await R('KeyJ'); await R('KeyD'); });
  await T('上スマ（スマッシュキー）', ['usmash'], async () => { await P('KeyW'); await wait(120); await P('KeyU'); await wait(40); await R('KeyU'); await R('KeyW'); });
  await T('下強', ['dtilt'], async () => { await P('KeyS'); await wait(150); await P('KeyJ'); await wait(40); await R('KeyJ'); await R('KeyS'); });
  await T('ジャンプ→空N', ['jumpsquat', 'air', 'nair'], async () => { await P('KeyL'); await wait(200); await R('KeyL'); await P('KeyJ'); await wait(40); await R('KeyJ'); });
  await T('小ジャンプ', ['jumpsquat', 'air'], async () => { await P('KeyL'); await wait(25); await R('KeyL'); });
  await T('空中ジャンプ', ['air'], async () => { await P('KeyL'); await wait(300); await R('KeyL'); await wait(100); await P('KeyL'); await wait(50); await R('KeyL'); });
  await T('通常必殺', ['nspec'], async () => { await P('KeyK'); await wait(40); await R('KeyK'); });
  await T('上必殺', ['uspec', 'helpless'], async () => { await P('KeyW'); await wait(60); await P('KeyK'); await wait(40); await R('KeyK'); await R('KeyW'); await wait(900); });
  await T('下必殺', ['dspec'], async () => { await P('KeyS'); await wait(60); await P('KeyK'); await wait(40); await R('KeyK'); await R('KeyS'); });
  await T('横必殺', ['sspec'], async () => { await P('KeyD'); await wait(60); await P('KeyK'); await wait(40); await R('KeyK'); await R('KeyD'); });
  await T('ガード', ['shield'], async () => { await P('KeyI'); await wait(300); await R('KeyI'); });
  await T('回避', ['roll'], async () => { await P('KeyI'); await wait(100); await P('KeyA'); await wait(60); await R('KeyA'); await R('KeyI'); });
  await T('つかみ→投げ', ['grab', 'hold', 'fthrow'], async () => { await page.evaluate(() => { App.battle.fighters[1].x = -110; }); await P('KeyO'); await wait(40); await R('KeyO'); await wait(300); await P('KeyD'); await wait(80); await R('KeyD'); });
  await T('空中回避', ['airdodge'], async () => { await P('KeyL'); await wait(200); await R('KeyL'); await P('KeyI'); await wait(40); await R('KeyI'); });
  await T('矢印+Z（ソロ配置）', ['ftilt'], async () => { await P('ArrowRight'); await wait(110); await P('KeyZ'); await wait(40); await R('KeyZ'); await R('ArrowRight'); });
  await T('ポーズ', [], async () => { await P('Escape'); await wait(50); await R('Escape'); });
  const paused = await page.evaluate(() => App.battle.paused && UI.cur && UI.cur.id);
  console.log('pause screen:', paused);
  console.log(`\n${pass}/${total} passed`);
  console.log(errs.length ? errs.join('\n') : 'no errors');
  await browser.close();
})();
