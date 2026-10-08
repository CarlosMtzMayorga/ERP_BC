import datetime
from flask import Blueprint, jsonify, request, session
from app.services.cascos_service import (
    obtener_config_cascos,
    guardar_config_cascos,
    obtener_inventario_cascos,
    consultar_ventas_cascos_periodo,
    obtener_recepciones_cascos,
    preparar_recepcion_cascos,
    obtener_detalle_recepcion,
    confirmar_recepcion_cascos,
    cancelar_recepcion_cascos,
    consultar_facturas_sin_usados,
    obtener_detalle_factura_sin_usados,
    recibir_casco_factura_pendiente,
    cerrar_pago_factura_sin_usados
)
from app.db import conectar_db

cascos_bp = Blueprint('cascos', __name__)


def _obtener_usuario_actual():
    return str(session.get('usuario') or request.args.get('username') or 'ADMIN').strip()


# =========================================================================
# 1. CONFIGURACIÓN DEL ALMACÉN DE CASCOS / USADOS
# =========================================================================

@cascos_bp.route('/api/almacen/cascos/config', methods=['GET', 'POST', 'PUT'])
@cascos_bp.route('/api/utilerias/almacen-usados', methods=['GET', 'PUT'])
def api_cascos_config():
    usuario = _obtener_usuario_actual()
    empresa_id = str(session.get('empresa_actual') or request.args.get('company_id') or 'DEFAULT').strip()

    if request.method in ('POST', 'PUT'):
        data = request.get_json(silent=True) or {}
        almacen_id = data.get('almacen_id')
        almacen_nombre = data.get('almacen_nombre')
        autorizados = data.get('autorizados') or data.get('almacenes') or []

        if not almacen_id:
            return jsonify({"error": "Debes especificar el almacén de cascos."}), 400

        # Si no viene el nombre, resolverlo en Microsip
        if not almacen_nombre:
            conn = None
            try:
                conn = conectar_db()
                cur = conn.cursor()
                cur.execute("SELECT FIRST 1 NOMBRE FROM ALMACENES WHERE ALMACEN_ID = ?", (int(almacen_id),))
                r = cur.fetchone()
                almacen_nombre = str(r[0]).strip() if r and r[0] else f"Almacén {almacen_id}"
            except Exception:
                almacen_nombre = f"Almacén {almacen_id}"
            finally:
                if conn:
                    conn.close()

        guardar_config_cascos(almacen_id, almacen_nombre, autorizados, usuario=usuario, empresa_id=empresa_id)
        return jsonify({"ok": True, "mensaje": "Configuración de cascos actualizada correctamente."})

    # GET
    cfg = obtener_config_cascos(empresa_id)

    # También devolver catálogo completo de almacenes para el selector
    almacenes_disponibles = []
    conn = None
    try:
        conn = conectar_db()
        cur = conn.cursor()
        cur.execute("SELECT ALMACEN_ID, NOMBRE FROM ALMACENES ORDER BY NOMBRE")
        for r in cur.fetchall():
            almacenes_disponibles.append({
                "id": int(r[0]),
                "nombre": str(r[1] or "").strip()
            })
    except Exception as e:
        print("Aviso al consultar almacenes para config cascos:", e)
    finally:
        if conn:
            conn.close()

    return jsonify({
        "config": cfg,
        "almacenes": almacenes_disponibles
    })


# =========================================================================
# 2. INVENTARIO EN VIVO DE CASCOS (B01 A B07)
# =========================================================================

@cascos_bp.route('/api/almacen/cascos/inventario', methods=['GET'])
@cascos_bp.route('/api/almacen/usados/inventario', methods=['GET'])
def api_cascos_inventario():
    empresa_id = str(session.get('empresa_actual') or request.args.get('company_id') or 'DEFAULT').strip()
    try:
        resultado = obtener_inventario_cascos(empresa_id)
        return jsonify(resultado)
    except Exception as e:
        return jsonify({"error": str(e), "cascos": []}), 500


# =========================================================================
# 3. CONSULTA DE VENTAS CON BONIFICACIONES (B01..B07)
# =========================================================================

