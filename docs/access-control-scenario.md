# Kịch Bản Phân Quyền Truy Cập Gia Phả

## 1. Tổng Quan

Mỗi gia phả có 1 Admin (người tạo). Admin có thể chia sẻ gia phả cho các thành viên khác thông qua link hoặc mã code, với các cấp độ quyền truy cập khác nhau.

---

## 2. Quy Trình Tạo User (Admin)

### 2.1. Tạo user là định danh duy nhất của Admin

Khi người dùng lần đầu truy cập ứng dụng để tạo gia phả:

1. Trang chủ hiển thị 1 form đơn giản với **1 ô nhập thông tin duy nhất**:
   ```
   ┌─────────────────────────────────────────────┐
   │  Tạo Gia Phả Mới                            │
   │                                             │
   │  Tên người dùng (định danh duy nhất)        │
   │  ┌─────────────────────────────────────┐   │
   │  │                                     │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   │  [Tạo Gia Phả]                              │
   └─────────────────────────────────────────────┘
   ```

2. Người dùng nhập **tên người dùng (username)** — đây là định danh duy nhất:
   - Không cần email, mật khẩu, hay bất kỳ thông tin nào khác
   - Username phải duy nhất trong hệ thống
   - Không được để trống

3. Hệ thống kiểm tra:
   - **Username đã tồn tại** → Hiển thị thông báo lỗi: "Tên người dùng đã được sử dụng"
   - **Username hợp lệ** → Tiếp tục bước 4

4. Hệ thống tự động:
   - Tạo user mới với vai trò `admin`
   - Tạo gia phả mới, gán `admin_id` = user vừa tạo
   - Chuyển hướng đến giao diện gia phả

5. **Đăng nhập lại**: Khi người dùng truy cập lần sau, chỉ cần nhập username để đăng nhập:
   ```
   ┌─────────────────────────────────────────────┐
   │  Đăng Nhập                                  │
   │                                             │
   │  Tên người dùng                             │
   │  ┌─────────────────────────────────────┐   │
   │  │                                     │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   │  [Đăng Nhập]                                │
   └─────────────────────────────────────────────┘
   ```

### 2.2. Người dùng khác (thành viên gia phả)

Khi người dùng truy cập qua link chia sẻ hoặc mã code:

1. Hệ thống kiểm tra xem username đã tồn tại chưa:
   - **Chưa tồn tại** → Yêu cầu nhập username để tạo tài khoản (1 ô duy nhất)
   - **Đã tồn tại** → Yêu cầu nhập username để đăng nhập

2. Sau khi có tài khoản, hệ thống gán quyền theo link/mã code chia sẻ

---

## 3. Các Vai Trò (Roles)

| Vai trò | Mã | Mô tả |
|---------|-----|-------|
| Admin | `admin` | Người tạo gia phả, quyền cao nhất |
| Người xem | `viewer` | Chỉ xem, có thể yêu cầu chỉnh sửa |
| Người chỉnh sửa | `editor` | Có thể chỉnh sửa, nhưng cần Admin phê duyệt |

---

## 4. Quy Trình Chia Sẻ

### 4.1. Admin tạo link chia sẻ

1. Admin vào mục **"Chia Sẻ Gia Phả"** (nút trên thanh công cụ)
2. Chọn cấp độ quyền truy cập:
   - **Chỉ xem** (`viewer`) — Người nhận chỉ xem, không chỉnh sửa
   - **Cho phép chỉnh sửa** (`editor`) — Người nhận có thể chỉnh sửa, cần phê duyệt
3. Hệ thống tạo 1 link chia sẻ duy nhất:
   ```
   https://giapha.app/share/<share_token>
   ```
4. Admin copy link và gửi cho người nhận

### 4.2. Chia sẻ kèm mã code

1. Admin vào mục **"Chia Sẻ Gia Phả"**
2. Chọn **"Chia sẻ bằng mã code"**
3. Hệ thống tạo 1 mã code 6 ký tự (ví dụ: `A3X9K2`)
4. Admin gửi mã code cho người nhận
5. Người nhận vào trang chủ, nhập mã code để truy cập gia phả

---

## 5. Quy Trình Truy Cập

### 5.1. Người dùng truy cập qua link chia sẻ

1. Người dùng click vào link chia sẻ
2. Hệ thống kiểm tra `share_token`:
   - **Hợp lệ** → Tiếp tục bước 3
   - **Không hợp lệ / Đã hết hạn** → Hiển thị thông báo lỗi
