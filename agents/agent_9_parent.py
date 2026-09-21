# -*- coding: utf-8 -*-
"""
Lõi: Agent 09 - Parent Empathy (Thấu Cảm Phụ Huynh)
Định vị: D:\YOURDREAM.VN\agents\agent_9_parent.py
Chức năng: Sinh kịch bản "Bữa tối thấu cảm" dựa trên dữ liệu học tập (Stateless).
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(r"D:\YOURDREAM.VN\yourdream.db")

class AgentParent:
    def __init__(self):
        self.db_path = DB_PATH

    def _fetch_student_context(self, student_id: str) -> dict:
        """Kéo dữ liệu tổng quan của học sinh từ CSDL Master (Zero Disk I/O)."""
        if not self.db_path.exists():
            return {"error": "CSDL rỗng hoặc chưa được khởi tạo."}
            
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            # Kéo tổng số lượng bài học để làm dữ liệu nền
            cursor.execute("SELECT COUNT(*) FROM atomic_nodes")
            total_nodes = cursor.fetchone()[0]
            conn.close()
            
            return {
                "student_id": student_id,
                "streak_days": 7,  # Sẽ được cập nhật dữ liệu thật từ Wheel Service
                "nodes_mastered": 5,
                "total_nodes_in_db": total_nodes,
                "recent_struggle": "Bẫy ngộ nhận số 0"
            }
        except Exception as e:
            return {"error": str(e)}

    def generate_empathy_dinner_topic(self, student_id: str) -> dict:
        """Trả về cấu trúc JSON kịch bản thấu cảm để Streamlit render."""
        context = self._fetch_student_context(student_id)
        
        if "error" in context:
            return {
                "status": "FAIL",
                "topic": "Hệ thống đang bảo trì",
                "suggested_questions": [],
                "things_to_avoid": "Vui lòng đợi hệ thống kết nối lại CSDL."
            }

        return {
            "status": "SUCCESS",
            "topic": f"Gắn kết Bữa Tối - Con đã học {context['streak_days']} ngày liên tục!",
            "suggested_questions": [
                "Hôm nay con thấy bài toán có điểm gì thú vị không?",
                "Mẹ thấy dạo này con rất kiên trì, điều gì làm con vui nhất khi giải xong bài?"
            ],
            "things_to_avoid": "Tuyệt đối không hỏi điểm số hay so sánh với bạn bè. Trọng tâm là sự nỗ lực, không phải kết quả.",
            "raw_context_used": context
        }

agent_parent = AgentParent()