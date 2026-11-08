# e-typing KeyMapper 4.0

Extension Manifest V3 cho bài **Romaji** của e-typing. Trong bài đang nhận phím, mỗi lượt bấm phím tạo ký tự được chuyển thành ký tự đúng tiếp theo. Nhịp bấm do bạn quyết định; extension không tự phát phím hay chỉnh điểm game.

## Cài vào Chrome / Edge

1. Giải nén `etyping-keymapper-4.0.0.zip` vào một thư mục cố định, hoặc dùng thư mục `dist/etyping-keymapper`.
2. Mở `chrome://extensions` hoặc `edge://extensions`.
3. Bật **Developer mode / Chế độ dành cho nhà phát triển**.
4. Chọn **Load unpacked / Tải tiện ích đã giải nén**, chọn thư mục có `manifest.json`.
5. Tắt bản remapper cũ để tránh hai extension cùng sửa một sự kiện.
6. Tải lại trang e-typing, mở bài tại https://www.e-typing.ne.jp/roma/check/ rồi bấm **スタート**, nhấn **Space** và chờ đếm ngược.
7. Giữ **ローマ字表示 (hiển thị Romaji)** ở ON. Bấm vào khung bài; HUD sẽ báo **Đang ánh xạ phím** khi sẵn sàng.

Yêu cầu Chrome/Edge nền Chromium 111 trở lên. Bản này nhắm vào frame `/app/jsa_std/typing.asp` và chế độ Romaji có đáp án trong DOM. Những kiểu bài khác, Kana, tiếng Anh và khung game khác chưa được hỗ trợ.

## Cách dùng

- Gõ các phím tạo ký tự như chữ, số, dấu câu hoặc Space trong bài. Chúng được chuyển thành ký tự Romaji game đang hiển thị.
- Escape, Tab, Enter, Backspace, phím điều hướng và tổ hợp Ctrl/Alt/Meta không được chuyển thành chữ. Shift đứng riêng không làm tiến bài. Các phím điều khiển vẫn có thể được game xử lý theo chức năng riêng.
- Mặc định **F8** bật/tắt trong khung bài. Popup cho đổi sang **Alt + S** hoặc không dùng. Phím tắt chỉ hoạt động khi focus nằm trong frame game, ngoài ô nhập liệu, và extension đã kết nối.
- Công tắc chính trong popup áp dụng riêng cho tab. **Mặc định bật ở tab mới** là cấu hình chung. **Theo mặc định** xóa lựa chọn riêng của tab hiện tại. Lựa chọn riêng tồn tại qua tải lại trong phiên trình duyệt, mất khi đóng tab hoặc khởi động lại trình duyệt.
- Mặc định bỏ nhịp lặp do giữ phím. Bật **Cho phép giữ phím** để nhận các lượt lặp mà hệ điều hành gửi. Extension không tự tạo lượt lặp.
- Kéo tiêu đề HUD để đổi vị trí. Có thể ẩn HUD mà vẫn ánh xạ phím.
- Số liệu là các lượt keydown đã được ánh xạ, không phải số ký tự chắc chắn đã được game chấm. KPM bấm = `(số lượt bấm - 1) × 60000 / (thời điểm cuối - thời điểm đầu)`, không tính các lượt lặp của hệ điều hành. Khoảng nghỉ giữa các lượt bấm vẫn nằm trong thời gian tính.
- **Cần chuyển** là tỷ lệ lượt bấm có ký tự vật lý khác đáp án, không phải độ chính xác game. Số liệu tồn tại trong frame bài hiện tại; tải lại hoặc mở lại frame sẽ bắt đầu phiên mới. Đặt lại số liệu không chỉnh kết quả của game.
- Xuất JSON chỉ gồm số liệu tổng hợp và thời gian xử lý, không chứa chuỗi phím đã gõ.

## Giới hạn

Extension sửa dữ liệu đọc từ chính KeyboardEvent thật, không tạo sự kiện mới và không biến sự kiện giả thành sự kiện thật. Khi không nhận diện được đáp án hoặc bạn dùng IME/ô nhập liệu, extension ngừng sửa phím; khi đó không bảo đảm đầu ra đúng. Trong lúc game chuyển câu hoặc đếm ngược, các phím không được xếp hàng hay phát bù.

Đây là cơ chế phụ thuộc DOM và cách game đọc sự kiện. Khi e-typing hoặc trình duyệt thay đổi, cần kiểm tra lại. MAIN world chia sẻ môi trường với trang; kiểm tra thông điệp chỉ giúp lọc dữ liệu sai cấu trúc, không tạo ranh giới bảo mật trước trang.

Nếu HUD báo không đọc được đáp án: kiểm tra Romaji đang ON, focus đúng khung bài, tắt extension remap khác, rồi tải lại trang. Nếu vừa cập nhật extension, đóng/mở lại bài hoặc tải lại trang để content script mới được nạp.

## Quyền và dữ liệu

Chỉ dùng quyền `storage`. Script chỉ được chèn vào URL frame game đã khai báo, không chạy trên trang đăng nhập. Không dùng debugger, không gửi số liệu ra mạng và không lưu chuỗi phím. Cấu hình và vị trí HUD lưu trong `storage.local`; công tắc tab lưu trong `storage.session`; thống kê giữ trong bộ nhớ frame.

## Phát triển

Không cần cài dependency. Dùng Node.js 18+:

```text
npm run check
npm test
npm run package
```

Đóng gói ZIP dùng `Compress-Archive` có sẵn trên Windows. Chạy `node scripts/serve-fixture.cjs` rồi mở http://127.0.0.1:4173/tests/browser.html để kiểm tra runtime bằng sự kiện bàn phím thật trên fixture cục bộ. http://127.0.0.1:4173/popup.html là bản xem trước UI với dữ liệu mẫu, không phải popup extension thật.

Các kiểm thử tự động và fixture không thay thế việc cài extension và chạy trọn bài trên e-typing. Xem `VALIDATION.md` để biết phạm vi đã được kiểm chứng.
