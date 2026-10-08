import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(BASE_DIR, "servidor_perpetuo.log")

# Redirección obligatoria en Windows cuando corre bajo pythonw.exe (sin consola)
# para evitar que llamadas a print() o tracebacks lancen AttributeError: 'NoneType' object has no attribute 'write'
try:
    if sys.stdout is None or getattr(sys.stdout, 'closed', False):
        sys.stdout = open(LOG_FILE, "a", encoding="utf-8", buffering=1)
    if sys.stderr is None or getattr(sys.stderr, 'closed', False):
        sys.stderr = open(LOG_FILE, "a", encoding="utf-8", buffering=1)
except Exception:
    pass

import time
import socket
import logging

logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)

def is_server_already_running(port=6060):
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1)
            return s.connect_ex(('127.0.0.1', port)) == 0
    except Exception:
        return False

def main():
    os.chdir(BASE_DIR)
    if BASE_DIR not in sys.path:
        sys.path.insert(0, BASE_DIR)

    port = int(os.environ.get("PORT", os.environ.get("ERP_PORT", sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].isdigit() else 6060)))

    # Si ya hay un servidor escuchando en el puerto configurado, no duplicar
    if is_server_already_running(port):
        logging.info(f"El servidor ERP ya está escuchando en el puerto {port}. Proceso duplicado omitido.")
        sys.exit(0)

    logging.info("==================================================")
    logging.info(f"Iniciando Servicio Perpetuo ERP BC Refaccionarias en puerto {port}")
    logging.info("==================================================")

    # Bucle infinito autoreparable: si por alguna razón falla Waitress, se reinicia en 3s
    while True:
        try:
            from app import create_app
            app = create_app()
            from waitress import serve
            logging.info(f"Servidor Waitress activo en http://0.0.0.0:{port} (8 hilos de alto rendimiento).")
            serve(app, host='0.0.0.0', port=port, threads=8)
        except Exception as e:
            logging.error(f"Falla detectada en el servidor: {e}. Reiniciando automáticamente en 3 segundos...")
            time.sleep(3)

if __name__ == '__main__':
    main()
