const { ipcMain, BrowserWindow } = require('electron');
const dgram = require('dgram');
const http = require('http');
const crypto = require('crypto');
const { lanCode, codeEq } = require('./lan-code.cjs');

// Zero-config LAN sync: every instance broadcasts its store's updatedAt over
// UDP and serves the latest store JSON over HTTP. Peers with an older store
// pull the newer one; the renderer applies it and republishes.
const SYNC_PORT = 47070;
const BEACON_PORT = 48888;
const BEACON_EVERY = 5000;

function registerSyncIPC() {
  const clientId = crypto.randomBytes(8).toString('hex');
  let latestDoc = null;
  let latestAt = 0;
  let pairCode = '';
  const inflight = new Set();

  // A peer request is trusted only if it presents THIS PC's access code — so
  // pairing means entering the main PC's code in Settings → Pair code on the
  // other PC (stored as settings.syncCode and sent with every pull).
  const codeOk = tok => codeEq(tok, lanCode()) || (pairCode && codeEq(tok, pairCode));

  // Renderer publishes the newest store after every save.
  ipcMain.handle('sync:publish', (_e, { doc }) => {
    try {
      if (doc && Array.isArray(doc.items)) {
        latestDoc = doc;
        latestAt = doc.updatedAt || Date.now();
        pairCode = (doc.settings && doc.settings.syncCode) || pairCode;
        return { ok: true };
      }
      return { ok: false };
    } catch (err) { return { ok: false, error: String(err) }; }
  });

  ipcMain.handle('sync:status', () => ({ ok: true, port: SYNC_PORT, updatedAt: latestAt }));

  // Serve the latest store to peers on the LAN.
  const server = http.createServer((req, res) => {
    const u = new URL(req.url || '/', 'http://x');
    const tok = req.headers['x-schoolory-token'] || req.headers['x-schoolory-token'] || '';
    if (u.pathname === '/store' && codeOk(tok)) {
      let doc = latestDoc;
      try { doc = require('../db.cjs').loadDoc() || doc; } catch {}
      if (!doc) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(doc));
    } else {
      res.writeHead(404); res.end();
    }
  });
  server.on('error', () => {});
  try { server.listen(SYNC_PORT, '0.0.0.0'); } catch { /* port busy — another instance */ }

  // Broadcast our presence + freshness; listen for peers.
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', () => {});
  sock.on('listening', () => { try { sock.setBroadcast(true); } catch {} });
  sock.bind(BEACON_PORT);
  setInterval(() => {
    try {
      sock.send(JSON.stringify({ app: 'schoolory', clientId, port: SYNC_PORT, updatedAt: latestAt }), BEACON_PORT, '255.255.255.255');
    } catch { /* offline interface */ }
  }, BEACON_EVERY);

  sock.on('message', (buf, rinfo) => {
    try {
      const msg = JSON.parse(buf.toString());
      if (!msg || (msg.app !== 'schoolory') || msg.clientId === clientId) return;
      const remoteAt = msg.updatedAt || 0;
      if (remoteAt <= latestAt || inflight.has(rinfo.address)) return;
      inflight.add(rinfo.address);
      http.get({ host: rinfo.address, port: msg.port || SYNC_PORT, path: '/store', timeout: 4000,
        headers: { 'x-schoolory-token': pairCode || lanCode() } }, res => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          inflight.delete(rinfo.address);
          try {
            const doc = JSON.parse(body);
            if (doc && Array.isArray(doc.items) && (doc.updatedAt || 0) > latestAt) {
              const w = BrowserWindow.getAllWindows()[0];
              if (w) w.webContents.send('schoolory:sync-apply', doc);
            }
          } catch { /* malformed payload */ }
        });
      }).on('error', () => inflight.delete(rinfo.address))
        .on('timeout', () => inflight.delete(rinfo.address));
    } catch { /* ignore junk packets */ }
  });
}

module.exports = { registerSyncIPC };
