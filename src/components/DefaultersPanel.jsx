import { useState } from 'react';
import { fmt, today, defaulters } from '../lib/model.js';
import { defaultersHtml } from '../lib/prints.js';
import { defaultersCsv } from '../lib/csv.js';

export default function DefaultersPanel({ store }) {
  const [cid, setCid] = useState('');
  const cur = store.settings.currency;
  const rows = defaulters(store).filter(r => !cid || r.enrolment.class_id === cid);
  const total = rows.reduce((t, r) => t + r.due, 0);
  const classes = [...new Map(defaulters(store).map(r => [r.enrolment.class_id, r.clsSec.split(' - ')[0]])).entries()];

  const wa = r => {
    const ph = (r.student?.whatsapp || r.student?.phone || '').replace(/\D/g, '').replace(/^0/, '92');
    if (!ph) return null;
    const msg = encodeURIComponent(`${store.settings.schoolName || 'School'} — ${r.student?.name} ki fee ${fmt(r.due, cur)} baqi hai (${r.months.join(', ')}). Barah-e-karam adaigi kar dein. Shukriya.`);
    return `https://wa.me/${ph}?text=${msg}`;
  };

  return (
    <div className="panel" style={{ maxWidth: 1100 }}>
      <div className="toolbar">
        <h2 className="ptitle" style={{ margin: 0 }}>Fee defaulters — {rows.length} students · {fmt(total, cur)}</h2>
        <span className="spacer" />
        <select className="in" value={cid} onChange={e => setCid(e.target.value)}>
          <option value="">All classes</option>
          {classes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <button className="btn small ghost" onClick={() => window.api.export.text({ name: `defaulters-${today()}.csv`, text: defaultersCsv(store, rows) })}>⤓ CSV</button>
        <button className="btn small ghost" onClick={() => window.api.export.print({ html: defaultersHtml(store, rows, `as of ${today()}`) })}>🖨 Print</button>
      </div>

      <table className="grid">
        <thead><tr><th>#</th><th>Student</th><th>Father</th><th>Class</th><th>Months due</th><th className="num">Amount</th><th></th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.enrolment.id}>
              <td className="muted">{i + 1}</td>
              <td><b>{r.student?.name}</b></td><td>{r.student?.father_name}</td>
              <td>{r.clsSec}</td><td className="muted">{r.months.join(', ')}</td>
              <td className="num" style={{ color: 'var(--danger)' }}><b>{fmt(r.due, cur)}</b></td>
              <td className="acts">{wa(r) && <a className="btn small ghost" href={wa(r)} target="_blank" rel="noreferrer">WhatsApp</a>}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan="7" className="muted" style={{ padding: 18 }}>No defaulters — sab fees clear hain.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
