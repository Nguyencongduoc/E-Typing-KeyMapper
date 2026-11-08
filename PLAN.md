# BÁO CÁO KIỂM TOÁN VÀ KẾ HOẠCH HOÀN THIỆN (PLAN.MD)
## DỰ ÁN: E-TYPING KEYMAPPER — BẢN PHÁT HÀNH CHÍNH THỨC (FINAL RELEASE)

---

## 1. TỔNG QUAN HIỆN TRẠNG DỰ ÁN (HIỆN TẠI: V3.5.1)

Dự án hiện tại là một **Chrome/Edge Extension Manifest V3**, hoạt động theo cơ chế **DOM-level KeyboardEvent Remapping**:
- **Cơ chế cốt lõi**: Chặn sự kiện bàn phím vật lý của người dùng ở pha `Capture` trên `window` (`injected.js` chạy ở `MAIN` world), giữ nguyên `event.isTrusted === true`, sau đó sử dụng `Object.defineProperty` để ghi đè các thuộc tính (`key`, `code`, `keyCode`, `which`, `charCode`, `shiftKey`) thành ký tự Romaji kế tiếp mà trang e-typing đang chờ nhận.
- **Ưu điểm lớn nhất**:
  - Không tự động gõ (chỉ kích hoạt khi người dùng gõ phím thật).
  - Không can thiệp sâu vào bộ nhớ hay hook engine nội bộ của e-typing (giảm thiểu rủi ro bị game phát hiện cheat qua prototype monkey-patching).
  - Quyền hạn cực kỳ tối giản trong `manifest.json`: chỉ cần `"storage"` và host permission trên `*.e-typing.ne.jp`. Không yêu cầu `"debugger"` hay `"scripting"`.
- **Hạn chế đã biết**:
  - Chỉ hoạt động khi bài tập ở chế độ **Romaji ON** (ký tự Latinh hiển thị trong DOM `#sentenceText`).
  - Phím tắt bật/tắt hiện tại: `Ctrl + Shift + F8`.

---

## 2. PHÂN TÍCH CÁC TÍNH NĂNG CÒN THIẾU & ĐIỂM CẦN CẢI THIỆN TRƯỚC RELEASE

Qua việc rà soát từng dòng mã nguồn (`injected.js`, `content.js`, `manifest.json`, `popup.*`, `background.js`, `research/app.min.js`), phát hiện các vấn đề kỹ thuật và chức năng sau:

### 2.1. Lỗ hổng xử lý bàn phím (Keyboard Engine Flaws)
1. **Lỗi gõ nhanh chồng phím (Key Rollover / Keydown-Keyup Mismatch)**:
   - Trong `injected.js`, biến `lastMappedChar` là biến đơn lẻ. Khi người dùng gõ ở tốc độ cao (phím 1 nhấn xuống -> phím 2 nhấn xuống -> phím 1 nhả ra -> phím 2 nhả ra), sự kiện `keyup` của phím 1 sẽ bị gán nhầm ký tự của phím 2.
   - **Hậu quả**: Trình duyệt và game ghi nhận chuỗi sự kiện không đồng nhất, có thể gây mất đồng bộ trạng thái phím.
2. **Chưa lọc triệt để các phím không in được (Non-printable Key Filtration)**:
   - Hiện tại chỉ loại trừ `Ctrl`, `Alt`, `Meta`, `F1-F12`, `Escape`, `Tab`.
   - **Chưa loại trừ**:
     - Phím **`Shift` đứng riêng lẻ**: Nếu người dùng vô tình chạm phím `Shift`, extension vẫn remap sự kiện này thành ký tự tiếp theo, làm mất 1 ký tự trong bài thi!
     - Các phím điều hướng và chức năng khác: `CapsLock`, `Insert`, `Delete`, `Home`, `End`, `PageUp`, `PageDown`, `ArrowUp/Down/Left/Right`, `ContextMenu`, `NumLock`.
