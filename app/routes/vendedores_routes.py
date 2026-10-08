import datetime
from flask import Blueprint, request, jsonify
from app.db import conectar_db

vendedores_bp = Blueprint('vendedores_bp', __name__)

def calcular_rango_fechas(periodo, fecha_ini_str=None, fecha_fin_str=None):
    today = datetime.date.today()
    if periodo == 'hoy':
        return today, today, "Hoy"
    elif periodo == 'ayer':
        ayer = today - datetime.timedelta(days=1)
        return ayer, ayer, "Ayer"
    elif periodo == 'esta_semana':
        inicio_semana = today - datetime.timedelta(days=today.weekday())
        fin_semana = inicio_semana + datetime.timedelta(days=6)
        return inicio_semana, fin_semana, "Esta Semana"
    elif periodo == 'quincena_actual':
        if today.day <= 15:
            inicio = datetime.date(today.year, today.month, 1)
            fin = datetime.date(today.year, today.month, 15)
            texto = f"1ra Quincena {today.strftime('%B %Y')}"
        else:
            inicio = datetime.date(today.year, today.month, 16)
            import calendar
            ultimo_dia = calendar.monthrange(today.year, today.month)[1]
            fin = datetime.date(today.year, today.month, ultimo_dia)
            texto = f"2da Quincena {today.strftime('%B %Y')}"
        return inicio, fin, texto
    elif periodo == 'este_mes':
        inicio = datetime.date(today.year, today.month, 1)
        import calendar
        ultimo_dia = calendar.monthrange(today.year, today.month)[1]
        fin = datetime.date(today.year, today.month, ultimo_dia)
        return inicio, fin, f"{today.strftime('%B %Y').capitalize()}"
    elif periodo == 'mes_anterior':
        primer_dia_este_mes = datetime.date(today.year, today.month, 1)
        ultimo_dia_mes_ant = primer_dia_este_mes - datetime.timedelta(days=1)
        inicio = datetime.date(ultimo_dia_mes_ant.year, ultimo_dia_mes_ant.month, 1)
        return inicio, ultimo_dia_mes_ant, f"{ultimo_dia_mes_ant.strftime('%B %Y').capitalize()}"
    elif periodo == 'anio_actual':
        inicio = datetime.date(today.year, 1, 1)
        fin = datetime.date(today.year, 12, 31)
        return inicio, fin, f"Año {today.year}"
    elif periodo == 'rango_fechas' and fecha_ini_str and fecha_fin_str:
        try:
            d_ini = datetime.datetime.strptime(fecha_ini_str, '%Y-%m-%d').date()
            d_fin = datetime.datetime.strptime(fecha_fin_str, '%Y-%m-%d').date()
            return d_ini, d_fin, f"Del {d_ini.strftime('%d/%m/%Y')} al {d_fin.strftime('%d/%m/%Y')}"
        except Exception:
            pass
    # Por defecto este mes
    inicio = datetime.date(today.year, today.month, 1)
    import calendar
    ultimo_dia = calendar.monthrange(today.year, today.month)[1]
    fin = datetime.date(today.year, today.month, ultimo_dia)
    return inicio, fin, f"{today.strftime('%B %Y').capitalize()}"


