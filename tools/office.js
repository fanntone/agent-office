'use strict';

// Starts the office server in the background (hidden, it outlives this command) and opens the page,
// or stops the one it started. start-office.cmd / stop-office.cmd call this, so a double-click is enough on
// Windows; elsewhere `npm start` / `npm run stop` do the same.
//   node tools/office.js start|stop        PORT (default 4317); OFFICE_NO_BROWSER=1 skips opening the page
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = Number(process.env.PORT || 4317);
const URL = `http://127.0.0.1:${PORT}`;
const PID_FILE = path.join(os.tmpdir(), `agent-office-${PORT}.pid`);
const SERVER = path.join(__dirname, '..', 'server.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function answers() {
  try {
    return (await fetch(`${URL}/api/agents`, { signal: AbortSignal.timeout(1500) })).ok;
  } catch (e) {
    return false;                                     // nothing listening: the expected answer when it is off
  }
}

async function waitFor(want, ms) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) {
    if ((await answers()) === want) return true;
  }
  return false;
}

function readPid() {
  try {
    return Number(fs.readFileSync(PID_FILE, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

async function start() {
  if (await answers()) {
    console.log(`already running at ${URL}`);
  } else {
    const child = spawn(process.execPath, [SERVER], { detached: true, stdio: 'ignore', windowsHide: true,
      env: { ...process.env, PORT: String(PORT) } });
    child.unref();
    fs.writeFileSync(PID_FILE, String(child.pid));
    if (!(await waitFor(true, 5000))) {
      console.error(`the office server did not start on ${URL} (is the port taken?)`);
      process.exit(1);
    }
    console.log(`started at ${URL} (pid ${child.pid})`);
  }
  if (!process.env.OFFICE_NO_BROWSER) {
    const [exe, args] = openCommand(process.platform, URL);
    spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  }
}

// how each system opens a page in the default browser
function openCommand(platform, url) {
  if (platform === 'win32') return ['cmd', ['/c', 'start', '', url]];
  if (platform === 'darwin') return ['open', [url]];
  return ['xdg-open', [url]];
}

async function stop() {
  const pid = readPid();
  const running = await answers();
  if (!running) {
    fs.rmSync(PID_FILE, { force: true });             // a pid left from a crash or a reboot means nothing now
    console.log('not running');
    return;
  }
  if (!pid) {
    console.error(`an office answers at ${URL}, but it was not started by this tool; stop it where it was started`);
    process.exit(1);
  }
  process.kill(pid);
  if (!(await waitFor(false, 5000))) {
    console.error(`pid ${pid} was stopped but ${URL} still answers`);
    process.exit(1);
  }
  fs.rmSync(PID_FILE, { force: true });
  console.log('stopped');
}

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'start') start();
  else if (cmd === 'stop') stop();
  else {
    console.error('usage: node tools/office.js start|stop');
    process.exit(2);
  }
}

module.exports = { openCommand };
