# 🚀 KẾ HOẠCH TRIỂN KHAI XÂY DỰNG WEBGAME & WEBAPP YOURDREAM.VN
## (IMPLEMENTATION_PLAN_V3.MD - MÔ HÌNH BLANK CANVAS, 10 AI AGENTS & KHÁNG TẮC NGHỄN ĐỈNH ĐIỂM)

---

## 1. TỔNG QUAN DỰ ÁN & KIẾN TRÚC MẶT TIỀN BLANK CANVAS
* **Tên dự án:** YourDream.vn (EduMap Art — Bản Đồ Học Tập & Hệ Sinh Thái Sư Phạm Số).
* **Kiến trúc Trải nghiệm (UI/UX Concept):** **Blank Canvas Architecture ("Vỏ Mộc Mạc — Ruột Cỗ Máy Lượng Tử")**.
  * **Mặt tiền Frontend:** Trang web trắng tối giản, siêu nhẹ (<0.5s), nổi bật duy nhất **1 Nút Chụp Ảnh Camera WebRTC** (hoặc ô tìm kiếm 1-chạm). Triệt tiêu mọi menu/nút bấm rườm rà gây ngợp người dùng.
  * **Trang trí & Tùy biến Trực quan (Visual Editing Overlay):** Tích hợp thanh công cụ kéo thả/chỉnh sửa trực tiếp trên màn hình (Visual Editor) cho phép người dùng nhấp trực tiếp để **tải ảnh từ máy tính, thêm Tab, chèn Nút chức năng và thêm Nút sơ đồ tri thức 3D**.
* **Hậu trường Backend & AI Agents:**
  * **Cơ chế kích hoạt:** 10 AI Agents nằm mai phục ở trạng thái **Event-Driven (Kích hoạt theo sự kiện)**. Khi giáo viên bấm nút chụp ảnh camera, hệ thống lập tức đánh thức chuỗi 10 Agents để xử lý.
  * **Kho 64.000 Học liệu Offline (Local SQLite `yourdream.db`):** Nhân bản từ 2.450 Nút Tri Thức Nguyên Tử GDPT 2018 (quan hệ Parent-Child 1-N). Phản hồi siêu tốc (<5ms) hoàn toàn Offline trên máy tính.
  * **Hạt nhân Kiểm định Hình thức:** Lean 4 Theorem Prover Kernel (`services/lean4_kernel.py`) chạy ngầm rào chắn 100% không ảo giác logic.

---

## 2. RÀO CHẮN BẢO VỆ, PHÂN QUYỀN RBAC & CƠ CHẾ KHÁNG TẮC NGHỄN ĐỈNH ĐIỂM

### 2.1. Ma Trận Phân Quyền RBAC Khóa Quyền "Tạo Mới" Của Giáo Viên
Áp dụng cơ chế Phân quyền dựa trên Vai trò (RBAC) trong `services/auth_service.py`:
* **Admin (`ADMIN`):** Toàn quyền (Tạo mới học liệu gốc, Chỉnh sửa, Tải về/Xuất bản, Xóa).
* **Giáo Viên (`TEACHER`):** 
  * ❌ **Khóa cứng quyền "Tạo mới" (`can_create_item = False`):** Không hiển thị nút thêm học liệu gốc để tránh làm loãng/rác kho dữ liệu chuẩn.
  * ✅ **Mở quyền "Chỉnh sửa" (`can_edit_item = True`):** Cho phép sửa văn bản, đổi số liệu, ẩn/hiện câu hỏi trên giao diện.
  * ✅ **Mở quyền "Tải về / Xuất bản" (`can_export_pkg = True`):** 1-Click xuất bản Giáo án Word CV 5512, Slide PPTX, và Đề thi PDF A4 print-ready.
* **Cơ chế Local Overrides Patch:** Khi giáo viên tùy chỉnh 1 học liệu, hệ thống tạo bản vá cá nhân hóa lưu kèm `teacher_id` trong SQLite mà không đè hỏng file Master Gốc của Admin.

### 2.2. Thanh Công Cụ Chỉnh Sửa Trực Quan Trực Tiếp Trên Giao Diện (Visual Editor Toolbar)
Nhúng thanh công cụ Lớp phủ Biên tập (`visual_editor_overlay`) vào giao diện WebApp:
1. **[📷 Tải Ảnh Lên]:** Nhấp chọn tệp ảnh từ máy tính (`.png`, `.jpg`, `.svg`), tự động lưu vào `03_ASSETS/uploads/` và chèn trực tiếp vào khung hiển thị.
2. **[📑 Thêm Tab]:** Sinh Tab mới trên thanh Navigation và mở rộng khung chứa nội dung động kết nối với SQLite.
3. **[🔘 Thêm Nút]:** Chèn nút bấm tương tác (Nút mở video cứu trợ 30s, Nút kích hoạt giàn giáo Socratic, Nút tải file) kèm Bánh xe chọn màu (Color Picker).
4. **[🌌 Thêm Nút Sơ Đồ]:** Vẽ thêm quả cầu bài học mới trên Canvas Sơ đồ Nơ-ron 3D (vis.js) và tự động nối dây liên thông.

