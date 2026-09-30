const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { BrowserWindow, app } = require('electron');

/**
 * Takes fully-formed HTML from the renderer and puts it on paper.
 *
 * Written to a temp file and loaded with loadFile rather than a data: URL —
 * data URLs create an opaque origin that blocks embedded images and fonts.
 */
async function withRenderWindow(html, fn) {
  const tmp = path.join(os.tmpdir(), `mdr_${crypto.randomBytes(8).toString('hex')}.html`);
  fs.writeFileSync(tmp, html, 'utf8');

  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      javascript: true
    }
  });

  try {
    await win.loadFile(tmp);
    await settle(win);
    return await fn(win);
  } finally {
    if (!win.isDestroyed()) win.destroy();
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
  }
}

/** Wait for fonts and images, otherwise the PDF comes out unstyled. */
function settle(win) {
  return win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const done = () => requestAnimationFrame(() => requestAnimationFrame(resolve));
      const waitImages = () => {
        const imgs = Array.from(document.images).filter(i => !i.complete);
        if (!imgs.length) return done();
        let left = imgs.length;
        const tick = () => (--left <= 0) && done();
        imgs.forEach(i => { i.addEventListener('load', tick); i.addEventListener('error', tick); });
        setTimeout(done, 3000);
      };
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(waitImages);
      else waitImages();
    })
  `).catch(() => {});
}

async function toPDF(html) {
  const buffer = await withRenderWindow(html, (win) =>
    win.webContents.printToPDF({
      printBackground: true,
      // The template declares @page { size: A4 }, so let CSS win.
      preferCSSPageSize: true,
      margins: { marginType: 'none' }
    })
  );

  const dir = path.join(app.getPath('userData'), 'output');
  fs.mkdirSync(dir, { recursive: true });
  return { buffer };
}

async function printHTML(html) {
  return withRenderWindow(html, (win) =>
    new Promise((resolve) => {
      win.webContents.print({ printBackground: true }, (ok, reason) => resolve({ ok, reason: reason || '' }));
    })
  );
}

module.exports = { toPDF, printHTML };
