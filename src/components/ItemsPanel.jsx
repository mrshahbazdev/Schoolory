import { useState } from 'react';
import { fmt, newItem, num, uid, code39Bars } from '../lib/model.js';
import { itemsCsv, parseItemsCsv } from '../lib/csv.js';

export default function ItemsPanel({ store, update }) {
  const [q, setQ] = useState('');
  const [editId, setEditId] = useState(null);
  const items = store.items || [];
  const shown = items.filter(i => !q || `${i.name} ${i.urduName || ''} ${i.sku} ${i.category}`.toLowerCase().includes(q.toLowerCase()));
  const cats = [...new Set(items.map(i => i.category).filter(Boolean))].sort();
  const [cat, setCat] = useState('');

  const E = ({ it }) => (
    <tr>
      <td><input className="in" style={{ width: 90 }} value={it.sku} placeholder="SKU" onChange={e => update(s => { s.items.find(x => x.id === it.id).sku = e.target.value; })} /></td>
      <td><input className="in" style={{ width: 96 }} value={it.barcode || ''} placeholder="Barcode" onChange={e => update(s => { s.items.find(x => x.id === it.id).barcode = e.target.value; })} /></td>
      <td><input className="in" value={it.name} placeholder="Item name" onChange={e => update(s => { s.items.find(x => x.id === it.id).name = e.target.value; })} /></td>
      <td><input className="in" dir="rtl" style={{ width: 110 }} value={it.urduName || ''} placeholder="اردو نام" onChange={e => update(s => { s.items.find(x => x.id === it.id).urduName = e.target.value; })} /></td>
      <td><input className="in" style={{ width: 90 }} value={it.category || ''} placeholder="Category" list="icats" onChange={e => update(s => { s.items.find(x => x.id === it.id).category = e.target.value; })} /></td>
      <td><input className="in" style={{ width: 56 }} value={it.unit || ''} placeholder="unit" onChange={e => update(s => { s.items.find(x => x.id === it.id).unit = e.target.value; })} /></td>
      <td><input className="in num" style={{ width: 74 }} type="number" min="0" value={it.price} onChange={e => update(s => { s.items.find(x => x.id === it.id).price = num(e.target.value); })} /></td>
      <td><input className="in num" style={{ width: 74 }} type="number" min="0" value={it.cost} onChange={e => update(s => { s.items.find(x => x.id === it.id).cost = num(e.target.value); })} /></td>
      <td className="num"><b>{num(it.stock)}</b></td>
      <td><input className="in num" style={{ width: 60 }} type="number" min="0" value={it.minStock} onChange={e => update(s => { s.items.find(x => x.id === it.id).minStock = num(e.target.value); })} /></td>
      <td className="acts"><button className="btn small" onClick={() => setEditId(null)}>Done</button></td>
    </tr>
  );

  const exportItems = () => window.api.export.text({ text: itemsCsv(store), suggestedName: 'schoolory-items.csv' });
  // Printable Code39 label sheet (A4 grid) for items with a barcode or SKU.
  const printLabels = () => {
    const list = (cat ? items.filter(i => i.category === cat) : items).filter(i => i.barcode || i.sku);
    if (!list.length) return alert('No items with a barcode/SKU to label.');
    const esc = x => String(x ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const cell = it => {
      const { bars, width } = code39Bars(it.barcode || it.sku);
      const rects = bars.map(([x, w]) => `<rect x="${x}" y="0" width="${w}" height="40" fill="#000"/>`).join('');
      return `<div class="lbl-cell"><div class="lnm">${esc(it.name)}</div><svg viewBox="0 0 ${width} 40" preserveAspectRatio="none">${rects}</svg><div class="lpr">${esc(it.barcode || it.sku)} · ${fmt(it.price, store.settings.currency)}</div></div>`;
    };
    window.api.export.print({ html: `<!doctype html><html><head><style>@page{size:A4;margin:8mm}body{font:9pt 'Segoe UI',sans-serif}.sheet{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}.lbl-cell{border:1px dashed #94a3b8;padding:3mm;text-align:center}.lnm{font-weight:700;font-size:8.5pt;margin-bottom:2mm;white-space:nowrap;overflow:hidden}.lbl-cell svg{width:100%;height:12mm}.lpr{font-size:8pt;letter-spacing:1px}</style></head><body><div class="sheet">${list.map(cell).join('')}</div></body></html>` });
  };

  const importItems = async () => {
    const f = await window.api.app.openFile({ filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (!f?.text) return;
    const rows = parseItemsCsv(f.text);
    if (!rows.length) return alert('No items found in that CSV');
    update(s => {
      for (const r of rows) {
        const ex = s.items.find(i => i.sku && r.sku && i.sku === r.sku);
        if (ex) Object.assign(ex, r); else s.items.push({ ...newItem(), ...r, id: uid('i') });
      }
    }, `import ${rows.length} items`);
    alert(`Imported/updated ${rows.length} items`);
  };

  return (
    <div className="panel" style={{ maxWidth: 1250 }}>
      <div className="toolbar">
        <input className="in" style={{ flex: 1, maxWidth: 320 }} placeholder="Search name / SKU / category…" value={q} onChange={e => setQ(e.target.value)} />
        <select className="in" value={cat} onChange={e => setCat(e.target.value)}>
          <option value="">All categories</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="spacer" />
        <button className="btn ghost small" onClick={exportItems}>CSV</button>
        <button className="btn ghost small" title="Print barcode/price labels" onClick={printLabels}>🏷 Labels</button>
        <button className="btn ghost small" onClick={importItems}>Import CSV</button>
        <button className="btn" onClick={() => { const it = newItem(); update(s => s.items.unshift(it), 'add item'); setEditId(it.id); }}>+ New item</button>
      </div>
      <datalist id="icats">{cats.map(c => <option key={c} value={c} />)}</datalist>
      <table className="grid">
        <thead><tr><th>SKU</th><th>Barcode</th><th>Name</th><th>اردو</th><th>Category</th><th>Unit</th><th className="num">Sale price</th><th className="num">Cost</th><th className="num">Stock</th><th className="num">Min</th><th></th></tr></thead>
        <tbody>
          {shown.filter(i => !cat || i.category === cat).map(it => editId === it.id ? <E key={it.id} it={it} /> : (
            <tr key={it.id} style={num(it.minStock) > 0 && num(it.stock) <= num(it.minStock) ? { background: '#fef2f2' } : {}}>
              <td className="muted">{it.sku}</td>
              <td className="muted" style={{ fontSize: 11.5 }}>{it.barcode || '—'}</td>
              <td><b>{it.name}</b></td>
              <td dir="rtl" style={{ fontSize: 12.5 }}>{it.urduName}</td>
              <td className="muted">{it.category}</td>
              <td className="muted">{it.unit}</td>
              <td className="num">{fmt(it.price, store.settings.currency)}</td>
              <td className="num muted">{fmt(it.cost, store.settings.currency)}</td>
              <td className="num"><b style={{ color: num(it.minStock) > 0 && num(it.stock) <= num(it.minStock) ? 'var(--danger)' : 'inherit' }}>{num(it.stock)}</b></td>
              <td className="num muted">{num(it.minStock) || '—'}</td>
              <td className="acts">
                <button className="icon" title="Edit" onClick={() => setEditId(it.id)}>✎</button>
                <button className="icon" title="Delete" onClick={() => { if (confirm(`Delete "${it.name}"?`)) update(s => s.items = s.items.filter(x => x.id !== it.id), 'delete item'); }}>✕</button>
              </td>
            </tr>
          ))}
          {!shown.length && <tr><td colSpan="11" className="muted" style={{ padding: 20 }}>No items match. Add your first item with "+ New item".</td></tr>}
        </tbody>
      </table>
      <p className="muted" style={{ marginTop: 8 }}>{items.length} items · stock counts change through Stock in/out and sales — this list edits names, prices and reorder levels.</p>
    </div>
  );
}
