-- Normalize legacy viewer invitations; existing token hashes, expiry and revocation stay intact.
update giapha_private.access_links set kind='share' where kind='invite' and role='viewer';

create or replace function giapha_private.lineage_role(p_lineage_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select role from (
    select a.role from public.lineage_access a where a.lineage_id=p_lineage_id and a.user_id=(select auth.uid())
    union all
    select l.role from giapha_private.link_redemptions r
      join giapha_private.access_links l on l.id=r.link_id
      where r.user_id=(select auth.uid()) and l.lineage_id=p_lineage_id and l.kind in ('invite','share')
        and not l.revoked and (l.expires_at is null or l.expires_at>now())
        and exists(select 1 from public.lineage_access a where a.lineage_id=l.lineage_id and a.user_id=l.created_by and a.role='admin')
  ) rights where (select auth.uid()) is not null
  order by case role when 'admin' then 3 when 'editor' then 2 else 1 end desc limit 1;
$$;

create or replace function giapha_private.create_access_link(p_lineage_id uuid,p_kind text,p_role text,p_duration text)
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
    values(p_lineage_id,sha256(convert_to(token,'UTF8')),case when p_role='viewer' then 'share' else p_kind end,p_role,auth.uid(),case when p_duration='forever' then null else now()+interval '7 days' end);
  return token;
end;
$$;
