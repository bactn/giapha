# Luồng chia sẻ gia phả

## Chỉ xem

Admin tạo link chỉ xem. Người nhận mở trực tiếp, không cần đăng nhập, không có nút chỉnh sửa. Ghi chú không được trả về từ endpoint khách. Link không đồng nghĩa với bật công khai gia phả trên trang chủ.

## Có quyền sửa

Admin tạo link có quyền sửa; người nhận đăng nhập Google hoặc email trước khi được mở vùng chỉnh sửa. Link dùng lại được cho nhiều người trong thời gian còn hiệu lực. Mỗi tài khoản nhận quyền qua link được ghi nhận riêng, không chuyển thành quyền thành viên vĩnh viễn.

Mọi thay đổi thêm, sửa, xóa, quan hệ và thông tin gia phả là bản nháp. Nút **Gửi yêu cầu phê duyệt** tạo yêu cầu `pending`; dữ liệu chính chưa thay đổi. Chỉ admin duyệt/từ chối. RPC lưu trực tiếp chỉ cho admin và chặn editor kể cả khi gọi API ngoài giao diện. Xung đột phiên bản phải tải lại, đối chiếu và gửi lại.

## Thời hạn và thu hồi

- Mặc định 7 ngày; có thể chọn **Không hết hạn — đến khi admin thu hồi** khi tạo link.
- Quản lý chỉ liệt kê link còn hiệu lực với loại quyền, thời hạn và nút **Thu hồi**. Link đã thu hồi, hết hạn hoặc do người không còn là admin cấp sẽ bị ẩn.
- Thu hồi không xóa bản ghi kiểm toán; các lần đọc, nhận link và gửi đề xuất tiếp theo bị chặn ngay ở database.
- Trang đang mở kiểm tra lại quyền mỗi 30 giây khi hiển thị, khi quay lại tab hoặc bấm tải lại. Khi phát hiện bị thu hồi, dữ liệu cây trong bộ nhớ được dọn và chuyển sang màn không thể truy cập. Không thể thu hồi thông tin đã được người xem tải/xuất trước đó.
- Quyền admin cấp **trực tiếp cho tài khoản** độc lập với link. Nếu người đó có cả hai nguồn quyền, thu hồi link chỉ gỡ quyền qua link; quản trị có thể xóa quyền trực tiếp trong phần tương ứng.
- Yêu cầu đã gửi vẫn nằm trong hàng đợi để admin xem xét sau khi link bị thu hồi; không tự động phê duyệt.
- Liên kết chỉ giữ bản băm trên server; URL mới chỉ hiển thị một lần để sao chép, không đưa token vào danh sách hay log.

## Triển khai và kiểm chứng

Migration `20261106143854_revocable_access_links.sql` bổ sung bảng riêng tư `link_redemptions`, giới hạn thời gian ở hàm tính quyền và giữ tương thích RPC tạo link ba tham số (mặc định 7 ngày). Các lời mời chưa nhận trước đây tiếp tục mở được, theo cơ chế mới. Trước khi chuyển đổi đã kiểm tra không có lời mời cũ đã nhận cần chuyển quyền.

Đã chạy toàn bộ migrations và bốn bộ SQL kiểm thử trên Postgres tạm bằng PGlite 0.5.15. Bộ `supabase/tests/revocable_links.sql` chạy lại thành công trên Supabase thật, mọi dữ liệu thử được rollback. Các kiểm tra bao gồm xem ẩn danh, thời hạn hữu hạn/vô hạn, loại/quyền sai, nhận link nhiều người, chặn ghi trực tiếp, thêm/sửa/xóa/thông tin chờ duyệt, duyệt bởi admin, thu hồi, hết hạn, danh sách còn hiệu lực và quyền độc lập. Kiểm thử JavaScript bao gồm bản nháp editor chỉ gửi yêu cầu, chống gửi trùng và phiên đăng nhập hết hạn.
