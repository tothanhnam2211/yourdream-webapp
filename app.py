# -*- coding: utf-8 -*-
"""
Lõi: Bộ Định Tuyến Trung Tâm (Central Router)
Định vị: .\app.py
Tiêu chuẩn: SPA (Single Page Application) | Fail-Fast Import | Session State Routing
"""

import streamlit as st
import sys
from pathlib import Path

# =====================================================================
# 1. THIẾT LẬP LÔ CỐT & CẤU HÌNH TRANG (Phải gọi đầu tiên)
# =====================================================================
st.set_page_config(
    page_title="EduMap Art | Central Router",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded"
)

BASE_DIR = Path(r".")
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# =====================================================================
# 2. KHỞI TẠO CƠ SỞ DỮ LIỆU ĐA LUỒNG
# =====================================================================
try:
    from services.db_service import db_local
    db_local.ket_noi_hop_nhat()
except Exception as e:
    st.error(f"🚨 [TỬ HUYỆT HỆ THỐNG] LỖI KHỞI TẠO CSDL LÕI: {e}")
    st.stop()

# =====================================================================
# 3. KHUNG GIÁM SÁT HẠ TẦNG GIAO DIỆN (Fail-Fast Import)
# =====================================================================
try:
    from pages.landing_portal import render_landing_portal
    from pages.student_portal import render_student_portal
    from pages.parent_portal import render_parent_portal
    from pages.teacher_portal import render_teacher_portal
except ImportError as e:
    st.error(f"🚨 [TỬ HUYỆT ĐỊNH TUYẾN] KHUYẾT MẢNH GHÉP GIAO DIỆN: {e}")
    st.info("Vui lòng kiểm tra lại cấu trúc thư mục `pages/`.")
    st.stop()

def main():
    # =========================================================================
    # CƠ CHẾ ĐIỀU HƯỚNG TRẠNG THÁI (ROUTER STATE)
    # =========================================================================
    if "current_page" not in st.session_state:
        st.session_state["current_page"] = "LANDING"

    # Định danh giả lập cho MVP (Sẽ được thay thế bởi Auth Service khi đăng nhập thật)
    student_id = "STD_001"
    parent_id = "PR_001"
    teacher_id = "GV_SOGD_HN_1029"

    # =========================================================================
    # THANH ĐIỀU KHIỂN CHUYỂN MẠCH BÊN TRÁI (SIDEBAR)
    # =========================================================================
    with st.sidebar:
        st.markdown("### 🎛️ BẢNG ĐIỀU PHỐI (ROUTER)")
        
        if st.button("🌟 Trang Chủ Sinh Thái", use_container_width=True):
            st.session_state["current_page"] = "LANDING"
            st.rerun()
            
        if st.button("🧭 Cổng Học Sinh", use_container_width=True):
            st.session_state["current_page"] = "STUDENT"
            st.rerun()
            
        if st.button("🏡 Cổng Phụ Huynh", use_container_width=True):
            st.session_state["current_page"] = "PARENT"
            st.rerun()
            
        if st.button("👨‍🏫 Cổng Giáo Viên", use_container_width=True):
            st.session_state["current_page"] = "TEACHER"
            st.rerun()

        st.markdown("---")
        st.caption("Lô cốt EduMap Art v2026 | Zero-Disk I/O | Fail-Fast")

    # =========================================================================
    # LÕI RENDER GIAO DIỆN (SPA DELEGATION)
    # =========================================================================
    page = st.session_state["current_page"]
    
    if page == "LANDING":
        render_landing_portal()
    elif page == "STUDENT":
        render_student_portal(student_id=student_id)
    elif page == "PARENT":
        render_parent_portal(student_id=student_id, parent_id=parent_id)
    elif page == "TEACHER":
        render_teacher_portal(teacher_id=teacher_id)
    else:
        st.error("LỖI ĐỊNH TUYẾN 404: Không tìm thấy phân hệ.")

if __name__ == "__main__":
    main()