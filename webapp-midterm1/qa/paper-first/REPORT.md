# YOURDREAM — Tờ đề trước, mở phần làm bài khi chọn

Trạng thái: đã deploy staging và 10/10 kiểm tra trình duyệt PASS theo log người dùng; chờ nghiệm thu cập nhật giao diện.

## Hành vi

- Mở từ menu Đề giữa kỳ: chỉ hiện tờ đề; khu vực làm bài ẩn ở cả desktop và mobile.
- Chọn một Ý: mở đúng giấy làm bài. Desktop giữ tờ đề bên trái; mobile chuyển sang giấy làm bài.
- Hướng dẫn, sơ đồ, lời giải và các phần chẩn đoán ẩn cho đến khi bấm nút tương ứng; mỗi lần mở một phần hỗ trợ.
- Quay lại tờ đề: ẩn giấy làm bài và hỗ trợ, giữ bản nháp/câu trả lời.
- URL có graph/part/step hợp lệ vẫn khôi phục vị trí khi tải lại; mở mới từ menu luôn ưu tiên tờ đề.
- Thi thử chưa nộp tiếp tục khóa hỗ trợ. Đây vẫn là giới hạn phía client.

## Xác minh kỹ thuật

- 42/42 Node tests PASS, gồm hai luồng mô phỏng DOM ở 1280/375.
- Build PASS, staging dry-run PASS.
- Nguồn trước sửa đối chiếu GitHub HEAD `0dad6b12470b43b50e6edecdba53bb18a0efa944` và Drive: 5/5 khớp sau chuẩn hóa CRLF/LF.
- Gói áp dụng kiểm tra SHA-256, sao lưu tệp trước khi thay thế và từ chối thay đổi cục bộ khác; đã thử áp dụng và thử từ chối trên bản sao tạm.
- Không sửa engine, adapters, JSON học liệu, journal hoặc cấu hình production.

## Biên nhận staging — 2026-10-19

Người dùng đã gửi log sau khi chạy lại riêng `npm run deploy:staging` để khôi phục lỗi kết nối ban đầu, rồi chạy Chrome runner `tests/verify-navigation-browser.cjs`.

- Worker: `yourdream-webapp-staging`.
- URL: https://yourdream-webapp-staging.tothanhnam.workers.dev
- Worker version: `de59aa04-0c18-450a-ac80-5999fc58dde9`.
- Nguồn dự kiến: `ebf7b58da2cf9c14ded8fd510e9b45002000209d`; liên kết commit với bản deploy chưa kiểm chứng độc lập.
- Chrome: A/B/C/D/E đều PASS ở 1280 và 375 px, tổng 10/10. D xác nhận các mục STEM/nhật ký chưa triển khai không có liên kết hoạt động.
- Nguồn bằng chứng: log người dùng, lưu tại `staging-operator.log`; không chạy lại độc lập trong môi trường này, chưa đọc `browser-results.json` gốc.
- Biên nhận: `STAGING_DEPLOYMENT_RECEIPT_20261019.json`.

Lần chạy script tổng hợp đầu tiên dừng ở lỗi mạng; log deploy lại và browser runner xác nhận bước khôi phục thành công. `completion-results.json` do script tổng hợp tạo trên máy có thể vẫn ghi lần chạy cũ; checkpoint và biên nhận này ghi nhận lần khôi phục thủ công.

Cập nhật hồ sơ này không thay đổi runtime, không cần deploy lại. Nghiệm thu P0 cũ không tự áp dụng cho giao diện mới; chờ Namto kiểm nghiệm và duyệt.
