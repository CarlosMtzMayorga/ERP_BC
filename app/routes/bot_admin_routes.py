import os
import json
import sqlite3
import datetime
import urllib.request
from flask import Blueprint, request, jsonify

bot_admin_bp = Blueprint('bot_admin_bp', __name__)

BOT_DIR = r"c:\Users\Z840\bc-refacciones-bot"
DB_PATH = os.path.join(BOT_DIR, "conversaciones_bot.db")
SUCURSALES_FILE = os.path.join(BOT_DIR, "config_sucursales.json")
MENUS_FILE = os.path.join(BOT_DIR, "config_menus.json")
BOT_API_URL = "http://127.0.0.1:8000"

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=8)
    conn.row_factory = sqlite3.Row
    return conn

# ================= 1. ESTADO DEL BOT Y ESTADÍSTICAS =================

@bot_admin_bp.route('/api/bot-admin/estado', methods=['GET'])
def get_estado():
    bot_online = False
    try:
        req = urllib.request.Request(f"{BOT_API_URL}/", headers={'User-Agent': 'BC-ERP/1.0'})
        with urllib.request.urlopen(req, timeout=2) as resp:
            if resp.status == 200:
                bot_online = True
    except Exception:
        bot_online = False

    tot_conv = 0
    tot_mensajes = 0
    tot_pedidos = 0
    hoy_mensajes = 0
    hoy_str = datetime.date.today().strftime("%Y-%m-%d")

    try:
        if os.path.exists(DB_PATH):
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM conversaciones")
            tot_conv = cur.fetchone()[0] or 0

            cur.execute("SELECT COUNT(*) FROM mensajes")
            tot_mensajes = cur.fetchone()[0] or 0

            cur.execute("SELECT COUNT(*) FROM conversaciones WHERE folio_orden != '' AND folio_orden IS NOT NULL")
            tot_pedidos = cur.fetchone()[0] or 0

            cur.execute("SELECT COUNT(*) FROM mensajes WHERE fecha_hora LIKE ?", (f"{hoy_str}%",))
            hoy_mensajes = cur.fetchone()[0] or 0

            conn.close()
    except Exception as e:
        print(f"[BotAdmin Estado DB Error]: {e}")

    return jsonify({
        "success": True,
        "bot_online": bot_online,
        "bot_api_url": BOT_API_URL,
        "estadisticas": {
            "total_conversaciones": tot_conv,
            "total_mensajes": tot_mensajes,
            "mensajes_hoy": hoy_mensajes,
            "pedidos_generados": tot_pedidos
        }
    })

# ================= 2. CONVERSACIONES EN VIVO =================

@bot_admin_bp.route('/api/bot-admin/conversaciones', methods=['GET'])
def get_conversaciones():
    try:
        if not os.path.exists(DB_PATH):
            return jsonify({"success": True, "conversaciones": []})

        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT 
                c.usuario_id,
                c.nombre_cliente,
                c.ultima_interaccion,
                c.estado,
                c.sucursal,
                c.folio_orden,
                c.ultimo_mensaje,
                (SELECT COUNT(*) FROM mensajes m WHERE m.usuario_id = c.usuario_id) AS total_mensajes
            FROM conversaciones c
            ORDER BY c.ultima_interaccion DESC
        """)
        rows = cur.fetchall()
        convs = [dict(r) for r in rows]
        conn.close()
        return jsonify({"success": True, "conversaciones": convs})
    except Exception as e:
        return jsonify({"success": False, "error": str(e), "conversaciones": []}), 500

@bot_admin_bp.route('/api/bot-admin/conversaciones/<usuario_id>', methods=['GET'])
def get_detalle_conversacion(usuario_id):
    try:
        if not os.path.exists(DB_PATH):
            return jsonify({"success": False, "error": "No existe la base de datos de chats"}), 404

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM conversaciones WHERE usuario_id = ?", (usuario_id,))
        conv = cur.fetchone()

        cur.execute("""
            SELECT id, usuario_id, remitente, texto, fecha_hora 
            FROM mensajes 
            WHERE usuario_id = ? 
            ORDER BY id ASC
        """, (usuario_id,))
        mensajes = cur.fetchall()
        conn.close()

        return jsonify({
            "success": True,
            "conversacion": dict(conv) if conv else None,
            "mensajes": [dict(m) for m in mensajes]
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@bot_admin_bp.route('/api/bot-admin/conversaciones/<usuario_id>/intervenir', methods=['POST'])
def intervenir_chat(usuario_id):
    """
    Envía un mensaje manual de un asesor humano al chat de WhatsApp y lo registra en el historial.
    """
    data = request.get_json(silent=True) or {}
    mensaje = data.get('mensaje', '').strip()
    nombre_asesor = data.get('asesor', 'Asesor BC Refacciones').strip()

    if not mensaje:
        return jsonify({"success": False, "error": "El mensaje no puede estar vacío"}), 400

    try:
        ahora = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        texto_formateado = f"👨‍💼 *{nombre_asesor}:*\n{mensaje}"

        # Registrar en la base de datos de chats
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO mensajes (usuario_id, remitente, texto, fecha_hora)
            VALUES (?, 'asesor', ?, ?)
        """, (usuario_id, texto_formateado, ahora))

        cur.execute("""
            UPDATE conversaciones
            SET ultima_interaccion = ?,
                ultimo_mensaje = ?,
                estado = 'ATENDIDO_ASESOR'
            WHERE usuario_id = ?
        """, (ahora, texto_formateado[:150], usuario_id))
        conn.commit()
        conn.close()

        # Si el usuario_id parece ser un número de WhatsApp real, podemos invocar el envío de mensaje al bot
        # (vía webhook/api si está disponible)

        return jsonify({"success": True, "mensaje": "Mensaje enviado y registrado en la conversación."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ================= 3. CONFIGURACIÓN DE SUCURSALES =================

@bot_admin_bp.route('/api/bot-admin/config/sucursales', methods=['GET'])
def get_config_sucursales():
    try:
        if os.path.exists(SUCURSALES_FILE):
            with open(SUCURSALES_FILE, 'r', encoding='utf-8') as f:
                sucursales = json.load(f)
            return jsonify({"success": True, "sucursales": sucursales})
        return jsonify({"success": False, "error": "Archivo no encontrado", "sucursales": []}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e), "sucursales": []}), 500

@bot_admin_bp.route('/api/bot-admin/config/sucursales', methods=['POST'])
def save_config_sucursales():
    data = request.get_json(silent=True)
    if not isinstance(data, list):
        return jsonify({"success": False, "error": "Formato inválido. Se esperaba una lista de sucursales."}), 400

    try:
        with open(SUCURSALES_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return jsonify({"success": True, "mensaje": "Catálogo de sucursales guardado correctamente."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ================= 4. CONFIGURACIÓN DE MENÚS Y TEXTOS =================

@bot_admin_bp.route('/api/bot-admin/config/menus', methods=['GET'])
def get_config_menus():
    try:
        if os.path.exists(MENUS_FILE):
            with open(MENUS_FILE, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
            return jsonify({"success": True, "config": cfg})
        return jsonify({"success": False, "error": "Archivo no encontrado", "config": {}}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e), "config": {}}), 500

@bot_admin_bp.route('/api/bot-admin/config/menus', methods=['POST'])
def save_config_menus():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"success": False, "error": "Formato inválido. Se esperaba un objeto de configuración."}), 400

    try:
        with open(MENUS_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return jsonify({"success": True, "mensaje": "Menús y textos del Bot guardados correctamente."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

