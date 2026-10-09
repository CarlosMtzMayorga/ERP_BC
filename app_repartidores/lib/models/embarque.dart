import 'caja.dart';

class Embarque {
  final int id;
  final String folio;
  final String empresa;
  final String tipoOrigen;
  final String documentoReferencia;
  final String almacenOrigenNombre;
  final String almacenDestinoNombre;
  final String clienteNombre;
  final String estatus;
  final int totalCajas;
  final double totalPiezas;
  final String choferNombre;
  final String creadoEn;
  final List<Caja> cajas;

  Embarque({
    required this.id,
    required this.folio,
    required this.empresa,
    required this.tipoOrigen,
    required this.documentoReferencia,
    required this.almacenOrigenNombre,
    required this.almacenDestinoNombre,
    required this.clienteNombre,
    required this.estatus,
    required this.totalCajas,
    required this.totalPiezas,
    required this.choferNombre,
    required this.creadoEn,
    this.cajas = const [],
  });

  String get destinoPrincipal {
    if (almacenDestinoNombre.isNotEmpty) return almacenDestinoNombre;
    if (clienteNombre.isNotEmpty) return clienteNombre;
    return 'Destino General';
  }

  bool get esParaSucursal => almacenDestinoNombre.isNotEmpty;

  int get cajasCargadas => cajas.where((c) => c.estaEnTransito || c.estaRecibida).length;
  int get cajasRecibidas => cajas.where((c) => c.estaRecibida).length;

  factory Embarque.fromJson(Map<String, dynamic> json) {
    var rawCajas = json['cajas'] as List? ?? [];
    return Embarque(
      id: json['id'] is int ? json['id'] : int.tryParse(json['id'].toString()) ?? 0,
      folio: json['folio']?.toString() ?? '',
      empresa: json['empresa']?.toString() ?? 'BC',
      tipoOrigen: json['tipo_origen']?.toString() ?? 'TRASPASO',
      documentoReferencia: json['documento_referencia']?.toString() ?? '',
      almacenOrigenNombre: json['almacen_origen_nombre']?.toString() ?? 'CEDIS',
      almacenDestinoNombre: json['almacen_destino_nombre']?.toString() ?? '',
      clienteNombre: json['cliente_nombre']?.toString() ?? '',
      estatus: json['estatus']?.toString() ?? 'PREPARANDO',
      totalCajas: json['total_cajas'] is int ? json['total_cajas'] : int.tryParse(json['total_cajas']?.toString() ?? '') ?? 0,
      totalPiezas: (json['total_piezas'] as num?)?.toDouble() ?? 0.0,
      choferNombre: json['chofer_nombre']?.toString() ?? '',
      creadoEn: json['creado_en']?.toString() ?? '',
      cajas: rawCajas.map((c) => Caja.fromJson(c)).toList(),
    );
  }
}

