@echo off
title Instalar ERP como Tarea de Arranque del Sistema
echo ========================================================
echo  Instalador de Tarea de Arranque Perpetuo (Al Encender PC)
echo ========================================================
echo.
echo Este instalador configura Windows para que el ERP encienda
echo automaticamente AL ENCENDER LA PC (incluso antes de iniciar sesion).
echo.
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [AVISO] Por favor ejecuta este archivo como ADMINISTRADOR.
    echo Haz clic derecho sobre este archivo y elige "Ejecutar como administrador".
    echo.
    pause
    exit /b
)

schtasks /Create /TN "ERP_BC_Refaccionarias_Boot" /TR "\"C:\Users\Z840\AppData\Local\Programs\Python\Python312\pythonw.exe\" \"C:\Users\Z840\Documents\ALTA DE ARTICULOS -NVO\perpetual_service.py\"" /SC ONSTART /RU "SYSTEM" /RL HIGHEST /F

if %errorlevel% equ 0 (
    echo.
    echo ========================================================
    echo  [EXITO] Tarea de arranque del sistema registrada!
    echo  El servidor ahora encendera siempre con la PC.
    echo ========================================================
) else (
    echo.
    echo [ERROR] No se pudo registrar la tarea. Revisa los permisos.
)
echo.
pause
