# -*- coding: utf-8 -*-
"""
Agent 3: Gamification Engine (Kỹ sư Quản trị Game hóa & Thúc đẩy Động lực)
================================================================================
Dự án        : YourDream.vn (EduMap Art & Bản Đồ Học Tập)
Định vị      : D:\YOURDREAM.VN\agents\agent_3_gamification.py
Tiêu chuẩn   : GDPT 2018 | Socratic Scaffolding | Canvas 120Hz
Mô tả        : Quản trị hệ thống phần thưởng, ví Gems Nghị Lực, tiến hóa Linh thú:
               1. add_energy_gems: Tích lũy Gems Nghị Lực vào ví học sinh và ghi nhật ký.
               2. check_mascot_evolution: Đánh giá tổng điểm Gems để tính toán cấp độ
                  tiến hóa của Linh thú bản mệnh (Cấp 1: Sơ Sinh -> Cấp 2: Chiến Binh -> Cấp 3: Huyền Thoại).
               3. trigger_confetti_effect: Sinh cấu hình hiệu ứng pháo hoa Confetti
                  (màu sắc, số lượng hạt, âm thanh) gửi về Canvas 120Hz.
================================================================================
"""

import json, os, sys, time

BASE_DIR = r"D:\YOURDREAM.VN"
SERVICES_DIR = os.path.join(BASE_DIR, "services")
AGENTS_DIR = os.path.join(BASE_DIR, "agents")
for path in [BASE_DIR, SERVICES_DIR, AGENTS_DIR]:
    if path not in sys.path:
        sys.path.insert(0, path)

# Hỗ trợ tương thích môi trường máy trạm đa nền tảng (Windows / Linux)
if os.name != "nt":
    for candidate in [
        "/mnt/agentdata/tiered/YOURDREAM.VN",
        "/working_dir/YOURDREAM.VN",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."),
    ]:
        if os.path.exists(candidate):
            cand_abs = os.path.abspath(candidate)
            if cand_abs not in sys.path:
                sys.path.insert(0, cand_abs)
            c_services = os.path.join(cand_abs, "services")
            c_agents = os.path.join(cand_abs, "agents")
            if os.path.exists(c_services) and c_services not in sys.path:
                sys.path.insert(0, c_services)
            if os.path.exists(c_agents) and c_agents not in sys.path:
                sys.path.insert(0, c_agents)
            break

try:
    from services.db_service import db_local
except (ImportError, ModuleNotFoundError):
    import importlib.util
    cur_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(cur_dir)
    db_path = os.path.join(root_dir, "services", "db_service.py")
    if os.path.exists(db_path):
        spec = importlib.util.spec_from_file_location("services.db_service", db_path)
        mod = importlib.util.module_from_spec(spec)
        sys.modules["services.db_service"] = mod
        spec.loader.exec_module(mod)
        db_local = mod.db_local
    else:
        class DummyDB:
            def ket_noi_hop_nhat(self):
                import sqlite3
                conn = sqlite3.connect(":memory:", check_same_thread=False)
                return conn, conn.cursor()
        db_local = DummyDB()


