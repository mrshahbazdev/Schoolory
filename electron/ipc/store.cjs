const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, ipcMain } = require('electron');
const { readJsonEnc, writeJsonEnc, verifyPinStr } = require('./doc-io.cjs');
const { serveDoc, mergeSave, loadDoc } = require('../db.cjs');

/**
 * Document store: the live data lives in schoolory.db (SQLCipher-encrypted
 * SQLite, WAL) — see ../db.cjs. Writes merge at ROW level via rev baselines,
 * so two PCs editing different records don't clobber each other. Timestamped
 * snapshots in history/ stay as encrypted JSON so a bad state can be rolled
 * back wholesale.
 */
const MAX_HISTORY = 50;

function storeDir() {
  return app.getPath('userData');
}

function docPath() {
  return path.join(storeDir(), 'schoolory.json');
}

function historyDir() {
  return path.join(storeDir(), 'history');
}

function atomicWrite(file, text) {
  const tmp = `${file}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function registerStoreIPC() {
  ipcMain.handle('store:load', () => {
    const { doc } = serveDoc();
    return { doc };
  });

  // Record-level merge: only the rows the renderer changed are written
  // (single transaction), so concurrent writers on other PCs don't get wiped.
  ipcMain.handle('store:save', (_e, doc) => mergeSave(doc, { actor: 'app' }));

  // PIN gate is enforced in the main process — hashed PINs never leave it
  // in a verifiable form for the renderer to compare.
  ipcMain.handle('auth:verifyUserPin', (_e, { userId, candidate }) => {
    const row = require('../db.cjs').getRow('users', userId);
    return { ok: !!(row && row.pin && verifyPinStr(row.pin, candidate)) };
  });

  ipcMain.handle('store:snapshot', (_e, doc, label) => {
    fs.mkdirSync(historyDir(), { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const id = `${stamp}_${crypto.randomBytes(3).toString('hex')}`;
    writeJsonEnc(
      path.join(historyDir(), `${id}.json`),
      { id, label: label || '', at: new Date().toISOString(), doc }
    );
    prune();
    return { ok: true, id };
  });

  ipcMain.handle('store:history', () => {
    try {
      return fs.readdirSync(historyDir())
        .filter(f => f.endsWith('.json'))
        .map(f => {
          try {
            const s = readJsonEnc(path.join(historyDir(), f));
            return s ? { id: s.id, label: s.label, at: s.at } : null;
          } catch { return null; }
        })
        .filter(Boolean)
        .sort((a, b) => b.at.localeCompare(a.at));
    } catch {
      return [];
    }
  });

  ipcMain.handle('store:restore', (_e, id) => {
    if (!/^[\w-]+$/.test(id)) return { doc: null };
    try {
      const s = readJsonEnc(path.join(historyDir(), `${id}.json`));
      return { doc: s ? s.doc : null };
    } catch {
      return { doc: null };
    }
  });
}

// Scheduled off-app backup: once per day an encrypted copy of the whole store
// is written into settings.backupFolder (a USB drive or synced folder). The
// dashboard banner warns when lastBackupAt goes stale — this keeps it fresh.
function maybeAutoBackup() {
  try {
    const doc = loadDoc();
    const st = doc.settings || {};
    const today = new Date().toISOString().slice(0, 10);
    if (!st.backupFolder || st.lastBackupAt === today) return;
    fs.mkdirSync(st.backupFolder, { recursive: true });
    writeJsonEnc(path.join(st.backupFolder, `schoolory-backup-${today}.json`), doc);
    mergeSave({ ...doc, settings: { ...st, lastBackupAt: today } }, { actor: 'auto-backup' });
  } catch { /* backup is best-effort — surface via the stale-banner instead */ }
}
setInterval(maybeAutoBackup, 30 * 60 * 1000).unref();
setTimeout(maybeAutoBackup, 20 * 1000).unref();

function prune() {
  try {
    const files = fs.readdirSync(historyDir()).filter(f => f.endsWith('.json')).sort();
    const extra = files.length - MAX_HISTORY;
    for (let i = 0; i < extra; i++) fs.unlinkSync(path.join(historyDir(), files[i]));
  } catch { /* pruning is best-effort */ }
}

module.exports = { registerStoreIPC };
