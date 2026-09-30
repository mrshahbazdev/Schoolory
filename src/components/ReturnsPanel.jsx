import { useMemo, useState } from 'react';
import { fmt, num, uid, postReturn } from '../lib/model.js';

// Sale returns: find the receipt, tick lines + qty, refund → stock goes back
// and the refund hits the day book / register close.
export default function ReturnsPanel({ store, update, user }) {
  const [numQ, setNumQ] = useState('');
  const [sel, setSel] = useState(null);               // sale
  const [qtys, setQtys] = useState({});               // lineIndex -> qty to return
  const [reason, setReason] = useState('');
  const cur = store.settings.currency;

  const sales = useMemo(() =>
    [...(store.sales || [])].filter(s => !s.voided).sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 60),
    [store.sales]);

  const find = () => {
    const s = (store.sales || []).find(x => String(x.number) === String(numQ).trim());
    if (!s) { alert('No sale with that number'); return; }
    setSel(s); setQtys({}); setReason('');
  };

  const alreadyReturned = (s, ix) =>
    (store.returns || []).filter(r => r.saleId === s.id)
      .reduce((t, r) => t + num((r.lines[ix] || {}).qty ?? (r.lines || []).filter(l => l.itemId === s.lines[ix].itemId).reduce((a, l) => a + num(l.qty), 0)), 0);

  const maxRet = ix => {
    const l = sel.lines[ix];
    const prev = (store.returns || []).filter(r => r.saleId === sel.id)
      .reduce((t, r) => t + num((r.lines || []).filter(x => x.itemId === l.itemId).reduce((a, x) => a + num(x.qty), 0)), 0);
    return Math.max(0, num(l.qty) - prev);
  };

  const refund = sel ? (sel.lines || []).reduce((t, l, ix) => t + num(qtys[ix]) * (num(l.price) - num(l.discount) / Math.max(1, num(l.qty))), 0) : 0;

  const post = () => {
    if (!sel || refund <= 0) return;
    const ret = {
      id: uid('r'), saleId: sel.id, saleNumber: sel.number,
      at: new Date().toISOString().slice(0, 16),
      lines: sel.lines.map((l, ix) => ({ itemId: l.itemId, name: l.name, qty: num(qtys[ix]), price: num(l.price) })).filter(l => l.qty > 0),
      refund, method: sel.method || 'cash', reason: reason.trim(), user: (user && user.name) || 'app'
    };
    update(s => postReturn(s, ret, user && user.name), `return sale #${sel.number}`);
    setSel(null); setNumQ(''); setQtys({}); setReason('');
  };

  const voidSale = s => {
    if (!confirm(`Void sale #${s.number} completely? Stock returns and it leaves the books.`)) return;
    update(st => {
      const x = st.sales.find(y => y.id === s.id);
      if (x) x.voided = true;
      for (const l of s.lines || []) {
        const it = st.items.find(i => i.id === l.itemId);
        if (it) it.stock = num(it.stock) + num(l.qty);
        st.stockMoves.push({ id: uid('m'), itemId: l.itemId, qty: num(l.qty), reason: 'sale-void', at: new Date().toISOString().slice(0, 16), note: `Void sale #${s.number}` });
      }
    }, `void sale #${s.number}`);
    if (sel?.id === s.id) setSel(null);
  };

  return (
    <div className="panel" style={{ maxWidth: 1150 }}>
      <div className="toolbar">
        <input className="in num" style={{ width: 130 }} placeholder="Receipt #" value={numQ} onChange={e => setNumQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && find()} />
        <button className="btn small" onClick={find}>Find sale</button>
        <span className="spacer" />
        <span className="muted">Returns put stock back and record the refund in the day book.</span>
      </div>

      {sel && (
        <div className="form" style={{ marginBottom: 14 }}>
          <h2 className="ptitle" style={{ marginTop: 0 }}>Return against sale #{sel.number} — {sel.customer || 'walk-in'} · {fmt(sel.total, cur)}</h2>
          <table className="grid">
            <thead><tr><th>Item</th><th className="num">Sold</th><th className="num">Rate</th><th className="num">Return qty</th><th className="num">Refund</th></tr></thead>
            <tbody>
              {(sel.lines || []).map((l, ix) => {
                const mx = maxRet(ix);
                return (
                  <tr key={ix}>
                    <td><b>{l.name}</b></td>
                    <td className="num">{num(l.qty)}</td>
                    <td className="num">{fmt(l.price, cur)}</td>
                    <td className="num"><input className="in num" style={{ width: 70 }} type="number" min="0" max={mx} step="any" value={qtys[ix] || 0} onChange={e => setQtys(q => ({ ...q, [ix]: Math.min(mx, num(e.target.value)) }))} /></td>
                    <td className="num">{fmt(num(qtys[ix]) * num(l.price), cur)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="frow" style={{ marginTop: 10 }}>
            <input className="in" style={{ flex: 1 }} placeholder="Reason (damaged, wrong item…)" value={reason} onChange={e => setReason(e.target.value)} />
            <span>Refund <b>{fmt(refund, cur)}</b></span>
            <button className="btn" disabled={refund <= 0} onClick={post}>Post return</button>
            <button className="btn ghost" onClick={() => voidSale(sel)}>Void whole sale</button>
          </div>
        </div>
      )}

      <h2 className="ptitle">Recent sales</h2>
      <table className="grid" style={{ marginBottom: 16 }}>
        <thead><tr><th>#</th><th>Date</th><th>Items</th><th className="num">Total</th><th>Customer</th><th></th></tr></thead>
        <tbody>
          {sales.map(s => (
            <tr key={s.id}>
              <td>#{s.number}</td>
              <td className="muted">{(s.at || '').replace('T', ' ')}</td>
              <td className="muted">{(s.lines || []).map(l => `${l.name} ×${l.qty}`).join(', ')}</td>
              <td className="num"><b>{fmt(s.total, cur)}</b>{num(s.refundTotal) ? <div className="muted" style={{ fontSize: 11 }}>-{fmt(s.refundTotal, cur)} returned</div> : ''}</td>
              <td className="muted">{s.customer || '—'}</td>
              <td className="acts">
                <button className="icon" title="Return items" onClick={() => { setSel(s); setNumQ(String(s.number)); setQtys({}); }}>↩</button>
                <button className="icon" title="Void sale" onClick={() => voidSale(s)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="ptitle">Return history</h2>
      <table className="grid">
        <thead><tr><th>Date</th><th>Sale</th><th>Items back</th><th className="num">Refund</th><th>Reason</th></tr></thead>
        <tbody>
          {[...(store.returns || [])].sort((a, b) => (b.at || '').localeCompare(a.at || '')).map(r => (
            <tr key={r.id}>
              <td className="muted">{(r.at || '').replace('T', ' ')}</td>
              <td>#{r.saleNumber}</td>
              <td className="muted">{(r.lines || []).map(l => `${l.name} ×${l.qty}`).join(', ')}</td>
              <td className="num" style={{ color: 'var(--danger)' }}>{fmt(r.refund, cur)}</td>
              <td className="muted">{r.reason}</td>
            </tr>
          ))}
          {!(store.returns || []).length && <tr><td colSpan="5" className="muted" style={{ padding: 16 }}>No returns yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
