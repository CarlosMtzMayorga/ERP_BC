import datetime
import math
from collections import defaultdict
from app.db import conectar_db

# Grupos maestros
GRUPOS_EXCLUIDOS = {521794, 1373505, 197314, 2050267} # ACUMULADORES USADOS, ARTICULOS DE PUBLICIDAD, CARGOS, INSUMOS
GRUPOS_SIN_FILTRAR = {
    527174, 2144867, 99851, 2144878, 240807, 521794, 221477, 2144872, 521797, 
    99850, 2144868, 158630, 2144855, 158616, 521786, 521793, 620943, 521787, 
    521791, 2144880, 221670, 1045818, 2144909, 221728
}

def test_engine():
    alm_id = 99934 # Bravo
    cedis_id = 620110
    clasif_col = "C_BRAVO_S"
    clasif_cedis_col = "C_CEDIS_S"
    
    # Parámetros exactos de la consulta de hoy 05/10/2026:
    fecha_fin = "2026-10-05"
    fecha_ini = "2026-04-05"
    fecha_dias_antes = "2026-10-01" # 4 días antes
    meses_ant = 6
    dias_inv = 15
    selected_clasifs = {'A', 'B', 'C'}
    
    conn = conectar_db()
    cur = conn.cursor()
    
    # 1. Ventas PV
    cur.execute("""
        SELECT 
            d.ARTICULO_ID,
            SUM(d.UNIDADES - COALESCE(d.UNIDADES_DEV, 0)) AS VENTA_PIEZAS,
            COUNT(DISTINCT p.DOCTO_PV_ID) AS EVENTOS,
            SUM(CASE WHEN p.FECHA >= ? THEN (d.UNIDADES - COALESCE(d.UNIDADES_DEV, 0)) ELSE 0 END) AS VENTA_DIAS_ANTES
        FROM DOCTOS_PV p
        JOIN DOCTOS_PV_DET d ON d.DOCTO_PV_ID = p.DOCTO_PV_ID
        WHERE p.ALMACEN_ID = ?
          AND p.FECHA >= ? AND p.FECHA <= ?
          AND p.ESTATUS <> 'C'
          AND p.TIPO_DOCTO IN ('V', 'F')
        GROUP BY d.ARTICULO_ID
        HAVING SUM(d.UNIDADES - COALESCE(d.UNIDADES_DEV, 0)) > 0
    """, (fecha_dias_antes, alm_id, fecha_ini, fecha_fin))
    
    sales_map = {}
    for r in cur.fetchall():
        aid = int(r[0])
        sales_map[aid] = {
            'venta_piezas': float(r[1] or 0),
            'eventos': int(r[2] or 0),
            'venta_dias_antes': float(r[3] or 0)
        }
        
    # 2. Ventas VE
    try:
        cur.execute("""
            SELECT 
                d.ARTICULO_ID,
                SUM(CASE WHEN v.TIPO_DOCTO = 'D' THEN -d.UNIDADES ELSE d.UNIDADES END) AS VENTA_PIEZAS,
                COUNT(DISTINCT v.DOCTO_VE_ID) AS EVENTOS,
                SUM(CASE WHEN v.FECHA >= ? THEN (CASE WHEN v.TIPO_DOCTO = 'D' THEN -d.UNIDADES ELSE d.UNIDADES END) ELSE 0 END) AS VENTA_DIAS_ANTES
            FROM DOCTOS_VE v
            JOIN DOCTOS_VE_DET d ON d.DOCTO_VE_ID = v.DOCTO_VE_ID
            WHERE v.ALMACEN_ID = ?
              AND v.FECHA >= ? AND v.FECHA <= ?
              AND v.ESTATUS <> 'C'
              AND v.TIPO_DOCTO IN ('F', 'R', 'D')
            GROUP BY d.ARTICULO_ID
            HAVING SUM(CASE WHEN v.TIPO_DOCTO = 'D' THEN -d.UNIDADES ELSE d.UNIDADES END) > 0
        """, (fecha_dias_antes, alm_id, fecha_ini, fecha_fin))
        for r in cur.fetchall():
            aid = int(r[0])
            vta = float(r[1] or 0)
            ev = int(r[2] or 0)
            vta_rec = float(r[3] or 0)
            if aid in sales_map:
                sales_map[aid]['venta_piezas'] += vta
                sales_map[aid]['eventos'] += ev
                sales_map[aid]['venta_dias_antes'] += vta_rec
            else:
                sales_map[aid] = {'venta_piezas': vta, 'eventos': ev, 'venta_dias_antes': vta_rec}
    except Exception as e:
        print("Error VE:", e)
        
    print(f"Total articulos con ventas: {len(sales_map)}")
    
    # 3. Clasificacion Pareto
    total_piezas = sum(s['venta_piezas'] for s in sales_map.values())
    articulos_ordenados = sorted(sales_map.items(), key=lambda x: x[1]['venta_piezas'], reverse=True)
    acum = 0.0
    for aid, s in articulos_ordenados:
        acum += s['venta_piezas']
        pct = acum / total_piezas if total_piezas > 0 else 0.0
        if pct <= 0.50:
            c = 'A'
        elif pct <= 0.80:
            c = 'B'
        elif pct <= 0.95:
            c = 'C'
        else:
            c = 'D' if s['eventos'] >= 2 else 'E'
        s['clasif_calc'] = c

    # 4. Universo de artículos
    ids_a_evaluar = set(sales_map.keys())
    
    # Traer también artículos clasificados históricamente en A, B, C
    cur.execute(f"SELECT ARTICULO_ID FROM LIBRES_ARTICULOS WHERE {clasif_col} IN ('A', 'B', 'C')")
    for r in cur.fetchall():
        if r[0]: ids_a_evaluar.add(int(r[0]))
        
    print(f"Total articulos universo a evaluar: {len(ids_a_evaluar)}")
    
    # 5. Cargar datos maestros de artículos
    ids_lista = list(ids_a_evaluar)
    articulos_dict = {}
    CHUNK_SIZE = 1000
    for i in range(0, len(ids_lista), CHUNK_SIZE):
        chunk = ids_lista[i:i + CHUNK_SIZE]
        ph = ','.join('?' * len(chunk))
        cur.execute(f"""
            SELECT 
                a.ARTICULO_ID,
                TRIM(ca.CLAVE_ARTICULO),
                TRIM(a.NOMBRE),
                la_art.GRUPO_LINEA_ID,
                COALESCE(la.MULTIPLO, 1),
                COALESCE(TRIM(la.ARTPAR), 'N'),
                COALESCE(TRIM(la.IZQDER), 'N'),
                COALESCE(TRIM(la.{clasif_col}), 'N'),
                COALESCE(TRIM(la.{clasif_cedis_col}), 'N'),
                COALESCE(TRIM(la.EQUIVALENCIA1), '')
            FROM ARTICULOS a
            JOIN CLAVES_ARTICULOS ca ON ca.ARTICULO_ID = a.ARTICULO_ID
            JOIN ROLES_CLAVES_ARTICULOS r ON r.ROL_CLAVE_ART_ID = ca.ROL_CLAVE_ART_ID AND r.ES_PPAL = 'S'
            LEFT JOIN LINEAS_ARTICULOS la_art ON la_art.LINEA_ARTICULO_ID = a.LINEA_ARTICULO_ID
            LEFT JOIN LIBRES_ARTICULOS la ON la.ARTICULO_ID = a.ARTICULO_ID
            WHERE a.ARTICULO_ID IN ({ph})
        """, tuple(chunk))
        for r in cur.fetchall():
            aid = int(r[0])
            grupo_id = int(r[3] or 0)
            articulos_dict[aid] = {
                'articulo_id': aid,
                'clave': str(r[1] or '').strip(),
                'nombre': str(r[2] or '').strip(),
                'grupo_id': grupo_id,
                'multiplo': int(r[4] or 1),
                'es_par': str(r[5] or 'N').strip().upper(),
                'izq_der': str(r[6] or 'N').strip().upper(),
                'clasif_alm_historica': str(r[7] or 'N').strip().upper(),
                'clasif_cedis': str(r[8] or 'N').strip().upper(),
                'equivalencia': str(r[9] or '').strip().upper()
            }
            
    # Traer equivalencias cruzadas para completar grupos de equivalencia
    eq_set = {a['equivalencia'] for a in articulos_dict.values() if a['equivalencia']}
    eq_lista = list(eq_set)
    for i in range(0, len(eq_lista), 500):
        chunk = eq_lista[i:i + 500]
        ph = ','.join('?' * len(chunk))
        cur.execute(f"""
            SELECT 
                a.ARTICULO_ID,
                TRIM(ca.CLAVE_ARTICULO),
                TRIM(a.NOMBRE),
                la_art.GRUPO_LINEA_ID,
                COALESCE(la.MULTIPLO, 1),
                COALESCE(TRIM(la.ARTPAR), 'N'),
                COALESCE(TRIM(la.IZQDER), 'N'),
                COALESCE(TRIM(la.{clasif_col}), 'N'),
                COALESCE(TRIM(la.{clasif_cedis_col}), 'N'),
                COALESCE(TRIM(la.EQUIVALENCIA1), '')
            FROM ARTICULOS a
            JOIN CLAVES_ARTICULOS ca ON ca.ARTICULO_ID = a.ARTICULO_ID
            JOIN ROLES_CLAVES_ARTICULOS r ON r.ROL_CLAVE_ART_ID = ca.ROL_CLAVE_ART_ID AND r.ES_PPAL = 'S'
            LEFT JOIN LINEAS_ARTICULOS la_art ON la_art.LINEA_ARTICULO_ID = a.LINEA_ARTICULO_ID
            LEFT JOIN LIBRES_ARTICULOS la ON la.ARTICULO_ID = a.ARTICULO_ID
            WHERE TRIM(la.EQUIVALENCIA1) IN ({ph})
        """, tuple(chunk))
        for r in cur.fetchall():
            aid = int(r[0])
            if aid not in articulos_dict:
                articulos_dict[aid] = {
                    'articulo_id': aid,
                    'clave': str(r[1] or '').strip(),
                    'nombre': str(r[2] or '').strip(),
                    'grupo_id': int(r[3] or 0),
                    'multiplo': int(r[4] or 1),
                    'es_par': str(r[5] or 'N').strip().upper(),
                    'izq_der': str(r[6] or 'N').strip().upper(),
                    'clasif_alm_historica': str(r[7] or 'N').strip().upper(),
                    'clasif_cedis': str(r[8] or 'N').strip().upper(),
                    'equivalencia': str(r[9] or '').strip().upper()
                }

    # 6. Saldos
    all_ids = list(articulos_dict.keys())
    stock_map = {}
    for i in range(0, len(all_ids), CHUNK_SIZE):
        chunk = all_ids[i:i + CHUNK_SIZE]
        ph = ','.join('?' * len(chunk))
        cur.execute(f"""
            SELECT s.ARTICULO_ID, s.ALMACEN_ID, SUM(s.ENTRADAS_UNIDADES - s.SALIDAS_UNIDADES)
            FROM SALDOS_IN s
            WHERE s.ARTICULO_ID IN ({ph}) AND s.ALMACEN_ID IN (?, ?)
            GROUP BY s.ARTICULO_ID, s.ALMACEN_ID
        """, (*chunk, alm_id, cedis_id))
        for aid, alm, qty in cur.fetchall():
            stock_map[(int(aid), int(alm))] = max(0.0, float(qty or 0))

    conn.close()

    # 7. Procesar filas base
    filas = []
    for aid, art in articulos_dict.items():
        gid = art['grupo_id']
        if gid in GRUPOS_EXCLUIDOS:
            continue
            
        s_info = sales_map.get(aid, {})
        vta = s_info.get('venta_piezas', 0.0)
        vta_rec = s_info.get('venta_dias_antes', 0.0)
        
        # Clasificación activa
        if aid in sales_map:
            clasif = s_info.get('clasif_calc', 'N')
            source = 'Venta'
        elif art['clasif_alm_historica'] and art['clasif_alm_historica'] != 'N':
            clasif = art['clasif_alm_historica']
            source = 'Clasif.'
        elif art.get('equivalencia'):
            clasif = art.get('clasif_alm_historica', 'N')
            source = 'Equiv.'
        else:
            clasif = 'N'
            source = 'Clasif.'
            
        is_sf = gid in GRUPOS_SIN_FILTRAR
        
        # Fórmulas idénticas a renderResurtidosGrid
        p6m = round(vta / meses_ant)
        p15d = round(p6m / 2.0)
        
        inv_suc = round(stock_map.get((aid, alm_id), 0.0))
        inv_ced = round(stock_map.get((aid, cedis_id), 0.0))
        
        faltante = max(0, p15d - inv_suc)
        disp_cedis = max(0, inv_ced - 1)
        surtir = min(faltante, disp_cedis)
        
        filas.append({
            'articulo_id': aid,
            'clave': art['clave'],
            'nombre': art['nombre'],
            'grupo_id': gid,
            'is_sf': is_sf,
            'source': source,
            'vta': vta,
            'vta_rec': vta_rec,
            'p6m': p6m,
            'p15d': p15d,
            'inv_suc': inv_suc,
            'inv_ced': inv_ced,
            'surtir': surtir,
            'clasif': clasif,
            'clasif_cedis': art['clasif_cedis'],
            'equivalencia': art['equivalencia'],
            'es_par': art['es_par'],
            'izq_der': art['izq_der'],
            'multiplo': max(1, art['multiplo']),
            'badge_as': False
        })

    # Regla exactas de empresas.js:
    # 1. normalizeResurtidosSurtirNegativeValues (ya garantizado >= 0)
    
    # 2. getResurtidosEquivalenceCounts
    equiv_counts = defaultdict(int)
    for r in filas:
        if not r['is_sf'] and r['equivalencia']:
            equiv_counts[r['equivalencia']] += 1
            
    def can_process_equivalence_row(row):
        eq = row['equivalencia']
        return row['is_sf'] or not eq or equiv_counts[eq] == 1

    # 3. applyResurtidosMinimumByClassification
    for r in filas:
        if can_process_equivalence_row(r) and r['clasif'] in selected_clasifs:
            if r['surtir'] == 0 and r['inv_suc'] == 0 and r['inv_ced'] > 0:
                sug = 2 if r['es_par'] == 'S' else 1
                disp = max(0, r['inv_ced'] - 1)
                r['surtir'] = min(sug, disp)
                
    # 4. clearResurtidosUnselectedClassificationValues
    for r in filas:
        if can_process_equivalence_row(r) and r['clasif'] not in selected_clasifs:
            r['surtir'] = 0
            
    # 5. markResurtidosEquivalentGroupsToSupply & applyResurtidosEquivalentGroupSupplySelection
    groups = defaultdict(list)
    for r in filas:
        if not r['is_sf'] and r['equivalencia']:
            groups[r['equivalencia']].append(r)
            
    classification_order = {'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'N': 5}
    
    for eq, rows in groups.items():
        if len(rows) <= 1:
            continue
            
        eligible_rows = [r for r in rows if r['clasif'] in selected_clasifs]
        requested_supply = sum(max(0, r['surtir']) for r in eligible_rows)
        has_dest_inv = any(r['inv_suc'] > 0 for r in eligible_rows)
        
        for r in rows:
            r['surtir'] = 0
            
        if not eligible_rows or has_dest_inv:
            continue
            
        mult = max([r['multiplo'] for r in eligible_rows] + [1])
        base_req = max(1, requested_supply, mult)
        req_supply = math.ceil(base_req / mult) * mult if mult > 1 else base_req
        
        # Candidatos con inventario en CEDIS > 0
        candidates = [r for r in eligible_rows if r['inv_ced'] > 0]
        if not candidates:
            continue
            
        candidates.sort(key=lambda r: (-r['inv_ced'], classification_order.get(r['clasif'], 99)))
        sel = candidates[0]
        sel['surtir'] = req_supply
        sel['badge_as'] = True

    # 6. clearResurtidosZeroCedisSupply
    for r in filas:
        if r['inv_ced'] <= 0 and r['surtir'] != 0:
            r['surtir'] = 0
            
    # 7. applyResurtidosCedisMinimumReserve
    for r in filas:
        if r['surtir'] > 0:
            faltante = max(0, r['p15d'] - r['inv_suc'])
            disp = max(0, r['inv_ced'] - 1)
            max_surtir = min(faltante, disp)
            if r['surtir'] > max_surtir:
                r['surtir'] = max_surtir

    # 8. enforceResurtidosEquivalentDestinationInventoryRule
    for eq, rows in groups.items():
        if len(rows) <= 1:
            continue
        has_dest_inv = any(r['inv_suc'] > 0 for r in rows)
        if has_dest_inv:
            for r in rows:
                r['surtir'] = 0
                
    # 9. applyResurtidosEquivalentZeroInventoryFallback
    for eq, rows in groups.items():
        if len(rows) < 2:
            continue
        all_surt_zero = all(r['surtir'] == 0 for r in rows)
        has_dest_inv = any(r['inv_suc'] > 0 for r in rows)
        has_sel_clasif = any(r['clasif'] in selected_clasifs for r in rows)
        if not all_surt_zero or has_dest_inv or not has_sel_clasif:
            continue
            
        candidates = [r for r in rows if not r['is_sf'] and r['inv_ced'] > 1]
        if not candidates:
            continue
        candidates.sort(key=lambda r: -r['inv_ced'])
        sel = candidates[0]
        
        mult = max(1, sel['multiplo'])
        pack_size = mult * 2 if sel['es_par'] == 'S' and mult % 2 != 0 else mult
        req = max(pack_size, sel['p15d'] - sel['inv_suc'])
        req_units = math.ceil(req / pack_size) * pack_size
        avail = max(0, sel['inv_ced'] - 1)
        sel['surtir'] = min(req_units, avail)
        sel['badge_as'] = True

    # 10. applyResurtidosUnfilteredNoSalesMinimum
    for r in filas:
        if r['is_sf'] and r['vta'] == 0 and r['clasif'] in selected_clasifs:
            mult = max(1, r['multiplo'])
            pack_size = mult * 2 if r['es_par'] == 'S' and mult % 2 != 0 else mult
            dest_gap = max(0, pack_size - r['inv_suc'])
            if dest_gap > 0 and r['inv_ced'] > 1:
                req_units = math.ceil(dest_gap / pack_size) * pack_size
                avail = max(0, r['inv_ced'] - 1)
                r['surtir'] = min(req_units, avail)

    # Filtrar solo los que tienen surtido > 0
    a_surtir = [r for r in filas if r['surtir'] > 0]
    print(f"\n==========================================")
    print(f"Total articulos resultantes a surtir: {len(a_surtir)}")
    print(f"==========================================")
    
    # Imprimir todos
    for r in sorted(a_surtir, key=lambda x: -x['vta']):
        badge = "SF" if r['is_sf'] else ("AS" if r['badge_as'] else "")
        print(f"{r['clave']:<18} {badge:<3} | Vta:{int(r['vta']):>3} | P15d:{r['p15d']:>2} | InvB:{r['inv_suc']:>2} | Ced:{r['inv_ced']:>5} | Surt:{r['surtir']:>2} | Cl:{r['clasif']} | Eq:{r['equivalencia']:<10}")

if __name__ == '__main__':
    test_engine()
