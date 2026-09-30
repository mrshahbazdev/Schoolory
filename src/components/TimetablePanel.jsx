import { useState } from 'react';
import { uid, DAYS, subjectsFor } from '../lib/model.js';
import { timetableHtml } from '../lib/prints.js';

const PERIODS = [1, 2, 3, 4, 5, 6, 7];

export default function TimetablePanel({ store, update }) {
  const sections = store.sections || [];
  const [secId, setSecId] = useState('');
  const sec = sections.find(s => s.id === secId) || sections[0];
  const subs = sec ? subjectsFor(store, sec.class_id) : [];
  const staff = store.staff || [];
  const cell = (d, p) => (store.timetable || []).find(t => t.section_id === sec?.id && t.day === d && t.period === p);

  const setCell = (d, p, subjectId, staffId) => update(s => {
    s.timetable = s.timetable || [];
    s.timetable = s.timetable.filter(t => !(t.section_id === sec.id && t.day === d && t.period === p));
    if (subjectId) s.timetable.push({ id: uid('tt'), section_id: sec.id, day: d, period: p, subject_id: subjectId, staff_id: staffId || '' });
  }, 'timetable');

  return (
    <div className="panel" style={{ maxWidth: 1150 }}>
      <div className="toolbar">
        <h2 className="ptitle" style={{ margin: 0 }}>Timetable — ٹائم ٹیبل</h2>
        <span className="spacer" />
        <div className="acts">
          {sections.map(s => <button key={s.id} className={'btn small' + (sec?.id === s.id ? '' : ' ghost')} onClick={() => setSecId(s.id)}>{(store.classes || []).find(c => c.id === s.class_id)?.name} {s.name}</button>)}
          {sec && <button className="btn small ghost" onClick={() => window.api.export.print({ html: timetableHtml(store, sec, PERIODS) })}>Print</button>}
        </div>
      </div>
      {!sec ? <div className="muted" style={{ padding: 20 }}>Create a section first.</div> : (
        <table className="grid">
          <thead><tr><th>Day</th>{PERIODS.map(p => <th key={p}>P{p}</th>)}</tr></thead>
          <tbody>
            {DAYS.map(d => (
              <tr key={d}>
                <td><b>{d}</b></td>
                {PERIODS.map(p => {
                  const t = cell(d, p);
                  return (
                    <td key={p} style={{ minWidth: 110 }}>
                      <select className="in" style={{ width: '100%', fontSize: 11 }} value={t?.subject_id || ''}
                        onChange={e => setCell(d, p, e.target.value, t?.staff_id)}>
                        <option value="">—</option>
                        {subs.map(su => <option key={su.id} value={su.id}>{su.name}</option>)}
                      </select>
                      {t?.subject_id ? (
                        <select className="in" style={{ width: '100%', fontSize: 11, marginTop: 2 }} value={t?.staff_id || ''}
                          onChange={e => setCell(d, p, t.subject_id, e.target.value)}>
                          <option value="">(teacher)</option>
                          {staff.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                        </select>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!subs.length && sec && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>No subjects for this class yet — add them in Exams → Subjects.</p>}
    </div>
  );
}
