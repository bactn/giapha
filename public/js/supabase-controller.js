import { getSupabaseClient, signInWithGoogle } from './supabase-client.js';
import { GenealogyService, describeError, snapshotChanges } from './services/genealogy.js';
import { oauthReturnMessage } from './services/auth.js';
import { FamilyPortal } from './portal.js';

const $ = id => document.getElementById(id);
const copy = value => JSON.parse(JSON.stringify(value));
const roles = { admin: 'Quản trị', editor: 'Chỉnh sửa', viewer: 'Chỉ xem' };
const fieldNames = { full_name: 'Họ tên', christian_name: 'Tên thánh', birth_date: 'Ngày sinh', death_date: 'Ngày mất', notes: 'Ghi chú', parent_id: 'Cha/mẹ', spouse_id: 'Phối ngẫu', generation: 'Thế hệ', sibling_order:'Thứ tự anh/chị/em' };

export class SupabaseController {
  constructor(app) { this.app = app; this.user = null; this.base = null; }

  async init() {
    this.initializing = true;
    this.authBox = document.createElement('div');
    this.authBox.id = 'sb-auth'; this.authBox.className = 'sb-card';
    $('auth-overlay').firstElementChild.appendChild(this.authBox);
    this.portal = new FamilyPortal(this);
    this.app.updateUserDisplay = () => this.portal.workspaceUser();
    ['auth-login-form', 'auth-create-form', 'auth-code-form', 'backend-unavailable'].forEach(id => $(id).style.display = 'none');
    this.app.loadInitialData = () => this.load();
    this.app.setupLogout = () => this.setupLogout();
    this.app.setupNotificationBell = () => this.setupNotifications();
    this.app.setupSharePanel = () => this.setupSharing();
    this.app.setupEditRequestModal = () => this.setupProposal();
    this.app.setupAuthUI = () => this.showLogin();
    this.app.dataStore.subscribe(() => this.app.updateStatsDisplay());
    $('lineage-religion').style.display = 'none';
    $('lineage-origin').textContent = '';
    $('lineage-title').textContent = 'Cây gia phả';
    $('stats-summary').textContent = '';
    $('outline-count-badge').textContent = '0';
    window.addEventListener('beforeunload', event => {
      if (this.hasDraft()) { event.preventDefault(); event.returnValue = ''; }
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && this.poll) this.checkAccess(); });
    const oauthMessage = oauthReturnMessage(location.href);
    try {
      this.client = await getSupabaseClient();
      this.service = new GenealogyService(this.client);
      this.client.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          this.recovery = true;
          queueMicrotask(() => this.showRecovery());
        }
        if (event === 'SIGNED_OUT' && !this.signingOut) {
          this.user = null; this.app.dataStore.readOnly = true;
          this.stopPoll(); this.showLogin('Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.');
        }
        // Do not await another Supabase request inside an Auth callback.
        if (event === 'SIGNED_IN' && !this.initializing && !this.user && !this.authenticating && session) {
          queueMicrotask(() => this.restore().catch(error => this.showLogin(describeError(error))));
        }
      });
      if (oauthMessage) {
        history.replaceState(null, '', this.callbackUrl());
        this.showLogin(oauthMessage);
        return;
      }
      const params = new URLSearchParams(location.hash.slice(1));
      const query = new URLSearchParams(location.search);
      const invite = params.get('invite') || query.get('invite');
      if (invite) {
        if (await this.openViewerInvite(invite)) return;
        sessionStorage.setItem('giapha_invite', invite); history.replaceState(null,'',this.callbackUrl()+'#mine');
      }
      this.shareToken = params.get('share') || query.get('share');
      if (this.shareToken) {
        const { data } = await this.client.auth.getUser();
        this.user = data.user;
        await this.openShared(this.shareToken);
      } else await this.restore();
    } catch (error) { this.showLogin(describeError(error)); }
    finally { this.initializing = false; }
  }

  async restore() {
    const { data, error } = await this.client.auth.getUser();
    if (!data.user) { this.user = null; await this.portal.route(); return; }
    if (error) throw error;
    this.user = data.user;
    try { await this.portal.loadProfile(); } catch { this.profile = null; }
    if (this.recovery) { this.showRecovery(); return; }
    const invite = sessionStorage.getItem('giapha_invite');
    if (invite) {
      try {
        const id = await this.service.redeem(invite);
        sessionStorage.removeItem('giapha_invite');
        sessionStorage.removeItem('giapha_return');
        this.shareToken = null; this.publicSlug = null;
        const rows = await this.service.list();
        const row = rows.find(row => row.lineage_id === id);
        if (!row) throw new Error('Liên kết đã hết hạn hoặc được thu hồi.');
        await this.open(id,row.role);
        return;
      } catch (error) {
        sessionStorage.removeItem('giapha_invite');
        this.app.showToast(describeError(error), 'error');
      }
    }
    const destination = sessionStorage.getItem('giapha_return');
    if (destination) { sessionStorage.removeItem('giapha_return'); history.replaceState(null,'',this.callbackUrl()+'#'+destination); }
    await this.portal.route();
  }

  overlay() { if (this.portal) this.portal.presentAuth(); else $('auth-overlay').style.display = 'flex'; }
  message(text) { const el = $('sb-message'); if (el) el.textContent = text; }
  async action(button, fn) {
    button.disabled = true;
    try { await fn(); } catch (error) { this.message(describeError(error)); this.app.showToast(describeError(error), 'error'); }
    finally { button.disabled = false; }
  }
  callbackUrl() { return new URL('index.html', location.href).href.split(/[?#]/)[0]; }

  showLogin(message = '') {
    this.overlay();
    this.emailMode = 'login';
    this.authBox.innerHTML = `<p class="portal-eyebrow">KẾT NỐI VỚI GIA ĐÌNH</p><h2>Chào mừng bạn trở về.</h2><p class="portal-auth-description">Đăng nhập để cùng lưu giữ câu chuyện dòng họ.</p>
      <button id="sb-google" class="sb-google" type="button">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48"><path fill="#4285F4" d="M43.61 24.46c0-1.36-.12-2.66-.35-3.92H24v7.42h11a9.4 9.4 0 0 1-4.08 6.18v5.14h6.61c3.87-3.56 6.08-8.81 6.08-14.82Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.82 13.53-4.95l-6.61-5.14c-1.83 1.23-4.17 1.96-6.92 1.96-5.32 0-9.83-3.59-11.44-8.42H5.73v5.3A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.56 27.45a12 12 0 0 1 0-6.9v-5.3H5.73a20 20 0 0 0 0 17.5l6.83-5.3Z"/><path fill="#EA4335" d="M24 12.13c3 0 5.69 1.03 7.8 3.05l5.86-5.86A19.6 19.6 0 0 0 24 4 20 20 0 0 0 5.73 15.25l6.83 5.3C14.17 15.72 18.68 12.13 24 12.13Z"/></svg>
        <span>Tiếp tục với Google</span>
      </button>
      <p class="sb-auth-hint">Dùng tài khoản Google để đăng nhập hoặc đăng ký nhanh.</p>
      <p id="sb-message" role="status" class="sb-message"></p>
      <div id="sb-email-auth" hidden>
      <div class="sb-auth-divider"><span>hoặc dùng email và mật khẩu</span></div>
      <p class="portal-auth-section">2. Sử dụng email và mật khẩu</p>
      <div class="portal-auth-tabs"><button type="button" id="sb-mode-login" aria-pressed="true">Đăng nhập</button><button type="button" id="sb-mode-signup" aria-pressed="false">Tạo tài khoản</button></div>
      <form id="sb-login">
      <label for="sb-email">Email</label><input id="sb-email" type="email" autocomplete="username" required>
      <label for="sb-password">Mật khẩu</label><input id="sb-password" type="password" autocomplete="current-password" minlength="8" required>
      <div id="sb-name-wrapper" hidden><label for="sb-name">Tên hiển thị</label><input id="sb-name" autocomplete="nickname" maxlength="200"></div>
      <div class="sb-actions"><button id="sb-signin" class="sb-primary" type="submit">Đăng nhập</button>
      <button id="sb-signup" class="sb-primary" type="button" hidden>Tạo tài khoản</button><button id="sb-forgot" type="button">Quên mật khẩu</button></div></form></div>`;
    this.message(message);
    if (!sessionStorage.getItem('giapha_return')) sessionStorage.setItem('giapha_return','mine');
    const mode = value => {
      this.emailMode = value;
      $('sb-name-wrapper').hidden = value !== 'signup'; $('sb-name').required = value === 'signup';
      $('sb-signin').hidden = value === 'signup'; $('sb-signup').hidden = value !== 'signup'; $('sb-forgot').hidden = value === 'signup';
      $('sb-password').autocomplete = value === 'signup' ? 'new-password' : 'current-password';
      $('sb-mode-login').setAttribute('aria-pressed',String(value === 'login')); $('sb-mode-signup').setAttribute('aria-pressed',String(value === 'signup')); this.message('');
    };
    $('sb-mode-login').onclick = () => mode('login'); $('sb-mode-signup').onclick = () => mode('signup');
    $('sb-google').onclick = () => this.action($('sb-google'), () => signInWithGoogle(this.callbackUrl()));
    $('sb-login').onsubmit = event => {
      event.preventDefault();
      if (this.emailMode === 'signup') { $('sb-signup').click(); return; }
      this.action($('sb-signin'), async () => {
        this.authenticating = true;
        try {
          const client = this.client || await getSupabaseClient();
          const { error } = await client.auth.signInWithPassword({ email: $('sb-email').value.trim(), password: $('sb-password').value });
          if (error) throw error;
          await this.restore();
        } finally { this.authenticating = false; }
      });
    };
    $('sb-signup').onclick = () => this.action($('sb-signup'), async () => {
      if (!$('sb-login').reportValidity()) return;
      const email = $('sb-email').value.trim();
      const name = $('sb-name').value.trim() || email.split('@')[0];
      this.authenticating = true;
      try {
        const client = this.client || await getSupabaseClient();
        const { data, error } = await client.auth.signUp({ email, password: $('sb-password').value,
          options: { emailRedirectTo: this.callbackUrl(), data: { display_name: name } } });
        if (error) throw error;
        if (data.session) await this.restore();
        else this.message('Kiểm tra hộp thư và xác nhận email, sau đó quay lại đăng nhập. Nếu không nhận được thư, hãy liên hệ quản trị để kiểm tra cấu hình gửi email.');
      } finally { this.authenticating = false; }
    });
    $('sb-forgot').onclick = () => this.action($('sb-forgot'), async () => {
      const email = $('sb-email');
      if (!email.reportValidity() || !email.value) { email.focus(); return; }
      const client = this.client || await getSupabaseClient();
      const { error } = await client.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: this.callbackUrl() });
      if (error) throw error;
      this.message('Nếu email có tài khoản, hướng dẫn đặt lại mật khẩu sẽ được gửi đến hộp thư.');
    });
  }

  showRecovery() {
    this.overlay();
    this.authBox.innerHTML = `<h2>Đặt mật khẩu mới</h2><form id="sb-recovery"><label for="sb-new-password">Mật khẩu mới</label>
      <input id="sb-new-password" type="password" minlength="8" required autocomplete="new-password"><p id="sb-message" class="sb-message" role="status"></p>
      <div class="sb-actions"><button id="sb-update-password" class="sb-primary">Lưu mật khẩu</button></div></form>`;
    $('sb-recovery').onsubmit = event => {
      event.preventDefault();
      this.action($('sb-update-password'), async () => {
        const { error } = await this.client.auth.updateUser({ password: $('sb-new-password').value });
        if (error) throw error;
        this.recovery = false;
        history.replaceState(null, '', this.callbackUrl());
        await this.restore();
      });
    };
  }

  capture() { return copy({ lineageInfo: this.app.dataStore.lineageInfo, members: this.app.dataStore.getAllMembers() }); }
  hasDraft() { return Boolean(this.base && !this.guest && snapshotChanges(this.base, this.capture()).length); }
  canLeave() { return !this.saving && (!this.hasDraft() || confirm('Có bản nháp chưa lưu. Bạn có muốn rời gia phả này? Hãy xuất JSON trước nếu cần sao lưu.')); }

  async showPicker() { return this.portal.showMine(); }

  async openViewerInvite(token) {
    let state;
    try { state = await this.service.shared(token); }
    catch(error) { if (error.code === '42501') return false; throw error; }
    const { data } = await this.client.auth.getUser(); this.user = data.user;
    this.publicSlug = null; this.shareToken = token;
    await this.open(state.lineage_id,'viewer',state);
    history.replaceState(null,'',this.callbackUrl()+'#share='+encodeURIComponent(token));
    return true;
  }

  async openShared(token) {
    this.publicSlug = null; this.shareToken = token;
    try { const state = await this.service.shared(token); await this.open(state.lineage_id,'viewer',state); }
    catch (error) {
      if (error.code === '42501') this.invalidateAccess('Liên kết chia sẻ không hợp lệ, đã hết hạn hoặc đã được thu hồi.');
      else throw error;
    }
  }

  invalidateAccess(message) {
    this.stopPoll(); this.base = null; this.guest = false; this.shareToken = null; this.publicSlug = null;
    this.app.dataStore.readOnly = true; this.app.lineageId = null; this.app.userRole = 'viewer';
    this.app.dataStore.loadState({ lineageInfo:{name:'',total_members:0,generations:0}, members:[] });
    this.portal.unavailable(message);
  }

  async open(id, role, state = null) {
    const snapshot = state || await this.service.load(id);
    this.guest = Boolean(this.publicSlug || (state && this.shareToken));
    this.app.lineageId = id; this.app.userRole = role; this.app.isAuthenticated = true;
    this.app.currentUser = { id: this.user?.id || null, username: this.guest ? 'Khách (chỉ xem)' : this.profile?.display_name || this.user.user_metadata?.display_name || this.user.user_metadata?.full_name || this.user.email };
    if (!this.ready) {
      this.app.setupResponsiveDrawer(); this.app.setupLeftMenuTabs(); this.app.setupLeftInspector();
      this.app.setupToolbarButtons(); this.app.setupModals(); this.app.setupSearch();
      this.setupSharing(); this.setupProposal();
      this.installNavigation();
      this.ready = true;
    }
    this.app.setupLineageTitle();
    this.applySnapshot(snapshot);
    this.app.applyRoleRestrictions();
    document.body.dataset.access = role;
    this.app.dataStore.readOnly = role === 'viewer';
    document.querySelectorAll('#inspector-form-wrapper input,#inspector-form-wrapper select,#inspector-form-wrapper textarea').forEach(el => { el.disabled = role === 'viewer'; });
    if (role === 'viewer') $('lineage-title').ondblclick = null;
    $('btn-open-import').style.display = role === 'viewer' ? 'none' : '';
    $('btn-reset-data').style.display = 'none';
    $('btn-save-lineage').onclick = () => this.save();
    $('btn-inspect-save').onclick = () => this.save();
    for (const id of ['btn-save-lineage','btn-inspect-save']) {
      const button = $(id); const label = role === 'editor' ? 'Gửi yêu cầu phê duyệt' : 'Lưu gia phả';
      const displayLabel = id === 'btn-save-lineage' ? role === 'editor' ? 'Gửi duyệt' : 'Lưu' : label;
      button.innerHTML = `<svg aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/></svg><span class="workspace-action-label">${displayLabel}</span>`;
      button.setAttribute('aria-label',label);
      button.title = role === 'editor' ? 'Mọi thay đổi cần quản trị viên phê duyệt' : 'Lưu gia phả';
    }
    if (this.guest) $('btn-request-edit').style.display = 'none';
    $('auth-overlay').style.display = 'none';
    this.portal.screen('workspace');
    if (state?.slug) history.replaceState(null,'',this.callbackUrl()+'#family='+encodeURIComponent(state.slug));
    else if (!this.shareToken) history.replaceState(null,'',this.callbackUrl()+'#tree');
    this.setupNotifications();
  }

  applySnapshot(snapshot) {
    this.revision = Number(snapshot.revision);
    this.app.dataStore.loadState(snapshot);
    this.app.dataStore.initializeTracking();
    this.base = this.capture(); this.lastSubmitted = null;
    $('lineage-origin').textContent = String(snapshot.lineageInfo?.origin || '');
    this.app.updateStatsDisplay();
    setTimeout(() => this.app.canvas.zoomFit(), 100);
  }
  async load() {
    try {
      const state = this.publicSlug ? await this.service.openPage(this.publicSlug) : this.guest ? await this.service.shared(this.shareToken) : await this.service.load(this.app.lineageId);
      this.applySnapshot(state);
    } catch (error) { if (error.code === '42501') this.invalidateAccess('Quyền truy cập đã hết hạn hoặc đã được thu hồi.'); else throw error; }
  }

  async save() {
    if (this.saving || this.guest || this.app.userRole === 'viewer') return;
    const snapshot = this.capture();
    const changes = snapshotChanges(this.base, snapshot);
    if (!changes.length) { this.app.showToast('Không có thay đổi cần lưu.'); return; }
    this.saving = true;
    try {
      const { data, error } = await this.client.auth.getUser();
      if (error || !data.user || (this.user && data.user.id !== this.user.id)) { this.app.dataStore.readOnly = true; this.showLogin('Đăng nhập trước khi gửi thay đổi.'); return; }
      if (this.app.userRole === 'editor') {
        const signature = JSON.stringify(changes);
        if (signature === this.lastSubmitted) { this.app.showToast('Bản nháp này đã được gửi và đang chờ duyệt.'); return; }
        await this.service.submit(this.app.lineageId, this.revision, changes, 'Đề xuất cập nhật gia phả');
        this.lastSubmitted = signature;
        this.app.showToast('Đã gửi đề xuất. Dữ liệu chính thức chưa thay đổi.', 'success');
      } else {
        this.revision = Number(await this.service.save(this.app.lineageId, this.revision, snapshot));
        this.base = snapshot;
        this.app.dataStore.initializeTracking(snapshot.members);
        this.app.showToast('Đã lưu gia phả lên Supabase.', 'success');
      }
    } catch (error) { this.app.showToast(describeError(error), 'error'); }
    finally { this.saving = false; }
  }

  installNavigation() {
    const host = $('user-display').parentElement;
    const switcher = document.createElement('button'); switcher.className = 'workspace-icon-button'; switcher.id = 'sb-switch';
    switcher.title = 'Trang chủ'; switcher.setAttribute('aria-label','Trang chủ');
    switcher.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/></svg>';
    switcher.onclick = () => this.portal.go('home');
    const reload = document.createElement('button'); reload.className = 'workspace-icon-button'; reload.id = 'sb-reload'; reload.title = 'Tải lại'; reload.setAttribute('aria-label','Tải lại');
    reload.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M20 7v5h-5M4 17v-5h5M19 11a7 7 0 0 0-12-5L4 9m16 6-3 3A7 7 0 0 1 5 13"/></svg>';
    reload.onclick = () => this.action(reload, async () => { if (this.canLeave()) await this.load(); });
    host.insertBefore(switcher,$('notification-bell-wrapper')); host.insertBefore(reload,$('notification-bell-wrapper'));
    for (const link of document.querySelectorAll('a[href^="/api/download/"]')) {
      link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFFMã ID,Tên Thánh,Họ và Tên,Giới Tính,Thế Hệ,Chi,Nhánh Nội Ngoại,Mã ID Cha/Mẹ,Vợ Chồng,Ngày Sinh,Ngày Mất,Trạng Thái,Vai Trò,Ghi Chú\r\n');
      link.download = 'gia-pha-mau.csv'; link.textContent = '📥 Tải mẫu CSV';
    }
  }

  setupLogout() { /* Account menu owns logout; it is not a persistent toolbar button. */ }

  async logout() {
    if (!this.canLeave()) return;
    this.signingOut = true;
    try {
      const { error } = await this.client.auth.signOut();
      if (error) throw error;
      this.user = null; this.profile = null; this.base = null; this.guest = false; this.publicSlug = null; this.shareToken = null; this.stopPoll();
      this.app.dataStore.loadState({ lineageInfo: { name: '', total_members: 0, generations: 0 }, members: [] });
      this.app.isAuthenticated = false; this.app.lineageId = null;
      $('share-panel-overlay').classList.add('hidden'); $('edit-request-overlay').classList.add('hidden');
      $('notification-dropdown').classList.add('hidden');
      sessionStorage.removeItem('giapha_return');
      sessionStorage.removeItem('giapha_invite');
      await this.portal.go('home');
    } catch (error) { this.app.showToast(describeError(error), 'error'); }
    finally { this.signingOut = false; }
  }

  setupSharing() {
    const overlay = $('share-panel-overlay');
    overlay.innerHTML = `<div class="sb-card" style="width:min(95vw,640px);max-height:85vh;overflow:auto">
      <h2>Chia sẻ gia phả</h2><p class="sb-message">Chỉ xem: mở được không cần đăng nhập. Quyền sửa: cần đăng nhập, mọi thay đổi gửi quản trị phê duyệt. Thu hồi link sẽ ngừng quyền truy cập được cấp qua link đó.</p>
      <label for="sb-link-duration">Thời hạn liên kết</label><select id="sb-link-duration"><option value="7days">7 ngày (mặc định)</option><option value="forever">Không hết hạn — đến khi admin thu hồi</option></select>
      <div class="sb-actions"><button id="sb-share-view">Tạo link chỉ xem</button><button id="sb-invite">Tạo link có quyền sửa</button><button id="sb-share-close">Đóng</button></div>
      <label for="sb-link-result">Liên kết mới (chỉ hiển thị một lần)</label><input id="sb-link-result" readonly><button id="sb-copy-link">Sao chép</button>
      <h2 style="margin-top:1rem">Liên kết còn hiệu lực</h2><div id="sb-links"></div><details><summary>Quyền cấp trực tiếp cho tài khoản</summary><p class="sb-message">Quyền cấp trực tiếp độc lập với link. Thu hồi link không xóa quyền được admin cấp riêng.</p><div id="sb-access"></div></details>
      <button id="sb-open-requests" style="margin-top:1rem">Quản lý yêu cầu phê duyệt</button></div>`;
    const close = () => { overlay.classList.add('hidden'); overlay.classList.remove('flex'); };
    $('sb-share-close').onclick = close;
    $('sb-open-requests').onclick = () => { close(); this.portal.go('requests'); };
    overlay.onclick = event => { if (event.target === overlay) close(); };
    $('btn-open-share').onclick = async () => {
      overlay.classList.remove('hidden'); overlay.classList.add('flex');
      try { await this.refreshSharing(); } catch (error) { this.app.showToast(describeError(error), 'error'); }
    };
    const create = (button, kind, role) => this.action(button, async () => {
      const token = await this.service.link(this.app.lineageId, kind, role, $('sb-link-duration').value);
      const url = new URL(this.callbackUrl()); url.hash = new URLSearchParams({ [kind === 'share' ? 'share' : 'invite']: token });
      $('sb-link-result').value = url.href; await this.refreshSharing();
    });
    $('sb-share-view').onclick = () => create($('sb-share-view'), 'share', 'viewer');
    $('sb-invite').onclick = () => create($('sb-invite'), 'invite', 'editor');
    $('sb-copy-link').onclick = () => this.action($('sb-copy-link'), async () => {
      if ($('sb-link-result').value) { await navigator.clipboard.writeText($('sb-link-result').value); this.app.showToast('Đã sao chép.'); }
    });
  }

  row(container, text) { const row = document.createElement('div'); row.className = 'sb-row'; const label = document.createElement('p'); label.textContent = text; row.appendChild(label); container.appendChild(row); return row; }
  button(row, text, fn) { const button = document.createElement('button'); button.textContent = text; row.appendChild(button); button.onclick = () => this.action(button, fn); return button; }
  async refreshSharing() {
    const id = this.app.lineageId;
    const [links, access] = await Promise.all([this.service.links(id), this.service.accessList(id)]);
    $('sb-links').replaceChildren(); $('sb-access').replaceChildren();
    for (const link of links) {
      const row = this.row($('sb-links'), `${link.kind === 'share' ? 'Chỉ xem · Không cần đăng nhập' : roles[link.role]+' · Cần đăng nhập'} · ${link.expires_at ? 'Hết hạn '+new Date(link.expires_at).toLocaleString('vi-VN') : 'Không hết hạn'}`);
      row.classList.add('sb-link-row');
      this.button(row, 'Thu hồi', async () => { await this.service.revoke(link.id); $('sb-link-result').value = ''; await this.refreshSharing(); });
    }
    if (!links.length) this.row($('sb-links'), 'Chưa có liên kết còn hiệu lực.');
    for (const item of access) {
      const row = this.row($('sb-access'), `${item.user_id === this.user.id ? 'Bạn' : 'Thành viên ' + item.user_id} · ${roles[item.role]}`);
      const select = document.createElement('select'); select.style.width = 'auto';
      for (const [value, label] of Object.entries(roles)) { const option = document.createElement('option'); option.value = value; option.textContent = label; select.appendChild(option); }
      select.value = item.role; row.appendChild(select);
      this.button(row, 'Cập nhật', async () => { await this.service.access(id, item.user_id, select.value); if (item.user_id === this.user.id) { await this.showPicker(); $('share-panel-overlay').classList.add('hidden'); } else await this.refreshSharing(); });
      this.button(row, 'Xóa quyền', async () => { if (confirm('Thu hồi quyền của thành viên này?')) {
        await this.service.access(id, item.user_id, null);
        if (item.user_id === this.user.id) { await this.showPicker(); $('share-panel-overlay').classList.add('hidden'); }
        else await this.refreshSharing();
      } });
    }
  }

  renderRequest(container, request, admin, onReviewed = null) {
    const status = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Đã từ chối' };
    const row = this.row(container, `${request.title} · ${status[request.status]} · ${new Date(request.created_at).toLocaleString('vi-VN')}`);
    const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = `${request.changes.length} thay đổi · phiên bản ${request.base_revision}`;
    details.appendChild(summary);
    for (const change of request.changes) {
      const line = document.createElement('p'); line.className = 'sb-detail';
      line.textContent = change.type === 'add_member' ? `Thêm: ${change.new_value.full_name || ''} (${change.new_value.id})` :
        change.type === 'delete_member' ? `Xóa: ${change.member_id}` : change.type === 'update_info' ? `Đổi thông tin gia phả: ${change.new_value.name}` :
        `Sửa ${change.member_id}: ` + Object.entries(change.new_value).map(([key, value]) => `${fieldNames[key] || key} → ${key === 'sibling_order' && typeof value === 'number' ? value+1 : value ?? ''}`).join('; ');
      details.appendChild(line);
    }
    row.appendChild(details);
    if (request.rejection_reason) this.row(row, request.rejection_reason);
    if (admin && request.status === 'pending') {
      this.button(row, 'Duyệt', async () => {
        if (this.hasDraft()) throw new Error('Hãy lưu hoặc xuất bản nháp trước khi duyệt đề xuất.');
        await this.service.review(request.id, true);
        if (onReviewed) await onReviewed(); else { await this.load(); await this.refreshSharing(); }
      });
      this.button(row, 'Từ chối', async () => {
        const reason = prompt('Lý do từ chối:', '');
        if (reason !== null) { await this.service.review(request.id, false, reason); if (onReviewed) await onReviewed(); else await this.refreshSharing(); }
      });
    }
  }

  setupProposal() {
    const overlay = $('edit-request-overlay');
    overlay.innerHTML = `<div class="sb-card" style="width:min(95vw,460px);max-height:85vh;overflow:auto"><h2>Đề xuất chỉnh sửa</h2><form id="sb-proposal">
      <label for="sb-proposal-type">Thao tác</label><select id="sb-proposal-type"><option value="update_member">Sửa thông tin</option><option value="add_member">Thêm thành viên</option><option value="delete_member">Xóa thành viên</option></select>
      <label for="sb-proposal-member">Thành viên / mã cha mẹ khi thêm</label><select id="sb-proposal-member"></select>
      <label for="sb-proposal-field">Thông tin cần sửa</label><select id="sb-proposal-field"><option value="full_name">Họ và tên</option><option value="christian_name">Tên thánh</option><option value="birth_date">Ngày sinh</option><option value="death_date">Ngày mất</option><option value="notes">Ghi chú</option></select>
      <label for="sb-proposal-value">Giá trị mới / họ tên người thêm</label><input id="sb-proposal-value" maxlength="5000">
      <label for="sb-proposal-reason">Lý do</label><textarea id="sb-proposal-reason" required maxlength="500"></textarea>
      <p id="sb-proposal-error" class="sb-message" role="status"></p><div class="sb-actions"><button id="sb-proposal-send" class="sb-primary">Gửi đề xuất</button><button id="sb-proposal-close" type="button">Đóng</button></div></form></div>`;
    $('sb-proposal-close').onclick = () => { overlay.classList.add('hidden'); overlay.classList.remove('flex'); };
    $('btn-request-edit').onclick = () => {
      if (this.guest || !this.user) { this.app.showToast('Hãy đăng nhập và nhận quyền qua liên kết mời để gửi đề xuất.', 'error'); return; }
      const select = $('sb-proposal-member'); select.replaceChildren();
      const root = document.createElement('option'); root.value = ''; root.textContent = 'Không có / thành viên gốc'; select.appendChild(root);
      for (const member of this.app.dataStore.getAllMembers()) { const option = document.createElement('option'); option.value = member.id; option.textContent = `${member.full_name || ''} (${member.id})`; select.appendChild(option); }
      select.value = this.app.dataStore.selectedMemberId || '';
      $('sb-proposal-error').textContent = ''; overlay.classList.remove('hidden'); overlay.classList.add('flex');
    };
    $('sb-proposal').onsubmit = event => {
      event.preventDefault();
      this.action($('sb-proposal-send'), async () => {
        try {
          const type = $('sb-proposal-type').value; const id = $('sb-proposal-member').value; const value = $('sb-proposal-value').value.trim();
          if (type !== 'add_member' && !id) throw new Error('Vui lòng chọn thành viên.');
          if (type !== 'delete_member' && !value) throw new Error('Vui lòng nhập giá trị mới.');
          let change;
          if (type === 'add_member') {
            const parent = this.app.dataStore.getMember(id);
            change = { type, new_value: { id: 'P' + crypto.randomUUID(), full_name: value, parent_id: id || '-', generation: String(Number(parent?.generation || 0) + 1), gender: 'Nam' } };
          } else if (type === 'delete_member') change = { type, member_id: id };
          else change = { type, member_id: id, new_value: { [$('sb-proposal-field').value]: value } };
          await this.service.submit(this.app.lineageId, this.revision, [change], $('sb-proposal-reason').value.trim());
          overlay.classList.add('hidden'); this.app.showToast('Đã gửi đề xuất chờ quản trị duyệt.', 'success');
        } catch (error) { $('sb-proposal-error').textContent = describeError(error); throw error; }
      });
    };
  }

  stopPoll() { clearInterval(this.poll); this.poll = null; }
  setupNotifications() {
    this.stopPoll();
    const host = $('notification-bell-wrapper');
    host.classList.toggle('hidden', Boolean(this.guest)); host.classList.toggle('flex', !this.guest);
    if (!this.app.lineageId) return;
    this.poll = setInterval(() => { if (!document.hidden) this.checkAccess(); },30000);
    if (this.guest) return;
    $('btn-notification-bell').onclick = () => this.portal.go('requests');
    this.refreshNotifications();
  }
  async checkAccess() {
    const id = this.app.lineageId;
    const screen = this.portal.sequence;
    if (!id || document.body.dataset.screen !== 'workspace') return;
    try {
      const allowed = await this.service.canRead(id, this.guest ? this.shareToken || null : null, this.publicSlug || null);
      if (!allowed) throw { code:'42501' };
      if (id === this.app.lineageId && screen === this.portal.sequence && !this.guest) await this.refreshNotifications();
    } catch(error) { if (error.code === '42501' && id === this.app.lineageId && screen === this.portal.sequence) this.invalidateAccess('Liên kết hoặc quyền truy cập đã hết hạn hoặc đã được thu hồi.'); }
  }
  async refreshNotifications() {
    try {
      const id = this.app.lineageId; const requests = await this.service.requests(id);
      if (id !== this.app.lineageId) return;
      const pending = requests.filter(r => r.status === 'pending').length;
      $('notification-badge').textContent = String(pending); $('notification-badge').classList.toggle('hidden', !pending);
      $('notification-count').textContent = `${pending} đề xuất chờ duyệt`;
      $('notification-list').replaceChildren();
      for (const request of requests.slice(0, 20)) this.renderRequest($('notification-list'), request, false);
      if (!requests.length) this.row($('notification-list'), 'Chưa có đề xuất.');
    } catch (error) { /* Polling must not discard drafts or repeatedly interrupt the user. */ }
  }
}
