import { useState } from 'react';
import { uid, num, fmt, today, currentSession, activeEnrolments, enrLabel, student, cls } from '../lib/model.js';

const HEAD_KINDS = ['fee', 'admission', 'exam', 'transport', 'lab', 'stationery', 'annual', 'other'];

export default function FeeSetupPanel({ store, update }) {
  const sess = currentSession(store);
  const [tab, setTab] = useState('heads');
  const cur = store.settings.currency;
  const classes = (store.classes || []).filter(c => c.session_id === sess?.id);

  // heads
  const [hn, setHn] = useState(''); const [hk, setHk] = useState('fee'); const [hr, setHr] = useState(true);
  // plan
  const [pc, setPc] = useState(''); const [ph, setPh] = useState(''); const [pa, setPa] = useState(''); const [pd, setPd] = useState('10');
  // concession
  const [ce, setCe] = useState(''); const [ch, setCh] = useState(''); const [ct, setCt] = useState('percent'); const [cv, setCv] = useState(''); const [cr, setCr] = useState('');
  // override
  const [oe, setOe] = useState(''); const [oh, setOh] = useState(''); const [oa, setOa] = useState(''); const [orn, setOrn] = useState('');

  const addHead = () => {
    if (!hn.trim()) return;
    update(s => s.feeHeads.push({ id: uid('fh'), name: hn.trim(), kind: hk, recurring: hr, sort_order: (s.feeHeads || []).length + 1 }), 'fee head');
    setHn('');
  };
  const addPlan = () => {
    if (!pc || !ph || !num(pa)) return;
    update(s => {
      const ex = s.feePlans.find(p => p.session_id === sess.id && p.class_id === pc && p.head_id === ph);
      if (ex) { ex.amount = num(pa); ex.due_day = num(pd); } else s.feePlans.push({ id: uid('fp'), session_id: sess.id, class_id: pc, head_id: ph, amount: num(pa), due_day: num(pd) });
    }, 'fee plan');
    setPa('');
  };
  const addConc = () => {
    if (!ce || !num(cv) || !cr.trim()) return;
    update(s => s.concessions.push({ id: uid('cn'), enrolment_id: ce, head_id: ch || null, type: ct, value: num(cv), reason: cr.trim(), approved_by: 'Principal', approved_on: today(), from_month: '', to_month: '' }), 'concession');
    setCv(''); setCr('');
  };
  const addOvr = () => {
    if (!oe || !oh || !num(oa)) return;
    update(s => {
      const ex = s.feeOverrides.find(o => o.enrolment_id === oe && o.head_id === oh);
      if (ex) { ex.amount = num(oa); ex.reason = orn; } else s.feeOverrides.push({ id: uid('fo'), enrolment_id: oe, head_id: oh, amount: num(oa), reason: orn, approved_by: 'Principal' });
    }, 'fee override');
    setOa(''); setOrn('');
  };

  const enrOpts = activeEnrolments(store).map(e => ({ e, st: student(store, e.student_id) })).filter(x => x.st);
  const headName = id => (store.feeHeads || []).find(h => h.id === id)?.name || '—';

  return (
    <div className="panel" style={{ maxWidth: 1050 }}>
      <div className="toolbar">
        <button className={'btn small' + (tab === 'heads' ? '' : ' ghost')} onClick={() => setTab('heads')}>Fee heads</button>
        <button className={'btn small' + (tab === 'plans' ? '' : ' ghost')} onClick={() => setTab('plans')}>Class plans</button>
        <button className={'btn small' + (tab === 'conc' ? '' : ' ghost')} onClick={() => setTab('conc')}>Concessions</button>
        <button className={'btn small' + (tab === 'ovr' ? '' : ' ghost')} onClick={() => setTab('ovr')}>Student overrides</button>
        <span className="spacer" /><span className="muted">Session: <b>{sess?.name || '—'}</b></span>
      </div>

      {tab === 'heads' && (
        <>
          <div className="frow" style={{ marginBottom: 12 }}>
            <input className="in" style={{ flex: 1 }} placeholder="Head name (e.g. Tuition fee, Lab charges)" value={hn} onChange={e => setHn(e.target.value)} />
            <select className="in" value={hk} onChange={e => setHk(e.target.value)}>{HEAD_KINDS.map(k => <option key={k} value={k}>{k}</option>)}</select>
            <label className="chk"><input type="checkbox" checked={hr} onChange={e => setHr(e.target.checked)} /> monthly</label>
            <button className="btn" onClick={addHead}>+ Head</button>
          </div>
          <table className="grid">
            <thead><tr><th>Head</th><th>Kind</th><th>Monthly</th><th></th></tr></thead>
            <tbody>
              {(store.feeHeads || []).map(h => (
                <tr key={h.id}><td><b>{h.name}</b></td><td>{h.kind}</td><td>{h.recurring ? 'yes' : 'one-time'}</td>
                  <td><button className="icon" onClick={() => update(s => s.feeHeads = s.feeHeads.filter(x => x.id !== h.id), 'delete head')}>✕</button></td></tr>
              ))}
              {!(store.feeHeads || []).length && <tr><td colSpan="4" className="muted" style={{ padding: 14 }}>No fee heads — add Tuition, Admission, Exam, Transport etc.</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {tab === 'plans' && (
        <>
          <div className="frow" style={{ marginBottom: 12 }}>
            <select className="in" value={pc} onChange={e => setPc(e.target.value)}><option value="">Class…</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <select className="in" value={ph} onChange={e => setPh(e.target.value)}><option value="">Head…</option>{(store.feeHeads || []).map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
            <input className="in num" style={{ width: 110 }} placeholder="Amount" value={pa} onChange={e => setPa(e.target.value)} />
            <input className="in num" style={{ width: 90 }} placeholder="Due day" value={pd} onChange={e => setPd(e.target.value)} />
            <button className="btn" onClick={addPlan}>Set</button>
          </div>
          <table className="grid">
            <thead><tr><th>Class</th><th>Head</th><th className="num">Amount</th><th>Due day</th><th></th></tr></thead>
            <tbody>
              {(store.feePlans || []).filter(p => p.session_id === sess?.id).map(p => (
                <tr key={p.id}><td><b>{cls(store, p.class_id)?.name}</b></td><td>{headName(p.head_id)}</td>
                  <td className="num">{fmt(p.amount, cur)}</td><td>{p.due_day}</td>
                  <td><button className="icon" onClick={() => update(s => s.feePlans = s.feePlans.filter(x => x.id !== p.id), 'delete plan row')}>✕</button></td></tr>
              ))}
              {!(store.feePlans || []).length && <tr><td colSpan="5" className="muted" style={{ padding: 14 }}>No plans yet — e.g. Class 6 → Tuition → 2500 due on 10th.</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {tab === 'conc' && (
        <>
          <p className="muted">Sibling / staff-child / merit / hardship discounts. A reason is required — every concession is auditable.</p>
          <div className="frow" style={{ marginBottom: 12 }}>
            <select className="in" style={{ flex: 1 }} value={ce} onChange={e => setCe(e.target.value)}><option value="">Student…</option>
              {enrOpts.map(({ e, st }) => <option key={e.id} value={e.id}>{st.name} — {enrLabel(store, e)}</option>)}</select>
            <select className="in" value={ch} onChange={e => setCh(e.target.value)}><option value="">All heads</option>{(store.feeHeads || []).map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
            <select className="in" value={ct} onChange={e => setCt(e.target.value)}><option value="percent">% off</option><option value="amount">fixed off</option></select>
            <input className="in num" style={{ width: 90 }} placeholder="Value" value={cv} onChange={e => setCv(e.target.value)} />
            <input className="in" style={{ flex: 1 }} placeholder="Reason (required)" value={cr} onChange={e => setCr(e.target.value)} />
            <button className="btn" onClick={addConc}>Approve</button>
          </div>
          <table className="grid">
            <thead><tr><th>Student</th><th>Head</th><th>Discount</th><th>Reason</th><th>Approved</th><th></th></tr></thead>
            <tbody>
              {(store.concessions || []).map(c => {
                const e = (store.enrolments || []).find(x => x.id === c.enrolment_id);
                const st = e && student(store, e.student_id);
                return <tr key={c.id}><td><b>{st?.name || '?'}</b></td><td>{c.head_id ? headName(c.head_id) : 'All'}</td>
                  <td>{c.type === 'percent' ? c.value + '%' : fmt(c.value, cur)}</td><td className="muted">{c.reason}</td>
                  <td className="muted">{c.approved_by} · {c.approved_on}</td>
                  <td><button className="icon" onClick={() => update(s => s.concessions = s.concessions.filter(x => x.id !== c.id), 'remove concession')}>✕</button></td></tr>;
              })}
              {!(store.concessions || []).length && <tr><td colSpan="6" className="muted" style={{ padding: 14 }}>No concessions.</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {tab === 'ovr' && (
        <>
          <p className="muted">Per-student fee amount for one head — overrides the class plan on their challan.</p>
          <div className="frow" style={{ marginBottom: 12 }}>
            <select className="in" style={{ flex: 1 }} value={oe} onChange={e => setOe(e.target.value)}><option value="">Student…</option>
              {enrOpts.map(({ e, st }) => <option key={e.id} value={e.id}>{st.name} — {enrLabel(store, e)}</option>)}</select>
            <select className="in" value={oh} onChange={e => setOh(e.target.value)}><option value="">Head…</option>{(store.feeHeads || []).map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
            <input className="in num" style={{ width: 110 }} placeholder="Amount" value={oa} onChange={e => setOa(e.target.value)} />
            <input className="in" style={{ flex: 1 }} placeholder="Reason" value={orn} onChange={e => setOrn(e.target.value)} />
            <button className="btn" onClick={addOvr}>Set override</button>
          </div>
          <table className="grid">
            <thead><tr><th>Student</th><th>Head</th><th className="num">Amount</th><th>Reason</th><th></th></tr></thead>
            <tbody>
              {(store.feeOverrides || []).map(o => {
                const e = (store.enrolments || []).find(x => x.id === o.enrolment_id);
                const st = e && student(store, e.student_id);
                return <tr key={o.id}><td><b>{st?.name || '?'}</b></td><td>{headName(o.head_id)}</td><td className="num">{fmt(o.amount, cur)}</td><td className="muted">{o.reason}</td>
                  <td><button className="icon" onClick={() => update(s => s.feeOverrides = s.feeOverrides.filter(x => x.id !== o.id), 'remove override')}>✕</button></td></tr>;
              })}
              {!(store.feeOverrides || []).length && <tr><td colSpan="5" className="muted" style={{ padding: 14 }}>No overrides.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
