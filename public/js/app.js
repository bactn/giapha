// app.js - Main Application Orchestrator with Responsive Drawer & Touch Handling
import { DataStore } from './data-store.js';
import { AutoLayout } from './auto-layout.js';
import { TreeCanvas } from './tree-canvas.js';
import { MindNodeTextEditor } from './mindnode-text.js';
import { ExcelParser } from './excel-parser.js';
import { KinshipCalculator } from './kinship.js';
import { LunarCalendarManager } from './lunar-calendar.js';
import { Exporter } from './export.js';

class App {
  constructor() {
    this.dataStore = new DataStore();
    this.layout = new AutoLayout({ nodeWidth: 230, nodeHeight: 105, siblingGap: 35, generationGap: 130 });

    this.viewportEl = document.getElementById('canvas-viewport');
    this.nodesContainerEl = document.getElementById('canvas-nodes-container');
    this.svgEl = document.getElementById('canvas-svg');
    this.linksGroupEl = document.getElementById('canvas-links-group');
    this.outlineContainerEl = document.getElementById('outline-tree-container');

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

    this.setupResponsiveDrawer();
    this.setupLeftMenuTabs();
    this.setupLeftInspector();
    this.setupToolbarButtons();
    this.setupModals();
    this.setupSearch();
    this.setupLineageTitle();

    await this.loadInitialData();
  }

  async loadInitialData() {
    try {
      const res = await fetch('/api/lineage');
      if (res.ok) {
        const data = await res.json();
        this.dataStore.loadState(data);
        this.updateStatsDisplay();
        setTimeout(() => {
          this.canvas.zoomFit();
        }, 150);
        this.showToast('Đã nạp 218 thành viên Gia phả Họ Trần Ngọc!', 'success');
      } else {
        throw new Error('Không thể tải dữ liệu.');
      }
    } catch (err) {
      console.warn('Fallback loading error:', err);
      this.showToast('Đang chạy ở chế độ offline cục bộ.', 'info');
    }
  }

  updateStatsDisplay() {
    const titleEl = document.getElementById('lineage-title');
    if (titleEl && this.dataStore.lineageInfo.name) {
      titleEl.textContent = this.dataStore.lineageInfo.name;
    }

    const statsEl = document.getElementById('stats-summary');
    if (statsEl) {
      statsEl.textContent = `${this.dataStore.lineageInfo.generations} Thế Hệ | ${this.dataStore.lineageInfo.total_members} Thành Viên`;
    }
  }

  setupResponsiveDrawer() {
    const leftPane = document.getElementById('left-menu-pane');
    const backdrop = document.getElementById('left-menu-backdrop');
    const btnHamburger = document.getElementById('btn-hamburger');
    const btnCloseMobile = document.getElementById('btn-close-mobile-menu');
    const btnToggleDesktop = document.getElementById('btn-toggle-left-menu');

    const openMobileDrawer = () => {
      leftPane.classList.add('drawer-open');
      backdrop.classList.add('drawer-open');
    };

    const closeMobileDrawer = () => {
      leftPane.classList.remove('drawer-open');
      backdrop.classList.remove('drawer-open');
    };

    if (btnHamburger) btnHamburger.onclick = openMobileDrawer;
    if (btnCloseMobile) btnCloseMobile.onclick = closeMobileDrawer;
    if (backdrop) backdrop.onclick = closeMobileDrawer;

    // Desktop Toggle
    if (btnToggleDesktop) {
      btnToggleDesktop.onclick = () => {
        leftPane.classList.toggle('hidden');
        setTimeout(() => this.canvas.zoomFit(), 150);
      };
    }
  }

