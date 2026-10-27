'use strict';

// public/sim.js: everyone ends up where their state sends them, walking there through the room.
const assert = require('assert');
const World = require('../public/world.js');
const { Office, assignSeats } = require('../public/sim.js');

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

const agent = (id, state, kind = 'claude') => ({ id, kind, project: 'p', model: null, state, activity: state, recent: [], lastAt: 0 });
const SERVER = { state: 'idle', activity: '待命', gpuTemp: 50 };
const data = (...agents) => ({ at: 0, server: SERVER, agents });
// a fixed sequence instead of Math.random, so a run is repeatable
function rng() { let s = 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
// let the office run for `secs`, a frame at a time
const play = (o, secs) => { for (let t = 0; t < secs; t += 0.05) o.step(0.05); };
const cell = (c) => ({ x: c.x, y: c.y });
const inList = (list, c) => list.some((p) => p.x === c.x && p.y === c.y);

run('assignSeats: stay put, newcomers take the lowest free seat, leavers free theirs', () => {
  assert.deepStrictEqual(assignSeats({}, ['a', 'b', 'c']), { a: 0, b: 1, c: 2 });
  assert.deepStrictEqual(assignSeats({ a: 0, b: 1, c: 2 }, ['c', 'd', 'a']), { c: 2, d: 1, a: 0 });
  assert.deepStrictEqual(assignSeats({ a: 0, c: 2 }, ['e', 'a', 'f', 'c', 'g']), { e: 1, a: 0, f: 3, c: 2, g: 4 });
});

run('a newcomer comes in by the door and walks to its desk, then sits', () => {
  const o = new Office({ rng: rng() });
  o.update(data());
  o.update(data(agent('a', 'tool')));
  const c = o.characters()[0];
  assert.deepStrictEqual(cell(c), World.DOOR);
  o.step(0.1);
  assert.strictEqual(c.pose, 'walk');
  play(o, 10);
  assert.deepStrictEqual(cell(c), World.DESKS[0].seat);
  assert.strictEqual(c.pose, 'sit');
});

run('when the page opens, everyone is already in place; only later arrivals walk in', () => {
  const o = new Office({ rng: rng() });
  o.update(data(agent('a', 'tool'), agent('b', 'sleeping')));
  o.step(0.05);
  const a = o.chars.get('a'), b = o.chars.get('b');
  assert.deepStrictEqual([cell(a), a.pose], [World.DESKS[0].seat, 'sit']);
  assert.deepStrictEqual([cell(b), b.pose], [World.DESKS[1].seat, 'doze'], 'b already dozing at its desk');
  o.update(data(agent('a', 'tool'), agent('b', 'sleeping'), agent('c', 'tool')));
  assert.deepStrictEqual(cell(o.chars.get('c')), World.DOOR, 'c comes in by the door');
});

run('the walk takes about the path length over the speed: not a jump', () => {
  const o = new Office({ rng: rng() });
  o.update(data());
  o.update(data(agent('a', 'tool')));
  // 12 steps from the door to seat 0 at 2.4 cells/s: 5.0 s
  play(o, 4);
  assert.strictEqual(o.characters()[0].pose, 'walk', 'still walking after 4 s');
  play(o, 1.5);
  assert.strictEqual(o.characters()[0].pose, 'sit', 'seated after 5.5 s');
});

run('waiting: off to the coffee corner; two waiting never share a spot', () => {
  const o = new Office({ rng: rng() });
  o.update(data(agent('a', 'waiting'), agent('b', 'waiting')));
  play(o, 12);
  const [a, b] = o.characters();
  assert.ok(inList(World.WAIT_SPOTS, a) && inList(World.WAIT_SPOTS, b), 'both at wait spots');
  assert.notDeepStrictEqual(cell(a), cell(b));
});

run('waiting: it strolls to another spot after a while', () => {
  const o = new Office({ rng: rng() });
  o.update(data(agent('a', 'waiting')));
  play(o, 6);
  const first = cell(o.characters()[0]);
  const seen = new Set([JSON.stringify(first)]);
  for (let i = 0; i < 5; i++) { play(o, 6); seen.add(JSON.stringify(cell(o.characters()[0]))); }
  assert.ok(seen.size > 1, 'moved to another spot');
});

run('asleep: dozes off at its own desk', () => {
  const o = new Office({ rng: rng() });
  o.update(data(agent('a', 'tool'), agent('b', 'sleeping')));
  play(o, 12);
  const b = o.chars.get('b');
  assert.deepStrictEqual(cell(b), World.DESKS[1].seat);
  assert.strictEqual(b.pose, 'doze');
});

run('asleep without a desk: a beanbag in the lounge', () => {
  const o = new Office({ rng: rng() });
  o.update(data(...Array.from({ length: 9 }, (_, i) => agent(`a${i}`, 'tool')), agent('z', 'sleeping')));
  play(o, 20);
  const z = o.chars.get('z');
  assert.ok(inList(World.NAP_SPOTS, z), 'the 10th has no desk');
  assert.strictEqual(z.pose, 'nap');
});

run('back to work: it gets up from the coffee corner and returns to its own desk', () => {
  const o = new Office({ rng: rng() });
  o.update(data(agent('a', 'tool'), agent('b', 'tool')));
  play(o, 10);
  o.update(data(agent('a', 'tool'), agent('b', 'waiting')));
  play(o, 10);
  const b = o.chars.get('b');
  // it may be strolling between two coffee-corner spots by now, so its goal is what counts
  assert.ok(inList(World.WAIT_SPOTS, b.goal), 'b went for coffee');
  o.update(data(agent('a', 'tool'), agent('b', 'thinking')));
  play(o, 10);
  assert.deepStrictEqual(cell(b), World.DESKS[1].seat, 'b is back at desk 1');
  assert.strictEqual(b.pose, 'sit');
});

run('spots are given back: after a full coffee corner goes back to work, the next ones find room', () => {
  const o = new Office({ rng: rng() });
  const n = World.WAIT_SPOTS.length;
  const first = Array.from({ length: n }, (_, i) => `a${i}`);
  o.update(data(...first.map((id) => agent(id, 'waiting'))));
  play(o, 3);
  const second = Array.from({ length: n }, (_, i) => `b${i}`);
  o.update(data(...first.map((id) => agent(id, 'tool')), ...second.map((id) => agent(id, 'waiting'))));
  for (const id of second) assert.ok(inList(World.WAIT_SPOTS, o.chars.get(id).goal || {}), `${id} found a spot`);
});

run('gone from the data: walks out of the door and disappears; the desk is free again', () => {
  const o = new Office({ rng: rng() });
  o.update(data(agent('a', 'tool'), agent('b', 'tool')));
  play(o, 10);
  o.update(data(agent('b', 'tool')));
  const a = o.chars.get('a');
  assert.strictEqual(a.activity, '下班囉');
  play(o, 1);
  assert.ok(o.chars.has('a'), 'still walking out');
  play(o, 10);
  assert.ok(!o.chars.has('a'), 'gone');
  o.update(data(agent('b', 'tool'), agent('c', 'tool')));
  assert.strictEqual(o.seats.c, 0, 'c takes the freed desk 0');
});

run('more people than desks: the extra ones still get somewhere to stand', () => {
  const o = new Office({ rng: rng() });
  o.update(data(...Array.from({ length: 11 }, (_, i) => agent(`a${i}`, 'tool'))));
  play(o, 20);
  const extra = o.chars.get('a10');
  assert.ok(inList(World.WAIT_SPOTS, extra), 'the 11th waits by the coffee');
});

run('nobody ever stands inside furniture', () => {
  const o = new Office({ rng: rng() });
  o.update(data());
  o.update(data(agent('a', 'tool'), agent('b', 'waiting'), agent('c', 'sleeping'), agent('d', 'thinking')));
  for (let i = 0; i < 400; i++) {
    o.step(0.05);
    for (const c of o.characters()) {
      assert.ok(World.walkable(Math.round(c.x), Math.round(c.y)), `${c.id} at ${c.x},${c.y}`);
    }
  }
});

run('the robot mirrors the server', () => {
  const o = new Office({ rng: rng() });
  o.update({ at: 0, agents: [], server: { state: 'generating', activity: '寫字中 40.0 tok/s', gpuTemp: 61 } });
  assert.deepStrictEqual(o.robot, { state: 'generating', activity: '寫字中 40.0 tok/s', gpuTemp: 61 });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
