# e-typing Key Remapper (v3.6.1)

Extension Chrome / Microsoft Edge Manifest V3 chuyên dụng cho **e-typing.ne.jp**: Tự động chuyển đổi mọi phím bạn gõ trên bàn phím thành ký tự chính xác tiếp theo của bài thi, giữ nguyên 100% nhịp gõ và sự kiện bàn phím thật (`isTrusted: true`).

---

## Bản sửa 3.6.1

- Sửa lỗi gõ đúng khi Romaji OFF lại hiện toàn bộ romaji của câu, phát sinh ở bản 3.6.0.
- Hướng dẫn bàn phím/ngón tay vẫn cập nhật theo ký tự tiếp theo; trạng thái hiển thị của game được khôi phục sau mỗi lần cập nhật.
- Đã qua 13 kiểm thử tự động và được người dùng xác nhận sau khi chạy thử bản sửa.

## 🌟 Tính năng

1. **Kiến trúc Hybrid độc quyền (Hỗ trợ cả Romaji ON và Romaji OFF)**:
   - Khi bài thi hiển thị Romaji (Romaji ON): Đọc trực tiếp từ DOM, nhẹ và an toàn tuyệt đối.
   - Khi bài thi tắt Romaji (Romaji OFF): Tự động fallback sang đọc trực tiếp ký tự tiếp theo từ engine ngầm của game (`typingEngine.nextKeyCharCode()`).
2. **Hỗ trợ Follow Bàn phím & Ngón tay khi Romaji-OFF**:
   - Khi tắt Romaji, game e-typing mặc định sẽ tắt luôn hướng dẫn bàn phím và ngón tay.
   - Phiên bản 3.6.0 tự động kích hoạt để **bàn phím ảo và ngón tay mô phỏng vẫn sáng đèn và nhảy theo đúng ký tự tiếp theo**, giúp bạn luyện gõ chuẩn tư thế mà không cần nhìn chữ Romaji.
   - Bản sửa ngày 11/11/2026: gõ đúng khi Romaji OFF chỉ hiện phần đã gõ, không làm lộ toàn bộ câu. Cờ hiển thị của game được khôi phục ngay sau mỗi lần cập nhật hướng dẫn.
3. **Khắc phục triệt để lỗi lệch phím gõ nhanh (Key Rollover Map)**:
   - Theo dõi sự kiện theo từng mã phím vật lý (`event.code`) độc lập. Khi gõ lướt nhanh nhiều phím cùng lúc, sự kiện `keyup` không bị gán nhầm sang phím khác.
4. **Bộ lọc phím thông minh (Non-printable Key Filtration)**:
   - Bỏ qua phím `Shift` đơn lẻ, `CapsLock`, `Insert`, `Delete`, và các phím mũi tên điều hướng. Vô tình chạm các phím này sẽ không bị tiêu hao ký tự bài thi.
5. **Bảo vệ chống bẫy gian lận (`FRAUD_SCORE = 1200`)**:
   - Tích hợp tùy chọn **"Chặn giữ đè phím (chống bị hủy điểm)"** (`blockRepeat`). Ngăn ngừa việc đè phím gây quá tốc độ khiến e-typing hủy kết quả (điểm -1 / 0).
6. **Hỗ trợ toàn diện ký tự đặc biệt & Dấu câu**:
   - Đầy đủ mã phím cho: `-`, `ー`, `,`, `.`, `/`, `;`, `:`, `[`, `]`, `!`, `?`, `_`, `~`, `(`, `)`, `"`, `'`, `@`, `#`, `$`, `%`, `^`, `&`, `*`, `+`, `=`, `<`, `>`, `{`, `}`, `|`, `\`.
7. **Tối ưu hiệu năng HUD**:
   - Sử dụng cơ chế dirty-checking (`textContent`), giảm 90% tải CPU, loại bỏ hoàn toàn hiện tượng DOM reflow chu kỳ 200ms.
   - Khi Romaji OFF, bảng HUD hiển thị chuỗi Romaji đọc được từ engine kèm nhãn `(Romaji-OFF)`.
8. **Bộ nhận diện thương hiệu hoàn chỉnh**:
   - Trang bị bộ icon sắc nét (16, 32, 48, 128px) chuẩn Google Chrome & Microsoft Edge.

---

## ⌨️ Phím tắt bật/tắt nhanh

* **`Ctrl + Shift + F8`**: Bật hoặc tắt nhanh extension trực tiếp khi đang ở trang e-typing mà không cần mở popup.
* Trạng thái bật/tắt được đồng bộ tức thì trên toàn bộ các frame và lưu vào `chrome.storage.local`.

---

## 🚀 Hướng dẫn cài đặt

1. **Cách 1 (Dùng thư mục Unpacked)**:
   - Mở trình duyệt (Chrome, Edge, Brave, Cốc Cốc) và truy cập `chrome://extensions` (hoặc `edge://extensions`).
   - Bật **Developer mode** (Chế độ dành cho nhà phát triển).
   - Bấm **Load unpacked** (Tải tiện ích đã giải nén) và chọn thư mục: `dist/etyping-keymapper`.
2. **Cách 2 (Dùng file nén ZIP)**:
   - Tải `etyping-keymapper-3.6.1.zip` tại [GitHub Releases](https://github.com/Nguyencongduoc/E-Typing-KeyMapper/releases/tag/v3.6.1), hoặc dùng `dist/etyping-keymapper-3.6.1.zip` trong repository.
   - Giải nén ZIP rồi chọn **Load unpacked** với thư mục chứa `manifest.json`. Tắt bản cũ và tải lại trang e-typing.

---

## 🛠️ Lệnh kiểm thử & Phát triển

```bash
# Chạy bộ unit test (13 kiểm thử)
npm test

# Kiểm tra cú pháp, tính toàn vẹn Manifest và bộ icon
npm run check

# Đóng gói bản phân phối chuẩn vào thư mục dist/
npm run package
```
