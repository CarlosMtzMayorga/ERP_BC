import datetime
from app.services.pos_printer import desglosar_folio, folio_para_microsip_db

MAPA_SERIES_CEDIS = {
    99934: "TBR",      # Sucursal Bravo
    158254: "TRE",     # Sucursal Revolución
    166719: "TSA",     # Sucursal Saulo
    202797: "TTA",     # Sucursal Tajito
    412880: "TDI",     # Sucursal Division
    1147933: "CAA",    # Sucursal Artes Gráficas
    1254317: "TNA",    # Sucursal Nazas
    1423447: "TAE",    # Sucursal Aeropuerto
    1473736: "TFC",    # Sucursal Fco. I. Madero
    1800730: "TGO",    # Sucursal Gomez Hidalgo
    1820837: "TMA",    # Sucursal Matamoros
}

def obtener_prefijo_cedis(destino_id, destino_nombre=""):
    try:
        did = int(destino_id)
        if did in MAPA_SERIES_CEDIS:
            return MAPA_SERIES_CEDIS[did]
    except Exception:
        pass
    
    dn = str(destino_nombre or '').upper()
    if "BRAVO" in dn: return "TBR"
    if "REVOLUCION" in dn or "REVOLUCIÓN" in dn: return "TRE"
    if "SAULO" in dn: return "TSA"
    if "TAJITO" in dn: return "TTA"
    if "DIVISION" in dn or "DIVISIÓN" in dn: return "TDI"
    if "ARTES" in dn or "GRAFICAS" in dn or "GRÁFICAS" in dn: return "CAA"
    if "NAZAS" in dn: return "TNA"
    if "AEROPUERTO" in dn: return "TAE"
    if "MADERO" in dn or "FCO" in dn: return "TFC"
    if "GOMEZ" in dn or "GÓMEZ" in dn or "HIDALGO" in dn: return "TGO"
    if "MATAMOROS" in dn: return "TMA"
    return None

def calcular_siguiente_folio_traspaso(cur, origen_id, destino_id, destino_nombre=""):
    """
    Calcula el siguiente folio garantizando que no esté duplicado en DOCTOS_IN.
    Si el origen es CEDIS (620110), aplica la serie correspondiente de la sucursal (ej. TRE, TFC, TNA, TBR, TSA, etc.).
    Si el origen es una sucursal, utiliza la numeración correlativa general de traspasos entre sucursales.
    """
    origen_id_int = int(origen_id) if (origen_id and str(origen_id).isdigit()) else 620110
    destino_id_int = int(destino_id) if (destino_id and str(destino_id).isdigit()) else None
    
    es_origen_cedis = (origen_id_int == 620110)
    prefijo = obtener_prefijo_cedis(destino_id_int, destino_nombre) if es_origen_cedis else None
    
    ultimo_folio = None
    
    # Caso 1: Origen CEDIS hacia sucursal con prefijo (ej. TRE, TFC, TNA, TBR, TSA, etc.)
    if es_origen_cedis and prefijo:
        cur.execute("""
            SELECT FIRST 1 TRIM(FOLIO) 
            FROM DOCTOS_IN 
            WHERE CONCEPTO_IN_ID = 36 AND UPPER(TRIM(FOLIO)) LIKE ? 
            ORDER BY DOCTO_IN_ID DESC
        """, (f"{prefijo}%",))
        r = cur.fetchone()
        ultimo_folio = str(r[0]).strip().upper() if (r and r[0]) else None
        
        if ultimo_folio:
            letras, num_val, _ = desglosar_folio(ultimo_folio)
            siguiente_num = num_val + 1
        else:
            letras = prefijo
            siguiente_num = 1
            
        while True:
            cand = folio_para_microsip_db(f"{letras}{siguiente_num}")
            cur.execute("SELECT FIRST 1 DOCTO_IN_ID FROM DOCTOS_IN WHERE CONCEPTO_IN_ID = 36 AND TRIM(FOLIO) = ?", (cand,))
            if not cur.fetchone():
                return cand, ultimo_folio
            siguiente_num += 1

    # Caso 2: Origen CEDIS hacia otro almacén sin prefijo fijo registrado
    elif es_origen_cedis:
        if destino_id_int:
            cur.execute("""
                SELECT FIRST 1 TRIM(FOLIO) 
                FROM DOCTOS_IN 
                WHERE ALMACEN_ID = 620110 AND ALMACEN_DESTINO_ID = ? AND CONCEPTO_IN_ID = 36 AND FOLIO IS NOT NULL
                ORDER BY DOCTO_IN_ID DESC
            """, (destino_id_int,))
            r = cur.fetchone()
            ultimo_folio = str(r[0]).strip().upper() if (r and r[0]) else None
            
        if ultimo_folio:
            letras, num_val, num_str = desglosar_folio(ultimo_folio)
            if num_str:
                siguiente_num = num_val + 1
                while True:
                    cand = folio_para_microsip_db(f"{letras}{siguiente_num}" if letras else f"{siguiente_num}")
                    cur.execute("SELECT FIRST 1 DOCTO_IN_ID FROM DOCTOS_IN WHERE CONCEPTO_IN_ID = 36 AND TRIM(FOLIO) = ?", (cand,))
                    if not cur.fetchone():
                        return cand, ultimo_folio
                    siguiente_num += 1

    # Caso 3: Origen Sucursal o destinos generales -> Folios numéricos consecutivos
    cur.execute("""
        SELECT MAX(CAST(FOLIO AS INTEGER)) 
        FROM DOCTOS_IN 
        WHERE CONCEPTO_IN_ID = 36 AND FOLIO SIMILAR TO '[0-9]+'
    """)
    r = cur.fetchone()
    max_num = r[0] if (r and r[0]) else 307900
    ultimo_folio = f"{max_num:09d}"
    siguiente_num = max_num + 1
    
    while True:
        cand = f"{siguiente_num:09d}"
        cur.execute("SELECT FIRST 1 DOCTO_IN_ID FROM DOCTOS_IN WHERE CONCEPTO_IN_ID = 36 AND TRIM(FOLIO) = ?", (cand,))
        if not cur.fetchone():
            return cand, ultimo_folio
        siguiente_num += 1

