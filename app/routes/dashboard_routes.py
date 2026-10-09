import datetime
from decimal import Decimal
from flask import Blueprint, jsonify, request
from app.db import conectar_db

from app.config import get_current_dsn

dashboard_bp = Blueprint('dashboard', __name__)

# Cache simple en memoria (120 segundos) para no saturar Firebird
_cache_dashboard = {}
_cache_ttl = 120 # segundos

_cache_stock_global = {}
_cache_stock_ttl = 300 # 5 minutos para stock general

def limpiar_cache_dashboard():
    global _cache_dashboard, _cache_stock_global
    _cache_dashboard.clear()
    _cache_stock_global.clear()

def get_cached(key):
    if key in _cache_dashboard:
        data, ts = _cache_dashboard[key]
        if (datetime.datetime.now() - ts).total_seconds() < _cache_ttl:
            return data
    return None

def set_cached(key, data):
    _cache_dashboard[key] = (data, datetime.datetime.now())

def resolver_rango_fechas(periodo):
    hoy = datetime.date.today()
    if periodo == 'hoy':
        return hoy.strftime("%Y-%m-%d"), hoy.strftime("%Y-%m-%d")
    elif periodo == 'semana':
        ini = hoy - datetime.timedelta(days=hoy.weekday())
        return ini.strftime("%Y-%m-%d"), hoy.strftime("%Y-%m-%d")
    elif periodo == '30dias':
        ini = hoy - datetime.timedelta(days=30)
        return ini.strftime("%Y-%m-%d"), hoy.strftime("%Y-%m-%d")
    elif periodo == '90dias':
        ini = hoy - datetime.timedelta(days=90)
        return ini.strftime("%Y-%m-%d"), hoy.strftime("%Y-%m-%d")
    elif periodo == '6meses':
        ini = hoy - datetime.timedelta(days=183)
        return ini.strftime("%Y-%m-%d"), hoy.strftime("%Y-%m-%d")
    elif periodo == 'anio':
        ini = datetime.date(hoy.year, 1, 1)
        return ini.strftime("%Y-%m-%d"), hoy.strftime("%Y-%m-%d")
    else: # mes actual por defecto
        ini = hoy.replace(day=1)
        return ini.strftime("%Y-%m-%d"), hoy.strftime("%Y-%m-%d")

