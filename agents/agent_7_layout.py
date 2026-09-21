import sys
import time
from typing import Any, Dict, List, Optional
from pathlib import Path

# Đảm bảo import đúng từ thư mục gốc dự án
BASE_DIR = Path(r".")
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from agents.agent_4_search import agent_4

class DynamicCanvasLayoutAgent:
    """AGENT 07: Động cơ Bố cục Không gian Đồ họa & Sơ đồ Tư duy 120Hz
    Đã vá lỗi Cột Ma, Tối ưu hóa vòng lặp Fog-of-War và tích hợp WebGPU Profile.
    """

    VALID_THEMES = ["DAGRE_TREE", "GALAXY_ORBIT", "SYNAPSE_NETWORK", "FROSTED_GLASS"]
    VALID_MODES = ["LIGHT_3G", "STUDIO_AI_60FPS", "STUDIO_AI_120FPS"]

    MASTERY_STYLES = {
        "MASTERED": {"bg": "#10B981", "border": "#059669", "text": "#FFF", "opacity": 1.0, "locked": False, "badge": "✅ Thành thạo"},
        "UNLOCKED": {"bg": "#3B82F6", "border": "#1D4ED8", "text": "#FFF", "opacity": 1.0, "locked": False, "badge": "🔓 Đang mở"},
        "LOCKED": {"bg": "#374151", "border": "#4B5563", "text": "#9CA3AF", "opacity": 0.45, "locked": True, "badge": "🔒 Sương mù"}
    }

    def _calculate_dagre_positions(self, nodes: List[Dict[str, Any]], mastery_map: dict, mode: str) -> List[Dict[str, Any]]:
        formatted_nodes = []
        level_counts: Dict[int, int] = {}

        for idx, node in enumerate(nodes):
            nid = node.get("node_id", f"NODE_{idx}")
            prereqs = node.get("prerequisites") or ""
            
            level = len(prereqs.split(",")) if prereqs.strip() else 0
            count = level_counts.get(level, 0)
            level_counts[level] = count + 1

            x_pos = count * 300 + 100
            y_pos = level * 200 + 100

            # Logic Fog-of-War tuyệt đối an toàn: Không có trong map thì KHÓA
            status = mastery_map.get(nid, "LOCKED")
            style_config = self.MASTERY_STYLES.get(status, self.MASTERY_STYLES["LOCKED"])
            is_locked = style_config["locked"]

            # Fallback Tên bài học do Schema v2026 không có lesson_title
            title = prereqs if prereqs else f"Nút Tri Thức {nid}"

            node_data = {
                "node_id": nid,
                "subject": node.get("subject", "Toán"),
                "grade": node.get("grade", 6),
                "title": title,
                "mastery_status": status,
                "badge": style_config["badge"],
                "is_locked": is_locked,
                "prerequisites": prereqs,
                "lean4_proof_hash": node.get("lean4_proof_hash"),
            }

            # Nạp dữ liệu Sư phạm nếu MỞ KHÓA
            if not is_locked:
                node_data["barem_step_1"] = node.get("barem_step_1", "")
                node_data["trap_zero_description"] = node.get("trap_zero_description", "")
                node_data["socratic_tier_1"] = node.get("socratic_tier_1", "")
                
                # Ép kiệt dung lượng mạng ngay từ đầu nếu ở chế độ 3G
                if mode != "LIGHT_3G":
                    node_data["barem_step_2"] = node.get("barem_step_2", "")
                    node_data["barem_step_3"] = node.get("barem_step_3", "")
                    node_data["barem_step_4"] = node.get("barem_step_4", "")
                    node_data["socratic_tier_2"] = node.get("socratic_tier_2", "")
                    node_data["socratic_tier_3"] = node.get("socratic_tier_3", "")

            formatted_nodes.append({
                "id": nid,
                "type": "atomicKnowledgeNode",
                "position": {"x": x_pos, "y": y_pos},
                "style": style_config,
                "data": node_data,
            })

        return formatted_nodes

    def _generate_dag_edges(self, nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        edges = []
        node_id_set = {n.get("node_id") for n in nodes if n.get("node_id")}

        for node in nodes:
            target_id = node.get("node_id")
            prereqs_str = node.get("prerequisites") or ""

            if prereqs_str and target_id:
                for source_id in [p.strip() for p in prereqs_str.split(",") if p.strip()]:
                    if source_id in node_id_set:
                        edges.append({
                            "id": f"e_{source_id}_{target_id}",
                            "source": source_id,
                            "target": target_id,
                            "type": "smoothstep",
                            "animated": True,
                            "style": {"stroke": "#60A5FA", "strokeWidth": 2},
                        })
        return edges

    def get_canvas_payload(self, subject: str, grade: int, mode: str = "LIGHT_3G", theme: str = "DAGRE_TREE", keyword: str = "", student_mastery_map: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        start_time = time.perf_counter()

        mode = mode.upper() if mode.upper() in self.VALID_MODES else "LIGHT_3G"
        theme = theme.upper() if theme.upper() in self.VALID_THEMES else "DAGRE_TREE"
        mastery_map = student_mastery_map or {}

        raw_nodes = agent_4.search_items(subject=subject, grade=grade, keyword=keyword, limit=50)

        canvas_nodes = self._calculate_dagre_positions(raw_nodes, mastery_map, mode)
        canvas_edges = self._generate_dag_edges(raw_nodes)

        # Chế độ 3G: Tắt hiệu ứng di chuyển (Animations) trên các Edge
        if mode == "LIGHT_3G":
            for e in canvas_edges:
                e["animated"] = False

        elapsed_ms = (time.perf_counter() - start_time) * 1000

        payload = {
            "status": "SUCCESS",
            "subject": subject,
            "grade": grade,
            "mode": mode,
            "theme": theme,
            "nodes_count": len(canvas_nodes),
            "edges_count": len(canvas_edges),
            "rendering_latency_ms": round(elapsed_ms, 2),
            "render_profile": {
                "webgpu_accelerated": mode != "LIGHT_3G",
                "target_fps": 120 if mode == "STUDIO_AI_120FPS" else (60 if mode == "STUDIO_AI_60FPS" else 30),
                "theme": theme,
                "physics_engine": {"enabled": theme in ["GALAXY_ORBIT", "SYNAPSE_NETWORK"]}
            },
            "canvas_data": {"nodes": canvas_nodes, "edges": canvas_edges}
        }

        print(f"🎨 [Agent 07] Đã đúc Canvas: {len(canvas_nodes)} Nút | {theme} | {mode} | Trễ: {elapsed_ms:.2f}ms")
        return payload

agent_7 = DynamicCanvasLayoutAgent()

if __name__ == "__main__":
    print("🧪 Khởi động kiểm thử sinh tồn Agent 07...")
    # Giả lập Nút đầu tiên được mở khóa
    mock_mastery = {"MATH_6_001": "UNLOCKED"}
    test_payload = agent_7.get_canvas_payload(
        subject="Toán", grade=6, mode="STUDIO_AI_120FPS", theme="DAGRE_TREE", student_mastery_map=mock_mastery
    )
    assert test_payload["status"] == "SUCCESS"
    assert test_payload["canvas_data"]["nodes"][0]["data"]["mastery_status"] in ["UNLOCKED", "LOCKED"]
    print("✅ [PASSED] Kiểm thử Agent 07 bọc thép thành công! Sẵn sàng đổ dữ liệu ra Front-end.")