def obtener_localizaciones_articulos(cur, articulos_ids, almacen_origen_id=620110):
    if not articulos_ids:
        return {}
    
    unique_ids = list(set(int(x) for x in articulos_ids if x))
    if not unique_ids:
        return {}

    placeholders = ','.join('?' * len(unique_ids))
    loc_map = {}

    try:
        cur.execute(f"""
            SELECT ARTICULO_ID, TRIM(LOCALIZACION)
            FROM NIVELES_ARTICULOS
            WHERE ALMACEN_ID = ? AND ARTICULO_ID IN ({placeholders})
              AND LOCALIZACION IS NOT NULL AND TRIM(LOCALIZACION) <> ''
        """, (int(almacen_origen_id), *unique_ids))
        for aid, loc in cur.fetchall():
            if aid and loc and str(loc).strip():
                loc_map[int(aid)] = str(loc).strip()
    except Exception as e:
        print("Aviso al consultar localizaciones almacén origen:", e)

    faltantes = [aid for aid in unique_ids if aid not in loc_map]
    if faltantes and int(almacen_origen_id) != 620110:
        ph_fal = ','.join('?' * len(faltantes))
        try:
            cur.execute(f"""
                SELECT ARTICULO_ID, TRIM(LOCALIZACION)
                FROM NIVELES_ARTICULOS
                WHERE ALMACEN_ID = 620110 AND ARTICULO_ID IN ({ph_fal})
                  AND LOCALIZACION IS NOT NULL AND TRIM(LOCALIZACION) <> ''
            """, tuple(faltantes))
            for aid, loc in cur.fetchall():
                if aid and loc and str(loc).strip():
                    loc_map[int(aid)] = str(loc).strip()
        except Exception as e:
            print("Aviso al consultar localizaciones CEDIS:", e)

    faltantes2 = [aid for aid in unique_ids if aid not in loc_map]
    if faltantes2:
        ph_fal2 = ','.join('?' * len(faltantes2))
        try:
            cur.execute(f"""
                SELECT ARTICULO_ID, TRIM(LOCALIZACION)
                FROM NIVELES_ARTICULOS
                WHERE ARTICULO_ID IN ({ph_fal2})
                  AND LOCALIZACION IS NOT NULL AND TRIM(LOCALIZACION) <> ''
                ORDER BY ALMACEN_ID
            """, tuple(faltantes2))
            for aid, loc in cur.fetchall():
                if aid and loc and str(loc).strip() and int(aid) not in loc_map:
                    loc_map[int(aid)] = str(loc).strip()
        except Exception as e:
            print("Aviso al consultar localizaciones cualquier almacén:", e)

    return loc_map

ESTATUS_TRASPASOS_MAP = {
    0: {"nombre": "PENDIENTE", "color": "slate", "badge": "bg-slate-100 text-slate-700 border-slate-300", "desc": "Sin surtir / Traspaso directo"},
    2: {"nombre": "EN PROCESO", "color": "amber", "badge": "bg-amber-100 text-amber-800 border-amber-300", "desc": "En picking / surtido CEDIS"},
    6: {"nombre": "TRANSITO ESPECIAL", "color": "purple", "badge": "bg-purple-100 text-purple-800 border-purple-300", "desc": "En transito almacen especial"},
    8: {"nombre": "EN TRANSITO", "color": "blue", "badge": "bg-blue-100 text-blue-800 border-blue-300", "desc": "Surtido / En transito a destino"},
    12: {"nombre": "RETORNO CEDIS", "color": "orange", "badge": "bg-orange-100 text-orange-800 border-orange-300", "desc": "Devolucion / Retorno a CEDIS"},
    14: {"nombre": "ENTREGADO", "color": "emerald", "badge": "bg-emerald-100 text-emerald-800 border-emerald-300", "desc": "Entregado y recibido en destino"}
}

def formatear_estatus_traspaso(st_val, ent_val=0, cond_val=0, tipo_val='N'):
    s = int(st_val) if st_val is not None else 8
    ent = int(ent_val or 0)
    cond = int(cond_val or 0)
    tipo = str(tipo_val or 'N').strip().upper()
    info = ESTATUS_TRASPASOS_MAP.get(s, {"nombre": f"ESTATUS {s}", "color": "slate", "badge": "bg-slate-100 text-slate-700 border-slate-300", "desc": f"Código {s}"})
    return {
        "status": s,
        "status_nombre": info["nombre"],
        "status_color": info["color"],
        "status_badge": info["badge"],
        "status_desc": info["desc"],
        "entregado": ent,
        "entregado_label": "ENTREGADO" if ent == 1 else "NO ENTREGADO",
        "condicion": cond,
        "tipo": tipo
    }
