// Print HTML for fee challans (3-part: bank / school / parent copies),
// fee receipts, and the defaulter register.
import { fmt, num, today, challanStudentInfo, lateFeeFor, paidOn, reportCard, enrLabel, student, payslipLines, DAYS } from './model.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const monthName = m => { const d = new Date(m + '-01'); return d.toLocaleString('en', { month: 'long', year: 'numeric' }); };

function head(store, offsetMm) {
  const s = store.settings;
  return `
    <div class="sch-head" style="padding-top:${num(offsetMm)}mm">
      ${s.schoolName ? `<div class="sch-name">${esc(s.schoolName)}</div>` : ''}
      <div class="sch-sub">${esc(s.schoolAddress || '')} ${s.schoolPhone ? ' · ' + esc(s.schoolPhone) : ''}</div>
    </div>`;
}

function part(store, ch, lines, copyLabel) {
  const info = challanStudentInfo(store, ch);
  const s = store.settings;
  const late = lateFeeFor(store, ch);
  const paid = paidOn(store, ch.id);
  const rows = lines.map(l => `<tr><td>${esc(l.description)}</td><td class="r">${num(l.amount).toLocaleString()}</td></tr>`).join('');
  return `
  <section class="part">
    <div class="copy">${esc(copyLabel)}</div>
    ${head(store, s.letterheadOffset)}
    <table class="meta"><tr>
      <td><b>Challan #</b> ${ch.no}</td><td><b>Month</b> ${esc(monthName(ch.month))}</td>
      <td><b>Due date</b> ${esc(ch.due_on)}</td><td class="r"><b>Late fee</b> ${num(late) ? num(late).toLocaleString() : '—'}</td>
    </tr><tr>
      <td colspan="2"><b>${esc(info.student?.name || '')}</b> s/o ${esc(info.student?.father_name || '')}</td>
      <td><b>Class</b> ${esc(info.clsSec)}</td><td class="r"><b>Roll #</b> ${esc(info.enr?.roll_no || '')}</td>
    </tr></table>
    <table class="lines"><thead><tr><th>Particulars</th><th class="r">Amount (${esc(s.currency || 'Rs')})</th></tr></thead>
    <tbody>${rows}${num(ch.arrears) ? `<tr><td>Arrears (previous balance)</td><td class="r">${num(ch.arrears).toLocaleString()}</td></tr>` : ''}
    ${num(ch.late_fee) ? `<tr><td>Late fee</td><td class="r">${num(ch.late_fee).toLocaleString()}</td></tr>` : ''}</tbody></table>
    <table class="tot"><tr><td>Total payable</td><td class="r"><b>${num(ch.total + late).toLocaleString()}</b></td>
      <td>Paid</td><td class="r">${num(paid).toLocaleString()}</td>
      <td>Balance</td><td class="r"><b>${num(ch.total + late - paid).toLocaleString()}</b></td></tr></table>
    <div class="sign"><span>Depositor sign</span><span>Cashier</span><span>Officer</span></div>
    <div class="foot">${esc(s.challanFooter || '')}</div>
  </section>`;
}

export function challanHtml(store, challans) {
  const parts = challans.map(ch => {
    const lines = (store.challanLines || []).filter(l => l.challan_id === ch.id);
    return ['Bank copy', 'School copy', 'Parent copy'].map(c => part(store, ch, lines, c)).join('<div class="cut"></div>');
  }).join('<div style="page-break-after:always"></div>');
  return `<!doctype html><html><head><style>
    @page{size:A4;margin:8mm}
    body{font:9.5pt 'Segoe UI',sans-serif;color:#111}
    .part{position:relative;border:0}
    .cut{border-top:1.5px dashed #888;margin:7mm 0}
    .copy{position:absolute;right:0;top:0;font-size:7.5pt;color:#555;letter-spacing:.06em;text-transform:uppercase}
    .sch-head{text-align:center;margin-bottom:2mm}
    .sch-name{font-size:12pt;font-weight:700}
    .sch-sub{font-size:8pt;color:#444}
    table{width:100%;border-collapse:collapse}
    .meta td{padding:1mm .5mm;font-size:9pt;border:none}
    .lines td,.lines th{border:1px solid #999;padding:1.4mm 2mm;font-size:9pt}
    .lines th{background:#eef2f7;text-align:left}
    .tot td{padding:1.4mm 2mm;font-size:9.5pt;border-top:1.5px solid #333}
    .r{text-align:right}
    .sign{display:flex;justify-content:space-between;margin:9mm 2mm 0;font-size:8pt;color:#444}
    .sign span{border-top:1px solid #555;padding-top:1mm;min-width:22mm;text-align:center}
    .foot{text-align:center;font-size:7.5pt;color:#555;margin-top:3mm}
  </style></head><body>${parts}</body></html>`;
}

