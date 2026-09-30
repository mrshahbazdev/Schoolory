// Web shim for LAN host mode: when the bundle runs in a plain browser (the
// main PC's Schoolory serves it over the LAN), window.api is missing — provide
// a fetch-based equivalent talking to the host's /api endpoints. The access
// code is entered once and held in memory only (never the URL/history).
export function installWebApi() {
  if (window.api) return;
  let code = sessionStorage.getItem('inv-code') || '';
  const ask = () => {
    code = sessionStorage.getItem('inv-code') || '';
    if (code) return Promise.resolve(code);
    const v = window.prompt('Access code (shown on the main PC in Settings → Local connection):', '');
    if (v) { code = v.trim().toUpperCase(); sessionStorage.setItem('inv-code', code); }
    return Promise.resolve(code);
  };
  const apiFetch = async (path, opts = {}) => {
    await ask();
    const res = await fetch(path, { ...opts, headers: { 'x-schoolory-token': code, ...(opts.headers || {}) } });
    if (res.status === 401) { sessionStorage.removeItem('inv-code'); return apiFetch(path, opts); }
    return res;
  };
  let lastRev = 0;
  window.api = {
    store: {
      load: async () => {
        const r = await apiFetch('/api/store').then(x => x.json());
        lastRev = r.rev || 0;
        return { doc: r.doc };
      },
      save: async doc => apiFetch('/api/store', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doc, baseRev: lastRev }) }).then(x => x.json()),
      snapshot: async () => ({ ok: true }),
      history: async () => [],
      restore: async () => ({ doc: null })
    },
    auth: {
      verifyPin: async (userId, pin) => (await apiFetch('/api/verify-pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, pin }) }).then(x => x.json())).ok
    },
    export: {
      pdf: async () => { window.print(); return { ok: true }; },
      print: async () => { window.print(); return { ok: true }; },
      text: async () => ({ ok: false }), json: async () => ({ ok: false }), binary: async () => ({ ok: false }),
      toFolder: async () => ({ ok: false }), readFromFolder: async () => ({ ok: false })
    },
    sync: { publish: async () => ({ ok: true }), status: async () => ({ ok: true }), onApply: () => {} },
    host: {
      info: async () => ({ ok: true, remote: true, urls: [location.origin] }),
      set: async () => ({ ok: true }), rotateCode: async () => ({ ok: true })
    },
    app: { version: async () => 'web', openFile: async () => null, openUserData: async () => {} }
  };
}
