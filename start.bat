@echo off
setlocal
set "NODE_DIR=%TEMP%\node-portable\node-v22.14.0-win-x64"
set "PATH=%NODE_DIR%;%PATH%"
echo.
echo  [🥊 网页拳皇服务器]
echo.
echo  启动中...
node server.js
if errorlevel 1 (
    echo.
    echo  [!] 启动失败! 请确认已安装 Node.js
    pause
)
endlocal
