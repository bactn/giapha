// tree-canvas.js - Infinite Pan/Zoom Canvas with Mobile Touch Gestures & Standardized SVG Icons
export class TreeCanvas {
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

    // Mobile touch tracking
    this.touchStartDist = 0;
    this.touchStartScale = 1;

    this.draggingNodeId = null;
    this.activeFilter = 'ALL';
    this.layoutData = null;

    this.init();
  }

  init() {
    this.setupPanAndZoom();
    this.setupTouchGestures();

    this.dataStore.subscribe((event, data) => {
      if (['load', 'add', 'update', 'delete', 'undo', 'redo'].includes(event)) {
        this.render();
      } else if (event === 'select') {
        this.highlightSelected(data);
      }
    });

    window.addEventListener('resize', () => {
      this.renderMinimap();
    });
  }

  setupPanAndZoom() {
    // Mouse Down (Pan starts on canvas background or SVG)
    this.viewport.addEventListener('mousedown', (e) => {
      if (e.target === this.viewport || e.target === this.svg || e.target.tagName === 'svg' || e.target.tagName === 'g') {
        this.isPanning = true;
        this.startPanX = e.clientX - this.panX;
        this.startPanY = e.clientY - this.panY;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isPanning) {
        this.panX = e.clientX - this.startPanX;
        this.panY = e.clientY - this.startPanY;
        this.applyTransform();
        this.renderMinimap();
      }
    });

    window.addEventListener('mouseup', () => {
      this.isPanning = false;
    });

    // Wheel Zoom around mouse cursor (ultra smooth)
    this.viewport.addEventListener('wheel', (e) => {
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
    // Mobile Touch Pan & Two-finger Pinch Zoom
    this.viewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        // Single finger pan
        const touch = e.touches[0];
        if (e.target === this.viewport || e.target === this.svg || e.target.tagName === 'svg' || e.target.tagName === 'g') {
          this.isPanning = true;
          this.startPanX = touch.clientX - this.panX;
          this.startPanY = touch.clientY - this.panY;
        }
      } else if (e.touches.length === 2) {
        // Two finger pinch to zoom
        this.isPanning = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this.touchStartDist = Math.hypot(dx, dy);
        this.touchStartScale = this.scale;
      }
    }, { passive: false });

    this.viewport.addEventListener('touchmove', (e) => {
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
          
          // Midpoint of fingers
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

    this.viewport.addEventListener('touchend', (e) => {
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
    this.linksGroup.setAttribute('transform', `translate(${this.panX}, ${this.panY}) scale(${this.scale})`);
  }

  updateZoomDisplay() {
    const textEl = document.getElementById('zoom-level-text');
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

  render() {
    this.layoutData = this.layout.calculateLayout(this.dataStore, this.activeFilter);
    const { positions, links } = this.layoutData;

    // 1. Render Visible High-Contrast SVG Links & Connector Ports
    this.linksGroup.innerHTML = '';
    for (const link of links) {
      const { path: pathData, startPoint, endPoint } = this.layout.generatePath(link);

      // SVG Path
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      
      let branchClass = 'tree-link';
      let portClass = 'tree-port-dot';
      if (link.branch === 'Chi 1') {
        branchClass += ' tree-link-chi-1';
        portClass += ' port-chi-1';
      } else if (link.branch === 'Chi 2') {
        branchClass += ' tree-link-chi-2';
        portClass += ' port-chi-2';
      } else if (link.source.member && parseInt(link.source.member.generation, 10) <= 2) {
        branchClass += ' tree-link-root';
      }
      
      path.setAttribute('class', branchClass);
      path.dataset.source = link.sourceId;
      path.dataset.target = link.targetId;
      this.linksGroup.appendChild(path);

      // Start circle port (Parent bottom)
      const startCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      startCircle.setAttribute('cx', startPoint.x);
      startCircle.setAttribute('cy', startPoint.y);
      startCircle.setAttribute('r', '3.5');
      startCircle.setAttribute('class', portClass);
      this.linksGroup.appendChild(startCircle);

      // End circle port (Child top)
      const endCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      endCircle.setAttribute('cx', endPoint.x);
      endCircle.setAttribute('cy', endPoint.y);
      endCircle.setAttribute('r', '3.5');
      endCircle.setAttribute('class', portClass);
      this.linksGroup.appendChild(endCircle);
    }

    // 2. Render Nodes
    this.container.innerHTML = '';
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
    const card = document.createElement('div');
    card.className = 'family-node';
    card.dataset.id = member.id;
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;

    // Gender & Role classes
    if (member.gender === 'Nữ') {
      card.classList.add('gender-female');
    } else {
      card.classList.add('gender-male');
    }
    if (member.role === 'Đích Tôn') {
      card.classList.add('is-dich-ton');
    }

    const isDeceased = member.status === 'Đã mất' || member.status === 'Mất sớm';
    const avatarInitials = member.full_name.split(' ').map(n => n[0]).slice(-2).join('');

    card.innerHTML = `
      <div class="node-header">
        <span class="font-bold text-[10px] text-slate-500">Đời ${member.generation} • ${member.branch || 'Ngành II'}</span>
        <div class="flex items-center space-x-1.5">
          ${member.role === 'Đích Tôn' ? '<span class="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded">👑 Đích Tôn</span>' : ''}
          ${member.branch_type && member.branch_type.includes('Ngoại tộc') ? '<span class="text-[9px] bg-purple-100 text-purple-800 font-semibold px-1 py-0.2 rounded">Ngoại</span>' : ''}
          <span class="w-2 h-2 rounded-full ${isDeceased ? 'bg-slate-300' : 'bg-emerald-500'}" title="${member.status || 'Còn sống'}"></span>
          <!-- STANDARDIZED ON-CARD DELETE BUTTON -->
          <button class="btn-node-delete-quick" title="Xóa người này">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <div class="node-body">
        <div class="node-avatar ${member.gender === 'Nữ' ? 'avatar-female' : 'avatar-male'}">
          ${avatarInitials}
        </div>
        <div class="node-info">
          ${member.christian_name ? `<div class="node-christian-name">[${member.christian_name}]</div>` : ''}
          <div class="node-full-name" title="Bấm đúp để sửa tên">${member.full_name}</div>
          <div class="node-meta">${member.birth_date ? member.birth_date : ''} ${member.death_date ? '• ' + member.death_date : ''}</div>
        </div>
      </div>
      ${member.spouse ? `
        <div class="node-footer">
          <span class="truncate">⚭ ${member.spouse}</span>
        </div>
      ` : ''}
      
      <!-- Quick Action Hover Bar -->
      <div class="node-actions">
        <button class="node-action-btn action-add-child" title="Thêm con">
          <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
          <span>Con</span>
        </button>
        <button class="node-action-btn action-add-spouse" title="Thêm phối ngẫu">
          <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
          <span>Vợ/Chồng</span>
        </button>
        <button class="node-action-btn action-edit" title="Sửa chi tiết ở menu trái">
          <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
          <span>Xem</span>
        </button>
        <button class="node-action-btn btn-act-del action-delete" title="Xóa người này">
          <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
    `;

    // Click to select
    card.onclick = (e) => {
      e.stopPropagation();
      this.dataStore.selectMember(member.id);
      window.dispatchEvent(new CustomEvent('node-selected-for-inspector', { detail: member.id }));
    };

    // Quick Delete button (✕)
    card.querySelector('.btn-node-delete-quick').onclick = (e) => {
      e.stopPropagation();
      this.confirmDelete(member.id);
    };

    // Quick Delete action in hover bar
    card.querySelector('.action-delete').onclick = (e) => {
      e.stopPropagation();
      this.confirmDelete(member.id);
    };

    // Inline edit name on double click
    const nameEl = card.querySelector('.node-full-name');
    nameEl.ondblclick = (e) => {
      e.stopPropagation();
      this.startInlineEdit(nameEl, member);
    };

    // Quick action: Add Child
    card.querySelector('.action-add-child').onclick = (e) => {
      e.stopPropagation();
      const newGen = (parseInt(member.generation, 10) || 1) + 1;
      const child = this.dataStore.addMember({
        full_name: 'Người Mới',
        parent_id: member.id,
        parent_name: member.full_name,
        generation: newGen,
        branch: member.branch
      });
      this.dataStore.selectMember(child.id);
      window.dispatchEvent(new CustomEvent('node-selected-for-inspector', { detail: child.id }));
    };

    // Quick action: Add Spouse
    card.querySelector('.action-add-spouse').onclick = (e) => {
      e.stopPropagation();
      const spouseName = prompt(`Nhập họ tên vợ/chồng của ${member.full_name}:`);
      if (spouseName && spouseName.trim()) {
        const current = member.spouse ? `${member.spouse}; ${spouseName.trim()}` : spouseName.trim();
        this.dataStore.updateMember(member.id, { spouse: current });
      }
    };

    // Quick action: Edit in Left Inspector
    card.querySelector('.action-edit').onclick = (e) => {
      e.stopPropagation();
      this.dataStore.selectMember(member.id);
      window.dispatchEvent(new CustomEvent('node-selected-for-inspector', { detail: member.id }));
    };

    // Drag and Drop (Reparenting directly on Canvas)
    this.setupNodeDrag(card, member.id);

    return card;
  }

  confirmDelete(memberId) {
    const member = this.dataStore.getMember(memberId);
    if (!member) return;

    const children = this.dataStore.getChildren(memberId);
    if (children.length > 0) {
      const choice = confirm(`Thành viên "${member.full_name}" có ${children.length} người con trực hệ.\n\n• Nhấn OK: XÓA NGƯỜI NÀY (các con sẽ tự động được chuyển lên đời trên).\n• Nhấn Cancel: Bỏ qua không xóa.`);
      if (choice) {
        this.dataStore.deleteMember(memberId, false);
      }
    } else {
      if (confirm(`Bạn có chắc muốn xóa "${member.full_name}" (${member.id}) không?`)) {
        this.dataStore.deleteMember(memberId, false);
      }
    }
  }

  startInlineEdit(nameEl, member) {
    const currentName = member.full_name;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'node-inline-input';
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
      if (e.key === 'Enter') {
        commit();
      } else if (e.key === 'Escape') {
        input.replaceWith(nameEl);
      }
    };
  }

  setupNodeDrag(card, memberId) {
    let startX, startY, isDragging = false;

    card.onmousedown = (e) => {
      if (e.target.closest('.node-actions') || e.target.closest('.btn-node-delete-quick') || e.target.tagName === 'INPUT') return;
      if (e.button !== 0) return;

      startX = e.clientX;
      startY = e.clientY;
      isDragging = false;

      const onMouseMove = (moveEvt) => {
        const dist = Math.hypot(moveEvt.clientX - startX, moveEvt.clientY - startY);
        if (dist > 6 && !isDragging) {
          isDragging = true;
          this.draggingNodeId = memberId;
          card.classList.add('dragging');
        }
      };

      const onMouseUp = (upEvt) => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        if (isDragging) {
          card.classList.remove('dragging');
          this.draggingNodeId = null;

          card.style.pointerEvents = 'none';
          const targetEl = document.elementFromPoint(upEvt.clientX, upEvt.clientY)?.closest('.family-node');
          card.style.pointerEvents = 'auto';

          if (targetEl && targetEl.dataset.id !== memberId) {
            const targetId = targetEl.dataset.id;
            const targetMember = this.dataStore.getMember(targetId);
            const sourceMember = this.dataStore.getMember(memberId);

            if (confirm(`Bạn có muốn ghép "${sourceMember.full_name}" làm con của "${targetMember.full_name}" không?`)) {
              try {
                this.dataStore.reparent(memberId, targetId);
              } catch (err) {
                alert(err.message);
              }
            }
          }
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };
  }

  highlightSelected(selectedId) {
    const nodes = this.container.querySelectorAll('.family-node');
    nodes.forEach(n => n.classList.remove('selected'));

    const links = this.linksGroup.querySelectorAll('.tree-link');
    links.forEach(l => l.classList.remove('highlighted'));

    if (selectedId) {
      const node = this.container.querySelector(`.family-node[data-id="${selectedId}"]`);
      if (node) {
        node.classList.add('selected');
      }

      const relatedLinks = this.linksGroup.querySelectorAll(`[data-source="${selectedId}"], [data-target="${selectedId}"]`);
      relatedLinks.forEach(l => l.classList.add('highlighted'));
    }
  }

  renderMinimap() {
    const minimapCanvas = document.getElementById('minimap-canvas');
    const viewportBox = document.getElementById('minimap-viewport-box');
    if (!minimapCanvas || !viewportBox || !this.layoutData || !this.layoutData.bounds) return;

    const ctx = minimapCanvas.getContext('2d');
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
      ctx.fillStyle = pos.member.gender === 'Nữ' ? '#e11d48' : '#2563eb';
      ctx.fillRect(mx, my, this.layout.nodeWidth * miniScale, this.layout.nodeHeight * miniScale);
    }

    const vW = this.viewport.clientWidth;
    const vH = this.viewport.clientHeight;

    const vpX = offsetX + (-this.panX / this.scale - minX) * miniScale;
    const vpY = offsetY + (-this.panY / this.scale - minY) * miniScale;
    const vpW = (vW / this.scale) * miniScale;
    const vpH = (vH / this.scale) * miniScale;

    viewportBox.style.left = `${Math.max(0, vpX)}px`;
    viewportBox.style.top = `${Math.max(0, vpY)}px`;
    viewportBox.style.width = `${Math.min(cW, vpW)}px`;
    viewportBox.style.height = `${Math.min(cH, vpH)}px`;
  }
}
