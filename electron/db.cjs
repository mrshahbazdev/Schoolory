const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, safeStorage } = require('electron');
const Database = require('better-sqlite3-multiple-ciphers');
const { readDoc, hashPins } = require('./ipc/doc-io.cjs');

/**
 * SQLite document store (better-sqlite3-multiple-ciphers → SQLCipher).
 * - schoolory.db lives in userData, encrypted with a random key (the key itself
 *   is wrapped by OS safeStorage / DPAPI and kept in db.key next to the
 *   database).
 * - WAL + foreign keys on; every write is record-level inside one transaction.
 * - mergeSave diffs the client's doc against the doc that client last loaded
 *   (tracked by rev) and applies ONLY the rows that client changed — so two
 *   tills/counters on different PCs no longer overwrite each other.
 * - Never put schoolory.db on a network share: SMB locking corrupts SQLite.
 *   The multi-PC path stays host + HTTP.
 */

const TABLES = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT, role TEXT, pin TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, adm_no TEXT, name TEXT, data TEXT NOT NULL, updated TEXT);
CREATE INDEX IF NOT EXISTS idx_students_adm ON students(adm_no);
CREATE TABLE IF NOT EXISTS challans (id TEXT PRIMARY KEY, no INTEGER, month TEXT, data TEXT NOT NULL, updated TEXT);
CREATE INDEX IF NOT EXISTS idx_challans_month ON challans(month);
CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, no INTEGER, date TEXT, data TEXT NOT NULL, updated TEXT);
CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(date);
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, user TEXT, action TEXT, entity TEXT, entity_id TEXT, data TEXT);
CREATE TABLE IF NOT EXISTS records (collection TEXT, id TEXT, data TEXT NOT NULL, updated TEXT, PRIMARY KEY (collection, id));
`;

// Collections with dedicated tables; everything else (sessions, classes,
// enrolments, feePlans, ...) lands in `records`.
const DEDICATED = new Set(['students', 'challans', 'receipts']);

let db = null;
let lastDoc = null;          // doc as last assembled/saved by THIS process
const revDocs = new Map();   // rev → doc the client based its edit on
let revCounter = 0;

function keyForDb() {
  const kf = path.join(app.getPath('userData'), 'db.key');
  try {
    const raw = fs.readFileSync(kf, 'utf8').trim();
    if (raw) {
      try { return safeStorage.decryptString(Buffer.from(raw, 'base64')); } catch { return raw; }
    }
  } catch {}
  const key = crypto.randomBytes(32).toString('hex');
  try {
    const wrapped = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(key).toString('base64')
      : key; // dev machines only — packaged builds refuse above
    fs.writeFileSync(kf, wrapped, 'utf8');
  } catch {}
  return key;
}

function openDb() {
  if (db) return db;
  if (app.isPackaged && !safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption unavailable — cannot open encrypted store database');
  }
  const dir = app.getPath('userData');
  db = new Database(path.join(dir, 'schoolory.db'));
  db.pragma(`key='${keyForDb()}'`);
  db.exec(TABLES);
  revCounter = Number((db.prepare(`SELECT v FROM meta WHERE k='rev'`).get() || {}).v || 0);
  migrateFromJson();
  return db;
}

// ---- migration: one-shot import of the legacy schoolory.json ----
function migrateFromJson() {
  const done = (db.prepare(`SELECT v FROM meta WHERE k='migrated'`).get() || {}).v;
  if (done) return;
  const doc = readDoc();
  if (doc && Array.isArray(doc.students)) {
    const base = { version: 1, students: [], settings: { users: [] } };
    applyChanges(diffDocs(base, doc), 'migration');
    saveSettings(doc.settings || {}, 'migration');
    if (doc.updatedAt) db.prepare(`INSERT OR REPLACE INTO meta (k, v) VALUES ('updatedAt', ?)`).run(String(doc.updatedAt));
    try {
      fs.renameSync(
        path.join(app.getPath('userData'), 'schoolory.json'),
        path.join(app.getPath('userData'), 'schoolory.json.migrated')
      );
    } catch {}
  }
  db.prepare(`INSERT OR REPLACE INTO meta (k, v) VALUES ('migrated', '1')`).run();
}

// ---- doc <-> rows ----
function loadDoc() {
  openDb();
  const doc = { version: 1 };
  doc.students = db.prepare(`SELECT data FROM students`).all().map(r => JSON.parse(r.data));
  doc.challans = db.prepare(`SELECT data FROM challans`).all().map(r => JSON.parse(r.data));
  doc.receipts = db.prepare(`SELECT data FROM receipts`).all().map(r => JSON.parse(r.data));
  const s = db.prepare(`SELECT data FROM settings WHERE id = 1`).get();
  doc.settings = s ? JSON.parse(s.data) : {};
  // PIN hashes never leave this process — clients get an 's:x' marker only.
  doc.settings.users = db.prepare(`SELECT data FROM users`).all().map(r => {
    const u = JSON.parse(r.data);
    return { ...u, pin: u.pin ? 's:x' : '' };
  });
  for (const r of db.prepare(`SELECT collection, data FROM records`).all()) {
    (doc[r.collection] = doc[r.collection] || []).push(JSON.parse(r.data));
  }
  doc.updatedAt = (db.prepare(`SELECT v FROM meta WHERE k='updatedAt'`).get() || {}).v || doc.updatedAt;
  return doc;
}

// Diff two docs → { collection: { upserts:[row], deletes:[id] } } (+ settings).
function diffDocs(base, next) {
  const changes = {};
  const cols = new Set([...Object.keys(base || {}), ...Object.keys(next || {})]);
  for (const k of cols) {
    if (k === 'settings' || k === 'version' || k === 'updatedAt') continue;
    if (!Array.isArray(next[k]) && !Array.isArray(base && base[k])) continue;
    const oldRows = new Map(((base || {})[k] || []).map(r => [r.id, r]));
    const newRows = new Map((next[k] || []).map(r => [r.id || (r.id = 'x' + crypto.randomBytes(6).toString('hex')), r]));
    const upserts = [];
    const deletes = [];
    for (const [id, row] of newRows) {
      const old = oldRows.get(id);
      if (!old || JSON.stringify(old) !== JSON.stringify(row)) upserts.push(row);
    }
    for (const id of oldRows.keys()) if (!newRows.has(id)) deletes.push(id);
    if (upserts.length || deletes.length) changes[k] = { upserts, deletes };
  }
  return changes;
}

function rowCols(collection, row) {
  switch (collection) {
    case 'students': return [row.id, row.adm_no || '', row.name || '', JSON.stringify(row), row.updatedAt || ''];
    case 'challans': return [row.id, row.no ?? null, row.month || '', JSON.stringify(row), ''];
    case 'receipts': return [row.id, row.no ?? null, row.received_on || row.date || '', JSON.stringify(row), ''];
    default: return [collection, row.id, JSON.stringify(row), ''];
  }
}

function applyChanges(changes, actor) {
  const now = new Date().toISOString();
  const audit = db.prepare(`INSERT INTO audit_log (at, user, action, entity, entity_id, data) VALUES (?,?,?,?,?,?)`);
  let writes = 0;
  const txn = db.transaction(() => {
    for (const [col, c] of Object.entries(changes)) {
      for (const row of c.upserts) {
        if (DEDICATED.has(col)) {
          const q = col === 'students'
            ? `INSERT OR REPLACE INTO students (id, adm_no, name, data, updated) VALUES (?,?,?,?,?)`
            : col === 'challans'
            ? `INSERT OR REPLACE INTO challans (id, no, month, data, updated) VALUES (?,?,?,?,?)`
            : `INSERT OR REPLACE INTO receipts (id, no, date, data, updated) VALUES (?,?,?,?,?)`;
          db.prepare(q).run(...rowCols(col, { ...row, updatedAt: now }));
        } else {
          db.prepare(`INSERT OR REPLACE INTO records (collection, id, data, updated) VALUES (?,?,?,?)`)
            .run(col, row.id, JSON.stringify(row), now);
        }
        writes++;
      }
      for (const id of c.deletes) {
        if (DEDICATED.has(col)) db.prepare(`DELETE FROM ${col} WHERE id = ?`).run(id);
        else db.prepare(`DELETE FROM records WHERE collection = ? AND id = ?`).run(col, id);
        writes++;
      }
    }
    if (writes) {
      audit.run(now, actor || 'app', 'save', '', '', JSON.stringify(Object.fromEntries(Object.entries(changes).map(([k, c]) => [k, { u: c.upserts.length, d: c.deletes.length }]))));
      revCounter++;
      db.prepare(`INSERT OR REPLACE INTO meta (k, v) VALUES ('rev', ?)`).run(String(revCounter));
    }
  });
  txn();
  return writes;
}

function saveSettings(settings, actor) {
  const { users, ...rest } = settings || {};
  const prev = db.prepare(`SELECT data FROM settings WHERE id = 1`).get();
  if (!prev || prev.data !== JSON.stringify(rest)) {
    db.prepare(`INSERT OR REPLACE INTO settings (id, data) VALUES (1, ?)`).run(JSON.stringify(rest));
    auditRow(actor, 'settings');
  }
  // users table is authoritative for the pin column (hash happens here)
  const oldUsers = new Map(db.prepare(`SELECT id, data FROM users`).all().map(r => [r.id, JSON.parse(r.data)]));
  const newIds = new Set();
  for (const u of (users || [])) {
    newIds.add(u.id);
    const old = oldUsers.get(u.id);
    // 's:x' is the client-side marker for an existing PIN — keep the stored hash.
    const merged = { ...u, pin: (u.pin === 's:x' || (old && u.pin === old.pin)) ? (old ? old.pin : '') : u.pin };
    if (!old || JSON.stringify(old) !== JSON.stringify(merged)) {
      const hashed = hashPins({ settings: { users: [merged] } }).settings.users[0];
      db.prepare(`INSERT OR REPLACE INTO users (id, name, role, pin, data) VALUES (?,?,?,?,?)`)
        .run(u.id, u.name || '', u.role || '', hashed.pin || '', JSON.stringify(hashed));
      auditRow(actor, 'users', u.id);
    }
  }
  for (const id of oldUsers.keys()) if (!newIds.has(id)) db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
}

function auditRow(actor, entity, entityId) {
  db.prepare(`INSERT INTO audit_log (at, user, action, entity, entity_id, data) VALUES (?,?,?,?,?,?)`)
    .run(new Date().toISOString(), actor || 'app', 'write', entity, entityId || '', '{}');
}

/**
 * Merge a client's doc into the DB. baseline = the doc that client last loaded
 * (looked up by baseRev); without one we diff against the last doc this process
 * produced. Only the client's own row-level changes are applied — rows other
 * clients touched in between are preserved.
 */
function mergeSave(clientDoc, { actor = 'app', baseRev } = {}) {
  openDb();
  const baseline = (baseRev && revDocs.get(baseRev)) || lastDoc || { version: 1, students: [], settings: {} };
  const changes = diffDocs(baseline, clientDoc);
  const txn = db.transaction(() => {
    const writes = applyChanges(changes, actor);
    const cur = db.prepare(`SELECT data FROM settings WHERE id = 1`).get();
    const curSettings = cur ? { ...JSON.parse(cur.data), users: db.prepare(`SELECT data FROM users`).all().map(r => JSON.parse(r.data)) } : { users: [] };
    if (JSON.stringify(stripUsers(curSettings)) !== JSON.stringify(stripUsers(clientDoc.settings || {})) ||
        JSON.stringify(usersOf(curSettings)) !== JSON.stringify(usersOf(clientDoc.settings || {}))) {
      saveSettings(clientDoc.settings, actor);
    }
    if (clientDoc.updatedAt !== (db.prepare(`SELECT v FROM meta WHERE k='updatedAt'`).get() || {}).v) {
      db.prepare(`INSERT OR REPLACE INTO meta (k, v) VALUES ('updatedAt', ?)`).run(String(clientDoc.updatedAt || ''));
    }
    return writes;
  });
  const writes = txn();
  const saved = loadDoc();
  lastDoc = saved;
  revDocs.set(revCounter, saved);
  if (revDocs.size > 30) revDocs.delete(revDocs.keys().next().value);
  return { ok: true, rev: revCounter, writes };
}

function stripUsers(s) { const { users, ...r } = s || {}; return r; }
// Compare users in marker form — real hashes must never travel to clients.
function usersOf(s) { return ((s && s.users) || []).map(u => ({ ...u, pin: u.pin ? 's:x' : '' })); }

function serveDoc() {
  const doc = loadDoc();
  lastDoc = doc;
  revDocs.set(revCounter, doc);   // the baseline this client will edit from
  if (revDocs.size > 30) revDocs.delete(revDocs.keys().next().value);
  return { doc, rev: revCounter };
}

// record-level API used by host.cjs
function listRows(collection, q) {
  openDb();
  const rows = DEDICATED.has(collection)
    ? db.prepare(`SELECT data FROM ${collection}`).all().map(r => JSON.parse(r.data))
    : db.prepare(`SELECT data FROM records WHERE collection = ?`).all(collection).map(r => JSON.parse(r.data));
  return filterRows(rows, q);
}
function filterRows(rows, q) {
  if (!q) return rows;
  const needle = String(q).toLowerCase();
  return rows.filter(r => JSON.stringify(r).toLowerCase().includes(needle));
}
function getRow(collection, id) {
  openDb();
  const r = DEDICATED.has(collection)
    ? db.prepare(`SELECT data FROM ${collection} WHERE id = ?`).get(id)
    : db.prepare(`SELECT data FROM records WHERE collection = ? AND id = ?`).get(collection, id);
  return r ? JSON.parse(r.data) : null;
}
function putRow(collection, row, actor) {
  openDb();
  if (!row || !row.id) row.id = 'x' + crypto.randomBytes(6).toString('hex');
  applyChanges({ [collection]: { upserts: [row], deletes: [] } }, actor);
  return { ok: true, id: row.id, rev: revCounter };
}
function patchRow(collection, id, patch, actor) {
  const cur = getRow(collection, id);
  if (!cur) return { ok: false, error: 'not found' };
  return putRow(collection, { ...cur, ...patch, id }, actor);
}
function deleteRow(collection, id, actor) {
  openDb();
  applyChanges({ [collection]: { upserts: [], deletes: [id] } }, actor);
  return { ok: true, rev: revCounter };
}

function currentRev() { openDb(); return revCounter; }

module.exports = { openDb, loadDoc, serveDoc, mergeSave, listRows, getRow, putRow, patchRow, deleteRow, currentRev };
