# YOURDREAM — WEBAPP MIDTERM1 PHASE C · LIVE STAGING & BATCH 02A INTEGRATION QA REPORT

- **Checkpoint:** `v0.31 DRAFT` (tiếp nối trực tiếp từ `v0.30 DRAFT` / commit `157a7698ae6b66dd755476fd170a07027979f9da`)
- **Workspace:** `D:\YOURDREAM.VN\webapp-midterm1`
- **Git Branch:** `feat/webapp-midterm1-phase-a` (không tự merge vào `main`)
- **Live Cloudflare Staging URL (`workers.dev`):**
  - **Đề luyện tập Toán 9 Giữa kỳ I Hà Nội — Batch 02A (5 bài · 24 bước):** `https://yourdream-webapp-staging.tothanhnam.workers.dev/graph02-preview.html`
  - **Bộ luyện Căn thức (Production-compatible preview):** `https://yourdream-webapp-staging.tothanhnam.workers.dev/radicals.html`
  - **Bản đồ Toán vào 10 Hà Nội (Trang chủ):** `https://yourdream-webapp-staging.tothanhnam.workers.dev/`
- **Cloudflare Worker Version ID:** `d859ddb8-b8b6-45ef-b1f4-5b8955f45a6b`

---

## 1. Xác nhận Xác thực Cloudflare (`wrangler whoami`) & Bảo toàn Production (Yêu cầu 1)

- **Kết quả `npx wrangler whoami`:**
  - Tài khoản: `tothanhnam@gmail.com` (`Account ID: 88431d45cbbb0dea1c329bb28fa525e3`).
  - Quyền OAuth Token: `workers (write)`, `d1 (write)`, `pages (write)`, `workers_routes (write)`, `workers_scripts (write)`.
- **Bảo toàn tuyệt đối Production:**
  - Giữ nguyên Worker/Pages `bandohoctap`, domain `yourdream.vn` và `bandohoctap.yourdream.vn`.
  - Không sửa DNS, không ghi đè dữ liệu production, không phê duyệt `RELEASE`.

---

## 2. Tích hợp Gói Đề Luyện tập Toán 9 Giữa kỳ I Hà Nội — Batch 02A (5 bài · 24 bước) (Yêu cầu 2)

1. **Nguồn dữ liệu Batch 02A đã đối chiếu mã băm SHA256:**
   - Tệp gốc trên Google Drive: `G:\Drive của tôi\YD_G09_MIDTERM1_HANOI_PRACTICE_EXAM_01_v0_1_DRAFT.json`
   - Tệp tích hợp trong Webapp: `public/data/midterm1-hanoi-exam01-preview.json`
   - Dung lượng: `117,176` bytes
   - Mã băm SHA256: `25a9c543df43f8912176294ad4651390e8b4040aa89c281aeed2fa0a56291b99` (khớp 100% với `YD_G09_MIDTERM1_BATCH02A_CHECKPOINT_v0_1_DRAFT.json` và `YD_G09_MIDTERM1_BATCH02A_MANIFEST_v0_1_DRAFT.json`).
2. **Cấu trúc học liệu Batch 02A (`YD-G09-MIDTERM1-HANOI-PRACTICE-EXAM-01`):**
   - **5 bài toán (`5 + 6 + 5 + 5 + 3 = 24` bước giải, thang điểm 10,0):**
     - **Bài I (2,0 điểm · 5 bước):** Giải hệ phương trình bậc nhất hai ẩn (phương pháp thế & cộng đại số).
     - **Bài II (2,0 điểm · 6 bước):** Phương trình tích, phương trình chứa ẩn ở mẫu & bất phương trình bậc nhất một ẩn.
     - **Bài III (2,0 điểm · 5 bước):** Giải bài toán thực tế bằng cách lập hệ phương trình & bất phương trình.
     - **Bài IV (3,5 điểm · 5 bước):** Tỉ số lượng giác góc nhọn, hệ thức cạnh–góc & tam giác đồng dạng trong tam giác vuông.
     - **Bài V (0,5 điểm · 3 bước):** Câu phân loại Vận dụng cao — Bất đẳng thức $\frac{1}{a} + \frac{1}{b} \ge \frac{4}{a+b}$ và tìm giá trị nhỏ nhất.
   - **13 nút kỹ năng (`knowledge_nodes`):** `CAND-G09-04`..`CAND-G09-07`, `C08`..`C15`, `S07` kèm thông tin xuất xứ rõ ràng (*"Đề luyện tập tự biên soạn mới 100% · DRAFT, không gắn nhãn đề gốc của bất kỳ trường học nào"*).
3. **Khai báo Profile & Allowlist:**
   - Thêm profile `midterm1-hanoi-01` vào `public/data/practice-preview-profiles.json` và đặt làm profile mặc định khi mở `/graph02-preview.html` (vẫn giữ nguyên các profile `midterm1-fixture`, `graph02-v2`, `graph02-v1`, `legacy` để đối chiếu).

---

## 3. Khởi tạo & Cấu hình Cơ sở Dữ liệu D1 Staging Thật (Yêu cầu 3)

- Đã tạo cơ sở dữ liệu D1 staging thật trên Cloudflare APAC bằng `npx wrangler d1 create yourdream-staging-d1`:
  - `database_name`: `yourdream-staging-d1`
  - `database_id`: `4f22972a-ffe0-47d2-aeab-2304b26359d0` (thay thế hoàn toàn placeholder ID cũ).
- Đã cập nhật `wrangler.staging.json` và chạy migration schema thật lên Cloudflare D1 từ xa (`npm run db:migrate:staging-remote` thực thi `drizzle/0000_sour_miracleman.sql` thành công trên `4f22972a-ffe0-47d2-aeab-2304b26359d0`).

