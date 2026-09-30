import { useState } from 'react';
import { uid, today, currentSession, activeEnrolments, cls, student, commitRollover, undoRollover, enrLabel } from '../lib/model.js';

export default function SessionsPanel({ store, update, user }) {
  const sess = currentSession(store);
  const [name, setName] = useState('');
  const [toSess, setToSess] = useState('');
  const [plan, setPlan] = useState(null); // [{enr, student, action, to_class_id}]

  const addSession = () => {
    if (!name.trim()) return;
    update(s => s.sessions.push({ id: uid('se'), name: name.trim(), starts_on: today(), ends_on: '', is_current: !s.sessions.length, locked: false }), 'add session');
    setName('');
  };

  const classes = sess ? (store.classes || []).filter(c => c.session_id === sess.id) : [];
  const nextClass = c => {
    const sorted = [...classes].sort((a, b) => a.level_order - b.level_order);
    const i = sorted.findIndex(x => x.id === c);
    return i >= 0 && i + 1 < sorted.length ? sorted[i + 1] : null;
  };

  const buildPlan = () => {
    if (!sess || !toSess) return;
    setPlan(activeEnrolments(store).map(e => ({
      enr: e, student: student(store, e.student_id),
      action: nextClass(e.class_id) ? 'promote' : 'detain',
      to_class_id: nextClass(e.class_id)?.id || e.class_id
    })));
  };

  const runRollover = () => {
    const decisions = {};
    for (const r of plan) decisions[r.enr.id] = { action: r.action, to_class_id: r.to_class_id };
    if (!confirm(`Roll over ${plan.length} students from ${sess.name} to ${(store.sessions || []).find(s => s.id === toSess)?.name}? A snapshot is taken first.`)) return;
    window.api.store.snapshot(store, 'before rollover');
    update(s => commitRollover(s, sess.id, toSess, decisions, user?.name || 'office'), `rollover ${sess.name} → new session`);
    setPlan(null);
  };

  const rolls = store.rollovers || [];
  const lastRoll = rolls[rolls.length - 1];

  return (
    <div className="panel" style={{ maxWidth: 1050 }}>
      <h2 className="ptitle" style={{ marginTop: 0 }}>Academic sessions</h2>
      <div className="frow" style={{ marginBottom: 14 }}>
        <input className="in" placeholder="Session name (e.g. 2026-27)" value={name} onChange={e => setName(e.target.value)} />
        <button className="btn" onClick={addSession}>+ Session</button>
      </div>
      <table className="grid" style={{ marginBottom: 18 }}>
        <thead><tr><th>Session</th><th>Status</th><th>Students</th><th></th></tr></thead>
        <tbody>
          {(store.sessions || []).map(s => (
            <tr key={s.id}>
              <td><b>{s.name}</b> {s.is_current && <span className="pcard" style={{ display: 'inline', padding: '1px 8px', fontSize: 11, marginLeft: 6 }}>current</span>}</td>
              <td className="muted">{s.locked ? 'closed' : 'open'}</td>
              <td>{activeEnrolments(store, s.id).length}</td>
              <td>{!s.is_current && !s.locked && <button className="btn small ghost" onClick={() => update(x => { x.sessions.forEach(z => z.is_current = z.id === s.id); }, 'set current session')}>Make current</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="ptitle">Session rollover (promotion)</h2>
      <p className="muted">Promotes every active student to the next class in a new session. Old enrolments stay as history — never edited. A snapshot is taken; you can undo the last rollover below.</p>
      {!plan ? (
        <div className="frow">
          <select className="in" value={toSess} onChange={e => setToSess(e.target.value)}>
            <option value="">Promote into session…</option>
            {(store.sessions || []).filter(s => s.id !== sess?.id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn" onClick={buildPlan} disabled={!sess || !toSess}>Preview rollover</button>
        </div>
      ) : (
        <>
          <table className="grid" style={{ margin: '10px 0' }}>
            <thead><tr><th>Student</th><th>From</th><th>Action</th><th>To class</th></tr></thead>
            <tbody>
              {plan.map((r, i) => (
                <tr key={r.enr.id}>
                  <td><b>{r.student?.name}</b></td><td className="muted">{enrLabel(store, r.enr)}</td>
                  <td>
                    <select className="in" value={r.action} onChange={e => setPlan(plan.map((x, j) => j === i ? { ...x, action: e.target.value } : x))}>
                      <option value="promote">promote</option><option value="detain">detain (same class)</option><option value="leave">leaves school</option>
                    </select>
                  </td>
                  <td>
                    {r.action === 'promote' && (
                      <select className="in" value={r.to_class_id} onChange={e => setPlan(plan.map((x, j) => j === i ? { ...x, to_class_id: e.target.value } : x))}>
                        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    )}
                    {r.action === 'detain' && cls(store, r.enr.class_id)?.name}
                    {r.action === 'leave' && <span className="muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <button className="btn" onClick={runRollover}>Run rollover ({plan.filter(r => r.action !== 'leave').length} promoted/detained)</button>
            <button className="btn ghost" onClick={() => setPlan(null)}>Cancel</button>
          </div>
        </>
      )}

      {lastRoll && (
        <div className="pcard" style={{ marginTop: 18 }}>
          Last rollover: {(store.sessions || []).find(s => s.id === lastRoll.from)?.name} → {(store.sessions || []).find(s => s.id === lastRoll.to)?.name} on {lastRoll.at?.slice(0, 10)} by {lastRoll.by}
          <button className="btn small ghost" style={{ marginLeft: 10 }} onClick={() => { if (confirm('Undo the last rollover? New enrolments created by it are removed.')) update(s => undoRollover(s, lastRoll.id), 'undo rollover'); }}>Undo</button>
        </div>
      )}
    </div>
  );
}
