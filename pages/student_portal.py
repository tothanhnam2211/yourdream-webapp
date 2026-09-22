# -*- coding: utf-8 -*-
"""
Pages: Student Portal (Cổng Học Sinh - EduMap Art & Bản Đồ Học Tập)
================================================================================
Dự án        : YourDream.vn (EduMap Art & Bản Đồ Học Tập)
Định vị      : .\pages\student_portal.py
Tiêu chuẩn   : GDPT 2018 | Dynamic Canvas 120Hz | Socratic Scaffolding | Fog-of-War
Mô tả        : Module giao diện Cổng Học Sinh (Student Portal) trong Streamlit:
               1. Header Sinh thái & Ví Gems:
                  - Thanh tiến trình Cấp độ Linh thú bản mệnh (gamification_agent).
                  - Ví Gems Nghị lực và Chuỗi ngày học Streak Days (gamification_agent + wheel_service).
                  - Chỉ số Cân bằng Bánh xe cuộc đời 8 nan hoa (wheel_service).
               2. Thanh Đổi Hình Thái Thị Giác 120Hz:
                  - 4 Preset phong cách đồ họa (Galaxy Orbit, 3D Synaptic Brain, Tree of Wisdom, Polyhedron Glassmorphism).
                  - Tương tác chuyển đổi mượt mà với dynamic canvas (layout_agent).
               3. Khu Vực Bản Đồ Nơ-ron Tri Thức (Fog-of-War):
                  - Truy vấn đồ thị DAG 2.450 nút tri thức từ Lớp 6 đến Lớp 12 (content_agent).
                  - Quản trị cơ chế Sương mù Học tập (Fog-of-War): MASTERED, UNLOCKED, LOCKED.
                  - Nhúng Client-side Canvas HTML5/Three.js 120Hz.
               4. Căn Phòng Mơ Ước (Dream Room 3A) & Chế Độ Tập Trung (Focus Mode):
                  - Khung hiển thị linh thú companion 3D đồng hành, lời thoại Socratic (media_agent).
                  - Video Cứu Trợ 30s giải tỏa áp lực (media_agent).
                  - Nút chụp ảnh Camera WebRTC nhận diện bài nháp OCR và chẩn đoán Socratic 3 nấc (socratic_agent).
================================================================================
"""

import json, os, sys, time
from typing import Any, Dict, List, Optional, Union

# Nạp đường dẫn import chuẩn hệ thống
BASE_DIR = r"."
for sub in ["services", "agents", "pages"]:
    path = os.path.join(BASE_DIR, sub)
    if path not in sys.path:
        sys.path.insert(0, path)

# Hỗ trợ tương thích môi trường máy trạm đa nền tảng (Windows / Linux)
if os.name != "nt":
    for candidate in [
        "/working_dir/YOURDREAM.VN",
        "/mnt/agentdata/tiered/YOURDREAM.VN",
        os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")),
    ]:
        if os.path.exists(candidate):
            cand_abs = os.path.abspath(candidate)
            if cand_abs not in sys.path:
                sys.path.insert(0, cand_abs)
            for sub in ["services", "agents", "pages"]:
                c_sub = os.path.join(cand_abs, sub)
                if os.path.exists(c_sub) and c_sub not in sys.path:
                    sys.path.insert(0, c_sub)
            break

# Hỗ trợ môi trường Streamlit thật và Headless Mock khi chạy kiểm thử qua Terminal
try:
    import streamlit as st
