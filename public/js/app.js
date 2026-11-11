import { mountShareQr } from './share-qr.js';
// app.js - Main Application Orchestrator with Responsive Drawer & Touch Handling
import { PendingEdits } from './input-editing.js';
import { DataStore } from './data-store.js';
import { AutoLayout } from './auto-layout.js';
import { TreeCanvas } from './tree-canvas.js';
import { MindNodeTextEditor } from './mindnode-text.js';
import { ExcelParser } from './excel-parser.js';
import { KinshipCalculator } from './kinship.js';
import { LunarCalendarManager } from './lunar-calendar.js';
import { Exporter } from './export.js';
import { config } from './config.js';
import { apiFetch, apiUrl, shareUrl } from './api.js';
import { isSupabaseConfigured } from './supabase-client.js';
import { SupabaseController } from './supabase-controller.js';
import { escapeHTML } from './html.js';
import { avatarSVG, lifespanAge } from './member-presentation.js';

class App {
  constructor() {
    this.dataStore = new DataStore();
    this.layout = new AutoLayout({ nodeWidth: 230, nodeHeight: 140, siblingGap: 35, generationGap: 80 });

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

    if (isSupabaseConfigured()) {
      this.supabase = new SupabaseController(this);
      await this.supabase.init();
      return;
    }

    if (config.staticHosting && !config.apiBaseUrl) {
      ['auth-login-form', 'auth-create-form', 'auth-code-form'].forEach(id => {
        document.getElementById(id)?.classList.add('hidden');
      });
      document.getElementById('backend-unavailable').classList.remove('hidden');
      return;
    }

    document.querySelectorAll('a[href^="/api/"]').forEach(link => {
      link.href = apiUrl(link.getAttribute('href'));
    });

    // Check for share link in URL before auth
    await this.checkShareLink();

    // Check auth state first
    await this.checkAuthState();

    // If not authenticated, show auth overlay and stop init
    if (!this.isAuthenticated) {
      this.setupAuthUI();
      return;
    }

    // Hide auth overlay when authenticated
    const overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.style.display = 'none';

    // Apply role-based restrictions
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
    // Check if the URL is /share/<token>
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const token = new URLSearchParams(window.location.search).get('share') ||
      (pathParts[0] === 'share' ? pathParts[1] : null);
    if (token) {
      try {
        const res = await apiFetch(`/api/share/${token}`);
        const data = await res.json();
        if (res.ok) {
          // Store share link info for later use
          this._shareLinkInfo = { lineage_id: data.lineage_id, role: data.role };
          // Set lineage_id so loadInitialData uses per-lineage data
          this.lineageId = data.lineage_id;
          // Auto-login as anonymous viewer through share link
          this.isAuthenticated = true;
          this.userRole = data.role || 'viewer';
          this.currentUser = { id: 'share_' + token, username: 'Khách (Link chia sẻ)' };
          // Keep the share link URL — do NOT redirect to /
          return;
        }
      } catch (err) {
        console.error('Share link resolution failed:', err);
      }
      // Invalid share link - show error
      this.showToast('Link chia sẻ không hợp lệ hoặc đã hết hạn.', 'error');
    }
  }

  // ─── Auth Methods ──────────────────────────────────────────────────────────

