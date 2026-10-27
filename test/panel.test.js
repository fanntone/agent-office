'use strict';

// public/panel.js (what the detail card says) and Draw.hit (who a click lands on).
// Expected values are written by hand.
const assert = require('assert');
globalThis.World = require('../public/world.js');
const Panel = require('../public/panel.js');
globalThis.Panel = Panel;
require('../public/draw.js');
const Draw = globalThis.Draw;

let passed = 0, failed = 0;
function run(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`FAIL  ${name}\n      ${err.message}`);
    failed++;
  }
}
const NOW = new Date(2026, 9, 27, 11, 30, 0).getTime();
const at = (h, m, s) => new Date(2026, 9, 27, h, m, s).getTime();

run('ago: just now, seconds, minutes, hours', () => {
  assert.strictEqual(Panel.ago(NOW - 4000, NOW), '剛剛');
  assert.strictEqual(Panel.ago(NOW - 42000, NOW), '42 秒前');
  assert.strictEqual(Panel.ago(NOW - 7 * 60000 - 5000, NOW), '7 分鐘前');
  assert.strictEqual(Panel.ago(NOW - 75 * 60000, NOW), '1 小時前');
  assert.strictEqual(Panel.ago(NOW + 5000, NOW), '剛剛', 'a clock a little ahead is not "in the future"');
});

run('clock: local time with seconds', () => {
  assert.strictEqual(Panel.clock(at(9, 5, 7)), '09:05:07');
  assert.strictEqual(Panel.clock(at(23, 59, 0)), '23:59:00');
});

run('nameOf: kind and project', () => {
  assert.strictEqual(Panel.nameOf({ kind: 'claude', project: '五子棋' }), 'Claude · 五子棋');
  assert.strictEqual(Panel.nameOf({ kind: 'strata', project: null }), 'Strata');
});

run('a person\'s card: who, state, model, last step, and the recent actions newest first', () => {
  const card = Panel.describe({ kind: 'claude', project: '五子棋', model: 'claude-opus-5-5', state: 'tool',
    activity: 'Bash：Run tests', lastAt: NOW - 42000,
    recent: [{ at: at(11, 29, 18), text: 'Bash：Run tests' }, { at: at(11, 28, 2), text: 'Read：game.js' }] }, NOW);
  assert.deepStrictEqual(card, {
    title: 'Claude · 五子棋', kind: 'claude',
    lines: [['狀態', '用工具'], ['正在', 'Bash：Run tests'], ['模型', 'claude-opus-5-5'], ['上次動作', '42 秒前']],
    recent: [{ time: '11:29:18', text: 'Bash：Run tests' }, { time: '11:28:02', text: 'Read：game.js' }],
    empty: '還沒有動作紀錄',
  });
});

run('a card for someone with nothing recorded, unknown model, leaving', () => {
  const card = Panel.describe({ kind: 'strata', project: 'x', model: null, state: 'leaving', activity: '下班囉',
    lastAt: NOW, recent: [] }, NOW);
  assert.deepStrictEqual(card.lines, [['狀態', '下班囉'], ['正在', '下班囉'], ['模型', '—'], ['上次動作', '剛剛']]);
  assert.deepStrictEqual(card.recent, []);
});

run('the robot\'s card: the server\'s state and GPU temperature', () => {
  assert.deepStrictEqual(Panel.describeRobot({ state: 'generating', activity: '寫字中 41.3 tok/s', gpuTemp: 61 }), {
    title: 'Strata 伺服器', kind: 'server',
    lines: [['狀態', '寫字中'], ['正在', '寫字中 41.3 tok/s'], ['GPU 溫度', '61°C']],
    recent: [], empty: '',
  });
  assert.deepStrictEqual(Panel.describeRobot({ state: 'offline', activity: '沒開機', gpuTemp: null }).lines,
    [['狀態', '沒開機'], ['正在', '沒開機'], ['GPU 溫度', '—']]);
});

run('hit: the person under the click; the nearer one when two overlap; the robot; nothing', () => {
  // screen boxes as draw() leaves them: x is the centre, y the top of the bubble anchor, footY the feet
  const a = { id: 'a', screen: { x: 100, y: 40, footY: 100 } };
  const b = { id: 'b', screen: { x: 110, y: 70, footY: 130 } };       // in front of a, overlapping it
  const office = { characters: () => [a, b], robot: { screen: { x: 300, y: 20, footY: 110 } } };
  assert.strictEqual(Draw.hit(office, 100, 60), a, 'only a there');
  assert.strictEqual(Draw.hit(office, 105, 90), b, 'both: b is nearer');
  assert.strictEqual(Draw.hit(office, 300, 90), office.robot, 'the robot');
  assert.strictEqual(Draw.hit(office, 200, 90), null, 'empty floor');
  assert.strictEqual(Draw.hit(office, 100, 20), null, 'above a\'s head');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
