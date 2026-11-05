import { getSupabaseClient } from './supabase-client.js';
import { GenealogyService, describeError, snapshotChanges } from './services/genealogy.js';

const $ = id => document.getElementById(id);
const copy = value => JSON.parse(JSON.stringify(value));
const roles = { admin: 'Quản trị', editor: 'Chỉnh sửa', viewer: 'Chỉ xem' };
const fieldNames = { full_name: 'Họ tên', christian_name: 'Tên thánh', birth_date: 'Ngày sinh', death_date: 'Ngày mất', notes: 'Ghi chú', parent_id: 'Cha/mẹ', spouse_id: 'Phối ngẫu', generation: 'Thế hệ' };

export class SupabaseController {
  constructor(app) { this.app = app; this.user = null; this.base = null; }

  async init() {
    this.initializing = true;
    this.authBox = document.createElement('div');
    this.authBox.id = 'sb-auth'; this.authBox.className = 'sb-card';
    $('auth-overlay').firstElementChild.appendChild(this.authBox);
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
    try {
      this.client = await getSupabaseClient();
      this.service = new GenealogyService(this.client);
      this.client.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          this.recovery = true;
          queueMicrotask(() => this.showRecovery());
        }
        if (event === 'SIGNED_OUT' && !this.signingOut) {
          this.user = null; this.stopPoll(); this.showLogin('Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.');
        }
        // Do not await another Supabase request inside an Auth callback.
        if (event === 'SIGNED_IN' && !this.initializing && !this.user && !this.authenticating && session) {
          queueMicrotask(() => this.restore().catch(error => this.showLogin(describeError(error))));
        }
      });
      const params = new URLSearchParams(location.hash.slice(1));
      const query = new URLSearchParams(location.search);
      const invite = params.get('invite') || query.get('invite');
      if (invite) sessionStorage.setItem('giapha_invite', invite);
      this.shareToken = params.get('share') || query.get('share');
      if (this.shareToken) {
        const { data } = await this.client.auth.getUser();
        this.user = data.user;
        const state = await this.service.shared(this.shareToken);
        this.guest = true;
        await this.open(state.lineage_id, 'viewer', state);
      } else await this.restore();
    } catch (error) { this.showLogin(describeError(error)); }
    finally { this.initializing = false; }
  }

  async restore() {
    const { data, error } = await this.client.auth.getUser();
    if (!data.user) { this.user = null; this.showLogin(error?.name === 'AuthSessionMissingError' ? '' : ''); return; }
    if (error) throw error;
    this.user = data.user;
    if (this.recovery) { this.showRecovery(); return; }
    const invite = sessionStorage.getItem('giapha_invite');
    if (invite) {
      try {
        await this.service.redeem(invite);
        sessionStorage.removeItem('giapha_invite');
        history.replaceState(null, '', new URL('index.html', location.href));
      } catch (error) {
        sessionStorage.removeItem('giapha_invite');
        this.app.showToast(describeError(error), 'error');
      }
    }
    await this.showPicker();
  }

  overlay() { $('auth-overlay').style.display = 'flex'; }
  message(text) { const el = $('sb-message'); if (el) el.textContent = text; }
  async action(button, fn) {
    button.disabled = true;
    try { await fn(); } catch (error) { this.message(describeError(error)); this.app.showToast(describeError(error), 'error'); }
    finally { button.disabled = false; }
  }
  callbackUrl() { return new URL('index.html', location.href).href.split(/[?#]/)[0]; }

  showLogin(message = '') {
    this.overlay();
    this.authBox.innerHTML = `<h2>Đăng nhập gia phả</h2><form id="sb-login">
      <label for="sb-email">Email</label><input id="sb-email" type="email" autocomplete="username" required>
      <label for="sb-password">Mật khẩu</label><input id="sb-password" type="password" autocomplete="current-password" minlength="8" required>
      <label for="sb-name">Tên hiển thị (khi tạo tài khoản)</label><input id="sb-name" autocomplete="nickname" maxlength="200">
      <p id="sb-message" role="status" class="sb-message"></p>
      <div class="sb-actions"><button id="sb-signin" class="sb-primary" type="submit">Đăng nhập</button>
      <button id="sb-signup" type="button">Tạo tài khoản</button><button id="sb-forgot" type="button">Quên mật khẩu</button></div></form>`;
    this.message(message);
    $('sb-login').onsubmit = event => {
      event.preventDefault();
      this.action($('sb-signin'), async () => {
        this.authenticating = true;
        try {
          const { error } = await this.client.auth.signInWithPassword({ email: $('sb-email').value.trim(), password: $('sb-password').value });
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
        const { data, error } = await this.client.auth.signUp({ email, password: $('sb-password').value,
          options: { emailRedirectTo: this.callbackUrl(), data: { display_name: name } } });
        if (error) throw error;
        if (data.session) await this.restore();
        else this.message('Kiểm tra hộp thư và xác nhận email, sau đó quay lại đăng nhập. Nếu không nhận được thư, hãy liên hệ quản trị để kiểm tra cấu hình gửi email.');
      } finally { this.authenticating = false; }
    });
    $('sb-forgot').onclick = () => this.action($('sb-forgot'), async () => {
      const email = $('sb-email');
      if (!email.reportValidity() || !email.value) { email.focus(); return; }
      const { error } = await this.client.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: this.callbackUrl() });
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

  async showPicker() {
    if (!this.user) { this.showLogin(); return; }
    this.stopPoll(); this.overlay();
    const pickerVersion = this.pickerVersion = (this.pickerVersion || 0) + 1;
    this.authBox.innerHTML = `<h2>Gia phả của bạn</h2><div id="sb-lineages"></div><form id="sb-create-lineage">
      <label for="sb-lineage-name">Tạo gia phả mới</label><input id="sb-lineage-name" placeholder="Tên dòng họ / chi nhánh" required maxlength="200">
      <div class="sb-actions"><button id="sb-create" class="sb-primary">Tạo gia phả</button><button type="button" id="sb-picker-logout">Đăng xuất</button></div>
      <p id="sb-message" role="status" class="sb-message"></p></form>`;
    $('sb-picker-logout').onclick = () => this.logout();
    $('sb-create-lineage').onsubmit = event => {
      event.preventDefault();
      this.action($('sb-create'), async () => {
        const id = await this.service.create($('sb-lineage-name').value.trim());
        await this.open(id, 'admin');
      });
    };
    try {
      const rows = await this.service.list(this.user.id);
      if (pickerVersion !== this.pickerVersion) return;
      if (!rows.length) $('sb-lineages').textContent = 'Bạn chưa có gia phả. Tạo mới hoặc mở liên kết mời của quản trị.';
      for (const row of rows) {
        const button = document.createElement('button');
        button.dataset.lineageId = row.lineage_id;
        button.className = 'sb-row'; button.style.width = '100%'; button.style.textAlign = 'left';
        button.textContent = `${row.lineages?.info?.name || 'Gia phả'} · ${roles[row.role]}`;
        button.onclick = () => this.action(button, () => this.open(row.lineage_id, row.role));
        $('sb-lineages').appendChild(button);
      }
    } catch (error) { this.message(describeError(error)); }
  }

  async open(id, role, state = null) {
    const snapshot = state || await this.service.load(id);
    this.guest = Boolean(state && this.shareToken);
    this.app.lineageId = id; this.app.userRole = role; this.app.isAuthenticated = true;
    this.app.currentUser = { id: this.user?.id || null, username: this.guest ? 'Khách (liên kết)' : this.user.user_metadata?.display_name || this.user.email };
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
    $('auth-overlay').style.display = 'none';
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
    const state = this.guest ? await this.service.shared(this.shareToken) : await this.service.load(this.app.lineageId);
    this.applySnapshot(state);
  }

  async save() {
    if (this.saving || this.guest || this.app.userRole === 'viewer') return;
    const snapshot = this.capture();
    const changes = snapshotChanges(this.base, snapshot);
    if (!changes.length) { this.app.showToast('Không có thay đổi cần lưu.'); return; }
    this.saving = true;
    try {
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
    const switcher = document.createElement('button'); switcher.className = 'sb-button'; switcher.id = 'sb-switch'; switcher.textContent = 'Gia phả của tôi';
    switcher.onclick = () => { if (this.canLeave()) { this.guest = false; this.shareToken = null; history.replaceState(null, '', this.callbackUrl()); this.showPicker(); } };
    const reload = document.createElement('button'); reload.className = 'sb-button'; reload.textContent = 'Tải lại';
    reload.onclick = () => this.action(reload, async () => { if (this.canLeave()) await this.load(); });
    host.append(switcher, reload);
    for (const link of document.querySelectorAll('a[href^="/api/download/"]')) {
      link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFFMã ID,Tên Thánh,Họ và Tên,Giới Tính,Thế Hệ,Chi,Nhánh Nội Ngoại,Mã ID Cha/Mẹ,Vợ Chồng,Ngày Sinh,Ngày Mất,Trạng Thái,Vai Trò,Ghi Chú\r\n');
      link.download = 'gia-pha-mau.csv'; link.textContent = '📥 Tải mẫu CSV';
    }
  }

  setupLogout() {
    $('btn-logout').textContent = this.guest ? (this.user ? 'Gia phả của tôi' : 'Đăng nhập') : 'Đăng xuất';
    $('btn-logout').onclick = () => {
      if (this.guest) {
        this.guest = false; this.shareToken = null; history.replaceState(null, '', this.callbackUrl());
        this.user ? this.showPicker() : this.showLogin();
      } else this.logout();
    };
  }
  async logout() {
    if (!this.canLeave()) return;
    this.signingOut = true;
    try {
      const { error } = await this.client.auth.signOut();
      if (error) throw error;
      this.user = null; this.base = null; this.guest = false; this.stopPoll();
      this.app.dataStore.loadState({ lineageInfo: { name: '', total_members: 0, generations: 0 }, members: [] });
      this.app.isAuthenticated = false; this.app.lineageId = null;
      $('share-panel-overlay').classList.add('hidden'); $('edit-request-overlay').classList.add('hidden');
      $('notification-dropdown').classList.add('hidden');
      this.showLogin();
    } catch (error) { this.app.showToast(describeError(error), 'error'); }
    finally { this.signingOut = false; }
  }

  setupSharing() {
    const overlay = $('share-panel-overlay');
    overlay.innerHTML = `<div class="sb-card" style="width:min(95vw,640px);max-height:85vh;overflow:auto">
      <h2>Chia sẻ và phê duyệt</h2><p class="sb-message">Link chỉ xem có hạn 7 ngày và không hiển thị ghi chú. Link mời dùng một lần, cần đăng nhập.</p>
      <div class="sb-actions"><button id="sb-share-view">Tạo link chỉ xem</button><select id="sb-invite-role" style="width:auto"><option value="viewer">Mời người xem</option><option value="editor">Mời người chỉnh sửa</option></select><button id="sb-invite">Tạo link mời</button><button id="sb-share-close">Đóng</button></div>
      <label for="sb-link-result">Liên kết mới (chỉ hiển thị một lần)</label><input id="sb-link-result" readonly><button id="sb-copy-link">Sao chép</button>
      <h2 style="margin-top:1rem">Liên kết đã tạo</h2><div id="sb-links"></div><h2>Danh sách quyền</h2><div id="sb-access"></div>
      <h2>Đề xuất (100 mục gần nhất)</h2><div id="sb-requests"></div></div>`;
    const close = () => { overlay.classList.add('hidden'); overlay.classList.remove('flex'); };
    $('sb-share-close').onclick = close;
    overlay.onclick = event => { if (event.target === overlay) close(); };
    $('btn-open-share').onclick = async () => {
      overlay.classList.remove('hidden'); overlay.classList.add('flex');
      try { await this.refreshSharing(); } catch (error) { this.app.showToast(describeError(error), 'error'); }
    };
    const create = (button, kind, role) => this.action(button, async () => {
      const token = await this.service.link(this.app.lineageId, kind, role);
      const url = new URL(this.callbackUrl()); url.hash = new URLSearchParams({ [kind === 'share' ? 'share' : 'invite']: token });
      $('sb-link-result').value = url.href; await this.refreshSharing();
    });
    $('sb-share-view').onclick = () => create($('sb-share-view'), 'share', 'viewer');
    $('sb-invite').onclick = () => create($('sb-invite'), 'invite', $('sb-invite-role').value);
    $('sb-copy-link').onclick = () => this.action($('sb-copy-link'), async () => {
      if ($('sb-link-result').value) { await navigator.clipboard.writeText($('sb-link-result').value); this.app.showToast('Đã sao chép.'); }
    });
  }

  row(container, text) { const row = document.createElement('div'); row.className = 'sb-row'; const label = document.createElement('p'); label.textContent = text; row.appendChild(label); container.appendChild(row); return row; }
  button(row, text, fn) { const button = document.createElement('button'); button.textContent = text; row.appendChild(button); button.onclick = () => this.action(button, fn); return button; }
  async refreshSharing() {
    const id = this.app.lineageId;
    const [links, access, requests] = await Promise.all([this.service.links(id), this.service.accessList(id), this.service.requests(id)]);
    $('sb-links').replaceChildren(); $('sb-access').replaceChildren(); $('sb-requests').replaceChildren();
    for (const link of links) {
      const row = this.row($('sb-links'), `${link.kind === 'share' ? 'Chỉ xem' : 'Lời mời'} · ${roles[link.role]} · hết hạn ${new Date(link.expires_at).toLocaleString('vi-VN')} · ${link.revoked ? 'Đã thu hồi' : link.used_at ? 'Đã dùng' : 'Chưa thu hồi'}`);
      if (!link.revoked) this.button(row, 'Thu hồi', async () => { await this.service.revoke(link.id); await this.refreshSharing(); });
    }
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
    for (const request of requests) this.renderRequest($('sb-requests'), request, true);
    if (!requests.length) this.row($('sb-requests'), 'Chưa có đề xuất.');
  }

  renderRequest(container, request, admin) {
    const status = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Đã từ chối' };
    const row = this.row(container, `${request.title} · ${status[request.status]} · ${new Date(request.created_at).toLocaleString('vi-VN')}`);
    const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = `${request.changes.length} thay đổi · phiên bản ${request.base_revision}`;
    details.appendChild(summary);
    for (const change of request.changes) {
      const line = document.createElement('p'); line.className = 'sb-detail';
      line.textContent = change.type === 'add_member' ? `Thêm: ${change.new_value.full_name || ''} (${change.new_value.id})` :
        change.type === 'delete_member' ? `Xóa: ${change.member_id}` : change.type === 'update_info' ? `Đổi thông tin gia phả: ${change.new_value.name}` :
        `Sửa ${change.member_id}: ` + Object.entries(change.new_value).map(([key, value]) => `${fieldNames[key] || key} → ${value ?? ''}`).join('; ');
      details.appendChild(line);
    }
    row.appendChild(details);
    if (request.rejection_reason) this.row(row, request.rejection_reason);
    if (admin && request.status === 'pending') {
      this.button(row, 'Duyệt', async () => {
        if (this.hasDraft()) throw new Error('Hãy lưu hoặc xuất bản nháp trước khi duyệt đề xuất.');
        await this.service.review(request.id, true); await this.load(); await this.refreshSharing();
      });
      this.button(row, 'Từ chối', async () => {
        const reason = prompt('Lý do từ chối:', '');
        if (reason !== null) { await this.service.review(request.id, false, reason); await this.refreshSharing(); }
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
    if (this.guest || !this.app.lineageId) return;
    $('btn-notification-bell').onclick = () => { $('notification-dropdown').classList.toggle('hidden'); this.refreshNotifications(); };
    this.refreshNotifications();
    this.poll = setInterval(() => { if (!document.hidden && this.user) this.refreshNotifications(); }, 60000);
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
