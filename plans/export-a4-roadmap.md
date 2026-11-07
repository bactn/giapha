# Kế hoạch chỉnh sửa xuất file gia phả

## Quy tắc đã chốt

- A4 ngang 297 × 210 mm, nhiều trang trong cùng một PDF.
- Nối tiếp các cây hai thế hệ: **1–2, 2–3, 3–4…**, lặp lại thế hệ cha/mẹ ở lượt tiếp theo. Không tách thành 1–2 rồi 3–4.
- Duyệt từ cụ tổ tới thế hệ cuối. Trong mỗi nhóm cùng bố/mẹ, giữ thứ tự anh/chị/em đã lưu.
- Mỗi cây chỉ có cha/mẹ và con trực tiếp. Một trang có thể chứa nhiều cây cùng cặp thế hệ nếu đủ chỗ theo chiều dọc.
- Không cho bất kỳ node, chữ hoặc đường nối vượt chiều ngang vùng in. Khi hết chiều dọc, sang trang mới; không cắt đôi node.

## Dữ liệu trên mọi định dạng

Chuẩn hóa một bộ thông tin dùng chung cho PNG, SVG, PDF khổ lớn, PDF A4, In A4 và bảng dữ liệu:

1. Tên thánh nếu đã nhập, họ tên đầy đủ.
2. Ngày/năm sinh nếu có.
3. Ngày mất dương lịch nếu có; ngày giỗ âm lịch nếu có, ghi rõ loại lịch để tránh nhầm.
4. Hưởng thọ: ưu tiên giá trị nhập riêng; nếu không có thì tính theo ngày sinh/ngày mất dương lịch. Khi thiếu ngày/tháng chỉ tính chênh lệch năm. Nếu chưa tính được thì ghi “chưa rõ” cho người đã mất, không tự tạo tuổi 0.
5. Giữ thông tin nhận diện đời, mã thành viên và nhánh; quan hệ vợ/chồng ghi thành chữ.

JSON sao lưu giữ nguyên toàn bộ dữ liệu gốc, gồm hai trường ngày mất và giá trị hưởng thọ nhập riêng. CSV/Excel cần thêm cột riêng cho ngày mất dương lịch, giỗ âm lịch và hưởng thọ; không gộp hai lịch vào một cột.

## Giai đoạn A — Chuẩn hóa nội dung xuất

- Tạo bộ dựng các dòng thông tin dùng chung; tránh mỗi định dạng tính tuổi/đọc ngày khác nhau.
- Chờ phông chữ tải xong trước khi đo và vẽ. Xuống dòng theo chiều rộng thực tế; không dùng dấu ba chấm để mất tên thánh, ngày tháng hoặc hưởng thọ.
- Tính chiều cao node theo số dòng nội dung. Kiểm tra chữ Việt có dấu, tên dài, thiếu ngày sinh và hưởng thọ nhập riêng.
- Đồng bộ bộ lọc nhánh, lựa chọn cây con và giới hạn thế hệ giữa các định dạng.

## Giai đoạn B — Chia cây hai thế hệ

Thay cách gom nguyên thế hệ rồi thu nhỏ toàn bộ đang có bằng bộ lập trang đo theo vùng in:

1. Lấy các thành viên trong phạm vi xuất, lập danh sách cha/mẹ và con trực tiếp theo thứ tự đời và thứ tự anh/chị/em.
2. Lập các nhóm cây cho cặp đời 1–2, sau đó 2–3 và tiếp tục đến cuối. Những người không có con trong phạm vi đã chọn vẫn phải có thông tin trong bản xuất.
3. Với từng cây, đo node cha/mẹ, các node con và khoảng cách nối. Xếp các node con thành hàng có chiều rộng tối đa bằng vùng in, không ép một hàng quá rộng rồi giảm chữ xuống mức khó đọc.
4. Nếu nhiều con, chia thành nhiều hàng. Nếu phần còn lại của trang không đủ, sang trang tiếp theo và lặp lại node cha/mẹ, ghi rõ “tiếp”. Các con đã xuất không bị lặp lại trong cùng lượt của cây.
5. Vẽ đường nối theo từng nhóm trên trang, tránh chạy xuyên qua node ở hàng trên. Đặt số trang, cặp đời và nhánh vào tiêu đề/ghi chú trang để nối mạch.
6. Chỉ chuyển sang cặp thế hệ tiếp theo khi đã xuất hết các cây trong cặp hiện tại. Người con đã xuất sẽ được lặp lại với vai trò cha/mẹ trong cặp kế tiếp.

## Giai đoạn C — PDF và lệnh in dùng chung bố cục

- PDF A4 và In A4 lấy cùng danh sách trang; không lập trang riêng bằng hai thuật toán.
- Mỗi trang PDF có khổ A4 ngang cố định. Dự kiến lề trái/phải 12 mm, trên 14 mm, dưới 12 mm; thống nhất lại trong cấu hình vùng in.
- Giữ cỡ chữ tối thiểu đọc được khi in 100%. Nếu thiếu chỗ, thêm trang thay vì co toàn bộ cây vô hạn.
- Với bộ dựng canvas hiện tại: xuất khoảng 300 DPI, dựng và mã hóa lần lượt từng trang rồi giải phóng canvas để giảm bộ nhớ. Không tạo một ảnh khổng lồ chứa toàn bộ dòng họ.
- Trang in đặt `@page` A4 ngang và ngắt trang rõ ràng. Hướng dẫn tắt đầu/chân trang do trình duyệt chèn thêm khi cần.

## Giai đoạn D — Kiểm chứng trước phát hành

- Dữ liệu thử: cây sâu nhiều đời, một cha/mẹ có rất nhiều con, nhiều cụ tổ, người không có con, vợ/chồng tách node, tên thánh/tên dài, dữ liệu thiếu ngày/tháng, ngày mất của hai lịch khác nhau và tuổi nhập riêng.
- Mọi thành viên trong phạm vi phải xuất hiện ít nhất một lần; mọi quan hệ cha/mẹ–con thuộc phạm vi có đường nối hoặc chỉ dẫn tiếp trang. Chỉ lặp lại node theo quy tắc nối thế hệ và tiếp trang.
- Mỗi trang chỉ chứa các cây của một cặp thế hệ; danh sách cặp tăng dần 1–2, 2–3…; không bỏ sót thế hệ cuối.
- Kiểm tra tọa độ node/chữ/đường nối nằm trong vùng in. Không có node bị cắt ngang hoặc cắt dọc.
- Tạo PDF thử nhiều trang, kiểm tra kích thước trang, dựng từng trang thành ảnh để rà chữ, đường nối và ngắt trang; đối chiếu với In A4.
- Kiểm tra PDF nhiều thành viên trên mobile, tổng số trang, thứ tự trang và bộ nhớ trong quá trình xuất.

## Trạng thái

Hai trường mới hiện chỉ dành cho người có quyền truy cập; chưa đưa vào bản công khai hoặc link khách. Khi triển khai xuất file sẽ dùng đúng dữ liệu mà người đang xuất được phép xem.

Phần dữ liệu ngày mất dương lịch, hưởng thọ tự tính/nhập riêng và hai tab lịch giỗ được triển khai trước. Các giai đoạn A–D ở trên là bước chỉnh sửa xuất file tiếp theo; thuật toán xuất PDF hiện tại chưa được thay bằng bộ chia cây hai thế hệ trong thay đổi dữ liệu này.
