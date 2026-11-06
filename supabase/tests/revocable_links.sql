-- All synthetic accounts, families, links and approvals are rolled back.
begin;
do $$
declare owner_id uuid:=gen_random_uuid(); editor_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid();
  family uuid; token text; edit_token text; edit_link uuid; request_id uuid; rev bigint;
begin
  insert into auth.users(id) values(owner_id),(editor_id),(other_id);
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  set local role authenticated;
  family:=public.create_lineage('{"name":"Disposable link lifecycle"}');
  rev:=public.save_lineage_state(family,0,'{"name":"Disposable link lifecycle"}',
    '[{"id":"A","full_name":"Before","notes":"private"}]');
  token:=public.create_access_link(family,'share','viewer');
  -- Old clients used #invite URLs for viewer links. They now become guest links.
  edit_token:=public.create_access_link(family,'invite','viewer','forever');
  perform set_config('request.jwt.claim.sub','',true);
  set local role anon;
  perform public.read_shared_lineage(edit_token);
  if not public.can_read_lineage(family,edit_token) then raise exception 'FAIL: legacy viewer probe'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.revoke_access_link((select id from public.list_access_links(family) where expires_at is null));
  if not exists(select 1 from public.list_access_links(family) where expires_at between now()+interval '6 days' and now()+interval '8 days') then
    raise exception 'FAIL: default duration'; end if;
  begin
    perform public.create_access_link(family,'share','viewer','invalid');
    raise exception 'FAIL: invalid duration';
  exception when check_violation then null; end;
  begin perform public.create_access_link(family,'share','editor','forever'); raise exception 'FAIL: writable share'; exception when check_violation then null; end;
  begin perform public.create_access_link(family,null,'viewer','7days'); raise exception 'FAIL: null kind'; exception when check_violation then null; end;
  begin perform public.create_access_link(family,'invite','admin','7days'); raise exception 'FAIL: admin invitation'; exception when check_violation then null; end;
  perform set_config('request.jwt.claim.sub','',true);
  set local role anon;
  if not public.can_read_lineage(family,token) or public.can_read_lineage(family) then raise exception 'FAIL: guest access probe'; end if;
  if public.read_shared_lineage(token)->'members'->0->>'full_name'<>'Before'
    or public.read_shared_lineage(token)->'members'->0 ? 'notes' then raise exception 'FAIL: anonymous limited view'; end if;
  begin perform public.redeem_invite(token); raise exception 'FAIL: anonymous redemption'; exception when insufficient_privilege then null; end;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.revoke_access_link((select id from public.list_access_links(family) where kind='share'));
  if exists(select 1 from public.list_access_links(family)) then raise exception 'FAIL: revoked list visible'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  set local role anon;
  if public.can_read_lineage(family,token) then raise exception 'FAIL: revoked probe'; end if;
  begin perform public.read_shared_lineage(token); raise exception 'FAIL: revoked guest read'; exception when insufficient_privilege then null; end;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  token:=public.create_access_link(family,'share','viewer','forever');
  edit_token:=public.create_access_link(family,'invite','editor','forever');
  select id into edit_link from public.list_access_links(family) where kind='invite';
  if (select count(*) from public.list_access_links(family) where expires_at is null)<>2 then raise exception 'FAIL: unlimited duration'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  set local role anon;
  perform public.read_shared_lineage(token); -- Null expiration really is usable.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',editor_id::text,true);
  perform public.redeem_invite(edit_token);
  perform public.redeem_invite(edit_token); -- Reopening the same link is safe.
  if not public.can_read_lineage(family) then raise exception 'FAIL: link editor probe'; end if;
  if giapha_private.lineage_role(family)<>'editor' or jsonb_array_length(public.list_my_lineages())<>1 then raise exception 'FAIL: link editor role/list'; end if;
  begin perform public.save_lineage_state(family,1,'{"name":"bypass"}','[]'); raise exception 'FAIL: direct edit'; exception when insufficient_privilege then null; end;
  request_id:=public.submit_changes(family,1,'[{"type":"update_member","member_id":"A","new_value":{"full_name":"Approved"}},
    {"type":"add_member","new_value":{"id":"B","parent_id":"A"}},
    {"type":"add_member","new_value":{"id":"C"}}, {"type":"delete_member","member_id":"C"},
    {"type":"update_info","new_value":{"name":"Approved family"}}]','Link editor request');
  if public.get_lineage_state(family)->'members'->0->>'full_name'<>'Before' then raise exception 'FAIL: proposal applied early'; end if;
  begin perform public.review_changes(request_id,true,''); raise exception 'FAIL: editor approval'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',other_id::text,true);
  perform public.redeem_invite(edit_token); -- Link can be shared with multiple people.
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.review_changes(request_id,true,'');
  if public.get_lineage_state(family)->'members'->0->>'full_name'<>'Approved' then raise exception 'FAIL: admin approval'; end if;
  if jsonb_array_length(public.get_lineage_state(family)->'members')<>2 or public.get_lineage_state(family)->'lineageInfo'->>'name'<>'Approved family' then raise exception 'FAIL: full proposal approval'; end if;
  perform public.revoke_access_link(edit_link);
  perform set_config('request.jwt.claim.sub',editor_id::text,true);
  if public.can_read_lineage(family) then raise exception 'FAIL: revoked editor probe'; end if;
  if giapha_private.lineage_role(family) is not null or public.list_my_lineages()<>'[]'::jsonb then raise exception 'FAIL: revoked link role persists'; end if;
  begin perform public.get_lineage_state(family); raise exception 'FAIL: revoked editor read'; exception when insufficient_privilege then null; end;
  begin perform public.submit_changes(family,2,'[{"type":"delete_member","member_id":"A"}]','Revoked'); raise exception 'FAIL: revoked proposal'; exception when insufficient_privilege then null; end;
  begin perform public.redeem_invite(edit_token); raise exception 'FAIL: revoked redemption'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',other_id::text,true);
  if giapha_private.lineage_role(family) is not null then raise exception 'FAIL: second user retained link role'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.set_lineage_publication(family,'fixture-'||family::text,'','',true);
  perform set_config('request.jwt.claim.sub','',true);
  set local role anon;
  if not public.can_read_lineage(family,null,'fixture-'||family::text)
    or public.can_read_lineage(gen_random_uuid(),null,'fixture-'||family::text) then raise exception 'FAIL: public page probe isolation'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.set_lineage_publication(family,'fixture-'||family::text,'','',false);
  perform set_config('request.jwt.claim.sub','',true);
  set local role anon;
  if public.can_read_lineage(family,null,'fixture-'||family::text) then raise exception 'FAIL: private page probe'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  edit_token:=public.create_access_link(family,'invite','editor','7days');
  select id into edit_link from public.list_access_links(family) where kind='invite';
  perform set_config('request.jwt.claim.sub',editor_id::text,true);
  perform public.redeem_invite(edit_token);
  reset role;
  update giapha_private.access_links set expires_at=now()-interval '1 second' where id=edit_link;
  set local role authenticated;
  if giapha_private.lineage_role(family) is not null then raise exception 'FAIL: expired editor role persists'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  if exists(select 1 from public.list_access_links(family) where id=edit_link) then raise exception 'FAIL: expired link visible'; end if;
  -- An independent administrator grant intentionally survives link revocation.
  perform public.set_lineage_access(family,editor_id,'viewer');
  perform set_config('request.jwt.claim.sub',editor_id::text,true);
  if giapha_private.lineage_role(family)<>'viewer' then raise exception 'FAIL: independent grant lost'; end if;
  reset role;
end;
$$;
rollback;
select 'PASS: anonymous view, default/unlimited/invalid durations, reusable authenticated edit, pending approval, admin approval, revocation, expiry, active-only lists, independent grants; all fixtures rolled back' as result;
