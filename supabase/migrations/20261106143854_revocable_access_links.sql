-- Link-derived rights stay separate from explicit membership. Every read and
-- proposal rechecks revocation, expiration and the issuer's administrator role.
alter table giapha_private.access_links alter column expires_at drop not null;
create table giapha_private.link_redemptions (
  link_id uuid not null references giapha_private.access_links(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key(link_id,user_id)
);
create index link_redemptions_user_idx on giapha_private.link_redemptions(user_id);
alter table giapha_private.link_redemptions enable row level security;
revoke all on giapha_private.link_redemptions from public,anon,authenticated;
create policy link_redemptions_deny_direct on giapha_private.link_redemptions for all to anon,authenticated using(false) with check(false);

create or replace function giapha_private.lineage_role(p_lineage_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select role from (
    select a.role from public.lineage_access a where a.lineage_id=p_lineage_id and a.user_id=(select auth.uid())
    union all
    select l.role from giapha_private.link_redemptions r
      join giapha_private.access_links l on l.id=r.link_id
      where r.user_id=(select auth.uid()) and l.lineage_id=p_lineage_id and l.kind='invite'
        and not l.revoked and (l.expires_at is null or l.expires_at>now())
        and exists(select 1 from public.lineage_access a where a.lineage_id=l.lineage_id and a.user_id=l.created_by and a.role='admin')
  ) rights where (select auth.uid()) is not null
  order by case role when 'admin' then 3 when 'editor' then 2 else 1 end desc limit 1;
$$;

create function giapha_private.create_access_link(p_lineage_id uuid,p_kind text,p_role text,p_duration text)
returns text language plpgsql security definer set search_path = '' as $$
declare token text := replace(gen_random_uuid()::text || gen_random_uuid()::text,'-','');
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  perform 1 from public.lineages where id=p_lineage_id for update;
  if giapha_private.lineage_role(p_lineage_id) is distinct from 'admin' then raise insufficient_privilege; end if;
  if p_kind is null or p_kind not in ('share','invite') or p_role is null or p_role not in ('viewer','editor')
    or (p_kind='share' and p_role<>'viewer') then raise check_violation using message='Invalid link kind or role'; end if;
  if p_duration is null or p_duration not in ('7days','forever') then raise check_violation using message='Invalid link duration'; end if;
  insert into giapha_private.access_links(lineage_id,token_hash,kind,role,created_by,expires_at)
    values(p_lineage_id,sha256(convert_to(token,'UTF8')),p_kind,p_role,auth.uid(),case when p_duration='forever' then null else now()+interval '7 days' end);
  return token;
end;
$$;
-- Keep already-open/older clients compatible: their links still default to 7 days.
create or replace function giapha_private.create_access_link(p_lineage_id uuid,p_kind text,p_role text)
returns text language sql security invoker set search_path = '' as $$ select giapha_private.create_access_link(p_lineage_id,p_kind,p_role,'7days'); $$;
create function public.create_access_link(p_lineage_id uuid,p_kind text,p_role text,p_duration text)
returns text language sql security invoker set search_path = '' as $$ select giapha_private.create_access_link(p_lineage_id,p_kind,p_role,p_duration); $$;
revoke all on function giapha_private.create_access_link(uuid,text,text,text),public.create_access_link(uuid,text,text,text) from public,anon,authenticated;
grant execute on function giapha_private.create_access_link(uuid,text,text,text),public.create_access_link(uuid,text,text,text) to authenticated;

create or replace function giapha_private.redeem_invite(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare link giapha_private.access_links; v_lineage uuid; v_actor uuid := auth.uid();
begin
  if v_actor is null then raise insufficient_privilege using message='Authentication required'; end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise insufficient_privilege using message='Invalid invitation'; end if;
  select lineage_id into v_lineage from giapha_private.access_links where token_hash=sha256(convert_to(p_token,'UTF8'));
  perform 1 from public.lineages where id=v_lineage for update;
  select * into link from giapha_private.access_links where token_hash=sha256(convert_to(p_token,'UTF8')) for update;
  if not found or link.kind<>'invite' or link.revoked or (link.expires_at is not null and link.expires_at<=now()) then
    raise insufficient_privilege using message='Invitation is invalid, expired or revoked';
  end if;
  if not exists(select 1 from public.lineage_access a where a.lineage_id=link.lineage_id and a.user_id=link.created_by and a.role='admin') then
    raise insufficient_privilege using message='The link issuer no longer administers this lineage';
  end if;
  insert into giapha_private.link_redemptions(link_id,user_id) values(link.id,v_actor) on conflict do nothing;
  update giapha_private.access_links set used_at=now() where id=link.id;
  insert into public.audit_events(lineage_id,actor_id,action) values(link.lineage_id,v_actor,'redeem_invite');
  return link.lineage_id;
end;
$$;

create or replace function giapha_private.list_access_links(p_lineage_id uuid)
returns table(id uuid,kind text,role text,expires_at timestamptz,revoked boolean,used_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or giapha_private.lineage_role(p_lineage_id) is distinct from 'admin' then raise insufficient_privilege; end if;
  return query select l.id,l.kind,l.role,l.expires_at,l.revoked,l.used_at from giapha_private.access_links l
    where l.lineage_id=p_lineage_id and not l.revoked and (l.expires_at is null or l.expires_at>now())
      and exists(select 1 from public.lineage_access a where a.lineage_id=l.lineage_id and a.user_id=l.created_by and a.role='admin')
    order by l.created_at desc;
end;
$$;

create function giapha_private.list_my_lineages()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('lineage_id',l.id,'role',giapha_private.lineage_role(l.id),
    'lineages',jsonb_build_object('id',l.id,'info',l.info,'revision',l.revision)) order by l.created_at),'[]'::jsonb)
  from public.lineages l where auth.uid() is not null and giapha_private.lineage_role(l.id) is not null;
$$;
create function public.list_my_lineages() returns jsonb language sql stable security invoker set search_path = '' as $$ select giapha_private.list_my_lineages(); $$;
revoke all on function giapha_private.list_my_lineages(),public.list_my_lineages() from public,anon,authenticated;
grant execute on function giapha_private.list_my_lineages(),public.list_my_lineages() to authenticated;