@vendedores_bp.route('/api/vendedores/resumen-comisiones', methods=['GET'])
def get_resumen_comisiones():
    """
    Obtiene el resumen de ventas y cálculo de comisiones agrupado por vendedor
    para el periodo y filtros seleccionados.
    """
    periodo = request.args.get('periodo', 'este_mes')
    fecha_ini_str = request.args.get('fecha_inicio')
    fecha_fin_str = request.args.get('fecha_fin')
    sucursal_id = request.args.get('sucursal_id')
    busqueda = (request.args.get('busqueda') or '').strip().upper()
    incluir_ocultos = request.args.get('incluir_ocultos', '0') == '1'

    fecha_ini, fecha_fin, texto_periodo = calcular_rango_fechas(periodo, fecha_ini_str, fecha_fin_str)

    conn = None
    try:
        conn = conectar_db()
        cur = conn.cursor()

        # 1. Catálogo de almacenes / sucursales para el filtro
        cur.execute("SELECT ALMACEN_ID, TRIM(NOMBRE) FROM ALMACENES WHERE OCULTO = 'N' OR OCULTO IS NULL ORDER BY NOMBRE")
        sucursales = [{"id": r[0], "nombre": r[1]} for r in cur.fetchall()]

        # 2. Construir filtros para la consulta de ventas en DOCTOS_PV
        filtro_sucursal_pv = ""
        params_sucursal_pv = []
        if sucursal_id and str(sucursal_id).isdigit():
            filtro_sucursal_pv = "AND (pv.ALMACEN_ID = ? OR pv.SUCURSAL_ID = ?)"
            params_sucursal_pv = [int(sucursal_id), int(sucursal_id)]

        filtro_busqueda = ""
        params_busq = []
        if busqueda:
            filtro_busqueda = "AND (UPPER(v.NOMBRE) LIKE ?)"
            params_busq = [f"%{busqueda}%"]

        filtro_oculto = ""
        if not incluir_ocultos:
            filtro_oculto = "AND (v.OCULTO = 'N' OR v.OCULTO IS NULL)"

        # Consulta que agrupa ventas de DOCTOS_PV por Vendedor
        sql_pv = f"""
            SELECT 
                v.VENDEDOR_ID,
                TRIM(v.NOMBRE) AS VENDEDOR_NOMBRE,
                COALESCE(TRIM(p.NOMBRE), 'SIN POLÍTICA') AS POLITICA_NOMBRE,
                COALESCE(p.COMISION, 0.0) AS POLITICA_PCTJE,
                COALESCE(p.TIPO_CALCULO, 'A') AS TIPO_CALCULO,
                v.OCULTO,
                COUNT(pv.DOCTO_PV_ID) AS TOTAL_TICKETS,
                SUM(pv.IMPORTE_NETO) AS TOTAL_NETO,
                SUM(COALESCE(pv.TOTAL_IMPUESTOS, 0)) AS TOTAL_IMPUESTOS,
                SUM(pv.IMPORTE_NETO + COALESCE(pv.TOTAL_IMPUESTOS, 0)) AS TOTAL_BRUTO
            FROM VENDEDORES v
            LEFT JOIN POLITICAS_COMISIONES_VENDEDORES p ON v.POLITICA_COMIS_VEN_ID = p.POLITICA_COMIS_VEN_ID
            JOIN DOCTOS_PV pv ON v.VENDEDOR_ID = pv.VENDEDOR_ID
            WHERE pv.FECHA BETWEEN ? AND ?
              AND pv.ESTATUS <> 'C'
              AND pv.TIPO_DOCTO = 'V'
              {filtro_sucursal_pv}
              {filtro_busqueda}
              {filtro_oculto}
            GROUP BY 
                v.VENDEDOR_ID, v.NOMBRE, p.NOMBRE, p.COMISION, p.TIPO_CALCULO, v.OCULTO
            ORDER BY TOTAL_NETO DESC
        """

        params = [fecha_ini, fecha_fin] + params_sucursal_pv + params_busq
        cur.execute(sql_pv, params)
        rows_pv = cur.fetchall()

        vendedores_map = {}
        for r in rows_pv:
            v_id = int(r[0])
            v_nom = r[1]
            pol_nom = r[2]
            pol_pct = float(r[3] or 0.0)
            tipo_calc = r[4]
            oculto = r[5]
            tickets = int(r[6] or 0)
            neto = float(r[7] or 0.0)
            imptos = float(r[8] or 0.0)
            bruto = float(r[9] or 0.0)

            # Comisión calculada: porcentaje sobre venta neta
            comision = neto * (pol_pct / 100.0)
            ticket_prom = (neto / tickets) if tickets > 0 else 0.0

            vendedores_map[v_id] = {
                "vendedor_id": v_id,
                "nombre": v_nom,
                "politica_nombre": pol_nom,
                "politica_pctje": pol_pct,
                "tipo_calculo": tipo_calc,
                "oculto": oculto == 'S',
                "tickets": tickets,
                "total_neto": round(neto, 2),
                "total_impuestos": round(imptos, 2),
                "total_bruto": round(bruto, 2),
                "comision_calculada": round(comision, 2),
                "ticket_promedio": round(ticket_prom, 2)
            }

        cur.close()
        conn.close()

        vendedores_lista = list(vendedores_map.values())
        # Ordenar por venta neta descendente
        vendedores_lista.sort(key=lambda x: x['total_neto'], reverse=True)

        # Calcular Totales KPI Globales
        tot_tickets = sum(v['tickets'] for v in vendedores_lista)
        tot_neto = sum(v['total_neto'] for v in vendedores_lista)
        tot_impuestos = sum(v['total_impuestos'] for v in vendedores_lista)
        tot_bruto = sum(v['total_bruto'] for v in vendedores_lista)
        tot_comisiones = sum(v['comision_calculada'] for v in vendedores_lista)
        prom_ticket = (tot_neto / tot_tickets) if tot_tickets > 0 else 0.0

        kpis = {
            "total_vendedores": len(vendedores_lista),
            "total_tickets": tot_tickets,
            "total_neto": round(tot_neto, 2),
            "total_impuestos": round(tot_impuestos, 2),
            "total_bruto": round(tot_bruto, 2),
            "total_comisiones": round(tot_comisiones, 2),
            "ticket_promedio": round(prom_ticket, 2)
        }

        return jsonify({
            "success": True,
            "periodo_texto": texto_periodo,
            "fecha_inicio": fecha_ini.strftime('%Y-%m-%d'),
            "fecha_fin": fecha_fin.strftime('%Y-%m-%d'),
            "kpis": kpis,
            "vendedores": vendedores_lista,
            "sucursales": sucursales
        })

    except Exception as e:
        if conn:
            try: conn.close()
            except: pass
        return jsonify({"success": False, "error": str(e)}), 500


