# Kế hoạch e-typing KeyMapper

## Phạm vi

Lập kế hoạch từ bảy file mẫu do người dùng cung cấp. Chưa triển khai extension mới và chưa kiểm thử tương thích trực tiếp với game trong trình duyệt. Phạm vi đầu tiên: Chrome/Edge dùng Manifest V3, bài Romaji trên e-typing; tiếng Anh và Kana là các đợt mở rộng sau khi xác minh riêng.

## Yêu cầu cốt lõi

- Trong bài đang hoạt động, mỗi lượt nhấn phím gõ hợp lệ được đổi thành đúng một ký tự mà bài đang chờ, kể cả khi phím vật lý bị bấm sai.
- Xử lý ngay trong đường đi của sự kiện bàn phím gốc; giữ thời điểm và thứ tự bấm. Không tự gõ, không hẹn giờ phát ký tự, không gom hàng đợi để phát bù, không tự hoàn thành phần còn lại.
- Khi người dùng ngừng gõ, bài không tiến thêm. Extension không đặt trước WPM/KPM và không chỉnh trực tiếp điểm hay thời gian của trang.
- Phím điều khiển và tổ hợp phím được xử lý riêng. Chỉ chuyển phím tạo ký tự khi đã xác nhận đúng vùng bài tập, có focus và biết ký tự kế tiếp.
- Mục tiêu là đầu ra đúng hoàn toàn trong các trạng thái và loại bài được hỗ trợ; khả năng tương thích của kỹ thuật sửa KeyboardEvent phải được kiểm chứng trước khi cam kết.

## Những điểm đã xác minh trong mã mẫu

1. `manifest.json` đã khai báo MAIN world ở `document_start` cho `injected.js`, ISOLATED world cho `content.js`, và hỗ trợ các frame khớp URL.
2. `injected.js` đọc các span chưa có lớp `entered` trong `#sentenceText`, rồi dùng `Object.defineProperty` thay dữ liệu trên sự kiện hiện có. Đây là hướng cần thử nghiệm tiếp để giữ nhịp gõ.
3. Chú thích nói chỉ nhận sự kiện thật, nhưng hàm xử lý chưa kiểm tra `event.isTrusted`.
4. Một biến `lastMappedChar` dùng chung cho mọi phím có thể làm sai cặp keydown/keyup khi người dùng gõ chồng phím. Sau ký tự cuối câu, việc đọc trạng thái mới trước khi xử lý keyup cũng có thể làm cặp sự kiện không nhất quán.
5. Chưa loại trừ rõ Shift đứng riêng, Backspace, Enter, phím điều hướng, IME và ô nhập liệu thông thường. Chính sách giữ phím chưa tách thành lựa chọn.
6. `background.js` có mã dùng `chrome.debugger`, nhưng manifest không đăng ký service worker hay quyền debugger. Theo cấu hình đã gửi, file này không được tải như background worker. Luồng chính hiện tại cũng không gọi nó.
7. `mode: 'hybrid'` có trong cấu hình nhưng không quyết định hành vi. Tùy chọn Accuracy dưới 100% cố tình tạo sai, trái với yêu cầu đầu ra luôn đúng.
8. HUD dựng lại bằng `innerHTML` mỗi 200 ms. Dữ liệu phím vật lý gửi lên HUD được đọc sau khi sửa `e.code`, nên không còn phản ánh đúng phím ban đầu trong trường hợp đã sửa thành công.
9. MAIN world mặc định bật trước khi nhận cấu hình đã lưu; thiếu bắt tay xác nhận cấu hình. Cầu `postMessage` chưa kiểm tra chặt nguồn và cấu trúc dữ liệu.

## Kiến trúc đề xuất

### manifest.json

Giữ Manifest V3 và mô hình MAIN/ISOLATED. Giới hạn URL vào trang và frame bài tập đã kiểm chứng. Quyền lưu trữ đủ cho bản lõi; không thêm debugger cho đường xử lý chính.

### injected.js — xử lý bàn phím

