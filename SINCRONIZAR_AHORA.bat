@echo off
chcp 65001 > nul
cd /d "%~dp0"
title Sincronizar Todo a Servidor 192.168.1.253

echo Conectando con servidor 192.168.1.253...
net use \\192.168.1.253\ipc$ Sudowoodo.1701 /user:JCMartinez >nul 2>&1

echo Enviando cambios al servidor de aplicaciones...
robocopy "%~dp0." "\\192.168.1.253\Users\JCMartinez\ALTA_ARTICULOS" /MIR /XD __pycache__ .git .gemini /XF *.pyc *.log /R:1 /W:1 /NFL /NDL

if %ERRORLEVEL% LEQ 7 (
    echo.
    echo ======================================================
    echo [OK] Todos los archivos estan sincronizados al 100%%.
    echo ======================================================
) else (
    echo.
    echo [ERROR] Ocurrio un problema al sincronizar. Verifique la conexion.
)
echo Proceso finalizado.
