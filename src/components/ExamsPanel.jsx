import { useState } from 'react';
import { uid, num, currentSession, activeEnrolments, student, subjectsFor, marksFor, reportCard, gradeFor } from '../lib/model.js';
import { reportCardsHtml } from '../lib/prints.js';

export default function ExamsPanel({ store, update }) {
  const [mode, setMode] = useState('marks'); // subjects | exams | marks | cards
  const sess = currentSession(store);
  const classes = (store.classes || []).filter(c => c.session_id === sess?.id);
  const [clsId, setClsId] = useState('');
  const [examId, setExamId] = useState('');
  const [subId, setSubId] = useState('');
  const cls = classes.find(c => c.id === clsId) || classes[0];
  const exams = (store.exams || []).filter(e => e.session_id === sess?.id);
  const exam = exams.find(e => e.id === examId) || exams[0];
  const subs = cls ? subjectsFor(store, cls.id) : [];
  const sub = subs.find(s => s.id === subId) || subs[0];
  const roster = cls ? activeEnrolments(store).filter(e => e.class_id === cls.id) : [];

  const [newSub, setNewSub] = useState({ name: '', full: '100', pass: '40' });
  const [newEx, setNewEx] = useState({ name: '', term: '' });

  return (
    <div className="panel" style={{ maxWidth: 1100 }}>
      <div className="toolbar">
        <h2 className="ptitle" style={{ margin: 0 }}>Exams &amp; marks — امتحانات</h2>
        <span className="spacer" />
        <div className="acts">
          {['subjects', 'exams', 'marks', 'cards'].map(m => (
            <button key={m} className={'btn small' + (mode === m ? '' : ' ghost')} onClick={() => setMode(m)}>
              {m === 'cards' ? 'Report cards' : m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {mode === 'subjects' && (
        <>
          <div className="frow" style={{ marginBottom: 10 }}>
            <select className="in" value={cls?.id || ''} onChange={e => setClsId(e.target.value)}>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <input className="in" placeholder="Subject name" value={newSub.name} onChange={e => setNewSub({ ...newSub, name: e.target.value })} />
            <input className="in" style={{ width: 90 }} placeholder="Full" value={newSub.full} onChange={e => setNewSub({ ...newSub, full: e.target.value })} />
            <input className="in" style={{ width: 90 }} placeholder="Pass" value={newSub.pass} onChange={e => setNewSub({ ...newSub, pass: e.target.value })} />
            <button className="btn" onClick={() => { if (!newSub.name.trim() || !cls) return; update(s => s.subjects.push({ id: uid('su'), class_id: cls.id, name: newSub.name.trim(), full_marks: num(newSub.full), pass_marks: num(newSub.pass), sort_order: s.subjects.length + 1 }), 'add subject'); setNewSub({ name: '', full: '100', pass: '40' }); }}>+ Subject</button>
          </div>
          <table className="grid">
            <thead><tr><th>Subject</th><th>Full</th><th>Pass</th><th></th></tr></thead>
            <tbody>
              {subs.map(su => (
                <tr key={su.id}>
                  <td><b>{su.name}</b></td><td>{su.full_marks}</td><td>{su.pass_marks}</td>
                  <td><button className="icon" onClick={() => { if (confirm(`Delete ${su.name}?`)) update(s => { s.subjects = s.subjects.filter(x => x.id !== su.id); s.marks = (s.marks || []).filter(m => m.subject_id !== su.id); }, 'delete subject'); }}>✕</button></td>
                </tr>
              ))}
              {!subs.length && <tr><td colSpan="4" className="muted" style={{ padding: 14 }}>No subjects for this class yet.</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {mode === 'exams' && (
        <>
          <div className="frow" style={{ marginBottom: 10 }}>
            <input className="in" placeholder="Exam name (e.g. Second Term)" value={newEx.name} onChange={e => setNewEx({ ...newEx, name: e.target.value })} />
            <input className="in" placeholder="Term (e.g. Term 2)" value={newEx.term} onChange={e => setNewEx({ ...newEx, term: e.target.value })} />
            <button className="btn" onClick={() => { if (!newEx.name.trim() || !sess) return; update(s => s.exams.push({ id: uid('ex'), session_id: sess.id, name: newEx.name.trim(), term: newEx.term.trim(), held_on: new Date().toISOString().slice(0, 10) }), 'add exam'); setNewEx({ name: '', term: '' }); }}>+ Exam</button>
          </div>
          <table className="grid">
            <thead><tr><th>Exam</th><th>Term</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {exams.map(x => (
                <tr key={x.id}>
                  <td><b>{x.name}</b></td><td>{x.term}</td><td>{x.held_on}</td>
                  <td><button className="icon" onClick={() => { if (confirm(`Delete ${x.name} and its marks?`)) update(s => { s.exams = s.exams.filter(y => y.id !== x.id); s.marks = (s.marks || []).filter(m => m.exam_id !== x.id); }, 'delete exam'); }}>✕</button></td>
                </tr>
              ))}
              {!exams.length && <tr><td colSpan="4" className="muted" style={{ padding: 14 }}>No exams yet.</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {mode === 'marks' && (
        <>
          <div className="frow" style={{ marginBottom: 10 }}>
            <select className="in" value={exam?.id || ''} onChange={e => setExamId(e.target.value)}>{exams.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <select className="in" value={cls?.id || ''} onChange={e => { setClsId(e.target.value); setSubId(''); }}>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <select className="in" value={sub?.id || ''} onChange={e => setSubId(e.target.value)}>{subs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </div>
          {!exam || !sub ? <div className="muted" style={{ padding: 20 }}>Pick an exam, a class and a subject to enter marks.</div> : (
            <table className="grid">
              <thead><tr><th>Roll</th><th>Student</th><th style={{ width: 120 }}>Obtained / {sub.full_marks}</th></tr></thead>
              <tbody>
                {roster.map(e => {
                  const stu = student(store, e.student_id);
                  const m = (store.marks || []).find(x => x.exam_id === exam.id && x.enrolment_id === e.id && x.subject_id === sub.id);
                  return (
                    <tr key={e.id}>
                      <td>{e.roll_no}</td><td><b>{stu?.name}</b></td>
                      <td><input className="in" style={{ width: 100 }} type="number" min="0" max={sub.full_marks} value={m ? m.obtained : ''}
                        onChange={ev => update(s => {
                          s.marks = s.marks || [];
                          const row = s.marks.find(x => x.exam_id === exam.id && x.enrolment_id === e.id && x.subject_id === sub.id);
                          if (ev.target.value === '') { if (row) s.marks = s.marks.filter(x => x !== row); return; }
                          const v = Math.min(num(sub.full_marks), Math.max(0, num(ev.target.value)));
                          if (row) row.obtained = v;
                          else s.marks.push({ id: uid('mk'), exam_id: exam.id, subject_id: sub.id, enrolment_id: e.id, obtained: v });
                        }, 'enter marks')} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}

      {mode === 'cards' && (
        <>
          <div className="frow" style={{ marginBottom: 10 }}>
            <select className="in" value={exam?.id || ''} onChange={e => setExamId(e.target.value)}>{exams.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <select className="in" value={cls?.id || ''} onChange={e => setClsId(e.target.value)}>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            {exam && cls && <button className="btn" onClick={() => window.api.export.print({ html: reportCardsHtml(store, exam, roster) })}>Print all report cards ({roster.length})</button>}
          </div>
          <table className="grid">
            <thead><tr><th>Roll</th><th>Student</th><th>Obtained</th><th>%</th><th>Grade</th><th>Result</th></tr></thead>
            <tbody>
              {exam && roster.map(e => {
                const stu = student(store, e.student_id);
                const rc = reportCard(store, exam.id, e);
                return (
                  <tr key={e.id}>
                    <td>{e.roll_no}</td><td><b>{stu?.name}</b></td>
                    <td>{rc.totObt}/{rc.totFull}</td><td>{rc.pct}%</td>
                    <td><b>{rc.grade}</b></td>
                    <td>{rc.fail ? <b style={{ color: '#b91c1c' }}>FAIL</b> : 'PASS'}</td>
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