- Cài listener sớm nhưng chỉ kích hoạt sau khi nhận cấu hình hợp lệ.
- Kiểm tra sự kiện thật, trạng thái bài, focus, tổ hợp phím và IME trước khi ánh xạ.
- Chụp dữ liệu phím vật lý trước khi thay thuộc tính sự kiện.
- Khi keydown: đọc ký tự đích hiện tại, chọn ánh xạ và lưu theo danh tính phím gốc (`code` và `location`, có quy tắc riêng khi lặp).
- Khi keypress/keyup: dùng ánh xạ đã lưu của lượt nhấn tương ứng; không đọc ký tự mới để quyết định lại. Chỉ dựa vào keypress nếu game thực tế cần sự kiện này.
- Không tự tăng con trỏ đáp án dựa trên số phím. Đối chiếu trạng thái trang để tránh trôi vị trí khi chuyển câu hoặc khi game chưa chấp nhận phím.
- Kiểm tra ánh xạ dấu câu và cách biểu diễn phím theo bài/layout thực tế; không tái sử dụng bảng mã hiện tại mà chưa đối chiếu.
- Giữ Escape, Tab và tổ hợp Ctrl/Alt/Meta cho chức năng vốn có. Shift đứng riêng không làm tiến bài. Space/Enter chỉ là phím bắt đầu khi trang ở màn hình tương ứng; trong bài, chỉ ánh xạ theo chính sách đã xác định.
- Mặc định bỏ lượt keydown có `repeat` để một lần nhấn vật lý không thành nhiều ký tự. Có tùy chọn tương thích cho phép giữ phím; khi bật, dùng đúng nhịp lặp do hệ điều hành gửi, không tạo nhịp mới.
- Khi mất focus, đổi bài, điều hướng hoặc tắt: dọn trạng thái phím, đồng thời bảo đảm các sự kiện kết thúc lượt nhấn được xử lý nhất quán. Khi không đọc được đích: ngừng sửa phím và báo trạng thái, không đoán ký tự.

### Bộ đọc trạng thái e-typing

Tách trách nhiệm khỏi ánh xạ bàn phím, có thể đặt trong file `etyping-adapter.js` chạy cùng MAIN world.

- Nhận biết các trạng thái: chưa nhận diện, sẵn sàng, đếm ngược, đang gõ, chuyển câu, kết quả.
- Theo dõi DOM bằng MutationObserver ở phạm vi hẹp, phát hiện node bị thay và gắn lại observer.
- Tại thời điểm keydown, xác nhận ký tự đích từ DOM hiện tại để không chỉ phụ thuộc vào cache cập nhật bất đồng bộ.
- Nhận diện frame chứa bài thật; không chọn frame chỉ dựa trên chuỗi `/app/` trong URL.
- Đọc Romaji mà game đang hiển thị/chấp nhận; không tự phiên âm Hiragana bằng bảng riêng.

### content.js — cấu hình và HUD

- Đọc/ghi `chrome.storage.local`, bắt tay với MAIN world và phản hồi thay đổi cấu hình.
- Kiểm tra `event.source`, loại thông điệp, phiên bản giao thức và kiểu dữ liệu; chỉ truyền các trường được phép. Đây là kiểm tra tính hợp lệ, không biến MAIN world thành vùng tin cậy trước trang.
- HUD hiển thị bật/tắt, trạng thái bài, phím vừa bấm, ký tự sau chuyển và lý do tạm dừng.
- Dùng Shadow DOM để giảm xung đột CSS; điền văn bản bằng `textContent`.
- Cập nhật HUD theo thay đổi có ý nghĩa và gộp cập nhật giao diện; không đưa việc vẽ HUD vào đường xử lý phím. Khi ẩn HUD thì ngừng dựng giao diện.

### popup.html / popup.js / popup.css

- Giao diện tiếng Việt, công tắc chính, tùy chọn giữ phím, HUD, phím tắt và thống kê phiên.
- Bỏ thanh Accuracy khỏi bản lõi để thống nhất với yêu cầu luôn đúng.
- Phân biệt công tắc được bật với trạng thái đang thực sự xử lý được bài; hiển thị trường hợp chưa nhận diện frame hoặc cần tải lại trang.
- Mặc định lưu tùy chọn chung; trạng thái phiên và số liệu tách theo tab. Có thể thêm bật/tắt riêng từng tab ở đợt sau.

### background.js

Loại khỏi bản lõi nếu không có chức năng cần service worker. Chỉ thêm worker nhỏ khi cần định tuyến trạng thái giữa popup và nhiều tab/frame hoặc dùng API phím tắt của extension; không dùng worker để chuyển tiếp từng lần gõ.

## Tính năng cải tiến theo ưu tiên

