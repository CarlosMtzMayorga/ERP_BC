import datetime
from flask import Blueprint, request, jsonify, session
from app.db import conectar_sqlite

nominas_bp = Blueprint('nominas_bp', __name__)

@nominas_bp.route('/api/nominas/reloj/checar', methods=['POST'])
def registrar_checada():
    data = request.get_json() or {}
    colaborador = (data.get('colaborador_nombre') or data.get('colaborador') or '').strip()
    tipo = (data.get('tipo') or 'ENTRADA').strip().upper()
    sucursal_id = data.get('sucursal_id')
    sucursal_nombre = (data.get('sucursal_nombre') or '').strip()
    notas = (data.get('notas') or '').strip()

    if not colaborador:
        return jsonify({"success": False, "error": "El nombre o clave del colaborador es obligatorio."}), 400

    tipos_validos = ['ENTRADA', 'SALIDA', 'SALIDA_COMER', 'REGRESO_COMER']
    if tipo not in tipos_validos:
        tipo = 'ENTRADA'

    ahora = datetime.datetime.now()
    fecha_str = ahora.strftime('%Y-%m-%d')
    hora_str = ahora.strftime('%H:%M:%S')
    creado_en = ahora.strftime('%Y-%m-%d %H:%M:%S')
    usuario_registro = session.get('usuario', 'SISTEMA')

    try:
        conn = conectar_sqlite()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO reloj_checadas 
            (fecha, hora, tipo, colaborador_nombre, sucursal_id, sucursal_nombre, notas, creado_en, usuario_registro)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (fecha_str, hora_str, tipo, colaborador, sucursal_id, sucursal_nombre, notas, creado_en, usuario_registro))
        conn.commit()
        nuevo_id = cur.lastrowid
        conn.close()

        return jsonify({
            "success": True,
            "mensaje": f"Checada registrada con éxito ({tipo}) a las {hora_str}.",
            "registro": {
                "id": nuevo_id,
                "fecha": fecha_str,
                "hora": hora_str,
                "tipo": tipo,
                "colaborador": colaborador,
                "sucursal": sucursal_nombre,
                "notas": notas
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": f"Error al guardar checada: {str(e)}"}), 500


@nominas_bp.route('/api/nominas/reloj/hoy', methods=['GET'])
def obtener_checadas_hoy():
    fecha_hoy = datetime.date.today().strftime('%Y-%m-%d')
    try:
        conn = conectar_sqlite()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, fecha, hora, tipo, colaborador_nombre, sucursal_id, sucursal_nombre, notas, creado_en
            FROM reloj_checadas
            WHERE fecha = ?
            ORDER BY id DESC
        """, (fecha_hoy,))
        rows = cur.fetchall()
        conn.close()

        registros = []
        entradas = 0
        salidas = 0
        for r in rows:
            tipo = r[3]
            if tipo == 'ENTRADA':
                entradas += 1
            elif tipo == 'SALIDA':
                salidas += 1
            registros.append({
                "id": r[0],
                "fecha": r[1],
                "hora": r[2],
                "tipo": tipo,
                "colaborador": r[4],
                "sucursal_id": r[5],
                "sucursal_nombre": r[6],
                "notas": r[7],
                "creado_en": r[8]
            })

        return jsonify({
            "success": True,
            "fecha": fecha_hoy,
            "total": len(registros),
            "entradas": entradas,
            "salidas": salidas,
            "registros": registros
        })
    except Exception as e:
        return jsonify({"success": False, "error": f"Error al consultar checadas: {str(e)}"}), 500

