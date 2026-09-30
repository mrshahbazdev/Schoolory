const fs = require('fs');
const path = require('path');
const { ipcMain, dialog, BrowserWindow } = require('electron');
const { toPDF, printHTML } = require('../print/render.cjs');

function registerExportIPC() {
  const win = () => BrowserWindow.getAllWindows()[0];

  // Write a text file into a fixed folder (USB/LAN sync destination the user configured).
  ipcMain.handle('export:toFolder', (_e, { folder, name, text }) => {
    try {
      if (!folder) return { ok: false, error: 'no folder' };
      fs.mkdirSync(folder, { recursive: true });
      const fp = path.join(folder, name);
      fs.writeFileSync(fp, text, 'utf8');
      return { ok: true, filePath: fp };
    } catch (err) { return { ok: false, error: String(err) }; }
  });

  // Read a file back from the shared folder (LAN auto-sync watcher uses this).
  ipcMain.handle('export:readFromFolder', (_e, { folder, name }) => {
    try {
      if (!folder) return { ok: false, error: 'no folder' };
      const fp = path.join(folder, name);
      if (!fs.existsSync(fp)) return { ok: false, error: 'not found' };
      return { ok: true, text: fs.readFileSync(fp, 'utf8'), mtimeMs: fs.statSync(fp).mtimeMs };
    } catch (err) { return { ok: false, error: String(err) }; }
  });

  // Vector PDF: real text, selectable and searchable, fonts embedded by Chromium.
  ipcMain.handle('export:pdf', async (_e, { html, suggestedName }) => {
    const res = await dialog.showSaveDialog(win(), {
      defaultPath: suggestedName || 'prescription.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (res.canceled || !res.filePath) return { cancelled: true };
    const { buffer } = await toPDF(html);
    fs.writeFileSync(res.filePath, buffer);
    return { ok: true, filePath: res.filePath };
  });

  ipcMain.handle('export:print', async (_e, { html }) => printHTML(html));

  ipcMain.handle('export:text', async (_e, { text, suggestedName }) => {
    const res = await dialog.showSaveDialog(win(), {
      defaultPath: suggestedName || 'export.txt',
      filters: [{ name: 'Plain text', extensions: ['txt'] }]
    });
    if (res.canceled || !res.filePath) return { cancelled: true };
    fs.writeFileSync(res.filePath, text, 'utf8');
    return { ok: true, filePath: res.filePath };
  });

  // Binary exports (e.g. DOCX) arrive as base64 from the renderer.
  ipcMain.handle('export:binary', async (_e, { base64, suggestedName, filters }) => {
    const res = await dialog.showSaveDialog(win(), {
      defaultPath: suggestedName || 'export',
      filters: filters || [{ name: 'Document', extensions: ['docx'] }]
    });
    if (res.canceled || !res.filePath) return { cancelled: true };
    fs.writeFileSync(res.filePath, Buffer.from(base64, 'base64'));
    return { ok: true, filePath: res.filePath };
  });

  ipcMain.handle('export:json', async (_e, { json, suggestedName }) => {
    const res = await dialog.showSaveDialog(win(), {
      defaultPath: suggestedName || 'export.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (res.canceled || !res.filePath) return { cancelled: true };
    fs.writeFileSync(res.filePath, json, 'utf8');
    return { ok: true, filePath: res.filePath };
  });
}

module.exports = { registerExportIPC };
