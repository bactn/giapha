// dist/js/member-order.js
function compareSiblings(a, b) {
  const rank = (m) => typeof m.sibling_order === "number" && Number.isFinite(m.sibling_order) ? m.sibling_order : Infinity;
  const first = rank(a), second = rank(b);
  return first !== second ? first < second ? -1 : 1 : String(a.id).localeCompare(String(b.id), "vi", { numeric: true });
}

// dist/js/data-store.js
var DataStore = class {
  constructor() {
    this.lineageInfo = {
      name: "H\u1ECD Tr\u1EA7n Ng\u1ECDc - Ng\xE0nh II C\xF4ng Gi\xE1o",
      origin: "Nam \u0110\u1ECBnh / Ninh B\xECnh",
      total_members: 0,
      generations: 8
    };
    this.members = /* @__PURE__ */ new Map();
    this.selectedMemberId = null;
    this.history = [];
    this.future = [];
    this.maxHistory = 30;
    this.listeners = /* @__PURE__ */ new Set();
    this.readOnly = false;
    this._originalState = null;
  }
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  notify(event = "update", data = null) {
    for (const listener of this.listeners) {
      listener(event, data);
    }
  }
  recordSnapshot() {
    if (this.readOnly) throw new Error("B\u1EA1n ch\u1EC9 c\xF3 quy\u1EC1n xem. H\xE3y g\u1EEDi \u0111\u1EC1 xu\u1EA5t ch\u1EC9nh s\u1EEDa.");
    const snapshot = {
      lineageInfo: JSON.parse(JSON.stringify(this.lineageInfo)),
      members: Array.from(this.members.values()).map((m) => ({ ...m }))
    };
    this.history.push(snapshot);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    this.future = [];
  }
  undo() {
    if (this.readOnly) return false;
    if (this.history.length === 0) return false;
    const current = {
      lineageInfo: JSON.parse(JSON.stringify(this.lineageInfo)),
      members: Array.from(this.members.values()).map((m) => ({ ...m }))
    };
    this.future.push(current);
    const prev = this.history.pop();
    this.loadState(prev, false);
    this.notify("undo");
    return true;
  }
  redo() {
    if (this.readOnly) return false;
    if (this.future.length === 0) return false;
    const current = {
      lineageInfo: JSON.parse(JSON.stringify(this.lineageInfo)),
      members: Array.from(this.members.values()).map((m) => ({ ...m }))
    };
    this.history.push(current);
    const next = this.future.pop();
    this.loadState(next, false);
    this.notify("redo");
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
        for (const field of ["full_name", "christian_name", "gender", "generation", "branch", "branch_type", "status", "birth_date", "death_date", "spouse", "notes"]) {
          member[field] = String(member[field] ?? (field === "full_name" ? member.id : ""));
        }
        this.members.set(m.id, member);
      }
    }
    this.recalculateStats();
    this.notify("load");
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
      if (m.branch_type?.includes("Ph\u1ED1i ng\u1EABu") && m.spouse_id && this.members.has(m.spouse_id) && this.getChildren(m.id).length === 0) continue;
      if (!m.parent_id || m.parent_id === "-" || !this.members.has(m.parent_id)) {
        roots.push(m);
      }
    }
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
    return "P" + String(largest + 1n).padStart(3, "0");
  }
  canMoveSibling(id, step) {
    const member = this.members.get(id);
    if (this.readOnly || ![-1, 1].includes(step) || !member || !this.members.has(member.parent_id)) return false;
    const siblings = this.getChildren(member.parent_id);
    const index = siblings.findIndex((m) => m.id === id);
    return index + step >= 0 && index + step < siblings.length;
  }
  moveSibling(id, step) {
    if (!this.canMoveSibling(id, step)) return false;
    const siblings = this.getChildren(this.members.get(id).parent_id);
    const index = siblings.findIndex((m) => m.id === id);
    this.recordSnapshot();
    [siblings[index], siblings[index + step]] = [siblings[index + step], siblings[index]];
    siblings.forEach((member, order) => this.members.set(member.id, { ...member, sibling_order: order }));
    this.notify("update", this.members.get(id));
    return true;
  }
  appendSiblingOrder(parentId, excludeId = null) {
    if (!this.members.has(parentId)) return void 0;
    const siblings = this.getChildren(parentId).filter((m) => m.id !== excludeId);
    if (!siblings.some((m) => typeof m.sibling_order === "number" && Number.isFinite(m.sibling_order))) return void 0;
    siblings.forEach((member, order) => this.members.set(member.id, { ...member, sibling_order: order }));
    return siblings.length;
  }
  getDescendants(id, set = /* @__PURE__ */ new Set()) {
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
    if (!newParentId || newParentId === "-") return false;
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
    const originals = new Map(this._originalState.members.map((m) => [m.id, m]));
    for (const [id, original] of originals) {
      const current = this.members.get(id);
      if (!current) {
        changes.push({ type: "delete_member", member_id: id, old_value: { ...original } });
      } else {
        const updatedFields = {};
        const oldFields = {};
        for (const key of /* @__PURE__ */ new Set([...Object.keys(original), ...Object.keys(current)])) {
          if (current[key] !== original[key]) {
            updatedFields[key] = current[key];
            oldFields[key] = original[key];
          }
        }
        if (Object.keys(updatedFields).length > 0) {
          changes.push({
            type: "update_member",
            member_id: id,
            new_value: updatedFields,
            old_value: oldFields
          });
        }
      }
    }
    for (const [id, current] of this.members) {
      if (!originals.has(id)) {
        changes.push({ type: "add_member", new_value: { ...current } });
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
      members: Array.from(this.members.values()).map((m) => ({ ...m }))
    };
  }
  addMember(memberData) {
    const id = memberData.id || this.nextMemberId();
    if (this.members.has(id)) throw new Error("M\xE3 th\xE0nh vi\xEAn \u0111\xE3 t\u1ED3n t\u1EA1i. Kh\xF4ng th\u1EC3 ghi \u0111\xE8 th\xE0nh vi\xEAn c\u0169.");
    if (memberData.parent_id && memberData.parent_id !== "-" && !this.members.has(memberData.parent_id)) throw new Error("Kh\xF4ng t\xECm th\u1EA5y b\u1ED1/m\u1EB9 \u0111\xE3 ch\u1ECDn.");
    this.recordSnapshot();
    let generation = memberData.generation;
    if (!generation && memberData.parent_id && this.members.has(memberData.parent_id)) {
      const parent = this.members.get(memberData.parent_id);
      generation = (parseInt(parent.generation, 10) || 1) + 1;
    }
    const newMember = {
      id,
      christian_name: memberData.christian_name || "",
      full_name: memberData.full_name || "Ng\u01B0\u1EDDi M\u1EDBi",
      gender: memberData.gender || "Nam",
      generation: String(generation || 1),
      branch: memberData.branch || "Chi 1",
      branch_type: memberData.branch_type || "N\u1ED9i t\u1ED9c (Tr\u1EF1c h\u1EC7)",
      parent_id: memberData.parent_id || "-",
      parent_name: memberData.parent_name || "",
      sibling_order: this.appendSiblingOrder(memberData.parent_id),
      spouse: memberData.spouse || "",
      spouse_id: memberData.spouse_id || "",
      birth_date: memberData.birth_date || "",
      death_date: memberData.death_date || "",
      status: memberData.status || "C\xF2n s\u1ED1ng",
      role: memberData.role || "Th\xE0nh vi\xEAn",
      notes: memberData.notes || ""
    };
    if (newMember.parent_id && newMember.parent_id !== "-" && this.members.has(newMember.parent_id)) {
      newMember.parent_name = this.members.get(newMember.parent_id).full_name;
    }
    this.members.set(id, newMember);
    this.recalculateStats();
    this.notify("add", newMember);
    return newMember;
  }
  updateMember(id, updates) {
    const existing = this.members.get(id);
    if (!existing) return null;
    this.recordSnapshot();
    if (updates.parent_id && updates.parent_id !== existing.parent_id) {
      if (this.wouldCreateCycle(id, updates.parent_id)) {
        throw new Error(`Kh\xF4ng th\u1EC3 \u0111\u1ED5i cha/m\u1EB9 th\xE0nh ${updates.parent_id} v\xEC s\u1EBD t\u1EA1o chu tr\xECnh v\xF2ng l\u1EB7p th\u1EBF h\u1EC7!`);
      }
      if (updates.parent_id !== "-" && this.members.has(updates.parent_id)) {
        updates.sibling_order = this.appendSiblingOrder(updates.parent_id, id);
        updates.parent_name = this.members.get(updates.parent_id).full_name;
        const parentGen = parseInt(this.members.get(updates.parent_id).generation, 10) || 1;
        updates.generation = String(parentGen + 1);
      }
    }
    if (updates.spouse_id !== void 0) {
      if (existing.spouse_id && existing.spouse_id !== updates.spouse_id && this.members.has(existing.spouse_id)) {
        const oldPartner = this.members.get(existing.spouse_id);
        oldPartner.spouse_id = "";
        oldPartner.spouse = "";
        this.members.set(oldPartner.id, oldPartner);
      }
      if (updates.spouse_id && updates.spouse_id !== "" && this.members.has(updates.spouse_id)) {
        const spouse = this.members.get(updates.spouse_id);
        updates.spouse = spouse.full_name;
      }
    }
    const updated = { ...existing, ...updates };
    this.members.set(id, updated);
    this.recalculateStats();
    this.notify("update", updated);
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
      const member2 = this.members.get(id);
      const parentId = member2.parent_id || "-";
      const parentName = member2.parent_name || "";
      for (const child of this.getChildren(id)) {
        child.parent_id = parentId;
        child.parent_name = parentName;
        this.members.set(child.id, child);
      }
    }
    const member = this.members.get(id);
    if (member && member.spouse_id && this.members.has(member.spouse_id)) {
      const partner = this.members.get(member.spouse_id);
      partner.spouse_id = "";
      partner.spouse = "";
      this.members.set(partner.id, partner);
    }
    this.members.delete(id);
    if (this.selectedMemberId === id) {
      this.selectedMemberId = null;
    }
    this.recalculateStats();
    this.notify("delete", id);
    return true;
  }
  reparent(childId, newParentId) {
    if (childId === newParentId) return false;
    if (this.wouldCreateCycle(childId, newParentId)) {
      throw new Error("H\xE0nh \u0111\u1ED9ng k\xE9o th\u1EA3 t\u1EA1o th\xE0nh chu tr\xECnh v\xF4 l\xFD (con th\xE0nh cha c\u1EE7a c\u1EE5 t\u1ED5)!");
    }
    return this.updateMember(childId, { parent_id: newParentId });
  }
  selectMember(id) {
    this.selectedMemberId = id;
    this.notify("select", id);
  }
  // Add spouse as a full member node
  addSpouseAsMember(memberId) {
    const member = this.members.get(memberId);
    if (!member) return null;
    this.recordSnapshot();
    const oppositeGender = member.gender === "Nam" ? "N\u1EEF" : "Nam";
    const spouseId = this.nextMemberId();
    const spouse = {
      id: spouseId,
      christian_name: "",
      full_name: "Ph\u1ED1i Ng\u1EABu",
      gender: oppositeGender,
      generation: member.generation,
      branch: member.branch,
      branch_type: "Ngo\u1EA1i t\u1ED9c (Ph\u1ED1i ng\u1EABu)",
      parent_id: "-",
      parent_name: "",
      spouse: member.full_name,
      spouse_id: memberId,
      birth_date: "",
      death_date: "",
      status: "C\xF2n s\u1ED1ng",
      role: "Ph\u1ED1i ng\u1EABu",
      notes: ""
    };
    this.members.set(spouseId, spouse);
    const updatedMember = { ...member, spouse_id: spouseId, spouse: spouse.full_name };
    this.members.set(memberId, updatedMember);
    this.recalculateStats();
    this.notify("update", updatedMember);
    this.notify("add", spouse);
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
      if (member.spouse_id) continue;
      if (!member.spouse || !member.spouse.trim()) continue;
      const spouseNames = member.spouse.split(";").map((s) => s.trim()).filter((s) => s);
      const spouseName = spouseNames[0];
      if (!spouseName) continue;
      const oppositeGender = member.gender === "Nam" ? "N\u1EEF" : "Nam";
      const spouseId = this.nextMemberId();
      const spouse = {
        id: spouseId,
        christian_name: "",
        full_name: spouseName,
        gender: oppositeGender,
        generation: member.generation,
        branch: member.branch,
        branch_type: "Ngo\u1EA1i t\u1ED9c (Ph\u1ED1i ng\u1EABu)",
        parent_id: "-",
        parent_name: "",
        spouse: member.full_name,
        spouse_id: member.id,
        birth_date: "",
        death_date: "",
        status: "C\xF2n s\u1ED1ng",
        role: "Ph\u1ED1i ng\u1EABu",
        notes: ""
      };
      this.members.set(spouseId, spouse);
      const updatedMember = { ...member, spouse_id: spouseId, spouse: spouseName };
      this.members.set(member.id, updatedMember);
      migrated++;
    }
    this.recalculateStats();
    this.notify("load", null);
    return migrated;
  }
};

// dist/js/auto-layout.js
var AutoLayout = class {
  constructor(options = {}) {
    this.nodeWidth = options.nodeWidth || 230;
    this.nodeHeight = options.nodeHeight || 140;
    this.siblingGap = options.siblingGap || 35;
    this.generationGap = options.generationGap || 130;
    this.orientation = options.orientation || "VERTICAL";
  }
  calculateLayout(dataStore, filterOption = "ALL", maxDepth = 0) {
    const allMembers = dataStore.getAllMembers();
    if (allMembers.length === 0) {
      return { positions: /* @__PURE__ */ new Map(), links: [], bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
    }
    let visibleMembers = allMembers;
    let baseGenShift = 0;
    if (typeof filterOption === "string" && filterOption.startsWith("SUBTREE:")) {
      const rootId = filterOption.split(":")[1];
      const rootMember = dataStore.getMember(rootId);
      if (rootMember) {
        const descendants = dataStore.getDescendants(rootId);
        descendants.add(rootId);
        visibleMembers = allMembers.filter((m) => descendants.has(m.id));
        baseGenShift = (parseInt(rootMember.generation, 10) || 1) - 1;
      }
    } else if (typeof filterOption === "object" && filterOption && filterOption.type === "SUBTREE") {
      const rootId = filterOption.rootId;
      const rootMember = dataStore.getMember(rootId);
      if (rootMember) {
        const descendants = dataStore.getDescendants(rootId);
        descendants.add(rootId);
        visibleMembers = allMembers.filter((m) => descendants.has(m.id));
        baseGenShift = (parseInt(rootMember.generation, 10) || 1) - 1;
      }
    } else if (filterOption === "Chi 1") {
      visibleMembers = allMembers.filter((m) => m.branch === "Chi 1" || m.branch === "Ng\xE0nh II");
    } else if (filterOption === "Chi 2") {
      visibleMembers = allMembers.filter((m) => m.branch === "Chi 2" || m.branch === "Ng\xE0nh II");
    } else if (filterOption === "PATERNAL_ONLY") {
      visibleMembers = allMembers.filter((m) => m.branch_type && m.branch_type.includes("N\u1ED9i t\u1ED9c"));
    } else if (filterOption === "MATERNAL_ONLY") {
      visibleMembers = allMembers.filter((m) => m.branch_type && m.branch_type.includes("Ngo\u1EA1i t\u1ED9c"));
    }
    if (maxDepth > 0) {
      let minGen = Infinity;
      for (const m of visibleMembers) {
        const g = parseInt(m.generation, 10);
        if (!isNaN(g) && g < minGen) minGen = g;
      }
      if (minGen === Infinity) minGen = 1;
      visibleMembers = visibleMembers.filter((m) => {
        const g = parseInt(m.generation, 10);
        return !isNaN(g) && g - minGen + 1 <= maxDepth;
      });
    }
    const memberMap = /* @__PURE__ */ new Map();
    for (const m of visibleMembers) {
      memberMap.set(m.id, m);
    }
    const childrenMap = /* @__PURE__ */ new Map();
    for (const m of visibleMembers) {
      childrenMap.set(m.id, []);
    }
    const rootList = [];
    for (const m of visibleMembers) {
      if (!m.parent_id || m.parent_id === "-" || !memberMap.has(m.parent_id)) {
        rootList.push(m);
      } else {
        const parentChildren = childrenMap.get(m.parent_id);
        if (parentChildren) {
          parentChildren.push(m);
        }
      }
    }
    rootList.sort((a, b) => (parseInt(a.generation, 10) || 1) - (parseInt(b.generation, 10) || 1));
    for (const children of childrenMap.values()) {
      children.sort(compareSiblings);
    }
    const positions = /* @__PURE__ */ new Map();
    const subtreeWidths = /* @__PURE__ */ new Map();
    const computeSubtreeWidth = (id) => {
      const children = childrenMap.get(id) || [];
      if (children.length === 0) {
        subtreeWidths.set(id, this.nodeWidth);
        return this.nodeWidth;
      }
      let totalWidth = 0;
      for (let i = 0; i < children.length; i++) {
        if (i > 0) totalWidth += this.siblingGap;
        totalWidth += computeSubtreeWidth(children[i].id);
      }
      const width = Math.max(this.nodeWidth, totalWidth);
      subtreeWidths.set(id, width);
      return width;
    };
    for (const root of rootList) {
      computeSubtreeWidth(root.id);
    }
    let currentRootX = 50;
    const baseY = 80;
    const positionNode = (id, startX, level) => {
      const m = memberMap.get(id);
      const children = childrenMap.get(id) || [];
      const subtreeW = subtreeWidths.get(id) || this.nodeWidth;
      let nodeX, nodeY;
      if (this.orientation === "VERTICAL") {
        const actualGen = parseInt(m.generation, 10) || level + 1;
        const relGen = Math.max(1, actualGen - baseGenShift);
        nodeY = baseY + (relGen - 1) * (this.nodeHeight + this.generationGap);
        if (children.length === 0) {
          nodeX = startX + (subtreeW - this.nodeWidth) / 2;
        } else {
          let childX = startX;
          const childCenters = [];
          for (const child of children) {
            const childW = subtreeWidths.get(child.id) || this.nodeWidth;
            positionNode(child.id, childX, level + 1);
            const childPos = positions.get(child.id);
            childCenters.push(childPos.x + this.nodeWidth / 2);
            childX += childW + this.siblingGap;
          }
          const firstChildCenter = childCenters[0];
          const lastChildCenter = childCenters[childCenters.length - 1];
          nodeX = (firstChildCenter + lastChildCenter) / 2 - this.nodeWidth / 2;
        }
      } else {
        const actualGen = parseInt(m.generation, 10) || level + 1;
        const relGen = Math.max(1, actualGen - baseGenShift);
        nodeX = baseY + (relGen - 1) * (this.nodeWidth + this.generationGap);
        if (children.length === 0) {
          nodeY = startX + (subtreeW - this.nodeHeight) / 2;
        } else {
          let childY = startX;
          const childCenters = [];
          for (const child of children) {
            const childW = subtreeWidths.get(child.id) || this.nodeHeight;
            positionNode(child.id, childY, level + 1);
            const childPos = positions.get(child.id);
            childCenters.push(childPos.y + this.nodeHeight / 2);
            childY += childW + this.siblingGap;
          }
          const firstChildCenter = childCenters[0];
          const lastChildCenter = childCenters[childCenters.length - 1];
          nodeY = (firstChildCenter + lastChildCenter) / 2 - this.nodeHeight / 2;
        }
      }
      positions.set(id, { x: nodeX, y: nodeY, member: m });
    };
    for (const root of rootList) {
      const rootW = subtreeWidths.get(root.id) || this.nodeWidth;
      positionNode(root.id, currentRootX, 0);
      currentRootX += rootW + this.siblingGap * 2;
    }
    const links = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [id, pos] of positions.entries()) {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x + this.nodeWidth);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y + this.nodeHeight);
      const m = pos.member;
      if (m.parent_id && positions.has(m.parent_id)) {
        const parentPos = positions.get(m.parent_id);
        links.push({
          sourceId: m.parent_id,
          targetId: id,
          source: parentPos,
          target: pos,
          branch: m.branch
        });
      }
    }
    if (minX === Infinity) {
      minX = 0;
      maxX = 1e3;
      minY = 0;
      maxY = 800;
    }
    return {
      positions,
      links,
      bounds: { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY },
      filterOption,
      totalNodes: positions.size
    };
  }
  generatePath(link) {
    const isVert = this.orientation === "VERTICAL";
    const s = link.source;
    const t = link.target;
    if (isVert) {
      const sx = s.x + this.nodeWidth / 2;
      const sy = s.y + this.nodeHeight;
      const tx = t.x + this.nodeWidth / 2;
      const ty = t.y;
      const midY = (sy + ty) / 2;
      return {
        path: `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`,
        startPoint: { x: sx, y: sy },
        endPoint: { x: tx, y: ty }
      };
    } else {
      const sx = s.x + this.nodeWidth;
      const sy = s.y + this.nodeHeight / 2;
      const tx = t.x;
      const ty = t.y + this.nodeHeight / 2;
      const midX = (sx + tx) / 2;
      return {
        path: `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`,
        startPoint: { x: sx, y: sy },
        endPoint: { x: tx, y: ty }
      };
    }
  }
};

// dist/js/html.js
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

// dist/js/member-presentation.js
var knownDate = (value) => {
  const text = String(value || "").trim();
  return /^(?:[-?–—]+|không rõ|chưa rõ|unknown|null)$/i.test(text) ? "" : text;
};
function lifeDates(member) {
  const birth = knownDate(member.birth_date);
  const death = knownDate(member.death_date);
  const early = member.status === "M\u1EA5t s\u1EDBm" || /^mất sớm$/i.test(death);
  const died = early || member.status === "\u0110\xE3 m\u1EA5t" || Boolean(death);
  const deathLabel = death && !/^(?:mất sớm|đã mất|mất)$/i.test(death) ? `M\u1EA5t ${death}` : early ? "M\u1EA5t s\u1EDBm" : died ? "M\u1EA5t" : "";
  return [birth ? `SN ${birth}` : "", deathLabel].filter(Boolean).join(" - ");
}
function spouseRole(member, spouse = null) {
  if (spouse?.gender === "N\u1EEF") return "V\u1EE3";
  if (spouse?.gender === "Nam") return "Ch\u1ED3ng";
  return member.gender === "Nam" ? "V\u1EE3" : member.gender === "N\u1EEF" ? "Ch\u1ED3ng" : "V\u1EE3/Ch\u1ED3ng";
}
function avatarSVG(gender) {
  const female = gender === "N\u1EEF";
  const label = female ? "Avatar n\u1EEF" : gender === "Nam" ? "Avatar nam" : "Avatar th\xE0nh vi\xEAn";
  return `<svg viewBox="0 0 48 48" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="24" fill="${female ? "#ffe4e6" : "#dbeafe"}"/>
    ${female ? '<path d="M12 25V19a12 12 0 0 1 24 0v17H12Z" fill="#65453d"/>' : ""}
    <path d="M6 48v-5a18 14 0 0 1 36 0v5" fill="${female ? "#be4567" : "#426ba3"}"/><path d="M19 29h10v9l-5 4-5-4Z" fill="#e6ad89"/>
    <ellipse cx="24" cy="21" rx="9" ry="12" fill="#f4c9a8"/>
    <path d="${female ? "M14 21V18a10 11 0 0 1 20 0v7c-2-7-7-7-10-13-1 5-5 8-10 9Z" : "M14 22V17a10 10 0 0 1 20 0v6l-3-7c-5 2-9 0-12-2l-2 8Z"}" fill="#65453d"/>
    <circle cx="21" cy="23" r=".8" fill="#65453d"/><circle cx="28" cy="23" r=".8" fill="#65453d"/><path d="M21 28q3 2 6 0" fill="none" stroke="#ba7863" stroke-linecap="round"/></svg>`;
}
function drawAvatar(ctx, gender, cx, cy, radius) {
  const female = gender === "N\u1EEF";
  ctx.save();
  ctx.translate(cx - radius, cy - radius);
  ctx.scale(radius / 24, radius / 24);
  ctx.beginPath();
  ctx.arc(24, 24, 24, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = female ? "#ffe4e6" : "#dbeafe";
  ctx.fillRect(0, 0, 48, 48);
  ctx.fillStyle = "#65453d";
  if (female) ctx.fillRect(12, 16, 24, 23);
  ctx.fillStyle = female ? "#be4567" : "#426ba3";
  ctx.beginPath();
  ctx.ellipse(24, 47, 19, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f4c9a8";
  ctx.beginPath();
  ctx.ellipse(24, 22, 9, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#65453d";
  ctx.beginPath();
  ctx.ellipse(24, 14, 10, 6, 0, Math.PI, Math.PI * 2);
  ctx.lineTo(34, 21);
  ctx.lineTo(29, 15);
  ctx.lineTo(17, 18);
  ctx.lineTo(14, 23);
  ctx.fill();
  ctx.restore();
}

// dist/js/tree-canvas.js
var TreeCanvas = class {
  constructor(viewportEl, nodesContainerEl, svgEl, linksGroupEl, dataStore, autoLayout) {
    this.viewport = viewportEl;
    this.container = nodesContainerEl;
    this.svg = svgEl;
    this.linksGroup = linksGroupEl;
    this.dataStore = dataStore;
    this.layout = autoLayout;
    this.scale = 1;
    this.panX = 60;
    this.panY = 40;
    this.isPanning = false;
    this.startPanX = 0;
    this.startPanY = 0;
    this.touchStartDist = 0;
    this.touchStartScale = 1;
    this.draggingNodeId = null;
    this.activeFilter = "ALL";
    this.layoutData = null;
    this.init();
  }
  init() {
    this.setupPanAndZoom();
    this.setupTouchGestures();
    this.dataStore.subscribe((event, data) => {
      if (["load", "add", "update", "delete", "undo", "redo"].includes(event)) {
        this.render();
      } else if (event === "select") {
        this.highlightSelected(data);
      }
    });
    window.addEventListener("resize", () => {
      this.renderMinimap();
    });
  }
  setupPanAndZoom() {
    this.viewport.addEventListener("mousedown", (e) => {
      if (e.target === this.viewport || e.target === this.svg || e.target.tagName === "svg" || e.target.tagName === "g") {
        this.isPanning = true;
        this.startPanX = e.clientX - this.panX;
        this.startPanY = e.clientY - this.panY;
      }
    });
    window.addEventListener("mousemove", (e) => {
      if (this.isPanning) {
        this.panX = e.clientX - this.startPanX;
        this.panY = e.clientY - this.startPanY;
        this.applyTransform();
        this.renderMinimap();
      }
    });
    window.addEventListener("mouseup", () => {
      this.isPanning = false;
    });
    this.viewport.addEventListener("wheel", (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      const newScale = Math.min(Math.max(0.12, this.scale * zoomFactor), 2.5);
      const rect = this.viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      this.panX = mouseX - (mouseX - this.panX) * (newScale / this.scale);
      this.panY = mouseY - (mouseY - this.panY) * (newScale / this.scale);
      this.scale = newScale;
      this.applyTransform();
      this.updateZoomDisplay();
      this.renderMinimap();
    }, { passive: false });
  }
  setupTouchGestures() {
    this.viewport.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        if (e.target === this.viewport || e.target === this.svg || e.target.tagName === "svg" || e.target.tagName === "g") {
          this.isPanning = true;
          this.startPanX = touch.clientX - this.panX;
          this.startPanY = touch.clientY - this.panY;
        }
      } else if (e.touches.length === 2) {
        this.isPanning = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this.touchStartDist = Math.hypot(dx, dy);
        this.touchStartScale = this.scale;
      }
    }, { passive: false });
    this.viewport.addEventListener("touchmove", (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && this.isPanning) {
        const touch = e.touches[0];
        this.panX = touch.clientX - this.startPanX;
        this.panY = touch.clientY - this.startPanY;
        this.applyTransform();
        this.renderMinimap();
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDist = Math.hypot(dx, dy);
        if (this.touchStartDist > 0) {
          const ratio = currentDist / this.touchStartDist;
          const newScale = Math.min(Math.max(0.12, this.touchStartScale * ratio), 2.5);
          const rect = this.viewport.getBoundingClientRect();
          const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
          const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
          this.panX = midX - (midX - this.panX) * (newScale / this.scale);
          this.panY = midY - (midY - this.panY) * (newScale / this.scale);
          this.scale = newScale;
          this.applyTransform();
          this.updateZoomDisplay();
          this.renderMinimap();
        }
      }
    }, { passive: false });
    this.viewport.addEventListener("touchend", (e) => {
      if (e.touches.length < 2) {
        this.touchStartDist = 0;
      }
      if (e.touches.length === 0) {
        this.isPanning = false;
      }
    });
  }
  applyTransform() {
    const transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    this.container.style.transform = transform;
    this.linksGroup.setAttribute("transform", `translate(${this.panX}, ${this.panY}) scale(${this.scale})`);
  }
  updateZoomDisplay() {
    const textEl = document.getElementById("zoom-level-text");
    if (textEl) {
      textEl.textContent = `${Math.round(this.scale * 100)}%`;
    }
  }
  setZoom(scale) {
    this.scale = Math.min(Math.max(0.12, scale), 2.5);
    this.applyTransform();
    this.updateZoomDisplay();
    this.renderMinimap();
  }
  zoomFit() {
    if (!this.layoutData || !this.layoutData.bounds) return;
    const { width, height, minX, minY } = this.layoutData.bounds;
    const vWidth = this.viewport.clientWidth;
    const vHeight = this.viewport.clientHeight;
    const scaleX = (vWidth - 60) / (width || 1);
    const scaleY = (vHeight - 60) / (height || 1);
    this.scale = Math.min(Math.max(0.12, Math.min(scaleX, scaleY)), 1.1);
    this.panX = (vWidth - width * this.scale) / 2 - minX * this.scale;
    this.panY = Math.max(30, (vHeight - height * this.scale) / 2 - minY * this.scale);
    this.applyTransform();
    this.updateZoomDisplay();
    this.renderMinimap();
  }
  // Pan and zoom to center on a specific member's node
  focusOnMember(memberId) {
    if (!this.layoutData || !this.layoutData.positions) return;
    const pos = this.layoutData.positions.get(memberId);
    if (!pos) return;
    const vWidth = this.viewport.clientWidth;
    const vHeight = this.viewport.clientHeight;
    const nodeW = this.layout.nodeWidth;
    const nodeH = this.layout.nodeHeight;
    const targetScale = Math.min(1.5, Math.min(vWidth / (nodeW + 200), vHeight / (nodeH + 200)));
    const centerX = pos.x + nodeW / 2;
    const centerY = pos.y + nodeH / 2;
    this.scale = targetScale;
    this.panX = vWidth / 2 - centerX * targetScale;
    this.panY = vHeight / 2 - centerY * targetScale;
    this.applyTransform();
    this.updateZoomDisplay();
    this.renderMinimap();
  }
  render() {
    this.layoutData = this.layout.calculateLayout(this.dataStore, this.activeFilter);
    const { positions, links } = this.layoutData;
    this.linksGroup.innerHTML = "";
    for (const link of links) {
      const { path: pathData, startPoint, endPoint } = this.layout.generatePath(link);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathData);
      let branchClass = "tree-link";
      let portClass = "tree-port-dot";
      if (link.branch === "Chi 1") {
        branchClass += " tree-link-chi-1";
        portClass += " port-chi-1";
      } else if (link.branch === "Chi 2") {
        branchClass += " tree-link-chi-2";
        portClass += " port-chi-2";
      } else if (link.source.member && parseInt(link.source.member.generation, 10) <= 2) {
        branchClass += " tree-link-root";
      }
      path.setAttribute("class", branchClass);
      path.dataset.source = link.sourceId;
      path.dataset.target = link.targetId;
      this.linksGroup.appendChild(path);
      const startCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      startCircle.setAttribute("cx", startPoint.x);
      startCircle.setAttribute("cy", startPoint.y);
      startCircle.setAttribute("r", "3.5");
      startCircle.setAttribute("class", portClass);
      this.linksGroup.appendChild(startCircle);
      const endCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      endCircle.setAttribute("cx", endPoint.x);
      endCircle.setAttribute("cy", endPoint.y);
      endCircle.setAttribute("r", "3.5");
      endCircle.setAttribute("class", portClass);
      this.linksGroup.appendChild(endCircle);
    }
    this.container.innerHTML = "";
    const fragment = document.createDocumentFragment();
    for (const [id, pos] of positions.entries()) {
      const nodeEl = this.createNodeElement(pos.member, pos.x, pos.y);
      fragment.appendChild(nodeEl);
    }
    this.container.appendChild(fragment);
    this.applyTransform();
    this.highlightSelected(this.dataStore.selectedMemberId);
    this.renderMinimap();
  }
  createNodeElement(member, x, y) {
    const card = document.createElement("div");
    card.className = "family-node";
    card.dataset.id = member.id;
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    if (member.gender === "N\u1EEF") {
      card.classList.add("gender-female");
    } else {
      card.classList.add("gender-male");
    }
    if (member.role === "\u0110\xEDch T\xF4n") {
      card.classList.add("is-dich-ton");
    }
    const isDeceased = member.status === "\u0110\xE3 m\u1EA5t" || member.status === "M\u1EA5t s\u1EDBm";
    card.innerHTML = `
      <div class="node-header">
        <span class="font-bold text-[10px] text-slate-500">\u0110\u1EDDi ${escapeHTML(member.generation)} \u2022 ${escapeHTML(member.branch || "Ng\xE0nh II")}</span>
        <div class="flex items-center space-x-1.5">
          ${member.role === "\u0110\xEDch T\xF4n" ? '<span class="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded">\u{1F451} \u0110\xEDch T\xF4n</span>' : ""}
          ${member.branch_type && member.branch_type.includes("Ngo\u1EA1i t\u1ED9c") ? '<span class="text-[9px] bg-purple-100 text-purple-800 font-semibold px-1 py-0.2 rounded">Ngo\u1EA1i</span>' : ""}
          <span class="w-2 h-2 rounded-full ${isDeceased ? "bg-slate-300" : "bg-emerald-500"}" title="${escapeHTML(member.status || "C\xF2n s\u1ED1ng")}"></span>
          <!-- STANDARDIZED ON-CARD DELETE BUTTON -->
          <button class="btn-node-delete-quick" title="X\xF3a ng\u01B0\u1EDDi n\xE0y">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <div class="node-body">
        <div class="node-avatar ${member.gender === "N\u1EEF" ? "avatar-female" : "avatar-male"}">
          ${avatarSVG(member.gender)}
        </div>
        <div class="node-info">
          ${member.christian_name ? `<div class="node-christian-name">[${escapeHTML(member.christian_name)}]</div>` : ""}
          <div class="node-full-name" title="B\u1EA5m \u0111\xFAp \u0111\u1EC3 s\u1EEDa t\xEAn">${escapeHTML(member.full_name)}</div>
          <div class="node-meta" title="${escapeHTML(lifeDates(member))}">${escapeHTML(lifeDates(member))}</div>
        </div>
      </div>
      ${member.spouse_id && this.dataStore.members.has(member.spouse_id) ? (() => {
      const sp = this.dataStore.members.get(member.spouse_id);
      const spGender = sp.gender === "N\u1EEF" ? "avatar-female" : "avatar-male";
      const spChristian = sp.christian_name ? `[${sp.christian_name}] ` : "";
      return `
        <div class="node-footer node-footer-spouse" data-spouse-id="${escapeHTML(sp.id)}" title="Nh\u1EA5p \u0111\u1EC3 xem chi ti\u1EBFt ${escapeHTML(sp.full_name)}">
          <div class="spouse-mini-avatar ${spGender}">${avatarSVG(sp.gender)}</div>
          <div class="spouse-mini-info">
            <span class="spouse-mini-name">${spouseRole(member, sp)}: ${escapeHTML(spChristian)}${escapeHTML(sp.full_name)}</span>
            <span class="spouse-mini-meta">${escapeHTML(lifeDates(sp))}</span>
          </div>
        </div>`;
    })() : member.spouse ? `
        <div class="node-footer">
          <span class="truncate">${spouseRole(member)}: ${escapeHTML(member.spouse)}</span>
        </div>
      ` : ""}
      
      <!-- Quick Action Hover Bar -->
      <div class="node-actions">
        <button class="node-action-btn action-move-left" title="\u0110\u01B0a sang tr\xE1i trong nh\xF3m anh/ch\u1ECB/em" aria-label="\u0110\u01B0a sang tr\xE1i trong nh\xF3m anh/ch\u1ECB/em" ${this.dataStore.canMoveSibling(member.id, -1) ? "" : "disabled"}>\u2190</button>
        <button class="node-action-btn action-move-right" title="\u0110\u01B0a sang ph\u1EA3i trong nh\xF3m anh/ch\u1ECB/em" aria-label="\u0110\u01B0a sang ph\u1EA3i trong nh\xF3m anh/ch\u1ECB/em" ${this.dataStore.canMoveSibling(member.id, 1) ? "" : "disabled"}>\u2192</button>
        <button class="node-action-btn action-add-child" title="Th\xEAm con">
          <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
          <span>Con</span>
        </button>
        <button class="node-action-btn action-add-spouse" title="Th\xEAm ph\u1ED1i ng\u1EABu">
          <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
          <span>V\u1EE3/Ch\u1ED3ng</span>
        </button>
        <button class="node-action-btn action-edit" title="S\u1EEDa chi ti\u1EBFt \u1EDF menu tr\xE1i">
          <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
          <span>Xem</span>
        </button>
        <button class="node-action-btn btn-act-del action-delete" title="X\xF3a ng\u01B0\u1EDDi n\xE0y">
          <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
    `;
    for (const [selector, step] of [[".action-move-left", -1], [".action-move-right", 1]]) {
      card.querySelector(selector).onclick = (event) => {
        event.stopPropagation();
        if (this.dataStore.moveSibling(member.id, step)) {
          this.dataStore.selectMember(member.id);
          window.dispatchEvent(new CustomEvent("node-selected-for-inspector", { detail: member.id }));
        }
      };
    }
    card.onclick = (e) => {
      e.stopPropagation();
      this.dataStore.selectMember(member.id);
      window.dispatchEvent(new CustomEvent("node-selected-for-inspector", { detail: member.id }));
    };
    card.querySelector(".btn-node-delete-quick").onclick = (e) => {
      e.stopPropagation();
      this.confirmDelete(member.id);
    };
    card.querySelector(".action-delete").onclick = (e) => {
      e.stopPropagation();
      this.confirmDelete(member.id);
    };
    const nameEl = card.querySelector(".node-full-name");
    nameEl.ondblclick = (e) => {
      e.stopPropagation();
      this.startInlineEdit(nameEl, member);
    };
    card.querySelector(".action-add-child").onclick = (e) => {
      e.stopPropagation();
      const newGen = (parseInt(member.generation, 10) || 1) + 1;
      const child = this.dataStore.addMember({
        full_name: "Ng\u01B0\u1EDDi M\u1EDBi",
        parent_id: member.id,
        parent_name: member.full_name,
        generation: newGen,
        branch: member.branch
      });
      this.dataStore.selectMember(child.id);
      window.dispatchEvent(new CustomEvent("node-selected-for-inspector", { detail: child.id }));
    };
    card.querySelector(".action-add-spouse").onclick = (e) => {
      e.stopPropagation();
      const existingSpouse = this.dataStore.getSpouseMember(member.id);
      if (existingSpouse) {
        alert(`${member.full_name} \u0111\xE3 c\xF3 ph\u1ED1i ng\u1EABu l\xE0 ${existingSpouse.full_name}. N\u1EBFu mu\u1ED1n thay \u0111\u1ED5i, h\xE3y h\u1EE7y li\xEAn k\u1EBFt tr\u01B0\u1EDBc.`);
        return;
      }
      const spouse = this.dataStore.addSpouseAsMember(member.id);
      if (spouse) {
        this.dataStore.selectMember(spouse.id);
        window.dispatchEvent(new CustomEvent("node-selected-for-inspector", { detail: spouse.id }));
      }
    };
    const spouseFooter = card.querySelector(".node-footer-spouse");
    if (spouseFooter) {
      spouseFooter.onclick = (e) => {
        e.stopPropagation();
        const spouseId = spouseFooter.dataset.spouseId;
        if (spouseId) {
          this.dataStore.selectMember(spouseId);
          window.dispatchEvent(new CustomEvent("node-selected-for-inspector", { detail: spouseId }));
        }
      };
    }
    card.querySelector(".action-edit").onclick = (e) => {
      e.stopPropagation();
      this.dataStore.selectMember(member.id);
      window.dispatchEvent(new CustomEvent("node-selected-for-inspector", { detail: member.id }));
    };
    this.setupNodeDrag(card, member.id);
    return card;
  }
  confirmDelete(memberId) {
    const member = this.dataStore.getMember(memberId);
    if (!member) return;
    const children = this.dataStore.getChildren(memberId);
    if (children.length > 0) {
      const choice = confirm(`Th\xE0nh vi\xEAn "${member.full_name}" c\xF3 ${children.length} ng\u01B0\u1EDDi con tr\u1EF1c h\u1EC7.

\u2022 Nh\u1EA5n OK: X\xD3A NG\u01AF\u1EDCI N\xC0Y (c\xE1c con s\u1EBD t\u1EF1 \u0111\u1ED9ng \u0111\u01B0\u1EE3c chuy\u1EC3n l\xEAn \u0111\u1EDDi tr\xEAn).
\u2022 Nh\u1EA5n Cancel: B\u1ECF qua kh\xF4ng x\xF3a.`);
      if (choice) {
        this.dataStore.deleteMember(memberId, false);
      }
    } else {
      if (confirm(`B\u1EA1n c\xF3 ch\u1EAFc mu\u1ED1n x\xF3a "${member.full_name}" (${member.id}) kh\xF4ng?`)) {
        this.dataStore.deleteMember(memberId, false);
      }
    }
  }
  startInlineEdit(nameEl, member) {
    const currentName = member.full_name;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "node-inline-input";
    input.value = currentName;
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => {
      const val = input.value.trim();
      if (val && val !== currentName) {
        this.dataStore.updateMember(member.id, { full_name: val });
      } else {
        input.replaceWith(nameEl);
      }
    };
    input.onblur = commit;
    input.onkeydown = (e) => {
      if (e.key === "Enter") {
        commit();
      } else if (e.key === "Escape") {
        input.replaceWith(nameEl);
      }
    };
  }
  setupNodeDrag(card, memberId) {
    let startX, startY, isDragging = false;
    card.onmousedown = (e) => {
      if (e.target.closest(".node-actions") || e.target.closest(".btn-node-delete-quick") || e.target.tagName === "INPUT") return;
      if (e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      isDragging = false;
      const onMouseMove = (moveEvt) => {
        const dist = Math.hypot(moveEvt.clientX - startX, moveEvt.clientY - startY);
        if (dist > 6 && !isDragging) {
          isDragging = true;
          this.draggingNodeId = memberId;
          card.classList.add("dragging");
        }
      };
      const onMouseUp = (upEvt) => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        if (isDragging) {
          card.classList.remove("dragging");
          this.draggingNodeId = null;
          card.style.pointerEvents = "none";
          const targetEl = document.elementFromPoint(upEvt.clientX, upEvt.clientY)?.closest(".family-node");
          card.style.pointerEvents = "auto";
          if (targetEl && targetEl.dataset.id !== memberId) {
            const targetId = targetEl.dataset.id;
            const targetMember = this.dataStore.getMember(targetId);
            const sourceMember = this.dataStore.getMember(memberId);
            if (confirm(`B\u1EA1n c\xF3 mu\u1ED1n gh\xE9p "${sourceMember.full_name}" l\xE0m con c\u1EE7a "${targetMember.full_name}" kh\xF4ng?`)) {
              try {
                this.dataStore.reparent(memberId, targetId);
              } catch (err) {
                alert(err.message);
              }
            }
          }
        }
      };
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    };
  }
  highlightSelected(selectedId) {
    const nodes = this.container.querySelectorAll(".family-node");
    nodes.forEach((n) => n.classList.remove("selected"));
    const links = this.linksGroup.querySelectorAll(".tree-link");
    links.forEach((l) => l.classList.remove("highlighted"));
    if (selectedId) {
      const node = this.container.querySelector(`.family-node[data-id="${CSS.escape(selectedId)}"]`);
      if (node) {
        node.classList.add("selected");
      }
      const relatedLinks = this.linksGroup.querySelectorAll(`[data-source="${selectedId}"], [data-target="${selectedId}"]`);
      relatedLinks.forEach((l) => l.classList.add("highlighted"));
    }
  }
  renderMinimap() {
    const minimapCanvas = document.getElementById("minimap-canvas");
    const viewportBox = document.getElementById("minimap-viewport-box");
    if (!minimapCanvas || !viewportBox || !this.layoutData || !this.layoutData.bounds) return;
    const ctx = minimapCanvas.getContext("2d");
    const { width: boundsW, height: boundsH, minX, minY } = this.layoutData.bounds;
    const cW = minimapCanvas.width = minimapCanvas.parentElement.clientWidth;
    const cH = minimapCanvas.height = minimapCanvas.parentElement.clientHeight;
    ctx.clearRect(0, 0, cW, cH);
    const pad = 16;
    const miniScale = Math.min((cW - pad * 2) / (boundsW || 1), (cH - pad * 2) / (boundsH || 1));
    const offsetX = (cW - boundsW * miniScale) / 2;
    const offsetY = (cH - boundsH * miniScale) / 2;
    for (const [id, pos] of this.layoutData.positions.entries()) {
      const mx = offsetX + (pos.x - minX) * miniScale;
      const my = offsetY + (pos.y - minY) * miniScale;
      ctx.fillStyle = pos.member.gender === "N\u1EEF" ? "#e11d48" : "#2563eb";
      ctx.fillRect(mx, my, this.layout.nodeWidth * miniScale, this.layout.nodeHeight * miniScale);
    }
    const vW = this.viewport.clientWidth;
    const vH = this.viewport.clientHeight;
    const vpX = offsetX + (-this.panX / this.scale - minX) * miniScale;
    const vpY = offsetY + (-this.panY / this.scale - minY) * miniScale;
    const vpW = vW / this.scale * miniScale;
    const vpH = vH / this.scale * miniScale;
    viewportBox.style.left = `${Math.max(0, vpX)}px`;
    viewportBox.style.top = `${Math.max(0, vpY)}px`;
    viewportBox.style.width = `${Math.min(cW, vpW)}px`;
    viewportBox.style.height = `${Math.min(cH, vpH)}px`;
  }
};

