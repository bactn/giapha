-- Transactional fixtures: no test users or links remain after the run.
begin;
do $$
declare
  owner_id uuid := gen_random_uuid();
  other_admin uuid := gen_random_uuid();
  viewer_id uuid := gen_random_uuid();
  family uuid;
  share_token text;
  invite_token text;
begin
  insert into auth.users(id) values(owner_id),(other_admin),(viewer_id);
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  set local role authenticated;
  family := public.create_lineage('{"name":"Link lifecycle test"}');
  perform public.set_lineage_access(family, other_admin, 'admin');
  share_token := public.create_access_link(family, 'share', 'viewer');
  invite_token := public.create_access_link(family, 'invite', 'viewer');
  reset role;
  update giapha_private.access_links set expires_at = now() - interval '1 second' where lineage_id=family;
  set local role anon;
  begin
    perform public.read_shared_lineage(share_token);
    raise exception 'FAIL: expired share was readable';
  exception when insufficient_privilege then null; end;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', viewer_id::text, true);
  begin
    perform public.redeem_invite(invite_token);
    raise exception 'FAIL: expired invitation was accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  share_token := public.create_access_link(family, 'share', 'viewer');
  invite_token := public.create_access_link(family, 'invite', 'viewer');
  perform set_config('request.jwt.claim.sub', other_admin::text, true);
  perform public.set_lineage_access(family, owner_id, 'viewer');
  set local role anon;
  begin
    perform public.read_shared_lineage(share_token);
    raise exception 'FAIL: demoted issuer share was readable';
  exception when insufficient_privilege then null; end;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', viewer_id::text, true);
  begin
    perform public.redeem_invite(invite_token);
    raise exception 'FAIL: demoted issuer invitation was accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.list_access_links(family);
    raise exception 'FAIL: outsider listed links';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public.lineage_access where lineage_id=family and user_id=viewer_id) then
    raise exception 'FAIL: invalid invitation granted access';
  end if;
end;
$$;
rollback;