@cascos_bp.route('/api/almacen/cascos/ventas-periodo', methods=['GET'])
@cascos_bp.route('/api/almacen/usados/ventas', methods=['GET'])
def api_cascos_ventas_periodo():
    empresa_id = str(session.get('empresa_actual') or request.args.get('company_id') or 'DEFAULT').strip()
    fecha_inicio = request.args.get('fecha_inicio', '').strip()
    fecha_final = request.args.get('fecha_final', '').strip()
    almacen_id = request.args.get('almacen_id', '').strip() or None

    if not fecha_inicio or not fecha_final:
        hoy = datetime.date.today().isoformat()
        fecha_inicio = fecha_inicio or hoy
        fecha_final = fecha_final or hoy

    try:
        ventas = consultar_ventas_cascos_periodo(fecha_inicio, fecha_final, almacen_id=almacen_id, empresa_id=empresa_id)
        return jsonify({"ok": True, "ventas": ventas, "data": ventas, "total": len(ventas)})
    except Exception as e:
        return jsonify({"error": str(e), "ventas": []}), 500


# =========================================================================
# 4. HISTORIAL Y PREPARACIÓN DE RECEPCIONES DE CASCOS
# =========================================================================

@cascos_bp.route('/api/almacen/cascos/recepciones', methods=['GET'])
@cascos_bp.route('/api/almacen/usados/recepciones', methods=['GET'])
def api_cascos_recepciones():
    empresa_id = str(session.get('empresa_actual') or request.args.get('company_id') or 'DEFAULT').strip()
    estatus = request.args.get('estatus', '').strip().lower() or None
    try:
        recepciones = obtener_recepciones_cascos(empresa_id, estatus=estatus)
        return jsonify({"ok": True, "recepciones": recepciones, "data": recepciones})
    except Exception as e:
        return jsonify({"error": str(e), "recepciones": []}), 500


@cascos_bp.route('/api/almacen/cascos/recepciones/preparar', methods=['POST'])
@cascos_bp.route('/api/almacen/usados/recepciones/preparar', methods=['POST'])
def api_cascos_recepcion_preparar():
    usuario = _obtener_usuario_actual()
    empresa_id = str(session.get('empresa_actual') or 'DEFAULT').strip()
    data = request.get_json(silent=True) or {}

    almacen_origen_id = data.get('almacen_origen_id')
    fecha_inicio = data.get('fecha_inicio', '').strip()
    fecha_final = data.get('fecha_final', '').strip()

    if not almacen_origen_id or not fecha_inicio or not fecha_final:
        return jsonify({"error": "Almacén origen y rango de fechas son requeridos."}), 400

    try:
        resultado = preparar_recepcion_cascos(almacen_origen_id, fecha_inicio, fecha_final, usuario=usuario, empresa_id=empresa_id)
        return jsonify(resultado), 201
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 409
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@cascos_bp.route('/api/almacen/cascos/recepciones/<int:recepcion_id>', methods=['GET'])
@cascos_bp.route('/api/almacen/usados/recepciones/<int:recepcion_id>', methods=['GET'])
def api_cascos_recepcion_detalle(recepcion_id):
    try:
        detalle = obtener_detalle_recepcion(recepcion_id)
        return jsonify({"ok": True, "recepcion": detalle, "data": detalle})
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@cascos_bp.route('/api/almacen/cascos/recepciones/<int:recepcion_id>/confirmar', methods=['POST'])
@cascos_bp.route('/api/almacen/usados/recepciones/<int:recepcion_id>/confirmar', methods=['POST'])
def api_cascos_recepcion_confirmar(recepcion_id):
    usuario = _obtener_usuario_actual()
    empresa_id = str(session.get('empresa_actual') or 'DEFAULT').strip()
    data = request.get_json(silent=True) or {}

    distribuciones = data.get('detalles') or data.get('distribuciones')
    nota_credito = str(data.get('nota_credito') or '').strip()
    tipo_bonificacion = str(data.get('tipo_bonificacion') or '').strip()

    try:
        resultado = confirmar_recepcion_cascos(
            recepcion_id=recepcion_id,
            distribuciones_payload=distribuciones,
            nota_credito=nota_credito,
            tipo_bonificacion=tipo_bonificacion,
            usuario=usuario,
            empresa_id=empresa_id
        )
        return jsonify(resultado)
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 409
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@cascos_bp.route('/api/almacen/cascos/recepciones/<int:recepcion_id>/cancelar', methods=['POST'])
@cascos_bp.route('/api/almacen/usados/recepciones/<int:recepcion_id>/cancelar', methods=['POST'])
def api_cascos_recepcion_cancelar(recepcion_id):
    usuario = _obtener_usuario_actual()
    empresa_id = str(session.get('empresa_actual') or 'DEFAULT').strip()
    data = request.get_json(silent=True) or {}
    motivo = str(data.get('motivo') or 'Cancelado por usuario').strip()

    try:
        resultado = cancelar_recepcion_cascos(recepcion_id, motivo=motivo, usuario=usuario, empresa_id=empresa_id)
        return jsonify(resultado)
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 409
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =========================================================================
# 5. CASCOS PENDIENTES / FACTURAS SIN USADOS
# =========================================================================

