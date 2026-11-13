const test = require('node:test'), assert = require('node:assert');
require('../app/src/main/assets/features.js');
const F = globalThis.ShilaFeatures;

test('ttl: only sane values are accepted', () => {
  assert.equal(F.validTtl(60), 60); assert.equal(F.validTtl('3600'), 3600);
  [0, -5, 1.5, NaN, 'x', F.MAX_TTL + 1, null, undefined].forEach(v => assert.equal(F.validTtl(v), 0));
  assert.equal(F.expiresAt(10, 1000), 11000); assert.equal(F.expiresAt(0, 1000), 0);
  assert.deepEqual(F.dueIds({ a: 5, b: 50, c: 10 }, 10).sort(), ['a', 'c']);
});
test('reactions: one per member, toggle off, unknown emoji rejected', () => {
  let rx = F.applyReaction({}, 'A', '👍'); rx = F.applyReaction(rx, 'B', '👍'); rx = F.applyReaction(rx, 'C', '❤️');
  assert.deepEqual(F.reactionSummary(rx, 'A'), [{ e: '👍', n: 2, mine: true }, { e: '❤️', n: 1, mine: false }]);
  rx = F.applyReaction(rx, 'A', '❤️'); assert.equal(rx.A, '❤️');
  rx = F.applyReaction(rx, 'A', ''); assert.ok(!('A' in rx));
  assert.deepEqual(F.applyReaction({}, 'A', '<script>'), {});
  const before = { A: '👍' }; F.applyReaction(before, 'B', '🔥'); assert.deepEqual(before, { A: '👍' });
});
test('pins: newest last, no duplicates, capped, pruned', () => {
  let l = F.pinAdd([], 'a'); l = F.pinAdd(l, 'b'); l = F.pinAdd(l, 'a'); assert.deepEqual(l, ['b', 'a']);
  assert.deepEqual(F.pinRemove(l, 'b'), ['a']);
  let big = []; for (let i = 0; i < 30; i++) big = F.pinAdd(big, 'm' + i); assert.equal(big.length, F.MAX_PINS); assert.equal(big[big.length - 1], 'm29');
  assert.deepEqual(F.pinPrune(['a', 'b'], x => x === 'a'), ['a']);
});
test('ctl queue: same target replaces older op, expires, is taken once', () => {
  const q = {}; const now = 1e9;
  F.ctlEnqueue(q, 'K', { t: 'rx', i: 'm1', e: '👍' }, now); F.ctlEnqueue(q, 'K', { t: 'rx', i: 'm1', e: '❤️' }, now + 1); F.ctlEnqueue(q, 'K', { t: 'pin', i: 'm1', on: 1 }, now + 2);
  assert.equal(q.K.length, 2);
  assert.deepEqual(F.ctlTake(q, 'K', now + 3).map(h => h.t + (h.e || '')), ['rx❤️', 'pin']); assert.ok(!q.K);
  F.ctlEnqueue(q, 'K', { t: 'rx', i: 'x' }, now); assert.deepEqual(F.ctlTake(q, 'K', now + 8 * 86400000), []);
  for (let i = 0; i < 150; i++) F.ctlEnqueue(q, 'Z', { t: 'rx', i: 'm' + i }, now); assert.equal(q.Z.length, 100);
});
test('typing: expires and is throttled', () => {
  const m = {}; F.typingMark(m, 'A', 1000); F.typingMark(m, 'B', 3000);
  assert.deepEqual(F.typingNow(m, 7000).sort(), ['B']); assert.deepEqual(F.typingNow(m, 9000), []);
  assert.ok(F.shouldSendTyping(0, 10000)); assert.ok(!F.shouldSendTyping(1000, 2000)); assert.ok(F.shouldSendTyping(1000, 4000));
});
test('update check compares build numbers', () => {
  assert.equal(F.parseBuild('Build 42 - commit abc'), 42); assert.equal(F.localBuild('2.0.41'), 41);
  assert.ok(F.updateAvailable('2.0.41', 'Build 42 - commit abc')); assert.ok(!F.updateAvailable('2.0.42', 'Build 42 - commit abc'));
  assert.ok(!F.updateAvailable('web', 'Build 42')); assert.ok(!F.updateAvailable('2.0.1', 'nothing'));
});
test('forward label and password policy', () => {
  assert.equal(F.fwName('A\nB' + 'x'.repeat(100)).length, 40); assert.ok(!/\n/.test(F.fwName('A\nB')));
  assert.ok(F.tsvStrongEnough('abcdef') && !F.tsvStrongEnough('abc') && !F.tsvStrongEnough('x'.repeat(65)) && !F.tsvStrongEnough(1234567));
});

test('status: emoji / image validation', () => {
  ['😀', '👨‍👩‍👧', '🇸🇦', '1️⃣', '❤️', '👍🏽'].forEach(e => assert.ok(F.okEmoji(e), e));
  ['', 'abc', '<b>', '😀a', 'x'.repeat(30), 5, null].forEach(e => assert.ok(!F.okEmoji(e), String(e)));
  assert.ok(F.okStatusImg('data:image/webp;base64,AAAA')); assert.ok(!F.okStatusImg('data:image/svg+xml;base64,AAAA'));
  assert.ok(!F.okStatusImg('data:image/png;base64,AA"onload=x')); assert.ok(!F.okStatusImg('data:image/png;base64,' + 'A'.repeat(F.STATUS_IMG_MAX)));
});
test('status: timer, header and receiver validation', () => {
  const now = 1e12; const st = F.makeStatus('e', '🔥', 12, now); assert.deepEqual(st, { k: 'e', v: '🔥', x: now + 12 * 3600000 });
  assert.equal(F.makeStatus('e', 'abc', 1, now), null); assert.equal(F.makeStatus('e', '🔥', 0, now).x, 0); assert.equal(F.makeStatus('e', '🔥', 9999, now).x, 0);
  assert.equal(F.makeStatus('e', '🔥', 1.5, now).x, now + 5400000);
  assert.deepEqual(F.statusHdr(st, now + 3600000), { k: 'e', v: '🔥', r: 11 * 3600000 }); assert.equal(F.statusHdr(st, st.x), '');
  assert.deepEqual(F.statusHdr({ k: 'e', v: '🔥', x: 0 }, now), { k: 'e', v: '🔥', r: 0 });
  const got = F.cleanStatus(F.statusHdr(st, now), now + 5); assert.equal(got.x, now + 5 + 12 * 3600000);
  [null, 'x', { k: 'e', v: '🔥', r: -1 }, { k: 'e', v: '🔥', r: 'a' }, { k: 'e', v: '🔥', r: 99 * 86400000 }, { k: 'z', v: '🔥', r: 0 }, { k: 'e', v: 'hi', r: 0 }].forEach(h => assert.equal(F.cleanStatus(h, now), null));
  assert.ok(F.statusActive({ x: 0 }, now) && !F.statusActive(null, now) && !F.statusActive({ x: now - 1 }, now));
  assert.deepEqual(F.statusLeft({ x: now + 30 * 60000 }, now), { n: 30, u: 'm' }); assert.deepEqual(F.statusLeft({ x: now + 5 * 3600000 }, now), { n: 5, u: 'h' });
  assert.deepEqual(F.statusLeft({ x: now + 4 * 86400000 }, now), { n: 4, u: 'd' }); assert.equal(F.statusLeft({ x: 0 }, now), null);
});
