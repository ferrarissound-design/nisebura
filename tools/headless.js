// ヘッドレス実行用ローダー（DOM無しでゲームロジックを読み込む）
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function stubCtx() {
  const fn = () => {};
  const grad = { addColorStop: fn };
  return new Proxy({}, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'measureText') return () => ({ width: 10 });
      if (k in t) return t[k];
      return fn;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
function loadGame() {
  const ctx = {
    console, Math, JSON, Date, setInterval: () => 0, clearInterval: () => {}, Map, Set, Proxy, Array, Object, Number, String, Infinity, isFinite,
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => stubCtx() }) },
    navigator: { maxTouchPoints: 0 },
    localStorage: { getItem: () => null, setItem: () => {} },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const files = ['util', 'audio', 'input', 'skeleton', 'moves', 'characters', 'projectiles', 'effects', 'render-fighter', 'stages', 'ai', 'fighter', 'battle'];
  let src = '';
  for (const f of files) src += fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8') + '\n';
  src += '\nbuildChars(); for (const c of CHARS) buildAIData(c);\nthis.__exports = { CHARS, STAGES, Battle, CpuSource, Snd };';
  vm.runInContext(src, ctx, { filename: 'game.js' });
  return ctx.__exports;
}

module.exports = { loadGame };
