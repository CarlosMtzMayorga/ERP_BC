import socket
import time
import unicodedata
import ctypes
from ctypes import wintypes
import datetime

class DOC_INFO_1_PRN(ctypes.Structure):
    _fields_ = [
        ("pDocName", wintypes.LPWSTR),
        ("pOutputFile", wintypes.LPWSTR),
        ("pDatatype", wintypes.LPWSTR)
    ]

def quitar_acentos(texto):
    if not texto:
        return ""
    reemplazos = {
        'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u',
        'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ü': 'U',
        'ñ': 'n', 'Ñ': 'N',
    }
    t = "".join(reemplazos.get(c, c) for c in str(texto))
    return unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode('ascii')

def desglosar_folio(folio):
    import re
    s = str(folio or '').strip().upper()
    m = re.match(r'^([A-Z\-_]*?)(\d+)$', s)
    if m:
        letras = m.group(1)
        num_str = m.group(2)
        return letras, int(num_str), num_str
    return s, None, None

def folio_para_microsip_db(folio):
    letras, num_val, num_str = desglosar_folio(folio)
    if num_str:
        s_val = str(num_val)
        ceros = max(0, 9 - len(letras) - len(s_val))
        return f"{letras}{'0' * ceros}{s_val}"
    return str(folio or '').strip().upper()[:9]

def folio_para_codigo_barras(folio):
    return folio_para_microsip_db(folio)


def generar_ticket_traspaso_bytes(empresa_nombre, folio, now_dt, nombre_origen, nombre_destino, concepto_nombre, descripcion, partidas):
    esc = b'\x1b'
    gs = b'\x1d'

    empresa_nombre = quitar_acentos(empresa_nombre)
    nombre_origen = quitar_acentos(nombre_origen)
    nombre_destino = quitar_acentos(nombre_destino)
    concepto_nombre = quitar_acentos(concepto_nombre)
    descripcion = quitar_acentos(descripcion)

    b = esc + b'@'

    # 1. Almacen Destino (Centrado, Grande y Negrita)
    b += esc + b'a\x01'
    b += esc + b'!\x38'
    b += f"{nombre_destino}\n".encode('ascii', 'replace')
    b += esc + b'!\x00'

    # 2. Razon Social Empresa
    b += esc + b'E\x01'
    b += f"{empresa_nombre}\n".encode('ascii', 'replace')
    b += esc + b'E\x00'

    # 3. Datos de Concepto y Almacenes
    b += esc + b'a\x00'
    con_txt = concepto_nombre if concepto_nombre else "Traspaso (Salida)"
    b += f"Concepto: {con_txt}\n".encode('ascii', 'replace')
    b += f"Del almacen: {nombre_origen}\n".encode('ascii', 'replace')
    b += f"Al Almacen: {nombre_destino}\n".encode('ascii', 'replace')
    if descripcion:
        b += f"Notas: {descripcion[:38]}\n".encode('ascii', 'replace')

    # 4. Caja Fecha | Hora | Folio
    folio_display = quitar_acentos(folio_para_microsip_db(folio))
    meses = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sep.", "oct.", "nov.", "dic."]
    fecha_fmt = f"{now_dt.day:02d}/{meses[now_dt.month-1]}/{now_dt.year}"
    hora_fmt = now_dt.strftime("%H:%M")

    b += b"+--------------------+-------+-----------------+\n"
    b += b"| Fecha              | Hora  | Folio           |\n"
    b += f"| {fecha_fmt:<18} | {hora_fmt:<5} | {folio_display:<15} |\n".encode('ascii', 'replace')
    b += b"+--------------------+-------+-----------------+\n"

    # 5. Tabla de Partidas
    b += b"+------------+----------------------------+----+\n"
    b += b"| CLAVE      | ARTICULO                   | U. |\n"
    b += b"+------------+----------------------------+----+\n"

    for p in partidas:
        cant = float(p.get('cantidad', 0))
        clave = quitar_acentos(p.get('clave', '')).strip()
        nombre = quitar_acentos(p.get('nombre', '')).strip()
        loc = quitar_acentos(p.get('localizacion', '')).strip()

        words_desc = nombre.split(' ')
        lines_desc = []
        cur_d = ""
        for wd in words_desc:
            if not cur_d:
                cur_d = wd
            elif len(cur_d) + 1 + len(wd) <= 26:
                cur_d += " " + wd
            else:
                lines_desc.append(cur_d)
                cur_d = wd
        if cur_d:
            lines_desc.append(cur_d)

        if loc:
            lines_desc.append(f">> UBIC: {loc.upper()}"[:26])
        else:
            lines_desc.append(">> UBIC: (SIN ASIGNAR)"[:26])

        words_c = clave.split(' ')
        lines_clave = []
        cur_c = ""
        for wc in words_c:
            if not cur_c:
                cur_c = wc
            elif len(cur_c) + 1 + len(wc) <= 10:
                cur_c += " " + wc
            else:
                lines_clave.append(cur_c)
                cur_c = wc
        if cur_c:
            lines_clave.append(cur_c)

        cant_str = f"{int(cant)}" if cant.is_integer() else f"{cant:.1f}"
        max_rows = max(len(lines_desc), len(lines_clave), 1)

        for i in range(max_rows):
            c_text = lines_clave[i] if i < len(lines_clave) else ""
            d_text = lines_desc[i] if i < len(lines_desc) else ""
            u_text = cant_str if i == 0 else ""
            line_str = f"| {c_text:<10} | {d_text:<26} | {u_text:>2} |\n"
            b += line_str.encode('ascii', 'replace')

        b += b"+------------+----------------------------+----+\n"

    # 6. Cuadro de Firmas
    b += esc + b'a\x01'
    b += b"\n\n"
    b += b"         ______________________________         \n"
    b += b"             Nombre y Firma Entrega             \n"
    b += b"\n\n"
    b += b"         ______________________________         \n"
    b += b"             Nombre y Firma Recibe              \n"
    b += b"\n"

    # 7. Fecha de Impresion
    fecha_impr = now_dt.strftime("%d/%m/%Y %I:%M %p").replace("AM", "a. m.").replace("PM", "p. m.")
    b += f"Fecha de Impresion: {fecha_impr}\n\n".encode('ascii', 'replace')

    # 8. Codigo de Barras 1D del Folio
    folio_clean = "".join(ch for ch in folio_display if ch.isalnum() or ch in "-_").upper()
    if folio_clean:
        b += esc + b'a\x01'
        b += gs + b'h\x46'
        b += gs + b'w\x02'
        b += gs + b'H\x02'
        b += gs + b'f\x00'
        code128_data = b'{B' + folio_clean.encode('ascii', 'replace')
        b += gs + b'k\x49' + bytes([len(code128_data)]) + code128_data

    # 9. Avance de papel y Corte automatico
    b += b"\n\n\n\n\n"
    b += gs + b'V\x00'
    return b

