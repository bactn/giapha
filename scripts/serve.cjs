const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { loadSupabaseConfig } = require('./supabase-config.cjs');
const root = path.resolve(__dirname, '..');

if (!loadSupabaseConfig(root)) {
  require('../server.js');
} else {
  require('./build-pages.cjs');
  const publicDir = path.join(root, 'dist');
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
  http.createServer((req, res) => {
    let target;
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      target = path.resolve(publicDir, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!target.startsWith(publicDir + path.sep) || !['GET', 'HEAD'].includes(req.method)) throw new Error();
      if (!fs.statSync(target).isFile()) throw new Error();
    } catch { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(target).pipe(res);
  }).listen(process.env.FE_PORT || 8080, '127.0.0.1', () => {
    console.log(`Supabase frontend: http://localhost:${process.env.FE_PORT || 8080}/`);
  });
}
