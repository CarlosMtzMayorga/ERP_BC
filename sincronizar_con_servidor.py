"""
Sincronizador Continuo Local -> Servidor (192.168.1.253)
Monitorea cambios en el directorio local de Visual Studio Code y
los replica inmediatamente en el servidor de aplicaciones.
"""
import os
import sys
import time
import shutil

LOCAL_DIR = os.path.dirname(os.path.abspath(__file__))
REMOTE_DIR = r"\\192.168.1.253\Users\JCMartinez\ALTA_ARTICULOS"
LOG_FILE = os.path.join(LOCAL_DIR, "sincronizador.log")

try:
    if sys.stdout is None or getattr(sys.stdout, 'closed', False):
        sys.stdout = open(LOG_FILE, "a", encoding="utf-8", buffering=1)
    if sys.stderr is None or getattr(sys.stderr, 'closed', False):
        sys.stderr = open(LOG_FILE, "a", encoding="utf-8", buffering=1)
except Exception:
    pass

IGNORED_DIRS = {'__pycache__', '.git', '.gemini', 'tmp', '.vscode', '.system_generated'}
IGNORED_EXTS = {'.pyc', '.log', '.tmp', '.swp'}

def get_files_mtime(base_dir):
    files = {}
    for root, dirs, filenames in os.walk(base_dir):
        # Filtrar directorios ignorados in-place
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]
        for f in filenames:
            ext = os.path.splitext(f)[1].lower()
            if ext in IGNORED_EXTS or f.startswith('.'):
                continue
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, base_dir)
            try:
                files[rel_path] = os.path.getmtime(full_path)
            except OSError:
                pass
    return files

def sync_file(rel_path):
    src = os.path.join(LOCAL_DIR, rel_path)
    dst = os.path.join(REMOTE_DIR, rel_path)
    dst_dir = os.path.dirname(dst)
    try:
        os.makedirs(dst_dir, exist_ok=True)
        shutil.copy2(src, dst)
        print(f"[{time.strftime('%H:%M:%S')}] Sincronizado a Servidor: {rel_path}", flush=True)
        return True
    except Exception as e:
        print(f"[{time.strftime('%H:%M:%S')}] Error al sincronizar {rel_path}: {e}", flush=True)
        return False

def main():
    print("================================================================", flush=True)
    print(" Sincronizador Activo: Visual Studio Code -> Servidor 192.168.1.253", flush=True)
    print(f" Local:   {LOCAL_DIR}", flush=True)
    print(f" Remoto:  {REMOTE_DIR}", flush=True)
    print(" Cualquier cambio guardado en VS Code se copiara al instante.", flush=True)
    print(" Presione Ctrl+C para detener.", flush=True)
    print("================================================================", flush=True)

    # Verificar conectividad con el servidor
    if not os.path.exists(REMOTE_DIR):
        print(f"[ALERTA] No se pudo acceder a {REMOTE_DIR}. Verifique que el servidor este encendido y la sesion de red este activa.", flush=True)

    cached_mtimes = get_files_mtime(LOCAL_DIR)
    print(f"[{time.strftime('%H:%M:%S')}] Monitoreando {len(cached_mtimes)} archivos locales...", flush=True)

    while True:
        try:
            time.sleep(1.5)
            current_mtimes = get_files_mtime(LOCAL_DIR)
            for rel_path, mtime in current_mtimes.items():
                if rel_path not in cached_mtimes or mtime > cached_mtimes[rel_path]:
                    sync_file(rel_path)
                    cached_mtimes[rel_path] = mtime
        except KeyboardInterrupt:
            print("\nSincronizador detenido por el usuario.")
            break
        except Exception as e:
            time.sleep(3)

if __name__ == '__main__':
    main()