@vendedores_bp.route('/api/vendedores/<int:vendedor_id>/detalle', methods=['GET'])
def get_detalle_vendedor(vendedor_id):
    """
    Retorna el desglose detallado de tickets y documentos de venta
    realizados por el vendedor en el periodo seleccionado.
    """
    periodo = request.args.get('periodo', 'este_mes')
    fecha_ini_str = request.args.get('fecha_inicio')
    fecha_fin_str = request.args.get('fecha_fin')

    fecha_ini, fecha_fin, texto_periodo = calcular_rango_fechas(periodo, fecha_ini_str, fecha_fin_str)

    conn = None
    try:
        conn = conectar_db()
        cur = conn.cursor()

        # Datos del vendedor y su política
        cur.execute("""
            SELECT 
                v.VENDEDOR_ID, TRIM(v.NOMBRE), 
                COALESCE(TRIM(p.NOMBRE), 'SIN POLÍTICA'),
                COALESCE(p.COMISION, 0.0)
            FROM VENDEDORES v
            LEFT JOIN POLITICAS_COMISIONES_VENDEDORES p ON v.POLITICA_COMIS_VEN_ID = p.POLITICA_COMIS_VEN_ID
            WHERE v.VENDEDOR_ID = ?
        """, (vendedor_id,))
        v_row = cur.fetchone()
        if not v_row:
            cur.close()
            conn.close()
            return jsonify({"success": False, "error": "Vendedor no encontrado"}), 404

        vendedor_info = {
            "vendedor_id": int(v_row[0]),
            "nombre": v_row[1],
            "politica_nombre": v_row[2],
            "politica_pctje": float(v_row[3] or 0.0)
        }
        pct_comision = vendedor_info["politica_pctje"]

        # Obtener los tickets en DOCTOS_PV
        sql_tickets = """
            SELECT 
                pv.DOCTO_PV_ID,
                TRIM(pv.FOLIO) AS FOLIO,
                pv.FECHA,
                pv.HORA,
                TRIM(s.NOMBRE) AS SUCURSAL,
                TRIM(a.NOMBRE) AS ALMACEN,
                COALESCE(TRIM(c.NOMBRE), 'MOSTRADOR / PÚBLICO GRAL') AS CLIENTE,
                pv.IMPORTE_NETO,
                COALESCE(pv.TOTAL_IMPUESTOS, 0) AS TOTAL_IMPUESTOS,
                (pv.IMPORTE_NETO + COALESCE(pv.TOTAL_IMPUESTOS, 0)) AS TOTAL_BRUTO
            FROM DOCTOS_PV pv
            LEFT JOIN SUCURSALES s ON pv.SUCURSAL_ID = s.SUCURSAL_ID
            LEFT JOIN ALMACENES a ON pv.ALMACEN_ID = a.ALMACEN_ID
            LEFT JOIN CLIENTES c ON pv.CLIENTE_ID = c.CLIENTE_ID
            WHERE pv.VENDEDOR_ID = ?
              AND pv.FECHA BETWEEN ? AND ?
              AND pv.ESTATUS <> 'C'
              AND pv.TIPO_DOCTO = 'V'
            ORDER BY pv.FECHA DESC, pv.DOCTO_PV_ID DESC
        """
        cur.execute(sql_tickets, (vendedor_id, fecha_ini, fecha_fin))
        rows = cur.fetchall()

        tickets = []
        tot_neto = 0.0
        tot_comis = 0.0

        for r in rows:
            neto = float(r[7] or 0.0)
            imp = float(r[8] or 0.0)
            bruto = float(r[9] or 0.0)
            comis_doc = neto * (pct_comision / 100.0)

            tot_neto += neto
            tot_comis += comis_doc

            tickets.append({
                "docto_pv_id": int(r[0]),
                "folio": r[1],
                "fecha": r[2].strftime('%d/%m/%Y') if r[2] else '',
                "hora": str(r[3])[:8] if r[3] else '',
                "sucursal": r[4] or '',
                "almacen": r[5] or '',
                "cliente": r[6] or 'PÚBLICO GENERAL',
                "importe_neto": round(neto, 2),
                "total_impuestos": round(imp, 2),
                "total_bruto": round(bruto, 2),
                "comision": round(comis_doc, 2)
            })

        cur.close()
        conn.close()

        return jsonify({
            "success": True,
            "vendedor": vendedor_info,
            "periodo_texto": texto_periodo,
            "total_tickets": len(tickets),
            "total_neto": round(tot_neto, 2),
            "total_comision": round(tot_comis, 2),
            "tickets": tickets
        })

    except Exception as e:
        if conn:
            try: conn.close()
            except: pass
        return jsonify({"success": False, "error": str(e)}), 500


