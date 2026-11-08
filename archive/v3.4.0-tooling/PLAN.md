# Kế hoạch hiện hành: giữ nguyên mẫu, chỉ bổ sung

## Ràng buộc

Giữ bảy file runtime và cấu trúc manifest như extension người dùng cung cấp. Giữ giao diện popup, Accuracy 80–100%, công tắc enabled/showHud, hai phím tắt Alt + S/F8, nhịp gõ từ bàn phím và hành vi giữ phím. Không tiếp tục thiết kế lại UI hoặc thay các tính năng này bằng hành vi của bản v4.

## Bổ sung đã triển khai

1. Trong `injected.js`, quan sát jQuery lúc được gán và context của `jQuery.proxy` để tham chiếu engine e-typing.
2. Chỉ đọc câu, vị trí và ký tự kế tiếp từ engine khi đang gõ. Không phụ thuộc Romaji trong DOM, không bật lại các tùy chọn hiển thị của game, không tự tăng con trỏ.
3. Giữ bộ đọc DOM gốc làm phương án khi chưa quan sát được engine.
4. Trong `content.js`, bổ sung nhận trạng thái engine để các trường HUD cũ tiếp tục có dữ liệu khi Romaji OFF; tự gắn lại HUD bị mất và chỉ hiển thị trong game.
5. Trong popup, giữ toàn bộ điều khiển mẫu và thông tin phím tắt; bỏ nhóm kiểm tra/kết nối lại theo yêu cầu mới. Quyền `scripting` dùng cho phục hồi tự động.
6. Bản 3.2.0 tối ưu HUD thành cây DOM ổn định, tách polling khỏi từng lượt bấm và theo dõi riêng các phím gõ chồng. Giữ F8/Alt+S, xử lý bật/tắt ngay trong MAIN và chặn lặp phím tắt; thêm Alt+Shift+K qua worker/badge dùng file background.js hiện có.
7. Bản 3.3.0 dùng webNavigation và sự kiện cài đặt/khởi động/kích hoạt tab để tự phục hồi. Hai controller tái khởi tạo an toàn; MAIN bàn giao quyền sở hữu cho ISOLATED mới để dừng timer/listener cũ sau Reload extension. Trang cũ 3.2.0 hoặc mất tham chiếu engine được tự tải lại có giới hạn. Trạng thái OFF chủ động được giữ.
8. Bản 3.4.0 theo dõi mỗi màn hình start_msg trong cùng frame; đối chiếu handler đang đăng ký; bỏ callback của result view đã finalize; ưu tiên claim bridge mới và tô đúng phím mô phỏng độc lập với HUD. Kiểm tra cả もう1回 sau một bài đầy đủ, chơi lại nhanh, nâng cấp 3.3.0 thật.
9. Đóng gói đúng bảy file sau khi game thật, phục hồi và benchmark hiệu năng đều qua cho cùng hash nguồn. Bản nền 3.1.1 nằm trong `archive/v3.1.1-baseline`.

## Kiểm tra

Kiểm thử logic kiểm tra byte của các file giữ nguyên, cấu trúc manifest, đường nhập của mẫu và trường hợp Romaji OFF / guide OFF. Nghiệm thu trình duyệt cần hoàn thành cả hai chế độ ở Accuracy 100%, kiểm tra 0 lỗi và số ký tự/điểm/thời gian hợp lệ; tái hiện frame không có MAIN và HUD rồi xác nhận phục hồi. Xem `VALIDATION.md` để biết bằng chứng và giới hạn môi trường.
