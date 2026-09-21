@echo off
title YourDream.vn Production Server
color 0b
echo ============================================================
echo       KHOI DONG HE SINH THAI CHINH THUC: YOURDREAM.VN
echo ============================================================
echo.
cd /d "%~dp0"

REM Kiem tra moi truong venv tu thu muc lab
if exist "D:\edumap\edumap streamlit\venv\Scripts\activate.bat" (
    call "D:\edumap\edumap streamlit\venv\Scripts\activate.bat"
) else if exist "venv\Scripts\activate.bat" (
    call "venv\Scripts\activate.bat"
)

echo Dang khoi dong WebApp 6 Phong va Cong Proxy 8502...
streamlit run app.py
pause
