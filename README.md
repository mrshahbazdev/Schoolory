# Schoolory

Offline school fee & records office for small schools — students & enrolment, classes & sections, fee plans, concessions, 3-part bank challans, collection register, defaulter list with WhatsApp reminders, and session rollover. No account, no subscription, no internet.

## Features (Phase 1 — fees)

- **Admissions** — admission form with photo, guardian contact, B-form, sibling linking; bulk Excel/CSV import with preview + per-row errors
- **Classes & sections** — per-session classes, sections, register view, roll numbers, section moves
- **Fee setup** — fee heads (tuition/admission/exam/transport/lab/stationery/annual/other), per-class monthly plans with due day, per-student overrides, approved concessions (sibling/staff/merit/hardship) with audit
- **Challans** — generate for a class or the whole school with preview, gap-free sequential numbers at issue, arrears carried forward, **three-part print (bank / school / parent copy)** on A4, letterhead skip-offset, void with reason
- **Collection** — full or partial payment against a challan (cash/bank/online + bank ref), daily collection register, receipt print, **reversal with reason — receipts are never deleted**
- **Defaulters** — class-wise list, months outstanding, one-click WhatsApp (wa.me) reminder, printable + CSV
- **Sessions & rollover** — promotion/detain/leave preview per student, applies as new enrolment rows (history never rewritten), one-click undo, old session locked
- **Users & roles** — Principal / Accountant / Class teacher / Clerk, hashed PINs (scrypt), idle auto-lock — not a shared PIN
- **Second PC** — optional LAN host mode: another office PC opens the app in a browser with an access code; record-level merge so two PCs can't overwrite each other
- **Backups** — encrypted snapshots, daily auto-backup to a chosen folder/USB, restore points

## Data safety & privacy

- `schoolory.db` — SQLCipher-encrypted SQLite (WAL, foreign keys); the key is wrapped by the OS credential store (DPAPI/Keychain)
- Children's records (names, photos, contact details, fee history) live **only on the school's computer** — the school is the data controller
- Strict CSP, `connect-src 'none'` in packaged builds — the renderer cannot reach the internet
- LAN sharing is off by default and protected by an access code

## Dev

```bash
npm install
npm run dev        # vite + electron
npm run dist:win   # build NSIS + APPX on Windows
```

First launch loads a fictional sample school (Al-Noor Model School — 30 students, 2 classes, a fee plan and this month's challans) so every screen is demonstrable; "start blank" is one click away.
