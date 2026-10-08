@echo off
chcp 65001 > nul
echo Conectando al servidor 192.168.1.253 por Escritorio Remoto con usuario JCMartinez...
cmdkey /generic:TERMSRV/192.168.1.253 /user:JCMartinez /pass:Sudowoodo.1701 >nul 2>&1
start mstsc /v:192.168.1.253
