import { get, list, put } from '@vercel/blob';
import { createWishlistService } from '../lib/wishlist-service.js';
import { family } from '../lib/family.js';

const pathname = (person, id) => 'gifts/' + person + '/' + id + '.json';
async function read(path) {
  const result = await get(path, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200) return null;
  return new Response(result.stream).json();
}
const store = {
  find: (person, id) => read(pathname(person, id)),
  async list(person) {
    const output = [];
    let cursor;
    do {
      const page = await list({ prefix: person ? 'gifts/' + person + '/' : 'gifts/', limit: 100, cursor });
      for (let i = 0; i < page.blobs.length; i += 10) {
        const batch = await Promise.all(page.blobs.slice(i, i + 10).map(blob => read(blob.pathname)));
        output.push(...batch.filter(Boolean));
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return output;
  },
  async put(item, overwrite) {
    await put(pathname(item.person, item.id), JSON.stringify(item), {
      access: 'private', addRandomSuffix: false, allowOverwrite: overwrite,
      contentType: 'application/json', cacheControlMaxAge: 0
    });
  }
};
const service = createWishlistService(store);
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (req.method === 'GET') {
      const person = req.query?.person;
      if (person && !family.some(p => p.id === person)) return res.status(400).json({ error: 'Unknown family member.' });
      return res.status(200).json({ gifts: await service.list(person) });
    }
    if (!['POST', 'DELETE'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST, DELETE');
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Please submit from the wishlist website.' });
    if (!req.headers['content-type']?.includes('application/json')) return res.status(415).json({ error: 'Use JSON.' });
    if (Number(req.headers['content-length'] || 0) > 10000) return res.status(413).json({ error: 'Submission too large.' });
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return res.status(400).json({ error: 'Invalid submission.' }); }
    if (JSON.stringify(body || {}).length > 10000) return res.status(413).json({ error: 'Submission too large.' });
    try {
      const result = req.method === 'POST' ? { gift: await service.add(body) } : await service.remove(body);
      return res.status(req.method === 'POST' ? 201 : 200).json(result);
    } catch (error) {
      if (error.name?.startsWith('Blob') || /token|storeId|fetch failed/i.test(error.message)) throw error;
      return res.status(400).json({ error: error.message });
    }
  } catch (error) {
    console.error('Wishlist storage error:', error.name);
    return res.status(503).json({ error: 'The shared list is temporarily unavailable. Please try again shortly.' });
  }
}
