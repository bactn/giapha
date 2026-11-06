// data-store.js - Graph Data Store with Undo/Redo & Cycle Detection
import { compareSiblings } from './member-order.js';
export class DataStore {
  constructor() {
    this.lineageInfo = {
      name: 'Họ Trần Ngọc - Ngành II Công Giáo',
      origin: 'Nam Định / Ninh Bình',
      total_members: 0,
      generations: 8
    };
    this.members = new Map(); // id -> Member
    this.selectedMemberId = null;
    this.history = [];
    this.future = [];
    this.maxHistory = 30;
    this.listeners = new Set();
    this.readOnly = false;
    // ─── Change Tracking (co-working: editor → admin approval) ───
    this._originalState = null; // Baseline snapshot for diff calculation
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify(event = 'update', data = null) {
    for (const listener of this.listeners) {
      listener(event, data);
    }
  }

  recordSnapshot() {
    if (this.readOnly) throw new Error('Bạn chỉ có quyền xem. Hãy gửi đề xuất chỉnh sửa.');
    const snapshot = {
      lineageInfo: JSON.parse(JSON.stringify(this.lineageInfo)),
      members: Array.from(this.members.values()).map(m => ({ ...m }))
    };
    this.history.push(snapshot);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    this.future = []; // Clear redo stack on new action
  }

  undo() {
    if (this.readOnly) return false;
    if (this.history.length === 0) return false;
    const current = {
      lineageInfo: JSON.parse(JSON.stringify(this.lineageInfo)),
      members: Array.from(this.members.values()).map(m => ({ ...m }))
    };
    this.future.push(current);

    const prev = this.history.pop();
    this.loadState(prev, false);
    this.notify('undo');
    return true;
  }

  redo() {
    if (this.readOnly) return false;
    if (this.future.length === 0) return false;
    const current = {
      lineageInfo: JSON.parse(JSON.stringify(this.lineageInfo)),
      members: Array.from(this.members.values()).map(m => ({ ...m }))
    };
    this.history.push(current);

    const next = this.future.pop();
    this.loadState(next, false);
    this.notify('redo');
    return true;
  }

  loadState(state, clearHistory = true) {
    if (clearHistory) {
      this.history = [];
      this.future = [];
    }
    this.lineageInfo = state.lineageInfo || this.lineageInfo;
    this.members.clear();
    if (Array.isArray(state.members)) {
      for (const m of state.members) {
        const member = { ...m };
        for (const field of ['full_name', 'christian_name', 'gender', 'generation', 'branch', 'branch_type', 'status', 'birth_date', 'death_date', 'spouse', 'notes']) {
          member[field] = String(member[field] ?? (field === 'full_name' ? member.id : ''));
        }
        this.members.set(m.id, member);
      }
    }
    this.recalculateStats();
    this.notify('load');
  }

  recalculateStats() {
    this.lineageInfo.total_members = this.members.size;
    let maxGen = 1;
    for (const m of this.members.values()) {
      const g = parseInt(m.generation, 10);
      if (!isNaN(g) && g > maxGen) maxGen = g;
    }
    this.lineageInfo.generations = maxGen;
  }

  getMember(id) {
    return this.members.get(id) || null;
  }

  getAllMembers() {
    return Array.from(this.members.values());
  }

  getRootMembers() {
    const roots = [];
    for (const m of this.members.values()) {
      // Only explicitly classified partners are inline; a spouse link must not hide an ancestor.
      if (m.branch_type?.includes('Phối ngẫu') && m.spouse_id && this.members.has(m.spouse_id) && this.getChildren(m.id).length === 0) continue;
      if (!m.parent_id || m.parent_id === '-' || !this.members.has(m.parent_id)) {
        roots.push(m);
      }
    }
    // Sort roots by generation, then ID
    return roots.sort((a, b) => (parseInt(a.generation, 10) || 1) - (parseInt(b.generation, 10) || 1));
  }

  getChildren(parentId) {
    const children = [];
    for (const m of this.members.values()) {
      if (m.parent_id === parentId) {
        children.push(m);
      }
    }
    return children.sort(compareSiblings);
  }

  nextMemberId() {
    let largest = 0n;
    for (const id of this.members.keys()) {
      const match = /^P(\d+)$/.exec(id);
      if (match && BigInt(match[1]) > largest) largest = BigInt(match[1]);
    }
    return 'P'+String(largest+1n).padStart(3,'0');
  }

  canMoveSibling(id, step) {
    const member=this.members.get(id);
    if(this.readOnly || ![-1,1].includes(step) || !member || !this.members.has(member.parent_id)) return false;
    const siblings=this.getChildren(member.parent_id); const index=siblings.findIndex(m=>m.id===id);
    return index+step>=0 && index+step<siblings.length;
  }

  moveSibling(id, step) {
    if(!this.canMoveSibling(id,step)) return false;
    const siblings=this.getChildren(this.members.get(id).parent_id);
    const index=siblings.findIndex(m=>m.id===id);
    this.recordSnapshot();
    [siblings[index],siblings[index+step]]=[siblings[index+step],siblings[index]];
    siblings.forEach((member,order)=>this.members.set(member.id,{...member,sibling_order:order}));
    this.notify('update',this.members.get(id));
    return true;
  }

  appendSiblingOrder(parentId, excludeId = null) {
    if(!this.members.has(parentId)) return undefined;
    const siblings=this.getChildren(parentId).filter(m=>m.id!==excludeId);
    siblings.forEach((member,order)=>this.members.set(member.id,{...member,sibling_order:order}));
    return siblings.length;
  }

  getDescendants(id, set = new Set()) {
    const children = this.getChildren(id);
    for (const c of children) {
      if (!set.has(c.id)) {
        set.add(c.id);
        this.getDescendants(c.id, set);
      }
    }
    return set;
  }

  // Cycle detection: checks if assigning childId to newParentId would create a loop
  wouldCreateCycle(childId, newParentId) {
    if (!newParentId || newParentId === '-') return false;
    if (childId === newParentId) return true;
    const descendants = this.getDescendants(childId);
    return descendants.has(newParentId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Change Tracking (co-working: editor → admin approval)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialize the baseline snapshot after data load.
   * Call this once after loadState() to start tracking changes.
   */
  initializeTracking(members = Array.from(this.members.values())) {
    this._originalState = {
      members: JSON.parse(JSON.stringify(members))
    };
  }

  /**
   * Return a structured diff of all changes since initializeTracking().
   * Format matches the server's pending-changes API:
   *   { type: 'update_member', member_id: 'P001', new_value: { full_name: 'New' } }
   *   { type: 'add_member', new_value: { id: 'P099', ... } }
   *   { type: 'delete_member', member_id: 'P005' }
   */
  getTrackedChanges() {
    if (!this._originalState) return [];

    const changes = [];
    const originals = new Map(this._originalState.members.map(m => [m.id, m]));

    // Detect updates and deletions
    for (const [id, original] of originals) {
      const current = this.members.get(id);
      if (!current) {
        // Member was deleted
        changes.push({ type: 'delete_member', member_id: id, old_value: { ...original } });
      } else {
        // Check for field-level updates
        const updatedFields = {};
        const oldFields = {};
        for (const key of new Set([...Object.keys(original), ...Object.keys(current)])) {
          if (current[key] !== original[key]) {
            updatedFields[key] = current[key];
            oldFields[key] = original[key];
          }
        }
        if (Object.keys(updatedFields).length > 0) {
          changes.push({
            type: 'update_member',
            member_id: id,
            new_value: updatedFields,
            old_value: oldFields
          });
        }
      }
    }

    // Detect additions
    for (const [id, current] of this.members) {
      if (!originals.has(id)) {
        changes.push({ type: 'add_member', new_value: { ...current } });
      }
    }

    return changes;
  }

  /**
   * Check if there are any tracked changes.
   */
  hasChanges() {
    return this.getTrackedChanges().length > 0;
  }

  /**
   * Reset the baseline to the current state.
   * Call this after admin approval to start a new change set.
   */
  resetTracking() {
    this._originalState = {
      members: Array.from(this.members.values()).map(m => ({ ...m }))
    };
  }

  addMember(memberData) {
    const id = memberData.id || this.nextMemberId();
    if (this.members.has(id)) throw new Error('Mã thành viên đã tồn tại. Không thể ghi đè thành viên cũ.');
    if(memberData.parent_id && memberData.parent_id!=='-' && !this.members.has(memberData.parent_id)) throw new Error('Không tìm thấy bố/mẹ đã chọn.');
    this.recordSnapshot();
    let generation = memberData.generation;
    if (!generation && memberData.parent_id && this.members.has(memberData.parent_id)) {
      const parent = this.members.get(memberData.parent_id);
      generation = (parseInt(parent.generation, 10) || 1) + 1;
    }

    const newMember = {
      id,
      christian_name: memberData.christian_name || '',
      full_name: memberData.full_name || 'Người Mới',
      gender: memberData.gender || 'Nam',
      generation: String(generation || 1),
      branch: memberData.branch || 'Chi 1',
      branch_type: memberData.branch_type || 'Nội tộc (Trực hệ)',
      parent_id: memberData.parent_id || '-',
      parent_name: memberData.parent_name || '',
      sibling_order: this.appendSiblingOrder(memberData.parent_id),
      spouse: memberData.spouse || '',
      spouse_id: memberData.spouse_id || '',
      birth_date: memberData.birth_date || '',
      death_date: memberData.death_date || '',
      status: memberData.status || 'Còn sống',
      role: memberData.role || 'Thành viên',
      notes: memberData.notes || ''
    };

    // Auto-update parent name if missing
    if (newMember.parent_id && newMember.parent_id !== '-' && this.members.has(newMember.parent_id)) {
      newMember.parent_name = this.members.get(newMember.parent_id).full_name;
    }

    this.members.set(id, newMember);
    this.recalculateStats();
    this.notify('add', newMember);
    return newMember;
  }

  updateMember(id, updates) {
    const existing = this.members.get(id);
    if (!existing) return null;

    this.recordSnapshot();

    // Check cycle if changing parent
    if (updates.parent_id && updates.parent_id !== existing.parent_id) {
      if (this.wouldCreateCycle(id, updates.parent_id)) {
        throw new Error(`Không thể đổi cha/mẹ thành ${updates.parent_id} vì sẽ tạo chu trình vòng lặp thế hệ!`);
      }
      if (updates.parent_id !== '-' && this.members.has(updates.parent_id)) {
        updates.sibling_order = this.appendSiblingOrder(updates.parent_id,id);
        updates.parent_name = this.members.get(updates.parent_id).full_name;
        // Update generation
        const parentGen = parseInt(this.members.get(updates.parent_id).generation, 10) || 1;
        updates.generation = String(parentGen + 1);
      }
    }

    // Handle spouse_id changes
    if (updates.spouse_id !== undefined) {
      // Clear old spouse link if changing
      if (existing.spouse_id && existing.spouse_id !== updates.spouse_id && this.members.has(existing.spouse_id)) {
        const oldPartner = this.members.get(existing.spouse_id);
        oldPartner.spouse_id = '';
        oldPartner.spouse = '';
        this.members.set(oldPartner.id, oldPartner);
      }
      // Auto-fill spouse name when spouse_id is set
      if (updates.spouse_id && updates.spouse_id !== '' && this.members.has(updates.spouse_id)) {
        const spouse = this.members.get(updates.spouse_id);
        updates.spouse = spouse.full_name;
      }
    }

    const updated = { ...existing, ...updates };
    this.members.set(id, updated);
    this.recalculateStats();
    this.notify('update', updated);
    return updated;
  }

  deleteMember(id, deleteChildren = false) {
    if (!this.members.has(id)) return false;

    this.recordSnapshot();

    if (deleteChildren) {
      const descendants = this.getDescendants(id);
      for (const dId of descendants) {
        this.members.delete(dId);
      }
    } else {
      // Reparent children to this person's parent
      const member = this.members.get(id);
      const parentId = member.parent_id || '-';
      const parentName = member.parent_name || '';
      for (const child of this.getChildren(id)) {
        child.parent_id = parentId;
        child.parent_name = parentName;
        this.members.set(child.id, child);
      }
    }

    // Clear spouse link on partner if this member had one
    const member = this.members.get(id);
    if (member && member.spouse_id && this.members.has(member.spouse_id)) {
      const partner = this.members.get(member.spouse_id);
      partner.spouse_id = '';
      partner.spouse = '';
      this.members.set(partner.id, partner);
    }

    this.members.delete(id);
    if (this.selectedMemberId === id) {
      this.selectedMemberId = null;
    }
    this.recalculateStats();
    this.notify('delete', id);
    return true;
  }

  reparent(childId, newParentId) {
    if (childId === newParentId) return false;
    if (this.wouldCreateCycle(childId, newParentId)) {
      throw new Error('Hành động kéo thả tạo thành chu trình vô lý (con thành cha của cụ tổ)!');
    }
    return this.updateMember(childId, { parent_id: newParentId });
  }

  selectMember(id) {
    this.selectedMemberId = id;
    this.notify('select', id);
  }

  // Add spouse as a full member node
  addSpouseAsMember(memberId) {
    const member = this.members.get(memberId);
    if (!member) return null;

    this.recordSnapshot();

    // Determine opposite gender
    const oppositeGender = member.gender === 'Nam' ? 'Nữ' : 'Nam';

    // Generate new ID for spouse
    const spouseId = this.nextMemberId();

    // Create spouse as a full member (inline, no extra snapshots)
    const spouse = {
      id: spouseId,
      christian_name: '',
      full_name: 'Phối Ngẫu',
      gender: oppositeGender,
      generation: member.generation,
      branch: member.branch,
      branch_type: 'Ngoại tộc (Phối ngẫu)',
      parent_id: '-',
      parent_name: '',
      spouse: member.full_name,
      spouse_id: memberId,
      birth_date: '',
      death_date: '',
      status: 'Còn sống',
      role: 'Phối ngẫu',
      notes: ''
    };

    this.members.set(spouseId, spouse);

    // Link spouses bidirectionally (inline, no extra snapshots)
    const updatedMember = { ...member, spouse_id: spouseId, spouse: spouse.full_name };
    this.members.set(memberId, updatedMember);

    this.recalculateStats();
    this.notify('update', updatedMember); // Notify about partner update so inspector refreshes
    this.notify('add', spouse);

    return spouse;
  }

  // Get spouse member by spouse_id
  getSpouseMember(memberId) {
    const member = this.members.get(memberId);
    if (!member || !member.spouse_id || !this.members.has(member.spouse_id)) return null;
    return this.members.get(member.spouse_id);
  }

  // Migrate existing spouse text strings to full member nodes
  migrateSpouseTextToMembers() {
    this.recordSnapshot();
    let migrated = 0;

    for (const member of this.members.values()) {
      // Skip if already linked via spouse_id
      if (member.spouse_id) continue;
      // Skip if no spouse text
      if (!member.spouse || !member.spouse.trim()) continue;

      // Parse spouse text - may contain multiple spouses separated by ";"
      const spouseNames = member.spouse.split(';').map(s => s.trim()).filter(s => s);

      // For now, only migrate the first spouse
      const spouseName = spouseNames[0];
      if (!spouseName) continue;

      // Determine opposite gender
      const oppositeGender = member.gender === 'Nam' ? 'Nữ' : 'Nam';

      // Generate new ID
      const spouseId = this.nextMemberId();

      // Create spouse as a full member
      const spouse = {
        id: spouseId,
        christian_name: '',
        full_name: spouseName,
        gender: oppositeGender,
        generation: member.generation,
        branch: member.branch,
        branch_type: 'Ngoại tộc (Phối ngẫu)',
        parent_id: '-',
        parent_name: '',
        spouse: member.full_name,
        spouse_id: member.id,
        birth_date: '',
        death_date: '',
        status: 'Còn sống',
        role: 'Phối ngẫu',
        notes: ''
      };

      this.members.set(spouseId, spouse);

      // Link bidirectionally
      const updatedMember = { ...member, spouse_id: spouseId, spouse: spouseName };
      this.members.set(member.id, updatedMember);

      migrated++;
    }

    this.recalculateStats();
    this.notify('load', null);
    return migrated;
  }
}
