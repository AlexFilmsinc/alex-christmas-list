import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { validateGift, family } from '../lib/family.js';
import { createWishlistService } from '../lib/wishlist-service.js';
const input = () => ({ id: randomUUID(), receipt: randomBytes(32).toString('hex'), person: 'mami', title: 'Sweater', url: 'https://example.com/gift?a=1&b=2', notes: 'Medium', price: '' });
test('eleven family members and optional price with exact link preserved', () => {
  assert.equal(family.length, 11);
  assert.equal(family.find(person => person.id === 'chris').name, 'Chris');
  assert.equal(validateGift({ ...input(), person: 'chris' }).person, 'chris');
  const raw = input(), gift = validateGift(raw);
  assert.equal(gift.price, null); assert.equal(gift.url, raw.url);
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
