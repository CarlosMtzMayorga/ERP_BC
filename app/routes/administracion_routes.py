import os
import sys
import platform
import datetime
from flask import Blueprint, jsonify, request
from app.config import EMPRESAS_DISPONIBLES, get_current_dsn
from app.db import conectar_db, conectar_sqlite

administracion_bp = Blueprint('administracion', __name__)

@administracion_bp.route('/api/admin/negocio/resumen', methods=['GET'])
def get_resumen_negocio():
    fecha_ini = request.args.get('fecha_inicio', datetime.date.today().replace(day=1).strftime("%Y-%m-%d"))
    fecha_fin = request.args.get('fecha_final', datetime.date.today().strftime("%Y-%m-%d"))

    try:
        conn = conectar_db()
        cur = conn.cursor()

        # 1. Ventas Totales del Negocio
        cur.execute("""
            SELECT 
                COUNT(p.DOCTO_PV_ID),
                SUM(p.IMPORTE_NETO + COALESCE(p.TOTAL_IMPUESTOS, 0)),
                AVG(p.IMPORTE_NETO + COALESCE(p.TOTAL_IMPUESTOS, 0))
            FROM DOCTOS_PV p
            WHERE p.FECHA >= ? AND p.FECHA <= ?
              AND p.ESTATUS <> 'C'
              AND p.TIPO_DOCTO IN ('V', 'F')
        """, (fecha_ini, fecha_fin))
        r_v = cur.fetchone()
        ventas_tot = float(r_v[1] or 0)
        tickets_tot = int(r_v[0] or 0)
        ticket_prom = float(r_v[2] or 0)

        # 2. Compras Totales a Proveedores
        cur.execute("""
            SELECT 
                COUNT(cm.DOCTO_CM_ID),
                SUM(cm.IMPORTE_NETO + COALESCE(cm.TOTAL_IMPUESTOS, 0))
            FROM DOCTOS_CM cm
            WHERE cm.FECHA >= ? AND cm.FECHA <= ?
              AND cm.ESTATUS <> 'C'
        """, (fecha_ini, fecha_fin))
        r_c = cur.fetchone()
        compras_tot = float(r_c[1] or 0)
        compras_doctos = int(r_c[0] or 0)

        # Margen Bruto Operativo
        margen_bruto = ventas_tot - compras_tot
        pct_margen = round((margen_bruto / ventas_tot * 100), 1) if ventas_tot > 0 else 0.0

        # 3. Desglose por Formas de Cobro (Flujo en Cajas)
        cur.execute("""
            SELECT 
                fc.NOMBRE AS FORMA,
                COUNT(dpc.DOCTO_PV_COBRO_ID) AS OPERACIONES,
                SUM(dpc.IMPORTE) AS TOTAL
            FROM DOCTOS_PV_COBROS dpc
            JOIN FORMAS_COBRO fc ON fc.FORMA_COBRO_ID = dpc.FORMA_COBRO_ID
            JOIN DOCTOS_PV p ON p.DOCTO_PV_ID = dpc.DOCTO_PV_ID
            WHERE p.FECHA >= ? AND p.FECHA <= ?
              AND p.ESTATUS <> 'C'
              AND p.TIPO_DOCTO IN ('V', 'F')
            GROUP BY fc.NOMBRE
            ORDER BY TOTAL DESC
        """, (fecha_ini, fecha_fin))

        formas_cobro = []
        total_cobrado = 0.0
        for fc in cur.fetchall():
            tot = float(fc[2] or 0)
            total_cobrado += tot
            formas_cobro.append({
                "forma": fc[0],
                "operaciones": int(fc[1] or 0),
                "total": tot
            })

        for fc in formas_cobro:
            fc["porcentaje"] = round((fc["total"] / total_cobrado * 100), 1) if total_cobrado > 0 else 0.0

        # 4. Últimas Compras a Proveedores (Cuentas por pagar)
        cur.execute("""
            SELECT FIRST 10
                cm.FOLIO,
                cm.FECHA,
                TRIM(p.NOMBRE) AS PROVEEDOR,
                (cm.IMPORTE_NETO + COALESCE(cm.TOTAL_IMPUESTOS, 0)) AS TOTAL
            FROM DOCTOS_CM cm
            JOIN PROVEEDORES p ON p.PROVEEDOR_ID = cm.PROVEEDOR_ID
            WHERE cm.ESTATUS <> 'C'
            ORDER BY cm.FECHA DESC
        """)
        ultimas_compras = []
        for uc in cur.fetchall():
            ultimas_compras.append({
                "folio": uc[0],
                "fecha": str(uc[1]),
                "proveedor": uc[2],
                "total": float(uc[3] or 0)
            })

        conn.close()

        return jsonify({
            "success": True,
            "periodo": {
                "fecha_inicio": fecha_ini,
                "fecha_final": fecha_fin
            },
            "kpis": {
                "ventas_totales": ventas_tot,
                "tickets_totales": tickets_tot,
                "ticket_promedio": ticket_prom,
                "compras_totales": compras_tot,
                "compras_doctos": compras_doctos,
                "margen_bruto": margen_bruto,
                "pct_margen": pct_margen,
                "total_cobrado": total_cobrado
            },
            "formas_cobro": formas_cobro,
            "ultimas_compras": ultimas_compras
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@administracion_bp.route('/api/admin/info-sistema', methods=['GET'])
def get_info_sistema():
    try:
        # Probar conexión a Microsip Firebird
        fb_status = "Desconectado"
        fb_latencia_ms = 0
        t0 = datetime.datetime.now()
        try:
            conn_fb = conectar_db()
            cur_fb = conn_fb.cursor()
            cur_fb.execute("SELECT 1 FROM RDB$DATABASE")
            cur_fb.fetchone()
            conn_fb.close()
            fb_latencia_ms = round((datetime.datetime.now() - t0).total_seconds() * 1000, 1)
            fb_status = "En Línea"
        except Exception as e_fb:
            fb_status = f"Error: {str(e_fb)}"

        # Probar conexión SQLite local
        sqlite_status = "En Línea"
        total_usuarios = 0
        try:
            conn_sq = conectar_sqlite()
            cur_sq = conn_sq.cursor()
            cur_sq.execute("SELECT COUNT(*) FROM usuarios")
            total_usuarios = cur_sq.fetchone()[0]
            conn_sq.close()
        except Exception as e_sq:
            sqlite_status = f"Error: {str(e_sq)}"

        host_ip = request.host.split(':')[0] if request.host else "127.0.0.1"
        puerto_activo = int(os.environ.get("PORT", os.environ.get("ERP_PORT", 5000)))

        return jsonify({
            "success": True,
            "sistema": {
                "nombre": "ERP BC Refaccionarias",
                "version": "v2.5 Enterprise Modular",
                "os": f"{platform.system()} {platform.release()} ({platform.machine()})",
                "python": sys.version.split()[0],
                "servidor_ip": host_ip,
                "puerto": puerto_activo,
                "dsn_activo": get_current_dsn(),
                "empresas_configuradas": len(EMPRESAS_DISPONIBLES)
            },
            "estado_servicios": {
                "base_datos_microsip": {
                    "estado": fb_status,
                    "latencia_ms": fb_latencia_ms,
                    "driver": "ODBC Firebird Driver"
                },
                "base_datos_local": {
                    "estado": sqlite_status,
                    "usuarios_registrados": total_usuarios
                }
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@administracion_bp.route('/api/admin/reiniciar-servicio', methods=['POST'])
def reiniciar_servicio():
    from flask import session
    rol = str(session.get('rol') or '').upper()
    permisos = session.get('permisos') or []
    if rol != 'ADMIN' and '*' not in permisos:
        return jsonify({"success": False, "error": "Acceso denegado. Se requiere rol de Administrador para reiniciar el servicio."}), 403

    import subprocess
    import threading
    import time
    
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    server_script = os.path.join(base_dir, "server.py")
    port = int(os.environ.get("PORT", os.environ.get("ERP_PORT", 5000)))
    
    def do_restart():
        time.sleep(1)
        restart_cmd = f'ping 127.0.0.1 -n 3 >nul && "{sys.executable}" "{server_script}" {port}'
        subprocess.Popen(restart_cmd, shell=True, cwd=base_dir)
        os._exit(0)

    threading.Thread(target=do_restart, daemon=True).start()
    return jsonify({
        "success": True,
        "mensaje": "Servidor reiniciándose. Estará disponible en 3-5 segundos."
    })

