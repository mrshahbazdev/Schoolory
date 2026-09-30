import { useState } from 'react';
import { uid, num, fmt, activeEnrolments, student, enrLabel, routeFor } from '../lib/model.js';

export default function TransportPanel({ store, update }) {
  const [f, setF] = useState({ name: '', driver: '', phone: '', fee: '' });
  const [q, setQ] = useState('');
  const cur = store.settings.currency || 'Rs';
  const routes = store.routes || [];
  const addRoute = () => {
    if (!f.name.trim()) return;
    update(s => s.routes.push({ id: uid('rt'), ...f, name: f.name.trim(), fee: num(f.fee) }), 'add route');
    setF({ name: '', driver: '', phone: '', fee: '' });
  };
  const roster = activeEnrolments(store).filter(e => {
    const st = student(store, e.student_id);
    return !q || (st?.name || '').toLowerCase().includes(q.toLowerCase());
  });
  const assign = (enrId, routeId) => update(s => {
    s.transport = s.transport || [];
    s.transport = s.transport.filter(x => x.enrolment_id !== enrId);
    if (routeId) s.transport.push({ id: uid('tr'), enrolment_id: enrId, route_id: routeId });
  }, 'assign route');

  return (
    <div className="panel" style={{ maxWidth: 1100 }}>
      <h2 className="ptitle" style={{ marginTop: 0 }}>Transport — گاڑیاں</h2>
      <div className="frow" style={{ marginBottom: 10 }}>
        <input className="in" placeholder="Route name (e.g. Route 2 — DHA)" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        <input className="in" placeholder="Driver" value={f.driver} onChange={e => setF({ ...f, driver: e.target.value })} />
        <input className="in" placeholder="Phone" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
        <input className="in" style={{ width: 110 }} placeholder="Monthly fee" value={f.fee} onChange={e => setF({ ...f, fee: e.target.value })} />
        <button className="btn" onClick={addRoute}>+ Route</button>
      </div>
      <div className="frow" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
        {routes.map(r => {
          const riders = (store.transport || []).filter(t => t.route_id === r.id).length;
          return (
            <span key={r.id} className="pcard" style={{ padding: '6px 10px', margin: 0 }}>
              <b>{r.name}</b> · {r.driver} · {r.phone} · {fmt(r.fee, cur)}/mo · {riders} riders
              <button className="icon" style={{ marginLeft: 6 }} onClick={() => { if (confirm(`Delete ${r.name}?`)) update(s => { s.routes = s.routes.filter(x => x.id !== r.id); s.transport = (s.transport || []).filter(t => t.route_id !== r.id); }, 'delete route'); }}>✕</button>
            </span>
          );
        })}
        {!routes.length && <span className="muted">No routes yet.</span>}
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Assigning a route adds its monthly fee to the student's challan automatically (unless the class plan already charges a transport head).</p>
      <div className="frow" style={{ marginBottom: 8 }}>
        <input className="in" placeholder="Search student…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <table className="grid">
        <thead><tr><th>Roll</th><th>Student</th><th>Class</th><th>Route</th></tr></thead>
        <tbody>
          {roster.map(e => {
            const stu = student(store, e.student_id);
            const rt = routeFor(store, e.id);
            return (
              <tr key={e.id}>
                <td>{e.roll_no}</td><td><b>{stu?.name}</b></td><td className="muted">{enrLabel(store, e)}</td>
                <td>
                  <select className="in" value={rt?.id || ''} onChange={ev => assign(e.id, ev.target.value)}>
                    <option value="">— none —</option>
                    {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
