import os
import io
from flask import Blueprint, send_from_directory, send_file, make_response
from app.config import BASE_DIR

main_bp = Blueprint('main_bp', __name__)

@main_bp.route('/')
def index():
    from flask import request
    accept_encoding = request.headers.get('Accept-Encoding', '')
    ruta_src = os.path.join(BASE_DIR, 'index.html')
    if 'gzip' in accept_encoding and os.path.exists(ruta_src):
        ruta_gz = os.path.join(BASE_DIR, 'index.html.gz')
        try:
            if not os.path.exists(ruta_gz) or os.path.getmtime(ruta_src) > os.path.getmtime(ruta_gz):
                import gzip
                with open(ruta_src, 'rb') as f_in, gzip.open(ruta_gz, 'wb') as f_out:
                    f_out.write(f_in.read())
            resp = make_response(send_file(ruta_gz, mimetype='text/html'))
            resp.headers['Content-Encoding'] = 'gzip'
            resp.headers['Vary'] = 'Accept-Encoding'
        except Exception:
            resp = make_response(send_from_directory(BASE_DIR, 'index.html'))
    else:
        resp = make_response(send_from_directory(BASE_DIR, 'index.html'))

    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp

@main_bp.route('/api/logo/<tipo>')
def serve_logo(tipo):
    tipo_clean = tipo.lower().replace('.png', '').replace('%20', ' ').strip()
    posibles = []
    if "rt" in tipo_clean:
        posibles = ["logo rt.png", "logo rt.PNG", "logo_rt.png", "logo rt.png.png"]
    else:
        posibles = ["logo bc.png", "logo bc.PNG", "logo_bc.png", "logo bc.png.png", "logo.png"]

    for nombre in posibles:
        ruta = os.path.join(BASE_DIR, nombre)
        if os.path.exists(ruta) and os.path.isfile(ruta):
            return send_file(ruta, mimetype='image/png')

    texto = "RT" if "rt" in tipo_clean else "BC REFACCIONARIAS"
    bg = "#0f172a" if "rt" in tipo_clean else "#dc2626"
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="260" height="70" viewBox="0 0 260 70">
        <rect width="260" height="70" rx="10" fill="{bg}"/>
        <text x="130" y="44" font-family="Arial, sans-serif" font-size="22" font-weight="900" fill="#ffffff" text-anchor="middle">{texto}</text>
    </svg>'''
    return io.BytesIO(svg.encode('utf-8')).read(), 200, {'Content-Type': 'image/svg+xml'}

@main_bp.route('/<path:filename>')
def serve_static_root(filename):
    # BLINDAJE DE SEGURIDAD: Solo permitir archivos públicos web inocuos (favicon, logos autorizados)
    # Bloquear estrictamente cualquier acceso a bases de datos (.db), código (.py), configs (.json, .env), scripts (.bat, .vbs)
    clean_name = filename.replace('\\', '/').strip('/')
    ext = os.path.splitext(clean_name)[1].lower()
    
    ALLOWED_EXTENSIONS = {'.ico', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.woff', '.woff2', '.ttf'}
    FORBIDDEN_FILES = {'usuarios.db', 'config_empresas.json', 'config_menu_sistema.json', 'proveedores.json', 'server.py'}

    if ext not in ALLOWED_EXTENSIONS or clean_name in FORBIDDEN_FILES:
        return "Not Found", 404

    # Bloquear acceso a subdirectorios sensibles (app, .git, __pycache__, scratch)
    if clean_name.startswith(('app/', '.git', '__pycache__', 'scratch', '.')):
        return "Not Found", 404

    target = os.path.join(BASE_DIR, clean_name)
    if os.path.isfile(target):
        return send_from_directory(BASE_DIR, clean_name)
    return "Not Found", 404