@vendedores_bp.route('/api/vendedores/politicas', methods=['GET'])
def get_politicas_comisiones():
    """Retorna las políticas de comisiones disponibles en Microsip."""
    conn = None
    try:
        conn = conectar_db()
        cur = conn.cursor()
        cur.execute("SELECT POLITICA_COMIS_VEN_ID, TRIM(NOMBRE), COMISION, TIPO_CALCULO FROM POLITICAS_COMISIONES_VENDEDORES ORDER BY NOMBRE")
        politicas = [{
            "id": int(r[0]),
            "nombre": r[1],
            "comision": float(r[2] or 0.0),
            "tipo_calculo": r[3]
        } for r in cur.fetchall()]
        cur.close()
        conn.close()
        return jsonify({"success": True, "politicas": politicas})
    except Exception as e:
        if conn:
            try: conn.close()
            except: pass
        return jsonify({"success": False, "error": str(e)}), 500


@vendedores_bp.route('/api/vendedores/config-comisiones', methods=['GET'])
def get_config_comisiones():
    """
    Retorna el estado completo de configuración de políticas y vendedores
    con sus comisiones y asignaciones para el módulo de Configuración.
    """
    conn = None
    try:
        conn = conectar_db()
        cur = conn.cursor()

        # 1. Obtener todas las políticas de comisiones y conteo de vendedores
        sql_pol = """
            SELECT 
                p.POLITICA_COMIS_VEN_ID,
                TRIM(p.NOMBRE),
                COALESCE(p.COMISION, 0.0),
                COALESCE(p.TIPO_CALCULO, 'A'),
                COALESCE(p.ES_PREDET, 'N'),
                COALESCE(p.OCULTO, 'N'),
                COUNT(v.VENDEDOR_ID) AS TOTAL_VENDEDORES
            FROM POLITICAS_COMISIONES_VENDEDORES p
            LEFT JOIN VENDEDORES v ON p.POLITICA_COMIS_VEN_ID = v.POLITICA_COMIS_VEN_ID
            GROUP BY p.POLITICA_COMIS_VEN_ID, p.NOMBRE, p.COMISION, p.TIPO_CALCULO, p.ES_PREDET, p.OCULTO
            ORDER BY p.NOMBRE
        """
        cur.execute(sql_pol)
        politicas = []
        for r in cur.fetchall():
            tc = r[3]
            desc_calc = "Por importe de venta (Artículos)" if tc == 'A' else "Por cobranza (Clientes)"
            politicas.append({
                "id": int(r[0]),
                "nombre": r[1],
                "comision": float(r[2] or 0.0),
                "tipo_calculo": tc,
                "tipo_calculo_desc": desc_calc,
                "es_predet": r[4] == 'S',
                "oculto": r[5] == 'S',
                "total_vendedores": int(r[6] or 0)
            })

        # 2. Obtener todos los vendedores con su política asignada y % comisión
        sql_ven = """
            SELECT 
                v.VENDEDOR_ID,
                TRIM(v.NOMBRE),
                v.POLITICA_COMIS_VEN_ID,
                COALESCE(TRIM(p.NOMBRE), 'SIN POLÍTICA'),
                COALESCE(p.COMISION, 0.0),
                COALESCE(p.TIPO_CALCULO, 'A'),
                COALESCE(v.OCULTO, 'N')
            FROM VENDEDORES v
            LEFT JOIN POLITICAS_COMISIONES_VENDEDORES p ON v.POLITICA_COMIS_VEN_ID = p.POLITICA_COMIS_VEN_ID
            ORDER BY v.NOMBRE
        """
        cur.execute(sql_ven)
        vendedores = []
        for r in cur.fetchall():
            vendedores.append({
                "vendedor_id": int(r[0]),
                "nombre": r[1],
                "politica_id": int(r[2]) if r[2] is not None else None,
                "politica_nombre": r[3],
                "comision_pct": float(r[4] or 0.0),
                "tipo_calculo": r[5],
                "oculto": r[6] == 'S'
            })

        cur.close()
        conn.close()

        # KPIs
        total_pols = len(politicas)
        total_vens = len(vendedores)
        vens_activos = sum(1 for v in vendedores if not v['oculto'])
        pcts = [v['comision_pct'] for v in vendedores if not v['oculto']]
        prom_pct = (sum(pcts) / len(pcts)) if pcts else 0.0

        return jsonify({
            "success": True,
            "kpis": {
                "total_politicas": total_pols,
                "total_vendedores": total_vens,
                "vendedores_activos": vens_activos,
                "comision_promedio": round(prom_pct, 2)
            },
            "politicas": politicas,
            "vendedores": vendedores
        })

    except Exception as e:
        if conn:
            try: conn.close()
            except: pass
        return jsonify({"success": False, "error": str(e)}), 500


