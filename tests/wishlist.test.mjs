import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { validateGift, family } from '../lib/family.js';
import { createWishlistService } from '../lib/wishlist-service.js';
import { accessCodeFor, assignmentsFor, revealRecipient } from '../lib/secret-santa.js';
import { createSecretSantaService } from '../lib/secret-santa-service.js';
const input = () => ({ id: randomUUID(), receipt: randomBytes(32).toString('hex'), person: 'mami', title: 'Sweater', url: 'https://example.com/gift?a=1&b=2', notes: 'Medium', price: '' });
test('ten participating family members and optional price with exact link preserved', () => {
  assert.equal(family.length, 10);
  assert.equal(family.some(person => person.id === 'ito-hector'), false);
  assert.equal(family.find(person => person.id === 'chris').name, 'Chris');
  assert.equal(validateGift({ ...input(), person: 'chris' }).person, 'chris');
  const raw = input(), gift = validateGift(raw);
  assert.equal(gift.price, null); assert.equal(gift.url, raw.url);
});
test('secret santa includes everyone once, excludes self, and reveals only with the matching private code', () => {
  const secret = 'test-secret-that-never-leaves-the-test-suite';
  const assignments = assignmentsFor(secret);
  assert.equal(assignments.size, family.length);
  assert.equal(new Set([...assignments.values()].map(person => person.id)).size, family.length);
  for (const person of family) {
    assert.notEqual(assignments.get(person.id).id, person.id);
    assert.deepEqual(revealRecipient(person.id, accessCodeFor(person.id, secret), secret), assignments.get(person.id));
    assert.equal(revealRecipient(person.id, 'WRONG-CODE', secret), null);
  }
});
test('secret santa stays locked until all ten join, saves encrypted emails and sends permanent links', async () => {
  const secret = 'a-separate-test-secret-for-the-gated-draw';
  const joins = new Map(), mailed = new Set(), messages = [];
  const store = {
    listJoins: async () => [...joins.values()],
    putJoin: async record => joins.set(record.person, record),
    hasMail: async person => mailed.has(person),
    markMail: async person => mailed.add(person)
  };
  const mailer = { send: async message => messages.push(message) };
  const service = createSecretSantaService(store, { secret, siteUrl: 'https://family.example', mailer });
  for (const [index, person] of family.entries()) {
    const result = await service.join({ person: person.id, code: accessCodeFor(person.id, secret), email: `${person.id}@example.com` });
    assert.equal(result.status.complete, index === family.length - 1);
    if (index < family.length - 1) assert.equal(result.recipient, null);
  }
  assert.equal(messages.length, family.length);
  assert.equal(mailed.size, family.length);
  assert.ok([...joins.values()].every(record => !JSON.stringify(record).includes('@example.com')));
  const alex = await service.reveal({ person: 'alex', code: accessCodeFor('alex', secret) });
  assert.equal(alex.locked, false);
  assert.notEqual(alex.recipient.id, 'alex');
  assert.match(alex.personalLink, /draw=alex&token=/);
});
test('reject unknown people, executable URLs, invalid prices and large notes', () => {
  for (const fields of [{ person: 'stranger' }, { url: 'javascript:alert(1)' }, { price: -3 }, { notes: 'x'.repeat(1201) }, { id: '../escape' }]) assert.throws(() => validateGift({ ...input(), ...fields }));
});
test('shared persistence, retry safety, concurrent gifts and creator-only removal', async () => {
  const records = new Map();
  const store = {
    find: async (person, id) => records.get(person + '/' + id) || null,
    list: async person => [...records.values()].filter(i => !person || i.person === person),
    put: async item => records.set(item.person + '/' + item.id, item)
  };
  const firstBrowser = createWishlistService(store), otherBrowser = createWishlistService(store);
  const a = input(), b = { ...input(), person: 'jony' };
  await Promise.all([firstBrowser.add(a), firstBrowser.add(b)]);
  await firstBrowser.add(a);
  const visible = await otherBrowser.list();
  assert.equal(visible.length, 2); assert.ok(visible.every(i => !('receiptHash' in i)));
  await assert.rejects(otherBrowser.remove({ ...a, receipt: randomBytes(32).toString('hex') }));
  await firstBrowser.remove(a);
  assert.equal((await otherBrowser.list()).length, 1);
  assert.ok(records.get(a.person + '/' + a.id).archivedAt);
  await assert.rejects(firstBrowser.add(a), /removed/);
});
