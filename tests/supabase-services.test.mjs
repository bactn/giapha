import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotChanges, describeError } from '../public/js/services/genealogy.js';
import { DataStore } from '../public/js/data-store.js';
import { escapeHTML } from '../public/js/html.js';
import { startGoogleOAuth, oauthReturnMessage } from '../public/js/services/auth.js';
import { slugify, portalRoute } from '../public/js/portal.js';
import { SupabaseController } from '../public/js/supabase-controller.js';
import { GenealogyService } from '../public/js/services/genealogy.js';

test('snapshot diff includes new fields and info changes without derived statistics noise', () => {
  const before = { lineageInfo: { name: 'Family', total_members: 1 }, members: [{ id: 'A', full_name: 'Old' }] };
  const after = { lineageInfo: { name: 'Family', total_members: 2, generations: 3 }, members: [{ id: 'A', full_name: 'New', occupation: 'Teacher' }, { id: 'B', parent_id: 'A' }] };
  const changes = snapshotChanges(before, after);
  assert.equal(changes.length, 2);
  assert.deepEqual({ ...changes[0].new_value }, { full_name: 'New', occupation: 'Teacher' });
  assert.equal(changes[1].type, 'add_member');
  after.lineageInfo.name = 'Renamed';
  assert.equal(snapshotChanges(before, after).at(-1).type, 'update_info');
});
test('edits made during an asynchronous save remain dirty against the saved snapshot', () => {
  const store = new DataStore();
  store.loadState({ members: [{ id: 'A', full_name: 'Initial' }] });
  store.initializeTracking();
  store.updateMember('A', { full_name: 'Captured for save' });
  const captured = JSON.parse(JSON.stringify(store.getAllMembers()));
  store.updateMember('A', { full_name: 'Typed while saving' });
  store.initializeTracking(captured);
  assert.equal(store.getTrackedChanges()[0].new_value.full_name, 'Typed while saving');
});
test('viewer mutation attempts do not modify graph or undo history', () => {
  const store = new DataStore();
  store.loadState({ members: [{ id: 'A', full_name: 'Read only' }] });
  store.readOnly = true;
  assert.throws(() => store.updateMember('A', { full_name: 'Forbidden' }), /quyền xem/);
  assert.throws(() => store.addMember({ id: 'B' }), /quyền xem/);
  assert.equal(store.getMember('A').full_name, 'Read only');
  assert.equal(store.undo(), false);
  assert.equal(store.history.length, 0);
});
test('untrusted text is escaped for HTML and quoted attributes', () => {
  const text = '<img src=x onerror="alert(1)"> & \'quoted\'';
  const escaped = escapeHTML(text);
  assert(!escaped.includes('<'));
  assert(!escaped.includes('"'));
  assert(escaped.includes('&quot;'));
  assert(escaped.includes('&#39;'));
});
test('business conflicts instruct users to keep drafts and reconcile', () => {
  assert.match(describeError({ code: 'PT409' }), /Bản nháp vẫn được giữ/);
  assert.match(describeError({ code: '40001' }), /đối chiếu/);
});

test('Google login stays on the app when the hosted provider is disabled', async () => {
  let redirected = false;
  const client = { auth: { signInWithOAuth: async () => { redirected = true; } } };
  await assert.rejects(startGoogleOAuth(client, { url: 'https://project.supabase.co', publishableKey: 'public-key' },
    'https://bactn.github.io/giapha/index.html', async () => ({ ok: true, json: async () => ({ external: { google: false } }) })), /chưa sẵn sàng/);
  assert.equal(redirected, false);
});

test('Google OAuth returns to the Pages subpath and only requests basic identity scopes', async () => {
  let request;
  const client = { auth: { signInWithOAuth: async options => { request = options; return { error: null }; } } };
  await startGoogleOAuth(client, { url: 'https://project.supabase.co', publishableKey: 'public-key' },
    'https://bactn.github.io/giapha/index.html', async (url, options) => {
      assert.equal(url, 'https://project.supabase.co/auth/v1/settings');
      assert.deepEqual(options.headers, { apikey: 'public-key' });
      return { ok: true, json: async () => ({ external: { google: true } }) };
    });
  assert.equal(request.provider, 'google');
  assert.equal(request.options.redirectTo, 'https://bactn.github.io/giapha/index.html');
  assert.equal(request.options.scopes, 'openid email profile');
  assert.equal(request.options.queryParams.prompt, 'select_account');
});

