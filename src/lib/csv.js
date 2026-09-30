const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function csvText(rows) {
  return rows.map(r => r.map(q).join(',')).join('\n');
}

export function studentsCsv(store, enrLabel) {
  const rows = [['adm_no', 'name', 'father_name', 'class', 'section', 'roll_no', 'gender', 'dob', 'phone', 'whatsapp', 'b_form', 'address', 'admitted_on']];
  for (const e of store.enrolments || []) {
    const s = (store.students || []).find(x => x.id === e.student_id);
    if (!s) continue;
    const c = (store.classes || []).find(x => x.id === e.class_id);
    const sc = (store.sections || []).find(x => x.id === e.section_id);
    rows.push([s.adm_no, s.name, s.father_name, c?.name || '', sc?.name || '', e.roll_no, s.gender || '', s.dob || '', s.phone || '', s.whatsapp || '', s.b_form || '', s.address || '', s.admitted_on || '']);
  }
  return csvText(rows);
}

export function defaultersCsv(store, rows) {
  const out = [['name', 'father_name', 'class', 'months_due', 'amount', 'phone']];
  for (const r of rows) out.push([r.student?.name || '', r.student?.father_name || '', r.clsSec, r.months.join(' '), r.due, r.student?.whatsapp || r.student?.phone || '']);
  return csvText(out);
}

// Parse a pasted/uploaded student list. Accepted columns (header, any order):
// adm_no, name, father_name, class, section, roll_no, gender, dob, phone,
// whatsapp, b_form, address. Tab-separated works too (Excel paste).
export function parseStudentsCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return { rows: [], errors: ['empty file'] };
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const split = l => {
    if (sep === '\t') return l.split('\t').map(x => x.trim());
    const out = []; let cur = '', inQ = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = !inQ;
      else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur); return out.map(x => x.trim());
  };
  const head = split(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const col = n => head.indexOf(n);
  const rows = [], errors = [];
  lines.slice(1).forEach((l, i) => {
    const c = split(l);
    const get = n => col(n) >= 0 ? (c[col(n)] || '') : '';
    if (!get('name')) { errors.push(`row ${i + 2}: name missing — skipped`); return; }
    rows.push({
      line: i + 2,
      adm_no: get('adm_no'), name: get('name'), father_name: get('father_name'),
      className: get('class'), sectionName: get('section'), roll_no: get('roll_no'),
      gender: (get('gender') || 'M').toUpperCase().startsWith('F') ? 'F' : 'M',
      dob: get('dob'), phone: get('phone'), whatsapp: get('whatsapp') || get('phone'),
      b_form: get('b_form'), address: get('address')
    });
  });
  return { rows, errors };
}
