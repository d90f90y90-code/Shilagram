/* Pure helpers for: self-destructing messages, reactions, pins, typing, queued control messages, update check.
   No DOM access here so they can be unit-tested with node (tests/features.test.js). */
(function (G) {
  'use strict';
  const DAY = 86400000;
  const TTLS = [0, 10, 60, 3600, 86400, 604800];          // seconds offered in the UI (0 = off)
  const MAX_TTL = 30 * 86400;                              // anything above is rejected
  const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👎'];
  const MAX_PINS = 20, CQ_MAX = 100, CQ_AGE = 7 * DAY, TYPING_MS = 5000, TYPING_EVERY = 3000;

  // ---- self-destructing messages ----
  const validTtl = n => { n = Number(n); return Number.isInteger(n) && n > 0 && n <= MAX_TTL ? n : 0; };
  const expiresAt = (ttl, now) => validTtl(ttl) ? now + validTtl(ttl) * 1000 : 0;
  const dueIds = (exp, now) => Object.keys(exp || {}).filter(id => exp[id] <= now);

  // ---- reactions: m.rx = { memberKey: emoji } (one reaction per member) ----
  const cleanReaction = e => REACTIONS.includes(e) ? e : '';
  function applyReaction(rx, key, e) {
    const o = Object.assign({}, rx || {}); e = cleanReaction(e);
    if (e) o[key] = e; else delete o[key];
    return o;
  }
  function reactionSummary(rx, me) {
    const cnt = {}; Object.entries(rx || {}).forEach(([k, e]) => { const c = cnt[e] || (cnt[e] = { e, n: 0, mine: false }); c.n++; if (k === me) c.mine = true; });
    return Object.values(cnt).sort((a, b) => b.n - a.n || REACTIONS.indexOf(a.e) - REACTIONS.indexOf(b.e));
  }

  // ---- pinned messages: list of message ids (oldest first, newest pin shown on top) ----
  const pinAdd = (list, mid) => { const l = (list || []).filter(x => x !== mid); l.push(mid); return l.slice(-MAX_PINS); };
  const pinRemove = (list, mid) => (list || []).filter(x => x !== mid);
  const pinPrune = (list, has) => (list || []).filter(has);

  // ---- control messages that must survive the peer being offline (reactions, pins) ----
  const ctlKey = h => [h.t, h.g || '', h.i || ''].join('|');
  function ctlEnqueue(q, k, h, now) {
    const l = (q[k] || []).filter(x => now - x.ts < CQ_AGE && ctlKey(x.h) !== ctlKey(h));
    l.push({ ts: now, h }); q[k] = l.slice(-CQ_MAX); return q;
  }
  function ctlTake(q, k, now) { const l = (q[k] || []).filter(x => now - x.ts < CQ_AGE).map(x => x.h); delete q[k]; return l; }

  // ---- typing indicator: map memberKey -> expiry ----
  const typingMark = (map, k, now) => { map[k] = now + TYPING_MS; return map; };
  const typingNow = (map, now) => Object.keys(map || {}).filter(k => map[k] > now);
  const shouldSendTyping = (last, now) => now - (last || 0) >= TYPING_EVERY;

  // ---- update check: release notes say "Build N - commit ...", versionName is 2.0.N ----
  const parseBuild = s => { const m = /Build\s+(\d+)/i.exec(String(s || '')); return m ? +m[1] : 0; };
  const localBuild = v => { const m = /(\d+)\s*$/.exec(String(v || '')); return m ? +m[1] : 0; };
  const updateAvailable = (localVer, remoteNotes) => { const r = parseBuild(remoteNotes), l = localBuild(localVer); return r > 0 && l > 0 && r > l; };

  // ---- forwarded-from label ----
  const fwName = s => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 40);

  // ---- two-step verification password policy ----
  const tsvStrongEnough = p => typeof p === 'string' && p.length >= 6 && p.length <= 64;


  // ---- emoji / sticker / photo status next to the name ----
  // stored as { k: 'e'|'i', v: emoji | small data-URL, x: expiry timestamp (0 = never) }; sent as { k, v, r: ms left (0 = never) }
  const STATUS_HOURS = [1, 4, 12, 24, 72, 168, 0];         // presets offered in the UI (0 = no timer)
  const STATUS_MAX_MS = 30 * DAY, STATUS_IMG_MAX = 9000;
  const EMOJI_RE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u200d|\ufe0f|\u20e3|[#*0-9](?=\ufe0f?\u20e3))+$/u;
  const okEmoji = v => typeof v === 'string' && v.length > 0 && v.length <= 24 && EMOJI_RE.test(v);
  const okStatusImg = v => typeof v === 'string' && v.length <= STATUS_IMG_MAX && /^data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+\/=]+$/.test(v);
  const hoursToMs = h => { h = Number(h); return Number.isFinite(h) && h > 0 && h * 3600000 <= STATUS_MAX_MS ? Math.round(h * 3600000) : 0; };
  function makeStatus(k, v, hours, now) { // what the owner stores; null if the content is not acceptable
    if (!(k === 'e' ? okEmoji(v) : k === 'i' && okStatusImg(v))) return null;
    const ms = hoursToMs(hours); return { k, v, x: ms ? now + ms : 0 };
  }
  const statusActive = (st, now) => !!st && (st.x === 0 || st.x > now);
  const statusHdr = (st, now) => statusActive(st, now) ? { k: st.k, v: st.v, r: st.x ? st.x - now : 0 } : '';
  function cleanStatus(h, now) { // what a receiver keeps; anything odd is dropped
    if (!h || typeof h !== 'object') return null; const r = Number(h.r);
    if (!Number.isFinite(r) || r < 0 || r > STATUS_MAX_MS) return null;
    if (!(h.k === 'e' ? okEmoji(h.v) : h.k === 'i' && okStatusImg(h.v))) return null;
    return { k: h.k, v: h.v, x: r ? now + r : 0 };
  }
  function statusLeft(st, now) { if (!st || !st.x) return null; const ms = Math.max(0, st.x - now), m = Math.ceil(ms / 60000); return m >= 2880 ? { n: Math.round(m / 1440), u: 'd' } : m >= 120 ? { n: Math.round(m / 60), u: 'h' } : { n: Math.max(1, m), u: 'm' }; }

  G.ShilaFeatures = { TTLS, MAX_TTL, REACTIONS, MAX_PINS, TYPING_MS, TYPING_EVERY, validTtl, expiresAt, dueIds, cleanReaction, applyReaction, reactionSummary,
    pinAdd, pinRemove, pinPrune, ctlKey, ctlEnqueue, ctlTake, typingMark, typingNow, shouldSendTyping, parseBuild, localBuild, updateAvailable, fwName, tsvStrongEnough,
    STATUS_HOURS, okEmoji, okStatusImg, hoursToMs, makeStatus, statusActive, statusHdr, cleanStatus, statusLeft };
})(typeof globalThis !== 'undefined' ? globalThis : window);
