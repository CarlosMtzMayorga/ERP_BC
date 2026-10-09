import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';

class EntregaConfirmacionScreen extends StatefulWidget {
  final String? initialCodigoCaja;

  const EntregaConfirmacionScreen({Key? key, this.initialCodigoCaja}) : super(key: key);

  @override
  State<EntregaConfirmacionScreen> createState() => _EntregaConfirmacionScreenState();
}

class _EntregaConfirmacionScreenState extends State<EntregaConfirmacionScreen> {
  final MobileScannerController _scannerController = MobileScannerController(
    detectionSpeed: DetectionSpeed.normal,
    facing: CameraFacing.back,
    torchEnabled: false,
  );

  final TextEditingController _codigoController = TextEditingController();
  final TextEditingController _receptorController = TextEditingController();
  final TextEditingController _notasController = TextEditingController();

  bool _procesando = false;
  bool _scannerActivo = true;
  bool _torchOn = false;
  final List<Map<String, dynamic>> _entregasRealizadas = [];

  @override
  void initState() {
    super.initState();
    if (widget.initialCodigoCaja != null) {
      _codigoController.text = widget.initialCodigoCaja!;
      _scannerActivo = false;
    }
  }

  @override
  void dispose() {
    _scannerController.dispose();
    _codigoController.dispose();
    _receptorController.dispose();
    _notasController.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_procesando || !_scannerActivo) return;
    final List<Barcode> barcodes = capture.barcodes;
    if (barcodes.isEmpty) return;

    final String? code = barcodes.first.rawValue;
    if (code != null && code.trim().isNotEmpty) {
      final clean = code.trim().toUpperCase();
      setState(() {
        _codigoController.text = clean;
      });
      _confirmarEntrega();
    }
  }

  Future<void> _confirmarEntrega() async {
    final codigo = _codigoController.text.trim().toUpperCase();
    final receptor = _receptorController.text.trim();
    final notas = _notasController.text.trim();

    if (codigo.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Por favor ingresa o escanea el folio de la caja'), backgroundColor: AppColors.warning),
      );
      return;
    }

    setState(() => _procesando = true);

    final res = await ApiService.entregarCajaDestino(
      codigoCaja: codigo,
      receptorNombre: receptor.isNotEmpty ? receptor : 'Personal de Sucursal',
      notas: notas,
    );

    if (!mounted) return;

    if (res.success) {
      final data = res.data ?? {};
      final isOffline = data['offline'] == true;

      setState(() {
        _entregasRealizadas.insert(0, {
          'codigo': codigo,
          'receptor': receptor.isNotEmpty ? receptor : 'Personal de Sucursal',
          'offline': isOffline,
          'hora': TimeOfDay.now().format(context),
        });
        _codigoController.clear();
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('✓ Caja $codigo entregada exitosamente ${isOffline ? "(Guardado Offline)" : ""}'),
          backgroundColor: isOffline ? AppColors.warning : AppColors.success,
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('✕ Error: ${res.error ?? "No se pudo registrar la entrega"}'),
          backgroundColor: AppColors.danger,
        ),
      );
    }

    setState(() => _procesando = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('ENTREGAR EN DESTINO'),
        actions: [
          IconButton(
            icon: Icon(_scannerActivo ? Icons.videocam_rounded : Icons.videocam_off_rounded),
            tooltip: _scannerActivo ? 'Ocultar cámara' : 'Mostrar cámara',
            onPressed: () => setState(() => _scannerActivo = !_scannerActivo),
          ),
          if (_scannerActivo)
            IconButton(
              icon: Icon(_torchOn ? Icons.flash_on_rounded : Icons.flash_off_rounded),
              tooltip: 'Linterna',
              onPressed: () {
                setState(() => _torchOn = !_torchOn);
                _scannerController.toggleTorch();
              },
            ),
        ],
      ),
      body: SingleChildScrollView(
        child: Column(
          children: [
            // Cámara para escanear caja a entregar
            if (_scannerActivo)
              SizedBox(
                height: 200,
                child: Stack(
                  children: [
                    MobileScanner(
                      controller: _scannerController,
                      onDetect: _onDetect,
                    ),
                    Center(
                      child: Container(
                        width: 240,
                        height: 120,
                        decoration: BoxDecoration(
                          border: Border.all(color: AppColors.success, width: 2),
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                    ),
                    Positioned(
                      bottom: 8,
                      left: 0,
                      right: 0,
                      child: Center(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.black.withOpacity(0.7),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Text(
                            'Apunta a la etiqueta de la caja para entregar',
                            style: TextStyle(color: Colors.white, fontSize: 11),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),

            // Formulario de Entrega
            Container(
              padding: const EdgeInsets.all(16),
              margin: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.card,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: _codigoController,
                    style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.bold),
                    decoration: const InputDecoration(
                      labelText: 'Folio de Caja (ej: 10003-1)',
                      prefixIcon: Icon(Icons.qr_code_rounded, color: AppColors.success),
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _receptorController,
                    style: const TextStyle(color: AppColors.textPrimary),
                    decoration: const InputDecoration(
                      labelText: 'Nombre de quien recibe (Receptor)',
                      hintText: 'Ej: Juan Gómez / Encargado',
                      prefixIcon: Icon(Icons.badge_outlined, color: AppColors.textSecondary),
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _notasController,
                    style: const TextStyle(color: AppColors.textPrimary),
                    decoration: const InputDecoration(
                      labelText: 'Notas u Observaciones (Opcional)',
                      hintText: 'Ej: Entregado completo en mostrador',
                      prefixIcon: Icon(Icons.notes_rounded, color: AppColors.textSecondary),
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 18),
                  ElevatedButton(
                    onPressed: _procesando ? null : _confirmarEntrega,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.success,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: _procesando
                        ? const SpinKitThreeBounce(color: Colors.white, size: 22)
                        : const Text(
                            'CONFIRMAR ENTREGA DE CAJA',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, letterSpacing: 0.8),
                          ),
                  ),
                ],
              ),
            ),

            // Entregas registradas en esta pantalla
            if (_entregasRealizadas.isNotEmpty) ...[
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    const Text(
                      'Entregas realizadas en este destino:',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppColors.textSecondary),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: _entregasRealizadas.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (ctx, idx) {
                  final e = _entregasRealizadas[idx];
                  return Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.card,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.check_circle_rounded, color: AppColors.success, size: 24),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(e['codigo'], style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.textPrimary)),
                              Text('Recibió: ${e['receptor']}', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                            ],
                          ),
                        ),
                        Text(e['hora'], style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                      ],
                    ),
                  );
                },
              ),
              const SizedBox(height: 24),
            ],
          ],
        ),
      ),
    );
  }
}