3. **Bảng ký tự đặc biệt còn thiếu (Punctuation Coverage)**:
   - `SPECIAL_KEYCODES` hiện chỉ hỗ trợ: `-`, `ー`, `,`, `.`, `/`, `;`, `:`, `[`, `]`, `!`, `?`, ` `.
   - **Còn thiếu**: `_` (underscore), `~` (tilde), `(` `)` (parentheses), `"` `'` (quotes), `@`, `*`, `+`, `=`, `%`, `&`, `^`, `#`, `$`, `<`, `>`. Trong các bài thi có đoạn văn tiếng Nhật chứa dấu ngoặc hoặc bài tiếng Anh, các ký tự này sẽ bị fallback tính toán thiếu chính xác (thiếu `shiftKey` hoặc sai `code`).
4. **Rủi ro dính bẫy chống gian lận của e-typing (`FRAUD_SCORE = 1200`)**:
   - Đối chiếu từ `research/app.min.js` (hàm `counterFraudScore`), e-typing có cơ chế: nếu điểm bài thi vượt ngưỡng `FRAUD_SCORE` (mặc định 1200), game sẽ tự động đổi `score = -1`, `levelRank = 0`, `wpm = 0` và hủy kết quả.
   - Khi người dùng **giữ đè 1 phím** (`e.repeat === true`), hệ điều hành gửi phím với tốc độ ~30-50ms/lần. Nếu giữ đè suốt bài, tốc độ gõ cực đại sẽ kích hoạt hàm này khiến kết quả bị loại (`score: -1`).
   - Cần có cơ chế hoặc tùy chọn **Bỏ qua phím lặp (`ignore repeat`)** hoặc **Giới hạn tốc độ an toàn (Cadence Limiter)**.

### 2.2. Giao diện & Trải nghiệm người dùng (UX / UI)
1. **Thiếu hoàn toàn bộ Icon của Extension**:
   - `manifest.json` không khai báo trường `"icons"` hay `"action.default_icon"`. Khi cài đặt trên Chrome/Edge, extension hiển thị icon mảnh ghép puzzle mặc định xám xịt, tạo cảm giác chưa hoàn thiện.
   - Cần bổ sung icon kích thước 16x16, 32x32, 48x48, 128x128.
2. **Hiệu năng của HUD (DOM Reflow & Memory Churn)**:
   - Trong `content.js`, timer `setInterval(renderHUD, 200)` liên tục gọi `hudEl.innerHTML = ...` mỗi 200ms ngay cả khi không có thay đổi hoặc khi bài chưa bắt đầu.
   - Thao tác này gây ép trình duyệt re-parse HTML liên tục và tạo rác bộ nhớ (GC churn). Nên chuyển sang cập nhật có điều kiện (`dirty checking`) hoặc chỉ cập nhật trực tiếp `textContent` của từng ô con.
3. **HUD che khuất các phần tử của game**:
   - HUD đang cố định ở góc dưới phải (`bottom: 10px; right: 10px; position: fixed`). Ở một số độ phân giải màn hình hoặc khi game kết thúc, HUD có thể che mất nút `Replay` hoặc bảng kết quả.
   - Cần hỗ trợ kéo thả vị trí (drag-and-drop) hoặc thu nhỏ/ẩn nhanh.
4. **Chỉ báo trạng thái kết nối trên Popup**:
   - Khi người dùng mở Popup ở một tab không phải e-typing hoặc ở trang ngoài bài thi, popup không có thông báo giúp người dùng nhận biết extension đang sẵn sàng hay chưa.

### 2.3. Vệ sinh mã nguồn & Tối ưu gói cài (Code Hygiene & Packaging)
1. **File rác `background.js` (Dead Code)**:
   - File `background.js` có 137 dòng lệnh chứa code gọi `chrome.debugger`. Tuy nhiên, `manifest.json` không hề đăng ký background service worker.
   - File này hoàn toàn không bao giờ được Chrome thực thi, nhưng nếu đem đóng gói xuất xưởng (release), nó có thể khiến bộ lọc bảo mật của Chrome Web Store hoặc người dùng hoài nghi về quyền debugger.
   - Cần có quyết định: Loại bỏ hoàn toàn khỏi gói cài đặt chính thức hoặc đưa vào thư mục lưu trữ (`archive/`).
