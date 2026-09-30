import { useState } from 'react';
import { today, activeEnrolments, student, attendanceFor, markAttendance, attendanceSummary, staffAttendanceFor, markStaffAttendance, ym, enrolment } from '../lib/model.js';
import { attendanceRegisterHtml } from '../lib/prints.js';

const ST = [['P', 'Present'], ['A', 'Absent'], ['L', 'Leave']];

export default function AttendancePanel({ store, update, user }) {
  const [mode, setMode] = useState('students'); // students | staff | report
  const [date, setDate] = useState(today());
  const [secId, setSecId] = useState('');
  const [month, setMonth] = useState(today().slice(0, 7));
  const by = user?.name || 'Office';
  const sections = store.sections || [];
  const sec = sections.find(s => s.id === secId) || sections[0];
  const roster = sec ? activeEnrolments(store).filter(e => e.section_id === sec.id) : [];
  const marks = sec ? attendanceFor(store, date, sec.id) : {};
  const staffMarks = staffAttendanceFor(store, date);

  const counts = roster.reduce((c, e) => { const st = (marks[e.id] || {}).status; if (st) c[st]++; return c; }, { P: 0, A: 0, L: 0 });

  return (
    <div className="panel" style={{ maxWidth: 1100 }}>
      <div className="toolbar">
        <h2 className="ptitle" style={{ margin: 0 }}>Attendance — حاضری</h2>
        <span className="spacer" />
        <div className="acts">
          <button className={'btn small' + (mode === 'students' ? '' : ' ghost')} onClick={() => setMode('students')}>Students</button>
          <button className={'btn small' + (mode === 'staff' ? '' : ' ghost')} onClick={() => setMode('staff')}>Staff</button>
          <button className={'btn small' + (mode === 'report' ? '' : ' ghost')} onClick={() => setMode('report')}>Monthly report</button>
        </div>
      </div>

      {mode !== 'report' && (
        <div className="frow" style={{ marginBottom: 12 }}>
          <input className="in" type="date" value={date} onChange={e => setDate(e.target.value)} />
          {mode === 'students' && sections.map(s => (
            <button key={s.id} className={'btn small' + (sec?.id === s.id ? '' : ' ghost')} onClick={() => setSecId(s.id)}>{(store.classes || []).find(c => c.id === s.class_id)?.name} {s.name}</button>
          ))}
        </div>
      )}

      {mode === 'students' && (
        <>
          {sec && <div className="muted" style={{ marginBottom: 8 }}>
            {roster.length} students · P:{counts.P} A:{counts.A} L:{counts.L}
            <button className="btn small ghost" style={{ marginLeft: 12 }} onClick={() => update(s => roster.forEach(e => markAttendance(s, e.id, date, 'P', by)), 'mark all present')}>Mark all present</button>
            <button className="btn small ghost" onClick={() => window.api.export.print({ html: attendanceRegisterHtml(store, sec, date, roster.map(e => ({ roll: e.roll_no, name: (student(store, e.student_id) || {}).name, status: (marks[e.id] || {}).status }))) })}>Print register</button>
          </div>}
          <table className="grid">
            <thead><tr><th>Roll</th><th>Student</th><th>P</th><th>A</th><th>L</th></tr></thead>
            <tbody>
              {roster.map(e => {
                const stu = student(store, e.student_id);
                const cur = (marks[e.id] || {}).status || '';
                return (
                  <tr key={e.id}>
                    <td>{e.roll_no}</td>
                    <td><b>{stu?.name}</b></td>
                    {ST.map(([k]) => (
                      <td key={k} style={{ textAlign: 'center' }}>
                        <button className={'btn small' + (cur === k ? '' : ' ghost')} onClick={() => update(s => markAttendance(s, e.id, date, cur === k ? '' : k, by), 'attendance')}>{k}</button>
                      </td>
                    ))}
                  </tr>
                );
              })}
              {!roster.length && <tr><td colSpan="5" className="muted" style={{ padding: 14 }}>No students in this section.</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {mode === 'staff' && (
        <table className="grid">
          <thead><tr><th>Staff</th><th>Role</th><th>P</th><th>A</th><th>L</th></tr></thead>
          <tbody>
            {(store.staff || []).map(st => {
              const cur = (staffMarks[st.id] || {}).status || '';
              return (
                <tr key={st.id}>
                  <td><b>{st.name}</b></td><td className="muted">{st.role}</td>
                  {ST.map(([k]) => (
                    <td key={k} style={{ textAlign: 'center' }}>
                      <button className={'btn small' + (cur === k ? '' : ' ghost')} onClick={() => update(s => markStaffAttendance(s, st.id, date, cur === k ? '' : k, by), 'staff attendance')}>{k}</button>
                    </td>
                  ))}
                </tr>
              );
            })}
            {!(store.staff || []).length && <tr><td colSpan="5" className="muted" style={{ padding: 14 }}>Add staff in the Staff tab first.</td></tr>}
          </tbody>
        </table>
      )}

      {mode === 'report' && (
        <>
          <div className="frow" style={{ marginBottom: 12 }}>
            <input className="in" type="month" value={month} onChange={e => setMonth(e.target.value)} />
          </div>
          <table className="grid">
            <thead><tr><th>Roll</th><th>Student</th><th>Class-Sec</th><th>Present</th><th>Absent</th><th>Leave</th><th>%</th></tr></thead>
            <tbody>
              {activeEnrolments(store).map(e => {
                const stu = student(store, e.student_id);
                const sum = attendanceSummary(store, e.id, month);
                const pct = sum.total ? Math.round(sum.p / sum.total * 100) : null;
                return (
                  <tr key={e.id}>
                    <td>{e.roll_no}</td><td><b>{stu?.name}</b></td>
                    <td className="muted">{enrClsSec(store, e)}</td>
                    <td>{sum.p}</td><td>{sum.a}</td><td>{sum.l}</td>
                    <td>{pct === null ? '—' : pct + '%'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
const enrClsSec = (store, e) => {
  const c = (store.classes || []).find(x => x.id === e.class_id);
  const s = (store.sections || []).find(x => x.id === e.section_id);
  return [c?.name, s?.name].filter(Boolean).join('-');
};
