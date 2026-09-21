import os
import json
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

BASE_DIR = Path(r"D:\YOURDREAM.VN")
EXPORTS_DIR = BASE_DIR / "05_EXPORTS_5512"
ASSETS_DIR = BASE_DIR / "03_ASSETS"

class BoXuatBanHocLieu:
    def __init__(self):
        # Đảm bảo lô cốt chứa đầu ra và tài nguyên tồn tại
        os.makedirs(EXPORTS_DIR, exist_ok=True)
        os.makedirs(ASSETS_DIR / "fonts", exist_ok=True)
        self._nap_vu_khi_font_unicode()

    def _nap_vu_khi_font_unicode(self):
        """Bọc thép Unicode: Nạp font TrueType để tiêu diệt lỗi ô vuông trên PDF."""
        font_path = ASSETS_DIR / "fonts" / "times.ttf"
        try:
            if font_path.exists():
                pdfmetrics.registerFont(TTFont('TimesNewRoman', str(font_path)))
                self.font_name = 'TimesNewRoman'
                print("[v] Đã nạp giáp Unicode (times.ttf) thành công.")
            else:
                self.font_name = 'Helvetica'
                print("[!] CẢNH BÁO SINH TỒN: Không tìm thấy times.ttf. Fallback về Helvetica (Sẽ lỗi dấu Tiếng Việt).")
        except Exception as e:
            self.font_name = 'Helvetica'
            print(f"[x] LỖI NẠP FONT: {e}")

    def _chot_chan_sinh_ton(self, ma_nut, du_lieu_json, dinh_dang):
        """Khóa chống mất dữ liệu: Tự động ghi bản thô .txt trước khi gọi đồ họa phức tạp."""
        txt_path = EXPORTS_DIR / f"BACKUP_{ma_nut}_{dinh_dang}.txt"
        try:
            with open(txt_path, "w", encoding="utf-8") as f:
                f.write(json.dumps(du_lieu_json, ensure_ascii=False, indent=2))
            print(f"[v] Đã ghi chốt chặn an toàn tại: {txt_path.name}")
        except Exception as e:
            print(f"[x] Lỗi ghi chốt chặn sinh tồn: {e}")

    def xuat_magic_cards_2_mat(self, node_data: dict, ten_file: str):
        """
        Case 5: Đúc Thẻ bài Magic Cards 2 mặt (Flashcards).
        Áp dụng thuật toán Đảo cột Trang 2 đối ứng (Horizontal Mirror Alignment).
        """
        pdf_path = EXPORTS_DIR / f"MagicCards_{ten_file}.pdf"
        ma_nut = node_data.get("node_id", "UNKNOWN_NODE")
        
        # 1. Kích hoạt chốt chặn trước khi mở luồng đồ họa
        self._chot_chan_sinh_ton(ma_nut, node_data, "MAGIC_CARDS")

        print(f"[*] Đang đúc khuôn Thẻ bài Ma Thuật cho Nút: {ma_nut}...")
        try:
            c = canvas.Canvas(str(pdf_path), pagesize=A4)
            width, height = A4
            c.setFont(self.font_name, 12)

            # Trích xuất dữ liệu thẻ từ JSON (Ví dụ mẫu)
            hoi_1 = node_data.get('barem_step_1', 'Câu hỏi 1 trống')[:60]
            dap_1 = f"Đáp án 1: {node_data.get('socratic_tier_1', '...')}"[:60]
            hoi_2 = node_data.get('barem_step_2', 'Câu hỏi 2 trống')[:60]
            dap_2 = f"CẢNH BÁO BẪY: {node_data.get('trap_zero_description', '...')}"[:60]

            # =========================================================
            # TRANG 1: MẶT TRƯỚC (CÂU HỎI)
            # =========================================================
            c.drawString(100, height - 50, f"MẶT TRƯỚC - Nút: {ma_nut}")
            
            # Khung Cột 1 (Trái)
            c.rect(50, height - 250, width/2 - 70, 150)
            c.drawString(60, height - 150, f"Hỏi (Thẻ A): {hoi_1}")
            
            # Khung Cột 2 (Phải)
            c.rect(width/2 + 20, height - 250, width/2 - 70, 150)
            c.drawString(width/2 + 30, height - 150, f"Hỏi (Thẻ B): {hoi_2}")
            
            c.showPage() # Ngắt trang

            # =========================================================
            # TRANG 2: MẶT SAU (ĐÁP ÁN) - THUẬT TOÁN ĐẢO CỘT ĐỐI ỨNG
            # =========================================================
            c.setFont(self.font_name, 12)
            c.drawString(100, height - 50, f"MẶT SAU (In lật ngang chuẩn khớp)")

            # Thuật toán Đảo: Đáp án Thẻ B phải in vào Cột 1 (Trái)
            c.rect(50, height - 250, width/2 - 70, 150)
            c.drawString(60, height - 150, dap_2)
            
            # Thuật toán Đảo: Đáp án Thẻ A phải in vào Cột 2 (Phải)
            c.rect(width/2 + 20, height - 250, width/2 - 70, 150)
            c.drawString(width/2 + 30, height - 150, dap_1)
            
            c.save()
            print(f"[v] Đúc thành công Magic Cards sẵn sàng in lật mặt: {pdf_path.name}")
            return True
            
        except Exception as e:
            print(f"[!] SỤP ĐỔ ĐỒ HỌA BỀN MẶT: {str(e)}")
            return False

export_engine_instance = BoXuatBanHocLieu()