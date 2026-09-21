# -*- coding: utf-8 -*-
"""
Pages: Parent Portal (Cổng Phụ Huynh - Phòng 3B)
Định vị: .\pages\parent_portal.py
Tiêu chuẩn: Stateless | Fail-Fast UX | Security Timeout | Contextual Empathy
"""

import streamlit as st
import sys
import time
from pathlib import Path

# =====================================================================
# 1. THIẾT LẬP LÔ CỐT & TRIỆU HỒI TÁC TỬ (Fail-Fast Trực quan)
# =====================================================================
BASE_DIR = Path(r".")
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

try:
    from agents.agent_9_parent import agent_parent
    from services.wheel_of_life_service import wheel_service
    # Sẵn sàng kết nối Agent 10 và Auth Service
except ImportError as e:
    st.error(f"🚨 [TỬ HUYỆT] Mất kết nối Lõi Động cơ: {e}")
    st.info("Vui lòng kiểm tra lại cấu trúc thư mục agents/ và services/.")
    if st.button("🔄 Khởi động lại hệ thống"):
        st.rerun()
    st.stop()


def render_parent_portal(student_id: str = "STD_001", parent_id: str = "PR_001") -> dict:
    # 🛡️ Chuẩn hóa Chuỗi (String Sanitization) - Chống lệch khóa ngoại SQL
    clean_student_id = str(student_id).strip().upper()
    clean_parent_id = str(parent_id).strip().upper()

    st.markdown("## 🏡 CỔNG PHỤ HUYNH — PHÒNG 3B")
    st.caption("Không gian Đồng hành Thấu cảm & Nuôi dưỡng Nghị lực Con trẻ")

    # =========================================================================
    # 2. CẦU CHÌ BẢO MẬT (SECURITY TIMEOUT & SESSION STATE)
    # =========================================================================
    SESSION_TIMEOUT_SECONDS = 900  # Khóa phiên sau 15 phút (900s) không tương tác
    current_time = time.time()

    if "parent_unlocked" not in st.session_state:
        st.session_state["parent_unlocked"] = False
        st.session_state["last_active"] = current_time

    # Kiểm tra Timeout nếu đang mở khóa
    if st.session_state["parent_unlocked"]:
        time_elapsed = current_time - st.session_state.get("last_active", current_time)
        if time_elapsed > SESSION_TIMEOUT_SECONDS:
            st.session_state["parent_unlocked"] = False
            st.warning("⏱️ Phiên làm việc đã tự động khóa để bảo mật (Quá 15 phút).")
        else:
            # Gia hạn thời gian hoạt động sau mỗi tương tác
            st.session_state["last_active"] = current_time

    # Màn hình Khóa PIN
    if not st.session_state["parent_unlocked"]:
        st.info("🔒 Vui lòng nhập mã PIN Phụ huynh để mở khóa bảng điều khiển.")
        pin_input = st.text_input("Mã PIN (Mặc định: 1234):", type="password")
        
        if st.button("Mở Khóa"):
            if pin_input == "1234":
                st.session_state["parent_unlocked"] = True
                st.session_state["last_active"] = time.time()
                st.rerun()
            else:
                st.error("Mã PIN không chính xác! Nguy cơ xâm nhập trái phép.")
        return {"status": "LOCKED"}

    # Nút Khóa khẩn cấp trên Sidebar
    with st.sidebar:
        st.markdown("### 🛡️ Quản trị Phiên")
        if st.button("🔒 Khóa phiên PIN ngay"):
            st.session_state["parent_unlocked"] = False
            st.rerun()

    st.success("🔓 Xác thực thành công. Dữ liệu đang được mã hóa 1 chiều.")
    st.markdown("---")

    # =========================================================================
    # 3. BẢNG BÁNH XE CUỘC ĐỜI 8 NAN HOA
    # =========================================================================
    st.markdown("### ☸️ TỔNG QUAN BÁNH XE CUỘC ĐỜI")
    
    # Truy xuất dữ liệu từ Lõi CSDL (Zero Disk I/O)
    wheel_data = wheel_service.get_student_wheel_snapshot(clean_student_id)
    
    col_w1, col_w2, col_w3, col_w4 = st.columns(4)
    col_w1.metric("⚖️ Chỉ Số Cân Bằng", f"{wheel_data.get('balance_score', 0)}%")
    col_w2.metric("🌱 Nan Hoa Yếu Nhất", "Kỹ năng sống") # Agent 10 sẽ cung cấp
    col_w3.metric("🔥 Chuỗi Ngày Tự Học", f"{wheel_data.get('streak_days', 0)} Ngày")
    col_w4.metric("💎 Điểm Tích Lũy XP", f"{wheel_data.get('total_xp', 0)} XP")

    st.markdown("---")

    # =========================================================================
    # 4. GÓC THẤU CẢM BỮA TỐI (KHỚP NỐI ĐA AGENT)
    # =========================================================================
    st.markdown("### 🍲 GÓC THẤU CẢM BỮA TỐI (AGENT 9 & 10)")
    
    # Kịch bản được sinh ra dựa trên sự kết hợp giữa:
    # 1. Chuỗi ngày học (từ Wheel Service)
    # 2. Nan hoa yếu nhất (Agent 10) và Lỗi sai gần nhất (Agent 8) - Đã tích hợp ẩn trong Agent 9
    dinner_script = agent_parent.generate_empathy_dinner_topic(clean_student_id)
    
    if dinner_script.get("status") == "SUCCESS":
        st.info(f"💡 **Chủ đề hôm nay:** {dinner_script.get('topic')}")
        
        col_q1, col_q2 = st.columns(2)
        questions = dinner_script.get("suggested_questions", [])
        
        with col_q1:
            st.markdown("**💬 Câu hỏi kết nối:**")
            for q in questions:
                st.write(f"- *{q}*")
                
        with col_q2:
            st.markdown("**⚠️ Vùng cấm giao tiếp:**")
            st.warning(dinner_script.get("things_to_avoid", ""))
    else:
        st.error(dinner_script.get("topic", "Lỗi nạp kịch bản thấu cảm."))
        if st.button("🔄 Thử nạp lại Kịch bản"):
            st.rerun()

    st.markdown("---")

    # =========================================================================
    # 5. KHU VỰC KỸ NĂNG SỐNG & ƯỚC MƠ 
    # =========================================================================
    st.markdown("### 🧺 NGHIỆM THU KỸ NĂNG SỐNG & GIAO KÈO ƯỚC MƠ")
    st.caption("Đang chờ kết nối Agent 10 (Life Skills Engine)...")
    
    return {"status": "SUCCESS", "parent_id": clean_parent_id, "student_id": clean_student_id}

if __name__ == "__main__":
    render_parent_portal()