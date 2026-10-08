import { createHash, timingSafeEqual } from 'node:crypto';
import { validateGift } from './family.js';

const digest = text => createHash('sha256').update(text).digest('hex');
export const publicGift = ({ receiptHash, archivedAt, ...gift }) => gift;

export function createWishlistService(store) {
  return {
    async list(person) {
      return (await store.list(person)).filter(item => !item.archivedAt).map(publicGift);
    },
    async add(input) {
      const gift = validateGift(input);
      const current = await store.find(gift.person, gift.id);
      if (current) {
        if (current.receiptHash !== digest(input.receipt)) throw new Error('This submission ID is already in use.');
        if (current.archivedAt) throw new Error('This item was removed. Start a new submission.');
        return publicGift(current);
      }
      const existing = await store.list(gift.person);
      if (existing.filter(i => !i.archivedAt).length >= 75) throw new Error('This list has reached 75 submitted gifts. Please ask Alex to review it.');
      const stored = { ...gift, createdAt: new Date().toISOString(), receiptHash: digest(input.receipt) };
      await store.put(stored, false);
      return publicGift(stored);
    },
    async remove(input) {
      if (!input || typeof input.receipt !== 'string' || !/^[0-9a-f]{64}$/i.test(input.receipt)) throw new Error('The removal receipt is missing.');
      if (!/^[a-z-]+$/.test(input.person || '') || !/^[0-9a-f-]{36}$/i.test(input.id || '')) throw new Error('Invalid item.');
      const item = await store.find(input.person, input.id);
      if (!item || !timingSafeEqual(Buffer.from(item.receiptHash), Buffer.from(digest(input.receipt)))) throw new Error('Only the device that added this gift can remove it.');
      if (!item.archivedAt) await store.put({ ...item, archivedAt: new Date().toISOString() }, true);
      return { ok: true };
    }
  };
}
