# Kết quả đợt 1 — schema và RLS

Đây là báo cáo lịch sử trước tích hợp giao diện. Trạng thái hiện tại, dữ liệu thật
và các hạn chế vận hành được cập nhật trong [supabase-setup.md](supabase-setup.md).

Đã triển khai trên project `giapha` (`nwbozmxgdhouhzlpiskd`).
Migration: `20261105160025_genealogy_schema_rls` (khớp lịch sử remote).

## Đã có

- Sáu bảng: profiles, lineages, lineage_access, members, change_requests, audit_events.
- RLS trên cả sáu bảng, không cấp quyền đọc/ghi cho anon.
- Dữ liệu thành viên giữ nguyên ID và toàn bộ trường trong JSONB; parent_id/spouse_id
  được sinh từ JSON để áp dụng khóa ngoại ghép cùng gia phả.
- Client có session chỉ đọc dữ liệu được cấp quyền; mọi ghi dữ liệu gia phả và
  thay đổi quyền phải qua RPC, kể cả khi người dùng là admin.
- Profiles: chỉ đọc/sửa tên hiển thị của chính mình.
- Audit: chỉ admin gia phả được đọc; client không được tự ghi/sửa lịch sử.
- change_requests mới chỉ là cấu trúc có RLS, chưa cho client gửi hoặc duyệt.

## RPC cho bước tích hợp giao diện

| RPC | Tham số | Kết quả |
|---|---|---|
| create_lineage | p_info JSONB, bắt buộc name | UUID; cấp admin cho người tạo cùng transaction |
| get_lineage_state | p_lineage_id UUID | {lineageInfo, members, revision} |
| save_lineage_state | p_lineage_id, p_base_revision, p_info, p_members | revision mới; chỉ admin |
| set_lineage_access | p_lineage_id, p_user_id, p_role | void; role null để thu hồi |

RPC public là SECURITY INVOKER, logic ghi đặc quyền nằm trong schema
`giapha_private` có kiểm tra auth.uid() và quyền. Không thêm schema này vào
Data API exposed schemas. Các hàm có search_path cố định và EXECUTE giới hạn.

`save_lineage_state` khóa bản ghi gia phả, kiểm tra revision, quan hệ và chu trình,
lưu snapshot, tăng revision, ghi audit trong cùng transaction. Mã lỗi quan trọng:

- `42501`: thiếu quyền hoặc chưa đăng nhập.
- `PT409` (HTTP 409, sau migration bổ sung): revision đã cũ; giữ bản nháp và đối chiếu trước khi lưu lại.
- `23503`: parent/spouse không tồn tại trong cùng gia phả.
- `23505`: trùng ID thành viên.
- `23514`: dữ liệu không hợp lệ, vòng lặp hoặc hạ quyền admin cuối cùng.

Không tự retry lỗi revision bằng cách lấy revision mới rồi ghi đè snapshot cũ.

## Kiểm chứng

- `supabase/tests/genealogy_rls.sql` đã chạy trên database thật; toàn bộ fixture
  auth.users, gia phả, quyền và audit được tạo trong transaction và rollback.
- Các trường hợp đã kiểm tra: tạo owner/admin, read admin/editor/viewer, cô lập
  gia phả, khách chưa đăng nhập, ghi trực tiếp, metadata giả admin, tự nâng quyền,
  thu hồi quyền, giữ admin cuối cùng, stale revision, trùng ID, thiếu tham chiếu,
  tham chiếu chéo gia phả, self-reference, vòng lặp và rollback state/revision/audit.
- Đã xác nhận 6/6 bảng có RLS; lineages, members và audit_events vẫn có 0 bản ghi
  sau kiểm thử. Chưa nhập dữ liệu thật.
- Security Advisor: không có cảnh báo tại thời điểm kiểm tra.
- Performance Advisor: chỉ thông tin một số index mới chưa được dùng. Giữ index
  để hỗ trợ FK/truy vấn khi có dữ liệu; xem lại sau khi có workload thực tế:
  https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index
- Kiểm thử đồng thời trên hai connection chưa được thực hiện; đã kiểm tra
  stale revision và thiết kế dùng cùng row lock cho lưu/thay đổi quyền.

## Kiểm tra dữ liệu trước nhập

```sh
npm run validate:lineage
npm run validate:lineage -- data/default_lineage.json
npm run test:supabase
```

Dry-run trên `data/current_lineage.json`: 350 thành viên, 0 lỗi. Script chỉ đọc,
không upload hoặc sửa dữ liệu. Chưa xác nhận tài khoản quản trị sở hữu bản thật.

## Phần chưa triển khai

- Giao diện Auth email/mật khẩu, callback/reset mật khẩu, chọn gia phả.
- Adapter/service Supabase nối tải/lưu và xử lý xung đột trên giao diện.
- RPC gửi/duyệt đề xuất, mời/chia sẻ, thông báo, ảnh Storage.
- Chuyển dữ liệu/tài khoản thật và cập nhật website release.

Không rollback bằng cách xóa schema sau khi đã có dữ liệu thật. Mọi sửa schema
tiếp theo cần migration mới, kiểm thử và sao lưu phù hợp.
