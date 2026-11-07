import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotChanges, describeError } from '../public/js/services/genealogy.js';
import { DataStore } from '../public/js/data-store.js';
import { escapeHTML } from '../public/js/html.js';
import { startGoogleOAuth, oauthReturnMessage } from '../public/js/services/auth.js';
import { slugify, portalRoute } from '../public/js/portal.js';
import { SupabaseController } from '../public/js/supabase-controller.js';
import { GenealogyService } from '../public/js/services/genealogy.js';
import { lifeDates, spouseRole, avatarSVG, calendarDate, lifespanAge } from '../public/js/member-presentation.js';
import { LunarCalendarManager } from '../public/js/lunar-calendar.js';
import { AutoLayout } from '../public/js/auto-layout.js';
import { Exporter } from '../public/js/export.js';
import { KinshipCalculator } from '../public/js/kinship.js';

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

test('node dates label births and deaths without inferring early death from missing data', () => {
  assert.equal(lifeDates({birth_date:'12/08/1990',death_date:'11/09/2045'}),'SN 12/08/1990 - Mất 11/09/2045');
  assert.equal(lifeDates({birth_date:'12/08/1990',status:'Mất sớm'}),'SN 12/08/1990 - Mất sớm');
  assert.equal(lifeDates({birth_date:'?',death_date:'Không rõ',status:'Đã mất'}),'Mất');
  assert.equal(lifeDates({status:'Mất sớm'}),'Mất sớm');
  assert.equal(lifeDates({birth_date:'1990',status:'Còn sống'}),'SN 1990');
  assert.equal(lifeDates({}),'');
});
test('spouse labels use the partner gender and avatars never include initials', () => {
  assert.equal(spouseRole({gender:'Nam'},{gender:'Nữ'}),'Vợ');
  assert.equal(spouseRole({gender:'Nữ'},{gender:'Nam'}),'Chồng');
  assert.equal(spouseRole({gender:'Nữ'}),'Chồng');
  assert.equal(spouseRole({}), 'Vợ/Chồng');
  assert.match(avatarSVG('Nữ'),/Avatar nữ/);
  assert.match(avatarSVG('Nam'),/Avatar nam/);
  assert(!avatarSVG('Nữ').includes('<text'));
});
test('linking a spouse does not hide the family ancestor and its descendants in the outline', () => {
  const store=new DataStore(); store.loadState({members:[
    {id:'A',full_name:'Ancestor',spouse_id:'B',parent_id:'-'},
    {id:'B',full_name:'Partner',spouse_id:'A',parent_id:'-',branch_type:'Ngoại tộc (Phối ngẫu)'},
    {id:'C',full_name:'Child',parent_id:'A'}]});
  assert.deepEqual(store.getRootMembers().map(m=>m.id),['A']);
  assert.equal(store.getChildren('A')[0].id,'C');
});
test('SVG export retains avatar and date/spouse labels while escaping member names', async () => {
  const store=new DataStore(); store.loadState({lineageInfo:{name:'Test'},members:[
    {id:'A',full_name:'A <script>',gender:'Nam',generation:'1',birth_date:'1990',status:'Mất sớm',spouse_id:'B'},
    {id:'B',full_name:'B & C',gender:'Nữ',generation:'1',spouse_id:'A'}]});
  const old=Exporter.downloadBlob; let blob;
  Exporter.downloadBlob=value=>{blob=value;};
  try { Exporter.exportSVG({dataStore:store,layout:new AutoLayout()}); } finally { Exporter.downloadBlob=old; }
  const text=await blob.text();
  assert.match(text,/Avatar nam/); assert.match(text,/Avatar nữ/);
  assert.match(text,/SN 1990 - Mất sớm/); assert.match(text,/Vợ: B &amp; C/);
  assert.match(text,/A &lt;script&gt;/); assert(!text.includes('<script>'));
});

