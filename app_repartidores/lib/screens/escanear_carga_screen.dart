import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';

class EscanearCargaScreen extends StatefulWidget {
  const EscanearCargaScreen({Key? key}) : super(key: key);

  @override
  State<EscanearCargaScreen> createState() => _EscanearCargaScreenState();
}

class _EscanearCargaScreenState extends State<EscanearCargaScreen> {
  final MobileScannerController _scannerController = MobileScannerController(
    detectionSpeed: DetectionSpeed.normal,
    facing: CameraFacing.back,
    torchEnabled: false,
  );

  final TextEditingController _manualController = TextEditingController();
  final FocusNode _manualFocusNode = FocusNode();

  bool _procesando = false;
  bool _torchOn = false;
  String? _ultimoCodigoEscaneado;
  DateTime? _ultimoTiempoEscaneo;

  final List<Map<String, dynamic>> _cajasCargadasSesion = [];

  @override
  void dispose() {
    _scannerController.dispose();
    _manualController.dispose();
    _manualFocusNode.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_procesando) return;
    final List<Barcode> barcodes = capture.barcodes;
    if (barcodes.isEmpty) return;

    final String? code = barcodes.first.rawValue;
    if (code == null || code.trim().isEmpty) return;

    final String cleanCode = code.trim().toUpperCase();

    // Debounce: Evitar re-escanear el mismo código en menos de 2.5 segundos
    final now = DateTime.now();
    if (_ultimoCodigoEscaneado == cleanCode &&
        _ultimoTiempoEscaneo != null &&
        now.difference(_ultimoTiempoEscaneo!).inMilliseconds < 2500) {
      return;
    }

    _procesarCodigo(cleanCode);
  }

  Future<void> _procesarCodigo(String codigo) async {
    if (_procesando) return;
    setState(() {
      _procesando = true;
      _ultimoCodigoEscaneado = codigo;
      _ultimoTiempoEscaneo = DateTime.now();
    });

    final res = await ApiService.escanearCajaCarga(codigoCaja: codigo);

    if (!mounted) return;

    if (res.success) {
      final data = res.data ?? {};
      final folio = data['folio_caja'] ?? codigo;
      final destino = data['destino'] ?? 'Destino registrado';
      final isOffline = data['offline'] == true;

      setState(() {
        _cajasCargadasSesion.insert(0, {
          'folio': folio,
          'destino': destino,
          'offline': isOffline,
          'hora': TimeOfDay.now().format(context),
        });
      });

      _mostrarSnackBar(
        '✓ Caja $folio cargada al camión ${isOffline ? "(Modo Offline)" : ""}',
        isOffline ? AppColors.warning : AppColors.success,
      );
    } else {
      _mostrarSnackBar(
        '✕ Error: ${res.error ?? "Código no válido"}',
        AppColors.danger,
      );
    }

    setState(() => _procesando = false);
    _manualController.clear();
  }

  void _mostrarSnackBar(String texto, Color color) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(texto, style: const TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: color,
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('SUBIR AL CAMIÓN'),
        actions: [
          IconButton(
            icon: Icon(_torchOn ? Icons.flash_on_rounded : Icons.flash_off_rounded),
            tooltip: 'Linterna',
            onPressed: () {
              setState(() => _torchOn = !_torchOn);
              _scannerController.toggleTorch();
            },
          ),
          IconButton(
            icon: const Icon(Icons.flip_camera_android_rounded),
            tooltip: 'Cambiar cámara',
            onPressed: () => _scannerController.switchCamera(),
          ),
        ],
      ),
      body: Column(
        children: [
          // Visor de Cámara para Escaneo
          SizedBox(
            height: 240,
            child: Stack(
              children: [
                MobileScanner(
                  controller: _scannerController,
                  onDetect: _onDetect,
                ),
                // Guía / Marco de escaneo
                Center(
                  child: Container(
                    width: 260,
                    height: 140,
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: _procesando ? AppColors.warning : AppColors.primary,
                        width: 2.5,
                      ),
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
                if (_procesando)
                  Container(
                    color: Colors.black.withOpacity(0.5),
                    child: const Center(
                      child: SpinKitRing(color: AppColors.primary, size: 50, lineWidth: 3),
                    ),
                  ),
                Positioned(
                  bottom: 8,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.7),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: const Text(
                        'Apunta al código de barras de la caja (ej: 10003-1)',
                        style: TextStyle(color: Colors.white, fontSize: 11),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Campo Manual / Soporte para Pistola Escáner Bluetooth
          Container(
            padding: const EdgeInsets.all(12),
            color: AppColors.card,
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _manualController,
                    focusNode: _manualFocusNode,
                    style: const TextStyle(color: AppColors.textPrimary, fontSize: 14),
                    textInputAction: TextInputAction.send,
                    onSubmitted: (val) {
                      if (val.trim().isNotEmpty) {
                        _procesarCodigo(val.trim());
                      }
                    },
                    decoration: const InputDecoration(
                      hintText: 'Ingresar código manual o pistola...',
                      isDense: true,
                      prefixIcon: Icon(Icons.keyboard_alt_outlined, color: AppColors.primary),
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: _procesando
                      ? null
                      : () {
                          if (_manualController.text.trim().isNotEmpty) {
                            _procesarCodigo(_manualController.text.trim());
                          }
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  ),
                  child: const Text('CARGAR'),
                ),
              ],
            ),
          ),

          // Contador de Cajas Cargadas en la Sesión
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            color: AppColors.background,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Cajas cargadas en sesión: ${_cajasCargadasSesion.length}',
                  style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                ),
                if (_cajasCargadasSesion.isNotEmpty)
                  TextButton(
                    onPressed: () => setState(() => _cajasCargadasSesion.clear()),
                    child: const Text('Limpiar lista', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                  ),
              ],
            ),
          ),

          // Lista de Cajas Escaneadas
          Expanded(
            child: _cajasCargadasSesion.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: const [
                        Icon(Icons.inventory_2_outlined, size: 48, color: AppColors.textSecondary),
                        SizedBox(height: 10),
                        Text(
                          'Aún no has escaneado cajas en esta sesión',
                          style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
                        ),
                      ],
                    ),
                  )
                : ListView.separated(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    itemCount: _cajasCargadasSesion.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 6),
                    itemBuilder: (ctx, idx) {
                      final item = _cajasCargadasSesion[idx];
                      return Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.card,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: (item['offline'] == true ? AppColors.warning : AppColors.success).withOpacity(0.15),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Icon(
                                Icons.check_circle_rounded,
                                color: item['offline'] == true ? AppColors.warning : AppColors.success,
                                size: 20,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    item['folio'] ?? '',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: AppColors.textPrimary,
                                      fontSize: 15,
                                    ),
                                  ),
                                  Text(
                                    item['destino'] ?? '',
                                    style: const TextStyle(
                                      color: AppColors.textSecondary,
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  item['hora'] ?? '',
                                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
                                ),
                                const SizedBox(height: 4),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: AppColors.primary.withOpacity(0.2),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: const Text(
                                    'EN CAMIÓN',
                                    style: TextStyle(color: AppColors.primary, fontSize: 9, fontWeight: FontWeight.bold),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

