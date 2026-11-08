# KẾ HOẠCH PHÁT HÀNH PHIÊN BẢN HOÀN CHỈNH (PLAN.MD - V3.6.0 FINAL)
## DỰ ÁN: E-TYPING KEYMAPPER — BẢN PHÁT HÀNH CHÍNH THỨC (RELEASE CANDIDATE)

---

## 1. MỤC TIÊU & PHẠM VI NÂNG CẤP

Phiên bản phát hành chính thức **v3.6.0** được thiết kế để giải quyết triệt để tất cả các giới hạn của các phiên bản trước, mang lại trải nghiệm hoàn hảo, ổn định tuyệt đối và an toàn cho người dùng khi luyện tập trên `e-typing.ne.jp`.

### Các trụ cột nâng cấp chính:
1. **Kiến trúc đọc Hybrid (Hỗ trợ cả Romaji-ON và Romaji-OFF)**:
   - **Ưu tiên 1 (Mặc định)**: Đọc chuỗi ký tự từ DOM (`#sentenceText`). Đây là chế độ nhẹ, an toàn tuyệt đối và không phụ thuộc cấu trúc nội bộ.
   - **Ưu tiên 2 (Tự động Fallback)**: Khi người dùng **tắt Romaji (Romaji-OFF)** trên giao diện website, extension tự động chuyển sang đọc ký tự đích trực tiếp từ engine ngầm của game (`typingEngine.nextKeyCharCode()`) thông qua cơ chế quan sát an toàn `jQuery.proxy`.
2. **Hỗ trợ Bàn phím & Ngón tay ảo Follow theo ký tự đúng khi Romaji-OFF**:
   - Khi tắt Romaji, game e-typing mặc định tắt luôn đèn bàn phím ảo và hướng dẫn ngón tay (`this._isKBHandView = false`).
   - Extension can thiệp thông minh vào view controller để **bật sáng đèn phím và ngón tay tương ứng theo thời gian thực** (`typingView._isKBHandView = true` và `_nextKeyActive()`), giúp bạn luyện gõ mù với giao diện ngón tay chuẩn xác mà không cần hiển thị chữ Romaji.
3. **Khắc phục lỗi lệch phím gõ nhanh (Key Rollover Map)**:
   - Sử dụng `Map<string, string>` theo mã phím vật lý (`event.code`) thay cho biến đơn lẻ `lastMappedChar`. Đảm bảo cặp sự kiện `keydown` và `keyup` của từng phím luôn khớp nhau 100%, không bị lẫn lộn khi người dùng gõ lướt (rollover).
4. **Bộ lọc phím không in được (Non-printable Key Filtering)**:
   - Chặn đứng hiện tượng vô tình bấm phím `Shift` đơn lẻ, `CapsLock`, `Insert`, `Delete`, hoặc các phím mũi tên `ArrowUp/Down/Left/Right` làm tiêu hao ký tự bài tập.
5. **Bảo vệ chống kích hoạt bẫy gian lận (`FRAUD_SCORE = 1200`)**:
   - Tích hợp tùy chọn `blockRepeat` (Chặn lặp phím khi giữ đè). Ngăn chặn người dùng vô tình giữ đè 1 phím khiến hệ điều hành bắn phím liên tục ở tốc độ cực cao, kích hoạt hàm `counterFraudScore` của game và dẫn đến điểm số bị hủy thành `-1` điểm.
