'use strict';

const fs = require('fs');
const path = require('path');
const { parseSession } = require('./agents.js');

const ACTIVE_WINDOW_MS = 60 * 60000;
const SKIP_CODES = new Set(['ENOENT', 'EISDIR', 'EACCES', 'EPERM']);

// A file (or its folder) can be deleted by its owner between listing and reading,
// so those errors mean "skip this entry". Anything else is a real error.
function attempt(fn) {
  try {
    return fn();
  } catch (err) {
    if (SKIP_CODES.has(err.code)) return null;
    throw err;
  }
}

function readTail(file, readTailBytes) {
  // Only the tail matters: sessions can be megabytes long and we just need the recent lines.
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const n = Math.min(size, readTailBytes);
    const buf = Buffer.alloc(n);
    fs.readSync(fd, buf, 0, n, size - n);
    return buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function scan(projectsDir, now, readTailBytes = 262144) {
  let dirs;
  try {
    dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
  } catch (err) {
    return []; // missing folder: nothing to show
  }

  const agents = [];
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const dirPath = path.join(projectsDir, dir.name);
    const names = attempt(() => fs.readdirSync(dirPath));
    if (names === null) continue; // folder deleted between listing and reading
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue;
      const file = path.join(dirPath, name);
      const stat = attempt(() => fs.statSync(file));
      if (stat === null) continue; // file deleted between listing and stat
      if (now - stat.mtimeMs > ACTIVE_WINDOW_MS) continue;
      const tail = attempt(() => readTail(file, readTailBytes));
      if (tail === null) continue; // file deleted between stat and read
      const agent = parseSession(tail.split('\n'), now);
      if (agent) agents.push(agent);
    }
  }
  return agents.sort((a, b) => b.lastAt - a.lastAt);
}

module.exports = { scan };
