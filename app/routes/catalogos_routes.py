from flask import Blueprint, jsonify, request
from app.config import (
    cargar_empresas_config,
    guardar_empresas_config,
    obtener_empresas_visibles,
    get_current_dsn,
    set_current_dsn,
    cargar_menu_config,
    guardar_menu_config
)
from app.db import conectar_db

catalogos_bp = Blueprint('catalogos', __name__)

# Referencia a la función de invalidar caché de almacenes que se definirá en almacen_routes
_invalidar_cache_almacenes = None

def registrar_limpiador_cache_almacenes(fn):
    global _invalidar_cache_almacenes
    _invalidar_cache_almacenes = fn

@catalogos_bp.route('/api/empresas', methods=['GET'])
def get_empresas():
    todas = request.args.get('todas', '').lower() in ('true', '1', 'si')
    empresas = cargar_empresas_config() if todas else obtener_empresas_visibles()
    return jsonify({"empresas": empresas, "activa": get_current_dsn()})

@catalogos_bp.route('/api/config/empresas', methods=['POST'])
def post_config_empresas():
    from flask import session
    rol = str(session.get('rol') or '').upper()
    permisos = session.get('permisos') or []
    if rol != 'ADMIN' and '*' not in permisos and 'configuracion' not in permisos:
        return jsonify({"success": False, "error": "Acceso denegado. Se requieren permisos de Administrador."}), 403

    data = request.get_json() or {}
    empresas = data.get('empresas', [])
    if not empresas or not isinstance(empresas, list):
        return jsonify({"success": False, "error": "Lista de empresas inválida"}), 400
    if guardar_empresas_config(empresas):
        return jsonify({"success": True, "empresas": cargar_empresas_config(), "mensaje": "Configuración de empresas guardada exitosamente"})
    return jsonify({"success": False, "error": "No se pudo guardar la configuración"}), 500

@catalogos_bp.route('/api/config/menu-modulos', methods=['GET'])
def get_menu_modulos():
    return jsonify({"success": True, "menu": cargar_menu_config()})

@catalogos_bp.route('/api/config/menu-modulos', methods=['POST'])
def post_menu_modulos():
    from flask import session
    rol = str(session.get('rol') or '').upper()
    permisos = session.get('permisos') or []
    if rol != 'ADMIN' and '*' not in permisos and 'configuracion' not in permisos:
        return jsonify({"success": False, "error": "Acceso denegado. Se requieren permisos de Administrador."}), 403

    data = request.get_json() or {}
    menu = data.get('menu', [])
    if not menu or not isinstance(menu, list):
        return jsonify({"success": False, "error": "Estructura de menú inválida"}), 400
    if guardar_menu_config(menu):
        return jsonify({"success": True, "menu": cargar_menu_config(), "mensaje": "Estructura de menús actualizada correctamente"})
    return jsonify({"success": False, "error": "No se pudo guardar la estructura"}), 500

@catalogos_bp.route('/api/config/empresas/sincronizar-microsip', methods=['POST'])
def post_sincronizar_microsip():
    from flask import session
    rol = str(session.get('rol') or '').upper()
    permisos = session.get('permisos') or []
    if rol != 'ADMIN' and '*' not in permisos and 'configuracion' not in permisos:
        return jsonify({"success": False, "error": "Acceso denegado. Se requieren permisos de Administrador."}), 403

    from app.config import sincronizar_empresas_desde_microsip
    res = sincronizar_empresas_desde_microsip()
    if res.get("success"):
        return jsonify(res)
    return jsonify(res), 500

