# Kiểm chứng bản 3.5.1 — đổi phím tắt theo yêu cầu

Ngày kiểm tra: 30/10/2026.

## Khớp mẫu

injected.js, background.js, popup.js và popup.css khớp từng byte với mẫu. content.js chỉ đổi listener phím tắt; popup.html chỉ đổi dòng hướng dẫn thành Ctrl + Shift + F8. Manifest giữ nguyên cấu hình/quyền và chỉ tăng phiên bản. Không đăng ký background worker, phím toàn hệ thống hoặc engine hook.

14 kiểm thử logic qua; 9 nhóm kiểm thử trình duyệt thật qua. Hash bảy file: 33e2706f04d7fa306ea93bf8836b3fd7ef6447360209f3b2982260ee59f16ba4.

## Hai lượt trên website thật

| Lượt | Ký tự | Lỗi | Điểm |
| --- | ---: | ---: | ---: |
| 1 | 386 | 0 | 626 |
| 2 | 380 | 0 | 662 |

Lượt 2 bấm もう1回 trong cùng iframe, không mở popup hoặc nạp lại extension. Romaji ON và guide ON như điều kiện của mẫu. Nhịp bấm của test là 85 ms; extension không thêm delay. Đã kiểm tra Ctrl+Shift+F8 bật/tắt và lưu trạng thái, giữ phím không bật/tắt liên tục, F8/Alt+S và tổ hợp thiếu modifier không bật/tắt, tổ hợp mới không tiêu thụ ký tự bài tập, popup ba điều khiển gốc, sự kiện isTrusted giữ nguyên và nghỉ không tự gõ. Bảng kết quả được quan sát 650 ms trước khi Replay, phù hợp thời gian game cài phím tắt kết quả. Không khẳng định đã sửa lỗi Replay dưới khoảng chờ này của website.

Môi trường: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0. Hồ sơ Edge headless riêng, quảng cáo bên thứ ba được chặn. Không điều khiển Chrome cá nhân hoặc gửi điểm vào bảng xếp hạng. Không ghi nhận lỗi extension/game trong luồng đã kiểm thử.

## Ảnh điểm -1 / 0

Mã JavaScript game tải trực tiếp trong lần kiểm thử: [https://www.e-typing.ne.jp/app/jsa_std/js/app.min.js?_=2026010501](https://www.e-typing.ne.jp/app/jsa_std/js/app.min.js?_=2026010501). SHA-256: 8b5735bcbf615bb5548213598d2f2fe062c5240b77382e487f617c26c275d96c. Trong counterFraudScore, điểm vượt FRAUD_SCORE (cấu hình mặc định đọc được: 1200) làm game chuyển điểm thành -1 và đưa thời gian/số ký tự/các chỉ số về 0. Đây là dấu hiệu game loại kết quả, không tự nó chứng minh extension mất kết nối. Việc khôi phục mẫu không thay đổi quy tắc này và không bảo đảm mọi tốc độ đều được game tính điểm.

## Phạm vi

Romaji OFF không được hỗ trợ trong mẫu: khi đáp án không nằm trong DOM, mẫu không đoán hoặc đọc engine. Các báo cáo trước phiên bản hiện tại là lịch sử. Tổ hợp Ctrl+Shift+F8 không nằm trong danh sách mặc định Windows/Chrome đã đối chiếu; phần mềm hoặc cấu hình phím tắt riêng vẫn có thể dùng trùng.

Sau khi đổi bản, Reload extension và tải lại toàn bộ trang e-typing một lần để bỏ script cũ. Các lượt chơi tiếp theo dùng như mẫu gốc.

Bằng chứng hiện hành: .browser-test/sample-report.json, sample-result-0.png, sample-result-1.png, sample-popup.png, sample-hud-keyboard.png.
