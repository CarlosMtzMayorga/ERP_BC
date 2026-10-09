import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class StorageService {
  static const String keyServerUrl = 'server_url';
  static const String keyUsuario = 'usuario_actual';
  static const String keyNombre = 'nombre_chofer';
  static const String keyEmpresa = 'empresa_activa';
  static const String keySessionCookie = 'session_cookie';
  static const String keyColaOffline = 'cola_offline_escaneos';

  // Servidor ERP por defecto (IP local común de la red de refaccionarias)
  static const String defaultServerUrl = 'http://192.168.1.12:5000';

  static Future<String> getServerUrl() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(keyServerUrl) ?? defaultServerUrl;
  }

  static Future<void> setServerUrl(String url) async {
    final prefs = await SharedPreferences.getInstance();
    String cleanUrl = url.trim();
    if (cleanUrl.endsWith('/')) {
      cleanUrl = cleanUrl.substring(0, cleanUrl.length - 1);
    }
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'http://$cleanUrl';
    }
    await prefs.setString(keyServerUrl, cleanUrl);
  }

  static Future<String?> getNombreChofer() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(keyNombre);
  }

  static Future<String?> getUsuario() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(keyUsuario);
  }

  static Future<void> guardarSesion({
    required String usuario,
    required String nombre,
    String? sessionCookie,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(keyUsuario, usuario);
    await prefs.setString(keyNombre, nombre);
    if (sessionCookie != null) {
      await prefs.setString(keySessionCookie, sessionCookie);
    }
  }

  static Future<String?> getSessionCookie() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(keySessionCookie);
  }

  static Future<void> cerrarSesion() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(keyUsuario);
    await prefs.remove(keyNombre);
    await prefs.remove(keySessionCookie);
  }

  // Soporte de cola offline para cuando el repartidor no tiene señal celular en ruta
  static Future<void> agregarAColaOffline(Map<String, dynamic> item) async {
    final prefs = await SharedPreferences.getInstance();
    List<String> cola = prefs.getStringList(keyColaOffline) ?? [];
    cola.add(jsonEncode(item));
    await prefs.setStringList(keyColaOffline, cola);
  }

  static Future<List<Map<String, dynamic>>> obtenerColaOffline() async {
    final prefs = await SharedPreferences.getInstance();
    List<String> cola = prefs.getStringList(keyColaOffline) ?? [];
    return cola.map((s) => jsonDecode(s) as Map<String, dynamic>).toList();
  }

  static Future<void> limpiarColaOffline() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(keyColaOffline);
  }
}

