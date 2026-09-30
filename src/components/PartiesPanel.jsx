import { useState } from 'react';
import { fmt, num, uid, khataBalance, partyEntries, day } from '../lib/model.js';

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Customer udhaar (khata) + supplier payables. Credit sales post here
// automatically from the counter; this panel adds payments and manual entries.
export default function PartiesPanel({ store, update }) {
  const [side, setSide] = useState('customer');        // 'customer' | 'supplier'
  const [sel, setSel] = useState(null);                // party id
  const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [payAmt, setPayAmt] = useState(''); const [payNote, setPayNote] = useState('');
  const [adjAmt, setAdjAmt] = useState(''); const [adjNote, setAdjNote] = useState('');
  const cur = store.settings.currency;

  const parties = side === 'customer' ? (store.customers || []) : (store.suppliers || []);
  const balances = parties.map(p => ({ ...p, bal: khataBalance(store, side, p.id) }));
  const totalOut = balances.reduce((t, p) => t + Math.max(0, p.bal), 0);
  const selected = parties.find(p => p.id === sel) || null;
  const entries = sel ? partyEntries(store, side, sel) : [];

  const addParty = () => {
    if (!name.trim()) return;
    const p = { id: uid(side === 'customer' ? 'c' : 'u'), name: name.trim(), phone: phone.trim(), note: '' };
    update(s => { (side === 'customer' ? s.customers = s.customers || [] : s.suppliers = s.suppliers || []).push(p); }, `add ${side}`);
    setName(''); setPhone(''); setSel(p.id);
  };

  const post = (amount, kind, note) => {
    if (!sel || !num(amount)) return;
    update(s => {
      s.khata = s.khata || [];
      s.khata.push({ id: uid('k'), partyType: side, partyId: sel, partyName: selected.name, at: new Date().toISOString().slice(0, 16), amount: num(amount), kind, refId: '', note: note.trim() });
    }, `khata ${kind}`);
  };
  // Payment received from a customer (or paid to a supplier) shrinks the balance.
  const addPayment = () => { post(-Math.abs(num(payAmt)), 'payment', payNote); setPayAmt(''); setPayNote(''); };
  // Manual charge (e.g. old balance brought forward).
  const addCharge = () => { post(Math.abs(num(adjAmt)), 'manual', adjNote); setAdjAmt(''); setAdjNote(''); };

  const waLink = p => {
    const ph = (p.phone || '').replace(/\D/g, '').replace(/^0/, '92');
    const msg = encodeURIComponent(`${store.settings.shopName || 'Shop'} — aap ka khata balance ${fmt(p.bal, cur)} hai. Barah-e-karam adaigi kar dein. Shukriya.`);
    return `https://wa.me/${ph}?text=${msg}`;
  };

  const printStatement = () => {
    if (!selected) return;
    const rows = entries.map(e => `<tr><td>${esc(day(e.at))}</td><td>${esc(e.kind)}${e.note ? ' — ' + esc(e.note) : ''}</td><td style="text-align:right">${num(e.amount) > 0 ? num(e.amount).toLocaleString() : ''}</td><td style="text-align:right">${num(e.amount) < 0 ? (-num(e.amount)).toLocaleString() : ''}</td></tr>`).join('');
    window.api.export.print({ html: `<!doctype html><html><head><style>@page{size:A5;margin:12mm}body{font:10pt 'Segoe UI',sans-serif}table{width:100%;border-collapse:collapse}td,th{border:1px solid #e2e8f0;padding:4px 7px;text-align:left}th{background:#0c1c33;color:#fff}h1{font-size:14pt;margin:0 0 4px}</style></head><body>
      <h1>${esc(store.settings.shopName || 'Shop')} — ${side === 'customer' ? 'Customer' : 'Supplier'} khata</h1>
      <div><b>${esc(selected.name)}</b> ${esc(selected.phone || '')}</div>
      <div>Balance: <b>${fmt(khataBalance(store, side, sel), cur)}</b></div>
      <table><thead><tr><th>Date</th><th>Entry</th><th style="text-align:right">Udhaar</th><th style="text-align:right">Paid</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="foot" style="margin-top:8px;font-size:9px;color:#666">Schoolory — khata statement</div>
    </body></html>` });
  };

  return (
    <div className="panel" style={{ maxWidth: 1150 }}>
      <div className="toolbar">
        <button className={'btn small' + (side === 'customer' ? '' : ' ghost')} onClick={() => { setSide('customer'); setSel(null); }}>Customers (udhaar)</button>
        <button className={'btn small' + (side === 'supplier' ? '' : ' ghost')} onClick={() => { setSide('supplier'); setSel(null); }}>Suppliers</button>
        <span className="spacer" />
        <span className="muted">{side === 'customer' ? 'Total receivable' : 'Total payable'}: <b>{fmt(totalOut, cur)}</b></span>
      </div>

      <div className="form" style={{ marginBottom: 14 }}>
        <div className="frow">
          <input className="in" style={{ flex: 1 }} placeholder={side === 'customer' ? 'Customer name' : 'Supplier name'} value={name} onChange={e => setName(e.target.value)} />
          <input className="in" style={{ width: 150 }} placeholder="Phone (03xx…)" value={phone} onChange={e => setPhone(e.target.value)} />
          <button className="btn small" onClick={addParty}>+ Add</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <table className="grid">
          <thead><tr><th>Name</th><th>Phone</th><th className="num">Balance</th><th></th></tr></thead>
          <tbody>
            {balances.map(p => (
              <tr key={p.id} style={sel === p.id ? { background: '#eff6ff' } : {}}>
                <td><b>{p.name}</b></td>
                <td className="muted">{p.phone}</td>
                <td className="num" style={{ color: p.bal > 0 ? 'var(--danger)' : 'var(--ok)' }}><b>{fmt(p.bal, cur)}</b></td>
                <td className="acts">
                  <button className="icon" title="Open khata" onClick={() => setSel(p.id)}>📒</button>
                  {p.phone && p.bal > 0 && <a className="icon" title="WhatsApp reminder" href={waLink(p)} target="_blank" rel="noreferrer" onClick={e => { e.preventDefault(); window.api?.app?.openExternal ? window.api.app.openExternal(waLink(p)) : window.open(waLink(p)); }}>↗</a>}
                  <button className="icon" title="Delete" onClick={() => { if (khataBalance(store, side, p.id) !== 0 && !confirm('Balance is not zero — delete anyway?')) return; update(s => { const k = side === 'customer' ? 'customers' : 'suppliers'; s[k] = s[k].filter(x => x.id !== p.id); }, 'delete party'); if (sel === p.id) setSel(null); }}>✕</button>
                </td>
              </tr>
            ))}
            {!balances.length && <tr><td colSpan="4" className="muted" style={{ padding: 16 }}>No {side === 'customer' ? 'customers' : 'suppliers'} yet.</td></tr>}
          </tbody>
        </table>

        <div>
          {selected ? (
            <>
              <h2 className="ptitle" style={{ marginTop: 0 }}>{selected.name} — khata <span className="muted">({fmt(khataBalance(store, side, sel), cur)})</span></h2>
              <div className="frow" style={{ marginBottom: 8 }}>
                <input className="in num" style={{ width: 110 }} type="number" min="0" placeholder="Paid amount" value={payAmt} onChange={e => setPayAmt(e.target.value)} />
                <input className="in" style={{ flex: 1 }} placeholder="note" value={payNote} onChange={e => setPayNote(e.target.value)} />
                <button className="btn small" onClick={addPayment}>Payment {side === 'customer' ? 'received' : 'made'}</button>
              </div>
              <div className="frow" style={{ marginBottom: 10 }}>
                <input className="in num" style={{ width: 110 }} type="number" min="0" placeholder="Charge amount" value={adjAmt} onChange={e => setAdjAmt(e.target.value)} />
                <input className="in" style={{ flex: 1 }} placeholder="note (e.g. old balance)" value={adjNote} onChange={e => setAdjNote(e.target.value)} />
                <button className="btn small ghost" onClick={addCharge}>+ Charge</button>
                <button className="btn small ghost" onClick={printStatement}>🖨 Statement</button>
              </div>
              <table className="grid">
                <thead><tr><th>Date</th><th>Entry</th><th className="num">Udhaar</th><th className="num">Paid</th></tr></thead>
                <tbody>
                  {entries.map(e => (
                    <tr key={e.id}>
                      <td className="muted">{day(e.at)}</td>
                      <td>{e.kind}{e.note ? <span className="muted"> — {e.note}</span> : ''}</td>
                      <td className="num" style={{ color: 'var(--danger)' }}>{num(e.amount) > 0 ? fmt(e.amount, cur) : ''}</td>
                      <td className="num" style={{ color: 'var(--ok)' }}>{num(e.amount) < 0 ? fmt(-e.amount, cur) : ''}</td>
                    </tr>
                  ))}
                  {!entries.length && <tr><td colSpan="4" className="muted" style={{ padding: 14 }}>No entries yet.</td></tr>}
                </tbody>
              </table>
            </>
          ) : <div className="muted" style={{ padding: 30, textAlign: 'center' }}>Open a {side} to see their khata, take payments, print a statement or send a WhatsApp reminder.</div>}
        </div>
      </div>
    </div>
  );
}
