import { fmt, today, activeEnrolments, currentSession, collectionTotals, defaulters, challanOutstanding } from '../lib/model.js';

export default function Dashboard({ store, go }) {
  const sess = currentSession(store);
  const active = activeEnrolments(store);
  const { total: todayColl, receipts } = collectionTotals(store, today());
  const defs = defaulters(store);
  const dueTotal = defs.reduce((t, d) => t + d.due, 0);
  const unpaidCount = (store.challans || []).filter(c => c.status !== 'void' && challanOutstanding(store, c.id) > 0).length;
  const cur = store.settings.currency;

  const cards = [
    { label: 'Active students', value: active.length, sub: sess ? `session ${sess.name}` : 'no session', onClick: () => go('students') },
    { label: "Today's collection", value: fmt(todayColl, cur), sub: `${receipts.length} receipt(s)`, onClick: () => go('collection') },
    { label: 'Defaulters', value: defs.length, sub: fmt(dueTotal, cur) + ' outstanding', onClick: () => go('defaulters') },
    { label: 'Unpaid challans', value: unpaidCount, sub: 'all months', onClick: () => go('challans') },
  ];

  return (
    <div className="panel">
      <h1 className="ptitle" style={{ marginTop: 0 }}>{store.settings.schoolName || 'Schoolory'}</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        {sess ? <>Current session: <b>{sess.name}</b></> : 'No academic session yet — create one in Sessions.'}
        {store.settings.schoolAddress ? ` · ${store.settings.schoolAddress}` : ''}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 14 }}>
        {cards.map(c => (
          <div key={c.label} className="pcard" onClick={c.onClick} style={{ cursor: 'pointer' }}>
            <div className="muted" style={{ fontSize: 12 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>{c.value}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <h2 className="ptitle" style={{ marginTop: 22 }}>Quick actions</h2>
      <div className="row">
        <button className="btn" onClick={() => go('students')}>+ Admission</button>
        <button className="btn ghost" onClick={() => go('challans')}>Generate challans</button>
        <button className="btn ghost" onClick={() => go('collection')}>Receive fee</button>
        <button className="btn ghost" onClick={() => go('defaulters')}>Defaulter list</button>
      </div>

      {!sess && (
        <div className="pcard" style={{ marginTop: 18, borderLeft: '3px solid var(--warn)' }}>
          Setup order: <b>Sessions</b> → <b>Classes &amp; sections</b> → <b>Fee setup</b> → admit students → generate challans.
        </div>
      )}
    </div>
  );
}
