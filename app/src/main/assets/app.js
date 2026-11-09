(async function () {
  'use strict';
  const C = ShilaCrypto, DB = ShilaDB, $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
  const NATIVE = window.Android || null, SG = ShilaGroups, enc = new TextEncoder();
  const rid = n => Array.from(C.rnd(n), b => (b % 36).toString(36)).join('');
  const R = n => C.rnd(4).reduce((a, b) => a * 256 + b, 0) % n;
  const tag = x => Object.prototype.toString.call(x);
  const U8 = x => tag(x) === '[object Uint8Array]' ? x : tag(x) === '[object ArrayBuffer]' ? new Uint8Array(x) : ArrayBuffer.isView(x) ? new Uint8Array(x.buffer, x.byteOffset, x.byteLength) : null;
  const KEYRE = /^[A-Z]{6}\d{4}$/, MAXB = 10 * 1024 * 1024, IMGOK = /^image\/(png|jpeg|webp|gif)$/;
  const DEFAULT_ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' },
    { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }];

  // ---------- state ----------
  await DB.init();
  let ME = await DB.get('me'), ID = await DB.get('identity'), S = (await DB.get('state')) || { c: {}, g: {}, ice: '', lang: '' };
  S.c = S.c || {}; S.g = S.g || {}; S.set = Object.assign({ theme: 'shili', fs: 15, bg: { t: 'none' }, cust: {} }, S.set || {}); S.set.call = Object.assign({ echo: 1, noise: 1, agc: 1, front: 1 }, S.set.call || {});
  I18N.set(S.lang || I18N.detect());
  if (!ME) {
    const mig = await DB.migrateLegacy();
    if (mig) { ME = mig.me; S.c = mig.state.chats; S.g = mig.state.groups; }
    else {
      let k = ''; for (let i = 0; i < 6; i++) k += String.fromCharCode(65 + R(26)); for (let i = 0; i < 4; i++) k += R(10);
      ME = { key: k, name: (prompt(t('askName')) || '').trim() || t('user') };
    }
    await DB.set('me', ME);
  }
  if (!ID) { ID = await C.newIdentity(); await DB.set('identity', ID); }
  ID.pub = U8(ID.pub);
  let _st; const save = () => { clearTimeout(_st); _st = setTimeout(() => DB.set('state', S), 250); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) DB.set('state', S); else { poll(); if (peer && peer.disconnected) try { peer.reconnect(); } catch (e) {} } });
  save();

  let M = {}, conns = {}, cur = null, peer = null, srch = null, urls = [], replyTo = null, ST = [], sk = {}, rec = null, call = null, pendingCall = null, scan = null, actM = null;
  const ch = id => S.c[id] || S.g[id], isG = id => !!S.g[id], on = k => !!(conns[k] && conns[k].auth);
  const members = id => isG(id) ? Object.keys(S.g[id].mem).filter(k => k !== ME.key) : [id];
  const nmOf = (id, f) => f === ME.key ? ME.name : (S.c[f] && S.c[f].name) || (S.g[id] && S.g[id].mem[f]) || f;
  const gTitle = (id, f) => (S.g[id] && S.g[id].titles && S.g[id].titles[f]) || '';
  const avStyle = (el, src, txt) => { if (src) { el.style.backgroundImage = 'url(' + src + ')'; el.textContent = ''; } else { el.style.backgroundImage = ''; el.textContent = txt || ''; } };
  const tm = ts => new Date(ts).toLocaleTimeString(I18N.lang, { hour: '2-digit', minute: '2-digit' });
  const banner = x => { $('#bn').style.display = x ? 'block' : 'none'; $('#bn').textContent = x || ''; };
  const warn = x => { $('#warn').style.display = x ? 'block' : 'none'; $('#warn').textContent = x || ''; };
  const dialog = (msg, def) => prompt(msg, def || '');
  const pvText = m => m.del ? t('deleted') : m.kind === 'st' ? t('sticker') : m.kind === 'img' ? t('photo') : m.kind === 'vo' ? t('voice') : m.kind === 'file' ? t('file') + ' ' + (m.name || '') : (m.x || '');
  const blobB64 = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result.split(',')[1]); f.readAsDataURL(b); });
  const b64Blob = (s, mime) => new Blob([C.unb64(s)], { type: mime || 'application/octet-stream' });

  function notify(title, text, id) {
    if (!NATIVE || !(document.hidden || cur !== id)) return;
    try { NATIVE.notify(title, text); } catch (e) {}
  }

  // ---------- messages ----------
  async function addMsg(id, m) {
    await DB.putMsg(m);
    const o = ch(id); o.last = Math.max(o.last || 0, m.ts); o.lk = m.del ? 't' : m.kind; o.lx = pvText(m); save();
    if (cur === id && M[id]) { M[id].push(m); M[id].sort((a, b) => a.ts - b.ts); draw(m.me); }
    list();
  }
  async function refreshMeta(id) {
    const o = ch(id); if (!o) return; const ms = await DB.chatMsgs(id), l = ms[ms.length - 1];
    o.last = l ? l.ts : 0; o.lk = l ? (l.del ? 't' : l.kind) : ''; o.lx = l ? pvText(l) : ''; save();
  }
  function sealTo(c, h, bin) { return C.seal(c.aes, h, bin).then(f => { try { c.send(f); return true; } catch (e) { return false; } }); }
  async function sendMsgTo(c, id, m) {
    const h = { t: 'm', i: m.mid, ts: m.ts, kind: m.kind, x: m.x, mime: m.mime, name: m.name, dur: m.dur, r: m.r };
    if (isG(id)) h.g = id;
    const ok = await sealTo(c, h, m.b ? await m.b.arrayBuffer() : null);
    if (ok && !m.sent) { m.sent = 1; DB.putMsg(m); }
  }
  async function flushMsg(id, m) { for (const k of m.p.slice()) { if (on(k)) await sendMsgTo(conns[k], id, m); else connect(k); } }
  async function sendMsg(o) {
    if (!cur) return; const id = cur, mid = rid(12);
    if (isG(id) && (S.g[id].left || !SG.can(S.g[id], ME.key, o.kind === 't' ? 'send' : 'media'))) return alert(t('noPerm'));
    const m = Object.assign({ id: mid + ':' + id, mid, chat: id, f: ME.key, me: 1, ts: Date.now(), p: members(id), pend: 1 }, o);
    if (replyTo) { m.r = replyTo.mid; clearReply(); }
    if (!m.p.length) delete m.pend;
    await addMsg(id, m); flushMsg(id, m);
  }
  async function sendCtl(id, h) { for (const k of members(id)) if (on(k)) { if (isG(id)) h.g = id; sealTo(conns[k], h); } }
  const getM = (id, mid) => (M[id] || []).find(m => m.mid === mid);

  // ---------- network ----------
  function iceServers() { try { const j = JSON.parse(S.ice); if (Array.isArray(j) && j.length) return j; } catch (e) {} return DEFAULT_ICE; }
  const run = (c, f) => { c.q = (c.q || Promise.resolve()).then(f).catch(e => console.warn('conn', e)); };
  function connect(k) {
    if (!peer || peer.disconnected || k === ME.key || on(k) || (conns[k] && conns[k].pend > Date.now())) return;
    const c = peer.connect('shilagram-' + k, { reliable: true }); c.want = k; c.pend = Date.now() + 15000; conns[k] = c; wire(c);
  }
  function drop(c) {
    const k = c.key || c.want;
    if (k && conns[k] === c) { delete conns[k]; list(); if (cur) drawHead(); }
  }
  function wire(c) {
    c.on('open', () => run(c, () => sendHi(c)));
    c.on('data', d => run(c, () => onData(c, d)));
    c.on('close', () => drop(c)); c.on('error', () => drop(c));
  }
  async function sendHi(c) {
    if (c.sentHi) return; c.sentHi = 1;
    c.hello = await C.newHello(ID.pub);
    c.send({ t: 'hi', v: 2, k: ME.key, n: ME.name, pk: ID.pub, ep: c.hello.ep, nc: c.hello.nc });
  }
  async function onData(c, d) {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'hi') return handleHi(c, d);
    if (d.t === 'au') return handleAu(c, d);
    if (d.t === 'e' && c.auth) {
      const iv = U8(d.iv), dd = U8(d.d); if (!iv || !dd) return;
      const { header, bin } = await C.open(c.aes, { iv, d: dd });
      return handlePlain(c, header, bin);
    }
  }
  async function handleHi(c, d) {
    if (c.pk) return; // only one hello per connection
    const pk = U8(d.pk), ep = U8(d.ep), nc = U8(d.nc);
    if (d.v !== 2 || typeof d.k !== 'string' || !KEYRE.test(d.k) || d.k === ME.key || !pk || pk.length !== 65 || !ep || ep.length !== 65 || !nc || nc.length !== 16) return c.close();
    if (c.want && c.want !== d.k) return c.close(); // we dialed X, X must be who answers
    c.peerKey = d.k; c.peerName = String(d.n || d.k).slice(0, 30); c.pk = pk; c.theirEp = ep; c.theirNc = nc;
    await sendHi(c);
    const sig = await C.sign(ID.priv, nc, c.hello.ep, ep);
    c.send({ t: 'au', s: sig });
    c.aes = await C.deriveKey(c.hello.eph, c.hello.ep, ep);
  }
  async function handleAu(c, d) {
    if (!c.pk || !c.hello || c.auth || !c.aes) return;
    const s = U8(d.s); if (!s || !(await C.verify(c.pk, s, c.hello.nc, c.theirEp, c.hello.ep))) return c.close();
    const k = c.peerKey, pkb = C.b64(c.pk); let o = S.c[k];
    if (!o) o = S.c[k] = { name: c.peerName, u: 0, last: 0 }; else o.name = c.peerName;
    if (o.pk && o.pk !== pkb) { warn(t('keyChanged') + o.name + '. ' + t('keyChangedHelp')); save(); return c.close(); }
    o.pk = pkb;
    if (conns[k] && conns[k] !== c && conns[k].auth) try { conns[k].close(); } catch (e) {}
    conns[k] = c; c.auth = 1; c.key = k; save();
    await onAuthed(c, k);
  }
  async function onAuthed(c, k) {
    await sealTo(c, profileHdr());
    for (const [id, g] of Object.entries(S.g)) {
      if (g.mem[k] && g.raw) await sealTo(c, { t: 'gs', raw: g.raw, sig: g.sig });
      if (g.owner === k && g.pend && g.pend.length) { const ops = g.pend; g.pend = []; save(); for (const op of ops) await sealTo(c, { t: 'gop', g: id, op }); }
    }
    for (const m of await DB.pendingMsgs()) if (m.p.includes(k) && (m.chat === k || (S.g[m.chat] && S.g[m.chat].mem[k]))) await sendMsgTo(c, m.chat, m);
    if (srch && srch.key === k) { clearTimeout(srch.t); srch = null; $('#fg').disabled = 0; sheet(0); open(k); }
    list(); if (cur) drawHead();
  }
  async function handlePlain(c, h, bin) {
    const k = c.key;
    if (h.t === 'gs') await receiveState(c, h);
    else if (h.t === 'gop') { const g = S.g[h.g]; if (g && g.owner === ME.key) { const ns = SG.applyOp(g, k, h.op); if (ns) await commitGroup(h.g, ns); } }
    else if (h.t === 'pf') receiveProfile(k, h);
    else if (h.t === 'm') {
      const id = h.g || k, o = ch(id); if (!o || (h.g && !o.mem[k])) return;
      if (h.g && !SG.can(o, k, (h.kind === 't' || !h.kind) ? 'send' : 'media')) return;
      const mid = String(h.i).slice(0, 20), rid_ = mid + ':' + id;
      if (!(await DB.getMsg(rid_))) {
        const kind = ['t', 'img', 'st', 'vo', 'file'].includes(h.kind) ? h.kind : 't';
        const m = { id: rid_, mid, chat: id, f: k, me: 0, ts: Math.min(Number(h.ts) || Date.now(), Date.now()), kind, p: [] };
        if (kind === 't') m.x = String(h.x || '').slice(0, 8000);
        else {
          if (!bin || !bin.length || bin.length > MAXB + 1024) return;
          let mime = String(h.mime || '').slice(0, 60);
          if ((kind === 'img' || kind === 'st') && !IMGOK.test(mime)) return;
          if (kind === 'vo' && !/^audio\//.test(mime)) return;
          if (kind === 'file') { mime = 'application/octet-stream'; m.name = String(h.name || 'file').replace(/[\\/]/g, '_').slice(0, 80); }
          m.mime = mime; m.b = new Blob([bin], { type: mime }); if (h.dur) m.dur = Number(h.dur) || 0;
        }
        if (h.r) m.r = String(h.r).slice(0, 20);
        if (cur !== id) o.u = (o.u || 0) + 1;
        await addMsg(id, m);
        notify(t('msgFrom') + nmOf(id, k), pvText(m), id);
      }
      sealTo(c, { t: 'a', i: mid, g: h.g });
    } else if (h.t === 'a') {
      const id = h.g || k, m = await DB.getMsg(String(h.i) + ':' + id);
      if (m && m.p) { m.p = m.p.filter(x => x !== k); if (!m.p.length) delete m.pend; await DB.putMsg(m); const mm = getM(id, m.mid); if (mm) { mm.p = m.p; mm.pend = m.pend; } if (cur === id) draw(); }
    } else if (h.t === 'd' || h.t === 'ed') {
      const id = h.g || k, m = await DB.getMsg(String(h.i) + ':' + id);
      if (!m || m.f !== k) return;
      if (h.t === 'd') { m.del = 1; delete m.x; delete m.b; } else if (m.kind === 't') { m.x = String(h.x || '').slice(0, 8000); m.ed = 1; } else return;
      await DB.putMsg(m); const mm = getM(id, m.mid); if (mm) Object.assign(mm, m); await refreshMeta(id); if (cur === id) { M[id] = await DB.chatMsgs(id); draw(); } list();
    }
  }

  // ---------- peer lifecycle ----------
  function start() {
    banner(t('connecting'));
    try { peer = new Peer('shilagram-' + ME.key, { config: { iceServers: iceServers() } }); } catch (e) { return banner(t('libFail')); }
    peer.on('open', () => { banner(0); poll(); });
    peer.on('connection', wire);
    peer.on('call', onIncomingCall);
    peer.on('disconnected', () => { banner(t('serverLost')); setTimeout(() => { try { peer.reconnect(); } catch (e) {} }, 3000); });
    peer.on('error', e => {
      const m = /shilagram-([A-Z]{6}\d{4})/.exec(e.message || '');
      if (e.type === 'peer-unavailable' && m) { const c = conns[m[1]]; if (c && !c.auth) delete conns[m[1]]; if (srch && srch.key === m[1]) nf(); return; }
      if (['unavailable-id', 'network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) {
        banner(e.type === 'unavailable-id' ? t('keyBusy') : t('noNet')); try { peer.destroy(); } catch (x) {} setTimeout(start, 6000);
      }
    });
  }
  function poll() { const ks = new Set(Object.keys(S.c)); Object.values(S.g).forEach(g => Object.keys(g.mem).forEach(k => ks.add(k))); ks.forEach(connect); }
  setInterval(() => { if (peer && !peer.disconnected) poll(); }, 20000);

  // ---------- list & chat UI ----------
  function list() {
    $('#mk').textContent = t('myKey') + ME.key;
    const L = $('#list'); L.innerHTML = '';
    const rows = [...Object.entries(S.c).map(([id, o]) => [id, o, 0]), ...Object.entries(S.g).map(([id, o]) => [id, o, 1])].sort((a, b) => (b[1].last || 0) - (a[1].last || 0));
    if (!rows.length) L.innerHTML = '<div class="empty"><svg class="ill"><use href="#ill-empty"/></svg>' + t('noChats') + '</div>';
    rows.forEach(([id, o, g]) => {
      const r = document.createElement('div'); r.className = 'row';
      r.innerHTML = '<div class="av' + (!g && on(id) ? ' on' : '') + '"></div><div class="mid"><b></b><span></span></div><div class="meta"><div></div></div>';
      avStyle(r.children[0], o.av, g ? '👥' : (o.name || '?')[0]); r.querySelector('b').textContent = o.name;
      const pv = o.lk === 'st' ? t('sticker') : o.lk === 'img' ? t('photo') : o.lk === 'vo' ? t('voice') : (o.lx || '');
      r.querySelector('span').textContent = pv || (g ? Object.keys(o.mem).length + t('members') : on(id) ? t('online') : t('offline'));
      r.querySelector('.meta div').textContent = o.last ? tm(o.last) : '';
      if (o.u) { const b = document.createElement('span'); b.className = 'bd'; b.textContent = o.u; r.lastChild.append(b); }
      r.onclick = () => open(id); L.append(r);
    });
  }
  async function open(id) {
    cur = id; ch(id).u = 0; save(); M[id] = await DB.chatMsgs(id); clearReply();
    $('#chat').classList.add('on'); $('#tray').classList.remove('on'); $('#bc1').style.display = $('#bc2').style.display = isG(id) ? 'none' : '';
    drawHead(); updateComposer(); draw(1); list();
  }
  function back() { cur = null; $('#chat').classList.remove('on'); list(); }
  function drawHead() {
    const o = ch(cur); if (!o) return;
    $('#cn').textContent = o.name; avStyle($('#ca'), o.av, isG(cur) ? '👥' : (o.name || '?')[0]);
    $('#cs').textContent = isG(cur) ? Object.keys(o.mem).map(k => nmOf(cur, k)).join('، ') : on(cur) ? t('online') + ' · ' + t('secure') : t('offline');
  }
  function draw(stick) {
    const o = ch(cur); if (!o) return; urls.forEach(u => URL.revokeObjectURL(u)); urls = [];
    const Mm = $('#ms'), nearEnd = Mm.scrollHeight - Mm.scrollTop - Mm.clientHeight < 120; Mm.innerHTML = '';
    const url = b => { const u = URL.createObjectURL(b); urls.push(u); return u; };
    (M[cur] || []).slice(-150).forEach(m => {
      const b = document.createElement('div'); b.className = 'b' + (m.me ? ' me' : '') + (m.kind === 'st' && !m.del ? ' st' : '') + (m.del ? ' del' : '');
      if (isG(cur) && !m.me) { const n = document.createElement('b'); n.textContent = nmOf(cur, m.f) + (gTitle(cur, m.f) ? ' · ' + gTitle(cur, m.f) : ''); b.append(n); }
      if (m.r && !m.del) { const q = getM(cur, m.r); const rp = document.createElement('div'); rp.className = 'rp'; rp.textContent = q ? pvText(q) : '…'; b.append(rp); }
      if (m.del) { const s = document.createElement('span'); s.textContent = t('deleted'); b.append(s); }
      else if (m.kind === 'st' && m.b) { const im = document.createElement('img'); im.className = 'st'; im.src = url(m.b); if (!m.me) im.onclick = () => { if (confirm(t('saveSt'))) saveSticker(m.b); }; b.append(im); }
      else if (m.kind === 'img' && m.b) { const im = document.createElement('img'); im.className = 'ph'; im.src = url(m.b); b.append(im); }
      else if (m.kind === 'vo' && m.b) { const a = document.createElement('audio'); a.controls = true; a.preload = 'metadata'; a.src = url(m.b); b.append(a); }
      else if (m.kind === 'file' && m.b) { const f = document.createElement('div'); f.className = 'fl'; f.innerHTML = '<span>📎</span><u></u>'; f.lastChild.textContent = (m.name || 'file') + ' (' + Math.ceil(m.b.size / 1024) + ' KB)'; f.onclick = () => saveBlob(m); b.append(f); }
      else { const s = document.createElement('span'); s.textContent = m.x || ''; b.append(s); }
      const i = document.createElement('i'); i.textContent = (m.ed ? t('edited') + ' · ' : '') + tm(m.ts) + (m.me ? (m.p && !m.p.length ? ' ✓✓' : m.sent ? ' ✓' : ' ⏱') : ''); b.append(i);
      let h; const act = () => showActions(m);
      b.oncontextmenu = e => { e.preventDefault(); act(); };
      b.ontouchstart = () => { h = setTimeout(act, 600); }; b.ontouchend = b.ontouchmove = b.ontouchcancel = () => clearTimeout(h);
      Mm.append(b);
    });
    if (stick || nearEnd) Mm.scrollTop = Mm.scrollHeight;
  }
  function saveBlob(m) {
    blobB64(m.b).then(b => {
      const name = m.name || (m.kind === 'vo' ? 'voice.' + (m.mime.includes('mp4') ? 'm4a' : 'webm') : 'photo.' + (m.mime.split('/')[1] || 'jpg'));
      if (NATIVE) NATIVE.exportFile(name, m.mime || 'application/octet-stream', b);
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(m.b); a.download = name; a.click(); }
    });
  }
  function showActions(m) {
    const L = $('#actl'); L.innerHTML = '';
    const add = (label, fn, cls) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { sheet(0); fn(); }; L.append(b); };
    if (!m.del) add(t('reply'), () => setReply(m));
    if (!m.del && m.me && m.kind === 't') add(t('edit'), async () => {
      const x = (dialog(t('edit'), m.x) || '').trim(); if (!x || x === m.x) return;
      m.x = x; m.ed = 1; await DB.putMsg(m); sendCtl(cur, { t: 'ed', i: m.mid, x }); await refreshMeta(cur); draw(); list();
    });
    if (!m.del && m.b && m.kind !== 'st') add(t('save'), () => saveBlob(m));
    add(t('delMe'), async () => { await DB.delMsg(m.id); M[cur] = M[cur].filter(x => x.id !== m.id); await refreshMeta(cur); draw(); list(); });
    if (m.me && !m.del) add(t('delAll'), async () => {
      m.del = 1; delete m.x; delete m.b; delete m.pend; m.p = []; await DB.putMsg(m); sendCtl(cur, { t: 'd', i: m.mid }); await refreshMeta(cur); draw(); list();
    });
    add(t('cancelAct'), () => {}); sheet('act');
  }
  function setReply(m) { replyTo = m; $('#rtx').textContent = t('replyingTo') + ' ' + nmOf(cur, m.f) + ': ' + pvText(m); $('#rbar').classList.add('on'); $('#t').focus(); }
  function clearReply() { replyTo = null; $('#rbar').classList.remove('on'); }
  $('#rx').onclick = clearReply;

  // ---------- sheets ----------
  function sheet(n) { $('#sh').classList.toggle('on', !!n); $$('.pn').forEach(p => p.classList.toggle('on', p.id === 'p-' + n)); if (n !== 'q') stopScan(); }
  const closeSheet = () => sheet(0);
  window.__back = () => { if (call) return 1; if ($('#sh').classList.contains('on')) { closeSheet(); return 1; } if (pgStack.length) { closePage(); return 1; } if (cur) { back(); return 1; } return 0; };
  $('#x').onclick = closeSheet; $('#sh').onclick = e => { if (e.target.id === 'sh') closeSheet(); };

  // ---------- pages ----------
  const pgStack = [], PG_ON = {};
  function showPage(n) { const el = $('#pg-' + n); if (!el || pgStack[pgStack.length - 1] === n) return; pgStack.push(n); el.style.zIndex = 10 + pgStack.length; el.classList.add('on'); if (PG_ON[n]) PG_ON[n](); }
  function closePage() { const n = pgStack.pop(); if (!n) return; $('#pg-' + n).classList.remove('on'); if (n === 'dl') dlClear(); }
  $$('[data-pg]').forEach(b => b.onclick = () => showPage(b.dataset.pg)); $$('.pback').forEach(b => b.onclick = closePage);
  const svgUri = x => 'data:image/svg+xml,' + encodeURIComponent(x);
  const DEF_AV = svgUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#d9cdf0"/><circle cx="100" cy="78" r="38" fill="#7a65a8"/><path d="M28 200c0-42 32-72 72-72s72 30 72 72z" fill="#7a65a8"/></svg>');
  const DEF_COVER = svgUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b2475"/><stop offset="1" stop-color="#150f29"/></linearGradient></defs><rect width="800" height="400" fill="url(#g)"/><g fill="#e9c46a" opacity=".85"><circle cx="90" cy="70" r="3"/><circle cx="220" cy="140" r="2"/><circle cx="640" cy="60" r="3.5"/><circle cx="720" cy="190" r="2"/><circle cx="470" cy="320" r="2.5"/><circle cx="150" cy="330" r="2"/><circle cx="330" cy="90" r="2"/></g><path d="M90 70L220 140 330 90 470 320M640 60L720 190" fill="none" stroke="#8b5cf6" stroke-width="2" opacity=".55"/><circle cx="690" cy="330" r="80" fill="#8b5cf6" opacity=".2"/><circle cx="110" cy="260" r="50" fill="#e9c46a" opacity=".08"/></svg>');
  const bigAv = (el, src, fc) => { el.style.setProperty('--fc', fc || '#6f5b99'); el.style.backgroundImage = 'url("' + (src || DEF_AV) + '")'; el.textContent = ''; };
  const FCS = ['#6f5b99', '#e9c46a', '#8b5cf6', '#2a8fd4', '#22c55e', '#ef4444', '#f97316', '#ec4899', '#ffffff', '#14b8a6'];

  // ---------- profile ----------
  const USERRE = /^[A-Za-z][A-Za-z0-9_]{3,19}$/, FCRE = /^#[0-9a-fA-F]{6}$/, noCtl = (x, n) => String(x == null ? '' : x).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
  let viewKey = null, draft = null, pAv;
  async function squareAvatar(file, size = 160) {
    const bm = await createImageBitmap(file), side = Math.min(bm.width, bm.height), cv = document.createElement('canvas'); cv.width = cv.height = size;
    cv.getContext('2d').drawImage(bm, (bm.width - side) / 2, (bm.height - side) / 2, side, side, 0, 0, size, size);
    for (let q = .85; q > .3; q -= .15) { const u = cv.toDataURL('image/jpeg', q); if (u.length <= 20000) return u; } return cv.toDataURL('image/jpeg', .3);
  }
  async function coverImage(file) {
    const bm = await createImageBitmap(file);
    for (const [w, h] of [[640, 320], [480, 240], [320, 160]]) {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const k = Math.max(w / bm.width, h / bm.height);
      cv.getContext('2d').drawImage(bm, (w - bm.width * k) / 2, (h - bm.height * k) / 2, bm.width * k, bm.height * k);
      for (let q = .8; q > .35; q -= .15) { const u = cv.toDataURL('image/jpeg', q); if (u.length <= 50000) return u; }
    } throw new Error('big');
  }
  const drawMine = () => avStyle($('#mav'), ME.av, (ME.name || '?')[0]);
  const profileHdr = () => ({ t: 'pf', n: ME.name, u: ME.user || '', b: ME.bio || '', av: ME.av || '', cv: ME.cv || '', fc: ME.fc || '' });
  function broadcastProfile() { Object.keys(conns).forEach(k => on(k) && sealTo(conns[k], profileHdr())); }
  function receiveProfile(k, h) {
    const o = S.c[k]; if (!o) return; const n = noCtl(h.n, 30); if (n) o.name = n;
    const u = noCtl(h.u, 20); if (!u || USERRE.test(u)) o.un = u; o.bio = noCtl(h.b, 140);
    const av = String(h.av || ''); if (SG.okAv(av)) { if (av) o.av = av; else delete o.av; }
    const cv = String(h.cv || ''); if (SG.okImg(cv, 60000)) { if (cv) o.cv = cv; else delete o.cv; }
    const fc = String(h.fc || ''); if (FCRE.test(fc)) o.fc = fc; else delete o.fc;
    save(); list(); if (cur) drawHead(); if (viewKey === k && $('#pg-view').classList.contains('on')) fillView(k);
  }
  // view page: what other people see (and the owner, with an Edit button)
  function fillView(key) {
    const me = key === ME.key, o = me ? ME : S.c[key]; if (!o) return; viewKey = key; const user = me ? o.user : o.un;
    $('#vt').textContent = o.name; bigAv($('#vav'), o.av, o.fc); $('#vcov').style.backgroundImage = 'url("' + (o.cv || DEF_COVER) + '")';
    $('#vn').textContent = o.name; $('#vu').textContent = user ? '@' + user : '—'; $('#vk').textContent = key; $('#vb').textContent = o.bio || '—';
    $('#vedit').style.display = me ? '' : 'none'; $('#vsec').style.display = me ? 'none' : '';
    const q = qrcode(0, 'M'); q.addData('shilagram:' + key); q.make(); $('#vqr').innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }).replace(/black/gi, '#2d1b57');
    if (!me) { C.fingerprint(ID.pub).then(f => $('#secme').textContent = f); if (o.pk) C.fingerprint(C.unb64(o.pk)).then(f => $('#secthem').textContent = f); else $('#secthem').textContent = t('notVerified'); }
  }
  function openProfileView(key) { fillView(key); showPage('view'); }
  $('#mav').onclick = () => openProfileView(ME.key);
  $('#vkr').onclick = () => { try { navigator.clipboard.writeText(viewKey); } catch (e) {} const b = $('#vk'); b.textContent = t('keyCopied'); setTimeout(() => b.textContent = viewKey, 1200); };
  // edit page: changes are kept in a draft until "Save"
  function renderEdit() {
    bigAv($('#eav'), draft.av, draft.fc); $('#en').textContent = draft.name; $('#eu').textContent = draft.user ? '@' + draft.user : '';
    $('#eb').textContent = [...draft.bio].slice(0, 60).join('') + ([...draft.bio].length > 60 ? '…' : ''); $('#efcs').style.background = draft.fc || '#6f5b99'; $('#ecov').style.backgroundImage = 'url("' + (draft.cv || DEF_COVER) + '")';
  }
  function openProfileEdit() { draft = { name: ME.name, user: ME.user || '', bio: ME.bio || '', av: ME.av || '', cv: ME.cv || '', fc: ME.fc || '' }; renderEdit(); showPage('edit'); }
  $('#vedit').onclick = openProfileEdit; $('#ecancel').onclick = closePage;
  $('#esv').onclick = () => {
    Object.assign(ME, { name: draft.name, user: draft.user, bio: draft.bio }); ['av', 'cv', 'fc'].forEach(k => { if (draft[k]) ME[k] = draft[k]; else delete ME[k]; });
    DB.set('me', ME); drawMine(); broadcastProfile(); closePage(); if (viewKey === ME.key) fillView(ME.key);
  };
  $('#eavb').onclick = $('#eav').onclick = () => $('#pfile').click(); $('#ecovb').onclick = $('#ecov').onclick = () => $('#cfile').click();
  $('#pfile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { draft.av = await squareAvatar(f); renderEdit(); } catch (x) { alert(t('tooBig')); } };
  $('#cfile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { draft.cv = await coverImage(f); renderEdit(); } catch (x) { alert(t('tooBig')); } };
  let efKind;
  function editField(kind) {
    efKind = kind; const bio = kind === 'bio'; $('#eft').textContent = t(kind === 'name' ? 'chName' : kind === 'user' ? 'chUser' : 'chBio');
    $('#efpw').style.display = bio ? 'none' : 'flex'; $('#efpw .efp').style.display = kind === 'user' ? '' : 'none'; $('#efa').style.display = bio ? '' : 'none'; $('#efe').textContent = '';
    $('#efi').maxLength = kind === 'user' ? 20 : 30; $('#efi').dir = kind === 'user' ? 'ltr' : 'auto'; (bio ? $('#efa') : $('#efi')).value = draft[kind]; sheet('ef');
  }
  $$('[data-ef]').forEach(b => b.onclick = () => editField(b.dataset.ef));
  $('#efok').onclick = () => {
    const v = (efKind === 'bio' ? $('#efa') : $('#efi')).value.trim();
    if (efKind === 'name') { if (!v) return; draft.name = noCtl(v, 30); }
    else if (efKind === 'user') { const u = v.replace(/^@/, ''); if (u && !USERRE.test(u)) return $('#efe').textContent = t('userBad'); draft.user = u; }
    else draft.bio = noCtl(v, 140);
    renderEdit(); sheet(0);
  };
  $('#efcb').onclick = () => {
    const G = $('#fcs'); G.innerHTML = ''; FCS.forEach(c => { const b = document.createElement('button'); b.style.background = c; b.classList.toggle('on', (draft.fc || '#6f5b99') === c); b.onclick = () => { draft.fc = c; renderEdit(); sheet(0); }; G.append(b); });
    $('#fci').value = draft.fc || '#6f5b99'; sheet('fc');
  };
  $('#fci').oninput = e => { draft.fc = e.target.value; renderEdit(); };

  // ---------- settings ----------
  const BGS = [{ t: 'none' }, { t: 'c', v: '#e8dcc8' }, { t: 'c', v: '#cfe3d4' }, { t: 'c', v: '#d5dff2' }, { t: 'c', v: '#2b2f3a' }, { t: 'c', v: '#1b1230' },
    { t: 'g', v: 'linear-gradient(160deg,#7c3aed,#2a8fd4)' }, { t: 'g', v: 'linear-gradient(160deg,#1f1235,#4a2f86 65%,#e9c46a33)' }, { t: 'g', v: 'linear-gradient(160deg,#fcd5ce,#f8edeb)' }, { t: 'g', v: 'linear-gradient(160deg,#0f2027,#2c5364)' }];
  let bgUrl = null;
  async function loadBg() { const b = await DB.get('bgimg'); if (bgUrl) URL.revokeObjectURL(bgUrl); bgUrl = b ? URL.createObjectURL(b) : null; }
  function applySettings() {
    const st = S.set, r = document.documentElement, bg = st.bg || { t: 'none' };
    if (st.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', st.theme);
    r.style.setProperty('--fs', st.fs + 'px');
    ['hd', 'pri', 'bg', 'out', 'in'].forEach(k => { const v = st.cust && st.cust[k]; if (v) r.style.setProperty('--' + k, v); else r.style.removeProperty('--' + k); });
    if (st.cust && st.cust.bg) { const m = 'color-mix(in srgb,' + st.cust.bg + ' 82%,#000)'; r.style.setProperty('--bg2', m); r.style.setProperty('--chat', m); } else { r.style.removeProperty('--bg2'); r.style.removeProperty('--chat'); }
    $('#ms').style.background = (bg.t === 'c' || bg.t === 'g') ? bg.v : (bg.t === 'img' && bgUrl) ? 'center / cover url(' + bgUrl + ')' : '';
    if (NATIVE && NATIVE.setStatusColor) try { NATIVE.setStatusColor(getComputedStyle(r).getPropertyValue('--hd').trim()); } catch (e) {}
  }
  if (window.matchMedia) try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applySettings); } catch (e) {}
  function renderSettings() {
    const st = S.set; $$('#thm button').forEach(b => b.classList.toggle('on', b.dataset.th === st.theme)); $('#fsz').value = st.fs;
    const G = $('#bgs'); G.innerHTML = '';
    BGS.forEach(o => { const b = document.createElement('button'); if (o.t === 'none') b.textContent = '↺'; else b.style.background = o.v; b.classList.toggle('on', (st.bg.t === o.t && st.bg.v === o.v) || (o.t === 'none' && st.bg.t === 'none'));
      b.onclick = () => { st.bg = o.t === 'none' ? { t: 'none' } : { t: o.t, v: o.v }; save(); applySettings(); renderSettings(); }; G.append(b); });
    const im = document.createElement('button'); im.textContent = '🖼'; if (st.bg.t === 'img' && bgUrl) { im.style.backgroundImage = 'url(' + bgUrl + ')'; im.textContent = ''; } im.classList.toggle('on', st.bg.t === 'img'); im.onclick = () => $('#bgf').click(); G.append(im);
  }
  $('#bst').onclick = () => showPage('set');
  $$('#thm button').forEach(b => b.onclick = () => { S.set.theme = b.dataset.th; save(); applySettings(); renderSettings(); });
  $('#fsz').oninput = e => { S.set.fs = +e.target.value; save(); applySettings(); };
  $('#bgf').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { await DB.set('bgimg', await shrink(f, 1080)); await loadBg(); S.set.bg = { t: 'img' }; save(); applySettings(); renderSettings(); } catch (x) { alert(t('tooBig')); } };
  $('#icb').onclick = () => {
    try { const j = JSON.parse($('#ice').value); if (!Array.isArray(j)) throw 0; S.ice = JSON.stringify(j); } catch (e) { return alert('JSON?'); }
    save(); sheet(0); try { peer.destroy(); } catch (e) {} conns = {}; start();
  };
  $('#bat').onclick = () => NATIVE && NATIVE.batterySettings();

  // ---------- settings pages ----------
  PG_ON.theme = PG_ON.font = PG_ON.bg = renderSettings;
  PG_ON.lang = () => $$('#lgs button').forEach(b => b.classList.toggle('on', b.dataset.lg === I18N.lang));
  $$('#lgs button').forEach(b => b.onclick = () => { S.lang = b.dataset.lg; I18N.set(S.lang); save(); applyLang(); PG_ON.lang(); });
  const toHex = c => { c = String(c).trim(); if (/^#[0-9a-f]{6}$/i.test(c)) return c; if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + [...c.slice(1)].map(x => x + x).join(''); return '#888888'; };
  const CUST = [['hd', 'custHeader'], ['pri', 'custAccent'], ['bg', 'custBg'], ['out', 'custMine'], ['in', 'custTheirs']];
  PG_ON.custom = () => {
    const L = $('#cust'); L.innerHTML = '';
    CUST.forEach(([k, lbl]) => { const r = document.createElement('label'); r.className = 'crow'; r.innerHTML = '<span></span><input type="color">'; r.firstChild.textContent = t(lbl); const i = r.lastChild;
      i.value = toHex((S.set.cust && S.set.cust[k]) || getComputedStyle(document.documentElement).getPropertyValue('--' + k)); i.oninput = () => { S.set.cust = S.set.cust || {}; S.set.cust[k] = i.value; save(); applySettings(); }; L.append(r); });
  };
  $('#custr').onclick = () => { S.set.cust = {}; save(); applySettings(); PG_ON.custom(); };
  const CALLK = [['echo', 'callEcho'], ['noise', 'callNoise'], ['agc', 'callAgc'], ['front', 'callFront']];
  PG_ON.call = () => {
    const L = $('#callt'); L.innerHTML = '';
    CALLK.forEach(([k, lbl]) => { const b = document.createElement('button'); b.className = 'tg'; b.textContent = (S.set.call[k] ? '✅ ' : '⬜ ') + t(lbl); b.onclick = () => { S.set.call[k] = S.set.call[k] ? 0 : 1; save(); PG_ON.call(); }; L.append(b); });
    $('#ice').value = JSON.stringify(iceServers(), null, 1); $('#bat').style.display = NATIVE ? '' : 'none';
  };
  let dlUrls = [];
  function dlClear() { dlUrls.forEach(u => URL.revokeObjectURL(u)); dlUrls = []; }
  PG_ON.dl = async () => {
    dlClear(); const L = $('#dll'); L.innerHTML = '';
    const ms = (await DB.allMsgs()).filter(m => m.b && !m.del && ['img', 'vo', 'file'].includes(m.kind)).sort((a, b) => b.ts - a.ts);
    if (!ms.length) { L.innerHTML = '<div class="empty"><svg class="ill"><use href="#ill-empty"/></svg>' + t('noDownloads') + '</div>'; return; }
    ms.forEach(m => {
      const r = document.createElement('div'); r.className = 'dlr'; r.innerHTML = '<div class="th"></div><div class="mid"><b></b><span></span></div><svg class="ic"><use href="#i-download"/></svg>';
      const th = r.firstChild; if (m.kind === 'img') { const u = URL.createObjectURL(m.b); dlUrls.push(u); th.style.backgroundImage = 'url(' + u + ')'; } else th.innerHTML = '<svg class="ic"><use href="#i-' + (m.kind === 'vo' ? 'mic' : 'file') + '"/></svg>';
      r.querySelector('b').textContent = m.name || (m.kind === 'vo' ? t('voice') : t('photo'));
      r.querySelector('.mid span').textContent = Math.ceil(m.b.size / 1024) + ' KB · ' + ((ch(m.chat) || {}).name || '') + ' · ' + new Date(m.ts).toLocaleDateString(I18N.lang); r.onclick = () => saveBlob(m); L.append(r);
    });
  };
  function renderStPage() {
    const G = $('#stg'); G.innerHTML = ''; const plus = document.createElement('button'); plus.className = 'c plus'; plus.innerHTML = '<svg class="ic" style="width:34px;height:34px"><use href="#i-sticker"/></svg>';
    plus.onclick = () => { sk = {}; skDraw(); $('#cap').value = ''; $('#zm').value = 1; sheet('s'); }; G.append(plus);
    DB.stickers().then(L => L.forEach(s => { const c = document.createElement('div'); c.className = 'c'; const im = new Image(); im.src = URL.createObjectURL(s.b); const x = document.createElement('button'); x.textContent = '✕'; x.onclick = async () => { if (confirm(t('delSt'))) { await DB.delSticker(s.id); renderStPage(); } }; c.append(im, x); G.append(c); }));
  }
  PG_ON.st = renderStPage;

  // backup
  $('#bex').onclick = async () => {
    const pass = dialog(t('passAsk')); if (!pass) return;
    const msgs = []; for (const m of await DB.allMsgs()) { const c = Object.assign({}, m); if (m.b) { c.bdata = await blobB64(m.b); c.bmime = m.b.type; delete c.b; } msgs.push(c); }
    const st = []; for (const s of await DB.allStickers()) st.push({ id: s.id, ts: s.ts, d: await blobB64(s.b), mime: s.b.type });
    const dump = JSON.stringify({ me: ME, state: S, identity: { priv: ID.priv, pub: C.b64(ID.pub) }, msgs, st });
    const file = await C.lock(pass, dump), name = 'shilagram-backup-' + new Date().toISOString().slice(0, 10) + '.shila';
    if (NATIVE) NATIVE.exportFile(name, 'application/octet-stream', btoa(file));
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([file])); a.download = name; a.click(); }
  };
  $('#bim').onclick = () => $('#bfile').click();
  $('#bfile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const pass = dialog(t('passAsk2')); if (!pass) return;
    let d; try { d = JSON.parse(await C.unlock(pass, await f.text())); } catch (x) { return alert(t('importBad')); }
    await DB.wipe(); await DB.set('me', d.me); await DB.set('state', d.state); await DB.set('identity', { priv: d.identity.priv, pub: C.unb64(d.identity.pub) });
    for (const m of d.msgs) { if (m.bdata) { m.b = b64Blob(m.bdata, m.bmime); delete m.bdata; delete m.bmime; } await DB.putMsg(m); }
    for (const s of d.st || []) await DB.putSticker({ id: s.id, ts: s.ts, b: b64Blob(s.d, s.mime) });
    alert(t('importDone')); location.reload();
  };

  // find friend / QR
  $('#bf').onclick = () => { $('#fk').value = ''; $('#fs').textContent = ''; $('#fa').hidden = 1; $('#fg').disabled = 0; sheet('f'); };
  $('#fk').oninput = e => e.target.value = e.target.value.toUpperCase();
  function nf() { clearTimeout(srch.t); $('#fs').textContent = t('notFound'); $('#fa').hidden = 0; $('#fg').disabled = 0; }
  $('#fg').onclick = () => {
    const k = $('#fk').value.trim().toUpperCase(); $('#fa').hidden = 1;
    if (!KEYRE.test(k)) return $('#fs').textContent = t('badKey'); if (k === ME.key) return $('#fs').textContent = t('yourOwn');
    if (S.c[k]) { sheet(0); return open(k); } if (!peer || peer.disconnected) return $('#fs').textContent = t('noNet');
    $('#fs').textContent = t('searching'); $('#fg').disabled = 1; srch = { key: k, t: setTimeout(() => srch && nf(), 12000) }; connect(k);
  };
  function addContact(k) { if (!S.c[k]) S.c[k] = { name: k, u: 0, last: 0 }; save(); connect(k); sheet(0); open(k); }
  $('#fa').onclick = () => addContact(srch && srch.key || $('#fk').value.trim().toUpperCase());
  $('#bq').onclick = async () => {
    sheet('q'); $('#qs').textContent = '';
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); const v = $('#vid'); v.srcObject = s; await v.play(); scan = { s, on: 1 };
      const cv = $('#scv'), x = cv.getContext('2d', { willReadFrequently: true });
      const tick = () => {
        if (!scan || !scan.on) return;
        if (v.videoWidth) { cv.width = v.videoWidth; cv.height = v.videoHeight; x.drawImage(v, 0, 0); const im = x.getImageData(0, 0, cv.width, cv.height), r = jsQR(im.data, im.width, im.height);
          if (r && r.data) { const m = /^shilagram:([A-Z]{6}\d{4})$/.exec(r.data); if (m && m[1] !== ME.key) { stopScan(); return addContact(m[1]); } $('#qs').textContent = t('qrBad'); } }
        requestAnimationFrame(tick);
      }; tick();
    } catch (e) { $('#qs').textContent = t('noCam'); }
  };
  function stopScan() { if (scan) { scan.on = 0; scan.s.getTracks().forEach(x => x.stop()); scan = null; } }

  // ---------- groups ----------
  const PERM_LBL = { send: 'permSend', media: 'permMedia', info: 'permInfo', add: 'permAdd' }, ROLE_ORD = { o: 0, a: 1, m: 2 };
  async function commitGroup(id, st) { // owner only: sign + install + broadcast
    const old = S.g[id], raw = JSON.stringify(SG.canon(st)), sig = C.b64(await C.signRaw(ID.priv, enc.encode(raw))), before = old ? Object.keys(old.mem) : [];
    installState(id, st, raw, sig);
    new Set([...before, ...Object.keys(st.mem)]).forEach(k => { if (k !== ME.key && on(k)) sealTo(conns[k], { t: 'gs', raw, sig }); });
  }
  function installState(id, st, raw, sig) {
    const o = S.g[id] || { u: 0, last: 0 }, g = { u: o.u || 0, last: o.last || 0, lk: o.lk, lx: o.lx, pend: o.pend || [] };
    Object.assign(g, st, { raw, sig }); if (!st.mem[ME.key]) g.left = 1;
    S.g[id] = g; Object.keys(st.mem).forEach(connect); save(); list();
    if (cur === id) { drawHead(); updateComposer(); draw(); }
    if ($('#p-gi').classList.contains('on')) openGroupInfo(true);
  }
  async function receiveState(c, h) {
    if (typeof h.raw !== 'string' || h.raw.length > 70000 || typeof h.sig !== 'string') return;
    let st; try { st = SG.validState(JSON.parse(h.raw)); } catch (e) { return; } if (!st) return;
    const loc = S.g[st.id]; let opk;
    if (loc && loc.owner) { if (loc.owner !== st.owner || loc.opk !== st.opk || st.ver <= loc.ver) return; opk = loc.opk; }
    else { // first time we see this group: it must be anchored to the owner's pinned identity
      const oc = S.c[st.owner], direct = c.key === st.owner && C.b64(c.pk) === st.opk, pinned = oc && oc.pk === st.opk;
      if ((!direct && !pinned) || !st.mem[ME.key]) return; opk = st.opk;
    }
    let sig, key; try { sig = C.unb64(h.sig); key = C.unb64(opk); } catch (e) { return; }
    if (!(await C.verifyRaw(key, sig, enc.encode(h.raw)))) return;
    installState(st.id, st, h.raw, h.sig);
  }
  async function groupAct(id, op) {
    const g = S.g[id]; if (!g || g.left || !g.owner) return false;
    if (g.owner === ME.key) { const ns = SG.applyOp(g, ME.key, op); if (!ns) return false; await commitGroup(id, ns); return true; }
    if (!SG.applyOp(g, ME.key, op)) return alert(t('noPerm')), false; // quick local check; the owner re-checks
    if (on(g.owner)) await sealTo(conns[g.owner], { t: 'gop', g: id, op });
    else { g.pend = g.pend || []; g.pend.push(op); save(); connect(g.owner); alert(t('ownerOffline')); }
    return true;
  }
  function updateComposer() {
    const g = isG(cur) ? S.g[cur] : null, ok = !g || (!g.left && SG.can(g, ME.key, 'send')), media = !g || (!g.left && SG.can(g, ME.key, 'media')), ta = $('#t');
    ta.disabled = !ok; ta.placeholder = ok ? t('typeMsg') : (g && g.left ? t('groupLeft') : t('noPerm'));
    ['#ba', '#bv', '#be'].forEach(x => $(x).disabled = !media); $('#bs').disabled = !ok;
  }
  $('#bg').onclick = () => {
    $('#gn').value = ''; const L = $('#gl'); L.innerHTML = Object.keys(S.c).length ? '' : '<p>' + t('addFriendsFirst') + '</p>';
    Object.entries(S.c).forEach(([k, o]) => { const d = document.createElement('label'); d.className = 'chk'; d.innerHTML = '<input type="checkbox" value="' + k + '"><span></span>'; d.lastChild.textContent = o.name; L.append(d); }); sheet('g');
  };
  $('#gc').onclick = async () => {
    const ks = [...$$('#gl input:checked')].map(i => i.value), n = $('#gn').value.trim(); if (!n || !ks.length) return alert(t('groupNeed'));
    const id = 'g' + rid(8), mem = { [ME.key]: ME.name }; ks.forEach(k => mem[k] = S.c[k].name);
    await commitGroup(id, { id, ver: 1, owner: ME.key, opk: C.b64(ID.pub), name: n, mem, roles: {}, titles: {}, pd: { send: 1, media: 1, info: 0, add: 0 }, pm: {} });
    sheet(0); open(id);
  };
  function openGroupInfo(refreshOnly) {
    const id = cur, g = S.g[id]; if (!g) return; const me = ME.key, owner = g.owner === me, info = !g.left && SG.can(g, me, 'info'), add = !g.left && SG.can(g, me, 'add');
    avStyle($('#gav'), g.av, '👥'); $('#gname').value = g.name; $('#gname').disabled = !info; $('#gsave').style.display = info ? '' : 'none'; $('#gadd').style.display = add ? '' : 'none';
    const L = $('#gmem'); L.innerHTML = '';
    Object.keys(g.mem).sort((a, b) => ROLE_ORD[SG.role(g, a)] - ROLE_ORD[SG.role(g, b)]).forEach(k => {
      const r = document.createElement('div'); r.className = 'mrow'; r.innerHTML = '<div class="av"></div><div class="mid"><b></b><span></span></div><span class="rb"></span>';
      const o = S.c[k]; avStyle(r.children[0], o && o.av, (nmOf(id, k) || '?')[0]);
      r.querySelector('b').textContent = nmOf(id, k) + (k === me ? ' (' + t('me') + ')' : ''); r.querySelector('.mid span').textContent = (g.titles && g.titles[k]) || (o && o.un ? '@' + o.un : '');
      const rl = SG.role(g, k), rb = r.querySelector('.rb'); if (rl === 'o') rb.textContent = '👑 ' + t('manager'); else if (rl === 'a') rb.textContent = '⭐ ' + t('assistant'); else rb.remove();
      if (owner && k !== me && !g.left) r.onclick = () => memberMenu(k); L.append(r);
    });
    $('#gpdbox').style.display = owner ? '' : 'none'; const P = $('#gpd'); P.innerHTML = '';
    SG.PERMS.forEach(p => { const on_ = !!(g.pd || SG.MEMBER_DEFAULT)[p], b = document.createElement('button'); b.className = 'tg'; b.textContent = (on_ ? '✅ ' : '⬜ ') + t(PERM_LBL[p]); b.onclick = () => groupAct(id, { a: 'pd', p, v: !on_ }); P.append(b); });
    $('#gleave').textContent = g.left ? t('delChat') : t('leaveGroup');
    if (!refreshOnly) sheet('gi');
  }
  $('#gav').onclick = () => { const g = S.g[cur]; if (g && !g.left && SG.can(g, ME.key, 'info')) $('#gfile').click(); };
  $('#gfile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { await groupAct(cur, { a: 'av', v: await squareAvatar(f) }); } catch (x) { alert(t('tooBig')); } };
  $('#gsave').onclick = () => { const v = $('#gname').value.trim(); if (v && v !== S.g[cur].name) groupAct(cur, { a: 'name', v }); };
  function memberMenu(k) {
    const id = cur, g = S.g[id]; if (!g || !g.mem[k]) return sheet('gi'); const L = $('#actl'); L.innerHTML = '';
    const add = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; L.append(b); };
    const again = async op => { await groupAct(id, op); memberMenu(k); };
    add('← ' + nmOf(id, k), () => openGroupInfo());
    add('🏷 ' + t('setTitle') + ': ' + (g.titles[k] || '—'), () => { const v = dialog(t('titleAsk'), g.titles[k] || ''); if (v !== null) again({ a: 'title', k, v }); });
    add(g.roles[k] === 'a' ? '⭐ ' + t('demote') : '⭐ ' + t('promote'), () => again({ a: 'role', k, v: g.roles[k] === 'a' ? '' : 'a' }));
    SG.PERMS.forEach(p => { const eff = SG.can(g, k, p); add((eff ? '✅ ' : '⬜ ') + t(PERM_LBL[p]), () => again({ a: 'perm', k, p, v: !eff })); });
    add('🚫 ' + t('removeMember'), async () => { if (confirm(t('confirmRemove'))) { await groupAct(id, { a: 'rm', k }); openGroupInfo(); } });
    sheet('act');
  }
  $('#gadd').onclick = () => {
    const g = S.g[cur], L = $('#gal'); L.innerHTML = ''; const cand = Object.entries(S.c).filter(([k]) => !g.mem[k]); if (!cand.length) L.innerHTML = '<p>' + t('noMembersToAdd') + '</p>';
    cand.forEach(([k, o]) => { const d = document.createElement('label'); d.className = 'chk'; d.innerHTML = '<input type="checkbox" value="' + k + '"><span></span>'; d.lastChild.textContent = o.name; L.append(d); }); sheet('ga');
  };
  $('#gac').onclick = async () => { const ks = [...$$('#gal input:checked')].map(i => i.value); for (const k of ks) await groupAct(cur, { a: 'add', k, n: S.c[k].name }); openGroupInfo(); };
  $('#gleave').onclick = async () => {
    const id = cur, g = S.g[id]; if (!confirm(t(g.left ? 'delChat' : 'confirmLeave'))) return;
    if (!g.left && g.owner && g.owner !== ME.key && on(g.owner)) await sealTo(conns[g.owner], { t: 'gop', g: id, op: { a: 'leave' } });
    await DB.delChat(id); delete S.g[id]; delete M[id]; save(); sheet(0); back();
  };

  // chat header menu
  $('#bk').onclick = back;
  $('#chh').onclick = () => isG(cur) ? openGroupInfo() : openContactInfo();
  $('#bm').onclick = () => {
    const L = $('#actl'); L.innerHTML = ''; const add = (l, f) => { const b = document.createElement('button'); b.textContent = l; b.onclick = () => { sheet(0); f(); }; L.append(b); };
    add(isG(cur) ? 'ℹ️ ' + t('groupInfo') : '🔐 ' + t('contactInfo'), () => isG(cur) ? openGroupInfo() : openContactInfo());
    add('🗑 ' + t('delChat'), async () => { if (!confirm(t('delChat'))) return; await DB.delChat(cur); delete S.c[cur]; delete S.g[cur]; delete M[cur]; save(); back(); });
    add(t('cancelAct'), () => {}); sheet('act');
  };
  function openContactInfo() { openProfileView(cur); }
  $('#srt').onclick = () => { const o = S.c[viewKey]; if (o) { delete o.pk; save(); warn(0); fillView(viewKey); } };

  // composer
  $('#bs').onclick = () => { const x = $('#t').value.trim(); if (!x) return; sendMsg({ kind: 't', x }); $('#t').value = ''; $('#t').style.height = ''; };
  $('#t').oninput = e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; };
  $('#ba').onclick = () => sheet('att');
  $('#aimg').onclick = () => $('#fimg').click(); $('#afil').onclick = () => $('#ffil').click();
  async function shrink(file, max = 1280) {
    const bm = await createImageBitmap(file), s = Math.min(1, max / Math.max(bm.width, bm.height)), cv = document.createElement('canvas');
    cv.width = Math.round(bm.width * s); cv.height = Math.round(bm.height * s); cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height);
    return new Promise(r => cv.toBlob(r, 'image/jpeg', .82));
  }
  $('#fimg').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; sheet(0); if (!f) return; try { const b = await shrink(f); if (b.size > MAXB) return alert(t('tooBig')); sendMsg({ kind: 'img', b, mime: 'image/jpeg' }); } catch (x) { alert(t('tooBig')); } };
  $('#ffil').onchange = e => { const f = e.target.files[0]; e.target.value = ''; sheet(0); if (!f) return; if (f.size > MAXB) return alert(t('tooBig')); sendMsg({ kind: 'file', b: f, mime: 'application/octet-stream', name: f.name }); };
  $('#bv').onclick = async () => {
    if (rec) { rec.stop(); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true }), mt = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(x => window.MediaRecorder && MediaRecorder.isTypeSupported(x));
      const r = new MediaRecorder(s, mt ? { mimeType: mt } : {}), chunks = [], t0 = Date.now(); rec = r; $('#bv').classList.add('rec');
      r.ondataavailable = e => e.data.size && chunks.push(e.data);
      r.onstop = () => { s.getTracks().forEach(x => x.stop()); rec = null; $('#bv').classList.remove('rec'); const b = new Blob(chunks, { type: (r.mimeType || 'audio/webm').split(';')[0] }); if (b.size > MAXB) return alert(t('tooBig')); if (b.size) sendMsg({ kind: 'vo', b, mime: b.type, dur: Math.round((Date.now() - t0) / 1000) }); };
      r.start();
    } catch (e) { alert(t('noMic')); }
  };

  // stickers
  async function trayDraw() {
    const T = $('#tray'); T.innerHTML = ''; ST = await DB.stickers();
    const a = document.createElement('button'); a.textContent = '+'; a.onclick = () => { sk = {}; skDraw(); $('#cap').value = ''; $('#zm').value = 1; sheet('s'); }; T.append(a);
    ST.forEach(s => { const im = new Image(); im.src = URL.createObjectURL(s.b); let h;
      im.onclick = () => { sendMsg({ kind: 'st', b: s.b, mime: s.b.type }); T.classList.remove('on'); };
      const del = () => { if (confirm(t('delSt'))) DB.delSticker(s.id).then(trayDraw); };
      im.oncontextmenu = e => { e.preventDefault(); del(); }; im.ontouchstart = () => h = setTimeout(del, 700); im.ontouchend = im.ontouchmove = () => clearTimeout(h); T.append(im); });
  }
  async function saveSticker(b) { await DB.putSticker({ id: rid(8), ts: Date.now(), b }); trayDraw(); if ($('#pg-st').classList.contains('on')) renderStPage(); }
  $('#be').onclick = async () => { await trayDraw(); $('#tray').classList.toggle('on'); };
  function skDraw() {
    const c = $('#cv'), x = c.getContext('2d'); x.clearRect(0, 0, 256, 256); if (!sk.img) return; x.save(); x.beginPath(); const r = sk.sh === 'c' ? 128 : sk.sh === 'r' ? 40 : 0;
    x.roundRect ? x.roundRect(0, 0, 256, 256, r) : x.rect(0, 0, 256, 256); x.clip();
    const s = Math.max(256 / sk.img.width, 256 / sk.img.height) * sk.z, w = sk.img.width * s, h = sk.img.height * s; x.drawImage(sk.img, 128 - w / 2 + sk.ox, 128 - h / 2 + sk.oy, w, h); x.restore();
    const tx = $('#cap').value; if (tx) { x.font = 'bold 30px sans-serif'; x.textAlign = 'center'; x.lineWidth = 6; x.strokeStyle = '#000'; x.fillStyle = '#fff'; x.strokeText(tx, 128, 240, 240); x.fillText(tx, 128, 240, 240); }
  }
  $('#pk').onclick = () => $('#fl').click();
  $('#fl').onchange = e => { const f = e.target.files[0]; if (!f) return; const im = new Image(); im.onload = () => { sk = { img: im, z: 1, ox: 0, oy: 0, sh: 'r' }; $('#zm').value = 1; skDraw(); }; im.src = URL.createObjectURL(f); e.target.value = ''; };
  $('#zm').oninput = e => { sk.z = +e.target.value; skDraw(); }; $('#cap').oninput = skDraw;
  $$('[data-s]').forEach(b => b.onclick = () => { sk.sh = b.dataset.s; skDraw(); });
  let pd; $('#cv').onpointerdown = e => { pd = [e.clientX, e.clientY]; e.target.setPointerCapture(e.pointerId); }; $('#cv').onpointerup = () => pd = 0;
  $('#cv').onpointermove = e => { if (!pd || !sk.img) return; sk.ox += e.clientX - pd[0]; sk.oy += e.clientY - pd[1]; pd = [e.clientX, e.clientY]; skDraw(); };
  $('#ss').onclick = () => { if (!sk.img) return alert(t('pickFirst')); $('#cv').toBlob(async b => { if (!b) return; await saveSticker(b); sheet(0); $('#tray').classList.add('on'); }, 'image/webp', .85); };

  // ---------- calls ----------
  const peerKey = id => String(id).replace(/^shilagram-/, '');
  async function media(video) { const c = S.set.call; return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: !!c.echo, noiseSuppression: !!c.noise, autoGainControl: !!c.agc }, video: video ? { facingMode: c.front ? 'user' : 'environment' } : false }); }
  function showCall(k, status) { $('#cnm').textContent = nmOf(k, k); $('#cst').textContent = status || ''; $('#call').classList.add('on'); }
  function setupCall(cl, k, stream, video) {
    call = { cl, stream, k }; showCall(k, t('calling'));
    $('#lv').srcObject = stream; $('#lv').classList.toggle('v1', !!video);
    cl.on('stream', rs => { $('#rv').srcObject = rs; $('#rv').classList.toggle('v1', rs.getVideoTracks().length > 0); $('#cst').textContent = ''; });
    cl.on('close', endCall); cl.on('error', () => { $('#cst').textContent = t('callFail'); setTimeout(endCall, 1200); });
  }
  function endCall() { if (!call) return; try { call.cl.close(); } catch (e) {} call.stream.getTracks().forEach(x => x.stop()); call = null; $('#call').classList.remove('on'); $('#rv').srcObject = $('#lv').srcObject = null; $('#rv').classList.remove('v1'); $('#lv').classList.remove('v1'); }
  async function startCall(video) {
    if (!cur || isG(cur) || call) return; if (!on(cur)) return alert(t('callNeedOnline'));
    try { const s = await media(video); setupCall(peer.call('shilagram-' + cur, s, { metadata: { video } }), cur, s, video); } catch (e) { alert(t('noMic')); }
  }
  $('#bc1').onclick = () => startCall(false); $('#bc2').onclick = () => startCall(true); $('#cen').onclick = endCall;
  $('#cmu').onclick = () => { if (!call) return; const tr = call.stream.getAudioTracks()[0]; if (tr) { tr.enabled = !tr.enabled; $('#cmu').textContent = tr.enabled ? '🎙' : '🔇'; } };
  function onIncomingCall(cl) {
    const k = peerKey(cl.peer);
    if (!on(k) || call || pendingCall) { try { cl.close(); } catch (e) {} return; } // only authenticated contacts may ring us
    pendingCall = cl; const video = !!(cl.metadata && cl.metadata.video);
    $('#inct').textContent = t('incoming') + nmOf(k, k); sheet('inc'); notify(t('incoming') + nmOf(k, k), '', '-');
    cl.on('close', () => { if (pendingCall === cl) { pendingCall = null; sheet(0); } });
    $('#inca').onclick = async () => { pendingCall = null; sheet(0); try { const s = await media(video); cl.answer(s); setupCall(cl, k, s, video); } catch (e) { cl.close(); alert(t('noMic')); } };
    $('#incd').onclick = () => { pendingCall = null; sheet(0); cl.close(); };
  }

  // ---------- boot ----------
  function applyLang() {
    $$('[data-t]').forEach(e => e.textContent = t(e.dataset.t));
    $('#gn').placeholder = t('groupName'); $('#cap').placeholder = t('stickerText'); $('#efa').placeholder = t('bioPh');
    list(); updateComposer(); if (cur) { drawHead(); draw(); }
  }
  await loadBg(); applySettings(); drawMine(); applyLang(); start();
  if (NATIVE && NATIVE.ready) try { NATIVE.ready(); } catch (e) {}
})();
