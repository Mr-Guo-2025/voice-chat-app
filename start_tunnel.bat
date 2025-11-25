@echo off
echo 正在啟動 LocalTunnel...
echo.
echo 請稍等，網址即將出現...
echo.
echo 如果您想要固定的網址，請編輯此檔案，在指令後加上 --subdomain your-name
echo 例如: npx localtunnel --port 3000 --subdomain my-chat-app-123
echo.
call npx localtunnel --port 3000
pause
