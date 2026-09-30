import { useState } from 'react';
import { num, uid, today } from '../lib/model.js';

// Stock movements: purchases (in), damage/expiry/return (out), manual adjust —
// every change lands in stockMoves so the ledger stays auditable.
export default function StockPanel({ store, update }) {
  const [selId, setSelId] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('purchase');
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('');

  const items = store.items || [];
  const moves = [...(store.stockMoves || [])].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const itemName = id => (items.find(i => i.id === id) || {}).name || '(deleted item)';

  const apply = sign => {
    const it = items.find(i => i.id === selId);
    const q = num(qty);
    if (!it || !q) return;
    const delta = reason === 'adjust' ? q - num(it.stock) : sign * q;
    update(s => {
      const x = s.items.find(i => i.id === selId);
      x.stock = num(x.stock) + delta;
      s.stockMoves = s.stockMoves || [];
      s.stockMoves.push({ id: uid('m'), itemId: selId, qty: delta, reason, at: new Date().toISOString().slice(0, 16), note: note.trim() });
    }, `stock ${reason}`);
    setQty(''); setNote('');
  };

  const shown = filter ? moves.filter(m => `${itemName(m.itemId)} ${m.reason} ${m.note || ''}`.toLowerCase().includes(filter.toLowerCase())) : moves;

  return (
    <div className="panel" style={{ maxWidth: 1150 }}>
      <div className="form" style={{ marginBottom: 16 }}>
        <h2 className="ptitle" style={{ marginTop: 0 }}>Stock in / out / adjust</h2>
        <div className="frow">
          <label className="lbl" style={{ flex: 1, minWidth: 200 }}>Item
            <select className="in" value={selId} onChange={e => setSelId(e.target.value)}>
              <option value="">Choose…</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name} — stock {num(i.stock)} {i.unit}</option>)}
            </select></label>
          <label className="lbl">Reason
            <select className="in" value={reason} onChange={e => setReason(e.target.value)}>
              <option value="purchase">Purchase (in)</option>
              <option value="return">Return (in)</option>
              <option value="damage">Damage/expiry (out)</option>
              <option value="correction">Correction (out)</option>
              <option value="adjust">Adjust — set exact count</option>
            </select></label>
          <label className="lbl">{reason === 'adjust' ? 'New count' : 'Qty'}
            <input className="in num" type="number" min="0" step="any" style={{ width: 90 }} value={qty} onChange={e => setQty(e.target.value)} /></label>
          <label className="lbl" style={{ flex: 1 }}>Note
            <input className="in" value={note} placeholder="Supplier / reason…" onChange={e => setNote(e.target.value)} /></label>
          <button className="btn" disabled={!selId || !num(qty)} onClick={() => apply(reason === 'damage' || reason === 'correction' ? -1 : 1)}>Apply</button>
        </div>
      </div>

      <div className="toolbar">
        <input className="in" style={{ flex: 1, maxWidth: 300 }} placeholder="Filter ledger…" value={filter} onChange={e => setFilter(e.target.value)} />
        <span className="muted">{moves.length} movements</span>
      </div>
      <table className="grid">
        <thead><tr><th>When</th><th>Item</th><th>Reason</th><th className="num">Change</th><th>Note</th></tr></thead>
        <tbody>
          {shown.slice(0, 200).map(m => (
            <tr key={m.id}>
              <td className="muted">{(m.at || '').replace('T', ' ')}</td>
              <td><b>{itemName(m.itemId)}</b></td>
              <td><span className="pill" style={{ background: m.qty >= 0 ? '#dcfce7' : '#fee2e2', color: m.qty >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{m.reason}</span></td>
              <td className="num" style={{ fontWeight: 700, color: m.qty >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{m.qty > 0 ? '+' : ''}{m.qty}</td>
              <td className="muted">{m.note}</td>
            </tr>
          ))}
          {!shown.length && <tr><td colSpan="5" className="muted" style={{ padding: 18 }}>No stock movements yet.</td></tr>}
        </tbody>
      </table>
      <p className="muted" style={{ marginTop: 8 }}>Sales also write entries here (reason "sale"). Today is {today()}.</p>
    </div>
  );
}
