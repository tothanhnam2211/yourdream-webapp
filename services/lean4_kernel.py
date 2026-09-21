import os
import json
import hashlib
import tempfile
import subprocess
import requests
from pathlib import Path
from dotenv import load_dotenv

# =====================================================================
# THIẾT LẬP MÔI TRƯỜNG & KHÓA BẢO MẬT HUGGING FACE
# =====================================================================
BASE_DIR = Path(r"D:\YOURDREAM.VN")
load_dotenv(BASE_DIR / ".env")

HF_TOKEN = os.getenv("HF_TOKEN")
# Sử dụng mô hình chuyên biệt cho Toán học/Logic trên Hugging Face
HF_API_URL = "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-Math-1.5B-Instruct"

class Lean4Verifier:
    def __init__(self, lean_executable_path="lean"):
        self.lean_path = lean_executable_path

    def checkNodeReadConsistency(self, node_data: dict) -> tuple[bool, str]:
        """
        Trạm kiểm định Hợp nhất Lean 4.
        Khóa chặn khoảng trắng và cấp chứng thư SHA-256.
        """
        required_fields = [
            "node_id", "subject", "grade", "barem_step_1", "barem_step_2"
        ]
        
        # 1. CHỐT CHẶN THÉP: Chống qua mặt bằng chuỗi rỗng/khoảng trắng (Whitespace Bypass)
        for field in required_fields:
            if not str(node_data.get(field, "")).strip():
                return False, f"LỖI CẤU TRÚC: Trường '{field}' trống hoặc chứa rác."

        # 2. BỘ ĐIỀU PHỐI LOGIC VÀ BIÊN DỊCH
        if node_data.get("subject", "").upper() == "TOÁN":
            logic_valid, lean_certificate = self._autoformalize_and_verify(node_data)
            if not logic_valid:
                return False, f"LỖI TOÁN HỌC: {lean_certificate}"
        else:
            lean_certificate = "NON_MATH_BYPASS"

        # 3. CHỨNG CHỈ KÉP (Toàn vẹn dữ liệu + Chứng nhận Lean 4)
        raw_str = json.dumps(node_data, sort_keys=True, ensure_ascii=False)
        chot_chan_toan_ven = raw_str + lean_certificate
        proof_hash = hashlib.sha256(chot_chan_toan_ven.encode("utf-8")).hexdigest()
        
        return True, f"CERT-{proof_hash[:16]}"

    def _autoformalize_and_verify(self, node_data: dict) -> tuple[bool, str]:
        """
        Đẩy gánh nặng suy luận (Transpiler) lên Cloud Hugging Face.
        Biên dịch vật lý cục bộ bằng Lean 4 với Timeout sinh tồn.
        """
        print(f"[*] Đang gọi Hugging Face API dịch Barem sang Lean 4 cho {node_data.get('node_id')}...")
        
        headers = {"Authorization": f"Bearer {HF_TOKEN}"}
        prompt = f"Translate this math step to formal Lean 4 code: {node_data.get('barem_step_2')}. Output ONLY valid Lean 4 syntax without markdown."
        
        # 1. KẾT NỐI API ĐÁM MÂY (Cloud AI Transpiler)
        try:
            response = requests.post(
                HF_API_URL, 
                headers=headers, 
                json={"inputs": prompt, "parameters": {"max_new_tokens": 150}},
                timeout=10
            )
            if response.status_code != 200:
                return False, f"LỖI API CLOUD: {response.status_code} - {response.text}"
                
            ma_lean = response.json()[0].get("generated_text", "").replace(prompt, "").strip()
            # Xử lý nhanh nếu AI trả về markdown
            ma_lean = ma_lean.replace("```lean", "").replace("```", "").strip()
        except Exception as e:
            return False, f"LỖI KẾT NỐI HUGGING FACE: {str(e)}"

        # 2. THỰC THI VẬT LÝ CỤC BỘ (Local Lean 4 Kernel)
        # Sử dụng tempfile độc lập để không xả rác ổ cứng
        fd, temp_path = tempfile.mkstemp(suffix=".lean", dir=str(BASE_DIR))
        
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                f.write(ma_lean)
            
            print(f"[*] Đang biên dịch vật lý bằng Lean 4 (Timeout=3s)...")
            # CẦU DAO SINH TỒN: Cắt đứt vòng lặp vô hạn sau 3 giây
            result = subprocess.run(
                [self.lean_path, temp_path], 
                capture_output=True, 
                text=True, 
                timeout=3
            )
            
            if result.returncode == 0:
                return True, "LEAN4_VERIFIED_SUCCESS"
            else:
                return False, f"LỖI TỪ CHỐI (Lean 4): {result.stderr.strip()[:200]}"
                
        except subprocess.TimeoutExpired:
            return False, "LEAN4_PENDING: Mệnh đề toán học gây treo hệ thống quá 3 giây (Timeout)."
        except FileNotFoundError:
            return False, "THIẾU VŨ KHÍ: Không tìm thấy tệp thực thi 'lean' trên hệ thống. Hãy cài đặt bộ biên dịch."
        except Exception as e:
            return False, f"LỖI HỆ THỐNG VẬT LÝ: {str(e)}"
        finally:
            # QUY TRÌNH DỌN RÁC: Xóa file tạm dù thành công hay sập lỗi
            if os.path.exists(temp_path):
                os.remove(temp_path)

lean4_kernel_instance = Lean4Verifier()