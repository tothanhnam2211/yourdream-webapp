# -*- coding: utf-8 -*-
"""
Lõi: Agent 04 - Bốc Cào Học Liệu (Search Engine)
Định vị: D:\YOURDREAM.VN\agents\agent_4_search.py
Tiêu chuẩn: Zero-Disk I/O | Teacher-Context Aware | Fail-Fast
"""

import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, List

# Khóa mục tiêu CSDL Master
DB_PATH = Path(r"D:\YOURDREAM.VN\yourdream.db")

class AgentSearch:
    def __init__(self):
        self.db_path = DB_PATH

    def _get_connection(self):
        """Fail-Fast: Ném ngoại lệ ngay nếu CSDL không tồn tại hoặc lỗi."""
        if not self.db_path.exists():
            raise FileNotFoundError(f"TỬ HUYỆT: Không tìm thấy CSDL Master tại {self.db_path}")
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def query_master_db(self, teacher_id: str, grade: int, subject: str, keyword: str = "", limit: int = 20) -> List[Dict[str, Any]]:
        """
        Truy vấn bốc cào siêu tốc, tích hợp ngữ cảnh Giáo viên.
        Nhận diện Bản vá (Local Overrides) trực tiếp qua truy vấn SQL.
        """
        start_time = time.perf_counter()
        results = []
        
        # Đảm bảo Fail-Fast: Lỗi kết nối sẽ văng thẳng lên Khung Chẩn Đoán của UI
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            # LEFT JOIN để kiểm tra xem Nút Tri Thức này đã bị giáo viên vá hay chưa
            query = """
                SELECT 
                    a.node_id, a.subject, a.grade, a.lesson_title, 
                    a.barem_step_1, a.trap_zero_description,
                    CASE WHEN o.item_id IS NOT NULL THEN 1 ELSE 0 END AS is_patched
                FROM atomic_nodes a
                LEFT JOIN local_overrides o 
                    ON a.node_id = o.item_id AND o.teacher_id = ?
                WHERE a.subject = ? AND a.grade = ?
            """
            params: List[Any] = [teacher_id, subject, grade]

            # Quét từ khóa vào cả Tiêu đề, Barem và Bẫy ngộ nhận
            if keyword and keyword.strip():
                kw = f"%{keyword.strip()}%"
                query += " AND (a.lesson_title LIKE ? OR a.barem_step_1 LIKE ? OR a.trap_zero_description LIKE ?)"
                params.extend([kw, kw, kw])

            query += " ORDER BY a.node_id ASC LIMIT ?"
            params.append(limit)

            cursor.execute(query, params)
            results = [dict(row) for row in cursor.fetchall()]
            
            # Chuẩn hóa kiểu dữ liệu cho UI xử lý
            for r in results:
                r["is_patched"] = bool(r["is_patched"])

        except sqlite3.OperationalError as e:
            # KỊCH BẢN SINH TỒN: 
            # Nếu Agent 5 chưa từng được gọi, bảng 'local_overrides' sẽ chưa tồn tại.
            # Thay vì sập toàn bộ hệ thống, ta tự động thoái lui về truy vấn Master thuần.
            if "no such table: local_overrides" in str(e):
                query_fallback = """
                    SELECT 
                        node_id, subject, grade, lesson_title, 
                        barem_step_1, trap_zero_description,
                        0 AS is_patched
                    FROM atomic_nodes
                    WHERE subject = ? AND grade = ?
                """
                params_fallback: List[Any] = [subject, grade]
                if keyword and keyword.strip():
                    kw = f"%{keyword.strip()}%"
                    query_fallback += " AND (lesson_title LIKE ? OR barem_step_1 LIKE ? OR trap_zero_description LIKE ?)"
                    params_fallback.extend([kw, kw, kw])
                query_fallback += " ORDER BY node_id ASC LIMIT ?"
                params_fallback.append(limit)
                
                cursor.execute(query_fallback, params_fallback)
                results = [dict(row) for row in cursor.fetchall()]
                for r in results:
                    r["is_patched"] = False
            else:
                # Nếu là lỗi CSDL nghiêm trọng khác, ném ngược lên UI
                raise e 
        finally:
            conn.close()

        # Nhúng độ trễ truy vấn vào phần tử đầu tiên để UI báo cáo siêu tốc
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        if results:
            results[0]["query_latency_ms"] = elapsed_ms

        return results

# Khởi tạo Lõi Động cơ
agent_search = AgentSearch()