@catalogos_bp.route('/api/seleccionar-empresa', methods=['POST'])
def seleccionar_empresa():
    data = request.get_json() or {}
    empresa_id = data.get('empresa_id', '')

    empresas = cargar_empresas_config()
    empresa_info = next((e for e in empresas if str(e.get('id')).upper() == str(empresa_id).upper() or str(e.get('nombre')).upper() == str(empresa_id).upper() or str(e.get('dsn', '')).upper() == str(empresa_id).upper()), None)
    if not empresa_info:
        return jsonify({"error": "Empresa no válida"}), 400

    try:
        conn = conectar_db(empresa_id)
        cur = conn.cursor()
        nombre_oficial = empresa_id
        try:
            cur.execute("SELECT FIRST 1 NOMBRE FROM DATOS_EMPRESA")
            row = cur.fetchone()
            if row and row[0]:
                nombre_oficial = str(row[0]).strip()
        except:
            pass

        cur.close()
        conn.close()

        set_current_dsn(empresa_id)
        if _invalidar_cache_almacenes:
            _invalidar_cache_almacenes()
        try:
            from app.routes.dashboard_routes import limpiar_cache_dashboard
            limpiar_cache_dashboard()
        except Exception:
            pass

        return jsonify({
            "success": True,
            "empresa_activa": get_current_dsn(),
            "nombre_oficial": nombre_oficial,
            "logo_tag": empresa_info.get("logo", "logo bc")
        })
    except Exception as e:
        return jsonify({"error": f"No se pudo conectar a la base de datos: {str(e)}"}), 500

@catalogos_bp.route('/api/status', methods=['GET'])
def check_status():
    current_dsn = get_current_dsn()
    try:
        conn = conectar_db()
        cur = conn.cursor()
        nombre_oficial = current_dsn
        try:
            cur.execute("SELECT FIRST 1 NOMBRE FROM DATOS_EMPRESA")
            r = cur.fetchone()
            if r and r[0]:
                nombre_oficial = str(r[0]).strip()
        except:
            pass
        cur.close()
        conn.close()
        
        empresa_info = next((e for e in EMPRESAS_DISPONIBLES if e['id'] == current_dsn), {})
        return jsonify({
            "server_running": True,
            "db_connected": True,
            "empresa_activa": current_dsn,
            "nombre_oficial": nombre_oficial,
            "logo_tag": empresa_info.get("logo", "logo bc")
        })
    except Exception as e:
        return jsonify({"server_running": True, "db_connected": False, "empresa_activa": current_dsn, "message": str(e)}), 500

@catalogos_bp.route('/api/proveedores', methods=['GET'])
def get_proveedores():
    conn = None
    try:
        conn = conectar_db()
        cursor = conn.cursor()
        cursor.execute("SELECT TRIM(RDB$RELATION_NAME) FROM RDB$RELATIONS WHERE RDB$RELATION_NAME IN ('PROVEEDORES', 'PROV') AND RDB$VIEW_BLR IS NULL")
        tablas = [row[0].upper() for row in cursor.fetchall() if row[0]]
        
        if not tablas:
            cursor.close()
            conn.close()
            return jsonify([])

        tabla = tablas[0]
        cursor.execute(f"SELECT TRIM(RDB$FIELD_NAME) FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = '{tabla}'")
        cols = [row[0].upper() for row in cursor.fetchall() if row[0]]

        col_id = next((c for c in ['PROVEEDOR_ID', 'PROV_ID', 'ID'] if c in cols), cols[0] if cols else 'PROVEEDOR_ID')
        col_nom = next((c for c in ['NOMBRE', 'NOMBRE_PROVEEDOR', 'RAZON_SOCIAL'] if c in cols), cols[1] if len(cols) > 1 else col_id)
        col_rfc = next((c for c in ['RFC_CURP', 'RFC', 'RFC_PROVEEDOR'] if c in cols), None)

        campo_rfc = f", COALESCE(TRIM(p.{col_rfc}), '')" if col_rfc else ", ''"

        try:
            cursor.execute(f"""
                SELECT p.{col_id}, COALESCE(TRIM(c.CLAVE), '') AS CLAVE, TRIM(p.{col_nom}){campo_rfc}
                FROM {tabla} p
                LEFT JOIN CLAVES_CAT_SEC c ON c.ELEM_ID = p.{col_id} AND c.NOMBRE_TABLA = '{tabla}'
                ORDER BY p.{col_nom}
            """)
        except:
            cursor.execute(f"SELECT p.{col_id}, '', TRIM(p.{col_nom}){campo_rfc} FROM {tabla} p ORDER BY p.{col_nom}")

        proveedores = [
            {
                "id": int(row[0]),
                "clave": str(row[1]).strip() if row[1] else "",
                "nombre": str(row[2]).strip() if row[2] else f"Proveedor {row[0]}",
                "rfc": str(row[3]).strip() if len(row) > 3 and row[3] else ""
            }
            for row in cursor.fetchall() if row[0] is not None
        ]
        cursor.close()
        conn.close()
        return jsonify(proveedores)

    except Exception as e:
        if conn:
            try:
                conn.close()
            except:
                pass
        return jsonify({"error": str(e)}), 500