3. Hệ thống kiểm tra người dùng đã có tài khoản chưa:
   - **Chưa có** → Yêu cầu đăng ký / đăng nhập
   - **Đã có** → Tự động đăng nhập và tiếp tục
4. Hệ thống gán quyền theo `share_token`:
   - `viewer` → Người dùng chỉ xem
   - `editor` → Người dùng có thể chỉnh sửa
5. Hiển thị gia phả với giao diện tương ứng

### 5.2. Người dùng truy cập qua mã code

1. Người dùng vào trang chủ
2. Click **"Truy cập bằng mã code"**
3. Nhập mã code 6 ký tự
4. Hệ thống kiểm tra mã code:
   - **Hợp lệ** → Gán quyền `viewer` (mặc định) và hiển thị gia phả
   - **Không hợp lệ** → Hiển thị thông báo lỗi
5. Nếu chưa có tài khoản → Yêu cầu đăng ký / đăng nhập

---

## 6. Quy Trình Chỉnh Sửa

### 6.1. Người xem (viewer) yêu cầu chỉnh sửa

1. Người xem click vào nút **"Yêu cầu chỉnh sửa"** (hiện trên thanh công cụ)
2. Hệ thống mở form yêu cầu:
   - **Tiêu đề** — Mô tả ngắn gọn yêu cầu
   - **Nội dung** — Chi tiết yêu cầu chỉnh sửa
   - **Thành viên liên quan** — ID của thành viên cần chỉnh sửa (nếu có)
3. Người xem submit yêu cầu
4. Hệ thống gửi thông báo cho Admin
5. Admin xem yêu cầu và:
   - **Đồng ý** → Nâng quyền người dùng lên `editor`
   - **Từ chối** → Gửi thông báo cho người dùng

### 6.2. Người chỉnh sửa (editor) submit thay đổi

1. Người chỉnh sửa thực hiện thay đổi trên gia phả
2. Khi click **"Lưu"**, thay đổi được gửi đi dưới dạng **Yêu cầu phê duyệt (Pending Change)**:
   ```json
   {
     "change_id": "uuid",
     "editor_id": "user_id",
     "lineage_id": "lineage_id",
     "changes": [
       {
         "type": "update_member",
         "member_id": "M001",
         "old_value": { "full_name": "Trần Ngọc A" },
         "new_value": { "full_name": "Trần Ngọc An" }
       }
     ],
     "status": "pending",
     "created_at": "2026-11-04T07:00:00Z"
   }
   ```
3. Thay đổi **KHÔNG** được áp dụng ngay vào dữ liệu chung
4. Hệ thống gửi thông báo cho Admin

### 6.3. Admin phê duyệt thay đổi

1. Admin nhận thông báo có yêu cầu phê duyệt
2. Admin xem chi tiết thay đổi:
   - **So sánh Before / After** — Hiển thị diff của từng thay đổi
   - **Người gửi** — Thông tin người chỉnh sửa
   - **Thời gian gửi** — Thời điểm submit
3. Admin quyết định:
   - **Đồng ý (Approve)** → Áp dụng thay đổi vào dữ liệu chung, gửi thông báo cho editor
   - **Từ chối (Reject)** → Không áp dụng, gửi thông báo cho editor với lý do

---

## 7. Quy Trình Phê Duyệt

```
┌─────────────┐     submit      ┌──────────────┐     approve     ┌─────────────┐
│   Editor    │ ──────────────► │   Admin      │ ──────────────► │  Dữ liệu    │
│  (chỉnh sửa)│                 │  (phê duyệt)  │                 │  chung      │
└─────────────┘                 └──────────────┘                 └─────────────┘
                                    │
                                    │ reject
                                    ▼
                              ┌──────────────┐
                              │  Editor      │
                              │  (thông báo)  │
                              └──────────────┘
```

---

## 8. Giao Diện

### 7.1. Panel "Chia Sẻ Gia Phả" (Admin)

