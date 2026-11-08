# e-typing Key Remapper 3.4.0

Giữ cấu trúc bảy file và tính năng mẫu. Bản 3.4.0 tự khởi tạo và phục hồi khi mở bài, bấm もう1回 trong cùng khung, đổi frame, tải trang hoặc Reload extension; không cần mở popup hay bấm kết nối lại. Giữ tối ưu phím/HUD, Romaji OFF và các phím tắt.

## Cấu trúc bản cài

ZIP và thư mục `dist/etyping-keymapper` chứa đúng bảy file:

```text
manifest.json
popup.css
popup.html
popup.js
background.js
content.js
injected.js
```

`popup.css` giữ nguyên từng byte so với mẫu. Mọi điều khiển cũ, Accuracy và hành vi nhận phím lặp được giữ. Manifest giữ phạm vi host và quyền storage/scripting; thêm `webNavigation` để tự theo dõi vòng đời trang/frame. `background.js` xử lý tự phục hồi, phím tắt và badge. Mã debugger cũ được giữ trong nhánh kiểm tra API, không thêm quyền debugger.

## Tính năng giữ nguyên

- Bấm phím theo nhịp thực tế; mỗi lượt bấm được chuyển thành ký tự đúng tiếp theo khi có đáp án. Dừng bấm thì không tự gõ thêm.
- Công tắc bật/tắt chung như mẫu, không chuyển sang công tắc riêng từng tab.
- Thanh Accuracy 80–100%. 100% chọn ký tự đúng; dưới 100% vẫn có xác suất tạo lỗi như mẫu. Tùy chọn này là xác suất mỗi lượt, không bảo đảm tỷ lệ cuối bài khớp chính xác con số đã chọn.
- HUD, các trường Hiragana/Romaji/ký tự đích và công tắc ẩn HUD như mẫu.
- Cả hai phím tắt Alt + S và F8 cùng hoạt động như mẫu.
- Giữ phím vẫn nhận các lượt lặp từ hệ điều hành như mẫu, không thêm tùy chọn chặn repeat.
- Dùng đúng các khóa cấu hình cũ `enabled`, `accuracy`, `showHud` và giao thức đồng bộ cũ.

## Phím tắt và độ ổn định

- **F8** hoặc **Alt + S**: bật/tắt ngay khi focus ở trang e-typing. Giữ phím tắt chỉ đổi một lần, tránh bật/tắt liên tục theo auto-repeat.
- **Alt + Shift + K**: bật/tắt qua trình duyệt khi Chrome/Edge có focus, kể cả đang ở ngoài khung bài. Badge của icon hiện ON/OFF. Popup có nút **Đổi phím tắt trình duyệt** để mở trang gán phím; nếu bị trùng, popup hiển thị chưa được gán.
- Theo dõi riêng từng lượt nhấn để keypress/keyup vẫn cùng ánh xạ khi gõ chồng phím hoặc vừa chuyển câu.
- Mỗi lượt bấm đọc trực tiếp mã ký tự kế tiếp; không dựng snapshot câu/HUD trên đường xử lý phím. Thuộc tính phím được cache và áp dụng lên sự kiện gốc.
- HUD dựng DOM một lần, chỉ đổi text cần thiết tối đa 10 lần/giây khi hiện. Tắt HUD sẽ dừng gửi yêu cầu trạng thái; frame quảng cáo và trang ngoài game không có vòng poll.
- Không đặt nhịp gõ, không thêm delay vào đường nhập và không phát bù ký tự sau khoảng nghỉ.

## Sửa luồng chơi lại và bàn phím mô phỏng

- Mỗi màn hình Space mới được nhận diện là một lượt mới trong cùng tài liệu; ánh xạ/HUD được đồng bộ lại tự động mà không tải lại trang.
- Đọc engine hiện đang đăng ký nhận phím, bổ sung theo dõi engine qua view và khôi phục hook khi jQuery thay hàm proxy.
- Callback phím tắt trì hoãn của bảng kết quả đã bị hủy được bỏ qua. Bấm もう1回 ngay khi bảng kết quả xuất hiện không còn gọi vào view đã finalize.
- Thế hệ bridge mới có thứ tự ưu tiên rõ ràng; thông báo trễ của phiên cũ không được tắt phiên hiện tại.
- Phím mô phỏng màu cam bám ký tự đúng tiếp theo, kể cả khi Romaji/guide/HUD đều OFF. Cập nhật theo frame hiển thị, không đưa công việc này vào đường gõ đồng bộ. Khi tắt mapper, lớp đánh dấu được gỡ và giao diện gốc được giữ.

## Tự sẵn sàng và tự phục hồi

