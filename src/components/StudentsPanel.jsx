import { useState } from 'react';
import { uid, today, currentSession, activeEnrolments, enrLabel, cls, sec } from '../lib/model.js';
import { parseStudentsCsv, studentsCsv } from '../lib/csv.js';

const blank = { adm_no: '', name: '', father_name: '', b_form: '', dob: '', gender: 'M', phone: '', whatsapp: '', address: '', class_id: '', section_id: '', roll_no: '' };

export default function StudentsPanel({ store, update }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState(blank);
  const [mode, setMode] = useState('list'); // list | admit | import
  const [imp, setImp] = useState(null);     // {rows, errors}
  const sess = currentSession(store);
  const classes = (store.classes || []).filter(c => c.session_id === sess?.id);
  const secsOf = cid => (store.sections || []).filter(s => s.class_id === cid);

  const enrOf = sid => (store.enrolments || []).find(e => e.student_id === sid && e.session_id === sess?.id);
  const rows = activeEnrolments(store)
    .map(e => ({ e, s: (store.students || []).find(x => x.id === e.student_id) }))
    .filter(r => r.s)
    .filter(r => !q || (r.s.name + ' ' + (r.s.father_name || '') + ' ' + (r.s.adm_no || '')).toLowerCase().includes(q.toLowerCase()));

  const selected = sel ? (store.students || []).find(x => x.id === sel) : null;
  const selEnr = sel ? enrOf(sel) : null;
  const siblings = sel ? (store.students || []).filter(x => x.id !== sel && x.sibling_group_id && x.sibling_group_id === selected?.sibling_group_id) : [];

  const admit = () => {
    if (!form.name.trim() || !sess) return;
    update(s => {
      const stu = {
        id: uid('p'), campus_id: (s.campuses[0] || {}).id || '', adm_no: form.adm_no || 'ADM-' + String((s.students || []).length + 1).padStart(3, '0'),
        name: form.name.trim(), father_name: form.father_name.trim(), b_form: form.b_form, dob: form.dob,
        gender: form.gender, phone: form.phone, whatsapp: form.whatsapp || form.phone, address: form.address,
        photo: '', admitted_on: today(), status: 'active', sibling_group_id: ''
      };
      s.students.push(stu);
      s.enrolments.push({ id: uid('en'), student_id: stu.id, session_id: sess.id, class_id: form.class_id, section_id: form.section_id, roll_no: form.roll_no, status: 'active' });
      setSel(stu.id);
    }, `admission: ${form.name}`);
    setForm(blank); setMode('list');
  };

  const pickPhoto = async () => {
    const r = await window.api.app.openFile({ filters: [{ name: 'Photos', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
    if (r?.dataUrl && sel) update(s => { s.students.find(x => x.id === sel).photo = r.dataUrl; }, 'student photo');
  };

  const linkSibling = (otherId) => {
    if (!sel) return;
    update(s => {
      const a = s.students.find(x => x.id === sel), b = s.students.find(x => x.id === otherId);
      const g = a.sibling_group_id || b.sibling_group_id || uid('sg');
      a.sibling_group_id = g; b.sibling_group_id = g;
    }, 'link sibling');
  };

  const doImport = () => {
    if (!imp || !sess) return;
    const ok = imp.rows.filter(r => !r.err);
    update(s => {
      for (const r of ok) {
        let c = s.classes.find(x => x.session_id === sess.id && x.name.toLowerCase() === (r.className || '').toLowerCase());
        if (!c) { c = { id: uid('cl'), campus_id: (s.campuses[0] || {}).id || '', name: r.className || 'Class', level_order: 0, session_id: sess.id }; s.classes.push(c); }
        let scx = s.sections.find(x => x.class_id === c.id && x.name.toLowerCase() === (r.sectionName || 'a').toLowerCase());
        if (!scx) { scx = { id: uid('sc'), class_id: c.id, name: r.sectionName || 'A', teacher_id: '', capacity: 40 }; s.sections.push(scx); }
        const stu = { id: uid('p'), campus_id: c.campus_id, adm_no: r.adm_no || 'ADM-' + String(s.students.length + 1).padStart(3, '0'), name: r.name, father_name: r.father_name, b_form: r.b_form, dob: r.dob, gender: r.gender, phone: r.phone, whatsapp: r.whatsapp, address: r.address, photo: '', admitted_on: today(), status: 'active', sibling_group_id: '' };
        s.students.push(stu);
        s.enrolments.push({ id: uid('en'), student_id: stu.id, session_id: sess.id, class_id: c.id, section_id: scx.id, roll_no: r.roll_no, status: 'active' });
      }
    }, `import ${ok.length} students`);
    setImp(null); setMode('list');
  };

  const openImportFile = async () => {
    const r = await window.api.app.openFile({ filters: [{ name: 'CSV/Excel', extensions: ['csv', 'txt', 'tsv'] }] });
    if (r?.text) {
      const p = parseStudentsCsv(r.text);
      p.rows = p.rows.map(r => ({ ...r, err: '' }));
      setImp(p);
    }
  };

  const exportCsv = () => {
    const text = studentsCsv(store);
    window.api.export.text({ name: `students-${today()}.csv`, text });
  };

  return (
    <div className="panel" style={{ maxWidth: 1200 }}>
      <div className="toolbar">
        <button className={'btn small' + (mode === 'list' ? '' : ' ghost')} onClick={() => setMode('list')}>Students ({rows.length})</button>
        <button className={'btn small' + (mode === 'admit' ? '' : ' ghost')} onClick={() => setMode('admit')}>+ Admission</button>
        <button className={'btn small' + (mode === 'import' ? '' : ' ghost')} onClick={() => setMode('import')}>Bulk import</button>
        <span className="spacer" />
        <input className="in" style={{ width: 220 }} placeholder="Search name / father / adm #" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn small ghost" onClick={exportCsv}>⤓ CSV</button>
      </div>

      {mode === 'admit' && (
        <div className="pcard" style={{ marginBottom: 14 }}>
          <h3 style={{ marginTop: 0 }}>New admission — {sess?.name || '?'}</h3>
          <div className="form">
            <div className="frow">
              <input className="in" style={{ width: 110 }} placeholder="Adm #" value={form.adm_no} onChange={e => setForm({ ...form, adm_no: e.target.value })} />
              <input className="in" style={{ flex: 1 }} placeholder="Student name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <input className="in" style={{ flex: 1 }} placeholder="Father / guardian" value={form.father_name} onChange={e => setForm({ ...form, father_name: e.target.value })} />
            </div>
            <div className="frow">
              <input className="in" style={{ width: 130 }} placeholder="B-form / CNIC" value={form.b_form} onChange={e => setForm({ ...form, b_form: e.target.value })} />
              <input className="in" style={{ width: 140 }} type="date" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} />
              <select className="in" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}><option value="M">Boy</option><option value="F">Girl</option></select>
              <input className="in" placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              <input className="in" placeholder="WhatsApp (for reminders)" value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} />
            </div>
            <div className="frow">
              <select className="in" value={form.class_id} onChange={e => setForm({ ...form, class_id: e.target.value, section_id: '' })}>
                <option value="">Class…</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="in" value={form.section_id} onChange={e => setForm({ ...form, section_id: e.target.value })}>
                <option value="">Section…</option>{secsOf(form.class_id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input className="in" style={{ width: 90 }} placeholder="Roll #" value={form.roll_no} onChange={e => setForm({ ...form, roll_no: e.target.value })} />
              <input className="in" style={{ flex: 1 }} placeholder="Address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
              <button className="btn" onClick={admit} disabled={!form.name.trim() || !form.class_id}>Admit</button>
            </div>
          </div>
        </div>
      )}

      {mode === 'import' && (
        <div className="pcard" style={{ marginBottom: 14 }}>
          <h3 style={{ marginTop: 0 }}>Bulk import (Excel / CSV)</h3>
          <p className="muted">Columns: <code>name, father_name, class, section, roll_no, phone, whatsapp, adm_no, dob, b_form, address</code> — any order, header row required. Excel se copy-paste bhi chalta hai (tab-separated).</p>
          <div className="frow">
            <button className="btn small ghost" onClick={openImportFile}>Choose file…</button>
            <button className="btn small ghost" onClick={() => { const p = parseStudentsCsv(prompt('Paste rows (with header)') || ''); if (p.rows) { p.rows = p.rows.map(r => ({ ...r, err: '' })); setImp(p); } }}>Paste</button>
            {imp && <button className="btn" onClick={doImport}>Import {imp.rows.length} students</button>}
          </div>
          {imp && (
            <>
              {imp.errors.map((e, i) => <div key={i} style={{ color: 'var(--danger)', fontSize: 12 }}>⚠ {e}</div>)}
              <table className="grid" style={{ marginTop: 8 }}>
                <thead><tr><th>#</th><th>Name</th><th>Father</th><th>Class</th><th>Sec</th><th>Roll</th><th>Phone</th></tr></thead>
                <tbody>{imp.rows.map(r => <tr key={r.line}><td>{r.line}</td><td><b>{r.name}</b></td><td>{r.father_name}</td><td>{r.className}</td><td>{r.sectionName}</td><td>{r.roll_no}</td><td>{r.phone}</td></tr>)}</tbody>
              </table>
            </>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>
        <table className="grid">
          <thead><tr><th>Adm #</th><th>Name</th><th>Class</th><th>Roll</th><th>Phone</th></tr></thead>
          <tbody>
            {rows.map(({ e, s }) => (
              <tr key={e.id} onClick={() => setSel(s.id)} style={{ cursor: 'pointer', background: sel === s.id ? '#eff6ff' : '' }}>
                <td className="muted">{s.adm_no}</td><td><b>{s.name}</b><div className="muted" style={{ fontSize: 11 }}>{s.father_name}</div></td>
                <td>{enrLabel(store, e)}</td><td>{e.roll_no}</td><td className="muted">{s.whatsapp || s.phone}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="5" className="muted" style={{ padding: 18 }}>No students yet — use Admission or Bulk import.</td></tr>}
          </tbody>
        </table>

        <div>
          {selected ? (
            <div className="pcard">
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 72, height: 84, borderRadius: 8, background: '#e2e8f0', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} onClick={pickPhoto} title="Click to set photo">
                  {selected.photo ? <img src={selected.photo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <span className="muted" style={{ fontSize: 10, textAlign: 'center' }}>+ photo</span>}
                </div>
                <div>
                  <b style={{ fontSize: 16 }}>{selected.name}</b>
                  <div className="muted">{selected.adm_no} · s/o {selected.father_name || '—'}</div>
                  <div className="muted">{selEnr ? `${enrLabel(store, selEnr)} · roll ${selEnr.roll_no || '—'}` : 'not enrolled this session'}</div>
                  <div className="muted">{selected.whatsapp || selected.phone}</div>
                </div>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <label className="lbl">Status
                  <select className="in" value={selEnr?.status || 'none'} onChange={e => update(s => { const en = s.enrolments.find(x => x.id === selEnr?.id); if (en) { en.status = e.target.value; if (e.target.value === 'left') en.left_on = today(); } }, 'status change')}>
                    <option value="active">active</option><option value="left">left</option><option value="none" disabled>not enrolled</option>
                  </select></label>
              </div>
              <h4 style={{ margin: '12px 0 4px' }}>Siblings</h4>
              {siblings.map(sb => <div key={sb.id} className="muted">• {sb.name} ({sb.adm_no})</div>)}
              {!siblings.length && <div className="muted" style={{ fontSize: 12 }}>None linked.</div>}
              <select className="in" style={{ marginTop: 6 }} value="" onChange={e => e.target.value && linkSibling(e.target.value)}>
                <option value="">Link sibling…</option>
                {(store.students || []).filter(x => x.id !== sel && !siblings.includes(x)).map(x => <option key={x.id} value={x.id}>{x.name} ({x.adm_no})</option>)}
              </select>
            </div>
          ) : <div className="muted" style={{ padding: 30, textAlign: 'center' }}>Select a student to see details, photo and sibling links.</div>}
        </div>
      </div>
    </div>
  );
}