  setupLeftMenuTabs() {
    const tabBtnOutline = document.getElementById('tab-btn-outline');
    const tabBtnInspector = document.getElementById('tab-btn-inspector');
    const contentOutline = document.getElementById('tab-content-outline');
    const contentInspector = document.getElementById('tab-content-inspector');
    const leftPane = document.getElementById('left-menu-pane');

    const switchTab = (tab) => {
      if (tab === 'outline') {
        tabBtnOutline.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg bg-white text-slate-900 shadow-xs flex items-center justify-center space-x-1.5 transition-all';
        tabBtnInspector.className = 'flex-1 py-1.5 text-xs font-semibold rounded-lg text-slate-500 hover:text-slate-800 flex items-center justify-center space-x-1.5 transition-all';
        contentOutline.classList.remove('hidden');
        contentInspector.classList.add('hidden');
      } else {
        tabBtnInspector.className = 'flex-1 py-1.5 text-xs font-bold rounded-lg bg-white text-slate-900 shadow-xs flex items-center justify-center space-x-1.5 transition-all';
        tabBtnOutline.className = 'flex-1 py-1.5 text-xs font-semibold rounded-lg text-slate-500 hover:text-slate-800 flex items-center justify-center space-x-1.5 transition-all';
        contentInspector.classList.remove('hidden');
        contentOutline.classList.add('hidden');
      }
    };

    tabBtnOutline.onclick = () => switchTab('outline');
    tabBtnInspector.onclick = () => switchTab('inspector');

    // When a node is selected, switch to Inspector tab and open drawer on mobile
    window.addEventListener('node-selected-for-inspector', (e) => {
      const memberId = e.detail;
      switchTab('inspector');
      this.populateInspector(memberId);

      // On mobile screen (< 1024px), open drawer so user sees details
      if (window.innerWidth < 1024) {
        leftPane.classList.add('drawer-open');
        document.getElementById('left-menu-backdrop').classList.add('drawer-open');
      }
    });
  }

  setupLeftInspector() {
    const emptyState = document.getElementById('inspector-empty-state');
    const formWrapper = document.getElementById('inspector-form-wrapper');
    const btnDelete = document.getElementById('btn-inspect-delete');
    const btnAddChild = document.getElementById('btn-inspect-add-child');

    const fields = [
      { id: 'inspect-christian-name', key: 'christian_name' },
      { id: 'inspect-full-name', key: 'full_name' },
      { id: 'inspect-gender', key: 'gender' },
      { id: 'inspect-generation', key: 'generation' },
      { id: 'inspect-branch', key: 'branch' },
      { id: 'inspect-branch-type', key: 'branch_type' },
      { id: 'inspect-parent-id', key: 'parent_id' },
      { id: 'inspect-spouse', key: 'spouse' },
      { id: 'inspect-birth-date', key: 'birth_date' },
      { id: 'inspect-death-date', key: 'death_date' },
      { id: 'inspect-status', key: 'status' },
      { id: 'inspect-role', key: 'role' },
      { id: 'inspect-notes', key: 'notes' }
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
          if (key === 'full_name') {
            document.getElementById('inspect-header-name').textContent = val || 'Người Mới';
          }
        } catch (err) {
          alert(err.message);
        }
      };

