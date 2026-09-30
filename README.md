# Schoolory

Offline stock and sales register for small shops — items, stock in/out, low-stock alerts, bilingual (English/Urdu) receipts, day book and reports. No account, no subscription, no internet.

## Features

- **New sale (counter)** — scan/type SKU or name, cart with qty/price editing, discount, cash/card/credit, change & udhaar, 72mm receipt print + PDF
- **Items** — name + Urdu name, SKU, category, unit, sale price, cost, stock, reorder level, CSV import/export
- **Stock in/out** — purchases, returns, damage/expiry, exact-count adjust; every change is logged in a stock ledger
- **Low-stock alerts** — dashboard warns when items hit their minimum level
- **Day book** — sales + expenses per date, net for the day, printable
- **Reports** — date-range sales, gross profit, daily chart, top items by qty/profit, CSV export
- **Users & PIN** — admin/counter roles, PINs hashed (scrypt), idle auto-lock
- **Second counter** — optional LAN host mode: another PC opens the app in a browser with an access code; record-level merge so two counters can't overwrite each other
- **Backups** — encrypted JSON snapshots, daily auto-backup to a chosen folder/USB, restore points

## Data safety

- `schoolory.db` — SQLCipher-encrypted SQLite (WAL, foreign keys), key wrapped by OS DPAPI/Keychain
- Strict CSP, `connect-src 'none'` in packaged builds — the renderer cannot reach the network
- LAN sharing is opt-in, off by default, access-code protected, local-network only

## Develop

```bash
npm install
npm run dev        # Vite + Electron
npm run build      # renderer bundle → dist/
npm run dist:win   # Windows NSIS + APPX → release/ (Windows only)
```

Windows package metadata (appId `com.shahbaz.schoolory`, appx identity) lives in `package.json` → `build`. `identityName` / `publisher` must be pasted from Partner Center → Product Identity before the Store package is built. Tile assets for the appx live in `build/appx/`.