test('OAuth cancellation is readable and does not echo untrusted callback descriptions', () => {
  assert.match(oauthReturnMessage('https://bactn.github.io/giapha/index.html#error=access_denied'), /hủy/);
  assert.match(oauthReturnMessage('https://bactn.github.io/giapha/index.html?error=server_error&error_description=private-data'), /Không thể/);
  assert(!oauthReturnMessage('https://bactn.github.io/giapha/index.html#error=server_error&error_description=private-data').includes('private-data'));
  assert.equal(oauthReturnMessage('https://bactn.github.io/giapha/index.html#invite=token'), '');
});

test('portal links remain compatible with Pages, including Vietnamese slugs and old share links', () => {
  assert.equal(slugify('Họ Trần Ngọc — Chi 2'), 'ho-tran-ngoc-chi-2');
  assert.deepEqual(portalRoute('#family=ho-tran-ngoc'), { page: 'family', value: 'ho-tran-ngoc' });
  assert.equal(portalRoute('#account').page, 'account');
  assert.equal(portalRoute('#requests').page, 'requests');
  assert.deepEqual(portalRoute('#share=legacy-token'), { page: 'share', value: 'legacy-token' });
  assert.deepEqual(portalRoute('#invite=invitation'), { page: 'invite', value: 'invitation' });
});

test('editor save submits the entire draft for approval and never writes canonical data', async () => {
  const app = { userRole:'editor', lineageId:'family', showToast() {} };
  const c = new SupabaseController(app);
  c.base = { lineageInfo:{name:'Before'},members:[{id:'A',full_name:'Old'},{id:'B'}] };
  c.capture = () => ({lineageInfo:{name:'After'},members:[{id:'A',full_name:'New'},{id:'C'}]});
  c.revision = 5;
  c.client = {auth:{getUser:async()=>({data:{user:{id:'editor'}}})}};
  let submitted = 0;
  c.service = { save() { assert.fail('Editor wrote canonical data'); }, submit:async(id,revision,changes)=>{
    submitted++; assert.equal(id,'family'); assert.equal(revision,5);
    assert.deepEqual(new Set(changes.map(c=>c.type)),new Set(['update_member','delete_member','add_member','update_info']));
  }};
  await c.save(); await c.save();
  assert.equal(submitted,1); assert.equal(c.base.lineageInfo.name,'Before');
});

test('expired login prevents sending a draft and freezes editing', async () => {
  const app={userRole:'editor',lineageId:'family',dataStore:{readOnly:false},showToast(){}};
  const c=new SupabaseController(app); c.base={lineageInfo:{name:'A'},members:[]};
  c.capture=()=>({lineageInfo:{name:'B'},members:[]});
  c.client={auth:{getUser:async()=>({data:{user:null}})}};
  c.service={submit(){assert.fail('Unauthenticated proposal');}};
  let prompted=false; c.showLogin=()=>{prompted=true;};
  await c.save(); assert.equal(prompted,true); assert.equal(app.dataStore.readOnly,true);
});

test('link duration defaults to seven days and explicit unlimited duration reaches the RPC', async () => {
  const calls=[]; const service=new GenealogyService({rpc:async(name,args)=>{calls.push({name,args}); return {data:'token'};}});
  await service.link('family','share','viewer');
  await service.link('family','invite','editor','forever');
  assert.equal(calls[0].args.p_duration,'7days'); assert.equal(calls[1].args.p_duration,'forever');
  await service.list(); assert.equal(calls[2].name,'list_my_lineages');
  await service.canRead('family','token');
  assert.deepEqual(calls[3],{name:'can_read_lineage',args:{p_lineage_id:'family',p_share_token:'token',p_public_slug:null}});
});

test('old viewer invitation URLs open as guests, while edit links continue to login', async () => {
  const c=new SupabaseController({}); let opened;
  c.client={auth:{getUser:async()=>({data:{user:null}})}};
  c.service={shared:async()=>({lineage_id:'family'})};
  c.open=async(id,role)=>{opened={id,role};}; c.callbackUrl=()=> 'https://bactn.github.io/giapha/index.html';
  const oldHistory=globalThis.history; globalThis.history={replaceState(){}};
  try { assert.equal(await c.openViewerInvite('legacy'),true); assert.deepEqual(opened,{id:'family',role:'viewer'}); assert.equal(c.user,null); }
  finally { if (oldHistory===undefined) delete globalThis.history; else globalThis.history=oldHistory; }
  c.service.shared=async()=>{throw {code:'42501'};}; opened=null;
  assert.equal(await c.openViewerInvite('edit'),false); assert.equal(opened,null);
});