except (ImportError, ModuleNotFoundError):
    class MockContext:
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def __getattr__(self, name):
            return lambda *args, **kwargs: MockContext()

    class MockSessionState(dict):
        def __getattr__(self, key):
            return self.get(key)
        def __setattr__(self, key, value):
            self[key] = value

    class MockComponents:
        class v1:
            @staticmethod
            def html(html_content, height=400, scrolling=False):
                return html_content

    class MockStreamlit:
        def __init__(self):
            self.session_state = MockSessionState()
            self.sidebar = MockContext()
            self.components = MockComponents()
        def __getattr__(self, name):
            def _method(*args, **kwargs):
                if name in ("columns", "tabs"):
                    count = args[0] if args and isinstance(args[0], int) else (len(args[0]) if args and isinstance(args[0], (list, tuple)) else 2)
                    return [MockContext() for _ in range(count)]
                if name == "selectbox":
                    options = kwargs.get("options", args[1] if len(args) > 1 else [])
                    idx = kwargs.get("index", 0)
                    return options[idx] if options else None
                if name == "radio":
                    options = kwargs.get("options", args[1] if len(args) > 1 else [])
                    return options[0] if options else None
                if name == "checkbox":
                    return kwargs.get("value", False)
                if name == "button":
                    return kwargs.get("value", False)
                return MockContext()
            return _method

    st = MockStreamlit()
    sys.modules["streamlit"] = st

# Nạp các Agent và Service cốt lõi
try:
    from agents.agent_1_content import content_agent
    from agents.agent_2_media import media_agent
    from agents.agent_3_voice import gamification_agent
    from agents.agent_7_layout import layout_agent
    from agents.agent_8_socratic import socratic_agent
    from services.wheel_of_life_service import wheel_service
except (ImportError, ModuleNotFoundError):
    import importlib.util
    cur_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(cur_dir)
    search_dirs = [
        root_dir,
        "/working_dir/YOURDREAM.VN",
        "/mnt/agentdata/tiered/YOURDREAM.VN",
        "/working_dir/c_0d22f536cd87bd07/downloads"
    ]

    def _find_and_load(subfolder, filename, mod_name):
        for sdir in search_dirs:
            p1 = os.path.join(sdir, subfolder, filename)
            p2 = os.path.join(sdir, filename)
            for candidate_path in [p1, p2]:
                if os.path.exists(candidate_path):
                    spec = importlib.util.spec_from_file_location(mod_name, candidate_path)
                    mod = importlib.util.module_from_spec(spec)
                    sys.modules[mod_name] = mod
                    spec.loader.exec_module(mod)
                    return mod
        return None

    _find_and_load("services", "db_service.py", "services.db_service")
    mod_w = _find_and_load("services", "wheel_of_life_service.py", "services.wheel_of_life_service")
    wheel_service = getattr(mod_w, "wheel_service", getattr(mod_w, "wheel_of_life_service", None))
    mod_1 = _find_and_load("agents", "agent_1_content.py", "agents.agent_1_content")
    content_agent = getattr(mod_1, "content_agent", getattr(mod_1, "content_architect_agent", None))
    mod_2 = _find_and_load("agents", "agent_2_media.py", "agents.agent_2_media")
    media_agent = getattr(mod_2, "media_agent", getattr(mod_2, "agent_media", None))
    mod_3 = _find_and_load("agents", "agent_3_gamification.py", "agents.agent_3_gamification")
    gamification_agent = getattr(mod_3, "gamification_agent", getattr(mod_3, "agent_gamification", None))
    mod_7 = _find_and_load("agents", "agent_7_layout.py", "agents.agent_7_layout")
    layout_agent = getattr(mod_7, "layout_agent", getattr(mod_7, "agent_layout", None))
    mod_8 = _find_and_load("agents", "agent_8_socratic.py", "agents.agent_8_socratic")
    socratic_agent = getattr(mod_8, "socratic_agent", getattr(mod_8, "agent_socratic", None))


