@echo off
title ERP BC Refaccionarias - Estado del Servidor
echo ========================================================
echo  Verificando Estado del Servidor ERP...
echo ========================================================

rem Obtener IP LAN actual dinamicamente
set LAN_IP=192.168.1.12
for /f "tokens=*" %%a in ('powershell -NoProfile -Command "([System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) | Where-Object AddressFamily -eq 'InterNetwork' | ForEach-Object IPAddressToString | Select-String '^192\.168\.1\.')[0].ToString().Trim()" 2^>nul') do (
    if not "%%a"=="" set LAN_IP=%%a
)

netstat -ano | findstr :5000 >nul
if %errorlevel% equ 0 (
    echo [ESTADO: EN LINEA 100%%]
    echo.
    echo El servidor responde correctamente en el puerto 5000.
    echo Direcciones disponibles:
    echo   - Local:     http://localhost:5000
    echo   - Red LAN:   http://%LAN_IP%:5000
    echo.
) else (
    echo [ESTADO: DETENIDO]
    echo El servidor no esta escuchando en el puerto 5000.
    echo Ejecuta INICIAR_SERVIDOR.bat para encenderlo.
    echo.
)
pause
