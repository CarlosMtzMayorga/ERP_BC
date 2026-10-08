@echo off
chcp 65001 > nul
cd /d "%~dp0"
title Sincronizador VS Code -> Servidor 192.168.1.253

echo ==============================================================
echo  Conectando con Servidor 192.168.1.253...
echo ==============================================================
net use \\192.168.1.253\ipc$ Sudowoodo.1701 /user:JCMartinez >nul 2>&1

:: Buscar interprete Python local
set "PY=C:\Users\Z840\AppData\Local\Programs\Python\Python312\python.exe"
if not exist "%PY%" set "PY=python"

"%PY%" "%~dp0sincronizar_con_servidor.py"
pause
