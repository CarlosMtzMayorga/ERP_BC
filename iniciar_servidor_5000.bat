@echo off
title ERP BC Refaccionarias - Servidor Puerto 5000
echo ========================================================
echo   ERP BC REFACCIONARIAS - SERVIDOR LOCAL ACTIVO
echo   Puerto: 5000
echo   URL:    http://localhost:5000
echo ========================================================
cd /d "%~dp0"
"C:\Users\Z840\AppData\Local\Programs\Python\Python312\python.exe" server.py 5000
if %ERRORLEVEL% NEQ 0 (
    echo El servidor se detuvo con codigo de error %ERRORLEVEL%.
    pause
)