  async checkAuthState() {
    // If already authenticated via share link, skip session check
    if (this.isAuthenticated && this._shareLinkInfo) return;

    this.isAuthenticated = false;
    this.userRole = null;
    this.currentUser = null;
    this.lineageId = null;

    const sessionToken = localStorage.getItem('session_token');
    if (!sessionToken) return;

    try {
      const res = await apiFetch('/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + sessionToken }
      });
      if (res.ok) {
        const data = await res.json();
        this.isAuthenticated = true;
        this.userRole = data.role;
        this.currentUser = data.user;
        this.lineageId = data.lineage_id;
      } else {
        localStorage.removeItem('session_token');
      }
    } catch {
      localStorage.removeItem('session_token');
    }
  }

  setupAuthUI() {
    const overlay = document.getElementById('auth-overlay');
    const loginForm = document.getElementById('auth-login-form');
    const createForm = document.getElementById('auth-create-form');
    const codeForm = document.getElementById('auth-code-form');

    if (!overlay) return;

    // Switch between forms
    const showForm = (form) => {
      loginForm.classList.add('hidden');
      createForm.classList.add('hidden');
      codeForm.classList.add('hidden');
      form.classList.remove('hidden');
      this.clearAuthErrors();
    };

    document.getElementById('auth-switch-create').onclick = (e) => {
      e.preventDefault();
      showForm(createForm);
    };
    document.getElementById('auth-switch-login').onclick = (e) => {
      e.preventDefault();
      showForm(loginForm);
    };
    document.getElementById('auth-switch-code').onclick = (e) => {
      e.preventDefault();
      showForm(codeForm);
    };
    document.getElementById('auth-switch-login-from-code').onclick = (e) => {
      e.preventDefault();
      showForm(loginForm);
    };

    // Login
    document.getElementById('auth-login-btn').onclick = async () => {
      const username = document.getElementById('auth-username').value.trim();
      if (!username) {
        this.showAuthError('auth-error', 'Tên người dùng không được để trống');
        return;
      }
      try {
        const loginBody = { username };
        // If pending code access, include the share code
        if (this._pendingCodeAccess) {
          // Fetch the code to get the actual code value
          loginBody.share_code = this._pendingCodeAccess.code;
        }
        const res = await apiFetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(loginBody)
        });
        const data = await res.json();
        if (res.ok) {
          localStorage.setItem('session_token', data.session_token);
          this.isAuthenticated = true;
          this.userRole = data.role;
          this.currentUser = data.user;
          this.lineageId = data.lineage_id;
          overlay.style.display = 'none';
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
          this.showAuthError('auth-error', data.error || 'Đăng nhập thất bại');
        }
      } catch (err) {
        this.showAuthError('auth-error', 'Lỗi kết nối máy chủ');
      }
    };

    // Create
    document.getElementById('auth-create-btn').onclick = async () => {
      const username = document.getElementById('auth-create-username').value.trim();
      if (!username) {
        this.showAuthError('auth-create-error', 'Tên người dùng không được để trống');
        return;
      }
      try {
        const createBody = { username };
        if (this._pendingCodeAccess) {
          createBody.share_code = this._pendingCodeAccess.code;
        }
        const res = await apiFetch('/api/auth/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createBody)
        });
        const data = await res.json();
        if (res.ok) {
          localStorage.setItem('session_token', data.session_token);
          this.isAuthenticated = true;
          this.userRole = 'admin';
          this.currentUser = data.user;
          this.lineageId = data.lineage_id;
          overlay.style.display = 'none';
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
          this.showAuthError('auth-create-error', data.error || 'Tạo tài khoản thất bại');
        }
      } catch (err) {
        this.showAuthError('auth-create-error', 'Lỗi kết nối máy chủ');
      }
    };

    // Code access
    document.getElementById('auth-code-btn').onclick = async () => {
      const code = document.getElementById('auth-code-input').value.trim().toUpperCase();
      if (!code) {
        this.showAuthError('auth-code-error', 'Mã code không được để trống');
        return;
      }
      try {
        const res = await apiFetch('/api/share/code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });
        const data = await res.json();
        if (res.ok) {
          // Code is valid - now require login/create
          this._pendingCodeAccess = { lineage_id: data.lineage_id, role: data.role, code: code };
          showForm(loginForm);
          document.getElementById('auth-username').placeholder = 'Nhập tên người dùng để tiếp tục';
        } else {
          this.showAuthError('auth-code-error', data.error || 'Mã code không hợp lệ');
        }
      } catch (err) {
        this.showAuthError('auth-code-error', 'Lỗi kết nối máy chủ');
      }
    };

    // Enter key support
    document.getElementById('auth-username').onkeydown = (e) => {
      if (e.key === 'Enter') document.getElementById('auth-login-btn').click();
    };
    document.getElementById('auth-create-username').onkeydown = (e) => {
      if (e.key === 'Enter') document.getElementById('auth-create-btn').click();
    };
    document.getElementById('auth-code-input').onkeydown = (e) => {
      if (e.key === 'Enter') document.getElementById('auth-code-btn').click();
    };

    // Show login form by default
    showForm(loginForm);
  }

  showAuthError(elementId, message) {
    const el = document.getElementById(elementId);
    el.textContent = message;
    el.classList.remove('hidden');
  }

  clearAuthErrors() {
    document.querySelectorAll('[id^="auth-"] .hidden').forEach(el => {});
    ['auth-error', 'auth-create-error', 'auth-code-error'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = '';
        el.classList.add('hidden');
      }
    });
  }

  applyRoleRestrictions() {
    // Show/hide edit controls based on role
    const editControls = document.querySelectorAll('#btn-add-member, #btn-delete-member, #btn-inspect-delete, #btn-inspect-save, #btn-inspect-add-child, #btn-inspect-move-left, #btn-inspect-move-right, #btn-lifespan-auto, #btn-save-lineage, #btn-reset-data, #btn-quick-add-root, #btn-add-child-selected');
    const viewerOnly = document.getElementById('btn-request-edit');
    const shareBtn = document.getElementById('btn-open-share');

    // Update user display
    this.updateUserDisplay();

    // Setup logout
    this.setupLogout();

    // Setup notification bell
    this.setupNotificationBell();

    if (this.userRole === 'viewer') {
      editControls.forEach(el => { if (el) el.style.display = 'none'; });
      if (viewerOnly) viewerOnly.style.display = 'flex';
      if (shareBtn) shareBtn.style.display = 'none';
    } else if (this.userRole === 'editor') {
      // Editors can edit but save goes to pending
      editControls.forEach(el => { if (el) el.style.display = ''; });
      if (viewerOnly) viewerOnly.style.display = 'none';
      if (shareBtn) shareBtn.style.display = 'none';
    } else {
      // Admin - full access
      editControls.forEach(el => { if (el) el.style.display = ''; });
      if (viewerOnly) viewerOnly.style.display = 'none';
      if (shareBtn) shareBtn.style.display = 'flex';
    }
  }

  async loadInitialData() {
    try {
      // Use per-lineage data if lineage_id is set
      let url = '/api/lineage';
      if (this.lineageId) {
        url = `/api/lineage?lineage_id=${this.lineageId}`;
      }
      // Always fetch fresh data from server (no cache), especially for share-link viewers
      const res = await apiFetch(url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now(), {
        cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json();
        this.dataStore.loadState(data);

        // Migrate existing spouse text strings to full member nodes
        const migrated = this.dataStore.migrateSpouseTextToMembers();
        if (migrated > 0) {
          this.showToast(`Đã chuyển đổi ${migrated} thông tin vợ/chồng thành thành viên đầy đủ.`, 'success');
        }

        // Initialize change tracking baseline (co-working: editor → admin approval)
        this.dataStore.initializeTracking();

        this.updateStatsDisplay();
        setTimeout(() => {
          this.canvas.zoomFit();
        }, 150);
        this.showToast(`Đã nạp ${this.dataStore.members.size} thành viên!`, 'success');
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
    const badge = document.getElementById('outline-count-badge');
    if (badge) badge.textContent = String(this.dataStore.members.size);
  }

  setupResponsiveDrawer() {
    if (!this.headerObserver) {
      const header = document.querySelector('.app-header');
      this.headerObserver = new ResizeObserver(() => document.documentElement.style.setProperty('--workspace-header-height',`${header.getBoundingClientRect().height}px`));
      this.headerObserver.observe(header);
    }
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
        tabBtnOutline.className = 'tab-btn flex-1 py-1.5 text-xs font-bold rounded-lg bg-white text-slate-900 shadow-xs flex items-center justify-center space-x-1.5 transition-all border-b-2 border-amber-500';
        tabBtnInspector.className = 'tab-btn flex-1 py-1.5 text-xs font-semibold rounded-lg text-slate-500 hover:text-slate-800 flex items-center justify-center space-x-1.5 transition-all border-b-2 border-transparent';
        contentOutline.classList.remove('hidden');
        contentInspector.classList.add('hidden');
      } else {
        tabBtnInspector.className = 'tab-btn flex-1 py-1.5 text-xs font-bold rounded-lg bg-white text-slate-900 shadow-xs flex items-center justify-center space-x-1.5 transition-all border-b-2 border-amber-500';
        tabBtnOutline.className = 'tab-btn flex-1 py-1.5 text-xs font-semibold rounded-lg text-slate-500 hover:text-slate-800 flex items-center justify-center space-x-1.5 transition-all border-b-2 border-transparent';
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

      // Auto-focus canvas on the selected member
      this.canvas.focusOnMember(memberId);

      // On mobile screen (< 1024px), open drawer so user sees details
      if (window.innerWidth < 1024) {
        leftPane.classList.add('drawer-open');
        document.getElementById('left-menu-backdrop').classList.add('drawer-open');
      }
    });
  }

  setupLeftInspector() {
    this.inspectorEdits = new PendingEdits();
    this.flushInspectorEdits = () => this.inspectorEdits.flush();
    this.dataStore.subscribe(event => { if (event === 'load') this.inspectorEdits.clear(); });
    window.addEventListener('pagehide', () => this.flushInspectorEdits());

    document.getElementById('btn-lifespan-auto').onclick=()=>{const id=this.dataStore.selectedMemberId;if(id){this.dataStore.updateMember(id,{lifespan_override:''});this.populateInspector(id);}};
    for (const [id,step] of [['btn-inspect-move-left',-1],['btn-inspect-move-right',1]]) {
      document.getElementById(id).onclick=()=>{
        const selected=this.dataStore.selectedMemberId;
        if(this.dataStore.moveSibling(selected,step)) { this.populateInspector(selected); this.canvas.focusOnMember(selected); }
      };
    }
    const emptyState = document.getElementById('inspector-empty-state');
    const formWrapper = document.getElementById('inspector-form-wrapper');
    const btnDelete = document.getElementById('btn-inspect-delete');
    const btnSave = document.getElementById('btn-inspect-save');
    const btnAddChild = document.getElementById('btn-inspect-add-child');

    const fields = [
      { id: 'inspect-christian-name', key: 'christian_name' },
      { id: 'inspect-full-name', key: 'full_name' },
      { id: 'inspect-gender', key: 'gender' },
      { id: 'inspect-generation', key: 'generation' },
      { id: 'inspect-branch', key: 'branch' },
      { id: 'inspect-branch-type', key: 'branch_type' },
      { id: 'inspect-parent-id', key: 'parent_id' },
      { id: 'inspect-birth-date', key: 'birth_date' },
      { id: 'inspect-death-date', key: 'death_date' },
      { id: 'inspect-death-date-solar', key: 'death_date_solar' },
      { id: 'inspect-lifespan', key: 'lifespan_override' },
      { id: 'inspect-status', key: 'status' },
      { id: 'inspect-role', key: 'role' },
      { id: 'inspect-notes', key: 'notes' }
    ];

    fields.forEach(({ id, key }) => {
      const el = document.getElementById(id);
      if (!el) return;

      const updateField = (selId = this.dataStore.selectedMemberId, value = el.value) => {
        if (!selId) return;

        const val = value.trim();
        if(key==='lifespan_override' && val!=='' && (!Number.isInteger(Number(val)) || Number(val)<0 || Number(val)>200)) return;
        try {
          this.dataStore.updateMember(selId, { [key]: val });
          if(key==='lifespan_override') document.getElementById('inspect-lifespan-hint').textContent=val==='' ? 'Tự tính theo ngày sinh và ngày mất dương lịch; tính theo năm nếu thiếu ngày/tháng.' : 'Hưởng thọ đang nhập riêng. Bấm Tự tính lại để dùng ngày sinh và ngày mất dương lịch.';
          if(['birth_date','death_date_solar'].includes(key)) {
            const member=this.dataStore.getMember(selId);
            document.getElementById('inspect-lifespan').value=lifespanAge(member) ?? '';
          }
          if (key === 'full_name') {
            document.getElementById('inspect-header-name').textContent = val || 'Trần Ngọc';
          }
        } catch (err) {
          alert(err.message);
        }
      };

      let composing = false;
      const draftKey = () => id;
      const queue = () => {
        const memberId = this.dataStore.selectedMemberId, value = el.value;
        this.inspectorEdits.queue(draftKey(), () => updateField(memberId, value), !composing);
      };
      el.addEventListener('compositionstart', () => { composing = true; this.inspectorEdits.cancel(draftKey()); });
      el.addEventListener('compositionend', () => { composing = false; queue(); });
      el.addEventListener('input', queue);
      el.addEventListener('change', () => { if (!composing) { queue(); this.inspectorEdits.flush(draftKey()); } });
      el.addEventListener('blur', () => { composing = false; this.inspectorEdits.flush(draftKey()); });
    });

    btnDelete.onclick = () => {
      const selId = this.dataStore.selectedMemberId;
      if (!selId) return;
      this.canvas.confirmDelete(selId);
    };

    btnSave.onclick = async () => {
      this.flushInspectorEdits?.();
      try {
        const payload = {
          lineage_info: this.dataStore.lineageInfo,
          members: this.dataStore.getAllMembers()
        };
        // Include lineage_id for per-lineage storage
        if (this.lineageId) {
          payload.lineage_id = this.lineageId;
        }
        const res = await apiFetch('/api/lineage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          this.showToast('Đã lưu thông tin thành viên thành công!', 'success');
        } else {
          throw new Error('Lỗi máy chủ khi lưu.');
        }
      } catch (err) {
        this.showToast('Lưu thất bại: ' + err.message, 'error');
      }
    };

    btnAddChild.onclick = () => {
      const selId = this.dataStore.selectedMemberId;
      if (!selId) return;
      this.textEditor.addChildTo(selId);
    };

    // Spouse selector change handler
    const spouseSelect = document.getElementById('inspect-spouse-select');
    if (spouseSelect) {
      spouseSelect.onchange = () => {
        const selId = this.dataStore.selectedMemberId;
        if (!selId) return;

        const selectedSpouseId = spouseSelect.value;
        const member = this.dataStore.getMember(selId);

        if (selectedSpouseId) {
          // Link to selected member (updateMember auto-clears old link)
          this.dataStore.updateMember(selId, {
            spouse_id: selectedSpouseId
          });
          // Link back from spouse side
          this.dataStore.updateMember(selectedSpouseId, {
            spouse_id: selId
          });
        } else {
          // Unlink (updateMember auto-clears old link)
          this.dataStore.updateMember(selId, { spouse_id: '', spouse: '' });
        }
      };
    }

    // "Tạo vợ/chồng mới" button
    const btnAddSpouseNew = document.getElementById('btn-add-spouse-new');
    if (btnAddSpouseNew) {
      btnAddSpouseNew.onclick = () => {
        const selId = this.dataStore.selectedMemberId;
        if (!selId) return;
        this.dataStore.addSpouseAsMember(selId);
      };
    }
  }

  populateInspector(memberId) {
    this.flushInspectorEdits?.();
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
    document.getElementById('btn-inspect-move-left').disabled=!this.dataStore.canMoveSibling(m.id,-1);
    document.getElementById('btn-inspect-move-right').disabled=!this.dataStore.canMoveSibling(m.id,1);
    document.getElementById('inspect-header-meta').textContent = `Đời ${m.generation} • ${m.branch || 'Ngành II'}`;
    document.getElementById('inspect-avatar').innerHTML = avatarSVG(m.gender);

    document.getElementById('inspect-christian-name').value = m.christian_name || '';
    document.getElementById('inspect-full-name').value = m.full_name || '';
    document.getElementById('inspect-gender').value = m.gender || 'Nam';
    document.getElementById('inspect-generation').value = m.generation || '1';
    document.getElementById('inspect-branch').value = m.branch || '';
    document.getElementById('inspect-branch-type').value = m.branch_type || 'Nội tộc (Trực hệ)';
    document.getElementById('inspect-parent-id').value = m.parent_id === '-' ? '' : (m.parent_id || '');

    // Populate spouse selector with all other members
    const spouseSelect = document.getElementById('inspect-spouse-select');
    if (spouseSelect) {
      spouseSelect.innerHTML = '<option value="">— Chưa liên kết —</option>';
      for (const other of this.dataStore.members.values()) {
        if (other.id === m.id) continue;
        const opt = document.createElement('option');
        opt.value = other.id;
        opt.textContent = `${other.full_name} (${other.id})`;
        spouseSelect.appendChild(opt);
      }
      // Restore selection
      if (m.spouse_id && this.dataStore.members.has(m.spouse_id)) {
        spouseSelect.value = m.spouse_id;
      } else {
        spouseSelect.value = '';
      }
    }

    document.getElementById('inspect-birth-date').value = m.birth_date || '';
    document.getElementById('inspect-death-date').value = m.death_date || '';
    document.getElementById('inspect-death-date-solar').value=m.death_date_solar || '';
    document.getElementById('inspect-lifespan').value=lifespanAge(m) ?? '';
    document.getElementById('inspect-lifespan-hint').textContent=m.lifespan_override !== undefined && m.lifespan_override !== null && m.lifespan_override !== '' ? 'Hưởng thọ đang nhập riêng. Bấm Tự tính lại để dùng ngày sinh và ngày mất dương lịch.' : 'Tự tính theo ngày sinh và ngày mất dương lịch; tính theo năm nếu thiếu ngày/tháng.';
    document.getElementById('inspect-status').value = m.status || 'Còn sống';
    document.getElementById('inspect-role').value = m.role?.replace(/phối ngẫu/gi, 'Vợ/chồng') || 'Thành viên';
    document.getElementById('inspect-notes').value = m.notes || '';
  }

  setupToolbarButtons() {
    const connector = document.getElementById('btn-toggle-connection');
    connector.onclick = () => {
      this.layout.connectionStyle = this.layout.connectionStyle === 'ORTHOGONAL' ? 'CURVED' : 'ORTHOGONAL';
      const orthogonal = this.layout.connectionStyle === 'ORTHOGONAL';
      this.layout.generationGap = orthogonal ? 80 : 130;
      connector.textContent = orthogonal ? 'Vuông góc' : 'Đường cong';
      connector.setAttribute('aria-pressed', String(orthogonal));
      this.canvas.render();
    };
    this.setupHeaderMenus();
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
        this.flushInspectorEdits?.();
        if (this.dataStore.undo()) this.showToast('Đã hoàn tác.', 'info');
      };
    }
    const btnRedo = document.getElementById('btn-redo');
    if (btnRedo) {
      btnRedo.onclick = () => {
        this.flushInspectorEdits?.();
        if (this.dataStore.redo()) this.showToast('Đã làm lại.', 'info');
      };
    }

    // Expand / Collapse all
    document.getElementById('btn-expand-all').onclick = () => this.textEditor.expandAll();
    document.getElementById('btn-collapse-all').onclick = () => this.textEditor.collapseAll();

    // Quick add root
    document.getElementById('btn-quick-add-root').onclick = () => {
      const name = prompt('Nhập họ tên Cụ Thủy Tổ:', 'Trần Ngọc');
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
        const changes = this.dataStore.getTrackedChanges();
        if (changes.length === 0) {
          this.showToast('Không có thay đổi nào cần lưu.', 'info');
          return;
        }

        // Editor: submit as pending changes for admin approval
        if (this.userRole === 'editor') {
          const sessionToken = localStorage.getItem('session_token');
          const res = await apiFetch(`/api/lineage/${this.lineageId}/pending-changes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sessionToken },
            body: JSON.stringify({ changes })
          });
          const data = await res.json();
          if (res.ok) {
            this.showToast(`Đã gửi ${changes.length} thay đổi chờ phê duyệt. Admin sẽ xem xét.`, 'success');
          } else {
            throw new Error(data.error || 'Gửi yêu cầu phê duyệt thất bại.');
          }
          return;
        }

        // Admin: save directly
        const payload = {
          lineage_info: this.dataStore.lineageInfo,
          members: this.dataStore.getAllMembers()
        };
        // Include lineage_id for per-lineage storage
        if (this.lineageId) {
          payload.lineage_id = this.lineageId;
        }
        const res = await apiFetch('/api/lineage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          this.showToast('Đã lưu dữ liệu gia phả thành công vào máy chủ!', 'success');
          // Reset tracking baseline after successful save
          this.dataStore.resetTracking();
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
        const res = await apiFetch('/api/lineage/reset', { method: 'POST' });
        if (res.ok) {
          await this.loadInitialData();
        }
      }
    };
  }

  setupModals() {
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.onclick = () => {
        const dialog=btn.closest('.modal-overlay'); dialog.classList.add('hidden');
        if(dialog.id==='modal-export') document.getElementById('btn-open-export').focus();
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
            File: <em>${escapeHTML(file.name)}</em> (Sẵn sàng nạp vào cây gia phả).
          `;
        } else {
          pendingMembers = null;
          btnConfirmImport.disabled = true;
          importStatusBox.className = 'p-3 rounded-xl text-xs bg-rose-50 text-rose-800 border border-rose-200';
          importStatusBox.innerHTML = `
            <strong>Có lỗi khi đọc file:</strong><br>
            ${result.errors.map(escapeHTML).join('<br>')}
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
    let anniversaryCalendar='lunar';
    const renderAnniversaries=()=>{
      for(const calendar of ['lunar','solar']) document.getElementById('tab-anniversary-'+calendar).setAttribute('aria-selected',String(calendar===anniversaryCalendar));
      lunarListContainer.setAttribute('aria-labelledby','tab-anniversary-'+anniversaryCalendar);
      LunarCalendarManager.renderGiỗList(lunarListContainer,this.dataStore,id=>{modalLunar.classList.add('hidden');this.revealMemberOnTree(id);},anniversaryCalendar);
    };
    for(const calendar of ['lunar','solar']) document.getElementById('tab-anniversary-'+calendar).onclick=()=>{anniversaryCalendar=calendar;renderAnniversaries();};
    document.getElementById('btn-open-lunar').onclick = () => {
      modalLunar.classList.remove('hidden');
      renderAnniversaries();
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
      modalExport.querySelector('.modal-close').focus();
    };

    // Helper: get current export scope from selector
    const getExportScope = () => selectExportScope.value || 'ALL';

    // A4 PDF Download - Vertical Layout
    const getExportDepth = () => {
      const val = document.getElementById('select-export-depth')?.value;
      return parseInt(val, 10) || 0;
    };

    const btnA4Pdf = document.getElementById('btn-export-a4-pdf');
    if (btnA4Pdf) {
      btnA4Pdf.onclick = () => {
        modalExport.classList.add('hidden');
        const scope = getExportScope();
        const template = document.getElementById('select-a4-template')?.value || 'card';
        const maxDepth = getExportDepth();
        const templateLabel = template === 'table' ? 'Bảng Dữ Liệu' : 'Cây 2 thế hệ';
        this.showToast(`Đang tạo file PDF A4 (${templateLabel})...`, 'info');
        return Exporter.exportA4PDF(this.canvas, scope, template, maxDepth);
      };
    }

    // A4 Print - Vertical Layout
    const btnPrintA4 = document.getElementById('btn-print-a4');
    if (btnPrintA4) {
      btnPrintA4.onclick = () => {
        modalExport.classList.add('hidden');
        const scope = getExportScope();
        const template = document.getElementById('select-a4-template')?.value || 'card';
        const maxDepth = getExportDepth();
        return Exporter.printA4(this.canvas, scope, template, maxDepth);
      };
    }

    // PDF Direct Download (Large Landscape)
    const btnPdf = document.getElementById('btn-export-pdf');
    if (btnPdf) {
      btnPdf.onclick = () => {
        modalExport.classList.add('hidden');
        const scope = getExportScope();
        const maxDepth = getExportDepth();
        this.showToast('Đang tạo và tải file PDF chất lượng cao...', 'info');
        return Exporter.exportPDF(this.canvas, scope, 'AUTO', maxDepth);
      };
    }

    // Print / Save to System PDF (Large Landscape)
    const btnPrint = document.getElementById('btn-print-tree');
    if (btnPrint) {
      btnPrint.onclick = () => {
        modalExport.classList.add('hidden');
        const scope = getExportScope();
        const maxDepth = getExportDepth();
        return Exporter.printTree(this.canvas, scope, maxDepth);
      };
    }

    document.getElementById('btn-export-png').onclick = () => {
      modalExport.classList.add('hidden');
      const scope = getExportScope();
      const maxDepth = getExportDepth();
      this.showToast('Đang tạo và tải ảnh PNG độ nét cao...', 'info');
      return Exporter.exportPNG(this.canvas, scope, maxDepth);
    };

    document.getElementById('btn-export-svg').onclick = async () => {
      await Exporter.ready();
      const scope = getExportScope();
      const maxDepth = getExportDepth();
      Exporter.exportSVG(this.canvas, scope, maxDepth);
      modalExport.classList.add('hidden');
      this.showToast('Đang tải file Vector SVG...', 'success');
    };

    document.getElementById('btn-export-csv').onclick = () => { modalExport.classList.add('hidden'); Exporter.exportCSV(this.canvas,getExportScope(),getExportDepth()); };

    document.getElementById('btn-export-json').onclick = () => {
      Exporter.exportJSON(this.dataStore);
      modalExport.classList.add('hidden');
      this.showToast('Đã tải bản sao lưu JSON.', 'success');
    };
    let exporting = false;
    for (const button of modalExport.querySelectorAll('button[id^="btn-export-"], #btn-print-a4, #btn-print-tree')) {
      const action = button.onclick;
      button.onclick = async () => {
        if (exporting) return;
        exporting = true; button.disabled = true;
        try { this.flushInspectorEdits?.(); await action(); }
        catch (error) { this.showToast(error.message || 'Không thể xuất gia phả. Vui lòng thử lại.', 'error'); }
        finally { exporting = false; button.disabled = false; }
      };
    }

  }

  // ─── Share Panel ───────────────────────────────────────────────────────────

  setupSharePanel() {
    const overlay = document.getElementById('share-panel-overlay');
    if (!overlay) return;

    const btnOpen = document.getElementById('btn-open-share');
    const btnClose = document.getElementById('btn-close-share-panel');

    // Tab switching
    const tabs = {
      link: document.getElementById('share-tab-link'),
      access: document.getElementById('share-tab-access'),
      pending: document.getElementById('share-tab-pending')
    };
    const contents = {
      link: document.getElementById('share-content-link'),
      access: document.getElementById('share-content-access'),
      pending: document.getElementById('share-content-pending')
    };

    const switchTab = (tab) => {
      Object.values(tabs).forEach(t => {
        t.classList.remove('bg-white', 'text-slate-900', 'border-amber-500', 'font-bold');
        t.classList.add('text-slate-500', 'border-transparent', 'font-semibold');
      });
      Object.values(contents).forEach(c => c.classList.add('hidden'));

      tabs[tab].classList.add('bg-white', 'text-slate-900', 'border-amber-500', 'font-bold');
      tabs[tab].classList.remove('text-slate-500', 'border-transparent', 'font-semibold');
      contents[tab].classList.remove('hidden');

      if (tab === 'access') this.loadAccessList();
      if (tab === 'pending') this.loadPendingChanges();
    };

    tabs.link.onclick = () => switchTab('link');
    tabs.access.onclick = () => switchTab('access');
    tabs.pending.onclick = () => switchTab('pending');

    // Open/Close
    btnOpen.onclick = () => {
      overlay.classList.remove('hidden');
      overlay.classList.add('flex');
      switchTab('link');
    };
    btnClose.onclick = () => {
      overlay.classList.add('hidden');
      overlay.classList.remove('flex');
    };
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
      }
    };

    // Helper: ensure lineageId is set
    const ensureLineageId = async () => {
      if (this.lineageId) return this.lineageId;
      try {
        const res = await apiFetch('/api/auth/me', {
          headers: { 'Authorization': 'Bearer ' + localStorage.getItem('session_token') }
        });
        if (res.ok) {
          const data = await res.json();
          this.lineageId = data.lineage_id;
          return this.lineageId;
        }
      } catch {}
      return null;
    };

    const setQrLink = mountShareQr(document.getElementById('share-link-qr'));

    // Generate share link
    document.getElementById('btn-generate-share-link').onclick = async () => {
      const role = document.getElementById('share-link-role').value;
      const lineageId = await ensureLineageId();
      if (!lineageId) {
        this.showToast('Không xác định được gia phả. Vui lòng đăng nhập lại.', 'error');
        return;
      }
      try {
        const res = await apiFetch(`/api/lineage/${lineageId}/share-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('session_token') },
          body: JSON.stringify({ role })
        });
        const data = await res.json();
        if (res.ok) {
          const token = data.share_link?.token || data.token;
          const url = shareUrl(token);
          document.getElementById('share-link-url').value = url;
          setQrLink(url);
          document.getElementById('share-link-result').classList.remove('hidden');
        } else {
          this.showToast(data.error || 'Tạo link thất bại', 'error');
        }
      } catch {
        this.showToast('Lỗi kết nối máy chủ', 'error');
      }
    };

    // Copy share link
    document.getElementById('btn-copy-share-link').onclick = () => {
      const input = document.getElementById('share-link-url');
      input.select();
      navigator.clipboard.writeText(input.value);
      this.showToast('Đã copy link!', 'success');
    };

    // Generate share code
    document.getElementById('btn-generate-share-code').onclick = async () => {
      const role = document.getElementById('share-code-role').value;
      const lineageId = await ensureLineageId();
      if (!lineageId) {
        this.showToast('Không xác định được gia phả. Vui lòng đăng nhập lại.', 'error');
        return;
      }
      try {
        const res = await apiFetch(`/api/lineage/${lineageId}/share-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('session_token') },
          body: JSON.stringify({ role })
        });
        const data = await res.json();
        if (res.ok) {
          const code = data.share_code?.code || data.code;
          document.getElementById('share-code-value').value = code;
          document.getElementById('share-code-result').classList.remove('hidden');
        } else {
          this.showToast(data.error || 'Tạo code thất bại', 'error');
        }
      } catch {
        this.showToast('Lỗi kết nối máy chủ', 'error');
      }
    };

    // Copy share code
    document.getElementById('btn-copy-share-code').onclick = () => {
      const input = document.getElementById('share-code-value');
      input.select();
      navigator.clipboard.writeText(input.value);
      this.showToast('Đã copy code!', 'success');
    };
  }

  async loadAccessList() {
    const container = document.getElementById('access-list-container');
    if (!container) return;
    container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Đang tải...</p>';

    try {
      const res = await apiFetch(`/api/lineage/${this.lineageId}/access-list`, {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('session_token') }
      });
      const data = await res.json();
      if (!res.ok) {
        container.innerHTML = `<p class="text-xs text-red-500 text-center py-4">${data.error || 'Lỗi'}</p>`;
        return;
      }

      if (!data.access || data.access.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Chưa có người dùng nào được chia sẻ.</p>';
        return;
      }

      container.innerHTML = '';
      const roleLabels = { admin: 'Quản trị', editor: 'Chỉnh sửa', viewer: 'Chỉ xem' };
      const roleColors = { admin: 'bg-red-100 text-red-700', editor: 'bg-blue-100 text-blue-700', viewer: 'bg-slate-100 text-slate-600' };

      for (const entry of data.access) {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl';
        div.innerHTML = `
          <div class="flex items-center space-x-3">
            <span class="w-8 h-8 rounded-full bg-amber-100 text-amber-800 text-xs font-bold flex items-center justify-center">${(entry.username || '?')[0].toUpperCase()}</span>
            <div>
              <span class="text-xs font-semibold text-slate-800">${entry.username}</span>
              <span class="text-[10px] px-1.5 py-0.2 rounded-full ${roleColors[entry.role] || ''} ml-1">${roleLabels[entry.role] || entry.role}</span>
            </div>
          </div>
          <div class="flex items-center space-x-1">
            ${entry.role !== 'admin' ? `
              <button class="upgrade-btn px-2 py-1 text-[10px] bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 font-medium" data-uid="${entry.user_id}">Nâng</button>
            ` : ''}
            ${entry.role !== 'admin' ? `
              <button class="remove-btn px-2 py-1 text-[10px] bg-rose-100 text-rose-700 rounded-lg hover:bg-rose-200 font-medium" data-uid="${entry.user_id}">Xóa</button>
            ` : ''}
          </div>
        `;
        container.appendChild(div);
      }

      // Upgrade button handlers
      container.querySelectorAll('.upgrade-btn').forEach(btn => {
        btn.onclick = async () => {
          const uid = btn.dataset.uid;
          const entry = data.access.find(a => a.user_id === uid);
          const nextRole = entry.role === 'viewer' ? 'editor' : 'admin';
          try {
            const res = await apiFetch(`/api/lineage/${this.lineageId}/access/${uid}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('session_token') },
              body: JSON.stringify({ role: nextRole })
            });
            if (res.ok) {
              this.showToast(`Đã nâng ${entry.username} lên ${roleLabels[nextRole]}`, 'success');
              this.loadAccessList();
            } else {
              const err = await res.json();
              this.showToast(err.error || 'Thất bại', 'error');
            }
          } catch {
            this.showToast('Lỗi kết nối', 'error');
          }
        };
      });

      // Remove button handlers
      container.querySelectorAll('.remove-btn').forEach(btn => {
        btn.onclick = async () => {
          const uid = btn.dataset.uid;
          const entry = data.access.find(a => a.user_id === uid);
          if (!confirm(`Xóa quyền truy cập của ${entry.username}?`)) return;
          try {
            const res = await apiFetch(`/api/lineage/${this.lineageId}/access/${uid}`, {
              method: 'DELETE',
              headers: { 'Authorization': 'Bearer ' + localStorage.getItem('session_token') }
            });
            if (res.ok) {
              this.showToast(`Đã xóa quyền của ${entry.username}`, 'success');
              this.loadAccessList();
            } else {
              const err = await res.json();
              this.showToast(err.error || 'Thất bại', 'error');
            }
          } catch {
            this.showToast('Lỗi kết nối', 'error');
          }
        };
      });
    } catch {
      container.innerHTML = '<p class="text-xs text-red-500 text-center py-4">Lỗi kết nối</p>';
    }
  }

  async loadPendingChanges() {
    const container = document.getElementById('pending-changes-container');
    if (!container) return;
    container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Đang tải...</p>';

    try {
      const res = await apiFetch(`/api/lineage/${this.lineageId}/pending-changes`, {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('session_token') }
      });
      const data = await res.json();
      if (!res.ok) {
        container.innerHTML = `<p class="text-xs text-red-500 text-center py-4">${data.error || 'Lỗi'}</p>`;
        return;
      }

      const badge = document.getElementById('share-pending-badge');
      if (badge) {
        badge.textContent = data.pending_changes?.length || 0;
        badge.classList.toggle('hidden', !data.pending_changes?.length);
      }

      if (!data.pending_changes || data.pending_changes.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Không có thay đổi nào chờ phê duyệt.</p>';
        return;
      }

      container.innerHTML = '';
      for (const change of data.pending_changes) {
        const div = document.createElement('div');
        div.className = 'p-3 bg-slate-50 border border-slate-200 rounded-xl';
        const date = new Date(change.created_at).toLocaleString('vi-VN');

        // Build change detail rows
        let changeDetails = '';
        if (change.changes && change.changes.length > 0) {
          const fieldLabels = {
            full_name: 'Họ và Tên', christian_name: 'Tên Thánh', gender: 'Giới Tính',
            birth_date: 'Ngày Sinh', death_date: 'Ngày Mất', birth_place: 'Nơi Sinh',
            death_place: 'Nơi Mất', occupation: 'Nghề Nghiệp', spouse: 'Vợ/Chồng',
            notes: 'Ghi Chú', generation: 'Đời', member_code: 'Mã Thành Viên',
            parent_id: 'Cha Mẹ', spouse_id: 'Vợ/Chồng'
          };
          changeDetails = '<div class="mt-2 space-y-1">';
          for (const c of change.changes) {
            const fieldName = fieldLabels[c.field] || c.field;
            const oldValue = c.old_value !== undefined && c.old_value !== null ? String(c.old_value) : '(trống)';
            const newValue = c.new_value !== undefined && c.new_value !== null ? String(c.new_value) : '(trống)';
            changeDetails += `
              <div class="text-[10px] bg-white rounded-lg p-2 border border-slate-100">
                <span class="font-semibold text-slate-700">${fieldName}:</span>
                <span class="text-red-500 line-through">${this.escapeHtml(oldValue)}</span>
                <span class="text-slate-400"> → </span>
                <span class="text-emerald-600 font-medium">${this.escapeHtml(newValue)}</span>
              </div>
            `;
          }
          changeDetails += '</div>';
        }

        div.innerHTML = `
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-semibold text-slate-800">Editor: ${change.editor_username || change.editor_id}</span>
            <span class="text-[10px] text-slate-400">${date}</span>
          </div>
          <p class="text-[11px] text-slate-600">${change.summary || `${change.changes?.length || 0} thay đổi`}</p>
          ${changeDetails}
          <div class="flex items-center space-x-2 mt-2">
            <button class="approve-pending-btn px-3 py-1 text-xs bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 font-medium" data-id="${change.id}">✓ Duyệt</button>
            <button class="reject-pending-btn px-3 py-1 text-xs bg-rose-100 text-rose-700 rounded-lg hover:bg-rose-200 font-medium" data-id="${change.id}">✗ Từ chối</button>
          </div>
        `;
        container.appendChild(div);
      }

      container.querySelectorAll('.approve-pending-btn').forEach(btn => {
        btn.onclick = async () => {
          const id = btn.dataset.id;
          try {
            const res = await apiFetch(`/api/lineage/${this.lineageId}/pending-changes/${id}/approve`, {
              method: 'PATCH',
              headers: { 'Authorization': 'Bearer ' + localStorage.getItem('session_token') }
            });
            if (res.ok) {
              this.showToast('Đã phê duyệt thay đổi', 'success');
              // Reload lineage data to reflect changes
              await this.loadInitialData();
              this.loadPendingChanges();
            } else {
              const err = await res.json();
              this.showToast(err.error || 'Thất bại', 'error');
            }
          } catch {
            this.showToast('Lỗi kết nối', 'error');
          }
        };
      });

      container.querySelectorAll('.reject-pending-btn').forEach(btn => {
        btn.onclick = async () => {
          const id = btn.dataset.id;
          const reason = prompt('Lý do từ chối (tùy chọn):');
          try {
            const res = await apiFetch(`/api/lineage/${this.lineageId}/pending-changes/${id}/reject`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('session_token') },
              body: JSON.stringify({ reason: reason || '' })
            });
            if (res.ok) {
              this.showToast('Đã từ chối thay đổi', 'success');
              this.loadPendingChanges();
            } else {
              const err = await res.json();
              this.showToast(err.error || 'Thất bại', 'error');
            }
          } catch {
            this.showToast('Lỗi kết nối', 'error');
          }
        };
      });
    } catch {
      container.innerHTML = '<p class="text-xs text-red-500 text-center py-4">Lỗi kết nối</p>';
    }
  }

  // ─── Edit Request ──────────────────────────────────────────────────────────

  setupEditRequestModal() {
    const overlay = document.getElementById('edit-request-overlay');
    if (!overlay) return;

    const btnOpen = document.getElementById('btn-request-edit');
    const btnCancel = document.getElementById('btn-cancel-edit-request');
    const btnSubmit = document.getElementById('btn-submit-edit-request');
    const accountSection = document.getElementById('edit-request-account-section');
    const guestSection = document.getElementById('edit-request-guest-section');
    const accountLabel = document.getElementById('edit-request-account-label');
    const guestLabel = document.getElementById('edit-request-guest-label');
    const goLoginLink = document.getElementById('edit-request-go-login');
    const goCreateLink = document.getElementById('edit-request-go-create');
    const guestNameInput = document.getElementById('edit-request-guest-name');
    const reasonInput = document.getElementById('edit-request-reason');
    const accountReasonInput = document.getElementById('edit-request-account-reason');
    const errorEl = document.getElementById('edit-request-error');
    const accountForm = document.getElementById('edit-request-account-form');
    const accountLoginPrompt = document.getElementById('edit-request-account-login-prompt');

    // Account mode: add/edit/delete sections
    const proposedAddListAccount = document.getElementById('proposed-add-list-account');
    const proposedEditListAccount = document.getElementById('proposed-edit-list-account');
    const proposedDeleteListAccount = document.getElementById('proposed-delete-list-account');
    const btnAddProposedAddAccount = document.getElementById('btn-add-proposed-add-account');
    const btnAddProposedEditAccount = document.getElementById('btn-add-proposed-edit-account');
    const btnAddProposedDeleteAccount = document.getElementById('btn-add-proposed-delete-account');

    // Guest mode: add/edit/delete sections
    const proposedAddList = document.getElementById('proposed-add-list');
    const proposedEditList = document.getElementById('proposed-edit-list');
    const proposedDeleteList = document.getElementById('proposed-delete-list');
    const btnAddProposedAdd = document.getElementById('btn-add-proposed-add');
    const btnAddProposedEdit = document.getElementById('btn-add-proposed-edit');
    const btnAddProposedDelete = document.getElementById('btn-add-proposed-delete');

    const radios = document.querySelectorAll('input[name="edit-request-mode"]');

    // Store proposed changes by type
    this._proposedAdd = [];
    this._proposedEdit = [];
    this._proposedDelete = [];

    // Field options for proposed changes
    const fieldOptions = [
      { value: 'full_name', label: 'Họ và Tên' },
      { value: 'christian_name', label: 'Tên Thánh' },
      { value: 'gender', label: 'Giới Tính' },
      { value: 'birth_date', label: 'Ngày Sinh' },
      { value: 'death_date', label: 'Ngày Mất' },
      { value: 'birth_place', label: 'Nơi Sinh' },
      { value: 'death_place', label: 'Nơi Mất' },
      { value: 'occupation', label: 'Nghề Nghiệp' },
      { value: 'spouse', label: 'Vợ/Chồng' },
      { value: 'notes', label: 'Ghi Chú' },
      { value: 'generation', label: 'Đời' }
    ];

    // Determine if user has a session (authenticated viewer) or is a share-link guest
    const hasSession = !!localStorage.getItem('session_token');

    // Show modal with account/guest options for all users
    btnOpen.onclick = () => {
      overlay.classList.remove('hidden');
      overlay.classList.add('flex');
      reasonInput.value = '';
      if (accountReasonInput) accountReasonInput.value = '';
      if (guestNameInput) guestNameInput.value = '';
      errorEl.classList.add('hidden');

      // Auto-populate from tracked changes (canvas/tree vs admin baseline)
      const trackedChanges = this.dataStore.getTrackedChanges();
      this._proposedAdd = [];
      this._proposedEdit = [];
      this._proposedDelete = [];

      for (const change of trackedChanges) {
        if (change.type === 'add_member') {
          const m = change.new_value;
          // Store full member object for server, plus display fields
          this._proposedAdd.push({
            type: 'add_member',
            new_value: { ...m },  // Full member object for server
            member_name: m.full_name || m.id,
            member_code: m.id,
            parent_name: m.parent_name || null
          });
        } else if (change.type === 'update_member') {
          const member = this.dataStore.getMember(change.member_id);
          const memberName = member ? member.full_name : change.member_id;
          // Expand each changed field into a separate edit item
          for (const [key, newVal] of Object.entries(change.new_value)) {
            const oldVal = change.old_value ? change.old_value[key] : '';
            this._proposedEdit.push({
              type: 'update_member',
              member_id: change.member_id,  // For server
              member_name: memberName,
              member_code: change.member_id,
              field: key,
              oldValue: oldVal != null ? String(oldVal) : '',
              newValue: newVal != null ? String(newVal) : ''
            });
          }
        } else if (change.type === 'delete_member') {
          const oldM = change.old_value;
          this._proposedDelete.push({
            type: 'delete_member',
            member_id: change.member_id,  // For server
            member_name: oldM ? oldM.full_name : change.member_id,
            member_code: change.member_id
          });
        }
      }

      renderGuestLists();
      renderAccountLists();
      // Default to account mode for authenticated users, guest mode for share-link visitors
      if (hasSession) {
        radios.forEach(r => r.checked = r.value === 'account');
      } else {
        radios.forEach(r => r.checked = r.value === 'guest');
      }
      updateModeUI();
    };

    const updateModeUI = () => {
      const mode = document.querySelector('input[name="edit-request-mode"]:checked')?.value || 'guest';
      if (mode === 'account') {
        accountSection.classList.remove('hidden');
        guestSection.classList.add('hidden');
        accountLabel.classList.add('border-amber-400', 'bg-amber-50');
        accountLabel.classList.remove('border-slate-200');
        guestLabel.classList.remove('border-amber-400', 'bg-amber-50');
        guestLabel.classList.add('border-slate-200');
        // For authenticated users, show the form; for unauthenticated, show login prompt
        if (hasSession && accountForm && accountLoginPrompt) {
          accountForm.classList.remove('hidden');
          accountLoginPrompt.classList.add('hidden');
          btnSubmit.disabled = false;
        } else if (accountForm && accountLoginPrompt) {
          accountForm.classList.add('hidden');
          accountLoginPrompt.classList.remove('hidden');
          btnSubmit.disabled = true;
        }
      } else {
        accountSection.classList.add('hidden');
        guestSection.classList.remove('hidden');
        btnSubmit.disabled = false;
        guestLabel.classList.add('border-amber-400', 'bg-amber-50');
        guestLabel.classList.remove('border-slate-200');
        accountLabel.classList.remove('border-amber-400', 'bg-amber-50');
        accountLabel.classList.add('border-slate-200');
      }
    };

    radios.forEach(radio => {
      radio.onchange = updateModeUI;
    });

    // Account mode: redirect to login/create (for unauthenticated users)
    if (goLoginLink) {
      goLoginLink.onclick = (e) => {
        e.preventDefault();
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
        const authOverlay = document.getElementById('auth-overlay');
        if (authOverlay) authOverlay.style.display = 'flex';
        const loginForm = document.getElementById('auth-login-form');
        const createForm = document.getElementById('auth-create-form');
        const codeForm = document.getElementById('auth-code-form');
        if (loginForm) loginForm.classList.remove('hidden');
        if (createForm) createForm.classList.add('hidden');
        if (codeForm) codeForm.classList.add('hidden');
      };
    }
    if (goCreateLink) {
      goCreateLink.onclick = (e) => {
        e.preventDefault();
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
        const authOverlay = document.getElementById('auth-overlay');
        if (authOverlay) authOverlay.style.display = 'flex';
        const loginForm = document.getElementById('auth-login-form');
        const createForm = document.getElementById('auth-create-form');
        const codeForm = document.getElementById('auth-code-form');
        if (loginForm) loginForm.classList.add('hidden');
        if (createForm) createForm.classList.remove('hidden');
        if (codeForm) codeForm.classList.add('hidden');
      };
    }

    btnCancel.onclick = () => {
      overlay.classList.add('hidden');
      overlay.classList.remove('flex');
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
      }
    };

    // ─── Guest Mode: Add / Edit / Delete ───────────────────────────────────

    const renderGuestLists = () => {
      // Add list
      if (proposedAddList) {
        if (this._proposedAdd.length === 0) {
          proposedAddList.innerHTML = '<p class="text-[10px] text-slate-400 text-center py-2">Chưa có thành viên nào được đề xuất thêm</p>';
        } else {
          proposedAddList.innerHTML = '';
          this._proposedAdd.forEach((item, idx) => {
            const el = document.createElement('div');
            el.className = 'flex items-center justify-between gap-1 bg-emerald-50 border border-emerald-200 rounded-lg p-2';
            el.innerHTML = `
              <div class="flex-1 min-w-0">
                <span class="text-[10px] font-semibold text-emerald-700">${this.escapeHtml(item.member_name)}</span>
                ${item.member_code ? `<span class="text-[10px] text-slate-400"> (${this.escapeHtml(item.member_code)})</span>` : ''}
              </div>
              <button class="remove-proposed-item text-red-500 hover:text-red-700 text-xs px-1" data-idx="${idx}">✗</button>
            `;
            proposedAddList.appendChild(el);
          });
          proposedAddList.querySelectorAll('.remove-proposed-item').forEach(btn => {
            btn.onclick = () => {
              this._proposedAdd.splice(parseInt(btn.dataset.idx), 1);
              renderGuestLists();
            };
          });
        }
      }

      // Edit list
      if (proposedEditList) {
        if (this._proposedEdit.length === 0) {
          proposedEditList.innerHTML = '<p class="text-[10px] text-slate-400 text-center py-2">Chưa có thay đổi nào được đề xuất</p>';
        } else {
          proposedEditList.innerHTML = '';
          this._proposedEdit.forEach((item, idx) => {
            const fieldLabel = fieldOptions.find(f => f.value === item.field)?.label || item.field;
            const el = document.createElement('div');
            el.className = 'flex items-center justify-between gap-1 bg-amber-50 border border-amber-200 rounded-lg p-2';
            el.innerHTML = `
              <div class="flex-1 min-w-0">
                <span class="text-[10px] font-semibold text-slate-700">${this.escapeHtml(item.member_name)} — ${fieldLabel}:</span>
                <span class="text-[10px] text-red-500 line-through">${this.escapeHtml(item.oldValue)}</span>
                <span class="text-[10px] text-slate-400"> → </span>
                <span class="text-[10px] text-emerald-600 font-medium">${this.escapeHtml(item.newValue)}</span>
              </div>
              <button class="remove-proposed-item text-red-500 hover:text-red-700 text-xs px-1" data-idx="${idx}">✗</button>
            `;
            proposedEditList.appendChild(el);
          });
          proposedEditList.querySelectorAll('.remove-proposed-item').forEach(btn => {
            btn.onclick = () => {
              this._proposedEdit.splice(parseInt(btn.dataset.idx), 1);
              renderGuestLists();
            };
          });
        }
      }

      // Delete list
      if (proposedDeleteList) {
        if (this._proposedDelete.length === 0) {
          proposedDeleteList.innerHTML = '<p class="text-[10px] text-slate-400 text-center py-2">Chưa có thành viên nào được đề xuất xoá</p>';
        } else {
          proposedDeleteList.innerHTML = '';
          this._proposedDelete.forEach((item, idx) => {
            const el = document.createElement('div');
            el.className = 'flex items-center justify-between gap-1 bg-red-50 border border-red-200 rounded-lg p-2';
            el.innerHTML = `
              <div class="flex-1 min-w-0">
                <span class="text-[10px] font-semibold text-red-700">${this.escapeHtml(item.member_name)}</span>
                ${item.member_code ? `<span class="text-[10px] text-slate-400"> (${this.escapeHtml(item.member_code)})</span>` : ''}
              </div>
              <button class="remove-proposed-item text-red-500 hover:text-red-700 text-xs px-1" data-idx="${idx}">✗</button>
            `;
            proposedDeleteList.appendChild(el);
          });
          proposedDeleteList.querySelectorAll('.remove-proposed-item').forEach(btn => {
            btn.onclick = () => {
              this._proposedDelete.splice(parseInt(btn.dataset.idx), 1);
              renderGuestLists();
            };
          });
        }
      }
    };

    // Add member (Thêm)
    if (btnAddProposedAdd) {
      btnAddProposedAdd.onclick = () => {
        const memberName = prompt('Nhập tên thành viên cần thêm (ví dụ: Trần Ngọc A):');
        if (!memberName) return;
        const memberCode = prompt('Nhập mã thành viên (nếu có, ví dụ: P001) — để trống nếu không biết:');
        const parentName = prompt('Nhập tên cha/mẹ (nếu có) — để trống nếu không biết:');
        this._proposedAdd.push({
          type: 'add_member',
          member_name: memberName.trim(),
          member_code: memberCode ? memberCode.trim() : null,
          parent_name: parentName ? parentName.trim() : null
        });
        renderGuestLists();
      };
    }

    // Edit member (Sửa)
    if (btnAddProposedEdit) {
      btnAddProposedEdit.onclick = () => {
        const memberName = prompt('Nhập tên thành viên cần sửa (ví dụ: Trần Ngọc A):');
        if (!memberName) return;
        const memberCode = prompt('Nhập mã thành viên (nếu có, ví dụ: P001) — để trống nếu không biết:');
        const field = prompt('Nhập tên trường cần sửa (full_name, christian_name, gender, birth_date, death_date, birth_place, death_place, occupation, spouse, notes, generation):');
        if (!field) return;
        const fieldLabel = fieldOptions.find(f => f.value === field)?.label || field;
        const oldValue = prompt(`Giá trị hiện tại của ${fieldLabel}:`);
        if (oldValue === null) return;
        const newValue = prompt(`Giá trị mới của ${fieldLabel}:`);
        if (newValue === null) return;
        this._proposedEdit.push({
          type: 'update_member',
          member_name: memberName.trim(),
          member_code: memberCode ? memberCode.trim() : null,
          field: field.trim(),
          oldValue: oldValue || '',
          newValue: newValue || ''
        });
        renderGuestLists();
      };
    }

    // Delete member (Xoá)
    if (btnAddProposedDelete) {
      btnAddProposedDelete.onclick = () => {
        const memberName = prompt('Nhập tên thành viên cần xoá (ví dụ: Trần Ngọc A):');
        if (!memberName) return;
        const memberCode = prompt('Nhập mã thành viên (nếu có, ví dụ: P001) — để trống nếu không biết:');
        this._proposedDelete.push({
          type: 'delete_member',
          member_name: memberName.trim(),
          member_code: memberCode ? memberCode.trim() : null
        });
        renderGuestLists();
      };
    }

    // ─── Account Mode: Add / Edit / Delete ──────────────────────────────────

    const renderAccountLists = () => {
      // Add list
      if (proposedAddListAccount) {
        if (this._proposedAdd.length === 0) {
          proposedAddListAccount.innerHTML = '<p class="text-[10px] text-slate-400 text-center py-2">Chưa có thành viên nào được đề xuất thêm</p>';
        } else {
          proposedAddListAccount.innerHTML = '';
          this._proposedAdd.forEach((item, idx) => {
            const el = document.createElement('div');
            el.className = 'flex items-center justify-between gap-1 bg-emerald-50 border border-emerald-200 rounded-lg p-2';
            el.innerHTML = `
              <div class="flex-1 min-w-0">
                <span class="text-[10px] font-semibold text-emerald-700">${this.escapeHtml(item.member_name)}</span>
                ${item.member_code ? `<span class="text-[10px] text-slate-400"> (${this.escapeHtml(item.member_code)})</span>` : ''}
              </div>
              <button class="remove-proposed-item text-red-500 hover:text-red-700 text-xs px-1" data-idx="${idx}">✗</button>
            `;
            proposedAddListAccount.appendChild(el);
          });
          proposedAddListAccount.querySelectorAll('.remove-proposed-item').forEach(btn => {
            btn.onclick = () => {
              this._proposedAdd.splice(parseInt(btn.dataset.idx), 1);
              renderAccountLists();
            };
          });
        }
      }

      // Edit list
      if (proposedEditListAccount) {
        if (this._proposedEdit.length === 0) {
          proposedEditListAccount.innerHTML = '<p class="text-[10px] text-slate-400 text-center py-2">Chưa có thay đổi nào được đề xuất</p>';
        } else {
          proposedEditListAccount.innerHTML = '';
          this._proposedEdit.forEach((item, idx) => {
            const fieldLabel = fieldOptions.find(f => f.value === item.field)?.label || item.field;
            const el = document.createElement('div');
            el.className = 'flex items-center justify-between gap-1 bg-amber-50 border border-amber-200 rounded-lg p-2';
            el.innerHTML = `
              <div class="flex-1 min-w-0">
                <span class="text-[10px] font-semibold text-slate-700">${this.escapeHtml(item.member_name)} — ${fieldLabel}:</span>
                <span class="text-[10px] text-red-500 line-through">${this.escapeHtml(item.oldValue)}</span>
                <span class="text-[10px] text-slate-400"> → </span>
                <span class="text-[10px] text-emerald-600 font-medium">${this.escapeHtml(item.newValue)}</span>
              </div>
              <button class="remove-proposed-item text-red-500 hover:text-red-700 text-xs px-1" data-idx="${idx}">✗</button>
            `;
            proposedEditListAccount.appendChild(el);
          });
          proposedEditListAccount.querySelectorAll('.remove-proposed-item').forEach(btn => {
            btn.onclick = () => {
              this._proposedEdit.splice(parseInt(btn.dataset.idx), 1);
              renderAccountLists();
            };
          });
        }
      }

      // Delete list
      if (proposedDeleteListAccount) {
        if (this._proposedDelete.length === 0) {
          proposedDeleteListAccount.innerHTML = '<p class="text-[10px] text-slate-400 text-center py-2">Chưa có thành viên nào được đề xuất xoá</p>';
        } else {
          proposedDeleteListAccount.innerHTML = '';
          this._proposedDelete.forEach((item, idx) => {
            const el = document.createElement('div');
            el.className = 'flex items-center justify-between gap-1 bg-red-50 border border-red-200 rounded-lg p-2';
            el.innerHTML = `
              <div class="flex-1 min-w-0">
                <span class="text-[10px] font-semibold text-red-700">${this.escapeHtml(item.member_name)}</span>
                ${item.member_code ? `<span class="text-[10px] text-slate-400"> (${this.escapeHtml(item.member_code)})</span>` : ''}
              </div>
              <button class="remove-proposed-item text-red-500 hover:text-red-700 text-xs px-1" data-idx="${idx}">✗</button>
            `;
            proposedDeleteListAccount.appendChild(el);
          });
          proposedDeleteListAccount.querySelectorAll('.remove-proposed-item').forEach(btn => {
            btn.onclick = () => {
              this._proposedDelete.splice(parseInt(btn.dataset.idx), 1);
              renderAccountLists();
            };
          });
        }
      }
    };

    // Add member (Thêm) - Account mode
    if (btnAddProposedAddAccount) {
      btnAddProposedAddAccount.onclick = () => {
        const memberName = prompt('Nhập tên thành viên cần thêm (ví dụ: Trần Ngọc A):');
        if (!memberName) return;
        const memberCode = prompt('Nhập mã thành viên (nếu có, ví dụ: P001) — để trống nếu không biết:');
        const parentName = prompt('Nhập tên cha/mẹ (nếu có) — để trống nếu không biết:');
        this._proposedAdd.push({
          type: 'add_member',
          member_name: memberName.trim(),
          member_code: memberCode ? memberCode.trim() : null,
          parent_name: parentName ? parentName.trim() : null
        });
        renderAccountLists();
      };
    }

    // Edit member (Sửa) - Account mode
    if (btnAddProposedEditAccount) {
      btnAddProposedEditAccount.onclick = () => {
        const memberName = prompt('Nhập tên thành viên cần sửa (ví dụ: Trần Ngọc A):');
        if (!memberName) return;
        const memberCode = prompt('Nhập mã thành viên (nếu có, ví dụ: P001) — để trống nếu không biết:');
        const field = prompt('Nhập tên trường cần sửa (full_name, christian_name, gender, birth_date, death_date, birth_place, death_place, occupation, spouse, notes, generation):');
        if (!field) return;
        const fieldLabel = fieldOptions.find(f => f.value === field)?.label || field;
        const oldValue = prompt(`Giá trị hiện tại của ${fieldLabel}:`);
        if (oldValue === null) return;
        const newValue = prompt(`Giá trị mới của ${fieldLabel}:`);
        if (newValue === null) return;
        this._proposedEdit.push({
          type: 'update_member',
          member_name: memberName.trim(),
          member_code: memberCode ? memberCode.trim() : null,
          field: field.trim(),
          oldValue: oldValue || '',
          newValue: newValue || ''
        });
        renderAccountLists();
      };
    }

    // Delete member (Xoá) - Account mode
    if (btnAddProposedDeleteAccount) {
      btnAddProposedDeleteAccount.onclick = () => {
        const memberName = prompt('Nhập tên thành viên cần xoá (ví dụ: Trần Ngọc A):');
        if (!memberName) return;
        const memberCode = prompt('Nhập mã thành viên (nếu có, ví dụ: P001) — để trống nếu không biết:');
        this._proposedDelete.push({
          type: 'delete_member',
          member_name: memberName.trim(),
          member_code: memberCode ? memberCode.trim() : null
        });
        renderAccountLists();
      };
    }

    btnSubmit.onclick = async () => {
      const mode = document.querySelector('input[name="edit-request-mode"]:checked')?.value || 'guest';
      const guestName = guestNameInput ? guestNameInput.value.trim() : '';
      let reason = '';
      if (mode === 'account') {
        reason = accountReasonInput ? accountReasonInput.value.trim() : '';
      } else {
        reason = reasonInput.value.trim();
      }
      if (!reason) {
        errorEl.textContent = 'Lý do không được để trống';
        errorEl.classList.remove('hidden');
        return;
      }
      errorEl.classList.add('hidden');
      try {
        // Build proposed_changes array for server
        const proposedChanges = [
          ...this._proposedAdd.map(a => ({
            type: 'add_member',
            new_value: a.new_value || null,  // Full member object for server
            member_name: a.member_name || null,
            member_code: a.member_code || null
          })),
          ...this._proposedEdit.map(e => ({
            type: 'update_member',
            member_id: e.member_id || null,  // For server to find member
            member_name: e.member_name || null,
            member_code: e.member_code || null,
            field: e.field,
            old_value: e.oldValue,
            new_value: e.newValue
          })),
          ...this._proposedDelete.map(d => ({
            type: 'delete_member',
            member_id: d.member_id || null,  // For server to find member
            member_name: d.member_name || null,
            member_code: d.member_code || null
          }))
        ];

        let body;
        let headers = { 'Content-Type': 'application/json' };

        if (mode === 'account' && hasSession) {
          // Authenticated user: submit with session token
          const sessionToken = localStorage.getItem('session_token');
          headers['Authorization'] = 'Bearer ' + sessionToken;
          body = JSON.stringify({
            is_guest: false,
            title: reason,
            proposed_changes: proposedChanges
          });
        } else {
          // Guest mode
          body = JSON.stringify({
            is_guest: true,
            title: reason,
            guest_name: guestName || this.currentUser?.username || 'Khách',
            proposed_changes: proposedChanges
          });
        }

        const res = await apiFetch(`/api/lineage/${this.lineageId}/edit-requests`, {
          method: 'POST',
          headers,
          body
        });
        const data = await res.json();
        if (res.ok) {
          overlay.classList.add('hidden');
          overlay.classList.remove('flex');
          this.showToast('Đã gửi yêu cầu chỉnh sửa. Admin sẽ xem xét.', 'success');
        } else {
          errorEl.textContent = data.error || 'Thất bại';
          errorEl.classList.remove('hidden');
        }
      } catch {
        errorEl.textContent = 'Lỗi kết nối';
        errorEl.classList.remove('hidden');
      }
    };
  }

  // ─── Notification System ───────────────────────────────────────────────────

  setupNotificationBell() {
    const bellWrapper = document.getElementById('notification-bell-wrapper');
    const bellBtn = document.getElementById('btn-notification-bell');
    const dropdown = document.getElementById('notification-dropdown');
    const badge = document.getElementById('notification-badge');
    const listEl = document.getElementById('notification-list');
    const countEl = document.getElementById('notification-count');

    if (!bellWrapper || !bellBtn) return;

    // Only show for admin
    if (this.userRole !== 'admin') {
      bellWrapper.classList.add('hidden');
      bellWrapper.classList.remove('flex');
      return;
    }

    bellWrapper.classList.remove('hidden');
    bellWrapper.classList.add('flex');

    // Toggle dropdown
    bellBtn.onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('hidden');
      if (!dropdown.classList.contains('hidden')) {
        this.loadEditRequests();
      }
    };

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && !bellBtn.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });

    // Initial load
    this.loadEditRequests();

    // Poll every 15 seconds
    if (this._notifPollTimer) clearInterval(this._notifPollTimer);
    this._notifPollTimer = setInterval(() => {
      this.loadEditRequests();
    }, 15000);
  }

  async loadEditRequests() {
    const badge = document.getElementById('notification-badge');
    const listEl = document.getElementById('notification-list');
    const countEl = document.getElementById('notification-count');
    if (!listEl || !this.lineageId) return;

    try {
      const sessionToken = localStorage.getItem('session_token');
      if (!sessionToken) return;
      const res = await apiFetch(`/api/lineage/${this.lineageId}/edit-requests`, {
        headers: { 'Authorization': 'Bearer ' + sessionToken }
      });
      if (!res.ok) return;
      const data = await res.json();
      const pending = (data.edit_requests || []).filter(er => er.status === 'pending');

      // Update badge
      if (pending.length > 0) {
        badge.textContent = pending.length;
        badge.classList.remove('hidden');
        badge.classList.add('flex');
      } else {
        badge.classList.add('hidden');
        badge.classList.remove('flex');
      }
      if (countEl) countEl.textContent = `${pending.length} yêu cầu`;

      // Render list
      if (pending.length === 0) {
        listEl.innerHTML = '<div class="p-4 text-center text-xs text-slate-400">Không có yêu cầu nào.</div>';
        return;
      }

      listEl.innerHTML = '';
      const fieldLabels = {
        full_name: 'Họ và Tên', christian_name: 'Tên Thánh', gender: 'Giới Tính',
        birth_date: 'Ngày Sinh', death_date: 'Ngày Mất', birth_place: 'Nơi Sinh',
        death_place: 'Nơi Mất', occupation: 'Nghề Nghiệp', spouse: 'Vợ/Chồng',
        notes: 'Ghi Chú', generation: 'Đời', member_code: 'Mã Thành Viên'
      };
      for (const er of pending) {
        const div = document.createElement('div');
        div.className = 'px-3 py-2.5 border-b border-slate-50 hover:bg-slate-50 transition-colors';
        const time = new Date(er.created_at).toLocaleString('vi-VN');
        const requester = er.is_guest ? `Khách: ${er.requester_name || 'Không tên'}` : er.requester_username || 'Unknown';

        // Build proposed changes detail
        let proposedChangesHtml = '';
        if (er.proposed_changes && er.proposed_changes.length > 0) {
          proposedChangesHtml = '<div class="mt-1.5 space-y-0.5">';
          for (const c of er.proposed_changes) {
            const fieldName = fieldLabels[c.field] || c.field;
            const memberInfo = c.member_name ? `(${c.member_name})` : '';
            const oldValue = c.old_value !== undefined && c.old_value !== null ? String(c.old_value) : '(trống)';
            const newValue = c.new_value !== undefined && c.new_value !== null ? String(c.new_value) : '(trống)';
            proposedChangesHtml += `
              <div class="text-[10px] bg-white rounded p-1.5 border border-slate-100">
                <span class="font-semibold text-slate-700">${fieldName}${memberInfo}:</span>
                <span class="text-red-500 line-through">${this.escapeHtml(oldValue)}</span>
                <span class="text-slate-400"> → </span>
                <span class="text-emerald-600 font-medium">${this.escapeHtml(newValue)}</span>
              </div>
            `;
          }
          proposedChangesHtml += '</div>';
        }

        div.innerHTML = `
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <p class="text-xs font-semibold text-slate-800 truncate">${this.escapeHtml(er.title)}</p>
              <p class="text-[10px] text-slate-500">${requester} • ${time}</p>
              ${er.description ? `<p class="text-[10px] text-slate-400 mt-0.5 truncate">${this.escapeHtml(er.description)}</p>` : ''}
              ${proposedChangesHtml}
            </div>
            <div class="flex items-center space-x-1 flex-shrink-0">
              <button class="approve-edit-req px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold transition-colors" data-id="${er.id}">✓</button>
              <button class="reject-edit-req px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-700 rounded text-[10px] font-bold transition-colors" data-id="${er.id}">✗</button>
            </div>
          </div>
        `;
        listEl.appendChild(div);
      }

      // Bind approve buttons
      listEl.querySelectorAll('.approve-edit-req').forEach(btn => {
        btn.onclick = () => this.approveEditRequest(btn.dataset.id);
      });
      // Bind reject buttons
      listEl.querySelectorAll('.reject-edit-req').forEach(btn => {
        btn.onclick = () => this.rejectEditRequest(btn.dataset.id);
      });
    } catch (err) {
      console.error('Failed to load edit requests:', err);
    }
  }

  async approveEditRequest(requestId) {
    try {
      const sessionToken = localStorage.getItem('session_token');
      const res = await apiFetch(`/api/lineage/${this.lineageId}/edit-requests/${requestId}/approve`, {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer ' + sessionToken }
      });
      if (res.ok) {
        this.showToast('Đã chấp nhận yêu cầu chỉnh sửa.', 'success');
        // Reload lineage data to reflect applied changes
        await this.loadInitialData();
        this.loadEditRequests();
      }
    } catch (err) {
      this.showToast('Lỗi kết nối', 'error');
    }
  }

  async rejectEditRequest(requestId) {
    const reason = prompt('Lý do từ chối (tùy chọn):');
    try {
      const sessionToken = localStorage.getItem('session_token');
      const res = await apiFetch(`/api/lineage/${this.lineageId}/edit-requests/${requestId}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sessionToken },
        body: JSON.stringify({ reason: reason || '' })
      });
      if (res.ok) {
        this.showToast('Đã từ chối yêu cầu chỉnh sửa.', 'success');
        this.loadEditRequests();
      }
    } catch (err) {
      this.showToast('Lỗi kết nối', 'error');
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ─── User Display ──────────────────────────────────────────────────────────

  updateUserDisplay() {
    const display = document.getElementById('user-display');
    const avatar = document.getElementById('user-avatar');
    const username = document.getElementById('user-username');
    const roleBadge = document.getElementById('user-role-badge');

    if (!display || !this.currentUser) return;

    display.classList.remove('hidden');
    display.classList.add('flex');
    avatar.textContent = (this.currentUser.username || 'U')[0].toUpperCase();
    username.textContent = this.currentUser.username;

    const roleLabels = { admin: 'Quản trị', editor: 'Chỉnh sửa', viewer: 'Chỉ xem' };
    const roleColors = {
      admin: 'bg-red-100 text-red-700',
      editor: 'bg-blue-100 text-blue-700',
      viewer: 'bg-slate-100 text-slate-600'
    };
    roleBadge.textContent = roleLabels[this.userRole] || this.userRole;
    roleBadge.className = `text-[9px] px-1.5 py-0.2 rounded-full font-medium ${roleColors[this.userRole] || ''}`;
  }

  setupLogout() {
    const btn = document.getElementById('btn-logout');
    if (!btn) return;
    btn.onclick = async () => {
      if (!confirm('Bạn có chắc muốn đăng xuất?')) return;
      try {
        await apiFetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + localStorage.getItem('session_token') }
        });
      } catch {}
      // Clear notification poll timer
      if (this._notifPollTimer) {
        clearInterval(this._notifPollTimer);
        this._notifPollTimer = null;
      }
      // Clear local state
      localStorage.removeItem('session_token');
      this.isAuthenticated = false;
      this.userRole = null;
      this.currentUser = null;
      this.lineageId = null;
      // Hide user display
      const display = document.getElementById('user-display');
      if (display) {
        display.classList.add('hidden');
        display.classList.remove('flex');
      }
      // Hide notification dropdown
      const notifDropdown = document.getElementById('notification-dropdown');
      if (notifDropdown) notifDropdown.classList.add('hidden');
      // Hide notification bell
      const bellWrapper = document.getElementById('notification-bell-wrapper');
      if (bellWrapper) {
        bellWrapper.classList.add('hidden');
        bellWrapper.classList.remove('flex');
      }
      // Show auth overlay
      const overlay = document.getElementById('auth-overlay');
      if (overlay) overlay.style.display = 'flex';
      // Show login form
      const loginForm = document.getElementById('auth-login-form');
      const createForm = document.getElementById('auth-create-form');
      const codeForm = document.getElementById('auth-code-form');
      if (loginForm) loginForm.classList.remove('hidden');
      if (createForm) createForm.classList.add('hidden');
      if (codeForm) codeForm.classList.add('hidden');
      this.showToast('Đã đăng xuất thành công.', 'success');
    };
  }

  setupSearch() {
    const searchInput = document.getElementById('global-search');
    searchInput.oninput = (e) => {
      const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
      const q = normalize(e.target.value.trim());
      if (!q) { document.getElementById('search-status').textContent = ''; return; }

      const match = this.dataStore.getAllMembers().find(m => 
        normalize(m.full_name).includes(q) ||
        normalize(m.christian_name).includes(q) ||
        normalize(m.id) === q
      );

      if (match) {
        this.dataStore.selectMember(match.id);
        window.dispatchEvent(new CustomEvent('node-selected-for-inspector', { detail: match.id }));
      }
      document.getElementById('search-status').textContent = match ? `Đã tìm thấy ${match.full_name}` : 'Không tìm thấy thành viên';
    };
  }

  revealMemberOnTree(memberId) {
    if (!this.dataStore.getMember(memberId)) return;
    if (!this.canvas.layoutData?.positions.has(memberId)) {
      this.canvas.activeFilter='ALL';
      document.getElementById('select-branch-filter').value='ALL';
      this.canvas.render();
    }
    document.getElementById('left-menu-pane').classList.remove('drawer-open');
    document.getElementById('left-menu-backdrop').classList.remove('drawer-open');
    this.dataStore.selectMember(memberId);
    this.populateInspector(memberId);
    requestAnimationFrame(()=>this.canvas.focusOnMember(memberId));
  }

  setupHeaderMenus() {
    if (this.headerMenusReady) return;
    this.headerMenusReady = true;
    const menus = [...document.querySelectorAll('.header-menu')];
    const close = () => menus.forEach(menu => { menu.classList.remove('is-open'); menu.firstElementChild.setAttribute('aria-expanded','false'); });
    menus.forEach(menu => {
      const button = menu.firstElementChild;
      button.onclick = () => { const open = !menu.classList.contains('is-open'); close(); menu.classList.toggle('is-open',open); button.setAttribute('aria-expanded',String(open)); };
      menu.querySelector('.dropdown-menu').addEventListener('click',close);
    });
    document.addEventListener('click',event => { if (!event.target.closest('.header-menu')) close(); });
    document.addEventListener('keydown',event => { if(event.key==='Escape') close(); });
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