| Ưu tiên | Cải tiến | Giá trị |
| --- | --- | --- |
| P0 | Theo dõi riêng từng lượt nhấn, đồng bộ qua chuyển câu | Hạn chế sai/lặp ký tự khi gõ nhanh |
| P0 | Chỉ hoạt động trong bài đang có focus | Tránh tác động lên đăng nhập, tìm kiếm và điều khiển trang |
| P0 | Khởi tạo cấu hình có xác nhận, chẩn đoán trạng thái | Tránh bật sai tùy chọn và dễ tìm lỗi |
| P1 | HUD gọn, kéo vị trí, ghi nhớ vị trí | Dễ theo dõi mà không che đề |
| P1 | Thống kê nhịp bấm thật và tỉ lệ phím cần sửa | Cho biết thao tác thực tế dù đầu ra bài luôn đúng |
| P1 | Phím tắt có thể đổi, bật/tắt riêng tab | Dễ dùng khi mở nhiều bài |
| P2 | Xuất thống kê JSON/CSV, đặt lại cấu hình | Theo dõi phiên và hỗ trợ chẩn đoán |
| P2 | Adapter cho bài tiếng Anh/Kana | Mở rộng sau khi lõi Romaji ổn định |

Thống kê chỉ lưu cục bộ các số tổng hợp cần thiết. Không lưu nguyên nội dung người dùng gõ. KPM nhấn phím và KPM của game là hai chỉ số khác nhau; cần ghi rõ cách tính thay vì hứa chúng luôn bằng nhau.

## Lộ trình và điều kiện hoàn thành

1. **Kiểm chứng kỹ thuật:** cài bản tối thiểu trong Chrome/Edge, quan sát event mà game thực tế đọc, DOM và frame. Xác minh việc sửa thuộc tính có được game tiếp nhận. Nếu thất bại, ghi rõ nguyên nhân và điều chỉnh thiết kế trước khi xây UI.
2. **Lõi ánh xạ:** triển khai adapter, điều kiện kích hoạt, trạng thái từng phím, dấu câu và chính sách repeat. Hoàn thành khi gõ ngẫu nhiên phím vẫn tiến đúng từng ký tự trong loại bài đã hỗ trợ.
3. **Cấu hình và giao diện:** hoàn thiện bắt tay, popup, HUD và phím tắt. Hoàn thành khi tùy chọn nhất quán sau tải lại và không tác động ngoài vùng bài.
4. **Kiểm thử và đóng gói:** chạy kiểm thử logic có ý nghĩa và kiểm thử thật trong trình duyệt; phát hành thư mục Load unpacked, ZIP, hướng dẫn cài và danh sách loại bài/trình duyệt đã xác nhận.

## Kiểm thử nghiệm thu

- Không nhấn phím trong 10 giây ở trạng thái đang gõ: không có ký tự nào được extension gửi thêm.
- Nhấn N lượt phím hợp lệ trong cùng một đoạn bài sẵn sàng nhận: không tạo quá N ký tự; không phát bù sau khoảng nghỉ.
- Bấm sai liên tục, gõ nhanh và gõ chồng A/B/C: bài nhận đúng chuỗi đích, keyup không lấy ánh xạ của phím khác.
- Kiểm tra chữ, số, dấu câu, cuối câu, đầu câu mới, bắt đầu lại và kết thúc bài.
- Giữ phím với cả hai chính sách repeat: kết quả đúng như lựa chọn.
- Shift, Ctrl/Alt/Meta, Escape, Tab, IME, Backspace và phím điều hướng tuân theo chính sách đã công bố.
- Tắt giữa lượt nhấn, blur, đổi tab, tải lại trang và khởi động với cấu hình đã lưu là tắt: không còn ánh xạ cũ hoặc khoảng thời gian tự bật ngoài ý muốn.
- Trang đăng nhập, ô tìm kiếm và frame không chứa bài: không bị remap.
- Đo thời gian xử lý keydown và độ lệch nhịp bằng mốc thời gian cùng ngữ cảnh; không có delay chủ động hay hàng đợi phát phím. Ghi số đo trên máy thử, không tuyên bố độ trễ bằng 0.
- Khi DOM thay đổi không còn nhận diện được: HUD báo đúng và extension dừng sửa phím.

## Tài liệu tham chiếu

- Trang bài Romaji: https://www.e-typing.ne.jp/roma/check/
- Chrome content scripts: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Manifest content scripts, MAIN/ISOLATED và frame: https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts

Trang chính và trang bài đã được tra cứu; luồng game động và độ tương thích của việc sửa sự kiện vẫn cần kiểm thử thực tế ở bước 1.
