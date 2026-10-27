'use strict';

// Takes a screenshot of the running office page with headless Edge, so changes to the look can be checked
// by eye. The page keeps a live stream open, so Edge is stopped by a fixed --timeout, not "network idle".
//   node tools/screenshot.js <out.png> [width] [height] [url] [waitMs]
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const [out, width = '1280', height = '760', url = 'http://127.0.0.1:4317/', wait = '4000'] = process.argv.slice(2);
if (!out) {
  console.error('usage: node tools/screenshot.js <out.png> [width] [height] [url]');
  process.exit(2);
}
const edge = [
  path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
].find((p) => fs.existsSync(p));
if (!edge) {
  console.error('Microsoft Edge not found');
  process.exit(1);
}
const file = path.resolve(out);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.rmSync(file, { force: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'office-shot-'));
const child = spawn(edge, ['--headless=new', '--disable-gpu', `--window-size=${width},${height}`, `--timeout=${wait}`,
  `--screenshot=${file}`, `--user-data-dir=${profile}`, url], { stdio: 'ignore' });
const guard = setTimeout(() => child.kill(), Number(wait) + 30000);
child.on('exit', () => {
  clearTimeout(guard);
  fs.rmSync(profile, { recursive: true, force: true });
  if (!fs.existsSync(file)) {
    console.error(`no screenshot: is the server running at ${url}?`);
    process.exit(1);
  }
  console.log(`saved ${file}`);
});
