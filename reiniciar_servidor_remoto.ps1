$sec = ConvertTo-SecureString "Sudowoodo.1701" -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential("JCMartinez", $sec)

try {
    Write-Host "Probando conexion WMI con 192.168.1.253..."
    $os = Get-WmiObject -Class Win32_OperatingSystem -ComputerName "192.168.1.253" -Credential $cred -ErrorAction Stop
    Write-Host "Conexion WMI exitosa:" $os.Caption
    
    Write-Host "Terminando procesos python.exe en el servidor..."
    $procs = Get-WmiObject -Class Win32_Process -Filter "Name = 'python.exe' or Name = 'pythonw.exe'" -ComputerName "192.168.1.253" -Credential $cred
    foreach ($p in $procs) {
        Write-Host "Terminando PID:" $p.ProcessId "Cmd:" $p.CommandLine
        $p.Terminate() | Out-Null
    }
    
    Start-Sleep -Seconds 2
    
    Write-Host "Iniciando servidor en 192.168.1.253..."
    $cmd = 'cmd.exe /c "cd /d C:\Users\JCMartinez\ALTA_ARTICULOS && C:\Users\JCMartinez\Python312\python.exe server.py 6060"'
    $res = Invoke-WmiMethod -Class Win32_Process -Name Create -ArgumentList $cmd, "C:\Users\JCMartinez\ALTA_ARTICULOS" -ComputerName "192.168.1.253" -Credential $cred
    Write-Host "Resultado lanzamiento:" ($res | ConvertTo-Json -Compress)
} catch {
    Write-Host "Error durante ejecucion remota:" $_.Exception.Message
}
