-- Phase 1: private genealogy data, explicit grants and transaction-safe RPCs.
create schema giapha_private;
revoke all on schema giapha_private from public, anon, authenticated;
grant usage on schema giapha_private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 200),
  created_at timestamptz not null default now()
);
create table public.lineages (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id),
  info jsonb not null check (jsonb_typeof(info) = 'object'),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lineages_created_by_idx on public.lineages(created_by);

create table public.lineage_access (
  lineage_id uuid not null references public.lineages(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('admin', 'editor', 'viewer')),
  granted_by uuid not null references auth.users(id),
  granted_at timestamptz not null default now(),
  primary key (lineage_id, user_id)
);
create index lineage_access_user_idx on public.lineage_access(user_id, lineage_id);
create index lineage_access_granted_by_idx on public.lineage_access(granted_by);

create table public.members (
  lineage_id uuid not null references public.lineages(id) on delete cascade,
  id text not null check (length(btrim(id)) between 1 and 200 and id <> '-'),
  data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'id' is not null and data->>'id' = id),
  parent_id text generated always as (nullif(nullif(data->>'parent_id', ''), '-')) stored,
  spouse_id text generated always as (nullif(nullif(data->>'spouse_id', ''), '-')) stored,
  primary key (lineage_id, id),
  constraint members_parent_fk foreign key (lineage_id, parent_id)
    references public.members(lineage_id, id) deferrable initially deferred,
  constraint members_spouse_fk foreign key (lineage_id, spouse_id)
    references public.members(lineage_id, id) deferrable initially deferred,
  check (parent_id is null or parent_id <> id),
  check (spouse_id is null or spouse_id <> id)
);
create index members_parent_idx on public.members(lineage_id, parent_id);
create index members_spouse_idx on public.members(lineage_id, spouse_id);

