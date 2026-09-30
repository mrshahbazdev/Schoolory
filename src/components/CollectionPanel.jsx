import { useState } from 'react';
import { uid, num, fmt, today, day, challanStudentInfo, challanOutstanding, paidOn, lateFeeFor, nextReceiptNo, collectionTotals } from '../lib/model.js';
import { receiptHtml } from '../lib/prints.js';

export default function CollectionPanel({ store, update, user }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);      // challan id
  const [amt, setAmt] = useState('');
  const [mode, setMode] = useState('cash');
  const [ref, setRef] = useState('');
  const [regDate, setRegDate] = useState(today());
  const cur = store.settings.currency;

  // unpaid challans matching search
  const open = (store.challans || [])
    .filter(c => c.status !== 'void' && challanOutstanding(store, c.id) > 0)
    .map(c => ({ c, info: challanStudentInfo(store, c), out: challanOutstanding(store, c.id) }))
    .filter(x => !q || (x.info.student?.name || '').toLowerCase().includes(q.toLowerCase()) || String(x.c.no) === q)
    .sort((a, b) => a.c.no - b.c.no);
  const selCh = sel ? (store.challans || []).find(c => c.id === sel) : null;
  const selInfo = selCh && challanStudentInfo(store, selCh);
  const selOut = selCh ? challanOutstanding(store, selCh) : 0;
  const selLate = selCh ? lateFeeFor(store, selCh) : 0;

  const receive = () => {
    const amount = Math.min(num(amt) || selOut, selOut);
    if (!selCh || amount <= 0) return;
    const r = {
      id: uid('r'), no: nextReceiptNo(store), challan_id: selCh.id, enrolment_id: selCh.enrolment_id,
      received_on: today(), amount, mode, bank_ref: ref.trim(), received_by: user?.name || 'office'
    };
    update(s => {
      s.receipts.push(r);
      const c = s.challans.find(x => x.id === selCh.id);
      const paid = paidOn(s, selCh.id) + amount;
      c.status = paid >= num(c.total) + lateFeeFor(s, c) ? 'paid' : 'partial';
    }, `receipt #${r.no} Rs ${amount}`);
    setAmt(''); setRef('');
    if (confirm('Print receipt?')) window.api.export.print({ html: receiptHtml(store, r) });
  };

  const reverse = r => {
    const reason = prompt(`Reverse receipt #${r.no} (${fmt(r.amount, cur)})? Reason (required):`);
    if (!reason) return;
    update(s => {
      const rec = s.receipts.find(x => x.id === r.id);
      rec.reversed_by = user?.name || 'office'; rec.reverse_reason = reason; rec.reversed_on = today();
      const c = s.challans.find(x => x.id === rec.challan_id);
      if (c && c.status === 'paid') c.status = 'partial';
    }, `reverse receipt #${r.no}`);
  };

  const reg = collectionTotals(store, regDate);
  const allReceipts = (store.receipts || []).slice().sort((a, b) => b.no - a.no).slice(0, 60);

  return (
    <div className="panel" style={{ maxWidth: 1200 }}>
      <h2 className="ptitle" style={{ marginTop: 0 }}>Fee collection — فیس وصولی</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
        <div>
          <input className="in" style={{ width: '100%', marginBottom: 8 }} placeholder="Search student name or challan #" value={q} onChange={e => setQ(e.target.value)} />
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table className="grid">
              <thead><tr><th>Ch#</th><th>Student</th><th>Month</th><th className="num">Due</th></tr></thead>
              <tbody>
                {open.map(({ c, info, out }) => (
                  <tr key={c.id} onClick={() => { setSel(c.id); setAmt(String(out)); }} style={{ cursor: 'pointer', background: sel === c.id ? '#eff6ff' : '' }}>
                    <td>{c.no}</td><td><b>{info.student?.name}</b><div className="muted" style={{ fontSize: 11 }}>{info.clsSec}</div></td>
                    <td className="muted">{c.month}</td><td className="num"><b>{fmt(out, cur)}</b></td>
                  </tr>
                ))}
                {!open.length && <tr><td colSpan="4" className="muted" style={{ padding: 14 }}>No unpaid challans.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          {selCh ? (
            <div className="pcard">
              <b style={{ fontSize: 16 }}>{selInfo.student?.name}</b>
              <div className="muted">Challan #{selCh.no} · {selCh.month} · {selInfo.clsSec}</div>
              <table className="grid" style={{ margin: '10px 0' }}>
                <tbody>
                  <tr><td>Challan total</td><td className="num">{fmt(selCh.total, cur)}</td></tr>
                  {selLate > 0 && <tr><td>Late fee</td><td className="num">{fmt(selLate, cur)}</td></tr>}
                  <tr><td>Paid so far</td><td className="num">{fmt(paidOn(store, selCh.id), cur)}</td></tr>
                  <tr><td><b>Balance due</b></td><td className="num"><b>{fmt(selOut, cur)}</b></td></tr>
                </tbody>
              </table>
              <div className="frow">
                <input className="in num" style={{ width: 120 }} type="number" min="1" max={selOut} value={amt} onChange={e => setAmt(e.target.value)} />
                <select className="in" value={mode} onChange={e => setMode(e.target.value)}>
                  <option value="cash">cash</option><option value="bank">bank deposit</option><option value="online">online</option><option value="other">other</option>
                </select>
                {mode !== 'cash' && <input className="in" placeholder="bank ref / slip #" value={ref} onChange={e => setRef(e.target.value)} />}
                <button className="btn" onClick={receive}>Receive</button>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Partial payment allowed — balance stays on the challan.</div>
            </div>
          ) : <div className="muted" style={{ padding: 30, textAlign: 'center' }}>Pick a challan on the left to receive payment.</div>}
        </div>
      </div>

      <div className="frow" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Collection register</h3>
        <input className="in" type="date" value={regDate} onChange={e => setRegDate(e.target.value)} />
        <span className="muted">Total: <b>{fmt(reg.total, cur)}</b></span>
        {Object.entries(reg.byMode).map(([m, v]) => <span key={m} className="muted" style={{ fontSize: 12 }}>{m}: {fmt(v, cur)}</span>)}
      </div>
      <table className="grid">
        <thead><tr><th>R#</th><th>Date</th><th>Student</th><th>Challan</th><th>Mode</th><th className="num">Amount</th><th>By</th><th></th></tr></thead>
        <tbody>
          {allReceipts.map(r => {
            const info = challanStudentInfo(store, (store.challans || []).find(c => c.id === r.challan_id) || {});
            return <tr key={r.id} style={r.reversed_by ? { opacity: .45, textDecoration: 'line-through' } : {}}>
              <td>{r.no}</td><td className="muted">{r.received_on}</td>
              <td>{info.student?.name || '—'}</td><td className="muted">#{r.challan_id ? (store.challans.find(c => c.id === r.challan_id) || {}).no : '—'}</td>
              <td>{r.mode}{r.bank_ref ? ' · ' + r.bank_ref : ''}</td>
              <td className="num"><b>{fmt(r.amount, cur)}</b></td>
              <td className="muted">{r.received_by}{r.reversed_by ? ` · reversed: ${r.reverse_reason}` : ''}</td>
              <td className="acts">
                {!r.reversed_by && <button className="icon" title="Print receipt" onClick={() => window.api.export.print({ html: receiptHtml(store, r) })}>🖨</button>}
                {!r.reversed_by && <button className="icon" title="Reverse (keeps audit)" onClick={() => reverse(r)}>↩</button>}
              </td>
            </tr>;
          })}
          {!allReceipts.length && <tr><td colSpan="8" className="muted" style={{ padding: 14 }}>No receipts yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
