from flask import Blueprint, request, jsonify
from app.db import conectar_db, resolver_listas_precios, obtener_siguiente_id
from app.services.compras_service import analizar_clave_ciosa

ciosa_bp = Blueprint('ciosa_bp', __name__)

# ================= RUTAS ESPECIALES CIOSA: CLAVES SIMILARES Y PRECIOS =================

@ciosa_bp.route('/api/ciosa/analizar-similares', methods=['POST'])
def ciosa_analizar_similares():
    data = request.get_json() or {}
    items = data.get('items', [])
    if not items:
        return jsonify({"success": True, "coincidencias": []})

    conn = None
    try:
        conn = conectar_db()
        cur = conn.cursor()
        listas_map = resolver_listas_precios(conn)
        id_a_lista = {v: k for k, v in listas_map.items()}

        coincidencias = []

        for item in items:
            cod_xml = str(item.get('codigo', '')).strip().upper()
            if not cod_xml:
                continue

            base, sufijo = analizar_clave_ciosa(cod_xml)
            max_len = len(base) + 2

            cur.execute("""
                SELECT ca.CLAVE_ARTICULO, a.NOMBRE, a.ARTICULO_ID, l.NOMBRE
                FROM CLAVES_ARTICULOS ca
                JOIN ARTICULOS a ON a.ARTICULO_ID = ca.ARTICULO_ID
                LEFT JOIN LINEAS_ARTICULOS l ON l.LINEA_ARTICULO_ID = a.LINEA_ARTICULO_ID
                WHERE ca.CLAVE_ARTICULO = ? OR ca.CLAVE_ARTICULO = ? OR ca.CLAVE_ARTICULO LIKE ?
            """, (cod_xml, base, f"{base}%"))

            rows = cur.fetchall()
            if not rows:
                continue

            similares = []
            vistos = set()

            for r in rows:
                cl_bd = str(r[0]).strip().upper()
                art_id = int(r[2])
                if art_id in vistos:
                    continue
                if len(cl_bd) > max_len:
                    continue
                vistos.add(art_id)

                # Consultar tasa de impuesto del artículo
                tax_pct = 16.0
                try:
                    cur.execute("""
                        SELECT FIRST 1 COALESCE(i.PCTJE_IMPUESTO, 16.0)
                        FROM IMPUESTOS_ARTICULOS ia
                        JOIN IMPUESTOS i ON i.IMPUESTO_ID = ia.IMPUESTO_ID
                        WHERE ia.ARTICULO_ID = ?
                    """, (art_id,))
                    r_t = cur.fetchone()
                    if r_t and r_t[0] is not None:
                        tax_pct = float(r_t[0])
                except:
                    tax_pct = 16.0
                factor_iva = 1.0 + (tax_pct / 100.0)

                # Consultar precios en BD (calculados con IVA para comparativa justa)
                cur.execute("SELECT PRECIO_EMPRESA_ID, PRECIO FROM PRECIOS_ARTICULOS WHERE ARTICULO_ID = ?", (art_id,))
                p_dict = {"publico": 0.0, "talleres": 0.0, "mayoreo": 0.0, "minimo": 0.0}
                for pid, pval in cur.fetchall():
                    if pid in id_a_lista:
                        p_dict[id_a_lista[pid]] = round(float(pval) * factor_iva, 4) if pval else 0.0

                p_xml = {
                    "publico": round(float(item.get('precioPublico', 0)), 2),
                    "talleres": round(float(item.get('precioTalleres', 0)), 2),
                    "mayoreo": round(float(item.get('precioMayoreo', 0)), 2),
                    "minimo": round(float(item.get('precioMinimo', 0)), 2),
                }

                dif = {k: round(p_xml[k] - p_dict[k], 2) for k in p_dict}
                subio_precio = any(dif[k] > 0.05 for k in dif)
                difiere_precio = any(abs(dif[k]) > 0.05 for k in dif)

                similares.append({
                    "articulo_id": art_id,
                    "clave": cl_bd,
                    "nombre": str(r[1]).strip() if r[1] else "",
                    "linea": str(r[3]).strip() if r[3] else "",
                    "es_misma_clave": (cl_bd == cod_xml),
                    "precios_bd": p_dict,
                    "precios_xml": p_xml,
                    "diferencias": dif,
                    "subio_precio": subio_precio,
                    "difiere_precio": difiere_precio
                })

            if similares:
                # Priorizar candidatos con clave diferente o que requieran actualización
                similares.sort(key=lambda s: (s["es_misma_clave"], not s["subio_precio"]))
                coincidencias.append({
                    "item_xml": item,
                    "base_detectada": base,
                    "sufijo_detectado": sufijo,
                    "similares": similares
                })

        cur.close()
        conn.close()
        return jsonify({
            "success": True,
            "total_analizados": len(items),
            "total_con_similares": len(coincidencias),
            "coincidencias": coincidencias
        })
    except Exception as e:
        if conn:
            conn.close()
        return jsonify({"success": False, "error": str(e)}), 500

