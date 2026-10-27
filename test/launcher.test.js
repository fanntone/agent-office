'use strict';

// tools/office.js for real: start the office in the background, find it already running, stop it.
// On a free port of its own and with no browser, so it neither clashes with a running office nor opens windows.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { execFileSync } = require('child_process');

const OFFICE = path.join(__dirname, '..', 'tools', 'office.js');
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

const freePort = () => new Promise((resolve) => {
  const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});
const answers = async (port) => {
  try { return (await fetch(`http://127.0.0.1:${port}/api/agents`, { signal: AbortSignal.timeout(1500) })).ok; } catch (e) { return false; }
};

(async () => {
  const port = await freePort();
  const projects = fs.mkdtempSync(path.join(os.tmpdir(), 'office-launch-'));
  const env = { ...process.env, PORT: String(port), OFFICE_NO_BROWSER: '1', CLAUDE_PROJECTS_DIR: projects, STRATA_URL: 'http://127.0.0.1:9' };
  const office = (cmd) => execFileSync(process.execPath, [OFFICE, cmd], { env, encoding: 'utf8', timeout: 20000 }).trim();
  const pidFile = path.join(os.tmpdir(), `agent-office-${port}.pid`);
  try {
    await run('stop when nothing runs says so', () => {
      assert.strictEqual(office('stop'), 'not running');
    });

    await run('start runs the server in the background and returns', async () => {
      const out = office('start');
      assert.ok(new RegExp(`^started at http://127\\.0\\.0\\.1:${port} \\(pid \\d+\\)$`).test(out), out);
      assert.ok(await answers(port), 'the office answers after start returned');
      assert.ok(fs.existsSync(pidFile), 'it remembers the pid');
    });

    await run('start again finds it running and starts no second one', async () => {
      const pid = fs.readFileSync(pidFile, 'utf8');
      assert.strictEqual(office('start'), `already running at http://127.0.0.1:${port}`);
      assert.strictEqual(fs.readFileSync(pidFile, 'utf8'), pid);
    });

    await run('stop ends it', async () => {
      assert.strictEqual(office('stop'), 'stopped');
      assert.ok(!(await answers(port)), 'nothing answers any more');
      assert.ok(!fs.existsSync(pidFile), 'the pid file is gone');
    });

    await run('an unknown command is refused', () => {
      assert.throws(() => office('dance'), /usage: node tools\/office\.js start\|stop/);
    });

    await run('the page opens with each system\'s own command', () => {
      const { openCommand } = require(OFFICE);
      const url = 'http://127.0.0.1:4317';
      assert.deepStrictEqual(openCommand('win32', url), ['cmd', ['/c', 'start', '', url]]);
      assert.deepStrictEqual(openCommand('darwin', url), ['open', [url]]);
      assert.deepStrictEqual(openCommand('linux', url), ['xdg-open', [url]]);
    });

    await run('the double-click files call it', () => {
      const root = path.join(__dirname, '..');
      assert.ok(/node "%~dp0tools\\office\.js" start/.test(fs.readFileSync(path.join(root, 'start-office.cmd'), 'utf8')));
      assert.ok(/node "%~dp0tools\\office\.js" stop/.test(fs.readFileSync(path.join(root, 'stop-office.cmd'), 'utf8')));
    });
  } finally {
    try { office('stop'); } catch (e) { /* already stopped */ }
    fs.rmSync(projects, { recursive: true, force: true });
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
