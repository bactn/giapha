# Kế hoạch chuyển Gia Phả sang Supabase

Trạng thái: đã kết nối project giapha và triển khai schema/RLS cùng RPC cơ bản.
Xem `plans/supabase-phase1.md`. Chưa chuyển giao diện hoặc nhập dữ liệu thật.

## 1. Kiến trúc

- Giao diện tiếp tục chạy trên GitHub Pages, nguồn `release/docs`.
- Supabase Free ban đầu: Auth, PostgreSQL, Data API, RPC; Storage riêng tư khi có ảnh.
- Không cần một máy chủ Node.js chạy thường trực cho bản triển khai mới.
- Các nghiệp vụ tạo gia phả, lưu thay đổi, đổi quyền và duyệt đề xuất dùng RPC
  PostgreSQL để kiểm tra quyền và cập nhật trong cùng transaction.
- Edge Functions chỉ dành cho link khách/mã mời cần giới hạn số lần thử và
  kiểm tra token; không dùng service-role key trong trình duyệt.
- Giữ `server.js` phục vụ bản cũ trong thời gian chuyển đổi; không dùng các API
  đăng nhập bằng tên hoặc ghi JSON của nó làm cổng truy cập dữ liệu Supabase.

## 2. Mô hình dữ liệu

| Bảng | Nội dung |
|---|---|
| profiles | ID tham chiếu auth.users, tên hiển thị; không chứa mật khẩu |
| lineages | UUID gia phả, tên, nguồn gốc, thông tin bổ sung, revision |
| lineage_access | Khóa (lineage_id, user_id), vai trò admin/editor/viewer |
| members | Khóa (lineage_id, id); giữ nguyên ID thành viên; trường hiện có và extras JSONB |
| change_requests | Người gửi, gia phả, loại yêu cầu, changes JSONB, base_revision, trạng thái, người duyệt |
| invitations | Mã/link mời đã băm, vai trò, hạn dùng, số lượt dùng, thu hồi |
| share_links | Token đã băm, quyền chỉ xem, hạn dùng, thu hồi |
| notifications | Người nhận, nội dung sự kiện, trạng thái đã đọc |
| audit_events | Ai thay đổi gì, trước/sau, thời điểm; client không được tự sửa |

Quan hệ cha/con và phối ngẫu phải nằm trong cùng gia phả, với khóa ngoại ghép
(lineage_id, member_id). Giữ ID nghiệp vụ hiện có thay vì ép mọi ID thành UUID.
Kiểm tra ID trùng, cha/phối ngẫu không tồn tại, vòng lặp, liên kết bản thân và
các trường bổ sung trước khi nhập. Không tự bỏ bản ghi lỗi hoặc gộp hai người
có tên giống nhau. Chưa thay đổi mô hình quan hệ gia đình trong đợt chuyển đổi.

## 3. Quyền và nghiệp vụ

- Bật RLS, mặc định từ chối; tài khoản chỉ đọc gia phả được cấp quyền.
- Viewer: đọc và gửi đề xuất, không sửa members.
- Editor: đọc, sửa bản nháp trên giao diện và gửi changes; không ghi trực tiếp
  vào dữ liệu đã được duyệt.
- Admin: lưu chính thức, duyệt/từ chối, tạo mời và quản lý quyền; không thể xóa
  hoặc hạ quyền quản trị cuối cùng của gia phả.
- Quyền lấy từ lineage_access, không tin user metadata hoặc role do client gửi.
- Tạo gia phả và cấp quyền admin cho người tạo trong một transaction.
- Lưu/duyệt nhận base_revision; khóa bản ghi gia phả và chỉ áp dụng khi revision
  còn khớp. Nếu xung đột, giữ bản nháp và yêu cầu tải lại/đối chiếu thay vì ghi đè.
- Duyệt changes, tăng revision, ghi audit và notification trong cùng transaction;
  không đánh dấu approved khi áp dụng dữ liệu thất bại, không duyệt hai lần.
- Kiểm tra quan hệ và chu trình ở database/RPC, ngoài kiểm tra trên giao diện.
- Ưu tiên SECURITY INVOKER; RPC cần SECURITY DEFINER phải có search_path cố định,
  kiểm tra auth.uid()/quyền rõ ràng và giới hạn EXECUTE cho đúng vai trò.
- Khách chưa đăng nhập không được đọc trực tiếp bảng. Link khách chỉ xem qua
  endpoint kiểm tra token có hạn dùng/thu hồi; chỉ trả các trường được phép xem.
- Quyền editor qua mã mời luôn gắn với tài khoản đăng nhập. Mã ngắn phải có
  giới hạn thử và hạn dùng; giai đoạn đầu ưu tiên link token ngẫu nhiên dài.

## 4. Chỉnh sửa mã nguồn

1. `supabase/migrations/`: schema, constraints, indexes, RLS, RPC và Storage policy.
2. Thêm Supabase SDK với phiên bản cố định và build dependency có lockfile.
3. `public/js/supabase-client.js`: khởi tạo client, quản lý session qua SDK.
4. `public/js/services/`: auth, lineage, access, approval, sharing, notifications.
   Tách nghiệp vụ khỏi app.js; không giả lập HTTP Response để giữ toàn bộ API cũ.
