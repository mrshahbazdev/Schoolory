const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

// One access code per install, shown in Settings → Local connection.
// LAN host + peer sync both authenticate with it; a second PC pairs by
// entering this code there.
function codePath() { return path.join(app.getPath('userData'), 'lan-code.txt'); }

function lanCode() {
  try { const t = fs.readFileSync(codePath(), 'utf8').trim(); if (t) return t; } catch {}
  const t = crypto.randomBytes(4).toString('hex').toUpperCase();
  try { fs.writeFileSync(codePath(), t, 'utf8'); } catch {}
  return t;
}

// Settings → Regenerate: old code dies instantly — every paired PC must
// re-enter the new one. Used when a staff member who knew the code leaves.
function rotateLanCode() {
  const t = crypto.randomBytes(4).toString('hex').toUpperCase();
  try { fs.writeFileSync(codePath(), t, 'utf8'); } catch {}
  return t;
}

// Constant-time compare so the code can't be probed byte-by-byte.
function codeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a), bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = { lanCode, rotateLanCode, codeEq };
