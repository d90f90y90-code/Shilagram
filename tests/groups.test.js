const test = require('node:test'), assert = require('node:assert');
require('../app/src/main/assets/crypto.js'); require('../app/src/main/assets/groups.js');
const C = globalThis.ShilaCrypto, SG = globalThis.ShilaGroups;
const O = 'AAAAAA1111', A = 'BBBBBB2222', M = 'CCCCCC3333', X = 'DDDDDD4444';
const base = () => ({ id: 'gtest1', ver: 1, owner: O, opk: 'pk', name: 'G', mem: { [O]: 'o', [A]: 'a', [M]: 'm' }, roles: {}, titles: {}, pd: { send: 1, media: 1, info: 0, add: 0 }, pm: {} });

test('defaults: members send but cannot manage; owner can do everything', () => {
  const g = base();
  assert.ok(SG.can(g, M, 'send') && SG.can(g, M, 'media')); assert.ok(!SG.can(g, M, 'info') && !SG.can(g, M, 'add'));
  SG.PERMS.forEach(p => assert.ok(SG.can(g, O, p))); assert.ok(!SG.can(g, X, 'send'));
});
test('only the owner can promote, title, set permissions or remove', () => {
  const g = base();
  for (const op of [{ a: 'role', k: M, v: 'a' }, { a: 'title', k: M, v: 'x' }, { a: 'perm', k: M, p: 'send', v: 0 }, { a: 'rm', k: M }, { a: 'pd', p: 'send', v: 0 }])
    { assert.equal(SG.applyOp(g, M, op), null); assert.equal(SG.applyOp(g, A, op), null); assert.ok(SG.applyOp(g, O, op)); }
});
test('assistant gets info+add; ordinary member does not until granted', () => {
  let g = SG.applyOp(base(), O, { a: 'role', k: A, v: 'a' }); assert.equal(g.ver, 2);
  assert.ok(SG.can(g, A, 'info') && SG.can(g, A, 'add')); assert.ok(!SG.can(g, M, 'info'));
  assert.ok(SG.applyOp(g, A, { a: 'name', v: 'New' }).name === 'New'); assert.equal(SG.applyOp(g, M, { a: 'name', v: 'Hack' }), null);
  g = SG.applyOp(g, O, { a: 'perm', k: M, p: 'info', v: 1 }); assert.ok(SG.can(g, M, 'info'));
  g = SG.applyOp(g, O, { a: 'perm', k: A, p: 'info', v: 0 }); assert.ok(!SG.can(g, A, 'info'));
});
test('owner can mute a member and set read-only default', () => {
  let g = SG.applyOp(base(), O, { a: 'perm', k: M, p: 'send', v: 0 }); assert.ok(!SG.can(g, M, 'send')); assert.ok(SG.can(g, A, 'send'));
  g = SG.applyOp(g, O, { a: 'pd', p: 'send', v: 0 }); assert.ok(!SG.can(g, A, 'send')); assert.ok(SG.can(g, O, 'send'));
});
test('add / leave / remove validation', () => {
  const g = SG.applyOp(base(), O, { a: 'role', k: A, v: 'a' });
  assert.ok(SG.applyOp(g, A, { a: 'add', k: X, n: 'Dan' }).mem[X] === 'Dan');
  assert.equal(SG.applyOp(g, M, { a: 'add', k: X, n: 'Dan' }), null); assert.equal(SG.applyOp(g, A, { a: 'add', k: 'bad', n: 'x' }), null); assert.equal(SG.applyOp(g, A, { a: 'add', k: M, n: 'x' }), null);
  assert.ok(!SG.applyOp(g, M, { a: 'leave' }).mem[M]); assert.equal(SG.applyOp(g, O, { a: 'leave' }), null); assert.equal(SG.applyOp(g, O, { a: 'rm', k: O }), null);
  assert.equal(SG.applyOp(g, X, { a: 'name', v: 'x' }), null); assert.equal(SG.applyOp(g, O, { a: 'weird' }), null);
});
test('validState rejects junk and strips unknown members from roles', () => {
  assert.equal(SG.validState({}), null); assert.equal(SG.validState(Object.assign(base(), { id: '../x' })), null); assert.equal(SG.validState(Object.assign(base(), { mem: { [A]: 'a' } })), null);
  const s = SG.validState(Object.assign(base(), { roles: { [X]: 'a', [A]: 'a' }, titles: { [X]: 't', [M]: 'Captain' } }));
  assert.deepEqual(s.roles, { [A]: 'a' }); assert.deepEqual(s.titles, { [M]: 'Captain' });
  assert.equal(SG.validState(Object.assign(base(), { av: 'javascript:alert(1)' })), null);
});
test('owner-signed snapshot verifies; forged or edited ones do not', async () => {
  const owner = await C.newIdentity(), evil = await C.newIdentity(), enc = new TextEncoder();
  const raw = JSON.stringify(SG.canon(base())), sig = await C.signRaw(owner.priv, enc.encode(raw));
  assert.ok(await C.verifyRaw(owner.pub, sig, enc.encode(raw)));
  assert.equal(await C.verifyRaw(owner.pub, sig, enc.encode(raw.replace('"G"', '"H"'))), false);
  assert.equal(await C.verifyRaw(owner.pub, await C.signRaw(evil.priv, enc.encode(raw)), enc.encode(raw)), false);
});