export function receiptHtml(store, receipt) {
  const ch = (store.challans || []).find(c => c.id === receipt.challan_id) || {};
  const info = challanStudentInfo(store, ch);
  const s = store.settings;
  return `<!doctype html><html><head><style>
    @page{size:A5;margin:12mm}
    body{font:10pt 'Segoe UI',sans-serif;color:#111}
    .sch-name{font-size:13pt;font-weight:700;text-align:center}
    .sch-sub{text-align:center;font-size:8.5pt;color:#444;margin-bottom:6mm}
    table{width:100%;border-collapse:collapse;margin-top:4mm}
    td{padding:2mm;border-bottom:1px solid #e2e8f0}
    .r{text-align:right}
    .big{font-size:13pt;font-weight:700}
    .foot{margin-top:8mm;text-align:center;font-size:8pt;color:#666}
    .stamp{margin-top:6mm;text-align:right;color:#444;font-size:9pt}
  </style></head><body>
    <div class="sch-name">${esc(s.schoolName || 'School')}</div>
    <div class="sch-sub">${esc(s.schoolAddress || '')} ${s.schoolPhone ? ' · ' + esc(s.schoolPhone) : ''}</div>
    <div class="big">Fee receipt — فیس رسید</div>
    <table>
      <tr><td>Receipt #</td><td class="r"><b>${receipt.no}</b></td></tr>
      <tr><td>Date</td><td class="r">${esc(receipt.received_on)}</td></tr>
      <tr><td>Student</td><td class="r">${esc(info.student?.name || '')} (${esc(info.clsSec || '')})</td></tr>
      <tr><td>Challan #</td><td class="r">${ch.no || '—'} · ${esc(monthName(ch.month || today().slice(0,7)))}</td></tr>
      <tr><td>Mode</td><td class="r">${esc(receipt.mode || 'cash')}${receipt.bank_ref ? ' · ' + esc(receipt.bank_ref) : ''}</td></tr>
      <tr><td class="big">Received</td><td class="r big">${fmt(receipt.amount, s.currency)}</td></tr>
      <tr><td>Remaining balance</td><td class="r">${fmt(Math.max(0, num(ch.total) + lateFeeFor(store, ch) - paidOn(store, ch.id)), s.currency)}</td></tr>
    </table>
    <div class="stamp">Signature ____________________</div>
    <div class="foot">${esc(s.challanFooter || '')} · Schoolory</div>
  </body></html>`;
}

