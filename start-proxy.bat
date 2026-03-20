@echo off
title BongDa365 - SofaScore Proxy + Tunnel
echo ============================================
echo   BongDa365 - Local Proxy Startup
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
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3001/health' -UseBasicParsing -TimeoutSec 3; Write-Host 'Proxy status:' $r.Content } catch { Write-Host 'ERROR: Proxy not responding!' }"
echo.

REM Start Cloudflare Tunnel
echo [3/3] Starting Cloudflare Tunnel...
echo      URL: https://sofa-proxy.bongda365.xyz
echo.
cloudflared.exe tunnel run bongda365-proxy

REM If tunnel exits, keep window open
echo.
echo TUNNEL STOPPED! Press any key to restart...
pause
goto :eof
