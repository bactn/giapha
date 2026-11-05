alter table public.change_requests add column title text not null default '' check (length(title) <= 500);

create function giapha_private.submit_changes(p_lineage_id uuid, p_base_revision bigint, p_changes jsonb, p_title text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_revision bigint; c jsonb; v_actor uuid := auth.uid();
begin
  if v_actor is null or giapha_private.lineage_role(p_lineage_id) is null then
    raise insufficient_privilege using message = 'Lineage access required';
  end if;
  select revision into v_revision from public.lineages where id = p_lineage_id for update;
  if giapha_private.lineage_role(p_lineage_id) is null then raise insufficient_privilege; end if;
  if p_base_revision is distinct from v_revision then raise serialization_failure using message = 'Reload before submitting changes'; end if;
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

create function giapha_private.review_changes(p_request_id uuid, p_approve boolean, p_reason text)
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
      raise serialization_failure using message = 'Request is based on an older revision; ask the submitter to reconcile and resubmit';
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

create table giapha_private.access_links (
  id uuid primary key default gen_random_uuid(),
  lineage_id uuid not null references public.lineages(id) on delete cascade,
  token_hash bytea not null unique,
  kind text not null check (kind in ('share', 'invite')),
  role text not null check (role in ('viewer', 'editor')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked boolean not null default false,
  used_at timestamptz,
  check (kind <> 'share' or role = 'viewer')
);
create index access_links_lineage_idx on giapha_private.access_links(lineage_id);
create index access_links_created_by_idx on giapha_private.access_links(created_by);
alter table giapha_private.access_links enable row level security;
revoke all on giapha_private.access_links from public, anon, authenticated;

create function giapha_private.create_access_link(p_lineage_id uuid, p_kind text, p_role text)
returns text language plpgsql security definer set search_path = '' as $$
declare token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  perform 1 from public.lineages where id = p_lineage_id for update;
  if giapha_private.lineage_role(p_lineage_id) is distinct from 'admin' then raise insufficient_privilege; end if;
  insert into giapha_private.access_links(lineage_id, token_hash, kind, role, created_by)
    values(p_lineage_id, sha256(convert_to(token, 'UTF8')), p_kind, p_role, auth.uid());
  return token;
end;
$$;

create function giapha_private.redeem_invite(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare link giapha_private.access_links; v_lineage uuid; v_actor uuid := auth.uid();
begin
  if v_actor is null then raise insufficient_privilege; end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise insufficient_privilege using message = 'Invalid invitation'; end if;
  select lineage_id into v_lineage from giapha_private.access_links where token_hash = sha256(convert_to(p_token, 'UTF8'));
  perform 1 from public.lineages where id = v_lineage for update;
  select * into link from giapha_private.access_links where token_hash = sha256(convert_to(p_token, 'UTF8')) for update;
  if not found or link.kind <> 'invite' or link.revoked or link.expires_at <= now() or link.used_at is not null then
    raise insufficient_privilege using message = 'Invitation is invalid, expired or already used';
  end if;
  insert into public.lineage_access(lineage_id, user_id, role, granted_by)
    values(link.lineage_id, v_actor, link.role, link.created_by)
    on conflict(lineage_id, user_id) do update set role = case
      when public.lineage_access.role = 'viewer' and excluded.role = 'editor' then 'editor'
      else public.lineage_access.role end;
  update giapha_private.access_links set used_at = now() where id = link.id;
  insert into public.audit_events(lineage_id, actor_id, action) values(link.lineage_id, v_actor, 'redeem_invite');
  return link.lineage_id;
end;
$$;

-- Intentional guest endpoint: possession of a high-entropy, expiring bearer token
-- authorizes this limited read. No other anonymous table/function access is granted.
create function giapha_private.read_shared_lineage(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare link giapha_private.access_links; info jsonb; revision bigint; members jsonb;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise insufficient_privilege using message = 'Invalid share link'; end if;
  select * into link from giapha_private.access_links where token_hash = sha256(convert_to(p_token, 'UTF8'));
  if not found or link.kind <> 'share' or link.role <> 'viewer' or link.revoked or link.expires_at <= now() then
    raise insufficient_privilege using message = 'Share link is invalid, expired or revoked';
  end if;
  select l.info, l.revision into info, revision from public.lineages l where id = link.lineage_id;
  select coalesce(jsonb_agg(data - 'notes' order by id), '[]'::jsonb) into members
    from public.members where lineage_id = link.lineage_id;
  return jsonb_build_object('lineage_id', link.lineage_id, 'lineageInfo', info, 'members', members, 'revision', revision);
end;
$$;

create function giapha_private.list_access_links(p_lineage_id uuid)
returns table(id uuid, kind text, role text, expires_at timestamptz, revoked boolean, used_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or giapha_private.lineage_role(p_lineage_id) is distinct from 'admin' then raise insufficient_privilege; end if;
  return query select a.id, a.kind, a.role, a.expires_at, a.revoked, a.used_at
    from giapha_private.access_links a where a.lineage_id = p_lineage_id order by a.created_at desc;
end;
$$;
create function giapha_private.revoke_access_link(p_link_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_lineage uuid;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  select lineage_id into v_lineage from giapha_private.access_links where id = p_link_id;
  perform 1 from public.lineages where id = v_lineage for update;
  if giapha_private.lineage_role(v_lineage) is distinct from 'admin' then raise insufficient_privilege; end if;
  update giapha_private.access_links set revoked = true where id = p_link_id;
end;
$$;

create function public.submit_changes(p_lineage_id uuid, p_base_revision bigint, p_changes jsonb, p_title text) returns uuid
language sql security invoker set search_path = '' as $$ select giapha_private.submit_changes(p_lineage_id, p_base_revision, p_changes, p_title); $$;
create function public.review_changes(p_request_id uuid, p_approve boolean, p_reason text default '') returns void
language sql security invoker set search_path = '' as $$ select giapha_private.review_changes(p_request_id, p_approve, p_reason); $$;
create function public.create_access_link(p_lineage_id uuid, p_kind text, p_role text) returns text
language sql security invoker set search_path = '' as $$ select giapha_private.create_access_link(p_lineage_id, p_kind, p_role); $$;
create function public.redeem_invite(p_token text) returns uuid
language sql security invoker set search_path = '' as $$ select giapha_private.redeem_invite(p_token); $$;
create function public.read_shared_lineage(p_token text) returns jsonb
language sql stable security invoker set search_path = '' as $$ select giapha_private.read_shared_lineage(p_token); $$;
create function public.list_access_links(p_lineage_id uuid)
returns table(id uuid, kind text, role text, expires_at timestamptz, revoked boolean, used_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from giapha_private.list_access_links(p_lineage_id); $$;
create function public.revoke_access_link(p_link_id uuid) returns void
language sql security invoker set search_path = '' as $$ select giapha_private.revoke_access_link(p_link_id); $$;

revoke all on function giapha_private.submit_changes(uuid,bigint,jsonb,text), giapha_private.review_changes(uuid,boolean,text),
giapha_private.create_access_link(uuid,text,text), giapha_private.redeem_invite(text), giapha_private.read_shared_lineage(text),
giapha_private.list_access_links(uuid), giapha_private.revoke_access_link(uuid)
from public, anon, authenticated;
grant execute on function giapha_private.submit_changes(uuid,bigint,jsonb,text), giapha_private.review_changes(uuid,boolean,text),
giapha_private.create_access_link(uuid,text,text), giapha_private.redeem_invite(text), giapha_private.read_shared_lineage(text),
giapha_private.list_access_links(uuid), giapha_private.revoke_access_link(uuid) to authenticated;
grant usage on schema giapha_private to anon;
grant execute on function giapha_private.read_shared_lineage(text) to anon;
revoke all on function public.submit_changes(uuid,bigint,jsonb,text), public.review_changes(uuid,boolean,text),
public.create_access_link(uuid,text,text), public.redeem_invite(text), public.read_shared_lineage(text),
public.list_access_links(uuid), public.revoke_access_link(uuid) from public, anon, authenticated;
grant execute on function public.submit_changes(uuid,bigint,jsonb,text), public.review_changes(uuid,boolean,text),
public.create_access_link(uuid,text,text), public.redeem_invite(text), public.read_shared_lineage(text),
public.list_access_links(uuid), public.revoke_access_link(uuid) to authenticated;
grant execute on function public.read_shared_lineage(text) to anon;
