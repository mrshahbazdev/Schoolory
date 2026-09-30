// Shop document model + money helpers. All amounts are numbers in the shop's
// currency; fmt() renders them for display/print.

export const uid = (p = 'x') => p + Math.random().toString(36).slice(2, 10);

export const fmt = (n, cur = 'Rs') => `${cur} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
export const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const day = iso => (iso || '').slice(0, 10);
export const today = () => new Date().toISOString().slice(0, 10);

export function emptyStore() {
  return {
    version: 1,
    items: [],        // {id, sku, barcode, name, urduName, category, unit, price, cost, stock, minStock}
    sales: [],        // {id, number, at, lines:[{itemId,name,qty,price,cost,discount}], discount, total, paid, method, customer, customerId, note, user, voided}
    stockMoves: [],   // {id, itemId, qty(+/-), reason, at, note}
    expenses: [],     // {id, at, label, amount, category}
    customers: [],    // {id, name, phone, note}
    suppliers: [],    // {id, name, phone, note}
    khata: [],        // {id, partyType:'customer'|'supplier', partyId, partyName, at, amount(+ = they owe you / you owe them), kind:'sale'|'payment'|'purchase'|'manual', refId, note}
    purchases: [],    // {id, at, supplier, supplierId, lines:[{itemId,name,qty,cost}], total, paid, note, user}
    returns: [],      // {id, saleId, saleNumber, at, lines:[{itemId,name,qty,price}], refund, method, reason, user}
    zreports: [],     // {id, day, at, expectedCash, countedCash, variance, gross, salesCount, expenses, user, note}
    auditLog: [],
    settings: defaultSettings(),
    updatedAt: Date.now()
  };
}

export function defaultSettings() {
  return {
    shopName: '', shopAddress: '', shopPhone: '',
    currency: 'Rs',
    receiptFooter: 'Shukriya! Phir tashreef laye.',
    users: [],           // {id, name, role, pin:'s:salt:hash'}
    backupFolder: '', lastBackupAt: '',
    syncFolder: '', syncAuto: true, syncCode: '', hostOn: false,
    uiUrdu: false, receiptUrdu: true,
    firstRunDone: false, consent: null
  };
}

export function newItem(patch = {}) {
  return { id: uid('i'), sku: '', barcode: '', name: '', urduName: '', category: '', unit: 'pcs', price: 0, cost: 0, stock: 0, minStock: 0, ...patch };
}

export function lowStock(store) {
  return (store.items || []).filter(i => num(i.minStock) > 0 && num(i.stock) <= num(i.minStock));
}

// Reorder suggestion: low-stock items padded up to minStock*2.
export function reorderList(store) {
  return lowStock(store).map(i => ({ ...i, suggest: Math.max(1, num(i.minStock) * 2 - num(i.stock)) }));
}

export function saleLines(lines) {
  let total = 0;
  for (const l of lines) total += num(l.qty) * num(l.price) - num(l.discount);
  return total;
}

export function saleProfit(sale) {
  let p = 0;
  for (const l of (sale.lines || [])) p += (num(l.price) - num(l.cost)) * num(l.qty) - num(l.discount);
  return p - num(sale.discount);
}

export function liveSales(store) {
  return (store.sales || []).filter(s => !s.voided);
}

// Khata (ledger) balance for one party. Positive = receivable from customer /
// payable to supplier depending on partyType.
export function khataBalance(store, partyType, partyId) {
  return (store.khata || [])
    .filter(e => e.partyType === partyType && e.partyId === partyId)
    .reduce((t, e) => t + num(e.amount), 0);
}

export function partyEntries(store, partyType, partyId) {
  return (store.khata || [])
    .filter(e => e.partyType === partyType && e.partyId === partyId)
    .sort((a, b) => (a.at || '').localeCompare(b.at || ''));
}

export function findCustomer(store, nameOrId) {
  return (store.customers || []).find(c => c.id === nameOrId || c.name === nameOrId) || null;
}

// Post a purchase: record + stock moves + weighted-average cost update.
export function postPurchase(store, purchase, user) {
  store.purchases = store.purchases || [];
  store.purchases.push(purchase);
  for (const l of purchase.lines || []) {
    const it = (store.items || []).find(i => i.id === l.itemId);
    if (!it) continue;
    const oldVal = num(it.stock) * num(it.cost);
    const inVal = num(l.qty) * num(l.cost);
    const newStock = num(it.stock) + num(l.qty);
    it.cost = newStock > 0 ? Math.round((oldVal + inVal) / newStock * 100) / 100 : num(l.cost);
    it.stock = newStock;
    store.stockMoves.push({ id: uid('m'), itemId: it.id, qty: num(l.qty), reason: 'purchase', at: purchase.at, note: purchase.supplier || '' });
  }
}

// Post a return: stock back in, refund recorded.
export function postReturn(store, ret, user) {
  store.returns = store.returns || [];
  store.returns.push(ret);
  const sale = (store.sales || []).find(s => s.id === ret.saleId);
  for (const l of ret.lines || []) {
    const it = (store.items || []).find(i => i.id === l.itemId);
    if (it) it.stock = num(it.stock) + num(l.qty);
    store.stockMoves.push({ id: uid('m'), itemId: l.itemId, qty: num(l.qty), reason: 'return', at: ret.at, note: `Sale #${ret.saleNumber}` });
  }
  if (sale) sale.refundTotal = num(sale.refundTotal) + num(ret.refund);
}