### 2.3. Tiêu Chuẩn Kháng Tắc Nghẽn Đỉnh Điểm (Spike Concurrency Guardrails)
Tích hợp 5 lá chắn bảo vệ hệ thống khi 10.000 học sinh đăng nhập cùng lúc:
1. **Client-Side Rendering & Local-First (Trình duyệt & WASM/GPU):** Tải mẩu tin JS/Canvas siêu nhẹ ~150KB từ CDN, tính toán sơ đồ 3D và làm bài kéo-thả 100% trên thiết bị học sinh (0 request về máy chủ).
2. **Smart Waiting Queue & CDN (Cloudflare Edge):** Tường lửa Cloudflare đệm ngoài tự động chuyển học sinh vào hàng chờ đếm ngược đợt xả lưu lượng khi dồn dập.
3. **Semantic Caching (<2ms):** Cache sẵn các chẩn đoán và âm thanh Edge-TTS phổ biến trong `db_service.py` để phục vụ hàng ngàn học sinh cùng lúc mà không tốn API/CPU.
4. **Async Job Queue (Redis & Odoo Sync):** Đẩy việc ghi điểm số, Bánh xe cuộc đời và Zalo ZNS vào `Redis Queue` ghi ngầm bất đồng bộ trong `notification_service.py`.
5. **Graceful Degradation (Tự động hạ tải khi CPU > 80%):** Tự động chuyển giao diện bài học sang dạng Vector SVG 3KB tĩnh siêu nhẹ trong `agent_2_media.py` và `student_portal.py` để giữ trải nghiệm mượt mà 100%.

---

## 3. CÂY THƯ MỤC DỰ ÁN DẠNG OBSIDIAN VAULT & 16 MODULE CỐT LÕI

### 3.1. Cấu Trúc Thư Mục Chuẩn Obsidian Enterprise Vault
```text
D:\YOURDREAM.VN\
├── 📁 00_INBOX/                      <-- Nhận tài liệu thô, đề bài, ảnh chụp
├── 📁 00_NGUON_THONG_NHAT/            <-- Kho PDF/Word SGK 12 khối lớp GDPT 2018
├── 📁 01_MOC_ATLAS/                  <-- Bản đồ Chỉ mục Nút tri thức (Catalog & Index)
├── 📁 02_CURRICULUM/                 <-- Cấu trúc Khung chương trình GDPT 2018
├── 📁 03_ASSETS/                     <-- Kho ảnh, Icon, Template 3D (.glb), Uploads
├── 📁 04_PROOFS_LEAN4/               <-- Các file định lý kiểm định Lean 4 (.lean)
├── 📁 05_EXPORTS_5512/               <-- File Word (.docx), Slide (.pptx), PDF A4 đã xuất
├── 📁 agents/                        <-- 10 AI Agents chuyên biệt (Module Python)
│   ├── agent_1_content.py
│   ├── agent_2_media.py
│   ├── agent_3_gamification.py
│   ├── agent_4_5_6_teacher.py
│   ├── agent_7_layout.py
│   ├── agent_8_socratic.py
│   └── agent_9_parent.py
├── 📁 services/                      <-- Dịch vụ Backend, Auth & Cơ sở dữ liệu
│   ├── db_service.py
│   ├── lean4_kernel.py
│   ├── auth_service.py
│   ├── export_service.py
│   └── notification_service.py
├── 📁 pages/                         <-- Giao diện 4 Cổng tên miền Streamlit
│   ├── student_portal.py (bandohoctap.vn)
│   ├── parent_portal.py  (uocmocuacon.vn)
│   ├── teacher_portal.py (giaovien.yourdream.vn)
│   └── admin_console.py  (yourdream.vn)
├── 📁 local_data/                    <-- Kho 2.450 Nút tri thức JSON
├── 📄 app.py                         <-- Trạm điều hướng mặt tiền (Domain Router)
├── 📄 AGENTS.md                      <-- Hiến chương kiểm soát AI
└── 🗄️ yourdream.db                   <-- SQLite Single Source of Truth (64.000 Học liệu)
```

