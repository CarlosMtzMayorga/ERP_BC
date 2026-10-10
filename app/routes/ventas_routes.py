import datetime
from flask import Blueprint, jsonify, request
from app.db import conectar_db
from app.config import get_current_dsn

ventas_bp = Blueprint('ventas', __name__)

# Cache en memoria para el catálogo de sucursales (no cambia seguido)
_cache_sucursales_ventas = {}
_cache_sucursales_ttl = 120  # segundos

def _limpiar_texto(txt):
    if not txt:
        return ""
    txt = str(txt).strip()
    txt = txt.replace("Grficas", "Gráficas").replace("Grficas", "Gráficas")
    txt = txt.replace("Revolucin", "Revolución").replace("Revolucin", "Revolución")
    txt = txt.replace("Gmez", "Gómez").replace("Gmez", "Gómez")
    return txt

@ventas_bp.route('/api/ventas/sucursales', methods=['GET'])
@ventas_bp.route('/api/almacenes', methods=['GET'])
def get_sucursales_ventas():
    current_dsn = get_current_dsn()
    cache_key = f"{current_dsn}_sucursales"
    cached = _cache_sucursales_ventas.get(cache_key)
    if cached:
        datos, ts = cached
        if (datetime.datetime.now() - ts).total_seconds() < _cache_sucursales_ttl:
            return jsonify(datos)

    conn = None
    try:
        conn = conectar_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT a.ALMACEN_ID, TRIM(a.NOMBRE)
            FROM ALMACENES a
            WHERE UPPER(a.NOMBRE) NOT LIKE 'NO UTILIZAR%'
              AND UPPER(a.NOMBRE) NOT LIKE '%TRANSITO%'
              AND UPPER(a.NOMBRE) NOT LIKE '%DEVOLUCION%'
              AND UPPER(a.NOMBRE) NOT LIKE '%USADOS%'
              AND (
                  a.ES_PPAL = 'S' 
                  OR UPPER(a.NOMBRE) LIKE 'SUCURSAL%' 
                  OR UPPER(a.NOMBRE) LIKE 'CEDIS%' 
                  OR UPPER(a.NOMBRE) = 'MATRIZ'
                  OR EXISTS (SELECT 1 FROM DOCTOS_PV pv WHERE pv.ALMACEN_ID = a.ALMACEN_ID)
              )
            ORDER BY 
                CASE WHEN UPPER(a.NOMBRE) LIKE '%CEDIS%' THEN 0 ELSE 1 END,
                a.NOMBRE
        """)
        sucursales = []
        for r in cur.fetchall():
            if r[0] is not None:
                nom = _limpiar_texto(r[1])
                sucursales.append({
                    "id": int(r[0]),
                    "nombre": nom
                })
        datos = {
            "success": True,
            "sucursales": sucursales,
            "almacenes": sucursales
        }
        _cache_sucursales_ventas[cache_key] = (datos, datetime.datetime.now())
        return jsonify(datos)
    except Exception as e:
        return jsonify({"success": False, "error": str(e), "sucursales": [], "almacenes": []}), 500
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass

@ventas_bp.route('/api/ventas/resumen-sucursal', methods=['GET'])
def get_ventas_sucursal():
    almacen_id = request.args.get('almacen_id', '').strip()
    fecha_ini = request.args.get('fecha_inicio', '').strip()
    fecha_fin = request.args.get('fecha_final', '').strip()
    fecha = request.args.get('fecha', '').strip()

    hoy = datetime.date.today().strftime("%Y-%m-%d")
    if not fecha_ini and not fecha_fin:
        if fecha:
            fecha_ini = fecha
            fecha_fin = fecha
        else:
            fecha_ini = hoy
            fecha_fin = hoy
    elif not fecha_ini:
        fecha_ini = fecha_fin
    elif not fecha_fin:
        fecha_fin = fecha_ini

    conn = None
    try:
        conn = conectar_db()
        cur = conn.cursor()

        filtro_alm = ""
        params = [fecha_ini, fecha_fin]
        if almacen_id and almacen_id.isdigit():
            filtro_alm = "AND p.ALMACEN_ID = ?"
            params.append(int(almacen_id))

        # Resumen general (solo ventas vigentes)
        cur.execute(f"""
            SELECT 
                COUNT(p.DOCTO_PV_ID) AS TICKETS,
                SUM(p.IMPORTE_NETO + COALESCE(p.TOTAL_IMPUESTOS, 0)) AS TOTAL_VENTA,
                AVG(p.IMPORTE_NETO + COALESCE(p.TOTAL_IMPUESTOS, 0)) AS TICKET_PROMEDIO
            FROM DOCTOS_PV p
            WHERE p.FECHA >= ? AND p.FECHA <= ?
              AND p.ESTATUS <> 'C'
              AND p.TIPO_DOCTO IN ('V', 'F')
              {filtro_alm}
        """, tuple(params))
        r = cur.fetchone()
        resumen = {
            "tickets": int(r[0] or 0),
            "total_venta": float(r[1] or 0),
            "ticket_promedio": float(r[2] or 0)
        }

        # Desglose diario
        cur.execute(f"""
            SELECT 
                p.FECHA,
                COUNT(p.DOCTO_PV_ID) AS TICKETS,
                SUM(p.IMPORTE_NETO + COALESCE(p.TOTAL_IMPUESTOS, 0)) AS TOTAL_VENTA
            FROM DOCTOS_PV p
            WHERE p.FECHA >= ? AND p.FECHA <= ?
              AND p.ESTATUS <> 'C'
              AND p.TIPO_DOCTO IN ('V', 'F')
              {filtro_alm}
            GROUP BY p.FECHA
            ORDER BY p.FECHA ASC
        """, tuple(params))
        dias = []
        for d in cur.fetchall():
            dias.append({
                "fecha": str(d[0]),
                "tickets": int(d[1] or 0),
                "total": float(d[2] or 0)
            })

        # Top 10 artículos de esta sucursal o grupo
        cur.execute(f"""
            SELECT FIRST 10
                COALESCE(TRIM(ca.CLAVE_ARTICULO), 'S/C') AS CLAVE,
                TRIM(ar.NOMBRE) AS NOMBRE,
                SUM(d.UNIDADES - COALESCE(d.UNIDADES_DEV, 0)) AS PIEZAS,
                SUM(d.PRECIO_TOTAL_NETO + (COALESCE(d.IMPUESTO_POR_UNIDAD, 0) * d.UNIDADES)) AS IMPORTE
            FROM DOCTOS_PV p
            JOIN DOCTOS_PV_DET d ON d.DOCTO_PV_ID = p.DOCTO_PV_ID
            JOIN ARTICULOS ar ON ar.ARTICULO_ID = d.ARTICULO_ID
            LEFT JOIN CLAVES_ARTICULOS ca ON ca.ARTICULO_ID = ar.ARTICULO_ID AND ca.ROL_CLAVE_ART_ID = 17
            WHERE p.FECHA >= ? AND p.FECHA <= ?
              AND p.ESTATUS <> 'C'
              AND p.TIPO_DOCTO IN ('V', 'F')
              {filtro_alm}
            GROUP BY ca.CLAVE_ARTICULO, ar.NOMBRE
            ORDER BY PIEZAS DESC
        """, tuple(params))
        top = []
        for t in cur.fetchall():
            top.append({
                "clave": t[0],
                "nombre": _limpiar_texto(t[1]),
                "piezas": float(t[2] or 0),
                "importe": float(t[3] or 0)
            })

        return jsonify({
            "success": True,
            "resumen": resumen,
            "ventas_por_dia": dias,
            "top_articulos": top
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass

@ventas_bp.route('/api/ventas/tickets', methods=['GET'])
def get_tickets():
    almacen_id = request.args.get('almacen_id', '').strip()
    fecha_ini = request.args.get('fecha_inicio', '').strip()
    fecha_fin = request.args.get('fecha_final', '').strip()
    fecha = request.args.get('fecha', '').strip()
    folio = request.args.get('folio', '').strip()
    busqueda = request.args.get('busqueda', '').strip()
    tipo = request.args.get('tipo', '').strip().upper()
    estatus = request.args.get('estatus', '').strip().upper()
    orden = request.args.get('orden', 'reciente').strip().lower()
    monto_min = request.args.get('monto_min', '').strip()
    monto_max = request.args.get('monto_max', '').strip()
    limite = request.args.get('limite', '150').strip()

    try:
        limit_num = max(10, min(500, int(limite)))
    except:
        limit_num = 150

    hoy = datetime.date.today().strftime("%Y-%m-%d")
    if not fecha_ini and not fecha_fin:
        if fecha:
            fecha_ini = fecha
            fecha_fin = fecha
        else:
            fecha_ini = hoy
            fecha_fin = hoy
    elif not fecha_ini:
        fecha_ini = fecha_fin
    elif not fecha_fin:
        fecha_fin = fecha_ini

    conn = None
    try:
        conn = conectar_db()
        cur = conn.cursor()

        filtros = []
        params = []

        # Tipo de documento
        if tipo == 'V':
            filtros.append("p.TIPO_DOCTO = 'V'")
        elif tipo == 'F':
            filtros.append("p.TIPO_DOCTO = 'F'")
        else:
            filtros.append("p.TIPO_DOCTO IN ('V', 'F')")

        # Estatus
        if estatus == 'VIGENTES':
            filtros.append("p.ESTATUS <> 'C'")
        elif estatus == 'CANCELADOS':
            filtros.append("p.ESTATUS = 'C'")

        # Fechas o Folio directo
        if folio:
            filtros.append("p.FOLIO LIKE ?")
            params.append(f"%{folio}%")
        else:
            if fecha_ini == fecha_fin:
                filtros.append("p.FECHA = ?")
                params.append(fecha_ini)
            else:
                filtros.append("p.FECHA >= ? AND p.FECHA <= ?")
                params.extend([fecha_ini, fecha_fin])

        # Búsqueda libre (Folio, Cliente o Vendedor)
        if busqueda:
            filtros.append("(UPPER(p.FOLIO) LIKE ? OR UPPER(c.NOMBRE) LIKE ? OR UPPER(v.NOMBRE) LIKE ?)")
            param_b = f"%{busqueda.upper()}%"
            params.extend([param_b, param_b, param_b])

        # Sucursal / Almacén
        if almacen_id and almacen_id.isdigit():
            filtros.append("p.ALMACEN_ID = ?")
            params.append(int(almacen_id))

        # Filtro de monto mínimo y máximo
        if monto_min:
            try:
                val_min = float(monto_min)
                filtros.append("(p.IMPORTE_NETO + COALESCE(p.TOTAL_IMPUESTOS, 0)) >= ?")
                params.append(val_min)
            except:
                pass

        if monto_max:
            try:
                val_max = float(monto_max)
                filtros.append("(p.IMPORTE_NETO + COALESCE(p.TOTAL_IMPUESTOS, 0)) <= ?")
                params.append(val_max)
            except:
                pass

        where_clause = " AND ".join(filtros)

        # Regla de Ordenación
        if orden == 'monto_desc':
            order_by = "(p.IMPORTE_NETO + COALESCE(p.TOTAL_IMPUESTOS, 0)) DESC, p.FECHA DESC"
        elif orden == 'monto_asc':
            order_by = "(p.IMPORTE_NETO + COALESCE(p.TOTAL_IMPUESTOS, 0)) ASC, p.FECHA DESC"
        elif orden == 'antiguo':
            order_by = "p.FECHA ASC, p.DOCTO_PV_ID ASC"
        elif orden == 'folio':
            order_by = "p.FOLIO ASC"
        else: # 'reciente'
            order_by = "p.FECHA DESC, p.DOCTO_PV_ID DESC"

        cur.execute(f"""
            SELECT FIRST {limit_num}
                p.DOCTO_PV_ID,
                TRIM(p.FOLIO) AS FOLIO,
                p.FECHA,
                p.HORA,
                TRIM(a.NOMBRE) AS SUCURSAL,
                p.IMPORTE_NETO + COALESCE(p.TOTAL_IMPUESTOS, 0) AS TOTAL,
                p.TIPO_DOCTO,
                p.ESTATUS,
                TRIM(c.NOMBRE) AS CLIENTE,
                TRIM(v.NOMBRE) AS VENDEDOR
            FROM DOCTOS_PV p
            JOIN ALMACENES a ON a.ALMACEN_ID = p.ALMACEN_ID
            LEFT JOIN CLIENTES c ON c.CLIENTE_ID = p.CLIENTE_ID
            LEFT JOIN VENDEDORES v ON v.VENDEDOR_ID = p.VENDEDOR_ID
            WHERE {where_clause}
            ORDER BY {order_by}
        """, tuple(params))

        tickets = []
        suma_total = 0.0
        max_ticket = 0.0

        for r in cur.fetchall():
            nom_suc = _limpiar_texto(r[4])
            estatus_row = str(r[7]).strip() if r[7] else 'N'
            tipo_desc = "Factura" if r[6] == 'F' else "Ticket"
            tot = float(r[5] or 0)
            nom_cli = _limpiar_texto(r[8]) if r[8] else "Público General"
            nom_ven = _limpiar_texto(r[9]) if r[9] else ""
            es_cancelado = estatus_row == 'C'

            if not es_cancelado:
                suma_total += tot
                if tot > max_ticket:
                    max_ticket = tot

            tickets.append({
                "id": int(r[0]),
                "folio": r[1],
                "fecha": str(r[2]),
                "hora": str(r[3])[:8] if r[3] else "",
                "sucursal": nom_suc,
                "total": tot,
                "tipo": tipo_desc,
                "estatus": estatus_row,
                "cancelado": es_cancelado,
                "cliente": nom_cli,
                "vendedor": nom_ven
            })

        conn.close()

        conteo_vigentes = sum(1 for t in tickets if not t["cancelado"])
        promedio = (suma_total / conteo_vigentes) if conteo_vigentes > 0 else 0.0

        resumen = {
            "total_tickets": len(tickets),
            "tickets_vigentes": conteo_vigentes,
            "suma_total": suma_total,
            "promedio": promedio,
            "max_ticket": max_ticket
        }

        return jsonify({
            "success": True,
            "tickets": tickets,
            "resumen": resumen,
            "orden": orden
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass

@ventas_bp.route('/api/ventas/detalle-ticket/<int:docto_id>', methods=['GET'])
def get_detalle_ticket(docto_id):
    conn = None
    try:
        conn = conectar_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT 
                d.DOCTO_PV_DET_ID,
                COALESCE(TRIM(ca.CLAVE_ARTICULO), 'S/C') AS CLAVE,
                TRIM(ar.NOMBRE) AS ARTICULO,
                d.UNIDADES - COALESCE(d.UNIDADES_DEV, 0) AS UNIDADES,
                COALESCE(d.PRECIO_UNITARIO_IMPTO, d.PRECIO_UNITARIO) AS PRECIO_UNITARIO,
                (d.UNIDADES - COALESCE(d.UNIDADES_DEV, 0)) * COALESCE(d.PRECIO_UNITARIO_IMPTO, d.PRECIO_UNITARIO) AS TOTAL_RENGLON
            FROM DOCTOS_PV_DET d
            JOIN ARTICULOS ar ON ar.ARTICULO_ID = d.ARTICULO_ID
            LEFT JOIN CLAVES_ARTICULOS ca ON ca.ARTICULO_ID = ar.ARTICULO_ID AND ca.ROL_CLAVE_ART_ID = 17
            WHERE d.DOCTO_PV_ID = ?
            ORDER BY d.DOCTO_PV_DET_ID ASC
        """, (docto_id,))

        partidas = []
        for r in cur.fetchall():
            partidas.append({
                "id": int(r[0]),
                "clave": r[1],
                "articulo": _limpiar_texto(r[2]),
                "unidades": float(r[3] or 0),
                "precio_unitario": float(r[4] or 0),
                "total": float(r[5] or 0)
            })

        conn.close()
        return jsonify({"success": True, "partidas": partidas})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass
