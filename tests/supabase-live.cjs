// Explicit integration check against disposable accounts provisioned for this run.
// No real user credentials are committed. Run with a fixture JSON path.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { loadSupabaseConfig } = require('../scripts/supabase-config.cjs');
const config = loadSupabaseConfig(require('node:path').resolve(__dirname, '..'));
const file = process.argv[2];
if (!file) throw new Error('Supply a disposable fixture JSON path.');
const fixture = JSON.parse(fs.readFileSync(file, 'utf8'));
const users = Object.fromEntries(fixture.users.map(u => [u.role, u]));
let checks = 0;

async function request(route, body, user) {
  const headers = { apikey: config.publishableKey, 'Content-Type': 'application/json' };
  if (user?.token) headers.Authorization = 'Bearer ' + user.token;
  let response;
  try {
    response = await fetch(config.url + route, { method: body === undefined ? 'GET' : 'POST',
      headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  } catch { throw new Error(`Network timeout/failure at ${route.split('?')[0]}`); }
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return { ok: response.ok, status: response.status, data };
}
async function rpc(name, args, user, errorCode) {
  const r = await request('/rest/v1/rpc/' + name, args, user);
  if (errorCode) { assert(!r.ok, name + ' should fail'); assert.equal(r.data.code, errorCode); checks++; return; }
  if (!r.ok) throw new Error(`${name} failed: HTTP ${r.status}, code ${r.data.code || r.data.error_code || 'unknown'}`);
  checks++; console.log('Checked', name); return r.data;
}

(async () => {
  for (const user of fixture.users) {
    const r = await request('/auth/v1/token?grant_type=password', { email: user.email, password: user.password });
    if (!r.ok) throw new Error(`Disposable ${user.role} login failed: HTTP ${r.status}, ${r.data.error_code || r.data.code || 'auth error'}`);
    user.token = r.data.access_token; checks++;
  }
  const id = await rpc('create_lineage', { p_info: { name: 'Gia phả kiểm thử tích hợp' } }, users.admin);
  fixture.lineageId = id;
  fs.writeFileSync(file, JSON.stringify(fixture, null, 2), { mode: 0o600 });
  await rpc('set_lineage_access', { p_lineage_id: id, p_user_id: users.editor.id, p_role: 'editor' }, users.admin);
  await rpc('set_lineage_access', { p_lineage_id: id, p_user_id: users.viewer.id, p_role: 'viewer' }, users.admin);
  const info = { name: 'Gia phả kiểm thử tích hợp' };
  let members = [{ id: 'ROOT', full_name: 'Tổ kiểm thử', notes: 'Private test note', parent_id: '-' },
    { id: 'CHILD', full_name: 'Thành viên kiểm thử', parent_id: 'ROOT', generation: '2' },
    { id: 'ESCAPE', full_name: '<b data-injected="yes">Kiểm thử</b>', parent_id: 'ROOT', generation: '2' }];
  assert.equal(await rpc('save_lineage_state', { p_lineage_id: id, p_base_revision: 0, p_info: info, p_members: members }, users.admin), 1);
  await rpc('save_lineage_state', { p_lineage_id: id, p_base_revision: 1, p_info: info, p_members: [] }, users.viewer, '42501');
  await rpc('set_lineage_access', { p_lineage_id: id, p_user_id: users.editor.id, p_role: 'admin' }, users.editor, '42501');
  const editorState = await rpc('get_lineage_state', { p_lineage_id: id }, users.editor);
  assert.equal(editorState.members.length, 3);
  const hidden = await request(`/rest/v1/members?lineage_id=eq.${id}&select=id`, undefined, users.outsider);
  assert.deepEqual(hidden.data, []); checks++;
  await rpc('get_lineage_state', { p_lineage_id: id }, users.outsider, '42501');
  const proposal = await rpc('submit_changes', { p_lineage_id: id, p_base_revision: 1,
    p_changes: [{ type: 'update_member', member_id: 'CHILD', new_value: { full_name: 'Thành viên đã duyệt' } }], p_title: 'Đổi tên kiểm thử' }, users.editor);
  await rpc('review_changes', { p_request_id: proposal, p_approve: true, p_reason: '' }, users.viewer, '42501');
  await rpc('review_changes', { p_request_id: proposal, p_approve: true, p_reason: '' }, users.admin);
  await rpc('review_changes', { p_request_id: proposal, p_approve: true, p_reason: '' }, users.admin, '23514');
  const approved = await rpc('get_lineage_state', { p_lineage_id: id }, users.admin);
  assert.equal(approved.revision, 2); assert.equal(approved.members.find(m => m.id === 'CHILD').full_name, 'Thành viên đã duyệt');
  const stale = await rpc('submit_changes', { p_lineage_id: id, p_base_revision: 2,
    p_changes: [{ type: 'update_member', member_id: 'ROOT', new_value: { full_name: 'Stale' } }], p_title: 'Stale revision' }, users.editor);
  await rpc('save_lineage_state', { p_lineage_id: id, p_base_revision: 2, p_info: info, p_members: approved.members }, users.admin);
  await rpc('review_changes', { p_request_id: stale, p_approve: true, p_reason: '' }, users.admin, 'PT409');
  await rpc('review_changes', { p_request_id: stale, p_approve: false, p_reason: 'Dữ liệu đã thay đổi' }, users.admin);
  const invalid = await rpc('submit_changes', { p_lineage_id: id, p_base_revision: 3,
    p_changes: [{ type: 'update_member', member_id: 'ROOT', new_value: { parent_id: 'CHILD' } }], p_title: 'Cycle must roll back' }, users.editor);
  await rpc('review_changes', { p_request_id: invalid, p_approve: true, p_reason: '' }, users.admin, '23514');
  const afterInvalid = await rpc('get_lineage_state', { p_lineage_id: id }, users.admin);
  assert.equal(afterInvalid.revision, 3); assert.equal(afterInvalid.members.find(m => m.id === 'ROOT').parent_id, '-');
  const invalidRow = await request(`/rest/v1/change_requests?id=eq.${invalid}&select=status`, undefined, users.admin);
  assert.equal(invalidRow.data[0].status, 'pending'); checks++;
  const shared = await rpc('create_access_link', { p_lineage_id: id, p_kind: 'share', p_role: 'viewer' }, users.admin);
  const guest = await rpc('read_shared_lineage', { p_token: shared });
  assert.equal(guest.members.length, 3); assert(guest.members.every(m => !('notes' in m)));
  await rpc('read_shared_lineage', { p_token: '0'.repeat(64) }, undefined, '42501');
  const invitation = await rpc('create_access_link', { p_lineage_id: id, p_kind: 'invite', p_role: 'editor' }, users.admin);
  assert.equal(await rpc('redeem_invite', { p_token: invitation }, users.viewer), id);
  assert.equal(await rpc('redeem_invite', { p_token: invitation }, users.outsider), id);
  const links = await rpc('list_access_links', { p_lineage_id: id }, users.admin);
  await rpc('revoke_access_link', { p_link_id: links.find(l => l.kind === 'share').id }, users.admin);
  await rpc('read_shared_lineage', { p_token: shared }, undefined, '42501');
  const unsigned = await request('/rest/v1/members?select=id&limit=1');
  assert([401,403].includes(unsigned.status)); checks++;
  console.log(`PASS: ${checks} live Auth/Data API/RPC checks, including roles, approval, revisions, rollback and bearer links.`);
  console.log('Disposable fixtures remain for browser verification; remove them after UI checks.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