- Khi đang bật, mở bài mới, mở tab mới, đóng rồi mở lại bài và tải lại trang đều tự nạp phần ánh xạ và HUD. Không có chế độ hoặc nút kiểm tra/kết nối lại.
- Trạng thái Bật/Tắt, Accuracy và HUD được lưu. Nếu chủ động tắt bằng phím tắt, extension giữ OFF cho đến khi bạn bật lại.
- Khởi tạo nhiều lần vẫn chỉ có một bộ xử lý và một vòng cập nhật HUD. Khi Reload extension, phiên cũ tự dừng timer/listener để tránh chạy trùng và lag.
- Khi Chrome cho worker nghỉ, sự kiện mở trang/frame sẽ đánh thức worker. Từng phím gõ vẫn xử lý ngay trong trang.
- Trang còn giữ mã 3.2.0 hoặc script được nạp quá muộn để thấy engine sẽ được tải lại tự động một lần. Đây là phục hồi khi cập nhật hoặc thiếu script; không tải lại sau mỗi bài.

## Bổ sung: Romaji OFF

Khi tắt **ローマ字表示 / Romaji** trong game, bộ máy chấm vẫn giữ câu và vị trí ký tự kế tiếp. Phần bổ sung quan sát context mà game truyền vào `jQuery.proxy` lúc đăng ký handler để giữ tham chiếu tới engine, rồi chỉ đọc đáp án và con trỏ hiện tại. Cách này vẫn hoạt động trong kiểm thử khi cả Romaji và hướng dẫn bàn phím đều OFF.

Extension không bật lại Romaji, không bật hướng dẫn phím, không tự phiên âm Hiragana, không ghi con trỏ đáp án hay điểm số. Nhịp nhập vẫn đi qua sự kiện bàn phím như bản mẫu. Bộ đọc DOM cũ vẫn được dùng khi chưa quan sát được engine.

HUD có thể hiển thị Romaji dù phần Romaji của game đang OFF; đây vẫn là chức năng đọc đáp án của HUD. Tắt tùy chọn hiển thị HUD trong popup nếu bạn muốn ẩn cả bảng này.

## Cài / cập nhật

1. Giải nén `dist/etyping-keymapper-3.4.0.zip`, hoặc dùng trực tiếp thư mục `dist/etyping-keymapper`.
2. Mở `chrome://extensions` hoặc `edge://extensions`, bật Developer mode, chọn Load unpacked và chọn thư mục chứa đúng bảy file trên.
3. Nếu extension đang được tải từ thư mục này, bấm Reload tại thẻ extension. Tắt các bản remapper khác đang cùng chạy.
4. Chỉ cần Reload extension một lần để nhận bản cập nhật. Extension tự xử lý các trang e-typing đang mở; trang quá cũ có thể được tự tải lại một lần.
5. Có thể đặt Romaji OFF và hướng dẫn bàn phím OFF trong game trước khi Start. Bấm Start → Space → chờ đếm ngược → gõ theo nhịp của bạn.
6. Giữ Accuracy ở 100% nếu muốn đầu ra luôn chọn ký tự đúng. Các phím tắt và công tắc HUD dùng như bản mẫu.

Popup hiển thị **v3.4.0 · Tự khởi động cùng bài tập**. Sau cập nhật, các lần sử dụng tiếp theo chỉ cần mở bài và gõ; không cần mở popup. Worker chỉ chạy khi có sự kiện vòng đời trang, cấu hình hoặc phím tắt trình duyệt.

## Kiểm tra và giới hạn

Kiểm thử gồm các ca logic hồi quy và các bài nghiệm thu trên website e-typing thật bằng extension được nạp trong profile Edge headless riêng. Có kiểm tra trọn bài Romaji ON/OFF, số ký tự, điểm/thời gian và số lỗi game; đồng thời tái hiện frame chưa có script/HUD rồi kiểm tra phục hồi. Xem kết quả cụ thể và giới hạn môi trường trong `VALIDATION.md`.

Đọc engine phụ thuộc các phương thức hiện có của e-typing. Nếu game đổi cách khởi tạo hoặc đổi phương thức, phần bổ sung cần cập nhật. Trường hợp chưa đọc được engine và Romaji không nằm trong DOM, extension không đoán đáp án. Cơ chế phục hồi tự xử lý thiếu hook; nếu website đổi API engine thì vẫn cần cập nhật extension.

## Phát triển

Kiểm tra logic không cần cài thư viện:

```text
npm run check
npm test
```

Kiểm thử trình duyệt cần Playwright và Edge cài sẵn. Có thể trỏ biến `ETKM_PLAYWRIGHT_PATH` tới thư mục package Playwright đã có, hoặc cài dev dependency rồi chạy:

```text
npm run test:browser
npm run test:recovery
npm run test:keyboard
npm run test:performance
npm run package
```

`npm run package` chỉ tạo ZIP khi báo cáo game thật, phục hồi, bàn phím/chơi lại/nâng cấp và hiệu năng đều qua, hash nguồn của bảy file khớp mã hiện tại. Test không điều khiển profile Chrome cá nhân và không sửa kết quả game. Nhịp 150 ms là nhịp bấm của bộ kiểm thử.

Các file kiểm thử, tài liệu và bản lưu trong `archive` không nằm trong gói cài. Kiểm thử tích hợp dùng `research/app.min.js` nếu có; benchmark dùng bản nền `archive/v3.1.1-baseline` và cùng fixture trình duyệt 500 phím để so sánh. Chi tiết và phạm vi đo trong `VALIDATION.md`.
