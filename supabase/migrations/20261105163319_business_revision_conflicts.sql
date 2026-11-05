-- Explicit business conflicts return HTTP 409; do not request database transaction retries.
create or replace function giapha_private.save_lineage_state(p_lineage_id uuid, p_base_revision bigint, p_info jsonb, p_members jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_revision bigint; v_old_info jsonb; v_old_members jsonb; v_actor uuid := auth.uid();
begin
  if v_actor is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  select revision, info into v_revision, v_old_info from public.lineages where id = p_lineage_id for update;
  if not found or giapha_private.lineage_role(p_lineage_id) is distinct from 'admin' then
    raise insufficient_privilege using message = 'Administrator access required';
  end if;
  if p_base_revision is null or p_base_revision <> v_revision then
    raise sqlstate 'PT409' using message = 'Lineage changed; reload and reconcile your draft';
  end if;
  if p_info is null or jsonb_typeof(p_info) <> 'object'
     or coalesce(length(btrim(p_info->>'name')), 0) not between 1 and 200
     or p_members is null or jsonb_typeof(p_members) <> 'array' then
    raise check_violation using message = 'Invalid lineage snapshot';
  end if;
  select coalesce(jsonb_agg(data order by id), '[]'::jsonb) into v_old_members
    from public.members where lineage_id = p_lineage_id;
  delete from public.members where lineage_id = p_lineage_id;
  insert into public.members(lineage_id, id, data)
    select p_lineage_id, item->>'id', item from jsonb_array_elements(p_members) item;
  -- Validate the complete snapshot immediately; bad references cannot reach the audit/revision update.
  set constraints public.members_parent_fk, public.members_spouse_fk immediate;
  set constraints public.members_parent_fk, public.members_spouse_fk deferred;
  if exists (
    with recursive ancestry as (
      select id, parent_id, array[id] as visited, false as cycle
        from public.members where lineage_id = p_lineage_id
      union all
      select p.id, p.parent_id, a.visited || p.id, p.id = any(a.visited)
        from ancestry a join public.members p on p.lineage_id = p_lineage_id and p.id = a.parent_id
        where not a.cycle
    ) select 1 from ancestry where cycle
  ) then raise check_violation using message = 'Parent relationship cycle detected'; end if;
  update public.lineages set info = p_info, revision = v_revision + 1, updated_at = now() where id = p_lineage_id;
  insert into public.audit_events(lineage_id, actor_id, action, details) values
    (p_lineage_id, v_actor, 'save_state', jsonb_build_object('base_revision', v_revision,
      'previous_info', v_old_info, 'previous_members', v_old_members, 'member_count', jsonb_array_length(p_members)));
  return v_revision + 1;
end;
$$;

create or replace function giapha_private.submit_changes(p_lineage_id uuid, p_base_revision bigint, p_changes jsonb, p_title text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_revision bigint; c jsonb; v_actor uuid := auth.uid();
begin
  if v_actor is null or giapha_private.lineage_role(p_lineage_id) is null then
    raise insufficient_privilege using message = 'Lineage access required';
  end if;
  select revision into v_revision from public.lineages where id = p_lineage_id for update;
  if giapha_private.lineage_role(p_lineage_id) is null then raise insufficient_privilege; end if;
  if p_base_revision is distinct from v_revision then raise sqlstate 'PT409' using message = 'Reload before submitting changes'; end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0
    or p_title is null or length(btrim(p_title)) not between 1 and 500 then
    raise check_violation using message = 'A title and nonempty changes are required';
  end if;
  for c in select value from jsonb_array_elements(p_changes) loop
    if c->>'type' is null or c->>'type' not in ('add_member', 'update_member', 'delete_member', 'update_info') then
      raise check_violation using message = 'Unknown change type';
    end if;
    if c->>'type' <> 'delete_member' and (c->'new_value' is null or jsonb_typeof(c->'new_value') <> 'object') then
      raise check_violation using message = 'Change value must be an object';
    end if;
    if c->>'type' in ('update_member', 'delete_member') and coalesce(c->>'member_id', '') = '' then
      raise check_violation using message = 'Member ID is required';
    end if;
  end loop;
  insert into public.change_requests(lineage_id, submitted_by, base_revision, changes, title)
    values(p_lineage_id, v_actor, v_revision, p_changes, btrim(p_title)) returning id into v_id;
  return v_id;
end;
$$;

create or replace function giapha_private.review_changes(p_request_id uuid, p_approve boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.change_requests; v_lineage uuid; v_info jsonb; v_map jsonb; c jsonb; mid text; v_actor uuid := auth.uid();
begin
  if v_actor is null then raise insufficient_privilege; end if;
  select lineage_id into v_lineage from public.change_requests where id = p_request_id;
  perform 1 from public.lineages where id = v_lineage for update;
  if giapha_private.lineage_role(v_lineage) is distinct from 'admin' then raise insufficient_privilege; end if;
  select * into r from public.change_requests where id = p_request_id for update;
  if r.status <> 'pending' then raise check_violation using message = 'Request already reviewed'; end if;
  if p_approve is null then raise check_violation using message = 'Review decision required'; end if;
  if p_approve then
    if r.base_revision <> (select revision from public.lineages where id = v_lineage) then
      raise sqlstate 'PT409' using message = 'Request is based on an older revision; ask the submitter to reconcile and resubmit';
    end if;
    select info into v_info from public.lineages where id = v_lineage;
    select coalesce(jsonb_object_agg(id, data), '{}'::jsonb) into v_map from public.members where lineage_id = v_lineage;
    for c in select value from jsonb_array_elements(r.changes) loop
      mid := c->>'member_id';
      if c->>'type' = 'add_member' then
        mid := c->'new_value'->>'id';
        if mid is null or v_map ? mid then raise check_violation using message = 'New member ID is missing or already exists'; end if;
        v_map := v_map || jsonb_build_object(mid, c->'new_value');
      elsif c->>'type' = 'update_member' then
        if not v_map ? mid or (c->'new_value' ? 'id' and c->'new_value'->>'id' is distinct from mid) then
          raise check_violation using message = 'Member does not exist or ID was changed';
        end if;
        v_map := jsonb_set(v_map, array[mid], (v_map->mid) || (c->'new_value'));
      elsif c->>'type' = 'delete_member' then
        if not v_map ? mid then raise check_violation using message = 'Member does not exist'; end if;
        v_map := v_map - mid;
      elsif c->>'type' = 'update_info' then v_info := c->'new_value';
      end if;
    end loop;
    perform giapha_private.save_lineage_state(v_lineage, r.base_revision, v_info,
      (select coalesce(jsonb_agg(value order by key), '[]'::jsonb) from jsonb_each(v_map)));
  end if;
  update public.change_requests set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = v_actor, reviewed_at = now(), rejection_reason = left(p_reason, 500) where id = p_request_id;
  insert into public.audit_events(lineage_id, actor_id, action, details)
    values(v_lineage, v_actor, case when p_approve then 'approve_changes' else 'reject_changes' end,
      jsonb_build_object('request_id', p_request_id));
end;
$$;