test('adding children and spouses after deletions never overwrites an existing ID or changes parent/spouse links', () => {
  const store=new DataStore(); store.loadState({members:[
    {id:'P001',full_name:'Father',spouse_id:'P004'},
    {id:'P003',full_name:'Existing child',parent_id:'P001',gender:'Nam',birth_date:'1992'},
    {id:'P004',full_name:'Mother',spouse_id:'P001',branch_type:'Ngoại tộc (Phối ngẫu)'}]});
  const child=store.addMember({parent_id:'P001',full_name:'New child',birth_date:'1990'});
  assert.equal(child.id,'P005'); assert.equal(store.members.size,4);
  assert.equal(child.parent_id,'P001'); assert.equal(child.spouse_id,'');
  assert.equal(store.getSpouseMember('P001').full_name,'Mother');
  assert.match(KinshipCalculator.calculateRelationship(store,'P003',child.id),/Em trai ruột/);
  assert.throws(()=>store.addMember({id:'P004',full_name:'Overwrite'}),/đã tồn tại/);
  const newPartner=store.addSpouseAsMember('P003'); assert.equal(newPartner.id,'P006');
  assert.equal(store.getMember('P005').parent_id,'P001');
  const mothersChild=store.addMember({parent_id:'P004',full_name:'Child linked to mother'});
  assert.equal(mothersChild.spouse_id,''); assert.equal(mothersChild.parent_id,'P004');
  assert(store.getRootMembers().some(m=>m.id==='P004'));
  assert.equal(store.getSpouseMember('P001').id,'P004');
});
test('sibling movement changes the whole branch order, persists in snapshots and supports undo without changing relations', () => {
  const store=new DataStore(); store.loadState({members:[
    {id:'R',full_name:'Parent'},
    {id:'A',full_name:'First',parent_id:'R',gender:'Nam',birth_date:'1990',spouse_id:'S'},
    {id:'B',full_name:'Second',parent_id:'R',gender:'Nữ',birth_date:'1992'},
    {id:'C',full_name:'Grandchild',parent_id:'A'},
    {id:'S',full_name:'Partner',spouse_id:'A'}]});
  store.initializeTracking();
  const order=()=>store.getChildren('R').map(m=>m.id);
  assert.deepEqual(order(),['A','B']); assert.equal(store.moveSibling('A',-1),false);
  assert.equal(store.history.length,0);
  assert.equal(store.moveSibling('B',-1),true); assert.deepEqual(order(),['B','A']);
  assert.equal(store.getMember('A').parent_id,'R'); assert.equal(store.getMember('A').spouse_id,'S');
  assert.equal(store.getMember('C').parent_id,'A');
  assert.match(KinshipCalculator.calculateRelationship(store,'B','A'),/Chị ruột/);
  const layout=new AutoLayout().calculateLayout(store);
  assert(layout.positions.get('B').x<layout.positions.get('A').x);
  const reloaded=new DataStore(); reloaded.loadState({members:JSON.parse(JSON.stringify(store.getAllMembers()))});
  assert.deepEqual(reloaded.getChildren('R').map(m=>m.id),['B','A']);
  assert(store.getTrackedChanges().every(c=>c.type==='update_member' && 'sibling_order' in c.new_value));
  assert(store.undo()); assert.deepEqual(order(),['A','B']); assert(store.redo()); assert.deepEqual(order(),['B','A']);
  store.readOnly=true; assert.equal(store.moveSibling('A',-1),false); assert.deepEqual(order(),['B','A']);
});

test('lifespan uses solar dates, completed birthdays and optional manual override', () => {
  assert.equal(lifespanAge({birth_date:'12/08/1990',death_date_solar:'11/08/2045'}),54);
  assert.equal(lifespanAge({birth_date:'1990-08-12',death_date_solar:'2045-08-12'}),55);
  assert.equal(lifespanAge({birth_date:'SN 1990',death_date_solar:'2045'}),55);
  assert.equal(lifespanAge({birth_date:'1990',death_date:'15/08/2045 Âm'}),null);
  assert.equal(lifespanAge({birth_date:'1990',death_date_solar:'1980'}),null);
  assert.equal(lifespanAge({birth_date:'1990',death_date_solar:'2045',lifespan_override:'72'}),72);
  assert.equal(lifespanAge({lifespan_override:0}),0);
  assert.equal(calendarDate('31/02/2020'),null);
  assert.equal(calendarDate('29/02/2020').day,29);
});
test('anniversary calendars use independent lunar and solar fields with unknown-date groups', () => {
  const store=new DataStore();store.loadState({members:[{id:'A',status:'Đã mất',death_date:'15/08 Âm',death_date_solar:'2020-09-03'},{id:'B',status:'Mất sớm'}]});
  const lunar=LunarCalendarManager.getAnniversariesByMonth(store,'lunar'),solar=LunarCalendarManager.getAnniversariesByMonth(store,'solar');
  assert.equal(lunar.months[7].items[0].day,15);assert.equal(solar.months[8].items[0].day,3);
  assert.equal(lunar.unknownItems[0].id,'B');assert.equal(solar.unknownItems[0].id,'B');
});
