-- Keep newly introduced dates and age overrides private on anonymous bearer links.
create or replace function giapha_private.read_shared_lineage(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare link giapha_private.access_links; info jsonb; revision bigint; members jsonb;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise insufficient_privilege using message = 'Invalid share link'; end if;
  select * into link from giapha_private.access_links where token_hash = sha256(convert_to(p_token, 'UTF8'));
  if not found or link.kind <> 'share' or link.role <> 'viewer' or link.revoked or link.expires_at <= now() then
    raise insufficient_privilege using message = 'Share link is invalid, expired or revoked';
  end if;
  if not exists (select 1 from public.lineage_access a where a.lineage_id = link.lineage_id
      and a.user_id = link.created_by and a.role = 'admin') then
    raise insufficient_privilege using message = 'The link issuer no longer administers this lineage';
  end if;
  select l.info, l.revision into info, revision from public.lineages l where id = link.lineage_id;
  select coalesce(jsonb_agg(data - array['notes','death_date_solar','lifespan_override'] order by id), '[]'::jsonb) into members
    from public.members where lineage_id = link.lineage_id;
  return jsonb_build_object('lineage_id', link.lineage_id, 'lineageInfo', info, 'members', members, 'revision', revision);
end;
$$;
