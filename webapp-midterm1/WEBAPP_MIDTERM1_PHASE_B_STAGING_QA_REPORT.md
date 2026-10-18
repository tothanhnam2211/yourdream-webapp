# YOURDREAM — WEBAPP MIDTERM1 PHASE B · STAGING READY & QA REPORT

- **Checkpoint:** `v0.30 DRAFT` (tiếp nối trực tiếp từ `v0.29 DRAFT` / commit `26ab85d9335485d1282344a3f92cc6ffa365ac33`)
- **Workspace:** `D:\YOURDREAM.VN\webapp-midterm1`
- **Git Branch:** `feat/webapp-midterm1-phase-a` (không tự merge vào `main`)
- **Phase B Commit SHA:** `8cc1079238aeb9aac50a470cc008e18ed1ee78a8` (parent: `26ab85d9335485d1282344a3f92cc6ffa365ac33`)
- **Remote Origin (`D:\YOURDREAM.VN`):** `https://github.com/tothanhnam2211/yourdream-webapp.git`
- **Legacy Repository (Production tham chiếu):** `https://github.com/tothanhnam2211/bandohoctap` (commit `4f98b58`)

---

## 1. Kiểm toán Cấu hình Cloudflare & Ứng dụng Legacy `bandohoctap` (Yêu cầu 2, 3, 4)

### 1.1. Ứng dụng cũ `bandohoctap` (Production hiện hành)
- **Repository:** `https://github.com/tothanhnam2211/bandohoctap` (bản sao cục bộ tại `C:\Users\Admin\.gemini\antigravity\scratch\bandohoctap_webapp`, `HEAD = 4f98b58`).
- **Cấu hình `wrangler.json` của `bandohoctap`:**
  ```json
  {
    "name": "bandohoctap",
    "compatibility_date": "2024-09-23",
    "assets": {
      "directory": "."
    }
  }
  ```
- **Cơ chế triển khai legacy:**
  - `package.json`: `"deploy": "wrangler deploy"`, `"preview": "wrangler preview"`.
  - `pipeline/deploy.py`: chạy `npx wrangler pages deploy "<PROJECT_ROOT>" --project-name bandohoctap`.
  - `pipeline/sync_gdrive_to_github.py`: đồng bộ tự động từ `G:\Drive của tôi\BANDOHOCTAP_NGUON` lên nhánh `main` của `tothanhnam2211/bandohoctap.git`.
- **Cam kết an toàn Production:** Không đụng chạm tới Worker/Pages `bandohoctap`, không sửa DNS, không ghi đè dữ liệu cũ, không push sang repo `bandohoctap`.

### 1.2. Ứng dụng mới `YOURDREAM Webapp` (`D:\YOURDREAM.VN\webapp-midterm1`)
- **Kiến trúc Runtime:** Vinext (`0.0.29`) + Vite (`7.3.2`) + React 19 SSR trên Cloudflare Workers (`compatibility_date: 2026-05-15`, `nodejs_compat`) kết hợp Cloudflare Assets (`dist/client`) và cơ sở dữ liệu Cloudflare D1 (`binding: DB`).
- **Cấu hình gốc (`.openai/hosting.json` & `dist/server/wrangler.json`):**
  - Worker mặc định do plugin Vinext sinh ra: `name: "site-creator-vinext-starter"`, D1 `database_name: "site-creator-d1"`, `database_id: "00000000-0000-4000-8000-000000000000"`.
- **Cấu hình Staging tách biệt (`wrangler.staging.json` — Yêu cầu 6):**
  - Tên Worker riêng biệt: `yourdream-webapp-staging` (tách hoàn toàn khỏi `bandohoctap` và `site-creator-vinext-starter`).
  - Entrypoint server: `dist/server/index.js` (`no_bundle: true`).
  - Static Assets: `dist/client` với `"html_handling": "none"` để phục vụ trực tiếp `/graph02-preview.html`, `/radicals.html`, `/index.html`, `/blueprint.html` với HTTP `200 OK` (không bị redirect `307`).
  - Biến môi trường staging:
    - `YOURDREAM_ENV = "staging"`
    - `YOURDREAM_FIXTURE_MODE = "TEST_FIXTURE_ONLY_NOT_MIDTERM_EXAM"`
  - Binding D1 cô lập cho staging:
    - `binding: "DB"`
    - `database_name: "yourdream-staging-d1"`
    - `database_id: "00000000-0000-4000-8000-000000000001"`
    - Lưu trữ trạng thái D1 staging cục bộ tại `.wrangler/staging-state` (đã chạy migration `migrations/0001_initial.sql` với 15 câu lệnh SQL thành công, tách biệt hoàn toàn khỏi `.wrangler/state` và production).

---

## 2. Đối chiếu Trạng thái Chẩn đoán Kỹ năng với MVP Scope Batch 01 & Nhãn `TEST FIXTURE` (Yêu cầu 5, 9)

