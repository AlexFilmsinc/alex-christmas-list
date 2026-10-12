import { revealRecipient } from '../lib/secret-santa.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Open your draw from the family website.' });
    if (!req.headers['content-type']?.includes('application/json')) return res.status(415).json({ error: 'Use JSON.' });
    if (Number(req.headers['content-length'] || 0) > 1000) return res.status(413).json({ error: 'Request too large.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > 1000) throw new Error('Invalid request.');
    const recipient = revealRecipient(body.person, body.code, process.env.SECRET_SANTA_KEY);
    if (!recipient) return res.status(401).json({ error: 'That name and private code do not match.' });
    return res.status(200).json({ recipient: { id: recipient.id, name: recipient.name } });
  } catch (error) {
    if (!process.env.SECRET_SANTA_KEY) {
      console.error('Secret Santa configuration is unavailable.');
      return res.status(503).json({ error: 'The draw is temporarily sealed. Please try again shortly.' });
    }
    return res.status(400).json({ error: 'Check your name and private code, then try again.' });
  }
}
