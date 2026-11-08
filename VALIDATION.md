# Báo cáo Kiểm chứng Bản phát hành v3.6.0 (Release Candidate)

Ngày kiểm tra: 08/11/2026.

---

## 1. Kết quả Kiểm thử Tự động (Unit Test Suite)

Tệp kiểm thử: `tests/release.test.cjs`
Kết quả: **10/10 kiểm thử vượt qua tuyệt đối (Pass 100%)**.

1. **Manifest V3 & Icons**: Khai báo chuẩn MV3, quyền hạn tối giản chỉ duy nhất `storage`, không yêu cầu debugger, không có worker dư thừa, đầy đủ 4 tệp icon (16, 32, 48, 128px) tồn tại thực tế.
2. **DOM-level Remapping**: Nắn phím vật lý ở pha capture, giữ nguyên tính hợp lệ `isTrusted: true`, `timeStamp` và nhịp gõ của người dùng.
3. **Romaji-OFF Engine Fallback**: Khi bài thi tắt Romaji và DOM trống ký tự Latinh, extension tự động đọc và nắn phím chính xác từ `typingEngine.nextKeyCharCode()`.
4. **Key Rollover Map**: Lưu vết phím theo `event.code`. Khi gõ nhanh nhiều phím nối tiếp, sự kiện `keyup` của từng phím vật lý được gán đúng ký tự ban đầu, loại bỏ hoàn toàn lỗi lệch phím của bản cũ.
5. **Bộ lọc phím chức năng (Ignored Keys)**: Phím `Shift` đơn lẻ, `CapsLock`, `Insert`, `Delete`, `Tab`, `Escape`, và 4 phím mũi tên điều hướng không bị extension tiêu thụ và không làm nhảy ký tự bài thi.
6. **Bảng mã ký tự đặc biệt**: Kiểm chứng chính xác các dấu câu `-`, `!`, `?`, `_`, `(`, `)`, `"`, `@`.
7. **Bảo vệ chống bẫy gian lận (`blockRepeat`)**: Chặn lặp sự kiện `keydown` khi người dùng giữ đè phím, bảo vệ người chơi khỏi ngưỡng phạt `FRAUD_SCORE = 1200` (điểm -1).
8. **Phím tắt `Ctrl + Shift + F8`**: Bật/tắt 2 chiều, lưu vào `chrome.storage.local` và đồng bộ qua `postMessage`.
9. **Chống kích hoạt lặp phím tắt**: Giữ phím `Ctrl + Shift + F8` chỉ đổi trạng thái đúng 1 lần.
10. **Không nhận nhầm phím tắt**: Các tổ hợp thiếu modifier hoặc phím cũ (`F8`, `Alt + S`) bị loại bỏ hoàn toàn.

---

## 2. Kiểm tra Toàn vẹn & Cú pháp (`npm run check`)

- Kiểm tra cú pháp tất cả các tệp JavaScript: `injected.js`, `content.js`, `popup.js` bằng lệnh `node --check`. Không có lỗi cú pháp.
- Đóng gói bản phát hành vào `dist/etyping-keymapper` và `dist/etyping-keymapper-3.6.0.zip`.
- SHA256 checksum được tạo tự động và ghi kèm tệp `.sha256`.

---

## 3. Khả năng tương thích môi trường

- Trình duyệt hỗ trợ: Google Chrome (bản 102+), Microsoft Edge, Brave, Cốc Cốc, Opera.
- Hệ điều hành: Windows, macOS, Linux.
- Chế độ bài thi: Hỗ trợ cả **Romaji ON** và **Romaji OFF**.