2. **Chất lượng hiển thị phím tắt**:
   - `Ctrl + Shift + F8` là phím tắt tốt, không bị trùng phím mặc định của trình duyệt. Tuy nhiên, trên một số laptop compact (60%, 65%), việc bấm F8 đòi hỏi bấm thêm phím `Fn`. Cần có hướng dẫn rõ trong UI hoặc cho phép cấu hình qua `chrome.commands`.

---

## 3. BẢNG SO SÁNH: BẢN HIỆN TẠI (3.5.1) VS BẢN RELEASE HOÀN CHỈNH (3.6.0 FINAL)

| Hạng mục | Bản hiện tại (v3.5.1) | Bản Release Hoàn Chỉnh Đề Xuất (v3.6.0 Final) |
| :--- | :--- | :--- |
| **Icons Extension** | Không có (hiển thị puzzle xám) | Đầy đủ 16x16, 32x32, 48x48, 128x128 sắc nét |
| **Xử lý chồng phím** | 1 biến đơn `lastMappedChar` (dễ lệch) | Quản lý theo Map `activeKeys[e.code]` độc lập |
| **Lọc phím thừa** | Chỉ lọc Ctrl/Alt/Meta, F1-F12, Esc, Tab | Lọc thêm: Shift lẻ, CapsLock, Mũi tên, Insert, Del, Home, End... |
| **Ký tự đặc biệt** | 12 ký tự cơ bản | Đầy đủ: ngoặc đơn, ngoặc kép, gạch dưới, ngã, toán tử... |
| **Bảo vệ Anti-Cheat** | Không có (dễ dính -1 nếu đè phím) | Tùy chọn chống lặp phím khi giữ đè (`block repeat`) |
| **Tối ưu HUD** | `innerHTML` 200ms/lần gây giật | Update theo event / textContent, giảm 90% CPU |
| **Tệp thừa** | Còn `background.js` không dùng | Đóng gói sạch 100%, không chứa dead code |
| **Kiểm thử tự động** | Unit test 14/14, Browser test | Bổ sung test case cho phím Shift đơn, Rollover & Symbols |

---

## 4. KẾ HOẠCH HÀNH ĐỘNG CHI TIẾT ĐỂ CHỐT BẢN RELEASE (ACTION PLAN)

### Giai đoạn 1: Chuẩn hóa lõi xử lý bàn phím (`injected.js`)
- [ ] **Bước 1.1**: Nâng cấp `SPECIAL_KEYCODES` để bao phủ toàn bộ các ký tự ASCII/Japanese punctuation thường gặp trong bài thi (`_`, `~`, `(`, `)`, `"`, `'`, `@`, `+`, `=`, v.v.).
- [ ] **Bước 1.2**: Thay thế biến `lastMappedChar` bằng cấu trúc `Map<string, {char, props}>` theo `event.code`. Khi `keydown`, lưu trạng thái theo mã phím vật lý; khi `keypress`/`keyup`, lấy đúng trạng thái của phím đó để patch.
- [ ] **Bước 1.3**: Bổ sung danh sách chặn phím không in được (`isIgnoredKey`):
  - Chặn `Shift`, `Control`, `Alt`, `Meta` khi bấm đơn lẻ.
  - Chặn các phím điều hướng: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`, `Insert`, `Delete`, `CapsLock`, `NumLock`.
- [ ] **Bước 1.4**: Bổ sung tùy chọn `blockRepeat` (mặc định: bật hoặc tắt có cảnh báo): Bỏ qua các sự kiện `keydown` có `e.repeat === true` để ngăn ngừa việc vô tình giữ đè phím làm tốc độ gõ vượt trần gian lận (`FRAUD_SCORE`), dẫn đến điểm -1.

### Giai đoạn 2: Tối ưu hiệu năng & Giao diện (`content.js`, `popup.*`)
- [ ] **Bước 2.1**: Tối ưu HUD:
  - Cache các node DOM con (`#hud-hiragana`, `#hud-romaji`, `#hud-target`, `#hud-mapped`).
  - Chỉ cập nhật `textContent` khi giá trị thực tế thay đổi (Dirty Checking), loại bỏ hoàn toàn việc gán `innerHTML` theo chu kỳ 200ms.
