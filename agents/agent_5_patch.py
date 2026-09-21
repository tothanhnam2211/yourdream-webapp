# -*- coding: utf-8 -*-
"""
Lõi: Agent 05 - Bản Vá Độc Lập (Local Overrides Engine)
Định vị: .\agents\agent_5_patch.py
Tiêu chuẩn: Zero-Overwrite Master DB | Self-Healing Schema | Fail-Fast
"""

import sqlite3
import time
import json
from pathlib import Path
from typing import Dict, Any

# Khóa mục tiêu CSDL Master
DB_PATH = Path(r".\yourdream.db")

class AgentPatch:
    def __init__(self):
        self.db_path = DB_PATH

    def _get_connection(self):
        """Fail-Fast: Cắt đứt luồng nếu CSDL bị mất."""
        if not self.db_path.exists():
            raise FileNotFoundError(f"TỬ HUYỆT: Không tìm thấy CSDL Master tại {self.db_path}")
        return sqlite3.connect(self.db_path)

    def _ensure_overrides_table(self, cursor: sqlite3.Cursor):
        """
        Bọc thép CSDL: Tự động đúc bảng local_overrides nếu nó chưa tồn tại.
        Sử dụng UNIQUE(teacher_id, item_id) để đảm bảo mỗi giáo viên chỉ có 1 bản vá cho 1 bài học.
        """
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS local_overrides (
                override_id INTEGER PRIMARY KEY AUTOINCREMENT,
                teacher_id TEXT NOT NULL,
                item_id TEXT NOT NULL,
                patch_data TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(teacher_id, item_id)
            )
        ''')

    def apply_patch(self, teacher_id: str, item_id: str, patch_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Ghi nhận bản vá của giáo viên dưới định dạng JSON siêu nén.
        Tuyệt đối không sử dụng lệnh UPDATE lên bảng 'atomic_nodes'.
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        try:
            # Kích hoạt cơ chế tự phục hồi lược đồ trước khi ghi dữ liệu
            self._ensure_overrides_table(cursor)
            
            now_ts = time.strftime('%Y-%m-%d %H:%M:%S')
            # Nén toàn bộ dữ liệu tinh chỉnh thành 1 khối JSON để tối ưu I/O đĩa
            patch_json = json.dumps(patch_payload, ensure_ascii=False)
            
            # Ghi đè hoặc tạo mới bản vá cá nhân hóa
            cursor.execute('''
                INSERT INTO local_overrides (teacher_id, item_id, patch_data, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(teacher_id, item_id) DO UPDATE SET
                    patch_data = excluded.patch_data,
                    updated_at = excluded.updated_at
            ''', (teacher_id, item_id, patch_json, now_ts))
            
            conn.commit()
            return {
                "status": "SUCCESS",
                "teacher_id": teacher_id,
                "item_id": item_id,
                "is_master_protected": True
            }
        except Exception as e:
            conn.rollback()
            return {"status": "FAIL", "error": str(e), "is_master_protected": True}
        finally:
            conn.close()

# Khởi tạo Lõi Động cơ
agent_patch = AgentPatch()