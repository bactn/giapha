# Triển khai GitHub Pages từ release/docs

Website được xuất bản bằng **Deploy from a branch**, nhánh **release**,
thư mục **/docs**. `docs/index.html`, `docs/css/`, `docs/js/` và
`docs/.nojekyll` là các file được sinh từ `public/`.

## Cấu hình GitHub

1. Mở https://github.com/bactn/giapha/settings/pages.
2. Chọn **Source → Deploy from a branch**.
3. Chọn nhánh **release**, thư mục **/docs**, rồi **Save**.
4. Chờ workflow **pages build and deployment** thành công.
5. Mở https://bactn.github.io/giapha/.

Workflow `.github/workflows/pages.yml` chỉ kiểm tra build, không triển khai
đè lên cấu hình xuất bản từ branch.

## Cập nhật website

Sau khi sửa giao diện trong `public/`, chạy:

```sh
npm run build:pages:docs
```

Commit các thay đổi nguồn và file được sinh trong `docs/`, rồi push lên
`release`. GitHub Pages tự cập nhật từ các file đã commit trong `docs/`.
Không sửa trực tiếp HTML/CSS/JS được sinh trong `docs/`.

Các tài liệu Markdown hiện có trong `docs/` được giữ lại và cũng có thể được
truy cập trên website. Dữ liệu gia phả, tài khoản và phiên đăng nhập trong
`data/` không được sao chép vào website.

## Supabase

Website dùng Supabase Auth và Data API trực tiếp; không cần host `server.js`.
Cấu hình `.env.local` với `SUPABASE_URL` và `SUPABASE_PUBLISHABLE_KEY`, rồi chạy
build trước khi commit `docs/`. Chỉ dùng publishable key công khai; không đưa
secret/service-role key vào website. Database áp dụng RLS và RPC kiểm tra quyền.

Auth Site URL là `https://bactn.github.io/giapha/`, cho phép redirect tới
`https://bactn.github.io/giapha/index.html`. Lời mời và chia sẻ dùng URL fragment
`#invite=...` / `#share=...` dưới `index.html`, phù hợp với project Pages.

Xem [hướng dẫn Supabase](../plans/supabase-setup.md) trong repository cho cấu hình
Auth, SMTP, kiểm thử và sao lưu. SMTP riêng cần thiết khi mở đăng ký cho người
ngoài nhóm quản lý Supabase. Không tiếp tục nhập liệu trên backend JSON cũ sau
khi đã chuyển sang Supabase.

## Kiểm tra cục bộ

```sh
python3 -m http.server 8090 --directory docs
```

Mở http://localhost:8090. Dùng `npm start` với `.env.local` để chạy frontend
Supabase tại http://localhost:8080/; không mở trực tiếp `public/index.html` qua `file://` vì ứng dụng dùng
JavaScript modules và API HTTP.
