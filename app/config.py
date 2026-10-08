import os
import json

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SQLITE_DB = os.path.join(BASE_DIR, "usuarios.db")
PROVEEDORES_JSON = os.path.join(BASE_DIR, "proveedores.json")

CONFIG_EMPRESAS_JSON = os.path.join(BASE_DIR, "config_empresas.json")
CONFIG_MENU_JSON = os.path.join(BASE_DIR, "config_menu_sistema.json")
MICROSIP_CREDS_FILE = os.path.join(BASE_DIR, "app", ".microsip_conn.json")

def _credenciales_microsip():
    """Devuelve (uid, pwd, servidor) de Microsip desde entorno o archivo local (no versionado).

    Fuentes, en orden de prioridad: variables de entorno MICROSIP_UID, MICROSIP_PWD,
    MICROSIP_SERVER; o bien el archivo app/.microsip_conn.json con formato
    {"uid": "...", "pwd": "...", "server": "ip"}.
    """
    uid = os.environ.get("MICROSIP_UID") or "SYSDBA"
    pwd = os.environ.get("MICROSIP_PWD")
    server = os.environ.get("MICROSIP_SERVER") or "192.168.1.127"
    if not pwd:
        try:
            with open(MICROSIP_CREDS_FILE, "r", encoding="utf-8") as f:
                import json
                d = json.load(f)
            uid = d.get("uid") or uid
            pwd = d.get("pwd")
            server = d.get("server") or server
        except Exception:
            pass
    if not pwd:
        raise RuntimeError(
            "Credenciales de Microsip no configuradas: define MICROSIP_UID/MICROSIP_PWD "
            "(o MICROSIP_SERVER) o crea app/.microsip_conn.json (ver README)."
        )
    return uid, pwd, server

def escapar_odbc(valor):
    return str(valor).replace(";", ";;")

def conn_string_microsip(dsn=None, archivo=None, server=None):
    """Cadena de conexión ODBC/Firebird centralizada, sin credenciales en duro."""
    uid, pwd, server_def = _credenciales_microsip()
    server = server or server_def
    pwd_esc = escapar_odbc(pwd)
    if archivo:
        return (
            f"DRIVER=Firebird/InterBase(r) driver;"
            f"DBNAME={server}:C:\\Microsip datos\\{archivo};"
            f"UID={uid};PWD={pwd_esc};CHARSET=NONE;"
        )
    if not dsn:
        raise ValueError("conn_string_microsip requiere 'dsn' o 'archivo'")
    return f"DSN={dsn};UID={uid};PWD={pwd_esc};CHARSET=NONE;"

DEFAULT_EMPRESAS = [
    {"id": "BATTERY CENTER", "nombre": "BATTERY CENTER", "empresa_id": 1175, "archivo": "BATTERY CENTER.FDB", "dsn": "basesmp", "logo": "logo bc", "visible": True},
    {"id": "ALPHERIX", "nombre": "ALPHERIX", "empresa_id": 39943394, "archivo": "ALPHERIX.FDB", "logo": "logo bc", "visible": True},
    {"id": "ARACELI ROBLES", "nombre": "ARACELI ROBLES", "empresa_id": 11692280, "archivo": "ARACELI ROBLES.FDB", "logo": "logo bc", "visible": True},
    {"id": "BATTERY CENTER 2015", "nombre": "BATTERY CENTER 2015", "empresa_id": 27040844, "archivo": "BATTERY CENTER 2015.FDB", "logo": "logo bc", "visible": False},
    {"id": "BATTERY CENTER 2020", "nombre": "BATTERY CENTER 2020", "empresa_id": 27040845, "archivo": "BATTERY CENTER 2020.FDB", "logo": "logo bc", "visible": False},
    {"id": "DANIELA ALEJANDRA SANCHEZ", "nombre": "DANIELA ALEJANDRA SANCHEZ", "empresa_id": 42727650, "archivo": "DANIELA ALEJANDRA SANCHEZ.FDB", "logo": "logo bc", "visible": True},
    {"id": "JUAN HERNANDEZ", "nombre": "JUAN HERNANDEZ", "empresa_id": 8252781, "archivo": "JUAN HERNANDEZ.FDB", "logo": "logo bc", "visible": True},
    {"id": "PASO", "nombre": "PASO", "empresa_id": 9568476, "archivo": "PASO.FDB", "logo": "logo bc", "visible": True},
    {"id": "PAYSA", "nombre": "PAYSA", "empresa_id": 5228625, "archivo": "PAYSA.FDB", "logo": "logo bc", "visible": True},
    {"id": "RENOHER", "nombre": "RENOHER", "empresa_id": 11899234, "archivo": "RENOHER.FDB", "dsn": "basesrenoher", "logo": "logo bc", "visible": True},
    {"id": "RT", "nombre": "RT", "empresa_id": 5316144, "archivo": "RT.FDB", "dsn": "basesRTT", "logo": "logo rt", "visible": True},
    {"id": "RT DURANGO", "nombre": "RT DURANGO", "empresa_id": 10608083, "archivo": "RT DURANGO.FDB", "dsn": "datosRTDGO", "logo": "logo rt", "visible": False},
    {"id": "Renosa", "nombre": "Renosa", "empresa_id": 9495038, "archivo": "Renosa.FDB", "logo": "logo bc", "visible": False},
]

