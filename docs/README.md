# Cây Gia Phả Dòng Họ - MindNode Tree Platform

Ứng dụng quản lý và hiển thị cây gia phả dòng họ dưới dạng MindNode Tree tương tác, hỗ trợ nhiều người dùng với kiểm soát truy cập theo vai trò.

---

## Yêu cầu Hệ thống

- **Node.js** >= 18 (LTS)
- **npm** >= 9
- Trình duyệt web hiện đại (Chrome, Firefox, Safari, Edge)

---

## Cài đặt và Chạy Project

### 1. Cài đặt dependencies

```bash
npm install
```

### 2. Khởi tạo dữ liệu lần đầu

Các file dữ liệu sẽ được tự động tạo khi server chạy lần đầu:

```
data/
├── users.json              # Danh sách người dùng
├── lineages.json           # Danh sách gia phả
├── lineage_access.json     # Quyền truy cập người dùng trên gia phả
├── share_links.json        # Liên kết chia sẻ
├── share_codes.json        # Mã code chia sẻ (6 ký tự)
├── sessions.json           # Phiên đăng nhập
├── pending_changes.json    # Thay đổi chờ phê duyệt
├── edit_requests.json      # Yêu cầu chỉnh sửa
├── notifications.json      # Thông báo
├── current_lineage.json    # Dữ liệu gia phả hiện tại
└── default_lineage.json    # Dữ liệu gia phả mặc định (Trần Ngọc Gốc)
```

### 3. Chạy server (BE + FE)

```bash
node server.js
```

Server sẽ khởi chạy **2 port**:
- **BE (Backend API)** — http://localhost:3000
- **FE (Frontend)** — http://localhost:8080

### 4. Truy cập ứng dụng

Mở trình duyệt và truy cập **http://localhost:8080**.

> FE sẽ tự động proxy các yêu cầu API (`/api/*`, `/share/*`) đến BE trên port 3000.

---

## Hướng dẫn Sử dụng

### Đăng nhập / Tạo tài khoản

Khi truy cập ứng dụng lần đầu, bạn sẽ thấy màn hình đăng nhập với 3 tùy chọn:

1. **Đăng Nhập** — Nhập tên người dùng để đăng nhập vào tài khoản đã có.
2. **Tạo Gia Phả Mới** — Tạo tài khoản mới. Người tạo sẽ tự động là **Quản trị (Admin)** của gia phả mới.
3. **Truy cập bằng mã code** — Nhập mã code 6 ký tự do Admin chia sẻ, sau đó đăng nhập hoặc tạo tài khoản để được cấp quyền truy cập.

### Vai trò người dùng

| Vai trò | Quyền hạn |
|---------|-----------|
| **Quản trị (Admin)** | Toàn quyền: chỉnh sửa, chia sẻ, phê duyệt, quản lý người dùng |
| **Chỉnh sửa (Editor)** | Chỉnh sửa dữ liệu, nhưng thay đổi phải chờ Admin phê duyệt |
| **Chỉ xem (Viewer)** | Chỉ xem cây gia phả, không thể chỉnh sửa. Có thể gửi yêu cầu chỉnh sửa |

### Thao tác với cây gia phả

#### Xem và điều hướng
- **Kéo thả** để di chuyển cây
- **Cuộn chuột** để phóng to/thu nhỏ
- **Nhấp vào node** để chọn và xem thông tin chi tiết

#### Chỉnh sửa thông tin (Admin/Editor)
- Nhấp vào node trên cây hoặc mục lục bên trái
- Chuyển sang tab **"Thông Tin Chi Tiết"** để sửa thông tin
- Nhấn **"Lưu"** để lưu thay đổi

#### Thêm thành viên
- Nhấn **"Cụ Tổ Mới"** trong mục lục để thêm thành viên gốc
- Nhấn **"Thêm Con (Tab)"** để thêm con cho thành viên đang chọn
- Nhấn **"+ Thêm Con"** trong tab Thông Tin Chi Tiết

