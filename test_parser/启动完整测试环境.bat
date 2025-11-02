@echo off
chcp 65001 >nul
echo ========================================
echo 简历测试与翻译 - 完整环境启动
echo ========================================
echo.
echo 将启动两个服务：
echo   1. 查看器服务器 (端口 8000)
echo   2. 翻译服务器   (端口 5001)
echo.
echo 请在两个新窗口中分别启动...
echo ========================================
echo.

cd /d "%~dp0"

:: 启动查看器服务器
echo 正在启动查看器服务器...
start "简历查看器 - 端口8000" cmd /k "echo 查看器服务器已启动 & echo 浏览器访问: http://localhost:8000/viewer.html & echo. & python -m http.server 8000"

:: 等待1秒
timeout /t 1 /nobreak >nul

:: 启动翻译服务器
echo 正在启动翻译服务器...
start "翻译服务器 - 端口5001" cmd /k "echo 翻译服务器已启动 & echo API地址: http://localhost:5001 & echo. & python translation_server.py"

:: 等待2秒后打开浏览器
timeout /t 2 /nobreak >nul

echo.
echo ✅ 服务器启动完成！
echo.
echo 现在可以打开浏览器访问:
echo   http://localhost:8000/viewer.html
echo.

:: 自动打开浏览器
start http://localhost:8000/viewer.html

echo 按任意键关闭此窗口（不会关闭服务器）...
pause >nul