5. `public/js/app.js`: đổi đăng nhập thành email/mật khẩu, đăng ký, xác nhận email,
   quên/đặt lại mật khẩu, chọn gia phả, hiển thị lỗi quyền và xung đột khi lưu.
6. Adapter chuẩn hóa `lineage_info`/`lineageInfo`; DataStore, canvas, bố cục,
   danh xưng, âm lịch, import/export tiếp tục dùng cấu trúc giao diện hiện tại.
7. Download file mẫu dùng static asset đã rà soát, không phụ thuộc /api/download.
8. `scripts/build-pages.cjs`: cấu hình public SUPABASE_URL và publishable key;
   chạy build để đồng bộ `docs/`. Không đưa dữ liệu riêng tư vào assets.
9. `.github/workflows/pages.yml`: xác minh build và file docs không bị lệch;
   giữ Pages xuất bản từ release/docs. Không thêm deploy cạnh tranh với nguồn branch.

## 5. Cấu hình Supabase

- Một project Free, chọn region gần người dùng Việt Nam trong các region có sẵn.
- Auth Site URL: https://bactn.github.io/giapha/.
- Allowlist callback dùng index.html thực có dưới /giapha/ và URL localhost
  phục vụ phát triển. Không dựa vào SPA route mà GitHub Pages không phục vụ được.
- Email/mật khẩu, xác nhận email và SMTP riêng cho người dùng thật.
- Chỉ publishable key và project URL được xuất vào website. Secret/service-role
  key chỉ dùng trong môi trường tin cậy khi nhập dữ liệu hoặc chạy Edge Function.
- Bucket ảnh riêng tư, giới hạn kiểu/dung lượng file; quyền đọc/ghi theo gia phả.
- Lịch sao lưu database và file Storage riêng; Free cần chủ động sao lưu.

## 6. Chuyển dữ liệu

1. Sao lưu bất biến toàn bộ data/ và lập manifest kiểm tra số lượng/hash.
2. Chạy dry-run kiểm kê current_lineage, default_lineage, lineage_data và metadata;
   xác định bản nào là dữ liệu chính, bản nào là mẫu. Không gộp tất cả tự động.
3. Dùng script quản trị ngoài public/docs để nhập vào database thử nghiệm;
   báo lỗi dữ liệu trước khi thực hiện, hỗ trợ chạy lại không tạo trùng.
4. Tài khoản cũ chỉ có username, không đủ để tự chuyển sang email Auth. Chủ gia
   phả cần xác nhận ánh xạ tài khoản mới; không tự cấp quyền qua tên trùng.
5. Giữ ID gia phả/thành viên phù hợp, di chuyển quan hệ và quyền đã xác nhận;
   không nhập sessions/token cũ. Link/mã chia sẻ cũ được thu hồi và tạo lại.
6. Đối chiếu số người, trường thông tin, quan hệ và một số bản xuất JSON với bản gốc.
7. Khi chuyển chính thức, dừng ghi ở hệ thống cũ, sao lưu lần cuối, nhập phần
   chênh lệch, kiểm thử rồi bật website mới. Không cho hai nguồn ghi độc lập.

## 7. Thứ tự triển khai và tiêu chí nghiệm thu

| Đợt | Kết quả | Kiểm tra bắt buộc |
|---|---|---|
| 1 | Database và quyền, script dry-run | Từ chối đọc chéo gia phả, sửa vượt quyền, tự nâng quyền |
| 2 | Đăng nhập, tải/lưu gia phả | Đăng ký/xác nhận/khôi phục session, round-trip dữ liệu, xung đột revision |
| 3 | Duyệt, mời/chia sẻ, thông báo | Duyệt hai lần, sai gia phả, rollback, token hết hạn/thu hồi |
| 4 | Chuyển dữ liệu và Pages | Đối soát dữ liệu, callback /giapha/, deploy và kiểm tra URL công khai |

Kiểm tra quyền bằng request trực tiếp, không chỉ kiểm tra nút bị ẩn trên giao diện.
Giữ bản nháp nếu lưu thất bại. Chỉ đưa vào sử dụng khi các luồng chính và quyền
đã được kiểm thử trên Supabase thật hoặc local stack tương đương.

## 8. Quay lui và chi phí

- Giữ bản sao dữ liệu cũ và commit website trước chuyển đổi. Nếu quay lui sau
  khi Supabase đã nhận ghi mới, phải xuất/đối soát phần thay đổi trước; không chỉ
  khôi phục commit cũ rồi tiếp tục ghi vào JSON.
- Khởi đầu một project Free, chưa bật add-on trả phí. Nâng Pro sau khi người dùng
  chấp nhận chi phí, cần tránh pause hoặc cần backup database tự động.
- SMTP, tên miền và dung lượng vượt hạn mức được đánh giá riêng theo dịch vụ chọn.

## 9. Thông tin cần khi bắt đầu kết nối

- Project Supabase và URL/publishable key; không gửi secret key vào chat.
- Tài khoản email quản trị đầu tiên và bản gia phả chính cần chuyển.
- Dịch vụ SMTP và tên miền gửi email nếu dùng xác nhận/khôi phục mật khẩu.

## Tài liệu tham chiếu

- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/auth/auth-smtp
