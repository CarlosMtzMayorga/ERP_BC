from app.db import conectar_db

conn = conectar_db()
cur = conn.cursor()

print("--- 1. FORMAS DE COBRO (OCTUBRE) ---")
cur.execute("""
    SELECT 
        fc.NOMBRE AS FORMA,
        COUNT(dpc.DOCTO_PV_COBRO_ID) AS OPERACIONES,
        SUM(dpc.IMPORTE) AS TOTAL
    FROM DOCTOS_PV_COBROS dpc
    JOIN FORMAS_COBRO fc ON fc.FORMA_COBRO_ID = dpc.FORMA_COBRO_ID
    JOIN DOCTOS_PV p ON p.DOCTO_PV_ID = dpc.DOCTO_PV_ID
    WHERE p.FECHA >= '2026-10-01' AND p.ESTATUS <> 'C'
    GROUP BY fc.NOMBRE
    ORDER BY TOTAL DESC
""")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[1]} ops - ${r[2]:,.2f}")

print("\n--- 2. CUENTAS POR COBRAR (SALDOS CLIENTES) ---")
try:
    cur.execute("""
        SELECT FIRST 5
            TRIM(c.NOMBRE) AS CLIENTE,
            SUM(d.IMPORTE_NETO) AS SALDO
        FROM DOCTOS_CC d
        JOIN CLIENTES c ON c.CLIENTE_ID = d.CLIENTE_ID
        WHERE d.CANCELADO = 'N'
        GROUP BY c.NOMBRE
        ORDER BY SALDO DESC
    """)
    for r in cur.fetchall():
        print(f"  {r[0]}: ${r[1]:,.2f}")
except Exception as e:
    print("Error doctos_cc:", e)

print("\n--- 3. COMPRAS DEL PERÍODO (DOCTOS_CM) ---")
try:
    cur.execute("""
        SELECT 
            COUNT(DOCTO_CM_ID),
            SUM(IMPORTE_NETO + COALESCE(TOTAL_IMPUESTOS, 0))
        FROM DOCTOS_CM
        WHERE FECHA >= '2026-10-01' AND ESTATUS <> 'C'
    """)
    r = cur.fetchone()
    print(f"  Compras Octubre: {r[0]} doctos - ${r[1] or 0:,.2f}")
except Exception as e:
    print("Error doctos_cm:", e)