@catalogos_bp.route('/api/lineas', methods=['GET'])
def get_lineas():
    conn = None
    try:
        conn = conectar_db()
        cursor = conn.cursor()
        query = """
            SELECT COALESCE(NULLIF(TRIM(c.CLAVE), ''), l.NOMBRE) AS CLAVE_REAL, TRIM(c.CLAVE) AS CLAVE_SOLA, l.NOMBRE
            FROM LINEAS_ARTICULOS l
            LEFT JOIN CLAVES_CAT_SEC c ON c.ELEM_ID = l.LINEA_ARTICULO_ID AND c.NOMBRE_TABLA = 'LINEAS_ARTICULOS'
            ORDER BY l.NOMBRE
        """
        cursor.execute(query)
        lineas = [{"id": str(r[0]).strip() if r[0] else "", "clave": str(r[1]).strip() if r[1] else "", "nombre": str(r[2]).strip() if r[2] else ""} for r in cursor.fetchall()]
        cursor.close()
        conn.close()
        return jsonify(lineas)
    except Exception as e:
        if conn:
            conn.close()
        return jsonify({"error": str(e)}), 500

@catalogos_bp.route('/api/catalogos/sucursales-vendedores', methods=['GET'])
def get_sucursales_vendedores():
    conn = None
    try:
        conn = conectar_db()
        cur = conn.cursor()

        cur.execute("""
            SELECT ALMACEN_ID, TRIM(NOMBRE)
            FROM ALMACENES
            WHERE UPPER(NOMBRE) NOT LIKE 'NO UTILIZAR%'
              AND UPPER(NOMBRE) NOT LIKE '%TRANSITO%'
              AND UPPER(NOMBRE) NOT LIKE '%DEVOLUCION%'
              AND UPPER(NOMBRE) NOT LIKE '%USADOS%'
              AND (ES_PPAL = 'S' OR UPPER(NOMBRE) LIKE 'SUCURSAL%' OR UPPER(NOMBRE) LIKE 'CEDIS%' OR UPPER(NOMBRE) = 'MATRIZ')
            ORDER BY NOMBRE
        """)
        sucursales = []
        for r in cur.fetchall():
            sucursales.append({
                "id": int(r[0]),
                "nombre": str(r[1]).strip()
            })

        # Una sola consulta para todas las cajas (evita N+1)
        cajas_por_almacen = {}
        ids = [s["id"] for s in sucursales]
        if ids:
            marks = ",".join("?" for _ in ids)
            cur.execute(
                f"SELECT ALMACEN_ID, CAJA_ID, TRIM(NOMBRE) FROM CAJAS WHERE PERMITE_COBRAR = 'S' AND ALMACEN_ID IN ({marks}) ORDER BY ALMACEN_ID, CAJA_ID",
                ids
            )
            for cr in cur.fetchall():
                alm = int(cr[0])
                if alm not in cajas_por_almacen:
                    cajas_por_almacen[alm] = (int(cr[1]), str(cr[2]).strip())

        for s in sucursales:
            c_row = cajas_por_almacen.get(s["id"])
            s["caja_id"] = c_row[0] if c_row else None
            s["caja_nombre"] = c_row[1] if c_row else ""

        cur.execute("""
            SELECT VENDEDOR_ID, TRIM(NOMBRE)
            FROM VENDEDORES
            WHERE UPPER(NOMBRE) NOT LIKE 'NO%US%'
              AND (OCULTO IS NULL OR OCULTO <> 'S')
            ORDER BY NOMBRE
        """)
        vendedores = [{"id": int(r[0]), "nombre": str(r[1]).strip()} for r in cur.fetchall()]

        cur.close()
        conn.close()
        return jsonify({
            "success": True,
            "sucursales": sucursales,
            "vendedores": vendedores
        })
    except Exception as e:
        if conn: conn.close()
        return jsonify({"success": False, "error": str(e), "sucursales": [], "vendedores": []}), 500

