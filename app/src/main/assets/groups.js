/* Group state + permission rules (pure logic, no DOM). The owner signs every state snapshot. */
(function (G) {
  'use strict';
  const KEYRE = /^[A-Z]{6}\d{4}$/, PERMS = ['send', 'media', 'info', 'add'];
  const MEMBER_DEFAULT = { send: 1, media: 1, info: 0, add: 0 }, ASSIST = { send: 1, media: 1, info: 1, add: 1 };
  const clone = o => JSON.parse(JSON.stringify(o));
  const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
  const okImg = (v, max) => v === '' || (typeof v === 'string' && v.length <= max && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v));
  const okAv = v => okImg(v, 40000);
  const HASH = /^[a-f0-9]{32}$/, FC = /^#[0-9a-fA-F]{6}$/, SP_MAX = 30; // SP_MAX: stickers in a group's own pack

  function can(g, k, p) {
    if (!g || !g.mem || !g.mem[k]) return false;
    if (!g.owner) return p === 'send' || p === 'media'; // legacy group without a manager
    if (g.owner === k) return true;
    const o = g.pm && g.pm[k]; if (o && p in o) return !!o[p];
    if (g.roles && g.roles[k] === 'a') return !!ASSIST[p];
    return !!(g.pd || MEMBER_DEFAULT)[p];
  }
  const role = (g, k) => g.owner === k ? 'o' : (g.roles && g.roles[k] === 'a') ? 'a' : 'm';

  // fixed field order => stable JSON
  function canon(s) {
    const o = { id: s.id, ver: s.ver, owner: s.owner, opk: s.opk, name: s.name, mem: s.mem, roles: s.roles || {}, titles: s.titles || {}, pd: s.pd || clone(MEMBER_DEFAULT), pm: s.pm || {} };
    if (s.av) o.av = s.av; if (s.fc) o.fc = s.fc; if (s.ds) o.ds = s.ds; if (s.cvh) o.cvh = s.cvh; if (s.gfh) o.gfh = s.gfh; if (s.sp && s.sp.length) o.sp = s.sp; return o;
  }
  function validState(s) {
    try {
      if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !/^g[a-z0-9]{4,20}$/.test(s.id)) return null;
      if (!Number.isInteger(s.ver) || s.ver < 1 || !KEYRE.test(s.owner) || typeof s.opk !== 'string' || s.opk.length > 120) return null;
      const name = clean(s.name, 40); if (!name) return null;
      if (!s.mem || typeof s.mem !== 'object' || !s.mem[s.owner]) return null;
      const keys = Object.keys(s.mem); if (keys.length > 100) return null;
      const mem = {}; for (const k of keys) { if (!KEYRE.test(k)) return null; mem[k] = clean(s.mem[k], 30) || k; }
      const roles = {}, titles = {}, pm = {}, pd = {};
      for (const [k, v] of Object.entries(s.roles || {})) if (mem[k] && v === 'a' && k !== s.owner) roles[k] = 'a';
      for (const [k, v] of Object.entries(s.titles || {})) if (mem[k] && clean(v, 20)) titles[k] = clean(v, 20);
      for (const p of PERMS) pd[p] = (s.pd && p in s.pd) ? (s.pd[p] ? 1 : 0) : MEMBER_DEFAULT[p];
      for (const [k, o] of Object.entries(s.pm || {})) if (mem[k] && k !== s.owner && o && typeof o === 'object') { const x = {}; for (const p of PERMS) if (p in o) x[p] = o[p] ? 1 : 0; if (Object.keys(x).length) pm[k] = x; }
      if (s.av !== undefined && !okAv(s.av)) return null;
      if (s.fc !== undefined && !FC.test(s.fc)) return null; if (s.cvh !== undefined && !HASH.test(s.cvh)) return null; if (s.gfh !== undefined && !HASH.test(s.gfh)) return null;
      if (s.sp !== undefined && (!Array.isArray(s.sp) || s.sp.length > SP_MAX || !s.sp.every(h => HASH.test(h)) || new Set(s.sp).size !== s.sp.length)) return null;
      const out = { id: s.id, ver: s.ver, owner: s.owner, opk: s.opk, name, mem, roles, titles, pd, pm }; if (s.av) out.av = s.av; if (s.fc) out.fc = s.fc; const ds = clean(s.ds, 300); if (ds) out.ds = ds; if (s.cvh) out.cvh = s.cvh; if (s.gfh) out.gfh = s.gfh; if (s.sp && s.sp.length) out.sp = s.sp.slice(); return out;
    } catch (e) { return null; }
  }
  const strip = (n, k) => { delete n.mem[k]; delete n.roles[k]; delete n.titles[k]; delete n.pm[k]; };

  // returns the NEW state if `from` is allowed to do `op`, else null
  function applyOp(g, from, op) {
    if (!g || !g.owner || !g.mem[from] || !op || typeof op !== 'object') return null;
    const n = clone(canon(g)); n.ver = (g.ver | 0) + 1; const isO = from === g.owner;
    switch (op.a) {
      case 'name': { if (!can(g, from, 'info')) return null; const v = clean(op.v, 40); if (!v) return null; n.name = v; break; }
      case 'av': { if (!can(g, from, 'info') || !okAv(op.v)) return null; if (op.v) n.av = op.v; else delete n.av; break; }
      case 'add': { if (!can(g, from, 'add') || typeof op.k !== 'string' || !KEYRE.test(op.k) || n.mem[op.k] || Object.keys(n.mem).length >= 100) return null; n.mem[op.k] = clean(op.n, 30) || op.k; break; }
      case 'ds': { if (!can(g, from, 'info')) return null; const v = clean(op.v, 300); if (v) n.ds = v; else delete n.ds; break; }
      case 'fc': { if (!can(g, from, 'info') || (op.v !== '' && !FC.test(op.v))) return null; if (op.v) n.fc = op.v; else delete n.fc; break; }
      case 'cv': case 'gf': { const f = op.a === 'cv' ? 'cvh' : 'gfh'; if (!can(g, from, 'info') || (op.h !== '' && !HASH.test(op.h))) return null; if (op.h) n[f] = op.h; else delete n[f]; break; }
      case 'sa': { if (!can(g, from, 'info') || !HASH.test(op.h) || (n.sp || []).includes(op.h) || (n.sp || []).length >= SP_MAX) return null; n.sp = (n.sp || []).concat(op.h); break; }
      case 'sr': { if (!can(g, from, 'info') || !(n.sp || []).includes(op.h)) return null; n.sp = n.sp.filter(x => x !== op.h); if (!n.sp.length) delete n.sp; break; }
      case 'leave': { if (isO) return null; strip(n, from); break; }
      case 'rm': { if (!isO || !n.mem[op.k] || op.k === g.owner) return null; strip(n, op.k); break; }
      case 'role': { if (!isO || !n.mem[op.k] || op.k === g.owner) return null; if (op.v === 'a') n.roles[op.k] = 'a'; else delete n.roles[op.k]; break; }
      case 'title': { if (!isO || !n.mem[op.k]) return null; const v = clean(op.v, 20); if (v) n.titles[op.k] = v; else delete n.titles[op.k]; break; }
      case 'perm': {
        if (!isO || !n.mem[op.k] || op.k === g.owner || !PERMS.includes(op.p)) return null;
        n.pm[op.k] = n.pm[op.k] || {}; n.pm[op.k][op.p] = op.v ? 1 : 0; break;
      }
      case 'pd': { if (!isO || !PERMS.includes(op.p)) return null; n.pd[op.p] = op.v ? 1 : 0; break; }
      default: return null;
    }
    return n;
  }
  G.ShilaGroups = { can, role, canon, validState, applyOp, SP_MAX, PERMS, MEMBER_DEFAULT, okAv, okImg, HASH };
})(typeof globalThis !== 'undefined' ? globalThis : window);
