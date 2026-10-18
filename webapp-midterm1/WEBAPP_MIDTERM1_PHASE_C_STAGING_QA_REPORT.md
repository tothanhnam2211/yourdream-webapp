# YOURDREAM — WEBAPP MIDTERM1 PHASE C, HOTFIX & FIVE CORE STUDENT ERROR TYPES · QA REPORT

- **Checkpoint:** `v0.33 DRAFT` (tiếp nối trực tiếp từ `v0.32 DRAFT` / commit `5b852201b7aa6aab59ee6ef3716c2475a23c420c`)
- **Workspace:** `D:\YOURDREAM.VN\webapp-midterm1`
- **Git Branch:** `feat/webapp-midterm1-phase-a` (không tự merge vào `main`)
- **Live Cloudflare Staging URL (`workers.dev`):**
  - **Đề luyện tập Toán 9 Giữa kỳ I Hà Nội — Batch 02A (5 bài · 24 bước · Mặc định):** `https://yourdream-webapp-staging.tothanhnam.workers.dev/graph02-preview.html`
  - **Link trực tiếp có query profile Batch 02A:** `https://yourdream-webapp-staging.tothanhnam.workers.dev/graph02-preview.html?profile=midterm1-hanoi-01`
  - **Tùy chọn kiểm thử TEST FIXTURE (5 bài · 26 bước):** `https://yourdream-webapp-staging.tothanhnam.workers.dev/graph02-preview.html?profile=midterm1-fixture`
  - **Bộ luyện Căn thức (Production-compatible preview):** `https://yourdream-webapp-staging.tothanhnam.workers.dev/radicals.html`
  - **Bản đồ Toán vào 10 Hà Nội (Trang chủ):** `https://yourdream-webapp-staging.tothanhnam.workers.dev/`
- **Cloudflare Worker Version ID (`v0.33 DRAFT`):** `5d16a361-e2f4-4eb6-8bbe-eb512a038845`

---

## 1. Xác nhận Xác thực Cloudflare (`wrangler whoami`) & Bảo toàn Production

- **Kết quả `npx wrangler whoami`:**
  - Tài khoản: `tothanhnam@gmail.com` (`Account ID: 88431d45cbbb0dea1c329bb28fa525e3`).
- **Bảo toàn tuyệt đối Production:**
  - Giữ nguyên Worker/Pages `bandohoctap`, domain `yourdream.vn` và `bandohoctap.yourdream.vn`.
  - Không sửa DNS, không ghi đè dữ liệu production, không sửa hợp đồng JSON nguồn (`midterm1-hanoi-exam01-preview.json` giữ nguyên SHA256 `25a9c543df43f8912176294ad4651390e8b4040aa89c281aeed2fa0a56291b99`), không gọi API trả phí, không tự phê duyệt `RELEASE`.

---

## 2. Hệ thống 5 Nhóm Lỗi Cốt lõi của Học sinh (`YOURDREAM — FIVE CORE STUDENT ERROR TYPES`)

Đã triển khai mô-đun ánh xạ và giàn giáo nội bộ `public/midterm1-error-scaffolding.js` tích hợp trực tiếp với `public/graph02-preview.js`, `public/graph02-preview.html` và `public/graph02-preview.css`:

### 2.1. Phân tầng Nguồn phát sinh lỗi (`ORIGIN_LAYERS`) & Thứ tự Ưu tiên Nguyên nhân Gốc
1. **`INPUT_DATA_AND_SETUP` (Tầng 1 · Dữ liệu đầu vào & Dựng hình/Ký hiệu ban đầu):**
   - `1. COPYING_ERROR` (`priority_rank: 1`) — Chép lại đề hoặc biểu thức sai (chép thiếu ngoặc khi thế biểu thức, hoán đổi hệ số $x, y$ hoặc tổng tiền, chép nhầm dấu phép toán giữa hai phân thức, đọc sót chi phí cố định 4 giáo viên).
   - `5. DIAGRAM_ERROR` (`priority_rank: 2`) — Vẽ hình, đặt điểm, ký hiệu hoặc thể hiện quan hệ hình học sai (nhầm cạnh kề/đối/huyền đối với góc nghiêng $\alpha$, nhầm vị trí hai đoạn hình chiếu $BH$ và $CH$ trên cạnh huyền $BC$, xếp sai thứ tự đỉnh tương ứng $\triangle HBA \backsim \triangle ABC$).
