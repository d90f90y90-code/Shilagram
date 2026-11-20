/* ShilaBot — Gemini REST client + independent Shilagram bot peer.
   The API key never leaves the device except inside the request to Google. */
(function (G) {
  'use strict';
  const C = G.ShilaCrypto;
  const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
  const TIMEOUT = 30000;
  const KEYRE = /^[A-Z]{6}\d{4}$/;
  const U8 = x => x instanceof Uint8Array ? x : new Uint8Array(x || []);
  const rid = n => Array.from(C.rnd(n), b => (b % 36).toString(36)).join('');
  const DEFAULT_MODEL = 'gemini-3.8-flash';

  async function ask(cfg, history, text) {
    const api = cfg && (cfg.api || cfg.key);
    if (!cfg || !api || !text) throw new Error('missing');
    const model = /^[a-z0-9.\-]+$/.test(cfg.model || '') ? cfg.model : DEFAULT_MODEL;
    const contents = [];
    (history || []).slice(-10).forEach(h => {
      if (!h || !h.x) return;
      contents.push({ role: h.me ? 'model' : 'user', parts: [{ text: String(h.x).slice(0, 2000) }] });
    });
    contents.push({ role: 'user', parts: [{ text: String(text).slice(0, 4000) }] });
    // Gemini requires alternating roles; merge consecutive turns of the same role
    const turns = [];
    contents.forEach(c => {
      const last = turns[turns.length - 1];
      if (last && last.role === c.role) last.parts[0].text += '\n' + c.parts[0].text;
      else turns.push(c);
    });
    const body = { contents: turns, generationConfig: { maxOutputTokens: 600, temperature: 0.7 } };
    if (cfg.prompt) body.systemInstruction = { parts: [{ text: String(cfg.prompt).slice(0, 8000) }] };

    const ctl = 'AbortController' in G ? new AbortController() : null;
    const tid = ctl ? setTimeout(() => ctl.abort(), TIMEOUT) : 0;
    try {
      const r = await fetch(BASE + model + ':generateContent', {
        method: 'POST',
        headers: { 'x-goog-api-key': api, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctl ? ctl.signal : undefined,
      });
      const raw = await r.text();
      if (!r.ok) {
        let msg = 'HTTP ' + r.status;
        try { const j = JSON.parse(raw); msg = (j.error && (j.error.message || j.error.status)) || msg; } catch (_) {}
        throw new Error(String(msg).slice(0, 300));
      }
      let j; try { j = JSON.parse(raw); } catch (_) { throw new Error('bad response'); }
      const parts = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
      const out = parts ? parts.map(p => p.text || '').join('').trim() : '';
      if (!out) throw new Error('empty response');
      return out.slice(0, 4000);
    } finally { if (tid) clearTimeout(tid); }
  }

  // ---------- independent bot peer ----------
  let peer = null, cfg = null, PeerC = null, ice = null, onStatus = null;
  let running = false, retry = 0, retryT = 0;
  const conns = {}, chats = {};

  const status = s => { try { if (onStatus) onStatus(s); } catch (e) {} };
  const send = (c, h) => C.seal(c.aes, h).then(f => { try { c.send(f); return true; } catch (e) { return false; } });
  const ownProfile = () => ({ t: 'pf', n: cfg.name, u: cfg.user || '', b: cfg.bio || '', av: cfg.av || '', fc: cfg.fc || '#8b5cf6' });

  async function botSendHi(c) {
    if (c.sentHi) return; c.sentHi = 1;
    const hello = await C.newHello(cfg.id.pub); c.hello = hello;
    c.send({ t: 'hi', v: 2, k: cfg.key, n: cfg.name, u: cfg.user || '', pk: cfg.id.pub, ep: hello.ep, nc: hello.nc });
  }

  async function onHi(c, d) {
    if (c.pk) return;
    const pk = U8(d.pk), ep = U8(d.ep), nc = U8(d.nc);
    if (d.v !== 2 || typeof d.k !== 'string' || !KEYRE.test(d.k) || d.k === cfg.key || !pk || pk.length !== 65 || !ep || ep.length !== 65 || !nc || nc.length !== 16) return c.close();
    c.peerKey = d.k; c.peerName = String(d.n || d.k).slice(0, 30); c.pk = pk; c.theirEp = ep; c.theirNc = nc;
    await botSendHi(c);
    const sig = await C.sign(cfg.id.priv, nc, c.hello.ep, ep);
    c.send({ t: 'au', s: sig });
    c.aes = await C.deriveKey(c.hello.eph, c.hello.ep, ep);
  }
  async function onAu(c, d) {
    if (!c.pk || !c.hello || c.auth || !c.aes) return;
    const s = U8(d.s);
    if (!s || !(await C.verify(c.pk, s, c.hello.nc, c.theirEp, c.hello.ep))) return c.close();
    c.auth = 1; c.key = c.peerKey; conns[c.key] = c;
    await send(c, ownProfile());
  }
  async function onPlain(c, h) {
    const k = c.key;
    if (h.t === 'pg' || h.t === 'typ' || h.t === 'pf') { if (h.t === 'pf' && h.n) c.peerName = String(h.n).slice(0, 30); return; }
    if (h.t === 'fr') { await send(c, { t: 'fa' }); await send(c, ownProfile()); return; }
    if (h.t === 'fd') { try { c.close(); } catch (e) {} return; }
    if (h.t !== 'm') return;
    const mid = String(h.i || '').slice(0, 20);
    if (!mid) return;
    await send(c, { t: 'a', i: mid }); // ack first so the sender never waits
    if (h.kind && h.kind !== 't') return;
    const text = String(h.x || '').slice(0, 4000); if (!text) return;
    const hist = (chats[k] || []).slice(-8);
    chats[k] = hist.concat([{ x: text, me: false }]).slice(-8);
    await send(c, { t: 'typ', bot: 1 }); // "thinking…" on the other side
    const pulse = setInterval(() => send(c, { t: 'typ', bot: 1 }), 3000);
    try {
      const ans = await ask(cfg, hist, text);
      chats[k] = chats[k].concat([{ x: ans, me: true }]).slice(-8);
      await send(c, { t: 'm', i: rid(12), ts: Date.now(), kind: 't', x: ans, bn: cfg.name });
    } catch (e) { /* never break the chat because of an API error */ }
    finally { clearInterval(pulse); }
  }
  async function onData(c, d) {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'hi') return onHi(c, d);
    if (d.t === 'au') return onAu(c, d);
    if (d.t === 'e' && c.auth) {
      try {
        const { header } = await C.open(c.aes, { iv: U8(d.iv), d: U8(d.d) });
        return onPlain(c, header);
      } catch (e) {}
    }
  }
  function wire(c) {
    c.on('open', () => botSendHi(c).catch(() => {}));
    c.on('data', d => onData(c, d).catch(() => {}));
    const drop = () => { if (c.key && conns[c.key] === c) delete conns[c.key]; };
    c.on('close', drop); c.on('error', drop);
  }
  function start() {
    if (running || !cfg || !cfg.key || !cfg.id || !PeerC) return;
    try { peer = new PeerC('shilagram-' + cfg.key, { config: { iceServers: ice || [] } }); }
    catch (e) { status('error'); return; }
    running = true;
    peer.on('open', () => { retry = 0; status('on'); });
    peer.on('connection', wire);
    peer.on('error', e => {
      if (e.type === 'unavailable-id') { stop(true); status('keybusy'); return; }
      if (['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected'].includes(e.type)) {
        status('retry'); stop(true); clearTimeout(retryT);
        retryT = setTimeout(start, Math.min(6000 * (++retry), 30000));
      }
    });
  }
  function stop(silent) {
    clearTimeout(retryT); running = false;
    if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
    Object.keys(conns).forEach(k => delete conns[k]);
    if (!silent) status('off');
  }
  function startPeer(options, PeerClass, iceServers, cb) {
    cfg = options; PeerC = PeerClass; ice = iceServers; onStatus = cb; start();
  }
  function stopPeer() { stop(); }
  function isRunning() { return running; }

  G.ShilaBot = { ask, startPeer, stopPeer, isRunning, DEFAULT_MODEL };
})(window);
