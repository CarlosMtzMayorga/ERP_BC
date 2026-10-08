import re

def normalizar_clave_ceros(clave):
    """
    Normaliza variantes con ceros para proveedores como Rubber Molding (DC):
    FS-000099-1ML -> FS-99-1ML
    000123 -> 123
    """
    if not clave:
        return ""
    c1 = re.sub(r'-0+(\d+)', r'-\1', str(clave).strip().upper())
    c2 = re.sub(r'^0+(\d+)', r'\1', c1)
    return c2.strip().upper()

def analizar_clave_ciosa(codigo):
    """
    Analiza sufijos de proveedores como CIOSA (ej. 41292C -> raíz '41292', sufijo 'C').
    """
    c = str(codigo).strip().upper()
    m = re.match(r'^([A-Z0-9]+?)[-_ /]?([A-Z]{1,2})$', c)
    if m and len(m.group(1)) >= 3:
        return m.group(1), m.group(2)
    return c, ""