```
┌─────────────────────────────────────────────┐
│  Chia Sẻ Gia Phả                            │
├─────────────────────────────────────────────┤
│  [Link Chia Sẻ]                             │
│  ┌─────────────────────────────────────┐   │
│  │ https://giapha.app/share/AbC123...  │ 📋│
│  └─────────────────────────────────────┘   │
│  Quyền: [Chỉ xem ▼]                         │
│  [Tạo Link Chia Sẻ]                         │
│                                             │
│  [Chia Sẻ bằng Mã Code]                     │
│  Mã code: A3X9K2                            │
│  [Tạo Mã Code Mới]                          │
│                                             │
│  [Danh Sách Thành Viên]                     │
│  ┌─────────────────────────────────────┐   │
│  │ Tên          │ Quyền  │ Hành động  │   │
│  ├──────────────┼────────┼────────────┤   │
│  │ Nguyễn Văn A │ Viewer │ [Nâng cấp] │   │
│  │ Trần Thị B   │ Editor │ [Hạ cấp]   │   │
│  └──────────────┴────────┴────────────┘   │
│                                             │
│  [Yêu Cầu Chờ Phê Duyệt: 3]                 │
│  ┌─────────────────────────────────────┐   │
│  │ Editor: Nguyễn Văn A                │   │
│  │ Thay đổi: 5 thành viên              │   │
│  │ [Xem Chi Tiết] [Đồng ý] [Từ chối]   │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### 7.2. Thanh công cụ (Người xem)

```
┌─────────────────────────────────────────────┐
│ 🔍 Tìm kiếm  │ 👁️ Chế độ xem │ ✏️ Yêu cầu chỉnh sửa │
└─────────────────────────────────────────────┘
```

### 7.3. Thanh công cụ (Người chỉnh sửa)

```
┌─────────────────────────────────────────────┐
│ 🔍 Tìm kiếm  │ ✏️ Chế độ chỉnh sửa │ 💾 Lưu (chờ phê duyệt) │
└─────────────────────────────────────────────┘
```

---

## 9. Các Trường Dữ Liệu

### 9.1. Bảng `users`

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `id` | UUID | ID người dùng |
| `username` | String | Tên người dùng (định danh duy nhất, không trùng) |
| `created_at` | DateTime | Thời gian tạo |

### 9.2. Bảng `lineages`

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `id` | UUID | ID gia phả |
| `admin_id` | UUID | ID Admin (FK → users) |
| `name` | String | Tên gia phả |
| `members` | JSON | Dữ liệu thành viên |
| `lineage_info` | JSON | Thông tin gia phả |
| `created_at` | DateTime | Thời gian tạo |
| `updated_at` | DateTime | Thời gian cập nhật |

### 9.3. Bảng `lineage_access`

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `id` | UUID | ID bản ghi |
| `lineage_id` | UUID | ID gia phả (FK → lineages) |
| `user_id` | UUID | ID người dùng (FK → users) |
| `role` | Enum | `viewer` \| `editor` |
| `granted_at` | DateTime | Thời gian cấp quyền |
| `granted_by` | UUID | ID người cấp quyền (FK → users) |

### 9.4. Bảng `share_links`

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `id` | UUID | ID bản ghi |
| `lineage_id` | UUID | ID gia phả (FK → lineages) |
| `token` | String | Token chia sẻ (duy nhất) |
| `role` | Enum | `viewer` \| `editor` |
| `expires_at` | DateTime | Thời gian hết hạn (nullable) |
| `created_at` | DateTime | Thời gian tạo |
| `is_active` | Boolean | Còn hiệu lực |

### 9.5. Bảng `share_codes`

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `id` | UUID | ID bản ghi |
| `lineage_id` | UUID | ID gia phả (FK → lineages) |
| `code` | String | Mã code 6 ký tự (duy nhất) |
| `expires_at` | DateTime | Thời gian hết hạn (nullable) |
| `created_at` | DateTime | Thời gian tạo |
| `is_active` | Boolean | Còn hiệu lực |

### 9.6. Bảng `pending_changes`

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `id` | UUID | ID yêu cầu thay đổi |
| `lineage_id` | UUID | ID gia phả (FK → lineages) |
| `editor_id` | UUID | ID người chỉnh sửa (FK → users) |
| `changes` | JSON | Danh sách thay đổi (diff) |
| `status` | Enum | `pending` \| `approved` \| `rejected` |
| `reviewed_by` | UUID | ID Admin đã phê duyệt (nullable) |
| `reviewed_at` | DateTime | Thời gian phê duyệt (nullable) |
| `rejection_reason` | String | Lý do từ chối (nullable) |
| `created_at` | DateTime | Thời gian tạo |

### 9.7. Bảng `edit_requests`

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `id` | UUID | ID yêu cầu chỉnh sửa |
| `lineage_id` | UUID | ID gia phả (FK → lineages) |
| `requester_id` | UUID | ID người yêu cầu (FK → users) |
| `title` | String | Tiêu đề yêu cầu |
| `description` | String | Nội dung chi tiết |
| `member_id` | String | ID thành viên liên quan (nullable) |
| `status` | Enum | `pending` \| `approved` \| `rejected` |
| `reviewed_by` | UUID | ID Admin đã xử lý (nullable) |
| `reviewed_at` | DateTime | Thời gian xử lý (nullable) |
| `created_at` | DateTime | Thời gian tạo |

### 9.8. Bảng `notifications`

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `id` | UUID | ID thông báo |
| `user_id` | UUID | ID người nhận (FK → users) |
| `type` | Enum | `edit_request` \| `pending_change` \| `change_approved` \| `change_rejected` \| `role_granted` |
| `payload` | JSON | Dữ liệu thông báo |
| `is_read` | Boolean | Đã đọc |
| `created_at` | DateTime | Thời gian tạo |

---

## 10. API Endpoints

### 10.1. Xác thực

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/auth/create` | Tạo user mới (nhập username duy nhất) |
| POST | `/api/auth/login` | Đăng nhập (nhập username) |
| POST | `/api/auth/logout` | Đăng xuất |

