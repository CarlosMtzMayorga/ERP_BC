import io
from flask import Blueprint, request, jsonify, send_file, session
from app.services.resurtidos_service import (
    obtener_catalogos_resurtidos,
    calcular_planeacion_resurtidos,
    guardar_multiplo_articulo,
    generar_excel_resurtidos,
    obtener_catalogo_grupos_lineas,
    guardar_grupos_config_sqlite
)

resurtidos_bp = Blueprint('resurtidos_bp', __name__)

@resurtidos_bp.route('/api/resurtidos/grupos-config', methods=['GET'])
def get_grupos_config():
    try:
        data = obtener_catalogo_grupos_lineas()
        return jsonify({"success": True, **data})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@resurtidos_bp.route('/api/resurtidos/grupos-config', methods=['POST'])
def post_grupos_config():
    try:
        data = request.get_json() or {}
        excluidos = data.get('grupos_excluidos', [])
        sin_filtrar = data.get('grupos_sin_filtrar', [])
        guardar_grupos_config_sqlite(excluidos, sin_filtrar)
        return jsonify({"success": True, "mensaje": "Configuración de grupos actualizada correctamente"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@resurtidos_bp.route('/api/resurtidos/catalogos', methods=['GET'])
def get_catalogos():
    try:
        data = obtener_catalogos_resurtidos()
        return jsonify({"success": True, **data})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@resurtidos_bp.route('/api/resurtidos/calcular', methods=['POST'])
def post_calcular():
    try:
        params = request.get_json() or {}
        resultado = calcular_planeacion_resurtidos(params)
        return jsonify({"success": True, **resultado})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

@resurtidos_bp.route('/api/resurtidos/guardar-multiplo', methods=['POST'])
def post_guardar_multiplo():
    try:
        data = request.get_json() or {}
        aid = data.get('articulo_id')
        clave = data.get('clave', '')
        mult = data.get('multiplo', 1)
        if not aid:
            return jsonify({"success": False, "error": "articulo_id requerido"}), 400
        guardar_multiplo_articulo(aid, clave, mult)
        return jsonify({"success": True, "articulo_id": aid, "multiplo": mult})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@resurtidos_bp.route('/api/resurtidos/exportar-excel', methods=['POST'])
def post_exportar_excel():
    try:
        data = request.get_json() or {}
        items = data.get('articulos', [])
        solo_surtir = bool(data.get('solo_surtir', False))
        nombre_almacen = str(data.get('nombre_almacen', 'ALMACEN')).strip()

        excel_bytes = generar_excel_resurtidos(items, solo_surtir, nombre_almacen)
        sufijo = "solo_surtir" if solo_surtir else "completo"
        nombre_archivo = f"Planeacion_Resurtidos_{nombre_almacen}_{sufijo}.xlsx"

        return send_file(
            io.BytesIO(excel_bytes),
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name=nombre_archivo
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
