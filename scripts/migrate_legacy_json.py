import os, sys, json, sqlite3, time
from pathlib import Path

BASE_DIR = Path(r'D:\YOURDREAM.VN')
LEGACY_DIR = Path(r'D:\YOURDREAM_ARCHIVE\local_data\atomic_nodes')
DB_PATH = BASE_DIR / 'yourdream.db'

def read_json_safely(file_path):
    encodings = ['utf-8-sig', 'utf-8', 'cp1258', 'latin-1']
    for enc in encodings:
        try:
            with open(file_path, 'r', encoding=enc) as f:
                return json.load(f)
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
    raise ValueError("Lỗi bảng mã không xác định hoặc cấu trúc JSON bị hỏng")

def migrate_2335_json_to_db():
    if not LEGACY_DIR.exists():
        print(f'[x] Không tìm thấy kho di sản {LEGACY_DIR}.')
        return

    json_files = list(LEGACY_DIR.glob('*.json'))
    if not json_files:
        print(f'[x] Kho lưu trữ trống.')
        return

    print(f'[*] Đã khóa mục tiêu {len(json_files)} tệp JSON di sản. Khởi động máy bơm Bọc thép...')
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 🛡️ LƯỠI DAO TÀN NHẪN: San phẳng bảng cũ bị lỗi cấu trúc
    cursor.execute('DROP TABLE IF EXISTS atomic_nodes')
    
    # 🛡️ ĐÚC LẠI NỀN MÓNG: Khởi tạo bảng chuẩn Schema v2026
    cursor.execute('''
        CREATE TABLE atomic_nodes (
            node_id TEXT PRIMARY KEY,
            subject TEXT,
            grade INTEGER,
            chapter_title TEXT,
            lesson_title TEXT,
            order_index INTEGER,
            parent_node_id TEXT,
            prerequisites TEXT,
            barem_step_1 TEXT,
            barem_step_2 TEXT,
            barem_step_3 TEXT,
            barem_step_4 TEXT,
            trap_zero_description TEXT,
            socratic_tier_1 TEXT,
            socratic_tier_2 TEXT,
            socratic_tier_3 TEXT,
            lean4_proof_hash TEXT,
            created_at TEXT
        )
    ''')
    conn.commit()

    success, fail = 0, 0

    for file_path in json_files:
        try:
            data = read_json_safely(file_path)
            
            node_id = data.get('node_id') or file_path.stem.upper()
            now_ts = time.strftime('%Y-%m-%d %H:%M:%S')

            cursor.execute('''
                INSERT INTO atomic_nodes (
                    node_id, subject, grade, chapter_title, lesson_title,
                    prerequisites, barem_step_1, barem_step_2, barem_step_3, barem_step_4,
                    trap_zero_description, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                node_id,
                data.get('subject', 'Toán'),
                data.get('grade', 9),
                data.get('chapter_title', 'Di sản nhập liệu'),
                data.get('lesson_title', data.get('lesson_title', data.get('title', 'Không tên'))),
                data.get('prerequisites', ''),
                data.get('barem_step_1', ''),
                data.get('barem_step_2', ''),
                data.get('barem_step_3', ''),
                data.get('barem_step_4', ''),
                data.get('trap_zero_description', ''),
                now_ts
            ))
            success += 1
        except Exception as e:
            fail += 1
            if fail == 1:
                print(f"🚨 [TỬ HUYỆT] Lỗi mẫu tại tệp '{file_path.name}': {type(e).__name__} - {e}")

    conn.commit()
    conn.close()

    print('=' * 60)
    print(f'✅ HÚT DỮ LIỆU HOÀN TẤT.')
    print(f'   - Bơm thành công : {success} Nút Tri Thức.')
    print(f'   - Thất bại       : {fail} Tệp.')
    print('=' * 60)

if __name__ == '__main__':
    migrate_2335_json_to_db()
