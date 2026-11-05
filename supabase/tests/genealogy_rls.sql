-- Run as postgres through the SQL editor/MCP. All fixtures are rolled back.
begin;
do $$
declare
  admin_id uuid := gen_random_uuid();
  editor_id uuid := gen_random_uuid();
  viewer_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  first_lineage uuid;
  other_lineage uuid;
  state jsonb;
  before_audit bigint;
  revision bigint;
begin
  insert into auth.users(id) values (admin_id), (editor_id), (viewer_id), (outsider_id);
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  set local role authenticated;

  first_lineage := public.create_lineage('{"name":"RLS test family","origin":"test"}');
  if (select role from public.lineage_access where lineage_id = first_lineage and user_id = admin_id) <> 'admin' then
    raise exception 'FAIL: creator must be administrator';
  end if;
  perform public.set_lineage_access(first_lineage, editor_id, 'editor');
  perform public.set_lineage_access(first_lineage, viewer_id, 'viewer');
  if (select count(*) from public.lineage_access where lineage_id = first_lineage) <> 3 then
    raise exception 'FAIL: admin must see the access list';
  end if;
  begin
    perform public.set_lineage_access(first_lineage, admin_id, 'viewer');
    raise exception 'FAIL: removed last administrator';
  exception when check_violation then null; end;
  begin
    perform public.set_lineage_access(first_lineage, admin_id, null);
    raise exception 'FAIL: revoked last administrator';
  exception when check_violation then null; end;

  revision := public.save_lineage_state(first_lineage, 0, '{"name":"RLS test family","custom_info":"retained"}',
    '[{"id":"P001","parent_id":"-","spouse_id":"P002","full_name":"Root","birth_date":"unknown","extra":"kept"},
      {"id":"P002","parent_id":"-","spouse_id":"P001"},
      {"id":"P003","parent_id":"P001","spouse_id":"-"}]');
  state := public.get_lineage_state(first_lineage);
  if revision <> 1 or (state->>'revision')::bigint <> 1 or jsonb_array_length(state->'members') <> 3
    or state->'members'->0->>'extra' <> 'kept' or state->'lineageInfo'->>'custom_info' <> 'retained' then
    raise exception 'FAIL: snapshot round-trip/revision/unknown fields';
  end if;
  select count(*) into before_audit from public.audit_events where lineage_id = first_lineage;
  begin
    perform public.save_lineage_state(first_lineage, 0, '{"name":"stale"}', '[]');
    raise exception 'FAIL: stale revision accepted';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.save_lineage_state(first_lineage, 1, '{"name":"duplicate"}', '[{"id":"P001"},{"id":"P001"}]');
    raise exception 'FAIL: duplicate member IDs accepted';
  exception when unique_violation then null; end;
  begin
    perform public.save_lineage_state(first_lineage, 1, '{"name":"dangling"}', '[{"id":"P001","parent_id":"missing"}]');
    raise exception 'FAIL: dangling parent accepted';
  exception when foreign_key_violation then null; end;
  begin
    perform public.save_lineage_state(first_lineage, 1, '{"name":"dangling"}', '[{"id":"P001","spouse_id":"missing"}]');
    raise exception 'FAIL: dangling spouse accepted';
  exception when foreign_key_violation then null; end;
  begin
    perform public.save_lineage_state(first_lineage, 1, '{"name":"cycle"}', '[{"id":"P001","parent_id":"P002"},{"id":"P002","parent_id":"P001"}]');
    raise exception 'FAIL: ancestry cycle accepted';
  exception when check_violation then null; end;
  begin
    perform public.save_lineage_state(first_lineage, 1, '{"name":"self"}', '[{"id":"P001","spouse_id":"P001"}]');
    raise exception 'FAIL: self relationship accepted';
  exception when check_violation then null; end;
  if public.get_lineage_state(first_lineage) <> state
     or (select count(*) from public.audit_events where lineage_id = first_lineage) <> before_audit then
    raise exception 'FAIL: rejected saves changed state/revision/audit';
  end if;
  begin
    insert into public.members(lineage_id, id, data) values (first_lineage, 'bad', '{"id":"bad"}');
    raise exception 'FAIL: direct writes bypassed save RPC';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub', editor_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', editor_id, 'user_metadata', jsonb_build_object('role', 'admin'))::text, true);
  if jsonb_array_length(public.get_lineage_state(first_lineage)->'members') <> 3 then
    raise exception 'FAIL: editor cannot read';
  end if;
  if (select count(*) from public.lineage_access where lineage_id = first_lineage) <> 1 then
    raise exception 'FAIL: editor saw another user access row';
  end if;
  begin
    perform public.save_lineage_state(first_lineage, 1, '{"name":"forged"}', '[]');
    raise exception 'FAIL: editor/forged metadata wrote canonical data';
  exception when insufficient_privilege then null; end;
  begin
    perform public.set_lineage_access(first_lineage, editor_id, 'admin');
    raise exception 'FAIL: editor promoted self';
  exception when insufficient_privilege then null; end;
  begin
    update public.lineage_access set role = 'admin' where user_id = editor_id;
    raise exception 'FAIL: direct access update permitted';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public.audit_events where lineage_id = first_lineage) then
    raise exception 'FAIL: editor saw admin audit';
  end if;

  perform set_config('request.jwt.claim.sub', viewer_id::text, true);
  perform public.get_lineage_state(first_lineage);
  begin
    perform public.save_lineage_state(first_lineage, 1, '{"name":"viewer"}', '[]');
    raise exception 'FAIL: viewer wrote canonical data';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.change_requests(lineage_id, submitted_by, base_revision, changes, status, reviewed_by, reviewed_at)
      values(first_lineage, viewer_id, 1, '[{}]', 'approved', viewer_id, now());
    raise exception 'FAIL: client forged approval';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub', outsider_id::text, true);
  if exists(select 1 from public.lineages where id = first_lineage)
    or exists(select 1 from public.members where lineage_id = first_lineage)
    or exists(select 1 from public.lineage_access where lineage_id = first_lineage) then
    raise exception 'FAIL: cross-lineage read';
  end if;
  begin
    perform public.get_lineage_state(first_lineage);
    raise exception 'FAIL: outsider read snapshot via RPC';
  exception when insufficient_privilege then null; end;
  begin
    perform public.set_lineage_access(first_lineage, outsider_id, 'admin');
    raise exception 'FAIL: outsider granted access';
  exception when insufficient_privilege then null; end;
  other_lineage := public.create_lineage('{"name":"other family"}');
  perform public.save_lineage_state(other_lineage, 0, '{"name":"other family"}', '[{"id":"OTHER"}]');

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  begin
    perform public.save_lineage_state(first_lineage, 1, '{"name":"cross family parent"}', '[{"id":"P001","parent_id":"OTHER"}]');
    raise exception 'FAIL: cross-lineage relationship accepted';
  exception when foreign_key_violation then null; end;
  perform public.set_lineage_access(first_lineage, editor_id, null);
  perform set_config('request.jwt.claim.sub', editor_id::text, true);
  if exists(select 1 from public.members where lineage_id = first_lineage) then
    raise exception 'FAIL: revoked access remains readable';
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin
    perform public.create_lineage('{"name":"anonymous"}');
    raise exception 'FAIL: anon created lineage';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.members;
    raise exception 'FAIL: anon read table';
  exception when insufficient_privilege then null; end;
  reset role;
end;
$$;
rollback;
select 'PASS: ownership, isolation, read/write roles, role escalation, revocation, last admin, revisions, references, cycles, atomic rollback and anon access; fixtures rolled back' as result;
