@echo off
title ERP BC Refaccionarias - Detener Servidor
echo ========================================================
echo  Deteniendo Servidor ERP BC Refaccionarias...
echo ========================================================
taskkill /F /IM pythonw.exe 2>nul
taskkill /F /IM python.exe 2>nul
echo.
echo [OK] Servidor detenido.
pause
