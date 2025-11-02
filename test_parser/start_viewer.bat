@echo off
chcp 65001 >nul
echo ========================================
echo 启动简历测试查看器
echo ========================================
echo.
echo 浏览器访问: http://localhost:8000/viewer.html
echo.
echo 按 Ctrl+C 停止服务器
echo ========================================
echo.

cd /d "%~dp0"
python -m http.server 8000

pause

