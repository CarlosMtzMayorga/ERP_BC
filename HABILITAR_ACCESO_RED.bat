@echo off
title Habilitar Acceso de Red y Firewall - ERP BC Refaccionarias
echo ========================================================
echo  Configurando Firewall de Windows para permitir acceso...
echo ========================================================
echo.
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [IMPORTANTE] Por favor ejecuta este archivo como ADMINISTRADOR.
    echo Haz clic derecho sobre este archivo y elige "Ejecutar como administrador".
    echo.
    pause
    exit /b
)

netsh advfirewall firewall add rule name="ERP BC Refaccionarias (Port 5000)" dir=in action=allow protocol=TCP localport=5000 profile=any
netsh advfirewall firewall add rule name="ERP BC Python (Allow All)" dir=in action=allow program="C:\Users\Z840\AppData\Local\Programs\Python\Python312\python.exe" profile=any
netsh advfirewall firewall add rule name="ERP BC PythonW (Allow All)" dir=in action=allow program="C:\Users\Z840\AppData\Local\Programs\Python\Python312\pythonw.exe" profile=any

echo.
echo ========================================================
echo  [EXITO] Firewall configurado para permitir acceso en red!
echo  Direccion para otras computadoras:
echo  http://192.168.1.12:5000
echo ========================================================
echo.
pause
