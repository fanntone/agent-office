'use strict';

// lib/agents.js and lib/scan.js against SPEC.md. Expected values are written by hand.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = require('../lib/agents.js');
const { scan } = require('../lib/scan.js');

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

const T0 = Date.parse('2026-10-27T02:00:00.000Z');
const at = (sec) => new Date(T0 + sec * 1000).toISOString();
const line = (o) => JSON.stringify(o);
const toolUse = (sec, name, input, model = 'claude-opus-5-5') => line({ type: 'assistant', timestamp: at(sec), sessionId: 's1',
  cwd: 'C:\\Users\\you\\Desktop\\五子棋', message: { model, content: [{ type: 'tool_use', name, input }] } });
const thinking = (sec, model = 'claude-opus-5-5') => line({ type: 'assistant', timestamp: at(sec), sessionId: 's1',
  message: { model, content: [{ type: 'thinking', thinking: 'hmm' }] } });
const text = (sec, model = 'claude-opus-5-5') => line({ type: 'assistant', timestamp: at(sec), sessionId: 's1',
  message: { model, content: [{ type: 'text', text: '好了' }] } });
const toolResult = (sec) => line({ type: 'user', timestamp: at(sec), sessionId: 's1',
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] } });
const ask = (sec, words = '幫我加音效') => line({ type: 'user', timestamp: at(sec), sessionId: 's1', message: { role: 'user', content: words } });

run('kindOf: qwen is Strata, everything else Claude', () => {
  assert.strictEqual(A.kindOf('qwen3.8-flash-next-iq2_xs'), 'strata');
  assert.strictEqual(A.kindOf('Qwen-X'), 'strata');
  assert.strictEqual(A.kindOf('claude-opus-5-5'), 'claude');
  assert.strictEqual(A.kindOf(undefined), 'claude');
});

run('summarize: description, then file name, pattern, command, url; cut at 40', () => {
  assert.strictEqual(A.summarize('Bash', { command: 'npm test', description: 'Run tests' }), 'Run tests');
  assert.strictEqual(A.summarize('Read', { file_path: 'C:\\Users\\you\\Desktop\\五子棋\\game.js' }), 'game.js');
  assert.strictEqual(A.summarize('Read', { file_path: '/home/a/b/ui.js' }), 'ui.js');
  assert.strictEqual(A.summarize('Grep', { pattern: 'TODO' }), 'TODO');
  assert.strictEqual(A.summarize('Bash', { command: 'ls' }), 'ls');
  assert.strictEqual(A.summarize('WebFetch', { url: 'https://x.dev' }), 'https://x.dev');
  assert.strictEqual(A.summarize('Bash', { command: 'a'.repeat(45) }), 'a'.repeat(40) + '…');
  assert.strictEqual(A.summarize('Foo', {}), '');
});

run('describe: every row of the table', () => {
  assert.deepStrictEqual(A.describe(JSON.parse(toolUse(0, 'Bash', { command: 'npm test', description: 'Run tests' }))),
    { state: 'tool', activity: 'Bash：Run tests' });
  assert.deepStrictEqual(A.describe(JSON.parse(toolUse(0, 'TodoWrite', {}))), { state: 'tool', activity: 'TodoWrite' });
  assert.deepStrictEqual(A.describe(JSON.parse(thinking(0))), { state: 'thinking', activity: '思考中' });
  assert.deepStrictEqual(A.describe(JSON.parse(text(0))), { state: 'waiting', activity: '等你回覆' });
  assert.deepStrictEqual(A.describe(JSON.parse(toolResult(0))), { state: 'thinking', activity: '看工具結果' });
  assert.deepStrictEqual(A.describe(JSON.parse(ask(0))), { state: 'thinking', activity: '收到新訊息' });
});

run('parseSession: the last entry decides; other line types and broken lines are skipped', () => {
  const lines = ['{"type":"assist', ask(0), toolUse(5, 'Read', { file_path: 'C:\\x\\game.js' }), toolResult(6),
    toolUse(8, 'Bash', { command: 'npm test', description: 'Run tests' }),
    line({ type: 'summary', summary: 'x' }), line({ type: 'file-history-snapshot', timestamp: at(99) })];
  const a = A.parseSession(lines, T0 + 20000);
  assert.deepStrictEqual(a, {
    id: 's1', kind: 'claude', model: 'claude-opus-5-5', project: '五子棋', lastAt: T0 + 8000,
    state: 'tool', activity: 'Bash：Run tests',
    recent: [{ at: T0 + 8000, text: 'Bash：Run tests' }, { at: T0 + 5000, text: 'Read：game.js' }, { at: T0, text: '收到新訊息' }],
  });
});

