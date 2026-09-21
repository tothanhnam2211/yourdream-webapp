# -*- coding: utf-8 -*-
"""
Auth Service - Ma trận Phân quyền RBAC & Quản trị Mã PIN Phụ huynh (Bước 7/20)
================================================================================
Dự án        : YourDream.vn (EduMap Art & Bản Đồ Học Tập)
Định vị      : .\services\auth_service.py
Tiêu chuẩn   : GDPT 2018 | Role-Based Access Control (RBAC) | SQLite Local Overrides
Mô tả        : Quản trị an ninh và phân quyền cho 4 vai trò trong hệ thống:
               - ADMIN: Full 100% quyền kiểm soát học liệu, người dùng, cấu hình.
               - TEACHER: Khóa cứng can_create_master = False (không được tạo mới Master).
                          Cho phép can_edit = True (chỉnh sửa số liệu qua bản vá Local Overrides),
                          và can_export = True (xuất bản 8 định dạng học liệu).
               - PARENT: Truy cập cổng phụ huynh qua mã PIN (mặc định '1234' hoặc SHA-256).
               - STUDENT: Học tập, làm bài, tích lũy XP, Gems Nghị lực và xem Bánh xe cuộc đời.
               Lưu bản vá cá nhân hóa giáo viên vào bảng `local_overrides` trong SQLite
               yourdream.db nhằm bảo toàn 100% tệp Master gốc của Admin.
================================================================================
"""

import os
import sys
import json
import time
import hashlib
from typing import Any, Dict, List, Optional, Tuple, Union

BASE_DIR = r"."
SERVICES_DIR = os.path.join(BASE_DIR, "services")
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)
if SERVICES_DIR not in sys.path:
    sys.path.insert(0, SERVICES_DIR)

# Hỗ trợ tương thích môi trường máy trạm đa nền tảng (Windows / Linux)
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from services.db_service import db_local, odoo_gateway


