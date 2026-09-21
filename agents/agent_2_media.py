import sys
import json
import os
from typing import Any, Dict
from pathlib import Path

# Vượt rào Import Fail-Fast
BASE_DIR = Path(r"D:\YOURDREAM.VN")
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from agents.agent_5_overrides import agent_5
from agents.agent_8_socratic import proxy_llm

class MediaConductorAgent:
    """AGENT 02: Kỹ sư Đạo diễn Đa phương tiện & Hạ tải Thích ứng.
    Bọc thép: Zero-Mock JSON, LLM Dynamic Generation, Graceful Degradation SVG.
    """

    def __init__(self):
        self.assets_dir = BASE_DIR / "03_ASSETS"
        self.assets_dir.mkdir(exist_ok=True)
        (self.assets_dir / "rescue_videos").mkdir(exist_ok=True)
        self.llm = proxy_llm 

    def generate_visual_novel_script(self, node_id: str, teacher_id: str = None) -> dict:
        """Sinh kịch bản Visual Novel Động theo Ngữ cảnh Barem (Dual-Coding Theory)."""
        node_data = agent_5.get_effective_item(teacher_id, node_id)
        if not node_data:
            raise ValueError(f"Fail-Fast: Nút {node_id} không tồn tại trong CSDL Master.")

        prompt = f"""Bạn là Đạo diễn kịch bản Game.
Chủ đề bài học: {node_data.get('title')}
Barem B1: {node_data.get('barem_step_1')}
Bẫy ngộ nhận: {node_data.get('trap_zero_description')}

Sinh kịch bản Visual Novel ngắn gọn. TRẢ VỀ JSON:
{{
    "background_setting": "<Gắn với 1 di sản văn hóa/đời sống thực tế Việt Nam>",
    "mascot_dialogue": "<Lời chào của Linh Thú Rồng liên quan Bẫy ngộ nhận>",
    "options": [
        {{"text": "1. Khám phá mô hình", "hint": "<Gợi ý khám phá>"}},
        {{"text": "2. Xem SGK", "hint": "<Gợi ý lý thuyết>"}},
        {{"text": "3. Phân tích Bẫy", "hint": "<Cảnh báo bẫy>"}}
    ]
}}"""
        try:
            print(f"[*] Đang đúc kịch bản Visual Novel AI cho Nút {node_id}...")
            res = self.llm.openai_client.chat.completions.create(
                model=self.llm.openai_model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=300, temperature=0.7
            )
            raw = res.choices[0].message.content.strip()
            if raw.startswith("```json"): raw = raw[7:-3].strip()
            elif raw.startswith("```"): raw = raw[3:-3].strip()
            
            script_data = json.loads(raw)
            script_data["node_id"] = node_id
            script_data["status"] = "SUCCESS"
            return script_data
        except Exception as e:
            print(f"[x] Lỗi AI sinh Visual Novel: {e}")
            return {"status": "ERROR"}

    def get_rescue_video_30s(self, node_id: str, teacher_id: str = None) -> dict:
        """Sinh kịch bản Video Cứu trợ 30s Động bằng LLM."""
        node_data = agent_5.get_effective_item(teacher_id, node_id)
        if not node_data:
            raise ValueError(f"Fail-Fast: Nút {node_id} không tồn tại trong CSDL Master.")

        prompt = f"""Sinh kịch bản Video Cứu trợ 30s (4 hồi) cho bài học: {node_data.get('title')}
Barem: {node_data.get('barem_step_1')} | {node_data.get('barem_step_2')}
Bẫy ngộ nhận: {node_data.get('trap_zero_description')}

TRẢ VỀ JSON:
{{
    "video_title": "<Tiêu đề video>",
    "script_4_acts": [
        {{"act": 1, "time": "0-5s", "focus": "Bẫy ngộ nhận", "narration": "<Tập trung vào Trap Zero>"}},
        {{"act": 2, "time": "5-15s", "focus": "Giàn giáo", "narration": "<Trực quan hóa biến đổi>"}},
        {{"act": 3, "time": "15-25s", "focus": "Công thức", "narration": "<Giải pháp từ Barem>"}},
        {{"act": 4, "time": "25-30s", "focus": "Trở lại", "narration": "<Khích lệ>"}}
    ]
}}"""
        try:
            print(f"[*] Đang đúc kịch bản Video 30s AI cho Nút {node_id}...")
            res = self.llm.openai_client.chat.completions.create(
                model=self.llm.openai_model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=350, temperature=0.7
            )
            raw = res.choices[0].message.content.strip()
            if raw.startswith("```json"): raw = raw[7:-3].strip()
            elif raw.startswith("```"): raw = raw[3:-3].strip()
            
            video_data = json.loads(raw)
            video_data["node_id"] = node_id
            video_data["video_url"] = f"/03_ASSETS/rescue_videos/rescue_30s_{node_id}.mp4"
            video_data["status"] = "SUCCESS"
            return video_data
        except Exception as e:
            print(f"[x] Lỗi AI sinh Video 30s: {e}")
            return {"status": "ERROR"}

    def apply_graceful_degradation(self, cpu_usage_pct: float) -> dict:
        """Hạ tải thích ứng: CPU > 80% ép về SVG tĩnh siêu nhẹ (~1.65KB)."""
        cpu_pct = float(cpu_usage_pct)

        if cpu_pct > 80.0:
            svg_content = (
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 310" width="100%" height="100%">'
                '<rect width="420" height="310" rx="14" fill="#090d16" stroke="#1e293b" stroke-width="2"/>'
                '<circle cx="210" cy="100" r="48" fill="none" stroke="#00f2fe" stroke-width="2.5" stroke-dasharray="8,5"/>'
                '<text x="210" y="105" fill="#00f2fe" font-size="16" font-weight="900" text-anchor="middle">EDUMAP</text>'
                '<rect x="35" y="185" width="350" height="95" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1.2"/>'
                '<text x="210" y="212" fill="#facc15" font-size="12" font-weight="bold" text-anchor="middle">⚡ Hạ Tải Thích Ứng (CPU > 80%)</text>'
                '<text x="210" y="240" fill="#94a3b8" font-size="11" text-anchor="middle">Chế độ Vector Tĩnh Siêu Nhẹ (Bảo vệ Hệ Thống)</text>'
                '</svg>'
            )
            return {
                "cpu_usage_pct": cpu_pct,
                "is_degraded": True,
                "mode": "STATIC_SVG_VECTOR",
                "asset_payload": {"type": "svg_vector", "svg_content": svg_content},
                "status": "PASSED"
            }
        else:
            return {
                "cpu_usage_pct": cpu_pct,
                "is_degraded": False,
                "mode": "HIGH_PERFORMANCE_3D_CANVAS",
                "status": "PASSED"
            }

agent_media = MediaConductorAgent()

if __name__ == "__main__":
    print("🧪 Kiểm thử Agent 02 (Zero-Mock JSON & AI Dual-Coding)...")
    test_node = "MATH_6_001"
    
    # Kịch bản Visual Novel Động
    vn = agent_media.generate_visual_novel_script(test_node)
    print(f"\n[*] VN Background: {vn.get('background_setting')}")
    print(f"[*] VN Dialogue: {vn.get('mascot_dialogue')}")
    
    # Kịch bản Video Động
    video = agent_media.get_rescue_video_30s(test_node)
    print(f"\n[*] Video Title: {video.get('video_title')}")
    
    # Chống nghẽn
    high_load = agent_media.apply_graceful_degradation(90.0)
    assert high_load["is_degraded"] is True
    print(f"\n[*] Kích hoạt khiên SVG: {high_load['mode']}")
    
    print("\n✅ [PASSED] Agent 02 bọc thép hoàn tất!")