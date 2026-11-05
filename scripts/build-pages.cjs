const fs = require('node:fs');
const path = require('node:path');
const { loadSupabaseConfig } = require('./supabase-config.cjs');

const root = path.resolve(__dirname, '..');
const supabase = loadSupabaseConfig(root);
const output = path.join(root, 'dist');
let apiBaseUrl = (process.env.API_BASE_URL || '').trim().replace(/\/+$/, '');
if (apiBaseUrl) {
  const url = new URL(apiBaseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('API_BASE_URL must be a public HTTPS URL without credentials, query or fragment.');
  }
}

// Publish only public assets, never server data, sessions or source documents.
fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), output, {
  recursive: true,
  filter: source => !path.basename(source).startsWith('.') && !fs.lstatSync(source).isSymbolicLink()
});
const indexPath = path.join(output, 'index.html');
const html = fs.readFileSync(indexPath, 'utf8')
  .replaceAll('href="/css/', 'href="./css/')
  .replaceAll('src="/js/', 'src="./js/');
fs.writeFileSync(indexPath, html);
fs.writeFileSync(path.join(output, 'js/config.js'),
  `export const config = ${JSON.stringify({ apiBaseUrl, staticHosting: true, supabase })};\n`);
require('esbuild').buildSync({
  stdin: {
    contents: "export { createClient } from '@supabase/supabase-js';",
    resolveDir: root,
    sourcefile: 'supabase-sdk.js'
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  outfile: path.join(output, 'js/vendor/supabase.js'),
  minify: true,
  legalComments: 'eof'
});
fs.writeFileSync(path.join(output, '.nojekyll'), '');
console.log(`Built GitHub Pages assets in dist/ (backend ${apiBaseUrl ? 'configured' : 'not configured'}).`);
console.log(`Supabase SDK bundled; project configuration ${supabase ? 'available' : 'not set'}.`);

if (process.argv.includes('--docs')) {
  const docs = path.join(root, 'docs');
  fs.mkdirSync(docs, { recursive: true });
  // Preserve project documentation; update only generated website assets.
  for (const entry of fs.readdirSync(output)) {
    fs.cpSync(path.join(output, entry), path.join(docs, entry), { recursive: true });
  }
  console.log('Updated docs/ for branch-based GitHub Pages publishing.');
}
