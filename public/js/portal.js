import { escapeHTML as esc } from './html.js';
import { describeError } from './services/genealogy.js';

const $ = id => document.getElementById(id);
const roleNames = { admin: 'Quản trị', editor: 'Chỉnh sửa', viewer: 'Chỉ xem' };
export const slugify = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-$/, '');
export function portalRoute(hash) {
  const raw = hash.replace(/^#/, '');
  for (const page of ['share','invite']) if (raw.startsWith(page+'=')) return { page, value: new URLSearchParams(raw).get(page) };
  if (raw.startsWith('family=')) return { page: 'family', value: new URLSearchParams(raw).get('family') };
  if (raw.startsWith('publication=')) return { page: 'publication', value: new URLSearchParams(raw).get('publication') };
  return { page: ['login','mine','account','requests','tree'].includes(raw) ? raw : 'home' };
}

export class FamilyPortal {
  constructor(controller) {
    this.c = controller; this.root = $('portal-root'); this.sequence = 0;
    document.body.classList.add('portal-enabled');
    document.addEventListener('click', event => {
      const action = event.target.closest('[data-portal]');
      if (action) this.handle(action).catch(error => this.error(error));
      else if (!event.target.closest('.portal-user')) this.closeMenus();
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') this.closeMenus(); });
    window.addEventListener('hashchange', () => this.route().catch(error => this.error(error)));
    this.screen('home');
    if (portalRoute(location.hash).page === 'home' && !/^#(share|invite)=/.test(location.hash)) this.home().catch(error => this.error(error));
    else this.root.innerHTML = '<div class="portal-loading"><span class="portal-brand-mark">GP</span><p>Đang mở không gian gia đình…</p></div>';
  }
  get service() { return this.c.service; }
  name() { return this.c.profile?.display_name || this.c.user?.user_metadata?.display_name || this.c.user?.user_metadata?.full_name || this.c.user?.email || 'Tài khoản'; }
  closeMenus() { document.querySelectorAll('.portal-menu').forEach(el => el.hidden = true); document.querySelectorAll('[data-portal="menu"]').forEach(el => el.setAttribute('aria-expanded','false')); }
  menu(workspace = false) {
    if (!this.c.user) return `<button class="portal-btn ${workspace ? 'portal-small' : ''}" data-portal="login">Đăng nhập</button>`;
    return `<div class="portal-user"><button type="button" class="portal-user-trigger" data-portal="menu" aria-expanded="false" aria-label="Thông tin tài khoản"><span class="portal-avatar">${esc(this.name().charAt(0).toUpperCase())}</span><span class="portal-user-name">${esc(this.name())}${workspace ? `<small>${roleNames[this.c.app.userRole] || 'Chỉ xem'}</small>` : ''}</span><span aria-hidden="true">⌄</span></button>
      <div class="portal-menu" hidden><span class="portal-menu-email">${esc(this.c.user.email)}</span><button data-portal="account">Thông tin tài khoản</button><button data-portal="mine">Gia phả của tôi</button><button data-portal="requests">Yêu cầu phê duyệt</button><button data-portal="home">Trang chủ</button><hr><button id="${workspace ? 'btn-logout' : 'portal-logout'}" data-portal="logout" class="portal-danger">Đăng xuất</button></div></div>`;
  }
  header() {
    return `<header class="portal-header"><a class="portal-brand" href="#home"><span class="portal-brand-mark">GP</span><span>Gia phả<small>DÒNG HỌ TRẦN NGỌC</small></span></a><nav aria-label="Điều hướng chính"><a href="#about" data-anchor="about">Cội nguồn</a><a href="#directory" data-anchor="directory">Gia phả công khai</a><a href="#memories" data-anchor="memories">Ký ức gia đình</a></nav><div class="portal-header-actions">${this.c.user ? `<button class="portal-btn portal-outline portal-hide-mobile" data-portal="mine">Vào gia phả <span>↗</span></button>` : ''}${this.menu()}</div></header>`;
  }
  footer() { return `<footer class="portal-footer"><a class="portal-brand" href="#home"><span class="portal-brand-mark">GP</span><span>Gia phả<small>GÌN GIỮ CỘI NGUỒN · KẾT NỐI THẾ HỆ</small></span></a><p>Mỗi người một câu chuyện. Cùng nhau một dòng họ.</p><a href="#home">Về đầu trang ↑</a></footer>`; }
  screen(name) {
    this.sequence++; document.body.dataset.screen = name;
    $('workspace-shell').hidden = name !== 'workspace'; this.root.hidden = name === 'workspace';
    $('auth-overlay').style.display = 'none';
    if (name !== 'workspace') {
      this.c.stopPoll();
      ['share-panel-overlay','edit-request-overlay','notification-dropdown'].forEach(id => $(id)?.classList.add('hidden'));
      document.querySelectorAll('[id^="modal-"]').forEach(el => el.classList.add('hidden'));
      window.scrollTo(0,0);
    }
  }
  render(content, name = 'portal') { this.screen(name); this.root.innerHTML = this.header() + content + this.footer(); return this.sequence; }
  error(error) { const message = describeError(error); const el = $('portal-message'); if (el) el.textContent = message; this.c.app.showToast(message, 'error'); }
  unavailable(message) { this.render(`<main class="portal-dashboard"><h1>Không thể mở gia phả</h1><p class="portal-page-intro">${esc(message)}</p><a class="portal-btn" href="#home">Về trang chủ</a></main>`); }
  async busy(button, fn) { button.disabled = true; try { await fn(); } catch(error) { this.error(error); } finally { button.disabled = false; } }
  async go(page) {
    history.pushState(null,'',`${this.c.callbackUrl()}#${page}`);
    await this.route();
  }
  async handle(button) {
    const action = button.dataset.portal;
    if (action === 'menu') {
      const menu = button.parentElement.querySelector('.portal-menu'); const open = menu.hidden; this.closeMenus(); menu.hidden = !open; button.setAttribute('aria-expanded',String(open)); return;
    }
    this.closeMenus();
    if (action === 'logout') return this.c.logout();
    if (action === 'family') return this.go('family=' + encodeURIComponent(button.dataset.slug));
    if (action === 'open') {
      if (!this.c.canLeave()) return;
      return this.busy(button, async () => { this.c.publicSlug = null; this.c.shareToken = null; await this.c.open(button.dataset.id,button.dataset.role); });
    }
    if (action === 'publication') return this.go('publication=' + button.dataset.id);
    if (action === 'tree') return this.backToTree();
    if (['home','mine','login','account','requests'].includes(action)) return this.go(action);
  }
  async route() {
    const route = portalRoute(location.hash);
    if (route.page === 'home') { sessionStorage.removeItem('giapha_return'); return this.home(); }
    if (route.page === 'share') {
      if (!this.c.canLeave() || !this.service) return;
      await this.c.openShared(route.value);
      return;
    }
    if (route.page === 'invite') {
      if (!this.c.canLeave()) return;
      sessionStorage.setItem('giapha_invite',route.value); sessionStorage.setItem('giapha_return','mine');
      if (!this.c.user) this.c.showLogin('Đăng nhập để chỉnh sửa gia phả. Mọi thay đổi sẽ gửi quản trị viên phê duyệt.'); else await this.c.restore();
      return;
    }
    if (route.page === 'login') { sessionStorage.setItem('giapha_return','mine'); this.c.showLogin(); return; }
    if (route.page === 'family') return this.openPublic(route.value);
    if (route.page === 'tree') return this.backToTree();
    if (!this.c.user) { sessionStorage.setItem('giapha_return',location.hash.slice(1)); this.c.showLogin('Đăng nhập để tiếp tục.'); return; }
    if (route.page === 'mine') return this.showMine();
    if (route.page === 'account') return this.account();
    if (route.page === 'requests') return this.requests();
    if (route.page === 'publication') return this.publication(route.value);
  }
  async home() {
    const seq = this.render(`<main class="portal-home"><section class="portal-hero"><div class="portal-hero-copy"><p class="portal-eyebrow"><span></span> MỘT DÒNG HỌ · NHIỀU THẾ HỆ</p><h1>Gìn giữ cội nguồn.<br><em>Kết nối mai sau.</em></h1><p class="portal-lead">Một nơi để những câu chuyện được lưu giữ,<br class="portal-hide-mobile"> những thế hệ được nối liền, và mỗi người tìm thấy nơi mình thuộc về.</p><div class="portal-hero-actions"><button class="portal-btn" data-portal="mine">Khám phá gia phả <span>↗</span></button><a href="#about" data-anchor="about" class="portal-text-link">Câu chuyện dòng họ ↓</a></div><div class="portal-hero-note"><span class="portal-tree-icon">♧</span><p>Từ những nhánh nhỏ,<br><strong>cùng vun một gốc bền lâu.</strong></p></div></div><figure class="portal-hero-image"><img src="./images/heritage-courtyard.jpg" alt="Sân nhà truyền thống Việt Nam trong nắng sớm, ảnh minh hoạ" fetchpriority="high"><figcaption>Không gian cội nguồn · Ảnh minh hoạ AI</figcaption><div class="portal-image-label"><span>GIA ĐÌNH LÀ ĐIỂM KHỞI ĐẦU</span><p>Đi xa để lớn.<br>Trở về để nhớ.</p></div></figure></section>
      <section class="portal-intro" id="about"><div><p class="portal-eyebrow">CÂU CHUYỆN CỦA CHÚNG TA</p><h2>Biết mình từ đâu.<br>Hiểu mình thuộc về.</h2></div><div><p>Gia phả dòng họ Trần Ngọc là không gian cùng nhau gìn giữ những mối nối giữa ông bà, cha mẹ, con cháu — để câu chuyện của gia đình được tiếp tục qua từng thế hệ.</p><p>Từ việc tìm một nhánh họ, ghi lại một kỷ niệm đến bổ sung thông tin còn thiếu, mỗi đóng góp đều làm đầy thêm ký ức chung.</p><a class="portal-text-link" href="#mine">Góp thêm một mảnh ký ức ↗</a></div></section>
      <section class="portal-directory" id="directory"><div class="portal-section-heading"><div><p class="portal-eyebrow">NHỮNG NHÁNH HỌ KẾT NỐI</p><h2>Khám phá gia phả</h2></div><p>Ghé thăm những gia phả được quản trị<br>chủ động chia sẻ với mọi người.</p></div><form id="portal-search" class="portal-search"><span aria-hidden="true">⌕</span><input id="portal-search-input" aria-label="Tìm dòng họ hoặc quê quán" placeholder="Tìm theo tên dòng họ hoặc quê quán…"><button class="portal-btn" type="submit">Tìm kiếm</button></form><div id="portal-public-list" class="portal-family-grid" aria-live="polite"><p class="portal-empty">Đang tải các gia phả công khai…</p></div><p id="portal-message" class="portal-feedback" role="status"></p></section>
      <section class="portal-memories" id="memories"><figure><img src="./images/family-album.jpg" alt="Album gia đình và sổ ghi chép, ảnh minh hoạ" loading="lazy"><figcaption>Những trang ký ức · Ảnh minh hoạ AI</figcaption></figure><div><p class="portal-eyebrow">ĐỂ KÝ ỨC KHÔNG PHAI</p><h2>Có những điều<br>chỉ gia đình mới kể.</h2><p>Một mái nhà xưa. Một cái tên quen. Một câu chuyện được kể lại trong những lần sum họp. Giữ lấy hôm nay, để mai này con cháu còn tìm thấy.</p><div class="portal-memory-tags"><span>Ghi nhớ cội nguồn</span><span>Gắn kết thế hệ</span><span>Cùng nhau gìn giữ</span></div><button class="portal-btn portal-outline" data-portal="mine">Về với gia phả của bạn ↗</button></div></section><section class="portal-invite-banner"><span>TIẾP NỐI CÂU CHUYỆN GIA ĐÌNH</span><h2>Gia phả được gìn giữ<br>từ những đóng góp nhỏ.</h2><button class="portal-btn portal-light" data-portal="mine">Cùng nhau kết nối ↗</button></section></main>`, 'home');
    this.root.querySelectorAll('[data-anchor]').forEach(link => link.onclick = event => { event.preventDefault(); $(link.dataset.anchor)?.scrollIntoView({behavior:'smooth'}); });
    let searchVersion = 0;
    const load = async search => {
      if (!this.service) return;
      const version = ++searchVersion;
      try { const rows = await this.service.publicLineages(search); if (seq !== this.sequence || version !== searchVersion) return; this.publicCards(rows); }
      catch(error) { if (seq === this.sequence) { $('portal-public-list').textContent = 'Chưa thể tải danh sách. Bạn vẫn có thể vào gia phả bằng liên kết được chia sẻ.'; this.error(error); } }
    };
    $('portal-search').onsubmit = event => { event.preventDefault(); this.busy(event.submitter, () => load($('portal-search-input').value.trim())); };
    if (!this.service) return; // Public introduction can render while Auth is starting.
    await load('');
    if (seq === this.sequence && ['about','directory','memories'].includes(location.hash.slice(1))) $(location.hash.slice(1))?.scrollIntoView();
  }
  publicCards(rows) {
    $('portal-public-list').innerHTML = rows.length ? rows.map(row => `<article class="portal-family-card"><div class="portal-family-cover"><span>GP</span><small>GIA PHẢ CÔNG KHAI</small></div><div class="portal-family-content"><p class="portal-eyebrow">${esc(row.region || 'CỘI NGUỒN GIA ĐÌNH')}</p><h3>${esc(row.title)}</h3><p>${esc(row.intro || 'Cùng tìm hiểu những nhánh họ và câu chuyện được nối tiếp qua các thế hệ.')}</p><div><span>${Number(row.member_count)} thành viên</span><button data-portal="family" data-slug="${esc(row.slug)}" class="portal-text-link">Xem gia phả ↗</button></div></div></article>`).join('') : `<div class="portal-empty"><span>♧</span><h3>Những kết nối bắt đầu từ sự sẻ chia.</h3><p>Chưa có gia phả được bật công khai. Nếu bạn đã nhận được liên kết riêng, hãy mở liên kết đó để truy cập.</p><button class="portal-text-link" data-portal="mine">Vào gia phả của tôi ↗</button></div>`;
  }
  presentAuth() {
    this.render(`<main class="portal-auth"><section class="portal-auth-story"><img src="./images/heritage-courtyard.jpg" alt="Mái nhà truyền thống, ảnh minh hoạ"><div><p class="portal-eyebrow">CHÀO MỪNG BẠN TRỞ VỀ</p><h1>Mỗi kết nối<br>là một lần<br><em>gần nhau hơn.</em></h1><p>Cùng lưu giữ câu chuyện dòng họ,<br>cho hôm nay và những thế hệ mai sau.</p><small>Ảnh minh hoạ AI</small></div></section><section class="portal-auth-panel"><a href="#home" class="portal-text-link">← Về trang chủ</a><div id="portal-auth-slot"></div><p class="portal-auth-footnote">Gia phả riêng tư chỉ hiển thị với người có quyền truy cập.</p></section></main>`, 'auth');
    $('portal-auth-slot').appendChild(this.c.authBox);
  }
  async loadProfile() {
    if (!this.c.user) return;
    const saved = await this.service.profile(this.c.user.id);
    this.c.profile = { display_name: saved?.display_name || this.c.user.user_metadata?.display_name || this.c.user.user_metadata?.full_name || this.c.user.email.split('@')[0], phone:saved?.phone || '', address:saved?.address || '' };
  }
  workspaceUser() {
    const host = $('user-display'); host.classList.remove('hidden'); host.classList.add('flex'); host.innerHTML = this.menu(true);
  }
  backToTree() {
    if (!this.c.base || !this.c.app.lineageId) return this.showMine();
    this.screen('workspace'); history.replaceState(null,'',this.c.callbackUrl()+'#'+(this.c.shareToken ? 'share='+encodeURIComponent(this.c.shareToken) : this.c.publicSlug ? 'family='+encodeURIComponent(this.c.publicSlug) : 'tree')); this.c.setupNotifications();
    setTimeout(() => this.c.app.canvas.zoomFit(),50);
  }
  async showMine() {
    if (!this.c.user) { sessionStorage.setItem('giapha_return','mine'); return this.c.showLogin(); }
    const seq = this.render(`<main class="portal-dashboard"><div class="portal-dashboard-heading"><div><p class="portal-eyebrow">KHÔNG GIAN GIA ĐÌNH</p><h1>Gia phả của tôi</h1><p>Những dòng họ bạn đang cùng gìn giữ.</p></div>${this.c.base ? '<button class="portal-btn portal-outline" data-portal="tree">Trở lại cây đang mở ↗</button>' : ''}</div><p id="portal-message" class="portal-feedback" role="status"></p><div id="portal-my-list" class="portal-family-grid"><p>Đang tải gia phả…</p></div><section class="portal-create"><div><p class="portal-eyebrow">MỘT KHỞI ĐẦU MỚI</p><h2>Thêm một nhánh kết nối.</h2><p>Tạo không gian riêng cho gia đình. Chỉ người được cấp quyền mới có thể xem.</p></div><form id="portal-create-form"><label for="portal-family-name">Tên dòng họ / chi nhánh</label><input id="portal-family-name" required maxlength="200" placeholder="Tên dòng họ của bạn"><button class="portal-btn" type="submit">Tạo gia phả riêng ↗</button></form></section></main>`);
    const rows = await this.service.list(this.c.user.id); if (seq !== this.sequence) return;
    this.myRows = rows;
    $('portal-my-list').innerHTML = rows.length ? rows.map(row => `<article class="portal-owned-card"><div class="portal-owned-symbol">♧</div><span class="portal-role">${roleNames[row.role]}</span><h2>${esc(row.lineages?.info?.name || 'Gia phả')}</h2><p>${esc(row.lineages?.info?.origin || 'Không gian gia đình')}</p><div class="portal-owned-actions"><button class="portal-btn" data-portal="open" data-id="${row.lineage_id}" data-role="${row.role}">Mở gia phả ↗</button>${row.role === 'admin' ? `<button class="portal-text-link" data-portal="publication" data-id="${row.lineage_id}">Giới thiệu & công khai</button>` : ''}</div></article>`).join('') : '<div class="portal-empty"><h2>Bạn chưa tham gia gia phả nào.</h2><p>Mở lời mời của gia đình hoặc tạo một gia phả mới bên dưới.</p></div>';
    $('portal-create-form').onsubmit = event => { event.preventDefault(); if (!this.c.canLeave()) return; this.busy(event.submitter, async () => { const id = await this.service.create($('portal-family-name').value.trim()); this.c.publicSlug = null; this.c.shareToken = null; await this.c.open(id,'admin'); }); };
  }
  async account() {
    const version = this.sequence; await this.loadProfile(); if(version !== this.sequence) return; const p = this.c.profile;
    this.render(`<main class="portal-dashboard portal-narrow"><p class="portal-eyebrow">TÀI KHOẢN CỦA BẠN</p><h1>Thông tin cá nhân</h1><p class="portal-page-intro">Thông tin liên hệ chỉ bạn có thể xem và chỉnh sửa.</p><form id="portal-profile-form" class="portal-form-card"><div class="portal-profile-heading"><span class="portal-avatar portal-avatar-large">${esc(this.name().charAt(0))}</span><div><h2>${esc(this.name())}</h2><p>Hồ sơ thành viên</p></div></div><label for="profile-email">Email đăng nhập <small>Được quản lý bởi tài khoản đăng nhập</small></label><input id="profile-email" type="email" value="${esc(this.c.user.email)}" readonly><label for="profile-name">Tên hiển thị</label><input id="profile-name" value="${esc(p.display_name)}" maxlength="200" required><div class="portal-form-grid"><div><label for="profile-phone">Số điện thoại</label><input id="profile-phone" type="tel" autocomplete="tel" maxlength="40" value="${esc(p.phone)}"></div><div><label for="profile-address">Địa chỉ</label><input id="profile-address" autocomplete="street-address" maxlength="1000" value="${esc(p.address)}"></div></div><p id="portal-message" class="portal-feedback" role="status"></p><div class="portal-form-actions"><button class="portal-btn" type="submit">Lưu thông tin</button><button class="portal-text-link" data-portal="mine" type="button">Về gia phả của tôi</button></div></form></main>`);
    $('portal-profile-form').onsubmit = event => { event.preventDefault(); this.busy(event.submitter, async () => { const profile = {display_name:$('profile-name').value.trim(),phone:$('profile-phone').value.trim(),address:$('profile-address').value.trim()}; if (!profile.display_name) throw new Error('Vui lòng nhập tên hiển thị.'); await this.service.saveProfile(profile); this.c.profile = profile; this.c.app.currentUser && (this.c.app.currentUser.username = this.name()); const header = this.root.querySelector('.portal-header'); if (header) header.outerHTML = this.header(); const heading = this.root.querySelector('.portal-profile-heading h2'); if (heading) heading.textContent = this.name(); if (this.c.app.currentUser) this.workspaceUser(); $('portal-message').textContent = 'Đã lưu thông tin tài khoản.'; this.c.app.showToast('Đã cập nhật hồ sơ.','success'); }); };
  }
  async publication(id) {
    const rows = await this.service.list(this.c.user.id); const own = rows.find(row => row.lineage_id === id && row.role === 'admin');
    if (!own) throw new Error('Bạn cần quyền quản trị để thay đổi công khai gia phả.');
    const saved = await this.service.publication(id);
    const p = saved || {slug:slugify(own.lineages.info.name)+'-'+id.slice(0,8),intro:'',region:own.lineages.info.origin || '',is_public:false};
    this.render(`<main class="portal-dashboard portal-narrow"><p class="portal-eyebrow">CHIA SẺ VỚI CỘNG ĐỒNG</p><h1>Giới thiệu & công khai</h1><p class="portal-page-intro">${esc(own.lineages.info.name)}</p><form id="portal-publication-form" class="portal-form-card"><label for="publication-slug">Đường dẫn gia phả</label><input id="publication-slug" value="${esc(p.slug)}" pattern="[a-z0-9]+(-[a-z0-9]+)*" minlength="3" maxlength="100" required><small>Chữ thường không dấu, số và dấu gạch nối.</small><label for="publication-region">Quê quán / khu vực</label><input id="publication-region" value="${esc(p.region)}" maxlength="200"><label for="publication-intro">Giới thiệu dòng họ</label><textarea id="publication-intro" rows="5" maxlength="2000">${esc(p.intro)}</textarea><label class="portal-check"><input id="publication-public" type="checkbox" ${p.is_public ? 'checked' : ''}><span><strong>Công khai cây gia phả</strong><small>Hiện trong danh sách công khai, mọi người có thể xem tên, quan hệ và ngày sinh/mất. Ghi chú, số điện thoại, email và địa chỉ không được công khai.</small></span></label><p id="portal-message" class="portal-feedback" role="status"></p><div class="portal-form-actions"><button class="portal-btn">Lưu thiết lập</button><button type="button" class="portal-text-link" id="publication-copy" ${saved ? '' : 'disabled'}>Sao chép liên kết</button></div></form></main>`);
    $('publication-copy').onclick = () => this.busy($('publication-copy'), async () => { if ($('publication-slug').value !== p.slug) throw new Error('Lưu thiết lập trước khi sao chép liên kết mới.'); await navigator.clipboard.writeText(this.c.callbackUrl()+'#family='+encodeURIComponent(p.slug)); $('portal-message').textContent = p.is_public ? 'Đã sao chép liên kết công khai.' : 'Đã sao chép. Gia phả riêng tư vẫn yêu cầu quyền truy cập.'; });
    $('portal-publication-form').onsubmit = event => { event.preventDefault(); this.busy(event.submitter,async () => { const fields = {slug:$('publication-slug').value.trim(),intro:$('publication-intro').value.trim(),region:$('publication-region').value.trim(),is_public:$('publication-public').checked}; if (fields.is_public && !p.is_public && !confirm('Bật công khai để mọi người có thể xem cây gia phả và ngày sinh/mất? Chỉ bật khi gia đình đã đồng ý.')) return; try { await this.service.publish(id,fields); } catch(error) { if(error.code === '23505') throw new Error('Đường dẫn này đã được sử dụng. Vui lòng chọn đường dẫn khác.'); throw error; } Object.assign(p,fields); if ($('publication-copy')) $('publication-copy').disabled = false; $('portal-message').textContent = fields.is_public ? 'Đã công khai gia phả. Bạn có thể sao chép liên kết để chia sẻ.' : 'Đã lưu. Gia phả được giữ riêng tư.'; }); };
  }
  async openPublic(slug) {
    if (!this.c.canLeave()) return;
    try { const state = await this.service.openPage(slug); this.c.publicSlug = state.public_read ? slug : null; this.c.shareToken = null; await this.c.open(state.lineage_id,state.access_role,state); }
    catch(error) { this.c.showLogin('Gia phả đang riêng tư hoặc không còn được chia sẻ. Đăng nhập tài khoản có quyền rồi mở lại liên kết.'); sessionStorage.setItem('giapha_return','family='+encodeURIComponent(slug)); }
  }
  async requests() {
    const rows = await this.service.list(this.c.user.id);
    const selected = rows.find(row => row.lineage_id === this.c.app.lineageId) || rows[0];
    this.render(`<main class="portal-dashboard"><p class="portal-eyebrow">CÙNG GÌN GIỮ THÔNG TIN CHÍNH XÁC</p><h1>Yêu cầu phê duyệt</h1><p class="portal-page-intro">Quản trị xem xét các đóng góp. Thành viên theo dõi yêu cầu của mình.</p><div class="portal-request-toolbar"><label>Gia phả<select id="requests-lineage">${rows.map(row => `<option value="${row.lineage_id}" ${selected?.lineage_id === row.lineage_id ? 'selected' : ''}>${esc(row.lineages?.info?.name || 'Gia phả')}</option>`).join('')}</select></label><label>Trạng thái<select id="requests-status"><option value="pending">Chờ duyệt</option><option value="approved">Đã duyệt</option><option value="rejected">Đã từ chối</option><option value="all">Tất cả</option></select></label></div><p id="portal-message" class="portal-feedback" role="status"></p><div id="portal-requests-list" class="portal-request-list"></div><div class="portal-pagination"><button id="requests-prev">← Trước</button><span id="requests-count"></span><button id="requests-next">Sau →</button></div></main>`);
    const screenVersion = this.sequence;
    let page = 0; let requestVersion = 0;
    const refresh = async () => {
      if (screenVersion !== this.sequence || !$('requests-lineage')) return;
      const version = ++requestVersion; const id = $('requests-lineage').value; const status = $('requests-status').value;
      if (!id) { $('portal-requests-list').innerHTML = '<div class="portal-empty">Bạn chưa tham gia gia phả nào.</div>'; $('requests-prev').disabled = true; $('requests-next').disabled = true; return; }
      const result = await this.service.requestPage(id,status,page); if (version !== requestVersion || screenVersion !== this.sequence || !$('portal-requests-list')) return;
      const list = $('portal-requests-list'); list.replaceChildren();
      const isAdmin = rows.find(row => row.lineage_id === id)?.role === 'admin';
      for (const request of result.rows) this.c.renderRequest(list,request,isAdmin,async () => { if (this.c.app.lineageId === id && this.c.base && !this.c.hasDraft()) await this.c.load(); await refresh(); });
      if (!result.rows.length) list.innerHTML = '<div class="portal-empty"><span>✓</span><h3>Không có yêu cầu trong mục này.</h3><p>Các đóng góp mới sẽ xuất hiện tại đây.</p></div>';
      $('requests-count').textContent = `${result.count} yêu cầu · Trang ${page+1}`; $('requests-prev').disabled = page === 0; $('requests-next').disabled = (page+1)*20 >= result.count;
    };
    $('requests-lineage').onchange = $('requests-status').onchange = () => { page=0; refresh().catch(error => this.error(error)); };
    $('requests-prev').onclick = () => { page--; refresh().catch(error => this.error(error)); };
    $('requests-next').onclick = () => { page++; refresh().catch(error => this.error(error)); };
    await refresh();
  }
}