// dist/js/mindnode-text.js
var MindNodeTextEditor = class {
  constructor(container, dataStore) {
    this.container = container;
    this.dataStore = dataStore;
    this.collapsedNodes = /* @__PURE__ */ new Set();
    this.draggedNodeId = null;
    this.init();
  }
  init() {
    this.dataStore.subscribe((event, data) => {
      if (["load", "add", "update", "delete", "undo", "redo"].includes(event)) {
        this.render();
      } else if (event === "select") {
        this.revealSelected(data);
      }
    });
    window.addEventListener("keydown", (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      const selectedId = this.dataStore.selectedMemberId;
      if (!selectedId) return;
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        this.addChildTo(selectedId);
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.addSiblingTo(selectedId);
      } else if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        this.outdent(selectedId);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        this.deleteNode(selectedId);
      }
    });
  }
  render() {
    this.container.innerHTML = "";
    const roots = this.dataStore.getRootMembers();
    if (roots.length === 0) {
      this.container.innerHTML = `
        <div class="p-6 text-center text-xs text-slate-400">
          Ch\u01B0a c\xF3 th\xE0nh vi\xEAn n\xE0o. B\u1EA5m <strong>+ C\u1EE5 T\u1ED5 M\u1EDBi</strong> \u0111\u1EC3 b\u1EAFt \u0111\u1EA7u.
        </div>
      `;
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const root of roots) {
      this.renderTreeNode(root, 0, fragment);
    }
    this.container.appendChild(fragment);
    const badge = document.getElementById("outline-count-badge");
    if (badge) badge.textContent = this.dataStore.members.size;
    this.highlightSelected(this.dataStore.selectedMemberId);
  }
  renderTreeNode(member, depth, parentElement) {
    const children = this.dataStore.getChildren(member.id);
    const hasChildren = children.length > 0;
    const isCollapsed = this.collapsedNodes.has(member.id);
    const nodeWrapper = document.createElement("div");
    nodeWrapper.className = "outline-node-wrapper group";
    nodeWrapper.dataset.id = member.id;
    const row = document.createElement("div");
    row.className = "outline-node-row";
    row.style.paddingLeft = `${depth * 14 + 4}px`;
    row.draggable = true;
    const toggle = document.createElement("button");
    toggle.className = "outline-toggle-btn";
    if (hasChildren) {
      toggle.type = "button";
      toggle.title = `${isCollapsed ? "M\u1EDF r\u1ED9ng" : "Thu g\u1ECDn"} nh\xE1nh ${member.full_name}`;
      toggle.setAttribute("aria-label", toggle.title);
      toggle.setAttribute("aria-expanded", String(!isCollapsed));
      toggle.innerHTML = isCollapsed ? `<svg class="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>` : `<svg class="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>`;
      toggle.onclick = (e) => {
        e.stopPropagation();
        if (isCollapsed) {
          this.collapsedNodes.delete(member.id);
        } else {
          this.collapsedNodes.add(member.id);
        }
        this.render();
      };
    } else {
      toggle.disabled = true;
      toggle.setAttribute("aria-hidden", "true");
      toggle.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block"></span>`;
    }
    row.appendChild(toggle);
    const genBadge = document.createElement("span");
    genBadge.className = "text-[9px] font-mono px-1 py-0.2 rounded bg-slate-100 text-slate-600 mr-1.5 font-bold flex-shrink-0";
    genBadge.textContent = `\u0110${member.generation}`;
    row.appendChild(genBadge);
    const title = document.createElement("span");
    title.className = "outline-node-title";
    let label = member.full_name;
    if (member.christian_name) {
      label = `[${member.christian_name}] ${member.full_name}`;
    }
    if (member.role === "\u0110\xEDch T\xF4n") {
      label = `\u{1F451} ${label}`;
    }
    title.textContent = label;
    title.title = "B\u1EA5m \u0111\xFAp \u0111\u1EC3 s\u1EEDa t\xEAn";
    row.appendChild(title);
    const spouseMember = this.dataStore.getSpouseMember(member.id);
    if (spouseMember) {
      const spouseLabel = document.createElement("span");
      spouseLabel.className = "outline-spouse-label";
      spouseLabel.textContent = ` ${spouseRole(member, spouseMember)}: ${spouseMember.full_name}`;
      spouseLabel.title = `Ph\u1ED1i ng\u1EABu: ${spouseMember.full_name} (${spouseMember.id})`;
      row.appendChild(spouseLabel);
    }
    const actionGroup = document.createElement("div");
    actionGroup.className = "flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1";
    const addBtn = document.createElement("button");
    addBtn.className = "w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-amber-700 hover:bg-amber-50";
    addBtn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>`;
    addBtn.title = "Th\xEAm con";
    addBtn.onclick = (e) => {
      e.stopPropagation();
      this.addChildTo(member.id);
    };
    actionGroup.appendChild(addBtn);
    const addSpouseBtn = document.createElement("button");
    addSpouseBtn.className = "w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50";
    addSpouseBtn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>`;
    addSpouseBtn.title = "Th\xEAm v\u1EE3/ch\u1ED3ng";
    addSpouseBtn.onclick = (e) => {
      e.stopPropagation();
      this.addSpouseTo(member.id);
    };
    actionGroup.appendChild(addSpouseBtn);
    const delBtn = document.createElement("button");
    delBtn.className = "w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50";
    delBtn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`;
    delBtn.title = "X\xF3a ng\u01B0\u1EDDi n\xE0y";
    delBtn.onclick = (e) => {
      e.stopPropagation();
      this.deleteNode(member.id);
    };
    actionGroup.appendChild(delBtn);
    row.appendChild(actionGroup);
    row.onclick = () => {
      this.dataStore.selectMember(member.id);
      window.dispatchEvent(new CustomEvent("node-selected-for-inspector", { detail: member.id }));
    };
    row.ondblclick = (e) => {
      e.stopPropagation();
      this.startInlineRename(row, title, member);
    };
    this.setupDragEvents(row, member.id);
    nodeWrapper.appendChild(row);
    if (hasChildren && !isCollapsed) {
      const childrenContainer = document.createElement("div");
      childrenContainer.className = "outline-children-group";
      for (const child of children) {
        this.renderTreeNode(child, depth + 1, childrenContainer);
      }
      nodeWrapper.appendChild(childrenContainer);
    }
    parentElement.appendChild(nodeWrapper);
  }
  setupDragEvents(row, memberId) {
    row.ondragstart = (e) => {
      this.draggedNodeId = memberId;
      e.dataTransfer.setData("text/plain", memberId);
      row.style.opacity = "0.5";
    };
    row.ondragend = () => {
      row.style.opacity = "1";
      document.querySelectorAll(".outline-node-row").forEach((r) => r.classList.remove("active-drag-target"));
      this.draggedNodeId = null;
    };
    row.ondragover = (e) => {
      e.preventDefault();
      if (this.draggedNodeId && this.draggedNodeId !== memberId) {
        row.classList.add("active-drag-target");
      }
    };
    row.ondragleave = () => {
      row.classList.remove("active-drag-target");
    };
    row.ondrop = (e) => {
      e.preventDefault();
      row.classList.remove("active-drag-target");
      const sourceId = this.draggedNodeId;
      if (!sourceId || sourceId === memberId) return;
      try {
        this.dataStore.reparent(sourceId, memberId);
        this.render();
      } catch (err) {
        alert(err.message);
      }
    };
  }
  startInlineRename(row, titleSpan, member) {
    const currentName = member.full_name;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "outline-inline-input";
    input.value = currentName;
    titleSpan.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => {
      const val = input.value.trim();
      if (val && val !== currentName) {
        this.dataStore.updateMember(member.id, { full_name: val });
      } else {
        input.replaceWith(titleSpan);
      }
    };
    input.onblur = commit;
    input.onkeydown = (e) => {
      if (e.key === "Enter") {
        commit();
      } else if (e.key === "Escape") {
        input.replaceWith(titleSpan);
      }
    };
  }
  addChildTo(parentId) {
    const parent = this.dataStore.getMember(parentId);
    if (!parent) return;
    const newGen = (parseInt(parent.generation, 10) || 1) + 1;
    const newChild = this.dataStore.addMember({
      full_name: "Ng\u01B0\u1EDDi M\u1EDBi",
      parent_id: parentId,
      parent_name: parent.full_name,
      generation: newGen,
      branch: parent.branch
    });
    this.collapsedNodes.delete(parentId);
    this.render();
    this.dataStore.selectMember(newChild.id);
    window.dispatchEvent(new CustomEvent("node-selected-for-inspector", { detail: newChild.id }));
    setTimeout(() => {
      const row = this.container.querySelector(`.outline-node-wrapper[data-id="${CSS.escape(newChild.id)}"] .outline-node-row`);
      const titleSpan = row?.querySelector(".outline-node-title");
      if (row && titleSpan) {
        this.startInlineRename(row, titleSpan, newChild);
      }
    }, 50);
  }
  addSpouseTo(memberId) {
    const member = this.dataStore.getMember(memberId);
    if (!member) return;
    const existingSpouse = this.dataStore.getSpouseMember(memberId);
    if (existingSpouse) {
      alert(`${member.full_name} \u0111\xE3 c\xF3 ph\u1ED1i ng\u1EABu l\xE0 ${existingSpouse.full_name}. N\u1EBFu mu\u1ED1n thay \u0111\u1ED5i, h\xE3y h\u1EE7y li\xEAn k\u1EBFt tr\u01B0\u1EDBc.`);
      return;
    }
    const spouse = this.dataStore.addSpouseAsMember(memberId);
    if (!spouse) return;
    this.render();
    this.dataStore.selectMember(spouse.id);
    window.dispatchEvent(new CustomEvent("node-selected-for-inspector", { detail: spouse.id }));
    setTimeout(() => {
      const spouseRow = this.container.querySelector(`.outline-spouse-title`);
      if (spouseRow) {
        const row = spouseRow.closest(".outline-node-row");
        if (row) {
          this.startInlineRename(row, spouseRow, spouse);
        }
      }
    }, 50);
  }
  addSiblingTo(siblingId) {
    const sibling = this.dataStore.getMember(siblingId);
    if (!sibling) return;
    const newSibling = this.dataStore.addMember({
      full_name: "Ng\u01B0\u1EDDi M\u1EDBi",
      parent_id: sibling.parent_id,
      parent_name: sibling.parent_name,
      generation: sibling.generation,
      branch: sibling.branch
    });
    this.render();
    this.dataStore.selectMember(newSibling.id);
    window.dispatchEvent(new CustomEvent("node-selected-for-inspector", { detail: newSibling.id }));
    setTimeout(() => {
      const row = this.container.querySelector(`.outline-node-wrapper[data-id="${CSS.escape(newSibling.id)}"] .outline-node-row`);
      const titleSpan = row?.querySelector(".outline-node-title");
      if (row && titleSpan) {
        this.startInlineRename(row, titleSpan, newSibling);
      }
    }, 50);
  }
  outdent(memberId) {
    const member = this.dataStore.getMember(memberId);
    if (!member || !member.parent_id || member.parent_id === "-") return;
    const parent = this.dataStore.getMember(member.parent_id);
    if (!parent) return;
    const grandparent = parent.parent_id || "-";
    this.dataStore.updateMember(memberId, { parent_id: grandparent });
    this.render();
  }
  deleteNode(memberId) {
    const member = this.dataStore.getMember(memberId);
    if (!member) return;
    const children = this.dataStore.getChildren(memberId);
    if (children.length > 0) {
      const choice = confirm(`Th\xE0nh vi\xEAn "${member.full_name}" c\xF3 ${children.length} ng\u01B0\u1EDDi con tr\u1EF1c h\u1EC7.

\u2022 Nh\u1EA5n OK: X\xD3A NG\u01AF\u1EDCI N\xC0Y (c\xE1c con s\u1EBD \u0111\u01B0\u1EE3c gi\u1EEF l\u1EA1i v\xE0 n\u1ED1i l\xEAn \u0111\u1EDDi tr\xEAn).
\u2022 Nh\u1EA5n Cancel: H\u1EE6Y, kh\xF4ng x\xF3a.`);
      if (choice) {
        this.dataStore.deleteMember(memberId, false);
      }
    } else {
      if (confirm(`B\u1EA1n c\xF3 ch\u1EAFc ch\u1EAFn mu\u1ED1n x\xF3a "${member.full_name}" (${member.id}) kh\xF4ng?`)) {
        this.dataStore.deleteMember(memberId, false);
      }
    }
    this.render();
  }
  revealSelected(selectedId) {
    let parent = this.dataStore.getMember(selectedId)?.parent_id;
    let expanded = false;
    const visited = /* @__PURE__ */ new Set();
    while (parent && !visited.has(parent)) {
      visited.add(parent);
      expanded = this.collapsedNodes.delete(parent) || expanded;
      parent = this.dataStore.getMember(parent)?.parent_id;
    }
    if (expanded) this.render();
    else this.highlightSelected(selectedId);
  }
  highlightSelected(selectedId) {
    const allRows = this.container.querySelectorAll(".outline-node-row");
    allRows.forEach((r) => r.classList.remove("selected"));
    if (selectedId) {
      const target = this.container.querySelector(`.outline-node-wrapper[data-id="${CSS.escape(selectedId)}"] > .outline-node-row`);
      if (target) {
        target.classList.add("selected");
        target.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }
  expandAll() {
    this.collapsedNodes.clear();
    this.render();
  }
  collapseAll() {
    for (const m of this.dataStore.getAllMembers()) {
      if (this.dataStore.getChildren(m.id).length > 0) {
        this.collapsedNodes.add(m.id);
      }
    }
    this.render();
  }
};

// dist/js/excel-parser.js
var ExcelParser = class {
  static parseCSV(text) {
    const lines = [];
    let row = [];
    let inQuotes = false;
    let field = "";
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        row.push(field.trim());
        field = "";
      } else if ((char === "\r" || char === "\n") && !inQuotes) {
        if (char === "\r" && nextChar === "\n") i++;
        row.push(field.trim());
        if (row.some((cell) => cell.length > 0)) {
          lines.push(row);
        }
        row = [];
        field = "";
      } else {
        field += char;
      }
    }
    if (field.length > 0 || row.length > 0) {
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) {
        lines.push(row);
      }
    }
    return lines;
  }
  static normalizeColumnName(name) {
    return name.toLowerCase().replace(/[_\s\-\/]/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  static parseGenealogyData(csvText) {
    const rawRows = this.parseCSV(csvText);
    if (rawRows.length < 2) {
      return {
        success: false,
        errors: ["File kh\xF4ng c\xF3 d\u1EEF li\u1EC7u ho\u1EB7c thi\u1EBFu d\xF2ng ti\xEAu \u0111\u1EC1!"]
      };
    }
    let headerIndex = -1;
    for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
      const rowNorm = rawRows[i].map((c) => this.normalizeColumnName(c));
      if (rowNorm.some((c) => c.includes("maid") || c.includes("id") || c.includes("hovaten") || c.includes("ten"))) {
        headerIndex = i;
        break;
      }
    }
    if (headerIndex === -1) {
      headerIndex = 0;
    }
    const headers = rawRows[headerIndex];
    const colMap = {};
    headers.forEach((h, idx) => {
      const norm = this.normalizeColumnName(h);
      if (norm.includes("maid") || norm === "id") colMap.id = idx;
      else if (norm.includes("tenthanh") || norm.includes("phapdanh")) colMap.christian_name = idx;
      else if (norm.includes("hovaten") || norm === "ten" || norm.includes("hoten")) colMap.full_name = idx;
      else if (norm.includes("gioitinh") || norm === "gioi") colMap.gender = idx;
      else if (norm.includes("thehe") || norm.includes("doi")) colMap.generation = idx;
      else if (norm.includes("chinganh") || norm.includes("chi") || norm.includes("nganh")) colMap.branch = idx;
      else if (norm.includes("nhanh") || norm.includes("noingoai") || norm.includes("chau")) colMap.branch_type = idx;
      else if (norm.includes("machame") || norm.includes("idcha") || norm.includes("cha") || norm.includes("parent")) colMap.parent_id = idx;
      else if (norm.includes("tenchame") || norm.includes("tencha") || norm.includes("parentname")) colMap.parent_name = idx;
      else if (norm.includes("vochong") || norm.includes("phoingau") || norm.includes("spouse")) colMap.spouse = idx;
      else if (norm.includes("ngaysinh") || norm.includes("namsinh") || norm.includes("sinh")) colMap.birth_date = idx;
      else if (norm.includes("ngaymat") || norm.includes("nammat") || norm.includes("gioal") || norm.includes("mat")) colMap.death_date = idx;
      else if (norm.includes("trangthai") || norm.includes("tinhtrang")) colMap.status = idx;
      else if (norm.includes("vaitro") || norm.includes("danhhieu") || norm.includes("v\u1ECBtri")) colMap.role = idx;
      else if (norm.includes("ghichu") || norm.includes("thongtin")) colMap.notes = idx;
    });
    const members = [];
    const errors = [];
    const warnings = [];
    const seenIds = /* @__PURE__ */ new Set();
    for (let r = headerIndex + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.every((c) => c === "")) continue;
      const getVal = (field) => {
        const idx = colMap[field];
        return idx !== void 0 && row[idx] ? row[idx].trim() : "";
      };
      const id = getVal("id") || `P${String(members.length + 1).padStart(3, "0")}`;
      const fullName = getVal("full_name");
      if (!fullName) {
        warnings.push(`D\xF2ng ${r + 1}: B\u1ECF tr\u1ED1ng H\u1ECD v\xE0 T\xEAn.`);
        continue;
      }
      if (seenIds.has(id)) {
        errors.push(`D\xF2ng ${r + 1}: Tr\xF9ng l\u1EB7p M\xE3 ID "${id}".`);
      }
      seenIds.add(id);
      let christianName = getVal("christian_name");
      let gender = getVal("gender");
      let spouse = getVal("spouse");
      let notes = getVal("notes");
      if (!gender) {
        const lower = fullName.toLowerCase();
        if (lower.includes("th\u1ECB") || ["maria", "anna", "t\xEAr\xEAxa"].includes(christianName.toLowerCase())) {
          gender = "N\u1EEF";
        } else {
          gender = "Nam";
        }
      }
      let branchType = getVal("branch_type");
      if (!branchType) {
        if (fullName.startsWith("Tr\u1EA7n Ng\u1ECDc")) branchType = "N\u1ED9i t\u1ED9c (Tr\u1EF1c h\u1EC7)";
        else if (fullName.startsWith("Tr\u1EA7n Th\u1ECB")) branchType = "N\u1ED9i t\u1ED9c (Con g\xE1i)";
        else if (notes.includes("Ch\xE1u ngo\u1EA1i") || !fullName.startsWith("Tr\u1EA7n ")) branchType = "Ngo\u1EA1i t\u1ED9c (Ch\xE1u ngo\u1EA1i)";
        else branchType = "N\u1ED9i t\u1ED9c";
      }
      let status = getVal("status");
      let deathDate = getVal("death_date");
      if (!status) {
        if (deathDate || notes.toLowerCase().includes("\u0111\xE3 ch\u1EBFt") || notes.toLowerCase().includes("m\u1EA5t")) {
          status = notes.toLowerCase().includes("s\u1EDBm") || notes.toLowerCase().includes("nh\u1ECF") ? "M\u1EA5t s\u1EDBm" : "\u0110\xE3 m\u1EA5t";
        } else {
          status = "C\xF2n s\u1ED1ng";
        }
      }
      let role = getVal("role");
      if (!role) {
        if (notes.includes("\u0110\xCDCH T\xD4N")) role = "\u0110\xEDch T\xF4n";
        else if (id === "P001" || notes.includes("Th\u1EE7y T\u1ED5")) role = "Th\u1EE7y T\u1ED5";
        else if (notes.includes("Tr\u01B0\u1EDFng Chi")) role = "Tr\u01B0\u1EDFng Chi";
        else if (notes.includes("Tu s\u1EF9")) role = "Tu s\u1EF9";
        else role = "Th\xE0nh vi\xEAn";
      }
      members.push({
        id,
        christian_name: christianName,
        full_name: fullName,
        gender,
        generation: getVal("generation") || "1",
        branch: getVal("branch") || "Chi 1",
        branch_type: branchType,
        parent_id: getVal("parent_id") || "-",
        parent_name: getVal("parent_name") || "",
        spouse,
        birth_date: getVal("birth_date"),
        death_date: deathDate,
        status,
        role,
        notes
      });
    }
    for (const m of members) {
      if (m.parent_id && m.parent_id !== "-" && !seenIds.has(m.parent_id)) {
        warnings.push(`Th\xE0nh vi\xEAn "${m.full_name}" (${m.id}) c\xF3 M\xE3 Cha/M\u1EB9 "${m.parent_id}" kh\xF4ng t\u1ED3n t\u1EA1i trong danh s\xE1ch.`);
      }
    }
    return {
      success: errors.length === 0,
      members,
      total: members.length,
      errors,
      warnings
    };
  }
};

// dist/js/kinship.js
var KinshipCalculator = class {
  static getAncestorsWithDistance(dataStore, memberId) {
    const ancestors = /* @__PURE__ */ new Map();
    ancestors.set(memberId, 0);
    let current = memberId;
    let dist = 0;
    while (current && current !== "-") {
      const m = dataStore.getMember(current);
      if (!m || !m.parent_id || m.parent_id === "-") break;
      dist++;
      ancestors.set(m.parent_id, dist);
      current = m.parent_id;
    }
    return ancestors;
  }
  static findLCA(dataStore, idA, idB) {
    const ancestorsA = this.getAncestorsWithDistance(dataStore, idA);
    const ancestorsB = this.getAncestorsWithDistance(dataStore, idB);
    let lca = null;
    let minSumDist = Infinity;
    for (const [id, distA] of ancestorsA.entries()) {
      if (ancestorsB.has(id)) {
        const distB = ancestorsB.get(id);
        const sumDist = distA + distB;
        if (sumDist < minSumDist) {
          minSumDist = sumDist;
          lca = { id, distA, distB };
        }
      }
    }
    return lca;
  }
  static calculateRelationship(dataStore, idA, idB) {
    if (!idA || !idB) return "Vui l\xF2ng ch\u1ECDn \u0111\u1EE7 2 ng\u01B0\u1EDDi.";
    if (idA === idB) return "C\u1EA3 hai ng\u01B0\u1EDDi \u0111\u01B0\u1EE3c ch\u1ECDn l\xE0 c\xF9ng m\u1ED9t ng\u01B0\u1EDDi.";
    const a = dataStore.getMember(idA);
    const b = dataStore.getMember(idB);
    if (!a || !b) return "Kh\xF4ng t\xECm th\u1EA5y th\xF4ng tin th\xE0nh vi\xEAn.";
    const lca = this.findLCA(dataStore, idA, idB);
    if (!lca) {
      return `Kh\xF4ng t\xECm th\u1EA5y t\u1ED5 ti\xEAn chung gi\u1EEFa <strong>${escapeHTML(a.full_name)}</strong> v\xE0 <strong>${escapeHTML(b.full_name)}</strong> (c\xF3 th\u1EC3 thu\u1ED9c 2 nh\xE1nh \u0111\u1ED9c l\u1EADp ho\u1EB7c ng\u01B0\u1EDDi nh\u1EADp ngo\u1EA1i t\u1ED9c).`;
    }
    const { distA, distB } = lca;
    const lcaMember = dataStore.getMember(lca.id);
    const isMaleA = a.gender === "Nam";
    const isMaleB = b.gender === "Nam";
    if (distA === 0) {
      if (distB === 1) return `<strong>${escapeHTML(a.full_name)}</strong> l\xE0 <strong>${isMaleA ? "Cha" : "M\u1EB9"}</strong> c\u1EE7a <strong>${escapeHTML(b.full_name)}</strong>.`;
      if (distB === 2) return `<strong>${escapeHTML(a.full_name)}</strong> l\xE0 <strong>${isMaleA ? "\xD4ng" : "B\xE0"}</strong> c\u1EE7a <strong>${escapeHTML(b.full_name)}</strong>.`;
      if (distB === 3) return `<strong>${escapeHTML(a.full_name)}</strong> l\xE0 <strong>${isMaleA ? "C\u1EE5 \xD4ng" : "C\u1EE5 B\xE0"}</strong> c\u1EE7a <strong>${escapeHTML(b.full_name)}</strong>.`;
      if (distB === 4) return `<strong>${escapeHTML(a.full_name)}</strong> l\xE0 <strong>${isMaleA ? "K\u1EF5 \xD4ng" : "K\u1EF5 B\xE0"}</strong> c\u1EE7a <strong>${escapeHTML(b.full_name)}</strong>.`;
      return `<strong>${escapeHTML(a.full_name)}</strong> l\xE0 <strong>T\u1ED5 ti\xEAn \u0110\u1EDDi ${escapeHTML(a.generation)}</strong> c\u1EE7a <strong>${escapeHTML(b.full_name)}</strong> (c\xE1ch ${distB} th\u1EBF h\u1EC7).`;
    }
    if (distB === 0) {
      if (distA === 1) return `<strong>${escapeHTML(a.full_name)}</strong> l\xE0 <strong>${isMaleA ? "Con trai" : "Con g\xE1i"}</strong> c\u1EE7a <strong>${escapeHTML(b.full_name)}</strong>.`;
      if (distA === 2) return `<strong>${escapeHTML(a.full_name)}</strong> l\xE0 <strong>${isMaleA ? "Ch\xE1u n\u1ED9i/ngo\u1EA1i" : "Ch\xE1u g\xE1i"}</strong> c\u1EE7a <strong>${escapeHTML(b.full_name)}</strong>.`;
      if (distA === 3) return `<strong>${escapeHTML(a.full_name)}</strong> l\xE0 <strong>Ch\u1EAFt</strong> c\u1EE7a <strong>${escapeHTML(b.full_name)}</strong>.`;
      if (distA === 4) return `<strong>${escapeHTML(a.full_name)}</strong> l\xE0 <strong>Ch\xFAt</strong> c\u1EE7a <strong>${escapeHTML(b.full_name)}</strong>.`;
      return `<strong>${escapeHTML(a.full_name)}</strong> l\xE0 <strong>Con ch\xE1u \u0110\u1EDDi ${escapeHTML(a.generation)}</strong> c\u1EE7a <strong>${escapeHTML(b.full_name)}</strong>.`;
    }
    if (distA === 1 && distB === 1) {
      const explicitOrder = typeof a.sibling_order === "number" && typeof b.sibling_order === "number" && a.sibling_order !== b.sibling_order;
      const year = (value) => Number(String(value || "").match(/^(?:\d{1,2}[/. -]\d{1,2}[/. -])?(\d{4})(?:\b|$)/)?.[1]) || 0;
      const genA = year(a.birth_date), genB = year(b.birth_date);
      if (explicitOrder || genA && genB && genA !== genB) {
        if (explicitOrder ? a.sibling_order < b.sibling_order : genA < genB) {
          return `<strong>${escapeHTML(a.full_name)}</strong> l\xE0 <strong>${isMaleA ? "Anh ru\u1ED9t" : "Ch\u1ECB ru\u1ED9t"}</strong> c\u1EE7a <strong>${escapeHTML(b.full_name)}</strong> (C\xF9ng cha/m\u1EB9 l\xE0 ${escapeHTML(lcaMember.full_name)}).`;
        } else {
          return `<strong>${escapeHTML(a.full_name)}</strong> l\xE0 <strong>${isMaleA ? "Em trai ru\u1ED9t" : "Em g\xE1i ru\u1ED9t"}</strong> c\u1EE7a <strong>${escapeHTML(b.full_name)}</strong>.`;
        }
      }
      return `<strong>${escapeHTML(a.full_name)}</strong> v\xE0 <strong>${escapeHTML(b.full_name)}</strong> l\xE0 <strong>Anh/Ch\u1ECB/Em ru\u1ED9t</strong> (C\xF9ng cha/m\u1EB9 l\xE0 ${escapeHTML(lcaMember.full_name)}).`;
    }
    if (distA === distB) {
      const degree = distA;
      if (degree === 2) {
        return `<strong>${escapeHTML(a.full_name)}</strong> v\xE0 <strong>${escapeHTML(b.full_name)}</strong> l\xE0 <strong>Anh/Ch\u1ECB/Em h\u1ECD (Con ch\xFA, con b\xE1c, con c\xF4 c\u1EADu)</strong>. C\xF9ng c\xF3 \xF4ng/b\xE0 chung l\xE0 <strong>${escapeHTML(lcaMember.full_name)}</strong>.`;
      }
      return `<strong>${escapeHTML(a.full_name)}</strong> v\xE0 <strong>${escapeHTML(b.full_name)}</strong> l\xE0 <strong>Anh/Ch\u1ECB/Em h\u1ECD c\xF9ng Th\u1EBF H\u1EC7 \u0110\u1EDDi ${escapeHTML(a.generation)}</strong>. C\u1EE5 t\u1ED5 chung l\xE0 <strong>${escapeHTML(lcaMember.full_name)}</strong>.`;
    }
    if (distB - distA === 1) {
      const role = isMaleA ? "B\xE1c / Ch\xFA h\u1ECD" : "C\xF4 / D\xEC h\u1ECD";
      return `<strong>${escapeHTML(a.full_name)}</strong> l\xE0 <strong>${role}</strong> c\u1EE7a <strong>${escapeHTML(b.full_name)}</strong>.<br><span class="text-slate-500 font-normal">\u2192 <strong>${escapeHTML(b.full_name)}</strong> g\u1ECDi <strong>${escapeHTML(a.full_name)}</strong> l\xE0 ${isMaleA ? "B\xE1c ho\u1EB7c Ch\xFA" : "C\xF4/D\xEC"}, v\xE0 x\u01B0ng l\xE0 Ch\xE1u.</span>`;
    }
    if (distA - distB === 1) {
      return `<strong>${escapeHTML(a.full_name)}</strong> l\xE0 <strong>Ch\xE1u h\u1ECD</strong> c\u1EE7a <strong>${escapeHTML(b.full_name)}</strong>.<br><span class="text-slate-500 font-normal">\u2192 <strong>${escapeHTML(a.full_name)}</strong> g\u1ECDi <strong>${escapeHTML(b.full_name)}</strong> l\xE0 ${b.gender === "Nam" ? "B\xE1c/Ch\xFA" : "C\xF4/D\xEC"}, v\xE0 x\u01B0ng l\xE0 Ch\xE1u.</span>`;
    }
    if (distB - distA >= 2) {
      const genDiff = distB - distA;
      const grandRole = isMaleA ? "\xD4ng h\u1ECD" : "B\xE0 h\u1ECD";
      return `<strong>${escapeHTML(a.full_name)}</strong> l\xE0 <strong>${grandRole}</strong> (${genDiff} \u0111\u1EDDi) c\u1EE7a <strong>${escapeHTML(b.full_name)}</strong>. T\u1ED5 ti\xEAn chung l\xE0 <strong>${escapeHTML(lcaMember.full_name)}</strong>.`;
    }
    if (distA - distB >= 2) {
      return `<strong>${escapeHTML(a.full_name)}</strong> l\xE0 <strong>Ch\xE1u h\u1ECD c\xE0nh d\u01B0\u1EDBi</strong> c\u1EE7a <strong>${escapeHTML(b.full_name)}</strong>.`;
    }
    return `Quan h\u1EC7 ph\u1EA3 h\u1EC7 qua C\u1EE5 t\u1ED5 <strong>${escapeHTML(lcaMember.full_name)}</strong>.`;
  }
};

// dist/js/lunar-calendar.js
var LunarCalendarManager = class {
  static extractLunarDate(dateStr) {
    if (!dateStr) return null;
    const clean = dateStr.trim();
    const match = clean.match(/(\d{1,2})\s*[\/\-]\s*(\d{1,2})/);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return { day, month, raw: clean };
      }
    }
    return null;
  }
  static getAnniversariesByMonth(dataStore) {
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      items: []
    }));
    const unknownItems = [];
    for (const m of dataStore.getAllMembers()) {
      if (m.status === "\u0110\xE3 m\u1EA5t" || m.status === "M\u1EA5t s\u1EDBm" || m.death_date) {
        const parsed = this.extractLunarDate(m.death_date);
        if (parsed) {
          months[parsed.month - 1].items.push({
            member: m,
            day: parsed.day,
            month: parsed.month,
            rawText: m.death_date
          });
        } else if (m.status === "\u0110\xE3 m\u1EA5t" || m.status === "M\u1EA5t s\u1EDBm") {
          unknownItems.push(m);
        }
      }
    }
    for (const group of months) {
      group.items.sort((a, b) => a.day - b.day);
    }
    return { months, unknownItems };
  }
  static renderGi\u1ED7List(container, dataStore, onSelectMember) {
    const { months, unknownItems } = this.getAnniversariesByMonth(dataStore);
    container.innerHTML = "";
    let totalAnniversaries = 0;
    months.forEach((m) => totalAnniversaries += m.items.length);
    if (totalAnniversaries === 0 && unknownItems.length === 0) {
      container.innerHTML = '<div class="p-6 text-center text-slate-400 text-xs">Ch\u01B0a c\xF3 th\xF4ng tin ng\xE0y gi\u1ED7 n\xE0o \u0111\u01B0\u1EE3c nh\u1EADp.</div>';
      return;
    }
    for (const group of months) {
      if (group.items.length === 0) continue;
      const monthCard = document.createElement("div");
      monthCard.className = "border border-slate-200 rounded-xl overflow-hidden shadow-xs mb-3";
      const header = document.createElement("div");
      header.className = "px-3 py-2 bg-amber-50/80 border-b border-amber-200/60 font-bold text-xs text-amber-900 flex items-center justify-between";
      header.innerHTML = `
        <span>Th\xE1ng ${group.month} \xC2m L\u1ECBch</span>
        <span class="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded-full">${group.items.length} \u0111\xE1m gi\u1ED7</span>
      `;
      monthCard.appendChild(header);
      const list = document.createElement("div");
      list.className = "divide-y divide-slate-100 bg-white";
      for (const item of group.items) {
        const row = document.createElement("div");
        row.className = "p-2.5 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors";
        row.innerHTML = `
          <div class="flex items-center space-x-2.5">
            <span class="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex flex-col items-center justify-center font-bold text-xs leading-none">
              <span>${item.day}</span>
              <span class="text-[8px] font-normal uppercase">\xC2L</span>
            </span>
            <div>
              <div class="font-bold text-slate-800 flex items-center space-x-1">
                ${item.member.christian_name ? `<span class="text-amber-700 font-semibold">[${escapeHTML(item.member.christian_name)}]</span>` : ""}
                <span>${escapeHTML(item.member.full_name)}</span>
                <span class="text-[10px] text-slate-400 font-normal">(${escapeHTML(item.member.id)} \u2022 \u0110\u1EDDi ${escapeHTML(item.member.generation)})</span>
              </div>
              <div class="text-[11px] text-slate-500">${escapeHTML(item.rawText)}</div>
            </div>
          </div>
          <button class="text-[11px] text-amber-700 hover:text-amber-900 font-semibold px-2 py-1 bg-amber-50 hover:bg-amber-100 rounded-lg">
            Xem C\xE2y \u2192
          </button>
        `;
        row.onclick = () => {
          if (onSelectMember) onSelectMember(item.member.id);
        };
        list.appendChild(row);
      }
      monthCard.appendChild(list);
      container.appendChild(monthCard);
    }
  }
};

// dist/js/export.js
function spouseCaption(member, store) {
  const partner = store?.getSpouseMember(member.id);
  const name = partner?.full_name || member.spouse;
  return name ? `${spouseRole(member, partner)}: ${name}` : "";
}
var Exporter = class {
  // A4 dimensions in points (72pt = 1 inch): 595 x 842 (portrait), 842 x 595 (landscape)
  static A4 = {
    portrait: { w: 595, h: 842 },
    landscape: { w: 842, h: 595 }
  };
  // A4 layout config: margins and node sizing for A4 landscape - Compact Card
  static A4_CONFIG_CARD = {
    marginTop: 40,
    marginBottom: 30,
    marginLeft: 20,
    marginRight: 20,
    nodeWidth: 110,
    nodeHeight: 36,
    siblingGap: 4,
    generationGap: 46
  };
  // A4 layout config: Table-style rendering (no tree, just data rows) - Portrait
  static A4_CONFIG_TABLE = {
    marginTop: 35,
    marginBottom: 25,
    marginLeft: 20,
    marginRight: 20,
    rowHeight: 16,
    headerHeight: 18,
    fontSize: 8
  };
  static getExportLayout(treeCanvas, scope = "ALL", maxDepth = 0) {
    const dataStore = treeCanvas.dataStore;
    const layoutEngine = treeCanvas.layout;
    if (scope === "CURRENT_VIEW") {
      return treeCanvas.layoutData;
    }
    return layoutEngine.calculateLayout(dataStore, scope, maxDepth);
  }
  // Create a vertical (top-to-bottom) layout optimized for A4 portrait
  static getA4VerticalLayout(treeCanvas, scope = "ALL", maxDepth = 0) {
    const dataStore = treeCanvas.dataStore;
    const cfg = this.A4_CONFIG_CARD;
    const layoutEngine = new treeCanvas.layout.constructor({
      nodeWidth: cfg.nodeWidth,
      nodeHeight: cfg.nodeHeight,
      siblingGap: cfg.siblingGap,
      generationGap: cfg.generationGap,
      orientation: "VERTICAL"
    });
    return layoutEngine.calculateLayout(dataStore, scope, maxDepth);
  }
  // Paginate layout positions for A4 landscape pages (Card layout)
  // Uses landscape to accommodate wide generations, splits by height
  static paginateForA4(layout, cfg = this.A4_CONFIG_CARD) {
    if (!layout || !layout.bounds || layout.positions.size === 0) return [];
    const pageW = this.A4.landscape.w - cfg.marginLeft - cfg.marginRight;
    const pageH = this.A4.landscape.h - cfg.marginTop - cfg.marginBottom;
    const genGroups = /* @__PURE__ */ new Map();
    for (const [id, pos] of layout.positions.entries()) {
      const gen = pos.member.generation;
      if (!genGroups.has(gen)) genGroups.set(gen, []);
      genGroups.get(gen).push({ id, pos, member: pos.member });
    }
    const sortedGens = Array.from(genGroups.keys()).sort((a, b) => parseInt(a) - parseInt(b));
    const pages = [];
    let currentPage = { members: [], links: [], maxY: cfg.marginTop };
    let currentGenIdx = 0;
    while (currentGenIdx < sortedGens.length) {
      const gen = sortedGens[currentGenIdx];
      const members = genGroups.get(gen);
      const genHeight = cfg.nodeHeight;
      if (currentPage.members.length > 0 && currentPage.maxY + cfg.generationGap + genHeight > pageH + cfg.marginTop) {
        pages.push(currentPage);
        currentPage = { members: [], links: [], maxY: cfg.marginTop };
      }
      for (const m of members) {
        currentPage.members.push(m);
      }
      if (currentPage.members.length > 0 && currentGenIdx > 0) {
        const prevGen = sortedGens[currentGenIdx - 1];
        const prevMembers = genGroups.get(prevGen);
        for (const link of layout.links) {
          const parentInPrev = prevMembers.some((pm) => pm.id === link.parent_id);
          const childInCurr = members.some((cm) => cm.id === link.child_id);
          if (parentInPrev && childInCurr) {
            currentPage.links.push(link);
          }
        }
      }
      currentPage.maxY += cfg.generationGap + genHeight;
      currentGenIdx++;
    }
    if (currentPage.members.length > 0) {
      pages.push(currentPage);
    }
    return pages;
  }
  // Paginate for table-style A4 layout (simple row-based pagination) - Landscape
  static paginateForA4Table(dataStore, scope = "ALL", maxDepth = 0) {
    const allMembers = dataStore.getAllMembers();
    let visibleMembers = allMembers;
    if (typeof scope === "string" && scope.startsWith("SUBTREE:")) {
      const rootId = scope.split(":")[1];
      const rootMember = dataStore.getMember(rootId);
      if (rootMember) {
        const descendants = dataStore.getDescendants(rootId);
        descendants.add(rootId);
        visibleMembers = allMembers.filter((m) => descendants.has(m.id));
      }
    } else if (scope === "Chi 1") {
      visibleMembers = allMembers.filter((m) => m.branch === "Chi 1" || m.branch === "Ng\xE0nh II");
    } else if (scope === "Chi 2") {
      visibleMembers = allMembers.filter((m) => m.branch === "Chi 2" || m.branch === "Ng\xE0nh II");
    } else if (scope === "PATERNAL_ONLY") {
      visibleMembers = allMembers.filter((m) => m.branch_type && m.branch_type.includes("N\u1ED9i t\u1ED9c"));
    } else if (scope === "MATERNAL_ONLY") {
      visibleMembers = allMembers.filter((m) => m.branch_type && m.branch_type.includes("Ngo\u1EA1i t\u1ED9c"));
    }
    if (maxDepth > 0) {
      let minGen = Infinity;
      for (const m of visibleMembers) {
        const g = parseInt(m.generation, 10);
        if (!isNaN(g) && g < minGen) minGen = g;
      }
      if (minGen === Infinity) minGen = 1;
      visibleMembers = visibleMembers.filter((m) => {
        const g = parseInt(m.generation, 10);
        return !isNaN(g) && g - minGen + 1 <= maxDepth;
      });
    }
    visibleMembers.sort((a, b) => {
      const genDiff = (parseInt(a.generation, 10) || 1) - (parseInt(b.generation, 10) || 1);
      if (genDiff !== 0) return genDiff;
      return a.id.localeCompare(b.id);
    });
    const cfg = this.A4_CONFIG_TABLE;
    const pageH = this.A4.landscape.h - cfg.marginTop - cfg.marginBottom;
    const usableH = pageH - cfg.headerHeight;
    const rowsPerPage = Math.floor(usableH / cfg.rowHeight);
    const pages = [];
    for (let i = 0; i < visibleMembers.length; i += rowsPerPage) {
      pages.push(visibleMembers.slice(i, i + rowsPerPage));
    }
    return pages;
  }
  static getScopeTitle(dataStore, scope = "ALL") {
    if (scope === "ALL") return "To\xE0n B\u1ED9 D\xF2ng H\u1ECD";
    if (scope === "Chi 1") return "Chi 1 (Th\u01B0\u1EE3ng Chi - Nh\xE1nh C\u1EE5 Tr\u1EA7n Ng\u1ECDc Thanh)";
    if (scope === "Chi 2") return "Chi 2 (H\u1EA1 Chi - Nh\xE1nh C\u1EE5 Tr\u1EA7n Ng\u1ECDc Ph\xFAc)";
    if (scope === "PATERNAL_ONLY") return "Nh\xE1nh N\u1ED9i T\u1ED9c (H\u1ECD Tr\u1EA7n)";
    if (scope === "MATERNAL_ONLY") return "Nh\xE1nh Ngo\u1EA1i T\u1ED9c (Ch\xE1u Ngo\u1EA1i)";
    if (scope.startsWith("SUBTREE:")) {
      const id = scope.split(":")[1];
      const m = dataStore.getMember(id);
      return m ? `Nh\xE1nh C\u1EE5 ${m.full_name} (${m.id})` : "C\xE0nh Nh\xE1nh Ri\xEAng";
    }
    return "B\u1EA3n \u0110\u1ED3 C\xE2y Gia Ph\u1EA3";
  }
  // 1. Direct Canvas 2D Drawing Engine (100% Reliable, never fails on XML/SVG parsing)
  static renderToCanvas2D(treeCanvas, scope = "ALL", scale = 2, maxDepth = 0) {
    const layout = this.getExportLayout(treeCanvas, scope, maxDepth);
    if (!layout || !layout.bounds || layout.positions.size === 0) {
      alert("Kh\xF4ng c\xF3 th\xE0nh vi\xEAn n\xE0o trong c\xE0nh nh\xE1nh \u0111\xE3 ch\u1ECDn \u0111\u1EC3 xu\u1EA5t.");
      return null;
    }
    const { minX, minY, width, height } = layout.bounds;
    const padding = 80;
    const headerHeight = 120;
    const baseWidth = Math.max(1e3, width + padding * 2);
    const baseHeight = Math.max(700, height + padding * 2 + headerHeight);
    const targetScale = Math.min(scale, 9e3 / baseWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(baseWidth * targetScale);
    canvas.height = Math.round(baseHeight * targetScale);
    const ctx = canvas.getContext("2d");
    ctx.scale(targetScale, targetScale);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, baseWidth, baseHeight);
    ctx.fillStyle = "#cbd5e1";
    for (let x = 20; x < baseWidth; x += 26) {
      for (let y = 20; y < baseHeight; y += 26) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const lineageName = treeCanvas.dataStore.lineageInfo.name || "Gia Ph\u1EA3 D\xF2ng H\u1ECD";
    const scopeLabel = this.getScopeTitle(treeCanvas.dataStore, scope);
    ctx.textAlign = "center";
    ctx.fillStyle = "#0f172a";
    ctx.font = 'bold 28px "Playfair Display", Georgia, serif';
    ctx.fillText(lineageName, baseWidth / 2, 50);
    ctx.fillStyle = "#b45309";
    ctx.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`\u2022 ${scopeLabel} \u2022`, baseWidth / 2, 78);
    ctx.fillStyle = "#64748b";
    ctx.font = '13px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`S\u1ED1 l\u01B0\u1EE3ng: ${layout.positions.size} th\xE0nh vi\xEAn \u2022 B\u1EA3n v\u1EBD xu\u1EA5t ng\xE0y ${(/* @__PURE__ */ new Date()).toLocaleDateString("vi-VN")}`, baseWidth / 2, 102);
    const shiftX = padding - minX;
    const shiftY = padding - minY + headerHeight;
    ctx.save();
    ctx.translate(shiftX, shiftY);
    const nw = treeCanvas.layout.nodeWidth;
    const nh = treeCanvas.layout.nodeHeight;
    for (const link of layout.links) {
      const isChi1 = link.branch === "Chi 1";
      const isChi2 = link.branch === "Chi 2";
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = isChi1 ? "#2563eb" : isChi2 ? "#059669" : "#64748b";
      const pathData = treeCanvas.layout.generatePath(link);
      const s = pathData.startPoint;
      const e = pathData.endPoint;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      if (treeCanvas.layout.orientation === "VERTICAL") {
        const midY = (s.y + e.y) / 2;
        ctx.bezierCurveTo(s.x, midY, e.x, midY, e.x, e.y);
      } else {
        const midX = (s.x + e.x) / 2;
        ctx.bezierCurveTo(midX, s.y, midX, e.y, e.x, e.y);
      }
      ctx.stroke();
      ctx.fillStyle = isChi1 ? "#2563eb" : isChi2 ? "#059669" : "#475569";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
      ctx.arc(e.x, e.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const [id, pos] of layout.positions.entries()) {
      const m = pos.member;
      const isMale = m.gender === "Nam";
      const isDichTon = m.role === "\u0110\xEDch T\xF4n";
      const x = pos.x;
      const y = pos.y;
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      this.fillRoundRect(ctx, x + 2, y + 4, nw, nh, 12);
      ctx.fillStyle = "#ffffff";
      this.fillRoundRect(ctx, x, y, nw, nh, 12);
      ctx.lineWidth = isDichTon ? 3 : 1.5;
      ctx.strokeStyle = isDichTon ? "#f59e0b" : isMale ? "#2563eb" : "#e11d48";
      this.strokeRoundRect(ctx, x, y, nw, nh, 12);
      ctx.fillStyle = isMale ? "#dbeafe" : "#ffe4e6";
      this.fillRoundRect(ctx, x + 1, y + 1, nw - 2, 24, [11, 11, 0, 0]);
      ctx.textAlign = "left";
      ctx.fillStyle = isMale ? "#1e40af" : "#9f1239";
      ctx.font = 'bold 10px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(`\u0110\u1EDDi ${m.generation} \u2022 ${m.branch || "Ng\xE0nh II"}`, x + 8, y + 16);
      if (isDichTon) {
        ctx.textAlign = "right";
        ctx.fillStyle = "#d97706";
        ctx.font = 'bold 9px "Plus Jakarta Sans", sans-serif';
        ctx.fillText("\u{1F451} \u0110\xCDCH T\xD4N", x + nw - 8, y + 16);
      }
      const avX = x + 22;
      const avY = y + 54;
      ctx.fillStyle = isMale ? "#eff6ff" : "#fff1f2";
      ctx.beginPath();
      ctx.arc(avX, avY, 14, 0, Math.PI * 2);
      ctx.fill();
      drawAvatar(ctx, m.gender, avX, avY, 14);
      ctx.textAlign = "left";
      let textY = y + 44;
      if (m.christian_name) {
        ctx.fillStyle = "#d97706";
        ctx.font = 'bold 9.5px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(`[${m.christian_name}]`, x + 44, textY);
        textY += 15;
      }
      ctx.fillStyle = "#0f172a";
      ctx.font = 'bold 12.5px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(m.full_name, x + 44, textY);
      const dates = lifeDates(m);
      if (dates) {
        ctx.fillStyle = "#64748b";
        ctx.font = '9.5px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(dates, x + 44, textY + 14, nw - 52);
      }
      if (spouseCaption(m, treeCanvas.dataStore)) {
        ctx.fillStyle = "#f8fafc";
        this.fillRoundRect(ctx, x + 1, y + nh - 20, nw - 2, 19, [0, 0, 11, 11]);
        ctx.strokeStyle = "#f1f5f9";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 1, y + nh - 20);
        ctx.lineTo(x + nw - 1, y + nh - 20);
        ctx.stroke();
        ctx.fillStyle = "#64748b";
        ctx.font = '9.5px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(spouseCaption(m, treeCanvas.dataStore), x + 8, y + nh - 7);
      }
    }
    ctx.restore();
    return { canvas, width: canvas.width, height: canvas.height, scopeLabel };
  }
  // 2. Export to PNG File
  static exportPNG(treeCanvas, scope = "ALL", maxDepth = 0) {
    const rendered = this.renderToCanvas2D(treeCanvas, scope, 2, maxDepth);
    if (!rendered) return;
    rendered.canvas.toBlob((blob) => {
      if (blob) {
        const cleanScope = scope.replace(/[^a-zA-Z0-9]/g, "_");
        this.downloadBlob(blob, `Cay_Gia_Pha_${cleanScope}_${this.getTimestamp()}.png`);
      } else {
        alert("L\u1ED7i t\u1EA1o file \u1EA3nh PNG.");
      }
    }, "image/png");
  }
  // 3. Export to Standalone PDF Document (.pdf)
  static exportPDF(treeCanvas, scope = "ALL", paperSize = "AUTO", maxDepth = 0) {
    const rendered = this.renderToCanvas2D(treeCanvas, scope, 1.8, maxDepth);
    if (!rendered) return;
    const jpegDataUrl = rendered.canvas.toDataURL("image/jpeg", 0.92);
    const pdfBlob = this.createPdfBlobFromJpeg(jpegDataUrl, rendered.width, rendered.height, paperSize);
    const cleanScope = scope.replace(/[^a-zA-Z0-9]/g, "_");
    this.downloadBlob(pdfBlob, `Cay_Gia_Pha_${cleanScope}_${this.getTimestamp()}.pdf`);
  }
  // 4. Print Tree directly or Save as PDF via Browser Dialog
  static printTree(treeCanvas, scope = "ALL", maxDepth = 0) {
    const rendered = this.renderToCanvas2D(treeCanvas, scope, 1.5, maxDepth);
    if (!rendered) return;
    const imgDataUrl = rendered.canvas.toDataURL("image/png");
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Tr\xECnh duy\u1EC7t \u0111ang ch\u1EB7n c\u1EEDa s\u1ED5 pop-up. Vui l\xF2ng cho ph\xE9p m\u1EDF pop-up \u0111\u1EC3 in \u1EA5n.");
      return;
    }
    const title = `${treeCanvas.dataStore.lineageInfo.name} - ${rendered.scopeLabel}`;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          @page { size: landscape; margin: 10mm; }
          body { margin: 0; padding: 12px; text-align: center; font-family: sans-serif; background: #fff; }
          img { max-width: 100%; height: auto; display: block; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
          @media print {
            body { padding: 0; background: none; }
            img { box-shadow: none; max-width: 100%; page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <img src="${imgDataUrl}" />
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        <\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }
  // 5. Export to Vector SVG (.svg)
  static exportSVG(treeCanvas, scope = "ALL", maxDepth = 0) {
    const layout = this.getExportLayout(treeCanvas, scope, maxDepth);
    if (!layout || !layout.bounds || layout.positions.size === 0) {
      alert("Kh\xF4ng c\xF3 th\xE0nh vi\xEAn n\xE0o trong c\xE0nh nh\xE1nh \u0111\xE3 ch\u1ECDn \u0111\u1EC3 xu\u1EA5t SVG.");
      return;
    }
    const { minX, minY, width, height } = layout.bounds;
    const padding = 100;
    const headerHeight = 120;
    const svgWidth = Math.max(1200, width + padding * 2);
    const svgHeight = Math.max(800, height + padding * 2 + headerHeight);
    const shiftX = padding - minX;
    const shiftY = padding - minY + headerHeight;
    const lineageName = this.escapeXml(treeCanvas.dataStore.lineageInfo.name || "Gia Ph\u1EA3");
    const scopeLabel = this.escapeXml(this.getScopeTitle(treeCanvas.dataStore, scope));
    let svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <style>
    text { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .tree-link { fill: none; stroke: #64748b; stroke-width: 2.5px; stroke-linecap: round; stroke-linejoin: round; }
    .tree-link-chi-1 { stroke: #2563eb; }
    .tree-link-chi-2 { stroke: #059669; }
    .tree-port { fill: #475569; stroke: #ffffff; stroke-width: 1.5px; }
    .node-rect { rx: 12; ry: 12; fill: #ffffff; stroke: #cbd5e1; stroke-width: 1.5px; }
    .rect-male { stroke: #2563eb; stroke-width: 2px; }
    .rect-female { stroke: #e11d48; stroke-width: 2px; }
    .rect-dich-ton { stroke: #f59e0b; stroke-width: 3px; }
  </style>
  <rect width="100%" height="100%" fill="#f8fafc" />

  <g transform="translate(${svgWidth / 2}, 45)">
    <text font-size="28" font-weight="bold" fill="#0f172a" text-anchor="middle" font-family="Playfair Display, Georgia, serif">
      ${lineageName}
    </text>
    <text y="28" font-size="16" font-weight="bold" fill="#b45309" text-anchor="middle">
      \u2022 ${scopeLabel} \u2022
    </text>
    <text y="52" font-size="13" fill="#64748b" text-anchor="middle">
      S\u1ED1 l\u01B0\u1EE3ng: ${layout.positions.size} th\xE0nh vi\xEAn \u2022 B\u1EA3n v\u1EBD xu\u1EA5t ng\xE0y ${(/* @__PURE__ */ new Date()).toLocaleDateString("vi-VN")}
    </text>
  </g>

  <g transform="translate(${shiftX}, ${shiftY})">
`;
    for (const link of layout.links) {
      const pathData = treeCanvas.layout.generatePath(link);
      const pathStr = typeof pathData === "string" ? pathData : pathData.path;
      let branchClass = "tree-link";
      if (link.branch === "Chi 1") branchClass += " tree-link-chi-1";
      else if (link.branch === "Chi 2") branchClass += " tree-link-chi-2";
      svg += `    <path d="${pathStr}" class="${branchClass}" />
`;
      if (pathData.startPoint && pathData.endPoint) {
        svg += `    <circle cx="${pathData.startPoint.x}" cy="${pathData.startPoint.y}" r="3.5" class="tree-port" />
`;
        svg += `    <circle cx="${pathData.endPoint.x}" cy="${pathData.endPoint.y}" r="3.5" class="tree-port" />
`;
      }
    }
    const nw = treeCanvas.layout.nodeWidth;
    const nh = treeCanvas.layout.nodeHeight;
    for (const [id, pos] of layout.positions.entries()) {
      const m = pos.member;
      const isMale = m.gender === "Nam";
      const isDichTon = m.role === "\u0110\xEDch T\xF4n";
      let borderClass = isMale ? "rect-male" : "rect-female";
      if (isDichTon) borderClass = "rect-dich-ton";
      const nx = pos.x;
      const ny = pos.y;
      const headerFill = isMale ? "#dbeafe" : "#ffe4e6";
      const headerTextFill = isMale ? "#1e40af" : "#9f1239";
      svg += `
    <g transform="translate(${nx}, ${ny})">
      <rect width="${nw}" height="${nh}" class="node-rect ${borderClass}" filter="drop-shadow(0 4px 6px rgba(0,0,0,0.06))" />
      <rect width="${nw}" height="24" rx="12" ry="12" fill="${headerFill}" />
      <rect y="12" width="${nw}" height="12" fill="${headerFill}" />
      <text x="10" y="16" font-size="10" font-weight="bold" fill="${headerTextFill}">\u0110\u1EDDi ${m.generation} \u2022 ${this.escapeXml(m.branch || "Ng\xE0nh II")}</text>
      ${isDichTon ? `<text x="${nw - 10}" y="16" font-size="9" font-weight="bold" fill="#d97706" text-anchor="end">DICH TON</text>` : ""}
      
      ${avatarSVG(m.gender).replace("<svg ", '<svg x="10" y="33" width="28" height="28" ')}
      ${m.christian_name ? `<text x="44" y="42" font-size="9.5" font-weight="bold" fill="#d97706">[${this.escapeXml(m.christian_name)}]</text>` : ""}
      <text x="44" y="${m.christian_name ? 58 : 48}" font-size="12.5" font-weight="bold" fill="#0f172a">${this.escapeXml(m.full_name)}</text>
      <text x="44" y="${m.christian_name ? 74 : 64}" font-size="9.5" fill="#64748b">${this.escapeXml(lifeDates(m))}</text>
      ${spouseCaption(m, treeCanvas.dataStore) ? `<text x="10" y="${nh - 10}" font-size="9.5" fill="#78716c">${this.escapeXml(spouseCaption(m, treeCanvas.dataStore))}</text>` : ""}
    </g>
`;
    }
    svg += `  </g>
</svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const cleanScope = scope.replace(/[^a-zA-Z0-9]/g, "_");
    this.downloadBlob(blob, `Cay_Gia_Pha_${cleanScope}_${this.getTimestamp()}.svg`);
  }
  // 6. PDF 1.4 Binary Generator
  static createPdfBlobFromJpeg(jpegDataUrl, imgWidth, imgHeight, paperSize = "AUTO") {
    const base64 = jpegDataUrl.split(",")[1];
    const binaryStr = atob(base64);
    const jpegBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      jpegBytes[i] = binaryStr.charCodeAt(i);
    }
    const paperDims = {
      "A0": { w: 3370, h: 2384 },
      "A1": { w: 2384, h: 1684 },
      "A2": { w: 1684, h: 1191 },
      "A3": { w: 1191, h: 842 },
      "A4": { w: 842, h: 595 }
    };
    let widthPt, heightPt;
    if (paperSize && paperDims[paperSize]) {
      const dim = paperDims[paperSize];
      widthPt = Math.max(dim.w, dim.h);
      heightPt = Math.min(dim.w, dim.h);
    } else {
      const maxDimPt = 2200;
      if (imgWidth >= imgHeight) {
        widthPt = maxDimPt;
        heightPt = Math.round(imgHeight / imgWidth * maxDimPt);
      } else {
        heightPt = maxDimPt;
        widthPt = Math.round(imgWidth / imgHeight * maxDimPt);
      }
    }
    const scaleX = widthPt / imgWidth;
    const scaleY = heightPt / imgHeight;
    const fitScale = Math.min(scaleX, scaleY);
    const drawnW = Math.round(imgWidth * fitScale);
    const drawnH = Math.round(imgHeight * fitScale);
    const offsetX = Math.round((widthPt - drawnW) / 2);
    const offsetY = Math.round((heightPt - drawnH) / 2);
    const pdfParts = [];
    const offsets = [];
    const append = (strOrBytes) => {
      const bytes = typeof strOrBytes === "string" ? new TextEncoder().encode(strOrBytes) : strOrBytes;
      pdfParts.push(bytes);
    };
    const getPos = () => pdfParts.reduce((acc, p) => acc + p.length, 0);
    append("%PDF-1.4\n");
    offsets.push(getPos());
    append("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    offsets.push(getPos());
    append("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
    offsets.push(getPos());
    append(`3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>
endobj
`);
    offsets.push(getPos());
    append(`4 0 obj
<< /Type /XObject /Subtype /Image /Width ${imgWidth} /Height ${imgHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>
stream
`);
    append(jpegBytes);
    append("\nendstream\nendobj\n");
    offsets.push(getPos());
    const content = `q
${fitScale.toFixed(6)} 0 0 ${fitScale.toFixed(6)} ${offsetX} ${offsetY} cm
/Im1 Do
Q
`;
    append(`5 0 obj
<< /Length ${content.length} >>
stream
${content}endstream
endobj
`);
    const startXref = getPos();
    append("xref\n0 6\n0000000000 65535 f \n");
    for (const off of offsets) {
      append(String(off).padStart(10, "0") + " 00000 n \n");
    }
    append(`trailer
<< /Size 6 /Root 1 0 R >>
startxref
${startXref}
%%EOF
`);
    return new Blob(pdfParts, { type: "application/pdf" });
  }
  // ========== A4-Optimized Export Methods ==========
  // Draw A4 page header (shared by card and table templates)
  static drawA4Header(ctx, pageW, lineageName, scopeLabel, pageNum, totalPages) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#0f172a";
    ctx.font = 'bold 14px "Playfair Display", Georgia, serif';
    ctx.fillText(lineageName, pageW / 2, 22);
    ctx.fillStyle = "#b45309";
    ctx.font = 'bold 9px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`\u2022 ${scopeLabel} \u2022`, pageW / 2, 36);
    ctx.fillStyle = "#64748b";
    ctx.font = '7.5px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`Trang ${pageNum}/${totalPages} \u2022 ${(/* @__PURE__ */ new Date()).toLocaleDateString("vi-VN")}`, pageW / 2, 48);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(15, 54);
    ctx.lineTo(pageW - 15, 54);
    ctx.stroke();
  }
  // Render A4 page - Compact Card layout (landscape, auto-scaled for wide generations)
  static renderA4PageCard(treeCanvas, pageData, pageNum, totalPages, scope = "ALL") {
    const cfg = this.A4_CONFIG_CARD;
    const pageW = this.A4.landscape.w;
    const pageH = this.A4.landscape.h;
    const members = pageData.members;
    const links = pageData.links;
    if (members.length === 0) {
      const canvas2 = document.createElement("canvas");
      canvas2.width = Math.round(pageW * 2);
      canvas2.height = Math.round(pageH * 2);
      return { canvas: canvas2, width: canvas2.width, height: canvas2.height, scopeLabel: "" };
    }
    const genGroups = /* @__PURE__ */ new Map();
    for (const m of members) {
      const gen = m.member.generation;
      if (!genGroups.has(gen)) genGroups.set(gen, []);
      genGroups.get(gen).push(m);
    }
    const sortedGens = Array.from(genGroups.keys()).sort((a, b) => parseInt(a) - parseInt(b));
    const contentW = pageW - cfg.marginLeft - cfg.marginRight;
    let maxGenWidth = 0;
    for (const genMembers of genGroups.values()) {
      const totalW = genMembers.length * cfg.nodeWidth + (genMembers.length - 1) * cfg.siblingGap;
      if (totalW > maxGenWidth) maxGenWidth = totalW;
    }
    let scaleX = 1;
    if (maxGenWidth > contentW) {
      scaleX = contentW / maxGenWidth;
    }
    const naturalHeight = cfg.marginTop + (sortedGens.length - 1) * cfg.generationGap + cfg.nodeHeight + cfg.marginBottom;
    let scaleY = 1;
    if (naturalHeight > pageH) {
      scaleY = pageH / naturalHeight;
    }
    const fitScale = Math.min(scaleX, scaleY, 1);
    const canvas = document.createElement("canvas");
    const renderScale = 2;
    canvas.width = Math.round(pageW * renderScale);
    canvas.height = Math.round(pageH * renderScale);
    const ctx = canvas.getContext("2d");
    ctx.scale(renderScale, renderScale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageW, pageH);
    const lineageName = treeCanvas.dataStore.lineageInfo.name || "Gia Ph\u1EA3 D\xF2ng H\u1ECD";
    const scopeLabel = this.getScopeTitle(treeCanvas.dataStore, scope);
    this.drawA4Header(ctx, pageW, lineageName, scopeLabel, pageNum, totalPages);
    ctx.save();
    const translationX = cfg.marginLeft + contentW * (1 - fitScale) / 2;
    ctx.translate(translationX, cfg.marginTop);
    ctx.scale(fitScale, fitScale);
    const positions = /* @__PURE__ */ new Map();
    for (let gi = 0; gi < sortedGens.length; gi++) {
      const genMembers = genGroups.get(sortedGens[gi]);
      const totalW = genMembers.length * cfg.nodeWidth + (genMembers.length - 1) * cfg.siblingGap;
      const startX = (contentW - totalW) / 2;
      const y = gi * cfg.generationGap;
      for (let mi = 0; mi < genMembers.length; mi++) {
        const m = genMembers[mi];
        const x = startX + mi * (cfg.nodeWidth + cfg.siblingGap);
        positions.set(m.id, { x, y, member: m.member });
      }
    }
    for (const link of links) {
      const parentPos = positions.get(link.parent_id);
      const childPos = positions.get(link.child_id);
      if (!parentPos || !childPos) continue;
      const isChi1 = link.branch === "Chi 1";
      const isChi2 = link.branch === "Chi 2";
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = isChi1 ? "#3b82f6" : isChi2 ? "#10b981" : "#cbd5e1";
      const sx = parentPos.x + cfg.nodeWidth / 2;
      const sy = parentPos.y + cfg.nodeHeight;
      const ex = childPos.x + cfg.nodeWidth / 2;
      const ey = childPos.y;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      const midY = (sy + ey) / 2;
      ctx.bezierCurveTo(sx, midY, ex, midY, ex, ey);
      ctx.stroke();
    }
    for (const [id, pos] of positions.entries()) {
      const m = pos.member;
      const isMale = m.gender === "Nam";
      const isDichTon = m.role === "\u0110\xEDch T\xF4n";
      const x = pos.x;
      const y = pos.y;
      const nw = cfg.nodeWidth;
      const nh = cfg.nodeHeight;
      ctx.fillStyle = "#ffffff";
      this.fillRoundRect(ctx, x, y, nw, nh, 3);
      ctx.fillStyle = isMale ? "#3b82f6" : "#e11d48";
      ctx.fillRect(x, y, 3, nh);
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = isDichTon ? "#f59e0b" : "#e2e8f0";
      this.strokeRoundRect(ctx, x, y, nw, nh, 3);
      ctx.fillStyle = isMale ? "#dbeafe" : "#ffe4e6";
      ctx.fillRect(x + 4, y + 2, 18, 10);
      ctx.fillStyle = isMale ? "#1e40af" : "#9f1239";
      ctx.font = 'bold 6.5px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(`\u0110${m.generation}`, x + 13, y + 10);
      ctx.textAlign = "left";
      ctx.fillStyle = "#0f172a";
      ctx.font = 'bold 8px "Plus Jakarta Sans", sans-serif';
      const nameX = x + 26;
      ctx.fillText(m.full_name, nameX, y + 10);
      const dates = lifeDates(m);
      if (dates) {
        ctx.fillStyle = "#64748b";
        ctx.font = '6.5px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(dates, nameX, y + 19);
      }
      if (spouseCaption(m, treeCanvas.dataStore)) {
        ctx.fillStyle = "#94a3b8";
        ctx.font = '6px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(spouseCaption(m, treeCanvas.dataStore), nameX, y + nh - 3);
      }
      if (isDichTon) {
        ctx.fillStyle = "#fef3c7";
        ctx.fillRect(x + nw - 32, y + 2, 28, 10);
        ctx.fillStyle = "#d97706";
        ctx.font = 'bold 6px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = "center";
        ctx.fillText("\u0110T", x + nw - 18, y + 10);
      }
    }
    ctx.restore();
    if (fitScale < 1) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = '7px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = "right";
      ctx.fillText(`T\u1EF7 l\u1EC7: ${Math.round(fitScale * 100)}%`, pageW - 15, pageH - 10);
    }
    return { canvas, width: canvas.width, height: canvas.height, scopeLabel };
  }
  // Render A4 page - Table layout (maximum data density, no tree graphics) - Landscape
  static renderA4PageTable(treeCanvas, pageData, pageNum, totalPages, scope = "ALL") {
    const cfg = this.A4_CONFIG_TABLE;
    const pageW = this.A4.landscape.w;
    const pageH = this.A4.landscape.h;
    const canvas = document.createElement("canvas");
    const scale = 2;
    canvas.width = Math.round(pageW * scale);
    canvas.height = Math.round(pageH * scale);
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageW, pageH);
    const lineageName = treeCanvas.dataStore.lineageInfo.name || "Gia Ph\u1EA3 D\xF2ng H\u1ECD";
    const scopeLabel = this.getScopeTitle(treeCanvas.dataStore, scope);
    this.drawA4Header(ctx, pageW, lineageName, scopeLabel, pageNum, totalPages);
    const members = pageData;
    if (members.length === 0) return { canvas, width: canvas.width, height: canvas.height, scopeLabel };
    const colGen = 22;
    const colGender = 16;
    const colName = 150;
    const colDates = 100;
    const colSpouse = 120;
    const colBranch = 80;
    const colRole = 50;
    const colPadding = 5;
    const totalColW = colGen + colGender + colName + colDates + colSpouse + colBranch + colRole + colPadding * 8;
    const startX = cfg.marginLeft;
    let y = cfg.marginTop;
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(startX, y, totalColW, cfg.headerHeight);
    ctx.fillStyle = "#0f172a";
    ctx.font = `bold ${cfg.fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = "left";
    let cx = startX + colPadding;
    ctx.fillText("\u0110\u1EDDi", cx, y + cfg.headerHeight - 5);
    cx += colGen;
    ctx.fillText("G\u0110", cx, y + cfg.headerHeight - 5);
    cx += colGender;
    ctx.fillText("H\u1ECD v\xE0 T\xEAn", cx, y + cfg.headerHeight - 5);
    cx += colName;
    ctx.fillText("Sinh - M\u1EA5t", cx, y + cfg.headerHeight - 5);
    cx += colDates;
    ctx.fillText("V\u1EE3/Ch\u1ED3ng", cx, y + cfg.headerHeight - 5);
    cx += colSpouse;
    ctx.fillText("Chi", cx, y + cfg.headerHeight - 5);
    cx += colBranch;
    ctx.fillText("Vai tr\xF2", cx, y + cfg.headerHeight - 5);
    y += cfg.headerHeight;
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(startX + totalColW, y);
    ctx.stroke();
    y += 2;
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      const isMale = m.gender === "Nam";
      const isDichTon = m.role === "\u0110\xEDch T\xF4n";
      if (i % 2 === 0) {
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(startX, y, totalColW, cfg.rowHeight);
      }
      ctx.fillStyle = "#0f172a";
      ctx.font = `${cfg.fontSize}px "Plus Jakarta Sans", sans-serif`;
      ctx.textAlign = "left";
      cx = startX + colPadding;
      ctx.fillStyle = isMale ? "#1e40af" : "#9f1239";
      ctx.fillText(m.generation, cx, y + cfg.rowHeight - 4);
      cx += colGen;
      ctx.fillStyle = isMale ? "#3b82f6" : "#e11d48";
      ctx.fillText(isMale ? "N" : "N\u1EEF", cx, y + cfg.rowHeight - 4);
      cx += colGender;
      ctx.fillStyle = "#0f172a";
      ctx.font = `bold ${cfg.fontSize}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(m.full_name, cx, y + cfg.rowHeight - 4);
      ctx.font = `${cfg.fontSize}px "Plus Jakarta Sans", sans-serif`;
      cx += colName;
      ctx.fillStyle = "#64748b";
      const dates = lifeDates(m);
      ctx.fillText(dates, cx, y + cfg.rowHeight - 4);
      cx += colDates;
      ctx.fillStyle = "#64748b";
      ctx.fillText(spouseCaption(m, treeCanvas.dataStore), cx, y + cfg.rowHeight - 4);
      cx += colSpouse;
      ctx.fillStyle = "#475569";
      ctx.fillText(m.branch || "", cx, y + cfg.rowHeight - 4);
      cx += colBranch;
      if (isDichTon) {
        ctx.fillStyle = "#d97706";
        ctx.font = `bold ${cfg.fontSize}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillText("\u0110T", cx, y + cfg.rowHeight - 4);
        ctx.font = `${cfg.fontSize}px "Plus Jakarta Sans", sans-serif`;
      } else if (m.role) {
        ctx.fillStyle = "#475569";
        ctx.fillText(m.role, cx, y + cfg.rowHeight - 4);
      }
      y += cfg.rowHeight;
    }
    ctx.fillStyle = "#94a3b8";
    ctx.font = '6.5px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(`T\u1ED5ng: ${members.length} th\xE0nh vi\xEAn tr\xEAn trang n\xE0y`, pageW / 2, pageH - 12);
    return { canvas, width: canvas.width, height: canvas.height, scopeLabel };
  }
  // Export A4 PDF - with template selection (both use landscape)
  static exportA4PDF(treeCanvas, scope = "ALL", template = "card", maxDepth = 0) {
    const lineageName = treeCanvas.dataStore.lineageInfo.name || "Gia Ph\u1EA3";
    const scopeLabel = this.getScopeTitle(treeCanvas.dataStore, scope);
    let pages = [];
    let pageImages = [];
    if (template === "table") {
      pages = this.paginateForA4Table(treeCanvas.dataStore, scope, maxDepth);
      if (pages.length === 0) {
        alert("Kh\xF4ng c\xF3 d\u1EEF li\u1EC7u \u0111\u1EC3 xu\u1EA5t.");
        return;
      }
      for (let i = 0; i < pages.length; i++) {
        const rendered = this.renderA4PageTable(treeCanvas, pages[i], i + 1, pages.length, scope);
        if (rendered) {
          const jpegDataUrl = rendered.canvas.toDataURL("image/jpeg", 0.92);
          pageImages.push({ dataUrl: jpegDataUrl, width: rendered.width, height: rendered.height });
        }
      }
    } else {
      const layout = this.getA4VerticalLayout(treeCanvas, scope, maxDepth);
      if (!layout || !layout.bounds || layout.positions.size === 0) {
        alert("Kh\xF4ng c\xF3 th\xE0nh vi\xEAn n\xE0o trong c\xE0nh nh\xE1nh \u0111\xE3 ch\u1ECDn \u0111\u1EC3 xu\u1EA5t.");
        return;
      }
      pages = this.paginateForA4(layout);
      if (pages.length === 0) {
        alert("Kh\xF4ng c\xF3 d\u1EEF li\u1EC7u \u0111\u1EC3 xu\u1EA5t.");
        return;
      }
      for (let i = 0; i < pages.length; i++) {
        const rendered = this.renderA4PageCard(treeCanvas, pages[i], i + 1, pages.length, scope);
        if (rendered) {
          const jpegDataUrl = rendered.canvas.toDataURL("image/jpeg", 0.92);
          pageImages.push({ dataUrl: jpegDataUrl, width: rendered.width, height: rendered.height });
        }
      }
    }
    const pdfBlob = this.createMultiPagePdfBlob(pageImages, this.A4.landscape);
    const cleanScope = scope.replace(/[^a-zA-Z0-9]/g, "_");
    const templateLabel = template === "table" ? "Bang" : "Cay";
    this.downloadBlob(pdfBlob, `Cay_Gia_Pha_A4_${templateLabel}_${cleanScope}_${this.getTimestamp()}.pdf`);
  }
  // Print A4 - with template selection (both use landscape)
  static printA4(treeCanvas, scope = "ALL", template = "card", maxDepth = 0) {
    const lineageName = treeCanvas.dataStore.lineageInfo.name || "Gia Ph\u1EA3";
    const scopeLabel = this.getScopeTitle(treeCanvas.dataStore, scope);
    let pages = [];
    let pageImages = [];
    if (template === "table") {
      pages = this.paginateForA4Table(treeCanvas.dataStore, scope, maxDepth);
      if (pages.length === 0) {
        alert("Kh\xF4ng c\xF3 d\u1EEF li\u1EC7u \u0111\u1EC3 in.");
        return;
      }
      for (let i = 0; i < pages.length; i++) {
        const rendered = this.renderA4PageTable(treeCanvas, pages[i], i + 1, pages.length, scope);
        if (rendered) {
          const pngDataUrl = rendered.canvas.toDataURL("image/png");
          pageImages.push(pngDataUrl);
        }
      }
    } else {
      const layout = this.getA4VerticalLayout(treeCanvas, scope, maxDepth);
      if (!layout || !layout.bounds || layout.positions.size === 0) {
        alert("Kh\xF4ng c\xF3 th\xE0nh vi\xEAn n\xE0o trong c\xE0nh nh\xE1nh \u0111\xE3 ch\u1ECDn \u0111\u1EC3 in.");
        return;
      }
      pages = this.paginateForA4(layout);
      if (pages.length === 0) {
        alert("Kh\xF4ng c\xF3 d\u1EEF li\u1EC7u \u0111\u1EC3 in.");
        return;
      }
      for (let i = 0; i < pages.length; i++) {
        const rendered = this.renderA4PageCard(treeCanvas, pages[i], i + 1, pages.length, scope);
        if (rendered) {
          const pngDataUrl = rendered.canvas.toDataURL("image/png");
          pageImages.push(pngDataUrl);
        }
      }
    }
    const title = `${treeCanvas.dataStore.lineageInfo.name} - ${scopeLabel}`;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Tr\xECnh duy\u1EC7t \u0111ang ch\u1EB7n c\u1EEDa s\u1ED5 pop-up. Vui l\xF2ng cho ph\xE9p m\u1EDF pop-up \u0111\u1EC3 in \u1EA5n.");
      return;
    }
    let imagesHtml = "";
    for (let i = 0; i < pageImages.length; i++) {
      imagesHtml += `<div class="a4-page"><img src="${pageImages[i]}" alt="Trang ${i + 1}" /></div>
`;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          @page { size: A4 landscape; margin: 0; }
          body { margin: 0; padding: 0; text-align: center; font-family: sans-serif; background: #fff; }
          .a4-page {
            width: 297mm;
            height: 210mm;
            page-break-after: always;
            display: flex;
            justify-content: center;
            align-items: flex-start;
          }
          .a4-page:last-child { page-break-after: auto; }
          .a4-page img {
            width: 100%;
            height: 100%;
            object-fit: contain;
          }
          @media print {
            body { padding: 0; background: none; }
            .a4-page { page-break-after: always; }
            .a4-page:last-child { page-break-after: auto; }
          }
        </style>
      </head>
      <body>
        ${imagesHtml}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          };
        <\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }
  // Create multi-page PDF from JPEG images
  static createMultiPagePdfBlob(pageImages, pageSize) {
    const pdfParts = [];
    const offsets = [];
    const append = (strOrBytes) => {
      const bytes = typeof strOrBytes === "string" ? new TextEncoder().encode(strOrBytes) : strOrBytes;
      pdfParts.push(bytes);
    };
    const getPos = () => pdfParts.reduce((acc, p) => acc + p.length, 0);
    const imageObjs = [];
    for (let i = 0; i < pageImages.length; i++) {
      const base64 = pageImages[i].dataUrl.split(",")[1];
      const binaryStr = atob(base64);
      const jpegBytes = new Uint8Array(binaryStr.length);
      for (let j = 0; j < binaryStr.length; j++) {
        jpegBytes[j] = binaryStr.charCodeAt(j);
      }
      imageObjs.push({ bytes: jpegBytes, width: pageImages[i].width, height: pageImages[i].height });
    }
    append("%PDF-1.4\n");
    offsets.push(getPos());
    append(`1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
`);
    const pagesObjOffset = getPos();
    offsets.push(pagesObjOffset);
    append(`2 0 obj
<< /Type /Pages /Kids [] /Count 0 >>
endobj
`);
    offsets.push(getPos());
    const xObjectEntries = imageObjs.map((_, i) => `/Im${i} ${4 + i * 3} 0 R`).join(" ");
    append(`3 0 obj
<< /XObject << ${xObjectEntries} >> >>
endobj
`);
    const kidsRefs = [];
    for (let i = 0; i < imageObjs.length; i++) {
      kidsRefs.push(`${6 + i * 3} 0 R`);
    }
    const pagesContent = `2 0 obj
<< /Type /Pages /Kids [${kidsRefs.join(" ")}] /Count ${imageObjs.length} >>
endobj
`;
    for (let i = 0; i < imageObjs.length; i++) {
      const img = imageObjs[i];
      const imgObjNum = 4 + i * 3;
      const contentObjNum = 5 + i * 3;
      const pageObjNum = 6 + i * 3;
      offsets.push(getPos());
      append(`${imgObjNum} 0 obj
<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>
stream
`);
      append(img.bytes);
      append("\nendstream\nendobj\n");
      offsets.push(getPos());
      const scaleX = pageSize.w / img.width;
      const scaleY = pageSize.h / img.height;
      const fitScale = Math.min(scaleX, scaleY);
      const drawnW = img.width * fitScale;
      const drawnH = img.height * fitScale;
      const offsetX = (pageSize.w - drawnW) / 2;
      const offsetY = (pageSize.h - drawnH) / 2;
      const content = `q
${fitScale.toFixed(6)} 0 0 ${fitScale.toFixed(6)} ${offsetX.toFixed(2)} ${offsetY.toFixed(2)} cm
/Im${i} Do
Q
`;
      append(`${contentObjNum} 0 obj
<< /Length ${content.length} >>
stream
${content}endstream
endobj
`);
      offsets.push(getPos());
      append(`${pageObjNum} 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageSize.w} ${pageSize.h}] /Resources 3 0 R /Contents ${contentObjNum} 0 R >>
endobj
`);
    }
    const startXref = getPos();
    append(`xref
0 ${6 + imageObjs.length * 3}
0000000000 65535 f 
`);
    for (const off of offsets) {
      append(String(off).padStart(10, "0") + " 00000 n \n");
    }
    append(`trailer
<< /Size ${6 + imageObjs.length * 3} /Root 1 0 R >>
startxref
${startXref}
%%EOF
`);
    return new Blob(pdfParts, { type: "application/pdf" });
  }
  static fillRoundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, width, height, radius);
    } else {
      ctx.rect(x, y, width, height);
    }
    ctx.fill();
  }
  static strokeRoundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, width, height, radius);
    } else {
      ctx.rect(x, y, width, height);
    }
    ctx.stroke();
  }
  static escapeXml(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }
  static getTimestamp() {
    const now = /* @__PURE__ */ new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  }
  static downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2e3);
  }
};