### 3.2. Quy Hoạch 16 Module Cốt Lõi Tinh Gọn (300 - 800 LOC/tệp)
| Nhóm Chức Năng | STT | Tệp Module Kỹ Thuật | Vai Trò & Chức Năng Cốt Lõi | LOC Dự Kiến |
| :--- | :---: | :--- | :--- | :---: |
| **I. Hạ Tầng & Dữ Liệu** | **1** | `app.py` | **Trạm Blank Canvas Router:** Phân luồng 4 cổng tên miền, chứa Nút Camera WebRTC, tích hợp Client-Side Rendering. | **~450 LOC** |
| | **2** | `services/db_service.py` | **DAO SQLite & 64k Items:** Truy vấn <5ms kho 64.000 học liệu & 2.450 nút tri thức, tích hợp Semantic Cache. | **~850 LOC** |
| | **3** | `services/auth_service.py` | **Phân quyền RBAC:** Khóa quyền "Tạo mới" của Giáo viên, bảo mật PIN 1234 Phụ huynh. | **~350 LOC** |
| **II. Hạt Nhân & Dịch Vụ** | **4** | `services/lean4_kernel.py` | **Hạt nhân Lean 4:** Bảo chứng toán học hình thức, khóa Barem 0.25đ & Bẫy số 0. | **~350 LOC** |
| | **5** | `services/export_service.py` | **Bộ xuất bản 1-Click:** Tự động sinh Word CV 5512, Slide PPTX, Đề thi PDF A4. | **~700 LOC** |
| | **6** | `services/notification_service.py` | **Dịch vụ thông báo & Async Queue:** Cảnh báo Bánh xe cuộc đời, Zalo ZNS, Redis Queue đẩy điểm số ngầm. | **~400 LOC** |
| **III. Hệ Thống 10 AI Agents** | **7** | `agents/agent_1_content.py` | **Agent 1 (Content Architect):** Quản lý DAG 2.450 Nút tri thức & mở khóa Fog-of-War. | **~650 LOC** |
| | **8** | `agents/agent_2_media.py` | **Agent 2 (Media Conductor):** Nạp Visual Novel, Edge-TTS, Video Cứu Trợ 30s, Graceful Degradation (SVG 3KB). | **~600 LOC** |
| | **9** | `agents/agent_3_gamification.py` | **Agent 3 (Gamification Engine):** Ví Gems Nghị Lực, thăng cấp Linh thú, Confetti. | **~500 LOC** |
| | **10** | `agents/agent_7_layout.py` & `agent_8_socratic.py` | **Agent 7 & 8 (Vision/Socratic):** OCR ảnh chụp camera, Kính lúp Barem 0.25đ & Giàn giáo 3 nấc. | **~800 LOC** |
| | **11** | `agents/agent_9_parent.py` & `agent_10_lifeskills.py` | **Agent 9 & 10 (Parent Co-Pilot):** Bánh xe cuộc đời 8 nan hoa & Kịch bản thấu cảm bữa tối. | **~850 LOC** |
| | **12** | `agents/agent_4_5_6_teacher.py` | **Agent 4, 5 & 6 (Teacher Studio):** Bốc cào 64.000 học liệu, tự động xuất Word/PPTX/PDF. | **~850 LOC** |
| **IV. Giao Diện 4 Cổng Tên Miền** | **13** | `pages/student_portal.py` | **Cổng Học Sinh (`bandohoctap.vn`):** Sơ đồ Nơ-ron 3D 120Hz, Visual Novel, Phòng 3A, Tự động suy giảm chất lượng SVG khi quá tải. | **~600 LOC** |
| | **14** | `pages/parent_portal.py` | **Cổng Phụ Huynh (`uocmocuacon.vn`):** Canvas Bánh xe cuộc đời, Bức tường điều ước, PIN 1234. | **~500 LOC** |
| | **15** | `pages/teacher_portal.py` | **Cổng Giáo Viên (`giaovien.yourdream.vn`):** Studio sửa/tải học liệu, Visual Editing Toolbar. | **~500 LOC** |
| | **16** | `pages/admin_console.py` | **Cổng Quản Trị (`yourdream.vn`):** Quản trị kho 64.000 học liệu gốc, Lean 4 Audit Logs. | **~500 LOC** |

---

## 4. LUỒNG VẬN HÀNH EVENT-DRIVEN KHI GIÁO VIÊN BẤM NÚT CHỤP ẢNH