class GamificationAgent:
    """
    Agent 3: Gamification Engine
    Điều hành cơ chế kinh tế vi mô giáo dục: Tích lũy Gems Nghị Lực,
    nâng cấp Linh thú bản mệnh 11 con giáp và tạo hiệu ứng đồ họa ăn mừng Canvas 120Hz.
    """

    def __init__(self, db_service_instance=None):
        self.db = db_service_instance or db_local
        self._init_storage_tables()

    def _init_storage_tables(self):
        """Khởi tạo cấu trúc các bảng lưu trữ Ví Gems và Tiến hóa Linh thú."""
        conn, cursor = self.db.ket_noi_hop_nhat()
        try:
            # 1. Bảng ví Gems học sinh
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS student_gems_wallet (
                    student_id TEXT PRIMARY KEY,
                    current_balance INTEGER DEFAULT 0,
                    total_accumulated INTEGER DEFAULT 0,
                    updated_at TEXT
                );
            """)

            # 2. Bảng nhật ký lịch sử tích lũy Gems
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS gems_transaction_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_id TEXT,
                    amount INTEGER,
                    balance_after INTEGER,
                    reason TEXT,
                    timestamp TEXT
                );
            """)

            # 3. Bảng hồ sơ tiến hóa Linh thú bản mệnh
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS student_mascot_evolution (
                    student_id TEXT PRIMARY KEY,
                    mascot_name TEXT DEFAULT 'Linh Thú Rồng Socratic',
                    evolution_stage TEXT DEFAULT 'Sơ Sinh',
                    evolution_level INTEGER DEFAULT 1,
                    total_gems_snapshot INTEGER DEFAULT 0,
                    updated_at TEXT
                );
            """)
            conn.commit()
        finally:
            conn.close()

    def add_energy_gems(self, student_id: int, amount: int, reason: str) -> dict:
        """
        Tích lũy Gems Nghị Lực vào ví học sinh và ghi nhật ký lịch sử.
        """
        s_id = str(student_id).strip()
        amt = int(amount)
        now_ts = time.strftime("%Y-%m-%d %H:%M:%S")

        conn, cursor = self.db.ket_noi_hop_nhat()
        try:
            # Kiểm tra số dư hiện tại trong ví
            cursor.execute(
                "SELECT current_balance, total_accumulated FROM student_gems_wallet WHERE student_id = ?;",
                (s_id,)
            )
            row = cursor.fetchone()

            if row:
                prev_balance, prev_accumulated = row[0], row[1]
                new_balance = max(0, prev_balance + amt)
                new_accumulated = prev_accumulated + (amt if amt > 0 else 0)
                cursor.execute(
                    """
                    UPDATE student_gems_wallet
                    SET current_balance = ?, total_accumulated = ?, updated_at = ?
                    WHERE student_id = ?;
                    """,
                    (new_balance, new_accumulated, now_ts, s_id)
                )
            else:
                prev_balance = 0
                new_balance = max(0, amt)
                new_accumulated = max(0, amt)
                cursor.execute(
                    """
                    INSERT INTO student_gems_wallet (student_id, current_balance, total_accumulated, updated_at)
                    VALUES (?, ?, ?, ?);
                    """,
                    (s_id, new_balance, new_accumulated, now_ts)
                )

            # Ghi nhật ký biến động số dư
            cursor.execute(
                """
                INSERT INTO gems_transaction_log (student_id, amount, balance_after, reason, timestamp)
                VALUES (?, ?, ?, ?, ?);
                """,
                (s_id, amt, new_balance, reason, now_ts)
            )

            # Đồng bộ với bảng student_wheel_of_life nếu tồn tại
            try:
                cursor.execute(
                    "UPDATE student_wheel_of_life SET gems_nghi_luc = ?, updated_at = ? WHERE student_id = ?;",
                    (new_balance, now_ts, s_id)
                )
            except Exception:
                pass

            conn.commit()

            return {
                "student_id": student_id,
                "amount_added": amt,
                "previous_balance": prev_balance,
                "current_balance": new_balance,
                "total_accumulated": new_accumulated,
                "reason": reason,
                "timestamp": now_ts,
                "status": "SUCCESS"
            }
        finally:
            conn.close()

    def check_mascot_evolution(self, student_id: int) -> dict:
        """
        Kiểm tra tổng điểm Gems để tính toán cấp độ tiến hóa của Linh thú bản mệnh:
          - Cấp 1: Sơ Sinh (< 100 Gems)
          - Cấp 2: Chiến Binh (100 - 499 Gems)
          - Cấp 3: Huyền Thoại (>= 500 Gems)
        """
        s_id = str(student_id).strip()
        now_ts = time.strftime("%Y-%m-%d %H:%M:%S")

        conn, cursor = self.db.ket_noi_hop_nhat()
        try:
            # Lấy số dư hoặc tổng tích lũy của học sinh
            cursor.execute(
                "SELECT current_balance, total_accumulated FROM student_gems_wallet WHERE student_id = ?;",
                (s_id,)
            )
            row = cursor.fetchone()
            total_gems = row[0] if row else 0

            # Phân tầng cấp bậc tiến hóa
            if total_gems < 100:
                level = 1
                stage = "Sơ Sinh"
                title = "Linh Thú Rồng Sơ Sinh (Nón lá viền neon phát sáng, Cấp 1)"
                next_thresh = 100
            elif total_gems < 500:
                level = 2
                stage = "Chiến Binh"
                title = "Linh Thú Rồng Chiến Binh (Áo dài truyền thống, Vòng hào quang 60fps, Cấp 2)"
                next_thresh = 500
            else:
                level = 3
                stage = "Huyền Thoại"
                title = "Linh Thú Rồng Huyền Thoại (Phép thuật 3D, Nón lá hoàng kim, Cấp 3 Tối Thượng)"
                next_thresh = None

            # Cập nhật hồ sơ Linh thú
            cursor.execute(
                """
                INSERT INTO student_mascot_evolution (student_id, mascot_name, evolution_stage, evolution_level, total_gems_snapshot, updated_at)
                VALUES (?, 'Linh Thú Rồng Socratic', ?, ?, ?, ?)
                ON CONFLICT(student_id) DO UPDATE SET
                    evolution_stage = excluded.evolution_stage,
                    evolution_level = excluded.evolution_level,
                    total_gems_snapshot = excluded.total_gems_snapshot,
                    updated_at = excluded.updated_at;
                """,
                (s_id, stage, level, total_gems, now_ts)
            )
            conn.commit()

            rem_gems = max(0, next_thresh - total_gems) if next_thresh else 0

            return {
                "student_id": student_id,
                "mascot_name": "Bé Rồng Socratic (Nón lá viền neon, Áo dài truyền thống)",
                "total_gems": total_gems,
                "evolution_level": level,
                "evolution_stage": stage,
                "mascot_title": title,
                "next_threshold": next_thresh,
                "remaining_to_next_level": rem_gems,
                "is_max_level": level == 3,
                "status": "SUCCESS"
            }
        finally:
            conn.close()

    def trigger_confetti_effect(self, student_id: int, achievement_type: str) -> dict:
        """
        Sinh cấu hình hiệu ứng pháo hoa Confetti (màu sắc, số lượng hạt, âm thanh ăn mừng)
        chuẩn Canvas 120Hz chống giật lag.
        """
        clean_type = str(achievement_type).strip().upper()

        confetti_payload = {
            "student_id": student_id,
            "achievement_type": clean_type,
            "canvas_frequency_hz": 120,
            "target_screen": "Canvas_Neon_Arena_Phòng_2",
            "confetti_config": {
                "particle_count": 180,
                "colors": ["#00f2fe", "#4facfe", "#facc15", "#10b981", "#f43f5e", "#a855f7"],
                "spread_degrees": 80,
                "velocity": 50,
                "decay": 0.94,
                "gravity": 1.15,
                "origin": {"x": 0.5, "y": 0.55},
                "shapes": ["circle", "star", "ribbon"],
                "audio_fx": "fanfare_celebration_victory_120hz.mp3",
                "haptic_feedback": [120, 60, 120],
                "neon_glow": True
            },
            "status": "TRIGGERED"
        }
        return confetti_payload


# Singleton Instance toàn hệ thống
agent_gamification = GamificationAgent()


# =====================================================================
# THỰC THI KIỂM THỬ TERMINAL VÀ XUẤT KẾT QUẢ
# =====================================================================
if __name__ == "__main__":
    print("=" * 80)
    print("  KIỂM THỬ AGENT 3 - GAMIFICATION ENGINE (AGENTS/AGENT_3_GAMIFICATION.PY)    ")
    print("=" * 80)

    agent = GamificationAgent()
    test_student_id = 101

    # 1. Test cộng +100 Gems Nghị Lực -> In số dư Gems hiện tại.
    print()
    print("--- [TEST 1: TÍCH LŨY GEMS NGHỊ LỰC VÀO VÍ HỌC SINH] ---")
    add_res = agent.add_energy_gems(
        student_id=test_student_id,
        amount=100,
        reason="Hoàn thành xuất sắc thử thách Socratic Phòng 2"
    )
    print(f"[v] Học sinh ID: {add_res.get('student_id')}")
    print(f"[v] Số Gems cộng thêm: +{add_res.get('amount_added')} Gems")
    print(f"[v] Lý do tích lũy: {add_res.get('reason')}")
    print(f"[v] Số dư Gems hiện tại: {add_res.get('current_balance')} Gems")
    assert add_res.get("current_balance", 0) >= 100, "Số dư Gems sau khi nạp phải >= 100!"
    print("[v] Test cộng Gems Nghị Lực -> PASSED")

    # 2. Test kiểm tra tiến hóa Linh thú bản mệnh -> In cấp độ Mascot.
    print()
    print("--- [TEST 2: KIỂM TRA TIẾN HÓA LINH THÚ BẢN MỆNH] ---")
    evo_res = agent.check_mascot_evolution(student_id=test_student_id)
    print(f"[v] Linh thú bản mệnh: {evo_res.get('mascot_name')}")
    print(f"[v] Tổng điểm Gems tích lũy: {evo_res.get('total_gems')}")
    print(f"[v] Cấp độ tiến hóa: Cấp {evo_res.get('evolution_level')} - {evo_res.get('evolution_stage')}")
    print(f"[v] Danh hiệu hiển thị: {evo_res.get('mascot_title')}")
    assert evo_res.get("evolution_level") >= 2, "Với >= 100 Gems, Linh thú phải đạt cấp độ 2 (Chiến Binh)!"
    assert evo_res.get("evolution_stage") in ["Sơ Sinh", "Chiến Binh", "Huyền Thoại"], "Cấp độ tiến hóa không hợp lệ!"
    print("[v] Test kiểm tra tiến hóa Linh thú bản mệnh -> PASSED")

    # 3. Test sinh cấu hình pháo hoa Confetti -> assert PASSED.
    print()
    print("--- [TEST 3: HIỆU ỨNG PHÁO HOA CONFETTI CANVAS 120HZ] ---")
    confetti_res = agent.trigger_confetti_effect(
        student_id=test_student_id,
        achievement_type="MASCOT_EVOLUTION_LEVEL_UP"
    )
    print(f"[v] Loại thành tựu: {confetti_res.get('achievement_type')}")
    print(f"[v] Tần số quét hiển thị: {confetti_res.get('canvas_frequency_hz')}Hz")
    conf_cfg = confetti_res.get("confetti_config", {})
    print(f"[v] Số lượng hạt pháo hoa: {conf_cfg.get('particle_count')}")
    print(f"[v] Bảng màu hạt: {conf_cfg.get('colors')}")
    print(f"[v] Âm thanh chúc mừng: {conf_cfg.get('audio_fx')}")
    assert confetti_res.get("status") == "TRIGGERED", "Trạng thái pháo hoa phải là TRIGGERED!"
    assert conf_cfg.get("particle_count", 0) > 0, "Số lượng hạt Confetti phải lớn hơn 0!"
    assert len(conf_cfg.get("colors", [])) > 0, "Phải có bảng màu hạt Confetti!"
    print("[v] Test sinh cấu hình pháo hoa Confetti -> assert PASSED")

    print()
    print("=" * 80)
    print("✅ ĐÃ TẠO MỚI TỆP AGENTS/AGENT_3_GAMIFICATION.PY THÀNH CÔNG!")
    print("=" * 80)

    # Khóa dừng tự động ngắt hoàn toàn tiến trình Python
    import sys
    sys.exit(0)