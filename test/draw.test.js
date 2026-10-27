'use strict';

// public/draw.js: the whole scene draws without throwing for every pose, by day and by night, and the
// windows show the sky for the hour. Looks are checked by eye with tools/screenshot.js; this guards the code.
const assert = require('assert');
globalThis.World = require('../public/world.js');
globalThis.Panel = require('../public/panel.js');
const { Office } = require('../public/sim.js');
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

// a canvas context that accepts every call and property, counting the calls
function fakeContext() {
  const ctx = { calls: 0 };
  return new Proxy(ctx, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'measureText') return (s) => ({ width: String(s).length * 7 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
      return () => { target.calls++; };
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}

const agent = (id, state, kind = 'claude') => ({ id, kind, project: 'p', model: null, state, activity: state, recent: [], lastAt: 0 });
function rng() { let s = 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

run('the scene draws everyone, in every state, by day and by night', () => {
  const o = new Office({ rng: rng() });
  // with real tool names, so the typing and the reading hands both get drawn
  const agents = [{ ...agent('a', 'tool'), activity: 'Bash：npm test' }, { ...agent('r', 'tool', 'strata'), activity: 'Read：SPEC.md' },
    agent('b', 'thinking', 'strata'), agent('c', 'sleeping'), agent('d', 'waiting', 'strata')];
  for (let i = 0; i < 9; i++) agents.push(agent(`x${i}`, i % 2 ? 'tool' : 'sleeping'));   // more than there are desks
  o.update({ at: 0, server: { state: 'generating', activity: '寫字中', gpuTemp: 60 }, agents });
  for (let t = 0; t < 3; t += 0.05) o.step(0.05);
  for (const hour of [3, 6, 12, 18, 21]) {
    const ctx = fakeContext();
    Draw.draw(ctx, o, new Date(2026, 9, 27, hour, 15).getTime(), 'a');
    assert.ok(ctx.calls > 500, `drew something at ${hour}:15 (${ctx.calls} calls)`);
    for (const c of o.characters()) assert.ok(c.screen, `${c.id} was placed on screen`);
  }
});

run('skyAt: dawn, day, dusk and night by the hour', () => {
  assert.deepStrictEqual([5, 6, 7, 12, 16, 17, 18, 19, 23, 0].map(Draw.skyAt),
    ['night', 'dawn', 'day', 'day', 'day', 'dusk', 'dusk', 'night', 'night', 'night']);
});

run('tally: the whiteboard counts who works, who waits for you and who sleeps', () => {
  const people = ['tool', 'thinking', 'tool', 'waiting', 'sleeping', 'leaving'].map((state, i) => ({ id: `p${i}`, state }));
  assert.deepStrictEqual(Draw.tally(people), { working: 3, waiting: 1, sleeping: 1 });
  assert.deepStrictEqual(Draw.tally([]), { working: 0, waiting: 0, sleeping: 0 });
});

run('deskItems: two things per desk, the same every time, and the desks are not all alike', () => {
  const sets = World.DESKS.map((_, i) => Draw.deskItems(i));
  for (const s of sets) assert.strictEqual(s.length, 2);
  assert.deepStrictEqual(World.DESKS.map((_, i) => Draw.deskItems(i)), sets, 'repeatable');
  assert.ok(new Set(sets.map((s) => s.join('+'))).size >= 6, `at least 6 different desks of 9: ${sets.map((s) => s.join('+'))}`);
});

run('lookOf: the same id always looks the same; across ids every skin, hairstyle and glasses turn up', () => {
  assert.deepStrictEqual(Draw.lookOf('527d12f4-aa'), Draw.lookOf('527d12f4-aa'));
  const looks = Array.from({ length: 50 }, (_, i) => Draw.lookOf(`session-${i}-${i * 7919}`));
  assert.strictEqual(new Set(looks.map((l) => l.skin)).size, 5, 'five skin tones');
  assert.deepStrictEqual([...new Set(looks.map((l) => l.hairStyle))].sort(), ['bun', 'fringe', 'long', 'side']);
  assert.deepStrictEqual([...new Set(looks.map((l) => l.glasses))].sort(), [false, true]);
});

run('workPose: typing for most tools, reading for the ones that look things up, only while seated', () => {
  const at = (pose, state, activity) => Draw.workPose({ pose, state, activity });
  assert.strictEqual(at('sit', 'tool', 'Bash：Run tests'), 'type');
  assert.strictEqual(at('sit', 'tool', 'Edit：draw.js'), 'type');
  assert.strictEqual(at('sit', 'tool', 'TodoWrite'), 'type');
  assert.strictEqual(at('sit', 'tool', 'Read：SPEC.md'), 'read');
  assert.strictEqual(at('sit', 'tool', 'Grep：kindOf'), 'read');
  assert.strictEqual(at('sit', 'tool', 'WebFetch：github.com'), 'read');
  assert.strictEqual(at('sit', 'thinking', '思考中'), 'think');
  assert.strictEqual(at('walk', 'tool', 'Bash：Run tests'), null, 'walking to the desk');
  assert.strictEqual(at('doze', 'sleeping', '睡著了'), null);
  assert.strictEqual(at('stand', 'waiting', '等你回覆'), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
