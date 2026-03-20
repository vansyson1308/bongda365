@echo off
echo ============================================
echo   BongDa365 - Cloudflare Named Tunnel Setup
echo ============================================
echo.

REM Step 1: Login to Cloudflare (opens browser)
echo [1/4] Dang mo trinh duyet de dang nhap Cloudflare...
cloudflared.exe tunnel login
if errorlevel 1 (
    echo LOI: Khong the dang nhap. Hay thu lai.
    pause
    exit /b 1
)
echo OK - Da dang nhap Cloudflare!
echo.

REM Step 2: Create named tunnel
echo [2/4] Tao tunnel "bongda365-proxy"...
cloudflared.exe tunnel create bongda365-proxy
if errorlevel 1 (
    echo CANH BAO: Tunnel co the da ton tai. Tiep tuc...
)
echo.

REM Step 3: Create config file
echo [3/4] Tao file cau hinh...
mkdir "%USERPROFILE%\.cloudflared" 2>nul

REM Get tunnel ID
for /f "tokens=1" %%i in ('cloudflared.exe tunnel list -o json 2^>nul ^| findstr /i "bongda365-proxy"') do set TUNNEL_ID=%%i

echo url: http://localhost:3001 > "%USERPROFILE%\.cloudflared\config.yml"
echo tunnel: bongda365-proxy >> "%USERPROFILE%\.cloudflared\config.yml"
echo credentials-file: %USERPROFILE%\.cloudflared\cert.pem >> "%USERPROFILE%\.cloudflared\config.yml"

echo OK - File cau hinh da tao!
echo.

REM Step 4: Setup DNS route
echo [4/4] Tao DNS route...
cloudflared.exe tunnel route dns bongda365-proxy sofa-proxy.bongda365.xyz 2>nul
echo.

echo ============================================
echo   HOAN TAT!
echo   Tunnel URL co dinh: https://sofa-proxy.bongda365.xyz
echo.
echo   De chay tunnel: cloudflared.exe tunnel run bongda365-proxy
echo ============================================
pause
