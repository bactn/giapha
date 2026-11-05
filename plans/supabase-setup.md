# Kết nối Supabase — nhánh codex/supabase-integration

Project hiện có: `giapha` (`nwbozmxgdhouhzlpiskd`), Singapore.
Dashboard: https://supabase.com/dashboard/project/nwbozmxgdhouhzlpiskd

## Phạm vi hiện tại

Đây là bước chuẩn bị kết nối: SDK, cấu hình public, kiểm tra Auth và build Pages.
Giao diện đăng nhập/lưu gia phả vẫn đang dùng API Node.js cũ; chưa chuyển sang
Supabase và chưa tạo bảng hoặc nhập dữ liệu. Website release chưa đổi.

## Chạy và kiểm tra

Dùng Node.js 22 trở lên (`.nvmrc`), sau đó:

```sh
npm ci
npm run test:supabase
npm run check:supabase
npm run build:pages
```

`.env.local` đã được cấu hình cục bộ từ project qua plugin Supabase và được Git
bỏ qua. Trên máy khác, copy `.env.example` thành `.env.local` và điền project URL
và publishable key trong Dashboard → Settings → API Keys. Không dùng secret key
hoặc legacy service-role JWT. Script chỉ chấp nhận key `sb_publishable_...`.

`check:supabase` gửi request chỉ đọc tới `/auth/v1/settings`; thành công có nghĩa
là project URL và public key được Auth chấp nhận, không có nghĩa bảng/đăng nhập
người dùng/phân quyền đã hoàn tất.

Build xuất SDK đã bundle và public config vào `dist/`; module
`js/supabase-client.js` cung cấp `getSupabaseClient()` cho bước tích hợp tiếp theo.
Không nạp SDK từ CDN, dependency được khóa trong package-lock.json.
Chạy `npm run build:pages:docs` khi cần cập nhật artifact cho Pages; hiện tại chỉ
kiểm tra `dist/` để không đưa cấu hình mới lên bản release đang phục vụ người dùng.

GitHub Actions dùng repository variables `SUPABASE_URL` và
`SUPABASE_PUBLISHABLE_KEY` khi build. Đây là giá trị công khai, không phải secret
quản trị. Workflow hiện chỉ chạy trên push release hoặc workflow_dispatch;
nhánh Supabase không tự thay đổi website đang chạy.

## Các bước tiếp theo

1. Viết và kiểm thử schema, RLS, RPC theo `plans/supabase-migration.md`.
2. Áp dụng migration lên project đã xác nhận và kiểm tra chính sách bằng nhiều role.
3. Chuyển đăng nhập, tải/lưu gia phả sang các service Supabase.
4. Chuyển duyệt, chia sẻ, thông báo; xác nhận tài khoản chủ dữ liệu và dry-run import.
5. Kiểm thử trên branch rồi mới hợp nhất vào release và build docs.

Không cần tạo Supabase development branch trả phí cho nhánh Git này.
