'use strict';

const fs = require('fs');
const path = require('path');
const { parseSession } = require('./agents.js');

const ACTIVE_WINDOW_MS = 60 * 60000;
const SKIP_CODES = new Set(['ENOENT', 'ENOTDIR', 'EISDIR', 'EACCES', 'EPERM']);

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

// A subagent's agent-<id>.meta.json says finished: true once it has handed back its answer.
function finished(file) {
  const text = attempt(() => fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
  return text !== null && JSON.parse(text).finished === true;
}

function scanFile(file, now, readTailBytes, agents) {
  const stat = attempt(() => fs.statSync(file));
  if (stat === null) return; // file deleted between listing and stat
  if (now - stat.mtimeMs > ACTIVE_WINDOW_MS) return;
  const tail = attempt(() => readTail(file, readTailBytes));
  if (tail === null) return; // file deleted between stat and read
  const agent = parseSession(tail.split('\n'), now);
  if (agent) agents.push(agent);
}

// Subagents live in <session>/subagents/agent-*.jsonl, workflow agents one or two folders deeper.
function scanSubagents(dir, now, readTailBytes, agents) {
  const entries = attempt(() => fs.readdirSync(dir, { withFileTypes: true }));
  if (entries === null) return; // no subagents, or folder deleted
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) scanSubagents(p, now, readTailBytes, agents);
    else if (e.name.endsWith('.jsonl') && !finished(p)) scanFile(p, now, readTailBytes, agents);
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
      if (name.endsWith('.jsonl')) scanFile(path.join(dirPath, name), now, readTailBytes, agents);
      else scanSubagents(path.join(dirPath, name, 'subagents'), now, readTailBytes, agents);
    }
  }
  return agents.sort((a, b) => b.lastAt - a.lastAt);
}

module.exports = { scan };