@vendedores_bp.route('/api/vendedores/politicas', methods=['POST'])
def crear_politica_comision():
    """Crea una nueva política de comisiones en Microsip."""
    data = request.get_json() or {}
    nombre = (data.get('nombre') or '').strip().upper()
    comision_raw = data.get('comision')
    tipo_calculo = (data.get('tipo_calculo') or 'A').strip().upper()

    if not nombre:
        return jsonify({"success": False, "error": "El nombre de la política es obligatorio."}), 400

    try:
        comision = float(comision_raw)
        if comision < 0:
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "El porcentaje de comisión debe ser un número mayor o igual a 0."}), 400

    if tipo_calculo not in ('A', 'C'):
        tipo_calculo = 'A'

    conn = None
    try:
        conn = conectar_db()
        cur = conn.cursor()

        # Generar ID de catálogo oficial de Microsip
        cur.execute("SELECT GEN_ID(ID_CATALOGOS, 1) FROM RDB$DATABASE")
        nuevo_id = int(cur.fetchone()[0])

        sql_insert = """
            INSERT INTO POLITICAS_COMISIONES_VENDEDORES 
            (POLITICA_COMIS_VEN_ID, NOMBRE, TIPO_CALCULO, COMISION, ES_PREDET, OCULTO, USUARIO_CREADOR, FECHA_HORA_CREACION)
            VALUES (?, ?, ?, ?, 'N', 'N', 'ADMIN', CURRENT_TIMESTAMP)
        """
        cur.execute(sql_insert, (nuevo_id, nombre, tipo_calculo, comision))
        conn.commit()

        cur.close()
        conn.close()

        return jsonify({
            "success": True,
            "mensaje": f"Política '{nombre}' creada exitosamente con {comision}% de comisión.",
            "politica": {
                "id": nuevo_id,
                "nombre": nombre,
                "comision": comision,
                "tipo_calculo": tipo_calculo,
                "total_vendedores": 0
            }
        })

    except Exception as e:
        if conn:
            try:
                conn.rollback()
                conn.close()
            except: pass
        return jsonify({"success": False, "error": f"Error al guardar política: {str(e)}"}), 500


