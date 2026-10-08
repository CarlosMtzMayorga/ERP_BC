$pythonPath = "C:\Users\Z840\AppData\Local\Programs\Python\Python312\python.exe"
$workingDir = "c:\Users\Z840\Documents\ALTA DE ARTICULOS -NVO"
$cmd = "$pythonPath `"$workingDir\server.py`" 5000"

$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = $cmd
    CurrentDirectory = $workingDir
}

Write-Output "ReturnCode: $($result.ReturnValue), ProcessId: $($result.ProcessId)"