// dist/js/config.js
var config = { "apiBaseUrl": "", "staticHosting": true, "supabase": { "url": "https://nwbozmxgdhouhzlpiskd.supabase.co", "publishableKey": "sb_publishable_LtgjoNbHFphuy3m3x_9pYA_BDXyDnj_" } };

// dist/js/api.js
function apiUrl(path) {
  return `${config.apiBaseUrl}${path}`;
}
function apiFetch(path, options) {
  return fetch(apiUrl(path), options);
}
function shareUrl(token) {
  const url = new URL("../index.html", import.meta.url);
  url.searchParams.set("share", token);
  return url.href;
}

// dist/js/services/auth.js
async function startGoogleOAuth(client, project, redirectTo, fetchImpl = fetch) {
  const response = await fetchImpl(`${project.url}/auth/v1/settings`, {
    headers: { apikey: project.publishableKey },
    signal: AbortSignal.timeout(1e4)
  });
  if (!response.ok) throw new Error("Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i d\u1ECBch v\u1EE5 \u0111\u0103ng nh\u1EADp. Vui l\xF2ng th\u1EED l\u1EA1i.");
  const settings = await response.json();
  if (settings.external?.google !== true) {
    throw new Error("\u0110\u0103ng nh\u1EADp Google ch\u01B0a s\u1EB5n s\xE0ng. Vui l\xF2ng d\xF9ng email v\xE0 m\u1EADt kh\u1EA9u ho\u1EB7c th\u1EED l\u1EA1i sau.");
  }
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, scopes: "openid email profile", queryParams: { prompt: "select_account" } }
  });
  if (error) throw error;
}
function oauthReturnMessage(href) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const code = hash.get("error_code") || hash.get("error") || url.searchParams.get("error_code") || url.searchParams.get("error");
  if (!code) return "";
  if (code === "access_denied") return "\u0110\u0103ng nh\u1EADp Google \u0111\xE3 b\u1ECB h\u1EE7y ho\u1EB7c ch\u01B0a \u0111\u01B0\u1EE3c cho ph\xE9p. B\u1EA1n c\xF3 th\u1EC3 th\u1EED l\u1EA1i.";
  return "Kh\xF4ng th\u1EC3 ho\xE0n t\u1EA5t \u0111\u0103ng nh\u1EADp Google. Vui l\xF2ng th\u1EED l\u1EA1i ho\u1EB7c d\xF9ng email v\xE0 m\u1EADt kh\u1EA9u.";
}

