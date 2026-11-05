export function describeError(error) {
  if (['40001', 'PT409'].includes(error?.code)) return 'Dữ liệu trên máy chủ đã thay đổi. Bản nháp vẫn được giữ; hãy xuất JSON để sao lưu rồi tải lại và đối chiếu trước khi lưu.';
  if (error?.code === '42501') return 'Bạn chưa đăng nhập hoặc không có quyền thực hiện thao tác này.';
  if (error?.code === '23503') return 'Có quan hệ cha/mẹ hoặc phối ngẫu không tồn tại trong gia phả.';
  if (error?.code === '23505') return 'Mã thành viên đã tồn tại.';
  if (error?.message?.includes('Email not confirmed')) return 'Vui lòng xác nhận email trước khi đăng nhập.';
  if (error?.message?.includes('Invalid login credentials')) return 'Email hoặc mật khẩu không đúng.';
  return error?.message || 'Không thể kết nối máy chủ. Bản nháp vẫn được giữ.';
}

export function snapshotChanges(before, after) {
  const original = new Map(before.members.map(m => [m.id, m]));
  const current = new Map(after.members.map(m => [m.id, m]));
  const changes = [];
  for (const [id, old] of original) {
    const member = current.get(id);
    if (!member) changes.push({ type: 'delete_member', member_id: id });
    else {
      const fields = Object.create(null);
      for (const key of new Set([...Object.keys(old), ...Object.keys(member)])) {
        if (key !== 'id' && JSON.stringify(old[key]) !== JSON.stringify(member[key])) fields[key] = member[key] ?? null;
      }
      if (Object.keys(fields).length) changes.push({ type: 'update_member', member_id: id, new_value: fields });
    }
  }
  for (const [id, member] of current) if (!original.has(id)) changes.push({ type: 'add_member', new_value: member });
  // Statistics are derived locally and should not produce an unrelated info-only proposal.
  const info = x => Object.fromEntries(Object.entries(x).filter(([k]) => !['total_members', 'generations'].includes(k)));
  if (JSON.stringify(info(before.lineageInfo)) !== JSON.stringify(info(after.lineageInfo))) {
    changes.push({ type: 'update_info', new_value: after.lineageInfo });
  }
  return changes;
}

export class GenealogyService {
  constructor(client) { this.client = client; }

  async rpc(name, args) {
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async list(userId) {
    const { data, error } = await this.client.from('lineage_access')
      .select('lineage_id,role,lineages(id,info,revision)').eq('user_id', userId);
    if (error) throw error;
    return data;
  }

  create(name) { return this.rpc('create_lineage', { p_info: { name, origin: '' } }); }
  load(id) { return this.rpc('get_lineage_state', { p_lineage_id: id }); }
  save(id, revision, snapshot) {
    return this.rpc('save_lineage_state', { p_lineage_id: id, p_base_revision: revision, p_info: snapshot.lineageInfo, p_members: snapshot.members });
  }
  submit(id, revision, changes, title) {
    return this.rpc('submit_changes', { p_lineage_id: id, p_base_revision: revision, p_changes: changes, p_title: title });
  }
  review(id, approve, reason = '') { return this.rpc('review_changes', { p_request_id: id, p_approve: approve, p_reason: reason }); }
  link(id, kind, role) { return this.rpc('create_access_link', { p_lineage_id: id, p_kind: kind, p_role: role }); }
  redeem(token) { return this.rpc('redeem_invite', { p_token: token }); }
  shared(token) { return this.rpc('read_shared_lineage', { p_token: token }); }
  links(id) { return this.rpc('list_access_links', { p_lineage_id: id }); }
  revoke(id) { return this.rpc('revoke_access_link', { p_link_id: id }); }
  access(id, userId, role) { return this.rpc('set_lineage_access', { p_lineage_id: id, p_user_id: userId, p_role: role }); }

  async accessList(id) {
    const { data, error } = await this.client.from('lineage_access').select('user_id,role').eq('lineage_id', id);
    if (error) throw error;
    return data;
  }
  async requests(id) {
    const { data, error } = await this.client.from('change_requests')
      .select('id,title,submitted_by,base_revision,changes,status,created_at,reviewed_at,rejection_reason')
      .eq('lineage_id', id).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return data;
  }
}
