# Supabase và GitHub Pages

Project `giapha` (`nwbozmxgdhouhzlpiskd`), Singapore, Free.
Dashboard: https://supabase.com/dashboard/project/nwbozmxgdhouhzlpiskd

## Đã triển khai ngày 05/11/2026

- Giao diện dùng Supabase Auth và Data API trực tiếp khi có cấu hình Supabase.
- Đăng ký, xác nhận email, đăng nhập, khôi phục phiên và đặt lại mật khẩu.
- Chọn/tạo gia phả; tải/lưu snapshot với revision. Lỗi xung đột giữ bản nháp;
  không lấy revision mới rồi tự ghi đè dữ liệu.
- Admin lưu chính thức; editor gửi thay đổi chờ duyệt; viewer có biểu mẫu đề xuất.
- Duyệt/từ chối nguyên tử, chống duyệt hai lần, kiểm tra quan hệ và vòng lặp.
- Mời viewer/editor một lần; liên kết khách chỉ xem có hạn 7 ngày, bỏ ghi chú.
  Có danh sách/thu hồi liên kết; liên kết bị từ chối nếu người tạo mất quyền admin.
- Quản lý quyền và thông báo đề xuất (poll 60 giây khi tab đang hiển thị).
- RLS và RPC kiểm tra quyền trên database, không tin role trong user metadata.
- Đã nhập 350 thành viên từ `data/current_lineage.json` cho tài khoản chủ được
  xác nhận; đối chiếu toàn bộ JSON thành viên và giữ các trường mở rộng.
- Không chuyển session, mật khẩu, mã chia sẻ hoặc tài khoản cũ tự động.
- Bản gốc và manifest SHA-256 nằm trong `data/supabase-backups/`, được Git bỏ qua.
  Không publish thư mục này lên Pages. Bản gốc JSON cũ giữ lại để đối chiếu.

## Chạy cục bộ

Dùng Node.js 22 trở lên (`.nvmrc`):

```sh
npm ci
npm run test:supabase
npm run check:supabase
npm start
```

`.env.local` chứa `SUPABASE_URL` và `SUPABASE_PUBLISHABLE_KEY`, đã được Git bỏ qua.
Máy khác copy `.env.example` rồi điền URL và publishable key từ Dashboard.
Không dùng secret/service-role key. Script chỉ chấp nhận `sb_publishable_...`.

Khi có cấu hình Supabase, `npm start` build và phục vụ frontend tĩnh tại
http://localhost:8080/. Không chạy API JSON cũ. Dùng `npm run be` chỉ khi cần
đối chiếu dữ liệu cũ; không tiếp tục nhập liệu đồng thời trên hai hệ thống.

```sh
npm run build:pages       # dist/
npm run build:pages:docs  # cập nhật docs/ cho Pages release + /docs
```

SDK được bundle tại chỗ, phiên bản khóa trong package-lock.json. Chỉ public assets
được đưa vào dist/docs. Public config và publishable key được phép nằm trong
frontend; quyền dữ liệu do Auth/RLS quyết định.
Ứng dụng được bundle cùng public config và gắn phiên bản theo SHA-256 trên URL,
tránh trình duyệt giữ module cấu hình cũ sau khi GitHub Pages triển khai bản mới.

GitHub Pages dùng branch `release`, folder `/docs`. Workflow `pages.yml` kiểm tra
build và xuất artifact, không tự commit docs và không tự deploy artifact.
Nếu dùng workflow để build, khai báo repository variables `SUPABASE_URL` và
`SUPABASE_PUBLISHABLE_KEY`; không khai báo service-role key.

## Cấu hình Auth đã kiểm tra

Site URL: `https://bactn.github.io/giapha/`

Redirect URLs:

- `https://bactn.github.io/giapha/index.html`
- `http://localhost:8080/index.html`
- `http://127.0.0.1:8092/index.html`
- `http://localhost:8092/index.html`

