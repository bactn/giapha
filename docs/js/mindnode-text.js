// mindnode-text.js - MindNode-style Text/Outline Tree Editor with Clean SVG Icons
import { spouseRole } from './member-presentation.js';
export class MindNodeTextEditor {
  constructor(container, dataStore) {
    this.container = container;
    this.dataStore = dataStore;
    this.collapsedNodes = new Set();
    this.draggedNodeId = null;

    this.init();
  }

  init() {
    this.dataStore.subscribe((event, data) => {
      if (['load', 'add', 'update', 'delete', 'undo', 'redo'].includes(event)) {
        this.render();
      } else if (event === 'select') {
        this.revealSelected(data);
      }
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

      const selectedId = this.dataStore.selectedMemberId;
      if (!selectedId) return;

      // Tab: Add Child
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        this.addChildTo(selectedId);
      }
      // Enter: Add Sibling
      else if (e.key === 'Enter') {
        e.preventDefault();
        this.addSiblingTo(selectedId);
      }
      // Shift + Tab: Outdent
      else if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        this.outdent(selectedId);
      }
      // Delete or Backspace: Remove selected node
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.deleteNode(selectedId);
      }
    });
  }

  render() {
    this.container.innerHTML = '';
    const roots = this.dataStore.getRootMembers();

    if (roots.length === 0) {
      this.container.innerHTML = `
        <div class="p-6 text-center text-xs text-slate-400">
          Chưa có thành viên nào. Bấm <strong>+ Cụ Tổ Mới</strong> để bắt đầu.
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const root of roots) {
      this.renderTreeNode(root, 0, fragment);
    }
    this.container.appendChild(fragment);

    const badge = document.getElementById('outline-count-badge');
    if (badge) badge.textContent = this.dataStore.members.size;

    this.highlightSelected(this.dataStore.selectedMemberId);
  }

  renderTreeNode(member, depth, parentElement) {
    const children = this.dataStore.getChildren(member.id);
    const hasChildren = children.length > 0;
    const isCollapsed = this.collapsedNodes.has(member.id);

    const nodeWrapper = document.createElement('div');
    nodeWrapper.className = 'outline-node-wrapper group';
    nodeWrapper.dataset.id = member.id;

    const row = document.createElement('div');
    row.className = 'outline-node-row';
    row.style.paddingLeft = `${depth * 14 + 4}px`;
    row.draggable = true;

    // Toggle Chevron Caret SVG
    const toggle = document.createElement('button');
    toggle.className = 'outline-toggle-btn';
    if (hasChildren) {
      toggle.type = 'button';
      toggle.title = `${isCollapsed ? 'Mở rộng' : 'Thu gọn'} nhánh ${member.full_name}`;
      toggle.setAttribute('aria-label',toggle.title);
      toggle.setAttribute('aria-expanded',String(!isCollapsed));
      toggle.innerHTML = isCollapsed
        ? `<svg class="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>`
        : `<svg class="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>`;
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
      toggle.disabled = true; toggle.setAttribute('aria-hidden','true');
      toggle.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block"></span>`;
    }
    row.appendChild(toggle);

    // Generation Badge
    const genBadge = document.createElement('span');
    genBadge.className = 'text-[9px] font-mono px-1 py-0.2 rounded bg-slate-100 text-slate-600 mr-1.5 font-bold flex-shrink-0';
    genBadge.textContent = `Đ${member.generation}`;
    row.appendChild(genBadge);

    // Title / Name with Christian Name
    const title = document.createElement('span');
    title.className = 'outline-node-title';
    let label = member.full_name;
    if (member.christian_name) {
      label = `[${member.christian_name}] ${member.full_name}`;
    }
    if (member.role === 'Đích Tôn') {
      label = `👑 ${label}`;
    }
    title.textContent = label;
    title.title = "Bấm đúp để sửa tên";
    row.appendChild(title);

    // Spouse indicator inline (⚭ Spouse Name)
    const spouseMember = this.dataStore.getSpouseMember(member.id);
    if (spouseMember) {
      const spouseLabel = document.createElement('span');
      spouseLabel.className = 'outline-spouse-label';
      spouseLabel.textContent = ` ${spouseRole(member,spouseMember)}: ${spouseMember.full_name}`;
      spouseLabel.title = `Phối ngẫu: ${spouseMember.full_name} (${spouseMember.id})`;
      row.appendChild(spouseLabel);
    }

    // Action buttons container (visible on hover)
    const actionGroup = document.createElement('div');
    actionGroup.className = 'flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1';

    // Quick add child hover button (+)
    const addBtn = document.createElement('button');
    addBtn.className = 'w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-amber-700 hover:bg-amber-50';
    addBtn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>`;
    addBtn.title = 'Thêm con';
    addBtn.onclick = (e) => {
      e.stopPropagation();
      this.addChildTo(member.id);
    };
    actionGroup.appendChild(addBtn);

    // Quick add spouse hover button (⚭)
    const addSpouseBtn = document.createElement('button');
    addSpouseBtn.className = 'w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50';
    addSpouseBtn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>`;
    addSpouseBtn.title = 'Thêm vợ/chồng';
    addSpouseBtn.onclick = (e) => {
      e.stopPropagation();
      this.addSpouseTo(member.id);
    };
    actionGroup.appendChild(addSpouseBtn);

    // DIRECT DELETE BUTTON (✕)
    const delBtn = document.createElement('button');
    delBtn.className = 'w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50';
    delBtn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`;
    delBtn.title = 'Xóa người này';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      this.deleteNode(member.id);
    };
    actionGroup.appendChild(delBtn);

    row.appendChild(actionGroup);

    // Selection click
    row.onclick = () => {
      this.dataStore.selectMember(member.id);
      window.dispatchEvent(new CustomEvent('node-selected-for-inspector', { detail: member.id }));
    };

    // Double click to inline rename (MindNode behavior)
    row.ondblclick = (e) => {
      e.stopPropagation();
      this.startInlineRename(row, title, member);
    };

    // Drag and Drop (Reordering & Reparenting)
    this.setupDragEvents(row, member.id);

    nodeWrapper.appendChild(row);

    // Render children if not collapsed
    if (hasChildren && !isCollapsed) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'outline-children-group';
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
      e.dataTransfer.setData('text/plain', memberId);
      row.style.opacity = '0.5';
    };

    row.ondragend = () => {
      row.style.opacity = '1';
      document.querySelectorAll('.outline-node-row').forEach(r => r.classList.remove('active-drag-target'));
      this.draggedNodeId = null;
    };

    row.ondragover = (e) => {
      e.preventDefault();
      if (this.draggedNodeId && this.draggedNodeId !== memberId) {
        row.classList.add('active-drag-target');
      }
    };

    row.ondragleave = () => {
      row.classList.remove('active-drag-target');
    };

    row.ondrop = (e) => {
      e.preventDefault();
      row.classList.remove('active-drag-target');
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
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'outline-inline-input';
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
      if (e.key === 'Enter') {
        commit();
      } else if (e.key === 'Escape') {
        input.replaceWith(titleSpan);
      }
    };
  }

  addChildTo(parentId) {
    const parent = this.dataStore.getMember(parentId);
    if (!parent) return;

    const newGen = (parseInt(parent.generation, 10) || 1) + 1;
    const newChild = this.dataStore.addMember({
      full_name: 'Người Mới',
      parent_id: parentId,
      parent_name: parent.full_name,
      generation: newGen,
      branch: parent.branch
    });

    this.collapsedNodes.delete(parentId);
    this.render();
    this.dataStore.selectMember(newChild.id);
    window.dispatchEvent(new CustomEvent('node-selected-for-inspector', { detail: newChild.id }));

    // Auto trigger rename
    setTimeout(() => {
      const row = this.container.querySelector(`.outline-node-wrapper[data-id="${CSS.escape(newChild.id)}"] .outline-node-row`);
      const titleSpan = row?.querySelector('.outline-node-title');
      if (row && titleSpan) {
        this.startInlineRename(row, titleSpan, newChild);
      }
    }, 50);
  }

  addSpouseTo(memberId) {
    const member = this.dataStore.getMember(memberId);
    if (!member) return;

    // Check if already has a spouse linked
    const existingSpouse = this.dataStore.getSpouseMember(memberId);
    if (existingSpouse) {
      alert(`${member.full_name} đã có phối ngẫu là ${existingSpouse.full_name}. Nếu muốn thay đổi, hãy hủy liên kết trước.`);
      return;
    }

    const spouse = this.dataStore.addSpouseAsMember(memberId);
    if (!spouse) return;

    this.render();
    this.dataStore.selectMember(spouse.id);
    window.dispatchEvent(new CustomEvent('node-selected-for-inspector', { detail: spouse.id }));

    // Auto trigger rename for spouse
    setTimeout(() => {
      const spouseRow = this.container.querySelector(`.outline-spouse-title`);
      if (spouseRow) {
        const row = spouseRow.closest('.outline-node-row');
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
      full_name: 'Người Mới',
      parent_id: sibling.parent_id,
      parent_name: sibling.parent_name,
      generation: sibling.generation,
      branch: sibling.branch
    });

    this.render();
    this.dataStore.selectMember(newSibling.id);
    window.dispatchEvent(new CustomEvent('node-selected-for-inspector', { detail: newSibling.id }));

    setTimeout(() => {
      const row = this.container.querySelector(`.outline-node-wrapper[data-id="${CSS.escape(newSibling.id)}"] .outline-node-row`);
      const titleSpan = row?.querySelector('.outline-node-title');
      if (row && titleSpan) {
        this.startInlineRename(row, titleSpan, newSibling);
      }
    }, 50);
  }

  outdent(memberId) {
    const member = this.dataStore.getMember(memberId);
    if (!member || !member.parent_id || member.parent_id === '-') return;

    const parent = this.dataStore.getMember(member.parent_id);
    if (!parent) return;

    const grandparent = parent.parent_id || '-';
    this.dataStore.updateMember(memberId, { parent_id: grandparent });
    this.render();
  }

  deleteNode(memberId) {
    const member = this.dataStore.getMember(memberId);
    if (!member) return;

    const children = this.dataStore.getChildren(memberId);
    if (children.length > 0) {
      const choice = confirm(`Thành viên "${member.full_name}" có ${children.length} người con trực hệ.\n\n• Nhấn OK: XÓA NGƯỜI NÀY (các con sẽ được giữ lại và nối lên đời trên).\n• Nhấn Cancel: HỦY, không xóa.`);
      if (choice) {
        this.dataStore.deleteMember(memberId, false);
      }
    } else {
      if (confirm(`Bạn có chắc chắn muốn xóa "${member.full_name}" (${member.id}) không?`)) {
        this.dataStore.deleteMember(memberId, false);
      }
    }
    this.render();
  }

  revealSelected(selectedId) {
    // Search must reveal a result even when its ancestors are collapsed.
    let parent = this.dataStore.getMember(selectedId)?.parent_id;
    let expanded = false;
    const visited = new Set();
    while (parent && !visited.has(parent)) {
      visited.add(parent); expanded = this.collapsedNodes.delete(parent) || expanded;
      parent = this.dataStore.getMember(parent)?.parent_id;
    }
    if (expanded) this.render(); else this.highlightSelected(selectedId);
  }

  highlightSelected(selectedId) {
    const allRows = this.container.querySelectorAll('.outline-node-row');
    allRows.forEach(r => r.classList.remove('selected'));

    if (selectedId) {
      const target = this.container.querySelector(`.outline-node-wrapper[data-id="${CSS.escape(selectedId)}"] > .outline-node-row`);
      if (target) {
        target.classList.add('selected');
        target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
}
