// index.html と全スクリプト・CSSを1つのHTMLにまとめる（配布・埋め込み用）
// 使い方: node tools/build-single.js <出力パス> [--fragment]
//   --fragment: <html><head><body> を含まない断片として出力する
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = process.argv[2] || path.join(root, 'dist', 'nisebura.html');
const fragment = process.argv.includes('--fragment');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, p) => `<style>\n${fs.readFileSync(path.join(root, p), 'utf8')}\n</style>`);
html = html.replace(/<script src="(js\/[^"]+)"><\/script>\n?/g, (_, p) => `<script>\n${fs.readFileSync(path.join(root, p), 'utf8')}\n</script>\n`);

if (fragment) {
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
    .replace(/<meta charset[^>]*>\n?/, '')
    .replace(/<meta name="viewport"[^>]*>\n?/, '');
  const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
  html = head.trim() + '\n' + body.trim() + '\n';
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${out} (${(html.length / 1024).toFixed(0)} KB)`);