@vendedores_bp.route('/api/vendedores/politicas/<int:politica_id>', methods=['PUT'])
def actualizar_politica_comision(politica_id):
    """Actualiza una política de comisiones existente en Microsip."""
    data = request.get_json() or {}
    nombre = (data.get('nombre') or '').strip().upper()
    comision_raw = data.get('comision')
    tipo_calculo = (data.get('tipo_calculo') or '').strip().upper()
    oculto = data.get('oculto')

    if not nombre:
        return jsonify({"success": False, "error": "El nombre de la política es obligatorio."}), 400

    try:
        comision = float(comision_raw)
        if comision < 0:
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "El porcentaje de comisión debe ser válido."}), 400

    if tipo_calculo not in ('A', 'C'):
        tipo_calculo = 'A'

    conn = None
    try:
        conn = conectar_db()
        cur = conn.cursor()

        # Verificar si existe
        cur.execute("SELECT POLITICA_COMIS_VEN_ID FROM POLITICAS_COMISIONES_VENDEDORES WHERE POLITICA_COMIS_VEN_ID = ?", (politica_id,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"success": False, "error": "Política no encontrada."}), 404

        oculto_val = 'S' if oculto is True or oculto == 'S' else 'N'

        sql_update = """
            UPDATE POLITICAS_COMISIONES_VENDEDORES
            SET NOMBRE = ?,
                COMISION = ?,
                TIPO_CALCULO = ?,
                OCULTO = ?,
                USUARIO_ULT_MODIF = 'ADMIN',
                FECHA_HORA_ULT_MODIF = CURRENT_TIMESTAMP
            WHERE POLITICA_COMIS_VEN_ID = ?
        """
        cur.execute(sql_update, (nombre, comision, tipo_calculo, oculto_val, politica_id))
        conn.commit()

        # Contar cuántos vendedores fueron afectados
        cur.execute("SELECT COUNT(*) FROM VENDEDORES WHERE POLITICA_COMIS_VEN_ID = ?", (politica_id,))
        afectados = int(cur.fetchone()[0] or 0)

        cur.close()
        conn.close()

        return jsonify({
            "success": True,
            "mensaje": f"Política '{nombre}' actualizada correctamente a {comision}% ({afectados} vendedores asociados).",
            "afectados": afectados
        })

    except Exception as e:
        if conn:
            try:
                conn.rollback()
                conn.close()
            except: pass
        return jsonify({"success": False, "error": f"Error al actualizar política: {str(e)}"}), 500


