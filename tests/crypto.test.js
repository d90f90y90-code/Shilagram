const test = require('node:test'), assert = require('node:assert');
require('../app/src/main/assets/crypto.js');
const C = globalThis.ShilaCrypto;

async function handshake(A, B, opts = {}) {
  const ha = await C.newHello(A.pub), hb = await C.newHello(B.pub);
  const sa = await C.sign(A.priv, hb.nc, ha.ep, hb.ep);
  const sb = await C.sign(B.priv, ha.nc, hb.ep, ha.ep);
  const okA = await C.verify(B.pub, sb, ha.nc, hb.ep, ha.ep);       // A checks B
  const okB = await C.verify(opts.fakePkForA || A.pub, sa, hb.nc, ha.ep, hb.ep); // B checks A
  return { ha, hb, okA, okB };
}

test('honest handshake: both sides verify and derive the same key', async () => {
  const A = await C.newIdentity(), B = await C.newIdentity();
  const { ha, hb, okA, okB } = await handshake(A, B);
  assert.ok(okA && okB);
  const ka = await C.deriveKey(ha.eph, ha.ep, hb.ep), kb = await C.deriveKey(hb.eph, hb.ep, ha.ep);
  const frame = await C.seal(ka, { t: 'm', x: 'مرحبا' }, new Uint8Array([1, 2, 3]));
  const out = await C.open(kb, frame);
  assert.equal(out.header.x, 'مرحبا');
  assert.deepEqual([...out.bin], [1, 2, 3]);
});

test('impersonation fails: attacker cannot sign as a known identity', async () => {
  const A = await C.newIdentity(), B = await C.newIdentity(), M = await C.newIdentity();
  const ha = await C.newHello(M.pub), hb = await C.newHello(B.pub);
  const forged = await C.sign(M.priv, hb.nc, ha.ep, hb.ep);
  // B has A's pinned key, attacker claims to be A
  assert.equal(await C.verify(A.pub, forged, hb.nc, ha.ep, hb.ep), false);
});

test('replayed signature from another session is rejected', async () => {
  const A = await C.newIdentity(), B = await C.newIdentity();
  const s1 = await handshake(A, B), s2 = await handshake(A, B);
  const sig = await C.sign(A.priv, s1.hb.nc, s1.ha.ep, s1.hb.ep);
  assert.equal(await C.verify(A.pub, sig, s2.hb.nc, s2.ha.ep, s2.hb.ep), false);
});

test('tampered ciphertext is rejected', async () => {
  const A = await C.newIdentity(), B = await C.newIdentity();
  const { ha, hb } = await handshake(A, B);
  const ka = await C.deriveKey(ha.eph, ha.ep, hb.ep), kb = await C.deriveKey(hb.eph, hb.ep, ha.ep);
  const f = await C.seal(ka, { t: 'm', x: 'hi' });
  f.d = new Uint8Array(f.d); f.d[5] ^= 1;
  await assert.rejects(C.open(kb, f));
});

test('third party key cannot decrypt', async () => {
  const A = await C.newIdentity(), B = await C.newIdentity(), E = await C.newIdentity();
  const s = await handshake(A, B), e = await handshake(A, E);
  const ka = await C.deriveKey(s.ha.eph, s.ha.ep, s.hb.ep), ke = await C.deriveKey(e.hb.eph, e.hb.ep, e.ha.ep);
  const f = await C.seal(ka, { t: 'm', x: 'secret' });
  await assert.rejects(C.open(ke, f));
});

test('fingerprint is stable and formatted', async () => {
  const A = await C.newIdentity();
  const f1 = await C.fingerprint(A.pub), f2 = await C.fingerprint(A.pub);
  assert.equal(f1, f2); assert.match(f1, /^([0-9A-F]{4} ){5}[0-9A-F]{4}$/);
});

test('backup lock/unlock round trip and wrong password', async () => {
  const f = await C.lock('pw1', '{"a":"مرحبا"}');
  assert.equal(await C.unlock('pw1', f), '{"a":"مرحبا"}');
  await assert.rejects(C.unlock('nope', f));
});

test('pin hash is deterministic per salt and differs for other PINs/salts', async () => {
  const s1 = C.b64(C.rnd(16)), s2 = C.b64(C.rnd(16));
  assert.equal(await C.pinHash('1234', s1), await C.pinHash('1234', s1));
  assert.notEqual(await C.pinHash('1234', s1), await C.pinHash('1235', s1));
  assert.notEqual(await C.pinHash('1234', s1), await C.pinHash('1234', s2));
});