// dist/js/supabase-client.js
var clientPromise;
async function signInWithGoogle(redirectTo) {
  return startGoogleOAuth(await getSupabaseClient(), config.supabase, redirectTo);
}
function isSupabaseConfigured() {
  return Boolean(config.supabase?.url && config.supabase?.publishableKey);
}
async function getSupabaseClient() {
  if (!isSupabaseConfigured()) throw new Error("Ch\u01B0a c\u1EA5u h\xECnh k\u1EBFt n\u1ED1i Supabase.");
  if (!clientPromise) {
    clientPromise = import("./vendor/supabase.js").then(
      ({ createClient }) => createClient(config.supabase.url, config.supabase.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    ).catch((error) => {
      clientPromise = void 0;
      throw error;
    });
  }
  return clientPromise;
}

// dist/js/services/genealogy.js
function describeError(error) {
  if (["40001", "PT409"].includes(error?.code)) return "D\u1EEF li\u1EC7u tr\xEAn m\xE1y ch\u1EE7 \u0111\xE3 thay \u0111\u1ED5i. B\u1EA3n nh\xE1p v\u1EABn \u0111\u01B0\u1EE3c gi\u1EEF; h\xE3y xu\u1EA5t JSON \u0111\u1EC3 sao l\u01B0u r\u1ED3i t\u1EA3i l\u1EA1i v\xE0 \u0111\u1ED1i chi\u1EBFu tr\u01B0\u1EDBc khi l\u01B0u.";
  if (error?.code === "42501") return "B\u1EA1n ch\u01B0a \u0111\u0103ng nh\u1EADp ho\u1EB7c kh\xF4ng c\xF3 quy\u1EC1n th\u1EF1c hi\u1EC7n thao t\xE1c n\xE0y.";
  if (error?.code === "23503") return "C\xF3 quan h\u1EC7 cha/m\u1EB9 ho\u1EB7c ph\u1ED1i ng\u1EABu kh\xF4ng t\u1ED3n t\u1EA1i trong gia ph\u1EA3.";
  if (error?.code === "23505") return "M\xE3 th\xE0nh vi\xEAn \u0111\xE3 t\u1ED3n t\u1EA1i.";
  if (error?.message?.includes("Email not confirmed")) return "Vui l\xF2ng x\xE1c nh\u1EADn email tr\u01B0\u1EDBc khi \u0111\u0103ng nh\u1EADp.";
  if (error?.message?.includes("Invalid login credentials")) return "Email ho\u1EB7c m\u1EADt kh\u1EA9u kh\xF4ng \u0111\xFAng.";
  return error?.message || "Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i m\xE1y ch\u1EE7. B\u1EA3n nh\xE1p v\u1EABn \u0111\u01B0\u1EE3c gi\u1EEF.";
}
function snapshotChanges(before, after) {
  const original = new Map(before.members.map((m) => [m.id, m]));
  const current = new Map(after.members.map((m) => [m.id, m]));
  const changes = [];
  for (const [id, old] of original) {
    const member = current.get(id);
    if (!member) changes.push({ type: "delete_member", member_id: id });
    else {
      const fields = /* @__PURE__ */ Object.create(null);
      for (const key of /* @__PURE__ */ new Set([...Object.keys(old), ...Object.keys(member)])) {
        if (key !== "id" && JSON.stringify(old[key]) !== JSON.stringify(member[key])) fields[key] = member[key] ?? null;
      }
      if (Object.keys(fields).length) changes.push({ type: "update_member", member_id: id, new_value: fields });
    }
  }
  for (const [id, member] of current) if (!original.has(id)) changes.push({ type: "add_member", new_value: member });
  const info = (x) => Object.fromEntries(Object.entries(x).filter(([k]) => !["total_members", "generations"].includes(k)));
  if (JSON.stringify(info(before.lineageInfo)) !== JSON.stringify(info(after.lineageInfo))) {
    changes.push({ type: "update_info", new_value: after.lineageInfo });
  }
  return changes;
}
var GenealogyService = class {
  constructor(client) {
    this.client = client;
  }
  async rpc(name, args) {
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw error;
    return data;
  }
  list() {
    return this.rpc("list_my_lineages");
  }
  create(name) {
    return this.rpc("create_lineage", { p_info: { name, origin: "" } });
  }
  load(id) {
    return this.rpc("get_lineage_state", { p_lineage_id: id });
  }
  save(id, revision, snapshot) {
    return this.rpc("save_lineage_state", { p_lineage_id: id, p_base_revision: revision, p_info: snapshot.lineageInfo, p_members: snapshot.members });
  }
  submit(id, revision, changes, title) {
    return this.rpc("submit_changes", { p_lineage_id: id, p_base_revision: revision, p_changes: changes, p_title: title });
  }
  review(id, approve, reason = "") {
    return this.rpc("review_changes", { p_request_id: id, p_approve: approve, p_reason: reason });
  }
  link(id, kind, role, duration = "7days") {
    return this.rpc("create_access_link", { p_lineage_id: id, p_kind: kind, p_role: role, p_duration: duration });
  }
  redeem(token) {
    return this.rpc("redeem_invite", { p_token: token });
  }
  shared(token) {
    return this.rpc("read_shared_lineage", { p_token: token });
  }
  links(id) {
    return this.rpc("list_access_links", { p_lineage_id: id });
  }
  revoke(id) {
    return this.rpc("revoke_access_link", { p_link_id: id });
  }
  canRead(id, shareToken = null, publicSlug = null) {
    return this.rpc("can_read_lineage", { p_lineage_id: id, p_share_token: shareToken, p_public_slug: publicSlug });
  }
  publicLineages(search = "") {
    return this.rpc("list_public_lineages", { p_search: search });
  }
  openPage(slug) {
    return this.rpc("open_lineage_page", { p_slug: slug });
  }
  publish(id, fields) {
    return this.rpc("set_lineage_publication", { p_lineage_id: id, p_slug: fields.slug, p_intro: fields.intro, p_region: fields.region, p_is_public: fields.is_public });
  }
  saveProfile(profile) {
    return this.rpc("save_my_profile", { p_display_name: profile.display_name, p_phone: profile.phone, p_address: profile.address });
  }
  async profile(userId) {
    const { data, error } = await this.client.from("profiles").select("display_name,phone,address").eq("id", userId).maybeSingle();
    if (error) throw error;
    return data;
  }
  async publication(id) {
    const { data, error } = await this.client.from("lineage_publications").select("slug,title,intro,region,is_public").eq("lineage_id", id).maybeSingle();
    if (error) throw error;
    return data;
  }
  async requestPage(id, status, page = 0) {
    let query = this.client.from("change_requests").select("id,lineage_id,title,submitted_by,base_revision,changes,status,created_at,reviewed_at,rejection_reason", { count: "exact" }).eq("lineage_id", id);
    if (status !== "all") query = query.eq("status", status);
    const { data, count, error } = await query.order("created_at", { ascending: false }).range(page * 20, page * 20 + 19);
    if (error) throw error;
    return { rows: data, count };
  }
  access(id, userId, role) {
    return this.rpc("set_lineage_access", { p_lineage_id: id, p_user_id: userId, p_role: role });
  }
  async accessList(id) {
    const { data, error } = await this.client.from("lineage_access").select("user_id,role").eq("lineage_id", id);
    if (error) throw error;
    return data;
  }
  async requests(id) {
    const { data, error } = await this.client.from("change_requests").select("id,title,submitted_by,base_revision,changes,status,created_at,reviewed_at,rejection_reason").eq("lineage_id", id).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return data;
  }
};

// dist/js/portal.js
var $ = (id) => document.getElementById(id);
var roleNames = { admin: "Qu\u1EA3n tr\u1ECB", editor: "Ch\u1EC9nh s\u1EEDa", viewer: "Ch\u1EC9 xem" };
var slugify = (value) => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80).replace(/-$/, "");
function portalRoute(hash) {
  const raw = hash.replace(/^#/, "");
  for (const page of ["share", "invite"]) if (raw.startsWith(page + "=")) return { page, value: new URLSearchParams(raw).get(page) };
  if (raw.startsWith("family=")) return { page: "family", value: new URLSearchParams(raw).get("family") };
  if (raw.startsWith("publication=")) return { page: "publication", value: new URLSearchParams(raw).get("publication") };
  return { page: ["login", "mine", "account", "requests", "tree"].includes(raw) ? raw : "home" };
}
var FamilyPortal = class {
  constructor(controller) {
    this.c = controller;
    this.root = $("portal-root");
    this.sequence = 0;
    document.body.classList.add("portal-enabled");
    document.addEventListener("click", (event) => {
      const action = event.target.closest("[data-portal]");
      if (action) this.handle(action).catch((error) => this.error(error));
      else if (!event.target.closest(".portal-user")) this.closeMenus();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.closeMenus();
    });
    window.addEventListener("hashchange", () => this.route().catch((error) => this.error(error)));
    this.screen("home");
    if (portalRoute(location.hash).page === "home" && !/^#(share|invite)=/.test(location.hash)) this.home().catch((error) => this.error(error));
    else this.root.innerHTML = '<div class="portal-loading"><span class="portal-brand-mark">GP</span><p>\u0110ang m\u1EDF kh\xF4ng gian gia \u0111\xECnh\u2026</p></div>';
  }
  get service() {
    return this.c.service;
  }
  name() {
    return this.c.profile?.display_name || this.c.user?.user_metadata?.display_name || this.c.user?.user_metadata?.full_name || this.c.user?.email || "T\xE0i kho\u1EA3n";
  }
  closeMenus() {
    document.querySelectorAll(".portal-menu").forEach((el) => el.hidden = true);
    document.querySelectorAll('[data-portal="menu"]').forEach((el) => el.setAttribute("aria-expanded", "false"));
  }
  menu(workspace = false) {
    if (!this.c.user) return workspace ? '<button class="workspace-icon-button" data-portal="login" aria-label="\u0110\u0103ng nh\u1EADp" title="\u0110\u0103ng nh\u1EADp"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M15 3h5v18h-5M3 12h12m-4-4 4 4-4 4"/></svg></button>' : '<button class="portal-btn" data-portal="login">\u0110\u0103ng nh\u1EADp</button>';
    return `<div class="portal-user"><button type="button" class="portal-user-trigger" data-portal="menu" aria-expanded="false" aria-label="Th\xF4ng tin t\xE0i kho\u1EA3n"><span class="portal-avatar">${escapeHTML(this.name().charAt(0).toUpperCase())}</span><span class="portal-user-name">${escapeHTML(this.name())}${workspace ? `<small>${roleNames[this.c.app.userRole] || "Ch\u1EC9 xem"}</small>` : ""}</span><span aria-hidden="true">\u2304</span></button>
      <div class="portal-menu" hidden><span class="portal-menu-email">${escapeHTML(this.c.user.email)}</span><button data-portal="account">Th\xF4ng tin t\xE0i kho\u1EA3n</button><button data-portal="mine">Gia ph\u1EA3 c\u1EE7a t\xF4i</button><button data-portal="requests">Y\xEAu c\u1EA7u ph\xEA duy\u1EC7t</button><button data-portal="home">Trang ch\u1EE7</button><hr><button id="${workspace ? "btn-logout" : "portal-logout"}" data-portal="logout" class="portal-danger">\u0110\u0103ng xu\u1EA5t</button></div></div>`;
  }
  header() {
    return `<header class="portal-header"><a class="portal-brand" href="#home"><span class="portal-brand-mark">GP</span><span>Gia ph\u1EA3<small>D\xD2NG H\u1ECC TR\u1EA6N NG\u1ECCC</small></span></a><nav aria-label="\u0110i\u1EC1u h\u01B0\u1EDBng ch\xEDnh"><a href="#about" data-anchor="about">C\u1ED9i ngu\u1ED3n</a><a href="#directory" data-anchor="directory">Gia ph\u1EA3 c\xF4ng khai</a><a href="#memories" data-anchor="memories">K\xFD \u1EE9c gia \u0111\xECnh</a></nav><div class="portal-header-actions">${this.c.user ? `<button class="portal-btn portal-outline portal-hide-mobile" data-portal="mine">V\xE0o gia ph\u1EA3 <span>\u2197</span></button>` : ""}${this.menu()}</div></header>`;
  }
  footer() {
    return `<footer class="portal-footer"><a class="portal-brand" href="#home"><span class="portal-brand-mark">GP</span><span>Gia ph\u1EA3<small>G\xCCN GI\u1EEE C\u1ED8I NGU\u1ED2N \xB7 K\u1EBET N\u1ED0I TH\u1EBE H\u1EC6</small></span></a><p>M\u1ED7i ng\u01B0\u1EDDi m\u1ED9t c\xE2u chuy\u1EC7n. C\xF9ng nhau m\u1ED9t d\xF2ng h\u1ECD.</p><a href="#home">V\u1EC1 \u0111\u1EA7u trang \u2191</a></footer>`;
  }
  screen(name) {
    this.sequence++;
    document.body.dataset.screen = name;
    $("workspace-shell").hidden = name !== "workspace";
    this.root.hidden = name === "workspace";
    $("auth-overlay").style.display = "none";
    if (name !== "workspace") {
      this.c.stopPoll();
      ["share-panel-overlay", "edit-request-overlay", "notification-dropdown"].forEach((id) => $(id)?.classList.add("hidden"));
      document.querySelectorAll('[id^="modal-"]').forEach((el) => el.classList.add("hidden"));
      window.scrollTo(0, 0);
    }
  }
  render(content, name = "portal") {
    this.screen(name);
    this.root.innerHTML = this.header() + content + this.footer();
    return this.sequence;
  }
  error(error) {
    const message = describeError(error);
    const el = $("portal-message");
    if (el) el.textContent = message;
    this.c.app.showToast(message, "error");
  }
  unavailable(message) {
    this.render(`<main class="portal-dashboard"><h1>Kh\xF4ng th\u1EC3 m\u1EDF gia ph\u1EA3</h1><p class="portal-page-intro">${escapeHTML(message)}</p><a class="portal-btn" href="#home">V\u1EC1 trang ch\u1EE7</a></main>`);
  }
  async busy(button, fn) {
    button.disabled = true;
    try {
      await fn();
    } catch (error) {
      this.error(error);
    } finally {
      button.disabled = false;
    }
  }
  async go(page) {
    history.pushState(null, "", `${this.c.callbackUrl()}#${page}`);
    await this.route();
  }
  async handle(button) {
    const action = button.dataset.portal;
    if (action === "menu") {
      const menu = button.parentElement.querySelector(".portal-menu");
      const open = menu.hidden;
      this.closeMenus();
      menu.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
      return;
    }
    this.closeMenus();
    if (action === "logout") return this.c.logout();
    if (action === "family") return this.go("family=" + encodeURIComponent(button.dataset.slug));
    if (action === "open") {
      if (!this.c.canLeave()) return;
      return this.busy(button, async () => {
        this.c.publicSlug = null;
        this.c.shareToken = null;
        await this.c.open(button.dataset.id, button.dataset.role);
      });
    }
    if (action === "publication") return this.go("publication=" + button.dataset.id);
    if (action === "tree") return this.backToTree();
    if (["home", "mine", "login", "account", "requests"].includes(action)) return this.go(action);
  }
  async route() {
    const route = portalRoute(location.hash);
    if (route.page === "home") {
      sessionStorage.removeItem("giapha_return");
      return this.home();
    }
    if (route.page === "share") {
      if (!this.c.canLeave() || !this.service) return;
      await this.c.openShared(route.value);
      return;
    }
    if (route.page === "invite") {
      if (!this.c.canLeave() || !this.service) return;
      if (await this.c.openViewerInvite(route.value)) return;
      sessionStorage.setItem("giapha_invite", route.value);
      sessionStorage.setItem("giapha_return", "mine");
      if (!this.c.user) this.c.showLogin("\u0110\u0103ng nh\u1EADp \u0111\u1EC3 ch\u1EC9nh s\u1EEDa gia ph\u1EA3. M\u1ECDi thay \u0111\u1ED5i s\u1EBD g\u1EEDi qu\u1EA3n tr\u1ECB vi\xEAn ph\xEA duy\u1EC7t.");
      else await this.c.restore();
      return;
    }
    if (route.page === "login") {
      sessionStorage.setItem("giapha_return", "mine");
      this.c.showLogin();
      return;
    }
    if (route.page === "family") return this.openPublic(route.value);
    if (route.page === "tree") return this.backToTree();
    if (!this.c.user) {
      sessionStorage.setItem("giapha_return", location.hash.slice(1));
      this.c.showLogin("\u0110\u0103ng nh\u1EADp \u0111\u1EC3 ti\u1EBFp t\u1EE5c.");
      return;
    }
    if (route.page === "mine") return this.showMine();
    if (route.page === "account") return this.account();
    if (route.page === "requests") return this.requests();
    if (route.page === "publication") return this.publication(route.value);
  }
  async home() {
    const seq = this.render(`<main class="portal-home"><section class="portal-hero"><div class="portal-hero-copy"><p class="portal-eyebrow"><span></span> M\u1ED8T D\xD2NG H\u1ECC \xB7 NHI\u1EC0U TH\u1EBE H\u1EC6</p><h1>G\xECn gi\u1EEF c\u1ED9i ngu\u1ED3n.<br><em>K\u1EBFt n\u1ED1i mai sau.</em></h1><p class="portal-lead">M\u1ED9t n\u01A1i \u0111\u1EC3 nh\u1EEFng c\xE2u chuy\u1EC7n \u0111\u01B0\u1EE3c l\u01B0u gi\u1EEF,<br class="portal-hide-mobile"> nh\u1EEFng th\u1EBF h\u1EC7 \u0111\u01B0\u1EE3c n\u1ED1i li\u1EC1n, v\xE0 m\u1ED7i ng\u01B0\u1EDDi t\xECm th\u1EA5y n\u01A1i m\xECnh thu\u1ED9c v\u1EC1.</p><div class="portal-hero-actions"><button class="portal-btn" data-portal="mine">Kh\xE1m ph\xE1 gia ph\u1EA3 <span>\u2197</span></button><a href="#about" data-anchor="about" class="portal-text-link">C\xE2u chuy\u1EC7n d\xF2ng h\u1ECD \u2193</a></div><div class="portal-hero-note"><span class="portal-tree-icon">\u2667</span><p>T\u1EEB nh\u1EEFng nh\xE1nh nh\u1ECF,<br><strong>c\xF9ng vun m\u1ED9t g\u1ED1c b\u1EC1n l\xE2u.</strong></p></div></div><figure class="portal-hero-image"><img src="./images/heritage-courtyard.jpg" alt="S\xE2n nh\xE0 truy\u1EC1n th\u1ED1ng Vi\u1EC7t Nam trong n\u1EAFng s\u1EDBm, \u1EA3nh minh ho\u1EA1" fetchpriority="high"><figcaption>Kh\xF4ng gian c\u1ED9i ngu\u1ED3n \xB7 \u1EA2nh minh ho\u1EA1 AI</figcaption><div class="portal-image-label"><span>GIA \u0110\xCCNH L\xC0 \u0110I\u1EC2M KH\u1EDEI \u0110\u1EA6U</span><p>\u0110i xa \u0111\u1EC3 l\u1EDBn.<br>Tr\u1EDF v\u1EC1 \u0111\u1EC3 nh\u1EDB.</p></div></figure></section>
      <section class="portal-intro" id="about"><div><p class="portal-eyebrow">C\xC2U CHUY\u1EC6N C\u1EE6A CH\xDANG TA</p><h2>Bi\u1EBFt m\xECnh t\u1EEB \u0111\xE2u.<br>Hi\u1EC3u m\xECnh thu\u1ED9c v\u1EC1.</h2></div><div><p>Gia ph\u1EA3 d\xF2ng h\u1ECD Tr\u1EA7n Ng\u1ECDc l\xE0 kh\xF4ng gian c\xF9ng nhau g\xECn gi\u1EEF nh\u1EEFng m\u1ED1i n\u1ED1i gi\u1EEFa \xF4ng b\xE0, cha m\u1EB9, con ch\xE1u \u2014 \u0111\u1EC3 c\xE2u chuy\u1EC7n c\u1EE7a gia \u0111\xECnh \u0111\u01B0\u1EE3c ti\u1EBFp t\u1EE5c qua t\u1EEBng th\u1EBF h\u1EC7.</p><p>T\u1EEB vi\u1EC7c t\xECm m\u1ED9t nh\xE1nh h\u1ECD, ghi l\u1EA1i m\u1ED9t k\u1EF7 ni\u1EC7m \u0111\u1EBFn b\u1ED5 sung th\xF4ng tin c\xF2n thi\u1EBFu, m\u1ED7i \u0111\xF3ng g\xF3p \u0111\u1EC1u l\xE0m \u0111\u1EA7y th\xEAm k\xFD \u1EE9c chung.</p><a class="portal-text-link" href="#mine">G\xF3p th\xEAm m\u1ED9t m\u1EA3nh k\xFD \u1EE9c \u2197</a></div></section>
      <section class="portal-directory" id="directory"><div class="portal-section-heading"><div><p class="portal-eyebrow">NH\u1EEENG NH\xC1NH H\u1ECC K\u1EBET N\u1ED0I</p><h2>Kh\xE1m ph\xE1 gia ph\u1EA3</h2></div><p>Gh\xE9 th\u0103m nh\u1EEFng gia ph\u1EA3 \u0111\u01B0\u1EE3c qu\u1EA3n tr\u1ECB<br>ch\u1EE7 \u0111\u1ED9ng chia s\u1EBB v\u1EDBi m\u1ECDi ng\u01B0\u1EDDi.</p></div><form id="portal-search" class="portal-search"><span aria-hidden="true">\u2315</span><input id="portal-search-input" aria-label="T\xECm d\xF2ng h\u1ECD ho\u1EB7c qu\xEA qu\xE1n" placeholder="T\xECm theo t\xEAn d\xF2ng h\u1ECD ho\u1EB7c qu\xEA qu\xE1n\u2026"><button class="portal-btn" type="submit">T\xECm ki\u1EBFm</button></form><div id="portal-public-list" class="portal-family-grid" aria-live="polite"><p class="portal-empty">\u0110ang t\u1EA3i c\xE1c gia ph\u1EA3 c\xF4ng khai\u2026</p></div><p id="portal-message" class="portal-feedback" role="status"></p></section>
      <section class="portal-memories" id="memories"><figure><img src="./images/family-album.jpg" alt="Album gia \u0111\xECnh v\xE0 s\u1ED5 ghi ch\xE9p, \u1EA3nh minh ho\u1EA1" loading="lazy"><figcaption>Nh\u1EEFng trang k\xFD \u1EE9c \xB7 \u1EA2nh minh ho\u1EA1 AI</figcaption></figure><div><p class="portal-eyebrow">\u0110\u1EC2 K\xDD \u1EE8C KH\xD4NG PHAI</p><h2>C\xF3 nh\u1EEFng \u0111i\u1EC1u<br>ch\u1EC9 gia \u0111\xECnh m\u1EDBi k\u1EC3.</h2><p>M\u1ED9t m\xE1i nh\xE0 x\u01B0a. M\u1ED9t c\xE1i t\xEAn quen. M\u1ED9t c\xE2u chuy\u1EC7n \u0111\u01B0\u1EE3c k\u1EC3 l\u1EA1i trong nh\u1EEFng l\u1EA7n sum h\u1ECDp. Gi\u1EEF l\u1EA5y h\xF4m nay, \u0111\u1EC3 mai n\xE0y con ch\xE1u c\xF2n t\xECm th\u1EA5y.</p><div class="portal-memory-tags"><span>Ghi nh\u1EDB c\u1ED9i ngu\u1ED3n</span><span>G\u1EAFn k\u1EBFt th\u1EBF h\u1EC7</span><span>C\xF9ng nhau g\xECn gi\u1EEF</span></div><button class="portal-btn portal-outline" data-portal="mine">V\u1EC1 v\u1EDBi gia ph\u1EA3 c\u1EE7a b\u1EA1n \u2197</button></div></section><section class="portal-invite-banner"><span>TI\u1EBEP N\u1ED0I C\xC2U CHUY\u1EC6N GIA \u0110\xCCNH</span><h2>Gia ph\u1EA3 \u0111\u01B0\u1EE3c g\xECn gi\u1EEF<br>t\u1EEB nh\u1EEFng \u0111\xF3ng g\xF3p nh\u1ECF.</h2><button class="portal-btn portal-light" data-portal="mine">C\xF9ng nhau k\u1EBFt n\u1ED1i \u2197</button></section></main>`, "home");
    this.root.querySelectorAll("[data-anchor]").forEach((link) => link.onclick = (event) => {
      event.preventDefault();
      $(link.dataset.anchor)?.scrollIntoView({ behavior: "smooth" });
    });
    let searchVersion = 0;
    const load = async (search) => {
      if (!this.service) return;
      const version = ++searchVersion;
      try {
        const rows = await this.service.publicLineages(search);
        if (seq !== this.sequence || version !== searchVersion) return;
        this.publicCards(rows);
      } catch (error) {
        if (seq === this.sequence) {
          $("portal-public-list").textContent = "Ch\u01B0a th\u1EC3 t\u1EA3i danh s\xE1ch. B\u1EA1n v\u1EABn c\xF3 th\u1EC3 v\xE0o gia ph\u1EA3 b\u1EB1ng li\xEAn k\u1EBFt \u0111\u01B0\u1EE3c chia s\u1EBB.";
          this.error(error);
        }
      }
    };
    $("portal-search").onsubmit = (event) => {
      event.preventDefault();
      this.busy(event.submitter, () => load($("portal-search-input").value.trim()));
    };
    if (!this.service) return;
    await load("");
    if (seq === this.sequence && ["about", "directory", "memories"].includes(location.hash.slice(1))) $(location.hash.slice(1))?.scrollIntoView();
  }
  publicCards(rows) {
    $("portal-public-list").innerHTML = rows.length ? rows.map((row) => `<article class="portal-family-card"><div class="portal-family-cover"><span>GP</span><small>GIA PH\u1EA2 C\xD4NG KHAI</small></div><div class="portal-family-content"><p class="portal-eyebrow">${escapeHTML(row.region || "C\u1ED8I NGU\u1ED2N GIA \u0110\xCCNH")}</p><h3>${escapeHTML(row.title)}</h3><p>${escapeHTML(row.intro || "C\xF9ng t\xECm hi\u1EC3u nh\u1EEFng nh\xE1nh h\u1ECD v\xE0 c\xE2u chuy\u1EC7n \u0111\u01B0\u1EE3c n\u1ED1i ti\u1EBFp qua c\xE1c th\u1EBF h\u1EC7.")}</p><div><span>${Number(row.member_count)} th\xE0nh vi\xEAn</span><button data-portal="family" data-slug="${escapeHTML(row.slug)}" class="portal-text-link">Xem gia ph\u1EA3 \u2197</button></div></div></article>`).join("") : `<div class="portal-empty"><span>\u2667</span><h3>Nh\u1EEFng k\u1EBFt n\u1ED1i b\u1EAFt \u0111\u1EA7u t\u1EEB s\u1EF1 s\u1EBB chia.</h3><p>Ch\u01B0a c\xF3 gia ph\u1EA3 \u0111\u01B0\u1EE3c b\u1EADt c\xF4ng khai. N\u1EBFu b\u1EA1n \u0111\xE3 nh\u1EADn \u0111\u01B0\u1EE3c li\xEAn k\u1EBFt ri\xEAng, h\xE3y m\u1EDF li\xEAn k\u1EBFt \u0111\xF3 \u0111\u1EC3 truy c\u1EADp.</p><button class="portal-text-link" data-portal="mine">V\xE0o gia ph\u1EA3 c\u1EE7a t\xF4i \u2197</button></div>`;
  }
  presentAuth() {
    this.render(`<main class="portal-auth"><section class="portal-auth-story"><img src="./images/heritage-courtyard.jpg" alt="M\xE1i nh\xE0 truy\u1EC1n th\u1ED1ng, \u1EA3nh minh ho\u1EA1"><div><p class="portal-eyebrow">CH\xC0O M\u1EEANG B\u1EA0N TR\u1EDE V\u1EC0</p><h1>M\u1ED7i k\u1EBFt n\u1ED1i<br>l\xE0 m\u1ED9t l\u1EA7n<br><em>g\u1EA7n nhau h\u01A1n.</em></h1><p>C\xF9ng l\u01B0u gi\u1EEF c\xE2u chuy\u1EC7n d\xF2ng h\u1ECD,<br>cho h\xF4m nay v\xE0 nh\u1EEFng th\u1EBF h\u1EC7 mai sau.</p><small>\u1EA2nh minh ho\u1EA1 AI</small></div></section><section class="portal-auth-panel"><a href="#home" class="portal-text-link">\u2190 V\u1EC1 trang ch\u1EE7</a><div id="portal-auth-slot"></div><p class="portal-auth-footnote">Gia ph\u1EA3 ri\xEAng t\u01B0 ch\u1EC9 hi\u1EC3n th\u1ECB v\u1EDBi ng\u01B0\u1EDDi c\xF3 quy\u1EC1n truy c\u1EADp.</p></section></main>`, "auth");
    $("portal-auth-slot").appendChild(this.c.authBox);
  }
  async loadProfile() {
    if (!this.c.user) return;
    const saved = await this.service.profile(this.c.user.id);
    this.c.profile = { display_name: saved?.display_name || this.c.user.user_metadata?.display_name || this.c.user.user_metadata?.full_name || this.c.user.email.split("@")[0], phone: saved?.phone || "", address: saved?.address || "" };
  }
  workspaceUser() {
    const host = $("user-display");
    host.classList.remove("hidden");
    host.classList.add("flex");
    host.innerHTML = this.menu(true);
  }
  backToTree() {
    if (!this.c.base || !this.c.app.lineageId) return this.showMine();
    this.screen("workspace");
    history.replaceState(null, "", this.c.callbackUrl() + "#" + (this.c.shareToken ? "share=" + encodeURIComponent(this.c.shareToken) : this.c.publicSlug ? "family=" + encodeURIComponent(this.c.publicSlug) : "tree"));
    this.c.setupNotifications();
    setTimeout(() => this.c.app.canvas.zoomFit(), 50);
  }
  async showMine() {
    if (!this.c.user) {
      sessionStorage.setItem("giapha_return", "mine");
      return this.c.showLogin();
    }
    const seq = this.render(`<main class="portal-dashboard"><div class="portal-dashboard-heading"><div><p class="portal-eyebrow">KH\xD4NG GIAN GIA \u0110\xCCNH</p><h1>Gia ph\u1EA3 c\u1EE7a t\xF4i</h1><p>Nh\u1EEFng d\xF2ng h\u1ECD b\u1EA1n \u0111ang c\xF9ng g\xECn gi\u1EEF.</p></div>${this.c.base ? '<button class="portal-btn portal-outline" data-portal="tree">Tr\u1EDF l\u1EA1i c\xE2y \u0111ang m\u1EDF \u2197</button>' : ""}</div><p id="portal-message" class="portal-feedback" role="status"></p><div id="portal-my-list" class="portal-family-grid"><p>\u0110ang t\u1EA3i gia ph\u1EA3\u2026</p></div><section class="portal-create"><div><p class="portal-eyebrow">M\u1ED8T KH\u1EDEI \u0110\u1EA6U M\u1EDAI</p><h2>Th\xEAm m\u1ED9t nh\xE1nh k\u1EBFt n\u1ED1i.</h2><p>T\u1EA1o kh\xF4ng gian ri\xEAng cho gia \u0111\xECnh. Ch\u1EC9 ng\u01B0\u1EDDi \u0111\u01B0\u1EE3c c\u1EA5p quy\u1EC1n m\u1EDBi c\xF3 th\u1EC3 xem.</p></div><form id="portal-create-form"><label for="portal-family-name">T\xEAn d\xF2ng h\u1ECD / chi nh\xE1nh</label><input id="portal-family-name" required maxlength="200" placeholder="T\xEAn d\xF2ng h\u1ECD c\u1EE7a b\u1EA1n"><button class="portal-btn" type="submit">T\u1EA1o gia ph\u1EA3 ri\xEAng \u2197</button></form></section></main>`);
    const rows = await this.service.list(this.c.user.id);
    if (seq !== this.sequence) return;
    this.myRows = rows;
    $("portal-my-list").innerHTML = rows.length ? rows.map((row) => `<article class="portal-owned-card"><div class="portal-owned-symbol">\u2667</div><span class="portal-role">${roleNames[row.role]}</span><h2>${escapeHTML(row.lineages?.info?.name || "Gia ph\u1EA3")}</h2><p>${escapeHTML(row.lineages?.info?.origin || "Kh\xF4ng gian gia \u0111\xECnh")}</p><div class="portal-owned-actions"><button class="portal-btn" data-portal="open" data-id="${row.lineage_id}" data-role="${row.role}">M\u1EDF gia ph\u1EA3 \u2197</button>${row.role === "admin" ? `<button class="portal-text-link" data-portal="publication" data-id="${row.lineage_id}">Gi\u1EDBi thi\u1EC7u & c\xF4ng khai</button>` : ""}</div></article>`).join("") : '<div class="portal-empty"><h2>B\u1EA1n ch\u01B0a tham gia gia ph\u1EA3 n\xE0o.</h2><p>M\u1EDF l\u1EDDi m\u1EDDi c\u1EE7a gia \u0111\xECnh ho\u1EB7c t\u1EA1o m\u1ED9t gia ph\u1EA3 m\u1EDBi b\xEAn d\u01B0\u1EDBi.</p></div>';
    $("portal-create-form").onsubmit = (event) => {
      event.preventDefault();
      if (!this.c.canLeave()) return;
      this.busy(event.submitter, async () => {
        const id = await this.service.create($("portal-family-name").value.trim());
        this.c.publicSlug = null;
        this.c.shareToken = null;
        await this.c.open(id, "admin");
      });
    };
  }
  async account() {
    const version = this.sequence;
    await this.loadProfile();
    if (version !== this.sequence) return;
    const p = this.c.profile;
    this.render(`<main class="portal-dashboard portal-narrow"><p class="portal-eyebrow">T\xC0I KHO\u1EA2N C\u1EE6A B\u1EA0N</p><h1>Th\xF4ng tin c\xE1 nh\xE2n</h1><p class="portal-page-intro">Th\xF4ng tin li\xEAn h\u1EC7 ch\u1EC9 b\u1EA1n c\xF3 th\u1EC3 xem v\xE0 ch\u1EC9nh s\u1EEDa.</p><form id="portal-profile-form" class="portal-form-card"><div class="portal-profile-heading"><span class="portal-avatar portal-avatar-large">${escapeHTML(this.name().charAt(0))}</span><div><h2>${escapeHTML(this.name())}</h2><p>H\u1ED3 s\u01A1 th\xE0nh vi\xEAn</p></div></div><label for="profile-email">Email \u0111\u0103ng nh\u1EADp <small>\u0110\u01B0\u1EE3c qu\u1EA3n l\xFD b\u1EDFi t\xE0i kho\u1EA3n \u0111\u0103ng nh\u1EADp</small></label><input id="profile-email" type="email" value="${escapeHTML(this.c.user.email)}" readonly><label for="profile-name">T\xEAn hi\u1EC3n th\u1ECB</label><input id="profile-name" value="${escapeHTML(p.display_name)}" maxlength="200" required><div class="portal-form-grid"><div><label for="profile-phone">S\u1ED1 \u0111i\u1EC7n tho\u1EA1i</label><input id="profile-phone" type="tel" autocomplete="tel" maxlength="40" value="${escapeHTML(p.phone)}"></div><div><label for="profile-address">\u0110\u1ECBa ch\u1EC9</label><input id="profile-address" autocomplete="street-address" maxlength="1000" value="${escapeHTML(p.address)}"></div></div><p id="portal-message" class="portal-feedback" role="status"></p><div class="portal-form-actions"><button class="portal-btn" type="submit">L\u01B0u th\xF4ng tin</button><button class="portal-text-link" data-portal="mine" type="button">V\u1EC1 gia ph\u1EA3 c\u1EE7a t\xF4i</button></div></form></main>`);
    $("portal-profile-form").onsubmit = (event) => {
      event.preventDefault();
      this.busy(event.submitter, async () => {
        const profile = { display_name: $("profile-name").value.trim(), phone: $("profile-phone").value.trim(), address: $("profile-address").value.trim() };
        if (!profile.display_name) throw new Error("Vui l\xF2ng nh\u1EADp t\xEAn hi\u1EC3n th\u1ECB.");
        await this.service.saveProfile(profile);
        this.c.profile = profile;
        this.c.app.currentUser && (this.c.app.currentUser.username = this.name());
        const header = this.root.querySelector(".portal-header");
        if (header) header.outerHTML = this.header();
        const heading = this.root.querySelector(".portal-profile-heading h2");
        if (heading) heading.textContent = this.name();
        if (this.c.app.currentUser) this.workspaceUser();
        $("portal-message").textContent = "\u0110\xE3 l\u01B0u th\xF4ng tin t\xE0i kho\u1EA3n.";
        this.c.app.showToast("\u0110\xE3 c\u1EADp nh\u1EADt h\u1ED3 s\u01A1.", "success");
      });
    };
  }
  async publication(id) {
    const rows = await this.service.list(this.c.user.id);
    const own = rows.find((row) => row.lineage_id === id && row.role === "admin");
    if (!own) throw new Error("B\u1EA1n c\u1EA7n quy\u1EC1n qu\u1EA3n tr\u1ECB \u0111\u1EC3 thay \u0111\u1ED5i c\xF4ng khai gia ph\u1EA3.");
    const saved = await this.service.publication(id);
    const p = saved || { slug: slugify(own.lineages.info.name) + "-" + id.slice(0, 8), intro: "", region: own.lineages.info.origin || "", is_public: false };
    this.render(`<main class="portal-dashboard portal-narrow"><p class="portal-eyebrow">CHIA S\u1EBA V\u1EDAI C\u1ED8NG \u0110\u1ED2NG</p><h1>Gi\u1EDBi thi\u1EC7u & c\xF4ng khai</h1><p class="portal-page-intro">${escapeHTML(own.lineages.info.name)}</p><form id="portal-publication-form" class="portal-form-card"><label for="publication-slug">\u0110\u01B0\u1EDDng d\u1EABn gia ph\u1EA3</label><input id="publication-slug" value="${escapeHTML(p.slug)}" pattern="[a-z0-9]+(-[a-z0-9]+)*" minlength="3" maxlength="100" required><small>Ch\u1EEF th\u01B0\u1EDDng kh\xF4ng d\u1EA5u, s\u1ED1 v\xE0 d\u1EA5u g\u1EA1ch n\u1ED1i.</small><label for="publication-region">Qu\xEA qu\xE1n / khu v\u1EF1c</label><input id="publication-region" value="${escapeHTML(p.region)}" maxlength="200"><label for="publication-intro">Gi\u1EDBi thi\u1EC7u d\xF2ng h\u1ECD</label><textarea id="publication-intro" rows="5" maxlength="2000">${escapeHTML(p.intro)}</textarea><label class="portal-check"><input id="publication-public" type="checkbox" ${p.is_public ? "checked" : ""}><span><strong>C\xF4ng khai c\xE2y gia ph\u1EA3</strong><small>Hi\u1EC7n trong danh s\xE1ch c\xF4ng khai, m\u1ECDi ng\u01B0\u1EDDi c\xF3 th\u1EC3 xem t\xEAn, quan h\u1EC7 v\xE0 ng\xE0y sinh/m\u1EA5t. Ghi ch\xFA, s\u1ED1 \u0111i\u1EC7n tho\u1EA1i, email v\xE0 \u0111\u1ECBa ch\u1EC9 kh\xF4ng \u0111\u01B0\u1EE3c c\xF4ng khai.</small></span></label><p id="portal-message" class="portal-feedback" role="status"></p><div class="portal-form-actions"><button class="portal-btn">L\u01B0u thi\u1EBFt l\u1EADp</button><button type="button" class="portal-text-link" id="publication-copy" ${saved ? "" : "disabled"}>Sao ch\xE9p li\xEAn k\u1EBFt</button></div></form></main>`);
    $("publication-copy").onclick = () => this.busy($("publication-copy"), async () => {
      if ($("publication-slug").value !== p.slug) throw new Error("L\u01B0u thi\u1EBFt l\u1EADp tr\u01B0\u1EDBc khi sao ch\xE9p li\xEAn k\u1EBFt m\u1EDBi.");
      await navigator.clipboard.writeText(this.c.callbackUrl() + "#family=" + encodeURIComponent(p.slug));
      $("portal-message").textContent = p.is_public ? "\u0110\xE3 sao ch\xE9p li\xEAn k\u1EBFt c\xF4ng khai." : "\u0110\xE3 sao ch\xE9p. Gia ph\u1EA3 ri\xEAng t\u01B0 v\u1EABn y\xEAu c\u1EA7u quy\u1EC1n truy c\u1EADp.";
    });
    $("portal-publication-form").onsubmit = (event) => {
      event.preventDefault();
      this.busy(event.submitter, async () => {
        const fields = { slug: $("publication-slug").value.trim(), intro: $("publication-intro").value.trim(), region: $("publication-region").value.trim(), is_public: $("publication-public").checked };
        if (fields.is_public && !p.is_public && !confirm("B\u1EADt c\xF4ng khai \u0111\u1EC3 m\u1ECDi ng\u01B0\u1EDDi c\xF3 th\u1EC3 xem c\xE2y gia ph\u1EA3 v\xE0 ng\xE0y sinh/m\u1EA5t? Ch\u1EC9 b\u1EADt khi gia \u0111\xECnh \u0111\xE3 \u0111\u1ED3ng \xFD.")) return;
        try {
          await this.service.publish(id, fields);
        } catch (error) {
          if (error.code === "23505") throw new Error("\u0110\u01B0\u1EDDng d\u1EABn n\xE0y \u0111\xE3 \u0111\u01B0\u1EE3c s\u1EED d\u1EE5ng. Vui l\xF2ng ch\u1ECDn \u0111\u01B0\u1EDDng d\u1EABn kh\xE1c.");
          throw error;
        }
        Object.assign(p, fields);
        if ($("publication-copy")) $("publication-copy").disabled = false;
        $("portal-message").textContent = fields.is_public ? "\u0110\xE3 c\xF4ng khai gia ph\u1EA3. B\u1EA1n c\xF3 th\u1EC3 sao ch\xE9p li\xEAn k\u1EBFt \u0111\u1EC3 chia s\u1EBB." : "\u0110\xE3 l\u01B0u. Gia ph\u1EA3 \u0111\u01B0\u1EE3c gi\u1EEF ri\xEAng t\u01B0.";
      });
    };
  }
  async openPublic(slug) {
    if (!this.c.canLeave()) return;
    try {
      const state = await this.service.openPage(slug);
      this.c.publicSlug = state.public_read ? slug : null;
      this.c.shareToken = null;
      await this.c.open(state.lineage_id, state.access_role, state);
    } catch (error) {
      this.c.showLogin("Gia ph\u1EA3 \u0111ang ri\xEAng t\u01B0 ho\u1EB7c kh\xF4ng c\xF2n \u0111\u01B0\u1EE3c chia s\u1EBB. \u0110\u0103ng nh\u1EADp t\xE0i kho\u1EA3n c\xF3 quy\u1EC1n r\u1ED3i m\u1EDF l\u1EA1i li\xEAn k\u1EBFt.");
      sessionStorage.setItem("giapha_return", "family=" + encodeURIComponent(slug));
    }
  }
  async requests() {
    const rows = await this.service.list(this.c.user.id);
    const selected = rows.find((row) => row.lineage_id === this.c.app.lineageId) || rows[0];
    this.render(`<main class="portal-dashboard"><p class="portal-eyebrow">C\xD9NG G\xCCN GI\u1EEE TH\xD4NG TIN CH\xCDNH X\xC1C</p><h1>Y\xEAu c\u1EA7u ph\xEA duy\u1EC7t</h1><p class="portal-page-intro">Qu\u1EA3n tr\u1ECB xem x\xE9t c\xE1c \u0111\xF3ng g\xF3p. Th\xE0nh vi\xEAn theo d\xF5i y\xEAu c\u1EA7u c\u1EE7a m\xECnh.</p><div class="portal-request-toolbar"><label>Gia ph\u1EA3<select id="requests-lineage">${rows.map((row) => `<option value="${row.lineage_id}" ${selected?.lineage_id === row.lineage_id ? "selected" : ""}>${escapeHTML(row.lineages?.info?.name || "Gia ph\u1EA3")}</option>`).join("")}</select></label><label>Tr\u1EA1ng th\xE1i<select id="requests-status"><option value="pending">Ch\u1EDD duy\u1EC7t</option><option value="approved">\u0110\xE3 duy\u1EC7t</option><option value="rejected">\u0110\xE3 t\u1EEB ch\u1ED1i</option><option value="all">T\u1EA5t c\u1EA3</option></select></label></div><p id="portal-message" class="portal-feedback" role="status"></p><div id="portal-requests-list" class="portal-request-list"></div><div class="portal-pagination"><button id="requests-prev">\u2190 Tr\u01B0\u1EDBc</button><span id="requests-count"></span><button id="requests-next">Sau \u2192</button></div></main>`);
    const screenVersion = this.sequence;
    let page = 0;
    let requestVersion = 0;
    const refresh = async () => {
      if (screenVersion !== this.sequence || !$("requests-lineage")) return;
      const version = ++requestVersion;
      const id = $("requests-lineage").value;
      const status = $("requests-status").value;
      if (!id) {
        $("portal-requests-list").innerHTML = '<div class="portal-empty">B\u1EA1n ch\u01B0a tham gia gia ph\u1EA3 n\xE0o.</div>';
        $("requests-prev").disabled = true;
        $("requests-next").disabled = true;
        return;
      }
      const result = await this.service.requestPage(id, status, page);
      if (version !== requestVersion || screenVersion !== this.sequence || !$("portal-requests-list")) return;
      const list = $("portal-requests-list");
      list.replaceChildren();
      const isAdmin = rows.find((row) => row.lineage_id === id)?.role === "admin";
      for (const request of result.rows) this.c.renderRequest(list, request, isAdmin, async () => {
        if (this.c.app.lineageId === id && this.c.base && !this.c.hasDraft()) await this.c.load();
        await refresh();
      });
      if (!result.rows.length) list.innerHTML = '<div class="portal-empty"><span>\u2713</span><h3>Kh\xF4ng c\xF3 y\xEAu c\u1EA7u trong m\u1EE5c n\xE0y.</h3><p>C\xE1c \u0111\xF3ng g\xF3p m\u1EDBi s\u1EBD xu\u1EA5t hi\u1EC7n t\u1EA1i \u0111\xE2y.</p></div>';
      $("requests-count").textContent = `${result.count} y\xEAu c\u1EA7u \xB7 Trang ${page + 1}`;
      $("requests-prev").disabled = page === 0;
      $("requests-next").disabled = (page + 1) * 20 >= result.count;
    };
    $("requests-lineage").onchange = $("requests-status").onchange = () => {
      page = 0;
      refresh().catch((error) => this.error(error));
    };
    $("requests-prev").onclick = () => {
      page--;
      refresh().catch((error) => this.error(error));
    };
    $("requests-next").onclick = () => {
      page++;
      refresh().catch((error) => this.error(error));
    };
    await refresh();
  }
};

// dist/js/supabase-controller.js
var $2 = (id) => document.getElementById(id);
var copy = (value) => JSON.parse(JSON.stringify(value));
var roles = { admin: "Qu\u1EA3n tr\u1ECB", editor: "Ch\u1EC9nh s\u1EEDa", viewer: "Ch\u1EC9 xem" };
var fieldNames = { full_name: "H\u1ECD t\xEAn", christian_name: "T\xEAn th\xE1nh", birth_date: "Ng\xE0y sinh", death_date: "Ng\xE0y m\u1EA5t", notes: "Ghi ch\xFA", parent_id: "Cha/m\u1EB9", spouse_id: "Ph\u1ED1i ng\u1EABu", generation: "Th\u1EBF h\u1EC7", sibling_order: "Th\u1EE9 t\u1EF1 anh/ch\u1ECB/em" };
var SupabaseController = class {
  constructor(app) {
    this.app = app;
    this.user = null;
    this.base = null;
  }
  async init() {
    this.initializing = true;
    this.authBox = document.createElement("div");
    this.authBox.id = "sb-auth";
    this.authBox.className = "sb-card";
    $2("auth-overlay").firstElementChild.appendChild(this.authBox);
    this.portal = new FamilyPortal(this);
    this.app.updateUserDisplay = () => this.portal.workspaceUser();
    ["auth-login-form", "auth-create-form", "auth-code-form", "backend-unavailable"].forEach((id) => $2(id).style.display = "none");
    this.app.loadInitialData = () => this.load();
    this.app.setupLogout = () => this.setupLogout();
    this.app.setupNotificationBell = () => this.setupNotifications();
    this.app.setupSharePanel = () => this.setupSharing();
    this.app.setupEditRequestModal = () => this.setupProposal();
    this.app.setupAuthUI = () => this.showLogin();
    this.app.dataStore.subscribe(() => this.app.updateStatsDisplay());
    $2("lineage-religion").style.display = "none";
    $2("lineage-origin").textContent = "";
    $2("lineage-title").textContent = "C\xE2y gia ph\u1EA3";
    $2("stats-summary").textContent = "";
    $2("outline-count-badge").textContent = "0";
    window.addEventListener("beforeunload", (event) => {
      if (this.hasDraft()) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && this.poll) this.checkAccess();
    });
    const oauthMessage = oauthReturnMessage(location.href);
    try {
      this.client = await getSupabaseClient();
      this.service = new GenealogyService(this.client);
      this.client.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          this.recovery = true;
          queueMicrotask(() => this.showRecovery());
        }
        if (event === "SIGNED_OUT" && !this.signingOut) {
          this.user = null;
          this.app.dataStore.readOnly = true;
          this.stopPoll();
          this.showLogin("Phi\xEAn \u0111\u0103ng nh\u1EADp \u0111\xE3 k\u1EBFt th\xFAc. Vui l\xF2ng \u0111\u0103ng nh\u1EADp l\u1EA1i.");
        }
        if (event === "SIGNED_IN" && !this.initializing && !this.user && !this.authenticating && session) {
          queueMicrotask(() => this.restore().catch((error) => this.showLogin(describeError(error))));
        }
      });
      if (oauthMessage) {
        history.replaceState(null, "", this.callbackUrl());
        this.showLogin(oauthMessage);
        return;
      }
      const params = new URLSearchParams(location.hash.slice(1));
      const query = new URLSearchParams(location.search);
      const invite = params.get("invite") || query.get("invite");
      if (invite) {
        if (await this.openViewerInvite(invite)) return;
        sessionStorage.setItem("giapha_invite", invite);
        history.replaceState(null, "", this.callbackUrl() + "#mine");
      }
      this.shareToken = params.get("share") || query.get("share");
      if (this.shareToken) {
        const { data } = await this.client.auth.getUser();
        this.user = data.user;
        await this.openShared(this.shareToken);
      } else await this.restore();
    } catch (error) {
      this.showLogin(describeError(error));
    } finally {
      this.initializing = false;
    }
  }
  async restore() {
    const { data, error } = await this.client.auth.getUser();
    if (!data.user) {
      this.user = null;
      await this.portal.route();
      return;
    }
    if (error) throw error;
    this.user = data.user;
    try {
      await this.portal.loadProfile();
    } catch {
      this.profile = null;
    }
    if (this.recovery) {
      this.showRecovery();
      return;
    }
    const invite = sessionStorage.getItem("giapha_invite");
    if (invite) {
      try {
        const id = await this.service.redeem(invite);
        sessionStorage.removeItem("giapha_invite");
        sessionStorage.removeItem("giapha_return");
        this.shareToken = null;
        this.publicSlug = null;
        const rows = await this.service.list();
        const row = rows.find((row2) => row2.lineage_id === id);
        if (!row) throw new Error("Li\xEAn k\u1EBFt \u0111\xE3 h\u1EBFt h\u1EA1n ho\u1EB7c \u0111\u01B0\u1EE3c thu h\u1ED3i.");
        await this.open(id, row.role);
        return;
      } catch (error2) {
        sessionStorage.removeItem("giapha_invite");
        this.app.showToast(describeError(error2), "error");
      }
    }
    const destination = sessionStorage.getItem("giapha_return");
    if (destination) {
      sessionStorage.removeItem("giapha_return");
      history.replaceState(null, "", this.callbackUrl() + "#" + destination);
    }
    await this.portal.route();
  }
  overlay() {
    if (this.portal) this.portal.presentAuth();
    else $2("auth-overlay").style.display = "flex";
  }
  message(text) {
    const el = $2("sb-message");
    if (el) el.textContent = text;
  }
  async action(button, fn) {
    button.disabled = true;
    try {
      await fn();
    } catch (error) {
      this.message(describeError(error));
      this.app.showToast(describeError(error), "error");
    } finally {
      button.disabled = false;
    }
  }
  callbackUrl() {
    return new URL("index.html", location.href).href.split(/[?#]/)[0];
  }
  showLogin(message = "") {
    this.overlay();
    this.emailMode = "login";
    this.authBox.innerHTML = `<p class="portal-eyebrow">K\u1EBET N\u1ED0I V\u1EDAI GIA \u0110\xCCNH</p><h2>Ch\xE0o m\u1EEBng b\u1EA1n tr\u1EDF v\u1EC1.</h2><p class="portal-auth-description">\u0110\u0103ng nh\u1EADp \u0111\u1EC3 c\xF9ng l\u01B0u gi\u1EEF c\xE2u chuy\u1EC7n d\xF2ng h\u1ECD.</p>
      <button id="sb-google" class="sb-google" type="button">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48"><path fill="#4285F4" d="M43.61 24.46c0-1.36-.12-2.66-.35-3.92H24v7.42h11a9.4 9.4 0 0 1-4.08 6.18v5.14h6.61c3.87-3.56 6.08-8.81 6.08-14.82Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.82 13.53-4.95l-6.61-5.14c-1.83 1.23-4.17 1.96-6.92 1.96-5.32 0-9.83-3.59-11.44-8.42H5.73v5.3A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.56 27.45a12 12 0 0 1 0-6.9v-5.3H5.73a20 20 0 0 0 0 17.5l6.83-5.3Z"/><path fill="#EA4335" d="M24 12.13c3 0 5.69 1.03 7.8 3.05l5.86-5.86A19.6 19.6 0 0 0 24 4 20 20 0 0 0 5.73 15.25l6.83 5.3C14.17 15.72 18.68 12.13 24 12.13Z"/></svg>
        <span>Ti\u1EBFp t\u1EE5c v\u1EDBi Google</span>
      </button>
      <p class="sb-auth-hint">D\xF9ng t\xE0i kho\u1EA3n Google \u0111\u1EC3 \u0111\u0103ng nh\u1EADp ho\u1EB7c \u0111\u0103ng k\xFD nhanh.</p>
      <p id="sb-message" role="status" class="sb-message"></p>
      <div id="sb-email-auth" hidden>
      <div class="sb-auth-divider"><span>ho\u1EB7c d\xF9ng email v\xE0 m\u1EADt kh\u1EA9u</span></div>
      <p class="portal-auth-section">2. S\u1EED d\u1EE5ng email v\xE0 m\u1EADt kh\u1EA9u</p>
      <div class="portal-auth-tabs"><button type="button" id="sb-mode-login" aria-pressed="true">\u0110\u0103ng nh\u1EADp</button><button type="button" id="sb-mode-signup" aria-pressed="false">T\u1EA1o t\xE0i kho\u1EA3n</button></div>
      <form id="sb-login">
      <label for="sb-email">Email</label><input id="sb-email" type="email" autocomplete="username" required>
      <label for="sb-password">M\u1EADt kh\u1EA9u</label><input id="sb-password" type="password" autocomplete="current-password" minlength="8" required>
      <div id="sb-name-wrapper" hidden><label for="sb-name">T\xEAn hi\u1EC3n th\u1ECB</label><input id="sb-name" autocomplete="nickname" maxlength="200"></div>
      <div class="sb-actions"><button id="sb-signin" class="sb-primary" type="submit">\u0110\u0103ng nh\u1EADp</button>
      <button id="sb-signup" class="sb-primary" type="button" hidden>T\u1EA1o t\xE0i kho\u1EA3n</button><button id="sb-forgot" type="button">Qu\xEAn m\u1EADt kh\u1EA9u</button></div></form></div>`;
    this.message(message);
    if (!sessionStorage.getItem("giapha_return")) sessionStorage.setItem("giapha_return", "mine");
    const mode = (value) => {
      this.emailMode = value;
      $2("sb-name-wrapper").hidden = value !== "signup";
      $2("sb-name").required = value === "signup";
      $2("sb-signin").hidden = value === "signup";
      $2("sb-signup").hidden = value !== "signup";
      $2("sb-forgot").hidden = value === "signup";
      $2("sb-password").autocomplete = value === "signup" ? "new-password" : "current-password";
      $2("sb-mode-login").setAttribute("aria-pressed", String(value === "login"));
      $2("sb-mode-signup").setAttribute("aria-pressed", String(value === "signup"));
      this.message("");
    };
    $2("sb-mode-login").onclick = () => mode("login");
    $2("sb-mode-signup").onclick = () => mode("signup");
    $2("sb-google").onclick = () => this.action($2("sb-google"), () => signInWithGoogle(this.callbackUrl()));
    $2("sb-login").onsubmit = (event) => {
      event.preventDefault();
      if (this.emailMode === "signup") {
        $2("sb-signup").click();
        return;
      }
      this.action($2("sb-signin"), async () => {
        this.authenticating = true;
        try {
          const client = this.client || await getSupabaseClient();
          const { error } = await client.auth.signInWithPassword({ email: $2("sb-email").value.trim(), password: $2("sb-password").value });
          if (error) throw error;
          await this.restore();
        } finally {
          this.authenticating = false;
        }
      });
    };
    $2("sb-signup").onclick = () => this.action($2("sb-signup"), async () => {
      if (!$2("sb-login").reportValidity()) return;
      const email = $2("sb-email").value.trim();
      const name = $2("sb-name").value.trim() || email.split("@")[0];
      this.authenticating = true;
      try {
        const client = this.client || await getSupabaseClient();
        const { data, error } = await client.auth.signUp({
          email,
          password: $2("sb-password").value,
          options: { emailRedirectTo: this.callbackUrl(), data: { display_name: name } }
        });
        if (error) throw error;
        if (data.session) await this.restore();
        else this.message("Ki\u1EC3m tra h\u1ED9p th\u01B0 v\xE0 x\xE1c nh\u1EADn email, sau \u0111\xF3 quay l\u1EA1i \u0111\u0103ng nh\u1EADp. N\u1EBFu kh\xF4ng nh\u1EADn \u0111\u01B0\u1EE3c th\u01B0, h\xE3y li\xEAn h\u1EC7 qu\u1EA3n tr\u1ECB \u0111\u1EC3 ki\u1EC3m tra c\u1EA5u h\xECnh g\u1EEDi email.");
      } finally {
        this.authenticating = false;
      }
    });
    $2("sb-forgot").onclick = () => this.action($2("sb-forgot"), async () => {
      const email = $2("sb-email");
      if (!email.reportValidity() || !email.value) {
        email.focus();
        return;
      }
      const client = this.client || await getSupabaseClient();
      const { error } = await client.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: this.callbackUrl() });
      if (error) throw error;
      this.message("N\u1EBFu email c\xF3 t\xE0i kho\u1EA3n, h\u01B0\u1EDBng d\u1EABn \u0111\u1EB7t l\u1EA1i m\u1EADt kh\u1EA9u s\u1EBD \u0111\u01B0\u1EE3c g\u1EEDi \u0111\u1EBFn h\u1ED9p th\u01B0.");
    });
  }
  showRecovery() {
    this.overlay();
    this.authBox.innerHTML = `<h2>\u0110\u1EB7t m\u1EADt kh\u1EA9u m\u1EDBi</h2><form id="sb-recovery"><label for="sb-new-password">M\u1EADt kh\u1EA9u m\u1EDBi</label>
      <input id="sb-new-password" type="password" minlength="8" required autocomplete="new-password"><p id="sb-message" class="sb-message" role="status"></p>
      <div class="sb-actions"><button id="sb-update-password" class="sb-primary">L\u01B0u m\u1EADt kh\u1EA9u</button></div></form>`;
    $2("sb-recovery").onsubmit = (event) => {
      event.preventDefault();
      this.action($2("sb-update-password"), async () => {
        const { error } = await this.client.auth.updateUser({ password: $2("sb-new-password").value });
        if (error) throw error;
        this.recovery = false;
        history.replaceState(null, "", this.callbackUrl());
        await this.restore();
      });
    };
  }
  capture() {
    return copy({ lineageInfo: this.app.dataStore.lineageInfo, members: this.app.dataStore.getAllMembers() });
  }
  hasDraft() {
    return Boolean(this.base && !this.guest && snapshotChanges(this.base, this.capture()).length);
  }
  canLeave() {
    return !this.saving && (!this.hasDraft() || confirm("C\xF3 b\u1EA3n nh\xE1p ch\u01B0a l\u01B0u. B\u1EA1n c\xF3 mu\u1ED1n r\u1EDDi gia ph\u1EA3 n\xE0y? H\xE3y xu\u1EA5t JSON tr\u01B0\u1EDBc n\u1EBFu c\u1EA7n sao l\u01B0u."));
  }
  async showPicker() {
    return this.portal.showMine();
  }
  async openViewerInvite(token) {
    let state;
    try {
      state = await this.service.shared(token);
    } catch (error) {
      if (error.code === "42501") return false;
      throw error;
    }
    const { data } = await this.client.auth.getUser();
    this.user = data.user;
    this.publicSlug = null;
    this.shareToken = token;
    await this.open(state.lineage_id, "viewer", state);
    history.replaceState(null, "", this.callbackUrl() + "#share=" + encodeURIComponent(token));
    return true;
  }
  async openShared(token) {
    this.publicSlug = null;
    this.shareToken = token;
    try {
      const state = await this.service.shared(token);
      await this.open(state.lineage_id, "viewer", state);
    } catch (error) {
      if (error.code === "42501") this.invalidateAccess("Li\xEAn k\u1EBFt chia s\u1EBB kh\xF4ng h\u1EE3p l\u1EC7, \u0111\xE3 h\u1EBFt h\u1EA1n ho\u1EB7c \u0111\xE3 \u0111\u01B0\u1EE3c thu h\u1ED3i.");
      else throw error;
    }
  }
  invalidateAccess(message) {
    this.stopPoll();
    this.base = null;
    this.guest = false;
    this.shareToken = null;
    this.publicSlug = null;
    this.app.dataStore.readOnly = true;
    this.app.lineageId = null;
    this.app.userRole = "viewer";
    this.app.dataStore.loadState({ lineageInfo: { name: "", total_members: 0, generations: 0 }, members: [] });
    this.portal.unavailable(message);
  }
  async open(id, role, state = null) {
    const snapshot = state || await this.service.load(id);
    this.guest = Boolean(this.publicSlug || state && this.shareToken);
    this.app.lineageId = id;
    this.app.userRole = role;
    this.app.isAuthenticated = true;
    this.app.currentUser = { id: this.user?.id || null, username: this.guest ? "Kh\xE1ch (ch\u1EC9 xem)" : this.profile?.display_name || this.user.user_metadata?.display_name || this.user.user_metadata?.full_name || this.user.email };
    if (!this.ready) {
      this.app.setupResponsiveDrawer();
      this.app.setupLeftMenuTabs();
      this.app.setupLeftInspector();
      this.app.setupToolbarButtons();
      this.app.setupModals();
      this.app.setupSearch();
      this.setupSharing();
      this.setupProposal();
      this.installNavigation();
      this.ready = true;
    }
    this.app.setupLineageTitle();
    this.applySnapshot(snapshot);
    this.app.applyRoleRestrictions();
    document.body.dataset.access = role;
    this.app.dataStore.readOnly = role === "viewer";
    document.querySelectorAll("#inspector-form-wrapper input,#inspector-form-wrapper select,#inspector-form-wrapper textarea").forEach((el) => {
      el.disabled = role === "viewer";
    });
    if (role === "viewer") $2("lineage-title").ondblclick = null;
    $2("btn-open-import").style.display = role === "viewer" ? "none" : "";
    $2("btn-reset-data").style.display = "none";
    $2("btn-save-lineage").onclick = () => this.save();
    $2("btn-inspect-save").onclick = () => this.save();
    for (const id2 of ["btn-save-lineage", "btn-inspect-save"]) {
      const button = $2(id2);
      const label = role === "editor" ? "G\u1EEDi y\xEAu c\u1EA7u ph\xEA duy\u1EC7t" : "L\u01B0u gia ph\u1EA3";
      const displayLabel = id2 === "btn-save-lineage" ? role === "editor" ? "G\u1EEDi duy\u1EC7t" : "L\u01B0u" : label;
      button.innerHTML = `<svg aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/></svg><span class="workspace-action-label">${displayLabel}</span>`;
      button.setAttribute("aria-label", label);
      button.title = role === "editor" ? "M\u1ECDi thay \u0111\u1ED5i c\u1EA7n qu\u1EA3n tr\u1ECB vi\xEAn ph\xEA duy\u1EC7t" : "L\u01B0u gia ph\u1EA3";
    }
    if (this.guest) $2("btn-request-edit").style.display = "none";
    $2("auth-overlay").style.display = "none";
    this.portal.screen("workspace");
    if (state?.slug) history.replaceState(null, "", this.callbackUrl() + "#family=" + encodeURIComponent(state.slug));
    else if (!this.shareToken) history.replaceState(null, "", this.callbackUrl() + "#tree");
    this.setupNotifications();
  }
  applySnapshot(snapshot) {
    this.revision = Number(snapshot.revision);
    this.app.dataStore.loadState(snapshot);
    this.app.dataStore.initializeTracking();
    this.base = this.capture();
    this.lastSubmitted = null;
    $2("lineage-origin").textContent = String(snapshot.lineageInfo?.origin || "");
    this.app.updateStatsDisplay();
    setTimeout(() => this.app.canvas.zoomFit(), 100);
  }
  async load() {
    try {
      const state = this.publicSlug ? await this.service.openPage(this.publicSlug) : this.guest ? await this.service.shared(this.shareToken) : await this.service.load(this.app.lineageId);
      this.applySnapshot(state);
    } catch (error) {
      if (error.code === "42501") this.invalidateAccess("Quy\u1EC1n truy c\u1EADp \u0111\xE3 h\u1EBFt h\u1EA1n ho\u1EB7c \u0111\xE3 \u0111\u01B0\u1EE3c thu h\u1ED3i.");
      else throw error;
    }
  }
  async save() {
    if (this.saving || this.guest || this.app.userRole === "viewer") return;
    const snapshot = this.capture();
    const changes = snapshotChanges(this.base, snapshot);
    if (!changes.length) {
      this.app.showToast("Kh\xF4ng c\xF3 thay \u0111\u1ED5i c\u1EA7n l\u01B0u.");
      return;
    }
    this.saving = true;
    try {
      const { data, error } = await this.client.auth.getUser();
      if (error || !data.user || this.user && data.user.id !== this.user.id) {
        this.app.dataStore.readOnly = true;
        this.showLogin("\u0110\u0103ng nh\u1EADp tr\u01B0\u1EDBc khi g\u1EEDi thay \u0111\u1ED5i.");
        return;
      }
      if (this.app.userRole === "editor") {
        const signature = JSON.stringify(changes);
        if (signature === this.lastSubmitted) {
          this.app.showToast("B\u1EA3n nh\xE1p n\xE0y \u0111\xE3 \u0111\u01B0\u1EE3c g\u1EEDi v\xE0 \u0111ang ch\u1EDD duy\u1EC7t.");
          return;
        }
        await this.service.submit(this.app.lineageId, this.revision, changes, "\u0110\u1EC1 xu\u1EA5t c\u1EADp nh\u1EADt gia ph\u1EA3");
        this.lastSubmitted = signature;
        this.app.showToast("\u0110\xE3 g\u1EEDi \u0111\u1EC1 xu\u1EA5t. D\u1EEF li\u1EC7u ch\xEDnh th\u1EE9c ch\u01B0a thay \u0111\u1ED5i.", "success");
      } else {
        this.revision = Number(await this.service.save(this.app.lineageId, this.revision, snapshot));
        this.base = snapshot;
        this.app.dataStore.initializeTracking(snapshot.members);
        this.app.showToast("\u0110\xE3 l\u01B0u gia ph\u1EA3 l\xEAn Supabase.", "success");
      }
    } catch (error) {
      this.app.showToast(describeError(error), "error");
    } finally {
      this.saving = false;
    }
  }
  installNavigation() {
    const host = $2("user-display").parentElement;
    const switcher = document.createElement("button");
    switcher.className = "workspace-icon-button";
    switcher.id = "sb-switch";
    switcher.title = "Trang ch\u1EE7";
    switcher.setAttribute("aria-label", "Trang ch\u1EE7");
    switcher.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/></svg>';
    switcher.onclick = () => this.portal.go("home");
    const reload = document.createElement("button");
    reload.className = "workspace-icon-button";
    reload.id = "sb-reload";
    reload.title = "T\u1EA3i l\u1EA1i";
    reload.setAttribute("aria-label", "T\u1EA3i l\u1EA1i");
    reload.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M20 7v5h-5M4 17v-5h5M19 11a7 7 0 0 0-12-5L4 9m16 6-3 3A7 7 0 0 1 5 13"/></svg>';
    reload.onclick = () => this.action(reload, async () => {
      if (this.canLeave()) await this.load();
    });
    host.insertBefore(switcher, $2("notification-bell-wrapper"));
    host.insertBefore(reload, $2("notification-bell-wrapper"));
    for (const link of document.querySelectorAll('a[href^="/api/download/"]')) {
      link.href = "data:text/csv;charset=utf-8," + encodeURIComponent("\uFEFFM\xE3 ID,T\xEAn Th\xE1nh,H\u1ECD v\xE0 T\xEAn,Gi\u1EDBi T\xEDnh,Th\u1EBF H\u1EC7,Chi,Nh\xE1nh N\u1ED9i Ngo\u1EA1i,M\xE3 ID Cha/M\u1EB9,V\u1EE3 Ch\u1ED3ng,Ng\xE0y Sinh,Ng\xE0y M\u1EA5t,Tr\u1EA1ng Th\xE1i,Vai Tr\xF2,Ghi Ch\xFA\r\n");
      link.download = "gia-pha-mau.csv";
      link.textContent = "\u{1F4E5} T\u1EA3i m\u1EABu CSV";
    }
  }
  setupLogout() {
  }
  async logout() {
    if (!this.canLeave()) return;
    this.signingOut = true;
    try {
      const { error } = await this.client.auth.signOut();
      if (error) throw error;
      this.user = null;
      this.profile = null;
      this.base = null;
      this.guest = false;
      this.publicSlug = null;
      this.shareToken = null;
      this.stopPoll();
      this.app.dataStore.loadState({ lineageInfo: { name: "", total_members: 0, generations: 0 }, members: [] });
      this.app.isAuthenticated = false;
      this.app.lineageId = null;
      $2("share-panel-overlay").classList.add("hidden");
      $2("edit-request-overlay").classList.add("hidden");
      $2("notification-dropdown").classList.add("hidden");
      sessionStorage.removeItem("giapha_return");
      sessionStorage.removeItem("giapha_invite");
      await this.portal.go("home");
    } catch (error) {
      this.app.showToast(describeError(error), "error");
    } finally {
      this.signingOut = false;
    }
  }
  setupSharing() {
    const overlay = $2("share-panel-overlay");
    overlay.innerHTML = `<div class="sb-card" style="width:min(95vw,640px);max-height:85vh;overflow:auto">
      <h2>Chia s\u1EBB gia ph\u1EA3</h2><p class="sb-message">Ch\u1EC9 xem: m\u1EDF \u0111\u01B0\u1EE3c kh\xF4ng c\u1EA7n \u0111\u0103ng nh\u1EADp. Quy\u1EC1n s\u1EEDa: c\u1EA7n \u0111\u0103ng nh\u1EADp, m\u1ECDi thay \u0111\u1ED5i g\u1EEDi qu\u1EA3n tr\u1ECB ph\xEA duy\u1EC7t. Thu h\u1ED3i link s\u1EBD ng\u1EEBng quy\u1EC1n truy c\u1EADp \u0111\u01B0\u1EE3c c\u1EA5p qua link \u0111\xF3.</p>
      <label for="sb-link-duration">Th\u1EDDi h\u1EA1n li\xEAn k\u1EBFt</label><select id="sb-link-duration"><option value="7days">7 ng\xE0y (m\u1EB7c \u0111\u1ECBnh)</option><option value="forever">Kh\xF4ng h\u1EBFt h\u1EA1n \u2014 \u0111\u1EBFn khi admin thu h\u1ED3i</option></select>
      <div class="sb-actions"><button id="sb-share-view">T\u1EA1o link ch\u1EC9 xem</button><button id="sb-invite">T\u1EA1o link c\xF3 quy\u1EC1n s\u1EEDa</button><button id="sb-share-close">\u0110\xF3ng</button></div>
      <label for="sb-link-result">Li\xEAn k\u1EBFt m\u1EDBi (ch\u1EC9 hi\u1EC3n th\u1ECB m\u1ED9t l\u1EA7n)</label><input id="sb-link-result" readonly><button id="sb-copy-link">Sao ch\xE9p</button>
      <h2 style="margin-top:1rem">Li\xEAn k\u1EBFt c\xF2n hi\u1EC7u l\u1EF1c</h2><div id="sb-links"></div><details><summary>Quy\u1EC1n c\u1EA5p tr\u1EF1c ti\u1EBFp cho t\xE0i kho\u1EA3n</summary><p class="sb-message">Quy\u1EC1n c\u1EA5p tr\u1EF1c ti\u1EBFp \u0111\u1ED9c l\u1EADp v\u1EDBi link. Thu h\u1ED3i link kh\xF4ng x\xF3a quy\u1EC1n \u0111\u01B0\u1EE3c admin c\u1EA5p ri\xEAng.</p><div id="sb-access"></div></details>
      <button id="sb-open-requests" style="margin-top:1rem">Qu\u1EA3n l\xFD y\xEAu c\u1EA7u ph\xEA duy\u1EC7t</button></div>`;
    const close = () => {
      overlay.classList.add("hidden");
      overlay.classList.remove("flex");
    };
    $2("sb-share-close").onclick = close;
    $2("sb-open-requests").onclick = () => {
      close();
      this.portal.go("requests");
    };
    overlay.onclick = (event) => {
      if (event.target === overlay) close();
    };
    $2("btn-open-share").onclick = async () => {
      overlay.classList.remove("hidden");
      overlay.classList.add("flex");
      try {
        await this.refreshSharing();
      } catch (error) {
        this.app.showToast(describeError(error), "error");
      }
    };
    const create = (button, kind, role) => this.action(button, async () => {
      const token = await this.service.link(this.app.lineageId, kind, role, $2("sb-link-duration").value);
      const url = new URL(this.callbackUrl());
      url.hash = new URLSearchParams({ [kind === "share" ? "share" : "invite"]: token });
      $2("sb-link-result").value = url.href;
      await this.refreshSharing();
    });
    $2("sb-share-view").onclick = () => create($2("sb-share-view"), "share", "viewer");
    $2("sb-invite").onclick = () => create($2("sb-invite"), "invite", "editor");
    $2("sb-copy-link").onclick = () => this.action($2("sb-copy-link"), async () => {
      if ($2("sb-link-result").value) {
        await navigator.clipboard.writeText($2("sb-link-result").value);
        this.app.showToast("\u0110\xE3 sao ch\xE9p.");
      }
    });
  }
  row(container, text) {
    const row = document.createElement("div");
    row.className = "sb-row";
    const label = document.createElement("p");
    label.textContent = text;
    row.appendChild(label);
    container.appendChild(row);
    return row;
  }
  button(row, text, fn) {
    const button = document.createElement("button");
    button.textContent = text;
    row.appendChild(button);
    button.onclick = () => this.action(button, fn);
    return button;
  }
  async refreshSharing() {
    const id = this.app.lineageId;
    const [links, access] = await Promise.all([this.service.links(id), this.service.accessList(id)]);
    $2("sb-links").replaceChildren();
    $2("sb-access").replaceChildren();
    for (const link of links) {
      const row = this.row($2("sb-links"), `${link.kind === "share" ? "Ch\u1EC9 xem \xB7 Kh\xF4ng c\u1EA7n \u0111\u0103ng nh\u1EADp" : roles[link.role] + " \xB7 C\u1EA7n \u0111\u0103ng nh\u1EADp"} \xB7 ${link.expires_at ? "H\u1EBFt h\u1EA1n " + new Date(link.expires_at).toLocaleString("vi-VN") : "Kh\xF4ng h\u1EBFt h\u1EA1n"}`);
      row.classList.add("sb-link-row");
      this.button(row, "Thu h\u1ED3i", async () => {
        await this.service.revoke(link.id);
        $2("sb-link-result").value = "";
        await this.refreshSharing();
      });
    }
    if (!links.length) this.row($2("sb-links"), "Ch\u01B0a c\xF3 li\xEAn k\u1EBFt c\xF2n hi\u1EC7u l\u1EF1c.");
    for (const item of access) {
      const row = this.row($2("sb-access"), `${item.user_id === this.user.id ? "B\u1EA1n" : "Th\xE0nh vi\xEAn " + item.user_id} \xB7 ${roles[item.role]}`);
      const select = document.createElement("select");
      select.style.width = "auto";
      for (const [value, label] of Object.entries(roles)) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
      }
      select.value = item.role;
      row.appendChild(select);
      this.button(row, "C\u1EADp nh\u1EADt", async () => {
        await this.service.access(id, item.user_id, select.value);
        if (item.user_id === this.user.id) {
          await this.showPicker();
          $2("share-panel-overlay").classList.add("hidden");
        } else await this.refreshSharing();
      });
      this.button(row, "X\xF3a quy\u1EC1n", async () => {
        if (confirm("Thu h\u1ED3i quy\u1EC1n c\u1EE7a th\xE0nh vi\xEAn n\xE0y?")) {
          await this.service.access(id, item.user_id, null);
          if (item.user_id === this.user.id) {
            await this.showPicker();
            $2("share-panel-overlay").classList.add("hidden");
          } else await this.refreshSharing();
        }
      });
    }
  }
  renderRequest(container, request, admin, onReviewed = null) {
    const status = { pending: "Ch\u1EDD duy\u1EC7t", approved: "\u0110\xE3 duy\u1EC7t", rejected: "\u0110\xE3 t\u1EEB ch\u1ED1i" };
    const row = this.row(container, `${request.title} \xB7 ${status[request.status]} \xB7 ${new Date(request.created_at).toLocaleString("vi-VN")}`);
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `${request.changes.length} thay \u0111\u1ED5i \xB7 phi\xEAn b\u1EA3n ${request.base_revision}`;
    details.appendChild(summary);
    for (const change of request.changes) {
      const line = document.createElement("p");
      line.className = "sb-detail";
      line.textContent = change.type === "add_member" ? `Th\xEAm: ${change.new_value.full_name || ""} (${change.new_value.id})` : change.type === "delete_member" ? `X\xF3a: ${change.member_id}` : change.type === "update_info" ? `\u0110\u1ED5i th\xF4ng tin gia ph\u1EA3: ${change.new_value.name}` : `S\u1EEDa ${change.member_id}: ` + Object.entries(change.new_value).map(([key, value]) => `${fieldNames[key] || key} \u2192 ${key === "sibling_order" && typeof value === "number" ? value + 1 : value ?? ""}`).join("; ");
      details.appendChild(line);
    }
    row.appendChild(details);
    if (request.rejection_reason) this.row(row, request.rejection_reason);
    if (admin && request.status === "pending") {
      this.button(row, "Duy\u1EC7t", async () => {
        if (this.hasDraft()) throw new Error("H\xE3y l\u01B0u ho\u1EB7c xu\u1EA5t b\u1EA3n nh\xE1p tr\u01B0\u1EDBc khi duy\u1EC7t \u0111\u1EC1 xu\u1EA5t.");
        await this.service.review(request.id, true);
        if (onReviewed) await onReviewed();
        else {
          await this.load();
          await this.refreshSharing();
        }
      });
      this.button(row, "T\u1EEB ch\u1ED1i", async () => {
        const reason = prompt("L\xFD do t\u1EEB ch\u1ED1i:", "");
        if (reason !== null) {
          await this.service.review(request.id, false, reason);
          if (onReviewed) await onReviewed();
          else await this.refreshSharing();
        }
      });
    }
  }
  setupProposal() {
    const overlay = $2("edit-request-overlay");
    overlay.innerHTML = `<div class="sb-card" style="width:min(95vw,460px);max-height:85vh;overflow:auto"><h2>\u0110\u1EC1 xu\u1EA5t ch\u1EC9nh s\u1EEDa</h2><form id="sb-proposal">
      <label for="sb-proposal-type">Thao t\xE1c</label><select id="sb-proposal-type"><option value="update_member">S\u1EEDa th\xF4ng tin</option><option value="add_member">Th\xEAm th\xE0nh vi\xEAn</option><option value="delete_member">X\xF3a th\xE0nh vi\xEAn</option></select>
      <label for="sb-proposal-member">Th\xE0nh vi\xEAn / m\xE3 cha m\u1EB9 khi th\xEAm</label><select id="sb-proposal-member"></select>
      <label for="sb-proposal-field">Th\xF4ng tin c\u1EA7n s\u1EEDa</label><select id="sb-proposal-field"><option value="full_name">H\u1ECD v\xE0 t\xEAn</option><option value="christian_name">T\xEAn th\xE1nh</option><option value="birth_date">Ng\xE0y sinh</option><option value="death_date">Ng\xE0y m\u1EA5t</option><option value="notes">Ghi ch\xFA</option></select>
      <label for="sb-proposal-value">Gi\xE1 tr\u1ECB m\u1EDBi / h\u1ECD t\xEAn ng\u01B0\u1EDDi th\xEAm</label><input id="sb-proposal-value" maxlength="5000">
      <label for="sb-proposal-reason">L\xFD do</label><textarea id="sb-proposal-reason" required maxlength="500"></textarea>
      <p id="sb-proposal-error" class="sb-message" role="status"></p><div class="sb-actions"><button id="sb-proposal-send" class="sb-primary">G\u1EEDi \u0111\u1EC1 xu\u1EA5t</button><button id="sb-proposal-close" type="button">\u0110\xF3ng</button></div></form></div>`;
    $2("sb-proposal-close").onclick = () => {
      overlay.classList.add("hidden");
      overlay.classList.remove("flex");
    };
    $2("btn-request-edit").onclick = () => {
      if (this.guest || !this.user) {
        this.app.showToast("H\xE3y \u0111\u0103ng nh\u1EADp v\xE0 nh\u1EADn quy\u1EC1n qua li\xEAn k\u1EBFt m\u1EDDi \u0111\u1EC3 g\u1EEDi \u0111\u1EC1 xu\u1EA5t.", "error");
        return;
      }
      const select = $2("sb-proposal-member");
      select.replaceChildren();
      const root = document.createElement("option");
      root.value = "";
      root.textContent = "Kh\xF4ng c\xF3 / th\xE0nh vi\xEAn g\u1ED1c";
      select.appendChild(root);
      for (const member of this.app.dataStore.getAllMembers()) {
        const option = document.createElement("option");
        option.value = member.id;
        option.textContent = `${member.full_name || ""} (${member.id})`;
        select.appendChild(option);
      }
      select.value = this.app.dataStore.selectedMemberId || "";
      $2("sb-proposal-error").textContent = "";
      overlay.classList.remove("hidden");
      overlay.classList.add("flex");
    };
    $2("sb-proposal").onsubmit = (event) => {
      event.preventDefault();
      this.action($2("sb-proposal-send"), async () => {
        try {
          const type = $2("sb-proposal-type").value;
          const id = $2("sb-proposal-member").value;
          const value = $2("sb-proposal-value").value.trim();
          if (type !== "add_member" && !id) throw new Error("Vui l\xF2ng ch\u1ECDn th\xE0nh vi\xEAn.");
          if (type !== "delete_member" && !value) throw new Error("Vui l\xF2ng nh\u1EADp gi\xE1 tr\u1ECB m\u1EDBi.");
          let change;
          if (type === "add_member") {
            const parent = this.app.dataStore.getMember(id);
            change = { type, new_value: { id: "P" + crypto.randomUUID(), full_name: value, parent_id: id || "-", generation: String(Number(parent?.generation || 0) + 1), gender: "Nam" } };
          } else if (type === "delete_member") change = { type, member_id: id };
          else change = { type, member_id: id, new_value: { [$2("sb-proposal-field").value]: value } };
          await this.service.submit(this.app.lineageId, this.revision, [change], $2("sb-proposal-reason").value.trim());
          overlay.classList.add("hidden");
          this.app.showToast("\u0110\xE3 g\u1EEDi \u0111\u1EC1 xu\u1EA5t ch\u1EDD qu\u1EA3n tr\u1ECB duy\u1EC7t.", "success");
        } catch (error) {
          $2("sb-proposal-error").textContent = describeError(error);
          throw error;
        }
      });
    };
  }
  stopPoll() {
    clearInterval(this.poll);
    this.poll = null;
  }
  setupNotifications() {
    this.stopPoll();
    const host = $2("notification-bell-wrapper");
    host.classList.toggle("hidden", Boolean(this.guest));
    host.classList.toggle("flex", !this.guest);
    if (!this.app.lineageId) return;
    this.poll = setInterval(() => {
      if (!document.hidden) this.checkAccess();
    }, 3e4);
    if (this.guest) return;
    $2("btn-notification-bell").onclick = () => this.portal.go("requests");
    this.refreshNotifications();
  }
  async checkAccess() {
    const id = this.app.lineageId;
    const screen = this.portal.sequence;
    if (!id || document.body.dataset.screen !== "workspace") return;
    try {
      const allowed = await this.service.canRead(id, this.guest ? this.shareToken || null : null, this.publicSlug || null);
      if (!allowed) throw { code: "42501" };
      if (id === this.app.lineageId && screen === this.portal.sequence && !this.guest) await this.refreshNotifications();
    } catch (error) {
      if (error.code === "42501" && id === this.app.lineageId && screen === this.portal.sequence) this.invalidateAccess("Li\xEAn k\u1EBFt ho\u1EB7c quy\u1EC1n truy c\u1EADp \u0111\xE3 h\u1EBFt h\u1EA1n ho\u1EB7c \u0111\xE3 \u0111\u01B0\u1EE3c thu h\u1ED3i.");
    }
  }
  async refreshNotifications() {
    try {
      const id = this.app.lineageId;
      const requests = await this.service.requests(id);
      if (id !== this.app.lineageId) return;
      const pending = requests.filter((r) => r.status === "pending").length;
      $2("notification-badge").textContent = String(pending);
      $2("notification-badge").classList.toggle("hidden", !pending);
      $2("notification-count").textContent = `${pending} \u0111\u1EC1 xu\u1EA5t ch\u1EDD duy\u1EC7t`;
      $2("notification-list").replaceChildren();
      for (const request of requests.slice(0, 20)) this.renderRequest($2("notification-list"), request, false);
      if (!requests.length) this.row($2("notification-list"), "Ch\u01B0a c\xF3 \u0111\u1EC1 xu\u1EA5t.");
    } catch (error) {
    }
  }
};