---

## 4. Build, Triển khai Worker `yourdream-webapp-staging` & Kiểm thử Trình duyệt Thật trên `workers.dev` (Yêu cầu 4, 5)

### 4.1. Build & Deploy lên Cloudflare Workers
- `npm run build` (`vinext build`): **PASS** (47 SSR modules + 71 client assets).
- `npm run deploy:staging:dry-run`: **PASS** (`Total Upload: 770.86 KiB / gzip: 225.03 KiB`).
- `npm run deploy:staging`: **PASS**
  - Đã tải lên 58 tệp tài nguyên mới/cập nhật (bao gồm `/data/midterm1-hanoi-exam01-preview.json`).
  - URL xuất bản: `https://yourdream-webapp-staging.tothanhnam.workers.dev`
  - Version ID: `d859ddb8-b8b6-45ef-b1f4-5b8955f45a6b`

### 4.2. Kết quả Kiểm thử Trình duyệt Thật (Google Chrome CDP) trên URL `https://yourdream-webapp-staging.tothanhnam.workers.dev`
Thực thi `node tests/verify-staging-browser.cjs` kết nối trực tiếp tới `https://yourdream-webapp-staging.tothanhnam.workers.dev`:

| Hạng mục kiểm thử trên `workers.dev` | Kết quả | Chi tiết xác minh thực tế |
| :--- | :---: | :--- |
| **Worker Routes & Real D1 API** | **PASS** | `GET /` (`200`), `GET /graph02-preview.html` (`200`), `GET /api/me/identity` (`401 {"error":"AUTH_REQUIRED"}`), `GET /api/me/progress` (`401`). |
| **Nạp mặc định Batch 02A (`midterm1-hanoi-01`)** | **PASS** | Nạp đúng 5 bài / 24 bước (`5 + 6 + 5 + 5 + 3 = 24`), hiển thị nhãn `DRAFT · ĐỀ LUYỆN TẬP TỰ BIÊN SOẠN (5 bài / 24 bước)` và thông báo rõ đề tự biên soạn mới 100%, không gắn nhãn đề trường. |
| **Theo dõi 13 Kỹ năng Batch 01 (`NOT_STARTED`)** | **PASS** | Hiển thị `Theo dõi 13 kỹ năng trên 5 bài (24 bước) [policy_version: PENDING]`, toàn bộ 13 kỹ năng khởi đầu ở trạng thái `Chưa học [NOT_STARTED]`. |
| **Chọn sai & Phản hồi (`IN_PRACTICE_NEEDS_RETRY`)** | **PASS** | Chọn phương án sai ở Bài I Bước 1 (`G01:S01`) → phản hồi `.incorrect`, kỹ năng `CAND-G09-05` chuyển sang `Đang luyện · Cần sửa lỗi [IN_PRACTICE_NEEDS_RETRY]`. |
| **Mở 3 gợi ý Socratic (`HINT_OPENED`)** | **PASS** | Bấm `#hint-button` 3 lần mở đủ 3 gợi ý tuần tự của `G01:S01`. |
| **Sửa đúng sau gợi ý (`IN_PRACTICE_WITH_SUPPORT`)** | **PASS** | Chọn `sub_correct` ở `G01:S01` → phản hồi `.correct`, kỹ năng `CAND-G09-05` chuyển sang `Đang luyện · Đúng khi có gợi ý / từng sai [IN_PRACTICE_WITH_SUPPORT]`. |
| **Nhập phân số tương đương & `INSUFFICIENT_EVIDENCE`** | **PASS** | Nhập `6/2` cho đáp án `3` ở `G01:S02` → `.correct`, tiến độ `2 / 24`, kỹ năng `CAND-G09-04` (đạt `1/3` bước) chuyển sang `Chưa đủ bằng chứng [INSUFFICIENT_EVIDENCE]`. |
| **Giải sạch toàn bộ bước của kỹ năng (`CRITERIA_MET_IN_SESSION`)** | **PASS** | Chuyển sang Bài II (`G02`) giải sạch Bước 1 (`prod_correct`) và Bước 2 (`9/2`) ngay lần đầu không gợi ý → kỹ năng `C08` đạt `2/2` bước sạch, chuyển sang `Đã đạt tiêu chí trong phiên (tự giải sạch) [CRITERIA_MET_IN_SESSION]`, tiến độ `4 / 24`. |
| **Làm lại bài (`ITEM_RESET`)** | **PASS** | Bấm `#reset-item` ở Bài II → tiến độ toàn đề quay về `2 / 24` (xóa riêng Bài II, bảo toàn 2 bước đã làm ở Bài I). |
| **Browser Runtime Errors** | **PASS** | `0` lỗi console/exception trên trình duyệt. |
| **Unit Test Suite (`tests/midterm1-phase-a.test.cjs`)** | **PASS** | `12/12` subtests PASS. |

---

## 5. Phương án Rollback An toàn

1. **Production (`bandohoctap`, `yourdream.vn`, `bandohoctap.yourdream.vn`):** Không bị tác động (0 thay đổi).
2. **Staging Worker (`yourdream-webapp-staging`):**
   - Rollback phiên bản Worker: `npx wrangler rollback --config wrangler.staging.json`
   - Hoặc gỡ bỏ Worker staging: `npx wrangler delete --config wrangler.staging.json`
3. **Git (`D:\YOURDREAM.VN`):**
   - Nhánh làm việc `feat/webapp-midterm1-phase-a` tách biệt với `main`. Quay về checkpoint `v0.30` bằng `git checkout 157a7698ae6b66dd755476fd170a07027979f9da`.