6. **Đầy đủ bảng ký tự đặc biệt & Dấu câu (Punctuation Coverage)**:
   - Bổ sung bảng mã phím đầy đủ cho các ký tự: `-`, `ー`, `,`, `.`, `/`, `;`, `:`, `[`, `]`, `!`, `?`, `_`, `~`, `(`, `)`, `"`, `'`, `@`, `#`, `$`, `%`, `^`, `&`, `*`, `+`, `=`, `<`, `>`, `{`, `}`, `|`, `\`.
7. **Tối ưu hóa hiệu năng & Giao diện (Performance & UI/UX)**:
   - Khởi tạo HUD DOM một lần duy nhất, chuyển toàn bộ sang cơ chế **Dirty-Checking (`textContent`)**, triệt tiêu 100% hiện tượng DOM reflow chu kỳ 200ms.
   - Khi Romaji-OFF, HUD hiển thị thông minh chuỗi ký tự từ engine ngầm kèm nhãn `(Romaji-OFF)`.
   - Thiết kế bộ Icon thương hiệu chính thức (16, 32, 48, 128px) chuẩn Chrome Web Store / Edge Add-ons.
   - Giữ nguyên tổ hợp phím tắt nhanh thuận tiện: `Ctrl + Shift + F8`.

---

## 2. KẾ HOẠCH TRIỂN KHAI CHI TIẾT (ACTION PLAN)

### Chi tiết các bước thực hiện:
- [x] **Bước 1**: Tạo bộ Icon nhận diện thương hiệu `icons/icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`.
- [x] **Bước 2**: Nâng cấp `injected.js`:
  - Hook an toàn `jQuery.proxy` để nhận diện `typingEngine` và `typingView`.
  - Bộ điều phối Hybrid `getNextExpectedChar()` (DOM trước, Engine sau).
  - Tự động kích hoạt hiển thị phím và ngón tay hướng dẫn khi Romaji-OFF (`activateKBHandGuide`).
  - Quản lý trạng thái phím qua `Map<code, char>` (Rollover an toàn).
  - Lọc bỏ `IGNORED_KEYS` (Shift đơn, CapsLock, phím mũi tên...).
  - Mở rộng bảng mã `SPECIAL_KEYCODES`.
  - Xử lý tùy chọn `config.blockRepeat`.
- [x] **Bước 3**: Nâng cấp `content.js`:
  - Khởi tạo HUD một lần, cập nhật bằng `textContent` (dirty-checking).
  - Hiển thị dữ liệu Romaji-OFF thông minh khi DOM trống.
  - Phím tắt `Ctrl + Shift + F8` bật/tắt nhanh không lặp.
- [x] **Bước 4**: Nâng cấp `popup.html`, `popup.js`, `popup.css`:
  - Thêm điều khiển checkbox `blockRepeat`.
  - Bổ sung ghi chú hỗ trợ cả Romaji ON và Romaji OFF.
- [x] **Bước 5**: Cập nhật `manifest.json` và `package.json` lên phiên bản `3.6.0`, khai báo icons đầy đủ.
- [x] **Bước 6**: Xây dựng bộ test toàn diện `tests/release.test.cjs` và cập nhật `scripts/check.cjs`.
- [x] **Bước 7**: Chạy kiểm thử tự động, xác nhận 100% test pass.
- [x] **Bước 8**: Cập nhật tài liệu `README.md` và `VALIDATION.md`.

---

## 3. TIÊU CHUẨN NGHIỆM THU (ACCEPTANCE CRITERIA)

1. **Khả năng tương thích Romaji-OFF**:
   - Khi Romaji OFF: Extension nắn phím chính xác 100%.
   - **Giao diện ngón tay và phím gõ ảo vẫn sáng đèn follow theo đúng phím tiếp theo**.
2. **Khả năng tương thích Romaji-ON**:
   - Khi Romaji bật bình thường, extension ưu tiên đọc DOM mượt mà, không phụ thuộc engine.
3. **Độ an toàn sự kiện**:
   - 100% sự kiện gửi cho game là sự kiện thật (`isTrusted === true`).
   - Không bị nhầm lẫn phím khi gõ nhanh (Rollover).
   - Không bị mất ký tự khi vô tình nhấn phím Shift hoặc CapsLock.
4. **Chống phạt điểm**:
   - Tùy chọn `blockRepeat` chặn đứng việc giữ phím gây quá tốc độ dẫn đến điểm `-1`.
5. **Gói cài đặt chuẩn hóa**:
   - Đầy đủ Icons, không có cảnh báo quyền trong trang quản lý extension của Chrome/Edge.