export function returnsOn(store, dateStr) {
  return (store.returns || []).filter(r => day(r.at) === dateStr);
}

export function expectedCash(store, dateStr, opening = 0) {
  const sales = salesOn(store, dateStr).filter(s => !s.voided && s.method !== 'credit');
  const cashIn = sales.reduce((t, s) => t + num(s.paid), 0);
  const refunds = returnsOn(store, dateStr).reduce((t, r) => t + num(r.refund), 0);
  const exp = (store.expenses || []).filter(e => day(e.at) === dateStr).reduce((t, e) => t + num(e.amount), 0);
  return num(opening) + cashIn - refunds - exp;
}

export function nextSaleNumber(store) {
  return (store.sales || []).reduce((m, s) => Math.max(m, num(s.number)), 0) + 1;
}

export function salesOn(store, dateStr) {
  return (store.sales || []).filter(s => day(s.at) === dateStr);
}

export function dayTotals(store, dateStr) {
  const sales = salesOn(store, dateStr).filter(s => !s.voided);
  const gross = sales.reduce((t, s) => t + num(s.total), 0);
  const paid = sales.reduce((t, s) => t + num(s.paid), 0);
  const profit = sales.reduce((t, s) => t + saleProfit(s), 0);
  const returns = returnsOn(store, dateStr);
  const refunds = returns.reduce((t, r) => t + num(r.refund), 0);
  const expenses = (store.expenses || []).filter(e => day(e.at) === dateStr);
  const exp = expenses.reduce((t, e) => t + num(e.amount), 0);
  return { sales, gross, paid, profit, returns, refunds, expenses, exp, net: paid - refunds - exp };
}

// Code39 barcode → SVG rect list. Value is uppercased; unsupported chars → space.
export function code39Bars(value) {
  const P = {
    '0': '101001101101', '1': '110100101011', '2': '101100101011', '3': '110110010101',
    '4': '101001101011', '5': '110100110101', '6': '101100110101', '7': '101001011011',
    '8': '110100101101', '9': '101100101101', 'A': '110101001011', 'B': '101101001011',
    'C': '110110100101', 'D': '101011001011', 'E': '110101100101', 'F': '101101100101',
    'G': '101010011011', 'H': '110101001101', 'I': '101101001101', 'J': '101011001101',
    'K': '110101010011', 'L': '101101010011', 'M': '110110101001', 'N': '101011010011',
    'O': '110101101001', 'P': '101101101001', 'Q': '101010110011', 'R': '110101011001',
    'S': '101101011001', 'T': '101011011001', 'U': '110010101011', 'V': '100110101011',
    'W': '110011010101', 'X': '100101101011', 'Y': '110010110101', 'Z': '100110110101',
    '-': '100101011011', '.': '110010101101', ' ': '100110101101', '*': '100101101101',
    '$': '100100100101', '/': '100100101001', '+': '100101001001', '%': '101001001001'
  };
  const text = '*' + String(value || '').toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g, ' ') + '*';
  const bars = [];
  let x = 0;
  for (const ch of text) {
    const pat = P[ch];
    for (let i = 0; i < pat.length; i++) {
      const w = pat[i] === '1' ? 3 : 1;
      if (i % 2 === 0) bars.push([x, w]);
      x += w;
    }
    x += 1;
  }
  return { bars, width: x };
}

