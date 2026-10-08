import os
import datetime
import sqlite3
from app.db import conectar_db, conectar_sqlite, obtener_siguiente_id
from app.config import SQLITE_DB

# Claves oficiales de cascos / bonificaciones de acumuladores en Microsip
CLAVES_CASCOS = ("B01", "B02", "B03", "B04", "B05", "B06", "B07")

# Almacén de usados por defecto conocido en Microsip
ALMACEN_USADOS_DEFAULT_ID = 2464549
ALMACEN_USADOS_DEFAULT_NOMBRE = "Almacen Usados"

# Condición SQL para identificar verdaderos acumuladores (baterías automotrices y moto)
# Excluye explícitamente terminales, tornillos, cables, agua, soportes, bases, cargas y bonificaciones/usados.
SQL_FILTRO_BATERIAS_REALES = """
(
    (
        GL.GRUPO_LINEA_ID IN (240807, 99850, 2144878, 1045818)
        OR LI.LINEA_ARTICULO_ID = 1119482
        OR (
            (UPPER(A.NOMBRE) LIKE '%ACUMULADOR%' OR UPPER(A.NOMBRE) LIKE '%BATERIA%')
            AND UPPER(COALESCE(GL.NOMBRE, '')) NOT IN ('ACCESORIOS PARA BATERIAS', 'ACCESORIOS', 'ELECTRICO', 'QUIMICOS', 'HERRAMIENTAS', 'SOPORTES', 'HERRAJES', 'INSUMOS')
        )
    )
    AND LI.LINEA_ARTICULO_ID NOT IN (150854, 847057, 606787, 172718, 150849, 1456, 1535, 1545, 1559, 1560, 221682, 221691, 221693)
    AND UPPER(A.NOMBRE) NOT LIKE '%TERMINAL%'
    AND UPPER(A.NOMBRE) NOT LIKE 'AGUA %'
    AND UPPER(A.NOMBRE) NOT LIKE '%ANTISULFATANTE%'
    AND UPPER(A.NOMBRE) NOT LIKE 'CABLE %'
    AND UPPER(A.NOMBRE) NOT LIKE 'SOPORTE %'
    AND UPPER(A.NOMBRE) NOT LIKE 'BASE %'
    AND UPPER(A.NOMBRE) NOT LIKE 'CARGA DE %'
    AND UPPER(A.NOMBRE) NOT LIKE 'AJUSTE %'
)
"""