def cargar_empresas_config():
    if os.path.exists(CONFIG_EMPRESAS_JSON):
        try:
            with open(CONFIG_EMPRESAS_JSON, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list) and len(data) > 0:
                    return data
        except Exception as e:
            print("Aviso al leer config_empresas.json:", e)
    return [dict(e) for e in DEFAULT_EMPRESAS]

def guardar_empresas_config(empresas):
    try:
        with open(CONFIG_EMPRESAS_JSON, 'w', encoding='utf-8') as f:
            json.dump(empresas, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print("Error al guardar config_empresas.json:", e)
        return False

def obtener_empresas_visibles():
    todas = cargar_empresas_config()
    visibles = [e for e in todas if e.get("visible", True)]
    return visibles if visibles else todas[:1]

def sincronizar_empresas_desde_microsip():
    """Consulta el catálogo oficial de empresas en Microsip (System\\Config.fdb) y actualiza config_empresas.json."""
    import pyodbc
    try:
        conn_str = conn_string_microsip(archivo="System\\Config.fdb")
    except RuntimeError as e:
        return {"success": False, "error": str(e)}
    try:
        cn = pyodbc.connect(conn_str, timeout=4)
        cur = cn.cursor()
        cur.execute("SELECT EMPRESA_ID, TRIM(NOMBRE_CORTO) FROM EMPRESAS ORDER BY NOMBRE_CORTO")
        rows = cur.fetchall()
        cn.close()

        actuales = cargar_empresas_config()
        mapa_actuales = {e['nombre'].upper(): e for e in actuales}
        nuevas = []

        dsn_conocidos = {
            "BATTERY CENTER": "basesmp",
            "RENOHER": "basesrenoher",
            "RT": "basesRTT",
            "RT DURANGO": "datosRTDGO"
        }

        for emp_id, nombre in rows:
            nom_upper = nombre.upper()
            if nom_upper in mapa_actuales:
                emp_obj = mapa_actuales[nom_upper]
                emp_obj['empresa_id'] = emp_id
                emp_obj['archivo'] = f"{nombre}.FDB"
                nuevas.append(emp_obj)
            else:
                nuevas.append({
                    "id": nombre,
                    "nombre": nombre,
                    "empresa_id": emp_id,
                    "archivo": f"{nombre}.FDB",
                    "dsn": dsn_conocidos.get(nombre, ""),
                    "logo": "logo rt" if "RT" in nombre.upper() else "logo bc",
                    "visible": True
                })

        guardar_empresas_config(nuevas)
        return {"success": True, "empresas": nuevas, "mensaje": f"Se sincronizaron {len(nuevas)} empresas desde Microsip."}
    except Exception as e:
        return {"success": False, "error": f"No se pudo consultar Microsip: {str(e)}"}

# Alias dinámico para retrocompatibilidad
EMPRESAS_DISPONIBLES = cargar_empresas_config()

CURRENT_DSN = "BATTERY CENTER"

def get_current_dsn():
    global CURRENT_DSN
    return CURRENT_DSN

def set_current_dsn(dsn):
    global CURRENT_DSN
    CURRENT_DSN = dsn
    return CURRENT_DSN

def cargar_proveedores_config():
    if os.path.exists(PROVEEDORES_JSON):
        try:
            with open(PROVEEDORES_JSON, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print("Error al leer proveedores.json:", e)
    return {}

# ================= CONFIGURACIÓN DE MENÚS Y MÓDULOS =================
DEFAULT_MENU_ESTRUCTURA = [
    {
        "id": "dashboard",
        "nombre": "Inicio / Tablero",
        "icono": "📊",
        "tipo": "modulo",
        "visible": True
    },
    {
        "id": "ventas",
        "nombre": "Ventas",
        "icono": "🛒",
        "tipo": "agrupador",
        "visible": True,
        "submodulos": [
            {"id": "puntoventa", "nombre": "Punto de Venta", "icono": "🛒", "visible": True},
            {"id": "ventas_tickets", "nombre": "Historial / Tickets", "icono": "🧾", "visible": True},
            {"id": "vendedores_comisiones", "nombre": "Vendedores y Comisiones", "icono": "👨‍💼", "visible": True},
            {"id": "bot_whatsapp", "nombre": "Bot WhatsApp", "icono": "🤖", "visible": True}
        ]
    },
    {
        "id": "almacen",
        "nombre": "Almacén",
        "icono": "📦",
        "tipo": "agrupador",
        "visible": True,
        "submodulos": [
            {"id": "almacen_traspasos", "nombre": "Control de Traspasos", "icono": "📱", "visible": True},
            {"id": "almacen_stock", "nombre": "Catálogo y Stock", "icono": "📋", "visible": True},
            {"id": "almacen_recepcion", "nombre": "Recepción de Compra (OC)", "icono": "📥", "visible": True},
            {"id": "almacen_cascos", "nombre": "Control de Cascos", "icono": "🔋", "visible": True}
        ]
    },
    {
        "id": "compras",
        "nombre": "Compras",
        "icono": "🛍️",
        "tipo": "agrupador",
        "visible": True,
        "submodulos": [
            {"id": "modulo1", "nombre": "Recepción de Compra", "icono": "📄", "visible": True},
            {"id": "modulo2", "nombre": "Listas de Precios", "icono": "💲", "visible": True},
            {"id": "modulo3", "nombre": "Traspasos", "icono": "🔄", "visible": True},
            {"id": "modulo4", "nombre": "Buscador de Artículos", "icono": "🔍", "visible": True},
            {"id": "resurtidos", "nombre": "Resurtidos", "icono": "📊", "visible": True},
            {"id": "compras_solicitudes", "nombre": "Validar Traspasos PV", "icono": "🚚", "visible": True}
        ]
    },
    {
        "id": "sucursales",
        "nombre": "Sucursales",
        "icono": "🏢",
        "tipo": "modulo",
        "visible": True
    },
    {
        "id": "administracion",
        "nombre": "Administración",
        "icono": "💼",
        "tipo": "modulo",
        "visible": True
    },
    {
        "id": "configuracion",
        "nombre": "Configuración",
        "icono": "⚙️",
        "tipo": "agrupador",
        "visible": True,
        "submodulos": [
            {"id": "config_usuarios", "nombre": "Usuarios y Permisos", "icono": "👥", "visible": True},
            {"id": "config_empresas", "nombre": "Empresas", "icono": "🏢", "visible": True},
            {"id": "config_modulos", "nombre": "Menús y Módulos", "icono": "📑", "visible": True},
            {"id": "config_comisiones", "nombre": "Políticas y Comisiones", "icono": "💼", "visible": True}
        ]
    }
]

def _fusionar_modulos_sistema(menu):
    """Agrega al menú guardado cualquier módulo/submódulo del sistema que aún no exista.
    Respeta orden, visibilidad y reubicaciones hechas por el usuario (solo agrega faltantes)."""
    import copy
    ids_existentes = set()
    for m in menu:
        ids_existentes.add(m.get("id"))
        for s in (m.get("submodulos") or []):
            ids_existentes.add(s.get("id"))
    # 'ventas_pv' es alias histórico de 'puntoventa'
    if "ventas_pv" in ids_existentes:
        ids_existentes.add("puntoventa")

    cambios = False
    for default_mod in DEFAULT_MENU_ESTRUCTURA:
        destino = next((m for m in menu if m.get("id") == default_mod["id"]), None)
        if destino is None:
            if default_mod["id"] not in ids_existentes:
                menu.append(copy.deepcopy(default_mod))
                cambios = True
            continue
        for sub in default_mod.get("submodulos", []):
            if sub["id"] not in ids_existentes:
                destino.setdefault("submodulos", []).append(dict(sub))
                destino["tipo"] = "agrupador"
                ids_existentes.add(sub["id"])
                cambios = True
    return cambios

def cargar_menu_config():
    if os.path.exists(CONFIG_MENU_JSON):
        try:
            with open(CONFIG_MENU_JSON, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list) and len(data) > 0:
                    if _fusionar_modulos_sistema(data):
                        guardar_menu_config(data)
                    return data
        except Exception as e:
            print("Aviso al leer config_menu_sistema.json:", e)
    import copy
    return copy.deepcopy(DEFAULT_MENU_ESTRUCTURA)

def guardar_menu_config(menu):
    try:
        with open(CONFIG_MENU_JSON, 'w', encoding='utf-8') as f:
            json.dump(menu, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print("Error al guardar config_menu_sistema.json:", e)
        return False

