# e-typing Key Remapper (v3.6.0 Final Release)

Extension Chrome / Microsoft Edge Manifest V3 chuyên dụng cho **e-typing.ne.jp**: Tự động chuyển đổi mọi phím bạn gõ trên bàn phím thành ký tự chính xác tiếp theo của bài thi, giữ nguyên 100% nhịp gõ và sự kiện bàn phím thật (`isTrusted: true`).

---

## 🌟 Điểm nổi bật phiên bản 3.6.0

1. **Kiến trúc Hybrid độc quyền (Hỗ trợ cả Romaji ON và Romaji OFF)**:
   - Khi bài thi hiển thị Romaji (Romaji ON): Đọc trực tiếp từ DOM, nhẹ và an toàn tuyệt đối.
   - Khi bài thi tắt Romaji (Romaji OFF): Tự động fallback sang đọc trực tiếp ký tự tiếp theo từ engine ngầm của game (`typingEngine.nextKeyCharCode()`).
2. **Hỗ trợ Follow Bàn phím & Ngón tay khi Romaji-OFF**:
   - Khi tắt Romaji, game e-typing mặc định sẽ tắt luôn hướng dẫn bàn phím và ngón tay.
   - Phiên bản 3.6.0 tự động kích hoạt để **bàn phím ảo và ngón tay mô phỏng vẫn sáng đèn và nhảy theo đúng ký tự tiếp theo**, giúp bạn luyện gõ chuẩn tư thế mà không cần nhìn chữ Romaji.
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
   - Sử dụng file nén sẵn sàng phát hành: `dist/etyping-keymapper-3.6.0.zip`.

---

## 🛠️ Lệnh kiểm thử & Phát triển

```bash
# Chạy bộ unit test 10/10 kiểm chứng toàn diện
npm test

# Kiểm tra cú pháp, tính toàn vẹn Manifest và bộ icon
npm run check

# Đóng gói bản phân phối chuẩn vào thư mục dist/
npm run package
```