def init_cascos_sqlite():
    """Inicializa las tablas SQLite para el control de cascos y recepciones."""
    conn = conectar_sqlite()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS config_cascos (
            empresa_id TEXT PRIMARY KEY,
            almacen_id INTEGER NOT NULL,
            almacen_nombre TEXT NOT NULL,
            almacenes_autorizados TEXT DEFAULT '[]',
            actualizado_por TEXT DEFAULT '',
            actualizado_en TEXT DEFAULT ''
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS cascos_recepciones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empresa_id TEXT DEFAULT 'DEFAULT',
            folio_recepcion TEXT UNIQUE,
            folio_microsip TEXT DEFAULT '',
            docto_in_id INTEGER DEFAULT 0,
            almacen_origen_id INTEGER NOT NULL,
            almacen_origen_nombre TEXT NOT NULL,
            almacen_destino_id INTEGER NOT NULL,
            almacen_destino_nombre TEXT NOT NULL,
            fecha_venta_inicio TEXT NOT NULL,
            fecha_venta_final TEXT NOT NULL,
            fecha_hora_creacion TEXT DEFAULT '',
            fecha_hora_recepcion TEXT DEFAULT '',
            confirmado TEXT DEFAULT 'N',
            cancelado TEXT DEFAULT 'N',
            motivo_cancelacion TEXT DEFAULT '',
            usuario_creador TEXT DEFAULT '',
            usuario_recibe TEXT DEFAULT '',
            usuario_cancelacion TEXT DEFAULT '',
            fecha_hora_cancelacion TEXT DEFAULT '',
            tipo_bonificacion TEXT DEFAULT '',
            nota_credito TEXT DEFAULT '',
            es_pago TEXT DEFAULT 'N'
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS cascos_recepcion_det (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recepcion_id INTEGER NOT NULL,
            folio_venta TEXT NOT NULL,
            fecha_venta TEXT DEFAULT '',
            almacen_venta_id INTEGER NOT NULL,
            almacen_venta_nombre TEXT DEFAULT '',
            articulo_id_vendido INTEGER NOT NULL,
            clave_vendida TEXT NOT NULL,
            articulo_id_verificado INTEGER NOT NULL,
            clave_verificada TEXT NOT NULL,
            piezas REAL NOT NULL,
            importe REAL DEFAULT 0,
            docto_ve_id INTEGER DEFAULT 0,
            es_pago TEXT DEFAULT 'N',
            FOREIGN KEY (recepcion_id) REFERENCES cascos_recepciones(id)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS cascos_recepcion_distribucion (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recepcion_det_id INTEGER NOT NULL,
            clave_verificada TEXT NOT NULL,
            articulo_id_verificado INTEGER NOT NULL,
            piezas REAL NOT NULL,
            FOREIGN KEY (recepcion_det_id) REFERENCES cascos_recepcion_det(id)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS cascos_factura_pago (
            empresa_id TEXT NOT NULL,
            docto_ve_id INTEGER NOT NULL,
            cerrado TEXT DEFAULT 'N',
            usuario_cierre TEXT DEFAULT '',
            fecha_hora_cierre TEXT DEFAULT '',
            motivo_cierre TEXT DEFAULT '',
            PRIMARY KEY (empresa_id, docto_ve_id)
        )
    """)

    conn.commit()
    conn.close()


def obtener_config_cascos(empresa_id="DEFAULT"):
    """Devuelve la configuración del almacén de usados y las sucursales autorizadas."""
    init_cascos_sqlite()
    conn = conectar_sqlite()
    cur = conn.cursor()
    cur.execute("""
        SELECT almacen_id, almacen_nombre, almacenes_autorizados, actualizado_por, actualizado_en
        FROM config_cascos
        WHERE empresa_id = ?
    """, (str(empresa_id or "DEFAULT"),))
    row = cur.fetchone()
    conn.close()

    import json
    if row:
        try:
            autorizados = json.loads(row[2]) if row[2] else []
        except Exception:
            autorizados = []
        return {
            "configurado": True,
            "almacen_id": int(row[0]),
            "almacen_nombre": str(row[1]),
            "autorizados": [int(x) for x in autorizados if str(x).isdigit()],
            "actualizado_por": str(row[3] or ""),
            "actualizado_en": str(row[4] or "")
        }

    # Valor predeterminado automático
    return {
        "configurado": False,
        "almacen_id": ALMACEN_USADOS_DEFAULT_ID,
        "almacen_nombre": ALMACEN_USADOS_DEFAULT_NOMBRE,
        "autorizados": [],
        "actualizado_por": "",
        "actualizado_en": ""
    }


def guardar_config_cascos(almacen_id, almacen_nombre, almacenes_autorizados, usuario="ADMIN", empresa_id="DEFAULT"):
    """Guarda la configuración del almacén de usados y sucursales autorizadas."""
    init_cascos_sqlite()
    import json
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    autorizados_json = json.dumps([int(x) for x in almacenes_autorizados if str(x).isdigit()])

    conn = conectar_sqlite()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO config_cascos (empresa_id, almacen_id, almacen_nombre, almacenes_autorizados, actualizado_por, actualizado_en)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(empresa_id) DO UPDATE SET
            almacen_id = excluded.almacen_id,
            almacen_nombre = excluded.almacen_nombre,
            almacenes_autorizados = excluded.almacenes_autorizados,
            actualizado_por = excluded.actualizado_por,
            actualizado_en = excluded.actualizado_en
    """, (str(empresa_id or "DEFAULT"), int(almacen_id), str(almacen_nombre), autorizados_json, str(usuario), now_str))
    conn.commit()
    conn.close()
    return True


def obtener_articulos_cascos_microsip(conn=None):
    """Obtiene los 7 artículos oficiales B01-B07 desde Microsip."""
    cerrar = False
    if conn is None:
        conn = conectar_db()
        cerrar = True
    try:
        cur = conn.cursor()
        placeholders = ",".join("?" for _ in CLAVES_CASCOS)
        cur.execute(f"""
            SELECT ca.ARTICULO_ID, UPPER(TRIM(ca.CLAVE_ARTICULO)), TRIM(a.NOMBRE)
            FROM CLAVES_ARTICULOS ca
            JOIN ARTICULOS a ON a.ARTICULO_ID = ca.ARTICULO_ID
            WHERE UPPER(TRIM(ca.CLAVE_ARTICULO)) IN ({placeholders})
            ORDER BY ca.CLAVE_ARTICULO
        """, CLAVES_CASCOS)
        rows = cur.fetchall()
        articulos = []
        for r in rows:
            articulos.append({
                "articulo_id": int(r[0]),
                "clave": str(r[1]).strip().upper(),
                "nombre": str(r[2]).strip()
            })
        return articulos
    finally:
        if cerrar:
            conn.close()


def obtener_inventario_cascos(empresa_id="DEFAULT"):
    """Consulta las existencias en vivo de B01 a B07 en el almacén de usados."""
    cfg = obtener_config_cascos(empresa_id)
    almacen_id = cfg["almacen_id"]
    almacen_nombre = cfg["almacen_nombre"]

    conn = None
    try:
        conn = conectar_db()
        cur = conn.cursor()

        articulos = obtener_articulos_cascos_microsip(conn)
        if not articulos:
            return {
                "ok": True,
                "configurado": cfg["configurado"],
                "almacen": {"id": almacen_id, "nombre": almacen_nombre},
                "cascos": [],
                "total_piezas": 0
            }

        art_ids = [a["articulo_id"] for a in articulos]
        placeholders_ids = ",".join("?" for _ in art_ids)

        sql_stock = f"""
            SELECT ARTICULO_ID, COALESCE(SUM(ENTRADAS_UNIDADES - SALIDAS_UNIDADES), 0)
            FROM SALDOS_IN
            WHERE ALMACEN_ID = ? AND ARTICULO_ID IN ({placeholders_ids})
            GROUP BY ARTICULO_ID
        """
        cur.execute(sql_stock, (almacen_id, *art_ids))
        existencias_map = {int(r[0]): float(r[1]) for r in cur.fetchall()}

        resultado = []
        total_pzas = 0.0
        for art in articulos:
            stock = existencias_map.get(art["articulo_id"], 0.0)
            total_pzas += stock
            resultado.append({
                "articulo_id": art["articulo_id"],
                "clave": art["clave"],
                "nombre": art["nombre"],
                "existencia": stock
            })

        return {
            "ok": True,
            "configurado": cfg["configurado"],
            "almacen": {"id": almacen_id, "nombre": almacen_nombre},
            "cascos": resultado,
            "total_piezas": total_pzas
        }
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


def consultar_ventas_cascos_periodo(fecha_inicio, fecha_final, almacen_id=None, empresa_id="DEFAULT"):
    """
    Consulta facturas (DOCTOS_VE) y tickets (DOCTOS_PV) que tengan partidas B01..B07
    en el rango de fechas especificado.
    """
    conn = None
    try:
        conn = conectar_db()
        cur = conn.cursor()

        articulos = obtener_articulos_cascos_microsip(conn)
        if not articulos:
            return []
        art_ids = [a["articulo_id"] for a in articulos]
        placeholders_ids = ",".join("?" for _ in art_ids)

        filtro_almacen_ve = " AND DV.ALMACEN_ID = ? " if almacen_id else ""
        filtro_almacen_pv = " AND DPV.ALMACEN_ID = ? " if almacen_id else ""

        sql = f"""
            SELECT DV.FOLIO, DVD.CLAVE_ARTICULO,
                   CASE WHEN DV.TIPO_DOCTO = 'D' THEN DVD.UNIDADES * -1 ELSE DVD.UNIDADES END AS CANTIDAD,
                   CASE WHEN DV.TIPO_DOCTO = 'D' THEN DVD.PRECIO_TOTAL_NETO * -1 ELSE DVD.PRECIO_TOTAL_NETO END * 1.16 AS IMPORTE,
                   DV.FECHA AS FECHA, DVD.ARTICULO_ID, DV.ALMACEN_ID, COALESCE(AV.NOMBRE, '') AS ALMACEN_NOMBRE,
                   DV.DOCTO_VE_ID, 'VE' AS ORIGEN_SISTEMA, COALESCE(CL.NOMBRE, '') AS CLIENTE_NOMBRE
            FROM DOCTOS_VE DV
            JOIN DOCTOS_VE_DET DVD ON DVD.DOCTO_VE_ID = DV.DOCTO_VE_ID
            LEFT JOIN ALMACENES AV ON AV.ALMACEN_ID = DV.ALMACEN_ID
            LEFT JOIN CLIENTES CL ON CL.CLIENTE_ID = DV.CLIENTE_ID
            WHERE DV.FECHA BETWEEN ? AND ?
              AND DV.TIPO_DOCTO IN ('F', 'D') AND DV.ESTATUS <> 'C' AND DV.APLICADO = 'S'
              AND DVD.ARTICULO_ID IN ({placeholders_ids})
              {filtro_almacen_ve}

            UNION ALL

            SELECT DPV.FOLIO, DPVD.CLAVE_ARTICULO,
                   CASE WHEN DPV.TIPO_DOCTO = 'D' THEN (DPVD.UNIDADES - COALESCE(DPVD.UNIDADES_DEV, 0)) * -1
                        ELSE DPVD.UNIDADES - COALESCE(DPVD.UNIDADES_DEV, 0) END AS CANTIDAD,
                   CASE WHEN DPV.TIPO_DOCTO = 'D' THEN DPVD.PRECIO_TOTAL_NETO * -1 ELSE DPVD.PRECIO_TOTAL_NETO END * 1.16 AS IMPORTE,
                   DPV.FECHA AS FECHA, DPVD.ARTICULO_ID, DPV.ALMACEN_ID, COALESCE(APV.NOMBRE, '') AS ALMACEN_NOMBRE,
                   DPV.DOCTO_PV_ID, 'PV' AS ORIGEN_SISTEMA, COALESCE(CLPV.NOMBRE, 'PUBLICO GENERAL') AS CLIENTE_NOMBRE
            FROM DOCTOS_PV DPV
            JOIN DOCTOS_PV_DET DPVD ON DPVD.DOCTO_PV_ID = DPV.DOCTO_PV_ID
            LEFT JOIN ALMACENES APV ON APV.ALMACEN_ID = DPV.ALMACEN_ID
            LEFT JOIN CLIENTES CLPV ON CLPV.CLIENTE_ID = DPV.CLIENTE_ID
            WHERE DPV.FECHA BETWEEN ? AND ?
              AND DPV.TIPO_DOCTO IN ('V', 'D') AND DPV.ESTATUS <> 'C' AND DPV.APLICADO = 'S'
              AND DPVD.ARTICULO_ID IN ({placeholders_ids})
              {filtro_almacen_pv}

            ORDER BY 5 DESC, 1 DESC, 2
        """

        params = [fecha_inicio, fecha_final, *art_ids]
        if almacen_id:
            params.append(int(almacen_id))
        params.extend([fecha_inicio, fecha_final, *art_ids])
        if almacen_id:
            params.append(int(almacen_id))

        cur.execute(sql, tuple(params))
        rows = cur.fetchall()

        ventas = []
        for r in rows:
            ventas.append({
                "folio": str(r[0] or "").strip(),
                "clave": str(r[1] or "").strip().upper(),
                "cantidad": float(r[2] or 0),
                "importe": float(r[3] or 0),
                "fecha_venta": str(r[4] or "")[:10],
                "articulo_id": int(r[5] or 0),
                "almacen_venta_id": int(r[6] or 0),
                "almacen_venta_nombre": str(r[7] or "").strip(),
                "docto_id": int(r[8] or 0),
                "origen_sistema": str(r[9] or "VE"),
                "cliente_nombre": str(r[10] or "").strip()
            })
        return ventas
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


def obtener_recepciones_cascos(empresa_id="DEFAULT", estatus=None):
    """Devuelve el historial de recepciones con total de piezas y badges de estatus."""
    init_cascos_sqlite()
    conn = conectar_sqlite()
    cur = conn.cursor()

    where_clauses = ["H.empresa_id = ?"]
    params = [str(empresa_id or "DEFAULT")]

    if estatus == "pendientes":
        where_clauses.append("H.confirmado = 'N' AND H.cancelado = 'N'")
    elif estatus == "confirmadas":
        where_clauses.append("H.confirmado = 'S' AND H.cancelado = 'N'")
    elif estatus == "canceladas":
        where_clauses.append("H.cancelado = 'S'")

    where_sql = " AND ".join(where_clauses)

    sql = f"""
        SELECT H.id, H.folio_recepcion, H.folio_microsip, H.docto_in_id,
               H.almacen_origen_id, H.almacen_origen_nombre,
               H.almacen_destino_id, H.almacen_destino_nombre,
               H.fecha_venta_inicio, H.fecha_venta_final,
               H.fecha_hora_creacion, H.fecha_hora_recepcion,
               H.confirmado, H.cancelado, H.motivo_cancelacion,
               H.usuario_creador, H.usuario_recibe, H.tipo_bonificacion, H.nota_credito, H.es_pago,
               COALESCE(SUM(D.piezas), 0) AS total_piezas
        FROM cascos_recepciones H
        LEFT JOIN cascos_recepcion_det D ON D.recepcion_id = H.id
        WHERE {where_sql}
        GROUP BY H.id
        ORDER BY H.id DESC
    """
    cur.execute(sql, tuple(params))
    rows = cur.fetchall()

    recepciones = []
    for r in rows:
        recepciones.append({
            "recepcion_id": int(r[0]),
            "folio_recepcion": str(r[1] or f"REC-{r[0]:05d}"),
            "folio_microsip": str(r[2] or "").strip(),
            "docto_in_id": int(r[3] or 0),
            "almacen_origen_id": int(r[4]),
            "almacen_origen_nombre": str(r[5] or ""),
            "almacen_destino_id": int(r[6]),
            "almacen_destino_nombre": str(r[7] or ""),
            "fecha_venta_inicio": str(r[8] or ""),
            "fecha_venta_final": str(r[9] or ""),
            "fecha_hora_creacion": str(r[10] or ""),
            "fecha_hora_recepcion": str(r[11] or ""),
            "confirmado": str(r[12] or "N").upper(),
            "cancelado": str(r[13] or "N").upper(),
            "motivo_cancelacion": str(r[14] or ""),
            "usuario_creador": str(r[15] or ""),
            "usuario_recibe": str(r[16] or ""),
            "tipo_bonificacion": str(r[17] or ""),
            "nota_credito": str(r[18] or ""),
            "es_pago": str(r[19] or "N").upper(),
            "piezas": float(r[20] or 0)
        })
    conn.close()
    return recepciones


def preparar_recepcion_cascos(almacen_origen_id, fecha_inicio, fecha_final, usuario="ADMIN", empresa_id="DEFAULT"):
    """
    Prepara una nueva recepción de cascos consolidando ventas del periodo que no hayan
    sido traspasadas en recepciones previas.
    """
    init_cascos_sqlite()
    cfg = obtener_config_cascos(empresa_id)
    almacen_destino_id = cfg["almacen_id"]
    almacen_destino_nombre = cfg["almacen_nombre"]

    if int(almacen_origen_id) == int(almacen_destino_id):
        raise ValueError("El almacén de origen no puede ser el almacén de Usados.")

    # Obtener nombre oficial de origen desde Microsip
    almacen_origen_nombre = f"Almacén {almacen_origen_id}"
    conn_ms = None
    try:
        conn_ms = conectar_db()
        cur_ms = conn_ms.cursor()
        cur_ms.execute("SELECT FIRST 1 NOMBRE FROM ALMACENES WHERE ALMACEN_ID = ?", (int(almacen_origen_id),))
        row_alm = cur_ms.fetchone()
        if row_alm and row_alm[0]:
            almacen_origen_nombre = str(row_alm[0]).strip()
    finally:
        if conn_ms:
            conn_ms.close()

    # Verificar si existe una recepción pendiente previa para el mismo almacén y rango
    conn_sq = conectar_sqlite()
    cur_sq = conn_sq.cursor()
    cur_sq.execute("""
        SELECT id, folio_recepcion FROM cascos_recepciones
        WHERE empresa_id = ? AND almacen_origen_id = ?
          AND fecha_venta_inicio = ? AND fecha_venta_final = ?
          AND cancelado = 'N' AND confirmado = 'N'
    """, (str(empresa_id or "DEFAULT"), int(almacen_origen_id), str(fecha_inicio), str(fecha_final)))
    pend = cur_sq.fetchone()
    if pend:
        conn_sq.close()
        raise ValueError(f"Ya existe una recepción pendiente (#{pend[0]}) para esa sucursal y rango de fechas. Ábrela para verificar y confirmar.")

    # Consultar ventas positivas de B01..B07 en el periodo
    ventas = consultar_ventas_cascos_periodo(fecha_inicio, fecha_final, almacen_id=almacen_origen_id, empresa_id=empresa_id)
    ventas_pos = [v for v in ventas if v["cantidad"] > 0]
    if not ventas_pos:
        conn_sq.close()
        raise ValueError("No se encontraron piezas vendidas de B01 a B07 en ese almacén y rango de fechas.")

    # Agrupar por (folio, articulo_id, clave)
    agrupadas = {}
    for v in ventas_pos:
        key = (v["folio"], v["articulo_id"], v["clave"])
        if key not in agrupadas:
            agrupadas[key] = dict(v)
        else:
            agrupadas[key]["cantidad"] += v["cantidad"]
            agrupadas[key]["importe"] += v["importe"]

    # Descontar lo ya recibido en recepciones confirmadas previas
    cur_sq.execute("""
        SELECT D.folio_venta, D.articulo_id_vendido, SUM(D.piezas)
        FROM cascos_recepcion_det D
        JOIN cascos_recepciones H ON H.id = D.recepcion_id
        WHERE H.empresa_id = ? AND H.almacen_origen_id = ?
          AND H.confirmado = 'S' AND H.cancelado = 'N'
        GROUP BY D.folio_venta, D.articulo_id_vendido
    """, (str(empresa_id or "DEFAULT"), int(almacen_origen_id)))
    ya_recibidas = {(str(r[0]), int(r[1])): float(r[2]) for r in cur_sq.fetchall()}

    restantes = {}
    for key, v in agrupadas.items():
        vendidas = v["cantidad"]
        ya = ya_recibidas.get((key[0], key[1]), 0.0)
        faltante = vendidas - ya
        if faltante > 0:
            v_copy = dict(v)
            v_copy["cantidad"] = faltante
            if vendidas > 0:
                v_copy["importe"] = v["importe"] * (faltante / vendidas)
            restantes[key] = v_copy

    if not restantes:
        conn_sq.close()
        raise ValueError("Todas las piezas vendidas de ese periodo ya fueron recibidas en recepciones anteriores.")

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Insertar cabecera de recepción
    cur_sq.execute("""
        INSERT INTO cascos_recepciones (
            empresa_id, folio_recepcion, folio_microsip, docto_in_id,
            almacen_origen_id, almacen_origen_nombre,
            almacen_destino_id, almacen_destino_nombre,
            fecha_venta_inicio, fecha_venta_final,
            fecha_hora_creacion, confirmado, cancelado, usuario_creador
        ) VALUES (?, NULL, '', 0, ?, ?, ?, ?, ?, ?, ?, 'N', 'N', ?)
    """, (str(empresa_id or "DEFAULT"), int(almacen_origen_id), almacen_origen_nombre,
          int(almacen_destino_id), almacen_destino_nombre, str(fecha_inicio), str(fecha_final),
          now_str, str(usuario)))

    recepcion_id = cur_sq.lastrowid
    folio_generado = f"REC-{recepcion_id:05d}"
    cur_sq.execute("UPDATE cascos_recepciones SET folio_recepcion = ? WHERE id = ?", (folio_generado, recepcion_id))

    # Insertar renglones de detalle
    detalles = []
    for v in restantes.values():
        cur_sq.execute("""
            INSERT INTO cascos_recepcion_det (
                recepcion_id, folio_venta, fecha_venta,
                almacen_venta_id, almacen_venta_nombre,
                articulo_id_vendido, clave_vendida,
                articulo_id_verificado, clave_verificada,
                piezas, importe, docto_ve_id, es_pago
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'N')
        """, (recepcion_id, v["folio"], v["fecha_venta"],
              v["almacen_venta_id"], v["almacen_venta_nombre"],
              v["articulo_id"], v["clave"],
              v["articulo_id"], v["clave"],
              v["cantidad"], v["importe"], v.get("docto_id", 0)))
        det_id = cur_sq.lastrowid
        detalles.append({
            "recepcion_det_id": det_id,
            "folio_venta": v["folio"],
            "fecha_venta": v["fecha_venta"],
            "clave_vendida": v["clave"],
            "clave_verificada": v["clave"],
            "articulo_id_vendido": v["articulo_id"],
            "piezas": v["cantidad"],
            "importe": v["importe"]
        })

    conn_sq.commit()
    conn_sq.close()

    return {
        "ok": True,
        "recepcion_id": recepcion_id,
        "folio_recepcion": folio_generado,
        "confirmado": "N",
        "almacen_origen_id": int(almacen_origen_id),
        "almacen_origen_nombre": almacen_origen_nombre,
        "almacen_destino_id": int(almacen_destino_id),
        "almacen_destino_nombre": almacen_destino_nombre,
        "piezas": sum(d["piezas"] for d in detalles),
        "detalles": detalles
    }


def obtener_detalle_recepcion(recepcion_id):
    """Obtiene toda la información, renglones y distribución física de una recepción."""
    init_cascos_sqlite()
    conn_sq = conectar_sqlite()
    cur_sq = conn_sq.cursor()

    cur_sq.execute("""
        SELECT id, folio_recepcion, folio_microsip, docto_in_id,
               almacen_origen_id, almacen_origen_nombre,
               almacen_destino_id, almacen_destino_nombre,
               fecha_venta_inicio, fecha_venta_final,
               fecha_hora_creacion, fecha_hora_recepcion,
               confirmado, cancelado, motivo_cancelacion,
               usuario_creador, usuario_recibe, tipo_bonificacion, nota_credito, es_pago
        FROM cascos_recepciones WHERE id = ?
    """, (int(recepcion_id),))
    header = cur_sq.fetchone()
    if not header:
        conn_sq.close()
        raise ValueError("No se encontró la recepción solicitada.")

    cur_sq.execute("""
        SELECT id, folio_venta, fecha_venta,
               almacen_venta_id, almacen_venta_nombre,
               articulo_id_vendido, clave_vendida,
               articulo_id_verificado, clave_verificada,
               piezas, importe
        FROM cascos_recepcion_det WHERE recepcion_id = ?
        ORDER BY id
    """, (int(recepcion_id),))
    det_rows = cur_sq.fetchall()

    cur_sq.execute("""
        SELECT D.recepcion_det_id, D.clave_verificada, D.articulo_id_verificado, D.piezas
        FROM cascos_recepcion_distribucion D
        JOIN cascos_recepcion_det L ON L.id = D.recepcion_det_id
        WHERE L.recepcion_id = ?
        ORDER BY D.id
    """, (int(recepcion_id),))
    dist_rows = cur_sq.fetchall()

    dist_map = {}
    for r in dist_rows:
        det_id = int(r[0])
        dist_map.setdefault(det_id, []).append({
            "clave_verificada": str(r[1]).strip().upper(),
            "articulo_id_verificado": int(r[2]),
            "piezas": float(r[3])
        })

    detalles = []
    for r in det_rows:
        det_id = int(r[0])
        dist = dist_map.get(det_id, [{
            "clave_verificada": str(r[8]).strip().upper(),
            "articulo_id_verificado": int(r[7]),
            "piezas": float(r[9])
        }])
        detalles.append({
            "recepcion_det_id": det_id,
            "folio_venta": str(r[1] or "").strip(),
            "fecha_venta": str(r[2] or ""),
            "almacen_venta_id": int(r[3] or 0),
            "almacen_venta_nombre": str(r[4] or "").strip(),
            "articulo_id_vendido": int(r[5]),
            "clave_vendida": str(r[6] or "").strip().upper(),
            "articulo_id_verificado": int(r[7]),
            "clave_verificada": str(r[8] or "").strip().upper(),
            "piezas": float(r[9]),
            "importe": float(r[10]),
            "distribuciones": dist
        })

    conn_sq.close()

    return {
        "recepcion_id": int(header[0]),
        "folio_recepcion": str(header[1] or ""),
        "folio_microsip": str(header[2] or ""),
        "docto_in_id": int(header[3] or 0),
        "almacen_origen_id": int(header[4]),
        "almacen_origen_nombre": str(header[5] or ""),
        "almacen_destino_id": int(header[6]),
        "almacen_destino_nombre": str(header[7] or ""),
        "fecha_venta_inicio": str(header[8] or ""),
        "fecha_venta_final": str(header[9] or ""),
        "fecha_hora_creacion": str(header[10] or ""),
        "fecha_hora_recepcion": str(header[11] or ""),
        "confirmado": str(header[12] or "N").upper(),
        "cancelado": str(header[13] or "N").upper(),
        "motivo_cancelacion": str(header[14] or ""),
        "usuario_creador": str(header[15] or ""),
        "usuario_recibe": str(header[16] or ""),
        "tipo_bonificacion": str(header[17] or ""),
        "nota_credito": str(header[18] or ""),
        "es_pago": str(header[19] or "N").upper(),
        "total_piezas": sum(d["piezas"] for d in detalles),
        "detalles": detalles
    }


def confirmar_recepcion_cascos(recepcion_id, distribuciones_payload=None, nota_credito="", tipo_bonificacion="", usuario="ADMIN", empresa_id="DEFAULT"):
    """
    Confirma la recepción física de cascos:
    1. Guarda el desglose por tipo de casco físico recibido (B01..B07).
    2. Genera la entrada formal de inventario en Microsip con DOCTOS_IN / DOCTOS_IN_DET.
    3. Aplica la entrada para sumar la existencia en el Almacén de Usados.
    4. Actualiza el estatus de la recepción a CONFIRMADO='S'.
    """
    init_cascos_sqlite()
    detalle_info = obtener_detalle_recepcion(recepcion_id)

    if detalle_info["cancelado"] == "S":
        raise ValueError("Esta recepción se encuentra cancelada.")
    if detalle_info["confirmado"] == "S":
        raise ValueError(f"Esta recepción ya fue confirmada previamente (Folio Microsip: {detalle_info['folio_microsip']}).")

    almacen_destino_id = detalle_info["almacen_destino_id"]
    almacen_origen_nombre = detalle_info["almacen_origen_nombre"]
    folio_recepcion = detalle_info["folio_recepcion"]

    # Conectar a Microsip para resolver artículos y crear documento
    conn_ms = conectar_db()
    cur_ms = conn_ms.cursor()

    articulos_map = {a["clave"]: a["articulo_id"] for a in obtener_articulos_cascos_microsip(conn_ms)}

    # Consolidar partidas por clave B01..B07 recibida
    partidas_microsip = {}
    conn_sq = conectar_sqlite()
    cur_sq = conn_sq.cursor()

    try:
        # Borrar distribuciones previas si se reintenta
        cur_sq.execute("""
            DELETE FROM cascos_recepcion_distribucion
            WHERE recepcion_det_id IN (SELECT id FROM cascos_recepcion_det WHERE recepcion_id = ?)
        """, (int(recepcion_id),))

        if distribuciones_payload and isinstance(distribuciones_payload, list):
            for item in distribuciones_payload:
                det_id = int(item.get("recepcion_det_id", 0))
                asigs = item.get("distribuciones", [])
                for asig in asigs:
                    clave = str(asig.get("clave_verificada", "")).strip().upper()
                    piezas = float(asig.get("piezas", 0))
                    if clave in articulos_map and piezas > 0:
                        art_id = articulos_map[clave]
                        cur_sq.execute("""
                            INSERT INTO cascos_recepcion_distribucion (recepcion_det_id, clave_verificada, articulo_id_verificado, piezas)
                            VALUES (?, ?, ?, ?)
                        """, (det_id, clave, art_id, piezas))
                        partidas_microsip[clave] = partidas_microsip.get(clave, 0.0) + piezas
        else:
            # Distribución directa 1 a 1 de las líneas
            for d in detalle_info["detalles"]:
                det_id = d["recepcion_det_id"]
                clave = d["clave_verificada"]
                piezas = d["piezas"]
                if clave in articulos_map and piezas > 0:
                    art_id = articulos_map[clave]
                    cur_sq.execute("""
                        INSERT INTO cascos_recepcion_distribucion (recepcion_det_id, clave_verificada, articulo_id_verificado, piezas)
                        VALUES (?, ?, ?, ?)
                    """, (det_id, clave, art_id, piezas))
                    partidas_microsip[clave] = partidas_microsip.get(clave, 0.0) + piezas

        if not partidas_microsip or sum(partidas_microsip.values()) <= 0:
            raise ValueError("No hay piezas de cascos capturadas para generar la entrada de almacén.")

        # Resolver concepto de entrada en Microsip: preferir 376170 ('ENTRADA CASCOS USADOS') o 25 ('Traspaso (entrada)')
        concepto_in_id = 376170
        try:
            cur_ms.execute("SELECT FIRST 1 CONCEPTO_IN_ID FROM CONCEPTOS_IN WHERE CONCEPTO_IN_ID = 376170")
            if not cur_ms.fetchone():
                cur_ms.execute("SELECT FIRST 1 CONCEPTO_IN_ID FROM CONCEPTOS_IN WHERE UPPER(TRIM(NOMBRE)) LIKE '%CASCOS%' AND NATURALEZA = 'E'")
                c_row = cur_ms.fetchone()
                concepto_in_id = int(c_row[0]) if c_row else 25
        except Exception:
            concepto_in_id = 25

        # Sucursal matriz
        sucursal_id = 1236917
        try:
            cur_ms.execute("SELECT FIRST 1 SUCURSAL_ID FROM SUCURSALES WHERE ES_MATRIZ = TRUE")
            s_row = cur_ms.fetchone()
            if s_row:
                sucursal_id = int(s_row[0])
        except Exception:
            pass

        # Generar folio de entrada en Microsip
        folio_microsip = f"CAS{recepcion_id:06d}"
        try:
            cur_ms.execute("""
                SELECT FIRST 1 FOLIO_CONCEPTO_ID, COALESCE(SERIE, ''), COALESCE(CONSECUTIVO, 0)
                FROM FOLIOS_CONCEPTOS
                WHERE SISTEMA = 'IN' AND CONCEPTO_ID = ? AND SUCURSAL_ID = ?
            """, (concepto_in_id, sucursal_id))
            f_row = cur_ms.fetchone()
            if not f_row:
                cur_ms.execute("""
                    SELECT FIRST 1 FOLIO_CONCEPTO_ID, COALESCE(SERIE, ''), COALESCE(CONSECUTIVO, 0)
                    FROM FOLIOS_CONCEPTOS WHERE SISTEMA = 'IN' AND CONCEPTO_ID = ?
                """, (concepto_in_id,))
                f_row = cur_ms.fetchone()
            if f_row:
                fc_id = int(f_row[0])
                serie = str(f_row[1] or "").strip()
                cons = int(f_row[2] or 1)
                width = max(1, 9 - len(serie))
                folio_microsip = f"{serie}{str(cons).zfill(width)}"
                cur_ms.execute("UPDATE FOLIOS_CONCEPTOS SET CONSECUTIVO = ? WHERE FOLIO_CONCEPTO_ID = ?", (cons + 1, fc_id))
        except Exception as e_fol:
            print("Aviso al generar folio_microsip:", e_fol)

        docto_in_id = obtener_siguiente_id(cur_ms, "ID_DOCTOS", "DOCTOS_IN", "DOCTO_IN_ID")
        descripcion_docto = f"USADOS_REC:{recepcion_id} FOLIO={folio_recepcion} | Envia: {almacen_origen_nombre} | {nota_credito}".strip()[:255]
        usuario_db = str(usuario or "ADMIN").upper()[:31]

        # Insertar cabecera DOCTOS_IN
        cur_ms.execute("""
            INSERT INTO DOCTOS_IN (
                DOCTO_IN_ID, ALMACEN_ID, ALMACEN_DESTINO_ID, CONCEPTO_IN_ID, SUCURSAL_ID,
                FOLIO, NATURALEZA_CONCEPTO, FECHA, CANCELADO, APLICADO,
                DESCRIPCION, FORMA_EMITIDA, CONTABILIZADO, SISTEMA_ORIGEN,
                USUARIO_CREADOR, FECHA_HORA_CREACION, USUARIO_ULT_MODIF, FECHA_HORA_ULT_MODIF
            ) VALUES (
                ?, ?, NULL, ?, ?,
                ?, 'E', CURRENT_DATE, 'N', 'N',
                ?, 'N', 'N', 'IN',
                ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP
            )
        """, (docto_in_id, int(almacen_destino_id), concepto_in_id, sucursal_id,
              folio_microsip, descripcion_docto, usuario_db, usuario_db))

        # Insertar partidas DOCTOS_IN_DET
        for clave, pzas in partidas_microsip.items():
            art_id = articulos_map[clave]
            det_in_id = obtener_siguiente_id(cur_ms, "ID_DOCTOS", "DOCTOS_IN_DET", "DOCTO_IN_DET_ID")
            cur_ms.execute("""
                INSERT INTO DOCTOS_IN_DET (
                    DOCTO_IN_DET_ID, DOCTO_IN_ID, ALMACEN_ID, CONCEPTO_IN_ID,
                    CLAVE_ARTICULO, ARTICULO_ID, TIPO_MOVTO, UNIDADES,
                    COSTO_UNITARIO, COSTO_TOTAL, METODO_COSTEO, CANCELADO,
                    APLICADO, COSTEO_PEND, PEDIMENTO_PEND, ROL, FECHA
                ) VALUES (
                    ?, ?, ?, ?,
                    ?, ?, 'E', ?,
                    0, 0, 'C', 'N',
                    'N', 'N', 'N', 'E', CURRENT_DATE
                )
            """, (det_in_id, docto_in_id, int(almacen_destino_id), concepto_in_id,
                  clave, art_id, pzas))

        # Aplicar el documento para afectar existencias
        cur_ms.execute("UPDATE DOCTOS_IN SET APLICADO = 'S' WHERE DOCTO_IN_ID = ?", (docto_in_id,))
        conn_ms.commit()

        # Actualizar recepción en SQLite
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cur_sq.execute("""
            UPDATE cascos_recepciones
            SET confirmado = 'S',
                folio_microsip = ?,
                docto_in_id = ?,
                fecha_hora_recepcion = ?,
                usuario_recibe = ?,
                nota_credito = ?,
                tipo_bonificacion = ?
            WHERE id = ?
        """, (folio_microsip, docto_in_id, now_str, usuario_db, str(nota_credito), str(tipo_bonificacion), int(recepcion_id)))

        conn_sq.commit()

        return {
            "ok": True,
            "recepcion_id": int(recepcion_id),
            "folio_recepcion": folio_recepcion,
            "folio_microsip": folio_microsip,
            "docto_in_id": docto_in_id,
            "confirmado": "S",
            "total_piezas": sum(partidas_microsip.values()),
            "fecha_hora_recepcion": now_str
        }

    except Exception as e:
        if conn_ms:
            try:
                conn_ms.rollback()
            except Exception:
                pass
        raise e
    finally:
        if conn_ms:
            conn_ms.close()
        if conn_sq:
            conn_sq.close()


def cancelar_recepcion_cascos(recepcion_id, motivo, usuario="ADMIN", empresa_id="DEFAULT"):
    """Cancela una recepción pendiente o anula su documento si aún no fue procesado."""
    init_cascos_sqlite()
    conn_sq = conectar_sqlite()
    cur_sq = conn_sq.cursor()
    cur_sq.execute("SELECT confirmado, cancelado, docto_in_id FROM cascos_recepciones WHERE id = ?", (int(recepcion_id),))
    row = cur_sq.fetchone()
    if not row:
        conn_sq.close()
        raise ValueError("No se encontró la recepción.")
    if str(row[1] or "N").upper() == "S":
        conn_sq.close()
        raise ValueError("La recepción ya se encuentra cancelada.")

    confirmado = str(row[0] or "N").upper() == "S"
    docto_in_id = int(row[2] or 0)
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Si estaba confirmada con documento Microsip, intentar cancelar en Microsip
    if confirmado and docto_in_id > 0:
        conn_ms = None
        try:
            conn_ms = conectar_db()
            cur_ms = conn_ms.cursor()
            cur_ms.execute("""
                UPDATE DOCTOS_IN SET CANCELADO = 'S', USUARIO_CANCELACION = ?, FECHA_HORA_CANCELACION = CURRENT_TIMESTAMP
                WHERE DOCTO_IN_ID = ?
            """, (str(usuario).upper()[:31], docto_in_id))
            conn_ms.commit()
        except Exception as e_c:
            print("Aviso al cancelar documento en Microsip:", e_c)
        finally:
            if conn_ms:
                conn_ms.close()

    cur_sq.execute("""
        UPDATE cascos_recepciones
        SET cancelado = 'S', motivo_cancelacion = ?, usuario_cancelacion = ?, fecha_hora_cancelacion = ?
        WHERE id = ?
    """, (str(motivo), str(usuario), now_str, int(recepcion_id)))
    conn_sq.commit()
    conn_sq.close()

    return {"ok": True, "recepcion_id": int(recepcion_id), "cancelado": "S"}


def consultar_facturas_sin_usados(fecha_inicio, fecha_final, folio=None, cliente=None, vendedor_id=None, almacen_id=None, empresa_id="DEFAULT"):
    """
    Busca facturas (DOCTOS_VE) en sucursales autorizadas que vendieron baterías
    pero que NO incluyeron el casco usado (sin partidas B01..B07).
    """
    init_cascos_sqlite()
    cfg = obtener_config_cascos(empresa_id)
    autorizados = cfg.get("autorizados", [])

    conn_ms = None
    try:
        conn_ms = conectar_db()
        cur_ms = conn_ms.cursor()

        filtros = []
        params = [fecha_inicio, fecha_final]

        if folio and folio.strip():
            filtros.append("UPPER(TRIM(DV.FOLIO)) CONTAINING ?")
            params.append(folio.strip().upper())

        if cliente and cliente.strip():
            filtros.append("(UPPER(COALESCE(CL.NOMBRE, '')) CONTAINING ? OR UPPER(COALESCE(DV.CLAVE_CLIENTE, '')) CONTAINING ?)")
            params.extend([cliente.strip().upper(), cliente.strip().upper()])

        if vendedor_id and str(vendedor_id).isdigit() and int(vendedor_id) > 0:
            filtros.append("DV.VENDEDOR_ID = ?")
            params.append(int(vendedor_id))

        if almacen_id and str(almacen_id).isdigit() and int(almacen_id) > 0:
            filtros.append("DV.ALMACEN_ID = ?")
            params.append(int(almacen_id))
        elif autorizados:
            marks = ",".join(str(int(a)) for a in autorizados)
            filtros.append(f"DV.ALMACEN_ID IN ({marks})")

        filtro_sql = (" AND " + " AND ".join(filtros)) if filtros else ""

        # Facturas con baterías vendidas pero sin B01..B07
        sql = f"""
            SELECT FIRST 200
                   DV.DOCTO_VE_ID, DV.TIPO_DOCTO, DV.FOLIO, DV.FECHA, DV.ESTATUS,
                   DV.CLAVE_CLIENTE, COALESCE(CL.NOMBRE, '') AS CLIENTE_NOMBRE,
                   COALESCE(V.NOMBRE, '') AS VENDEDOR_NOMBRE,
                   COALESCE(AL.NOMBRE, '') AS ALMACEN_NOMBRE,
                   DV.IMPORTE_NETO, DV.TOTAL_IMPUESTOS, DV.ALMACEN_ID,
                   COALESCE((
                       SELECT SUM(DVD.UNIDADES)
                       FROM DOCTOS_VE_DET DVD
                       JOIN ARTICULOS A ON A.ARTICULO_ID = DVD.ARTICULO_ID
                       LEFT JOIN LINEAS_ARTICULOS LI ON LI.LINEA_ARTICULO_ID = A.LINEA_ARTICULO_ID
                       LEFT JOIN GRUPOS_LINEAS GL ON GL.GRUPO_LINEA_ID = LI.GRUPO_LINEA_ID
                       WHERE DVD.DOCTO_VE_ID = DV.DOCTO_VE_ID
                         AND {SQL_FILTRO_BATERIAS_REALES}
                   ), 0) AS PIEZAS_BATERIAS
            FROM DOCTOS_VE DV
            LEFT JOIN CLIENTES CL ON CL.CLIENTE_ID = DV.CLIENTE_ID
            LEFT JOIN VENDEDORES V ON V.VENDEDOR_ID = DV.VENDEDOR_ID
            LEFT JOIN ALMACENES AL ON AL.ALMACEN_ID = DV.ALMACEN_ID
            WHERE DV.FECHA BETWEEN ? AND ?
              AND DV.TIPO_DOCTO IN ('F', 'D')
              AND DV.ESTATUS <> 'C'
              AND DV.APLICADO = 'S'
              AND EXISTS (
                  SELECT 1 FROM DOCTOS_VE_DET DVD
                  JOIN ARTICULOS A ON A.ARTICULO_ID = DVD.ARTICULO_ID
                  LEFT JOIN LINEAS_ARTICULOS LI ON LI.LINEA_ARTICULO_ID = A.LINEA_ARTICULO_ID
                  LEFT JOIN GRUPOS_LINEAS GL ON GL.GRUPO_LINEA_ID = LI.GRUPO_LINEA_ID
                  WHERE DVD.DOCTO_VE_ID = DV.DOCTO_VE_ID
                    AND {SQL_FILTRO_BATERIAS_REALES}
              )
              AND NOT EXISTS (
                  SELECT 1 FROM DOCTOS_VE_DET X
                  WHERE X.DOCTO_VE_ID = DV.DOCTO_VE_ID
                    AND UPPER(TRIM(X.CLAVE_ARTICULO)) IN ('B01','B02','B03','B04','B05','B06','B07')
              )
              {filtro_sql}
            ORDER BY DV.FECHA DESC, DV.FOLIO DESC
        """

        cur_ms.execute(sql, tuple(params))
        rows = cur_ms.fetchall()

        docto_ids = [int(r[0]) for r in rows]
        piezas_pagadas_map = {}
        cerradas_set = set()

        if docto_ids:
            conn_sq = conectar_sqlite()
            cur_sq = conn_sq.cursor()
            marks_sq = ",".join("?" for _ in docto_ids)

            # Pagos de cascos registrados
            cur_sq.execute(f"""
                SELECT D.docto_ve_id, SUM(D.piezas)
                FROM cascos_recepcion_det D
                JOIN cascos_recepciones H ON H.id = D.recepcion_id
                WHERE H.cancelado = 'N' AND D.es_pago = 'S' AND D.docto_ve_id IN ({marks_sq})
                GROUP BY D.docto_ve_id
            """, tuple(docto_ids))
            for pr in cur_sq.fetchall():
                piezas_pagadas_map[int(pr[0])] = float(pr[1])

            # Facturas cerradas
            cur_sq.execute(f"""
                SELECT docto_ve_id FROM cascos_factura_pago
                WHERE cerrado = 'S' AND docto_ve_id IN ({marks_sq})
            """, tuple(docto_ids))
            for cr in cur_sq.fetchall():
                cerradas_set.add(int(cr[0]))

            conn_sq.close()

        data = []
        for r in rows:
            d_id = int(r[0])
            pzas_pag = piezas_pagadas_map.get(d_id, 0.0)
            cerrada = d_id in cerradas_set
            pzas_bat = float(r[12] or 0)
            pzas_pend = max(0.0, pzas_bat - pzas_pag)

            if cerrada:
                estatus_pago = "Liquidada / Cerrada"
            elif pzas_pag >= pzas_bat and pzas_bat > 0:
                estatus_pago = "Cascos Completados"
            elif pzas_pag > 0:
                estatus_pago = f"Pago parcial ({int(pzas_pag)}/{int(pzas_bat)} pzas)"
            else:
                estatus_pago = f"Casco Pendiente ({int(pzas_bat)} pza{'s' if pzas_bat > 1 else ''})"

            data.append({
                "docto_ve_id": d_id,
                "tipo_docto": str(r[1] or "").strip(),
                "folio": str(r[2] or "").strip(),
                "fecha": str(r[3] or "")[:10],
                "estatus": str(r[4] or "").strip(),
                "clave_cliente": str(r[5] or "").strip(),
                "cliente": str(r[6] or "").strip(),
                "vendedor": str(r[7] or "").strip(),
                "almacen": str(r[8] or "").strip(),
                "importe": float(r[9] or 0) + float(r[10] or 0),
                "almacen_id": int(r[11] or 0),
                "piezas_baterias": pzas_bat,
                "piezas_pagadas": pzas_pag,
                "cascos_pendientes": pzas_pend,
                "cerrado_pago": cerrada,
                "estatus_pago": estatus_pago
            })

        return data
    finally:
        if conn_ms:
            conn_ms.close()


def obtener_detalle_factura_sin_usados(docto_ve_id, empresa_id="DEFAULT"):
    """Devuelve los datos de la factura, los acumuladores comprados y el historial de cascos entregados."""
    conn_ms = None
    try:
        conn_ms = conectar_db()
        cur_ms = conn_ms.cursor()

        cur_ms.execute("""
            SELECT DV.DOCTO_VE_ID, DV.TIPO_DOCTO, DV.FOLIO, DV.FECHA, DV.ESTATUS,
                   DV.CLAVE_CLIENTE, COALESCE(CL.NOMBRE, ''),
                   COALESCE(V.NOMBRE, ''), COALESCE(AL.NOMBRE, ''),
                   DV.IMPORTE_NETO, DV.TOTAL_IMPUESTOS, COALESCE(DV.DESCRIPCION, ''),
                   DV.ALMACEN_ID
            FROM DOCTOS_VE DV
            LEFT JOIN CLIENTES CL ON CL.CLIENTE_ID = DV.CLIENTE_ID
            LEFT JOIN VENDEDORES V ON V.VENDEDOR_ID = DV.VENDEDOR_ID
            LEFT JOIN ALMACENES AL ON AL.ALMACEN_ID = DV.ALMACEN_ID
            WHERE DV.DOCTO_VE_ID = ?
        """, (int(docto_ve_id),))
        header = cur_ms.fetchone()
        if not header:
            raise ValueError("No se encontró la factura.")

        # Obtener partidas de la factura identificando cuáles son acumuladores reales
        cur_ms.execute(f"""
            SELECT DVD.DOCTO_VE_DET_ID, DVD.CLAVE_ARTICULO, A.NOMBRE, DVD.UNIDADES, DVD.PRECIO_TOTAL_NETO,
                   CASE WHEN (
                       {SQL_FILTRO_BATERIAS_REALES}
                   ) THEN 1 ELSE 0 END AS ES_ACUMULADOR
            FROM DOCTOS_VE_DET DVD
            JOIN ARTICULOS A ON A.ARTICULO_ID = DVD.ARTICULO_ID
            LEFT JOIN LINEAS_ARTICULOS LI ON LI.LINEA_ARTICULO_ID = A.LINEA_ARTICULO_ID
            LEFT JOIN GRUPOS_LINEAS GL ON GL.GRUPO_LINEA_ID = LI.GRUPO_LINEA_ID
            WHERE DVD.DOCTO_VE_ID = ?
            ORDER BY DVD.POSICION, DVD.DOCTO_VE_DET_ID
        """, (int(docto_ve_id),))
        partidas_rows = cur_ms.fetchall()
        partidas = []
        total_pzas_acumuladores = 0.0
        for pr in partidas_rows:
            es_acum = bool(pr[5] and int(pr[5]) == 1)
            u = float(pr[3] or 0)
            if es_acum:
                total_pzas_acumuladores += u
            partidas.append({
                "det_id": int(pr[0]),
                "clave": str(pr[1] or "").strip(),
                "nombre": str(pr[2] or "").strip(),
                "unidades": u,
                "importe": float(pr[4] or 0) * 1.16,
                "es_acumulador": es_acum
            })

        # Obtener historial de cascos entregados posteriormente
        conn_sq = conectar_sqlite()
        cur_sq = conn_sq.cursor()
        cur_sq.execute("""
            SELECT H.id, H.folio_recepcion, H.folio_microsip, H.fecha_hora_recepcion, H.usuario_recibe,
                   D.clave_verificada, D.piezas
            FROM cascos_recepcion_det D
            JOIN cascos_recepciones H ON H.id = D.recepcion_id
            WHERE H.cancelado = 'N' AND D.es_pago = 'S' AND D.docto_ve_id = ?
        """, (int(docto_ve_id),))
        entregas = []
        for er in cur_sq.fetchall():
            entregas.append({
                "recepcion_id": int(er[0]),
                "folio_recepcion": str(er[1] or ""),
                "folio_microsip": str(er[2] or ""),
                "fecha_hora": str(er[3] or ""),
                "usuario": str(er[4] or ""),
                "clave": str(er[5] or ""),
                "piezas": float(er[6] or 0)
            })

        # Verificar si está cerrada
        cur_sq.execute("""
            SELECT cerrado, usuario_cierre, fecha_hora_cierre, motivo_cierre
            FROM cascos_factura_pago WHERE docto_ve_id = ?
        """, (int(docto_ve_id),))
        cierre_row = cur_sq.fetchone()
        cerrado = bool(cierre_row and str(cierre_row[0] or "N").upper() == "S")
        conn_sq.close()

        total_pzas_pagadas = sum(e["piezas"] for e in entregas)

        return {
            "docto_ve_id": int(header[0]),
            "tipo_docto": str(header[1] or "").strip(),
            "folio": str(header[2] or "").strip(),
            "fecha": str(header[3] or "")[:10],
            "estatus": str(header[4] or "").strip(),
            "clave_cliente": str(header[5] or "").strip(),
            "cliente": str(header[6] or "").strip(),
            "vendedor": str(header[7] or "").strip(),
            "almacen": str(header[8] or "").strip(),
            "importe": float(header[9] or 0) + float(header[10] or 0),
            "descripcion": str(header[11] or "").strip(),
            "almacen_id": int(header[12] or 0),
            "partidas": partidas,
            "entregas": entregas,
            "piezas_acumuladores": total_pzas_acumuladores,
            "piezas_pagadas": total_pzas_pagadas,
            "cascos_pendientes": max(0.0, total_pzas_acumuladores - total_pzas_pagadas),
            "cerrado_pago": cerrado,
            "datos_cierre": {
                "usuario": str(cierre_row[1] or "") if cierre_row else "",
                "fecha": str(cierre_row[2] or "") if cierre_row else "",
                "motivo": str(cierre_row[3] or "") if cierre_row else ""
            } if cerrado else None
        }
    finally:
        if conn_ms:
            conn_ms.close()


def recibir_casco_factura_pendiente(docto_ve_id, lineas_cascos, usuario="ADMIN", empresa_id="DEFAULT"):
    """
    Registra la recepción posterior de cascos usados entregados por un cliente
    para saldar una factura de batería pendiente.
    Genera la entrada en Microsip al Almacén de Usados.
    """
    init_cascos_sqlite()
    factura = obtener_detalle_factura_sin_usados(docto_ve_id, empresa_id)
    if factura["cerrado_pago"]:
        raise ValueError("Esta factura ya fue liquidada/cerrada administrativamente.")
    if factura.get("piezas_acumuladores", 0) <= 0:
        raise ValueError("Esta factura no incluye venta de acumuladores (baterías). No aplica recepción de cascos.")

    cfg = obtener_config_cascos(empresa_id)
    almacen_destino_id = cfg["almacen_id"]
    almacen_destino_nombre = cfg["almacen_nombre"]

    conn_ms = conectar_db()
    cur_ms = conn_ms.cursor()
    articulos_map = {a["clave"]: a["articulo_id"] for a in obtener_articulos_cascos_microsip(conn_ms)}

    solicitudes = {}
    for item in lineas_cascos:
        clave = str(item.get("clave", "")).strip().upper()
        piezas = float(item.get("piezas", 0))
        if clave in articulos_map and piezas > 0:
            solicitudes[clave] = solicitudes.get(clave, 0.0) + piezas

    if not solicitudes:
        conn_ms.close()
        raise ValueError("Captura al menos una pieza con clave B01–B07 para recibir.")

    conn_sq = conectar_sqlite()
    cur_sq = conn_sq.cursor()

    try:
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Insertar recepción de tipo ES_PAGO='S' en SQLite
        cur_sq.execute("""
            INSERT INTO cascos_recepciones (
                empresa_id, folio_recepcion, folio_microsip, docto_in_id,
                almacen_origen_id, almacen_origen_nombre,
                almacen_destino_id, almacen_destino_nombre,
                fecha_venta_inicio, fecha_venta_final,
                fecha_hora_creacion, fecha_hora_recepcion,
                confirmado, cancelado, usuario_creador, usuario_recibe, es_pago
            ) VALUES (?, NULL, '', 0, ?, ?, ?, ?, ?, ?, ?, ?, 'S', 'N', ?, ?, 'S')
        """, (str(empresa_id or "DEFAULT"), factura["almacen_id"], factura["almacen"],
              int(almacen_destino_id), almacen_destino_nombre,
              factura["fecha"], factura["fecha"],
              now_str, now_str, str(usuario), str(usuario)))

        recepcion_id = cur_sq.lastrowid
        folio_rec = f"PAGO-{recepcion_id:05d}"
        cur_sq.execute("UPDATE cascos_recepciones SET folio_recepcion = ? WHERE id = ?", (folio_rec, recepcion_id))

        # Crear documento en Microsip
        concepto_in_id = 376170
        try:
            cur_ms.execute("SELECT FIRST 1 CONCEPTO_IN_ID FROM CONCEPTOS_IN WHERE CONCEPTO_IN_ID = 376170")
            if not cur_ms.fetchone():
                concepto_in_id = 25
        except Exception:
            concepto_in_id = 25

        sucursal_id = 1236917
        try:
            cur_ms.execute("SELECT FIRST 1 SUCURSAL_ID FROM SUCURSALES WHERE ES_MATRIZ = TRUE")
            s_row = cur_ms.fetchone()
            if s_row:
                sucursal_id = int(s_row[0])
        except Exception:
            pass

        folio_microsip = f"CAS{recepcion_id:06d}"
        try:
            cur_ms.execute("""
                SELECT FIRST 1 FOLIO_CONCEPTO_ID, COALESCE(SERIE, ''), COALESCE(CONSECUTIVO, 0)
                FROM FOLIOS_CONCEPTOS WHERE SISTEMA = 'IN' AND CONCEPTO_ID = ?
            """, (concepto_in_id,))
            f_row = cur_ms.fetchone()
            if f_row:
                fc_id = int(f_row[0])
                serie = str(f_row[1] or "").strip()
                cons = int(f_row[2] or 1)
                width = max(1, 9 - len(serie))
                folio_microsip = f"{serie}{str(cons).zfill(width)}"
                cur_ms.execute("UPDATE FOLIOS_CONCEPTOS SET CONSECUTIVO = ? WHERE FOLIO_CONCEPTO_ID = ?", (cons + 1, fc_id))
        except Exception:
            pass

        docto_in_id = obtener_siguiente_id(cur_ms, "ID_DOCTOS", "DOCTOS_IN", "DOCTO_IN_ID")
        descripcion_docto = f"USADOS_PAGO:{recepcion_id} Factura: {factura['folio']} | Cliente: {factura['cliente']}".strip()[:255]
        usuario_db = str(usuario or "ADMIN").upper()[:31]

        cur_ms.execute("""
            INSERT INTO DOCTOS_IN (
                DOCTO_IN_ID, ALMACEN_ID, ALMACEN_DESTINO_ID, CONCEPTO_IN_ID, SUCURSAL_ID,
                FOLIO, NATURALEZA_CONCEPTO, FECHA, CANCELADO, APLICADO,
                DESCRIPCION, FORMA_EMITIDA, CONTABILIZADO, SISTEMA_ORIGEN,
                USUARIO_CREADOR, FECHA_HORA_CREACION, USUARIO_ULT_MODIF, FECHA_HORA_ULT_MODIF
            ) VALUES (
                ?, ?, NULL, ?, ?,
                ?, 'E', CURRENT_DATE, 'N', 'N',
                ?, 'N', 'N', 'IN',
                ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP
            )
        """, (docto_in_id, int(almacen_destino_id), concepto_in_id, sucursal_id,
              folio_microsip, descripcion_docto, usuario_db, usuario_db))

        for clave, pzas in solicitudes.items():
            art_id = articulos_map[clave]
            det_in_id = obtener_siguiente_id(cur_ms, "ID_DOCTOS", "DOCTOS_IN_DET", "DOCTO_IN_DET_ID")
            cur_ms.execute("""
                INSERT INTO DOCTOS_IN_DET (
                    DOCTO_IN_DET_ID, DOCTO_IN_ID, ALMACEN_ID, CONCEPTO_IN_ID,
                    CLAVE_ARTICULO, ARTICULO_ID, TIPO_MOVTO, UNIDADES,
                    COSTO_UNITARIO, COSTO_TOTAL, METODO_COSTEO, CANCELADO,
                    APLICADO, COSTEO_PEND, PEDIMENTO_PEND, ROL, FECHA
                ) VALUES (
                    ?, ?, ?, ?,
                    ?, ?, 'E', ?,
                    0, 0, 'C', 'N',
                    'N', 'N', 'N', 'E', CURRENT_DATE
                )
            """, (det_in_id, docto_in_id, int(almacen_destino_id), concepto_in_id,
                  clave, art_id, pzas))

            cur_sq.execute("""
                INSERT INTO cascos_recepcion_det (
                    recepcion_id, folio_venta, fecha_venta,
                    almacen_venta_id, almacen_venta_nombre,
                    articulo_id_vendido, clave_vendida,
                    articulo_id_verificado, clave_verificada,
                    piezas, importe, docto_ve_id, es_pago
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'S')
            """, (recepcion_id, factura["folio"], factura["fecha"],
                  factura["almacen_id"], factura["almacen"],
                  art_id, clave, art_id, clave, pzas, int(docto_ve_id)))

        cur_ms.execute("UPDATE DOCTOS_IN SET APLICADO = 'S' WHERE DOCTO_IN_ID = ?", (docto_in_id,))
        conn_ms.commit()

        cur_sq.execute("UPDATE cascos_recepciones SET folio_microsip = ?, docto_in_id = ? WHERE id = ?", (folio_microsip, docto_in_id, recepcion_id))
        conn_sq.commit()

        return {
            "ok": True,
            "recepcion_id": recepcion_id,
            "folio_recepcion": folio_rec,
            "folio_microsip": folio_microsip,
            "docto_in_id": docto_in_id,
            "total_piezas": sum(solicitudes.values())
        }

    except Exception as e:
        if conn_ms:
            try:
                conn_ms.rollback()
            except Exception:
                pass
        raise e
    finally:
        if conn_ms:
            conn_ms.close()
        if conn_sq:
            conn_sq.close()


def cerrar_pago_factura_sin_usados(docto_ve_id, motivo="LIQUIDADO EN CAJA", usuario="ADMIN", empresa_id="DEFAULT"):
    """Cierra la obligación de entrega de casco para una factura (pago en efectivo/saldo cubierto)."""
    init_cascos_sqlite()
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    conn_sq = conectar_sqlite()
    cur_sq = conn_sq.cursor()
    cur_sq.execute("""
        INSERT INTO cascos_factura_pago (empresa_id, docto_ve_id, cerrado, usuario_cierre, fecha_hora_cierre, motivo_cierre)
        VALUES (?, ?, 'S', ?, ?, ?)
        ON CONFLICT(empresa_id, docto_ve_id) DO UPDATE SET
            cerrado = 'S',
            usuario_cierre = excluded.usuario_cierre,
            fecha_hora_cierre = excluded.fecha_hora_cierre,
            motivo_cierre = excluded.motivo_cierre
    """, (str(empresa_id or "DEFAULT"), int(docto_ve_id), str(usuario), now_str, str(motivo)))
    conn_sq.commit()
    conn_sq.close()
    return {"ok": True, "docto_ve_id": int(docto_ve_id), "cerrado": "S"}

