import { useState } from 'react';
import { uid, num, fmt, today, ym, payslipFor, payslipLines, nextPayslipNo } from '../lib/model.js';
import { payslipHtml } from '../lib/prints.js';

export default function StaffPanel({ store, update }) {
  const [mode, setMode] = useState('staff'); // staff | leaves | payroll
  const [f, setF] = useState({ code: '', name: '', role: 'teacher', phone: '', salary: '' });
  const [lv, setLv] = useState({ staff_id: '', from: today(), to: today(), reason: '' });
  const [month, setMonth] = useState(today().slice(0, 7));
  const cur = store.settings.currency || 'Rs';
  const staff = store.staff || [];

  const addStaff = () => {
    if (!f.name.trim()) return;
    update(s => s.staff.push({ id: uid('st'), campus_id: (s.campuses[0] || {}).id || '', code: f.code.trim(), name: f.name.trim(), role: f.role, phone: f.phone.trim(), joined_on: today(), status: 'active', salary_basic: num(f.salary) }), 'add staff');
    setF({ code: '', name: '', role: 'teacher', phone: '', salary: '' });
  };
  const addLeave = () => {
    if (!lv.staff_id) return;
    update(s => (s.leaves = s.leaves || []).push({ id: uid('lv'), ...lv }), 'add leave');
    setLv({ staff_id: '', from: today(), to: today(), reason: '' });
  };
  const issueSlips = () => {
    update(s => {
      s.payslips = s.payslips || [];
      for (const st of s.staff) {
        if (st.status !== 'active' || payslipFor(s, st.id, month)) continue;
        const lines = payslipLines(s, st, month);
        const net = lines.reduce((t, l) => t + (l.type === 'deduction' ? -l.amount : l.amount), 0);
        s.payslips.push({ id: uid('ps'), no: nextPayslipNo(s), staff_id: st.id, month, issued_on: today(), net, status: 'issued', paid_on: '', paid_by: '' });
      }
    }, 'issue payslips');
  };

  return (
    <div className="panel" style={{ maxWidth: 1100 }}>
      <div className="toolbar">
        <h2 className="ptitle" style={{ margin: 0 }}>Staff &amp; payroll — عملہ</h2>
        <span className="spacer" />
        <div className="acts">
          {['staff', 'leaves', 'payroll'].map(m => <button key={m} className={'btn small' + (mode === m ? '' : ' ghost')} onClick={() => setMode(m)}>{m[0].toUpperCase() + m.slice(1)}</button>)}
        </div>
      </div>

      {mode === 'staff' && (
        <>
          <div className="frow" style={{ marginBottom: 10 }}>
            <input className="in" style={{ width: 70 }} placeholder="Code" value={f.code} onChange={e => setF({ ...f, code: e.target.value })} />
            <input className="in" placeholder="Name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
            <select className="in" value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>
              {['teacher', 'admin', 'accountant', 'support', 'driver', 'other'].map(r => <option key={r}>{r}</option>)}
            </select>
            <input className="in" placeholder="Phone" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
            <input className="in" style={{ width: 110 }} placeholder="Basic salary" value={f.salary} onChange={e => setF({ ...f, salary: e.target.value })} />
            <button className="btn" onClick={addStaff}>+ Staff</button>
          </div>
          <table className="grid">
            <thead><tr><th>Code</th><th>Name</th><th>Role</th><th>Phone</th><th>Joined</th><th className="num">Basic</th><th></th></tr></thead>
            <tbody>
              {staff.map(st => (
                <tr key={st.id}>
                  <td>{st.code}</td><td><b>{st.name}</b></td><td className="muted">{st.role}</td><td>{st.phone}</td><td>{st.joined_on}</td>
                  <td className="num">{fmt(st.salary_basic, cur)}</td>
                  <td><button className="icon" onClick={() => { if (confirm(`Remove ${st.name}?`)) update(s => { s.staff = s.staff.filter(x => x.id !== st.id); }, 'remove staff'); }}>✕</button></td>
                </tr>
              ))}
              {!staff.length && <tr><td colSpan="7" className="muted" style={{ padding: 14 }}>No staff yet.</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {mode === 'leaves' && (
        <>
          <div className="frow" style={{ marginBottom: 10 }}>
            <select className="in" value={lv.staff_id} onChange={e => setLv({ ...lv, staff_id: e.target.value })}>
              <option value="">— staff —</option>
              {staff.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
            <input className="in" type="date" value={lv.from} onChange={e => setLv({ ...lv, from: e.target.value })} />
            <input className="in" type="date" value={lv.to} onChange={e => setLv({ ...lv, to: e.target.value })} />
            <input className="in" placeholder="Reason" value={lv.reason} onChange={e => setLv({ ...lv, reason: e.target.value })} />
            <button className="btn" onClick={addLeave}>+ Leave</button>
          </div>
          <table className="grid">
            <thead><tr><th>Staff</th><th>From</th><th>To</th><th>Reason</th><th></th></tr></thead>
            <tbody>
              {(store.leaves || []).map(l => {
                const st = staff.find(x => x.id === l.staff_id);
                return <tr key={l.id}><td><b>{st?.name}</b></td><td>{l.from}</td><td>{l.to}</td><td>{l.reason}</td>
                  <td><button className="icon" onClick={() => update(s => { s.leaves = s.leaves.filter(x => x.id !== l.id); }, 'delete leave')}>✕</button></td></tr>;
              })}
              {!(store.leaves || []).length && <tr><td colSpan="5" className="muted" style={{ padding: 14 }}>No leaves recorded.</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {mode === 'payroll' && (
        <>
          <div className="frow" style={{ marginBottom: 10 }}>
            <input className="in" type="month" value={month} onChange={e => setMonth(e.target.value)} />
            <button className="btn" onClick={issueSlips}>Issue payslips for {month}</button>
            <span className="muted">(skips staff already issued; absent days auto-deduct)</span>
          </div>
          <div className="frow" style={{ marginBottom: 10 }}>
            <span className="muted">Salary heads:</span>
            {(store.salaryHeads || []).map(h => (
              <span key={h.id} className="pcard" style={{ padding: '3px 8px', margin: 0, fontSize: 12 }}>
                {h.name} · {h.type === 'deduction' ? '−' : '+'}{fmt(h.amount, cur)}
                <button className="icon" style={{ marginLeft: 4 }} onClick={() => update(s => { s.salaryHeads = s.salaryHeads.filter(x => x.id !== h.id); }, 'delete head')}>✕</button>
              </span>
            ))}
            <button className="btn small ghost" onClick={() => {
              const name = prompt('Head name (e.g. House rent)'); if (!name) return;
              const type = prompt('earning or deduction?', 'earning'); if (type !== 'earning' && type !== 'deduction') return;
              const amount = prompt('Fixed amount', '0'); if (amount === null) return;
              update(s => (s.salaryHeads = s.salaryHeads || []).push({ id: uid('sh'), name, type, amount: num(amount) }), 'add head');
            }}>+ Head</button>
          </div>
          <table className="grid">
            <thead><tr><th>#</th><th>Staff</th><th>Month</th><th className="num">Net</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {(store.payslips || []).filter(p => p.month === month).map(p => {
                const st = staff.find(x => x.id === p.staff_id);
                return (
                  <tr key={p.id}>
                    <td>{p.no}</td><td><b>{st?.name}</b></td><td>{p.month}</td>
                    <td className="num">{fmt(p.net, cur)}</td><td>{p.status}{p.paid_on ? ' · ' + p.paid_on : ''}</td>
                    <td>
                      <button className="btn small ghost" onClick={() => window.api.export.print({ html: payslipHtml(store, p) })}>Print</button>
                      {p.status === 'issued' && <button className="btn small ghost" onClick={() => update(s => { const x = s.payslips.find(y => y.id === p.id); x.status = 'paid'; x.paid_on = today(); }, 'mark paid')}>Mark paid</button>}
                    </td>
                  </tr>
                );
              })}
              {!(store.payslips || []).filter(p => p.month === month).length && <tr><td colSpan="6" className="muted" style={{ padding: 14 }}>No payslips for {month} yet — issue them above.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
