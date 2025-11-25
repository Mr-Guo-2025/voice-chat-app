@echo off
echo Starting Cloudflare Tunnel...
echo This will provide a stable HTTPS URL for your local server.
echo.
echo Please wait for the URL to appear below (it will look like https://xxxx-xxxx.trycloudflare.com).
echo.
cloudflared tunnel --url http://localhost:3000
pause
