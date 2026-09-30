import { useMemo, useState } from 'react';
import { fmt, num, uid, postPurchase, day, reorderList } from '../lib/model.js';

// Supplier purchases: post a delivery → stock increases + weighted-average
// cost updates + optional payable on the supplier's khata.
export default function PurchasesPanel({ store, update, user }) {
  const [q, setQ] = useState('');
  const [lines, setLines] = useState([]);             // [{itemId,name,qty,cost,unit}]
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [paid, setPaid] = useState('');
  const [note, setNote] = useState('');
  const cur = store.settings.currency;

  const items = store.items || [];
  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const n = q.trim().toLowerCase();
    return items.filter(i => `${i.sku} ${i.barcode || ''} ${i.name}`.toLowerCase().includes(n)).slice(0, 8);
  }, [q, items]);

  const addLine = it => {
    setLines(ls => {
      const ex = ls.find(l => l.itemId === it.id);
      if (ex) return ls.map(l => l.itemId === it.id ? { ...l, qty: num(l.qty) + 1 } : l);
      return [...ls, { itemId: it.id, name: it.name, qty: 1, cost: num(it.cost), unit: it.unit }];
    });
    setQ('');
  };

  const total = lines.reduce((t, l) => t + num(l.qty) * num(l.cost), 0);

  const post = () => {
    if (!lines.length) return;
    const p = {
      id: uid('p'), at: new Date().toISOString().slice(0, 16),
      supplier: supplierName.trim() || (store.suppliers || []).find(s => s.id === supplierId)?.name || '',
      supplierId,
      lines: lines.map(l => ({ itemId: l.itemId, name: l.name, qty: num(l.qty), cost: num(l.cost) })),
      total, paid: num(paid) || total, note: note.trim(), user: (user && user.name) || 'app'
    };
    const owe = p.total - num(p.paid || p.total);
    update(s => {
      postPurchase(s, p, user && user.name);
      if (owe > 0 && p.supplier) {
        let sup = (s.suppliers || []).find(x => x.id === p.supplierId || x.name === p.supplier);
        if (!sup) { sup = { id: uid('u'), name: p.supplier, phone: '', note: '' }; s.suppliers = s.suppliers || []; s.suppliers.push(sup); }
        p.supplierId = sup.id;
        s.khata = s.khata || [];
        s.khata.push({ id: uid('k'), partyType: 'supplier', partyId: sup.id, partyName: sup.name, at: p.at, amount: owe, kind: 'purchase', refId: p.id, note: 'Purchase balance' });
      }
    }, `purchase ${fmt(total, cur)}`);
    setLines([]); setPaid(''); setNote(''); setSupplierName(''); setSupplierId('');
  };

  const reorder = reorderList(store);
  const past = [...(store.purchases || [])].sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 30);

  return (
    <div className="panel" style={{ maxWidth: 1150 }}>
      {reorder.length > 0 && (
        <div className="allergy" style={{ marginBottom: 12 }}>
          <b>Reorder suggestions</b> — low stock:
          {reorder.map(i => <span key={i.id} className="chip" style={{ marginLeft: 6 }}>{i.name} ×{i.suggest}</span>)}
          <button className="btn small ghost" style={{ marginLeft: 10 }} onClick={() => setLines(reorder.map(i => ({ itemId: i.id, name: i.name, qty: i.suggest, cost: num(i.cost), unit: i.unit })))}>Load into purchase</button>
        </div>
      )}

      <div className="form" style={{ marginBottom: 14 }}>
        <h2 className="ptitle" style={{ marginTop: 0 }}>New purchase / khareed</h2>
        <div className="frow" style={{ marginBottom: 8 }}>
          <select className="in" value={supplierId} onChange={e => { setSupplierId(e.target.value); setSupplierName(''); }}>
            <option value="">— supplier —</option>
            {(store.suppliers || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input className="in" style={{ width: 170 }} placeholder="or type supplier name" value={supplierName} onChange={e => { setSupplierName(e.target.value); setSupplierId(''); }} />
          <input className="in" style={{ flex: 1 }} placeholder="Note (invoice #, truck…)" value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <div className="medpick" style={{ marginBottom: 8 }}>
          <input className="in" style={{ width: '100%' }} placeholder="Add item — search name/SKU…" value={q} onChange={e => setQ(e.target.value)} />
          {matches.length > 0 && (
            <div className="medpick-list">
              {matches.map(i => <div key={i.id} className="medpick-item" onClick={() => addLine(i)}><b>{i.name}</b> <span className="g">— cost {fmt(i.cost, cur)} · stock {num(i.stock)}</span></div>)}
            </div>
          )}
        </div>
        <table className="grid">
          <thead><tr><th>Item</th><th className="num">Qty in</th><th className="num">Cost</th><th className="num">Amount</th><th></th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.itemId}>
                <td><b>{l.name}</b></td>
                <td className="num"><input className="in num" style={{ width: 70 }} type="number" min="0" step="any" value={l.qty} onChange={e => setLines(ls => ls.map((x, ix) => ix === i ? { ...x, qty: num(e.target.value) } : x))} /></td>
                <td className="num"><input className="in num" style={{ width: 84 }} type="number" min="0" value={l.cost} onChange={e => setLines(ls => ls.map((x, ix) => ix === i ? { ...x, cost: num(e.target.value) } : x))} /></td>
                <td className="num"><b>{fmt(num(l.qty) * num(l.cost), cur)}</b></td>
                <td><button className="icon" onClick={() => setLines(ls => ls.filter((_, ix) => ix !== i))}>✕</button></td>
              </tr>
            ))}
            {!lines.length && <tr><td colSpan="5" className="muted" style={{ padding: 16 }}>No items yet.</td></tr>}
          </tbody>
        </table>
        <div className="frow" style={{ marginTop: 10 }}>
          <span>Total <b>{fmt(total, cur)}</b></span>
          <input className="in num" style={{ width: 120 }} type="number" min="0" placeholder={`Paid ${total}`} value={paid} onChange={e => setPaid(e.target.value)} />
          {num(paid) < total && total > 0 && <span className="muted">unpaid {fmt(total - num(paid), cur)} → supplier khata</span>}
          <span className="spacer" />
          <button className="btn" disabled={!lines.length} onClick={post}>Post purchase — stock in</button>
        </div>
      </div>

      <h2 className="ptitle">Recent purchases</h2>
      <table className="grid">
        <thead><tr><th>Date</th><th>Supplier</th><th>Items</th><th className="num">Total</th><th className="num">Paid</th></tr></thead>
        <tbody>
          {past.map(p => (
            <tr key={p.id}>
              <td className="muted">{day(p.at)}</td>
              <td>{p.supplier || '—'}</td>
              <td className="muted">{(p.lines || []).map(l => `${l.name} ×${l.qty}`).join(', ')}</td>
              <td className="num"><b>{fmt(p.total, cur)}</b></td>
              <td className="num">{fmt(p.paid, cur)}</td>
            </tr>
          ))}
          {!past.length && <tr><td colSpan="5" className="muted" style={{ padding: 16 }}>No purchases recorded yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
