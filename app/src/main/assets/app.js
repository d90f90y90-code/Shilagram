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
  S.c = S.c || {}; S.g = S.g || {}; S.set = Object.assign({ theme: 'shili', fs: 15, bg: { t: 'none' }, cust: {}, nt: 1, np: 0, lockAfter: 0, secure: 0, enter: 0, h24: 0, nomo: 0, br: 14, notyp: 0, autoUpd: 1 }, S.set || {}); S.block = S.block || {}; S.recs = S.recs || []; S.req = S.req || {}; S.out = S.out || {}; S.ga = S.ga || {}; S.pins = S.pins || {}; S.dec = S.dec || {}; S.set.call = Object.assign({ echo: 1, noise: 1, agc: 1, front: 1 }, S.set.call || {});
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
  let PIN = await DB.get('pin'), TSV = await DB.get('tsv'), TL = (await DB.get('tsvl')) || { f: 0, u: 0 };
  const F = ShilaFeatures; S.exp = S.exp || {}; S.cq = S.cq || {};
  let _st; const save = () => { clearTimeout(_st); _st = setTimeout(() => DB.set('state', S), 250); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { DB.set('state', S); window.__hiddenAt = Date.now(); } else { if (PIN && window.__hiddenAt && S.set.lockAfter >= 0 && Date.now() - window.__hiddenAt >= S.set.lockAfter * 1000) unlockLoop(); poll(); if (peer && peer.disconnected) try { peer.reconnect(); } catch (e) {} } });
  save();

  let rot = {}, seen = {}, act = {}, bootT = Date.now(), M = {}, conns = {}, cur = null, peer = null, srch = null, urls = [], replyTo = null, ST = [], sk = {}, rec = null, call = null, pendingCall = null, actM = null, cropRes = null, tsvRes = null, pwRes = null, fwMsg = null, pinCur = 0, typSent = {}, typing = {}, updInfo = null;
  const ch = id => S.c[id] || S.g[id], isG = id => !!S.g[id], on = k => !!(conns[k] && conns[k].auth);
  const members = id => isG(id) ? Object.keys(S.g[id].mem).filter(k => k !== ME.key) : [id];
  const nmOf = (id, f) => f === ME.key ? ME.name : (S.c[f] && S.c[f].name) || (S.g[id] && S.g[id].mem[f]) || f;
  const gTitle = (id, f) => (S.g[id] && S.g[id].titles && S.g[id].titles[f]) || '';
  const avStyle = (el, src, txt) => { if (src) { el.style.backgroundImage = 'url(' + src + ')'; el.textContent = ''; } else { el.style.backgroundImage = ''; el.textContent = txt || ''; } };
  const tm = ts => new Date(ts).toLocaleTimeString(I18N.lang, { hour: '2-digit', minute: '2-digit', hour12: !S.set.h24 });
  const banner = x => { $('#bn').style.display = x ? 'block' : 'none'; $('#bn').textContent = x || ''; };
  const warn = x => { $('#warn').style.display = x ? 'block' : 'none'; $('#warn').textContent = x || ''; };
  const dialog = (msg, def) => prompt(msg, def || '');
  const pvText = m => m.del ? t('deleted') : m.kind === 'st' ? t('sticker') : m.kind === 'img' ? t('photo') : m.kind === 'vo' ? t('voice') : m.kind === 'file' ? t('file') + ' ' + (m.name || '') : (m.x || '');
  const blobB64 = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result.split(',')[1]); f.readAsDataURL(b); });
  const b64Blob = (s, mime) => new Blob([C.unb64(s)], { type: mime || 'application/octet-stream' });

  function notify(title, text, id) {
    if (!NATIVE || !S.set.nt || !(document.hidden || cur !== id)) return;
    try { NATIVE.notify(title, S.set.np ? t('newMsg') : text); } catch (e) {}
  }
  function toast(m) { const e = $('#toast'); e.textContent = m; e.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => e.style.display = 'none', 1600); }
  function copyText(x) {
    let ok = false; if (NATIVE && NATIVE.copy) try { NATIVE.copy(x); ok = true; } catch (e) {}
    const fallback = () => { const a = document.createElement('textarea'); a.value = x; document.body.append(a); a.select(); try { document.execCommand('copy'); } catch (e) {} a.remove(); };
    if (!ok) { try { navigator.clipboard.writeText(x).catch(fallback); } catch (e) { fallback(); } }
    toast(t('copied'));
  }
  document.addEventListener('contextmenu', e => { if (!/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) e.preventDefault(); });

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
    const h = { t: 'm', i: m.mid, ts: m.ts, kind: m.kind, x: m.x, mime: m.mime, name: m.name, dur: m.dur, r: m.r, fw: m.fw, ex: m.ttl };
    if (isG(id)) h.g = id;
    const ok = await sealTo(c, h, m.b ? await m.b.arrayBuffer() : null);
    if (ok && !m.sent) { m.sent = 1; DB.putMsg(m); }
  }
  async function flushMsg(id, m) { for (const k of m.p.slice()) { if (on(k)) await sendMsgTo(conns[k], id, m); else connect(k); } }
  async function sendMsg(o, target, fwd) {
    const id = target || cur; if (!id) return; const mid = rid(12);
    if (isG(id) && (S.g[id].left || !SG.can(S.g[id], ME.key, o.kind === 't' ? 'send' : 'media'))) return alert(t('noPerm'));
    const m = Object.assign({ id: mid + ':' + id, mid, chat: id, f: ME.key, me: 1, ts: Date.now(), p: members(id), pend: 1 }, o);
    if (!fwd && id === cur && replyTo) { m.r = replyTo.mid; clearReply(); }
    const ttl = F.validTtl(ch(id).ttl); if (ttl) m.ttl = ttl;
    if (!m.p.length) { delete m.pend; if (m.ttl) S.exp[m.id] = F.expiresAt(m.ttl, Date.now()); }
    await addMsg(id, m); flushMsg(id, m);
  }
  // like sendCtl, but a peer that is offline gets it when it reconnects (reactions, pins)
  function sendCtlQ(id, h) {
    if (isG(id)) h.g = id;
    for (const k of members(id)) { const q = () => { F.ctlEnqueue(S.cq, k, h, Date.now()); save(); }; if (on(k)) sealTo(conns[k], h).then(ok => { if (!ok) q(); }); else q(); }
  }
  const canPin = (id, k) => !isG(id) || !S.g[id].owner || SG.can(S.g[id], k, 'info');
  async function sweep() { // self-destructing messages: delete what expired (also while the chat is closed)
    if (sweep.busy) return; const ids = F.dueIds(S.exp, Date.now()); if (!ids.length) return; sweep.busy = 1;
    try {
      const chats = new Set();
      for (const id of ids) { delete S.exp[id]; const m = await DB.getMsg(id); if (!m) continue; await DB.delMsg(id); chats.add(m.chat); if (M[m.chat]) M[m.chat] = M[m.chat].filter(x => x.id !== id); }
      for (const c of chats) await refreshMeta(c);
      save(); if (cur && chats.has(cur)) { draw(); drawPin(); } list();
    } finally { sweep.busy = 0; }
  }
  async function sendCtl(id, h) { for (const k of members(id)) if (on(k)) { if (isG(id)) h.g = id; sealTo(conns[k], h); } }
  const getM = (id, mid) => (M[id] || []).find(m => m.mid === mid);

  // ---------- network ----------
  function iceServers() { try { const j = JSON.parse(S.ice); if (Array.isArray(j) && j.length) return j; } catch (e) {} return DEFAULT_ICE; }
  const run = (c, f) => { c.q = (c.q || Promise.resolve()).then(f).catch(e => console.warn('conn', e)); };
  function connect(k) {
    if (S.block[k]) return;
    if (!peer || peer.disconnected || k === ME.key || on(k) || (conns[k] && conns[k].pend > Date.now())) return;
    const c = peer.connect('shilagram-' + k, { reliable: true }); c.want = k; c.pend = Date.now() + 15000; conns[k] = c; wire(c);
  }
  function drop(c) {
    const k = c.key || c.want;
    if (c.auth) seen[k] = Date.now();
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
    c.send({ t: 'hi', v: 2, k: ME.key, n: ME.name, u: ME.user || '', pk: ID.pub, ep: c.hello.ep, nc: c.hello.nc });
  }
  async function onData(c, d) {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'hi') return handleHi(c, d);
    if (d.t === 'au') return handleAu(c, d);
    if (d.t === 'e' && c.auth) {
      const iv = U8(d.iv), dd = U8(d.d); if (!iv || !dd) return;
      const { header, bin } = await C.open(c.aes, { iv, d: dd }); act[c.key] = Date.now();
      if (header.t === 'pg') return; // heartbeat
      return handlePlain(c, header, bin);
    }
  }
  async function handleHi(c, d) {
    if (c.pk) return; // only one hello per connection
    const pk = U8(d.pk), ep = U8(d.ep), nc = U8(d.nc);
    if (d.v !== 2 || typeof d.k !== 'string' || !KEYRE.test(d.k) || d.k === ME.key || !pk || pk.length !== 65 || !ep || ep.length !== 65 || !nc || nc.length !== 16) return c.close();
    if (c.want && c.want !== d.k) return c.close(); // we dialed X, X must be who answers
    if (S.block[d.k]) return c.close();
    c.peerKey = d.k; c.peerName = String(d.n || d.k).slice(0, 30); c.peerUser = USERRE.test(String(d.u || '')) ? String(d.u) : ''; c.pk = pk; c.theirEp = ep; c.theirNc = nc;
    await sendHi(c);
    const sig = await C.sign(ID.priv, nc, c.hello.ep, ep);
    c.send({ t: 'au', s: sig });
    c.aes = await C.deriveKey(c.hello.eph, c.hello.ep, ep);
  }
  const groupsWith = k => Object.values(S.g).filter(g => g.mem && g.mem[k] && !g.left);
  const related = k => !!(S.c[k] || S.out[k] || S.req[k] || groupsWith(k).length);
  async function handleAu(c, d) {
    if (!c.pk || !c.hello || c.auth || !c.aes) return;
    const s = U8(d.s); if (!s || !(await C.verify(c.pk, s, c.hello.nc, c.theirEp, c.hello.ep))) return c.close();
    const k = c.peerKey, pkb = C.b64(c.pk), o = S.c[k], pinned = (o && o.pk) || S.pins[k];
    if (pinned && pinned !== pkb) { warn(t('keyChanged') + ((o && o.name) || c.peerName || k) + '. ' + t('keyChangedHelp')); save(); return c.close(); }
    if (related(k)) { S.pins[k] = pkb; if (o) { o.pk = pkb; if (c.peerName) o.name = c.peerName; } }
    if (conns[k] && conns[k] !== c && conns[k].auth) try { conns[k].close(); } catch (e) {}
    conns[k] = c; c.auth = 1; c.key = k; seen[k] = Date.now(); save();
    if (srch && srch.key === k && srch.un) { // username lookup: the key's owner must announce the same @username
      if (c.peerUser && c.peerUser.toLowerCase() === srch.un) searchDone(k); else return searchFail(k);
    }
    if (!related(k)) c.stTimer = setTimeout(() => { if (!related(k)) try { c.close(); } catch (e) {} }, 20000); // strangers must send a friend request quickly
    await onAuthed(c, k);
  }
  async function onAuthed(c, k) {
    if (S.c[k]) { await sealTo(c, S.c[k].rq ? Object.assign(profileHdr(), { t: 'fr' }) : { t: 'fa' }); await sealTo(c, profileHdr()); } // rq: a friend who changed key must confirm us again
    else if (S.out[k]) await sealTo(c, Object.assign(profileHdr(), { t: 'fr' }));
    for (const [id, g] of Object.entries(S.g)) {
      if (g.mem[k] && g.raw) await sealTo(c, { t: 'gs', raw: g.raw, sig: g.sig });
      if (g.owner === k && g.pend && g.pend.length) { const ops = g.pend; g.pend = []; save(); for (const op of ops) await sealTo(c, { t: 'gop', g: id, op }); }
    }
    for (const m of await DB.pendingMsgs()) if (m.p.includes(k) && (m.chat === k || (S.g[m.chat] && S.g[m.chat].mem[k]))) await sendMsgTo(c, m.chat, m);
    for (const h of F.ctlTake(S.cq, k, Date.now())) await sealTo(c, h);
    wantAssets(); list(); if (cur) drawHead();
  }
  async function handlePlain(c, h, bin) {
    const k = c.key;
    if (h.t === 'fr') return receiveRequest(c, h);
    if (h.t === 'fa') return receiveAccept(c);
    if (h.t === 'fd') return receiveDecline(k);
    if (!S.c[k] && !['gs', 'gop', 'm', 'a', 'd', 'ed', 'gci', 'gcj', 'gar', 'gad', 'shr', 'rx', 'pin', 'typ'].includes(h.t)) return; // non-friends may only take part in shared groups
    if (h.t === 'gs') await receiveState(c, h);
    else if (h.t === 'gop') {
      const g = S.g[h.g]; if (!g || g.owner !== ME.key || !h.op) return; const op = Object.assign({}, h.op); delete op.d;
      const ns = SG.applyOp(g, k, op); if (!ns) return;
      if ((op.a === 'cv' || op.a === 'gf') && op.h) { // a picture sent by an assistant: verify it matches its hash before accepting
        const d = String(h.op.d || ''); if (!okAsset(op.a, d) || (await C.sha32(d)) !== op.h) return; S.ga[op.h] = d;
      }
      await commitGroup(h.g, ns);
    }
    else if (h.t === 'gar') { const hh = String(h.h || ''); if (SG.HASH.test(hh) && S.ga[hh] && Object.values(S.g).some(g => g.mem[k] && (g.cvh === hh || g.gfh === hh))) sealTo(c, { t: 'gad', h: hh, d: S.ga[hh] }); }
    else if (h.t === 'gad') {
      const hh = String(h.h || ''), d = String(h.d || '');
      if (SG.HASH.test(hh) && !S.ga[hh] && Object.values(S.g).some(g => g.mem[k] && (g.cvh === hh || g.gfh === hh)) && /^data:image\/(jpeg|gif|webp);base64,/.test(d) && okAsset(d.startsWith('data:image/jpeg') ? 'cv' : 'gf', d) && (await C.sha32(d)) === hh) { S.ga[hh] = d; save(); if ($('#pg-grp').classList.contains('on')) fillGroup(); }
    }
    else if (h.t === 'gci') onGroupInvite(k, h);
    else if (h.t === 'gcj') { const g = S.g[h.g]; if (call && call.group === h.g && g && g.mem[k] && !call.parts[k]) callPart(k); }
    else if (h.t === 'shr') { if (h.on && call && (call.k === k || (call.group && S.g[call.group] && S.g[call.group].mem[k]))) flashNotice(nmOf(call.group || k, k) + ' ' + t('sharingNow'), 3500); }
    else if (h.t === 'pf') receiveProfile(k, h);
    else if (h.t === 'typ') {
      const id = h.g || k, o = ch(id); if (!o || (h.g && !o.mem[k])) return;
      F.typingMark(typing[id] || (typing[id] = {}), k, Date.now()); list(); if (cur === id) drawHead();
      setTimeout(() => { list(); if (cur === id) drawHead(); }, F.TYPING_MS + 100);
    }
    else if (h.t === 'rx') {
      const id = h.g || k, o = ch(id); if (!o || (h.g && !o.mem[k])) return;
      const m = await DB.getMsg(String(h.i).slice(0, 20) + ':' + id); if (!m || m.del) return;
      m.rx = F.applyReaction(m.rx, k, h.e); await DB.putMsg(m); const mm = getM(id, m.mid); if (mm) mm.rx = m.rx; if (cur === id) draw();
    }
    else if (h.t === 'pin') {
      const id = h.g || k, o = ch(id); if (!o || (h.g && !o.mem[k]) || !canPin(id, k)) return;
      const mid = String(h.i).slice(0, 20); o.pins = h.on ? F.pinAdd(o.pins, mid) : F.pinRemove(o.pins, mid); save(); if (cur === id) drawPin();
    }
    else if (h.t === 'rec') { if (h.on && call && call.k === k) showRecNotice(); else if (!h.on) $('#recn').classList.remove('on'); }
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
        if (h.fw) m.fw = F.fwName(h.fw);
        const ttl = F.validTtl(h.ex); if (ttl) { m.ttl = ttl; S.exp[rid_] = F.expiresAt(ttl, Date.now()); save(); }
        if (typing[id]) delete typing[id][k];
        if (cur !== id) o.u = (o.u || 0) + 1;
        await addMsg(id, m);
        shAuto(m, id);
        notify(t('msgFrom') + nmOf(id, k), pvText(m), id);
      }
      sealTo(c, { t: 'a', i: mid, g: h.g });
    } else if (h.t === 'a') {
      const id = h.g || k, m = await DB.getMsg(String(h.i) + ':' + id);
      if (m && m.p) { m.p = m.p.filter(x => x !== k); if (!m.p.length) { delete m.pend; if (m.ttl && !S.exp[m.id]) { S.exp[m.id] = F.expiresAt(m.ttl, Date.now()); save(); } } await DB.putMsg(m); const mm = getM(id, m.mid); if (mm) { mm.p = m.p; mm.pend = m.pend; } if (cur === id) draw(); }
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
    peer.on('open', () => { banner(0); poll(); ensureDir(); });
    peer.on('connection', wire);
    peer.on('call', onIncomingCall);
    peer.on('disconnected', () => { banner(t('serverLost')); setTimeout(() => { try { peer.reconnect(); } catch (e) {} }, 3000); });
    peer.on('error', e => {
      const m = /shilagram-([A-Z]{6}\d{4})/.exec(e.message || '');
      if (e.type === 'peer-unavailable') {
        const mu = /shilagram-u-([A-Za-z0-9_]+)/.exec(e.message || ''); if (mu) { const f = lookups[mu[1].toLowerCase()]; if (f) f(null); return; }
        if (m) { const c = conns[m[1]]; if (c && !c.auth) delete conns[m[1]]; if (srch && srch.key === m[1]) nf(); } return;
      }
      if (['unavailable-id', 'network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) {
        banner(e.type === 'unavailable-id' ? t('keyBusy') : t('noNet')); try { peer.destroy(); } catch (x) {} setTimeout(start, 6000);
      }
    });
  }
  function poll() { const ks = new Set([...Object.keys(S.c), ...Object.keys(S.out)]); Object.values(S.g).forEach(g => Object.keys(g.mem).forEach(k => ks.add(k))); ks.forEach(connect); }
  setInterval(() => {
    Object.keys(conns).forEach(k => { const c = conns[k]; if (!c.auth) return; if (S.c[k]) sealTo(c, { t: 'pg' }); if (Date.now() - Math.max(act[k] || 0, seen[k] || 0) > 90000) try { c.close(); } catch (e) {} }); // heartbeat; drop silent connections
    if (peer && !peer.disconnected) { poll(); checkRotation(); }
  }, 20000);
  setInterval(() => ensureDir(), 8000);
  setInterval(sweep, 1000);

  // ---------- list & chat UI ----------
  function list() {
    $('#mk').textContent = ME.user ? '@' + ME.user : t('noUser'); renderReqs();
    const L = $('#list'); L.innerHTML = '';
    const rows = [...Object.entries(S.c).map(([id, o]) => [id, o, 0]), ...Object.entries(S.g).map(([id, o]) => [id, o, 1])].sort((a, b) => (b[1].last || 0) - (a[1].last || 0));
    if (!rows.length) L.innerHTML = '<div class="empty"><svg class="ill"><use href="#ill-empty"/></svg>' + t('noChats') + '</div>';
    rows.forEach(([id, o, g]) => {
      const r = document.createElement('div'); r.className = 'row';
      r.innerHTML = '<div class="av' + (!g && on(id) ? ' on' : '') + '"></div><div class="mid"><b></b><span></span></div><div class="meta"><div></div></div>';
      avStyle(r.children[0], o.av, g ? '👥' : (o.name || '?')[0]); r.querySelector('b').textContent = o.name;
      const pv = o.lk === 'st' ? t('sticker') : o.lk === 'img' ? t('photo') : o.lk === 'vo' ? t('voice') : (o.lx || '');
      const tkl = F.typingNow(typing[id], Date.now()); r.querySelector('span').textContent = tkl.length ? t('typing') : pv || (g ? Object.keys(o.mem).length + t('members') : on(id) ? t('online') : t('offline'));
      r.querySelector('.meta div').textContent = o.last ? tm(o.last) : '';
      if (o.u) { const b = document.createElement('span'); b.className = 'bd'; b.textContent = o.u; r.lastChild.append(b); }
      r.onclick = () => open(id); L.append(r);
    });
  }
  async function open(id) {
    cur = id; ch(id).u = 0; save(); M[id] = await DB.chatMsgs(id); clearReply();
    $('#chat').classList.add('on'); $('#tray').classList.remove('on'); $('#bc1').style.display = $('#bc2').style.display = '';
    drawHead(); updateComposer(); pinCur = 0; draw(1); drawPin(); list(); showRot();
  }
  function back() { cur = null; $('#rotb').hidden = true; $('#chat').classList.remove('on'); list(); }
  function drawHead() {
    const o = ch(cur); if (!o) return;
    $('#cn').textContent = o.name; avStyle($('#ca'), o.av, isG(cur) ? '👥' : (o.name || '?')[0]);
    const tk = F.typingNow(typing[cur], Date.now());
    $('#cs').textContent = tk.length ? (isG(cur) ? tk.map(k => nmOf(cur, k)).join('، ') + ' ' + (tk.length > 1 ? t('typingMany') : t('typing')) : t('typing')) : isG(cur) ? Object.keys(o.mem).map(k => nmOf(cur, k)).join('، ') : on(cur) ? t('online') + ' · ' + t('secure') : t('offline');
  }
  function drawPin() {
    const o = ch(cur), b = $('#pinb'); if (!o) { b.hidden = true; return; }
    const ids = F.pinPrune(o.pins, x => { const m = getM(cur, x); return m && !m.del; });
    if (!ids.length) { b.hidden = true; pinCur = 0; return; }
    pinCur = pinCur % ids.length; const m = getM(cur, ids[ids.length - 1 - pinCur]);
    $('#pint').textContent = t('pinnedMsg') + (ids.length > 1 ? ' (' + (pinCur + 1) + '/' + ids.length + ')' : '') + ': ' + pvText(m);
    $('#pinx').style.display = canPin(cur, ME.key) ? '' : 'none'; b.hidden = false; b.dataset.mid = m.mid;
  }
  $('#pinb').onclick = e => { if (e.target.id === 'pinx') return; const mid = $('#pinb').dataset.mid; if (mid) { jumpTo(mid); pinCur++; setTimeout(drawPin, 400); } };
  $('#pinx').onclick = () => { const mid = $('#pinb').dataset.mid; if (mid) togglePin(getM(cur, mid)); };
  function togglePin(m) {
    if (!m || !canPin(cur, ME.key)) return toast(t('pinNoPerm')); const o = ch(cur), on_ = !(o.pins || []).includes(m.mid);
    o.pins = on_ ? F.pinAdd(o.pins, m.mid) : F.pinRemove(o.pins, m.mid); save(); pinCur = 0; drawPin(); draw(); sendCtlQ(cur, { t: 'pin', i: m.mid, on: on_ ? 1 : 0 });
  }
  async function react(m, e) {
    const ne = (m.rx || {})[ME.key] === e ? '' : e; m.rx = F.applyReaction(m.rx, ME.key, ne); await DB.putMsg(m); draw(); sendCtlQ(cur, { t: 'rx', i: m.mid, e: ne });
  }
  function draw(stick) {
    const o = ch(cur); if (!o) return; urls.forEach(u => URL.revokeObjectURL(u)); urls = [];
    const Mm = $('#ms'), nearEnd = Mm.scrollHeight - Mm.scrollTop - Mm.clientHeight < 120; Mm.innerHTML = '';
    const url = b => { const u = URL.createObjectURL(b); urls.push(u); return u; };
    (M[cur] || []).slice(-150).forEach(m => {
      const b = document.createElement('div'); b.className = 'b' + (m.me ? ' me' : '') + (m.kind === 'st' && !m.del ? ' st' : '') + (m.del ? ' del' : ''); b.dataset.mid = m.mid;
      if (isG(cur) && !m.me) { const n = document.createElement('b'); n.textContent = nmOf(cur, m.f) + (gTitle(cur, m.f) ? ' · ' + gTitle(cur, m.f) : ''); b.append(n); }
      if (m.fw && !m.del) { const f = document.createElement('span'); f.className = 'fw'; f.textContent = t('fwFrom') + m.fw; b.append(f); }
      if (m.r && !m.del) { const q = getM(cur, m.r); const rp = document.createElement('div'); rp.className = 'rp'; rp.textContent = q ? pvText(q) : '…'; b.append(rp); }
      if (m.del) { const s = document.createElement('span'); s.textContent = t('deleted'); b.append(s); }
      else if (m.kind === 'st' && m.b) { const im = document.createElement('img'); im.className = 'st'; im.src = url(m.b); if (!m.me) im.onclick = () => { if (confirm(t('saveSt'))) saveSticker(m.b); }; b.append(im); }
      else if (m.kind === 'img' && m.b) { const im = document.createElement('img'); im.className = 'ph'; im.src = url(m.b); im.onclick = () => openChatPhoto(m); b.append(im); }
      else if (m.kind === 'vo' && m.b) { const a = document.createElement('audio'); a.controls = true; a.preload = 'metadata'; a.src = url(m.b); b.append(a); }
      else if (m.kind === 'file' && m.b) { const f = document.createElement('div'); f.className = 'fl'; f.innerHTML = '<span>📎</span><u></u>'; f.lastChild.textContent = (m.name || 'file') + ' (' + Math.ceil(m.b.size / 1024) + ' KB)'; f.onclick = () => saveBlob(m); b.append(f); }
      else if (m.kind !== 't' && !m.b) { const s = document.createElement('span'); s.textContent = t('mediaGone'); s.style.opacity = '.6'; b.append(s); }
      else { const s = document.createElement('span'); s.textContent = m.x || ''; b.append(s); }
      if (!m.del && m.rx && Object.keys(m.rx).length) { const rr = document.createElement('div'); rr.className = 'rxs'; F.reactionSummary(m.rx, ME.key).forEach(c => { const bt = document.createElement('button'); bt.textContent = c.e + (c.n > 1 ? ' ' + c.n : ''); bt.classList.toggle('mine', c.mine); bt.onclick = ev => { ev.stopPropagation(); react(m, c.e); }; rr.append(bt); }); b.append(rr); }
      const i = document.createElement('i'); i.textContent = (m.ttl ? '⏳ ' : '') + ((ch(cur).pins || []).includes(m.mid) ? '📌 ' : '') + (m.ed ? t('edited') + ' · ' : '') + tm(m.ts) + (m.me ? (m.p && !m.p.length ? ' ✓✓' : m.sent ? ' ✓' : ' ⏱') : ''); b.append(i);
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
    if (!m.del) { const rw = document.createElement('div'); rw.className = 'rxrow'; F.REACTIONS.forEach(e => { const b = document.createElement('button'); b.textContent = e; b.onclick = () => { sheet(0); react(m, e); }; rw.append(b); }); L.append(rw); }
    if (!m.del) add(t('reply'), () => setReply(m));
    if (!m.del && (m.x || m.b)) add('↪ ' + t('forward'), () => openForward(m));
    if (!m.del && canPin(cur, ME.key)) add('📌 ' + ((ch(cur).pins || []).includes(m.mid) ? t('unpin') : t('pin')), () => togglePin(m));
    if (!m.del && m.kind === 't' && m.x) add(t('copy'), () => copyText(m.x));
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
  function sheet(n) { if (n !== 'tsv' && tsvRes) { const r = tsvRes; tsvRes = null; r(null); } if (n !== 'inc') pendingGroup = null; $('#x').style.display = n === 'un' ? 'none' : ''; $('#sh').classList.toggle('on', !!n); $$('.pn').forEach(p => p.classList.toggle('on', p.id === 'p-' + n)); if (n !== 'crop' && cropRes) { const r = cropRes; cropRes = null; r(null); } }
  const closeSheet = () => { if (userPending()) return; sheet(0); };
  window.__back = () => { if ($('#lock').classList.contains('on')) { if (!$('#lkc').hidden) { $('#lkc').click(); return 1; } return 0; } if ($('#shv').classList.contains('on')) { vClose(); return 1; } if ($('#call').classList.contains('on') && !$('#call').classList.contains('min')) { minimizeCall(); return 1; } if ($('#sh').classList.contains('on')) { closeSheet(); return 1; } if (pgStack.length) { closePage(); return 1; } if (cur) { back(); return 1; } return 0; };
  $('#x').onclick = closeSheet; $('#sh').onclick = e => { if (e.target.id === 'sh') closeSheet(); };

  // ---------- pages ----------
  const pgStack = [], PG_ON = {};
  function showPage(n) { const el = $('#pg-' + n); if (!el || pgStack[pgStack.length - 1] === n) return; pgStack.push(n); el.style.zIndex = 10 + pgStack.length; el.classList.add('on'); if (PG_ON[n]) PG_ON[n](); }
  function closePage() { const n = pgStack.pop(); if (!n) return; $('#pg-' + n).classList.remove('on'); if (n === 'dl' || n === 'gmedia') dlClear(); if (n === 'shfc' && pgStack[pgStack.length - 1] === 'shf') renderShf(); }
  $$('[data-pg]').forEach(b => b.onclick = () => showPage(b.dataset.pg)); $$('.pback').forEach(b => b.onclick = closePage);
  const svgUri = x => 'data:image/svg+xml,' + encodeURIComponent(x);
  const DEF_AV = svgUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#d9cdf0"/><circle cx="100" cy="78" r="38" fill="#7a65a8"/><path d="M28 200c0-42 32-72 72-72s72 30 72 72z" fill="#7a65a8"/></svg>');
  const DEF_COVER = svgUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b2475"/><stop offset="1" stop-color="#150f29"/></linearGradient></defs><rect width="800" height="400" fill="url(#g)"/><g fill="#e9c46a" opacity=".85"><circle cx="90" cy="70" r="3"/><circle cx="220" cy="140" r="2"/><circle cx="640" cy="60" r="3.5"/><circle cx="720" cy="190" r="2"/><circle cx="470" cy="320" r="2.5"/><circle cx="150" cy="330" r="2"/><circle cx="330" cy="90" r="2"/></g><path d="M90 70L220 140 330 90 470 320M640 60L720 190" fill="none" stroke="#8b5cf6" stroke-width="2" opacity=".55"/><circle cx="690" cy="330" r="80" fill="#8b5cf6" opacity=".2"/><circle cx="110" cy="260" r="50" fill="#e9c46a" opacity=".08"/></svg>');
  const bigAv = (el, src, fc) => { el.style.setProperty('--fc', fc || '#6f5b99'); el.style.backgroundImage = 'url("' + (src || DEF_AV) + '")'; el.textContent = ''; };
  const FCS = ['#6f5b99', '#e9c46a', '#8b5cf6', '#2a8fd4', '#22c55e', '#ef4444', '#f97316', '#ec4899', '#ffffff', '#14b8a6'];

  // ---------- profile ----------
  const USERRE = /^(?=.{4,20}$)[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*$/, FCRE = /^#[0-9a-fA-F]{6}$/, noCtl = (x, n) => String(x == null ? '' : x).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
  let viewKey = null, draft = null, pAv;
  // ---------- image tool: crop + shrink to exactly the size the UI needs ----------
  const AVO = { w: 160, h: 160, circle: 1, max: 20000 }, COVO = { w: 640, h: 320, max: 50000 };
  function cropImage(file, o) {
    return createImageBitmap(file).then(bm => new Promise(res => {
      const cw = 280, ch = Math.round(280 * o.h / o.w), cv = $('#crv'), x = cv.getContext('2d'); cv.width = cw; cv.height = ch;
      const st = { z: 1, ox: 0, oy: 0 }, base = Math.max(cw / bm.width, ch / bm.height);
      const clamp = () => { const w = bm.width * base * st.z, h = bm.height * base * st.z; st.ox = Math.max(-(w - cw) / 2, Math.min((w - cw) / 2, st.ox)); st.oy = Math.max(-(h - ch) / 2, Math.min((h - ch) / 2, st.oy)); };
      const paint = (g, W, H, k) => { const w = bm.width * base * st.z * k, h = bm.height * base * st.z * k; g.drawImage(bm, W / 2 - w / 2 + st.ox * k, H / 2 - h / 2 + st.oy * k, w, h); };
      const draw = () => {
        clamp(); x.fillStyle = '#000'; x.fillRect(0, 0, cw, ch); paint(x, cw, ch, 1);
        if (o.circle) { x.save(); x.fillStyle = 'rgba(0,0,0,.62)'; x.beginPath(); x.rect(0, 0, cw, ch); x.moveTo(cw - 2, ch / 2); x.arc(cw / 2, ch / 2, cw / 2 - 2, 0, 7); x.fill('evenodd'); x.restore(); x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.arc(cw / 2, ch / 2, cw / 2 - 2, 0, 7); x.stroke(); }
      };
      $('#crz').value = 1; draw();
      let pd = null; cv.onpointerdown = e => { pd = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); }; cv.onpointerup = () => pd = null;
      cv.onpointermove = e => { if (!pd) return; const r = cw / cv.getBoundingClientRect().width; st.ox += (e.clientX - pd[0]) * r; st.oy += (e.clientY - pd[1]) * r; pd = [e.clientX, e.clientY]; draw(); };
      $('#crz').oninput = e => { st.z = +e.target.value; draw(); };
      const out = () => {
        for (const sc of [1, .75, .5]) {
          const W = Math.round(o.w * sc), H = Math.round(o.h * sc), c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
          const g = c2.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); paint(g, W, H, W / cw);
          for (let q = .85; q > .3; q -= .1) { const u = c2.toDataURL('image/jpeg', q); if (u.length <= o.max) return u; }
        } return null;
      };
      const done = v => { cropRes = null; sheet(0); res(v); };
      $('#cro').onclick = () => done(out()); $('#crc').onclick = () => done(null);
      cropRes = res; sheet('crop');
    }));
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
    if (!me) { C.fingerprint(ID.pub).then(f => $('#secme').textContent = f); if (o.pk) C.fingerprint(C.unb64(o.pk)).then(f => $('#secthem').textContent = f); else $('#secthem').textContent = t('notVerified'); }
  }
  function openProfileView(key) { fillView(key); showPage('view'); }
  $('#mav').onclick = () => openProfileView(ME.key);
  $('#vkr').onclick = () => copyText(viewKey);
  // edit page: changes are kept in a draft until "Save"
  function renderEdit() {
    bigAv($('#eav'), draft.av, draft.fc); $('#en').textContent = draft.name; $('#eu').textContent = draft.user ? '@' + draft.user : '';
    $('#eb').textContent = [...draft.bio].slice(0, 60).join('') + ([...draft.bio].length > 60 ? '…' : ''); $('#efcs').style.background = draft.fc || '#6f5b99'; $('#ecov').style.backgroundImage = 'url("' + (draft.cv || DEF_COVER) + '")';
  }
  function openProfileEdit() { draft = { name: ME.name, user: ME.user || '', bio: ME.bio || '', av: ME.av || '', cv: ME.cv || '', fc: ME.fc || '' }; renderEdit(); showPage('edit'); }
  $('#vedit').onclick = openProfileEdit; $('#ecancel').onclick = closePage;
  $('#esv').onclick = async () => {
    if ((draft.user || '') !== (ME.user || '')) { const r = await claimUsername(draft.user); if (r === false) return alert(t('userTaken')); if (r === 'net') toast(t('userPending')); }
    Object.assign(ME, { name: draft.name, user: draft.user, bio: draft.bio }); ['av', 'cv', 'fc'].forEach(k => { if (draft[k]) ME[k] = draft[k]; else delete ME[k]; });
    DB.set('me', ME); drawMine(); broadcastProfile(); closePage(); if (viewKey === ME.key) fillView(ME.key);
  };
  $('#eavb').onclick = $('#eav').onclick = () => $('#pfile').click(); $('#ecovb').onclick = $('#ecov').onclick = () => $('#cfile').click();
  $('#pfile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const u = await cropImage(f, AVO); if (u) { draft.av = u; renderEdit(); } } catch (x) { alert(t('tooBig')); } };
  $('#cfile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const u = await cropImage(f, COVO); if (u) { draft.cv = u; renderEdit(); } } catch (x) { alert(t('tooBig')); } };
  let efKind, efCb = null, efMulti = false;
  function editText(title, val, max, multi, cb) {
    efKind = '*'; efCb = cb; efMulti = multi; $('#eft').textContent = title; $('#efpw').style.display = multi ? 'none' : 'flex'; $('#efpw .efp').style.display = 'none'; $('#efa').style.display = multi ? '' : 'none'; $('#efe').textContent = '';
    $('#efi').maxLength = max; $('#efa').maxLength = max; $('#efi').dir = 'auto'; (multi ? $('#efa') : $('#efi')).value = val; sheet('ef');
  }
  function editField(kind) {
    efCb = null;
    if (kind === 'user' && ME.user) return toast(t('userLocked'));
    efKind = kind; const bio = kind === 'bio'; $('#eft').textContent = t(kind === 'name' ? 'chName' : kind === 'user' ? 'chUser' : 'chBio');
    $('#efpw').style.display = bio ? 'none' : 'flex'; $('#efpw .efp').style.display = kind === 'user' ? '' : 'none'; $('#efa').style.display = bio ? '' : 'none'; $('#efe').textContent = '';
    $('#efi').maxLength = kind === 'user' ? 20 : 30; $('#efi').dir = kind === 'user' ? 'ltr' : 'auto'; (bio ? $('#efa') : $('#efi')).value = draft[kind]; sheet('ef');
  }
  $$('[data-ef]').forEach(b => b.onclick = () => editField(b.dataset.ef));
  $('#efok').onclick = () => {
    if (efKind === '*') { const v0 = (efMulti ? $('#efa') : $('#efi')).value.trim(), cb = efCb; sheet(0); if (cb) cb(v0); return; }
    const v = (efKind === 'bio' ? $('#efa') : $('#efi')).value.trim();
    if (efKind === 'name') { if (!v) return; draft.name = noCtl(v, 30); }
    else if (efKind === 'user') { const u = v.replace(/^@/, ''); if (u && !USERRE.test(u)) return $('#efe').textContent = t('userBad'); draft.user = u; }
    else draft.bio = noCtl(v, 140);
    renderEdit(); sheet(0);
  };
  let colorCb = null;
  function colorSheet(curC, cb) {
    colorCb = cb; const G = $('#fcs'); G.innerHTML = ''; FCS.forEach(c => { const b = document.createElement('button'); b.style.background = c; b.classList.toggle('on', (curC || '#6f5b99') === c); b.onclick = () => { sheet(0); cb(c); }; G.append(b); });
    $('#fci').value = curC || '#6f5b99'; sheet('fc');
  }
  $('#fci').onchange = e => { const v = e.target.value, cb = colorCb; sheet(0); if (cb) cb(v); };
  $('#efcb').onclick = () => colorSheet(draft.fc, c => { draft.fc = c; renderEdit(); });

  // ---------- settings ----------
  const BGS = [{ t: 'none' }, { t: 'c', v: '#e8dcc8' }, { t: 'c', v: '#cfe3d4' }, { t: 'c', v: '#d5dff2' }, { t: 'c', v: '#2b2f3a' }, { t: 'c', v: '#1b1230' },
    { t: 'g', v: 'linear-gradient(160deg,#7c3aed,#2a8fd4)' }, { t: 'g', v: 'linear-gradient(160deg,#1f1235,#4a2f86 65%,#e9c46a33)' }, { t: 'g', v: 'linear-gradient(160deg,#fcd5ce,#f8edeb)' }, { t: 'g', v: 'linear-gradient(160deg,#0f2027,#2c5364)' }];
  let bgUrl = null;
  async function loadBg() { const b = await DB.get('bgimg'); if (bgUrl) URL.revokeObjectURL(bgUrl); bgUrl = b ? URL.createObjectURL(b) : null; }
  function applySettings() {
    const st = S.set, r = document.documentElement, bg = st.bg || { t: 'none' };
    if (st.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', st.theme);
    r.style.setProperty('--fs', st.fs + 'px'); r.style.setProperty('--br', (st.br == null ? 14 : st.br) + 'px'); r.classList.toggle('nomo', !!st.nomo);
    if (NATIVE && NATIVE.setSecure) try { NATIVE.setSecure(!!st.secure); } catch (e) {}
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
  async function renderDl(L, chatId) {
    dlClear(); L.innerHTML = '';
    const ms = (await DB.allMsgs()).filter(m => m.b && !m.del && ['img', 'vo', 'file'].includes(m.kind) && (!chatId || m.chat === chatId)).sort((a, b) => b.ts - a.ts);
    (chatId ? [] : S.recs).forEach(rc => { const r = document.createElement('div'); r.className = 'dlr'; r.innerHTML = '<div class="th"><svg class="ic"><use href="#i-video"/></svg></div><div class="mid"><b></b><span></span></div><button class="x2">✕</button>';
      r.querySelector('b').textContent = t('recDl') + ' · ' + nmOf(rc.k, rc.k); r.querySelector('.mid span').textContent = Math.ceil((rc.size || 0) / 1024) + ' KB · ' + new Date(rc.ts).toLocaleString(I18N.lang);
      r.onclick = async () => { const b = await DB.get('rec:' + rc.id); if (b) saveBlob({ b, name: rc.name, mime: rc.mime, kind: 'file' }); };
      r.querySelector('.x2').onclick = async e => { e.stopPropagation(); if (!confirm(t('delSt'))) return; await DB.del('rec:' + rc.id); S.recs = S.recs.filter(x => x.id !== rc.id); save(); PG_ON.dl(); }; L.append(r); });
    if (!ms.length && (chatId || !S.recs.length)) { L.innerHTML = '<div class="empty"><svg class="ill"><use href="#ill-empty"/></svg>' + t('noDownloads') + '</div>'; return; }
    ms.forEach(m => {
      const r = document.createElement('div'); r.className = 'dlr'; r.innerHTML = '<div class="th"></div><div class="mid"><b></b><span></span></div><svg class="ic"><use href="#i-download"/></svg>';
      const th = r.firstChild; if (m.kind === 'img') { const u = URL.createObjectURL(m.b); dlUrls.push(u); th.style.backgroundImage = 'url(' + u + ')'; } else th.innerHTML = '<svg class="ic"><use href="#i-' + (m.kind === 'vo' ? 'mic' : 'file') + '"/></svg>';
      r.querySelector('b').textContent = m.name || (m.kind === 'vo' ? t('voice') : t('photo'));
      r.querySelector('.mid span').textContent = Math.ceil(m.b.size / 1024) + ' KB · ' + ((ch(m.chat) || {}).name || '') + ' · ' + new Date(m.ts).toLocaleDateString(I18N.lang); r.onclick = () => saveBlob(m); L.append(r);
    });
  }
  PG_ON.dl = () => renderDl($('#dll')); PG_ON.gmedia = () => renderDl($('#gml2'), cur);
  function renderStPage() {
    const G = $('#stg'); G.innerHTML = ''; const plus = document.createElement('button'); plus.className = 'c plus'; plus.innerHTML = '<svg class="ic" style="width:34px;height:34px"><use href="#i-sticker"/></svg>';
    plus.onclick = () => { sk = {}; skDraw(); $('#cap').value = ''; $('#zm').value = 1; sheet('s'); }; G.append(plus);
    DB.stickers().then(L => L.forEach(s => { const c = document.createElement('div'); c.className = 'c'; const im = new Image(); im.src = URL.createObjectURL(s.b); const x = document.createElement('button'); x.textContent = '✕'; x.onclick = async () => { if (confirm(t('delSt'))) { await DB.delSticker(s.id); renderStPage(); } }; c.append(im, x); G.append(c); }));
  }
  PG_ON.st = renderStPage;

  // backup
  $('#bex').onclick = async () => {
    if (!(await checkTsv(t('tsvCurrent')))) return;
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
  // ---------- find a friend by @username and send a friend request ----------
  const lookups = {};
  function dirLookup(un) { // ask the directory peer "shilagram-u-<un>" which key owns this username
    return new Promise(res => {
      if (!peer || peer.disconnected) return res(null);
      let c, to; const fin = v => { if (lookups[un] === fin) delete lookups[un]; clearTimeout(to); try { c && c.close(); } catch (e) {} res(v); };
      lookups[un] = fin; to = setTimeout(() => fin(null), 10000);
      try { c = peer.connect('shilagram-u-' + un, { reliable: true }); } catch (e) { return fin(null); }
      c.on('data', d => { if (d && d.t === 'ans' && typeof d.k === 'string' && KEYRE.test(d.k)) fin(d.k); }); c.on('error', () => fin(null)); c.on('close', () => setTimeout(() => fin(null), 400));
    });
  }
  $('#bf').onclick = () => { if (!ME.user) return askUser(); if (srch) { clearTimeout(srch.t); srch = null; } $('#fk').value = ''; $('#fs').textContent = ''; $('#fg').disabled = 0; $('#fk').placeholder = t('findPh'); sheet('f'); };
  function nf() { if (!srch) return; clearTimeout(srch.t); srch = null; $('#fs').textContent = t('notFoundUser'); $('#fg').disabled = 0; }
  function searchFail(k) { if (!srch) return; clearTimeout(srch.t); srch = null; try { conns[k] && conns[k].close(); } catch (e) {} $('#fs').textContent = t('userMismatch'); $('#fg').disabled = 0; }
  function searchDone(k) {
    if (!srch) return; clearTimeout(srch.t); const un = srch.un; srch = null; $('#fg').disabled = 0;
    if (S.c[k]) { sheet(0); return open(k); }
    if (S.req[k]) { acceptReq(k); sheet(0); return open(k); } // they had already asked us
    S.out[k] = { name: (conns[k] && conns[k].peerName) || un, un, ts: Date.now() }; save(); list(); sheet(0); toast(t('reqSent') + ' @' + un);
  }
  $('#fg').onclick = async () => {
    const un = $('#fk').value.trim().replace(/^@/, ''); if (srch) return;
    if (!USERRE.test(un)) return $('#fs').textContent = t('badQuery'); const l = un.toLowerCase();
    if (ME.user && ME.user.toLowerCase() === l) return $('#fs').textContent = t('yourOwn');
    const find = o => Object.keys(o).find(k => (o[k].un || '').toLowerCase() === l);
    const fk = find(S.c); if (fk) { sheet(0); return open(fk); }
    if (find(S.out)) return $('#fs').textContent = t('reqAlready');
    const rk = find(S.req); if (rk) { acceptReq(rk); sheet(0); return open(rk); }
    if (!peer || peer.disconnected) return $('#fs').textContent = t('noNet');
    $('#fs').textContent = t('searching'); $('#fg').disabled = 1; srch = { un: l, t: setTimeout(() => srch && nf(), 16000) };
    const k = await dirLookup(l); if (!srch || srch.un !== l) return; if (!k || k === ME.key) return nf();
    srch.key = k; if (on(k)) { const c = conns[k]; return (c.peerUser || '').toLowerCase() === l ? searchDone(k) : searchFail(k); } connect(k);
  };
  // ---------- friend requests ----------
  const frInfo = (c, h) => { const av = String(h.av || ''), cv = String(h.cv || ''), fc = String(h.fc || ''); return { name: noCtl(h.n, 30) || c.peerName || c.key, un: (USERRE.test(String(h.u || '')) ? String(h.u) : c.peerUser) || '', bio: noCtl(h.b, 140), pk: C.b64(c.pk), av: SG.okAv(av) ? av : '', cv: SG.okImg(cv, 60000) ? cv : '', fc: FCRE.test(fc) ? fc : '' }; };
  function makeFriend(k, info) {
    const o = { name: info.name || k, u: 0, last: 0, un: info.un || '', bio: info.bio || '', pk: info.pk }; ['av', 'cv', 'fc'].forEach(f => { if (info[f]) o[f] = info[f]; });
    S.c[k] = o; if (info.pk) S.pins[k] = info.pk; delete S.req[k]; delete S.out[k]; delete S.dec[k]; save(); list(); return o;
  }
  function receiveRequest(c, h) {
    const k = c.key; if (S.block[k]) return; const info = frInfo(c, h);
    if (S.c[k]) return void sealTo(c, { t: 'fa' });
    if (S.dec[k] && Date.now() - S.dec[k] < 6048e5) return void sealTo(c, { t: 'fd' }); // declined within the last week: answer quietly
    if (S.out[k]) { makeFriend(k, info); sealTo(c, { t: 'fa' }); sealTo(c, profileHdr()); toast(t('friendAccepted') + info.name); return; } // both asked each other
    if (!S.req[k] && Object.keys(S.req).length >= 50) return;
    const first = !S.req[k]; S.req[k] = Object.assign(S.req[k] || { ts: Date.now() }, info); S.pins[k] = info.pk; save(); list();
    if (first) notify(t('reqFrom'), info.name + (info.un ? ' @' + info.un : ''), '-');
  }
  function receiveAccept(c) {
    const k = c.key, out = S.out[k]; if (S.c[k] && S.c[k].rq) { delete S.c[k].rq; save(); return sealTo(c, profileHdr()); } if (!out) return;
    const o = makeFriend(k, { name: out.name || c.peerName, un: out.un || c.peerUser, pk: C.b64(c.pk) }); sealTo(c, profileHdr()); toast(t('friendAccepted') + o.name); notify(t('friendAccepted'), o.name, '-');
  }
  function receiveDecline(k) { if (S.out[k]) { delete S.out[k]; save(); list(); toast(t('friendDeclined')); } }
  function acceptReq(k) { const r = S.req[k]; if (!r) return; makeFriend(k, r); if (on(k)) { sealTo(conns[k], { t: 'fa' }); sealTo(conns[k], profileHdr()); } else connect(k); }
  function declineReq(k, blk) { if (on(k)) sealTo(conns[k], { t: 'fd' }); delete S.req[k]; S.dec[k] = Date.now(); if (blk) { S.block[k] = 1; try { conns[k] && conns[k].close(); } catch (e) {} } save(); list(); }
  function renderReqs() {
    const R = $('#reqs'); R.innerHTML = ''; const rk = Object.keys(S.req), ok_ = Object.keys(S.out); if (!rk.length && !ok_.length) return;
    if (rk.length) { const hd = document.createElement('div'); hd.className = 'sec2'; hd.textContent = t('reqTitle') + ' (' + rk.length + ')'; R.append(hd); }
    rk.forEach(k => { const q = S.req[k], r = document.createElement('div'); r.className = 'rq'; r.innerHTML = '<div class="av"></div><div class="mid"><b></b><span></span></div><div class="rqb"><button class="y"></button><button class="n"></button><button class="b"></button></div>';
      avStyle(r.children[0], q.av, (q.name || '?')[0]); r.querySelector('b').textContent = q.name; r.querySelector('.mid span').textContent = (q.un ? '@' + q.un : '') + (q.bio ? ' · ' + q.bio : '');
      const [y, n, b] = r.querySelectorAll('.rqb button'); y.textContent = t('frAccept'); n.textContent = t('frDecline'); b.textContent = t('frBlock');
      y.onclick = () => acceptReq(k); n.onclick = () => declineReq(k); b.onclick = () => { if (confirm(t('confirmBlock'))) declineReq(k, true); }; R.append(r); });
    ok_.forEach(k => { const q = S.out[k], r = document.createElement('div'); r.className = 'rq po'; r.innerHTML = '<div class="av"></div><div class="mid"><b></b><span></span></div><button class="x3">✕</button>';
      avStyle(r.children[0], '', (q.un || q.name || '?')[0]); r.querySelector('b').textContent = '@' + (q.un || q.name); r.querySelector('.mid span').textContent = t('reqPending');
      r.querySelector('.x3').onclick = () => { delete S.out[k]; save(); list(); }; R.append(r); });
  }
  // ---------- a friend reinstalled the app (new key, same @username): follow them ----------
  const ROT_AFTER = () => window.__ROT_AFTER || 45000;
  async function checkRotation() {
    if (!peer || peer.disconnected) return;
    for (const [k, o] of Object.entries(S.c)) {
      if (!o.un || rot[k] || Date.now() - Math.max(act[k] || 0, seen[k] || 0, bootT) < ROT_AFTER()) continue;
      const k2 = await dirLookup(o.un.toLowerCase()); if (k2 && k2 !== k && k2 !== ME.key && !S.c[k2] && !S.block[k2]) { rot[k] = k2; list(); if (cur === k) showRot(); toast('@' + o.un + ' ⚠'); }
    }
    for (const [k, q] of Object.entries(S.out)) { // a pending request whose target changed key
      if (Date.now() - Math.max(act[k] || 0, seen[k] || 0, q.ts || 0, bootT) < ROT_AFTER()) continue;
      const k2 = await dirLookup(q.un.toLowerCase()); if (k2 && k2 !== k && k2 !== ME.key && !S.out[k2] && !S.c[k2]) { S.out[k2] = q; delete S.out[k]; save(); connect(k2); list(); }
    }
  }
  function showRot() { const b = $('#rotb'), k2 = cur && S.c[cur] && rot[cur]; b.hidden = !k2; if (k2) $('#rott').textContent = t('rotMsg').replace('{u}', S.c[cur].un || ''); }
  async function acceptRot(k) {
    const k2 = rot[k], o = S.c[k]; if (!k2 || !o) return;
    try { conns[k] && conns[k].close(); } catch (e) {} await DB.rekeyChat(k, k2); const n = Object.assign({}, o); delete n.pk; n.rq = 1; S.c[k2] = n; delete S.c[k]; delete S.pins[k]; delete rot[k]; delete M[k]; delete conns[k];
    if (cur === k) { cur = k2; M[k2] = await DB.chatMsgs(k2); } save(); connect(k2); list(); if (cur === k2) { drawHead(); draw(1); showRot(); }
  }
  $('#rota').onclick = () => acceptRot(cur);
  // ---------- permanent username (chosen once) ----------
  const userPending = () => $('#p-un').classList.contains('on') && !ME.user;
  function askUser() { $('#uni').value = ''; $('#une').textContent = ''; $('#unok').disabled = false; sheet('un'); }
  $('#unok').onclick = async () => {
    const u = $('#uni').value.trim().replace(/^@/, ''); if (!USERRE.test(u)) return $('#une').textContent = t('userBad');
    if (!confirm(t('onbConfirm') + ' @' + u + '؟')) return;
    $('#unok').disabled = true; $('#une').textContent = t('searching'); const r = await claimUsername(u); $('#unok').disabled = false;
    if (r === false) return $('#une').textContent = t('userTaken');
    ME.user = u; await DB.set('me', ME); if (r === 'net') toast(t('userPending')); sheet(0); broadcastProfile(); drawMine(); list();
  };

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
    if ($('#pg-grp').classList.contains('on')) fillGroup();
    wantAssets(); pruneGa();
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
  // ---------- group page: cover + framed photo, tool row, members | description + animated picture ----------
  const DEF_GCOVER = svgUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a0716"/><stop offset="1" stop-color="#2a1856"/></linearGradient></defs><rect width="800" height="400" fill="url(#g)"/><g fill="#e9c46a" opacity=".8"><circle cx="70" cy="60" r="2.5"/><circle cx="210" cy="320" r="2"/><circle cx="640" cy="70" r="3"/><circle cx="730" cy="260" r="2"/><circle cx="450" cy="40" r="2"/></g><circle cx="700" cy="330" r="90" fill="#8b5cf6" opacity=".2"/></svg>');
  const GMAX = { cv: 60000, gf: 450000 };
  const okAsset = (kind, d) => typeof d === 'string' && d.length <= GMAX[kind] && (kind === 'cv' ? /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/ : /^data:image\/(gif|webp);base64,[A-Za-z0-9+/=]+$/).test(d);
  function wantAssets() { // ask online members for group pictures we do not have yet (they are verified against their hash)
    Object.values(S.g).forEach(g => [g.cvh, g.gfh].forEach(h => { if (h && !S.ga[h]) Object.keys(g.mem).forEach(k => { if (k !== ME.key && on(k)) sealTo(conns[k], { t: 'gar', h }); }); }));
  }
  function pruneGa() { const keep = new Set(); Object.values(S.g).forEach(g => { if (g.cvh) keep.add(g.cvh); if (g.gfh) keep.add(g.gfh); (g.pend || []).forEach(op => op.h && keep.add(op.h)); }); Object.keys(S.ga).forEach(h => { if (!keep.has(h)) delete S.ga[h]; }); }
  function fillGroup() {
    const g = cur && S.g[cur]; if (!g) return; const me = ME.key, add = !g.left && SG.can(g, me, 'add');
    $('#gcov').style.backgroundImage = 'url("' + (g.cvh && S.ga[g.cvh] ? S.ga[g.cvh] : DEF_GCOVER) + '")'; bigAv($('#gpav'), g.av, g.fc);
    $('#gpn').textContent = g.name; $('#gdt').textContent = g.ds || '......';
    const gf = $('#ggif'); if (g.gfh && S.ga[g.gfh]) { gf.style.backgroundImage = 'url("' + S.ga[g.gfh] + '")'; gf.textContent = ''; } else { gf.style.backgroundImage = ''; gf.textContent = t('gGifNone'); }
    $('#tbinv').hidden = !add;
    const L = $('#gml'); L.innerHTML = '';
    Object.keys(g.mem).sort((a, b) => ROLE_ORD[SG.role(g, a)] - ROLE_ORD[SG.role(g, b)]).forEach(k => {
      const r = document.createElement('div'); r.className = 'gmr'; r.innerHTML = '<div class="av"></div><div class="mid"><b></b><span></span></div><div class="own"></div>';
      const o = S.c[k]; avStyle(r.children[0], o && o.av, (nmOf(cur, k) || '?')[0]);
      r.querySelector('b').textContent = nmOf(cur, k) + (k === me ? ' (' + t('me') + ')' : ''); r.querySelector('.mid span').textContent = (g.titles && g.titles[k]) || (o && o.un ? '@' + o.un : '');
      const rl = SG.role(g, k), ow = r.querySelector('.own');
      if (rl === 'm') ow.remove(); else { ow.innerHTML = '<span></span><svg class="ic"><use href="#i-star8"/></svg>'; ow.firstChild.textContent = rl === 'o' ? t('ownerBadge') : t('assistant'); }
      r.onclick = () => { if (g.owner === me && k !== me && !g.left) memberMenu(k); else if (S.c[k]) openProfileView(k); };
      L.append(r);
    });
  }
  function openGroupInfo(refreshOnly) { fillGroup(); if (!refreshOnly) showPage('grp'); }
  async function groupSetAsset(kind, d) { const h = await C.sha32(d); S.ga[h] = d; save(); if (S.g[cur]) await groupAct(cur, { a: kind, h, d }); }
  $('#gfile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const u = await cropImage(f, AVO); if (u) await groupAct(cur, { a: 'av', v: u }); } catch (x) { alert(t('tooBig')); } };
  $('#gcvfile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const u = await cropImage(f, COVO); if (u) await groupSetAsset('cv', u); } catch (x) { alert(t('tooBig')); } };
  $('#gifile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const d = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }); if (!okAsset('gf', d)) return alert(t('gifBig')); await groupSetAsset('gf', d);
  };
  function groupSettings() {
    const id = cur, g = S.g[id]; if (!g) return; const info = !g.left && SG.can(g, ME.key, 'info'), L = $('#actl'); L.innerHTML = '';
    const add = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { sheet(0); setTimeout(fn, 30); }; L.append(b); };
    if (info) {
      add('📷 ' + t('gsPhoto'), () => $('#gfile').click()); add('🎞 ' + t('gsGif'), () => $('#gifile').click());
      add('📝 ' + t('gsDesc'), () => editText(t('gsDesc'), g.ds || '', 300, true, v => groupAct(id, { a: 'ds', v })));
      add('🎨 ' + t('gsFrame'), () => colorSheet(g.fc, c => groupAct(id, { a: 'fc', v: c }))); add('🖼 ' + t('gsCover'), () => $('#gcvfile').click());
      add('✏️ ' + t('gsName'), () => editText(t('gsName'), g.name, 40, false, v => v && groupAct(id, { a: 'name', v })));
      if (g.gfh) add('🗑 ' + t('gsRmGif'), () => groupAct(id, { a: 'gf', h: '' })); if (g.cvh) add('🗑 ' + t('gsRmCover'), () => groupAct(id, { a: 'cv', h: '' }));
    }
    add('🚪 ' + (g.left ? t('delChat') : t('leaveGroup')), async () => {
      if (!confirm(t(g.left ? 'delChat' : 'confirmLeave'))) return;
      if (!g.left && g.owner && g.owner !== ME.key && on(g.owner)) await sealTo(conns[g.owner], { t: 'gop', g: id, op: { a: 'leave' } });
      await DB.delChat(id); delete S.g[id]; delete M[id]; save(); while (pgStack.length) closePage(); back();
    });
    add(t('cancelAct'), () => {}); sheet('act');
  }
  function openAdmins() {
    const g = S.g[cur]; if (!g) return; const owner = g.owner === ME.key, L = $('#gadl'); L.innerHTML = '';
    Object.keys(g.mem).filter(k => SG.role(g, k) !== 'm').sort((a, b) => ROLE_ORD[SG.role(g, a)] - ROLE_ORD[SG.role(g, b)]).forEach(k => {
      const r = document.createElement('div'); r.className = 'gmr'; r.innerHTML = '<div class="av"></div><div class="mid"><b></b><span></span></div><div class="own"><span></span><svg class="ic"><use href="#i-star8"/></svg></div>';
      const o = S.c[k]; avStyle(r.children[0], o && o.av, (nmOf(cur, k) || '?')[0]); r.querySelector('b').textContent = nmOf(cur, k); r.querySelector('.mid span').textContent = (g.titles && g.titles[k]) || '';
      r.querySelector('.own span').textContent = SG.role(g, k) === 'o' ? t('ownerBadge') : t('assistant'); L.append(r);
    });
    const P = $('#gadp'); P.innerHTML = '';
    SG.PERMS.forEach(p => { const on_ = !!(g.pd || SG.MEMBER_DEFAULT)[p], b = document.createElement('button'); b.className = 'tg'; b.textContent = (on_ ? '✅ ' : '⬜ ') + t(PERM_LBL[p]); if (owner) b.onclick = async () => { await groupAct(cur, { a: 'pd', p, v: !on_ }); openAdmins(); }; else b.style.opacity = '.6'; P.append(b); });
    $('#gadn').textContent = owner ? '' : t('admNote'); sheet('gadm');
  }
  function memberMenu(k) {
    const id = cur, g = S.g[id]; if (!g || !g.mem[k]) return sheet(0); const L = $('#actl'); L.innerHTML = '';
    const add = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; L.append(b); };
    const again = async op => { await groupAct(id, op); memberMenu(k); };
    add('← ' + nmOf(id, k), () => sheet(0)); if (S.c[k]) add('👤 ' + t('viewProfile'), () => { sheet(0); openProfileView(k); });
    add('🏷 ' + t('setTitle') + ': ' + ((g.titles && g.titles[k]) || '—'), () => { const v = dialog(t('titleAsk'), (g.titles && g.titles[k]) || ''); if (v !== null) again({ a: 'title', k, v }); });
    add(g.roles[k] === 'a' ? '⭐ ' + t('demote') : '⭐ ' + t('promote'), () => again({ a: 'role', k, v: g.roles[k] === 'a' ? '' : 'a' }));
    SG.PERMS.forEach(p => { const eff = SG.can(g, k, p); add((eff ? '✅ ' : '⬜ ') + t(PERM_LBL[p]), () => again({ a: 'perm', k, p, v: !eff })); });
    add('🚫 ' + t('removeMember'), async () => { if (confirm(t('confirmRemove'))) { await groupAct(id, { a: 'rm', k }); sheet(0); } });
    sheet('act');
  }
  $('#tbinv').onclick = () => {
    const g = S.g[cur], L = $('#gal'); L.innerHTML = ''; const cand = Object.entries(S.c).filter(([k]) => !g.mem[k]); if (!cand.length) L.innerHTML = '<p>' + t('noMembersToAdd') + '</p>';
    cand.forEach(([k, o]) => { const d = document.createElement('label'); d.className = 'chk'; d.innerHTML = '<input type="checkbox" value="' + k + '"><span></span>'; d.lastChild.textContent = o.name; L.append(d); }); sheet('ga');
  };
  $('#gac').onclick = async () => { const ks = [...$$('#gal input:checked')].map(i => i.value); for (const k of ks) await groupAct(cur, { a: 'add', k, n: S.c[k].name }); sheet(0); fillGroup(); };
  $('#tbst').onclick = () => showPage('st'); $('#tbme').onclick = () => showPage('gmedia'); $('#tbad').onclick = openAdmins; $('#tbset').onclick = groupSettings;
  $('#tbse').onclick = () => { $('#gsq').value = ''; $('#gsr').innerHTML = ''; $('#gsq').placeholder = t('gSearchPh'); showPage('gsearch'); setTimeout(() => $('#gsq').focus(), 320); };
  function jumpTo(mid) { setTimeout(() => { const b = document.querySelector('#ms .b[data-mid="' + mid + '"]'); if (b) { b.scrollIntoView({ block: 'center' }); b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 1700); } }, 380); }
  $('#gsq').oninput = async e => {
    const q = e.target.value.trim().toLowerCase(), L = $('#gsr'); L.innerHTML = ''; if (!q) return;
    const ms = (await DB.chatMsgs(cur)).filter(m => m.kind === 't' && !m.del && (m.x || '').toLowerCase().includes(q)).reverse().slice(0, 100);
    if (!ms.length) { L.innerHTML = '<div class="empty">' + t('gSearchNone') + '</div>'; return; }
    ms.forEach(m => { const r = document.createElement('div'); r.className = 'dlr'; r.innerHTML = '<div class="mid"><b></b><span></span></div>'; r.querySelector('b').textContent = nmOf(cur, m.f) + ' · ' + new Date(m.ts).toLocaleString(I18N.lang); const sp = r.querySelector('.mid span'); sp.textContent = m.x; sp.style.whiteSpace = 'normal'; r.onclick = () => { while (pgStack.length) closePage(); jumpTo(m.mid); }; L.append(r); });
  };
  // chat header menu
  $('#bk').onclick = back;
  $('#chh').onclick = () => isG(cur) ? openGroupInfo() : openContactInfo();
  $('#bm').onclick = () => {
    const L = $('#actl'); L.innerHTML = ''; const add = (l, f) => { const b = document.createElement('button'); b.textContent = l; b.onclick = () => { sheet(0); f(); }; L.append(b); };
    add(isG(cur) ? 'ℹ️ ' + t('groupInfo') : '🔐 ' + t('contactInfo'), () => isG(cur) ? openGroupInfo() : openContactInfo());
    if (!isG(cur)) add('⛔ ' + t('block'), () => { if (!confirm(t('confirmBlock'))) return; S.block[cur] = 1; try { conns[cur] && conns[cur].close(); } catch (e) {} save(); toast(t('cleared')); });
    add('🗑 ' + t('delChat'), async () => { if (!confirm(t('delChat'))) return; await DB.delChat(cur); delete S.c[cur]; delete S.g[cur]; delete M[cur]; save(); back(); });
    add('⏳ ' + t('ttlTitle') + ' · ' + ttlLabel(ch(cur).ttl), () => openTtl());
    add(t('cancelAct'), () => {}); sheet('act');
  };
  function openContactInfo() { openProfileView(cur); }
  $('#srt').onclick = () => { const o = S.c[viewKey]; if (o) { delete o.pk; save(); warn(0); fillView(viewKey); } };

  // composer
  $('#t').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && S.set.enter) { e.preventDefault(); $('#bs').click(); } });
  $('#bs').onclick = () => { const x = $('#t').value.trim(); if (!x) return; sendMsg({ kind: 't', x }); $('#t').value = ''; $('#t').style.height = ''; };
  $('#t').oninput = e => {
    e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px';
    if (S.set.notyp || !cur || !e.target.value.trim()) return; const now = Date.now();
    if (F.shouldSendTyping(typSent[cur], now)) { typSent[cur] = now; sendCtl(cur, { t: 'typ' }); }
  };
  // ---------- self-destruct timer, forwarding ----------
  const TTLK = { 0: 'ttlOff', 10: 'ttl10', 60: 'ttl60', 3600: 'ttl1h', 86400: 'ttl1d', 604800: 'ttl7d' };
  const ttlLabel = v => t(TTLK[F.validTtl(v)] || 'ttlOff');
  function openTtl() {
    const L = $('#ttll'); L.innerHTML = '';
    F.TTLS.forEach(v => { const b = document.createElement('button'); b.textContent = (F.validTtl(ch(cur).ttl) === v ? '✅ ' : '') + ttlLabel(v); b.onclick = () => { ch(cur).ttl = v; save(); sheet(0); toast(v ? t('ttlSetTo') + ttlLabel(v) : t('ttlOffToast')); }; L.append(b); });
    sheet('ttl');
  }
  function openForward(m) {
    const L = $('#fwl'); L.innerHTML = ''; fwMsg = m;
    [...Object.entries(S.c), ...Object.entries(S.g).filter(([, g]) => !g.left)].forEach(([id, o]) => { const d = document.createElement('label'); d.className = 'chk'; d.innerHTML = '<input type="checkbox"><span></span>'; d.firstChild.value = id; d.lastChild.textContent = (isG(id) ? '👥 ' : '') + o.name; L.append(d); });
    sheet('fw');
  }
  $('#fwok').onclick = async () => {
    const ids = [...$$('#fwl input:checked')].map(i => i.value); if (!ids.length) return toast(t('fwNone'));
    const m = fwMsg; if (!m) return; sheet(0);
    for (const id of ids) {
      const o = { kind: m.kind, fw: F.fwName(m.fw || (m.me ? ME.name : nmOf(m.chat, m.f))) };
      if (m.kind === 't') o.x = m.x; else { if (!m.b) continue; o.b = m.b; o.mime = m.mime; if (m.name) o.name = m.name; if (m.dur) o.dur = m.dur; }
      await sendMsg(o, id, true);
    }
    toast(t('fwDone'));
  };
  $('#ba').onclick = () => sheet('att');
  $('#aimg').onclick = () => $('#fimg').click(); $('#afil').onclick = () => $('#ffil').click();
  async function shrink(file, max = 1280) {
    const bm = await createImageBitmap(file), s = Math.min(1, max / Math.max(bm.width, bm.height)), cv = document.createElement('canvas');
    cv.width = Math.round(bm.width * s); cv.height = Math.round(bm.height * s); cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height);
    return new Promise(r => cv.toBlob(r, 'image/jpeg', .82));
  }
  $('#fimg').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; sheet(0); if (!f) return; try { const b = await shrink(f); if (b.size > MAXB) return alert(t('tooBig')); sendMsg({ kind: 'img', b, mime: 'image/jpeg' }); } catch (x) { alert(t('tooBig')); } };
  $('#ffil').onchange = e => { const f = e.target.files[0]; e.target.value = ''; sheet(0); if (!f) return; if (f.size > MAXB) return alert(t('tooBig')); sendMsg({ kind: 'file', b: f, mime: 'application/octet-stream', name: f.name }); };
  // voice message: hold the mic to record, drag sideways to cancel, drag up to lock, release to send
  let vr = null, vDown = false, vX = 0, vY = 0;
  const SLIDE = 90, UP = 70, bv = $('#bv'), rb2 = $('#rbar2');
  const vSign = () => I18N.lang === 'ar' ? 1 : -1; // direction of "start" along x (RTL: right)
  function vUi(on_) { $('.bar').classList.toggle('recing', on_); rb2.classList.toggle('on', on_); $('#rlock').classList.toggle('on', on_ && !(vr && vr.locked)); bv.classList.toggle('holding', on_ && !(vr && vr.locked)); if (!on_) { bv.style.transform = ''; rb2.classList.remove('lk'); $('#rcan').hidden = $('#rsend').hidden = true; $('#rh').style.display = ''; bv.classList.remove('hide'); $('#rlock').classList.remove('hot'); } }
  async function vStart(e) {
    if (vr || !window.MediaRecorder) return; vDown = true; vX = e.clientX; vY = e.clientY; vr = { pending: true, locked: false }; const me = vr;
    try { bv.setPointerCapture(e.pointerId); } catch (x) {} document.documentElement.style.setProperty('--sd', vSign()); vUi(true); try { navigator.vibrate && navigator.vibrate(12); } catch (x) {}
    let s; try { s = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (x) { vr = null; vUi(false); return alert(t('noMic')); }
    if (vr !== me || (!vDown && !me.locked)) { s.getTracks().forEach(x => x.stop()); if (vr === me) { vr = null; vUi(false); toast(t('recHold')); } return; } // released (or interrupted by the permission dialog) before the mic was ready
    const mt = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(x => MediaRecorder.isTypeSupported(x)), r = new MediaRecorder(s, mt ? { mimeType: mt } : {}), chunks = [];
    Object.assign(me, { r, s, chunks, t0: Date.now(), pending: false, mime: (mt || 'audio/webm').split(';')[0] });
    r.ondataavailable = ev => ev.data.size && chunks.push(ev.data);
    r.onstop = () => {
      s.getTracks().forEach(x => x.stop()); clearInterval(me.iv); const dur = (Date.now() - me.t0) / 1000, b = new Blob(chunks, { type: (r.mimeType || me.mime).split(';')[0] });
      if (me.send && dur >= .6 && b.size) { if (b.size > MAXB) alert(t('tooBig')); else sendMsg({ kind: 'vo', b, mime: b.type, dur: Math.round(dur) }); } else if (me.send && dur < .6) toast(t('recHold'));
    };
    r.start(); me.iv = setInterval(() => { $('#rtm').textContent = fmtT(Date.now() - me.t0).replace(/^00:/, '0:'); }, 200); $('#rtm').textContent = '0:00';
    if (me.stop) vFinish(me.send, true); // released while the recorder was starting
  }
  function vFinish(send, quiet) {
    const me = vr; if (!me) return; me.send = send; if (me.pending) { me.stop = true; if (!send) { vr = null; vUi(false); } return; }
    vr = null; try { me.r.stop(); } catch (x) {} const cls = send ? 'sent' : 'shake'; if (!send) rb2.classList.add('drop'); rb2.classList.add(cls);
    setTimeout(() => { rb2.classList.remove(cls, 'drop'); vUi(false); }, send ? 220 : 340);
  }
  bv.onpointerdown = e => { e.preventDefault(); vStart(e); };
  bv.onpointermove = e => {
    if (!vr || !vDown || vr.locked) return; const dx = (e.clientX - vX) * vSign(), dy = vY - e.clientY, sl = Math.max(0, dx), up = Math.max(0, dy);
    bv.style.transform = 'translate(' + (sl * vSign()) + 'px,' + (-Math.min(up, UP + 10)) + 'px) scale(1.5)'; $('#rh').style.opacity = Math.max(0, 1 - sl / SLIDE); $('#rlock').classList.toggle('hot', up > UP * .6);
    if (sl > SLIDE) { vDown = false; vFinish(false); }
    else if (up > UP && !vr.pending) { vr.locked = true; rb2.classList.add('lk'); $('#rh').style.display = 'none'; $('#rcan').hidden = $('#rsend').hidden = false; bv.classList.add('hide'); bv.classList.remove('holding'); bv.style.transform = ''; $('#rlock').classList.remove('on'); }
  };
  bv.onpointerup = bv.onpointercancel = () => { if (!vDown) return; vDown = false; if (vr && !vr.locked) vFinish(true); };
  $('#rcan').onclick = () => vFinish(false); $('#rsend').onclick = () => vFinish(true);

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
  let callTick = null;
  const fmtT = ms => { const s = Math.floor(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  function callUi() { if (!call) return; const x = call.t0 ? fmtT(Date.now() - call.t0) : t('calling'); $('#cst').textContent = call.t0 ? x : t('calling'); $('#cmt').textContent = x; }
  function miniVid() { const rs = $('#rv').srcObject, has = !!(rs && rs.getVideoTracks && rs.getVideoTracks().length); $('#cmv').srcObject = has ? rs : null; $('#cmv').classList.toggle('on', has && $('#call').classList.contains('min')); }
  function minimizeCall() { if (!call) return; $('#call').classList.add('min'); $('#cmini').classList.add('on'); $('#app').classList.add('incall'); miniVid(); }
  function restoreCall() { $('#call').classList.remove('min'); $('#cmini').classList.remove('on'); $('#app').classList.remove('incall'); $('#cmv').classList.remove('on'); }
  const callName = k => S.g[k] ? S.g[k].name : nmOf(k, k);
  function showCall(k, status) { $('#cnm').textContent = callName(k); $('#cmn').textContent = callName(k); $('#cst').textContent = status || ''; $('#cmt').textContent = status || ''; restoreCall(); $('#call').classList.toggle('grp', !!(call && call.group)); $('#ccam').hidden = $('#cshr').hidden = !(call && call.video); $('#crec').hidden = !!(call && call.group); $('#call').classList.add('on'); }
  function setupCall(cl, k, stream, video) {
    call = { cl, stream, k, video: !!video }; showCall(k, t('calling'));
    $('#lv').srcObject = stream; $('#lv').classList.toggle('v1', !!video);
    cl.on('stream', rs => { $('#rv').srcObject = rs; $('#rv').classList.toggle('v1', rs.getVideoTracks().length > 0); if (call && !call.t0) call.t0 = Date.now(); clearInterval(callTick); callTick = setInterval(callUi, 1000); callUi(); miniVid(); });
    cl.on('close', endCall); cl.on('error', () => { $('#cst').textContent = t('callFail'); setTimeout(endCall, 1200); });
  }
  function endCall() {
    if (!call) return; stopRec(); stopShare(); const c = call; call = null; clearInterval(callTick); restoreCall(); $('#cmu').textContent = '🎙'; $('#cmmu').classList.remove('off'); $('#ccam').classList.remove('off'); $('#cmv').srcObject = null; $('#recn').classList.remove('on');
    try { c.cl && c.cl.close(); } catch (e) {} Object.values(c.parts || {}).forEach(p => { try { p.cl.close(); } catch (e) {} }); c.stream.getTracks().forEach(x => x.stop());
    $('#gtiles').innerHTML = ''; $('#call').classList.remove('on', 'grp'); $('#rv').srcObject = $('#lv').srcObject = null; $('#rv').classList.remove('v1'); $('#lv').classList.remove('v1');
  }
  async function startCall(video) {
    if (!cur || isG(cur) || call) return; if (!on(cur)) return alert(t('callNeedOnline'));
    try { const s = await media(video); setupCall(peer.call('shilagram-' + cur, s, { metadata: { video } }), cur, s, video); } catch (e) { alert(t('noMic')); }
  }
  $('#bc1').onclick = () => isG(cur) ? startGroupCall(false) : startCall(false); $('#bc2').onclick = () => isG(cur) ? startGroupCall(true) : startCall(true); $('#cen').onclick = endCall;
  function toggleMute() { if (!call) return; const tr = call.stream.getAudioTracks()[0]; if (tr) { tr.enabled = !tr.enabled; $('#cmu').textContent = tr.enabled ? '🎙' : '🔇'; $('#cmmu').classList.toggle('off', !tr.enabled); } }
  $('#cmu').onclick = $('#cmmu').onclick = toggleMute; $('#cmin').onclick = minimizeCall; $('#cmm').onclick = $('#cmv').onclick = restoreCall; $('#cme').onclick = endCall;
  function onIncomingCall(cl) {
    if (cl.metadata && cl.metadata.g) { // a member of a group call we are in
      const g = S.g[cl.metadata.g], k = peerKey(cl.peer);
      if (call && call.group === cl.metadata.g && g && g.mem[k] && !call.parts[k]) { cl.answer(call.stream); wirePart(k, cl); } else try { cl.close(); } catch (e) {} return;
    }
    const k = peerKey(cl.peer);
    if (!S.c[k] || !on(k) || call || pendingCall) { try { cl.close(); } catch (e) {} return; } // only authenticated friends may ring us
    pendingCall = cl; const video = !!(cl.metadata && cl.metadata.video);
    $('#inct').textContent = t('incoming') + nmOf(k, k); sheet('inc'); notify(t('incoming') + nmOf(k, k), '', '-');
    cl.on('close', () => { if (pendingCall === cl) { pendingCall = null; sheet(0); } });
    $('#inca').onclick = async () => { pendingCall = null; sheet(0); try { const s = await media(video); cl.answer(s); setupCall(cl, k, s, video); } catch (e) { cl.close(); alert(t('noMic')); } };
    $('#incd').onclick = () => { pendingCall = null; sheet(0); cl.close(); };
  }

  // ---------- username directory: a 2nd PeerJS id "shilagram-u-<name>" answers lookups with our key (first come, first served while online) ----------
  let dirPeer = null, dirName = null, dirBusy = false, dirFails = 0;
  function attachDir(p) {
    p.on('connection', c => c.on('open', () => { try { c.send({ t: 'ans', k: ME.key }); } catch (e) {} setTimeout(() => { try { c.close(); } catch (e) {} }, 2000); }));
    p.on('disconnected', () => setTimeout(() => { try { if (!p.destroyed) p.reconnect(); } catch (e) {} }, 2000));
    const dead = () => { if (dirPeer === p) { dirPeer = null; dirName = null; } try { p.destroy(); } catch (e) {} }; // ensureDir() recreates it
    p.on('error', e => { if (e.type !== 'peer-unavailable') dead(); }); p.on('close', dead);
  }
  function stopDir() { if (dirPeer) try { dirPeer.destroy(); } catch (e) {} dirPeer = null; dirName = null; }
  function claimUsername(u) {
    return new Promise(res => {
      if (!u) { stopDir(); return res(true); }
      const un = u.toLowerCase(); if (dirPeer && dirName === un && !dirPeer.destroyed && !dirPeer.disconnected) return res(true);
      let p; try { p = new Peer('shilagram-u-' + un, { config: { iceServers: iceServers() } }); } catch (e) { return res('net'); }
      let fin = 0; const end = v => { if (fin) return; fin = 1; clearTimeout(to); if (v === true) { stopDir(); dirPeer = p; dirName = un; attachDir(p); } else try { p.destroy(); } catch (e) {} res(v); };
      const to = setTimeout(() => end('net'), 9000);
      p.on('open', () => end(true)); p.on('error', e => end(e.type === 'unavailable-id' ? false : 'net'));
    });
  }
  function ensureDir() { // keep our @username registered: reconnect or re-create after any failure (also retries while a ghost of a previous session expires)
    if (!ME.user || dirBusy || !peer || peer.disconnected) return;
    if (dirPeer && !dirPeer.destroyed) { if (dirPeer.disconnected) try { dirPeer.reconnect(); } catch (e) {} return; }
    dirBusy = true; claimUsername(ME.user).then(r => { dirBusy = false; if (r === false) { if (++dirFails === 15) warn(t('userLost')); } else if (r === true) { if (dirFails >= 15) warn(0); dirFails = 0; } });
  }

  // ---------- group calls: a mesh of media calls; whoever joins is called by everybody already in ----------
  let pendingGroup = null, recnT2;
  function flashNotice(text, ms) { const n = $('#recn'); n.textContent = text; n.classList.add('on'); clearTimeout(recnT); recnT = setTimeout(() => n.classList.remove('on'), ms); }
  function addTile(k, stream, local) {
    const id = 'tile-' + (local ? 'me' : k); let el = document.getElementById(id);
    if (!el) { el = document.createElement('div'); el.className = 'tile'; el.id = id; el.innerHTML = '<div class="ph"></div><video autoplay playsinline></video><span></span>'; $('#gtiles').append(el); }
    const v = el.querySelector('video'), nm = local ? ME.name : nmOf(call.group, k); v.muted = !!local; v.srcObject = stream; el.querySelector('span').textContent = local ? t('me') : nm;
    el.querySelector('.ph').textContent = (nm || '?')[0]; el.classList.toggle('nov', !stream.getVideoTracks().length);
  }
  function wirePart(k, cl) {
    call.parts[k] = { cl };
    cl.on('stream', rs => { if (!call) return; addTile(k, rs); if (!call.t0) call.t0 = Date.now(); clearInterval(callTick); callTick = setInterval(callUi, 1000); callUi(); if (call.sharing) replaceVideoTrack(call.sharing.track); });
    const gone = () => { const e = document.getElementById('tile-' + k); if (e) e.remove(); if (call && call.parts[k] && call.parts[k].cl === cl) delete call.parts[k]; };
    cl.on('close', gone); cl.on('error', gone);
  }
  function callPart(k) {
    if (!call || !peer || call.parts[k]) return; if (Object.keys(call.parts).length >= 5) return toast(t('gcFull'));
    try { wirePart(k, peer.call('shilagram-' + k, call.stream, { metadata: { g: call.group, video: call.video } })); } catch (e) {}
  }
  async function startGroupCall(video) {
    const g = S.g[cur]; if (!g || g.left || call) return; let s; try { s = await media(video); } catch (e) { return alert(t('noMic')); }
    call = { group: cur, k: cur, video: !!video, stream: s, parts: {} }; showCall(cur, t('gcWait')); addTile(ME.key, s, true);
    members(cur).forEach(k => on(k) && sealTo(conns[k], { t: 'gci', g: cur, v: video ? 1 : 0 }));
  }
  function onGroupInvite(k, h) {
    const g = S.g[h.g]; if (!g || !g.mem[k] || g.left || call || pendingCall || pendingGroup) return;
    const inv = pendingGroup = { g: h.g, video: !!h.v }; $('#inct').textContent = t('gInviteCall') + ' ' + g.name + ' — ' + nmOf(h.g, k) + (h.v ? ' 🎥' : ' 🎤'); sheet('inc'); pendingGroup = inv;
    notify(t('gInviteCall') + ' ' + g.name, nmOf(h.g, k), '-');
    $('#inca').onclick = () => joinGroupCall(inv); $('#incd').onclick = () => sheet(0);
  }
  async function joinGroupCall(inv) {
    sheet(0); if (call || !S.g[inv.g]) return; let s; try { s = await media(inv.video); } catch (e) { return alert(t('noMic')); }
    call = { group: inv.g, k: inv.g, video: inv.video, stream: s, parts: {} }; showCall(inv.g, t('gcWait')); addTile(ME.key, s, true);
    members(inv.g).forEach(k => on(k) && sealTo(conns[k], { t: 'gcj', g: inv.g }));
  }
  // ---------- camera toggle + screen sharing (video calls) ----------
  function toggleCam() {
    if (!call) return; const trs = call.stream.getVideoTracks(); if (!trs.length) return; const on_ = !trs[0].enabled; trs.forEach(x => x.enabled = on_); $('#ccam').classList.toggle('off', !on_);
    const el = document.getElementById('tile-me'); if (el) el.classList.toggle('nov', !on_);
  }
  const shareTargets = () => call.group ? Object.values(call.parts).map(p => p.cl) : [call.cl];
  function replaceVideoTrack(tr) { shareTargets().forEach(cl => { const pc = cl && cl.peerConnection; if (!pc) return; const sd = pc.getSenders().find(x => x.track && x.track.kind === 'video'); if (sd) sd.replaceTrack(tr).catch(() => {}); }); }
  function notifyShare(on_) { (call.group ? members(call.group) : [call.k]).forEach(k => on(k) && sealTo(conns[k], { t: 'shr', on: on_ ? 1 : 0 })); }
  function nativeShare() { // WebView cannot capture the screen: the app forwards JPEG frames of the screen, drawn on a canvas that becomes the video track
    const cv = document.createElement('canvas'), cx = cv.getContext('2d'), img = new Image(); let busy = false; cv.width = 360; cv.height = 640; cx.fillStyle = '#000'; cx.fillRect(0, 0, 360, 640);
    window.__screenFrame = b64 => { if (busy) return; busy = true; img.onload = () => { if (cv.width !== img.naturalWidth) { cv.width = img.naturalWidth; cv.height = img.naturalHeight; } cx.drawImage(img, 0, 0); busy = false; }; img.onerror = () => { busy = false; }; img.src = 'data:image/jpeg;base64,' + b64; };
    const tr = cv.captureStream(8).getVideoTracks()[0]; NATIVE.startScreenShare(); return { track: tr, stop: () => { try { NATIVE.stopScreenShare(); } catch (e) {} window.__screenFrame = null; } };
  }
  async function startShare() {
    if (!call || !call.video || call.sharing) return; let track, stop;
    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) { try { const ds = await navigator.mediaDevices.getDisplayMedia({ video: true }); track = ds.getVideoTracks()[0]; stop = () => ds.getTracks().forEach(x => x.stop()); track.onended = () => stopShare(); } catch (e) {} }
    if (!track && NATIVE && NATIVE.startScreenShare) { const n = nativeShare(); track = n.track; stop = n.stop; window.__screenStopped = () => stopShare(); }
    if (!track) return toast(t('shareNA'));
    call.sharing = { track, stop }; replaceVideoTrack(track); $('#cshr').classList.add('on'); notifyShare(true);
    const pv = new MediaStream([track]); if (call.group) addTile(ME.key, pv, true); else $('#lv').srcObject = pv;
  }
  function stopShare() {
    if (!call || !call.sharing) return; const sh = call.sharing; call.sharing = null; const cam = call.stream.getVideoTracks()[0]; if (cam) replaceVideoTrack(cam);
    try { sh.stop(); } catch (e) {} $('#cshr').classList.remove('on'); notifyShare(false);
    if (call.group) addTile(ME.key, call.stream, true); else $('#lv').srcObject = call.stream;
  }
  $('#ccam').onclick = toggleCam; $('#cshr').onclick = () => call && call.sharing ? stopShare() : startShare();

  // ---------- call recording (what you see + both voices), with a notice sent to the other side ----------
  let crec = null, recnT;
  function showRecNotice() { flashNotice(t('recNotice'), 5000); }
  async function toggleRec() {
    if (crec) return stopRec(); if (!call) return;
    if (!on(call.k) || !(await sealTo(conns[call.k], { t: 'rec', on: 1 }))) return alert(t('callFail')); // never record unless the other side was told
    startRec();
  }
  function startRec() {
    const W = 360, H = 640, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d'), rv = $('#rv'), lv = $('#lv'), k = call.k, t0 = Date.now(), hasV = call.video;
    const ac = new (window.AudioContext || window.webkitAudioContext)(), dest = ac.createMediaStreamDestination();
    const addA = s => { if (s && s.getAudioTracks().length) try { ac.createMediaStreamSource(new MediaStream(s.getAudioTracks())).connect(dest); } catch (e) {} };
    addA(rv.srcObject); addA(call.stream);
    const fmt = () => { const s = Math.floor((Date.now() - t0) / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
    const draw = () => {
      x.fillStyle = '#0b1320'; x.fillRect(0, 0, W, H);
      if (rv.videoWidth && rv.srcObject && rv.srcObject.getVideoTracks().length) { const sc = Math.max(W / rv.videoWidth, H / rv.videoHeight), w = rv.videoWidth * sc, h = rv.videoHeight * sc; x.drawImage(rv, (W - w) / 2, (H - h) / 2, w, h); }
      else { x.fillStyle = '#6f5b99'; x.beginPath(); x.arc(W / 2, H / 2 - 40, 70, 0, 7); x.fill(); x.fillStyle = '#fff'; x.font = 'bold 64px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText((nmOf(k, k) || '?')[0], W / 2, H / 2 - 38); }
      if (hasV && lv.videoWidth) x.drawImage(lv, W - 108, 12, 96, 128);
      x.textBaseline = 'alphabetic'; x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = 'bold 20px sans-serif'; x.fillText(nmOf(k, k), W / 2, H - 52); x.font = '16px sans-serif'; x.fillText(fmt(), W / 2, H - 28);
      $('#rect').textContent = '● ' + fmt();
    };
    draw(); const iv = setInterval(draw, 100);
    const stream = new MediaStream([...cv.captureStream(15).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mt = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    const r = new MediaRecorder(stream, mt ? { mimeType: mt, videoBitsPerSecond: 700000, audioBitsPerSecond: 64000 } : {}), chunks = [];
    r.ondataavailable = e => e.data.size && chunks.push(e.data);
    r.onstop = async () => {
      clearInterval(iv); try { ac.close(); } catch (e) {}
      const mime = (r.mimeType || 'video/webm').split(';')[0], b = new Blob(chunks, { type: mime }); if (!b.size) return;
      const id = rid(8), name = 'shilagram-call-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + (mime.includes('mp4') ? '.mp4' : '.webm');
      await DB.set('rec:' + id, b); S.recs.unshift({ id, name, ts: Date.now(), k, size: b.size, mime }); save(); toast(t('recSaved')); shAutoRec(b, name);
    };
    r.start(1000); crec = { r, k }; $('#crec').classList.add('on'); $('#rect').classList.add('on');
  }
  function stopRec() {
    if (!crec) return; const c = crec; crec = null; $('#crec').classList.remove('on'); $('#rect').classList.remove('on');
    try { c.r.stop(); } catch (e) {} if (on(c.k)) sealTo(conns[c.k], { t: 'rec', on: 0 });
  }
  $('#crec').onclick = toggleRec;

  // ---------- Sh-Fill: media folder on the phone + full-screen viewer ----------
  const SH_CATS = [['img', 'shfImg', 'image'], ['vid', 'shfVid', 'video'], ['aud', 'shfAud', 'mic'], ['scr', 'shfScr', 'screen']];
  const SH_MIMEX = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'video/webm': 'webm', 'video/mp4': 'mp4' };
  const SH_IMG = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i, SH_VID = /\.(mp4|webm|mkv|mov|3gp|avi|m4v)$/i, SH_AUD = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|amr)$/i;
  let shCat = 'img', shBusy = 0, shQ = Promise.resolve();
  const shHas = () => !!(NATIVE && NATIVE.shAccess);
  const shOk = () => shHas() && NATIVE.shAccess();
  const shEnq = fn => { const p = shQ.then(fn); shQ = p.catch(() => {}); return p; }; // one write at a time
  const shSrc = (k, n) => '/shfill/' + k + '/' + encodeURIComponent(n);
  const shList = k => { try { return JSON.parse(NATIVE.shList(k) || '[]'); } catch (e) { return []; } };
  function shCatOf(m) { return m.kind === 'img' ? 'img' : m.kind === 'vo' ? 'aud' : m.kind === 'file' ? (SH_IMG.test(m.name || '') ? 'img' : SH_VID.test(m.name || '') ? 'vid' : SH_AUD.test(m.name || '') ? 'aud' : null) : null; }
  function shName(m, chatId) {
    const o = ch(chatId) || {}, d = new Date(m.ts), p = n => String(n).padStart(2, '0');
    if (m.kind === 'file') { const nm = m.name || 'file', dot = nm.lastIndexOf('.'); return (dot > 0 ? nm.slice(0, dot) : nm) + '_' + m.mid + (dot > 0 ? nm.slice(dot) : ''); }
    const ds = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
    return (o.name || 'chat') + '_' + ds + '_' + m.mid + '.' + (SH_MIMEX[m.mime] || (m.kind === 'vo' ? 'webm' : 'jpg'));
  }
  // write a Blob into Sh-Fill/<category>/<name> in 768 KB pieces; resolves to the final name, 'exists', or ''
  async function shPut(k, name, blob) {
    if (!shOk() || !blob || !blob.size) return '';
    const CH = 786432; let fin = '';
    for (let i = 0, first = true; i < blob.size; i += CH, first = false) {
      const r = NATIVE.shWrite(k, name, await blobB64(blob.slice(i, i + CH)), first);
      if (!r) return ''; if (r === 'exists') return 'exists'; fin = r;
    }
    return NATIVE.shDone(k, fin) ? fin : '';
  }
  async function shEnsure() {
    if (!shHas()) { toast(t('shfNoApp')); return false; }
    if (NATIVE.shAccess()) { NATIVE.shInit(); return true; }
    if (confirm(t('shfNeed'))) NATIVE.shRequest();
    return false;
  }
  function shAuto(m, chatId) { try { const k = shCatOf(m); if (S.set.shf && k && m.b && shOk()) shEnq(() => shPut(k, shName(m, chatId), m.b)).catch(() => {}); } catch (e) {} }
  function shAutoRec(b, name) { try { if (S.set.shf && shOk()) shEnq(() => shPut('scr', name, b)).catch(() => {}); } catch (e) {} }
  async function shSync(btn) {
    if (shBusy || !(await shEnsure())) return; shBusy = 1; let n = 0, i = 0; const lbl = btn.textContent;
    try {
      const jobs = (await DB.allMsgs()).filter(m => m.b && !m.del && shCatOf(m)).map(m => [shCatOf(m), shName(m, m.chat), m.b]);
      for (const rc of S.recs) { const b = await DB.get('rec:' + rc.id); if (b) jobs.push(['scr', rc.name, b]); }
      for (const [k, name, b] of jobs) { btn.textContent = '⏳ ' + (++i) + '/' + jobs.length; const r = await shEnq(() => shPut(k, name, b)); if (r && r !== 'exists') n++; }
    } catch (e) {} finally { shBusy = 0; btn.textContent = lbl; }
    toast(t('shfSynced').replace('{n}', n)); if ($('#pg-shf').classList.contains('on')) renderShf();
  }
  function renderShf() {
    const B = $('#shfb'); B.innerHTML = '';
    const box = (cls, pad) => { const d = document.createElement('div'); d.className = cls; if (pad) d.style.padding = pad; B.append(d); return d; }, mk = (cls, txt) => { const b = document.createElement('button'); b.className = cls; b.textContent = txt; return b; };
    if (!shHas()) { box('empty').textContent = t('shfNoApp'); return; }
    const pp = box('pp'), p1 = document.createElement('p'), p2 = document.createElement('p'); p1.textContent = t('shfInfo'); p2.textContent = NATIVE.shRoot() + '/'; p2.style.cssText = 'direction:ltr;text-align:start;font-family:monospace;font-size:12px;opacity:.75'; pp.append(p1, p2);
    const sl = box('sl', '6px 22px');
    if (!NATIVE.shAccess()) { const g = mk('wb', t('shfGrant')); g.onclick = () => NATIVE.shRequest(); sl.append(g); return; }
    NATIVE.shInit();
    const tg = mk('tg', (S.set.shf ? '✅ ' : '⬜ ') + t('shfAuto')); tg.onclick = () => { S.set.shf = S.set.shf ? 0 : 1; save(); renderShf(); };
    const sy = mk('wb', t('shfSync')); sy.onclick = () => shSync(sy); sl.append(tg, sy);
    SH_CATS.forEach(([k, lbl, ic]) => {
      const r = document.createElement('div'); r.className = 'dlr'; r.innerHTML = '<div class="th"><svg class="ic"><use href="#i-' + ic + '"/></svg></div><div class="mid"><b></b><span></span></div>';
      r.querySelector('b').textContent = t(lbl); r.querySelector('.mid span').textContent = shList(k).length + ' ' + t('shfFiles'); r.onclick = () => { shCat = k; showPage('shfc'); }; B.append(r);
    });
  }
  PG_ON.shf = renderShf;
  function renderCat() {
    const k = shCat, L = $('#shfl'); L.innerHTML = ''; $('#shfct').textContent = t(SH_CATS.find(c => c[0] === k)[1]);
    const files = shHas() && NATIVE.shAccess() ? shList(k) : [];
    if (!files.length) { L.innerHTML = '<div class="empty"><svg class="ill"><use href="#ill-empty"/></svg></div>'; L.firstChild.append(t('shfEmpty')); return; }
    const kind = k === 'img' ? 'img' : k === 'aud' ? 'aud' : 'vid';
    const items = files.map(f => ({ kind, src: shSrc(k, f.name), name: f.name, del: async () => NATIVE.shDelete(k, f.name) }));
    if (kind === 'aud') {
      files.forEach((f, i) => { const r = document.createElement('div'); r.className = 'dlr'; r.innerHTML = '<div class="th"><svg class="ic"><use href="#i-mic"/></svg></div><div class="mid"><b></b><span></span></div>';
        r.querySelector('b').textContent = f.name; r.querySelector('.mid span').textContent = Math.ceil(f.size / 1024) + ' KB · ' + new Date(f.ts).toLocaleDateString(I18N.lang); r.onclick = () => vOpen(items, i); L.append(r); });
      return;
    }
    const g = document.createElement('div'); g.className = 'shg'; L.append(g);
    files.forEach((f, i) => {
      const c = document.createElement('div'); c.className = 'c';
      if (kind === 'img') { const im = new Image(); im.loading = 'lazy'; im.decoding = 'async'; im.src = items[i].src; c.append(im); }
      else { const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true; v.playsInline = true; v.src = items[i].src + '#t=0.1'; c.append(v); const pl = document.createElement('span'); pl.className = 'pl'; pl.textContent = '▶'; c.append(pl); }
      c.onclick = () => vOpen(items, i); g.append(c);
    });
  }
  PG_ON.shfc = renderCat;
  $('#shfadd').onclick = async () => { if (!(await shEnsure())) return; const inp = $('#shin'); inp.accept = shCat === 'img' ? 'image/*' : shCat === 'aud' ? 'audio/*' : 'video/*'; inp.click(); };
  $('#shin').onchange = async e => {
    const fs = [...e.target.files]; e.target.value = ''; if (!fs.length) return; let n = 0, i = 0; const k = shCat;
    for (const f of fs) {
      toast(++i + '/' + fs.length); const name = f.name || ('file-' + Date.now());
      let r = await shEnq(() => shPut(k, name, f)); if (r === 'exists') r = await shEnq(() => shPut(k, Date.now().toString(36) + '_' + name, f)); if (r && r !== 'exists') n++;
    }
    toast(t('shfImported').replace('{n}', n)); if ($('#pg-shfc').classList.contains('on')) renderCat();
  };
  window.__shfPerm = () => { if ($('#pg-shf').classList.contains('on')) renderShf(); };

  // full-screen viewer: pinch / double-tap zoom, drag, swipe or arrows between items, native video/audio controls
  const V = { items: [], i: 0, s: 1, x: 0, y: 0, rev: [] }, vPtr = new Map(); let vD0 = 0, vS0 = 1, vSt = null, vTap = 0;
  const vApply = () => { const im = $('#shvi'); if (im) im.style.transform = 'translate(' + V.x + 'px,' + V.y + 'px) scale(' + V.s + ')'; };
  const vDist = () => { const [a, b] = [...vPtr.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  function vShow(i) {
    const it = V.items[V.i = i], st = $('#shvs'); st.innerHTML = ''; V.s = 1; V.x = V.y = 0; vPtr.clear(); vSt = null; let el;
    if (it.kind === 'img') { el = new Image(); el.id = 'shvi'; el.draggable = false; }
    else { el = document.createElement(it.kind === 'vid' ? 'video' : 'audio'); el.controls = true; el.autoplay = true; el.playsInline = true; }
    el.src = it.src; st.append(el);
    $('#shvt').textContent = it.name || ''; $('#shvn').textContent = (i + 1) + '/' + V.items.length;
    $('#shvp').style.display = i > 0 ? '' : 'none'; $('#shvx').style.display = i < V.items.length - 1 ? '' : 'none';
    $('#shvd').style.display = it.del ? '' : 'none'; $('#shva').style.display = it.save ? '' : 'none'; $('#shva').textContent = it.save ? '⬇ ' + t('shfSave') : '';
  }
  function vOpen(items, i, rev) { V.items = items; V.rev = rev || []; $('#shv').classList.add('on'); vShow(i); }
  function vClose() { $('#shv').classList.remove('on'); $('#shvs').innerHTML = ''; V.rev.forEach(u => URL.revokeObjectURL(u)); V.rev = []; V.items = []; }
  const vGo = d => { const n = V.i + d; if (n >= 0 && n < V.items.length) vShow(n); };
  $('#shvc').onclick = vClose; $('#shvp').onclick = () => vGo(-1); $('#shvx').onclick = () => vGo(1);
  $('#shva').onclick = async () => { const it = V.items[V.i]; if (!it || !it.save || !(await shEnsure())) return; const r = await shEnq(() => it.save()); toast(r === 'exists' ? t('shfExists') : r ? t('shfSaved') : '✗'); };
  $('#shvd').onclick = async () => {
    const it = V.items[V.i]; if (!it || !it.del || !confirm(t('shfDel'))) return;
    if (!(await it.del())) return toast('✗'); V.items.splice(V.i, 1);
    if (!V.items.length) vClose(); else vShow(Math.min(V.i, V.items.length - 1));
    if ($('#pg-shfc').classList.contains('on')) renderCat();
  };
  const vStg = $('#shvs');
  vStg.onpointerdown = e => { if (!$('#shvi')) return; vStg.setPointerCapture(e.pointerId); vPtr.set(e.pointerId, { x: e.clientX, y: e.clientY }); vS0 = V.s; if (vPtr.size === 2) vD0 = vDist(); vSt = { x: e.clientX, y: e.clientY, t: Date.now() }; };
  vStg.onpointermove = e => {
    const p = vPtr.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (vPtr.size === 2) V.s = Math.min(6, Math.max(1, vS0 * vDist() / vD0)); else if (V.s > 1) { V.x += dx; V.y += dy; }
    const r = vStg.getBoundingClientRect(), mx = (V.s - 1) * r.width / 2, my = (V.s - 1) * r.height / 2; V.x = Math.min(mx, Math.max(-mx, V.x)); V.y = Math.min(my, Math.max(-my, V.y)); vApply();
  };
  vStg.onpointerup = vStg.onpointercancel = e => {
    if (!vPtr.delete(e.pointerId) || !vSt) return; if (vPtr.size) { vSt = null; return; }
    const dx = e.clientX - vSt.x, dy = e.clientY - vSt.y, dt = Date.now() - vSt.t; vSt = null;
    if (V.s === 1 && Math.abs(dx) > 60 && Math.abs(dy) < 60 && dt < 600) vGo(dx < 0 ? 1 : -1);
    else if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && dt < 300) { if (Date.now() - vTap < 300) { V.s = V.s > 1 ? 1 : 2.5; V.x = V.y = 0; vApply(); vTap = 0; } else vTap = Date.now(); }
  };
  // tapping a photo in a chat opens it full screen (all photos of that chat), with a "save to Sh-Fill" action
  function openChatPhoto(m) {
    const imgs = (M[cur] || []).filter(x => x.kind === 'img' && x.b && !x.del), rev = [], chatId = cur;
    const items = imgs.map(x => { const u = URL.createObjectURL(x.b); rev.push(u); return { kind: 'img', src: u, name: nmOf(chatId, x.f) + ' · ' + new Date(x.ts).toLocaleString(I18N.lang), save: () => shPut('img', shName(x, chatId), x.b) }; });
    vOpen(items, Math.max(0, imgs.indexOf(m)), rev);
  }

  // ---------- app lock ----------
  let padRes = null, padBuf = '', fails = 0, waitUntil = 0, lockedNow = false;
  const padDraw = () => { const d = $('#lkd'); if (d.children.length !== 4) d.innerHTML = '<i></i><i></i><i></i><i></i>'; [...d.children].forEach((e, i) => e.classList.toggle('f', i < padBuf.length)); };
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].forEach(k => { const b = document.createElement('button'); b.textContent = k; if (!k) b.style.visibility = 'hidden'; b.onclick = () => padKey(k); $('#lkp').append(b); });
  function padKey(k) { if (!padRes) return; if (k === '⌫') padBuf = padBuf.slice(0, -1); else if (padBuf.length < 4) padBuf += k; padDraw(); if (padBuf.length === 4) { const v = padBuf, r = padRes; padBuf = ''; padRes = null; setTimeout(padDraw, 120); r(v); } }
  function askPin(title, cancel, err) { return new Promise(res => { $('#lkp').style.display = $('#lkd').style.display = ''; $('#lkw').hidden = true; $('#lkt').textContent = title; $('#lke').textContent = err || ''; padBuf = ''; padDraw(); $('#lkc').hidden = !cancel; $('#lkav').style.display = cancel ? 'none' : ''; avStyle($('#lkav'), ME.av, (ME.name || '?')[0]); padRes = res; $('#lock').classList.add('on'); $('#lkc').onclick = () => { padRes = null; res(null); }; }); }
  const hidePad = () => { padRes = null; pwRes = null; $('#lock').classList.remove('on'); $('#lkp').style.display = $('#lkd').style.display = ''; $('#lkw').hidden = true; };
  // ---------- two-step verification: second step (password) after the PIN ----------
  function askPassword(title, o) {
    o = o || {};
    return new Promise(res => {
      $('#lkt').textContent = title; $('#lke').textContent = o.err || ''; $('#lkh').textContent = o.hint ? t('tsvHintShow') + o.hint : '';
      $('#lkp').style.display = $('#lkd').style.display = 'none'; $('#lkw').hidden = false; $('#lkf').hidden = !o.forgot; $('#lkpw').value = '';
      $('#lkc').hidden = !o.cancel; $('#lkav').style.display = o.cancel ? 'none' : ''; avStyle($('#lkav'), ME.av, (ME.name || '?')[0]);
      pwRes = res; $('#lock').classList.add('on'); setTimeout(() => $('#lkpw').focus(), 60);
      $('#lkc').onclick = () => { pwRes = null; res(null); };
    });
  }
  $('#lkpb').onclick = () => { if (!pwRes) return; const v = $('#lkpw').value, r = pwRes; pwRes = null; $('#lkpw').value = ''; r(v); };
  $('#lkpw').addEventListener('keydown', e => { if (e.key === 'Enter') $('#lkpb').click(); });
  $('#lkf').onclick = async () => { if (!confirm(t('tsvForgotConfirm'))) return; await DB.wipe(); try { localStorage.clear(); } catch (e) {} location.reload(); };
  async function tsvLoop() { // wrong guesses are counted on disk: restarting the app does not reset the delay
    let msg = '';
    for (;;) {
      if (Date.now() < TL.u) { msg = t('pinTooMany'); await new Promise(r => setTimeout(r, TL.u - Date.now())); }
      const v = await askPassword(t('tsvEnter'), { hint: TL.f >= 2 ? TSV.hint : '', err: msg, forgot: true });
      if (v !== null && (await C.pinHash(v, TSV.s)) === TSV.h) { TL = { f: 0, u: 0 }; DB.set('tsvl', TL); return; }
      msg = t('tsvWrong'); TL.f++; if (TL.f % 3 === 0) TL.u = Date.now() + Math.min(600, 30 * (TL.f / 3)) * 1000; DB.set('tsvl', TL);
    }
  }
  async function checkTsv(title) {
    if (!TSV) return true; const v = await askPassword(title, { cancel: 1, hint: TSV.hint }); if (v === null) { hidePad(); return false; }
    const ok = (await C.pinHash(v, TSV.s)) === TSV.h; hidePad(); if (!ok) toast(t('tsvWrong')); return ok;
  }
  function tsvSheet(title) {
    return new Promise(res => {
      $('#tsvt').textContent = title; $('#tsv1').placeholder = t('tsvPw'); $('#tsv2').placeholder = t('tsvPwConfirm'); $('#tsvh').placeholder = t('tsvHint');
      ['#tsv1', '#tsv2', '#tsvh'].forEach(x => $(x).value = ''); $('#tsve').textContent = ''; sheet('tsv'); tsvRes = res;
    });
  }
  $('#tsvok').onclick = () => {
    const a = $('#tsv1').value, b = $('#tsv2').value, hn = $('#tsvh').value.trim().slice(0, 60);
    if (!F.tsvStrongEnough(a)) return ($('#tsve').textContent = t('tsvShort')); if (a !== b) return ($('#tsve').textContent = t('tsvMismatch'));
    if (hn && hn.toLowerCase().includes(a.toLowerCase())) return ($('#tsve').textContent = t('tsvHint'));
    const r = tsvRes; tsvRes = null; sheet(0); if (r) r({ pw: a, hint: hn });
  };
  async function saveTsv(r) { const s = C.b64(C.rnd(16)); TSV = { s, h: await C.pinHash(r.pw, s), hint: r.hint }; TL = { f: 0, u: 0 }; await DB.set('tsv', TSV); await DB.set('tsvl', TL); }
  async function unlockLoop() {
    if (!PIN || lockedNow) return; lockedNow = true; let msg = '';
    for (;;) {
      if (Date.now() < waitUntil) { msg = t('pinTooMany'); await new Promise(r => setTimeout(r, waitUntil - Date.now())); }
      const v = await askPin(t('lockTitle'), false, msg); if (v !== null && (await C.pinHash(v, PIN.s)) === PIN.h) break;
      msg = t('pinWrong'); if (++fails >= 5) { waitUntil = Date.now() + 30000; fails = 0; }
    }
    if (TSV) await tsvLoop(); hidePad(); lockedNow = false; fails = 0;
  }
  async function checkPin(title) { const v = await askPin(title, true); if (v === null) { hidePad(); return false; } const ok = (await C.pinHash(v, PIN.s)) === PIN.h; if (!ok) { hidePad(); toast(t('pinWrong')); } return ok; }
  async function setPin() {
    const a = await askPin(t('pinNew'), true); if (a === null) return hidePad(); const b = await askPin(t('pinConfirm'), true); hidePad(); if (b === null) return;
    if (a !== b) return toast(t('pinMismatch')); const s = C.b64(C.rnd(16)); PIN = { s, h: await C.pinHash(a, s) }; await DB.set('pin', PIN); toast(t('cleared'));
  }

  // ---------- more settings pages ----------
  const tgl = (L, label, on_, fn) => { const b = document.createElement('button'); b.className = 'tg'; b.textContent = (on_ ? '✅ ' : '⬜ ') + label; b.onclick = fn; L.append(b); };
  PG_ON.chatset = () => {
    const L = $('#cst2'); L.innerHTML = '';
    tgl(L, t('enterSend'), S.set.enter, () => { S.set.enter = S.set.enter ? 0 : 1; save(); PG_ON.chatset(); });
    tgl(L, t('h24'), S.set.h24, () => { S.set.h24 = S.set.h24 ? 0 : 1; save(); PG_ON.chatset(); });
    tgl(L, t('noMotion'), S.set.nomo, () => { S.set.nomo = S.set.nomo ? 0 : 1; save(); applySettings(); PG_ON.chatset(); });
    $('#brr').value = S.set.br;
  };
  $('#brr').oninput = e => { S.set.br = +e.target.value; save(); applySettings(); };
  PG_ON.notif = () => {
    const L = $('#ntl'); L.innerHTML = '';
    tgl(L, t('notifOn'), S.set.nt, () => { S.set.nt = S.set.nt ? 0 : 1; save(); PG_ON.notif(); });
    tgl(L, t('notifHide'), S.set.np, () => { S.set.np = S.set.np ? 0 : 1; save(); PG_ON.notif(); });
    $('#nsys').style.display = NATIVE ? '' : 'none';
  };
  $('#nsys').onclick = () => NATIVE && NATIVE.notifSettings && NATIVE.notifSettings();
  PG_ON.priv = () => {
    const L = $('#prl'); L.innerHTML = '';
    tgl(L, t('appLock'), !!PIN, async () => { if (PIN) { if (await checkPin(t('pinCurrent'))) { hidePad(); if (await checkTsv(t('tsvCurrent'))) { await DB.del('pin'); PIN = null; if (TSV) { await DB.del('tsv'); TSV = null; } } } } else await setPin(); PG_ON.priv(); });
    if (PIN) {
      tgl(L, t('changePin'), false, async () => { if (await checkPin(t('pinCurrent'))) { hidePad(); if (await checkTsv(t('tsvCurrent'))) await setPin(); } PG_ON.priv(); });
      tgl(L, t('tsvTitle'), !!TSV, async () => {
        if (TSV) { if (await checkTsv(t('tsvCurrent'))) { await DB.del('tsv'); TSV = null; toast(t('tsvOffToast')); } }
        else { const r = await tsvSheet(t('tsvEnable')); if (r) { await saveTsv(r); toast(t('tsvOnToast')); } }
        PG_ON.priv();
      });
      if (TSV) tgl(L, t('tsvChange'), false, async () => { if (await checkTsv(t('tsvCurrent'))) { const r = await tsvSheet(t('tsvChange')); if (r) { await saveTsv(r); toast(t('tsvOnToast')); } } PG_ON.priv(); });
      const tp = document.createElement('p'); tp.textContent = PIN ? t('tsvP') : t('tsvNeedPin'); L.append(tp);
      const lb = document.createElement('div'); lb.className = 'sec'; lb.textContent = t('lockAfter'); const sg = document.createElement('div'); sg.className = 'seg';
      [[0, 'lockNow'], [60, 'lock1'], [300, 'lock5'], [-1, 'lockStart']].forEach(([v, l]) => { const b = document.createElement('button'); b.textContent = t(l); b.classList.toggle('on', S.set.lockAfter === v); b.onclick = () => { S.set.lockAfter = v; save(); PG_ON.priv(); }; sg.append(b); }); L.append(lb, sg);
    }
    tgl(L, t('typShow'), !S.set.notyp, () => { S.set.notyp = S.set.notyp ? 0 : 1; save(); PG_ON.priv(); });
    tgl(L, t('noShots'), S.set.secure, () => { S.set.secure = S.set.secure ? 0 : 1; save(); applySettings(); PG_ON.priv(); });
    const B = $('#blk'); B.innerHTML = ''; const ks = Object.keys(S.block);
    if (!ks.length) B.innerHTML = '<p>' + t('noBlocked') + '</p>';
    ks.forEach(k => { const r = document.createElement('div'); r.className = 'crow'; r.innerHTML = '<span></span><button class="wb"></button>'; r.firstChild.textContent = (S.c[k] && S.c[k].name) || k; r.lastChild.textContent = t('unblock'); r.lastChild.onclick = () => { delete S.block[k]; save(); PG_ON.priv(); connect(k); }; B.append(r); });
  };
  PG_ON.store = async () => {
    const ms = await DB.allMsgs(); let mb = 0, mc = 0; ms.forEach(m => { if (m.b) { mb += m.b.size; mc++; } }); const rb = S.recs.reduce((a, r) => a + (r.size || 0), 0);
    const f = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.ceil(n / 1024) + ' KB', S_ = $('#stats'); S_.innerHTML = '';
    [[t('storMsgs'), ms.length], [t('storMedia'), mc + ' · ' + f(mb)], [t('storRecs'), S.recs.length + ' · ' + f(rb)]].forEach(([a, b]) => { const r = document.createElement('div'); r.className = 'crow'; r.innerHTML = '<span></span><b></b>'; r.firstChild.textContent = a; r.lastChild.textContent = b; S_.append(r); });
  };
  $('#clm').onclick = async () => {
    if (!confirm(t('confirmClear'))) return; for (const m of await DB.allMsgs()) if (m.b) { delete m.b; await DB.putMsg(m); }
    for (const r of S.recs) await DB.del('rec:' + r.id); S.recs = []; save(); if (cur) { M[cur] = await DB.chatMsgs(cur); draw(); } PG_ON.store(); toast(t('cleared'));
  };
  $('#clc').onclick = async () => {
    if (!confirm(t('confirmClear'))) return; await DB.clearMsgs(); Object.values(S.c).concat(Object.values(S.g)).forEach(o => { o.last = 0; o.u = 0; o.lk = ''; o.lx = ''; }); M = {}; save(); list(); if (cur) back(); PG_ON.store(); toast(t('cleared'));
  };
  // ---------- update check (GitHub 'latest' release; release notes say "Build N") ----------
  const REPO = 'd90f90y90-code/Shilagram', APK_URL = 'https://github.com/' + REPO + '/releases/download/latest/shilagram.apk';
  async function checkUpdate(silent) {
    const v = NATIVE && NATIVE.version ? NATIVE.version() : '', out = $('#updr');
    if (!v) { if (!silent) out.textContent = t('updWeb'); return null; }
    if (!silent) { out.textContent = t('updChecking'); $('#updd').hidden = true; }
    const ctl = new AbortController(), tid = setTimeout(() => ctl.abort(), 12000);
    try {
      const r = await fetch('https://api.github.com/repos/' + REPO + '/releases/tags/latest', { headers: { Accept: 'application/vnd.github+json' }, signal: ctl.signal, cache: 'no-store' });
      if (!r.ok) throw new Error('http ' + r.status); const j = await r.json(), notes = String(j.body || '') + ' ' + String(j.name || '');
      const avail = F.updateAvailable(v, notes); updInfo = { avail, build: F.parseBuild(notes) };
      if (!silent) { out.textContent = avail ? t('updAvail') + updInfo.build + ' (' + v + ')' : t('updLatest'); $('#updd').hidden = !avail; }
      return avail;
    } catch (e) { if (!silent) out.textContent = t('updFail'); return null; } finally { clearTimeout(tid); }
  }
  $('#updb').onclick = () => checkUpdate(false);
  $('#updd').onclick = () => NATIVE && NATIVE.openUrl && NATIVE.openUrl(APK_URL);
  PG_ON.about = () => {
    $('#abv').textContent = t('aboutVer') + ': ' + (NATIVE && NATIVE.version ? NATIVE.version() : 'web');
    $('#updr').textContent = updInfo ? (updInfo.avail ? t('updAvail') + updInfo.build : t('updLatest')) : ''; $('#updd').hidden = !(updInfo && updInfo.avail);
    const L = $('#updt'); L.innerHTML = ''; tgl(L, t('updAuto'), S.set.autoUpd, () => { S.set.autoUpd = S.set.autoUpd ? 0 : 1; save(); PG_ON.about(); });
  };
  $('#rst').onclick = async () => { if (!confirm(t('confirmReset'))) return; await DB.wipe(); try { localStorage.clear(); } catch (e) {} location.reload(); };

  // ---------- boot ----------
  function applyLang() {
    $$('[data-t]').forEach(e => e.textContent = t(e.dataset.t)); document.documentElement.style.setProperty('--sd', I18N.lang === 'ar' ? 1 : -1);
    $('#gn').placeholder = t('groupName'); $('#cap').placeholder = t('stickerText'); $('#efa').placeholder = t('bioPh');
    list(); updateComposer(); if (cur) { drawHead(); draw(); }
  }
  if (window.__DEBUG) window.__app = { S, conns, rot, seen, on, checkRotation, dirLookup, open, list, sendMsg, sweep, react, togglePin, getM, handlePlain, sendCtlQ, tsvLoop, askPassword, saveTsv, get TSV() { return TSV; }, get M() { return M; }, get typing() { return typing; }, get dirPeer() { return dirPeer; }, get call() { return call; } };
  await loadBg(); applySettings(); drawMine(); applyLang(); if (PIN) unlockLoop(); start(); sweep(); if (!ME.user) setTimeout(askUser, 500);
  if (NATIVE && S.set.autoUpd && Date.now() - (S.updAt || 0) > 12 * 3600e3) setTimeout(async () => { S.updAt = Date.now(); save(); if (await checkUpdate(true)) toast(t('updBanner')); }, 8000);
  if (NATIVE && NATIVE.ready) try { NATIVE.ready(); } catch (e) {}
})();