### 2.1. Chuẩn hóa 5 trạng thái bằng chứng kỹ năng theo Batch 01 (`YEU_CAU_DU_LIEU_v0_1_DRAFT.txt` Mục 3.6)
Cập nhật `public/radicals-preview-journal.js` bổ sung `BATCH01_STATE_MAP` và `policy_version: 'PENDING'`:
1. `NOT_STARTED` (`UNTOUCHED`) → **"Chưa học"**
2. `INSUFFICIENT_EVIDENCE` (`IN_PROGRESS`) → **"Chưa đủ bằng chứng"**
3. `IN_PRACTICE_NEEDS_RETRY` (`NEEDS_RETRY`) → **"Đang luyện · Cần sửa lỗi"**
4. `IN_PRACTICE_WITH_SUPPORT` (`SUPPORTED_PASS`) → **"Đang luyện · Đúng khi có gợi ý / từng sai"**
5. `CRITERIA_MET_IN_SESSION` (`CLEAN_PASS`) → **"Đã đạt tiêu chí trong phiên (tự giải sạch)"**

### 2.2. Hiển thị rõ `TEST FIXTURE` khi chưa có đề thật Batch 02A (Yêu cầu 9)
Cập nhật `public/data/practice-preview-profiles.json`, `public/graph02-preview.html`, và `public/graph02-preview.js`:
- `<title>`: `YOURDREAM · Học liệu thử nghiệm (TEST FIXTURE)`
- `#fixture-badge`: `DRAFT · TEST FIXTURE (5 bài / 26 bước)`
- `#fixture-notice`: Cảnh báo rõ đây là **TEST FIXTURE (Dữ liệu thử nghiệm kỹ thuật — không phải đề thi giữa kỳ chính thức)** trong lúc chờ gói JSON Batch 02A từ Argon.
- Nhãn chọn bộ học liệu (`#profile-select`): `TEST FIXTURE · 5 bài / 26 bước (chưa phải đề thi giữa kỳ · chờ Batch 02A)`
- `#total-progress`: `... · TEST FIXTURE (không phải đề thi giữa kỳ)`
- `#exercise-title`: `Bài X / 5 (TEST FIXTURE)`

---

## 3. Trạng thái Triển khai Staging & Điểm chặn Xác thực Cloudflare Từ xa (Yêu cầu 7)

### 3.1. Kết quả Build & Dry-Run Bundle Staging
- Lệnh `npm run build` (`vinext build`): **PASS** (biên dịch 47 module RSC/SSR vào `dist/server/index.js` và 70 tệp tĩnh vào `dist/client`).
- Lệnh `npm run deploy:staging:dry-run` (`wrangler deploy --config wrangler.staging.json --dry-run`): **PASS**
  - Tổng dung lượng gói Worker: `770.82 KiB / gzip: 224.98 KiB`.
  - Bindings xác nhận: `env.DB (yourdream-staging-d1)`, `env.YOURDREAM_ENV ("staging")`, `env.YOURDREAM_FIXTURE_MODE ("TEST_FIXTURE_ONLY_NOT_MIDTERM_EXAM")`.

### 3.2. URL Staging Cục bộ & Blocker Xác thực Cloudflare Remote
- **URL Staging chạy thực tế trên máy (Cloudflare Worker / Miniflare Runtime):**
  - `http://127.0.0.1:8788/graph02-preview.html?profile=midterm1-fixture`
  - `http://127.0.0.1:8788/radicals.html`
  - `http://127.0.0.1:8788/`
  - Khởi chạy bằng lệnh: `npm run start:staging`
- **Blocker đẩy lên `*.workers.dev` từ xa (`CLOUDFLARE_AUTH_REQUIRED`):**
  - Kiểm tra `npx wrangler whoami` trả về: `You are not authenticated. Please run wrangler login.`
  - Môi trường máy hiện tại không có `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` và chưa đăng nhập OAuth Cloudflare.
  - **Lệnh duy nhất để xuất bản lên `https://yourdream-webapp-staging.<subdomain>.workers.dev` ngay khi người dùng đăng nhập:**
    ```powershell
    cd D:\YOURDREAM.VN\webapp-midterm1
    npx wrangler login
    npm run deploy:staging
    ```

---

## 4. Kết quả Kiểm thử Trình duyệt Thực tế trên Worker Staging (Yêu cầu 8)

Đã thực thi kịch bản kiểm thử trình duyệt thực tế (`tests/verify-staging-browser.cjs`) điều khiển **Google Chrome (CDP)** truy cập trực tiếp vào máy chủ Cloudflare Worker Staging (`http://127.0.0.1:8788` chạy `wrangler.staging.json` + D1 `.wrangler/staging-state`):

