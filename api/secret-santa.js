import { get, list, put } from '@vercel/blob';
import { createSecretSantaService } from '../lib/secret-santa-service.js';

const root = 'secret-santa-2026/';
async function read(pathname) {
  const result = await get(pathname, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200) return null;
  return new Response(result.stream).json();
}
const store = {
  async listJoins() {
    const page = await list({ prefix: root + 'joins/', limit: 100 });
    return (await Promise.all(page.blobs.map(blob => read(blob.pathname)))).filter(Boolean);
  },
  putJoin(record) {
    return put(root + 'joins/' + record.person + '.json', JSON.stringify(record), {
      access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 0
    });
  },
  async hasMail(person) { return Boolean(await read(root + 'mail/' + person + '.json')); },
  markMail(person) {
    return put(root + 'mail/' + person + '.json', JSON.stringify({ person, sentAt: new Date().toISOString() }), {
      access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 0
    });
  }
};

function createMailer() {
  if (!process.env.RESEND_API_KEY || !process.env.SECRET_SANTA_FROM_EMAIL) return null;
  return {
    async send({ to, name, link }) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.SECRET_SANTA_FROM_EMAIL,
          to: [to],
          subject: "Your Films Family Secret Santa draw is ready",
          html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#243d33"><h1 style="font-family:Georgia,serif">Everyone is in, ${name}.</h1><p>Your Secret Santa draw is ready. This is your private link—keep it somewhere safe and do not forward it.</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#741522;color:white;text-decoration:none;border-radius:8px">Open my private draw</a></p><p style="font-size:12px;color:#6b7067">Films Family Christmas '26</p></div>`
        })
      });
      if (!response.ok) throw new Error('Email provider rejected the message.');
    }
  };
}

function service(req) {
  const origin = process.env.PUBLIC_SITE_URL || `https://${req.headers.host}`;
  return createSecretSantaService(store, { secret: process.env.SECRET_SANTA_KEY, siteUrl: origin, mailer: createMailer() });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (req.method === 'GET') return res.status(200).json({ status: await service(req).status() });
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Open your draw from the family website.' });
    if (!req.headers['content-type']?.includes('application/json')) return res.status(415).json({ error: 'Use JSON.' });
    if (Number(req.headers['content-length'] || 0) > 2000) return res.status(413).json({ error: 'Request too large.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > 2000) throw new Error('Invalid request.');
    const result = body.action === 'reveal' ? await service(req).reveal(body) : await service(req).join(body);
    return res.status(200).json(result);
  } catch (error) {
    if (!process.env.SECRET_SANTA_KEY || error.name?.startsWith('Blob') || /token|storeId|fetch failed/i.test(error.message)) {
      console.error('Secret Santa service unavailable:', error.name || 'Error');
      return res.status(503).json({ error: 'The draw is temporarily sealed. Please try again shortly.' });
    }
    return res.status(400).json({ error: error.message || 'Check your details and try again.' });
  }
}
