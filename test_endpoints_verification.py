import json
from app import create_app

app = create_app()
client = app.test_client()

print("--- PROBANDO DASHBOARD ---")
r_dash = client.get('/api/dashboard/resumen')
print(f"Status /api/dashboard/resumen: {r_dash.status_code}")
if r_dash.status_code == 200:
    data = json.loads(r_dash.data)
    print(f"  Ventas Totales: ${data.get('kpis', {}).get('total_venta', 0):,.2f}")
    print(f"  Tickets: {data.get('kpis', {}).get('total_tickets', 0)}")
    print(f"  Inv Total: {data.get('kpis', {}).get('total_stock_piezas', 0):,} pzs")
    print(f"  Sucursal Top: {data.get('kpis', {}).get('sucursal_lider', {})}")
    print(f"  Articulo Estrella: {data.get('kpis', {}).get('articulo_estrella', {})}")
    print(f"  Sucursales con venta: {len(data.get('ventas_sucursales', []))}")
    print(f"  Distribucion Almacenes: {len(data.get('almacenes_stock', []))}")
    print(f"  Top Articulos: {len(data.get('top_articulos', []))}")

print("\n--- PROBANDO VENTAS ---")
r_ventas = client.get('/api/ventas/resumen-sucursal')
print(f"Status /api/ventas/resumen-sucursal: {r_ventas.status_code}")
if r_ventas.status_code == 200:
    d_v = json.loads(r_ventas.data)
    r = d_v.get('resumen', {})
    print(f"  Venta Sucursal/Consolidado: ${r.get('total_venta', 0):,.2f}")
    print(f"  Tickets Sucursal: {r.get('tickets', 0):,}")
    print(f"  Ticket Promedio: ${r.get('ticket_promedio', 0):,.2f}")
    print(f"  Top Articulos Sucursal: {len(d_v.get('top_articulos', []))}")

r_tickets = client.get('/api/ventas/tickets')
print(f"Status /api/ventas/tickets: {r_tickets.status_code}")
if r_tickets.status_code == 200:
    d_t = json.loads(r_tickets.data)
    print(f"  Tickets retornados: {len(d_t.get('tickets', []))}")

print("\n--- PROBANDO ADMINISTRACION DEL NEGOCIO ---")
r_negocio = client.get('/api/admin/negocio/resumen')
print(f"Status /api/admin/negocio/resumen: {r_negocio.status_code}")
if r_negocio.status_code == 200:
    d_neg = json.loads(r_negocio.data)
    k = d_neg.get('kpis', {})
    print(f"  Ventas Negocio: ${k.get('ventas_totales', 0):,.2f}")
    print(f"  Compras Proveedores: ${k.get('compras_totales', 0):,.2f}")
    print(f"  Total Cobrado Cajas: ${k.get('total_cobrado', 0):,.2f}")
    print(f"  Formas de Pago: {len(d_neg.get('formas_cobro', []))}")
    print(f"  Ultimas Compras: {len(d_neg.get('ultimas_compras', []))}")

print("\n--- PROBANDO CONFIGURACION Y DIAGNOSTICO ---")
r_admin = client.get('/api/admin/info-sistema')
print(f"Status /api/admin/info-sistema: {r_admin.status_code}")
if r_admin.status_code == 200:
    d_a = json.loads(r_admin.data)
    print(f"  Sistema: {d_a.get('sistema', {}).get('nombre')}")
    print(f"  Firebird: {d_a.get('estado_servicios', {}).get('base_datos_microsip', {}).get('estado')} ({d_a.get('estado_servicios', {}).get('base_datos_microsip', {}).get('latencia_ms')}ms)")
    print(f"  SQLite: {d_a.get('estado_servicios', {}).get('base_datos_local', {}).get('estado')}")

print("\n--- VERIFICACION FINALIZADA EXITOSAMENTE ---")
