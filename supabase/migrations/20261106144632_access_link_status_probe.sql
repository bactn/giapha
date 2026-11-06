-- Periodic revocation checks must not download the entire genealogy again.
create function giapha_private.can_read_lineage(p_lineage_id uuid,p_share_token text,p_public_slug text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_share_token is not null then exists(
      select 1 from giapha_private.access_links l
      where p_share_token ~ '^[a-f0-9]{64}$' and l.token_hash=sha256(convert_to(p_share_token,'UTF8'))
        and l.lineage_id=p_lineage_id and l.kind='share' and l.role='viewer' and not l.revoked
        and (l.expires_at is null or l.expires_at>now())
        and exists(select 1 from public.lineage_access a where a.lineage_id=l.lineage_id and a.user_id=l.created_by and a.role='admin'))
    when p_public_slug is not null then exists(
      select 1 from public.lineage_publications p where p.slug=p_public_slug and p.lineage_id=p_lineage_id
        and (p.is_public or giapha_private.lineage_role(p_lineage_id) is not null))
    else giapha_private.lineage_role(p_lineage_id) is not null end;
$$;
create function public.can_read_lineage(p_lineage_id uuid,p_share_token text default null,p_public_slug text default null)
returns boolean language sql stable security invoker set search_path = '' as $$ select giapha_private.can_read_lineage(p_lineage_id,p_share_token,p_public_slug); $$;
revoke all on function giapha_private.can_read_lineage(uuid,text,text),public.can_read_lineage(uuid,text,text) from public,anon,authenticated;
grant execute on function giapha_private.can_read_lineage(uuid,text,text),public.can_read_lineage(uuid,text,text) to anon,authenticated;