export function defaultersHtml(store, rows, title) {
  const s = store.settings;
  const body = rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.student?.name || '')}</td><td>${esc(r.student?.father_name || '')}</td><td>${esc(r.clsSec)}</td><td>${esc(r.months.join(', '))}</td><td class="r">${num(r.due).toLocaleString()}</td><td>${esc(r.student?.whatsapp || r.student?.phone || '')}</td></tr>`).join('');
  return `<!doctype html><html><head><style>
    @page{size:A4;margin:14mm}
    body{font:10pt 'Segoe UI',sans-serif}
    h1{font-size:14pt;margin:0} .sub{color:#555;font-size:9pt;margin-bottom:6mm}
    table{width:100%;border-collapse:collapse} td,th{border:1px solid #cbd5e1;padding:1.6mm 2.4mm;text-align:left;font-size:9pt}
    th{background:#0c1c33;color:#fff}.r{text-align:right}
    .foot{margin-top:6mm;font-size:8pt;color:#666;text-align:center}
  </style></head><body>
    <h1>${esc(s.schoolName || 'School')} — Fee defaulters</h1>
    <div class="sub">${esc(title || '')} · printed ${today()}</div>
    <table><thead><tr><th>#</th><th>Student</th><th>Father</th><th>Class</th><th>Months due</th><th class="r">Amount</th><th>Phone</th></tr></thead><tbody>${body}</tbody></table>
    <div class="foot">Schoolory</div>
  </body></html>`;
}

// ---------- report card ----------
export function reportCardHtml(store, exam, enr) {
  const stu = student(store, enr.student_id);
  const rc = reportCard(store, exam.id, enr);
  const s = store.settings;
  const rows = rc.lines.map(l => `<tr><td>${esc(l.subject.name)}</td><td class="r">${l.full}</td><td class="r">${l.pass}</td><td class="r">${l.obtained === null ? '—' : l.obtained}</td><td class="r">${l.pct === null ? '—' : l.pct + '%'}</td></tr>`).join('');
  return `<!doctype html><html><head><style>
    @page{size:A4;margin:14mm}
    body{font:10.5pt 'Segoe UI',sans-serif;color:#111}
    .sch-name{font-size:14pt;font-weight:700;text-align:center}
    .sch-sub{text-align:center;font-size:9pt;color:#444;margin-bottom:6mm}
    table{width:100%;border-collapse:collapse}
    .meta td{border:none;padding:1mm 2mm;font-size:10pt}
    .lines td,.lines th{border:1px solid #94a3b8;padding:2mm;font-size:10pt}
    .lines th{background:#0c1c33;color:#fff;text-align:left}
    .r{text-align:right}
    .sum{display:flex;justify-content:space-between;margin-top:4mm;font-size:11pt}
    .grade{font-size:16pt;font-weight:700}
    .sign{display:flex;justify-content:space-between;margin:16mm 4mm 0;font-size:8.5pt;color:#444}
    .sign span{border-top:1px solid #555;padding-top:1mm;min-width:30mm;text-align:center}
    .foot{text-align:center;font-size:8pt;color:#666;margin-top:8mm}
  </style></head><body>
    <div class="sch-name">${esc(s.schoolName || 'School')}</div>
    <div class="sch-sub">${esc(s.schoolAddress || '')} ${s.schoolPhone ? ' · ' + esc(s.schoolPhone) : ''}</div>
    <div style="text-align:center;font-size:12pt;font-weight:700;margin-bottom:4mm">Report Card — ${esc(exam.name)}</div>
    <table class="meta"><tr>
      <td><b>Student</b> ${esc(stu?.name || '')}</td><td><b>Father</b> ${esc(stu?.father_name || '')}</td>
      <td><b>Class</b> ${esc(enrLabel(store, enr))}</td><td class="r"><b>Roll #</b> ${esc(enr.roll_no || '')}</td>
    </tr></table>
    <table class="lines"><thead><tr><th>Subject</th><th class="r">Full marks</th><th class="r">Pass marks</th><th class="r">Obtained</th><th class="r">%</th></tr></thead>
    <tbody>${rows}<tr><td><b>Total</b></td><td class="r"><b>${rc.totFull}</b></td><td></td><td class="r"><b>${rc.totObt}</b></td><td class="r"><b>${rc.pct}%</b></td></tr></tbody></table>
    <div class="sum"><span>Result: <b>${rc.fail ? 'FAIL' : 'PASS'}</b></span><span>Percentage: <b>${rc.pct}%</b></span><span class="grade">Grade: ${rc.grade}</span></div>
    <div class="sign"><span>Class teacher</span><span>Principal</span><span>Parent</span></div>
    <div class="foot">${esc(exam.term || '')} · ${esc(exam.held_on || '')} · Schoolory</div>
  </body></html>`;
}
export function reportCardsHtml(store, exam, enrolments) {
  const docs = enrolments.map(e => reportCardHtml(store, exam, e));
  const styles = (docs[0].match(/<style>[\s\S]*<\/style>/) || ['<style></style>'])[0];
  const bodies = docs.map(d => d.replace(/[\s\S]*<body>/, '').replace(/<\/body>[\s\S]*/, ''))
    .join('<div style="page-break-after:always"></div>');
  return `<!doctype html><html><head>${styles}</head><body>${bodies}</body></html>`;
}

// ---------- payslip ----------
export function payslipHtml(store, slip) {
  const st = (store.staff || []).find(x => x.id === slip.staff_id) || {};
  const lines = payslipLines(store, st, slip.month);
  const earn = lines.filter(l => l.type === 'earning').reduce((t, l) => t + l.amount, 0);
  const ded = lines.filter(l => l.type === 'deduction').reduce((t, l) => t + l.amount, 0);
  const s = store.settings;
  return `<!doctype html><html><head><style>
    @page{size:A5;margin:12mm}
    body{font:10pt 'Segoe UI',sans-serif}
    .sch-name{font-size:13pt;font-weight:700;text-align:center}
    .sch-sub{text-align:center;font-size:8.5pt;color:#444;margin-bottom:5mm}
    table{width:100%;border-collapse:collapse} td{padding:1.8mm;border-bottom:1px solid #e2e8f0}
    .r{text-align:right}.big{font-size:12pt;font-weight:700}
    .sign{display:flex;justify-content:space-between;margin:14mm 2mm 0;font-size:8pt;color:#444}
    .sign span{border-top:1px solid #555;padding-top:1mm;min-width:26mm;text-align:center}
    .foot{margin-top:8mm;text-align:center;font-size:8pt;color:#666}
  </style></head><body>
    <div class="sch-name">${esc(s.schoolName || 'School')}</div>
    <div class="sch-sub">${esc(s.schoolAddress || '')}</div>
    <div style="font-size:12pt;font-weight:700">Salary slip — ${esc(monthName(slip.month))}</div>
    <table>
      <tr><td>Slip #</td><td class="r">${slip.no}</td></tr>
      <tr><td>Staff</td><td class="r"><b>${esc(st.name || '')}</b> (${esc(st.role || '')})</td></tr>
      ${lines.map(l => `<tr><td>${esc(l.name)}</td><td class="r">${l.type === 'deduction' ? '−' : ''}${num(l.amount).toLocaleString()}</td></tr>`).join('')}
      <tr><td>Gross</td><td class="r">${earn.toLocaleString()}</td></tr>
      <tr><td>Deductions</td><td class="r">${ded.toLocaleString()}</td></tr>
      <tr><td class="big">Net payable</td><td class="r big">${fmt(earn - ded, s.currency)}</td></tr>
      <tr><td>Status</td><td class="r">${esc(slip.status)}${slip.paid_on ? ' · ' + esc(slip.paid_on) : ''}</td></tr>
    </table>
    <div class="sign"><span>Prepared by</span><span>Received by</span></div>
    <div class="foot">Schoolory</div>
  </body></html>`;
}

// ---------- timetable ----------
export function timetableHtml(store, section, periods) {
  const s = store.settings;
  const cell = (d, p) => {
    const t = (store.timetable || []).find(x => x.section_id === section.id && x.day === d && x.period === p);
    if (!t) return '';
    const su = (store.subjects || []).find(x => x.id === t.subject_id);
    const st = (store.staff || []).find(x => x.id === t.staff_id);
    return `<b>${esc(su ? su.name : '')}</b>${st ? '<br><i>' + esc(st.name) + '</i>' : ''}`;
  };
  const rows = DAYS.map(d => `<tr><td><b>${d}</b></td>${periods.map(p => `<td>${cell(d, p)}</td>`).join('')}</tr>`).join('');
  const cname = (store.classes || []).find(c => c.id === section.class_id);
  return `<!doctype html><html><head><style>
    @page{size:A4 landscape;margin:12mm}
    body{font:9.5pt 'Segoe UI',sans-serif}
    h1{font-size:13pt;margin:0 0 4mm}
    table{width:100%;border-collapse:collapse} td,th{border:1px solid #94a3b8;padding:2mm;text-align:center;font-size:9pt}
    th{background:#0c1c33;color:#fff}
    .foot{text-align:center;font-size:8pt;color:#666;margin-top:6mm}
  </style></head><body>
    <h1>${esc(s.schoolName || 'School')} — Timetable · ${esc(cname?.name || '')} ${esc(section.name)}</h1>
    <table><thead><tr><th>Day</th>${periods.map(p => `<th>Period ${p}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
    <div class="foot">Schoolory</div>
  </body></html>`;
}

// ---------- attendance register ----------
export function attendanceRegisterHtml(store, section, dateStr, rows) {
  const s = store.settings;
  const cname = (store.classes || []).find(c => c.id === section.class_id);
  const body = rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.roll || '')}</td><td>${esc(r.name)}</td><td>${esc(r.status || '—')}</td></tr>`).join('');
  return `<!doctype html><html><head><style>
    @page{size:A4;margin:14mm} body{font:10pt 'Segoe UI',sans-serif}
    h1{font-size:14pt;margin:0}.sub{color:#555;font-size:9pt;margin-bottom:6mm}
    table{width:100%;border-collapse:collapse}td,th{border:1px solid #cbd5e1;padding:1.6mm 2.4mm;font-size:9.5pt;text-align:left}
    th{background:#0c1c33;color:#fff}
    .foot{text-align:center;font-size:8pt;color:#666;margin-top:6mm}
  </style></head><body>
    <h1>${esc(s.schoolName || 'School')} — Attendance</h1>
    <div class="sub">${esc(cname?.name || '')} ${esc(section.name)} · ${esc(dateStr)}</div>
    <table><thead><tr><th>#</th><th>Roll</th><th>Student</th><th>Status</th></tr></thead><tbody>${body}</tbody></table>
    <div class="foot">P = present · A = absent · L = leave · Schoolory</div>
  </body></html>`;
}
