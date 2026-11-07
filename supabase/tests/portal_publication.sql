-- Hosted regression check: all users, personal details and publications roll back.
begin;
do $$
declare owner_id uuid:=gen_random_uuid(); viewer_id uuid:=gen_random_uuid(); outsider_id uuid:=gen_random_uuid();
  family uuid; page jsonb; v_slug text:='portal-test-'||replace(gen_random_uuid()::text,'-','');
begin
  insert into auth.users(id) values(owner_id),(viewer_id),(outsider_id);
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  set local role authenticated;
  perform public.save_my_profile('Private Owner','0123456789','Private address');
  family:=public.create_lineage('{"name":"Portal fixture family","private_info":"hidden"}');
  perform public.set_lineage_access(family,viewer_id,'viewer');
  perform public.save_lineage_state(family,0,'{"name":"Portal fixture family","private_info":"hidden"}',
    '[{"id":"ROOT","full_name":"Public Name","birth_date":"1900","sibling_order":2,"death_date_solar":"1980-04-23","lifespan_override":"80","notes":"secret note","email":"private@example.invalid","phone":"private","address":"private","custom_private_field":"private"}]');
  perform public.set_lineage_publication(family,v_slug,'Public introduction','Public region',false);
  begin
    insert into public.lineage_publications(lineage_id,slug,title,is_public) values(gen_random_uuid(),'forbidden','forbidden',true);
    raise exception 'FAIL: direct publication writes bypass RPC';
  exception when insufficient_privilege then null; end;
  begin
    perform public.set_lineage_publication(family,'invalid slug','intro','region',true);
    raise exception 'FAIL: invalid slug accepted';
  exception when check_violation then null; end;
  page:=public.open_lineage_page(v_slug);
  if page->>'access_role'<>'admin' or page->'members'->0->>'notes'<>'secret note' then raise exception 'FAIL: owner private page'; end if;
  perform set_config('request.jwt.claim.sub',viewer_id::text,true);
  if exists(select 1 from public.profiles where id=owner_id) then raise exception 'FAIL: private contact details leaked'; end if;
  perform public.save_my_profile('Viewer','0987654321','Viewer private address');
  page:=public.open_lineage_page(v_slug);
  if page->>'access_role'<>'viewer' then raise exception 'FAIL: viewer private slug'; end if;
  begin
    perform public.set_lineage_publication(family,v_slug,'bad','bad',true);
    raise exception 'FAIL: viewer published family';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',outsider_id::text,true);
  begin
    perform public.open_lineage_page(v_slug);
    raise exception 'FAIL: outsider opened private family';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','',true);
  set local role anon;
  if exists(select 1 from public.lineage_publications where slug=v_slug) then raise exception 'FAIL: private metadata visible'; end if;
  begin
    perform public.open_lineage_page(v_slug);
    raise exception 'FAIL: anon opened private family';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_my_profile('bad','bad','bad');
    raise exception 'FAIL: anon saved profile';
  exception when insufficient_privilege then null; end;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  if (select phone from public.profiles where id=owner_id)<>'0123456789' then raise exception 'FAIL: owner profile was overwritten'; end if;
  perform public.set_lineage_publication(family,v_slug,'Public introduction','Public region',true);
  perform set_config('request.jwt.claim.sub','',true);
  set local role anon;
  page:=public.open_lineage_page(v_slug);
  if (page->>'public_read')::boolean is not true or page->>'access_role'<>'viewer'
    or page->'members'->0->>'full_name'<>'Public Name'
    or (page->'members'->0->>'sibling_order')::integer is distinct from 2
    or page->'members'->0 ?| array['notes','email','phone','address','custom_private_field','death_date_solar','lifespan_override']
    or page->'lineageInfo' ? 'private_info' then raise exception 'FAIL: public field allowlist'; end if;
  if not exists(select 1 from public.list_public_lineages('Portal fixture family') where slug=v_slug and member_count=1) then
    raise exception 'FAIL: opted-in family not discoverable'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.set_lineage_publication(family,v_slug,'Public introduction','Public region',false);
  perform set_config('request.jwt.claim.sub','',true);
  set local role anon;
  if exists(select 1 from public.list_public_lineages('Portal fixture family') where slug=v_slug) then raise exception 'FAIL: unpublished family listed'; end if;
  begin
    perform public.open_lineage_page(v_slug);
    raise exception 'FAIL: unpublished family readable';
  exception when insufficient_privilege then null; end;
end;
$$;
rollback;
select 'PASS: profiles self-only, private-by-default, admin opt-in, public allowlist, slug isolation and revocation; all fixtures rolled back' as result;