@ciosa_bp.route('/api/ciosa/actualizar-precios-similares', methods=['POST'])
def ciosa_actualizar_precios_similares():
    data = request.get_json() or {}
    articulos = data.get('articulos', [])
    if not articulos:
        return jsonify({"success": False, "error": "No se recibieron artículos para actualizar."}), 400

    conn = None
    actualizados = 0
    insertados = 0

    try:
        conn = conectar_db()
        listas_map = resolver_listas_precios(conn)
        cur = conn.cursor()

        for art in articulos:
            art_id = int(art.get('articulo_id', 0))
            if not art_id:
                clave = str(art.get('clave', '')).strip().upper()
                if clave:
                    cur.execute("SELECT FIRST 1 ARTICULO_ID FROM CLAVES_ARTICULOS WHERE TRIM(CLAVE_ARTICULO) = ?", (clave,))
                    r_id = cur.fetchone()
                    if r_id and r_id[0]:
                        art_id = int(r_id[0])

            if not art_id:
                continue

            # Obtener tasa de impuesto
            tax_pct = 16.0
            try:
                cur.execute("""
                    SELECT FIRST 1 COALESCE(i.PCTJE_IMPUESTO, 16.0)
                    FROM IMPUESTOS_ARTICULOS ia
                    JOIN IMPUESTOS i ON i.IMPUESTO_ID = ia.IMPUESTO_ID
                    WHERE ia.ARTICULO_ID = ?
                """, (art_id,))
                r_t = cur.fetchone()
                if r_t and r_t[0] is not None:
                    tax_pct = float(r_t[0])
            except:
                tax_pct = 16.0
            factor_iva = 1.0 + (tax_pct / 100.0)

            precios = art.get('precios', {})
            precios_map = {
                listas_map["publico"]: round(float(precios.get('publico', 0)), 2),
                listas_map["talleres"]: round(float(precios.get('talleres', 0)), 2),
                listas_map["mayoreo"]: round(float(precios.get('mayoreo', 0)), 2),
                listas_map["minimo"]: round(float(precios.get('minimo', 0)), 2)
            }

            for lista_id, p_val in precios_map.items():
                if p_val <= 0:
                    continue
                cur.execute(
                    "SELECT FIRST 1 PRECIO_ARTICULO_ID, PRECIO FROM PRECIOS_ARTICULOS WHERE ARTICULO_ID = ? AND PRECIO_EMPRESA_ID = ?",
                    (art_id, lista_id)
                )
                p_row = cur.fetchone()
                p_neto_guardar = round(p_val / factor_iva, 2)
                if p_row and p_row[0]:
                    precio_art_id = int(p_row[0])
                    cur.execute("""
                        UPDATE PRECIOS_ARTICULOS
                        SET PRECIO = ?, FECHA_HORA_ULT_MODIF = CURRENT_TIMESTAMP
                        WHERE PRECIO_ARTICULO_ID = ?
                    """, (p_neto_guardar, precio_art_id))
                    actualizados += 1
                else:
                    nuevo_id = obtener_siguiente_id(cur, "GEN_PRECIOS_ARTICULOS", "PRECIOS_ARTICULOS", "PRECIO_ARTICULO_ID")
                    cur.execute("""
                        INSERT INTO PRECIOS_ARTICULOS
                        (PRECIO_ARTICULO_ID, ARTICULO_ID, PRECIO_EMPRESA_ID, PRECIO, MONEDA_ID, MARGEN, MARKUP, FECHA_HORA_ULT_MODIF)
                        VALUES (?, ?, ?, ?, 1, 0, 0, CURRENT_TIMESTAMP)
                    """, (nuevo_id, art_id, lista_id, p_neto_guardar))
                    insertados += 1

        conn.commit()
        cur.close()
        conn.close()
        return jsonify({
            "success": True,
            "actualizados": actualizados,
            "insertados": insertados,
            "mensaje": f"Se actualizaron {actualizados} precios y se insertaron {insertados} precios en Microsip."
        })
    except Exception as e:
        if conn:
            try:
                conn.rollback()
            except:
                pass
            conn.close()
        return jsonify({"success": False, "error": str(e)}), 500