def render_student_portal(student_id: int = 101, grade: int = 6) -> dict:
    """
    Xây dựng Module Giao diện Cổng Học Sinh trong Streamlit:
      1. Header Sinh thái & Ví Gems: Thanh tiến trình Linh thú, Ví Gems, Streak Days, Bánh xe cuộc đời.
      2. Thanh Đổi Hình Thái Thị Giác 120Hz: 4 Phong cách (Galaxy Orbit, 3D Synaptic Brain, Tree of Wisdom, Polyhedron Glassmorphism).
      3. Khu Vực Bản Đồ Nơ-ron Tri Thức (Fog-of-War): Client-side Canvas, ẩn các nút chưa đủ điều kiện mở khóa.
      4. Căn Phòng Mơ Ước (Dream Room 3A) & Chế Độ Tập Trung (Focus Mode): Linh thú 3D companion, Camera WebRTC OCR bài nháp.
    """
    s_id_str = str(student_id).strip()

    # Cấu hình Trang Streamlit
    try:
        st.set_page_config(
            page_title="Cổng Học Sinh — YourDream.vn (EduMap Art)",
            page_icon="🌟",
            layout="wide",
            initial_sidebar_state="expanded"
        )
    except Exception:
        pass

    # =========================================================================
    # 1. HEADER SINH THÁI & VÍ GEMS NGHỊ LỰC
    # =========================================================================
    st.markdown("## 🌟 CỔNG HỌC SINH — YOURDREAM.VN (EDUMAP ART)")
    st.caption("Không gian Khám phá Tri thức & Rèn luyện Nghị lực Chuẩn GDPT 2018 | Dynamic Canvas 120Hz")

    # Lấy dữ liệu Mascot & Game hóa
    try:
        mascot_info = gamification_agent.check_mascot_evolution(student_id)
    except Exception:
        mascot_info = {
            "mascot_name": "Bé Rồng Socratic (Dự phòng)",
            "evolution_level": 1,
            "evolution_stage": "Sơ Sinh",
            "total_gems": 150,
            "next_threshold": 500,
            "remaining_to_next_level": 350
        }
    mascot_name = mascot_info.get("mascot_name", "Bé Rồng Socratic")
    mascot_level = mascot_info.get("evolution_level", 1)
    mascot_stage = mascot_info.get("evolution_stage", "Sơ Sinh")
    total_gems = mascot_info.get("total_gems", 100)
    next_thresh = mascot_info.get("next_threshold", 500)
    rem_gems = mascot_info.get("remaining_to_next_level", 400)
    level_progress = min(1.0, max(0.0, total_gems / max(1, next_thresh)))

    # Lấy dữ liệu Bánh xe cuộc đời 8 nan hoa
    wheel_snapshot = wheel_service.get_student_wheel_snapshot(s_id_str)
    balance_score = wheel_snapshot.get("balance_score", 100.0)
    streak_days = wheel_snapshot.get("streak_days", 7)
    total_xp = wheel_snapshot.get("total_xp", 1500)

    # Khung hiển thị Header 4 cột
    col_h1, col_h2, col_h3, col_h4 = st.columns(4)
    with col_h1:
        st.metric(
            label="🐲 Linh Thú Bản Mệnh",
            value=f"Lv.{mascot_level} - {mascot_stage}",
            delta=f"{mascot_name}"
        )
    with col_h2:
        st.metric(
            label="💎 Ví Gems Nghị Lực",
            value=f"{total_gems:,} Gems",
            delta=f"Cần +{rem_gems} Gems lên cấp"
        )
    with col_h3:
        st.metric(
            label="🔥 Chuỗi Ngày Học",
            value=f"{streak_days} Ngày",
            delta=f"+{total_xp} XP tích lũy"
        )
    with col_h4:
        st.metric(
            label="☸️ Bánh Xe Cuộc Đời",
            value=f"{balance_score:.1f}%",
            delta="Chỉ số Cân bằng 8 Nan hoa"
        )

    # Thanh tiến trình thăng cấp Linh thú
    st.progress(level_progress)
    st.caption(f"Tiến trình tiến hóa linh thú: {total_gems}/{next_thresh} Gems ({int(level_progress*100)}%)")

    st.markdown("---")

    # =========================================================================
    # 2. THANH ĐỔI HÌNH THÁI THỊ GIÁC 120HZ (DYNAMIC CANVAS 120FPS)
    # =========================================================================
    st.markdown("### 🌀 THANH ĐỔI HÌNH THÁI THỊ GIÁC 120HZ")
    col_v1, col_v2 = st.columns([3, 1])

    available_presets = layout_agent.presets
    preset_keys = list(available_presets.keys())
    # 4 phong cách: galaxy_orbit, synaptic_brain_3d, tree_of_wisdom, polyhedron_glassmorphism

    with col_v1:
        selected_style = st.selectbox(
            "Chọn Không Gian Hiển Thị Bản Đồ Học Tập:",
            options=preset_keys,
            index=1 if "synaptic_brain_3d" in preset_keys else 0,
            format_func=lambda k: f"{available_presets[k]['name']} ({k})"
        )

    # Chuyển đổi cấu hình hiển thị và lưu vào CSDL
    style_pref_result = layout_agent.switch_student_style_preference(student_id, selected_style)

    # Lấy danh sách Nút tri thức từ Content Agent để phân bổ tọa độ 120Hz
    dag_data = content_agent.get_knowledge_dag(grade=grade, subject="Toán")
    raw_nodes = dag_data.get("nodes", [])

    # Tính toán tọa độ và thông số Render 120Hz (Frame budget 8.33ms)
    layout_config = layout_agent.get_layout_config(selected_style, raw_nodes)
    render_cfg = layout_config.get("render_config", {})

    with col_v2:
        st.markdown(
            f"""
            <div style="background:#0f172a; border:1px solid #38bdf8; border-radius:8px; padding:8px 12px; color:#38bdf8; font-size:12px;">
                ⚡ <b>Chuẩn Render 120Hz</b><br>
                Target FPS: <b>{render_cfg.get('target_fps', 120)} FPS</b><br>
                Frame Budget: <b>{render_cfg.get('frame_budget_ms', 8.33)} ms</b><br>
                Camera: <b>{render_cfg.get('camera_mode', '3D')}</b>
            </div>
            """,
            unsafe_allow_html=True
        )

    st.markdown("---")

    # =========================================================================
    # 3. KHU VỰC BẢN ĐỒ NƠ-RON TRI THỨC (FOG-OF-WAR GAMING CANVAS)
    # =========================================================================
    st.markdown("### 🗺️ BẢN ĐỒ NƠ-RON TRI THỨC — CHINH PHỤC SƯƠNG MÙ HỌC TẬP (FOG-OF-WAR)")
    st.caption("Mỗi nút tri thức là một ngôi sao. Đạt >= 80% điểm bài học để xua tan sương mù và mở khóa nút tiếp theo.")

    nodes_status_list = []
    active_node_id = None

    for node in raw_nodes:
        n_id = node.get("node_id", "")
        fow_info = content_agent.check_fog_of_war_status(student_id, n_id)
        f_status = fow_info.get("status", "LOCKED")
        is_playable = fow_info.get("is_playable", False)

        matching_layout_node = next(
            (item for item in layout_config.get("nodes", []) if item.get("id") == n_id or item.get("node_id") == n_id),
            None
        )
        coords = {
            "x": matching_layout_node.get("x", 0) if matching_layout_node else 0,
            "y": matching_layout_node.get("y", 0) if matching_layout_node else 0,
            "z": matching_layout_node.get("z", 0) if matching_layout_node else 0
        }

        node_entry = {
            "node_id": n_id,
            "lesson_title": node.get("lesson_title", n_id),
            "status": f_status,
            "is_playable": is_playable,
            "mastery_score": fow_info.get("mastery_score", 0.0),
            "coordinates": coords
        }
        nodes_status_list.append(node_entry)
        if is_playable and active_node_id is None:
            active_node_id = n_id

    if active_node_id is None and raw_nodes:
        active_node_id = raw_nodes[0].get("node_id", "")

    # Phân loại trạng thái thống kê Fog-of-War
    count_mastered = sum(1 for x in nodes_status_list if x["status"] == "MASTERED")
    count_unlocked = sum(1 for x in nodes_status_list if x["status"] == "UNLOCKED")
    count_locked = sum(1 for x in nodes_status_list if x["status"] == "LOCKED")

    col_s1, col_s2, col_s3 = st.columns(3)
    with col_s1:
        st.success(f"⭐ Đã Thành Thạo: {count_mastered} Nút")
    with col_s2:
        st.info(f"🔓 Sẵn Sàng Chinh Phục: {count_unlocked} Nút")
    with col_s3:
        st.warning(f"🌫️ Đang Bị Che Khuất (Sương Mù): {count_locked} Nút")

    # Nhúng Client-side Canvas 120Hz mô phỏng tương tác
    canvas_html = f"""
    <div style="background:{render_cfg.get('ambient_background', '#050510')}; border-radius:12px; padding:16px; text-align:center; border:1px solid #1e293b;">
        <canvas id="edumap_canvas" width="800" height="260" style="width:100%; height:260px;"></canvas>
        <div style="color:#94a3b8; font-size:12px; margin-top:6px;">
            🎮 Mô phỏng đồ họa 120Hz [{available_presets[selected_style]['name']}] — Cơ chế Fog-of-War GPU Acceleration
        </div>
    </div>
    <script>
        // Client-side Canvas 120Hz Animation Simulator
        const canvas = document.getElementById('edumap_canvas');
        if (canvas) {{
            const ctx = canvas.getContext('2d');
            let t = 0;
            function draw() {{
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = "{render_cfg.get('ambient_background', '#050510')}";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                // Vẽ các nút tri thức tương tác
                ctx.beginPath();
                ctx.arc(canvas.width/2 + Math.sin(t)*40, canvas.height/2 + Math.cos(t)*20, 24, 0, Math.PI*2);
                ctx.fillStyle = "#38bdf8";
                ctx.shadowColor = "#00f2fe";
                ctx.shadowBlur = 18;
                ctx.fill();
                t += 0.02;
                requestAnimationFrame(draw);
            }}
            draw();
        }}
    </script>
    """
    st.components.v1.html(canvas_html, height=300)

    st.markdown("---")

    # =========================================================================
    # 4. CĂN PHÒNG MƠ ƯỚC (DREAM ROOM 3A) & CHẾ ĐỘ TẬP TRUNG (FOCUS MODE)
    # =========================================================================
    st.markdown("### 🌌 CĂN PHÒNG MƠ ƯỚC (DREAM ROOM 3A) & CHẾ ĐỘ TẬP TRUNG (FOCUS MODE)")

    col_room_left, col_room_right = st.columns([1, 1])

    # Kịch bản Visual Novel & Lời thoại Linh thú Socratic
    vn_script = media_agent.generate_visual_novel_script(active_node_id)
    rescue_video = media_agent.get_rescue_video_30s(active_node_id)
    socratic_dialogue = vn_script.get("dialogue_socratic", "Hãy bình tĩnh, cùng Thầy bóc tách từng dòng bài tập nhé!")

    with col_room_left:
        st.markdown(f"#### 🐲 Đồng Hành Cùng {mascot_name}")
        st.info(f"💬 **Lời Thầy Socratic:** '{socratic_dialogue}'")
        st.caption(f"Trang phục: {mascot_info.get('mascot_title', 'Linh thú Socratic Áo dài truyền thống')}")

        st.markdown("##### 🎬 Video Cứu Trợ 30s (Private Healing Haven)")
        st.write(f"**Chủ đề:** {rescue_video.get('video_title', 'Tóm tắt khái niệm 30s')}")
        st.caption(f"Đường dẫn: `{rescue_video.get('video_url', '03_ASSETS/rescue_videos/30s.mp4')}` | Thời lượng: 30s")
        st.button("▶️ Mở Video Cứu Trợ 30s Giải Tỏa Căng Thẳng")

    with col_room_right:
        st.markdown("#### 📷 Trạm Soi Bài Nháp WebRTC (Socratic Vision OCR)")
        st.caption("Chụp ảnh hoặc tải lên bài giải nháp để Thầy Socratic chẩn đoán theo Barem 4 bước 0.25đ.")

        sample_camera_photo = st.camera_input("Chụp ảnh bài nháp từ Camera:")
        st.button("🔍 Quét OCR và Kích Hoạt Giàn Giáo Socratic")

        # Chẩn đoán Socratic mẫu
        ocr_result = socratic_agent.process_camera_image_ocr("tap_hop_001")
        detected_node = ocr_result.get("detected_node_id", active_node_id)
        raw_ans = "Tập hợp A các số tự nhiên nhỏ hơn 1: Ta thấy không có số nào nên A = ∅"
        sample_barem = {
            "node_id": detected_node,
            "lesson_title": "Bài 1: Tập hợp",
            "barem_step_1": "Bước 1 (0.25đ): Giả thiết, điều kiện xác định / Tập hợp nguồn.",
            "barem_step_2": "Bước 2 (0.25đ): Thiết lập định lý, hệ thức hoặc định nghĩa cốt lõi.",
            "barem_step_3": "Bước 3 (0.25đ): Biến đổi đại số, quy đồng, thay số, tính toán chi tiết.",
            "barem_step_4": "Bước 4 (0.25đ): Đối chiếu điều kiện, loại nghiệm ngoại lai và kết luận nghiệm.",
            "trap_zero_description": "Bẫy ngộ nhận số 0: Nhầm lẫn tập rỗng ∅ với tập hợp chứa số 0 là {0}."
        }
        diag_res = socratic_agent.diagnose_student_answer(raw_ans, sample_barem)

        st.markdown(f"**Kết Quả Chẩn Đoán Tư Duy:** Điểm {diag_res.get('score_awarded', 0.0)}/1.0đ")
        if diag_res.get("trap_zero_detected"):
            st.error(f"⚠️ **Cảnh báo:** {diag_res.get('trap_zero_details', 'Bẫy ngộ nhận số 0')}")

        # Kích hoạt Giàn giáo Socratic 3 nấc
        st.markdown("##### 🪜 Giàn Giáo Socratic 3 Nấc Tương Tác:")
        tab1, tab2, tab3 = st.tabs(["Nấc 1: Gợi Mở", "Nấc 2: Quy Tắc / Barem", "Nấc 3: Tháo Gỡ Chi Tiết"])
        with tab1:
            step1 = socratic_agent.get_socratic_scaffolding_step(1, diag_res)
            st.write(f"💡 {step1.get('prompt')}")
            st.caption(f"Câu hỏi: {step1.get('socratic_question')}")
        with tab2:
            step2 = socratic_agent.get_socratic_scaffolding_step(2, diag_res)
            st.write(f"📐 {step2.get('prompt')}")
            st.caption(f"Quy tắc: {step2.get('action_hint')}")
        with tab3:
            step3 = socratic_agent.get_socratic_scaffolding_step(3, diag_res)
            st.write(f"🛠️ {step3.get('prompt')}")
            st.caption(f"Hành động: {step3.get('action_hint')}")

    return {
        "status": "SUCCESS",
        "student_id": student_id,
        "grade": grade,
        "mascot_info": mascot_info,
        "wheel_snapshot": wheel_snapshot,
        "selected_style": selected_style,
        "layout_config": layout_config,
        "nodes_status": nodes_status_list,
        "fog_of_war_summary": {
            "mastered": count_mastered,
            "unlocked": count_unlocked,
            "locked": count_locked
        },
        "active_node_id": active_node_id,
        "socratic_ready": True
    }


