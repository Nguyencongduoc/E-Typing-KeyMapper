# e-typing Key Remapper 3.5.1

Bản này giữ cách đọc DOM, xử lý sự kiện bàn phím, popup và HUD của extension mẫu. Thay đổi duy nhất về chức năng so với bản khôi phục 3.5.0 là phím bật/tắt: **Ctrl + Shift + F8**. Hai phím cũ F8 và Alt+S không còn bật/tắt extension.

Phím mới chỉ hoạt động khi trang e-typing nhận bàn phím. Phải nhấn đúng Ctrl + Shift + F8, không thêm Alt/Windows; giữ phím không đổi trạng thái liên tục. Trạng thái được lưu như mẫu. Không đăng ký phím toàn hệ thống hay background worker. Tổ hợp này không có trong danh sách mặc định Windows/Chrome đã đối chiếu, nhưng phần mềm khác hoặc phím tắt tự đặt vẫn có thể dùng trùng.

- Windows: https://support.microsoft.com/en-us/accessibility/windows/keyboard-shortcuts-in-windows
- Chrome: https://support.google.com/chrome/answer/157179?hl=en

Gói cài vẫn gồm đúng bảy file. injected.js, background.js, popup.js và popup.css khớp từng byte với mẫu; content.js chỉ thay khối phím tắt, popup.html chỉ đổi dòng hướng dẫn. Manifest giữ nguyên cấu hình/quyền storage và tăng phiên bản.

## Cài đặt

1. Giải nén ZIP 3.5.1 và chọn thư mục chứa manifest.json bằng Load unpacked, hoặc dùng dist/etyping-keymapper.
2. Reload extension và tải lại trang e-typing một lần để áp dụng mã mới.
3. Giữ Romaji ON như điều kiện của mẫu gốc. Bật guide nếu muốn game hiển thị phím cần gõ.

Không cần mở popup trước mỗi bài. Accuracy 80–100%, ẩn HUD, nhịp gõ thật và hành vi nhận phím lặp của mẫu giữ nguyên. Extension không thêm delay hoặc tự gõ.

Quy tắc chấm điểm của game giữ nguyên, kể cả trường hợp game trả -1/0 khi loại kết quả. Bản này không bổ sung đọc đáp án khi Romaji OFF. Xem VALIDATION.md để biết kết quả kiểm thử và phạm vi.

Phát triển: npm test; npm run check; npm run test:browser; npm run package. Kiểm thử trình duyệt cần Playwright và Edge, hỗ trợ ETKM_PLAYWRIGHT_PATH. Đóng gói yêu cầu báo cáo trình duyệt khớp hash bảy file hiện tại.