      el.addEventListener('input', updateField);
      el.addEventListener('change', updateField);
    });

    btnDelete.onclick = () => {
      const selId = this.dataStore.selectedMemberId;
      if (!selId) return;
      this.canvas.confirmDelete(selId);
    };

    btnAddChild.onclick = () => {
      const selId = this.dataStore.selectedMemberId;
      if (!selId) return;
      this.textEditor.addChildTo(selId);
    };
  }

  populateInspector(memberId) {
    const emptyState = document.getElementById('inspector-empty-state');
    const formWrapper = document.getElementById('inspector-form-wrapper');
    const indicator = document.getElementById('inspector-selected-indicator');

    const m = this.dataStore.getMember(memberId);
    if (!m) {
      emptyState.classList.remove('hidden');
      formWrapper.classList.add('hidden');
      indicator.classList.add('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    formWrapper.classList.remove('hidden');
    indicator.classList.remove('hidden');

    document.getElementById('inspect-header-name').textContent = m.full_name;
    document.getElementById('inspect-header-meta').textContent = `Mã: ${m.id} • Đời ${m.generation} • ${m.branch || 'Ngành II'}`;
    document.getElementById('inspect-avatar').textContent = m.full_name[0] || 'P';

    document.getElementById('inspect-christian-name').value = m.christian_name || '';
    document.getElementById('inspect-full-name').value = m.full_name || '';
    document.getElementById('inspect-gender').value = m.gender || 'Nam';
    document.getElementById('inspect-generation').value = m.generation || '1';
    document.getElementById('inspect-branch').value = m.branch || '';
    document.getElementById('inspect-branch-type').value = m.branch_type || 'Nội tộc (Trực hệ)';
    document.getElementById('inspect-parent-id').value = m.parent_id === '-' ? '' : (m.parent_id || '');
    document.getElementById('inspect-spouse').value = m.spouse || '';
    document.getElementById('inspect-birth-date').value = m.birth_date || '';
    document.getElementById('inspect-death-date').value = m.death_date || '';
    document.getElementById('inspect-status').value = m.status || 'Còn sống';
    document.getElementById('inspect-role').value = m.role || 'Thành viên';
    document.getElementById('inspect-notes').value = m.notes || '';
  }

  setupToolbarButtons() {
    // Zoom In, Out, Reset, Fit
    document.getElementById('btn-zoom-in').onclick = () => this.canvas.setZoom(this.canvas.scale * 1.2);
    document.getElementById('btn-zoom-out').onclick = () => this.canvas.setZoom(this.canvas.scale * 0.8);
    document.getElementById('btn-zoom-reset').onclick = () => this.canvas.setZoom(1.0);
    document.getElementById('btn-zoom-fit').onclick = () => this.canvas.zoomFit();

    // Orientation toggle
    const btnOrient = document.getElementById('btn-toggle-orientation');
    const orientLabel = document.getElementById('orientation-label');
    btnOrient.onclick = () => {
      if (this.layout.orientation === 'VERTICAL') {
        this.layout.orientation = 'HORIZONTAL';
        orientLabel.textContent = 'Ngang';
      } else {
        this.layout.orientation = 'VERTICAL';
        orientLabel.textContent = 'Dọc';
      }
      this.canvas.render();
      setTimeout(() => this.canvas.zoomFit(), 100);
    };

    // Branch filter
    const selectBranch = document.getElementById('select-branch-filter');
    selectBranch.onchange = (e) => {
      this.canvas.activeFilter = e.target.value;
      this.canvas.render();
      setTimeout(() => this.canvas.zoomFit(), 100);
    };

    // Undo / Redo
    const btnUndo = document.getElementById('btn-undo');
    if (btnUndo) {
      btnUndo.onclick = () => {
        if (this.dataStore.undo()) this.showToast('Đã hoàn tác.', 'info');
      };
    }
    const btnRedo = document.getElementById('btn-redo');
    if (btnRedo) {
      btnRedo.onclick = () => {
        if (this.dataStore.redo()) this.showToast('Đã làm lại.', 'info');
      };
    }

    // Expand / Collapse all
    document.getElementById('btn-expand-all').onclick = () => this.textEditor.expandAll();
    document.getElementById('btn-collapse-all').onclick = () => this.textEditor.collapseAll();

    // Quick add root
    document.getElementById('btn-quick-add-root').onclick = () => {
      const name = prompt('Nhập họ tên Cụ Thủy Tổ:');
      if (name && name.trim()) {
        const root = this.dataStore.addMember({
          full_name: name.trim(),
          generation: '1',
          parent_id: '-',
          role: 'Thủy Tổ'
        });
        this.dataStore.selectMember(root.id);
        window.dispatchEvent(new CustomEvent('node-selected-for-inspector', { detail: root.id }));
        this.showToast(`Đã thêm Thủy tổ ${root.full_name}`, 'success');
      }
    };

    // Add child to selected
    document.getElementById('btn-add-child-selected').onclick = () => {
      const selId = this.dataStore.selectedMemberId;
      if (selId) {
        this.textEditor.addChildTo(selId);
      } else {
        alert('Vui lòng chọn 1 thành viên trên danh mục hoặc bản đồ để thêm con.');
      }
    };

    // Save Lineage
    document.getElementById('btn-save-lineage').onclick = async () => {
      try {
        const payload = {
          lineage_info: this.dataStore.lineageInfo,
          members: this.dataStore.getAllMembers()
        };
        const res = await fetch('/api/lineage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          this.showToast('Đã lưu dữ liệu gia phả thành công vào máy chủ!', 'success');
        } else {
          throw new Error('Lỗi máy chủ khi lưu.');
        }
      } catch (err) {
        this.showToast('Lưu file: ' + err.message, 'error');
      }
    };

    // Reset Data
    document.getElementById('btn-reset-data').onclick = async () => {
      if (confirm('Bạn có chắc muốn khôi phục lại dữ liệu mẫu gốc Họ Trần Ngọc không?')) {
        const res = await fetch('/api/lineage/reset', { method: 'POST' });
        if (res.ok) {
          await this.loadInitialData();
        }
      }
    };
  }

  setupModals() {
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.onclick = () => {
        btn.closest('.modal-overlay').classList.add('hidden');
      };
    });

    // 1. Import Modal
    const modalImport = document.getElementById('modal-import');
    const btnOpenImport = document.getElementById('btn-open-import');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const btnConfirmImport = document.getElementById('btn-confirm-import');
    const importPreview = document.getElementById('import-preview');
    const importStatusBox = document.getElementById('import-status-box');
    let pendingMembers = null;

    btnOpenImport.onclick = () => {
      modalImport.classList.remove('hidden');
      pendingMembers = null;
      btnConfirmImport.disabled = true;
      importPreview.classList.add('hidden');
    };

    dropZone.onclick = () => fileInput.click();

    const handleFile = (file) => {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        const result = ExcelParser.parseGenealogyData(text);

        importPreview.classList.remove('hidden');
        if (result.success && result.members.length > 0) {
          pendingMembers = result.members;
          btnConfirmImport.disabled = false;
          importStatusBox.className = 'p-3 rounded-xl text-xs bg-emerald-50 text-emerald-800 border border-emerald-200';
          importStatusBox.innerHTML = `
            <strong>Đã đọc thành công ${result.members.length} thành viên!</strong><br>
            File: <em>${file.name}</em> (Sẵn sàng nạp vào cây gia phả).
          `;
        } else {
          pendingMembers = null;
          btnConfirmImport.disabled = true;
          importStatusBox.className = 'p-3 rounded-xl text-xs bg-rose-50 text-rose-800 border border-rose-200';
          importStatusBox.innerHTML = `
            <strong>Có lỗi khi đọc file:</strong><br>
            ${result.errors.join('<br>')}
          `;
        }
      };
      reader.readAsText(file, 'UTF-8');
    };

    fileInput.onchange = (e) => handleFile(e.target.files[0]);
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('border-amber-500'); };
    dropZone.ondragleave = () => dropZone.classList.remove('border-amber-500');
    dropZone.ondrop = (e) => {
      e.preventDefault();
      dropZone.classList.remove('border-amber-500');
      handleFile(e.dataTransfer.files[0]);
    };

    btnConfirmImport.onclick = () => {
      if (pendingMembers) {
        this.dataStore.loadState({
          lineageInfo: { ...this.dataStore.lineageInfo, total_members: pendingMembers.length },
          members: pendingMembers
        });
        modalImport.classList.add('hidden');
        this.updateStatsDisplay();
        setTimeout(() => this.canvas.zoomFit(), 150);
        this.showToast(`Đã import thành công ${pendingMembers.length} thành viên mới!`, 'success');
      }
    };

    // 2. Kinship Modal
    const modalKinship = document.getElementById('modal-kinship');
    const selectA = document.getElementById('kinship-person-a');
    const selectB = document.getElementById('kinship-person-b');
    const resultText = document.getElementById('kinship-result-text');

    document.getElementById('btn-open-kinship').onclick = () => {
      modalKinship.classList.remove('hidden');

      selectA.innerHTML = '<option value="">-- Chọn Người Thứ Nhất --</option>';
      selectB.innerHTML = '<option value="">-- Chọn Người Thứ Hai --</option>';

      const sorted = this.dataStore.getAllMembers().sort((a, b) => a.full_name.localeCompare(b.full_name));
      for (const m of sorted) {
        const optA = document.createElement('option');
        optA.value = m.id;
        optA.textContent = `${m.full_name} (${m.id} - Đời ${m.generation})`;
        selectA.appendChild(optA);

        const optB = document.createElement('option');
        optB.value = m.id;
        optB.textContent = `${m.full_name} (${m.id} - Đời ${m.generation})`;
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

    // 3. Lunar Calendar Modal
    const modalLunar = document.getElementById('modal-lunar');
    const lunarListContainer = document.getElementById('lunar-giỗ-list');
    document.getElementById('btn-open-lunar').onclick = () => {
      modalLunar.classList.remove('hidden');
      LunarCalendarManager.renderGiỗList(lunarListContainer, this.dataStore, (memberId) => {
        modalLunar.classList.add('hidden');
        this.dataStore.selectMember(memberId);
        window.dispatchEvent(new CustomEvent('node-selected-for-inspector', { detail: memberId }));
      });
    };

    // 4. Export Modal
    const modalExport = document.getElementById('modal-export');
    const selectExportScope = document.getElementById('select-export-scope');
    const exportSubtreeHint = document.getElementById('export-subtree-hint');

    // Helper: refresh the scope selector when the modal opens
    const refreshExportScopeSelector = () => {
      // Remove old SUBTREE options
      selectExportScope.querySelectorAll('option[data-subtree]').forEach(o => o.remove());

      const selId = this.dataStore.selectedMemberId;
      if (selId) {
        const m = this.dataStore.getMember(selId);
        if (m) {
          const opt = document.createElement('option');
          opt.value = `SUBTREE:${selId}`;
          opt.textContent = `Nhánh Cụ ${m.full_name} (${m.id})`;
          opt.dataset.subtree = '1';
          selectExportScope.appendChild(opt);
          exportSubtreeHint.classList.remove('hidden');

          // Default to the currently selected member's subtree
          selectExportScope.value = `SUBTREE:${selId}`;
        }
      } else {
        exportSubtreeHint.classList.add('hidden');
        // Default to ALL when no member is selected
        selectExportScope.value = 'ALL';
      }
    };

    document.getElementById('btn-open-export').onclick = () => {
      refreshExportScopeSelector();
      modalExport.classList.remove('hidden');
    };

    // Helper: get current export scope from selector
    const getExportScope = () => selectExportScope.value || 'ALL';

    // PDF Direct Download
    const btnPdf = document.getElementById('btn-export-pdf');
    if (btnPdf) {
      btnPdf.onclick = () => {
        modalExport.classList.add('hidden');
        const scope = getExportScope();
        this.showToast('Đang tạo và tải file PDF chất lượng cao...', 'info');
        Exporter.exportPDF(this.canvas, scope);
      };
    }

    // Print / Save to System PDF
    const btnPrint = document.getElementById('btn-print-tree');
    if (btnPrint) {
      btnPrint.onclick = () => {
        modalExport.classList.add('hidden');
        const scope = getExportScope();
        Exporter.printTree(this.canvas, scope);
      };
    }

    document.getElementById('btn-export-png').onclick = () => {
      modalExport.classList.add('hidden');
      const scope = getExportScope();
      this.showToast('Đang tạo và tải ảnh PNG độ nét cao...', 'info');
      Exporter.exportPNG(this.canvas, scope);
    };

    document.getElementById('btn-export-svg').onclick = () => {
      const scope = getExportScope();
      Exporter.exportSVG(this.canvas, scope);
      modalExport.classList.add('hidden');
      this.showToast('Đang tải file Vector SVG...', 'success');
    };

    document.getElementById('btn-export-json').onclick = () => {
      Exporter.exportJSON(this.dataStore);
      modalExport.classList.add('hidden');
      this.showToast('Đã tải bản sao lưu JSON.', 'success');
    };
  }

  setupSearch() {
    const searchInput = document.getElementById('global-search');
    searchInput.oninput = (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) return;

      const match = this.dataStore.getAllMembers().find(m => 
        m.full_name.toLowerCase().includes(q) ||
        (m.christian_name && m.christian_name.toLowerCase().includes(q)) ||
        m.id.toLowerCase() === q
      );

      if (match) {
        this.dataStore.selectMember(match.id);
        window.dispatchEvent(new CustomEvent('node-selected-for-inspector', { detail: match.id }));
      }
    };
  }

  setupLineageTitle() {
    const titleEl = document.getElementById('lineage-title');
    titleEl.ondblclick = () => {
      const current = this.dataStore.lineageInfo.name;
      const newName = prompt('Nhập tên Dòng Họ / Chi Nhánh:', current);
      if (newName && newName.trim()) {
        this.dataStore.lineageInfo.name = newName.trim();
        titleEl.textContent = newName.trim();
        this.showToast('Đã đổi tên dòng họ.', 'info');
      }
    };
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px) scale(0.95)';
      setTimeout(() => toast.remove(), 250);
    }, 3000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new App();
});
