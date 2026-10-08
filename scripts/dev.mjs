import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve('dist');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };
http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/api/gifts') {
    if (req.method !== 'GET') { res.writeHead(503, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Local preview only. Submit gifts on the live website.' })); }
    try {
      const response = await fetch('https://alex-christmas-wishlist-2026.vercel.app/api/gifts');
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error();
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(await response.text());
    } catch { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Shared gifts will load after deployment.' })); }
    return;
  }
  try {
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : decodeURIComponent(path)));
    if (!file.startsWith(root + '/')) throw new Error();
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }); res.end(bytes);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(4174, '127.0.0.1', () => console.log('http://127.0.0.1:4174'));
