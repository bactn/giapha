# Đăng nhập và đăng ký với Google

## Google Cloud

Mở https://console.cloud.google.com/auth/overview và chọn project của ứng dụng.

1. **Branding**: tên ứng dụng, email hỗ trợ và email liên hệ do chủ ứng dụng quản lý.
2. **Audience**: External. Khi ở Testing, thêm email người thử vào Test users.
   Trước khi dùng rộng rãi, kiểm tra yêu cầu của Google để chuyển sang Production.
3. **Data Access**: chỉ `openid`, `userinfo.email`, `userinfo.profile`.
4. **Clients → Create client → Web application**:
   - Authorized JavaScript origins: `https://bactn.github.io` (không có `/giapha/`).
   - Authorized redirect URIs:
     `https://nwbozmxgdhouhzlpiskd.supabase.co/auth/v1/callback`.
5. Chủ tài khoản tự nhập Client ID và Client Secret vào Supabase provider Google,
   bật provider rồi lưu. Không đưa Client Secret vào chat, `.env.local`, source,
   docs, GitHub variables hay frontend. Nếu đã bị lộ, thay secret trong Google.

Không cần bật OAuth Server hoặc tạo OAuth App trong Supabase. Tính năng cần dùng
là **Authentication → Sign In / Providers → Google**:
https://supabase.com/dashboard/project/nwbozmxgdhouhzlpiskd/auth/providers?provider=Google

## Supabase và Pages

- Site URL: `https://bactn.github.io/giapha/`.
- Redirect URL cho frontend: `https://bactn.github.io/giapha/index.html`.
- Callback đăng ký tại Google là địa chỉ Supabase `/auth/v1/callback` ở trên,
  khác với URL frontend. Supabase hoàn tất OAuth rồi chuyển về frontend.
- `npm run check:supabase` báo trạng thái Google provider, không hiển thị secret.
- Nút gọi `signInWithOAuth` và luôn cho chọn tài khoản Google.
- Không cần SMTP cho luồng Google. Email/mật khẩu và quên mật khẩu vẫn dùng SMTP.
- Không giới hạn chỉ `@gmail.com`; tài khoản Google Workspace cũng có thể dùng
  nếu Audience của Google cho phép.

## Tài khoản đang có và phân quyền

Supabase tự liên kết danh tính OAuth có cùng email theo quy tắc xác minh của dịch
vụ. Đăng nhập đúng tài khoản Google đã có quyền sẽ giữ cùng tài khoản/quyền khi
liên kết thành công. Không sửa auth.users hoặc tự gộp UUID bằng email ở client.
Người đăng ký mới cần được mời hoặc admin cấp quyền để đọc gia phả đã có.

## Kiểm tra thực tế

1. Mở website qua HTTPS (không dùng `file://`), bấm **Tiếp tục với Google** khi
   email/mật khẩu còn trống: vẫn phải mở Google.
2. Chọn tài khoản thử được cho phép trong Audience và hoàn tất consent cần thiết.
3. Xác nhận trở về `/giapha/index.html`, thấy danh sách gia phả và quyền đúng.
4. Tải lại trang để kiểm tra phiên; thử đăng xuất và đăng nhập lại.
5. Mở lời mời ở cùng tab rồi đăng nhập Google: lời mời được xử lý sau đăng nhập.
6. Hủy trên Google: thấy thông báo và vẫn dùng được email/mật khẩu. Nếu Google
   provider bị tắt, trang không chuyển sang lỗi JSON của Supabase.

Nếu gặp `redirect_uri_mismatch`, kiểm tra callback ở Google. Nếu `access_denied`,
kiểm tra Test users/Audience hoặc lựa chọn hủy của người dùng. Không tắt kiểm tra
email/nonce, không thay RLS hoặc cấp quyền dữ liệu rộng hơn để xử lý lỗi OAuth.

Tài liệu:

- https://supabase.com/docs/guides/auth/social-sign-in/auth-google
- https://supabase.com/docs/guides/auth/auth-identity-linking