### 10.2. Chia sẻ

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/lineage/:id/share-link` | Tạo link chia sẻ |
| POST | `/api/lineage/:id/share-code` | Tạo mã code chia sẻ |
| GET | `/api/lineage/:id/access-list` | Danh sách thành viên có quyền |
| PATCH | `/api/lineage/:id/access/:userId` | Cập nhật quyền của người dùng |
| DELETE | `/api/lineage/:id/access/:userId` | Xóa quyền truy cập |
| GET | `/api/share/:token` | Lấy thông tin từ link chia sẻ |
| POST | `/api/share/code` | Truy cập gia phả bằng mã code |

### 10.3. Chỉnh sửa và Phê duyệt

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/lineage/:id/edit-requests` | Gửi yêu cầu chỉnh sửa (viewer) |
| POST | `/api/lineage/:id/pending-changes` | Gửi yêu cầu phê duyệt (editor) |
| GET | `/api/lineage/:id/pending-changes` | Danh sách yêu cầu chờ phê duyệt |
| GET | `/api/lineage/:id/pending-changes/:changeId` | Chi tiết yêu cầu thay đổi |
| PATCH | `/api/lineage/:id/pending-changes/:changeId/approve` | Phê duyệt thay đổi |
| PATCH | `/api/lineage/:id/pending-changes/:changeId/reject` | Từ chối thay đổi |

### 10.4. Thông báo

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/notifications` | Danh sách thông báo |
| PATCH | `/api/notifications/:id/read` | Đánh dấu đã đọc |
| PATCH | `/api/notifications/read-all` | Đánh dấu đã đọc tất cả |

---

## 11. Quy Tắc Nghiệp Vụ

1. **Chỉ có 1 Admin mỗi gia phả** — Không thể chuyển quyền Admin
2. **Link chia sẻ có thể hết hạn** — Admin có thể đặt thời gian hết hạn
3. **Mã code mặc định cấp quyền `viewer`** — Admin có thể nâng cấp sau
4. **Editor không thể lưu trực tiếp** — Mọi thay đổi đều phải qua phê duyệt
5. **Viewer không thể chỉnh sửa** — Chỉ có thể yêu cầu chỉnh sửa
6. **Admin có thể lưu trực tiếp** — Không cần phê duyệt
7. **Khi Admin phê duyệt, editor nhận thông báo** — Để biết thay đổi đã được áp dụng
8. **Khi Admin từ chối, editor nhận thông báo với lý do** — Để biết cần sửa gì
9. **Admin có thể nâng cấp / hạ cấp quyền** — Từ `viewer` → `editor` và ngược lại
10. **Admin có thể xóa quyền truy cập** — Người dùng sẽ không còn truy cập được gia phả

---

## 12. Các Tình Huống Đặc Biệt

### 11.1. Nhiều editor cùng chỉnh sửa

- Mỗi editor submit 1 yêu cầu phê duyệt riêng
- Admin xem từng yêu cầu và quyết định
- Nếu 2 editor chỉnh sửa cùng 1 thành viên, Admin xem diff và quyết định yêu cầu nào được chấp nhận

### 11.2. Link chia sẻ bị lộ

- Admin có thể vô hiệu hóa link chia sẻ
- Tạo link mới nếu cần

### 11.3. Editor bị lạm dụng

- Admin có thể hạ cấp từ `editor` → `viewer`
- Hoặc xóa quyền truy cập hoàn toàn
