export function compareSiblings(a,b) {
  const rank = m => typeof m.sibling_order === 'number' && Number.isFinite(m.sibling_order) ? m.sibling_order : Infinity;
  const first=rank(a), second=rank(b);
  return first !== second ? first < second ? -1 : 1 : String(a.id).localeCompare(String(b.id),'vi',{numeric:true});
}
