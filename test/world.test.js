'use strict';

// public/world.js: the floor plan must leave everyone a way to everywhere they are sent.
const assert = require('assert');
const W = require('../public/world.js');

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
const at = (p) => `${p.x},${p.y}`;

run('isometric projection: x goes down-right, y down-left, z lifts', () => {
  assert.deepStrictEqual(W.toScreen(0, 0), { sx: 0, sy: 0 });
  assert.deepStrictEqual(W.toScreen(1, 0), { sx: 32, sy: 16 });
  assert.deepStrictEqual(W.toScreen(0, 1), { sx: -32, sy: 16 });
  assert.deepStrictEqual(W.toScreen(3, 2, 10), { sx: 32, sy: 70 });
});

run('nine desks; furniture and the robot block their cells; seats, spots and the door are free', () => {
  assert.strictEqual(W.DESKS.length, 9);
  assert.ok(!W.walkable(4, 3) && !W.walkable(5, 3), 'a desk blocks both its cells');
  assert.ok(!W.walkable(W.ROBOT.x, W.ROBOT.y), 'the robot\'s place');
  assert.ok(!W.walkable(-1, 0) && !W.walkable(W.W, 0), 'outside the room');
  for (const p of [...W.DESKS.map((d) => d.seat), ...W.WAIT_SPOTS, ...W.NAP_SPOTS, W.DOOR]) {
    assert.ok(W.walkable(p.x, p.y), `${at(p)} is free`);
  }
});

run('no seat or spot is shared', () => {
  const all = [...W.DESKS.map((d) => d.seat), ...W.WAIT_SPOTS, ...W.NAP_SPOTS, W.DOOR].map(at);
  assert.strictEqual(new Set(all).size, all.length);
});

run('everywhere anyone is sent can be reached from the door', () => {
  for (const p of [...W.DESKS.map((d) => d.seat), ...W.WAIT_SPOTS, ...W.NAP_SPOTS]) {
    assert.ok(W.findPath(W.DOOR, p), `door -> ${at(p)}`);
  }
});

run('a path is one cell at a time, never through furniture, from start to goal', () => {
  const path = W.findPath(W.DOOR, W.DESKS[0].seat);
  assert.deepStrictEqual(path[0], W.DOOR);
  assert.deepStrictEqual(path[path.length - 1], W.DESKS[0].seat);
  for (let i = 1; i < path.length; i++) {
    assert.strictEqual(Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y), 1, `step ${i}`);
    assert.ok(W.walkable(path[i].x, path[i].y), `${at(path[i])} walkable`);
  }
  // door (0,10) to the first seat (4,2): 4 across and 8 up is the shortest possible, 13 cells with both ends
  assert.strictEqual(path.length, 13);
});

run('a blocked goal has no path; standing on the goal is a path of one', () => {
  assert.strictEqual(W.findPath(W.DOOR, { x: 4, y: 3 }), null);
  assert.deepStrictEqual(W.findPath(W.DOOR, W.DOOR), [W.DOOR]);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
