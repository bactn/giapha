# Homepage và cổng gia phả — lộ trình hai giai đoạn

## Mục tiêu và quyết định sản phẩm

Giai đoạn 1 giới thiệu dòng họ Trần Ngọc như một landing page. Không yêu cầu đăng
nhập để đọc phần giới thiệu. Người dùng vào cây qua liên kết riêng, gia phả của
mình, hoặc danh sách gia phả đã được quản trị chủ động bật công khai.

Theo lựa chọn của chủ dự án: admin có thể bật công khai cả cây. Mặc định vẫn riêng
tư; triển khai giao diện không tự công khai các cây hiện có. Khi bật, giao diện
nói rõ tên, quan hệ và ngày sinh/mất sẽ được xem công khai. Ghi chú, liên hệ và
trường tuỳ biến không được trả về cho khách công khai.

## Giai đoạn 1 — trải nghiệm của một dòng họ

| Thứ tự | Phần việc | Nghiệm thu |
|---|---|---|
| 1.1 | Landing page: banner, giới thiệu, ký ức gia đình, lời mời tham gia | Responsive, ảnh có mô tả và nhãn minh hoạ, CTA đi được tới gia phả/login |
| 1.2 | Login hai phần: mạng xã hội và email/mật khẩu | Google dùng luồng đã có; Facebook ghi Sắp có, chưa giả lập đăng nhập; đăng ký email có chế độ riêng |
| 1.3 | Menu tài khoản thay nút đăng xuất thường trực | Bấm avatar/tên mới thấy hồ sơ, gia phả, yêu cầu, đăng xuất; đóng khi bấm ngoài/Escape |
| 1.4 | Hồ sơ tài khoản: email, tên hiển thị, điện thoại, địa chỉ | Email lấy từ Auth và hiển thị chỉ đọc; tên/liên hệ lưu vào profiles, chỉ chủ tài khoản đọc/sửa |
| 1.5 | Màn yêu cầu phê duyệt riêng | Chọn dòng họ, lọc chờ duyệt/đã duyệt/từ chối, phân trang; admin duyệt/từ chối qua RPC hiện có; người khác chỉ thấy yêu cầu được RLS cho phép |
| 1.6 | Danh sách công khai và thiết lập giới thiệu | Admin đặt slug/giới thiệu/khu vực, chủ động bật/tắt; link slug hoạt động trên Pages; bỏ công khai chặn lần tải tiếp theo |
| 1.7 | Kiểm thử và triển khai | Profile không đọc chéo; viewer không tự publish; public không có dữ liệu liên hệ; link share/invite cũ và OAuth còn hoạt động |

Ảnh sân nhà và album là minh hoạ AI, không được giới thiệu như tài sản/kỷ vật thật
của dòng họ. Thay bằng ảnh thật đã được gia đình cho phép khi chủ dự án cung cấp.
Giai đoạn này chưa có upload album, bài viết, sự kiện hoặc bình luận; không hiển
thị các khối chức năng giả, số liệu cộng đồng, lịch sử hay lời chứng thực bịa đặt.

Email đăng nhập chưa cho sửa trực tiếp tại hồ sơ. Đổi email là luồng Auth cần xác
minh và phụ thuộc nhà cung cấp/SMTP; không cập nhật email bằng SQL hoặc metadata.

## Giai đoạn 2 — cộng đồng nhiều dòng họ

Chỉ bắt đầu sau khi trải nghiệm một dòng họ được nghiệm thu.

1. **Trang cộng đồng:** thay giới thiệu đơn dòng họ bằng câu chuyện cộng đồng,
   tìm kiếm/lọc gia phả, trang giới thiệu riêng từng dòng họ. Phân trang tìm kiếm
   phía server khi danh mục vượt giới hạn 100 kết quả của giai đoạn 1.
2. **Onboarding dòng họ:** chủ dòng họ tạo không gian, điền giới thiệu/ảnh đại diện,
   nhập dữ liệu, mời cộng tác, lựa chọn riêng tư/công khai. Quyền admin/editor/viewer
   gắn từng lineage_id; admin một họ không có quyền với họ khác.
3. **Quản trị nền tảng:** tách khỏi admin dòng họ; có hàng đợi duyệt hồ sơ công khai,
   báo cáo vi phạm, ẩn nội dung, nhật ký và quy trình khiếu nại. Chưa cấp quyền
   quản trị nền tảng cho bất kỳ người dùng nào trong giai đoạn 1.
4. **Mạng xã hội:** bật Facebook sau khi có Meta App, callback và cấu hình Supabase;
   giữ cùng giao diện provider. Giữ quy tắc liên kết danh tính đã xác minh của Auth,
   không gộp tài khoản bằng tên/email ở client.
