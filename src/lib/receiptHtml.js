import { fmt, num } from './model.js';

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// 72mm thermal-style receipt, also printable to A4/PDF. Bilingual: Urdu item
// names fall back to English when the item has no urduName.
export function receiptHtml(sale, st) {
  const cur = st.currency || 'Rs';
  const useUrdu = st.receiptUrdu !== false;
  const rows = (sale.lines || []).map(l => `
    <tr>
      <td class="nm">${esc(useUrdu && l.urduName ? l.urduName : l.name)}${useUrdu && l.urduName ? `<div class="en">${esc(l.name)}</div>` : ''}</td>
      <td class="q">${num(l.qty)}</td>
      <td class="p">${num(l.price).toLocaleString()}</td>
      <td class="t">${(num(l.qty) * num(l.price) - num(l.discount)).toLocaleString()}${num(l.discount) ? `<div class="en">-${num(l.discount).toLocaleString()} disc</div>` : ''}</td>
    </tr>`).join('');
  const total = saleLinesOf(sale);
  const change = num(sale.paid) - total;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: 72mm auto; margin: 4mm; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #111; width: 64mm; }
h1 { font-size: 14px; text-align: center; margin: 0; }
.sub { text-align: center; font-size: 9.5px; color: #444; margin: 1px 0; }
.hr { border-top: 1px dashed #000; margin: 5px 0; }
table { width: 100%; border-collapse: collapse; }
th { font-size: 9px; text-align: left; border-bottom: 1px solid #000; padding: 1px 0; }
td { padding: 1.5px 0; vertical-align: top; }
.nm { width: 55%; }
.en { font-size: 8.5px; color: #555; }
.q, .p, .t { text-align: right; font-variant-numeric: tabular-nums; }
.tot { font-size: 13px; font-weight: 800; display: flex; justify-content: space-between; margin-top: 3px; }
.meta { display: flex; justify-content: space-between; font-size: 10px; }
.foot { text-align: center; font-size: 10px; margin-top: 6px; }
.rtl { direction: rtl; font-family: 'Jameel Noori Nastaleeq', 'Noto Nastaliq Urdu', 'Segoe UI', sans-serif; }
</style></head><body>
  <h1>${esc(st.shopName || 'Shop')}</h1>
  ${st.shopAddress ? `<div class="sub">${esc(st.shopAddress)}</div>` : ''}
  ${st.shopPhone ? `<div class="sub">${esc(st.shopPhone)}</div>` : ''}
  <div class="hr"></div>
  <div class="meta"><span>Sale #${sale.number || '—'}</span><span>${esc((sale.at || '').replace('T', ' ').slice(0, 16))}</span></div>
  ${sale.customer ? `<div class="meta"><span>Customer: ${esc(sale.customer)}</span></div>` : ''}
  <div class="hr"></div>
  <table><thead><tr><th>Item / جنس</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amt</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="hr"></div>
  ${num(sale.discount) ? `<div class="meta"><span>Discount / رعایت</span><span>-${fmt(sale.discount, cur)}</span></div>` : ''}
  <div class="tot"><span>Total / کل</span><span>${fmt(total, cur)}</span></div>
  <div class="meta"><span>Paid (${esc(sale.method || 'cash')}) / ادا شدہ</span><span>${fmt(sale.paid, cur)}</span></div>
  ${change > 0 ? `<div class="meta"><span>Change / واپسی</span><span>${fmt(change, cur)}</span></div>` : ''}
  ${change < 0 ? `<div class="meta"><span>Balance due / بقایا</span><span>${fmt(-change, cur)}</span></div>` : ''}
  <div class="hr"></div>
  <div class="foot rtl">${esc(st.receiptFooter || '')}</div>
  <div class="foot" style="font-size:8.5px;color:#666">Schoolory</div>
</body></html>`;
}

function saleLinesOf(sale) {
  let t = 0;
  for (const l of sale.lines || []) t += num(l.qty) * num(l.price) - num(l.discount);
  return t - num(sale.discount);
}
