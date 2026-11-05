const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadSupabaseConfig } = require('../scripts/supabase-config.cjs');

function fixture(t, contents) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'giapha-config-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  if (contents) fs.writeFileSync(path.join(root, '.env.local'), contents);
  return root;
}

test('legacy build works with no Supabase configuration', t => {
  assert.equal(loadSupabaseConfig(fixture(t), {}), null);
});

test('only allowlisted public configuration is loaded; environment takes priority', t => {
  const root = fixture(t, "# public config\nSUPABASE_URL='https://project.supabase.co/'\nSUPABASE_PUBLISHABLE_KEY=sb_publishable_local\nSUPABASE_SECRET_KEY=must_never_be_bundled\n");
  assert.deepEqual(loadSupabaseConfig(root, { SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_override' }), {
    url: 'https://project.supabase.co', publishableKey: 'sb_publishable_override'
  });
});

test('reject privileged and legacy JWT keys without including the key in errors', t => {
  const root = fixture(t);
  for (const key of ['sb_secret_private', 'eyJhbGciOiJIUzI1NiJ9.service_role.signature']) {
    assert.throws(() => loadSupabaseConfig(root, { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: key }), error => {
      assert(!error.message.includes(key));
      return /publishable key/.test(error.message);
    });
  }
});

test('reject incomplete config and unsafe origins', t => {
  const root = fixture(t);
  assert.throws(() => loadSupabaseConfig(root, { SUPABASE_URL: 'https://project.supabase.co' }), /both/);
  for (const url of ['http://project.supabase.co', 'https://user:pass@project.supabase.co', 'https://project.supabase.co/rest/v1', 'https://project.supabase.co?key=x', 'https://project.supabase.co#token']) {
    assert.throws(() => loadSupabaseConfig(root, { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }), /HTTPS project origin/);
  }
  assert.equal(loadSupabaseConfig(root, { SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }).url, 'http://127.0.0.1:54321');
});
