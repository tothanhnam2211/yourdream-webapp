import os
import asyncio
from datetime import datetime
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import edge_tts

BASE_DIR = Path(r".")
MEDIA_DIR = BASE_DIR / "03_ASSETS" / "media"
FONTS_DIR = BASE_DIR / "03_ASSETS" / "fonts"

os.makedirs(MEDIA_DIR, exist_ok=True)
os.makedirs(FONTS_DIR, exist_ok=True)

class BoTruyenThongVaBaoMat:
    def __init__(self):
        # Thiết lập phông chữ cho Thủy vân
        self.font_path = FONTS_DIR / "times.ttf"
        
    def dong_dau_thuy_van_chong_quay_len(self, duong_dan_anh_goc, user_id, ip_address):
        """
        Khóa bảo vệ hình ảnh/canvas: Đóng dấu thủy vân động (Dynamic Watermark).
        Độ nghiêng 30 độ, Alpha 18% (RGBA), chứa User ID + IP + Timestamp.
        """
        try:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            chuoi_thuy_van = f"[{user_id} | {ip_address} | {timestamp}]"
            
            anh_goc = Image.open(duong_dan_anh_goc).convert("RGBA")
            rong, cao = anh_goc.size
            
            # Tạo lớp màng trong suốt (Transparent overlay)
            mang_thuy_van = Image.new("RGBA", anh_goc.size, (255, 255, 255, 0))
            draw = ImageDraw.Draw(mang_thuy_van)
            
            try:
                font = ImageFont.truetype(str(self.font_path), int(cao / 30))
            except IOError:
                font = ImageFont.load_default()
                
            # Alpha 18% tương đương khoảng 46/255 trong dải RGBA
            mau_chu_chong_sao_chep = (150, 150, 150, 46) 
            
            # Tính toán vị trí và vẽ chữ
            bbox = draw.textbbox((0, 0), chuoi_thuy_van, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            x = (rong - text_width) / 2
            y = (cao - text_height) / 2
            
            draw.text((x, y), chuoi_thuy_van, font=font, fill=mau_chu_chong_sao_chep)
            
            # Xoay chữ 30 độ để chống cắt cúp (Cropping)
            mang_thuy_van = mang_thuy_van.rotate(30, resample=Image.BICUBIC, center=(rong/2, cao/2))
            
            # Ép lớp thủy vân lên ảnh gốc
            anh_da_dong_dau = Image.alpha_composite(anh_goc, mang_thuy_van)
            
            duong_dan_xuat = str(duong_dan_anh_goc).replace(".png", "_watermarked.png").replace(".jpg", "_watermarked.jpg")
            anh_da_dong_dau.convert("RGB").save(duong_dan_xuat, quality=95)
            
            print(f"[v] Đã bọc thép Thủy vân cho ảnh: {Path(duong_dan_xuat).name}")
            return duong_dan_xuat
        except Exception as e:
            print(f"[x] LỖI SỤP ĐỔ HỆ THỐNG THỦY VÂN: {str(e)}")
            return duong_dan_anh_goc

    async def _tao_audio_tts(self, kich_ban_text, duong_dan_xuat):
        """Hàm chạy ngầm bất đồng bộ của Edge-TTS."""
        giong_doc = "vi-VN-HoaiMyNeural" # Giọng chuẩn Socratic
        communicate = edge_tts.Communicate(kich_ban_text, giong_doc)
        await communicate.save(duong_dan_xuat)

    def sinh_giong_doc_socratic(self, ma_nut, kich_ban_text):
        """
        Tác tử Âm thanh: Gọi Edge-TTS tạo giọng đọc miễn phí.
        Hỗ trợ đọc các kịch bản có chứa thẻ <break time> ngầm.
        """
        duong_dan_audio = MEDIA_DIR / f"Audio_Socratic_{ma_nut}.mp3"
        print(f"[*] Đang thu âm giọng đọc Socratic cho {ma_nut}...")
        try:
            asyncio.run(self._tao_audio_tts(kich_ban_text, str(duong_dan_audio)))
            print(f"[v] Đã xuất bản luồng Audio: {duong_dan_audio.name}")
            return str(duong_dan_audio)
        except Exception as e:
            print(f"[!] LỖI RENDER ÂM THANH: {str(e)}")
            return None

media_engine = BoTruyenThongVaBaoMat()