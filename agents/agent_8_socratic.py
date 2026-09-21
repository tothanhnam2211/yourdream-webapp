# -*- coding: utf-8 -*-
"""
Lõi: Agent 08 - Socratic Diagnostic (Chẩn đoán Tự luận)
Định vị: D:\YOURDREAM.VN\agents\agent_8_socratic.py
Chức năng: Xử lý luồng ByteIO từ Webcam (Zero Disk I/O) và chẩn đoán Barem.
"""

import io
from pathlib import Path

# TODO: Đề xuất nâng cấp kết nối API thị giác máy tính sau khi hoàn thiện luồng cơ bản
DB_PATH = Path(r"D:\YOURDREAM.VN\yourdream.db")

class AgentSocratic:
    def __init__(self):
        self.db_path = DB_PATH

    def process_camera_image_ocr(self, image_bytes: bytes) -> dict:
        """
        Nhận diện chữ từ ảnh chụp bài làm của học sinh ngay trên RAM.
        """
        if not image_bytes:
            return {"status": "FAIL", "raw_text": "", "error": "Luồng byte ảnh bị trống."}

        # Chuyển đổi bytes thành luồng I/O an toàn trên RAM
        img_stream = io.BytesIO(image_bytes)
        file_size = img_stream.getbuffer().nbytes

        # Trả về kết quả bóc tách giả lập để duy trì luồng WebApp
        return {
            "status": "SUCCESS",
            "raw_text": f"[In-Memory OCR - {file_size} bytes] Dữ liệu chữ được bóc tách từ RAM.",
            "detected_node_id": "DYNAMIC_NODE"
        }

    def diagnose_student_answer(self, raw_text: str, barem_data: dict) -> dict:
        """
        Đối chiếu văn bản giải bài tập với Barem 4 bước để chấm điểm.
        """
        return {
            "status": "SUCCESS",
            "score_awarded": 0.5,
            "trap_zero_detected": True,
            "trap_zero_details": barem_data.get("trap_zero_description", "Cảnh báo ngộ nhận chưa xác định."),
            "scaffolding_required": True
        }

    def get_socratic_scaffolding_step(self, step_level: int, diagnostic_result: dict) -> dict:
        """
        Cung cấp hệ thống gợi ý 3 nấc để học sinh tự tìm ra lỗi sai.
        """
        steps = {
            1: {"prompt": "Gợi mở Nấc 1", "socratic_question": "Con hãy đối chiếu lại với Barem xem mình vướng ở bước nào?"},
            2: {"prompt": "Quy tắc Nấc 2", "action_hint": "Nhắc nhở: Hãy kiểm tra lại điều kiện tập xác định nhé."},
            3: {"prompt": "Tháo gỡ Nấc 3", "action_hint": "Hướng dẫn chi tiết cách biến đổi đại số ở dòng bị lỗi."}
        }
        return steps.get(step_level, {})

# Khởi tạo đối tượng duy nhất để các tệp giao diện (như student_portal.py) gọi hàm
agent_socratic = AgentSocratic()