const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const { app, ipcMain, BrowserWindow } = require('electron');
const { lanCode, rotateLanCode, codeEq } = require('./lan-code.cjs');
const { writeJsonEnc, verifyPinStr } = require('./doc-io.cjs');
const { serveDoc, mergeSave, loadDoc, listRows, getRow, putRow, patchRow, deleteRow } = require('../db.cjs');

function notifyRenderer() {
  const w = BrowserWindow.getAllWindows()[0];
  if (w) w.webContents.send('schoolory:sync-apply', loadDoc());
}

// LAN host mode (OPT-IN): when enabled in Settings, this PC serves Schoolory to
// other devices on the same WiFi. Every /api call requires the access code
// shown on this PC — without it the shop database stays private.
const HOST_PORT = 47071;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.webp': 'image/webp'
};

function histDir() { return path.join(app.getPath('userData'), 'history'); }

function distDir() {
  const candidates = [
    path.join(app.getAppPath(), 'dist'),
    path.join(__dirname, '..', '..', 'dist'),
    path.join(process.resourcesPath || '', 'app.asar', 'dist')
  ];
  return candidates.find(d => { try { return fs.existsSync(path.join(d, 'index.html')); } catch { return false; } });
}

function lanUrls() {
  const urls = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}:${HOST_PORT}`);
    }
  }
  return urls;
}

let server = null;
let serverError = null;

function startServer() {
  if (server) return;
  serverError = null;
  server = http.createServer((req, res) => {
    const parsed = new URL(req.url || '/', 'http://x');
    const url = parsed.pathname;
    try {
      if (url === '/api/ping') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true,"app":"schoolory"}'); return; }

      if (url.startsWith('/api/')) {
        // Access code accepted via header only — never the URL (browser history).
        const tok = req.headers['x-schoolory-token'] || req.headers['x-schoolory-token'] || '';
        if (!codeEq(tok, lanCode())) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end('{"error":"invalid access code"}'); return; }

        if (url === '/api/store') {
          if (req.method === 'GET') {
            const { doc, rev } = serveDoc();
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ doc, rev }));
            return;
          }
          if (req.method === 'POST') {
            let body = '';
            req.on('data', c => { body += c; if (body.length > 50 * 1024 * 1024) req.destroy(); });
            req.on('end', () => {
              try {
                const payload = JSON.parse(body);
                const doc = payload.doc || payload;
                if (!doc || !Array.isArray(doc.items) || !doc.settings) {
                  res.writeHead(400); res.end('bad doc'); return;
                }
                // Record-level merge keyed on the rev this client loaded — rows
                // other devices touched in between are preserved, not wiped.
                const r = mergeSave(doc, { actor: 'remote', baseRev: payload.baseRev });
                notifyRenderer();
                res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r));
              } catch (e) { res.writeHead(500); res.end(String(e)); }
            });
            return;
          }
        }

        // Record-level API: /api/rows/<collection>[?q=] and /api/rows/<collection>/<id>
        // (items, sales have real indexed tables; the rest live
        // in the generic records store). e.g. GET /api/rows/shops?q=ali
        const rowMatch = url.match(/^\/api\/rows\/([\w-]+)(?:\/([\w-]+))?$/);
        if (rowMatch) {
          const [, col, id] = rowMatch;
          if (col === 'settings' || col === 'users' || col === 'audit_log') { res.writeHead(403); res.end('forbidden'); return; }
          if (req.method === 'GET' && !id) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(listRows(col, parsed.searchParams.get('q'))));
            return;
          }
          if (req.method === 'GET' && id) {
            const row = getRow(col, id);
            res.writeHead(row ? 200 : 404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(row || { error: 'not found' }));
            return;
          }
          if ((req.method === 'POST' || req.method === 'PUT') || (req.method === 'PATCH' && id) || (req.method === 'DELETE' && id)) {
            let body = '';
            req.on('data', c => { body += c; if (body.length > 10 * 1024 * 1024) req.destroy(); });
            req.on('end', () => {
              try {
                let out;
                if (req.method === 'DELETE') out = deleteRow(col, id, 'remote');
                else if (req.method === 'PATCH') out = patchRow(col, id, JSON.parse(body || '{}'), 'remote');
                else out = putRow(col, id ? { ...JSON.parse(body || '{}'), id } : JSON.parse(body || '{}'), 'remote');
                notifyRenderer();
                res.writeHead(out.ok === false ? 404 : 200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(out));
              } catch (e) { res.writeHead(500); res.end(String(e)); }
            });
            return;
          }
        }
        if (url === '/api/snapshot' && req.method === 'POST') {
          let body = '';
          req.on('data', c => body += c);
          req.on('end', () => {
            try {
              const { doc, label } = JSON.parse(body || '{}');
              fs.mkdirSync(histDir(), { recursive: true });
              const id = `${new Date().toISOString().replace(/[:.]/g, '-')}_${crypto.randomBytes(3).toString('hex')}`;
              writeJsonEnc(path.join(histDir(), `${id}.json`), { id, label: label || 'remote', at: new Date().toISOString(), doc });
              res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
            } catch (e) { res.writeHead(500); res.end(String(e)); }
          });
          return;
        }
        if (url === '/api/verify-pin' && req.method === 'POST') {
          let body = '';
          req.on('data', c => body += c);
          req.on('end', () => {
            try {
              // Client sends only userId + candidate — the hash never leaves this process.
              const { userId, pin } = JSON.parse(body || '{}');
              const row = getRow('users', userId);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: !!(row && row.pin && verifyPinStr(row.pin, pin)) }));
            } catch (e) { res.writeHead(500); res.end(String(e)); }
          });
          return;
        }
        res.writeHead(404); res.end('not found'); return;
      }

      // Static app files + SPA fallback (no auth — carries no shop data).
      const dist = distDir();
      if (!dist) { res.writeHead(503); res.end('app bundle not found'); return; }
      let fp = path.join(dist, decodeURIComponent(url === '/' ? '/index.html' : url));
      if (!fp.startsWith(dist) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) fp = path.join(dist, 'index.html');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(fp).pipe(res);
    } catch (e) { try { res.writeHead(500); res.end(String(e)); } catch {} }
  });
  server.on('error', e => {
    serverError = String(e && e.code === 'EADDRINUSE' ? `Port ${HOST_PORT} is already in use` : e);
    try { server.close(); } catch {}
    server = null;
  });
  try { server.listen(HOST_PORT, '0.0.0.0'); } catch (e) { serverError = String(e); server = null; }
}

function stopServer() {
  if (!server) return;
  try { server.close(); } catch {}
  server = null;
}

function registerHostIPC() {
  // Restart sharing automatically if the user had left it on.
  try { if ((loadDoc().settings || {}).hostOn) startServer(); } catch {}
  ipcMain.handle('host:info', () => ({ ok: true, enabled: !!server, error: serverError, port: HOST_PORT, token: lanCode(), urls: lanUrls() }));
  ipcMain.handle('host:set', (_e, { enabled }) => {
    if (enabled) startServer(); else stopServer();
    return { ok: true, enabled: !!server, error: serverError };
  });
  ipcMain.handle('host:rotateCode', () => ({ ok: true, token: rotateLanCode() }));
}

module.exports = { registerHostIPC };