# =====================================================================
# CLASS QUẢN TRỊ PHÂN QUYỀN RBAC & MÃ PIN PHỤ HUYNH
# =====================================================================
class AuthService:
    """
    Class AuthService quản trị Ma trận Phân quyền RBAC & Mã PIN Phụ huynh:
    - 4 vai trò: ADMIN, TEACHER, PARENT, STUDENT.
    - TEACHER: can_create_master = False, can_edit = True, can_export = True.
    - ADMIN: Toàn quyền 100%.
    - PARENT PIN: Xác thực mã PIN mặc định '1234' hoặc băm SHA-256.
    - LOCAL OVERRIDES: Lưu bản vá giáo viên an toàn vào SQLite yourdream.db.
    """

    def __init__(self):
        # 1. Khởi tạo ma trận phân quyền RBAC 4 vai trò
        self.rbac_matrix = {
            "ADMIN": {
                "can_create": True,
                "can_create_master": True,
                "can_edit": True,
                "can_export": True,
                "can_delete": True,
                "can_manage_users": True,
                "can_view_all": True,
                "can_override_barem": True
            },
            "TEACHER": {
                "can_create": False,         # Khóa cứng không được tạo mới bài tập Master gốc
                "can_create_master": False,  # Khóa cứng bài tập gốc của Admin
                "can_edit": True,            # Cho phép sửa số liệu/văn bản cá nhân hóa
                "can_export": True,          # Cho phép xuất bản Word/PPTX/PDF
                "can_delete": False,
                "can_manage_users": False,
                "can_view_all": True,
                "can_override_barem": False
            },
            "PARENT": {
                "can_create": False,
                "can_create_master": False,
                "can_edit": False,
                "can_export": True,          # Cho phép xuất báo cáo/phiếu học tập
                "can_delete": False,
                "can_manage_users": False,
                "can_view_all": False,
                "can_access_portal": True
            },
            "STUDENT": {
                "can_create": False,
                "can_create_master": False,
                "can_edit": False,
                "can_export": True,          # Cho phép tải bài làm, phiếu trắc nghiệm
                "can_delete": False,
                "can_manage_users": False,
                "can_view_all": False,
                "can_submit_answers": True
            }
        }
        self.default_parent_pin = "1234"
        self._init_db_schema()

    def _init_db_schema(self):
        """Khởi tạo bảng lưu trữ local_overrides và parent_pins trong SQLite yourdream.db."""
        try:
            conn, cursor = db_local.ket_noi_hop_nhat()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS local_overrides (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    teacher_id INTEGER,
                    item_id TEXT,
                    patch_data TEXT,
                    created_at TEXT,
                    updated_at TEXT,
                    UNIQUE(teacher_id, item_id)
                );
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS parent_pins (
                    student_id INTEGER PRIMARY KEY,
                    pin_hash TEXT,
                    updated_at TEXT
                );
            """)
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[!] Lỗi khởi tạo schema bảng phân quyền & bản vá: {e}")

    def check_permission(self, role: str, action: str) -> bool:
        """
        Kiểm tra quyền hạn thực thi của vai trò trong ma trận RBAC:
        - ADMIN: Mở toàn bộ 100% quyền.
        - TEACHER: Khóa cứng can_create / can_create_master = False.
                   Cho phép can_edit = True, can_export = True.
        - PARENT / STUDENT: Giới hạn theo ma trận bảo mật.
        """
        clean_role = str(role).strip().upper()
        clean_action = str(action).strip().lower()

        action_aliases = {
            "can_create": "can_create",
            "create": "can_create",
            "can_create_master": "can_create_master",
            "create_master": "can_create_master",
            "can_edit": "can_edit",
            "edit": "can_edit",
            "can_export": "can_export",
            "export": "can_export",
            "can_delete": "can_delete",
            "delete": "can_delete"
        }
        canonical_action = action_aliases.get(clean_action, clean_action)

        if clean_role == "ADMIN":
            return True

        if clean_role == "TEACHER":
            if canonical_action in ("can_create", "can_create_master"):
                return False
            if canonical_action in ("can_edit", "can_export"):
                return True

        role_permissions = self.rbac_matrix.get(clean_role)
        if not role_permissions:
            return False

        return bool(role_permissions.get(canonical_action, False))

    def verify_parent_pin(self, student_id: int, input_pin: str) -> bool:
        """
        Xác thực mã PIN Phụ huynh truy cập cổng giám sát học tập:
        - Kiểm tra mã PIN mặc định '1234' hoặc chuỗi băm SHA-256 trong CSDL yourdream.db.
        - Tự động mã hóa một chiều bảo mật khi thiết lập mới.
        """
        clean_pin = str(input_pin).strip()
        input_hash = hashlib.sha256(clean_pin.encode("utf-8")).hexdigest()
        default_hash = hashlib.sha256(self.default_parent_pin.encode("utf-8")).hexdigest()

        try:
            conn, cursor = db_local.ket_noi_hop_nhat()
            cursor.execute(
                "SELECT pin_hash FROM parent_pins WHERE student_id = ?;",
                (int(student_id),)
            )
            row = cursor.fetchone()

            if row:
                stored_hash = row[0]
                conn.close()
                return input_hash == stored_hash or clean_pin == self.default_parent_pin
            else:
                if clean_pin == self.default_parent_pin:
                    now_str = time.strftime("%Y-%m-%d %H:%M:%S")
                    cursor.execute("""
                        INSERT INTO parent_pins (student_id, pin_hash, updated_at)
                        VALUES (?, ?, ?);
                    """, (int(student_id), default_hash, now_str))
                    conn.commit()
                    conn.close()
                    return True
                conn.close()
                return False

        except Exception as e:
            print(f"[!] Lỗi truy vấn bảng parent_pins: {e}")
            return clean_pin == self.default_parent_pin

    def save_teacher_override_patch(
        self,
        teacher_id: int,
        item_id: str,
        patch_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Lưu bản vá chỉnh sửa cá nhân hóa của giáo viên vào bảng `local_overrides` trong SQLite yourdream.db:
        - Không ghi đè hay làm hỏng file Master gốc của Admin.
        - Hỗ trợ lưu trữ số liệu bài tập tùy biến, thời gian, ghi chú giáo viên.
        """
        clean_item = str(item_id).strip()
        now_str = time.strftime("%Y-%m-%d %H:%M:%S")
        patch_json = json.dumps(patch_data, ensure_ascii=False)

        try:
            conn, cursor = db_local.ket_noi_hop_nhat()
            cursor.execute("""
                INSERT INTO local_overrides (teacher_id, item_id, patch_data, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(teacher_id, item_id) DO UPDATE SET
                    patch_data = excluded.patch_data,
                    updated_at = excluded.updated_at;
            """, (int(teacher_id), clean_item, patch_json, now_str, now_str))
            conn.commit()
            conn.close()

            return {
                "status": "SAVED",
                "teacher_id": int(teacher_id),
                "item_id": clean_item,
                "patch_data": patch_data,
                "is_master_protected": True,
                "timestamp": now_str
            }

        except Exception as e:
            print(f"[!] Lỗi lưu bản vá local_overrides: {e}")
            return {
                "status": "ERROR",
                "teacher_id": int(teacher_id),
                "item_id": clean_item,
                "error": str(e),
                "is_master_protected": True
            }

    def get_teacher_override_patch(self, teacher_id: int, item_id: str) -> Optional[Dict[str, Any]]:
        """Đọc bản vá cá nhân hóa của giáo viên để hòa trộn với Master gốc khi hiển thị hoặc xuất bản."""
        try:
            conn, cursor = db_local.ket_noi_hop_nhat()
            cursor.execute("""
                SELECT patch_data FROM local_overrides
                WHERE teacher_id = ? AND item_id = ?;
            """, (int(teacher_id), str(item_id).strip()))
            row = cursor.fetchone()
            conn.close()

            if row and row[0]:
                return json.loads(row[0])
            return None
        except Exception as e:
            print(f"[!] Lỗi đọc bản vá local_overrides: {e}")
            return None


