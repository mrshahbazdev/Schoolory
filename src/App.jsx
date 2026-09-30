import React, { useEffect, useRef, useState } from 'react';
import { emptyStore, sampleStore, newItem, fmt } from './lib/model.js';
import Dashboard from './components/Dashboard.jsx';
import ItemsPanel from './components/ItemsPanel.jsx';
import SalePanel from './components/SalePanel.jsx';
import StockPanel from './components/StockPanel.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import DayBookPanel from './components/DayBookPanel.jsx';
import ReportsPanel from './components/ReportsPanel.jsx';
import PartiesPanel from './components/PartiesPanel.jsx';
import PurchasesPanel from './components/PurchasesPanel.jsx';
import ReturnsPanel from './components/ReturnsPanel.jsx';
import PinGate from './components/PinGate.jsx';
import { installWebApi } from './lib/webapi.js';
import { itemsCsv } from './lib/csv.js';

// LAN host mode: opened in a plain browser on a second PC — install the fetch
// shim before anything calls window.api.
installWebApi();

const NAV = [
  { sec: 'Counter', secUr: 'کاؤنٹر', items: [
    { id: 'sale', label: 'New sale', ur: 'فروخت', glyph: '🧾' },
    { id: 'dash', label: 'Dashboard', ur: 'ڈیش بورڈ', glyph: '⌂' },
    { id: 'daybook', label: 'Day book', ur: 'روزنامچہ', glyph: '▤' },
    { id: 'returns', label: 'Returns', ur: 'واپسی', glyph: '↩' }
  ]},
  { sec: 'Store', secUr: 'اسٹور', items: [
    { id: 'items', label: 'Items', ur: 'اشیاء', glyph: '▦' },
    { id: 'stock', label: 'Stock in/out', ur: 'اسٹاک', glyph: '⇅' },
    { id: 'purchases', label: 'Purchases', ur: 'خریداری', glyph: '⤓' },
    { id: 'parties', label: 'Khata / parties', ur: 'کھاتہ', glyph: '📒' },
    { id: 'reports', label: 'Reports', ur: 'رپورٹ', glyph: '☷' },
    { id: 'settings', label: 'Settings', ur: 'ترتیبات', glyph: '⚙' }
  ]}
];
const COUNTER_TABS = ['sale', 'dash', 'daybook'];

export default function App() {
  const [store, setStore] = useState(null);
  const [user, setUser] = useState(null);
  const idleRef = useRef(null);
  useEffect(() => {
    if (!user) return;
    const reset = () => { clearTimeout(idleRef.current); idleRef.current = setTimeout(() => setUser(null), 10 * 60 * 1000); };
    ['mousemove', 'keydown', 'click'].forEach(e => window.addEventListener(e, reset));
    reset();
    return () => { clearTimeout(idleRef.current); ['mousemove', 'keydown', 'click'].forEach(e => window.removeEventListener(e, reset)); };
  }, [user]);
  const [tab, setTab] = useState('sale');
  const [version, setVersion] = useState('');
  const saveTimer = useRef(null);

  useEffect(() => {
    (async () => {
      const { doc } = await window.api.store.load();
      const hasData = doc && (doc.items?.length || doc.sales?.length || doc.settings?.firstRunDone);
      if (hasData) {
        const base = emptyStore();
        Object.keys(base).forEach(k => { if (doc[k] === undefined) doc[k] = base[k]; });
        ['stockMoves', 'expenses', 'auditLog', 'customers', 'suppliers', 'khata', 'purchases', 'returns', 'zreports'].forEach(k => { if (!Array.isArray(doc[k])) doc[k] = []; });
        doc.settings = { ...emptyStore().settings, ...(doc.settings || {}) };
        setStore(doc);
      } else setStore(sampleStore());
      setVersion(await window.api.app.version().catch(() => ''));
    })();
  }, []);

  useEffect(() => {
    if (!store) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      window.api.store.save(store);
      if (store.settings.syncFolder) {
        const text = JSON.stringify(store);
        window.api.export.toFolder({ folder: store.settings.syncFolder, name: 'schoolory-sync.json', text });
        syncText.current = text;
      }
      if (store.settings.syncAuto !== false) window.api.sync.publish(store);
    }, 600);
    return () => clearTimeout(saveTimer.current);
  }, [store]);

  // LAN sync: adopt a newer store pushed by another Schoolory on the network.
  useEffect(() => {
    if (!window.api.sync?.onApply) return;
    window.api.sync.onApply(doc => {
      const base = emptyStore();
      Object.keys(base).forEach(k => { if (doc[k] === undefined) doc[k] = base[k]; });
      doc.settings = { ...base.settings, ...(doc.settings || {}) };
      setStore(doc);
      setSyncFlash(Date.now());
    });
  }, []);

  // Sync-folder polling: same shared path on both PCs keeps them in lock-step.
  const syncText = useRef('');
  const [syncFlash, setSyncFlash] = useState(0);
  useEffect(() => {
    const t = setInterval(async () => {
      const folder = store?.settings?.syncFolder;
      if (!folder || store?.settings?.syncAuto === false) return;
      const res = await window.api.export.readFromFolder({ folder, name: 'schoolory-sync.json' }).catch(() => null);
      if (!res?.ok || !res.text) return;
      if (res.text === syncText.current || res.text === JSON.stringify(store)) return;
      try {
        const doc = JSON.parse(res.text);
        if (!doc || !Array.isArray(doc.items)) return;
        const base = emptyStore();
        Object.keys(base).forEach(k => { if (doc[k] === undefined) doc[k] = base[k]; });
        doc.settings = { ...base.settings, ...(doc.settings || {}) };
        syncText.current = res.text;
        setStore(doc);
        setSyncFlash(Date.now());
      } catch { /* partial write — retry next poll */ }
    }, 5000);
    return () => clearInterval(t);
  }, [store]);

  const update = (fn, label) => setStore(s => {
    const next = structuredClone(s);
    fn(next);
    next.auditLog = next.auditLog || [];
    next.updatedAt = Date.now();
    next.auditLog.push({ at: new Date().toISOString(), user: (user && user.name) || 'app', what: label || 'edit' });
    if (next.auditLog.length > 500) next.auditLog = next.auditLog.slice(-500);
    return next;
  });

  const exportAllJson = () => {
    const json = JSON.stringify(store, null, 2);
    window.api.export.json({ json, suggestedName: 'schoolory-backup.json' });
    if (store.settings.backupFolder)
      window.api.export.toFolder({ folder: store.settings.backupFolder, name: `schoolory-backup-${new Date().toISOString().slice(0, 10)}.json`, text: json });
    update(s => s.settings.lastBackupAt = new Date().toISOString().slice(0, 10));
  };
  const exportItemsCsv = () => window.api.export.text({ text: itemsCsv(store), suggestedName: 'schoolory-items.csv' });
  const importJson = async () => {
    const f = await window.api.app.openFile({ filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!f?.text) return;
    try {
      const parsed = JSON.parse(f.text);
      if (!parsed.items) throw new Error('not an Schoolory backup');
      await window.api.store.snapshot(store, 'before import');
      setStore({ ...emptyStore(), ...parsed });
    } catch (e) { alert('Could not import: ' + e.message); }
  };

  if (!store) return <div className="boot">Loading…</div>;

  if ((store.settings.users || []).length && !user)
    return <PinGate store={store} onLogin={setUser} />;

  const firstRun = !store.settings.firstRunDone;
  const ur = !!store.settings.uiUrdu;
  const counter = user && user.role === 'counter';
  const nav = counter
    ? NAV.map(g => ({ ...g, items: g.items.filter(i => COUNTER_TABS.includes(i.id)) })).filter(g => g.items.length)
    : NAV;
  if (counter && !COUNTER_TABS.includes(tab)) setTab('sale');
  return (
    <div className="app" dir={ur ? 'rtl' : 'ltr'}>
      <aside className="side">
        <div className="sbrand"><span className="smark">▣</span><div><div className="sname">Schoolory</div><div className="ssub">Shop register</div></div></div>
        {nav.map(g => (
          <div key={g.sec} className="sgrp">
            <div className="ssec">{ur ? (g.secUr || g.sec) : g.sec}</div>
            {g.items.map(t => (
              <button key={t.id} className={'snav' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>
                <span className="sglyph">{t.glyph}</span>{ur ? (t.ur || t.label) : t.label}
              </button>
            ))}
          </div>
        ))}
        <div className="sfoot">
          <div className="sdotline"><span className="sdot" />Offline</div>
          <span>Data stays on this computer</span>
        </div>
      </aside>

      <div className="main">
        <header className="status">
          <div className="stline">
            <b>{store.settings.shopName || 'Shop'}</b>
            <span className="opd">Register open</span>
            {store.settings.syncAuto !== false && (
              <span className="opd" title="Auto-sync on — updates move between Schoolory apps on this WiFi/LAN automatically"
                style={Date.now() - syncFlash < 8000 ? { background: '#bbf7d0', color: '#166534' } : { background: '#e0f2fe', color: '#0369a1' }}>
                ↻ Live sync
              </span>)}
            {user && <span className="muted">👤 {user.name} <button className="icon" title="Lock" onClick={() => setUser(null)}>🔒</button></span>}
          </div>
          <span className="spacer" />
          <div className="top-actions">
            <button className="btn ghost" onClick={exportAllJson} title="Backup everything as JSON">Backup</button>
            <button className="btn ghost" onClick={exportItemsCsv}>Items CSV</button>
            <button className="btn ghost" onClick={importJson}>Import</button>
            <button className="btn" onClick={() => setTab('sale')}>+ New sale</button>
          </div>
        </header>

        {firstRun && (
          <div className="welcome">
            <h1>Welcome to Schoolory</h1>
            <p>A sample shop (Al-Noor General Store) with 16 items, today's sales and stock movements is loaded so you can try everything — ring up a sale, print the receipt, check the day book.</p>
            <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: 560 }}>
              <b>Your consent & privacy:</b> by using Schoolory you agree that shop records (items, stock,
              sales and expenses) are entered and stored <b>only on this computer</b> — encrypted at rest.
              Nothing is uploaded anywhere; the app makes no internet connection, and LAN sharing stays
              off unless you turn it on. You are responsible for backups and for the lawful handling of
              these records.
            </p>
            <div className="welcome-actions">
              <button className="btn" onClick={() => update(s => { s.settings.firstRunDone = true; s.settings.consent = { at: new Date().toISOString(), version }; })}>I accept — explore sample data</button>
              <button className="btn ghost" onClick={() => { setStore({ ...emptyStore(), settings: { ...emptyStore().settings, firstRunDone: true, consent: { at: new Date().toISOString(), version } } }); setTab('settings'); }}>I accept — start blank, set up my shop</button>
            </div>
          </div>
        )}

        <main className="body">
          {tab === 'dash' && <Dashboard store={store} update={update} go={setTab} />}
          {tab === 'sale' && <SalePanel store={store} update={update} user={user} />}
          {tab === 'items' && <ItemsPanel store={store} update={update} />}
          {tab === 'stock' && <StockPanel store={store} update={update} />}
          {tab === 'daybook' && <DayBookPanel store={store} update={update} />}
          {tab === 'returns' && <ReturnsPanel store={store} update={update} user={user} />}
          {tab === 'parties' && <PartiesPanel store={store} update={update} />}
          {tab === 'purchases' && <PurchasesPanel store={store} update={update} user={user} />}
          {tab === 'reports' && <ReportsPanel store={store} />}
          {tab === 'settings' && <SettingsPanel store={store} update={update} setStore={setStore} />}
        </main>
        <footer className="foot">Schoolory v{version} — offline stock &amp; sales register. Data is encrypted on this computer.</footer>
      </div>
    </div>
  );
}