| Hạng mục kiểm thử | Kết quả | Chi tiết xác minh thực tế |
| :--- | :---: | :--- |
| **Worker Routes & Isolated D1 API** | **PASS** | `GET /` (`200`), `GET /graph02-preview.html` (`200`), `GET /api/me/identity` (`401 {"error":"AUTH_REQUIRED"}`), `GET /api/me/progress` (`401`). |
| **Hiển thị `TEST FIXTURE`** | **PASS** | `<title>`, `#fixture-badge`, `#fixture-notice`, `#profile-select`, `#total-progress`, `#exercise-title` đều hiển thị rõ `TEST FIXTURE`, không giới thiệu là đề thi giữa kỳ thật. |
| **Nạp Fixture 5 bài / 26 bước** | **PASS** | Render đủ 5 nút bài tập (`4 + 5 + 6 + 5 + 6 = 26` bước) và bảng chẩn đoán 12 kỹ năng (`policy_version: PENDING`). |
| **Trạng thái `NOT_STARTED` (Batch 01)** | **PASS** | Lúc mới nạp, cả 12 kỹ năng hiển thị `Chưa học [NOT_STARTED]`. |
| **Nhập sai & Phản hồi (`IN_PRACTICE_NEEDS_RETRY`)** | **PASS** | Nhập `9` ở Bài 1 Bước 1 (`expected = 3`) → `#feedback.incorrect`, kỹ năng chuyển sang `Đang luyện · Cần sửa lỗi [IN_PRACTICE_NEEDS_RETRY]`. |
| **Mở 3 gợi ý (`HINT_OPENED`)** | **PASS** | Bấm `#hint-button` 3 lần hiển thị đủ 3 gợi ý tuần tự. |
| **Giải đúng bằng phân số tương đương sau gợi ý (`IN_PRACTICE_WITH_SUPPORT`)** | **PASS** | Nhập `6/2` (= `3`) ở Bài 1 Bước 1 → `#feedback.correct`, tiến độ `1 / 26`, kỹ năng chuyển sang `Đang luyện · Đúng khi có gợi ý / từng sai [IN_PRACTICE_WITH_SUPPORT]`. |
| **Giải đúng 1 phần kỹ năng (`INSUFFICIENT_EVIDENCE`)** | **PASS** | Giải sạch Bài 1 Bước 2 (`-4`) → kỹ năng hằng đẳng thức căn bậc ba đạt `1/2` bước, hiển thị `Chưa đủ bằng chứng [INSUFFICIENT_EVIDENCE]`. |
| **Giải sạch toàn bộ bước của kỹ năng (`CRITERIA_MET_IN_SESSION`)** | **PASS** | Giải sạch tiếp Bước 3 (`-4`) và Bước 4 (`3`) → hoàn thành Bài 1 (`4 / 26 bước · 1 / 5 bài hoàn thành`), kỹ năng đạt `2/2` bước sạch chuyển sang `Đã đạt tiêu chí trong phiên (tự giải sạch) [CRITERIA_MET_IN_SESSION]`. |
| **Trắc nghiệm (`choice`) & `ITEM_RESET`** | **PASS** | Chuyển sang Bài 2 giải đúng Bước 1 (`x_ne_1`) và Bước 2 (`rad_gt_0`) → tiến độ `6 / 26`. Bấm `#reset-item` ("Làm lại bài") → xóa riêng tiến độ Bài 2 về `4 / 26`, giữ nguyên kết quả Bài 1. |
| **Browser Runtime Errors** | **PASS** | `0` lỗi console/exception trên trình duyệt. |
| **Unit Test Phase A + B (`tests/midterm1-phase-a.test.cjs`)** | **PASS** | `8/8` test cases PASS. (Không chạy lại các bộ test cũ không thay đổi). |

---

## 5. Phương án Rollback An toàn (Yêu cầu 10)

1. **Đối với Production hiện hành (`bandohoctap`):**
   - Không có bất kỳ thay đổi nào được đẩy lên Worker/Pages `bandohoctap` hay nhánh `main` của `tothanhnam2211/bandohoctap`. Nếu cần kiểm tra lại production cũ, toàn bộ mã nguồn nguyên trạng nằm tại commit `4f98b58` trên `https://github.com/tothanhnam2211/bandohoctap`.
2. **Đối với Staging Worker (`yourdream-webapp-staging`):**
   - Khi đã triển khai lên Cloudflare bằng `npm run deploy:staging`, nếu muốn gỡ bỏ bản staging hoặc quay về phiên bản trước:
     - Rollback phiên bản Worker: `npx wrangler rollback --config wrangler.staging.json`
     - Hoặc xóa hoàn toàn Worker staging (không ảnh hưởng `bandohoctap`): `npx wrangler delete --config wrangler.staging.json`
3. **Đối với Git (`D:\YOURDREAM.VN`):**
   - Nhánh làm việc `feat/webapp-midterm1-phase-a` độc lập với `main`.
   - Để quay về trạng thái cuối Phase A (`v0.29`): `git checkout 26ab85d9335485d1282344a3f92cc6ffa365ac33`.
4. **Đối với D1 Staging cục bộ:**
   - Xóa thư mục `.wrangler/staging-state` và chạy lại `npm run db:migrate:staging-local`.
