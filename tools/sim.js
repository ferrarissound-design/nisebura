// ヘッドレス対戦シミュレーター（CPU同士を高速に戦わせて不具合とバランスを検証する）
// 使い方: node tools/sim.js [試合数] [CPUレベル]
'use strict';
const { loadGame } = require('./headless');

const G = loadGame();
const N = +(process.argv[2] || 12);
const LV = +(process.argv[3] || 7);
const wins = {}, games = {}, sds = {}, kos = {};
let totalFrames = 0, timeouts = 0, totalSD = 0, totalKO = 0;
const koPercents = [];
for (const c of G.CHARS) { wins[c.id] = 0; games[c.id] = 0; sds[c.id] = 0; kos[c.id] = 0; }
const t0 = Date.now();
for (let g = 0; g < N; g++) {
  const n = 2 + (g % 3);
  const players = [];
  for (let i = 0; i < n; i++) {
    const c = G.CHARS[(g * 3 + i * 2) % G.CHARS.length];
    players.push({ slot: i, char: c.id, pal: i, source: new G.CpuSource(), level: LV });
  }
  const stage = G.STAGES[g % G.STAGES.length].id;
  const b = new G.Battle({ players, stage, stocks: 2, time: 0 }, { silent: true, quality: 'low' });
  b.phase = 'play';
  // 撃墜時の％を記録
  const origKo = b.ko.bind(b);
  b.ko = (f) => { koPercents.push(Math.round(f.percent)); origKo(f); };
  let fr = 0;
  while (!b.ended && fr < 60 * 60 * 6) {
    b.step(); fr++;
    if (b.phase === 'end' && b.phaseT > 5) break;
  }
  if (b.phase !== 'end') timeouts++;
  totalFrames += fr;
  const res = b.results();
  for (const f of b.fighters) {
    games[f.char.id]++; sds[f.char.id] += f.stats.sds; kos[f.char.id] += f.stats.kos;
    totalSD += f.stats.sds; totalKO += f.stats.kos;
  }
  if (b.phase === 'end') wins[res.order[0].char.id]++;
  console.log(`#${g} ${stage} ${players.map((p) => p.char).join(' vs ')} -> ${b.phase === 'end' ? res.order[0].char.id : 'TIMEOUT'} (${(fr / 60).toFixed(0)}s) SD:${b.fighters.map((f) => f.stats.sds).join(',')}`);
}
console.log('\n=== 結果 ===');
for (const id in wins) console.log(`${id.padEnd(6)} 勝ち ${wins[id]}/${games[id]}  撃墜 ${kos[id]}  自滅 ${sds[id]}`);
koPercents.sort((a, b) => a - b);
const med = koPercents[Math.floor(koPercents.length / 2)];
console.log(`平均試合時間 ${(totalFrames / N / 60).toFixed(1)}s, タイムアウト ${timeouts}, 撃墜% 中央値 ${med}, 自滅率 ${(totalSD / Math.max(1, totalSD + totalKO) * 100).toFixed(0)}%`);
console.log(`実行時間 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
