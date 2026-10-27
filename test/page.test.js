'use strict';

// The page's wiring: index.html loads the four scripts in the order they depend on each other, they all
// exist, nothing comes from outside this machine, and every script at least parses.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
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
const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');

run('scripts in dependency order: world, sim, panel, draw, main', () => {
  const srcs = [...html.matchAll(/<script[^>]+src="\/?([^"]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(srcs, ['world.js', 'sim.js', 'panel.js', 'draw.js', 'main.js']);
});

run('everything the page loads exists', () => {
  const refs = [...html.matchAll(/(?:src|href)="\/?([^"]+)"/g)].map((m) => m[1]);
  for (const r of refs) assert.ok(fs.existsSync(path.join(PUBLIC, r)), `${r} exists`);
});

run('nothing from outside this machine', () => {
  for (const f of fs.readdirSync(PUBLIC)) {
    const text = fs.readFileSync(path.join(PUBLIC, f), 'utf8');
    assert.ok(!/https?:\/\//.test(text), `${f} has no outside URL`);
  }
});

run('every script parses', () => {
  for (const f of fs.readdirSync(PUBLIC).filter((n) => n.endsWith('.js'))) {
    new Function(fs.readFileSync(path.join(PUBLIC, f), 'utf8'));
  }
});

run('the canvas and the parts main.js looks for are on the page', () => {
  for (const id of ['office', 'count', 'clock', 'detail', 'detail-title', 'detail-lines', 'detail-recent', 'detail-recent-title', 'detail-close']) assert.ok(html.includes(`id="${id}"`), `#${id}`);
  assert.ok(html.includes('<footer'), 'the footer (fit() measures it)');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
