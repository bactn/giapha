const fs = require('node:fs');
const path = require('node:path');

function loadSupabaseConfig(root, env = process.env) {
  const local = {};
  const file = path.join(root, '.env.local');
  if (fs.existsSync(file)) {
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const match = line.match(/^(SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY)\s*=\s*(.*)$/);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      local[match[1]] = value;
    }
  }
  const url = (env.SUPABASE_URL ?? local.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const publishableKey = (env.SUPABASE_PUBLISHABLE_KEY ?? local.SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  if (!url && !publishableKey) return null;
  if (!url || !publishableKey) throw new Error('Set both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.');
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('SUPABASE_URL is not a valid URL.'); }
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && localHost)) ||
      parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('SUPABASE_URL must be an HTTPS project origin (HTTP is allowed for local development only).');
  }
  // Only new publishable keys are accepted; never bundle a privileged key.
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey) || publishableKey.includes('REPLACE_ME')) {
    throw new Error('Use a Supabase publishable key starting with sb_publishable_; secret/service-role keys are not allowed.');
  }
  if (url.includes('YOUR_PROJECT_REF')) throw new Error('Replace the example Supabase project URL.');
  return { url, publishableKey };
}

module.exports = { loadSupabaseConfig };
