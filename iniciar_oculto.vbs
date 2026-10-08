Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = currentDir

pyExe = ""
If fso.FileExists("C:\Users\JCMartinez\Python312\pythonw.exe") Then
    pyExe = "C:\Users\JCMartinez\Python312\pythonw.exe"
ElseIf fso.FileExists("C:\Users\Z840\AppData\Local\Programs\Python\Python312\pythonw.exe") Then
    pyExe = "C:\Users\Z840\AppData\Local\Programs\Python\Python312\pythonw.exe"
Else
    pyExe = "pythonw"
End If

scriptPath = currentDir & "\server.py"
WshShell.Run """" & pyExe & """ """ & scriptPath & """ 6060", 0, False
