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

  G.ShilaFeatures = { TTLS, MAX_TTL, REACTIONS, MAX_PINS, TYPING_MS, TYPING_EVERY, validTtl, expiresAt, dueIds, cleanReaction, applyReaction, reactionSummary,
    pinAdd, pinRemove, pinPrune, ctlKey, ctlEnqueue, ctlTake, typingMark, typingNow, shouldSendTyping, parseBuild, localBuild, updateAvailable, fwName, tsvStrongEnough };
})(typeof globalThis !== 'undefined' ? globalThis : window);
