# YOURDREAM — WEBAPP MIDTERM1 PHASE C & HOTFIX · LIVE STAGING & BATCH 02A INTEGRATION QA REPORT

- **Checkpoint:** `v0.32 DRAFT` (cập nhật Hotfix trực tiếp từ `v0.31 DRAFT` / commit `f444a76af3192c7c14996916aed64c08d075268a`)
- **Workspace:** `D:\YOURDREAM.VN\webapp-midterm1`
- **Git Branch:** `feat/webapp-midterm1-phase-a` (không tự merge vào `main`)
- **Live Cloudflare Staging URL (`workers.dev`):**
  - **Đề luyện tập Toán 9 Giữa kỳ I Hà Nội — Batch 02A (5 bài · 24 bước · Mặc định):** `https://yourdream-webapp-staging.tothanhnam.workers.dev/graph02-preview.html`
  - **Link trực tiếp có query profile Batch 02A:** `https://yourdream-webapp-staging.tothanhnam.workers.dev/graph02-preview.html?profile=midterm1-hanoi-01`
  - **Tùy chọn kiểm thử TEST FIXTURE (5 bài · 26 bước):** `https://yourdream-webapp-staging.tothanhnam.workers.dev/graph02-preview.html?profile=midterm1-fixture`
  - **Bộ luyện Căn thức (Production-compatible preview):** `https://yourdream-webapp-staging.tothanhnam.workers.dev/radicals.html`
  - **Bản đồ Toán vào 10 Hà Nội (Trang chủ):** `https://yourdream-webapp-staging.tothanhnam.workers.dev/`
- **Cloudflare Worker Version ID (Phase C Hotfix):** `27d3a8fe-e9e6-4c22-ba42-1049693a7207` (trước Hotfix: `d859ddb8-b8b6-45ef-b1f4-5b8955f45a6b`)

---

## 1. Xác nhận Xác thực Cloudflare (`wrangler whoami`) & Bảo toàn Production

- **Kết quả `npx wrangler whoami`:**
  - Tài khoản: `tothanhnam@gmail.com` (`Account ID: 88431d45cbbb0dea1c329bb28fa525e3`).
  - Quyền OAuth Token: `workers (write)`, `d1 (write)`, `pages (write)`, `workers_routes (write)`, `workers_scripts (write)`.
- **Kiểm tra toàn bộ Workers trong tài khoản:**
  - Chỉ có 2 Workers: `bandohoctap` (cập nhật lần cuối `2026-10-13`, không có `/graph02-preview.html`) và `yourdream-webapp-staging`.
- **Bảo toàn tuyệt đối Production:**
  - Giữ nguyên Worker/Pages `bandohoctap`, domain `yourdream.vn` và `bandohoctap.yourdream.vn`.
  - Không sửa DNS, không ghi đè dữ liệu production, không phê duyệt `RELEASE`.

---

## 2. Chẩn đoán Nguyên nhân & Khắc phục PHASE C HOTFIX (Tại sao Chrome hiển thị `TEST FIXTURE 5 bài / 26 bước`)

### 2.1. Kiểm tra thực tế phiên bản Worker, URL query, Cache, Allowlist & Manifest SHA256
1. **Manifest & SHA256 trên Worker:**
   - `public/data/midterm1-hanoi-exam01-preview.json`: `117,176` bytes — SHA256 `25a9c543df43f8912176294ad4651390e8b4040aa89c281aeed2fa0a56291b99` (khớp 100%).
   - `public/data/midterm1-fixture-preview.json`: SHA256 `6abeb7af79044bfc1a09f043ea2c0f7ecf5974ed3f2864ddd48e1c406749a8df` (khớp 100%).