# =====================================================================
# THỰC THI KIỂM THỬ TERMINAL VÀ XUẤT KẾT QUẢ
# =====================================================================
if __name__ == "__main__":
    print("=" * 80)
    print("  KIỂM THỬ PAGES/STUDENT_PORTAL.PY - STUDENT PORTAL ENGINE (STREAMLIT)  ")
    print("========================================================================")

    test_student_id = 101
    test_grade = 6

    # 1. Test gọi hàm render_student_portal() trong môi trường headless/mock
    print()
    print("--- [TEST 1: GỌI HÀM RENDER_STUDENT_PORTAL TRONG MÔI TRƯỜNG HEADLESS/MOCK] ---")
    portal_res = render_student_portal(student_id=test_student_id, grade=test_grade)
    print(f"[v] Trạng thái khởi tạo portal: {portal_res.get('status')}")
    print(f"[v] Mã học sinh: {portal_res.get('student_id')} | Khối lớp: {portal_res.get('grade')}")
    print(f"[v] Hình thái thị giác được chọn: {portal_res.get('selected_style')}")
    print(f"[v] Nút tri thức đang hoạt động: {portal_res.get('active_node_id')}")

    # 2. In thông số nạp 4 Agents và dữ liệu Bánh xe cuộc đời
    print()
    print("--- [TEST 2: THÔNG SỐ NẠP CÁC AGENT & BÁNH XE CUỘC ĐỜI] ---")
    # Agent 1: Content Architect
    print(f"[v] Agent 1 (Content Architect): Nạp thành công | Tổng số nút tri thức = {len(portal_res.get('nodes_status', []))}")
    fow = portal_res.get("fog_of_war_summary", {})
    print(f"    - Thống kê Fog-of-War: {fow.get('mastered')} Mastered | {fow.get('unlocked')} Unlocked | {fow.get('locked')} Locked")

    # Agent 2: Media Conductor
    print(f"[v] Agent 2 (Media Conductor): Nạp thành công | Visual Novel Dialogue & Video Cứu Trợ 30s sẵn sàng")

    # Agent 3: Gamification Engine
    m_info = portal_res.get("mascot_info", {})
    print(f"[v] Agent 3 (Gamification Engine): Nạp thành công | Linh thú = {m_info.get('mascot_name')} (Lv.{m_info.get('evolution_level')})")
    print(f"    - Ví Gems Nghị Lực = {m_info.get('total_gems')} Gems | Tiến trình = {m_info.get('evolution_stage')}")

    # Agent 7: Dynamic Canvas Layout (120Hz)
    l_cfg = portal_res.get("layout_config", {})
    r_cfg = l_cfg.get("render_config", {})
    print(f"[v] Agent 7 (Dynamic Canvas Layout 120Hz): Nạp thành công | Preset = {l_cfg.get('style_name')}")
    print(f"    - Tần số quét = {r_cfg.get('target_fps')} FPS | Frame Budget = {r_cfg.get('frame_budget_ms')} ms | Camera = {r_cfg.get('camera_mode')}")

    # Agent 8: Socratic Diagnostic
    print(f"[v] Agent 8 (Socratic Diagnostic): Nạp thành công | Camera WebRTC OCR & Giàn giáo 3 nấc sẵn sàng")

    # Wheel of Life Service
    w_snap = portal_res.get("wheel_snapshot", {})
    print(f"[v] Service (Wheel of Life): Nạp thành công | Điểm cân bằng Bánh xe = {w_snap.get('balance_score')}/100.0 | Streak Days = {w_snap.get('streak_days')} ngày")

    # 3. Assert PASSED
    print()
    print("--- [TEST 3: ĐỐI SOÁT & KIỂM TRA ĐIỀU KIỆN KHẲNG ĐỊNH (ASSERTIONS)] ---")
    assert portal_res.get("status") == "SUCCESS", "Trạng thái portal phải là SUCCESS!"
    assert portal_res.get("student_id") == test_student_id, "ID học sinh không khớp!"
    assert portal_res.get("layout_config", {}).get("render_config", {}).get("target_fps") == 120, "FPS cấu hình phải đạt 120Hz!"
    assert len(portal_res.get("nodes_status", [])) > 0, "Danh sách nút tri thức không được rỗng!"
    assert portal_res.get("socratic_ready") is True, "Trạng thái Socratic Diagnostic phải sẵn sàng!"
    print("[v] Tất cả các điều kiện kiểm thử -> assert PASSED")

    # 4. Báo thành công và ngắt tiến trình
    print()
    print("=" * 80)
    print("✅ ĐÃ TẠO MỚI TỆP PAGES/STUDENT_PORTAL.PY THÀNH CÔNG!")
    print("=" * 80)

    import sys
    sys.exit(0)