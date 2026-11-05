# Triển khai GitHub Pages

Workflow `.github/workflows/pages.yml` triển khai giao diện từ nhánh `release`.
Chỉ thư mục `public/` được đóng gói; dữ liệu gia phả, tài khoản, phiên đăng nhập
và file tài liệu trong repository không được đưa vào website.

## Bật Pages lần đầu

1. Mở https://github.com/bactn/giapha/settings/pages bằng tài khoản có quyền quản trị.
2. Trong **Build and deployment → Source**, chọn **GitHub Actions**.
3. Mở tab **Actions → Deploy GitHub Pages**, chọn **Run workflow**, nhánh `release`.
4. Chờ job `deploy` thành công và mở URL trong environment `github-pages`.
   Với cấu hình mặc định, URL dự kiến là https://bactn.github.io/giapha/.

## Kết nối backend sau này

GitHub Pages chỉ chạy giao diện tĩnh, không chạy `server.js`. Khi chưa cấu hình
backend, website hiển thị thông báo đang thiết lập, không gửi yêu cầu đăng nhập.

1. Triển khai backend Node.js lên máy chủ hỗ trợ HTTPS và lưu trữ bền vững cho
   thư mục `data/`. Backend hiện lắng nghe trên `BE_PORT` (mặc định 3000).
2. Trong **Settings → Secrets and variables → Actions → Variables**, tạo
   repository variable `API_BASE_URL`, ví dụ `https://api.example.com`.
   Giá trị này là URL công khai, không điền token hoặc mật khẩu.
3. Chạy lại workflow. Toàn bộ API và link tải mẫu sẽ dùng URL backend đó.

Backend cho phép CORS với header `Authorization` và phương thức `PATCH`.
Link chia sẻ mới dùng `index.html?share=...` để hoạt động trong thư mục con
`/giapha/` của Pages mà không cần server chuyển hướng.

## Kiểm tra cục bộ

```sh
npm run build:pages
python3 -m http.server 8090 --directory dist
```

Mở http://localhost:8090. Để thử với backend đã triển khai:

```sh
API_BASE_URL=https://api.example.com npm run build:pages
```

`npm start` vẫn chạy frontend và backend cục bộ như trước.
