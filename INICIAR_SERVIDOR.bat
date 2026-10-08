@echo off
chcp 65001 > nul
title ERP BC Refaccionarias - Servidor 5000

if exist "C:\Users\JCMartinez\ALTA_ARTICULOS" (
    cd /d "C:\Users\JCMartinez\ALTA_ARTICULOS"
) else (
    cd /d "%~dp0"
)

echo ==============================================================
echo  ERP BC Refaccionarias - Servidor Local (Puerto 5000)
echo ==============================================================

set "PORT=5000"
set "ERP_PORT=5000"

netsh advfirewall firewall add rule name="ERP BC Refaccionarias 5000" dir=in action=allow protocol=TCP localport=5000 >nul 2>&1

set "PY=python.exe"
if exist "C:\Users\JCMartinez\Python312\python.exe" (
    set "PY=C:\Users\JCMartinez\Python312\python.exe"
) else if exist "C:\Users\Z840\AppData\Local\Programs\Python\Python312\python.exe" (
    set "PY=C:\Users\Z840\AppData\Local\Programs\Python\Python312\python.exe"
)

echo Carpeta de trabajo: %CD%
echo Usando Python: %PY%
echo Iniciando servidor en puerto %PORT%...
"%PY%" server.py %PORT%
pause
