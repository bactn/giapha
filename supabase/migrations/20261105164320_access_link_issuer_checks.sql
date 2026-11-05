-- Links require an issuer who still administers the lineage.
-- Direct access remains explicitly denied even if table grants change later.
create policy access_links_deny_direct on giapha_private.access_links for all to anon, authenticated using (false) with check (false);


create or replace function giapha_private.redeem_invite(p_token text)
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
  if not exists (select 1 from public.lineage_access a where a.lineage_id = link.lineage_id
      and a.user_id = link.created_by and a.role = 'admin') then
    raise insufficient_privilege using message = 'The link issuer no longer administers this lineage';
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
  select coalesce(jsonb_agg(data - 'notes' order by id), '[]'::jsonb) into members
    from public.members where lineage_id = link.lineage_id;
  return jsonb_build_object('lineage_id', link.lineage_id, 'lineageInfo', info, 'members', members, 'revision', revision);
end;
$$;