#### Xóa thành viên
- Nhấn nút **"Xóa"** trong tab Thông Tin Chi Tiết của thành viên đang chọn

#### Tìm kiếm
- Nhập tên hoặc mã ID vào ô tìm kiếm trên cùng

#### Xuất cây gia phả
- Nhấn nút **"Xuất Cây"** trên thanh công cụ
- Chọn phạm vi: **Toàn bộ** hoặc **Nhánh** của thành viên đang chọn
- Định dạng xuất:
  - **PDF** — File PDF chất lượng cao
  - **PNG** — Ảnh PNG độ nét cao
  - **SVG** — Vector SVG (phù hợp in khổ lớn)
  - **JSON** — Sao lưu dữ liệu dự án

#### Tính danh xưng quan hệ
- Nhấn nút **"Danh Xưng"** trên thanh công cụ
- Chọn 2 người để tính danh xưng quan hệ giữa họ

#### Lịch cúng giỗ Âm lịch
- Nhấn nút **"Giỗ ÂL"** trên thanh công cụ
- Xem danh sách ngày giỗ sắp tới theo âm lịch

#### Nhập dữ liệu từ Excel/CSV
- Nhấn menu **"Excel"** > **"Nhập File Excel / CSV Mới"**
- Kéo thả hoặc chọn file để import
- Tải file mẫu Excel/CSV từ menu Excel

#### Khôi phục dữ liệu mặc định
- Nhấn menu **"Excel"** > **"Khôi phục Mẫu Trần Ngọc Gốc"**

---

## Chia sẻ và Quản lý Truy cập (Admin)

### Tạo liên kết chia sẻ

1. Nhấn nút **"Chia sẻ"** trên thanh công cụ
2. Chọn tab **"Liên kết / Mã"**
3. Chọn vai trò (Chỉ xem / Chỉnh sửa)
4. Nhấn **"Tạo Link"**
5. Copy liên kết và chia sẻ cho người dùng

### Tạo mã code chia sẻ

1. Nhấn nút **"Chia sẻ"** trên thanh công cụ
2. Chọn tab **"Liên kết / Mã"**
3. Chọn vai trò (Chỉ xem / Chỉnh sửa)
4. Nhấn **"Tạo Code"**
5. Copy mã code 6 ký tự và chia sẻ cho người dùng

### Quản lý danh sách truy cập

1. Nhấn nút **"Chia sẻ"** trên thanh công cụ
2. Chọn tab **"Danh sách Truy cập"**
3. Xem danh sách người dùng đang có quyền truy cập
4. **Nâng** — Nâng vai trò (Viewer → Editor → Admin)
5. **Xóa** — Xóa quyền truy cập của người dùng

### Phê duyệt thay đổi (Admin)

1. Nhấn nút **"Chia sẻ"** trên thanh công cụ
2. Chọn tab **"Chờ Phê duyệt"**
3. Xem danh sách thay đổi từ Editor
4. Nhấn **"Duyệt"** để chấp nhận thay đổi
5. Nhấn **"Từ chối"** để từ chối thay đổi

---

## Yêu cầu chỉnh sửa (Viewer)

Nếu bạn là người chỉ xem và muốn chỉnh sửa:

1. Nhấn nút **"Yêu cầu Sửa"** trên thanh công cụ
2. Nhập lý do (tùy chọn)
3. Nhấn **"Gửi Yêu cầu"**
4. Admin sẽ xem xét và nâng quyền của bạn lên Editor

---

## API Endpoints

### Auth
| Phương thức | Đường dẫn | Mô tả |
|-------------|-----------|-------|
| POST | `/api/auth/create` | Tạo tài khoản mới |
| POST | `/api/auth/login` | Đăng nhập |
| GET | `/api/auth/me` | Thông tin người dùng hiện tại |

