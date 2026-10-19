'use strict';
// タッチHUD: スマホ縦横・表示倍率で、ボタンとスティックが干渉しないことを確認。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '../js/input.js'), 'utf8');
const sandbox = { Math, Map, Set, clamp: (n, lo, hi) => Math.max(lo, Math.min(hi, n)), TAU: Math.PI * 2 };
vm.runInNewContext(code + '\nglobalThis.testTouch = Touch;', sandbox);
const Touch = sandbox.testTouch;

const sizes = [[280, 560], [320, 568], [375, 667], [393, 700], [430, 932],
  [667, 375], [844, 390], [1024, 768]];
const labels = ['j', 'a', 'b', 'm', 's', 'g'];
let checks = 0;

for (const [w, h] of sizes) {
  for (const scale of [0.85, 1, 1.15, 1.3]) {
    Touch.sizeMul = scale;
    Touch.layout(w, h);
    assert.deepEqual(Array.from(Touch.buttons, (b) => b.k), labels);
    assert(Touch.stickHome.x - Touch.stickR >= 0);
    assert(Touch.stickHome.y + Touch.stickR <= h);
    for (const b of Touch.buttons) {
      assert(b.x - b.r > 0 && b.x + b.r < w, `button ${b.k} x overflow at ${w}x${h}`);
      assert(b.y - b.r > 0 && b.y + b.r < h, `button ${b.k} y overflow at ${w}x${h}`);
      assert.equal(Touch.hitBtn(b.x, b.y).k, b.k, 'button center must hit itself');
      assert(b.x - b.r * 1.25 > Touch.stickHome.x + Touch.stickR,
        `stick and action hit areas overlap at ${w}x${h} scale=${scale}`);
    }
    for (let i = 0; i < Touch.buttons.length; i++) {
      for (let j = i + 1; j < Touch.buttons.length; j++) {
        const a = Touch.buttons[i], b = Touch.buttons[j];
        assert(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r,
          `visible action buttons overlap: ${a.k} ${b.k}`);
      }
    }
    // 描画と実際の押下判定が同じ座標を使っているか。
    Touch.canvas = { getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture() {} };
    Touch.active = true;
    Touch.reset();
    for (const [i, b] of Touch.buttons.entries()) {
      const e = { pointerId: i + 1, pointerType: 'touch', clientX: b.x, clientY: b.y, preventDefault() {} };
      Touch.down(e);
      assert.equal(Touch.read()[b.k], true, `missing action ${b.k}`);
      assert.equal(Touch.stick.id, null, 'action press must not steal the movement stick');
      Touch.up(e);
      assert.equal(Touch.read()[b.k], undefined, `stuck action ${b.k}`);
    }
    const stickEvent = { pointerId: 101, pointerType: 'touch',
      clientX: Touch.stickHome.x, clientY: Touch.stickHome.y, preventDefault() {} };
    Touch.down(stickEvent);
    assert.equal(Touch.stick.id, 101);
    Touch.move({ ...stickEvent, clientX: stickEvent.clientX + Touch.stickR / 2 });
    assert(Touch.read().x > 0);
    Touch.up(stickEvent);
    assert.equal(Touch.stick.id, null);
    checks++;
  }
}
console.log(`Touch HUD layout/input: ${checks} viewport/scale combinations passed`);