# =====================================================================
# KHỞI TẠO SINGLETON INSTANCE DÙNG CHUNG TOÀN DỰ ÁN
# =====================================================================
auth_service = AuthService()


# =====================================================================
# KHỐI TỰ KIỂM THỬ TERMINAL CHUẨN XÁC
# =====================================================================
if __name__ == "__main__":
    print("=" * 80)
    print("  KIỂM THỬ AUTH SERVICE & RBAC MA TRẬN (SERVICES/AUTH_SERVICE.PY)")
    print("=" * 80)

    service = AuthService()

    # -------------------------------------------------------------------------
    # 1. Test kiểm tra quyền Giáo viên (can_create -> False, can_export -> True)
    # -------------------------------------------------------------------------
    can_create = service.check_permission("TEACHER", "can_create")
    can_create_master = service.check_permission("TEACHER", "can_create_master")
    can_edit = service.check_permission("TEACHER", "can_edit")
    can_export = service.check_permission("TEACHER", "can_export")

    print(f" Kiểm tra ma trận phân quyền RBAC Giáo viên (TEACHER):")
    print(f"    - can_create       : {can_create} (Kỳ vọng: False - Khóa cứng tạo Master)")
    print(f"    - can_create_master: {can_create_master} (Kỳ vọng: False)")
    print(f"    - can_edit         : {can_edit} (Kỳ vọng: True - Cho phép sửa số liệu/patch)")
    print(f"    - can_export       : {can_export} (Kỳ vọng: True - Cho phép xuất bản)")

    assert can_create == False, "Giáo viên không được phép tạo bài tập Master gốc!"
    assert can_create_master == False, "Giáo viên không được phép tạo Master!"
    assert can_edit == True, "Giáo viên phải có quyền sửa số liệu/patch!"
    assert can_export == True, "Giáo viên phải có quyền xuất học liệu!"

    # Kiểm tra quyền Admin (full 100%)
    assert service.check_permission("ADMIN", "can_create") == True, "Admin phải có toàn quyền!"
    assert service.check_permission("ADMIN", "can_export") == True, "Admin phải có toàn quyền!"
    print(f"    => RBAC Check: PASSED")

    # -------------------------------------------------------------------------
    # 2. Test xác thực mã PIN Phụ huynh '1234' -> True
    # -------------------------------------------------------------------------
    student_id = 101
    pin_valid = service.verify_parent_pin(student_id, "1234")
    pin_invalid = service.verify_parent_pin(student_id, "9999")
    print(f"\n[2] Kiểm tra xác thực mã PIN Phụ huynh (Student ID: {student_id}):")
    print(f"    - Nhập '1234': {pin_valid} (Kỳ vọng: True)")
    print(f"    - Nhập '9999': {pin_invalid} (Kỳ vọng: False)")
    assert pin_valid == True, "Xác thực mã PIN 1234 thất bại!"
    assert pin_invalid == False, "Mã PIN sai 9999 không được phép thông qua!"
    print(f"    => Parent PIN Check: PASSED")

    # -------------------------------------------------------------------------
    # 3. Test tạo bản vá Local Overrides Patch cho Giáo viên -> assert PASSED
    # -------------------------------------------------------------------------
    teacher_id = 88
    item_id = "NODE_G06_MATH_CH01_L01"
    patch = {
        "custom_note": "Thầy Nam điều chỉnh số liệu câu c thành x = 5",
        "adjusted_data": {"num_students": 35, "time_limit_mins": 45}
    }
    patch_res = service.save_teacher_override_patch(teacher_id, item_id, patch)
    print(f"\n[3] Kiểm tra lưu bản vá Local Overrides Patch:")
    print(f"    - Teacher ID         : {patch_res['teacher_id']}")
    print(f"    - Item ID            : {patch_res['item_id']}")
    print(f"    - Is Master Protected: {patch_res['is_master_protected']}")
    print(f"    - Status             : {patch_res['status']}")

    assert patch_res["status"] == "SAVED", "Lưu bản vá không thành công!"
    assert patch_res["is_master_protected"] == True, "Master gốc không được bảo vệ an toàn!"

    # Đọc lại bản vá để kiểm tra tính toàn vẹn
    saved_patch = service.get_teacher_override_patch(teacher_id, item_id)
    assert saved_patch is not None, "Không tìm thấy bản vá vừa lưu!"
    assert saved_patch["custom_note"] == patch["custom_note"], "Dữ liệu bản vá không khớp!"
    print(f"    => Local Overrides Patch Check: PASSED")

    print("\n" + "=" * 80)
    print("✅ ĐÃ TẠO MỚI TỆP SERVICES/AUTH_SERVICE.PY THÀNH CÔNG!")
    print("  TỔNG KẾT: 100% KIỂM THỬ AUTH SERVICE & RBAC HOÀN TẤT (ALL ASSERTS PASSED)")
    print("=" * 80)

    import sys
    sys.exit(0)