// Fictional sample shop so the app is usable on first launch (and screenshots).
export function sampleStore() {
  const st = emptyStore();
  const items = [
    ['Aata (chakki) 10kg', 'Grocery', 'bag', 1450, 1280, 12, 4],
    ['Basmati rice 5kg', 'Grocery', 'bag', 1850, 1600, 8, 3],
    ['Cooking oil 3L', 'Grocery', 'bottle', 1750, 1520, 15, 5],
    ['Sugar (chini) 1kg', 'Grocery', 'kg', 145, 128, 40, 10],
    ['Tea (patti) 430g', 'Grocery', 'pack', 720, 640, 22, 6],
    ['Milk (pouch) 1L', 'Dairy', 'pack', 250, 220, 30, 12],
    ['Bread (large)', 'Bakery', 'loaf', 180, 150, 18, 6],
    ['Eggs (dozen)', 'Dairy', 'tray', 340, 300, 16, 4],
    ['Matchbox (pack of 10)', 'Household', 'pack', 50, 38, 25, 5],
    ['Soap 175g', 'Household', 'bar', 160, 132, 20, 6],
    ['Toothpaste 100g', 'Household', 'tube', 320, 268, 9, 4],
    ['Dishwash bar 500g', 'Household', 'bar', 210, 170, 2, 6],
    ['Cold drink 1.5L', 'Beverages', 'bottle', 220, 185, 24, 8],
    ['Juice pack 1L', 'Beverages', 'pack', 310, 260, 0, 6],
    ['Biscuits (family pack)', 'Bakery', 'pack', 140, 112, 35, 10],
    ['Water bottle 1.5L', 'Beverages', 'bottle', 90, 68, 48, 12],
  ];
  st.items = items.map(([name, category, unit, price, cost, stock, minStock], i) =>
    newItem({ sku: 'ITM' + String(i + 1).padStart(3, '0'), name, category, unit, price, cost, stock, minStock }));

  const mk = (num_, hour, mins, lines, paid, method) => ({
    id: uid('s'), number: num_, at: new Date().toISOString().slice(0, 10) + 'T' + String(hour).padStart(2, '0') + ':' + String(mins).padStart(2, '0'),
    lines, discount: 0, total: saleLines(lines), paid, method, customer: '', note: '', user: 'Counter'
  });
  const line = (idx, qty) => ({ itemId: st.items[idx].id, name: st.items[idx].name, qty, price: st.items[idx].price, cost: st.items[idx].cost });
  st.sales = [
    mk(1, 9, 15, [line(3, 2), line(4, 1), line(14, 2)], 1860, 'cash'),
    mk(2, 10, 40, [line(0, 1), line(5, 3)], 2200, 'cash'),
    mk(3, 12, 5, [line(7, 1), line(6, 1), line(15, 2)], 700, 'cash'),
    mk(4, 14, 30, [line(2, 1), line(9, 3)], 2230, 'card'),
    mk(5, 16, 50, [line(8, 1), line(10, 1)], 370, 'cash'),
  ];
  st.expenses = [
    { id: uid('e'), at: today() + 'T08:30', label: 'Shop rent (daily share)', amount: 800 },
    { id: uid('e'), at: today() + 'T11:00', label: 'Bread supplier payment', amount: 1500 },
    { id: uid('e'), at: today() + 'T15:20', label: 'Electricity top-up', amount: 600 },
  ];
  st.stockMoves = [
    { id: uid('m'), itemId: st.items[2].id, qty: 10, reason: 'purchase', at: today() + 'T08:45', note: 'Metro supplier' },
    { id: uid('m'), itemId: st.items[0].id, qty: 5, reason: 'purchase', at: today() + 'T08:45', note: 'Metro supplier' },
    { id: uid('m'), itemId: st.items[11].id, qty: -3, reason: 'damage', at: today() + 'T13:10', note: 'Broken bottles' },
  ];
  st.customers = [
    { id: uid('c'), name: 'Riaz Ahmed', phone: '03011234567', note: 'Khata customer' },
    { id: uid('c'), name: 'Salma Bibi', phone: '03229876543', note: '' },
  ];
  st.suppliers = [
    { id: uid('u'), name: 'Metro Wholesale', phone: '04235711122', note: 'Weekly truck' },
    { id: uid('u'), name: 'Punjab Flour Mills', phone: '04237544455', note: '' },
  ];
  // Sample credit sale + khata entries.
  const creditSale = mk(6, 18, 10, [line(1, 1), line(3, 5), line(13, 2)], 500, 'credit');
  creditSale.customer = 'Riaz Ahmed';
  creditSale.customerId = st.customers[0].id;
  st.sales.push(creditSale);
  st.khata = [
    { id: uid('k'), partyType: 'customer', partyId: st.customers[0].id, partyName: 'Riaz Ahmed', at: today() + 'T18:10', amount: num(creditSale.total) - 500, kind: 'sale', refId: creditSale.id, note: 'Sale #6' },
    { id: uid('k'), partyType: 'supplier', partyId: st.suppliers[0].id, partyName: 'Metro Wholesale', at: today() + 'T08:45', amount: 12000, kind: 'purchase', refId: '', note: 'Last week order balance' },
  ];
  st.purchases = [
    { id: uid('p'), at: today() + 'T08:45', supplier: 'Metro Wholesale', supplierId: st.suppliers[0].id,
      lines: [{ itemId: st.items[2].id, name: st.items[2].name, qty: 10, cost: 1520 }, { itemId: st.items[0].id, name: st.items[0].name, qty: 5, cost: 1280 }],
      total: 21600, paid: 9600, note: 'Truck delivery', user: 'Counter' },
  ];
  st.settings.shopName = 'Al-Noor General Store';
  st.settings.shopAddress = 'Shop 4, Main Bazaar, Lahore';
  st.settings.shopPhone = '0300-1234567';
  return st;
}
