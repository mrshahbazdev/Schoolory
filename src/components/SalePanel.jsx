import { useMemo, useRef, useState } from 'react';
import { fmt, num, uid, nextSaleNumber, saleLines, findCustomer } from '../lib/model.js';
import { receiptHtml } from '../lib/receiptHtml.js';

// Point-of-sale cart: pick items (name/SKU search), adjust qty/price, take
// payment, save → stock decrements + stockMove entries + printable receipt.
export default function SalePanel({ store, update, user }) {
  const [q, setQ] = useState('');
  const [cart, setCart] = useState([]);           // [{itemId,name,urduName,qty,price,cost,unit}]
  const [discount, setDiscount] = useState(0);
  const [paid, setPaid] = useState('');
  const [method, setMethod] = useState('cash');
  const [customer, setCustomer] = useState('');
  const [savedSale, setSavedSale] = useState(null);
  const qRef = useRef(null);

  const items = store.items || [];
  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const n = q.trim().toLowerCase();
    return items.filter(i => `${i.sku} ${i.barcode || ''} ${i.name} ${i.urduName || ''}`.toLowerCase().includes(n)).slice(0, 8);
  }, [q, items]);

  const add = it => {
    setCart(c => {
      const ex = c.find(l => l.itemId === it.id);
      if (ex) return c.map(l => l.itemId === it.id ? { ...l, qty: l.qty + 1 } : l);
      return [...c, { itemId: it.id, name: it.name, urduName: it.urduName, qty: 1, price: num(it.price), cost: num(it.cost), unit: it.unit, discount: 0 }];
    });
    setQ(''); qRef.current?.focus();
  };

  // Barcode-style: type SKU then Enter adds the exact match directly.
  const onSearchKey = e => {
    if (e.key !== 'Enter') return;
    const n = q.trim().toLowerCase();
    const exact = items.find(i => (i.sku || '').toLowerCase() === n || (i.barcode || '').toLowerCase() === n) || matches[0];
    if (exact) add(exact);
  };

  const sub = saleLines(cart);
  const total = Math.max(0, sub - num(discount));
  const change = paid === '' ? null : num(paid) - total;

  const stockOf = id => num((items.find(i => i.id === id) || {}).stock);
  const oversell = cart.filter(l => l.qty > stockOf(l.itemId));

  const save = (printAfter) => {
    if (!cart.length) return;
    const sale = {
      id: uid('s'), number: nextSaleNumber(store),
      at: new Date().toISOString().slice(0, 16),
      lines: cart.map(l => ({ itemId: l.itemId, name: l.name, urduName: l.urduName, qty: num(l.qty), price: num(l.price), cost: num(l.cost), discount: num(l.discount) })),
      discount: num(discount), total, paid: num(paid) || total, method, customer: customer.trim(),
      note: '', user: (user && user.name) || 'app'
    };
    // Credit sale: unresolved balance lands on the customer's khata.
    const shortfall = Math.max(0, sale.total - num(sale.paid));
    if ((sale.method === 'credit' || shortfall > 0) && shortfall > 0) {
      let cust = findCustomer(store, sale.customer);
      if (!cust && sale.customer) cust = { id: uid('c'), name: sale.customer, phone: '', note: '', _new: true };
      if (cust) {
        sale.customerId = cust.id;
        sale.customer = cust.name;
        sale._khata = { partyId: cust.id, partyName: cust.name, amount: shortfall, _newCustomer: cust._new ? cust : null };
      }
    }
    update(s => {
      s.sales.push(sale);
      if (sale._khata) {
        if (sale._khata._newCustomer) { s.customers = s.customers || []; s.customers.push({ id: sale._khata._newCustomer.id, name: sale._khata._newCustomer.name, phone: '', note: '' }); }
        s.khata = s.khata || [];
        s.khata.push({ id: uid('k'), partyType: 'customer', partyId: sale._khata.partyId, partyName: sale._khata.partyName, at: sale.at, amount: sale._khata.amount, kind: 'sale', refId: sale.id, note: `Sale #${sale.number}` });
        delete sale._khata;
      }
      const at = sale.at;
      for (const l of cart) {
        const it = s.items.find(i => i.id === l.itemId);
        if (it) it.stock = num(it.stock) - num(l.qty);
        s.stockMoves = s.stockMoves || [];
        s.stockMoves.push({ id: uid('m'), itemId: l.itemId, qty: -num(l.qty), reason: 'sale', at, note: `Sale #${sale.number}` });
      }
    }, `sale #${sale.number}`);
    setSavedSale(sale);
    setCart([]); setDiscount(0); setPaid(''); setCustomer('');
    if (printAfter) window.api.export.print({ html: receiptHtml(sale, store.settings) });
    qRef.current?.focus();
  };

  return (
    <div className="editor-wrap">
      <div className="editor">
        <div className="etoolbar">
          <div className="medpick" style={{ flex: 1, minWidth: 240 }}>
            <input ref={qRef} className="in" style={{ width: '100%' }} autoFocus
              placeholder="Scan/type SKU or item name… (Enter adds first match)"
              value={q} onChange={e => setQ(e.target.value)} onKeyDown={onSearchKey} />
            {matches.length > 0 && (
              <div className="medpick-list">
                {matches.map((i, ix) => (
                  <div key={i.id} className={'medpick-item' + (ix === 0 ? ' on' : '')} onClick={() => add(i)}>
                    <b>{i.name}</b> {i.urduName ? <span style={{ fontSize: 12 }}>({i.urduName})</span> : ''}
                    <span className="g"> — {fmt(i.price, store.settings.currency)} · stock {num(i.stock)} {i.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <input className="in" style={{ width: 170 }} placeholder="Customer (optional)" value={customer} onChange={e => setCustomer(e.target.value)} />
        </div>

        <table className="grid">
          <thead><tr><th style={{ width: '38%' }}>Item</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Disc</th><th className="num">Amount</th><th className="num">In stock</th><th></th></tr></thead>
          <tbody>
            {cart.map((l, i) => (
              <tr key={l.itemId}>
                <td><b>{l.name}</b>{l.urduName ? <div className="muted" dir="rtl" style={{ fontSize: 11.5 }}>{l.urduName}</div> : ''}</td>
                <td className="num">
                  <button className="icon" onClick={() => setCart(c => c.map((x, ix) => ix === i ? { ...x, qty: Math.max(0.5, num(x.qty) - 1) } : x))}>−</button>
                  <input className="in num" style={{ width: 58 }} type="number" min="0" step="any" value={l.qty}
                    onChange={e => setCart(c => c.map((x, ix) => ix === i ? { ...x, qty: num(e.target.value) } : x))} />
                  <button className="icon" onClick={() => setCart(c => c.map((x, ix) => ix === i ? { ...x, qty: num(x.qty) + 1 } : x))}>+</button>
                </td>
                <td className="num"><input className="in num" style={{ width: 78 }} type="number" min="0" value={l.price}
                  onChange={e => setCart(c => c.map((x, ix) => ix === i ? { ...x, price: num(e.target.value) } : x))} /></td>
                <td className="num"><input className="in num" style={{ width: 62 }} type="number" min="0" value={l.discount || 0}
                  onChange={e => setCart(c => c.map((x, ix) => ix === i ? { ...x, discount: num(e.target.value) } : x))} /></td>
                <td className="num"><b>{fmt(num(l.qty) * num(l.price) - num(l.discount), store.settings.currency)}</b></td>
                <td className="num muted" style={{ color: l.qty > stockOf(l.itemId) ? 'var(--danger)' : undefined }}>{stockOf(l.itemId)} {l.unit}</td>
                <td><button className="icon" onClick={() => setCart(c => c.filter((_, ix) => ix !== i))}>✕</button></td>
              </tr>
            ))}
            {!cart.length && <tr><td colSpan="7" className="muted" style={{ padding: 26, textAlign: 'center' }}>Cart is empty — search or scan an item above.</td></tr>}
          </tbody>
        </table>

        {oversell.length > 0 && (
          <div className="allergy" style={{ marginTop: 12 }}>⚠ {oversell.map(l => `${l.name} (stock ${stockOf(l.itemId)})`).join(', ')} — selling more than in stock; count will go negative.</div>
        )}

        <div className="live-totals" style={{ fontSize: 15 }}>
          <span>Subtotal <b>{fmt(sub, store.settings.currency)}</b></span>
          <label className="lbl" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>Discount
            <input className="in num" style={{ width: 84 }} type="number" min="0" value={discount} onChange={e => setDiscount(e.target.value)} /></label>
          <span style={{ fontSize: 18 }}>Total <b>{fmt(total, store.settings.currency)}</b></span>
          <span className="spacer" />
          <select className="in" value={method} onChange={e => setMethod(e.target.value)}>
            <option value="cash">Cash</option><option value="card">Card</option><option value="credit">Credit / udhaar</option>
          </select>
          <input className="in num" style={{ width: 110 }} type="number" min="0" placeholder={`Paid ${total}`} value={paid} onChange={e => setPaid(e.target.value)} />
          {change !== null && <b style={{ color: change < 0 ? 'var(--danger)' : 'var(--ok)' }}>{change >= 0 ? `Change ${fmt(change, store.settings.currency)}` : `Due ${fmt(-change, store.settings.currency)}`}</b>}
        </div>

        <div className="frow" style={{ marginTop: 14 }}>
          <button className="btn" disabled={!cart.length} onClick={() => save(true)}>✔ Sale + print receipt</button>
          <button className="btn ghost" disabled={!cart.length} onClick={() => save(false)}>Save only</button>
          {savedSale && <span className="muted">Last sale #{savedSale.number} — {fmt(savedSale.total, store.settings.currency)}
            <button className="btn small ghost" style={{ marginLeft: 8 }} onClick={() => window.api.export.print({ html: receiptHtml(savedSale, store.settings) })}>reprint</button>
            <button className="btn small ghost" onClick={() => window.api.export.pdf({ html: receiptHtml(savedSale, store.settings), suggestedName: `receipt-${savedSale.number}.pdf` })}>PDF</button>
          </span>}
        </div>
      </div>

      <div className="preview" style={{ padding: 18 }}>
        <div className="pcount">Receipt preview</div>
        <div className="rxprev" style={{ background: '#fff', margin: '0 auto', width: '72mm', minHeight: 100, padding: '4mm', boxShadow: '0 2px 14px rgba(15,23,42,.18)', fontSize: 11 }}
          dangerouslySetInnerHTML={{ __html: cart.length ? receiptHtml({ number: nextSaleNumber(store), at: new Date().toISOString().slice(0, 16), lines: cart, discount, total, paid: num(paid) || total, method, customer }, store.settings).replace(/^[\s\S]*?(<style>[\s\S]*?<\/style>)[\s\S]*?<body>/, '$1').replace(/<\/body>[\s\S]*$/, '').replace(/(?<=<style>)[\s\S]*?(?=<\/style>)/, css => css.replace(/\bbody\s*\{/g, '.rxprev{').replace(/\btable\b/g, '.rxprev table').replace(/\bth\s*\{/g, '.rxprev th{').replace(/\btd\s*\{/g, '.rxprev td{').replace(/\bh1\s*\{/g, '.rxprev h1{')) : '<div style="padding:20px;color:#94a3b8;font-size:12px">Add items to see the receipt…</div>' }} />
      </div>
    </div>
  );
}
