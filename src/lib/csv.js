const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function itemsCsv(store) {
  const rows = [['sku', 'name', 'urdu_name', 'category', 'unit', 'price', 'cost', 'stock', 'min_stock']];
  for (const i of store.items || []) rows.push([i.sku, i.name, i.urduName || '', i.category || '', i.unit || '', i.price, i.cost, i.stock, i.minStock]);
  return rows.map(r => r.map(q).join(',')).join('\n');
}

export function salesCsv(store) {
  const rows = [['number', 'date', 'items', 'qty', 'total', 'paid', 'method', 'customer', 'user']];
  for (const s of store.sales || []) {
    const qty = (s.lines || []).reduce((t, l) => t + Number(l.qty || 0), 0);
    rows.push([s.number, (s.at || '').replace('T', ' '), (s.lines || []).map(l => `${l.name} x${l.qty}`).join('; '), qty, s.total, s.paid, s.method, s.customer || '', s.user || '']);
  }
  return rows.map(r => r.map(q).join(',')).join('\n');
}

// Import items CSV (same columns as itemsCsv export).
export function parseItemsCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const head = lines[0].toLowerCase();
  const rows = [];
  const split = l => {
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
  for (let i = 1; i < lines.length; i++) {
    const c = split(lines[i]);
    if (!c[1] && !c[0]) continue;
    if (head.includes('name')) {
      rows.push({ sku: c[0] || '', name: c[1] || '', urduName: c[2] || '', category: c[3] || '', unit: c[4] || 'pcs',
        price: Number(c[5]) || 0, cost: Number(c[6]) || 0, stock: Number(c[7]) || 0, minStock: Number(c[8]) || 0 });
    }
  }
  return rows;
}
