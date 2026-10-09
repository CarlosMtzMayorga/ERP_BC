import 'package:flutter/material.dart';
import '../services/storage_service.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';

class ConfigServidorScreen extends StatefulWidget {
  const ConfigServidorScreen({super.key});

  @override
  State<ConfigServidorScreen> createState() => _ConfigServidorScreenState();
}

class _ConfigServidorScreenState extends State<ConfigServidorScreen> {
  final _urlCtrl = TextEditingController();
  bool _probando = false;
  String? _mensajeResultado;
  bool _exitoso = false;

  @override
  void initState() {
    super.initState();
    _cargarUrl();
  }

  Future<void> _cargarUrl() async {
    final url = await StorageService.getServerUrl();
    _urlCtrl.text = url;
  }

  Future<void> _probarYGuardar() async {
    final url = _urlCtrl.text.trim();
    if (url.isEmpty) return;

    setState(() {
      _probando = true;
      _mensajeResultado = null;
    });

    final res = await ApiService.probarConexion(url);

    setState(() {
      _probando = false;
      _exitoso = res.success;
      _mensajeResultado = res.success
          ? '¡Conexión Exitosa con el Servidor ERP!'
          : 'Error: ${res.error}';
    });

    if (res.success) {
      await StorageService.setServerUrl(url);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Configurar Conexión ERP'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(Icons.wifi_tethering, size: 64, color: AppTheme.accentAmber),
            const SizedBox(height: 16),
            const Text(
              'Dirección del Servidor Central',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text(
              'Ingresa la IP local o dominio donde corre el servidor Flask (puerto 5000).',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white60, fontSize: 13),
            ),
            const SizedBox(height: 24),
            TextField(
              controller: _urlCtrl,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                labelText: 'URL del Servidor',
                hintText: 'http://192.168.1.12:5000',
                prefixIcon: Icon(Icons.dns, color: AppTheme.accentAmber),
              ),
            ),
            const SizedBox(height: 16),
            if (_mensajeResultado != null) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _exitoso ? AppTheme.successGreen.withOpacity(0.15) : AppTheme.errorRed.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: _exitoso ? AppTheme.successGreen : AppTheme.errorRed,
                  ),
                ),
                child: Text(
                  _mensajeResultado!,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: _exitoso ? AppTheme.successGreen : AppTheme.errorRed,
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],
            ElevatedButton.icon(
              onPressed: _probando ? null : _probarYGuardar,
              icon: _probando
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.check_circle_outline),
              label: Text(_probando ? 'Probando...' : 'Probar y Guardar'),
            ),
            const Spacer(),
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Volver Atrás'),
            ),
          ],
        ),
      ),
    );
  }
}

