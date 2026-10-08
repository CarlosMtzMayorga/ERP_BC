import subprocess
import sys
import os

if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.abspath(__file__))
    log_file = os.path.join(base_dir, "servidor_perpetuo.log")
    log_fd = open(log_file, "a", encoding="utf-8")
    
    cmd = [sys.executable, os.path.join(base_dir, "server.py"), "5000"]
    # Flags for detached process with its own process group
    DETACHED_FLAGS = 0x00000008 | 0x00000200 # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    proc = subprocess.Popen(
        cmd,
        cwd=base_dir,
        stdout=log_fd,
        stderr=log_fd,
        creationflags=DETACHED_FLAGS
    )
    print(f"Servidor iniciado de forma desacoplada con PID: {proc.pid}")
