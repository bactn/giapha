-- Private contact details stay in self-only profiles; email remains owned by Auth.
alter table public.profiles add column phone text not null default '' check(length(phone) <= 40);
alter table public.profiles add column address text not null default '' check(length(address) <= 1000);
grant insert(phone,address), update(phone,address) on public.profiles to authenticated;

create function public.save_my_profile(p_display_name text, p_phone text, p_address text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  insert into public.profiles(id,display_name,phone,address)
    values(auth.uid(),btrim(p_display_name),btrim(p_phone),btrim(p_address))
    on conflict(id) do update set display_name=excluded.display_name,phone=excluded.phone,address=excluded.address;
end;
$$;
revoke all on function public.save_my_profile(text,text,text) from public,anon;
grant execute on function public.save_my_profile(text,text,text) to authenticated;

-- Publication is an explicit opt-in; existing genealogies remain private.
create table public.lineage_publications (
  lineage_id uuid primary key references public.lineages(id) on delete cascade,
  slug text not null unique check(length(slug) between 3 and 100 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check(length(title) between 1 and 200),
  intro text not null default '' check(length(intro)<=2000),
  region text not null default '' check(length(region)<=200),
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.lineage_publications enable row level security;
revoke all on public.lineage_publications from public,anon,authenticated;
grant select on public.lineage_publications to anon,authenticated;
create policy publication_visitor_read on public.lineage_publications for select to anon using(is_public);
create policy publication_member_read on public.lineage_publications for select to authenticated
  using(is_public or (select giapha_private.lineage_role(lineage_id)) is not null);

create function giapha_private.set_lineage_publication(p_lineage_id uuid,p_slug text,p_intro text,p_region text,p_is_public boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_title text;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  select info->>'name' into v_title from public.lineages where id=p_lineage_id for update;
  if giapha_private.lineage_role(p_lineage_id) is distinct from 'admin' then raise insufficient_privilege; end if;
  if p_is_public is null then raise check_violation; end if;
  insert into public.lineage_publications(lineage_id,slug,title,intro,region,is_public)
    values(p_lineage_id,lower(btrim(p_slug)),v_title,btrim(p_intro),btrim(p_region),p_is_public)
    on conflict(lineage_id) do update set slug=excluded.slug,title=excluded.title,intro=excluded.intro,
      region=excluded.region,is_public=excluded.is_public,updated_at=now();
  insert into public.audit_events(lineage_id,actor_id,action,details)
    values(p_lineage_id,auth.uid(),'set_publication',jsonb_build_object('is_public',p_is_public,'slug',lower(btrim(p_slug))));
end;
$$;

create function giapha_private.list_public_lineages(p_search text)
returns table(slug text,title text,intro text,region text,member_count bigint)
language sql stable security definer set search_path = '' as $$
  select p.slug,p.title,p.intro,p.region,(select count(*) from public.members m where m.lineage_id=p.lineage_id)
  from public.lineage_publications p where p.is_public
    and (coalesce(p_search,'')='' or p.title ilike '%'||left(p_search,100)||'%' or p.region ilike '%'||left(p_search,100)||'%')
  order by p.updated_at desc,p.slug limit 100;
$$;

create function giapha_private.open_lineage_page(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p public.lineage_publications; v_role text; v_state jsonb; v_members jsonb;
begin
  select * into p from public.lineage_publications where slug=p_slug;
  if not found then raise insufficient_privilege using message='This genealogy is private or unavailable'; end if;
  v_role := giapha_private.lineage_role(p.lineage_id);
  if v_role is not null then
    v_state := giapha_private.get_lineage_state(p.lineage_id);
  elsif p.is_public then
    -- Allowlist public fields. Never expose notes, contact data or future custom fields.
    select coalesce(jsonb_agg((select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb)
      from jsonb_each(m.data) e where e.key in ('id','full_name','christian_name','gender','generation','branch','branch_type',
        'parent_id','spouse_id','spouse','birth_date','death_date','status','role')) order by m.id),'[]'::jsonb)
      into v_members from public.members m where m.lineage_id=p.lineage_id;
    select jsonb_build_object('lineageInfo',jsonb_build_object('name',p.title,'origin',p.region),
      'members',v_members,'revision',revision) into v_state from public.lineages where id=p.lineage_id;
  else raise insufficient_privilege using message='This genealogy is private or unavailable';
  end if;
  return v_state || jsonb_build_object('lineage_id',p.lineage_id,'access_role',coalesce(v_role,'viewer'),'public_read',v_role is null,'slug',p.slug);
end;
$$;

create function public.set_lineage_publication(p_lineage_id uuid,p_slug text,p_intro text,p_region text,p_is_public boolean)
returns void language sql security invoker set search_path = '' as $$ select giapha_private.set_lineage_publication(p_lineage_id,p_slug,p_intro,p_region,p_is_public); $$;
create function public.list_public_lineages(p_search text default '')
returns table(slug text,title text,intro text,region text,member_count bigint)
language sql stable security invoker set search_path = '' as $$ select * from giapha_private.list_public_lineages(p_search); $$;
create function public.open_lineage_page(p_slug text)
returns jsonb language sql stable security invoker set search_path = '' as $$ select giapha_private.open_lineage_page(p_slug); $$;

revoke all on function giapha_private.set_lineage_publication(uuid,text,text,text,boolean),giapha_private.list_public_lineages(text),
  giapha_private.open_lineage_page(text),public.set_lineage_publication(uuid,text,text,text,boolean),public.list_public_lineages(text),public.open_lineage_page(text)
  from public,anon,authenticated;
grant execute on function giapha_private.set_lineage_publication(uuid,text,text,text,boolean), public.set_lineage_publication(uuid,text,text,text,boolean) to authenticated;
grant execute on function giapha_private.list_public_lineages(text),giapha_private.open_lineage_page(text),public.list_public_lineages(text),public.open_lineage_page(text) to anon,authenticated;
