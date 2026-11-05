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

## Backend

GitHub Pages không chạy `server.js`. Khi chưa có backend, website hiển thị
thông báo đang thiết lập; đăng nhập, chia sẻ và lưu gia phả chưa hoạt động.

Khi có backend HTTPS với lưu trữ bền vững cho `data/`, chạy:

```sh
API_BASE_URL=https://api.example.com npm run build:pages:docs
```

Sau đó commit và push `docs/` lên `release`. URL này là địa chỉ công khai,
không được chứa mật khẩu hoặc token. Repository variable `API_BASE_URL`
chỉ áp dụng cho job kiểm tra build, không thay đổi website từ branch;
cần build lại và commit để cập nhật URL backend trên website.

Backend đã cho phép CORS với header `Authorization` và phương thức `PATCH`.
Link chia sẻ mới dùng `index.html?share=...` để hoạt động dưới `/giapha/`.

## Kiểm tra cục bộ

```sh
python3 -m http.server 8090 --directory docs
```

Mở http://localhost:8090. Dùng `npm start` để chạy đầy đủ frontend và backend
cục bộ; không mở trực tiếp `public/index.html` qua `file://` vì ứng dụng dùng
JavaScript modules và API HTTP.
