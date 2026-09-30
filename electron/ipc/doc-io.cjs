const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, safeStorage } = require('electron');

// Encrypted-at-rest document IO. The store file is safeStorage-encrypted
// (DPAPI on Windows, Keychain on macOS); older plaintext schoolory.json files
// are migrated transparently on first load. If encryption is unavailable
// (headless Linux), we still write — marked unencrypted.
const ENC_TAG = 'SCHOOLORY1:';
const ENC_TAG_OLD = 'LEGACY1:';

function docPath() { return path.join(app.getPath('userData'), 'schoolory.json'); }
function docPathOld() { return path.join(app.getPath('userData'), 'schoolory-legacy.json'); }

function atomicWrite(file, text) {
  const tmp = `${file}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function readDoc() {
  for (const p of [docPath(), docPathOld()]) {
    try {
      const raw = fs.readFileSync(p, 'utf8');
      for (const tag of [ENC_TAG, ENC_TAG_OLD]) {
        if (raw.startsWith(tag)) {
          const dec = safeStorage.decryptString(Buffer.from(raw.slice(tag.length), 'base64'));
          return JSON.parse(dec);
        }
      }
      return JSON.parse(raw); // legacy plaintext — encrypts on next save
    } catch { /* try the next name */ }
  }
  return null;
}

function requireEnc() {
  // Packaged builds never write shop data unencrypted — on any shipping
  // platform DPAPI/Keychain is always present; refusing is the safe failure.
  if (!safeStorage.isEncryptionAvailable() && app.isPackaged) {
    throw new Error('OS encryption unavailable — refusing to write shop data unencrypted');
  }
  return safeStorage.isEncryptionAvailable();
}

function writeDoc(doc) {
  const text = JSON.stringify(doc);
  try {
    if (requireEnc()) {
      atomicWrite(docPath(), ENC_TAG + safeStorage.encryptString(text).toString('base64'));
      return;
    }
  } catch (e) { if (app.isPackaged) throw e; /* dev fallback */ }
  atomicWrite(docPath(), text);
}

// Same treatment for arbitrary JSON files (history snapshots, remote saves).
function readJsonEnc(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    if (raw.startsWith(ENC_TAG)) return JSON.parse(safeStorage.decryptString(Buffer.from(raw.slice(ENC_TAG.length), 'base64')));
    return JSON.parse(raw);
  } catch { return null; }
}

function writeJsonEnc(file, obj) {
  const text = JSON.stringify(obj);
  try {
    if (requireEnc()) {
      atomicWrite(file, ENC_TAG + safeStorage.encryptString(text).toString('base64'));
      return;
    }
  } catch (e) { if (app.isPackaged) throw e; /* dev fallback */ }
  atomicWrite(file, text);
}

// ---- PIN hashing (scrypt, per-user salt). Format: s:<saltHex>:<hashHex> ----
function hashPins(doc) {
  try {
    for (const u of (doc && doc.settings && doc.settings.users) || []) {
      if (u.pin && !String(u.pin).startsWith('s:')) {
        const salt = crypto.randomBytes(8).toString('hex');
        u.pin = 's:' + salt + ':' + crypto.scryptSync(String(u.pin), salt, 16).toString('hex');
      }
    }
  } catch { /* never block a save on hashing */ }
  return doc;
}

// Verify a candidate pin against a user record (handles hashed + legacy plain).
function verifyPinStr(storedPin, candidate) {
  const c = String(candidate || '');
  const s = String(storedPin || '');
  try {
    if (s.startsWith('s:')) {
      const [, salt, hash] = s.split(':');
      const calc = crypto.scryptSync(c, salt, 16).toString('hex');
      return crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash));
    }
  } catch { return false; }
  return s === c;
}

module.exports = { docPath, readDoc, writeDoc, readJsonEnc, writeJsonEnc, hashPins, verifyPinStr, atomicWrite };
