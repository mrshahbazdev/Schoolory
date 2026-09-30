// School document model + fee/challan money logic. All amounts are numbers in
// the school's currency; fmt() renders them for display/print.
//
// Design rules (from the roadmap):
// - enrolments is the join between a student and an academic session — promotion
//   creates a NEW row; history is never edited across years.
// - receipts are never deleted: a mistake is a reversal row with a reason.
// - challan numbers are gap-free, allocated at issue time.
// - campus exists from day one even for a single-campus school.

export const uid = (p = 'x') => p + Math.random().toString(36).slice(2, 10);
export const fmt = (n, cur = 'Rs') => `${cur} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
export const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const day = iso => (iso || '').slice(0, 10);
export const today = () => new Date().toISOString().slice(0, 10);
export const ym = iso => (iso || '').slice(0, 7); // 'YYYY-MM' fee month

export const ROLES = {
  principal: 'Principal — full access',
  accountant: 'Accountant — fees & money, no marks',
  teacher: 'Class teacher — own sections, no money',
  clerk: 'Clerk — students, no money'
};

export function emptyStore() {
  return {
    version: 1,
    // Phase 1 (fees) — the product core.
    sessions: [],      // {id, name, starts_on, ends_on, is_current, locked}
    campuses: [],      // {id, name, address, phone}
    classes: [],       // {id, campus_id, name, level_order, session_id}
    sections: [],      // {id, class_id, name, teacher_id, capacity}
    students: [],      // {id, campus_id, adm_no, name, father_name, b_form, dob, gender, phone, whatsapp, address, photo, admitted_on, status, sibling_group_id}
    enrolments: [],    // {id, student_id, session_id, class_id, section_id, roll_no, status:'active'|'left'|'passed_out'|'detained', left_on, left_reason}
    staff: [],         // {id, campus_id, code, name, role, phone, joined_on, status, salary_basic}
    feeHeads: [],      // {id, name, kind:'fee'|'admission'|'exam'|'transport'|'lab'|'stationery'|'annual'|'other', recurring, sort_order}
    feePlans: [],      // {id, session_id, class_id, head_id, amount, due_day}
    feeOverrides: [],  // {id, enrolment_id, head_id, amount, reason, approved_by}
    concessions: [],   // {id, enrolment_id, head_id, type:'percent'|'amount', value, reason, approved_by, approved_on, from_month, to_month}
    challans: [],      // {id, no, enrolment_id, session_id, month:'YYYY-MM', issued_on, due_on, arrears, late_fee, total, status:'unpaid'|'partial'|'paid'|'void', voided_by, void_reason}
    challanLines: [],  // {id, challan_id, head_id, description, amount}
    receipts: [],      // {id, no, challan_id, enrolment_id, received_on, amount, mode:'cash'|'bank'|'online'|'other', bank_ref, received_by, reversed_by, reverse_reason, reversed_on}
    // Phase 2+ collections exist from day one as empty arrays — adding them
    // later would mean migrating every query.
    attendance: [], staffAttendance: [], leaves: [],
    subjects: [], exams: [], marks: [], gradeSchemes: [],
    salaryHeads: [], payslips: [],
    routes: [], transport: [], timetable: [], books: [], bookIssues: [],
    rollovers: [],       // {id, at, from, to, by} — audit of session rollovers
    auditLog: [],
    settings: defaultSettings(),
    updatedAt: Date.now()
  };
}

export function defaultSettings() {
  return {
    schoolName: '', schoolAddress: '', schoolPhone: '',
    campusName: 'Main campus',
    currency: 'Rs',
    challanFooter: 'Barah-e-karam due date tak adaigi kar dein.',
    lateFeeType: 'fixed',      // 'fixed' | 'per_day' | 'none'
    lateFeeValue: 0,
    letterheadOffset: 0,       // mm — skip header when printing on school letterhead
    users: [],                 // {id, name, role, pin:'s:salt:hash'} — roles in ROLES
    backupFolder: '', lastBackupAt: '',
    syncFolder: '', syncAuto: true, syncCode: '', hostOn: false,
    uiUrdu: false, printUrdu: true,
    firstRunDone: false, consent: null
  };
}

// ---------- lookups ----------
export function currentSession(store) {
  return (store.sessions || []).find(s => s.is_current) || (store.sessions || [])[0] || null;
}
export function cls(store, id) { return (store.classes || []).find(c => c.id === id) || null; }
export function sec(store, id) { return (store.sections || []).find(s => s.id === id) || null; }
export function student(store, id) { return (store.students || []).find(s => s.id === id) || null; }
export function enrolment(store, id) { return (store.enrolments || []).find(e => e.id === id) || null; }
export function feeHead(store, id) { return (store.feeHeads || []).find(h => h.id === id) || null; }

// Active enrolment for a student in a session (default: current session).
export function enrolFor(store, studentId, sessionId) {
  const sid = sessionId || (currentSession(store) || {}).id;
  return (store.enrolments || []).find(e => e.student_id === studentId && e.session_id === sid) || null;
}
export function activeEnrolments(store, sessionId) {
  const sid = sessionId || (currentSession(store) || {}).id;
  return (store.enrolments || []).filter(e => e.session_id === sid && e.status === 'active');
}
export function enrLabel(store, e) {
  if (!e) return '';
  const c = cls(store, e.class_id), s = sec(store, e.section_id);
  return [c && c.name, s && s.name].filter(Boolean).join(' - ');
}

// ---------- fee math ----------
// The monthly lines for one enrolment: plan rows for their class + overrides +
// concessions applied per head.
export function monthlyFeeLines(store, enr, month) {
  const plans = (store.feePlans || []).filter(p =>
    p.session_id === enr.session_id && p.class_id === enr.class_id);
  const lines = [];
  for (const p of plans) {
    const head = feeHead(store, p.head_id);
    let amount = num(p.amount);
    const ov = (store.feeOverrides || []).find(o => o.enrolment_id === enr.id && o.head_id === p.head_id);
    if (ov) amount = num(ov.amount);
    const conc = (store.concessions || []).find(c =>
      c.enrolment_id === enr.id && (c.head_id === p.head_id || !c.head_id) &&
      (!c.from_month || c.from_month <= month) && (!c.to_month || c.to_month >= month));
    if (conc) amount = conc.type === 'percent' ? amount * (1 - num(conc.value) / 100) : amount - num(conc.value);
    amount = Math.max(0, Math.round(amount));
    if (amount > 0) lines.push({ head_id: p.head_id, description: (head && head.name) || 'Fee', amount });
  }
  // Transport: assigned route adds its fee as a line unless a plan row already
  // charges a transport head for this class.
  const t = (store.transport || []).find(x => x.enrolment_id === enr.id);
  if (t) {
    const rt = (store.routes || []).find(r => r.id === t.route_id);
    if (rt && num(rt.fee) > 0) {
      const tHead = (store.feeHeads || []).find(h => h.kind === 'transport');
      const already = tHead && plans.some(p => p.head_id === tHead.id);
      if (!already) lines.push({ head_id: (tHead || {}).id || '', description: `Transport — ${rt.name}`, amount: num(rt.fee) });
    }
  }
  return lines.sort((a, b) => (feeHead(store, a.head_id)?.sort_order || 0) - (feeHead(store, b.head_id)?.sort_order || 0));
}

// Unpaid balance carried into a new challan for this enrolment.
export function arrearsFor(store, enrId, beforeMonth) {
  let arr = 0;
  for (const ch of (store.challans || [])) {
    if (ch.enrolment_id !== enrId || ch.status === 'void') continue;
    if (beforeMonth && ch.month >= beforeMonth) continue;
    arr += challanOutstanding(store, ch.id);
  }
  return arr;
}

export function paidOn(store, challanId) {
  return (store.receipts || [])
    .filter(r => r.challan_id === challanId && !r.reversed_by)
    .reduce((t, r) => t + num(r.amount), 0);
}
export function challanOutstanding(store, challanId) {
  const ch = (store.challans || []).find(c => c.id === challanId);
  if (!ch) return 0;
  const late = lateFeeFor(store, ch);
  return Math.max(0, num(ch.total) + late - paidOn(store, challanId));
}

export function lateFeeFor(store, ch) {
  const st = store.settings || {};
  if (ch.status === 'void' || ch.status === 'paid' || st.lateFeeType === 'none') return 0;
  const todayStr = today();
  if (!ch.due_on || ch.due_on >= todayStr) return 0;
  if (st.lateFeeType === 'fixed') return num(st.lateFeeValue);
  if (st.lateFeeType === 'per_day') {
    const days = Math.max(0, Math.round((Date.parse(todayStr) - Date.parse(ch.due_on)) / 86400000));
    return days * num(st.lateFeeValue);
  }
  return 0;
}

// Gap-free sequential numbering at ISSUE time.
export function nextChallanNo(store) {
  return (store.challans || []).reduce((m, c) => Math.max(m, num(c.no)), 0) + 1;
}
export function nextReceiptNo(store) {
  return (store.receipts || []).reduce((m, r) => Math.max(m, num(r.no)), 0) + 1;
}

export function challanStudentInfo(store, ch) {
  const e = enrolment(store, ch.enrolment_id);
  const st = e && student(store, e.student_id);
  return { enr: e, student: st, clsSec: enrLabel(store, e) };
}

// ---------- collection register ----------
export function receiptsOn(store, dateStr) {
  return (store.receipts || []).filter(r => day(r.received_on) === dateStr && !r.reversed_by);
}
export function collectionTotals(store, dateStr) {
  const rs = receiptsOn(store, dateStr);
  const byMode = {};
  for (const r of rs) byMode[r.mode || 'cash'] = (byMode[r.mode || 'cash'] || 0) + num(r.amount);
  return { receipts: rs, byMode, total: rs.reduce((t, r) => t + num(r.amount), 0) };
}

// ---------- defaulters ----------
export function defaulters(store, sessionId) {
  const sid = sessionId || (currentSession(store) || {}).id;
  const out = [];
  for (const e of activeEnrolments(store, sid)) {
    const st = student(store, e.student_id);
    if (!st) continue;
    const pending = (store.challans || []).filter(c =>
      c.enrolment_id === e.id && c.status !== 'void' && challanOutstanding(store, c.id) > 0 &&
      c.due_on && c.due_on < today());
    if (!pending.length) continue;
    const due = pending.reduce((t, c) => t + challanOutstanding(store, c.id), 0);
    out.push({ enrolment: e, student: st, clsSec: enrLabel(store, e), months: pending.map(c => c.month), due });
  }
  return out.sort((a, b) => b.due - a.due);
}

// ---------- attendance ----------
export function attendanceFor(store, dateStr, sectionId) {
  const rows = {};
  for (const a of (store.attendance || [])) {
    if (a.date !== dateStr) continue;
    const e = enrolment(store, a.enrolment_id);
    if (e && (!sectionId || e.section_id === sectionId)) rows[a.enrolment_id] = a;
  }
  return rows;
}
export function markAttendance(store, enrId, dateStr, status, by) {
  store.attendance = store.attendance || [];
  const row = store.attendance.find(a => a.enrolment_id === enrId && a.date === dateStr);
  if (status === '') { if (row) store.attendance = store.attendance.filter(a => a !== row); return; }
  if (row) { row.status = status; row.marked_by = by; }
  else store.attendance.push({ id: uid('at'), enrolment_id: enrId, date: dateStr, status, marked_by: by });
}
export function attendanceSummary(store, enrId, monthStr) {
  let p = 0, a = 0, l = 0;
  for (const r of (store.attendance || [])) {
    if (r.enrolment_id !== enrId || (monthStr && ym(r.date) !== monthStr)) continue;
    if (r.status === 'P') p++; else if (r.status === 'A') a++; else if (r.status === 'L') l++;
  }
  return { p, a, l, total: p + a + l };
}
export function staffAttendanceFor(store, dateStr) {
  const rows = {};
  for (const a of (store.staffAttendance || [])) if (a.date === dateStr) rows[a.staff_id] = a;
  return rows;
}
export function markStaffAttendance(store, staffId, dateStr, status, by) {
  store.staffAttendance = store.staffAttendance || [];
  const row = store.staffAttendance.find(a => a.staff_id === staffId && a.date === dateStr);
  if (status === '') { if (row) store.staffAttendance = store.staffAttendance.filter(a => a !== row); return; }
  if (row) { row.status = status; row.marked_by = by; }
  else store.staffAttendance.push({ id: uid('sa'), staff_id: staffId, date: dateStr, status, marked_by: by });
}

// ---------- exams & marks ----------
export function subjectsFor(store, classId) {
  return (store.subjects || []).filter(s => !classId || s.class_id === classId)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}
export function gradeFor(store, pct) {
  const scheme = (store.gradeSchemes || [])[0];
  const rows = (scheme && scheme.rows) || [
    { min: 90, g: 'A+' }, { min: 80, g: 'A' }, { min: 70, g: 'B' },
    { min: 60, g: 'C' }, { min: 50, g: 'D' }, { min: 40, g: 'E' }, { min: 0, g: 'F' }];
  for (const r of rows) if (pct >= num(r.min)) return r.g;
  return 'F';
}
export function marksFor(store, examId, enrId) {
  return (store.marks || []).filter(m => m.exam_id === examId && m.enrolment_id === enrId);
}
export function reportCard(store, examId, enr) {
  const subs = subjectsFor(store, enr.class_id);
  const lines = subs.map(su => {
    const m = (store.marks || []).find(x => x.exam_id === examId && x.enrolment_id === enr.id && x.subject_id === su.id);
    const ob = m ? num(m.obtained) : null;
    const full = num(su.full_marks) || 100;
    return { subject: su, obtained: ob, full, pass: num(su.pass_marks) || Math.round(full * 0.4), pct: ob === null ? null : Math.round(ob / full * 100) };
  });
  const totObt = lines.reduce((t, l) => t + (l.obtained || 0), 0);
  const totFull = lines.reduce((t, l) => t + l.full, 0);
  const pct = totFull ? Math.round(totObt / totFull * 100) : 0;
  return { lines, totObt, totFull, pct, grade: gradeFor(store, pct), fail: lines.some(l => l.obtained !== null && l.obtained < l.pass) };
}
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------- transport ----------
export function routeFor(store, enrId) {
  const t = (store.transport || []).find(x => x.enrolment_id === enrId);
  return t ? (store.routes || []).find(r => r.id === t.route_id) || null : null;
}

// ---------- payroll ----------
export function payslipFor(store, staffId, monthStr) {
  return (store.payslips || []).find(p => p.staff_id === staffId && p.month === monthStr) || null;
}
export function payslipLines(store, staff, monthStr) {
  const heads = (store.salaryHeads || []);
  const lines = [{ name: 'Basic salary', type: 'earning', amount: num(staff.salary_basic) }];
  for (const h of heads) lines.push({ name: h.name, type: h.type, amount: num(h.amount) });
  // unpaid leave deduction: 1/30 of basic per unpaid leave day in the month
  const absent = (store.staffAttendance || []).filter(a => a.staff_id === staff.id && ym(a.date) === monthStr && a.status === 'A').length;
  if (absent) lines.push({ name: `Absent days (${absent})`, type: 'deduction', amount: Math.round(num(staff.salary_basic) / 30 * absent) });
  return lines;
}
export function nextPayslipNo(store) {
  return (store.payslips || []).reduce((m, p) => Math.max(m, num(p.no)), 0) + 1;
}

// ---------- library ----------
export function book(store, id) { return (store.books || []).find(b => b.id === id) || null; }
export function bookOutCount(store, bookId) {
  return (store.bookIssues || []).filter(i => i.book_id === bookId && !i.returned_on).length;
}

// ---------- session rollover ----------
// Preview: what promotion would do. commitRollover applies it inside update().
export function rolloverPreview(store, fromSessionId, toSessionId, map) {
  // map: { class_id -> class_id } promotion map; missing = detain/leave
  const rows = [];
  for (const e of activeEnrolments(store, fromSessionId)) {
    const st = student(store, e.student_id);
    rows.push({
      enr: e, student: st,
      action: map[e.id] === 'leave' ? 'leaves' : map[e.id] === 'detain' ? 'detained' : 'promoted',
      toClassId: map[e.id] && map[e.id] !== 'leave' && map[e.id] !== 'detain' ? map[e.id].class_id : (map[e.id] === 'detain' ? e.class_id : null)
    });
  }
  return rows;
}

export function commitRollover(store, fromSessionId, toSessionId, decisions, user) {
  // decisions: { enrolment_id: { action: 'promote'|'detain'|'leave', to_class_id, to_section_id } }
  const tag = uid('ro');
  for (const e of (store.enrolments || [])) {
    if (e.session_id !== fromSessionId || e.status !== 'active') continue;
    const d = decisions[e.id];
    if (!d) continue;
    if (d.action === 'leave') {
      e.status = 'left'; e.left_on = today(); e.left_reason = d.reason || 'Session rollover'; e.rollover_tag = tag;
    } else {
      e.status = 'passed_out'; e.rollover_tag = tag;
      store.enrolments.push({
        id: uid('en'), student_id: e.student_id, session_id: toSessionId,
        class_id: d.action === 'detain' ? e.class_id : d.to_class_id,
        section_id: d.to_section_id || '', roll_no: d.roll_no || '',
        status: 'active', rollover_tag: tag
      });
    }
  }
  const fs = (store.sessions || []).find(s => s.id === fromSessionId);
  const ts = (store.sessions || []).find(s => s.id === toSessionId);
  if (fs) { fs.is_current = false; fs.locked = true; }
  if (ts) ts.is_current = true;
  store.rollovers = store.rollovers || [];
  store.rollovers.push({ id: tag, at: new Date().toISOString(), from: fromSessionId, to: toSessionId, by: user || 'app' });
  return tag;
}

export function undoRollover(store, tag) {
  store.enrolments = (store.enrolments || []).filter(e => e.rollover_tag !== tag || e.session_id === (store.rollovers || []).find(r => r.id === tag)?.from);
  for (const e of store.enrolments) {
    if (e.rollover_tag === tag && e.status !== 'active') { e.status = 'active'; delete e.left_on; delete e.left_reason; delete e.rollover_tag; }
  }
  const ro = (store.rollovers || []).find(r => r.id === tag);
  if (ro) {
    const fs = (store.sessions || []).find(s => s.id === ro.from);
    const ts = (store.sessions || []).find(s => s.id === ro.to);
    if (fs) { fs.is_current = true; fs.locked = false; }
    if (ts) ts.is_current = false;
  }
  store.rollovers = (store.rollovers || []).filter(r => r.id !== tag);
}

// ---------- sample data: fictional school, fully populated for first launch ----------
export function sampleStore() {
  const st = emptyStore();
  const sess = { id: uid('se'), name: '2025-26', starts_on: '2025-08-01', ends_on: '2026-05-31', is_current: true, locked: false };
  st.sessions = [sess];
  const campus = { id: uid('cp'), name: 'Main campus', address: '12-C, Main Bazaar, Lahore', phone: '0300-1234567' };
  st.campuses = [campus];

  const cSix = { id: uid('cl'), campus_id: campus.id, name: 'Class 6', level_order: 6, session_id: sess.id };
  const cSeven = { id: uid('cl'), campus_id: campus.id, name: 'Class 7', level_order: 7, session_id: sess.id };
  st.classes = [cSix, cSeven];
  const sA = { id: uid('sc'), class_id: cSix.id, name: 'A', teacher_id: '', capacity: 30 };
  const sB = { id: uid('sc'), class_id: cSeven.id, name: 'A', teacher_id: '', capacity: 30 };
  st.sections = [sA, sB];

  const teacher = { id: uid('st'), campus_id: campus.id, code: 'T01', name: 'Ayesha Khan', role: 'teacher', phone: '0321-7654321', joined_on: '2024-03-01', status: 'active', salary_basic: 45000 };
  st.staff = [teacher];
  sA.teacher_id = teacher.id;

  const heads = [
    { name: 'Tuition fee', kind: 'fee', recurring: true, sort_order: 1 },
    { name: 'Admission fee', kind: 'admission', recurring: false, sort_order: 2 },
    { name: 'Exam fee', kind: 'exam', recurring: false, sort_order: 3 },
    { name: 'Transport', kind: 'transport', recurring: true, sort_order: 4 },
    { name: 'Annual charges', kind: 'annual', recurring: false, sort_order: 5 },
  ];
  st.feeHeads = heads.map(h => ({ id: uid('fh'), ...h }));
  const H = k => st.feeHeads.find(h => h.kind === k).id;
  st.feePlans = [
    { id: uid('fp'), session_id: sess.id, class_id: cSix.id, head_id: H('fee'), amount: 2500, due_day: 10 },
    { id: uid('fp'), session_id: sess.id, class_id: cSix.id, head_id: H('transport'), amount: 1500, due_day: 10 },
    { id: uid('fp'), session_id: sess.id, class_id: cSeven.id, head_id: H('fee'), amount: 2800, due_day: 10 },
    { id: uid('fp'), session_id: sess.id, class_id: cSeven.id, head_id: H('transport'), amount: 1500, due_day: 10 },
  ];

  const firstBoys = ['Ali', 'Ahmed', 'Usman', 'Bilal', 'Hamza', 'Zain', 'Fahad', 'Danish', 'Saad', 'Omar'];
  const firstGirls = ['Fatima', 'Ayesha', 'Zainab', 'Mariam', 'Hira', 'Sana', 'Noor', 'Iqra', 'Amna', 'Khadija'];
  const fathers = ['Muhammad Akram', 'Abdul Rehman', 'Tariq Mehmood', 'Shafiq Ahmed', 'Nasir Ali', 'Imran Khan', 'Sajid Hussain', 'Rashid Minhas', 'Khalid Mahmood', 'Aslam Pervez'];
  const surnames = ['Ahmed', 'Khan', 'Ali', 'Hussain', 'Malik', 'Raza', 'Iqbal', 'Butt', 'Sheikh', 'Chaudhry'];
  const month = today().slice(0, 7);

  const sibA = uid('sg'), sibB = uid('sg');
  let roll = 1;
  for (let i = 0; i < 30; i++) {
    const six = i < 16;
    const girl = i % 2 === 0;
    const name = `${(girl ? firstGirls : firstBoys)[i % 10]} ${surnames[i % 10]}`;
    const stu = {
      id: uid('p'), campus_id: campus.id, adm_no: 'ADM-' + String(i + 1).padStart(3, '0'),
      name, father_name: fathers[i % 10], b_form: '', dob: `201${3 + (i % 4)}-0${1 + (i % 9)}-1${i % 9}`,
      gender: girl ? 'F' : 'M', phone: `03${10 + i}-555${100 + i}`, whatsapp: `03${10 + i}-555${100 + i}`,
      address: `House ${i + 3}, Street ${2 + i % 5}, Gulberg`, photo: '',
      admitted_on: '2025-08-15', status: 'active',
      sibling_group_id: i === 5 || i === 6 ? sibA : (i === 20 || i === 21 ? sibB : '')
    };
    st.students.push(stu);
    st.enrolments.push({
      id: uid('en'), student_id: stu.id, session_id: sess.id,
      class_id: six ? cSix.id : cSeven.id, section_id: six ? sA.id : sB.id,
      roll_no: String(roll++), status: 'active'
    });
    if (six) roll = i === 15 ? 1 : roll;
  }
  // one concession: sibling discount on first sibling-group child
  const sibEnr = st.enrolments[5];
  st.concessions = [{ id: uid('cn'), enrolment_id: sibEnr.id, head_id: H('fee'), type: 'percent', value: 25, reason: 'Sibling discount', approved_by: 'Principal', approved_on: today(), from_month: '', to_month: '' }];

  // generate challans for this month for everyone + receipts for ~half
  let cno = 1, rno = 1;
  const due = `${month}-10`;
  st.enrolments.forEach((e, i) => {
    const lines = monthlyFeeLines(st, e, month);
    const total = lines.reduce((t, l) => t + l.amount, 0);
    const ch = {
      id: uid('ch'), no: cno++, enrolment_id: e.id, session_id: sess.id, month,
      issued_on: `${month}-01`, due_on: due, arrears: 0, late_fee: 0, total,
      status: 'unpaid'
    };
    st.challans.push(ch);
    lines.forEach(l => st.challanLines.push({ id: uid('cl2'), challan_id: ch.id, head_id: l.head_id, description: l.description, amount: l.amount }));
    if (i % 2 === 0) {
      const paidAll = i % 4 === 0;
      const amount = paidAll ? total : Math.round(total / 2);
      st.receipts.push({
        id: uid('r'), no: rno++, challan_id: ch.id, enrolment_id: e.id,
        received_on: `${month}-0${5 + (i % 4)}`, amount, mode: i % 3 ? 'cash' : 'bank',
        bank_ref: i % 3 ? '' : 'HBL-' + (1000 + i), received_by: 'Office'
      });
      ch.status = paidAll ? 'paid' : 'partial';
    }
  });

  // --- Phase 2+ sample: subjects, an exam with marks, routes, books ---
  const subjNames = ['English', 'Mathematics', 'Urdu', 'Science'];
  [cSix, cSeven].forEach((c, ci) => {
    subjNames.forEach((n, i) => st.subjects.push({
      id: uid('su'), class_id: c.id, name: n, full_marks: 100, pass_marks: 40, sort_order: i + 1
    }));
  });
  const exam = { id: uid('ex'), session_id: sess.id, name: 'First Term', term: 'Term 1', held_on: '2026-01-15' };
  st.exams = [exam];
  st.enrolments.filter(e => e.class_id === cSix.id).forEach(e => {
    st.subjects.filter(s => s.class_id === cSix.id).forEach((su, i) => {
      st.marks.push({ id: uid('mk'), exam_id: exam.id, subject_id: su.id, enrolment_id: e.id, obtained: 35 + ((parseInt(e.roll_no, 10) * 13 + i * 7) % 60) });
    });
  });
  const route = { id: uid('rt'), name: 'Route 1 — Gulberg', driver: 'Naveed Ahmed', phone: '0322-1112233', fee: 1500 };
  st.routes = [route];
  st.enrolments.slice(0, 5).forEach(e => st.transport.push({ id: uid('tr'), enrolment_id: e.id, route_id: route.id }));
  st.salaryHeads = [
    { id: uid('sh'), name: 'House rent', type: 'earning', amount: 9000 },
    { id: uid('sh'), name: 'Late arrivals', type: 'deduction', amount: 500 },
  ];
  ['Mathematics — Class 6', 'English Grammar — Class 6', 'Urdu Adab — Class 7', 'General Science — Class 7', 'Islamiat — Class 6', 'Computer Basics', 'Story Book — Khirki', 'Dictionary (English-Urdu)'].forEach((t, i) => {
    st.books.push({ id: uid('bk'), title: t, author: 'Punjab Textbook Board', accession: 'BK-' + String(i + 1).padStart(3, '0'), copies: 2 });
  });
  st.bookIssues = [
    { id: uid('bi'), book_id: st.books[0].id, student_id: st.students[0].id, issued_on: today(), due_on: '', returned_on: '' },
    { id: uid('bi'), book_id: st.books[3].id, student_id: st.students[20].id, issued_on: today(), due_on: '', returned_on: '' },
  ];
  // a few days of attendance for the register
  st.enrolments.forEach((e, i) => {
    for (let d = 1; d <= 3; d++) {
      const status = (i + d) % 9 === 0 ? 'A' : 'P';
      st.attendance.push({ id: uid('at'), enrolment_id: e.id, date: `${today().slice(0, 8)}0${d}`, status, marked_by: 'Teacher' });
    }
  });

  st.settings.schoolName = 'Al-Noor Model School';
  st.settings.schoolAddress = '12-C, Main Bazaar, Lahore';
  st.settings.schoolPhone = '042-3571-1122';
  st.settings.lateFeeType = 'fixed';
  st.settings.lateFeeValue = 100;
  return st;
}