```text
[📸 Nút Chụp Ảnh Camera WebRTC trên Trang Web Trắng]
       │
       ▼ (Sự kiện Chụp Ảnh được gửi tới Backend Python)
[🧠 Agent 8 (Vision OCR)] ──► Nhận diện: Khối lớp, Môn học, Chủ đề & Dạng bài
       │
       ▼ (Mã Nút Tri Thức Gốc: K12_G07_MATH_009)
[🗄️ Agent 1 & Agent 4 (Worksheet Engine)] ──► Truy vấn <5ms trong Kho 64.000 Học liệu SQLite (Semantic Cache)
       │
       ▼ (Trả về Bộ bài tập & Barem 4 bước 0.25đ)
[🛡️ Lean 4 Kernel] ──► Kiểm định toán học hình thức: Khóa Barem & Cảnh báo Bẫy số 0
       │
       ▼ (Hiển thị Live Preview)
[📄 Agent 5 (Teacher Studio)] ──► 1-Click Xuất bản: Word CV 5512 / Slide PPTX / PDF A4 Print
```

---

## 5. MÔ HÌNH DỮ LIỆU SỜ ĐỒ SQLITE & 64.000 HỌC LIỆU OFFLINE

### 5.1. Bảng Dữ Liệu `learning_items` Trục Cột (~50MB SQLite)
```sql
-- Bảng quản lý 64.000 Học liệu / Bài tập nhân bản từ 2.450 Nút gốc
CREATE TABLE IF NOT EXISTS learning_items (
    item_id TEXT PRIMARY KEY,           -- Mã học liệu (VD: ITEM_G07_MATH_009_V01)
    node_id TEXT NOT NULL,              -- Khóa ngoại kết nối kho 2.450 Nút gốc
    item_type TEXT,                     -- 'quiz', 'barem_step', 'stem_param', 'slide_content'
    title TEXT,                         -- Tiêu đề bài tập
    content_json TEXT,                  -- Đề bài, Đáp án Barem 4 bước 0.25đ, Bẫy số 0
    created_by_admin INTEGER DEFAULT 1, -- 1: Master Admin, 0: Bản sửa của Giáo viên
    is_edited INTEGER DEFAULT 0,        -- Đã qua chỉnh sửa hay chưa
    FOREIGN KEY (node_id) REFERENCES atomic_nodes (node_id)
);

-- Index tối ưu tốc độ truy vấn <5ms
CREATE INDEX IF NOT EXISTS idx_node_items ON learning_items(node_id);
```

---

## 6. LỘ TRÌNH TRIỂN KHAI 5 GIAI ĐOẠN (MODULAR SDLC)

### 📍 GIAI ĐOẠN 1: MỎ NEO NGỮ CẢNH & KHUNG VAULT OBSIDIAN
* Khởi tạo tệp chỉ thị `AGENTS.md` v2 đầy đủ quy tắc Blank Canvas và RBAC.
* Thiết lập toàn bộ cấu trúc thư mục Obsidian Vault từ `00_INBOX` đến `05_EXPORTS_5512` trên PowerShell.

### 📍 GIAI ĐOẠN 2: HẠT NHÂN LEAN 4 KERNEL & KHO 64.000 HỌC LIỆU SQLITE
* Biên dịch `services/lean4_kernel.py` bảo chứng Barem 0.25đ.
* Khởi chạy `build_atomic_nodes.py` để sinh và nạp 2.450 Nút gốc + 64.000 Học liệu vào `yourdream.db`.

### 📍 GIAI ĐOẠN 3: XÂY DỰNG HE THỐNG 10 AI AGENTS MAI PHỤC NGẦM
* Viết mã nguồn cho 10 module Agent trong `agents/` (`agent_1` đến `agent_10`).
* Tích hợp Agent 8 (Vision AI) để đọc dữ liệu ảnh chụp từ Camera WebRTC.

### 📍 GIAI ĐOẠN 4: THIẾT LẬP ROUTER APP.PY BLANK CANVAS & VISUAL EDITOR
* Viết `app.py` chứa giao diện trang web trắng + 1 Nút Chụp Ảnh Camera.
* Tích hợp Lớp phủ Chỉnh sửa Trực quan (Visual Editing Toolbar) vào Cổng Giáo Viên.

### 📍 GIAI ĐOẠN 5: KIỂM THỬ OFFLINE, XUẤT BẢN 1-CLICK & QA TOÀN DIỆN
* Kiểm thử tốc độ xuất phiếu bài tập Word CV 5512, Slide PPTX và PDF A4 (<2 giây).
* Kiểm thử chịu tải kháng tắc nghẽn đỉnh điểm 10.000 học sinh (Semantic Caching & Graceful Degradation).
* Đóng gói dự án sẵn sàng vận hành 100% Offline trên máy tính.

---

### 💻 CÂU LỆNH POWERSHELL KHỞI CHẠY DỰ ÁN TRÊN WINDOWS
```powershell
# Chạy trạm điều hướng Blank Canvas 4 Cổng tên miền
cd /d D:\YOURDREAM.VN
streamlit run app.py --server.port 8501
```
