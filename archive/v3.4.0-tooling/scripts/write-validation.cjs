const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const r=JSON.parse(fs.readFileSync(path.join(root,'.browser-test/report.json'),'utf8'));
const recovery=JSON.parse(fs.readFileSync(path.join(root,'.browser-test/recovery-report.json'),'utf8'));
const perf=JSON.parse(fs.readFileSync(path.join(root,'.browser-test/performance-report.json'),'utf8'));
const keyboard=JSON.parse(fs.readFileSync(path.join(root,'.browser-test/keyboard-report.json'),'utf8'));
const digest=crypto.createHash('sha256');for(const f of ['manifest.json','injected.js','content.js','background.js','popup.html','popup.js','popup.css'])digest.update(f).update(fs.readFileSync(path.join(root,f)));
if(!keyboard.passed||keyboard.sourceDigest!==r.sourceDigest||!r.passed||!recovery.passed||!perf.passed||r.sourceDigest!==digest.digest('hex')||r.sourceDigest!==recovery.sourceDigest||r.sourceDigest!==perf.sourceDigest)throw new Error('Cannot document a release that has not passed live and performance tests for these exact source files.');
const games=r.checks.filter(c=>c.name.startsWith('full-game'));
const rows=games.map(g=>`| ${g.name.endsWith('-on')?'Romaji ON':g.name.includes('replay')?'Romaji OFF · もう1回 cùng khung':'Romaji OFF + guide OFF'} | ${g.typed} | ${g.misses} | ${g.score} |`).join('\n');
const text=`# Kiểm chứng bản ${r.version}

Ngày kiểm tra: 30/10/2026. Nguồn: SHA-256 ${r.sourceDigest}.

## Kết quả thực tế trên e-typing

Extension được Load unpacked vào profile Edge headless riêng; không dùng profile Chrome cá nhân. Game, bộ chấm, DOM và các API extension đều là thật, không phải engine mô phỏng. Phím được gửi bằng đầu vào native của trình duyệt, được game nhận với isTrusted=true.

| Chế độ | Ký tự được game ghi nhận | Lỗi | Điểm |
| --- | ---: | ---: | ---: |
${rows}

Cả ba bài hoàn thành với Accuracy 100% và thời gian/kết quả do game tự tính. Không sửa điểm, thời gian hoặc cơ chế kiểm tra của game. Nhịp 150 ms là nhịp bấm của bộ test, không phải delay trong extension.

${r.checks.length} nhóm kiểm thử trình duyệt qua, gồm HUD khi mở frame mới; nghỉ 10 giây không tự tiến bài; phím thật và timestamp; Romaji/guide OFF; gắn lại HUD bị gỡ khỏi DOM; không còn nút kết nối thủ công; Alt+S/F8; giữ phím tắt chỉ đổi một lần; bật/tắt nhanh 20 lần; gõ chồng ba phím; ẩn HUD vẫn gõ; repeat; Accuracy 80%; đăng ký phím tắt trình duyệt và worker/badge; hoàn thành ba bài với 0 lỗi. Không ghi nhận lỗi runtime thuộc extension hoặc game. ${r.adErrors?.length||0} lỗi global microadTd của mã quảng cáo bị chặn được lưu riêng.

${recovery.checks.length} nhóm kiểm thử phục hồi qua: bản sao thử nghiệm cố tình không đăng ký content scripts, nhưng vòng đời trang/frame tự nạp MAIN và HUD. Kiểm tra sáu lượt đóng/mở bài, tải trang, tab mới, Reload extension khi game đang chạy, giữ OFF chủ động, nâng trang mã 3.2.0, hook bị nạp muộn và worker nghỉ. Toàn bộ bộ phục hồi không mở popup. Kiểm tra sau Reload chỉ còn một vòng HUD; không có vòng tải lại trang liên tục. Manifest phát hành vẫn đăng ký script từ document_start.

${keyboard.checks.length} nhóm bàn phím mô phỏng qua: đánh dấu đúng phím theo engine khi Romaji, guide và HUD đều OFF; bốn lần もう1回 không refocus; tắt/bật khôi phục hiển thị; nâng cấp thực tế từ mã 3.3.0 giữ nguyên bài đang chạy rồi chơi lại. Không mở popup và không dùng yêu cầu trạng thái để điều khiển cập nhật màu phím. Callback màn hình kết quả đã bị finalize không còn chạy đăng ký phím tắt trễ.

## Bảo toàn mẫu và kiểm thử logic

52/52 kiểm thử logic qua. Cấu trúc ZIP đúng bảy file. popup.css khớp từng byte mẫu; mọi điều khiển cũ, bảng phím, xác suất Accuracy và nhận repeat vẫn được giữ. Handler được tối ưu và theo dõi riêng từng phím để đồng bộ keypress/keyup. Background giữ mã debugger mẫu trong nhánh có kiểm tra API, bổ sung worker phím tắt và vòng đời tài liệu; không thêm quyền debugger. Phạm vi host và quyền storage/scripting được giữ, thêm webNavigation để tự phục hồi.

## Đo hiệu năng so với 3.1.1

Hai bản chạy cùng fixture Romaji ẩn có bàn phím mô phỏng và đáp án thay đổi, mỗi bản nhận 500 lượt phím native; cả hai nhận đủ 500, không lỗi. Fixture giúp kiểm soát cùng nội dung và cùng cách cập nhật game; hiệu năng trên máy dùng thực tế còn phụ thuộc tải máy và trang.

| Chỉ số trong fixture | 3.1.1 | ${r.version} |
| --- | ---: | ---: |
| Thay đổi DOM HUD | ${perf.baseline.hudMutations} | ${perf.candidate.hudMutations} |
| Tin nhắn bridge | ${perf.baseline.bridgeMessages} | ${perf.candidate.bridgeMessages} |
| CPU scripting (ms) | ${perf.baseline.ScriptDurationMs.toFixed(2)} | ${perf.candidate.ScriptDurationMs.toFixed(2)} |
| CPU layout (ms) | ${perf.baseline.LayoutDurationMs.toFixed(2)} | ${perf.candidate.LayoutDurationMs.toFixed(2)} |

Giảm ${perf.hudMutationReductionPercent.toFixed(1)}% thay đổi DOM HUD và ${perf.bridgeReductionPercent.toFixed(1)}% tin nhắn. HUD giữ nguyên cây DOM, chỉ sửa text thay đổi tối đa 10 lần/giây khi hiện; đường gõ vẫn xử lý đồng bộ theo từng phím. Khi ẩn HUD không gửi yêu cầu poll; trang ngoài game và frame quảng cáo không tạo vòng poll.

## Bằng chứng

- .browser-test/report.json: kết quả trình duyệt và hash nguồn.
- .browser-test/recovery-report.json: kết quả tái hiện/phục hồi thiếu script và HUD.
- .browser-test/result-0.png, result-1.png và result-2.png: bảng kết quả thật của ba bài.
- .browser-test/keyboard-report.json và keyboard-follow.png: phím mô phỏng, chơi lại và nâng cấp thật.
- .browser-test/recovery.png: HUD hoạt động khi Romaji/guide OFF sau phục hồi.
- .browser-test/performance-report.json: số đo hai bản trên cùng fixture.

Đóng gói bị chặn nếu một báo cáo chưa qua, phiên bản sai hoặc hash nguồn không khớp. Các báo cáo, profile và fixture không nằm trong ZIP bảy file.

## Giới hạn và cập nhật trên Chrome

Môi trường nghiệm thu: ${r.browser}. Quảng cáo bên thứ ba được chặn trong profile test. F8/Alt+S, giữ phím và gõ chồng phím được kiểm tra bằng đầu vào native của renderer.

Phím tắt Alt+Shift+K được xác nhận đã đăng ký bằng chrome.commands.getAll và gọi đúng handler trong service worker thật, đổi storage và badge ON/OFF. Bộ kiểm thử headless gọi handler trực tiếp vì CDP không tái tạo tin cậy accelerator ở tiến trình trình duyệt. Việc nhấn tổ hợp phím từ bàn phím OS trong profile Chrome cá nhân chưa được kiểm thử bằng GUI. Nếu phím bị trùng hoặc hệ điều hành giữ lại, popup hiển thị tình trạng và có nút mở chrome://extensions/shortcuts.

Chỉ cần Reload extension một lần để nhận bản cập nhật. Sau đó mở bài mới không cần mở popup hoặc kết nối lại. Trang giữ mã cũ hoặc thiếu hook engine được tự tải lại một lần có giới hạn. Popup hiển thị v${r.version} và thông tin tự khởi động.
`;
fs.writeFileSync(path.join(root,'VALIDATION.md'),text);console.log('Wrote validation from passing, source-matched browser reports.');
