/* IndexedDB storage: kv (identity/settings/state), msgs (with Blobs), stickers. Migrates old localStorage data. */
(function (G) {
  'use strict';
  let db;
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = (store, mode = 'readonly') => db.transaction(store, mode).objectStore(store);

  async function init(name = 'shilagram') {
    db = await new Promise((res, rej) => {
      const o = indexedDB.open(name, 1);
      o.onupgradeneeded = () => {
        const d = o.result;
        d.createObjectStore('kv');
        const m = d.createObjectStore('msgs', { keyPath: 'id' });
        m.createIndex('chat', 'chat'); m.createIndex('pend', 'pend');
        d.createObjectStore('stickers', { keyPath: 'id' });
      };
      o.onsuccess = () => res(o.result); o.onerror = () => rej(o.error);
    });
  }
  const get = k => req(tx('kv').get(k));
  const del = k => req(tx('kv', 'readwrite').delete(k));
  const clearMsgs = () => req(tx('msgs', 'readwrite').clear());
  const set = (k, v) => req(tx('kv', 'readwrite').put(v, k));
  const putMsg = m => req(tx('msgs', 'readwrite').put(m));
  const delMsg = id => req(tx('msgs', 'readwrite').delete(id));
  const chatMsgs = async chat => (await req(tx('msgs').index('chat').getAll(chat))).sort((a, b) => a.ts - b.ts);
  const pendingMsgs = () => req(tx('msgs').index('pend').getAll(1));
  async function delChat(chat) {
    const keys = await req(tx('msgs').index('chat').getAllKeys(chat)), s = tx('msgs', 'readwrite');
    keys.forEach(k => s.delete(k));
  }
  async function rekeyChat(a, b) {
    const ms = await chatMsgs(a);
    return new Promise(r => { const t_ = db.transaction('msgs', 'readwrite'), st = t_.objectStore('msgs');
      ms.forEach(m => { st.delete(m.id); m.chat = b; m.id = m.mid + ':' + b; if (m.f === a) m.f = b; if (m.p) m.p = m.p.map(x => x === a ? b : x); st.put(m); });
      t_.oncomplete = () => r(); t_.onerror = () => r(); });
  }
  const stickers = async () => (await req(tx('stickers').getAll())).sort((a, b) => b.ts - a.ts);
  const putSticker = s => req(tx('stickers', 'readwrite').put(s));
  const delSticker = id => req(tx('stickers', 'readwrite').delete(id));
  const getMsg = id => req(tx('msgs').get(id));
  async function wipe() { for (const n of ['kv', 'msgs', 'stickers']) await req(tx(n, 'readwrite').clear()); }
  const allMsgs = () => req(tx('msgs').getAll());

  // data-URL -> Blob (for migrating old stickers)
  const durl = u => { const [h, d] = u.split(','), mime = /:(.*?);/.exec(h)[1], b = atob(d), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return new Blob([a], { type: mime }); };

  // Old single-file app stored everything in localStorage ('shila', 'shila_st'). Move it once.
  async function migrateLegacy() {
    let old; try { old = JSON.parse(localStorage.getItem('shila')); } catch (e) { return null; }
    if (!old || !old.me || !old.me.key) return null;
    const state = { chats: {}, groups: {} };
    const put = async (id, o, group) => {
      const meta = { name: o.name, u: o.u || 0, last: 0 };
      if (group) meta.mem = o.mem; state[group ? 'groups' : 'chats'][id] = meta;
      for (const m of o.m || []) {
        await putMsg({ id: m.i + ':' + id, mid: m.i, chat: id, f: m.f, me: m.me ? 1 : 0, ts: m.ts, kind: m.s ? 'st' : 't', x: m.x, b: m.s ? durl(m.s) : undefined, mime: m.s ? durl(m.s).type : undefined, p: m.p || [], pend: m.p && m.p.length ? 1 : undefined, sent: m.sent });
        meta.last = Math.max(meta.last, m.ts);
      }
    };
    for (const [id, o] of Object.entries(old.c || {})) await put(id, o, 0);
    for (const [id, o] of Object.entries(old.g || {})) await put(id, o, 1);
    try { (JSON.parse(localStorage.getItem('shila_st')) || []).forEach((u, i) => putSticker({ id: 'old' + i, ts: Date.now() - i, b: durl(u) })); } catch (e) {}
    return { me: old.me, state };
  }

  G.ShilaDB = { rekeyChat, del, clearMsgs, getMsg, wipe, allStickers: stickers, init, get, set, putMsg, delMsg, chatMsgs, pendingMsgs, delChat, stickers, putSticker, delSticker, allMsgs, migrateLegacy };
})(window);
