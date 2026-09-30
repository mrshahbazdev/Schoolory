import { useState } from 'react';
import { uid, num, today, student, activeEnrolments, book, bookOutCount, enrLabel, enrolFor } from '../lib/model.js';

export default function LibraryPanel({ store, update }) {
  const [mode, setMode] = useState('books'); // books | issues
  const [f, setF] = useState({ title: '', author: '', accession: '', copies: '1' });
  const [q, setQ] = useState('');
  const books = (store.books || []).filter(b => !q || (b.title + b.author + b.accession).toLowerCase().includes(q.toLowerCase()));
  const issues = (store.bookIssues || []);

  const addBook = () => {
    if (!f.title.trim()) return;
    update(s => s.books.push({ id: uid('bk'), title: f.title.trim(), author: f.author.trim(), accession: f.accession.trim(), copies: Math.max(1, num(f.copies) || 1) }), 'add book');
    setF({ title: '', author: '', accession: '', copies: '1' });
  };
  const issue = (bookId) => {
    const adm = prompt('Student admission number or name');
    if (!adm) return;
    const stu = (store.students || []).find(s => s.adm_no === adm || s.name.toLowerCase().includes(adm.toLowerCase()));
    if (!stu) { alert('Student not found'); return; }
    update(s => (s.bookIssues = s.bookIssues || []).push({ id: uid('bi'), book_id: bookId, student_id: stu.id, issued_on: today(), due_on: '', returned_on: '' }), 'issue book');
  };

  return (
    <div className="panel" style={{ maxWidth: 1100 }}>
      <div className="toolbar">
        <h2 className="ptitle" style={{ margin: 0 }}>Library — کتب خانہ</h2>
        <span className="spacer" />
        <div className="acts">
          <button className={'btn small' + (mode === 'books' ? '' : ' ghost')} onClick={() => setMode('books')}>Books</button>
          <button className={'btn small' + (mode === 'issues' ? '' : ' ghost')} onClick={() => setMode('issues')}>Issued ({issues.filter(i => !i.returned_on).length})</button>
        </div>
      </div>

      {mode === 'books' && (
        <>
          <div className="frow" style={{ marginBottom: 10 }}>
            <input className="in" placeholder="Title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
            <input className="in" placeholder="Author" value={f.author} onChange={e => setF({ ...f, author: e.target.value })} />
            <input className="in" style={{ width: 100 }} placeholder="Accession #" value={f.accession} onChange={e => setF({ ...f, accession: e.target.value })} />
            <input className="in" style={{ width: 70 }} placeholder="Copies" value={f.copies} onChange={e => setF({ ...f, copies: e.target.value })} />
            <button className="btn" onClick={addBook}>+ Book</button>
            <input className="in" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <table className="grid">
            <thead><tr><th>Accession</th><th>Title</th><th>Author</th><th>Copies</th><th>Out</th><th></th></tr></thead>
            <tbody>
              {books.map(b => {
                const out = bookOutCount(store, b.id);
                return (
                  <tr key={b.id}>
                    <td>{b.accession}</td><td><b>{b.title}</b></td><td className="muted">{b.author}</td>
                    <td>{b.copies}</td><td>{out}</td>
                    <td>
                      {out < num(b.copies) && <button className="btn small ghost" onClick={() => issue(b.id)}>Issue</button>}
                      <button className="icon" onClick={() => { if (confirm(`Delete "${b.title}"?`)) update(s => { s.books = s.books.filter(x => x.id !== b.id); }, 'delete book'); }}>✕</button>
                    </td>
                  </tr>
                );
              })}
              {!books.length && <tr><td colSpan="6" className="muted" style={{ padding: 14 }}>No books yet.</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {mode === 'issues' && (
        <table className="grid">
          <thead><tr><th>Book</th><th>Student</th><th>Class</th><th>Issued</th><th></th></tr></thead>
          <tbody>
            {issues.map(i => {
              const b = book(store, i.book_id);
              const stu = student(store, i.student_id);
              const enr = stu && enrolFor(store, stu.id);
              return (
                <tr key={i.id} style={i.returned_on ? { opacity: 0.5 } : {}}>
                  <td><b>{b?.title}</b> <span className="muted">{b?.accession}</span></td>
                  <td>{stu?.name}</td><td className="muted">{enr ? enrLabel(store, enr) : ''}</td>
                  <td>{i.issued_on}</td>
                  <td>
                    {!i.returned_on
                      ? <button className="btn small ghost" onClick={() => update(s => { s.bookIssues.find(x => x.id === i.id).returned_on = today(); }, 'return book')}>Return</button>
                      : <span className="muted">returned {i.returned_on}</span>}
                  </td>
                </tr>
              );
            })}
            {!issues.length && <tr><td colSpan="5" className="muted" style={{ padding: 14 }}>Nothing issued yet.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
