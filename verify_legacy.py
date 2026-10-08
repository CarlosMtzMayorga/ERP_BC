import urllib.request, json, math
from collections import defaultdict

url = 'http://192.168.1.253:5000/api/resurtidos/ventas?company_id=empresa_gdz&almacen_id=99934&cedis_id=620110&fecha_inicio=2026-04-05&fecha_final=2026-10-05&fecha_dias_antes=2026-10-01&meses_ant=6&dias_inventario=15&clasificaciones=A,B,C'
req = urllib.request.Request(url)
with urllib.request.urlopen(req, timeout=60) as resp:
    raw_data = json.loads(resp.read().decode('utf-8'))
rows = raw_data.get('data', [])

req_ex = urllib.request.Request('http://192.168.1.253:5000/api/resurtidos/grupos-excluidos?company_id=empresa_gdz')
with urllib.request.urlopen(req_ex, timeout=10) as resp:
    ex_data = json.loads(resp.read().decode('utf-8'))
excluded_ids = {str(g.get('grupo_id')).strip() for g in ex_data.get('data', {}).get('grupos_excluidos', [])}

req_sf = urllib.request.Request('http://192.168.1.253:5000/api/resurtidos/grupos-sin-filtrar?company_id=empresa_gdz')
with urllib.request.urlopen(req_sf, timeout=10) as resp:
    sf_data = json.loads(resp.read().decode('utf-8'))
unfiltered_ids = {str(g.get('grupo_id')).strip() for g in sf_data.get('data', {}).get('grupos_sin_filtrar', [])}

print(f"Total initial rows: {len(rows)}")

processed = []
for r in rows:
    gid = str(r.get('grupo_id') or '').strip()
    if gid in excluded_ids:
        continue
    
    is_sf = gid in unfiltered_ids
    
    p15 = float(r.get('promedio_de_inv') or 0)
    inv = float(r.get('inventario') or 0)
    inv_ced = float(r.get('inventario_cedis') or 0)
    
    faltante = max(0, round(p15 - inv))
    disp = max(0, math.floor(inv_ced) - 1)
    surtir = min(faltante, disp)
    
    processed.append({
        'articulo_id': str(r.get('articulo_id')),
        'numero_parte': str(r.get('numero_parte') or '').strip(),
        'descripcion': str(r.get('descripcion') or '').strip(),
        'venta_periodo': float(r.get('venta_periodo') or 0),
        'venta_dias_antes': float(r.get('venta_dias_antes') or 0),
        'promedio': float(r.get('promedio') or 0),
        'promedio_de_inv': p15,
        'inventario': inv,
        'inventario_cedis': inv_ced,
        'surtir': max(0, surtir),
        'clasificacion': str(r.get('clasificacion') or 'N').strip().upper() or 'N',
        'clasificacion_cedis': str(r.get('clasificacion_cedis') or 'N').strip().upper() or 'N',
        'equivalencia': str(r.get('equivalencia') or '').strip().upper(),
        'es_par': str(r.get('es_par') or 'N').strip().upper(),
        'izq_der': str(r.get('izq_der') or 'N').strip().upper(),
        'multiplo': max(1, int(float(r.get('multiplo') or 1))),
        'grupo_id': gid,
        'is_sf': is_sf,
        'source_row': r.get('source_row'),
        'badge_as': False
    })

selected_clasificaciones = {'A', 'B', 'C'}

equiv_counts = defaultdict(int)
for r in processed:
    if not r['is_sf'] and r['equivalencia']:
        equiv_counts[r['equivalencia']] += 1

def can_process(r):
    eq = r['equivalencia']
    return r['is_sf'] or not eq or equiv_counts[eq] == 1

# applyResurtidosMinimumByClassification
for r in processed:
    if not can_process(r) or r['clasificacion'] not in selected_clasificaciones:
        continue
    if r['surtir'] == 0 and r['inventario'] == 0 and r['inventario_cedis'] > 0:
        piezas = min(2, math.floor(r['inventario_cedis'])) if r['es_par'] == 'S' else 1
        r['surtir'] = piezas

# clearResurtidosUnselectedClassificationValues
for r in processed:
    if not can_process(r) or r['clasificacion'] in selected_clasificaciones:
        continue
    if r['surtir'] != 0:
        r['surtir'] = 0

# markResurtidosEquivalentGroupsToSupply
groups = defaultdict(list)
for r in processed:
    if not r['is_sf'] and r['equivalencia']:
        groups[r['equivalencia']].append(r)

