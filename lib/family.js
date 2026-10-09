export const family = [
  { id: 'alex', name: 'Alex' }, { id: 'mami', name: 'Mami' },
  { id: 'markuz', name: 'Markuz' }, { id: 'jony', name: 'Jony' },
  { id: 'kamila', name: 'Kamila' }, { id: 'brendan', name: 'Brendan' },
  { id: 'jr', name: 'Jr' }, { id: 'sandra', name: 'Sandra' },
  { id: 'ita-lulie', name: 'Ita Lulie' }, { id: 'ito-hector', name: 'Ito Hector' },
  { id: 'chris', name: 'Chris' }
];

export function validateGift(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Please complete the gift form.');
  if (!family.some(person => person.id === input.person)) throw new Error('Choose a family member.');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 160) throw new Error('Enter an item name (up to 160 characters).');
  if (typeof input.url !== 'string' || input.url.length > 3000) throw new Error('Enter a valid shopping link.');
  let link;
  try { link = new URL(input.url.trim()); } catch { throw new Error('Enter a full shopping link starting with https://.'); }
  if (!['https:', 'http:'].includes(link.protocol) || link.username || link.password || !link.hostname.includes('.') || link.hostname.endsWith('.local')) throw new Error('Use a public http:// or https:// shopping link.');
  if (input.notes != null && (typeof input.notes !== 'string' || input.notes.length > 1200)) throw new Error('Keep notes under 1,200 characters.');
  const price = input.price === '' || input.price == null ? null : Number(input.price);
  if (price != null && (!Number.isFinite(price) || price < 0 || price > 1000000)) throw new Error('Enter a valid price or leave it blank.');
  if (typeof input.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)) throw new Error('Please refresh the page and try again.');
  if (typeof input.receipt !== 'string' || !/^[0-9a-f]{64}$/i.test(input.receipt)) throw new Error('Please refresh the page and try again.');
  if (input.website) throw new Error('Unable to accept this submission.');
  return { id: input.id, person: input.person, title: input.title.trim(), url: input.url.trim(), notes: (input.notes || '').trim(), price: price == null ? null : Math.round(price * 100) / 100, source: 'family' };
}