@vendedores_bp.route('/api/vendedores/<int:vendedor_id>/asignar-politica', methods=['PUT'])
def asignar_politica_vendedor(vendedor_id):
    """Asigna una política de comisión a un vendedor específico."""
    data = request.get_json() or {}
    politica_id = data.get('politica_id')

    if politica_id is None:
        return jsonify({"success": False, "error": "Debe especificar la política a asignar."}), 400

    conn = None
    try:
        conn = conectar_db()
        cur = conn.cursor()

        # Validar vendedor
        cur.execute("SELECT VENDEDOR_ID, TRIM(NOMBRE) FROM VENDEDORES WHERE VENDEDOR_ID = ?", (vendedor_id,))
        v_row = cur.fetchone()
        if not v_row:
            cur.close()
            conn.close()
            return jsonify({"success": False, "error": "Vendedor no encontrado."}), 404
        nom_vendedor = v_row[1]

        # Validar política
        cur.execute("SELECT POLITICA_COMIS_VEN_ID, TRIM(NOMBRE), COMISION FROM POLITICAS_COMISIONES_VENDEDORES WHERE POLITICA_COMIS_VEN_ID = ?", (int(politica_id),))
        p_row = cur.fetchone()
        if not p_row:
            cur.close()
            conn.close()
            return jsonify({"success": False, "error": "Política de comisión no encontrada."}), 404
        nom_politica = p_row[1]
        pct_comision = float(p_row[2] or 0.0)

        # Actualizar vendedor
        sql_update = """
            UPDATE VENDEDORES
            SET POLITICA_COMIS_VEN_ID = ?,
                USUARIO_ULT_MODIF = 'ADMIN',
                FECHA_HORA_ULT_MODIF = CURRENT_TIMESTAMP
            WHERE VENDEDOR_ID = ?
        """
        cur.execute(sql_update, (int(politica_id), vendedor_id))
        conn.commit()

        cur.close()
        conn.close()

        return jsonify({
            "success": True,
            "mensaje": f"Se asignó la política '{nom_politica}' ({pct_comision}%) al vendedor {nom_vendedor}.",
            "vendedor": {
                "vendedor_id": vendedor_id,
                "nombre": nom_vendedor,
                "politica_id": int(politica_id),
                "politica_nombre": nom_politica,
                "comision_pct": pct_comision
            }
        })

    except Exception as e:
        if conn:
            try:
                conn.rollback()
                conn.close()
            except: pass
        return jsonify({"success": False, "error": f"Error al asignar política: {str(e)}"}), 500


@vendedores_bp.route('/api/vendedores/asignar-politica-masiva', methods=['POST'])
def asignar_politica_masiva():
    """Asigna una política a múltiples vendedores simultáneamente."""
    data = request.get_json() or {}
    vendedores_ids = data.get('vendedores_ids', [])
    politica_id = data.get('politica_id')

    if not vendedores_ids or not isinstance(vendedores_ids, list):
        return jsonify({"success": False, "error": "Debe seleccionar al menos un vendedor."}), 400

    if politica_id is None:
        return jsonify({"success": False, "error": "Debe especificar la política."}), 400

    conn = None
    try:
        conn = conectar_db()
        cur = conn.cursor()

        # Validar política
        cur.execute("SELECT TRIM(NOMBRE), COMISION FROM POLITICAS_COMISIONES_VENDEDORES WHERE POLITICA_COMIS_VEN_ID = ?", (int(politica_id),))
        p_row = cur.fetchone()
        if not p_row:
            cur.close()
            conn.close()
            return jsonify({"success": False, "error": "Política no encontrada."}), 404
        nom_pol = p_row[0]
        pct = float(p_row[1] or 0.0)

        # Actualizar en lote
        for vid in vendedores_ids:
            cur.execute("""
                UPDATE VENDEDORES
                SET POLITICA_COMIS_VEN_ID = ?,
                    USUARIO_ULT_MODIF = 'ADMIN',
                    FECHA_HORA_ULT_MODIF = CURRENT_TIMESTAMP
                WHERE VENDEDOR_ID = ?
            """, (int(politica_id), int(vid)))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({
            "success": True,
            "mensaje": f"Se asignó la política '{nom_pol}' ({pct}%) a {len(vendedores_ids)} vendedores."
        })

    except Exception as e:
        if conn:
            try:
                conn.rollback()
                conn.close()
            except: pass
        return jsonify({"success": False, "error": str(e)}), 500