5. **Nội dung và hình ảnh:** Storage bucket riêng tư theo lineage_id, kiểm tra tệp,
   ảnh xuất bản được chọn riêng; kiểm soát ảnh người còn sống, consent, lưu lượng.
6. **Vận hành cộng đồng:** SMTP, chống spam/rate limit, chính sách dữ liệu, yêu cầu
   xoá/xuất dữ liệu, lịch backup/khôi phục; đánh giá chi phí bằng số người và lưu
   lượng thực tế trước khi nâng gói hoặc bật dịch vụ trả phí.

## Kiến trúc dùng lại giữa hai giai đoạn

- Một Supabase Auth cho mỗi người; profiles lưu thông tin tài khoản riêng tư.
- lineages, members, lineage_access, change_requests hiện có vẫn là lõi đa dòng họ.
- lineage_publications là lớp xuất bản riêng: slug, giới thiệu, khu vực, trạng thái.
  Không thêm policy anon để đọc thẳng các bảng members/lineages.
- list_public_lineages chỉ trả metadata đã bật công khai; open_lineage_page kiểm
  tra quyền và lọc trường cho khách. Các hàm ghi đặc quyền nằm trong schema riêng,
  kiểm tra auth.uid() và vai trò tại thời điểm thao tác.
- FamilyPortal quản lý home/login/account/requests; cây tương tác và DataStore
  tiếp tục làm việc riêng. Có thể thay home thành community mà không viết lại cây.
- Hash route tương thích GitHub Pages: #home, #login, #mine, #account, #requests,
  #family=slug. Giữ #share=token và #invite=token cũ. Không cần Node backend hoặc
  cấu hình rewrite cho đường dẫn sâu.
- Màn tài khoản và yêu cầu không xoá bản nháp cây đang mở. Đổi sang cây khác hoặc
  đăng xuất vẫn có kiểm tra bản nháp. Duyệt không tự ghi đè revision cũ.

## Thứ tự phát hành

Làm trên nhánh codex/phase1-family-portal. Áp dụng migration bổ sung, kiểm thử quyền
bằng fixture rollback, build dist, kiểm tra desktop/mobile và người dùng hiện có,
sau đó build docs, cập nhật release và nhánh Pages đang dùng. Cấu hình được kiểm
tra ngày 06/11/2026 là codex/supabase-integration + /docs; cả hai nhánh nhận cùng
bản phát hành. Không đưa data/, backup hoặc thông tin
liên hệ vào tài nguyên tĩnh. Giữ nguyên hiện trạng công khai của tất cả gia phả.

## Tài sản minh hoạ

Hai ảnh được tạo bằng công cụ image_gen, đã lưu trong dự án:

- public/images/heritage-courtyard.jpg: sân nhà Việt Nam, sáng sớm, gỗ/ngói/cây sứ;
  không người, chữ, biểu tượng tôn giáo hoặc địa danh cụ thể.
- public/images/family-album.jpg: album cũ trên bàn gỗ, ảnh nhà và bóng người không
  nhận diện được, ánh sáng cửa sổ; không chữ đọc được hoặc danh tính thật.

Prompt đầy đủ được lưu tại [homepage-image-prompts.md](homepage-image-prompts.md).

## Kết quả kiểm chứng giai đoạn 1

- 17 kiểm tra tự động về cấu hình, quyền client, bản nháp, OAuth và route/slug.
- SQL portal_publication.sql đã chạy trên database thật với fixture rollback:
  profile chỉ chủ sở hữu; viewer không publish; cây riêng tư không lộ; public chỉ
  trả trường được phép; tắt công khai chặn lần đọc tiếp theo.
- Trình duyệt desktop và viewport 390×844: trang chủ/login không tràn ngang,
  chuyển chế độ đăng ký email đúng, Google quay về màn gia phả sau đăng nhập.
- Lưu hồ sơ thành công; duyệt một yêu cầu giả thành công và lọc được trạng thái
  Đã duyệt; tắt công khai qua UI chặn người ngoài ngay lần truy cập tiếp theo.
- Mở lại cây thật và vào hồ sơ từ menu tài khoản; Đăng xuất ẩn trước khi mở menu.
- Đã dọn gia phả/tài khoản giả sau kiểm thử. Các gia phả thật vẫn riêng tư, không
  có bản ghi publication nào được tạo cho chúng trong quá trình triển khai.
- Security Advisor không có vấn đề schema mới; cảnh báo mật khẩu rò rỉ trên gói
  Free đã có từ trước, xem hướng dẫn vận hành Supabase hiện tại.
