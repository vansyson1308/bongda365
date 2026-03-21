@echo off
title BongDa365 - SofaScore Proxy + Tunnel
echo ============================================
echo   BongDa365 - Local Proxy + Quick Tunnel
echo ============================================
echo.

REM Kill any existing process on port 3001
echo [1/3] Checking port 3001...
powershell -Command "Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" 2>nul
echo OK

REM Start sofa-proxy.js in background
echo [2/3] Starting sofa-proxy.js...
cd /d "%~dp0"
start "SofaProxy" /min cmd /c "node sofa-proxy.js"
timeout /t 2 /nobreak >nul

REM Verify proxy is running
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3001/health' -UseBasicParsing -TimeoutSec 3; Write-Host 'Proxy OK:' $r.Content } catch { Write-Host 'ERROR: Proxy not responding!' }"
echo.

REM Start Quick Tunnel (no login needed, gives trycloudflare.com URL)
echo [3/3] Starting Quick Tunnel...
echo.
echo   Copy the URL (*.trycloudflare.com) va set tren Render:
echo   Key:   SOFA_PROXY_URL
echo   Value: https://xxxxx.trycloudflare.com
echo.
echo ============================================
cloudflared.exe tunnel --url http://localhost:3001

REM If tunnel exits, restart loop
echo.
echo TUNNEL DA DUNG! Dang khoi dong lai trong 5 giay...
timeout /t 5 /nobreak >nul
goto :eof