clasif_order = {'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'N': 5}

for eq, rows_grp in groups.items():
    if len(rows_grp) <= 1:
        continue
    all_surt_zero = all(r['surtir'] == 0 for r in rows_grp)
    all_inv_zero = all(r['inventario'] == 0 for r in rows_grp)
    has_sel = any(r['clasificacion'] in selected_clasificaciones for r in rows_grp)
    if all_surt_zero and all_inv_zero and has_sel:
        for r in rows_grp:
            r['badge_as'] = True

for eq, rows_grp in groups.items():
    if len(rows_grp) <= 1:
        continue
    eligible = [r for r in rows_grp if r['clasificacion'] in selected_clasificaciones]
    req_supply = sum(r['surtir'] for r in eligible if r['surtir'] > 0)
    has_dest_inv = any(r['inventario'] > 0 for r in eligible)
    for r in rows_grp:
        r['surtir'] = 0
    if not eligible or has_dest_inv:
        continue
    
    mult = max([r['multiplo'] for r in eligible] + [1])
    base_req = max(1, req_supply, mult)
    final_req = math.ceil(base_req / mult) * mult if mult > 1 else base_req
    
    candidates = [r for r in eligible if r['inventario_cedis'] > 0]
    if not candidates:
        continue
    candidates.sort(key=lambda x: (-x['inventario_cedis'], clasif_order.get(x['clasificacion'], 99)))
    candidates[0]['surtir'] = final_req

# clearResurtidosZeroCedisSupply
for r in processed:
    if r['inventario_cedis'] <= 0 and r['surtir'] != 0:
        r['surtir'] = 0

# applyResurtidosCedisMinimumReserve
for r in processed:
    if r['surtir'] > 0:
        p15 = r['promedio_de_inv']
        inv = r['inventario']
        inv_ced = r['inventario_cedis']
        faltante = max(0, round(p15 - inv))
        disp = max(0, math.floor(inv_ced) - 1)
        max_s = min(faltante, disp)
        if r['surtir'] > max_s:
            r['surtir'] = max_s

# enforceResurtidosEquivalentDestinationInventoryRule
for eq, rows_grp in groups.items():
    if len(rows_grp) <= 1:
        continue
    if any(r['inventario'] > 0 for r in rows_grp):
        for r in rows_grp:
            r['surtir'] = 0

# applyResurtidosEquivalentZeroInventoryFallback
for eq, rows_grp in groups.items():
    if len(rows_grp) < 2:
        continue
    all_surt_zero = all(r['surtir'] == 0 for r in rows_grp)
    has_dest_inv = any(r['inventario'] > 0 for r in rows_grp)
    has_sel = any(r['clasificacion'] in selected_clasificaciones for r in rows_grp)
    if not all_surt_zero or has_dest_inv or not has_sel:
        continue
    candidates = [r for r in rows_grp if not r['is_sf'] and r['inventario_cedis'] > 1]
    if not candidates:
        continue
    candidates.sort(key=lambda x: -x['inventario_cedis'])
    sel = candidates[0]
    t_inv = max(0, round(sel['promedio_de_inv']))
    d_inv = max(0, math.floor(sel['inventario']))
    mult = max(1, sel['multiplo'])
    is_pair = sel['es_par'] == 'S'
    pack_size = mult * 2 if is_pair and mult % 2 != 0 else mult
    req = max(pack_size, t_inv - d_inv)
    req_units = math.ceil(req / pack_size) * pack_size
    avail = max(0, math.floor(sel['inventario_cedis']) - 1)
    sel['surtir'] = min(req_units, avail)
    sel['badge_as'] = True

# applyResurtidosUnfilteredNoSalesMinimum
for r in processed:
    if not r['is_sf'] or r['venta_periodo'] != 0 or r['clasificacion'] not in selected_clasificaciones:
        continue
    d_inv = max(0, math.floor(r['inventario']))
    ced_inv = max(0, math.floor(r['inventario_cedis']))
    mult = max(1, r['multiplo'])
    is_pair = r['es_par'] == 'S'
    pack_size = mult * 2 if is_pair and mult % 2 != 0 else mult
    dest_gap = max(0, pack_size - d_inv)
    if dest_gap > 0 and ced_inv > 1:
        req_units = math.ceil(dest_gap / pack_size) * pack_size
        avail = max(0, ced_inv - 1)
        r['surtir'] = min(req_units, avail)

a_surtir = [r for r in processed if r['surtir'] > 0]
print(f"Total resulting to surtir: {len(a_surtir)}")
for r in sorted(a_surtir, key=lambda x: -x['venta_periodo']):
    badge = 'SF' if r['is_sf'] else ('AS' if r['badge_as'] else '')
    print(f"{r['numero_parte']:<18} {badge:<3} | Vta:{int(r['venta_periodo']):>3} | P15:{int(r['promedio_de_inv']):>2} | InvB:{int(r['inventario']):>2} | Ced:{int(r['inventario_cedis']):>5} | Surt:{int(r['surtir']):>2} | Cl:{r['clasificacion']} | Eq:{r['equivalencia']:<10}")
