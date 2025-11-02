@echo off
echo ========================================
echo 启动简历翻译服务器
echo ========================================
echo.
echo 请确保已配置环境变量:
echo   OPENAI_API_KEY
echo   OPENAI_BASE_URL (可选)
echo.
echo 服务器地址: http://localhost:5001
echo.
echo 按 Ctrl+C 停止服务器
echo ========================================
echo.

python translation_server.py

pause

