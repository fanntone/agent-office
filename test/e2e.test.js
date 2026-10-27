'use strict';

// End to end: the real server.js as its own process, real files in a temp projects folder, real HTTP.
// Strata is a small stand-in server here so its state can be set; run again it gives the same result.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0;
async function run(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`FAIL  ${name}\n      ${err.message}`);
    failed++;
  }
}

function strataStandIn() {
  const s = { metrics: { live: { state: 'idle' }, hardware: { gpu_temp: 50 } }, down: false };
  s.server = http.createServer((req, res) => {
    if (s.down || req.url !== '/metrics') { res.writeHead(503); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(s.metrics));
  });
  return new Promise((resolve) => s.server.listen(0, '127.0.0.1', () => { s.url = `http://127.0.0.1:${s.server.address().port}`; resolve(s); }));
}

function startOffice(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: { ...process.env, ...env, PORT: '0' } });
    let out = '';
    const timer = setTimeout(() => reject(new Error(`server.js did not say where it listens: ${out}`)), 5000);
    child.stdout.on('data', (d) => {
      out += d;
      const m = /listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(out);
      if (m) { clearTimeout(timer); resolve({ child, url: m[1] }); }
    });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`server.js exited ${code}: ${out}`)); });
  });
}

const getJson = async (url) => { const r = await fetch(url); assert.strictEqual(r.status, 200, `${url} -> ${r.status}`); return r.json(); };
const entry = (o) => JSON.stringify({ sessionId: 'e2e-1', cwd: 'C:\\work\\demo', timestamp: new Date().toISOString(), ...o }) + '\n';

(async () => {
  const projects = fs.mkdtempSync(path.join(os.tmpdir(), 'office-e2e-'));
  const strata = await strataStandIn();
  let office;
  try {
    office = await startOffice({ CLAUDE_PROJECTS_DIR: projects, STRATA_URL: strata.url });
    const file = path.join(projects, 'C--work-demo', 'e2e-1.jsonl');
    fs.mkdirSync(path.dirname(file), { recursive: true });

    await run('an empty office: no agents, the Strata machine idle', async () => {
      const r = await fetch(`${office.url}/api/agents`);
      assert.strictEqual(r.headers.get('content-type'), 'application/json; charset=utf-8');
      const s = await getJson(`${office.url}/api/agents`);
      assert.deepStrictEqual(s.agents, []);
      assert.deepStrictEqual(s.server, { state: 'idle', activity: '待命', gpuTemp: 50 });
      assert.ok(Math.abs(s.at - Date.now()) < 5000, 'at is the server time in ms');
    });

    await run('a session that writes a step shows up with what it does', async () => {
      fs.appendFileSync(file, entry({ type: 'user', message: { role: 'user', content: '跑測試' } }));
      fs.appendFileSync(file, entry({ type: 'assistant', message: { model: 'qwen3.8-flash-next-iq2_xs',
        content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npm test', description: 'Run tests' } }] } }));
      const s = await getJson(`${office.url}/api/agents`);
      assert.strictEqual(s.agents.length, 1);
      const a = s.agents[0];
      assert.deepStrictEqual([a.id, a.kind, a.project, a.state, a.activity], ['e2e-1', 'strata', 'demo', 'tool', 'Bash：Run tests']);
    });

    await run('its next step changes what the office shows', async () => {
      fs.appendFileSync(file, entry({ type: 'assistant', message: { model: 'qwen3.8-flash-next-iq2_xs', content: [{ type: 'text', text: '好了' }] } }));
      const a = (await getJson(`${office.url}/api/agents`)).agents[0];
      assert.deepStrictEqual([a.state, a.activity], ['waiting', '等你回覆']);
      assert.strictEqual(a.recent.length, 2);
    });

    await run('Strata reading, then down', async () => {
      strata.metrics = { live: { state: 'reading', prompt_read: 50, prompt_total: 200 } };
      assert.strictEqual((await getJson(`${office.url}/api/agents`)).server.activity, '讀 prompt 25%');
      strata.down = true;
      assert.deepStrictEqual((await getJson(`${office.url}/api/agents`)).server, { state: 'offline', activity: '沒開機', gpuTemp: null });
      strata.down = false;
    });

    await run('the stream sends the same state every second', async () => {
      const ctl = new AbortController();
      const r = await fetch(`${office.url}/api/stream`, { signal: ctl.signal });
      assert.ok((r.headers.get('content-type') || '').startsWith('text/event-stream'));
      const reader = r.body.getReader();
      let buf = '';
      const started = Date.now();
      while ((buf.match(/\n\n/g) || []).length < 2 && Date.now() - started < 4000) buf += new TextDecoder().decode((await reader.read()).value);
      ctl.abort();
      const events = buf.split('\n\n').filter((e) => e.startsWith('data: ')).map((e) => JSON.parse(e.slice(6)));
      assert.ok(events.length >= 2, `got ${events.length} events`);
      assert.strictEqual(events[0].agents[0].id, 'e2e-1');
    });

    await run('the page is served; nothing outside public/ is', async () => {
      const page = await fetch(`${office.url}/`);
      assert.strictEqual(page.status, 200);
      assert.ok((await page.text()).includes('<html'), 'index.html');
      for (const bad of ['/../server.js', '/..%2fserver.js', '/%2e%2e/SPEC.md']) {
        const r = await fetch(`${office.url}${bad}`);
        assert.ok(r.status === 404 || r.status === 400, `${bad} -> ${r.status}`);
      }
      assert.strictEqual((await fetch(`${office.url}/nope.js`)).status, 404);
    });

    await run('it listens on 127.0.0.1 only', () => {
      assert.ok(office.url.startsWith('http://127.0.0.1:'));
    });
  } finally {
    if (office) office.child.kill();
    strata.server.close();
    fs.rmSync(projects, { recursive: true, force: true });
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
