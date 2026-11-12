/* Shilagram identity + end-to-end handshake (ECDSA P-256 identity, ECDH P-256 ephemeral, HKDF, AES-GCM) */
(function (G) {
  'use strict';
  const subtle = G.crypto.subtle, enc = new TextEncoder(), dec = new TextDecoder();
  const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' }, ECDH = { name: 'ECDH', namedCurve: 'P-256' };
  const SIG = { name: 'ECDSA', hash: 'SHA-256' };

  const cat = (...a) => { const n = a.reduce((s, x) => s + x.length, 0), o = new Uint8Array(n); let p = 0; a.forEach(x => { o.set(x, p); p += x.length; }); return o; };
  const rnd = n => G.crypto.getRandomValues(new Uint8Array(n));
  const hex = u => Array.from(u, b => b.toString(16).padStart(2, '0')).join('');
  const cmp = (a, b) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; };
  const b64 = u => { let s = ''; u.forEach(b => s += String.fromCharCode(b)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  // ---- long-term identity ----
  async function newIdentity() {
    const kp = await subtle.generateKey(ECDSA, true, ['sign', 'verify']);
    return { priv: await subtle.exportKey('jwk', kp.privateKey), pub: new Uint8Array(await subtle.exportKey('raw', kp.publicKey)) };
  }
  const loadPriv = jwk => subtle.importKey('jwk', jwk, ECDSA, false, ['sign']);
  const loadPub = raw => subtle.importKey('raw', raw, ECDSA, false, ['verify']);
  async function fingerprint(pubRaw) {
    const h = hex(new Uint8Array(await subtle.digest('SHA-256', pubRaw))).slice(0, 24).toUpperCase();
    return h.match(/.{4}/g).join(' ');
  }

  // ---- per-connection handshake ----
  async function newHello(identityPub) {
    const kp = await subtle.generateKey(ECDH, true, ['deriveBits']);
    return { eph: kp.privateKey, ep: new Uint8Array(await subtle.exportKey('raw', kp.publicKey)), nc: rnd(16), pk: identityPub };
  }
  // I sign: peer's nonce | my ephemeral | peer's ephemeral
  const signData = (theirNc, myEp, theirEp) => cat(enc.encode('shila-auth-v2'), theirNc, myEp, theirEp);
  async function sign(privJwk, theirNc, myEp, theirEp) {
    return new Uint8Array(await subtle.sign(SIG, await loadPriv(privJwk), signData(theirNc, myEp, theirEp)));
  }
  // peer signed: my nonce | peer's ephemeral | my ephemeral
  async function verify(peerPk, sig, myNc, peerEp, myEp) {
    try { return await subtle.verify(SIG, await loadPub(peerPk), sig, signData(myNc, peerEp, myEp)); } catch (e) { return false; }
  }
  async function deriveKey(myEph, myEp, theirEp) {
    const peerKey = await subtle.importKey('raw', theirEp, ECDH, false, []);
    const bits = await subtle.deriveBits({ name: 'ECDH', public: peerKey }, myEph, 256);
    const base = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
    const salt = new Uint8Array(await subtle.digest('SHA-256', cmp(myEp, theirEp) < 0 ? cat(myEp, theirEp) : cat(theirEp, myEp)));
    return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('shilagram-v2') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  // ---- message framing: [4 bytes header length][header JSON][binary] ----
  async function seal(key, header, bin) {
    const h = enc.encode(JSON.stringify(header)), b = bin ? new Uint8Array(bin) : new Uint8Array(0);
    const len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, h.length);
    const iv = rnd(12);
    const d = await subtle.encrypt({ name: 'AES-GCM', iv }, key, cat(len, h, b));
    return { t: 'e', iv, d };
  }
  async function open(key, frame) {
    const iv = new Uint8Array(frame.iv), d = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv }, key, frame.d));
    const n = new DataView(d.buffer, d.byteOffset, 4).getUint32(0);
    if (n > d.length - 4) throw new Error('bad frame');
    return { header: JSON.parse(dec.decode(d.subarray(4, 4 + n))), bin: d.subarray(4 + n) };
  }



  // ---- generic signatures with the identity key (used for owner-signed group state) ----
  const gData = bytes => cat(enc.encode('shila-group-v1'), bytes);
  async function signRaw(privJwk, bytes) { return new Uint8Array(await subtle.sign(SIG, await loadPriv(privJwk), gData(bytes))); }
  async function verifyRaw(pubRaw, sig, bytes) { try { return await subtle.verify(SIG, await loadPub(pubRaw), sig, gData(bytes)); } catch (e) { return false; } }

  // content address for shared assets (first 128 bits of SHA-256)
  async function sha32(text) { return hex(new Uint8Array(await subtle.digest('SHA-256', enc.encode(text)))).slice(0, 32); }

  // ---- app-lock PIN hash (PBKDF2) ----
  async function pinHash(pin, saltB64) {
    const base = await subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
    return b64(new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: 150000 }, base, 256)));
  }

  // ---- password-protected backup (PBKDF2 -> AES-GCM) ----
  async function pbKey(pass, salt) {
    const base = await subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 250000 }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function lock(pass, text) {
    const salt = rnd(16), iv = rnd(12), d = await subtle.encrypt({ name: 'AES-GCM', iv }, await pbKey(pass, salt), enc.encode(text));
    return JSON.stringify({ shilagram: 1, s: b64(salt), i: b64(iv), d: b64(new Uint8Array(d)) });
  }
  async function unlock(pass, file) {
    const o = JSON.parse(file); if (o.shilagram !== 1) throw new Error('format');
    return dec.decode(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.i) }, await pbKey(pass, unb64(o.s)), unb64(o.d)));
  }

  G.ShilaCrypto = { sha32, pinHash, signRaw, verifyRaw, lock, unlock, newIdentity, fingerprint, newHello, sign, verify, deriveKey, seal, open, b64, unb64, rnd, cat };
})(typeof globalThis !== 'undefined' ? globalThis : window);
