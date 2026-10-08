import sqlite3
import hashlib
from app.config import SQLITE_DB

conn = sqlite3.connect(SQLITE_DB)
cur = conn.cursor()

pwd_hash = hashlib.sha256("Sudowoodo.1701".encode()).hexdigest()

cur.execute("SELECT id FROM usuarios WHERE LOWER(usuario) = 'jcmartinez'")
row = cur.fetchone()

if row:
    cur.execute("UPDATE usuarios SET password_hash = ?, rol = 'ADMIN', permisos = '[\"*\"]', activo = 1 WHERE id = ?", (pwd_hash, row[0]))
    print("Usuario JCMartinez actualizado como ADMIN.")
else:
    cur.execute("INSERT INTO usuarios (usuario, nombre, password_hash, rol, permisos, activo, creado_en) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))",
                ('JCMartinez', 'JC Martínez', pwd_hash, 'ADMIN', '["*"]', 1))
    print("Usuario JCMartinez creado con éxito como ADMIN.")

conn.commit()
conn.close()