@dashboard_bp.route('/api/dashboard/resumen', methods=['GET'])
def get_dashboard_resumen():
    periodo = request.args.get('periodo', 'mes_actual')
    current_dsn = get_current_dsn()
    cache_key = f"{current_dsn}_resumen_{periodo}"
    cached = get_cached(cache_key)
    if cached:
        return jsonify(cached)

    fecha_ini, fecha_fin = resolver_rango_fechas(periodo)

    conn = None
    try:
        conn = conectar_db()
        cur = conn.cursor()

        # 1. Ventas por sucursal
        cur.execute("""
            SELECT 
                a.ALMACEN_ID,
                TRIM(a.NOMBRE) AS NOMBRE,
                COUNT(p.DOCTO_PV_ID) AS TICKETS,
                SUM(p.IMPORTE_NETO + COALESCE(p.TOTAL_IMPUESTOS, 0)) AS TOTAL_VENTA
            FROM DOCTOS_PV p
            JOIN ALMACENES a ON a.ALMACEN_ID = p.ALMACEN_ID
            WHERE p.FECHA >= ? AND p.FECHA <= ?
              AND p.ESTATUS <> 'C'
              AND p.TIPO_DOCTO IN ('V', 'F')
            GROUP BY a.ALMACEN_ID, a.NOMBRE
            ORDER BY TOTAL_VENTA DESC
        """, (fecha_ini, fecha_fin))

        sucursales_ventas = []
        total_venta_grupo = 0.0
        total_tickets_grupo = 0
        sucursal_lider = {"nombre": "Sin datos", "total": 0.0}

        for r in cur.fetchall():
            tot = float(r[3] or 0)
            tcks = int(r[2] or 0)
            nom = r[1]
            total_venta_grupo += tot
            total_tickets_grupo += tcks
            sucursales_ventas.append({
                "almacen_id": int(r[0]),
                "nombre": nom,
                "tickets": tcks,
                "total_venta": tot
            })

        if sucursales_ventas:
            sucursal_lider = {
                "nombre": sucursales_ventas[0]["nombre"],
                "total": sucursales_ventas[0]["total_venta"]
            }

        # Calcular porcentaje para cada sucursal
        for s in sucursales_ventas:
            s["porcentaje"] = round((s["total_venta"] / total_venta_grupo * 100), 1) if total_venta_grupo > 0 else 0.0

        # 2. Inventario total en piezas por almacén (usando tabla intermedia de alto rendimiento)
        from app.services.cache_service import obtener_resumen_almacenes
        res_alms = obtener_resumen_almacenes(empresa=current_dsn)
        almacenes_stock = []
        total_stock_piezas = 0
        for a in res_alms.get("almacenes", []):
            cant = int(a.get("piezas", 0))
            if cant > 0:
                total_stock_piezas += cant
                almacenes_stock.append({
                    "almacen_id": a["id"],
                    "nombre": a["nombre"],
                    "existencia": cant
                })
        for a in almacenes_stock:
            a["porcentaje"] = round((a["existencia"] / total_stock_piezas * 100), 1) if total_stock_piezas > 0 else 0.0

        # 3. Top 10 Artículos: tanto por piezas vendidas (volumen) como por importe neto (ingresos)
        cur.execute("""
            SELECT FIRST 10
                COALESCE(TRIM(ca.CLAVE_ARTICULO), 'S/C') AS CLAVE,
                TRIM(ar.NOMBRE) AS NOMBRE,
                SUM(d.UNIDADES - COALESCE(d.UNIDADES_DEV, 0)) AS PIEZAS_VENDIDAS,
                SUM(d.PRECIO_TOTAL_NETO) AS IMPORTE_TOTAL
            FROM DOCTOS_PV p
            JOIN DOCTOS_PV_DET d ON d.DOCTO_PV_ID = p.DOCTO_PV_ID
            JOIN ARTICULOS ar ON ar.ARTICULO_ID = d.ARTICULO_ID
            LEFT JOIN CLAVES_ARTICULOS ca ON ca.ARTICULO_ID = ar.ARTICULO_ID AND ca.ROL_CLAVE_ART_ID = 17
            WHERE p.FECHA >= ? AND p.FECHA <= ?
              AND p.ESTATUS <> 'C'
              AND p.TIPO_DOCTO IN ('V', 'F')
            GROUP BY ca.CLAVE_ARTICULO, ar.NOMBRE
            ORDER BY PIEZAS_VENDIDAS DESC
        """, (fecha_ini, fecha_fin))

        top_articulos_piezas = []
        for r in cur.fetchall():
            top_articulos_piezas.append({
                "clave": r[0],
                "nombre": r[1],
                "piezas": float(r[2] or 0),
                "importe": float(r[3] or 0)
            })

        cur.execute("""
            SELECT FIRST 10
                COALESCE(TRIM(ca.CLAVE_ARTICULO), 'S/C') AS CLAVE,
                TRIM(ar.NOMBRE) AS NOMBRE,
                SUM(d.UNIDADES - COALESCE(d.UNIDADES_DEV, 0)) AS PIEZAS_VENDIDAS,
                SUM(d.PRECIO_TOTAL_NETO) AS IMPORTE_TOTAL
            FROM DOCTOS_PV p
            JOIN DOCTOS_PV_DET d ON d.DOCTO_PV_ID = p.DOCTO_PV_ID
            JOIN ARTICULOS ar ON ar.ARTICULO_ID = d.ARTICULO_ID
            LEFT JOIN CLAVES_ARTICULOS ca ON ca.ARTICULO_ID = ar.ARTICULO_ID AND ca.ROL_CLAVE_ART_ID = 17
            WHERE p.FECHA >= ? AND p.FECHA <= ?
              AND p.ESTATUS <> 'C'
              AND p.TIPO_DOCTO IN ('V', 'F')
            GROUP BY ca.CLAVE_ARTICULO, ar.NOMBRE
            ORDER BY IMPORTE_TOTAL DESC
        """, (fecha_ini, fecha_fin))

        top_articulos_importe = []
        for r in cur.fetchall():
            top_articulos_importe.append({
                "clave": r[0],
                "nombre": r[1],
                "piezas": float(r[2] or 0),
                "importe": float(r[3] or 0)
            })

        articulo_estrella = top_articulos_piezas[0] if top_articulos_piezas else {"clave": "N/D", "nombre": "Sin ventas", "piezas": 0, "importe": 0.0}

        # 4. Mejor Cliente del período (excluye clientes genéricos de mostrador)
        cur.execute("""
            SELECT FIRST 1
                TRIM(c.NOMBRE) AS NOMBRE,
                COUNT(p.DOCTO_PV_ID) AS TICKETS,
                SUM(p.IMPORTE_NETO + COALESCE(p.TOTAL_IMPUESTOS, 0)) AS TOTAL
            FROM DOCTOS_PV p
            JOIN CLIENTES c ON c.CLIENTE_ID = p.CLIENTE_ID
            WHERE p.FECHA >= ? AND p.FECHA <= ?
              AND p.ESTATUS <> 'C'
              AND p.TIPO_DOCTO IN ('V', 'F')
              AND UPPER(c.NOMBRE) NOT LIKE '%MOSTRADOR%'
              AND UPPER(c.NOMBRE) NOT LIKE '%PUBLICO EN GENERAL%'
              AND UPPER(c.NOMBRE) NOT LIKE '%VENTA PUBLICO MAYOREO%'
              AND UPPER(c.NOMBRE) NOT LIKE '%CLIENTES EN GENERAL%'
              AND UPPER(c.NOMBRE) NOT LIKE '%CLIENTES EN GRAL%'
            GROUP BY c.NOMBRE
            ORDER BY TOTAL DESC
        """, (fecha_ini, fecha_fin))

        row_cl = cur.fetchone()
        if row_cl:
            cliente_estrella = {
                "nombre": row_cl[0],
                "tickets": int(row_cl[1] or 0),
                "total": float(row_cl[2] or 0)
            }
        else:
            cliente_estrella = {"nombre": "Sin datos", "tickets": 0, "total": 0.0}

        resultado = {
            "success": True,
            "periodo": periodo,
            "fecha_inicio": fecha_ini,
            "fecha_final": fecha_fin,
            "kpis": {
                "total_venta": total_venta_grupo,
                "total_tickets": total_tickets_grupo,
                "ticket_promedio": round(total_venta_grupo / total_tickets_grupo, 2) if total_tickets_grupo > 0 else 0.0,
                "total_stock_piezas": total_stock_piezas,
                "sucursales_activas": len(sucursales_ventas),
                "sucursal_lider": sucursal_lider,
                "articulo_estrella": articulo_estrella,
                "cliente_estrella": cliente_estrella
            },
            "ventas_sucursales": sucursales_ventas,
            "almacenes_stock": almacenes_stock,
            "top_articulos": top_articulos_piezas,
            "top_articulos_piezas": top_articulos_piezas,
            "top_articulos_importe": top_articulos_importe
        }

        set_cached(cache_key, resultado)
        return jsonify(resultado)

    except Exception as e:
        print("Error en get_dashboard_resumen:", e)
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass

@dashboard_bp.route('/api/dashboard/top-articulos', methods=['GET'])
def get_top_articulos():
    periodo = request.args.get('periodo', 'mes_actual')
    limit = min(50, max(5, int(request.args.get('limit', 20))))
    current_dsn = get_current_dsn()
    cache_key = f"{current_dsn}_top_articulos_{periodo}_{limit}"
    cached = get_cached(cache_key)
    if cached:
        return jsonify(cached)

    fecha_ini, fecha_fin = resolver_rango_fechas(periodo)

    conn = None
    try:
        conn = conectar_db()
        cur = conn.cursor()
        cur.execute(f"""
            SELECT FIRST {limit}
                COALESCE(TRIM(ca.CLAVE_ARTICULO), 'S/C') AS CLAVE,
                TRIM(ar.NOMBRE) AS NOMBRE,
                SUM(d.UNIDADES - COALESCE(d.UNIDADES_DEV, 0)) AS PIEZAS_VENDIDAS,
                SUM(d.PRECIO_TOTAL_NETO) AS IMPORTE_TOTAL,
                COUNT(DISTINCT p.ALMACEN_ID) AS SUCURSALES_VENDIENDO
            FROM DOCTOS_PV p
            JOIN DOCTOS_PV_DET d ON d.DOCTO_PV_ID = p.DOCTO_PV_ID
            JOIN ARTICULOS ar ON ar.ARTICULO_ID = d.ARTICULO_ID
            LEFT JOIN CLAVES_ARTICULOS ca ON ca.ARTICULO_ID = ar.ARTICULO_ID AND ca.ROL_CLAVE_ART_ID = 17
            WHERE p.FECHA >= ? AND p.FECHA <= ?
              AND p.ESTATUS <> 'C'
              AND p.TIPO_DOCTO IN ('V', 'F')
            GROUP BY ca.CLAVE_ARTICULO, ar.NOMBRE
            ORDER BY PIEZAS_VENDIDAS DESC
        """, (fecha_ini, fecha_fin))

        items = []
        for r in cur.fetchall():
            items.append({
                "clave": r[0],
                "nombre": r[1],
                "piezas": float(r[2] or 0),
                "importe": float(r[3] or 0),
                "sucursales_activas": int(r[4] or 0)
            })
        data = {"success": True, "items": items, "periodo": periodo}
        set_cached(cache_key, data)
        return jsonify(data)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass
