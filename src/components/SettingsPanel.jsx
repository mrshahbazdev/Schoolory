import React, { useEffect, useState } from 'react';
import { emptyStore, defaultSettings, ROLES } from '../lib/model.js';

function LanConnect({ st, mut }) {
  const [info, setInfo] = useState(null);
  const refresh = () => window.api.host?.info().then(setInfo).catch(() => {});
  useEffect(() => { refresh(); }, []);
  if (!info) return null;
  if (info.remote) return (
    <div className="pcard" style={{ marginBottom: 14, fontSize: 13 }}>
      ✅ Connected to the office PC at <b>{info.urls[0]}</b> — everything you enter here saves on the office PC.
    </div>
  );
  return (
    <div className="pcard" style={{ marginBottom: 14, fontSize: 13, lineHeight: 1.7 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
        <input type="checkbox" checked={!!info.enabled} onChange={async e => {
          mut(x => x.hostOn = e.target.checked);
          const r = await window.api.host.set(e.target.checked);
          setInfo({ ...info, enabled: r.enabled, error: r.error });
          refresh();
        }} />
        Share Schoolory on this WiFi — other office PCs open it in a browser; all data saves on THIS computer
      </label>
      {info.error && <div style={{ color: '#dc2626', marginTop: 6 }}>⚠ Could not start sharing: {info.error}</div>}
      {info.enabled && (<>
        <div style={{ marginTop: 8 }}>On the other device open Chrome/Edge and type one of these links, then enter the access code once:</div>
        {(info.urls || []).map(u => (
          <div key={u} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <code style={{ fontSize: 14, fontWeight: 700, background: '#eef4ff', padding: '3px 10px', borderRadius: 6 }}>{u}</code>
            <button className="btn small ghost" onClick={() => navigator.clipboard?.writeText(u)}>Copy</button>
          </div>
        ))}
        <div style={{ marginTop: 8 }}>Access code: <code style={{ fontSize: 15, fontWeight: 800, background: '#fef3c7', padding: '2px 10px', borderRadius: 6, letterSpacing: 2 }}>{info.token}</code>
          <button className="btn small ghost" title="New code — every paired device must re-enter it" onClick={async () => {
            if (!confirm('Regenerate the access code? Every connected device will be locked out until the new code is entered there.')) return;
            await window.api.host.rotateCode(); refresh();
          }}>Regenerate</button>
          <span className="muted"> — without this code no one on the WiFi can read or change the school data.</span></div>
      </>)}
      {!info.enabled && <div className="muted" style={{ marginTop: 6 }}>Off — the school database is not reachable from any other device. Access code for pairing: <code style={{ fontWeight: 700 }}>{info.token}</code></div>}
      <label className="lbl" style={{ display: 'block', marginTop: 10 }}>Pair code (for app-to-app sync): if THIS PC is the second computer, enter the office PC's access code here
        <input className="in" value={st.syncCode || ''} placeholder="e.g. A1B2C3D4" onChange={e => mut(x => x.syncCode = e.target.value.trim().toUpperCase())} /></label>
    </div>
  );
}

export default function SettingsPanel({ store, update, setStore }) {
  const [history, setHistory] = useState(null);
  const st = store.settings;
  const mut = (fn) => update(s => fn(s.settings));

  const loadHistory = async () => setHistory(await window.api.store.history());
  const restore = async (id) => {
    const { doc } = await window.api.store.restore(id);
    if (doc && confirm('Replace current data with this snapshot? (current state is snapshotted first)')) {
      await window.api.store.snapshot(store, 'before restore');
      setStore(doc);
      setHistory(null);
    }
  };

  return (
    <div className="panel">
      <h2 className="ptitle">School &amp; challan header</h2>
      <div className="form" style={{ marginBottom: 16 }}>
        <div className="frow">
          <input className="in" style={{ flex: 1 }} value={st.schoolName || ''} placeholder="School name" onChange={e => mut(x => x.schoolName = e.target.value)} />
          <input className="in" value={st.schoolPhone || ''} placeholder="Phone" onChange={e => mut(x => x.schoolPhone = e.target.value)} />
          <input className="in" style={{ width: 110 }} value={st.currency || 'Rs'} placeholder="Currency" onChange={e => mut(x => x.currency = e.target.value)} />
        </div>
        <div className="frow">
          <input className="in" style={{ flex: 1 }} value={st.schoolAddress || ''} placeholder="Address (prints on challan)" onChange={e => mut(x => x.schoolAddress = e.target.value)} />
        </div>
        <div className="frow">
          <input className="in" style={{ flex: 1 }} value={st.challanFooter || ''} placeholder="Challan footer note" onChange={e => mut(x => x.challanFooter = e.target.value)} />
          <label className="chk"><input type="checkbox" checked={!!st.uiUrdu} onChange={e => mut(x => x.uiUrdu = e.target.checked)} /> Urdu interface</label>
        </div>
        <div className="frow">
          <label className="lbl">Letterhead offset (mm) — prints below your printed letterhead
            <input className="in" style={{ width: 110 }} type="number" min="0" value={st.letterheadOffset || 0} onChange={e => mut(x => x.letterheadOffset = Number(e.target.value) || 0)} /></label>
          <label className="lbl">Late fee type
            <select className="in" value={st.lateFeeType || 'none'} onChange={e => mut(x => x.lateFeeType = e.target.value)}>
              <option value="none">none</option><option value="fixed">fixed amount</option><option value="per_day">per day</option>
            </select></label>
          <label className="lbl">Late fee {st.lateFeeType === 'per_day' ? 'per day' : 'amount'}
            <input className="in" style={{ width: 110 }} type="number" min="0" value={st.lateFeeValue || 0} onChange={e => mut(x => x.lateFeeValue = Number(e.target.value) || 0)} /></label>
        </div>
      </div>

      <h2 className="ptitle">Users, PINs &amp; roles</h2>
      <p className="muted" style={{ marginTop: 0 }}>Add users to lock the app with a PIN. Roles: <b>principal</b> (everything), <b>accountant</b> (fees + collection), <b>teacher</b> (registers, no money), <b>clerk</b> (admissions only). Leave empty for no login.</p>
      <table className="grid" style={{ marginBottom: 10 }}>
        <thead><tr><th>Name</th><th>Role</th><th>PIN (4-6 digits)</th><th></th></tr></thead>
        <tbody>
          {(st.users || []).map(u => (
            <tr key={u.id}>
              <td><input className="in" value={u.name} onChange={e => mut(x => { x.users.find(z => z.id === u.id).name = e.target.value; })} /></td>
              <td><select className="in" value={u.role} onChange={e => mut(x => { x.users.find(z => z.id === u.id).role = e.target.value; })}>
                {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{k}</option>)}</select></td>
              <td><input className="in" value={String(u.pin || '').startsWith('s:') ? '' : u.pin} placeholder={String(u.pin || '').startsWith('s:') ? '•••• (saved)' : '4-6 digits'} onChange={e => mut(x => { x.users.find(z => z.id === u.id).pin = e.target.value.replace(/\D/g, '').slice(0, 6); })} /></td>
              <td><button className="icon" onClick={() => mut(x => x.users = x.users.filter(z => z.id !== u.id))}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="frow" style={{ marginBottom: 14 }}>
        <button className="btn small ghost" onClick={() => mut(x => { x.users = x.users || []; x.users.push({ id: 'u' + Date.now(), name: 'Office staff', role: 'clerk', pin: '0000' }); })}>+ User</button>
      </div>

      <h2 className="ptitle">Local connection — use Schoolory on a second PC</h2>
      <LanConnect st={st} mut={mut} />

      <h2 className="ptitle">Backups &amp; sync</h2>
      <div className="frow" style={{ marginBottom: 8 }}>
        <label className="lbl" style={{ flex: 1 }}>Backup folder (USB/cloud) — an encrypted copy is written here daily
          <input className="in" value={st.backupFolder || ''} placeholder="e.g. D:\Schoolory Backups" onChange={e => mut(x => x.backupFolder = e.target.value)} /></label>
        <label className="lbl" style={{ flex: 1 }}>Sync folder — app writes <code>schoolory-sync.json</code> here; same path on every PC keeps them in sync
          <input className="in" value={st.syncFolder || ''} placeholder="e.g. \\OFFICE2\shared" onChange={e => mut(x => x.syncFolder = e.target.value)} /></label>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 13 }}>
        <input type="checkbox" checked={st.syncAuto !== false} onChange={e => mut(x => x.syncAuto = e.target.checked)} />
        Auto-sync every 5 seconds — changes made on other PCs on the same WiFi/LAN appear here automatically
      </label>

      <h2 className="ptitle">Snapshots</h2>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn small ghost" onClick={() => window.api.store.snapshot(store, 'manual')}>Take snapshot now</button>
        <button className="btn small ghost" onClick={loadHistory}>Show history</button>
      </div>
      {history && (
        <div style={{ maxHeight: 160, overflowY: 'auto', background: '#f8fafc', borderRadius: 8, padding: 8, marginBottom: 14, fontSize: 12 }}>
          {history.map(h => (
            <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #eef2f7' }}>
              <span>{(h.at || '').replace('T', ' ').slice(0, 19)} — {h.label || 'snapshot'}</span>
              <button className="btn small ghost" onClick={() => restore(h.id)}>Restore</button>
            </div>
          ))}
          {!history.length && <span className="muted">No snapshots yet.</span>}
        </div>
      )}

      <h2 className="ptitle">Audit log (last 30)</h2>
      <div style={{ maxHeight: 180, overflowY: 'auto', background: '#f8fafc', borderRadius: 8, padding: 8, marginBottom: 14, fontSize: 12 }}>
        {(store.auditLog || []).slice(-30).reverse().map((a, i) => (
          <div key={i} className="muted" style={{ padding: '2px 0', borderBottom: '1px solid #eef2f7' }}>{a.at?.replace('T', ' ').slice(0, 19)} — <b>{a.user}</b> — {a.what}</div>
        ))}
        {!(store.auditLog || []).length && <span className="muted">No entries yet.</span>}
      </div>

      <h2 className="ptitle">Danger zone</h2>
      <button className="btn small" style={{ background: '#dc2626' }} onClick={async () => {
        if (!confirm('Saara data delete ho jayega (snapshot backup le liya jayega). Continue?')) return;
        await window.api.store.snapshot(store, 'before reset');
        setStore({ ...emptyStore(), settings: { ...defaultSettings(), firstRunDone: true } });
      }}>Reset — delete all data</button>
    </div>
  );
}
