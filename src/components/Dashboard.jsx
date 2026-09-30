import { fmt, dayTotals, today, lowStock, num } from '../lib/model.js';

export default function Dashboard({ store, go }) {
  const d = dayTotals(store, today());
  const low = lowStock(store);
  const stale = store.settings.backupFolder && store.settings.lastBackupAt && (Date.now() - new Date(store.settings.lastBackupAt + 'T00:00').getTime()) / 864e5 > 7;
  const staleNoDate = store.settings.backupFolder && !store.settings.lastBackupAt;

  return (
    <div className="panel">
      {(stale || staleNoDate) && (
        <div className="allergy">⚠ Backup {staleNoDate ? 'has never run' : `is ${Math.floor((Date.now() - new Date(store.settings.lastBackupAt + 'T00:00').getTime()) / 864e5)} days old`} — open Settings → backup, or press Backup in the top bar.</div>
      )}

      <div className="cards">
        <div className="card"><div className="clabel">Today's sales / آج کی فروخت</div><div className="cval">{fmt(d.gross, store.settings.currency)}</div><div className="csub">{d.sales.length} receipts</div></div>
        <div className="card"><div className="clabel">Collected / وصولی</div><div className="cval" style={{ color: 'var(--ok)' }}>{fmt(d.paid, store.settings.currency)}</div><div className="csub">cash + other methods</div></div>
        <div className="card"><div className="clabel">Today's expenses / اخراجات</div><div className="cval" style={{ color: 'var(--danger)' }}>{fmt(d.exp, store.settings.currency)}</div><div className="csub">net {fmt(d.net, store.settings.currency)}</div></div>
      </div>

      <div className="cards" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card">
          <div className="clabel">Low stock ({low.length}) — reorder needed</div>
          {low.slice(0, 8).map(i => (
            <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 13 }}>
              <span><b>{i.name}</b> <span className="muted">{i.sku}</span></span>
              <span style={{ color: i.stock <= 0 ? 'var(--danger)' : '#b45309', fontWeight: 700 }}>{num(i.stock)} {i.unit || ''}</span>
            </div>
          ))}
          {!low.length && <div className="muted" style={{ paddingTop: 8 }}>All items above their minimum stock level.</div>}
          <button className="btn small ghost" style={{ marginTop: 10 }} onClick={() => go('stock')}>Stock in / out →</button>
        </div>
        <div className="card">
          <div className="clabel">Latest sales</div>
          {[...(store.sales || [])].sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 8).map(s => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 13 }}>
              <span>#{s.number} <span className="muted">{(s.at || '').slice(11, 16)} · {(s.lines || []).length} items</span></span>
              <b>{fmt(s.total, store.settings.currency)}</b>
            </div>
          ))}
          <button className="btn small ghost" style={{ marginTop: 10 }} onClick={() => go('daybook')}>Day book →</button>
        </div>
      </div>
    </div>
  );
}