create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  lineage_id uuid not null references public.lineages(id) on delete cascade,
  submitted_by uuid not null references auth.users(id),
  base_revision bigint not null check (base_revision >= 0),
  changes jsonb not null check (jsonb_typeof(changes) = 'array' and jsonb_array_length(changes) > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  check ((status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null))
);
create index change_requests_lineage_idx on public.change_requests(lineage_id, status, created_at);
create index change_requests_submitted_by_idx on public.change_requests(submitted_by);
create index change_requests_reviewed_by_idx on public.change_requests(reviewed_by);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  lineage_id uuid not null references public.lineages(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_lineage_idx on public.audit_events(lineage_id, created_at);
create index audit_events_actor_idx on public.audit_events(actor_id);

-- Never expose membership lookup with caller-supplied user IDs.
create function giapha_private.lineage_role(p_lineage_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select a.role from public.lineage_access a
  where a.lineage_id = p_lineage_id and a.user_id = (select auth.uid())
    and (select auth.uid()) is not null;
$$;

alter table public.profiles enable row level security;
alter table public.lineages enable row level security;
alter table public.lineage_access enable row level security;
alter table public.members enable row level security;
alter table public.change_requests enable row level security;
alter table public.audit_events enable row level security;

revoke all on public.profiles, public.lineages, public.lineage_access,
  public.members, public.change_requests, public.audit_events from public, anon, authenticated;
grant select on public.profiles, public.lineages, public.lineage_access,
  public.members, public.change_requests, public.audit_events to authenticated;
grant insert (id, display_name), update (display_name) on public.profiles to authenticated;

create policy profiles_read_self on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy lineages_read_accessible on public.lineages for select to authenticated
  using ((select giapha_private.lineage_role(id)) is not null);
create policy access_read_self_or_admin on public.lineage_access for select to authenticated
  using (user_id = (select auth.uid()) or (select giapha_private.lineage_role(lineage_id)) = 'admin');
create policy members_read_accessible on public.members for select to authenticated
  using ((select giapha_private.lineage_role(lineage_id)) is not null);
create policy requests_read_self_or_admin on public.change_requests for select to authenticated
  using ((select giapha_private.lineage_role(lineage_id)) is not null
    and (submitted_by = (select auth.uid()) or (select giapha_private.lineage_role(lineage_id)) = 'admin'));
create policy audit_read_admin on public.audit_events for select to authenticated
  using ((select giapha_private.lineage_role(lineage_id)) = 'admin');

create function giapha_private.create_lineage(p_info jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_id uuid;
begin
  if v_actor is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  if p_info is null or jsonb_typeof(p_info) <> 'object'
     or coalesce(length(btrim(p_info->>'name')), 0) not between 1 and 200 then
    raise check_violation using message = 'Lineage info requires a name (1-200 characters)';
  end if;
  insert into public.profiles(id) values (v_actor) on conflict (id) do nothing;
  insert into public.lineages(created_by, info) values (v_actor, p_info) returning id into v_id;
  insert into public.lineage_access(lineage_id, user_id, role, granted_by)
    values (v_id, v_actor, 'admin', v_actor);
  insert into public.audit_events(lineage_id, actor_id, action) values (v_id, v_actor, 'create_lineage');
  return v_id;
end;
$$;

create function giapha_private.set_lineage_access(p_lineage_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_old_role text;
begin
  if v_actor is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  -- Every access change and save locks this same row to serialize authorization changes.
  perform 1 from public.lineages where id = p_lineage_id for update;
  if not found or giapha_private.lineage_role(p_lineage_id) is distinct from 'admin' then
    raise insufficient_privilege using message = 'Administrator access required';
  end if;
  if p_user_id is null or (p_role is not null and p_role not in ('admin', 'editor', 'viewer')) then
    raise check_violation using message = 'Invalid user or role';
  end if;
  select role into v_old_role from public.lineage_access where lineage_id = p_lineage_id and user_id = p_user_id;
  if v_old_role = 'admin' and p_role is distinct from 'admin'
    and (select count(*) from public.lineage_access where lineage_id = p_lineage_id and role = 'admin') <= 1 then
    raise check_violation using message = 'Cannot remove the last administrator';
  end if;
  if p_role is null then
    delete from public.lineage_access where lineage_id = p_lineage_id and user_id = p_user_id;
  else
    insert into public.lineage_access(lineage_id, user_id, role, granted_by)
      values (p_lineage_id, p_user_id, p_role, v_actor)
      on conflict (lineage_id, user_id) do update set role = excluded.role,
        granted_by = excluded.granted_by, granted_at = now();
  end if;
  insert into public.audit_events(lineage_id, actor_id, action, details)
    values (p_lineage_id, v_actor, 'set_access', jsonb_build_object('user_id', p_user_id, 'old_role', v_old_role, 'role', p_role));
end;
$$;

create function giapha_private.save_lineage_state(p_lineage_id uuid, p_base_revision bigint, p_info jsonb, p_members jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_revision bigint; v_old_info jsonb; v_old_members jsonb; v_actor uuid := auth.uid();
begin
  if v_actor is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  select revision, info into v_revision, v_old_info from public.lineages where id = p_lineage_id for update;
  if not found or giapha_private.lineage_role(p_lineage_id) is distinct from 'admin' then
    raise insufficient_privilege using message = 'Administrator access required';
  end if;
  if p_base_revision is null or p_base_revision <> v_revision then
    raise serialization_failure using message = 'Lineage changed; reload and reconcile your draft';
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

-- Exposed RPCs are SECURITY INVOKER wrappers. Privileged implementations stay private.
create function public.create_lineage(p_info jsonb) returns uuid
  language sql security invoker set search_path = '' as $$ select giapha_private.create_lineage(p_info); $$;
create function public.set_lineage_access(p_lineage_id uuid, p_user_id uuid, p_role text) returns void
  language sql security invoker set search_path = '' as $$ select giapha_private.set_lineage_access(p_lineage_id, p_user_id, p_role); $$;
create function public.save_lineage_state(p_lineage_id uuid, p_base_revision bigint, p_info jsonb, p_members jsonb) returns bigint
  language sql security invoker set search_path = '' as $$ select giapha_private.save_lineage_state(p_lineage_id, p_base_revision, p_info, p_members); $$;
create function public.get_lineage_state(p_lineage_id uuid) returns jsonb
  language plpgsql stable security invoker set search_path = '' as $$
declare v_info jsonb; v_revision bigint; v_members jsonb;
begin
  select info, revision into v_info, v_revision from public.lineages where id = p_lineage_id;
  if not found then raise insufficient_privilege using message = 'Lineage access required'; end if;
  select coalesce(jsonb_agg(data order by id), '[]'::jsonb) into v_members
    from public.members where lineage_id = p_lineage_id;
  return jsonb_build_object('lineageInfo', v_info, 'members', v_members, 'revision', v_revision);
end;
$$;

revoke all on all functions in schema giapha_private from public, anon, authenticated;
grant execute on function giapha_private.lineage_role(uuid), giapha_private.create_lineage(jsonb),
  giapha_private.set_lineage_access(uuid, uuid, text),
  giapha_private.save_lineage_state(uuid, bigint, jsonb, jsonb) to authenticated;
revoke all on function public.create_lineage(jsonb), public.set_lineage_access(uuid, uuid, text),
  public.save_lineage_state(uuid, bigint, jsonb, jsonb), public.get_lineage_state(uuid)
  from public, anon, authenticated;
grant execute on function public.create_lineage(jsonb), public.set_lineage_access(uuid, uuid, text),
  public.save_lineage_state(uuid, bigint, jsonb, jsonb), public.get_lineage_state(uuid) to authenticated;

comment on table public.change_requests is 'Reserved for approval phase; clients have no write grants until approval RPCs are implemented.';
comment on schema giapha_private is 'Internal checked RPC implementations. Keep this schema outside the Data API exposed schemas.';
