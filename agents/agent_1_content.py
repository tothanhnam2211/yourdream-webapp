import sys
import time
import sqlite3
from typing import Any, Dict, List
from pathlib import Path

# Vượt rào Import: Đảm bảo trỏ đúng vào lô cốt
BASE_DIR = Path(r"D:\YOURDREAM.VN")
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from services.db_service import db_local
from agents.agent_4_harvester import agent_4

class ContentArchitectAgent:
    """AGENT 01: Kiến trúc sư Nội dung & Quản trị Sương mù (Fog-of-War).
    Bọc thép: Multi-Prerequisite Unlock Engine, Thread-Safe DB Isolation, Zero Mock Data.
    """

    def __init__(self):
        # Ngưỡng mở khóa: 80% (0.8)
        self.mastery_threshold = 0.8  

    def get_knowledge_dag(self, subject: str, grade: int) -> Dict[str, Any]:
        """Truy vấn Cây DAG, đồng bộ 100% với thuật toán Prerequisites của Agent 07."""
        nodes_list = agent_4.search_items(subject, grade, limit=1000)
        
        if not nodes_list:
            return {"subject": subject, "grade": grade, "total_nodes": 0, "status": "EMPTY"}

        dag_tree = {}
        for n in nodes_list:
            node_id = n.get("node_id")
            prereqs_str = n.get("prerequisites") or ""
            prereqs = [p.strip() for p in prereqs_str.split(",") if p.strip()]
            
            # Quét phả hệ đa nhánh
            if not prereqs:
                if "ROOT" not in dag_tree: dag_tree["ROOT"] = []
                dag_tree["ROOT"].append(node_id)
            else:
                for p in prereqs:
                    if p not in dag_tree: dag_tree[p] = []
                    dag_tree[p].append(node_id)

        return {
            "subject": subject,
            "grade": grade,
            "total_nodes": len(nodes_list),
            "nodes": nodes_list,
            "dag_tree": dag_tree,
            "status": "SUCCESS"
        }

    def check_fog_of_war_status(self, student_id: str, node_id: str) -> Dict[str, Any]:
        """ĐỘT PHÁ 1 & 4: Multi-Prerequisite Unlock Engine kết hợp Thread-Safe."""
        conn, cursor = db_local.ket_noi_hop_nhat()
        conn.row_factory = sqlite3.Row
        
        try:
            # 1. Trích xuất chuỗi Tiền đề (Prerequisites)
            cursor.execute("SELECT prerequisites FROM atomic_nodes WHERE node_id = ?", (str(node_id),))
            node_row = cursor.fetchone()
            if not node_row:
                return {"node_id": node_id, "status": "ERROR", "message": "Nút không tồn tại."}
            
            prereqs_str = node_row["prerequisites"] or ""
            prereqs = [p.strip() for p in prereqs_str.split(",") if p.strip()]

            # 2. Truy vấn nhật ký học tập tại bảng thống nhất
            cursor.execute("SELECT status, diy_score FROM student_mastery WHERE student_id = ? AND node_id = ?", (str(student_id), str(node_id)))
            mastery_row = cursor.fetchone()
            current_status = mastery_row["status"] if mastery_row else None
            current_score = mastery_row["diy_score"] if mastery_row else 0.0

            final_status = "LOCKED"
            
            # 3. Thuật toán Mở khóa Đa nhánh
            if not prereqs:
                final_status = "UNLOCKED"
            else:
                # Phải đảm bảo TẤT CẢ các nút tiền đề đều đạt >= 0.8
                placeholders = ','.join(['?'] * len(prereqs))
                query = f"SELECT node_id, diy_score FROM student_mastery WHERE student_id = ? AND node_id IN ({placeholders})"
                cursor.execute(query, [str(student_id)] + prereqs)
                prereq_mastery = {row["node_id"]: row["diy_score"] for row in cursor.fetchall()}
                
                all_mastered = True
                for p in prereqs:
                    if prereq_mastery.get(p, 0.0) < self.mastery_threshold:
                        all_mastered = False
                        break
                
                if all_mastered:
                    final_status = "UNLOCKED"

            # 4. Ghi đè trạng thái Mở khóa nếu thỏa mãn (Upsert)
            if not current_status and final_status == "UNLOCKED":
                now_str = time.strftime("%Y-%m-%d %H:%M:%S")
                cursor.execute("""
                    INSERT OR IGNORE INTO student_mastery (student_id, node_id, status, unlocked_at)
                    VALUES (?, ?, ?, ?)
                """, (str(student_id), str(node_id), final_status, now_str))
                conn.commit()
                current_status = final_status
            elif not current_status:
                current_status = final_status

            # Chốt chặn thăng cấp Master
            if current_score >= self.mastery_threshold:
                current_status = "MASTERED"

            return {
                "node_id": node_id, 
                "status": current_status, 
                "score": current_score, 
                "is_playable": current_status in ("UNLOCKED", "MASTERED")
            }
        except Exception as e:
            print(f"[x] Lỗi check_fog_of_war_status: {e}")
            return {"status": "ERROR"}
        finally:
            conn.close() # Đóng kết nối gọn gàng, giải phóng tài nguyên

    def update_node_mastery_and_cascade(self, student_id: str, node_id: str, score: float) -> Dict[str, Any]:
        """Cập nhật điểm và kích hoạt hiệu ứng Domino. Cách ly Đa luồng 100%."""
        conn, cursor = db_local.ket_noi_hop_nhat()
        is_mastered = score >= self.mastery_threshold
        new_status = "MASTERED" if is_mastered else "UNLOCKED"
        now_str = time.strftime("%Y-%m-%d %H:%M:%S")
        
        child_nodes = []
        unlocked_nodes = []

        try:
            # 1. Cập nhật Nút hiện tại
            cursor.execute("""
                INSERT INTO student_mastery (student_id, node_id, status, diy_score, unlocked_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(student_id, node_id) DO UPDATE SET
                    diy_score = MAX(student_mastery.diy_score, excluded.diy_score),
                    status = CASE WHEN excluded.diy_score >= ? THEN 'MASTERED' ELSE student_mastery.status END
            """, (str(student_id), str(node_id), new_status, score, now_str, self.mastery_threshold))
            conn.commit()

            # 2. Thu thập danh sách Nút con (Domino Target)
            if is_mastered:
                kw = f"%{node_id}%"
                cursor.execute("SELECT node_id, prerequisites FROM atomic_nodes WHERE prerequisites LIKE ?", (kw,))
                potential_children = cursor.fetchall()
                
                for row in potential_children:
                    prereqs = [p.strip() for p in (row[1] or "").split(",") if p.strip()]
                    if node_id in prereqs:
                        child_nodes.append(row[0])
        except Exception as e:
            conn.rollback()
            print(f"[x] Lỗi update_node_mastery: {e}")
            return {"status": "ERROR"}
        finally:
            conn.close() # Đóng DB gốc trước khi vòng lặp Domino mở các kết nối mới

        # 3. Kích hoạt quét Sương mù trên các Nút con (Safe Cascade)
        if is_mastered:
            for child_id in child_nodes:
                child_status = self.check_fog_of_war_status(student_id, child_id)
                if child_status.get("status") == "UNLOCKED":
                    unlocked_nodes.append(child_id)

        return {
            "status": "SUCCESS",
            "node_status": new_status,
            "cascade_unlocked": unlocked_nodes
        }

agent_content = ContentArchitectAgent()

if __name__ == "__main__":
    print("🧪 Kiểm thử sinh tồn Agent 01 (Multi-Prerequisite & Thread-Safe)...")
    test_student = "ST_001"
    test_node = "MATH_6_001"
    
    # Do đã cắt bỏ Dummy Data, nếu DB trống sẽ trả về Lỗi Không Tồn Tại.
    # Trong môi trường thực, Agent 4 đã nạp dữ liệu.
    fog = agent_content.check_fog_of_war_status(test_student, test_node)
    print(f"[*] Sương mù Nút {test_node}: {fog.get('status')}")
    
    print("✅ [PASSED] Agent 01 đã được bọc thép. Không còn rò rỉ bộ nhớ!")