2. **`REASONING_AND_METHOD` (Tầng 2 · Chọn phương pháp & Lập luận biến đổi dấu/chiều):**
   - `4. METHOD_GAP` (`priority_rank: 3`) — Không biết bắt đầu hoặc chọn phương pháp (mở gợi ý khi chưa làm được bước đầu, chia hai vế cho nhân tử chứa ẩn làm mất nghiệm, nhầm ĐKXĐ tử thức với mẫu thức, đặt sai chiều bất phương trình kinh phí $\le$, cộng mẫu với mẫu).
   - `2. SIGN_ERROR` (`priority_rank: 4`) — Sai dấu, chuyển vế, phân phối dấu âm (bỏ quên dấu trừ trước $y$ trong $2x - y = 5$, phá ngoặc có dấu trừ đằng trước quên đổi dấu, chia hai vế bất phương trình cho số âm quên đổi chiều, hoặc nhập đáp số hữu tỉ trái dấu `-expected`).
3. **`COMPUTATION_AND_EVALUATION` (Tầng 3 · Tính toán số học, Rút gọn & Thay số):**
   - `3. ARITHMETIC_ERROR` (`priority_rank: 5`) — Sai phép tính, rút gọn, thay số (tính nhẩm lệch hằng số khi thu gọn, tra nhầm giá trị $\cos 60^\circ = 1/2$, khai triển $(a+b)^2 - 4ab$ thiếu hệ số $2ab$, hoặc tính sai giá trị số hữu tỉ).

### 2.2. Cây quyết định Giàn giáo (`diagnoseStudentErrors`) — Nhiều lỗi đồng thời nhưng CHỈ 1 nhiệm vụ sửa mỗi lượt
- Hệ thống ghi nhận đầy đủ mọi lỗi đang tồn đọng trên các bước trong phiên (`detected_errors`, `total_active_errors`, `queued_errors_count`).
- Cây quyết định sắp xếp ưu tiên theo:
  1. Bài đang làm hiện tại (`is_current_exercise`),
  2. **Bước sớm nhất có bằng chứng trong Step Graph DAG (`step_order`)** để chặn lỗi dây chuyền từ bước đầu,
  3. Thứ tự tầng nguyên nhân gốc (`COPYING_ERROR` $\rightarrow$ `DIAGRAM_ERROR` $\rightarrow$ `METHOD_GAP` $\rightarrow$ `SIGN_ERROR` $\rightarrow$ `ARITHMETIC_ERROR`).
- Mỗi lượt chỉ xuất **đúng 1 nhiệm vụ sửa lỗi (`active_remediation_task`)** gồm đủ 5 thành phần bắt buộc:
  1. **Câu hỏi phát hiện (`detection_question`)**
  2. **Gợi ý giàn giáo mức 1–3 (`hints`)**
  3. **Hoạt động tự sửa (`self_correction_activity`)** + nút chuyển thẳng tới bước cần sửa trên Step Graph
  4. **Lời sửa mẫu (`model_correction`)**
  5. **Quy tắc tránh lặp lại lỗi trong bài thi tiếp theo (`exam_prevention_rule`)**
- Ngay khi học sinh sửa đúng bước ưu tiên số 1, cây quyết định tự động đôn lỗi tiếp theo trong hàng đợi lên làm nhiệm vụ hiện hành.

