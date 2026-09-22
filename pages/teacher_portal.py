# -*- coding: utf-8 -*-
"""
Pages: Teacher Portal (Cổng Giáo Viên - Phòng 1)
Định vị: .\pages\teacher_portal.py
Tiêu chuẩn: Stateless | Infra-Diagnostic | Badge Identity | Zero-Disk I/O
"""

import streamlit as st
import sys
from pathlib import Path

# =====================================================================
# 1. THIẾT LẬP LÔ CỐT & KHUNG CHẨN ĐOÁN HẠ TẦNG (Fail-Fast)
# =====================================================================
BASE_DIR = Path(r".")
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# Khởi tạo cờ trạng thái hạ tầng
infra_status = {"agent_4": False, "agent_5": False, "agent_6": False, "missing": []}

try:
    from agents.agent_4_search import agent_search as agent_4
    infra_status["agent_4"] = True
    
    from agents.agent_5_patch import agent_patch as agent_5
    infra_status["agent_5"] = True
    
    from agents.agent_6_export import agent_export as agent_6
    infra_status["agent_6"] = True
    
except ImportError as e:
    missing_module = str(e).split("'")[1] if "'" in str(e) else str(e)
    infra_status["missing"].append(missing_module)

def render_teacher_portal(teacher_id: str = "GV_SOGD_HN_1029") -> dict:
    """Render Giao diện Cổng Giáo Viên với các Agent Độc lập"""
    # Chuẩn hóa Chuỗi Định danh (Chống đứt gãy khóa ngoại)
    clean_teacher_id = str(teacher_id).strip().upper()

    st.markdown("## 👨‍🏫 CỔNG GIÁO VIÊN — TEACHER STUDIO")
    st.caption("Không Gian Soạn Bài & Xuất Bản Học Liệu 1-Click | Hệ Thống EduMap Art")

    # =========================================================================
    # KHUNG CHẨN ĐOÁN HẠ TẦNG (INFRASTRUCTURE DIAGNOSTIC BOX)
    # =========================================================================
    if infra_status["missing"]:
        st.error("🚨 **[TỬ HUYỆT] HỆ THỐNG MẤT KẾT NỐI VỚI CÁC LÕI ĐỘNG CƠ**")
        st.markdown(f"**Tác tử bị khuyết:** `{', '.join(infra_status['missing'])}`")
        st.info("Vui lòng kiểm tra lại thư mục `agents/`. Hệ thống đã tự động đóng băng các tính năng để bảo vệ CSDL.")
        if st.button("🔄 Tải lại Trạm Giáo viên"):
            st.rerun()
        st.stop()

    # Trạm Kết nối Trạng thái
    if "active_teacher_node" not in st.session_state:
        st.session_state["active_teacher_node"] = None
    if "search_results" not in st.session_state:
        st.session_state["search_results"] = []

    st.markdown("---")

    # =========================================================================
    # 2. TRẠM BỐC CÀO HỌC LIỆU (AGENT 4 - ĐỘC LẬP)
    # =========================================================================
    st.markdown("### 🔍 TRẠM BỐC CÀO HỌC LIỆU SIÊU TỐC")
    
    col_q1, col_q2, col_q3, col_q4 = st.columns([2, 2, 4, 2])
    with col_q1:
        selected_grade = st.selectbox("Khối Lớp:", options=[6, 7, 8, 9, 10, 11, 12], index=3)
    with col_q2:
        selected_subject = st.selectbox("Môn Học:", options=["Toán", "Ngữ Văn", "Tiếng Anh", "KHTN"], index=0)
    with col_q3:
        search_kw = st.text_input("Từ khóa tìm kiếm:")
    with col_q4:
        st.write("")
        st.write("")
        if st.button("Truy vấn CSDL", use_container_width=True):
            with st.spinner("Đang quét chỉ mục B-Tree..."):
                # Gọi Agent 4 độc lập, trả về thêm cờ is_patched
                st.session_state["search_results"] = agent_search.query_master_db(
                    teacher_id=clean_teacher_id,
                    grade=selected_grade, 
                    subject=selected_subject, 
                    keyword=search_kw
                )
                st.session_state["active_teacher_node"] = None 

    results = st.session_state["search_results"]
    if results:
        st.success(f"📦 Tìm thấy {len(results)} Nút Tri Thức.")
        for item in results[:5]:
            n_id = item.get("node_id")
            title = item.get("lesson_title", n_id)
            is_patched = item.get("is_patched", False)
            
            # Huy hiệu Nhận diện Bản vá
            badge = "🛡️ [BẢN VÁ CÁ NHÂN HÓA]" if is_patched else "🏛️ [DỮ LIỆU GỐC MASTER]"
            btn_label = f"🎯 [ĐANG CHỌN] {badge} {title}" if n_id == st.session_state["active_teacher_node"] else f"{badge} {title}"
            
            if st.button(btn_label, key=f"btn_tch_{n_id}"):
                st.session_state["active_teacher_node"] = n_id
                st.rerun()

    st.markdown("---")

    # =========================================================================
    # 3. BỘ SOẠN THẢO BẢN VÁ LOCAL OVERRIDES (AGENT 5 - ĐỘC LẬP)
    # =========================================================================
    st.markdown("### ✏️ BỘ SOẠN THẢO BẢN VÁ ĐỘC LẬP")
    
    active_node = st.session_state["active_teacher_node"]
    
    if not active_node:
        st.info("👈 Hãy chọn một Nút Tri Thức từ bảng kết quả tìm kiếm để tiến hành tinh chỉnh.")
    else:
        active_item_data = next((x for x in results if x.get("node_id") == active_node), {})
        
        with st.form("override_form"):
            st.markdown(f"**Đang tinh chỉnh cho Nút:** `{active_node}` (Định danh GV: `{clean_teacher_id}`)")
            
            col_e1, col_e2 = st.columns(2)
            with col_e1:
                custom_title = st.text_input("Tiêu đề bài học tinh chỉnh:", value=active_item_data.get("lesson_title", ""))
                custom_note = st.text_area("Ghi chú Sư phạm cá nhân:", placeholder="Ghi chú dành riêng cho lớp...")
            with col_e2:
                barem_s1 = st.text_area("Barem Bước 1 (0.25đ):", value=active_item_data.get("barem_step_1", ""))
                trap_desc = st.text_area("Bẫy ngộ nhận số 0:", value=active_item_data.get("trap_zero_description", ""))

            # Stateless Overrides: Dữ liệu bay thẳng vào CSDL, không lưu biến cục bộ
            if st.form_submit_button("💾 Lưu Bản Vá (Local Override)"):
                patch_payload = {
                    "lesson_title": custom_title,
                    "teacher_note": custom_note,
                    "barem_step_1": barem_s1,
                    "trap_zero_description": trap_desc
                }
                patch_res = agent_patch.apply_patch(clean_teacher_id, active_node, patch_payload)
                if patch_res.get("status") == "SUCCESS":
                    st.success("✅ Đã lưu bản vá! Vui lòng bấm 'Truy vấn CSDL' lại để cập nhật Huy hiệu.")
                else:
                    st.error("Lỗi khi lưu bản vá!")

        # =========================================================================
        # 4. TRUNG TÂM XUẤT BẢN 1-CLICK (AGENT 6 - ĐỘC LẬP, ZERO-DISK I/O)
        # =========================================================================
        st.markdown("### 🚀 TRUNG TÂM XUẤT BẢN 1-CLICK (IN-MEMORY)")
        
        col_exp_opt, col_exp_btn = st.columns([3, 1])
        with col_exp_opt:
            chosen_format = st.selectbox("Định dạng xuất bản:", options=["WORD_CV5512", "PDF_A4_PRINT"])
        with col_exp_btn:
            st.write("")
            st.write("")
            if st.button("📦 Xuất Bản Ngay", use_container_width=True):
                with st.spinner("Đang đúc tệp trên RAM (Zero-Disk I/O)..."):
                    export_res = agent_export.export_lesson_plan_bytes(clean_teacher_id, active_node, chosen_format)
                    if export_res.get("status") == "SUCCESS":
                        # Cung cấp nút tải xuống trực tiếp từ luồng byte trên RAM
                        st.download_button(
                            label=f"⬇️ Tải xuống {export_res.get('file_name')}",
                            data=export_res.get("file_bytes"),
                            file_name=export_res.get("file_name"),
                            mime=export_res.get("mime_type")
                        )
                    else:
                        st.error("Lỗi xuất bản học liệu.")

    return {"status": "SUCCESS", "teacher_id": clean_teacher_id}

if __name__ == "__main__":
    render_teacher_portal()