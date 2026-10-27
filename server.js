'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');
const { serverState } = require('./lib/agents.js');
const { scan } = require('./lib/scan.js');

const PORT = Number(process.env.PORT || 4317);
const PROJECTS_DIR = process.env.CLAUDE_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects');
const STRATA_URL = process.env.STRATA_URL || 'http://127.0.0.1:8080';
const PUBLIC_DIR = path.join(__dirname, 'public');

async function getMetrics() {
  try {
    const r = await fetch(`${STRATA_URL}/metrics`, { signal: AbortSignal.timeout(1000) });
    if (!r.ok) return null;
    return await r.json();
  } catch (err) {
    return null; // unreachable or slow: the office shows the server as offline
  }
}

async function payload() {
  const metrics = await getMetrics();
  const now = Date.now();
  return { at: now, agents: scan(PROJECTS_DIR, now), server: serverState(metrics) };
}

const CONTENT_TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function serveStatic(req, res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (err) {
    res.writeHead(400); res.end('bad path'); return;
  }
  // Resolve against public/ and refuse anything that lands outside it.
  // join (not resolve): a leading '/' in the URL must not become a filesystem root.
  const abs = path.normalize(path.join(PUBLIC_DIR, decoded.slice(1)));
  if (abs !== PUBLIC_DIR && !abs.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(404); res.end('not found'); return;
  }
  const file = abs === PUBLIC_DIR ? path.join(PUBLIC_DIR, 'index.html') : abs;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
  const pathname = url.parse(req.url).pathname;

  if (pathname === '/api/agents') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(await payload()));
    return;
  }

  if (pathname === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    const send = async () => res.write(`data: ${JSON.stringify(await payload())}\n\n`);
    send();
    const timer = setInterval(send, 1000);
    // Client gone: stop pushing, otherwise the interval keeps the process alive.
    req.on('close', () => clearInterval(timer));
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`listening on http://127.0.0.1:${server.address().port}`);
});