### 2.3. Giới hạn Kiểm định Minh bạch & Chốt đối chiếu Hình học trước khi giải (`Geometry Pre-Solve Checklist`)
- **Giới hạn kiểm định (`VERIFICATION_BOUNDARY_NOTICE`):** Hiển thị rõ hệ thống chỉ kết luận lỗi dựa trên bằng chứng xác định (`diagnosis_code`, kiểm tra giá trị/đấu số hữu tỉ, sự kiện `HINT_OPENED` và mục tự kiểm), **không** tự tuyên bố nhận diện lỗi từ văn bản tự do hay hình vẽ tay khi chưa có bộ kiểm định.
- **Chốt đối chiếu Hình học (Bài IV — `YD-G09-MID1-01:G04`):** Hiển thị bảng 4 chốt kiểm tra Giả thiết – Ký hiệu vuông góc ($90^\circ$ tại chân tường, đỉnh $A$, chân đường cao $H \in BC$) – Vị trí cạnh Đối/Kề/Huyền & Hình chiếu $BH, CH$ – Thứ tự đỉnh đồng dạng $\triangle HBA \backsim \triangle ABC$ trước khi giải.

### 2.4. Bảo toàn Tờ đề tự luận, Sơ đồ tư duy từng bài, Lời giải mẫu hoàn chỉnh & Chế độ Thi thử
- **Tờ đề tự luận (`#exam-paper-panel`):** Xem toàn bộ 5 bài tự luận chuẩn 90 phút và chuyển nhanh tới từng bài.
- **Sơ đồ tư duy từng bài (`#exercise-mindmap`):** Tóm tắt 3 nhánh (Giả thiết & Điều kiện đầu vào → Luồng bước giải tư duy → Chốt chặn bẫy lỗi) ngay trên bản đồ DAG.
- **Thư viện 5 Nhóm Bẫy lỗi của mỗi bài (`#exercise-trap-library`):** Đầy đủ cả 5 nhóm lỗi (`COPYING_ERROR`, `SIGN_ERROR`, `ARITHMETIC_ERROR`, `METHOD_GAP`, `DIAGRAM_ERROR`) gắn với từng `step_id` của mỗi bài.
- **Lời giải mẫu hoàn chỉnh (`#model-solution-panel`):** Trình bày đầy đủ phép biến đổi `before -> after`, lý do và đáp số chuẩn của tất cả các bước trong bài.
- **Chế độ Thi thử (`#exam-mode-btn` / `#submit-exam-btn`):** Cho phép học sinh làm thử các bước trên toàn đề mà không lộ gợi ý/đáp án/lời giải mẫu giữa chừng; khi bấm **"Nộp bài thi thử & Chẩn đoán 5 nhóm lỗi"**, hệ thống chấm toàn đề, mở Lời giải mẫu và kích hoạt Cây quyết định 5 nhóm lỗi.

---

## 3. Kết quả Kiểm thử Đơn vị & Kiểm thử Trình duyệt Chrome Thật trên `workers.dev`

- **Unit Test Suite (`node --test tests/midterm1-phase-a.test.cjs`):** **`15/15` subtests PASS** (`M1-01`..`M1-11`).
- **Real Google Chrome Verification (`node tests/verify-staging-browser.cjs` trên `https://yourdream-webapp-staging.tothanhnam.workers.dev` — Version ID `5d16a361-e2f4-4eb6-8bbe-eb512a038845`):**
  - Default profile `midterm1-hanoi-01` (5 bài / 24 bước), chuyển đổi `?profile=midterm1-fixture` ↔ `midterm1-hanoi-01` và giữ nguyên sau `F5` reload: **PASS**.
  - Phân loại lỗi `SIGN_ERROR` trên `G01:S01`, hiển thị thẻ nhiệm vụ sửa lỗi duy nhất (`#active-remediation-card`), hiển thị đủ 5 nhóm lỗi trong `#trap-library-list`, 3 nhánh Sơ đồ tư duy (`#mindmap-branches`), 5 bước Lời giải mẫu (`#model-solution-list`), và 4 chốt Hình học trên Bài IV (`#geometry-precheck`): **PASS**.
  - Browser runtime errors: **`0` lỗi**.