run('parseSession: a Strata session; asleep after 10 minutes without a step', () => {
  const lines = [ask(0), text(30, 'qwen3.8-flash-next-iq2_xs')];
  const awake = A.parseSession(lines, T0 + 30000 + 10 * 60000);
  assert.strictEqual(awake.kind, 'strata');
  assert.strictEqual(awake.state, 'waiting');
  const asleep = A.parseSession(lines, T0 + 30000 + 10 * 60000 + 1);
  assert.deepStrictEqual([asleep.state, asleep.activity], ['sleeping', '睡著了']);
});

run('parseSession: recent keeps the 10 newest actions', () => {
  const lines = [];
  for (let i = 0; i < 12; i++) lines.push(toolUse(i, 'Read', { file_path: `f${i}.js` }));
  const r = A.parseSession(lines, T0).recent;
  assert.strictEqual(r.length, 10);
  assert.strictEqual(r[0].text, 'Read：f11.js');
  assert.strictEqual(r[9].text, 'Read：f2.js');
});

run('parseSession: nothing to show is null', () => {
  assert.strictEqual(A.parseSession([line({ type: 'summary' }), 'garbage'], T0), null);
  assert.strictEqual(A.parseSession([], T0), null);
});

run('serverState: every row of the table', () => {
  assert.deepStrictEqual(A.serverState(null), { state: 'offline', activity: '沒開機', gpuTemp: null });
  assert.deepStrictEqual(A.serverState({ live: { state: 'generating', queued: 2, tok_s: 40 }, hardware: { gpu_temp: 61 } }),
    { state: 'queued', activity: '排隊 2 個', gpuTemp: 61 });
  assert.deepStrictEqual(A.serverState({ live: { state: 'reading', prompt_read: 643, prompt_total: 1000 } }),
    { state: 'reading', activity: '讀 prompt 64%', gpuTemp: null });
  assert.deepStrictEqual(A.serverState({ live: { state: 'reading' } }), { state: 'reading', activity: '讀 prompt', gpuTemp: null });
  assert.deepStrictEqual(A.serverState({ live: { state: 'generating', tok_s: 41.26 } }),
    { state: 'generating', activity: '寫字中 41.3 tok/s', gpuTemp: null });
  assert.deepStrictEqual(A.serverState({ live: { state: 'generating', tok_s: null } }),
    { state: 'generating', activity: '寫字中', gpuTemp: null });
  assert.deepStrictEqual(A.serverState({ live: { state: 'idle' }, hardware: { gpu_temp: 52 } }),
    { state: 'idle', activity: '待命', gpuTemp: 52 });
});

run('scan: recent files only, newest first, tail only, missing folder is empty', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'office-scan-'));
  try {
    const now = Date.now();
    const write = (dir, name, lines, ageMin) => {
      fs.mkdirSync(path.join(root, dir), { recursive: true });
      const f = path.join(root, dir, name);
      fs.writeFileSync(f, lines.join('\n') + '\n');
      const t = new Date(now - ageMin * 60000);
      fs.utimesSync(f, t, t);
    };
    const stamp = (o, sec) => JSON.stringify({ ...JSON.parse(o), timestamp: new Date(now - sec * 1000).toISOString() });
    write('p1', 'a.jsonl', [stamp(ask(0), 300)], 5);
    write('p2', 'b.jsonl', [stamp(thinking(0), 60)].map((l) => l.replace('"s1"', '"s2"')), 1);
    write('p3', 'old.jsonl', [stamp(ask(0), 7200)], 61);
    write('p3', 'notes.txt', ['x'], 1);
    // a big file: only its tail is read, and the cut first line is skipped
    write('p4', 'big.jsonl', [ ...Array(3000).fill(stamp(ask(0), 900)), stamp(text(0), 120).replace('"s1"', '"s4"')], 2);
    const agents = scan(root, now, 4096);
    assert.deepStrictEqual(agents.map((a) => a.id), ['s2', 's4', 's1']);
    assert.strictEqual(agents[1].state, 'waiting');
    assert.deepStrictEqual(scan(path.join(root, 'nope'), now), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

run('scan: a file deleted after it was listed is skipped; other errors still surface', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'office-scan-'));
  const statSync = fs.statSync;
  try {
    const now = Date.now();
    fs.mkdirSync(path.join(root, 'p1'));
    fs.writeFileSync(path.join(root, 'p1', 'gone.jsonl'), 'x\n');
    fs.writeFileSync(path.join(root, 'p1', 'ok.jsonl'), JSON.stringify({ ...JSON.parse(ask(0)), timestamp: new Date(now).toISOString() }) + '\n');
    // the race: listed, then removed by its owner before scan looks at it
    const fail = (code) => (f, ...rest) => {
      if (String(f).endsWith('gone.jsonl')) throw Object.assign(new Error(`${code}: ${f}`), { code });
      return statSync(f, ...rest);
    };
    fs.statSync = fail('ENOENT');
    assert.deepStrictEqual(scan(root, now).map((a) => a.id), ['s1']);
    fs.statSync = fail('EIO');
    assert.throws(() => scan(root, now), /EIO/);
  } finally {
    fs.statSync = statSync;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
