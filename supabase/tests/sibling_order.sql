-- Verify ordering remains an approved JSON update, not a relationship mutation.
begin;
do $$
declare owner_id uuid:=gen_random_uuid(); editor_id uuid:=gen_random_uuid(); family uuid; request uuid; snapshot jsonb;
begin
  insert into auth.users(id) values(owner_id),(editor_id);
  perform set_config('request.jwt.claim.sub',owner_id::text,true); set local role authenticated;
  family:=public.create_lineage('{"name":"Sibling order fixture"}');
  perform public.set_lineage_access(family,editor_id,'editor');
  perform public.save_lineage_state(family,0,'{"name":"Sibling order fixture"}',
    '[{"id":"R","spouse_id":"S"},{"id":"S","spouse_id":"R"},
      {"id":"A","parent_id":"R","sibling_order":0},{"id":"B","parent_id":"R","sibling_order":1}]');
  perform set_config('request.jwt.claim.sub',editor_id::text,true);
  request:=public.submit_changes(family,1,
    '[{"type":"update_member","member_id":"A","new_value":{"sibling_order":1}},
      {"type":"update_member","member_id":"B","new_value":{"sibling_order":0}}]','Đổi thứ tự anh chị em');
  snapshot:=public.get_lineage_state(family);
  if not exists(select 1 from jsonb_array_elements(snapshot->'members') m where m->>'id'='A' and m->>'sibling_order'='0') then
    raise exception 'FAIL: pending ordering changed canonical data'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.review_changes(request,true,'');
  snapshot:=public.get_lineage_state(family);
  if not exists(select 1 from jsonb_array_elements(snapshot->'members') m where m->>'id'='A' and m->>'sibling_order'='1' and m->>'parent_id'='R')
    or not exists(select 1 from jsonb_array_elements(snapshot->'members') m where m->>'id'='B' and m->>'sibling_order'='0' and m->>'parent_id'='R')
    or not exists(select 1 from jsonb_array_elements(snapshot->'members') m where m->>'id'='R' and m->>'spouse_id'='S') then
    raise exception 'FAIL: approved order lost rank or changed relationships'; end if;
  reset role;
end;
$$;
rollback;
select 'PASS: sibling rank persists after admin approval, pending changes stay private, parent/spouse links preserved; fixtures rolled back' as result;
