import { useState } from 'react';
import { uid, num, fmt, today, currentSession, activeEnrolments, cls, monthlyFeeLines, arrearsFor, nextChallanNo, challanStudentInfo, challanOutstanding } from '../lib/model.js';
import { challanHtml } from '../lib/prints.js';

export default function ChallansPanel({ store, update }) {
  const sess = currentSession(store);
  const [tab, setTab] = useState('list');
  const [month, setMonth] = useState(today().slice(0, 7));
  const [cid, setCid] = useState('');           // '' = whole school
  const [dueOn, setDueOn] = useState(today().slice(0, 8) + '10');
  const [preview, setPreview] = useState(null); // [{enr, lines, arrears, total}]
  const cur = store.settings.currency;
  const classes = (store.classes || []).filter(c => c.session_id === sess?.id);

  const buildPreview = () => {
    if (!sess) return;
    const enrs = activeEnrolments(store).filter(e => !cid || e.class_id === cid);
    const rows = enrs.map(e => {
      const already = (store.challans || []).some(c => c.enrolment_id === e.id && c.month === month && c.status !== 'void');
      const lines = monthlyFeeLines(store, e, month);
      const arr = arrearsFor(store, e.id, month);
      return { enr: e, skip: already, lines, arrears: arr, total: lines.reduce((t, l) => t + l.amount, 0) + arr };
    });
    setPreview(rows);
  };

  const commit = () => {
    const rows = (preview || []).filter(r => !r.skip && r.total > 0);
    if (!rows.length) return;
    update(s => {
      let no = nextChallanNo(s);
      for (const r of rows) {
        const ch = { id: uid('ch'), no: no++, enrolment_id: r.enr.id, session_id: sess.id, month, issued_on: today(), due_on: dueOn, arrears: r.arrears, late_fee: 0, total: r.total, status: 'unpaid' };
        s.challans.push(ch);
        r.lines.forEach(l => s.challanLines.push({ id: uid('cl2'), challan_id: ch.id, head_id: l.head_id, description: l.description, amount: l.amount }));
        if (r.arrears) s.challanLines.push({ id: uid('cl2'), challan_id: ch.id, head_id: '', description: 'Arrears (previous balance)', amount: r.arrears });
      }
    }, `issue ${rows.length} challans ${month}`);
    setPreview(null); setTab('list');
  };

  const printAll = () => {
    const toPrint = (preview || []).filter(r => !r.skip).length
      ? [] : (store.challans || []).filter(c => c.month === month && c.status !== 'void' && (!cid || challanStudentInfo(store, c).enr?.class_id === cid));
    const list = toPrint.length ? toPrint : (store.challans || []).filter(c => c.month === month && c.status !== 'void');
    if (!list.length) return alert('No issued challans for this month — generate first.');
    window.api.export.print({ html: challanHtml(store, list) });
  };

  const printOne = ch => window.api.export.print({ html: challanHtml(store, [ch]) });

  const voidCh = ch => {
    const reason = prompt('Void reason (required):');
    if (!reason) return;
    update(s => { const c = s.challans.find(x => x.id === ch.id); c.status = 'void'; c.voided_by = 'office'; c.void_reason = reason; }, `void challan #${ch.no}`);
  };

  const list = (store.challans || []).filter(c => c.month === month).sort((a, b) => a.no - b.no);
  const monthNames = [...new Set((store.challans || []).map(c => c.month))].sort().reverse();

  return (
    <div className="panel" style={{ maxWidth: 1150 }}>
      <div className="toolbar">
        <button className={'btn small' + (tab === 'list' ? '' : ' ghost')} onClick={() => setTab('list')}>Issued challans</button>
        <button className={'btn small' + (tab === 'gen' ? '' : ' ghost')} onClick={() => setTab('gen')}>Generate</button>
        <span className="spacer" />
        <input className="in" type="month" value={month} onChange={e => setMonth(e.target.value)} />
      </div>

      {tab === 'gen' && (
        <div className="pcard" style={{ marginBottom: 14 }}>
          <h3 style={{ marginTop: 0 }}>Generate challans — {month}</h3>
          <div className="frow" style={{ marginBottom: 10 }}>
            <select className="in" value={cid} onChange={e => setCid(e.target.value)}>
              <option value="">Whole school</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label className="lbl">Due on <input className="in" type="date" value={dueOn} onChange={e => setDueOn(e.target.value)} /></label>
            <button className="btn" onClick={buildPreview}>Preview</button>
          </div>
          {preview && (
            <>
              <table className="grid" style={{ marginBottom: 10 }}>
                <thead><tr><th>Student</th><th>Class</th><th className="num">Fee</th><th className="num">Arrears</th><th className="num">Total</th><th></th></tr></thead>
                <tbody>
                  {preview.map((r, i) => {
                    const st = (store.students || []).find(x => x.id === r.enr.student_id);
                    return <tr key={r.enr.id} style={r.skip ? { opacity: .45 } : {}}>
                      <td><b>{st?.name}</b></td><td>{cls(store, r.enr.class_id)?.name}</td>
                      <td className="num">{fmt(r.total - r.arrears, cur)}</td>
                      <td className="num">{r.arrears ? fmt(r.arrears, cur) : '—'}</td>
                      <td className="num"><b>{fmt(r.total, cur)}</b></td>
                      <td className="muted">{r.skip ? 'already issued' : ''}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
              <div className="row">
                <button className="btn" onClick={commit}>Issue {preview.filter(r => !r.skip && r.total > 0).length} challans (numbers allocated now)</button>
                <button className="btn ghost" onClick={() => setPreview(null)}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="frow" style={{ marginBottom: 10 }}>
        {monthNames.map(m => <button key={m} className={'btn small' + (m === month ? '' : ' ghost')} onClick={() => setMonth(m)}>{m}</button>)}
        <span className="spacer" />
        <button className="btn small ghost" onClick={printAll}>🖨 Print all {month} (3-part)</button>
      </div>

      <table className="grid">
        <thead><tr><th>#</th><th>Student</th><th>Class</th><th className="num">Total</th><th className="num">Outstanding</th><th>Status</th><th>Due</th><th></th></tr></thead>
        <tbody>
          {list.map(ch => {
            const info = challanStudentInfo(store, ch);
            const out = challanOutstanding(store, ch.id);
            return <tr key={ch.id} style={ch.status === 'void' ? { opacity: .45, textDecoration: 'line-through' } : {}}>
              <td><b>{ch.no}</b></td><td>{info.student?.name}</td><td>{info.clsSec}</td>
              <td className="num">{fmt(ch.total, cur)}</td><td className="num" style={{ color: out > 0 ? 'var(--danger)' : 'var(--ok)' }}>{fmt(out, cur)}</td>
              <td>{ch.status}</td><td className="muted">{ch.due_on}</td>
              <td className="acts">
                <button className="icon" title="Print" onClick={() => printOne(ch)}>🖨</button>
                {ch.status !== 'void' && <button className="icon" title="Void" onClick={() => voidCh(ch)}>✕</button>}
              </td>
            </tr>;
          })}
          {!list.length && <tr><td colSpan="8" className="muted" style={{ padding: 16 }}>No challans for {month} — use Generate.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