- [ ] **Bước 2.2**: Thiết kế bộ Icon thương hiệu chuẩn:
  - Tạo bộ icon định dạng PNG kích thước 16x16, 32x32, 48x48, 128x128 đặt trong thư mục `icons/`.
  - Khai báo icon trong `manifest.json` (`action.default_icon` và `icons`).
- [ ] **Bước 2.3**: Thêm tùy chọn an toàn trong `popup.html`:
  - Thêm checkbox: "Chặn lặp phím khi giữ đè (Chống bị hủy điểm)".
  - Hiển thị badge trạng thái nhận diện frame bài thi (Active / Waiting).

### Giai đoạn 3: Vệ sinh cấu trúc & Đóng gói sản phẩm
- [ ] **Bước 3.1**: Loại bỏ hoặc đưa `background.js` vào tài liệu tham khảo nếu không dùng, đảm bảo gói cài đặt Extension chỉ gồm các tệp thực sự hoạt động.
- [ ] **Bước 3.2**: Cập nhật `manifest.json` lên phiên bản phát hành chính thức (ví dụ: `3.6.0` hoặc `4.0.0-stable`).
- [ ] **Bước 3.3**: Cập nhật toàn bộ hệ thống test suite (`tests/` và `scripts/`) để kiểm chứng toàn bộ các trường hợp biên mới.
- [ ] **Bước 3.4**: Thực hiện kiểm thử E2E trên trình duyệt thật (Playwright) với cả 2 chế độ: gõ thông thường và chơi lại (`Replay`).

---

## 5. MA TRẬN KIỂM CHỨNG CHẤP NHẬN BÀN GIAO (ACCEPTANCE CRITERIA)

Một phiên bản được coi là **Hoàn chỉnh nhất để Release** khi đạt đầy đủ các tiêu chí sau:

1. **Tính tương thích game (Zero Fraud Detection)**:
   - Hoàn thành trọn vẹn ít nhất 2 bài thi liên tiếp (bao gồm nút もう1回 / Replay) trên `e-typing.ne.jp`.
   - Kết quả điểm số > 0, WPM hợp lệ, số lỗi (Misses) = 0 (khi để Accuracy 100%), không bao giờ bị game kích hoạt `counterFraudScore` (điểm -1).
2. **Độ an toàn sự kiện bàn phím (Event Integrity)**:
   - 100% sự kiện bàn phím gửi đến game giữ nguyên `event.isTrusted === true`.
   - Không bị lệch phím khi gõ nhanh (Rollover test đạt 100%).
   - Bấm các phím `Shift`, `CapsLock`, mũi tên không làm tiêu tốn ký tự bài thi.
3. **Hiệu năng & Tài nguyên (Resource Efficiency)**:
   - Extension không gây giật lag (frame drop) trên trang e-typing.
   - HUD tiêu thụ CPU xấp xỉ 0% khi người dùng không gõ phím.
4. **Tính đóng gói & Phân phối (Distribution Readiness)**:
   - File nén `.zip` giải nén ra cài đặt ngay qua "Load unpacked" trên Chrome, Edge, Brave, Cốc Cốc mà không xuất hiện bất kỳ cảnh báo đỏ nào trong trang `chrome://extensions`.
   - Có đầy đủ Icon hiển thị trên thanh công cụ trình duyệt.
   - Kèm tệp `README.md` hướng dẫn sử dụng và phím tắt rõ ràng cho người dùng cuối.