def _enviar_raw_a_spooler(ticket_bytes, printer_name, doc_title="Ticket Traspaso CEDIS"):
    try:
        winspool = ctypes.WinDLL('winspool.drv')
        winspool.OpenPrinterW.argtypes = [wintypes.LPWSTR, ctypes.POINTER(wintypes.HANDLE), ctypes.c_void_p]
        winspool.OpenPrinterW.restype = wintypes.BOOL
        winspool.StartDocPrinterW.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.POINTER(DOC_INFO_1_PRN)]
        winspool.StartDocPrinterW.restype = wintypes.DWORD
        winspool.StartPagePrinter.argtypes = [wintypes.HANDLE]
        winspool.StartPagePrinter.restype = wintypes.BOOL
        winspool.WritePrinter.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD)]
        winspool.WritePrinter.restype = wintypes.BOOL
        winspool.EndPagePrinter.argtypes = [wintypes.HANDLE]
        winspool.EndPagePrinter.restype = wintypes.BOOL
        winspool.EndDocPrinter.argtypes = [wintypes.HANDLE]
        winspool.EndDocPrinter.restype = wintypes.BOOL
        winspool.ClosePrinter.argtypes = [wintypes.HANDLE]
        winspool.ClosePrinter.restype = wintypes.BOOL

        hPrinter = wintypes.HANDLE()
        if winspool.OpenPrinterW(printer_name, ctypes.byref(hPrinter), None):
            try:
                doc_info = DOC_INFO_1_PRN()
                doc_info.pDocName = doc_title
                doc_info.pOutputFile = None
                doc_info.pDatatype = "RAW"
                job_id = winspool.StartDocPrinterW(hPrinter, 1, ctypes.byref(doc_info))
                if job_id > 0:
                    winspool.StartPagePrinter(hPrinter)
                    bytes_written = wintypes.DWORD()
                    winspool.WritePrinter(hPrinter, ticket_bytes, len(ticket_bytes), ctypes.byref(bytes_written))
                    winspool.EndPagePrinter(hPrinter)
                    winspool.EndDocPrinter(hPrinter)
                    return True, f"Trabajo #{job_id}"
                else:
                    return False, "Spooler StartDocPrinterW retorno 0"
            finally:
                winspool.ClosePrinter(hPrinter)
        else:
            return False, f"No se pudo abrir la impresora '{printer_name}' en Windows"
    except Exception as e_spool:
        return False, f"Spooler error: {e_spool}"

def imprimir_ticket_pos80(ticket_bytes, printer_name="POS-80C", copias=1):
    """
    Envía la impresión del ticket a la impresora térmica POS-80C.
    Por defecto imprime 1 juego de ticket (copias=1) para evitar duplicación.
    """
    errores = []
    num_copias = max(1, int(copias or 1))

    # 1. Intento vía Windows Spooler nativo
    try:
        trabajos_ok = []
        for c in range(1, num_copias + 1):
            doc_title = "Ticket Traspaso CEDIS" if num_copias == 1 else f"Ticket Traspaso CEDIS (Copia {c}/{num_copias})"
            ok_spool, msg_spool = _enviar_raw_a_spooler(ticket_bytes, printer_name, doc_title)
            if ok_spool:
                trabajos_ok.append(msg_spool)
            else:
                errores.append(f"Copia {c}: {msg_spool}")
            if c < num_copias:
                time.sleep(0.6)
        
        if len(trabajos_ok) == num_copias:
            copias_txt = "1 juego" if num_copias == 1 else f"{num_copias} copias"
            return True, f"Ticket impreso correctamente ({copias_txt}) en '{printer_name}' ({', '.join(trabajos_ok)})"
        elif len(trabajos_ok) > 0:
            return True, f"Ticket impreso parcialmente ({len(trabajos_ok)}/{num_copias} copias) en '{printer_name}'"
    except Exception as e_spool:
        errores.append(f"Spooler error general: {e_spool}")

    # 2. Intento de respaldo vía Socket directo a IP 192.168.1.225:9100
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(3.0)
        s.connect(('192.168.1.225', 9100))
        for c in range(1, num_copias + 1):
            s.sendall(ticket_bytes)
            if c < num_copias:
                time.sleep(0.6)
        s.close()
        copias_txt = "1 juego" if num_copias == 1 else f"{num_copias} copias"
        return True, f"Ticket impreso correctamente ({copias_txt}) vía IP directa 192.168.1.225:9100 (POS-80C)"
    except Exception as e_sock:
        errores.append(f"Socket IP error: {e_sock}")

    return False, " / ".join(errores)
