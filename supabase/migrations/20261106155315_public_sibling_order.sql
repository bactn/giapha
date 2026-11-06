-- Expose only the non-sensitive sibling display rank alongside existing public fields.
-- Reuse the existing checked public snapshot reader for authenticated members.
create or replace function giapha_private.open_lineage_page(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p public.lineage_publications; v_role text; v_state jsonb; v_members jsonb;
begin
  select * into p from public.lineage_publications where slug=p_slug;
  if not found then raise insufficient_privilege using message='This genealogy is private or unavailable'; end if;
  v_role := giapha_private.lineage_role(p.lineage_id);
  if v_role is not null then
    v_state := public.get_lineage_state(p.lineage_id);
  elsif p.is_public then
    -- Allowlist public fields. Never expose notes, contact data or future custom fields.
    select coalesce(jsonb_agg((select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb)
      from jsonb_each(m.data) e where e.key in ('id','full_name','christian_name','gender','generation','branch','branch_type',
        'parent_id','spouse_id','spouse','birth_date','death_date','status','role','sibling_order')) order by m.id),'[]'::jsonb)
      into v_members from public.members m where m.lineage_id=p.lineage_id;
    select jsonb_build_object('lineageInfo',jsonb_build_object('name',p.title,'origin',p.region),
      'members',v_members,'revision',revision) into v_state from public.lineages where id=p.lineage_id;
  else raise insufficient_privilege using message='This genealogy is private or unavailable';
  end if;
  return v_state || jsonb_build_object('lineage_id',p.lineage_id,'access_role',coalesce(v_role,'viewer'),'public_read',v_role is null,'slug',p.slug);
end;
$$;