// dist/js/app.js
var App = class {
  constructor() {
    this.dataStore = new DataStore();
    this.layout = new AutoLayout({ nodeWidth: 230, nodeHeight: 140, siblingGap: 35, generationGap: 130 });
    this.viewportEl = document.getElementById("canvas-viewport");
    this.nodesContainerEl = document.getElementById("canvas-nodes-container");
    this.svgEl = document.getElementById("canvas-svg");
    this.linksGroupEl = document.getElementById("canvas-links-group");
    this.outlineContainerEl = document.getElementById("outline-tree-container");
    this.canvas = new TreeCanvas(
      this.viewportEl,
      this.nodesContainerEl,
      this.svgEl,
      this.linksGroupEl,
      this.dataStore,
      this.layout
    );
    this.textEditor = new MindNodeTextEditor(
      this.outlineContainerEl,
      this.dataStore
    );
    this.init();
  }
  async init() {
    window.app = this;
    if (isSupabaseConfigured()) {
      this.supabase = new SupabaseController(this);
      await this.supabase.init();
      return;
    }
    if (config.staticHosting && !config.apiBaseUrl) {
      ["auth-login-form", "auth-create-form", "auth-code-form"].forEach((id) => {
        document.getElementById(id)?.classList.add("hidden");
      });
      document.getElementById("backend-unavailable").classList.remove("hidden");
      return;
    }
    document.querySelectorAll('a[href^="/api/"]').forEach((link) => {
      link.href = apiUrl(link.getAttribute("href"));
    });
    await this.checkShareLink();
    await this.checkAuthState();
    if (!this.isAuthenticated) {
      this.setupAuthUI();
      return;
    }
    const overlay = document.getElementById("auth-overlay");
    if (overlay) overlay.style.display = "none";
    this.applyRoleRestrictions();
    this.setupResponsiveDrawer();
    this.setupLeftMenuTabs();
    this.setupLeftInspector();
    this.setupToolbarButtons();
    this.setupModals();
    this.setupSearch();
    this.setupLineageTitle();
    this.setupSharePanel();
    this.setupEditRequestModal();
    this.setupNotificationBell();
    await this.loadInitialData();
  }
  // ─── Share Link Resolution ─────────────────────────────────────────────────
  async checkShareLink() {
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    const token = new URLSearchParams(window.location.search).get("share") || (pathParts[0] === "share" ? pathParts[1] : null);
    if (token) {
      try {
        const res = await apiFetch(`/api/share/${token}`);
        const data = await res.json();
        if (res.ok) {
          this._shareLinkInfo = { lineage_id: data.lineage_id, role: data.role };
          this.lineageId = data.lineage_id;
          this.isAuthenticated = true;
          this.userRole = data.role || "viewer";
          this.currentUser = { id: "share_" + token, username: "Kh\xE1ch (Link chia s\u1EBB)" };
          return;
        }
      } catch (err) {
        console.error("Share link resolution failed:", err);
      }
      this.showToast("Link chia s\u1EBB kh\xF4ng h\u1EE3p l\u1EC7 ho\u1EB7c \u0111\xE3 h\u1EBFt h\u1EA1n.", "error");
    }
  }
  // ─── Auth Methods ──────────────────────────────────────────────────────────
  async checkAuthState() {
    if (this.isAuthenticated && this._shareLinkInfo) return;
    this.isAuthenticated = false;
    this.userRole = null;
    this.currentUser = null;
    this.lineageId = null;
    const sessionToken = localStorage.getItem("session_token");
    if (!sessionToken) return;
    try {
      const res = await apiFetch("/api/auth/me", {
        headers: { "Authorization": "Bearer " + sessionToken }
      });
      if (res.ok) {
        const data = await res.json();
        this.isAuthenticated = true;
        this.userRole = data.role;
        this.currentUser = data.user;
        this.lineageId = data.lineage_id;
      } else {
        localStorage.removeItem("session_token");
      }
    } catch {
      localStorage.removeItem("session_token");
    }
  }
  setupAuthUI() {
    const overlay = document.getElementById("auth-overlay");
    const loginForm = document.getElementById("auth-login-form");
    const createForm = document.getElementById("auth-create-form");
    const codeForm = document.getElementById("auth-code-form");
    if (!overlay) return;
    const showForm = (form) => {
      loginForm.classList.add("hidden");
      createForm.classList.add("hidden");
      codeForm.classList.add("hidden");
      form.classList.remove("hidden");
      this.clearAuthErrors();
    };
    document.getElementById("auth-switch-create").onclick = (e) => {
      e.preventDefault();
      showForm(createForm);
    };
    document.getElementById("auth-switch-login").onclick = (e) => {
      e.preventDefault();
      showForm(loginForm);
    };
    document.getElementById("auth-switch-code").onclick = (e) => {
      e.preventDefault();
      showForm(codeForm);
    };
    document.getElementById("auth-switch-login-from-code").onclick = (e) => {
      e.preventDefault();
      showForm(loginForm);
    };
    document.getElementById("auth-login-btn").onclick = async () => {
      const username = document.getElementById("auth-username").value.trim();
      if (!username) {
        this.showAuthError("auth-error", "T\xEAn ng\u01B0\u1EDDi d\xF9ng kh\xF4ng \u0111\u01B0\u1EE3c \u0111\u1EC3 tr\u1ED1ng");
        return;
      }
      try {
        const loginBody = { username };
        if (this._pendingCodeAccess) {
          loginBody.share_code = this._pendingCodeAccess.code;
        }
        const res = await apiFetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(loginBody)
        });
        const data = await res.json();
        if (res.ok) {
          localStorage.setItem("session_token", data.session_token);
          this.isAuthenticated = true;
          this.userRole = data.role;
          this.currentUser = data.user;
          this.lineageId = data.lineage_id;
          overlay.style.display = "none";
          this.applyRoleRestrictions();
          this.setupResponsiveDrawer();
          this.setupLeftMenuTabs();
          this.setupLeftInspector();
          this.setupToolbarButtons();
          this.setupModals();
          this.setupSearch();
          this.setupLineageTitle();
          this.setupSharePanel();
          this.setupEditRequestModal();
          this.setupNotificationBell();
          this.setupLogout();
          await this.loadInitialData();
        } else {
          this.showAuthError("auth-error", data.error || "\u0110\u0103ng nh\u1EADp th\u1EA5t b\u1EA1i");
        }
      } catch (err) {
        this.showAuthError("auth-error", "L\u1ED7i k\u1EBFt n\u1ED1i m\xE1y ch\u1EE7");
      }
    };
    document.getElementById("auth-create-btn").onclick = async () => {
      const username = document.getElementById("auth-create-username").value.trim();
      if (!username) {
        this.showAuthError("auth-create-error", "T\xEAn ng\u01B0\u1EDDi d\xF9ng kh\xF4ng \u0111\u01B0\u1EE3c \u0111\u1EC3 tr\u1ED1ng");
        return;
      }
      try {
        const createBody = { username };
        if (this._pendingCodeAccess) {
          createBody.share_code = this._pendingCodeAccess.code;
        }
        const res = await apiFetch("/api/auth/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createBody)
        });
        const data = await res.json();
        if (res.ok) {
          localStorage.setItem("session_token", data.session_token);
          this.isAuthenticated = true;
          this.userRole = "admin";
          this.currentUser = data.user;
          this.lineageId = data.lineage_id;
          overlay.style.display = "none";
          this.applyRoleRestrictions();
          this.setupResponsiveDrawer();
          this.setupLeftMenuTabs();
          this.setupLeftInspector();
          this.setupToolbarButtons();
          this.setupModals();
          this.setupSearch();
          this.setupLineageTitle();
          this.setupSharePanel();
          this.setupEditRequestModal();
          this.setupNotificationBell();
          this.setupLogout();
          await this.loadInitialData();
        } else {
          this.showAuthError("auth-create-error", data.error || "T\u1EA1o t\xE0i kho\u1EA3n th\u1EA5t b\u1EA1i");
        }
      } catch (err) {
        this.showAuthError("auth-create-error", "L\u1ED7i k\u1EBFt n\u1ED1i m\xE1y ch\u1EE7");
      }
    };
    document.getElementById("auth-code-btn").onclick = async () => {
      const code = document.getElementById("auth-code-input").value.trim().toUpperCase();
      if (!code) {
        this.showAuthError("auth-code-error", "M\xE3 code kh\xF4ng \u0111\u01B0\u1EE3c \u0111\u1EC3 tr\u1ED1ng");
        return;
      }
      try {
        const res = await apiFetch("/api/share/code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code })
        });
        const data = await res.json();
        if (res.ok) {
          this._pendingCodeAccess = { lineage_id: data.lineage_id, role: data.role, code };
          showForm(loginForm);
          document.getElementById("auth-username").placeholder = "Nh\u1EADp t\xEAn ng\u01B0\u1EDDi d\xF9ng \u0111\u1EC3 ti\u1EBFp t\u1EE5c";
        } else {
          this.showAuthError("auth-code-error", data.error || "M\xE3 code kh\xF4ng h\u1EE3p l\u1EC7");
        }
      } catch (err) {
        this.showAuthError("auth-code-error", "L\u1ED7i k\u1EBFt n\u1ED1i m\xE1y ch\u1EE7");
      }
    };
    document.getElementById("auth-username").onkeydown = (e) => {
      if (e.key === "Enter") document.getElementById("auth-login-btn").click();
    };
    document.getElementById("auth-create-username").onkeydown = (e) => {
      if (e.key === "Enter") document.getElementById("auth-create-btn").click();
    };
    document.getElementById("auth-code-input").onkeydown = (e) => {
      if (e.key === "Enter") document.getElementById("auth-code-btn").click();
    };
    showForm(loginForm);
  }
  showAuthError(elementId, message) {
    const el = document.getElementById(elementId);
    el.textContent = message;
    el.classList.remove("hidden");
  }
  clearAuthErrors() {
    document.querySelectorAll('[id^="auth-"] .hidden').forEach((el) => {
    });
    ["auth-error", "auth-create-error", "auth-code-error"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = "";
        el.classList.add("hidden");
      }
    });
  }
  applyRoleRestrictions() {
    const editControls = document.querySelectorAll("#btn-add-member, #btn-delete-member, #btn-inspect-delete, #btn-inspect-save, #btn-inspect-add-child, #btn-inspect-move-left, #btn-inspect-move-right, #btn-save-lineage, #btn-reset-data, #btn-quick-add-root, #btn-add-child-selected");
    const viewerOnly = document.getElementById("btn-request-edit");
    const shareBtn = document.getElementById("btn-open-share");
    this.updateUserDisplay();
    this.setupLogout();
    this.setupNotificationBell();
    if (this.userRole === "viewer") {
      editControls.forEach((el) => {
        if (el) el.style.display = "none";
      });
      if (viewerOnly) viewerOnly.style.display = "flex";
      if (shareBtn) shareBtn.style.display = "none";
    } else if (this.userRole === "editor") {
      editControls.forEach((el) => {
        if (el) el.style.display = "";
      });
      if (viewerOnly) viewerOnly.style.display = "none";
      if (shareBtn) shareBtn.style.display = "none";
    } else {
      editControls.forEach((el) => {
        if (el) el.style.display = "";
      });
      if (viewerOnly) viewerOnly.style.display = "none";
      if (shareBtn) shareBtn.style.display = "flex";
    }
  }
  async loadInitialData() {
    try {
      let url = "/api/lineage";
      if (this.lineageId) {
        url = `/api/lineage?lineage_id=${this.lineageId}`;
      }
      const res = await apiFetch(url + (url.includes("?") ? "&" : "?") + "_t=" + Date.now(), {
        cache: "no-store"
      });
      if (res.ok) {
        const data = await res.json();
        this.dataStore.loadState(data);
        const migrated = this.dataStore.migrateSpouseTextToMembers();
        if (migrated > 0) {
          this.showToast(`\u0110\xE3 chuy\u1EC3n \u0111\u1ED5i ${migrated} th\xF4ng tin ph\u1ED1i ng\u1EABu th\xE0nh th\xE0nh vi\xEAn \u0111\u1EA7y \u0111\u1EE7.`, "success");
        }
        this.dataStore.initializeTracking();
        this.updateStatsDisplay();
        setTimeout(() => {
          this.canvas.zoomFit();
        }, 150);
        this.showToast(`\u0110\xE3 n\u1EA1p ${this.dataStore.members.size} th\xE0nh vi\xEAn!`, "success");
      } else {
        throw new Error("Kh\xF4ng th\u1EC3 t\u1EA3i d\u1EEF li\u1EC7u.");
      }
    } catch (err) {
      console.warn("Fallback loading error:", err);
      this.showToast("\u0110ang ch\u1EA1y \u1EDF ch\u1EBF \u0111\u1ED9 offline c\u1EE5c b\u1ED9.", "info");
    }
  }
  updateStatsDisplay() {
    const titleEl = document.getElementById("lineage-title");
    if (titleEl && this.dataStore.lineageInfo.name) {
      titleEl.textContent = this.dataStore.lineageInfo.name;
    }
    const statsEl = document.getElementById("stats-summary");
    if (statsEl) {
      statsEl.textContent = `${this.dataStore.lineageInfo.generations} Th\u1EBF H\u1EC7 | ${this.dataStore.lineageInfo.total_members} Th\xE0nh Vi\xEAn`;
    }
    const badge = document.getElementById("outline-count-badge");
    if (badge) badge.textContent = String(this.dataStore.members.size);
  }
  setupResponsiveDrawer() {
    if (!this.headerObserver) {
      const header = document.querySelector(".app-header");
      this.headerObserver = new ResizeObserver(() => document.documentElement.style.setProperty("--workspace-header-height", `${header.getBoundingClientRect().height}px`));
      this.headerObserver.observe(header);
    }
    const leftPane = document.getElementById("left-menu-pane");
    const backdrop = document.getElementById("left-menu-backdrop");
    const btnHamburger = document.getElementById("btn-hamburger");
    const btnCloseMobile = document.getElementById("btn-close-mobile-menu");
    const btnToggleDesktop = document.getElementById("btn-toggle-left-menu");
    const openMobileDrawer = () => {
      leftPane.classList.add("drawer-open");
      backdrop.classList.add("drawer-open");
    };
    const closeMobileDrawer = () => {
      leftPane.classList.remove("drawer-open");
      backdrop.classList.remove("drawer-open");
    };
    if (btnHamburger) btnHamburger.onclick = openMobileDrawer;
    if (btnCloseMobile) btnCloseMobile.onclick = closeMobileDrawer;
    if (backdrop) backdrop.onclick = closeMobileDrawer;
    if (btnToggleDesktop) {
      btnToggleDesktop.onclick = () => {
        leftPane.classList.toggle("hidden");
        setTimeout(() => this.canvas.zoomFit(), 150);
      };
    }
  }
  setupLeftMenuTabs() {
    const tabBtnOutline = document.getElementById("tab-btn-outline");
    const tabBtnInspector = document.getElementById("tab-btn-inspector");
    const contentOutline = document.getElementById("tab-content-outline");
    const contentInspector = document.getElementById("tab-content-inspector");
    const leftPane = document.getElementById("left-menu-pane");
    const switchTab = (tab) => {
      if (tab === "outline") {
        tabBtnOutline.className = "tab-btn flex-1 py-1.5 text-xs font-bold rounded-lg bg-white text-slate-900 shadow-xs flex items-center justify-center space-x-1.5 transition-all border-b-2 border-amber-500";
        tabBtnInspector.className = "tab-btn flex-1 py-1.5 text-xs font-semibold rounded-lg text-slate-500 hover:text-slate-800 flex items-center justify-center space-x-1.5 transition-all border-b-2 border-transparent";
        contentOutline.classList.remove("hidden");
        contentInspector.classList.add("hidden");
      } else {
        tabBtnInspector.className = "tab-btn flex-1 py-1.5 text-xs font-bold rounded-lg bg-white text-slate-900 shadow-xs flex items-center justify-center space-x-1.5 transition-all border-b-2 border-amber-500";
        tabBtnOutline.className = "tab-btn flex-1 py-1.5 text-xs font-semibold rounded-lg text-slate-500 hover:text-slate-800 flex items-center justify-center space-x-1.5 transition-all border-b-2 border-transparent";
        contentInspector.classList.remove("hidden");
        contentOutline.classList.add("hidden");
      }
    };
    tabBtnOutline.onclick = () => switchTab("outline");
    tabBtnInspector.onclick = () => switchTab("inspector");
    window.addEventListener("node-selected-for-inspector", (e) => {
      const memberId = e.detail;
      switchTab("inspector");
      this.populateInspector(memberId);
      this.canvas.focusOnMember(memberId);
      if (window.innerWidth < 1024) {
        leftPane.classList.add("drawer-open");
        document.getElementById("left-menu-backdrop").classList.add("drawer-open");
      }
    });
  }
  setupLeftInspector() {
    for (const [id, step] of [["btn-inspect-move-left", -1], ["btn-inspect-move-right", 1]]) {
      document.getElementById(id).onclick = () => {
        const selected = this.dataStore.selectedMemberId;
        if (this.dataStore.moveSibling(selected, step)) {
          this.populateInspector(selected);
          this.canvas.focusOnMember(selected);
        }
      };
    }
    const emptyState = document.getElementById("inspector-empty-state");
    const formWrapper = document.getElementById("inspector-form-wrapper");
    const btnDelete = document.getElementById("btn-inspect-delete");
    const btnSave = document.getElementById("btn-inspect-save");
    const btnAddChild = document.getElementById("btn-inspect-add-child");
    const fields = [
      { id: "inspect-christian-name", key: "christian_name" },
      { id: "inspect-full-name", key: "full_name" },
      { id: "inspect-gender", key: "gender" },
      { id: "inspect-generation", key: "generation" },
      { id: "inspect-branch", key: "branch" },
      { id: "inspect-branch-type", key: "branch_type" },
      { id: "inspect-parent-id", key: "parent_id" },
      { id: "inspect-birth-date", key: "birth_date" },
      { id: "inspect-death-date", key: "death_date" },
      { id: "inspect-status", key: "status" },
      { id: "inspect-role", key: "role" },
      { id: "inspect-notes", key: "notes" }
    ];
    fields.forEach(({ id, key }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const updateField = () => {
        const selId = this.dataStore.selectedMemberId;
        if (!selId) return;
        const val = el.value.trim();
        try {
          this.dataStore.updateMember(selId, { [key]: val });
          if (key === "full_name") {
            document.getElementById("inspect-header-name").textContent = val || "Ng\u01B0\u1EDDi M\u1EDBi";
          }
        } catch (err) {
          alert(err.message);
        }
      };
      el.addEventListener("input", updateField);
      el.addEventListener("change", updateField);
    });
    btnDelete.onclick = () => {
      const selId = this.dataStore.selectedMemberId;
      if (!selId) return;
      this.canvas.confirmDelete(selId);
    };
    btnSave.onclick = async () => {
      try {
        const payload = {
          lineage_info: this.dataStore.lineageInfo,
          members: this.dataStore.getAllMembers()
        };
        if (this.lineageId) {
          payload.lineage_id = this.lineageId;
        }
        const res = await apiFetch("/api/lineage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          this.showToast("\u0110\xE3 l\u01B0u th\xF4ng tin th\xE0nh vi\xEAn th\xE0nh c\xF4ng!", "success");
        } else {
          throw new Error("L\u1ED7i m\xE1y ch\u1EE7 khi l\u01B0u.");
        }
      } catch (err) {
        this.showToast("L\u01B0u th\u1EA5t b\u1EA1i: " + err.message, "error");
      }
    };
    btnAddChild.onclick = () => {
      const selId = this.dataStore.selectedMemberId;
      if (!selId) return;
      this.textEditor.addChildTo(selId);
    };
    const spouseSelect = document.getElementById("inspect-spouse-select");
    if (spouseSelect) {
      spouseSelect.onchange = () => {
        const selId = this.dataStore.selectedMemberId;
        if (!selId) return;
        const selectedSpouseId = spouseSelect.value;
        const member = this.dataStore.getMember(selId);
        if (selectedSpouseId) {
          this.dataStore.updateMember(selId, {
            spouse_id: selectedSpouseId
          });
          this.dataStore.updateMember(selectedSpouseId, {
            spouse_id: selId
          });
        } else {
          this.dataStore.updateMember(selId, { spouse_id: "", spouse: "" });
        }
      };
    }
    const btnAddSpouseNew = document.getElementById("btn-add-spouse-new");
    if (btnAddSpouseNew) {
      btnAddSpouseNew.onclick = () => {
        const selId = this.dataStore.selectedMemberId;
        if (!selId) return;
        this.dataStore.addSpouseAsMember(selId);
      };
    }
  }
  populateInspector(memberId) {
    const emptyState = document.getElementById("inspector-empty-state");
    const formWrapper = document.getElementById("inspector-form-wrapper");
    const indicator = document.getElementById("inspector-selected-indicator");
    const m = this.dataStore.getMember(memberId);
    if (!m) {
      emptyState.classList.remove("hidden");
      formWrapper.classList.add("hidden");
      indicator.classList.add("hidden");
      return;
    }
    emptyState.classList.add("hidden");
    formWrapper.classList.remove("hidden");
    indicator.classList.remove("hidden");
    document.getElementById("inspect-header-name").textContent = m.full_name;
    document.getElementById("btn-inspect-move-left").disabled = !this.dataStore.canMoveSibling(m.id, -1);
    document.getElementById("btn-inspect-move-right").disabled = !this.dataStore.canMoveSibling(m.id, 1);
    document.getElementById("inspect-header-meta").textContent = `M\xE3: ${m.id} \u2022 \u0110\u1EDDi ${m.generation} \u2022 ${m.branch || "Ng\xE0nh II"}`;
    document.getElementById("inspect-avatar").innerHTML = avatarSVG(m.gender);
    document.getElementById("inspect-christian-name").value = m.christian_name || "";
    document.getElementById("inspect-full-name").value = m.full_name || "";
    document.getElementById("inspect-gender").value = m.gender || "Nam";
    document.getElementById("inspect-generation").value = m.generation || "1";
    document.getElementById("inspect-branch").value = m.branch || "";
    document.getElementById("inspect-branch-type").value = m.branch_type || "N\u1ED9i t\u1ED9c (Tr\u1EF1c h\u1EC7)";
    document.getElementById("inspect-parent-id").value = m.parent_id === "-" ? "" : m.parent_id || "";
    const spouseSelect = document.getElementById("inspect-spouse-select");
    if (spouseSelect) {
      spouseSelect.innerHTML = '<option value="">\u2014 Ch\u01B0a li\xEAn k\u1EBFt \u2014</option>';
      for (const other of this.dataStore.members.values()) {
        if (other.id === m.id) continue;
        const opt = document.createElement("option");
        opt.value = other.id;
        opt.textContent = `${other.full_name} (${other.id})`;
        spouseSelect.appendChild(opt);
      }
      if (m.spouse_id && this.dataStore.members.has(m.spouse_id)) {
        spouseSelect.value = m.spouse_id;
      } else {
        spouseSelect.value = "";
      }
    }
    document.getElementById("inspect-birth-date").value = m.birth_date || "";
    document.getElementById("inspect-death-date").value = m.death_date || "";
    document.getElementById("inspect-status").value = m.status || "C\xF2n s\u1ED1ng";
    document.getElementById("inspect-role").value = m.role || "Th\xE0nh vi\xEAn";
    document.getElementById("inspect-notes").value = m.notes || "";
  }
  setupToolbarButtons() {
    this.setupHeaderMenus();
    document.getElementById("btn-zoom-in").onclick = () => this.canvas.setZoom(this.canvas.scale * 1.2);
    document.getElementById("btn-zoom-out").onclick = () => this.canvas.setZoom(this.canvas.scale * 0.8);
    document.getElementById("btn-zoom-reset").onclick = () => this.canvas.setZoom(1);
    document.getElementById("btn-zoom-fit").onclick = () => this.canvas.zoomFit();
    const btnOrient = document.getElementById("btn-toggle-orientation");
    const orientLabel = document.getElementById("orientation-label");
    btnOrient.onclick = () => {
      if (this.layout.orientation === "VERTICAL") {
        this.layout.orientation = "HORIZONTAL";
        orientLabel.textContent = "Ngang";
      } else {
        this.layout.orientation = "VERTICAL";
        orientLabel.textContent = "D\u1ECDc";
      }
      this.canvas.render();
      setTimeout(() => this.canvas.zoomFit(), 100);
    };
    const selectBranch = document.getElementById("select-branch-filter");
    selectBranch.onchange = (e) => {
      this.canvas.activeFilter = e.target.value;
      this.canvas.render();
      setTimeout(() => this.canvas.zoomFit(), 100);
    };
    const btnUndo = document.getElementById("btn-undo");
    if (btnUndo) {
      btnUndo.onclick = () => {
        if (this.dataStore.undo()) this.showToast("\u0110\xE3 ho\xE0n t\xE1c.", "info");
      };
    }
    const btnRedo = document.getElementById("btn-redo");
    if (btnRedo) {
      btnRedo.onclick = () => {
        if (this.dataStore.redo()) this.showToast("\u0110\xE3 l\xE0m l\u1EA1i.", "info");
      };
    }
    document.getElementById("btn-expand-all").onclick = () => this.textEditor.expandAll();
    document.getElementById("btn-collapse-all").onclick = () => this.textEditor.collapseAll();
    document.getElementById("btn-quick-add-root").onclick = () => {
      const name = prompt("Nh\u1EADp h\u1ECD t\xEAn C\u1EE5 Th\u1EE7y T\u1ED5:");
      if (name && name.trim()) {
        const root = this.dataStore.addMember({
          full_name: name.trim(),
          generation: "1",
          parent_id: "-",
          role: "Th\u1EE7y T\u1ED5"
        });
        this.dataStore.selectMember(root.id);
        window.dispatchEvent(new CustomEvent("node-selected-for-inspector", { detail: root.id }));
        this.showToast(`\u0110\xE3 th\xEAm Th\u1EE7y t\u1ED5 ${root.full_name}`, "success");
      }
    };
    document.getElementById("btn-add-child-selected").onclick = () => {
      const selId = this.dataStore.selectedMemberId;
      if (selId) {
        this.textEditor.addChildTo(selId);
      } else {
        alert("Vui l\xF2ng ch\u1ECDn 1 th\xE0nh vi\xEAn tr\xEAn danh m\u1EE5c ho\u1EB7c b\u1EA3n \u0111\u1ED3 \u0111\u1EC3 th\xEAm con.");
      }
    };
    document.getElementById("btn-save-lineage").onclick = async () => {
      try {
        const changes = this.dataStore.getTrackedChanges();
        if (changes.length === 0) {
          this.showToast("Kh\xF4ng c\xF3 thay \u0111\u1ED5i n\xE0o c\u1EA7n l\u01B0u.", "info");
          return;
        }
        if (this.userRole === "editor") {
          const sessionToken = localStorage.getItem("session_token");
          const res2 = await apiFetch(`/api/lineage/${this.lineageId}/pending-changes`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + sessionToken },
            body: JSON.stringify({ changes })
          });
          const data = await res2.json();
          if (res2.ok) {
            this.showToast(`\u0110\xE3 g\u1EEDi ${changes.length} thay \u0111\u1ED5i ch\u1EDD ph\xEA duy\u1EC7t. Admin s\u1EBD xem x\xE9t.`, "success");
          } else {
            throw new Error(data.error || "G\u1EEDi y\xEAu c\u1EA7u ph\xEA duy\u1EC7t th\u1EA5t b\u1EA1i.");
          }
          return;
        }
        const payload = {
          lineage_info: this.dataStore.lineageInfo,
          members: this.dataStore.getAllMembers()
        };
        if (this.lineageId) {
          payload.lineage_id = this.lineageId;
        }
        const res = await apiFetch("/api/lineage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          this.showToast("\u0110\xE3 l\u01B0u d\u1EEF li\u1EC7u gia ph\u1EA3 th\xE0nh c\xF4ng v\xE0o m\xE1y ch\u1EE7!", "success");
          this.dataStore.resetTracking();
        } else {
          throw new Error("L\u1ED7i m\xE1y ch\u1EE7 khi l\u01B0u.");
        }
      } catch (err) {
        this.showToast("L\u01B0u file: " + err.message, "error");
      }
    };
    document.getElementById("btn-reset-data").onclick = async () => {
      if (confirm("B\u1EA1n c\xF3 ch\u1EAFc mu\u1ED1n kh\xF4i ph\u1EE5c l\u1EA1i d\u1EEF li\u1EC7u m\u1EABu g\u1ED1c H\u1ECD Tr\u1EA7n Ng\u1ECDc kh\xF4ng?")) {
        const res = await apiFetch("/api/lineage/reset", { method: "POST" });
        if (res.ok) {
          await this.loadInitialData();
        }
      }
    };
  }
  setupModals() {
    document.querySelectorAll(".modal-close").forEach((btn) => {
      btn.onclick = () => {
        const dialog = btn.closest(".modal-overlay");
        dialog.classList.add("hidden");
        if (dialog.id === "modal-export") document.getElementById("btn-open-export").focus();
      };
    });
    const modalImport = document.getElementById("modal-import");
    const btnOpenImport = document.getElementById("btn-open-import");
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("file-input");
    const btnConfirmImport = document.getElementById("btn-confirm-import");
    const importPreview = document.getElementById("import-preview");
    const importStatusBox = document.getElementById("import-status-box");
    let pendingMembers = null;
    btnOpenImport.onclick = () => {
      modalImport.classList.remove("hidden");
      pendingMembers = null;
      btnConfirmImport.disabled = true;
      importPreview.classList.add("hidden");
    };
    dropZone.onclick = () => fileInput.click();
    const handleFile = (file) => {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        const result = ExcelParser.parseGenealogyData(text);
        importPreview.classList.remove("hidden");
        if (result.success && result.members.length > 0) {
          pendingMembers = result.members;
          btnConfirmImport.disabled = false;
          importStatusBox.className = "p-3 rounded-xl text-xs bg-emerald-50 text-emerald-800 border border-emerald-200";
          importStatusBox.innerHTML = `
            <strong>\u0110\xE3 \u0111\u1ECDc th\xE0nh c\xF4ng ${result.members.length} th\xE0nh vi\xEAn!</strong><br>
            File: <em>${escapeHTML(file.name)}</em> (S\u1EB5n s\xE0ng n\u1EA1p v\xE0o c\xE2y gia ph\u1EA3).
          `;
        } else {
          pendingMembers = null;
          btnConfirmImport.disabled = true;
          importStatusBox.className = "p-3 rounded-xl text-xs bg-rose-50 text-rose-800 border border-rose-200";
          importStatusBox.innerHTML = `
            <strong>C\xF3 l\u1ED7i khi \u0111\u1ECDc file:</strong><br>
            ${result.errors.map(escapeHTML).join("<br>")}
          `;
        }
      };
      reader.readAsText(file, "UTF-8");
    };
    fileInput.onchange = (e) => handleFile(e.target.files[0]);
    dropZone.ondragover = (e) => {
      e.preventDefault();
      dropZone.classList.add("border-amber-500");
    };
    dropZone.ondragleave = () => dropZone.classList.remove("border-amber-500");
    dropZone.ondrop = (e) => {
      e.preventDefault();
      dropZone.classList.remove("border-amber-500");
      handleFile(e.dataTransfer.files[0]);
    };
    btnConfirmImport.onclick = () => {
      if (pendingMembers) {
        this.dataStore.loadState({
          lineageInfo: { ...this.dataStore.lineageInfo, total_members: pendingMembers.length },
          members: pendingMembers
        });
        modalImport.classList.add("hidden");
        this.updateStatsDisplay();
        setTimeout(() => this.canvas.zoomFit(), 150);
        this.showToast(`\u0110\xE3 import th\xE0nh c\xF4ng ${pendingMembers.length} th\xE0nh vi\xEAn m\u1EDBi!`, "success");
      }
    };
    const modalKinship = document.getElementById("modal-kinship");
    const selectA = document.getElementById("kinship-person-a");
    const selectB = document.getElementById("kinship-person-b");
    const resultText = document.getElementById("kinship-result-text");
    document.getElementById("btn-open-kinship").onclick = () => {
      modalKinship.classList.remove("hidden");
      selectA.innerHTML = '<option value="">-- Ch\u1ECDn Ng\u01B0\u1EDDi Th\u1EE9 Nh\u1EA5t --</option>';
      selectB.innerHTML = '<option value="">-- Ch\u1ECDn Ng\u01B0\u1EDDi Th\u1EE9 Hai --</option>';
      const sorted = this.dataStore.getAllMembers().sort((a, b) => a.full_name.localeCompare(b.full_name));
      for (const m of sorted) {
        const optA = document.createElement("option");
        optA.value = m.id;
        optA.textContent = `${m.full_name} (${m.id} - \u0110\u1EDDi ${m.generation})`;
        selectA.appendChild(optA);
        const optB = document.createElement("option");
        optB.value = m.id;
        optB.textContent = `${m.full_name} (${m.id} - \u0110\u1EDDi ${m.generation})`;
        selectB.appendChild(optB);
      }
      if (this.dataStore.selectedMemberId) {
        selectA.value = this.dataStore.selectedMemberId;
      }
      calculateKinship();
    };
    const calculateKinship = () => {
      const idA = selectA.value;
      const idB = selectB.value;
      resultText.innerHTML = KinshipCalculator.calculateRelationship(this.dataStore, idA, idB);
    };
    selectA.onchange = calculateKinship;
    selectB.onchange = calculateKinship;
    const modalLunar = document.getElementById("modal-lunar");
    const lunarListContainer = document.getElementById("lunar-gi\u1ED7-list");
    document.getElementById("btn-open-lunar").onclick = () => {
      modalLunar.classList.remove("hidden");
      LunarCalendarManager.renderGi\u1ED7List(lunarListContainer, this.dataStore, (memberId) => {
        modalLunar.classList.add("hidden");
        this.revealMemberOnTree(memberId);
      });
    };
    const modalExport = document.getElementById("modal-export");
    const selectExportScope = document.getElementById("select-export-scope");
    const exportSubtreeHint = document.getElementById("export-subtree-hint");
    const refreshExportScopeSelector = () => {
      selectExportScope.querySelectorAll("option[data-subtree]").forEach((o) => o.remove());
      const selId = this.dataStore.selectedMemberId;
      if (selId) {
        const m = this.dataStore.getMember(selId);
        if (m) {
          const opt = document.createElement("option");
          opt.value = `SUBTREE:${selId}`;
          opt.textContent = `Nh\xE1nh C\u1EE5 ${m.full_name} (${m.id})`;
          opt.dataset.subtree = "1";
          selectExportScope.appendChild(opt);
          exportSubtreeHint.classList.remove("hidden");
          selectExportScope.value = `SUBTREE:${selId}`;
        }
      } else {
        exportSubtreeHint.classList.add("hidden");
        selectExportScope.value = "ALL";
      }
    };
    document.getElementById("btn-open-export").onclick = () => {
      refreshExportScopeSelector();
      modalExport.classList.remove("hidden");
      modalExport.querySelector(".modal-close").focus();
    };
    const getExportScope = () => selectExportScope.value || "ALL";
    const getExportDepth = () => {
      const val = document.getElementById("select-export-depth")?.value;
      return parseInt(val, 10) || 0;
    };
    const btnA4Pdf = document.getElementById("btn-export-a4-pdf");
    if (btnA4Pdf) {
      btnA4Pdf.onclick = () => {
        modalExport.classList.add("hidden");
        const scope = getExportScope();
        const template = document.getElementById("select-a4-template")?.value || "card";
        const maxDepth = getExportDepth();
        const templateLabel = template === "table" ? "B\u1EA3ng D\u1EEF Li\u1EC7u" : "C\xE2y D\u1ECDc";
        this.showToast(`\u0110ang t\u1EA1o file PDF A4 (${templateLabel})...`, "info");
        Exporter.exportA4PDF(this.canvas, scope, template, maxDepth);
      };
    }
    const btnPrintA4 = document.getElementById("btn-print-a4");
    if (btnPrintA4) {
      btnPrintA4.onclick = () => {
        modalExport.classList.add("hidden");
        const scope = getExportScope();
        const template = document.getElementById("select-a4-template")?.value || "card";
        const maxDepth = getExportDepth();
        Exporter.printA4(this.canvas, scope, template, maxDepth);
      };
    }
    const btnPdf = document.getElementById("btn-export-pdf");
    if (btnPdf) {
      btnPdf.onclick = () => {
        modalExport.classList.add("hidden");
        const scope = getExportScope();
        const maxDepth = getExportDepth();
        this.showToast("\u0110ang t\u1EA1o v\xE0 t\u1EA3i file PDF ch\u1EA5t l\u01B0\u1EE3ng cao...", "info");
        Exporter.exportPDF(this.canvas, scope, "AUTO", maxDepth);
      };
    }
    const btnPrint = document.getElementById("btn-print-tree");
    if (btnPrint) {
      btnPrint.onclick = () => {
        modalExport.classList.add("hidden");
        const scope = getExportScope();
        const maxDepth = getExportDepth();
        Exporter.printTree(this.canvas, scope, maxDepth);
      };
    }
    document.getElementById("btn-export-png").onclick = () => {
      modalExport.classList.add("hidden");
      const scope = getExportScope();
      const maxDepth = getExportDepth();
      this.showToast("\u0110ang t\u1EA1o v\xE0 t\u1EA3i \u1EA3nh PNG \u0111\u1ED9 n\xE9t cao...", "info");
      Exporter.exportPNG(this.canvas, scope, maxDepth);
    };
    document.getElementById("btn-export-svg").onclick = () => {
      const scope = getExportScope();
      const maxDepth = getExportDepth();
      Exporter.exportSVG(this.canvas, scope, maxDepth);
      modalExport.classList.add("hidden");
      this.showToast("\u0110ang t\u1EA3i file Vector SVG...", "success");
    };
    document.getElementById("btn-export-json").onclick = () => {
      Exporter.exportJSON(this.dataStore);
      modalExport.classList.add("hidden");
      this.showToast("\u0110\xE3 t\u1EA3i b\u1EA3n sao l\u01B0u JSON.", "success");
    };
  }
  // ─── Share Panel ───────────────────────────────────────────────────────────
  setupSharePanel() {
    const overlay = document.getElementById("share-panel-overlay");
    if (!overlay) return;
    const btnOpen = document.getElementById("btn-open-share");
    const btnClose = document.getElementById("btn-close-share-panel");
    const tabs = {
      link: document.getElementById("share-tab-link"),
      access: document.getElementById("share-tab-access"),
      pending: document.getElementById("share-tab-pending")
    };
    const contents = {
      link: document.getElementById("share-content-link"),
      access: document.getElementById("share-content-access"),
      pending: document.getElementById("share-content-pending")
    };
    const switchTab = (tab) => {
      Object.values(tabs).forEach((t) => {
        t.classList.remove("bg-white", "text-slate-900", "border-amber-500", "font-bold");
        t.classList.add("text-slate-500", "border-transparent", "font-semibold");
      });
      Object.values(contents).forEach((c) => c.classList.add("hidden"));
      tabs[tab].classList.add("bg-white", "text-slate-900", "border-amber-500", "font-bold");
      tabs[tab].classList.remove("text-slate-500", "border-transparent", "font-semibold");
      contents[tab].classList.remove("hidden");
      if (tab === "access") this.loadAccessList();
      if (tab === "pending") this.loadPendingChanges();
    };
    tabs.link.onclick = () => switchTab("link");
    tabs.access.onclick = () => switchTab("access");
    tabs.pending.onclick = () => switchTab("pending");
    btnOpen.onclick = () => {
      overlay.classList.remove("hidden");
      overlay.classList.add("flex");
      switchTab("link");
    };
    btnClose.onclick = () => {
      overlay.classList.add("hidden");
      overlay.classList.remove("flex");
    };
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.classList.add("hidden");
        overlay.classList.remove("flex");
      }
    };
    const ensureLineageId = async () => {
      if (this.lineageId) return this.lineageId;
      try {
        const res = await apiFetch("/api/auth/me", {
          headers: { "Authorization": "Bearer " + localStorage.getItem("session_token") }
        });
        if (res.ok) {
          const data = await res.json();
          this.lineageId = data.lineage_id;
          return this.lineageId;
        }
      } catch {
      }
      return null;
    };
    document.getElementById("btn-generate-share-link").onclick = async () => {
      const role = document.getElementById("share-link-role").value;
      const lineageId = await ensureLineageId();
      if (!lineageId) {
        this.showToast("Kh\xF4ng x\xE1c \u0111\u1ECBnh \u0111\u01B0\u1EE3c gia ph\u1EA3. Vui l\xF2ng \u0111\u0103ng nh\u1EADp l\u1EA1i.", "error");
        return;
      }
      try {
        const res = await apiFetch(`/api/lineage/${lineageId}/share-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + localStorage.getItem("session_token") },
          body: JSON.stringify({ role })
        });
        const data = await res.json();
        if (res.ok) {
          const token = data.share_link?.token || data.token;
          const url = shareUrl(token);
          document.getElementById("share-link-url").value = url;
          document.getElementById("share-link-result").classList.remove("hidden");
        } else {
          this.showToast(data.error || "T\u1EA1o link th\u1EA5t b\u1EA1i", "error");
        }
      } catch {
        this.showToast("L\u1ED7i k\u1EBFt n\u1ED1i m\xE1y ch\u1EE7", "error");
      }
    };
    document.getElementById("btn-copy-share-link").onclick = () => {
      const input = document.getElementById("share-link-url");
      input.select();
      navigator.clipboard.writeText(input.value);
      this.showToast("\u0110\xE3 copy link!", "success");
    };
    document.getElementById("btn-generate-share-code").onclick = async () => {
      const role = document.getElementById("share-code-role").value;
      const lineageId = await ensureLineageId();
      if (!lineageId) {
        this.showToast("Kh\xF4ng x\xE1c \u0111\u1ECBnh \u0111\u01B0\u1EE3c gia ph\u1EA3. Vui l\xF2ng \u0111\u0103ng nh\u1EADp l\u1EA1i.", "error");
        return;
      }
      try {
        const res = await apiFetch(`/api/lineage/${lineageId}/share-code`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + localStorage.getItem("session_token") },
          body: JSON.stringify({ role })
        });
        const data = await res.json();
        if (res.ok) {
          const code = data.share_code?.code || data.code;
          document.getElementById("share-code-value").value = code;
          document.getElementById("share-code-result").classList.remove("hidden");
        } else {
          this.showToast(data.error || "T\u1EA1o code th\u1EA5t b\u1EA1i", "error");
        }
      } catch {
        this.showToast("L\u1ED7i k\u1EBFt n\u1ED1i m\xE1y ch\u1EE7", "error");
      }
    };
    document.getElementById("btn-copy-share-code").onclick = () => {
      const input = document.getElementById("share-code-value");
      input.select();
      navigator.clipboard.writeText(input.value);
      this.showToast("\u0110\xE3 copy code!", "success");
    };
  }
  async loadAccessList() {
    const container = document.getElementById("access-list-container");
    if (!container) return;
    container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">\u0110ang t\u1EA3i...</p>';
    try {
      const res = await apiFetch(`/api/lineage/${this.lineageId}/access-list`, {
        headers: { "Authorization": "Bearer " + localStorage.getItem("session_token") }
      });
      const data = await res.json();
      if (!res.ok) {
        container.innerHTML = `<p class="text-xs text-red-500 text-center py-4">${data.error || "L\u1ED7i"}</p>`;
        return;
      }
      if (!data.access || data.access.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Ch\u01B0a c\xF3 ng\u01B0\u1EDDi d\xF9ng n\xE0o \u0111\u01B0\u1EE3c chia s\u1EBB.</p>';
        return;
      }
      container.innerHTML = "";
      const roleLabels = { admin: "Qu\u1EA3n tr\u1ECB", editor: "Ch\u1EC9nh s\u1EEDa", viewer: "Ch\u1EC9 xem" };
      const roleColors = { admin: "bg-red-100 text-red-700", editor: "bg-blue-100 text-blue-700", viewer: "bg-slate-100 text-slate-600" };
      for (const entry of data.access) {
        const div = document.createElement("div");
        div.className = "flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl";
        div.innerHTML = `
          <div class="flex items-center space-x-3">
            <span class="w-8 h-8 rounded-full bg-amber-100 text-amber-800 text-xs font-bold flex items-center justify-center">${(entry.username || "?")[0].toUpperCase()}</span>
            <div>
              <span class="text-xs font-semibold text-slate-800">${entry.username}</span>
              <span class="text-[10px] px-1.5 py-0.2 rounded-full ${roleColors[entry.role] || ""} ml-1">${roleLabels[entry.role] || entry.role}</span>
            </div>
          </div>
          <div class="flex items-center space-x-1">
            ${entry.role !== "admin" ? `
              <button class="upgrade-btn px-2 py-1 text-[10px] bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 font-medium" data-uid="${entry.user_id}">N\xE2ng</button>
            ` : ""}
            ${entry.role !== "admin" ? `
              <button class="remove-btn px-2 py-1 text-[10px] bg-rose-100 text-rose-700 rounded-lg hover:bg-rose-200 font-medium" data-uid="${entry.user_id}">X\xF3a</button>
            ` : ""}
          </div>
        `;
        container.appendChild(div);
      }
      container.querySelectorAll(".upgrade-btn").forEach((btn) => {
        btn.onclick = async () => {
          const uid = btn.dataset.uid;
          const entry = data.access.find((a) => a.user_id === uid);
          const nextRole = entry.role === "viewer" ? "editor" : "admin";
          try {
            const res2 = await apiFetch(`/api/lineage/${this.lineageId}/access/${uid}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", "Authorization": "Bearer " + localStorage.getItem("session_token") },
              body: JSON.stringify({ role: nextRole })
            });
            if (res2.ok) {
              this.showToast(`\u0110\xE3 n\xE2ng ${entry.username} l\xEAn ${roleLabels[nextRole]}`, "success");
              this.loadAccessList();
            } else {
              const err = await res2.json();
              this.showToast(err.error || "Th\u1EA5t b\u1EA1i", "error");
            }
          } catch {
            this.showToast("L\u1ED7i k\u1EBFt n\u1ED1i", "error");
          }
        };
      });
      container.querySelectorAll(".remove-btn").forEach((btn) => {
        btn.onclick = async () => {
          const uid = btn.dataset.uid;
          const entry = data.access.find((a) => a.user_id === uid);
          if (!confirm(`X\xF3a quy\u1EC1n truy c\u1EADp c\u1EE7a ${entry.username}?`)) return;
          try {
            const res2 = await apiFetch(`/api/lineage/${this.lineageId}/access/${uid}`, {
              method: "DELETE",
              headers: { "Authorization": "Bearer " + localStorage.getItem("session_token") }
            });
            if (res2.ok) {
              this.showToast(`\u0110\xE3 x\xF3a quy\u1EC1n c\u1EE7a ${entry.username}`, "success");
              this.loadAccessList();
            } else {
              const err = await res2.json();
              this.showToast(err.error || "Th\u1EA5t b\u1EA1i", "error");
            }
          } catch {
            this.showToast("L\u1ED7i k\u1EBFt n\u1ED1i", "error");
          }
        };
      });
    } catch {
      container.innerHTML = '<p class="text-xs text-red-500 text-center py-4">L\u1ED7i k\u1EBFt n\u1ED1i</p>';
    }
  }
  async loadPendingChanges() {
    const container = document.getElementById("pending-changes-container");
    if (!container) return;
    container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">\u0110ang t\u1EA3i...</p>';
    try {
      const res = await apiFetch(`/api/lineage/${this.lineageId}/pending-changes`, {
        headers: { "Authorization": "Bearer " + localStorage.getItem("session_token") }
      });
      const data = await res.json();
      if (!res.ok) {
        container.innerHTML = `<p class="text-xs text-red-500 text-center py-4">${data.error || "L\u1ED7i"}</p>`;
        return;
      }
      const badge = document.getElementById("share-pending-badge");
      if (badge) {
        badge.textContent = data.pending_changes?.length || 0;
        badge.classList.toggle("hidden", !data.pending_changes?.length);
      }
      if (!data.pending_changes || data.pending_changes.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Kh\xF4ng c\xF3 thay \u0111\u1ED5i n\xE0o ch\u1EDD ph\xEA duy\u1EC7t.</p>';
        return;
      }
      container.innerHTML = "";
      for (const change of data.pending_changes) {
        const div = document.createElement("div");
        div.className = "p-3 bg-slate-50 border border-slate-200 rounded-xl";
        const date = new Date(change.created_at).toLocaleString("vi-VN");
        let changeDetails = "";
        if (change.changes && change.changes.length > 0) {
          const fieldLabels = {
            full_name: "H\u1ECD v\xE0 T\xEAn",
            christian_name: "T\xEAn Th\xE1nh",
            gender: "Gi\u1EDBi T\xEDnh",
            birth_date: "Ng\xE0y Sinh",
            death_date: "Ng\xE0y M\u1EA5t",
            birth_place: "N\u01A1i Sinh",
            death_place: "N\u01A1i M\u1EA5t",
            occupation: "Ngh\u1EC1 Nghi\u1EC7p",
            spouse: "V\u1EE3/Ch\u1ED3ng",
            notes: "Ghi Ch\xFA",
            generation: "\u0110\u1EDDi",
            member_code: "M\xE3 Th\xE0nh Vi\xEAn",
            parent_id: "Cha M\u1EB9",
            spouse_id: "V\u1EE3/Ch\u1ED3ng"
          };
          changeDetails = '<div class="mt-2 space-y-1">';
          for (const c of change.changes) {
            const fieldName = fieldLabels[c.field] || c.field;
            const oldValue = c.old_value !== void 0 && c.old_value !== null ? String(c.old_value) : "(tr\u1ED1ng)";
            const newValue = c.new_value !== void 0 && c.new_value !== null ? String(c.new_value) : "(tr\u1ED1ng)";
            changeDetails += `
              <div class="text-[10px] bg-white rounded-lg p-2 border border-slate-100">
                <span class="font-semibold text-slate-700">${fieldName}:</span>
                <span class="text-red-500 line-through">${this.escapeHtml(oldValue)}</span>
                <span class="text-slate-400"> \u2192 </span>
                <span class="text-emerald-600 font-medium">${this.escapeHtml(newValue)}</span>
              </div>
            `;
          }
          changeDetails += "</div>";
        }
        div.innerHTML = `
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-semibold text-slate-800">Editor: ${change.editor_username || change.editor_id}</span>
            <span class="text-[10px] text-slate-400">${date}</span>
          </div>
          <p class="text-[11px] text-slate-600">${change.summary || `${change.changes?.length || 0} thay \u0111\u1ED5i`}</p>
          ${changeDetails}
          <div class="flex items-center space-x-2 mt-2">
            <button class="approve-pending-btn px-3 py-1 text-xs bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 font-medium" data-id="${change.id}">\u2713 Duy\u1EC7t</button>
            <button class="reject-pending-btn px-3 py-1 text-xs bg-rose-100 text-rose-700 rounded-lg hover:bg-rose-200 font-medium" data-id="${change.id}">\u2717 T\u1EEB ch\u1ED1i</button>
          </div>
        `;
        container.appendChild(div);
      }
      container.querySelectorAll(".approve-pending-btn").forEach((btn) => {
        btn.onclick = async () => {
          const id = btn.dataset.id;
          try {
            const res2 = await apiFetch(`/api/lineage/${this.lineageId}/pending-changes/${id}/approve`, {
              method: "PATCH",
              headers: { "Authorization": "Bearer " + localStorage.getItem("session_token") }
            });
            if (res2.ok) {
              this.showToast("\u0110\xE3 ph\xEA duy\u1EC7t thay \u0111\u1ED5i", "success");
              await this.loadInitialData();
              this.loadPendingChanges();
            } else {
              const err = await res2.json();
              this.showToast(err.error || "Th\u1EA5t b\u1EA1i", "error");
            }
          } catch {
            this.showToast("L\u1ED7i k\u1EBFt n\u1ED1i", "error");
          }
        };
      });
      container.querySelectorAll(".reject-pending-btn").forEach((btn) => {
        btn.onclick = async () => {
          const id = btn.dataset.id;
          const reason = prompt("L\xFD do t\u1EEB ch\u1ED1i (t\xF9y ch\u1ECDn):");
          try {
            const res2 = await apiFetch(`/api/lineage/${this.lineageId}/pending-changes/${id}/reject`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", "Authorization": "Bearer " + localStorage.getItem("session_token") },
              body: JSON.stringify({ reason: reason || "" })
            });
            if (res2.ok) {
              this.showToast("\u0110\xE3 t\u1EEB ch\u1ED1i thay \u0111\u1ED5i", "success");
              this.loadPendingChanges();
            } else {
              const err = await res2.json();
              this.showToast(err.error || "Th\u1EA5t b\u1EA1i", "error");
            }
          } catch {
            this.showToast("L\u1ED7i k\u1EBFt n\u1ED1i", "error");
          }
        };
      });
    } catch {
      container.innerHTML = '<p class="text-xs text-red-500 text-center py-4">L\u1ED7i k\u1EBFt n\u1ED1i</p>';
    }
  }
  // ─── Edit Request ──────────────────────────────────────────────────────────
  setupEditRequestModal() {
    const overlay = document.getElementById("edit-request-overlay");
    if (!overlay) return;
    const btnOpen = document.getElementById("btn-request-edit");
    const btnCancel = document.getElementById("btn-cancel-edit-request");
    const btnSubmit = document.getElementById("btn-submit-edit-request");
    const accountSection = document.getElementById("edit-request-account-section");
    const guestSection = document.getElementById("edit-request-guest-section");
    const accountLabel = document.getElementById("edit-request-account-label");
    const guestLabel = document.getElementById("edit-request-guest-label");
    const goLoginLink = document.getElementById("edit-request-go-login");
    const goCreateLink = document.getElementById("edit-request-go-create");
    const guestNameInput = document.getElementById("edit-request-guest-name");
    const reasonInput = document.getElementById("edit-request-reason");
    const accountReasonInput = document.getElementById("edit-request-account-reason");
    const errorEl = document.getElementById("edit-request-error");
    const accountForm = document.getElementById("edit-request-account-form");
    const accountLoginPrompt = document.getElementById("edit-request-account-login-prompt");
    const proposedAddListAccount = document.getElementById("proposed-add-list-account");
    const proposedEditListAccount = document.getElementById("proposed-edit-list-account");
    const proposedDeleteListAccount = document.getElementById("proposed-delete-list-account");
    const btnAddProposedAddAccount = document.getElementById("btn-add-proposed-add-account");
    const btnAddProposedEditAccount = document.getElementById("btn-add-proposed-edit-account");
    const btnAddProposedDeleteAccount = document.getElementById("btn-add-proposed-delete-account");
    const proposedAddList = document.getElementById("proposed-add-list");
    const proposedEditList = document.getElementById("proposed-edit-list");
    const proposedDeleteList = document.getElementById("proposed-delete-list");
    const btnAddProposedAdd = document.getElementById("btn-add-proposed-add");
    const btnAddProposedEdit = document.getElementById("btn-add-proposed-edit");
    const btnAddProposedDelete = document.getElementById("btn-add-proposed-delete");
    const radios = document.querySelectorAll('input[name="edit-request-mode"]');
    this._proposedAdd = [];
    this._proposedEdit = [];
    this._proposedDelete = [];
    const fieldOptions = [
      { value: "full_name", label: "H\u1ECD v\xE0 T\xEAn" },
      { value: "christian_name", label: "T\xEAn Th\xE1nh" },
      { value: "gender", label: "Gi\u1EDBi T\xEDnh" },
      { value: "birth_date", label: "Ng\xE0y Sinh" },
      { value: "death_date", label: "Ng\xE0y M\u1EA5t" },
      { value: "birth_place", label: "N\u01A1i Sinh" },
      { value: "death_place", label: "N\u01A1i M\u1EA5t" },
      { value: "occupation", label: "Ngh\u1EC1 Nghi\u1EC7p" },
      { value: "spouse", label: "V\u1EE3/Ch\u1ED3ng" },
      { value: "notes", label: "Ghi Ch\xFA" },
      { value: "generation", label: "\u0110\u1EDDi" }
    ];
    const hasSession = !!localStorage.getItem("session_token");
    btnOpen.onclick = () => {
      overlay.classList.remove("hidden");
      overlay.classList.add("flex");
      reasonInput.value = "";
      if (accountReasonInput) accountReasonInput.value = "";
      if (guestNameInput) guestNameInput.value = "";
      errorEl.classList.add("hidden");
      const trackedChanges = this.dataStore.getTrackedChanges();
      this._proposedAdd = [];
      this._proposedEdit = [];
      this._proposedDelete = [];
      for (const change of trackedChanges) {
        if (change.type === "add_member") {
          const m = change.new_value;
          this._proposedAdd.push({
            type: "add_member",
            new_value: { ...m },
            // Full member object for server
            member_name: m.full_name || m.id,
            member_code: m.id,
            parent_name: m.parent_name || null
          });
        } else if (change.type === "update_member") {
          const member = this.dataStore.getMember(change.member_id);
          const memberName = member ? member.full_name : change.member_id;
          for (const [key, newVal] of Object.entries(change.new_value)) {
            const oldVal = change.old_value ? change.old_value[key] : "";
            this._proposedEdit.push({
              type: "update_member",
              member_id: change.member_id,
              // For server
              member_name: memberName,
              member_code: change.member_id,
              field: key,
              oldValue: oldVal != null ? String(oldVal) : "",
              newValue: newVal != null ? String(newVal) : ""
            });
          }
        } else if (change.type === "delete_member") {
          const oldM = change.old_value;
          this._proposedDelete.push({
            type: "delete_member",
            member_id: change.member_id,
            // For server
            member_name: oldM ? oldM.full_name : change.member_id,
            member_code: change.member_id
          });
        }
      }
      renderGuestLists();
      renderAccountLists();
      if (hasSession) {
        radios.forEach((r) => r.checked = r.value === "account");
      } else {
        radios.forEach((r) => r.checked = r.value === "guest");
      }
      updateModeUI();
    };
    const updateModeUI = () => {
      const mode = document.querySelector('input[name="edit-request-mode"]:checked')?.value || "guest";
      if (mode === "account") {
        accountSection.classList.remove("hidden");
        guestSection.classList.add("hidden");
        accountLabel.classList.add("border-amber-400", "bg-amber-50");
        accountLabel.classList.remove("border-slate-200");
        guestLabel.classList.remove("border-amber-400", "bg-amber-50");
        guestLabel.classList.add("border-slate-200");
        if (hasSession && accountForm && accountLoginPrompt) {
          accountForm.classList.remove("hidden");
          accountLoginPrompt.classList.add("hidden");
          btnSubmit.disabled = false;
        } else if (accountForm && accountLoginPrompt) {
          accountForm.classList.add("hidden");
          accountLoginPrompt.classList.remove("hidden");
          btnSubmit.disabled = true;
        }
      } else {
        accountSection.classList.add("hidden");
        guestSection.classList.remove("hidden");
        btnSubmit.disabled = false;
        guestLabel.classList.add("border-amber-400", "bg-amber-50");
        guestLabel.classList.remove("border-slate-200");
        accountLabel.classList.remove("border-amber-400", "bg-amber-50");
        accountLabel.classList.add("border-slate-200");
      }
    };
    radios.forEach((radio) => {
      radio.onchange = updateModeUI;
    });
    if (goLoginLink) {
      goLoginLink.onclick = (e) => {
        e.preventDefault();
        overlay.classList.add("hidden");
        overlay.classList.remove("flex");
        const authOverlay = document.getElementById("auth-overlay");
        if (authOverlay) authOverlay.style.display = "flex";
        const loginForm = document.getElementById("auth-login-form");
        const createForm = document.getElementById("auth-create-form");
        const codeForm = document.getElementById("auth-code-form");
        if (loginForm) loginForm.classList.remove("hidden");
        if (createForm) createForm.classList.add("hidden");
        if (codeForm) codeForm.classList.add("hidden");
      };
    }
    if (goCreateLink) {
      goCreateLink.onclick = (e) => {
        e.preventDefault();
        overlay.classList.add("hidden");
        overlay.classList.remove("flex");
        const authOverlay = document.getElementById("auth-overlay");
        if (authOverlay) authOverlay.style.display = "flex";
        const loginForm = document.getElementById("auth-login-form");
        const createForm = document.getElementById("auth-create-form");
        const codeForm = document.getElementById("auth-code-form");
        if (loginForm) loginForm.classList.add("hidden");
        if (createForm) createForm.classList.remove("hidden");
        if (codeForm) codeForm.classList.add("hidden");
      };
    }
    btnCancel.onclick = () => {
      overlay.classList.add("hidden");
      overlay.classList.remove("flex");
    };
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.classList.add("hidden");
        overlay.classList.remove("flex");
      }
    };
    const renderGuestLists = () => {
      if (proposedAddList) {
        if (this._proposedAdd.length === 0) {
          proposedAddList.innerHTML = '<p class="text-[10px] text-slate-400 text-center py-2">Ch\u01B0a c\xF3 th\xE0nh vi\xEAn n\xE0o \u0111\u01B0\u1EE3c \u0111\u1EC1 xu\u1EA5t th\xEAm</p>';
        } else {
          proposedAddList.innerHTML = "";
          this._proposedAdd.forEach((item, idx) => {
            const el = document.createElement("div");
            el.className = "flex items-center justify-between gap-1 bg-emerald-50 border border-emerald-200 rounded-lg p-2";
            el.innerHTML = `
              <div class="flex-1 min-w-0">
                <span class="text-[10px] font-semibold text-emerald-700">${this.escapeHtml(item.member_name)}</span>
                ${item.member_code ? `<span class="text-[10px] text-slate-400"> (${this.escapeHtml(item.member_code)})</span>` : ""}
              </div>
              <button class="remove-proposed-item text-red-500 hover:text-red-700 text-xs px-1" data-idx="${idx}">\u2717</button>
            `;
            proposedAddList.appendChild(el);
          });
          proposedAddList.querySelectorAll(".remove-proposed-item").forEach((btn) => {
            btn.onclick = () => {
              this._proposedAdd.splice(parseInt(btn.dataset.idx), 1);
              renderGuestLists();
            };
          });
        }
      }
      if (proposedEditList) {
        if (this._proposedEdit.length === 0) {
          proposedEditList.innerHTML = '<p class="text-[10px] text-slate-400 text-center py-2">Ch\u01B0a c\xF3 thay \u0111\u1ED5i n\xE0o \u0111\u01B0\u1EE3c \u0111\u1EC1 xu\u1EA5t</p>';
        } else {
          proposedEditList.innerHTML = "";
          this._proposedEdit.forEach((item, idx) => {
            const fieldLabel = fieldOptions.find((f) => f.value === item.field)?.label || item.field;
            const el = document.createElement("div");
            el.className = "flex items-center justify-between gap-1 bg-amber-50 border border-amber-200 rounded-lg p-2";
            el.innerHTML = `
              <div class="flex-1 min-w-0">
                <span class="text-[10px] font-semibold text-slate-700">${this.escapeHtml(item.member_name)} \u2014 ${fieldLabel}:</span>
                <span class="text-[10px] text-red-500 line-through">${this.escapeHtml(item.oldValue)}</span>
                <span class="text-[10px] text-slate-400"> \u2192 </span>
                <span class="text-[10px] text-emerald-600 font-medium">${this.escapeHtml(item.newValue)}</span>
              </div>
              <button class="remove-proposed-item text-red-500 hover:text-red-700 text-xs px-1" data-idx="${idx}">\u2717</button>
            `;
            proposedEditList.appendChild(el);
          });
          proposedEditList.querySelectorAll(".remove-proposed-item").forEach((btn) => {
            btn.onclick = () => {
              this._proposedEdit.splice(parseInt(btn.dataset.idx), 1);
              renderGuestLists();
            };
          });
        }
      }
      if (proposedDeleteList) {
        if (this._proposedDelete.length === 0) {
          proposedDeleteList.innerHTML = '<p class="text-[10px] text-slate-400 text-center py-2">Ch\u01B0a c\xF3 th\xE0nh vi\xEAn n\xE0o \u0111\u01B0\u1EE3c \u0111\u1EC1 xu\u1EA5t xo\xE1</p>';
        } else {
          proposedDeleteList.innerHTML = "";
          this._proposedDelete.forEach((item, idx) => {
            const el = document.createElement("div");
            el.className = "flex items-center justify-between gap-1 bg-red-50 border border-red-200 rounded-lg p-2";
            el.innerHTML = `
              <div class="flex-1 min-w-0">
                <span class="text-[10px] font-semibold text-red-700">${this.escapeHtml(item.member_name)}</span>
                ${item.member_code ? `<span class="text-[10px] text-slate-400"> (${this.escapeHtml(item.member_code)})</span>` : ""}
              </div>
              <button class="remove-proposed-item text-red-500 hover:text-red-700 text-xs px-1" data-idx="${idx}">\u2717</button>
            `;
            proposedDeleteList.appendChild(el);
          });
          proposedDeleteList.querySelectorAll(".remove-proposed-item").forEach((btn) => {
            btn.onclick = () => {
              this._proposedDelete.splice(parseInt(btn.dataset.idx), 1);
              renderGuestLists();
            };
          });
        }
      }
    };
    if (btnAddProposedAdd) {
      btnAddProposedAdd.onclick = () => {
        const memberName = prompt("Nh\u1EADp t\xEAn th\xE0nh vi\xEAn c\u1EA7n th\xEAm (v\xED d\u1EE5: Tr\u1EA7n Ng\u1ECDc A):");
        if (!memberName) return;
        const memberCode = prompt("Nh\u1EADp m\xE3 th\xE0nh vi\xEAn (n\u1EBFu c\xF3, v\xED d\u1EE5: P001) \u2014 \u0111\u1EC3 tr\u1ED1ng n\u1EBFu kh\xF4ng bi\u1EBFt:");
        const parentName = prompt("Nh\u1EADp t\xEAn cha/m\u1EB9 (n\u1EBFu c\xF3) \u2014 \u0111\u1EC3 tr\u1ED1ng n\u1EBFu kh\xF4ng bi\u1EBFt:");
        this._proposedAdd.push({
          type: "add_member",
          member_name: memberName.trim(),
          member_code: memberCode ? memberCode.trim() : null,
          parent_name: parentName ? parentName.trim() : null
        });
        renderGuestLists();
      };
    }
    if (btnAddProposedEdit) {
      btnAddProposedEdit.onclick = () => {
        const memberName = prompt("Nh\u1EADp t\xEAn th\xE0nh vi\xEAn c\u1EA7n s\u1EEDa (v\xED d\u1EE5: Tr\u1EA7n Ng\u1ECDc A):");
        if (!memberName) return;
        const memberCode = prompt("Nh\u1EADp m\xE3 th\xE0nh vi\xEAn (n\u1EBFu c\xF3, v\xED d\u1EE5: P001) \u2014 \u0111\u1EC3 tr\u1ED1ng n\u1EBFu kh\xF4ng bi\u1EBFt:");
        const field = prompt("Nh\u1EADp t\xEAn tr\u01B0\u1EDDng c\u1EA7n s\u1EEDa (full_name, christian_name, gender, birth_date, death_date, birth_place, death_place, occupation, spouse, notes, generation):");
        if (!field) return;
        const fieldLabel = fieldOptions.find((f) => f.value === field)?.label || field;
        const oldValue = prompt(`Gi\xE1 tr\u1ECB hi\u1EC7n t\u1EA1i c\u1EE7a ${fieldLabel}:`);
        if (oldValue === null) return;
        const newValue = prompt(`Gi\xE1 tr\u1ECB m\u1EDBi c\u1EE7a ${fieldLabel}:`);
        if (newValue === null) return;
        this._proposedEdit.push({
          type: "update_member",
          member_name: memberName.trim(),
          member_code: memberCode ? memberCode.trim() : null,
          field: field.trim(),
          oldValue: oldValue || "",
          newValue: newValue || ""
        });
        renderGuestLists();
      };
    }
    if (btnAddProposedDelete) {
      btnAddProposedDelete.onclick = () => {
        const memberName = prompt("Nh\u1EADp t\xEAn th\xE0nh vi\xEAn c\u1EA7n xo\xE1 (v\xED d\u1EE5: Tr\u1EA7n Ng\u1ECDc A):");
        if (!memberName) return;
        const memberCode = prompt("Nh\u1EADp m\xE3 th\xE0nh vi\xEAn (n\u1EBFu c\xF3, v\xED d\u1EE5: P001) \u2014 \u0111\u1EC3 tr\u1ED1ng n\u1EBFu kh\xF4ng bi\u1EBFt:");
        this._proposedDelete.push({
          type: "delete_member",
          member_name: memberName.trim(),
          member_code: memberCode ? memberCode.trim() : null
        });
        renderGuestLists();
      };
    }
    const renderAccountLists = () => {
      if (proposedAddListAccount) {
        if (this._proposedAdd.length === 0) {
          proposedAddListAccount.innerHTML = '<p class="text-[10px] text-slate-400 text-center py-2">Ch\u01B0a c\xF3 th\xE0nh vi\xEAn n\xE0o \u0111\u01B0\u1EE3c \u0111\u1EC1 xu\u1EA5t th\xEAm</p>';
        } else {
          proposedAddListAccount.innerHTML = "";
          this._proposedAdd.forEach((item, idx) => {
            const el = document.createElement("div");
            el.className = "flex items-center justify-between gap-1 bg-emerald-50 border border-emerald-200 rounded-lg p-2";
            el.innerHTML = `
              <div class="flex-1 min-w-0">
                <span class="text-[10px] font-semibold text-emerald-700">${this.escapeHtml(item.member_name)}</span>
                ${item.member_code ? `<span class="text-[10px] text-slate-400"> (${this.escapeHtml(item.member_code)})</span>` : ""}
              </div>
              <button class="remove-proposed-item text-red-500 hover:text-red-700 text-xs px-1" data-idx="${idx}">\u2717</button>
            `;
            proposedAddListAccount.appendChild(el);
          });
          proposedAddListAccount.querySelectorAll(".remove-proposed-item").forEach((btn) => {
            btn.onclick = () => {
              this._proposedAdd.splice(parseInt(btn.dataset.idx), 1);
              renderAccountLists();
            };
          });
        }
      }
      if (proposedEditListAccount) {
        if (this._proposedEdit.length === 0) {
          proposedEditListAccount.innerHTML = '<p class="text-[10px] text-slate-400 text-center py-2">Ch\u01B0a c\xF3 thay \u0111\u1ED5i n\xE0o \u0111\u01B0\u1EE3c \u0111\u1EC1 xu\u1EA5t</p>';
        } else {
          proposedEditListAccount.innerHTML = "";
          this._proposedEdit.forEach((item, idx) => {
            const fieldLabel = fieldOptions.find((f) => f.value === item.field)?.label || item.field;
            const el = document.createElement("div");
            el.className = "flex items-center justify-between gap-1 bg-amber-50 border border-amber-200 rounded-lg p-2";
            el.innerHTML = `
              <div class="flex-1 min-w-0">
                <span class="text-[10px] font-semibold text-slate-700">${this.escapeHtml(item.member_name)} \u2014 ${fieldLabel}:</span>
                <span class="text-[10px] text-red-500 line-through">${this.escapeHtml(item.oldValue)}</span>
                <span class="text-[10px] text-slate-400"> \u2192 </span>
                <span class="text-[10px] text-emerald-600 font-medium">${this.escapeHtml(item.newValue)}</span>
              </div>
              <button class="remove-proposed-item text-red-500 hover:text-red-700 text-xs px-1" data-idx="${idx}">\u2717</button>
            `;
            proposedEditListAccount.appendChild(el);
          });
          proposedEditListAccount.querySelectorAll(".remove-proposed-item").forEach((btn) => {
            btn.onclick = () => {
              this._proposedEdit.splice(parseInt(btn.dataset.idx), 1);
              renderAccountLists();
            };
          });
        }
      }
      if (proposedDeleteListAccount) {
        if (this._proposedDelete.length === 0) {
          proposedDeleteListAccount.innerHTML = '<p class="text-[10px] text-slate-400 text-center py-2">Ch\u01B0a c\xF3 th\xE0nh vi\xEAn n\xE0o \u0111\u01B0\u1EE3c \u0111\u1EC1 xu\u1EA5t xo\xE1</p>';
        } else {
          proposedDeleteListAccount.innerHTML = "";
          this._proposedDelete.forEach((item, idx) => {
            const el = document.createElement("div");
            el.className = "flex items-center justify-between gap-1 bg-red-50 border border-red-200 rounded-lg p-2";
            el.innerHTML = `
              <div class="flex-1 min-w-0">
                <span class="text-[10px] font-semibold text-red-700">${this.escapeHtml(item.member_name)}</span>
                ${item.member_code ? `<span class="text-[10px] text-slate-400"> (${this.escapeHtml(item.member_code)})</span>` : ""}
              </div>
              <button class="remove-proposed-item text-red-500 hover:text-red-700 text-xs px-1" data-idx="${idx}">\u2717</button>
            `;
            proposedDeleteListAccount.appendChild(el);
          });
          proposedDeleteListAccount.querySelectorAll(".remove-proposed-item").forEach((btn) => {
            btn.onclick = () => {
              this._proposedDelete.splice(parseInt(btn.dataset.idx), 1);
              renderAccountLists();
            };
          });
        }
      }
    };
    if (btnAddProposedAddAccount) {
      btnAddProposedAddAccount.onclick = () => {
        const memberName = prompt("Nh\u1EADp t\xEAn th\xE0nh vi\xEAn c\u1EA7n th\xEAm (v\xED d\u1EE5: Tr\u1EA7n Ng\u1ECDc A):");
        if (!memberName) return;
        const memberCode = prompt("Nh\u1EADp m\xE3 th\xE0nh vi\xEAn (n\u1EBFu c\xF3, v\xED d\u1EE5: P001) \u2014 \u0111\u1EC3 tr\u1ED1ng n\u1EBFu kh\xF4ng bi\u1EBFt:");
        const parentName = prompt("Nh\u1EADp t\xEAn cha/m\u1EB9 (n\u1EBFu c\xF3) \u2014 \u0111\u1EC3 tr\u1ED1ng n\u1EBFu kh\xF4ng bi\u1EBFt:");
        this._proposedAdd.push({
          type: "add_member",
          member_name: memberName.trim(),
          member_code: memberCode ? memberCode.trim() : null,
          parent_name: parentName ? parentName.trim() : null
        });
        renderAccountLists();
      };
    }
    if (btnAddProposedEditAccount) {
      btnAddProposedEditAccount.onclick = () => {
        const memberName = prompt("Nh\u1EADp t\xEAn th\xE0nh vi\xEAn c\u1EA7n s\u1EEDa (v\xED d\u1EE5: Tr\u1EA7n Ng\u1ECDc A):");
        if (!memberName) return;
        const memberCode = prompt("Nh\u1EADp m\xE3 th\xE0nh vi\xEAn (n\u1EBFu c\xF3, v\xED d\u1EE5: P001) \u2014 \u0111\u1EC3 tr\u1ED1ng n\u1EBFu kh\xF4ng bi\u1EBFt:");
        const field = prompt("Nh\u1EADp t\xEAn tr\u01B0\u1EDDng c\u1EA7n s\u1EEDa (full_name, christian_name, gender, birth_date, death_date, birth_place, death_place, occupation, spouse, notes, generation):");
        if (!field) return;
        const fieldLabel = fieldOptions.find((f) => f.value === field)?.label || field;
        const oldValue = prompt(`Gi\xE1 tr\u1ECB hi\u1EC7n t\u1EA1i c\u1EE7a ${fieldLabel}:`);
        if (oldValue === null) return;
        const newValue = prompt(`Gi\xE1 tr\u1ECB m\u1EDBi c\u1EE7a ${fieldLabel}:`);
        if (newValue === null) return;
        this._proposedEdit.push({
          type: "update_member",
          member_name: memberName.trim(),
          member_code: memberCode ? memberCode.trim() : null,
          field: field.trim(),
          oldValue: oldValue || "",
          newValue: newValue || ""
        });
        renderAccountLists();
      };
    }
    if (btnAddProposedDeleteAccount) {
      btnAddProposedDeleteAccount.onclick = () => {
        const memberName = prompt("Nh\u1EADp t\xEAn th\xE0nh vi\xEAn c\u1EA7n xo\xE1 (v\xED d\u1EE5: Tr\u1EA7n Ng\u1ECDc A):");
        if (!memberName) return;
        const memberCode = prompt("Nh\u1EADp m\xE3 th\xE0nh vi\xEAn (n\u1EBFu c\xF3, v\xED d\u1EE5: P001) \u2014 \u0111\u1EC3 tr\u1ED1ng n\u1EBFu kh\xF4ng bi\u1EBFt:");
        this._proposedDelete.push({
          type: "delete_member",
          member_name: memberName.trim(),
          member_code: memberCode ? memberCode.trim() : null
        });
        renderAccountLists();
      };
    }
    btnSubmit.onclick = async () => {
      const mode = document.querySelector('input[name="edit-request-mode"]:checked')?.value || "guest";
      const guestName = guestNameInput ? guestNameInput.value.trim() : "";
      let reason = "";
      if (mode === "account") {
        reason = accountReasonInput ? accountReasonInput.value.trim() : "";
      } else {
        reason = reasonInput.value.trim();
      }
      if (!reason) {
        errorEl.textContent = "L\xFD do kh\xF4ng \u0111\u01B0\u1EE3c \u0111\u1EC3 tr\u1ED1ng";
        errorEl.classList.remove("hidden");
        return;
      }
      errorEl.classList.add("hidden");
      try {
        const proposedChanges = [
          ...this._proposedAdd.map((a) => ({
            type: "add_member",
            new_value: a.new_value || null,
            // Full member object for server
            member_name: a.member_name || null,
            member_code: a.member_code || null
          })),
          ...this._proposedEdit.map((e) => ({
            type: "update_member",
            member_id: e.member_id || null,
            // For server to find member
            member_name: e.member_name || null,
            member_code: e.member_code || null,
            field: e.field,
            old_value: e.oldValue,
            new_value: e.newValue
          })),
          ...this._proposedDelete.map((d) => ({
            type: "delete_member",
            member_id: d.member_id || null,
            // For server to find member
            member_name: d.member_name || null,
            member_code: d.member_code || null
          }))
        ];
        let body;
        let headers = { "Content-Type": "application/json" };
        if (mode === "account" && hasSession) {
          const sessionToken = localStorage.getItem("session_token");
          headers["Authorization"] = "Bearer " + sessionToken;
          body = JSON.stringify({
            is_guest: false,
            title: reason,
            proposed_changes: proposedChanges
          });
        } else {
          body = JSON.stringify({
            is_guest: true,
            title: reason,
            guest_name: guestName || this.currentUser?.username || "Kh\xE1ch",
            proposed_changes: proposedChanges
          });
        }
        const res = await apiFetch(`/api/lineage/${this.lineageId}/edit-requests`, {
          method: "POST",
          headers,
          body
        });
        const data = await res.json();
        if (res.ok) {
          overlay.classList.add("hidden");
          overlay.classList.remove("flex");
          this.showToast("\u0110\xE3 g\u1EEDi y\xEAu c\u1EA7u ch\u1EC9nh s\u1EEDa. Admin s\u1EBD xem x\xE9t.", "success");
        } else {
          errorEl.textContent = data.error || "Th\u1EA5t b\u1EA1i";
          errorEl.classList.remove("hidden");
        }
      } catch {
        errorEl.textContent = "L\u1ED7i k\u1EBFt n\u1ED1i";
        errorEl.classList.remove("hidden");
      }
    };
  }
  // ─── Notification System ───────────────────────────────────────────────────
  setupNotificationBell() {
    const bellWrapper = document.getElementById("notification-bell-wrapper");
    const bellBtn = document.getElementById("btn-notification-bell");
    const dropdown = document.getElementById("notification-dropdown");
    const badge = document.getElementById("notification-badge");
    const listEl = document.getElementById("notification-list");
    const countEl = document.getElementById("notification-count");
    if (!bellWrapper || !bellBtn) return;
    if (this.userRole !== "admin") {
      bellWrapper.classList.add("hidden");
      bellWrapper.classList.remove("flex");
      return;
    }
    bellWrapper.classList.remove("hidden");
    bellWrapper.classList.add("flex");
    bellBtn.onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("hidden");
      if (!dropdown.classList.contains("hidden")) {
        this.loadEditRequests();
      }
    };
    document.addEventListener("click", (e) => {
      if (!dropdown.contains(e.target) && !bellBtn.contains(e.target)) {
        dropdown.classList.add("hidden");
      }
    });
    this.loadEditRequests();
    if (this._notifPollTimer) clearInterval(this._notifPollTimer);
    this._notifPollTimer = setInterval(() => {
      this.loadEditRequests();
    }, 15e3);
  }
  async loadEditRequests() {
    const badge = document.getElementById("notification-badge");
    const listEl = document.getElementById("notification-list");
    const countEl = document.getElementById("notification-count");
    if (!listEl || !this.lineageId) return;
    try {
      const sessionToken = localStorage.getItem("session_token");
      if (!sessionToken) return;
      const res = await apiFetch(`/api/lineage/${this.lineageId}/edit-requests`, {
        headers: { "Authorization": "Bearer " + sessionToken }
      });
      if (!res.ok) return;
      const data = await res.json();
      const pending = (data.edit_requests || []).filter((er) => er.status === "pending");
      if (pending.length > 0) {
        badge.textContent = pending.length;
        badge.classList.remove("hidden");
        badge.classList.add("flex");
      } else {
        badge.classList.add("hidden");
        badge.classList.remove("flex");
      }
      if (countEl) countEl.textContent = `${pending.length} y\xEAu c\u1EA7u`;
      if (pending.length === 0) {
        listEl.innerHTML = '<div class="p-4 text-center text-xs text-slate-400">Kh\xF4ng c\xF3 y\xEAu c\u1EA7u n\xE0o.</div>';
        return;
      }
      listEl.innerHTML = "";
      const fieldLabels = {
        full_name: "H\u1ECD v\xE0 T\xEAn",
        christian_name: "T\xEAn Th\xE1nh",
        gender: "Gi\u1EDBi T\xEDnh",
        birth_date: "Ng\xE0y Sinh",
        death_date: "Ng\xE0y M\u1EA5t",
        birth_place: "N\u01A1i Sinh",
        death_place: "N\u01A1i M\u1EA5t",
        occupation: "Ngh\u1EC1 Nghi\u1EC7p",
        spouse: "V\u1EE3/Ch\u1ED3ng",
        notes: "Ghi Ch\xFA",
        generation: "\u0110\u1EDDi",
        member_code: "M\xE3 Th\xE0nh Vi\xEAn"
      };
      for (const er of pending) {
        const div = document.createElement("div");
        div.className = "px-3 py-2.5 border-b border-slate-50 hover:bg-slate-50 transition-colors";
        const time = new Date(er.created_at).toLocaleString("vi-VN");
        const requester = er.is_guest ? `Kh\xE1ch: ${er.requester_name || "Kh\xF4ng t\xEAn"}` : er.requester_username || "Unknown";
        let proposedChangesHtml = "";
        if (er.proposed_changes && er.proposed_changes.length > 0) {
          proposedChangesHtml = '<div class="mt-1.5 space-y-0.5">';
          for (const c of er.proposed_changes) {
            const fieldName = fieldLabels[c.field] || c.field;
            const memberInfo = c.member_name ? `(${c.member_name})` : "";
            const oldValue = c.old_value !== void 0 && c.old_value !== null ? String(c.old_value) : "(tr\u1ED1ng)";
            const newValue = c.new_value !== void 0 && c.new_value !== null ? String(c.new_value) : "(tr\u1ED1ng)";
            proposedChangesHtml += `
              <div class="text-[10px] bg-white rounded p-1.5 border border-slate-100">
                <span class="font-semibold text-slate-700">${fieldName}${memberInfo}:</span>
                <span class="text-red-500 line-through">${this.escapeHtml(oldValue)}</span>
                <span class="text-slate-400"> \u2192 </span>
                <span class="text-emerald-600 font-medium">${this.escapeHtml(newValue)}</span>
              </div>
            `;
          }
          proposedChangesHtml += "</div>";
        }
        div.innerHTML = `
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <p class="text-xs font-semibold text-slate-800 truncate">${this.escapeHtml(er.title)}</p>
              <p class="text-[10px] text-slate-500">${requester} \u2022 ${time}</p>
              ${er.description ? `<p class="text-[10px] text-slate-400 mt-0.5 truncate">${this.escapeHtml(er.description)}</p>` : ""}
              ${proposedChangesHtml}
            </div>
            <div class="flex items-center space-x-1 flex-shrink-0">
              <button class="approve-edit-req px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold transition-colors" data-id="${er.id}">\u2713</button>
              <button class="reject-edit-req px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-700 rounded text-[10px] font-bold transition-colors" data-id="${er.id}">\u2717</button>
            </div>
          </div>
        `;
        listEl.appendChild(div);
      }
      listEl.querySelectorAll(".approve-edit-req").forEach((btn) => {
        btn.onclick = () => this.approveEditRequest(btn.dataset.id);
      });
      listEl.querySelectorAll(".reject-edit-req").forEach((btn) => {
        btn.onclick = () => this.rejectEditRequest(btn.dataset.id);
      });
    } catch (err) {
      console.error("Failed to load edit requests:", err);
    }
  }
  async approveEditRequest(requestId) {
    try {
      const sessionToken = localStorage.getItem("session_token");
      const res = await apiFetch(`/api/lineage/${this.lineageId}/edit-requests/${requestId}/approve`, {
        method: "PATCH",
        headers: { "Authorization": "Bearer " + sessionToken }
      });
      if (res.ok) {
        this.showToast("\u0110\xE3 ch\u1EA5p nh\u1EADn y\xEAu c\u1EA7u ch\u1EC9nh s\u1EEDa.", "success");
        await this.loadInitialData();
        this.loadEditRequests();
      }
    } catch (err) {
      this.showToast("L\u1ED7i k\u1EBFt n\u1ED1i", "error");
    }
  }
  async rejectEditRequest(requestId) {
    const reason = prompt("L\xFD do t\u1EEB ch\u1ED1i (t\xF9y ch\u1ECDn):");
    try {
      const sessionToken = localStorage.getItem("session_token");
      const res = await apiFetch(`/api/lineage/${this.lineageId}/edit-requests/${requestId}/reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + sessionToken },
        body: JSON.stringify({ reason: reason || "" })
      });
      if (res.ok) {
        this.showToast("\u0110\xE3 t\u1EEB ch\u1ED1i y\xEAu c\u1EA7u ch\u1EC9nh s\u1EEDa.", "success");
        this.loadEditRequests();
      }
    } catch (err) {
      this.showToast("L\u1ED7i k\u1EBFt n\u1ED1i", "error");
    }
  }
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
  // ─── User Display ──────────────────────────────────────────────────────────
  updateUserDisplay() {
    const display = document.getElementById("user-display");
    const avatar = document.getElementById("user-avatar");
    const username = document.getElementById("user-username");
    const roleBadge = document.getElementById("user-role-badge");
    if (!display || !this.currentUser) return;
    display.classList.remove("hidden");
    display.classList.add("flex");
    avatar.textContent = (this.currentUser.username || "U")[0].toUpperCase();
    username.textContent = this.currentUser.username;
    const roleLabels = { admin: "Qu\u1EA3n tr\u1ECB", editor: "Ch\u1EC9nh s\u1EEDa", viewer: "Ch\u1EC9 xem" };
    const roleColors = {
      admin: "bg-red-100 text-red-700",
      editor: "bg-blue-100 text-blue-700",
      viewer: "bg-slate-100 text-slate-600"
    };
    roleBadge.textContent = roleLabels[this.userRole] || this.userRole;
    roleBadge.className = `text-[9px] px-1.5 py-0.2 rounded-full font-medium ${roleColors[this.userRole] || ""}`;
  }
  setupLogout() {
    const btn = document.getElementById("btn-logout");
    if (!btn) return;
    btn.onclick = async () => {
      if (!confirm("B\u1EA1n c\xF3 ch\u1EAFc mu\u1ED1n \u0111\u0103ng xu\u1EA5t?")) return;
      try {
        await apiFetch("/api/auth/logout", {
          method: "POST",
          headers: { "Authorization": "Bearer " + localStorage.getItem("session_token") }
        });
      } catch {
      }
      if (this._notifPollTimer) {
        clearInterval(this._notifPollTimer);
        this._notifPollTimer = null;
      }
      localStorage.removeItem("session_token");
      this.isAuthenticated = false;
      this.userRole = null;
      this.currentUser = null;
      this.lineageId = null;
      const display = document.getElementById("user-display");
      if (display) {
        display.classList.add("hidden");
        display.classList.remove("flex");
      }
      const notifDropdown = document.getElementById("notification-dropdown");
      if (notifDropdown) notifDropdown.classList.add("hidden");
      const bellWrapper = document.getElementById("notification-bell-wrapper");
      if (bellWrapper) {
        bellWrapper.classList.add("hidden");
        bellWrapper.classList.remove("flex");
      }
      const overlay = document.getElementById("auth-overlay");
      if (overlay) overlay.style.display = "flex";
      const loginForm = document.getElementById("auth-login-form");
      const createForm = document.getElementById("auth-create-form");
      const codeForm = document.getElementById("auth-code-form");
      if (loginForm) loginForm.classList.remove("hidden");
      if (createForm) createForm.classList.add("hidden");
      if (codeForm) codeForm.classList.add("hidden");
      this.showToast("\u0110\xE3 \u0111\u0103ng xu\u1EA5t th\xE0nh c\xF4ng.", "success");
    };
  }
  setupSearch() {
    const searchInput = document.getElementById("global-search");
    searchInput.oninput = (e) => {
      const normalize = (text) => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();
      const q = normalize(e.target.value.trim());
      if (!q) {
        document.getElementById("search-status").textContent = "";
        return;
      }
      const match = this.dataStore.getAllMembers().find(
        (m) => normalize(m.full_name).includes(q) || normalize(m.christian_name).includes(q) || normalize(m.id) === q
      );
      if (match) {
        this.dataStore.selectMember(match.id);
        window.dispatchEvent(new CustomEvent("node-selected-for-inspector", { detail: match.id }));
      }
      document.getElementById("search-status").textContent = match ? `\u0110\xE3 t\xECm th\u1EA5y ${match.full_name}` : "Kh\xF4ng t\xECm th\u1EA5y th\xE0nh vi\xEAn";
    };
  }
  revealMemberOnTree(memberId) {
    if (!this.dataStore.getMember(memberId)) return;
    if (!this.canvas.layoutData?.positions.has(memberId)) {
      this.canvas.activeFilter = "ALL";
      document.getElementById("select-branch-filter").value = "ALL";
      this.canvas.render();
    }
    document.getElementById("left-menu-pane").classList.remove("drawer-open");
    document.getElementById("left-menu-backdrop").classList.remove("drawer-open");
    this.dataStore.selectMember(memberId);
    this.populateInspector(memberId);
    requestAnimationFrame(() => this.canvas.focusOnMember(memberId));
  }
  setupHeaderMenus() {
    if (this.headerMenusReady) return;
    this.headerMenusReady = true;
    const menus = [...document.querySelectorAll(".header-menu")];
    const close = () => menus.forEach((menu) => {
      menu.classList.remove("is-open");
      menu.firstElementChild.setAttribute("aria-expanded", "false");
    });
    menus.forEach((menu) => {
      const button = menu.firstElementChild;
      button.onclick = () => {
        const open = !menu.classList.contains("is-open");
        close();
        menu.classList.toggle("is-open", open);
        button.setAttribute("aria-expanded", String(open));
      };
      menu.querySelector(".dropdown-menu").addEventListener("click", close);
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".header-menu")) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
  }
  setupLineageTitle() {
    const titleEl = document.getElementById("lineage-title");
    titleEl.ondblclick = () => {
      const current = this.dataStore.lineageInfo.name;
      const newName = prompt("Nh\u1EADp t\xEAn D\xF2ng H\u1ECD / Chi Nh\xE1nh:", current);
      if (newName && newName.trim()) {
        this.dataStore.lineageInfo.name = newName.trim();
        titleEl.textContent = newName.trim();
        this.showToast("\u0110\xE3 \u0111\u1ED5i t\xEAn d\xF2ng h\u1ECD.", "info");
      }
    };
  }
  showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px) scale(0.95)";
      setTimeout(() => toast.remove(), 250);
    }, 3e3);
  }
};
document.addEventListener("DOMContentLoaded", () => {
  new App();
});
