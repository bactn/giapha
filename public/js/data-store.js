// data-store.js - Graph Data Store with Undo/Redo & Cycle Detection
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
        this.members.set(m.id, { ...m });
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
    return children;
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

  addMember(memberData) {
    this.recordSnapshot();

    const id = memberData.id || `P${String(this.members.size + 1).padStart(3, '0')}`;
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
      spouse: memberData.spouse || '',
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
        updates.parent_name = this.members.get(updates.parent_id).full_name;
        // Update generation
        const parentGen = parseInt(this.members.get(updates.parent_id).generation, 10) || 1;
        updates.generation = String(parentGen + 1);
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
}
