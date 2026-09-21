# -*- coding: utf-8 -*-
"""
Dịch vụ: Cơ Sở Dữ Liệu Trung Tâm & Odoo XML-RPC Gateway
Định vị: .\services\db_service.py
Tiêu chuẩn: Tự động hóa Schema | Đa luồng | XML-RPC API | Fail-Fast
"""

import os
import sqlite3
import xmlrpc.client
from pathlib import Path

# Cứu điểm gốc của dự án Local-First
BASE_DIR = Path(r".")
DB_MASTER = BASE_DIR / "yourdream.db"

SATELLITES = {
    "textbooks": "textbooks_index.db",
    "exams": "exams_index.db",
    "pedagogy": "pedagogy_index.db"
}

# =====================================================================
# LÕI GIAO TIẾP ODOO (XML-RPC GATEWAY)
# =====================================================================
class OdooGatewayFallback:
    """Lớp Giả lập (Chạy khi chưa có Server Odoo hoặc khi đứt mạng)."""
    def dong_bo_banh_xe_cuoc_doi(self, student_id: str, chi_so: dict):
        print(f"[Fallback] Đã ghi nhận giả lập Bánh xe cho {student_id}")
        
    def dong_bo_nut_tri_thuc(self, node_data: dict):
        print(f"[Fallback] Đã ghi nhận giả lập Nút tri thức: {node_data.get('node_id')}")

class OdooGatewayLive:
    """Lớp Bắn Đạn Thật: Kết nối thẳng vào Server Odoo ERP qua XML-RPC."""
    def __init__(self):
        # Lấy thông tin từ biến môi trường (Sẽ cấu hình trong tệp .env)
        self.url = os.getenv("ODOO_URL", "http://localhost:8069")
        self.db = os.getenv("ODOO_DB", "edumap_db")
        self.username = os.getenv("ODOO_USER", "admin")
        self.password = os.getenv("ODOO_PASSWORD", "admin")
        self.uid = None
        self.models = None
        self._authenticate()

    def _authenticate(self):
        """Fail-Fast: Thử đăng nhập Odoo, nếu sập thì báo đỏ nhưng không sập luồng AI."""
        try:
            common = xmlrpc.client.ServerProxy(f'{self.url}/xmlrpc/2/common')
            self.uid = common.authenticate(self.db, self.username, self.password, {})
            if self.uid:
                self.models = xmlrpc.client.ServerProxy(f'{self.url}/xmlrpc/2/object')
                print("[v] Đã liên kết vũ khí với Máy chủ Odoo thành công.")
            else:
                print("[x] TỬ HUYỆT ODOO: Sai tài khoản hoặc mật khẩu.")
        except Exception as e:
            print(f"[x] TỬ HUYỆT ODOO: Mất kết nối tới máy chủ ({e}).")

    def dong_bo_banh_xe_cuoc_doi(self, student_id: str, chi_so: dict):
        if not self.uid:
            print("[!] Odoo đang ngắt kết nối. Bỏ qua đồng bộ Bánh xe.")
            return False
            
        try:
            # Giả định Odoo có module 'edumap.wheel'
            # Lệnh bắn dữ liệu lên Odoo (Stateless API)
            record_id = self.models.execute_kw(self.db, self.uid, self.password,
                'edumap.wheel', 'create', [{
                    'student_id': student_id,
                    'academic_score': chi_so.get('Academic', 0),
                    'physical_score': chi_so.get('Physical', 0),
                    'total_xp': chi_so.get('total_xp', 0)
                }])
            print(f"[v] Odoo Sync: Đã đồng bộ Bánh xe (Record ID: {record_id})")
            return True
        except Exception as e:
            print(f"[x] LỖI ĐỒNG BỘ ODOO: {e}")
            return False
            
    def dong_bo_nut_tri_thuc(self, node_data: dict):
        if not self.uid: return False
        try:
            record_id = self.models.execute_kw(self.db, self.uid, self.password,
                'edumap.node', 'create', [{
                    'node_id': node_data.get('node_id'),
                    'lesson_title': node_data.get('lesson_title', '')
                }])
            return True
        except Exception as e:
            return False

# CẦU DAO CHUYỂN MẠCH SINH TỒN
# Nếu biến môi trường ODOO_MODE = 'LIVE', sử dụng kết nối thật. Ngược lại dùng Giả lập.
ODOO_MODE = os.getenv("ODOO_MODE", "FALLBACK")
if ODOO_MODE == "LIVE":
    odoo_gateway = OdooGatewayLive()
else:
    odoo_gateway = OdooGatewayFallback()


# =====================================================================
# LÕI SQLITE LOCAL-FIRST
# =====================================================================
class TrungTamDuLieuLocal:
    def __init__(self):
        self.master_db = DB_MASTER
        self._dam_bao_tep_ve_tinh()

    def _dam_bao_tep_ve_tinh(self):
        for alias, filename in SATELLITES.items():
            db_path = BASE_DIR / filename
            if not db_path.exists():
                open(db_path, 'a').close()

    def ket_noi_hop_nhat(self):
        conn = sqlite3.connect(str(self.master_db), check_same_thread=False)
        cursor = conn.cursor()

        for alias, filename in SATELLITES.items():
            duong_dan = BASE_DIR / filename
            try:
                cursor.execute(f"ATTACH DATABASE '{str(duong_dan)}' AS {alias}")
            except sqlite3.OperationalError:
                pass
        
        self._build_schema_v2026(conn, cursor)
        return conn, cursor

    def _build_schema_v2026(self, conn, cursor):
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS atomic_nodes (
            node_id TEXT PRIMARY KEY,
            subject TEXT NOT NULL,
            grade INTEGER NOT NULL,
            lesson_title TEXT,
            barem_step_1 TEXT, barem_step_2 TEXT,
            barem_step_3 TEXT, barem_step_4 TEXT,
            trap_zero_description TEXT,
            socratic_tier_1 TEXT, socratic_tier_2 TEXT, socratic_tier_3 TEXT,
            lean4_proof_hash TEXT, prerequisites TEXT
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS local_overrides (
            override_id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_id TEXT,
            item_id TEXT,
            patch_data TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT,
            UNIQUE(teacher_id, item_id)
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS parent_pins (
            student_id TEXT PRIMARY KEY,
            pin_hash TEXT,
            updated_at TEXT
        )""")
        conn.commit()

db_local = TrungTamDuLieuLocal()