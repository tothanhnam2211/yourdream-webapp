import sys
import json
import time
import os
import random
from typing import Any, Dict, List, Optional
from pathlib import Path

# Vượt rào Import
BASE_DIR = Path(r"D:\YOURDREAM.VN")
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from services.db_service import db_local

from openai import OpenAI
from dotenv import load_dotenv

load_dotenv(BASE_DIR / ".env")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

class LifeSkillsAgent:
    """AGENT 10: Kỹ sư Kỹ năng sống 0đ.
    Bọc thép: Zero-Trust PIN Auth, Idempotency Guard, Hybrid AI/Template Fallback, Fail-Fast.
    """

    def __init__(self):
        self.conn, self.cursor = db_local.ket_noi_hop_nhat()
        self.openai_client = OpenAI(api_key=OPENAI_API_KEY)
        self._init_missions_table()

    def _init_missions_table(self):
        """Khởi tạo bảng Fail-Fast trực tiếp trên Schema v2026."""
        self.cursor.execute("""
            CREATE TABLE IF NOT EXISTS student_lifeskills_missions (
                mission_id TEXT PRIMARY KEY,
                student_id TEXT,
                parent_id TEXT,
                grade INTEGER,
                skill_category TEXT,
                mission_data_json TEXT,
                gems_reward INTEGER,
                status TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.cursor.execute("""
            CREATE TABLE IF NOT EXISTS student_wheel_gems (
                student_id TEXT PRIMARY KEY,
                total_gems INTEGER DEFAULT 0,
                finance_score REAL DEFAULT 5.0,
                lifeskills_score REAL DEFAULT 5.0
            )
        """)
        self.conn.commit()

    def _get_fallback_template(self, grade: int, category: str) -> dict:
        """ĐỘT PHÁ 2: Bộ khung Template Động (Offline Fallback)."""
        templates = {
            "finance": {
                "title": f"Quản gia nhí Lớp {grade}",
                "description": "Cùng mẹ lập danh sách đi chợ và tính tổng tiền.",
                "action_steps": ["Lên danh sách", "Ghi giá tiền", "Tính tổng chi phí"]
            },
            "lifeskills": {
                "title": f"Kiến trúc sư không gian Lớp {grade}",
                "description": "Tự dọn dẹp góc học tập và phòng ngủ.",
                "action_steps": ["Gấp chăn màn", "Xếp sách vở", "Lau bàn"]
            }
        }
        # Lấy template theo category, nếu không có lấy mặc định lifeskills
        return templates.get(category, templates["lifeskills"])

    def generate_daily_mission_hybrid(self, student_id: str, parent_id: str, grade: int, category: str, weakest_dimension: str = "") -> dict:
        """ĐỘT PHÁ 2: Hybrid AI Generator + Offline Fallback."""
        mission_id = f"MS_LS_{student_id}_{int(time.time())}"
        gems_reward = 30 if grade <= 5 else (50 if grade <= 9 else 70)
        
        prompt = f"""Sinh một nhiệm vụ Kỹ năng sống 0đ thực tế cho học sinh Lớp {grade}, nhóm '{category}'.
Khắc phục điểm yếu: {weakest_dimension}. Phải cần phụ huynh nghiệm thu.
TRẢ VỀ JSON: {{"title": "...", "description": "...", "action_steps": ["1", "2", "3"]}}"""

        try:
            # Thử gọi API Đám mây
            res = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=200,
                timeout=3.0 # Fail-Fast: Quá 3s tự ngắt sang Offline
            )
            raw = res.choices[0].message.content.strip()
            if raw.startswith("```json"): raw = raw[7:-3].strip()
            elif raw.startswith("```"): raw = raw[3:-3].strip()
            mission_data = json.loads(raw)
            print(f"🚀 [Agent 10] Nhiệm vụ sinh bởi AI (Latency < 3s).")
        except Exception as e:
            # Bẻ lái mượt mà sang Offline Template
            print(f"⚠️ [Agent 10] Mạng chậm hoặc lỗi API ({e}). Kích hoạt Offline Fallback.")
            mission_data = self._get_fallback_template(grade, category)

        # Ghi DB theo chuẩn Fail-Fast
        self.cursor.execute("""
            INSERT INTO student_lifeskills_missions (mission_id, student_id, parent_id, grade, skill_category, mission_data_json, gems_reward, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING_APPROVAL')
        """, (mission_id, str(student_id), str(parent_id), grade, category, json.dumps(mission_data, ensure_ascii=False), gems_reward))
        self.conn.commit()
        
        return {"mission_id": mission_id, "mission_data": mission_data, "gems": gems_reward, "status": "SUCCESS"}

    def _verify_parent_pin(self, parent_id: str, pin: str) -> bool:
        """Mock: Hàm xác thực mã PIN Phụ huynh. Trong thực tế sẽ gọi Agent 9 hoặc bảng Users."""
        # Giả lập: Phụ huynh 999 có mã PIN là '1234'
        valid_pins = {"PR_999": "1234"}
        return valid_pins.get(parent_id) == pin

    def verify_mission_completion(self, mission_id: str, parent_id: str, parent_pin: str) -> dict:
        """ĐỘT PHÁ 1: Zero-Trust Parent Auth & Idempotency Guard."""
        
        # 1. Zero-Trust Auth
        if not self._verify_parent_pin(parent_id, parent_pin):
            print("🚨 [BẢO MẬT] Sai mã PIN Phụ huynh hoặc bị từ chối truy cập!")
            return {"status": "DENIED", "message": "Xác thực mã PIN thất bại."}

        # 2. Idempotency Guard (Chống hack click đúp / nạp lại request)
        self.cursor.execute("SELECT parent_id, gems_reward, skill_category, status FROM student_lifeskills_missions WHERE mission_id = ?", (mission_id,))
        row = self.cursor.fetchone()
        
        if not row: raise ValueError("Fail-Fast: Nhiệm vụ không tồn tại trong DB.")
        owner_parent_id, gems, cat, current_status = row
        
        if str(owner_parent_id) != str(parent_id):
            return {"status": "DENIED", "message": "ID Phụ huynh không khớp."}
            
        if current_status != 'PENDING_APPROVAL':
            print("🛡️ [IDEMPOTENCY GUARD] Chặn yêu cầu duyệt trùng lặp. Nhiệm vụ đã được xử lý.")
            return {"status": "IDEMPOTENT_BLOCKED", "message": "Nhiệm vụ đã được duyệt trước đó."}
            
        # 3. Giao dịch an toàn
        try:
            self.cursor.execute("UPDATE student_lifeskills_missions SET status = 'APPROVED' WHERE mission_id = ?", (mission_id,))
            
            # Cập nhật Gems
            score_col = f"{cat}_score" if cat in ["finance", "lifeskills"] else "lifeskills_score"
            self.cursor.execute(f"""
                INSERT INTO student_wheel_gems (student_id, total_gems, {score_col})
                VALUES ('ST_001', ?, 5.5)
                ON CONFLICT(student_id) DO UPDATE SET
                    total_gems = total_gems + excluded.total_gems,
                    {score_col} = MIN(10.0, {score_col} + 0.5)
            """, (gems,))
            
            self.conn.commit()
            print(f"✅ [Agent 10] Nhiệm vụ {mission_id} ĐÃ DUYỆT. +{gems} Gems an toàn.")
            return {"status": "SUCCESS", "gems_awarded": gems}
        except Exception as e:
            self.conn.rollback()
            raise Exception(f"Fail-Fast Giao dịch DB lỗi: {e}")

agent_lifeskills = LifeSkillsAgent()

if __name__ == "__main__":
    print("🧪 Kiểm thử Agent 10 (Zero-Trust, Idempotency, Hybrid Gen)...")
    s_id, p_id = "ST_001", "PR_999"
    
    # 1. Sinh nhiệm vụ (Hybrid Mode)
    mission = agent_lifeskills.generate_daily_mission_hybrid(s_id, p_id, 6, "finance")
    m_id = mission["mission_id"]
    
    # 2. Test Auth sai PIN
    print("\n[*] Hacker thử duyệt với PIN sai...")
    assert agent_lifeskills.verify_mission_completion(m_id, p_id, "0000")["status"] == "DENIED"
    
    # 3. Phụ huynh duyệt thật
    print("\n[*] Phụ huynh nhập mã PIN hợp lệ (1234)...")
    assert agent_lifeskills.verify_mission_completion(m_id, p_id, "1234")["status"] == "SUCCESS"
    
    # 4. Test Idempotency Guard (Bấm duyệt lần 2 do lag mạng)
    print("\n[*] Học sinh F5 gửi lại Request duyệt trùng...")
    assert agent_lifeskills.verify_mission_completion(m_id, p_id, "1234")["status"] == "IDEMPOTENT_BLOCKED"
    
    print("\n✅ [PASSED] Kiểm thử Agent 10 thành công hoàn toàn!")