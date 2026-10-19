# YOURDREAM — Tờ đề trước, mở phần làm bài khi chọn

Trạng thái: mã đã sửa và kiểm tra kỹ thuật; chưa deploy bản giao diện này lên staging.

## Hành vi

- Mở từ menu Đề giữa kỳ: chỉ hiện tờ đề, khu vực làm bài bị ẩn trên cả desktop và mobile.
- Chọn một Ý: mở đúng giấy làm bài. Desktop giữ tờ đề bên trái; mobile chuyển sang giấy làm bài.
- Hướng dẫn, sơ đồ, lời giải và các phần chẩn đoán ẩn hoàn toàn cho đến khi bấm nút tương ứng; mỗi lần chỉ mở một phần hỗ trợ.
- Quay lại tờ đề: ẩn khu vực làm bài và hỗ trợ, giữ nguyên bản nháp/câu trả lời.
- URL có graph/part/step hợp lệ vẫn khôi phục đúng vị trí khi tải lại; mở mới từ menu luôn ưu tiên tờ đề.
- Thi thử chưa nộp tiếp tục khóa toàn bộ hỗ trợ. Đây vẫn là giới hạn phía client.

## Xác minh

- 42/42 Node tests PASS, gồm hai luồng mô phỏng DOM mới ở kích thước 1280/375.
- Build PASS và staging dry-run PASS (chưa upload/deploy).
- Đối chiếu nguồn trước sửa với GitHub HEAD `0dad6b12470b43b50e6edecdba53bb18a0efa944` và Drive: 5/5 khớp sau chuẩn hóa CRLF/LF.
- Gói áp dụng: xác minh SHA-256, sao lưu trước khi thay thế, từ chối khi có thay đổi cục bộ khác; đã thử áp dụng và thử từ chối trên bản sao tạm.
- Không chạy browser QA trong môi trường này vì không có control-browser. Runner Chrome staging đã bổ sung kiểm tra giao diện mới tại 1280/375, chờ chạy trên máy Windows.
- Cloudflare CLI trong môi trường này chưa được xác thực. Bản staging được nghiệm thu trước đó (Worker version `43546fbc-9d36-422a-a4cd-dfa7fb8d650a`) chưa được thay thế bởi cập nhật này.
- Không sửa engine, adapters, JSON học liệu, dữ liệu journal hay cấu hình production.

## Hoàn tất trên máy Windows đã đăng nhập Cloudflare

Tải `YOURDREAM_PAPER_FIRST.zip`, giải nén toàn bộ, mở PowerShell trong thư mục vừa giải nén:

```powershell
node .\complete-paper-first-staging.cjs "D:\YOURDREAM.VN\webapp-midterm1"
```

Gói kiểm tra nguồn, sao lưu và cập nhật đúng 5 tệp; sau đó chạy tests, build, deploy staging và Chrome browser runner. Kết quả ở `qa/paper-first-staging/completion-results.json`; các log và ảnh minh chứng cùng thư mục. Nếu có sửa đổi cục bộ ngoài bản đã đối chiếu, gói dừng trước khi ghi tệp. Không tự merge Git hay deploy production.

Nghiệm thu P0 trước đây chỉ áp dụng cho bản staging cũ. Cập nhật giao diện này chờ deploy, browser QA và người dùng kiểm nghiệm.