2. **Ba nguyên nhân thực tế đã tái hiện và khắc phục:**
   - **Nguyên nhân 1 — Query `?profile=midterm1-fixture` dính trên thanh địa chỉ & không đồng bộ khi đổi `<select id="profile-select">`:**
     - Ở Phase B, URL được mở với `?profile=midterm1-fixture` (và được Chrome lưu vào lịch sử gợi ý thanh địa chỉ). Trong bản `v0.31`, hàm `load(id)` của `public/graph02-preview.js` **không** cập nhật `location.search` qua `window.history.replaceState` khi người dùng chọn bộ học liệu khác trong `#profile-select`, và cũng không gán lại `$('profile-select').value = id` bên trong `load(id)`. Hệ quả là nếu URL đang có `?profile=midterm1-fixture`, ngay cả khi người dùng chọn `midterm1-hanoi-01` trên dropdown rồi bấm tải lại trang (`F5`), trang lập tức đọc lại `?profile=midterm1-fixture` trên thanh địa chỉ và quay về `TEST FIXTURE 5 bài / 26 bước`.
   - **Nguyên nhân 2 — Thứ tự `profiles` trong `practice-preview-profiles.json` & Form State Restoration của Chrome:**
     - Trong `v0.31`, `midterm1-hanoi-01` nằm ở vị trí cuối cùng (`profiles[4]`), không có trường `"default_profile"` tường minh trong JSON, thẻ `<select id="profile-select">` không có `autocomplete="off"` và thẻ `<option>` không gắn thuộc tính `selected` trong HTML render.
   - **Nguyên nhân 3 — Cache tài nguyên tĩnh không gắn query phiên bản (`?v=...`) & `fetch()` dùng HTTP cache mặc định:**
     - `graph02-preview.html` nạp `graph02-preview.js` và `graph02-preview.css` không có query chống cache (`?v=v031b`), đồng thời `fetch('data/practice-preview-profiles.json')` không truyền `{ cache: 'no-store' }`, khiến trình duyệt đã mở trang từ Phase B có thể giữ bản cache cũ.

### 2.2. Các thay đổi trong Phase C Hotfix (`v0.32 DRAFT`)
1. **`public/data/practice-preview-profiles.json`:**
   - Thêm trường `"default_profile": "midterm1-hanoi-01"`.
   - Đưa `midterm1-hanoi-01` (5 bài · 24 bước · Batch 02A DRAFT) lên vị trí đầu tiên (`profiles[0]`).
   - Giữ nguyên `midterm1-fixture` (5 bài · 26 bước) ở vị trí thứ hai (`profiles[1]`) với nhãn rõ ràng `"TEST FIXTURE · 5 bài / 26 bước (dữ liệu thử nghiệm kỹ thuật · tùy chọn kiểm thử)"`.
2. **`public/graph02-preview.html`:**
   - Thêm `autocomplete="off"` vào `<select id="profile-select" autocomplete="off" disabled></select>`.
   - Gắn query chống cache `?v=v031b` cho `graph02-preview.css`, `radicals-engine.js`, `radicals-profiles.js`, `radicals-preview-journal.js`, `safe-math.js`, `graph02-preview.js`.
3. **`public/graph02-preview.js`:**
   - Thêm `{ credentials: 'same-origin', cache: 'no-store' }` cho cả `fetch('data/practice-preview-profiles.json', ...)` và `fetch(selected.path, ...)`.
   - Đọc `meta.default_profile` (`midterm1-hanoi-01`), gắn thuộc tính `selected` cho `<option>` mặc định, và đồng bộ `$('profile-select').value = activeProfileId` trong cả `load(id)` và `draw()`.
   - Đồng bộ tức thời `?profile=<id>` trên thanh địa chỉ trình duyệt bằng `window.history.replaceState` ngay khi `load(id)` chuyển profile, đảm bảo khi chuyển từ `?profile=midterm1-fixture` sang `midterm1-hanoi-01` rồi bấm `F5` (reload), trình duyệt giữ nguyên `midterm1-hanoi-01` (5 bài / 24 bước).
   - Cập nhật động `document.title` theo profile đang mở (`5 bài / 24 bước` cho Batch 02A và `TEST FIXTURE · 5 bài / 26 bước` khi chọn fixture).

---

## 3. Tích hợp Gói Đề Luyện tập Toán 9 Giữa kỳ I Hà Nội — Batch 02A (5 bài · 24 bước)