Sau khi kết thúc thử nghiệm có thể bỏ hai redirect cổng 8092. Nếu xác nhận email
mở ở trình duyệt khác, đăng nhập bằng email/mật khẩu trên trình duyệt đang dùng.
Tài khoản vừa tạo không tự có quyền gia phả khác; cần lời mời hoặc admin cấp quyền.

## Đăng nhập Google

Giao diện có nút **Tiếp tục với Google** cho đăng nhập và đăng ký. Chỉ yêu cầu
`openid email profile`; không xin quyền đọc thư Gmail. Google provider đã bật
trên Supabase khi kiểm tra ngày 06/11/2026. Hướng dẫn cấu hình và nghiệm thu tại
[google-login-setup.md](google-login-setup.md).

OAuth trở về `index.html` dưới cùng thư mục Pages; SDK tiếp nhận phiên đăng nhập.
Lời mời đang mở được giữ trong sessionStorage qua bước chuyển trang. Nếu người
dùng hủy hoặc provider chưa bật, giao diện báo lỗi và vẫn cho dùng email/mật khẩu.
Danh tính cùng email đã xác minh được Supabase xử lý liên kết; client không tự
gộp tài khoản hoặc cấp quyền gia phả theo email/tên Google.

## Vận hành còn cần hoàn tất

1. **SMTP riêng** cho đăng ký/xác nhận bằng email và khôi phục mật khẩu của người
   ngoài nhóm Supabase. Đăng nhập Google không cần gửi email xác nhận qua SMTP.
   Dashboard hiện
   dùng email mặc định; dịch vụ này chỉ gửi tới email thành viên nhóm và giới hạn
   thấp. Cấu hình host/port/user/password/sender tại Auth → Emails → SMTP Settings.
   Chủ tài khoản tự nhập bí mật SMTP, không đưa vào repository/frontend.
   https://supabase.com/docs/guides/auth/auth-smtp
2. Định kỳ xuất JSON từ giao diện sau các đợt cập nhật, giữ bản sao ngoài máy đang
   chạy. Lưu riêng bản sao database qua Supabase CLI khi đã cấu hình quyền truy cập
   quản trị tin cậy. Free không thay thế quy trình sao lưu do chủ dữ liệu quản lý.
3. Security Advisor còn cảnh báo kiểm tra mật khẩu rò rỉ đang tắt. Tính năng này
   cần Pro trở lên; chưa nâng gói hoặc phát sinh chi phí.
   https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
4. Chưa thêm upload ảnh/Storage; giao diện hiện dùng tên và thông tin gia phả.
   Chưa kiểm thử email reset mật khẩu đầu cuối bằng tài khoản thật (người dùng tự
   thao tác mật khẩu). Không tắt xác nhận email để vượt hạn chế SMTP.

## Kiểm chứng

- 16 kiểm tra cấu hình, validation, diff, giữ bản nháp, viewer, escape HTML và OAuth.
- 36 kiểm tra trực tiếp Auth/Data API/RPC trên tài khoản thử: lưu/duyệt/quyền,
  stale revision HTTP 409, rollback, mời một lần, chia sẻ và thu hồi.
- SQL `supabase/tests/genealogy_rls.sql`: cô lập gia phả, chống tự nâng quyền,
  admin cuối cùng, reference/cycle, rollback; fixture trong transaction rollback.
- SQL `supabase/tests/access_links.sql`: hết hạn và người tạo mất quyền admin.
- Đã kiểm tra đăng nhập, tải/lưu và tải lại cây qua trình duyệt bằng dữ liệu thử;
  tên chứa HTML được hiển thị thành chữ, không tạo phần tử trong DOM.
- Máy chủ tĩnh trả 200 cho frontend và 404 cho `/api/lineage`.

Không xóa schema để rollback khi có dữ liệu thật. Nếu cần quay lui, xuất và đối
chiếu dữ liệu Supabase mới nhất trước khi chuyển lại hệ thống JSON cũ.
