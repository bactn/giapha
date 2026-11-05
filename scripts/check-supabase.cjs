const path = require('node:path');
const { loadSupabaseConfig } = require('./supabase-config.cjs');

async function main() {
  const config = loadSupabaseConfig(path.resolve(__dirname, '..'));
  if (!config) throw new Error('No Supabase configuration. Copy .env.example to .env.local and fill in your project URL and publishable key.');
  const response = await fetch(`${config.url}/auth/v1/settings`, {
    headers: { apikey: config.publishableKey },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Supabase Auth rejected the connection (HTTP ${response.status}). Check the project status, URL and publishable key.`);
  const settings = await response.json();
  if (!settings || typeof settings !== 'object' || !settings.external) {
    throw new Error('Unexpected response from Supabase Auth. Check the project URL.');
  }
  console.log(`Connected to Supabase Auth: ${new URL(config.url).host}`);
  console.log('Project URL and public key accepted. This check does not verify database migrations, RLS or user permissions.');
}

main().catch(error => {
  // Do not print response bodies, headers, tokens or environment contents.
  console.error(error.message === 'fetch failed' ? 'Supabase connection failed. Check network access and project availability.' : error.message);
  process.exitCode = 1;
});
