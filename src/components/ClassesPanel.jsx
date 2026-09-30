import { useState } from 'react';
import { uid, currentSession, activeEnrolments, cls, sec, student } from '../lib/model.js';

export default function ClassesPanel({ store, update }) {
  const sess = currentSession(store);
  const [cname, setCname] = useState('');
  const [sname, setSname] = useState({});
  const classes = (store.classes || []).filter(c => c.session_id === sess?.id);
  const [selCls, setSelCls] = useState(null);

  const addClass = () => {
    if (!cname.trim() || !sess) return;
    update(s => s.classes.push({ id: uid('cl'), campus_id: (s.campuses[0] || {}).id || '', name: cname.trim(), level_order: s.classes.length + 1, session_id: sess.id }), 'add class');
    setCname('');
  };
  const addSection = (cid) => {
    const name = (sname[cid] || '').trim();
    if (!name) return;
    update(s => s.sections.push({ id: uid('sc'), class_id: cid, name, teacher_id: '', capacity: 40 }), 'add section');
    setSname({ ...sname, [cid]: '' });
  };

  const roster = selCls ? activeEnrolments(store).filter(e => e.class_id === selCls) : [];

  return (
    <div className="panel" style={{ maxWidth: 1100 }}>
      <h2 className="ptitle" style={{ marginTop: 0 }}>Classes &amp; sections — {sess?.name || 'no session'}</h2>
      {!sess && <div className="pcard" style={{ borderLeft: '3px solid var(--warn)' }}>Create a session first (Sessions tab).</div>}
      <div className="frow" style={{ marginBottom: 14 }}>
        <input className="in" placeholder="Class name (e.g. Class 8, Nursery)" value={cname} onChange={e => setCname(e.target.value)} />
        <button className="btn" onClick={addClass}>+ Class</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16 }}>
        <div>
          {classes.map(c => {
            const secs = (store.sections || []).filter(s => s.class_id === c.id);
            return (
              <div key={c.id} className="pcard" style={{ marginBottom: 10, cursor: 'pointer', borderLeft: selCls === c.id ? '3px solid var(--accent)' : '3px solid transparent' }} onClick={() => setSelCls(c.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b>{c.name}</b>
                  <span className="muted">{secs.length} section(s) · {activeEnrolments(store).filter(e => e.class_id === c.id).length} students</span>
                </div>
                <div className="frow" style={{ marginTop: 8 }} onClick={e => e.stopPropagation()}>
                  {secs.map(sx => <span key={sx.id} className="pcard" style={{ padding: '3px 10px', margin: 0, fontSize: 12 }}>{sx.name}</span>)}
                  <input className="in" style={{ width: 80 }} placeholder="New sec" value={sname[c.id] || ''} onChange={e => setSname({ ...sname, [c.id]: e.target.value })} />
                  <button className="btn small ghost" onClick={() => addSection(c.id)}>+ Section</button>
                  <button className="icon" title="Delete class" onClick={() => { if (confirm(`Delete ${c.name}?`)) update(s => { s.classes = s.classes.filter(x => x.id !== c.id); s.sections = s.sections.filter(x => x.class_id !== c.id); }, 'delete class'); }}>✕</button>
                </div>
              </div>
            );
          })}
          {!classes.length && <div className="muted">No classes yet.</div>}
        </div>

        <div>
          {selCls ? (
            <>
              <h3 style={{ marginTop: 0 }}>{cls(store, selCls)?.name} — register</h3>
              <table className="grid">
                <thead><tr><th>Roll #</th><th>Student</th><th>Section</th><th></th></tr></thead>
                <tbody>
                  {roster.map(e => {
                    const stu = student(store, e.student_id);
                    return (
                      <tr key={e.id}>
                        <td><input className="in" style={{ width: 60 }} value={e.roll_no || ''} onChange={ev => update(s => { s.enrolments.find(x => x.id === e.id).roll_no = ev.target.value; }, 'roll no')} /></td>
                        <td><b>{stu?.name}</b></td>
                        <td>
                          <select className="in" value={e.section_id || ''} onChange={ev => update(s => { s.enrolments.find(x => x.id === e.id).section_id = ev.target.value; }, 'move section')}>
                            <option value="">—</option>
                            {(store.sections || []).filter(x => x.class_id === e.class_id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                          </select>
                        </td>
                        <td></td>
                      </tr>
                    );
                  })}
                  {!roster.length && <tr><td colSpan="4" className="muted" style={{ padding: 14 }}>No students in this class.</td></tr>}
                </tbody>
              </table>
            </>
          ) : <div className="muted" style={{ padding: 30, textAlign: 'center' }}>Click a class to see its register and assign roll numbers.</div>}
        </div>
      </div>
    </div>
  );
}