@cascos_bp.route('/api/almacen/cascos/facturas-sin-usados', methods=['GET'])
@cascos_bp.route('/api/ventas/facturas-sin-usados', methods=['GET'])
def api_cascos_facturas_sin_usados():
    empresa_id = str(session.get('empresa_actual') or request.args.get('company_id') or 'DEFAULT').strip()
    fecha_inicio = request.args.get('fecha_inicio', '').strip()
    fecha_final = request.args.get('fecha_final', '').strip()
    folio = request.args.get('folio', '').strip()
    cliente = request.args.get('cliente', '').strip()
    vendedor_id = request.args.get('vendedor_id', '').strip()
    almacen_id = request.args.get('almacen_id', '').strip()

    if not fecha_inicio or not fecha_final:
        # Por defecto los últimos 30 días
        hoy = datetime.date.today()
        hace_mes = hoy - datetime.timedelta(days=30)
        fecha_inicio = fecha_inicio or hace_mes.isoformat()
        fecha_final = fecha_final or hoy.isoformat()

    try:
        facturas = consultar_facturas_sin_usados(
            fecha_inicio=fecha_inicio,
            fecha_final=fecha_final,
            folio=folio,
            cliente=cliente,
            vendedor_id=vendedor_id,
            almacen_id=almacen_id,
            empresa_id=empresa_id
        )
        return jsonify({"ok": True, "facturas": facturas, "data": facturas, "total": len(facturas)})
    except Exception as e:
        return jsonify({"error": str(e), "facturas": []}), 500


@cascos_bp.route('/api/almacen/cascos/facturas-sin-usados/<int:docto_ve_id>', methods=['GET'])
@cascos_bp.route('/api/ventas/facturas-sin-usados/<int:docto_ve_id>', methods=['GET'])
def api_cascos_factura_sin_usados_detalle(docto_ve_id):
    empresa_id = str(session.get('empresa_actual') or request.args.get('company_id') or 'DEFAULT').strip()
    try:
        factura = obtener_detalle_factura_sin_usados(docto_ve_id, empresa_id=empresa_id)
        return jsonify({"ok": True, "factura": factura, "data": factura})
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@cascos_bp.route('/api/almacen/cascos/facturas-sin-usados/<int:docto_ve_id>/recibir', methods=['POST'])
@cascos_bp.route('/api/ventas/facturas-sin-usados/<int:docto_ve_id>/recibir', methods=['POST'])
def api_cascos_factura_sin_usados_recibir(docto_ve_id):
    usuario = _obtener_usuario_actual()
    empresa_id = str(session.get('empresa_actual') or 'DEFAULT').strip()
    data = request.get_json(silent=True) or {}
    lineas = data.get('lineas') or data.get('cascos') or []

    if not lineas:
        return jsonify({"error": "Indica al menos una clave y cantidad de cascos recibidos."}), 400

    try:
        resultado = recibir_casco_factura_pendiente(docto_ve_id, lineas_cascos=lineas, usuario=usuario, empresa_id=empresa_id)
        return jsonify(resultado)
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 409
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@cascos_bp.route('/api/almacen/cascos/facturas-sin-usados/<int:docto_ve_id>/cerrar-pago', methods=['POST'])
@cascos_bp.route('/api/ventas/facturas-sin-usados/<int:docto_ve_id>/cerrar-pago', methods=['POST'])
def api_cascos_factura_sin_usados_cerrar_pago(docto_ve_id):
    usuario = _obtener_usuario_actual()
    empresa_id = str(session.get('empresa_actual') or 'DEFAULT').strip()
    data = request.get_json(silent=True) or {}
    motivo = str(data.get('motivo') or 'LIQUIDADO EN CAJA').strip()

    try:
        resultado = cerrar_pago_factura_sin_usados(docto_ve_id, motivo=motivo, usuario=usuario, empresa_id=empresa_id)
        return jsonify(resultado)
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 409
    except Exception as e:
        return jsonify({"error": str(e)}), 500

