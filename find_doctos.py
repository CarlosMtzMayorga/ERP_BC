from app.db import conectar_db

conn = conectar_db()
cur = conn.cursor()
cur.execute("SELECT RDB$RELATION_NAME FROM RDB$RELATIONS WHERE RDB$SYSTEM_FLAG = 0 AND RDB$RELATION_NAME LIKE 'DOCTOS_%'")
print("Tablas DOCTOS:", [r[0].strip() for r in cur.fetchall()])