### Share
| Phương thức | Đường dẫn | Mô tả |
|-------------|-----------|-------|
| POST | `/api/lineage/:id/share-link` | Tạo liên kết chia sẻ |
| POST | `/api/lineage/:id/share-code` | Tạo mã code chia sẻ |
| GET | `/api/lineage/:id/access-list` | Danh sách truy cập |
| PATCH | `/api/lineage/:id/access/:userId` | Cập nhật quyền truy cập |
| DELETE | `/api/lineage/:id/access/:userId` | Xóa quyền truy cập |
| POST | `/api/share/code` | Kiểm tra mã code |
| GET | `/api/share/:token` | Kiểm tra liên kết chia sẻ |

### Edit/Approval
| Phương thức | Đường dẫn | Mô tả |
|-------------|-----------|-------|
| POST | `/api/lineage/:id/edit-requests` | Gửi yêu cầu chỉnh sửa |
| GET | `/api/lineage/:id/edit-requests` | Danh sách yêu cầu |
| PATCH | `/api/lineage/:id/edit-requests/:id/approve` | Duyệt yêu cầu |
| PATCH | `/api/lineage/:id/edit-requests/:id/reject` | Từ chối yêu cầu |
| POST | `/api/lineage/:id/pending-changes` | Gửi thay đổi chờ duyệt |
| GET | `/api/lineage/:id/pending-changes` | Danh sách thay đổi chờ duyệt |
| PATCH | `/api/lineage/:id/pending-changes/:id/approve` | Duyệt thay đổi |
| PATCH | `/api/lineage/:id/pending-changes/:id/reject` | Từ chối thay đổi |

### Notifications
| Phương thức | Đường dẫn | Mô tả |
|-------------|-----------|-------|
| GET | `/api/notifications` | Danh sách thông báo |
| PATCH | `/api/notifications/:id/read` | Đánh dấu đã đọc |
| PATCH | `/api/notifications/read-all` | Đánh dấu tất cả đã đọc |

---

## Phím tắt

| Phím | Hành động |
|------|-----------|
| `Tab` | Thêm con cho node đang chọn (trong mục lục) |
| `Enter` | Thêm anh em cho node đang chọn (trong mục lục) |
| `Del` | Xóa node đang chọn (trong mục lục) |
| `Bấm đúp` | Sửa tên node (trong mục lục) |

---

## Cấu trúc thư mục

```
giapha/
├── server.js                  # Server chính (Express)
├── package.json               # Dependencies
├── data/                      # Dữ liệu JSON
│   ├── users.json
│   ├── lineages.json
│   ├── lineage_access.json
│   ├── share_links.json
│   ├── share_codes.json
│   ├── sessions.json
│   ├── pending_changes.json
│   ├── edit_requests.json
│   ├── notifications.json
│   ├── current_lineage.json
│   └── default_lineage.json
├── public/
│   ├── index.html             # Giao diện chính
│   ├── css/
│   │   ├── style.css          # CSS chính
│   │   └── canvas.css         # CSS canvas
│   └── js/
│       ├── app.js             # Application chính
│       ├── data-store.js      # Quản lý dữ liệu
│       ├── tree-canvas.js     # Canvas vẽ cây
│       ├── auto-layout.js     # Tự động sắp xếp node
│       ├── mindnode-text.js   # Chỉnh sửa văn bản node
│       ├── excel-parser.js    # Phân tích Excel/CSV
│       ├── export.js          # Xuất file
│       ├── kinship.js         # Tính danh xưng
│       └── lunar-calendar.js  # Lịch âm
└── docs/
    └── access-control-scenario.md  # Tài liệu chi tiết access control
```

---

## Lưu ý

- Dữ liệu được lưu trên file JSON trong thư mục `data/`
- Không có cơ sở dữ liệu, không cần cấu hình thêm
- Để backup, sao lưu toàn bộ thư mục `data/`
- Để khôi phục, thay thế thư mục `data/` bằng bản sao lưu
- Tailwind CSS được tải qua CDN trong phát triển (không dùng cho production)
