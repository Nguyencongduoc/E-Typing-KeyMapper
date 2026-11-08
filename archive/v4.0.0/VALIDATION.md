# Trạng thái kiểm chứng — 2026-10-29

## Đã kiểm chứng

- Đọc toàn bộ bảy file extension mẫu do người dùng cung cấp.
- Mở trang bài Romaji công khai trong trình duyệt, mở frame game, bấm Start và Space để xem đếm ngược và DOM lúc đang gõ. Chưa cài bản mới vào trình duyệt người dùng.
- Frame quan sát được: `/app/jsa_std/typing.asp?t=trysc.trysc.trysc.std.0&u=&s=0`. URL ban đầu của iframe ngoài là `/app/standard.asp`, sau đó chuyển sang tài liệu game trên.
- DOM quan sát được: `#app`, `#start_view`, `#start_msg`, `#countdown`, `#example_container`, `#kanaText`, `#sentenceText`; câu Romaji gồm span `.entered` và span chứa phần còn lại bằng chữ in hoa.
- Đối chiếu JavaScript công khai `https://www.e-typing.ne.jp/app/jsa_std/js/app.min.js?_=2026010501`: phần chấm ký tự desktop đọc `charCode` ở keypress; keydown xử lý các phím điều khiển. Khi chuyển câu, game có khoảng thời gian riêng và xóa nội dung câu cũ. Bản sao nghiên cứu không nằm trong ZIP.
- `node --test`: **42/42 ca qua** trên Node.js v24.20.0.
- `node scripts/check.cjs`: cú pháp sáu file JavaScript runtime hợp lệ, các file manifest tham chiếu tồn tại, chỉ quyền `storage`, phạm vi script giới hạn URL frame game.

Các ca kiểm thử bao gồm: ánh xạ chữ/số/dấu câu ASCII; phím chồng nhau; cặp keydown/keypress/keyup qua cuối câu; lặp khi giữ phím; tắt giữa lượt nhấn; lọc IME, modifier, ô nhập liệu và frame mất focus; cấu hình khởi tạo; bridge sai nguồn/sai cấu trúc; lỗi sửa thuộc tính sự kiện; adapter và trạng thái DOM; công tắc riêng tab; hai lần bật/tắt đồng thời; dọn công tắc lúc đóng tab; thống kê theo timestamp; không có đường phát phím khi telemetry chạy lúc nghỉ.

## Chưa kiểm chứng

- Chưa chạy trọn bài e-typing với bản extension mới đã được Load unpacked.
- Chưa xác nhận thực nghiệm trong Chromium thật rằng tất cả thuộc tính KeyboardEvent đều sửa được với phiên bản Chrome/Edge đang dùng. Kiểm thử runtime hiện dùng đối tượng sự kiện mô phỏng; cờ `isTrusted` trong kiểm thử là dữ liệu mô phỏng, không phải bằng chứng về trust của trình duyệt.
- Chưa đo độ trễ gõ trên máy người dùng, chưa kiểm tra thị giác popup/HUD và thao tác kéo trong trình duyệt.
- Chưa xác nhận các kiểu bài hoặc URL frame khác, tiếng Anh, Kana, bàn phím/layout ngoài trường hợp đã mô tả.

## Giới hạn công cụ trong lượt làm việc

Trang fixture cục bộ đã được tạo, nhưng trình duyệt tích hợp không kết nối được server localhost. Sau đó công cụ điều khiển Windows dừng vì không xác định đủ chắc URL hiện tại của cửa sổ Chrome để áp dụng chính sách của công cụ. Mọi thao tác điều khiển trình duyệt đã dừng tại đó. Không có kết quả kiểm thử giao diện hoặc e-typing hoàn chỉnh nào được suy ra từ các kiểm thử mô phỏng.

## Kiểm tra sau khi cài

1. Tắt bản remapper cũ, Load unpacked bản mới và tải lại trang.
2. Mở bài Romaji, giữ hiển thị Romaji ON, Start → Space → chờ đếm ngược. HUD cần báo đang ánh xạ.
3. Bấm ngẫu nhiên từng phím: mỗi lượt tiến một ký tự đúng; ngừng 10 giây thì không có ký tự mới.
4. Thử gõ nhanh, dấu câu, cuối câu, chuyển câu và hoàn thành bài. Phím trong khoảng chuyển câu không được phát bù.
5. Kiểm tra F8, công tắc popup, hai tab độc lập, tải lại với cấu hình tắt, hai chế độ giữ phím và ô nhập liệu bình thường.
6. Kiểm tra HUD, kéo vị trí, xuất JSON và console của frame/worker. Ghi nhận lỗi kèm URL bài và phiên bản trình duyệt trước khi mở rộng phạm vi hỗ trợ.