1. **Nguồn dữ liệu Batch 02A đã đối chiếu mã băm SHA256:**
   - Tệp gốc trên Google Drive: `G:\Drive của tôi\YD_G09_MIDTERM1_HANOI_PRACTICE_EXAM_01_v0_1_DRAFT.json`
   - Tệp tích hợp trong Webapp: `public/data/midterm1-hanoi-exam01-preview.json`
   - Dung lượng: `117,176` bytes
   - Mã băm SHA256: `25a9c543df43f8912176294ad4651390e8b4040aa89c281aeed2fa0a56291b99`.
2. **Cấu trúc học liệu Batch 02A (`YD-G09-MIDTERM1-HANOI-PRACTICE-EXAM-01`):**
   - **5 bài toán (`5 + 6 + 5 + 5 + 3 = 24` bước giải, thang điểm 10,0):**
     - **Bài I (2,0 điểm · 5 bước):** Giải hệ phương trình bậc nhất hai ẩn (phương pháp thế & cộng đại số).
     - **Bài II (2,0 điểm · 6 bước):** Phương trình tích, phương trình chứa ẩn ở mẫu & bất phương trình bậc nhất một ẩn.
     - **Bài III (2,0 điểm · 5 bước):** Giải bài toán thực tế bằng cách lập hệ phương trình & bất phương trình.
     - **Bài IV (3,5 điểm · 5 bước):** Tỉ số lượng giác góc nhọn, hệ thức cạnh–góc & tam giác đồng dạng trong tam giác vuông.
     - **Bài V (0,5 điểm · 3 bước):** Câu phân loại Vận dụng cao — Bất đẳng thức $\frac{1}{a} + \frac{1}{b} \ge \frac{4}{a+b}$ và tìm giá trị nhỏ nhất.
   - **13 nút kỹ năng (`knowledge_nodes`):** `CAND-G09-04`..`CAND-G09-07`, `C08`..`C15`, `S07`.

---

## 4. Cơ sở Dữ liệu D1 Staging Thật & Kết quả Kiểm thử Chrome Thật trên `workers.dev`

- **Cloudflare D1 Staging:** `yourdream-staging-d1` (`database_id: 4f22972a-ffe0-47d2-aeab-2304b26359d0`).
- **Kết quả chạy `node tests/verify-staging-browser.cjs` bằng Google Chrome thật trên `https://yourdream-webapp-staging.tothanhnam.workers.dev` (Version ID `27d3a8fe-e9e6-4c22-ba42-1049693a7207`):**

| Hạng mục kiểm thử trên `workers.dev` | Kết quả | Chi tiết xác minh thực tế |
| :--- | :---: | :--- |
| **Worker Routes & Real D1 API** | **PASS** | `GET /` (`200`), `GET /graph02-preview.html` (`200`), `GET /api/me/identity` (`401 {"error":"AUTH_REQUIRED"}`), `GET /api/me/progress` (`401`). |
| **Nạp mặc định Batch 02A (`midterm1-hanoi-01`)** | **PASS** | Mở `/graph02-preview.html` (không query) tự động chọn `midterm1-hanoi-01` (`options[0]`), đồng bộ URL thành `?profile=midterm1-hanoi-01`, nạp đúng 5 bài / 24 bước (`5 + 6 + 5 + 5 + 3 = 24`), hiển thị `DRAFT · ĐỀ LUYỆN TẬP TỰ BIÊN SOẠN (5 bài / 24 bước)`. |
| **Tùy chọn `midterm1-fixture` (26 bước) & Chuyển đổi + Reload (`F5`)** | **PASS** | Mở `?profile=midterm1-fixture` hiển thị `DRAFT · TEST FIXTURE (5 bài / 26 bước)` (`0 / 26 bước`). Khi đổi `#profile-select` sang `midterm1-hanoi-01`, URL cập nhật thành `?profile=midterm1-hanoi-01`, hiển thị `5 bài / 24 bước`, và sau khi `Page.reload` (`F5`) vẫn giữ nguyên `midterm1-hanoi-01` (`5 bài / 24 bước`). |
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
   - Nhánh làm việc `feat/webapp-midterm1-phase-a` tách biệt với `main`.
